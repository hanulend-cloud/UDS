# 확산 모델 2단계 a — 「개발자」 메뉴 · 확산 모델 창(보기·신뢰 표시) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상단에 「개발자」 메뉴를 새로 만들어 관리자 모드·소재 DB 관리를 옮기고, Milky 뒤의 Mie 계산을 볼 수 있는 「확산 모델 (Mie)…」 창(대응표·각분포·신뢰 표시)을 추가한다.

**Architecture:** 계산은 DOM 없는 순수 모듈 `src/model/diffusion-model.js`(대응표 행·각분포 곡선·신뢰 표시)로 두고 node 테스트로 검증한다. 창은 `src/ui/m3/diffusion-model-dlg.js` 에 HTML 조립 함수(순수, 테스트 대상)와 DOM 배선(얇게)으로 나눈다. `app.js` 는 컨텍스트(응답표·DB·부품·두께)만 넘기고, `main.js` 메뉴가 연다.

**Tech Stack:** 순수 ES 모듈, node 테스트(`test/*.mjs`, `ok/done` = `test/mech3d-util.mjs`), 인라인 SVG.

**Spec:** `docs/superpowers/specs/2026-11-20-diffuser-mie-model-design.md` §4

---

## 범위 나눔 (2a / 2b)

§4 를 둘로 나눈다. 이 문서는 **2a** 만 다룬다.

- **2a (이 계획):** 개발자 메뉴, 확산 모델 창의 보기 기능(기본 비드, 대응표, 위상함수·투과 각분포 그래프), 신뢰 표시 목록.
- **2b (따로 계획):** 관리자 모드의 Mie 값 수정(비드 종류·지름·편차·모재 굴절률)과 .uds 저장.
  - 응답표를 새로 만드는 데 node 기준 프리셋 하나당 4~5분이 걸렸다. 스펙의 30~100초보다 길다.
  - 3D·평판 Worker 에 프로젝트별 프리셋을 넘기는 경로도 새로 필요하다.
  - 그래서 2a 를 쓰면서 꼭 필요한지 확인한 뒤 계획한다.

## 결정 사항(스펙 해석)

- **신뢰 표시 4종(§4·§3.6):**
  - `가정`: 소재 이름 없이 Milky 숫자만 넣은 부품, 또는 측정값이 없는 DB 소재.
  - `실측보정`: DB 소재의 맞춤 확인(V6)을 통과한 경우.
  - `실측보정(오차 큼)`: V6 를 통과하지 못한 경우.
  - `측정 범위 밖`: 부품 두께가 측정 두께 범위의 0.5~2배 밖인 경우. 다른 판정보다 우선한다.
- **출처 표시:** DB `status: 'datasheet'` 는 `실측보정` 뒤에 ` · 제조사 자료값` 을 붙인다(카탈로그와 같은 정직 표시).
- **입사각 기준:** 지금 측정값은 모두 법선 입사뿐이고, 엔진이 부품별 입사각 범위를 갖고 있지 않다. 그래서 2a 에서는 판정하지 않고, 창에 "입사각 기준은 BSDF 입사각 측정(3단계) 후" 라고 적는다.
- **부품 두께:** 부품 메시 외곽 크기의 최솟값으로 잡는다(`partMeshInfo(i).size`, 부품 속성 요약과 같은 근사).
- **화면 원칙:**
  - 일반 화면(Milky 입력란·부품 속성)은 바꾸지 않는다.
  - 창 이름과 내용에는 Mie 용어를 쓴다(개발자 메뉴라서 허용).
  - HG 는 쓰지 않는다.
- **창을 여는 조건:** 3D 화면이 열려 있어야 한다(`m3()`). 관리자 모드가 아니어도 연다(보기 전용).

## 파일 구조

| 파일 | 역할 |
|---|---|
| Create `src/model/diffusion-model.js` | 대응표 행, 위상함수·투과 각분포 곡선, 신뢰 표시(순수) |
| Create `src/ui/m3/diffusion-model-dlg.js` | 창 HTML 조립(순수 export)과 DOM 배선 `openDiffusionModelDlg` |
| Modify `src/ui/m3/app.js` | `openDiffusionModel()` export(컨텍스트 수집), 관리자 안내 문구 |
| Modify `src/main.js` | 「개발자」 메뉴, 설정에서 두 항목 제거, `mie-model` 실행 |
| Create `test/diffusion-model.mjs` | 순수 모듈과 HTML 조립, 메뉴 소스 확인 |
| Modify `package.json` | `test:m3` 끝에 `node test/diffusion-model.mjs` |

---

### Task 1: 대응표 행 `milkyMapRows`

**Files:**
- Create: `src/model/diffusion-model.js`
- Test: `test/diffusion-model.mjs`

- [ ] **Step 1: 실패 테스트 작성**

```js
// 확산 모델 창(spec 2026-11-20 §4, 2단계 a): node test/diffusion-model.mjs
import fs from 'node:fs';
import { loadTable } from './l2-util.mjs';
import { ok, done } from './mech3d-util.mjs';
import { milkyMapRows, MAP_MILKY, presetSummary } from '../src/model/diffusion-model.js';

const table = loadTable();
{
  const rows = milkyMapRows(table, 'PC');
  ok(rows.length === MAP_MILKY.length && rows[0].milky === 0 && rows.at(-1).milky === 10, `대응표 Milky ${MAP_MILKY.join(',')}`);
  ok(rows[0].clear === true && rows[0].wt === 0 && rows[0].musR === 0, 'Milky 0 = 투명 수지(비드 0)');
  ok(rows.slice(1).every((r, i) => r.wt > rows[i].wt && r.musR > rows[i].musR && r.T < rows[i].T), 'Milky ↑ → wt%·μs′ ↑, 2 mm 투과율 ↓');
  const r10 = rows.at(-1);
  ok(Math.abs(r10.shield - 0.5) < 1e-12 && r10.mus > 50 * r10.musR, `Milky 10 = 50% 가림 · μs ≫ μs′(g ${r10.g.toFixed(3)})`);
  ok(rows.every((r) => Number.isFinite(r.hpa)), 'HPA 모두 숫자');
  const s = presetSummary('PMMA');
  ok(s.bead === 'silicone' && s.d_um === 2 && s.nH === 1.49 && s.g > 0.98, `PMMA 프리셋 요약(g ${s.g.toFixed(4)})`);
}
done();
```

- [ ] **Step 2: 실패 확인**

Run: `node test/diffusion-model.mjs`
Expected: `ERR_MODULE_NOT_FOUND` (diffusion-model.js 없음)

- [ ] **Step 3: 구현**

```js
// 확산 모델 창의 계산(DOM 없음) — spec 2026-11-20 §4. 대응표·각분포 곡선·신뢰 표시
import { MIE_PRESETS, presetOptics, presetMaterial } from '../engine/l2/mie-preset.js';
import { hpaDeg } from '../engine/l2/slab-table.js';

export const MAP_MILKY = [0, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const MAP_T = 2;   // 대응표의 판 두께(mm) — Milky 정의와 같은 2 mm

const q2 = (table, key, a, t) => table.mie[key].query(a.musR * t, a.g, MIE_PRESETS[key].nH, 0, a.mua * t);

export function presetSummary(key) {
  const p = MIE_PRESETS[key], o = presetOptics(key);
  return { key, host: p.host, nH: p.nH, bead: p.bead, nP: p.nP, d_um: p.d_um, sigma: p.sigma, lambda_um: p.lambda_um, g: o.g };
}

// 행: { milky, shield(가림 비율), wt(질량 분율), phi, musR, mus, g, mua, T(2 mm 전투과), hpa(°), clear }
export function milkyMapRows(table, key, milkies = MAP_MILKY) {
  return milkies.map((m) => {
    const a = presetMaterial(table, m, key), q = q2(table, key, a, MAP_T);
    return { milky: a.milky, shield: a.milky / 20, wt: a.wt, phi: a.phi, musR: a.musR, mus: a.mus, g: a.g, mua: a.mua, T: q.Tb + q.Ts, hpa: hpaDeg(q), clear: !!a.clear };
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `node test/diffusion-model.mjs`
Expected: `all PASS`

- [ ] **Step 5: 커밋**

```bash
git add src/model/diffusion-model.js test/diffusion-model.mjs
git commit -m "feat(diffuser): Milky→Mie map rows for the diffusion-model window"
```

---

### Task 2: 각분포 곡선 `phaseCurve` · `transmitCurve`

**Files:**
- Modify: `src/model/diffusion-model.js`
- Test: `test/diffusion-model.mjs` (`done();` 앞에 블록 추가)

- [ ] **Step 1: 실패 테스트 추가**

```js
import { phaseCurve, transmitCurve } from '../src/model/diffusion-model.js';
{
  const ph = phaseCurve('PC');
  ok(ph.length > 50 && ph[0].deg < 1 && ph.at(-1).deg > 179 && ph.every((p, i) => !i || p.deg > ph[i - 1].deg), '위상함수 0→180° 순서');
  ok(ph[0].rel === 1 && ph.every((p) => p.rel > 0 && p.rel <= 1), '위상함수 정면 = 1 로 정규화');
  const tc = transmitCurve(table, 'PC', 5);
  ok(tc.length >= 20 && tc[0].rel === 1 && tc.every((p) => p.rel >= 0), '투과 각분포(정면 = 1)');
  const half = (c) => c.find((p) => p.rel <= 0.5)?.deg ?? 90;
  ok(half(transmitCurve(table, 'PC', 8)) > half(transmitCurve(table, 'PC', 2)), 'Milky 클수록 투과 각분포가 넓음');
}
```

- [ ] **Step 2: 실패 확인**

Run: `node test/diffusion-model.mjs`
Expected: SyntaxError `does not provide an export named 'phaseCurve'`

- [ ] **Step 3: 구현** (`diffusion-model.js` 에 추가)

```js
import { angEdgeDeg, N_ANG } from '../engine/l2/mc-slab.js';

// 단일 입자 위상함수(크기 분포 평균) — { deg, rel(정면 = 1) }. 로그 축 그래프용, 약 120점으로 솎음
export function phaseCurve(key, pts = 120) {
  const { theta, p } = presetOptics(key).phase, K = theta.length, step = Math.max(1, Math.floor(K / pts)), out = [];
  for (let i = 0; i < K; i += step) out.push({ deg: theta[i] * 180 / Math.PI, rel: p[i] / p[0] });
  if (out.at(-1).deg < theta[K - 1] * 180 / Math.PI) out.push({ deg: theta[K - 1] * 180 / Math.PI, rel: p[K - 1] / p[0] });
  return out;
}

// 판(MAP_T mm)을 지난 산란광의 각도별 광도(/sr, 정면 = 1) — 응답표 ang(각 구간 파워 분율) ÷ 입체각
export function transmitCurve(table, key, milky, t = MAP_T) {
  const a = presetMaterial(table, milky, key), q = q2(table, key, a, t), out = [];
  for (let k = 0; k < N_ANG; k++) {
    const a0 = angEdgeDeg(k) * Math.PI / 180, a1 = angEdgeDeg(k + 1) * Math.PI / 180, dO = 2 * Math.PI * (Math.cos(a0) - Math.cos(a1));
    out.push({ deg: 0.5 * (angEdgeDeg(k) + angEdgeDeg(k + 1)), I: q.ang[k] / dO });
  }
  const I0 = out[0].I || 1;
  return out.map((o) => ({ deg: o.deg, rel: o.I / I0 }));
}
```

- [ ] **Step 4: 통과 확인**

Run: `node test/diffusion-model.mjs` → `all PASS`

- [ ] **Step 5: 커밋**

```bash
git add src/model/diffusion-model.js test/diffusion-model.mjs
git commit -m "feat(diffuser): phase-function and transmitted angular curves for the diffusion-model window"
```

---

### Task 3: 신뢰 표시 `trustLabel` · `trustRows`

**Files:**
- Modify: `src/model/diffusion-model.js`
- Test: `test/diffusion-model.mjs`

- [ ] **Step 1: 실패 테스트 추가**

```js
import { trustLabel, trustRows } from '../src/model/diffusion-model.js';
{
  const db = JSON.parse(fs.readFileSync(new URL('../data/materials-db.json', import.meta.url), 'utf8')).entries;
  const dq = db.find((e) => e.id === 'covestro-dq5142');
  ok(trustLabel({ ent: null }).code === 'assumed' && trustLabel({ ent: null }).label === '가정', '이름 없는 Milky = 가정');
  const t2 = trustLabel({ ent: dq, thick: 2 });
  ok(t2.code === 'fit' && t2.label === '실측보정 · 제조사 자료값', `V6 통과 + 자료값 = ${t2.label}`);
  ok(trustLabel({ ent: { ...dq, status: 'measured' }, thick: 2 }).label === '실측보정', '직접 측정 = 실측보정');
  ok(trustLabel({ ent: { ...dq, validation: { V6: { ok: false } } }, thick: 2 }).code === 'fitBad', 'V6 미달 = 실측보정(오차 큼)');
  ok(trustLabel({ ent: dq, thick: 0.9 }).code === 'range' && trustLabel({ ent: dq, thick: 4.1 }).code === 'range', '두께 측정의 0.5~2배 밖 = 측정 범위 밖');
  ok(trustLabel({ ent: dq, thick: 1 }).code === 'fit' && trustLabel({ ent: dq, thick: 4 }).code === 'fit', '경계(0.5배·2배)는 범위 안');
  ok(trustLabel({ ent: { ...dq, samples: [] } }).code === 'assumed', '측정값 없는 DB 소재 = 가정');
  const parts = [
    { name: '커버', material: { kind: 'milky', milky: 4, dbId: '' } },
    { name: '렌즈', material: { kind: 'milky', milky: 4.6, dbId: 'covestro-dq5142' } },
    { name: '케이스', material: { kind: 'opaque' } },
  ];
  const rows = trustRows({ parts, thickOf: (i) => [2, 6, 3][i], dbGet: (id) => db.find((e) => e.id === id) });
  ok(rows.length === 2 && rows[0].code === 'assumed' && rows[1].code === 'range' && rows[1].name === '렌즈', 'Milky 부품만 · 렌즈 6 mm = 측정 범위 밖');
}
```

- [ ] **Step 2: 실패 확인**

Run: `node test/diffusion-model.mjs`
Expected: SyntaxError `does not provide an export named 'trustLabel'`

- [ ] **Step 3: 구현** (`diffusion-model.js` 에 추가)

```js
// 신뢰 표시(§4·§3.6). 측정 범위 밖(두께가 측정 두께의 0.5~2배 밖)이 가장 우선.
// 입사각 기준은 BSDF 입사각 측정(3단계) 후 — 지금 측정은 모두 법선 입사뿐
export const TRUST = {
  assumed: '가정', fit: '실측보정', fitBad: '실측보정(오차 큼)', range: '측정 범위 밖',
};
export function trustLabel({ ent, thick = null }) {
  const ts = (ent?.samples ?? []).map((s) => s.t).filter((t) => t > 0);
  if (!ent || !ts.length) return { code: 'assumed', label: TRUST.assumed, why: ent ? '측정값 없음 — 기본 비드로 계산' : '소재 이름 없음 — 기본 비드로 계산' };
  const lo = 0.5 * Math.min(...ts), hi = 2 * Math.max(...ts);
  if (thick != null && (thick < lo || thick > hi)) return { code: 'range', label: TRUST.range, why: `부품 ${thick.toFixed(1)} mm · 측정 ${Math.min(...ts)}~${Math.max(...ts)} mm (허용 ${lo}~${hi} mm)` };
  const v6 = ent.validation?.V6, src = ent.status === 'datasheet' ? ' · 제조사 자료값' : '';
  if (v6 && !v6.ok) return { code: 'fitBad', label: TRUST.fitBad + src, why: v6.note ?? '' };
  return { code: 'fit', label: TRUST.fit + src, why: v6?.note ?? '' };
}
// 프로젝트의 Milky 부품마다 { i, name, milky, material(이름), code, label, why }
export function trustRows({ parts, thickOf, dbGet }) {
  const out = [];
  parts.forEach((p, i) => {
    const m = p.material;
    if (m?.kind !== 'milky') return;
    const ent = m.dbId ? dbGet(m.dbId) ?? null : null, thick = thickOf(i);
    out.push({ i, name: p.name, milky: m.milky, material: ent?.name ?? 'Milky (이름 없음)', ...trustLabel({ ent, thick }) });
  });
  return out;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node test/diffusion-model.mjs` → `all PASS`

- [ ] **Step 5: 커밋**

```bash
git add src/model/diffusion-model.js test/diffusion-model.mjs
git commit -m "feat(diffuser): trust labels (assumed / fitted / large error / out of measured range)"
```

---

### Task 4: 「개발자」 메뉴

**Files:**
- Modify: `src/main.js` (메뉴 배열 `setupMenubar` 의 `설정` 항목, `run` 함수)
- Modify: `src/ui/m3/app.js:1970`, `src/ui/m3/app.js:93` (안내 문구)
- Test: `test/diffusion-model.mjs`

- [ ] **Step 1: 실패 테스트 추가** (소스 확인 — main.js 는 DOM 의존이라 import 하지 않음)

```js
{
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const block = (label) => { const i = main.indexOf(`{ label: '${label}', items: [`); return i < 0 ? '' : main.slice(i, main.indexOf('] },', i)); };
  const dev = block('개발자'), set = block('설정');
  ok(dev.includes("id: 'admin'") && dev.includes("id: 'mat-db'") && dev.includes("id: 'mie-model'"), '개발자 메뉴 = 관리자 모드 · 소재 DB 관리 · 확산 모델');
  ok(!set.includes("id: 'admin'") && !set.includes("id: 'mat-db'"), '설정 메뉴에서는 빠짐');
  ok(main.indexOf("label: '개발자'") > main.indexOf("label: '설정'") && main.indexOf("label: '개발자'") < main.indexOf("label: '도움말'"), '메뉴 순서: 설정 → 개발자 → 도움말');
  ok(main.includes("if (id === 'mie-model') return m3app.openDiffusionModel();"), 'mie-model 실행 연결');
  const app = fs.readFileSync(new URL('../src/ui/m3/app.js', import.meta.url), 'utf8');
  ok(!app.includes('설정 > 관리자 모드') && app.includes('개발자 > 관리자 모드'), '안내 문구 = 개발자 > 관리자 모드');
}
```

- [ ] **Step 2: 실패 확인**

Run: `node test/diffusion-model.mjs`
Expected: 5 FAIL (메뉴·문구 없음)

- [ ] **Step 3: 구현**

`src/main.js` 설정 메뉴에서 두 항목과 앞의 구분선을 빼고, 바로 뒤에 개발자 메뉴를 넣는다:

```js
    { label: '설정', items: [
      { id: 'target', label: '목표 균일도 · 계산 정밀도 · 설계 점검 기준…', enabled: m3 },
      { id: 'auto', label: '기구 최적화 기본값 (Milky 상한 · 보완 자동 추가)…', enabled: m3 },
      { id: 'sym', label: '대칭 영역 검토 — 대칭인 칸을 합쳐 빠르게 (최종 판정은 전체 영역)', checked: () => m3app.symOn(), enabled: m3 },
    ] },
    { label: '개발자', items: [
      { id: 'admin', label: '관리자 모드 (소재 DB 관리)', checked: isAdmin },
      { id: 'mat-db', label: '소재 DB 관리…', enabled: () => m3() && isAdmin() },
      '-',
      { id: 'mie-model', label: '확산 모델 (Mie)…', enabled: m3 },
    ] },
```

`run` 안 `mat-db` 줄 아래에 추가:

```js
    if (id === 'mie-model') return m3app.openDiffusionModel();
```

`src/ui/m3/app.js:1970` 문구:

```js
  if (!isAdmin()) { setStatus('소재 DB 관리는 관리자 모드에서 — 개발자 > 관리자 모드'); return; }
```

`src/ui/m3/app.js` 에 임시 export(Task 6 에서 채움):

```js
export function openDiffusionModel() { if (A) openDiffusionModelDlg(diffusionCtx()); }
```

(이 줄은 Task 6 의 `diffusionCtx`·import 와 같이 넣는다. Task 4 단계에서는 메뉴 테스트만 통과시키고 실행은 Task 6 에서 확인 — Task 4 커밋 전에 Task 5·6 을 이어서 해도 된다.)

- [ ] **Step 4: 통과 확인**

Run: `node test/diffusion-model.mjs` → 메뉴 블록 PASS

- [ ] **Step 5: 커밋** (Task 6 까지 마친 뒤 함께 커밋해도 됨 — 메뉴만 있고 창이 없는 상태로 푸시하지 않는다)

---

### Task 5: 창 HTML 조립(순수)

**Files:**
- Create: `src/ui/m3/diffusion-model-dlg.js`
- Test: `test/diffusion-model.mjs`

- [ ] **Step 1: 실패 테스트 추가**

```js
import { mapTableHtml, curveSvg, trustHtml, presetHtml } from '../src/ui/m3/diffusion-model-dlg.js';
import { presetSummary as ps } from '../src/model/diffusion-model.js';
{
  const rows = milkyMapRows(table, 'PC'), h = mapTableHtml(rows);
  ok((h.match(/<tr/g) ?? []).length === rows.length + 1 && h.includes('wt%') && h.includes('μs′') && h.includes('투명 수지'), '대응표 = 머리줄 + Milky 행, Milky 0 은 투명 수지');
  ok(presetHtml(ps('PC')).includes('PMMA') && presetHtml(ps('PC')).includes('3 µm'), '기본 비드 요약');
  const svg = curveSvg([{ name: 'a', pts: phaseCurve('PC') }], { log: true, xMax: 180 });
  ok(svg.startsWith('<svg') && svg.includes('<polyline') && !/NaN|Infinity/.test(svg), '로그 축 곡선 SVG(NaN 없음)');
  const t = trustHtml([{ name: '커버', material: 'Milky (이름 없음)', milky: 4, code: 'assumed', label: '가정', why: 'x' }], []);
  ok(t.includes('커버') && t.includes('가정') && t.includes('입사각'), '신뢰 표시 표 + 입사각 안내');
  ok(!/\bHG\b/.test(h + t + svg), '창 어디에도 HG 없음');
}
```

- [ ] **Step 2: 실패 확인**

Run: `node test/diffusion-model.mjs` → `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: 구현** (`src/ui/m3/diffusion-model-dlg.js`)

```js
// 확산 모델 (Mie) 창 — 개발자 메뉴(spec 2026-11-20 §4, 2단계 a). 보기 전용: 기본 비드 · Milky 대응표 · 각분포 · 신뢰 표시.
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
  const L = 44, B = 26, w = W - L - 8, h = H - B - 8, yMin = 1e-4;
  const X = (d) => L + (Math.min(d, xMax) / xMax) * w;
  const Y = (v) => 8 + (log ? (1 - (Math.log10(Math.max(v, yMin)) - Math.log10(yMin)) / -Math.log10(yMin)) : 1 - Math.max(0, Math.min(1, v))) * h;
  const ticksY = log ? [1, 1e-1, 1e-2, 1e-3, 1e-4] : [0, 0.25, 0.5, 0.75, 1];
  const grid = ticksY.map((v) => `<line x1="${L}" x2="${L + w}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line,#ddd)"/><text x="${L - 4}" y="${(Y(v) + 3).toFixed(1)}" font-size="10" text-anchor="end" fill="currentColor">${log ? `1e${Math.round(Math.log10(v))}` : v}</text>`).join('');
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
```

- [ ] **Step 4: 통과 확인**

Run: `node test/diffusion-model.mjs` → `all PASS`

- [ ] **Step 5: 커밋**

```bash
git add src/ui/m3/diffusion-model-dlg.js test/diffusion-model.mjs
git commit -m "feat(diffuser): diffusion-model window HTML builders (preset, map table, curves, trust)"
```

---

### Task 6: 창 DOM 배선 · app.js 연결

**Files:**
- Modify: `src/ui/m3/diffusion-model-dlg.js` (끝에 `openDiffusionModelDlg`)
- Modify: `src/ui/m3/app.js` (import, `diffusionCtx`, `openDiffusionModel`)
- Modify: `styles.css` (`.dm-*` 몇 줄)
- Modify: `package.json` (`test:m3` 에 `node test/diffusion-model.mjs`)

- [ ] **Step 1: DOM 배선 구현** (`diffusion-model-dlg.js` 끝)

```js
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
```

- [ ] **Step 2: app.js 연결**

import 줄(다른 `./` import 옆):

```js
import { openDiffusionModelDlg } from './diffusion-model-dlg.js';
import { trustRows, trustLabel } from '../../model/diffusion-model.js';
```

`openMaterialDb` 위에:

```js
// 확산 모델 (Mie) 창(개발자 메뉴) — 보기 전용. 부품 두께 = 메시 외곽 크기의 최솟값(부품 속성 요약과 같은 근사)
function diffusionCtx() {
  const db = A.ctx.materialDb?.(), parts = A.store.mspec.parts;
  return { table: A.ctx.l2Table?.(), dbList: db?.list() ?? [], parts, dbGet: (id) => db?.get(id) ?? null,
    thickOf: (i) => { const s = partMeshInfo(i)?.size; return s ? Math.min(...s) : null; }, trustRows, trustLabel };
}
export function openDiffusionModel() { if (A) openDiffusionModelDlg(diffusionCtx()); }
```

- [ ] **Step 3: 스타일** (`styles.css` 끝)

```css
/* 확산 모델 (Mie) 창 — 개발자 메뉴 */
.m3-diffmodel .dm-preset{margin:6px 0 8px}
.m3-diffmodel table{border-collapse:collapse;width:100%;font-size:12px}
.m3-diffmodel th,.m3-diffmodel td{border:1px solid var(--line,#ccd);padding:3px 6px;text-align:right}
.m3-diffmodel .dm-trust td,.m3-diffmodel .dm-trust th{text-align:left}
.m3-diffmodel h4{margin:10px 0 2px;font-size:12px}
.dm-tag{border-radius:8px;padding:0 7px;font-size:11px;white-space:nowrap}
.dm-t-a{background:#eceff3;color:#555}.dm-t-f{background:#e3f3e8;color:#23703f}.dm-t-b{background:#fdf0dc;color:#9a5a00}.dm-t-r{background:#fde6e6;color:#a32020}
```

- [ ] **Step 4: package.json** — `test:m3` 스크립트 끝에 `&& node test/diffusion-model.mjs` 추가.

- [ ] **Step 5: 브라우저 확인** (preview `uds-test`, 5190)
  - 예제 또는 `ring-12led.uds` 를 연다(fetch → DataTransfer → `#file-import`, 파일은 수정하지 않음).
  - 개발자 › 확산 모델 (Mie)… 를 연다. 세 탭이 그려지고 콘솔 오류가 없어야 한다.
  - 신뢰 표시 탭에 Milky 부품(가정)과 DB 3종(실측보정 · 제조사 자료값)이 나와야 한다.
  - 설정 메뉴에 관리자 항목이 없어야 한다.
  - 다크 모드에서 표와 그래프 글자가 보여야 한다.
  - 화면 캡처를 남긴다.

- [ ] **Step 6: 전체 테스트 · 커밋 게이트**

Run: `test`, `test:m3`, `test:mech3d`, `test:mech3d-mc`, `test:l2`, `test:shape`. 모두 exit 0, FAIL = 0 일 때만 커밋한다.

```bash
git add src/main.js src/ui/m3/app.js src/ui/m3/diffusion-model-dlg.js src/model/diffusion-model.js test/diffusion-model.mjs styles.css package.json
git commit -m "feat(dev-menu): Developer menu (admin mode, material DB, diffusion model window)"
git pull --rebase && git push
```

---

## 자체 점검

- **스펙 §4 대응:**
  - 개발자 메뉴와 두 항목 이동 → Task 4.
  - 기본 비드·대응표 → Task 1·5.
  - 위상함수·투과 각분포 → Task 2·5·6.
  - 신뢰 표시 4종 → Task 3·5.
  - Mie 값 수정과 저장 위치 → **2b(범위 밖, 위에 이유)**.
  - Milky 입력란 변화 없음 → 수정 파일에 해당 UI 없음.
- **판정 숫자:** 바뀌지 않는다(보기 전용, 엔진 수정 없음).
- **이름 일관:**
  - `milkyMapRows`, `presetSummary`, `phaseCurve`, `transmitCurve`, `trustLabel`, `trustRows`, `MAP_T`, `MAP_MILKY` 는 Task 1~3 에서 정의하고 Task 5·6 에서 같은 이름으로 쓴다.
  - `openDiffusionModelDlg`, `openDiffusionModel` 은 Task 6 과 Task 4 에서 같은 이름이다.
