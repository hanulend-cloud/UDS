// 예제 .uds 만들기(2026-11-12) — 예제 폴더의 project.json(설정) + 기구·LED STEP 을 통합 프로젝트 파일 <폴더>/<폴더>.uds 로.
// 예제 메뉴(examples/index.json)는 이 .uds 를 엶 — 프로젝트 열기로 직접 열어도 같음. 직접 실행: node examples/make-uds.mjs [폴더]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { DEFAULT_SPEC } from '../src/model/defaults.js';
import { gzipBlob, packBundle } from '../src/ui/project-bundle.js';

const root = new URL('./', import.meta.url);
const only = process.argv[2];   // 폴더 하나만: node examples/make-uds.mjs monitor-ring-72led
for (const id of readdirSync(root).filter((d) => statSync(new URL(d, root)).isDirectory() && (!only || d === only))) {
  const dir = new URL(`${id}/`, root), P = JSON.parse(readFileSync(new URL('project.json', dir), 'utf8'));
  // 설정은 보관분(mech3dPending)으로 — 열면 같은 기구 STEP 을 읽어 복원. 설정 없는 예제(기구만) = 새 기구로 열고 LED 자동 인식
  const spec = { ...structuredClone(DEFAULT_SPEC), mode: 'mech3d', mech3d: null, mech3dPending: P.mech3d ?? null };
  const files = [];
  for (const [role, path] of [['mech', P.mech], ['led', P.led]]) {
    if (!path) continue;
    const buf = readFileSync(new URL(`../${path}`, root)), name = path.split('/').pop();
    files.push({ role, name, size: buf.length, lastModified: 0, gz: await gzipBlob(new Blob([buf])) });
  }
  const B = await packBundle(JSON.stringify(spec, null, 1), files);
  writeFileSync(new URL(`${id}.uds`, dir), Buffer.from(await B.arrayBuffer()));
  console.log(`examples/${id}/${id}.uds  ${(B.size / 1024).toFixed(0)} KB  (${files.map((f) => f.name).join(' + ')})`);
}
