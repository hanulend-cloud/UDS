// 관측 집계: node test/mech3d-tally.mjs
import { fmtJudge, nearTarget, judgeNoise, JUDGE_NOISE, tallyGeometry, makeAccumulator, tallyStats, windowProfile, autoCells } from '../src/engine/mech3d/tally.js';
import { recognizeLine, lightData, lineFromData } from '../src/engine/mech3d/line.js';
import { rng } from '../src/engine/l2/mc-slab.js';
import { runMC3D } from '../src/engine/mech3d/mc3d.js';
import { buildTraceScene } from '../src/engine/mech3d/scene3d.js';
import { setMech3dMesh, getMech3d } from '../src/engine/mech3d/runtime.js';
import { defaultPart, setPartMaterial } from '../src/engine/mech3d/materials.js';
import { loadTable } from './l2-util.mjs';
import { topFaceMesh, cylinderSideMesh, rectTris, annulusTris, boxMesh, ok, done } from './mech3d-util.mjs';

const line = recognizeLine([topFaceMesh(rectTris(0, 0, 100, 6), 2)], [{ part: 0, face: 1 }], [0, 0, 1]);
const obs = { faces: [{ part: 0, face: 1 }], dir: [0, 0, 1], cone: 10, edgeExcl: 0.5, targetLen: 0.8, targetWid: 0.5, cellS: 1, cellW: 0.75 };   // 격자 직접 지정(아래 값 검증이 1 mm 칸 기준)
const G = tallyGeometry(line, obs);
const nV = G.valid.reduce((a, b) => a + b, 0);
ok(G.ns === 100 && Math.abs(G.cell - 0.75) < 1e-9 && G.nw === 12 && nV === 100 * 6, `지정 격자: s ${G.ns}칸(1mm), w 칸 ${G.cell}mm ×${G.nw}, 유효 셀 ${nV} (끝 칸도 면적 ≥ 50% → 100×6)`);
// 합성 출사: 밝기 ∝ (20 + x) — 길이 방향 선형 경사, 폭 방향 균일
const r = rng(1), B = 10, accs = [];
for (let b = 0; b < B; b++) {
  const a = makeAccumulator(G, line, obs);
  for (let k = 0; k < 200000; k++) {
    const x = r() * 100, y = r() * 6, w = (20 + x) / 120;
    a.onExit(0, 1, x, y, 2, 0, 0, 1, w, k); a.onEscape(x, y, 2.5, 0, 0, 1, w, k);
    a.onExit(0, 1, x, y, 2, 0.5, 0, Math.sqrt(0.75), w, k); a.onEscape(x, y, 3, 0.5, 0, Math.sqrt(0.75), w, k);   // 30° → 원뿔(10°) 밖
    a.onExit(0, 0, x, y, 0, 0, 0, -1, w, k); a.onEscape(x, y, -1, 0, 0, 1, w, k);                                 // 관측면 아닌 면
    a.onEscape(x, y, 5, 0, 0, 1, w, k + 1e9);                                                                        // 관측면 출사 기록 없음
  }
  accs.push(a.acc);
}
const S = tallyStats(G, accs, obs), want = (20 + 0.75) / (20 + 99.25);   // 끝 칸은 [0.5,1] 만 집계 → 무게중심 0.75 / 99.25
ok(Math.abs(S.Ulen - want) < 0.01, `길이 방향 U ${S.Ulen.toFixed(4)} (해석 ${want.toFixed(4)}), σ ${S.seLen.toFixed(4)}`);
{   // 원통 측면은 고정 정면이 아니라 출사 위치의 지역 법선으로 360° 전체 집계
  const parts = [cylinderSideMesh(40, 6)], fs = [{ part: 0, face: 1 }], cyl = recognizeLine(parts, fs, [0, 0, 0]);
  const ob = { faces: fs, dir: null, localDir: true, cone: 10, edgeExcl: 0 }, gc = tallyGeometry(cyl, ob), a = makeAccumulator(gc, cyl, ob);
  for (const [k, p] of [[1, [40, 0, 0, 1, 0, 0]], [2, [-40, 0, 0, -1, 0, 0]], [3, [0, 40, 0, 0, 1, 0]], [4, [0, -40, 0, 0, -1, 0]]]) {
    a.onExit(0, 1, p[0], p[1], p[2], p[3], p[4], p[5], 1, k);
    a.onEscape(...p, 1, k);
  }
  ok(a.accAll.reduce((x, y) => x + y, 0) === 4, '원통 관측면: 앞·뒤·좌·우 전체 출사 집계');
}

ok(S.Uwid > 0.7 && S.Uwid <= 1, `폭 방향 최저 U ${S.Uwid.toFixed(3)} @ s=${S.sWorst.toFixed(1)}mm (균일 + 셀 노이즈)`);
const rr = S.profile[75] / S.profile[25], r2 = Math.max(rr, 1 / rr), want2 = (20 + 75.5) / (20 + 25.5);   // 라인 진행 방향과 무관하게 비교
ok(!S.passLen && S.profile.length === 100 && Math.abs(r2 / want2 - 1) < 0.03, `판정·프로파일(길이 ${S.passLen ? '합격' : '불합격'}, 칸 75/25 비 ${r2.toFixed(3)} / 해석 ${want2.toFixed(3)})`);
ok(S.counted === nV && S.noiseWarn === false, `집계 셀 ${S.counted}, 노이즈 경고 없음(상대 노이즈 ${S.relNoise.toFixed(4)})`);
{   // 광자별 상태: 광자 0 이 관측면을 나간 뒤 사라지고, 광자 1 이 탈출해도 광자 0 의 지점에 집계되면 안 됨
  const a = makeAccumulator(G, line, obs);
  a.onExit(0, 1, 50, 3, 2, 0, 0, 1, 1, 0); a.onEscape(50, 3, 5, 0, 0, 1, 1, 1);
  ok(a.acc.reduce((x, y) => x + y, 0) === 0, '다른 광자의 탈출은 집계 안 함');
  a.onExit(0, 1, 50, 3, 2, 0, 0, 1, 1, 7); a.onEscape(50, 3, 5, 0, 0, 1, 1, 7);
  ok(a.acc.reduce((x, y) => x + y, 0) === 1, '같은 광자는 집계');
  const table = loadTable();
  setMech3dMesh('t', [boxMesh(0, 0, 0, 10, 10, 2)]);
  const S = buildTraceScene(getMech3d(), { name: 't', parts: [setPartMaterial(defaultPart(0, 'p0', 1), 'clear')], contacts: [] }, { table });
  const ps = new Set(); let bad = 0;
  runMC3D(S, { source: { flux: 1, sample: (r) => [4.5 + r(), 4.5 + r(), -1, 0, 0, 1] }, N: 200, seed: 5, onExit: (...v) => { if (!Number.isInteger(v[9])) bad++; ps.add(v[9]); }, onEscape: (...v) => { if (!Number.isInteger(v[7])) bad++; ps.add(v[7]); } });
  ok(bad === 0 && ps.size > 100, `runMC3D 가 광자 번호 p 를 전달: 서로 다른 p ${ps.size}개`);
}
{   // 곡선 영역 셀 면적: 균일 면 발광 링(37–43) — 안쪽/바깥쪽 셀이 같은 밝기여야 함
  const ringL = recognizeLine([topFaceMesh(annulusTris(0, 0, 37, 43), 2)], [{ part: 0, face: 1 }], [0, 0, 1]);
  const ob = { faces: [{ part: 0, face: 1 }], dir: [0, 0, 1], cone: 10, edgeExcl: 0.5, targetLen: 0.8, targetWid: 0.8 };
  const GR = tallyGeometry(ringL, ob), rr = rng(7), accs2 = [], cn = [];
  for (let b = 0; b < 10; b++) {
    const a = makeAccumulator(GR, ringL, ob);
    for (let k = 0; k < 4000000; k++) {
      const rad = Math.sqrt(37 * 37 + rr() * (43 * 43 - 37 * 37)), th = rr() * 2 * Math.PI, x = rad * Math.cos(th), y = rad * Math.sin(th);
      a.onExit(0, 1, x, y, 2, 0, 0, 1, 1, k); a.onEscape(x, y, 3, 0, 0, 1, 1, k);
    }
    accs2.push(a.acc); cn.push(a.cnt);
  }
  const SR = tallyStats(GR, accs2, ob, cn);
  const cols = []; for (let j = 0; j < GR.nw; j++) { let s = 0, c = 0; for (let i = 0; i < GR.ns; i++) if (GR.valid[i * GR.nw + j]) { s += SR.map[i * GR.nw + j]; c++; } if (c > GR.ns / 2) cols.push(s / c); }
  ok(SR.Uwid >= 0.95 && Math.abs(cols[0] / cols[cols.length - 1] - 1) < 0.02, `링 균일 발광: 창 평균 폭 균일도 ${SR.Uwid.toFixed(3)} @ ${SR.sWorst.toFixed(0)}mm, 안/바깥 열 비 ${(cols[0] / cols[cols.length - 1]).toFixed(4)} (열 ${cols.length}개)`);
}
{   // 테이퍼 4→12: 영역 안 모든 픽셀이 w 격자 안
  const tap = recognizeLine([topFaceMesh([[[0, -2], [100, -6], [100, 6]], [[0, -2], [100, 6], [0, 2]]], 2)], [{ part: 0, face: 1 }], [0, 0, 1]);
  const GT = tallyGeometry(tap, { cell: 0.5, edgeExcl: 0.5 }), Rr = tap.data.raster; let out = 0, n = 0;
  for (let j = 0; j < Rr.ny; j++) for (let i = 0; i < Rr.nx; i++) if (Rr.mask[j * Rr.nx + i]) {
    n++; const [, w] = tap.toSW(Rr.x0 + (i + 0.5) * Rr.cell, Rr.y0 + (j + 0.5) * Rr.cell), jj = Math.floor((w - GT.w0) / GT.cell);
    if (jj < 0 || jj >= GT.nw) out++;
  }
  ok(n > 0 && out === 0, `테이퍼 4→12: 격자 밖 픽셀 ${out}/${n}, w 열 ${GT.nw}`);
}
{   // 희박 데이터(합성 출사 2000개): 칸 노이즈가 커서 경고를 내야 함
  const r2 = rng(3), ac = [];
  for (let b = 0; b < 10; b++) { const a = makeAccumulator(G, line, obs); for (let k = 0; k < 200; k++) { const x = r2() * 100, y = r2() * 6; a.onExit(0, 1, x, y, 2, 0, 0, 1, 1, k); a.onEscape(x, y, 3, 0, 0, 1, 1, k); } ac.push(a.acc); }
  const sp = tallyStats(G, ac, obs);
  ok(sp.noiseWarn === true && sp.relNoise > 0.1, `희박 데이터(2000개) → 노이즈 경고, 상대 노이즈 ${sp.relNoise.toFixed(2)}`);
  const two = tallyStats(G, ac.slice(0, 2), obs);
  ok(two.seLen === null && two.seWid === null, '배치 <3 → seLen/seWid null');
}
{   // 경계 처리
  const e = tallyStats(G, [new Float64Array(G.ns * G.nw), new Float64Array(G.ns * G.nw)], obs);
  ok(e.noiseWarn === true && e.counted === 0, '집계 0 → 노이즈 경고');
  const one = tallyStats(G, [new Float64Array(G.ns * G.nw).fill(1)], obs);
  ok(one.noiseWarn === true, '배치 1개 → 노이즈 경고');
  const noDir = makeAccumulator(G, line, { ...obs, dir: null }); noDir.onExit(0, 1, 50, 3, 2, 0, 0, 1, 1, 0); noDir.onEscape(50, 3, 5, 0, 0, 1, 1, 0);
  ok(noDir.acc.some((v) => v > 0), 'obs.dir null → 라인 관측 방향 사용');
  const nar = recognizeLine([topFaceMesh(rectTris(0, 0, 100, 1.4), 2)], [{ part: 0, face: 1 }], [0, 0, 1]);
  const GN = tallyGeometry(nar, { ...obs, cellW: 0.5 }), sn = tallyStats(GN, [new Float64Array(GN.ns * GN.nw).fill(1), new Float64Array(GN.ns * GN.nw).fill(1)], obs);
  ok(sn.narrow === true && sn.Uwid === null, `좁은 띠(유효 열 <2): narrow, Uwid null`);
  const emptyG = tallyGeometry(nar, { ...obs, edgeExcl: 1 }), se = tallyStats(emptyG, [new Float64Array(emptyG.ns * emptyG.nw), new Float64Array(emptyG.ns * emptyG.nw)], obs);
  ok(se.empty === true && se.sWorst === null, '유효 셀 없음 → empty');
}
{   // Worker 경로: 래스터 없는 lightData 선으로 같은 집계 — G 는 메인에서 전체 선으로 만든 것
  const light = lineFromData(structuredClone(lightData(line))), A = makeAccumulator(G, line, obs), Bq = makeAccumulator(G, light, obs), q = rng(5);
  for (let k = 0; k < 20000; k++) {
    const x = q() * 102 - 1, y = q() * 8 - 1, w = 0.5 + q(), p = k;   // 가장자리·영역 밖 포함
    for (const a of [A, Bq]) { a.onExit(0, 1, x, y, 2, 0, 0, 1, w, p); a.onEscape(x, y, 3, 0, 0, 1, w, p); }
  }
  const sum = A.acc.reduce((x, y) => x + y, 0);
  ok(sum > 0 && A.acc.every((v, k) => v === Bq.acc[k]) && A.cnt.every((v, k) => v === Bq.cnt[k]), `lightData 선 집계 = 전체 선 집계(합 ${sum.toFixed(1)})`);
}
{   // 폭 판정 창 프로파일: 최저 창의 min/max = tallyStats 의 폭 균일도
  const sum = new Float64Array(G.ns * G.nw); for (const a of accs) for (let k = 0; k < sum.length; k++) sum[k] += a[k];
  const wp = windowProfile(G, sum, S.win[0], S.win[1]), f = Array.from(wp).filter(Number.isFinite);
  ok(Array.isArray(S.win) && wp.length === G.nw && f.length >= 2 && Math.abs(Math.min(...f) / Math.max(...f) - S.Uwid) < 1e-12,
    `windowProfile: 창 [${S.win}] 유효 ${f.length}칸, min/max = Uwid ${S.Uwid.toFixed(4)}`);
}
{ // 노이즈 = U 를 만드는 줄·열 기준 — 2D 칸 하나보다 작다(폭 방향 칸 수만큼 합쳐짐). 같은 광자 수면 √nw 쯤
  const r = rng(7), B = 10, accs3 = Array.from({ length: B }, () => { const a = new Float64Array(G.ns * G.nw); for (let k = 0; k < a.length; k++) if (G.valid[k]) { let s = 0; for (let n = 0; n < 50; n++) s += r() < 0.5 ? 1 : 0; a[k] = (s / 50) * G.area[k]; } return a; });
  const S3 = tallyStats(G, accs3, obs);
  ok(S3.relNoise > 0 && S3.relNoiseCell > 0 && S3.relNoise < S3.relNoiseCell * 0.8, `노이즈: 줄·열 ${(S3.relNoise * 100).toFixed(2)}% < 칸 ${(S3.relNoiseCell * 100).toFixed(2)}%`);
}
// 화질(2026-10-30) = 정사각 칸 크기: 저 1.5 · 중 1.0 · 고 0.5 mm. 짧은 면은 길이 10칸 이상, 좁은 면은 폭 4칸 이상이 되게 더 잘게
{
  const c = (q) => autoCells(440, 16, q), lo = c('low'), mi = c('mid'), hi = c('high');
  ok(lo.cellS === 1.5 && lo.cellW === 1.5 && mi.cellS === 1 && mi.cellW === 1 && hi.cellS === 0.5 && hi.cellW === 0.5, `화질 칸: 저 ${lo.cellS}×${lo.cellW} · 중 ${mi.cellS}×${mi.cellW} · 고 ${hi.cellS}×${hi.cellW} mm`);
  const sh = autoCells(10, 5.5, 'low');
  ok(sh.cellS === 1 && sh.cellW === 1.375 && autoCells(40, 16, undefined).cellS === 1.5, `짧은·좁은 면: ${sh.cellS}×${sh.cellW} mm · 화질 없음 = 저화질(기존 저장 설계)`);
  const GA = tallyGeometry(line, { ...obs, cellS: null, cellW: null, quality: 'mid' });
  ok(GA.ds === 1 && GA.cell === 1, `자동 격자(중): 칸 ${GA.ds}×${GA.cell} mm`);
}
{ // 면 전체 집계(2026-11-02): 판정(acc)은 가장자리 제외 그대로, 2D 표시·TXT 용 accAll 은 가장자리까지 — 제외 구역 광자도 accAll 에만 들어감
  const GF = tallyGeometry(line, { ...obs, cellS: 2, cellW: 1.5, edgeExcl: 0.5 });
  const a = makeAccumulator(GF, line, { ...obs, cone: 90 });
  a.onExit(0, 1, 50, 3, 2, 0, 0, 1, 1, 1); a.onEscape(50, 3, 2.5, 0, 0, 1, 1, 1);        // 가운데
  a.onExit(0, 1, 50, 0.2, 2, 0, 0, 1, 1, 2); a.onEscape(50, 0.2, 2.5, 0, 0, 1, 1, 2);    // 폭 가장자리 0.2 mm(제외 구역)
  const sum = (v) => v.reduce((x, y) => x + y, 0);
  let aOld = 0, aAll = 0; for (let k = 0; k < GF.area.length; k++) { aOld += GF.area[k]; aAll += GF.areaAll[k]; }
  ok(sum(a.acc) === 1 && sum(a.accAll) === 2 && Math.abs(aAll - 600) < 1 && aOld < aAll, `면 전체: 판정 acc ${sum(a.acc)} · 전체 accAll ${sum(a.accAll)} · 면적 ${aOld.toFixed(0)} → ${aAll.toFixed(0)} mm²`);
  const jj = new Set(); for (let k = 0; k < GF.validAll.length; k++) if (GF.validAll[k]) jj.add(k % GF.nw);
  const wr = [...jj].sort((x, y) => x - y), w0 = GF.w0 + wr[0] * GF.cell, w1 = GF.w0 + (wr[wr.length - 1] + 1) * GF.cell;
  ok(w1 - w0 >= 6 - 1e-9, `면 전체 유효 칸: 폭 ${w0}~${w1} mm(면 폭 6 mm 를 덮음)`);
}
{ // 끝 칸 규칙(2026-11-02): 화질마다 판정 구간이 달라지면 안 됨 — 가장자리 제외 뒤 남은 길이 기준으로 면적 절반 이상이면 유효. 남은 길이가 칸의 25% 미만인 조각은 뺌
  const rows = (cellS) => { const g = tallyGeometry(line, { ...obs, cellS, cellW: 1.5, edgeExcl: 0.5 }), r = []; for (let i = 0; i < g.ns; i++) { let v = false; for (let j = 0; j < g.nw; j++) if (g.valid[i * g.nw + j]) v = true; if (v) r.push(i); } return { g, a: r[0], b: r[r.length - 1] }; };
  const m = rows(1.25), h = rows(0.5), f = rows(0.625);   // 1.25: 첫 칸 남은 0.75 · 0.5: 첫 칸 남은 0(뺌) · 0.625: 첫 칸 남은 0.125 = 20%(뺌)
  ok(m.a === 0 && m.b === m.g.ns - 1, `끝 칸: 1.25 mm 칸 — 첫·끝 칸 포함(${m.a}, ${m.b}/${m.g.ns - 1})`);
  ok(h.a === 1 && h.b === h.g.ns - 2 && f.a === 1 && f.b === f.g.ns - 2, `끝 칸: 남은 길이 없거나 너무 짧으면 뺌(0.5 mm: ${h.a}, 0.625 mm: ${f.a})`);
  const half = tallyGeometry(line, { ...obs, cellS: 2, cellW: 1.5, edgeExcl: 1.5 });   // 첫 칸 남은 0.5 = 25% → 포함(면적 25% 라 예전 규칙이면 빠짐)
  let v0 = false; for (let j = 0; j < half.nw; j++) if (half.valid[j]) v0 = true;
  ok(v0, '끝 칸: 칸의 25% 남은 끝 칸도 판정에 포함');
}
{ // 폭 칸이 행마다 같아야 함(2026-11-02) — 폭 가장자리 칸이 딱 절반 걸치면 픽셀 세기 오차로 일부 행(19·57번)만 빠져, 그 행이 튀고(어두운 가장자리 제외) LED 봉우리가 불규칙해 보였음
  const L1 = recognizeLine([topFaceMesh(rectTris(0, 0, 116, 16), 2)], [{ part: 0, face: 1 }], [0, 0, 1]);
  for (const quality of ['low', 'mid', 'high']) {
    const Gq = tallyGeometry(L1, { faces: [{ part: 0, face: 1 }], dir: [0, 0, 1], cone: 10, edgeExcl: 0.5, targetLen: 0.8, targetWid: 0.5, quality });
    const cols = []; for (let i = 1; i < Gq.ns - 1; i++) { const c = []; for (let j = 0; j < Gq.nw; j++) if (Gq.valid[i * Gq.nw + j]) c.push(j); cols.push(c.join()); }
    const uniq = new Set(cols);
    ok(uniq.size === 1, `${quality}: 안쪽 ${cols.length}행의 폭 칸 구성 ${uniq.size}가지 (${[...uniq].map((u) => u.split(',').length).join('/')}칸)`);
  }
  // 정말 좁은 면(모든 칸이 일부만 걸침)은 예전 기준 그대로 — 절반 미만이면 칸을 만들지 않음
  const N = recognizeLine([topFaceMesh(rectTris(0, 0, 100, 1.2), 2)], [{ part: 0, face: 1 }], [0, 0, 1]), Gn = tallyGeometry(N, { faces: [{ part: 0, face: 1 }], dir: [0, 0, 1], cone: 10, edgeExcl: 0.5, targetLen: 0.8, targetWid: 0.5, cellS: 1, cellW: 1 });
  let nv = 0; for (let k = 0; k < Gn.valid.length; k++) nv += Gn.valid[k];
  ok(nv === 0, `좁은 면: 칸의 절반 미만만 걸치면 칸 없음 (유효 ${nv})`);
}
{ // 판정 노이즈(2026-11-03): 칸 최저÷최고는 노이즈만큼 낮게 나옴(실측 1%: 0.78~0.79, 0.5%: 0.81) — 목표 바로 아래면 0.5% 까지, 통과·먼 미달은 그대로
  const O = { targetLen: 0.8, targetWid: 0.8 };
  ok(nearTarget({ Ulen: 0.78, Uwid: 0.85 }, O) && nearTarget({ Ulen: 0.9, Uwid: 0.78 }, O), '목표 바로 아래 = 근처(낮은 쪽 기준)');
  ok(!nearTarget({ Ulen: 0.81, Uwid: 0.85 }, O) && !nearTarget({ Ulen: 0.6, Uwid: 0.85 }, O) && !nearTarget({ Ulen: 0.78, Uwid: 0.5 }, O) && !nearTarget({ empty: true, Ulen: 0.78 }, O), '통과·먼 미달·빈 결과 = 근처 아님');
  ok(judgeNoise({ Ulen: 0.78, Uwid: 0.85 }, O, 0.01) === JUDGE_NOISE && judgeNoise({ Ulen: 0.81, Uwid: 0.85 }, O, 0.01) === 0.01 && judgeNoise({ Ulen: 0.78, Uwid: 0.85 }, O, 0.002) === 0.002, '근처만 0.5% 로 · 사용자가 더 낮게 정했으면 그 값');
}
{ // 목표 바로 아래 값이 반올림으로 목표처럼 보이지 않게
  ok(fmtJudge(0.7952, 0.8) === '79.5%' && fmtJudge(0.7886, 0.8) === '78.8%' && fmtJudge(0.7999, 0.8) === '79.9%' && fmtJudge(0.81, 0.8) === '81.0%' && fmtJudge(0.72, 0.8) === '72.0%' && fmtJudge(0.8, 0.8) === '80.0%' && fmtJudge(NaN, 0.8) === '–' && fmtJudge(0.7952) === '79.5%', '균일도 표시 = 내림 — 미달이 0.80 으로 보이지 않고, 화면과 같은 값');
}
{ // 가상 관측면(2026-11-05): 관측 부품이 빛 계산에서 빠져도 그 자리 평면에서 잼 — 어느 면으로 나왔든 탈출 광선이 평면을 지나는 점으로
  const hit = (a, x, y, z, dx, dy, dz, w = 1, p = 1) => a.onEscape(x, y, z, dx, dy, dz, w, p);
  const sum = (a) => a.acc.reduce((t, v) => t + v, 0), l = Math.hypot(0.1, 1);
  const off = makeAccumulator(G, line, obs), on = makeAccumulator(G, line, obs, null, { virtual: true });
  ok(!hit(off, 50, 0, 0, 0, 0, 1) && sum(off) === 0, '기본: 관측면으로 나오지 않은 빛은 안 셈');
  ok(hit(on, 50, 3, 0, 0, 0, 1) === true && sum(on) === 1, '가상: 평면 아래에서 나온 빛을 평면에서 셈');
  const k0 = on.acc.findIndex((v) => v > 0); ok(k0 === 50 * G.nw + Math.floor((0 - G.w0) / G.cell), `수직 광선 = 바로 위 칸 (${k0})`);
  const on2 = makeAccumulator(G, line, obs, null, { virtual: true }); hit(on2, 50, 3, 0, 0.1 / l, 0, 1 / l);
  ok(on2.acc.findIndex((v) => v > 0) === 49 * G.nw + Math.floor((0 - G.w0) / G.cell), '기울어진 광선 = 평면을 지나는 점(z 0→2, x +0.2 — 이 라인은 s 가 x 반대 방향)');
  const on3 = makeAccumulator(G, line, obs, null, { virtual: true });
  ok(!hit(on3, 50, 3, 5, 0, 0, 1) && sum(on3) === 0, '평면 위에서 나온 빛은 안 셈');
  ok(!hit(on3, 50, 3, 0, 0, 0, -1) && !hit(on3, 50, 3, 0, 0.8, 0, 0.6) && sum(on3) === 0, '아래로 가는 빛 · 관측 원뿔 밖은 안 셈');
  ok(!hit(on3, 500, 3, 0, 0, 0, 1) && sum(on3) === 0, '관측면 밖은 안 셈');
  const on4 = makeAccumulator(G, line, obs, null, { virtual: true }); on4.onExit(0, 1, 40, 3, 2, 0, 0, 1, 1, 7); on4.onEscape(40, 3, 2, 0, 0, 1, 1, 7);
  const nm = makeAccumulator(G, line, obs); nm.onExit(0, 1, 40, 3, 2, 0, 0, 1, 1, 7); nm.onEscape(40, 3, 2, 0, 0, 1, 1, 7);
  ok(sum(on4) === 1 && on4.acc.findIndex((v) => v > 0) === nm.acc.findIndex((v) => v > 0), '관측면으로 나온 빛은 한 번만 · 보통 집계와 같은 칸');
}
done();
