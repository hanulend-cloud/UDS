// STEP 잘라 읽기(2026-11-06): 부품 단위 조각으로 나눠 따로 읽어도 원본과 같은 솔리드(부피·무게중심): node test/step-cut.mjs
import initOpenCascade from 'opencascade.js/dist/node.js';
import { readFileSync } from 'node:fs';
import { cutStep } from '../src/engine/shape/step-cut.js';
import { oneRootAsmText, nestedAsmText } from './fixtures/one-root-asm.mjs';
import { ok, done } from './mech3d-util.mjs';

const oc = await initOpenCascade();
const solids = (text) => {
  oc.FS.writeFile('/c.stp', text);
  const rd = new oc.STEPControl_Reader_1(); rd.ReadFile('/c.stp'); rd.TransferRoots(new oc.Message_ProgressRange_1());
  const out = [];
  for (const ex = new oc.TopExp_Explorer_2(rd.OneShape(), oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); ex.More(); ex.Next()) {
    const p = new oc.GProp_GProps_1(); oc.BRepGProp.VolumeProperties_1(oc.TopoDS.Solid_1(ex.Current()), p, false, false, false);
    const c = p.CentreOfMass(); out.push([Math.abs(p.Mass()), c.X(), c.Y(), c.Z()].map((v) => v.toFixed(3)).join(',')); p.delete();
  }
  rd.delete(); return out.sort();
};
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const cases = [
  ['평평한 파일(부품 11개)', readFileSync(new URL('./fixtures/mech3d-led-sample.stp', import.meta.url), 'utf8')],
  ['루트 여럿 + 작은 조립품', readFileSync(new URL('./fixtures/bent-diffuser-40led.stp', import.meta.url), 'utf8')],
  ['조립품 하나(루트 1, LED 40 반복)', oneRootAsmText(oc)],
  ['중첩 조립품(하위 4개가 공용 부품을 같이 씀)', nestedAsmText(oc, 4)],
];
for (const [name, text] of cases) {
  const ref = solids(text);
  for (const K of [2, 3]) {
    const pieces = cutStep(text, K);
    ok(pieces && pieces.length >= 2, `${name}: ${K}조각으로 잘림 (${pieces?.length})`);
    const got = pieces.flatMap(solids).sort();
    ok(same(ref, got), `${name}: 조각 ${pieces.length}개 합 = 원본 솔리드 ${ref.length}개(부피·위치)`);
    ok(pieces.every((p) => p.length < text.length), '조각은 원본보다 작음');
  }
}
ok(cutStep('ISO-10303-21;\nDATA;\n#1 = PRODUCT_DEFINITION(\'d\',\'\',#2,#3);\nENDSEC;\nEND-ISO-10303-21;', 3) === null, '부품 하나뿐 = 자르지 않음');
done();
