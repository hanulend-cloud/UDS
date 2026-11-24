// 확산 모델 (Mie) 창 — 설정 메뉴 맨 아래(spec 2026-11-20 §4, 2단계 a). 보기 전용: 기본 비드 · Milky 대응표 · 각분포 · 신뢰 표시.
// HTML 조립 함수는 DOM 없이(node 테스트), openDiffusionModelDlg 만 DOM.
import { milkyMapRows, presetSummary, phaseCurve, transmitCurve, MAP_T } from '../../model/diffusion-model.js';
import { MIE_PRESETS } from '../../engine/l2/mie-preset.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BEAD = { PMMA: 'PMMA(가교 아크릴)', silicone: '실리콘' };
const COLS = ['#2f6fb3', '#d08a1e', '#3c9a5f', '#a3478f'];

export function presetHtml(s) {
  return `<div class="dm-preset"><b>${esc(s.host)} 모재</b> · 비드 ${esc(BEAD[s.bead] ?? s.bead)} 지름 ${s.d_um} µm(크기 편차 σ ${s.sigma}) · 굴절률 모재 ${s.nH} / 비드 ${s.nP} · 파장 ${s.lambda_um * 1000} nm · g ${s.g.toFixed(4)}</div>`;
}

export function mapTableHtml(rows) {
  const tr = rows.map((r) => `<tr><td>${r.milky}</td><td>${(r.shield * 100).toFixed(0)}%</td><td>${r.clear ? '투명 수지' : (r.wt * 100).toFixed(2)}</td><td>${r.musR.toFixed(4)}</td><td>${r.mus.toFixed(3)}</td><td>${r.clear ? '–' : r.g.toFixed(4)}</td><td>${r.mua.toFixed(4)}</td><td>${(r.T * 100).toFixed(1)}%</td><td>${r.hpa.toFixed(0)}°</td></tr>`).join('');
  return `<table class="dm-map"><tr><th>Milky</th><th>가림</th><th>비드 wt%</th><th>μs′ /mm</th><th>μs /mm</th><th>g</th><th>μa /mm</th><th>투과율 ${MAP_T} mm</th><th>HPA</th></tr>${tr}</table>`;
}

// 곡선 SVG — series [{ name, pts:[{deg, rel}] }], log 이면 y 로그(10⁻⁴~1)
export function curveSvg(series, { log = false, xMax = 90, W = 460, H = 220 } = {}) {
  const L = 44, B = 26, w = W - L - 8, h = H - B - 8, yMin = 1e-6;
  // 선형 축 위 끝 = 1 과 최댓값 중 큰 값(0.5 단위 올림) — 정면보다 비스듬한 쪽이 밝은 곡선도 잘리지 않게
  const yTop = log ? 1 : Math.ceil(Math.max(1, ...series.flatMap((s) => s.pts.map((p) => p.rel)).filter(Number.isFinite)) * 2) / 2;
  const X = (d) => L + (Math.min(d, xMax) / xMax) * w;
  const Y = (v) => 8 + (log ? (1 - (Math.log10(Math.max(v, yMin)) - Math.log10(yMin)) / -Math.log10(yMin)) : 1 - Math.max(0, Math.min(yTop, v)) / yTop) * h;
  const ticksY = log ? [1, 1e-2, 1e-4, 1e-6] : Array.from({ length: Math.round(yTop / (yTop > 1 ? 0.5 : 0.25)) + 1 }, (_, i) => +(i * (yTop > 1 ? 0.5 : 0.25)).toFixed(2));
  const grid = ticksY.map((v) => `<line x1="${L}" x2="${L + w}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--m3-line,#ddd)"/><text x="${L - 4}" y="${(Y(v) + 3).toFixed(1)}" font-size="10" text-anchor="end" fill="currentColor">${log ? `1e${Math.round(Math.log10(v))}` : v}</text>`).join('');
  const ticksX = [0, xMax / 4, xMax / 2, (3 * xMax) / 4, xMax].map((d) => `<text x="${X(d).toFixed(1)}" y="${H - 8}" font-size="10" text-anchor="middle" fill="currentColor">${d}°</text>`).join('');
  const lines = series.map((s, i) => `<polyline fill="none" stroke="${COLS[i % COLS.length]}" stroke-width="1.8" points="${s.pts.filter((p) => p.deg <= xMax).map((p) => `${X(p.deg).toFixed(1)},${Y(p.rel).toFixed(1)}`).join(' ')}"/>`).join('');
  const leg = series.map((s, i) => `<text x="${L + w - 4}" y="${20 + i * 14}" font-size="11" text-anchor="end" fill="${COLS[i % COLS.length]}">${esc(s.name)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">${grid}${ticksX}${lines}${leg}</svg>`;
}

const TAG = { assumed: 'dm-t-a', fit: 'dm-t-f', fitBad: 'dm-t-b', range: 'dm-t-r' };
export function trustHtml(partRows, dbRows) {
  const row = (r, first) => `<tr><td>${esc(first)}</td><td>${esc(r.material)}</td><td><span class="dm-tag ${TAG[r.code]}">${esc(r.label)}</span></td><td class="mut">${esc(r.why)}</td></tr>`;
  const parts = partRows.length ? partRows.map((r) => row(r, `${r.name} (Milky ${(+r.milky).toFixed(1)})`)).join('') : '<tr><td colspan="4" class="mut">이 프로젝트에 Milky 부품 없음</td></tr>';
  const db = dbRows.map((r) => row(r, 'DB')).join('');
  return `<table class="dm-trust"><tr><th>부품</th><th>소재</th><th>신뢰</th><th>근거</th></tr>${parts}${db}</table>
<div class="mut">가정 = 기본 비드로 계산 · 실측보정 = 측정값에 맞춤(T·R ±2%p, HPA ±2°) · 측정 범위 밖 = 부품 두께가 측정 두께의 0.5~2배 밖. 입사각 기준은 BSDF 입사각 측정(3단계) 후에 판정합니다.</div>`;
}

// ctx: { table, dbList: [ent], parts, thickOf(i), dbGet(id), trustRows, trustLabel }
const TABS = [['map', 'Milky 대응표'], ['ang', '각분포'], ['trust', '신뢰 표시']];
export function openDiffusionModelDlg(ctx) {
  document.querySelector('.m3-diffmodel')?.remove();
  if (!ctx.table?.mie) { alert('확산 응답표가 아직 준비되지 않았습니다'); return; }
  let tab = 'map', key = 'PC', milky = 5;
  const dlg = document.createElement('div');
  dlg.className = 'zoom-modal m3-fitdlg m3-diffmodel';
  dlg.innerHTML = `<div class="zoom-modal-inner" role="dialog" aria-modal="true" aria-label="확산 모델">
    <div class="zoom-modal-hd"><span>확산 모델 (Mie) <span class="mut">화면에는 Milky 만 보이고, 계산은 이 값으로 함</span></span><button data-dm-close>✕ 닫기</button></div>
    <div class="m3-tabs" role="tablist">${TABS.map(([k, t]) => `<button type="button" role="tab" data-dm-tab="${k}">${t}</button>`).join('')}</div>
    <div class="m3-fitdlg-body" data-dm-body></div></div>`;
  document.body.appendChild(dlg);
  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  const close = () => { dlg.remove(); document.removeEventListener('keydown', onKey); };
  document.addEventListener('keydown', onKey);
  dlg.querySelector('[data-dm-close]').onclick = close;
  const body = dlg.querySelector('[data-dm-body]');
  const resinSel = () => `<label>모재 <select data-dm-key>${Object.keys(MIE_PRESETS).map((k) => `<option value="${k}"${k === key ? ' selected' : ''}>${k}</option>`).join('')}</select></label>`;
  const draw = () => {
    dlg.querySelectorAll('[data-dm-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.dmTab === tab)));
    if (tab === 'map') body.innerHTML = `${resinSel()}${presetHtml(presetSummary(key))}${mapTableHtml(milkyRowsCached(ctx.table, key))}<div class="mut">Milky = 2 mm 판이 빛을 가리는 정도(10 = 50%). 비드 wt% 는 이 기본 비드 기준 추정값. Milky 0 은 같은 수지의 투명 소재로 계산.</div>`;
    else if (tab === 'ang') body.innerHTML = `${resinSel()} <label>Milky <input type="number" min="0.1" max="10" step="0.1" value="${milky}" data-dm-milky style="width:60px"></label>
      <h4>비드 1개의 산란 모양(위상함수, 정면 = 1, 로그)</h4>${curveSvg([{ name: `${key} 기본 비드`, pts: phaseCurve(key) }], { log: true, xMax: 180 })}
      <h4>${MAP_T} mm 판을 지난 빛의 각도별 밝기(정면 = 1)</h4>${curveSvg([1, milky, 10].filter((m, i, a) => a.indexOf(m) === i).map((m) => ({ name: `Milky ${m}`, pts: transmitCurve(ctx.table, key, m) })), { xMax: 90 })}
      <div class="mut">비드 하나는 앞쪽으로 아주 좁게 산란하지만(g ≈ 0.99), 판 안에서 여러 번 산란해 넓게 퍼짐.</div>`;
    else body.innerHTML = trustHtml(ctx.trustRows({ parts: ctx.parts, thickOf: ctx.thickOf, dbGet: ctx.dbGet }), ctx.dbList.filter((e) => e.samples?.length).map((e) => ({ material: e.name, ...ctx.trustLabel({ ent: e }) })));
    body.querySelector('[data-dm-key]')?.addEventListener('change', (ev) => { key = ev.target.value; draw(); });
    body.querySelector('[data-dm-milky]')?.addEventListener('change', (ev) => { const v = +ev.target.value; if (v >= 0.1 && v <= 10) { milky = v; draw(); } });
  };
  dlg.querySelectorAll('[data-dm-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.dmTab; draw(); }; });
  draw();
}
const _rows = new Map();
function milkyRowsCached(table, key) { if (!_rows.has(key)) _rows.set(key, milkyMapRows(table, key)); return _rows.get(key); }
