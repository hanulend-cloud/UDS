// 30 MB 이상 STEP 전용 고속 경로. OCCT 8 SIMD 빌드가 파일 전체를 한 번에 변환한 뒤
// 부품별 메시를 만든다. 구 OCCT 7.6의 TransferEntity 병렬 경로보다 실제 92 MB 도면에서 훨씬 빠르다.
import { meshVolume } from '../mech3d/mesh.js';

export const FAST_BIG_MESH = { linDefl: 0.08, angDefl: 0.3 };
export const FAST_STEP_MIN_BYTES = 30e6;
export const shouldUseFastStep = (bytes) => Number.isFinite(bytes) && bytes >= FAST_STEP_MIN_BYTES;

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

export async function readStepPartsFast(data, { onStage = null, onPart = null } = {}) {
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
      const part = fastMeshPart(kernel.meshShape(solids[i], { linearDeflection: FAST_BIG_MESH.linDefl, angularDeflection: FAST_BIG_MESH.angDefl }));
      part.volume = Math.abs(kernel.getVolume(solids[i]));   // 정렬·복원 비교는 메시 근사가 아니라 B-rep 실제 체적 기준
      parts.push(part);
      onPart?.(i + 1, solids.length);
    }
    parts.sort((a, b) => b.volume - a.volume);
    return parts;
  } finally {
    for (const s of solids) kernel.release(s);
    if (root != null) kernel.release(root);
    kernel[Symbol.dispose]();
  }
}
