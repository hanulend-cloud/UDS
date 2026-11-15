// 큰 부품(삼각형 2만 개 이상)의 간섭·이동 거리 = 상대 근처 삼각형만 봄(2026-11-15, 100 MB 도면에서 LED 마다 큰 부품 전체를 훑어 화면이 53초 멈춤)
// 결과는 전체를 훑는 방식과 같아야 함: node test/mech3d-clearance-big.mjs
import { meshPenetration, travelDistance, interferenceKeys, setLocalMin, nearestOnMesh } from '../src/engine/mech3d/clearance.js';
import { boxMesh, ok, done } from './mech3d-util.mjs';
// 면마다 n×n 으로 나눈 상자
function gridBox(x0, y0, z0, dx, dy, dz, n) {
  const P = [], T = [], F = [];
  const face = (o, u, v, f, flip) => { const i0 = P.length / 3;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) P.push(o[0] + (u[0] * i + v[0] * j) / n, o[1] + (u[1] * i + v[1] * j) / n, o[2] + (u[2] * i + v[2] * j) / n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = i0 + j * (n + 1) + i, b = a + 1, c = a + n + 2, d = a + n + 1; if (flip) T.push(a, c, b, a, d, c); else T.push(a, b, c, a, c, d); F.push(f, f); } };
  face([x0, y0, z0], [dx, 0, 0], [0, dy, 0], 0, true); face([x0, y0, z0 + dz], [dx, 0, 0], [0, dy, 0], 1, false);
  face([x0, y0, z0], [dx, 0, 0], [0, 0, dz], 2, false); face([x0, y0 + dy, z0], [dx, 0, 0], [0, 0, dz], 3, true);
  face([x0, y0, z0], [0, dy, 0], [0, 0, dz], 4, true); face([x0 + dx, y0, z0], [0, dy, 0], [0, 0, dz], 5, false);
  return { positions: Float32Array.from(P), triangles: Uint32Array.from(T), faceIds: Uint32Array.from(F), faceCount: 6 };
}
const copy = (m) => ({ ...m, positions: Float32Array.from(m.positions), triangles: Uint32Array.from(m.triangles) });   // 캐시가 안 섞이게 새 배열
const big = gridBox(0, 0, 0, 100, 100, 2, 45);   // 24,300 삼각형
ok(big.triangles.length / 3 >= 20000, `큰 부품 삼각형 ${big.triangles.length / 3}`);
const run = (min, fn) => { setLocalMin(min); try { return fn(copy(big)); } finally { setLocalMin(20000); } };
for (const [name, led] of [['겹침', boxMesh(40, 40, 1.5, 3, 3, 1)], ['안 겹침', boxMesh(40, 40, 2.5, 3, 3, 1)], ['맞붙음', boxMesh(40, 40, 2, 3, 3, 1)]]) {
  const a = run(Infinity, (B) => meshPenetration(led, B)), b = run(20000, (B) => meshPenetration(led, B));
  ok((a == null) === (b == null) && (a == null || Math.abs(a.depth - b.depth) < 1e-9), `간섭 깊이 ${name}: 전체 ${a?.depth} = 근처만 ${b?.depth}`);
  const ka = run(Infinity, (B) => [...interferenceKeys(led, [B], [], []).keys()].join()), kb = run(20000, (B) => [...interferenceKeys(led, [B], [], []).keys()].join());
  ok(ka === kb, `간섭 키 ${name}: '${ka}' = '${kb}'`);
}
for (const [name, led, d] of [['아래로 3 mm', boxMesh(40, 40, 5, 3, 3, 1), [0, 0, -1]], ['위로 막힘 없음', boxMesh(40, 40, 5, 3, 3, 1), [0, 0, 1]], ['옆 판 아래에서 위로', boxMesh(40, 40, -4, 3, 3, 1), [0, 0, 1]]]) {
  const a = run(Infinity, (B) => travelDistance(led, [B], d, 10)), b = run(20000, (B) => travelDistance(led, [B], d, 10));
  ok(Math.abs(a - b) < 1e-9, `이동 거리 ${name}: 전체 ${a} = 근처만 ${b}`);
}
{   // 가장 가까운 표면점 = 상자(0~100, 0~100, 0~2) 까지의 해석 거리
  let bad = 0;
  for (let k = 0; k < 300; k++) {
    const p = [((k * 37) % 140) - 20, ((k * 91) % 150) - 25, ((k * 13) % 30) - 14], h = nearestOnMesh(big, p);
    const out = Math.hypot(Math.max(-p[0], 0, p[0] - 100), Math.max(-p[1], 0, p[1] - 100), Math.max(-p[2], 0, p[2] - 2));
    const want = out > 0 ? out : Math.min(p[0], 100 - p[0], p[1], 100 - p[1], p[2], 2 - p[2]);
    if (!h || Math.abs(h.d - want) > 1e-5) bad++;
  }
  ok(bad === 0, `가장 가까운 표면점 300개 = 해석 거리 (틀림 ${bad})`);
  ok(nearestOnMesh(big, [50, 50, 30], 5) === null && Math.abs(nearestOnMesh(big, [50, 50, 30], 40).d - 28) < 1e-5, '반경 제한: 밖이면 null');
}
done();
