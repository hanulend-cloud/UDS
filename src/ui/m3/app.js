// 3D 기구 모드 화면(CAD식) — spec 2026-10-15 m3-cad-ui §2·§3.
// main.js 는 mount(ctx) / unmount() / setStatus(t) / flush() / isMounted() 만 부른다.
// 저장 상태 = ctx.mspec(spec.mech3d), 세션 상태 = store.session. 흐름: store.update(tag) → onChange(tag)
//   observe → 관측 라인 다시 인식 · 물리 태그 → 점진 계산 재시작 · 기하 점검 태그 → 점검 ①②③ · target → 판정만 다시. 모두 다시 그림.
// 점진 계산 갱신(1초마다)은 store 알림 없이 결과 패널·상태 띠·색지도만 다시 그린다(입력 중 속성 패널이 다시 그려지지 않게).
import { getMech3d, getLedMesh, setLedMesh, saveLedIDB, applyPartMods, redetectContacts } from '../../engine/mech3d/runtime.js';
import { createMonitor } from './monitor.js';
import { reportError } from '../error-log.js';
import { ledChange, ledDeltaText, ledDeltaXYZ, pitchOf } from './led-change.js';
import { installCommitInputs } from './commit-input.js';
import { createHistory } from './history.js';
import { mountSplit, mountColSplit } from './pane-split.js';
import { findLeds, supportPart, emitterFaceAway, autoLedGroup, autoStepLeds, findPcbParts } from '../../engine/mech3d/led-detect.js';
import { loadClear, saveClear, clearExportJson, clearImport, parseMaterialFile } from '../../model/material-io.js';
import { setPartMaterial, setPartMaterialParam, syncPcb, setPcbOff, pcbAllOff, setPcbR, pcbPickPlan, pcbNames, clampPcbPct, CLEAR_BASE, applyClearEntry, clearEntryFromForm, editClearEntry, syncClearParts } from '../../engine/mech3d/materials.js';
import { lineFromData, lightData, obsDirection } from '../../engine/mech3d/line.js';
import { tallyGeometry, tallyStats, autoCells } from '../../engine/mech3d/tally.js';
import { isUntraced } from '../../engine/mech3d/scene3d.js';
import { bounds } from '../../engine/mech3d/mesh.js';
import { runGeomChecks, checkInterference, boxTravel, checkLeak } from '../../engine/mech3d/checks.js';
import { createStore, PHYSICS, GEOM_CHECK, PERSIST_TAGS } from './store.js';
import { createProgressive } from './progressive.js';
import { createPool } from './pool.js';
import * as L from './leds.js';
import { buildObsOverlay, cellColors, extractFaces } from './colormap.js';
import { mountCommandBar } from './command-bar.js';
import { renderFeatureTree, toggleVisibility, viewKeep, togglePcb, makeGroup, ungroup, groupMembers, rangeSelect, removeFromGroups, viewCtxItems, showCtxMenu, toggleLed, ledFoldDefault, untraceItem } from './feature-tree.js';
import { mountSplitter, mountDockSplitter, mountFacSplitter } from './splitter.js';
import { createOptDash, createSimDash, simPct } from './opt-dash.js';
import { geomQuery, geomLimit, geomClash } from './geom-client.js';
import { renderPropertyPanel } from './property-panel.js';
import { optCtl, rerunAsk } from './run-ctl.js';
import { judgeStats } from '../../engine/mech3d/tally.js';
import { watchNumInputs } from './num-fit.js';
import { meshInfo, clearDbHtml, clearAddFormHtml, reflAddFormHtml, wireMaterialDb, dbFormState } from '../mech3d-panel.js';
import { isAdmin } from '../../model/admin.js';
import { renderAdvanced } from '../l2-advanced.js';
import { defaultRowGap, renderReflDb, setLpTab } from '../mech3d-light-panel.js';
import { positionsFromLayout, addPosition, alignPositions } from '../../engine/mech3d/led-edit.js';
import { createResultsPanel } from './results-panel.js';
import { renderStatusBar, leakText } from './status-bar.js';
import { createAdRunner, resumable } from './autodesign-run.js';
import { renderAutoPanel, seedFits, milkyTable, stageAvailability, clampCap, overallFrac, etaText, reusableCurrent, defaultHousingPart, applyDz, applyFinish, capDefault, nextFinish, finishText, shapeText, tileConfigHtml, AD_ITEMS } from './autodesign-panel.js';
import { ledHeightRange, heightCandidates, catalogOf, finishCandidatesFor, setReflMaterial, partFinishEdit } from '../../engine/mech3d/housing-led.js';
import { migrateFinishCatalog, reflectPatch, copyAsUser, entryFromForm, addSamples, parsePercents, uniqueReflId } from '../../model/reflect-db.js';
import { intersectRay } from '../../engine/mech3d/bvh.js';
import { runAutoDesign, shapeTotal, shapeBudget } from '../../engine/mech3d/autodesign.js';
import { milkyRows } from '../../engine/mech3d/milky-search.js';
import { candidateGrid } from '../../engine/mech3d/basis.js';
import { ledAtS, clampRowGap, rowGapOptions } from '../../engine/mech3d/placement.js';
import { virtualEmittersAt, stepRefEmitter } from '../../engine/mech3d/virtual-leds.js';
import { rw4 } from '../../engine/mech3d/layout-solver.js';
import { LOAD_LABEL } from '../../engine/shape/step-load-plan.js';
import { partLook } from './part-look.js';
import { caseKey, caseCand, caseFp, mergeCaseRows } from './shape-cases.js';
import { heightsFor, deformPart, refinedFor, minThickness, pathFromLine, swOnPath, ledEll, lineVarH, splineInput, partFrame, bumpCenters, fieldThickness, clampField, fieldRoom, lensCandidates, swingCandidates } from '../../engine/mech3d/shape-opt.js';
import { interferenceKeys, newInterference, travelDistance } from '../../engine/mech3d/clearance.js';
import { pacer } from '../../engine/mech3d/yield.js';
import { scaleMoveMesh, isIdentityXform } from '../../engine/mech3d/xform.js';
import { defaultChecks } from '../../engine/mech3d/defs.js';
import { validAdjust } from '../../engine/mech3d/led-adjust.js';
import { beamSpec, ledOfHit, ledClashItems, dropStaleAdjust, setLedAdjust } from './led-select.js';

const $ = (s) => document.querySelector(s);
const VIEWS = [['top', '평면 (XY)'], ['front', '정면 (XZ)'], ['side', '측면 (YZ)'], ['iso', '등각']];
let A = null;       // 마운트 상태 { ctx, store, pool, prog, view, results, cmd, ... }
let viewP = null;   // 3D 뷰는 한 번만 만든다(같은 캔버스에 WebGL 문맥을 다시 만들지 않음)
// 계산 Worker 풀도 한 번만 — 3D↔평판 전환·다시 마운트에도 유지(Worker 시작·L2 표 적재 수 초 방지). resetWorkers() 로만 종료.
// sceneKey 는 모듈 전체에서 이어지는 번호 — 유지된 Worker 의 장면 캐시가 다른 마운트의 같은 이름과 섞이지 않게
let pool = null, sceneSeq = 0;
function getPool(ctx) {
  pool ??= createPool({ dbLists: ctx.dbLists, l2Raw: ctx.l2Raw ?? (() => null), onStatus: (t) => setStatus(t), onGpu: gpuBadge });
  gpuBadge(pool.gpu());
  return pool;
}
export function resetWorkers() { pool?.killAll('계산 Worker 초기화'); }
// 시작 시 미리 띄우기(main.js — 3D 모드로 열 때 IndexedDB·화면 준비와 겹쳐 Worker 모듈·L2 표를 적재)
export function warmWorkers(ctx) { getPool(ctx).warm(); }

export const isMounted = () => !!A;
// 소재 DB 가 밖(파일 메뉴)에서 바뀜 — 계산 Worker 의 실측 DB 갱신 · 부품 측정 투명 소재 맞춤 · 다시 그림
export function materialsChanged(msg) {
  if (!A) return;
  pool?.setDb(A.ctx.dbLists());
  const list = loadClear();
  A.store.update('material', (m, x) => { for (const e of list) m.parts = syncClearParts(m.parts, e.id, e); x.status = msg; });
}
export function adminChanged() { if (A) A.store.update('session', (_, x) => { x.status = isAdmin() ? '관리자 모드 켬 — 소재 DB 관리·숫자 물성 칸이 보임' : '관리자 모드 끔'; }); }
export function setStatus(t) { if (/실패|오류|응답 없음|시간 초과/.test(t ?? '')) reportError('작업', t); A?.store.update('session', (_, s) => { s.status = t; }); }
// 오류 기록에 함께 남길 '그때 하던 일' — 최적화 단계 · 계산 상태 · 도면 크기 · 장치
export function errorContext() {
  if (!A) return '3D 화면 아님';
  const s = A.prog?.snapshot?.(), g = pool?.gpu?.(), M = A.store.mspec;
  let tris = 0; try { for (const p of getMech3d()?.parts ?? []) tris += p.triangles.length / 3; } catch { tris = 0; }
  return [A.ad?.running ? `기구 최적화: ${String(A.ad.running.text ?? '').replace(/ · 남은.*/, '')}` : '', `계산 ${s?.state ?? '–'}${s?.photons ? ` · 광선 ${Math.round(s.photons / 1e4)}만` : ''}`, `부품 ${M.parts.length}개 · 삼각형 ${tris.toLocaleString()}`, `화질 ${M.observe.quality ?? 'low'}`, g?.ok ? `GPU ${g.name ?? ''}` : 'CPU'].filter(Boolean).join(' / ');
}
export function flush() { A?.store.flush(); }
export function importLed(file) { if (!A) return; if (A.store.mspec.light.kind !== 'step') A.store.update('light', (m) => { m.light.kind = 'step'; }); importLedStep(file); }   // 예제 프로젝트 — LED STEP 을 코드에서 불러옴(같은 이름이면 저장된 기준 LED 로 재인식)
// 상단 메뉴(main.js) → 3D 명령. 3D 화면이 아니면 false
export function command(id) {
  if (!A) return false;
  const h = cmdHandlers(), st = A.store, click = (sel) => document.querySelector(sel)?.click();
  switch (id) {
    case 'view:top': case 'view:front': case 'view:side': case 'view:iso': click(`#m3-views [data-view="${id.slice(5)}"]`); break;
    case 'theme': click('#m3-views [data-theme-toggle]'); break;
    case 'fit': h.onFit(); break;
    case 'section': h.onSection(); break;
    case 'show-all': st.update('view', (_, x) => { x.hidden = []; x.hideLeds = false; x.hiddenLeds = []; x.hidePcb = false; }); break;
    case 'deselect': st.update('session', (_, x) => { x.sel = null; x.ledSel = null; x.pick = null; x.focusCheck = null; }); break;
    case 'led-pick': h.onLed(); break;
    case 'obs-pick': h.onObs(); break;
    case 'target': setLpTab('obs', 'basic'); st.update('session', (_, x) => { x.node = 'obs'; x.sel = null; x.ledSel = null; }); break;
    case 'calc': h.onToggleCalc(); break;
    case 'auto': adSetOpen(true); break;
    case 'export-mech': exportMechStep(); break;
    case 'undo': histStep('undo'); break;
    case 'redo': histStep('redo'); break;
    default: return false;
  }
  return true;
}
export const canUndo = () => !!A?.hist?.canUndo();
export const canRedo = () => !!A?.hist?.canRedo();
export const theme = () => { try { return localStorage.getItem('uds.m3.theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } };
// 3D 기구 STEP 내보내기 — 지금 부품 메쉬(크기·위치·형상 수정 반영)를 부품마다 솔리드로(삼각형 근사 — 수정 안 한 부품은 원본 STEP 이 더 정확)
let mechStepBusy = false;
function exportMechStep() {
  const rt = getMech3d();
  if (!rt || mechStepBusy) return;
  const nTri = rt.parts.reduce((t, p) => t + p.triangles.length / 3, 0), name = String(A.store.mspec.name ?? 'mech').replace(/\.(stp|step)$/i, '').replace(/[/\\:*?"<>|]/g, '_');
  const w = new Worker(new URL('../../export/assembly-step-worker.js', import.meta.url), { type: 'module' });
  mechStepBusy = true;
  const end = () => { w.terminate(); mechStepBusy = false; };
  setStatus(`3D 기구 STEP 생성 중… 부품 ${rt.parts.length}개 · 삼각형 ${nTri}개${nTri > 60000 ? ' — 많아서 오래 걸릴 수 있음' : ''}`);
  w.onmessage = (ev) => {
    if (ev.data.type === 'done') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ev.data.stepText], { type: 'application/step' })); a.download = `${name}-uds.stp`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); setStatus('3D 기구 STEP 내보내기 완료 (수정 반영 · 삼각형 근사)'); }
    else setStatus(`STEP 실패: ${ev.data.message}`);
    end();
  };
  w.onerror = (e) => { setStatus(`STEP 실패: ${e.message ?? e}`); end(); };
  w.postMessage({ meshes: rt.parts.map((p) => ({ positions: p.positions, triangles: p.triangles })) });
}
// 제목 옆 계산 장치 표시 — GPU 사용 중 / CPU 만(GPU 없음·실패). g = pool.gpu(): null = 확인 중
function gpuBadge(g) {
  if (g && !g.ok && g.error && g.error !== '설정에서 끔') reportError('GPU', g.error);
  const el = document.getElementById('gpu-badge'); if (!el) return;
  const cores = pool?.cpuWorkers?.() ?? Math.max(1, Math.min(15, (navigator.hardwareConcurrency ?? 4) - 1));
  el.hidden = false;
  el.className = `gpu-badge ${g?.ok ? 'on' : ''}`;
  el.textContent = !g ? 'GPU 확인 중…' : g.ok ? '⚡ GPU 사용' : 'CPU 계산';
  el.title = !g ? '계산 장치 확인 중' : g.ok ? `GPU 가속 사용 중: ${g.name ?? 'GPU'} + CPU ${cores}코어` : `GPU 사용 안 함${g.error ? ` (${g.error})` : ' (GPU 없음)'} — CPU ${cores}코어로 계산`;
}
globalThis.__m3 = () => A;   // 브라우저 점검용: __m3().prog.snapshot(), __m3().timing, __m3().checks

function getView() {
  viewP ??= import('../mech3d-view.js').then(({ createMech3dView }) => {
    const v = createMech3dView($('#mech3d-canvas'), { onPick: (s) => { if (A) onPick(s); }, onContext: (c) => { if (A) onViewContext(c); }, gizmo: $('#m3-axes'),
      onLost: () => { const n = getMech3d()?.combined?.partOf?.length ?? 0; reportError('3D 화면', `3D 화면 끊김 — 그래픽 메모리 부족으로 보임(삼각형 ${Math.round(n / 1e4)}만 개)`); setStatus(`3D 화면이 끊겨 도면이 안 보임 — 그래픽 메모리 부족으로 보임(삼각형 ${Math.round(n / 1e4)}만 개). 다른 프로그램·탭을 닫고 새로고침하세요`); } });
    const el = $('#m3-views');
    el.innerHTML = VIEWS.map(([k, t]) => `<button data-view="${k}">${t}</button>`).join('') + '<button type="button" data-fit title="지금 보이는 도면 전체를 창에 맞춤 — 보는 방향은 그대로 (F)">⤢ 맞춤</button><button type="button" data-xray aria-pressed="false" title="전체 부품 반투명 — 속 구조를 봄">투시</button><button type="button" data-paths aria-pressed="false" title="광경로 화살표 켜기/끄기">광경로</button><button type="button" data-theme-toggle aria-pressed="false"></button>';
    el.querySelector('[data-fit]').onclick = () => v.fitAll();
    el.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => { v.setView(b.dataset.view); A?.store.update('view', (_, s) => { s.view = b.dataset.view; }); }; });
    // 3D 배경 밝게/어둡게 — 보는 사람별 편의 설정(새로고침해도 유지)
    const tb = el.querySelector('[data-theme-toggle]'), vp = $('#mech3d-canvas').parentElement;
    const applyTheme = (t) => { v.setTheme(t); vp.dataset.theme = t; const wr = $('#mech3d-wrap'); if (wr) wr.dataset.theme = t; tb.textContent = t === 'dark' ? '☀ 밝게' : '☾ 어둡게'; tb.setAttribute('aria-pressed', String(t === 'dark')); tb.title = '3D 배경 밝게/어둡게'; };
    el.querySelector('[data-xray]').onclick = () => setXrayOn(!xrayOn());
    el.querySelector('[data-paths]').onclick = () => setPathsOn(!pathsOn());
    let t0 = 'light'; try { t0 = localStorage.getItem('uds.m3.theme') === 'dark' ? 'dark' : 'light'; } catch {}
    applyTheme(t0);
    tb.onclick = () => { const t = v.theme() === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('uds.m3.theme', t); } catch {} applyTheme(t); };
    return v;
  });
  return viewP;
}

// ---- 마운트 ----
// 반사 소재표 행 = 반사 소재 DB(없으면 기본 소재표)
const reflCat = () => catalogOf(A?.ctx.reflectDb?.() ?? null);
let monitor = null;   // ⑤ 기구 최적화 창 — 화면(DOM) 하나에 하나, 기구가 바뀌어도 유지
export async function mount(ctx) {
  installCommitInputs();
  mountSplitter(document.querySelector('.m3-main'));   // 좌·우 창 폭 끌어서 조절(한 번만 붙음)
  mountDockSplitter(document.querySelector('#m3-dock'), document.querySelector('#mech3d-wrap'));   // 아래 칸 높이 조절
  // ⑤ 기구 최적화 창(떠 있는 창) — 설계 인자 현황·기구 최적화 칸을 기본 화면에서 빼서 담음. 여닫기 = 명령줄 [5 기구 최적화]
  monitor ??= createMonitor({ host: $('#mech3d-wrap'), items: [$('#m3-factor'), $('#m3-dock')], onChange: (on) => { const b = document.querySelector('#m3-cmd [data-c="opt"]'); if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } if (on && A && !adState().open) adSetOpen(true); if (A) { renderMarkers(); adDetectPath(); } } });
  // 기구 최적화 창 안: 왼쪽 설계 인자 ↔ 오른쪽 실행·진행 폭 조절(가운데 세로 경계선 끌기, 보는 사람별)
  // 실행 줄·결과 카드(#m3-auto) = 왼쪽 설계 인자 바로 아래(2026-10-30) — 고르고 → 실행 → 결과를 한 칸에서, 오른쪽은 진행 모니터만
  if ($('#m3-auto') && $('#m3-auto').parentElement !== $('#m3-factor')) $('#m3-factor')?.appendChild($('#m3-auto'));
  mountColSplit($('#m3-factor')?.parentElement, { onChange: () => window.dispatchEvent(new Event('resize')) });   // 설계 인자 아래 칸 좌우 폭(2026-11-05)
  mountFacSplitter(document.querySelector('#m3-factor'), document.querySelector('.m3-left'));   // 왼쪽 맨 아래(부품 속성 밑) 설계 인자 현황 높이 조절
  if (A && A.ctx.mspec === ctx.mspec) { A.ctx = ctx; return; }   // 같은 기구 — 그대로
  unmount();
  const pool = getPool(ctx);
  pool.setDb(ctx.dbLists()); pool.warm();   // 첫 작업 전에 Worker 를 띄워 L2 표를 적재(이미 떠 있으면 소재 DB 만 갱신)
  applyPartMods(ctx.mspec.parts);   // 저장된 부품 크기·위치 조절을 장면에 반영
  const store = createStore(ctx.mspec, { persist: ctx.persist });
  L.resetLedCaches();
  rebuildMechLight(ctx.mspec);   // 도면 광원: 메쉬가 없으면(저장소 비워짐) 기구 도면에서 다시 복사
  const v0 = L.validateLedStep(ctx.mspec, store.session);   // main.js:982 의 시작 시 검증을 여기서
  if (v0.status) store.session.status = v0.status;
  if (v0.changed) ctx.persist();
  // 프로젝트 소재표(finishCatalog, §2.3d) → 반사 소재 DB 사용자 항목으로 한 번 이관(spec P4 §2.3e)
  if (ctx.mspec.finishCatalog != null && ctx.reflectDb?.()) {
    const { moved } = migrateFinishCatalog(ctx.mspec, ctx.reflectDb());
    store.session.status = moved.length ? `프로젝트 반사 소재표 → 반사 소재 DB 사용자 항목 ${moved.length}개로 옮김(${moved.map((x) => x.name).join(', ')})` : store.session.status;
    ctx.persist();
  }
  const a = A = { ctx, store, pool, view: null, meshShown: null, lineKey: '', Gc: null, obsShown: null, checks: {}, markKey: '', timing: { start: 0, first: null, noise5: null } };
  a.prog = createProgressive({ ports: pool.ports(), onUpdate: onCalc, opts: { targetNoise: ctx.mspec.observe.targetNoise ?? 0.01 } });
  a.results = createResultsPanel($('#m3-res'), { onNote: (t) => setStatus(t), onCalc: (k) => calcCtl(k), calcBusy: () => !!A?.ad?.running, onLeak: () => A.store.update('session', (_, s) => { s.focusCheck = s.focusCheck === 'leak' ? null : 'leak'; }), onBig: (node) => A?.simDash?.attach(node), fileName: () => String(A?.store?.mspec?.name ?? 'uds').replace(/\.(stp|step)$/i, ''), onQuality: (v) => A.store.update('observe', (m) => { m.observe.quality = v; }) });
  // 균일도 그래프 칸 = 창 왼쪽 아래(실행·결과 밑, 2026-11-05)
  let chartEl = $('#m3-odchart'); if (!chartEl) { chartEl = document.createElement('div'); chartEl.id = 'm3-odchart'; $('#m3-factor')?.appendChild(chartEl); }
  a.optDash = createOptDash($('#m3-optdash'), { chart: chartEl, config: (k) => (A?.tileState ? tileConfigHtml(k, A.tileState) : { on: false, html: '' }), onSel: (k, v) => adSel(k, v), onUnlock: (k) => adUnlock(k), board: $('#m3-factor'), now: () => (A ? factorNow() : {}) }); a.simDash = createSimDash($('#m3-simdash'), { onCtl: (k) => calcCtl(k) });
  // 오른쪽 맨 위 광분포 시뮬레이션 ↕ 아래 광량 분포: 경계선 끌어 높이 조절(2026-10-30, 보는 사람별)
  mountSplit([$('#m3-simdash'), $('#m3-res')], { key: 'uds.m3.simSplit', dir: 'col', min: 80, init: [1, 3], onChange: () => window.dispatchEvent(new Event('resize')) });   // 아래 칸 = 기구 최적화 · 오른쪽 맨 위 = 광분포 시뮬레이션(항상 보임, 계산 제어 단추)
  a.cmd = mountCommandBar($('#m3-cmd'), cmdHandlers());
  if (monitor?.isOpen()) $('#m3-cmd [data-c="opt"]')?.classList.add('on');
  a.unsub = store.subscribe(onChange);
  // 되돌리기(Ctrl+Z): 저장 상태 + 보기 켜기/끄기 + 고정 항목 — 바뀐 때만 한 칸
  rememberLedMesh();
  a.hist = createHistory({ capture: histCapture, restore: histRestore });
  a.unsubHist = store.subscribe((tag) => { if (HIST_TAGS.has(tag) && A === a) a.hist.note(); });
  a.keydown = onKey; window.addEventListener('keydown', onKey);
  const view = await getView();
  if (A !== a) return;   // 기다리는 사이 이탈
  a.view = view;
  view.setObsSurface(null); view.setCheckMarkers([]);
  renderAll();
  refreshLine();
  rerunGeomChecks();
  restartCalc();
}
export function unmount() {
  if (!A) return;
  const a = A; A = null;   // 먼저 비워서 cancel 의 onUpdate 가 그리지 않게
  a.ad?.runner?.cancel(); a.ad?.stepWorker?.terminate();
  a.results?.closeBig();   // 떠 있는 광량 분포 창 — 다른 프로젝트의 그림이 남지 않게
  $('#m3-auto').hidden = true;
  a.prog.dispose(); a.unsub(); a.unsubHist?.(); a.store.dispose();   // 풀은 유지(진행 중 청크는 ≤0.5초 — 끝나면 버려짐)
  window.removeEventListener('keydown', a.keydown);
  if (a.view) { a.view.setObsSurface(null); a.view.setCheckMarkers([]); a.view.setSection(null); }
  $('#m3-legend').hidden = true;
}

// ---- 변경 처리 ----
function onChange(tag) {
  if (!A) return;
  const M = A.store.mspec;
  // 기구 최적화: 물리 편집이면 실행 중 = 중지(스냅샷과 어긋남), 결과 표시 중 = 결과 지움(옛 값 기준)
  const ad = A.ad;
  if (ad && PHYSICS.has(tag)) {
    if (ad.caseSel) { ad.caseSel = null; ad.casePv = null; A.meshShown = null; }   // 형상 후보 미리보기는 지금 조건으로 만든 것
    if (ad.running && ad.runner && !ad.runner.stopped) { ad.runner.cancel(); A.store.session.status = '편집으로 기구 최적화를 중지함'; }
    else if (ad.result) { ad.result = null; A.meshShown = null; A.store.session.status = '값이 바뀌어 기구 최적화 결과를 지움'; }
  }
  if (tag === 'light') { const t = dropStaleAdjust(M.light); if (t) A.store.session.status = t; }   // 배치가 바뀌어 무효가 된 LED 개별 조정(spec §4a)
  if (tag === 'observe' || tag === 'material') refreshLine();   // material: 부품 크기·위치가 바뀌면 라인도 다시(키가 같으면 건너뜀)
  if (PHYSICS.has(tag)) restartCalc();
  if (tag === 'target') A.prog.setJudge({ obs: M.observe, targetNoise: M.observe.targetNoise ?? 0.01, fluxLm: M.light.spec.fluxLm ?? 0 });
  if (GEOM_CHECK.has(tag)) rerunGeomChecks();
  renderAll(tag);
}
// ---- 되돌리기·다시 실행(2026-11-02) ----
const HIST_TAGS = new Set([...PERSIST_TAGS, 'view']);
function rememberLedMesh() { const g = getLedMesh(); if (g?.name) (A.ledMeshes ??= new Map()).set(g.name, g); }   // 광원을 바꾼 뒤 되돌릴 때 쓸 LED 메쉬
function histCapture() {
  rememberLedMesh();
  const S = A.store.session;
  return JSON.stringify({ m: { ...A.store.mspec, viewState: undefined, shapeCases: undefined }, v: { hidden: S.hidden ?? [], hideLeds: !!S.hideLeds, hiddenLeds: S.hiddenLeds ?? [], hidePcb: !!S.hidePcb }, locked: Object.keys(A.ad?.locked ?? {}).sort() });
}
function histRestore(next, was) {
  const st = A.store, S = st.session, M = st.mspec, n = JSON.parse(next), w = JSON.parse(was);
  Object.assign(S, n.v);
  const ad = A.ad;
  if (ad && JSON.stringify(n.locked) !== JSON.stringify(w.locked)) {   // 최적화 [적용]을 되돌림 — 고정·[되돌리기] 도 함께
    for (const k of w.locked) if (!n.locked.includes(k)) { delete ad.locked?.[k]; adSel(k, true); }
    for (const k of n.locked) if (!w.locked.includes(k)) { ad.locked[k] = { at: Date.now() }; adSel(k, false); }
    ad.undo = null; ad.applied = null; ad.lastLock = null;
  }
  if (JSON.stringify(n.m) === JSON.stringify(w.m)) { st.update('view'); return; }   // 보기만 바뀜 = 계산 그대로
  // spec.mech3d 객체는 main.js 와 공유 — 같은 객체 안을 바꿔 넣음(불러오기와 같은 경로로 메쉬·광원 다시 맞춤)
  const cases0 = M.shapeCases;   // 형상 후보 표는 되돌리기 대상이 아님
  for (const k of Object.keys(M)) delete M[k];
  Object.assign(M, n.m);
  if (cases0) M.shapeCases = cases0;
  S.xfMsg = null; S.pick = null; S.multi = [];
  const want = M.light?.step?.name;
  if (want && getLedMesh()?.name !== want) {
    const g = A.ledMeshes?.get(want);
    if (g) setLedMesh(g.name, g.parts); else rebuildMechLight(M);
    if (A.ctx.canSave?.() !== false) saveLedIDB().catch(() => {});
  }
  L.resetLedCaches(); applyPartMods(M.parts); A.meshShown = null; A.geom = null;
  if (ad) { ad.result = null; if (ad.running && ad.runner && !ad.runner.stopped) ad.runner.cancel(); }
  st.update('target'); st.update('material');
}
function histStep(k) {
  const h = A?.hist; if (!h) return;
  if (!h[k]()) { setStatus(k === 'undo' ? '되돌릴 작업이 없음' : '다시 실행할 작업이 없음'); return; }
  setStatus(k === 'undo' ? '되돌림 (Ctrl+Y = 다시 실행)' : '다시 실행함');
  renderView(); renderAuto();
}
function setUntrace(it) {
  if (!it) return;
  A.store.update('material', (m) => { for (const i of it.ids) m.parts[i] = { ...m.parts[i], untrace: it.on || undefined }; });
}
function onKey(e) {
  // Ctrl+Z / Ctrl+Y(Ctrl+Shift+Z) — 어디서든. 입력칸에 고치던 글자가 있으면 그 칸의 되돌리기(브라우저 기본). 한글 입력 상태에서도 되게 e.code
  if (A && (e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'KeyZ' || e.code === 'KeyY')) {
    const t = e.target, editing = t.matches?.('input, textarea') && !['checkbox', 'radio', 'range'].includes(t.type) && t.value !== t.defaultValue;
    if (editing) return;
    e.preventDefault();
    histStep(e.code === 'KeyY' || e.shiftKey ? 'redo' : 'undo');
    return;
  }
  if (!A || e.target.closest?.('input, select, textarea')) return;
  if (e.key === 'Escape') A.store.update('session', (_, s) => { s.sel = null; s.ledSel = null; s.pick = null; s.focusCheck = null; });
  else if (e.key === 'f' || e.key === 'F') A.view?.fitAll();   // 맞춤(보는 방향 그대로)
}

// ---- 관측 라인 (main.js:266-282) — 관측면·방향이 바뀌면 Worker 0 에서 다시 인식 ----
async function refreshLine() {
  const st = A.store, O = st.mspec.observe, S = st.session, pool = A.pool, key = JSON.stringify([O.faces, O.dir, st.mspec.parts.map((p) => [p.xform ?? null, p.shapeMod ?? null])]);
  if (key === A.lineKey) return;
  A.lineKey = key; S.line = null; S.lineErr = '';
  if (!O.faces.length) return;
  const parts = L.rawParts(getMech3d().parts);
  try {
    const dir = O.dir ?? obsDirection(parts, O.faces);
    const r = await pool.call(pool.worker(0), { type: 'line', parts, faces: O.faces, dir });
    if (A?.store === st && key === A.lineKey) { S.line = lineFromData(r.lineData); afterLine(); }
  } catch (e) {
    if (A?.store === st && key === A.lineKey) { S.line = null; S.lineErr = `라인 인식 실패: ${e.message}`; afterLine(); }
  }
}
function afterLine() {
  const held = A.adSeedLine; A.adSeedLine = null;
  if (held && A.store.session.line && seedFits(held, geometry(tallyObs(A.store.mspec.observe, A.store.mspec.observe.dir ?? A.store.session.line.frame.d)))) { A.adSeed = held; A.adSeedSealed = false; }
  restartCalc(); rerunGeomChecks(); A.store.update('session');
}

// ---- 점진 계산 ----
// 집계 격자 인자(빈칸 = 자동) — tally.js 계약: cellS·cellW·winS(null = 자동). 구버전 obs.cell 은 쓰지 않음 (main.js:284)
const tallyObs = (O, dir) => ({ ...O, dir, cell: null, cellS: O.cellS ?? null, cellW: O.cellW ?? null, winS: O.winS ?? null });
// 집계 격자 — (라인, cellS, cellW, winS, 가장자리 제외) 별로 캐시(계산 ≈60ms). 색지도 덧그림도 같은 캐시에 (main.js:286-290)
function geometry(obs) {
  const S = A.store.session, key = JSON.stringify([obs.cellS, obs.cellW, obs.quality, obs.winS, obs.edgeExcl]);
  if (!A.Gc || A.Gc.line !== S.line || A.Gc.key !== key) A.Gc = { line: S.line, key, G: tallyGeometry(S.line, obs), overlay: null };
  return A.Gc.G;
}
// 디바운스가 끝날 때 부르는 작업 생성기 — 라인·광원이 없으면 null(안내), 직접 배치 오류는 던짐(계산 실패로 표시)
// 작업 생성(현재 또는 기구 최적화 후보 설계) — M: spec.mech3d(복사본 가능), mechParts: 기구 메쉬(형상 후보면 바뀐 부품 포함)
// 기구 최적화는 실행 시작 때 스냅샷(line·G·obs)을 넘김 — 실행 중 라인이 바뀌어도 같은 기준
export function jobFor(M, mechParts, { emitters = null, line = null, G = null, obs = null } = {}) {
  const ln = line ?? A.store.session.line;
  if (!ln) return null;
  const em = emitters ?? L.currentEmitters(M, ln);
  if (!em.length) return null;
  const o = obs ?? tallyObs(M.observe, M.observe.dir ?? ln.frame.d), g = G ?? geometry(o);
  const isStep = M.light.kind === 'step' && getLedMesh(), lay = isStep ? L.stepLayout(M, ln) : null, ms = JSON.parse(JSON.stringify(M));
  let ledParts = isStep ? L.rawParts(getLedMesh().parts) : null;
  // 가상 배치·개별 조정(spec §4a): 부품은 이미 월드 좌표 → composeScene 이 다시 변환하지 않게 offset·rot = 0, 번호는 그 배치 기준
  if (lay?.virtual || lay?.adjusted) {
    ledParts = L.rawParts(lay.parts);
    ms.light.step = { ...ms.light.step, offset: [0, 0, 0], rot: [0, 0, 0], leds: lay.leds, pcb: lay.pcb, excluded: lay.excluded, emitters: JSON.parse(JSON.stringify(lay.emitters)), virtual: null };
  }
  return {
    sceneKey: `s${++sceneSeq}`, G: g, obs: o, nLeds: em.length, fluxLm: M.light.spec.fluxLm ?? 0, maxPhotons: 4e8 * ({ mid: 2, high: 4 }[o.quality] ?? 1),   // 화질이 높을수록(칸 많음) 계산 한도도 — 오차 목표 1%(2%의 4배 광자)에 맞춰 4억 기준
    scene: { mechParts: L.rawParts(mechParts), mspec: ms, ledParts, lineData: lightData(ln), G: g, obs: o, emitters: em },
  };
}
// 속성 머리용 실제 메쉬 외곽·부피 — 메쉬 객체별 캐시(크기·위치·형상이 바뀌면 runtime 이 새 객체를 만듦)
const MESH_INFO = new WeakMap();
function partMeshInfo(i) {
  const m = getMech3d()?.parts?.[i];
  if (!m?.positions) return null;
  if (!MESH_INFO.has(m)) MESH_INFO.set(m, meshInfo(m));
  return MESH_INFO.get(m);
}
function makeJob() { return A ? jobFor(A.store.mspec, getMech3d().parts) : null; }
// 기구 최적화 중이면 미룸 — 점진 계산이 공유 Worker 에 장면을 보내면 실행이 '장면이 바뀜' 으로 실패. 끝나면 adRun 이 다시 부름
// 거친 메시로 먼저 연 동안(2026-11-06) — 판정 값이 거친 메시로 틀어지지 않게 계산·최적화를 막음. 정밀 메시가 오면 meshRefined
let refining = false;
export function setRefining(on) { refining = !!on; }
export const isRefining = () => refining;
// 반환 = 자동 인식한 LED 수(광원이 없을 때만 시도). 화면은 한 번만 다시 그림(LED 인식이 광원을 바꾸면 그 갱신이 곧 다시 그림)
export function meshRefined() {
  refining = false;
  if (!A) return null;
  A.rawShown = getMech3d()?.raw ?? A.rawShown;   // 같은 도면 — 카메라·숨김 유지
  A.geom = null; A.clashAsk = null; L.resetLedCaches();
  const n = A.store.mspec.light.kind === 'none' ? autoMechLight() : null;
  if (!n) A.store.update('material');   // 계산 시작 · 점검 다시 · 화면 다시 그림
  return n;
}
function restartCalc() {
  if (refining) { A.store.session.status = '정밀 메시를 만드는 중 — 끝나면 계산을 시작합니다'; return; }
  if (A.ad?.running) { A.ad.deferred = true; return; }
  if (A.adSeedSealed) { A.adSeed = null; A.adSeedSealed = false; }   // 적용 뒤에 또 바뀜 = 그 판정 값은 이제 맞지 않음
  A.timing = { start: 0, first: null, noise5: null }; A.prog.restart(makeJob, () => { const s = A.adSeed; A.adSeed = null; A.adSeedSealed = false; return s; });
}
function guidance(snap) {
  const M = A.store.mspec, S = A.store.session;
  if (snap.state === 'error') return `계산 실패: ${snap.error}`;
  if (!M.observe.faces.length) return '관측면을 지정하세요 — 명령 막대의 👁 관측면';
  if (!S.line) return S.lineErr || '관측 라인 인식 중…';
  if (snap.state === 'idle' && snap.reason === 'notReady') return '광원을 지정하세요 — 명령 막대의 💡 LED 지정';
  if (!snap.stats) return snap.state === 'pending' ? '' : '계산 시작 중…';
  if (snap.stats.empty) return '판정할 유효 셀이 없음 — 관측면이 너무 좁거나 가장자리 제외가 큼';
  return '';
}
function onCalc(snap) {
  if (!A) return;
  const S = A.store.session, M = A.store.mspec, T = A.timing, now = performance.now();
  S.calc = snap;
  if (snap.state === 'error') reportError('계산', `계산 실패: ${snap.error}`);
  if (snap.state === 'starting' && !T.start) T.start = now;   // 성능 기준(spec §6)은 장면 준비 시작부터
  if (T.start && snap.stats && T.first == null) T.first = (now - T.start) / 1000;
  if (T.start && snap.stats?.relNoise != null && snap.stats.relNoise <= 0.05 && T.noise5 == null) T.noise5 = (now - T.start) / 1000;
  updateLeakCheck(snap);
  A.results.update({ snap, observe: M.observe, message: guidance(snap), leds: ledSW(M, S.line), ledsOrig: (() => { const c = ledChangeNow(M, S.line); return c?.changed ? c.orig : []; })(), leak: leakText(A.checks.leak, M.parts.map((p) => p.name)) });
  A.simDash?.sample(snap, snap.targetNoise ?? M.observe.targetNoise ?? 0.01, M.observe, M.parts.map((p) => p.name), M.parts.length, !!adState().running, M.parts.flatMap((p, i) => (isUntraced(p) ? [i] : [])));
  drawLightPaths();
  adDetectPath();
  monitorSummary();
  paintObs(snap);
  A.cmd.update(S, M, snap.stats ?? null);
  renderStatus();
}
// 관측면 색지도: 격자가 바뀌면 덧그림 메쉬를 다시 만들고, 갱신마다 색만 바꾼다
function paintObs(snap) {
  const v = A.view, Gc = A.Gc, st = snap.stats;
  if (!v) return;
  if (!st || st.empty || !Gc || snap.G !== Gc.G) {
    if (A.obsShown && snap.state !== 'running' && snap.state !== 'done' && snap.state !== 'paused') { v.setObsSurface(null); A.obsShown = null; $('#m3-legend').hidden = true; }
    return;
  }
  if (A.obsShown !== Gc) {
    Gc.overlay ??= buildObsOverlay(getMech3d().parts, A.store.mspec.observe.faces, A.store.session.line, Gc.G);
    v.setObsSurface({ ...Gc.overlay, dir: A.store.session.line.frame.d });   // dir: 큰 모델에서 덧그림을 더 띄움(buildObsOverlay 와 같은 방향)
    A.obsShown = Gc; $('#m3-legend').hidden = false;
  }
  v.setObsColors(cellColors(Gc.overlay.cells, st.map, Gc.G.valid));
}

// ---- 설계 점검 ----
function rerunGeomChecks() {
  const M = A.store.mspec, S = A.store.session, rt = getMech3d();
  if (!rt) return;
  let emitters = [];
  try { emitters = L.currentEmitters(M, S.line); } catch { emitters = []; }
  // LED STEP 의 PCB(합친 장면 번호 = 기구 부품 수 + pcb)는 LED 몸체와 늘 맞닿으므로 간섭 검사에서 뺀다
  const pcb = M.light.kind === 'step' ? L.stepLayout(M, S.line)?.pcb ?? -1 : -1, exclude = pcb >= 0 ? [rt.parts.length + pcb] : [];
  Object.assign(A.checks, runGeomChecks({ rt, mspec: M, emitters, bodies: L.ledBodies(M, S.line), obsParts: new Set(M.observe.faces.map((f) => f.part)), beam: M.light.spec.beam, exclude }));
  refreshClash();
  renderMarkers(); renderStatus();
}
// 부품끼리 겹친 곳(2026-11-02) — 장면·계산 제외가 바뀔 때만 다시. 결과 = 3D 표식(renderMarkers) + 상태 띠 배지
function refreshClash() {
  const M = A.store.mspec, rt = getMech3d(), off = M.parts.map((p) => !!p.untrace || p.role === 'light'), k = off.join();
  if (A.clashAsk?.rt === rt && A.clashAsk.k === k) return;
  const ask = A.clashAsk = { rt, k };
  A.checks.clash = { status: 'na', count: 0, items: [] };
  geomClash(rt.parts.map((p, i) => (off[i] ? null : p))).then((r) => {
    if (!A || A.clashAsk !== ask) return;
    const items = r.clashes ?? [], nm = (i) => A.store.mspec.parts[i]?.name ?? `부품 ${i + 1}`;
    A.checks.clash = r.error ? { status: 'na', count: 0, items: [] } : { status: items.length ? 'bad' : 'ok', count: items.length, items, names: items.map((c) => `${nm(c.a)} – ${nm(c.b)} ${c.depth.toFixed(2)} mm`).join('\n') };
    renderMarkers(); renderStatus();
  });
}
function updateLeakCheck(snap) {
  const M = A.store.mspec;
  A.checks.leak = snap.ledger.escaped > 0 ? checkLeak({ leak: snap.leak, escaped: snap.ledger.escaped, maxLeak: M.checks?.maxLeak ?? 0.2 }) : { status: 'na', ratio: null, worst: null };
  const k = JSON.stringify([A.checks.leak.status, A.checks.leak.worst?.part, A.checks.leak.worst?.face]);
  if (k !== A.markKey) { A.markKey = k; renderMarkers(); }
}
// 3D 표식: ① 빨간 원(간섭) ② 거리선(LED 축 → 관측면, 도달 부족이면 주황 + 원) ③ 주황 원(가장 얇은 곳) ④ 주황 면(가장 많이 새는 면). 상태 띠 배지 클릭 = 크게
function renderMarkers() {
  if (!A?.view) return;
  const C = A.checks, f = A.store.session.focusCheck, M = A.store.mspec, rt = getMech3d(), out = [];
  const size = (id) => (f === id ? 20 : 12);
  // ③ 형상 바꿀 부품 — 기구 최적화 창이 열려 있고 ③ 을 켰으면 보라색으로 덮어 표시
  const ad = A.ad, spi = ad?.sel?.shape && monitor?.isOpen() ? ad.sel.shapePart : -1;
  if (spi >= 0 && rt?.parts[spi]) out.push({ type: 'tris', positions: rt.parts[spi].positions, triangles: rt.parts[spi].triangles, color: 0xa855f7, opacity: 0.35 });
  // 원설계 LED 위치 = 회색 고리(바뀌었을 때만) — 지금 LED 와 견주어 변경이 3D 에서 보이게(2026-11-02)
  const chgM = ledChangeNow();
  if (chgM?.changed && !A.store.session.hideLeds) for (const o of chgM.orig) out.push({ type: 'ring', pos: o.pos, color: 0x9aa7b8, size: 6 });
  const hidP = new Set(A.store.session.hidden ?? []);
  for (const c of C.clash?.items ?? []) {   // 부품끼리 겹친 부위 = 빨간 면 + 가장 깊은 곳 빨간 원(둘 다 숨긴 쌍은 뺌)
    if (hidP.has(c.a) && hidP.has(c.b)) continue;
    if (c.triangles.length) out.push({ type: 'tris', positions: c.positions, triangles: c.triangles, color: 0xff3b30, opacity: 0.6 });
    out.push({ type: 'ring', pos: c.pos, color: 0xff3b30, size: size('clash') });
  }
  for (const it of C.interference?.items ?? []) out.push({ type: 'ring', pos: it.pos, color: it.kind === 'potted' ? 0xffa000 : 0xff3b30, size: size('interference') });   // 포팅 LED(투과 부품 안) = 주황 경고
  const hidA = new Set(A.store.session.hiddenLeds ?? []), emA = hidA.size ? ledsNow().em : [];
  for (const it of C.reach?.items ?? []) {
    const col = 0x4cd964;   // LED 방향 화살표만(도달 경고 고리는 뺌 — 직진만 봐서 도광 구조에서 잘못 경고, 2026-10-29)
    // LED 방향 = 화살표, 빛 원뿔(len = min(4, 0.4·간격))보다 1.6배 길게 — 단 닿는 면을 넘지 않게(간격의 90%). LED 를 끄면(hideLeds) 함께 숨김
    if (it.dist != null && !A.store.session.hideLeds && !hidA.has(emA[it.led]?.led ?? it.led)) out.push({ type: 'arrow', pos: it.pos, axis: it.axis, len: Math.min(1.6 * Math.min(4, 0.4 * it.dist), 0.9 * it.dist), color: col });
  }
  if (C.wall?.pos && (C.wall.status === 'warn' || f === 'wall')) out.push({ type: 'ring', pos: C.wall.pos, color: 0xffa000, size: size('wall') });
  const w = C.leak?.worst;
  if (w && w.part >= 0 && rt?.parts[w.part] && f === 'leak') {   // 결과 패널의 '새는 빛' 을 눌렀을 때만
    const t = extractFaces(rt.parts[w.part], new Set([w.face]));
    out.push({ type: 'tris', positions: t.positions, triangles: t.triangles, color: 0xff8c1a, opacity: f === 'leak' ? 0.8 : 0.5 });
  }
  // 선택 부품이 다른 부품·LED 와 겹친 곳만 빨간 고리(간격 표·치수선은 없앰)
  const cl = A.clrShown;
  if (cl) {
    for (const r of [...cl.rows, ...cl.leds]) {
      if (r.depth > 0) out.push({ type: 'ring', pos: r.pa, color: 0xff3b30, size: 14 });   // 겹칠 때만 표시(간격 선은 그리지 않음 — 2026-10-27)
    }
  }
  A.view.setCheckMarkers(out);
}

// 간섭 상대 이름 — 키 'p:j'(기구 부품) | 'l:j'(LED STEP 메쉬) | 'e:k'(발광점)
function hitName(M, key, line = A.store.session.line) {
  const [k, j] = [key[0], +key.slice(2)];
  if (k === 'p') return M.parts[j]?.name ?? `부품 ${j + 1}`;
  if (k === 'l') {   // j = 배치(원래/가상) 번호 — 가상 LED 는 복사 순번
    const lay = L.stepLayout(M, line), i = lay?.virtual ? lay.leds.indexOf(j) : -1;
    return j === (lay?.pcb ?? M.light.step?.pcb) ? 'PCB' : `LED ${(i >= 0 ? i : j) + 1}`;
  }
  return `LED ${j + 1} 발광점`;
}
// 선택 부품의 기하(간격 표·축별 가능 범위) — 큰 부품은 수 초~수십 초라 Worker(geom-client)에서. 결과 캐시: 장면·부품·변환·LED 가 같으면 재사용.
// 아직 없으면 요청만 하고 null(화면은 먼저 그림 — 가능 범위·간격 줄은 빈 채로) → 결과가 오면 다시 그림
const NO_LED = [];
function selGeom(i) {
  const M = A.store.mspec, S = A.store.session, rt = getMech3d();
  if (!rt?.parts[i] || !rt.raw?.parts[i]) return null;
  const stp = M.light.kind === 'step', lp = (stp && L.ledPartsNow(M, S.line)) || NO_LED;   // 같은 '없음' 배열 — 새 [] 면 캐시가 매번 어긋나 결과를 버림
  let em = []; try { em = L.currentEmitters(M, S.line); } catch { em = []; }
  const ek = JSON.stringify(em.map((e) => [e.pos, e.axis])), xk = JSON.stringify(M.parts[i].xform ?? null), g = A.geom;
  if (g && g.rt === rt && g.i === i && g.lp === lp && g.ek === ek && g.xk === xk) return g.r;   // r = null: 계산 중
  const ask = { rt, i, lp, ek, xk, r: null };
  A.geom = ask;
  geomQuery({ cur: rt.parts, raw: rt.raw.parts, led: lp, i, xf: M.parts[i].xform ?? null, emitters: em, limEmitters: stp ? em : [] }).then((r) => {
    if (!A || A.geom !== ask) return;
    if (r.stale) { A.geom = null; renderAll('geom'); return; }   // 그사이 장면이 바뀜 — 다시 요청
    ask.r = r.error ? { error: r.error } : r;
    renderAll('geom');
  });
  return null;
}
// 선택 부품의 크기·위치 — 원본 외곽(바로 계산) + 가능 범위(Worker 결과 · 없으면 null = 입력 제한 없이). 표시·입력 제한용으로 여유 TOL 을 뺀다
function xformInfoOf(i) {
  const M = A.store.mspec, rt = getMech3d();
  if (!rt?.raw?.parts[i]) return null;
  const b = bounds(rt.raw.parts[i].positions), center0 = [0, 1, 2].map((k) => (b[k] + b[k + 3]) / 2), size0 = [0, 1, 2].map((k) => b[k + 3] - b[k]);
  const g = selGeom(i), r = g?.lim;
  if (!r) return { center0, size0, lim: null };
  if (g.limOut) return g.limOut;
  // 0.01mm 단위로 안쪽 내림 — 맞닿음(간격 ≤ TOL)은 간섭이 아니므로 벽에 딱 맞는 치수(예: 16.00)도 입력 가능
  const cut = (v, sg) => (Number.isFinite(v) ? sg * Math.floor(Math.abs(v) * 100 + 1e-6) / 100 : v);
  const s = M.parts[i].xform?.scale ?? [1, 1, 1];
  const lim = {
    move: r.move.map(([lo, hi]) => [cut(lo, -1), cut(hi, 1)]),
    size: r.size.map((v, k) => (Number.isFinite(v) ? Math.max(r.size0[k] * s[k], cut(v, 1)) : v)),
    uniform: Number.isFinite(r.uniform) ? Math.max(1, Math.floor(r.uniform * 1e4) / 1e4) : r.uniform,
  };
  g.limOut = { center0: r.center0, size0: r.size0, lim };
  return g.limOut;
}
// 선택 부품의 간격 표(Worker 결과 · 없으면 null)
function clearanceOf(i) {
  const M = A.store.mspec, g = selGeom(i), r = g?.clr;
  if (!r) return null;
  if (g.clrOut) return g.clrOut;
  g.clrOut = {
    i, rows: r.parts.map((x) => ({ ...x, name: M.parts[x.part]?.name ?? `부품 ${x.part + 1}` })),
    leds: r.leds.slice(0, 3).map((x) => ({ ...x, name: hitName(M, `l:${x.part}`) })),
    ledMin: r.ledMin, ledAxial: r.ledAxial,
  };
  return g.clrOut;
}

// ---- 기구 최적화(P4) ----
// sel.oneRow = ② 1열만(재료비 — 2026-10-30 기본 켬) · open = 늘 true(접기 없음 — 기구 최적화 칸은 ⑤ 창 안에만 있고 창을 닫으면 숨김, 2026-10-29)
function adState() { return (A.ad ??= { open: true, sel: { milky: true, leds: false, shape: false, shapePart: -1, milkyMax: null, height: false, housing: false, housingPart: -1, housingSpecial: false, boost: false, oneRow: true }, running: null, result: null, undo: null, milkyPart: null, runner: null, info: null, stepBusy: false, stepWorker: null, locked: {}, lastLock: null }); }   // locked = 적용해서 고정한 항목(position·housing·shape·milky)
function adInfo() {   // 부품별 비 2.5D 비율(부품 윗면 기준 — partFrame) — 라인이 있을 때만. (기구·라인) 별 캐시(높이맵 계산이 무거움)
  const st = adState(), S = A.store.session, rt = getMech3d();
  if (!st.info || st.info.rt !== rt || st.info.line !== S.line) st.info = { rt, line: S.line, non25: S.line && rt ? rt.parts.map((p) => heightsFor(p, partFrame(p, S.line.frame), 0.5).non25) : [], boxes: rt ? rt.parts.map((p) => bounds(p.positions)) : [] };   // boxes = ④ 기본 대상용 외곽
  return st.info;
}
// LED 빛이 처음 맞는 부품 — LED 축 방향 광선(최대 5개)의 다수결. (기구·라인·광원 배치)별 메모, 못 재면 null
function adFirstHit(M) {
  const st = adState(), line = A.store.session.line, rt = getMech3d();
  if (!line || !rt) return null;
  const key = JSON.stringify([M.light.kind, M.light.step?.offset, M.light.step?.virtual, M.light.manual, M.parts.map((p) => [p.role, p.untrace])]);
  if (st.fh?.rt === rt && st.fh.line === line && st.fh.key === key) return st.fh.v;
  let v = null;
  try {
    const em = L.currentEmitters(M, line), pick = em.length > 5 ? [0, 1, 2, 3, 4].map((i) => em[Math.round((i * (em.length - 1)) / 4)]) : em, cnt = new Map();
    for (const e of pick) {
      let t = Infinity, k = -1;
      rt.parts.forEach((m, i) => { const p = M.parts[i]; if (!p || p.role === 'light' || p.role === 'pcb' || p.untrace) return; const h = rayT(m, e.pos, e.axis); if (h < t) { t = h; k = i; } });
      if (k >= 0) cnt.set(k, (cnt.get(k) ?? 0) + 1);
    }
    v = [...cnt].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  } catch { v = null; }
  st.fh = { rt, line, key, v };
  return v;
}
const adAvail = (M) => stageAvailability(M, { ...adInfo(), path: adState().path ?? null, firstHit: adFirstHit(M) });
// 광경로 위 부품 검출 — 계산 중인 장면(Worker 0)에서 광자로 재서 ③ 형상·② 케이스 대상 목록을 좁힘. 장면마다 한 번, 기구 최적화 창이 열려 있을 때만.
// 최적화 실행 중에는 Worker 장면이 후보로 바뀌므로 쉼. 관측면에 빛이 안 닿으면 path = null(전체 목록)
function adDetectPath() {
  const a = A, st = a?.ad;
  if (!st || st.running || !monitor?.isOpen()) return;
  const sceneKey = a.prog?.snapshot?.().sceneKey, port = a.pool?.ports?.()[0];
  if (!sceneKey || !port || st.pathKey === sceneKey) return;
  st.pathKey = sceneKey;
  port.send({ type: 'partsOnPath', sceneKey, nMech: a.store.mspec.parts.length }).then((r) => {
    if (A !== a || st.pathKey !== sceneKey) return;
    if (!r?.result) { st.pathKey = null; return; }   // 장면이 그새 바뀜 — 다음 갱신에서 다시
    st.path = r.result.observed > 0 ? { shares: r.result.shares } : null;
    renderAuto(); renderMarkers();
  }, () => { if (st.pathKey === sceneKey) st.pathKey = null; });
}
const adMilkyPart = (M, avail) => (avail.milky.ok ? (avail.milky.parts.find((i) => M.observe.faces.some((f) => f.part === i)) ?? avail.milky.parts[0]) : null);
const adClone = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
// 기구 최적화 카드 펼침 상태 — 새로고침해도 기억(브라우저별 편의 설정)
const AD_OPEN_KEY = 'uds.m3.autoOpen';
function adSetOpen(v) { adState().open = v; try { localStorage.setItem(AD_OPEN_KEY, v ? '1' : '0'); } catch {} renderAuto(); }
// 기구 최적화 항목·설정 바꾸기(왼쪽 칸·가운데 타일 공용)
function adSel(k, v) {
  const st = adState(); if (st.running) return;
  if (k === 'position') { const av = adAvail(A.store.mspec); st.sel.leds = !!v && !!av.leds?.ok; st.sel.height = !!v && !!av.height?.ok; }   // ② 기구 위치 = LED 배치 + 높이
  else st.sel[k] = k === 'milkyMax' ? clampCap(v) : v;
  if (k === 'shapePart') st.sel.shapeAuto = false;   // 직접 고르면 검출 결과가 바뀌어도 그대로(목록에서 빠질 때만 다시 자동)
  if (k === 'housingPart') st.sel.housingAuto = false;
  st.sel.boost = false;   // 보완 자동 추가는 화면에서 뺌(④ 케이스 면은 2026-10-30 다시 켬 — 설계 인자 ④ 줄)
  renderAuto(); renderMarkers();   // ③ 대상 부품 강조 갱신
}
// 설계 인자 현황판의 '지금 설계' 값 — Milky(① 대상 부품) · LED 개수 · 형상 변경 여부 · 지금 균일도
function factorNow() {
  const M = A.store.mspec, S = A.store.session, st = adState(), mp = A.tileState?.milkyPart ?? null, sel = A.tileState?.sel ?? st.sel ?? {};
  let n = null; try { n = ledsNow(M, S.line).list.length; } catch { n = null; }
  const stt = A.prog?.snapshot()?.stats, on = (k) => !!st.sel?.[k];
  return { milky: mp != null ? +M.parts[mp].material.milky : null, milkyCap: Number.isFinite(sel.milkyMax) ? sel.milkyMax : null, leds: n != null ? `LED ${n}개 · 높이 그대로` : '–', shape: M.parts.some((p) => p.shapeMod) ? '형상 변경됨' : '원래 형상',
    housing: (() => { const hp = sel.housingPart; if (!(hp >= 0) || !M.parts[hp]) return '–'; const f = M.parts[hp].finish; return `${M.parts[hp].name} · ${f ? finishText({ ...f, ...(M.parts[hp].coating ? { coating: M.parts[hp].coating } : {}) }, reflCat()) : '–'}`; })(),
    on: { milky: on('milky'), position: on('leds') || on('height') || on('position'), shape: on('shape'), housing: on('housing') }, Ulen: stt?.Ulen, Uwid: stt?.Uwid, eff: A.prog?.snapshot()?.photometry?.eff, tgLen: M.observe.targetLen, tgWid: M.observe.targetWid, locked: st.locked ?? {} };
}
function renderAuto() {
  const el = $('#m3-auto'), st = adState();
  monitorSummary();
  el.hidden = false;   // 닫혀 있어도 한 줄 머리는 늘 보인다(메뉴가 사라진 것처럼 보이지 않게)
  $('#m3-dock')?.classList.toggle('collapsed', !st.open);   // 접으면 아래 칸 = 한 줄(대시보드 숨김)
  const M = A.store.mspec, avail = adAvail(M);
  adDetectPath();
  if (!st.running && !avail.shape.parts?.includes(st.sel.shapePart)) st.sel.shapeAuto = true;   // 직접 고른 대상이 목록에서 빠지면 다시 자동
  if (!st.running && !avail.housing.parts?.includes(st.sel.housingPart)) st.sel.housingAuto = true;
  if (!st.running && st.sel.shapeAuto !== false) st.sel.shapePart = avail.shape.ok ? avail.shape.parts[0] : -1;   // 자동 = 빛이 가장 많이 지나는 부품(검출 전 = 첫 후보)
  if (!st.running && st.sel.housingAuto !== false) { const k = defaultHousingPart(M, adInfo().boxes); st.sel.housingPart = avail.housing.ok ? (avail.housing.parts.includes(k) ? k : avail.housing.parts[0]) : -1; }   // ② 자동 = 관측 부품을 감싸는 가장 큰 불투명 부품(광경로 위일 때), 아니면 빛이 가장 많이 닿는 부품
  const mp = st.running ? st.milkyPart : adMilkyPart(M, avail), sel = { ...st.sel, milkyMax: st.sel.milkyMax ?? capDefault(st.sel, avail, mp != null ? M.parts[mp].material.milky : 0) };
  const hm = st.sel.housingPart >= 0 ? reflCat().find((e) => !e.special && e.id === M.parts[st.sel.housingPart]?.reflMaterial) : null;   // ④ 대상 반사 소재
  A.tileState = { avail, sel, running: st.running, names: M.parts.map((p) => p.name), milkyPart: mp, housingMat: hm ? { name: hm.name, max: hm.max } : null, path: st.path ?? null };
  if (!st.open) {   // 설정(tileState)은 위에서 먼저 — 설계 인자 현황 줄 체크가 접힘과 무관하게 보이게
    el.innerHTML = '<button type="button" class="m3-ad-collapsed" data-ad="open" aria-expanded="false"><i class="m3-fl">5</i>기구 최적화 <span class="mut">— 목표 미달일 때 Milky·LED 위치·형상 후보 찾기 · 펼치기 ▴</span></button>';
    el.querySelector('[data-ad="open"]').onclick = () => { adSetOpen(true); };
    A.optDash?.refresh();   // 접혀 있어도 설계 인자 현황의 체크 상자는 갱신
    return;
  }
  A.optDash?.refresh();
  renderAutoPanel(el, { caseView: adCaseView(), avail, sel, running: st.running && { ...st.running, paused: !!st.paused }, result: st.result, resultOpen: !!st.resultOpen, names: M.parts.map((p) => p.name), canRevert: !!st.undo, applied: st.undo ? st.applied ?? null : null, noLine: !A.store.session.line, noLed: A.store.session.line ? adBlock() : '', milkyPart: mp, housingMat: hm ? { name: hm.name, max: hm.max } : null, catalog: reflCat() }, {
    onSel: (k, v) => adSel(k, v),
    onAction: (k, v) => ({ caseSort: () => adCaseSort(v), casePick: () => adCasePick(v), caseRun: adCaseRun, shapeDeep: adShapeDeep, continue: adContinue, applyMilky: () => adApplyMilky(+v), close: () => monitor?.close(), apply: adApply, applyAlt: adApplyAlt, cancel: adCancel, revert: adRevert, step: adStep, view: () => { st.resultOpen = true; renderAuto(); }, hide: () => { st.resultOpen = false; renderAuto(); } })[k]?.(),
  });
}
// 접은 창에 보일 현재 결과 — 실행 중 = 진행률, 결과 있음 = 후보 값, 그 밖 = 지금 값(길이·폭 균일도)
// 기구 최적화를 시작할 수 없는 이유 — 없으면 ''. 페이지를 연 직후 LED 도면을 읽기 전에 실행하면 'LED 가 없음' 으로 실패했음
let adLedCache = null;
function adBlock(M = A.store.mspec, line = A.store.session.line) {
  if (refining) return '정밀 메시를 만드는 중 — 끝난 뒤 실행하세요';
  if (!line) return '관측 라인이 없음';
  if (M.light.kind === 'none') return 'LED 를 먼저 지정하세요 — ① LED 지정';
  if (M.light.kind === 'step' && M.light.step && !getLedMesh()) return 'LED 도면을 읽는 중';
  const key = JSON.stringify(M.light), mesh = getLedMesh();   // 계산 갱신마다 불림 — 광원이 그대로면 다시 안 잼
  if (adLedCache?.key !== key || adLedCache.line !== line || adLedCache.mesh !== mesh) { let n = 0; try { n = L.currentEmitters(M, line).length; } catch { n = 0; } adLedCache = { key, line, mesh, n }; }
  return adLedCache.n ? '' : 'LED 를 먼저 지정하세요 — ① LED 지정';
}
function monitorSummary() {
  if (!A || !monitor) return;
  A.cmd?.update(A.store.session, A.store.mspec);   // 상단 ⑤ 표시 — 계산이 끝난 뒤 최적화가 끝나거나 중지돼도 바뀌게
  monitor.setDone(!A.ad?.running && (!!A.ad?.result || !!A.cmd?.flow?.()?.opt?.done));   // 창 제목 ✓ = 최적화를 끝냈거나 할 필요 없음
  const st0 = A.ad, av0 = adAvail(A.store.mspec), nSel = AD_ITEMS.filter(([, , ks]) => ks.some((k) => st0?.sel?.[k] && av0[k]?.ok)).length, block = adBlock();
  monitor.setCtl(optCtl({ running: !!st0?.running, paused: !!st0?.paused, canRun: !block && nSel > 0, hasResult: !!st0?.result, why: block || '펼쳐서 최적화할 항목을 체크하세요' }), adCtl);
  const st = A.ad, M = A.store.mspec, cell = (t, v, g) => `<b class="${Number.isFinite(v) && Number.isFinite(g) ? (v + 1e-9 >= g ? 'ok' : 'bad') : ''}">${t} ${Number.isFinite(v) ? v.toFixed(2) : '–'}</b>`;
  if (st?.running) { monitor.setSummary(`<b>${st.paused ? '일시정지' : '진행'} ${Math.round((st.running.frac ?? 0) * 100)}%</b>`); return; }
  const b = st?.result?.best, sn = A.prog?.snapshot(), s = sn?.stats, calc = ['running', 'pending', 'starting'].includes(sn?.state) ? `<b>계산 ${Math.round(simPct(s?.relNoise, sn.targetNoise))}%</b> ` : '';
  if (!b && (!s || s.empty || s.relNoise > 0.05)) { monitor.setSummary(`<b>실행 전</b> ${calc || '<span>계산 중</span>'}`); return; }   // 초반 값은 노이즈
  const U = b ? [b.Ulen, b.Uwid] : [s.Ulen, s.Uwid];
  monitor.setSummary(`${b ? '<b>진행 100%</b> <span>후보</span> ' : `<b>실행 전</b> ${calc}`}${cell('길이', U[0], M.observe.targetLen)} ${cell('폭', U[1], M.observe.targetWid)}`);
}
function adStop() { const st = adState(); if (!st.running || !st.runner) return; st.paused = false; st.runner.cancel(); setStatus('기구 최적화 중지됨'); A.optDash?.stop(); }
function adPause(on) {
  const st = adState(); if (!st.running || !st.runner) return;
  st.paused = on; on ? st.runner.pause() : st.runner.resume(); A.optDash?.setPaused(on);
  setStatus(on ? '기구 최적화 일시정지 — 지금 계산 중인 조각까지만 받음' : '기구 최적화 이어서 실행'); renderAuto();
}
function adCtl(k) {
  const st = adState();
  if (k === 'pause') adPause(true);
  else if (k === 'stop') adStop();
  else if (st.running) { if (st.paused) adPause(false); }
  else { if (st.result) { if (!globalThis.confirm?.(rerunAsk(st.result.best))) return; adCancel(); } adRunBoost(); }
}
// 광분포 시뮬레이션 단추: 실행 = 일시정지면 이어서, 그 밖에는 처음부터 · 기구 최적화 중에는 쓰지 않음
function calcCtl(k) {
  if (!A || A.ad?.running) return;
  const s = A.prog.snapshot();
  if (k === 'pause') A.prog.pause();
  else if (k === 'stop') A.prog.stop();
  else if (s.state === 'paused' && !s.stopped) A.prog.resume();
  else if (!['running', 'pending', 'starting'].includes(s.state)) restartCalc();
}
// 실행 문맥 = 시작 때 스냅샷 { M0: mspec 복사, line, G, obs, rt: 기구 런타임, mp: ① 대상 부품 } — 평가·미리보기·적용이 모두 이것 기준
// 형상 원본 = 원본 메쉬 + 크기·위치 조절(이미 적용된 shapeMod 는 빼고 — 적용 때 shapeMod 를 바꿔 끼우므로 평가와 같게)
// 같은 (원본, xform) 이면 같은 객체 — 세분·높이맵 메모(메쉬 객체 기준)가 맞도록
function adBaseMesh(i, ctx) {
  const rt = ctx.rt, raw = (rt.raw ?? rt).parts[i], xf = ctx.M0.parts[i].xform;
  if (isIdentityXform(xf)) return raw;
  const st = adState(), k = JSON.stringify(xf), c = (st.base ??= [])[i];
  if (c && c.raw === raw && c.k === k) return c.mesh;
  const b = bounds(raw.positions), mesh = scaleMoveMesh(raw, xf, [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]);
  st.base[i] = { raw, k, mesh };
  return mesh;
}
// 형상 후보 메쉬 — 세분은 메모(refinedFor: 후보 27개도 R 3개 → 세분 3번). hDiv = R/hMax(STEP 은 거칠게 3)
// hBottom = lineVarH(mod) — runtime.applyPartMods 와 같게(평가 형상 = 적용 형상)
const SHAPE_CRN = 424242;   // 형상 후보 공통 시드 기준(같은 난수 비교)
const adShapeMesh = (base, mod, hDiv = 8) => deformPart(refinedFor(base, mod.frame, bumpCenters(mod), mod.R, Math.max(0.1, mod.R / hDiv), lineVarH(mod)), mod.frame, heightsFor(base, mod.frame, mod.cell), mod);
// ② 설계 → LED STEP 배치(step.virtual): Solver 위치 목록이면 { positions }(STEP 편집 배치), 아니면 균등 { count, pitch, rows, rowGap }
const stepVirtOf = (d, rw) => (d.positions ? { positions: d.positions.map((q) => ({ s: q.s, w: q.w ?? 0, dz: 0 })) } : { count: d.count, pitch: d.pitch, ...rw });
const samePos = (a, b) => JSON.stringify((a ?? null) && a.map((q) => [q.s, q.w ?? 0])) === JSON.stringify((b ?? null) && b.map((q) => [q.s, q.w ?? 0]));
// 설계 → (mspec 복사본, 기구 메쉬) — 형상은 후보 메쉬로 바꾼 부품 포함
function designScene(d, ctx) {
  const M = adClone(ctx.M0), rt = ctx.rt, mp = ctx.mp;
  if (mp != null && d.milky != null) M.parts[mp] = setPartMaterialParam(M.parts[mp], 'milky', d.milky);
  const rw = { rows: d.rows === 2 ? 2 : 1, rowGap: d.rows === 2 ? d.rowGap ?? 0 : 0 };   // 열 배치(spec P4 §2.2b) — d.rows 없음 = 1열
  if (M.light.kind === 'manual' && d.count != null) { Object.assign(M.light.manual, { count: d.count, pitch: d.pitch }, d.rows != null ? rw : {}); if (d.positions) M.light.manual.positions = d.positions; else delete M.light.manual.positions; }
  if (M.light.kind === 'step' && M.light.step && d.count != null && d.stepVirt) M.light.step.virtual = stepVirtOf(d, rw);   // Solver 위치 목록 = STEP 편집 배치
  if (d.finish) applyFinish(M, d.finish);   // ④ 그 부품 기본 면 처리
  if (d.dz) applyDz(M, d.dz, ctx.line.frame.d);   // ⑤ STEP offset(+발광점) / 직접 배치 깊이 — 가상 배치는 stepLayout 이 offset 을 따름
  let parts = rt.parts;
  if (d.shape) {
    const i = d.shape.part, base = adBaseMesh(i, ctx), mod = shapeModFor(d.shape, M, ctx.line, shapeFrame(base, ctx.line));
    const mesh = adShapeMesh(base, mod);
    parts = rt.parts.map((p, j) => (j === i ? mesh : p)); M.parts[i].shapeMod = mod;
  }
  return { M, parts };
}
// LED 중심 = 그 설계(M: ② 가 바꾼 개수·피치 반영)의 발광점을 관측 평면에 투영
// e·c 용 중심선(관측 좌표 path·halfW·closed·L)과 ℓ(LED 피치: 직접·가상 배치 = 그 피치/균등 L/n, LED STEP 원래 = 발광점 평균 간격, 1개 = L/4)도 저장 — shapeMod 만으로 형상 결정
const adPaths = new WeakMap();   // 라인·기준 좌표별 중심선 메모(후보마다 다시 표본하지 않게)
// ③ 형상 기준 좌표 = 대상 부품 윗면 방향(관측면이 기울거나 꺾여도 부품 두께를 바르게 — 2026-10-29). 원본 메쉬별 메모
const SHAPE_F = new WeakMap();
const shapeFrame = (base, line) => { let m = SHAPE_F.get(base); if (!m || m.line !== line) SHAPE_F.set(base, (m = { line, F: partFrame(base, line.frame) })); return m.F; };
function shapeModFor({ dt, h, R, e = 0, c = 0, kL = null, kW = null, kF = null }, M, line, F = line.frame) {   // kL·kW = 길이·폭 두께 곡선(제어점, mm)   // F = 형상 기준 좌표(shapeFrame — 대상 부품 윗면 방향)
  const em = L.currentEmitters(M, line);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const centers = em.map((x) => [dot(x.pos, F.u), dot(x.pos, F.v)]);
  let PM = adPaths.get(line); if (!PM) adPaths.set(line, (PM = new Map()));
  const fk = F.d.map((x) => x.toFixed(6)).join(); let P = PM.get(fk); if (!P) PM.set(fk, (P = pathFromLine(line, F)));   // 기준 좌표별
  const lv = M.light.kind === 'step' ? M.light.step?.virtual ?? null : null, lay = M.light.kind === 'manual' ? M.light.manual : lv && !lv.positions ? lv : null;   // 편집한 배치 = 발광점 간격으로
  const ell = ledEll({ pitch: lay?.pitch ?? 0, count: lay?.count ?? 0, ss: centers.map(([x, y]) => swOnPath(P, x, y)[0]), L: P.L });
  return { frame: { u: F.u, v: F.v, d: F.d }, dt, h, R, e, c, ...(kL?.some((v) => v) ? { kL } : {}), ...(kW?.some((v) => v) ? { kW } : {}), ...(kF?.v?.some((v) => v) ? { kF } : {}), centers, cell: 0.5, path: P.path, halfW: P.halfW, closed: P.closed, L: P.L, ell };
}
// 최종안의 LED 몸체가 기구 부품과 새로 겹치는 수(LED STEP) — 현재안에 이미 있던 겹침은 뺌. 0 = 없음
async function designClash(d, ctx, M0, rt, line) {
  if (M0.light.kind !== 'step') return 0;
  try {
    const tick = pacer();   // LED 마다 화면에 양보(40 개면 3.3 초 걸림)
    const cnt = async (M, mech) => { const lay = L.stepLayout(M, line); let n = 0; for (const k of lay?.leds ?? []) { await tick(); if (lay.parts[k] && interferenceKeys(lay.parts[k], mech, [], []).size > 0) n++; } await tick(); return Math.max(boxClashN(M, line, rt), n); };
    const { M, parts } = designScene(d, ctx);
    return Math.max(0, await cnt(M, parts) - await cnt(M0, rt.parts));
  } catch { return 0; }
}
// ② LED 폭 위치 이동 후보(2026-10-30) — LED STEP 만. 지금 배치(s 목록)를 폭 c(기준 LED 대비 mm)로 옮겨 봄: −16~+16 mm, 1 mm 간격.
// 받는 조건: (1) LED 몸체가 기구 부품과 새로 겹치지 않음 (2) 몸체 양쪽 가장자리 아래가 원래와 같은 높이의 면(PCB 위 — 가장자리 밖으로 떠 있지 않음).
// 광원으로 옮긴 원래 LED·추적 제외 부품은 검사에서 뺌. 반환 { cs:[0 포함], ss } | null
async function lateralCandidates(M0, line, rt, ctx) {
  if (M0.light.kind !== 'step' || !line) return null;
  let em = []; try { em = L.currentEmitters(M0, line); } catch { return null; }
  const ref = stepRefEmitter(M0.light.step); if (!em.length || !ref) return null;
  const ss = [...new Set(em.map((e) => rw4(line.toSW(...line.to2D(e.pos))[0])))].sort((a, b) => a - b);
  const off = M0.parts.map((p) => p.role === 'light' || !!p.untrace), mech = rt.parts.map((p, j) => (off[j] ? null : p));
  const { partOf } = rt.combined, mask = new Uint8Array(partOf.length); for (let t = 0; t < partOf.length; t++) if (off[partOf[t]]) mask[t] = 1;
  const al = Math.hypot(...ref.axis) || 1, n = ref.axis.map((v) => v / al), F = line.frame, uu = F.u.map((v, k) => v - (F.u[0] * n[0] + F.u[1] * n[1] + F.u[2] * n[2]) * n[k]), ul = Math.hypot(...uu) || 1, lat = uu.map((v) => v / ul);
  const half = ledHalfWidth(M0, line) * 0.9, down = (p) => { const h = intersectRay(rt.bvh, p[0], p[1], p[2], -n[0], -n[1], -n[2], 1e-6, Infinity, -1, -1, mask); return h ? h.t : Infinity; };
  const t0 = down(ref.pos), cs = [0];
  const clashN = (c) => { const { M, parts } = designScene({ ...ctx.cur, positions: ss.map((s) => ({ s, w: c })), count: ss.length, rows: 1, rowGap: 0, stepVirt: true }, ctx); const lay = L.stepLayout(M, line);
    return { lay, n: Math.max(boxClashN(M, line, rt), (lay?.leds ?? []).filter((k) => lay.parts[k] && C_interf(lay.parts[k], mech)).length) }; };
  let base = 0; try { base = clashN(0).n; } catch { return null; }
  const tick = pacer();
  for (let c = -16; c <= 16; c++) {   // 1 mm 간격(2026-11-03) — 비교는 엔진이 2 mm 로 훑고 ±1 mm
    if (!c) continue;
    await tick();
    try {
      const { lay, n: nc } = clashN(c); if (nc > base) continue;
      const es = lay.emitters ?? [], pick = [es[0], es[Math.floor(es.length / 2)], es.at(-1)].filter(Boolean);
      const okSup = pick.every((e) => [-1, 0, 1].every((sg) => Math.abs(down(e.pos.map((v, k) => v + sg * half * lat[k])) - t0) < 0.3));
      if (okSup) cs.push(c);
    } catch { /* 배치 실패 = 후보 아님 */ }
  }
  return cs.length > 1 ? { cs, ss } : null;
}
const C_interf = (m, mech) => interferenceKeys(m, mech, [], []).size > 0;
// 결과 프로파일 아래에 찍을 LED 위치(라인 좌표 s, w) — 배치·라인이 같으면 캐시
// 원설계 LED 위치 = LED STEP 그대로(편집·최적화·개별 조정·빛 끔 전) · 직접 배치 = 최적화를 처음 적용하기 전 값(light.originManual). 기준이 없으면 null
let ledChgCache = null;
function ledOriginOf(M, line) {
  const Lt = M.light;
  if (Lt.kind === 'step' && Lt.step?.emitters?.length) return L.currentEmitters({ ...M, light: { ...Lt, ledAdjust: null, step: { ...Lt.step, virtual: null, excluded: [] } } }, line);
  if (Lt.kind === 'manual' && Lt.originManual) return L.currentEmitters({ ...M, light: { ...Lt, ledAdjust: null, manual: { ...Lt.manual, ...Lt.originManual } } }, line);
  return null;
}
function ledChangeNow(M = A.store.mspec, line = A.store.session.line) {
  if (!line) return null;
  const key = JSON.stringify([M.light, M.parts.map((p) => p.xform ?? null)]);
  if (ledChgCache?.key === key && ledChgCache.line === line) return ledChgCache.v;
  let v = null;
  try {
    const O = ledOriginOf(M, line);
    if (O?.length) {
      const sw = (e) => { const [s, w] = line.toSW(...line.to2D(e.pos)); return { s, w, pos: e.pos }; };
      const { list, em } = ledsNow(M, line), cur = list.length ? list.filter((r) => r.e && !r.excluded).map((r) => ({ ...sw(r.e), n: r.n })) : em.map((e, n) => ({ ...sw(e), n }));
      v = ledChange(O.map(sw), cur);
    }
  } catch { v = null; }
  ledChgCache = { key, line, v };
  return v;
}
let ledSWCache = null;
function ledSW(M, line) {
  if (!line) return [];
  const key = JSON.stringify([M.light, M.parts.map((p) => p.xform ?? null)]);   // 배치·높이가 바뀌면 다시
  if (ledSWCache?.key === key && ledSWCache.line === line) return ledSWCache.v;
  let v = [];
  try { v = L.currentEmitters(M, line).map((e) => { const [s, w] = line.toSW(...line.to2D(e.pos)); return { s, w }; }); } catch { v = []; }
  ledSWCache = { key, line, v };
  return v;
}
// 3D 광경로 화살표 — 주광경로 1개(실제 광자 경로, 굵기·숫자 = 비중)만. 이름표 = 지나는 부품 이름만(관측면 글씨는 관측면 화살표 하나). 보기 메뉴로 켜고 끔(uds.m3.paths)
let pathKey = '';
export const pathsOn = () => { try { return localStorage.getItem('uds.m3.paths') !== '0'; } catch { return true; } };
export function setPathsOn(v) { try { localStorage.setItem('uds.m3.paths', v ? '1' : '0'); } catch {} pathKey = ''; drawLightPaths(); syncViewBtns(); }
// 투시 보기(전체 반투명) — 보는 사람별 설정(uds.m3.xray)
export const xrayOn = () => { try { return localStorage.getItem('uds.m3.xray') === '1'; } catch { return false; } };
export function setXrayOn(v) { try { localStorage.setItem('uds.m3.xray', v ? '1' : '0'); } catch {} A?.view?.setXray?.(v); syncViewBtns(); }
function syncViewBtns() {
  const el = document.querySelector('#m3-views'); if (!el) return;
  const set = (q, on) => { const b = el.querySelector(q); if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } };
  set('[data-xray]', xrayOn()); set('[data-paths]', pathsOn());
}
function drawLightPaths() {
  if (!A?.view?.setLightPaths) return;
  const M = A.store.mspec, S = A.store.session, rt = getMech3d(), P = pathsOn() ? (A.simDash?.paths() ?? []).slice(0, 1) : [];   // 주광경로 1개만(2026-10-29: 두 경로·이름표가 헷갈림)
  const key = JSON.stringify(P.map((p) => [p.parts, p.refl, Math.round(p.share * 20)]));   // 5% 단위로 바뀔 때만 다시 그림
  if (key === pathKey) return;
  pathKey = key;
  if (!P.length || !rt) { A.view.setLightPaths([]); return; }
  let em = []; try { em = L.currentEmitters(M, S.line); } catch { em = []; }
  const avg = (pts) => pts.reduce((a, q) => a.map((v, k) => v + q[k] / pts.length), [0, 0, 0]);
  const ctr = (m) => { const b = bounds(m.positions); return [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]; };
  const oa = obsArrow(M, S.line, rt);
  if (!em.length || !oa) { A.view.setLightPaths([]); return; }
  // 빛 기둥 하나: 관측면 중심에 가장 가까운 LED 에서 관측 방향(축)으로 곧게 — 거친 부품마다 그 깊이에 멈춤점(이름표), 끝은 관측면.
  // (예전: LED 평균점에서 단계마다 옆으로 밀어 계단 → 화살표가 퍼져 판 가장자리 분포처럼 보임, 2026-10-27 의견)
  const ax = oa.axis, dotA = (q) => (q[0] - oa.pos[0]) * ax[0] + (q[1] - oa.pos[1]) * ax[1] + (q[2] - oa.pos[2]) * ax[2];
  const perp = (q) => { const t = dotA(q); return Math.hypot(...q.map((v, k) => v - oa.pos[k] - ax[k] * t)); };
  const ledE = em.reduce((a, e) => (perp(e.pos) < perp(a.pos) ? e : a)), led = ledE.pos;
  const at = (t) => led.map((v, k) => v + ax[k] * (t - dotA(led)));   // LED 를 지나는 축 위 깊이 t 의 점
  const up = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], side = S.line?.frame?.u ?? [ax[1] * up[2] - ax[2] * up[1], ax[2] * up[0] - ax[0] * up[2], ax[0] * up[1] - ax[1] * up[0]], sl = Math.hypot(...side) || 1;
  const gap = Math.max(1.5, Math.min(6, oa.len * 0.2));   // 경로 2개는 나란히(살짝 옆)
  const base = P.map((p, i) => {
    const stops = [['LED', at(dotA(led))], ...p.parts.map((q) => [M.parts[q]?.name ?? `부품 ${q + 1}`, at(dotA(ctr(rt.parts[q])))]), ['관측면', at(0)]];
    const pts = stops.map(([, q]) => q.map((v, k) => v + (side[k] / sl) * gap * i)), last = pts[pts.length - 1];
    const nm = p.parts.map((q) => M.parts[q]?.name ?? `부품 ${q + 1}`);   // 경로가 지나는 부품 이름표(LED·관측면 글씨는 빼서 중복 없음)
    return { pts: [...pts, last.map((v, k) => v + ax[k] * oa.len * 0.6)], names: nm.length ? nm : null, namePts: nm.map((_, k) => k + 1), axis: ax, side: side.map((v) => v / sl), share: p.share, label: `${(p.share * 100).toFixed(0)}%${p.refl ? ' 반사' : ''}`, offset: i };
  });
  A.view.setLightPaths(base);   // 먼저 곧은 기둥(바로), 이어서 Worker 가 실제 광자 경로를 찾으면 바꿔 그림
  realLightPaths(P, base, ledE, key, oa, rt.parts.length);
}
// 실제 광경로 — 계산 중인 장면(Worker 0)에서 그 경로로 관측면에 닿은 MC 광자 하나(면 적중 수 중앙값)의 꺾인 길:
// 부품 면에서 굴절·반사·내부 전반사로 꺾이는 모습. 이름표 = LED · 처음 들어간 부품 면 · 관측면 출사점. 못 찾으면 곧은 기둥 그대로
async function realLightPaths(P, base, ledE, key, oa, nMech) {
  const sceneKey = A.prog?.snapshot?.().sceneKey, port = A.pool?.ports?.()[0];
  if (!sceneKey || !port) return;
  const out = await Promise.all(P.map(async (p, i) => {
    let r = null;
    try { r = await port.send({ type: 'path', sceneKey, emitter: ledE, want: `${p.refl ? 'R' : ''}:${p.parts.join('>')}`, nMech }); } catch { return base[i]; }
    const g = r?.path; if (!g?.pts?.length) return base[i];
    const end = g.pts[g.pts.length - 1], tail = end.map((v, k) => v + g.dir[k] * oa.len * 0.6);
    const ok = base[i].names && g.enter?.length === base[i].names.length;   // 이름표 = 그 부품에 처음 들어간 점
    return { ...base[i], pts: [...g.pts, tail], names: ok ? base[i].names : null, namePts: ok ? g.enter : null };
  }));
  if (!A || key !== pathKey || !pathsOn()) return;   // 그사이 프로젝트를 닫음·경로가 바뀜·꺼짐
  A.view.setLightPaths(out);
}
// 관측면 빛 방향 화살표 — 고른 면들의 면적 가중 중심에서 관측 방향(d) 으로. 들어오는 빛(mode 'in') 이면 면을 향해 그림
function obsArrow(M, line, rt) {
  const O = M.observe; if (!O.faces?.length || !rt) return null;
  const want = new Set(O.faces.map((f) => `${f.part}|${f.face}`)), c = [0, 0, 0];
  let A = 0, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  rt.parts.forEach((p, pi) => {
    const P = p.positions, T = p.triangles;
    for (let t = 0; t < T.length / 3; t++) {
      if (!want.has(`${pi}|${p.faceIds[t]}`)) continue;
      const a = T[3 * t] * 3, b = T[3 * t + 1] * 3, cc = T[3 * t + 2] * 3, u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[cc] - P[a], P[cc + 1] - P[a + 1], P[cc + 2] - P[a + 2]];
      const ar = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
      for (let k = 0; k < 3; k++) { c[k] += ar * (P[a + k] + P[b + k] + P[cc + k]) / 3; for (const q of [a, b, cc]) { lo[k] = Math.min(lo[k], P[q + k]); hi[k] = Math.max(hi[k], P[q + k]); } }
      A += ar;
    }
  });
  if (!(A > 0)) return null;
  const axis = O.dir ?? line?.frame?.d ?? obsDirection(rt.parts, O.faces), diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  return { pos: c.map((x) => x / A), axis, len: Math.max(4, Math.min(25, 0.18 * diag)), incoming: false };
}
// LED 몸체 반폭(관측 평면 u·v 투영 중 큰 쪽의 반) — LED STEP = 기준 LED 몸체, 직접 배치 = 발광면 크기의 반. ② 끝벽·측벽 여유
function ledHalfWidth(M, line) {
  const F = line.frame, sp = M.light.spec ?? {};
  if (M.light.kind === 'step') {
    const ref = stepRefEmitter(M.light.step), P = ref ? L.ledPartsNow(M, null)?.[ref.part]?.positions : null;
    if (P) {
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (let i = 0; i < P.length; i += 3) { const u = P[i] * F.u[0] + P[i + 1] * F.u[1] + P[i + 2] * F.u[2], v = P[i] * F.v[0] + P[i + 1] * F.v[1] + P[i + 2] * F.v[2]; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      return Math.max(u1 - u0, v1 - v0) / 2;
    }
  }
  return Math.max(sp.sizeX ?? 2, sp.sizeY ?? 2) / 2;
}
const adJob = (M, parts, ctx, o = {}) => { const j = jobFor(M, parts, { line: ctx.line, G: ctx.G, obs: ctx.obs, ...o }); if (!j) throw new Error('LED 가 없음'); return j; };
const adEff = (r) => { let t = 0; for (const b of r.batches) for (const v of b) t += v; return t / r.ledger.emitted; };
// ⑤ 높이 범위 [아래, 위](관측 방향 d 이동량 mm) + gap(현재 발광점 → 관측 부품 +d 축 거리 최소, 모르면 NaN)
// LED STEP(원래·가상) = LED 부품(PCB 포함) 각각을 기구 부품에 대해 travelDistance(이미 겹친 상대는 뺌) · 직접 배치(깊이) = 발광점 ±d 광선
const rayT = (m, p, d) => (m?.bvh ? intersectRay(m.bvh, p[0], p[1], p[2], d[0], d[1], d[2], 1e-6, Infinity)?.t ?? Infinity : Infinity);
// LED 외곽 상자가 부품과 겹치는 LED 수(상태 표시줄 ① 간섭과 같은 기준) — 렌즈가 둥글어 메쉬로는 비켜 가도(여유 0.05 mm) 상자가 겹치면 경고가 뜨므로 최적화도 같은 기준으로 피함
const ledPcbEx = (M, line, rt) => { const pcb = L.stepLayout(M, line)?.pcb ?? -1; return pcb >= 0 ? [rt.parts.length + pcb] : []; };
const boxClashN = (M, line, rt) => new Set(checkInterference({ rt, mspec: M, bodies: L.ledBodies(M, line), exclude: ledPcbEx(M, line, rt) }).items.filter((x) => x.kind !== 'potted').map((x) => x.led)).size;
// ② 로 옮긴 자리의 ⑤ 범위(2026-11-03) — 같은 구조라 LED 5개만, 하나 잴 때마다 화면에 양보(전부 재면 12.9 초 멈춤 실측). 직접 배치·실패 = 처음 범위
async function adHeightRangeAt(M, line, rt, fallback) {
  if (M.light.kind !== 'step') return fallback;
  try {
    const d = line.frame.d, nd = d.map((v) => -v), mech = rt.parts, all = L.ledPartsNow(M, line) ?? [], pick = all.length > 5 ? [0, 1, 2, 3, 4].map((i) => all[Math.round((i * (all.length - 1)) / 4)]) : all;
    if (!pick.length) return fallback;
    const bs = L.ledBodies(M, line), bPick = bs.length > 5 ? [0, 1, 2, 3, 4].map((i) => bs[Math.round((i * (bs.length - 1)) / 4)]) : bs, ex = ledPcbEx(M, line, rt);
    let up = boxTravel({ rt, mspec: M, bodies: bPick, d, maxD: 10, exclude: ex }), down = boxTravel({ rt, mspec: M, bodies: bPick, d: nd, maxD: 10, exclude: ex });
    for (const p of pick) {
      await new Promise((res) => setTimeout(res, 0));
      const pre = interferenceKeys(p, mech, [], []), obs = mech.map((m, j) => (pre.has(`p:${j}`) ? null : m));
      up = Math.min(up, travelDistance(p, obs, d, 10)); down = Math.min(down, travelDistance(p, obs, nd, 10));
    }
    return ledHeightRange({ up, down });
  } catch { return fallback; }
}
async function adHeightInfo(M0, line, rt) {
  const d = line.frame.d, nd = d.map((v) => -v), mech = rt.parts, em = L.currentEmitters(M0, line);
  let up = Infinity, down = Infinity;
  if (M0.light.kind === 'step') {
    const tick = pacer();   // LED 마다 화면에 양보(40 개면 1.9 초 걸림)
    for (const p of L.ledPartsNow(M0, line) ?? []) {
      await tick();
      const pre = interferenceKeys(p, mech, [], []), obs = mech.map((m, j) => (pre.has(`p:${j}`) ? null : m));
      up = Math.min(up, travelDistance(p, obs, d, 10)); down = Math.min(down, travelDistance(p, obs, nd, 10));
    }
  } else for (const e of em) for (const m of mech) { up = Math.min(up, rayT(m, e.pos, d)); down = Math.min(down, rayT(m, e.pos, nd)); }
  const range = ledHeightRange({ up, down });
  if (M0.light.kind === 'manual') range[1] = Math.min(range[1], Math.max(0, M0.light.manual.pcb.depth - 0.3));   // 깊이 > 0 유지
  const op = [...new Set(M0.observe.faces.map((f) => f.part))];
  let gap = Infinity; for (const e of em) for (const i of op) gap = Math.min(gap, rayT(mech[i], e.pos, d));
  return { range, gap: Number.isFinite(gap) ? gap : NaN };
}
// 보완 자동 추가(목표 미달 시): 체크한 항목만으로 목표 미달이면 다른 항목을 더해 다시 실행 — 바꾸는 비용이 적은 순서:
// ④ 케이스 면(표면 처리) → ⑤ LED 높이(기구 치수) → ④+⑤ → ② LED 배치(PCB·LED 수) → ②+④ → ②+④+⑤. 처음 통과한 안에서 멈춤.
// 체크한 항목만의 결과는 base 로 결과 위에 남기고, 보완 실행이 실패·중지되면 직전 결과를 다시 보여 줌. 적용은 사용자가 정함
const BOOST_SETS = [['housing'], ['height'], ['housing', 'height'], ['leds'], ['leds', 'housing'], ['leds', 'housing', 'height']];
const BOOST_LABEL = { housing: '④ 케이스 면', height: '⑤ LED 높이', leds: '② LED 배치', milky: '① Milky' };
// 최적화 대시보드 — 실행 시작 때 체크한 항목으로 초기화, 끝나면 결과 표시
function dashReset(only = null) {   // only = 이번에 돌릴 단계(이어서 최적화) — 없으면 체크 상태
  const st = adState(), avail = adAvail(A.store.mspec), O = A.store.mspec.observe;
  const on = (k) => (only ? !!only[k] : !!st.sel[k] && !!avail[k]?.ok);
  A.optDash?.reset({ stages: { milky: on('milky'), position: on('leds') || on('height'), shape: on('shape'), housing: on('housing') }, tgLen: O.targetLen, tgWid: O.targetWid, locked: { ...(st.locked ?? {}) } });
}
// 검증 후보 이름(⑥) — 바뀐 항목만 짧게
function verifyLabel(d) {
  const t = [];
  if (d.milky != null) t.push(`Milky ${(+d.milky).toFixed(2)}`);
  if (d.layoutText) t.push(d.layoutText); else if (d.count != null && d.stepVirt) t.push(`${d.rows === 2 ? '2열×' : ''}${d.count}개`);
  if (d.finish) t.push(finishText(d.finish, reflCat()));
  if (d.dz) t.push(`높이 ${d.dz >= 0 ? '+' : ''}${(+d.dz).toFixed(2)}`);
  if (d.shape) t.push('형상');
  return t.length ? t.join(' · ') : '현재안';
}
async function adRunBoost() {
  const st = adState();
  dashReset();
  let r = await adRun();
  if (!r || r.feasible || !st.result) return;
  if (st.sel.boost === false) return;
  const b0 = st.result, base = { Ulen: b0.best.Ulen, Uwid: b0.best.Uwid, milky: b0.best.milky, reason: b0.reason, unchanged: b0.unchanged };
  const avail = adAvail(A.store.mspec), checked = r.stages;
  const sets = BOOST_SETS.filter((set) => set.every((k) => !checked[k] && avail[k]?.ok));
  let good = b0;
  for (const [i, set] of sets.entries()) {
    const added = set.map((k) => BOOST_LABEL[k]);
    A.optDash?.addStages({ position: set.includes('leds') || set.includes('height') }, `보완 ${i + 1}/${sets.length}: ${added.join(' + ')}`);
    r = await adRun({ stages: { ...checked, ...Object.fromEntries(set.map((k) => [k, true])) }, added, base, step: `${i + 1}/${sets.length}` });
    if (!r) {   // 실패·중지 — 직전 결과를 다시 보여 줌
      if (A && !st.running) { st.result = { ...good, note: `보완(${added.join(' + ')}) 계산이 끝나지 못함 — 직전 결과를 표시` }; A.meshShown = null; renderView(); renderAuto(); }
      return;
    }
    good = st.result;
    if (r.feasible) return;
  }
}
const progress0 = (t) => { const st = A?.ad; if (st?.running) { st.running = { ...st.running, text: t }; renderAuto(); } };
async function adRun(opt = {}) {
  const a = A, st = adState(), S = A.store.session;
  if (!S.line || st.running) return null;
  const why = adBlock();
  if (why) { setStatus(why); return null; }
  if (/^기구 최적화 실패/.test(S.status ?? '')) setStatus('');   // 지난 실패 문구는 지움
  const M0 = adClone(A.store.mspec), line = S.line, rt = getMech3d();   // 실행 격리 — 편집은 실행을 중지시킴(onChange)
  const avail = adAvail(M0), stages = opt.stages ?? { milky: st.sel.milky && avail.milky.ok, leds: st.sel.leds && avail.leds.ok, shape: st.sel.shape && avail.shape.ok && avail.shape.parts.includes(st.sel.shapePart),
    height: st.sel.height && avail.height.ok, housing: st.sel.housing && avail.housing.ok && avail.housing.parts.includes(st.sel.housingPart) };
  st.milkyPart = adMilkyPart(M0, avail);
  const hpSel = avail.housing?.parts?.includes(st.sel.housingPart) ? st.sel.housingPart : defaultHousingPart(M0, adInfo().boxes);   // 보완으로 ④ 를 더했으면 기본 케이스 부품
  // 최적화 판정 격자 = 늘 저화질(2026-11-02) — 고화질 칸(0.5 mm)으로 짧게 평가하면 노이즈가 '불균일' 로 보여 값이 크게 낮게 나오고(실측 길이 균일도 0.65 vs 정밀 0.76)
  // LED 를 너무 많이 쓰거나 간격이 제멋대로가 됨. 화면 화질은 그대로, 최적화 평가만. 후보를 고른 뒤 최종 판정만 화면 화질 격자(Gs)로(io.verify screen, 2026-11-03)
  const lowQ = (M0.observe.quality ?? 'low') === 'low', obs = tallyObs({ ...M0.observe, quality: 'low' }, M0.observe.dir ?? line.frame.d), G = lowQ ? geometry(tallyObs(M0.observe, M0.observe.dir ?? line.frame.d)) : tallyGeometry(line, obs), sp = st.sel.shapePart, hp = stages.housing ? hpSel : -1;
  const ctx = { M0, line, G, obs, rt, mp: st.milkyPart };
  const obsS = lowQ ? obs : tallyObs(M0.observe, M0.observe.dir ?? line.frame.d), Gs = lowQ ? G : geometry(obsS), ctxS = { ...ctx, G: Gs, obs: obsS };
  const R = (st.runner = createAdRunner({ ports: A.pool.ports(), chunkTimeoutMs: 90000 }));   // 높은 Milky 청크는 30 초를 넘기기도 함
  // 같은 Worker 를 쓰므로 점진 계산은 멈춤 — 대기(디바운스) 중이면 장면을 곧 보내므로 취소. 사용자 일시정지 여부는 기억(끝나고 그대로)
  const snap0 = A.prog.snapshot(), ps = snap0.state, currentVerified = reusableCurrent(snap0, G), curS = lowQ ? null : reusableCurrent(snap0, Gs), currentScreen = curS ? { ...curS, sharp: true } : null;   // 수렴한 점진 결과 = 현재안(verify 생략)
  st.userPaused = ps === 'paused'; st.deferred = ['paused', 'running', 'pending', 'starting'].includes(ps);
  if (ps === 'pending') A.prog.cancel(); else A.prog.pause();
  st.running = { frac: 0, text: '준비' }; st.result = null; st.caseSel = null; st.casePv = null; A.meshShown = null; renderView(); renderAuto();
  let hInfo = null; if (stages.height) { try { hInfo = await adHeightInfo(M0, line, rt); } catch { stages.height = false; } if (A !== a) return null; }   // 범위 계산 실패 = ⑤ 생략. 실행 중 표시(running) 뒤에 해야 양보하는 동안 두 번 실행되지 않음
  // LED STEP: 현재 = 가상이면 그 개수·피치, 아니면 현재 발광점 수·0(stepOrig = 원래 위치) · stepVirt = 설계가 가상 배치인가(② 가 STEP 에서 돌면 엔진이 true)
  const stp = M0.light.kind === 'step', sv0 = stp ? M0.light.step?.virtual ?? null : null, sv = sv0 && !sv0.positions ? sv0 : null;   // STEP 에서 편집한 배치(positions) = 원래 배치처럼 '현재 그대로'
  let nOrig = 0; if (stp && !sv) { try { nOrig = L.currentEmitters(M0, line).length; } catch { nOrig = 0; } }
  const rsrc = stp ? sv : M0.light.manual, rows = rsrc?.rows === 2 ? 2 : 1;   // 열 배치 — STEP 원래 위치 = 1열
  const cur = { milky: ctx.mp != null ? M0.parts[ctx.mp].material.milky : null, count: stp ? (sv ? sv.count : nOrig) : M0.light.manual?.count ?? 0, pitch: stp ? sv?.pitch ?? 0 : M0.light.manual?.pitch ?? 0, rows, rowGap: rows === 2 ? rsrc.rowGap ?? 0 : 0, shape: null, finish: null, dz: 0, ...(stp ? { stepOrig: !sv, stepVirt: !!sv } : {}) };
  ctx.cur = cur;
  // ② LED 폭 위치 이동 후보(PCB 위·간섭 없음) — 위치 단계를 켰고 LED STEP 일 때만
  let latS = null, lateral = null;
  if (stages.leds) { progress0('LED 폭 위치 후보 찾는 중'); try { const lc = await lateralCandidates(M0, line, rt, ctx); if (lc) { lateral = lc.cs; latS = lc.ss; } } catch { lateral = null; } if (A !== a) return null; }
  // ④ 후보 = 반사 소재 상한 안(+ 특수 허용 시 특수 처리) — 소재 미지정 = 전체 등급(spec P4 §2.3d)
  const finCands = (k) => finishCandidatesFor({ catalog: reflCat(), materialId: M0.parts[k].reflMaterial, current: M0.parts[k].finish, allowSpecial: !!st.sel.housingSpecial });
  const finishCands = stages.housing ? finCands(hp) : null;
  const varTot = { height: (hInfo ? heightCandidates(hInfo.range, 7).length : 0) + 2, housing: (finishCands?.length ?? 0) + 2 }, varI = { height: 0, housing: 0 };   // 진행률 분모 = 1차 후보 + 정밀 2개
  const minWall = { ...defaultChecks(), ...(M0.checks ?? {}) }.minWall, t0 = R.now();
  // ③ 변수 범위(Δt·h·R·e·c) — 엔진이 선별 → 격자 → 압축. 진행률 분모는 io.shapePlan 으로 받음(격자 크기 모르는 선별 중엔 최대 격자 27 로 어림)
  // ③ 입광면 보정 지도 — 길이 절점 간격 = LED 피치의 ⅛(2~6 mm, LED 물결을 잡게), 폭 7 절점. 광자 = 압축 마지막 단계 예산(광 효율 반비례)
  // ③ 기본 = 빠른 형상(LED 중심 렌즈 후보, 2026-11-05). opt.precise = 정밀(측정 응답으로 입광면 곡면 전체를 풂 — 시간이 더 걸림)
  const quickShape = !!stages.shape && !opt.precise, caseLog = [];   // caseLog = 후보 표에 남길 평가 결과
  const lens = quickShape ? (() => {
    const base = adBaseMesh(sp, ctx), F = shapeFrame(base, line), H = heightsFor(base, F, 0.5), thick = minThickness(H, shapeModFor({ dt: 0, h: 0, R: 1 }, M0, line, F));
    const pitch = cur.count > 1 ? (cur.pitch > 0 ? cur.pitch : line.length / cur.count) : line.length, P0 = shapeModFor({ dt: 0, h: 0, R: 1 }, M0, line, F), lay = M0.light.kind === 'step' ? L.stepLayout(M0, line) : null, rOut = fieldRoom(H, P0, F, 8, 3, [...rt.parts.filter((_, j) => j !== sp), ...(lay?.pcb >= 0 && !M0.light.pcbOff ? [lay.parts[lay.pcb]] : [])]);   // 두껍게 할 여유 = 기구 부품·LED STEP PCB 까지(간섭 직전). LED 는 렌즈가 비켜 가므로 후보 평가에서 거름
    const room = Math.min(...rOut), arg = { thick, minWall, pitch, roomOut: Number.isFinite(room) ? room : thick }, cands = opt.shapeDeep ? lensCandidates(arg) : swingCandidates(arg), sm = opt.startShape ?? M0.parts[sp]?.shapeMod;
    if (cands.length && sm) cands.push((({ dt, h, R, e, c, kL, kW, kF }) => ({ dt, h, R, e, c, kL, kW, kF }))(sm));   // 이미 적용한 형상도 후보 — 더 나으면 유지
    const sb = shapeBudget(currentVerified?.eff ?? snap0.photometry?.eff).schedule;
    return { cands, schedule: [[99, sb[0][1], sb[0][2]], [opt.shapeDeep ? 6 : 2, sb[1][1], sb[1][2]]], why: `움직일 여유가 없음(두께 ${thick.toFixed(2)} mm · 최소 살두께 ${minWall} mm · 입광면 앞 틈 ${Number.isFinite(room) ? room.toFixed(2) : '–'} mm) — 형상을 바꾸지 못함` };
  })() : null;
  const shapeField = stages.shape && !quickShape ? (() => { const pitch = cur.count > 1 ? (cur.pitch > 0 ? cur.pitch : line.length / cur.count) : line.length, ds = Math.min(6, Math.max(2, pitch / 8)), sb = shapeBudget(currentVerified?.eff ?? snap0.photometry?.eff).schedule.at(-1); return { ns: Math.ceil(line.length / ds) + (line.closed ? 0 : 1), nw: 7, N: sb[1], maxMs: sb[2], W: line.width / 2, ledSOf: (d) => { try { const q = L.currentEmitters(designScene(d, ctx).M, line).map((e) => line.toSW(...line.to2D(e.pos))[0]).sort((a, b) => a - b); return q.filter((v, i) => !i || v - q[i - 1] > 1e-6); } catch { return []; } } }; })() : null;
  let shapeI = 0, shapeScr = 0, shapeTot = 1;
  const progress = (stage, frac, text) => {   // 전체 진행률(단계 무게) + 남은 시간
    if (A !== a || R.stopped) return;
    const f = overallFrac(stages, stage, frac), eta = /몇 분/.test(text) ? '' : etaText(R.now() - t0, f);
    const tx = opt.added?.length ? `보완 ${opt.step ?? ''} (${opt.added.join(' + ')}) · ${text}` : text;
    A.optDash?.progress(stage, frac, tx, f);
    st.running = { frac: f, text: eta ? `${tx} · ${eta}` : tx }; renderAuto();
  };
  // 현재안 계산·최종 판정은 한 번의 긴 계산 — 계산하는 동안에도 %가 오르게(광선 수·시간 한도 기준, 0.3 초마다)
  let lastP = null, lastTick = 0;
  const report = (stage, frac, text) => { lastP = { stage, frac, text }; progress(stage, frac, text); };
  const traceTick = (f) => {
    if (!lastP || (lastP.stage !== 'current' && lastP.stage !== 'verify') || R.now() - lastTick < 300) return;
    lastTick = R.now();
    const v = lastP.frac + (1 - lastP.frac) * f * 0.95;
    if (overallFrac(stages, lastP.stage, v) >= (st.running?.frac ?? 0)) progress(lastP.stage, v, lastP.text);
  };
  const io = {
    progress: report,
    now: () => R.now(),   // 일시정지한 시간은 시간 한도에서 뺌
    cancelled: () => R.stopped,
    shapePlan: ({ screen, total }) => { shapeScr = screen; shapeTot = Math.max(1, total ?? shapeTotal(screen, 27)); },
    async milkyRows(d, ms, { precise = false, peek = false } = {}) {   // 재가중 기준 = 창 가운데. 시간 제한(Milky 4~5 는 광자당 ~10배) — 경계가 든 창은 정밀 재추적
      const { M: Md, parts } = designScene({ ...d, milky: ms[Math.floor(ms.length / 2)] }, ctx);
      const hi = ms[Math.floor(ms.length / 2)] >= 6;   // 높은 Milky 는 광자당 매우 느림 — 탐색 창은 최소 광자를 낮춤(정밀 창은 그대로)
      const r = await R.trace(adJob(Md, parts, ctx), { ...(precise ? { N: 3e6, maxMs: 6000 } : { N: 1.5e6, maxMs: 2000, minN: hi ? 5e4 : 1e5 }), rw: { part: ctx.mp, milkies: ms } });
      const rows = milkyRows(G, obs, { milkies: ms, batches: r.rwBatches, ess: r.ess, emitted: r.ledger.emitted });
      if (!peek) A.optDash?.evals('milky', rows.filter((q) => q.trusted).map((q) => ({ label: `Milky ${(+q.milky).toFixed(2)}`, v: +q.milky, Ulen: q.Ulen, Uwid: q.Uwid })));   // 믿을 수 있는(ESS 충분) 격자점만
      return rows;
    },
    // ② 후보 = (s, w) 격자(spec P4 §2.2b): s 2 mm × w ∈ {0, ±δk}, δk = 0.2/0.27/0.33·W(반폭 − 0.5 로 자름) — 후보 수 ≈ (L/2+1)·7, 후보당 ≤ 1.2만 광자(60 s 예산)
    async basis(d) {   // ①·④ 를 함께 켜면 실행기가 d.milky = 거친 최고점 · d.finish = 최고 등급으로 넘김(§2.2c)
      const gaps = st.sel.oneRow ? [] : rowGapOptions(line), wc = rw4(d.wCenter ?? 0),   // 1열만 = 2열 후보 계산 생략
      cand = candidateGrid(line, { sStep: 2, wOffsets: [wc, ...gaps.flatMap((g) => [rw4(wc - g), rw4(wc + g)])] });   // 폭 위치(wc) 중심
      const { M: Md, parts } = designScene({ ...d, rows: 1, rowGap: 0 }, ctx), ledHalf = ledHalfWidth(Md, line);
      let sets;
      if (Md.light.kind === 'step') {   // 기준 LED 발광점을 후보 위치로 · 장면은 LED 몸체 없이(PCB·기타만 = 가상 0개)
        sets = virtualEmittersAt({ parts: L.ledPartsNow(Md), step: Md.light.step, line, positions: cand }).map((e) => [e]);
        Md.light.step.virtual = { count: 0, pitch: 0 };
      } else sets = cand.map(({ s, w }) => [ledAtS(line, s, Md.light.manual, rt, w)]);
      // 시간 예산 60 s(spec §2.2c): 후보당 1.2만 광자, 넘치면 줄임(≥ 3000) — 지도는 후보마다 방출 1 기준(emitted = 1)
      const r = await R.traceEach(adJob(Md, parts, ctx, { emitters: sets[0] }), sets, { N: 30000, maxMs: 60000, minN: 3000, onProgress: (i, n) => progress('leds', i / n, `LED 위치 후보 시험 ${i}/${n}`) });
      // 간섭 방지: LED 몸체 반폭 + 0.3 mm 만큼 라인 끝에서 떨어지게(끝벽), 2열 간격도 반폭만큼 안쪽(측벽)
      const m = ledHalf + 0.3, gapsOk = gaps.filter((g) => !(line.width > 0) || g + m <= line.width / 2 + 1e-9);
      return { cand, maps: r.maps, emitted: r.emitted, gaps: gapsOk, sMargin: m, minGap: Math.max(2, 2 * ledHalf + 0.2) };
    },
    async evalShapes(d, cands, N, maxMs = 2500) {   // 단계별 광자·시간 제한은 halving 일정(6만/20만/60만 · 2.5/4/6초)
      const out = [], base = adBaseMesh(sp, ctx), H = heightsFor(base, shapeFrame(base, line), 0.5);
      let fieldT = null, fieldR = null, t00 = null;
      const others = rt.parts.map((p, j) => (j === sp ? null : p)), lp = (M0.light.kind === 'step' && L.ledPartsNow(designScene(d, ctx).M, ctx.line)) || [];   // ② 가 바꾼 가상 배치 몸체 포함
      // 기준 겹침 = '변화 없음' 형상(같은 세분·변형 경로)의 겹침 — 원본 메쉬로 재면 케이스 벽에 닿아 있는 부품(접촉)은
      // 세분 메쉬가 늘 '새 간섭' 으로 잡혀 모든 후보가 탈락했음(2026-10-21)
      const zc = { dt: 0, h: 0, R: cands[0]?.R ?? 1, e: 0, c: 0 }, zp = designScene({ ...d, shape: { part: sp, ...zc } }, ctx).parts[sp];
      const before = new Map(); for (const M of [interferenceKeys(base, others, lp, []), interferenceKeys(zp, others, lp, [])]) for (const [k, v] of M) before.set(k, Math.max(before.get(k) ?? 0, v ?? 0));   // 부품별 기존 겹침 깊이
      for (const c of cands) {
        if (R.stopped) break;
        progress('shape', Math.min(1, shapeI / shapeTot), shapeI < shapeScr ? `형상 변수 선별 ${shapeI + 1}/${shapeScr}` : `형상 후보 ${Math.min(shapeI + 1, shapeTot) - shapeScr}/${shapeTot - shapeScr}`); shapeI++;
        if (c.kF) {   // 얇은 자리는 덜 깎고, 입광면 앞에 부품·LED 가 가까운 자리는 덜 더함
          const P0 = shapeModFor({ dt: 0, h: 0, R: 1 }, designScene(d, ctx).M, line, shapeFrame(base, line));
          c.kF = clampField(c.kF, (fieldT ??= fieldThickness(H, P0, c.kF.ns, c.kF.nw)), minWall, H.t0 / 2, (fieldR ??= fieldRoom(H, P0, shapeFrame(base, line), c.kF.ns, c.kF.nw, [...others, ...lp])));
        }
        const { M: Md, parts } = designScene({ ...d, shape: { part: sp, ...c } }, ctx), mod = Md.parts[sp].shapeMod;
        const thin = minThickness(H, mod) < Math.min(minWall, (t00 ??= minThickness(H, { ...mod, dt: 0, h: 0, e: 0, c: 0, kL: null, kW: null, kF: null })) - 1e-3);   // 칸 중심 + LED 중심. 원래부터 얇은 자리(뾰족한 가장자리 등)는 더 얇아질 때만 탈락 — 전에는 변형 없는 안까지 탈락할 수 있었음
        const clash = !thin && newInterference(parts[sp], others, lp, before, 0.05) != null;   // 새 겹침 또는 기존보다 0.05 mm 넘게 깊어짐 — 찾는 즉시 멈춤(깊은 겹침도 빠르게)
        if (thin || clash) { caseLog.push({ c: caseCand(c), ok: false, why: thin ? '살두께' : '간섭' }); out.push({ cand: c, ok: false, why: thin ? '살두께' : '간섭' }); A.optDash?.evals('shape', [{ label: shapeText(c), ok: false, why: thin ? '살두께' : '간섭' }]); continue; }
        // 같은 난수 비교(crn) — 형상 후보마다 같은 광자 난수(시드·청크·포트 고정)로 추적해 후보 차이만 남김(노이즈 ↓). N 전부(시간 제한 없음)
        const r = await R.trace(adJob(Md, parts, ctx), { N, batches: 4, crn: SHAPE_CRN }), stt = tallyStats(G, r.batches, obs);
        out.push({ cand: c, ok: !stt.empty, stats: stt, eff: adEff(r) });
        caseLog.push({ c: caseCand(c), Ulen: stt.Ulen, Uwid: stt.Uwid, ok: !stt.empty, ...(stt.empty ? { why: '빛 없음' } : {}), N });
        A.optDash?.evals('shape', [{ label: shapeText(c), Ulen: stt.Ulen, Uwid: stt.Uwid, ok: !stt.empty }]);
      }
      return out;
    },
    async evalLateral(d, cs) {   // ② LED 폭 위치 후보 — 지금 배치(s)를 폭 c 로 옮긴 설계를 같은 난수로 짧게 비교
      const ss = latS ?? [], out = [], { N } = shapeBudget(currentVerified?.eff ?? snap0.photometry?.eff).screen;
      for (const [i, c] of cs.entries()) {
        if (R.stopped) break;
        progress('leds', (0.3 * i) / cs.length, `LED 폭 위치 ${c > 0 ? '+' : ''}${c} mm (${i + 1}/${cs.length})`);
        const dd = { ...d, positions: ss.map((s) => ({ s, w: c })), count: ss.length, rows: 1, rowGap: 0, stepVirt: true }, { M: Md, parts } = designScene(dd, ctx);
        const r = await R.trace(adJob(Md, parts, ctx), { N, batches: 4, crn: SHAPE_CRN }), stt = tallyStats(G, r.batches, obs);
        out.push({ cand: { wCenter: c }, ok: !stt.empty, stats: stt, eff: adEff(r) });
        A.optDash?.evals('leds', [{ label: `폭 위치 ${c > 0 ? '+' : ''}${c} mm`, Ulen: stt.Ulen, Uwid: stt.Uwid, ok: !stt.empty }]);
      }
      return out;
    },
    async evalVariants(d, cands, N, maxMs = 2500) {   // ⑤ { dz } · ④ { finish } 후보 — 형상 평가와 같은 예산(간섭은 범위가 이미 피함)
      const out = [], stg = cands.length && 'dz' in cands[0] ? 'height' : 'housing', nm = stg === 'height' ? 'LED 높이' : '케이스 면';
      for (const c of cands) {
        if (R.stopped) break;
        if (stages[stg]) { const k = ++varI[stg]; progress(stg, Math.min(1, (k - 1) / varTot[stg]), `${nm} 후보 ${Math.min(k, varTot[stg])}/${varTot[stg]}`); }   // ① 보완 계산(④ 미선택)은 ① 진행률 그대로
        const { M: Md, parts } = designScene({ ...d, ...('dz' in c ? { dz: c.dz } : { finish: c.finish }) }, ctx);
        const r = await R.trace(adJob(Md, parts, ctx), { N, maxMs, minN: Math.min(N, 3e4), batches: 4 }), stt = tallyStats(G, r.batches, obs);
        out.push({ cand: c, ok: !stt.empty, stats: stt, eff: adEff(r) });
        if (stages[stg]) A.optDash?.evals(stg, [{ label: 'dz' in c ? `높이 ${c.dz >= 0 ? '+' : ''}${(+c.dz).toFixed(2)} mm` : finishText(c.finish, reflCat()), Ulen: stt.Ulen, Uwid: stt.Uwid, ok: !stt.empty }]);
      }
      return out;
    },
    heightRange: (d) => adHeightRangeAt(designScene(d, ctx).M, line, rt, hInfo?.range ?? [0, 0]),   // ⑤ 후보 범위 = ② 로 옮긴 자리 기준
    async verify(d, { noise = null, from = null, screen = false, maxMs = 600000, rough = false } = {}) {   // screen = 화면 화질 격자로(칸이 작을수록 칸마다 광자가 적음 → 칸 비만큼 광자를 더). noise = 그 노이즈까지(잰 값에서 필요한 광자 수를 노이즈, 10 분 한도). 정밀 재판정(현재안·최종안): 250만 광자(최소 150만, 20초까지) — 광자가 적으면 균일도(최저÷최고)가 노이즈 때문에 낮게 나옴(6초 제한 때 0.69 vs 실제 0.78)
      const { M: Md, parts } = designScene(d, ctx);
      const scr = screen && !lowQ, gridK = scr && !from?.screen ? Math.max(G.ds / Gs.ds, G.cell / Gs.cell) : 1, capN = 4e8 * (scr ? { mid: 2, high: 4 }[obsS.quality] ?? 1 : 1), sig = JSON.stringify(d), resume = noise ? resumable(from, sig, scr) : null;   // 같은 설계·격자를 더 정밀하게 잴 때는 앞 계산에 이어서(N = 전체 광자 수)
      const eff0 = currentVerified?.eff ?? snap0.photometry?.eff, r = await R.trace(adJob(Md, parts, scr ? ctxS : ctx), noise ? { N: Math.ceil(Math.min(capN, 1.1 * gridK * (from?.photons ?? 5e7) * ((from?.stats?.relNoise ?? 0.01) / noise) ** 2)), maxMs, minN: rough ? 2e5 : 1.5e6, chunkN: 2e5, batches: 10, keepRaw: true, resume, onProgress: traceTick } : { N: Math.ceil(Math.min(1.5e7, 5e6 * Math.max(1, 0.5 / (eff0 > 0 ? eff0 : 0.5)))), maxMs: d.shape?.kF ? 60000 : 45000, minN: rough ? 2e5 : 1.5e6, batches: 10, keepRaw: true, onProgress: traceTick });   // 효율이 낮으면 관측면에 닿는 빛이 적어 광자를 더. 실측: 20 초(노이즈 2%) 판정 0.73~0.76 vs 수렴값 0.78~0.79 — 노이즈가 칸 최소·최대를 벌려 낮게 나오므로 시간을 늘림(2026-11-03). 입광면 보정 메쉬는 추적이 느려 같은 시간이면 노이즈가 커져 현재안과 공정하게 비교가 안 됨 → 시간 더
      const stt = scr ? tallyStats(Gs, r.batches, obsS) : tallyStats(G, r.batches, obs);
      A.optDash?.evals('final', [{ label: verifyLabel(d), Ulen: stt.Ulen, Uwid: stt.Uwid, ok: !stt.empty }]);
      return { stats: stt, eff: adEff(r), photons: r.photons, screen: scr, sig, raw: scr || lowQ ? r.kept : null };
    },
    trace: (stage, list) => A.optDash?.evals(stage, list),   // 엔진이 직접 알리는 결과(② 배치 Solver 최선안·대안)
  };
  // ① 보완 계산 — ④ 를 안 쓸 때만: 기본 케이스 부품의 면 처리 한 단계 위(최고 등급이면 생략)
  let housingProbe = null;
  if (stages.milky && !stages.housing && avail.housing?.ok) {
    const k = defaultHousingPart(M0, adInfo().boxes), nf = avail.housing.parts.includes(k) ? nextFinish(M0.parts[k].finish, finCands(k).filter((f) => !f.current)) : null;   // 소재 상한 안(특수 허용 시 특수 포함) — 없으면 안내 생략
    if (nf) housingProbe = { part: k, kind: nf.kind, R: nf.R, ...(nf.coating ? { coating: nf.coating } : {}) };
  }
  let res = null;
  try {
    res = await runAutoDesign({
      stages, obs, G, line, current: cur, milkyMax: st.sel.milkyMax ?? null, housingProbe, finishText: (f) => finishText(f, reflCat()), nMax: Math.max(1, Math.min(60, Math.floor(line.length / 2))), pitchRange: null, stepMode: stp, currentIrregular: stages.leds && (() => { try { const q = pitchOf(L.currentEmitters(M0, line).map((e) => { const [s, w] = line.toSW(...line.to2D(e.pos)); return { s, w }; })); return !q.uniform; } catch { return false; } })(),
      shapePart: sp, shapeField, ...(opt.caseCheck ? { shapeCands: [opt.caseCheck], schedule: [[1, lens.schedule[0][1], lens.schedule[0][2]]], curve: false, fixedShape: true } : quickShape ? { shapeCands: lens.cands, schedule: lens.schedule, curve: false, shapeEmptyWhy: lens.cands.length ? null : lens.why } : {}),
      shapeStart: stages.shape && M0.parts[sp]?.shapeMod ? (({ dt, h, R, e, c, kL, kW, kF }) => ({ dt, h, R, e, c, kL, kW, kF }))(M0.parts[sp].shapeMod) : null,   // 이미 적용한 형상에서 이어서
      lateral, rowsOptions: st.sel.oneRow ? [1] : [1, 2], currentVerified, screenGrid: !lowQ, currentScreen, heightRange: hInfo?.range ?? null, housingPart: hp, finishCands, ledsAtCurrentMilky: !!opt.added?.length,
    }, io);
  } catch (e) { if (A === a && !R.stopped) setStatus(`기구 최적화 실패: ${e.message}`); }
  if (A !== a) return;   // 그사이 이탈
  const clashN = res && !res.cancelled && !R.stopped ? await designClash(res.best, ctx, M0, rt, line) : 0;   // running 을 끄기 전에 — 양보하는 동안 다시 실행되지 않게
  if (A !== a) return;
  globalThis.__adLast = res;   // 진단용(콘솔에서 단계별 결과 확인)
  st.running = null; st.runner = null; st.paused = false;
  if (res && !res.cancelled && !R.stopped) {
    const C = res.current;   // 현재안 = 최종안과 같은 추정기
    let nStep = null; if (M0.light.kind === 'step') { try { nStep = L.currentEmitters(M0, line).length; } catch { nStep = 0; } }
    const smI = sp >= 0 && M0.parts[sp]?.shapeMod ? sp : M0.parts.findIndex((p) => p.shapeMod), sm = smI >= 0 ? M0.parts[smI].shapeMod : null;   // 비교표 '현재' 열 — 이미 적용된 형상(표시만)
    st.resultOpen = false;   // 끝나면 결과 카드(요약)만 — 자세한 결과 창은 [자세히]
    st.result = { seed: res.verified?.raw ?? null, shapeLimited: !!res.steps?.find((x) => x.stage === 'shapeField')?.limited, milkyRows: stages.milky ? milkyTable(res.steps ?? []) : null, targets: { len: obs.targetLen, wid: obs.targetWid, judge: judgeStats(res.verified?.stats, A.store.mspec.observe) }, design: res.best, feasible: res.feasible, reason: res.reason, shapeSwing: quickShape && !opt.shapeDeep && !opt.caseCheck, caseCheck: !!opt.caseCheck, shapeNote: res.shapeNote ?? null, hint: res.hint ?? null, peek: res.peek ?? null, lowered: res.milkyLowered ?? null, shape: res.best.shape ?? null, screen: res.steps?.find((x) => x.stage === 'shapeScreen')?.gains ?? null, stepLeds: nStep, unchanged: !!res.unchanged, ctx, stages,
      added: opt.added ?? [], base: opt.base ?? null, clash: clashN,
      finish: stages.housing ? (() => { const c = { ...M0.parts[hp].finish, ...(M0.parts[hp].coating ? { coating: M0.parts[hp].coating } : {}) }; return { cur: c, best: res.best.finish ?? c }; })() : null, height: stages.height && hInfo ? { dz: res.best.dz ?? 0, gap: hInfo.gap } : null,
      cur: { ...cur, shape: sm ? { dt: sm.dt, h: sm.h, R: sm.R, e: sm.e ?? 0, c: sm.c ?? 0, kF: sm.kF ?? null } : null, Ulen: C?.stats?.Ulen, Uwid: C?.stats?.Uwid, eff: C?.eff ?? NaN, profile: C?.stats?.profile ?? null },
      best: { ...res.best, ...(stp ? { stepOrig: !res.best.stepVirt } : {}), Ulen: res.verified.stats.Ulen, Uwid: res.verified.stats.Uwid, eff: res.verified.eff, profile: res.verified.stats.profile ?? null } };
    const gd = res.unchanged ? res.steps?.find((x) => x.stage === 'guard') : null;   // 찾은 후보가 현재안보다 노이즈 수준만큼만 나음 — 원하면 적용
    if (gd?.tried && gd.triedVerified?.stats) st.result.alt = { design: gd.tried, Ulen: gd.triedVerified.stats.Ulen, Uwid: gd.triedVerified.stats.Uwid, eff: gd.triedVerified.eff, milky: gd.tried.milky };
    if (stages.shape) adSaveCases({ opt, res, M0, sp, stages, caseLog });
  }
  // Worker 에 기구 최적화 장면이 올라가 있음 — 진행 중이던 계산·실행 중 편집은 다시 시작, 끝난 계산은 그대로.
  // restart 는 일시정지 상태를 이어가므로(wantPaused) 사용자가 멈춘 게 아니면 resume(대기 중 resume = 일시정지 요청 해제)
  if (st.deferred) { st.deferred = false; restartCalc(); if (st.userPaused) A.prog.pause(); else A.prog.resume(); }
  A.meshShown = null; renderView(); renderAuto();
  if (res && !res.cancelled && !R.stopped && st.result) A.optDash?.finish(!!res.feasible, res.feasible ? '' : res.reason ?? '', st.result?.best?.eff, res.verified?.stats ?? null);
  return res && !res.cancelled && !R.stopped && st.result ? { feasible: !!res.feasible, stages } : null;
}
// 형상 후보 표(2026-11-05) — 마지막 실행 1회분을 mspec.shapeCases 에 저장. 스윙 뒤 이어서 한 정밀 탐색은 합침. 고른 후보를 계산하면 그 행에 정식 값
function adSaveCases({ opt, res, M0, sp, stages, caseLog }) {
  const M = A.store.mspec, cs = M.shapeCases, fp = caseFp(M0, sp);
  const mark = (rows, c, v, extra = {}) => rows.map((r) => (caseKey(r.c) === caseKey(c) ? { ...r, ...extra, ...(v ? { exact: { Ulen: v.stats.Ulen, Uwid: v.stats.Uwid, eff: v.eff } } : {}) } : r));
  if (opt.caseCheck) {   // 쓸 수 없는 후보(unchanged)·조건이 바뀐 표에는 값을 남기지 않음 — 결과 카드에는 보임
    if (!cs || res.unchanged || cs.fp !== fp) return;
    A.store.update('meta', (m) => { m.shapeCases = { ...cs, rows: mark(cs.rows, opt.caseCheck, res.verified) }; });
    return;
  }
  if (!caseLog.length) return;
  const mixed = Object.entries(stages).some(([k, v]) => k !== 'shape' && v), prev = opt.shapeDeep && cs?.part === sp && cs.fp === fp ? cs.rows.map(({ rec, ...r }) => r) : [];
  let rows = mergeCaseRows(prev, caseLog);
  const bestC = res.steps?.find((x) => x.stage === 'shape')?.best?.cand, gd = res.unchanged ? res.steps?.find((x) => x.stage === 'guard') : null;
  if (bestC && !mixed) rows = mark(rows, bestC, res.unchanged ? gd?.triedVerified : res.verified, res.unchanged ? {} : { rec: true });
  else if (bestC && !res.unchanged) rows = mark(rows, bestC, null, { rec: true });
  A.store.update('meta', (m) => { m.shapeCases = { part: sp, fp, mixed, rows }; });
}
function adCaseView() {
  const st = adState(), M = A.store.mspec, cs = M.shapeCases;
  if (!cs?.rows?.length || !M.parts[cs.part]) return null;
  return { cases: cs, fp: caseFp(M, cs.part), sort: st.caseSort ?? { key: 'dt', dir: 1 }, sel: st.caseSel ?? null, tg: { len: M.observe?.targetLen, wid: M.observe?.targetWid }, name: M.parts[cs.part].name, busy: !!st.running };
}
function adCaseSort(k) {
  const st = adState(), o = st.caseSort ?? { key: 'dt', dir: 1 };
  st.caseSort = o.key === k ? { key: k, dir: -o.dir } : { key: k, dir: k === 'Ulen' || k === 'Uwid' ? -1 : 1 };
  renderAuto();
}
function adCasePick(v) {
  const st = adState();
  st.caseSel = v && v !== st.caseSel ? v : null; st.casePv = null; A.meshShown = null;
  renderView(); renderAuto();
}
function adCasePreview() {
  const st = A.ad;
  if (!st?.caseSel) return null;
  if (st.casePv) return st.casePv;
  const M = A.store.mspec, cs = M.shapeCases, row = cs?.rows.find((r) => caseKey(r.c) === st.caseSel), line = A.store.session.line, rt = getMech3d();
  if (!row || !line || !rt) return null;
  try {
    const { M: Md, parts } = designScene({ shape: { part: cs.part, ...row.c } }, { M0: adClone(M), line, rt, mp: null });
    return (st.casePv = { M: Md, parts, raw: rt.raw });
  } catch (e) { console.warn('[형상 후보] 미리보기 실패', e); st.caseSel = null; setStatus(`이 후보를 3D 로 만들지 못함: ${e.message}`); return null; }
}
function adCaseRun() {
  const st = adState(), cs = A.store.mspec.shapeCases, row = cs?.rows.find((r) => caseKey(r.c) === st.caseSel);
  if (!row || st.running) return;
  st.sel.shapePart = cs.part; st.result = null; dashReset({ shape: true });
  adRun({ stages: { shape: true }, caseCheck: row.c });
}
// 비교 중 3D 미리보기 — 고른 형상 후보가 먼저, 아니면 결과(결과마다 한 번 만들어 둠, meshKey 비교용 객체)
function adPreview() { return adCasePreview() ?? adResultPreview(); }
function adResultPreview() {
  const r = A.ad?.result;
  if (!r) return null;
  if (!r.preview) { const { M, parts } = designScene(r.design, r.ctx); r.preview = { M, parts, raw: r.ctx.rt.raw }; }
  return r.preview;
}
function adCancel() { const st = adState(); st.result = null; A.meshShown = null; renderView(); renderAuto(); }
// 적용 = 바뀐 항목만 씀(① Milky 값이 다르면 · ② 를 돌렸고 개수·피치가 다르면(LED STEP = step.virtual) · ③ 형상). 되돌리기용으로 그 항목의 전체 복사본을 남김
function adApply() {
  const st = adState(), r = st.result, d = r?.design;
  if (!d || r.unchanged) return;
  const M = A.store.mspec, mp = r.ctx.mp, Lm = M.light.manual;
  const milkyCh = mp != null && d.milky != null && d.milky !== M.parts[mp].material.milky;
  const rw = { rows: d.rows === 2 ? 2 : 1, rowGap: d.rows === 2 ? d.rowGap ?? 0 : 0 }, rowsCh = (o) => (o?.rows === 2 ? 2 : 1) !== rw.rows || (rw.rows === 2 && o.rowGap !== rw.rowGap);   // 열 배치도 비교
  const lightCh = !!r.stages?.leds && M.light.kind === 'manual' && d.count != null && (d.count !== Lm.count || d.pitch !== Lm.pitch || rowsCh(Lm) || !samePos(d.positions, Lm.positions));
  const sv = M.light.kind === 'step' ? M.light.step?.virtual ?? null : null;   // LED STEP: 가상 배치로 바뀌었고 이전과 다르면
  const stepCh = !!r.stages?.leds && M.light.kind === 'step' && !!M.light.step && d.count != null && !!d.stepVirt && (!sv || (d.positions ? !samePos(d.positions, sv.positions) : sv.count !== d.count || sv.pitch !== d.pitch || rowsCh(sv)));
  const mod = d.shape ? adResultPreview().M.parts[d.shape.part].shapeMod : null;
  const fp = d.finish?.part, pf = fp != null ? M.parts[fp]?.finish : null, pc = fp != null ? M.parts[fp]?.coating ?? null : null;
  const finCh = fp != null && !(pf?.kind === d.finish.kind && (pf?.R ?? null) === (d.finish.R ?? null) && pc === (d.finish.coating ?? null));   // ④ 면 처리(특수 처리 표시 포함)가 다르면
  const dzCh = Math.abs(d.dz ?? 0) > 1e-9 && (M.light.kind === 'step' ? !!M.light.step : M.light.manual?.pcb?.kind === 'depth');   // ⑤ 이동 있음
  A.hist?.hold();   // 적용 한 번 = 되돌리기 한 칸(형상 적용은 오래 걸릴 수 있음)
  // 화면 = 최종 판정 값 그대로(다시 재면 노이즈로 판정이 뒤집힘). 형상 변경은 관측 라인을 다시 잡으므로 라인이 잡힌 뒤에 넘김(afterLine)
  // — 전에는 형상만 버리고 처음부터 재서 노이즈 1% 값(최저÷최고라 약 2%p 낮음)이 나와 결과 카드와 달랐음(2026-11-05)
  A.adSeed = mod ? null : r.seed ?? null; A.adSeedSealed = false; A.adSeedLine = mod ? r.seed ?? null : null;
  const undo = { milky: milkyCh ? [mp, adClone(M.parts[mp].material)] : null, manual: lightCh ? adClone(Lm) : null, stepVirt: stepCh ? { v: adClone(sv) } : null, shape: mod ? [d.shape.part, adClone(M.parts[d.shape.part].shapeMod ?? null)] : null,
    finish: finCh ? [fp, adClone(pf), pc] : null, dz: dzCh ? (M.light.kind === 'step' ? { step: adClone({ offset: M.light.step.offset, emitters: M.light.step.emitters }) } : { depth: M.light.manual.pcb.depth }) : null };
  const tm = new Date();
  st.applied = { ...r, seed: null, catalog: reflCat(), at: `${tm.getHours()}:${String(tm.getMinutes()).padStart(2, '0')} 적용` };   // 적용 뒤 요약(이전 → 적용 후) — renderAutoPanel 이 compareHtml 과 같은 인자로 그림
  st.result = null; A.meshShown = null;
  // 이번 실행에서 돌린 항목 = 🔒 고정(체크 해제) — 다음 실행은 나머지만. [되돌리기]·[다시 최적화] 로 풀림
  const ran = r.stages ?? {}, lockK = [ran.leds || ran.height ? 'position' : null, ran.housing ? 'housing' : null, ran.shape ? 'shape' : null, ran.milky ? 'milky' : null].filter(Boolean);
  st.locked ??= {}; for (const k of lockK) st.locked[k] = { at: tm.getTime() };
  st.lastLock = lockK;
  for (const k of lockK) { if (k === 'position') { st.sel.leds = false; st.sel.height = false; } else st.sel[k] = false; }
  if (undo.milky || undo.manual || undo.stepVirt || undo.shape || undo.finish || undo.dz) st.undo = undo;
  if (milkyCh) A.store.update('material', (m) => { m.parts[mp] = setPartMaterialParam(m.parts[mp], 'milky', d.milky); });
  if (lightCh) A.store.update('light', (m) => { m.light.originManual ??= adClone({ count: Lm.count, pitch: Lm.pitch, rows: Lm.rows ?? 1, rowGap: Lm.rowGap ?? 0, positions: Lm.positions ?? null }); Object.assign(m.light.manual, { count: d.count, pitch: d.pitch }, rw); if (d.positions) m.light.manual.positions = adClone(d.positions); else delete m.light.manual.positions; });
  if (stepCh) A.store.update('light', (m, x) => { m.light.step.virtual = stepVirtOf(d, rw); if (x.pick === 'led' || x.pick === 'ledx') x.pick = null; });   // 가상 중엔 발광면·제외 클릭 끔
  if (mod) A.store.update('material', (m) => { m.parts[d.shape.part].shapeMod = mod; applyPartMods(m.parts); m.contacts = redetectContacts(m.contacts); });
  if (finCh) A.store.update('material', (m) => { applyFinish(m, d.finish); });
  if (dzCh) A.store.update('light', (m) => { applyDz(m, d.dz, r.ctx.line.frame.d); });   // STEP: 발광점도 같은 이동(재인식과 같음)
  A.hist?.release();
  A.adSeedSealed = true;
  setStatus(undo.milky || undo.manual || undo.stepVirt || undo.shape || undo.finish || undo.dz ? (A.adSeed || A.adSeedLine ? '적용함 — 최종 판정 값을 화면에 표시' : '적용함 — 다시 계산 중') : '적용할 변경이 없음(지금 설계와 같음)');
  renderAuto();
}
// 이 안에서 이어서(2026-10-30) — 결과를 적용한 뒤, 체크했지만 이번 실행에서 돌리지 않은 항목만 그 위에서 최적화(예: ③ 형상 결과 → ② 위치·① Milky).
// 적용한 형상·배치는 장면(getMech3d)에 들어가 다음 실행의 출발점이 됨. 적용은 [되돌리기] 로 취소 가능
// 스윙 결과에서 정밀 탐색으로 — 찾은 형상을 후보에 넣어 넓게 다시 탐색(적용 전이라 그대로 비교)
function adShapeDeep() {
  const st = adState(), r = st.result; if (!r || st.running) return;
  const start = r.design?.shape ?? null;
  st.result = null; dashReset({ shape: true });
  adRun({ stages: { shape: true }, shapeDeep: true, startShape: start });
}
async function adContinue() {
  const st = adState(), r = st.result; if (!r || st.running) return;
  const done = r.stages ?? {}, s = st.sel, av = adAvail(A.store.mspec);
  const next = { milky: !!(s.milky && !done.milky && av.milky.ok), leds: !!(s.leds && !done.leds && av.leds.ok), height: !!(s.height && !done.height && av.height.ok), housing: !!(s.housing && !done.housing && av.housing.ok && av.housing.parts.includes(s.housingPart)),
    shape: !!(s.shape && !done.shape && av.shape.ok && av.shape.parts.includes(s.shapePart)) };
  if (!Object.values(next).some(Boolean)) { setStatus('이어서 최적화할 항목이 없음 — 설계 인자에서 위치·Milky 등을 더 체크하세요'); renderAuto(); return; }
  if (!r.unchanged) adApply();   // 현재안 유지면 적용할 것 없이 그대로 이어서
  dashReset(next);
  // 적용(형상·크기 변경)이면 관측 라인을 다시 인식함 — 그동안 S.line 이 비어 실행이 바로 빠져나가던 것(2026-10-30). 라인이 생길 때까지 기다림(최대 30초)
  const a = A;
  for (let k = 0; k < 150 && A === a && !A.store.session.line; k++) await new Promise((res) => setTimeout(res, 200));
  if (A !== a) return;
  if (!A.store.session.line) { setStatus('관측 라인을 다시 인식하지 못해 이어서 최적화를 시작하지 못함'); return; }
  adRun({ stages: next });
}
// Milky 조정 표에서 고른 Milky 로 적용 — 최적안의 다른 인자는 그대로, Milky 와 그 추정 균일도·효율만 바꿈
function adApplyMilky(v) {
  const r = adState().result, row = r?.milkyRows?.find((x) => Math.abs(x.milky - v) < 1e-6);   // 버튼 값 = 표 값 그대로(반올림하면 1.525 같은 줄을 못 찾아 아무 일도 안 했음)
  if (!r || !row) { setStatus('Milky 적용 실패: 표에서 그 값을 찾지 못함'); return; }
  Object.assign(r, { design: { ...r.design, milky: row.milky }, unchanged: false, best: { ...r.best, milky: row.milky, Ulen: row.Ulen, Uwid: row.Uwid, eff: row.eff } });
  adApply();
}
// [후보로 바꾸기] — '현재안 유지'(뚜렷이 낫지 않음)여도 찾은 후보로 바꿈
function adApplyAlt() {
  const r = adState().result, a = r?.alt;
  if (!a) return;
  Object.assign(r, { seed: null, design: a.design, unchanged: false, best: { ...r.best, ...a.design, Ulen: a.Ulen, Uwid: a.Uwid, eff: a.eff } });
  adApply();
}
// 되돌리기 = 적용한 항목을 저장한 복사본으로 통째로 바꿈
// [다시 최적화] — 고정 풀고 다시 체크(값은 지금 적용된 것에서 출발)
function adUnlock(k) {
  const st = adState(); if (st.running) return;
  delete st.locked?.[k]; st.lastLock = (st.lastLock ?? []).filter((x) => x !== k);
  adSel(k, true);
}
function adRevert() {
  const st = adState(), u = st.undo;
  if (!u) return;
  st.undo = null; st.result = null; A.meshShown = null;
  for (const k of st.lastLock ?? []) { delete st.locked?.[k]; adSel(k, true); }   // 되돌리면 그 항목 고정도 풀고 다시 체크
  st.lastLock = null;
  if (u.milky) A.store.update('material', (m) => { m.parts[u.milky[0]] = { ...m.parts[u.milky[0]], material: adClone(u.milky[1]) }; });
  if (u.manual) A.store.update('light', (m) => { m.light.manual = adClone(u.manual); });
  if (u.stepVirt) A.store.update('light', (m) => { m.light.step.virtual = adClone(u.stepVirt.v); });   // null(원래 위치) 또는 이전 가상 값
  if (u.shape) A.store.update('material', (m) => { if (u.shape[1]) m.parts[u.shape[0]].shapeMod = adClone(u.shape[1]); else delete m.parts[u.shape[0]].shapeMod; applyPartMods(m.parts); m.contacts = redetectContacts(m.contacts); });
  if (u.finish) A.store.update('material', (m) => { const q = { ...m.parts[u.finish[0]], finish: adClone(u.finish[1]) }; if (u.finish[2]) q.coating = u.finish[2]; else delete q.coating; m.parts[u.finish[0]] = q; });
  if (u.dz) A.store.update('light', (m) => { if (u.dz.step) Object.assign(m.light.step, adClone(u.dz.step)); else m.light.manual.pcb.depth = u.dz.depth; });
  renderView(); renderAuto();
}
function adStep() {
  const st = adState(), r = st.result, d = r?.design;
  if (!d?.shape || st.stepBusy) return;   // 생성 중 반복 클릭 무시
  const { M } = adResultPreview(), i = d.shape.part, name = M.parts[i].name, file = `${String(name ?? 'part').replace(/[/\\:*?"<>|]/g, '_')}-p4.stp`;
  const base = adBaseMesh(i, r.ctx), mod = M.parts[i].shapeMod, mesh = adShapeMesh(base, mod, 3), nTri = mesh.triangles.length / 3;   // 내보내기는 거친 세분(hMax = R/3) — 삼각형 수 줄임
  let spline = null; try { spline = splineInput(base, heightsFor(base, mod.frame, mod.cell), mod); } catch { /* 메쉬 경로 */ }   // 직사각형·평평한 윗면이면 B-스플라인 곡면 솔리드
  const w = new Worker(new URL('../../export/mesh-step-worker.js', import.meta.url), { type: 'module' });
  st.stepBusy = true; st.stepWorker = w;
  const end = () => { w.terminate(); if (st.stepWorker === w) { st.stepWorker = null; st.stepBusy = false; } };
  setStatus(spline ? 'STEP 생성 중… (곡면)' : nTri > 30000 ? `STEP 생성 중… 삼각형 ${nTri}개 — 많아서 오래 걸리거나 실패할 수 있음` : 'STEP 생성 중…');
  w.onmessage = (ev) => {
    if (ev.data.type === 'done') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ev.data.stepText], { type: 'application/step' })); a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); setStatus(ev.data.note ? `STEP 내보내기 완료 — ${ev.data.note}` : 'STEP 내보내기 완료'); }
    else setStatus(`STEP 실패: ${ev.data.message}`);
    end();
  };
  w.onerror = (e) => { setStatus(`STEP 실패: ${e.message ?? e}`); end(); };
  w.postMessage({ mesh: { positions: mesh.positions, triangles: mesh.triangles }, spline, name });
}

// 3D 도면에서 광원 지정 — 클릭한 부품과 같은 모양(면 수·부피·면적·크기)의 기구 부품을 모두 광원 그룹으로 옮긴다:
// 메쉬를 LED STEP 처럼 복사(발광면 인식·배치 편집·기구 최적화를 그대로 씀)하고, 원본은 role 'light'(빛 계산·보기에서 빠짐 — 삭제 아님).
// 클릭한 면 = 발광면(렌즈 윗면으로 보정). PCB 는 기구 부품 그대로 남김(면 처리 그대로 계산)
// 새 기구 STEP 을 불러온 직후: 같은 모양이 반복되는 작은 부품(LED)을 찾아 바로 도면 광원으로(발광면 = PCB 반대쪽).
// 광원이 이미 지정돼 있거나 못 찾으면 그대로. 틀렸으면 광원 노드의 [직접 고르기]·[도면 광원 해제]로 고친다
// force = 광원 속성의 [자동 선택] — 이미 지정된 광원이 있어도 다시 찾음(도면 광원은 먼저 해제)
export const pcbNote = () => A?.pcbNote ?? '';   // 마지막 도면 광원 지정의 PCB 인식 결과(불러오기 상태줄)
const whyTxt = (rs) => rs.slice(0, 3).map((r) => `같은 부품 ${r.count}개: ${r.why}`).join(' · ');
// LED 가 도면 부품이 아닐 때: 지정된 LED STEP 파일 안에서 찾음(2026-11-05). 찾으면 LED 개수, 못 찾으면 null(이유는 A.autoWhy)
function autoStepLight() {
  const st = A.store, M = st.mspec, s0 = M.light.step, parts = s0 && !s0.fromMech ? L.ledPartsNow(M) : null;
  if (!parts) return null;
  const why = [], g = autoStepLeds(parts, getMech3d()?.parts ?? [], { why });
  if (!g) { A.autoWhy = `LED STEP ${whyTxt(why) || '같은 모양 부품 2개 이상이 없음'}`; return null; }
  const had = M.light.kind === 'step' && s0.emitters?.length && s0.leds?.includes(g.ref) && s0.ref?.face === g.face;
  if (had) {   // 이미 같은 LED 를 쓰는 중 — 고친 내용(빛 끈 LED 등)을 그대로 두고 알려만 줌
    st.update('session', (_, x) => { x.pick = null; x.node = 'light'; x.hideLeds = false; x.ledInfo = `LED STEP 의 LED ${s0.leds.length}개를 이미 쓰는 중 — 도면에는 LED 부품이 없음`; });
    return s0.leds.length;
  }
  const off = s0.excluded?.length ?? 0;
  let n = null;
  st.update('light', (m, x) => {
    try {
      m.light.kind = 'step'; L.applyStepRecognition(m, x, m.light.step, { part: g.ref, face: g.face });
      n = m.light.step.leds.length; x.ledInfo = `LED STEP 에서 자동 인식 — ${x.ledInfo}${off && !m.light.step.excluded.length ? ` · 빛 끈 LED ${off}개 다시 켬` : ''}`;
      x.pick = null; x.node = 'light'; x.hideLeds = false;
    } catch (e) { A.autoWhy = `LED STEP: ${e.message}`; }
  });
  return n;
}
// LED 자동 선택: 도면 부품 → 없으면 LED STEP 파일
function autoLed() { const n = autoMechLight(true); if (n) return n; const w = A.autoWhy; return autoStepLight() ?? ((A.autoWhy ||= w), null); }
export function autoMechLight(force = false) {
  if (!A) return null;
  if (force && A.store.mspec.light.step?.fromMech) mechLightClear();
  const M = A.store.mspec, rt = getMech3d();
  if (!rt || (!force && M.light.kind && M.light.kind !== 'none')) return null;
  const cand = rt.parts.map((p, i) => ({ positions: p.positions, triangles: p.triangles, faceIds: p.faceIds, faceCount: rt.raw.parts[i]?.faceCount }));
  const why = [], g = autoLedGroup(cand, { skip: new Set(M.observe.faces.map((f) => f.part)), why });
  A.autoWhy = g ? '' : whyTxt(why);   // 못 찾은 이유(onMechAuto 안내)
  if (!g) return null;
  mechLightFromPick({ part: g.ref, face: g.face }, true);
  if (g.rejected?.length) A.store.update('session', (_, x) => { x.ledInfo = `${x.ledInfo ?? ''} — 더 많은 후보를 뺀 이유: ${whyTxt(g.rejected)}`; });
  return g.leds.length;
}
function mechLightFromPick(s, auto = false) {
  const st = A.store, M = st.mspec, rt = getMech3d(), obsP = new Set(M.observe.faces.map((f) => f.part));
  const cand = rt.parts.map((p, i) => ({ positions: p.positions, triangles: p.triangles, faceCount: rt.raw.parts[i]?.faceCount }));
  const leds = findLeds(cand, s.part).filter((i) => !obsP.has(i));
  if (!leds.includes(s.part)) { st.update('session', (_, x) => { x.status = '관측면 부품은 광원으로 지정할 수 없음'; }); return; }
  const parts = leds.map((i) => { const p = rt.parts[i], r = rt.raw.parts[i] ?? {}; return { positions: p.positions.slice(), triangles: p.triangles.slice(), faceIds: p.faceIds.slice(), faceCount: r.faceCount, volume: r.volume }; });
  // 발광면 = 받침 부품(PCB) 반대쪽 — 옆면·아랫면을 눌러도 부품(확산판) 쪽으로 빛이 나가게. 받침 = 클릭 LED 에 가장 가까운 기구 부품
  const sup = supportPart(rt.parts, rt.parts[s.part], new Set(leds)), face = emitterFaceAway(parts[leds.indexOf(s.part)], s.face, sup >= 0 ? rt.parts[sup] : null);
  // LED 받침 판 = PCB 부품(부품은 그대로, 확산 반사 30% 면). 못 찾으면 이유만 안내
  const pf = findPcbParts(rt.parts, leds, { skip: obsP }), pcbTxt = pf.pcbs.length ? ` · PCB ${pf.pcbs.length}개 인식(부품 유지, 반사율 30% 면)` : pf.rejected.length ? ` · PCB 못 찾음: ${M.parts[pf.rejected[0].part]?.name ?? '받침 부품'} ${pf.rejected[0].why}` : ' · PCB 못 찾음';
  A.pcbNote = pcbTxt;
  const name = `${String(M.name ?? '3D 도면').replace(/\.(stp|step)$/i, '')} · 도면 광원 ${leds.length}개`;
  if (!M.light.step?.fromMech) A.prevLight = { light: JSON.parse(JSON.stringify({ kind: M.light.kind, step: M.light.step ?? null })), mesh: getLedMesh() };   // 해제 때 되돌릴 이전 광원(LED STEP 메쉬 포함 — 이번 세션)
  setLedMesh(name, parts); L.resetLedCaches(); if (A.ctx.canSave?.() !== false) saveLedIDB().catch(() => {});
  st.update('light', (m, x) => {
    if (m.parts.some((p, i) => p.role === 'pcb' && leds.includes(i))) m.parts = syncPcb(m.parts, m.parts.map((p, i) => (p.role === 'pcb' && !leds.includes(i) ? i : -1)).filter((i) => i >= 0));   // PCB 였던 부품을 LED 로 고르면 먼저 원래대로
    // 광원이 된 부품 이름 = LED 1, LED 2 …(원래 이름은 nameOrig 에 — 해제하면 되돌림). 광원에서 빠진 부품은 원래 이름으로
    m.parts = m.parts.map((p, i) => {
      const q = { ...p }; if (q.role !== 'pcb') delete q.role;
      if (q.nameOrig != null && !leds.includes(i)) { q.name = q.nameOrig; delete q.nameOrig; }
      if (leds.includes(i)) { q.role = 'light'; q.nameOrig ??= p.name; q.name = `LED ${leds.indexOf(i) + 1}`; }
      return q;
    });
    m.parts = syncPcb(m.parts, pf.pcbs);
    m.light.kind = 'step';
    m.light.step = { name, offset: [0, 0, 0], rot: [0, 0, 0], ref: null, leds: [], excluded: [], pcb: -1, emitters: [], fromMech: leds };
    try { L.applyStepRecognition(m, x, m.light.step, { part: leds.indexOf(s.part), face }); x.ledInfo = auto ? `LED ${leds.length}개 자동 인식(같은 모양 반복 부품 · PCB 반대쪽 발광) — 틀리면 [직접 고르기]${pcbTxt}` : `도면 부품 ${leds.length}개를 광원으로 — ${x.ledInfo}${face !== s.face ? ' (받침 부품 반대쪽 면에서 발광)' : ''}${pcbTxt}`; }
    catch (e) { x.ledInfo = `발광면 인식 실패: ${e.message} — LED 노드에서 발광면을 다시 클릭하세요`; }
    x.pick = null; x.node = 'light'; x.hideLeds = false;
  });
}
function rebuildMechLight(M) {
  const st = M.light?.step, rt = getMech3d(), ids = st?.fromMech;
  if (!ids?.length || !rt || getLedMesh()?.name === st.name || !ids.every((i) => rt.parts[i])) return;
  setLedMesh(st.name, ids.map((i) => { const p = rt.parts[i], r = rt.raw.parts[i] ?? {}; return { positions: p.positions.slice(), triangles: p.triangles.slice(), faceIds: p.faceIds.slice(), faceCount: r.faceCount, volume: r.volume }; }));
}
// 도면 광원 해제 — 옮긴 부품을 다시 기구 부품으로(빛 계산·보기 복귀), 광원은 지정 전 상태로(이번 세션에 지정했으면 LED STEP 메쉬까지) — 모르면 '지정 안 함'
function mechLightClear() {
  const pv = A.prevLight; A.prevLight = null;
  if (pv?.mesh) { setLedMesh(pv.mesh.name, pv.mesh.parts); L.resetLedCaches(); if (A.ctx.canSave?.() !== false) saveLedIDB().catch(() => {}); }
  A.store.update('light', (m, x) => {
    m.parts = m.parts.map((p) => { if (p.role !== 'light') return p; const q = { ...p }; delete q.role; if (q.nameOrig != null) { q.name = q.nameOrig; delete q.nameOrig; } return q; });   // 이름도 원래대로
    if (pv) { m.light.kind = pv.light.kind; m.light.step = pv.light.step; } else { m.light.kind = 'none'; m.light.step = null; }
    x.pick = null; x.ledInfo = pv ? '도면 광원 해제 — 이전 광원으로 되돌림' : '도면 광원 해제 — 부품을 다시 기구로 계산';
  });
}
// 3D 우클릭(2026-11-02) — 누른 부품을 고르고 보기 켜기/끄기 메뉴. 면 고르기 중에는 메뉴 없음
function onViewContext({ part, led, x, y }) {
  const st = A.store, M = st.mspec, nMech = getMech3d().parts.length;
  if (st.session.pick) return;
  const mech = part != null && part < nMech ? part : null, isLed = led != null || (part != null && part >= nMech);
  if (mech != null && st.session.node !== `part:${mech}` && !(st.session.multi ?? []).includes(`part:${mech}`)) st.update('session', (_, q) => { q.multi = []; q.node = `part:${mech}`; q.sel = { part: mech, face: null }; q.ledSel = null; });
  const S = st.session, sel = S.node?.startsWith('part:') ? +S.node.slice(5) : null, multi = (S.multi ?? []).filter((q) => q.startsWith('part:')).map((q) => +q.slice(5));
  const LS = ledsNow(), rows = ledRows(LS), ln = isLed ? ledOfHit({ part, led }, nMech, LS.lay) : null;
  const utIds = mech == null ? [] : multi.length > 1 && multi.includes(mech) ? multi : [mech];
  const ut = untraceItem(M, utIds);
  const items = viewCtxItems({ untrace: ut, part: mech, isLed, ledRank: rows.find((r) => r.n === ln)?.rank ?? null, selPart: sel, multi, hidden: S.hidden ?? [], hideLeds: !!S.hideLeds, hidePcb: !!S.hidePcb, hiddenLeds: S.hiddenLeds ?? [], names: M.parts.map((p) => p.name) });
  if (!items.length) return;
  showCtxMenu(document, x, y, items, (k) => (k === 'untrace' ? setUntrace(ut) : st.update('view', (m, q) => {
    const n = m.parts.length, tv = (id, only = false) => Object.assign(q, toggleVisibility(id, only, n, q.hidden, q.hideLeds));
    if (k === 'hide') tv(`part:${mech}`);
    else if (k === 'show') tv(`part:${sel}`);
    else if (k === 'only') tv(`part:${mech}`, true);
    else if (k === 'hideSel') q.hidden = [...new Set([...(q.hidden ?? []), ...multi])];
    else if (k === 'led') q.hideLeds = !q.hideLeds;
    else if (k === 'led1') Object.assign(q, toggleLed(ln, rows.map((r) => r.n), q.hiddenLeds, q.hideLeds));
    else if (k === 'all') { q.hidden = []; q.hideLeds = false; q.hiddenLeds = []; q.hidePcb = false; }
  })), $('#mech3d-wrap'));
}
// ---- 3D 클릭 (main.js:393-425) — 기구 부품 수(nMech) 이상인 번호는 LED STEP 부품 ----
function onPick(s) {
  const st = A.store, M = st.mspec, S = st.session, nMech = getMech3d().parts.length, pick = S.pick;
  const say = (t) => st.update('session', (_, x) => { x.status = t; });
  if (!pick && s) {   // LED 몸체·빛 원뿔 클릭 = LED 선택(spec §4a)
    const n = ledOfHit(s, nMech, M.light.kind === 'step' ? L.stepLayout(M, S.line) : null);
    if (n != null) { st.update('session', (_, x) => { x.ledSel = n; x.node = 'leds'; x.sel = null; }); return; }
  }
  if (s && s.part == null && pick !== 'led' && pick !== 'ledx') s = null;   // 선택 모드 빈 곳 클릭(광선만) — LED 모드에서만 씀
  if ((pick === 'led' || pick === 'ledx') && s && M.light.step?.virtual) { say('배치를 편집한 상태 — [STEP 원래대로] 뒤에 지정하세요'); return; }   // 클릭 번호 = 가상 부품
  if ((pick === 'led' || pick === 'ledx') && s && s.part != null && s.part < nMech) { say('LED STEP 부품(PCB·LED)을 클릭하세요 — 기구 부품은 이 모드에서 선택되지 않음'); return; }
  if (pick === 'obs' && s && s.part < nMech) {
    st.update('observe', (m) => {
      const k = m.observe.faces.findIndex((f) => f.part === s.part && f.face === s.face);
      if (k >= 0) m.observe.faces.splice(k, 1); else m.observe.faces.push({ part: s.part, face: s.face });
    });
    return;
  }
  if (pick === 'led' && s && M.light.step) {
    const p = L.snapLedPick(M, s, nMech, true);
    if (!p) { say('가까운 LED 를 찾지 못함 — LED 가까이를 클릭하세요'); return; }
    st.update('light', (m, x) => {
      try {
        L.applyStepRecognition(m, x, m.light.step, { part: p.part, face: p.face });
        if (p.snapped) x.ledInfo += ' (가까운 LED · 윗면 발광으로 가정 — 측면 발광 LED 는 확대해서 발광면을 직접 클릭)';
        x.pick = null; x.status = '';
      } catch (e) { x.ledInfo = `LED 인식 실패: ${e.message}`; }
    });
    return;
  }
  if (pick === 'ledx' && s && M.light.step) {
    const p = L.snapLedPick(M, s, nMech, false);
    if (!p) { say('가까운 LED 를 찾지 못함 — LED 가까이를 클릭하세요'); return; }
    st.update('light', (m, x) => {
      const stp = m.light.step, i = p.part; stp.excluded ??= []; x.status = '';
      const k = stp.excluded.indexOf(i); if (k >= 0) stp.excluded.splice(k, 1); else if (stp.leds.includes(i)) stp.excluded.push(i);
    });
    return;
  }
  if (pick === 'mled' && s && s.part != null) { if (s.part >= nMech) { say('기구 도면 부품(LED)을 클릭하세요'); return; } mechLightFromPick(s); return; }
  if (pick === 'mpcb' && s && s.part != null) {   // PCB 수동 선택 — 끝내기 전까지 계속 클릭(다시 클릭 = 해제)
    const a = pcbPickPlan(M, s.part, nMech);
    if (a.err) { say(a.err); return; }
    st.update('light', (m, x) => {
      if (a.ids) m.parts = syncPcb(m.parts, a.ids); else m.light.step.pcb = a.stepPcb;
      const ns = pcbNames(m); x.status = ns.length ? `PCB: ${ns.join(', ')}` : 'PCB 없음 — LED 받침 판을 고르세요'; x.node = 'pcbs';
    });
    return;
  }
  if (pick === 'pcb' && s && s.part < nMech) { st.update('light', (m, x) => { m.light.manual.pcb = { kind: 'face', part: s.part, face: s.face }; x.pick = null; }); return; }
  st.update('session', (_, x) => { x.sel = s && s.part < nMech ? s : null; x.ledSel = null; if (x.sel) x.node = `part:${x.sel.part}`; });   // LED STEP 부품은 소재 편집 대상이 아님
}

// 투명 소재 측정값(사용자 항목) — 브라우저 저장(uds.clear.v1), 모든 프로젝트 공용
const clearUser = () => loadClear();
function saveClearUser(list) { if (A?.ctx?.canSave && !A.ctx.canSave()) return; saveClear(list); }
// ---- 속성 편집 처리기 (main.js:348-361, 426-451) — 태그가 계산·점검 범위를 정한다 ----
function propHandlers() {
  const st = A.store, ctx = A.ctx;
  const part = (i, fn) => st.update('material', (m) => { m.parts[i] = fn(m.parts[i]); });
  return {
    onKind: (i, k) => part(i, (p) => setPartMaterial(p, k)),
    onPartPcbR: (i, v) => { const R = clampPcbPct(v); if (R != null) part(i, (p) => setPcbR(p, R)); else st.update('session', () => {}); },
    onUntrace: (i, on) => part(i, (p) => ({ ...p, untrace: on || undefined })),   // 추적 제외 — 'material' 태그로 다시 계산·점검
    onMat: (i, key, v) => part(i, (p) => {
      let q = setPartMaterialParam(p, key, v);
      // DB 소재 선택: Milky 칸을 그 소재의 피팅 μs' 에 해당하는 값으로(Milky = 농도 — 이후 사용자가 조절)
      const ent = key === 'dbId' && v ? ctx.materialDb()?.get(v) : null, tbl = ctx.l2Table();
      if (ent && tbl) q = setPartMaterialParam(q, 'milky', Math.round(ctx.milkyFromMusR(tbl, ent.fitted.musR) * 100) / 100);
      return q;
    }),
    // 면 처리: 반사 소재(또는 특수 처리) 상한을 넘으면 상한으로 자르고 알림(spec P4 §2.3d)
    onFinish: (i, face, f) => st.update('material', (m, x) => {
      const r = partFinishEdit(m.parts[i], face, f, reflCat());
      m.parts[i] = r.part;
      if (r.clamped) x.status = `소재 상한(${Math.round(r.max * 100)}%) 초과 — 특수 표면처리는 기구 최적화 ④ 에서 허용`;
    }),
    // 측정값으로 반사 소재 추가(spec P4 §2.3e) — 사용자 항목 등록 후 이 부품에 적용. f = 양식 문자열(% 단위) → 오류 문구 | 없음
    onReflAdd: (i, f) => {
      const db = ctx.reflectDb?.(); if (!db) return '반사 소재 DB 없음';
      const r = entryFromForm(f); if (r.error) return r.error;
      const e = { ...r.entry, id: uniqueReflId(db, r.entry.id) };
      try { db.add(e); } catch (err) { return err.message; }
      st.update(i == null ? 'session' : 'material', (m, x) => { if (i != null) m.parts[i] = setReflMaterial(m.parts[i], e.id, reflCat()); x.status = `반사 소재 "${e.name}" 등록${i != null ? ' · 적용' : ''}(R ${pct1(e.R)}%, 상한 ${pct1(e.Rmax)}%)`; });
      return null;
    },

    // 소재 이름 고르기(소재 DB) — 종류가 바뀌면 그 종류 기본값에서 시작, 물성은 DB 항목 값
    onMatPick: (i, id) => st.update('material', (m, x) => {
      const [k, ...rest] = id.split(':'), ref = rest.join(':'), kind = { milky: 'milky', clear: 'clear', wt: 'whiteTrans', opaque: 'opaque' }[k];
      if (!kind) return;
      let p = m.parts[i].material.kind === kind ? m.parts[i] : setPartMaterial(m.parts[i], kind);
      if (kind === 'milky') {
        p = setPartMaterialParam(p, 'dbId', ref);
        const ent = ref ? ctx.materialDb()?.get(ref) : null, tbl = ctx.l2Table();
        if (ent && tbl) p = setPartMaterialParam(p, 'milky', Math.round(ctx.milkyFromMusR(tbl, ent.fitted.musR) * 100) / 100);   // 그 소재의 측정 확산 정도에서 시작
      } else if (kind === 'clear') p = applyClearEntry(p, CLEAR_BASE.find((e) => e.id === ref) ?? clearUser().find((e) => e.id === ref));
      else if (kind === 'opaque') p = setReflMaterial(p, ref || null, reflCat());
      m.parts[i] = p; x.status = `${p.name}: 소재 바꿈`;
    }),

    // 투명 소재 측정값 DB 관리(상세 탭) — edit: arg = { key, value } · delete. 쓰던 부품 소재도 맞춤. 오류 문구 | null
    onClearDb: (op, id, arg) => {
      const list = clearUser(), k = list.findIndex((e) => e.id === id);
      if (k < 0) return '없는 항목';
      let e = null;
      if (op === 'edit') { const r = editClearEntry(list[k], arg.key, arg.value); if (r.error) return r.error; e = r.entry; list[k] = e; } else if (op === 'delete') list.splice(k, 1); else return null;
      saveClearUser(list);
      st.update('material', (m, x) => { m.parts = syncClearParts(m.parts, id, e); x.status = e ? `측정 소재 "${e.name}" 수정 — 쓰는 부품에 반영` : '측정 소재 삭제 — 쓰던 부품은 바탕 수지 기본값으로'; });
      return null;
    },
    // 소재 DB 내보내기·불러오기(상세 탭 구역) — db = clear | milky, op = export | import(text)
    onDbIo: (db, op, text) => {
      try {
        if (db === 'clear') {
          if (op === 'export') { downloadText('uds-clear.json', clearExportJson(clearUser()), 'application/json'); setStatus('투명 소재 측정값을 uds-clear.json 으로 내보냄'); return; }
          const r = clearImport(parseMaterialFile(text).clear, clearUser()); saveClearUser(r.list);
          st.update('material', (m, x) => { for (const e of r.list) if (r.added.includes(e.id)) m.parts = syncClearParts(m.parts, e.id, e); x.status = `투명 소재 불러옴 ${r.added.length}건${r.rejected.length ? ` · 거부 ${r.rejected.length}건: ${r.rejected.join('; ')}` : ''}`; });
          return;
        }
        const mdb = ctx.materialDb?.(); if (!mdb) { setStatus('실측소재 DB 없음'); return; }
        if (op === 'export') { downloadText('uds-materials.json', mdb.exportJson('user'), 'application/json'); setStatus('실측 Milky 소재(사용자)를 uds-materials.json 으로 내보냄'); return; }
        const r = mdb.importJson(JSON.stringify({ entries: parseMaterialFile(text).milky }));
        pool?.setDb(ctx.dbLists()); ctx.onMaterialDbChanged?.();
        st.update('material', (_, x) => { x.status = `실측 Milky 소재 불러옴 ${r.added.length}건${r.rejected.length ? ` · 거부 ${r.rejected.length}건: ${r.rejected.join('; ')}` : ''}`; });
      } catch (e) { setStatus(`불러오기 실패: ${e.message}`); }
    },
    // 측정값으로 투명 소재 등록(같은 이름 = 덮어씀) 후 이 부품에 적용. f = 양식 문자열 → 오류 문구 | null
    onClearAdd: (i, f) => {
      const r = clearEntryFromForm(f); if (r.error) return r.error;
      saveClearUser([...clearUser().filter((e) => e.id !== r.entry.id), r.entry]);
      const e = r.entry;
      st.update('material', (m, x) => { if (i != null) m.parts[i] = applyClearEntry(m.parts[i], e); else m.parts = syncClearParts(m.parts, e.id, e); x.status = `측정 소재 "${e.name}" 등록${i != null ? ' · 적용' : ''}(n ${e.n}, 투과율 ${Math.round(e.T * 1000) / 10}% @ ${e.tRef} mm)`; });
      return null;
    },
    // 반사 소재 DB 관리(목표 노드) — 바뀐 뒤 다시 그림(부품 속성·기구 최적화 ④ 후보·카드). 오류 문구 | null
    onReflDb: (op, id, arg) => {
      const db = ctx.reflectDb?.(); if (!db) { setStatus('반사 소재 DB 없음'); return '반사 소재 DB 없음'; }
      if (op === 'export') { downloadText('uds-reflect.json', db.exportJson('all'), 'application/json'); setStatus('반사 소재 DB 를 uds-reflect.json 으로 내보냄'); return null; }
      let msg = '', err = null;
      try {
        if (op === 'rename') { db.update(id, { name: arg }); msg = `이름 바꿈: ${arg}`; }
        else if (op === 'samples') {
          const e = db.get(id), { values, bad } = parsePercents(arg?.values);
          if (bad.length || !values.length) err = bad.length ? `측정 반사율은 0~100 % 숫자: ${bad.join(', ')}` : '측정 반사율 %를 입력하세요';
          else { const q = db.update(id, addSamples(e, values.map((R) => ({ R, cond: arg.cond ?? '', note: arg.note ?? '' })))); msg = `"${q.name}" 측정 ${q.samples.length}회 · R ${pct1(q.R)}% · 상한 ${pct1(q.Rmax)}%`; }
        } else if (op === 'remove') { const e = db.get(id); if (db.remove(id)) msg = `"${e?.name ?? id}" 삭제 — 이 소재를 쓰던 부품은 "없는 소재" 로 표시`; }
        else if (op === 'copy') { const c = copyAsUser(db.get(id)); c.id = uniqueReflId(db, c.id); db.add(c); msg = `사용자 사본 "${c.name}" 을 만들었습니다`; }
        else if (op === 'import') { const r = db.importJson(arg); msg = `반사 소재 불러옴 ${r.added.length}건${r.rejected.length ? ` · 거부 ${r.rejected.length}건: ${r.rejected.join('; ')}` : ''}`; }
      } catch (e) { err = `반사 소재 DB ${op === 'import' ? '불러오기' : '고침'} 실패: ${e.message}`; }
      if (err) { setStatus(err); return err; }
      st.update('session', (_, x) => { x.status = msg || x.status; });
      return null;
    },
    // 크기·위치 조절: 장면을 바꾸고 접촉면을 다시 찾는다(같은 면 쌍은 모드 유지). xf = null → 원래대로
    // 새 간섭이 생기면 간섭 직전까지만 적용(limitXform). 직접 배치 LED 는 라인을 따라 다시 놓이므로 고정 LED(STEP)만 장애물
    // 간섭 확인(limitXform)은 큰 부품에서 수 초~수십 초 — Worker 에서 하고 결과로 적용(그사이 장면이 바뀌면 버림)
    onXform: (i, want, note = '') => {
      const apply = (xf, msg) => st.update('material', (m, x) => {
        x.xfMsg = msg ? { part: i, text: msg } : null;
        if (xf) m.parts[i].xform = xf; else delete m.parts[i].xform;
        if (applyPartMods(m.parts)) m.contacts = redetectContacts(m.contacts);
      });
      if (!want) { apply(null, note); return; }
      const m = st.mspec, x = st.session, rt = getMech3d(), stp = m.light.kind === 'step';
      let em = []; try { em = stp ? L.currentEmitters(m, x.line) : []; } catch { em = []; }
      setStatus('간섭 확인 중…');
      geomLimit({ cur: rt.parts, raw: rt.raw.parts, led: (stp && L.ledPartsNow(m, x.line)) || NO_LED, i, oldXf: m.parts[i].xform ?? null, newXf: want, emitters: em }).then((r) => {
        if (!A || getMech3d() !== rt) return;
        if (r.error || r.stale) { apply(want, `간섭 확인을 못 함(${r.error ?? '장면이 바뀜'}) — 입력값 그대로 적용`); return; }
        const q = r.lx;
        apply(q.xf, q.limited ? `${hitName(st.mspec, q.hit, st.session.line)}과(와) 간섭 — 간섭 직전(입력의 ${Math.round(q.t * 100)}%)까지만 적용` : note);
      });
    },
    onContact: (i, mode) => st.update('contacts', (m) => { m.contacts[i] = { ...m.contacts[i], mode }; }),
    // 'mech' = 3D 도면에서 지정: 자동 선택(반복되는 LED 모양 부품) → 못 찾으면 도면 LED 의 발광면 클릭 대기(pick 'mled'). 다른 방식으로 바꾸면 도면 광원 원본을 기구로 되돌림
    onLightKind: (k) => {
      if (k === 'mech' && autoLed()) return;   // 먼저 자동 선택 — 못 찾으면 LED 발광면 클릭 대기
      if (k !== 'mech' && k !== 'click' && A.store.mspec.light.step?.fromMech) mechLightClear();
      st.update('light', (m, x) => { if (k === 'mech' || k === 'click') {   // click = 수동: 자동 선택 없이 바로 클릭 대기
 x.pick = 'mled'; x.ledInfo = '3D 도면에서 LED 하나의 발광면(빛이 나오는 면)을 클릭하세요 — 같은 모양 부품을 모두 광원으로'; } else { m.light.kind = k; x.pick = null; } });
    },
    onMechLightClear: () => mechLightClear(),
    // [자동 선택] — 같은 모양이 반복되는 작은 부품(LED)을 찾아 광원으로(발광면 = PCB 반대쪽). 못 찾으면 LED 하나를 직접 클릭하게
    onMechAuto: () => {
      A.autoWhy = '';
      const n = autoLed();
      if (!n) st.update('light', (m, x) => { const stp = m.light.kind === 'step' && !m.light.step?.fromMech && L.ledPartsNow(m) && !m.light.step.virtual;   // 클릭 대상 = 있는 LED — LED STEP 이면 그 LED, 아니면 도면 부품
        x.pick = stp ? 'led' : 'mled'; x.node = 'light'; x.ledInfo = `자동 선택: LED 를 못 찾음${A.autoWhy ? `(${A.autoWhy})` : '(같은 모양 부품 2개 이상이 없음)'} — 3D ${stp ? '에서' : '도면에서'} LED 하나의 빛 나오는 면을 직접 클릭하세요`; });
    },
    onLedFile: (f) => importLedStep(f),
    onPick: (mode) => st.update('session', (_, x) => { x.pick = mode; }),
    onStep: (key, v) => st.update('light', (m, x) => {
      const s = m.light.step; (key[0] === 'o' ? s.offset : s.rot)['xyz'.indexOf(key[1])] = v;
      if (s.ref) { try { L.applyStepRecognition(m, x, s, s.ref); } catch (e) { s.emitters = []; x.ledInfo = `LED 인식 실패: ${e.message}`; } }
    }),
    // LED STEP 배치 편집(spec m3-cad-ui §4b): 지금 배치(제외·개별 이동 반영)를 위치 목록으로 굳힌 뒤 추가·같은 간격 | orig = STEP 원래대로
    onLedEdit: (op) => st.update('light', (m, x) => ledEdit(m, x, op)),
    onManual: (key, v) => st.update('light', (m, x) => {
      const Lm = m.light.manual;
      if (key === 'pcbKind') { Lm.pcb = v === 'depth' ? { kind: 'depth', depth: 10 } : { kind: 'face' }; if (x.pick === 'pcb') x.pick = null; }
      else if (key === 'depth') Lm.pcb.depth = v;
      else if (key === 'rows') { Lm.rows = v === 2 ? 2 : 1; if (Lm.rows === 2 && !(Lm.rowGap > 0)) Lm.rowGap = defaultRowGap(x.line); }   // 처음 2열 = 0.27·W
      else if (key === 'rowGap') { const g = x.line ? Math.floor(clampRowGap(x.line, v) * 10 + 1e-9) / 10 : Math.max(0, v); Lm.rowGap = g; if (g !== v) x.status = `열 간격 보정: ±${g}mm(관측 폭 안으로)`; }
      else Lm[key] = key === 'count' ? Math.max(1, Math.round(v)) : v;
      if (['count', 'pitch', 'rows', 'rowGap'].includes(key)) delete Lm.positions;   // 손으로 고치면 Solver 위치 목록은 버림
    }),
    onPcbOff: (on) => st.update('light', (m) => { setPcbOff(m, on); }),
    onPcbR: (v) => { const R = clampPcbPct(v); if (R != null) st.update('light', (m) => { m.light.pcbR = R; }); else st.update('session', () => {}); },   // 빈칸·숫자 아님 = 원래 값으로 다시 그림
    onLedSpec: (key, v) => st.update(key === 'fluxLm' ? 'target' : 'light', (m) => { m.light.spec[key] = v; }),   // 광속은 휘도 환산만 — 재계산 없음
    // LED 선택·속성(spec §4a)
    onLedSel: (n) => st.update('session', (_, x) => { x.ledSel = n; if (n != null) { x.node = 'leds'; x.sel = null; } }),
    onLedBeam: (a) => { const b = beamSpec(a); if (b) st.update('light', (m) => { Object.assign(m.light.spec, b); }); },   // 120 = 램버시안, 그 밖 = 가우시안
    onLedDist: (g) => ledDist(g),
    onLedAdjust: (n, adj) => st.update('light', (m) => { setLedAdjust(m.light, n, adj); }),
    // 이 LED 삭제: 원래 STEP = 제외 토글(번호 n = step.leds 위치) · 편집한 배치 = 목록에서 뺌
    onLedExclude: (n) => st.update('light', (m, x) => {
      const stp = m.light.step;
      if (stp?.virtual) { ledEdit(m, x, 'del', n); return; }
      const p = stp?.leds?.[n]; if (p == null) return;
      stp.excluded ??= []; const k = stp.excluded.indexOf(p); if (k >= 0) stp.excluded.splice(k, 1); else stp.excluded.push(p);
    }),
    onObs: (key, v) => st.update('observe', (m) => { m.observe[key] = v; }),
    onClearObs: () => st.update('observe', (m) => { m.observe.faces = []; }),
    onObsDir: (v) => st.update('observe', (m) => { m.observe.dir = v ? (() => { const l = Math.hypot(...v); return v.map((x) => x / l); })() : null; }),
    onRetryLine: () => { A.lineKey = ''; refreshLine(); },
    onTarget: (key, v) => st.update('target', (m) => { m.observe[key] = v; }),
    onCheckParam: (key, v) => st.update('target', (m) => { m.checks[key] = v; }),
    // 반사 소재표 — id = null → 기본값으로(저장 삭제). 계산에는 영향 없음(기구 최적화 ④ 후보·부품 편집기 상한만)
    // 반사 소재 DB 칸 고침(spec P4 §2.3e) — 사용자 항목은 그대로, 공용 항목은 사용자 사본 "… (수정)" 을 만들어 고침. 부품 반사율은 그대로(다음 편집부터 새 상한)
    onCatalog: (id, key, v) => st.update('session', (_, x) => {
      const db = A.ctx.reflectDb?.(), e = db?.get(id);
      if (!e) { x.status = '반사 소재 DB 없음'; return; }
      try {
        if (e.origin === 'user') db.update(id, reflectPatch(e, key, v));
        else { const c = copyAsUser(e); db.add({ ...c, ...reflectPatch(c, key, v) }); x.status = `공용 소재는 고칠 수 없어 사용자 사본 "${c.name}" 을 만들었습니다`; }
      } catch (err) { x.status = `반사 소재 고침 실패: ${err.message}`; }
    }),
  };
}
const pct1 = (v) => Math.round(v * 1000) / 10;
// 사용자 파일 저장(Blob 링크) — l2-advanced.js download 와 같은 방식
function downloadText(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
// 소재 DB 관리 창(관리자 모드) — 확산(실측 Milky: BSDF·투과율·Haze 측정 → 피팅 → 저장) · 투명(측정 굴절률·투과율) · 반사(측정 반사율).
// 여기서 넣은 항목은 부품의 소재 고르기 목록에 이름으로 나타남. 각 탭: 측정 txt · 파장 가중 · 편집 · 내보내기/불러오기
const MDB_TABS = [['milky', '확산 (Milky · BSDF)'], ['clear', '투명 (굴절률·투과율)'], ['refl', '반사 (반사율)']];
export function openMaterialDb(tab = 'milky') {
  if (!A) return;
  if (!isAdmin()) { setStatus('소재 DB 관리는 관리자 모드에서 — 설정 > 관리자 모드'); return; }
  const ctx = A.ctx, h = propHandlers();
  document.querySelector('.m3-matdb')?.remove();
  const dlg = document.createElement('div');
  dlg.className = 'zoom-modal m3-fitdlg m3-matdb';
  dlg.innerHTML = `<div class="zoom-modal-inner" role="dialog" aria-modal="true" aria-label="소재 DB 관리">
    <div class="zoom-modal-hd"><span>소재 DB 관리 <span class="mut">관리자 · 여기서 넣은 소재는 부품의 소재 목록에 이름으로 나타남</span></span><button data-md-close>✕ 닫기</button></div>
    <div class="m3-tabs" role="tablist">${MDB_TABS.map(([k, t]) => `<button type="button" role="tab" data-md-tab="${k}">${t}</button>`).join('')}</div>
    <div class="m3-fitdlg-body" data-md-body></div></div>`;
  document.body.appendChild(dlg);
  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  const close = () => { dlg.remove(); document.removeEventListener('keydown', onKey); };
  document.addEventListener('keydown', onKey);
  dlg.querySelector('[data-md-close]').onclick = close;
  const body = dlg.querySelector('[data-md-body]'), used = (f) => A.store.mspec.parts.reduce((o, p) => { const id = f(p); if (id) o[id] = (o[id] ?? 0) + 1; return o; }, {});
  const draw = () => {
    dlg.querySelectorAll('[data-md-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mdTab === tab)));
    if (tab === 'milky') {
      const db = ctx.materialDb?.(), table = ctx.l2Table?.();
      if (!db || !table) { body.innerHTML = '<div class="mut">실측소재 DB·L2 응답표가 아직 준비되지 않았습니다</div>'; return; }
      body.innerHTML = '<div class="mut">측정값(파장별·각도별 BSDF txt, 투과율·반사율·Haze)을 넣고 [피팅] → [DB 저장]. 저장한 소재는 부품 소재 목록의 "확산 (Milky)" 묶음에 나타남.</div><div data-fit-adv></div>';
      const host = body.querySelector('[data-fit-adv]');
      const actx = { table, db, viewNote: '측정 → 피팅 → 저장',
        onDbChanged: () => {
          pool?.setDb(ctx.dbLists()); ctx.onMaterialDbChanged?.();
          const gone = A.store.mspec.parts.some((p) => p.material?.dbId && !db.get(p.material.dbId));   // 지워진 소재를 쓰던 부품은 일반 Milky 로
          A.store.update(gone ? 'material' : 'session', (m, x) => { for (const p of m.parts) if (p.material?.dbId && !db.get(p.material.dbId)) p.material = { ...p.material, dbId: '' }; x.status = '실측 Milky 소재 DB 바뀜'; });
          renderAdvanced(host, actx, null);
        } };
      renderAdvanced(host, actx, null);
      return;
    }
    if (tab === 'clear') {
      const list = clearUser(), f = dbFormState(body, 'clear');
      body.innerHTML = `<div class="m3-links"><button type="button" class="m3-link" data-m3-clearadd aria-expanded="${f.addOpen ? 'true' : 'false'}">＋ 측정값으로 새 소재</button> <span class="mut">기본 소재(PC·PMMA 등 일반값)는 목록에 늘 있음</span></div>${f.addOpen ? clearAddFormHtml(f.msg) : ''}
        <div class="m3-sub">측정 소재 ${list.length}개</div>${clearDbHtml(list, used((p) => p.material?.matId))}`;
      wireMaterialDb(body, h, draw, list);
      return;
    }
    const f = dbFormState(body, 'refl');
    body.innerHTML = `<div class="m3-links"><button type="button" class="m3-link" data-m3-refladd aria-expanded="${f.addOpen ? 'true' : 'false'}">＋ 측정값으로 새 소재</button> <span class="mut">기본 소재 값을 고치려면 표에서 [복사] 후 [＋측정]</span></div>${f.addOpen ? reflAddFormHtml(f.msg) : ''}<div data-md-refl></div>`;
    renderReflDb(body.querySelector('[data-md-refl]'), reflCat(), h, draw);
    wireMaterialDb(body, h, draw);
  };
  dlg.querySelectorAll('[data-md-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.mdTab; draw(); }; });
  draw();
}
// LED STEP 불러오기 (main.js:452-469)
function importLedStep(file) {
  const st = A.store, say = (t) => { if (A?.store === st) st.update('session', (_, x) => { x.ledInfo = t; }); };
  say(`${file.name} 읽는 중…`);
  file.text().then((text) => {
    const w = new Worker(new URL('../../engine/mech3d/mech3d-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (m) => {
      if (m.data.key) { say(`${LOAD_LABEL[m.data.key] ?? ''}${m.data.text ? ` — ${m.data.text}` : ''}`); return; }   // 진행 알림 — 결과가 아님
      w.terminate();
      if (m.data.error) { say(`불러오기 실패: ${m.data.error}`); return; }
      if (A?.store !== st) return;
      setLedMesh(file.name, m.data.parts); if (A?.ctx.canSave?.() !== false) saveLedIDB().catch(() => {}); L.resetLedCaches();
      st.update('light', (M, x) => {
        // 같은 이름의 LED STEP 을 다시 불러옴(저장소 비워짐 등) — 저장된 기준 LED·위치 보정·제외·가상 배치로 재인식
        const old = M.light.step;
        if (old?.ref && old.name === file.name) {
          M.light.step = { ...old, leds: [], pcb: -1, emitters: [] };
          try { L.applyStepRecognition(M, x, M.light.step, old.ref); x.ledInfo = `저장된 LED 지정 복원 — ${x.ledInfo}`; x.pick = null; x.node = 'light'; return; }
          catch (e) { x.status = `저장된 LED 지정으로 인식 실패(${e.message}) — 새로 지정하세요`; }
        }
        M.light.step = { name: file.name, offset: [0, 0, 0], rot: [0, 0, 0], ref: null, leds: [], excluded: [], pcb: -1, emitters: [] };
        x.ledInfo = `부품 ${m.data.parts.length}개 — LED 하나의 발광면을 클릭하세요`; x.pick = 'led'; x.node = 'light';   // 발광면·제외 클릭 버튼은 광원 노드에
      });
      if (!st.mspec.light.step?.emitters?.length) autoStepLight();   // 새 파일 — 자동으로 찾고, 못 찾으면 위의 클릭 안내 그대로
    };
    w.onerror = (e) => { w.terminate(); say(`불러오기 실패: ${e.message ?? e}`); };
    w.postMessage({ text });
  }).catch((e) => say(`불러오기 실패: ${e.message}`));
}
// 명령 막대
const flash = (n) => { if (!n) return; n.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); n.classList.remove('m3-flash'); void n.offsetWidth; n.classList.add('m3-flash'); };
function cmdHandlers() {
  return {
    onImport: (f) => A.ctx.onImportMech3d(f),
    // ① LED 지정: 광원이 아직 없거나 발광 방향 미지정이면 먼저 자동 선택(같은 부품 2개 이상 · PCB 위 · PCB 반대쪽 발광) — 못 찾으면 기존 흐름
    onLed: () => { const L0 = A.store.mspec.light; if ((L0.kind === 'none' || (L0.kind === 'step' && !L0.step?.emitters?.length)) && autoLed()) return; A.store.update('session', (m, x) => { const stp = m.light.kind === 'step' && m.light.step; x.node = 'light'; x.pick = stp && !stp.virtual ? (x.pick === 'led' ? null : 'led') : null; }); },
    onObs: () => A.store.update('session', (_, x) => { x.node = 'obs'; x.pick = x.pick === 'obs' ? null : 'obs'; }),
    onTarget: () => { setLpTab('obs', 'basic'); A.store.update('session', (_, x) => { x.node = 'obs'; x.sel = null; x.ledSel = null; x.pick = null; });
      setTimeout(() => { const q = $('[data-lp-tgt="targetLen"]'); q?.scrollIntoView?.({ block: 'center' }); q?.focus(); q?.select?.(); }, 0); },   // 목표 = 관측면 기본 탭의 ③ 칸
    onSection: () => A.store.update('view', (_, x) => {
      if (x.section) { x.section = null; return; }
      const b = bounds(getMech3d().combined.positions);
      x.section = { axis: 'x', pos: (b[0] + b[3]) / 2, box: b };
    }),
    onFit: () => A.view?.fitAll(),   // 맞춤 = 보이는 부품 전체를 창에 꽉 차게(보는 방향은 그대로)
    onToggleCalc: () => {   // '⏸ 계산 중'(대기·장면 준비 포함) → 일시정지, 일시정지 → 재개, 그 밖(완료·오류·대기) → 다시 계산
      // 기구 최적화 중: 계산이 끝났거나 대기였으면(미룬 계산 없음) = 다시 계산 요청, 아니면 일시정지 여부를 뒤집음
      if (A.ad?.running) { const st = A.ad; st.userPaused = st.deferred ? !st.userPaused : false; st.deferred = true; setStatus(st.userPaused ? '기구 최적화가 끝나도 계산은 멈춰 둠' : '기구 최적화가 끝나면 계산 재개'); return; }
      const s = A.prog.snapshot().state;
      if (s === 'running' || s === 'pending' || s === 'starting') A.prog.pause(); else if (s === 'paused') A.prog.resume(); else restartCalc();
    },
    onAuto: () => adSetOpen(!adState().open),
    // 흐름 4·5단계 단추 — 해당 칸을 보여 주고 잠깐 강조(모니터가 열려 있으면 그 안에서)
    onSim: () => A.results.toggleBig(),
    onOpt: () => monitor?.toggle(),   // ⑤ 기구 최적화 창 열고 닫기(기본 화면에는 최적화 칸 없음)
    adFlow: () => ({ running: !!A?.ad?.running, result: !!A?.ad?.result }),
  };
}

// ---- LED 선택·속성(spec §4a) ----
// LED STEP 배치 편집(store.update 안에서) — op: add | align | del(n) | orig. 개별 이동(ledAdjust)은 위치 목록에 녹이고 지움
function ledEdit(m, x, op, n = null) {
  const stp = m.light.kind === 'step' ? m.light.step : null;
  if (!stp) return;
  x.hiddenLeds = [];   // 번호가 바뀜
  if (op === 'orig') { stp.virtual = null; m.light.ledAdjust = null; x.ledSel = null; x.status = 'LED 를 STEP 원래 배치로 되돌림'; return; }
  const line = x.line, lay = line ? L.stepLayout(m, line) : null;
  if (!lay || lay.err) { x.status = `LED 배치를 편집할 수 없음: ${lay?.err ?? '관측면(라인)을 먼저 지정하세요'}`; return; }
  let P;
  try { P = positionsFromLayout(lay, stp, line, op === 'del' ? n : null); } catch (e) { x.status = e.message; return; }
  if (op === 'add') { const r = addPosition(P, line); P = r.positions; x.ledSel = r.index; x.node = 'leds'; x.sel = null; x.status = `LED 추가 — ${P.length}개(가장 넓은 빈자리)`; }
  else if (op === 'align') { P = alignPositions(P, line); x.status = `같은 간격으로 정렬 — ${P.length}개`; }
  else if (op === 'del') { if (!P.length) { x.status = '마지막 LED 는 삭제할 수 없음'; return; } x.ledSel = null; x.status = `LED 삭제 — ${P.length}개 남음`; }
  if ((x.pick === 'led' || x.pick === 'ledx')) x.pick = null;   // 편집한 배치에서는 발광면·제외 클릭 안 씀
  stp.virtual = { positions: P }; m.light.ledAdjust = null;
}
// 현재 배치의 LED 목록 — 번호 n: LED STEP(원래·가상) = lay.leds 위치(제외 LED 포함), 직접 배치 = 발광점 순서
// → { lay, em(계산 발광점), list:[{ n, part(배치 부품 번호|null), e(발광점|null), excluded }] }
function ledsNow(M = A.store.mspec, line = A.store.session.line) {
  let em = []; try { em = L.currentEmitters(M, line); } catch { em = []; }
  const lay = M.light.kind === 'step' ? L.stepLayout(M, line) : null;
  if (!lay) return { lay: null, em, list: em.map((e, n) => ({ n, part: null, e, excluded: false })) };
  const ex = new Set(lay.excluded ?? []), byN = new Map(em.map((e) => [e.led, e]));
  return { lay, em, list: lay.leds.map((p, n) => ({ n, part: p, e: byN.get(n) ?? null, excluded: ex.has(p) })) };
}
// 발광점별 커버(관측면 부품)까지 관측 방향 d 거리(못 찾음 = NaN) — (발광점 배열, 기구, 라인, 관측 부품) 별 캐시
function ledGaps(em, M = A.store.mspec) {
  const S = A.store.session, rt = getMech3d();
  if (!S.line || !rt || !em.length) return em.map(() => NaN);
  const op = [...new Set(M.observe.faces.map((f) => f.part))], k = op.join();
  const c = A.gapC;
  if (c && c.em === em && c.rt === rt && c.line === S.line && c.k === k) return c.gaps;
  const d = S.line.frame.d, gaps = em.map((e) => { let g = Infinity; for (const i of op) g = Math.min(g, rayT(rt.parts[i], e.pos, d)); return Number.isFinite(g) ? g : NaN; });
  A.gapC = { em, rt, line: S.line, k, gaps };
  return gaps;
}
const minFinite = (a) => a.reduce((m, v) => (Number.isFinite(v) && !(v >= m) ? v : m), NaN);
// LED 속성 창 정보 — { n, total, s(라인 위치), gap(최소 커버 거리), adj, excluded, clash:[문구] }
// LED 의 라인 위치(mm) — 발광점이 없으면(빛 끈 LED) 몸체 중심으로
function ledLineS(LS, it) {
  const line = A.store.session.line;
  let pos = it.e?.pos ?? null;
  if (!pos && it.part != null && LS.lay?.parts[it.part]) { const b = bounds(LS.lay.parts[it.part].positions); pos = [0, 1, 2].map((k) => (b[k] + b[k + 3]) / 2); }
  return Number.isFinite(it.e?.s) ? it.e.s : pos && line ? line.toSW(...line.to2D(pos))[0] : NaN;
}
// LED 목록 = 라인 위치 순(도면에 저장된 순서는 뒤섞여 있음) — rank = 화면에 보이는 번호(1부터), n = 내부 번호
function ledRows(LS) {
  const chg = ledChangeNow();   // 원설계 대비 — 트리·목록에 표시
  const rows = LS.list.map((it) => { const c = chg?.byN.get(it.n) ?? null; return { n: it.n, s: ledLineS(LS, it), excluded: it.excluded, chg: c, delta: ledDeltaText(c), dxyz: ledDeltaXYZ(c) }; }).sort((a, b) => (Number.isFinite(a.s) ? a.s : Infinity) - (Number.isFinite(b.s) ? b.s : Infinity) || a.n - b.n);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}
function ledUi(LS, n) {
  const M = A.store.mspec, it = LS.list[n];
  if (!it) return null;
  const s = ledLineS(LS, it);
  const nm = (p) => M.parts[p]?.name ?? `부품 ${p + 1}`;
  const say = { inside: (p) => `발광점이 ${nm(p)} 안에 있음 — 간섭`, overlap: (p) => `LED 몸체가 ${nm(p)}과(와) 겹침 — 간섭`, 'body-inside': (p) => `LED 몸체가 ${nm(p)} 안에 있음 — 간섭` };
  const clash = [...new Set(ledClashItems(A.checks.interference?.items, n, LS.em, LS.lay).filter((x) => say[x.kind]).map((x) => say[x.kind](x.part)))];
  return { n, rank: ledRows(LS).find((r) => r.n === n)?.rank ?? n + 1, total: LS.list.length, s, gap: minFinite(ledGaps(LS.em)), adj: validAdjust(M.light)?.[n] ?? { ds: 0, dz: 0 }, excluded: it.excluded, clash };
}
// 커버까지 거리(공통) → 모든 LED 를 관측 방향으로 같은 양 이동(기구 최적화 ⑤ 와 같은 applyDz: STEP offset·발광점 / 직접 배치 깊이)
function ledDist(g) {
  const st = A.store, M = st.mspec, S = st.session;
  if (!S.line) return;
  if (M.light.kind === 'manual' && M.light.manual.pcb?.kind !== 'depth') return;
  const gap = minFinite(ledGaps(ledsNow().em));
  if (!Number.isFinite(gap)) { setStatus('LED 앞쪽에서 커버(관측면 부품)를 찾지 못함'); return; }
  let dz = gap - g, note = '';
  if (M.light.kind === 'manual') { const dp = M.light.manual.pcb.depth; if (dp - dz < 0.1) { dz = dp - 0.1; note = ' — 관측면 아래 깊이 0.1 mm 까지만'; } }
  if (Math.abs(dz) < 1e-6) return;
  st.update('light', (m, x) => { applyDz(m, dz, S.line.frame.d); x.status = `모든 LED 를 커버 쪽으로 ${dz > 0 ? '+' : ''}${dz.toFixed(2)} mm 옮김${note}`; });
}

// ---- 그리기 ----
function lineInfo() {
  const S = A.store.session, M = A.store.mspec, l = S.line;
  if (l) return `라인: ${{ line: '직선', circle: '원', path: '곡선' }[l.kind]}${l.closed ? '(닫힘)' : ''} · 길이 ${l.length.toFixed(1)}mm · 폭 ${l.width.toFixed(1)}mm${l.branched ? ' · ⚠ 갈래 있음(가장 긴 경로 사용)' : ''}${M.observe.faces.some((f) => isUntraced(M.parts[f.part])) ? ' · 관측 부품이 빛 계산에서 빠짐 — 그 자리의 가상 평면에서 잼' : ''}`;
  return M.observe.faces.length && !S.lineErr ? '라인 인식 중…' : '';
}
// 자동 격자 값(표시용 — tally.js 규칙과 같음. w 칸은 최대 국소 폭 대신 라인 폭으로 근사) (main.js:376)
function autoGrid() { const l = A.store.session.line; return l ? { ...autoCells(l.length, l.width, A.store.mspec.observe.quality), winS: Math.max(5, l.length / 10) } : null; }
function renderAll(tag = 'all') {
  const st = A.store, M = st.mspec, S = st.session;
  const LS = ledsNow();
  if (A.ledTotal > 0 && LS.list.length > 0 && A.ledTotal !== LS.list.length && S.hiddenLeds?.length) S.hiddenLeds = [];   // 개수가 바뀌면(최적화 적용 등) 번호가 달라짐. 라인·LED 를 읽는 중(0개)은 판단 안 함 — 저장된 숨김이 새로고침 때 지워지지 않게
  if (LS.list.length > 0) A.ledTotal = LS.list.length;
  if (S.ledSel != null && !(S.ledSel < LS.list.length)) S.ledSel = null;   // 배치가 바뀌어 번호가 없어짐
  renderView();
  const lay = M.light.kind === 'step' ? L.stepLayout(M, S.line) : undefined;   // LED STEP 실제 배치(가상 실패 표시용)
  S.ledChange = ledChangeNow();   // 트리 LED 노드 표시용
  renderFeatureTree($('#m3-tree'), M, S, {
    onNode: (id, o = {}) => st.update('session', (_, x) => {
      if (id.startsWith('led:')) { x.multi = []; x.node = 'leds'; x.sel = null; x.ledSel = +id.slice(4); return; }   // LED 한 개 = 3D 표시 + 속성 창 옮기기
      if (o.range && id.startsWith('part:')) {   // Shift+클릭 = 지금 고른 부품부터 여기까지 범위(화면 순서)
        const from = x.node?.startsWith('part:') ? x.node : id;
        x.multi = rangeSelect(o.order ?? [], from, id); x.node = id; x.sel = { part: +id.slice(5), face: null }; return;
      }
      if (o.multi && id.startsWith('part:')) {   // Ctrl+클릭 = 하나씩 더하기·빼기(지금 선택한 부품도 포함)
        const set = new Set(x.multi ?? []); if (!set.size && x.node?.startsWith('part:')) set.add(x.node);
        if (set.has(id)) set.delete(id); else set.add(id);
        x.multi = [...set]; x.node = id; x.sel = { part: +id.slice(5), face: null }; return;
      }
      x.multi = []; x.node = id; x.sel = id.startsWith('part:') ? { part: +id.slice(5), face: null } : null; if (id !== 'leds') x.ledSel = null;
      if (x.pick === 'mpcb' && id !== 'pcbs') x.pick = null;   // PCB 메뉴를 벗어나면 수동 선택 끝(버튼이 안 보이는데 클릭이 PCB 를 바꾸지 않게)
    }),
    onEye: (id, only) => st.update('view', (m, x) => Object.assign(x, id === 'pcbs' ? togglePcb(m, x) : id.startsWith('led:') ? toggleLed(+id.slice(4), ledsNow().list.map((it) => it.n), x.hiddenLeds, x.hideLeds, only) : toggleVisibility(id, only, m.parts.length, x.hidden, x.hideLeds, id.startsWith('group:') ? groupMembers(m, id.slice(6)) : []))),
    onFold: (id) => st.update('session', (_, x) => { const k = id === 'parts' || id === 'leds' || id === 'light' ? id : id.slice(6), def = k === '_light' || (k === 'leds' && ledFoldDefault(A.ledTotal)); x.fold = { ...x.fold, [k]: !(x.fold?.[k] ?? def) }; }),   // 접기·펼치기(세션)
    // 우클릭: 고른 것에 없으면 그것만 고름(고른 것 위에서 우클릭하면 여러 개 그대로)
    onCtxSelect: (id) => st.update('session', (_, x) => {
      if (id.startsWith('led:')) { x.multi = []; x.node = 'leds'; x.sel = null; x.ledSel = +id.slice(4); return; }
      if (id === x.node || (x.multi ?? []).includes(id)) return;
      x.multi = []; x.node = id; x.sel = id.startsWith('part:') ? { part: +id.slice(5), face: null } : null;
    }),
    onTreeAct: (k) => {   // 우클릭 메뉴: 새 그룹(선택한 부품들) · 그룹에서 빼기 · 그룹 해제 · 광원 지정
      if (k === 'ledAuto') { propHandlers().onMechAuto(); return; }
      if (k === 'ledClick') { propHandlers().onLightKind('click'); return; }
      if (k === 'pcbOff') { st.update('light', (m) => { setPcbOff(m, !pcbAllOff(m)); }); return; }
      if (k === 'pcbClick') { st.update('session', (_, x) => { x.node = 'pcbs'; x.pick = 'mpcb'; }); return; }
      if (k === 'ledFace' || k === 'ledOut') { st.update('session', (_, x) => { x.node = 'light'; x.pick = k === 'ledFace' ? 'led' : 'ledx'; }); return; }
      if (k === 'ledClear') { mechLightClear(); return; }
      if (k === 'ledShowAll') { st.update('view', (_, x) => { x.hiddenLeds = []; x.hideLeds = false; }); return; }
      if (k === 'ledOff') { if (A.store.session.ledSel != null) propHandlers().onLedExclude(A.store.session.ledSel); return; }
      if (k === 'out') {
        const ps = [...new Set([...(S.multi ?? []), ...(S.node?.startsWith('part:') ? [S.node] : [])])].filter((x) => x.startsWith('part:')).map((x) => +x.slice(5));
        st.update('meta', (m) => { m.groups = removeFromGroups(m.groups, ps); }); st.update('session', (_, x) => { x.multi = []; });
        return;
      }
      if (k === 'group') {
        const ps = [...new Set([...(S.multi ?? []), ...(S.node?.startsWith('part:') ? [S.node] : [])])].filter((x) => x.startsWith('part:')).map((x) => +x.slice(5));
        if (!ps.length) return;
        let gid = null; st.update('meta', (m) => { const r = makeGroup(m.groups, ps); m.groups = r.groups; gid = r.id; });
        st.update('session', (_, x) => { x.multi = []; x.node = `group:${gid}`; x.sel = null; x.fold = { ...x.fold, [gid]: false, parts: false }; });
      } else if (k === 'ungroup' && S.node?.startsWith('group:') && S.node !== 'group:_light') {
        const gid = S.node.slice(6); st.update('meta', (m) => { m.groups = ungroup(m.groups, gid); }); st.update('session', (_, x) => { x.node = 'parts'; });
      }
    },
    onRename: (id, name) => st.update('meta', (m) => {   // 이름 더블클릭 → 바꾸기(부품·사용자 그룹) — 계산 다시 안 함
      if (id.startsWith('part:')) { const p = m.parts[+id.slice(5)]; if (p) p.name = name; }
      else if (id.startsWith('group:')) { const g = (m.groups ?? []).find((x) => x.id === id.slice(6)); if (g) g.name = name; }
    }),
    onRedraw: () => st.update('session'),
    onUntrace: setUntrace,
  }, lay, M.light.kind === 'none' ? [] : ledRows(LS));
  const pi = S.node?.startsWith('part:') ? +S.node.slice(5) : -1, clr = pi >= 0 ? clearanceOf(pi) : null;
  if (clr !== A.clrShown) { A.clrShown = clr; renderMarkers(); }
  watchNumInputs($('#m3-props'));
  if (tag !== 'view') renderPropertyPanel($('#m3-props'), M, S, { admin: isAdmin(), dbList: A.ctx.materialDb()?.list() ?? [], catalog: reflCat(), clearList: clearUser(), clearUsed: M.parts.reduce((o, p) => { const id = p.material?.matId; if (id) o[id] = (o[id] ?? 0) + 1; return o; }, {}), milkyUsed: M.parts.reduce((o, p) => { const id = p.material?.kind === 'milky' && p.material.dbId; if (id) o[id] = (o[id] ?? 0) + 1; return o; }, {}), auto: autoGrid(), dir: M.observe.dir ?? S.line?.frame.d, lineInfo: lineInfo(), clearance: clr, xfInfo: pi >= 0 ? xformInfoOf(pi) : null, meshInfo: pi >= 0 ? partMeshInfo(pi) : null, xfMsg: S.xfMsg?.part === pi ? S.xfMsg.text : '', lay: lay ?? null, led: S.node === 'leds' && S.ledSel != null ? ledUi(LS, S.ledSel) : null, ...(S.node === 'leds' ? { ledList: ledRows(LS), ledGap: minFinite(ledGaps(LS.em)), ledChange: ledChangeNow() } : {}) }, propHandlers());
  if (tag === 'session' || tag === 'all') renderMarkers();
  A.cmd.update(S, M);
  renderStatus();
  renderAuto();
}
function renderStatus() {
  const S = A.store.session, M = A.store.mspec;
  const lt = S.ledSel != null && A.ledTotal ? `LED ${ledRows(ledsNow()).find((r) => r.n === S.ledSel)?.rank ?? S.ledSel + 1}/${A.ledTotal}` : '';
  renderStatusBar($('#m3-status'), { calc: S.calc, targetNoise: S.calc?.targetNoise ?? M.observe.targetNoise ?? 0.01, checks: A.checks, focus: S.focusCheck, text: lt && S.status ? `${lt} · ${S.status}` : lt || S.status }, {
    onCheck: (id) => A.store.update('session', (_, s) => { s.focusCheck = s.focusCheck === id ? null : id; }),
  });
}
// 3D 뷰 (main.js:336-373 의 뷰 부분) + 보기 버튼 · 단면 조절
function renderView() {
  const v = A.view, cur = getMech3d();
  if (!v || !cur) return;
  const M = A.store.mspec, S = A.store.session, stp = M.light.kind === 'step' ? M.light.step : null;
  const pv = adPreview();   // 기구 최적화 비교 중 = 최적안 미리보기(형상 메쉬·LED 위치)
  const lay = stp ? L.stepLayout(pv?.M ?? M, S.line) : null, lp = lay?.parts ?? null;   // 원래/가상 배치(캐시 객체) — 미리보기면 최적안 배치(몸체 = 화살표)
  const ledSet = new Set(lay?.leds ?? []), exSet = new Set(lay?.excluded ?? []);   // 제외된 LED 는 회색(불투명) — 발광 화살표도 빠짐
  const kinds = [...M.parts.map((p) => p.material.kind), ...(lp ?? []).map((_, i) => (i === lay.pcb ? 'pcb' : ledSet.has(i) && !exSet.has(i) ? 'led' : 'opaque'))];
  const looks = M.parts.map(partLook);
  const meshKey = [pv ?? cur, lp];   // 기구·LED 메쉬(위치 보정 포함 — 캐시 객체)가 바뀌면 다시 그림. 카메라는 기구가 바뀔 때만 맞춤
  if (!A.meshShown || A.meshShown.some((x, i) => x !== meshKey[i])) {
    // 도면 원본을 따로 기억 — meshShown 은 최적화 시작·취소·적용·되돌리기에도 비워져서, 그것과 비교하면 그때마다 숨긴 부품이 풀리고 카메라가 돌아갔음(2026-11-05)
    const { keepCamera, reset } = viewKeep(A.rawShown, cur.raw); A.rawShown = cur.raw;
    if (reset) { S.hidden = []; S.hideLeds = false; S.hiddenLeds = []; S.hidePcb = false; }   // 다른 기구를 불러오면 보기 상태 초기화
    A.meshShown = meshKey;
    try { v.setParts([...(pv ?? cur).parts, ...(lp ?? [])], kinds, { keepCamera, looks }); }
    catch (e) { console.error('[3D] 그리기 실패', e); setStatus(`3D 화면 그리기 실패: ${e.message ?? e}`); }   // 빈 화면으로 조용히 끝나지 않게(실패 = 오류 기록)
  } else v.setKinds(kinds, looks);
  const hid = new Set(S.hidden), nMech = M.parts.length;
  const hidL = new Set(S.hiddenLeds ?? []), hidLP = new Set([...hidL].map((n) => lay?.leds[n]));   // 한 개씩 숨긴 LED → 그 몸체 메쉬 · 빛 원뿔 · 화살표(PCB 는 그대로)
  v.setHidden((i) => (i < nMech ? hid.has(i) || M.parts[i]?.role === 'light' : S.hideLeds || hidLP.has(i - nMech) || (!!S.hidePcb && i - nMech === lay?.pcb)));   // 도면 광원 원본은 숨김(광원 그룹이 대신 보임)
  const dk = `${M.parts.map((p) => (p.untrace ? 1 : 0)).join('')}|${M.light.pcbOff ? lay?.pcb ?? '' : ''}`;
  if (A.dimKey !== dk) { A.dimKey = dk; v.setDim((i) => (i < nMech ? !!M.parts[i]?.untrace : !!M.light.pcbOff && i - nMech === lay?.pcb)); }
  const hk = `${!!S.hideLeds}|${S.hiddenLeds ?? ''}|${S.hidden ?? ''}`;
  if (A.ledsHid !== hk) { A.ledsHid = hk; renderMarkers(); }   // LED 켜기/끄기 → 방향 화살표도
  const LS = ledsNow(pv?.M ?? M, S.line), body = !pv && S.ledSel != null ? LS.list[S.ledSel]?.part ?? null : null;
  v.setSelection(S.sel ?? (body != null && lp?.[body] ? { part: cur.parts.length + body, face: null } : null));   // 선택 LED 몸체 = 부품 선택처럼 강조
  const sp = (pv?.M ?? M).light.spec, half = sp.model === 'gaussian' ? sp.beam / 2 : 60, gaps = ledGaps(LS.em, pv?.M ?? M);
  // LED 를 끄면(트리 눈 단추) 지향각(빛 원뿔·방향 화살표)도 함께 숨김
  const cones = S.hideLeds ? [] : LS.em.map((e, i) => ({ pos: e.pos, axis: e.axis, half, len: Number.isFinite(gaps[i]) ? Math.min(4, 0.4 * gaps[i]) : 4, n: e.led ?? i })).filter((c) => !hidL.has(c.n));
  // 인식한 라인 중심선은 그리지 않음(가로줄이 결과 색을 가린다는 의견 — 2026-10-26). 라인 정보는 관측면 속성 창 글자로
  v.setOverlay({ obsFaces: M.observe.faces, line3d: null, cones, coneSel: pv ? null : S.ledSel, obsArrow: obsArrow(M, S.line, cur) });
  // 선택 모드: LED 발광면/제외 → LED STEP 부품만 클릭되고 기구물은 투시, 관측면·PCB 면 → 기구 부품만 클릭
  const nM = cur.parts.length, led = S.pick === 'led' || S.pick === 'ledx', mech = S.pick === 'obs' || S.pick === 'pcb' || S.pick === 'mled';
  v.setPickMode(led ? (i) => i >= nM : mech ? (i) => i < nM : null, led ? (i) => i < nM : null);
  if (v.viewName() !== S.view) v.setView(S.view);
  if (v.xray?.() !== xrayOn()) v.setXray(xrayOn());
  syncViewBtns();
  $('#m3-views').querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === S.view));
  v.setSection(S.section);
  renderSectionCtl();
}
function renderSectionCtl() {
  const el = $('#m3-section'), sec = A.store.session.section;
  el.hidden = !sec;
  if (!sec) return;
  const b = sec.box, k = 'xyz'.indexOf(sec.axis), lo = b[k], hi = b[k + 3];
  el.innerHTML = `단면 <select data-s="axis">${['x', 'y', 'z'].map((a) => `<option ${a === sec.axis ? 'selected' : ''}>${a}</option>`).join('')}</select>
    <input type="range" min="${lo}" max="${hi}" step="${(hi - lo) / 200 || 0.1}" value="${sec.pos}" data-s="pos"> <b>${sec.pos.toFixed(1)}</b> mm`;
  el.querySelector('[data-s="axis"]').onchange = (e) => A.store.update('view', (_, s) => { const a = e.target.value, kk = 'xyz'.indexOf(a); s.section = { ...s.section, axis: a, pos: (b[kk] + b[kk + 3]) / 2 }; });
  el.querySelector('[data-s="pos"]').oninput = (e) => {   // 끄는 중에는 store 알림 없이 평면만(다시 그리면 슬라이더가 끊김)
    const s = A.store.session; s.section = { ...s.section, pos: +e.target.value };
    A.view.setSection(s.section); el.querySelector('b').textContent = s.section.pos.toFixed(1);
  };
}
