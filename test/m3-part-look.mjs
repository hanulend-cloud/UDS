// 3D 부품 색(2026-11-05) — 투명도·소재·면 처리에 따라 약간씩 달라 구분되게
import { partLook, lineLook, partOpacity, badgeStyle } from '../src/ui/m3/part-look.js';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok', m); };
const lum = (c) => 0.3 * ((c >> 16) & 255) + 0.6 * ((c >> 8) & 255) + 0.1 * (c & 255);
const P = (material, finish, extra = {}) => ({ material, finish, ...extra });

{ const a = partLook(P({ kind: 'milky', milky: 1 })), b = partLook(P({ kind: 'milky', milky: 8 }));
  ok(b.opacity > a.opacity && lum(b.color) < lum(a.color), 'Milky 낮을수록 연하고 투명하게, 높을수록 선명·불투명(2026-11-11)');
  ok(partLook(P({ kind: 'milky', dbId: 'x' })).opacity > 0, '실측소재(값 없음)도 색이 나옴'); }
{ const a = partLook(P({ kind: 'clear', T: 0.6 })), b = partLook(P({ kind: 'clear', T: 0.95 }));
  ok(b.opacity < a.opacity && a.color !== b.color, '투과율 높을수록 더 투명');
  ok(b.opacity >= 0.15, '투명해도 보임'); }
{ const a = partLook(P({ kind: 'whiteTrans', T: 0.1 })), b = partLook(P({ kind: 'whiteTrans', T: 0.5 }));
  ok(b.opacity < a.opacity, '백색 투과 — 투과율 높을수록 더 투명'); }
{ const O = { kind: 'opaque' }, w = partLook(P(O, { kind: 'whiteDiffuse', R: 0.95 })), w2 = partLook(P(O, { kind: 'whiteDiffuse', R: 0.5 })), m = partLook(P(O, { kind: 'metal', R: 0.88 })), k = partLook(P(O, { kind: 'black', R: 0.05 })), g = partLook(P(O, { kind: 'gloss' })), n = partLook(P(O));
  ok(lum(w.color) > lum(w2.color), '백색 반사 — 반사율 높을수록 밝게');
  ok(lum(w.color) > lum(m.color) && lum(m.color) > lum(k.color), '백색 > 금속 > 흑색 밝기');
  ok(new Set([w.color, m.color, k.color, g.color]).size === 4, '면 처리마다 색이 다름');
  ok(lum(k.color) > 40, '흑색도 어두운 배경에서 보임');
  ok(w.opacity === 1 && n.color === g.color, '불투명 = 불투명, 면 처리 없음 = 광택과 같음');
  const bc = (c) => (c & 255) - ((c >> 16) & 255);
  ok(bc(m.color) > 0, '금속 = 살짝 푸른 은색'); }
{ const base = partLook(P({ kind: 'clear', T: 0.9 })), mir = partLook(P({ kind: 'clear', T: 0.9 }, { kind: 'black', R: 0.05 }));
  ok(base.color !== mir.color && base.opacity === mir.opacity, '투명 부품 면 처리 = 색만 달라짐, 투명도 유지'); }
{ const a = partLook(P({ kind: 'opaque' }, { kind: 'whiteDiffuse', R: 0.3 }, { role: 'pcb' }));
  ok(a.opacity === 1 && ((a.color >> 8) & 255) > ((a.color >> 16) & 255), '도면 PCB = 초록'); }
// 선 보기 색(2026-11-08): 투명 = 파랑, 반투명 = 빨강, 불투명 = 남색·무채색, 면 처리 = 주황(경면)·노랑(백색)·초록(흑색) 살짝
{ const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const [cr, cg, cb] = rgb(lineLook(P({ kind: 'clear', T: 0.9 }))); ok(cb > cr + 40 && cb > cg, '투명 = 파랑 계열');
  for (const m of [{ kind: 'milky', milky: 3 }, { kind: 'whiteTrans', T: 0.2 }]) { const [r, g, b] = rgb(lineLook(P(m))); ok(r > g + 40 && r > b + 40, `반투명(${m.kind}) = 빨강 계열`); }
  const [or, og, ob] = rgb(lineLook(P({ kind: 'opaque' }))); ok(ob >= or && ob >= og && or < 140, '불투명 = 남색·무채색 계열');
  const base = lineLook(P({ kind: 'opaque' })), tints = ['metal', 'whiteDiffuse', 'black'].map((k) => lineLook(P({ kind: 'opaque' }, { kind: k, R: 0.5 })));
  ok(new Set([base, ...tints]).size === 4, '면 처리마다 선 색이 조금씩 다름');
  const [mr, , mb] = rgb(tints[0]), [wr, wg, wb] = rgb(tints[1]), [kr, kg, kb] = rgb(tints[2]);
  const [br, bg, bb] = rgb(base);
  ok(mr - br > 20 && mb < bb, '경면 = 주황 기운'); ok(wr > br && wg > bg && wb < bb, '백색 = 노랑 기운'); ok(kg - bg > kr - br + 10, '흑색 = 초록 기운');
  for (const c of tints) { const [r, g, b] = rgb(c); ok(b >= Math.max(r, g) - 10, '불투명 + 면 처리 — 남색 계열이 남음(조금만 물듦)'); }
  const tb = rgb(lineLook(P({ kind: 'clear', T: 0.9 }, { kind: 'metal', R: 0.8 }))); ok(tb[2] > tb[0], '투명 + 경면 — 여전히 파랑 계열');
  ok(lineLook(P({ kind: 'opaque' }, null, { role: 'pcb' })) !== base, 'PCB 는 따로'); }
// 소재 구분(2026-11-10): 불투명 = 회색, 투명 = 파랑, Milky = 분홍. 값이 어떻든 서로 색 계열이 겹치지 않게
{ const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255], chroma = (c) => Math.max(...rgb(c)) - Math.min(...rgb(c));
  const milky = [0, 2, 5, 8, 10].map((v) => partLook(P({ kind: 'milky', milky: v })).color);
  const clear = [0.3, 0.6, 0.89, 1].map((T) => partLook(P({ kind: 'clear', T })).color);
  const O = { kind: 'opaque' }, opaque = [partLook(P(O, { kind: 'whiteDiffuse', R: 0.05 })), partLook(P(O, { kind: 'whiteDiffuse', R: 0.5 })), partLook(P(O, { kind: 'whiteDiffuse', R: 0.99 })), partLook(P(O, { kind: 'metal', R: 0.9 })), partLook(P(O, { kind: 'black', R: 0.05 })), partLook(P(O, { kind: 'gloss' }))].map((x) => x.color);
  ok(milky.every((c) => { const [r, g, b] = rgb(c); return r - g >= 50 && b > g; }), 'Milky = 분홍 계열(모든 농도)');
  ok(clear.every((c) => { const [r, g, b] = rgb(c); return b - r >= 80 && b >= g; }), '투명 = 파랑 계열(모든 투과율)');
  ok(opaque.every((c) => chroma(c) <= 40), '불투명 = 회색 계열(모든 면 처리)');
  ok(opaque.every((c) => lum(c) <= 200), '불투명이 밝은 배경·Milky 처럼 희게 보이지 않음');
  const dist = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
  const min = (A, B) => Math.min(...A.flatMap((a) => B.map((b) => dist(a, b))));
  ok(min(milky, clear) >= 100 && min(milky, opaque) >= 70 && min(clear, opaque) >= 70, `세 소재 색 거리: ${min(milky, clear).toFixed(0)} / ${min(milky, opaque).toFixed(0)} / ${min(clear, opaque).toFixed(0)}`);
  ok(partLook(P({ kind: 'clear', T: 0.89 })).opacity >= 0.28, '기본 투명 소재도 흐려서 안 보이지 않음'); }
// 일반 = 불투명, 투시 = 전체 반투명(2026-11-10) — 두 보기가 확실히 달라야 함
{ const op0s = { milky: 0.75, clear: 0.31, opaque: 1, pcb: 1 };
  for (const [kind, op0] of Object.entries(op0s)) {
    ok(partOpacity({ kind, op0 }) === (kind === 'milky' ? op0 : 1), `일반 보기: ${kind} ${kind === 'milky' ? 'partLook 투명도 유지(2026-11-11)' : '불투명'}`);
    ok(partOpacity({ kind, op0, xray: true }) <= 0.16, `투시: ${kind} 반투명`);
  }
  ok(partOpacity({ kind: 'led', op0: 1, xray: true }) === 0.55, '투시: LED 는 더 잘 보이게');
  ok(partOpacity({ kind: 'opaque', op0: 1, ghost: true }) === 0.15, 'LED 선택 중 기구물은 일반 보기에서도 반투명');
  ok(partOpacity({ kind: 'clear', op0: 0.31, dim: true }) === 0.12, '추적 제외 부품은 흐리게');
  ok(partOpacity({ kind: 'clear', op0: 0.31, xray: true, picked: true }) === 0.45, '투시: 선택 부품은 잘 보이게');
  ok(partOpacity({ kind: 'clear', op0: 0.31, ghost: true, picked: true }) === 0.15, '투시 대상 부품은 선택돼도 흐리게'); }
// 부품 리스트 소재 칸 색(2026-11-11) = 3D 색과 같음 · 글자는 배경에 맞춰 읽히게 · 계산 제외 = 색 없음
{ const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  const parts = [{ material: { kind: 'milky', milky: 2 } }, { material: { kind: 'clear', T: 0.89 } }, { material: { kind: 'opaque' }, finish: { kind: 'whiteDiffuse', R: 0.85 } }, { role: 'pcb', material: { kind: 'opaque' } }];
  ok(parts.every((p) => badgeStyle(p)?.bg === hex(partLook(p).color)), `소재 칸 배경 = 3D 색 (${parts.map((p) => badgeStyle(p).bg)})`);
  const L = (h) => { const c = parseInt(h.slice(1), 16); return lum(c); };
  ok(parts.every((p) => { const s = badgeStyle(p); return (L(s.bg) > 150) === (s.fg === '#1d2430'); }), '밝은 배경 = 어두운 글자, 어두운 배경 = 흰 글자');
  ok(badgeStyle({ material: { kind: 'milky', milky: 2 }, untrace: true }) === null && badgeStyle({ role: 'light', material: { kind: 'opaque' } }) === null, '계산 제외·광원으로 옮긴 부품 = 색 없음'); }
if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
console.log('all ok');
