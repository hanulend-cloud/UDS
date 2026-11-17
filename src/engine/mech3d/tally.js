// 관측 집계·판정 — spec 2026-10-14 §5 (P3 설계 결정 5·6).
// 광자가 관측면을 나간 지점을 기억했다가(onExit), 그 광자가 관측 방향 ±cone 으로 탈출(onEscape)하면 그 지점의 (s,w) 셀에 더한다.
// runMC3D 는 광자를 하나씩 끝까지 추적하므로, onEscape 직전의 마지막 onExit 가 그 광자의 마지막 출사다.

// 격자: s 칸 = obs.cellS ?? max(1, L/100), w 칸 = obs.cellW ?? max(0.5, 최대폭/8). obs.cell 이 있으면 둘 다 그 값(구버전 호환).
// 셀 면적은 래스터 마스크를 걸으며 구한다(곡선·테이퍼·꺾인 영역에서 (s,w) 셀의 실제 면적은 ds·cw 가 아님).
// w 격자 폭은 영역의 최대 국소 폭(래스터 거리장 최댓값) + 2칸. 유효 = 면적 ≥ 0.5·ds·cw.
// 2D 분포·1D 프로파일 화질 = 정사각 칸 크기(2026-10-30): 저 1.5 · 중 1.0 · 고 0.5 mm — 칸이 작을수록 칸당 광자가 줄어 같은 정확도까지 광자가 더 필요.
// 짧은 면은 길이 10칸 이상, 좁은 면은 폭 4칸 이상이 되게 그 방향만 더 잘게(판정에 칸 수가 모자라지 않게)
// 판정 노이즈(2026-11-03) — 균일도(칸 최저÷최고)는 노이즈만큼 낮게 나옴(실측 같은 설계: 노이즈 1% 0.78~0.79, 0.5% 0.81). 그래서 목표 바로 아래(JUDGE_BAND 안) 미달은 0.5% 까지 계산해 판정. 통과는 더 계산해도 오르기만 하고, 먼 미달은 안 바뀌니 그대로
export const JUDGE_NOISE = 0.005, JUDGE_BAND = 0.03, JUDGE_MS = 300000;   // JUDGE_MS = 최적화에서 0.5% 재계산 한도 5분(2026-11-17 사용자)
export function nearTarget(s, obs) {
  if (!s || s.empty || !Number.isFinite(s.Ulen)) return false;
  const m = Math.min(s.Ulen - obs.targetLen, s.Uwid == null ? Infinity : s.Uwid - obs.targetWid);
  return m < 0 && m >= -JUDGE_BAND;
}
// 겨우 통과(목표와의 차이 < 표준오차 2배)는 판정 오차(표준오차) ±1.0%p 까지(2026-11-17 사용자 — 노이즈 2% 판정이 같은 설계에서 78.6% / 80.3% 로 갈림, 1%p 낮은 안이 통과로 나올 확률 약 16%)
// 오차는 노이즈에 비례 → 필요한 노이즈 = 지금 노이즈 × PASS_SE ÷ 지금 오차(근처인 방향 중 큰 쪽) · 0.5% 아래로는 안 감 · 최적화에서는 PASS_MS(3분) 한도
export const PASS_SE = 0.01, PASS_MS = 180000;
export function sharpNoise(s, obs) {
  if (nearTarget(s, obs)) return JUDGE_NOISE;
  if (!s || s.empty || !Number.isFinite(s.Ulen) || !(s.relNoise > 0)) return null;
  const j = judgeStats(s, obs);
  if (j.all !== 'near') return null;
  const seOf = (v, se) => (Number.isFinite(se) && se > 0 ? se : s.relNoise * v);
  const se = Math.max(j.len === 'near' ? seOf(s.Ulen, s.seLen) : 0, j.wid === 'near' ? seOf(s.Uwid, s.seWid) : 0);
  return se > PASS_SE ? Math.max(JUDGE_NOISE, (s.relNoise * PASS_SE) / se) : null;
}
export const judgeNoise = (s, obs, noise) => { const t = sharpNoise(s, obs); return t == null ? noise : Math.min(noise, t); };
// 화면 판정(2026-11-04) — 목표와의 차이가 노이즈보다 작으면 통과·미달을 가를 수 없어 '근처'. 같은 설계 고화질 3회 실측 0.7925 · 0.802 · 0.8027(표준오차 ≈ 0.004) → 표준오차의 2배.
// 표시만 바꿈 — 최적화의 후보 선택(margin)은 그대로
export const NEAR_SE = 2;
export const uBand = (v, se, relNoise) => NEAR_SE * (Number.isFinite(se) && se > 0 ? se : Number.isFinite(relNoise) && relNoise > 0 ? relNoise * v : 0);
export const uVerdict = (v, t, se, relNoise) => (!Number.isFinite(v) || !Number.isFinite(t) ? '' : Math.abs(v - t) < uBand(v, se, relNoise) ? 'near' : v + 1e-9 >= t ? 'ok' : 'bad');
// 길이·폭 판정 + 전체(하나라도 미달 = bad, 아니면 하나라도 근처 = near)
export function judgeStats(s, obs) {
  if (!s || s.empty) return { len: '', wid: '', all: '' };
  const len = uVerdict(s.Ulen, obs.targetLen, s.seLen, s.relNoise), wid = s.Uwid == null ? '' : uVerdict(s.Uwid, obs.targetWid, s.seWid, s.relNoise);
  return { len, wid, all: len === 'bad' || wid === 'bad' ? 'bad' : len === 'near' || wid === 'near' ? 'near' : 'ok' };
}
// 균일도 표시 — 미달인데 반올림하면 목표와 같아 보일 때만 세 자리(0.795 ✕)
// 균일도 표시 = 내림(판정과 엇갈리지 않게, results-panel.fmtU 와 같음) — 카드는 반올림, 화면은 내림이라 같은 0.7886 이 0.79 와 0.78 로 달랐음(2026-11-05)
// 균일도 표시(2026-11-08) = % 소수 한 자리, 0.1% 단위 내림(판정과 같은 쪽으로) — 어디서나 이 셋만 씀
export const flU = (v) => Math.floor(v * 1000 + 1e-9) / 1000;
export const fmtJudge = (v) => (!Number.isFinite(v) ? '–' : `${(flU(v) * 100).toFixed(1)}%`);
export const fmtTg = (t) => (!Number.isFinite(t) ? '–' : `${+(t * 100).toFixed(1)}%`);   // 목표(입력값 그대로, 80%)
export const fmtDp = (d) => (!Number.isFinite(d) ? '–' : `${d >= 0 ? '+' : '−'}${(Math.round(Math.abs(d) * 1000) / 10).toFixed(1)}%p`);   // 차이
export const GRID_QUALITY = { low: { cell: 1.5 }, mid: { cell: 1 }, high: { cell: 0.5 } };
export function autoCells(L, width, quality) {
  const c = (GRID_QUALITY[quality] ?? GRID_QUALITY.low).cell;
  return { cellS: Math.min(c, L / 10), cellW: Math.min(c, width / 4) };
}
export function tallyGeometry(line, obs) {
  const edge = obs.edgeExcl ?? 0.5, L = line.length, R = line.data.raster;
  let dtMax = 0; for (let k = 0; k < R.mask.length; k++) if (R.mask[k] && R.dt[k] > dtMax) dtMax = R.dt[k];
  const maxHalf = Math.max(line.width / 2, dtMax * R.cell);
  const ac = autoCells(L, 2 * maxHalf, obs.quality), cellS = obs.cell ?? obs.cellS ?? ac.cellS, cell = obs.cell ?? obs.cellW ?? ac.cellW;   // cell = w 칸
  const ns = Math.max(1, Math.round(L / cellS)), ds = L / ns;
  const nw = Math.ceil((2 * (maxHalf + 2 * cell)) / cell), w0 = -nw * cell / 2;
  const area = new Float64Array(ns * nw), areaAll = new Float64Array(ns * nw), pa = R.cell * R.cell, pixOk = new Uint8Array(R.nx * R.ny);
  // areaAll·validAll = 면 전체(가장자리 제외 없음, 2026-11-02) — 2D 표시·TXT 용. 판정(area·valid·acc)은 그대로
  for (let j = 0; j < R.ny; j++) for (let i = 0; i < R.nx; i++) {
    const k = j * R.nx + i;
    if (!R.mask[k]) continue;
    {
      const [s, w] = line.toSW(R.x0 + (i + 0.5) * R.cell, R.y0 + (j + 0.5) * R.cell), wj = Math.floor((w - w0) / cell);
      let si = Math.floor(s / ds);
      if (line.closed) si = ((si % ns) + ns) % ns;
      if (si >= 0 && si < ns && wj >= 0 && wj < nw) areaAll[si * nw + wj] += pa;
    }
    if ((R.dt[k] - 0.5) * R.cell < edge - 1e-9) continue;
    const [s, w] = line.toSW(R.x0 + (i + 0.5) * R.cell, R.y0 + (j + 0.5) * R.cell);
    if (!line.closed && (s < edge || s > L - edge)) continue;
    pixOk[k] = 1;
    let si = Math.floor(s / ds);
    if (line.closed) si = ((si % ns) + ns) % ns; else if (si < 0 || si >= ns) continue;
    const wj = Math.floor((w - w0) / cell);
    if (wj < 0 || wj >= nw) continue;
    area[si * nw + wj] += pa;
  }
  const valid = new Uint8Array(ns * nw);
  // 유효 = 가장자리 제외 뒤 남은 길이(sLen) 기준 면적 절반 이상(2026-11-02) — 칸 전체 기준이면 끝 칸이 화질에 따라 빠져 균일도가 갈렸음(예: 1 mm 칸만 어두운 끝 구간을 건너뜀).
  // 남은 길이가 칸의 25% 미만인 끝 조각은 뺌(면적이 작아 노이즈만 큼)
  for (let i = 0; i < ns; i++) {
    const sLen = line.closed ? ds : Math.min((i + 1) * ds, L - edge) - Math.max(i * ds, edge);
    if (sLen < 0.25 * ds - 1e-9) continue;
    // 기준 = 그 행의 꽉 찬 칸 면적(2026-11-02) — 면적은 픽셀 수로 세어 행마다 몇 % 흔들림. 고정값과 비교하면 폭 가장자리 칸이 딱 절반 걸칠 때 일부 행만 빠져
    // 그 행이 튀었음(어두운 가장자리 제외 → LED 봉우리가 불규칙해 보이고 균일도가 낮게 나옴). 꽉 찬 칸이 없는 행(좁은 면)은 고정값 그대로
    const nominal = sLen * cell; let full = 0;
    for (let j = 0; j < nw; j++) full = Math.max(full, area[i * nw + j]);
    const need = full >= 0.8 * nominal ? 0.495 * full : 0.5 * nominal;
    for (let j = 0; j < nw; j++) { const k = i * nw + j; if (area[k] > 0 && area[k] >= need) valid[k] = 1; }
  }
  const validAll = new Uint8Array(ns * nw);
  for (let k = 0; k < validAll.length; k++) if (areaAll[k] >= 0.1 * ds * cell) validAll[k] = 1;   // 면이 칸의 10% 이상 걸치면 값을 냄(더 작은 조각은 노이즈만 큼)
  // pixOk: 집계 가능한 래스터 픽셀(마스크 안, 경계에서 edgeExcl 이상, 열린 라인이면 끝 제외) — 집계기가 래스터 없이(Worker) 쓰도록 G 에 담음
  return { ns, nw, ds, cell, w0, valid, area, validAll, areaAll, L, closed: line.closed, winS: obs.winS ?? Math.max(5, L / 10), pix: { x0: R.x0, y0: R.y0, cell: R.cell, nx: R.nx, ny: R.ny }, pixOk, pixAll: R.mask };
}

// 휘도(cd/m²)·필요 광속을 재는 각도(2026-11-11, 사용자 확정) — 판정·2D 외관의 보는 각도(obs.cone)와 따로 항상 ±10°
export const LUM_CONE = 10;

// rw = { C: rwCoeffs 결과 } | null — 있으면 관측 셀에 집계되는 탈출마다 Milky 격자 j 별 가중 w·f_j 도 더한다(acc 와 같은 셀 배열을 격자 수만큼 이어 붙임)
// virtual = 관측 부품이 빛 계산에서 빠짐(2026-11-05) — 면을 지나는 출사가 없으니 탈출 광선이 관측 평면을 지나는 점에서 잼(관측면 위치는 라인 인식 값 그대로)
export function makeAccumulator(G, line, obs, rw = null, { virtual = false } = {}) {
  const nP = line.frame.d, hP = virtual ? (([a, b, c]) => a * nP[0] + b * nP[1] + c * nP[2])(line.to3D(0, 0, 0)) : 0;
  const faces = new Set(obs.faces.map((f) => `${f.part}|${f.face}`)), d = obs.dir ?? line.frame.d, cosC = Math.cos(((obs.cone ?? 10) * Math.PI) / 180), cosL = Math.cos((LUM_CONE * Math.PI) / 180);
  const R = G.pix, nCell = G.ns * G.nw, acc = new Float64Array(nCell), accAll = new Float64Array(nCell), cnt = new Uint32Array(nCell);
  const C = rw?.C ?? null, nJ = C ? C.n : 0, racc = C ? new Float64Array(nJ * nCell) : null, sf = C ? new Float64Array(nJ) : null, sf2 = C ? new Float64Array(nJ) : null;
  let lx = 0, ly = 0, lz = 0, has = false, lp = -1, nRw = 0, lumEsc = 0;
  const cosTo = (x, y, z, dx, dy, dz) => { const q = obs.localDir && line.normalAt ? line.normalAt([x, y, z]) : d; return dx * q[0] + dy * q[1] + dz * q[2]; };
  const acc_ = {
    acc, accAll, cnt,
    get rw() { return C ? { acc: racc, sf, sf2, n: nRw } : null; },
    get lumEsc() { return lumEsc; },   // 관측면(제외 구역 뺌)에서 ±LUM_CONE 안으로 나간 광량
    // p = 광자 번호(runMC3D 가 마지막 인자로 전달). 탈출 광자가 마지막 출사 광자와 같을 때만 집계 — 흡수·소실된 광자의 낡은 출사점을 쓰지 않는다.
    onExit(part, face, x, y, z, dx, dy, dz, w, p) { has = faces.has(`${part}|${face}`); lx = x; ly = y; lz = z; lp = p; },
    onEscape(x, y, z, dx, dy, dz, w, p, tL = 0, tK = 0) {   // tL/tK 는 runMC3D 의 track 옵션이 줌 — rw 인데 track 없으면 모든 f = 1
      if (!has || lp !== p) {
        if (!virtual) return;
        const dn = dx * nP[0] + dy * nP[1] + dz * nP[2];
        const c = cosTo(x, y, z, dx, dy, dz), inO = c >= cosC, inL = c >= cosL;
        if (!(dn > 1e-9) || !(inO || inL)) return;
        const t = (hP - (x * nP[0] + y * nP[1] + z * nP[2])) / dn;
        return t >= -1e-6 ? add(x + t * dx, y + t * dy, z + t * dz, w, tL, tK, inO, inL) : undefined;
      }
      has = false;
      const c = cosTo(lx, ly, lz, dx, dy, dz), inO = c >= cosC, inL = c >= cosL;
      if (!inO && !inL) return;
      return add(lx, ly, lz, w, tL, tK, inO, inL);   // 판정에 집계했으면 true(광경로 집계용)
    },
  };
  // 점 → (s,w) 칸에 더함. 점을 래스터 픽셀 중심으로 맞춘 뒤 분류 — 면적(area)을 픽셀 단위로 센 것과 같은 이산화라서 편향이 없다.
  function add(lx, ly, lz, w, tL, tK, inO, inL) {   // inO = 판정 각도 안, inL = 휘도 각도 안
    let counted = false;
    {
      const [qx, qy] = line.to2D([lx, ly, lz]), pi = Math.floor((qx - R.x0) / R.cell), pj = Math.floor((qy - R.y0) / R.cell);
      if (pi < 0 || pj < 0 || pi >= R.nx || pj >= R.ny) return;
      const pk = pj * R.nx + pi, inFace = G.pixAll ? G.pixAll[pk] : G.pixOk[pk];
      if (!inFace) return;
      const [s, ww] = line.toSW(R.x0 + (pi + 0.5) * R.cell, R.y0 + (pj + 0.5) * R.cell);
      let i = Math.floor(s / G.ds);
      if (G.closed) i = ((i % G.ns) + G.ns) % G.ns; else if (i < 0 || i >= G.ns) return;
      const j = Math.floor((ww - G.w0) / G.cell);
      if (j < 0 || j >= G.nw) return;
      const k = i * G.nw + j;
      if (inO) accAll[k] += w;
      if (!G.pixOk[pk]) return;   // 면적(area)과 같은 규칙 — 제외 구역 광자는 판정에 세지 않음(면 전체 accAll 에만)
      if (inL) lumEsc += w;
      if (!inO) return;
      acc[k] += w; cnt[k]++;
      counted = true;
      if (C) {
        nRw++;
        for (let g = 0; g < nJ; g++) { const f = Math.exp(tK * C.lr[g] - C.dm[g] * tL); racc[g * nCell + k] += w * f; sf[g] += f; sf2[g] += f * f; }
      }
    }
    return counted;
  }
  return acc_;
}

// accs: 배치별 누적(같은 광자 수). 값 = 셀 출사/면적(상대 휘도).
// 길이 균일도: s 칸별(폭 방향 유효 셀 면적가중 평균)의 min/max. 폭 균일도: s 창(길이 winS, 유효 s 범위를 균등 분할, 닫힌 경로는 순환)마다
//   창 평균 폭 프로파일(w 칸별 Σ출사/Σ면적, 창 안 면적이 가득 찬 값의 ≥ 50% 인 w 칸만)의 min/max 를 구하고 그 최저를 취한다.
// relNoise = U 를 만드는 값들의 노이즈: 길이 프로파일 s 칸(폭 방향 합) · 폭 판정 창의 w 칸(창 안 s 합) 각각 (배치 간 표준편차/평균)/√B 의 중앙값 중 큰 쪽
//   — min/max 의 낮은 쪽 편향을 만드는 노이즈의 크기. 예전엔 2D 칸 하나하나의 노이즈가라, 관측면이 좁고 효율이 낮으면(ㄱ자 Milky 출구 등)
//   필요한 광자가 수억 개가 되어 수렴하지 않았다(2026-10-28). relNoiseCell = 2D 칸 노이즈(색지도 얼룩 참고용).
// 영역 균일도(2026-11-12, 표시 전용) — rect = { s0, s1, w0, w1 } mm. 격자를 칸 경계로 잘라(바깥쪽으로 맞춤) tallyStats 를 그대로 부름 → 판정과 같은 식.
// 반환 = tallyStats 결과 + { cells:[i0,i1,j0,j1], mm:[s0,s1,w0,w1], meanRatio(영역 평균 / 전체 평균) }
export function regionStats(G, accs, obs, rect) {
  const cl = (v, n) => Math.max(0, Math.min(n, v));
  let i0 = cl(Math.floor(rect.s0 / G.ds + 1e-9), G.ns), i1 = cl(Math.ceil(rect.s1 / G.ds - 1e-9), G.ns);
  let j0 = cl(Math.floor((rect.w0 - G.w0) / G.cell + 1e-9), G.nw), j1 = cl(Math.ceil((rect.w1 - G.w0) / G.cell - 1e-9), G.nw);
  if (i1 <= i0) { i1 = Math.min(G.ns, i0 + 1); i0 = i1 - 1; }
  if (j1 <= j0) { j1 = Math.min(G.nw, j0 + 1); j0 = j1 - 1; }
  const ns = i1 - i0, nw = j1 - j0;
  const crop = (a) => { const o = new a.constructor(ns * nw); for (let i = 0; i < ns; i++) for (let j = 0; j < nw; j++) o[i * nw + j] = a[(i0 + i) * G.nw + j0 + j]; return o; };
  const g = { ...G, ns, nw, valid: crop(G.valid), area: crop(G.area), w0: G.w0 + j0 * G.cell, L: ns * G.ds, closed: false, validAll: undefined, areaAll: undefined };
  const sub = accs.map(crop), st = tallyStats(g, sub, obs);
  const avg = (gg, as) => { let s = 0, ar = 0; for (const a of as) for (let k = 0; k < a.length; k++) if (gg.valid[k]) { s += a[k]; ar += gg.area[k]; } return ar > 0 ? s / ar : NaN; };
  // 면적 균일도(2026-11-13 사용자) = 영역 안 칸 밝기(칸 합 ÷ 칸 면적) 최소/최대 — 길이·폭 단면 평균이 아니라 칸 하나하나
  let mn = Infinity, mx = -Infinity;
  for (let k = 0; k < ns * nw; k++) if (g.valid[k] && g.area[k] > 0) { let v = 0; for (const a of sub) v += a[k]; v /= g.area[k]; mn = Math.min(mn, v); mx = Math.max(mx, v); }
  const Uarea = mx > 0 && Number.isFinite(mn) ? mn / mx : null;
  return { ...st, Uarea, cells: [i0, i1, j0, j1], mm: [i0 * G.ds, i1 * G.ds, G.w0 + j0 * G.cell, G.w0 + j1 * G.cell], meanRatio: avg(g, sub) / avg(G, accs) };
}
// ---- 노이즈 보정 추정(2026-11-15) — 빠른 검토 값에만 씀(판정 값 Ulen·Uwid 는 그대로) ----
// 최저÷최고는 칸 노이즈만큼 낮게 나옴(실측, 링 조명 예제: 같은 설계 15만 광자 36% · 150만 62% — 광자를 늘릴수록 계속 오름).
// 칸 값을 주기 성분(DCT)으로 나눠 노이즈 수준(2·ln n × 노이즈 분산)을 넘는 성분만 남기고(LED 간격 리플·완만한 기울기),
// 남은 차이에서 이어진 칸이 함께 벗어난 곳(끝 어두움 같은 국소 모양, 4.5σ)을 되살린 뒤 최저÷최고를 냄.
// 실측(같은 예제): 15만 72.8% · 30만 73.3% · 75만 74.0% · 150만 72.4% — 광자 수와 무관하게 같은 값.
// 오차 = 묶음 하나씩 빼고 다시 낸 값의 퍼짐(잭나이프) ⊕ 노이즈에 묻혀 못 보는 리플 크기. vecs = 묶음마다 칸 값(NaN = 안 쓰는 칸)
const COS = new Map();
const cosTab = (n) => { let c = COS.get(n); if (!c) { c = new Float64Array(4 * n); for (let j = 0; j < 4 * n; j++) c[j] = Math.cos((Math.PI * j) / (2 * n)); if (COS.size > 8) COS.clear(); COS.set(n, c); } return c; };
export function denoiseProfile(mean, nv) {
  const n = mean.length, C = cosTab(n), M = 4 * n, Vn = nv.reduce((x, y) => x + y, 0) / n, thr = 2 * Math.log(n) * Vn, out = new Float64Array(n), w0 = Math.sqrt(1 / n), w1 = Math.sqrt(2 / n);
  let s0 = 0; for (let i = 0; i < n; i++) s0 += mean[i];
  out.fill(s0 / n);
  for (let k = 1; k < n; k++) {
    let s = 0; for (let i = 0, j = k; i < n; i++, j = (j + 2 * k) % M) s += mean[i] * C[j];
    const X = s * w1, p = X * X; if (!(p > thr)) continue;
    const Y = Math.sign(X) * Math.sqrt(p - Vn) * w1; for (let i = 0, j = k; i < n; i++, j = (j + 2 * k) % M) out[i] += Y * C[j];
  }
  for (const w of [16, 8, 4]) for (const off of [0, w >> 1]) for (let i = off; i + w <= n; i += w) {   // 국소 모양 되살리기
    let r = 0, v = 0; for (let q = i; q < i + w; q++) { r += mean[q] - out[q]; v += nv[q]; }
    v = Math.max(v, w * Vn);   // 광자가 적으면 칸별 분산 추정이 흔들림 — 전체 평균보다 작게 보지 않음
    if (v > 0 && Math.abs(r) > 4.5 * Math.sqrt(v)) for (let q = i; q < i + w; q++) out[q] += r / w;
  }
  return { out, hid: Math.sqrt((2 * thr) / n), w0 };
}
const estU = (vecs) => {
  const B = vecs.length, n = vecs[0].length, mean = [], nv = [];
  for (let i = 0; i < n; i++) { let s = 0, ok = true; for (const v of vecs) { if (!Number.isFinite(v[i])) { ok = false; break; } s += v[i]; } if (!ok) continue; const m = s / B; let q = 0; for (const v of vecs) q += (v[i] - m) ** 2; mean.push(m); nv.push(q / (B - 1) / B); }
  if (mean.length < 2) return null;
  const m = mean.reduce((x, y) => x + y, 0) / mean.length;
  if (!(m > 0)) return null;
  if (mean.length < 4) { const mx = Math.max(...mean); return { U: mx > 0 ? Math.min(...mean) / mx : 0, hid: Math.sqrt(nv.reduce((x, y) => x + y, 0) / nv.length) / m }; }
  const { out, hid } = denoiseProfile(mean, nv); let mn = Infinity, mx = -Infinity; for (const v of out) { if (v < mn) mn = v; if (v > mx) mx = v; }
  return { U: mx > 0 ? Math.max(0, mn) / mx : 0, hid: hid / m };
};
// groups = 창마다 vecs — 값 = 창 중 가장 낮은 추정값
export function debiasU(vecs, groups = null) {
  const G = groups ?? [vecs], B = G[0]?.length ?? 0;
  if (B < 3) return null;
  const one = (skip) => { let best = null; for (const g of G) { const r = estU(skip < 0 ? g : g.filter((_, b) => b !== skip)); if (r && (!best || r.U < best.U)) best = r; } return best; };
  const all = one(-1); if (!all) return null;
  const jk = []; for (let b = 0; b < B; b++) { const r = one(b); if (r) jk.push(r.U); }
  const jm = jk.reduce((x, y) => x + y, 0) / (jk.length || 1), seJ = jk.length > 1 ? Math.sqrt(((jk.length - 1) / jk.length) * jk.reduce((x, y) => x + (y - jm) ** 2, 0)) : 0;
  // 노이즈에 묻혀 못 본 리플(진폭 hid)이 있으면 균일도는 최대 2·hid 만큼 낮음 — 값은 그 절반만큼 낮추고 오차에 2·hid 를 넣음
  // (실측: Milky 5 · 10초에서 리플이 묻혀 100% 로 나왔음 — 그대로 두면 '유력' 으로 잘못 나옴)
  return { U: Math.max(0, all.U - all.hid), se: Math.hypot(seJ, 2 * all.hid) };
}
// 폭 = 가장 나쁜 창(판정 뜻 그대로). 창 하나는 광자가 적어 따로 보정이 안 되므로(실측: 0% 로 나옴) 폭 칸마다 창 값을 길이 방향으로 보정한 뒤
// 창별 최저÷최고를 냄(창 값은 길이 방향으로 완만 — 이웃 창의 광자를 함께 씀). cols[b][wi][j] · NaN = 안 쓰는 칸
const WID_TRUST = 0.25;
const widthEst = (colsB) => {
  const B = colsB.length, nWin = colsB[0].length, nw = colsB[0][0]?.length ?? 0, D = Array.from({ length: nWin }, () => new Float64Array(nw).fill(NaN));
  let hs = 0, hc = 0;
  for (let j = 0; j < nw; j++) {
    const idx = [], mean = [], nv = [];
    for (let wi = 0; wi < nWin; wi++) { let s = 0, ok = true; for (const c of colsB) { const v = c[wi][j]; if (!Number.isFinite(v)) { ok = false; break; } s += v; } if (!ok) continue; const m = s / B; let q = 0; for (const c of colsB) q += (c[wi][j] - m) ** 2; idx.push(wi); mean.push(m); nv.push(B > 1 ? q / (B - 1) / B : 0); }
    if (!idx.length) continue;
    const m = mean.reduce((x, y) => x + y, 0) / mean.length;
    // 이 칸의 창별 값을 믿을 수 있을 때만 길이 방향 변화를 씀 — 못 믿으면(못 보는 리플이 평균의 25% 이상) 모든 창의 평균으로(실측: Milky 5 · 10초에 폭 0%)
    const Vn = nv.reduce((x, y) => x + y, 0) / nv.length;
    let out = mean, hid = Math.sqrt(Vn);
    if (idx.length >= 4) { const r = denoiseProfile(mean, nv); if (m > 0 && r.hid / m < WID_TRUST) ({ out, hid } = r); else { out = mean.map(() => m); hid = Math.sqrt(Vn / idx.length); } }
    idx.forEach((wi, q) => { D[wi][j] = out[q]; });
    if (m > 0) { hs += hid / m; hc++; }
  }
  let U = Infinity, iWin = -1;
  D.forEach((row, wi) => { let mn = Infinity, mx = -Infinity, c = 0; for (const v of row) if (Number.isFinite(v)) { c++; if (v < mn) mn = v; if (v > mx) mx = v; } if (c < 2) return; const u = mx > 0 ? Math.max(0, mn) / mx : 0; if (u < U) { U = u; iWin = wi; } });
  return iWin < 0 ? null : { U, iWin, hid: hc ? hs / hc : 0 };
};
const debiasW = (colsB) => {
  const B = colsB.length; if (B < 3) return null;
  const all = widthEst(colsB); if (!all) return null;
  const jk = []; for (let b = 0; b < B; b++) { const r = widthEst(colsB.filter((_, q) => q !== b)); if (r) jk.push(r.U); }
  const jm = jk.reduce((x, y) => x + y, 0) / (jk.length || 1), seJ = jk.length > 1 ? Math.sqrt(((jk.length - 1) / jk.length) * jk.reduce((x, y) => x + (y - jm) ** 2, 0)) : 0;
  return { U: all.U, se: Math.hypot(seJ, 2 * all.hid), iWin: all.iWin };   // 폭은 가장 나쁜 창을 고르는 것만으로 낮은 쪽이라 더 낮추지 않음
};
const estOf = (per, narrow) => {
  const L = debiasU(per.map((x) => x.p)), W = narrow ? null : debiasW(per.map((x) => x.cols));
  return L ? { Ulen: L.U, seLen: L.se, Uwid: W?.U ?? null, seWid: W?.se ?? null, iWin: W?.iWin ?? -1 } : null;
};
// 판정 값 Ulen·Uwid = 노이즈 보정값(2026-11-15 사용자: 정밀 판정에도 보정값) · seLen·seWid = 그 오차. 그대로 값(최저÷최고)은 rawUlen·rawUwid.
// 묶음이 3개 미만이면 보정하지 않음(그대로 값)
export function tallyStats(G, accs, obs, cnts = null) {
  const B = accs.length, nCell = G.ns * G.nw, { ns, nw, ds, area, valid } = G;
  let nValid = 0; for (let k = 0; k < nCell; k++) if (valid[k]) nValid++;
  const empty = { empty: true, profile: new Float64Array(ns).fill(NaN), map: new Float64Array(nCell), Ulen: 0, seLen: null, Uwid: null, seWid: null, sWorst: null, passLen: false, passWid: false, counted: 0, nbar: 0, relNoise: null, noiseWarn: true, win: null };
  if (nValid === 0) return empty;
  // s 창 분할
  let i0 = 0, i1 = ns - 1;
  if (!G.closed) { while (i0 < ns && !rowHas(i0)) i0++; while (i1 > i0 && !rowHas(i1)) i1--; }
  function rowHas(i) { for (let j = 0; j < nw; j++) if (valid[i * nw + j]) return true; return false; }
  const span = G.closed ? ns : i1 - i0 + 1, wb = Math.max(1, Math.round((G.winS ?? 5) / ds)), nWin = Math.max(1, G.closed ? Math.round(ns / wb) : Math.floor(span / wb));
  const wins = Array.from({ length: nWin }, (_, k) => [i0 + Math.round((k * span) / nWin), i0 + Math.round(((k + 1) * span) / nWin)]);
  const analyze = (a) => {   // a: 합산 또는 배치 누적(Float64Array)
    const p = new Float64Array(ns).fill(NaN);
    for (let i = 0; i < ns; i++) { let s = 0, ar = 0; for (let j = 0; j < nw; j++) if (valid[i * nw + j]) { s += a[i * nw + j]; ar += area[i * nw + j]; } if (ar > 0) p[i] = s / ar; }
    let mn = Infinity, mx = -Infinity; for (const v of p) if (Number.isFinite(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    const Ulen = mx > 0 ? mn / mx : 0;
    let Uwid = Infinity, iWin = -1;
    const cols = [];   // 창별 w 칸 값(쓰지 않는 칸 = NaN — 배치끼리 같은 자리)
    wins.forEach(([s0, s1], wi) => {
      const col = [], all = [];
      for (let j = 0; j < nw; j++) {
        let s = 0, ar = 0; for (let i = s0; i < s1; i++) { const ii = i % ns, k = ii * nw + j; s += a[k]; ar += area[k]; }
        if (ar >= 0.5 * (s1 - s0) * ds * G.cell) { col.push(s / ar); all.push(s / ar); } else all.push(NaN);
      }
      cols.push(all);
      if (col.length < 2) return;
      const cm = Math.min(...col), cx = Math.max(...col), u = cx > 0 ? cm / cx : 0;
      if (u < Uwid) { Uwid = u; iWin = wi; }
    });
    return { p, Ulen, Uwid: iWin < 0 ? null : Uwid, iWin, cols };
  };
  const sum = new Float64Array(nCell); for (const a of accs) for (let k = 0; k < nCell; k++) sum[k] += a[k];
  const main = analyze(sum), narrow = main.Uwid === null;
  const mean = new Float64Array(nCell); for (let k = 0; k < nCell; k++) if (valid[k]) mean[k] = sum[k] / B / area[k];
  const per = accs.map(analyze);
  const sd = (k) => { const v = per.map((x) => x[k]).filter((x) => x !== null); if (v.length < 3) return null; const m = v.reduce((s, x) => s + x, 0) / v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1) / v.length); };
  const seLen = B < 3 ? null : sd('Ulen'), seWid = B < 3 || narrow ? null : sd('Uwid');
  let counted = 0; for (let k = 0; k < nCell; k++) if (valid[k] && sum[k] > 0) counted++;
  const rel = [];
  if (B >= 2) for (let k = 0; k < nCell; k++) if (valid[k] && sum[k] > 0) { let m = sum[k] / B, v = 0; for (const a of accs) v += (a[k] - m) ** 2; rel.push(Math.sqrt(v / (B - 1)) / m / Math.sqrt(B)); }
  const med = (a) => { a.sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
  const relNoiseCell = med(rel);
  // 길이 프로파일 s 칸 · 폭 창 w 칸의 배치 간 노이즈
  const relOf = (vals) => { const v = vals.filter(Number.isFinite); if (v.length < 2 || v.length < B) return null; const m = v.reduce((s, x) => s + x, 0) / v.length; if (!(m > 0)) return null; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) / m / Math.sqrt(v.length); };
  const relRows = [], relCols = [];
  if (B >= 2) {
    for (let i = 0; i < ns; i++) { const r = relOf(per.map((x) => x.p[i])); if (r !== null) relRows.push(r); }
    if (!narrow) main.cols.forEach((c, wi) => c.forEach((v, j) => { if (!Number.isFinite(v)) return; const r = relOf(per.map((x) => x.cols[wi][j])); if (r !== null) relCols.push(r); }));
  }
  const nr = med(relRows), nc = med(relCols), relNoise = nr === null && nc === null ? relNoiseCell : Math.max(nr ?? 0, nc ?? 0);
  let nbar = 0; if (cnts) { let tot = 0; for (const c of cnts) for (let k = 0; k < nCell; k++) if (valid[k]) tot += c[k]; nbar = tot / nValid / B; }
  const tol = Math.min(Math.max(0.01, 1 - obs.targetLen), Math.max(0.01, 1 - obs.targetWid));
  const E = B >= 3 ? estOf(per, narrow) : null, eW = !narrow && E?.Uwid != null;
  const Ulen = E ? E.Ulen : main.Ulen, Uwid = eW ? E.Uwid : main.Uwid, iWin = eW ? E.iWin : main.iWin;
  return {
    profile: main.p, map: mean, Ulen, seLen: E ? E.seLen : seLen, Uwid, seWid: eW ? E.seWid : seWid, rawUlen: main.Ulen, rawUwid: main.Uwid, sWorst: narrow ? null : ((wins[iWin][0] + wins[iWin][1]) / 2) * ds, win: narrow ? null : wins[iWin], narrow, nbar, relNoise, relNoiseCell,
    passLen: Ulen >= obs.targetLen, passWid: narrow ? null : Uwid >= obs.targetWid, counted,
    noiseWarn: counted === 0 || B < 2 || relNoise === null || 3 * relNoise > tol,
  };
}

// 폭 방향 프로파일(창 평균) — tallyStats 의 폭 판정과 같은 규칙: s 칸 [s0, s1)(닫힌 경로는 순환) 의 w 칸별 Σ출사/Σ면적,
// 창 안 면적이 가득 찬 값의 ≥ 50% 인 칸만(아니면 NaN). a: 합산 누적(Float64Array, ns·nw).
export function windowProfile(G, a, s0, s1) {
  const { ns, nw, ds, area } = G, out = new Float64Array(nw).fill(NaN);
  for (let j = 0; j < nw; j++) {
    let s = 0, ar = 0;
    for (let i = s0; i < s1; i++) { const k = (i % ns) * nw + j; s += a[k]; ar += area[k]; }
    if (ar >= 0.5 * (s1 - s0) * ds * G.cell) out[j] = s / ar;
  }
  return out;
}

// ---- 빠른 검토의 목표 달성 가능성(2026-11-15 사용자: 유력 75% · 가능성 있음 30%) ----
// 가능성 = 방향별 Φ((값 − 목표) ÷ 오차) 중 낮은 쪽. 오차(seLen·seWid = 묶음 간 편차)를 모르면 통과 1 · 미달 0
export const CHANCE_LIKELY = 0.75, CHANCE_MAYBE = 0.3;
const phi = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), p = 1 - 0.3989422804 * Math.exp(-z * z / 2) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return z >= 0 ? p : 1 - p; };
export function passChance(s, obs) {
  if (!s || s.empty || !Number.isFinite(s.Ulen)) return 0;
  const one = (v, t, se) => (v == null || t == null ? 1 : se > 0 ? phi((v - t) / se) : v + 1e-9 >= t ? 1 : 0);
  return Math.min(one(s.Ulen, obs.targetLen, s.seLen), one(s.Uwid, obs.targetWid, s.seWid));
}
// 오차 기준(2026-11-15 사용자): 빠른 검토 값이 정밀 값과 5%p 안에서 맞아야 의미가 있음 → 오차 ±2.5%p 에 닿을 때까지 계산(최대 60초). 한도에 걸려 오차가 더 큰 후보는 '참고용'(유력에 안 넣음)
export const QUICK_SE = 0.025;
export function quickErr(s, obs) {   // 판정하는 방향(목표·값이 있는 쪽)의 오차 중 큰 쪽. 못 잰 값은 Infinity
  if (!s || s.empty || !Number.isFinite(s.Ulen)) return Infinity;
  const one = (v, t, se) => (v == null || t == null ? 0 : se > 0 ? se : Infinity);
  return Math.max(one(s.Ulen, obs.targetLen, s.seLen), one(s.Uwid, obs.targetWid, s.seWid));
}
export const chanceGrade = (p, se = 0) => (p < CHANCE_MAYBE ? 'out' : se > QUICK_SE + 1e-9 ? 'ref' : p >= CHANCE_LIKELY ? 'likely' : 'maybe');
export const fmtChance = (p) => `${Math.floor(p * 100 + 1e-9)}%`;
