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
{   // 맞붙은 면 표시(coinFlags)도 바뀐 삼각형 근처만 다시 계산(2026-11-15, 173만 삼각형 = 장면마다 Worker 당 5초) — 결과는 처음부터 계산한 것과 같아야 함
  const { coinFlags } = await import('../src/engine/mech3d/mc3d.js');
  const sc = (m) => { const { positions: P, triangles: T, partOf } = m.combined, nT = T.length / 3, N = new Float32Array(nT * 3);
    for (let t = 0; t < nT; t++) { const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3, u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1; N.set(n.map((x) => x / l), t * 3); }
    return { P, T, normals: N, partOf, bvh: m.bvh }; };
  const C = boxMesh(4, 4, 1, 2, 2, 1), far = boxMesh(30, 30, 30, 1, 1, 1);   // C = 판 A 위에 맞붙음
  const m0 = buildTraceMesh('j', [A, C, far]), S0 = sc(m0), f0 = coinFlags(S0);
  ok(f0.some((v) => v) && !f0.slice(-12).some((v) => v), '맞붙은 면만 표시(먼 상자는 없음)');
  // 표시는 사전 거름(나무 모양에 따라 더 넓게 잡힐 수 있음) — 꼭 지켜야 할 것: 실제로 맞붙을 수 있는 삼각형(상자 ±0.05 안에 반대 법선의 다른 부품)은 모두 표시
  const must = (S) => { const { P, T, normals: N, partOf } = S, nT = partOf.length, bb = (t) => { const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) { const v = P[T[t * 3 + k] * 3 + c]; b[c] = Math.min(b[c], v); b[c + 3] = Math.max(b[c + 3], v); } return b; };
    const B = Array.from({ length: nT }, (_, t) => bb(t)), out = new Uint8Array(nT);
    for (let t = 0; t < nT; t++) for (let c = 0; c < nT; c++) { if (partOf[c] === partOf[t]) continue; const x = B[t], y = B[c];
      if ([0, 1, 2].every((k) => x[k] - 0.05 <= y[k + 3] && x[k + 3] + 0.05 >= y[k]) && N[t * 3] * N[c * 3] + N[t * 3 + 1] * N[c * 3 + 1] + N[t * 3 + 2] * N[c * 3 + 2] <= -0.97) { out[t] = 1; break; } }
    return out; };
  for (const [name, parts] of [['떼어 냄', [A, mv(C, 3), far]], ['먼 상자를 붙임', [A, C, { ...far, positions: Float32Array.from(boxMesh(1, 1, 1, 1, 1, 1).positions) }]], ['그대로', [A, C, far]]]) {
    const S1 = sc(buildTraceMesh('j', parts, m0)), inc = coinFlags(S1, S0), need = must(S1), full = coinFlags(sc(buildTraceMesh('j', parts, m0)));
    ok(need.every((v, t) => !v || inc[t]), `${name}: 맞붙을 수 있는 삼각형은 모두 표시 (필요 ${need.reduce((a, b) => a + b, 0)} · 표시 ${inc.reduce((a, b) => a + b, 0)})`);
    ok(inc.reduce((a, b) => a + b, 0) <= full.reduce((a, b) => a + b, 0) + 16, `${name}: 표시가 쓸데없이 늘지 않음 (처음부터 ${full.reduce((a, b) => a + b, 0)})`);
  }
  const S2 = sc(buildTraceMesh('j', [A, mv(C, 3), far], m0)); S2.P = S0.P;   // 위치 배열이 같은 장면(바뀐 것 없음) → 앞 표시를 그대로
  ok(coinFlags(S2, S0).every((v, t) => v === f0[t]), '바뀐 삼각형이 없으면 앞 표시 그대로');
}
done();
