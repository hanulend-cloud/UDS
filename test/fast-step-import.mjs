import { fastMeshPart, FAST_BIG_MESH, FAST_STEP_MIN_BYTES, shouldUseFastStep, fastQuality, FAST_HEAVY, FAST_HEAVY_FACES, mergeFastPieces, fastWorkers } from '../src/engine/shape/fast-step-import.js';
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
// 2026-11-13 — 108 MB 타공 그릴 도면이 15분: 부품 단위 조각을 작업자 여럿이 동시에 읽고(한 조각 ≈ 해석 34초), 면이 수천 개인 부품은 각도 간격만 넓힘(메시 82초 → 20초)
ok(fastQuality(FAST_HEAVY_FACES - 1) === FAST_BIG_MESH && fastQuality(FAST_HEAVY_FACES) === FAST_HEAVY, '면이 아주 많은 부품만 각도 간격 완화');
ok(FAST_HEAVY.linDefl === FAST_BIG_MESH.linDefl && FAST_HEAVY.angDefl > FAST_BIG_MESH.angDefl, '완화해도 현 오차(mm)는 그대로');
{
  const P = (volume, c, tag) => ({ volume, c, tag, positions: new Float32Array(0), triangles: new Uint32Array(0), faceIds: new Uint32Array(0), faceCount: 0 });
  // 원본 순서(루트 번호): 10 큰 판, 20 LED a, 30 LED b, 40 LED c, 50 확산판 — 조각 0 = [10, 30, 50], 조각 1 = [20, 40]
  const lists = [[P(500, [0, 0, 0], 'A'), P(16, [5, 0, 0], 'b'), P(300, [0, 0, 9], 'D')], [P(16, [9, 0, 0], 'a'), P(16, [1, 0, 0], 'c')]];
  const m = mergeFastPieces(lists, [[10, 30, 50], [20, 40]]);
  ok(m.map((p) => p.tag).join('') === 'ADabc', `부피 내림차순 · 같은 부피는 원본 파일 순서 (${m.map((p) => p.tag).join('')})`);
  ok(m.every((p) => !('c' in p)), '합친 뒤 임시 값(무게중심)은 뺌');
  const f = mergeFastPieces(lists, [[10, 30], [20, 40]]);   // 조각 0 의 솔리드 수 ≠ 단위 수 → 원본 순서를 알 수 없음 → 위치 순서
  ok(f.map((p) => p.tag).join('') === 'ADcba', `순서를 알 수 없으면 같은 부피는 위치(x·y·z) 순서 (${f.map((p) => p.tag).join('')})`);
}
ok(fastWorkers({ hardwareConcurrency: 16, deviceMemory: 8 }) === 8 && fastWorkers({ hardwareConcurrency: 8, deviceMemory: 8 }) === 6 && fastWorkers({ hardwareConcurrency: 16, deviceMemory: 4 }) === 3 && fastWorkers({ hardwareConcurrency: 2 }) === 1, '작업자 수 = 코어−2(최대 8) · 메모리 작으면 3');
{
  const { cutStepUnits, cutStep } = await import('../src/engine/shape/step-cut.js');
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(new URL('./fixtures/mech3d-led-sample.stp', import.meta.url), 'utf8');
  const r = cutStepUnits(text, 3), old = cutStep(text, 3);
  ok(r && r.texts.length === r.units.length && r.texts.join() === old.join(), '조각 글자는 cutStep 과 같고 조각마다 단위(제품 정의 번호) 목록이 붙음');
  const all = r.units.flat();
  ok(new Set(all).size === all.length && r.units.every((u) => u.length && u.every((x, i) => i === 0 || u[i - 1] < x)), `단위 번호는 조각 안에서 오름차순 · 겹치지 않음 (${r.units.map((u) => u.length).join('+')})`);
}
done();
