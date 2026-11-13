// 변환 결과 저장(2026-11-06) — 큰 STEP(2 MB 이상)을 한 번 불러오면 메시·접촉면을 브라우저(IndexedDB)에 두고, 같은 파일을 다시 열면 바로 씀.
// 같은 파일 = 이름·크기·수정 시각이 같음. 메시 규칙이 바뀌면 RULES 를 올려 옛 저장을 쓰지 않게. 최근 KEEP 개만 보관(용량)
const RULES = 'mesh-2026-11-13',   // 2026-11-13 = 면이 아주 많은 부품의 각도 간격 완화(fast-step-import FAST_HEAVY) — 옛 저장은 다시 읽음
  KEEP = 2, DB = 'uds-step-cache', STORE = 'c', INDEX = '__index';
export const stepCacheKey = (file) => `${RULES}|${file.name}|${file.size}|${file.lastModified ?? 0}`;
export const cacheWorthy = (file) => (file?.size ?? 0) >= 2e6;   // 2026-11-13: 10 MB → 2 MB(.uds 를 다시 열 때도 바로)

// 큰 배열 조각 저장(2026-11-13) — IndexedDB 한 값은 ≈133 MB 까지(Chromium). 432만 삼각형 도면의 변환 결과가 이를 넘어 말없이 저장 안 되던 것.
// splitBig: min 바이트 넘는 배열을 chunk 바이트 조각으로 빼고 그 자리에 { __big: [조각 번호], t: 형식, n: 길이 } → { head, chunks }. joinBig = 되돌림
const TYPES = { Float32Array, Float64Array, Uint32Array, Int32Array, Uint16Array, Int16Array, Uint8Array, Int8Array };
export function splitBig(data, { min = 1 << 20, chunk = 64 << 20 } = {}) {
  const chunks = [];
  const walk = (v) => {
    if (ArrayBuffer.isView(v) && !(v instanceof DataView) && v.byteLength > min && TYPES[v.constructor.name]) {
      const ids = [], u8 = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      for (let o = 0; o < u8.length; o += chunk) { ids.push(chunks.length); chunks.push(u8.slice(o, o + chunk).buffer); }
      return { __big: ids, t: v.constructor.name, n: v.length };
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object' && !ArrayBuffer.isView(v) && !(v instanceof ArrayBuffer)) { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o; }
    return v;
  };
  return { head: walk(data), chunks };
}
export function joinBig(head, chunks) {
  const walk = (v) => {
    if (v && typeof v === 'object' && Array.isArray(v.__big) && v.t in TYPES) {
      const parts = v.__big.map((i) => new Uint8Array(chunks[i])), all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
      let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
      return new TYPES[v.t](all.buffer, 0, v.n);
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object' && !ArrayBuffer.isView(v) && !(v instanceof ArrayBuffer)) { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o; }
    return v;
  };
  return walk(head);
}

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
  try {
    const db = await open(), st = db.transaction(STORE).objectStore(STORE), v = await req(st.get(key));
    if (!v?.__head) { db.close(); return v ?? null; }   // 옛 저장(한 값)
    const chunks = []; for (let i = 0; i < v.n; i++) chunks.push(await req(st.get(`${key}#${i}`)));
    db.close();
    return chunks.every(Boolean) ? joinBig(v.__head, chunks) : null;   // 조각이 빠졌으면 새로 읽음
  }
  catch { return null; }   // 저장소를 못 쓰면 그냥 새로 읽음
}
// data = { prep: { parts(BVH 포함), combined, bvh, contacts }, relaxed, timing, info } — 다시 열 때 작업자 없이 바로 씀
export async function stepCachePut(key, data) {
  try {
    const db = await open(), st = db.transaction(STORE, 'readwrite').objectStore(STORE);
    // 순서 목록(작은 항목 '__index')만 보고 오래된 것을 지움 — 큰 저장본을 읽지 않게. 목록에 없는 키(옛 규칙 등)도 지움
    const idx = ((await req(st.get(INDEX))) ?? []).filter((k) => k !== key), keep = [key, ...idx].slice(0, KEEP);
    const { head, chunks } = splitBig(data);
    for (const k of await req(st.getAllKeys())) if (k !== INDEX && String(k).split('#')[0] === key) st.delete(k);   // 같은 키 옛 조각
    for (let i = 0; i < chunks.length; i++) await req(st.put(chunks[i], `${key}#${i}`));
    await req(st.put({ __head: head, n: chunks.length }, key));
    await req(st.put(keep, INDEX));
    for (const k of await req(st.getAllKeys())) if (k !== INDEX && !keep.includes(String(k).split('#')[0])) st.delete(k);   // 조각(키#번호)도 함께
    db.close();
    return true;
  } catch { return false; }
}
