// 변환 결과 저장(2026-11-06) — 큰 STEP(2 MB 이상)을 한 번 불러오면 메시·접촉면을 브라우저(IndexedDB)에 두고, 같은 파일을 다시 열면 바로 씀.
// 같은 파일 = 이름·크기·수정 시각이 같음. 메시 규칙이 바뀌면 RULES 를 올려 옛 저장을 쓰지 않게. 최근 KEEP 개만 보관(용량)
const RULES = 'mesh-2026-11-06b',   // b = 충돌 검사 구조(BVH)·합친 메시까지 저장
  KEEP = 2, DB = 'uds-step-cache', STORE = 'c', INDEX = '__index';
export const stepCacheKey = (file) => `${RULES}|${file.name}|${file.size}|${file.lastModified ?? 0}`;
export const cacheWorthy = (file) => (file?.size ?? 0) >= 2e6;   // 2026-11-13: 10 MB → 2 MB(.uds 를 다시 열 때도 바로)

function open() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('저장소 없음')); return; }
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function stepCacheGet(key) {
  try { const db = await open(); const v = await req(db.transaction(STORE).objectStore(STORE).get(key)); db.close(); return v ?? null; }
  catch { return null; }   // 저장소를 못 쓰면 그냥 새로 읽음
}
// data = { prep: { parts(BVH 포함), combined, bvh, contacts }, relaxed, timing, info } — 다시 열 때 작업자 없이 바로 씀
export async function stepCachePut(key, data) {
  try {
    const db = await open(), st = db.transaction(STORE, 'readwrite').objectStore(STORE);
    // 순서 목록(작은 항목 '__index')만 보고 오래된 것을 지움 — 큰 저장본을 읽지 않게. 목록에 없는 키(옛 규칙 등)도 지움
    const idx = ((await req(st.get(INDEX))) ?? []).filter((k) => k !== key), keep = [key, ...idx].slice(0, KEEP);
    await req(st.put(data, key));
    await req(st.put(keep, INDEX));
    for (const k of await req(st.getAllKeys())) if (k !== INDEX && !keep.includes(k)) st.delete(k);
    db.close();
    return true;
  } catch { return false; }
}
