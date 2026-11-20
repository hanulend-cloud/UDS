// 실측 소재 카탈로그(PDF) — 소재 DB(data/materials-db.json)의 측정값 있는 항목을 설명과 함께 정리
// 빌드: node tools/material-catalog.mjs  → docs/catalog/material-catalog.html · .pdf (Edge 헤드리스 인쇄)
// 메뉴: 도움말 → 실측 소재 카탈로그 (PDF)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { milkyFromMusR } from '../src/engine/l2/milky.js';

export const CATALOG_PDF = 'docs/catalog/material-catalog.pdf';

// 확산 정도 설명(새 Milky 눈금 A: 10 = 빛 50% 가림)
function grade(m) {
  if (m < 3) return { word: '약한 확산', use: 'LED 와 거리가 충분하거나 LED 가 촘촘할 때. LED 점이 비쳐 보일 수 있음' };
  if (m < 5.5) return { word: '중간 확산', use: '일반 조명 커버·표시등. 밝기와 고르기의 균형' };
  return { word: '강한 확산', use: 'LED 가 가깝거나 듬성할 때 점을 감춤. 대신 어두워짐' };
}

// DB → 카탈로그 항목(측정값 있는 소재만)
export function catalogEntries(db, table) {
  return (db.entries ?? []).filter((e) => e.samples?.length).map((e) => {
    const milky = milkyFromMusR(table, e.fitted.musR), p = e.particle ?? {};
    return {
      id: e.id, name: e.name, vendor: e.vendor ?? '-', status: e.status, source: e.source ?? '-', n: e.n,
      samples: e.samples, milky, grade: grade(milky),
      model: e.model, bead: p.type ? { type: p.type, assumed: !!p.assumed, d: p.d_um, range: p.dRange, wt: p.wt } : null,
      fitted: e.fitted, check: e.validation?.V6 ?? null, notes: e.notes ?? [],
    };
  });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (v) => `${(v * 100).toFixed(0)}%`;
const STATUS = { datasheet: '제조사 자료값(데이터시트)', measured: '직접 측정값' };

// HPA 그림: 정면 밝기의 절반이 되는 각도 — 퍼짐 모양 비교
function hpaSvg(items) {
  const W = 520, H = 230, cx = W / 2, cy = H - 20, R = 180, cols = ['#2f6fb3', '#d08a1e', '#3c9a5f'];
  const lobe = (hpa) => {   // cosⁿ 모양, n 은 반치각에서 0.5 가 되게
    const n = Math.log(0.5) / Math.log(Math.cos(hpa * Math.PI / 180)), pts = [];
    for (let a = -90; a <= 90; a += 2) { const r = R * Math.cos(a * Math.PI / 180) ** n; pts.push(`${(cx + r * Math.sin(a * Math.PI / 180)).toFixed(1)},${(cy - r * Math.cos(a * Math.PI / 180)).toFixed(1)}`); }
    return pts.join(' ');
  };
  const arcs = [0.5, 1].map((f) => `<path d="M ${cx - R * f} ${cy} A ${R * f} ${R * f} 0 0 1 ${cx + R * f} ${cy}" fill="none" stroke="#ccc" stroke-dasharray="3 3"/>`).join('');
  const lines = items.map((it, i) => `<polyline points="${lobe(it.samples[0].hpa)}" fill="none" stroke="${cols[i % 3]}" stroke-width="2.2"/>`).join('');
  const legend = items.map((it, i) => `<text x="12" y="${18 + i * 18}" font-size="12" fill="${cols[i % 3]}">■ ${esc(it.name)} — HPA ${it.samples[0].hpa}°</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:520px">${arcs}<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - R - 6}" stroke="#999"/><line x1="${cx - R - 6}" y1="${cy}" x2="${cx + R + 6}" y2="${cy}" stroke="#999"/>${lines}${legend}<text x="${cx + 4}" y="${cy - R - 8}" font-size="11" fill="#666">정면(0°)</text><text x="${cx + R * 0.5 + 2}" y="${cy - 4}" font-size="10" fill="#888">밝기 50%</text></svg>`;
}

export function catalogHtml(items, { date }) {
  const rows = items.map((it) => `<tr><td><b>${esc(it.name)}</b><br><span class="mut">${esc(it.vendor)} · PC</span></td><td>${pct(it.samples[0].T)}</td><td>${it.samples[0].hpa}°</td><td>${it.milky.toFixed(1)}</td><td>${esc(it.grade.word)}</td></tr>`).join('');
  const cards = items.map((it) => {
    const s = it.samples.map((x) => `두께 ${x.t} mm: 투과율 ${pct(x.T)}, HPA ${x.hpa}°`).join('<br>');
    const b = it.bead ? `${esc(it.bead.type)} 비드 지름 ${it.bead.d} µm${it.bead.assumed ? ' <b>(가정 — 제조사 미공개)</b>' : ''}, 농도 약 ${(it.bead.wt * 100).toFixed(2)} wt%${it.bead.range ? ` · 같은 측정값을 내는 지름 범위 ${it.bead.range[0].toFixed(1)}~${it.bead.range[1].toFixed(1)} µm` : ''}` : '-';
    return `<section class="card"><h3>${esc(it.name)} <span class="tag">${esc(it.grade.word)}</span></h3>
<table class="kv"><tr><th>제조사</th><td>${esc(it.vendor)}</td></tr>
<tr><th>바탕 수지</th><td>폴리카보네이트(PC), 굴절률 ${it.n}</td></tr>
<tr><th>값의 출처</th><td>${esc(STATUS[it.status] ?? it.status)} — ${esc(it.source)}</td></tr>
<tr><th>광학 값</th><td>${s}</td></tr>
<tr><th>UDS Milky</th><td><b>${it.milky.toFixed(1)}</b> (빛 약 ${(it.milky * 5).toFixed(0)}% 가림)</td></tr>
<tr><th>어디에 맞나</th><td>${esc(it.grade.use)}</td></tr></table>
<details open><summary>UDS 내부 계산 (개발자용)</summary>
<table class="kv small"><tr><th>계산 모델</th><td>${it.model === 'mie' ? 'Mie 산란(입자 크기 분포 포함)' : 'HG'}</td></tr>
<tr><th>확산 입자</th><td>${b}</td></tr>
<tr><th>물성</th><td>μs′ ${it.fitted.musR.toFixed(4)} /mm · g ${it.fitted.g.toFixed(4)} · μa ${it.fitted.mua.toFixed(4)} /mm</td></tr>
<tr><th>맞춤 확인</th><td>${it.check ? `${it.check.ok ? '통과' : '미달'} — ${esc(it.check.note)} (기준 ${esc(it.check.limit)})` : '-'}</td></tr>
<tr><th>참고</th><td>${it.notes.map(esc).join('<br>')}</td></tr></table></details></section>`;
  }).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>UDS 실측 소재 카탈로그</title><style>
@page{size:A4;margin:16mm 14mm}body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#222;font-size:11.5px;line-height:1.55}
h1{font-size:22px;margin:0 0 2px}h2{font-size:15px;border-bottom:2px solid #2f6fb3;padding-bottom:3px;margin:22px 0 8px}h3{font-size:14px;margin:0 0 6px}
.mut{color:#777}.tag{font-size:11px;background:#e8f0fa;color:#2f6fb3;border-radius:8px;padding:1px 8px;margin-left:6px;font-weight:normal}
table{border-collapse:collapse;width:100%}.list th,.list td{border:1px solid #ccd;padding:5px 7px;text-align:center}.list th{background:#eef2f7}.list td:first-child{text-align:left}
.kv th{width:92px;text-align:left;vertical-align:top;color:#555;font-weight:normal;padding:2px 6px 2px 0}.kv td{padding:2px 0}.small{font-size:10.5px}
.card{border:1px solid #d6dbe3;border-radius:6px;padding:10px 12px;margin:10px 0;page-break-inside:avoid}details summary{color:#2f6fb3;margin-top:6px;cursor:pointer}
.box{background:#f6f8fb;border-left:3px solid #2f6fb3;padding:7px 10px;margin:8px 0}.warn{background:#fff7e8;border-left-color:#d08a1e}
dl{margin:0}dt{font-weight:bold;margin-top:6px}dd{margin:0 0 0 12px}</style></head><body>
<h1>실측 소재 카탈로그</h1><div class="mut">Uniform Design Simulator(UDS) 소재 DB 정리 · ${esc(date)} 기준 · 소재 ${items.length}종</div>
<div class="box">이 문서는 UDS 소재 DB 에 들어 있는 <b>측정값이 있는 확산 소재</b>를 정리한 것입니다. 부품 속성 → 소재에서 이 이름을 고르면, 아래 측정값에 맞춘 물성으로 계산합니다. 소재 이름 없이 Milky 숫자만 넣은 부품은 기본 비드로 계산하므로 이 표와 다를 수 있습니다.</div>

<h2>1. 한눈에 보기</h2>
<table class="list"><tr><th>소재</th><th>투과율 (2 mm)</th><th>HPA (퍼짐)</th><th>UDS Milky</th><th>확산 정도</th></tr>${rows}</table>
<p class="mut">Milky 가 클수록 빛이 넓게 퍼져 LED 점이 덜 보이지만, 투과율이 낮아져 어두워집니다.</p>
${hpaSvg(items)}
<p class="mut">그림: 판을 지난 빛이 각도마다 얼마나 밝은지(정면 = 1). 곡선이 넓을수록 잘 퍼지는 소재입니다.</p>

<h2>2. 숫자 읽는 법</h2><dl>
<dt>투과율 (전광선, 2 mm)</dt><dd>판에 수직으로 들어간 빛 중 반대쪽으로 나오는 비율. 높을수록 밝습니다. 투명 PC 는 약 89% 입니다.</dd>
<dt>HPA (반치각)</dt><dd>나온 빛의 밝기가 정면 밝기의 절반이 되는 각도. 클수록 넓게 퍼져 LED 점이 잘 감춰집니다.</dd>
<dt>UDS Milky</dt><dd>UDS 의 확산 눈금(0~10). 0 = 투명, 5 = 빛 25% 가림, 10 = 빛 50% 가림(최대). 측정값에서 계산한 값입니다.</dd>
<dt>값의 출처</dt><dd>“제조사 자료값”은 제조사 공개 자료의 대표값입니다. 실제 생산 로트·두께·색상에 따라 다를 수 있어, 정밀 설계에는 직접 측정한 값(소재 DB 관리 창에서 등록)을 권장합니다.</dd></dl>

<h2 style="page-break-before:always">3. 소재별 상세</h2>${cards}

<h2>4. 알아 둘 점</h2>
<div class="box warn">· 지금 들어 있는 소재는 제조사 자료의 <b>2 mm 투과율·HPA 한 점</b>만으로 맞췄습니다. 반사율과 다른 두께는 측정되지 않아, 두께가 2 mm 에서 멀어질수록 오차가 커질 수 있습니다.<br>
· 확산 입자 종류(PMMA 비드)와 지름은 제조사가 공개하지 않아 <b>가정</b>한 값입니다.<br>
· 정확도를 높이려면 두 가지 이상 두께의 투과율·반사율, 또는 각도별 밝기(BSDF)를 측정해 소재 DB 관리 창에 등록하세요.<br>
· 이 문서는 UDS 계산용 정리 자료이며, 제조사의 공식 데이터시트가 아닙니다.</div>
</body></html>`;
}

// CLI: HTML 생성 → Edge 헤드리스로 PDF 인쇄
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { loadTable } = await import('../test/l2-util.mjs');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const db = JSON.parse(fs.readFileSync(path.join(root, 'data/materials-db.json'), 'utf8'));
  const items = catalogEntries(db, loadTable());
  const outDir = path.join(root, 'docs/catalog'); fs.mkdirSync(outDir, { recursive: true });
  const html = path.join(outDir, 'material-catalog.html'), pdf = path.join(root, CATALOG_PDF);
  fs.writeFileSync(html, catalogHtml(items, { date: new Date().toLocaleDateString('sv-SE') }), 'utf8');
  const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
  if (!edge) { console.error('Edge 를 찾지 못함 — HTML 만 만듦:', html); process.exit(1); }
  execFileSync(edge, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, 'file:///' + html.replace(/\\/g, '/')], { stdio: 'ignore' });
  console.log(`카탈로그 ${items.length}종 → ${CATALOG_PDF} (${fs.statSync(pdf).size} bytes)`);
}
