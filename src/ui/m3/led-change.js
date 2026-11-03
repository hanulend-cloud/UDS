// 원설계 대비 LED 변경(순수, 2026-11-02) — 최적화·편집으로 위치·개수가 바뀌어도 화면에 안 보여 설계자가 몰랐음.
// orig·cur = [{ s, w, n? }] (mm). 가까운 쌍부터 짝지어 옮김·그대로를 가리고, 짝 없는 지금 LED = 추가, 짝 없는 원설계 LED = 없어짐
const SAME = 0.05;   // 이보다 적게 움직이면 그대로(mm, 반올림 차이)
const sorted = (L) => [...new Set(L.map((p) => +p.s.toFixed(3)))].sort((a, b) => a - b);
// 간격 요약 — { n, uniform, p } 또는 { n, uniform: false, min, max }. 1개면 p = null
export function pitchOf(L, tol = 0.06) {
  const s = sorted(L), g = s.slice(1).map((v, i) => v - s[i]);
  if (!g.length) return { n: L.length, uniform: true, p: null };
  const min = Math.min(...g), max = Math.max(...g);
  return max - min <= tol ? { n: L.length, uniform: true, p: (min + max) / 2 } : { n: L.length, uniform: false, min, max };
}
const f1 = (v) => String(+v.toFixed(1));
export const pitchText = (q) => (q.uniform ? (q.p == null ? `${q.n}개` : `${q.n}개 · 피치 ${f1(q.p)} mm`) : `${q.n}개 · 피치 ${f1(q.min)}~${f1(q.max)} mm (간격 불규칙)`);
export function ledChange(orig, cur) {
  const po = pitchOf(orig), reach = po.uniform && po.p ? po.p / 2 : po.uniform ? 5 : po.min / 2;   // 원설계 피치의 반을 넘으면 같은 LED 로 보지 않음
  const pairs = [];
  cur.forEach((c, i) => orig.forEach((o, j) => { const d = Math.abs(c.s - o.s); if (d < reach) pairs.push([d + 1e-3 * Math.abs(c.w - o.w), i, j]); }));   // 짝 = 길이 방향 기준(폭만 옮겨도 같은 LED)
  pairs.sort((a, b) => a[0] - b[0]);
  const ci = new Map(), oi = new Set();
  for (const [, i, j] of pairs) if (!ci.has(i) && !oi.has(j)) { ci.set(i, j); oi.add(j); }
  const rows = cur.map((c, i) => {
    if (!ci.has(i)) return { n: c.n ?? i, s: c.s, w: c.w, state: 'added', ds: 0, dw: 0 };
    const o = orig[ci.get(i)], ds = c.s - o.s, dw = c.w - o.w;
    return { n: c.n ?? i, s: c.s, w: c.w, state: Math.hypot(ds, dw) < SAME ? 'same' : 'moved', ds, dw, d: c.pos && o.pos ? [0, 1, 2].map((k) => c.pos[k] - o.pos[k]) : null };
  });
  const removed = orig.filter((_, j) => !oi.has(j)), moved = rows.filter((r) => r.state === 'moved').length, added = rows.filter((r) => r.state === 'added').length;
  return { changed: moved + added + removed.length > 0, nOrig: orig.length, nCur: cur.length, moved, added, removed: removed.length, removedList: removed, rows, byN: new Map(rows.map((r) => [r.n, r])), orig, pitchOrig: po, pitchCur: pitchOf(cur) };
}
// 표·트리에 붙이는 짧은 글 — 그대로 = ''
// 부품 리스트 LED 줄 — 원설계 대비 3D 좌표 차이(mm), 바뀐 축만. 그대로 = ''
export function ledDeltaXYZ(r) {
  if (!r) return '';
  if (r.state === 'added') return '추가';
  if (!r.d) return ledDeltaText(r);
  return r.d.map((v, k) => (Math.abs(v) >= SAME ? `Δ${'xyz'[k]} ${v > 0 ? '+' : '−'}${f1(Math.abs(v))}` : '')).filter(Boolean).join(' ');
}
export function ledDeltaText(r) {
  if (!r || r.state === 'same') return '';
  if (r.state === 'added') return '추가';
  const t = [];
  if (Math.abs(r.ds) >= SAME) t.push(`${r.ds > 0 ? '+' : '−'}${f1(Math.abs(r.ds))}`);
  if (Math.abs(r.dw) >= SAME) t.push(`폭 ${r.dw > 0 ? '+' : '−'}${f1(Math.abs(r.dw))}`);
  return t.join(' · ');
}
