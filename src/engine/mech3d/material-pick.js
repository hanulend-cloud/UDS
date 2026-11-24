// 부품 소재 고르기(순수) — 기구 설계자는 소재 이름 하나만 고르고, 물성은 소재 DB(관리자가 측정값으로 넣은 값)에서 온다.
// 선택 id: 'milky'(일반 Milky) · 'milky:<실측 DB id>' · 'clear:<수지 id | 사용자 측정 id>' · 'wt'(반투과 백색) · 'opaque'(소재 미지정) · 'opaque:<반사 소재 id>'
import { CLEAR_BASE, materialN, clearT } from './materials.js';

const pc = (v) => `${Math.round(v * 1000) / 10}%`;
// 고르기 목록(종류별 묶음). src = { milky: 실측 DB 목록, clear: 사용자 투명 측정 목록, refl: 반사 소재표(catalogOf) }
// 기본(2026-11-24 사용자) = 대표 소재 6개(짧은 이름) + '기타 소재…'. all = 전체(실측·반투과·금속 등 확장 목록). keep = 지금 부품 소재 — 기본 목록에 없어도 보임
export const MORE_ID = '__more';
const MAIN = [
  { label: '확산', items: [['milky', 'Milky']] },
  { label: '투명', items: [['clear:PC', 'PC'], ['clear:PMMA', 'PMMA']] },
  { label: '불투명', items: [['opaque:abs-white', 'White'], ['opaque:abs-gray', 'Gray'], ['opaque:abs-black', 'Black']] },
];
function allGroups({ milky = [], clear = [], refl = [] } = {}) {
  return [
    { label: '확산 (Milky) — 확산 정도는 아래 칸', items: [{ id: 'milky', name: '일반 Milky (추상)' }, ...milky.map((e) => ({ id: `milky:${e.id}`, name: e.name }))] },
    { label: '투명', items: [...CLEAR_BASE.map((e) => ({ id: `clear:${e.id}`, name: e.name })), ...clear.map((e) => ({ id: `clear:${e.id}`, name: `${e.name} (측정)` }))] },
    { label: '반투과', items: [{ id: 'wt', name: '반투과 백색' }] },
    { label: '불투명 (반사)', items: [...refl.filter((e) => !e.special).map((e) => ({ id: `opaque:${e.id}`, name: e.name })), { id: 'opaque', name: '불투명 (소재 미지정)' }] },
  ];
}
export function materialGroups(src = {}, { all = false, keep = '' } = {}) {
  const full = allGroups(src);
  if (all) return full;
  const known = new Set(full.flatMap((g) => g.items.map((it) => it.id)));
  const G = MAIN.map((g) => ({ label: g.label, items: g.items.filter(([id]) => known.has(id)).map(([id, name]) => ({ id, name })) }));
  if (keep && known.has(keep) && !G.some((g) => g.items.some((it) => it.id === keep))) {
    const it = full.flatMap((g) => g.items).find((x) => x.id === keep);
    if (keep === 'wt') G.splice(2, 0, { label: '반투과', items: [it] });
    else G[keep.startsWith('milky') ? 0 : keep.startsWith('clear:') ? 1 : 2].items.push(it);
  }
  return [...G.filter((g) => g.items.length), { label: '기타', items: [{ id: MORE_ID, name: '기타 소재…' }] }];
}
// 지금 부품의 선택 id
export function pickOf(part) {
  const m = part.material ?? {};
  switch (m.kind) {
    case 'milky': return m.dbId ? `milky:${m.dbId}` : 'milky';
    case 'clear': return `clear:${m.matId ?? m.resin ?? 'PC'}`;
    case 'whiteTrans': return 'wt';
    case 'opaque': return part.reflMaterial ? `opaque:${part.reflMaterial}` : 'opaque';
    default: return '';
  }
}
// 고른 소재의 핵심 물성 한 줄(읽기 전용) — 설계자가 무엇이 들어갔는지만 확인
export function materialSummary(part, { milky = [], refl = [], thick = null } = {}) {
  const m = part.material ?? {};
  switch (m.kind) {
    case 'milky': { const e = m.dbId ? milky.find((x) => x.id === m.dbId) : null; return e ? `실측 소재 · 굴절률 ${e.n} · 산란 각분포 = 측정 BSDF 피팅` : `굴절률 ${materialN(m)} (${m.resin ?? 'PC'}) · 확산 모델`; }
    case 'clear': return `굴절률 ${materialN(m)} · 투과율 ${pc(m.T)} (${m.tRef} mm)${thick > 0 ? ` · 이 부품 ${+thick.toFixed(1)} mm → ${pc(clearT(m, thick))}` : ''}${Number.isFinite(m.n) ? ' · 측정값' : ''}`;
    case 'whiteTrans': return `투과율 ${pc(m.T)} (${m.tRef} mm) · 굴절률 ${materialN(m)}`;
    case 'opaque': {
      const e = part.reflMaterial ? refl.find((x) => x.id === part.reflMaterial) : null, f = part.finish;
      if (part.reflMaterial && !e) return '없는 소재 — 다시 고르세요';
      return `${e ? (e.kind === 'metal' ? '경면 반사' : '확산 반사') : '면 처리'}${f?.R != null ? ` ${pc(f.R)}` : ''}${e ? ` (최대 ${pc(e.max)})` : ''}`;
    }
    default: return '';
  }
}
