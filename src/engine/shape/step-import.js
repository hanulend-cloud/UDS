// STEP 불러오기 — 형상 몸체 spec 2026-10-10 §3.1 (G0) + 3D 기구 spec 2026-10-14 §3.1. oc = 초기화된 opencascade.js(브라우저 Worker·Node 공용).
// readStepMesh: 체적 최대 솔리드 1개(L3 몸체·높이맵용). readStepParts: 모든 솔리드를 부품별 메쉬로(3D 기구 모드).

function volumeOf(oc, shape) {
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.VolumeProperties_1(shape, props, false, false, false);
  const v = props.Mass(); props.delete();
  return Math.abs(v);
}

// STEP 텍스트 → 솔리드 목록(부피 내림차순). 호출자가 rd.delete() 책임.
function readSolids(oc, text, onStage) {
  const path = '/uds-import.stp';
  oc.FS.writeFile(path, text);
  const rd = new oc.STEPControl_Reader_1();
  onStage?.('read');
  const st = rd.ReadFile(path);
  try { oc.FS.unlink(path); } catch {}   // 큰 파일 — 해석 뒤 메모리 비움
  if (st !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) { rd.delete(); throw new Error('STEP 읽기 실패(형식 오류 또는 지원하지 않는 파일)'); }
  onStage?.('transfer');
  rd.TransferRoots(new oc.Message_ProgressRange_1());
  const root = rd.OneShape();
  const solids = [];
  for (const ex = new oc.TopExp_Explorer_2(root, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); ex.More(); ex.Next()) {
    const s = oc.TopoDS.Solid_1(ex.Current());
    solids.push({ s, v: volumeOf(oc, s) });
  }
  if (!solids.length) { rd.delete(); throw new Error('STEP 에 솔리드가 없음(면·와이어만 있는 파일)'); }
  solids.sort((a, b) => b.v - a.v);
  return { rd, solids };
}

// 솔리드 → 삼각 메쉬(위치 변환·면 방향 반영). faceIds = 삼각형별 B-rep 면 번호(TopExp 순서, 삼각화 없는 면도 번호 소비).
// linDefl: 메시 현 오차(mm) — 곡면 표본화 정확도. angDefl: 각도 오차(rad).
function meshSolid(oc, shape, linDefl, angDefl) {
  new oc.BRepMesh_IncrementalMesh_2(shape, linDefl, false, angDefl, false).delete?.();
  const pos = [], tri = [], fid = [];
  let f = 0;
  for (const ex = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); ex.More(); ex.Next(), f++) {
    const face = oc.TopoDS.Face_1(ex.Current());
    const loc = new oc.TopLoc_Location_1();
    const h = oc.BRep_Tool.Triangulation(face, loc, 0);
    if (h.IsNull()) { loc.delete(); continue; }
    const T = h.get(), trsf = loc.Transformation(), base = pos.length / 3;
    for (let i = 1; i <= T.NbNodes(); i++) { const n = T.Node(i), p = n.Transformed(trsf); pos.push(p.X(), p.Y(), p.Z()); n.delete(); p.delete(); }   // 임시 객체를 지워야 큰 도면에서 WASM 메모리가 차지 않음
    const rev = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
    for (let i = 1; i <= T.NbTriangles(); i++) {
      const t = T.Triangle(i), a = t.Value(1) - 1, b = t.Value(2) - 1, c = t.Value(3) - 1;
      if (rev) tri.push(base + a, base + c, base + b); else tri.push(base + a, base + b, base + c);
      fid.push(f); t.delete();
    }
    loc.delete();
  }
  return { positions: Float32Array.from(pos), triangles: Uint32Array.from(tri), faceIds: Uint32Array.from(fid), faceCount: f };
}

export function readStepMesh(oc, text, { linDefl = 0.01, angDefl = 0.1 } = {}) {
  const { rd, solids } = readSolids(oc, text);
  const m = meshSolid(oc, solids[0].s, linDefl, angDefl);
  rd.delete();
  return {
    positions: m.positions, triangles: m.triangles,
    solidCount: solids.length, volume: solids[0].v, droppedVolumes: solids.slice(1).map((x) => x.v),
  };
}

// 솔리드 외곽 대각선(mm)
function diagOf(oc, shape) {
  const b = new oc.Bnd_Box_1(); oc.BRepBndLib.Add(shape, b, true);
  const lo = b.CornerMin(), hi = b.CornerMax(), d = Math.hypot(hi.X() - lo.X(), hi.Y() - lo.Y(), hi.Z() - lo.Z()); b.delete();
  return d;
}
// 모든 솔리드 → [{ positions, triangles, faceIds, faceCount, volume }] (부피 내림차순)
// 작은 부품이 여럿 반복되면(LED 등 — 대각선 ≤ 작은 기준, 8개 이상) 그 부품들은 거칠게(coarse) 나눔: 렌즈·리드·필렛 같은 작은 곡면을
// 5.7° 각도 오차로 나누면 LED 하나에 수만 삼각형 → 40개면 수백만이 되어 화면이 멈춤. LED 몸체는 광원 모델로 바뀌거나 반사체라 정밀도 영향이 작음.
// 큰 파일(2026-11-05): profile = stepProfile(파일 크기). preview = 거친 메시를 먼저 만들어 onPreview(묶음, 지금까지 부품 수, 전체) 로 넘김 — 최종 메시는 그대로.
// big = 메시 완화(판정 값이 조금 달라질 수 있음 — 화면에 알림). onStage('read'|'transfer'|'preview'|'mesh') · onPart(i, n) = 진행 알림
export const stepProfile = (bytes) => ({ preview: bytes >= 10e6, big: bytes >= 30e6 });
export const BIG_MESH = { linDefl: 0.05, angDefl: 0.2 };
const BIG_SMALL = { linDefl: 0.2, angDefl: 0.6 }, PREVIEW = { linDefl: 1, angDefl: 0.6 };
function mergeMeshes(list) {
  const nP = list.reduce((s, m) => s + m.positions.length, 0), nT = list.reduce((s, m) => s + m.triangles.length, 0);
  const positions = new Float32Array(nP), triangles = new Uint32Array(nT), faceIds = new Uint32Array(nT / 3);
  let p = 0, t = 0;
  for (const m of list) { positions.set(m.positions, p); for (let i = 0; i < m.triangles.length; i++) triangles[t + i] = m.triangles[i] + p / 3; p += m.positions.length; t += m.triangles.length; }
  return { positions, triangles, faceIds, faceCount: 1 };
}
export function readStepParts(oc, text, { linDefl = 0.01, angDefl = 0.1, coarse = { linDefl: 0.03, angDefl: 0.35 }, smallDiag = 20, smallMin = 8, profile = stepProfile(text.length), onStage = null, onPreview = null, onPart = null } = {}) {
  const { rd, solids } = readSolids(oc, text, onStage);
  const diag = solids.map(({ s }) => diagOf(oc, s)), big = Math.max(...diag);
  const small = diag.map((d) => d <= smallDiag && d <= big * 0.2), nSmall = small.filter(Boolean).length, useCoarse = nSmall >= smallMin;
  const qOf = (i) => (useCoarse && small[i] ? (profile.big ? BIG_SMALL : coarse) : profile.big ? BIG_MESH : { linDefl, angDefl });
  const kept = new Array(solids.length);   // 큰 파일의 작은 부품 = 미리보기 메시가 곧 최종(다시 만들지 않음)
  if (profile.preview) {
    onStage?.('preview');
    let batch = [], t0 = Date.now();
    solids.forEach(({ s }, i) => {
      const q = qOf(i), final = q === BIG_SMALL, m = final ? meshSolid(oc, s, q.linDefl, q.angDefl) : meshSolid(oc, s, PREVIEW.linDefl, PREVIEW.angDefl);
      if (final) kept[i] = m;
      batch.push(m);
      if (i === solids.length - 1 || Date.now() - t0 > 500) { onPreview?.(mergeMeshes(batch), i + 1, solids.length); batch = []; t0 = Date.now(); }
    });
  }
  onStage?.('mesh');
  const parts = solids.map(({ s, v }, i) => {
    let m = kept[i];
    if (!m) { const q = qOf(i); if (profile.preview) oc.BRepTools.Clean(s, true); m = meshSolid(oc, s, q.linDefl, q.angDefl); }
    onPart?.(i + 1, solids.length);
    return { ...m, volume: v };
  });
  rd.delete();
  return parts;
}
