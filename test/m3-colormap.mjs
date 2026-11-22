// 관측면 색지도: node test/m3-colormap.mjs
import { recognizeLine } from '../src/engine/mech3d/line.js';
import { tallyGeometry } from '../src/engine/mech3d/tally.js';
import { setPalette, paletteName, paletteCss, PALETTES, ramp, NO_DATA, srgbColorsToLinear, extractFaces, subdivide, cellIndex, vertexCells, cellColors, buildObsOverlay, mapMinCell, mapMaxCell, obsPoint, startSection } from '../src/ui/m3/colormap.js';
import { topFaceMesh, rectTris, annulusTris, boxMesh, ok, done } from './mech3d-util.mjs';

const top = topFaceMesh(rectTris(0, 0, 100, 6), 2), faces = [{ part: 0, face: 1 }];
const line = recognizeLine([top], faces, [0, 0, 1]), obs = { faces, dir: [0, 0, 1], cone: 90, edgeExcl: 0.5, targetLen: 0.8, targetWid: 0.8, cellS: 1, cellW: 0.75 };   // 격자 직접 지정(아래 행·칸 번호 = 1 mm 칸 기준)
const G = tallyGeometry(line, obs);
const area = (m) => {
  let a = 0; const P = m.positions, T = m.triangles, p = (i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  for (let t = 0; t < T.length; t += 3) {
    const A = p(T[t]), B = p(T[t + 1]), C = p(T[t + 2]), u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    a += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }
  return a;
};
const maxEdge = (m) => {
  let e = 0; const P = m.positions, T = m.triangles, d = (i, j) => Math.hypot(P[3 * i] - P[3 * j], P[3 * i + 1] - P[3 * j + 1], P[3 * i + 2] - P[3 * j + 2]);
  for (let t = 0; t < T.length; t += 3) e = Math.max(e, d(T[t], T[t + 1]), d(T[t + 1], T[t + 2]), d(T[t + 2], T[t]));
  return e;
};

ok(ramp(0).every((v, k) => Math.abs(v - [0x20, 0x30, 0x6e][k] / 255) < 1e-12) && ramp(2).every((v, k) => Math.abs(v - [0xe0, 0x53, 0x2a][k] / 255) < 0.01), 'ramp: 0 = 남색, 1 이상 = 주황(시안 색 막대)');
{ const f = extractFaces(boxMesh(0, 0, 0, 10, 10, 10), new Set([1]));
  ok(f.triangles.length === 6 && f.positions.length === 12 && [0, 1, 2, 3].every((v) => f.positions[3 * v + 2] === 10), 'extractFaces: +z 면 = 삼각형 2개·정점 4개'); }
{ const c = srgbColorsToLinear(Float32Array.from([0, 0.04045, 0.5, 1]));
  ok(Math.abs(c[0]) < 1e-12 && Math.abs(c[1] - 0.0031308) < 1e-6 && Math.abs(c[2] - 0.214041) < 1e-6 && Math.abs(c[3] - 1) < 1e-12, '3D 색공간: 2D sRGB → 선형 RGB'); }
{ const m = extractFaces(top, new Set([1])), s = subdivide(m, 0.5), c = subdivide(m, 0.01, 1000);
  ok(Math.abs(area(s) - 600) < 0.01 && maxEdge(s) <= 0.5 + 1e-6 && s.triangles.length / 3 === 2 * 201 * 201, `subdivide: 면적 ${area(s).toFixed(4)} 보존, 최대 변 ${maxEdge(s).toFixed(4)} ≤ 0.5, 삼각형 ${s.triangles.length / 3}`);
  ok(c.triangles.length / 3 <= 1000 && c.triangles.length / 3 >= 2 && Math.abs(area(c) - 600) < 0.01, `subdivide 상한: ${c.triangles.length / 3} ≤ 1000`); }
{   // subdivide 상한: 원본 삼각형이 이미 상한보다 많으면 세분하지 않음(n=1), 가느다란 삼각형 하나가 n² 로 폭주하지 않음
  const many = { positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), triangles: Uint32Array.from(Array.from({ length: 30 }, () => [0, 1, 2]).flat()) };
  const r = subdivide(many, 0.01, 10);
  ok(r.triangles.length / 3 === 30, `원본 30개 > 상한 10 → 세분 없음(${r.triangles.length / 3}개)`);
  const sliver = { positions: Float32Array.from([0, 0, 0, 100, 0, 0, 0, 0.01, 0]), triangles: Uint32Array.from([0, 1, 2]) };
  const sl = subdivide(sliver, 0.5, 1000);
  ok(sl.triangles.length / 3 <= 1000 && sl.triangles.length / 3 >= 1, `가느다란 삼각형: ${sl.triangles.length / 3}개 ≤ 1000`);
}
{   // 유효 칸 중심 정점 → 그 칸(값 = 집계 지도), 폭 밖 정점 → 같은 s 행의 가장 가까운 유효 칸
  const pts = [], want = [];
  for (let i = 0; i < G.ns; i++) for (let j = 0; j < G.nw; j++) {
    const k = i * G.nw + j; if (!G.valid[k]) continue;
    const [x, y] = line.fromSW((i + 0.5) * G.ds, G.w0 + (j + 0.5) * G.cell); pts.push(...line.to3D(x, y, 0)); want.push(k);
  }
  const cells = vertexCells(Float32Array.from(pts), line, G), map = Float64Array.from({ length: G.ns * G.nw }, (_, k) => k + 1);
  ok(want.every((k, v) => cells[v] === k && map[cells[v]] === k + 1 && cellIndex(G, (Math.floor(k / G.nw) + 0.5) * G.ds, G.w0 + ((k % G.nw) + 0.5) * G.cell) === k), `유효 칸 중심 ${want.length}개 → 같은 칸, 값 = 집계 지도`);
  const i = 50; let jmax = -1; for (let j = 0; j < G.nw; j++) if (G.valid[i * G.nw + j]) jmax = j;
  const [x, y] = line.fromSW((i + 0.5) * G.ds, G.w0 + (G.nw - 0.5) * G.cell), out = vertexCells(Float32Array.from(line.to3D(x, y, 0)), line, G);
  ok(jmax >= 0 && out[0] === i * G.nw + jmax && cellIndex(G, -1, 0) === -1, `폭 밖 정점 → 행 ${i} 의 가장 가까운 유효 칸(w ${jmax}), 범위 밖 s → −1`);
  let kmax = -1; for (let k = 0; k < map.length; k++) if (G.valid[k]) kmax = k;
  const col = cellColors(Int32Array.from([kmax, -1]), map, G.valid), r1 = ramp(1);
  ok([0, 1, 2].every((c) => Math.abs(col[c] - r1[c]) < 1e-6 && Math.abs(col[3 + c] - NO_DATA[c]) < 1e-6), 'cellColors: 최대 칸 = 색 막대 끝, 칸 없음 = 회색');
}
{ const ov = buildObsOverlay([top], faces, line, G);
  ok(ov.triangles.length > 0 && ov.cells.length === ov.positions.length / 3 && Array.from(ov.cells).every((c) => c >= 0 && G.valid[c]) && Math.abs(ov.positions[2] - 2.01) < 1e-5,
    `덧그림 메쉬: 삼각형 ${ov.triangles.length / 3}, 모든 정점이 유효 칸, 관측 방향으로 0.01mm 앞(가상 검출면)`); }
{ // 최저점 3D 표시(2026-11-17 사용자) — 2D 와 같은 최저 칸(유효 칸 중 처음 나오는 가장 낮은 값) · 관측면 덧그림 위 가장 가까운 정점
  const Gt = { ns: 2, nw: 3, valid: Uint8Array.from([1, 1, 0, 1, 1, 1]) };
  ok(mapMinCell(Gt, Float64Array.from([5, 2, 0, 2, 9, 3])) === 1 && mapMinCell(Gt, new Float64Array(6)) === -1, '최저 칸 = 유효 칸만 · 같으면 앞 칸 · 빛 없으면 없음');
  const ov = buildObsOverlay([top], faces, line, G), jm = Math.floor(G.nw / 2), k = 37 * G.nw + jm, cs = (37 + 0.5) * G.ds, cw = G.w0 + (jm + 0.5) * G.cell, p = obsPoint(ov, G, cs, cw);
  let best = Infinity; for (let v = 0; v < ov.sw.length / 2; v++) best = Math.min(best, Math.hypot(ov.sw[2 * v] - cs, ov.sw[2 * v + 1] - cw));
  const [x, y] = line.to2D(p), [ps, pw] = line.toSW(x, y);
  ok(G.valid[k] && ov.sw.length === ov.positions.length / 3 * 2 && Math.abs(Math.hypot(ps - cs, pw - cw) - best) < 1e-4 && best < Math.max(G.ds, G.cell) && Math.abs(p[2] - 2.01) < 1e-5, `칸 중심 (${cs.toFixed(1)}, ${cw.toFixed(2)}) → 관측면 위 점 (${ps.toFixed(2)}, ${pw.toFixed(2)}), z ${p[2].toFixed(2)}`);
  const ring = { positions: Float32Array.from([1, 0, 0, 2, 0, 0]), sw: Float32Array.from([0.5, 0, 99.5, 0]) }, RG = { closed: true, L: 100 };
  ok(obsPoint(ring, RG, 99.9, 0)[0] === 2 && obsPoint(ring, RG, 0.1, 0)[0] === 1 && obsPoint(ring, { closed: false, L: 100 }, 60, 0)[0] === 2 && obsPoint({ positions: new Float32Array(0), sw: new Float32Array(0) }, RG, 1, 0) === null, '링은 이음매 너머도 가까운 점 · 정점 없으면 없음');
}
{ // 최고점(2026-11-17 사용자) — 유효 칸 중 가장 높은 값, 같으면 앞 칸
  const Gt = { ns: 2, nw: 3, valid: Uint8Array.from([1, 1, 0, 1, 1, 1]) };
  ok(mapMaxCell(Gt, Float64Array.from([5, 9, 99, 2, 9, 3])) === 1 && mapMaxCell(Gt, new Float64Array(6)) === -1, '최고 칸 = 유효 칸만 · 같으면 앞 칸 · 빛 없으면 없음');
}
// 2026-11-18 사용자: 링(닫힌 선)은 2D 를 펼칠 때 시작점 s = 0 이 3D 어디인지 — 그 자리 단면선(폭 방향) + 진행 방향 화살표
{ const ring = topFaceMesh(annulusTris(0, 0, 37, 43), 2), fr = [{ part: 0, face: 1 }], lr = recognizeLine([ring], fr, [0, 0, 1]);
  const Gr = tallyGeometry(lr, { faces: fr, dir: [0, 0, 1], cone: 90, edgeExcl: 0.5, targetLen: 0.8, targetWid: 0.8 }), ov = buildObsOverlay([ring], fr, lr, Gr);
  const sec = startSection(ov, Gr), P = sec?.line ?? [], rad = (p) => Math.hypot(p[0], p[1]);
  const [x0, y0] = lr.fromSW(0, 0), ang = Math.atan2(y0, x0), angOf = (p) => Math.atan2(p[1], p[0]), dA = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  ok(P.length >= 2 && Math.abs(rad(P[0]) - rad(P.at(-1))) > 5 && P.every((p) => dA(angOf(p), ang) < 0.05), `링 시작 단면: 점 ${P.length}개 · 안→밖 ${rad(P[0]).toFixed(1)}~${rad(P.at(-1)).toFixed(1)} mm · s = 0 각도 그대로`);
  const pa = (s) => { const [x, y] = lr.fromSW(s, 0); return Math.atan2(y, x); }, ar = sec?.arrow, Lr = Gr.L;
  ok(ar && dA(angOf(ar[1]), pa(10)) < dA(angOf(ar[1]), pa(Lr - 10)), '화살표 = s 가 늘어나는 쪽');
  ok(startSection(ov, { ...Gr, closed: false }) === null, '열린 선(직선) = 없음');
}
// 색 표 선택(2026-11-22 사용자: 광분포를 classic 색 배치로) — 기본 = 지금 색, 클래식 = 남색→파랑→하늘→노랑→빨강→진빨강. 바꿔도 값은 그대로(색만)
{
  ok(paletteName() === 'default' && JSON.stringify(ramp(0).map((v) => Math.round(v * 255))) === '[32,48,110]', '처음 = 기본 색 표(지금과 같음)');
  setPalette('classic');
  const c = (t) => ramp(t).map((v) => Math.round(v * 255));
  ok(paletteName() === 'classic' && JSON.stringify(c(0)) === '[0,0,128]' && JSON.stringify(c(1)) === '[128,0,0]', `클래식: 0 = 남색 · 1 = 진빨강 (${c(0)} · ${c(1)})`);
  ok(JSON.stringify(c(0.375)) === '[0,255,255]' && JSON.stringify(c(0.625)) === '[255,255,0]', `클래식: 하늘(0.375) · 노랑(0.625) (${c(0.375)} · ${c(0.625)})`);
  ok(/^linear-gradient\(90deg, #000080/.test(paletteCss()) && /#800000\)$/.test(paletteCss()), `3D 범례 막대 = 같은 색 (${paletteCss()})`);
  setPalette('nope'); ok(paletteName() === 'default', '모르는 이름 = 기본');
  ok(Object.keys(PALETTES).join() === 'default,classic', '색 표 = 기본 · 클래식');
}
done();
