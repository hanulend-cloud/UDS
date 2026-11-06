// 조립품 하나(루트 1)로 묶인 STEP(2026-11-06) — 실제 CAD 처럼 최상위 조립품 아래 부품들, 같은 LED 부품을 위치만 바꿔 40번 씀(인스턴스).
// 잘라 읽기(step-cut)가 루트 하나짜리 조립품을 하위 부품 단위로 나눠도 위치·개수가 같은지 시험할 때 씀.
// 직접 실행: node test/fixtures/one-root-asm.mjs → test/fixtures/one-root-asm.stp
import { box, translate, fuseAll } from '../../src/export/oc-build.js';

export function oneRootAsmText(oc) {
  const doc = new oc.TDocStd_Document(new oc.TCollection_ExtendedString_1()), h = new oc.Handle_TDocStd_Document_2(doc);
  const st = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get(), asm = st.NewShape();
  const add = (shape, x, y, z) => { const lab = st.AddShape(shape, false, true); place(lab, x, y, z); return lab; };
  const place = (lab, x, y, z) => { const t = new oc.gp_Trsf_1(); t.SetTranslation_1(new oc.gp_Vec_4(x, y, z)); st.AddComponent_1(asm, lab, new oc.TopLoc_Location_2(t)); };
  add(box(oc, 34, 400, 2), 2, 0, -2);                                     // 바닥
  add(box(oc, 30, 400, 1.6), 4, 0, 0);                                    // PCB
  add(translate(oc, box(oc, 22, 400, 5.5), 0, 0, 0), 8, 0, 6.5);           // 확산판
  const body = box(oc, 3.5, 3.5, 1.4), sph = new oc.BRepPrimAPI_MakeSphere_7(new oc.gp_Pnt_3(1.75, 1.75, 1.4), 1.4, 0, Math.PI / 2).Shape();
  const led = st.AddShape(fuseAll(oc, [body, sph]), false, true);        // LED 부품 하나 → 40 곳에
  for (let k = 0; k < 40; k++) place(led, 17, 5 + k * 10 - 1.75, 1.6);
  st.UpdateAssemblies();
  const w = new oc.STEPCAFControl_Writer_1();
  w.Transfer_1(h, oc.STEPControl_StepModelType.STEPControl_AsIs, null, new oc.Message_ProgressRange_1());   // null = 한 파일(빈 문자열이면 부품별 외부 파일로 나뉨)
  w.Write('/one-root-asm.stp');
  return oc.FS.readFile('/one-root-asm.stp', { encoding: 'utf8' });
}
// 중첩 조립품: 최상위 > 하위 조립품 M 개(x 로 이동) > 바닥·PCB(공용 부품) + 확산판(하위마다 고유) + LED 40(공용 부품 반복)
export function nestedAsmText(oc, M = 4) {
  const doc = new oc.TDocStd_Document(new oc.TCollection_ExtendedString_1()), h = new oc.Handle_TDocStd_Document_2(doc);
  const st = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get(), top = st.NewShape();
  const loc = (x, y, z) => { const t = new oc.gp_Trsf_1(); t.SetTranslation_1(new oc.gp_Vec_4(x, y, z)); return new oc.TopLoc_Location_2(t); };
  const floor = st.AddShape(box(oc, 34, 400, 2), false, true), pcb = st.AddShape(box(oc, 30, 400, 1.6), false, true);
  const sph = new oc.BRepPrimAPI_MakeSphere_7(new oc.gp_Pnt_3(1.75, 1.75, 1.4), 1.4, 0, Math.PI / 2).Shape();
  const led = st.AddShape(fuseAll(oc, [box(oc, 3.5, 3.5, 1.4), sph]), false, true);
  for (let m = 0; m < M; m++) {
    const sub = st.NewShape();
    st.AddComponent_1(sub, floor, loc(2, 0, -2)); st.AddComponent_1(sub, pcb, loc(4, 0, 0));
    st.AddComponent_1(sub, st.AddShape(box(oc, 22, 400, 5.5 + m * 0.01), false, true), loc(8, 0, 6.5));
    for (let k = 0; k < 40; k++) st.AddComponent_1(sub, led, loc(17, 5 + k * 10 - 1.75, 1.6));
    st.AddComponent_1(top, sub, loc(m * 60, 0, 0));
  }
  st.UpdateAssemblies();
  const w = new oc.STEPCAFControl_Writer_1();
  w.Transfer_1(h, oc.STEPControl_StepModelType.STEPControl_AsIs, null, new oc.Message_ProgressRange_1());
  w.Write('/nested-asm.stp');
  return oc.FS.readFile('/nested-asm.stp', { encoding: 'utf8' });
}
if (process.argv[1]?.endsWith('one-root-asm.mjs')) {
  const { default: initOpenCascade } = await import('opencascade.js/dist/node.js');
  const { writeFileSync } = await import('node:fs');
  const oc = await initOpenCascade();
  writeFileSync(new URL('./one-root-asm.stp', import.meta.url), oneRootAsmText(oc));
  console.log('one-root-asm.stp');
}
