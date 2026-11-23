// LED 위치 = 광분포 최고점(약한 확산): node test/led-peak.mjs
// 2026-11-23 사용자 기준 — "확산이 심하지 않으면 LED 좌표의 peak 와 광분포 peak 가 일치해야 제대로 된 시뮬레이션".
// 링 확산판(R12–20)·직선 띠(100×8) — 두께 2, Milky 3, 옆면 백색 — 아래에 떨어진 LED 8개(가장자리에서 2·4·6 mm, 링 이음매·띠 끝 근처 포함)를 놓고
// 실제 계산 경로(runJob → tallyStats 지도)의 칸별 최고점을 찾아, line.fromSW 로 3D 좌표로 되돌려 LED 실제 좌표와 거리를 잰다.
import { runJob } from '../src/engine/mech3d/job.js';
import { buildTraceScene } from '../src/engine/mech3d/scene3d.js';
import { setMech3dMesh, getMech3d } from '../src/engine/mech3d/runtime.js';
import { defaultPart, setPartMaterial, setPartMaterialParam, setPartFinish } from '../src/engine/mech3d/materials.js';
import { recognizeLine } from '../src/engine/mech3d/line.js';
import { tallyGeometry, tallyStats } from '../src/engine/mech3d/tally.js';
import { loadTable } from './l2-util.mjs';
import { boxMesh, ok, done } from './mech3d-util.mjs';

// 닫힌 링 판: 면 0 = 바깥 옆면, 1 = 윗면(관측면), 2 = 아랫면, 3 = 안쪽 옆면 (바깥 법선 반시계)
function ringSolid(r0, r1, z0, z1, n = 256) {
  const P = [], T = [], F = [], pt = (r, a, z) => [r * Math.cos(a), r * Math.sin(a), z];
  const quad = (a, b, c, d, f) => { const i = P.length / 3; P.push(...a, ...b, ...c, ...d); T.push(i, i + 1, i + 2, i, i + 2, i + 3); F.push(f, f); };
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n, b = (2 * Math.PI * (k + 1)) / n;
    quad(pt(r1, a, z0), pt(r1, b, z0), pt(r1, b, z1), pt(r1, a, z1), 0);
    quad(pt(r0, a, z1), pt(r1, a, z1), pt(r1, b, z1), pt(r0, b, z1), 1);
    quad(pt(r0, a, z0), pt(r0, b, z0), pt(r1, b, z0), pt(r1, a, z0), 2);
    quad(pt(r0, a, z0), pt(r0, a, z1), pt(r0, b, z1), pt(r0, b, z0), 3);
  }
  return { positions: Float32Array.from(P), triangles: Uint32Array.from(T), faceIds: Uint32Array.from(F), faceCount: 4 };
}

const table = loadTable(), white = { kind: 'whiteDiffuse', R: 0.85 }, d2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const pcbPart = setPartFinish(defaultPart(1, 'pcb', 1), null, { kind: 'whiteDiffuse', R: 0.3 });
const diffuser = (edges, milky = 3) => edges.reduce((p, f) => setPartFinish(p, f, white), setPartMaterialParam(setPartMaterial(defaultPart(0, 'diffuser', 1), 'milky'), 'milky', milky));
const slow = process.argv.includes('--slow');   // npm run test:peak-slow — 두 줄 일관성을 실제 설계 Milky 7.65 로(약 5분)

// 한 경우: 장면 → 실제 계산 경로(runJob → tallyStats 지도) → LED 마다 최고점 → 3D 거리
function check(name, meshes, edges, emitters, labels, lineOk) {
  setMech3dMesh(name, meshes);
  const S = buildTraceScene(getMech3d(), { name, parts: [diffuser(edges), pcbPart], contacts: [] }, { table });
  const faces = [{ part: 0, face: 1 }], line = recognizeLine(meshes, faces, [0, 0, 1]);
  const obs = { faces, dir: [0, 0, 1], cone: 90, edgeExcl: 0.5, targetLen: 0.8, targetWid: 0.8, cellS: 0.5, cellW: 0.5 };
  const G = tallyGeometry(line, obs);
  ok(lineOk(line) && Math.abs(line.width - 8) < 0.4 && Math.abs(G.cell - 0.5) < 1e-9, `${name} 관측 라인: ${line.kind} 길이 ${line.length.toFixed(1)} 폭 ${line.width.toFixed(2)}, 칸 ${G.cell} mm`);
  const t0 = Date.now(), r = runJob({ S, line, obs, G, emitters, ledSpec: { model: 'lambertian', beam: 120 }, N: Number(process.env.PEAK_N ?? 500000), seed: 5, batches: 10 });
  const st = tallyStats(G, r.accs, obs, r.cnts), map = st.map;
  // 각 LED 의 s·w(라인 좌표)는 지도 쪽 변환을 쓰지 않고 가장 가까운 칸 중심을 3D 로 되돌려 찾는다
  const cellXYZ = (i, j) => line.fromSW((i + 0.5) * G.ds, G.w0 + (j + 0.5) * G.cell);
  const rowAt = (i) => (G.closed ? (i + G.ns) % G.ns : i >= 0 && i < G.ns ? i : -1);   // 링은 이음매를 넘어 이어짐, 띠는 끝에서 멈춤
  const res = emitters.map((e) => {
    let near = null, nd = Infinity;
    for (let i = 0; i < G.ns; i++) for (let j = 0; j < G.nw; j++) { const d = d2(cellXYZ(i, j), e.pos); if (d < nd) { nd = d; near = [i, j]; } }
    // LED 칸에서 길이 방향 ±6 mm(이웃 LED 까지 반 이상 떨어짐)·폭 전체 안의 최고 칸
    const ks = Math.round(6 / G.ds), cells = [];
    for (let di = -ks; di <= ks; di++) { const i = rowAt(near[0] + di); if (i < 0) continue; for (let j = 0; j < G.nw; j++) { const k = i * G.nw + j; if (G.valid[k]) cells.push([i, j, map[k]]); } }
    const top = cells.reduce((a, c) => (c[2] > a[2] ? c : a)), pk = cellXYZ(top[0], top[1]);
    // 최고 칸 둘레 2 mm 안에서 (값 − 최고의 70%) 가중 무게중심 = 칸 크기보다 촘촘한 최고점 위치(노이즈 평균)
    let sw = 0, sx = 0, sy = 0;
    for (const [i, j, v] of cells) { const q = cellXYZ(i, j), wt = v - 0.7 * top[2]; if (wt > 0 && d2(q, pk) <= 2) { sw += wt; sx += wt * q[0]; sy += wt * q[1]; } }
    return { off: d2([sx / sw, sy / sw], e.pos), cell: d2(pk, e.pos), near: nd };
  });
  const mean = map.reduce((a, v, k) => a + (G.valid[k] ? v : 0), 0) / G.valid.reduce((a, v) => a + v, 0);
  console.log(`  계산 ${((Date.now() - t0) / 1000).toFixed(1)}s, 최고/평균 ${(Math.max(...map) / mean).toFixed(2)}, relNoiseCell ${st.relNoiseCell?.toFixed(3)}`);
  res.forEach((x, n) => console.log(`  LED ${n} (${labels[n]}): 최고점 중심 ${x.off.toFixed(2)} mm, 최고 칸 ${x.cell.toFixed(2)} mm`));
  ok(res.every((x) => x.near <= 0.36), `${name}: LED 마다 0.5 mm 칸 하나가 바로 위에 있음(라인 좌표 ↔ 3D 일치)`);
  ok(res.every((x) => x.cell <= 1.5), `${name}: 최고 칸이 LED 에서 1.5 mm(칸 3개) 안: 최대 ${Math.max(...res.map((x) => x.cell)).toFixed(2)} mm`);
  ok(res.every((x) => x.off <= 0.6), `${name}: 최고점 중심이 LED 에서 0.6 mm 안: 최대 ${Math.max(...res.map((x) => x.off)).toFixed(2)} mm`);
  const rms = Math.sqrt(res.reduce((a, x) => a + x.off ** 2, 0) / res.length);
  ok(rms <= 0.35, `${name}: 최고점 중심 거리 평균(RMS) ${rms.toFixed(2)} mm ≤ 0.35 mm`);
  ok(r.ledger.lost === 0, `${name}: 잃은 광선 없음`);
}

if (!slow) { // 링: 각도·반경으로 직접 놓음(라인 좌표계와 무관) — 반경 14·16·18 = 안쪽 가장자리에서 2·4·6 mm, 이음매(0°) 근처 하나
  const deg = [3, 47, 92, 140, 181, 226, 272, 318], rad = [14, 18, 16, 14, 18, 16, 14, 18];
  const em = deg.map((d, k) => { const a = (d * Math.PI) / 180; return { pos: [rad[k] * Math.cos(a), rad[k] * Math.sin(a), 0.5], axis: [0, 0, 1], xAxis: [-Math.sin(a), Math.cos(a), 0] }; });
  check('링', [ringSolid(12, 20, 4, 6), boxMesh(-25, -25, -1, 50, 50, 1)], [0, 3], em, deg.map((d, k) => `${d}°, r${rad[k]}`), (l) => l.closed && Math.abs(l.length - 2 * Math.PI * 16) < 1);
}
if (!slow) { // 직선 띠 100×8(상자 면 2·3 = 긴 옆면, 4·5 = 끝면 → 모두 백색) — y 2·4·6 = 한쪽 가장자리에서 2·4·6 mm, 끝(x 0)에서 5 mm 인 LED 하나
  const xs = [5, 17, 30, 42, 55, 68, 80, 93], ys = [2, 6, 4, 2, 6, 4, 2, 6];
  const em = xs.map((x, k) => ({ pos: [x, ys[k], 0.5], axis: [0, 0, 1], xAxis: [1, 0, 0] }));
  check('직선 띠', [boxMesh(0, 0, 4, 100, 8, 2), boxMesh(-5, -5, -1, 110, 18, 1)], [2, 3, 4, 5], em, xs.map((x, k) => `x${x}, y${ys[k]}`), (l) => l.kind === 'line' && Math.abs(l.length - 100) < 0.6);
}
function twoRows(milky) { // 두 줄 일관성(2026-11-23): 4.2 mm 간격 두 줄은 빛이 겹쳐 최고점이 줄 사이로 1.2–1.7 mm 끌림(물리) — 최고점 대신
  // "두 줄 함께 계산한 지도 = 한 줄씩 계산해 더한 지도"(빛의 선형성)를 확인. LED 수에 따라 광량·경로가 달라지면 깨짐
  const meshes = [boxMesh(0, 0, 4, 100, 8, 2), boxMesh(-5, -5, -1, 110, 18, 1)], name = `두 줄 Milky ${milky}`;
  setMech3dMesh(name, meshes);
  const S = buildTraceScene(getMech3d(), { name, parts: [diffuser([2, 3, 4, 5], milky), pcbPart], contacts: [] }, { table });
  const faces = [{ part: 0, face: 1 }], line = recognizeLine(meshes, faces, [0, 0, 1]);
  const obs = { faces, dir: [0, 0, 1], cone: 90, edgeExcl: 0.5, targetLen: 0.8, targetWid: 0.8, cellS: 0.5, cellW: 0.5 }, G = tallyGeometry(line, obs);
  const em = (pts) => pts.map(([x, y]) => ({ pos: [x, y, 0.5], axis: [0, 0, 1], xAxis: [1, 0, 0] }));
  const A = em(Array.from({ length: 12 }, (_, k) => [4 + k * 7.8, 1.9])), B = em(Array.from({ length: 13 }, (_, k) => [7.5 + k * 7.07, 6.1]));
  const N = Number(process.env.PEAK_N ?? 500000), map = (e, n, seed) => { const r = runJob({ S, line, obs, G, emitters: e, ledSpec: { model: 'lambertian', beam: 120 }, N: n, seed, batches: 10 }); ok(r.ledger.lost === 0, `${name}: 잃은 광선 없음(LED ${e.length}개)`); return tallyStats(G, r.accs, obs, r.cnts).map; };
  const t0 = Date.now(), mA = map(A, N, 7), mB = map(B, N, 9), mAB = map([...A, ...B], 2 * N, 11), sum = mA.map((v, k) => v + mB[k]);
  const tot = (m) => m.reduce((a, v, k) => a + (G.valid[k] ? v : 0), 0), ratio = tot(mAB) / tot(sum);
  // 폭 방향 단면(길이 전체 합)·길이 방향 단면(2 mm 묶음, 폭 전체 합) — 칸 하나보다 노이즈가 작아 비교 가능
  const prof = (m, byW) => { const out = new Map(); for (let i = 0; i < G.ns; i++) for (let j = 0; j < G.nw; j++) { const k = i * G.nw + j; if (!G.valid[k]) continue; const b = byW ? j : Math.floor((i * G.ds) / bin); out.set(b, (out.get(b) ?? 0) + m[k]); } return out; };
  const worst = (byW) => { const p = prof(mAB, byW), q = prof(sum, byW), mean = [...q.values()].reduce((a, v) => a + v, 0) / q.size; return Math.max(...[...q.keys()].map((b) => Math.abs(p.get(b) - q.get(b)) / mean)); };
  const bin = milky > 5 ? 4 : 2;   // 길이 방향 묶음 mm — Milky 7.65 는 칸 노이즈가 커 2 mm 묶음이 기준 6%에 붙음(5.89%) → 4 mm
  const dw = worst(true), ds = worst(false);
  console.log(`  계산 ${((Date.now() - t0) / 1000).toFixed(1)}s, 두 줄/합 광량 ${ratio.toFixed(4)}, 폭 단면 최대 차 ${(100 * dw).toFixed(2)}%, 길이 단면 최대 차 ${(100 * ds).toFixed(2)}%`);
  ok(Math.abs(ratio - 1) <= 0.01, `${name}: 함께 계산한 광량 = 한 줄씩 더한 광량(±1%): ${ratio.toFixed(4)}`);
  ok(dw <= 0.03, `${name}: 폭 방향 단면이 한 줄씩 더한 것과 같음(평균의 3% 안): 최대 ${(100 * dw).toFixed(2)}%`);
  ok(ds <= 0.06, `${name}: 길이 방향 단면(${bin} mm 묶음)이 한 줄씩 더한 것과 같음(평균의 6% 안): 최대 ${(100 * ds).toFixed(2)}%`);
}
twoRows(slow ? 7.65 : 3);
done();
