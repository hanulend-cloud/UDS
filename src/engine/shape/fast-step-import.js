// 30 MB 이상 STEP 전용 고속 경로. OCCT 8 SIMD 빌드가 파일 전체를 한 번에 변환한 뒤
// 부품별 메시를 만든다. 구 OCCT 7.6의 TransferEntity 병렬 경로보다 실제 92 MB 도면에서 훨씬 빠르다.
import { meshVolume } from '../mech3d/mesh.js';

export const FAST_BIG_MESH = { linDefl: 0.08, angDefl: 0.3 };
export const FAST_STEP_MIN_BYTES = 30e6;
export const shouldUseFastStep = (bytes) => Number.isFinite(bytes) && bytes >= FAST_STEP_MIN_BYTES;
// 면이 아주 많은 부품(미세 타공 그릴: 한 장에 면 3천 개)은 각도 간격만 넓힘(2026-11-13) — 평면 하나에 구멍 수천 개면 메시 시간이 구멍 둘레 점 수에
// 급하게 늘어(그릴 한 장 82초 → 20초). 현 오차(mm)는 그대로라 곡면이 0.08 mm 넘게 어긋나지 않음. 달라지는 것 = 반지름 약 7 mm 이하 둥근 면의 조각 수
export const FAST_HEAVY = { linDefl: 0.08, angDefl: 0.8 }, FAST_HEAVY_FACES = 2000;
export const fastQuality = (faces) => (faces >= FAST_HEAVY_FACES ? FAST_HEAVY : FAST_BIG_MESH);
// 조각 동시 읽기 작업자 수 — 작업자 하나가 조각 하나(≈ 1 GB 까지)를 맡음. 화면·합치는 쪽 몫으로 코어 2개 남김
export function fastWorkers(nav = {}) {
  let K = Math.min(8, Math.max(1, (nav.hardwareConcurrency ?? 4) - 2));
  if ((nav.deviceMemory ?? 8) < 8) K = Math.min(K, 3);
  return K;
}
// 조각별 부품(읽은 순서, c = 무게중심) → 한 번에 읽은 것과 같은 순서의 부품 목록. units[h] = 조각 h 의 단위 번호(cutStepUnits).
// 순서 = 부피 내림차순, 같은 부피는 원본 파일 순서(조각마다 솔리드 수 = 단위 수일 때 — 솔리드 j 가 단위 j). 아니면 위치(x·y·z) 순서
export function mergeFastPieces(lists, units) {
  const exact = lists.every((L, h) => L.length === (units?.[h]?.length ?? -1));
  const all = lists.flatMap((L, h) => L.map((p, j) => ({ p, key: exact ? units[h][j] : 0 })));
  all.sort((a, b) => b.p.volume - a.p.volume || a.key - b.key || a.p.c[0] - b.p.c[0] || a.p.c[1] - b.p.c[1] || a.p.c[2] - b.p.c[2]);
  return all.map(({ p }) => { const { c, ...rest } = p; return rest; });
}

export function fastMeshPart(m) {
  const faceIds = new Uint32Array(m.triangleCount);
  const g = m.faceGroups ?? new Int32Array();
  for (let f = 0; f < g.length / 3; f++) {
    // occt-wasm 문서의 이름과 달리 현재 faceGroups 범위는 삼각형이 아니라 index 단위다.
    const first = g[f * 3] / 3, count = g[f * 3 + 1] / 3;
    faceIds.fill(f, first, first + count);
  }
  const part = { positions: m.positions, triangles: m.indices, faceIds, faceCount: m.faceCount ?? g.length / 3 };
  return { ...part, volume: Math.abs(meshVolume(part.positions, part.triangles)) };
}

// sorted = false: 읽은 순서 그대로 + 무게중심 c(조각 동시 읽기 — 합치는 쪽이 mergeFastPieces 로 정렬)
export async function readStepPartsFast(data, { onStage = null, onPart = null, sorted = true } = {}) {
  // 작은 STEP Worker가 21MB WASM을 받지 않도록 대용량 경로에 들어왔을 때만 OCCT 8을 불러온다.
  const { OcctKernel } = await import('../../../node_modules/occt-wasm/dist/index.js');
  const kernel = await OcctKernel.init();
  let root = null, solids = [];
  try {
    onStage?.('read');
    root = kernel.importStep(data);
    solids = kernel.getSubShapes(root, 'solid');
    if (!solids.length) throw new Error('STEP 에 솔리드가 없음(면·와이어만 있는 파일)');
    onStage?.('mesh');
    const parts = [];
    for (let i = 0; i < solids.length; i++) {
      const q = fastQuality(kernel.subShapeCount(solids[i], 'face'));
      const part = fastMeshPart(kernel.meshShape(solids[i], { linearDeflection: q.linDefl, angularDeflection: q.angDefl }));
      part.volume = Math.abs(kernel.getVolume(solids[i]));   // 정렬·복원 비교는 메시 근사가 아니라 B-rep 실제 체적 기준
      if (!sorted) { const c = kernel.getCenterOfMass(solids[i]); part.c = [c.x, c.y, c.z].map((v) => Math.round(v * 1e6) / 1e6); }
      parts.push(part);
      onPart?.(i + 1, solids.length);
    }
    if (sorted) parts.sort((a, b) => b.volume - a.volume);
    return parts;
  } finally {
    for (const s of solids) kernel.release(s);
    if (root != null) kernel.release(root);
    kernel[Symbol.dispose]();
  }
}
