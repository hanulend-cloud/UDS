// 큰 도면 LED·PCB 인식 속도(2026-11-06) — 결과는 그대로, 시간만 줄임: node test/led-detect-speed.mjs
// 90 MB 시험 도면(부품 4545개)에서 PCB 인식이 화면을 12.6초 멈추게 했음. 부품 상자로 먼저 거르고 정확 계산은 가까운 것만
import { findPcbParts, supportPart } from '../src/engine/mech3d/led-detect.js';
import { transformMesh } from '../src/engine/mech3d/xform.js';
import { boxMesh, ok, done } from './mech3d-util.mjs';

// 잘게 나눈 판(실제 도면의 곡면·리브처럼 삼각형이 많은 큰 부품) — 윗면·아랫면 격자
function plate(x0, y0, z0, w, d, h, nx, ny) {
  const pos = [], tri = [];
  for (const z of [z0, z0 + h]) { const b = pos.length / 3; for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) pos.push(x0 + (w * i) / nx, y0 + (d * j) / ny, z);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = b + j * (nx + 1) + i; if (z === z0) tri.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); else tri.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1); } }
  return { positions: Float32Array.from(pos), triangles: Uint32Array.from(tri), faceIds: new Uint32Array(tri.length / 3), faceCount: 1 };
}
// 판 여러 장 + 각 판 위 LED 여러 개 + 케이스 · 덮개(판과 높이가 같은 이웃 판 = 동점 상황도 만듦)
function scene(nPcb, perPcb, fine = 0) {
  const parts = [fine ? plate(-10, -10, -6, nPcb * 60 + 20, 40, 2, fine, 100) : boxMesh(-10, -10, -6, nPcb * 60 + 20, 40, 2)], leds = [];   // 케이스 바닥
  const led = fine ? plate(-1, -1, 0, 2, 2, 1, 6, 6) : boxMesh(-1, -1, 0, 2, 2, 1);   // 실제 LED 는 꼭짓점이 많음
  for (let b = 0; b < nPcb; b++) {
    const x0 = b * 60, pcbI = parts.length;
    parts.push(fine ? plate(x0, -5, -1, 50, 10, 1, 100, 20) : boxMesh(x0, -5, -1, 50, 10, 1));
    for (let k = 0; k < perPcb; k++) { leds.push(parts.length); parts.push(transformMesh(led, [x0 + 2 + (k * 46) / Math.max(1, perPcb - 1), 0, 0], [0, 0, 0])); }
    if (pcbI < 0) throw new Error();
  }
  parts.push(fine ? plate(-10, -10, 8, nPcb * 60 + 20, 40, 2, fine, 100) : boxMesh(-10, -10, 8, nPcb * 60 + 20, 40, 2));   // 덮개
  return { parts, leds };
}
// 원래 방식(모든 부품의 모든 삼각형) — 비교 기준
const closestBrute = (m, p) => {
  const P = m.positions, T = m.triangles; let best = Infinity;
  for (let t = 0; t < T.length; t += 3) {
    const a = [P[T[t] * 3], P[T[t] * 3 + 1], P[T[t] * 3 + 2]], b = [P[T[t + 1] * 3], P[T[t + 1] * 3 + 1], P[T[t + 1] * 3 + 2]], c = [P[T[t + 2] * 3], P[T[t + 2] * 3 + 1], P[T[t + 2] * 3 + 2]];
    best = Math.min(best, d2Tri(p, a, b, c));
  }
  return best;
};
function d2Tri(p, a, b, c) {   // 점-삼각형 거리²(Ericson)
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  const q = (() => {
    if (d1 <= 0 && d2 <= 0) return a;
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
    const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]; }
    const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
    const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]; }
    const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]; }
    const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
  })();
  const d = sub(p, q); return dot(d, d);
}
const center = (m) => { const P = m.positions; let x = 0, y = 0, z = 0; for (let i = 0; i < P.length; i += 3) { x += P[i]; y += P[i + 1]; z += P[i + 2]; } const n = P.length / 3; return [x / n, y / n, z / n]; };

{ // 받침 부품 = 원래(전수) 방식과 같은 답
  const { parts, leds } = scene(4, 6), skip = new Set(leds);
  let same = 0;
  for (const i of leds) {
    const c = center(parts[i]); let best = Infinity, k = -1;
    parts.forEach((m, j) => { if (skip.has(j)) return; const d = closestBrute(m, c); if (d < best - 1e-9) { best = d; k = j; } });
    if (supportPart(parts, parts[i], skip) === k) same++;
  }
  ok(same === leds.length, `받침 부품 ${same}/${leds.length} 이 전수 계산과 같음`);
  const r = findPcbParts(parts, leds);
  ok(r.pcbs.join() === '1,8,15,22', `PCB 4장 그대로: ${r.pcbs.join()}`);
}
{ // 큰 도면: LED 2000개 · 부품 2000여 개 · 케이스·덮개 각 12만 삼각형 — 화면을 오래 붙잡지 않음
  const { parts, leds } = scene(40, 50, 300);
  const t = performance.now(), r = findPcbParts(parts, leds), ms = performance.now() - t;
  ok(r.pcbs.length === 40, `PCB 40장 인식: ${r.pcbs.length}`);
  ok(ms < 1500, `LED ${leds.length}개 · 부품 ${parts.length}개 PCB 인식 ${Math.round(ms)} ms (< 1.5 s)`);
}
done();
