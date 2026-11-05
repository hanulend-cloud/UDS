// 도면 PCB 자동 인식·PCB 면 처리: node test/mech3d-pcb.mjs
import { findPcbParts, autoLedGroup } from '../src/engine/mech3d/led-detect.js';
import { defaultPart, setPartMaterial, syncPcb, resolveFinish, PCB_FINISH, setPcbR, pcbPickPlan, pcbNames, clampPcbPct } from '../src/engine/mech3d/materials.js';
import { transformMesh } from '../src/engine/mech3d/xform.js';
import { boxMesh, ok, done } from './mech3d-util.mjs';
import { stageAvailability } from '../src/ui/m3/autodesign-panel.js';
import { partBadge } from '../src/ui/m3/feature-tree.js';
import { pcbRCardHtml } from '../src/ui/mech3d-panel.js';
import { ledPanelHtml, setLpTab } from '../src/ui/mech3d-light-panel.js';
import { defaultLight, defaultObserve, defaultChecks, migrateMech3d } from '../src/engine/mech3d/defs.js';
import { treeNodes, treeCtxItems as viewCtxItems0 } from '../src/ui/m3/feature-tree.js';
import { pcbPanelHtml } from '../src/ui/mech3d-light-panel.js';

const viewCtxOf = (id) => viewCtxItems0({ parts: [], groups: [], light: { kind: 'step', step: {} } }, { node: id, multi: [] }, id);
const led = boxMesh(-1, -1, 0, 2, 2, 1), at = (x, z = 0) => transformMesh(led, [x, 0, z], [0, 0, 0]);
const pcb = boxMesh(-40, -5, -1, 80, 10, 1), cover = boxMesh(-40, -5, 6, 80, 10, 3);

// --- LED STEP 파일 안의 PCB(2026-11-05, 기본 예제) — 부품 목록에 PCB 로 · 반사율 30% ---
{ ok(defaultLight().pcbR === 0.3, '새 프로젝트 PCB 면 기본 30%');
  const mig = (solder, extra = {}) => { const m = { light: { kind: 'step', solder, ...extra }, observe: {} }; migrateMech3d(m); return m.light; };
  ok(mig('백색').pcbR === 0.3 && mig(undefined).pcbR === 0.3 && mig('녹색').pcbR === 0.3, '저장된 백색 80%(예전 기본)·녹색 → 30%');
  ok(mig('흑색').pcbR === 0.05 && mig('백색', { pcbRev: 1 }).pcbR === 0.8, '직접 고른 값(흑색·통일 뒤 백색)은 그대로');
  ok(mig(undefined, { pcbR: 0.42 }).pcbR === 0.42 && mig('백색').solder === undefined, '입력한 값 유지 · 예전 칸은 지움');
  const light = (o) => ({ ...defaultLight(), kind: 'step', step: { name: 'a.stp', leds: [1, 2], excluded: [], pcb: 0, emitters: [], ...o } });
  const M = { parts: [defaultPart(0, '부품 1', 5)], observe: defaultObserve(), groups: [], light: light({}) };
  const ids = (m, S = {}) => treeNodes(m, S).map((x) => x.id);
  const N = treeNodes(M, { node: 'pcbs', line: null }), h0 = N.find((x) => x.id === 'pcbs');
  ok(h0 && h0.label === 'PCB' && /PCB 면 30%/.test(h0.badge) && h0.depth === 1 && h0.sel && !ids(M).includes('steppcb'), `LED STEP PCB = PCB 한 줄: ${h0?.badge}`);
  ok(ids(M).indexOf('pcbs') < ids(M).indexOf('light'), '광원이 아니라 부품 쪽에');
  ok(N.find((x) => x.id === 'parts').badge === '2', '부품 개수에 포함');
  const none = treeNodes({ ...M, light: light({ pcb: -1 }) }, {});
  ok(/PCB 없음/.test(none.find((x) => x.id === 'pcbs')?.badge ?? ''), 'PCB 를 못 찾아도 메뉴는 있음 · 경고');
  ok(!ids({ ...M, light: defaultLight() }).includes('pcbs'), '광원·PCB 없음 → 메뉴 없음');
  ok(treeNodes({ ...M, light: { ...light({}), pcbR: 0.42 } }, {}).find((x) => x.id === 'pcbs').badge.includes('42%'), '배지 = 지금 반사율');
  const P2 = syncPcb([defaultPart(0, 'a', 5), defaultPart(1, 'b', 5), defaultPart(2, 'c', 5)], [1, 2]), M2 = { parts: P2, observe: defaultObserve(), groups: [{ id: 'g1', name: 'G', parts: [0, 1] }], light: light({ fromMech: [], pcb: -1 }) };
  const N2 = treeNodes(M2, {}), at = (id) => N2.findIndex((x) => x.id === id);
  ok(at('pcbs') > at('part:0') && at('part:1') > at('pcbs') && at('part:2') > at('part:1') && N2.find((x) => x.id === 'part:1').depth === 2 && N2.filter((x) => x.id === 'part:1').length === 1 && /2장/.test(N2.find((x) => x.id === 'pcbs').badge), '도면 PCB = PCB 메뉴 아래로(그룹에 있어도 한 번만)');
  const h = pcbPanelHtml(M, {});
  ok(/data-lp-pick="mpcb"/.test(h) && /type="number"[^>]*data-lp-pcbr/.test(h) && /value="30"/.test(h) && /PCB: LED STEP PCB/.test(h) && !/<select/.test(h), 'PCB 메뉴 = 수동 선택 + 반사율');
  const h2 = pcbPanelHtml(M2, {});
  ok((h2.match(/data-m3-pcbr/g) ?? []).length === 2 && /data-i="1"/.test(h2) && /data-i="2"/.test(h2) && !/data-lp-pcbr/.test(h2), '도면 PCB 별 반사율 입력');
  ok(/PCB 없음/.test(pcbPanelHtml({ ...M, light: light({ pcb: -1 }) }, {})) && /클릭 대기/.test(pcbPanelHtml(M, { pick: 'mpcb' })), '없으면 경고 · 대기 중 표시');
}

// --- 찾기 ---
{ const P = [pcb, cover, at(-20), at(0), at(20)], r = findPcbParts(P, [2, 3, 4]);
  ok(r.pcbs.join() === '0' && !r.rejected.length, `LED 받침 얇은 판 = PCB(${r.pcbs})`);
  ok(autoLedGroup(P)?.support === r.pcbs[0], '자동 선택의 받침 부품과 같음'); }
{ const P = [boxMesh(-40, -5, -8, 80, 10, 8), cover, at(-20), at(0)], r = findPcbParts(P, [2, 3]);
  ok(!r.pcbs.length && r.rejected[0]?.part === 0 && /8/.test(r.rejected[0].why), `케이스 바닥(두께 8 mm)에 바로 올린 LED → PCB 아님: ${r.rejected[0]?.why}`); }
{ const a = boxMesh(-40, -5, -1, 30, 10, 1), b = boxMesh(10, -5, -1, 30, 10, 1), P = [a, b, cover, at(-25), at(25)], r = findPcbParts(P, [3, 4]);
  ok(r.pcbs.join() === '0,1', `PCB 2장으로 나뉜 도면 → 둘 다(${r.pcbs})`); }
{ const P = [pcb, at(-20), at(20)], r = findPcbParts(P, [1, 2], { skip: new Set([0]) });
  ok(!r.pcbs.length, '관측면 부품은 PCB 가 아님'); }
{ const P = [pcb, at(-20, 5), at(20, 5)], r = findPcbParts(P, [1, 2]);
  ok(!r.pcbs.length, 'LED 가 떠 있으면 PCB 아님'); }
{ const tilt = (m) => transformMesh(m, [0, 0, 0], [35, 0, 0]), P = [tilt(pcb), tilt(at(-20)), tilt(at(20))], r = findPcbParts(P, [1, 2]);
  ok(r.pcbs.join() === '0', '기울어진 PCB 도 LED 방향 두께로 판단'); }
{ const P = [boxMesh(-0.8, -0.8, -0.5, 1.6, 1.6, 0.5), at(0), at(0, 0)], r = findPcbParts(P, [1, 2]);
  ok(!r.pcbs.length, 'LED 보다 작은 판은 PCB 아님'); }

// --- 부품 처리 ---
const base = () => { const c = setPartMaterial(defaultPart(1, '커버', 1), 'clear'); return [defaultPart(0, '기판A', 5), c, defaultPart(2, '하우징', 9)]; };
{ const Q = syncPcb(base(), [0]), p = Q[0];
  ok(Q.length === 3 && p.role === 'pcb' && p.name === 'PCB' && p.material.kind === 'opaque', '부품은 그대로 · 이름 PCB');
  ok(resolveFinish(p, 3).kind === 'whiteDiffuse' && resolveFinish(p, 3).R === 0.3 && PCB_FINISH.R === 0.3, 'PCB 면 = 확산 반사 30%');
  ok(Q[1].role === undefined && Q[2].finish.R !== 0.3, '다른 부품은 그대로');
  const P2 = syncPcb(Q, [2]);
  ok(P2[0].name === '기판A' && P2[0].role === undefined && P2[0].pcbOrig === undefined && P2[0].finish.R !== 0.3 && P2[2].role === 'pcb', 'PCB 가 바뀌면 이전 부품은 원래대로'); }
{ const Q = syncPcb(base(), [0, 2]); ok(Q[0].name === 'PCB 1' && Q[2].name === 'PCB 2', '여러 장 = 번호'); }
{ const Q = syncPcb(base(), [0]); Q[0] = { ...Q[0], finish: { kind: 'whiteDiffuse', R: 0.45 } };
  ok(syncPcb(Q, [0])[0].finish.R === 0.45, '다시 찾아도 사용자가 고친 반사율 유지'); }
{ const o = base(), f = { kind: 'black', R: 0.05 }; o[0].faceFinish = { 3: f }; o[0].reflMaterial = 'x';
  const m = syncPcb(o, [0])[0]; ok(!Object.keys(m.faceFinish).length && m.reflMaterial === undefined, '면별 처리·반사 소재를 비움(PCB 면 하나로)');
  const u = syncPcb([m, o[1], o[2]], [])[0]; ok(u.faceFinish[3]?.kind === 'black' && u.reflMaterial === 'x' && u.name === '기판A', '해제 = 소재·면 처리·이름 복원'); }
{ const c = syncPcb(base(), [1])[1]; ok(c.role === 'pcb' && c.material.kind === 'opaque' && syncPcb([c], [])[0].material.kind === 'clear', '지정·해제(투명 부품도 복원)'); }
{ const Q = JSON.parse(JSON.stringify(syncPcb(base(), [0]))); ok(syncPcb(Q, [])[0].name === '기판A', '저장·복원 후에도 해제 가능'); }

// --- 화면 ---
{ const Q = syncPcb(base(), [0]);
  ok(partBadge(Q[0]) === 'PCB 면 30%', `트리 배지: ${partBadge(Q[0])}`);
  const a = stageAvailability({ parts: Q, light: { kind: 'manual', manual: {} } }, { non25: [0, 0, 0] });
  ok(!a.housing.parts.includes(0) && a.housing.parts.includes(2), '④ 케이스 면 후보에서 PCB 제외');
  const src = (await import('node:fs')).readFileSync(new URL('../src/ui/mech3d-panel.js', import.meta.url), 'utf8');
  ok(!/data-m3-pcb\b|PCB 부품/.test(src), '부품 속성에 PCB 켜기·끄기 메뉴 없음'); }
// --- 반사율 입력 · 수동 선택(2026-11-05) ---
{ ok(clampPcbPct(42) === 0.42 && clampPcbPct(150) === 1 && clampPcbPct(-3) === 0 && clampPcbPct(0) === 0 && clampPcbPct(NaN) === null && clampPcbPct('') === null, '반사율 입력: % → 0~1, 빈칸·숫자 아님 = 무시');
  const Q = syncPcb(base(), [0]), p = setPcbR(Q[0], 0.42);
  ok(p.finish.R === 0.42 && p.finish.kind === 'whiteDiffuse' && p.role === 'pcb' && resolveFinish(p, 3).R === 0.42 && syncPcb([p], [])[0].name === '기판A', '도면 PCB 반사율 입력 · 해제하면 원래대로');
  const h = pcbRCardHtml(p);
  ok(/type="number"[^>]*data-m3-pcbr/.test(h) && /value="42"/.test(h) && pcbRCardHtml(base()[0]) === '' && pcbRCardHtml({ role: 'light' }) === '', 'PCB 부품에만 반사율 칸');
  const mk = (parts, step) => ({ parts, observe: { faces: [{ part: 1, face: 0 }] }, light: { kind: 'step', pcbR: 0.3, step } });
  const P = [{ name: '판' }, { name: '관측' }, { name: 'L', role: 'light' }, { name: 'PCB', role: 'pcb' }];
  ok(pcbPickPlan(mk(P, { fromMech: [2], leds: [] }), 0, 4).ids.join() === '0,3', '다른 부품 클릭 = PCB 추가');
  ok(pcbPickPlan(mk(P, { fromMech: [2], leds: [] }), 3, 4).ids.length === 0, 'PCB 다시 클릭 = 해제');
  ok(/LED/.test(pcbPickPlan(mk(P, { fromMech: [2], leds: [] }), 2, 4).err) && /관측/.test(pcbPickPlan(mk(P, { fromMech: [2], leds: [] }), 1, 4).err), 'LED·관측면 부품은 PCB 가 못 됨');
  const st = { leds: [1, 2], pcb: 0 };
  ok(pcbPickPlan(mk(P, st), 4 + 3, 4).stepPcb === 3 && pcbPickPlan(mk(P, st), 4 + 0, 4).stepPcb === -1 && /LED/.test(pcbPickPlan(mk(P, st), 4 + 1, 4).err), 'LED STEP 부품 클릭 = 그 파일의 PCB 바꾸기·해제 · LED 는 안 됨');
  ok(/기구 도면/.test(pcbPickPlan(mk(P, { ...st, virtual: { count: 2 } }), 4, 4).err) && /기구 도면/.test(pcbPickPlan(mk(P, { fromMech: [2], leds: [] }), 5, 4).err), '편집한 배치·도면 광원의 LED 몸체 = 도면 부품을 클릭하라고 안내');
  ok(pcbNames(mk(P, st)).join() === 'PCB,LED STEP PCB' && pcbNames(mk([{ name: 'a' }], { fromMech: [0], leds: [], pcb: -1 })).length === 0, 'PCB 이름 목록');
  const pan = ledPanelHtml({ parts: [{ name: 'a' }], observe: defaultObserve(), light: { ...defaultLight(), kind: 'step', step: { name: 'x', offset: [0, 0, 0], rot: [0, 0, 0], leds: [], excluded: [], emitters: [], pcb: -1 } } }, { pickOnly: true });
  ok(!/data-lp-pick="mpcb"/.test(pan), 'LED 지정 카드에는 PCB 수동 선택 없음');
  const items = (id) => viewCtxOf(id);
  ok(items('pcbs').some((x) => x.k === 'pcbClick') && !items('light').some((x) => x.k === 'pcbClick'), 'PCB 줄 우클릭 메뉴에 · 광원 메뉴에는 없음'); }
{ const ms = { name: 'x', parts: [], contacts: [], observe: defaultObserve(), checks: defaultChecks(), light: { ...defaultLight(), kind: 'step', step: { name: 'd', offset: [0, 0, 0], rot: [0, 0, 0], leds: [0], excluded: [], pcb: -1, emitters: [{ part: 0, pos: [0, 0, 0], axis: [0, 0, 1] }], fromMech: [0] } } };
  setLpTab('leds', 'detail');
  ok(!/data-lp-solder/.test(ledPanelHtml(ms, { node: 'leds' })), '도면 광원 = PCB 색 칸 없음(PCB 는 부품 소재로)'); setLpTab('leds', 'basic'); }
done();
