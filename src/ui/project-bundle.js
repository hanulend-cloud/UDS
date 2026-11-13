// 프로젝트 통합 파일(.uds, 2026-11-12) — 프로젝트 JSON 과 STEP 원본(기구·LED)을 한 파일로 저장해, 열 때 STEP 을 다시 고르지 않게.
// 구조: 표식 'UDS1' · 머리 길이(4바이트 LE) · 머리 = gzip(JSON { v, project, files:[{ role, name, size, lastModified, gz }] }) · 도면 gzip 본을 차례로.
// STEP 은 불러올 때 한 번만 압축해 두고(gz) 저장할 때는 이어 붙이기만 함 — 자동 저장(1초 디바운스)이 큰 도면을 매번 다시 압축하지 않게
const MAGIC = 'UDS1';
const enc = new TextEncoder(), dec = new TextDecoder();
const pipe = async (blob, T) => new Response(blob.stream().pipeThrough(T)).blob();
export const gzipBlob = (blob) => pipe(blob, new CompressionStream('gzip'));
const gunzip = (blob) => pipe(blob, new DecompressionStream('gzip'));

// files = [{ role: 'mech'|'led', name, size, lastModified, gz: Blob }] — 반환 Blob
export async function packBundle(text, files = []) {
  const head = { v: 1, project: text, files: files.map((f) => ({ role: f.role, name: f.name, size: f.size ?? 0, lastModified: f.lastModified ?? 0, gz: f.gz.size })) };
  const hz = new Uint8Array(await (await gzipBlob(new Blob([enc.encode(JSON.stringify(head))]))).arrayBuffer());
  const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, hz.length, true);
  return new Blob([enc.encode(MAGIC), len, hz, ...files.map((f) => f.gz)], { type: 'application/octet-stream' });
}
export async function isBundle(blob) { return blob.size >= 8 && dec.decode(await blob.slice(0, 4).arrayBuffer()) === MAGIC; }

// → { text, files: [{ role, name, size, lastModified, gz, file: File(원본) }] }
export async function unpackBundle(blob) {
  if (!(await isBundle(blob))) throw new Error('UDS 통합 파일이 아님');
  const n = new DataView(await blob.slice(4, 8).arrayBuffer()).getUint32(0, true);
  if (8 + n > blob.size) throw new Error('파일이 잘렸음');
  const head = JSON.parse(await (await gunzip(blob.slice(8, 8 + n))).text());
  let at = 8 + n; const files = [];
  for (const f of head.files ?? []) {
    if (at + f.gz > blob.size) throw new Error(`파일이 잘렸음(${f.name})`);
    const gz = blob.slice(at, at + f.gz); at += f.gz;
    files.push({ role: f.role, name: f.name, size: f.size, lastModified: f.lastModified, gz, file: new File([await gunzip(gz)], f.name, { lastModified: f.lastModified ?? Date.now() }) });
  }
  return { text: head.project, files };
}
