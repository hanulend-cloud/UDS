// 기구 최적화 Worker io — spec P4 §2. 기존 scene/chunk 프로토콜(chunk-host.js)을 그대로 쓰고 rw·emitters 만 덧붙인다.
// trace(job, {N, maxMs, minN, chunkN, batches, rw}) → 배치별 합 + 격자 지도 + ESS + 실제 광자 수. traceEach(job, emitterSets, {N, maxMs, minN}) → 후보마다 방출 1 기준 지도(②, 시간 예산).
// 시간 제한(maxMs): N 에 닿거나 (경과 ≥ maxMs 이고 ≥ minN 광자·배치마다 청크 1개) 이면 새 청크를 멈추고 진행 중 청크만 마저 받음.
//   이때 청크 크기는 Worker 마다 잰 속도로 ≈chunkMs 분량(Milky 가 높으면 광자당 비용이 ~10배 → 고정 청크면 제한이 안 먹음).
import { essRatio } from '../../engine/mech3d/reweight.js';

const MIN_CHUNK = 1000;
// 앞 계산에 이어도 되는 원자료 — 같은 설계(sig) · 같은 격자(screen)일 때만. 아니면 null = 처음부터
export const resumable = (from, sig, screen) => (from?.raw && from.sig === sig && !!from.screen === !!screen ? from.raw : null);
// 응답 시간 제한(progressive.js 와 같음): 장면 60초 · 청크 30초. cancel() = 기다리던 send 도 바로 '중지' 로 끝냄
// 한 Worker 루프가 실패하면 같은 호출의 다른 루프도 새 청크를 보내지 않고 첫 오류를 다시 던짐
// 늦은 Worker(2026-11-22 사용자: 'Worker 응답 없음 (chunk 90초)' 로 최적화가 97% 에서 실패 — 멈추면 안 됨): 청크 제한 시간을 넘긴 포트는
// 늦은 답(과 그사이 보낸 장면)이 올 때까지만 빼고, 그 묶음은 다른 포트가 다시 계산(같은 시드). 모든 포트가 늦을 때만 실패. onSlow({ gpu, ms }) = 오류 기록용 알림
export function createAdRunner({ ports, now: now0 = () => globalThis.performance?.now?.() ?? Date.now(), sceneTimeoutMs = 60000, chunkTimeoutMs = 30000, deadMs = chunkTimeoutMs * 5, timers = globalThis, onSlow = null }) {
  let stopped = false, seed = 7001, onStop = null;
  // 일시정지 = 새 청크를 보내지 않음(보낸 청크는 받음). 시계는 멈춘 시간을 뺌 — 시간 한도가 있는 단계의 결과가 쉬었다고 달라지지 않게
  let gate = null, release = null, pausedMs = 0, pausedAt = 0;
  const now = () => now0() - pausedMs - (gate ? now0() - pausedAt : 0);
  const stopP = new Promise((_, rej) => { onStop = () => rej(new Error('기구 최적화 중지')); });
  stopP.catch(() => {});
  const check = (ctl) => { if (stopped) throw new Error('기구 최적화 중지'); if (ctl?.err) throw ctl.err; };
  const withTimeout = (pr, what, ms) => {
    let id;
    const to = new Promise((_, rej) => { id = timers.setTimeout(() => rej(new Error(`Worker 응답 없음 (${what} ${ms / 1000}초)`)), ms); });
    return Promise.race([pr, to, stopP]).finally(() => timers.clearTimeout(id));
  };
  // Worker 루프 하나 — 오류면 ctl.err 를 세워 다른 루프가 멈추게
  const guard = (ctl, fn) => async (p) => { try { await fn(p); } catch (e) { ctl.err ??= e; throw e; } };
  // 장면 제한 시간 = 기본 + 삼각형 100만 개마다 60초(큰 도면은 처음 만들 때 느린 PC 에서 60초를 넘을 수 있음, 2026-11-14)
  const sceneMs = (job) => { let n = 0; for (const q of job.scene?.mechParts ?? []) n += (q.triangles?.length ?? 0) / 3; return sceneTimeoutMs + Math.ceil(n / 1e6) * 60000; };
  // late = 늦은 포트 → 그 포트에 걸린 응답들. 모두 오면(성공·실패 무관) 다시 씀
  const late = new Map();
  const holdLate = (p, pr) => { const all = Promise.allSettled([late.get(p), pr]); late.set(p, all); all.then(() => { if (late.get(p) === all) late.delete(p); }); };
  const usable = (p) => !p.off?.() && !late.has(p);
  async function prepare(job) {
    check();
    const ctl = { err: null };
    // 늦은 포트에도 장면은 보내 둠(답을 기다리지 않음) — 늦은 답 뒤에 장면까지 받으면 다시 씀
    await Promise.all(ports.map(guard(ctl, (p) => { const pr = p.send({ type: 'scene', sceneKey: job.sceneKey, ...job.scene }); if (late.has(p)) { holdLate(p, pr); return null; } return withTimeout(pr, 'scene', sceneMs(job)); })));
  }
  const send = async (job, msg) => {
    if (gate) await Promise.race([gate, stopP]);
    const pr = msg.p.send({ type: 'chunk', sceneKey: job.sceneKey, seed: msg.seed ?? seed++, ...msg.body });
    let id;
    const to = new Promise((_, rej) => { id = timers.setTimeout(() => rej(Object.assign(new Error(`Worker 응답 없음 (chunk ${chunkTimeoutMs / 1000}초)`), { slow: true })), chunkTimeoutMs); });
    let r;
    try { r = await Promise.race([pr, to, stopP]); } catch (e) {
      if (e.slow) { holdLate(msg.p, pr); try { onSlow?.({ gpu: !!msg.p.gpu, ms: chunkTimeoutMs, N: msg.body?.N }); } catch { /* 기록 실패가 계산을 막지 않게 */ } }
      throw e;
    } finally { timers.clearTimeout(id); }
    if (r.stale) throw new Error('장면이 바뀜 — 다시 실행하세요');
    return r;
  };
  // 포트들이 일감을 나눠 계산 — take(p) → 일감 | null(지금 없음), run(p, 일감), back(일감) = 늦어서 못 한 일감을 되돌림(다른 포트가 다시).
  // 일감이 없어도 다른 포트의 청크가 진행 중이면 기다렸다 다시 봄(그 청크가 늦어 되돌아올 수 있음). 쓸 포트가 하나도 없으면 그 오류로 실패
  // 늦은 포트(2026-11-22 최종안 정밀 재계산 실패 — 모든 Worker 가 같이 늦음: 화면 멈춤·PC 과부하)는 버리지 않고 늦은 답을 deadMs 까지 기다렸다가 다시 씀.
  // 그동안 다른 포트가 일을 다 끝내면 기다림을 그만둠. 답이 deadMs 안에 안 오는 포트만 이번 호출에서 빠지고, 그런 포트만 남으면 그때 실패
  const drive = (ctl, take, run, back) => {
    let inflight = 0, finished = false, alive = ports.length, lastErr = null, gone = false; const waiters = [];
    const ping = () => { while (waiters.length) waiters.shift()(); };
    let finish; const doneP = new Promise((res) => { finish = () => { finished = true; res('done'); ping(); }; });
    const waitLate = (p) => { let id; const dl = new Promise((res) => { id = timers.setTimeout(() => res('dead'), deadMs); }); return Promise.race([late.get(p)?.then(() => 'back'), dl, doneP, stopP]).finally(() => timers.clearTimeout(id)); };
    return Promise.all(ports.map(guard(ctl, async (p) => {
      try {
        for (;;) {
          check(ctl);
          if (finished || p.off?.()) return;
          if (late.has(p)) { if (await waitLate(p) === 'dead') { gone = true; return; } continue; }
          const job = take(p);
          if (job == null) { if (inflight === 0) { finish(); return; } await new Promise((res) => waiters.push(res)); continue; }
          inflight++;
          try { await run(p, job); } catch (e) {
            if (!e.slow) throw e;
            lastErr = e; back(job);
          } finally { inflight--; ping(); }
        }
      } finally {
        if (--alive === 0 && !finished && !ctl.err && !stopped && gone) throw lastErr ?? new Error(`Worker 응답 없음 (chunk ${chunkTimeoutMs / 1000}초)`);   // 남은 포트가 모두 답 없이 빠짐
      }
    })));
  };
  // chunkN 기본 = Worker 마다 청크 2개쯤(후보당 광자가 적어도 모든 Worker 가 일하게)
  // crn(같은 난수 비교, 형상 후보용) = 시드 기준 — 청크 i 의 시드 crn+i · 크기 chunkN · 포트(쓰는 포트 i % 수) · 배치 i % batches 를 고정해
  // 후보마다 같은 광자 난수로 추적(후보 차이만 남음). 시간 제한·적응 청크 없음(N 전부)
  async function trace(job, { N: N0, maxMs = Infinity, minN = 0, chunkN = Math.max(2000, Math.ceil(N0 / (2 * ports.length))), chunkMs = Math.min(500, maxMs / 5), batches = 8, rw = null, crn = null, keepRaw = false, resume = null, onProgress = null, firstN = null, until = null, untilMs = 2000 }) {   // until(배치들) → true 면 시간 한도 전에 멈춤(빠른 검토: 오차가 기준에 닿음) — 배치가 다 찬 뒤 untilMs 간격으로만 물어봄   // firstN = 시간 제한일 때 첫 청크 크기(빠른 검토 — 느린 장면에서 첫 청크가 한도를 넘지 않게)
    const N = Math.ceil(N0);   // 광자 수는 정수(소수면 GPU 가 'offset is out of bounds' 로 꺼짐)
    await prepare(job);
    if (crn != null) return traceCrn(job, { N, chunkN, batches, rw, crn });
    const nCell = job.scene.G.ns * job.scene.G.nw, timed = Number.isFinite(maxMs);
    const B = Array.from({ length: batches }, () => new Float64Array(nCell)), RB = rw ? Array.from({ length: batches }, () => new Float64Array(rw.milkies.length * nCell)) : null;
    const ledger = { emitted: 0, escaped: 0, absSurf: 0, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 }, sf = rw ? new Float64Array(rw.milkies.length) : null, sf2 = rw ? new Float64Array(rw.milkies.length) : null;
    const bIss = new Float64Array(batches), bDone = new Float64Array(batches);
    // keepRaw = 점진 계산에 넘겨줄 원자료(광자 수를 곱한 합 · 면 전체 지도·칸 수·광경로 포함) — 화면이 최종 판정 값을 그대로 보여 주게
    const K = keepRaw ? { batches: Array.from({ length: batches }, () => ({ acc: new Float64Array(nCell), accAll: new Float64Array(nCell), cnt: new Float64Array(nCell), n: 0, photons: 0 })), ledger: {}, leak: {}, paths: {}, nCell, photons: 0 } : null;
    let n = 0, issued = 0, k = 0;
    // resume = 앞 계산의 keepRaw 원자료에 이어서: N 은 전체 광자 수, 모자란 만큼만 새로 추적. 청크 시드는 계속 늘어나 앞 광자와 겹치지 않음. 앞 결과는 복사해 그대로 둠
    if (resume && !rw && resume.nCell === nCell && resume.batches.length <= batches) {
      resume.batches.forEach((q, b) => {
        for (let i = 0; i < nCell; i++) B[b][i] = q.acc[i] / chunkN;
        bIss[b] = bDone[b] = q.photons; issued += q.photons; k += q.n;
        if (K) { const c = K.batches[b]; c.acc.set(q.acc); c.accAll.set(q.accAll); c.cnt.set(q.cnt); c.n = q.n; c.photons = q.photons; }
      });
      for (const key in ledger) ledger[key] = (resume.ledger[key] ?? 0) / chunkN;
      if (K) { K.photons = issued; K.ledger = { ...resume.ledger }; K.leak = { ...resume.leak }; K.paths = { ...resume.paths }; }
    }
    let enough = false, tAsk = 0;
    const t0 = now(), more = () => !enough && issued < N && !(now() - t0 >= maxMs && issued >= minN && k >= batches);
    const ask = () => {   // 정규화한 사본으로 물어봄(진행 중 합은 그대로)
      if (!until || enough || now() - tAsk < untilMs || bDone.some((v) => !(v > 0))) return;
      tAsk = now();
      let sum = 0; for (const v of bDone) sum += v;
      const ref = sum / batches;
      if (until(B.map((a, b) => { const s = ref / bDone[b], c = new Float64Array(a.length); for (let i = 0; i < a.length; i++) c[i] = a[i] * s; return c; }))) enough = true;
    };
    tAsk = t0;
    // 시간 제한이면 첫 청크 = minN(없으면 N/10) 을 Worker 마다 2개로 — 그 뒤 잰 속도로 조절
    const size0 = timed ? Math.min(chunkN, firstN > 0 ? Math.max(MIN_CHUNK, Math.round(firstN)) : Math.max(MIN_CHUNK, Math.ceil(Math.max(minN, N / 10) / (2 * ports.length)))) : chunkN;
    const ctl = { err: null }, sizes = new Map();   // 포트별 다음 청크 크기
    await drive(ctl, (p) => {
      if (!more()) return null;
      const m = Math.min(sizes.get(p) ?? size0, N - issued);
      let b = 0; for (let i = 1; i < batches; i++) if (bIss[i] < bIss[b]) b = i;   // 보낸 광자가 가장 적은 배치(고정 청크면 k % batches 와 같음)
      issued += m; bIss[b] += m; k++;
      return { m, b };
    }, async (p, { m, b }) => {
        let size = sizes.get(p) ?? size0;
        const t = now(), r = await send(job, { p, body: { N: m, ...(timed ? { cpuMax: MIN_CHUNK } : {}), ...(rw ? { rw } : {}) } });   // CPU 한도 = 최소 묶음(2026-11-21): GPU 가 꺼지면 어떤 크기든 돌려받아 CPU 속도로 다시 잼 — 예전 한도 chunkN(20만~100만)은 높은 Milky CPU 에서 100초를 넘겨 'Worker 응답 없음 (chunk 90초)'
        // GPU 가 이 묶음 중에 멈춰 꺼짐 — Worker 가 큰 GPU 묶음을 CPU 로 통째 돌리지 않고 돌려보냄(돌리면 'Worker 응답 없음 (chunk 90초)', 2026-11-18 다른 PC).
        // 이 묶음은 세지 않고 CPU 크기로 이어 감(화면 계산 progressive 와 같은 규칙)
        if (r.gpuRetry) { issued -= m; bIss[b] -= m; k--; sizes.set(p, Math.min(size, MIN_CHUNK)); return; }
        // GPU 포트는 큰 청크가 빠름 — 묶음마다 고정 비용(실측 ~0.7초: 1000개 1.0초 · 4000개 1.9초)이 있어 목표 시간을 4배로(2026-11-15).
        // 한 번에 두 배까지만 키움(2026-11-22) — 운 좋게 빨리 끝난 묶음으로 잰 속도로 갑자기 크게 잡으면 다음 묶음이 제한 시간을 넘김(progressive 와 같은 규칙)
        if (timed) { const ms = r.ms > 0 ? r.ms : now() - t; if (ms > 0) { size = Math.max(MIN_CHUNK, Math.min(chunkN * (r.gpu ? 8 : 1), 2 * Math.max(size, m), Math.round((m / ms) * chunkMs * (r.gpu ? 4 : 1)))); sizes.set(p, size); } }
        bDone[b] += m;
        onProgress?.(Math.min(1, Math.max(issued / N, timed ? (now() - t0) / maxMs : 0)));   // 광선 수와 시간 한도 중 먼저 닿는 쪽
        const f = m / chunkN;   // 청크 결과 = 광속 1회분(광자 수 무관) → 광자 수 가중으로 더함(크기가 다른 청크·GPU 가 섞여도 배치 평균이 바름). 같은 크기면 f = 1
        for (let i = 0; i < nCell; i++) B[b][i] += r.acc[i] * f;
        for (const key in ledger) ledger[key] += r.ledger[key] * f;
        if (K) {
          const q = K.batches[b];
          for (let i = 0; i < nCell; i++) { q.acc[i] += r.acc[i] * m; q.cnt[i] += r.cnt?.[i] ?? 0; if (r.accAll) q.accAll[i] += r.accAll[i] * m; }
          q.n++; q.photons += m; K.photons += m;
          for (const key in r.ledger) K.ledger[key] = (K.ledger[key] ?? 0) + r.ledger[key] * m;
          for (const key in r.leak ?? {}) K.leak[key] = (K.leak[key] ?? 0) + r.leak[key] * m;
          for (const key in r.paths ?? {}) K.paths[key] = (K.paths[key] ?? 0) + r.paths[key] * m;
        }
        if (rw) { for (let i = 0; i < RB[b].length; i++) RB[b][i] += r.rw.acc[i] * f; for (let j = 0; j < sf.length; j++) { sf[j] += r.rw.sf[j]; sf2[j] += r.rw.sf2[j]; } n += r.rw.n; }
        ask();
    }, ({ m, b }) => { issued -= m; bIss[b] -= m; k--; });   // 늦어서 못 받은 묶음 = 세지 않음(다른 포트가 다시)
    // 배치 무게가 다르면(청크 수·크기 차) 평균 광자 수로 정규화 — 합은 그대로(효율 = Σ/방출), 빈 배치는 뺌
    const keep = [...bDone.keys()].filter((b) => bDone[b] > 0), ref = issued / keep.length;
    const norm = (A) => keep.map((b) => { if (bDone[b] !== ref) { const s = ref / bDone[b]; for (let i = 0; i < A[b].length; i++) A[b][i] *= s; } return A[b]; });
    return { batches: norm(B), rwBatches: RB ? norm(RB) : null, ledger, ess: rw ? essRatio(sf, sf2, n) : null, photons: issued, ms: now() - t0, kept: K ? { ...K, batches: K.batches.filter((q) => q.photons > 0) } : null };
  }
  async function traceCrn(job, { N, chunkN, batches, rw, crn }) {
    const nCell = job.scene.G.ns * job.scene.G.nw, nC = Math.ceil(N / chunkN);
    const B = Array.from({ length: batches }, () => new Float64Array(nCell)), RB = rw ? Array.from({ length: batches }, () => new Float64Array(rw.milkies.length * nCell)) : null;
    const ledger = { emitted: 0, escaped: 0, absSurf: 0, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 }, sf = rw ? new Float64Array(rw.milkies.length) : null, sf2 = rw ? new Float64Array(rw.milkies.length) : null;
    const bDone = new Float64Array(batches), t0 = now(), ctl = { err: null };
    let n = 0;
    // 묶음 i 의 시드·크기·배치는 고정이고 어느 포트가 계산해도 같음 → 순서대로 나눠 가짐(늦은 포트의 묶음은 되돌려 다른 포트가 같은 시드로)
    const q = Array.from({ length: nC }, (_, i) => i);
    await drive(ctl, () => (q.length ? q.shift() : null), async (p, i) => {
        const m = Math.min(chunkN, N - i * chunkN), b = i % batches, r = await send(job, { p, seed: crn + i, body: { N: m, ...(rw ? { rw } : {}) } }), f = m / chunkN;
        bDone[b] += m;
        for (let c = 0; c < nCell; c++) B[b][c] += r.acc[c] * f;
        for (const key in ledger) ledger[key] += r.ledger[key] * f;
        if (rw) { for (let c = 0; c < RB[b].length; c++) RB[b][c] += r.rw.acc[c] * f; for (let j = 0; j < sf.length; j++) { sf[j] += r.rw.sf[j]; sf2[j] += r.rw.sf2[j]; } n += r.rw.n; }
    }, (i) => q.unshift(i));
    const keep = [...bDone.keys()].filter((b) => bDone[b] > 0), ref = N / keep.length;
    const norm = (A) => keep.map((b) => { if (bDone[b] !== ref) { const s = ref / bDone[b]; for (let i = 0; i < A[b].length; i++) A[b][i] *= s; } return A[b]; });
    return { batches: norm(B), rwBatches: RB ? norm(RB) : null, ledger, ess: rw ? essRatio(sf, sf2, n) : null, photons: N, ms: now() - t0 };
  }
  // 후보마다 발광점 묶음 하나 → 지도(Float32, 격자면 격자 수 × 셀) — 후보 자신의 방출로 나눈 방출 1 기준 지도(후보마다 광자 수가 달라도 됨) → emitted = 1
  // 시간 예산(spec §2.2c): 후보 광자 = min(N, 지금까지 잰 처리량 × 남은 시간 / 남은 후보, ≥ minN) — 첫 후보들(아직 잰 값 없음)은 N. onProgress(끝난 수, 후보 수)
  async function traceEach(job, emitterSets, { N = 20000, maxMs = Infinity, minN = 3000, rw = null, onProgress = null } = {}) {
    await prepare(job);
    const n = emitterSets.length, maps = new Array(n), t0 = now(), ctl = { err: null };
    let next = 0, fin = 0, done = 0; const again = [];   // again = 늦은 포트에서 되돌아온 후보
    const size = (left) => {
      const ms = now() - t0;
      if (!Number.isFinite(maxMs) || done <= 0 || ms <= 0) return N;
      return Math.max(Math.min(N, minN), Math.min(N, Math.floor((done / ms) * Math.max(0, maxMs - ms) / left)));
    };
    await drive(ctl, () => { if (again.length) return again.shift(); if (next >= n) return null; const k = next++; return { k, m: size(n - k) }; }, async (p, { k, m }) => {
        const r = await send(job, { p, body: { N: m, emitters: emitterSets[k], ...(rw ? { rw } : {}) } });
        const src = rw ? r.rw.acc : r.acc, e = r.ledger.emitted > 0 ? r.ledger.emitted : m, mp = new Float32Array(src.length);
        for (let i = 0; i < src.length; i++) mp[i] = src[i] / e;
        maps[k] = mp; done += m; fin++;
        onProgress?.(fin, n);
    }, (x) => again.push(x));
    return { maps, emitted: 1 };
  }
  return { trace, traceEach, now, cancel() { if (!stopped) { stopped = true; onStop(); } }, get stopped() { return stopped; }, get paused() { return !!gate; },
    pause() { if (gate || stopped) return; pausedAt = now0(); gate = new Promise((res) => { release = res; }); },
    resume() { if (!gate) return; pausedMs += now0() - pausedAt; gate = null; release(); } };
}
