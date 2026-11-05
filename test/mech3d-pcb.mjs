// 도면 PCB 자동 인식·PCB 면 처리: node test/mech3d-pcb.mjs
import { findPcbParts, autoLedGroup } from '../src/engine/mech3d/led-detect.js';
import { defaultPart, setPartMaterial, syncPcb, setPcb, resolveFinish, PCB_FINISH } from '../src/engine/mech3d/materials.js';
import { transformMesh } from '../src/engine/mech3d/xform.js';
import { boxMesh, ok, done } from './mech3d-util.mjs';
import { stageAvailability } from '../src/ui/m3/autodesign-panel.js';
import { partBadge } from '../src/ui/m3/feature-tree.js';
import { pcbCardHtml } from '../src/ui/mech3d-panel.js';
import { ledPanelHtml, setLpTab } from '../src/ui/mech3d-light-panel.js';
import { defaultLight, defaultObserve, defaultChecks, migrateMech3d, SOLDER_R } from '../src/engine/mech3d/defs.js';
import { treeNodes } from '../src/ui/m3/feature-tree.js';
import { stepPcbHtml } from '../src/ui/mech3d-light-panel.js';

const led = boxMesh(-1, -1, 0, 2, 2, 1), at = (x, z = 0) => transformMesh(led, [x, 0, z], [0, 0, 0]);
const pcb = boxMesh(-40, -5, -1, 80, 10, 1), cover = boxMesh(-40, -5, 6, 80, 10, 3);

// --- LED STEP 파일 안의 PCB(2026-11-05, 기본 예제) — 부품 목록에 PCB 로 · 반사율 30% ---
{ ok(defaultLight().solder === '녹색' && SOLDER_R[defaultLight().solder] === 0.3, '새 프로젝트 PCB 면 기본 30%');
  const mig = (solder, extra = {}) => { const m = { light: { kind: 'step', solder, ...extra }, observe: {} }; migrateMech3d(m); return m.light.solder; };
  ok(mig('백색') === '녹색' && mig(undefined) === '녹색', '저장된 백색 80% → 30% 로 통일');
  ok(mig('흑색') === '흑색', '직접 고른 흑색은 그대로');
  ok(mig('백색', { pcbRev: 1 }) === '백색', '통일 뒤 사용자가 고른 백색은 그대로');
  const light = (o) => ({ ...defaultLight(), kind: 'step', step: { name: 'a.stp', leds: [1, 2], excluded: [], pcb: 0, emitters: [], ...o } });
  const M = { parts: [defaultPart(0, '부품 1', 5)], observe: defaultObserve(), groups: [], light: light({}) };
  const N = treeNodes(M, { node: 'steppcb', line: null }), n = N.find((x) => x.id === 'steppcb');
  ok(n && n.label === 'PCB' && /PCB 면 30%/.test(n.badge) && n.sel && n.child, `LED STEP PCB = 부품 목록의 PCB: ${n?.badge}`);
  ok(N.findIndex((x) => x.id === 'steppcb') < N.findIndex((x) => x.id === 'light'), '광원이 아니라 부품 쪽에');
  ok(N.find((x) => x.id === 'parts').badge === '2', '부품 개수에 포함');
  ok(!treeNodes({ ...M, light: light({ pcb: -1 }) }, {}).some((x) => x.id === 'steppcb'), 'PCB 를 못 찾은 LED STEP → 노드 없음');
  ok(!treeNodes({ ...M, light: light({ fromMech: [1, 2] }) }, {}).some((x) => x.id === 'steppcb'), '도면 광원 → 노드 없음(PCB 가 기구 부품)');
  ok(!treeNodes({ ...M, light: defaultLight() }, {}).some((x) => x.id === 'steppcb'), '광원 없음 → 노드 없음');
  ok(treeNodes({ ...M, light: { ...light({}), solder: '백색' } }, {}).find((x) => x.id === 'steppcb').badge.includes('80%'), '배지 = 지금 반사율');
  const h = stepPcbHtml(M);
  ok(/data-lp-solder/.test(h) && /녹색 30%/.test(h) && /백색 80%/.test(h) && /흑색 5%/.test(h) && /value="녹색" selected/.test(h), 'PCB 속성 = 반사율 선택');
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
  const u = setPcb([m, o[1], o[2]], 0, false)[0]; ok(u.faceFinish[3]?.kind === 'black' && u.reflMaterial === 'x' && u.name === '기판A', '해제 = 소재·면 처리·이름 복원'); }
{ const c = setPcb(base(), 1, true)[1]; ok(c.role === 'pcb' && c.material.kind === 'opaque' && setPcb([c], 0, false)[0].material.kind === 'clear', '수동 지정·해제(투명 부품도 복원)'); }
{ const Q = JSON.parse(JSON.stringify(syncPcb(base(), [0]))); ok(setPcb(Q, 0, false)[0].name === '기판A', '저장·복원 후에도 해제 가능'); }

// --- 화면 ---
{ const Q = syncPcb(base(), [0]);
  ok(partBadge(Q[0]) === 'PCB 면 30%', `트리 배지: ${partBadge(Q[0])}`);
  const a = stageAvailability({ parts: Q, light: { kind: 'manual', manual: {} } }, { non25: [0, 0, 0] });
  ok(!a.housing.parts.includes(0) && a.housing.parts.includes(2), '④ 케이스 면 후보에서 PCB 제외');
  ok(pcbCardHtml(Q[0]).includes('checked') && pcbCardHtml(Q[0]).includes('30%') && !pcbCardHtml(base()[0]).includes('checked') && pcbCardHtml({ role: 'light' }) === '', 'PCB 스위치 카드'); }
{ const ms = { name: 'x', parts: [], contacts: [], observe: defaultObserve(), checks: defaultChecks(), light: { ...defaultLight(), kind: 'step', step: { name: 'd', offset: [0, 0, 0], rot: [0, 0, 0], leds: [0], excluded: [], pcb: -1, emitters: [{ part: 0, pos: [0, 0, 0], axis: [0, 0, 1] }], fromMech: [0] } } };
  setLpTab('leds', 'detail');
  ok(!/data-lp-solder/.test(ledPanelHtml(ms, { node: 'leds' })), '도면 광원 = PCB 색 칸 없음(PCB 는 부품 소재로)'); setLpTab('leds', 'basic'); }
done();
