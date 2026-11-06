// 큰 STEP 나눠 읽기(2026-11-06) — 작업자 K 개가 같은 파일을 각자 해석하고, 루트(최상위 부품)를 (i−1) mod K 로 나눠 변환·메시.
// 결과는 한 번에 읽기(readStepParts)와 같아야 함: 같은 정렬(부피 내림차순, 같으면 루트·순번), 같은 간격 규칙(qualityPlan), 같은 재사용 규칙.
// 작업자 사이에는 OpenCASCADE 형상을 넘길 수 없으므로 숫자(부피·대각선)와 메시만 오감. 순수(OC 는 인자) — Node 시험에서 차례로 돌려 같은지 봄
import { meshSolid, diagOf, volumeOf, faceCountOf, meshDiag, BIG_SMALL, PREVIEW, qualityPlan } from './step-import.js';

const sameQ = (a, b) => a.linDefl === b.linDefl && a.angDefl === b.angDefl;   // 작업자 사이 복사로 객체 동일성이 사라지므로 값으로 비교

// 작업자 k/K: 해석 → 맡은 루트 변환. onParsed(n) · onRoot(i, n, ms, 이번 루트의 항목들). 항목 = { root, j, s, v, diag, pre }
export function splitTransfer(oc, text, k, K, { profile, onParsed = null, onRoot = null } = {}) {
  const path = `/uds-split-${k}.stp`;
  oc.FS.writeFile(path, text);
  const rd = new oc.STEPControl_Reader_1(), st = rd.ReadFile(path);
  try { oc.FS.unlink(path); } catch {}
  if (st !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) { rd.delete(); throw new Error('STEP 읽기 실패(형식 오류 또는 지원하지 않는 파일)'); }
  const n = rd.NbRootsForTransfer(), PRE = profile.big ? BIG_SMALL : PREVIEW, items = [];
  onParsed?.(n);
  for (let i = 1; i <= n; i++) {
    if ((i - 1) % K !== k) continue;
    const t = Date.now(), k0 = rd.NbShapes();
    rd.TransferRoot(i, new oc.Message_ProgressRange_1());
    const ms = Date.now() - t, shape = rd.NbShapes() > k0 ? rd.Shape(rd.NbShapes()) : null, got = [];
    if (shape) {
      let j = 0;
      for (const ex = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); ex.More(); ex.Next()) {
        const s = oc.TopoDS.Solid_1(ex.Current());
        const it = { root: i, j: j++, s, v: volumeOf(oc, s), diag: diagOf(oc, s), pre: profile.preview ? meshSolid(oc, s, PRE.linDefl, PRE.angDefl) : null };
        items.push(it); got.push(it);
      }
    }
    onRoot?.(i, n, ms, got);
  }
  return { rd, n, items };
}

// 합치는 쪽: 모든 작업자의 { h(작업자), x(그 작업자 안 번호), root, j, v, diag } → 한 번에 읽기와 같은 순서 + 그 순서의 간격 규칙
export function planSplit(list, profile, opts = {}) {
  const order = [...list].sort((a, b) => b.v - a.v || a.root - b.root || a.j - b.j);
  const qs = qualityPlan(order.map((o) => o.diag), profile, opts);
  return { order, qs };
}

// 작업자: 받은 간격으로 거친 메시(먼저 화면 열기)와 최종 메시. 한 번에 읽기와 같은 재사용 규칙
export function splitRough(oc, items, qs, profile) {
  const PRE = profile.big ? BIG_SMALL : PREVIEW;
  return items.map((it, x) => {
    const q = qs[x], final = sameQ(q, BIG_SMALL), p = (!final || PRE === BIG_SMALL) ? it.pre : null;
    const ok = p && p.faceCount === faceCountOf(oc, it.s) && Math.abs(meshDiag(p) - it.diag) <= 0.02 * it.diag + 1.5;
    const m = ok ? p : final ? meshSolid(oc, it.s, q.linDefl, q.angDefl) : meshSolid(oc, it.s, PREVIEW.linDefl, PREVIEW.angDefl);
    it.kept = final ? m : null;
    return m;
  });
}
export function splitFine(oc, items, qs, profile, onPart = null) {
  return items.map((it, x) => {
    let m = it.kept;
    if (!m) { const q = qs[x]; if (profile.preview) oc.BRepTools.Clean(it.s, true); m = meshSolid(oc, it.s, q.linDefl, q.angDefl); }
    onPart?.(x);
    return m;
  });
}

// Node 시험·작업자 없을 때: 작업자 K 개를 차례로 흉내 내 같은 결과를 만듦
export function splitPartsSequential(oc, text, K, profile, opts = {}) {
  const runs = Array.from({ length: K }, (_, k) => splitTransfer(oc, text, k, K, { profile }));
  const list = runs.flatMap((r, h) => r.items.map((it, x) => ({ h, x, root: it.root, j: it.j, v: it.v, diag: it.diag })));
  const { order, qs } = planSplit(list, profile, opts);
  const qOf = runs.map((r) => new Array(r.items.length));
  order.forEach((o, i) => { qOf[o.h][o.x] = qs[i]; });
  const rough = runs.map((r, h) => (profile.preview ? splitRough(oc, r.items, qOf[h], profile) : null));
  const fine = runs.map((r, h) => splitFine(oc, r.items, qOf[h], profile));
  runs.forEach((r) => r.rd.delete());
  return { parts: order.map((o) => ({ ...fine[o.h][o.x], volume: o.v })), rough: profile.preview ? order.map((o) => ({ ...rough[o.h][o.x], volume: o.v })) : null };
}
