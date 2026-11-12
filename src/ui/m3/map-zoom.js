// 2D 큰 창 확대·이동·영역 좌표(순수, 2026-11-12). view = { s0, s1, w0, w1 } mm — 보이는 범위. 전체 범위(full) 밖으로 나가지 않음
export const ZOOM_MAX = 20;
export const fullView = (G) => ({ s0: 0, s1: G.ns * G.ds, w0: G.w0, w1: G.w0 + G.nw * G.cell });
const fit = (a, b, lo, hi) => { const d = Math.min(b - a, hi - lo); if (a < lo) return [lo, lo + d]; if (b > hi) return [hi - d, hi]; return [a, b]; };
// factor > 1 = 확대. (s, w) = 마우스 아래 점 — 확대 뒤에도 같은 화면 자리에 남음(가장자리에서는 범위 안으로 밀림)
export function zoomAt(view, full, factor, s, w) {
  const one = (a, b, lo, hi, p) => {
    const span = Math.min(hi - lo, Math.max((hi - lo) / ZOOM_MAX, (b - a) / factor)), t = (p - a) / (b - a || 1);
    return fit(p - t * span, p - t * span + span, lo, hi);
  };
  const [s0, s1] = one(view.s0, view.s1, full.s0, full.s1, s), [w0, w1] = one(view.w0, view.w1, full.w0, full.w1, w);
  return { s0, s1, w0, w1 };
}
export function panBy(view, full, ds, dw) {
  const [s0, s1] = fit(view.s0 + ds, view.s1 + ds, full.s0, full.s1), [w0, w1] = fit(view.w0 + dw, view.w1 + dw, full.w0, full.w1);
  return { s0, s1, w0, w1 };
}
// 끈 사각형 → 칸 경계에 맞춤(바깥쪽) · 거꾸로 끈 것 정리 · 전체 범위 안
export function snapRect(G, r) {
  const F = fullView(G), a = Math.min(r.s0, r.s1), b = Math.max(r.s0, r.s1), c = Math.min(r.w0, r.w1), d = Math.max(r.w0, r.w1);
  const lo = (v, o, st) => o + Math.floor((v - o) / st + 1e-9) * st, hi = (v, o, st) => o + Math.ceil((v - o) / st - 1e-9) * st;
  return { s0: Math.max(F.s0, lo(a, 0, G.ds)), s1: Math.min(F.s1, hi(b, 0, G.ds)), w0: Math.max(F.w0, lo(c, G.w0, G.cell)), w1: Math.min(F.w1, hi(d, G.w0, G.cell)) };
}
