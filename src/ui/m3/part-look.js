// 3D 부품 색(2026-11-05) — 소재 계열이 먼저 보이게(2026-11-10: 불투명 = 회색, 투명 = 파랑, Milky = 분홍) + 그 안에서 값에 따라 약간씩. 보기 전용(계산과 무관)
const mix = (a, b, t) => {
  const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const clamp01 = (v, d) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
function finishColor(f) {
  const R = clamp01(f?.R, 0.85);
  switch (f?.kind) {
    case 'whiteDiffuse': return mix(0x696c72, 0xb9bcc1, R);   // 반사율이 높을수록 밝게(밝은 회색까지 — 희면 Milky·배경과 헷갈림)
    case 'metal': return mix(0x5a6470, 0x8c98a6, R);          // 살짝 푸른 회색
    case 'black': return 0x3f434b;                            // 어두운 배경에서도 보이게
    default: return 0x8a909c;                                 // 광택·면 처리 없음
  }
}
export function partLook(p) {
  if (p?.role === 'pcb') return { color: 0x2f6b3a, opacity: 1 };
  const m = p?.material ?? {}, f = p?.finish;
  let color, opacity;
  switch (m.kind) {
    case 'milky': { const k = clamp01(m.milky / 10, 0.5); color = mix(0xe0488e, 0xff9cc6, k); opacity = 0.55 + 0.4 * k; break; }
    case 'clear': { const T = clamp01(m.T, 0.9); color = mix(0x0f6fe8, 0x2f9bff, T); opacity = 0.62 - 0.35 * T; break; }
    case 'whiteTrans': { const T = clamp01(m.T, 0.1); color = mix(0xf2efe6, 0xe9dfbd, T); opacity = 0.98 - 0.5 * T; break; }
    default: return { color: finishColor(f), opacity: 1 };
  }
  if (f?.kind && f.kind !== 'gloss') color = mix(color, finishColor(f), 0.45);   // 투과 부품의 면 처리 = 색만 물듦, 투명도는 소재대로
  return { color, opacity };
}

// 선 보기 색(2026-11-08) — 투명 = 파랑, 반투명(Milky·백색 투과) = 빨강, 불투명 = 남색, PCB = 짙은 초록.
// 면 처리는 살짝 물들임: 경면 = 주황, 백색 = 노랑, 흑색 = 초록(광택·없음 = 그대로)
const LINE_TINT = { metal: 0xf08a24, whiteDiffuse: 0xe6c619, black: 0x2fa84a };
export function lineLook(p) {
  if (p?.role === 'pcb') return 0x2f6b3a;
  const k = p?.material?.kind;
  const base = k === 'clear' ? 0x2f7fe0 : k === 'milky' ? 0xd8443a : k === 'whiteTrans' ? 0xc0304f : 0x3a4a8c;
  const t = LINE_TINT[p?.finish?.kind];
  return t ? mix(base, t, 0.25) : base;
}
