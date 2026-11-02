// BVH 광선/박스 질의 vs 전수 탐색: node test/mech3d-bvh.mjs
import { buildBvh, intersectRay, queryBox, hitTriangle } from '../src/engine/mech3d/bvh.js';
import { boxMesh, rng, ok, done } from './mech3d-util.mjs';

const R = rng(7);
// 무작위 삼각형 3000개(100mm 공간, 크기 ≤ 5mm)
const nT = 3000, P = new Float32Array(nT * 9), T = new Uint32Array(nT * 3);
for (let t = 0; t < nT; t++) {
  const cx = R() * 100, cy = R() * 100, cz = R() * 100;
  for (let j = 0; j < 3; j++) { P[t * 9 + j * 3] = cx + (R() - 0.5) * 5; P[t * 9 + j * 3 + 1] = cy + (R() - 0.5) * 5; P[t * 9 + j * 3 + 2] = cz + (R() - 0.5) * 5; T[t * 3 + j] = t * 3 + j; }
}
const bvh = buildBvh(P, T);
function brute(ox, oy, oz, dx, dy, dz, tMin, tMax) {
  let best = tMax, hit = -1;
  for (let t = 0; t < nT; t++) { const s = hitTriangle(P, T, t, ox, oy, oz, dx, dy, dz); if (s >= tMin && s < best) { best = s; hit = t; } }
  return hit < 0 ? null : { t: best, tri: hit };
}
let mism = 0, hits = 0;
for (let i = 0; i < 2000; i++) {
  const th = Math.acos(2 * R() - 1), ph = 2 * Math.PI * R();
  const d = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
  if (i % 50 === 0) { d[0] = 0; d[1] = 0; d[2] = 1; }   // 축 평행 광선(역수 Infinity) 포함
  const o = [R() * 100, R() * 100, R() * 100];
  const a = intersectRay(bvh, ...o, ...d, 1e-6, 80), b = brute(...o, ...d, 1e-6, 80);
  if (!!a !== !!b || (a && (Math.abs(a.t - b.t) > 1e-4))) mism++;
  if (b) hits++;
}
ok(mism === 0 && hits > 200, `무작위 광선 2000개: 불일치 ${mism}, 적중 ${hits}`);

// 상자 내부에서 +x 로 쏘면 +x 면(면 번호 5)에 t=1 로 적중
const box = boxMesh(0, 0, 0, 2, 2, 2), bb = buildBvh(box.positions, box.triangles);
const h = intersectRay(bb, 1, 1, 1, 1, 0, 0);
ok(h && Math.abs(h.t - 1) < 1e-9 && box.faceIds[h.tri] === 5, `상자 내부 +x 광선: t=${h?.t}, 면 ${h && box.faceIds[h.tri]}`);
ok(intersectRay(bb, 1, 1, 1, 1, 0, 0, 1e-6, 0.5) === null, 'tMax 이내 적중 없음 → null');

// 박스 질의: 질의 박스와 외곽이 겹치는 삼각형을 모두 포함(누락 없음)
const lo = [40, 40, 40], hi = [60, 60, 60], got = new Set(queryBox(bvh, lo, hi));
let miss = 0;
for (let t = 0; t < nT; t++) {
  let inside = true;
  for (let k = 0; k < 3; k++) {
    const vs = [P[t * 9 + k], P[t * 9 + 3 + k], P[t * 9 + 6 + k]];
    if (Math.max(...vs) < lo[k] || Math.min(...vs) > hi[k]) inside = false;
  }
  if (inside && !got.has(t)) miss++;
}
ok(miss === 0 && got.size > 0, `박스 질의: 후보 ${got.size}, 누락 ${miss}`);
ok(buildBvh(new Float32Array(0), new Uint32Array(0)) && intersectRay(buildBvh(new Float32Array(0), new Uint32Array(0)), 0, 0, 0, 1, 0, 0) === null, '빈 메쉬 → null');
{   // skipTri: 지정 삼각형을 건너뛰고 다음 적중(마지막 적중 면 재적중 방지, tMin = 0 허용)
  const bb = buildBvh(boxMesh(0, 0, 0, 2, 2, 2).positions, boxMesh(0, 0, 0, 2, 2, 2).triangles);
  const h0 = intersectRay(bb, 0.5, 1.5, 0, 0, 0, 1, 0);   // 바닥면(z=0) 위 출발: tMin 0 이면 바닥 적중
  const h1 = intersectRay(bb, 0.5, 1.5, 0, 0, 0, 1, 0, Infinity, h0?.tri ?? -1);
  ok(h0 && h0.t === 0 && h1 && Math.abs(h1.t - 2) < 1e-6 && h1.tri !== h0.tri, `skipTri: 출발면 t ${h0?.t} 제외 → 다음 적중 t ${h1?.t.toFixed(6)}`);
}
{ // 메모리 개선 전 구현과 나무가 똑같아야 함(계산 결과 불변) — 무작위 · 겹친 중심 · 격자(같은 값 많음) · 빈 메쉬 · 잎 크기
  function oldBvh(positions, triangles, leafSize = 4) {
    const nT = triangles.length / 3, lo = new Float32Array(nT * 3), hi = new Float32Array(nT * 3), c = new Float32Array(nT * 3);
    for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) { let mn = Infinity, mx = -Infinity; for (let j = 0; j < 3; j++) { const v = positions[triangles[t * 3 + j] * 3 + k]; if (v < mn) mn = v; if (v > mx) mx = v; } lo[t * 3 + k] = mn; hi[t * 3 + k] = mx; c[t * 3 + k] = (mn + mx) / 2; }
    const order = new Uint32Array(nT); for (let i = 0; i < nT; i++) order[i] = i;
    const box = [], meta = [];
    function build(s, e) {
      const id = meta.length / 2, a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity], ca = [Infinity, Infinity, Infinity], cb = [-Infinity, -Infinity, -Infinity];
      for (let i = s; i < e; i++) { const t = order[i]; for (let k = 0; k < 3; k++) { if (lo[t * 3 + k] < a[k]) a[k] = lo[t * 3 + k]; if (hi[t * 3 + k] > b[k]) b[k] = hi[t * 3 + k]; if (c[t * 3 + k] < ca[k]) ca[k] = c[t * 3 + k]; if (c[t * 3 + k] > cb[k]) cb[k] = c[t * 3 + k]; } }
      box.push(a[0], a[1], a[2], b[0], b[1], b[2]); meta.push(s, e - s);
      if (e - s <= leafSize) return id;
      let ax = 0; for (let k = 1; k < 3; k++) if (cb[k] - ca[k] > cb[ax] - ca[ax]) ax = k;
      if (!(cb[ax] - ca[ax] > 0)) return id;
      const sub = Array.from(order.subarray(s, e)).sort((p, q) => c[p * 3 + ax] - c[q * 3 + ax]); order.set(sub, s);
      const m = (s + e) >> 1; build(s, m); const r = build(m, e); meta[id * 2] = r; meta[id * 2 + 1] = 0; return id;
    }
    build(0, nT);
    return { box: Float32Array.from(box), meta: Int32Array.from(meta), order };
  }
  let sd = 12345; const rnd = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
  const soup = (n, f) => { const P = new Float32Array(n * 9), T = new Uint32Array(n * 3); for (let i = 0; i < n * 9; i++) { P[i] = f(); } for (let i = 0; i < n * 3; i++) T[i] = i; return [P, T]; };
  const same = (x, y) => x.length === y.length && x.every((v, i) => Object.is(v, y[i]));
  const eq = (a, b) => same(a.box, b.box) && same(a.meta, b.meta) && same(a.order, b.order);
  const cases = { 무작위: soup(5000, rnd), '값이 몇 개뿐(같은 중심 많음)': soup(5000, () => Math.floor(rnd() * 4)), '작은 메쉬': soup(3, rnd), '정렬 경계(9개)': soup(9, rnd), '모두 같은 점': soup(50, () => 1), '빈 메쉬': [new Float32Array(0), new Uint32Array(0)] };
  for (const [name, [P, T]] of Object.entries(cases)) for (const leaf of [4, 1]) ok(eq(buildBvh(P, T, leaf), oldBvh(P, T, leaf)), `예전 나무와 같음: ${name} · 잎 ${leaf}`);
}

done();
