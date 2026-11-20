// 실측 소재 카탈로그(PDF) — node test/material-catalog.mjs (2026-11-21)
import fs from 'node:fs';
import { loadTable } from './l2-util.mjs';
import { catalogEntries, catalogHtml, CATALOG_PDF } from '../tools/material-catalog.mjs';
import { ok, done } from './mech3d-util.mjs';

const db = JSON.parse(fs.readFileSync(new URL('../data/materials-db.json', import.meta.url), 'utf8'));
const items = catalogEntries(db, loadTable());
const withSamples = db.entries.filter((e) => e.samples?.length);
ok(items.length === withSamples.length && items.length >= 3, `측정값 있는 소재 모두 실림(${items.map((i) => i.name).join(', ')})`);
ok(items.every((i) => i.milky > 0 && i.milky <= 10 && i.grade.word), 'Milky(눈금 A)·확산 정도 설명 있음');
const html = catalogHtml(items, { date: '2026-11-21' });
ok(['숫자 읽는 법', 'HPA (반치각)', '알아 둘 점', '가정'].every((w) => html.includes(w)) && items.every((i) => html.includes(i.name)), '설명(용어·주의)과 소재 이름이 모두 들어감');
const pdf = new URL('../' + CATALOG_PDF, import.meta.url);
ok(fs.existsSync(pdf) && fs.readFileSync(pdf).subarray(0, 5).toString() === '%PDF-', `PDF 파일 있음(${CATALOG_PDF})`);
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
ok(main.includes("id: 'catalog'") && main.includes(CATALOG_PDF), '도움말 메뉴에 카탈로그 항목 · PDF 경로 연결');
done();
