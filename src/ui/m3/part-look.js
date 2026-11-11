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
    // 확산(Milky, 2026-11-11): 값이 낮을수록 연하고 투명하게, 높을수록 선명한 진분홍으로 불투명하게
    case 'milky': { const k = clamp01(m.milky / 10, 0.5); color = mix(0xffc8e4, 0xff1e7f, k); opacity = 0.5 + 0.4 * k; break; }
    case 'clear': { const T = clamp01(m.T, 0.9); color = mix(0x0f6fe8, 0x2f9bff, T); opacity = 0.62 - 0.35 * T; break; }
    case 'whiteTrans': { const T = clamp01(m.T, 0.1); color = mix(0xf2efe6, 0xe9dfbd, T); opacity = 0.98 - 0.5 * T; break; }
    default: return { color: finishColor(f), opacity: 1 };
  }
  if (f?.kind && f.kind !== 'gloss') color = mix(color, finishColor(f), 0.45);   // 투과 부품의 면 처리 = 색만 물듦, 투명도는 소재대로
  return { color, opacity };
}

// 부품 리스트 소재 칸 색(2026-11-11) — 3D 와 같은 색(partLook) 배경 + 읽히는 글자색. 계산 제외·광원으로 옮긴 부품 = null(색 없음 → 흐리게)
export function badgeStyle(p) {
  if (p?.untrace || p?.role === 'light') return null;
  const c = partLook(p).color, l = 0.3 * ((c >> 16) & 255) + 0.6 * ((c >> 8) & 255) + 0.1 * (c & 255);
  return { bg: '#' + c.toString(16).padStart(6, '0'), fg: l > 150 ? '#1d2430' : '#ffffff' };
}

// 화면 불투명도(2026-11-10) — 일반 보기 = 소재와 상관없이 불투명, 투시 = 전체 반투명. op0 = partLook 불투명도(투시·흐림의 상한)
// ghost = LED 고르는 동안 가리는 기구물, dim = 추적 제외 부품, picked = 선택 부품(투시에서도 잘 보이게)
export function partOpacity({ kind, op0 = 1, xray = false, ghost = false, dim = false, picked = false }) {
  // 확산 소재는 일반 보기에서도 partLook 의 투명도를 쓴다(2026-11-11) — 나머지 소재는 여전히 불투명
  let op = ghost ? Math.min(0.15, op0) : kind === 'milky' ? op0 : 1;
  if (xray) op = kind === 'led' ? 0.55 : Math.min(op, op0, 0.16);
  if (dim) op = Math.min(op, 0.12);
  if (picked && !ghost) op = Math.max(op, xray ? 0.45 : 0.7);
  return op;
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
