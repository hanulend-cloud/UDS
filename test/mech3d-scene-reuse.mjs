// LED 만 움직인 장면은 BVH 를 다시 만들지 않고 고쳐 씀(2026-11-14, 높이 후보마다 173만 삼각형 재구축 → 'scene 60초' 멈춤): node test/mech3d-scene-reuse.mjs
import { buildTraceMesh } from '../src/engine/mech3d/runtime.js';
import { intersectRay } from '../src/engine/mech3d/bvh.js';
import { boxMesh, ok, done } from './mech3d-util.mjs';
const mv = (m, dz) => { const p = Float32Array.from(m.positions); for (let i = 2; i < p.length; i += 3) p[i] += dz; return { ...m, positions: p }; };
const A = boxMesh(0, 0, 0, 10, 10, 1), B = boxMesh(4, 4, 5, 2, 2, 1);
const s0 = buildTraceMesh('j', [A, B]);
const s1 = buildTraceMesh('j', [A, mv(B, 2)], s0);
ok(s1.bvh.meta === s0.bvh.meta, '같은 위상(LED 만 이동) → BVH 구조 다시 씀');
const h = intersectRay(s1.bvh, 5, 5, 20, 0, 0, -1);
ok(h && Math.abs(h.t - 12) < 1e-4, `옮긴 부품에 맞음 (t=${h?.t})`);
const s2 = buildTraceMesh('j', [A, B, boxMesh(20, 0, 0, 1, 1, 1)], s1);
ok(s2.bvh.meta !== s1.bvh.meta, '부품 수가 다르면 새로 만듦');
done();
