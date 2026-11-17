// 대칭 영역 검토(2026-11-17 사용자, docs/superpowers/specs/2026-11-17-symmetry-fold-design.md)
// 도면을 자르지 않고, 대칭인 관측 칸의 값을 합친다(접기) — 칸마다 광선이 대칭 수만큼 늘어 같은 노이즈에 일찍 닿음.
// 쓰는 곳 = 최적화 빠른 검토 · 광분포 시뮬레이션. 최종 판정(정밀 검증)은 쓰지 않음(판정 숫자 그대로).
// 대칭 확인: 계산 전 = LED 위치·방향 · 관측면 칸(detectSym), 계산 중 = 짝 칸 차이가 노이즈보다 큰지(asymCheck) — 크면 끄고 이유 표시.
import { tallyStats } from './tally.js';

export const SYM_TOL = { pos: 0.25, rotPos: 0.05, dir: 0.035, area: 0.05 };   // LED 위치 mm · 링 회전 LED 위치 mm(간격이 정확히 같을 때만 — 5.75/6.00 mm 섞인 링을 합치면 길이 +9%p, 2026-11-17) · 방향 성분(≈2°) · 칸 면적 비

// LED → 라인 좌표 { s, w, h, as, aw } — as·aw = 방향의 길이·폭 성분(거울 짝은 as 부호가 반대). 순수(라인 객체 필요)
export function ledsSW(line, emitters) {
  const F = line.frame, cyl = line.data?.surface === 'cylinder';
  return emitters.map((e) => {
    const [x, y] = line.to2D(e.pos), [s, w] = line.toSW(x, y), h = F?.d ? e.pos[0] * F.d[0] + e.pos[1] * F.d[1] + e.pos[2] * F.d[2] : 0;
    if (cyl || !F?.u) return { s, w, h, as: 0, aw: 0 };
    const [tx, ty] = line.tangentAt(s), t3 = [0, 1, 2].map((k) => tx * F.u[k] + ty * F.v[k]), w3 = [0, 1, 2].map((k) => -ty * F.u[k] + tx * F.v[k]);
    const a = e.axis ?? [0, 0, 1], d = (u) => a[0] * u[0] + a[1] * u[1] + a[2] * u[2];
    return { s, w, h, as: d(t3), aw: d(w3) };
  });
}
// LED 집합이 변환 f 로 자기 자신과 겹치는지(짝 찾기, 위치·높이·방향)
function ledsMatch(leds, f, closedL = 0, tol = SYM_TOL) {
  const used = new Set();
  for (const a of leds) {
    const m = f(a); let hit = -1;
    leds.forEach((b, k) => {
      if (hit >= 0 || used.has(k)) return;
      let ds = Math.abs(b.s - m.s); if (closedL > 0) ds = Math.min(ds, closedL - ds);
      if (ds <= tol.pos && Math.abs(b.w - m.w) <= tol.pos && Math.abs(b.h - m.h) <= tol.pos && Math.abs(b.as - m.as) <= tol.dir && Math.abs(b.aw - m.aw) <= tol.dir) hit = k;
    });
    if (hit < 0) return false;
    used.add(hit);
  }
  return true;
}
// 닫힌 라인 LED 회전 대칭 수(칸 수와 무관) — LED 수를 나누는 가장 큰 d 로 L/d 만큼 돌려도 겹치면 d, 없으면 0
export function rotCount(leds, L, tol = SYM_TOL) {
  const n = leds?.length ?? 0;
  const t = { ...tol, pos: tol.rotPos ?? tol.pos };
  for (let d = n; d >= 2; d--) if (!(n % d) && ledsMatch(leds, (a) => ({ ...a, s: (a.s + L / d) % L }), L, t)) return d;
  return 0;
}
// 칸 면적이 줄·열 짝끼리 같은지(관측면 모양) — r(i)·c(j) = 짝 줄·열
function areaMatch(G, r, c, tol = SYM_TOL) {
  const { ns, nw, area, valid } = G, ref = G.ds * G.cell;
  for (let i = 0; i < ns; i++) for (let j = 0; j < nw; j++) {
    const k = i * nw + j, k2 = r(i) * nw + c(j), a = valid[k] ? area[k] : 0, b = valid[k2] ? area[k2] : 0;
    if (Math.abs(a - b) > tol.area * ref) return false;
  }
  return true;
}
// 대칭 판별(순수) — G = 집계 격자, leds = ledsSW 결과. 반환 { len, wid, rot, why[] }
// len = 열린 라인 길이 거울(s ↔ L − s) · wid = 폭 거울(w ↔ −w) · rot = 닫힌 라인 회전 대칭 수(칸 수를 나누는 가장 큰 것, 없으면 0)
export function detectSym(G, leds, tol = SYM_TOL) {
  const why = [], L = G.ns * G.ds, id = (i) => i, none = { len: false, wid: false, rot: 0, why };
  if (!leds?.length) { why.push('LED 없음'); return none; }
  let len = false, rot = 0;
  if (!G.closed) {
    const okL = ledsMatch(leds, (a) => ({ ...a, s: L - a.s, as: -a.as }), 0, tol), okA = okL && areaMatch(G, (i) => G.ns - 1 - i, id, tol);
    len = okL && okA;
    if (!okL) why.push('길이 거울: LED 위치·방향이 좌우로 맞지 않음');
    else if (!okA) why.push('길이 거울: 관측면 모양이 좌우로 다름');
  } else {
    const d = rotCount(leds, L, tol), per = d ? G.ns / d : 0;
    // 칸 수가 d 로 나뉘면 한 주기 이동, 아니면 모든 줄이 같아야(링) — 줄을 간격 안 위치별로 묶음
    if (d && areaMatch(G, Number.isInteger(per) ? (i) => (i + per) % G.ns : (i) => (i + 1) % G.ns, id, tol)) rot = d;
    if (!rot) why.push('회전: LED 간격이 정확히 같지 않음(0.05 mm 넘게 다름)');
  }
  const okW = ledsMatch(leds, (a) => ({ ...a, w: -a.w, aw: -a.aw }), G.closed ? L : 0, tol), okWA = okW && areaMatch(G, id, (j) => G.nw - 1 - j, tol);
  if (!okW) why.push('폭 거울: LED 가 폭 가운데에 대칭이 아님');
  else if (!okWA) why.push('폭 거울: 관측면 모양이 폭 양쪽으로 다름');
  return { len, wid: okW && okWA, rot, why };
}
// 접기 계획(순수) — 칸 (i, j) → 접은 칸 (r(i), c(j)). 반환 { G(접은 격자), r, c, factor, label, idx(전체 칸 → 접은 칸) }
export function foldPlan(G, sym) {
  const { ns, nw, ds } = G, len = !!sym?.len && !G.closed, rot = G.closed && sym?.rot >= 2 ? sym.rot : 0, wid = !!sym?.wid;
  // 회전: 칸 수가 rot 로 나뉘면 한 주기(줄 그대로), 아니면 줄 가운데의 간격 안 위치로 묶음 — 묶음 폭 = 칸 폭 ⅓ 이하이면서 간격의 1/24 이하.
  // 묶음이 넓으면 LED 사이 골이 평균돼 길이 균일도가 높게 나옴(합성 링 칸 151·LED 39: 1/8 +2.5%p · 1/16 +0.6%p · 1/24 +0.3%p — 늘 높은 쪽)
  const Pr = rot ? (ns * ds) / rot : 0, exact = rot && ns % rot === 0;
  const nsF = rot ? (exact ? ns / rot : Math.max(24, Math.ceil((3 * Pr) / ds - 1e-9))) : len ? Math.ceil(ns / 2) : ns, nwF = wid ? Math.ceil(nw / 2) : nw;
  const rowOf = new Int32Array(ns), colOf = new Int32Array(nw);
  for (let i = 0; i < ns; i++) rowOf[i] = rot ? (exact ? i % nsF : Math.floor(((((i + 0.5) * ds) % Pr) / Pr) * nsF) % nsF) : len ? Math.min(i, ns - 1 - i) : i;
  for (let j = 0; j < nw; j++) colOf[j] = wid ? Math.min(j, nw - 1 - j) : j;
  const r = (i) => rowOf[i], c = (j) => colOf[j];
  const idx = new Int32Array(ns * nw), valid = new Uint8Array(nsF * nwF), area = new Float64Array(nsF * nwF);
  for (let i = 0; i < ns; i++) for (let j = 0; j < nw; j++) {
    const k = i * nw + j, kf = rowOf[i] * nwF + colOf[j]; idx[k] = kf;
    if (G.valid[k]) { valid[kf] = 1; area[kf] += G.area[k]; }
  }
  const factor = (rot || (len ? 2 : 1)) * (wid ? 2 : 1);
  // 실제 빨라지는 정도 — 계산은 길이 줄·폭 열 노이즈 중 큰 쪽이 목표에 닿을 때 끝남. 길이 줄은 폭을 이미 다 더한 값이라 폭 거울로는 안 줄어듦
  // (실측 평판 1열: 길이·폭 거울 ×4 합침 → 광선 466만 → 219만, ×2.1). 회전 = 묶음 하나에 든 줄 수
  const rowF = rot ? Math.floor(ns / nsF) : len ? 2 : 1, speed = Math.min(rowF, factor);
  const label = rot ? `회전 1/${rot}${wid ? ' · 폭 ½' : ''}` : [len ? '길이 ½' : '', wid ? '폭 ½' : ''].filter(Boolean).join(' · ');
  const g = { ...G, ns: nsF, nw: nwF, ds: rot ? Pr / nsF : ds, L: rot ? Pr : nsF * ds, valid, area, closed: rot ? true : len ? false : G.closed, validAll: undefined, areaAll: undefined };
  return { G: g, r, c, rowOf, colOf, idx, factor, speed, label };
}
// 칸 값 합치기(유효 칸만) — 접은 격자 크기
export function foldArr(P, a, G = null) {
  const o = new Float64Array(P.G.ns * P.G.nw), v = G?.valid;
  for (let k = 0; k < a.length; k++) if (!v || v[k]) o[P.idx[k]] += a[k];
  return o;
}
// 결과 검사(순수) — 짝 줄(길이·회전)·짝 열(폭)의 평균 밝기 차이를 묶음 사이 퍼짐과 비교. 차이가 노이즈보다 뚜렷하면 ok = false
// 묶음 5개 미만이면 검사하지 않음(ok, checked = false)
export function asymCheck(P, G, accs) {
  const B = accs.length;
  if (B < 5) return { ok: true, checked: false, chi: 0 };
  const { ns, nw, valid, area } = G, rowV = (a) => { const p = new Float64Array(ns).fill(NaN); for (let i = 0; i < ns; i++) { let s = 0, ar = 0; for (let j = 0; j < nw; j++) { const k = i * nw + j; if (valid[k]) { s += a[k]; ar += area[k]; } } if (ar > 0) p[i] = s / ar; } return p; };
  const colV = (a) => { const q = new Float64Array(nw).fill(NaN); for (let j = 0; j < nw; j++) { let s = 0, ar = 0; for (let i = 0; i < ns; i++) { const k = i * nw + j; if (valid[k]) { s += a[k]; ar += area[k]; } } if (ar > 0) q[j] = s / ar; } return q; };
  // 짝 = 같은 접은 칸으로 묶인 줄(열)끼리 차례로 — 거울 = 2개, 회전 = 여러 개
  const pairs = [], chain = (of, n, t) => { const last = new Map(); for (let x = 0; x < n; x++) { const g = of[x]; if (last.has(g)) pairs.push([t, last.get(g), x]); last.set(g, x); } };
  if (P.G.ns < ns) chain(P.rowOf, ns, 'r');
  if (P.G.nw < nw) chain(P.colOf, nw, 'c');
  const R = accs.map(rowV), C = pairs.some((p) => p[0] === 'c') ? accs.map(colV) : null;
  let s2 = 0, n = 0, zMax = 0;
  for (const [t, x, y] of pairs) {
    const V = t === 'r' ? R : C, d = V.map((v) => (v[x] - v[y])), m = (V.reduce((s, v) => s + v[x] + v[y], 0)) / (2 * B);
    if (!(m > 0) || d.some((v) => !Number.isFinite(v))) continue;
    const md = d.reduce((s, v) => s + v, 0) / B, sd = Math.sqrt(d.reduce((s, v) => s + (v - md) ** 2, 0) / (B - 1)) / Math.sqrt(B);
    if (!(sd > 0)) continue;
    const z = md / sd; s2 += z * z; n++; zMax = Math.max(zMax, Math.abs(z));
  }
  if (!n) return { ok: true, checked: false, chi: 0 };
  const chi = s2 / n, exp = (B - 1) / (B - 3);   // 대칭이면 z ~ t(B−1) → z² 평균 ≈ (B−1)/(B−3)
  return { ok: chi <= 2 * exp + 4 * Math.sqrt(2 / n) * exp && zMax <= 8, checked: true, chi };
}
// 대칭 합치기 판정값(순수) — sym = 작업의 대칭 정보(detectSym 결과, 이 함수가 off 를 적어 둠). 없거나 끔 = tallyStats 그대로
// 결과의 profile·map 은 전체 격자 크기로 펼침(짝 칸 같은 값) · sym = { label, factor, off }
export function symStats(G, accs, obs, cnts = null, sym = null) {
  if (!sym) return tallyStats(G, accs, obs, cnts);
  if (!sym.len && !sym.wid && !sym.rot) return { ...tallyStats(G, accs, obs, cnts), sym: { label: '', factor: 1, off: sym.why?.[0] ?? '대칭 없음' } };   // 켜져 있지만 대칭 아님 — 상태 줄에 '대칭 아님'
  const P = foldPlan(G, sym);
  if (P.factor < 2 || P.G.ns >= G.ns) return tallyStats(G, accs, obs, cnts);   // 묶음이 줄보다 많으면(짧은 링) 합칠 것 없음
  if (!sym.off) { const a = asymCheck(P, G, accs); if (!a.ok) sym.off = `대칭 아님(결과 검사: 짝 칸 차이가 노이즈보다 큼) — 전체 계산`; }
  if (sym.off) return { ...tallyStats(G, accs, obs, cnts), sym: { label: P.label, factor: 1, off: sym.off } };
  const st = tallyStats(P.G, accs.map((a) => foldArr(P, a, G)), obs, cnts ? cnts.map((a) => foldArr(P, a, G)) : null);
  const profile = new Float64Array(G.ns), map = new Float64Array(G.ns * G.nw);
  for (let i = 0; i < G.ns; i++) profile[i] = st.profile[P.r(i)];
  for (let k = 0; k < map.length; k++) if (G.valid[k]) map[k] = st.map[P.idx[k]];
  return { ...st, profile, map, sym: { label: P.label, factor: P.factor, speed: P.speed, off: '' } };
}
// 화면용 면 전체 지도(validAll·areaAll)도 짝 칸 평균으로 — sum = 묶음 합(칸별), B = 묶음 수. 반환 = 칸 밝기(합 ÷ B ÷ 면적), 짝 칸 같은 값
export function symMapAll(G, sum, B, sym) {
  const g = { ...G, valid: G.validAll, area: G.areaAll }, P = foldPlan(g, sym), f = foldArr(P, sum, g), m = new Float64Array(G.ns * G.nw);
  for (let k = 0; k < m.length; k++) if (g.valid[k]) { const a = P.G.area[P.idx[k]]; m[k] = a > 0 ? f[P.idx[k]] / B / a : 0; }
  return m;
}
// 대칭 안내용 { label, factor, off } — 합칠 대칭이 없으면 off = '대칭 아님 — 전체 계산'
export function symInfo(G, sym) {
  if (!sym) return null;
  const P = foldPlan(G, sym);
  return P.factor > 1 ? { label: P.label, factor: P.factor, speed: P.speed, off: '' } : { label: '', factor: 1, off: sym.why?.[0] ?? '대칭 없음' };
}
