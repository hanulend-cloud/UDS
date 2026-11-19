// 2D 광량분포 돌리기·뒤집기(2026-11-19): node test/map-orient.mjs
import { readFileSync } from 'node:fs';
import { mapShape, shapeLayout, orientStep, orientMatrix, orientShape, orientRev, ORIENT0 } from '../src/ui/m3/map-shape.js';
import { mapLayout, mapTxt, lineTxt, profileTxt } from '../src/ui/m3/results-panel.js';
import { ok, done } from './mech3d-util.mjs';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const mat = (o) => orientMatrix(o).join();
const mul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
const R = [0, 1, -1, 0], FH = [-1, 0, 0, 1], FV = [1, 0, 0, -1];

// 상태 바꾸기 — 언제나 화면 기준(돌리기 = 화면에서 시계 방향 90°, 좌우·상하 = 화면에서 뒤집기)
{
  ok(mat(ORIENT0) === '1,0,0,1', '처음 = 그대로');
  let o = ORIENT0; for (let k = 0; k < 4; k++) o = orientStep(o, 'rot'); ok(mat(o) === '1,0,0,1', '돌리기 4번 = 제자리');
  ok(mat(orientStep(orientStep(ORIENT0, 'h'), 'h')) === '1,0,0,1', '좌우 2번 = 제자리');
  ok(mat(orientStep(orientStep(ORIENT0, 'h'), 'v')) === mat({ rot: 2, fh: false, fv: false }), '좌우 + 상하 = 180° 돌림');
  for (const start of [ORIENT0, { rot: 1, fh: false, fv: false }, { rot: 3, fh: true, fv: false }, { rot: 2, fh: false, fv: true }]) {
    const T = orientMatrix(start);
    ok(mat(orientStep(start, 'rot')) === mul(R, T).join(), `돌리기 = 화면 시계 방향 (${JSON.stringify(start)})`);
    ok(mat(orientStep(start, 'h')) === mul(FH, T).join(), `좌우 = 화면 좌우 (${JSON.stringify(start)})`);
    ok(mat(orientStep(start, 'v')) === mul(FV, T).join(), `상하 = 화면 상하 (${JSON.stringify(start)})`);
  }
  ok(mat(orientStep({ rot: 3, fh: true, fv: false }, 'reset')) === '1,0,0,1', '원래대로');
}

// 링 모양 — 돌리면 시작점이 따라 돌고, 뒤집으면 도는 방향이 바뀜
const Rr = 30, L = 2 * Math.PI * Rr;
const ring = { closed: true, fromSW: (s, w) => { const f = s / Rr, tx = -Math.sin(f), ty = Math.cos(f); return [Rr * Math.cos(f) - w * ty, Rr * Math.sin(f) + w * tx]; } };
const G = { ns: 72, nw: 8, ds: L / 72, w0: -4, cell: 1, L, closed: true };
const sh = mapShape(ring, G), box = { x: 0, y: 0, w: 400, h: 300 };
{
  ok(orientShape(sh, ORIENT0) === sh, '그대로면 같은 모양');
  const r1 = orientShape(sh, { rot: 1, fh: false, fv: false });
  ok(near(r1.start, Math.PI / 2, 1e-6), `시계 90° → 시작점이 아래(화면 각도 ${r1.start.toFixed(3)})`);
  ok(r1.ccw === sh.ccw && r1.wOut === sh.wOut, '돌리기만 = 도는 방향·안팎 그대로');
  ok(near(r1.xy[0], 0, 1e-4) && near(r1.xy[1], -34, 1e-4), '칸 모서리 좌표도 돌림 (34, 0) → (0, −34)');
  const h = orientShape(sh, { rot: 0, fh: true, fv: false });
  ok(h.ccw === !sh.ccw && near(Math.abs(h.start), Math.PI, 1e-6), '좌우 뒤집기 = 도는 방향 반대 · 시작점 왼쪽');
  for (const mode of ['ring', 'real']) {
    const Ly = shapeLayout(G, r1, box, [0, 7], mode), c = mode === 'ring' ? Ly.info.center : (() => { const a = Ly.P(0, 4), b = Ly.P(36, 4); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; })();
    const p = Ly.P(0, 4); ok(p[1] > c[1] + 10 && Math.abs(p[0] - c[0]) < 3, `${mode}: 돌린 뒤 s 0 이 아래쪽`);
    const q = Ly.quad(10, 3), m = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2], back = Ly.at(m[0], m[1]);
    ok(back && back[0] === 10 && back[1] === 3, `${mode}: 돌린 그림에서도 마우스 칸 = 같은 칸`);
  }
}

// 1D·CSV 가 따라가는 방향(화면 기준)
{
  ok(JSON.stringify(orientRev(sh, ORIENT0)) === '{"s":false,"w":false}', '링 그대로 = 방향 그대로');
  ok(orientRev(sh, { rot: 0, fh: true, fv: false }).s && !orientRev(sh, { rot: 0, fh: true, fv: false }).w, '링 뒤집기 = 길이 방향 반대');
  ok(!orientRev(sh, { rot: 1, fh: false, fv: false }).s, '링 돌리기 = 길이 방향 그대로');
  const bar = { closed: false, fromSW: (s, w) => [s, w] }, GB = { ns: 40, nw: 4, ds: 1, w0: -2, cell: 1, L: 40, closed: false }, sb = mapShape(bar, GB);
  const rv = (o) => { const r = orientRev(sb, o); return `${+r.s}${+r.w}`; };
  ok(rv({ rot: 0, fh: true, fv: false }) === '10', '막대 좌우 = 길이 반대');
  ok(rv({ rot: 0, fh: false, fv: true }) === '01', '막대 상하 = 폭 반대');
  ok(rv({ rot: 2, fh: false, fv: false }) === '11', '막대 180° = 둘 다 반대');
  ok(rv({ rot: 1, fh: false, fv: false }) === '00', '막대 90° = 펼친 그림·1D 는 그대로');
  ok(rv(ORIENT0) === '00' && rv({ rot: 0, fh: false, fv: false }) === '00', '처음 = 지금과 같음(회귀 없음)');
  ok(orientRev(null, { rot: 0, fh: true, fv: false }).s, '모양 정보 없음 = 좌우 기준으로');
}

// 펼친 2D 배치 — 뒤집으면 그림 좌표만 거울, 읽은 값(s, w)은 원래 좌표
{
  const GV = { w0: -2, nw: 4, cell: 1, L: 40, ns: 40 }, A = mapLayout(GV, 600, 200, 1, false), B = mapLayout(GV, 600, 200, 1, false, null, { s: true, w: true });
  const [ax, ay] = A.xy(10, 1), [bx, by] = B.xy(10, 1);
  ok(near(ax - A.ox, A.ox + A.PW - bx, 1e-9) && near(ay - A.oy, A.oy + A.rowH - by, 1e-9), '뒤집은 배치 = 상자 안에서 거울');
  const back = B.at(bx, by); ok(back && near(back[0], 10, 1e-9) && near(back[1], 1, 1e-9), '뒤집은 그림 클릭 → 원래 s·w');
  ok(mapLayout(GV, 600, 200, 1, false, null).xy(10, 1).join() === A.xy(10, 1).join(), '뒤집기 없음 = 기존과 같음');
  const Z = mapLayout(GV, 600, 200, 1, false, { s0: 5, s1: 15, w0: -1, w1: 1 }, { s: true, w: false }), [zx] = Z.xy(5, 0);
  ok(near(zx, Z.ox + Z.PW, 1e-9) && near(Z.at(...Z.xy(12, 0.5))[0], 12, 1e-9), '확대 + 뒤집기 = 확대 범위 시작이 오른쪽');
}

// CSV = 화면 순서(좌표 값은 원래 값)
{
  const G2 = { ns: 3, nw: 2, ds: 1, cell: 1, w0: -1, L: 3, valid: [1, 1, 1, 1, 1, 1] }, mp = [1, 2, 3, 4, 5, 6];
  const body = (t) => t.split('\n').filter((r) => r && !r.startsWith('#'));
  const n = body(mapTxt(G2, mp)), r = body(mapTxt(G2, mp, { rev: { s: true, w: true } }));
  ok(n[0] === 'w\\s(mm)\t0.5\t1.5\t2.5' && r[0] === 'w\\s(mm)\t2.5\t1.5\t0.5', '2D CSV: 좌우 뒤집으면 s 열 순서 반대(값은 원래 s)');
  ok(n[1].startsWith('0.5\t') && r[1].startsWith('-0.5\t'), '2D CSV: 상하 뒤집으면 w 줄 순서 반대');
  ok(r[1].split('\t').slice(1).join() === '83.33,50.00,16.67', '2D CSV: 값도 같은 칸 그대로 따라감');
  const lr = lineTxt(G2, mp, { s: 0.5, w: 0.5 }, { rev: { s: true, w: false } }).split('\n'), i = lr.indexOf('s (mm)\t값 (%)');
  ok(lr[i + 1].startsWith('2.5\t'), '선택 선 CSV: 길이 방향도 화면 순서');
  const p = body(profileTxt([{ title: 'x', v: { curves: [{ name: 'A', ys: [0.5, 1] }], opt: { x0: 0, x1: 2, xl: 's (mm)', rev: true } } }]));
  ok(p[1] === '1.5\t100.00' && p[2] === '0.5\t50.00', '1D CSV: 뒤집으면 화면 순서(왼쪽부터)');
}

// 화면 연결(소스 확인)
{
  const src = readFileSync(new URL('../src/ui/m3/results-panel.js', import.meta.url), 'utf8');
  ok(/lazy/.test(src.slice(src.indexOf('function wireBigZoom'), src.indexOf('function wireBigZoom') + 4000)), '큰 창 오른쪽 누름 = 끌 때만 링을 펼침(누르기만 하면 그대로 → 우클릭 저장·복사가 보이는 그림 그대로)');
  ok(/data-orient="rot"/.test(src) && /data-orient="h"/.test(src) && /data-orient="v"/.test(src), '2D 제목줄에 돌리기·좌우·상하 단추');
  ok(/opt\.rev|rev \?/.test(src.slice(src.indexOf('function drawPlot'), src.indexOf('function wireHover'))), '1D 그림이 방향을 따름');
}
done();
