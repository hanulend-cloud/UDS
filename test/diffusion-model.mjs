// 확산 모델 창(spec 2026-11-20 §4, 2단계 a): node test/diffusion-model.mjs
import fs from 'node:fs';
import { loadTable } from './l2-util.mjs';
import { ok, done } from './mech3d-util.mjs';
import { mapTableHtml, curveSvg, trustHtml, presetHtml } from '../src/ui/m3/diffusion-model-dlg.js';
import { milkyMapRows, MAP_MILKY, presetSummary, phaseCurve, transmitCurve, trustLabel, trustRows } from '../src/model/diffusion-model.js';

const table = loadTable();
{
  const rows = milkyMapRows(table, 'PC');
  ok(rows.length === MAP_MILKY.length && rows[0].milky === 0 && rows.at(-1).milky === 10, `대응표 Milky ${MAP_MILKY.join(',')}`);
  ok(rows[0].clear === true && rows[0].wt === 0 && rows[0].musR === 0, 'Milky 0 = 투명 수지(비드 0)');
  ok(rows.slice(1).every((r, i) => r.wt > rows[i].wt && r.musR > rows[i].musR && r.T < rows[i].T), 'Milky ↑ → wt%·μs′ ↑, 2 mm 투과율 ↓');
  const r10 = rows.at(-1);
  ok(Math.abs(r10.shield - 0.5) < 1e-12 && r10.mus > 50 * r10.musR, `Milky 10 = 50% 가림 · μs ≫ μs′(g ${r10.g.toFixed(3)})`);
  ok(rows.every((r) => Number.isFinite(r.hpa)), 'HPA 모두 숫자');
  const s = presetSummary('PMMA');
  ok(s.bead === 'silicone' && s.d_um === 2 && s.nH === 1.49 && s.g > 0.98, `PMMA 프리셋 요약(g ${s.g.toFixed(4)})`);
}
{
  const ph = phaseCurve('PC');
  ok(ph.length > 50 && ph[0].deg < 1 && ph.at(-1).deg > 179 && ph.every((p, i) => !i || p.deg > ph[i - 1].deg), '위상함수 0→180° 순서');
  ok(ph[0].rel === 1 && ph.every((p) => p.rel > 0 && p.rel <= 1), '위상함수 정면 = 1 로 정규화');
  const tc = transmitCurve(table, 'PC', 5);
  ok(tc.length >= 20 && tc[0].rel === 1 && tc[0].deg === 2.5 && tc.every((p) => p.rel >= 0 && Number.isFinite(p.rel)), '투과 각분포(0~5° 묶음 = 정면 1)');
  const top = curveSvg([{ name: 'x', pts: [{ deg: 0, rel: 1 }, { deg: 30, rel: 1.3 }] }]);
  ok(top.includes('>1.5<') && !top.includes('>2<') && !top.includes('>1.13<'), '선형 축 위 끝이 최댓값에 맞춰 늘어남(1.3 → 1.5, 0.5 간격)');
  const half = (c) => c.find((p) => p.rel <= 0.5)?.deg ?? 90;
  ok(half(transmitCurve(table, 'PC', 8)) > half(transmitCurve(table, 'PC', 2)), `Milky 클수록 투과 각분포가 넓음(${half(transmitCurve(table, 'PC', 2))}° → ${half(transmitCurve(table, 'PC', 8))}°)`);
}
{
  const db = JSON.parse(fs.readFileSync(new URL('../data/materials-db.json', import.meta.url), 'utf8')).entries;
  const dq = db.find((e) => e.id === 'covestro-dq5142');
  ok(trustLabel({ ent: null }).code === 'assumed' && trustLabel({ ent: null }).label === '가정', '이름 없는 Milky = 가정');
  const t2 = trustLabel({ ent: dq, thick: 2 });
  ok(t2.code === 'fit' && t2.label === '실측보정 · 제조사 자료값', `V6 통과 + 자료값 = ${t2.label}`);
  ok(trustLabel({ ent: { ...dq, status: 'measured' }, thick: 2 }).label === '실측보정', '직접 측정 = 실측보정');
  ok(trustLabel({ ent: { ...dq, validation: { V6: { ok: false } } }, thick: 2 }).code === 'fitBad', 'V6 미달 = 실측보정(오차 큼)');
  ok(trustLabel({ ent: dq, thick: 0.9 }).code === 'range' && trustLabel({ ent: dq, thick: 4.1 }).code === 'range', '두께 측정의 0.5~2배 밖 = 측정 범위 밖');
  ok(trustLabel({ ent: dq, thick: 1 }).code === 'fit' && trustLabel({ ent: dq, thick: 4 }).code === 'fit', '경계(0.5배·2배)는 범위 안');
  ok(trustLabel({ ent: { ...dq, samples: [] } }).code === 'assumed', '측정값 없는 DB 소재 = 가정');
  const parts = [
    { name: '커버', material: { kind: 'milky', milky: 4, dbId: '' } },
    { name: '렌즈', material: { kind: 'milky', milky: 4.6, dbId: 'covestro-dq5142' } },
    { name: '케이스', material: { kind: 'opaque' } },
  ];
  const rows = trustRows({ parts, thickOf: (i) => [2, 6, 3][i], dbGet: (id) => db.find((e) => e.id === id) });
  ok(rows.length === 2 && rows[0].code === 'assumed' && rows[1].code === 'range' && rows[1].name === '렌즈', 'Milky 부품만 · 렌즈 6 mm = 측정 범위 밖');
}
{
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const block = (label) => { const i = main.indexOf(`{ label: '${label}', items: [`); return i < 0 ? '' : main.slice(i, main.indexOf('] },', i)); };
  const dev = block('개발자'), set = block('설정');
  ok(dev.includes("id: 'admin'") && dev.includes("id: 'mat-db'") && dev.includes("id: 'mie-model'"), '개발자 메뉴 = 관리자 모드 · 소재 DB 관리 · 확산 모델');
  ok(!set.includes("id: 'admin'") && !set.includes("id: 'mat-db'"), '설정 메뉴에서는 빠짐');
  ok(main.indexOf("label: '개발자'") > main.indexOf("label: '설정'") && main.indexOf("label: '개발자'") < main.indexOf("label: '도움말'"), '메뉴 순서: 설정 → 개발자 → 도움말');
  ok(main.includes("if (id === 'mie-model') return m3app.openDiffusionModel();"), 'mie-model 실행 연결');
  const app = fs.readFileSync(new URL('../src/ui/m3/app.js', import.meta.url), 'utf8');
  ok(!app.includes('설정 > 관리자 모드') && app.includes('개발자 > 관리자 모드') && app.includes('export function openDiffusionModel('), '안내 문구 = 개발자 > 관리자 모드 · 창 열기 export');
}
{
  const rows = milkyMapRows(table, 'PC'), h = mapTableHtml(rows);
  ok((h.match(/<tr/g) ?? []).length === rows.length + 1 && h.includes('wt%') && h.includes('μs′') && h.includes('투명 수지'), '대응표 = 머리줄 + Milky 행, Milky 0 은 투명 수지');
  ok(presetHtml(presetSummary('PC')).includes('PMMA') && presetHtml(presetSummary('PC')).includes('3 µm'), '기본 비드 요약');
  const svg = curveSvg([{ name: 'a', pts: phaseCurve('PC') }], { log: true, xMax: 180 });
  ok(svg.startsWith('<svg') && svg.includes('<polyline') && !/NaN|Infinity/.test(svg), '로그 축 곡선 SVG(NaN 없음)');
  const t = trustHtml([{ name: '커버', material: 'Milky (이름 없음)', milky: 4, code: 'assumed', label: '가정', why: 'x' }], []);
  ok(t.includes('커버') && t.includes('가정') && t.includes('입사각'), '신뢰 표시 표 + 입사각 안내');
  ok(!/HG/.test(h + t + svg), '창 어디에도 HG 없음');
}
done();
