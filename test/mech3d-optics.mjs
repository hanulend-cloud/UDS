// 3D 기구 부품 광학 물성: node test/mech3d-optics.mjs
import fs from 'node:fs';
import { partOptics, normalRow } from '../src/engine/mech3d/optics.js';
import { defaultPart, setPartMaterial, setPartMaterialParam } from '../src/engine/mech3d/materials.js';
import { l2Material, MUA_RESIN } from '../src/engine/l2/material.js';
import { milkyFromMusR } from '../src/engine/l2/milky.js';
import { createDb } from '../src/model/materials-db.js';
import { loadTable } from './l2-util.mjs';
import { ok, done } from './mech3d-util.mjs';

const table = loadTable();
const db = createDb(JSON.parse(fs.readFileSync(new URL('../data/materials-db.json', import.meta.url))).entries ?? []);
const ctx = { table, db };
const P = (kind, params = {}) => Object.entries(params).reduce((p, [k, v]) => setPartMaterialParam(p, k, v), setPartMaterial(defaultPart(0, 'p', 1), kind));
const rel = (a, b) => Math.abs(a / b - 1);

ok(partOptics(defaultPart(0, 'p', 1), ctx).transmissive === false, '불투명 → 비투과');
{
  const o = partOptics(P('clear', { T: 1, tRef: 2 }), ctx);
  ok(o.transmissive && o.n === 1.586 && o.mus === 0 && o.mua === 0, `투명(T=1): n ${o.n}, μs ${o.mus}, μa ${o.mua}`);
  const R0 = (0.586 / 2.586) ** 2, o2 = partOptics(P('clear', { T: 0.8, tRef: 2 }), ctx), x = Math.exp(-o2.mua * 2), Tslab = (1 - R0) ** 2 * x / (1 - R0 * R0 * x * x);
  ok(Math.abs(Tslab - 0.8) < 1e-12, `투명 착색 T80%@2mm: μa ${o2.mua.toFixed(5)}, 슬랩 다중반사 T ${Tslab.toFixed(12)}`);
  ok(partOptics(P('clear', { T: 0.95, tRef: 2 }), ctx).mua === 0, '투명 T ≥ 무흡수 슬랩 투과율 → μa 0');
}
{
  const o = partOptics(P('milky', { milky: 3 }), ctx), m = l2Material(table, 3, 1.586);
  ok(rel(o.mus, m.musR / (1 - m.g)) < 1e-12 && o.g === 0.9 && rel(o.mua, m.mua) < 1e-12 && o.phase === null, `추상 Milky 3: μs ${o.mus.toFixed(4)} = L2, g 0.9, HG`);
}
{
  const ent = db.get('covestro-dq5142'), milky = milkyFromMusR(table, ent.fitted.musR);
  const o = partOptics(P('milky', { dbId: ent.id, milky }), ctx);
  ok(rel(o.mus * (1 - o.g), ent.fitted.musR) < 1e-6 && o.g === ent.fitted.g && rel(o.mua, ent.fitted.mua) < 1e-6 && o.n === ent.n,
    `DB DQ5142(Milky ${milky.toFixed(2)}): μs' ${(o.mus * (1 - o.g)).toFixed(4)} = 피팅값, n ${o.n}`);
  ok(o.phase && Math.abs(o.phase.g - ent.fitted.g) < 0.01, `DB Mie 위상함수: g ${o.phase?.g.toFixed(4)} ≈ 피팅 g ${ent.fitted.g.toFixed(4)}`);
  const half = partOptics(P('milky', { dbId: ent.id, milky: milky / 2 }), ctx);
  ok(half.mus < o.mus && half.g === o.g && rel((half.mua - MUA_RESIN) / half.mus, (o.mua - MUA_RESIN) / o.mus) < 1e-6, 'Milky 를 낮추면 μs 와 입자분 μa 가 같은 비율로 줄고 g 는 그대로(농도)');
  const top = partOptics(P('milky', { dbId: ent.id, milky: 10 }), ctx);
  ok(Number.isFinite(top.mus) && Number.isFinite(top.mua) && top.mus > o.mus, `DB Milky 10: 유한값 μs ${top.mus.toFixed(3)}, μa ${top.mua.toFixed(5)}`);
}
{
  const o = partOptics(P('whiteTrans', { T: 0.1, tRef: 1.5 }), ctx);
  const q = table.query(o.mus * (1 - o.g) * 1.5, o.g, o.n, normalRow(table), 0);
  ok(Math.abs(q.Tb + q.Ts - 0.1) < 1e-3 && o.g === 0.9, `반투과 백색 T10%@1.5mm: 표 재계산 T ${(q.Tb + q.Ts).toFixed(4)}`);
}
{   // 투명 T 극소 정밀도, Milky 상한 9.9(MILKY_UI_MAX)
  const n0 = partOptics(P('clear'), ctx).n, R0 = ((n0 - 1) / (n0 + 1)) ** 2, B = (1 - R0) ** 2;
  const o = partOptics(P('clear', { T: 1e-9, tRef: 2 }), ctx), x = Math.exp(-o.mua * 2), T = B * x / (1 - R0 * R0 * x * x);
  ok(Number.isFinite(o.mua) && rel(T, 1e-9) < 1e-6, `투명 T 1e-9: μa ${o.mua.toFixed(3)}, 재계산 T ${T.toExponential(4)}`);
  const a = partOptics(P('milky', { milky: 9.9 }), ctx), b = partOptics(P('milky', { milky: 10 }), ctx);
  const ent = db.get('covestro-dq5142'), c = partOptics(P('milky', { dbId: ent.id, milky: 9.9 }), ctx), d = partOptics(P('milky', { dbId: ent.id, milky: 10 }), ctx);
  ok(a.mus === b.mus && c.mus === d.mus, `Milky 상한 9.9: 추상 μs ${b.mus.toFixed(2)}, DB μs ${d.mus.toFixed(2)}`);
}
// 투명 소재(2026-11-05): 고르면 그 소재의 2 mm 투과율 · 두께별 흡수
{ const { defaultMaterial, clearT, CLEAR_BASE } = await import('../src/engine/mech3d/materials.js');
  const { materialSummary } = await import('../src/engine/mech3d/material-pick.js');
  const { migrateMech3d } = await import('../src/engine/mech3d/defs.js');
  const d = defaultMaterial('clear');
  ok(d.T === 0.89 && d.tRef === 2 && d.resin === 'PC', '투명 기본 = PC 2 mm 89%(100% 아님)');
  ok(partOptics({ material: d, faceFinish: {} }, ctx).mua > 0, '기본 투명 = 흡수 있음');
  ok(Math.abs(clearT(d, 2) - 0.89) < 1e-9 && clearT(d, 8) < clearT(d, 4) && clearT(d, 4) < clearT(d, 2) && clearT(d, 0.5) > clearT(d, 2), `두께별 투과율 2→${clearT(d, 2).toFixed(3)} 4→${clearT(d, 4).toFixed(3)} 8→${clearT(d, 8).toFixed(3)}`);
  for (const e of CLEAR_BASE) ok(Math.abs(clearT(e.id === 'x' ? e : { resin: e.id, T: e.T, tRef: e.tRef }, 2) - e.T) < 1e-9, `${e.id} 2 mm = ${e.T}`);
  ok(/4 mm → 8[0-9.]+%/.test(materialSummary({ material: d }, { thick: 4 })) && !/→/.test(materialSummary({ material: d })), `요약: ${materialSummary({ material: d }, { thick: 4 })}`);
  const mig = (mat) => { const m = { parts: [{ material: mat }], light: {}, observe: {} }; migrateMech3d(m); return m.parts[0].material; };
  ok(mig({ kind: 'clear', resin: 'PMMA', T: 1, tRef: 2 }).T === 0.92, '저장된 예전 기본값 100% → 그 소재 값');
  ok(mig({ kind: 'clear', resin: 'PC', T: 0.85, tRef: 3 }).T === 0.85 && mig({ kind: 'clear', resin: 'PC', T: 1, tRef: 2, n: 1.58, matId: 'u:a' }).T === 1, '입력한 값·측정 항목은 그대로');
  const twice = { parts: [{ material: { kind: 'clear', resin: 'PC', T: 1, tRef: 2 } }], light: {}, observe: {} }; migrateMech3d(twice); twice.parts[0].material.T = 1; migrateMech3d(twice);
  ok(twice.parts[0].material.T === 1, '보정은 한 번만(그 뒤 입력한 100% 유지)'); }
done();
