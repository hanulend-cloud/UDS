// 대용량 STEP 시험용(2026-11-13) — 모니터 뒷면 링 조명: 뒷커버(620×370, 테두리) + 미세 타공 그릴 8장 + 가운데 링 조명 모듈 + VESA 판.
// 링 모듈: 바닥 링(r 95~118) · 안/밖 벽(높이 10) · 링 PCB(r 99~114) · LED 72개(r 106.5 원주 등간격, 렌즈 돔, +z = 벽 쪽으로 발광) · 링 확산판(r 95~118, z 10~12.5).
// 크기 ≈ 100 MB 는 그릴 타공(구멍 하나 ≈ 4 KB)으로 맞춤 — 광학과 관계없는 형상(뒷커버 안쪽 그릴)이라 링 조명 결과에는 영향 없음.
// 직접 실행: node test/fixtures/monitor-ring-72led.mjs [구멍 피치 mm, 기본 1.5] → examples/monitor-ring-72led/monitor-ring-72led.stp (git 에 넣지 않음, 100 MB 넘음)
import { box, translate, fuseAll, shapesToStepText } from '../../src/export/oc-build.js';

const cyl = (oc, x, y, z, r, h) => new oc.BRepPrimAPI_MakeCylinder_3(new oc.gp_Ax2_3(new oc.gp_Pnt_3(x, y, z), new oc.gp_Dir_4(0, 0, 1)), r, h).Shape();
const cut = (oc, a, b) => { const c = new oc.BRepAlgoAPI_Cut_3(a, b, new oc.Message_ProgressRange_1()); const s = c.Shape(); c.delete(); return s; };
const compound = (oc, shapes) => { const b = new oc.BRep_Builder(), c = new oc.TopoDS_Compound(); b.MakeCompound(c); for (const s of shapes) b.Add(c, s); return c; };
const annulus = (oc, r0, r1, z0, h) => cut(oc, cyl(oc, 0, 0, z0, r1, h), cyl(oc, 0, 0, z0, r0, h));

const T = 2.5;   // 뒷커버 두께(z −2.5~0, 바깥면 z = 0 이 벽 쪽)
// 그릴 창 8개: 위·아래 줄에 4개씩(130×60)
const WIN = [];
for (const y of [140, -140]) for (const x of [-232.5, -77.5, 77.5, 232.5]) WIN.push({ x, y, w: 130, h: 60 });

export function buildMonitorRingShapes(oc, { pitch = 1.5, holeD = 1.0, onProgress = null } = {}) {
  const shapes = [];
  // 뒷커버: 판에서 그릴 창을 뚫고 + 앞쪽(−z)으로 테두리
  let cover = translate(oc, box(oc, 620, 370, T), -310, -185, -T);
  cover = cut(oc, cover, compound(oc, WIN.map((w) => translate(oc, box(oc, w.w, w.h, T + 2), w.x - w.w / 2, w.y - w.h / 2, -T - 1))));
  const rim = [translate(oc, box(oc, 620, 2.5, 20), -310, -185, -T - 20), translate(oc, box(oc, 620, 2.5, 20), -310, 182.5, -T - 20),
    translate(oc, box(oc, 2.5, 365, 20), -310, -182.5, -T - 20), translate(oc, box(oc, 2.5, 365, 20), 307.5, -182.5, -T - 20)];
  shapes.push(fuseAll(oc, [cover, ...rim]));
  // 미세 타공 그릴(창마다 한 장 — 불리언을 판마다 따로 해 시간이 구멍 수에 비례)
  WIN.forEach((w, k) => {
    const holes = [], nx = Math.floor((w.w - 4) / pitch), ny = Math.floor((w.h - 4) / pitch);
    const x0 = w.x - ((nx - 1) * pitch) / 2, y0 = w.y - ((ny - 1) * pitch) / 2;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) holes.push(cyl(oc, x0 + i * pitch, y0 + j * pitch, -T - 1, holeD / 2, T + 2));
    shapes.push(cut(oc, translate(oc, box(oc, w.w, w.h, T), w.x - w.w / 2, w.y - w.h / 2, -T), compound(oc, holes)));
    onProgress?.(`그릴 ${k + 1}/${WIN.length} · 구멍 ${holes.length}개`);
  });
  // VESA 판(100×100×4, 나사 구멍 4개) — 링 안쪽
  shapes.push(cut(oc, translate(oc, box(oc, 110, 110, 4), -55, -55, 0), compound(oc, [[-50, -50], [50, -50], [-50, 50], [50, 50]].map(([x, y]) => cyl(oc, x, y, -1, 2.5, 6)))));
  // 링 조명 모듈
  shapes.push(annulus(oc, 95, 118, 0, 2));        // 바닥 링
  shapes.push(annulus(oc, 95, 97, 2, 8));         // 안쪽 벽
  shapes.push(annulus(oc, 116, 118, 2, 8));       // 바깥 벽
  shapes.push(annulus(oc, 99, 114, 2, 1.6));      // 링 PCB(z 2~3.6)
  for (let k = 0; k < 72; k++) {                  // LED 72개: 몸체 3×3×1.4 + 반구 렌즈(r 1.2), +z 발광
    const a = (2 * Math.PI * k) / 72, cx = 106.5 * Math.cos(a), cy = 106.5 * Math.sin(a);
    const body = translate(oc, box(oc, 3, 3, 1.4), cx - 1.5, cy - 1.5, 3.6);
    const dome = new oc.BRepPrimAPI_MakeSphere_7(new oc.gp_Pnt_3(cx, cy, 5.0), 1.2, 0, Math.PI / 2).Shape();
    shapes.push(fuseAll(oc, [body, dome]));
  }
  shapes.push(annulus(oc, 95, 118, 10, 2.5));     // 링 확산판(z 10~12.5)
  return shapes;
}
if (process.argv[1]?.endsWith('monitor-ring-72led.mjs')) {
  const { default: initOpenCascade } = await import('opencascade.js/dist/node.js');
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const oc = await initOpenCascade(), t0 = Date.now(), pitch = Number(process.argv[2]) || 1.5;
  const shapes = buildMonitorRingShapes(oc, { pitch, onProgress: (t) => console.log(`${((Date.now() - t0) / 1e3).toFixed(0)}s ${t}`) });
  const text = shapesToStepText(oc, shapes), dir = new URL('../../examples/monitor-ring-72led/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('monitor-ring-72led.stp', dir), text);
  console.log(`monitor-ring-72led.stp · 부품 ${shapes.length}개 · ${(text.length / 1e6).toFixed(1)} MB · ${((Date.now() - t0) / 1e3).toFixed(0)}s`);
}
