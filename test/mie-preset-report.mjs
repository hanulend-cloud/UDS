// 정보(통과·실패 없음): node test/mie-preset-report.mjs — 기본 비드 대표성(spec 2026-11-20 §3.5, 평가 ③)
// DB 실측 소재마다: 같은 Milky(눈금 A)의 기본 비드 Mie 예측 vs HG(g 0.9) 예측 vs 실측 — 측정 두께, 법선 입사, 판 단독
import fs from 'node:fs';
import { loadTable } from './l2-util.mjs';
import { presetMaterial } from '../src/engine/l2/mie-preset.js';
import { l2Material } from '../src/engine/l2/material.js';
import { milkyFromMusR } from '../src/engine/l2/milky.js';
import { hpaDeg } from '../src/engine/l2/slab-table.js';

const table = loadTable(), db = JSON.parse(fs.readFileSync(new URL('../data/materials-db.json', import.meta.url))).entries ?? [];
const pct = (v) => (v == null ? '  -  ' : `${(v * 100).toFixed(1)}%`), deg = (v) => (v == null ? ' - ' : `${v.toFixed(0)}°`);
const pred = (tb, mat, t) => { const q = tb.query(mat.musR * t, mat.g, mat.n, 0, mat.mua * t); return { T: q.Tb + q.Ts, H: hpaDeg(q) }; };
console.log('소재 | 두께 | Milky(눈금 A) | 실측 T · HPA | 기본 비드 Mie T · HPA | HG(g 0.9) T · HPA');
for (const e of db.filter((x) => x.samples?.length)) {
  const m = milkyFromMusR(table, e.fitted.musR), a = presetMaterial(table, m, 'PC'), h = l2Material(table, m, 1.586);
  for (const s of e.samples) {
    const pm = pred(table.mie.PC, a, s.t), ph = pred(table, h, s.t);
    console.log(`${e.name} | ${s.t} mm | ${m.toFixed(2)} | ${pct(s.T)} · ${deg(s.hpa)} | ${pct(pm.T)} · ${deg(pm.H)} | ${pct(ph.T)} · ${deg(ph.H)}`);
  }
}
