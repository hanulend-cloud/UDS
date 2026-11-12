# 2D 영역 균일도 · 큰 창 확대 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 큰 창 2D 분포를 확대·이동하고, 영역 하나를 골라 그 영역의 길이·폭 균일도·평균을 전체와 나란히 보여 준다(표시 전용).

**Architecture:** 계산은 순수 함수 `regionStats`(tally.js) — 격자를 잘라 기존 `tallyStats` 를 그대로 부른다. 확대·영역 좌표 계산은 순수 모듈 `map-zoom.js`. 그리기는 `mapLayout`/`drawMap` 에 보이는 범위(view)·영역 사각형 인자를 더한다. 상태(보이는 범위·영역)는 results-panel 안 세션 변수.

**Tech Stack:** 바닐라 JS ES 모듈, Canvas 2D, Node 시험(`node test/*.mjs`), 브라우저 확인(preview uds-test :5190).

---

## 파일
- Modify `src/engine/mech3d/tally.js` — `regionStats(G, accs, obs, rect)` 추가.
- Create `src/ui/m3/map-zoom.js` — `cellRange(G, rect)`, `snapRect(G, rect)`, `zoomAt(view, full, factor, s, w)`, `panBy(view, full, ds, dw)`, `fullView(G)`.
- Modify `src/ui/m3/results-panel.js` — `mapLayout(..., view)`, `drawMap(..., opts.view, opts.region)`, 큰 창 휠·끌기·더블클릭·[영역 선택]·✕, 비교 표(큰 창·작은 카드), 관측면 바뀌면 영역 지움.
- Modify `styles.css` — 표·단추·사각형.
- Create `test/m3-region.mjs` — regionStats · map-zoom · mapLayout(view) 시험. `package.json` test:m3 에 추가.

## 범위 밖(YAGNI)
- 링(닫힌 경로)·'실제 비율'의 모양 그리기(drawShapeMap) 모드에서는 확대·영역 선택을 끔(단추 비활성, 안내 title). 영역이 링 시작점을 넘어 감기는 경우 없음.

### Task 1: regionStats

**Files:** Modify `src/engine/mech3d/tally.js` (tallyStats 아래), Test `test/m3-region.mjs`

- [ ] Step 1: 실패 시험 작성

```js
import { tallyStats, regionStats } from '../src/engine/mech3d/tally.js';
// 격자 10×4(ds=cell=1, w0=-2), 배치 3개. 값 = 1 + 0.1·i (길이로 증가) · j=0 줄만 0.5배
const G = { ns: 10, nw: 4, ds: 1, cell: 1, w0: -2, L: 10, closed: false, winS: 5, valid: new Uint8Array(40).fill(1), area: new Float64Array(40).fill(1) };
const mk = (b) => Float64Array.from({ length: 40 }, (_, k) => { const i = Math.floor(k / 4), j = k % 4; return (1 + 0.1 * i) * (j === 0 ? 0.5 : 1) * (1 + 0.001 * b); });
const accs = [0, 1, 2].map(mk), obs = { targetLen: 0.8, targetWid: 0.8 };
const all = tallyStats(G, accs, obs), r0 = regionStats(G, accs, obs, { s0: 0, s1: 10, w0: -2, w1: 2 });
ok(Math.abs(r0.Ulen - all.Ulen) < 1e-12 && Math.abs(r0.Uwid - all.Uwid) < 1e-12 && Math.abs(r0.meanRatio - 1) < 1e-12, '영역 = 전체 → tallyStats 와 같음');
const r1 = regionStats(G, accs, obs, { s0: 5, s1: 10, w0: -1, w1: 2 });   // i 5..9, j 1..3 (0.5배 줄 뺌)
ok(Math.abs(r1.Ulen - 1.5 / 1.9) < 1e-9 && Math.abs(r1.Uwid - 1) < 1e-9, `영역 길이·폭 균일도 (${r1.Ulen}, ${r1.Uwid})`);
ok(r1.cells.join() === '5,10,1,4' && r1.mm.join() === '5,10,-1,2', '칸 범위·mm 범위');
ok(regionStats(G, accs, obs, { s0: 0, s1: 10, w0: 0, w1: 1 }).Uwid === null, '폭 1칸 → 폭 균일도 없음');
ok(regionStats(G, accs, obs, { s0: 3, s1: 3.2, w0: 0, w1: 0.1 }).Ulen != null, '칸 하나보다 작은 영역 → 그 칸 하나');
```

- [ ] Step 2: `node test/m3-region.mjs` → FAIL(regionStats 없음)
- [ ] Step 3: 구현

```js
// 영역 균일도(2026-11-12, 표시 전용) — rect = { s0, s1, w0, w1 } mm. 격자를 칸 경계로 잘라(바깥쪽으로 맞춤) tallyStats 를 그대로 부름 → 판정과 같은 식.
// 반환 tallyStats 결과 + { cells:[i0,i1,j0,j1], mm:[s0,s1,w0,w1], meanRatio(영역 평균 / 전체 평균) }
export function regionStats(G, accs, obs, rect) {
  const cl = (v, n) => Math.max(0, Math.min(n, v));
  let i0 = cl(Math.floor(rect.s0 / G.ds + 1e-9), G.ns), i1 = cl(Math.ceil(rect.s1 / G.ds - 1e-9), G.ns);
  let j0 = cl(Math.floor((rect.w0 - G.w0) / G.cell + 1e-9), G.nw), j1 = cl(Math.ceil((rect.w1 - G.w0) / G.cell - 1e-9), G.nw);
  if (i1 <= i0) i1 = Math.min(G.ns, i0 + 1), i0 = i1 - 1; if (j1 <= j0) j1 = Math.min(G.nw, j0 + 1), j0 = j1 - 1;
  const ns = i1 - i0, nw = j1 - j0, crop = (a) => { const o = new a.constructor(ns * nw); for (let i = 0; i < ns; i++) for (let j = 0; j < nw; j++) o[i * nw + j] = a[(i0 + i) * G.nw + j0 + j]; return o; };
  const g = { ...G, ns, nw, valid: crop(G.valid), area: crop(G.area), w0: G.w0 + j0 * G.cell, L: ns * G.ds, closed: false, validAll: undefined, areaAll: undefined };
  const st = tallyStats(g, accs.map(crop), obs);
  const avg = (gg, as) => { let s = 0, ar = 0; for (const a of as) for (let k = 0; k < a.length; k++) if (gg.valid[k]) { s += a[k]; ar += gg.area[k]; } return ar > 0 ? s / ar : NaN; };
  return { ...st, cells: [i0, i1, j0, j1], mm: [i0 * G.ds, i1 * G.ds, G.w0 + j0 * G.cell, G.w0 + j1 * G.cell], meanRatio: avg(g, accs.map(crop)) / avg(G, accs) };
}
```

- [ ] Step 4: 시험 PASS, Step 5: 커밋 `feat(tally): region uniformity with the judgement formula`

### Task 2: map-zoom (순수)

**Files:** Create `src/ui/m3/map-zoom.js`, Test `test/m3-region.mjs`

- [ ] Step 1: 시험

```js
import { fullView, zoomAt, panBy, snapRect } from '../src/ui/m3/map-zoom.js';
const F = fullView(G);
ok(F.s0 === 0 && F.s1 === 10 && F.w0 === -2 && F.w1 === 2, '전체 보기 = 격자 범위');
const z = zoomAt(F, F, 2, 5, 0);
ok(Math.abs(z.s1 - z.s0 - 5) < 1e-9 && Math.abs((5 - z.s0) / (z.s1 - z.s0) - 0.5) < 1e-9, '2배 확대 · 마우스 지점 고정');
ok(zoomAt(F, F, 0.5, 5, 0).s1 - zoomAt(F, F, 0.5, 5, 0).s0 === 10, '전체보다 축소 안 됨');
ok(zoomAt(F, F, 100, 5, 0).s1 - zoomAt(F, F, 100, 5, 0).s0 >= 10 / 20 - 1e-9, '최대 20배');
const p = panBy(z, F, 100, 0); ok(p.s1 === 10 && Math.abs(p.s1 - p.s0 - 5) < 1e-9, '이동은 전체 범위 안에서');
const sr = snapRect(G, { s0: 2.3, s1: 6.6, w0: 1.2, w1: -0.4 });
ok(sr.s0 === 2 && sr.s1 === 7 && sr.w0 === -1 && sr.w1 === 2, '사각형 칸 맞춤(바깥쪽) · 거꾸로 끈 것 정리');
```

- [ ] Step 2: FAIL 확인
- [ ] Step 3: 구현

```js
// 2D 큰 창 확대·이동·영역 좌표(순수, 2026-11-12). view = { s0, s1, w0, w1 } mm — 보이는 범위
export const ZOOM_MAX = 20;
export const fullView = (G) => ({ s0: 0, s1: G.ns * G.ds, w0: G.w0, w1: G.w0 + G.nw * G.cell });
const fit = (a, b, lo, hi) => { const d = Math.min(b - a, hi - lo); if (a < lo) return [lo, lo + d]; if (b > hi) return [hi - d, hi]; return [a, b]; };
export function zoomAt(view, full, factor, s, w) {
  const len = (a, b, lo, hi, p) => { const span = Math.min(hi - lo, Math.max((hi - lo) / ZOOM_MAX, (b - a) / factor)), t = (p - a) / (b - a); return fit(p - t * span, p - t * span + span, lo, hi); };
  const [s0, s1] = len(view.s0, view.s1, full.s0, full.s1, s), [w0, w1] = len(view.w0, view.w1, full.w0, full.w1, w);
  return { s0, s1, w0, w1 };
}
export function panBy(view, full, ds, dw) {
  const [s0, s1] = fit(view.s0 + ds, view.s1 + ds, full.s0, full.s1), [w0, w1] = fit(view.w0 + dw, view.w1 + dw, full.w0, full.w1);
  return { s0, s1, w0, w1 };
}
export function snapRect(G, r) {
  const a = Math.min(r.s0, r.s1), b = Math.max(r.s0, r.s1), c = Math.min(r.w0, r.w1), d = Math.max(r.w0, r.w1), F = fullView(G);
  const sn = (v, o, st, f) => o + f((v - o) / st + (f === Math.floor ? 1e-9 : -1e-9)) * st;
  return { s0: Math.max(F.s0, sn(a, 0, G.ds, Math.floor)), s1: Math.min(F.s1, sn(b, 0, G.ds, Math.ceil)), w0: Math.max(F.w0, sn(c, G.w0, G.cell, Math.floor)), w1: Math.min(F.w1, sn(d, G.w0, G.cell, Math.ceil)) };
}
```

- [ ] Step 4: PASS, Step 5: 커밋 `feat(m3): zoom and region math for the 2D map`

### Task 3: mapLayout·drawMap 보이는 범위 + 영역 사각형

**Files:** Modify `src/ui/m3/results-panel.js` (`mapLayout`, `mapBox`, `drawMap`), Test `test/m3-region.mjs`

- [ ] Step 1: 시험 — `mapLayout(G, 800, 300, 1, false, view)` 에서 `at(...xy(s, w))` ≈ [s, w] (view 안 점), view 밖 점 → `at` null, view = 전체 이면 기존 결과와 같음.
- [ ] Step 2: FAIL
- [ ] Step 3: 구현 — `mapLayout(G, W, H, dpr, equal, view = null)`: L·w0·w1 대신 view 의 s0..s1·w0..w1 을 쓰고 xy = ox + (s − vs0)/(vs1 − vs0)·PW. `drawMap(cv, v, dpr, hover, equal, opts = {})`: `opts.view` 가 있으면 drawImage 원본 범위를 view 칸 범위로(sx = vs0/ds, sw = (vs1−vs0)/ds, w 는 G.nw 기준 위아래 뒤집기), 눈금은 view 범위. `opts.region` 이면 xy 로 사각형(주황 #ff8a1f, 2px, 반투명 채움 없음). `cv._mapv` 에 opts 도 저장(hover 다시 그리기). 모양 모드(drawShapeMap)는 opts 무시.
- [ ] Step 4: PASS + 기존 test:m3 PASS, Step 5: 커밋

### Task 4: 큰 창 조작 + 비교 표 + 작은 카드

**Files:** Modify `src/ui/m3/results-panel.js`, `styles.css`

- [ ] 큰 창 2D 칸 머리에 `[영역 선택]`(토글) · `✕`(영역 지우기) · `1:1`(전체 보기) 단추. 모양 모드이면 비활성 + title '링·실제 모양 보기에서는 확대·영역 선택 안 됨'.
- [ ] 큰 창 2D 캔버스: wheel → `zoomAt(view, full, e.deltaY < 0 ? 1.25 : 0.8, ...at(px,py))`, 끌기(영역 모드 아님) → `panBy`(픽셀 → mm), 더블클릭 → 전체 보기, 영역 모드 끌기 → 미리보기 사각형 → 놓으면 `snapRect` 로 region 저장 · 모드 끔. Esc(큰 창 활성) = 영역 모드면 끔. 기존 클릭(지정 점 onPin)은 끌기 거리 < 4px 일 때만.
- [ ] 비교 표: 큰 창 2D 칸 아래 `<table data-big-reg>` · 작은 카드 2D 블록 아래 `<table data-reg>` — 영역 있을 때만. 행 길이·폭·평균, 열 전체 | 선택 영역 (L×W mm). 값 `fmtJudge`(길이·폭, 목표 대비 색 ok/bad), 평균 = `${Math.floor(meanRatio*1000)/10}%`.
- [ ] 영역 계산: update() 마다 `regionStats(snap.G, snap.bins.filter(Boolean).map(b => b.acc.map(v => v / b.photons)), snap.obs, region)` (bins 2개 미만이면 표 '–').
- [ ] 관측면 키(JSON [faces, dir]) 가 바뀌면 region·view 지움.
- [ ] 브라우저 확인(평판 2열 예제): 휠 확대·끌기·더블클릭, 영역 그리기 → 표 표시, 작은 카드 테두리, 관측면 다시 지정 → 지워짐. 커밋 `feat(m3): select a 2D region and compare its uniformity`
