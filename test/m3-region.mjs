// 2D 영역 균일도 · 확대 좌표(순수, 2026-11-12): node test/m3-region.mjs
import { tallyStats, regionStats } from '../src/engine/mech3d/tally.js';
import { fullView, zoomAt, panBy, snapRect } from '../src/ui/m3/map-zoom.js';
import { mapLayout, regionTableHtml } from '../src/ui/m3/results-panel.js';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fail++; };
// 격자 10×4(ds=cell=1, w0=-2), 배치 3개. 값 = 1 + 0.1·i (길이로 증가) · j=0 줄만 0.5배
const G = { ns: 10, nw: 4, ds: 1, cell: 1, w0: -2, L: 10, closed: false, winS: 5, valid: new Uint8Array(40).fill(1), area: new Float64Array(40).fill(1) };
const mk = (b) => Float64Array.from({ length: 40 }, (_, k) => { const i = Math.floor(k / 4), j = k % 4; return (1 + 0.1 * i) * (j === 0 ? 0.5 : 1) * (1 + 0.001 * b); });
const accs = [0, 1, 2].map(mk), obs = { targetLen: 0.8, targetWid: 0.8 };
{
  const all = tallyStats(G, accs, obs), r0 = regionStats(G, accs, obs, { s0: 0, s1: 10, w0: -2, w1: 2 });
  ok(Math.abs(r0.Ulen - all.Ulen) < 1e-12 && Math.abs(r0.Uwid - all.Uwid) < 1e-12 && Math.abs(r0.meanRatio - 1) < 1e-12, '영역 = 전체 → tallyStats 와 같음');
  const r1 = regionStats(G, accs, obs, { s0: 5, s1: 10, w0: -1, w1: 2 });   // i 5..9, j 1..3 (0.5배 줄 뺌)
  ok(Math.abs(r1.Ulen - 1.5 / 1.9) < 1e-9 && Math.abs(r1.Uwid - 1) < 1e-9, `영역 길이·폭 균일도 (${r1.Ulen}, ${r1.Uwid})`);
  ok(r1.cells.join() === '5,10,1,4' && r1.mm.join() === '5,10,-1,2', `칸 범위·mm 범위 (${r1.cells} / ${r1.mm})`);
  ok(regionStats(G, accs, obs, { s0: 0, s1: 10, w0: 0, w1: 1 }).Uwid === null, '폭 1칸 → 폭 균일도 없음');
  ok(regionStats(G, accs, obs, { s0: 3, s1: 3.2, w0: 0, w1: 0.1 }).cells.join() === '3,4,2,3', '칸 하나보다 작은 영역 → 그 칸 하나');
}
{   // 확대·이동·영역 맞춤
  const F = fullView(G);
  ok(F.s0 === 0 && F.s1 === 10 && F.w0 === -2 && F.w1 === 2, '전체 보기 = 격자 범위');
  const z = zoomAt(F, F, 2, 5, 0);
  ok(Math.abs(z.s1 - z.s0 - 5) < 1e-9 && Math.abs((5 - z.s0) / (z.s1 - z.s0) - 0.5) < 1e-9 && Math.abs(z.w1 - z.w0 - 2) < 1e-9, '2배 확대 · 마우스 지점 고정');
  const zo = zoomAt(F, F, 0.5, 5, 0); ok(zo.s0 === 0 && zo.s1 === 10, '전체보다 축소 안 됨');
  const zm = zoomAt(F, F, 100, 5, 0); ok(Math.abs(zm.s1 - zm.s0 - 0.5) < 1e-9, '최대 20배');
  const zc = zoomAt({ s0: 6, s1: 10, w0: -2, w1: 2 }, F, 0.5, 6, 0); ok(zc.s0 === 2 && zc.s1 === 10, `가장자리에서 축소 → 전체 범위 안으로 밀림 (${zc.s0}~${zc.s1})`);
  const p = panBy(z, F, 100, 0); ok(p.s1 === 10 && Math.abs(p.s1 - p.s0 - 5) < 1e-9, '이동은 전체 범위 안에서');
  const sr = snapRect(G, { s0: 2.3, s1: 6.6, w0: 1.2, w1: -0.4 });
  ok(sr.s0 === 2 && sr.s1 === 7 && sr.w0 === -1 && sr.w1 === 2, `사각형 칸 맞춤(바깥쪽) · 거꾸로 끈 것 정리 (${JSON.stringify(sr)})`);
}
{   // 보이는 범위(view)로 그리기 배치 — 상자는 그대로, 안의 mm 범위만 바뀜
  const A = mapLayout(G, 800, 300, 1, false), V = mapLayout(G, 800, 300, 1, false, { s0: 2, s1: 6, w0: -1, w1: 1 });
  ok(A.ox === V.ox && A.oy === V.oy && A.PW === V.PW && A.rowH === V.rowH, '확대해도 그림 상자는 그대로');
  const [x, y] = V.xy(3, 0.5), back = V.at(x, y);
  ok(Math.abs(back[0] - 3) < 1e-9 && Math.abs(back[1] - 0.5) < 1e-9, '보이는 범위 안 점: 화면 ↔ mm 왕복');
  ok(Math.abs(V.xy(2, 1)[0] - V.ox) < 1e-9 && Math.abs(V.xy(6, -1)[0] - (V.ox + V.PW)) < 1e-9, '보이는 범위 양끝 = 상자 양끝');
  const n = mapLayout(G, 800, 300, 1, false, null); ok(n.xy(4, 0).join() === A.xy(4, 0).join(), 'view 없음 = 기존과 같음');
}
{   // 비교 표(전체 | 선택 영역) — fmtJudge(0.1% 내림), 목표 대비 색, 평균 = 전체 대비
  const h = regionTableHtml({ Ulen: 0.2249, Uwid: 0.176 }, { Ulen: 0.8139, Uwid: null, meanRatio: 1.1236, mm: [5, 45, -4, 4] }, { targetLen: 0.8, targetWid: 0.8 });
  ok(h.includes('선택 영역 (40×8 mm)') && h.includes('22.4%') && h.includes('81.3%') && h.includes('112.3%'), '표: 크기·값(0.1% 내림)·평균 비');
  ok(/class="ok">81.3%/.test(h) && /class="bad">22.4%/.test(h) && />–</.test(h), '목표 대비 색 · 폭 없음 = –');
  ok(regionTableHtml({ Ulen: 0.5 }, null, {}) === '', '영역 없음 → 빈칸');
}
console.log(fail ? `${fail} FAIL` : 'all PASS'); process.exit(fail ? 1 : 0);
