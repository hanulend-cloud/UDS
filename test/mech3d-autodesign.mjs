// P4 단계 실행기(가짜 io): node test/mech3d-autodesign.mjs
import { lateralCoarse, lateralFine, pickLateral, runAutoDesign, shapeScore, halving, smoothU, halvingTotal, sameDesign, screenShapeVars, shapeTotal, pickVariant, refineShapeCurve, refineShapeField, fieldError, fieldResponse, ledPhase, shapeModes, foldMap, solveBox, solveShapeModes, curveDirection, shapeSize } from '../src/engine/mech3d/autodesign.js';
import { shapeVarRanges, gridCandidates, curveAt } from '../src/engine/mech3d/shape-opt.js';
import { candidateGrid } from '../src/engine/mech3d/basis.js';
import { milkyRows } from '../src/engine/mech3d/milky-search.js';
import { ok, done } from './mech3d-util.mjs';

const obs = { targetLen: 0.8, targetWid: 0.6 };
const st = (Ulen, Uwid) => ({ Ulen, Uwid, empty: false });
// 가짜 재가중 행: U(m) = 0.5 + 0.12·m → 목표 0.8 경계 = Milky 2.5 (창 = 기준 ±0.25)
const rowsOf = (ms, U = (m) => 0.5 + 0.12 * m) => ms.map((m) => ({ milky: m, Ulen: U(m), Uwid: 0.9, eff: 1 - m / 20, ess: 1, trusted: true, margin: Math.min(U(m) - 0.8, 0.3) }));
{ // ① 만: 거친 탐색 0.5 → 1.5 → 2.5(창 안에 경계 2.5) → 그 창만 정밀 확인 → 최종 검증
  const bases = [], precise = [], calls = [];
  const io = { milkyRows: async (d, ms, o) => { (o?.precise ? precise : bases).push(ms[10]); return rowsOf(ms); }, verify: async (d) => { calls.push(d.milky); return { stats: st(0.81, 0.9), eff: 1 - d.milky / 20 }; }, progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 3, count: 5, pitch: 0, shape: null }, milkyMax: 5 }, io);
  ok(r.feasible && Math.abs(r.best.milky - 2.5) < 0.03 && calls.at(-1) === r.best.milky && bases.join() === '0.5,1.5,2.5', `① 거친 탐색: 기준 ${bases.map((b) => b.toFixed(2)).join(' → ')} → 최소 Milky ${r.best.milky}`);
  ok(precise.length === 1 && precise[0] === bases.at(-1) && r.steps.at(-1).precise, `경계가 든 창(기준 ${precise[0]?.toFixed(2)})만 정밀 재추적`);
  ok(calls.length === 2 && calls[0] === 3 && r.current.stats.Ulen === 0.81, '현재안을 먼저 같은 추정기(verify)로 계산 → r.current'); }
{ // cfg.currentVerified(수렴한 점진 결과) → 현재안 verify 생략
  const calls = [], cv = { stats: st(0.81, 0.9), eff: 0.95 };
  const io = { milkyRows: async (d, ms) => rowsOf(ms), verify: async (d) => { calls.push(d.milky); return { stats: st(0.81, 0.9), eff: 1 - d.milky / 20 }; }, progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 3, count: 5, pitch: 0, shape: null }, milkyMax: 5, currentVerified: cv }, io);
  ok(calls.length === 1 && calls[0] !== 3 && r.current === cv, `현재안 재사용 → verify 는 최종안만 (${calls})`); }
{ // 오르는 구간 할선: 경계 3.0 — 거친 2.5 미달 · 3.5 창 전체 통과 → [2.75, 3.25] 할선 근 3.0 → 창 하나로 끝
  const bases = [], U = (m) => 0.8 + 0.1 * (m - 3.0);
  const io = { milkyRows: async (d, ms, o) => { if (!o?.precise) bases.push(ms[10]); return rowsOf(ms, U); }, verify: async (d) => ({ stats: st(U(d.milky), 0.9), eff: 1 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 4.9 }, milkyMax: 5 }, io);
  const m = r.steps.filter((x) => x.stage === 'milky').at(-1).pick.milky;
  ok(bases.length === 5 && Math.abs(bases.at(-1) - 3) < 1e-6 && Math.abs(m - 3) < 0.03, `할선 재기준: ${bases.map((b) => b.toFixed(2)).join(' → ')} (경계 ${m})`); }
{ // 상한까지 미달(U 가 천천히 오름) → 가장 가까운 안 = 상한 근처 + 상한 안내
  const io = { milkyRows: async (d, ms) => rowsOf(ms, (m) => 0.6 + 0.01 * m), verify: async (d) => ({ stats: st(0.6 + 0.01 * d.milky, 0.9), eff: 1 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 3 }, milkyMax: 5 }, io);
  ok(!r.feasible && /상한\(5\)/.test(r.reason) && r.best.milky >= 4.9, `불가: ${r.reason}`); }
{ // 여유가 Milky 와 함께 오르지만 상한까지 미달 → 가장 가까운 안 = 모든 기준 중 여유 최대 행(상한 근처), 사유도 그 Milky
  const io = { milkyRows: async (d, ms) => ms.map((m) => ({ milky: m, Ulen: 0.5 + 0.05 * m, Uwid: 0.9, eff: 1, ess: 1, trusted: true, margin: 0.05 * m - 0.3 })), verify: async (d) => ({ stats: st(0.5 + 0.05 * d.milky, 0.9), eff: 1 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 2 }, milkyMax: 5 }, io);
  const top = Math.max(...r.steps.flatMap((x) => x.rows.map((w) => w.milky)));
  ok(!r.feasible && r.best.milky === top && top >= 4.9 && new RegExp(`Milky ${top}에서도`).test(r.reason), `가장 가까운 안 = 상한 근처 Milky ${r.best.milky}: ${r.reason}`); }
{ // milkyRows 최저 위치(dark): 길이 = 프로파일 최저 칸, 폭 = 최악 창의 폭 프로파일 최저 칸 — 유효 범위 안 0~1
  const ns = 10, nw = 5, G = { ns, nw, ds: 1, cell: 1, closed: false, winS: 5, area: new Float64Array(ns * nw).fill(1), valid: new Uint8Array(ns * nw).fill(1) };
  const v = (i, j) => (i === 9 ? 0.5 : 1) * (j === 2 ? 0.7 : 1), a = Float64Array.from({ length: ns * nw }, (_, k) => v(Math.floor(k / nw), k % nw));
  const [r] = milkyRows(G, { targetLen: 0.8, targetWid: 0.6 }, { milkies: [3], batches: [a, a, a], ess: [1], emitted: 1 });
  ok(Math.abs(r.dark.len - 1) < 1e-9 && Math.abs(r.dark.wid - 0.5) < 1e-9, `dark: 길이 ${r.dark.len} · 폭 ${r.dark.wid}`); }
// 단봉형 U(Milky) — 최고점 4 · 행에 최저 위치(dark: 길이·폭 0~1) 를 실음
const peakRows = (ms, top, { len = 0.5, wid = 0.5, Uw = () => 0.9 } = {}) => ms.map((m) => { const Ulen = top - 0.05 * (m - 4) ** 2, Uwid = Uw(m);
  return { milky: m, Ulen, Uwid, eff: 1 - m / 12, ess: 1, trusted: true, margin: Math.min(Ulen - 0.8, Uwid - 0.6), dark: { len, wid } }; });
{ // 단봉형·통과: 최소 통과 Milky 는 오르는 쪽(3.0) — 최고점(4) 너머(5.0) 가 아님
  const bases = [], U = (m) => 0.85 - 0.05 * (m - 4) ** 2;   // verify +0.001: 경계 3.0 의 부동소수 0.7999… 가 정밀 판정에서 미달로 잡히지 않게
  const io = { milkyRows: async (d, ms, o) => { if (!o?.precise) bases.push(ms[10]); return peakRows(ms, 0.85); }, verify: async (d) => ({ stats: st(U(d.milky ?? 1) + 0.001, 0.9), eff: 1 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 1 } }, io);
  ok(r.feasible && Math.abs(r.best.milky - 3) < 0.03 && Math.max(...bases) <= 3.5 + 1e-9, `단봉형 통과 → 최소 Milky ${r.best.milky} (기준 ${bases.map((b) => b.toFixed(2)).join(' → ')})`); }
{ // 단봉형·미달(길이 끝단이 가장 어두움) → 최고점 Milky ≈ 4 · '가장자리 감쇠' · 거친 탐색은 최고점 뒤 두 번 내려가면 멈춤
  const bases = [], precise = [], U = (m) => 0.75 - 0.05 * (m - 4) ** 2;
  const io = { milkyRows: async (d, ms, o) => { (o?.precise ? precise : bases).push(ms[10]); return peakRows(ms, 0.75, { len: 0.03 }); }, verify: async (d) => ({ stats: st(U(d.milky ?? 1), 0.9), eff: 1 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 1 } }, io);
  ok(!r.feasible && Math.abs(r.best.milky - 4) < 0.1 && /가장자리 감쇠/.test(r.reason) && /길이/.test(r.reason) && /Milky 4에서도/.test(r.reason), `미달 → 최고점 Milky ${r.best.milky}: ${r.reason}`);
  ok(bases.length <= 8 && Math.max(...bases) < 9 && precise.length <= 2, `최고점 뒤 조기 중단: 거친 ${bases.length}개(${bases.join(' ')}) · 정밀 ${precise.length}개`); }
{ // 단봉형·미달(폭이 막고 최저 위치가 가운데) → 'LED 리플' · ④ 보완 계산(housingProbe) 결과를 사유·hint 에
  const probe = { part: 1, kind: 'whiteDiffuse', R: 0.9 }, calls = [];
  const io = { milkyRows: async (d, ms) => peakRows(ms, 0.9, { wid: 0.5, len: 0.02, Uw: (m) => 0.55 - 0.01 * (m - 4) ** 2 }),
    evalVariants: async (d, cs, N) => { calls.push({ milky: d.milky, cs, N }); return cs.map((c) => ({ cand: c, ok: true, stats: st(0.93, 0.62), eff: 0.4 })); },
    verify: async (d) => ({ stats: st(0.9, 0.55 - 0.01 * ((d.milky ?? 1) - 4) ** 2), eff: 1 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 1 }, housingProbe: probe, finishText: (f) => `백색 ${Math.round(f.R * 100)}%` }, io);
  ok(!r.feasible && /LED 리플/.test(r.reason) && /폭/.test(r.reason) && !/가장자리 감쇠/.test(r.reason), `폭 한계 · 리플: ${r.reason}`);
  ok(calls.length === 1 && calls[0].cs[0].finish === probe && calls[0].N === 3e5 && Math.abs(calls[0].milky - r.best.milky) < 1e-9 && r.hint?.Ulen === 0.93 && r.hint?.Uwid === 0.62 && r.hint.finish === probe
    && /케이스 백색 90% 를 함께 쓰면 나아짐/.test(r.reason) && !/④/.test(r.reason) && !/와 함께 쓰면 길이 균일도/.test(r.reason), `보완 계산 1회 → ${r.reason}`); }
{ // 최적화 = Milky 5 까지(2026-11-05). 5 초과는 참고 계산만 — 단계 기록(Milky 표)·추천에 안 들어감
  const seen = [], U = (m) => 0.5 + 0.02 * m;
  const io = { milkyRows: async (d, ms) => { seen.push(...ms); return rowsOf(ms, U); }, verify: async (d) => ({ stats: st(U(d.milky ?? 1), 0.9), eff: 1 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 1 } }, io);
  const inSteps = r.steps.flatMap((x) => (x.rows ?? []).map((q) => q.milky));
  ok(!r.feasible && r.best.milky <= 5 && r.best.milky >= 4.7 && Math.max(...inSteps) <= 5 && /상한\(5\)/.test(r.reason), `① 만 상한 5: Milky ${r.best.milky} · ${r.reason}`);
  ok(r.peek?.best?.milky === 8 && r.peek.rows.map((q) => q.milky).join() === '6,7,8' && Math.max(...seen) < 9, `참고 계산 6·7·8 → Milky ${r.peek?.best?.milky} U ${r.peek?.best?.Ulen}`);
  let basisMilky = null; seen.length = 0;
  const G = { ns: 2, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 2, closed: false, winS: 5, area: new Float64Array([1, 1]), valid: new Uint8Array([1, 1]) };
  const io2 = { ...io, basis: async (d) => { basisMilky = d.milky; return { cand: [0, 1, 2], maps: [0, 1, 2].map(() => Float32Array.from([1, 1])), emitted: 1 }; } };
  await runAutoDesign({ stages: { milky: true, leds: true }, obs: { targetLen: 0.8, targetWid: 0 }, current: { milky: 3, count: 5, pitch: 0 }, G, line: { length: 2, closed: false }, nMax: 4 }, io2);
  ok(basisMilky >= 4.7 && basisMilky <= 5, `②+①: ② 기준 Milky ${basisMilky}(거친 최고점 ≤ 5)`); }
{ // 최고점이 5 안에 있으면(이미 하락) 5 초과는 계산하지 않고 '오르지 않음'
  const seen = [], U = (m) => 0.7 - 0.02 * (m - 3) ** 2;
  const io = { milkyRows: async (d, ms) => { seen.push(...ms); return rowsOf(ms, U); }, verify: async (d) => ({ stats: st(U(d.milky ?? 1), 0.9), eff: 1 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 1 } }, io);
  ok(!r.feasible && Math.max(...seen) <= 5 && r.peek && !r.peek.best && !r.peek.rows.length, `최고점 ${r.best.milky} ≤ 5 → 추가 계산 없음(본 Milky 최대 ${Math.max(...seen)})`); }
{ // 5 보다 높여도 나빠지면: 한 칸 보고 멈춤 · 이득 없음
  const seen = [], U = (m) => (m <= 5 ? 0.5 + 0.04 * m : 0.7 - 0.05 * (m - 5));
  const io = { milkyRows: async (d, ms) => { seen.push(...ms); return rowsOf(ms, U); }, verify: async (d) => ({ stats: st(U(d.milky ?? 1), 0.9), eff: 1 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 1 } }, io);
  ok(r.peek && !r.peek.best && r.peek.rows.length === 1 && r.peek.rows[0].milky === 6, `5 초과에서 하락 → Milky 6 만 보고 이득 없음(${r.peek?.rows.map((q) => q.milky)})`); }
{ // 목표 통과면 참고 계산 없음
  const seen = [];
  const io = { milkyRows: async (d, ms) => { seen.push(...ms); return rowsOf(ms); }, verify: async () => ({ stats: st(0.81, 0.9), eff: 1 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 1 } }, io);
  ok(r.feasible && !r.peek && Math.max(...seen) <= 5, '목표 통과 → 참고 계산 없음'); }
{ // 현재 Milky 7 + 위치(②)만: '현재' 열은 7 로 계산, 최적화는 5 로 낮춰서 · 적용 안은 Milky 5 · 표시
  let basisMilky = null; const verified = [];
  const G = { ns: 2, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 2, closed: false, winS: 5, area: new Float64Array([1, 1]), valid: new Uint8Array([1, 1]) };
  const io = { basis: async (d) => { basisMilky = d.milky; return { cand: [0, 1, 2], maps: [0, 1, 2].map(() => Float32Array.from([1, 1])), emitted: 1 }; }, milkyRows: async () => { throw new Error('Milky 탐색 금지'); },
    verify: async (d) => { verified.push(d.milky); return { stats: d.milky === 7 ? st(0.5, 0.5) : st(0.9, 0.9), eff: 1 }; }, progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.8, targetWid: 0 }, current: { milky: 7, count: 5, pitch: 0 }, G, line: { length: 2, closed: false }, nMax: 4 }, io);
  ok(verified[0] === 7 && basisMilky === 5 && r.best.milky === 5 && r.milkyLowered?.from === 7 && r.milkyLowered?.to === 5 && r.milkyLowered?.rough === true && r.current.stats.Ulen === 0.5, `현재 7 → 최적화 ${basisMilky} · 최종 ${r.best.milky} · 표시 ${JSON.stringify(r.milkyLowered)}`); }
{ // 현재 Milky 7 인데 낮춘 안이 더 나쁘면 현재안 유지(몰래 안 바꿈) · 표시는 남음
  const G = { ns: 2, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 2, closed: false, winS: 5, area: new Float64Array([1, 1]), valid: new Uint8Array([1, 1]) };
  const io = { basis: async () => ({ cand: [0, 1, 2], maps: [0, 1, 2].map(() => Float32Array.from([1, 1])), emitted: 1 }), verify: async (d) => ({ stats: d.milky === 7 ? st(0.9, 0.9) : st(0.5, 0.5), eff: 1 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.8, targetWid: 0 }, current: { milky: 7, count: 5, pitch: 0 }, G, line: { length: 2, closed: false }, nMax: 4 }, io);
  ok(r.unchanged && r.best.milky === 7 && r.milkyLowered?.from === 7, `낮춘 안이 나쁨 → 현재안 Milky ${r.best.milky} 유지`); }
{ // 현재 Milky 7 은 비교용 — 계산마다 60 초 한도, 목표 근처여도 더 안 잼(낮춘 안은 한도 없음)
  const calls = [], G = { ns: 2, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 2, closed: false, winS: 5, area: new Float64Array([1, 1]), valid: new Uint8Array([1, 1]) };
  const io = { basis: async () => ({ cand: [0, 1, 2], maps: [0, 1, 2].map(() => Float32Array.from([1, 1])), emitted: 1 }), verify: async (d, o = {}) => { calls.push([d.milky, o.maxMs ?? null, !!o.screen, o.noise ?? null, !!o.rough]); return { stats: { ...st(0.8, 0.9), relNoise: 0.01 }, eff: 1, screen: !!o.screen }; }, progress() {}, cancelled: () => false };
  await runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.8, targetWid: 0 }, current: { milky: 7, count: 5, pitch: 0 }, G, line: { length: 2, closed: false }, nMax: 4, screenGrid: true }, io);
  const c7 = calls.filter((c) => c[0] === 7);
  ok(c7.length >= 2 && c7.every((c) => c[1] === 60000 && c[4]) && calls.some((c) => c[0] === 5 && c[1] == null && !c[4]), `현재 Milky 7 = 대략 계산 60 초 한도: ${JSON.stringify(calls)}`); }
{ // 현재 5 이하 → 표시 없음
  const io = { milkyRows: async (d, ms) => rowsOf(ms), verify: async () => ({ stats: st(0.81, 0.9), eff: 1 }), progress() {}, cancelled: () => false };
  ok(!(await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 5 } }, io)).milkyLowered, '현재 Milky 5 → 낮춤 표시 없음'); }
{ // ②+①: 후보 지도는 Milky 상한(5)에서 추적, 최소 개수 뒤 ① 이 Milky 를 낮춤
  let basisMilky = null;
  const G = { ns: 2, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 2, closed: false, winS: 5, area: new Float64Array([1, 1]), valid: new Uint8Array([1, 1]) };
  const io = { basis: async (d) => { basisMilky = d.milky; return { cand: [0, 1, 2], maps: [0, 1, 2].map(() => Float32Array.from([1, 1])), emitted: 1 }; }, milkyRows: async (d, ms) => rowsOf(ms), verify: async () => ({ stats: st(0.9, 0.9), eff: 1 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true, leds: true }, obs: { targetLen: 0.8, targetWid: 0 }, current: { milky: 3, count: 5, pitch: 0 }, milkyMax: 5, G, line: { length: 2, closed: false }, nMax: 4 }, io);
  ok(basisMilky >= 4.7 && basisMilky <= 5 && r.best.count === 1 && Math.abs(r.best.milky - 2.5) < 0.03, `②: 기준 ${basisMilky}(U 단조 → 상한 근처) 에서 최소 ${r.best.count}개 → ① Milky ${r.best.milky}`); }
{ // 단계적 압축: 27 → 6 → 2 → 1, 각 단계 광자 수 증가
  const seen = [];
  const evalFn = async (cands) => { return cands.map((c) => ({ cand: c, stats: st(0.7 + c.k / 100, 0.9), eff: 0.5 + c.k / 1000, ok: c.k !== 26 })); };
  const evalFn2 = async (cands, N, ms) => { seen.push([cands.length, N, ms]); return evalFn(cands, N); };
  const best = await halving(Array.from({ length: 27 }, (_, k) => ({ k })), evalFn2, obs, [[27, 6e4, 2500], [6, 2e5, 4000], [2, 6e5, 6000]]);
  ok(seen.map((x) => x.join(':')).join(',') === '27:60000:2500,6:200000:4000,2:600000:6000' && best.cand.k === 25, `압축 27→6→2(광자·시간 제한 단계별): 최고 k=${best.cand.k}(제약 위반 26 제외)`);
  ok(shapeScore({ stats: st(0.85, 0.7), eff: 0.4, ok: true }, obs) > shapeScore({ stats: st(0.79, 0.9), eff: 0.9, ok: true }, obs), '점수: 목표 만족이 우선, 그다음 효율'); }
{ // 평활 길이 균일도: 3행 이동평균 — 한 칸 노이즈 골짜기에 덜 민감, profile 없으면 Ulen
  const prof = Float64Array.from([1, 1, 1, 0.4, 1, 1, NaN, 1]);
  const u = smoothU({ profile: prof, Ulen: 0.4 });
  ok(Math.abs(u - 0.8) < 1e-9, `smoothU: 골짜기 0.4 → 이동평균 ${u.toFixed(3)} (= 0.8)`);
  ok(smoothU({ Ulen: 0.55 }) === 0.55, 'profile 없음 → Ulen');
  const noisy = { stats: { Ulen: 0.4, Uwid: 0.9, profile: prof }, eff: 0.5, ok: true };
  ok(Math.abs(shapeScore(noisy, obs) - 0.8 / 0.8) < 1e-9, '미달안 점수 = 평활 길이 균일도 / 목표'); }
{ // ③ 최적 후보가 전부 0(R 무관) → shape = null(빈 shapeMod 없음) → 현재안 그대로
  const cur = { milky: 3, count: 5, pitch: 0, shape: null }, calls = [];
  const cands = [{ dt: 0, h: 0, R: 2.75, e: 0, c: 0 }, { dt: 0.2, h: 0, R: 2.75, e: 0, c: 0 }];
  const io = { evalShapes: async (d, cs) => cs.map((c) => ({ cand: c, stats: st(c.dt ? 0.7 : 0.9, 0.9), eff: 0.6, ok: true })),
    verify: async (d) => { calls.push(d.shape); return { stats: st(0.9, 0.9), eff: 0.6 }; }, progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { shape: true }, obs, current: cur, shapePart: 0, shapeCands: cands }, io);
  ok(r.best.shape === null && r.unchanged && calls.length === 1, `영 형상 후보 → shape null, 현재안 유지 (verify ${calls.length}회)`); }
{ // ③ 최적안이 검증에서 현재안보다 나쁨 → 현재안 유지 + 사유, 시도안은 steps 에
  const cur = { milky: 3, count: 5, pitch: 0, shape: null };
  const io = { evalShapes: async (d, cands) => cands.map((c) => ({ cand: c, stats: st(0.9, 0.9), eff: 0.6, ok: true })),
    verify: async (d) => (d.shape ? { stats: st(0.69, 0.9), eff: 0.6 } : { stats: st(0.75, 0.9), eff: 0.6 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { shape: true }, obs, current: cur, shapePart: 0, shapeCands: [{ dt: -1, h: -1, R: 9 }] }, io);
  const g = r.steps.find((x) => x.stage === 'guard');
  ok(r.best.shape === null && r.unchanged && r.reason === '현재안보다 나은 설계를 찾지 못함 — 현재안 유지' && !r.feasible && r.verified.stats.Ulen === 0.75, `현재안 유지: ${r.reason}`);
  ok(g && g.tried.shape.dt === -1 && g.triedVerified.stats.Ulen === 0.69, '시도한 최적안·검증값은 steps(guard)에'); }
{ // ① 도 같음: 노이즈로 고른 Milky 가 현재안과 같은 수준(차 < 0.01) → 현재안 유지(현재 통과면 feasible)
  const io = { milkyRows: async (d, ms) => rowsOf(ms), verify: async () => ({ stats: st(0.85, 0.9), eff: 0.8 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 3, count: 5, pitch: 0, shape: null }, milkyMax: 5 }, io);
  ok(r.best.milky === 3 && r.unchanged && r.feasible && /현재안 유지/.test(r.reason), `① 이득 없음 → 현재 Milky ${r.best.milky} 유지`); }
{ // 중지
  const io = { milkyRows: async () => { throw new Error('불리면 안 됨'); }, progress() {}, cancelled: () => true };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 3 } }, io);
  ok(r.cancelled === true, '중지 → cancelled'); }
{ // 현재안 유지 문구에 단계 이유를 남김 · 최종 문구는 정밀 재계산 값
  const G = { ns: 2, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 2, closed: false, winS: 5, area: new Float64Array([1, 1]), valid: new Uint8Array([1, 1]) };
  const io = { basis: async () => ({ cand: [0, 1, 2], maps: [Float32Array.from([1, 0.1]), Float32Array.from([1, 0.1]), Float32Array.from([1, 0.1])], emitted: 1 }), verify: async () => ({ stats: { Ulen: 0.5, Uwid: null, empty: false }, eff: 0.5 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.9, targetWid: 0 }, current: { milky: 3, count: 1, pitch: 0 }, G, line: { length: 2, closed: false }, nMax: 2 }, io);
  ok(r.unchanged && /LED 2개까지 늘려도 목표 미달/.test(r.reason), `현재안 유지 + 단계 이유: ${r.reason}`); }
{ // LED STEP ②: 원래 STEP 과 개수가 같아도(1개·균등) ② 는 가상 배치를 점수 매김 → 현재안과 다른 설계(stepVirt)
  const G = { ns: 2, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 2, closed: false, winS: 5, area: new Float64Array([1, 1]), valid: new Uint8Array([1, 1]) }, seen = [];
  const io = { basis: async () => ({ cand: [0, 1, 2], maps: [0, 1, 2].map(() => Float32Array.from([1, 1])), emitted: 1 }), verify: async (d) => { seen.push(!!d.stepVirt); return { stats: st(d.stepVirt ? 0.95 : 0.7, 0.9), eff: 1 }; }, progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { leds: true }, stepMode: true, obs: { targetLen: 0.8, targetWid: 0 }, current: { milky: 3, count: 1, pitch: 0, stepVirt: false }, G, line: { length: 2, closed: false }, nMax: 3 }, io);
  ok(!r.unchanged && r.best.count === 1 && r.best.stepVirt === true && seen.join() === 'false,true', `STEP ② 같은 개수 → 가상안 검증·추천 (${seen})`);
  ok(!sameDesign({ count: 1, pitch: 0, stepVirt: true }, { count: 1, pitch: 0 }) && sameDesign({ count: 1, pitch: 0, stepVirt: false }, { count: 1, pitch: 0 }), 'sameDesign: stepVirt 비교(없음 = false)'); }
{ // ③ 2단계: 선별(변수별 lo/hi) → 선택 변수 격자 halving
  const rg = shapeVarRanges({ t0: 2, pitch: 5, hasCenters: false }), cur = { milky: 3, count: 5, pitch: 0, shape: null };
  const mk = (gain, seen = []) => async (d, cands) => { seen.push(cands.map((c) => ({ ...c }))); return cands.map((c) => ({ cand: c, stats: st(0.6 + gain(c), 0.9), eff: 0.5, ok: true })); };
  const seen = [], plans = [];
  const io = { evalShapes: mk((c) => (c.c > 0 ? 0.3 : 0), seen), verify: async (d) => ({ stats: st(d.shape?.c > 0 ? 0.9 : 0.6, 0.9), eff: 0.5 }), progress() {}, shapePlan: (p) => plans.push(p), cancelled: () => false };
  const r = await runAutoDesign({ stages: { shape: true }, obs, current: cur, shapePart: 0, shapeRanges: rg }, io);
  const sc = r.steps.find((x) => x.stage === 'shapeScreen');
  ok(sc.vars.join() === 'c' && seen[0].length === 13 && seen[1].length === 5 && seen[1].some((c) => c.c === 0 && c.dt === 0), `선별 → ['c'], 선별 13개(끝값+½) · 격자 5개(변수 1개 = 5단계, 현재 포함): ${sc.vars}`);
  ok(r.best.shape.c > 0 && !r.unchanged && plans.at(-1).total === shapeTotal(13, 5) + 18, `최종 형상 c=${r.best.shape?.c}, 분모 ${plans.at(-1)?.total}`);
  const io2 = { ...io, evalShapes: mk(() => 0), verify: async () => ({ stats: st(0.75, 0.9), eff: 0.5 }) };
  const r2 = await runAutoDesign({ stages: { shape: true }, obs, current: cur, shapePart: 0, shapeRanges: rg }, io2);
  ok(r2.unchanged && r2.best.shape === null && r2.reason === '형상 변수의 효과가 노이즈 수준 — 현재 형상 유지', `효과 없음 → 현재안 유지: ${r2.reason}`); }
{ // h 선별 → R 도 격자에 포함 (R 은 선별 후보에 안 나옴)
  const rg = shapeVarRanges({ t0: 2, pitch: 5, hasCenters: true }), seen = [];
  const evalFn = async (cands) => { seen.push(cands); return cands.map((c) => ({ cand: c, stats: st(0.6 + (c.h > 0 ? 0.3 : 0), 0.9), eff: 0.5, ok: true })); };
  const sc = await screenShapeVars(evalFn, rg, obs);
  ok(sc.vars.join() === 'h' && seen[0].length === 17 && seen[0].every((c) => c.R === 2.75), `h 선별(선별 17개(R 은 h 와 묶음), R=mid): ${sc.vars}`);
  const io = { evalShapes: (d, c, N) => evalFn(c), verify: async (d) => ({ stats: st(d.shape?.h > 0 ? 0.9 : 0.6, 0.9), eff: 0.5 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { shape: true }, obs, current: { milky: 3, shape: null }, shapePart: 0, shapeRanges: rg }, io);
  const grid = seen[2], Rs = new Set(grid.map((c) => c.R));
  ok(grid.length === 15 && Rs.size === 3 && r.best.shape.h > 0, `격자 ${grid.length}개(h 5단계 × R 3), R ${[...Rs]}`); }
{ // 격자 차원 예산 3: h(+R) = 2 → 다른 변수 하나만 / h 가 예산을 넘으면 건너뜀
  const rg = shapeVarRanges({ t0: 2, pitch: 5, hasCenters: true });
  const fake = (g) => async (cands) => cands.map((c) => ({ cand: c, stats: st(0.5 + g(c), 0.9), eff: 0.5, ok: true }));
  const g1 = (c) => (c.h > 0 ? 0.3 : 0) + (c.c > 0 ? 0.2 : 0) + (c.e > 0 ? 0.1 : 0) + (c.dt > 0 ? 0.05 : 0);
  const a = await screenShapeVars(fake(g1), rg, obs), ga = gridCandidates([...a.vars, 'R'], rg);
  ok(a.vars.join() === 'h,c' && ga.length <= 27, `h 선택 → 다른 변수 1개: ${a.vars} (격자 ${ga.length})`);
  const g2 = (c) => (c.c > 0 ? 0.3 : 0) + (c.e > 0 ? 0.2 : 0) + (c.h > 0 ? 0.1 : 0) + (c.dt > 0 ? 0.05 : 0);
  const b = await screenShapeVars(fake(g2), rg, obs);
  ok(b.vars.join() === 'c,e,dt' && gridCandidates(b.vars, rg).length <= 27, `h 가 예산 초과 → 건너뜀: ${b.vars}`); }
ok(halvingTotal(27) === 35 && halvingTotal(4) === 10 && halvingTotal(1) === 3, 'halving 평가 후보 수 합(진행률 분모)');
{ // pickVariant lowestPassing: 1차 전체(6만) → 2차 통과 후보 중 등급 낮은 2개(30만) → 통과 중 등급 최저
  const seen = [], cands = [0, 1, 2, 3, 4, 5].map((g) => ({ g }));
  const evalFn = async (cs, N, ms) => { seen.push([cs.map((c) => c.g).join(''), N, ms]); return cs.map((c) => ({ cand: c, ok: true, stats: st(0.7 + c.g * 0.04, 0.9), eff: 0.5 + c.g / 100 })); };
  const r = await pickVariant(cands, evalFn, obs, { prefer: 'lowestPassing', grade: (c) => c.g });
  ok(r.best.cand.g === 3 && seen[0][0] === '012345' && seen[0][1] === 6e4 && seen[1][1] === 3e5 && seen[1][0] === '34' && r.results1.length === 6 && r.results2.length === 2, `lowestPassing: 통과(g≥3) 중 최저 등급 g=${r.best.cand.g} (2차 ${seen[1][0]})`);
  const evalNo = async (cs) => cs.map((c) => ({ cand: c, ok: c.g !== 5, stats: st(0.5 + c.g * 0.04, 0.9), eff: 0.5 }));
  const r2 = await pickVariant(cands, evalNo, obs, { prefer: 'lowestPassing', grade: (c) => c.g });
  ok(r2.best.cand.g === 4, `통과 없음 → 점수 최고(제약 위반 제외): g=${r2.best.cand.g}`);
  const r3 = await pickVariant(cands, evalFn, obs, { prefer: 'best' });
  ok(r3.best.cand.g === 5, `best → 점수 최고(통과면 효율): g=${r3.best.cand.g}`);
  const r4 = await pickVariant(cands, async (cs) => cs.map((c) => ({ cand: c, ok: false })), obs, { prefer: 'best' });
  ok(r4.best === null, '전부 제약 위반 → null'); }
{ // sameDesign: dz(|Δ|<1e-6, 없음 = 0)·finish(part/kind/R)
  const b = { count: 5, pitch: 0, milky: 3 };
  ok(sameDesign({ ...b, dz: 0 }, b) && sameDesign({ ...b, dz: 1e-8 }, { ...b, dz: 0 }) && !sameDesign({ ...b, dz: 0.5 }, b), 'sameDesign: dz');
  const f = { part: 1, kind: 'whiteDiffuse', R: 0.85 };
  ok(sameDesign({ ...b, finish: f }, { ...b, finish: { ...f } }) && sameDesign({ ...b, finish: null }, b) && !sameDesign({ ...b, finish: f }, b)
    && !sameDesign({ ...b, finish: f }, { ...b, finish: { ...f, R: 0.9 } }) && !sameDesign({ ...b, finish: f }, { ...b, finish: { ...f, part: 2 } }) && !sameDesign({ ...b, finish: f }, { ...b, finish: { ...f, kind: 'metal' } }), 'sameDesign: finish'); }
{ // 실행 순서 ② → ⑤ → ④ → ③ → ① (가짜 io 호출 순서), ⑤ 는 best · ④ 는 통과 중 최저 등급, d 에 반영
  const G = { ns: 2, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 2, closed: false, winS: 5, area: new Float64Array([1, 1]), valid: new Uint8Array([1, 1]) }, log = [], prog = [];
  const fins = [{ kind: 'whiteDiffuse', R: 0.85, current: true }, { kind: 'whiteDiffuse', R: 0.9 }, { kind: 'whiteDiffuse', R: 0.95 }];
  const io = {
    basis: async () => { log.push('leds'); return { cand: [0, 1, 2], maps: [0, 1, 2].map(() => Float32Array.from([1, 1])), emitted: 1 }; },
    evalVariants: async (d, cs, N) => { const k = 'dz' in cs[0] ? 'height' : 'housing'; if (N === 6e4) log.push(k);
      return cs.map((c) => k === 'height' ? { cand: c, ok: true, stats: st(0.85, 0.9), eff: 0.5 - Math.abs(c.dz - 1.5) / 10 } : { cand: c, ok: true, stats: st(c.finish.R >= 0.9 ? 0.85 : 0.7, 0.9), eff: c.finish.R }); },
    milkyRows: async (d, ms) => { const k = log.includes('leds') ? 'milky' : 'ledsRef'; if (!log.includes(k)) log.push(k); return rowsOf(ms); },
    evalShapes: async (d, cs) => { if (!log.includes('shape')) log.push('shape'); return cs.map((c) => ({ cand: c, stats: st(0.9, 0.9), eff: 0.6, ok: true })); },
    verify: async (d) => ({ stats: st(d.dz ? 0.95 : 0.6, 0.9), eff: 0.6 }), progress: (s) => { if (prog.at(-1) !== s) prog.push(s); }, cancelled: () => false };
  const r = await runAutoDesign({ stages: { leds: true, height: true, housing: true, milky: true, shape: true }, obs: { targetLen: 0.8, targetWid: 0 }, current: { milky: 3, count: 5, pitch: 0, shape: null, finish: null, dz: 0 },
    milkyMax: 5, G, line: { length: 2, closed: false }, nMax: 4, heightRange: [-1, 3], finishCands: fins, housingPart: 1, shapePart: 0, shapeCands: [{ dt: 0.2, h: 0, R: 2.75, e: 0, c: 0 }] }, io);
  ok(log.join() === 'ledsRef,leds,height,housing,shape,milky', `호출 순서: ${log.join()}`);
  ok(prog.join() === 'current,leds,height,housing,shape,milky,verify', `진행 단계: ${prog.join()}`);
  ok(r.best.dz === 1.5 && r.best.finish?.part === 1 && r.best.finish.R === 0.9 && r.best.finish.kind === 'whiteDiffuse', `⑤ dz=${r.best.dz} · ④ ${JSON.stringify(r.best.finish)}(통과 중 최저 등급)`);
  ok(r.steps.some((x) => x.stage === 'height' && x.results1.length === 7) && r.steps.some((x) => x.stage === 'housing'), 'steps 에 height(후보 7개)·housing'); }
{ // ④ 현재 면 처리(current)가 뽑히면 finish = 현재 값(null) · ⑤ 0 이면 dz 0 → 같은 설계 → 현재안 그대로
  const fins = [{ kind: 'whiteDiffuse', R: 0.85, current: true }, { kind: 'whiteDiffuse', R: 0.9 }], calls = [];
  const io = { evalVariants: async (d, cs) => cs.map((c) => ({ cand: c, ok: true, stats: st(0.9, 0.9), eff: 'dz' in c ? 0.5 - Math.abs(c.dz) : 0.5 })),
    verify: async (d) => { calls.push(d); return { stats: st(0.9, 0.9), eff: 0.5 }; }, progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { height: true, housing: true }, obs, current: { milky: 3, count: 5, pitch: 0, finish: null, dz: 0 }, heightRange: [-1, 1], finishCands: fins, housingPart: 1 }, io);
  ok(r.unchanged && r.best.finish === null && r.best.dz === 0 && calls.length === 1, `현재 후보 선택 → 현재안 그대로 (verify ${calls.length}회)`); }
{ // ④ 특수 처리 후보(spec P4 §2.3d): 통과하는 유일한 후보가 특수 → best.finish.coating = id
  const fins = [{ kind: 'whiteDiffuse', R: 0.85, current: true }, { kind: 'whiteDiffuse', R: 0.9 }, { kind: 'whiteDiffuse', R: 0.97, special: true, coating: 'coat-white' }];
  const io = { evalVariants: async (d, cs) => cs.map((c) => ({ cand: c, ok: true, stats: st(c.finish.R > 0.95 ? 0.9 : 0.6, 0.9), eff: 0.5 })),
    verify: async (d) => ({ stats: st(d.finish?.R > 0.95 ? 0.9 : 0.6, 0.9), eff: 0.5 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { housing: true }, obs, current: { milky: 3, count: 5, pitch: 0, finish: null }, finishCands: fins, housingPart: 1 }, io);
  ok(r.best.finish?.coating === 'coat-white' && r.best.finish.R === 0.97 && !('special' in r.best.finish), `특수 후보 선택 → coating 전달: ${JSON.stringify(r.best.finish)}`); }
{ // 가드: ⑤ 가 dz 를 골랐지만 검증에서 이득 없음 → 현재안 유지
  const io = { evalVariants: async (d, cs) => cs.map((c) => ({ cand: c, ok: true, stats: st(0.7 + c.dz / 100, 0.9), eff: 0.5 })),
    verify: async (d) => ({ stats: st(0.7, 0.9), eff: 0.5 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { height: true }, obs, current: { milky: 3, count: 5, pitch: 0, dz: 0 }, heightRange: [0, 3] }, io);
  const g = r.steps.find((x) => x.stage === 'guard');
  ok(r.unchanged && r.best.dz === 0 && g?.tried.dz === 3 && /현재안 유지/.test(r.reason), `⑤ 이득 없음 → 현재안 유지 (시도 dz ${g?.tried.dz})`); }
{ // ② 2D 후보 격자(spec P4 §2.2b): 1열(w 0)은 리플, ±1 줄은 고름 → 2열 × 1개(±1) · d 에 rows·rowGap · sameDesign
  const G = { ns: 2, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 2, closed: false, winS: 5, area: new Float64Array([1, 1]), valid: new Uint8Array([1, 1]) };
  const cand = [0, -1, 1].flatMap((w) => [0, 1, 2].map((s) => ({ s, w }))), maps = cand.map(({ w }) => Float32Array.from(w === 0 ? [1, 0.1] : [1, 1]));
  const B = { cand, maps, emitted: 1, gaps: [1] }, line = { length: 2, closed: false, width: 4 };
  const io = { basis: async () => B, verify: async (d) => ({ stats: st(d.rows === 2 ? 0.95 : 0.5, 0.9), eff: 1 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.8, targetWid: 0 }, current: { milky: 3, count: 2, pitch: 0 }, G, line, nMax: 4 }, io);
  const s2 = r.steps.find((x) => x.stage === 'leds');
  ok(!r.unchanged && r.best.count === 1 && r.best.rows === 2 && r.best.rowGap === 1 && s2.total === 2, `② 2D: 2열 × ${r.best.count}개 ±${r.best.rowGap} (총 ${s2.total})`);
  // fewer 는 총수 비교: 현재 1열 2개(총 2) vs 2열 × 1개(총 2) — 점수 같으면 현재안 유지(열당 1 < 2 로 속지 않음)
  const io2 = { ...io, verify: async () => ({ stats: st(0.95, 0.9), eff: 1 }) };
  const r2 = await runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.8, targetWid: 0 }, current: { milky: 3, count: 2, pitch: 0, rows: 1 }, G, line, nMax: 4, ladderMs: 0 }, io2);
  const r3 = await runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.8, targetWid: 0 }, current: { milky: 3, count: 3, pitch: 0, rows: 1 }, G, line, nMax: 4, ladderMs: 0 }, io2);
  ok(r2.unchanged && !r3.unchanged && r3.best.rows === 2, 'fewer = 총 LED 수(rows·count): 총 2 = 2 → 유지, 총 2 < 3 → 추천');
  ok(sameDesign({ count: 2, pitch: 0 }, { count: 2, pitch: 0, rows: 1, rowGap: 0 }) && sameDesign({ count: 2, pitch: 0, rows: 1, rowGap: 3 }, { count: 2, pitch: 0 }) && !sameDesign({ count: 2, pitch: 0, rows: 2, rowGap: 3 }, { count: 2, pitch: 0 })
    && !sameDesign({ count: 2, pitch: 0, rows: 2, rowGap: 3 }, { count: 2, pitch: 0, rows: 2, rowGap: 4 }) && sameDesign({ count: 2, pitch: 0, rows: 2, rowGap: 3 }, { count: 2, pitch: 0, rows: 2, rowGap: 3 }), 'sameDesign: rows(없음 = 1)·rowGap(1열이면 무시)'); }
{ // 최종 판정: 단계는 통과(⑤ 후보 0.9)였어도 정밀 재계산이 미달이면 feasible=false + 사유
  const io = { evalVariants: async (d, cs) => cs.map((c) => ({ cand: c, ok: true, stats: st(0.85 + c.dz / 100, 0.9), eff: 0.5 + c.dz / 100 })),
    verify: async (d) => ({ stats: st(d.dz ? 0.77 : 0.5, 0.92), eff: 0.5 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { height: true }, obs, current: { milky: 3, count: 5, pitch: 0, dz: 0 }, heightRange: [0, 3] }, io);
  ok(!r.unchanged && !r.feasible && /최종 정밀 재계산에서 목표 미달 — 길이 균일도 0\.77 · 폭 균일도 0\.92/.test(r.reason), `정밀 재계산 미달 → 불가: ${r.reason}`); }
{ // ② 재확인: 첫 후보(±1) 검증 미달 → 같은 총수 다른 열 간격(±2) 검증 통과 → 그것
  const G = { ns: 2, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 2, closed: false, winS: 5, area: new Float64Array([1, 1]), valid: new Uint8Array([1, 1]) };
  const cand = [0, -1, 1, -2, 2].flatMap((w) => [0, 1, 2].map((s) => ({ s, w }))), maps = cand.map(({ w }) => Float32Array.from(w === 0 ? [1, 0.1] : [1, 1]));
  const B = { cand, maps, emitted: 1, gaps: [1, 2] }, line = { length: 2, closed: false, width: 4 }, cv = { stats: st(0.5, 0.9), eff: 1 };
  const run = async (U) => {
    const calls = [], prog = [];
    const io = { basis: async () => B, verify: async (d) => { calls.push(d); return { stats: st(U(d), 0.9), eff: 1 }; }, progress: (s, f, t) => prog.push(t), cancelled: () => false };
    const r = await runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.8, targetWid: 0 }, current: { milky: 3, count: 3, pitch: 0, rows: 1 }, currentVerified: cv, G, line, nMax: 4, ladderMs: 0 }, io);
    return { r, calls, prog };
  };
  const a = await run((d) => (d.rows === 2 && d.rowGap === 2 ? 0.95 : d.rows === 2 ? 0.7 : 0.6));
  const sv = a.r.steps.find((x) => x.stage === 'ledsVerify');
  ok(a.r.feasible && a.r.best.rows === 2 && a.r.best.rowGap === 2 && a.calls.length === 2 && sv?.tried.length === 2 && sv.tried[1].verified.stats.Ulen === 0.95 && a.prog.includes('② 후보 재확인 (2/3)'),
    `② 첫 후보 미달 → 두 번째(±${a.r.best.rowGap}) 통과 (verify ${a.calls.length}회)`);
  const b = await run((d) => (d.rows === 2 && d.rowGap === 2 ? 0.75 : d.rows === 2 ? 0.7 : 0.6));
  ok(!b.r.feasible && b.r.best.rows === 2 && b.r.best.rowGap === 2 && b.calls.length <= 3 && /최종 정밀 재계산에서 목표 미달 — 길이 균일도 0\.75/.test(b.r.reason),
    `② 모두 미달 → 검증 최고(±${b.r.best.rowGap}) 유지 · verify ${b.calls.length}회: ${b.r.reason}`); }
{ // ②+④+① (spec §2.2c): ② 기준 = 거친 최고점 Milky(상한 아님) · 케이스 최고 등급 → 개수 확정 뒤 ④ 최저 통과 등급 · ① 최소 Milky
  const G = { ns: 2, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 2, closed: false, winS: 5, area: new Float64Array([1, 1]), valid: new Uint8Array([1, 1]) };
  const fins = [{ kind: 'whiteDiffuse', R: 0.85, current: true }, { kind: 'whiteDiffuse', R: 0.95 }, { kind: 'whiteDiffuse', R: 0.9 }];
  const run = async (stages) => {
    const basisD = [], bases = [], prog = [];
    const io = { basis: async (d) => { basisD.push(d); return { cand: [0, 1, 2], maps: [0, 1, 2].map(() => Float32Array.from([1, 1])), emitted: 1 }; },
      milkyRows: async (d, ms, o) => { if (!basisD.length && !o?.precise) bases.push(ms[10]); return peakRows(ms, 0.85); },
      evalVariants: async (d, cs) => cs.map((c) => ({ cand: c, ok: true, stats: st(c.finish.R >= 0.9 ? 0.85 : 0.7, 0.9), eff: c.finish.R })),
      verify: async () => ({ stats: st(0.9, 0.9), eff: 1 }), progress: (s, f, t) => prog.push(t), cancelled: () => false };
    const r = await runAutoDesign({ stages, obs, current: { milky: 1, count: 5, pitch: 0, finish: null }, milkyMax: 5, G, line: { length: 2, closed: false }, nMax: 4, finishCands: fins, housingPart: 1 }, io);
    return { r, basisD, bases, prog, ref: r.steps.find((x) => x.stage === 'ledsRef') };
  };
  const a = await run({ leds: true, housing: true, milky: true });
  ok(a.basisD.length === 1 && Math.abs(a.basisD[0].milky - 4) <= 0.25 && a.basisD[0].finish?.R === 0.95 && a.basisD[0].finish.part === 1, `② 기준 d: Milky ${a.basisD[0]?.milky}(최고점 ≈4, 상한 5 아님) · 케이스 ${a.basisD[0]?.finish?.R}(최고 등급)`);
  ok(a.bases.join() === '0.5,1.5,2.5,3.5,4.5' && a.prog.some((t) => /^② 기준 Milky 찾기 \(Milky 0\.5\)/.test(t)), `거친 최고점 탐색 ${a.bases.join(' → ')} (≤ 상한 5, 정밀 없음)`);
  ok(a.ref && a.ref.milky === a.basisD[0].milky && a.ref.finish?.R === 0.95, `steps ledsRef: Milky ${a.ref?.milky} · 케이스 ${a.ref?.finish?.R}`);
  ok(a.r.best.count === 1 && a.r.best.finish?.R === 0.9 && Math.abs(a.r.best.milky - 3) < 0.05, `개수 ${a.r.best.count} → ④ 최저 통과 ${a.r.best.finish?.R} → ① 최소 Milky ${a.r.best.milky}`);
  const b = await run({ leds: true, milky: true });
  ok(Math.abs(b.basisD[0].milky - 4) <= 0.25 && b.basisD[0].finish === null && b.ref?.finish === null, `②+①: 기준 Milky ${b.basisD[0].milky} · 케이스 그대로`);
  const c = await run({ leds: true, housing: true });
  ok(c.basisD[0].milky === 1 && c.basisD[0].finish?.R === 0.95 && c.bases.length === 0 && c.ref?.milky == null && c.r.best.finish?.R === 0.9 && c.r.best.milky === 1, `②+④: 기준 Milky ${c.basisD[0].milky}(현재) · 케이스 최고 → 최종 ${c.r.best.finish?.R}`);
  const e = await run({ leds: true });
  ok(e.basisD[0].milky === 1 && e.basisD[0].finish === null && !e.ref && e.bases.length === 0, '② 만: 기존 그대로(기준 탐색 없음)'); }
{ // ③ 곡선 다듬기(프로파일 따라가기) — 가짜 모형: 끝단이 어둡고(1 − 0.3·끝 가까움), 길이 곡선 kL 을 올린 곳이 밝아짐(+0.4·kL)
  // 폭: 가장자리가 어둡고 kW 를 올리면 밝아짐. 반복마다 방향 = 결손(어두운 곳 +) — 균일도가 오르고 곡선이 끝·가장자리에서 양수가 됨
  const ns = 40, nw = 6, obs = { targetLen: 0.95, targetWid: 0.95 };
  const model = (c) => {
    const prof = Float64Array.from({ length: ns }, (_, i) => { const t = (i + 0.5) / ns, end = Math.max(0, 1 - Math.min(t, 1 - t) / 0.2); return 1 - 0.3 * end + 0.4 * curveAt(c.kL ?? [], t); });
    const wcol = Array.from({ length: nw }, (_, j) => { const wn = Math.abs(((j + 0.5) / nw) * 2 - 1); return 1 - 0.2 * wn * wn + 0.4 * curveAt(c.kW ?? [], wn); });
    const map = new Float64Array(ns * nw); for (let i = 0; i < ns; i++) for (let j = 0; j < nw; j++) map[i * nw + j] = prof[i] * wcol[j];
    const mx = Math.max(...prof), mw = Math.max(...wcol);
    return { profile: Float64Array.from(prof, (v) => v / mx), map, nw, Ulen: Math.min(...prof) / mx, Uwid: Math.min(...wcol) / mw };
  };
  let nEval = 0;
  const evalFn = async (cands) => cands.map((cand) => { nEval++; return { cand, ok: true, stats: model(cand), eff: 0.1 }; });
  const zero = { dt: 0, h: 0, R: 1, e: 0, c: 0 }, b0 = { cand: zero, ok: true, stats: model(zero), eff: 0.1 };
  const dir = curveDirection(b0.stats, 5, 3, false);
  ok(dir.kL[0] > 0.9 && dir.kL[2] < 0 && dir.kL[4] > 0.9 && dir.kW[2] > dir.kW[0], `방향: 길이 ${dir.kL.map((v) => v.toFixed(2))} · 폭 ${dir.kW.map((v) => v.toFixed(2))}`);
  const r = await refineShapeCurve(b0, evalFn, obs, { nL: 5, nW: 3, A0: 0.4, iters: 3 });
  const s0 = shapeScore(b0, obs), s1 = shapeScore(r.best, obs);
  ok(s1 > s0 + 0.05 && r.best.cand.kL[0] > 0 && r.best.cand.kL[4] > 0 && nEval <= 18 && r.tried.length === nEval, `곡선 다듬기: 점수 ${s0.toFixed(3)} → ${s1.toFixed(3)} · kL ${r.best.cand.kL.map((v) => v.toFixed(2))} · 평가 ${nEval}개`);
  const flat = { cand: zero, ok: true, stats: { profile: new Float64Array(ns).fill(1), map: new Float64Array(ns * nw).fill(1), nw, Ulen: 1, Uwid: 1 }, eff: 0.1 };
  const r2 = await refineShapeCurve(flat, evalFn, obs, { nL: 5, nW: 3, A0: 0.4, iters: 2 });
  ok(r2.best === flat && r2.tried.length === 0, '결손 없음(이미 고름) → 그대로(평가 안 함)');
}
{ // 형상 변경 최소화: 마지막 단계에서 최고와 0.01 이내면 변화가 작은 안
  const obs = { targetLen: 0.9, targetWid: 0.9 }, mk = (U) => ({ Ulen: U, Uwid: 0.9, profile: null });
  const evalFn = async (cands) => cands.map((c) => ({ cand: c, ok: true, eff: 0.1, stats: mk(c.dt === 2 ? 0.80 : c.dt === 0.5 ? 0.795 : 0.7) }));
  const best = await halving([{ dt: 2 }, { dt: 0.5 }, { dt: 0 }], evalFn, obs, [[3, 1, 1]]);
  ok(best.cand.dt === 0.5 && Math.abs(shapeSize({ dt: -1, h: 0.5, kL: [0.2, -0.7], kW: [0.1] }) - 2.3) < 1e-12, `노이즈 수준 차이면 작은 변경 dt ${best.cand.dt}`);
}
{ // 이미 적용한 형상(shapeStart)에서 이어서: ③ 를 다시 돌려도 적용 형상이 후보에 들어가 더 나으면 유지(원본에서 새로 시작해 잃지 않음)
  const rg = shapeVarRanges({ t0: 2, pitch: 5, hasCenters: false }), start = { dt: 0, h: 0, R: 1, e: 0.7, c: 0 }, seen = [];
  const good = (c) => Math.abs((c.e ?? 0) - 0.7) < 1e-9 && !(c.c ?? 0) && !(c.dt ?? 0);
  const io = { evalShapes: async (d, cands) => { seen.push(...cands); return cands.map((c) => ({ cand: c, ok: true, eff: 0.5, stats: { Ulen: good(c) ? 0.85 : c.c > 0 ? 0.7 : 0.6, Uwid: 0.9 } })); },
    verify: async (d) => ({ stats: { Ulen: good(d.shape ?? {}) ? 0.85 : 0.6, Uwid: 0.9 }, eff: 0.5 }), progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { shape: true }, obs: { targetLen: 0.8, targetWid: 0.8 }, current: { milky: 3, count: 5, pitch: 0, shape: null }, shapePart: 0, shapeRanges: rg, shapeStart: start, curve: false }, io);
  ok(seen.some(good) && good(r.best.shape ?? {}), `적용 형상(끝단 +0.7) 후보 포함 → 최종 ${JSON.stringify(r.best.shape)}`);
}
{ // ② LED 폭 위치 이동(2026-10-30): 후보 이동량을 빠르게 비교 → 최고(노이즈 수준이면 덜 옮긴 쪽) → 그 위치 중심으로 배치 탐색
  const G = { ns: 100, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 100, closed: false, winS: 10, area: new Float64Array(100).fill(1), valid: new Uint8Array(100).fill(1) }, line = { length: 100, closed: false };
  const gain = { 0: 0.55, '-6': 0.6, '-12': 0.9, '-14': 0.895 }, seenW = [];
  const io = { progress() {}, cancelled: () => false, verify: async (d) => ({ stats: { Ulen: d.wCenter === -12 ? 0.9 : 0.55, Uwid: 0.9 }, eff: 0.2 }),
    evalLateral: async (d, cs) => cs.map((c) => ({ cand: { wCenter: c }, ok: true, eff: 0.2, stats: { Ulen: 0.5, Uwid: gain[c] } })),   // 폭 위치 = 폭 균일도로 고름
    basis: async (d) => { seenW.push(d.wCenter); const cand = candidateGrid(line, { sStep: 2, wOffsets: [d.wCenter ?? 0] }); return { cand, emitted: 1, gaps: [], sMargin: 0, maps: cand.map(({ s }) => Float32Array.from({ length: 100 }, (_, i) => Math.exp(-((i + 0.5 - s) ** 2) / 72))) }; } };
  const r = await runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.7, targetWid: 0.7 }, current: { milky: 1, count: 5, pitch: 0 }, G, line, nMax: 20, lateral: [0, -6, -12, -14] }, io);
  const lat = r.steps.find((x) => x.stage === 'ledsLateral');
  ok(lat?.pick === -12 && seenW[0] === -12 && r.best.positions?.every((q) => q.w === -12) && r.best.wCenter === -12, `폭 위치: 고름 ${lat?.pick} (목표를 넘는 후보 중 가장 덜 옮김) · 배치 w ${[...new Set(r.best.positions?.map((q) => q.w))]}`);
  const r0 = await runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.7, targetWid: 0 }, current: { milky: 1, count: 5, pitch: 0 }, G, line, nMax: 20 }, { ...io, basis: async (d) => io.basis({ ...d, wCenter: 0 }) });
  ok(!r0.steps.some((x) => x.stage === 'ledsLateral'), '이동 후보가 없으면 폭 위치 단계 없음(기존과 같음)');
}
{ // 폭 위치 고르기: 부족한 방향으로만, 필요한 만큼만
  const R = (o) => Object.entries(o).map(([c, Uwid]) => ({ cand: { wCenter: +c }, ok: true, stats: { Ulen: 0.5, Uwid } })), O = { targetLen: 0.8, targetWid: 0.7 };
  ok(pickLateral(R({ 0: 0.74, '-6': 0.9 }), O) === 0, '폭이 이미 통과 = 옮기지 않음');
  ok(pickLateral(R({ 0: 0.6, '-6': 0.75, '-12': 0.9 }), O) === -6, '폭 부족 = 목표를 넘는 후보 중 가장 덜 옮김');
  ok(pickLateral(R({ 0: 0.5, '-6': 0.62, '-12': 0.615 }), O) === -6 && pickLateral(R({ 0: 0.5, '-6': 0.55, '-12': 0.62 }), O) === -12, '아무것도 못 넘으면 최고값(노이즈 수준이면 덜 옮김)');
  ok(pickLateral([], O) === null, '후보 없음 = null');
}
{ // ② 정밀 재계산 미달 → 1열로 LED 를 하나씩 늘려 목표에 닿는 가장 적은 개수(2026-11-02) — 기저는 7개로 통과라 하지만 실제로는 10개부터 통과
  const G = { ns: 100, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 100, closed: false, winS: 10, area: new Float64Array(100).fill(1), valid: new Uint8Array(100).fill(1) }, line = { length: 100, closed: false };
  const cand = candidateGrid(line, { sStep: 2 }), maps = cand.map(({ s }) => Float32Array.from({ length: 100 }, (_, i) => Math.exp(-((i + 0.5 - s) ** 2) / 200))), B = { cand, maps, emitted: 1, gaps: [], sMargin: 0 };
  const run = async (Ufn, cur = { milky: 1, count: 5, pitch: 0, rows: 1 }, curU = 0.5, nMax = 30) => { const seen = []; const r = await runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.8, targetWid: 0.5 }, current: cur, G, line, nMax, rowsOptions: [1] },
    { basis: async () => B, progress() {}, cancelled: () => false, verify: async (d) => { if (d === undefined || d.positions == null) return { stats: st(curU, 0.9), eff: 0.5 }; seen.push(d.positions.length); return { stats: Ufn(d.positions.length), eff: 0.5 }; } }); return { r, seen }; };
  const a = await run((n) => st(n >= 10 ? 0.82 : 0.6 + n * 0.01, 0.9));
  ok(a.r.feasible && a.r.best.positions.length === 10 && new Set(a.r.best.positions.map((q) => q.w)).size === 1 && a.seen.at(-1) === 10 && a.seen.every((n, i) => !i || n > a.seen[i - 1]), `미달 → 하나씩 늘려 10개에서 통과 (재확인 ${a.seen.join('→')})`);
  const b = await run((n) => st(0.9, 0.4));   // 폭 부족 = 개수로 안 오름 → 두 번 만에 멈추고 적은 쪽 · 한계 문구
  ok(!b.r.feasible && /한계: 폭 방향 확산 부족/.test(b.r.reason) && b.r.best.positions.length === Math.min(...b.seen), `폭 부족: ${b.seen.join('→')} — 나아지지 않으니 가장 적은 ${b.r.best.positions?.length}개`);
  const down = await run((n) => st(n >= 3 ? 0.85 : 0.6, 0.9));   // 후보 추정은 많게 잡았지만 3개면 충분 → 줄여서 확인
  ok(down.r.feasible && down.r.best.positions.length === 3 && down.seen.includes(2) && down.seen.every((n, i) => !i || n < down.seen[i - 1]), `많이 잡았으면 줄여 확인: ${down.seen.join('→')} → ${down.r.best.positions.length}개`);
  const c = await run((n) => st(n >= 12 ? 0.85 : 0.6, 0.9), { milky: 1, count: 8, pitch: 0, rows: 1 }, 0.82);   // 지금 8개가 이미 통과 → 지금보다 많아지는 안은 시험도 안 함
  ok(c.r.unchanged && c.seen.every((n) => n <= 8), `지금 통과면 개수를 늘리지 않음 (재확인 ${c.seen.join('→') || '없음'})`);
}
{ // ② 폭은 개수로 못 닿음: 길이가 통과하는 가장 적은 개수까지만 늘림 — 현재안 유지로 묻히지 않고, 폭 한계를 알림
  const G = { ns: 100, nw: 2, ds: 1, cell: 1, w0: -1, L: 100, closed: false, winS: 10, area: new Float64Array(200).fill(1), valid: new Uint8Array(200).fill(1) }, line = { length: 100, closed: false };
  const cand = candidateGrid(line, { sStep: 2 }), maps = cand.map(({ s: c }) => { const a = new Float32Array(200); for (let i = 0; i < 100; i++) { const v = Math.exp(-((i + 0.5 - c) ** 2) / 72); a[2 * i] = v; a[2 * i + 1] = 0.5 * v; } return a; });
  const seen = [], cur = { milky: 1, count: 5, pitch: 0, rows: 1 };
  const r0 = await runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.8, targetWid: 0.95 }, current: cur, G, line, nMax: 40, rowsOptions: [1] }, { basis: async () => ({ cand, maps, emitted: 1, gaps: [], sMargin: 0 }), progress() {}, cancelled: () => false,
    verify: async (d) => { if (!d.positions) return { stats: st(0.7, 0.6), eff: 0.5 }; seen.push(d.positions.length); return { stats: st(d.positions.length >= seen[0] + 2 ? 0.82 : 0.75, 0.61), eff: 0.5 }; } });
  ok(!r0.unchanged && !r0.feasible && r0.best.positions.length === seen[0] + 2 && seen.length === 3 && /길이 목표는 LED \d+개로 통과/.test(r0.reason) && /한계: 폭 방향 확산 부족/.test(r0.reason), `폭 한계: ${seen.join('→')} 에서 길이 통과 · ${r0.reason}`);
}
{ // ② 1열만(cfg.rowsOptions [1], 재료비) — 2열이 더 나아도 1열 배치만
  const G = { ns: 100, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 100, closed: false, winS: 10, area: new Float64Array(100).fill(1), valid: new Uint8Array(100).fill(1) }, line = { length: 100, closed: false };
  const ws = [0, -3, 3], cand = candidateGrid(line, { sStep: 2, wOffsets: ws }), maps = cand.map(({ s, w }) => Float32Array.from({ length: 100 }, (_, i) => (w ? 1.3 : 1) * Math.exp(-((i + 0.5 - s) ** 2) / 72)));
  const io = { progress() {}, cancelled: () => false, verify: async (d) => ({ stats: { Ulen: d.positions ? 0.95 : 0.6, Uwid: 0.9 }, eff: 0.2 }), basis: async () => ({ cand, maps, emitted: 1, gaps: [3], sMargin: 0 }) };
  const run = (ro) => runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.7, targetWid: 0 }, current: { milky: 1, count: 3, pitch: 0 }, G, line, nMax: 20, rowsOptions: ro }, io);
  const r1 = await run([1]);
  ok(r1.best.rows === 1 && r1.best.positions.every((q) => q.w === 0), `1열만: rows ${r1.best.rows}`);
}
{ // ③ 입광면 보정: 길이 오차 = 밝은 곳 +, 어두운 곳 −
  const ns = 40, nw = 4, G = { ns, nw, ds: 1, cell: 1, w0: -2, L: 40, closed: false, valid: new Uint8Array(ns * nw).fill(1) };
  const E = fieldError({ profile: Array.from({ length: ns }, (_, i) => (i < 20 ? 1.2 : 0.8)) }, G, 9);
  ok(E[0] > 0.15 && E[8] < -0.15, `오차 부호 (${E[0].toFixed(3)}, ${E[8].toFixed(3)})`);
  const R = fieldResponse([0.1, -0.1, 0.2, -0.2], [0.05, -0.05, 0.1, -0.1], [2, -2, 4, -4]);
  ok(Math.abs(R.slope + 0.025) < 1e-9 && Math.abs(R.r + 1) < 1e-9, `감도 회귀 (${R.slope})`);
  // 가짜 광학: 광량 = 기울기 − 0.1·이동. 밝은 곳을 두껍게(+) 해야 나아짐
  const statsOf = (kF, k = 0.1) => { const profile = Array.from({ length: ns }, (_, i) => { const a = (i / (ns - 1)) * 8, i0 = Math.min(7, Math.floor(a)), v0 = kF?.v?.[i0 * 3 + 1] ?? 0, v1 = kF?.v?.[(i0 + 1) * 3 + 1] ?? 0; return 1.2 - (0.4 * i) / (ns - 1) - k * (v0 + (a - i0) * (v1 - v0)); }); return { profile, Ulen: Math.min(...profile) / Math.max(...profile), Uwid: 0.95, empty: false }; };
  const ev = (k) => async (cands) => cands.map((c) => ({ cand: c, ok: true, stats: statsOf(c.kF, k), eff: 0.5 }));
  const z = { dt: 0, h: 0, R: 1, e: 0, c: 0 }, st0 = { cand: z, ok: true, stats: statsOf(null), eff: 0.5 }, O = { targetLen: 0.9, targetWid: 0.6 }, P = { G, ns: 9, nw: 3, N: 1, maxMs: 1 };
  const r = await refineShapeField(st0, ev(0.1), O, P);
  ok(r.best.stats.Ulen > st0.stats.Ulen + 0.1 && r.best.cand.kF.v[1] > 0 && r.best.cand.kF.v[25] < 0 && r.sens.slope < 0, `보정: 밝은 곳 두껍게·어두운 곳 얇게로 균일도 ↑ (${st0.stats.Ulen.toFixed(2)} → ${r.best.stats.Ulen.toFixed(2)})`);
  const rR = await refineShapeField(st0, ev(-0.1), O, P);
  ok(rR.best.stats.Ulen > st0.stats.Ulen + 0.1 && rR.best.cand.kF.v[1] < 0 && rR.sens.slope > 0, `보정: 반대 부호도 찾음 (${rR.best.stats.Ulen.toFixed(2)})`);
  const rN = await refineShapeField(st0, async (cands) => cands.map((c) => ({ cand: c, ok: false, why: '간섭' })), O, P);
  ok(rN.best === st0 && rN.passes === 1, '시험 이동이 제약 위반이면 그대로');
  let calls = 0; const flat = { cand: z, ok: true, stats: { profile: new Array(ns).fill(1), Ulen: 1, Uwid: 0.5, empty: false }, eff: 0.5 };
  await refineShapeField(flat, async () => { calls++; return []; }, O, P);
  ok(calls === 0, '길이 방향이 이미 고르면 평가 없음'); }
{ // ③ 형상 모드: LED 위상·모드·접기·박스 풀이
  const ledS = [10, 30, 50, 70, 90];
  ok(ledPhase(40, ledS) === 1.5 && ledPhase(0, ledS) === -0.5 && ledPhase(100, ledS) === 4.5, 'LED 위상(바깥은 끝 간격으로 연장)');
  ok(Math.abs(ledPhase(95, ledS, 100, true) - 4.25) < 1e-9, '닫힌 라인 위상');
  const M = shapeModes(ledS, 100, 5, false, 21, 5);
  ok(M.length === 11 && M.every((m) => Math.abs(Math.max(...m.v.map(Math.abs)) - 1) < 1e-9), `모드 ${M.length}개, 최대 1`);
  ok(M[0].v[Math.round(10 / 5) * 5] === 1 && Math.abs(M[4].v[0] + 1) < 1e-9, 'cos 모드 = LED 위에서 최대, 폭 기울기 = −W 에서 −1');
  ok(shapeModes(ledS, 100, 5, true, 20, 5).length === 9, '닫힌 라인엔 끝단 모드 없음');
  const c = solveBox([[1, 0], [0, 2]], [-0.5, 1], { lam: 0, cmax: 10 });
  ok(Math.abs(c[0] - 0.5) < 1e-6 && Math.abs(c[1] + 0.5) < 1e-6, `최소제곱 풀이 (${c})`);
  ok(solveBox([[1], [1]].map((r) => r), [-5, -5], { lam: 0, cmax: 1 }).every((v) => v <= 1), '박스 제약');
  const nsG = 100, nwG = 4, G = { ns: nsG, nw: nwG, ds: 1, cell: 2.5, w0: -5, L: 100, closed: false, valid: new Uint8Array(nsG * nwG).fill(1) };
  // 가짜 광학: ln 광량 = 물결 + 폭 기울기 − 0.05·(그 자리 이동). 물결은 LED 위 밝음, 폭은 +w 가 밝음 → 응답을 재서 둘 다 줄여야 함
  const mapOf = (kF) => { const m = new Float64Array(nsG * nwG); for (let i = 0; i < nsG; i++) for (let j = 0; j < nwG; j++) { const s = i + 0.5, w = -5 + (j + 0.5) * 2.5, x = (s / 100) * 20, i0 = Math.min(19, Math.floor(x)), jj = Math.round(((w + 5) / 10) * 4), d = kF ? kF.v[i0 * 5 + jj] + (x - i0) * (kF.v[(i0 + 1) * 5 + jj] - kF.v[i0 * 5 + jj]) : 0; m[i * nwG + j] = Math.exp(0.1 * Math.cos(2 * Math.PI * ledPhase(s, ledS)) + 0.02 * w - 0.05 * d); } return m; };
  const statsOf = (kF) => { const map = mapOf(kF), profile = Array.from({ length: nsG }, (_, i) => { let t = 0; for (let j = 0; j < nwG; j++) t += map[i * nwG + j]; return t / nwG; }), cols = Array.from({ length: nwG }, (_, j) => { let t = 0; for (let i = 0; i < nsG; i++) t += map[i * nwG + j]; return t / nsG; }); return { map, profile, Ulen: Math.min(...profile) / Math.max(...profile), Uwid: Math.min(...cols) / Math.max(...cols), empty: false }; };
  const O = { targetLen: 0.97, targetWid: 0.97 }, st0 = { cand: { dt: 0, h: 0, R: 1, e: 0, c: 0 }, ok: true, stats: statsOf(null), eff: 0.5 };
  const r = await solveShapeModes(st0, async (cands) => cands.map((cd) => ({ cand: cd, ok: true, stats: statsOf(cd.kF), eff: 0.5 })), O, { G, ns: 21, nw: 5, W: 5, ledS, cmax: 3, N: 1, maxMs: 1 });
  ok(r.best.stats.Ulen > st0.stats.Ulen + 0.1 && r.best.stats.Uwid > st0.stats.Uwid + 0.1, `응답 행렬: 길이·폭 함께 ↑ (${st0.stats.Ulen.toFixed(2)}/${st0.stats.Uwid.toFixed(2)} → ${r.best.stats.Ulen.toFixed(2)}/${r.best.stats.Uwid.toFixed(2)})`);
  ok(r.pred.rmsP < 0.5 * r.pred.rms0, `예측 잔차 감소 (${r.pred.rms0.toFixed(3)} → ${r.pred.rmsP.toFixed(3)})`);
  let nEv = 0; const rL = await solveShapeModes(st0, async (cands) => { nEv += cands.length; return cands.map((cd) => ({ cand: cd, ok: true, stats: statsOf(null), eff: 0.5 })); }, O, { G, ns: 21, nw: 5, W: 5, ledS, N: 1, maxMs: 1 });
  ok(rL.limited && rL.best === st0 && nEv === 11, `형상 응답이 없으면 모드만 재고 멈춤 (평가 ${nEv})`);
  const rB = await solveShapeModes(st0, async (cands) => cands.map((cd) => ({ cand: cd, ok: false, why: '간섭' })), O, { G, ns: 21, nw: 5, W: 5, ledS, N: 1, maxMs: 1 });
  ok(rB.best === st0 && rB.pred === null, '모든 모드가 제약 위반이면 그대로');
  // 입광면이 다른 부품에 닿아 + 쪽이 막힌 경우(2026-11-05) — 실제로 움직인 양으로 응답을 재고, 한쪽 모드는 반대쪽으로 다시 잰다
  const cutOnly = (cands) => cands.map((cd) => { const kF = cd.kF ? { ...cd.kF, v: cd.kF.v.map((v) => Math.min(0, v)) } : cd.kF, q = { ...cd, kF }; return { cand: q, ok: true, stats: statsOf(kF), eff: 0.5 }; });
  const rC = await solveShapeModes(st0, async (cands) => cutOnly(cands), O, { G, ns: 21, nw: 5, W: 5, ledS, cmax: 3, N: 1, maxMs: 1 }), end = rC.modes.find((m) => m.name === '시작 끝단');
  ok(rC.modes.every((m) => m.ok && Math.abs(m.a) > 0.02) && end.a < 0, `깎는 쪽만 가능 → 모드 전부 측정, 끝단은 반대 방향(a ${end.a.toFixed(2)})`);
  ok(rC.best.stats.Ulen > st0.stats.Ulen && rC.best !== st0, `깎는 쪽만으로도 나아짐 (${st0.stats.Ulen.toFixed(3)} → ${rC.best.stats.Ulen.toFixed(3)})`);
  const stuck = (cands) => cands.map((cd) => { const q = { ...cd, kF: cd.kF ? { ...cd.kF, v: cd.kF.v.map(() => 0) } : cd.kF }; return { cand: q, ok: true, stats: statsOf(null), eff: 0.5 }; });
  const rN = await solveShapeModes(st0, async (cands) => stuck(cands), O, { G, ns: 21, nw: 5, W: 5, ledS, N: 1, maxMs: 1 });
  ok(rN.best === st0 && rN.modes.every((m) => m.why === '여유 없음'), '움직일 여유가 전혀 없으면 이유를 남김');
  // 불변 조건: 형상을 돌렸는데 안 바뀌면 이유가 반드시 결과에 있음(형상이 왜 안 움직였는지 숨기지 않음)
  const baseCfg = { stages: { shape: true }, obs: O, current: { milky: 1, count: 5, pitch: 0, shape: null }, G, shapePart: 0, shapeField: { ns: 21, nw: 5, W: 5, N: 1, maxMs: 1, ledSOf: () => ledS } };
  const vs = (d) => ({ stats: { ...statsOf(d.shape?.kF ?? null), relNoise: 0.01, empty: false }, eff: 0.5 });
  const runN = async (ev, ver = vs, cfg = baseCfg) => runAutoDesign(cfg, { evalShapes: async (d, cands) => ev(cands), verify: async (d) => ver(d), progress() {}, cancelled: () => false });
  const zeroOk = (cd) => !cd.kF;
  const a1 = await runN((cands) => cands.map((cd) => (zeroOk(cd) ? { cand: cd, ok: true, stats: statsOf(null), eff: 0.5 } : { cand: cd, ok: false, why: '간섭' })));
  ok(!a1.best.shape && /탈락/.test(a1.shapeNote ?? '') && /간섭/.test(a1.shapeNote) && /[0-9]+/.test(a1.shapeNote), `전부 간섭 → ${a1.shapeNote}`);
  const a2 = await runN((cands) => cands.map((cd) => ({ cand: cd, ok: true, stats: statsOf(null), eff: 0.5 })));
  ok(!a2.best.shape && /불균일|형상은 그대로/.test(a2.shapeNote ?? ''), `응답 없음 → ${a2.shapeNote}`);
  const a3 = await runN((cands) => stuck(cands));
  ok(!a3.best.shape && /여유 없음/.test(a3.shapeNote ?? ''), `움직일 여유 없음 → ${a3.shapeNote}`);
  const a4 = await runN((cands) => cands.map((cd) => ({ cand: cd, ok: false, why: '살두께' })));
  ok(!a4.best.shape && /살두께/.test(a4.shapeNote ?? ''), `지금 형상부터 위반 → ${a4.shapeNote}`);
  const a5 = await runN((cands) => cands.map((cd) => ({ cand: cd, ok: true, stats: statsOf(null), eff: 0.5 })), vs, { ...baseCfg, obs: { targetLen: 0.1, targetWid: 0.1 } });
  ok(!a5.best.shape && /목표 통과/.test(a5.shapeNote ?? ''), `이미 통과 → ${a5.shapeNote}`);
  const a6 = await runN((cands) => cands.map((cd) => ({ cand: cd, ok: true, stats: statsOf(cd.kF ?? null), eff: 0.5 })), (d) => ({ stats: { ...statsOf(null), relNoise: 0.01, empty: false }, eff: 0.5 }));
  ok(a6.unchanged && !a6.best.shape && /최종 판정/.test(a6.shapeNote ?? ''), `찾았지만 최종 판정에서 안 나음 → ${a6.shapeNote}`);
  // 빠른 형상(렌즈 후보 + 일정 2단계): 결과·이유
  const lensCfg = (extra) => ({ stages: { shape: true }, obs: O, current: { milky: 1, count: 5, pitch: 0, shape: null }, G, shapePart: 0, curve: false, schedule: [[99, 1, 1], [3, 2, 1]], shapeCands: [{ dt: 0, h: 0, R: 3, e: 0, c: 0 }, { dt: 0, h: 0.5, R: 3, e: 0, c: 0 }], ...extra });
    const sOf = (u) => ({ ...statsOf(null), profile: Array.from({ length: 100 }, (_, i) => u + ((1 - u) * i) / 99), Ulen: u, Uwid: 0.98 });
  const evL = (fn) => ({ evalShapes: async (d, cands) => fn(cands), verify: async (d) => ({ stats: { ...sOf(d.shape ? 0.95 : 0.8), relNoise: 0.01, empty: false }, eff: 0.5 }), progress() {}, cancelled: () => false });
    const l1 = await runAutoDesign(lensCfg(), evL((cands) => cands.map((cd) => ({ cand: cd, ok: true, stats: sOf(cd.h ? 0.95 : 0.8), eff: 0.5 }))));
  ok(l1.best.shape?.h === 0.5 && !l1.shapeNote, `렌즈 후보가 나으면 채택 (h ${l1.best.shape?.h})`);
  const l2 = await runAutoDesign(lensCfg(), evL((cands) => cands.map((cd) => ({ cand: cd, ok: true, stats: sOf(0.8), eff: 0.5 }))));
  ok(!l2.best.shape && /형상 후보 1개/.test(l2.shapeNote ?? '') && /나은 형상 없음/.test(l2.shapeNote), `효과 없으면 이유: ${l2.shapeNote}`);
  const l3 = await runAutoDesign(lensCfg(), evL((cands) => cands.map((cd) => ({ cand: cd, ok: false, why: '간섭' }))));
  ok(!l3.best.shape && /탈락/.test(l3.shapeNote ?? '') && /간섭/.test(l3.shapeNote), `모두 탈락: ${l3.shapeNote}`);
  const l4 = await runAutoDesign(lensCfg({ shapeCands: [], shapeEmptyWhy: '살두께 여유 없음' }), evL(() => []));
  ok(!l4.best.shape && l4.shapeNote === '살두께 여유 없음', '후보를 못 만든 이유 그대로');
  const a7 = await runN((cands) => cands.map((cd) => ({ cand: cd, ok: true, stats: statsOf(cd.kF ?? null), eff: 0.5 })));
  ok(a7.best.shape && !a7.shapeNote, '형상이 바뀌면 이유 문구 없음'); }
{ // 판정 근처 최종안은 노이즈 0.5% 로 다시 계산해 판정(2026-11-03) — 먼 현재안은 다시 계산 안 함
  const obs2 = { targetLen: 0.8, targetWid: 0.8 }, U = (m) => (m >= 2 ? 0.79 : 0.6), calls = [];
  const io = (hi) => ({ milkyRows: async (d, ms) => rowsOf(ms, U), progress() {}, cancelled: () => false, verify: async (d, o) => { calls.push([d.milky, o?.noise ?? null]); return { stats: { Ulen: o?.noise ? hi : U(d.milky), Uwid: 0.85, empty: false, relNoise: o?.noise ?? 0.01 }, eff: 0.2, photons: 1e7 }; } });
  const r = await runAutoDesign({ stages: { milky: true }, obs: obs2, current: { milky: 1 }, milkyMax: 3 }, io(0.81));
  ok(r.feasible && r.verified.stats.Ulen === 0.81 && calls.filter((c) => c[1]).length === 1 && calls.filter((c) => c[1])[0][1] === 0.005, `1% 0.79 → 0.5% 0.81 = 통과 (${JSON.stringify(calls)})`);
  calls.length = 0;
  const r2 = await runAutoDesign({ stages: { milky: true }, obs: obs2, current: { milky: 1 }, milkyMax: 3 }, io(0.795));
  ok(!r2.feasible && r2.verified.stats.Ulen === 0.795 && /0\.79|0\.80/.test(r2.reason), `0.5% 에서도 미달이면 미달 — ${r2.reason}`);
}
{ // 폭 위치: 2 mm 로 훑고 최고 위치의 ±1 mm 만 더(2026-11-03)
  const cs = [0, -1, -2, -3, -4, -5, -6, 1, 2];
  ok(lateralCoarse(cs).join() === '0,-2,-4,-6,2' && lateralFine(cs, -4).sort((a, b) => a - b).join() === '-5,-3' && lateralFine([0, -2, -3], -2).join() === '-3', '1차 짝수 · 2차 ±1 mm 중 후보에 있는 것만');
  const gain = { 0: 0.55, '-1': 0.56, '-2': 0.7, '-3': 0.8, '-4': 0.72 }, asked = [];
  const G = { ns: 100, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 100, closed: false, winS: 10, area: new Float64Array(100).fill(1), valid: new Uint8Array(100).fill(1) }, line = { length: 100, closed: false };
  const io = { progress() {}, cancelled: () => false, verify: async () => ({ stats: { Ulen: 0.9, Uwid: 0.9 }, eff: 0.2 }),
    evalLateral: async (d, list) => { asked.push(list.join()); return list.map((c) => ({ cand: { wCenter: c }, ok: true, eff: 0.2, stats: { Ulen: 0.5, Uwid: gain[c] } })); },
    basis: async (d) => { const cand = candidateGrid(line, { sStep: 2, wOffsets: [d.wCenter ?? 0] }); return { cand, emitted: 1, gaps: [], sMargin: 0, maps: cand.map(({ s }) => Float32Array.from({ length: 100 }, (_, i) => Math.exp(-((i + 0.5 - s) ** 2) / 72))) }; } };
  const r = await runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.7, targetWid: 0.95 }, current: { milky: 1, count: 5, pitch: 0 }, G, line, nMax: 20, lateral: [0, -1, -2, -3, -4] }, io);
  const lat = r.steps.find((x) => x.stage === 'ledsLateral');
  ok(lat.pick === -3 && asked.length === 2 && asked[0] === '0,-2,-4', `2 단계 비교로 -3 고름 (${asked.join(' | ')} → ${lat.pick})`);
}
{ // ② 근처 후보가 여럿이면 적은 개수부터 0.5% 로 재서 처음 통과한 안(2026-11-03) · 모두 미달이면 가장 가까운 안
  const G = { ns: 100, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 100, closed: false, winS: 10, area: new Float64Array(100).fill(1), valid: new Uint8Array(100).fill(1) }, line = { length: 100, closed: false };
  const cand = candidateGrid(line, { sStep: 2 }), maps = cand.map(({ s }) => Float32Array.from({ length: 100 }, (_, i) => Math.exp(-((i + 0.5 - s) ** 2) / 200))), B = { cand, maps, emitted: 1, gaps: [], sMargin: 0 };
  const run = async (hi) => { const fine = []; const r = await runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.8, targetWid: 0.5 }, current: { milky: 1, count: 5, pitch: 0, rows: 1 }, G, line, nMax: 30, rowsOptions: [1], ladderMs: 1e9 },
    { progress() {}, cancelled: () => false, basis: async () => B, verify: async (d, o) => { const n = d.count; if (o?.noise) fine.push(n); return { stats: { Ulen: o?.noise ? hi(n) : n === 5 ? 0.4 : 0.785, Uwid: 0.9, empty: false, relNoise: o?.noise ?? 0.011 }, eff: 0.2, photons: 1e7 }; } }); return { r, fine }; };
  const a = await run((n) => (n >= Infinity ? 0 : 0.79)), first = a.fine[0];
  ok(a.fine.length >= 2 && a.fine.length <= 3 && [...a.fine].sort((x, y) => x - y).join() === a.fine.join() && !a.r.feasible, `전부 미달: 적은 개수부터 ${a.fine.join()} (최대 3개)`);
  const b = await run((n) => (n > first ? 0.81 : 0.79));
  ok(b.r.feasible && b.r.best.count > first && b.r.verified.stats.Ulen === 0.81 && b.fine.length === 2, `개수 ${b.fine.join()}: 두 번째가 통과 → 그 안 (${b.r.best.count}개)`);
}
{ // ⑤ 높이 범위는 ② 로 옮긴 자리에서 다시 잼(2026-11-03)
  const seen = [], io = { progress() {}, cancelled: () => false, verify: async (d) => ({ stats: st(d.dz === 3 ? 0.9 : 0.5, 0.9), eff: 0.5 }), heightRange: (d) => { seen.push(d.tag); return [0, 3]; }, evalVariants: async (d, cands) => cands.map((c) => ({ cand: c, ok: true, eff: 0.5, stats: st(c.dz === 3 ? 0.9 : 0.5, 0.9) })) };
  const r = await runAutoDesign({ stages: { height: true }, obs, current: { milky: 1, tag: 'x' }, heightRange: [0, 1] }, io);
  ok(seen[0] === 'x' && r.best.dz === 3, `옮긴 자리 범위 [0, 3] 으로 후보 (+${r.best.dz})`);
}
{ // 최종 판정 = 화면 화질 격자(2026-11-03): 저화질 격자 통과여도 화면 격자로 다시 재서 판정
  const calls = [], io = { milkyRows: async (d, ms) => rowsOf(ms), verify: async (d, o = {}) => { calls.push(o); return o.screen ? { stats: { ...st(0.795, 0.9), relNoise: o.noise }, eff: 0.5, photons: 1e7 } : { stats: { ...st(0.82, 0.9), relNoise: 0.01 }, eff: 0.5, photons: 1e7 }; }, progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 3, count: 5, pitch: 0, shape: null }, milkyMax: 5, screenGrid: true }, io);
  ok(!r.feasible && r.verified.stats.Ulen === 0.795 && r.verified.stats.relNoise === 0.005 && calls.some((o) => o.screen && o.noise === 0.005), `화면 격자 0.795 = 미달(저화질 0.82 통과여도) · 노이즈 ${r.verified.stats.relNoise}`);
  ok(r.current.stats.Ulen === 0.795, '현재안도 같은 화면 격자로 비교'); }
{ // 화면 격자 통과 = 통과, 먼 값은 목표 노이즈(1%)까지만 · 점진 결과가 있으면 현재안은 다시 재지 않음
  const calls = [], cs = { stats: { ...st(0.7, 0.9), relNoise: 0.01 }, eff: 0.5, sharp: true }, io = { milkyRows: async (d, ms) => rowsOf(ms), verify: async (d, o = {}) => { calls.push(o); return { stats: { ...st(o.screen ? 0.85 : 0.82, 0.9), relNoise: o.noise ?? 0.01 }, eff: 0.5, photons: 1e7 }; }, progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs: { ...obs, targetNoise: 0.01 }, current: { milky: 3, count: 5, pitch: 0, shape: null }, milkyMax: 5, screenGrid: true, currentScreen: cs }, io);
  const sc = calls.filter((o) => o.screen);
  ok(r.feasible && r.verified.stats.Ulen === 0.85 && sc.length === 1 && sc[0].noise === 0.01 && r.current === cs, `통과 ${r.verified.stats.Ulen} · 화면 격자 ${sc.length}회 · 현재안 재사용`); }
{ // 화면 격자 미달 = 더 많은 LED 를 화면 격자로 확인해 처음 통과한 안 · 끝까지 미달이면 화면 격자 값으로 미달
  const G = { ns: 100, nw: 1, ds: 1, cell: 1, w0: -0.5, L: 100, closed: false, winS: 10, area: new Float64Array(100).fill(1), valid: new Uint8Array(100).fill(1) }, line = { length: 100, closed: false };
  const cand = candidateGrid(line, { sStep: 2 }), maps = cand.map(({ s }) => Float32Array.from({ length: 100 }, (_, i) => Math.exp(-((i + 0.5 - s) ** 2) / 200))), B = { cand, maps, emitted: 1, gaps: [], sMargin: 0 };
  const run = async (hi) => { const seen = []; const r = await runAutoDesign({ stages: { leds: true }, obs: { targetLen: 0.8, targetWid: 0.5 }, current: { milky: 1, count: 3, pitch: 0, rows: 1 }, G, line, nMax: 30, rowsOptions: [1], ladderMs: 1e9, screenGrid: true },
    { progress() {}, cancelled: () => false, basis: async () => B, verify: async (d, o = {}) => { if (o.screen) seen.push(d.count); return { stats: { Ulen: o.screen ? hi(d.count) : d.count === 3 ? 0.4 : 0.85, Uwid: 0.9, empty: false, relNoise: o.noise ?? 0.01 }, eff: 0.2, photons: 1e7 }; } }); return { r, seen }; };
  const a = await run(() => 0.79), first = a.seen[0];
  ok(!a.r.feasible && a.r.verified.stats.Ulen === 0.79, `끝까지 미달 → 화면 격자 값으로 미달 (${a.seen.join()})`);
  const b = await run((n) => (n === 3 ? 0.4 : n > first ? 0.81 : 0.79));
  ok(b.r.feasible && b.r.best.count > first && b.r.verified.stats.Ulen === 0.81, `저화질 통과 ${first}개가 화면 격자 미달 → ${b.r.best.count}개 (${b.seen.join()})`);
}
{ // 화면 격자 판정: 목표에서 먼 안은 시간 한도까지만(현재안 40개가 10 분 걸렸음) · 가까운 안은 한도 없음
  const calls = [], io = { milkyRows: async (d, ms) => rowsOf(ms), verify: async (d, o = {}) => { if (o.screen) calls.push([d.milky, o.maxMs]); return { stats: { ...st(d.milky === 3 ? 0.45 : 0.85, 0.9), relNoise: o.noise ?? 0.03 }, eff: 0.5, photons: 1e7 }; }, progress() {}, cancelled: () => false };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 3, count: 5, pitch: 0, shape: null }, milkyMax: 5, screenGrid: true }, io);
  ok(calls.length === 2 && calls.find((c) => c[0] === 3)?.[1] === 60000 && calls.find((c) => c[0] !== 3)?.[1] === undefined && r.feasible, `먼 현재안만 60 초 한도 (${JSON.stringify(calls)})`); }
done();
