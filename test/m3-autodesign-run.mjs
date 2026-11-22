// 기구 최적화 Worker io(가짜 포트): node test/m3-autodesign-run.mjs
import { createAdRunner, resumable } from '../src/ui/m3/autodesign-run.js';
import { ok, done } from './mech3d-util.mjs';

const nCell = 4;
const fakePorts = (log, delay = 0) => Array.from({ length: 3 }, (_, w) => ({ send: async (m) => {
  log.push(`${w}:${m.type}`);
  if (delay && m.type === 'chunk') await new Promise((res) => setTimeout(res, delay));
  if (m.type === 'scene') return { sceneKey: m.sceneKey, ready: true };
  const acc = new Float64Array(nCell).fill(1), ledger = { emitted: m.N, escaped: m.N / 2, absSurf: 0, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 };
  const out = { sceneKey: m.sceneKey, acc, cnt: new Uint32Array(nCell), ledger, leak: {}, escObs: 0, ms: 1 };
  if (m.rw) out.rw = { acc: new Float64Array(m.rw.milkies.length * nCell).fill(1), sf: new Float64Array(m.rw.milkies.length).fill(m.N), sf2: new Float64Array(m.rw.milkies.length).fill(m.N), n: m.N, milkies: m.rw.milkies };
  return out;
} }));
{ const log = [], R = createAdRunner({ ports: fakePorts(log) });
  const job = { sceneKey: 'k1', scene: { G: { ns: 2, nw: 2 } } };
  const r = await R.trace(job, { N: 60000, chunkN: 10000, batches: 4, rw: { part: 0, milkies: [1, 2] } });
  ok(log.filter((x) => x.endsWith('scene')).length === 3 && log.filter((x) => x.endsWith('chunk')).length === 6, '장면 Worker 마다 1번, 청크 6개(60000/10000)');
  ok(r.batches.length === 4 && r.rwBatches.length === 4 && r.rwBatches[0].length === 2 * nCell && r.ledger.emitted === 60000 && Math.abs(r.ess[0] - 1) < 1e-12, '배치 4개로 나눠 합침 · 격자 지도 · ESS');
  const c = await R.traceEach(job, [[{ pos: [0, 0, 0] }], [{ pos: [1, 0, 0] }]], { N: 5000 });
  ok(c.maps.length === 2 && c.maps[0] instanceof Float32Array && c.emitted === 1 && Math.abs(c.maps[0][0] - 1 / 5000) < 1e-9, 'traceEach: 후보마다 지도(Float32) · 방출 1 기준 정규화(emitted = 1)');
  ok(r.photons === 60000, '시간 제한 없음 = N 전부');
  R.cancel(); let thrown = ''; try { await R.trace(job, { N: 1000 }); } catch (e) { thrown = e.message; }
  ok(/중지/.test(thrown), 'cancel 뒤 호출 = 중지 오류'); }
{ // 늦은 Worker 하나 때문에 최적화 전체가 멈추지 않음(2026-11-22 사용자: 'Worker 응답 없음 (chunk 90초)' 로 97% 에서 실패) —
  // 제한 시간을 넘긴 포트만 빼고(늦은 답이 올 때까지) 그 묶음은 다른 포트가 다시 계산. 모든 포트가 늦을 때만 실패. 늦은 포트는 onSlow 로 알림
  const mk = (stuckAt, log, hang = 400) => Array.from({ length: 2 }, (_, w) => { let n = 0; return { gpu: w === 1, send: async (m) => {
    if (m.type === 'scene') return { sceneKey: m.sceneKey, ready: true };
    n++; log.push(`${w}:${m.N}:${m.seed}`);
    if (w === 1 && n === stuckAt) await new Promise((res) => setTimeout(res, hang));   // 포트 1 의 이 묶음만 제한 시간(50ms)을 넘김
    const acc = Float64Array.from({ length: nCell }, (_, i) => 1 + ((m.seed * 7 + i) % 5) / 10);
    return { sceneKey: m.sceneKey, acc, cnt: new Uint32Array(nCell), ledger: { emitted: m.N, escaped: 0, absSurf: 0, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 }, leak: {}, escObs: 0, ms: 1 };
  } }; });
  const job = { sceneKey: 'sl', scene: { G: { ns: 2, nw: 2 } } }, slow = [];
  const R = createAdRunner({ ports: mk(2, []), chunkTimeoutMs: 50, onSlow: (x) => slow.push(x) });
  const r = await R.trace(job, { N: 40000, chunkN: 5000, batches: 4 });
  ok(r.photons === 40000 && r.batches.length === 4 && slow.length === 1 && slow[0].gpu === true, `늦은 포트만 빼고 N 전부 계산 (광자 ${r.photons} · 알림 ${JSON.stringify(slow)})`);
  // 같은 난수 비교(crn): 늦은 포트가 있어도 묶음 시드·크기·배치가 같아 결과가 같음
  const A = createAdRunner({ ports: mk(0, []), chunkTimeoutMs: 50 }), B = createAdRunner({ ports: mk(2, []), chunkTimeoutMs: 50 });
  const a = await A.trace(job, { N: 30000, chunkN: 5000, batches: 3, crn: 500 }), b = await B.trace(job, { N: 30000, chunkN: 5000, batches: 3, crn: 500 });
  ok(JSON.stringify(a.batches.map((x) => [...x])) === JSON.stringify(b.batches.map((x) => [...x])), 'crn: 늦은 포트가 있어도 결과 같음');
  const C = createAdRunner({ ports: mk(1, []), chunkTimeoutMs: 50 }), e = await C.traceEach(job, [0, 1, 2, 3].map((x) => [{ pos: [x, 0, 0] }]), { N: 2000 });
  ok(e.maps.every((m) => m instanceof Float32Array), 'traceEach: 늦은 포트의 후보도 다른 포트가 계산');
  // 모든 포트가 한꺼번에 늦음(2026-11-22 사용자: 최종안 정밀 재계산에서 'Worker 응답 없음 (chunk 90초)' — 화면 멈춤·PC 과부하로 모든 Worker 가 같이 늦음):
  // 실패하지 않고 늦은 답을 기다렸다가(deadMs 까지) 그 포트로 이어서 계산
  const D = createAdRunner({ ports: [mk(1, [])[1]], chunkTimeoutMs: 50, deadMs: 2000 }); let msg = '', rD = null;
  try { rD = await D.trace(job, { N: 10000, chunkN: 5000 }); } catch (x) { msg = x.message; }
  ok(rD?.photons === 10000, `포트 하나뿐이고 늦어도 늦은 답을 기다려 끝까지 계산 (${msg || rD?.photons})`);
  const both = Array.from({ length: 2 }, (_, w) => { let n = 0; return { gpu: w === 1, send: async (m) => {
    if (m.type === 'scene') return { sceneKey: m.sceneKey, ready: true };
    if (++n === 1) await new Promise((res) => setTimeout(res, 300));   // 두 포트의 첫 묶음이 같이 늦음(화면 멈춤)
    return { sceneKey: m.sceneKey, acc: new Float64Array(nCell).fill(1), cnt: new Uint32Array(nCell), ledger: { emitted: m.N, escaped: 0, absSurf: 0, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 }, leak: {}, escObs: 0, ms: 1 };
  } }; });
  const E = createAdRunner({ ports: both, chunkTimeoutMs: 50, deadMs: 2000 }); let rE = null; msg = '';
  try { rE = await E.trace(job, { N: 20000, chunkN: 5000, batches: 4 }); } catch (x) { msg = x.message; }
  ok(rE?.photons === 20000, `모든 포트가 같이 늦어도 기다렸다 이어서 끝까지 (${msg || rE?.photons})`);
  // 답이 끝내 안 오는 포트(죽은 Worker)만 남으면 deadMs 뒤 실패 — 영원히 기다리지 않음
  const dead = [{ send: async (m) => (m.type === 'scene' ? { sceneKey: m.sceneKey, ready: true } : new Promise(() => {})) }];
  const F = createAdRunner({ ports: dead, chunkTimeoutMs: 50, deadMs: 200 }); msg = ''; const tF = Date.now();
  try { await F.trace(job, { N: 10000, chunkN: 5000 }); } catch (x) { msg = x.message; }
  ok(/Worker 응답 없음/.test(msg) && Date.now() - tF < 1500, `답이 끝내 없는 Worker 만 남으면 그때 실패 (${msg} · ${Date.now() - tF}ms)`);
  await new Promise((res) => setTimeout(res, 500)); }
{ // traceEach 시간 예산(spec §2.2c): 가짜 시계 1 광자/ms · 포트 1개 — 후보마다 광자 = min(N, 남은 예산/남은 후보, ≥ minN), 지도는 후보 자신의 방출로 정규화
  let t = 0; const Ns = [], prog = [];
  const port = { send: async (m) => { if (m.type === 'scene') return { sceneKey: m.sceneKey, ready: true };
    Ns.push(m.N); t += m.N;   // 같은 응답 모양(광자 수에 비례) — 정규화하면 같아야 함
    return { sceneKey: m.sceneKey, acc: Float64Array.from({ length: nCell }, (_, i) => 0.5 * m.N * (i + 1)), cnt: new Uint32Array(nCell), ledger: { emitted: m.N, escaped: 0, absSurf: 0, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 }, ms: m.N }; } };
  const R = createAdRunner({ ports: [port], now: () => t }), job = { sceneKey: 'kb', scene: { G: { ns: 2, nw: 2 } } }, sets = [0, 1, 2, 3].map((x) => [{ pos: [x, 0, 0] }]);
  const c = await R.traceEach(job, sets, { N: 12000, maxMs: 30000, minN: 3000, onProgress: (i, n) => prog.push(`${i}/${n}`) });
  ok(Ns.join() === '12000,6000,6000,6000' && c.emitted === 1, `예산 30 s: 후보 광자 ${Ns.join(' · ')}`);
  ok(c.maps.every((m) => [...m].every((v, i) => Math.abs(v - 0.5 * (i + 1)) < 1e-6)), '광자 수가 달라도 정규화 지도는 같음');
  ok(prog.join() === '1/4,2/4,3/4,4/4', `후보별 진행 ${prog.join(' ')}`);
  Ns.length = 0; t = 0;
  await R.traceEach(job, sets, { N: 12000, maxMs: 15000, minN: 3000 });
  ok(Ns.join() === '12000,3000,3000,3000', `예산 부족 → 하한 3000: ${Ns.join(' · ')}`); }
{ // 시간 제한: 청크 5ms · 40ms 제한 → N 전에 멈추되 minN 이상, 실제 광자 수 보고
  const R = createAdRunner({ ports: fakePorts([], 5) }), job = { sceneKey: 'k2', scene: { G: { ns: 2, nw: 2 } } };
  const r = await R.trace(job, { N: 1e7, maxMs: 40, minN: 20000, chunkN: 2000, batches: 4 });
  ok(r.photons >= 20000 && r.photons < 1e6 && r.ledger.emitted === r.photons && r.batches.length === 4, `maxMs 40 → ${r.photons} 광자(≥ minN 20000)에서 멈춤`);
  const w = r.batches.map((b) => b[0]), tot = w.reduce((a, b) => a + b, 0), chunks = r.photons / 2000;
  ok(Math.abs(tot - chunks) < 1e-9 && w.every((v) => Math.abs(v - chunks / 4) < 1e-9), '배치 무게 정규화(합은 그대로)');
  const r2 = await R.trace(job, { N: 1e7, maxMs: 1, minN: 60000, chunkN: 2000, batches: 4 });
  ok(r2.photons >= 60000 && r2.photons < 70000, `minN 이 시간보다 우선: ${r2.photons}`); }
{ // 응답 없는 Worker → 시간 제한 오류(작게 주입)
  const hang = [{ send: async (m) => (m.type === 'scene' ? { ready: true } : new Promise(() => {})) }];
  const R = createAdRunner({ ports: hang, chunkTimeoutMs: 30, sceneTimeoutMs: 30 }), t = Date.now();
  let msg = ''; try { await R.trace({ sceneKey: 'h', scene: { G: { ns: 2, nw: 2 } } }, { N: 5000 }); } catch (e) { msg = e.message; }
  ok(/응답 없음 \(chunk/.test(msg) && Date.now() - t < 1000, `멈춘 Worker → 시간 제한 오류: ${msg}`);
  const R2 = createAdRunner({ ports: [{ send: () => new Promise(() => {}) }], sceneTimeoutMs: 20 });
  msg = ''; try { await R2.trace({ sceneKey: 'h2', scene: { G: { ns: 2, nw: 2 } } }, { N: 5000 }); } catch (e) { msg = e.message; }
  ok(/응답 없음 \(scene/.test(msg), `장면 응답 없음 → 오류: ${msg}`); }
{ // 한 Worker 실패 → 다른 Worker 도 새 청크를 보내지 않음, 첫 오류를 던짐
  const log = [], good = fakePorts(log, 5).slice(0, 2);
  const bad = { send: async (m) => { if (m.type === 'scene') return { ready: true }; log.push('bad:chunk'); throw new Error('Worker 고장'); } };
  const R = createAdRunner({ ports: [...good, bad] });
  let msg = ''; try { await R.trace({ sceneKey: 'f', scene: { G: { ns: 2, nw: 2 } } }, { N: 1e6, chunkN: 1000, batches: 4 }); } catch (e) { msg = e.message; }
  await new Promise((res) => setTimeout(res, 30));
  const n = log.filter((x) => x.endsWith('chunk')).length;
  ok(msg === 'Worker 고장' && n <= 3, `실패 Worker → 첫 오류 · 나머지 중단(청크 ${n}개만 보냄)`); }
{ // 기다리는 중 cancel → 바로 '중지'
  const R = createAdRunner({ ports: [{ send: async (m) => (m.type === 'scene' ? { ready: true } : new Promise(() => {})) }] });
  const p = R.trace({ sceneKey: 'c', scene: { G: { ns: 2, nw: 2 } } }, { N: 5000 }).catch((e) => e.message);
  await new Promise((res) => setTimeout(res, 10)); const t = Date.now(); R.cancel();
  const msg = await p;
  ok(/중지/.test(msg) && Date.now() - t < 200, `대기 중 cancel → 즉시 중지: ${msg}`); }
{ // 같은 난수 비교(crn): 청크 시드·크기·포트·배치가 후보마다 같음 — 두 번 불러도 (포트, 시드, N) 목록이 같고, 시드는 crn 기준부터 차례
  const log = [], ports = Array.from({ length: 3 }, (_, w) => ({ send: async (m) => { if (m.type === 'scene') return { sceneKey: m.sceneKey, ready: true }; log.push(`${w}:${m.seed}:${m.N}`);
    await new Promise((r) => setTimeout(r, (w + 1) * 3));   // 포트 속도가 달라도 분배는 고정
    return { sceneKey: m.sceneKey, acc: new Float64Array(4).fill(m.seed), cnt: new Uint32Array(4), ledger: { emitted: m.N, escaped: 0, absSurf: 0, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 }, leak: {}, escObs: 0, ms: 1 }; } }));
  const R = createAdRunner({ ports }), job = { sceneKey: 'kc', scene: { G: { ns: 2, nw: 2 } } };
  const a = await R.trace(job, { N: 30000, chunkN: 5000, batches: 4, crn: 5000 }); const l1 = [...log].sort(); log.length = 0;
  const b = await R.trace({ ...job, sceneKey: 'kd' }, { N: 30000, chunkN: 5000, batches: 4, crn: 5000 }); const l2 = [...log].sort();
  ok(l1.join() === l2.join() && l1.length === 6 && l1.every((x) => +x.split(':')[1] >= 5000 && +x.split(':')[1] < 5006) && a.batches.map((x) => x[0]).join() === b.batches.map((x) => x[0]).join() && a.photons === 30000,
    `crn: 청크 (포트:시드:N) 같음 — ${l1.join(' ')}`);
}
{ // 광자 수는 정수 — 소수면 GPU 가 'offset is out of bounds' 로 꺼졌음
  const seen = [], ports = fakePorts([]).map((p) => ({ send: (m) => { if (m.type === 'chunk') seen.push(m.N); return p.send(m); } }));
  const G = { ns: 2, nw: 2 }, R = createAdRunner({ ports });
  await R.trace({ sceneKey: 'i', scene: { G, mechParts: [] } }, { N: 1234567.8, batches: 2, maxMs: 1000, minN: 1000 });
  ok(seen.length > 0 && seen.every(Number.isInteger), `청크 광자 수가 모두 정수 (${seen.length}개)`);
}
{ // keepRaw = 점진 계산에 넘길 원자료(광자 수를 곱한 합)
  const R = createAdRunner({ ports: fakePorts([]) }), r = await R.trace({ sceneKey: 'kr', scene: { G: { ns: 2, nw: 2 } } }, { N: 60000, chunkN: 10000, batches: 4, keepRaw: true });
  ok(r.kept.nCell === nCell && r.kept.photons === 60000 && r.kept.batches.reduce((a, b) => a + b.acc[0], 0) === 60000 && r.kept.ledger.emitted === 60000 * 10000 && r.kept.batches.reduce((a, b) => a + b.n, 0) === 6, '원자료 합 = 광자 수');
  const r0 = await R.trace({ sceneKey: 'kr', scene: { G: { ns: 2, nw: 2 } } }, { N: 1000, chunkN: 1000, batches: 1 }); ok(r0.kept === null, '평소에는 원자료 없음'); }
{ // resume = 앞 계산에 이어서: N 은 전체 광자 수 · 모자란 만큼만 새로 추적 · 결과는 처음부터 계산한 것과 같은 크기 · 앞 결과는 그대로
  const log = [], R = createAdRunner({ ports: fakePorts(log) }), job = { sceneKey: 'rs', scene: { G: { ns: 2, nw: 2 } } }, opt = { chunkN: 10000, batches: 4, keepRaw: true };
  const a = await R.trace(job, { N: 20000, ...opt }), a0 = a.kept.batches.map((q) => q.acc[0]);
  log.length = 0;
  const b = await R.trace(job, { N: 60000, ...opt, resume: a.kept });
  ok(log.filter((x) => x.endsWith('chunk')).length === 4 && b.photons === 60000, `모자란 만큼만 추적 (청크 ${log.filter((x) => x.endsWith('chunk')).length}개, 광자 ${b.photons})`);
  const c = await R.trace(job, { N: 60000, ...opt }), sum = (r) => r.batches.reduce((x, B) => x + B[0], 0);
  ok(sum(b) === sum(c) && b.ledger.emitted === c.ledger.emitted && b.batches.length === 4, `이어서 = 처음부터 (${sum(b)} / ${sum(c)}, 방출 ${b.ledger.emitted} / ${c.ledger.emitted})`);
  ok(b.kept.photons === 60000 && b.kept.ledger.emitted === c.kept.ledger.emitted && b.kept.batches.reduce((x, q) => x + q.n, 0) === 6, '인계 원자료도 전체 광자');
  ok(a.kept.photons === 20000 && a.kept.batches.every((q, k) => q.acc[0] === a0[k]), '앞 결과는 바뀌지 않음');
  // 실제 청크처럼 방출 = 광속 1회분(광자 수 무관): 청크 크기가 달라도 효율(지도 합 ÷ 방출)이 그대로여야 함
  const flux = [{ send: async (m) => (m.type === 'scene' ? { ready: true } : { acc: new Float64Array(nCell).fill(0.25), cnt: new Uint32Array(nCell), ledger: { emitted: 1, escaped: 0.5, absSurf: 0, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 }, ms: 1 }) }], RF = createAdRunner({ ports: flux });
  const a1 = await RF.trace(job, { N: 20000, chunkN: 7000, batches: 4, keepRaw: true }), d = await RF.trace(job, { N: 60000, chunkN: 5000, batches: 4, resume: a1.kept }), effOf = (r) => r.batches.reduce((x, B) => x + B.reduce((y, v) => y + v, 0), 0) / r.ledger.emitted;
  ok(Math.abs(effOf(d) - 1) < 1e-12 && d.photons === 60000 && Math.abs(d.ledger.emitted - 12) < 1e-9, `청크 크기가 달라도 효율 그대로 (${effOf(d)}, 방출 ${d.ledger.emitted})`);
  log.length = 0; const e = await R.trace(job, { N: 10000, ...opt, resume: a.kept });
  ok(log.filter((x) => x.endsWith('chunk')).length === 0 && e.photons === 20000, '이미 충분하면 새로 추적 안 함');
  log.length = 0; const f = await R.trace(job, { N: 20000, ...opt, resume: { ...a.kept, nCell: 99 } });
  ok(log.filter((x) => x.endsWith('chunk')).length === 2 && f.photons === 20000, '격자가 다르면 무시하고 처음부터');
  const raw = { nCell: 4 }, from = { raw, sig: 'A', screen: true };
  ok(resumable(from, 'A', true) === raw && resumable(from, 'B', true) === null && resumable(from, 'A', false) === null && resumable({ sig: 'A', screen: true }, 'A', true) === null && resumable(null, 'A', true) === null && resumable({ raw, sig: 'A' }, 'A', false) === raw, '같은 설계 · 같은 격자일 때만 이어서'); }
{ // 일시정지: 새 청크를 보내지 않고, 시계는 멈춘 시간을 빼고, 풀면 이어지며, 멈춘 채 중지할 수 있음
  let t = 0; const log = [], R = createAdRunner({ ports: fakePorts(log), now: () => t }), job = { sceneKey: 'pz', scene: { G: { ns: 2, nw: 2 } } };
  R.pause(); t = 1000; ok(R.paused && R.now() === 0, `멈춘 시간은 시계에서 뺌 (${R.now()})`);
  const pr = R.trace(job, { N: 20000, chunkN: 10000, batches: 2 }); await new Promise((r) => setTimeout(r, 10));
  ok(log.filter((x) => x.endsWith('chunk')).length === 0 && log.some((x) => x.endsWith('scene')), '일시정지 중 청크 없음');
  R.resume(); t = 1500; ok(!R.paused && R.now() === 500, `풀면 시계가 다시 감 (${R.now()})`);
  const r = await pr; ok(r.photons === 20000 && log.filter((x) => x.endsWith('chunk')).length === 2, '풀면 이어서 끝남');
  const R2 = createAdRunner({ ports: fakePorts([]) }); R2.pause(); const p2 = R2.trace(job, { N: 20000, chunkN: 10000, batches: 2 }); await new Promise((r2) => setTimeout(r2, 10)); R2.cancel();
  let msg = ''; try { await p2; } catch (e) { msg = e.message; } ok(/중지/.test(msg), '멈춘 채 중지 가능'); }
{   // GPU 포트는 한 묶음이 클수록 빠름(묶음마다 고정 비용 ~0.7초 실측, 2026-11-15) — 시간 제한 추적에서 GPU 묶음 목표 시간 = CPU 의 4배
  const sizes = { cpu: [], gpu: [] };
  const port = (gpu) => ({ gpu, send: async (m) => {
    if (m.type === 'scene') return { sceneKey: m.sceneKey, ready: true };
    sizes[gpu ? 'gpu' : 'cpu'].push(m.N);
    return { sceneKey: m.sceneKey, acc: new Float64Array(nCell), cnt: new Uint32Array(nCell), ledger: { emitted: m.N, escaped: 0, absSurf: 0, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 }, leak: {}, escObs: 0, ms: m.N / 2, ...(gpu ? { gpu: true } : {}) };   // 둘 다 광자 2개/ms
  } });
  let t = 0; const R = createAdRunner({ ports: [port(false), port(true)], now: () => (t += 1) });
  await R.trace({ sceneKey: 'g', scene: { G: { ns: 2, nw: 2 } } }, { N: 60000, maxMs: 1e9, chunkN: 1e6, chunkMs: 500, batches: 2 });
  ok(Math.max(...sizes.cpu.slice(1)) === 1000 && Math.max(...sizes.gpu.slice(1)) === 4000, `같은 속도면 GPU 묶음이 4배 (CPU ${Math.max(...sizes.cpu.slice(1))} · GPU ${Math.max(...sizes.gpu.slice(1))})`);
}
{   // 빠른 검토(2026-11-15): 첫 묶음 크기를 정해 줌(firstN) — 느린 장면(Milky 높음)에서 첫 묶음이 시간 한도를 넘지 않게. 한도가 지나면 최소 광자 수 없이 멈춤
  const sizes = [];
  const port = () => ({ send: async (m) => {
    if (m.type === 'scene') return { sceneKey: m.sceneKey, ready: true };
    sizes.push(m.N); t += 6000;   // 묶음 하나가 6초
    return { sceneKey: m.sceneKey, acc: new Float64Array(4), cnt: new Uint32Array(4), ledger: { emitted: m.N, escaped: 0, absSurf: 0, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 }, leak: {}, escObs: 0, ms: 6000 };
  } });
  let t = 0; const R = createAdRunner({ ports: [port(), port()], now: () => t });
  const r = await R.trace({ sceneKey: 'q', scene: { G: { ns: 2, nw: 2 } } }, { N: 5e6, maxMs: 10000, minN: 0, firstN: 2000, batches: 2 });
  ok(sizes[0] === 2000 && sizes[1] === 2000, `첫 묶음 = firstN (${sizes.slice(0, 2)})`);
  ok(r.photons < 20000 && sizes.length <= 4, `시간 한도에서 멈춤 (광자 ${r.photons} · 묶음 ${sizes.length})`);
}
{   // 빠른 검토(2026-11-15 사용자): 오차가 충분히 작아지면(until) 시간 한도 전에 멈춤 — 배치마다 묶음이 하나씩 들어온 뒤, untilMs 간격으로만 물어봄
  let t = 0, asked = 0, lens = [];
  const port = () => ({ send: async (m) => {
    if (m.type === 'scene') return { sceneKey: m.sceneKey, ready: true };
    t += 1000;
    return { sceneKey: m.sceneKey, acc: new Float64Array(4).fill(1), cnt: new Uint32Array(4), ledger: { emitted: m.N, escaped: 0, absSurf: 0, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 }, leak: {}, escObs: 0, ms: 1000 };
  } });
  const R = createAdRunner({ ports: [port()], now: () => t });
  const r = await R.trace({ sceneKey: 'u', scene: { G: { ns: 2, nw: 2 } } }, { N: 5e6, maxMs: 60000, minN: 0, firstN: 1000, batches: 2, untilMs: 2000, until: (bs) => { asked++; lens.push(bs.length); return asked >= 3; } });
  ok(r.ms < 60000 && r.ms >= 6000 && r.ms <= 8000, `오차 기준에 닿으면 한도 전에 멈춤 (${r.ms} ms)`);
  ok(asked === 3 && lens.every((n) => n === 2), `2초 간격으로만 확인 · 배치가 다 찬 뒤 (${asked}회 · 배치 ${lens})`);
  t = 0; asked = 0;
  const r2 = await R.trace({ sceneKey: 'u', scene: { G: { ns: 2, nw: 2 } } }, { N: 5e6, maxMs: 10000, minN: 0, firstN: 1000, batches: 2, untilMs: 2000, until: () => { asked++; return false; } });
  ok(r2.ms >= 10000 && r2.ms <= 12000 && asked >= 3, `기준에 못 닿으면 시간 한도까지 (${r2.ms} ms · 확인 ${asked}회)`);
}
{ // 2026-11-18 다른 PC: 최종 판정 중 GPU 가 멈추면 큰 GPU 묶음(최대 160만)을 CPU 가 통째로 돌려 'Worker 응답 없음 (chunk 90초)' — 화면 계산처럼 cpuMax 를 보내고
  // gpuRetry 가 오면 그 묶음은 세지 않고 CPU 크기로 이어 감
  let t = 0, gpuOn = true; const got = [];
  const port = { gpu: true, send: async (m) => { if (m.type === 'scene') return { sceneKey: m.sceneKey, ready: true };
    got.push({ N: m.N, cpuMax: m.cpuMax, gpu: gpuOn });
    if (gpuOn && got.length === 3) { gpuOn = false; return { sceneKey: m.sceneKey, gpuRetry: true }; }   // 세 번째 묶음 중 GPU 꺼짐
    t += gpuOn ? m.N / 1000 : m.N / 50;
    return { sceneKey: m.sceneKey, acc: new Float64Array(4).fill(1), cnt: new Uint32Array(4), ledger: { emitted: m.N, escaped: 0, absSurf: 0, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 }, leak: {}, escObs: 0, ms: gpuOn ? m.N / 1000 : m.N / 50, ...(gpuOn ? { gpu: true } : {}) }; } };
  const R = createAdRunner({ ports: [port], now: () => t }), r = await R.trace({ sceneKey: 'g', scene: { G: { ns: 2, nw: 2 } } }, { N: 3e6, maxMs: 60000, minN: 1.5e6, chunkN: 2e5, batches: 2 });
  const afterOff = got.slice(3), big = got[2];
  ok(got.every((g) => g.cpuMax === 1000), `묶음마다 CPU 한도 = 최소 묶음 1000 전달 (${got[0].cpuMax}) — GPU 가 꺼지면 어떤 묶음이든 돌려보내 CPU 속도로 다시 잼(2026-11-21)`);
  ok(big.N > 2e5 && afterOff.length > 0 && afterOff.every((g) => g.N <= 2e5), `GPU 꺼진 뒤 CPU 묶음 ≤ 20만 (꺼질 때 묶음 ${big.N} · 뒤 최대 ${Math.max(...afterOff.map((g) => g.N))})`);
  ok(r.photons === got.filter((g, i) => i !== 2).reduce((a, g) => a + g.N, 0), `돌려보낸 묶음은 광자 수에 안 셈 (${r.photons})`);
}
{ // 2026-11-21 사용자 오류 'Worker 응답 없음 (chunk 90초)' — LED 58개 재확인(높은 Milky): GPU 가 20만 이하 묶음에서 꺼지면 그 묶음을 CPU 가 통째로 돌려
  // (CPU 는 높은 Milky 에서 ~2천 광자/초 → 20만 = 100초) 제한 시간을 넘김. CPU 한도 = 최소 묶음 → 돌려받고 CPU 속도로 묶음 크기를 다시 정함
  const { makeChunkHost } = await import('../src/engine/mech3d/chunk-host.js');
  let t = 0, gpuOn = true, n = 0; const got = [];
  const port = { send: async (m) => { if (m.type === 'scene') return { sceneKey: m.sceneKey, ready: true };
    n++;
    if (gpuOn && n === 2) { gpuOn = false; if (m.cpuMax > 0 && m.N > m.cpuMax) { got.push({ N: m.N, gpu: true, retry: true }); return { sceneKey: m.sceneKey, gpuRetry: true }; } }   // 둘째 묶음 중 GPU 꺼짐(chunk-host 와 같은 규칙)
    got.push({ N: m.N, gpu: gpuOn });
    const ms = gpuOn ? m.N / 100 : m.N / 2; t += ms;   // GPU 10만/초 · CPU 2천/초
    return { sceneKey: m.sceneKey, acc: new Float64Array(4).fill(1), cnt: new Uint32Array(4), ledger: { emitted: m.N, escaped: 0, absSurf: 0, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 }, leak: {}, escObs: 0, ms, ...(gpuOn ? { gpu: true } : {}) }; } };
  const R = createAdRunner({ ports: [port], now: () => t });
  await R.trace({ sceneKey: 'h', scene: { G: { ns: 2, nw: 2 } } }, { N: 2e6, maxMs: 120000, minN: 0, firstN: 1000, batches: 2 });   // chunkN 기본(= N/2 = 100만)
  const cpuMs = got.filter((g) => !g.gpu).map((g) => g.N / 2);
  ok(cpuMs.length > 0 && Math.max(...cpuMs) < 90000 / 4, `GPU 꺼진 뒤 CPU 묶음 하나 ≤ 제한 시간의 ¼ (최대 ${Math.max(...cpuMs) / 1000}초 · 꺼질 때 묶음 ${got[1].N})`);
  void makeChunkHost;
}
done();
