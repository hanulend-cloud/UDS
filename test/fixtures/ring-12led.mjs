// 링 조명 시험용 STEP(2026-11-06) — 링 확산판(반지름 32~40, 두께 2, z 6~8) + 링 PCB(z 0~1.6) + LED 12개(원주 등간격) + 바닥 원판.
// 2D 광량 분포를 링 모양으로 그리는지 화면에서 확인할 때 씀. 직접 실행: node test/fixtures/ring-12led.mjs → test/fixtures/ring-12led.stp
import { box, translate, fuseAll, shapesToStepText } from '../../src/export/oc-build.js';

function annulus(oc, r0, r1, z0, h) {
  const ax = new oc.gp_Ax2_3(new oc.gp_Pnt_3(0, 0, z0), new oc.gp_Dir_4(0, 0, 1));
  const o = new oc.BRepPrimAPI_MakeCylinder_3(ax, r1, h).Shape(), i = new oc.BRepPrimAPI_MakeCylinder_3(ax, r0, h).Shape();
  const c = new oc.BRepAlgoAPI_Cut_3(o, i, new oc.Message_ProgressRange_1()); const s = c.Shape(); c.delete(); return s;
}
export function buildRingShapes(oc) {
  const diffuser = annulus(oc, 32, 40, 6, 2), pcb = annulus(oc, 33, 39, 0, 1.6);
  const floor = new oc.BRepPrimAPI_MakeCylinder_3(new oc.gp_Ax2_3(new oc.gp_Pnt_3(0, 0, -2), new oc.gp_Dir_4(0, 0, 1)), 44, 2).Shape();
  const leds = [];
  for (let k = 0; k < 12; k++) {
    const a = (2 * Math.PI * k) / 12, cx = 36 * Math.cos(a), cy = 36 * Math.sin(a);
    leds.push(translate(oc, box(oc, 2.8, 2.8, 1.2), cx - 1.4, cy - 1.4, 1.6));
  }
  return [floor, diffuser, pcb, ...leds];
}
if (process.argv[1]?.endsWith('ring-12led.mjs')) {
  const { default: initOpenCascade } = await import('opencascade.js/dist/node.js');
  const { writeFileSync } = await import('node:fs');
  const oc = await initOpenCascade();
  writeFileSync(new URL('./ring-12led.stp', import.meta.url), shapesToStepText(oc, buildRingShapes(oc)));
  console.log('ring-12led.stp');
}
