// 3D 기구 모드 상태 저장소 — spec 2026-10-15 m3-cad-ui §3.
// mspec = 저장 상태(spec.mech3d 객체 그대로), session = 세션 상태. update(tag, fn) → fn(mspec, session) 실행 → 구독자에게 tag 알림.
// 저장(persist)은 저장 상태 태그일 때만, delay(ms) 디바운스.
export const TAGS = ['material', 'light', 'observe', 'target', 'contacts', 'view', 'session', 'meta'];   // meta = 이름·그룹(저장만, 계산 다시 안 함)
export const PHYSICS = new Set(['material', 'light', 'observe', 'contacts']);        // 계산 다시 시작
export const GEOM_CHECK = new Set(['material', 'light', 'observe', 'target']);       // 기하 점검 다시(target = 점검 기준값)
export const PERSIST_TAGS = new Set(['material', 'light', 'observe', 'target', 'contacts', 'meta']);

export function initialSession() {
  return {
    node: null,          // 피처 트리 선택 노드 id ('parts' | 'part:i' | 'light' | 'leds' | 'obs' | 'contacts')
    sel: null,           // 3D 선택 { part, face } (기구 부품만)
    ledSel: null,        // 선택한 LED 번호(현재 배치 기준, spec §4a) | null
    pick: null,          // 클릭 모드 'obs' | 'led' | 'ledx' | 'pcb' | null
    line: null, lineErr: '', ledInfo: '', status: '',
    calc: null,          // 점진 계산 snapshot(progressive.js)
    view: 'iso',         // 'top' | 'front' | 'side' | 'iso'
    section: null,       // { axis:'x'|'y'|'z', pos, box:[6] } | null
    focusCheck: null,    // 강조할 점검 id
    hidden: [],          // 3D 에서 숨긴 기구 부품 번호(보기 전용 — 계산에는 그대로 포함)
    hideLeds: false,     // LED STEP 부품(PCB·LED) 숨김
    hiddenLeds: [],      // 한 개씩 숨긴 LED 번호(보기 전용 — 계산에는 그대로 포함)
    xfMsg: null,         // 크기·위치 조절이 간섭으로 제한됐을 때 { part, text }
    multi: [],           // 피처 트리 여러 부품 선택(Ctrl/Shift+클릭 — 그룹 만들기)
    fold: {},            // 트리 접힘 { parts | 그룹 id: true } — 광원으로 옮긴 부품 묶음 '_light' 는 기본 접힘
  };
}

// 3D 숨김 상태 ↔ mspec.viewState(2026-11-05) — 프로젝트와 같이 저장해 새로고침해도 유지. 아무것도 안 숨기면 칸 없음
const viewStateOf = (S) => (S.hidden?.length || S.hideLeds || S.hiddenLeds?.length ? { hidden: [...(S.hidden ?? [])], hideLeds: !!S.hideLeds, hiddenLeds: [...(S.hiddenLeds ?? [])] } : null);
function restoreView(S, vs, nParts) {
  if (!vs) return;
  const idx = (a, max = Infinity) => (Array.isArray(a) ? a.filter((v) => Number.isInteger(v) && v >= 0 && v < max) : []);
  S.hidden = idx(vs.hidden, nParts ?? Infinity); S.hideLeds = vs.hideLeds === true; S.hiddenLeds = idx(vs.hiddenLeds);
}
export function createStore(mspec, { persist = () => {}, delay = 300, timers = globalThis } = {}) {
  const subs = new Set();
  let t = null, disposed = false;
  // 저장 오류·구독자 오류는 삼키고 기록만 — 한 곳의 실패가 다른 구독자·update 호출자를 막지 않게
  const save = () => { try { persist(); } catch (e) { console.error('[m3 store] 저장 실패', e); } };
  const schedule = () => { if (t != null) timers.clearTimeout(t); t = timers.setTimeout(() => { t = null; save(); }, delay); };
  // 보기가 바뀌었으면 저장 칸에 반영 — 숨김은 'view' 말고 다른 태그에서도 바뀜(LED 재지정 등). 지금 값과 비교해 되돌리기로 칸이 지워져도 다시 맞춤
  const syncView = () => {
    const vs = viewStateOf(store.session);
    if (JSON.stringify(store.mspec.viewState ?? null) === JSON.stringify(vs)) return false;
    if (vs) store.mspec.viewState = vs; else delete store.mspec.viewState;
    return true;
  };
  const store = {
    mspec, session: initialSession(),
    update(tag, fn) {
      if (!TAGS.includes(tag)) throw new Error(`알 수 없는 변경 태그: ${tag}`);
      if (disposed) return;
      if (fn) fn(store.mspec, store.session);
      if (syncView() || PERSIST_TAGS.has(tag)) schedule();
      for (const f of [...subs]) { try { f(tag); } catch (e) { console.error('[m3 store] 구독자 오류', e); } }
    },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    flush() { if (t != null) { timers.clearTimeout(t); t = null; save(); } },
    dispose() { try { store.flush(); } finally { disposed = true; subs.clear(); } },
  };
  restoreView(store.session, mspec?.viewState, mspec?.parts?.length);
  return store;
}
