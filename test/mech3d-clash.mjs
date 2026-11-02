// 부품 간섭 부위(2026-11-02): 겹치면 그 구역에만 표식, 맞붙음·떨어짐은 없음, 제외 부품은 뺌
import { allPartClashes, clashRegion } from '../src/engine/mech3d/clearance.js';
let fail = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fail++; };
function box(x0, y0, z0, x1, y1, z1) {
  const positions = new Float64Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  const triangles = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  return { positions, triangles };
}
const A = box(0, 0, 0, 10, 10, 10), B = box(8, 2, 2, 14, 8, 8), touch = box(10, 0, 0, 20, 10, 10), far = box(30, 0, 0, 40, 10, 10);
const c = allPartClashes([A, B]);
ok(c.length === 1 && c[0].a === 0 && c[0].b === 1, '겹친 두 부품 = 1건');
ok(Math.abs(c[0].depth - 2) < 0.2, `깊이 ≈ 2 mm (${c[0].depth.toFixed(2)})`);
const P = c[0].positions, n = P.length / 3;
let inside = true, area = 0;
for (let i = 0; i < n; i++) if (P[3 * i] < 8 - 1e-3 || P[3 * i] > 10 + 1e-3 || P[3 * i + 1] < 2 - 1e-3 || P[3 * i + 1] > 8 + 1e-3 || P[3 * i + 2] < 2 - 1e-3 || P[3 * i + 2] > 8 + 1e-3) inside = false;
ok(n > 0 && inside, `표식 삼각형 ${n / 3}개가 겹친 구역(x 8–10, y·z 2–8) 안에만`);
for (let t = 0; t < n / 3; t++) { const v = (k) => [P[9 * t + 3 * k], P[9 * t + 3 * k + 1], P[9 * t + 3 * k + 2]], a = v(0), b = v(1), d = v(2), u = b.map((x, k) => x - a[k]), w = d.map((x, k) => x - a[k]); area += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2; }
const want = 2 * 6 * 6 + 4 * 2 * 6;   // 겹친 덩어리 2×6×6 의 겉넓이
ok(Math.abs(area - want) / want < 0.05, `표식 넓이 ≈ 겹친 덩어리 겉넓이 ${want} (${area.toFixed(1)})`);
ok(c[0].triangles.length === n, '삼각형 번호 = 좌표 수');
ok(allPartClashes([A, touch]).length === 0, '맞붙음 = 간섭 아님');
ok(allPartClashes([A, far]).length === 0, '떨어짐 = 간섭 아님');
ok(allPartClashes([A, null, B]).map((x) => x.b).join() === '2', 'null(계산 제외) 건너뜀 · 번호 유지');
ok(allPartClashes([null, B]).length === 0, '제외 부품과는 간섭 없음');
ok(clashRegion(A, touch).length === 0, '맞붙은 면에는 표식 없음');
{ // 큰 부품 끝만 1 mm 겹침 — 표식이 겹친 곳에서 0.3 mm 넘게 벗어나지 않음
  const L = box(0, 0, 0, 120, 20, 10), E = box(119, 5, 2, 130, 15, 8), Q = allPartClashes([L, E])[0].positions;
  let mn = Infinity, mx = -Infinity; for (let i = 0; i < Q.length; i += 3) { mn = Math.min(mn, Q[i]); mx = Math.max(mx, Q[i]); }
  ok(mn > 119 - 0.3 && mx < 120 + 0.3, `긴 부품: 표식 x ${mn.toFixed(2)}–${mx.toFixed(2)} (겹침 119–120)`); }
process.exitCode = fail ? 1 : 0;
