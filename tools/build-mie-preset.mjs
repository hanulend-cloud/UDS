// 기본 비드 Mie 응답표 생성(spec 2026-11-20 §3.3): node tools/build-mie-preset.mjs [--quick] [--only PC]
// 결과 src/engine/l2/data/mie-presets.json = { version, created, presets: { PC: { preset, g, meta, b64, V13 }, PMMA: {...} } }
// τ' ∈ [0, 4] 는 이 표(Mie MC), 그 위는 주 응답표(HG, 같은 g) — 연결점 V13 |ΔT|,|ΔR| ≤ 0.01
import fs from 'node:fs';
import { buildMieTable, checkTransition, STD_ROWS } from '../src/engine/l2/mie-material.js';
import { MIE_PRESETS, presetOptics } from '../src/engine/l2/mie-preset.js';
import { f32ToB64 } from '../src/model/materials-db.js';
import { loadTable } from '../test/l2-util.mjs';

const quick = process.argv.includes('--quick'), only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const file = new URL('../src/engine/l2/data/mie-presets.json', import.meta.url);
const main = loadTable(), out = fs.existsSync(file) && only ? JSON.parse(fs.readFileSync(file)) : { version: 1, presets: {} };
out.created = new Date().toISOString();
for (const key of Object.keys(MIE_PRESETS).filter((k) => !only || k === only)) {
  const p = MIE_PRESETS[key], opt = presetOptics(key), t0 = Date.now();
  const sys = buildMieTable({ opt, n: p.nH, tauMax: 4, rows: STD_ROWS, N: quick ? 2000 : 20000, seed: 21,
    onProgress: (f) => process.stdout.write(`\r${key} ${(f * 100).toFixed(0)}%   `) });
  const V13 = checkTransition(sys.table, main, opt.g, p.nH);
  console.log(`\n${key}: g ${opt.g.toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(0)} s · V13 ${V13.value.toFixed(4)} ${V13.ok ? 'ok' : 'FAIL'}`);
  if (!V13.ok && !quick) throw new Error(`${key} V13 불합격 — 표를 넣지 않음`);
  out.presets[key] = { preset: p, g: opt.g, meta: sys.meta, b64: f32ToB64(sys.data), V13 };
}
fs.writeFileSync(file, JSON.stringify(out));
console.log(`저장: ${file.pathname} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
