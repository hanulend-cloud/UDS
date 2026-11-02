// 삼각형 메쉬 BVH — spec 2026-10-14 §3.1·§6.1. 중앙값 분할(최장 축), 잎 ≤ 4 삼각형.
// box: 노드별 [xmin,ymin,zmin,xmax,ymax,zmax], meta: 노드별 [잎이면 시작 / 내부면 오른쪽 자식, 잎 삼각형 수(0=내부)].
// 왼쪽 자식은 항상 id+1(깊이 우선 배치). 교차는 양면(앞·뒤 모두) — MC 추적은 매질 안팎을 모두 오간다.

export function buildBvh(positions, triangles, leafSize = 4) {
  const nT = triangles.length / 3;
  const lo = new Float32Array(nT * 3), hi = new Float32Array(nT * 3), c = new Float32Array(nT * 3);
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    let mn = Infinity, mx = -Infinity;
    for (let j = 0; j < 3; j++) { const v = positions[triangles[t * 3 + j] * 3 + k]; if (v < mn) mn = v; if (v > mx) mx = v; }
    lo[t * 3 + k] = mn; hi[t * 3 + k] = mx; c[t * 3 + k] = (mn + mx) / 2;
  }
  const order = new Uint32Array(nT);
  for (let i = 0; i < nT; i++) order[i] = i;
  // JS 배열 없이(2026-11-02) — 재귀마다 Array.from·sort 와 노드 배열이 Worker 마다 JS 힙을 키워 큰 도면에서 탭이 메모리 부족으로 죽었음(V8 OOM).
  // 정렬은 같은 결과를 내는 안정 병합 정렬(나무가 예전과 똑같음 — 계산 결과 불변). 노드 수 ≤ 2n−1
  const maxNodes = Math.max(1, 2 * nT), boxA = new Float32Array(maxNodes * 6), metaA = new Int32Array(maxNodes * 2), aux = new Uint32Array(nT);
  let nodes = 0;
  function sortByAxis(s, e, ax) {
    const RUN = 8, ofs = ax;
    for (let r = s; r < e; r += RUN) {
      const rEnd = Math.min(r + RUN, e);
      for (let i = r + 1; i < rEnd; i++) {
        const t = order[i], key = c[t * 3 + ofs];
        let m = i - 1;
        while (m >= r && c[order[m] * 3 + ofs] > key) { order[m + 1] = order[m]; m--; }
        order[m + 1] = t;
      }
    }
    let src = order, dst = aux;
    for (let w = RUN; w < e - s; w *= 2) {
      for (let l = s; l < e; l += 2 * w) {
        const mid = Math.min(l + w, e), end = Math.min(l + 2 * w, e);
        let a = l, b = mid, o = l;
        while (a < mid && b < end) dst[o++] = c[src[b] * 3 + ofs] < c[src[a] * 3 + ofs] ? src[b++] : src[a++];
        while (a < mid) dst[o++] = src[a++];
        while (b < end) dst[o++] = src[b++];
      }
      const x = src; src = dst; dst = x;
    }
    if (src !== order) order.set(src.subarray(s, e), s);
  }
  function build(s, e) {
    const id = nodes++;
    let ax0 = Infinity, ay0 = Infinity, az0 = Infinity, bx0 = -Infinity, by0 = -Infinity, bz0 = -Infinity;
    let cax = Infinity, cay = Infinity, caz = Infinity, cbx = -Infinity, cby = -Infinity, cbz = -Infinity;
    for (let i = s; i < e; i++) {
      const q = order[i] * 3;
      if (lo[q] < ax0) ax0 = lo[q]; if (hi[q] > bx0) bx0 = hi[q]; if (c[q] < cax) cax = c[q]; if (c[q] > cbx) cbx = c[q];
      if (lo[q + 1] < ay0) ay0 = lo[q + 1]; if (hi[q + 1] > by0) by0 = hi[q + 1]; if (c[q + 1] < cay) cay = c[q + 1]; if (c[q + 1] > cby) cby = c[q + 1];
      if (lo[q + 2] < az0) az0 = lo[q + 2]; if (hi[q + 2] > bz0) bz0 = hi[q + 2]; if (c[q + 2] < caz) caz = c[q + 2]; if (c[q + 2] > cbz) cbz = c[q + 2];
    }
    const b6 = id * 6;
    boxA[b6] = ax0; boxA[b6 + 1] = ay0; boxA[b6 + 2] = az0; boxA[b6 + 3] = bx0; boxA[b6 + 4] = by0; boxA[b6 + 5] = bz0;
    metaA[id * 2] = s; metaA[id * 2 + 1] = e - s;
    if (e - s <= leafSize) return id;
    const dx = cbx - cax, dy = cby - cay, dz = cbz - caz;
    let ax = 0, dMax = dx;
    if (dy > dMax) { ax = 1; dMax = dy; }
    if (dz > dMax) { ax = 2; dMax = dz; }
    if (!(dMax > 0)) return id;   // 중심이 모두 같음 → 잎
    sortByAxis(s, e, ax);
    const m = (s + e) >> 1;
    build(s, m);
    const r = build(m, e);
    metaA[id * 2] = r; metaA[id * 2 + 1] = 0;
    return id;
  }
  build(0, nT);
  return { box: boxA.slice(0, nodes * 6), meta: metaA.slice(0, nodes * 2), order, positions, triangles };
}

// Möller–Trumbore(양면). 적중 거리 t(음수 가능) 또는 −1(평행·빗나감). 마지막 적중의 무게중심 좌표는 hitUV 에.
export const hitUV = { u: 0, v: 0 };
export function hitTriangle(P, T, t, ox, oy, oz, dx, dy, dz) {
  const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
  const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
  const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-14) return -1;
  const inv = 1 / det;
  const sx = ox - P[a], sy = oy - P[a + 1], sz = oz - P[a + 2];
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < 0 || u > 1) return -1;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return -1;
  hitUV.u = u; hitUV.v = v;
  return (e2x * qx + e2y * qy + e2z * qz) * inv;
}

// 가장 가까운 적중 { t, tri, u, v } (tMin ≤ t < tMax) 또는 null. tri 는 원래 삼각형 번호. skipTri·skipTri2: 제외할 삼각형(직전 적중 면, 맞붙은 짝 면).
// mask(Uint8Array, 삼각형별) — 1 이면 없는 것처럼 통과(추적 제외 부품)
export function intersectRay(bvh, ox, oy, oz, dx, dy, dz, tMin = 1e-6, tMax = Infinity, skipTri = -1, skipTri2 = -1, mask = null) {
  const { box, meta, order, positions: P, triangles: T } = bvh;
  if (!order.length) return null;
  const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
  const stack = [0];
  let best = tMax, hit = -1, hu = 0, hv = 0;
  while (stack.length) {
    const n = stack.pop(), b = n * 6;
    let t0 = (box[b] - ox) * ix, t1 = (box[b + 3] - ox) * ix;
    if (t0 > t1) { const s = t0; t0 = t1; t1 = s; }
    let u0 = (box[b + 1] - oy) * iy, u1 = (box[b + 4] - oy) * iy;
    if (u0 > u1) { const s = u0; u0 = u1; u1 = s; }
    let w0 = (box[b + 2] - oz) * iz, w1 = (box[b + 5] - oz) * iz;
    if (w0 > w1) { const s = w0; w0 = w1; w1 = s; }
    // NaN(0·∞)은 비교가 모두 거짓 → 노드를 버리지 않는다(보수적)
    const near = Math.max(t0, u0, w0), far = Math.min(t1, u1, w1);
    if (far < near || far < tMin || near > best) continue;
    const cnt = meta[n * 2 + 1];
    if (cnt) {
      for (let i = meta[n * 2], e = i + cnt; i < e; i++) {
        const tri = order[i];
        if (tri === skipTri || tri === skipTri2 || (mask && mask[tri])) continue;
        const s = hitTriangle(P, T, tri, ox, oy, oz, dx, dy, dz);
        if (s >= tMin && s < best) { best = s; hit = tri; hu = hitUV.u; hv = hitUV.v; }
      }
    } else {
      stack.push(meta[n * 2], n + 1);   // 오른쪽 먼저 쌓아 왼쪽부터 방문
    }
  }
  return hit < 0 ? null : { t: best, tri: hit, u: hu, v: hv };
}

// 외곽이 [lo, hi] 박스와 겹치는 잎의 삼각형 번호들(후보 — 삼각형 자체 외곽은 호출자가 판단)
export function queryBox(bvh, lo, hi, out = []) {
  const { box, meta, order } = bvh;
  out.length = 0;
  if (!order.length) return out;
  const stack = [0];
  while (stack.length) {
    const n = stack.pop(), b = n * 6;
    if (box[b] > hi[0] || box[b + 3] < lo[0] || box[b + 1] > hi[1] || box[b + 4] < lo[1] || box[b + 2] > hi[2] || box[b + 5] < lo[2]) continue;
    const cnt = meta[n * 2 + 1];
    if (cnt) for (let i = meta[n * 2], e = i + cnt; i < e; i++) out.push(order[i]);
    else stack.push(meta[n * 2], n + 1);
  }
  return out;
}
