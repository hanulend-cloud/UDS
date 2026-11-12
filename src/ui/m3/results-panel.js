import { shapeLayout } from './map-shape.js';
import { requiredFlux, fmtProg, needText, needShort } from './progressive.js';
import { mountSplit, mountHeightHandle } from './pane-split.js';
import { clampRect, fitRect, dragBy, raiseWin, mountResizers, COLLAPSED_W } from './monitor.js';
import { simPct } from './opt-dash.js';
import { simCtl, setCtl, setStepMark } from './run-ctl.js';
import { showCtxMenu } from './feature-tree.js';
// 결과 패널 — spec 2026-10-15 m3-cad-ui §2(시안 m3-ui-mockup 오른쪽):
// ① 2D 광량 분포(관측면 펼침 s×w) + 평균 광량(목표 대비)·광 효율 ② 길이 1D 프로파일(목표선) + 길이 균일도 ③ 폭 1D 프로파일(최저 창) + 폭 균일도.
// update({ snap(progressive snapshot), observe(spec.mech3d.observe), message(안내 | ''), leds?: [{s, w}](LED 위치 — 프로파일 아래 표시) })
import { windowProfile, uVerdict, uBand, fmtJudge, fmtTg } from '../../engine/mech3d/tally.js';
import { ramp, NO_DATA } from './colormap.js';
import { fullView, zoomAt, panBy, snapRect } from './map-zoom.js';
import { regionStats } from '../../engine/mech3d/tally.js';

export const DEFAULT_GUIDE = '관측면을 지정하면 결과가 여기에 표시됩니다.';
// 표시 반올림은 판정과 엇갈리지 않게 한다: U·광량(클수록 좋음)은 내림, 미달 폭은 최소 한 자리(0.01 · 1 cd/m²)
const fl1000 = (v) => Math.floor(v * 1000 + 1e-9);   // 0.1% 단위 내림 — 판정은 목표(1% 단위)와 견주므로 전과 같음
export const fmtU = fmtJudge;   // 균일도 = % 소수 한 자리(2026-11-08)
const finiteMax = (a) => { let m = -Infinity; for (const v of a) if (Number.isFinite(v) && v > m) m = v; return m; };
// 판정도 표시된(내림) 값끼리 비교한다 — 화면에 0.80 / 목표 0.80 인데 "미달"이 뜨는 일이 없게
export function judgeText(v, tg, se = null, relNoise = null) {
  if (!Number.isFinite(v)) return { cls: '', text: `목표 ${fmtTg(Math.floor(tg * 100 + 1e-9) / 100)}` };
  if (relNoise > 0.05) return { cls: 'busy', text: `목표 ${fmtTg(Math.floor(tg * 100 + 1e-9) / 100)} · 노이즈 큼 — 판정 보류(계산 중)` };   // 계산 초반(광선 수천 개) 값은 크게 흔들림 — 빨간 미달로 보이지 않게(2026-11-07)
  if (uVerdict(v, tg, se, relNoise) === 'near') return { cls: 'near', text: `목표 ${fmtTg(Math.floor(tg * 100 + 1e-9) / 100)} · 근처 (오차 ±${(uBand(v, se, relNoise) * 100).toFixed(1)}%p)` };
  const ok = Math.floor(v * 100 + 1e-9) >= Math.floor(tg * 100 + 1e-9), gap = Math.max(1, Math.floor(tg * 100 + 1e-9) * 10 - fl1000(v));   // 판정 규칙은 그대로(1% 단위 내림 비교) · 미달 폭은 0.1%p
  return { cls: ok ? 'ok' : 'bad', text: `목표 ${fmtTg(Math.floor(tg * 100 + 1e-9) / 100)} · ${ok ? '합격' : `미달 −${(gap / 10).toFixed(1)}%p`}` };
}
export { needText } from './progressive.js';
// 평균 광량 카드: 광속이 있으면 cd/m²(목표 대비), 없으면 상대값(길이 프로파일 평균/최대)
// 광효율 → 계산 부담(순수, 표시 전용, 2026-11-12) — 관측면 원뿔에 닿는 광선이 적을수록 같은 노이즈에 광선이 더 필요(대략 광효율에 반비례).
// 5% 이상 = 표시 없음 · 1~5% = 노랑 '계산 느림' · 1% 미만 = 빨강 '계산 매우 느림'(글은 짧게, 2026-11-12 사용자 요청). 계산 중이면 남은 시간(경과 × 남은 %/진행 %). 자세한 숫자는 툴팁
export const EFF_HEAVY = 0.05, EFF_VERY = 0.01;
export function effLoad(eff, snap, elapsedSec) {
  if (!Number.isFinite(eff) || eff >= EFF_HEAVY) return { text: '', cls: '', title: '' };
  const cls = eff < EFF_VERY ? 'bad' : 'near', pct = snap?.progress ?? 0;
  const left = snap?.state === 'running' && pct >= 1 && pct < 100 && elapsedSec > 0 ? elapsedSec * (100 - pct) / pct : null;
  const tm = left == null ? '' : ` · 남은 ${Math.max(1, Math.round(left / 60))}분`;
  const rn = snap?.stats?.relNoise, goal = snap?.targetNoise, need = snap?.photons > 0 && rn > 0 && goal > 0 ? snap.photons * (rn / goal) ** 2 : null;
  const big = (n) => (n >= 1e8 ? `${(n / 1e8).toFixed(1)}억` : `${Math.round(n / 1e4).toLocaleString()}만`);
  const title = `광선 1만 개 중 ${Math.round(eff * 1e4)}개만 쓰임${need ? ` · 목표까지 약 ${big(need)} 광선` : ''}`;
  return { text: `${cls === 'bad' ? '계산 매우 느림' : '계산 느림'}${tm}`, cls, title };
}
// 선택 영역 비교 표(순수, 2026-11-12) — 전체 | 선택 영역. 값 = fmtJudge(0.1% 내림), 목표 대비 색, 평균 = 전체 평균 대비. 영역 없음 = ''
const regCls = (v, t) => (Number.isFinite(v) && Number.isFinite(t) ? (v + 1e-9 >= t ? 'ok' : 'bad') : '');
const regAvg = (r) => (Number.isFinite(r) ? `${(Math.floor(r * 1000 + 1e-9) / 10).toFixed(1)}%` : '–');
export function regionTableHtml(st, rs, O) {
  if (!rs || !st) return '';
  const td = (v, t) => `<td class="${regCls(v, t)}">${fmtJudge(v)}</td>`, [s0, s1, w0, w1] = rs.mm, n = (x) => +x.toFixed(1);
  return `<table class="m3-reg"><tr><th></th><th>전체</th><th>선택 영역 (${n(s1 - s0)}×${n(w1 - w0)} mm)</th></tr>`
    + `<tr><th>길이</th>${td(st.Ulen, O.targetLen)}${td(rs.Ulen, O.targetLen)}</tr>`
    + `<tr><th>폭</th>${td(st.Uwid, O.targetWid)}${td(rs.Uwid, O.targetWid)}</tr>`
    + `<tr><th>평균</th><td>100%</td><td>${regAvg(rs.meanRatio)}</td></tr></table>`;
}
export function lumCard(st, ph, targetLum) {
  if (ph?.lum != null && Number.isFinite(ph.lum)) {
    const ratio = targetLum > 0 ? ph.lum / targetLum : null, li = Math.floor(ph.lum + 1e-9), ti = Math.floor(targetLum + 1e-9), pass = ratio == null ? null : li >= ti;
    return { value: `${li} cd/m²`, sub: ratio == null ? '목표 없음' : `목표 ${ti} cd/m² · ${pass ? '합격' : `미달 −${Math.max(1, ti - li)}`}`, ratio, pass };
  }
  const p = Array.from(st?.profile ?? []).filter(Number.isFinite), mx = finiteMax(p), mean = p.reduce((a, b) => a + b, 0) / p.length;
  if (!p.length || !(mx > 0)) return { value: '–', sub: '최대 대비(LED 광속 입력 시 cd/m²)', ratio: null, pass: null };
  return { value: `${((mean / mx) * 100).toFixed(0)}%`, sub: '최대 대비(LED 광속 입력 시 cd/m²)', ratio: null, pass: null };
}

// 1D 곡선 표시 다듬기(순수, 2026-11-02) — 칸이 많은 방향의 들쭉날쭉한 노이즈만 줄임. 판정·최저점·마우스 값·CSV 는 원자료 그대로.
// 예전 가우스 평활은 LED 리플 높이를 깎아 그림이 CSV 와 달랐음(76~100% → 81~96%, 그래서 뺐음) → 봉우리 높이를 지키는 Savitzky-Golay(2차)로, 리플을 5% 넘게 깎지 않는 창만
export const SMOOTH_MIN_CELLS = 40, RIPPLE_KEEP = 0.95, SMOOTH_MAX_HALF = 16;
const sgCoef = (m, j) => (3 * (3 * m * m + 3 * m - 1 - 5 * j * j)) / ((2 * m + 3) * (2 * m + 1) * (2 * m - 1));   // 창 ±m 칸, 가운데에서 j 칸
// 주기 period(칸)인 물결이 창 ±m 를 지난 뒤 남는 높이 비율
export function sgGain(m, period) { let g = 0; for (let j = -m; j <= m; j++) g += sgCoef(m, j) * Math.cos((2 * Math.PI * j) / period); return g; }
// 창 반폭(칸) — 칸 수 < 40 = 0(다듬지 않음), LED 간격(칸)을 아는 만큼 리플을 지키는 가장 넓은 창, 모르면 5칸. 5칸으로도 리플이 깎이면 0
export function smoothHalf(n, ledCells = null) {
  if (!(n >= SMOOTH_MIN_CELLS)) return 0;
  if (!(ledCells > 0)) return 2;
  let best = 0;
  for (let m = 2; m <= SMOOTH_MAX_HALF; m++) if (sgGain(m, ledCells) >= RIPPLE_KEEP) best = m;
  return best;
}
// 다듬은 곡선 — NaN 은 그대로(끊김). 끝·끊김 가까이는 창을 줄이고, 양옆 2칸도 안 되면 원자료 그대로
export function smoothCurve(ys, m) {
  const n = ys.length, out = Array.from(ys);
  if (!(m >= 2)) return out;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(ys[i])) continue;
    let h = 0;
    while (h < m && i - h - 1 >= 0 && i + h + 1 < n && Number.isFinite(ys[i - h - 1]) && Number.isFinite(ys[i + h + 1])) h++;
    if (h < 2) continue;
    let v = 0; for (let j = -h; j <= h; j++) v += sgCoef(h, j) * ys[i + j];
    out[i] = v;
  }
  return out;
}
// LED 간격(칸) — 가장 좁은 간격 기준(끝 압축 배치의 리플도 지키게). 같은 s(2열)는 한 번만
export function ledGapCells(leds, dx) {
  const s = [...new Set((leds ?? []).filter(Number.isFinite))].sort((a, b) => a - b); let g = Infinity;
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > dx / 2) g = Math.min(g, s[i] - s[i - 1]);
  return Number.isFinite(g) && dx > 0 ? g / dx : null;
}

// 256단계 색 표(RGB, 0~255) — colormap.js 의 ramp 에서 한 번만 만든다
let LUT = null;
export function buildLut() {
  const t = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) { const c = ramp(i / 255); t[3 * i] = Math.round(c[0] * 255); t[3 * i + 1] = Math.round(c[1] * 255); t[3 * i + 2] = Math.round(c[2] * 255); }
  return t;
}
export const NO_DATA_RGB = NO_DATA.map((v) => Math.round(v * 255));
const lutIndex = (t) => Math.max(0, Math.min(255, Math.round(t * 255)));

// 1D 프로파일(v2 평판 화면 수준) — 세로 = 최대 대비 %(최저·목표 아래까지 자동 확대, 10% 격자), 가로 = mm 눈금 격자,
// 목표 하한(빨간 점선 + 값), LED 위치(아래 노란 삼각형), 최저점 표시(값·위치), 마우스 위치 읽기(hover = 칸 번호).
// curves = [{ ys(0~1 원자료, NaN = 끊김), draw?(화면에 그리는 다듬은 곡선), color, dash?, name, band?(노이즈 띠) }] — 첫 곡선이 판정 대상(최저점 표시). 모든 치수는 dpr 배
const niceStep = (span, want) => { const raw = span / want, p = 10 ** Math.floor(Math.log10(raw)); for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p; return 10 * p; };
// 세로 범위(%): 최저·목표보다 5% 아래를 10% 단위로 내림, 위 = 102 — 순수
export function plotRange(curves, tg) {
  let mn = 100;
  for (const c of curves) for (const v of c.ys) if (Number.isFinite(v)) mn = Math.min(mn, v * 100);
  if (Number.isFinite(tg)) mn = Math.min(mn, tg * 100);
  return { y0: Math.max(0, Math.floor((mn - 5) / 10) * 10), y1: 102 };
}
const PL = 38, PR = 8;
function drawPlot(cv, curves, tg, { x0, x1, xl, leds = [], ledsOrig = [] }, dpr = 1, hover = null) {
  cv._plot = { curves, tg, opt: { x0, x1, xl, leds, ledsOrig }, dpr };
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, pl = PL * dpr, pb = 30 * dpr, pt = 16 * dpr, pr = PR * dpr;
  const { y0, y1 } = plotRange(curves, tg), PW = W - pl - pr, PH = H - pb - pt;
  const Y = (v) => pt + (1 - (v * 100 - y0) / (y1 - y0)) * PH, XS = (sv) => pl + ((sv - x0) / (x1 - x0 || 1)) * PW;
  x.clearRect(0, 0, W, H);
  x.font = `${10.5 * dpr}px sans-serif`; x.lineWidth = dpr;
  // % 격자·눈금(10% — 범위가 넓으면 20%)
  const ystep = y1 - y0 > 60 ? 20 : 10;
  x.textAlign = 'right'; x.textBaseline = 'middle';
  for (let v = y0; v <= 100; v += ystep) {
    x.strokeStyle = v === 100 ? 'rgba(128,140,160,.55)' : 'rgba(128,140,160,.22)';
    x.beginPath(); x.moveTo(pl, Y(v / 100)); x.lineTo(W - pr, Y(v / 100)); x.stroke();
    x.fillStyle = '#8a93a6'; x.fillText(`${v}%`, pl - 4 * dpr, Y(v / 100));
  }
  // mm 눈금 격자(아래)
  const st = niceStep(x1 - x0 || 1, Math.max(3, Math.round(PW / (70 * dpr))));
  x.textAlign = 'center'; x.textBaseline = 'top';
  for (let v = Math.ceil(x0 / st - 1e-9) * st; v <= x1 + 1e-9; v += st) {
    x.strokeStyle = 'rgba(128,140,160,.18)'; x.beginPath(); x.moveTo(XS(v), pt); x.lineTo(XS(v), pt + PH); x.stroke();
    x.fillStyle = '#8a93a6'; x.fillText(`${+v.toFixed(1)}`, XS(v), pt + PH + 7 * dpr);
  }
  x.textAlign = 'right'; x.fillText(xl, W - pr, pt + PH + 18 * dpr);
  x.strokeStyle = 'rgba(128,140,160,.6)'; x.strokeRect(pl, pt, PW, PH);
  // 원설계 LED 위치(바뀌었을 때만, 아래 빈 회색 삼각형) — 지금 위치와 견주어 변경이 보이게(2026-11-02)
  if (ledsOrig.length) {
    x.strokeStyle = '#7d8798'; x.lineWidth = dpr;
    for (const q of ledsOrig) {
      if (q < x0 - 1e-9 || q > x1 + 1e-9) continue;
      const px = XS(q);
      x.beginPath(); x.moveTo(px, pt + PH); x.lineTo(px - 3.5 * dpr, pt + PH + 6 * dpr); x.lineTo(px + 3.5 * dpr, pt + PH + 6 * dpr); x.closePath(); x.stroke();
    }
    x.fillStyle = '#8a93a6'; x.textAlign = 'left'; x.textBaseline = 'top'; x.fillText('▲ 지금  △ 원설계', pl, pt + PH + 18 * dpr);
  }
  // LED 위치(아래 노란 삼각형)
  x.fillStyle = 'rgba(240,190,40,.95)';
  for (const q of leds) {
    if (q < x0 - 1e-9 || q > x1 + 1e-9) continue;
    const px = XS(q);
    x.beginPath(); x.moveTo(px, pt + PH); x.lineTo(px - 3.5 * dpr, pt + PH + 6 * dpr); x.lineTo(px + 3.5 * dpr, pt + PH + 6 * dpr); x.closePath(); x.fill();
  }
  // 목표 하한
  if (Number.isFinite(tg)) {
    x.strokeStyle = '#d9473a'; x.setLineDash([5 * dpr, 4 * dpr]); x.lineWidth = 1.3 * dpr;
    x.beginPath(); x.moveTo(pl, Y(tg)); x.lineTo(W - pr, Y(tg)); x.stroke(); x.setLineDash([]);
    x.fillStyle = '#d9473a'; x.textAlign = 'left'; x.textBaseline = 'bottom'; x.fillText(`목표 ${(tg * 100).toFixed(0)}%`, pl + 4 * dpr, Y(tg) - 2 * dpr);
  }
  // 곡선(칸 가운데)
  for (const c of curves) {
    const n = c.ys.length, X = (i) => pl + ((i + 0.5) / n) * PW;
    if (c.band > 0) {   // 계산 노이즈 범위(±2σ, 옅은 띠) — 원자료가 이 안에서 흔들리면 노이즈, 띠 밖이면 실제 밝기 차(2026-10-30)
      const k = 2 * c.band, seg = [], ly = c.draw ?? c.ys;
      ly.forEach((v, i) => { if (Number.isFinite(v)) seg.push(i); });
      if (seg.length > 1) {
        x.fillStyle = c.color; x.globalAlpha = 0.13; x.beginPath();
        seg.forEach((i, m) => { const px = X(i), py = Y(Math.min(ly[i] * (1 + k), 1.2)); if (m) x.lineTo(px, py); else x.moveTo(px, py); });
        for (let m = seg.length - 1; m >= 0; m--) { const i = seg[m]; x.lineTo(X(i), Y(ly[i] * (1 - k))); }
        x.closePath(); x.fill(); x.globalAlpha = 1;
      }
    }
    x.strokeStyle = c.color; x.lineWidth = (c.dash ? 1.2 : 1.8) * dpr; x.setLineDash(c.dash ? c.dash.map((d) => d * dpr) : []);
    x.beginPath(); let pen = false;
    const ly = c.draw ?? c.ys, ok = (i) => i >= 0 && i < n && Number.isFinite(ly[i]);
    ly.forEach((v, i) => {
      if (!Number.isFinite(v)) { pen = false; return; }
      if (!pen) { x.moveTo(X(i), Y(v)); pen = true; return; }
      if (!c.draw) { x.lineTo(X(i), Y(v)); return; }
      // 다듬은 곡선 = 점을 지나는 부드러운 선(Catmull-Rom) — 칸이 적어도 꺾임이 안 보이게. 점의 값은 그대로
      const a = i - 1, p0 = ok(a - 1) ? a - 1 : a, p3 = ok(i + 1) ? i + 1 : i;
      x.bezierCurveTo(X(a) + (X(i) - X(p0)) / 6, Y(ly[a]) + (Y(v) - Y(ly[p0])) / 6, X(i) - (X(p3) - X(a)) / 6, Y(v) - (Y(ly[p3]) - Y(ly[a])) / 6, X(i), Y(v));
    });
    x.stroke(); x.setLineDash([]);
  }
  // 최저점(첫 곡선)
  const main = curves[0], mys = main.ys, n = mys.length, Xm = (i) => pl + ((i + 0.5) / n) * PW, at = (i) => x0 + ((i + 0.5) / n) * (x1 - x0);
  let im = -1; mys.forEach((v, i) => { if (Number.isFinite(v) && (im < 0 || v < mys[im])) im = i; });
  if (im >= 0) {   // 최저점 = 원자료(판정과 같은 값)
    x.fillStyle = '#d9473a'; x.beginPath(); x.arc(Xm(im), Y(mys[im]), 3.5 * dpr, 0, 2 * Math.PI); x.fill();
    const t = `최저 ${(mys[im] * 100).toFixed(1)}% @ ${at(im).toFixed(1)} mm`, right = Xm(im) > pl + PW * 0.6;
    x.textAlign = right ? 'right' : 'left'; x.textBaseline = 'top';
    x.fillText(t, Xm(im) + (right ? -6 : 6) * dpr, Math.min(Y(mys[im]) + 4 * dpr, pt + PH - 13 * dpr));
  }
  // 범례(곡선 2개 이상)
  if (curves.length > 1) {
    x.textAlign = 'right'; x.textBaseline = 'top'; let lx = W - pr - 4 * dpr;
    for (const c of [...curves].reverse()) {
      const w = x.measureText(c.name).width;
      x.fillStyle = '#8a93a6'; x.fillText(c.name, lx, 2 * dpr); lx -= w + 6 * dpr;
      x.strokeStyle = c.color; x.lineWidth = 1.5 * dpr; x.setLineDash(c.dash ? c.dash.map((d) => d * dpr) : []);
      x.beginPath(); x.moveTo(lx - 14 * dpr, 8 * dpr); x.lineTo(lx, 8 * dpr); x.stroke(); x.setLineDash([]); lx -= 22 * dpr;
    }
  }
  // 마우스 위치 읽기
  if (hover != null && hover >= 0 && hover < n) {
    const hx = Xm(hover);
    x.strokeStyle = 'rgba(128,140,160,.8)'; x.lineWidth = dpr; x.setLineDash([2 * dpr, 2 * dpr]); x.beginPath(); x.moveTo(hx, pt); x.lineTo(hx, pt + PH); x.stroke(); x.setLineDash([]);
    const lines = [`${xl.split(' ')[0]} = ${at(hover).toFixed(1)} mm`, ...curves.map((c) => `${c.name}: ${Number.isFinite(c.ys[hover]) ? `${(c.ys[hover] * 100).toFixed(1)}%` : '–'}`)];
    const bw = Math.max(...lines.map((l) => x.measureText(l).width)) + 10 * dpr, bh = lines.length * 13 * dpr + 6 * dpr;
    const bx = hx + bw + 8 * dpr > W - pr ? hx - bw - 6 * dpr : hx + 6 * dpr;
    x.fillStyle = 'rgba(20,26,38,.88)'; x.fillRect(bx, pt + 2 * dpr, bw, bh);
    x.fillStyle = '#e6ebf2'; x.textAlign = 'left'; x.textBaseline = 'top'; lines.forEach((l, k) => x.fillText(l, bx + 5 * dpr, pt + 5 * dpr + k * 13 * dpr));
  }
}
// 마우스를 올리면 그 칸의 값을 보여 줌(캔버스마다 한 번)
function wireHover(cv) {
  if (cv._hover) return;
  cv._hover = true;
  const idx = (e) => {
    const P = cv._plot; if (!P) return null;
    const r = cv.getBoundingClientRect(), pl = PL * P.dpr, pr = PR * P.dpr, px = (e.clientX - r.left) * (cv.width / r.width), n = P.curves[0].ys.length;
    const i = Math.floor(((px - pl) / (cv.width - pl - pr)) * n);
    return i >= 0 && i < n ? i : null;
  };
  cv.addEventListener('mousemove', (e) => { const P = cv._plot; if (P) drawPlot(cv, P.curves, P.tg, P.opt, P.dpr, idx(e)); });
  cv.addEventListener('mouseleave', () => { const P = cv._plot; if (P) drawPlot(cv, P.curves, P.tg, P.opt, P.dpr, null); });
  cv.addEventListener('contextmenu', (e) => { if (!cv._plot || !cv._onMenu) return; e.preventDefault(); cv._onMenu(e, cv); });   // 우클릭 = 데이터·이미지 메뉴
}
// 2D 광량 분포(v2 평판 화면 수준) — 색 = 최대 대비 %(오른쪽 색 막대 눈금), s·w mm 눈금, LED 위치(노란 점),
// 최저점 표시(값·위치), 마우스 위치 읽기. equal = 가로세로 같은 축척(실제 비율, 확대 창에서 선택). 모든 치수는 dpr 배
// v = { G, map, leds:[{s,w}] } · cv._mapv 에 저장 → 마우스 읽기·확대 창이 다시 그림
const MAP_PAD = { l: 40, r: 64, t: 8, b: 30 }, EXAG_MAX = 8, PIN_COLOR = '#ff8a1f';
// 최저 위치 점 반지름(순수) — 그림의 짧은 변에 비례, 2~5 px
export const minDotR = (w, h, dpr = 1) => Math.max(2 * dpr, Math.min(5 * dpr, Math.min(w, h) * 0.03));
// 지도 배치(순수) — 한 줄(가로 = 길이 s, 1D 프로파일과 같은 가로축). 길고 좁은 관측면(예: 440 × 5.5 mm)은 상자 높이를 다 쓰면
// 폭이 수십 배 과장되므로 폭 확대를 EXAG_MAX 배까지만(띠 높이 최소 28 px) — 띠는 상자 가운데. (예전엔 여러 줄로 접었지만 1D 프로파일과 맞춰 보기 어려움)
// equal = 가로세로 같은 축척(확대 창에서 선택) — 줄 안에서 정확히 1:1.
// 반환 { ox, oy, PW, rowH, pitch, K, segL, w0, w1, L, xy(s, w) → [x, y], at(x, y) → [s, w] | null, exag(폭 과장 배수) }
// view(선택, 2026-11-12) = 보이는 범위 { s0, s1, w0, w1 } mm(큰 창 확대) — 상자(ox·oy·PW·rowH)는 전체 보기 그대로, 안의 mm 범위만 바꿈
export function mapLayout(G, W, H, dpr = 1, equal = false, view = null) {
  const w0 = G.w0, w1 = G.w0 + G.nw * G.cell, wd = w1 - w0 || 1, L = G.L;
  let ox = MAP_PAD.l * dpr, oy = MAP_PAD.t * dpr, PW = W - (MAP_PAD.l + MAP_PAD.r) * dpr;
  const PH = H - (MAP_PAD.t + MAP_PAD.b) * dpr, gap = 16 * dpr;
  const K = 1;
  const segL = L / K;
  let rowH = Math.min(PH, Math.max(28 * dpr, wd * (PW / L) * EXAG_MAX));
  if (!equal) oy += (PH - rowH) / 2;
  if (equal) { const sc = Math.min(PW / segL, rowH / wd), pw = segL * sc, rh = wd * sc; ox += (PW - pw) / 2; oy += K > 1 ? 0 : (PH - rh) / 2; PW = pw; rowH = rh; }
  const pitch = rowH + (K > 1 ? gap : 0);
  const rowOf = (s) => Math.max(0, Math.min(K - 1, Math.floor(s / segL - 1e-9)));
  const xy = (s, w) => { const r = rowOf(s); return [ox + ((s - r * segL) / segL) * PW, oy + r * pitch + ((w1 - w) / wd) * rowH]; };
  const at = (px, py) => {
    const r = Math.floor((py - oy) / pitch), y = py - oy - r * pitch;
    if (r < 0 || r >= K || y < 0 || y > rowH || px < ox || px > ox + PW) return null;
    return [r * segL + ((px - ox) / PW) * segL, w1 - (y / rowH) * wd];
  };
  if (view) {
    const vs = view.s1 - view.s0 || 1, vw = view.w1 - view.w0 || 1;
    const vxy = (s, w) => [ox + ((s - view.s0) / vs) * PW, oy + ((view.w1 - w) / vw) * rowH];
    const vat = (px, py) => (px < ox || px > ox + PW || py < oy || py > oy + rowH ? null : [view.s0 + ((px - ox) / PW) * vs, view.w1 - ((py - oy) / rowH) * vw]);
    return { ox, oy, PW, rowH, pitch, K, segL: vs, sA: view.s0, w0: view.w0, w1: view.w1, L, xy: vxy, at: vat, exag: rowH / vw / (PW / vs), view };
  }
  return { ox, oy, PW, rowH, pitch, K, segL, sA: 0, w0, w1, L, xy, at, exag: rowH / wd / (PW / segL) };
}
// 1D 가로축을 값이 있는 칸 범위로 자름(모든 곡선 중 처음·마지막 유한 칸) — 관측면 밖(NaN) 칸 때문에 폭 프로파일 양끝이 비던 것(2026-10-29). 값이 없으면 그대로 — 순수
export function cropFinite(curves, x0, x1) {
  const n = curves[0]?.ys.length ?? 0; let a = n, b = -1;
  for (const c of curves) c.ys.forEach((v, k) => { if (Number.isFinite(v)) { a = Math.min(a, k); b = Math.max(b, k); } });
  if (b < 0 || (a === 0 && b === n - 1)) return { curves, x0, x1 };
  const dx = (x1 - x0) / n;
  return { curves: curves.map((c) => ({ ...c, ys: Array.from(c.ys).slice(a, b + 1) })), x0: x0 + a * dx, x1: x0 + (b + 1) * dx };
}
// 표 문자열(탭 구분) → Excel 용 CSV(쉼표 구분, 줄바꿈 CRLF, 쉼표·큰따옴표가 든 칸은 따옴표로 묶음) — 순수. BOM 은 저장할 때 붙임(더블클릭으로 한글·열이 바로 열림, 2026-11-02)
export function toCsv(text) {
  const q = (c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return text.split('\n').map((l) => l.split('\t').map(q).join(',')).join('\r\n');
}
// 2D 분포 표(탭 구분, 저장 때 toCsv) — 머리말(#) + 첫 줄 s 칸 중심(mm), 다음 줄부터 w 칸 중심(위 = +w 부터)과 값(최대 대비 %, 관측면 밖 = 빈칸) — 순수
export function mapTxt(G, map, { name = '', quality = '', photons = null, noise = null } = {}) {
  let mx = 0; for (let k = 0; k < map.length; k++) if (G.valid[k] && map[k] > mx) mx = map[k];
  const V = mapViewG(G);   // 그림과 같은 w 범위(관측면 밖 빈 줄 뺌)
  const f = (v) => String(+v.toFixed(3)), head = [
    '# UDS 2D 광량 분포 (관측면 전체 · 가장자리 포함 원자료) — 값 = 최대 대비 % · 빈칸 = 관측면 밖',
    `# ${name ? `이름 ${name} · ` : ''}길이 s 0–${f(G.L)} mm · 폭 w ${f(V.w0)}–${f(V.w0 + V.nw * G.cell)} mm · 칸 ${G.ns} × ${V.nw} (${f(G.ds)} × ${f(G.cell)} mm)${quality ? ` · 화질 ${quality}` : ''}${photons ? ` · 광선 ${photons}` : ''}${Number.isFinite(noise) ? ` · 오차 ±${(noise * 100).toFixed(2)}%` : ''}`,
    ['w\\s(mm)', ...Array.from({ length: G.ns }, (_, i) => f((i + 0.5) * G.ds))].join('\t'),
  ];
  for (let j = V.jB; j >= V.jA; j--) {
    const row = [f(G.w0 + (j + 0.5) * G.cell)];
    for (let i = 0; i < G.ns; i++) { const k = i * G.nw + j; row.push(G.valid[k] && mx > 0 ? ((map[k] / mx) * 100).toFixed(2) : ''); }
    head.push(row.join('\t'));
  }
  return head.join('\n') + '\n';
}
// 선택 선 TXT(순수, 2026-10-30) — 2D 에서 고른 점을 지나는 길이 방향(그 w 줄)·폭 방향(그 s 칸) 원자료. 평활 없음,
// 값 = 2D 최대 대비 %(2D TXT 와 같은 기준이라 서로 맞음), 관측면 밖 = 빈칸 · 폭 방향은 2D 그림 범위(빈 줄 뺌)
export function lineTxt(G, map, pin, { name = '', quality = '', photons = null } = {}) {
  const i = Math.max(0, Math.min(G.ns - 1, Math.floor(pin.s / G.ds))), j = Math.max(0, Math.min(G.nw - 1, Math.floor((pin.w - G.w0) / G.cell)));
  let mx = 0; for (let k = 0; k < map.length; k++) if (G.valid[k] && map[k] > mx) mx = map[k];
  const f = (v) => String(+v.toFixed(3)), val = (k) => (G.valid[k] && mx > 0 ? ((map[k] / mx) * 100).toFixed(2) : ''), V = mapViewG(G);
  const sC = (i + 0.5) * G.ds, wC = G.w0 + (j + 0.5) * G.cell;
  const out = ['# UDS 선택 선 원자료 — 평활 없음 · 값 = 2D 최대 대비 %(2D CSV 와 같은 기준) · 빈칸 = 관측면 밖',
    `# ${name ? `이름 ${name} · ` : ''}선택 점 s ${f(sC)} mm · w ${f(wC)} mm (칸 ${f(G.ds)} × ${f(G.cell)} mm)${quality ? ` · 화질 ${quality}` : ''}${photons ? ` · 광선 ${photons}` : ''}`,
    '', `# 길이 방향 — w = ${f(wC)} mm 줄`, 's (mm)\t값 (%)'];
  for (let a = 0; a < G.ns; a++) out.push(`${f((a + 0.5) * G.ds)}\t${val(a * G.nw + j)}`);
  out.push('', `# 폭 방향 — s = ${f(sC)} mm 칸 (위 = +w)`, 'w (mm)\t값 (%)');
  for (let b = V.jB; b >= V.jA; b--) out.push(`${f(G.w0 + (b + 0.5) * G.cell)}\t${val(i * G.nw + b)}`);
  return out.join('\n') + '\n';
}
// 1D 프로파일 TXT(탭 구분) — 그림마다 '# 제목' + 머리줄(x 이름, 곡선 이름) + x 칸 중심과 곡선별 값(최대 대비 %, 원자료 raw 우선, 값 없음 = 빈칸).
// list = [{ title, v: { curves, opt:{ x0, x1, xl } } | null }] — v 없는 그림은 건너뜀 — 순수
export function profileTxt(list) {
  const f = (v) => String(+v.toFixed(3)), out = ['# UDS 1D 프로파일 — 값 = 최대 대비 %(원자료 · 화면 곡선은 노이즈만 다듬어 그림) · 빈칸 = 값 없음'];
  for (const { title, v } of list) {
    if (!v?.curves?.length) continue;
    const { x0, x1, xl } = v.opt, n = v.curves[0].ys.length, dx = (x1 - x0) / n;
    out.push('', `# ${title}`, [xl, ...v.curves.map((c) => c.name)].join('\t'));
    for (let i = 0; i < n; i++) out.push([f(x0 + (i + 0.5) * dx), ...v.curves.map((c) => { const y = c.ys[i]; return Number.isFinite(y) ? (y * 100).toFixed(2) : ''; })].join('\t'));
  }
  return out.join('\n') + '\n';
}
// 2D 에서 지정한 칸 (i, j) 을 지나는 1D 곡선 — along = 길이 방향(w 칸 j 고정), across = 폭 방향(s 칸 i 고정, 원형 라인이면 반경 방향).
// 각 곡선은 자기 최대 = 1, 관측면 밖 칸 = NaN(끊김) — 순수
export function pointProfiles(G, map, i, j) {
  const along = new Float64Array(G.ns), across = new Float64Array(G.nw);
  for (let a = 0; a < G.ns; a++) { const k = a * G.nw + j; along[a] = G.valid[k] ? map[k] : NaN; }
  for (let b = 0; b < G.nw; b++) { const k = i * G.nw + b; across[b] = G.valid[k] ? map[k] : NaN; }
  for (const c of [along, across]) { const m = finiteMax(c); for (let k = 0; k < c.length; k++) c[k] = m > 0 ? c[k] / m : NaN; }
  return { along, across };
}
// 2D 표시 폭 범위 = 관측면 안 칸이 하나라도 있는 w 줄(jA~jB)만 — 위아래 빈(회색) 띠를 잘라 1D 폭 프로파일과 같은 범위(2026-10-29)
// 격자 칸 (i, j) 중심의 (s, w) mm — j 는 전체 격자 번호라 G.w0 기준(표시 범위 시작점이 아님) — 순수
export const mapCellSW = (G, i, j) => [(i + 0.5) * G.ds, G.w0 + (j + 0.5) * G.cell];
// 2D 표시·TXT 격자 = 면 전체(가장자리 제외 없음, 2026-11-02). 판정·1D 폭 평균은 G 그대로
const FULLG = new WeakMap();
export function fullG(G) { if (!G.validAll) return G; if (!FULLG.has(G)) FULLG.set(G, { ...G, valid: G.validAll, area: G.areaAll }); return FULLG.get(G); }
// 큰 창 2D 기본 = 실제 비율 — 단, 띠가 납작해지는 긴 면(폭/길이 < 6%, 예: 400×4.4 mm 는 높이 11 px)은 폭을 늘려 보여 줌 — 순수
export const defaultEqual = (G) => { if (!G) return true; const V = mapViewG(G); return (V.nw * V.cell) / G.L >= 0.06; };
const VIEWG = new WeakMap();
export function mapViewG(G) {
  if (VIEWG.has(G)) return VIEWG.get(G);
  let jA = G.nw, jB = -1;
  for (let i = 0; i < G.ns; i++) for (let j = 0; j < G.nw; j++) if (G.valid[i * G.nw + j]) { if (j < jA) jA = j; if (j > jB) jB = j; }
  const v = jB < 0 ? { ...G, jA: 0, jB: G.nw - 1 } : { ...G, w0: G.w0 + jA * G.cell, nw: jB - jA + 1, jA, jB };
  VIEWG.set(G, v); return v;
}
function mapBox(cv, G, dpr, equal) { return mapLayout(mapViewG(G), cv.width, cv.height, dpr, equal, cv._view ?? null); }   // cv._view = 큰 창 확대 범위(mm)
// 색 막대(0~100%) — 펼친 띠·모양 그림 공용
function colorBar(x, W, H, dpr) {
  const cTop = MAP_PAD.t * dpr, PH = H - (MAP_PAD.t + MAP_PAD.b) * dpr, bx = W - (MAP_PAD.r - 12) * dpr, bw = 11 * dpr;
  for (let i = 0; i < PH; i++) { const l = lutIndex(1 - i / PH) * 3; x.fillStyle = `rgb(${LUT[l]},${LUT[l + 1]},${LUT[l + 2]})`; x.fillRect(bx, cTop + i, bw, 1.5); }
  x.strokeStyle = 'rgba(128,140,160,.7)'; x.strokeRect(bx, cTop, bw, PH);
  x.fillStyle = '#8a93a6'; x.textAlign = 'left'; x.textBaseline = 'middle';
  for (let p = 0; p <= 100; p += 20) x.fillText(`${p}%`, bx + bw + 4 * dpr, cTop + (1 - p / 100) * PH);
}
// 모양대로 그리기(2026-11-06): mode 'ring' = 링(두께 확대) · 'real' = 관측면 실제 모양(실제 비율). 칸 값은 그대로 — map-shape.js
function drawShapeMap(cv, v, dpr, hover, mode) {
  const { G, map } = v, x = cv.getContext('2d'), W = cv.width, H = cv.height, VG = mapViewG(G), rows = [VG.jA ?? 0, VG.jB ?? G.nw - 1];
  const box = { x: 14 * dpr, y: MAP_PAD.t * dpr, w: W - (14 + MAP_PAD.r) * dpr, h: H - (MAP_PAD.t + 22) * dpr };
  const Ly = shapeLayout(G, v.shape, box, rows, mode);
  cv._mapv.at = (px, py) => Ly.at(px, py);
  x.clearRect(0, 0, W, H);
  let mx = 0, kMin = -1; for (let k = 0; k < map.length; k++) if (G.valid[k] && map[k] > mx) mx = map[k];
  x.lineWidth = 0.8 * dpr; x.lineJoin = 'round';
  for (let i = 0; i < G.ns; i++) for (let j = rows[0]; j <= rows[1]; j++) {
    const k = i * G.nw + j;
    if (!G.valid[k] || !(mx > 0)) continue;
    if (kMin < 0 || map[k] < map[kMin]) kMin = k;
    const l = lutIndex(map[k] / mx) * 3, c = `rgb(${LUT[l]},${LUT[l + 1]},${LUT[l + 2]})`, q = Ly.quad(i, j);
    x.beginPath(); x.moveTo(q[0][0], q[0][1]); for (let a = 1; a < 4; a++) x.lineTo(q[a][0], q[a][1]); x.closePath();
    x.fillStyle = c; x.fill(); x.strokeStyle = c; x.stroke();   // 같은 색 테두리 = 칸 사이 틈 없앰
  }
  colorBar(x, W, H, dpr);
  x.font = `${10.5 * dpr}px sans-serif`; x.fillStyle = '#8a93a6'; x.textAlign = 'right'; x.textBaseline = 'bottom';
  x.fillText(mode === 'ring' ? '링 · 두께 확대(시작점·방향은 실제와 같음) — [실제 비율] = 실제 모양' : `실제 모양 · 가로 ${Ly.info.mm[0].toFixed(1)} × 세로 ${Ly.info.mm[1].toFixed(1)} mm`, box.x + box.w, H - 3 * dpr);
  if (mode === 'ring') { const [i0x, i0y] = Ly.toPx(0, G.w0 + (rows[0] + rows[1] + 1) / 2 * G.cell); x.beginPath(); x.arc(i0x, i0y, 3 * dpr, 0, 2 * Math.PI); x.fillStyle = '#ffffff'; x.fill(); x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = '#8a93a6'; x.fillText('s 0', i0x + 6 * dpr, i0y); }
  if (kMin >= 0) { const i = Math.floor(kMin / G.nw), j = kMin % G.nw, [cs, cw] = mapCellSW(G, i, j), [px, py] = Ly.toPx(cs, cw); x.beginPath(); x.arc(px, py, minDotR(box.w, box.h, dpr), 0, 2 * Math.PI); x.fillStyle = '#8a8f98'; x.fill(); x.strokeStyle = '#ffffff'; x.lineWidth = dpr; x.stroke(); }
  if (v.pin) { const [px, py] = Ly.toPx(v.pin.s, v.pin.w); x.beginPath(); x.arc(px, py, 4 * dpr, 0, 2 * Math.PI); x.fillStyle = PIN_COLOR; x.fill(); x.strokeStyle = 'rgba(10,14,22,.9)'; x.lineWidth = 1.5 * dpr; x.stroke(); }
  if (hover && mx > 0) {
    const [i, j] = hover, k = i * G.nw + j, [cs, cw] = mapCellSW(G, i, j), val = G.valid[k] ? `${((map[k] / mx) * 100).toFixed(1)}%` : '관측면 밖', q = Ly.quad(i, j);
    x.beginPath(); x.moveTo(q[0][0], q[0][1]); for (let a = 1; a < 4; a++) x.lineTo(q[a][0], q[a][1]); x.closePath(); x.strokeStyle = '#ffffff'; x.lineWidth = 1.5 * dpr; x.stroke();
    const lbl = `s ${cs.toFixed(1)} · w ${cw.toFixed(1)} mm · ${val}`, tw = x.measureText(lbl).width;
    x.fillStyle = 'rgba(20,26,38,.88)'; x.fillRect(box.x, box.y, tw + 8 * dpr, 16 * dpr);
    x.fillStyle = '#e6ebf2'; x.textAlign = 'left'; x.textBaseline = 'top'; x.fillText(lbl, box.x + 4 * dpr, box.y + 2 * dpr);
  }
}
export function drawMap(cv, v, dpr = 1, hover = null, equal = false) {
  cv._mapv = { v, dpr, equal };
  LUT ??= buildLut();
  const mode = equal && v.shape ? 'real' : v.G.closed ? 'ring' : null;   // 링 = 링 모양(두께 확대) · 실제 비율 = 실제 모양(모양 정보가 있을 때)
  if (mode) return drawShapeMap(cv, v, dpr, hover, mode);
  const { G, map } = v, x = cv.getContext('2d'), W = cv.width, H = cv.height, B = mapBox(cv, G, dpr, equal), { ox, oy, PW, rowH, pitch, K, segL, sA, w0, w1, L, xy } = B;
  x.clearRect(0, 0, W, H);
  let mx = 0; for (let k = 0; k < map.length; k++) if (G.valid[k] && map[k] > mx) mx = map[k];
  // 칸 그림(가로 = s, 세로 위 = +w) → 줄마다 잘라 붙임(전체 띠를 K 배 길이로 그리고 그 줄 영역만 보이게)
  const tmp = document.createElement('canvas'); tmp.width = G.ns; tmp.height = G.nw;
  const tx = tmp.getContext('2d'), img = tx.createImageData(G.ns, G.nw), d = img.data, [nr, ng, nb] = NO_DATA_RGB;
  let kMin = -1;
  for (let i = 0; i < G.ns; i++) for (let j = 0; j < G.nw; j++) {
    const k = i * G.nw + j, q = ((G.nw - 1 - j) * G.ns + i) * 4;
    if (G.valid[k] && mx > 0) { const l = lutIndex(map[k] / mx) * 3; d[q] = LUT[l]; d[q + 1] = LUT[l + 1]; d[q + 2] = LUT[l + 2]; if (kMin < 0 || map[k] < map[kMin]) kMin = k; }
    else { d[q] = nr; d[q + 1] = ng; d[q + 2] = nb; }
    d[q + 3] = 255;
  }
  tx.putImageData(img, 0, 0);
  x.imageSmoothingEnabled = !!v.smooth || (PW * K) / G.ns > 6;   // 부드럽게 = 칸 중심 사이 선형 보간(칸 중심 값 = 원자료 그대로), 끄면 칸 그대로(칸이 크게 보일 때만 보간)
  x.font = `${10.5 * dpr}px sans-serif`;
  const ss = niceStep(segL, Math.max(2, Math.round(PW / (70 * dpr))));
  for (let r = 0; r < K; r++) {
    const ry = oy + r * pitch, s0 = sA + r * segL, s1 = s0 + segL;
    const VG = mapViewG(G);   // 빈 줄을 뺀 w 줄만(그림 위 = +w = 큰 j)
    x.save(); x.beginPath(); x.rect(ox, ry, PW, rowH); x.clip();
    if (B.view) { const V = B.view; x.drawImage(tmp, V.s0 / G.ds, G.nw - (V.w1 - G.w0) / G.cell, (V.s1 - V.s0) / G.ds, (V.w1 - V.w0) / G.cell, ox, ry, PW, rowH); }   // 확대 = 보이는 칸 범위만
    else x.drawImage(tmp, 0, G.nw - 1 - VG.jB, G.ns, VG.nw, ox - r * PW, ry, PW * K, rowH);
    x.restore();
    x.strokeStyle = 'rgba(128,140,160,.7)'; x.lineWidth = dpr; x.strokeRect(ox, ry, PW, rowH);
    x.fillStyle = '#8a93a6'; x.textAlign = 'center'; x.textBaseline = 'top';   // s 눈금(줄 아래)
    for (let sv = Math.ceil(s0 / ss - 1e-9) * ss; sv <= s1 + 1e-9; sv += ss) {
      const px = ox + ((sv - s0) / segL) * PW;
      x.strokeStyle = 'rgba(128,140,160,.6)'; x.beginPath(); x.moveTo(px, ry + rowH); x.lineTo(px, ry + rowH + 3 * dpr); x.stroke();
      x.fillText(`${+sv.toFixed(1)}`, px, ry + rowH + 4 * dpr);
    }
  }
  const yEnd = oy + (K - 1) * pitch + rowH;
  x.fillStyle = '#8a93a6'; x.textAlign = 'right'; x.textBaseline = 'top';
  x.fillText(`s (mm)${B.exag > 1.6 ? ` · 폭 ×${B.exag.toFixed(1)} 확대` : ''}`, ox + PW, yEnd + 17 * dpr);
  // w 눈금(첫 줄 왼쪽)
  const ws = niceStep(w1 - w0, Math.max(2, Math.round(rowH / (28 * dpr)))), WY = (w) => oy + ((w1 - w) / (w1 - w0)) * rowH;
  x.textBaseline = 'middle'; x.strokeStyle = 'rgba(128,140,160,.6)';
  for (let w = Math.ceil(w0 / ws - 1e-9) * ws; w <= w1 + 1e-9; w += ws) { x.beginPath(); x.moveTo(ox - 3 * dpr, WY(w)); x.lineTo(ox, WY(w)); x.stroke(); x.fillText(`${+w.toFixed(1)}`, ox - 5 * dpr, WY(w)); }
  x.save(); x.translate(10 * dpr, oy + rowH / 2); x.rotate(-Math.PI / 2); x.textAlign = 'center'; x.fillText('w (mm)', 0, 0); x.restore();
  // 색 막대(0~100%) + 최저 위치
  colorBar(x, W, H, dpr);
  x.save(); x.beginPath(); x.rect(ox, oy, PW, rowH); x.clip();   // 확대 때 상자 밖으로 나간 표시는 자름
  if (kMin >= 0) {   // 최저 위치 = 회색 점만(글씨는 작은 그림을 가림, 2026-11-04) · 크기는 그림에 맞춤
    const i = Math.floor(kMin / G.nw), j = kMin % G.nw, [cs, cw] = mapCellSW(G, i, j), [px, py] = xy(cs, cw);
    x.beginPath(); x.arc(px, py, minDotR(PW, rowH, dpr), 0, 2 * Math.PI); x.fillStyle = '#8a8f98'; x.fill(); x.strokeStyle = '#ffffff'; x.lineWidth = dpr; x.stroke();
  }
  // 지정 점(클릭) — 주황 십자선 + 점: 이 점을 지나는 길이·폭 1D 프로파일이 아래에 함께 나옴
  if (v.pin) {
    const [px, py] = xy(v.pin.s, v.pin.w);
    x.beginPath(); x.moveTo(px, oy); x.lineTo(px, oy + rowH); x.moveTo(ox, py); x.lineTo(ox + PW, py);
    x.strokeStyle = 'rgba(10,14,22,.85)'; x.lineWidth = 3.2 * dpr; x.stroke();   // 어두운 테두리 — 주황·빨강 분포 위에서도 보이게
    x.strokeStyle = PIN_COLOR; x.lineWidth = 1.3 * dpr; x.stroke();
    x.beginPath(); x.arc(px, py, 4 * dpr, 0, 2 * Math.PI); x.fillStyle = PIN_COLOR; x.fill(); x.strokeStyle = 'rgba(10,14,22,.9)'; x.lineWidth = 1.5 * dpr; x.stroke();
  }
  // 선택 영역(2026-11-12) — 주황 사각형(어두운 테두리 위). cv._region = { s0, s1, w0, w1 } mm · cv._drag = 끄는 중 미리보기
  for (const R of [cv._region, cv._drag]) {
    if (!R) continue;
    const [ax, ay] = xy(Math.min(R.s0, R.s1), Math.max(R.w0, R.w1)), [bx, by] = xy(Math.max(R.s0, R.s1), Math.min(R.w0, R.w1));
    x.setLineDash(R === cv._drag ? [5 * dpr, 4 * dpr] : []);
    x.strokeStyle = 'rgba(10,14,22,.85)'; x.lineWidth = 3.5 * dpr; x.strokeRect(ax, ay, bx - ax, by - ay);
    x.strokeStyle = PIN_COLOR; x.lineWidth = 1.6 * dpr; x.strokeRect(ax, ay, bx - ax, by - ay); x.setLineDash([]);
  }
  x.restore();
  // 마우스 위치 읽기(칸 [i, j]) — 그 줄 안에서 십자선
  if (hover && mx > 0) {
    const [i, j] = hover, k = i * G.nw + j, [cs, cw] = mapCellSW(G, i, j), val = G.valid[k] ? `${((map[k] / mx) * 100).toFixed(1)}%` : '관측면 밖';
    const [px, py] = xy(cs, cw), ry = oy + Math.max(0, Math.min(K - 1, Math.floor(cs / segL - 1e-9))) * pitch;
    x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = dpr; x.setLineDash([3 * dpr, 3 * dpr]);
    x.beginPath(); x.moveTo(px, ry); x.lineTo(px, ry + rowH); x.moveTo(ox, py); x.lineTo(ox + PW, py); x.stroke(); x.setLineDash([]);
    const lbl = `s ${cs.toFixed(1)} · w ${cw.toFixed(1)} mm · ${val}`, tw = x.measureText(lbl).width;
    const lx = Math.max(ox + 3 * dpr, px + tw + 14 * dpr > ox + PW ? px - tw - 10 * dpr : px + 6 * dpr);
    x.fillStyle = 'rgba(20,26,38,.88)'; x.fillRect(lx - 3 * dpr, ry + 3 * dpr, tw + 6 * dpr, 15 * dpr);
    x.fillStyle = '#e6ebf2'; x.textAlign = 'left'; x.textBaseline = 'top'; x.fillText(lbl, lx, ry + 5 * dpr);
  }
}
function wireMapHover(cv) {
  if (cv._mhover) return;
  cv._mhover = true;
  const cell = (e) => {
    const M = cv._mapv; if (!M) return null;
    const r = cv.getBoundingClientRect(), px = (e.clientX - r.left) * (cv.width / r.width), py = (e.clientY - r.top) * (cv.height / r.height);
    if (M.at) return M.at(px, py);   // 링·실제 모양 그림
    const b = mapBox(cv, M.v.G, M.dpr, M.equal);
    const sw = b.at(px, py); if (!sw) return null;
    const G = M.v.G, i = Math.floor(sw[0] / G.ds), j = Math.floor((sw[1] - G.w0) / G.cell);
    return i >= 0 && i < G.ns && j >= 0 && j < G.nw ? [i, j] : null;
  };
  cv.addEventListener('mousemove', (e) => { const M = cv._mapv; if (M) drawMap(cv, M.v, M.dpr, cell(e), M.equal); });
  cv.addEventListener('mouseleave', () => { const M = cv._mapv; if (M) drawMap(cv, M.v, M.dpr, null, M.equal); });
  cv.addEventListener('contextmenu', (e) => { if (!cv._mapv || !cv._onMenu) return; e.preventDefault(); cv._onMenu(e, cell(e), cv); });   // 우클릭 = CSV·이미지 메뉴
  cv.addEventListener('click', (e) => { if (cv._noClick) { cv._noClick = false; return; } const M = cv._mapv, c = cell(e); if (M && c) cv._onPin?.(c, M.v.G); else cv._onPinOff?.(); });   // 클릭 = 그 점 프로파일 지정 · 그림 밖 여백 = 해제
}
const clearCanvas = (c) => c.getContext('2d').clearRect(0, 0, c.width, c.height);
const dprNow = () => Math.max(1, globalThis.devicePixelRatio || 1);
// 캔버스를 화면 크기 × DPR 로 맞춘다(가로세로 비는 만들 때의 비 유지). 크기가 바뀌면 true
// 넓은 화면(> 1024px) = 칸 높이에 맞춤(CSS 가 높이를 정함 — 결과 창이 스크롤 없이 한 화면), 좁은 화면 = 가로세로 비
function sizeCanvas(cv, ratio) {
  const cw = cv.clientWidth, ch = cv.clientHeight, fit = (globalThis.innerWidth ?? 0) > 1024 && ch > 40;
  if (!cw) return false;
  const W = Math.round(cw * dprNow()), H = fit ? Math.round(ch * dprNow()) : Math.round(W / ratio);
  if (cv.width === W && cv.height === H) return false;
  cv.width = W; cv.height = H;
  return true;
}

const QUALITY_OPTS = [['low', '저화질 1.5 mm'], ['mid', '중화질 1 mm'], ['high', '고화질 0.5 mm']];   // 정사각 칸 크기(2026-10-30) — 작을수록 계산 오래(중 ≈2배 · 고 ≈4배 광선)
// 큰 창 위치·크기(보는 사람별) — 처음 = 메뉴 아래 넓게
const BIG_KEY = 'uds.m3.bigWin', BIG_MIN_W = COLLAPSED_W;
function bigRectLoad() {
  let r = null; try { r = JSON.parse(localStorage.getItem(BIG_KEY)); } catch { r = null; }
  if (Number.isFinite(r?.x) && Number.isFinite(r?.y) && r.w >= 480 && r.h >= 360) return r;
  const w = Math.round(Math.min(1600, innerWidth * 0.94));
  return { x: Math.round((innerWidth - w) / 2), y: 56, w, h: Math.max(360, innerHeight - 72) };
}
function bigRectSave(r) { try { localStorage.setItem(BIG_KEY, JSON.stringify({ x: r.x, y: r.y, w: r.w, h: r.h })); } catch {} }
let PIN_OUTSIDE = null, pinOutsideOn = false;   // 패널을 다시 만들어도 문서 처리는 하나
// 2D 우클릭 메뉴 항목(순수) — hasPin = 선택 선 있음, onCell = 분포 위에서 누름
export const mapMenuItems = (hasPin, onCell) => [
  { k: 'mapCsv', label: '2D 분포 전체 데이터 CSV 저장' },
  ...(hasPin ? [{ k: 'pinCsv', label: '선택 선 길이·폭 프로파일 CSV 저장' }] : onCell ? [{ k: 'pinCsv', label: '이 위치 길이·폭 프로파일 CSV 저장' }] : []),
  { k: 'png', label: '2D 이미지 저장 (PNG)' }, { k: 'copy', label: '2D 이미지 복사' },
];
// 1D 우클릭 메뉴 항목(순수)
export const plotMenuItems = (title) => [{ k: 'csv', label: `${title} 데이터 CSV 저장` }, { k: 'png', label: '그래프 이미지 저장 (PNG)' }, { k: 'copy', label: '그래프 이미지 복사' }];
export function createResultsPanel(el, { onQuality = null, fileName = () => 'uds', onLeak = null, onBig = null, onCalc = null, calcBusy = () => false, onNote = null } = {}) {
  let effT = { key: null, t0: null };
  let region = null, regKey = null;   // 선택 영역 { s0, s1, w0, w1 } mm(세션 동안만, 관측면이 바뀌면 지움, 2026-11-12)   // 계산 부담 배지의 경과 시간 기준
  const gaugeHtml = (k) => `<div class="m3-gauge" data-r="${k}"><div class="f"></div><div class="tg"></div></div>`;
  el.innerHTML = `
    <div class="m3-res-h">시뮬레이션 결과</div>
    <div class="m3-msg" data-r="msg" hidden></div>
    <div class="m3-blk"><div class="m3-t"><b class="m3-tt">2D 광량 분포 <i class="m3-info" data-r="mapsub" tabindex="0">ⓘ</i></b><span><label class="m3-map-eq" title="가로세로를 같은 축척으로 — 끄면 좁은 폭을 늘려 보여 줌"><input type="checkbox" data-r="mapEq"> 실제 비율</label> <select data-r="quality" title="2D 분포·1D 프로파일 칸 크기(정사각) — 저 1.5 mm(빠름) · 중 1.0 mm(광선 ≈2배) · 고 0.5 mm(광선 ≈4배) · 짧거나 좁은 면은 그 방향만 더 잘게" aria-label="분포 화질">${QUALITY_OPTS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>  <button type="button" class="m3-zoom" data-zoom="map" title="큰 창으로 보기" aria-label="2D 광량 분포 확대">⤢</button></span></div>
      <div class="m3-withm"><canvas class="m3-g" data-r="map" width="600" height="200"></canvas>
        <div class="m3-m"><div class="l">평균 광량</div><div class="v" data-r="avg" title="cd/m² 값은 보는 각도 설정과 상관없이 정면 ±10° 안의 평균 휘도">–</div><div class="s" data-r="avgs"></div><div class="s m3-need" data-r="need"></div>${gaugeHtml('avgg')}
          <div class="l" style="margin-top:6px">광 효율</div><div class="v sm" data-r="eff">–</div><div class="s">관측면 원뿔 안 / LED 총 방출</div><div class="m3-effload" data-r="effl" hidden></div><div class="m3-regl" data-r="reg" hidden title="큰 창(⤢)에서 고른 영역 — 길이 / 폭 균일도"></div><button type="button" class="m3-leak" data-r="leak" hidden title="누르면 3D 에서 가장 많이 새는 면을 강조"></button></div></div></div>
    <div class="m3-blk"><div class="m3-t"><b class="m3-tt">길이 방향 1D 프로파일 <i class="m3-info" data-r="psub" tabindex="0">ⓘ</i></b><span><button type="button" class="m3-zoom" data-zoom="prof" title="큰 창으로 보기" aria-label="길이 프로파일 확대">⤢</button></span></div>
      <div class="m3-withm"><canvas class="m3-g" data-r="prof" width="600" height="150"></canvas>
        <div class="m3-m"><div class="l">길이 균일도</div><div class="v" data-r="ul">–</div>${gaugeHtml('ulg')}<div class="s" data-r="ulj"></div></div></div></div>
    <div class="m3-blk"><div class="m3-t"><b class="m3-tt">폭 방향 1D 프로파일 <i class="m3-info" data-r="wsub" tabindex="0">ⓘ</i></b><span><button type="button" class="m3-zoom" data-zoom="wprof" title="큰 창으로 보기" aria-label="폭 프로파일 확대">⤢</button></span></div>
      <div class="m3-withm"><canvas class="m3-g" data-r="wprof" width="600" height="120"></canvas>
        <div class="m3-m"><div class="l">폭 균일도</div><div class="v" data-r="uw">–</div>${gaugeHtml('uwg')}<div class="s" data-r="uwj"></div></div></div></div>`;
  const q = (k) => el.querySelector(`[data-r="${k}"]`);
  let mapEq = false; try { mapEq = localStorage.getItem('uds.m3.mapEq') === '1'; } catch {}   // 메인 2D 실제 비율 — 이 브라우저에 기억
  const RATIO = { map: 2.6, prof: 2.6, wprof: 3.2 };   // 눈금·색 막대·읽기가 들어가도록 높게
  wireHover(q('prof')); wireHover(q('wprof')); wireMapHover(q('map'));
  q('prof')._onMenu = (e, cv) => plotMenu('prof')(e, cv); q('wprof')._onMenu = (e, cv) => plotMenu('wprof')(e, cv);
  // 지정 점(mm — 화질을 바꿔도 같은 위치). 같은 칸을 다시 누르면 해제
  let pin = null;
  const onPin = ([i, j], G) => { const s = (i + 0.5) * G.ds, w = G.w0 + (j + 0.5) * G.cell; pin = pin && Math.abs(pin.s - s) < G.ds / 2 && Math.abs(pin.w - w) < G.cell / 2 ? null : { s, w }; if (last) update(last); };
  const pinOff = () => { if (!pin) return; pin = null; if (last) update(last); };
  q('map')._onPin = onPin; q('map')._onPinOff = pinOff; q('map')._onMenu = (e, c, cv) => mapMenu(e, c, cv);
  // 지도 밖을 클릭하면 선택 선 해제 — 지도·우클릭 메뉴·창 제목 줄(옮기기·접기)·경계선 끌기는 빼고
  PIN_OUTSIDE = (e) => { const t = e.target; if (t === q('map') || t === big?.cvs.map || t.closest?.('.m3-ctx, .m3-big-hd, .m3-psplit')) return; pinOff(); };
  if (!pinOutsideOn && typeof document !== 'undefined') { pinOutsideOn = true; document.addEventListener('click', (e) => PIN_OUTSIDE?.(e)); }
  q('quality').onchange = (e) => onQuality?.(e.target.value);
  q('leak').onclick = () => onLeak?.();
  // 2D = 칸 중심 값 그대로, 칸 사이만 선형 보간 · 1D = smoothCurve 로 노이즈만 다듬어 그림(값은 원자료)
  const saveTxt = (txt, tag) => {   // 저장 형식 = Excel 용 CSV
    const nm = String(fileName() ?? 'uds'), a = document.createElement('a'), url = URL.createObjectURL(new Blob(['\ufeff' + toCsv(txt)], { type: 'text/csv;charset=utf-8' }));
    a.href = url; a.download = `${nm.replace(/[\\/:*?"<>|]/g, '_')}-${tag}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const txt2D = () => {
    const sn = last?.snap, st = sn?.stats; if (!st || st.empty || !sn.G) return;
    saveTxt(mapTxt(fullG(sn.G), st.mapAll ?? st.map, { name: String(fileName() ?? 'uds'), quality: { low: '저', mid: '중', high: '고' }[last.observe?.quality ?? 'low'], photons: sn.photons, noise: st.relNoiseCell }), '2D분포');
  };
  const txtPin = () => {   // 선택 선(지정 점) 원자료
    const sn = last?.snap, st = sn?.stats; if (!pin || !st || st.empty || !sn.G) return;
    saveTxt(lineTxt(fullG(sn.G), st.mapAll ?? st.map, pin, { name: String(fileName() ?? 'uds'), quality: { low: '저', mid: '중', high: '고' }[last.observe?.quality ?? 'low'], photons: sn.photons }), '선택선');
  };
  const txt1D = (k = null) => { const ks = k ? [k] : ['prof', 'wprof'], L = ks.filter((x) => VIEW[x]); if (L.length) saveTxt(profileTxt(L.map((x) => ({ title: TITLE[x], v: VIEW[x] }))), k === 'wprof' ? '폭1D' : k === 'prof' ? '길이1D' : '1D프로파일'); };   // k = 그 그림만
  // 1D 표시: 값 = 원자료(CSV 와 같음), 그리는 선만 칸이 많을 때 다듬음(draw) · 가로축은 값이 있는 범위로
  const plotView = (curves, tg, opt) => {
    const c = cropFinite(curves.map((x) => ({ ...x, ys: Array.from(x.ys) })), opt.x0, opt.x1), n = c.curves[0]?.ys.length ?? 0, m = smoothHalf(n, ledGapCells(opt.leds, n ? (c.x1 - c.x0) / n : 0));
    return { curves: m ? c.curves.map((x) => ({ ...x, draw: smoothCurve(x.ys, m) })) : c.curves, tg, opt: { ...opt, x0: c.x0, x1: c.x1 } };
  };
  // 큰 창(⤢, 어느 그림에서 눌러도) — 2D(위) + 길이 1D·폭 1D(아래)를 한 화면에. 그림마다 [⤢ 이 그림만] ↔ [모두 보기], 2D·1D TXT 저장.
  // 계산이 이어지면 같이 갱신 · 2D 는 [실제 비율] 전환 · 2D 클릭 = 지정 점 · Esc(한 그림만 → 모두 → 닫기)·바깥 클릭·닫기
  const KINDS = ['map', 'prof', 'wprof'];
  const VIEW = { map: null, prof: null, wprof: null }, TITLE = { map: '2D 광량 분포 (관측면 펼침)', prof: '길이 방향 1D 프로파일', wprof: '폭 방향 1D 프로파일' };
  let big = null;
  // 우클릭 메뉴(2026-11-04): 2D = 전체 데이터·선택 선 CSV · 1D = 그 그래프 CSV · 공통 이미지 저장·복사. 2D 에 선택 선이 없으면 누른 자리를 선택
  const IMG_TAG = { map: '2D분포', prof: '길이1D', wprof: '폭1D' };
  const imgBlob = (kind, cv) => new Promise((res, rej) => {
    paint(kind, cv);   // 마우스 십자선은 빼고
    const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height;
    const x = o.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, o.width, o.height); x.drawImage(cv, 0, 0);
    o.toBlob((b) => (b ? res(b) : rej(new Error('이미지를 만들 수 없음'))), 'image/png');
  });
  const imgName = (kind) => `${String(fileName() ?? 'uds').replace(/[\\/:*?"<>|]/g, '_')}-${IMG_TAG[kind]}.png`;
  const savePng = async (kind, cv) => { const b = await imgBlob(kind, cv), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = imgName(kind); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); onNote?.(`이미지 저장 — ${imgName(kind)}`); };
  const copyPng = async (kind, cv) => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': imgBlob(kind, cv) })]); onNote?.('이미지를 복사함 — 붙여넣기(Ctrl+V) 가능'); }
    catch { onNote?.('이미지를 복사하지 못함 — 창을 한 번 클릭한 뒤 다시 하거나 이미지 저장을 쓰세요'); }
  };
  const canCopy = () => !!(navigator.clipboard?.write && globalThis.ClipboardItem);
  const imgAct = (k, kind, cv) => { if (k === 'png') savePng(kind, cv).catch((er) => onNote?.(`이미지를 저장하지 못함: ${er.message}`)); else if (k === 'copy') copyPng(kind, cv); };
  const showMenu = (e, cv, items, fn) => showCtxMenu(cv.ownerDocument, e.clientX, e.clientY, items.filter((it) => it.k !== 'copy' || canCopy()), fn, cv.closest('#mech3d-wrap') ?? cv.ownerDocument.body);
  function mapMenu(e, c, cv) {
    const G = cv._mapv.v.G;
    showMenu(e, cv, mapMenuItems(!!pin, !!c), (k) => {
      if (k === 'mapCsv') txt2D();
      else if (k === 'pinCsv') { if (!pin) onPin(c, G); txtPin(); }
      else imgAct(k, 'map', cv);
    });
  }
  const plotMenu = (kind) => (e, cv) => showMenu(e, cv, plotMenuItems(TITLE[kind].replace(' 프로파일', '')), (k) => { if (k === 'csv') txt1D(kind); else imgAct(k, kind, cv); });
  const paint = (kind, cv, hover = null) => {
    const v = VIEW[kind], dpr = dprNow();
    if (!v) { clearCanvas(cv); return; }
    if (kind === 'map') drawMap(cv, v, dpr, hover, cv === big?.cvs.map ? big.equal : mapEq);
    else drawPlot(cv, v.curves, v.tg, v.opt, dpr, hover);
  };
  q('mapEq').checked = mapEq;
  q('mapEq').onchange = (e) => { mapEq = e.target.checked; try { localStorage.setItem('uds.m3.mapEq', mapEq ? '1' : '0'); } catch {} paint('map', q('map')); };
  const paintBig = () => {
    if (!big) return;
    for (const k of KINDS) {
      const cv = big.cvs[k]; if (!cv.offsetParent) continue;   // 숨긴 그림(한 그림만 보기)은 건너뜀
      const r = cv.getBoundingClientRect(), d = dprNow(), W = Math.round(r.width * d), H = Math.round(r.height * d);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      paint(k, cv);
    }
  };
  const closeBig = () => { if (!big) return; onBig?.(null); big.ro?.disconnect(); big.el.remove(); document.removeEventListener('keydown', big.key); document.removeEventListener('pointerdown', big.down, true); window.removeEventListener('resize', big.rs); big = null; };
  const setFocus = (k) => {
    big.focus = k; if (k) big.grid.dataset.focus = k; else delete big.grid.dataset.focus;   // 속성이 있으면(빈 값도) 한 그림 배치
    big.grid.querySelectorAll('[data-big-one]').forEach((b) => { const on = b.dataset.bigOne === k; b.textContent = on ? '↙ 모두 보기' : '⤢ 이 그림만'; b.title = on ? '2D·1D 를 한 화면에' : '이 그림만 화면 가득'; });
    paintBig();
  };
  // 선택 영역 결과 — 큰 창 표 · 작은 카드 한 줄 · 두 그림의 사각형
  function showRegion(snap = last?.snap, O = last?.observe) {
    const st = snap?.stats, bins = (snap?.bins ?? []).filter((b) => b && b.photons > 0);
    let rs = null;
    if (region && st && !st.empty && snap.G && bins.length >= 2) { try { rs = regionStats(snap.G, bins.map((b) => b.acc.map((v) => v / b.photons)), snap.obs ?? O, region); } catch { rs = null; } }
    q('map')._region = region; if (big) big.cvs.map._region = region;
    const e = q('reg'), txt = rs ? `선택 영역 ${fmtJudge(rs.Ulen)} / ${fmtJudge(rs.Uwid)}` : '';
    if (e.textContent !== txt) e.textContent = txt; e.hidden = !txt;
    const t = big?.el.querySelector('[data-big-reg]'); if (t) { const h = O ? regionTableHtml(st, rs, O) : ''; if (t.innerHTML !== h) t.innerHTML = h; t.hidden = !h; }
    big?.el.querySelector('[data-big-reg-on]')?.setAttribute('aria-pressed', big.regMode ? 'true' : 'false');
  }
  // 큰 창 2D: 휠 = 확대(마우스 지점 고정) · 끌기 = 이동 · 영역 선택 켜면 끌기 = 사각형 · 더블클릭 = 전체 보기. 링·실제 모양 그림(M.at)에서는 쓰지 않음
  // 실제 모양 그림(링·실제 비율)이면 펼친 그림으로 바꿈 — 확대·영역 선택은 펼친 그림에서만. 체크 상자를 눈에 보이게 끄고 알림
  function unroll() {
    const cv = big?.cvs.map; if (!cv?._mapv?.at || !big.equal) return false;
    big.equal = false; const b = big.el.querySelector('[data-big-eq]'); if (b) b.checked = false;
    onNote?.('확대·영역 선택은 펼친 그림에서 — [실제 비율]을 껐습니다'); paint('map', cv); return true;
  }
  function wireBigZoom(cv) {
    const M = () => (cv._mapv && !cv._mapv.at ? cv._mapv : null);
    const P = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
    const full = (G) => fullView(mapViewG(G)), redraw = () => paint('map', cv);
    cv.addEventListener('wheel', (e) => {
      if (unroll()) { e.preventDefault(); return; }
      const m = M(); if (!m) return; const B = mapBox(cv, m.v.G, m.dpr, m.equal), sw = B.at(...P(e)); if (!sw) return;
      e.preventDefault(); const F = full(m.v.G), v = zoomAt(cv._view ?? F, F, e.deltaY < 0 ? 1.25 : 0.8, sw[0], sw[1]);
      cv._view = v.s0 === F.s0 && v.s1 === F.s1 && v.w0 === F.w0 && v.w1 === F.w1 ? null : v; redraw();
    }, { passive: false });
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      // 오른쪽 끌기 = 이동(2026-11-12) · 왼쪽 끌기 = 영역(영역 선택 켰을 때만). 오른쪽을 끌지 않고 떼면 기존 저장 메뉴
      const m = M(), pan = e.button === 2; if (!m || !(pan || (e.button === 0 && big.regMode))) return;
      const B = mapBox(cv, m.v.G, m.dpr, m.equal), p = P(e), sw = B.at(...p);
      if (!pan && !sw) return;
      drag = { p, sw, B, pan, v: cv._view ?? full(m.v.G), moved: false }; cv.setPointerCapture?.(e.pointerId);
    });
    cv.addEventListener('contextmenu', (e) => { if (cv._noMenu) { cv._noMenu = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return; const m = M(); if (!m) return; const p = P(e), dx = p[0] - drag.p[0], dy = p[1] - drag.p[1];
      if (Math.hypot(dx, dy) > 4 * m.dpr) drag.moved = true; if (!drag.moved) return;
      if (!drag.pan) { const B = mapBox(cv, m.v.G, m.dpr, m.equal), q2 = B.at(Math.max(B.ox, Math.min(B.ox + B.PW, p[0])), Math.max(B.oy, Math.min(B.oy + B.rowH, p[1]))); if (q2) cv._drag = { s0: drag.sw[0], w0: drag.sw[1], s1: q2[0], w1: q2[1] }; }
      else { const v = drag.v; cv._view = panBy(v, full(m.v.G), (-dx / drag.B.PW) * (v.s1 - v.s0), (dy / drag.B.rowH) * (v.w1 - v.w0)); }
      redraw();
    });
    const end = () => {
      if (!drag) return; const m = M(), d = drag; drag = null; if (!d.moved) return; if (d.pan) cv._noMenu = true; else cv._noClick = true;
      if (!d.pan && big.regMode && cv._drag && m) { region = snapRect(m.v.G, cv._drag); }   // 영역 선택은 켜 둔 채 — 다시 끌면 새 영역
      cv._drag = null; showRegion(); redraw(); paint('map', q('map'));
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('dblclick', () => { cv._view = null; redraw(); });
  }
  // 영역 선택 끄기 = 영역도 지움(✕ 대신, 2026-11-12)
  function regOff() {
    region = null; if (big) { big.regMode = false; big.cvs.map._drag = null; paint('map', big.cvs.map); }
    showRegion(); paint('map', q('map'));
  }
  function openBig() {
    closeBig();
    const eq0 = defaultEqual(VIEW.map?.G);
    const ov = document.createElement('div');
    // 떠 있는 창(2026-11-02) — 기구 최적화 창처럼 머리 끌어 옮기기 · 모서리로 크기 · 접기. 뒤 화면을 막지 않음(열어 둔 채 설계·최적화). 위치·크기 = 보는 사람별, 접힘은 열 때마다 펼침
    const rect = fitRect(bigRectLoad(), innerWidth, innerHeight);
    ov.className = 'm3-big-in'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', '광분포 시뮬레이션');
    const cell = (k) => `<div class="m3-big-c" data-k="${k}"><div class="m3-big-ct"><b>${TITLE[k]}</b><span class="m3-big-sp"></span>${k === 'map' ? `<label class="m3-big-eq"><input type="checkbox" data-big-eq${eq0 ? ' checked' : ''}> 실제 비율</label><button type="button" data-big-reg-on aria-pressed="false" title="켜 둔 동안 끌 때마다 새 영역 · 그 영역의 균일도를 아래 표로 비교 · 끄면(또는 Esc) 영역 지움 · 휠 = 확대 · 오른쪽 끌기 = 이동 · 더블클릭 = 전체 보기">▭ 영역 선택</button><button type="button" data-big-fit title="확대를 풀고 전체 보기(더블클릭과 같음)">1:1</button>` : ''}<button type="button" data-big-one="${k}">⤢ 이 그림만</button></div><canvas class="m3-big-cv" data-big-cv="${k}"></canvas>${k === 'map' ? '<div class="m3-big-reg" data-big-reg hidden></div>' : ''}</div>`;
    ov.innerHTML = `<div class="m3-big-hd" title="끌어서 옮기기"><b title="진행 현황 · 2D · 1D — 2D 클릭 = 그 점 기준 1D 곡선(주황) · 그림 우클릭 = 데이터·이미지 저장"><i class="m3-fl" data-big-step>4</i>광분포 시뮬레이션</b><span class="m3-mon-sum" data-big-sum></span><span class="m3-big-sp"></span><span class="m3-ctl" data-big-ctl></span><label class="m3-big-q">화질 <select data-big-q aria-label="분포 화질">${QUALITY_OPTS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label><button type="button" data-big-min></button><button type="button" data-big-close title="Esc">✕ 닫기</button></div>
      <div class="m3-big-grid"><div class="m3-big-prog" data-big-prog></div>${cell('map')}<div class="m3-big-row">${cell('prof')}${cell('wprof')}</div></div>`;
    (el.closest('#mech3d-wrap') ?? document.body).appendChild(ov);   // 설계 화면에 붙임(화면을 바꾸면 함께 숨음)
    const cvs = Object.fromEntries(KINDS.map((k) => [k, ov.querySelector(`[data-big-cv="${k}"]`)]));
    const place = () => {
      const m = big.min, r = clampRect(m ? { ...rect, w: BIG_MIN_W } : rect, innerWidth, innerHeight);
      rect.x = r.x; rect.y = r.y; if (!m) { rect.w = r.w; rect.h = r.h; }
      Object.assign(ov.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: m ? 'auto' : `${r.h}px` });
    };
    const setMin = (v) => {
      big.min = v; ov.classList.toggle('min', v);
      const b = ov.querySelector('[data-big-min]'); b.textContent = v ? '▾ 펼치기' : '▴ 접기'; b.title = v ? '2D·1D 그림 보기' : '제목 줄만 남기기';
      place(); if (!v) paintBig();
    };
    // Esc = 이 창을 마지막으로 눌렀을 때만(뒤 화면에서 작업 중인 Esc 를 가로채지 않게)
    big = { el: ov, cvs, grid: ov.querySelector('.m3-big-grid'), focus: null, equal: eq0, min: false, active: true,
      key: (e) => { if (e.key !== 'Escape' || !big.active) return; if (big.regMode) regOff(); else if (big.focus) setFocus(null); else closeBig(); },
      down: (e) => { big.active = ov.contains(e.target); },
      rs: () => { place(); paintBig(); } };
    document.addEventListener('keydown', big.key); document.addEventListener('pointerdown', big.down, true); window.addEventListener('resize', big.rs);
    ov.addEventListener('pointerdown', () => raiseWin(ov), true);
    const snap = () => ({ ...rect }), keep = () => bigRectSave(rect);
    dragBy(ov.querySelector('.m3-big-hd'), snap, (dx, dy, s0) => { rect.x = s0.x + dx; rect.y = s0.y + dy; place(); }, (e) => !e.target.closest('button, select, label, input'), keep);
    mountResizers(ov, { rect: () => rect, apply: (r) => { Object.assign(rect, r); place(); }, ok: () => !big.min, end: keep, minW: 480, minH: 360 });
    ov.querySelector('[data-big-min]').onclick = () => setMin(!big.min);
    ov.addEventListener('click', (e) => {
      const one = e.target.closest('[data-big-one]'); if (one) { setFocus(big.focus === one.dataset.bigOne ? null : one.dataset.bigOne); return; }
      if (e.target.closest('[data-big-reg-on]')) { if (big.regMode) regOff(); else { big.regMode = true; unroll(); showRegion(); } return; }
      if (e.target.closest('[data-big-fit]')) { cvs.map._view = null; paint('map', cvs.map); return; }
    });
    ov.querySelector('[data-big-close]').onclick = closeBig;
    ov.querySelector('[data-big-q]').onchange = (e) => onQuality?.(e.target.value);
    const eq = ov.querySelector('[data-big-eq]'); eq.onchange = () => { big.equal = eq.checked; paint('map', cvs.map); };
    wireMapHover(cvs.map); wireBigZoom(cvs.map); cvs.map._region = region; cvs.map._onPin = onPin; cvs.map._onPinOff = pinOff; cvs.map._onMenu = (e, c, cv) => mapMenu(e, c, cv); wireHover(cvs.prof); wireHover(cvs.wprof); cvs.prof._onMenu = plotMenu('prof'); cvs.wprof._onMenu = plotMenu('wprof');
    // 창 안 크기 조절: 2D ↕ 1D(높이) · 길이 1D ↔ 폭 1D(폭) — 끌기 막대(비율 기억). 창 자체 = 오른쪽 아래 모서리(CSS resize)
    const C = (k) => ov.querySelector(`.m3-big-c[data-k="${k}"]`);
    // 진행 현황(그래프) ↕ 2D ↕ 1D — 경계선을 끌어 높이 조절(2026-11-08: 진행 그래프도 크기 조절)
    mountSplit([C('map'), ov.querySelector('.m3-big-row')], { key: 'uds.m3.bigV', dir: 'col', min: 120, onChange: () => paintBig() });
    // 진행 그래프 칸 높이 = 따로 손잡이(2026-11-08) — 2D·1D 를 '이 그림만'으로 볼 때도 조절. 아래 그림이 최소 120px 은 남게
    { const pg = ov.querySelector('[data-big-prog]'); mountHeightHandle(pg, { key: 'uds.m3.bigProgH', min: 120, max: () => Math.max(120, big.grid.clientHeight - 140), onChange: () => paintBig() }); }
    mountSplit([C('prof'), C('wprof')], { key: 'uds.m3.bigH', dir: 'row', min: 160, onChange: () => paintBig() });
    if (typeof ResizeObserver !== 'undefined') { big.ro = new ResizeObserver(() => paintBig()); big.ro.observe(ov); }
    setMin(false); raiseWin(ov); setFocus(null); syncBig(); showRegion(); onBig?.(ov.querySelector('[data-big-prog]'));
  }
  // 큰 창 머리: 화질 = 지금 값
  const syncBig = () => {
    if (!big) return;
    const s = big.el.querySelector('[data-big-q]');
    if (document.activeElement !== s) s.value = last?.observe?.quality ?? 'low';
    const su = big.el.querySelector('[data-big-sum]'), st0 = last?.snap?.stats, O = last?.observe, u = (t, v, g) => `<b class="${Number.isFinite(v) && Number.isFinite(g) ? (v + 1e-9 >= g ? 'ok' : 'bad') : ''}">${t} ${Number.isFinite(v) ? v.toFixed(2) : '–'}</b>`;
    const pr = last?.snap?.state === 'done' ? 100 : last?.snap?.progress ?? simPct(st0?.relNoise, last?.snap?.targetNoise ?? 0.01);
    setStepMark(big.el.querySelector('[data-big-step]'), 4, last?.snap?.state === 'done');
    setCtl(big.el.querySelector('[data-big-ctl]'), simCtl(last?.snap, calcBusy()), (k) => onCalc?.(k));
    if (su) su.innerHTML = `<b>진행 ${fmtProg(pr)}%</b> ${!st0 || st0.empty || st0.relNoise > 0.05 ? '' : `${u('길이', st0.Ulen, O?.targetLen)} ${u('폭', st0.Uwid, O?.targetWid)}`}`;   // 접었을 때 보이는 현재 결과(계산 초반 값은 노이즈가라 숨김)
  };
  // onclick 대입(addEventListener 아님) — 패널을 다시 만들면(새 도면·프로젝트) 앞 패널의 처리를 대체. 쌓이면 큰 창이 2개 열리고 아래 창은 이전 계산 데이터였음
  el.onclick = (e) => { const b = e.target.closest('[data-zoom]'); if (b) openBig(); };
  // 메인 결과 칸 높이 조절(2D · 길이 1D · 폭 1D 사이 끌기 막대) — 전체 높이는 그대로, 비율만(보는 사람별)
  mountSplit([...el.querySelectorAll(':scope > .m3-blk')], { key: 'uds.m3.resSplit', dir: 'col', min: 110, onChange: () => { if (last) update(last); } });
  let last = null;
  const fill = (g, pct, ok, tgPct) => {
    const f = g.querySelector('.f'), w = `${Math.max(0, Math.min(100, pct)).toFixed(0)}%`;
    if (f.style.width !== w) f.style.width = w;
    f.classList.toggle('ok', !!ok); f.classList.toggle('bad', !ok);
    const l = `${tgPct.toFixed(0)}%`, t = g.querySelector('.tg');
    if (t.style.left !== l) t.style.left = l;
  };
  const resetGauge = (g) => { g.querySelector('.f').style.width = '0%'; };
  const gauge = (key, v, tg, se, relNoise) => {
    const j = judgeText(v, tg, se, relNoise);
    q(key).textContent = fmtU(v); q(key).className = `v ${j.cls}`; q(`${key}j`).textContent = j.text;
    fill(q(`${key}g`), Number.isFinite(v) ? v * 100 : 0, j.cls === 'ok', tg * 100);
    q(`${key}g`).querySelector('.f').classList.toggle('near', j.cls === 'near');
    q(`${key}g`).querySelector('.f').classList.toggle('busy', j.cls === 'busy');
  };
  function clear(message) {
    VIEW.map = VIEW.prof = VIEW.wprof = null; if (big) for (const k of KINDS) clearCanvas(big.cvs[k]);
    for (const k of ['map', 'prof', 'wprof']) clearCanvas(q(k));
    for (const k of ['avg', 'eff', 'ul', 'uw']) { q(k).textContent = '–'; q(k).className = 'v'; }
    for (const k of ['avgs', 'need', 'ulj', 'uwj']) q(k).textContent = '';
    for (const k of ['mapsub', 'wsub']) q(k).title = '';
    for (const k of ['avgg', 'ulg', 'uwg']) resetGauge(q(k));
    q('avgg').hidden = true;
    q('msg').hidden = false; q('msg').textContent = message || DEFAULT_GUIDE;
  }
  function update(args) {
    last = args;
    const { snap, observe, message } = args, st = snap?.stats, G = snap?.G;
    if (observe && document.activeElement !== q('quality')) q('quality').value = observe.quality ?? 'low';
    el.querySelectorAll('.m3-blk').forEach((b) => b.classList.toggle('dim', !st || !!st.empty));
    if (!st || st.empty || !G) { clear(message); syncBig(); return; }
    q('msg').hidden = !message; q('msg').textContent = message || '';
    for (const k of Object.keys(RATIO)) sizeCanvas(q(k), RATIO[k]);
    const dpr = dprNow();
    const VG = mapViewG(fullG(G)); q('mapsub').title = `관측면 펼침 · s 0–${G.L.toFixed(0)} mm × w ${VG.w0.toFixed(1)}–${(VG.w0 + VG.nw * VG.cell).toFixed(1)} mm · 칸 사이는 이어 칠함 · 클릭 = 그 점 기준 1D 곡선`;
    const pm = finiteMax(st.profile), leds = args.leds ?? [];
    // 지정 점 → 칸 (화질·관측면이 바뀌어 밖이면 해제)
    const pi = pin ? Math.floor(pin.s / G.ds) : -1, pj = pin ? Math.floor((pin.w - G.w0) / G.cell) : -1;
    if (pin && !(pi >= 0 && pi < G.ns && pj >= 0 && pj < G.nw)) pin = null;
    const FG = fullG(G), mapF = st.mapAll ?? st.map, pp = pin ? pointProfiles(FG, mapF, pi, pj) : null, ring = G.closed ? '원주' : '길이', rad = G.closed ? '반경(폭)' : '폭';
    VIEW.map = { G: FG, map: mapF, leds, pin, smooth: true, shape: args.shape ?? null };
    { const k = JSON.stringify([observe?.faces ?? null, observe?.dir ?? null]); if (k !== regKey) { if (regKey != null) { region = null; if (big) big.cvs.map._view = null; } regKey = k; } }
    showRegion(snap, observe);
    VIEW.prof = plotView([{ ys: Array.from(st.profile, (v) => v / pm), color: '#1f6fd1', name: '폭 평균', band: st.relNoise ?? 0 }, ...(pp ? [{ ys: Array.from(pp.along), color: PIN_COLOR, name: `지정 점 w=${pin.w.toFixed(1)}` }] : [])], observe.targetLen, { x0: 0, x1: G.L, xl: 's (mm)', leds: leds.map((p) => p.s), ledsOrig: (args.ledsOrig ?? []).map((p) => p.s) });
    q('psub').title = `${pin ? `폭 평균 + 지정 점(주황, ${ring} 방향) · 같은 점 다시 클릭 또는 바깥 클릭 = 해제` : '폭 평균 · 2D 클릭 = 그 점 기준 곡선 추가'} · 옅은 띠 = 계산 노이즈 범위 · 빨간 점선 = 목표 하한 · 곡선은 노이즈만 살짝 다듬어 그림(LED 리플 높이 유지) · 최저점·마우스 값·CSV·판정 = 원자료`;
    paint('map', q('map')); paint('prof', q('prof'));
    gauge('ul', st.Ulen, observe.targetLen, st.seLen, st.relNoise);
    if (pp && (st.Uwid == null || !st.win)) {   // 폭 판정이 없어도 지정 점의 폭(원형 = 반경) 방향 곡선은 보여 줌
      VIEW.wprof = plotView([{ ys: Array.from(pp.across), color: PIN_COLOR, name: `지정 점 s=${pin.s.toFixed(1)}` }], null, { x0: G.w0, x1: G.w0 + G.nw * G.cell, xl: 'w (mm)', leds: [] });
      paint('wprof', q('wprof')); resetGauge(q('uwg'));
      q('uw').textContent = '–'; q('uw').className = 'v'; q('uwj').textContent = '폭 판정 불가(폭이 격자 2칸 미만)'; q('wsub').title = `지정 점 s = ${pin.s.toFixed(1)} mm · ${rad} 방향`;
    } else if (st.Uwid == null || !st.win) {
      VIEW.wprof = null; clearCanvas(q('wprof')); resetGauge(q('uwg'));
      q('uw').textContent = '–'; q('uw').className = 'v'; q('uwj').textContent = '폭 판정 불가(폭이 격자 2칸 미만)'; q('wsub').title = '';
    } else {
      // 판정 = 최저 창(실선), 비교 = 길이 전체 평균(점선) — 각자 최대 = 100%
      const wp = windowProfile(G, snap.sum, st.win[0], st.win[1]), wm = finiteMax(wp), wa = windowProfile(G, snap.sum, 0, G.ns), wam = finiteMax(wa);
      VIEW.wprof = plotView([{ ys: Array.from(wp, (v) => v / wm), color: '#1f6fd1', name: `최저 창 s=${st.sWorst.toFixed(0)}`, band: st.relNoise ?? 0 }, { ys: Array.from(wa, (v) => v / wam), color: '#3fae7a', dash: [4, 3], name: '길이 전체 평균' }, ...(pp ? [{ ys: Array.from(pp.across), color: PIN_COLOR, name: `지정 점 s=${pin.s.toFixed(1)}` }] : [])],
        observe.targetWid, { x0: G.w0, x1: G.w0 + G.nw * G.cell, xl: 'w (mm)', leds: [...new Set(leds.map((p) => +p.w.toFixed(2)))] });
      paint('wprof', q('wprof'));
      gauge('uw', st.Uwid, observe.targetWid, st.seWid, st.relNoise);
      q('wsub').title = `최저 창 s = ${st.sWorst.toFixed(1)} mm${pp ? ` · 지정 점 s = ${pin.s.toFixed(1)} mm(주황, ${rad} 방향)` : ''}`;
    }
    const lc = lumCard(st, snap.photometry, observe.targetLum);
    q('avg').textContent = lc.value; q('avgs').textContent = lc.sub; q('avg').className = `v ${lc.pass == null ? '' : lc.pass ? 'ok' : 'bad'}`;
    { const n = requiredFlux(snap.photometry, observe.targetLum); q('need').textContent = needShort(n); q('need').title = n ? `${needText(n)} — 정면 ±10° 기준: 목표 휘도 × 관측면적 × π × sin²10° ÷ ±10° 안 광 효율` : ''; }
    q('avgg').hidden = lc.ratio == null;
    if (lc.ratio != null) fill(q('avgg'), lc.ratio * 50, lc.pass, 50);   // 목표 = 가운데, 목표의 2배 = 가득
    const eff = snap.photometry?.eff;
    q('eff').textContent = Number.isFinite(eff) ? `${(eff * 100).toFixed(1)}%` : '–';
    { // 광효율에 따른 계산 부담(짧은 배지 · 자세히는 툴팁). 경과 시간 = 이 계산(sceneKey)이 처음 돌기 시작한 때부터
      const now = performance.now(); if (snap.sceneKey !== effT.key || snap.state === 'pending' || snap.state === 'starting') effT = { key: snap.sceneKey, t0: null }; if (snap.state === 'running' && effT.t0 == null) effT.t0 = now;
      const L = effLoad(eff, snap, effT.t0 == null ? 0 : (now - effT.t0) / 1000), e = q('effl');
      if (e.textContent !== L.text) e.textContent = L.text; e.className = `m3-effload ${L.cls}`; e.title = L.title; e.hidden = !L.text; }
    const lk = args.leak ?? ''; if (q('leak').textContent !== lk) q('leak').textContent = lk; q('leak').hidden = !lk;   // 새는 빛(광 효율 아래)
    paintBig(); syncBig();   // 큰 창도 계산을 따라감
  }
  if (typeof ResizeObserver !== 'undefined') {
    let w0 = 0;
    new ResizeObserver(() => { const c = q('map'), w = c.clientWidth ? `${c.clientWidth}x${c.clientHeight}` : 0; if (w && w !== w0) { w0 = w; if (last) update(last); } }).observe(el);   // 폭·높이(아래 칸 높이 조절) 바뀌면 다시 그림
  }
  clear();
  return { update, closeBig, toggleBig: () => (big ? closeBig() : openBig()) };
}
