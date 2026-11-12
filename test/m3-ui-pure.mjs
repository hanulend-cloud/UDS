// CAD UI 순수 도우미(DOM 없이): node test/m3-ui-pure.mjs
import { treeNodes as treeNodes0, partBadge, renderFeatureTree as renderFeatureTree0, treeHtml as treeHtml0, toggleVisibility, esc as escT } from '../src/ui/m3/feature-tree.js';
// 예전 시험은 광원이 펼쳐진 상태를 봄 — 2026-11-12 부터 광원은 처음 접힘이라 시험에서는 펼친 상태로 둠(접힘 시험은 맨 아래 '구성 트리')
const lightOpen = (S = {}) => ({ ...S, fold: { light: false, ...(S.fold ?? {}) } });
const treeNodes = (M, S, ...r) => treeNodes0(M, lightOpen(S), ...r), treeHtml = (M, S, ...r) => treeHtml0(M, lightOpen(S), ...r);
const renderFeatureTree = (el, M, S, ...r) => renderFeatureTree0(el, M, lightOpen(S), ...r);
import { judgeText, lumCard, needText, fmtU, buildLut, NO_DATA_RGB, DEFAULT_GUIDE } from '../src/ui/m3/results-panel.js';
import { checkLabels, statusWord, statusIcon, checkAria, isActivateKey, esc as escS } from '../src/ui/m3/status-bar.js';
import { ramp, NO_DATA } from '../src/ui/m3/colormap.js';
import { defaultLight, defaultObserve, defaultChecks } from '../src/engine/mech3d/defs.js';
import { defaultPart, setPartMaterial, setPartMaterialParam } from '../src/engine/mech3d/materials.js';
import { setPartTab, meshInfo, partHeaderText, reflAddFormHtml, renderPartProps, materialPickHtml, ledDistHtml, partTitleText, xfSummaryText, sectionOpen, resetSections } from '../src/ui/mech3d-panel.js';
import { DEFAULT_FINISH_CATALOG, finishCandidatesFor, catalogOf } from '../src/engine/mech3d/housing-led.js';
import { reflDbHtml } from '../src/ui/mech3d-light-panel.js';
import { stepLayoutRowHtml, clampVirtual, virtCountMax, ledRowsHtml, defaultRowGap } from '../src/ui/mech3d-light-panel.js';
import { rowGapOptions } from '../src/engine/mech3d/placement.js';
import { ok, done } from './mech3d-util.mjs';
import { stageAvailability, autoCardHtml, tileConfigHtml, compareHtml, clampCap, overallFrac, etaText, profileSvg, shapeText, screenSummary, reusableCurrent, defaultHousingPart, finishText, applyDz, applyFinish, capDefault, nextFinish } from '../src/ui/m3/autodesign-panel.js';

const M = {
  name: 't', contacts: [{ a: 0, b: 1, mode: 'contact' }], checks: defaultChecks(),
  parts: [setPartMaterialParam(setPartMaterial(defaultPart(0, '커버', 1), 'milky'), 'milky', 3), setPartMaterial(defaultPart(1, '하우징', 1), 'opaque')],
  light: { ...defaultLight(), kind: 'manual' }, observe: { ...defaultObserve(), faces: [{ part: 0, face: 1 }] },
};
// 기구 최적화 왼쪽 칸 + 가운데 타일(항목 스위치·설정)을 합친 HTML — 카드 시험용
const card = (o) => autoCardHtml(o) + ['milky', 'leds', 'shape', 'housing', 'height'].map((k) => tileConfigHtml(k, o).html).join('');
{ const N = treeNodes(M, { node: 'part:0', line: { kind: 'line', closed: false, length: 116, width: 16 } });
  ok(N.map((n) => n.id).join() === 'obs,parts,part:0,part:1,light,leds', `트리 노드(관측면 맨 위): ${N.map((n) => n.id).join()}`);
  const obsN = N.shift();
  ok(N[1].badge === 'Milky 3.0' && N[1].sel && N[1].child && N[2].badge.startsWith('불투명') && N[3].badge === '직접 배치' && N[4].label === 'LED ×10' && N[4].badge === '균등'
    && obsN.badge === '직선 116×16 mm · 목표 80/80%', `배지: ${N.map((n) => n.badge).join(' | ')}`); }
{ const N = treeNodes({ ...M, light: defaultLight() }, { node: null, line: null });
  ok(!N.some((n) => n.id === 'leds') && /인식 중$/.test(N.find((n) => n.id === 'obs').badge) && N.find((n) => n.id === 'light').badge === '지정 안 함', '광원 없음 → LED 노드 없음, 라인 인식 중');
  const N2 = treeNodes({ ...M, observe: defaultObserve() }, { node: null, line: null });
  ok(N2.find((n) => n.id === 'obs').badge === '미지정 — 클릭', '관측면 없음 → 미지정'); }
ok(partBadge(setPartMaterial(defaultPart(0, 'p', 1), 'clear')).startsWith('투명 '), '투명 부품 배지 = 투명 + 투과율');
{ const N = treeNodes({ ...M, light: { ...defaultLight(), kind: 'manual', manual: { ...defaultLight().manual, pitch: 11.6000001 } } }, { node: null, line: { kind: 'zigzag', closed: false, length: 99.6, width: 7.4 } });
  ok(N.find((n) => n.id === 'leds').badge === '피치 11.6' && N.find((n) => n.id === 'obs').badge === 'zigzag 100×7 mm · 목표 80/80%', `피치 반올림 · 모르는 라인 종류: ${N.find((n) => n.id === 'leds').badge} / ${N.find((n) => n.id === 'obs').badge}`); }
{ const el = { innerHTML: '', addEventListener() {}, contains: () => false, ownerDocument: null, querySelectorAll: () => [] };
  const P = { ...M, parts: [{ ...M.parts[0], name: `<img src=x onerror="a()">&'` }] };
  renderFeatureTree(el, P, { node: null, line: null }, { onNode() {} });
  ok(!el.innerHTML.includes('<img') && el.innerHTML.includes('&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;'), '부품 이름 escape');
  ok(escT(`<>"'&`) === '&lt;&gt;&quot;&#39;&amp;' && escS(`<>"'&`) === '&lt;&gt;&quot;&#39;&amp;', 'esc: 특수문자 5종 모두'); }
{ const h = treeHtml(M, { node: 'part:0', line: null });
  ok(/role="button" tabindex="0" aria-current="true" data-node="part:0"/.test(h) && (h.match(/aria-current/g) ?? []).length === 1 && (h.match(/role="button" tabindex="0"(?: aria-current="true")? data-node=/g) ?? []).length === treeNodes(M, { node: 'part:0', line: null }).length,
    '트리 노드: role=button · tabindex=0 · 선택 노드만 aria-current'); }
{ const N = treeNodes(M, { node: null, line: null, hidden: [1], hideLeds: false }).filter((n) => n.id !== 'obs');
  ok(N[0].eye === 'all' && N[1].eye === 'on' && N[2].eye === 'off' && N.find((n) => n.id === 'leds').eye === 'on', '눈 단추: 숨긴 부품 off · 머리 = 모두 보기 · 직접 배치 LED 도 있음');
  ok(treeNodes(M, { node: null, line: null, hidden: [] }).find((n) => n.id === 'parts').eye === undefined, '숨긴 것 없으면 머리 눈 단추 없음');
  const h = treeHtml(M, { node: null, line: null, hidden: [1] });
  ok(/data-eye="part:1"[^>]*aria-pressed="false"/.test(h) && /class="m3-node child d1  hid"/.test(h), '눈 단추 HTML · 숨긴 행 흐리게');
  const stp = { ...M, light: { ...defaultLight(), kind: 'step', step: { leds: [0, 1], excluded: [] } } };
  ok(treeNodes(stp, { node: null, line: null, hideLeds: true }).find((n) => n.id === 'leds').eye === 'off', 'LED STEP 노드 눈 단추');
  const T = toggleVisibility;
  ok(JSON.stringify(T('part:1', false, 3, [], false)) === '{"hidden":[1],"hideLeds":false}' && JSON.stringify(T('part:1', false, 3, [1], false)) === '{"hidden":[],"hideLeds":false}'
    && JSON.stringify(T('part:1', true, 3, [], false)) === '{"hidden":[0,2],"hideLeds":true}' && JSON.stringify(T('parts', false, 3, [0, 2], true)) === '{"hidden":[],"hideLeds":false,"hiddenLeds":[],"hidePcb":false}'
    && JSON.stringify(T('leds', false, 3, [2], false)) === '{"hidden":[2],"hideLeds":true}' && JSON.stringify(T('leds', true, 3, [], true)) === '{"hidden":[0,1,2],"hideLeds":false}', 'toggleVisibility: 끄기·켜기·이것만·모두 보기·LED'); }
{ const cls = []; const el = { listeners: {}, addEventListener(k, f) { this.listeners[k] = f; }, contains: () => true, ownerDocument: null, querySelectorAll: () => [], set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; } };
  let eye = null, node = null;
  renderFeatureTree(el, M, { node: null, line: null }, { onNode: (id) => { node = id; }, onEye: (id, only) => { eye = [id, only]; } });
  const tgt = (ds) => ({ closest: (q) => (q === '[data-eye]' ? (ds.eye ? { dataset: ds } : null) : { dataset: ds }) });
  el.listeners.click({ target: tgt({ eye: 'part:0', node: 'part:0' }), shiftKey: true, stopPropagation() {} });
  ok(eye?.[0] === 'part:0' && eye[1] === true && node === null, '눈 단추 클릭 → onEye(Shift), 노드 선택 안 함'); }
ok(statusWord('ok') === '양호' && statusWord('warn') === '경고' && statusWord('bad') === '불량' && statusWord('na') === '미계산' && statusWord('?') === '미계산'
  && statusIcon('ok') === '✓' && statusIcon('warn') === '!' && statusIcon('bad') === '✕' && statusIcon('na') === '–' && checkAria({ text: '살두께 0.50 mm', st: 'warn' }) === '살두께 0.50 mm — 경고', '배지 상태 단어 · 기호');
ok(isActivateKey({ key: 'Enter' }) && isActivateKey({ key: ' ' }) && !isActivateKey({ key: 'a' }) && !isActivateKey({ key: 'Tab' }), '활성화 키 = Enter/Space');
{ const L = buildLut(), n = NO_DATA_RGB;
  ok(L instanceof Uint8Array && L.length === 768 && [0, 1, 2].every((k) => L[k] === Math.round(ramp(0)[k] * 255) && L[765 + k] === Math.round(ramp(1)[k] * 255) && L[384 + k] === Math.round(ramp(128 / 255)[k] * 255)), '256단계 색 표 = ramp');
  ok(n.every((v, k) => v === Math.round(NO_DATA[k] * 255)), '자료 없음 색 = colormap NO_DATA'); }
ok(typeof DEFAULT_GUIDE === 'string' && DEFAULT_GUIDE.length > 0, '기본 안내 문구');
ok(JSON.stringify(judgeText(0.85, 0.8)) === '{"cls":"ok","text":"목표 80% · 합격"}' && judgeText(0.7, 0.8).cls === 'bad' && judgeText(0.7, 0.8).text === '목표 80% · 미달 −10.0%p' && judgeText(NaN, 0.8).cls === '', '판정 문구(합격·미달·값 없음)');
{ const st = { profile: Float64Array.from([1, 0.5, NaN]) };
  const rel = lumCard(st, { eff: 0.2, lum: null }, null), abs = lumCard(st, { eff: 0.2, lum: 1234.4 }, 1000), none = lumCard(st, { eff: 0.2, lum: 800 }, null);
  ok(rel.value === '75%' && rel.ratio === null && abs.value === '1234 cd/m²' && abs.pass === true && Math.abs(abs.ratio - 1.2344) < 1e-12 && none.pass === null && none.sub === '목표 없음',
    `평균 광량 카드: 상대 ${rel.value}, 절대 ${abs.value}(${abs.sub})`); }
{ const T = checkLabels({ interference: { status: 'bad', count: 2 }, reach: { status: 'ok', minReach: 0.92, minDist: 6.5 }, wall: { status: 'warn', min: 0.5 }, leak: { status: 'ok', ratio: 0.04 } });
  ok(T.map((t) => t.text).join(' | ') === 'LED–부품 간섭 2건 | 살두께 0.50 mm | 부품 간섭 –' && T.map((t) => t.st).join() === 'bad,warn,na', `점검 배지(조립·성형만): ${T.map((t) => t.text).join(' | ')}`);
  ok(checkLabels({}).every((t) => t.st === 'na' && t.text.endsWith('–')) && checkLabels({ interference: { status: 'ok', count: 0 } })[0].text === 'LED–부품 간섭 없음', '점검 전 → 회색 –'); }
// 반올림: 판정과 표시가 엇갈리지 않게(좋을수록 큰 값은 내림, 작을수록 좋은 값은 올림, 미달 폭은 최소 0.01)
ok(fmtU(0.7999) === '79.9%' && fmtU(0.92) === '92.0%' && fmtU(0.29) === '29.0%' && fmtU(1) === '100.0%' && fmtU(0.80009) === '80.0%' && fmtU(NaN) === '–'
  && judgeText(0.7999, 0.8).text === '목표 80% · 미달 −0.1%p', `U 표시 내림 · 미달 폭: ${fmtU(0.7999)} / ${judgeText(0.7999, 0.8).text}`);
{ const st = { profile: Float64Array.from([1, 0.5]) }, a = lumCard(st, { lum: 999.7 }, 1000), e = lumCard({ profile: Float64Array.from([NaN, NaN]) }, null, null);
  ok(a.value === '999 cd/m²' && a.pass === false && a.sub.endsWith('미달 −1') && e.value === '–', `광량 내림·빈 프로파일: ${a.value} ${a.sub} / ${e.value}`); }
// 필요 광속 표시(2026-11-11): 모자라지 않게 올림
ok(needText({ total: 19.41, perLed: 1.941 }) === '필요 광속 LED당 1.95 lm · 총 19.5 lm', `필요 광속 올림(LED당 먼저): ${needText({ total: 19.41, perLed: 1.941 })}`);
ok(needText({ total: 123.2, perLed: 0.5 }) === '필요 광속 LED당 0.50 lm · 총 124 lm' && needText(null) === '', '필요 광속 자릿수 · 없으면 빈칸');
{ const { needShort } = await import('../src/ui/m3/progressive.js'), { obsNeedHtml } = await import('../src/ui/mech3d-light-panel.js');
  const ph = { eff: 0.2, effLum: 0.02, area: 1000, nLeds: 10 };
  ok(needShort({ total: 14.9, perLed: 0.351 }) === 'LED당 0.36 lm 필요' && needShort(null) === '', `결과 카드용 짧은 글: ${needShort({ total: 14.9, perLed: 0.351 })}`);
  const h = obsNeedHtml({ targetLum: 1000 }, ph);
  ok(/필요 광속 LED당 [0-9.]+ lm · 총 [0-9.]+ lm/.test(h) && obsNeedHtml({ targetLum: null }, ph) === '' && /계산 뒤/.test(obsNeedHtml({ targetLum: 1000 }, null)), `목표 칸 아래 필요 광속: ${h}`); }
// LED 광속 옆 예상 휘도(2026-11-11) — 입력한 lm 으로 바로(계산 다시 안 함). 필요 광속과 같은 식의 정방향
{ const { ledLumHtml } = await import('../src/ui/mech3d-light-panel.js'), { lumFor, requiredFlux } = await import('../src/ui/m3/progressive.js');
  const ph = { eff: 0.2, effLum: 0.02, area: 1000, nLeds: 10 }, n = requiredFlux(ph, 1000);
  ok(Math.abs(lumFor(ph, n.perLed) - 1000) < 1e-6 && lumFor(ph, 0) === null && lumFor(null, 5) === null, `예상 휘도 = 필요 광속의 역 (${lumFor(ph, n.perLed)})`);
  const a = ledLumHtml({ fluxLm: 2 * n.perLed }, ph, 1000), b = ledLumHtml({ fluxLm: 0.5 * n.perLed }, ph, 1000);
  ok(/예상 휘도 <b>2000 cd\/m²<\/b>/.test(a) && /목표 1000/.test(a) && /class="ok"/.test(a) && /class="bad"/.test(b), `예상 휘도 · 목표 비교: ${a} / ${b}`);
  ok(/상대값/.test(ledLumHtml({ fluxLm: 0 }, ph, 1000)) && /계산 뒤/.test(ledLumHtml({ fluxLm: 3 }, null, null)) && !/목표/.test(ledLumHtml({ fluxLm: 3 }, ph, null)), '광속 0 = 상대값 · 계산 전 = 안내 · 목표 없으면 비교 없음'); }
{ const css = (await import('fs')).readFileSync('styles.css', 'utf8');
  ok(/\.m3-res \.m3-m \.s\.m3-need\s*\{[^}]*display:\s*block/.test(css), '넓은 화면에서도 결과 카드의 필요 광속 줄은 보임'); }
{ const { leakText } = await import('../src/ui/m3/status-bar.js');
  ok(checkLabels({ wall: { status: 'warn', min: 0.7996 } })[1].text === '살두께 0.79 mm' && leakText({ status: 'warn', ratio: 0.2004, worst: { part: 1, face: 5, ratio: 0.12 } }, ['케이스', '확산판']) === '새는 빛 21% · 주로 확산판 면 #5 12%'
    && leakText({ status: 'ok', ratio: 0.07, worst: { part: -1, face: -1, ratio: 0.07 } }) === '새는 빛 7% · 주로 틈으로 바로 7%' && leakText({ status: 'na' }) === '', '살두께 내림 · 새는 빛 문구(올림, 가장 많이 새는 면)'); }
ok(judgeText(0.8004, 0.8009).cls === 'ok' && judgeText(0.7999, 0.8).cls === 'bad' && judgeText(0.8, 0.8).cls === 'ok' && judgeText(0.855, 0.8567).text === '목표 85% · 합격', '판정 = 표시(내림)값 비교, 목표도 내림 표시');
{ const base = { parts: [{ material: { kind: 'milky' } }, { material: { kind: 'opaque' } }], light: { kind: 'manual' }, observe: { faces: [{ part: 0, face: 1 }] } };
  const a = stageAvailability(base, { non25: [0, 0.5] });
  ok(a.milky.ok && a.leds.ok && a.shape.ok && a.shape.parts.join() === '0', '가능: Milky 부품 있음 · 직접 배치 · 2.5D 부품만 ③ 대상');
  const b = stageAvailability({ ...base, light: { kind: 'step' }, parts: [{ material: { kind: 'clear' } }] }, { non25: [0.5] });
  ok(!b.milky.ok && /Milky 부품/.test(b.milky.why) && !b.leds.ok && /LED STEP/.test(b.leds.why) && /기준/.test(b.leds.why) && !b.shape.ok, '불가 이유: Milky 없음 · LED STEP 기준 LED 없음 · 2.5D 아님');
  const stepL = (emitters, excluded = []) => stageAvailability({ ...base, light: { kind: 'step', step: { leds: [1, 2], excluded, emitters } } }, { non25: [0, 0.5] }).leds;
  const s1 = stepL([{ part: 1 }, { part: 2 }]), s2 = stepL([{ part: 1, needsCheck: true }, { part: 2 }], [2]), s3 = stepL([{ part: 2 }], [1]);
  ok(s1.ok && s1.note === 'LED STEP — 기준 LED 를 복사해 개수·간격 조정' && !s2.ok && /기준/.test(s2.why) && s3.ok, 'LED STEP ②: 기준 발광점(확인 필요·제외 아님) 있으면 가능, 없으면 이유');
  ok(card({ avail: { ...a, leds: s1 }, sel: { leds: true }, running: null }).includes('기준 LED 를 복사해 개수·간격 조정'), '카드: LED STEP ② 안내 문구');
  const h = card({ avail: a, sel: { milky: true, leds: false, shape: false, shapePart: 0 }, running: null });
  ok(h.includes('data-ad="milky" checked') && !h.includes('data-ad="run"') && !h.includes('disabled data-ad="milky"'), '카드: 체크 상태(실행 단추는 창 오른쪽 위)');
  ok(autoCardHtml({ avail: a, sel: { milky: true }, running: null, canRevert: true }).includes('data-ad="revert"') && !h.includes('data-ad="revert"'), '카드: 적용 뒤에만 되돌리기');
  const c = compareHtml({ cur: { count: 5, pitch: 0, milky: 3, Ulen: 0.62, Uwid: 0.7, eff: 0.6 }, best: { count: 4, pitch: 0, milky: 3.5, Ulen: 0.81, Uwid: 0.72, eff: 0.55 }, feasible: true, reason: '', shape: null });
  ok(c.includes('LED') && c.includes('4') && c.includes('81.0%') && c.includes('data-ad="apply"') && c.includes('data-ad="cancel"'), '비교표: 현재 | 최적 · 적용·취소');
  const cs = compareHtml({ cur: { count: 10, pitch: 0, stepOrig: true, milky: 2, Ulen: 0.6, Uwid: 0.7, eff: 0.5 }, best: { count: 10, pitch: 0, stepOrig: true, milky: 3, Ulen: 0.8, Uwid: 0.7, eff: 0.4 }, feasible: true, reason: '', shape: null, stepLeds: 10 });
  ok((cs.match(/LED STEP 현재 10개/g) ?? []).length === 2 && !cs.includes('균등'), '비교표: LED STEP 원래 위치 유지 = 두 열 모두 LED STEP 현재 10개');
  const cv = compareHtml({ cur: { count: 10, pitch: 0, stepOrig: true, milky: 2, Ulen: 0.6, Uwid: 0.7, eff: 0.5 }, best: { count: 8, pitch: 14, stepOrig: false, milky: 2, Ulen: 0.8, Uwid: 0.7, eff: 0.5 }, feasible: true, reason: '', shape: null, stepLeds: 10 });
  const cg = compareHtml({ cur: { count: 6, pitch: 0, stepOrig: false, milky: 2, Ulen: 0.6, Uwid: 0.7, eff: 0.5 }, best: { count: 5, pitch: 0, stepOrig: false, milky: 2, Ulen: 0.8, Uwid: 0.7, eff: 0.5 }, feasible: true, reason: '', shape: null, stepLeds: 6 });
  ok(cv.includes('<td>LED STEP 현재 10개</td>') && cv.includes('8개 피치 14') && cg.includes('6개 균등') && cg.includes('5개 균등'), '비교표: LED STEP 원래 → 가상 개수·피치(0 = 균등)');
  const cu = compareHtml({ cur: { count: 5, pitch: 0, milky: 3, Ulen: 0.75, Uwid: 0.9, eff: 0.6 }, best: { count: 5, pitch: 0, milky: 3, Ulen: 0.75, Uwid: 0.9, eff: 0.6 }, feasible: false, reason: '현재안보다 나은 설계를 찾지 못함 — 현재안 유지', shape: null, unchanged: true });
  ok(cu.includes('현재안 유지') && !cu.includes('data-ad="apply"') && !/data-ad="apply"[^>]*disabled/.test(c), '비교표: 현재안 유지 → 사유 표시 · 적용 단추 없음'); }
{ // Milky 상한 기본: ① 만 = 9.9 · ② 함께 = max(현재, 5) · 카드 값도 같음
  const a = { milky: { ok: true }, leds: { ok: true }, shape: { ok: false } };
  ok(capDefault({ milky: true }, a, 3) === 5 && capDefault({ milky: true, leds: true }, a, 3) === 5 && capDefault({ milky: true, leds: true }, a, 6) === 5, 'Milky 상한 기본: 언제나 5');
  { // ③ 대상 추천(2026-11-05): 투명 부품 먼저(빛이 처음 맞는 부품 우선), 확산 부품을 고르면 안내
    const pm = (kind) => ({ material: { kind }, faceFinish: {} }), M3 = { parts: [pm('opaque'), pm('milky'), pm('clear'), pm('clear')], light: { kind: 'manual' }, observe: {} };
    const sh = (info) => stageAvailability(M3, { non25: [0, 0, 0, 0], ...info }).shape;
    ok(sh({ path: { shares: { 1: 0.9, 2: 0.5, 3: 0.7 } } }).parts.join() === '3,2,1', '투명 부품 먼저(비중 순), 확산은 뒤');
    ok(sh({ path: { shares: { 1: 0.9, 2: 0.5, 3: 0.7 } }, firstHit: 2 }).parts.join() === '2,3,1', '빛이 처음 맞는 투명 부품이 맨 앞');
    ok(sh({ path: { shares: { 1: 0.9, 2: 0.5, 3: 0.7 } }, firstHit: 1 }).parts.join() === '3,2,1', '처음 맞는 부품이 확산이어도 투명 먼저');
    const av = { milky: { ok: true }, shape: sh({ path: { shares: { 1: 0.9, 2: 0.5 } }, firstHit: 2 }) }, cfg = (part) => tileConfigHtml('shape', { avail: av, sel: { shape: true, shapePart: part }, names: ['a', '확산판', '도광판', 'd'], path: null }).opt ?? tileConfigHtml('shape', { avail: av, sel: { shape: true, shapePart: part }, names: ['a', '확산판', '도광판', 'd'] }).html;
    ok(/형상 효과가 작음/.test(cfg(1)) && /도광판/.test(cfg(1)) && !/형상 효과가 작음/.test(cfg(2)), '확산 부품을 고르면 투명 부품 추천');
    const noClear = stageAvailability({ ...M3, parts: [pm('opaque'), pm('milky')] }, { non25: [0, 0] }).shape;
    ok(noClear.ok && noClear.parts.join() === '1' && noClear.rec == null, '투명 부품이 없으면 확산 부품 그대로'); }
  { const { resultLineHtml, peekText, loweredText } = await import('../src/ui/m3/autodesign-panel.js');
    { const { caseHintText } = await import('../src/ui/m3/autodesign-panel.js');
      const h = (Ulen, Uwid) => ({ finish: { part: 0 }, text: '백색 90%', Ulen, Uwid, base: { Ulen: 0.8, Uwid: 0.45 } });
      ok(/추천: 부품 속성에서 케이스 면을 '백색 90%'.*길이 \+1\.0%p · 폭 \+7\.0%p 정도 오름/.test(caseHintText({ hint: h(0.81, 0.52) })), `케이스 면 추천: ${caseHintText({ hint: h(0.81, 0.52) })}`);
      ok(caseHintText({ hint: h(0.805, 0.455) }) === '' && caseHintText({ hint: h(0.75, 0.6) }) === '' && caseHintText({}) === '', '뚜렷이 나아질 때만(하나라도 크게 나빠지면 안 띄움)');
      ok(/data-ad="casePart" data-v="0"/.test(resultLineHtml({ best: { Ulen: 0.8, Uwid: 0.45 }, cur: {}, targets: {}, stages: { milky: true }, hint: h(0.81, 0.52) })), '추천 줄 = 누르면 케이스 부품으로'); }
    { const { resultStageFlags, factorResult } = await import('../src/ui/m3/autodesign-panel.js');
      const stages = resultStageFlags({ leds: true, height: false, milky: false });
      { const { applyProgress, traceFrac } = await import('../src/ui/m3/opt-dash.js'), T = () => ({ status: 'wait', frac: 0, evals: [] }), S = { tiles: { position: T(), shape: T(), milky: T() } };
        applyProgress(S, 'verify', 0.9, '', 0.95); applyProgress(S, 'verify', 0.33, '', 0.86);
        ok(S.verFrac === 0.9 && S.overall === 0.95, `최적화 진행률: 검증 단계가 내려가지 않음 (${S.verFrac} / ${S.overall})`);
        applyProgress(S, 'leds', 0.8, ''); applyProgress(S, 'height', 0.1, '');
        ok(S.tiles.position.frac === 0.8, `같은 항목 안에서 내려가지 않음 (${S.tiles.position.frac})`);
        S.tiles.position.status = 'done'; applyProgress(S, 'leds', 0.1, '');
        ok(S.tiles.position.frac === 0.1, '끝난 항목을 다시 돌리면 새로 시작');
        ok(traceFrac('current', 0, 1) > 0.9 && traceFrac('verify', 0.5, 1) >= 0.75 && traceFrac('verify', 0.5, 1) < 0.9, '검증 긴 계산 한 번 = 남은 구간의 60%(멈춰 보이지 않게 · 재확인 자리는 남김)');
        { const S2 = { tiles: { position: T(), shape: T(), milky: T() } }; applyProgress(S2, 'milky', 0.97, ''); applyProgress(S2, 'verify', 0, '최종안 정밀 재계산');
          ok(S2.tiles.milky.status === 'done' && S2.tiles.milky.frac === 1, `최종 판정으로 넘어가면 앞 항목 = 완료(97% 로 남지 않음): ${S2.tiles.milky.status} ${S2.tiles.milky.frac}`); } }
      { const q = factorResult({ cur: { count: 10 }, best: { count: 10, wCenter: 3 }, stages }, null, {}, 'position'); ok(q.chip === '바뀜' && /폭 위치 \+3/.test(q.body), `LED 폭 이동도 결과에 표시: ${q.chip} ${q.body}`); }
      ok(stages.position && stages.leds && !stages.milky && factorResult({ cur: { count: 5 }, best: { count: 5 }, stages }, null, {}, 'position').chip === '그대로', '위치 실행은 결과에 별도 기록 · 체크 해제한 Milky 는 실행 안 함');
      const b1 = { best: { Ulen: 0.85, Uwid: 0.4 }, cur: { Ulen: 0.6, Uwid: 0.3 }, targets: { len: 0.8, wid: 0.7 }, feasible: false, stages: { leds: true } };
      ok(/2열/.test(resultLineHtml({ ...b1, oneRow: true })) && !/2열 배치를 시도/.test(resultLineHtml({ ...b1, oneRow: false })) && !/2열 배치를 시도/.test(resultLineHtml({ ...b1, oneRow: true, best: { ...b1.best, Uwid: 0.75 } })) && !/2열 배치를 시도/.test(resultLineHtml({ ...b1, oneRow: true, stages: { milky: true } })), '폭 미달 + 1열만 = 2열 안내'); }
    { const b = { best: { Ulen: 0.7, Uwid: 0.7 }, cur: { Ulen: 0.6, Uwid: 0.6 }, reason: 'x', targets: {} };
      const miss = resultLineHtml({ ...b, feasible: false, stages: { shape: true } }), all = resultLineHtml({ ...b, feasible: false, stages: { shape: true, milky: true, leds: true } }), pass = resultLineHtml({ ...b, feasible: true, stages: { shape: true } }), other = resultLineHtml({ ...b, feasible: false, stages: { milky: true } });
      ok(resultLineHtml({ ...b, feasible: false, unchanged: true, stages: { shape: true }, shapeNote: '후보 11개가 모두 탈락' }).includes('후보 11개가 모두 탈락'), '형상이 안 바뀐 이유가 결과 카드에 보임');
      ok(/형상만으로는 목표 미달/.test(miss) && /위치/.test(miss) && /Milky/.test(miss) && !/형상만으로는/.test(all) && !/형상만으로는/.test(pass) && !/형상만으로는/.test(other), '형상 미달 안내: 형상만 돌렸을 때 다음 항목을 알려 줌'); }
    const pk = { cap: 5, rows: [], best: { milky: 7, Ulen: 0.84, Uwid: 0.66, eff: 0.31 } };
    ok(/Milky 7.*길이 약 84%.*폭 약 66%.*광 효율 약 31%.*대략값/.test(peekText(pk)) && /최적화에는 쓰지 않음/.test(peekText(pk)), `참고 문구: ${peekText(pk)}`);
    ok(/Milky 5 초과.*더 오르지 않음/.test(peekText({ cap: 5, rows: [], best: null })) && peekText(null) === '', '참고 문구: 이득 없음 · 없음(5 초과로 대략 계산해 봤다는 뜻이 보이게, 2026-11-12)');
    ok(/Milky 7\.00? → 5/.test(loweredText({ from: 7, to: 5 }, false)) && /낫지 않음/.test(loweredText({ from: 7, to: 5 }, true)) && loweredText(null) === '' && /현재 값은 대략값/.test(loweredText({ from: 7, to: 5, rough: true }, false)) && !/대략값/.test(loweredText({ from: 7, to: 5 }, false)), `낮춤 문구: ${loweredText({ from: 7, to: 5 }, false)}`);
    const base = { best: { Ulen: 0.7, Uwid: 0.7 }, cur: { Ulen: 0.6, Uwid: 0.6 }, reason: 'x', targets: {} };
    const hBad = resultLineHtml({ ...base, feasible: false, peek: pk }), hOk = resultLineHtml({ ...base, feasible: true, peek: pk }), hLow = resultLineHtml({ ...base, feasible: true, lowered: { from: 7, to: 5 } });
    ok(hBad.includes('참고: Milky 7') && !/data-ad="[a-zA-Z]*"[^>]*>[^<]*Milky 7/.test(hBad) && !hOk.includes('참고: Milky 7') && hLow.includes('Milky 7'), '결과 카드: 미달일 때만 참고 문구 · 적용 버튼 없음 · 낮춤 표시'); }
  const h1 = card({ avail: a, sel: { milky: true }, running: null }), h2 = card({ avail: a, sel: { milky: true, leds: true }, running: null });
  ok(!h1.includes('data-ad="milkyMax"') && !h2.includes('data-ad="milkyMax"'), '카드: Milky 상한 입력칸 없음(상한 = 자동)'); }
// ④ 보완 계산 후보: 현재보다 높은 등급(gradeOf) 중 가장 낮은 것 · 최고 등급이면 null
ok(nextFinish({ kind: 'whiteDiffuse', R: 0.85 })?.R === 0.95 && nextFinish({ kind: 'whiteDiffuse', R: 0.85 }).kind === 'whiteDiffuse' && nextFinish({ kind: 'whiteDiffuse', R: 0.9 })?.R === 0.97
  && nextFinish({ kind: 'metal', R: 0.88 })?.R === 0.95 && nextFinish({ kind: 'whiteDiffuse', R: 0.97 }) === null && nextFinish(null)?.R === 0.85 && nextFinish({ kind: 'gloss' })?.R === 0.85, '④ 보완 안내: 같은 종류 +0.10 이상 최저(백색 85→95, 90→97) · 최고면 없음');
ok(clampCap(12) === 9.9 && clampCap(0.1) === 0.5 && clampCap(3) === 3 && clampCap(0) === null && clampCap(-2) === null && clampCap(NaN) === null, 'Milky 상한: 0.5~9.9 로 자름 · 0/음수/NaN = 기본');
{ const all = { milky: true, leds: true, shape: true }, m = { milky: true };
  ok(overallFrac(m, 'current', 0) === 0 && Math.abs(overallFrac(m, 'milky', 0) - 15 / 85) < 1e-12 && Math.abs(overallFrac(m, 'milky', 0.5) - 32.5 / 85) < 1e-12 && overallFrac(m, 'verify', 1) === 1, '전체 진행률: 켠 단계만 정규화(① 만 = 15+35+35 — 최종 판정은 몇 분 걸려 무게 35, 2026-11-12)');
  ok(Math.abs(overallFrac(all, 'shape', 0) - 50 / 170) < 1e-12 && overallFrac(all, 'shape', 2) <= 1 && overallFrac(m, 'shape', 0.5) === 0, '전체 진행률: 단계 순서(② → ③ → ①)·무게 · 꺼진 단계 = 0');
  const hh = { leds: true, height: true, housing: true, milky: true };
  ok(Math.abs(overallFrac(hh, 'height', 0) - 50 / 160) < 1e-12 && Math.abs(overallFrac(hh, 'housing', 0.5) - 80 / 160) < 1e-12 && Math.abs(overallFrac(hh, 'milky', 0) - 90 / 160) < 1e-12, '전체 진행률: ⑤ 높이·④ 케이스 면(각 20)은 ② 와 ① 사이');
  { const lm = { leds: true, milky: true };   // 기준 Milky 찾기 = 따로 단계(① 위치 35 를 10 + 25 로 나눔 — 다른 단계 % 는 그대로)
    ok(Math.abs(overallFrac(lm, 'ledsRef', 0.5) - 20 / 120) < 1e-12 && Math.abs(overallFrac(lm, 'leds', 0) - 25 / 120) < 1e-12 && Math.abs(overallFrac({ leds: true }, 'leds', 0) - 15 / 85) < 1e-12 && overallFrac({ milky: true }, 'ledsRef', 0.5) === 0,
      `전체 진행률: 기준 Milky 단계(위치+Milky 일 때만) ${overallFrac(lm, 'ledsRef', 0.5)}`); }
  ok(etaText(5000, 0.05) === '' && etaText(10000, 0.5) === '남은 약 10초' && etaText(1000, 1) === '', `남은 시간: 10% 이후만 (${etaText(10000, 0.5)})`); }
{ const s = profileSvg([1, 2, NaN, 4], [3, 3, 3, 3]);
  ok((s.match(/<polyline/g) ?? []).length === 2 && s.includes('<svg') && profileSvg(null, [1]) === '' && profileSvg([], [1]) === '', '길이 프로파일 SVG: 선 2개 · 없으면 생략');
  const base = { parts: [{ material: { kind: 'milky' } }], light: { kind: 'manual' }, observe: { faces: [] } }, a = stageAvailability(base, { non25: [0] });
  const run = card({ avail: a, sel: { milky: true, shape: true, shapePart: 0 }, running: { frac: 0.4, text: 'x' }, names: ['LGP'], milkyPart: 0 });
  ok(/data-ad="milky" checked disabled/.test(run) && /data-ad="shapePart"[^>]*disabled/.test(run) && run.includes('대상: LGP'), '실행 중: 입력 비활성 · ① 대상 부품');
  const nl = card({ avail: a, sel: { milky: true }, running: null, noLine: true });
  ok(nl.includes('관측 라인이 없음'), '라인 없음 → 이유 표시');
  const c = compareHtml({ cur: { count: 5, pitch: 0, milky: 3, Ulen: 0.6, Uwid: 0.7, eff: 0.5, shape: { dt: 0, h: 0.2, R: 3 }, profile: [1, 2] }, best: { count: 5, pitch: 0, milky: 3, Ulen: 0.8, Uwid: 0.7, eff: 0.5, profile: [2, 2] }, feasible: true, reason: '', shape: null });
  ok(c.includes('적용된 형상') && (c.match(/<polyline/g) ?? []).length === 2, '비교표: 적용된 형상 · 프로파일 SVG');
  const t1 = shapeText({ dt: 0.5, h: 0.4, R: 6, e: -0.3, c: 0.2 }), t2 = shapeText({ dt: 0, h: -0.25, R: 4.5, e: 0, c: -0.1 });
  ok(t1 === '두께 +0.50 · 포켓 0.40 R 6.0 · 끝단 두께 −0.30 · 폭 가장자리 두께 +0.20 mm' && t2 === '돌출 0.25 R 4.5 · 폭 가장자리 두께 −0.10 mm' && shapeText({ dt: 0, h: 0, R: 3, e: 0, c: 0 }) === '변경 없음' && shapeText({ dt: 0.1, h: 0, R: 1 }) === '두께 +0.10 mm', `형상 문구: ${t1} / ${t2}`);
  const s1 = screenSummary({ dt: 0.001, e: 0.02, c: 0.06, h: -0.01 }), s2 = screenSummary({ dt: 0, e: 0.002, c: 0 });
  ok(s1 === '효과(선별): 폭 가장자리 두께 +0.06 · 끝단 두께 +0.02 — 두께·국부 형상 효과 없음' && s2 === '효과(선별): 모든 형상 변수 효과 없음' && screenSummary(null) === '', `선별 요약: ${s1} / ${s2}`);
  const cx = compareHtml({ cur: { count: 5, pitch: 0, milky: 3, Ulen: 0.6, Uwid: 0.7, eff: 0.5 }, best: { count: 5, pitch: 0, milky: 3, Ulen: 0.8, Uwid: 0.7, eff: 0.5 }, feasible: true, reason: '', shape: { dt: 0, h: 0, R: 3, e: 0, c: 0.2 }, screen: { dt: 0, e: 0, c: 0.06 } });
  ok(cx.includes('폭 가장자리 두께 +0.20 mm') && cx.includes('효과(선별): 폭 가장자리 두께 +0.06') && !cx.includes('곡률'), '비교표: 형상 칸 · 선별 요약 줄'); }
{ // LED STEP 배치 편집(spec m3-cad-ui §4b): 배지 · 배치 행
  const st = { name: 'a.stp', offset: [0, 0, 0], rot: [0, 0, 0], leds: [1, 2, 3], excluded: [3], pcb: 0, emitters: [{ part: 1 }], virtual: null };
  const node = (s) => treeNodes({ ...M, light: { ...defaultLight(), kind: 'step', step: s } }, { node: null, line: null }).find((n) => n.id === 'leds');
  ok(node(st).label === 'LED ×2' && node(st).badge === '120°', `원래 위치 배지: ${node(st).label} ${node(st).badge}`);
  const a = node({ ...st, virtual: { count: 6, pitch: 15 } }), b = node({ ...st, virtual: { count: 4, pitch: 0 } }), c = node({ ...st, virtual: { positions: [{ s: 1, w: 0, dz: 0 }, { s: 9, w: 0, dz: 0 }, { s: 20, w: 0, dz: 0 }] } });
  ok(a.label === 'LED ×6' && a.badge === '자동 6개 피치 15' && b.badge === '자동 4개 균등' && c.label === 'LED ×3' && c.badge === '배치 편집', `배지: ${a.label} ${a.badge} / ${b.badge} / ${c.label} ${c.badge}`);
  const ln = { length: 100, closed: false, width: 6 };
  const h0 = stepLayoutRowHtml(st, ln, 2), h1 = stepLayoutRowHtml({ ...st, virtual: { positions: [] } }, ln), h2 = stepLayoutRowHtml({ ...st, emitters: [] }, ln), h3 = stepLayoutRowHtml(st, null);
  ok(h0.includes('LED 2개 · STEP 원래 배치') && /data-lp-edit="add">\+ LED 추가/.test(h0) && /data-lp-edit="align"/.test(h0) && !/data-lp-edit="orig"/.test(h0), '배치 행: 원래 = 추가·같은 간격 · 원래대로 없음');
  ok(h1.includes('STEP 에서 편집한 배치') && /data-lp-edit="orig">STEP 원래대로/.test(h1), '배치 행: 편집 → STEP 원래대로');
  ok(/data-lp-edit="add" disabled title="LED 발광면을 먼저 지정하세요"/.test(h2) && /data-lp-edit="add" disabled title="관측면을 먼저/.test(h3), '발광면·라인 없으면 편집 비활성 + 이유');
  ok(/data-lp-edit="add" disabled/.test(stepLayoutRowHtml({ ...st, emitters: [{ part: 3 }] }, ln)) && /data-lp-edit="add" disabled/.test(stepLayoutRowHtml({ ...st, emitters: [{ part: 1, needsCheck: true }] }, ln)), '편집 활성 = 엔진 기준 규칙(제외·확인 필요 발광점만 → 비활성)');
  ok(stepLayoutRowHtml({ ...st, virtual: { count: 6, pitch: 15 } }, ln).includes('기구 최적화 배치 6개 피치 15mm'), '배치 행: 기구 최적화 균등 배치 표시');
  ok(virtCountMax({ length: 1000 }) === 200 && virtCountMax({ length: 1 }) === 1 && virtCountMax(null) === 200, '개수 상한: max(1, min(200, ⌊L/2⌋))');
  const c1 = clampVirtual({ count: 5, pitch: 40 }, { length: 100, closed: false }), c2 = clampVirtual({ count: 999, pitch: 3 }, { length: 100, closed: true }), c3 = clampVirtual({ count: 2.4, pitch: -1 }, null);
  ok(c1.count === 5 && c1.pitch === 25 && c2.count === 50 && c2.pitch === 0 && c3.count === 2 && c3.pitch === 0, `clampVirtual: (n−1)·p ≤ L · 닫힌 = 균등 · 상한 (${JSON.stringify([c1, c2, c3])})`);
  // 실제 배치로 배지·개수: 성공 = 복사 수, 실패(오류) = 원래 개수 + '배치 편집 실패', 라인 대기 = 요청값
  const vs = { ...st, virtual: { count: 6, pitch: 15 } }, nodeL = (S, lay) => treeNodes({ ...M, light: { ...defaultLight(), kind: 'step', step: vs } }, S, lay).find((n) => n.id === 'leds');
  const okL = nodeL({ node: null, line: { kind: 'line', length: 100, width: 5 } }, { virtual: vs.virtual, leds: [3, 4, 5, 6, 7, 8] }), bad = nodeL({ node: null, line: { kind: 'line', length: 100, width: 5 } }, { virtual: null, leds: [1, 2, 3], err: '배치 길이 초과' }), wait = nodeL({ node: null, line: null }, { virtual: null, leds: [1, 2, 3] });
  ok(okL.label === 'LED ×6' && okL.badge === '자동 6개 피치 15' && bad.label === 'LED ×2' && bad.badge === '배치 편집 실패' && wait.badge === '자동 6개 피치 15', `배지: ${okL.badge} / ${bad.label} ${bad.badge} / ${wait.badge}`); }
{ // ① 현재안 재사용: 같은 장면(G)에서 수렴('done', relNoise ≤ 목표)한 점진 결과만
  const G = { ns: 1 }, stats = { Ulen: 0.8, Uwid: 0.7, relNoise: 0.015 }, snap = { state: 'done', sceneKey: 's3', G, stats, photometry: { eff: 0.6 }, targetNoise: 0.02 };
  const r = reusableCurrent(snap, G);
  ok(r && r.stats === stats && r.eff === 0.6, '수렴한 결과 → { stats, eff }');
  ok(reusableCurrent({ ...snap, state: 'paused' }, G) === null && reusableCurrent({ ...snap, stats: { ...stats, relNoise: 0.03 } }, G) === null && reusableCurrent(snap, { ns: 1 }) === null && reusableCurrent({ ...snap, sceneKey: null }, G) === null && reusableCurrent({ ...snap, photometry: null }, G) === null, '미수렴·다른 장면·결과 없음 → null'); }
{ // 속성 머리: 실제 메쉬 외곽·부피(크기·위치·형상 반영) + 형상 변경 표시
  const box = (a, b, c) => ({ positions: Float32Array.from([0,0,0, a,0,0, a,b,0, 0,b,0, 0,0,c, a,0,c, a,b,c, 0,b,c]), triangles: Uint32Array.from([0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7]) });
  const mi = meshInfo(box(40, 10, 2));
  ok(mi.size.join() === '40,10,2' && Math.abs(mi.volume - 800) < 1e-6, `meshInfo: ${mi.size} · ${mi.volume}`);
  const p = { name: 'a', size: [20, 5, 1], volume: 100, xform: { scale: [2, 2, 2] } };
  ok(partHeaderText(p, mi) === '40.0×10.0×2.0mm · 800 mm³', `머리: ${partHeaderText(p, mi)}`);
  ok(partHeaderText({ ...p, shapeMod: { dt: 0.2 } }, mi) === '40.0×10.0×2.0mm · 800 mm³ · 형상 변경됨', '형상 변경됨');
  ok(partHeaderText(p, null) === '40.0×10.0×2.0mm · 800 mm³', '메쉬 없음 → 원본 × 배율'); }
{ // ④ 케이스 면 · ⑤ LED 높이 — 가능 여부 · 기본 대상 · 비교표 문구 · dz/면 처리 적용
  const parts = [{ material: { kind: 'milky' } }, { material: { kind: 'opaque' } }, { material: { kind: 'opaque' } }];
  const man = (pcb) => stageAvailability({ parts, light: { kind: 'manual', manual: { pcb } }, observe: { faces: [{ part: 0, face: 1 }] } }, { non25: [0, 1, 1] });
  const a = man({ kind: 'depth', depth: 5 }), b = man({ kind: 'face', part: 1, face: 2 });
  ok(a.height.ok && a.housing.ok && a.housing.parts.join() === '1,2' && !b.height.ok && b.height.why === 'PCB 가 기구 면에 붙어 있음 — 높이는 기구 면으로 정해짐', '⑤ 직접 배치: 깊이 = 가능 · 기구 면 PCB = 불가 이유 · ④ 불투명 부품 목록');
  const stepA = (emitters) => stageAvailability({ parts: [{ material: { kind: 'milky' } }], light: { kind: 'step', step: { leds: [1], emitters } }, observe: { faces: [] } }, { non25: [0] });
  const c = stepA([]), d = stepA([{ part: 1 }]);
  ok(!c.housing.ok && /불투명/.test(c.housing.why) && !c.height.ok && /발광면/.test(c.height.why) && d.height.ok, '④ 불투명 없음 → 불가 · ⑤ LED STEP 발광점 없음 → 불가, 있으면 가능');
  const h = card({ avail: a, sel: { height: true, housing: true, housingPart: 2 }, running: null, names: ['LGP', '케이스', '덮개'] });
  ok(h.includes('data-ad="height" checked') && h.includes('data-ad="housing" checked') && /<option value="2" selected>덮개/.test(h) && tileConfigHtml('position', { avail: a, sel: { height: true } }).html.includes('data-ad="position" checked'), '카드: ⑤ 켜짐 = ② 기구 위치 사용 · 실행 가능');
  const M = { parts, observe: { faces: [{ part: 0, face: 1 }] } };
  const box0 = [0, 0, 0, 10, 10, 2], small = [-1, -1, -1, 11, 11, 3], big = [-5, -5, -5, 15, 15, 5], far = [100, 0, 0, 200, 100, 50];
  ok(defaultHousingPart(M, [box0, small, big]) === 2 && defaultHousingPart(M, [box0, small, far]) === 1 && defaultHousingPart(M, [box0, far, [0, 0, 0, 1, 1, 1]]) === 1
    && defaultHousingPart({ ...M, parts: [parts[0]] }, [box0]) === -1 && defaultHousingPart({ ...M, observe: { faces: [] } }, [box0, small, big]) === 2, '④ 기본 대상: 관측 부품을 감싸는 불투명 중 최대 → 없으면 불투명 최대 → 없으면 −1');
  ok(finishText({ kind: 'whiteDiffuse', R: 0.85 }) === '백색 85%' && finishText({ kind: 'metal', R: 0.88 }) === '경면 88%' && finishText({ kind: 'gloss' }) === '광택' && finishText(null) === '–', '면 처리 문구');
  const cur = { count: 5, pitch: 0, milky: 3, Ulen: 0.6, Uwid: 0.7, eff: 0.5 }, best = { ...cur, Ulen: 0.8 };
  const ch = compareHtml({ cur, best, feasible: true, reason: '', shape: null, finish: { cur: { kind: 'whiteDiffuse', R: 0.85 }, best: { kind: 'whiteDiffuse', R: 0.95 } }, height: { dz: 1.2, gap: 6.5 } });
  const c0 = compareHtml({ cur, best, feasible: true, reason: '', shape: null, height: { dz: -0.5, gap: NaN } }), c1 = compareHtml({ cur, best, feasible: true, reason: '', shape: null, height: { dz: 0, gap: 6.5 } });
  ok(ch.includes('<tr><th>케이스 면</th><td>백색 85%</td><td class="chg">백색 95%</td></tr>') && ch.includes('<tr><th>LED 높이</th><td>현재 (커버까지 6.5 mm)</td><td class="chg">+1.20 mm (커버까지 5.3 mm)</td></tr>')
    && c0.includes('<td class="chg">−0.50 mm</td>') && c1.includes('<th>LED 높이</th><td>현재 (커버까지 6.5 mm)</td><td class="">현재 (커버까지 6.5 mm)</td>') && !c1.includes('케이스 면') && !compareHtml({ cur, best, feasible: true, reason: '', shape: null }).includes('LED 높이'), `비교표: 케이스 면 · LED 높이 행`);
  const S = { light: { kind: 'step', step: { offset: [1, 0, 0], rot: [0, 0, 0], emitters: [{ part: 1, pos: [0, 0, 1], axis: [0, 0, 1] }] } } };
  applyDz(S, 1.5, [0, 0, 1]);
  const D = { light: { kind: 'manual', manual: { pcb: { kind: 'depth', depth: 5 } } } }, Fc = { light: { kind: 'manual', manual: { pcb: { kind: 'face', part: 1, face: 2 } } } };
  applyDz(D, 1.5, [0, 0, 1]); applyDz(Fc, 1.5, [0, 0, 1]);
  ok(S.light.step.offset.join() === '1,0,1.5' && S.light.step.emitters[0].pos.join() === '0,0,2.5' && S.light.step.emitters[0].axis.join() === '0,0,1' && D.light.manual.pcb.depth === 3.5 && !('depth' in Fc.light.manual.pcb), 'dz 적용: STEP offset·발광점 함께 이동 · 깊이 −= dz · 기구 면 PCB 그대로');
  const P = { parts: [{ finish: { kind: 'gloss' }, faceFinish: {} }, { finish: { kind: 'whiteDiffuse', R: 0.85 }, faceFinish: { 3: { kind: 'black', R: 0.05 } } }] };
  applyFinish(P, { part: 1, kind: 'metal', R: 0.95 });
  ok(P.parts[1].finish.kind === 'metal' && P.parts[1].finish.R === 0.95 && P.parts[1].faceFinish[3].kind === 'black' && P.parts[0].finish.kind === 'gloss', '면 처리 적용: 기본 면만 교체 · 면별 덮어쓰기 유지'); }
{ // LED 열 배치(spec P4 §2.2b): 열 수·열 간격 입력 · 배지 · 비교표 · 열 간격 후보
  const ln = { length: 116, closed: false, width: 16 };
  const r1 = ledRowsHtml({ rows: 1, rowGap: 0 }, ln, 'man'), r2 = ledRowsHtml({ rows: 2, rowGap: 5 }, ln, 'man'), rv = ledRowsHtml({ rows: 2, rowGap: 4.3 }, null, 'virt');
  ok(/data-lp-man="rows"/.test(r1) && /<option value="1" selected>1열/.test(r1) && !/data-lp-man="rowGap"/.test(r1), '열 입력: 1열 = 열 간격 칸 없음');
  ok(/<option value="2" selected>2열/.test(r2) && /max="7.5"[^>]*value="5" data-lp-man="rowGap"/.test(r2) && r2.includes('최대 ±7.5 mm'), `열 입력: 2열 = 열 간격 ±δ · 최대 = 반폭 − 0.5 (${r2.match(/<span class="mut">[^<]*/)?.[0]})`);
  ok(/value="4.3" data-lp-virt="rowGap"/.test(rv) && !/max=/.test(rv), '열 입력: 가상 배치(data-lp-virt) · 라인 없으면 상한 없음');
  const st = { name: 'a.stp', offset: [0, 0, 0], rot: [0, 0, 0], leds: [1, 2, 3], excluded: [], pcb: 0, emitters: [{ part: 1 }], virtual: { count: 10, pitch: 0, rows: 2, rowGap: 5 } };
  const cv = clampVirtual({ count: 10, pitch: 0, rows: 2, rowGap: 20 }, ln), cd = clampVirtual({ count: 10, pitch: 0, rows: 2, rowGap: 0 }, ln), c1 = clampVirtual({ count: 10, pitch: 0, rows: 1, rowGap: 5 }, ln);
  ok(cv.rows === 2 && cv.rowGap === 7.5 && cd.rowGap === 4.3 && c1.rows === 1 && c1.rowGap === 0, `clampVirtual 열: 상한 ${cv.rowGap} · 0 → 기본 ${cd.rowGap}(0.27·W) · 1열 = 0`);
  ok(defaultRowGap(ln) === 4.3 && JSON.stringify(rowGapOptions(ln)) === '[3.2,4.3,5.2]' && JSON.stringify(rowGapOptions({ width: 2 })) === '[0.4,0.5]' && rowGapOptions({ width: 0.5 }).length === 0, `열 간격 후보 0.2/0.27/0.33·W (${rowGapOptions(ln)}) · 상한으로 자르고 중복 제거`);
  const man = treeNodes({ ...M, light: { ...defaultLight(), kind: 'manual', manual: { ...defaultLight().manual, count: 10, rows: 2, rowGap: 5 } } }, { node: null, line: null }).find((n) => n.id === 'leds');
  const vt = treeNodes({ ...M, light: { ...defaultLight(), kind: 'step', step: st } }, { node: null, line: null }).find((n) => n.id === 'leds');
  ok(man.label === 'LED ×20' && man.badge === '2열 × 10개 균등' && vt.label === 'LED ×20' && vt.badge === '자동 2열 × 10개 균등', `배지: ${man.label} ${man.badge} / ${vt.label} ${vt.badge}`);
  const e = { milky: 2, Ulen: 0.8, Uwid: 0.7, eff: 0.5 };
  const cm = compareHtml({ cur: { ...e, count: 10, pitch: 0, rows: 1 }, best: { ...e, count: 10, pitch: 0, rows: 2, rowGap: 5 }, feasible: true, reason: '', shape: null });
  const cs = compareHtml({ cur: { ...e, count: 10, pitch: 0, stepOrig: true }, best: { ...e, count: 10, pitch: 0, stepOrig: false, rows: 2, rowGap: 5 }, feasible: true, reason: '', shape: null, stepLeds: 10 });
  ok(cm.includes('<td>10개 균등</td>') && cm.includes('2열 × 10개 균등 (열 간격 ±5.0 mm)') && cs.includes('LED STEP 현재 10개') && cs.includes('<td class="chg">2열 × 10개 균등 (열 간격 ±5.0 mm)'), '비교표: 2열 × n개 (열 간격 ±δ) · STEP 현재 → 2열'); }
{ // ④ 소재별 반사율 상한(spec P4 §2.3d) — 문구·안내 후보·적용·카드·부품 편집기·소재표
  const C = DEFAULT_FINISH_CATALOG, W = (R) => ({ kind: 'whiteDiffuse', R });
  ok(finishText({ ...W(0.97), coating: 'coat-white' }) === '백색 97% (특수: 고반사 도장)' && finishText({ kind: 'metal', R: 0.95, coating: 'coat-metal' }) === '경면 95% (특수: 금속 증착)' && finishText({ ...W(0.9), coating: 'zz' }) === '백색 90%', '면 처리 문구: 특수 처리 표시');
  const e = { count: 5, pitch: 0, milky: 3, Ulen: 0.6, Uwid: 0.7, eff: 0.5 };
  const cc = compareHtml({ cur: e, best: e, feasible: true, reason: '', shape: null, finish: { cur: W(0.85), best: { ...W(0.97), coating: 'coat-white' } } });
  ok(cc.includes('<tr><th>케이스 면</th><td>백색 85%</td><td class="chg">백색 97% (특수: 고반사 도장)</td></tr>'), '비교표: 백색 85% → 백색 97% (특수: 고반사 도장)');
  const pool = (allowSpecial) => finishCandidatesFor({ catalog: C, materialId: 'pc-white', current: W(0.85), allowSpecial }).filter((f) => !f.current);
  const n1 = nextFinish(W(0.85), pool(false)), n2 = nextFinish(W(0.9), pool(false)), n3 = nextFinish(W(0.85), pool(true));
  ok(n1?.R === 0.9 && n2 === null && n3?.R === 0.97 && n3.coating === 'coat-white', `① 보완 안내: 소재 상한 안(85→90, 90→없음) · 특수 허용 → 97 특수: ${JSON.stringify([n1, n2, n3])}`);
  const P = { parts: [{ finish: W(0.85), faceFinish: {}, reflMaterial: 'pc-white' }] };
  applyFinish(P, { part: 0, ...W(0.97), coating: 'coat-white' });
  const c1 = P.parts[0].coating; applyFinish(P, { part: 0, ...W(0.9) });
  ok(c1 === 'coat-white' && !('coating' in P.parts[0]) && P.parts[0].finish.R === 0.9 && !('coating' in P.parts[0].finish) && P.parts[0].reflMaterial === 'pc-white', '적용: 특수 처리 → coating 저장 · 일반 등급 → 해제');
  const a = { milky: { ok: false, why: 'x' }, leds: { ok: false, why: 'x' }, shape: { ok: false, why: 'x' }, height: { ok: false, why: 'x' }, housing: { ok: true, parts: [1] } };
  const h1 = card({ avail: a, sel: { housing: true, housingPart: 1, housingSpecial: true }, running: null, names: ['LGP', '케이스'], housingMat: { name: '백색 PC(일반 착색)', max: 0.9 } });
  const h0 = card({ avail: a, sel: { housing: true, housingPart: 1 }, running: null, names: ['LGP', '케이스'], housingMat: null });
  ok(h1.includes('백색 PC(일반 착색) · 최대 90%') && /data-ad="housingSpecial" checked/.test(h1) && h1.includes('특수 표면처리 허용'), '카드 ④: 소재·상한 · 특수 허용 체크');
  ok(h0.includes('소재 미지정') && /data-ad="housingSpecial"(?! checked)/.test(h0) && card({ avail: a, sel: { housing: false, housingPart: 1 }, running: null, names: ['LGP', '케이스'] }).includes('housingSpecial'), '카드 ④: 소재 미지정 안내 · 체크 전에도 대상·특수 설정(③ 형상과 같게)');
  { const { materialGroups } = await import('../src/engine/mech3d/material-pick.js');
    const G = materialGroups({ milky: [{ id: 'm1', name: 'DQ5122', n: 1.586 }], clear: [{ id: 'u:A', name: 'A', n: 1.58, T: 0.9, tRef: 2 }], refl: C });
    const r = materialPickHtml({ material: { kind: 'opaque' }, reflMaterial: 'pc-white' }, G), r0 = materialPickHtml({ material: { kind: 'milky', dbId: 'm1' } }, G);
    ok(/<option value="opaque:pc-white" selected>/.test(r) && !r.includes('coat-') && r.includes('<optgroup label="투명">') && r.includes('value="clear:u:A"') && r.includes('value="wt"') && /value="milky:m1" selected/.test(r0), '소재 고르기: DB 전체 · 종류별 묶음 · 지금 소재 선택');
    ok(materialPickHtml({ material: { kind: 'opaque' }, reflMaterial: 'gone' }, G).includes('<option value="" selected>없는 소재'), '소재 고르기: 지워진 DB 항목 → 없는 소재'); }
  const q = setPartMaterial({ ...defaultPart(0, 'c', 1), reflMaterial: 'pc-white', coating: 'coat-white' }, 'opaque');
  ok(!('reflMaterial' in q) && !('coating' in q), '소재 종류 바꾸면 반사 소재·특수 표시 해제');
  const t = reflDbHtml(catalogOf(null)), U = { ...catalogOf(null)[1], id: 'u1', name: '사내 PC', origin: 'user', status: 'measured', nSamples: 3 }, t1 = reflDbHtml([U]);
  ok(t.includes('반사 소재 DB') && !t.includes('data-lp-cat=') && t.includes('data-lp-dbcopy="pc-white"') && !t.includes('data-lp-dbdel') && t.includes('예시') && t.includes('85') && t.includes('data-lp-dbexp') && /type="file"[^>]*data-lp-dbimp|data-lp-dbimp[^>]*type="file"/.test(t), '소재 DB: 공용 = 읽기 전용 + [복사] · 내보내기·불러오기');
  ok(/data-lp-catname="u1"[^>]*value="사내 PC"|value="사내 PC"[^>]*data-lp-catname="u1"/.test(t1) && /data-lp-cat="u1" data-lp-catk="R"[^>]*value="85"|value="85"[^>]*data-lp-cat="u1" data-lp-catk="R"/.test(t1) && t1.includes('data-lp-catk="max"') && t1.includes('data-lp-dbadd="u1"') && t1.includes('data-lp-dbdel="u1"') && t1.includes('실측 3회') && !t1.includes('data-lp-addv'), '소재 DB: 사용자 = 이름·R·상한 편집 · 측정값 추가 · 삭제');
  const t2 = reflDbHtml([U], { addFor: 'u1' });
  ok(t2.includes('data-lp-addv') && t2.includes('data-lp-addok="u1"') && t2.includes('<option>SCI 8°/d</option>') && t2.includes('data-lp-addn'), '소재 DB: 측정값 추가 인라인(값 %·조건·메모)');
  const sp = reflDbHtml([{ ...catalogOf(null).find((e) => e.special), id: 'u2', origin: 'user' }]);
  ok(!/data-lp-cat="u2" data-lp-catk="R"/.test(sp) && /data-lp-cat="u2" data-lp-catk="max"/.test(sp) && sp.includes('특수'), '소재 DB: 특수 처리 = 상한만');
  const f0 = reflAddFormHtml(), fm = reflAddFormHtml('이름을 입력하세요');
  ok(fm.includes('data-m3-raok') && fm.includes('이름을 입력하세요') && ['name', 'kind', 'values', 'cond', 'note', 'max'].every((k) => f0.includes(`data-m3-ra="${k}"`)) && f0.includes('<option value="metal">경면</option>') && f0.includes('<option>0°/45°</option>'), '추가 양식: 이름·종류·값 %·조건·메모·상한');
  ok(finishText({ ...W(0.96), coating: 'u-coat' }, [...C, { id: 'u-coat', name: '사내 반사시트', kind: 'whiteDiffuse', R: null, max: 0.96, special: true }]) === '백색 96% (특수: 사내 반사시트)' && finishText({ ...W(0.97), coating: 'coat-white' }, C) === '백색 97% (특수: 고반사 도장)', '면 처리 문구: 사용자 특수 항목'); }

{ // 부품 속성 정리: 제목 · 소재 종류 분할 단추 · 간격 한 줄 · 접는 구역(다시 그려도 열림 유지)
  ok(partTitleText({ name: '부품 2', size: [116, 16, 2] }, null) === '부품 2 · 116×16×2 mm' && partTitleText({ name: 'a', size: [20, 5, 1], xform: { scale: [2, 2, 2] } }, { size: [40.04, 10, 2.25] }) === 'a · 40×10×2.3 mm', '제목: 이름 · 크기 mm(부피 없음)');
  const ld = ledDistHtml({ rows: [], leds: [], ledMin: { led: 2, dist: 3.46 }, ledAxial: { led: 2, dist: 3.1 } });
  ok(ld.includes('LED까지 <b class="led">3.5 mm</b>') && ld.includes('(LED 3)') && ld.includes('축 방향 <b>3.1 mm</b>') && ledDistHtml(null) === '' && ledDistHtml({ rows: [], leds: [], ledMin: null }) === '', 'LED 까지 거리 한 줄 · 없으면 표시 안 함');
  ok(xfSummaryText({ size: [20, 10, 2], xform: { offset: [2, 0, 0], scale: [1, 1, 3] }, shapeMod: {} }, { center0: [10, 5, 1], size0: [20, 10, 2] }) === '위치 12, 5, 1 · 크기 20×10×6 · 형상 변경됨' && xfSummaryText({ size: [20, 10, 2] }, null) === '크기 20×10×2', '크기·위치 요약');
  resetSections();
  const secs = {}; let html = '';
  const el = { ownerDocument: null, querySelector: () => null, set innerHTML(v) { html = v; }, get innerHTML() { return html; },
    querySelectorAll: (q) => (q === 'details[data-m3-sec]' ? [...html.matchAll(/data-m3-sec="(\w+)"/g)].map(([, id]) => (secs[id] = { dataset: { m3Sec: id }, open: false, addEventListener(k, fn) { this[k] = fn; } })) : []) };
  const P = { ...M, parts: [M.parts[0], { ...M.parts[1], reflMaterial: 'pc-white', finish: { kind: 'whiteDiffuse', R: 0.85 } }] };
  const clr = { rows: [{ name: '커버', gap: 0, depth: 0 }], leds: [], ledMin: { led: 0, dist: 1.5 }, ledAxial: null };
  const sel = { part: 1, face: null, clearance: clr, xfInfo: { center0: [0, 0, 0], size0: [10, 10, 2], lim: null }, catalog: catalogOf(null), meshInfo: null };
  renderPartProps(el, P, sel, [], {});
  // 기본 탭(처음): 소재 종류 · 반사 소재 · 반사율(최대) · 위치·크기 숫자만 · 경고 한 줄 — 접는 구역·가능 범위·비율 고정 없음
  ok(/data-m3-tab="basic" aria-selected="true"/.test(html) && /value="opaque:pc-white" selected/.test(html) && html.includes('확산 반사 85% (최대 90%)') && !html.includes('data-m3-finishr') && !html.includes('data-m3-xf="c0"') && html.includes('표면 상태') && html.includes('표면 종류는 반사 소재가 정함')
    && !html.includes('data-m3-sec=') && !html.includes('data-m3-xflock') && !html.includes('data-m3-refladd') && !html.includes('data-m3-kind') && !html.includes('가장 가까운') && !html.includes('LED까지'), '기본 탭(소재·표면 상태만): 소재 이름 고르기 · 물성 한 줄(읽기 전용) · 위치·크기 · LED 까지 거리 + 경고');
  renderPartProps(el, P, { ...sel, admin: true }, [], {});
  ok(html.includes('data-m3-finishr="part"') && html.includes('상한 90%') && html.includes('관리자'), '관리자 모드: 숫자 물성 칸(반사율·상한)');
  { // Milky·투명 표면 = Fresnel, 불투명은 목록에 없음. 면 하나를 고른 경우도 같음
    setPartTab('detail');
    for (const material of [{ kind: 'milky', milky: 5, resin: 'PC', dbId: '' }, { kind: 'clear', resin: 'PC', T: 0.89, tRef: 2 }]) {
      const Q = { ...M, parts: [M.parts[0], { ...M.parts[1], material, reflMaterial: undefined, finish: { kind: 'gloss' }, faceFinish: {} }] };
      renderPartProps(el, Q, { ...sel, face: 0 }, [], {});
      ok((html.match(/>Fresnel \(굴절률\)</g) ?? []).length === 2 && !html.includes('>광택<') && html.includes('굴절률로 투과·반사 비율이 정해짐'), `${material.kind}: 부품·면 목록 모두 Fresnel + 정의 안내`);
    }
    renderPartProps(el, { ...M, parts: [M.parts[0], { ...M.parts[1], material: { kind: 'opaque' }, reflMaterial: undefined, finish: { kind: 'gloss' }, faceFinish: {} }] }, { ...sel, face: 0 }, [], {});
    ok(!html.includes('Fresnel') && html.includes('>광택<'), '불투명 부품 = Fresnel 없음');
    setPartTab('basic');
  }
  { // 반사율 조정 확산 반사면 — 관리자가 아니어도 기본 탭에 반사율 칸 1개, 관리자 모드에서도 중복 없음
    const Q = { ...M, parts: [M.parts[0], { ...M.parts[1], reflMaterial: 'diffuse-adj', finish: { kind: 'whiteDiffuse', R: 0.725 } }] }, n = () => (html.match(/data-m3-finishr="part"/g) ?? []).length;
    renderPartProps(el, Q, sel, [], {});
    ok(n() === 1 && /value="opaque:diffuse-adj" selected/.test(html) && html.includes('value="72.5"') && html.includes('max="99"') && html.includes('step="0.1"'), '조정 항목: 기본 탭에 반사율 칸(0~99%, 0.1 단위)');
    renderPartProps(el, Q, { ...sel, admin: true }, [], {});
    ok(n() === 1, '조정 항목: 관리자 모드에서도 반사율 칸 1개'); }
  setPartTab('detail'); renderPartProps(el, P, sel, [], {});
  ok(html.includes('data-m3-xf="c0"') && html.includes('data-m3-xf="z2"') && html.includes('data-m3-xflock') && html.includes('LED까지 <b class="led">1.5 mm</b>') && !html.includes('data-m3-sec="xf"') && !html.includes('data-m3-sec="finish"') && html.includes('data-m3-sec="contact"') && !html.includes('data-m3-finish'), '상세 탭: 위치·크기 · 접촉면(표면 상태는 기본 탭)');
  ok(html.includes('>부품 2 · ') || html.includes(`>${P.parts[1].name} · `), '제목 = 이름 · 크기');
  ok(!html.includes('data-m3-pick') && !html.includes('data-m3-refladd') && !html.includes('data-m3-sec="refldb"') && !html.includes('data-m3-finish="part"'), '상세 탭: 소재 고르기·DB 구역 없음 · 종류 선택 숨김');
  secs.contact.open = true; secs.contact.toggle();
  renderPartProps(el, P, sel, [], {});
  ok(/data-m3-sec="contact" open/.test(html) && sectionOpen('contact'), '열린 구역: 다시 그려도 열림 유지');
  secs.contact.open = false; secs.contact.toggle(); renderPartProps(el, P, sel, [], {});
  ok(!/data-m3-sec="contact" open/.test(html), '닫으면 닫힘 유지');
  renderPartProps(el, P, { ...sel, face: 3 }, [], {});
  ok(/data-m3-tab="basic" aria-selected="true"/.test(html) && html.includes('선택한 면 #3') && html.includes('data-m3-finish="face"'), '면 선택 → 기본 탭의 표면 상태');
  const P0 = { ...P, parts: [P.parts[0], { ...P.parts[1], reflMaterial: undefined }] }; renderPartProps(el, P0, sel, [], {});
  ok(html.includes('data-m3-finish="part"'), '반사 소재 미지정 → 표면 상태에 종류 선택');
  setPartTab('detail');
  renderPartProps(el, P, { ...sel, part: 0 }, [], {});
  ok(!html.includes('data-m3-mat="dbId"') && !html.includes('data-m3-fitdlg') && !html.includes('data-m3-mat="milky"'), 'Milky 상세: 소재 고르기 없음(기본 탭으로)');
  setPartTab('basic'); renderPartProps(el, P, { ...sel, part: 0 }, [], {});
  ok(html.includes('data-m3-mat="milky"') && html.includes('확산 정도') && /value="milky" selected/.test(html) && !html.includes('data-m3-mat="dbId"') && !html.includes('data-m3-fitdlg') && !html.includes('data-m3-mat="resin"'), 'Milky 기본: 소재 이름 + 확산 정도(Milky 값)만');
  renderPartProps(el, P, { ...sel, part: 0, admin: true }, [], {});
  ok(html.includes('data-m3-mat="resin"'), 'Milky 관리자: 수지 칸');
  { const Q = { ...P, parts: [{ ...P.parts[0], material: { kind: 'clear', resin: 'PMMA', T: 0.92, tRef: 2 } }, P.parts[1]] };
    renderPartProps(el, Q, { ...sel, part: 0, clearList: [{ id: 'u:사내 PC', name: '사내 PC', base: 'PC', n: 1.585, T: 0.88, tRef: 3, origin: 'user' }] }, [], {});
    ok(/value="clear:PMMA" selected/.test(html) && html.includes('사내 PC (측정)') && html.includes('굴절률 1.49 · 투과율 92%') && !html.includes('data-m3-clearadd') && !html.includes('data-m3-mat="T"'), '투명 기본: 굴절률별 기본·측정 소재 이름 · 물성 한 줄');
    const Q2 = { ...Q, parts: [{ ...Q.parts[0], material: { kind: 'clear', resin: 'PC', n: 1.585, matId: 'u:사내 PC', T: 0.88, tRef: 3 } }, P.parts[1]] };
    renderPartProps(el, Q2, { ...sel, part: 0, clearList: [{ id: 'u:사내 PC', name: '사내 PC', base: 'PC', n: 1.585, T: 0.88, tRef: 3, origin: 'user' }] }, [], {});
    ok(/value="clear:u:사내 PC" selected/.test(html) && html.includes('굴절률 1.585 · 투과율 88% (3 mm) · 측정값'), '투명: 측정 소재 선택 · 측정 굴절률 표시'); }
  resetSections(); }
{ // 좌·우 창 폭 조절(splitter): 기본 260/430 · 비율 → px · 최소 폭 · 3D 최소 280px
  const { splitPx } = await import('../src/ui/m3/splitter.js');
  const d = splitPx(1400, null), a = splitPx(1000, { l: 0.3, r: 0.4 }), b = splitPx(1000, { l: 0.05, r: 0.05 }), c = splitPx(900, { l: 0.5, r: 0.5 });
  ok(d.l === 260 && d.r === 430 && a.l === 300 && a.r === 400 && b.l === 180 && b.r === 260 && 900 - c.l - c.r >= 280 - 1, `splitPx: ${JSON.stringify([d, a, b, c])}`);
}
{ // 1D 프로파일 세로 범위: 최저·목표보다 5% 아래를 10% 단위로 내림
  const { plotRange } = await import('../src/ui/m3/results-panel.js');
  const a = plotRange([{ ys: [1, 0.79, NaN, 0.9] }], 0.8), b = plotRange([{ ys: [1, 0.3] }], 0.8), c = plotRange([{ ys: [1, 0.95] }], null);
  ok(a.y0 === 70 && a.y1 === 102 && b.y0 === 20 && c.y0 === 90, `plotRange: ${[a.y0, b.y0, c.y0]}`); }
{ // 최적화·시뮬레이션 대시보드(순수)
  const { tileOf, evalSparkSvg, simPct, STAGES } = await import('../src/ui/m3/opt-dash.js');
  ok(STAGES.length === 3 && STAGES.map(([k]) => k).join() === 'position,shape,milky' && !/케이스/.test(JSON.stringify(STAGES)) && tileOf('milky') === 'milky' && tileOf('leds') === 'position' && tileOf('height') === 'position' && tileOf('shape') === 'shape' && tileOf('verify') === null && tileOf('housing') === 'housing', `4 타일(Milky · 기구 위치 · 기구 형상 · 케이스 면) · 단계 → 타일`);
  const sv = evalSparkSvg([{ label: 'a', Ulen: 0.7, Uwid: 0.6 }, { label: 'b', ok: false, why: '간섭' }, { label: 'c', Ulen: 0.82, Uwid: 0.81 }], 0.8, 0.8, 2);
  ok(sv.includes('od-l1') && sv.includes('od-d1') && sv.includes('od-best') && sv.includes('od-tg') && sv.includes('×'), '후보 그래프: 점·최고·목표·탈락(×)');
  ok(evalSparkSvg([], 0.8, 0.8).includes('후보 결과 없음'), '후보 없음');
  ok(simPct(0.04, 0.02) === 25 && simPct(0.02, 0.02) === 100 && simPct(0.01, 0.02) === 100 && simPct(NaN, 0.02) === 0, `진행률 = (목표/오차)² (${simPct(0.04, 0.02)})`); }
{ // 아래 칸 높이: 최소 120 · 3D·결과 칸 최소 240(+명령·상태줄 90) 남김
  const { clampDock } = await import('../src/ui/m3/splitter.js');
  ok(clampDock(250, 900) === 250 && clampDock(50, 900) === 120 && clampDock(800, 900) === 570 && clampDock(300, 400) === 120, `clampDock: ${[clampDock(250, 900), clampDock(50, 900), clampDock(800, 900), clampDock(300, 400)]}`); }
{ // 광경로 순위(순수): 기구 부품만 · 같은 경로 합침 · 비중 순
  const { topPaths, pathText } = await import('../src/ui/m3/opt-dash.js');
  const t = topPaths({ ':2>1': 50, 'R:2>1': 25, ':2>1>5': 10, 'R:2>1>2>1': 15 }, 3);
  ok(t.length === 3 && t[0].share === 0.6 && t[0].parts.join() === '2,1' && !t[0].refl && t[1].refl && pathText(t[0], ['a', 'b', 'c']) === 'LED → c → b → 관측면', `topPaths: ${JSON.stringify(t.map((x) => [x.parts.join('>'), x.refl, x.share]))}`); }
{ // 광경로 위 부품 — 기구 최적화 ③ 형상·② 케이스 대상 목록
  const { stageAvailability, tileConfigHtml, PATH_MIN } = await import('../src/ui/m3/autodesign-panel.js');
  const K = (kind, x = {}) => ({ material: { kind }, ...x }), M = { parts: [K('milky'), K('clear'), K('clear'), K('opaque'), K('opaque'), K('opaque', { untrace: true })], light: { kind: 'manual' }, observe: { faces: [] } };
  const non25 = [0, 0, 0.5, 1, 1, 1], all = stageAvailability(M, { non25 });
  ok(all.shape.parts.join() === '1,0' && all.housing.parts.join() === '3,4', '검출 전: 쓸 수 있는 부품 전체(추적 제외는 뺌)');
  const path = { shares: { 0: 0.4, 1: 1, 2: 0.9, 3: PATH_MIN / 2, 4: 0.3 } }, a = stageAvailability(M, { non25, path });
  ok(a.shape.parts.join() === '1,0' && a.shape.skip.join() === '2' && a.housing.parts.join() === '4', '검출 뒤: 광경로 위만 · 빛 많은 순 · 2.5D 아닌 부품은 skip · 1% 미만 뺌');
  const nonePath = { shares: {} }, none = stageAvailability(M, { non25, path: nonePath });
  ok(none.shape.ok && none.shape.fallback && none.shape.parts.join() === '1,0' && !none.housing.ok && /닿는/.test(none.housing.why), '광경로 표본이 후보를 놓치면 형상 가능한 전체 부품으로 대체');
  const st = { avail: a, sel: { shape: true, shapePart: 1, housing: true, housingPart: 4 }, running: null, names: ['커버', 'LGP', '렌즈', '벽', '케이스', '제외'], path };
  const hs = tileConfigHtml('shape', st).html, hh = tileConfigHtml('housing', st).html;
  ok(/LGP · 빛 100%/.test(hs) && hs.indexOf('LGP') < hs.indexOf('커버') && /value="2" disabled>렌즈 · 빛 90% · 2\.5D 아님/.test(hs) && !hs.includes('제외') && hs.includes('자동 검출'), '③ 목록: 빛 % · 많은 순 · 못 바꾸는 부품은 비활성');
  ok(/케이스 · 빛 30%/.test(hh) && !hh.includes('>벽') && hh.includes('자동 검출'), '② 목록: 빛이 닿는 불투명 부품만');
  const hf = tileConfigHtml('shape', { ...st, avail: none, path: nonePath }).html;
  ok(hf.includes('형상 변경 가능한 부품 전체') && hf.includes('LGP') && !hf.includes('빛 0%'), '대체 목록 안내 · 0% 표시는 생략');
  ok(tileConfigHtml('shape', { ...st, avail: all, path: null }).html.includes('검출 전'), '검출 전 안내');
}
{ // 큰 도면 Worker 수 제한: 어떤 크기에서도 예산을 넘지 않음 · 보통 도면은 제한 없음 · 최소 1개
  const { sceneWorkerLimit: f, SCENE_BUDGET: B, SCENE_BYTES_PER_TRI: b } = await import('../src/ui/m3/pool.js');
  ok(f(50, 15) === 15 && f(5e5, 15) === 15 && f(1.1e6, 15) === 12 && f(3e6, 15) === 4 && f(5e7, 15) === 1 && f(0, 15) === 15 && f(50, 3) === 3, `Worker 수: 50만 ${f(5e5, 15)} · 110만 ${f(1.1e6, 15)} · 300만 ${f(3e6, 15)} · 5000만 ${f(5e7, 15)}`);
  ok([1e5, 1e6, 2e6, 5e6, 1e7].every((t) => f(t, 15) * t * b <= B), '예산(4 GB) 안');
}

{ // 1D 곡선 다듬기: 칸이 많을 때만 · LED 리플 높이 유지 · 노이즈 감소 · 원자료 불변
  const { smoothCurve, smoothHalf, sgGain, ledGapCells, profileTxt } = await import('../src/ui/m3/results-panel.js');
  ok(smoothHalf(39, 8) === 0 && smoothHalf(11, null) === 0 && smoothHalf(77, null) === 2 && smoothHalf(77, 3) === 0, '칸 < 40 = 안 함(폭 방향) · LED 모르면 5칸 · 5칸으로도 리플이 깎이면 안 함');
  const a = smoothHalf(77, 7.7), b = smoothHalf(232, 23);
  ok(a >= 2 && b > a && sgGain(a, 7.7) >= 0.95 && sgGain(b, 23) >= 0.95, `저화질 간격 7.7칸 → 반폭 ${a} (높이 ${(sgGain(a, 7.7) * 100).toFixed(1)}%) · 고화질 23칸 → 반폭 ${b}`);
  let sd = 5; const rnd = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296, gs = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(6.283185 * rnd());
  const N = 400, P = 8, clean = Array.from({ length: N }, (_, i) => 0.88 + 0.12 * Math.cos((2 * Math.PI * i) / P)), noisy = clean.map((v) => v + 0.02 * gs()), m = smoothHalf(N, P), sm = smoothCurve(noisy, m);
  const rng = (y) => Math.max(...y) - Math.min(...y), rms = (y) => Math.sqrt(y.slice(20, N - 20).reduce((t, v, i) => t + (v - clean[i + 20]) ** 2, 0) / (N - 40));
  const pure = smoothCurve(clean, m);
  ok(rng(pure.slice(20, N - 20)) / rng(clean) >= 0.95, `깨끗한 리플 높이 ${(rng(pure.slice(20, N - 20)) / rng(clean) * 100).toFixed(1)}% 유지`);
  ok(rms(sm) < 0.8 * rms(noisy), `노이즈 감소 ${rms(noisy).toFixed(4)} → ${rms(sm).toFixed(4)}`);
  const line = Array.from({ length: 50 }, (_, i) => 0.2 + 0.01 * i), sl = smoothCurve(line, 3);
  ok(sl.every((v, i) => Math.abs(v - line[i]) < 1e-12), '직선·기울기는 그대로(끝단 어두움을 왜곡 안 함)');
  const gap = [0.5, 0.6, 0.7, NaN, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 0.9, 0.8], sg = smoothCurve(gap, 2);
  ok(Number.isNaN(sg[3]) && sg[0] === 0.5 && sg[2] === 0.7 && sg[4] === 0.5 && sg[5] === 0.6 && Number.isFinite(sg[6]), 'NaN 그대로 · 끝·끊김 옆은 원자료');
  ok(ledGapCells([10, 10, 30, 50, 55], 1) === 5 && ledGapCells([10], 1) === null && ledGapCells([], 1) === null, 'LED 간격: 2열 중복 빼고 가장 좁은 간격');
  const t = profileTxt([{ title: 'x', v: { curves: [{ name: 'A', ys: [0.8, 1], draw: [0.5, 0.5] }], opt: { x0: 0, x1: 2, xl: 's (mm)' } } }]);
  ok(t.includes('80.00') && t.includes('100.00') && !t.includes('50.00'), 'CSV = 원자료(다듬은 값이 아님)');
}

{ // 원설계 대비 LED 변경
  const { ledChange, pitchOf, pitchText, ledDeltaText } = await import('../src/ui/m3/led-change.js');
  const { ledChangeHtml } = await import('../src/ui/mech3d-light-panel.js');
  const grid = (n, p, e = 0, w = 0) => Array.from({ length: n }, (_, i) => ({ s: e + i * p, w, n: i }));
  const same = ledChange(grid(5, 10), grid(5, 10));
  ok(!same.changed && same.rows.every((r) => r.state === 'same') && ledChangeHtml(same).includes('원설계 그대로') && ledDeltaText(same.rows[0]) === '', '그대로 = 변경 없음');
  const mv = ledChange(grid(3, 10), [{ s: 0, w: 0 }, { s: 12, w: 0 }, { s: 20, w: -2 }]);
  ok(mv.moved === 2 && mv.added === 0 && mv.removed === 0 && ledDeltaText(mv.rows[1]) === '+2' && ledDeltaText(mv.rows[2]) === '폭 −2', '옮김: 거리·폭 표시');
  const real = [7.25, 25.25, 46.75, 71.5, 91.5, 117.25, 141.5, 162.75, 187.75, 212.25, 237.25, 258.5, 282.75, 308.5, 328.5, 353.25, 374.75, 392.75].map((s, n) => ({ s, w: -12, n }));
  const big = ledChange(grid(40, 10, 5), real), h = ledChangeHtml(big);
  ok(big.changed && big.nOrig === 40 && big.nCur === 18 && !big.pitchCur.uniform && h.includes('원설계에서 변경됨') && h.includes('40개 · 피치 10 mm') && h.includes('18개 · 피치 18~25.8 mm (간격 불규칙)'), `실제 도면: ${pitchText(big.pitchOrig)} → ${pitchText(big.pitchCur)}`);
  ok(big.moved + big.added === 18 && big.removed + big.moved === 40, `개수 맞음: 옮김 ${big.moved} · 추가 ${big.added} · 없어짐 ${big.removed}`);
  ok(pitchOf(grid(2, 7)).uniform && pitchOf(grid(1, 7)).p === null && ledChangeHtml(null) === '', '간격 요약 · 기준 없음');
  // treeNodes = 위 lightOpen 감싸개
  const M = { parts: [], groups: [], contacts: [], observe: { faces: [], targetLen: 0.8, targetWid: 0.8 }, light: { kind: 'manual', spec: { beam: 120 }, manual: { count: 18, pitch: 22.7, rows: 1 } } };
  const nd = treeNodes(M, { hidden: [], fold: {}, multi: [], ledChange: big }, undefined, []).find((x) => x.id === 'leds');
  ok(nd.chg && JSON.stringify(nd).includes('원설계 40 → 18개'), '트리: 변경 표시');
}

{ // 창을 열 때 화면 안으로: 아래가 나가면 올림 · 화면보다 크면 줄임
  const { fitRect: g } = await import('../src/ui/m3/monitor.js');
  const a = g({ x: 53, y: 158, w: 963, h: 696 }, 1024, 768), b = g({ x: 0, y: 0, w: 5000, h: 5000 }, 1000, 700), c = g({ x: null, y: 80, w: 500, h: 300 }, 1000, 700);
  ok(a.y + a.h <= 760 && a.h === 696 && a.x + a.w <= 1016, `아래가 나가면 올림: y ${a.y}`);
  ok(b.w === 984 && b.h === 684 && b.x === 8 && b.y === 8 && c.x === 492 && c.y === 80, '너무 크면 줄임 · 위치 없으면 오른쪽');
}
{ // 창 크기 조절: 8방향 · 반대쪽은 제자리 · 최소 크기
  const { resizeRect: f } = await import('../src/ui/m3/monitor.js');
  const s0 = { x: 100, y: 100, w: 500, h: 400 }, q = (r) => [r.x, r.y, r.w, r.h].join();
  ok(q(f(s0, 'e', 50, 0)) === '100,100,550,400' && q(f(s0, 's', 0, 30)) === '100,100,500,430', '오른쪽·아래 = 크기만');
  ok(q(f(s0, 'w', 50, 0)) === '150,100,450,400' && q(f(s0, 'n', 0, -40)) === '100,60,500,440', '왼쪽·위 = 반대쪽 제자리');
  ok(q(f(s0, 'nw', 10, 10)) === '110,110,490,390' && q(f(s0, 'se', -5, 5)) === '100,100,495,405' && q(f(s0, 'ne', 5, 5)) === '100,105,505,395' && q(f(s0, 'sw', 5, 5)) === '105,100,495,405', '모서리 4곳');
  ok(q(f(s0, 'w', 900, 0, 320, 160)) === '280,100,320,400' && q(f(s0, 'n', 0, 900, 320, 160)) === '100,340,500,160' && q(f(s0, 'e', -900, 0, 320, 160)) === '100,100,320,400', '최소 크기에서 멈추고 반대쪽은 그대로');
}
{ // Milky 표 적용 단추 값 = 표 값 그대로(1.525 가 1.52 로 반올림되면 줄을 못 찾았음)
  const { milkyTableHtml } = await import('../src/ui/m3/autodesign-panel.js');
  const h = milkyTableHtml([{ milky: 1.025, Ulen: 0.7, Uwid: 0.8, eff: 0.2 }, { milky: 1.525, Ulen: 0.7, Uwid: 0.8, eff: 0.2 }, { milky: 2.5, Ulen: 0.7, Uwid: 0.8, eff: 0.2 }], 2.5, {});
  ok(h.includes('data-v="1.525"') && h.includes('data-v="1.025"'), '버튼 값이 표 값과 정확히 같음');
}

{ // 용어: 노이즈로 통일(2026-11-03)
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? walk(p) : /\.(js|html)$/.test(f) ? [p] : []; });
  const bad = walk('src').filter((p) => /(?<!붙)\uC7A1\uC74C/.test(readFileSync(p, 'utf8')));
  if (bad.length) throw new Error(`src 에 옛 용어 남음 ${bad.slice(0, 3).join()}`);
}
{ // 부품 리스트 정리(2026-11-03): 관측면 맨 위 · 목표 노드 없음 · LED 줄 = 원설계 대비 Δx Δy Δz 만
  const { ledDeltaXYZ, ledChange } = await import('../src/ui/m3/led-change.js');
  const N0 = treeNodes(M, { node: null, line: { kind: 'line', length: 100, width: 7 }, hidden: [], hideLeds: false });
  ok(N0[0].id === 'obs' && N0[0].grp0 && N0[0].badge.includes('100×7 mm') && N0[0].badge.includes('목표') && !N0.some((n) => n.id === 'target') && N0.filter((n) => n.id === 'obs').length === 1, `관측면 맨 위 · 목표 포함: ${N0[0].badge}`);
  const c = ledChange([{ s: 0, w: 0, pos: [0, 0, 0] }, { s: 10, w: 0, pos: [10, 0, 0] }], [{ s: 0, w: 0, pos: [0, 0, 0], n: 0 }, { s: 12, w: -1, pos: [12, 0, -1], n: 1 }, { s: 40, w: 0, pos: [40, 0, 0], n: 2 }]);
  ok(ledDeltaXYZ(c.rows[0]) === '' && ledDeltaXYZ(c.rows[1]) === 'Δx +2 Δz −1' && ledDeltaXYZ(c.rows[2]) === '추가' && ledDeltaXYZ(null) === '', `Δ 표시: ${ledDeltaXYZ(c.rows[1])}`);
  ok(ledDeltaXYZ({ state: 'same', d: [0, 0, 3] }) === 'Δz +3', '높이만 바뀌어도 표시');
}
{ // 목표 근처(2026-11-04): 차이가 표준오차의 2배보다 작으면 통과·미달을 가르지 않음
  const { uVerdict, judgeStats } = await import('../src/engine/mech3d/tally.js');
  const { flowState } = await import('../src/ui/m3/command-bar.js');
  ok(uVerdict(0.7925, 0.8, 0.004) === 'near' && uVerdict(0.8027, 0.8, 0.004) === 'near' && uVerdict(0.75, 0.8, 0.004) === 'bad' && uVerdict(0.85, 0.8, 0.004) === 'ok', '실측 3회 값은 모두 근처, 먼 값은 그대로');
  ok(uVerdict(0.795, 0.8, null, 0.005) === 'near' && uVerdict(0.79, 0.8, null, 0.005) === 'bad', '표준오차 없으면 노이즈로');
  ok(uVerdict(0.799, 0.8) === 'bad' && uVerdict(0.8, 0.8) === 'ok' && uVerdict(NaN, 0.8) === '', '노이즈를 모르면 지금처럼');
  const O = { targetLen: 0.8, targetWid: 0.8 };
  ok(judgeStats({ Ulen: 0.75, seLen: 0.004, Uwid: 0.801, seWid: 0.004 }, O).all === 'bad' && judgeStats({ Ulen: 0.802, seLen: 0.004, Uwid: 0.84, seWid: 0.004 }, O).all === 'near' && judgeStats({ Ulen: 0.85, seLen: 0.004, Uwid: 0.84, seWid: 0.004 }, O).all === 'ok', '하나라도 미달 = 미달, 아니면 하나라도 근처 = 근처');
  const f = flowState({ state: 'done' }, { Ulen: 0.802, seLen: 0.004, Uwid: 0.84, seWid: 0.004 }, { observe: O });
  ok(f.sim.cls === 'near' && f.sim.text.includes('목표 근처') && f.opt.text.includes('목표 근처'), `상단 표시: ${f.sim.text} / ${f.opt.text}`);
  const j = judgeText(0.802, 0.8, 0.004); ok(j.cls === 'near' && j.text.includes('근처') && j.text.includes('±0.8%p'), `결과 판: ${j.text}`);
ok(judgeText(0.3, 0.8, null, 0.2).cls === 'busy' && /판정 보류/.test(judgeText(0.3, 0.8, null, 0.2).text) && judgeText(0.85, 0.8, null, 0.01).cls === 'ok', '계산 초반(노이즈 큼) = 빨간 미달 대신 판정 보류');
}
{ // 진행 줄·지표 숫자 맞추기(2026-11-12 평가 1·4·9)
  const { STAGES, monitorHtml, applyProgress } = await import('../src/ui/m3/opt-dash.js');
  const T = () => ({ status: 'wait', frac: 0, evals: [], text: '' }), mk = () => ({ tiles: Object.fromEntries(STAGES.map(([k]) => [k, T()])), seq: [], tgLen: 0.8, tgWid: 0.8, cur: null, note: '', before: { Ulen: 0.7, Uwid: 0.7, eff: 0.66 } });
  const S = mk(); applyProgress(S, 'ledsRef', 0.4, '위치 계산용 기준 Milky 찾기 (Milky 1.5)');
  const chip = (h) => h.match(/<b>기준 Milky<\/b><span>([^<]*)<\/span>/)?.[1];
  ok(S.refFrac === 0.4 && S.tiles.position.status === 'wait' && chip(monitorHtml(S, 5)) === '40.0%' && /위치 계산용 기준 Milky/.test(monitorHtml(S, 5)), `기준 Milky 찾기 = 진행 줄 따로 칸(① 위치는 대기): ${chip(monitorHtml(S, 5))}`);
  ok(/<b>현재안<\/b><span>✓<\/span>/.test(monitorHtml(S, 5)), '다음 단계로 넘어가면 현재안 = 완료(후보가 아직 없어도)');
  applyProgress(S, 'leds', 0, 'LED 후보 위치 추적');
  ok(chip(monitorHtml(S, 5)) === '✓' && !chip(monitorHtml(mk(), 5)), '위치 계산이 시작되면 기준 Milky = 완료 · 그 단계가 없으면 칸 없음');
  const E = mk(); E.seq = [{ k: 'milky', label: 'Milky 2', Ulen: 0.85, Uwid: 0.84, eff: 0.6 }];
  const eh = monitorHtml(E, 5), effTxt = eh.match(/광 효율<\/div><b class="om-v">([^<]*)<\/b><div class="mut">([^<]*)/);
  ok(effTxt?.[1] === '≈60.0%' && /시작 66\.0%/.test(effTxt[2]) && /▼6\.0%p/.test(effTxt[2]), `진행 중 광 효율 = 지금까지 최고안의 대략값: ${effTxt?.[1]} ${effTxt?.[2]}`);
  const P = { ...mk(), stopped: true, partial: { done: ['leds'] } }, ph = monitorHtml(P, 5);
  ok(/data-adpartial/.test(ph) && /끝난 항목\(LED 배치\)/.test(ph) && /정밀 판정/.test(ph) && !/data-adpartial/.test(monitorHtml({ ...mk(), stopped: true }, 5)), '중지 후 = 끝난 항목까지 반영한 안 정밀 판정 단추(끝난 항목이 있을 때만)'); }
{ // 전체 판정이 근처면 설명 문장도 근처로(엔진 사유의 '미달'이 남지 않게) · 하나라도 미달이면 그대로
  const { STAGES, monitorHtml } = await import('../src/ui/m3/opt-dash.js');
  const tiles = Object.fromEntries(STAGES.map(([k]) => [k, { status: 'off', text: '' }]));
  const S = { tiles, seq: [], tgLen: 0.8, tgWid: 0.8, ended: false, endSec: 10, note: '균일도 최고 Milky 1.5에서도 길이 균일도 0.80 · 폭 균일도 0.84 — 목표 0.80 / 0.80 미달 · 한계: 길이 방향', b0: {} };
  const near = monitorHtml({ ...S, final: { Ulen: 0.799, seLen: 0.004, Uwid: 0.84, seWid: 0.004 } }, 10), say = near.match(/om-say">([\s\S]*?)<\/div>/)[1];
  ok(!say.includes('목표') && !say.includes('0.80'), `끝나면 판정 문장 없음(결과 카드에): ${say.replace(/<[^>]+>/g, '').slice(0, 90)}`);
  const bad = monitorHtml({ ...S, final: { Ulen: 0.7, seLen: 0.004, Uwid: 0.84, seWid: 0.004 } }, 10), bsay = bad.match(/om-say">([\s\S]*?)<\/div>/)[1]; ok(!bsay.includes('0.70'), '미달도 값 반복 없음'); }
{ // 광원 접기 · 관측면 창 ②·③ 번호 · 목표 꼭 입력
  const base = { parts: [], observe: { faces: [], targetLen: 0.8, targetWid: 0.8 }, light: { kind: 'manual', spec: { beam: 120 }, manual: { count: 3, pitch: 0, rows: 1 } }, checks: {} };
  const open = treeNodes(base, { node: null, line: null }), shut = treeNodes(base, { node: null, line: null, fold: { light: true } });
  ok(open.find((n) => n.id === 'light').fold === 'open' && open.some((n) => n.id === 'leds') && shut.find((n) => n.id === 'light').fold === 'closed' && !shut.some((n) => n.id === 'leds'), '광원 접으면 LED 줄 숨김');
  ok(treeNodes({ ...base, light: { ...base.light, kind: 'none' } }, { node: null, line: null }).find((n) => n.id === 'light').fold === undefined, '광원 없음 = 접기 없음');
}
{ // 실행 · 일시정지 · 중지 단추(2026-11-04)
  const { simCtl, optCtl } = await import('../src/ui/m3/run-ctl.js');
  const on = (c) => ['run', 'pause', 'stop'].filter((k) => c[k]).join();
  ok(on(simCtl({ state: 'running' })) === 'pause,stop' && on(simCtl({ state: 'paused' })) === 'run,stop' && on(simCtl({ state: 'paused', stopped: true })) === 'run' && on(simCtl({ state: 'done' })) === 'run' && on(simCtl(null)) === 'run' && on(simCtl({ state: 'running' }, true)) === '', '시뮬레이션 단추 상태');
  ok(simCtl({ state: 'paused' }).runTitle === '이어서 계산' && simCtl({ state: 'done' }).runTitle === '처음부터 계산', '실행 = 일시정지면 이어서, 아니면 처음부터');
  ok(on(optCtl({ running: true })) === 'pause,stop' && on(optCtl({ running: true, paused: true })) === 'run,stop' && on(optCtl({})) === 'run' && on(optCtl({ canRun: false })) === '' && optCtl({ hasResult: true }).runTitle.includes('버리고'), '최적화 단추 상태');
}
{ // 적용 전 결과가 있으면 다시 실행 전에 물음
  const { rerunAsk, optCtl } = await import('../src/ui/m3/run-ctl.js');
  const q = rerunAsk({ Ulen: 0.8302, Uwid: 0.7421 });
  ok(q.includes('83') && q.includes('74') && q.includes('버리고') && rerunAsk(null).includes('버리고') && optCtl({ hasResult: true }).runTitle.includes('확인'), `확인 문구: ${q.replace('\n', ' ')}`);
}
{ // 창 제목 단계 표시: 번호 ↔ 초록 ✓
  const { setStepMark } = await import('../src/ui/m3/run-ctl.js');
  const cls = new Set(), mk = { textContent: '4', classList: { toggle: (c, v) => (v ? cls.add(c) : cls.delete(c)) } };
  setStepMark(mk, 4, true); ok(mk.textContent === '✓' && cls.has('done'), '끝나면 ✓');
  setStepMark(mk, 4, false); ok(mk.textContent === '4' && !cls.has('done'), '다시 계산하면 번호');
  setStepMark(null, 4, true);
}
{ // LED 가 없거나 읽는 중이면 실행 단추를 막음
  const { autoCardHtml, stageAvailability } = await import('../src/ui/m3/autodesign-panel.js');
  const base = { avail: { milky: { ok: true } }, sel: { milky: true }, running: null };
  const go = autoCardHtml(base), wait = autoCardHtml({ ...base, noLed: 'LED 도면을 읽는 중' });
  ok(!go.includes('읽는 중') && wait.includes('LED 도면을 읽는 중'), '준비 전에는 이유 표시');
}
{ // 2D 최저 위치 점: 그림 크기에 맞춤, 2~5 px
  const { minDotR } = await import('../src/ui/m3/results-panel.js');
  ok(minDotR(40, 30) === 2 && minDotR(100, 100) === 3 && minDotR(800, 400) === 5 && minDotR(800, 400, 2) === 10, `점 크기: ${minDotR(40, 30)} ${minDotR(100, 100)} ${minDotR(800, 400)}`);
}
{ // 광원·LED 우클릭 메뉴
  const { treeCtxItems } = await import('../src/ui/m3/feature-tree.js');
  const keys = (M, S, id, o) => treeCtxItems(M, S, id, o).map((x) => x.k).join();
  const step = { light: { kind: 'step', step: { emitters: [{}], leds: [0], excluded: [] } } }, none = { light: { kind: 'none' } }, mech = { light: { kind: 'step', step: { emitters: [{}], leds: [0], fromMech: [1] } } }, virt = { light: { kind: 'step', step: { emitters: [{}], leds: [0], virtual: { positions: [] } } } }, man = { light: { kind: 'manual' } };
  ok(keys(none, {}, 'light') === 'ledAuto,ledClick', '광원 없음 = 자동·수동');
  ok(keys(step, {}, 'light') === 'ledAuto,ledClick,ledFace,ledOut,eye,fold' && keys(mech, {}, 'light').includes('ledClear') && !keys(virt, {}, 'light').includes('ledFace') && !keys(man, {}, 'light').includes('eye'), '광원 메뉴는 상태에 맞게');
  ok(keys(step, { hiddenLeds: [1] }, 'leds') === 'eye,ledShowAll,fold' && keys(step, {}, 'leds') === 'eye,fold', 'LED ×n 메뉴');
  const lab = (M, o) => treeCtxItems(M, {}, 'led:0', o).find((x) => x.k === 'ledOff')?.label;
  ok(lab(step) === '이 LED 빛 끄기' && lab(step, { excluded: true }) === '이 LED 빛 다시 켜기' && lab(virt) === '이 LED 삭제' && lab(man) === undefined, 'LED 한 개 메뉴');
}
{ // 2D 우클릭 메뉴
  const { mapMenuItems } = await import('../src/ui/m3/results-panel.js');
  const K = (a, b) => mapMenuItems(a, b).map((x) => x.k).join();
  ok(K(true, false) === 'mapCsv,pinCsv,png,copy' && mapMenuItems(true, true)[1].label.startsWith('선택 선') && mapMenuItems(false, true)[1].label.startsWith('이 위치') && K(false, false) === 'mapCsv,png,copy', '2D 전체 데이터 · 선택 선 있으면 CSV · 없으면 누른 자리 · 여백이면 전체·이미지');
  const { plotMenuItems } = await import('../src/ui/m3/results-panel.js');
  ok(plotMenuItems('길이 방향 1D').map((x) => x.k).join() === 'csv,png,copy' && plotMenuItems('길이 방향 1D')[0].label === '길이 방향 1D 데이터 CSV 저장', '1D 메뉴');
}
{ // 기구 최적화 그래프 2개 · 진행 막대
  const { factorChartSvg, monitorHtml, STAGES } = await import('../src/ui/m3/opt-dash.js');
  const seq = [{ k: 'milky', label: 'Milky 1', Ulen: 0.7, Uwid: 0.9 }, { k: 'milky', label: 'Milky 2', Ulen: 0.82, Uwid: 0.84 }, { k: 'milky', label: 'Milky 3', Ulen: 0.75, Uwid: 0.86 }];
  const S = { tgLen: 0.8, tgWid: 0.8, seq, before: { Ulen: 0.6, Uwid: 0.7 }, overall: 0.44, tiles: Object.fromEntries(STAGES.map(([k]) => [k, { status: 'off', evals: [] }])) };
  const g = factorChartSvg(S, S.before, 600, 170);
  ok((g.match(/<svg/g) ?? []).length === 2 && g.includes('길이 균일도') && g.includes('폭 균일도') && !g.includes('→ 최고') && g.includes('시작 60.0%') && g.includes('③ 확산도(Milky)') && (g.match(/od-cand/g) ?? []).length === 6 && g.includes('<title>후보 2'), '그래프 2개: 최고 = 같은 후보 · 후보 점 · 항목 이름');
  ok(factorChartSvg({ ...S, seq: [] }, {}, 600, 170).includes('후보를 시험하면'), '후보 전 안내');
  ok(g.includes('목표 80%') && g.includes('시작 60.0%') && g.includes('시작 70.0%') && /시험한 후보 3개/.test(g), '그래프 안에 목표·시작선 이름과 가로축 뜻');
  ok(!g.includes('최종') && factorChartSvg({ ...S, final: { Ulen: 0.7886, Uwid: 0.8 } }, S.before, 600, 170).includes('최종 78.8%') && (factorChartSvg({ ...S, final: { Ulen: 0.7886, Uwid: 0.8 } }, S.before, 600, 170).match(/od-final/g) ?? []).length === 2, '최종 판정 값을 후보 값과 구분해 표시');
  { const { chartHtml, chartHeight } = await import('../src/ui/m3/opt-dash.js'), L = chartHtml();
    ok(!/얼마나 좋아졌나/.test(L) && /위로 갈수록 좋음/.test(L) && /시험한 후보/.test(L) && /지금까지 최고/.test(L) && /최종 판정/.test(L) && /대략값/.test(L), '그래프 제목·범례가 뜻을 말함');
    ok(chartHeight(600) === 150 && chartHeight(401) === 150 && chartHeight(300) === 250, `높이 제한: 나란히 ${chartHeight(600)} · 위아래 ${chartHeight(300)}`);
    ok(factorChartSvg(S, S.before, 300, 250).includes('od-sim2 one') && !factorChartSvg(S, S.before, 600, 150).includes('od-sim2 one'), '좁으면 위아래로'); }
  { const { clampLeft } = await import('../src/ui/m3/pane-split.js');
    ok(clampLeft(500, 1000) === 500 && clampLeft(100, 1000) === 300 && clampLeft(950, 1000) === 680 && clampLeft(500, 500) === 300 && !(clampLeft(NaN, 1000) >= 0), `좌우 경계 제한: 왼쪽 ≥ 300 · 오른쪽 ≥ 320`); }
  const m = monitorHtml(S, 65); ok(m.includes('<b>44.0%</b>') && m.includes('width:44.0%') && m.includes('진행 01:05') && /role="progressbar"[^>]*aria-valuenow="44.0"/.test(m) && m.indexOf('44.0%') < m.indexOf('om-steps'), '맨 위 진행 막대 % · aria');
  ok(monitorHtml({ ...S, ended: true, endSec: 5 }, 5).includes('<b>100.0%</b>'), '끝나면 100.0%');
}
{ // 설계 인자 상자 · 현재안 %
  const { factorBoardHtml, monitorHtml, STAGES } = await import('../src/ui/m3/opt-dash.js');
  const tiles = Object.fromEntries(STAGES.map(([k]) => [k, { status: 'off', evals: [] }])); tiles.milky = { status: 'run', frac: 0.4, evals: [] }; tiles.shape = { status: 'done', frac: 1, evals: [] };
  const h = factorBoardHtml({ tgLen: 0.8, tgWid: 0.8, tiles }, { locked: { position: {} }, on: {} }, (k) => ({ on: k === 'shape', box: `<input type="checkbox" data-ad="${k}">`, opt: '', why: '' }));
  ok((h.match(/class="fb-card[ "]/g) ?? []).length === 3 && (h.match(/class="fb-head"/g) ?? []).length === 3 && h.includes('st-lock') && h.includes('st-run') && h.includes('st-done') && h.indexOf('fb-head') < h.indexOf('fb-in') && (h.match(/class="fb-sw"/g) ?? []).length === 2, '세 항목 같은 상자 · 상태 표시');
  const m = monitorHtml({ tgLen: 0.8, tgWid: 0.8, seq: [], before: {}, tiles, curFrac: 0.37 }, 3); ok(m.includes('<b>현재안</b><span>37%</span>'), '현재안 계산 %');
  const v = monitorHtml({ tgLen: 0.8, tgWid: 0.8, seq: [{ k: 'milky', Ulen: 0.7, Uwid: 0.7 }], before: {}, tiles, verFrac: 0.5 }, 3); ok(v.includes('<b>검증</b><span>50.0%</span>'), '검증 %');
}
{ // 추적 중 진행 알림
  const R = (await import('../src/ui/m3/autodesign-run.js')).createAdRunner({ ports: [{ send: async (m) => (m.type === 'scene' ? { ready: true } : { acc: new Float64Array(4).fill(1), cnt: new Uint32Array(4), ledger: { emitted: 1, escaped: 0, absSurf: 0, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 }, ms: 1 }) }] }); const seen = []; await R.trace({ sceneKey: 'pg', scene: { G: { ns: 2, nw: 2 } } }, { N: 40000, chunkN: 10000, batches: 2, onProgress: (f) => seen.push(f) });
  ok(seen.length === 4 && seen.every((f, i) => f >= 0 && f <= 1 && (i === 0 || f >= seen[i - 1] - 1e-9)) && seen[seen.length - 1] === 1, `진행 알림 0~1 (${seen.join()})`);
}
done();

{ const { clearDbHtml } = await import('../src/ui/mech3d-panel.js');
  const h = clearDbHtml([{ id: 'u:A', name: 'A<', base: 'PMMA', n: 1.49, T: 0.9, tRef: 2, note: '' }], { 'u:A': 2 });
  console.log(h.includes('data-m3-cdb="u:A"') && h.includes('부품 2개 사용') && h.includes('value="1.49"') && h.includes('A&lt;') && h.includes('data-m3-cdbdel') && clearDbHtml([]).includes('등록한 측정값 없음') ? 'PASS 투명 측정값 DB 관리 표' : (process.exitCode = 1, 'FAIL 투명 측정값 DB 관리 표')); }
{ const { materialGroups, pickOf, materialSummary } = await import('../src/engine/mech3d/material-pick.js');
  const ok4 = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) process.exitCode = 1; };
  ok4(pickOf({ material: { kind: 'milky', dbId: '' } }) === 'milky' && pickOf({ material: { kind: 'clear', resin: 'PMMA' } }) === 'clear:PMMA' && pickOf({ material: { kind: 'clear', resin: 'PC', matId: 'u:A' } }) === 'clear:u:A' && pickOf({ material: { kind: 'whiteTrans' } }) === 'wt' && pickOf({ material: { kind: 'opaque' }, reflMaterial: 'x' }) === 'opaque:x', '소재 고르기 id');
  ok4(materialSummary({ material: { kind: 'clear', resin: 'PMMA', T: 0.92, tRef: 2 } }) === '굴절률 1.49 · 투과율 92% (2 mm)' && materialSummary({ material: { kind: 'opaque' }, reflMaterial: 'gone', finish: { kind: 'whiteDiffuse', R: 0.8 } }, { refl: [] }).includes('없는 소재'), '물성 한 줄');
  ok4(materialGroups({}).length === 4 && materialGroups({}).every((g) => g.items.length > 0), '목록 묶음 4개'); }
{ const { resultLineHtml } = await import('../src/ui/m3/autodesign-panel.js');
  const ok5 = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) process.exitCode = 1; };
  const base = { unchanged: true, feasible: true, cur: { Ulen: 0.83, Uwid: 0.8 }, best: { Ulen: 0.83, Uwid: 0.8 }, targets: { len: 0.8, wid: 0.8 } };
  const a = resultLineHtml({ ...base, alt: { design: { milky: 2.47 }, milky: 2.47, Ulen: 0.84, Uwid: 0.8 } }), b = resultLineHtml(base);
  ok5(!a.includes('data-ad="apply"') && a.includes('data-ad="applyAlt"') && a.includes('후보로 바꾸기 (Milky 2.47)<') && a.includes('84.0%') && a.includes('유지를 추천') && !b.includes('applyAlt'), '현재안 유지 + 찾은 후보 → 단추는 [후보로 바꾸기] 하나 · 이유 한 줄'); }
{ const { etaText } = await import('../src/ui/m3/opt-dash.js');
  const H = [{ ph: 1e6, t: 0, noise: 0.1 }, { ph: 2e6, t: 5000, noise: 0.07 }, { ph: 3e6, t: 10000, noise: 0.0577 }];
  const e = etaText(H, 0.02);
  console.log(e.includes('필요 광선 ≈ 2,497만') && e.includes('남은 ≈ 2분') && etaText([{ ph: 1, t: 0, noise: 0.01 }], 0.02) === '' ? 'PASS 남은 계산 예상(필요 광선·시간)' : (process.exitCode = 1, `FAIL 남은 계산 예상: ${e}`)); }
{ const { mapLayout } = await import('../src/ui/m3/results-panel.js');
  const G = { w0: -2.75, nw: 8, cell: 0.6875, L: 440, ns: 110 }, a = mapLayout(G, 600, 180, 1), b = mapLayout({ w0: -12, nw: 8, cell: 3, L: 116, ns: 100 }, 600, 180, 1);
  const [x, y] = a.xy(250, 1), back = a.at(x, y);
  console.log(a.K === 1 && a.exag <= 8.01 && a.rowH >= 28 && a.rowH < 142 && Math.abs(back[0] - 250) < 1e-6 && Math.abs(back[1] - 1) < 1e-6 && b.K === 1 && b.rowH === 142 ? `PASS 2D 지도: 한 줄 · 길고 좁은 면은 폭 ×${a.exag.toFixed(1)} 까지(띠 ${a.rowH.toFixed(0)} px) · 넓은 면은 상자 가득 · 좌표 왕복` : (process.exitCode = 1, `FAIL 2D 지도 ${a.K} ${a.exag} ${a.rowH} ${b.rowH}`)); }
{ const { reachDiag } = await import('../src/ui/m3/opt-dash.js');
  const L = { emitted: 1, escaped: 0.7, absSurf: 0.2, absVol: 0.1 }, d = reachDiag(L, { '1|5': 0.5, '-1|-1': 0.15, '2|0': 0.0495 }, ['케이스', '확산판', '커버']);
  console.log(d && d.html.includes('관측면에 도착한 빛 0.050%') && d.html.includes('거의 없음') && d.html.includes('확산판 면 #5 50%') && d.html.includes('LED에서 바로 공기로') && d.html.includes('흡수 30%') && reachDiag(L, { '1|5': 0.3 }, []) === null ? 'PASS 빛 도달 진단(관측면 < 1% → 빛이 간 곳)' : (process.exitCode = 1, `FAIL 빛 도달 진단 ${d?.html}`)); }
{ const { pointProfiles } = await import('../src/ui/m3/results-panel.js');
  // 3×2 격자(k = i·nw + j), 칸 (1,0) 은 관측면 밖 → NaN. 각 곡선은 자기 최대 = 1
  const G = { ns: 3, nw: 2, valid: [1, 1, 0, 1, 1, 1] }, map = [2, 4, 9, 8, 1, 6];
  const p = pointProfiles(G, map, 2, 1), q0 = pointProfiles(G, map, 1, 0);
  const near = (a, b) => a.length === b.length && a.every((v, k) => (Number.isNaN(b[k]) ? Number.isNaN(v) : Math.abs(v - b[k]) < 1e-9));
  console.log(near(p.along, [4 / 8, 8 / 8, 6 / 8]) && near(p.across, [1 / 6, 1]) && near(q0.along, [2 / 2, NaN, 1 / 2]) && near(q0.across, [NaN, 1]) ? 'PASS 지정 점 프로파일: 길이(w 고정)·폭(s 고정) 곡선 · 관측면 밖 = 끊김' : (process.exitCode = 1, `FAIL 지정 점 프로파일 ${JSON.stringify([...p.along])} ${JSON.stringify([...q0.across])}`)); }
{ const { cropFinite, mapTxt } = await import('../src/ui/m3/results-panel.js');
  // 폭 프로파일 가로축 = 값이 있는 칸 범위로(양끝 NaN 칸 잘라냄 — 모든 곡선 기준)
  const c = cropFinite([{ ys: [NaN, 0.5, 1, NaN] }, { ys: [NaN, NaN, 0.8, NaN] }], -2, 2);
  const okC = c.x0 === -1 && c.x1 === 1 && c.curves[0].ys.length === 2 && c.curves[1].ys[0] !== c.curves[1].ys[0] && c.curves[1].ys[1] === 0.8 && cropFinite([{ ys: [NaN, NaN] }], 0, 1).x1 === 1;
  // 2D TXT: 머리말 + w(위→아래) × s 표, 최대 = 100(%), 관측면 밖 = 빈칸
  const G = { ns: 2, nw: 2, ds: 5, cell: 1, w0: -1, L: 10, valid: [1, 1, 0, 1] }, t = mapTxt(G, [1, 2, 9, 4], { name: 'x' }), rows = t.split('\n');
  const okT = t.startsWith('#') && rows.some((r) => r === 'w\\s(mm)\t2.5\t7.5') && rows.some((r) => r === '0.5\t50.00\t100.00') && rows.some((r) => r === '-0.5\t25.00\t');
  // 2D TXT = 그림과 같은 범위(관측면 밖 빈 줄 뺌, 2026-10-30): 4줄 중 가운데 2줄만 유효 → 2줄만
  const G4 = { ns: 2, nw: 4, ds: 5, cell: 1, w0: -2, L: 10, valid: [0, 1, 1, 0, 0, 1, 1, 0] }, t4 = mapTxt(G4, [0, 1, 2, 0, 0, 3, 4, 0]).split(String.fromCharCode(10)).filter((r) => r && !r.startsWith('#')).slice(1);
  const okCrop = t4.length === 2 && t4[0].startsWith('0.5' + String.fromCharCode(9)) && t4[1].startsWith('-0.5' + String.fromCharCode(9));
  console.log(okC && okT && okCrop ? 'PASS 폭 범위 맞춤 · 2D 분포 TXT(그림과 같은 범위)' : (process.exitCode = 1, `FAIL 폭/TXT ${okC} ${okT} crop ${okCrop} ${JSON.stringify(t4)} ${JSON.stringify(rows)}`)); }
{ const { mapViewG } = await import('../src/ui/m3/results-panel.js');
  const G = { ns: 2, nw: 4, cell: 1, w0: -2, valid: [0, 1, 1, 0, 0, 0, 1, 0] }, v = mapViewG(G), e = mapViewG({ ns: 1, nw: 2, cell: 1, w0: 0, valid: [0, 0] });
  console.log(v.w0 === -1 && v.nw === 2 && v.jA === 1 && v.jB === 2 && mapViewG(G) === v && e.nw === 2 && e.jA === 0 ? 'PASS 2D 표시 폭 = 값 있는 w 줄만' : (process.exitCode = 1, `FAIL 2D 폭 ${JSON.stringify(v)}`)); }
{ const { profileTxt } = await import('../src/ui/m3/results-panel.js');
  // 1D TXT: 그림마다 머리말 + x 칸 중심 · 곡선별 %(그림 = 원자료 그대로, 없음 = 빈칸)
  const t = profileTxt([{ title: '길이 방향 1D', v: { curves: [{ name: '폭 평균', ys: [0.8, 1] }, { name: 'B', ys: [NaN, 0.5] }], opt: { x0: 0, x1: 10, xl: 's (mm)' } } }, { title: '폭', v: null }]);
  const L = t.split('\n');
  console.log(L.includes('# 길이 방향 1D') && L.includes('s (mm)\t폭 평균\tB') && L.includes('2.5\t80.00\t') && L.includes('7.5\t100.00\t50.00') && !t.includes('# 폭') ? 'PASS 1D 프로파일 TXT(원자료 %, 없는 그림 생략)' : (process.exitCode = 1, `FAIL 1D TXT ${JSON.stringify(L)}`)); }
{ const { clampRect } = await import('../src/ui/m3/monitor.js');
  // 처음 = 오른쪽에 붙임, 화면 밖으로 끈 창 = 안으로, 너무 큰 창 = 화면 크기로, 너무 작은 창 = 최소 크기
  const a = clampRect({ x: null, y: 90, w: 460, h: 560 }, 1600, 900), b = clampRect({ x: 5000, y: -50, w: 460, h: 560 }, 1600, 900), c = clampRect({ x: 0, y: 0, w: 5000, h: 5000 }, 1000, 700), d = clampRect({ x: 10, y: 10, w: 10, h: 10 }, 1000, 700);
  console.log(a.x === 1124 && a.y === 90 && b.x === 1132 && b.y === 8 && c.w === 984 && c.h === 684 && d.w === 320 && d.h === 160 ? 'PASS 시뮬레이션 모니터 창 위치·크기 맞춤' : (process.exitCode = 1, `FAIL 모니터 ${JSON.stringify([a, b, c, d])}`)); }
{ const { factorBoardHtml, beforeAfterHtml } = await import('../src/ui/m3/opt-dash.js');
  // 설계 인자 현황: 줄 앞 체크 상자(켜기·끄기), 켠 항목만 설정 줄, 못 쓰는 항목 = 비활성
  const cfg = (k) => ({ milky: { on: true, box: '<input type="checkbox" data-ad="milky" checked>', opt: '<div class="od-opt">상한</div>', why: 'Milky' }, position: { on: false, box: '<input type="checkbox" data-ad="position">', opt: '', why: '' }, shape: { on: false, box: '<input type="checkbox" data-ad="shape" disabled>', opt: '', why: '확산 부품 없음' } })[k];
  const h = factorBoardHtml(null, { milky: 2 }, cfg);
  const okB = h.includes('data-ad="milky" checked') && h.includes('data-ad="position"') && h.includes('data-ad="shape" disabled') && (h.match(/class="fb-opt"/g) ?? []).length === 1 && h.includes('title="확산 부품 없음"');
  // 최적화 타일 전후: 사양·길이 균일도·폭 균일도, 바뀐 칸 강조, 목표 통과 ✓/✕
  const t = beforeAfterHtml('milky', { milky: 2, Ulen: 0.58, Uwid: 0.64 }, { label: 'Milky 3.50', Ulen: 0.82, Uwid: 0.71 }, 0.8, 0.8, 7);
  const okT = t.includes('Milky 2.00') && t.includes('<td class="chg">Milky 3.50') && /82\.0% <b class="od-ok">✓/.test(t) && /71\.0% <b class="od-bad">✕/.test(t) && t.includes('후보 7개') && beforeAfterHtml('shape', {}, null).includes('후보 없음');
  console.log(okB && okT ? 'PASS 설계 인자 현황 체크(켜기·설정) · 최적화 타일 전후 사양표' : (process.exitCode = 1, `FAIL 인자 체크/전후 ${okB} ${okT} ${t}`)); }
{ const { simPlotSvg, simCaption, optMatrixHtml, topPaths } = await import('../src/ui/m3/opt-dash.js');
  const obs = { targetLen: 0.8, targetWid: 0.8 }, H = [{ ph: 1e6, noise: 0.04, Ulen: 0.5, Uwid: 0.6 }, { ph: 4e6, noise: 0.02, Ulen: 0.7, Uwid: 0.75 }];
  const svg = simPlotSvg(H, 0.01, obs, 300, 90), cap = simCaption(H, 0.01, obs, 'done');
  if (!svg.includes('총 1,600만 광선') || !svg.includes('80%') || !svg.includes('od-s2') || !svg.includes('계산 오차') || !svg.includes('od-pred') || (svg.match(/<svg/g) ?? []).length !== 2 || !svg.includes('<title>')) throw new Error(`진행 그래프: 오차·균일도 2개 ${svg}`);
  if (!simCaption(H, 0.01, obs, 'paused').includes('광선 400만 / 총 1,600만') || !svg.includes('길이 70.0%') || !svg.includes('폭 75.0%')) throw new Error(`진행 설명: ${cap}`);
  const stages = { milky: { status: 'done', frac: 1, text: '', evals: [{ label: 'Milky 1.5', Ulen: 0.76, Uwid: 0.84 }, { label: 'Milky 1.0', Ulen: 0.7, Uwid: 0.8 }] } };
  const tiles = new Proxy(stages, { get: (o, k) => o[k] ?? { status: 'off', frac: 0, text: '', evals: [] } });
  const mx = optMatrixHtml({ tiles, tgLen: 0.8, tgWid: 0.8, final: { Ulen: 0.81, Uwid: 0.85 } });
  if (!mx.includes('최종 판정') || !mx.includes('Milky 1.5') || !mx.includes('81.0%') || !mx.includes('<th>폭</th>') || mx.includes('Milky 1.0')) throw new Error(`최적화 현황 표: ${mx}`);
  { // ① 위치 줄: 배치 추정값(est)은 실제 계산값처럼 보이지 않게(2026-11-07 — 추정 0.82/0.87 이 실제로는 0.64/0.82)
    const est = { label: '2열 × 28개', Ulen: 0.82, Uwid: 0.87, est: true }, real = { label: 'LED 높이 +0.00', Ulen: 0.64, Uwid: 0.82 };
    const tl = (ev) => new Proxy({ position: { status: 'done', frac: 1, text: '', evals: ev } }, { get: (o, k) => o[k] ?? { status: 'off', frac: 0, text: '', evals: [] } });
    const both = optMatrixHtml({ tiles: tl([est, real]), tgLen: 0.8, tgWid: 0.8 }), only = optMatrixHtml({ tiles: tl([est]), tgLen: 0.8, tgWid: 0.8 });
    if (!both.includes('64.0%') || both.includes('87.0%') || !only.includes('≈82.0%') || !only.includes('추정')) throw new Error(`추정값 표시: ${both} / ${only}`);
    console.log('PASS ① 배치 추정값 = 실제값이 있으면 실제값, 없으면 ≈ 추정 표시'); }
  const tp = topPaths({ ':0>1': 3, ':1': 1 }, 2, 3, [0]);
  if (tp.length !== 1 || tp[0].parts.join() !== '1' || tp[0].share !== 1) throw new Error(`빛 계산 제외 부품은 광경로에서 뺌: ${JSON.stringify(tp)}`); }
{ const { flowState } = await import('../src/ui/m3/command-bar.js'); const t = flowState({ state: 'done' }, { Ulen: 0.795, Uwid: 0.83 }, { observe: { targetLen: 0.8, targetWid: 0.8 } }).sim.text;
  if (t !== '79.5% / 83.0% 목표 미달') throw new Error(`미달 표시 = 내림(결과 창과 같게): ${t}`);
  const t2 = flowState({ state: 'done' }, { Ulen: 0.596, Uwid: 0.107 }, { observe: { targetLen: 0.8, targetWid: 0.8 } }).sim.text;
  if (!/^59\.6% \/ 10\.7%/.test(t2)) throw new Error(`단계 막대도 내림(0.596 → 59%, 결과 창 0.59): ${t2}`); }
{ const { flowState } = await import('../src/ui/m3/command-bar.js');
  // 흐름 4 광분포 시뮬레이션 → 5 기구 최적화: 계산 중 % · 완료 통과/미달 · 미달이면 5 '필요' · 최적화 진행 중
  const M = { observe: { targetLen: 0.8, targetWid: 0.8, targetNoise: 0.01 } }, st = (a, b) => ({ Ulen: a, Uwid: b });
  const r1 = flowState({ state: 'running', stats: { relNoise: 0.02 } }, st(0.58, 0.64), M), r2 = flowState({ state: 'done' }, st(0.58, 0.64), M), r3 = flowState({ state: 'done' }, st(0.85, 0.9), M), r4 = flowState({ state: 'done' }, st(0.58, 0.64), M, { running: true });
  console.log(r1.sim.text === '계산 중 25.0% · 58.0% / 64.0%' && r1.opt.text === '시뮬레이션 뒤' && r2.sim.cls === 'bad' && r2.sim.done && r2.opt.cls === 'need' && r3.sim.cls === 'ok' && r3.opt.done && r4.opt.text === '진행 중' && flowState(null, null, M).sim.text === '–'
    ? 'PASS 흐름 4 광분포 시뮬레이션 · 5 기구 최적화 상태' : (process.exitCode = 1, `FAIL 흐름 ${JSON.stringify([r1, r2, r3, r4])}`)); }
{ // 3D 보기 상태(2026-11-05): 같은 도면이면 유지 — 최적화 시작·취소·적용·되돌리기에도 숨긴 부품이 풀리지 않게. 다른 도면만 초기화
  const { viewKeep } = await import('../src/ui/m3/feature-tree.js'), a = {}, b = {};
  ok(viewKeep(a, a).keepCamera && !viewKeep(a, a).reset, '같은 도면 = 유지');
  ok(!viewKeep(a, b).keepCamera && viewKeep(a, b).reset, '다른 도면 = 초기화');
  ok(!viewKeep(null, a).keepCamera && !viewKeep(null, a).reset, '처음 = 카메라 맞춤, 초기화할 것 없음'); }
{ // 스윙 결과 → 정밀 탐색 버튼
  const { resultLineHtml } = await import('../src/ui/m3/autodesign-panel.js');
  const b = { best: { Ulen: 0.7, Uwid: 0.7, shape: { h: 1 } }, cur: { Ulen: 0.6, Uwid: 0.6 }, reason: '', targets: {}, stages: { shape: true }, feasible: false };
  const yes = resultLineHtml({ ...b, shapeSwing: true, design: { shape: { h: 1 } } }), no = resultLineHtml({ ...b, shapeSwing: true, design: {}, unchanged: true }), deep = resultLineHtml({ ...b, shapeSwing: false, design: { shape: { h: 1 } } }), mix = resultLineHtml({ ...b, shapeSwing: true, stages: { shape: true, milky: true }, design: { shape: { h: 1 } } });
  ok(/data-ad="shapeDeep"/.test(yes) && /가능성 있음/.test(yes), '효과 있으면 정밀 탐색 추천');
  ok(/data-ad="shapeDeep"/.test(no) && /그래도/.test(no), '효과 없어도 원하면 정밀 탐색');
  ok(!/data-ad="shapeDeep"/.test(deep) && !/data-ad="shapeDeep"/.test(mix), '정밀 뒤 · 다른 항목과 함께 돌린 뒤에는 없음'); }
{ // 최적화 현황 표: 후보 값은 대략값이라고 알림
  const { optMatrixHtml, STAGES } = await import('../src/ui/m3/opt-dash.js');
  const h = optMatrixHtml({ tgLen: 0.8, tgWid: 0.8, tiles: Object.fromEntries(STAGES.map(([k]) => [k, { status: 'off', evals: [] }])), final: {} });
  ok(/적은 광선/.test(h) && /최종 판정/.test(h) && !/서로 다른 후보/.test(h) && !/길이 최고/.test(h), '현황 표: 한 후보의 값 · 후보 값 설명');
  const { monitorHtml } = await import('../src/ui/m3/opt-dash.js');
  const tl = Object.fromEntries(STAGES.map(([k]) => [k, { status: 'off', evals: [] }])), SS = { tgLen: 0.8, tgWid: 0.8, seq: [], before: {}, tiles: tl };
  ok(monitorHtml(SS, 1).includes('od-plot') && !monitorHtml(SS, 1, { chart: false }).includes('od-plot') && monitorHtml(SS, 1, { chart: false }).includes('om-mx'), '그래프를 따로 그리면 오른쪽 칸에서 빠짐');
  const SF = { ...SS, final: { Ulen: 0.7886, Uwid: 0.7052, label: 'x' } }, mh = monitorHtml(SF, 1);
  ok(mh.includes('78.8%') && !mh.includes('78.9%') && mh.includes('70.5%') && !mh.includes('70.6%'), '최종 값 = 결과 카드와 같은 내림 표시(표·문장·지표)');
  const { chartHtml } = await import('../src/ui/m3/opt-dash.js');
  ok(chartHtml().includes('od-plot') && chartHtml().includes('od-legend'), '왼쪽 그래프 칸'); }
{ // 우클릭 메뉴가 열리는 행 — 항목을 만들어 두고 화면에서 안 열리는 일이 없게(2026-11-05)
  const { treeHasCtx } = await import('../src/ui/m3/feature-tree.js');
  ok(['pcbs', 'part:0', 'group:a', 'light', 'leds', 'led:0'].every(treeHasCtx) && !treeHasCtx('plane') && !treeHasCtx('parts'), 'PCB 행도 우클릭 메뉴가 열림'); }
{ // 평판(초기 검토) 화면은 어디서도 열 수 없음(2026-11-05)
  const { readFileSync } = await import('node:fs'), html = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok(!/초기 검토|btn-flat-mode/.test(html) && !/mode-flat|export-flat|spec\.mode = 'flat'/.test(main), '시작 화면·메뉴에 평판 화면 없음'); }
{ // 새로 열면 새로 시작, 새로고침은 이어서(2026-11-05)
  const { isFreshStart } = await import('../src/ui/fresh-start.js'), mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; }, S = mem();
  ok(isFreshStart(S, 'navigate') === true, '새 탭 = 새로 시작');
  ok(isFreshStart(S, 'reload') === false && isFreshStart(S, 'navigate') === false, '같은 탭에서 새로고침·다시 이동 = 이어서');
  ok(isFreshStart(mem(), 'navigate') === true, '탭을 닫고 다시 열면 새로 시작');
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  ok(isFreshStart(bad, 'reload') === false && isFreshStart(bad, 'navigate') === true, '저장소를 못 써도 새로고침은 이어서'); }
{ // 닫을 때 경고: 프로젝트가 있고 파일에 실시간 저장되지 않을 때만(2026-11-05)
  const { shouldWarnClose } = await import('../src/ui/fresh-start.js'), live = { hasFile: true, perm: 'granted', saving: false, err: '' };
  ok(!shouldWarnClose(false, { hasFile: false }), '빈 화면 = 경고 없음');
  ok(shouldWarnClose(true, { hasFile: false }), '파일 없음 = 경고');
  ok(!shouldWarnClose(true, live), '실시간 저장 중인 파일 = 경고 없음');
  ok(shouldWarnClose(true, { ...live, perm: 'prompt' }) && shouldWarnClose(true, { ...live, err: 'x' }) && shouldWarnClose(true, { ...live, saving: true }), '권한 없음·저장 실패·저장 중 = 경고');
  ok(shouldWarnClose(true, null), '파일 상태를 모르면 경고'); }
{ // 기구·LED 불러오기 모두 작업자의 진행 알림(key)을 결과로 착각하지 않음(2026-11-05 — LED STEP 이 안 불러와졌음)
  const { readFileSync } = await import('node:fs'), src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8'), wk = src('../src/engine/mech3d/mech3d-worker.js');
  ok(/postMessage\(\{ key:/.test(wk) && !/postMessage\(\{ stage:/.test(wk), '작업자 진행 알림 = key');
  for (const f of ['../src/main.js', '../src/ui/m3/app.js']) { const t = src(f); ok(/new URL\('[^']*mech3d-worker\.js'/.test(t) && /if \(m\.data\.key\)/.test(t), `${f} 가 진행 알림을 먼저 거름`); } }
{ // 관측면 클릭(2026-11-06): 고른 면 다시 클릭 = 해제 · 새 면 = 그 면만 · Shift = 더하기/빼기
  const { obsFacesAfterClick: c } = await import('../src/ui/m3/feature-tree.js'), A = { part: 1, face: 5 }, B = { part: 0, face: 1 }, k = (F) => F.map((f) => `${f.part}.${f.face}`).join();
  ok(k(c([], A, false)) === '1.5' && k(c([A], B, false)) === '0.1', '새 면 = 그 면만');
  ok(k(c([A], A, false)) === '' && k(c([A, B], A, false)) === '0.1', '고른 면 다시 클릭 = 그 면만 해제(여러 개여도)');
  ok(k(c([A], B, true)) === '1.5,0.1' && k(c([A, B], B, true)) === '1.5', 'Shift = 더하기/빼기');
  const F0 = [A]; c(F0, B, true); ok(F0.length === 1, '원래 목록은 그대로(새 목록)'); }
{ const { seedFits } = await import('../src/ui/m3/autodesign-panel.js');
  const G0 = { ns: 4, nw: 2 }, sd = (n) => ({ batches: [{ acc: new Float64Array(n) }] });
  ok(seedFits(sd(8), G0) && !seedFits(sd(6), G0) && !seedFits(null, G0) && !seedFits(sd(8), null) && !seedFits({ batches: [] }, G0), '판정 값을 화면으로: 칸 수가 같을 때만'); }
{ const { resultLineHtml, limitText } = await import('../src/ui/m3/autodesign-panel.js');
  { const a = limitText('균일도 최고 … 미달 · 한계: 폭 방향 — 폭 가장자리가 가장 어두움(가장자리 감쇠)'), b = limitText('현재안 유지 (… · 한계: 폭 방향 확산 부족(LED 개수로는 안 오름))'), c = limitText('현재안 유지 (한계: 길이 방향 — 끝단이 가장 어두움)'); if (a !== '폭 방향 — 폭 가장자리가 가장 어두움(가장자리 감쇠)' || b !== '폭 방향 확산 부족(LED 개수로는 안 오름)' || c !== '길이 방향 — 끝단이 가장 어두움') { process.exitCode = 1; console.log('FAIL 한계 문구 괄호', a, '/', b, '/', c); } else console.log('PASS 한계 문구 괄호 짝'); }
  // 결과 카드: 판정 한 단어 · 비교표 = 바뀐 사양 + 길이 균일도·폭 균일도·광 효율(안 바뀐 LED 줄 없음) · 한계 한 줄 · [자세히]
  const r = { unchanged: false, feasible: false, reason: '목표 미달 (균일도 최고 … · 한계: 길이 방향 — 끝단이 가장 어두움 · ④ 케이스)', targets: { len: 0.8, wid: 0.8 },
    cur: { count: 40, pitch: 10, milky: 1.43, Ulen: 0.61, Uwid: 0.6, eff: 0.107 }, best: { count: 40, pitch: 10, milky: 1.8, Ulen: 0.66, Uwid: 0.62, eff: 0.1 } };
  const h = resultLineHtml(r);
  { const hn = resultLineHtml({ ...r, targets: { ...(r.targets ?? {}), len: 0.8, wid: 0.8, judge: { all: 'near', len: 'near', wid: 'ok' } } }); if (!hn.includes('m3-rcard near') || !hn.includes('목표 근처') || !hn.includes('≈')) throw new Error('결과 카드 근처 표시'); }
  console.log(h.includes('m3-rcard bad') && h.includes('목표 미달') && h.includes('<th>Milky') && !h.includes('<th>LED') && !h.includes('<th>길이 균일도') && !h.includes('<th>광 효율') && h.includes('💡 한계: 길이 방향 — 끝단이 가장 어두움') && h.includes('data-ad="view"') && limitText('없음') === ''
    ? 'PASS 기구 최적화 결과 카드(판정·바뀐 사양만·한계 한 줄)' : (process.exitCode = 1, `FAIL 결과 카드 ${h}`)); }
{ const { milkyTable, milkyTableHtml } = await import('../src/ui/m3/autodesign-panel.js');
  // Milky 조정 표: 마지막 Milky 단계 기록(뒤에서부터 연속 'milky', ② 기준 'ledsRef' 제외)만 · 같은 Milky 는 정밀(나중) 값 · 믿는 행만 · Milky 오름차순
  const row = (m, u, w, e, t = true) => ({ milky: m, Ulen: u, Uwid: w, eff: e, trusted: t });
  const steps = [{ stage: 'milky', phase: 'ledsRef', rows: [row(9, 0.1, 0.1, 0.01)] }, { stage: 'leds' }, { stage: 'shape' },
    { stage: 'milky', phase: 'coarse', rows: [row(1, 0.6, 0.6, 0.11), row(3, 0.75, 0.7, 0.08), row(5, 0.8, 0.79, 0.05, false)] }, { stage: 'milky', phase: 'peak', precise: true, rows: [row(3, 0.78, 0.74, 0.081), row(3.5, 0.81, 0.8, 0.07)] }];
  const T = milkyTable(steps), h = milkyTableHtml(T, 3.5, { len: 0.8, wid: 0.8 });
  const many = Array.from({ length: 80 }, (_, k) => row(+(0.25 + k * 0.025).toFixed(3), 0.5, 0.5, 0.1)), hm = milkyTableHtml(many, 1.43, {});
  console.log((hm.match(/<tr/g) ?? []).length <= 14 && hm.includes('1.43 <span') && T.map((r) => `${r.milky}:${r.Ulen}`).join() === '1:0.6,3:0.78,3.5:0.81' && h.includes('data-ad="applyMilky" data-v="1"') && /class="sel"[^]*3\.50/.test(h) && h.includes('8.1%') && milkyTable([{ stage: 'shape' }]).length === 0 && milkyTable([...steps, { stage: 'guard' }]).length === 3
    ? 'PASS Milky 조정 표(마지막 Milky 단계만·정밀 값 우선·믿는 행·적용 단추)' : (process.exitCode = 1, `FAIL Milky 조정 표 ${JSON.stringify(T)} ${h}`)); }
{ const { shapeText } = await import('../src/ui/m3/autodesign-panel.js');
  const t = shapeText({ dt: 0, h: 0, e: 0, c: 0, kL: [0.6, -0.23, -0.14, -0.23, 0.6], kW: [0, 0, 0] });
  console.log(t === '길이 두께 곡선 −0.23~+0.60 mm' ? 'PASS 형상 문구: 길이 두께 곡선(제어점 최소~최대) · 0 곡선 생략' : (process.exitCode = 1, `FAIL 형상 문구 ${t}`)); }
{ const { resultLineHtml } = await import('../src/ui/m3/autodesign-panel.js');
  const base = { feasible: false, reason: '', targets: { len: 0.8, wid: 0.8 }, cur: { milky: 1, Ulen: 0.6, Uwid: 0.6, eff: 0.1 }, best: { milky: 2, Ulen: 0.7, Uwid: 0.6, eff: 0.09 } };
  const a = resultLineHtml(base), b = resultLineHtml({ ...base, unchanged: true }), c = resultLineHtml({ ...base, clash: 2 });
  console.log(a.includes('data-ad="continue"') && b.includes('지금 설계 그대로') && !c.includes('data-ad="continue"') ? 'PASS 결과 카드 [이 안에서 이어서] — 현재안 유지도(적용 없이), 겹침 = 없음' : (process.exitCode = 1, 'FAIL 이어서 단추')); }
{ const { makeGroup, ungroup, groupMembers, toggleVisibility } = await import('../src/ui/m3/feature-tree.js');
  const P = (name, role) => ({ ...setPartMaterial(defaultPart(0, name, 1), 'opaque'), ...(role ? { role } : {}) });
  const MM = { ...M, parts: [P('A'), P('B'), P('C'), P('D'), P('L1', 'light'), P('L2', 'light')], groups: [{ id: 'g1', name: '커버류', parts: [1, 2] }] };
  const ids = (S) => treeNodes(MM, { node: null, line: null, ...S }).map((n) => n.id).filter((i) => i.startsWith('part') || i.startsWith('group'));
  // 그룹은 첫 부품 자리에 · 펼침 = 부품 들여쓰기(depth 2) · 접힘 = 숨김 · 광원으로 옮긴 부품 = 부품 리스트에 안 보임(아래 광원 노드에 있음, 2026-11-12)
  const N = treeNodes(MM, { node: null, line: null }), g = N.find((n) => n.id === 'group:g1');
  const okT = ids({}).join() === 'parts,part:0,group:g1,part:1,part:2,part:3' && g.fold === 'open' && g.badge === '2' && N.find((n) => n.id === 'part:1').depth === 2 && N.find((n) => n.id === 'parts').badge === '4'
    && ids({ fold: { g1: true } }).join() === 'parts,part:0,group:g1,part:3' && ids({ fold: { parts: true } }).join() === 'parts'
    && treeNodes({ ...MM, groups: [{ id: 'g2', name: '섞임', parts: [3, 4] }] }, { node: null, line: null }).find((n) => n.id === 'group:g2')?.badge === '1';
  // 그룹 만들기: 다른 그룹에서 빼고, 빈 그룹은 지움 · 풀기 · 멤버
  const a = makeGroup(MM.groups, [2, 3], '새 그룹'), b = ungroup(a.groups, 'g1');
  const okG = a.groups.find((x) => x.id === 'g1').parts.join() === '1' && a.groups.find((x) => x.id === a.id).parts.join() === '2,3' && b.length === 1 && makeGroup([{ id: 'g1', name: 'x', parts: [1] }], [1], 'y').groups.length === 1
    && groupMembers(MM, 'g1').join() === '1,2' && groupMembers(MM, '_light').join() === '4,5';
  // 그룹 눈: 하나라도 보이면 모두 숨김, 다 숨었으면 모두 보임
  const v1 = toggleVisibility('group:g1', false, 6, [1], false, [1, 2]), v2 = toggleVisibility('group:g1', false, 6, [1, 2, 3], false, [1, 2]);
  const okV = v1.hidden.join() === '1,2' && v2.hidden.join() === '3';
  console.log(okT && okG && okV ? 'PASS 부품 그룹: 트리(펼침·접힘·자동 광원 묶음) · 만들기·풀기 · 그룹 보기 전환' : (process.exitCode = 1, `FAIL 부품 그룹 ${okT} ${okG} ${okV} ${ids({})}`)); }
{ const { stageAvailability } = await import('../src/ui/m3/autodesign-panel.js');
  const P = (role, untrace) => ({ ...setPartMaterial(defaultPart(0, 'x', 1), 'opaque'), ...(role ? { role } : {}), ...(untrace ? { untrace } : {}) });
  const a = stageAvailability({ parts: [P(), P('light'), P(null, true), P()], light: { kind: 'manual' }, observe: { faces: [] } }, { non25: [0, 0, 0, 0] });
  console.log(a.housing.parts.join() === '0,3' ? 'PASS ④ 대상 부품: 광원으로 옮긴 LED·추적 제외 부품 빼고' : (process.exitCode = 1, `FAIL ④ 대상 ${a.housing.parts}`)); }
{ // 기구 최적화 창(2026-10-30): 계산 순서(위치 → 케이스 면 → 형상 → Milky) · 적용한 항목 = 고정(다시 최적화 단추) · 오른쪽 모니터(진행 줄·지표·기록)
  const { STAGES, factorBoardHtml, monitorHtml } = await import('../src/ui/m3/opt-dash.js');
  const order = STAGES.map(([k]) => k).join();
  const b = factorBoardHtml(null, { locked: { position: { txt: 'LED 17개' } }, leds: 'LED 17개', on: {} }, (k) => ({ on: false, box: `<input type="checkbox" data-ad="${k}">`, opt: '', why: '' }));
  const okLock = /✓ 고정/.test(b) && b.includes('data-adunlock="position"') && !b.includes('data-ad="position"') && b.includes('data-ad="shape"');
  const S = { tgLen: 0.8, tgWid: 0.8, t0: 0, tiles: { position: { status: 'done', frac: 1, evals: [{ label: '1열 17개', Ulen: 0.84, Uwid: 0.81 }] }, housing: { status: 'off', evals: [] }, shape: { status: 'run', frac: 0.46, evals: [] }, milky: { status: 'off', evals: [] } },
    seq: [{ k: 'position', label: '1열 17개', Ulen: 0.84, Uwid: 0.81 }], before: { Ulen: 0.55, Uwid: 0.62 }, log: [{ sec: 92, k: 'position', label: '1열 17개', Ulen: 0.84, Uwid: 0.81 }], locked: { milky: true } };
  const m = monitorHtml(S, 130);
  const okMon = m.indexOf('① 위치') < m.indexOf('② 형상') && m.includes('46.0%') && /고정/.test(m) && m.includes('84.0%') && m.includes('▲29.0%p') && m.includes('1열 17개') && m.includes('od-plot');
  console.log(order === 'position,shape,milky' && okLock && okMon ? 'PASS 기구 최적화 창: 계산 순서 · 고정 항목 · 모니터(진행 줄·지표·기록)' : (process.exitCode = 1, `FAIL 최적화 창: ${order} lock ${okLock} mon ${okMon}`)); }
{ // 트리 우클릭 메뉴(2026-10-30): 고른 부품 수에 맞는 항목 · 그룹에서 빼기 · Shift 범위 선택
  const { treeCtxItems, removeFromGroups, rangeSelect } = await import('../src/ui/m3/feature-tree.js');
  const M = { parts: [{}, {}, {}, {}], groups: [{ id: 'g1', name: '그룹 1', parts: [1, 2] }] };
  const a = treeCtxItems(M, { node: 'part:3', multi: ['part:0', 'part:3'] }, 'part:3').map((x) => x.k);
  const b = treeCtxItems(M, { node: 'part:1', multi: [] }, 'part:1').map((x) => x.k);
  const c = treeCtxItems(M, { node: 'group:g1', multi: [] }, 'group:g1').map((x) => x.k);
  const lab = treeCtxItems(M, { node: 'part:3', multi: ['part:0', 'part:3'] }, 'part:3')[0].label;
  const r = removeFromGroups(M.groups, [2]), r2 = removeFromGroups(M.groups, [1, 2]);
  const rg = rangeSelect(['part:0', 'part:1', 'part:2', 'part:3'], 'part:1', 'part:3');
  const ok = a.join() === 'group,rename,eye,untrace' && /2개/.test(lab) && b.join() === 'group,out,rename,eye,untrace' && c.join() === 'ungroup,rename,eye,untrace' && r[0].parts.join() === '1' && r2.length === 0 && rg.join() === 'part:1,part:2,part:3';
  console.log(ok ? 'PASS 트리 우클릭 메뉴: 그룹 만들기(N개)·그룹에서 빼기·그룹 해제·이름·보기 · Shift 범위 선택' : (process.exitCode = 1, `FAIL 우클릭 메뉴 ${a} | ${b} | ${c} | ${lab} | ${JSON.stringify(r)} | ${rg}`)); }
{ // 선택 선 TXT(2026-10-30): 지정 점을 지나는 길이·폭 방향 원자료(평활 없음), 값 = 2D 최대 대비 %(2D TXT 와 같은 기준), 관측면 밖 = 빈칸·빈 줄 뺌
  const { lineTxt } = await import('../src/ui/m3/results-panel.js');
  const G = { ns: 3, nw: 4, ds: 2, cell: 1, w0: -2, L: 6, valid: [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0] };
  const map = [0, 1, 2, 0, 0, 3, 4, 0, 0, 5, 8, 0];   // 2D 최대 8
  const t = lineTxt(G, map, { s: 3, w: 0.5 }).split(String.fromCharCode(10)).filter((r) => r && !r.startsWith('#'));
  const tab = String.fromCharCode(9);
  const ok1 = t[0] === `s (mm)${tab}값 (%)` && t[1] === `1${tab}25.00` && t[2] === `3${tab}50.00` && t[3] === `5${tab}100.00`;   // w=0.5 줄(j=2): 2,4,8
  const ok2 = t[4] === `w (mm)${tab}값 (%)` && t[5] === `0.5${tab}50.00` && t[6] === `-0.5${tab}37.50` && t.length === 7;   // s=3 칸(i=1): 위 = +w, 빈 줄(±1.5) 뺌
  console.log(ok1 && ok2 ? 'PASS 선택 선 TXT: 길이·폭 원자료 · 2D 최대 대비 % · 관측면 밖 뺌' : (process.exitCode = 1, `FAIL 선택 선 TXT ${JSON.stringify(t)}`)); }
{ // 2D 칸 위치(2026-11-02): 빈 줄을 잘라도 칸 번호 j 의 w 는 전체 격자 기준 — 최저점 라벨·마우스 읽기가 빈 줄 수만큼 어긋나던 것
  const { mapCellSW, mapViewG } = await import('../src/ui/m3/results-panel.js');
  const G = { ns: 2, nw: 6, ds: 2, cell: 1, w0: -3, L: 4, valid: [0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0] }, V = mapViewG(G), [s, w] = mapCellSW(G, 1, 3);
  console.log(V.jA === 2 && s === 3 && w === 0.5 && w >= V.w0 && w <= V.w0 + V.nw * G.cell ? 'PASS 2D 칸 위치: 표시 범위를 잘라도 w 가 맞음' : (process.exitCode = 1, `FAIL 2D 칸 위치 ${s} ${w} ${JSON.stringify(V.w0)}`)); }
{ // 큰 창 2D 기본 비율: 116×16 mm = 실제 비율, 400×4.4 mm = 폭 확대(실제 비율이면 띠가 납작함)
  const { defaultEqual } = await import('../src/ui/m3/results-panel.js');
  const G = (L, nw, cell) => ({ L, nw, cell, ns: 1, w0: 0, valid: new Uint8Array(nw).fill(1) });
  console.log(defaultEqual(G(116, 11, 1.5)) === true && defaultEqual(G(400, 4, 1.1)) === false && defaultEqual(undefined) === true ? 'PASS 큰 창 2D 기본 비율' : (process.exitCode = 1, 'FAIL 큰 창 2D 기본 비율')); }
{ // Excel 용 CSV(2026-11-02): 탭 → 쉼표, CRLF, 쉼표·따옴표 칸은 묶음, 빈칸 유지
  const { toCsv } = await import('../src/ui/m3/results-panel.js');
  const c = toCsv('# 이름 a,b\ns\t값\t\n1.5\t"x"\t2.00');
  console.log(c === '"# 이름 a,b"\r\ns,값,\r\n1.5,"""x""",2.00' ? 'PASS CSV 변환' : (process.exitCode = 1, `FAIL CSV 변환 ${JSON.stringify(c)}`)); }
{ // ② 관측면 지정(2026-11-12 사용자 결정): 면이 없으면 바로 클릭 대기 · 이미 있으면 메뉴만(면 바꾸기는 메뉴의 단추) · 대기 중 다시 누르면 끝내기
  const { obsCmd } = await import('../src/ui/m3/command-bar.js');
  const a = obsCmd({ node: 'parts', pick: null }, 0), b = obsCmd({ node: 'parts', pick: null }, 2), c = obsCmd({ node: 'obs', pick: 'obs' }, 2), d = obsCmd({ node: 'light', pick: 'led' }, 2);
  ok(a.node === 'obs' && a.pick === 'obs', '면 없음 = 바로 클릭 대기');
  ok(b.node === 'obs' && b.pick === null, `이미 지정 = 메뉴만 (${JSON.stringify(b)})`);
  ok(c.pick === null && d.pick === null, '대기 중 다시 누름 = 끝내기 · 다른 클릭 대기도 끝냄'); }
{ // 부품 리스트(2026-11-11): 소재 칸만 3D 색 배경, 이름은 그대로 · 계산 제외는 색 없이 흐리게(k-off)
  const { defaultLight, defaultObserve } = await import('../src/engine/mech3d/defs.js');
  const M = { parts: [{ name: 'A', material: { kind: 'milky', milky: 2 } }, { name: 'B', material: { kind: 'milky', milky: 2 }, untrace: true }], light: defaultLight(), observe: defaultObserve(), groups: [] };
  const h = treeHtml(M, { node: null, line: null }), a = h.match(/data-node="part:0">.*?<\/div>/s)?.[0] ?? '', b = h.match(/data-node="part:1">.*?<\/div>/s)?.[0] ?? '';
  ok(/class="m3-badge k-milky" style="background:#[0-9a-f]{6};color:#[0-9a-f]{6}"/.test(a) && !/m3-lbl"[^>]*style/.test(a), `소재 칸만 3D 색: ${a.slice(-120)}`);
  ok(/class="m3-badge k-off"/.test(b) && !/m3-badge[^>]*style=/.test(b), `계산 제외 = 색 없이 흐리게: ${b.slice(-90)}`); }
{ // 3D 우클릭 메뉴(2026-11-02): 부품 숨기기·이 부품만·숨긴 것 다시 보기 · LED · 여러 개 선택
  const { viewCtxItems } = await import('../src/ui/m3/feature-tree.js');
  const names = ['A', 'B', 'C'], k = (o) => viewCtxItems({ names, ...o }).map((x) => x.k).join();
  const ok3 = k({ part: 1 }) === 'hide,only' && viewCtxItems({ names, part: 1 })[0].label === 'B 숨기기'
    && k({ part: 1, multi: [0, 1] }) === 'hideSel,only' && k({ part: 1, hidden: [2] }) === 'hide,only,all'
    && k({ selPart: 2, hidden: [2] }) === 'show,all' && k({ isLed: true }) === 'led' && k({ hideLeds: true }) === 'led,all' && k({}) === '';
  console.log(ok3 ? 'PASS 3D 우클릭 메뉴' : (process.exitCode = 1, `FAIL 3D 우클릭 메뉴 ${k({ part: 1 })} | ${k({ part: 1, multi: [0, 1] })} | ${k({ selPart: 2, hidden: [2] })}`)); }
{ // LED 한 개씩 보기·취소선·제목(2026-11-02)
  const { toggleLed, viewCtxItems, treeHead, toggleVisibility: tv } = await import('../src/ui/m3/feature-tree.js');
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b), okL = (c, m) => console.log(c ? `PASS ${m}` : (process.exitCode = 1, `FAIL ${m}`));
  okL(eq(toggleLed(1, [0, 1, 2], [], false), { hiddenLeds: [1], hideLeds: false }) && eq(toggleLed(1, [0, 1, 2], [1], false).hiddenLeds, []), 'LED 한 개 끄기·켜기');
  okL(eq(toggleLed(1, [0, 1, 2], [], true), { hiddenLeds: [0, 2], hideLeds: false }) && eq(toggleLed(1, [0, 1, 2], [], false, true).hiddenLeds, [0, 2]), '전체 끔에서 누름 · Shift = 그 LED 만');
  okL(eq(tv('parts', false, 3, [1], true).hiddenLeds, []), '모두 보기 = 한 개씩 숨긴 LED 도');
  const ks = (o) => viewCtxItems(o).map((x) => x.k).join();
  okL(ks({ isLed: true, ledRank: 3 }) === 'led1,led' && viewCtxItems({ isLed: true, ledRank: 3 })[0].label === 'LED 3 숨기기', 'LED 우클릭 = 이 LED · 모두');
  okL(viewCtxItems({ hiddenLeds: [1, 2] })[0].label === '숨긴 것 모두 보기 (LED 2개)', '숨긴 LED 수');
  const L0 = { kind: 'manual', spec: { beam: 120 }, manual: { count: 2, rows: 1, pitch: 0 } }, O0 = { targetLen: .8, targetWid: .8, faces: [] }, mat = { kind: 'opaque' };
  const M0 = { light: L0, observe: O0, parts: [{ name: 'A', material: mat, untrace: true }, { name: 'B', material: mat }] };
  const rows = [{ n: 1, rank: 1, s: 5, excluded: false }, { n: 0, rank: 2, s: 9, excluded: true }];
  const N = treeNodes(M0, { node: 'leds', ledSel: 1, hidden: [], hiddenLeds: [0] }, undefined, rows), by = (id) => N.find((x) => x.id === id);
  okL(by('led:1').label === 'LED 1' && by('led:1').eye === 'on' && by('led:0').eye === 'off' && by('led:1').sel, 'LED 노드 = 위치 순 번호 · 눈 · 선택');
  okL(by('led:0').strike && by('led:0').badge === '빛 끔', '빛 끈 LED = 취소선');
  okL(by('part:0').strike && !by('part:1').strike, '계산 제외 부품 = 취소선');
  okL(treeNodes(M0, { node: null, hidden: [], fold: { leds: true } }, undefined, rows).every((x) => !x.id.startsWith('led:')), 'LED 접기');
  okL(treeNodes(M0, { node: null, hidden: [] }, undefined, Array.from({ length: 31 }, (_, i) => ({ n: i, rank: i + 1, s: i }))).every((x) => !x.id.startsWith('led:')), 'LED 31개 = 처음엔 접힘');
  const H = treeHtml(M0, { node: null, hidden: [] }, undefined, rows);
  okL(/class="m3-node[^"]* untr"[^>]*data-node="part:0"/.test(H) && treeHead().includes('구성') && !treeHead().includes('설계 트리'), 'untr 클래스 · 제목 구성'); }
{ // 우클릭 빛 계산 제외(2026-11-02)
  const { untraceItem, treeCtxItems, viewCtxItems } = await import('../src/ui/m3/feature-tree.js');
  const okU = (c, m) => console.log(c ? `PASS ${m}` : (process.exitCode = 1, `FAIL ${m}`));
  const M1 = { parts: [{ name: 'A' }, { name: 'B', untrace: true }, { name: 'L', role: 'light' }], groups: [{ id: 'g', name: 'G', parts: [0, 1] }] };
  okU(untraceItem(M1, [0]).label === '빛 계산에서 제외' && untraceItem(M1, [0]).on === true, '포함 부품 = 제외');
  okU(untraceItem(M1, [1]).label === '빛 계산에 다시 포함' && untraceItem(M1, [1]).on === false, '제외 부품 = 다시 포함');
  okU(untraceItem(M1, [0, 1]).label === '선택한 부품 2개 빛 계산에서 제외' && untraceItem(M1, [0, 1]).on === true, '섞임 = 모두 제외');
  okU(untraceItem(M1, [2]) === null && untraceItem(M1, [0, 2]).ids.join() === '0', '광원 부품 제외 대상 아님');
  okU(treeCtxItems(M1, { node: 'part:1', multi: [] }, 'part:1').some((x) => x.k === 'untrace' && x.ids.join() === '1'), '트리 부품 우클릭');
  okU(treeCtxItems(M1, { node: 'group:g', multi: [] }, 'group:g').find((x) => x.k === 'untrace').ids.join() === '0,1', '트리 그룹 우클릭 = 그룹 전체');
  okU(viewCtxItems({ part: 0, untrace: untraceItem(M1, [0]) }).map((x) => x.k).join() === 'hide,only,untrace', '3D 부품 우클릭'); }
{ // 지난 최적화 후보(2026-11-07): 실행마다 정밀값이 있는 후보(최종안 + 재확인 대안, 겹침 제외)를 모아 균일도 순 표 · 고르면 적용
  const { histFromRun, mergeHist } = await import('../src/ui/m3/autodesign-panel.js');
  const { histTableHtml } = await import('../src/ui/m3/opt-dash.js');
  const v = (Ulen, Uwid, eff = 0.4) => ({ stats: { Ulen, Uwid }, eff });
  const d1 = { milky: 1, count: 29, rows: 2 }, d2 = { milky: 1, count: 30, rows: 2 }, d3 = { milky: 1, count: 28, rows: 2 };
  const res = { best: d1, verified: v(0.72, 0.86), steps: [{ stage: 'ledsVerify', tried: [{ design: d3, verified: v(0.67, 0.86) }, { design: d1, verified: v(0.72, 0.86) }, { design: d2, verified: v(0.73, 0.85), clash: true }] }] };
  const lab = (d) => `${d.rows}열 × ${d.count}`, r = { clash: 0 };
  const h = histFromRun(res, r, '10:00', lab);
  ok(h.length === 2 && h[0].kind === 'final' && h[0].label === '2열 × 29' && h.some((e) => e.label === '2열 × 28') && !h.some((e) => e.label === '2열 × 30') && h[0].r === r, `후보 모음: 최종 + 대안, 겹침·중복 제외 (${h.map((e) => e.label).join(', ')})`);
  ok(histFromRun({ ...res, unchanged: true, steps: [] }, r, 't', lab).length === 0 && histFromRun(res, { clash: 2 }, 't', lab).every((e) => e.kind !== 'final'), '현재안 유지·겹친 최종안은 빼기');
  const all = mergeHist(h, histFromRun({ best: { milky: 2 }, verified: v(0.81, 0.82) }, r, '10:05', () => 'Milky 2'));
  ok(all.length === 3 && all[all.length - 1].label === 'Milky 2', '실행마다 이어 붙임');
  const t = histTableHtml(all, 0.8, 0.8, false), i81 = t.indexOf('Milky 2'), i72 = t.indexOf('2열 × 29'), i67 = t.indexOf('2열 × 28');
  ok(i81 > 0 && i81 < i72 && i72 < i67 && /data-hpick="2"/.test(t) && /균일도 순/.test(t) && /od-ok/.test(t), '균일도 순 표 · 통과 표시 · 적용 단추(원래 번호)');
  { const tie = [{ label: 'A', Ulen: 0.789, Uwid: 0.418, eff: 0.3 }, { label: 'B', Ulen: 0.838, Uwid: 0.412, eff: 0.3 }], tt = histTableHtml(tie, 0.8, 0.8, false);
    ok(tt.indexOf('>B') < tt.indexOf('>A'), '표시값(내림)이 같으면 다른 균일도가 높은 안이 위'); }
  ok(/disabled/.test(histTableHtml(all, 0.8, 0.8, true)) && histTableHtml([], 0.8, 0.8, false) === '', '실행 중엔 적용 막음 · 후보 없으면 표 없음'); }
{ // 결과 화면(2026-11-08): 판정 한 줄 · 변화 카드 3개(이전 → 이후, 막대) · 무엇을 바꿔서 얼마나(항목별 효과 ≈) · 단추 · 접힌 상세
  const { resultViewHtml, stageEffects } = await import('../src/ui/m3/autodesign-panel.js');
  const r = { feasible: false, reason: '목표 미달 · 한계: 폭 방향 — 폭 가장자리가 가장 어두움', targets: { len: 0.8, wid: 0.8 }, stages: { shape: true, milky: true },
    cur: { milky: 2, Ulen: 0.65, Uwid: 0.62, eff: 0.433 }, best: { milky: 3.6, Ulen: 0.75, Uwid: 0.77, eff: 0.549 }, shape: { dt: 2, h: 0, R: 0.9 } };
  const eff = stageEffects({ shape: { Ulen: 0.7, Uwid: 0.74 }, milky: { Ulen: 0.72, Uwid: 0.75 } }, r.cur, r.best);
  ok(Math.abs(eff.shape.dl + eff.milky.dl - 0.1) < 1e-9 && Math.abs(eff.shape.dw + eff.milky.dw - 0.15) < 1e-9 && eff.shape.dl > eff.milky.dl, `항목 효과 합 = 전체 변화(배분): ${JSON.stringify(eff)}`);
  const h = resultViewHtml(r, { effects: eff, hist: [{ label: 'Milky 3.6', Ulen: 0.75, Uwid: 0.77, eff: 0.5 }] });
  ok(h.includes('목표 미달') && (h.match(/rs-card/g) ?? []).length >= 3 && h.includes('65.0%') && h.includes('75.0%') && h.includes('▲10.0%p'), '판정 · 카드(이전 → 이후 ▲)');
  { const { factorResult } = await import('../src/ui/m3/autodesign-panel.js'), F = (k) => factorResult(r, eff, {}, k);
    ok(!h.includes('class="rs-fb ') && F('shape').chg && F('milky').chg && F('milky').body.includes('3.60') && /길이 \+\d+\.\d%p/.test(F('milky').eff) && !F('position').chg && F('position').chip === '안 돌림', '결과 = 설계 인자 상자 자리에(이전 → 이후 · 효과 · 상태)'); }
  ok(h.includes('data-ad="apply"') && h.includes('data-ad="hpick" data-v="0"') && h.includes('지난 후보') && !h.includes('<details'), '적용 · 지난 후보(접지 않음)');
  { const many = Array.from({ length: 6 }, (_, i) => ({ label: `M${i}`, Ulen: 0.7 + i * 0.01, Uwid: 0.7, eff: 0.5 })), hm = resultViewHtml(r, { hist: many }), h1 = resultViewHtml(r, { hist: many.slice(0, 1) });
    ok((hm.match(/data-ad="hpick"/g) ?? []).length === 6 && hm.includes('6개') && !hm.includes('data-ad="histAll"') && hm.includes('rs-histt') && h1.includes('rs-histt') && hm.includes('<colgroup>'), '지난 후보: 같은 크기 표(고정 높이 · 넘치면 스크롤 · 열 폭 고정)'); }
  { const { clip } = await import('../src/ui/m3/autodesign-panel.js'); ok(clip('가'.repeat(30), 10).includes('…') && clip('가'.repeat(30), 10).includes('title=') && clip('짧음', 10) === '짧음', '긴 글 = … + 전체는 마우스'); }
  ok((h.replace(/\stitle="[^"]*"/g, '').match(/한계/g) ?? []).length === 1, '한계 한 번만(화면에 보이는 글 기준 — 전체 설명은 마우스)');
  const a = resultViewHtml(null, { applied: { ...r, at: '13:57' } });
  ok(a.includes('적용됨') && a.includes('13:57') && a.includes('data-ad="revert"') && !a.includes('data-ad="apply"'), '적용 뒤: 적용됨 · 되돌리기');
  { const { factorResult } = await import('../src/ui/m3/autodesign-panel.js'); ok(/효과 ≈/.test(factorResult({ ...r, at: '13:57' }, eff, {}, 'shape').eff), '적용 뒤에도 항목별 효과'); } }
{ // 광분포 진행 그래프 안내선(2026-11-08): 오차·균일도 둘 다 가로·세로 안내선 + 눈금 글
  const { simPlotSvg, simCaption } = await import('../src/ui/m3/opt-dash.js');
  const H = [{ ph: 1e6, noise: 0.04, Ulen: 0.5, Uwid: 0.6 }, { ph: 4e6, noise: 0.02, Ulen: 0.7, Uwid: 0.75 }], svg = simPlotSvg(H, 0.01, { targetLen: 0.8, targetWid: 0.8 }, 600, 160);
  const parts = svg.split('<svg').slice(1), gl = (s, v) => (s.match(new RegExp(`class="od-gl ${v}"`, 'g')) ?? []).length;
  ok(parts.length === 2 && parts.every((s) => gl(s, 'h') >= 2 && gl(s, 'v') >= 2), `두 그래프 모두 가로·세로 안내선: ${parts.map((s) => `${gl(s, 'h')}/${gl(s, 'v')}`)}`);
  ok(/text-anchor="middle">[0-9,]+만</.test(svg), '세로 안내선 눈금 = 광선 수');
  ok(simCaption(H, 0.01, {}, 'done') === '광선 400만 / 총 400만', '광선 수 글'); }
{ // 관측면 우클릭(2026-11-08): 트리 '관측면' 행 · 3D 관측면 위 → 보이기/감추기
  const { treeCtxItems, treeHasCtx, viewCtxItems } = await import('../src/ui/m3/feature-tree.js');
  const M = { parts: [{}, {}] };
  const t1 = treeCtxItems(M, {}, 'obs', { obsOn: true }), t0 = treeCtxItems(M, {}, 'obs', { obsOn: false });
  const v1 = viewCtxItems({ part: 1, obsHit: true, obsOn: true }), v0 = viewCtxItems({ part: null, obsOn: false }), vn = viewCtxItems({ part: 1, obsHit: false, obsOn: true });
  const ok = treeHasCtx('obs') && t1[0]?.k === 'obsShow' && t1[0].label === '관측면 감추기' && t0[0]?.label === '관측면 보이기'
    && v1[0]?.k === 'obsShow' && v1[0].label === '관측면 감추기' && v0.some((x) => x.k === 'obsShow' && x.label === '관측면 보이기') && !vn.some((x) => x.k === 'obsShow');
  console.log(ok ? 'PASS 관측면 우클릭: 트리 · 3D 에서 보이기/감추기' : (process.exitCode = 1, `FAIL 관측면 우클릭 ${JSON.stringify([t1, t0, v1, v0, vn])}`)); }
{ // three.js 는 불투명 목록을 먼저, 투명 목록을 나중에 그린다 — 색지도가 불투명 목록이면 renderOrder 와 상관없이 투명 부품(확산판)이 위를 덮어 분포가 안 보임
  const { readFileSync } = await import('node:fs'), view = readFileSync(new URL('../src/ui/mech3d-view.js', import.meta.url), 'utf8');
  const mat = view.match(/obsMesh = new THREE\.Mesh\(g, new THREE\.MeshBasicMaterial\(\{([^}]*)\}/)?.[1] ?? '';
  console.log(/transparent:\s*true/.test(mat) ? 'PASS 관측면 색지도: 투명 부품 위에 그림' : (process.exitCode = 1, `FAIL 관측면 색지도 재질 ${mat}`)); }
{ // 구성 트리(2026-11-12 화면 다시 그리기 3단계): 관측면·부품·광원 = 같은 단계 묶음(아이콘·개수) · 광원은 처음 접힘(접혀도 LED 개수 보임)
  const okG = (c, m) => console.log(c ? `PASS ${m}` : (process.exitCode = 1, `FAIL ${m}`));
  const { treeNodes: tn, treeHtml: th, treeHead: hd } = await import('../src/ui/m3/feature-tree.js');
  const N = tn(M, { node: null, line: { kind: 'line', closed: false, length: 116, width: 16 } });
  const top = N.filter((n) => n.grp0);
  okG(top.map((n) => n.id).join() === 'obs,parts,light' && top.every((n) => n.icon && !n.child), `같은 단계 묶음: ${top.map((n) => n.id).join()}`);
  okG(N[0].label === '관측면' && !N.some((n) => n.top), '관측면 이름에 기호 없음 · 밑줄 구분 없음');
  const lt = N.find((n) => n.id === 'light');
  okG(lt.fold === 'closed' && !N.some((n) => n.id === 'leds') && /LED ×10/.test(lt.badge), `광원 처음 접힘 · 배지에 개수: ${lt.badge}`);
  const open = tn(M, { node: null, line: null, fold: { light: false } });
  okG(open.some((n) => n.id === 'leds') && !/LED ×/.test(open.find((n) => n.id === 'light').badge), '펼치면 LED 줄이 따로 보이고 배지엔 개수 없음');
  okG(tn(M, { node: 'leds', line: null }).some((n) => n.id === 'leds'), 'LED 를 고르면(3D·트리) 광원이 접혀 있어도 펼쳐 보임');
  const H = th(M, { node: null, line: null });
  okG(/m3-node[^"]* g0[^"]*"[^>]*data-node="obs"/.test(H) && /class="m3-gi[^"]*"/.test(H) && hd().includes('구성'), 'HTML: 묶음 줄(g0) · 아이콘 · 제목 구성');
}
{ // 결과 요약 카드 종합 판정(2026-11-12 화면 다시 그리기 5단계) — judgeText 를 그대로 묶음(숫자·판정 규칙 안 바뀜)
  const okV = (c, m) => console.log(c ? `PASS ${m}` : (process.exitCode = 1, `FAIL ${m}`));
  const { overallVerdict } = await import('../src/ui/m3/results-panel.js'), O = { targetLen: 0.8, targetWid: 0.8 };
  okV(overallVerdict({ Ulen: 0.85, Uwid: 0.9, relNoise: 0.01 }, O).cls === 'ok' && /통과/.test(overallVerdict({ Ulen: 0.85, Uwid: 0.9, relNoise: 0.01 }, O).text), '둘 다 합격 = 목표 통과');
  okV(overallVerdict({ Ulen: 0.5, Uwid: 0.9, relNoise: 0.01 }, O).cls === 'bad' && /미달/.test(overallVerdict({ Ulen: 0.5, Uwid: 0.9, relNoise: 0.01 }, O).text), '하나라도 미달 = 목표 미달');
  okV(overallVerdict({ Ulen: 0.5, Uwid: 0.5, relNoise: 0.2 }, O).cls === 'busy', '노이즈 큼 = 판정 보류');
  okV(overallVerdict({ Ulen: 0.85, Uwid: null, relNoise: 0.01 }, O).cls === 'ok', '폭 판정 불가 = 길이로만');
  okV(overallVerdict(null, O).cls === '' && overallVerdict({ empty: true }, O).text === '', '결과 없음 = 배지 없음');
  const a = overallVerdict({ Ulen: 0.79999, Uwid: 0.9, relNoise: 0.001 }, O), b = judgeText(0.79999, 0.8, null, 0.001);
  okV(a.cls === b.cls, `경계값도 judgeText 와 같은 판정(${a.cls} / ${b.cls})`);
}
{ // 아래 상태줄 시뮬레이션 상태 글(2026-11-12 화면 다시 그리기 6단계) — 예전 시뮬레이션 카드 글 그대로
  const okS = (c, m) => console.log(c ? `PASS ${m}` : (process.exitCode = 1, `FAIL ${m}`));
  const { simStateText } = await import('../src/ui/m3/opt-dash.js');
  okS(simStateText('running') === '계산 중' && simStateText('paused', '', true) === '중지됨' && simStateText('paused') === '일시정지', '계산 중 · 중지됨 · 일시정지');
  okS(simStateText('done', 'converged') === '계산 완료 — 노이즈 충분히 작음' && simStateText('done', 'adopted') === '계산 완료 — 기구 최적화 최종 판정 값' && simStateText('done', 'limit') === '계산 한도 도달 — 노이즈가 아직 큼', '완료 이유별 글');
  // '목표'는 균일도 판정에만(2026-11-12 평가: "완료 — 목표 정확도 도달" 옆 "✕ 목표 미달" 이 헷갈림)
  okS(['converged', 'adopted', 'limit'].every((r) => !/목표|미달/.test(simStateText('done', r))), '계산 상태 글에 목표·미달 없음');
  const { simCtl, optCtl } = await import('../src/ui/m3/run-ctl.js');
  okS(simCtl({ state: 'done' }).runLabel === '▶ 시뮬레이션 실행' && optCtl({}).runLabel === '▶ 최적화 시작' && optCtl({ running: true, paused: true }).runLabel === '▶ 최적화 이어서', '실행 단추 이름 = 무엇을 실행하는지');
  okS(simStateText('running', '', false, true) === '기구 최적화 중 — 일시정지(끝나면 이어서)' && simStateText('') === '', '기구 최적화 중 · 상태 없음');
}
{ // 판정 배지 옆 '다음 할 일' 단추(2026-11-12) — 미달·근처 = 기구 최적화 창, 통과 = 크게 보기, 계산 중·결과 없음 = 없음
  const okN = (c, m) => console.log(c ? `PASS ${m}` : (process.exitCode = 1, `FAIL ${m}`));
  const { nextAction } = await import('../src/ui/m3/results-panel.js');
  okN(nextAction('bad')?.k === 'opt' && /기구 최적화/.test(nextAction('bad').label) && nextAction('near')?.k === 'opt', '미달·근처 → 기구 최적화로 개선');
  okN(nextAction('ok')?.k === 'big' && /크게/.test(nextAction('ok').label), '통과 → 크게 보기');
  okN(nextAction('busy') === null && nextAction('') === null, '계산 중·결과 없음 → 단추 없음');
}
{ // 최적화 창 큰 숫자 = 시작값 포함 '지금까지 최고'(2026-11-12 평가: 21.8% → 6.3% → 45.7% 로 흔들려 나빠지는 줄 앎) · 방금 시험한 후보는 작게
  const okK = (c, m) => console.log(c ? `PASS ${m}` : (process.exitCode = 1, `FAIL ${m}`));
  const { monitorHtml, STAGES } = await import('../src/ui/m3/opt-dash.js');
  const tiles = Object.fromEntries(STAGES.map(([k]) => [k, { status: 'off', evals: [] }])); tiles.milky = { status: 'run', frac: 0.4, evals: [] };
  const base = { tgLen: 0.8, tgWid: 0.8, before: { Ulen: 0.218, Uwid: 0.2 }, tiles };
  const big = (h) => [...h.matchAll(/class="om-v[^"]*">([^<]*)</g)].map((x) => x[1]);
  const a = monitorHtml({ ...base, seq: [{ k: 'milky', Ulen: 0.063, Uwid: 0.1 }] }, 5);
  okK(big(a)[0] === '21.8%' && big(a)[1] === '20.0%', `시작보다 나쁜 후보만 있으면 큰 숫자 = 시작값: ${big(a).join(' ')}`);
  okK(/방금 후보 6\.3%/.test(a), '방금 시험한 후보는 작은 글씨로');
  const b = monitorHtml({ ...base, seq: [{ k: 'milky', Ulen: 0.063, Uwid: 0.1 }, { k: 'milky', Ulen: 0.457, Uwid: 0.386 }, { k: 'milky', Ulen: 0.3, Uwid: 0.3 }] }, 9);
  okK(big(b)[0] === '≈45.7%' && /방금 후보 30\.0%/.test(b), `나은 후보가 나오면 그 값, 뒤에 나쁜 후보가 와도 유지: ${big(b).join(' ')}`);
  const c = monitorHtml({ ...base, seq: [{ k: 'milky', Ulen: 0.457, Uwid: 0.386 }], ended: true, endSec: 9, final: { Ulen: 0.44, Uwid: 0.38 } }, 9);
  okK(big(c)[0] === '44.0%' && !/방금 후보/.test(c), '끝나면 최종 판정 값, 방금 후보 글 없음');
}
{ // 최적화 뒤에도 미달 → 다음 할 일 안내(2026-11-12 평가) — 안 돌린 항목을 켜 보라고만(몰래 켜지 않음)
  const okT = (c, m) => console.log(c ? `PASS ${m}` : (process.exitCode = 1, `FAIL ${m}`));
  const { nextTryText } = await import('../src/ui/m3/autodesign-panel.js');
  const r = { feasible: false, stages: { milky: true }, best: { Ulen: 0.457, Uwid: 0.386 }, targets: { len: 0.8, wid: 0.8 } };
  const t = nextTryText(r);
  okT(/위치/.test(t) && /형상/.test(t) && !/Milky/.test(t) && /−34\.3%p/.test(t) && /−41\.4%p/.test(t), `안 돌린 위치·형상 + 남은 차이: ${t}`);
  okT(nextTryText({ ...r, stages: { leds: true, shape: true, milky: true } }) === '' && nextTryText({ ...r, feasible: true }) === '', '다 돌렸거나 통과면 안내 없음');
  okT(/형상/.test(nextTryText({ ...r, stages: { position: true, leds: true, milky: true } })) && !/위치/.test(nextTryText({ ...r, stages: { position: true, leds: true, milky: true } })), '위치를 돌렸으면 형상만');
}
{ const { nextAction } = await import('../src/ui/m3/results-panel.js');
  console.log(nextAction('bad', 0.98)?.label === '최적화 진행 중 98.0%' && nextAction('bad', 0.98).k === 'opt' && nextAction('ok', 0.5)?.k === 'big' ? 'PASS 최적화 도는 중 = 판정 옆 단추에 진행률' : (process.exitCode = 1, `FAIL 최적화 진행률 단추: ${JSON.stringify(nextAction('bad', 0.98))}`)); }
{ // 떠 있는 창은 상단 바(메뉴) 아래로만(2026-11-12 평가: 접은 최적화 창이 메뉴를 가림)
  const okW = (c, m) => console.log(c ? `PASS ${m}` : (process.exitCode = 1, `FAIL ${m}`));
  const { clampRect, fitRect } = await import('../src/ui/m3/monitor.js');
  okW(clampRect({ x: 100, y: 0, w: 400, h: 300 }, 1600, 900, 56).y === 56 && fitRect({ x: 100, y: 0, w: 400, h: 300 }, 1600, 900, 56).y === 56, '위 경계 = 상단 바 아래');
  okW(clampRect({ x: 100, y: 0, w: 400, h: 300 }, 1600, 900).y === 8, '위 경계를 안 주면 예전처럼 8');
  okW(fitRect({ x: 0, y: 0, w: 400, h: 2000 }, 1600, 900, 56).h <= 900 - 56 - 8, '높이도 상단 바 아래 공간에 맞춤');
  const { maxRect } = await import('../src/ui/m3/monitor.js'), m = maxRect?.(1600, 900, 96);   // 최적화 창 [⤢ 크게](2026-11-12 평가 5: 창이 작아 안에서 스크롤)
  { const { monStepsHtml } = await import('../src/ui/m3/monitor.js'), tx = (h) => (h ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), cur = (h) => h?.match(/class="now">([^<]*)</)?.[1];
    okW(typeof monStepsHtml === 'function' && tx(monStepsHtml('set')) === '설정 › 진행 › 결과' && cur(monStepsHtml('set')) === '설정'
      && tx(monStepsHtml('run')) === '설정 ✓ › 진행 › 결과' && cur(monStepsHtml('run')) === '진행'
      && tx(monStepsHtml('result')) === '설정 ✓ › 진행 ✓ › 결과' && cur(monStepsHtml('result')) === '결과' && !/<button/.test(monStepsHtml('run')),
      `최적화 창 = 탭 대신 단계 표시(누르는 단추 아님): ${tx(monStepsHtml?.('result'))}`); }
  okW(m && m.x === 8 && m.y === 96 && m.w === 1584 && m.h === 900 - 96 - 8, `크게 = 상단 바·단계 막대 아래 화면 전체: ${JSON.stringify(m)}`);
}
{ // 최종 판정(몇 분)에도 남은 시간 — 90초 넘으면 분 단위(2026-11-12 평가: 검증 2~3분 동안 남은 시간 없음)
  const { etaText } = await import('../src/ui/m3/autodesign-panel.js');
  console.log(etaText(120000, 0.5) === '남은 약 2분' && etaText(60000, 0.5) === '남은 약 60초' ? 'PASS 남은 시간 분 단위' : (process.exitCode = 1, `FAIL 남은 시간 분 단위: ${etaText(120000, 0.5)}`));
  const { readFileSync } = await import('node:fs'), app = readFileSync(new URL('../src/ui/m3/app.js', import.meta.url), 'utf8');
  console.log(!/\/몇 분\/\.test\(text\) \? ''/.test(app) ? 'PASS 몇 분 걸리는 단계에도 남은 시간 표시' : (process.exitCode = 1, 'FAIL 몇 분 단계에서 남은 시간을 숨김'));
}
{ // 실행 중 큰 숫자 = 대략값 안내(2026-11-12 평가: 실행 중 51.3/37.7 → 최종 53.6/46.1 이유 없음)
  const { monitorHtml, STAGES } = await import('../src/ui/m3/opt-dash.js');
  const tiles = Object.fromEntries(STAGES.map(([k]) => [k, { status: 'off', evals: [] }])); tiles.milky = { status: 'run', frac: 0.4, evals: [] };
  const base = { tgLen: 0.8, tgWid: 0.8, before: { Ulen: 0.2, Uwid: 0.2 }, tiles, seq: [{ k: 'milky', Ulen: 0.5, Uwid: 0.4 }] };
  const run = monitorHtml(base, 5), end = monitorHtml({ ...base, ended: true, endSec: 9, final: { Ulen: 0.53, Uwid: 0.46 } }, 9);
  console.log(/om-kpi" title="[^"]*대략값[^"]*정밀 재계산/.test(run) && /목표에 더 모자란/.test(run) && !/om-kpi" title=/.test(end) ? 'PASS 실행 중 큰 숫자 = 대략값 · 최고 기준 안내' : (process.exitCode = 1, 'FAIL 대략값 안내'));
}
{ // 항목 카드 한 줄 설명(2026-11-12 평가: 무엇을 얼마나 바꾸는지 없음)
  const { factorBoardHtml, STAGES } = await import('../src/ui/m3/opt-dash.js');
  const tiles = Object.fromEntries(STAGES.map(([k]) => [k, { status: 'off', evals: [] }]));
  const h = factorBoardHtml({ tgLen: 0.8, tgWid: 0.8, tiles }, { on: {} }, (k) => ({ on: true, box: `<input type="checkbox" data-ad="${k}">`, opt: '', why: '' }));
  const d = [...h.matchAll(/class="fb-i" title="([^"]*)"/g)].map((x) => x[1]);   // 설명 = ⓘ 에 마우스(2026-11-12)
  console.log(d.length === 3 && /LED/.test(d.join()) && /입광면/.test(d.join()) && /0~5/.test(d.join()) ? `PASS 항목 카드 설명 3개` : (process.exitCode = 1, `FAIL 항목 카드 설명: ${d.join(' | ')}`));
}
{ // 중지하면 돌던 항목 = '중지됨'(2026-11-12 평가: 중지 뒤에도 '진행 90.0%' 가 남음)
  const { stopTiles, factorBoardHtml, STAGES } = await import('../src/ui/m3/opt-dash.js');
  const tiles = Object.fromEntries(STAGES.map(([k]) => [k, { status: 'off', evals: [] }])); tiles.milky = { status: 'run', frac: 0.9, evals: [] }; tiles.position = { status: 'done', frac: 1, evals: [] };
  const S = { tgLen: 0.8, tgWid: 0.8, tiles }; stopTiles(S);
  const h = factorBoardHtml(S, { on: {} }, (k) => ({ on: true, box: '', opt: '', why: '' }));
  console.log(S.tiles.milky.status === 'stop' && /중지됨/.test(h) && !/진행 90/.test(h) && S.tiles.position.status === 'done' ? 'PASS 중지 = 돌던 항목 중지됨' : (process.exitCode = 1, `FAIL 중지 표시: ${S.tiles.milky.status}`));
}
{ // 적용 뒤에도 판정·참고 메모가 남음 · 적용한 후보는 '적용됨'(눌러도 같은 것 다시 적용 안 함)(2026-11-12 평가)
  const { resultViewHtml } = await import('../src/ui/m3/autodesign-panel.js');
  const applied = { at: '12:00 적용', feasible: false, stages: { milky: true }, cur: { Ulen: 0.2, Uwid: 0.2, eff: 0.18 }, best: { Ulen: 0.536, Uwid: 0.461, eff: 0.115 }, targets: { len: 0.8, wid: 0.8 }, reason: '' };
  const hist = [{ label: 'Milky 4.50', kind: 'final', Ulen: 0.536, Uwid: 0.461, eff: 0.115, applied: true }];
  const h = resultViewHtml(null, { applied, hist });
  console.log(/적용됨/.test(h) && /남은 차이/.test(h) && /광 효율 .*감소/.test(h) && /data-v="0" disabled/.test(h) ? 'PASS 적용 뒤 메모 유지 · 적용한 후보 단추 잠금' : (process.exitCode = 1, 'FAIL 적용 뒤 메모·후보 단추'));
}
{ // ⑤ 단계 글: 적용한 뒤 = '적용됨 · 목표 미달'(2026-11-12 평가: '필요 — 목표 미달' 로 돌아가 적용이 안 된 줄 앎)
  const { flowState } = await import('../src/ui/m3/command-bar.js'), M = { observe: { targetLen: 0.8, targetWid: 0.8 } };
  const f = flowState({ state: 'done' }, { Ulen: 0.536, Uwid: 0.461 }, M, { applied: true }), g = flowState({ state: 'done' }, { Ulen: 0.85, Uwid: 0.9 }, M, { applied: true });
  console.log(f.opt.text === '적용됨 · 목표 미달' && f.opt.cls === 'need' && g.opt.text === '적용됨 · 목표 통과' && g.opt.done ? 'PASS ⑤ 적용됨 표시' : (process.exitCode = 1, `FAIL ⑤ 적용됨: ${f.opt.text} / ${g.opt.text}`));
}
{ // 문구 정리(2026-11-12 평가): '버리기' → '적용 안 함', 일시정지 '조각' 없음
  const { readFileSync } = await import('node:fs'), pn = readFileSync(new URL('../src/ui/m3/autodesign-panel.js', import.meta.url), 'utf8'), ap = readFileSync(new URL('../src/ui/m3/app.js', import.meta.url), 'utf8');
  console.log(!/>버리기</.test(pn) && />적용 안 함</.test(pn) && !/조각까지만 받음/.test(ap) ? 'PASS 문구: 적용 안 함 · 조각 없음' : (process.exitCode = 1, 'FAIL 문구 정리'));
}
{ // 회색 작은 글 줄이기(2026-11-12 사용자: 정신없음) — 화면엔 짧은 요약, 긴 설명은 마우스를 올리면(title) · 설정으로 돌아가는 단추
  const okG = (c, m) => console.log(c ? `PASS ${m}` : (process.exitCode = 1, `FAIL ${m}`));
  const vis = (h) => h.replace(/\s(title|aria-label)="[^"]*"/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const { factorBoardHtml, monitorHtml, STAGES } = await import('../src/ui/m3/opt-dash.js');
  const tiles = () => Object.fromEntries(STAGES.map(([k]) => [k, { status: 'off', evals: [] }]));
  const fb = factorBoardHtml({ tgLen: 0.8, tgWid: 0.8, tiles: tiles() }, { on: {} }, (k) => ({ on: true, box: `<input type="checkbox" data-ad="${k}">`, opt: '', why: '' }));
  okG(!/class="fb-desc/.test(fb) && /title="LED 개수·간격/.test(fb) && !/LED 개수·간격/.test(vis(fb)) && (fb.match(/ⓘ/g) ?? []).length === 3, '항목 카드 설명 = ⓘ 에 마우스(화면엔 안 씀)');
  const t = tiles(); t.milky = { status: 'run', frac: 0.4, evals: [] };
  const run = monitorHtml({ tgLen: 0.8, tgWid: 0.8, before: { Ulen: 0.2, Uwid: 0.2 }, tiles: t, seq: [{ k: 'milky', Ulen: 0.5, Uwid: 0.4 }] }, 5);
  okG(!/om-kpi-note/.test(run) && /title="[^"]*대략값/.test(run) && /≈50\.0%/.test(vis(run)), `진행 중 큰 숫자 = ≈ 표시 + 설명은 마우스: ${vis(run).slice(0, 60)}`);
  const stop = monitorHtml({ tgLen: 0.8, tgWid: 0.8, before: {}, tiles: tiles(), seq: [], stopped: true }, 5);
  okG(/data-adset/.test(stop), '중지 뒤 = [설정 바꾸기] 단추');
  const { resultViewHtml } = await import('../src/ui/m3/autodesign-panel.js');
  const r = { feasible: false, reason: '목표 미달 · 한계: 폭 방향 — 폭 가장자리가 가장 어두움(가장자리 감쇠)', targets: { len: 0.8, wid: 0.8 }, stages: { milky: true },
    cur: { milky: 2, Ulen: 0.25, Uwid: 0.19, eff: 0.192 }, best: { milky: 3.48, Ulen: 0.551, Uwid: 0.127, eff: 0.148 }, peek: { cap: 5, rows: [] }, hint: { finish: { part: 1 }, text: '백색 95%', Ulen: 0.6, Uwid: 0.15, base: { Ulen: 0.552, Uwid: 0.122 } } };
  const h = resultViewHtml(r, { hist: [{ label: 'Milky 3.48', Ulen: 0.551, Uwid: 0.127, eff: 0.148 }] });
  const notes = [...h.matchAll(/<(?:div|button)[^>]*class="rs-note[^"]*"[^>]*>([\s\S]*?)<\/(?:div|button)>/g)].map((x) => vis(x[1]));
  okG(notes.length >= 3 && notes.every((n) => n.length <= 42) && /광 효율 −4\.4%p/.test(vis(h)) && /어두워짐/.test(h) && !/어두워짐/.test(vis(h)), `참고 줄 = 짧게(≤42자) · 긴 글은 마우스: ${notes.join(' | ')}`);
  okG(/한계: 폭 방향/.test(vis(h)) && !/가장자리 감쇠/.test(vis(h)) && !/골라서/.test(vis(h)) && /data-ad="toSet"/.test(h), `판정 한계 짧게 · 지난 후보 머리 설명 숨김 · [설정 바꾸기]: ${vis(h).slice(0, 120)}`);
}
{ // 기구 최적화 그래프 = 정밀 검증 결과(최종안·대안 — 지난 후보 표의 값)도 실시간으로(2026-11-13 사용자: 표에 있던 값이 그래프엔 없음)
  const okV = (c, m) => console.log(c ? `PASS ${m}` : (process.exitCode = 1, `FAIL ${m}`));
  const { pushEvals, factorChartSvg, monitorHtml, STAGES } = await import('../src/ui/m3/opt-dash.js');
  const S = { tgLen: 0.8, tgWid: 0.8, before: { Ulen: 0.3, Uwid: 0.3 }, tiles: Object.fromEntries(STAGES.map(([k]) => [k, { status: 'off', evals: [] }])), seq: [], log: [] };
  pushEvals(S, 'milky', [{ label: 'Milky 2', Ulen: 0.5, Uwid: 0.4 }]);
  pushEvals(S, 'final', [{ label: 'LED 8개', Ulen: 0.72, Uwid: 0.61 }]);
  pushEvals(S, 'final', [{ label: 'LED 10개', Ulen: 0.81, Uwid: 0.8, est: true }]);
  okV(S.seq.length === 3 && S.seq[1].k === 'verify' && S.seq[1].vf && S.verify.label === 'LED 10개' && S.tiles.milky.evals.length === 1, '검증 결과도 그래프 순서(seq)에 들어감 · 마지막 검증값 그대로');
  const g = factorChartSvg(S, S.before, 600, 170);
  okV((g.match(/class="od-vf/g) ?? []).length === 4 && /검증/.test(g) && /LED 8개 · 길이 72\.0%/.test(g), '그래프에 검증 점(길이·폭) · 검증 띠 · 마우스 값');
  const m = monitorHtml({ ...S, tiles: { ...S.tiles, milky: { status: 'run', frac: 0.5, evals: S.tiles.milky.evals } } }, 5);
  okV(/≈50\.0%/.test(m) && !/81\.0%/.test(m), '진행 지표(지금까지 최고)는 그대로 — 검증 점은 그래프에만');
}
