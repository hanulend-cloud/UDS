// 저장된 3D 설정 복원(브라우저 저장소가 비워져 메쉬만 사라진 경우) — 순수 판정 로직.
// pending = 메쉬 없이 남은 spec.mech3d, fresh = 다시 불러온 메쉬로 만든 initialMech3dSpec().
import { defaultPart } from './materials.js';

const TOL = 0.01;   // 부품 부피·크기 허용 오차(상대 1%)
const near = (a, b, abs = 0) => !(Number.isFinite(a) && Number.isFinite(b)) || Math.abs(a - b) <= Math.max(abs, TOL * Math.max(Math.abs(a), Math.abs(b)));

// meshParts: [{ volume?, size? }] — 부품 수가 같고, 양쪽에 있는 부피·크기가 1% 안이면 같은 기구
export function matchesPending(pending, meshParts) {
  const P = pending?.parts;
  if (!Array.isArray(P) || !Array.isArray(meshParts) || P.length !== meshParts.length || !P.length) return false;
  return P.every((p, i) => {
    const q = meshParts[i] ?? {};
    if (!near(p?.volume, q.volume)) return false;
    if (Array.isArray(p?.size) && Array.isArray(q.size)) return p.size.every((v, k) => near(v, q.size[k], 0.01));
    return true;
  });
}

// Import 로 합친 도면의 파일 목록. 칸이 없으면(파일 하나) 파일 하나로 봄
export const sourcesOf = (M) => (Array.isArray(M?.sources) && M.sources.length ? M.sources : [{ name: M?.name ?? '', parts: M?.parts?.length ?? 0 }]);
// 도면 추가 — added = [{ volume, size }]. 기존 부품은 건드리지 않고 뒤에 기본값으로
export function appendPartsSpec(M, added, fileName) {
  const src = sourcesOf(M);
  for (const q of added) { const i = M.parts.length; M.parts.push({ ...defaultPart(i, `부품 ${i + 1}`, q.volume), size: q.size }); }
  M.sources = [...src, { name: fileName, parts: added.length }];
}
// 여러 파일 복원 한 단계 — got = 지금까지 읽은 부품, info = 이번 파일 부품. { status: 'more', next, k, n } | { status: 'done' } | { status: 'mismatch' }
export function restoreStep(pending, got, info) {
  const src = sourcesOf(pending);
  let off = 0, k = 0;
  while (k < src.length && off < got.length) off += src[k++].parts;
  if (off !== got.length || k >= src.length || src[k].parts !== info.length) return { status: 'mismatch' };
  if (!matchesPending({ parts: pending.parts.slice(off, off + info.length) }, info)) return { status: 'mismatch' };
  return k + 1 < src.length ? { status: 'more', next: src[k + 1].name, k: k + 1, n: src.length } : { status: 'done' };
}

const ckey = (c) => `${c.a}|${c.faceA}|${c.b}|${c.faceB}`;
// 같은 기구면 저장 설정을 새 메쉬 기준 spec 에 덮어써 돌려준다(아니면 null).
// 부품: 저장된 소재·면처리·xform·shapeMod·이름 + 새 메쉬의 id·volume·size. 접촉면: 새로 찾은 목록에 같은 면 키의 mode.
// light(LED STEP 포함)·observe·checks 등 그 밖의 최상위 값은 저장된 것을 그대로.
export function restorePending(pending, fresh) {
  if (!fresh || !matchesPending(pending, fresh.parts)) return null;
  const out = structuredClone(pending);
  out.name = fresh.name ?? out.name;
  out.parts = fresh.parts.map((p, i) => ({ ...structuredClone(pending.parts[i]), id: p.id, volume: p.volume, ...(p.size ? { size: p.size } : {}) }));
  const mode = new Map((pending.contacts ?? []).map((c) => [ckey(c), c.mode]));
  out.contacts = (fresh.contacts ?? []).map((c) => ({ ...c, mode: mode.get(ckey(c)) ?? c.mode }));
  return out;
}
