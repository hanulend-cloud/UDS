// 관측면 색지도 — spec 2026-10-15 m3-cad-ui §2: 관측면 메쉬 정점 → (s,w) → 집계 지도 칸 값 → 색. 순수 함수(Node 시험).
// STEP 관측면은 삼각형이 커서(평면 = 2개) 정점 색으로는 분포가 안 보인다 → 집계 칸 크기까지 세분한 덧그림 메쉬를 만든다.
// 색 표(2026-11-22 사용자) — [위치 0~1, [r,g,b]] 꼭짓점. 기본 = Classic(남색→파랑→하늘→노랑→빨강→진빨강) · Turbo · Viridis · 회색조. 예전 기본(시안 색 막대)은 사용자 요청으로 뺌
const even = (cs) => cs.map((c, i) => [i / (cs.length - 1), c]);
const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const PALETTES = {
  classic: [[0, [0, 0, 128]], [0.125, [0, 0, 255]], [0.375, [0, 255, 255]], [0.625, [255, 255, 0]], [0.875, [255, 0, 0]], [1, [128, 0, 0]]],
  turbo: even(['#30123b', '#4662d7', '#36aaf9', '#1ae4b6', '#72fe5e', '#c8ef34', '#faba39', '#f66b19', '#ca2a04', '#7a0403'].map(hx)),
  viridis: even(['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'].map(hx)),
  gray: even([[0, 0, 0], [255, 255, 255]]),
};
export const PALETTE_LABELS = { classic: 'Classic', turbo: 'Turbo', viridis: 'Viridis', gray: '회색조' };
let PAL = 'classic';
export const setPalette = (name) => { PAL = Object.hasOwn(PALETTES, name) ? name : 'classic'; };
export const paletteName = () => PAL;
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
// 3D 범례 막대용 CSS 그라데이션(꼭짓점 위치 그대로)
export const paletteCss = () => `linear-gradient(90deg, ${PALETTES[PAL].map(([p, c], i, a) => (i === 0 || i === a.length - 1 ? hex(c) : `${hex(c)} ${+(p * 100).toFixed(1)}%`)).join(', ')})`;
export const NO_DATA = [0.42, 0.45, 0.5];
// t(0~1) → [r,g,b](0~1) — 지금 고른 색 표
export function ramp(t) {
  const S = PALETTES[PAL];
  t = Math.max(0, Math.min(1, t));
  let i = 0; while (i < S.length - 2 && t > S[i + 1][0]) i++;
  const [p0, a] = S[i], [p1, b] = S[i + 1], f = (t - p0) / (p1 - p0);
  return [0, 1, 2].map((k) => (a[k] + f * (b[k] - a[k])) / 255);
}
// Canvas 2D 는 ramp 의 값을 sRGB 로 바로 표시하지만 Three.js 정점색은 선형 RGB 를 받는다.
// 3D 에서도 2D 색 막대와 같은 화면색이 나오도록 sRGB 배열을 선형 RGB 로 바꾼다.
export function srgbColorsToLinear(colors, out = null) {
  const dst = out ?? new Float32Array(colors.length);
  for (let i = 0; i < colors.length; i++) {
    const v = Math.max(0, Math.min(1, colors[i]));
    dst[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }
  return dst;
}

// 부품 메쉬에서 면 번호 집합의 삼각형만(정점 번호 다시 매김)
export function extractFaces(mesh, faceSet) {
  const P = mesh.positions, T = mesh.triangles, F = mesh.faceIds, remap = new Map(), pos = [], tri = [];
  for (let t = 0; t < F.length; t++) {
    if (!faceSet.has(F[t])) continue;
    for (let j = 0; j < 3; j++) {
      const v = T[3 * t + j];
      let k = remap.get(v);
      if (k === undefined) { k = pos.length / 3; remap.set(v, k); pos.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]); }
      tri.push(k);
    }
  }
  return { positions: Float32Array.from(pos), triangles: Uint32Array.from(tri) };
}
// 삼각형마다 n×n 균등 세분(n = ⌈최대 변/maxEdge⌉). 합계가 maxTris 를 넘으면 maxEdge 를 1.25배씩 키운다. 감김 방향은 원래와 같다.
export function subdivide(m, maxEdge, maxTris = 200000) {
  const P = m.positions, T = m.triangles, nT = T.length / 3, Lmax = new Float64Array(nT);
  const d = (a, b) => Math.hypot(P[3 * a] - P[3 * b], P[3 * a + 1] - P[3 * b + 1], P[3 * a + 2] - P[3 * b + 2]);
  for (let t = 0; t < nT; t++) { const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; Lmax[t] = Math.max(d(a, b), d(b, c), d(c, a)); }
  let e = maxEdge;
  const nCap = Math.max(1, Math.floor(Math.sqrt(maxTris)));   // 삼각형 하나가 n² 로 폭주하지 않게
  const nOf = (t) => Math.min(nCap, Math.max(1, Math.ceil(Lmax[t] / e - 1e-9)));   // 각자 자기 최장 변으로
  for (;;) { let tot = 0; for (let t = 0; t < nT; t++) tot += nOf(t) ** 2; if (tot <= maxTris || tot === nT || e > 1e9) break; e *= 1.25; }   // tot === nT: 전부 n=1(더 줄일 수 없음)
  const pos = [], tri = [];
  for (let t = 0; t < nT; t++) {
    const n = nOf(t), A = 3 * T[3 * t], B = 3 * T[3 * t + 1], C = 3 * T[3 * t + 2], base = pos.length / 3;
    const id = (i, j) => base + (i * (2 * n + 3 - i)) / 2 + j;   // 행 i(0..n) 에 정점 n−i+1 개
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n;
      for (let k = 0; k < 3; k++) pos.push(P[A + k] + u * (P[B + k] - P[A + k]) + v * (P[C + k] - P[A + k]));
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
      tri.push(id(i, j), id(i + 1, j), id(i, j + 1));
      if (j < n - i - 1) tri.push(id(i + 1, j), id(i + 1, j + 1), id(i, j + 1));
    }
  }
  return { positions: Float32Array.from(pos), triangles: Uint32Array.from(tri) };
}
// (s,w) → 집계 칸 번호(tally.js makeAccumulator 와 같은 규칙) 또는 −1
export function cellIndex(G, s, w) {
  let i = Math.floor(s / G.ds);
  if (G.closed) i = ((i % G.ns) + G.ns) % G.ns; else if (i < 0 || i >= G.ns) return -1;
  const j = Math.floor((w - G.w0) / G.cell);
  if (j < 0 || j >= G.nw) return -1;
  return i * G.nw + j;
}
// (s,w) 의 칸이 유효하면 그 칸, 아니면 같은 s 행(없으면 가까운 행)의 가장 가까운 유효 칸 — 관측면 가장자리 정점용
function nearestValid(G, s, w) {
  let i = Math.floor(s / G.ds);
  i = G.closed ? ((i % G.ns) + G.ns) % G.ns : Math.max(0, Math.min(G.ns - 1, i));
  const j = Math.max(0, Math.min(G.nw - 1, Math.floor((w - G.w0) / G.cell)));
  if (G.valid[i * G.nw + j]) return i * G.nw + j;   // 자기 칸이 유효하면 바로
  for (let di = 0; di < G.ns; di++) {
    for (const sg of di ? [-1, 1] : [1]) {
      let ii = i + sg * di;
      if (G.closed) ii = ((ii % G.ns) + G.ns) % G.ns; else if (ii < 0 || ii >= G.ns) continue;
      let best = -1, bd = Infinity;
      for (let jj = 0; jj < G.nw; jj++) if (G.valid[ii * G.nw + jj] && Math.abs(jj - j) < bd) { bd = Math.abs(jj - j); best = ii * G.nw + jj; }
      if (best >= 0) return best;
    }
  }
  return -1;
}
// 정점 → (s, w) 펼친 좌표
export function vertexSW(positions, line) {
  const n = positions.length / 3, out = new Float32Array(2 * n);
  for (let v = 0; v < n; v++) { const [x, y] = line.to2D([positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]]), [s, w] = line.toSW(x, y); out[2 * v] = s; out[2 * v + 1] = w; }
  return out;
}
// 정점 → 집계 칸 번호(격자마다 한 번만 구한다)
export function vertexCells(positions, line, G, sw = vertexSW(positions, line)) {
  const n = positions.length / 3, out = new Int32Array(n);
  for (let v = 0; v < n; v++) out[v] = nearestValid(G, sw[2 * v], sw[2 * v + 1]);
  return out;
}
// 최저 칸(2D 광량 분포의 빨간 점과 같은 규칙) — 유효 칸 중 가장 낮은 값, 같으면 앞 칸. 빛이 없으면 −1
export function mapMinCell(G, map) {
  let mx = 0, k0 = -1;
  for (let k = 0; k < map.length; k++) if (G.valid[k] && map[k] > mx) mx = map[k];
  if (!(mx > 0)) return -1;
  for (let k = 0; k < map.length; k++) if (G.valid[k] && (k0 < 0 || map[k] < map[k0])) k0 = k;
  return k0;
}
// 최고 칸(2026-11-17 사용자: 최고점도 2D·3D 에 흰 고리) — 유효 칸 중 가장 높은 값, 같으면 앞 칸. 빛이 없으면 −1
export function mapMaxCell(G, map) {
  let k0 = -1;
  for (let k = 0; k < map.length; k++) if (G.valid[k] && (k0 < 0 || map[k] > map[k0])) k0 = k;
  return k0 >= 0 && map[k0] > 0 ? k0 : -1;
}
// (s, w) → 관측면 덧그림 위 가장 가까운 정점의 3D 위치(2026-11-17 사용자: 2D 최저점을 3D 관측면에도) · 링은 이음매 너머도. 정점 없으면 null
export function obsPoint(ov, G, s, w) {
  let best = -1, bd = Infinity;
  for (let v = 0; v < ov.sw.length / 2; v++) {
    let ds = Math.abs(ov.sw[2 * v] - s); if (G.closed) ds = Math.min(ds, G.L - ds);
    const d = ds * ds + (ov.sw[2 * v + 1] - w) ** 2;
    if (d < bd) { bd = d; best = v; }
  }
  return best < 0 ? null : [ov.positions[3 * best], ov.positions[3 * best + 1], ov.positions[3 * best + 2]];
}
// 닫힌 선(링)의 시작점 s = 0 단면(2026-11-18 사용자) — 2D 를 펼칠 때 0 이 3D 어디인지·어느 쪽으로 도는지.
// line = s ≈ 0 인 덧그림 정점을 폭(w) 순서로(안 → 밖), arrow = [가운데 s=0 점, s 가 늘어나는 쪽 점]. 열린 선 = null
export function startSection(ov, G) {
  if (!G?.closed || !ov?.sw?.length) return null;
  const n = ov.sw.length / 2, L = G.L, lim = 0.6 * G.ds, by = new Map();
  for (let v = 0; v < n; v++) {
    const s = ((ov.sw[2 * v] % L) + L) % L, d = Math.min(s, L - s);
    if (d > lim) continue;
    const w = ov.sw[2 * v + 1], key = Math.round(w / (0.01 * G.cell)), o = by.get(key);
    if (!o || d < o.d) by.set(key, { d, w, v });
  }
  const pts = [...by.values()].sort((a, b) => a.w - b.w);
  if (pts.length < 2) return null;
  const P = (v) => [ov.positions[3 * v], ov.positions[3 * v + 1], ov.positions[3 * v + 2]], wc = (pts[0].w + pts.at(-1).w) / 2;
  const a0 = obsPoint(ov, G, 0, wc), a1 = obsPoint(ov, G, Math.min(10 * G.ds, L / 12), wc);
  return { line: pts.map((p) => P(p.v)), arrow: a0 && a1 ? [a0, a1] : null };
}
// 칸 값(map) → 정점 색(유효 칸 최대 대비, 같은 색 막대). 칸 없음(−1) = 회색
export function cellColors(cells, map, valid, out = null) {
  let mx = 0;
  for (let k = 0; k < map.length; k++) if (valid[k] && map[k] > mx) mx = map[k];
  const c = out ?? new Float32Array(cells.length * 3);
  for (let v = 0; v < cells.length; v++) {
    const k = cells[v], rgb = k >= 0 && mx > 0 ? ramp(map[k] / mx) : NO_DATA;
    c[3 * v] = rgb[0]; c[3 * v + 1] = rgb[1]; c[3 * v + 2] = rgb[2];
  }
  return c;
}
// 관측면 덧그림 메쉬: 관측면 삼각형을 min(ds, cell) 까지 세분, 관측 방향으로 lift 띄움, 정점별 칸 번호
// lift 0.01 mm: 관측면 = 고른 면을 면 방향으로 0.01 mm 앞에 그대로 투영한 가상 검출면(사용자 의견 2026-10-26) — 겹침 깜빡임은 polygonOffset 이 막음
export function buildObsOverlay(parts, faces, line, G, { maxTris = 200000, lift = 0.01 } = {}) {
  const byPart = new Map();
  for (const f of faces) { if (!byPart.has(f.part)) byPart.set(f.part, new Set()); byPart.get(f.part).add(f.face); }
  const maxEdge = Math.min(G.ds, G.cell), d = line.frame.d, pos = [], tri = [];
  for (const [p, set] of byPart) {
    const s = subdivide(extractFaces(parts[p], set), maxEdge, Math.floor(maxTris / byPart.size)), base = pos.length / 3;
    for (let k = 0; k < s.positions.length; k += 3) { const p = [s.positions[k], s.positions[k + 1], s.positions[k + 2]], n = line.normalAt?.(p) ?? d; pos.push(p[0] + lift * n[0], p[1] + lift * n[1], p[2] + lift * n[2]); }
    for (const t of s.triangles) tri.push(t + base);
  }
  const positions = Float32Array.from(pos), sw = vertexSW(positions, line);
  return { positions, triangles: Uint32Array.from(tri), cells: vertexCells(positions, line, G, sw), sw };
}
