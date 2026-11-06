// 큰 STEP 나눠 읽기(2026-11-06): 작업자 K 개로 나눠도 한 번에 읽기와 같은 부품·순서·메시: node test/step-split.mjs
import initOpenCascade from 'opencascade.js/dist/node.js';
import { readFileSync } from 'node:fs';
import { readStepParts } from '../src/engine/shape/step-import.js';
import { splitPartsSequential, planSplit } from '../src/engine/shape/step-split.js';
import { ok, done } from './mech3d-util.mjs';

{ // 순서: 부피 내림차순, 같으면 루트·순번(한 번에 읽기의 안정 정렬과 같음)
  const { order } = planSplit([{ h: 1, x: 0, root: 2, j: 0, v: 5, diag: 1 }, { h: 0, x: 0, root: 1, j: 1, v: 5, diag: 1 }, { h: 0, x: 1, root: 1, j: 0, v: 5, diag: 1 }, { h: 1, x: 1, root: 4, j: 0, v: 9, diag: 1 }], { big: false });
  ok(order.map((o) => `${o.root}.${o.j}`).join() === '4.0,1.0,1.1,2.0', `순서 ${order.map((o) => `${o.root}.${o.j}`).join()}`);
}
const oc = await initOpenCascade();
const text = readFileSync(new URL('./fixtures/mech3d-led-sample.stp', import.meta.url), 'utf8');   // 루트 11개
const same = (a, b) => a.length === b.length && a.every((p, i) => p.triangles.length === b[i].triangles.length && p.positions.length === b[i].positions.length && p.faceCount === b[i].faceCount && Math.abs(p.volume - b[i].volume) < 1e-9 && p.positions.every((v, k) => v === b[i].positions[k]));
for (const profile of [{ preview: true, big: false }, { preview: true, big: true }]) {
  const ref = readStepParts(oc, text, { profile, onPreview: () => {} });
  for (const K of [2, 3]) {
    const r = splitPartsSequential(oc, text, K, profile);
    ok(same(r.parts, ref), `작업자 ${K}개 = 한 번에 읽기와 같은 부품 ${r.parts.length}개 (${profile.big ? '큰 파일' : '10~30 MB'})`);
    ok(r.rough.length === ref.length && r.rough.every((m, i) => m.faceCount === ref[i].faceCount), '거친 메시도 부품마다 하나');
  }
}
done();
