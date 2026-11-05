// 형상 후보 표(2026-11-05) — 마지막 형상 최적화의 후보를 전부 남겨 나중에 고를 수 있게(순수 함수, mspec.shapeCases 로 저장).
// 후보 값은 적은 광선 계산이라 대략값(≈). 고른 뒤 정식 계산한 값은 row.exact.
const pct = (v) => `${Math.floor(v * 100 + 1e-9)}%`;   // 판정과 같이 내림

const num = (v) => Math.round((v ?? 0) * 1e4) / 1e4;
export const caseKey = (c) => ['dt', 'h', 'R', 'e', 'c'].map((k) => num(c?.[k])).join('|');
export const caseCand = ({ dt = 0, h = 0, R = 1, e = 0, c = 0 }) => ({ dt, h, R, e, c });   // 저장·계산에 쓰는 숫자만

// 같은 후보는 광선이 많은 계산의 값으로(정식 값은 유지), 새 후보는 뒤에
export function mergeCaseRows(prev, list) {
  const m = new Map((prev ?? []).map((r) => [caseKey(r.c), r]));
  for (const r of list) {
    const k = caseKey(r.c), o = m.get(k);
    if (!o) m.set(k, r);
    else if ((r.N ?? 0) >= (o.N ?? 0)) m.set(k, { ...o, ...r, ...(o.exact && !r.exact ? { exact: o.exact } : {}) });
  }
  return [...m.values()];
}

const valOf = (r, key) => (key === 'Ulen' || key === 'Uwid' ? r.exact?.[key] ?? r[key] : r.c[key] ?? 0);
// 탈락 후보는 항상 맨 아래. 값이 같으면 낮은 쪽 균일도가 높은 후보를 먼저
export function sortCaseRows(rows, { key = 'dt', dir = 1 } = {}) {
  const lowU = (r) => Math.min(valOf(r, 'Ulen') ?? 0, valOf(r, 'Uwid') ?? 1);
  return [...rows].sort((a, b) => (a.ok === false) - (b.ok === false) || dir * ((valOf(a, key) ?? -1) - (valOf(b, key) ?? -1)) || lowU(b) - lowU(a));
}

// 조건 지문 — 후보 값을 바꾸는 설정만. 대상 부품 형상·이름·보기·목표·화질은 제외(후보를 적용해도 표가 유효하도록)
export function caseFp(M, part) {
  const parts = (M.parts ?? []).map((p, i) => ({ m: p.material, f: p.finish, co: p.coating, ro: p.role, u: p.untrace, x: p.xform, s: i === part ? undefined : p.shapeMod }));
  const { quality, ...obs } = M.observe ?? {};
  for (const k of Object.keys(obs)) if (k.startsWith('target')) delete obs[k];
  const txt = JSON.stringify({ parts, light: M.light, obs });
  let h = 5381; for (let i = 0; i < txt.length; i++) h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0;
  return `${txt.length}:${h.toString(36)}`;
}

const mm = (v) => (Math.abs(v ?? 0) < 5e-5 ? '–' : (+v).toFixed(2));
const COLS = [['dt', '두께 증가'], ['h', '렌즈 깊이'], ['R', 'R'], ['Ulen', '길이'], ['Uwid', '폭']];
function statusOf(r, tg) {
  if (r.ok === false) return `<span class="sc-bad">탈락 · ${r.why ?? '제약'}</span>`;
  const L = r.exact?.Ulen ?? r.Ulen, W = r.exact?.Uwid ?? r.Uwid, hit = L >= tg?.len && (W == null || W >= tg?.wid);
  return `${r.rec ? '<b class="sc-rec">추천</b> ' : ''}${hit ? '<span class="sc-ok">달성</span>' : '<span class="mut">미달</span>'}`;
}
const uCell = (r, k) => (r.ok === false ? '–' : r.exact?.[k] != null ? `<b>${pct(r.exact[k])}</b>` : r[k] != null ? `≈ ${pct(r[k])}` : '–');

// v = { cases, fp(지금 조건), sort, sel(고른 후보 키), tg:{len,wid}, name(부품 이름), busy(계산 중) }
export function shapeCasesHtml({ cases, fp, sort = { key: 'dt', dir: 1 }, sel = null, tg = {}, name = '', busy = false }) {
  if (!cases?.rows?.length) return '';
  const head = COLS.map(([k, t]) => `<th><button type="button" data-ad="caseSort" data-v="${k}" title="이 값으로 정렬">${t}${sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('');
  const rows = sortCaseRows(cases.rows, sort).map((r) => {
    const k = caseKey(r.c), on = k === sel, can = r.ok !== false && !busy;
    return `<tr class="${on ? 'sel' : ''}${r.ok === false ? ' off' : ''}"${can ? ` data-ad="casePick" data-v="${k}" tabindex="0" title="3D 에서 이 형상 보기"` : ''}><td>${mm(r.c.dt)}</td><td>${mm(r.c.h)}</td><td>${r.c.h ? (+r.c.R).toFixed(1) : '–'}</td><td>${uCell(r, 'Ulen')}</td><td>${uCell(r, 'Uwid')}</td><td>${statusOf(r, tg)}</td></tr>`;
  }).join('');
  const stale = cases.fp !== fp ? '<div class="m3-rlim">조건 변경됨 — 다시 계산 필요. 아래 값은 그때 조건의 값입니다.</div>' : '';
  const mixed = cases.mixed ? '<div class="sc-note mut">다른 항목과 함께 돌린 실행 — 값은 참고용입니다.</div>' : '';
  const act = sel && !busy && cases.rows.some((r) => caseKey(r.c) === sel && r.ok !== false)
    ? '<div class="m3-rbtn"><button type="button" data-ad="caseRun">이 후보로 계산 ▸</button><button type="button" data-ad="casePick" data-v="">미리보기 끄기</button></div>' : '';
  return `<details class="sc-box" open><summary>형상 후보 ${cases.rows.length}개${name ? ` — ${name}` : ''}</summary>${stale}${mixed}
    <div class="sc-note mut">≈ 대략값(적은 광선) · <b>굵게</b> 정식 계산값. 행을 누르면 3D 로 보고, 계산 뒤 적용할 수 있습니다. 단위 mm</div>
    <div class="sc-wrap"><table class="m3-cmp sc-tb"><thead><tr>${head}<th>상태</th></tr></thead><tbody>${rows}</tbody></table></div>${act}</details>`;
}
