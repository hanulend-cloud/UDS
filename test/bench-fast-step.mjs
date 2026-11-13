// 대용량 STEP 고속 경로 단계별 시간(진단용): node test/bench-fast-step.mjs [파일.stp]
import { readFileSync } from 'node:fs';
import { OcctKernel } from 'occt-wasm';
import { FAST_BIG_MESH, fastMeshPart } from '../src/engine/shape/fast-step-import.js';
const file = process.argv[2] ?? 'examples/monitor-ring-72led/monitor-ring-72led.stp';
const T = () => performance.now(); let t = T();
const lap = (m) => { const n = T(); console.log(`${((n - t) / 1e3).toFixed(1)}s ${m}`); t = n; };
const text = readFileSync(file, 'utf8'); lap(`읽기 ${(text.length / 1e6).toFixed(1)} MB`);
const kernel = await OcctKernel.init(); lap('엔진 준비');
const root = kernel.importStep(text); lap('importStep');
const solids = kernel.getSubShapes(root, 'solid'); lap(`솔리드 ${solids.length}`);
const times = []; let nT = 0;
for (let i = 0; i < solids.length; i++) {
  const t1 = T(); const p = fastMeshPart(kernel.meshShape(solids[i], { linearDeflection: FAST_BIG_MESH.linDefl, angularDeflection: FAST_BIG_MESH.angDefl }));
  const t2 = T(); kernel.getVolume(solids[i]); const t3 = T();
  times.push({ i, mesh: t2 - t1, vol: t3 - t2, tri: p.triangles.length / 3, faces: p.faceCount }); nT += p.triangles.length / 3;
}
lap(`메시 전체 · 삼각형 ${nT}`);
times.sort((a, b) => b.mesh + b.vol - a.mesh - a.vol);
for (const x of times.slice(0, 12)) console.log(`  부품 ${x.i}: 메시 ${(x.mesh / 1e3).toFixed(1)}s · 부피 ${(x.vol / 1e3).toFixed(1)}s · 삼각형 ${x.tri} · 면 ${x.faces}`);
console.log(`  메시 합 ${(times.reduce((s, x) => s + x.mesh, 0) / 1e3).toFixed(1)}s · 부피 합 ${(times.reduce((s, x) => s + x.vol, 0) / 1e3).toFixed(1)}s`);
