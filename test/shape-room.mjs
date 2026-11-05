// 형상 종류별로 입광면 후보가 실제로 움직이는가(2026-11-05): node test/shape-room.mjs
// 재발 방지: 입광면이 다른 부품에 닿아 있으면 모드 후보가 전부 간섭으로 탈락해 형상이 조용히 안 움직였음(기본 예제 11/11).
// 조건: 모든 모드·양방향에서 (1) 간섭 없음 (2) 살두께 지킴 (3) 움직일 여유가 있는 형상이면 실제로 움직임
import { fieldThickness, fieldRoom, clampField, deformPart, refinedFor, heightsFor, partFrame, lineVarH, minThickness } from '../src/engine/mech3d/shape-opt.js';
import { shapeModes } from '../src/engine/mech3d/autodesign.js';
import { newInterference, interferenceKeys } from '../src/engine/mech3d/clearance.js';
import { transformMesh } from '../src/engine/mech3d/xform.js';
import { insidePart } from '../src/engine/mech3d/checks.js';
import { buildBvh } from '../src/engine/mech3d/bvh.js';
import { boxMesh, ok, done } from './mech3d-util.mjs';

const F0 = { u: [1, 0, 0], v: [0, 1, 0], d: [0, 0, 1] }, L = 100, W = 8, ns = 21, nw = 5, minWall = 0.8, ledS = [10, 30, 50, 70, 90], A = 1.5;
const path = Array.from({ length: L + 1 }, (_, i) => [i, 0]), P = { path, halfW: W, closed: false, L };
const plate = (t = 2) => boxMesh(0, -W, 0, L, 2 * W, t);
const leds = (top) => ledS.map((x) => boxMesh(x - 2, -2, top - 1, 4, 4, 1));

function run(part, others, lp = [], F = F0) {
  const H = heightsFor(part, F, 0.5), T = fieldThickness(H, P, ns, nw), room = fieldRoom(H, P, F, ns, nw, [...others, ...lp]), rows = [];
  const zero = { dt: 0, h: 0, R: 1, e: 0, c: 0, centers: [], cell: 0.5, path, halfW: W, closed: false, L, ell: 20, frame: F };
  const before = new Map(); for (const [k, v] of interferenceKeys(part, others, lp, [])) before.set(k, v ?? 0);
  for (const md of shapeModes(ledS, L, W, false, ns, nw)) for (const sign of [1, -1]) {
    const kF = clampField({ ns, nw, v: md.v.map((x) => sign * A * x) }, T, minWall, H.t0 / 2, room), mod = { ...zero, kF }, peak = Math.max(...kF.v.map(Math.abs));
    const mesh = deformPart(refinedFor(part, F, [], 1, 0.125, lineVarH(mod)), F, H, mod);
    rows.push({ name: md.name, sign, peak, kF, clash: newInterference(mesh, others, lp, before, 0.05), thin: minThickness(H, mod) });
  }
  return { rows, room, T, H };
}
const clean = (R) => R.rows.filter((r) => r.clash != null).map((r) => `${r.name}${r.sign > 0 ? '+' : '−'}:${r.clash}`);
const moved = (R) => new Set(R.rows.filter((r) => r.peak > 0.01).map((r) => r.name)).size;
const cases = [
  ['아래 판에 맞닿음(기본 예제)', plate(), [boxMesh(0, -W, -3, L, 2 * W, 3)], [], 11],
  ['아래 판과 틈 1 mm', plate(), [boxMesh(0, -W, -4, L, 2 * W, 3)], [], 11],
  ['LED 몸체가 입광면에 닿음', plate(), [], leds(0), 11],
  ['LED 가 입광면에 0.3 mm 박힘', plate(), [], leds(0.3), 11],
  ['받침 벽 위에 얹힘(가운데 빔)', plate(), [boxMesh(0, -W, -3, 2, 2 * W, 3), boxMesh(98, -W, -3, 2, 2 * W, 3)], [], 11],
  ['상자 바닥·옆벽에 끼움', plate(), [boxMesh(-2, -W - 2, -3, L + 4, 2 * W + 4, 3), boxMesh(-2, -W - 2, 0, 2, 2 * W + 4, 2), boxMesh(L, -W - 2, 0, 2, 2 * W + 4, 2)], [], 11],
  ['옆면 4개가 케이스 벽에 끼움(기본 예제 부품 2)', plate(), [boxMesh(-2, -W - 2, -6, L + 4, 2 * W + 4, 5.9), boxMesh(-2, -W - 2, -0.1, 2, 2 * W + 4, 2.1), boxMesh(L, -W - 2, -0.1, 2, 2 * W + 4, 2.1), boxMesh(0, -W - 2, -0.1, L, 2, 2.1), boxMesh(0, W, -0.1, L, 2, 2.1)], [], 11],
  ['얇은 판(1.2 mm)에 맞닿음', plate(1.2), [boxMesh(0, -W, -3, L, 2 * W, 3)], [], 11],
];
for (const [name, part, others, lp, want] of cases) {
  const R = run(part, others, lp), c = clean(R);
  ok(!c.length, `${name}: 간섭 없음${c.length ? ` (${c.slice(0, 3).join(', ')})` : ''}`);
  ok(R.rows.every((r) => r.thin >= minWall - 0.01), `${name}: 살두께 ≥ ${minWall} (최소 ${Math.min(...R.rows.map((r) => r.thin)).toFixed(2)})`);
  ok(moved(R) === want, `${name}: 모드 ${want}개 모두 움직임(${moved(R)}개)`);
}
{ // 기울어진 판(10°) — 관측 방향과 입광면 법선이 달라도 같음
  const rot = (m) => transformMesh(m, [0, 0, 0], [0, 10, 0]), part = rot(plate()), F = partFrame(part, F0), R = run(part, [rot(boxMesh(0, -W, -3, L, 2 * W, 3))], [], F);
  ok(!clean(R).length && moved(R) === 11, `기울어진 판 맞닿음: 간섭 ${clean(R).length} · 움직인 모드 ${moved(R)}`);
}
{ // 충분히 떨어져 있으면 지금까지와 똑같아야 함(굴곡 확산판처럼 잘 되던 도면이 바뀌면 안 됨)
  const part = plate(), H = heightsFor(part, F0, 0.5), T = fieldThickness(H, P, ns, nw), room = fieldRoom(H, P, F0, ns, nw, [boxMesh(0, -W, -9, L, 2 * W, 3)]);
  const md = shapeModes(ledS, L, W, false, ns, nw)[0], kF = { ns, nw, v: md.v.map((x) => A * x) };
  ok(JSON.stringify(clampField(kF, T, minWall, H.t0 / 2, room)) === JSON.stringify(clampField(kF, T, minWall, H.t0 / 2)), '틈이 넉넉하면 제한 없음 = 예전과 동일');
  ok(JSON.stringify(clampField(kF, T, minWall, H.t0 / 2, fieldRoom(H, P, F0, ns, nw, []))) === JSON.stringify(clampField(kF, T, minWall, H.t0 / 2)), '주변 부품 없음 = 예전과 동일');
}
{ // 입광면 쪽 여유: 맞닿음 = 0, 틈 = 틈 − 여유, 위쪽 부품은 제한 아님
  const part = plate(), H = heightsFor(part, F0, 0.5), at = (m) => fieldRoom(H, P, F0, ns, nw, m);
  ok(at([boxMesh(0, -W, -3, L, 2 * W, 3)]).every((v) => v === 0), '맞닿음 → 더할 여유 0');
  ok(at([boxMesh(0, -W, -4, L, 2 * W, 3)]).every((v) => Math.abs(v - 0.98) < 1e-6), '틈 1 mm → 0.98');
  ok(at([boxMesh(0, -W, 2, L, 2 * W, 3)]).every((v) => v === Infinity), '위쪽(관측 쪽) 부품은 제한 아님');
  const pk = at([boxMesh(40, -2, -1, 4, 4, 1)]);
  ok(pk.some((v) => v === 0) && pk.some((v) => v === Infinity), '일부만 닿으면 그 자리만 0');
}
{ // 움직일 여유가 전혀 없는 판(살두께 = 두께 + 맞닿음) — 간섭 없이 '안 움직임'으로 끝남(원인은 결과 문구로)
  const R = run(plate(0.8), [boxMesh(0, -W, -3, L, 2 * W, 3)]);
  ok(!clean(R).length && moved(R) === 0, `0.8 mm 판 맞닿음: 움직일 곳 없음(모드 ${moved(R)}개)`);
}
{ // 안/밖 판정: 광선이 모서리·꼭짓점을 정확히 지나도 틀리면 안 됨(기본 예제: 빈 공간의 점이 케이스 안으로 판정 → 끝단 모드 간섭 오탐)
  const solid = (m) => ({ ...m, bvh: buildBvh(m.positions, m.triangles) }), d = [0.48, 0.6, 0.64];
  const wall = solid(boxMesh(0, 18, 0, 120, 2, 12)), P0 = [8.947916666666666, 16.125, 10];   // 첫 광선이 윗모서리(y=18, z=12)를 정확히 지남
  ok(Math.abs(P0[2] + d[2] * ((18 - P0[1]) / d[1]) - 12) < 1e-9, '시험 점: 광선이 모서리를 정확히 지남');
  ok(!insidePart(wall, P0), '모서리를 지나는 바깥 점 = 밖');
  ok(insidePart(wall, [60, 19, 6]) && !insidePart(wall, [60, 17, 6]) && !insidePart(wall, [60, 19, 13]), '보통 점은 그대로');
  let bad = 0; const box = solid(boxMesh(0, 0, 0, 8, 8, 8));   // 격자 점에서 쏘면 모서리·꼭짓점을 자주 지남
  for (let i = -8; i <= 24; i++) for (let j = -8; j <= 24; j++) for (let k = -8; k <= 24; k++) { const p = [i / 2 + 1e-9, j / 2 + 1e-9, k / 2 + 1e-9], inside = p.every((v) => v > 0 && v < 8); if (p.some((v) => Math.abs(v) < 1e-6 || Math.abs(v - 8) < 1e-6)) continue; if (insidePart(box, p) !== inside) bad++; }
  ok(bad === 0, `격자 점 안/밖 오판 ${bad}개`);
}
done();
