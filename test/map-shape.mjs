// 2D 광량 분포 모양대로 그리기(2026-11-06): node test/map-shape.mjs
import { mapShape, shapeLayout } from '../src/ui/m3/map-shape.js';
import { ok, done } from './mech3d-util.mjs';

// 반지름 30 mm 링(반시계), 폭 ±4 mm — line.fromSW 와 같은 규칙(+w = 진행 방향 왼쪽 = 안쪽)
const R = 30, L = 2 * Math.PI * R;
const ring = { closed: true, fromSW: (s, w) => { const f = s / R, tx = -Math.sin(f), ty = Math.cos(f); return [R * Math.cos(f) - w * ty, R * Math.sin(f) + w * tx]; } };
const G = { ns: 72, nw: 8, ds: L / 72, w0: -4, cell: 1, L, closed: true };
const sh = mapShape(ring, G);
ok(sh.closed && sh.ccw && sh.wOut === -1, `링 정보: 닫힘 · 반시계 · +w = 안쪽 (${sh.wOut})`);
ok(Math.abs(sh.xy[0] - 34) < 1e-4 && Math.abs(sh.xy[1]) < 1e-4, '칸 모서리 = 실제 좌표(s 0, w −4 → 반지름 34)');
const box = { x: 0, y: 0, w: 400, h: 300 };
for (const mode of ['ring', 'real']) {
  const Ly = shapeLayout(G, sh, box, [0, 7], mode);
  let back = 0, n = 0;
  for (let i = 0; i < G.ns; i += 7) for (let j = 0; j < 8; j += 3) { const q = Ly.quad(i, j), c = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2], r = Ly.at(c[0], c[1]); n++; if (r && r[0] === i && r[1] === j) back++; }
  ok(back === n, `${mode}: 칸 가운데 → 같은 칸 ${back}/${n}`);
  ok(!Ly.at(-50, -50) && !Ly.at(200, 150), `${mode}: 그림 밖·링 가운데 구멍 = 칸 없음`);
  const [x, y] = Ly.toPx(G.ds * 10.5, -3.5), q = Ly.quad(10, 0);
  ok(Math.min(...q.map((p) => p[0])) - 1e-6 <= x && x <= Math.max(...q.map((p) => p[0])) + 1e-6 && Math.min(...q.map((p) => p[1])) - 1e-6 <= y && y <= Math.max(...q.map((p) => p[1])) + 1e-6, `${mode}: 점 → 그 칸 안`);
}
{ const Lr = shapeLayout(G, sh, box, [0, 7], 'ring'), Le = shapeLayout(G, sh, box, [0, 7], 'real');
  const thick = (Ly) => { const a = Ly.P(0, 0), b = Ly.P(0, 8); return Math.hypot(a[0] - b[0], a[1] - b[1]); }, dia = (Ly) => { const a = Ly.P(0, 4), b = Ly.P(36, 4); return Math.hypot(a[0] - b[0], a[1] - b[1]); };
  ok(thick(Lr) / dia(Lr) > 1.5 * (thick(Le) / dia(Le)), `링 = 두께를 키움 (두께/지름 ${(thick(Lr) / dia(Lr)).toFixed(2)} vs 실제 ${(thick(Le) / dia(Le)).toFixed(2)})`);
  ok(Math.abs(Le.info.mm[0] - Le.info.mm[1]) < 0.5 && Math.abs(Le.info.mm[0] - 68) < 0.5, `실제 모양 = 지름 68 mm 원(가로 ${Le.info.mm[0].toFixed(1)} · 세로 ${Le.info.mm[1].toFixed(1)})`);
  const rIn = (Ly, j) => { const p = Ly.P(5, j), c = Lr.info.center; return Math.hypot(p[0] - c[0], p[1] - c[1]); };
  ok(rIn(Lr, 8) < rIn(Lr, 0), '링: +w 쪽이 안쪽(실제와 같은 방향)');
  const pr = Lr.P(0, 4), pe = Le.P(0, 4), ce = Le.P(36, 4), mid = [(pe[0] + ce[0]) / 2, (pe[1] + ce[1]) / 2];
  ok(pr[0] > Lr.info.center[0] && pe[0] > mid[0], '시작점이 같은 쪽(오른쪽)');
  const q1 = Lr.P(18, 4), e1 = Le.P(18, 4);
  ok(q1[1] < Lr.info.center[1] && e1[1] < mid[1], '돌아가는 방향도 같음(반시계 → 화면에서 위로)');
}
{ // 열린 ㄱ자 라인 — 실제 모양
  const lshape = { closed: false, fromSW: (s, w) => (s <= 50 ? [s, w] : [50 - w, s - 50]) };
  const G2 = { ns: 20, nw: 4, ds: 5, w0: -2, cell: 1, L: 100, closed: false }, s2 = mapShape(lshape, G2), Ly = shapeLayout(G2, s2, box, [0, 3], 'real');
  ok(Math.abs(Ly.info.mm[0] - 52) < 0.5 && Math.abs(Ly.info.mm[1] - 52) < 0.5, `ㄱ자 실제 크기 ${Ly.info.mm.map((v) => v.toFixed(0)).join('×')}`);
}
done();
