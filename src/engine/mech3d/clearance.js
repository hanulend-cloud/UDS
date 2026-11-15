// 부품 간격·간섭 — 선택 부품 기준 이웃 부품과의 최소 간격, LED 거리, 크기·위치 조절 시 간섭 직전까지 제한.
// 간격: 표본점(정점 + 삼각형 중심) → 상대 메쉬 최근접점(BVH 상자 질의). 양방향 최솟값. 평행 면·정점 근접은 정확,
// 큰 삼각형의 모서리끼리 엇갈린 경우는 조금 크게 나올 수 있다(표본 한계).
// 간섭: 한 부품의 표본점이 다른 부품 솔리드 안이고 그 표면에서 tol(기본 0.02mm) 보다 깊을 때. 맞붙은 면(접촉)은 간섭 아님.
import { buildBvh, queryBox, intersectRay } from './bvh.js';
import { bounds } from './mesh.js';
import { insidePart } from './checks.js';
import { scaleMoveMesh, isIdentityXform } from './xform.js';

export const TOL = 0.02;

// 점 p 에서 삼각형 abc 위 최근접점 (Ericson, Real-Time Collision Detection 5.1.5)
export function closestOnTri(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]; }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}

const BVH = new WeakMap(), SAMPLES = new WeakMap(), BOX = new WeakMap();
const bvhOf = (m) => m.bvh ?? (BVH.get(m) || (BVH.set(m, buildBvh(m.positions, m.triangles)), BVH.get(m)));
const boxOf = (m) => BOX.get(m) || (BOX.set(m, bounds(m.positions)), BOX.get(m));
const solid = (m) => (m.bvh ? m : { ...m, bvh: bvhOf(m) });
// 표본점: 정점 + 삼각형 중심 (Float64Array xyz…) — 간격용
function samplesOf(m) {
  let s = SAMPLES.get(m);
  if (s) return s;
  const P = m.positions, T = m.triangles, nv = P.length / 3, nt = T.length / 3;
  s = new Float64Array((nv + nt) * 3);
  s.set(P);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) s[(nv + t) * 3 + k] = (P[3 * T[3 * t] + k] + P[3 * T[3 * t + 1] + k] + P[3 * T[3 * t + 2] + k]) / 3;
  SAMPLES.set(m, s);
  return s;
}
// 간섭용 표본점: 위 표본 + 삼각형 중심을 자기 안쪽으로 INSET 만큼 들인 점. 표면이 완전히 겹친 경우(같은 자리 두 부품)도
// 잡고, 맞붙은 면(접촉)의 안쪽 점은 상대 밖이라 오탐하지 않는다.
// 안쪽 방향은 삼각형마다 홀짝으로 정한다(STEP 메쉬는 면마다 감은 방향이 뒤집혀 있을 수 있음). 양수 배율·이동에는
// 변하지 않으므로 삼각형 배열(변환 사본과 공유)별로 한 번만 계산한다
const INSET = 0.05, INNER = new WeakMap(), SIDE = new WeakMap();
function insetSides(m) {
  let sd = SIDE.get(m.triangles);
  if (sd) return sd;
  const P = m.positions, T = m.triangles, nt = T.length / 3, ms = solid(m);
  sd = new Int8Array(nt);
  for (let t = 0; t < nt; t++) {
    const { c, n } = triCN(P, T, t);
    if (!n) continue;
    if (insidePart(ms, c.map((v, k) => v - INSET * n[k]))) sd[t] = 1;
    else if (insidePart(ms, c.map((v, k) => v + INSET * n[k]))) sd[t] = -1;
  }
  SIDE.set(m.triangles, sd);
  return sd;
}
// 큰 부품(삼각형 LOCAL_MIN 개 이상)은 상대 부품 근처 삼각형만 봄(2026-11-15) — 100 MB 도면에서 LED 하나를 볼 때마다 큰 부품의 표본점 전체(수백만 개)를 훑어
// 기구 최적화 준비에 화면이 53초 멈췄음(높이 범위 13초 + 폭 위치 후보 40초). 근처 삼각형은 부품 BVH 로 찾고, 안쪽 방향(insetSides)도 그 삼각형만 그때 계산. 결과는 전체를 훑을 때와 같음
let LOCAL_MIN = 20000;
export const setLocalMin = (n) => { LOCAL_MIN = n; };   // 시험용(Infinity = 항상 전체)
const isBig = (m) => m.triangles.length / 3 >= LOCAL_MIN;
const SIDE_LAZY = new WeakMap();
function sideOf(m, t) {
  const full = SIDE.get(m.triangles);
  if (full) return full[t];
  let sd = SIDE_LAZY.get(m.triangles);
  if (!sd) { sd = new Int8Array(m.triangles.length / 3).fill(2); SIDE_LAZY.set(m.triangles, sd); }
  if (sd[t] === 2) {
    const { c, n } = triCN(m.positions, m.triangles, t), ms = solid(m);
    sd[t] = !n ? 0 : insidePart(ms, c.map((v, k) => v - INSET * n[k])) ? 1 : insidePart(ms, c.map((v, k) => v + INSET * n[k])) ? -1 : 0;
  }
  return sd[t];
}
const trisNear = (m, b, pad) => queryBox(bvhOf(m), [b[0] - pad, b[1] - pad, b[2] - pad], [b[3] + pad, b[4] + pad, b[5] + pad], []);
// 상자 b 근처 삼각형의 간섭용 표본점(innerSamplesOf 와 같은 점: 정점·중심·안쪽으로 들인 중심)마다 fn(x, y, z) — fn 이 true 면 멈추고 true
function eachLocalInner(m, b, fn) {
  const P = m.positions, T = m.triangles, seen = new Set();
  for (const t of trisNear(m, b, INSET)) {
    for (let j = 0; j < 3; j++) { const v = T[3 * t + j]; if (!seen.has(v)) { seen.add(v); if (fn(P[3 * v], P[3 * v + 1], P[3 * v + 2])) return true; } }
    const { c, n } = triCN(P, T, t);
    if (fn(c[0], c[1], c[2])) return true;
    const sd = n ? sideOf(m, t) : 0;
    if (sd && fn(c[0] - sd * INSET * n[0], c[1] - sd * INSET * n[1], c[2] - sd * INSET * n[2])) return true;
  }
  return false;
}
function triCN(P, T, t) {
  const a = vtx(P, T[3 * t]), b = vtx(P, T[3 * t + 1]), c = vtx(P, T[3 * t + 2]);
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n);
  return { c: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], n: l ? n.map((x) => x / l) : null };
}
function innerSamplesOf(m) {
  let s = INNER.get(m);
  if (s) return s;
  const base = samplesOf(m), P = m.positions, T = m.triangles, sd = insetSides(m), pts = [];
  for (let t = 0; t < sd.length; t++) {
    if (!sd[t]) continue;
    const { c, n } = triCN(P, T, t);
    pts.push(c[0] - sd[t] * INSET * n[0], c[1] - sd[t] * INSET * n[1], c[2] - sd[t] * INSET * n[2]);
  }
  s = new Float64Array(base.length + pts.length);
  s.set(base); s.set(pts, base.length);
  INNER.set(m, s);
  return s;
}
const boxDist = (b, p) => Math.hypot(Math.max(b[0] - p[0], 0, p[0] - b[3]), Math.max(b[1] - p[1], 0, p[1] - b[4]), Math.max(b[2] - p[2], 0, p[2] - b[5]));
const boxBoxDist = (a, b) => Math.hypot(Math.max(a[0] - b[3], 0, b[0] - a[3]), Math.max(a[1] - b[4], 0, b[1] - a[4]), Math.max(a[2] - b[5], 0, b[2] - a[5]));
const vtx = (P, i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];

// 메쉬 m 표면에서 점 p 의 최근접점 — r 안에서만(없으면 null). 반환 { d, q }
export function nearestOnMesh(m, p, r = Infinity) {
  // BVH 를 가까운 상자부터 내려가며 찾음(2026-11-15). 전에는 상자를 1 mm 에서 2배씩 키워 가며 그 안 삼각형을 전부 봤는데,
  // 촘촘한 큰 부품(타공 그릴 20만 삼각형)의 표면에서 먼 점이면 마지막 상자에 삼각형이 수만 개 들어와 LED 하나 간섭 검사에 0.16초(72개 × 후보 수 = 화면 멈춤)
  const P = m.positions, T = m.triangles, { box, meta, order } = bvhOf(m);
  if (!order.length) return null;
  const bd0 = (n) => { const b = n * 6; return Math.hypot(Math.max(box[b] - p[0], 0, p[0] - box[b + 3]), Math.max(box[b + 1] - p[1], 0, p[1] - box[b + 4]), Math.max(box[b + 2] - p[2], 0, p[2] - box[b + 5])); };
  let R = r, q0 = null;
  const stack = [0], dist = [bd0(0)];
  while (stack.length) {
    const n = stack.pop(), dn = dist.pop();
    if (dn > R) continue;
    const cnt = meta[n * 2 + 1];
    if (cnt) {
      for (let i = meta[n * 2], e = i + cnt; i < e; i++) {
        const t = order[i], q = closestOnTri(p, vtx(P, T[3 * t]), vtx(P, T[3 * t + 1]), vtx(P, T[3 * t + 2])), d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        if (d <= R && (!q0 || d < R)) { R = d; q0 = q; }
      }
    } else {
      const a = n + 1, b = meta[n * 2], da = bd0(a), db = bd0(b);
      if (da < db) { stack.push(b, a); dist.push(db, da); } else { stack.push(a, b); dist.push(da, db); }   // 가까운 쪽을 먼저 꺼냄
    }
  }
  return q0 ? { d: R, q: q0 } : null;
}

// 두 메쉬의 최소 간격(≤ maxDist 일 때만) — { gap, pa, pb } | null
export function meshGap(A, B, maxDist = 20) {
  if (boxBoxDist(boxOf(A), boxOf(B)) > maxDist) return null;
  let best = maxDist, out = null;
  const cand = [];
  for (const [X, Y, flip] of [[A, B, false], [B, A, true]]) {
    const s = samplesOf(X), by = boxOf(Y);
    for (let i = 0; i < s.length; i += 3) {
      const p = [s[i], s[i + 1], s[i + 2]];
      if (boxDist(by, p) > best) continue;
      const h = nearestOnMesh(Y, p, best, cand);
      if (h && h.d < best) { best = h.d; out = flip ? { pa: h.q, pb: p } : { pa: p, pb: h.q }; }
    }
  }
  return out ? { gap: best, ...out } : null;
}

// A 가 B 를 파고든 깊이(양방향 표본점 중 상대 솔리드 안 + 표면에서 가장 먼 것) — { depth, pos } | null(tol 이하)
// stopAt: 겹침 깊이가 이 값을 넘는 점을 찾으면 바로 반환(최대 깊이 대신 '넘는가' 만 — newInterference 용)
export function meshPenetration(A, B, tol = TOL, stopAt = Infinity) {
  const ba = boxOf(A), bb = boxOf(B);
  if (boxBoxDist(ba, bb) > 0) return null;
  // 지름길(2026-11-15): 한쪽 표면이 상대 상자 근처를 지나지 않으면 상대는 통째로 그 안이거나 밖 — 밖이면 겹침 없음(점 하나로 판정).
  // 큰 케이스 상자 안에 든 LED 처럼 '상자는 겹치지만 표면은 먼' 쌍이 대부분이라, LED 표본 천여 개를 부품마다 하나씩 재던 시간(LED 하나 44 ms)을 없앰
  for (const [X, Y, bx] of [[A, B, ba], [B, A, bb]]) {
    if (!X.positions.length || trisNear(Y, bx, INSET * 2).length) continue;
    if (!insidePart(solid(Y), [X.positions[0], X.positions[1], X.positions[2]])) return null;
  }
  let out = null;
  const cand = [];
  for (const [X, Y] of [[A, B], [B, A]]) {
    const by = boxOf(Y), Ys = solid(Y);
    const visit = (x, y, z) => {
      const p = [x, y, z];
      if (boxDist(by, p) > 0) return false;
      const h = nearestOnMesh(Y, p, Infinity, cand);
      if (!h || h.d <= Math.max(tol, out?.depth ?? 0)) return false;   // 표면 근처(접촉면)·이미 더 깊은 것 있음
      if (insidePart(Ys, p)) { out = { depth: h.d, pos: p }; if (h.d > stopAt) return true; }
      return false;
    };
    if (isBig(X)) { if (eachLocalInner(X, by, visit)) return out; continue; }
    const s = innerSamplesOf(X);
    for (let i = 0; i < s.length; i += 3) if (visit(s[i], s[i + 1], s[i + 2])) return out;
  }
  return out;
}

// 간섭 부위(2026-11-02) — 겹친 덩어리의 겉면 = A 표면 중 B 안 + B 표면 중 A 안. 상대 표면 근처의 삼각형만 잘게 나눠(최소 0.25 mm) 경계를 따라가고,
// 상대 표면에서 먼 삼각형은 통째로 안/밖 판정. 맞붙은 면은 뺌. 반환 삼각형 좌표 배열(xyz × 3 × n)
export function clashRegion(A, B, tol = TOL, maxTris = 40000, maxTests = 2e6) {
  const ba = boxOf(A), bb = boxOf(B), lo = [0, 1, 2].map((k) => Math.max(ba[k], bb[k])), hi = [0, 1, 2].map((k) => Math.min(ba[k + 3], bb[k + 3]));
  const cell = Math.max(0.05, Math.min(0.25, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 40)), out = [], near = [];
  for (const [X, Y] of [[A, B], [B, A]]) {   // 시험 횟수는 방향마다 따로 — 한쪽이 다 써서 다른 쪽 표식이 빠지지 않게
    let tests = 0;
    const Ys = solid(Y), by = boxOf(Y), P = X.positions, T = X.triangles;
    const keep = (p) => boxDist(by, p) === 0 && insidePart(Ys, p);
    const cut = (a, b, c, d) => {
      if (out.length >= maxTris * 9 || tests >= maxTests) return;
      for (let k = 0; k < 3; k++) if (Math.max(a[k], b[k], c[k]) < lo[k] || Math.min(a[k], b[k], c[k]) > hi[k]) return;
      const p = a.map((v, k) => (v + b[k] + c[k]) / 3), L = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), Math.hypot(b[0] - c[0], b[1] - c[1], b[2] - c[2]), Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]));
      tests++;
      if (L > cell && d < 12) {
        if (nearestOnMesh(Y, p, L, near)) {   // 상대 표면이 가까움 = 경계가 지날 수 있음 → 4등분
          const ab = a.map((v, k) => (v + b[k]) / 2), bc = b.map((v, k) => (v + c[k]) / 2), ca = c.map((v, k) => (v + a[k]) / 2);
          cut(a, ab, ca, d + 1); cut(ab, b, bc, d + 1); cut(ca, bc, c, d + 1); cut(ab, bc, ca, d + 1);
        } else if (keep(p)) out.push(...a, ...b, ...c);   // 삼각형 전체가 한쪽
        return;
      }
      if (!nearestOnMesh(Y, p, tol, near) && keep(p)) out.push(...a, ...b, ...c);
    };
    for (const t of queryBox(bvhOf(X), lo, hi, [])) cut(vtx(P, T[3 * t]), vtx(P, T[3 * t + 1]), vtx(P, T[3 * t + 2]), 0);
  }
  return out;
}
// 모든 부품 쌍의 간섭 — parts[i] = null 이면 뺌(추적 제외·광원으로 옮긴 부품). [{ a, b, depth, pos, positions, triangles }]
export function allPartClashes(parts, tol = TOL) {
  const out = [];
  for (let a = 0; a < parts.length; a++) {
    if (!parts[a]) continue;
    for (let b = a + 1; b < parts.length; b++) {
      if (!parts[b]) continue;
      const pen = meshPenetration(parts[a], parts[b], tol);
      if (!pen) continue;
      const r = clashRegion(parts[a], parts[b], tol);
      out.push({ a, b, depth: pen.depth, pos: pen.pos, positions: Float32Array.from(r), triangles: Uint32Array.from({ length: r.length / 3 }, (_, i) => i) });
    }
  }
  return out;
}

// 선택 부품 i 의 간격 표 — parts: 기구 부품(변환 반영), ledParts: LED STEP 메쉬(PCB·LED, 없으면 []), emitters: [{pos, axis}]
// 반환 { parts: [{ part, gap, pa, pb, depth }] (간격 순), leds: [{ part, gap, pa, pb, depth }], ledMin: { led, dist, pa, pb } | null, ledAxial: { led, dist } | null }
export function partClearance(parts, i, { ledParts = [], emitters = [], maxDist = 20 } = {}) {
  const me = parts[i], row = (m, j) => {
    const pen = meshPenetration(me, m);
    if (pen) return { part: j, gap: 0, depth: pen.depth, pa: pen.pos, pb: pen.pos };
    const g = meshGap(me, m, maxDist);
    return g ? { part: j, gap: g.gap, depth: 0, pa: g.pa, pb: g.pb } : null;
  };
  const list = parts.map((m, j) => (j === i ? null : row(m, j))).filter(Boolean).sort((a, b) => a.gap - b.gap || b.depth - a.depth);
  const leds = ledParts.map((m, j) => row(m, j)).filter(Boolean).sort((a, b) => a.gap - b.gap || b.depth - a.depth);
  let ledMin = null, ledAxial = null;
  const Ms = solid(me);
  emitters.forEach((e, k) => {
    const h = nearestOnMesh(me, e.pos);
    if (h && (!ledMin || h.d < ledMin.dist)) ledMin = { led: k, dist: h.d, pa: e.pos, pb: h.q };
    const al = Math.hypot(...e.axis) || 1, hit = intersectRay(Ms.bvh, e.pos[0], e.pos[1], e.pos[2], e.axis[0] / al, e.axis[1] / al, e.axis[2] / al, 1e-6);
    if (hit && (!ledAxial || hit.t < ledAxial.dist)) ledAxial = { led: k, dist: hit.t };
  });
  return { parts: list, leds, ledMin, ledAxial };
}

// 후보 메쉬가 일으키는 간섭 목록 — 키 'p:j'(기구 부품) | 'l:j'(LED STEP 메쉬) | 'e:k'(발광점이 부품 안)
export function interferenceKeys(cand, others, ledParts = [], emitters = [], tol = TOL) {
  const out = new Map();
  others.forEach((m, j) => { if (m && m !== cand) { const p = meshPenetration(cand, m, tol); if (p) out.set(`p:${j}`, p.depth); } });
  ledParts.forEach((m, j) => { const p = meshPenetration(cand, m, tol); if (p) out.set(`l:${j}`, p.depth); });
  const Cs = solid(cand), cb = boxOf(cand);
  emitters.forEach((e, k) => {
    const al = Math.hypot(...e.axis) || 1, q = e.pos.map((v, d) => v + (0.05 * e.axis[d]) / al);
    if (boxDist(cb, q) === 0 && insidePart(Cs, q)) out.set(`e:${k}`, 0);
  });
  return out;
}

// 새로 생긴 간섭의 첫 키(없으면 null) — before = interferenceKeys(원래 형상) 의 키→깊이. 새 키(any 겹침) 또는 기존보다 margin 넘게 깊어짐.
// interferenceKeys 와 같은 판정이지만 찾는 즉시 멈춤(깊게 겹친 형상 후보에서 깊이를 끝까지 재느라 화면이 수십 초 멈추던 것)
export function newInterference(cand, others, ledParts = [], before = new Map(), margin = 0.05, tol = TOL) {
  const test = (k, m) => {
    const lim = before.has(k) ? (before.get(k) ?? 0) + margin : 0, p = meshPenetration(cand, m, tol, lim);
    return p && p.depth > lim ? k : null;
  };
  for (let j = 0; j < others.length; j++) { const m = others[j]; if (m && m !== cand) { const k = test(`p:${j}`, m); if (k) return k; } }
  for (let j = 0; j < ledParts.length; j++) { const k = test(`l:${j}`, ledParts[j]); if (k) return k; }
  return null;
}

const lerpXf = (a, b, t) => {
  const A = { offset: a?.offset ?? [0, 0, 0], scale: a?.scale ?? [1, 1, 1] }, B = { offset: b?.offset ?? [0, 0, 0], scale: b?.scale ?? [1, 1, 1] };
  const r = (x) => Math.round(x * 1e4) / 1e4;
  return { offset: A.offset.map((v, k) => r(v + (B.offset[k] - v) * t)), scale: A.scale.map((v, k) => r(v + (B.scale[k] - v) * t)) };
};
// 크기·위치 바꾸기를 간섭 직전까지 제한 — raw: 원본 부품 메쉬, others: 다른 기구 부품(현재, 자기 자리는 null)
// 원래 있던 간섭(포팅 LED·원본 모델의 겹침)은 문제 삼지 않고 새로 생기는 간섭만 막는다.
// 반환 { xf (null = 원래대로), limited, hit: 키 | null, t }
export function limitXform(raw, oldXf, newXf, others, { ledParts = [], emitters = [], tol = TOL, iters = 14 } = {}) {
  const b = boxOf(raw), c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
  const at = (xf) => scaleMoveMesh(raw, isIdentityXform(xf) ? null : xf, c);
  const base = interferenceKeys(at(oldXf), others, ledParts, emitters, tol);
  const fresh = (xf) => { for (const k of interferenceKeys(at(xf), others, ledParts, emitters, tol).keys()) if (!base.has(k)) return k; return null; };
  const hit = fresh(newXf);
  if (!hit) return { xf: newXf, limited: false, hit: null, t: 1 };
  let lo = 0, hi = 1;
  for (let n = 0; n < iters; n++) { const m = (lo + hi) / 2; if (fresh(lerpXf(oldXf, newXf, m))) hi = m; else lo = m; }
  const xf = lerpXf(oldXf, newXf, lo);
  return { xf: isIdentityXform(xf) ? null : xf, limited: true, hit, t: lo };
}

// ---- 축별 한계(입력 전에 보여 주는 가능 범위) ----
// 움직이는 부품 표본: 삼각형 중심 + 세 꼭짓점을, 안쪽 법선 방향과 삼각형 중심 방향으로 INSET 씩 들인 점.
// 맞닿은 면을 따라 미끄러질 때 면과 같은 평면 위 광선(스침 교차)을 피한다(STEP 메쉬는 면마다 정점을 따로 가짐)
const MOVE = new WeakMap();
function moveSamplesOf(m) {
  let s = MOVE.get(m);
  if (s) return s;
  const P = m.positions, T = m.triangles, sd = insetSides(m), pts = [];
  for (let t = 0; t < sd.length; t++) if (sd[t]) movePts(P, T, t, sd[t], pts);
  s = Float64Array.from(pts);
  MOVE.set(m, s);
  return s;
}
// 삼각형 t 의 이동 표본 4점(안쪽으로 들인 중심 + 들인 세 꼭짓점)을 pts 에 덧붙임
function movePts(P, T, t, sd, pts) {
  const { c, n } = triCN(P, T, t);
  pts.push(c[0] - sd * INSET * n[0], c[1] - sd * INSET * n[1], c[2] - sd * INSET * n[2]);
  for (let j = 0; j < 3; j++) {
    const v = vtx(P, T[3 * t + j]), w = [c[0] - v[0], c[1] - v[1], c[2] - v[2]], l = Math.hypot(...w) || 1;
    for (let k = 0; k < 3; k++) pts.push(v[k] - sd * INSET * n[k] + (Math.min(INSET, l / 2) * w[k]) / l);
  }
}
// 큰 장애물: 움직이는 부품이 쓸고 가는 상자 근처 삼각형의 표본만(밖의 표본에서 쏜 광선은 maxD 안에 닿을 수 없음)
function moveSamplesNear(m, sweep) {
  const pts = [];
  for (const t of trisNear(m, sweep, INSET * 2)) { const sd = sideOf(m, t); if (sd) movePts(m.positions, m.triangles, t, sd, pts); }
  return pts;
}
// mov 를 방향 d(단위)로 옮길 때 처음 닿는 거리(≤ maxD) — 양방향 광선: mov 표본 → 장애물, 장애물 표본 → mov(−d), 발광점 → mov(−d)
export function travelDistance(mov, obstacles, d, maxD, emitters = []) {
  let best = maxD;
  const mb = boxOf(mov), Ms = solid(mov);
  const sweep = [0, 1, 2].map((k) => Math.min(mb[k], mb[k] + d[k] * maxD)).concat([0, 1, 2].map((k) => Math.max(mb[k + 3], mb[k + 3] + d[k] * maxD)));
  const ms = moveSamplesOf(mov);
  for (const o of obstacles) {
    if (!o || boxBoxDist(sweep, boxOf(o)) > 0) continue;
    const Os = solid(o), os = isBig(o) ? moveSamplesNear(o, sweep) : moveSamplesOf(o);
    for (let i = 0; i < ms.length; i += 3) { const h = intersectRay(Os.bvh, ms[i], ms[i + 1], ms[i + 2], d[0], d[1], d[2], 1e-6, best); if (h && h.t < best) best = h.t; }
    for (let i = 0; i < os.length; i += 3) { const h = intersectRay(Ms.bvh, os[i], os[i + 1], os[i + 2], -d[0], -d[1], -d[2], 1e-6, best); if (h && h.t < best) best = h.t; }
  }
  for (const e of emitters) { const h = intersectRay(Ms.bvh, e.pos[0], e.pos[1], e.pos[2], -d[0], -d[1], -d[2], 1e-6, best); if (h && h.t < best) best = h.t; }
  return best;
}
// 현재 xf 에서 축별로 간섭 없이 갈 수 있는 범위 — 반환 { move: [[−, +] ×3](mm, 이동량), size: [최대 크기 mm ×3], uniform: 비율 고정 최대 배수 }
// 장애물이 없으면 Infinity. 광선 후보 → limitXform 으로 확인·되물림(표본 사이로 빠지는 경우 보정)
export function axisLimits(raw, xf, others, { ledParts = [], emitters = [], maxD = 1000, tol = TOL } = {}) {
  const b = boxOf(raw), c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], size0 = [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
  const X = { offset: [...(xf?.offset ?? [0, 0, 0])], scale: [...(xf?.scale ?? [1, 1, 1])] };
  const cur = scaleMoveMesh(raw, isIdentityXform(X) ? null : X, c);
  const base = interferenceKeys(cur, others, ledParts, emitters, tol);   // 원래 겹친 상대는 장애물에서 뺀다
  const obs = [...others.map((m, j) => (m && !base.has(`p:${j}`) ? m : null)), ...ledParts.map((m, j) => (base.has(`l:${j}`) ? null : m))];
  const ems = emitters.filter((_, k) => !base.has(`e:${k}`));
  const opt = { ledParts, emitters, tol };
  const confirm = (to) => limitXform(raw, X, to, others, opt);
  const move = [0, 1, 2].map((k) => [-1, 1].map((sg) => {
    const d = [0, 0, 0]; d[k] = sg;
    const D = travelDistance(cur, obs, d, maxD, ems);
    if (D >= maxD) return sg * Infinity;
    const to = { offset: X.offset.map((v, j) => (j === k ? v + sg * D : v)), scale: X.scale };
    return sg * D * confirm(to).t;
  }));
  const free = move.map(([lo, hi]) => Math.min(-lo, hi));   // 축 양쪽 중 가까운 쪽 — 중심 기준으로 양쪽이 같이 커짐
  const size = [0, 1, 2].map((k) => {
    const s = size0[k] * X.scale[k];
    if (!Number.isFinite(free[k])) return Infinity;
    const to = { offset: X.offset, scale: X.scale.map((v, j) => (j === k ? (s + 2 * free[k]) / size0[k] : v)) };
    const t = confirm(to).t;
    return s + 2 * free[k] * t;
  });
  const fr = Math.min(...[0, 1, 2].map((k) => (Number.isFinite(free[k]) ? 1 + (2 * free[k]) / (size0[k] * X.scale[k]) : Infinity)));
  const uniform = Number.isFinite(fr) ? 1 + (fr - 1) * confirm({ offset: X.offset, scale: X.scale.map((v) => v * fr) }).t : Infinity;
  return { move, size, uniform, center0: c, size0 };
}
