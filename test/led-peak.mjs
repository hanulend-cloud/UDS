// LED 위치 = 광분포 최고점(약한 확산): node test/led-peak.mjs
// 2026-11-23 사용자 기준 — "확산이 심하지 않으면 LED 좌표의 peak 와 광분포 peak 가 일치해야 제대로 된 시뮬레이션".
// 링 확산판(R12–20, 두께 2, Milky 3, 옆면 백색) 아래에 떨어진 LED 8개(폭 +2·0·−2, 이음매 근처 포함)를 놓고
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

const table = loadTable(), R0 = 12, R1 = 20, white = { kind: 'whiteDiffuse', R: 0.85 };
const meshes = [ringSolid(R0, R1, 4, 6), boxMesh(-25, -25, -1, 50, 50, 1)];
let diff = setPartMaterialParam(setPartMaterial(defaultPart(0, 'diffuser', 1), 'milky'), 'milky', 3);
diff = setPartFinish(setPartFinish(diff, 0, white), 3, white);
const pcb = setPartFinish(defaultPart(1, 'pcb', 1), null, { kind: 'whiteDiffuse', R: 0.3 });
setMech3dMesh('peak', meshes);
const S = buildTraceScene(getMech3d(), { name: 'peak', parts: [diff, pcb], contacts: [] }, { table });
const faces = [{ part: 0, face: 1 }], line = recognizeLine(meshes, faces, [0, 0, 1]);
const obs = { faces, dir: [0, 0, 1], cone: 90, edgeExcl: 0.5, targetLen: 0.8, targetWid: 0.8, cellS: 0.5, cellW: 0.5 };
const G = tallyGeometry(line, obs);
ok(line.kind !== 'line' && Math.abs(line.length - 2 * Math.PI * 16) < 1 && Math.abs(line.width - 8) < 0.4 && Math.abs(G.cell - 0.5) < 1e-9, `링 관측 라인: 길이 ${line.length.toFixed(1)} 폭 ${line.width.toFixed(2)}, 칸 ${G.cell} mm`);

// LED: 각도·반경으로 직접 놓음(라인 좌표계와 무관) — 반경 14·16·18 = 확산판 안쪽 가장자리에서 2·4·6 mm, 이음매(0°) 근처 하나
const deg = [3, 47, 92, 140, 181, 226, 272, 318], rad = [14, 18, 16, 14, 18, 16, 14, 18];
const emitters = deg.map((d, k) => { const a = (d * Math.PI) / 180; return { pos: [rad[k] * Math.cos(a), rad[k] * Math.sin(a), 0.5], axis: [0, 0, 1], xAxis: [-Math.sin(a), Math.cos(a), 0] }; });
const t0 = Date.now(), r = runJob({ S, line, obs, G, emitters, ledSpec: { model: 'lambertian', beam: 120 }, N: Number(process.env.PEAK_N ?? 500000), seed: 5, batches: 10 });
const st = tallyStats(G, r.accs, obs, r.cnts), map = st.map;
const L = G.L ?? line.length, wrap = (d) => ((((d + L / 2) % L) + L) % L) - L / 2;
// 각 LED 의 s·w(라인 좌표)는 지도 쪽 변환을 쓰지 않고 가장 가까운 칸 중심을 3D 로 되돌려 찾는다
const cellXYZ = (i, j) => line.fromSW((i + 0.5) * G.ds, G.w0 + (j + 0.5) * G.cell);
const d2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const res = emitters.map((e) => {
  let near = null, nd = Infinity;
  for (let i = 0; i < G.ns; i++) for (let j = 0; j < G.nw; j++) { const d = d2(cellXYZ(i, j), e.pos); if (d < nd) { nd = d; near = [i, j]; } }
  // LED 칸에서 둘레 ±6 mm(이웃 LED 까지 반 이상 떨어짐)·폭 전체 안의 최고 칸
  let best = -1, bk = null; const ks = Math.round(6 / G.ds);
  for (let di = -ks; di <= ks; di++) { const i = (near[0] + di + G.ns) % G.ns; for (let j = 0; j < G.nw; j++) { const k = i * G.nw + j; if (G.valid[k] && map[k] > best) { best = map[k]; bk = [i, j]; } } }
  // 최고 칸 둘레 2 mm 안에서 (값 − 최고의 70%) 가중 무게중심 = 칸 크기보다 촘촘한 최고점 위치(노이즈 평균)
  const pk = cellXYZ(...bk); let sw = 0, sx = 0, sy = 0;
  for (let di = -ks; di <= ks; di++) { const i = (near[0] + di + G.ns) % G.ns; for (let j = 0; j < G.nw; j++) { const k = i * G.nw + j; if (!G.valid[k]) continue; const q = cellXYZ(i, j), wt = map[k] - 0.7 * best; if (wt > 0 && d2(q, pk) <= 2) { sw += wt; sx += wt * q[0]; sy += wt * q[1]; } } }
  const c = [sx / sw, sy / sw];
  return { off: d2(c, e.pos), cell: d2(pk, e.pos), near: nd };
});
const mean = map.reduce((a, v, k) => a + (G.valid[k] ? v : 0), 0) / G.valid.reduce((a, v) => a + v, 0);
console.log(`  계산 ${((Date.now() - t0) / 1000).toFixed(1)}s, lost ${r.ledger.lost}, 최고/평균 ${(Math.max(...map) / mean).toFixed(2)}, relNoiseCell ${st.relNoiseCell?.toFixed(3)}`);
res.forEach((x, n) => console.log(`  LED ${n} (${deg[n]}°, r${rad[n]}): 최고점 중심 ${x.off.toFixed(2)} mm, 최고 칸 ${x.cell.toFixed(2)} mm`));
ok(res.every((x) => x.near <= 0.36), 'LED 마다 0.5 mm 칸 하나가 바로 위에 있음(라인 좌표 ↔ 3D 일치)');
ok(res.every((x) => x.cell <= 1.5), `최고 칸이 LED 에서 1.5 mm(칸 3개) 안: 최대 ${Math.max(...res.map((x) => x.cell)).toFixed(2)} mm`);
ok(res.every((x) => x.off <= 0.6), `최고점 중심이 LED 에서 0.6 mm 안: 최대 ${Math.max(...res.map((x) => x.off)).toFixed(2)} mm`);
const rms = Math.sqrt(res.reduce((a, x) => a + x.off ** 2, 0) / res.length);
ok(rms <= 0.35, `최고점 중심 거리 평균(RMS) ${rms.toFixed(2)} mm ≤ 0.35 mm`);
ok(r.ledger.lost === 0, '잃은 광선 없음');
done();
