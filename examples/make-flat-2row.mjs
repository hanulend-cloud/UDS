// 평판 2열 예제 STEP 만들기(2026-11-07) — 1열 예제(test/fixtures/mech3d-sample.mjs)와 같은 하우징·확산판, 도광 바만 폭 4 → 12 mm(y 4~16),
// LED STEP = 같은 PCB + LED 2열(y 7·13) × 10개(x = 7.8 + 11.6·i). 직접 실행: node examples/make-flat-2row.mjs
import { box, translate, shapesToStepText, fuseAll } from '../src/export/oc-build.js';
const { default: init } = await import('opencascade.js/dist/node.js');
const { writeFileSync } = await import('node:fs');
const oc = await init();
const cut = new oc.BRepAlgoAPI_Cut_3(box(oc, 120, 20, 12), translate(oc, box(oc, 116, 16, 12), 2, 2, 2), new oc.Message_ProgressRange_1());
const housing = cut.Shape(), cover = translate(oc, box(oc, 116, 16, 2), 2, 2, 10), guide = translate(oc, box(oc, 116, 12, 6), 2, 4, 4);
writeFileSync(new URL('./flat-2row/mech3d-sample-2row.stp', import.meta.url), shapesToStepText(oc, [housing, cover, guide]));
const X = Array.from({ length: 10 }, (_, i) => 7.8 + i * 11.6), pcb = translate(oc, box(oc, 116, 12, 0.5), 2, 4, 2);
const led = (x, yc) => fuseAll(oc, [translate(oc, box(oc, 3, 2, 0.7), x - 1.5, yc - 1, 2.5), translate(oc, box(oc, 1, 1, 0.3), x - 0.5, yc - 0.5, 3.2)]);
writeFileSync(new URL('./flat-2row/mech3d-led-sample-2row.stp', import.meta.url), shapesToStepText(oc, [pcb, ...X.map((x) => led(x, 7)), ...X.map((x) => led(x, 13))]));
console.log('wrote examples/flat-2row/*.stp');
