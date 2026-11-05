// 3D 부품 색(2026-11-05) — 투명도·소재·면 처리에 따라 약간씩 달라 구분되게
import { partLook } from '../src/ui/m3/part-look.js';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok', m); };
const lum = (c) => 0.3 * ((c >> 16) & 255) + 0.6 * ((c >> 8) & 255) + 0.1 * (c & 255);
const P = (material, finish, extra = {}) => ({ material, finish, ...extra });

{ const a = partLook(P({ kind: 'milky', milky: 1 })), b = partLook(P({ kind: 'milky', milky: 8 }));
  ok(b.opacity > a.opacity && lum(b.color) > lum(a.color), 'Milky 높을수록 더 불투명하고 희게');
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
if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
console.log('all ok');
