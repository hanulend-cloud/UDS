# 확산판 Mie 전환 1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 이 저장소 규칙: 에이전트는 사용자가 요청할 때만 — 기본은 이 세션에서 inline 실행. 모든 테스트 통과(fails=0) 전에는 커밋·푸시 금지. 커밋 전 `git pull --rebase`. untracked `*.uds` 3개는 건드리지 않음.

**Goal:** 실측 DB 가 아닌 일반 Milky 소재의 모든 확산 계산을 수지별 기본 비드 Mie 로 바꾼다(Milky 뜻 유지, 흡수는 비드 농도에 묶음, 3D 는 델타 절단).

**Architecture:** `mie.js` 에 크기 분포 Mie 를 더하고, 새 `mie-preset.js` 가 수지별 기본 비드·절단 위상함수·Milky↔농도·흡수를 맡는다. 기본 비드 응답표는 도구 스크립트로 미리 만들어 `data/mie-presets.json` 에 넣고, `runtime.js` 가 주 응답표에 `table.mie[PC|PMMA]`(합성표)로 붙인다. `optics.js` 의 일반 Milky 분기와 `directLit.js`(평면 L2)가 이것을 쓴다. 실측 DB 소재 경로는 이번 단계에서 바꾸지 않는다(3단계).

**Tech Stack:** Node ESM 테스트(`test/*.mjs`, `ok/done` from `test/mech3d-util.mjs`), 브라우저 ES 모듈, WebGPU WGSL(위상표는 기존 `inv` 배열 경로 재사용).

**Spec:** `docs/superpowers/specs/2026-11-20-diffuser-mie-model-design.md` §3

---

## File Structure
| 파일 | 역할 |
|---|---|
| `src/engine/l2/mie.js` (수정) | `phaseFromTable` 분리, `polyParticleOptics`(로그정규 크기 분포) 추가 |
| `src/engine/l2/mie-preset.js` (새) | `MIE_PRESETS`, `presetKeyForResin`, `presetOptics`, `truncatePhase`, `presetMaterial`(Milky→μs′·μs·g·μa·φ·wt%) |
| `tools/build-mie-preset.mjs` (새) | 기본 비드 Mie 응답표 생성 → `src/engine/l2/data/mie-presets.json` |
| `src/engine/l2/runtime.js` (수정) | 프리셋 표 읽기, `table.mie` 부착(브라우저·버퍼 로더) |
| `test/l2-util.mjs` (수정) | `loadTable()` 도 `table.mie` 부착 |
| `src/engine/l2/milky.js` (수정) | 기준판 `ref` 인자(표·g·n) 추가 — 기본값은 지금과 같음 |
| `src/engine/mech3d/optics.js` (수정) | 일반 Milky → `presetMaterial` + 절단 위상함수 |
| `src/engine/directLit.js` (수정) | 평면 L2 의 일반 Milky → 프리셋 합성표·물성 |
| `test/mie-preset.mjs` (새) | 크기 분포·절단·Milky 눈금·흡수·동등성 |
| `test/mie-preset-report.mjs` (새, 정보) | DB 3종 대비 오차표·같은 Milky 광효율 비교·3D 시간 |
| `package.json` (수정) | `test:m3` 에 `node test/mie-preset.mjs` 추가 |

---

### Task 1: 크기 분포 Mie (`mie.js`)

**Files:** Modify `src/engine/l2/mie.js:53-88` · Create `test/mie-preset.mjs`

- [ ] **Step 1: 실패하는 테스트**

```js
// 확산판 Mie 전환 1단계: node test/mie-preset.mjs
import { particleOptics, polyParticleOptics } from '../src/engine/l2/mie.js';
import { ok, done } from './mech3d-util.mjs';
const near = (a, b, e) => Math.abs(a - b) <= e;

// 크기 분포 — 편차 0 이면 단일 지름과 같음, 편차가 있으면 위상함수 물결이 줄어듦
{
  const one = particleOptics({ d_um: 3, nP: 1.49, nH: 1.586 });
  const p0 = polyParticleOptics({ d_um: 3, sigma: 0, nP: 1.49, nH: 1.586 });
  ok(near(p0.g, one.g, 1e-9) && near(p0.sigmaS, one.sigmaS, 1e-12), '편차 0 = 단일 지름');
  const p = polyParticleOptics({ d_um: 3, sigma: 0.25, nP: 1.49, nH: 1.586 });
  ok(p.g > 0.98 && p.g < 0.995, `PMMA 3µm in PC 분포 g ${p.g.toFixed(4)}`);
  ok(near(p.phase.gNum, p.g, 2e-3), `위상표 ⟨cosθ⟩ ${p.phase.gNum.toFixed(4)} = g`);
  const wig = (ph) => { let s = 0; for (let j = 400; j < 2300; j++) s += Math.abs(Math.log(ph.p[j + 1] / ph.p[j]) - Math.log(ph.p[j] / ph.p[j - 1])); return s; };
  ok(wig(p.phase) < 0.5 * wig(one.phase), '분포 평균 = 위상함수 물결 감소');
  ok(p.vol > 0 && typeof p.phase.sample === 'function' && p.phase.inv.length === 4097, '부피·샘플러·역CDF 표');
}
done();
```

- [ ] **Step 2: 실패 확인** — `node test/mie-preset.mjs` → `polyParticleOptics` 없음(SyntaxError: does not provide an export).

- [ ] **Step 3: 구현** — `miePhase` 의 표→CDF→역CDF 부분을 `phaseFromTable(th, p, extra)` 로 분리하고(miePhase 는 이것을 호출하도록 바꿈, 결과 동일), 아래를 추가:

```js
// 위상함수 표(θ 격자, 비정규 p) → 정규화 p, CDF, ⟨cosθ⟩, 역CDF(4096) 샘플러
export function phaseFromTable(th, p, extra = {}) {
  const K = th.length, mu = Array.from(th, Math.cos), cdf = new Float64Array(K);
  for (let j = 1; j < K; j++) cdf[j] = cdf[j - 1] + 0.5 * (p[j] + p[j - 1]) * (mu[j - 1] - mu[j]);
  const tot = cdf[K - 1];
  for (let j = 0; j < K; j++) cdf[j] /= tot;
  let gNum = 0;
  for (let j = 1; j < K; j++) gNum += 0.5 * (p[j] * mu[j] + p[j - 1] * mu[j - 1]) * (mu[j - 1] - mu[j]);
  gNum /= tot;
  const NU = 4096, inv = new Float64Array(NU + 1);
  let j = 1;
  for (let k = 0; k <= NU; k++) {
    const u = k / NU;
    while (j < K - 1 && cdf[j] < u) j++;
    const f = cdf[j] > cdf[j - 1] ? (u - cdf[j - 1]) / (cdf[j] - cdf[j - 1]) : 0;
    inv[k] = mu[j - 1] + f * (mu[j] - mu[j - 1]);
  }
  const sample = (u) => { const t = u * NU, k = Math.min(NU - 1, t | 0), f = t - k; return inv[k] + f * (inv[k + 1] - inv[k]); };
  return { theta: th, p: Float64Array.from(p, (v) => v / tot), cdf, gNum, sample, inv, ...extra };
}

// 로그정규 크기 분포(개수 기준, ln d ~ N(ln d_um, sigma)) — 지름 15점(±2.5σ) 가중.
// 산란 단면적 가중 평균: σ_s = Σwσ_i, p(θ) = Σ w σ_i p_i / σ_s, g = Σ w σ_i g_i / σ_s, 부피 = Σ w v_i
export function polyParticleOptics({ d_um, sigma = 0, nP, kP = 0, nH, lambda_um = 0.55, M = 15 }) {
  if (!(sigma > 0)) return particleOptics({ d_um, nP, kP, nH, lambda_um });
  const zs = Array.from({ length: M }, (_, i) => -2.5 + 5 * i / (M - 1));
  const ws = zs.map((z) => Math.exp(-0.5 * z * z)), wsum = ws.reduce((a, b) => a + b, 0);
  let sigS = 0, sigA = 0, vol = 0, gS = 0, pAcc = null, th = null;
  zs.forEach((z, i) => {
    const o = particleOptics({ d_um: d_um * Math.exp(sigma * z), nP, kP, nH, lambda_um }), w = ws[i] / wsum;
    sigS += w * o.sigmaS; sigA += w * o.sigmaA; vol += w * o.vol; gS += w * o.sigmaS * o.g;
    th ??= o.phase.theta; pAcc ??= new Float64Array(th.length);
    for (let j = 0; j < th.length; j++) pAcc[j] += w * o.sigmaS * o.phase.p[j];
  });
  const g = gS / sigS, ph = phaseFromTable(th, pAcc, { g });
  return { x: Math.PI * d_um * nH / lambda_um, m: nP / nH, g, sigmaS: sigS, sigmaA: sigA, vol, phase: ph, sigma };
}
```

`miePhase` 끝부분은 `return phaseFromTable(th, p, { g: r.g, qsca: r.qsca, qext: r.qext });` 로 바꾼다(정규화된 `p` 를 그대로 넘겨도 `phaseFromTable` 이 다시 정규화하므로 결과 동일).

- [ ] **Step 4: 통과 확인** — `node test/mie-preset.mjs` 전부 ok, `node test/l2-mie.mjs` 회귀 없음.

- [ ] **Step 5: 커밋 보류**(전체 통과 후 Task 10 에서 한 번에 — 판정이 바뀌는 묶음이라 중간 커밋은 테스트 통과 시에만).

---

### Task 2: 기본 비드·절단 위상함수 (`mie-preset.js`)

**Files:** Create `src/engine/l2/mie-preset.js` · Modify `test/mie-preset.mjs`

- [ ] **Step 1: 실패하는 테스트**(test/mie-preset.mjs `done()` 앞에 추가)

```js
import { MIE_PRESETS, presetKeyForResin, presetOptics, truncatePhase } from '../src/engine/l2/mie-preset.js';
{
  ok(presetKeyForResin('PC') === 'PC' && presetKeyForResin('PMMA') === 'PMMA' && presetKeyForResin('ABS') === 'PC', '수지 → 기본 비드(그 밖 = PC)');
  ok(MIE_PRESETS.PC.d_um === 3 && MIE_PRESETS.PMMA.nP === 1.43, '기본 비드 표');
  const o = presetOptics('PC');
  ok(presetOptics('PC') === o, '기본 비드 광학 = 캐시');
  const t = truncatePhase(o.phase, o.g, 5);
  ok(t.f > 0.3 && t.f < 0.95, `전방 5° 안 비율 f ${t.f.toFixed(3)}`);
  ok(t.g < o.g && near((1 - o.g) / (1 - t.g) * t.scale, 1, 1e-12), `절단 g* ${t.g.toFixed(4)} · μs 배율 ${t.scale.toFixed(4)} (μs′ 보존)`);
  ok(near(t.phase.gNum, t.g, 2e-3) && t.phase.inv.length === 4097, '절단 위상표 = 샘플러 형식 같음');
  ok(truncatePhase(o.phase, o.g, 0).scale === 1, '절단 0° = 그대로');
}
```

- [ ] **Step 2: 실패 확인** — 모듈 없음.

- [ ] **Step 3: 구현**

```js
// 확산판 기본 비드(수지별) · 델타 절단 — spec 2026-11-20 §3.1·§3.4.
// 일반 Milky 소재는 이 비드의 Mie 로 계산한다(화면에는 Milky 만). 실측 DB 소재는 DB 값(이 파일 무관).
import { polyParticleOptics, phaseFromTable } from './mie.js';

export const MIE_PRESETS = {
  PC:   { key: 'PC',   host: 'PC',   nH: 1.586, rhoH: 1.20, bead: 'PMMA',     nP: 1.49, rhoP: 1.19, d_um: 3, sigma: 0.25, lambda_um: 0.55 },
  PMMA: { key: 'PMMA', host: 'PMMA', nH: 1.49,  rhoH: 1.19, bead: 'silicone', nP: 1.43, rhoP: 1.32, d_um: 2, sigma: 0.25, lambda_um: 0.55 },
};
export function presetKeyForResin(resin) { return resin === 'PMMA' ? 'PMMA' : 'PC'; }

const cache = new Map();
export function presetOptics(key) {
  if (!cache.has(key)) { const p = MIE_PRESETS[key]; cache.set(key, polyParticleOptics({ d_um: p.d_um, sigma: p.sigma, nP: p.nP, nH: p.nH, lambda_um: p.lambda_um })); }
  return cache.get(key);
}

// 델타 절단: θ < θc 를 직진으로 보고 뺀다. 남은 위상함수(정규화)의 g* 와 μs 배율 scale = (1−g)/(1−g*) — μs′ = μs(1−g) 보존.
export function truncatePhase(phase, g, thetaCDeg) {
  if (!(thetaCDeg > 0)) return { f: 0, g, scale: 1, phase };
  const tc = thetaCDeg * Math.PI / 180, th = phase.theta;
  let k = 0; while (k < th.length - 1 && th[k + 1] <= tc) k++;
  const f = phase.cdf[k];
  const th2 = th.slice(k), p2 = phase.p.slice(k);
  const ph = phaseFromTable(th2, p2);
  const gT = ph.gNum;
  return { f, g: gT, scale: (1 - g) / (1 - gT), phase: { ...ph, g: gT } };
}
```

- [ ] **Step 4: 통과 확인** — `node test/mie-preset.mjs`.

---

### Task 3: 기본 비드 응답표 생성 (`tools/build-mie-preset.mjs`)

**Files:** Create `tools/build-mie-preset.mjs` · Create `src/engine/l2/data/mie-presets.json`

- [ ] **Step 1: 스크립트 작성**

```js
// 기본 비드 Mie 응답표 생성: node tools/build-mie-preset.mjs [--quick]
// 결과 src/engine/l2/data/mie-presets.json = { version, presets: { PC: { preset, g, meta, b64, V13 }, PMMA: {...} } }
import fs from 'node:fs';
import { buildMieTable, compositeTable, checkTransition, STD_ROWS } from '../src/engine/l2/mie-material.js';
import { MIE_PRESETS, presetOptics } from '../src/engine/l2/mie-preset.js';
import { f32ToB64 } from '../src/model/materials-db.js';
import { loadTable } from '../test/l2-util.mjs';

const quick = process.argv.includes('--quick'), main = loadTable(), out = { version: 1, created: new Date().toISOString(), presets: {} };
for (const key of Object.keys(MIE_PRESETS)) {
  const p = MIE_PRESETS[key], opt = presetOptics(key), t0 = Date.now();
  const sys = buildMieTable({ opt, n: p.nH, tauMax: 4, rows: STD_ROWS, N: quick ? 4000 : 20000, seed: 21,
    onProgress: (f) => process.stdout.write(`\r${key} ${(f * 100).toFixed(0)}%`) });
  const V13 = checkTransition(sys.table, main, opt.g, p.nH);
  console.log(`\n${key}: g ${opt.g.toFixed(4)} · ${(Date.now() - t0) / 1000}s · V13 ${V13.value.toFixed(4)} ${V13.ok ? 'ok' : 'FAIL'}`);
  if (!V13.ok && !quick) throw new Error(`${key} V13 불합격 — 표를 넣지 않음`);
  out.presets[key] = { preset: p, g: opt.g, meta: sys.meta, b64: f32ToB64(sys.data), V13 };
}
fs.writeFileSync(new URL('../src/engine/l2/data/mie-presets.json', import.meta.url), JSON.stringify(out));
```

- [ ] **Step 2: 빠른 실행으로 경로 확인** — `node tools/build-mie-preset.mjs --quick` → 두 프리셋 g 출력, 파일 생성.
- [ ] **Step 3: 정식 실행(백그라운드, 수 분)** — `node tools/build-mie-preset.mjs` → V13 둘 다 ok. 실패하면 멈추고 V13 값을 사용자에게 보고(τ′_M·광자 수 조정은 결정 받기).
- [ ] **Step 4: 파일 크기 확인** — `ls -l src/engine/l2/data/mie-presets.json` 이 1 MB 이하인지(넘으면 보고).

---

### Task 4: 런타임에 프리셋 표 붙이기 (`runtime.js`, `test/l2-util.mjs`)

**Files:** Modify `src/engine/l2/runtime.js:12-40`, `test/l2-util.mjs:16-29` · Test `test/mie-preset.mjs`

- [ ] **Step 1: 실패하는 테스트**

```js
import { loadTable } from './l2-util.mjs';
const table = loadTable();
{
  ok(table.mie?.PC && table.mie?.PMMA, '주 응답표에 기본 비드 합성표(table.mie) 부착');
  const q = table.mie.PC.query(1, table.mie.PC.g, 1.586, table.diffuseRow, 0);
  ok(q.Tb + q.Ts > 0 && q.Tb + q.Ts < 1 && table.mie.PC.phaseKey === 'preset:PC', `합성표 질의 T ${(q.Tb + q.Ts).toFixed(3)} · phaseKey`);
}
```

- [ ] **Step 2: 실패 확인** — `table.mie` 없음.
- [ ] **Step 3: 구현** — `runtime.js` 에 공용 함수 추가, `initL2` 가 raw 에 `presets` 를 받으면 붙임:

```js
import { compositeTable } from './mie-material.js';
import { b64ToF32 } from '../../model/materials-db.js';
// 기본 비드 응답표(mie-presets.json) → table.mie[key] = 합성표(+ g, preset). 없으면 붙이지 않음(일반 Milky 계산이 오류를 냄 — 조용한 HG 대체 없음)
export function attachPresets(table, presets) {
  if (!presets?.presets) return table;
  table.mie = {};
  for (const [key, e] of Object.entries(presets.presets)) {
    const c = compositeTable(createTable(e.meta, b64ToF32(e.b64)), table, `preset:${key}`);
    table.mie[key] = Object.assign(c, { g: e.g, preset: e.preset });
  }
  return table;
}
```

`initL2` 안: `const { meta, data, refAD, presets } = await loader(); raw = { meta, data, refAD, presets }; const table = attachPresets(createTable(meta, data), presets);`
`browserLoader`: `Promise.all` 에 `get('mie-presets.json').then((r) => r.json())` 를 더해 `presets` 로 반환.
`test/l2-util.mjs`: `loadPresets()` = `JSON.parse(fs.readFileSync(new URL('../src/engine/l2/data/mie-presets.json', import.meta.url)))`; `loadTable()` 은 `attachPresets(createTable(meta, readData(meta)), loadPresets())`; `nodeLoader` 반환에 `presets: loadPresets()`.
- [ ] **Step 4: 통과 확인** — `node test/mie-preset.mjs`, `node test/mech3d-mc.mjs`(Worker 가 bufferLoader 로 raw 를 넘겨도 동작).

---

### Task 5: Milky 눈금 기준판 인자 (`milky.js`)

**Files:** Modify `src/engine/l2/milky.js` · Test `test/mie-preset.mjs`

- [ ] **Step 1: 실패하는 테스트**

```js
import { milkyFromMusR, musRFromMilky, presetRef } from '../src/engine/l2/milky.js';
{
  const ref = presetRef(table, 'PC');
  ok(ref.table === table.mie.PC && ref.g === table.mie.PC.g && ref.n === 1.586 && ref.t === 2, '기본 비드 기준판 = 2mm · 그 비드 g · 모재 n');
  for (const m of [0.5, 3, 5, 8]) ok(near(milkyFromMusR(table, musRFromMilky(table, m, ref), ref), m, 1e-6), `Mie 눈금 왕복 Milky ${m}`);
  ok(milkyFromMusR(table, 1) === milkyFromMusR(table, 1, undefined), '기준판 없음 = 지금 눈금 그대로(실측 DB 경로)');
  let prev = -1, mono = true; for (let m = 0.2; m < 9.9; m += 0.4) { const r = musRFromMilky(table, m, ref); mono &&= r > prev; prev = r; }
  ok(mono, 'Milky ↑ = μs′ ↑ (단조)');
}
```

- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현**

```js
// ref = { table, t, n, g } — 없으면 지금 기준판(주 응답표, 2mm, n 1.59, HG g 0.9). 일반 Milky 는 presetRef(기본 비드 Mie).
export function presetRef(table, key) { const c = table.mie?.[key]; if (!c) throw new Error(`기본 비드 응답표 없음(${key})`); return { table: c, t: MILKY_REF.t, n: c.preset.nH, g: c.g }; }
function Tref(table, musR, ref) {
  const tb = ref?.table ?? table, t = ref?.t ?? MILKY_REF.t, g = ref?.g ?? MILKY_REF.g, n = ref?.n ?? MILKY_REF.n;
  const q = tb.query(musR * t, g, n, table.diffuseRow, 0);
  return q.Tb + q.Ts;
}
export function milkyFromMusR(table, musR, ref) {
  if (!(musR > 0)) return 0;
  if (!Number.isFinite(musR)) return 10;
  const m = 10 * (1 - Tref(table, musR, ref) / Tref(table, 0, ref));
  return m < 0 ? 0 : m > 10 ? 10 : m;
}
export function musRFromMilky(table, m, ref) {
  if (!(m > 0)) return 0;
  if (m >= 10) return Infinity;
  let lo = Math.log(1e-6), hi = Math.log(1e8);
  for (let i = 0; i < 90; i++) { const mid = 0.5 * (lo + hi); if (milkyFromMusR(table, Math.exp(mid), ref) < m) lo = mid; else hi = mid; }
  return Math.exp(0.5 * (lo + hi));
}
```

- [ ] **Step 4: 통과 확인** + `node test/l2-milky.mjs`(있으면) 회귀 없음.

---

### Task 6: 일반 Milky 물성 + 흡수 보정 (`presetMaterial`)

**Files:** Modify `src/engine/l2/mie-preset.js` · Test `test/mie-preset.mjs`

- [ ] **Step 1: 실패하는 테스트**

```js
import { presetMaterial } from '../src/engine/l2/mie-preset.js';
import { l2Material } from '../src/engine/l2/material.js';
{
  const a = presetMaterial(table, 5, 'PC'), h = l2Material(table, 5, 1.586);
  ok(near(a.mua, h.mua, 1e-12), `Milky 5 흡수 = 지금(HG) 흡수 ${h.mua.toExponential(3)}`);
  ok(a.g === table.mie.PC.g && near(a.mus * (1 - a.g), a.musR, 1e-12), 'μs = μs′/(1−g_Mie)');
  ok(a.phi > 0 && a.wt > 0 && a.wt < 0.2 && a.preset === 'PC', `Milky 5 → 비드 ${(a.wt * 100).toFixed(2)} wt%`);
  const b = presetMaterial(table, 2, 'PC'), c = presetMaterial(table, 8, 'PC');
  ok(b.phi < a.phi && a.phi < c.phi && b.mua < a.mua && a.mua < c.mua, 'Milky ↑ = 농도·흡수 ↑');
  ok(presetMaterial(table, 0, 'PC').mua === presetMaterial(table, 0, 'PC').muaResin, 'Milky 0 = 수지 흡수만');
  ok(presetMaterial(table, 5, 'PMMA').preset === 'PMMA', 'PMMA 모재 = 실리콘 비드');
}
```

- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현**(mie-preset.js 에 추가)

```js
import { musRFromMilky, presetRef } from './milky.js';
import { volumeFractionFromMus, wtFromVolume } from './mie.js';
import { l2Material, MUA_RESIN } from './material.js';

// 흡수 = 수지 + κ_φ·φ. κ_φ 는 Milky 5 에서 지금(HG) 흡수와 같도록 프리셋마다 1회 계산(spec §3.2, 평가 ②)
const kPhiCache = new Map();
function kPhi(table, key) {
  if (!kPhiCache.has(key)) {
    const p = MIE_PRESETS[key], opt = presetOptics(key), g = table.mie[key].g;
    const musR5 = musRFromMilky(table, 5, presetRef(table, key));
    const phi5 = volumeFractionFromMus(opt, musR5 / (1 - g));
    kPhiCache.set(key, (l2Material(table, 5, p.nH).mua - MUA_RESIN) / phi5);
  }
  return kPhiCache.get(key);
}
// 일반 Milky → Mie 물성. 반환 { milky, preset, musR, mus, g, mua, muaResin, phi, wt, n }
export function presetMaterial(table, milky, resin) {
  const key = presetKeyForResin(resin), p = MIE_PRESETS[key], opt = presetOptics(key), g = table.mie[key].g;
  const m = Math.max(0, Math.min(milky ?? 0, 9.999));
  const musR = musRFromMilky(table, m, presetRef(table, key)), mus = musR / (1 - g);
  const phi = volumeFractionFromMus(opt, mus);
  return { milky: m, preset: key, musR, mus, g, mua: MUA_RESIN + kPhi(table, key) * phi, muaResin: MUA_RESIN, phi, wt: wtFromVolume(phi, p.rhoP, p.rhoH), n: p.nH };
}
```

순환 import 확인: `milky.js` 는 `mie-preset.js` 를 import 하지 않음, `material.js` → `milky.js` 만 — 순환 없음.
- [ ] **Step 4: 통과 확인.**

---

### Task 7: 절단 각도 정하기 + 동등성 시험

**Files:** Modify `src/engine/l2/mie-preset.js`(상수 `THETA_C`) · Test `test/mie-preset.mjs`

- [ ] **Step 1: 탐색 스크립트(일회성, scratchpad)** — 2mm·Milky 2/5/8·법선 입사에서 `runSlab` 전체 위상(μs) vs 절단(μs·scale, 절단 위상) 을 θc ∈ {1, 2, 3, 5, 8}° 로 비교, T·R·HPA 차를 출력. 기준(T·R ≤ 0.01, HPA ≤ 1°)을 만족하는 가장 큰 θc 를 고른다.

```js
import { runSlab } from '../src/engine/l2/mc-slab.js';   // scratchpad/theta-c.mjs (저장소 밖)
// for key of PC,PMMA; for m of 2,5,8; a = presetMaterial(table,m,key); tauR = a.musR*2
// full = runSlab({ tau: a.mus*2, g: a.g, n: a.n, inc: 1, N: 40000, seed: 3, phase: presetOptics(key).phase })
// for tc: t = truncatePhase(presetOptics(key).phase, a.g, tc); cut = runSlab({ tau: a.mus*t.scale*2, g: t.g, n: a.n, inc: 1, N: 40000, seed: 3, phase: t.phase })
// 출력: key m tc ΔT ΔR ΔHPA(rec 의 hpa 필드 — mc-slab emptyRecord 참고)
```

- [ ] **Step 2: 결정** — 고른 θc 를 `export const THETA_C = { PC: x, PMMA: y };` 로 넣는다. 기준을 만족하는 θc 가 1° 미만이면 멈추고 보고(속도 목표 재검토 필요).
- [ ] **Step 3: 동등성 테스트 추가(고정 시드, N 20000)**

```js
import { runSlab } from '../src/engine/l2/mc-slab.js';
import { THETA_C } from '../src/engine/l2/mie-preset.js';
for (const key of ['PC', 'PMMA']) for (const m of [2, 5]) {
  const a = presetMaterial(table, m, key), o = presetOptics(key), t = truncatePhase(o.phase, a.g, THETA_C[key]);
  const full = runSlab({ tau: a.mus * 2, g: a.g, n: a.n, inc: 1, N: 20000, seed: 3, phase: o.phase });
  const cut = runSlab({ tau: a.mus * t.scale * 2, g: t.g, n: a.n, inc: 1, N: 20000, seed: 3, phase: t.phase });
  const T = (r) => r.Tb + r.Ts;
  ok(Math.abs(T(full) - T(cut)) <= 0.01 && Math.abs(full.R - cut.R) <= 0.01, `${key} Milky ${m}: 절단 ${THETA_C[key]}° 전후 T·R 차 ≤ 0.01`);
}
```

(`runSlab` 결과 필드 이름은 `mc-slab.js emptyRecord` 를 열어 맞춘다 — Tb/Ts/R 이 레코드에 없으면 `packRecord` 이전 값을 쓰는 이름으로 바꾼다.)
- [ ] **Step 4: 통과 확인.**

---

### Task 8: 3D 일반 Milky = Mie (`optics.js`)

**Files:** Modify `src/engine/mech3d/optics.js:43-47` · Test `test/mech3d-optics.mjs`, `test/mie-preset.mjs`

- [ ] **Step 1: 실패하는 테스트**(test/mie-preset.mjs)

```js
import { partOptics } from '../src/engine/mech3d/optics.js';
import { defaultPart, setPartMaterial, setPartMaterialParam } from '../src/engine/mech3d/materials.js';
{
  const part = setPartMaterialParam(setPartMaterial(defaultPart(0, 'p', 1), 'milky'), 'milky', 5);
  const o = partOptics(part, { table, db: null }), a = presetMaterial(table, 5, 'PC'), t = truncatePhase(presetOptics('PC').phase, a.g, THETA_C.PC);
  ok(o.phase && o.phase.inv.length === 4097, '일반 Milky = Mie 위상표(HG 아님)');
  ok(near(o.mus, a.mus * t.scale, 1e-9) && near(o.g, t.g, 1e-12) && near(o.mua, a.mua, 1e-15), '3D μs = 절단 배율 · g* · 흡수 = 비드 농도');
  ok(near(o.mus * (1 - o.g), a.musR, 1e-9), '3D 에서도 μs′ 보존');
  const o2 = partOptics(setPartMaterialParam(part, 'milky', 3), { table, db: null });
  ok(o2.phase === o.phase && o2.g === o.g, 'Milky 만 바꾸면 위상함수·g 같음(재가중 최적화 조건)');
}
```

- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** — optics.js 일반 Milky 분기:

```js
import { presetMaterial, presetOptics, truncatePhase, THETA_C } from '../l2/mie-preset.js';
const cutCache = new Map();
function presetCut(key, g) { if (!cutCache.has(key)) cutCache.set(key, truncatePhase(presetOptics(key).phase, g, THETA_C[key])); return cutCache.get(key); }
// ...
  if (!ent) {
    const a = presetMaterial(table, Math.min(m.milky, MILKY_UI_MAX), m.resin), t = presetCut(a.preset, a.g);
    return { transmissive: true, n: n0, mus: a.mus * t.scale, g: t.g, mua: a.mua, phase: t.phase };
  }
```

(`n0` 는 지금처럼 부품 수지 굴절률. 표의 n 은 프리셋 모재 n — 차이는 PC 1.586 vs 측정값 수준이라 그대로 둠.)
- [ ] **Step 4: 통과 확인** — `node test/mie-preset.mjs`, `node test/mech3d-optics.mjs`: 지금 HG 값을 기대하는 일반 Milky 검사(예: `l2Material` 과 같은 μs)는 실패한다 → 새 기준(presetMaterial)으로 기대값을 바꾸고, 바꾼 줄을 Task 10 보고 목록에 적는다.

---

### Task 9: 평면 L2(`directLit.js`)의 일반 Milky

**Files:** Modify `src/engine/directLit.js:240-250, 560-570`

- [ ] **Step 1: 실패하는 테스트**(test/mie-preset.mjs) — `l2Describe` 또는 내부 설정 함수가 돌려주는 물성에 `preset` 이 있고 질의 표가 `table.mie.PC` 인지 확인. 먼저 `grep -n "function .*set\|export function l2Describe" src/engine/directLit.js` 로 240~250 줄을 감싼 함수 이름과 반환 모양을 읽고 그 함수로 테스트를 쓴다:

```js
// 예(함수 이름은 위 grep 결과로 맞춤): const s = l2Set(st, spec); ok(s.table === table.mie.PC && s.mat.preset === 'PC', '평면 L2 일반 Milky = 기본 비드 Mie 표');
```

- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** — 실측 DB 가 아닌 분기의 `l2Material(st.table, l2.milky, n)` 을 `presetMaterial(st.table, l2.milky, n < 1.55 ? 'PMMA' : 'PC')` 로, 그 분기에서 쓰는 표를 `st.table.mie[mat.preset]` 로 바꾼다(실측 Mie 소재가 `compositeTable` 을 고르는 26~30 줄과 같은 자리). 566 줄 쪽도 같은 규칙.
- [ ] **Step 4: 통과 확인** — `npm test`(평면 계산 스모크), 바뀐 기대값은 Task 10 목록에 적는다.

---

### Task 10: 정보 보고 · 전체 테스트 · 커밋

**Files:** Create `test/mie-preset-report.mjs` · Modify `package.json`

- [ ] **Step 1: 보고 스크립트**(통과·실패 없음, 표만 출력)

```js
// 정보: node test/mie-preset-report.mjs — 기본 비드 대표성(DB 3종) · 같은 Milky 광효율 · 3D 시간
import fs from 'node:fs';
import { loadTable } from './l2-util.mjs';
import { presetMaterial } from '../src/engine/l2/mie-preset.js';
import { milkyFromMusR } from '../src/engine/l2/milky.js';
const table = loadTable(), db = JSON.parse(fs.readFileSync(new URL('../data/materials-db.json', import.meta.url))).entries ?? [];
const pct = (v) => `${(v * 100).toFixed(1)}%`;
for (const e of db.filter((x) => x.samples?.length)) {
  const m = milkyFromMusR(table, e.fitted.musR), a = presetMaterial(table, m, 'PC'), c = table.mie.PC;
  for (const s of e.samples) {
    const q = c.query(a.musR * s.t, a.g, a.n, 0, a.mua * s.t);
    console.log(`${e.name} t=${s.t}mm Milky ${m.toFixed(2)}: 실측 T ${s.T != null ? pct(s.T) : '-'} · 기본비드 T ${pct(q.Tb + q.Ts)} · 실측 HPA ${s.hpa ?? '-'}°`);
  }
}
```

(HPA 예측은 `l2-advanced.js curveOf` 가 쓰는 함수를 import 해 같은 줄에 붙인다 — `grep -n "hpa" src/engine/l2/*.js` 로 예측 함수 이름 확인.)
- [ ] **Step 2: 3D 시간** — `node test/mech3d-mc.mjs` 실행 시간을 바꾸기 전(`git stash` 로 확인) / 후 비교. 1.3배를 넘으면 멈추고 보고.
- [ ] **Step 3: package.json** — `test:m3` 끝에 `&& node test/mie-preset.mjs` 추가.
- [ ] **Step 4: 전체 테스트** — `npm run test:m3`, `npm test`, `npm run test:mech3d`, `npm run test:mech3d-mc`, `node test/l2-*.mjs` 전부. 판정 기대값이 바뀐 테스트는 새 값으로 고치되, **바뀐 항목·이전 값·새 값 목록**을 만든다. fails=0 확인.
- [ ] **Step 5: 브라우저 확인** — preview `uds-test`(5190) 에서 `ring-12led.uds` 열기(파일은 수정하지 않음) → 정밀 계산 완료, 콘솔 오류 없음, 균일도·효율 값 기록.
- [ ] **Step 6: 커밋**

```bash
git add src/engine/l2/mie.js src/engine/l2/mie-preset.js src/engine/l2/milky.js src/engine/l2/runtime.js src/engine/l2/data/mie-presets.json src/engine/mech3d/optics.js src/engine/directLit.js tools/build-mie-preset.mjs test/mie-preset.mjs test/mie-preset-report.mjs test/l2-util.mjs test/mech3d-optics.mjs package.json
git commit -m "feat(diffuser): general Milky materials now use Mie (resin preset beads) — Milky keeps its meaning, absorption tied to bead fraction, 3D uses delta truncation; judgement values change (list in body)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git pull --rebase && git push
```

- [ ] **Step 7: 사용자 보고** — 바뀐 판정 목록, DB 3종 오차표, 3D 시간 비교, θc, 다음 단계(2단계 개발자 메뉴).

---

## 범위 밖(이 계획)
- 실측 DB 소재(HG·Mie) 경로·DB Milky 표시 — 3단계에서 Mie 재피팅과 함께.
- 반투과(`whiteTrans`) 소재 — 확산판이 아님, 그대로.
- 개발자 메뉴·확산 모델 창·신뢰 표시 — 2단계 계획.
