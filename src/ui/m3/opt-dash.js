import { fmtJudge, fmtTg, fmtDp, flU } from '../../engine/mech3d/tally.js';
import { fmtProg } from './progressive.js';
import { judgeStats, uVerdict } from '../../engine/mech3d/tally.js';
// 아래 칸 대시보드 — ① 기구 최적화 진행(6 항목 타일) ② 시뮬레이션 진행현황(수렴 그래프).
// 최적화: app.js 의 기구 최적화 io 가 progress(stage, frac, text) · evals(stage, [{label, Ulen, Uwid, ok, why}]) 를 부른다.
// 타일마다 상태(대기·진행 %·완료·건너뜀) · 시험 중 값 → 지금까지 최고 · 후보별 길이/폭 균일도 점 그래프(목표선) · 진행 막대.
// 시뮬레이션: 점진 계산 스냅숏마다 sample(snap, targetNoise) — 광선 수에 따른 노이즈 %·길이/폭 균일도 추정과 진행률 %(노이즈가 목표에 닿으면 100%).
import { simCtl, setCtl, setStepMark } from './run-ctl.js';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// 계산 순서대로(엔진: 위치 → 케이스 면 → 형상 → Milky, 2026-10-30) — 번호도 이 순서
export const STAGES = [['position', '① 위치'], ['shape', '② 형상'], ['milky', '③ 확산도(Milky)']];   // 케이스 면은 부품 속성에서 직접(2026-11-05)
// 기구 최적화 진행 단계 이름 → 타일(LED 배치·높이 = ② 기구 위치). 현재안·기준·검증 = 타일 없음(머리 줄 문구로만)
// 진행 상태 갱신(순수, 2026-11-11) — 전체·단계 % 는 내려가지 않음. 끝난 항목을 다시 돌릴 때만 새로 시작
export function applyProgress(S, stage, frac, text, overall) {
  if (Number.isFinite(overall)) S.overall = Math.max(S.overall ?? 0, overall);
  if (stage === 'current') S.curFrac = Math.max(S.curFrac ?? 0, frac ?? 0); else if (stage === 'verify') S.verFrac = Math.max(S.verFrac ?? 0, frac ?? 0);
  const k = tileOf(stage);
  if (!k) {   // 현재안·검증 = 머리 줄 문구. 최종 판정으로 넘어가면 앞 항목은 끝난 것(97% 로 남아 미완료처럼 보이던 것, 2026-11-12)
    if (stage === 'verify' && S.cur && S.tiles[S.cur]?.status === 'run') { S.tiles[S.cur].status = 'done'; S.tiles[S.cur].frac = 1; }
    S.note = text ?? ''; return;
  }
  const t = S.tiles[k], f = Math.max(0, Math.min(1, frac ?? 0)); S.note = '';
  if (S.cur && S.cur !== k && S.tiles[S.cur].status === 'run') S.tiles[S.cur].status = 'done';
  t.frac = t.status === 'run' ? Math.max(t.frac ?? 0, f) : f;
  S.cur = k; t.status = 'run'; t.text = text ?? '';
}
// 긴 계산 한 번이 올리는 진행 비율 — 현재안은 거의 끝까지, 검증은 재확인이 여러 번일 수 있어 남은 구간의 60%(되돌지 않으니 자리는 남김).
// 예전 10% 는 몇 분 걸리는 최종 판정 동안 '검증 91%' 에서 멈춰 보였음(2026-11-12 평가)
export const traceFrac = (stage, frac, f) => frac + (1 - frac) * f * (stage === 'verify' ? 0.6 : 0.95);
export const tileOf = (stage) => (stage === 'milky' || stage === 'shape' || stage === 'housing' ? stage : stage === 'leds' || stage === 'height' ? 'position' : null);
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–');

// 후보 점 그래프(인라인 SVG, 순수) — 길이 균일도(파랑)·폭 균일도(초록) · 목표선(빨강 점선) · 최고 후보(동그라미)
export function evalSparkSvg(evals, tgLen, tgWid, bestIdx = -1, w = 220, h = 70) {
  const pts = evals.filter((e) => e.ok !== false && Number.isFinite(e.Ulen));
  if (!pts.length) return `<svg class="od-spark" viewBox="0 0 ${w} ${h}"><text x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle" class="od-none">후보 결과 없음</text></svg>`;
  const vals = pts.flatMap((e) => [e.Ulen, e.Uwid]).filter(Number.isFinite).concat([tgLen, tgWid].filter(Number.isFinite));
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 0.03) * 20) / 20), hi = Math.min(1, Math.ceil((Math.max(...vals) + 0.02) * 20) / 20) || 1;
  const n = evals.length, X = (i) => 6 + (n > 1 ? (i / (n - 1)) * (w - 12) : (w - 12) / 2), Y = (v) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (h - 14);
  const line = (k, cls) => { const d = evals.map((e, i) => (e.ok !== false && Number.isFinite(e[k]) ? `${X(i).toFixed(1)},${Y(e[k]).toFixed(1)}` : null)).filter(Boolean); return d.length > 1 ? `<polyline class="${cls}" points="${d.join(' ')}"/>` : ''; };
  const dots = (k, cls) => evals.map((e, i) => (e.ok !== false && Number.isFinite(e[k]) ? `<circle class="${cls}" cx="${X(i).toFixed(1)}" cy="${Y(e[k]).toFixed(1)}" r="2"/>` : e.ok === false ? `<text class="od-x" x="${X(i).toFixed(1)}" y="${h - 6}" text-anchor="middle">×</text>` : '')).join('');
  const tg = (v, cls) => (Number.isFinite(v) ? `<line class="${cls}" x1="4" x2="${w - 4}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>` : '');
  const best = bestIdx >= 0 && evals[bestIdx] && Number.isFinite(evals[bestIdx].Ulen) ? `<circle class="od-best" cx="${X(bestIdx).toFixed(1)}" cy="${Y(evals[bestIdx].Ulen).toFixed(1)}" r="5"/>` : '';
  return `<svg class="od-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${tg(tgLen, 'od-tg')}${tg(tgWid, 'od-tg od-tg2')}${line('Ulen', 'od-l1')}${line('Uwid', 'od-l2')}${dots('Ulen', 'od-d1')}${dots('Uwid', 'od-d2')}${best}
    <text class="od-ax" x="2" y="10">${fmtTg(hi)}</text><text class="od-ax" x="2" y="${h - 2}">${fmtTg(lo)}</text></svg>`;
}
// 설계 인자 현황판(순수, 왼쪽 창 맨 아래) — S = 최적화 상태(null = 실행 전), nw = 지금 설계 { milky, milkyCap, leds, shape, on:{milky,position,shape}, Ulen, Uwid, tgLen, tgWid }
// 그래프 1개에 인자 3개: 시험 순서대로 후보의 길이 균일도(실선)·폭 균일도(점선)를 인자 색으로 · 목표선(빨강) · 지금 설계(회색) · 최고 후보(노란 원)
// 아래 인자별 한 줄(상태 · 지금 → 최고). 그래프는 .fb-plot 자리의 실제 크기로 factorChartSvg 가 그림(스크롤 없이 칸에 맞춤)
const FB_COL = { milky: '#3b82f6', position: '#f59e0b', shape: '#a855f7', housing: '#10b981' };
// cfg(k) → { on, box(체크 상자), opt(설정 html), why } — 줄 앞에서 바로 켜고 끔(2026-10-29, 최적화 타일에서 옮김). 없으면 표시만
export function factorBoardHtml(S, nw = {}, cfg = null, res = null) {
  const tl = S?.tgLen ?? nw.tgLen, tw = S?.tgWid ?? nw.tgWid;
  const row = (k, name, nowTxt) => {
    // 고정 = 적용까지 마친 항목 — 다음 실행에서 건드리지 않음. [다시 최적화] = 고정 풀고 다시 체크
    const dot = `<i class="fb-dot" style="background:${FB_COL[k]}"></i>`, head = (lead, chipC, chipT) => `<div class="fb-head">${lead}${dot}<b class="fb-name">${name}</b><span class="od-chip ${chipC}">${chipT}</span></div>`;
    const R = res?.(k);   // 결과 화면(2026-11-08) — 같은 자리 상자에 이전 → 이후 · 효과(설정·진행·결과에서 인자 위치가 그대로)
    if (R) return `<div class="fb-card ${R.chg ? 'fb-on' : 'fb-off'}" style="--fb:${FB_COL[k]}">${head('<span class="fb-sw"></span>', R.chg ? 'st-run' : 'st-off', R.chip)}<div class="fb-in"><div class="fb-val">${R.body}</div>${R.eff ? `<div class="fb-eff">${R.eff}</div>` : ''}</div></div>`;
    if (nw.locked?.[k]) return `<div class="fb-card fb-lock" style="--fb:${FB_COL[k]}" title="최적화 결과를 적용함 — 다음 실행에서 이 값 그대로 씀">${head('<span class="fb-lk">🔒</span>', 'st-lock', '✓ 고정')}<div class="fb-in"><div class="fb-val">${esc(nowTxt)} <button type="button" class="fb-redo" data-adunlock="${k}">다시 최적화</button></div></div></div>`;
    const c = cfg?.(k), t = S?.tiles?.[k], on = c ? !!c.on : t ? t.status !== 'off' : !!nw.on?.[k];
    const ev = (t?.evals ?? []).filter((e) => e.ok !== false && Number.isFinite(e.Ulen)); let b = null;
    for (const e of ev) if (!b || scoreOf(e, tl, tw) > scoreOf(b, tl, tw)) b = e;
    const [chipC, chipT] = t && t.status !== 'off' ? { wait: ['st-wait', '대기'], run: ['st-run', `진행 ${fmtProg(t.frac * 100)}%`], done: ['st-done', '✓ 완료'] }[t.status] : on ? ['st-on', '켜짐'] : ['st-off', '꺼짐'];
    const txt = `지금 ${nowTxt}${b ? ` → ${b.label} (${fmtJudge(b.Ulen)}/${fmtJudge(b.Uwid)})` : ''}`;
    const box = c?.box ? `<label class="fb-sw" title="${esc(c.why || '최적화에 사용')}">${c.box}</label>` : '<span class="fb-sw"></span>';
    return `<div class="fb-card${on ? ' fb-on' : ' fb-off'}${t?.status === 'run' ? ' fb-run' : ''}" style="--fb:${FB_COL[k]}" title="${esc(txt)}">${head(box, chipC, chipT)}<div class="fb-in"><div class="fb-val"><span class="mut">지금</span> ${esc(nowTxt)}</div>${c?.opt ? `<div class="fb-opt">${c.opt}</div>` : ''}</div></div>`;
  };
  // 그래프는 오른쪽 모니터로(2026-10-30) — 여기는 입력(체크·옵션)과 상태만
  const nowOf = { position: nw.leds ?? '–', housing: nw.housing ?? '–', shape: nw.shape ?? '원래 형상', milky: Number.isFinite(nw.milky) ? `Milky ${f2(nw.milky)}` : '확산 부품 없음' };
  return `<div class="od-h" title="체크 = 이번에 최적화 · 🔒 = 적용해서 고정">설계 인자</div>
    <div class="fb-cards">${STAGES.map(([k, name]) => row(k, name, nowOf[k])).join('')}</div>
`;
}
// 그래프 칸 높이 제한(2026-11-05) — 넓으면 길이·폭 나란히, 좁으면 위아래
const CHART_TWO_MIN = 360;   // 기본 폭(약 400 px)에서도 나란히 — 위아래로 쌓으면 높이가 커짐
export const chartHeight = (W) => (W >= CHART_TWO_MIN ? 150 : 250);
// 최적화 그래프 2개(순수, 2026-11-04) — 길이·폭 균일도를 따로. 연한 점 = 시험한 후보 · 굵은 선 = 지금까지 고른 최고안 · 빨간 점선 = 목표 · 색 띠 = 그때 시험한 항목. W×H = 칸의 실제 px
export function factorChartSvg(S, nw = {}, W = 240, H = 100) {
  const tl = S?.tgLen ?? nw.tgLen, tw = S?.tgWid ?? nw.tgWid, seq = S?.seq ?? [], okE = (e) => e.ok !== false && Number.isFinite(e.Ulen), fin = S?.final ?? null;
  if (!seq.some(okE)) return `<div class="od-sim2 one"><div class="od-none-box">후보를 시험하면 여기에 그려집니다</div></div>`;
  const one = W < CHART_TWO_MIN, cw = one ? W : Math.floor((W - 12) / 2), ch = Math.max(60, (one ? Math.floor(H / 2) : H) - 19), x0 = 34, x1 = cw - (fin ? 50 : 8), y0 = 12, y1 = ch - 22, n = seq.length;
  const X = (i) => x0 + (n > 1 ? (i / (n - 1)) * (x1 - x0) : (x1 - x0) / 2), wd = (x1 - x0) / Math.max(1, n - 1);
  let bb = null; const run = seq.map((e) => { if (okE(e) && (!bb || scoreOf(e, tl, tw) > scoreOf(bb, tl, tw))) bb = e; return bb; });
  let bands = '';
  for (let s0 = 0, i = 1; i <= n; i++) if (i === n || seq[i].k !== seq[s0].k) {
    const xa = Math.max(x0, X(s0) - wd / 2), xb = Math.min(x1, X(i - 1) + wd / 2), name = STAGES.find(([k]) => k === seq[s0].k)?.[1] ?? '';
    bands += `<rect x="${xa.toFixed(1)}" y="${y0}" width="${Math.max(1, xb - xa).toFixed(1)}" height="${y1 - y0}" fill="${FB_COL[seq[s0].k] ?? '#888'}" opacity=".10"/>${xb - xa > 30 ? `<text class="od-ax" x="${((xa + xb) / 2).toFixed(1)}" y="${y0 - 3}" text-anchor="middle">${esc(name)}</text>` : ''}`;
    s0 = i;
  }
  const hits = Array.from({ length: Math.min(30, n) }, (_, q, m = Math.min(30, n)) => { const i = Math.round((q * (n - 1)) / Math.max(1, m - 1)), e = seq[i], bw = (x1 - x0) / m; return `<rect class="od-hit" x="${(x0 + q * bw).toFixed(1)}" y="${y0}" width="${bw.toFixed(1)}" height="${y1 - y0}"><title>후보 ${i + 1} · ${esc(e.label ?? '')} · 길이 ${okE(e) ? fmtJudge(e.Ulen) : '–'} · 폭 ${okE(e) ? fmtJudge(e.Uwid) : '–'}</title></rect>`; }).join('');
  const panel = (key, t, v0, title, s, d) => {
    const fv = fin?.[key], vals = [...seq.filter(okE).map((e) => e[key]), t, v0, fv].filter(Number.isFinite), lo = Math.max(0, Math.floor((Math.min(...vals) - 0.02) * 20) / 20), hi = Math.min(1, Math.ceil((Math.max(...vals) + 0.01) * 20) / 20), Y = (v) => y0 + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo || 1)) * (y1 - y0);
    const dots = seq.map((e, i) => (okE(e) && Number.isFinite(e[key]) ? `<circle class="od-cand ${d}" cx="${X(i).toFixed(1)}" cy="${Y(e[key]).toFixed(1)}" r="2"/>` : '')).join('');
    const line = run.map((e, i) => (e && Number.isFinite(e[key]) ? `${X(i).toFixed(1)},${Y(e[key]).toFixed(1)}` : null)).filter(Boolean).join(' '), last = bb?.[key];
    const mark = Number.isFinite(last) ? `<circle class="od-dot ${d}" cx="${X(n - 1).toFixed(1)}" cy="${Y(last).toFixed(1)}" r="3.5"/>` : '';
    // 기준선 이름은 선 위 왼쪽 안 — 두 선이 가까우면 시작선 이름을 선 아래로
    const yT = Number.isFinite(t) ? Y(t) : null, yS = Number.isFinite(v0) ? Y(v0) : null, near = yT != null && yS != null && Math.abs(yT - yS) < 11;
    const tg = yT != null ? `<line class="od-tg" x1="${x0}" x2="${x1}" y1="${yT.toFixed(1)}" y2="${yT.toFixed(1)}"/><text class="od-lb od-lb-tg" x="${x0 + 3}" y="${(yT - 2.5).toFixed(1)}">목표 ${fmtTg(t)}</text>` : '';
    const st = yS != null ? `<line class="od-st" x1="${x0}" x2="${x1}" y1="${yS.toFixed(1)}" y2="${yS.toFixed(1)}"/><text class="od-lb" x="${x0 + 3}" y="${(near && yS >= yT ? yS + 9 : yS - 2.5).toFixed(1)}">시작 ${fmtJudge(v0)}</text>` : '';
    // 1D 광분포와 같은 양식(2026-11-08): 실선 격자 · 테두리 · % 눈금 · 세로 = 후보 번호
    const ys = niceStep(hi - lo || 0.1, Math.max(2, Math.round((y1 - y0) / 22))), yt = []; for (let v = Math.ceil((lo - 1e-9) / ys) * ys; v <= hi + 1e-9; v += ys) yt.push(+v.toFixed(4));
    const xs = Math.max(1, niceStep(Math.max(1, n - 1), Math.max(2, Math.round((x1 - x0) / 70)))), xt = []; for (let i = xs; i < n - 1 - xs * 0.3; i += xs) xt.push(i);
    const grid = yt.map((v) => `<line class="od-gl h" x1="${x0}" x2="${x1}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="od-ax" x="${x0 - 3}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${+(v * 100).toFixed(1)}%</text>`).join('')
      + xt.map((i) => `<line class="od-gl v" x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${y0}" y2="${y1}"/><text class="od-ax" x="${X(i).toFixed(1)}" y="${y1 + 9}" text-anchor="middle">${i + 1}</text>`).join('')
      + `<rect class="od-frame" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>`;
    const final = Number.isFinite(fv) ? (() => { const fx = x1 + 8, fy = Y(fv), p = (dx, dy) => `${(fx + dx).toFixed(1)},${(fy + dy).toFixed(1)}`; return `<polygon class="od-final" points="${p(0, -5)} ${p(5, 0)} ${p(0, 5)} ${p(-5, 0)}"/><text class="od-lb od-lb-fin" x="${fx + 7}" y="${(fy - 7 < y0 ? fy + 13 : fy - 7).toFixed(1)}" text-anchor="end">최종 ${fmtJudge(fv)}</text>`; })() : '';
    const ok = Number.isFinite(last) && Number.isFinite(t) ? (last + 1e-9 >= t ? '<span class="od-ok">✓</span>' : '<span class="od-bad">✕</span>') : '';
    return `<div><div class="od-simt"><b>${title}</b></div><svg class="od-sim" width="${cw}" height="${ch}" viewBox="0 0 ${cw} ${ch}">${bands}${grid}${st}${tg}${dots}${line ? `<polyline class="${s}" points="${line}"/>` : ''}${mark}${final}${hits}<text class="od-ax" x="${((x0 + x1) / 2).toFixed(1)}" y="${ch - 3}" text-anchor="middle">시험한 후보 ${n}개 (시험한 순서 →)</text></svg></div>`;
  };
  return `<div class="od-sim2${one ? ' one' : ''}">${panel('Ulen', tl, nw.Ulen, '길이 균일도', 'od-s1', 'od-d1')}${panel('Uwid', tw, nw.Uwid, '폭 균일도', 'od-s2', 'od-d2')}</div>`;
}
// 최적화 타일 전후 사양표(순수) — b0 = 실행 전 사양(factorNow), best = 그 항목 최고 후보 { label, Ulen, Uwid }. 바뀐 칸 강조 · 목표 통과 ✓/✕
const SPEC_NOW = { milky: (b) => (Number.isFinite(b.milky) ? `Milky ${f2(b.milky)}` : '–'), position: (b) => b.leds ?? '–', shape: (b) => b.shape ?? '원래 형상', housing: (b) => b.housing ?? '–' };
export function beforeAfterHtml(k, b0, best, tl, tw, n = 0) {
  if (!best) return '<div class="mut od-tx">쓸 수 있는 후보 없음</div>';
  const pass = (v, t) => (Number.isFinite(v) && Number.isFinite(t) ? (v + 1e-9 >= t ? ' <b class="od-ok">✓</b>' : ' <b class="od-bad">✕</b>') : '');
  const row = (name, a, b, extra = '') => `<tr><th>${name}</th><td>${a}</td><td class="${a !== b ? 'chg' : ''}">${b}${extra}</td></tr>`;
  return `<table class="od-ba"><tr><th></th><th>전</th><th>후</th></tr>
    ${row('사양', esc(SPEC_NOW[k]?.(b0) ?? '–'), esc(best.label))}
    ${row('길이 균일도', fmtJudge(b0.Ulen), fmtJudge(best.Ulen), pass(best.Ulen, tl))}
    ${row('폭 균일도', fmtJudge(b0.Uwid), fmtJudge(best.Uwid), pass(best.Uwid, tw))}</table><div class="mut od-tx">후보 ${n}개 중 최고 · 적용은 위 [적용]</div>`;
}
// 오른쪽 모니터(순수, 2026-10-30) — 진행 줄(계산 순서 · 고정/완료/진행/대기) · 지표 3개(지금까지 최고, 시작 대비) · 그래프 자리(.od-plot) · 기록(최고 갱신만)
// S = createOptDash 상태, sec = 걸린 초. 그래프는 자리 크기로 factorChartSvg 가 나중에 그림
export const chartHtml = () => `<div class="od-plot" title="위로 갈수록 좋음 · 빨간 선에 닿으면 목표 통과"></div>
    <div class="od-legend od-lg"><span><i class="lg-dot"></i>시험한 후보(대략값)</span><span><i class="lg-line"></i>지금까지 최고</span><span><i class="lg-dia"></i>최종 판정(확정값)</span><span><i class="lg-tg"></i>목표</span><span><i class="lg-st"></i>시작</span></div>`;
// chart = false → 그래프는 따로(창 왼쪽 아래 칸, createOptDash h.chart)
export function monitorHtml(S, sec = 0, { chart = true } = {}) {
  const tl = S.tgLen, tw = S.tgWid, ok = (e) => e.ok !== false && Number.isFinite(e.Ulen);
  let best = null; for (const e of S.seq ?? []) if (ok(e) && (!best || scoreOf(e, tl, tw) > scoreOf(best, tl, tw))) best = e;
  const busy = S.ended == null && !S.stopped, fin0 = S.final;
  const step = (cls, name, sub) => `<div class="om-st om-${cls}"><b>${name}</b><span>${sub}</span></div>`;
  const uv = (e) => (e && Number.isFinite(e.Ulen) ? ` <i class="om-sv">${e.est ? '≈' : ''}${fmtJudge(e.Ulen)}/${fmtJudge(e.Uwid)}</i>` : '');   // 단계 최고(길이/폭) — 현황표 대신 상자 안에(2026-11-08)
  const steps = [step(S.seq?.length || !busy ? 'done' : 'run', '현재안', S.seq?.length || !busy ? '✓' : `${Math.round((S.curFrac ?? 0) * 100)}%`)];
  for (const [k, name] of STAGES) {
    const t = S.tiles[k];
    if (S.locked?.[k] && t.status === 'off') steps.push(step('lock', name, '고정 ✓'));
    else if (t.status === 'run') steps.push(step('run', name, `${fmtProg(t.frac * 100)}%`));
    else if (t.status === 'done') steps.push(step('done', name, `✓${uv(stageBest(t, tl, tw))}`));
    else if (t.status === 'wait') steps.push(step('wait', name, '대기'));
  }
  steps.push(S.ended != null ? step('done', '검증', '✓') : busy && S.verFrac != null ? step('run', '검증', `${fmtProg(S.verFrac * 100)}%`) : step('wait', '검증', ''));
  const b0 = S.before ?? {};
  const kpi = (label, tg, v, v0) => {
    const pass = Number.isFinite(v) && Number.isFinite(tg) ? (v + 1e-9 >= tg ? 'ok' : 'bad') : '';
    const d = Number.isFinite(v) && Number.isFinite(v0) ? v - v0 : NaN;
    return `<div class="om-k"><div class="mut">${label}${Number.isFinite(tg) ? ` · 목표 ${fmtTg(tg)}` : ''}</div><b class="om-v ${pass}">${fmtJudge(v)}</b><div class="mut">시작 ${fmtJudge(v0)}${Number.isFinite(d) && Math.abs(d) >= 0.0005 ? ` → ${d > 0 ? '▲' : '▼'}${fmtDp(Math.abs(d)).slice(1)}` : ''}</div></div>`;
  };
  const effB = S.effBest, eff0 = b0.eff;
  const effK = `<div class="om-k"><div class="mut">광 효율</div><b class="om-v">${Number.isFinite(effB) ? `${(effB * 100).toFixed(1)}%` : Number.isFinite(eff0) ? `${(eff0 * 100).toFixed(1)}%` : '–'}</b><div class="mut">${Number.isFinite(effB) && Number.isFinite(eff0) ? `시작 ${(eff0 * 100).toFixed(1)}%` : Number.isFinite(eff0) ? '시작값 · 최적안은 끝나면' : ''}</div></div>`;
  const mmss = (t) => `${String((t / 60) | 0).padStart(2, '0')}:${String(t % 60 | 0).padStart(2, '0')}`;
  const nEval = (S.seq ?? []).length;
  const fin = S.final, cur = fin ?? best, J = fin ? judgeStats(fin, { targetLen: tl, targetWid: tw }) : {}, uTxt = (l, v, t, j) => `${l} <b>${fmtJudge(v)}</b>${Number.isFinite(v) && Number.isFinite(t) ? ` (목표 ${fmtTg(t)} ${j === 'near' ? '<span class="od-near">근처</span>' : v + 1e-9 >= t ? '<span class="od-ok">통과</span>' : '<span class="od-bad">미달</span>'})` : ''}`;
  const uLine = cur ? `${uTxt('길이 균일도', cur.Ulen, tl, J.len)}, ${uTxt('폭 균일도', cur.Uwid, tw, J.wid)}` : '';
  const doing = S.note || (S.cur ? S.tiles[S.cur].text : '') || '준비하는 중';
  // 판정은 한 줄만 — 값은 아래 지표 카드에(같은 값을 여러 곳에 쓰지 않음, 2026-11-08)
  const say = busy ? `<p><b>지금</b> ${esc(doing)}</p>`
    : S.stopped ? '<p><b>중지했습니다.</b> 찾던 안은 설계에 반영되지 않았습니다.</p>'
    : '';
  const pct = fmtProg(S.ended != null ? 100 : Math.max(0, Math.min(1, S.overall ?? 0)) * 100);
  return `<div class="om-kpi">${kpi('길이 균일도', tl, cur?.Ulen ?? b0.Ulen, b0.Ulen)}${kpi('폭 균일도', tw, cur?.Uwid ?? b0.Uwid, b0.Uwid)}${effK}</div>
    <div class="od-pct om-pct"><b>${pct}%</b><div class="od-bar od-bar-big" role="progressbar" aria-label="기구 최적화 진행" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><span class="mut od-simst">${busy ? `${S.pauseAt ? '일시정지' : '진행'} ${mmss(sec)}` : S.stopped ? '중지됨' : `끝남 ${mmss((S.endSec ?? sec))}`} · 후보 ${nEval}개</span></div>
    <div class="om-steps">${steps.join('<i class="om-ar">→</i>')}</div>
    <div class="om-say">${say}</div>
    ${chart ? chartHtml() : ''}
    <details class="om-more" data-keep="mx"><summary>상세 — 항목별 현황</summary>${optMatrixHtml(S)}</details>`;
}
// 최적화 현황 표(순수, 2026-11-03) — 항목 × (상태 · 시험 후보 · 그 항목 최고 길이·폭 · 최고안). 마지막 줄 = 최종 판정(최종 화질)
export function optMatrixHtml(S) {
  // est = 배치 Solver 추정(단일 LED 지도 합성, 실제 계산 아님 — 실제보다 크게 나올 수 있음): 흐리게 ≈ 로(2026-11-07)
  const tl = S.tgLen, tw = S.tgWid, cell = (v, t, est) => (!Number.isFinite(v) ? '<span class="mut">–</span>' : est ? `<span class="mut" title="배치 추정값 — 실제 계산 아님">≈${fmtJudge(v)}</span>` : `<b class="${Number.isFinite(t) ? (v + 1e-9 >= t ? 'od-ok' : 'od-bad') : ''}">${fmtJudge(v)}</b>`);
  const row = (name, st, n, e, cls = '') => `<tr class="${cls}"><th>${name}</th><td>${st}</td><td>${n}</td><td>${cell(e?.Ulen, tl, e?.est)}</td><td>${cell(e?.Uwid, tw, e?.est)}</td><td class="om-mx-l">${esc(e?.label ?? '')}${e?.est ? ' <span class="mut">(추정)</span>' : ''}</td></tr>`;
  const rows = STAGES.flatMap(([k, name]) => {
    const t = S.tiles[k], locked = S.locked?.[k] && t.status === 'off';
    if (t.status === 'off' && !locked) return [];
    const st = locked ? '고정' : t.status === 'run' ? `진행 ${fmtProg(t.frac * 100)}%` : t.status === 'done' ? '완료' : '대기';
    const e = stageBest(t, tl, tw);
    return [row(name, st, t.evals.length || '–', e)];
  });
  const stF = S.final ? '완료' : S.stopped ? '중지' : '대기';
  return `<div class="om-mx" title="항목 줄 = 가장 좋았던 후보 하나의 값(적은 광선으로 빠르게 비교해 낮게 나옴) · 최종 판정 = 고른 안을 많은 광선으로 다시 잰 확정값"><table class="om-mx-t"><tr><th>항목</th><th>상태</th><th>시험 후보</th><th>길이</th><th>폭</th><th>최고안</th></tr>${rows.join('')}${row('최종 판정', stF, '–', S.final, 'om-mx-f')}</table></div>`;
}
// 단계 최고 후보 — 실제 계산값이 있으면 그것 중 최고(배치 추정은 빼고)
function stageBest(t, tl, tw) {
  const ev = t?.evals ?? [], real = ev.some((q) => q.ok !== false && !q.est);
  let e = null; for (const q of ev) if (q.ok !== false && (!real || !q.est) && (!e || scoreOf(q, tl, tw) > scoreOf(e, tl, tw))) e = q;
  return e;
}
// 지난 최적화 후보 표(순수, 2026-11-07) — 균일도 순(목표 대비 여유가 큰 순, 같으면 효율). 값 = 최종 판정과 같은 정밀 재계산. [적용] = data-hpick(원래 번호)
export function histTableHtml(list, tl, tw, busy, { pick = 'h', max = 0 } = {}) {
  if (!list?.length) return '';
  // 순위 = 표시값(내림) 기준 — 노이즈 수준 차이(0.418 vs 0.412)로 화면상 같은 값의 순서가 뒤집히지 않게. 같으면 두 균일도 합 → 효율
  const fl = (v) => (Number.isFinite(v) ? Math.floor(v * 100 + 1e-9) / 100 : NaN);
  const mg = (e) => Math.min(Number.isFinite(tl) ? fl(e.Ulen) - tl : Infinity, Number.isFinite(tw) && e.Uwid != null ? fl(e.Uwid) - tw : Infinity), sum = (e) => (fl(e.Ulen) || 0) + (fl(e.Uwid) || 0);
  const cell = (v, t) => (Number.isFinite(v) ? `<b class="${Number.isFinite(t) ? (v + 1e-9 >= t ? 'od-ok' : 'od-bad') : ''}">${fmtJudge(v)}</b>` : '–');
  const rows = list.map((e, i) => ({ e, i })).sort((a, b) => mg(b.e) - mg(a.e) || sum(b.e) - sum(a.e) || (b.e.eff || 0) - (a.e.eff || 0)).slice(0, max > 0 ? max : undefined).map(({ e, i }, n) =>
    `<tr${e.applied ? ' class="om-h-on"' : ''}><td>${n + 1}</td><td class="om-mx-l" title="${esc(e.label)}">${esc(e.label)}${e.kind === 'final' ? '' : ' <span class="mut">(대안)</span>'}</td><td>${cell(e.Ulen, tl)}</td><td>${cell(e.Uwid, tw)}</td><td>${Number.isFinite(e.eff) ? `${(e.eff * 100).toFixed(1)}%` : '–'}</td><td class="mut">${esc(e.at ?? '')}</td>`
    + `<td><button type="button" ${pick === 'ad' ? `data-ad="hpick" data-v="${i}"` : `data-hpick="${i}"`}${busy ? ' disabled title="최적화가 끝난 뒤 고르세요"' : ''}>${e.applied ? '적용됨' : '적용'}</button></td></tr>`);
  if (pick === 'ad') return `<div class="om-hist-sc rs-histt"><table class="om-mx-t"><colgroup><col style="width:26px"><col><col style="width:58px"><col style="width:58px"><col style="width:52px"><col style="width:48px"><col style="width:58px"></colgroup><tr><th>#</th><th>사양</th><th>길이</th><th>폭</th><th>효율</th><th>시각</th><th></th></tr>${rows.join('')}</table></div>`;   // 결과 화면 안(머리는 결과 화면이 씀)
  return `<div class="om-mx om-hist"><div class="om-lh" title="값 = 정밀 재계산 · 원하는 사양을 골라 [적용]"><b>지난 후보</b> <span class="mut">균일도 순 · ${list.length}개</span></div><div class="om-hist-sc"><table class="om-mx-t"><tr><th>#</th><th>사양</th><th>길이</th><th>폭</th><th>효율</th><th>시각</th><th></th></tr>${rows.join('')}</table></div></div>`;
}
// 후보의 점수(목표 대비 여유 — 둘 다 있으면 작은 쪽)
const scoreOf = (e, tl, tw) => (e.ok === false || !Number.isFinite(e.Ulen) ? -Infinity : Math.min(e.Ulen - tl, Number.isFinite(e.Uwid) && Number.isFinite(tw) ? e.Uwid - tw : Infinity));

// 다시 그려도 펼친 상세(details[data-keep])는 펼친 채로
export function keepOpen(node) {
  const open = new Set([...node.querySelectorAll('details[data-keep]')].filter((d) => d.open).map((d) => d.dataset.keep));
  return () => node.querySelectorAll('details[data-keep]').forEach((d) => { if (open.has(d.dataset.keep)) d.open = true; });
}
// h = { config(k) → { on, html }(타일 머리의 켜기 스위치·설정), onSel(key, value) } — 실행 전·후에는 타일에서 항목을 고르고, 실행 중에는 진행을 봄
export function createOptDash(el, h = {}) {
  let S = null, raf = 0;
  const onChange = (e) => { const x = e.target.closest('[data-ad]'); if (!x || !h.onSel) return; const k = x.dataset.ad; h.onSel(k, x.type === 'checkbox' ? x.checked : x.tagName === 'SELECT' ? +x.value : x.value === '' ? NaN : +x.value); };
  el.addEventListener('change', onChange); h.board?.addEventListener('change', onChange);
  h.board?.addEventListener('click', (e) => { const b = e.target.closest('[data-adunlock]'); if (b) h.onUnlock?.(b.dataset.adunlock); });   // 🔒 고정 → [다시 최적화]   // 켜기·설정 = 설계 인자 현황 줄
  const blank = () => Object.fromEntries(STAGES.map(([k]) => [k, { status: 'off', frac: 0, text: '', evals: [] }]));
  function reset({ stages = {}, tgLen, tgWid, locked = {} } = {}) {
    S = { tiles: blank(), tgLen, tgWid, t0: performance.now(), cur: null, note: '', seq: [], log: [], locked, before: h.now?.() ?? {} };   // before = 실행 전 사양(타일 전후 비교) · locked = 고정 항목(진행 줄 표시)
    for (const [k] of STAGES) S.tiles[k].status = stages[k] ? 'wait' : 'off';
    draw();
  }
  // 보완 실행 — 새로 켠 항목을 '대기' 로(기존 결과는 남김)
  function addStages(stages, note = '') { if (!S) return; for (const [k] of STAGES) if (stages[k] && S.tiles[k].status === 'off') S.tiles[k].status = 'wait'; S.note = note; draw(); }
  function progress(stage, frac, text, overall) {
    if (!S) return;
    applyProgress(S, stage, frac, text, overall);
    draw();
  }
  function evals(stage, list) { if (!S) return; const k = tileOf(stage); if (!k) { S.verify = list[list.length - 1] ?? S.verify; draw(); return; } const t = S.tiles[k]; t.evals.push(...list); for (const e of list) { const q = { ...e, k }; S.seq.push(q); if (q.ok !== false && !q.est && Number.isFinite(q.Ulen) && (!S.bestE || scoreOf(q, S.tgLen, S.tgWid) > scoreOf(S.bestE, S.tgLen, S.tgWid))) { S.bestE = q; S.log.push({ sec: (performance.now() - S.t0) / 1000, k, label: q.label, Ulen: q.Ulen, Uwid: q.Uwid }); } } if (t.status === 'off' || t.status === 'wait') t.status = 'run'; draw(); }
  function finish(ok, text = '', effBest = NaN, final = null) { if (!S) return; S.effBest = effBest; S.final = final; S.endSec = (performance.now() - S.t0) / 1000; for (const [k] of STAGES) if (S.tiles[k].status === 'run') { S.tiles[k].status = 'done'; S.tiles[k].frac = 1; } S.note = text; S.ended = ok; draw(); }
  function draw() { if (raf) return; raf = setTimeout(() => { raf = 0; render(); renderBoard(); }, 40); }   // setTimeout: 화면이 숨겨져도(다른 탭) 갱신 — rAF 는 멈춤
  // 높이 조절 손잡이(.m3-fac-split)는 남기고 내용만 바꿈
  function renderBoard() { if (!h.board) return; let c = h.board.querySelector('.fb-body'); if (!c) { c = document.createElement('div'); c.className = 'fb-body'; h.board.appendChild(c); } const nw = h.now?.() ?? {}; { const html = factorBoardHtml(S, nw, h.config, h.result); if (c._html !== html) { c.innerHTML = html; c._html = html; } } }   // 같으면 그대로(깜빡임·체크 클릭 사라짐 방지)
  if (h.board && typeof ResizeObserver !== 'undefined') { let w0 = 0, h0 = 0; new ResizeObserver(() => { const b = h.board; if (b.clientWidth === w0 && b.clientHeight === h0) return; w0 = b.clientWidth; h0 = b.clientHeight; renderBoard(); }).observe(h.board); }   // 칸 크기가 바뀌면 그래프를 그 크기로 다시
  // 오른쪽 모니터 — 진행 줄 · 지표 · 그래프(자리 크기로) · 기록. 끝나도 그대로 남김(결과 카드는 위 #m3-auto)
  // 지난 후보 표(2026-11-07) — 실행 결과 아래에 늘 붙임(실행 전에도 지난 후보가 있으면)
  const histHtml = () => { const H = h.history?.(); return H?.list?.length ? histTableHtml(H.list, H.tgLen, H.tgWid, H.busy) : ''; };
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-hpick]'); if (b && !b.disabled) h.onPick?.(+b.dataset.hpick); });
  function render() {
    // 바뀐 것만 갱신(2026-11-07) — 전에는 초당 3~4번 통째로 다시 만들고 그래프 칸을 비웠다가 그려 화면이 깜빡였음
    const put = (node, html) => { if (node && node._html !== html) { const op = keepOpen(node); node.innerHTML = html; node._html = html; op(); } };
    if (!S) { put(el, histHtml()); if (h.chart) put(h.chart, ''); return; }   // 실행 전 = 비움(항목 켜기는 왼쪽 설계 인자 체크) — 지난 후보만
    put(el, monitorHtml(S, ((S.pauseAt ?? performance.now()) - S.t0) / 1000, { chart: !h.chart }) + histHtml());
    if (h.chart) put(h.chart, chartHtml());   // 틀은 한 번 — 같은 글이면 그대로
    const p = (h.chart ?? el).querySelector('.od-plot');
    if (p && h.chart) { const hh = `${chartHeight(p.clientWidth)}px`; if (p.style.height !== hh) p.style.height = hh; }
    if (p && p.clientWidth > 40 && p.clientHeight > 30) put(p, factorChartSvg(S, { ...(S.before ?? {}), tgLen: S.tgLen, tgWid: S.tgWid }, p.clientWidth, p.clientHeight));
  }
  if (typeof ResizeObserver !== 'undefined') { let w0 = 0; new ResizeObserver(() => { if (el.clientWidth !== w0) { w0 = el.clientWidth; draw(); } }).observe(el); if (h.chart) { let cw = 0, ch = 0; new ResizeObserver(() => { const b = h.chart; if (b.clientWidth !== cw || b.clientHeight !== ch) { cw = b.clientWidth; ch = b.clientHeight; draw(); } }).observe(h.chart); } }
  if (typeof setInterval !== 'undefined') setInterval(() => { if (S && S.ended == null && !S.stopped && el.isConnected && el.offsetParent) draw(); }, 1000);   // 걸린 시간 갱신
  render(); renderBoard();
  function stop() { if (S) { S.stopped = true; S.pauseAt = null; draw(); } }
  // 일시정지한 시간은 걸린 시간에서 뺌
  function setPaused(on) { if (!S) return; if (on) S.pauseAt ??= performance.now(); else if (S.pauseAt) { S.t0 += performance.now() - S.pauseAt; S.pauseAt = null; } draw(); }
  // 고르기만 바뀜(실행 전) — 다시 그림. 실행 결과가 남아 있으면 그대로 두고 스위치만 갱신
  function refresh() { draw(); }
  function clear() { S = null; draw(); }
  // 단계별 최고(실제 계산값) — 결과 화면의 항목별 효과
  function stageBests() { if (!S) return null; const o = {}; for (const [k] of STAGES) { const t = S.tiles[k]; if (t.status !== 'off') { const e = stageBest(t, S.tgLen, S.tgWid); if (e && !e.est) o[k] = { Ulen: e.Ulen, Uwid: e.Uwid }; } } return o; }
  const hasRun = () => !!S;
  return { stageBests, hasRun, reset, addStages, progress, evals, finish, stop, setPaused, refresh, clear };
}

// 광경로 순위(순수) — paths = { 'R:2>1': 가중 합 } → [{ parts:[번호], refl, share }] 비중 큰 순(기구 부품만, 같은 경로 합침)
// skip = 빛 계산에서 뺀 부품 번호(그 부품은 빛이 그냥 지나가므로 경로에 넣지 않음)
export function topPaths(paths, nMech, k = 3, skip = []) {
  const m = new Map(); let tot = 0;
  for (const [key, w] of Object.entries(paths ?? {})) {
    const [r, sq] = key.split(':'), parts = (sq ? sq.split('>').map(Number) : []).filter((q) => q < nMech && !skip.includes(q)), refl = r === 'R', kk = `${refl ? 'R' : ''}:${parts.join('>')}`;
    tot += w; const o = m.get(kk) ?? { parts, refl, w: 0 }; o.w += w; m.set(kk, o);
  }
  return tot > 0 ? [...m.values()].sort((a, b) => b.w - a.w).slice(0, k).map((o) => ({ parts: o.parts, refl: o.refl, share: o.w / tot })) : [];
}
export const pathText = (p, names) => `LED → ${p.parts.map((q) => names[q] ?? `부품 ${q + 1}`).join(' → ')}${p.parts.length ? ' → ' : ''}관측면${p.refl ? ' (케이스 반사 포함)' : ''}`;
// 시뮬레이션 진행현황 — 광선 수에 따른 노이즈(%)·U 추정 · 진행률(노이즈가 목표에 닿으면 100%)
export function simPct(relNoise, target) { return Number.isFinite(relNoise) && relNoise > 0 ? Math.max(0, Math.min(100, (target / relNoise) ** 2 * 100)) : 0; }
// 남은 계산 예상(순수) — 오차는 광선 수의 제곱근에 반비례 → 필요 광선 = 지금 × (오차/목표)². 속도 = 최근 10초 광선 증가
const human = (n) => (n >= 1e8 ? `${(n / 1e8).toFixed(1)}억` : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString()}만` : String(Math.round(n)));
export function etaText(H, tgt) {
  const last = H[H.length - 1];
  if (!last || !(last.noise > tgt) || H.length < 3) return '';
  const need = last.ph * (last.noise / tgt) ** 2, ref = H.find((p) => last.t - p.t <= 10000) ?? H[0], rate = (last.ph - ref.ph) / Math.max(1e-3, (last.t - ref.t) / 1000);
  if (!(rate > 0)) return '';
  const sec = (need - last.ph) / rate, tm = sec < 90 ? `${Math.max(1, Math.round(sec))}초` : sec < 5400 ? `${Math.round(sec / 60)}분` : `${(sec / 3600).toFixed(1)}시간`;
  return ` · 필요 광선 ≈ ${human(need)} · 남은 ≈ ${tm}`;
}
// 빛 도달 진단(순수) — 관측면으로 나온 빛이 아주 적으면(< 1%) 빛이 실제로 어디로 갔는지 알려 줌: 많이 나간 곳(부품·면) · 흡수.
// ledger = 원장(emitted·escaped·absSurf·absVol), leak = { 'part|face': 관측면이 아닌 곳으로 나간 양 }('-1|-1' = 투과 부품을 거치지 않고 공기로)
export function reachDiag(ledger, leak, names = []) {
  const E = ledger?.emitted ?? 0;
  if (!(E > 0)) return null;
  const leakSum = Object.values(leak ?? {}).reduce((a, b) => a + b, 0), reach = Math.max(0, (ledger.escaped - leakSum) / E);
  if (reach >= 0.01) return null;
  const nm = (k) => { const [p, f] = k.split('|').map(Number); return p < 0 ? 'LED에서 바로 공기로(투과 부품을 거치지 않음)' : `${names[p] ?? `부품 ${p + 1}`} 면 #${f}`; };
  const top = Object.entries(leak ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${nm(k)} ${((v / E) * 100).toFixed(0)}%`);
  const abs = ((ledger.absSurf ?? 0) + (ledger.absVol ?? 0)) / E;
  const few = reach < 0.001;   // 0.1% 미만 = 설정 문제일 가능성 큼, 1% 미만 = 구조상 적음(계산이 오래 걸림)
  return { reach, html: `<b>관측면에 도착한 빛 ${(reach * 100).toFixed(few ? 3 : 2)}%</b> — ${few ? '거의 없음(설정 확인 필요)' : '매우 적음(계산이 오래 걸림)'}. 빛이 간 곳: ${top.join(' · ') || '–'}${abs > 0.05 ? ` · 흡수 ${(abs * 100).toFixed(0)}%` : ''}
    ${few ? '' : '<div class="mut">관측면 쪽을 뺀 바깥면을 반사 처리(불투명 백색)하면 도착 빛이 늘어 빨라집니다</div>'}<div class="mut">확인: ① 관측면 화살표가 빛이 나오는 바깥쪽을 향하는지 ② LED 노란 점선(발광 방향)이 부품 쪽을 향하는지 ③ 관측면이 다른 부품에 덮여 있지 않은지 — 3D 의 주황 면 = 가장 많이 새는 곳</div>` };
}
// 진행 현황 그래프(순수, 2026-11-03) — 가로 = 광선 수(0 ~ 예상 총광선), 세로 = 균일도 %(점선 = 목표). H = [{ ph, noise, Ulen, Uwid }]
export const simTotal = (last, tgt) => (last ? Math.max(last.ph, Number.isFinite(last.noise) ? last.ph * (last.noise / tgt) ** 2 : 0) : 0);
// 진행 그래프 2개(2026-11-04): ① 계산 오차가 목표까지 내려가는 모습(남은 양 = 점선 예상) ② 길이·폭 균일도와 목표선(세로 막대 = 값의 불확실 범위 ±2 표준오차)
const niceStep = (span, want) => { const raw = span / want, p = 10 ** Math.floor(Math.log10(raw)); for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p; return 10 * p; };   // results-panel 1D 와 같은 눈금 간격
const lineOf = (pts) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
export function simPlotSvg(H, tgt, obs, w, h) {
  if (!(H?.length > 1)) return '';
  const last = H[H.length - 1], total = Math.max(simTotal(last, tgt), last.ph), one = w < 280, cw = one ? w : Math.floor((w - 8) / 2), ch = Math.max(44, (one ? Math.floor(h / 2) : h) - 17);
  const x0 = 28, x1 = cw - 5, y0 = 4, y1 = ch - 12, X = (ph) => x0 + (ph / total) * (x1 - x0), f1 = (v) => (Number.isFinite(v) ? (v * 100).toFixed(1) : '–'), f2 = (v) => (v * 100).toFixed(2);
  const xAxis = `<line class="od-ax-l" x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}"/><text class="od-ax" x="${x0}" y="${ch - 2}">0</text><text class="od-ax" x="${x1}" y="${ch - 2}" text-anchor="end">총 ${human(total)} 광선</text>`;
  // 안내선(2026-11-08): 세로 = 광선 수 ¼·½·¾(눈금 글), 가로 = 그래프마다 눈금(목표 글과 겹치면 글 생략)
  // 1D 광분포와 같은 양식(2026-11-08): 실선 격자(가로 진하게·세로 옅게) · 테두리 · 회색 눈금 글 · 세로 눈금 = 보기 좋은 간격(≈70px)
  const xst = niceStep(total, Math.max(2, Math.round((x1 - x0) / 70))), vTicks = []; for (let ph = xst; ph < total * 0.97; ph += xst) vTicks.push(ph);
  const vGrid = vTicks.map((ph) => { const x = X(ph).toFixed(1); return `<line class="od-gl v" x1="${x}" x2="${x}" y1="${y0}" y2="${y1}"/>${X(ph) < x1 - 40 ? `<text class="od-ax" x="${x}" y="${ch - 2}" text-anchor="middle">${human(ph)}</text>` : ''}`; }).join('') + `<rect class="od-frame" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>`;
  const hGrid = (ys, Y, lab, avoid) => { const gap = ys.length > 1 ? Math.abs(Y(ys[1]) - Y(ys[0])) : 99, every = gap >= 11 ? 1 : gap >= 6 ? 2 : 0; return ys.map((v, i) => { const y = Y(v); return `<line class="od-gl h" x1="${x0}" x2="${x1}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>${every && i % every === 0 && avoid.every((a) => Math.abs(a - y) > 9) ? `<text class="od-ax" x="${x0 - 3}" y="${(y + 3).toFixed(1)}" text-anchor="end">${lab(v)}</text>` : ''}`; }).join(''); };   // 칸이 낮아 눈금이 촘촘하면 글은 건너뛰거나 생략(겹침 방지)
  const hits = (fn) => { const n = Math.min(24, H.length), wd = (x1 - x0) / n; let out = ''; for (let i = 0; i < n; i++) { const p = H[Math.round((i * (H.length - 1)) / Math.max(1, n - 1))]; out += `<rect class="od-hit" x="${(x0 + i * wd).toFixed(1)}" y="${y0}" width="${wd.toFixed(1)}" height="${y1 - y0}"><title>${fn(p)}</title></rect>`; } return out; };
  // ① 계산 오차
  const nMax = tgt * 4, YA = (v) => y0 + (1 - Math.min(v, nMax) / nMax) * (y1 - y0), mes = H.filter((p) => Number.isFinite(p.noise)).map((p) => [X(p.ph), YA(p.noise)]);
  const pred = Number.isFinite(last.noise) && last.noise > tgt ? Array.from({ length: 13 }, (_, i) => { const ph = last.ph + ((total - last.ph) * i) / 12; return [X(ph), YA(last.noise * Math.sqrt(last.ph / ph))]; }) : [];
  const gridA = vGrid + hGrid([0.25, 0.5, 0.75].map((k) => nMax * k), YA, (v) => `${f1(v)}%`, [YA(tgt), y0 + 4]);
  const svgA = `<svg class="od-sim" width="${cw}" height="${ch}" viewBox="0 0 ${cw} ${ch}">${gridA}
    <line class="od-tg" x1="${x0}" x2="${x1}" y1="${YA(tgt).toFixed(1)}" y2="${YA(tgt).toFixed(1)}"/><text class="od-ax" x="${x0 - 3}" y="${(YA(tgt) + 3).toFixed(1)}" text-anchor="end">${f1(tgt)}%</text><text class="od-ax" x="${x0 - 3}" y="${y0 + 7}" text-anchor="end">${f1(nMax)}%</text>${xAxis}
    ${pred.length ? `<polyline class="od-pred" points="${lineOf(pred)}"/>` : ''}<polyline class="od-s1" points="${lineOf(mes)}"/>${mes.length ? `<circle class="od-dot od-d1" cx="${mes[mes.length - 1][0].toFixed(1)}" cy="${mes[mes.length - 1][1].toFixed(1)}" r="3"/>` : ''}${hits((p) => `광선 ${human(p.ph)} · 오차 ±${f2(p.noise)}%`)}</svg>`;
  // ② 균일도
  const tl = obs?.targetLen, tw = obs?.targetWid, vals = [tl, tw, last.Ulen, last.Uwid].filter(Number.isFinite), lo = Math.max(0, Math.floor((Math.min(...vals) - 0.05) * 20) / 20), hi = Math.min(1, Math.ceil((Math.max(...vals) + 0.05) * 20) / 20);
  const YB = (v) => y0 + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (y1 - y0);
  const uLine = (k, cls) => { const pts = H.filter((p) => Number.isFinite(p[k])).map((p) => [X(p.ph), YB(p[k])]); return pts.length ? `<polyline class="${cls}" points="${lineOf(pts)}"/>` : ''; };
  const mark = (v, se, cls) => { if (!Number.isFinite(v)) return ''; const x = X(last.ph).toFixed(1), d = 2 * (Number.isFinite(se) ? se : 0); return `${d > 0 ? `<line class="od-bar-e ${cls}" x1="${x}" x2="${x}" y1="${YB(v + d).toFixed(1)}" y2="${YB(v - d).toFixed(1)}"/>` : ''}<circle class="od-dot ${cls}" cx="${x}" cy="${YB(v).toFixed(1)}" r="3"/>`; };
  const tgLines = [...new Set([tl, tw].filter(Number.isFinite))].map((t) => `<line class="od-tg" x1="${x0}" x2="${x1}" y1="${YB(t).toFixed(1)}" y2="${YB(t).toFixed(1)}"/><text class="od-ax" x="${x0 - 3}" y="${(YB(t) + 3).toFixed(1)}" text-anchor="end">${fmtTg(t)}</text>`).join('');
  const stB = hi - lo > 0.3 ? 0.1 : 0.05, ysB = []; for (let v = Math.ceil((lo + 1e-9) / stB) * stB; v < hi - 1e-9; v += stB) ysB.push(+v.toFixed(2));
  const gridB = vGrid + hGrid(ysB, YB, (v) => `${Math.round(v * 100)}%`, [...[tl, tw].filter(Number.isFinite).map(YB), y0 + 4, y1]);
  const svgB = `<svg class="od-sim" width="${cw}" height="${ch}" viewBox="0 0 ${cw} ${ch}">${gridB}${tgLines}<text class="od-ax" x="${x0 - 3}" y="${y0 + 7}" text-anchor="end">${Math.round(hi * 100)}%</text><text class="od-ax" x="${x0 - 3}" y="${y1}" text-anchor="end">${Math.round(lo * 100)}%</text>${xAxis}
    ${uLine('Ulen', 'od-s1')}${uLine('Uwid', 'od-s2')}${mark(last.Ulen, last.seLen, 'od-d1')}${mark(last.Uwid, last.seWid, 'od-d2')}${hits((p) => `광선 ${human(p.ph)} · 길이 ${fmtJudge(p.Ulen)} · 폭 ${fmtJudge(p.Uwid)}`)}</svg>`;
  const mk = (v, t, se, rn) => ({ ok: '<span class="od-ok">✓</span>', near: '<span class="od-near">≈</span>', bad: '<span class="od-bad">✕</span>' })[uVerdict(v, t, se, rn)] ?? '';
  return `<div class="od-sim2${one ? ' one' : ''}"><div><div class="od-simt" title="계산 오차 — 점선(목표)까지 내려가면 계산 끝, 옅은 점선 = 예상"><b>${cw >= 190 ? '계산 오차' : '오차'}</b> ±${f2(last.noise)}% → ±${f2(tgt)}%</div>${svgA}</div>
    <div><div class="od-simt" title="균일도 — 목표 점선 위면 통과, 세로 막대 = 불확실 범위">${cw >= 190 ? '<b>균일도</b> ' : ''}<i class="od-k od-d1"></i>길이 ${fmtJudge(last.Ulen)}${mk(last.Ulen, tl, last.seLen, last.noise)} <i class="od-k od-d2"></i>폭 ${fmtJudge(last.Uwid)}${mk(last.Uwid, tw, last.seWid, last.noise)}</div>${svgB}</div></div>`;
}
// 그래프 위 설명 한 줄(순수) — 광선 수 / 총광선 · 남은 시간
export function simCaption(H, tgt, obs, state) {
  const last = H[H.length - 1]; if (!last) return '광선 수 0';
  return `광선 ${human(last.ph)} / 총 ${human(state === 'done' ? last.ph : simTotal(last, tgt))}${state === 'running' ? etaText(H, tgt).replace(/ · 필요 광선 ≈ [^·]*/, '') : ''}`;
}
// 시뮬레이션 상태 글(순수) — 카드·아래 상태줄 공용
export function simStateText(state, reason = '', stopped = false, busy = false) {
  if (busy) return '기구 최적화 중 — 일시정지(끝나면 이어서)';
  return { running: '계산 중', paused: stopped ? '중지됨' : '일시정지', done: reason === 'adopted' ? '계산 완료 — 기구 최적화 최종 판정 값' : reason === 'converged' ? '계산 완료 — 노이즈 충분히 작음' : '계산 한도 도달 — 노이즈가 아직 큼', pending: '대기', starting: '장면 준비' }[state] ?? state ?? '';
}
// 오른쪽 맨 위 카드(항상 보임) — onCtl(k) = 실행·일시정지·중지. 광경로 목록은 접는 칸
// bar = 아래 상태줄 칸(2026-11-12 화면 다시 그리기 6단계): 있으면 실행·일시정지·중지 · 진행률 · 광선 수 · 상태 글을 그 줄에 그리고,
//       카드에는 제목과 접는 칸(계산 오차·균일도 추이 / 광경로)만 남김. 접는 칸 열림은 보는 사람별로 기억(uds.m3.simPlots)
export function createSimDash(el, { onCtl = null, bar = null } = {}) {
  let H = [], tgt = 0.02, raf = 0, state = '', obs = null, P = [], names = [], reason = '', stopped = false;
  // names = 부품 이름, nMech = 기구 부품 수(LED STEP 부품 번호는 그 뒤 — 경로에서 뺌)
  let busy = false;   // 기구 최적화 중(점진 계산 일시정지)
  let diag = null;   // 빛 도달 진단(관측면 도달 < 1%)
  let mini = null;   // 광분포 시뮬레이션 창 안의 진행 현황 칸
  let prog;   // 점진 계산의 표시 진행률(되돌아가지 않음)
  function sample(snap, targetNoise, observe, nm = names, nMech = nm.length, adBusy = false, skip = []) {
    prog = snap?.progress; busy = adBusy; tgt = targetNoise ?? tgt; obs = observe ?? obs; state = snap?.state ?? ''; reason = snap?.reason ?? ''; stopped = !!snap?.stopped; names = nm; P = topPaths(snap?.paths, nMech, 3, skip);
    const ph = snap?.photons ?? 0, st = snap?.stats;
    diag = ph >= 50000 ? reachDiag(snap?.ledger, snap?.leak, nm) : null;
    if (!st || st.empty || !ph) { if (!ph) H = []; draw(); return; }
    if (H.length && ph < H[H.length - 1].ph) H = [];   // 장면이 바뀌어 다시 시작
    if (!H.length || ph > H[H.length - 1].ph) H.push({ ph, t: performance.now(), noise: st.relNoise, Ulen: st.Ulen, Uwid: st.Uwid, seLen: st.seLen, seWid: st.seWid });
    if (H.length > 400) H = H.filter((_, i) => i % 2 === 0 || i === H.length - 1);
    draw();
  }
  function draw() { if (raf) return; raf = setTimeout(() => { raf = 0; render(); }, 40); }   // setTimeout: 화면이 숨겨져도(다른 탭) 갱신 — rAF 는 멈춤
  function render() {
    const last = H[H.length - 1], pct = state === 'done' ? 100 : Number.isFinite(prog) ? prog : last ? simPct(last.noise, tgt) : 0, pctT = fmtProg(pct);
    const plot = el.querySelector('.od-simplot'), svg = simPlotSvg(H, tgt, obs, plot?.clientWidth || 300, plot?.clientHeight || 70);
    const row = simCaption(H, tgt, obs, state);
    const sTxt = simStateText(state, reason, stopped, busy);
    // 틀은 한 번만 만들고 칸마다 바뀐 것만 고침 — 계산 중 갱신이 잦아도 단추 클릭·접는 칸이 끊기지 않게
    if (bar && !el.querySelector('.od-simh')) {   // 상태줄 모드: 카드 = 제목 + 접는 칸
      let open = false; try { open = localStorage.getItem('uds.m3.simPlots') === '1'; } catch {}
      el.innerHTML = `<div class="od-h od-simh"><i class="m3-fl" data-s="step">4</i>광분포 시뮬레이션<span class="m3-ad-sp"></span><span class="mut od-simst" data-s="st"></span></div>
        <details class="od-more od-plots"${open ? ' open' : ''}><summary title="계산 오차(목표 점선까지 내려가면 계산 끝) · 길이·폭 균일도가 광선 수에 따라 어떻게 변했는지">계산 오차 · 균일도 추이</summary><div class="od-simbox"><div class="od-simplot" data-s="svg"></div></div></details>
        <div class="od-diag" data-s="diag" hidden></div>
        <details class="od-more"><summary><span data-s="sum">광경로</span></summary><div data-s="paths"></div></details>`;
      el.querySelector('.od-plots').addEventListener('toggle', (e) => { try { localStorage.setItem('uds.m3.simPlots', e.target.open ? '1' : '0'); } catch {} draw(); window.dispatchEvent(new Event('resize')); });
    }
    if (bar && !bar.querySelector('[data-b="pct"]')) {
      bar.innerHTML = `<span class="m3-ctl" data-sim-ctl></span><b data-b="pct"></b><span class="od-bar m3-run-bar" title="계산 오차가 목표에 닿으면 100%"><i data-b="bar"></i></span><span class="m3-run-row" data-b="row"></span><span class="m3-run-st" data-b="st"></span>`;
    }
    if (!el.querySelector('.od-simh')) {
      el.innerHTML = `<div class="od-h od-simh"><i class="m3-fl" data-s="step">4</i>광분포 시뮬레이션<span class="m3-ad-sp"></span>${onCtl ? '<span class="m3-ctl" data-sim-ctl></span>' : ''}</div>
        <div class="od-pct"><b data-s="pct"></b><div class="od-bar od-bar-big" title="계산 오차가 목표에 닿으면 100%"><i data-s="bar"></i></div><span class="od-simcap od-capr" data-s="row"></span><span class="mut od-simst" data-s="st"></span></div>
        <div class="od-simbox"><div class="od-simplot" data-s="svg"></div></div><div class="od-diag" data-s="diag" hidden></div>
        <details class="od-more"><summary><span data-s="sum">광경로</span></summary><div data-s="paths"></div></details>`;
    }
    const set = (k, html) => { const n = el.querySelector(`[data-s="${k}"]`); if (n && n.innerHTML !== html) n.innerHTML = html; };
    set('st', esc(sTxt));
    { const n = el.querySelector('[data-s="st"]'); if (n) n.title = n.textContent; }   // 좁은 칸에서 … 로 잘려도 전체 문구를 볼 수 있게
    setStepMark(el.querySelector('[data-s="step"]'), 4, state === 'done');
    setCtl((bar ?? el).querySelector('[data-sim-ctl]'), simCtl({ state, stopped }, busy), (k) => onCtl?.(k));
    if (bar) {
      const B = (k) => bar.querySelector(`[data-b="${k}"]`), bt = (k, t) => { const n = B(k); if (n && n.textContent !== t) n.textContent = t; };
      bt('pct', `${pctT}%`); B('bar').style.width = `${pctT}%`; bt('row', row); bt('st', sTxt);
      const sn = B('st'); sn.title = sTxt; sn.className = `m3-run-st ${state === 'done' ? (reason === 'converged' || reason === 'adopted' ? 'ok' : 'warn') : ''}`;
    } else { set('pct', `${pctT}%`); el.querySelector('[data-s="bar"]').style.width = `${pctT}%`; set('row', row); }
    const dg = el.querySelector('[data-s="diag"]'); if (dg) { dg.hidden = !diag; set('diag', diag?.html ?? ''); }
    set('svg', svg);
    if (mini) {
      const pl = mini.querySelector('.od-simplot'), w = Math.max(240, pl?.clientWidth || mini.clientWidth), ph = pl?.clientHeight || 130;   // 칸 크기로 그림 — 그림은 칸을 밀지 않음(.od-sim2 절대 위치)
      mini.innerHTML = `<div class="od-pct"><b>${pctT}%</b><div class="od-bar od-bar-big"><i style="width:${pctT}%"></i></div><span class="od-simcap od-capr">${row}</span></div><div class="od-simplot">${simPlotSvg(H, tgt, obs, w, ph)}</div>`;   // 광선 수 = 진행 막대 오른쪽(그래프 위 줄을 비워 그래프를 크게, 2026-11-08)
    }
    // 접힌 줄에는 주 광경로 한 줄 요약, 펼치면 광경로 목록
    set('sum', P.length ? `광경로 <span class="mut">${(P[0].share * 100).toFixed(0)}% ${esc(pathText(P[0], names))}</span>` : '광경로');
    set('paths', P.length ? `<div class="od-paths">${P.map((p) => `<div class="od-path" title="${esc(pathText(p, names))}"><span class="od-pbar"><i style="width:${(p.share * 100).toFixed(0)}%"></i></span><b>${(p.share * 100).toFixed(0)}%</b> ${esc(pathText(p, names))}</div>`).join('')}</div>` : '');
  }
  render();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => draw()).observe(el);   // 칸 크기가 바뀌면 그래프를 그 크기로
  // 창 크기가 바뀌면 끝난 계산도 그 크기로 다시 그림
  const miniRO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => draw()) : null;
  return { sample, paths: () => P, attach: (node) => { miniRO?.disconnect(); mini = node; if (node) miniRO?.observe(node); draw(); } };
}
