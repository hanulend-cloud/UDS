// 3D 부품 색(2026-11-05) — 투명도·소재·면 처리에 따라 약간씩 달라 구분되게. 보기 전용(계산과 무관)
const mix = (a, b, t) => {
  const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const clamp01 = (v, d) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
function finishColor(f) {
  const R = clamp01(f?.R, 0.85);
  switch (f?.kind) {
    case 'whiteDiffuse': return mix(0x9a9da3, 0xf6f6f0, R);   // 반사율이 높을수록 밝게
    case 'metal': return mix(0x7f8a98, 0xc6d2e0, R);          // 살짝 푸른 은색
    case 'black': return 0x3f434b;                            // 어두운 배경에서도 보이게
    default: return 0x8a909c;                                 // 광택·면 처리 없음
  }
}
export function partLook(p) {
  if (p?.role === 'pcb') return { color: 0x2f6b3a, opacity: 1 };
  const m = p?.material ?? {}, f = p?.finish;
  let color, opacity;
  switch (m.kind) {
    case 'milky': { const k = clamp01(m.milky / 10, 0.5); color = mix(0xbfd9ef, 0xf8f9f9, k); opacity = 0.55 + 0.4 * k; break; }
    case 'clear': { const T = clamp01(m.T, 0.9); color = mix(0x4fa3f5, 0xa6daff, T); opacity = 0.5 - 0.3 * T; break; }
    case 'whiteTrans': { const T = clamp01(m.T, 0.1); color = mix(0xf2efe6, 0xe9dfbd, T); opacity = 0.98 - 0.5 * T; break; }
    default: return { color: finishColor(f), opacity: 1 };
  }
  if (f?.kind && f.kind !== 'gloss') color = mix(color, finishColor(f), 0.45);   // 투과 부품의 면 처리 = 색만 물듦, 투명도는 소재대로
  return { color, opacity };
}
