import { fastMeshPart, FAST_BIG_MESH, FAST_STEP_MIN_BYTES, shouldUseFastStep } from '../src/engine/shape/fast-step-import.js';
import { ok, done } from './mech3d-util.mjs';

const m = {
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  indices: Uint32Array.from([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
  triangleCount: 4, faceCount: 2,
  faceGroups: Int32Array.from([0, 6, 101, 6, 6, 202]),
};
const p = fastMeshPart(m);
ok(p.positions === m.positions && p.triangles === m.indices, 'OCCT 8 메시 버퍼를 복사 없이 사용');
ok([...p.faceIds].join() === '0,0,1,1' && p.faceCount === 2, 'index 단위 faceGroups를 삼각형별 면 번호로 변환');
ok(Math.abs(p.volume - 1 / 6) < 1e-6, `메시 부피 ${p.volume}`);
ok(FAST_BIG_MESH.linDefl === 0.08 && FAST_BIG_MESH.angDefl === 0.3, '92MB 실측 2분 이내 품질 설정');
ok(!shouldUseFastStep(FAST_STEP_MIN_BYTES - 1) && shouldUseFastStep(FAST_STEP_MIN_BYTES), '30MB 이상만 고속 STEP 경로');
done();
