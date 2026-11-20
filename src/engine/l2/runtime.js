// L2 solver 런타임 — 응답 테이블을 한 번 로드·자체검증(validateTable)해 보관한다 (spec §5.5).
import { unpackTable, TABLE_ENCODING } from './table-codec.js';
// 브라우저: main.js 가 시작 시 await initL2(browserLoader()). Node 테스트: initL2(nodeLoader()).
// 테이블이 없거나 검증 실패면 L2 결과는 "신뢰 불가"로 표시된다 — 옛 근사식으로 조용히 대체하지 않는다.
import { createTable } from './slab-table.js';
import { validateTable } from './validator.js';
import { compositeTable } from './mie-material.js';
import { b64ToF32 } from '../../model/materials-db.js';

// 기본 비드 응답표(mie-presets.json, spec 2026-11-20 §3.3) → table.mie[key] = 합성표(+ g, preset).
// 없으면 붙이지 않음 — 일반 Milky 계산이 오류를 냄(조용한 HG 대체 없음)
export function attachPresets(table, presets) {
  if (!presets?.presets) return table;
  table.mie = {};
  for (const [key, e] of Object.entries(presets.presets)) {
    const c = compositeTable(createTable(e.meta, b64ToF32(e.b64)), table, `preset:${key}`);
    table.mie[key] = Object.assign(c, { g: e.g, preset: e.preset });
  }
  return table;
}

let state = { table: null, check: null, error: 'L2 테이블 미로드' };
let raw = null;   // 마지막으로 읽은 원자료 { meta, data, refAD } — 3D 계산 Worker 에 그대로 넘겨 다시 받기·풀기를 건너뜀

// loader(): Promise<{ meta, data: Float32Array, refAD }>
export async function initL2(loader) {
  try {
    const { meta, data, refAD, presets } = await loader();
    raw = { meta, data, refAD, presets };
    const table = attachPresets(createTable(meta, data), presets);
    state = { table, check: validateTable(table, refAD), error: null };
  } catch (e) {
    state = { table: null, check: null, error: `L2 테이블 로드 실패: ${e.message ?? e}` };
  }
  return state;
}

export function l2State() { return state; }
export function l2Raw() { return raw; }
// 이미 받은 원자료로 적재(메인이 넘겨준 { meta, data:Float32Array, refAD }) — fetch·gzip 풀기 없음
export function bufferLoader(r) { return async () => r; }

export function browserLoader(base = './src/engine/l2/data/') {
  return async () => {
    const get = async (f) => { const r = await fetch(base + f); if (!r.ok) throw new Error(`${f} ${r.status}`); return r; };
    const [meta, refAD, presets] = await Promise.all([get('slab-meta.json').then((r) => r.json()), get('ref-ad.json').then((r) => r.json()), get('mie-presets.json').then((r) => r.json())]);
    if (meta.encoding === TABLE_ENCODING) {   // 압축 표(가수 12비트 + 바이트 평면 + gzip)
      const r = await get('slab-table.f32z');
      const raw = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      return { meta, data: unpackTable(new Uint8Array(raw)), refAD, presets };
    }
    return { meta, data: new Float32Array(await get('slab-table.bin').then((r) => r.arrayBuffer())), refAD, presets };
  };
}

// 실측소재 DB(src/model/materials-db.js createDb 결과) — main.js 가 시작 시 주입. L2 소재 선택이 여기서 조회된다.
let materialDbRef = null;
export function setMaterialDb(db) { materialDbRef = db; }
export function materialDb() { return materialDbRef; }
