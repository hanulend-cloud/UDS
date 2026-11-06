// 변환 결과 저장(2026-11-06) — 큰 STEP(10 MB 이상)을 한 번 불러오면 메시·접촉면을 브라우저(IndexedDB)에 두고, 같은 파일을 다시 열면 바로 씀.
// 같은 파일 = 이름·크기·수정 시각이 같음. 메시 규칙이 바뀌면 RULES 를 올려 옛 저장을 쓰지 않게. 최근 KEEP 개만 보관(용량)
const RULES = 'mesh-2026-11-06', KEEP = 2, DB = 'uds-step-cache', STORE = 'c';
export const stepCacheKey = (file) => `${RULES}|${file.name}|${file.size}|${file.lastModified ?? 0}`;
export const cacheWorthy = (file) => (file?.size ?? 0) >= 10e6;

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
  try { const db = await open(); const v = await req(db.transaction(STORE).objectStore(STORE).get(key)); db.close(); return v?.data ?? null; }
  catch { return null; }   // 저장소를 못 쓰면 그냥 새로 읽음
}
// data = { parts: [{ positions, triangles, faceIds, faceCount, volume }], contacts, relaxed, timing }
export async function stepCachePut(key, data) {
  try {
    const db = await open(), st = db.transaction(STORE, 'readwrite').objectStore(STORE);
    await req(st.put({ t: Date.now(), data }, key));
    const keys = await req(st.getAllKeys()), ts = await Promise.all(keys.map(async (k) => [k, (await req(st.get(k)))?.t ?? 0]));
    ts.sort((a, b) => b[1] - a[1]);
    for (const [k] of ts.slice(KEEP)) st.delete(k);
    db.close();
    return true;
  } catch { return false; }
}
