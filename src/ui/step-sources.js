// STEP 원본 보관(2026-11-12) — 통합 프로젝트 파일(.uds)에 넣을 기구·LED STEP 을 불러올 때 한 번 gzip 해 두고(메모리 + IndexedDB),
// 새로고침 뒤에도 같은 도면을 저장할 수 있게. 키 = 'role:이름'. 최근 KEEP 개만 보관(용량)
import { gzipBlob, packBundle, isBundle, unpackBundle } from './project-bundle.js';
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
  const files = [], missing = [], lack = [];
  for (const [role, name] of want) { const f = have.get(`${role}:${name}`); if (f) files.push(f); else { missing.push(name); lack.push({ role, name }); } }
  return { files, missing, lack };
}
// 보관 한도(순수) — 오래된 것부터 버리되 지금 프로젝트가 쓰는 도면(pinned)은 한도를 넘어도 남김. keys = 오래된 순
export function dropKeys(keys, pinned, keep = KEEP) {
  const out = []; let n = keys.length;
  for (const k of keys) { if (n <= keep) break; if (!pinned.has(k)) { out.push(k); n--; } }
  return out;
}
let pins = () => new Set();
export const setStepSourcePins = (spec) => { pins = () => new Set(pickSources(spec()).files.map((f) => `${f.role}:${f.name}`)); };
// .uds 로 묶기(2026-11-13: STEP 도면은 반드시 함께) — 원본이 없으면 덮어쓸 .uds(prev) 안의 같은 도면을 되살리고,
// 그래도 없으면 fallback(화면 형상으로 STEP 만들기), 그것도 안 되면 저장하지 않음(오류.missingStep = 빠진 이름) — 도면 없는 .uds 로 덮어써 도면을 잃지 않게
export async function bundleProject(spec, text, prev = null, have = mem, keep = keepStepSource, fallback = null) {
  let P = pickSources(spec, have);
  if (P.lack.length && prev && await isBundle(prev).catch(() => false)) {
    try {
      const U = await unpackBundle(prev);
      for (const l of P.lack) { const f = U.files.find((x) => x.role === l.role && x.name === l.name); if (f) await keep(f.role, f.file, f.gz); }
      P = pickSources(spec, have);
    } catch { /* 깨진 파일 = 되살릴 것 없음 */ }
  }
  if (P.lack.length && fallback) { await fallback(P.lack); P = pickSources(spec, have); }   // 화면에 보이는 형상 → STEP(묻지 않음)
  if (P.lack.length) { const e = new Error(`STEP 도면 원본 없음: ${P.missing.join(', ')}`); e.missingStep = P.missing; e.lack = P.lack; throw e; }
  return packBundle(text, P.files);
}
export const sourcesKey = (spec) => pickSources(spec).files.map((f) => `${f.role}:${f.name}:${f.size}:${f.lastModified}`).join('|');

// 불러온 파일을 보관 — gz 가 있으면(통합 파일에서 엶) 다시 압축하지 않음
export async function keepStepSource(role, file, gz = null) {
  const old = mem.get(`${role}:${file.name}`);
  if (old && old.size === file.size && old.lastModified === (file.lastModified ?? 0)) return;   // 같은 파일(통합 파일에서 연 뒤 다시 읽는 경우 등)
  const v = { role, name: file.name, size: file.size, lastModified: file.lastModified ?? 0, gz: gz ?? await gzipBlob(file) }, key = `${role}:${file.name}`;
  mem.delete(key); mem.set(key, v);
  for (const k of dropKeys([...mem.keys()], pins())) mem.delete(k);   // 지금 쓰는 도면은 안 버림
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
