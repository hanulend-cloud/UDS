// 2D 광량 분포를 모양대로 그리기(2026-11-06) — 순수. 계산 칸(s × w)은 그대로, 그리는 자리만 바꿈(판정 값과 무관).
//  · 링(닫힌 라인): 원으로 그리고 두께를 키움(얇은 링을 펼친 띠·실제 크기로 보면 알아보기 어려움) — 시작점·돌아가는 방향은 실제와 같게
//  · 실제 모양(실제 비율 체크): 관측면의 실제 자리·크기 그대로(링·ㄱ자·곡선 모두)
// shape = mapShape(line, G): 칸 모서리 (ns+1)×(nw+1) 의 관측면 좌표(mm) + 닫힘·바깥 방향·돌아가는 방향

// 라인 → 칸 모서리 좌표. y 는 관측면 좌표(위 = +). 바깥 방향 wOut = +1 이면 +w 가 링 바깥
export function mapShape(line, G) {
  const ns = G.ns, nw = G.nw, xy = new Float32Array((ns + 1) * (nw + 1) * 2);
  for (let i = 0; i <= ns; i++) for (let j = 0; j <= nw; j++) {
    const [x, y] = line.fromSW(Math.min(i * G.ds, line.closed ? i * G.ds : G.L), G.w0 + j * G.cell), k = (i * (nw + 1) + j) * 2;
    xy[k] = x; xy[k + 1] = y;
  }
  // 중심선 → 무게중심 · 넓이 부호(+ = 반시계) · 시작점
  let cx = 0, cy = 0, area = 0;
  const N = Math.max(8, Math.min(720, ns)), pts = [];
  for (let k = 0; k < N; k++) pts.push(line.fromSW((k / N) * G.L, 0));
  for (const [x, y] of pts) { cx += x / N; cy += y / N; }
  for (let k = 0; k < N; k++) { const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % N]; area += x1 * y2 - x2 * y1; }
  const a = line.fromSW(0, 1), b = line.fromSW(0, -1), wOut = Math.hypot(a[0] - cx, a[1] - cy) >= Math.hypot(b[0] - cx, b[1] - cy) ? 1 : -1;
  const s0 = pts[0], start = Math.atan2(-(s0[1] - cy), s0[0] - cx);   // 화면 각도(아래 = +y)
  return { ns, nw, xy, closed: !!line.closed, wOut, ccw: area > 0, start };
}

const inQuad = (p, q) => {   // 볼록·오목 모두: 두 삼각형
  const tri = (a, b, c) => { const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]), d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]), d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
  return tri(q[0], q[1], q[2]) || tri(q[0], q[2], q[3]);
};

// 배치 — box = { x, y, w, h }(그림 영역, px) · rows = [jA, jB](빈 w 줄 뺀 범위) · mode 'ring' | 'real'
// 반환 { P(i, j) → [px, py] 모서리, quad(i, j) → 칸 네 모서리, toPx(s, w), at(px, py) → [i, j] | null, info }
export function shapeLayout(G, shape, box, rows, mode) {
  const [jA, jB] = rows, nwV = jB - jA + 1, { ns, nw } = G;
  let P;
  const info = {};
  if (mode === 'ring') {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2, Rout = Math.min(box.w, box.h) / 2 * 0.96, T = Rout * 0.42, Rin = Rout - T;
    const dir = shape?.ccw === false ? 1 : -1, th0 = shape?.start ?? -Math.PI / 2, out = shape?.wOut ?? 1;   // 화면에서: 반시계(관측면) = 시계(화면, y 뒤집힘)
    const ang = (i) => th0 + (dir * 2 * Math.PI * i) / ns;   // 화면 각도는 y 가 아래라 + = 시계 방향 — 관측면 반시계 = 화면 각도 감소(dir −1)
    const rad = (j) => { const t = (Math.max(jA, Math.min(jB + 1, j)) - jA) / nwV; return Rin + (out > 0 ? t : 1 - t) * T; };
    P = (i, j) => { const a = ang(i), r = rad(j); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    info.center = [cx, cy]; info.Rin = Rin; info.Rout = Rout;
  } else {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i <= ns; i++) for (let j = jA; j <= jB + 1; j++) { const k = (i * (nw + 1) + j) * 2, x = shape.xy[k], y = shape.xy[k + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const sc = Math.min(box.w / (x1 - x0 || 1), box.h / (y1 - y0 || 1)), ox = box.x + (box.w - (x1 - x0) * sc) / 2, oy = box.y + (box.h - (y1 - y0) * sc) / 2;
    P = (i, j) => { const k = (i * (nw + 1) + j) * 2; return [ox + (shape.xy[k] - x0) * sc, oy + (y1 - shape.xy[k + 1]) * sc]; };
    info.mm = [x1 - x0, y1 - y0]; info.scale = sc;
  }
  const quad = (i, j) => [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
  const toPx = (s, w) => {   // 칸 안 이중 선형
    const fi = Math.max(0, Math.min(ns - 1e-9, s / G.ds)), fj = Math.max(jA, Math.min(jB + 1 - 1e-9, (w - G.w0) / G.cell)), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const [a, b, c, d] = quad(i, j);
    return [a[0] * (1 - u) * (1 - v) + b[0] * u * (1 - v) + c[0] * u * v + d[0] * (1 - u) * v, a[1] * (1 - u) * (1 - v) + b[1] * u * (1 - v) + c[1] * u * v + d[1] * (1 - u) * v];
  };
  const at = (px, py) => {
    for (let i = 0; i < ns; i++) for (let j = jA; j <= jB; j++) if (inQuad([px, py], quad(i, j))) return [i, j];
    return null;
  };
  return { P, quad, toPx, at, info };
}
