// STEP 원본 보관(2026-11-12) — 통합 프로젝트 파일(.uds)에 넣을 기구·LED STEP 을 불러올 때 한 번 gzip 해 두고(메모리 + IndexedDB),
// 새로고침 뒤에도 같은 도면을 저장할 수 있게. 키 = 'role:이름'. 최근 KEEP 개만 보관(용량)
import { gzipBlob } from './project-bundle.js';
import { sourcesOf } from '../engine/mech3d/restore.js';

const KEEP = 8, DB = 'uds-step-src', STORE = 's';
const mem = new Map();
let onChange = () => {};
export const onStepSourcesChange = (f) => { onChange = f; };

function db() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('저장소 없음')); return; }
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// 지금 프로젝트가 쓰는 도면(순수) — 기구 STEP(합친 순서) + 따로 불러온 LED STEP. { files, missing: [원본이 없는 이름] }
export function pickSources(spec, have = mem) {
  const M = spec?.mech3d ?? spec?.mech3dPending ?? null, want = [];
  if (M) {
    for (const s of sourcesOf(M)) if (s.name) want.push(['mech', s.name]);
    const st = M.light?.kind === 'step' ? M.light.step : null;
    if (st?.name && !st.fromMech) want.push(['led', st.name]);
  }
  const files = [], missing = [];
  for (const [role, name] of want) { const f = have.get(`${role}:${name}`); if (f) files.push(f); else missing.push(name); }
  return { files, missing };
}
export const sourcesKey = (spec) => pickSources(spec).files.map((f) => `${f.role}:${f.name}:${f.size}:${f.lastModified}`).join('|');

// 불러온 파일을 보관 — gz 가 있으면(통합 파일에서 엶) 다시 압축하지 않음
export async function keepStepSource(role, file, gz = null) {
  const old = mem.get(`${role}:${file.name}`);
  if (old && old.size === file.size && old.lastModified === (file.lastModified ?? 0)) return;   // 같은 파일(통합 파일에서 연 뒤 다시 읽는 경우 등)
  const v = { role, name: file.name, size: file.size, lastModified: file.lastModified ?? 0, gz: gz ?? await gzipBlob(file) }, key = `${role}:${file.name}`;
  mem.delete(key); mem.set(key, v);
  while (mem.size > KEEP) mem.delete(mem.keys().next().value);
  onChange();
  try {
    const d = await db(), st = d.transaction(STORE, 'readwrite').objectStore(STORE);
    await req(st.put(v, key));
    for (const k of await req(st.getAllKeys())) if (!mem.has(k)) st.delete(k);
    d.close();
  } catch { /* 저장소를 못 쓰면 이번 세션에서만 */ }
}
export async function loadStepSources() {
  try {
    const d = await db(), st = d.transaction(STORE).objectStore(STORE), keys = await req(st.getAllKeys()), vals = await req(st.getAll());
    d.close();
    keys.forEach((k, i) => { if (!mem.has(k)) mem.set(k, vals[i]); });
  } catch { /* 없음 */ }
}
