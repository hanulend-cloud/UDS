// 확산판 Mie 전환 1단계(2026-11-20): node test/mie-preset.mjs
import { particleOptics, polyParticleOptics } from '../src/engine/l2/mie.js';
import { MIE_PRESETS, presetKeyForResin, presetOptics, truncatePhase, presetMaterial } from '../src/engine/l2/mie-preset.js';
import { milkyFromMusR, musRFromMilky, presetRef } from '../src/engine/l2/milky.js';
import { l2Material } from '../src/engine/l2/material.js';
import { loadTable } from './l2-util.mjs';
import { thetaCFor } from '../src/engine/l2/mie-preset.js';
import { milkyGridOptics } from '../src/engine/mech3d/reweight.js';
import { partOptics } from '../src/engine/mech3d/optics.js';
import { defaultPart, setPartMaterial, setPartMaterialParam } from '../src/engine/mech3d/materials.js';
import { ok, done } from './mech3d-util.mjs';
const near = (a, b, e) => Math.abs(a - b) <= e;

// 크기 분포 — 편차 0 이면 단일 지름과 같음, 편차가 있으면 위상함수 물결이 줄어듦
{
  const one = particleOptics({ d_um: 3, nP: 1.49, nH: 1.586 });
  const p0 = polyParticleOptics({ d_um: 3, sigma: 0, nP: 1.49, nH: 1.586 });
  ok(near(p0.g, one.g, 1e-9) && near(p0.sigmaS, one.sigmaS, 1e-12), '편차 0 = 단일 지름');
  const p = polyParticleOptics({ d_um: 3, sigma: 0.25, nP: 1.49, nH: 1.586 });
  ok(p.g > 0.98 && p.g < 0.995, `PMMA 3µm in PC 분포 g ${p.g.toFixed(4)}`);
  ok(near(p.phase.gNum, p.g, 2e-3), `위상표 ⟨cosθ⟩ ${p.phase.gNum.toFixed(4)} = g`);
  const wig = (ph) => { let s = 0; for (let j = 400; j < 2300; j++) s += Math.abs(Math.log(ph.p[j + 1] / ph.p[j]) - Math.log(ph.p[j] / ph.p[j - 1])); return s; };
  ok(wig(p.phase) < 0.5 * wig(one.phase), `분포 평균 = 위상함수 물결 감소 (${wig(p.phase).toFixed(1)} < ${wig(one.phase).toFixed(1)})`);
  ok(p.vol > 0 && typeof p.phase.sample === 'function' && p.phase.inv.length === 4097, '부피·샘플러·역CDF 표');
}
// 기본 비드 · 델타 절단
{
  ok(presetKeyForResin('PC') === 'PC' && presetKeyForResin('PMMA') === 'PMMA' && presetKeyForResin('ABS') === 'PC', '수지 → 기본 비드(그 밖 = PC)');
  ok(MIE_PRESETS.PC.d_um === 3 && MIE_PRESETS.PMMA.nP === 1.43, '기본 비드 표');
  const o = presetOptics('PC');
  ok(presetOptics('PC') === o, '기본 비드 광학 = 캐시');
  const t = truncatePhase(o.phase, o.g, 5);
  ok(t.f > 0.3 && t.f < 0.95, `전방 5° 안 비율 f ${t.f.toFixed(3)}`);
  ok(t.g < o.g && near((1 - o.g) / (1 - t.g) / t.scale, 1, 1e-12), `절단 g* ${t.g.toFixed(4)} · μs 배율 ${t.scale.toFixed(4)} (μs′ 보존)`);
  ok(near(t.phase.gNum, t.g, 1e-12) && t.phase.inv.length === 4097, '절단 위상표 = 샘플러 형식 같음');
  ok(truncatePhase(o.phase, o.g, 0).scale === 1, '절단 0° = 그대로');
}

// 런타임 — 주 응답표에 기본 비드 합성표
const table = loadTable();
{
  ok(table.mie?.PC && table.mie?.PMMA, '주 응답표에 기본 비드 합성표(table.mie) 부착');
  const q = table.mie.PC.query(1, table.mie.PC.g, 1.586, table.diffuseRow, 0);
  ok(q.Tb + q.Ts > 0 && q.Tb + q.Ts < 1 && table.mie.PC.phaseKey === 'preset:PC', `합성표 질의 T ${(q.Tb + q.Ts).toFixed(3)} · phaseKey`);
}

// Milky 눈금 — 뜻 그대로(2mm 기준판 차폐율), 기준판만 기본 비드 Mie
{
  const ref = presetRef(table, 'PC');
  ok(ref.table === table.mie.PC && ref.g === table.mie.PC.g && ref.n === 1.586 && ref.t === 2, '기본 비드 기준판 = 2mm · 그 비드 g · 모재 n');
  for (const m of [0.5, 3, 5, 8]) ok(near(milkyFromMusR(table, musRFromMilky(table, m, ref), ref), m, 1e-6), `Mie 눈금 왕복 Milky ${m}`);
  ok(milkyFromMusR(table, 1) === milkyFromMusR(table, 1, undefined), '기준판 없음 = 지금 눈금 그대로(실측 DB 경로)');
  let prev = -1, mono = true; for (let m = 0.2; m < 9.9; m += 0.4) { const r = musRFromMilky(table, m, ref); mono &&= r > prev; prev = r; }
  ok(mono, 'Milky ↑ = μs′ ↑ (단조)');
}

// 눈금 A — Milky 10 = 50% 가림(최대), 5 = 25% 가림
{
  const T = (m) => { const r = presetRef(table, 'PC'), q = (x) => { const v = r.table.query(x * 2, r.g, r.n, table.diffuseRow, 0); return v.Tb + v.Ts; }; return q(musRFromMilky(table, m, r)) / q(0); };
  ok(near(T(10), 0.5, 1e-4) && near(T(5), 0.75, 1e-4), `눈금 A: Milky 10 → 투과 ${(T(10) * 100).toFixed(1)}% · 5 → ${(T(5) * 100).toFixed(1)}% (가림 전 대비)`);
  ok(Number.isFinite(musRFromMilky(table, 10, presetRef(table, 'PC'))) && musRFromMilky(table, 12, presetRef(table, 'PC')) === musRFromMilky(table, 10, presetRef(table, 'PC')), 'Milky 10 = 유한값 · 그 위는 10 으로');
}

// 일반 Milky 물성 — 흡수는 비드 농도에 비례, 50% 가림(Milky 10)에서 HG 흡수와 같음
{
  const a10 = presetMaterial(table, 10, 'PC'), h10 = l2Material(table, 10, 1.586);
  ok(near(a10.mua - a10.muaResin, h10.mua - 0.0005, 1e-12), `Milky 10 비드 흡수 = HG 흡수 − 수지분 ${(h10.mua - 0.0005).toExponential(3)}`);
  const a = presetMaterial(table, 5, 'PC');
  ok(a.g === table.mie.PC.g && near(a.mus * (1 - a.g), a.musR, 1e-12), 'μs = μs′/(1−g_Mie)');
  ok(a.phi > 0 && a.wt > 0 && a.wt < a10.wt && a.preset === 'PC', `Milky 5 → 비드 ${(a.wt * 100).toFixed(2)} wt% · Milky 10 → ${(a10.wt * 100).toFixed(2)} wt%`);
  const b = presetMaterial(table, 2, 'PC'), c = presetMaterial(table, 8, 'PC');
  ok(b.phi < a.phi && a.phi < c.phi && b.mua < a.mua && a.mua < c.mua, 'Milky ↑ = 농도·흡수 ↑');
  ok(presetMaterial(table, 0, 'PC').clear === true, 'Milky 0 = 투명 수지(2026-11-21 — 아래 블록에서 흡수 확인)');
  ok(presetMaterial(table, 5, 'PMMA').preset === 'PMMA', 'PMMA 모재 = 실리콘 비드');
}

// 3D 일반 Milky = Mie(절단) — μs′ 보존, Milky 만 바꾸면 위상함수 같음
{
  const part = setPartMaterialParam(setPartMaterial(defaultPart(0, 'p', 1), 'milky'), 'milky', 5);
  const o = partOptics(part, { table, db: null }), a = presetMaterial(table, 5, 'PC'), t = truncatePhase(presetOptics('PC').phase, a.g, thetaCFor(5));
  ok(o.phase && o.phase.inv.length === 4097, '일반 Milky = Mie 위상표(HG 아님)');
  ok(near(o.mus, a.mus * t.scale, 1e-9) && near(o.g, t.g, 1e-12) && near(o.mua, a.mua, 1e-15), '3D μs = 절단 배율 · g* · 흡수 = 비드 농도');
  ok(near(o.mus * (1 - o.g), a.musR, 1e-9), '3D 에서도 μs′ 보존');
  const o2 = partOptics(setPartMaterialParam(part, 'milky', 3), { table, db: null });
  ok(o2.phase === o.phase && o2.g === o.g, '같은 구간에서 Milky 만 바꾸면 위상함수·g 같음(재가중 최적화 조건)');
  ok(thetaCFor(4) === 10 && thetaCFor(5) === 10 && thetaCFor(5.01) === 5 && thetaCFor(10) === 5, '절단 구간: 5 이하 10° · 5 초과 5°');
  const o8 = partOptics(setPartMaterialParam(part, 'milky', 8), { table, db: null });
  ok(o8.g > o.g && o8.phase !== o.phase && near(o8.mus * (1 - o8.g), presetMaterial(table, 8, 'PC').musR, 1e-9), `탁한 구간 = 작은 절단 5°(g* ${o8.g.toFixed(3)} > 10° 의 ${o.g.toFixed(3)}) · μs′ 보존`);
  const grid = milkyGridOptics({ ...part, material: { ...part.material, milky: 4.9 } }, { table, db: null }, [4.8, 4.9, 5.0, 5.1, 5.2]);
  ok(grid.every((g) => g.g === grid[0].g), '재가중 격자가 경계(5)를 넘어도 기준 구간 각도로 통일 — g 같음');
}
{
  // 2026-11-21: Milky 0 = 비드 없음 → 일반 투명 수지로 계산 · 0 초과는 0.1 부터(비드가 조금이라도 든 Milky 수지)
  const clearPC = partOptics(setPartMaterial(defaultPart(0, 'c', 1), 'clear'), { table, db: null });
  const part0 = setPartMaterialParam(setPartMaterial(defaultPart(0, 'p', 1), 'milky'), 'milky', 0);
  const o0 = partOptics(part0, { table, db: null });
  ok(o0.mus === 0 && o0.phase === null && near(o0.mua, clearPC.mua, 1e-15) && o0.n === clearPC.n, `Milky 0 = 투명 PC 와 같음(μa ${o0.mua.toFixed(4)} = ${clearPC.mua.toFixed(4)})`);
  const a0 = presetMaterial(table, 0, 'PC');
  ok(a0.musR === 0 && a0.clear === true && near(a0.mua, clearPC.mua, 1e-15), '평판(L2) Milky 0 도 투명 PC 흡수');
  const o03 = partOptics(setPartMaterialParam(part0, 'milky', 0.03), { table, db: null }), o1 = partOptics(setPartMaterialParam(part0, 'milky', 0.1), { table, db: null });
  ok(o03.mus > 0 && near(o03.mus, o1.mus, 1e-12) && near(presetMaterial(table, 0.03, 'PC').musR, presetMaterial(table, 0.1, 'PC').musR, 1e-15), 'Milky 0 초과 0.1 미만 = 0.1 로 계산');
}
{
  // 2026-11-21: Milky 수지 바탕 흡수 = 같은 수지의 투명 소재 흡수 → 비드가 조금이라도 들면 투명보다 투과율이 낮다
  for (const r of ['PC', 'PMMA']) {
    const key = r === 'PMMA' ? 'PMMA' : 'PC', n = MIE_PRESETS[key].nH;
    const T = (m) => { const a = presetMaterial(table, m, r), q = table.mie[key].query(a.musR * 2, a.g, n, 0, a.mua * 2); return q.Tb + q.Ts; };
    const T0 = T(0), ms = [0.1, 0.3, 1, 2, 5, 10], Ts = ms.map(T);
    ok(Ts.every((t, i) => t < (i ? Ts[i - 1] : T0)), `${r}: 투명 ${(T0 * 100).toFixed(1)}% > Milky ${ms.map((m, i) => `${m}:${(Ts[i] * 100).toFixed(1)}%`).join(' > ')}`);
    ok(near(presetMaterial(table, 1, r).muaResin, presetMaterial(table, 0, r).mua, 1e-15), `${r}: Milky 수지 바탕 흡수 = 투명 수지 흡수`);
  }
}
done();
