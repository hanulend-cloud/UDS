// 점진 계산 제어기 — spec 2026-10-15 m3-cad-ui §4. 순수 로직: Worker 포트·타이머를 주입받아 Node 에서 시험한다.
// 포트 = { send(msg) → Promise<reply> } — 메시지는 mc3d-worker 의 'scene'·'chunk'(chunk-host.js 계약).
// 청크 c 의 시드 = seedBase·7919 + c (runJob 배치 시드 규약) → 배치 c % bins 에 모은다. 판정 통계는 배치별 (누적 × 기준 광자 수 ÷ 배치 광자 수).
// 적응형에서는 청크 c ≥ bins 를 보낸 광자가 가장 적은 배치에 넣는다(크기가 제각각이어도 배치 무게가 고르게).
// 청크 크기: 기본은 적응형 — 포트마다 minChunk 로 시작해 잰 속도로 다음 청크를 ≈chunkMs 분량으로(minChunk~maxChunk).
//   fixedChunk: true 면 chunkN 고정(runJob 과 비트 일치 시험용).
import { tallyStats, judgeNoise, LUM_CONE } from '../../engine/mech3d/tally.js';

export const PROG_DEFAULTS = { chunkN: 25000, fixedChunk: false, minChunk: 1000, maxChunk: 50000, chunkMs: 500, bins: 10, targetNoise: 0.02, maxPhotons: 1e8, debounceMs: 500, tickMs: 1000, seedBase: 1, maxIgnored: 16, sceneTimeoutMs: 60000, chunkTimeoutMs: 30000 };
export const chunkSeed = (seedBase, c) => seedBase * 7919 + c;
const ledger0 = () => ({ lumEsc: 0, emitted: 0, escaped: 0, absSurf: 0, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 });

// 광 효율·휘도 — eff = Σ관측면 원뿔(보는 각도) 안 출사 / 방출. 휘도는 보는 각도와 따로 항상 ±LUM_CONE(2026-11-11):
// effLum = ±10° 안 출사 / 방출, 휘도 = fluxLm·nLeds·effLum / (A[m²]·π·sin²10°) — 그 각도 안 평균 휘도
const LUM_S2 = Math.sin((LUM_CONE * Math.PI) / 180) ** 2;
export function photometry(G, sum, ledger, { fluxLm = 0, nLeds = 0 } = {}) {
  let tot = 0, area = 0;
  for (let k = 0; k < sum.length; k++) { tot += sum[k]; area += G.area[k]; }
  const eff = ledger.emitted > 0 ? tot / ledger.emitted : NaN;
  const effLum = ledger.emitted > 0 ? (ledger.lumEsc ?? 0) / ledger.emitted : NaN;
  return { eff, effLum, lum: lumFor({ effLum, area, nLeds }, fluxLm), area, nLeds };
}
// LED 1개 광속 → 예상 평균 휘도(cd/m², 정면 ±10°) — 계산 결과의 광 효율로 바로(휘도는 광속에 정비례). 표시 전용
export function lumFor(ph, fluxLm) {
  if (!(fluxLm > 0) || !(ph?.nLeds > 0) || !(ph.area > 0) || !Number.isFinite(ph.effLum)) return null;
  return (fluxLm * ph.nLeds * ph.effLum) / (ph.area * 1e-6 * Math.PI * LUM_S2);
}
// 필요 광속(2026-11-11) — 휘도 식의 역산. 휘도는 광속에 정비례하고 광 효율은 광속과 무관하므로 계산 1회 결과로 바로 구함. 표시 전용(판정과 무관)
export function requiredFlux(ph, targetLum) {
  if (!(targetLum > 0) || !(ph?.effLum > 0) || !(ph.area > 0) || !(ph.nLeds > 0)) return null;
  const total = (targetLum * ph.area * 1e-6 * Math.PI * LUM_S2) / ph.effLum;
  return { total, perLed: total / ph.nLeds };
}

// job = { sceneKey, scene:{ mechParts, mspec, ledParts, lineData, G, obs, emitters }, G, obs, nLeds, fluxLm } 또는 그것을 돌려주는 함수(준비 안 됨 = null)
// 필요 광속 글(2026-11-11) — 모자라지 않게 올림. LED 1개당이 먼저(사용자가 고르는 값)
const ceilLm = (v) => (v >= 100 ? String(Math.ceil(v - 1e-9)) : v >= 10 ? (Math.ceil(v * 10 - 1e-9) / 10).toFixed(1) : (Math.ceil(v * 100 - 1e-9) / 100).toFixed(2));
export const needText = (n) => (n ? `필요 광속 LED당 ${ceilLm(n.perLed)} lm · 총 ${ceilLm(n.total)} lm` : '');
export const needShort = (n) => (n ? `LED당 ${ceilLm(n.perLed)} lm 필요` : '');   // 좁은 결과 카드용
// 표시 진행률(2026-11-11) — 되돌아가지 않는 % . 예전엔 (목표/오차)² 를 그대로 보여 줘서, 배치 10개로 잰 오차가 흔들릴 때마다 숫자가 내려갔고
// 목표 근처로 판정 오차가 조여지면(1.5 → 0.5%, 필요 광선 9배) 크게 떨어졌음. 필요 광선을 평활해서 광선 수 ÷ 필요 광선으로 재고,
// 판정 오차가 바뀌면 지금 % 에서 이어 가며, 90% 위는 천천히 올라 끝나기 전(99.9)에 멈추지 않게 함. 판정·계산 중단과 무관(표시 전용)
export function nextProgress(p, photons, noise, goal) {
  if (!(photons > 0) || !(noise > 0) || !(goal > 0)) return p;
  const needNow = photons * (noise / goal) ** 2;
  let q = p ?? { pct: 0, need: needNow, goal, base: 0, start: 0 };
  if (q.goal !== goal) q = { ...q, need: q.need * (q.goal / goal) ** 2, goal, base: q.pct, start: photons };
  const need = q.need + 0.25 * (needNow - q.need);
  const raw = need > q.start ? q.base + ((100 - q.base) * (photons - q.start)) / (need - q.start) : 100;
  const soft = raw > 90 ? 90 + 10 * (1 - Math.exp(-(raw - 90) / 10)) : raw;
  return { ...q, need, pct: Math.min(99.9, Math.max(q.pct, soft)) };
}
// 진행률 글(0~100 → 소수 한 자리, 0.1% 단위 내림 — 끝나기 전에 100.0 으로 보이지 않게)
export const fmtProg = (v) => (Number.isFinite(v) ? (Math.floor(v * 10 + 1e-9) / 10).toFixed(1) : '0.0');
// 광선 한도(2026-11-11) — 보는 각도 ±30° 기준 16억(±90° 때 4억의 4배) × 화질(칸이 많을수록 더)
export const photonCap = (quality) => 1.6e9 * ({ mid: 2, high: 4 }[quality] ?? 1);
export function createProgressive({ ports, timers = globalThis, onUpdate = () => {}, opts = {} }) {
  let prog = null;   // 표시 진행률(nextProgress)
  const o = { ...PROG_DEFAULTS, ...opts };
  const cap = () => job?.maxPhotons ?? o.maxPhotons;   // 계산 한도 — 작업(화질)별, 없으면 기본
  let gen = 0, state = 'idle', reason = null, error = null, job = null, pendingJob = null, debounce = null, ticker = null;
  let paths = {}, bins, binIssued, ledger, leak, nextChunk, issued, retry, doneChunks, photons, ignored, snap, early, nMin, nMax;
  let pendingSeed = null, wantPaused = false, disposed = false;   // wantPaused: 대기·시작 중 일시정지 요청 → 시작될 때 적용
  const busy = ports.map(() => 0);   // 포트별로 돌고 있는 펌프의 세대(0 = 쉼)
  const ready = ports.map(() => 0);  // 포트별로 장면이 준비된 세대 — 준비된 포트부터 바로 청크를 보낸다
  const size = ports.map(() => o.minChunk);   // 포트별 다음 청크 크기(적응형)
  const now = () => (typeof timers.now === 'function' ? timers.now() : globalThis.performance?.now?.() ?? Date.now());
  resetAcc();

  function resetAcc() { prog = null; bins = Array.from({ length: o.bins }, () => null); binIssued = new Float64Array(o.bins); ledger = ledger0(); leak = {}; paths = {}; nextChunk = 0; issued = 0; retry = []; nMin = Infinity; nMax = 0; doneChunks = 0; photons = 0; ignored = 0; snap = null; early = false; }
  function stopTick() { if (ticker != null) { timers.clearInterval(ticker); ticker = null; } }
  function startTick() { stopTick(); ticker = timers.setInterval(onTick, o.tickMs); }
  const emit = () => { if (!disposed) onUpdate(snapshot()); };
  // 포트 응답에 제한 시간 — Worker 가 멈추면 'Worker 응답 없음' 으로 실패
  function send(port, msg, ms) {
    let id = null;
    const to = new Promise((_, rej) => { id = timers.setTimeout(() => rej(new Error(`Worker 응답 없음 (${msg.type} ${ms / 1000}초)`)), ms); });
    return Promise.race([port.send(msg), to]).finally(() => timers.clearTimeout(id));
  }

  // 물리 변경 — 진행 중 결과는 세대(gen)로 무효화하고 디바운스 뒤 새로 시작
  // seedFn(선택) = 시작 때 부르는 함수 — 값이 있으면(기구 최적화가 이미 잰 결과) 청크를 돌리지 않고 그 결과를 끝난 계산으로 받음
  let stopped = false;
  function restart(j, seedFn = null) {
    if (disposed) return;
    gen++; stopTick();
    if (debounce != null) timers.clearTimeout(debounce);
    if (state === 'paused' && !stopped) wantPaused = true;   // 사용자 일시정지는 다시 시작 뒤에도 유지(여러 값을 고치는 동안) · 중지 뒤에는 새로 계산
    else if (stopped) wantPaused = false;
    stopped = false;
    resetAcc(); job = null; pendingJob = j; pendingSeed = seedFn; state = 'pending'; reason = null; error = null;
    const g = gen;
    debounce = timers.setTimeout(() => { debounce = null; begin(g); }, o.debounceMs);
    emit();
  }
  async function begin(g) {
    let j;
    try { j = typeof pendingJob === 'function' ? pendingJob() : pendingJob; } catch (e) { fail(g, e); return; }
    const sd = pendingSeed?.() ?? null, seed = j && sd?.nCell === j.G.ns * j.G.nw ? sd : null;
    pendingJob = null; pendingSeed = null;
    if (!j) { state = 'idle'; reason = 'notReady'; emit(); return; }
    job = j; state = 'starting'; emit();
    // 청크 제한 시간은 도면 크기에 맞춘다(2026-11-11) — 삼각형 20만 개마다 기본 시간만큼 더 줌(상한 5분). 큰 도면은 한 청크가 정상적으로도 30초를 넘김
    const tris = (a) => (a ?? []).reduce((s, p) => s + (p.triangles?.length ?? 0) / 3, 0);
    chunkLimit = Math.min(300000, o.chunkTimeoutMs * Math.max(1, (tris(j.scene?.mechParts) + tris(j.scene?.ledParts)) / 200000));
    size.fill(o.minChunk);
    // 포트마다 따로: 장면이 준비되는 대로 그 포트의 청크를 시작(느린 Worker 가 다른 Worker 를 붙잡지 않음)
    await Promise.all(ports.map(async (p, k) => {
      try { await send(p, { type: 'scene', sceneKey: j.sceneKey, ...j.scene }, o.sceneTimeoutMs); } catch (e) { fail(g, e); return; }
      if (g !== gen || state === 'error') return;
      ready[k] = g;
      if (state === 'starting') {
        if (seed) { loadSeed(seed); finish('adopted'); return; }
        if (wantPaused) { wantPaused = false; state = 'paused'; emit(); return; }
        state = 'running'; startTick(); emit();
      }
      if (state === 'running' && busy[k] !== g) pump(k, g);
    }));
  }
  function fail(g, e) { if (g !== gen) return; stopTick(); state = 'error'; error = String(e?.message ?? e); emit(); }
  let chunkLimit = o.chunkTimeoutMs;   // 이번 도면의 청크 제한 시간(begin 에서 정함)
  function pumpAll(g) { ports.forEach((_, k) => { if (ready[k] === g && busy[k] !== g) pump(k, g); }); }
  // 다음 청크 크기 — 잰 계산 시간(Worker 의 r.ms, 없으면 왕복 시간)으로 ≈chunkMs 분량
  // GPU 포트(응답 gpu:true)는 한 번에 많이 보낼수록 빠름(청크마다 광원 표본·되읽기 비용) — 목표 시간 ×3, 상한 ×20
  function adapt(k, N, ms, gpu = false) {
    if (o.fixedChunk || !(ms > 0)) return;
    // 한 번에 두 배를 넘겨 키우지 않는다 — 짧게 잰 속도로 갑자기 크게 잡으면 한 청크가 제한 시간을 넘김(2026-11-11)
    const grow = gpu ? Infinity : Math.max(o.minChunk, size[k] * 2);
    size[k] = Math.max(o.minChunk, Math.min(o.maxChunk * (gpu ? 20 : 1), grow, Math.round((N / ms) * o.chunkMs * (gpu ? 3 : 1))));
  }
  // 포트 하나에 청크를 하나씩 보낸다(응답이 오면 다음 — Worker 에 청크를 쌓지 않아 새 장면은 진행 중 청크 1개만 기다림)
  async function pump(k, g) {
    busy[k] = g;
    try {
      while (g === gen && state === 'running' && (retry.length > 0 || issued < cap()) && !ports[k].off?.()) {   // off: GPU 사용 중 쉬는 CPU 포트
        // 버려진(장면 불일치) 청크 번호를 먼저 다시 쓴다 — 시드가 빈틈없이 이어져야 runJob 과 같은 배치가 됨
        let c, N, b;
        if (retry.length > 0) ({ c, N, b } = retry.shift());
        else { c = nextChunk++; N = Math.min(o.fixedChunk ? o.chunkN : size[k], cap() - issued); issued += N; b = pickBin(c); binIssued[b] += N; }
        let r;
        const t0 = now();
        try { r = await send(ports[k], { type: 'chunk', sceneKey: job.sceneKey, seed: chunkSeed(o.seedBase, c), N, cpuMax: o.maxChunk }, chunkLimit); } catch (e) { fail(g, e); return; }
        if (g !== gen) return;   // 그사이 다시 시작·취소됨 — 버림
        // GPU 가 이 청크 중에 멈춰 꺼짐 — Worker 가 큰 GPU 몫을 CPU 로 통째 돌리지 않고 돌려보냄. 광자를 세지 않고 CPU 크기로 이어 감(2026-11-12)
        if (r.gpuRetry) {
          size[k] = o.minChunk;
          if (o.fixedChunk) retry.push({ c, N, b }); else { issued -= N; binIssued[b] -= N; }
          continue;
        }
        if (r.stale || r.sceneKey !== job.sceneKey) {
          retry.push({ c, N, b });
          if (++ignored > o.maxIgnored) { fail(g, new Error('Worker 장면이 맞지 않음 — 다시 계산하세요')); return; }
          continue;
        }
        adapt(k, N, Number.isFinite(r.ms) && r.ms > 0 ? r.ms : now() - t0, !!r.gpu);
        accumulate(b, N, r);
        if (state !== 'running') { snap = compute(); emit(); }                              // 일시정지·완료 뒤 도착한 청크
        else if (photons >= cap()) finish('max');
        else if (!early && bins.filter(Boolean).length >= 2) { early = true; onTick(); }   // 첫 지표는 1초를 기다리지 않음
      }
    } finally { if (busy[k] === g) busy[k] = 0; }
  }
  // 배치 고르기 — 고정 크기: c % bins(runJob 규약). 적응형: 보낸 광자가 가장 적은 배치(배치 무게를 고르게 → 노이즈 추정이 덜 부풀음)
  function pickBin(c) {
    if (o.fixedChunk || c < o.bins) return c % o.bins;
    let b = 0; for (let i = 1; i < o.bins; i++) if (binIssued[i] < binIssued[b]) b = i;
    return b;
  }
  // 청크 결과는 광자 수와 무관하게 '광원 광속 1회분'(가중치 w0 = flux/N) — 광자 수 가중(f = N/chunkN)으로 더해야 크기가 다른 청크(적응형·GPU)가 섞여도
  // 배치 평균이 바르다(예전엔 청크 개수 가중 → GPU 큰 청크가 섞이면 배치 간 차가 커져 노이즈가 수렴하지 않음, 2026-10-27). 고정 크기면 f = 1(runJob 과 비트 일치)
  function accumulate(b, N, r) {
    const n = r.acc.length, f = N / o.chunkN;
    const B = bins[b] ?? (bins[b] = { acc: new Float64Array(n), accAll: new Float64Array(n), cnt: new Float64Array(n), n: 0, photons: 0 });
    for (let k = 0; k < n; k++) { B.acc[k] += r.acc[k] * f; B.cnt[k] += r.cnt[k]; }
    if (r.accAll) for (let k = 0; k < n; k++) B.accAll[k] += r.accAll[k] * f;   // 면 전체(2D 표시·TXT)
    B.n++; B.photons += N; nMin = Math.min(nMin, N); nMax = Math.max(nMax, N);
    for (const key in ledger) ledger[key] += (r.ledger[key] ?? 0) * f;
    for (const key in r.leak ?? {}) leak[key] = (leak[key] ?? 0) + r.leak[key] * f;
    for (const key in r.paths ?? {}) paths[key] = (paths[key] ?? 0) + r.paths[key] * f;   // 광경로(관측면으로 나온 빛이 거친 부품 차례)
    photons += N; doneChunks++;
  }
  // 기구 최적화 최종 판정의 누적 결과를 그대로 받음(2026-11-03) — seed 값은 광자 수를 곱해 더한 합이라 chunkN 으로 나누면 accumulate 와 같은 꼴
  function loadSeed(seed) {
    const c0 = o.chunkN;
    seed.batches.forEach((b, i) => {
      const n = b.acc.length, B = bins[i % o.bins] ?? (bins[i % o.bins] = { acc: new Float64Array(n), accAll: new Float64Array(n), cnt: new Float64Array(n), n: 0, photons: 0 });
      for (let k = 0; k < n; k++) { B.acc[k] += b.acc[k] / c0; B.accAll[k] += b.accAll[k] / c0; B.cnt[k] += b.cnt[k]; }
      B.n += b.n; B.photons += b.photons; doneChunks += b.n;
    });
    for (const key in ledger) ledger[key] = (seed.ledger[key] ?? 0) / c0;
    for (const key in seed.leak ?? {}) leak[key] = seed.leak[key] / c0;
    for (const key in seed.paths ?? {}) paths[key] = seed.paths[key] / c0;
    photons = issued = seed.photons; nMin = 1; nMax = 2;
  }
  function compute() {
    const filled = bins.filter(Boolean);
    if (!job || filled.length < 2) return { stats: null, sum: null, photometry: null };
    // 배치를 광자 수로 정규화 — 기준 = 청크 평균 광자 수. 청크 크기가 모두 같으면 ÷ 청크 수(1개면 그대로 — runJob 과 비트 일치)
    // 배치 = chunkN 광자 1회분으로 정규화(acc 는 광자 수 가중으로 더했음). cnt 는 광자 수에 비례하므로 같은 비율. 고정 크기면 ÷ 청크 수
    const same = nMin === nMax && nMin === o.chunkN, ref = o.chunkN;
    const norm = (B, a) => (same ? (B.n === 1 ? a : a.map((v) => v / B.n)) : a.map((v) => v * (ref / B.photons)));
    const accs = filled.map((B) => norm(B, B.acc)), cnts = filled.map((B) => norm(B, B.cnt));
    const stats = tallyStats(job.G, accs, job.obs, cnts);
    // 2D 표시·TXT 용 면 전체 지도 — stats.map 과 같은 정규화(제외 구역이 없는 칸은 값이 같음)
    if (job.G.validAll) { const all = filled.map((B) => norm(B, B.accAll)), m = new Float64Array(job.G.ns * job.G.nw); for (let k = 0; k < m.length; k++) if (job.G.validAll[k]) { let v = 0; for (const a of all) v += a[k]; m[k] = v / all.length / job.G.areaAll[k]; } stats.mapAll = m; }
    const sum = new Float64Array(job.G.ns * job.G.nw);
    for (const B of filled) for (let k = 0; k < sum.length; k++) sum[k] += B.acc[k];
    return { stats, sum, photometry: photometry(job.G, sum, ledger, { fluxLm: job.fluxLm ?? 0, nLeds: job.nLeds ?? 0 }) };
  }
  const goal = () => (job?.obs ? judgeNoise(snap?.stats, job.obs, o.targetNoise) : o.targetNoise);   // 목표 바로 아래면 더 낮은 노이즈까지
  function onTick() {
    if (!job) return;
    snap = compute();
    const rn = snap.stats?.relNoise;
    if (state === 'running') prog = nextProgress(prog, photons, rn, goal());
    if (state === 'running' && doneChunks >= o.bins && rn != null && rn <= goal()) { finish('converged'); return; }
    emit();
  }
  function finish(r) { state = 'done'; reason = r; stopTick(); snap = compute(); emit(); }

  function pause() {
    if (state === 'pending' || state === 'starting') { wantPaused = true; return; }
    if (state !== 'running') return;
    state = 'paused'; stopTick(); emit();
  }
  // 중지 = 계산을 끝냄: 지금까지의 결과는 남고 이어서 못 함(다음 실행은 restart)
  function stop() { stopped = true; if (state === 'paused') emit(); else pause(); }
  function resume() {
    stopped = false;
    if (state === 'pending' || state === 'starting') { wantPaused = false; return; }
    if (state !== 'paused') return;
    state = 'running'; startTick(); emit(); pumpAll(gen);
  }
  // 목표만 바뀜 — 누적 데이터로 판정만 다시. 노이즈 목표를 현재 노이즈보다 낮추면(수렴 멈춤 상태) 계산 재개
  function setJudge({ obs = null, targetNoise = null, fluxLm = null } = {}) {
    if (targetNoise != null) o.targetNoise = targetNoise;
    if (job) {
      job = { ...job, obs: obs ? { ...job.obs, targetLen: obs.targetLen, targetWid: obs.targetWid } : job.obs, fluxLm: fluxLm ?? job.fluxLm };
      snap = compute();
      const rn = snap.stats?.relNoise;
      if (state === 'done' && reason === 'converged' && rn != null && rn > goal() && photons < cap()) {
        prog = null; state = 'running'; reason = null; startTick(); emit(); pumpAll(gen); return;   // 사용자가 목표를 바꿔 다시 계산 — 진행률도 새로
      }
    }
    emit();
  }
  function cancel() {
    gen++; stopTick();
    if (debounce != null) { timers.clearTimeout(debounce); debounce = null; }
    job = null; pendingJob = null; pendingSeed = null; wantPaused = false; resetAcc(); state = 'idle'; reason = null; error = null;
    emit();
  }
  // 화면 해제 — 알림 없이 취소하고, 이후 호출은 무시
  function dispose() { if (disposed) return; disposed = true; cancel(); }
  // 주의: bins[].acc 는 내부 누적 배열을 그대로 넘긴다(복사 비용 회피) — 소비자는 읽기만 하고 바꾸면 안 된다.
  function snapshot() {
    return {
      state, stopped, reason, error, photons, progress: state === 'done' ? 100 : prog?.pct ?? 0, chunks: doneChunks, ignored, sceneKey: job?.sceneKey ?? null,
      stats: snap?.stats ?? null, sum: snap?.sum ?? null, photometry: snap?.photometry ?? null,
      ledger: { ...ledger }, leak: { ...leak }, paths: { ...paths }, bins: bins.map((b) => b && { acc: b.acc, n: b.n, photons: b.photons }),
      G: job?.G ?? null, obs: job?.obs ?? null, targetNoise: goal(),
    };
  }
  return { restart, pause, stop, resume, cancel, dispose, setJudge, snapshot };
}
