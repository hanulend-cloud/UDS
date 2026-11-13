// 프로젝트 파일(2026-11-02) — 파일 이름 표시 · 다른 이름으로 저장 · 고른 파일에 실시간 저장(File System Access API: Edge·Chrome).
// 브라우저 저장(localStorage)은 main.js persist 가 그대로 함 — 이 모듈은 그 위에 '실제 파일'을 더함. 파일 핸들은 IndexedDB 에 보관해 새로고침 뒤에도 이어 씀
// (브라우저가 권한을 다시 물으면 perm = 'prompt' → 머리의 단추로 다시 허용). API 가 없는 브라우저 = 다운로드로 저장, 실시간 파일 저장 없음
// 저장 = 항상 .uds(프로젝트 + STEP 도면 통합, project-bundle.js — 2026-11-12 사용자 결정). 옛 .json = 열기만: 그 파일에 쓰지 않고
// 저장하면 같은 이름의 .uds 로 새로 만듦(새로고침 뒤 지난 .json 핸들에도 이어 쓰지 않음)
const UDS = { description: 'UDS 프로젝트 (도면 포함)', accept: { 'application/octet-stream': ['.uds'] } };
const SAVE_TYPES = [UDS], OPEN_TYPES = [UDS, { description: 'UDS 프로젝트 (옛 JSON · 도면 없음)', accept: { 'application/json': ['.json'] } }];
const isUds = (n) => /\.uds$/i.test(n ?? '');
const asUds = (n) => (isUds(n) ? n : `${String(n).replace(/\.json$/i, '')}.uds`);
const isAbort = (e) => e?.name === 'AbortError';

function handleDb() {
  const open = () => new Promise((res, rej) => { const q = indexedDB.open('uds-project-file', 1); q.onupgradeneeded = () => q.result.createObjectStore('h'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('h', mode), q = fn(t.objectStore('h')); t.oncomplete = () => { db.close(); res(q.result); }; t.onerror = () => { db.close(); rej(t.error); }; }); };
  return { get: () => tx('readonly', (s) => s.get('cur')), put: (v) => tx('readwrite', (s) => s.put(v, 'cur')), del: () => tx('readwrite', (s) => s.delete('cur')) };
}

// pack(text, name) = 실제로 쓸 내용(통합 파일이면 Blob) · extra() = 바뀜 비교에 더할 값(도면 목록) · read(file) = 연 파일을 onOpen 에 넘길 값
// getText() = 저장할 내용, onOpen(text, name) = 연 파일 적용(실패면 던짐), onState(state) = 표시 갱신, suggest() = 저장 창의 기본 이름
export function createProjectFile({ getText, onOpen, onState = () => {}, suggest = () => 'uds-project.uds', pack = async (t) => t, extra = () => '', read = (f) => f.text(), delay = 1000, win = globalThis, timers = globalThis, store = null, download = null, ask = null }) {
  const db = store ?? (typeof indexedDB !== 'undefined' ? handleDb() : null);
  const S = { name: null, hasFile: false, perm: 'none', saving: false, savedAt: null, browserAt: null, err: '', missing: [] };
  let handle = null, lastText = null, t = null, again = false;
  const emit = () => onState({ ...S });
  const keep = (fn) => { try { fn()?.catch?.(() => {}); } catch { /* 핸들 보관 실패 = 다음 실행에서 다시 고르면 됨 */ } };
  const setHandle = (h) => { handle = h; S.hasFile = !!h; S.name = h?.name ?? null; S.savedAt = null; S.err = ''; keep(() => (h ? db?.put(h) : db?.del())); };

  async function write() {
    if (!handle || S.perm !== 'granted') return false;
    if (S.saving) { again = true; return false; }
    const text = getText(), key = `${text}\u0000${extra()}`;
    if (key === lastText) return true;
    S.saving = true; emit();
    try {
      const prev = await handle.getFile?.().catch(() => null) ?? null;   // 덮어쓸 파일 — 그 안의 STEP 도면을 되살릴 수 있게
      const body = await pack(text, handle.name, prev);   // STEP 도면이 빠지면 여기서 던짐 = 파일을 열지도 않음
      const w = await handle.createWritable();
      await w.write(body); await w.close();
      lastText = key; S.savedAt = Date.now(); S.err = ''; S.missing = [];
    } catch (e) {
      S.err = e?.message ?? String(e); S.missing = e?.missingStep ?? [];
      if (e?.name === 'NotAllowedError') S.perm = 'prompt';
    }
    S.saving = false;
    if (again) { again = false; if (!S.err) return write(); }
    emit();
    return !S.err;
  }
  const askWrite = async (h) => { try { return (await h.requestPermission({ mode: 'readwrite' })) === 'granted' ? 'granted' : 'prompt'; } catch { return 'prompt'; } };

  const api = {
    state: () => ({ ...S }),
    // 저장 상태가 바뀔 때마다(persist) — 파일을 골라 두었으면 잠시 뒤 파일에도
    touched() {
      S.browserAt = Date.now();
      if (handle && S.perm === 'granted') { if (t != null) timers.clearTimeout(t); t = timers.setTimeout(() => { t = null; write(); }, delay); }
      emit();
    },
    async saveAs() {
      if (!win.showSaveFilePicker) {   // 파일 API 없음 = 다운로드
        const nm = (ask ?? ((d) => win.prompt?.('저장할 파일 이름', d)))(asUds(S.name ?? suggest()));
        if (!nm) return false;
        const name = asUds(nm);
        let body; try { body = await pack(getText(), name, null); } catch (e) { S.err = e?.message ?? String(e); S.missing = e?.missingStep ?? []; emit(); return false; }
        download?.(body, name);
        S.name = name; S.savedAt = Date.now(); S.err = ''; S.missing = []; emit();
        return true;
      }
      let h;
      try { h = await win.showSaveFilePicker({ suggestedName: asUds(S.name ?? suggest()), types: SAVE_TYPES }); } catch (e) { if (isAbort(e)) return false; S.err = e?.message ?? String(e); emit(); return false; }
      setHandle(h); S.perm = 'granted'; lastText = null;
      return write();
    },
    async save() {
      if (t != null) { timers.clearTimeout(t); t = null; }
      if (!handle) return api.saveAs();
      if (S.perm !== 'granted') S.perm = await askWrite(handle);
      emit();
      lastText = S.perm === 'granted' && S.err ? null : lastText;
      return write();
    },
    // 파일 API 가 없으면 false(호출한 쪽이 파일 입력으로) — 있으면 고른 파일을 열고 이후 그 파일에 저장
    async open() {
      if (!win.showOpenFilePicker) return false;
      let h;
      try { [h] = await win.showOpenFilePicker({ types: OPEN_TYPES, multiple: false }); } catch (e) { if (isAbort(e)) return true; S.err = e?.message ?? String(e); emit(); return true; }
      await onOpen(await read(await h.getFile()), h.name);
      if (t != null) { timers.clearTimeout(t); t = null; }
      if (!isUds(h.name)) { api.opened(h.name); return true; }   // 옛 .json = 열기만 — 저장하면 같은 이름 .uds 로
      setHandle(h); lastText = `${getText()}\u0000${extra()}`;
      S.perm = await askWrite(h);
      emit();
      return true;
    },
    // 새로고침 뒤 — 보관한 파일 이어 쓰기(권한이 남아 있으면 바로, 아니면 머리의 단추)
    async restore() {
      let h = null;
      try { h = (await db?.get()) ?? null; } catch { h = null; }
      if (!h || !isUds(h.name)) { if (h) keep(() => db?.del()); emit(); return; }   // 지난 .json 파일에는 이어 쓰지 않음
      handle = h; S.hasFile = true; S.name = h.name;
      try { S.perm = (await h.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'granted' : 'prompt'; } catch { S.perm = 'prompt'; }
      emit();
    },
    async regrant() {
      if (!handle) return false;
      S.perm = await askWrite(handle); lastText = null;
      emit();
      return write();
    },
    // 파일 입력으로 연 경우 — 이름만(쓸 수 없음)
    opened(name) { if (t != null) { timers.clearTimeout(t); t = null; } setHandle(null); S.perm = 'none'; S.name = name; lastText = null; emit(); },
    clear() { api.opened(null); },
  };
  return api;
}

// 머리에 보이는 글(순수) — { name, status, kind: 'ok'|'busy'|'warn'|'none', action: null|'saveAs'|'regrant', actionText }
export function projectFileLabel(S, clock = (t) => new Date(t).toTimeString().slice(0, 8)) {
  const name = S.name ?? '이름 없는 프로젝트';
  if (S.saving) return { name, status: '저장 중…', kind: 'busy', action: null };
  if (S.missing?.length) return { name, status: `STEP 도면이 없어 파일 저장 멈춤: ${S.missing.join(', ')}`, title: '도면이 빠진 .uds 는 저장하지 않습니다 — [STEP 원본 지정]으로 그 STEP 파일을 고르면 함께 저장됩니다(브라우저에는 저장됨)', kind: 'warn', action: 'pickStep', actionText: 'STEP 원본 지정' };
  if (S.err) return { name, status: '파일 저장 실패 — 브라우저에는 저장됨', title: S.err, kind: 'warn', action: S.hasFile ? 'regrant' : 'saveAs', actionText: '다시 저장' };
  if (S.hasFile && S.perm !== 'granted') return { name, status: '파일 저장 멈춤 · 브라우저에만 저장 중', kind: 'warn', action: 'regrant', actionText: '파일 저장 다시 켜기' };
  if (S.hasFile) return { name, status: S.savedAt ? `자동 저장됨 ${clock(S.savedAt)}` : '자동 저장 켜짐', kind: 'ok', action: null };
  return { name, status: '파일로 저장 안 됨 — 창을 닫으면 사라짐', kind: 'none', action: 'saveAs', actionText: '파일로 저장' };
}
