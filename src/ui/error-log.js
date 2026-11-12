// 오류 기록(2026-11-02) — 프로그램이 멈추거나 실패하면 무슨 일인지 알려 주고 기록을 남김. 기록은 localStorage(새로고침·비정상 종료 뒤에도 남음).
// 잡는 것: 처리 안 된 오류·거부된 Promise · 계산 Worker·GPU·저장 실패(reportError) · 화면 멈춤(stallWatch) · 지난 실행의 비정상 종료(lastRunCrashed).
// 화면이 완전히 멈춘 동안에는 아무것도 그릴 수 없음 — 풀린 뒤 또는 다음 실행 때 알림
const KEY = 'uds.errors', ALIVE = 'uds.alive', MAX = 50, SAME_MS = 60000;
export const STALL_MS = 8000;   // 화면이 이만큼 응답 없으면 기록
const SLEEP_MS = 600000, BEAT_MS = 2000, DEAD_MS = 6000;   // 절전에서 깨어난 큰 간격은 멈춤이 아님 · 다른 탭이 살아 있으면 박동이 이보다 새로움

// 알림으로 띄울 필요 없는 것(브라우저 무해 경고·사용자가 멈춘 작업)
export const isNoise = (m) => /ResizeObserver loop|기구 최적화 중지|AbortError/.test(String(m ?? ''));
// 오류 문구 → 기구설계자가 읽을 설명(순수). level warn = 계산은 계속됨 · error = 그 작업이 멈춤
const RULES = [
  [/GPU|DEVICE_HUNG|DXGI/i, 'warn', 'GPU 드라이버가 멈춰 GPU 를 끔', '그래픽 드라이버가 오래 걸리는 계산을 끊은 것으로 보임', '계산은 CPU 로 계속됩니다(느려짐). 몇 초 뒤 GPU 를 자동으로 다시 켭니다(최대 3번).'],
  [/out of memory|allocation failed|Array buffer allocation|Invalid (typed )?array length/i, 'error', '메모리 부족', '도면·계산 자료가 메모리에 다 들어가지 않음', '다른 탭·프로그램을 닫고 새로고침하거나, 화질을 낮추세요.'],
  [/Worker 응답 없음|시간 초과/, 'error', '계산이 제한 시간 안에 끝나지 않음', '계산 Worker 가 답하지 않음(계산이 아주 오래 걸리거나 멈춤)', '다시 실행하세요. 반복되면 Milky·화질을 낮추거나 아래 내용을 전달해 주세요.'],
  [/Worker 오류|Worker 초기화|Worker 다시 띄움|모듈을 불러오지|파일을 불러오지|Failed to fetch|Importing a module/i, 'error', '프로그램 파일을 받지 못함', '서버 창이 닫혔거나 응답이 없음', '서버 창(run.bat)이 켜져 있는지 확인하고 Ctrl+F5 를 누르세요.'],
  [/비정상 종료/, 'warn', '지난번 프로그램이 비정상 종료됨', '브라우저 탭이 죽었거나(메모리 부족 등) 강제 종료된 것으로 보임', '설계는 브라우저에 자동 저장되어 있습니다. 같은 작업에서 반복되면 아래 내용을 전달해 주세요.'],
  [/화면이 .*멈춤/, 'warn', '화면이 잠시 멈춤', '큰 도면 처리·검사 계산이 화면 처리를 붙잡음', '풀렸으면 계속 쓰셔도 됩니다. 자주 나오면 아래 내용을 전달해 주세요.'],
  [/QuotaExceeded|quota/i, 'error', '브라우저 저장 공간 부족', '브라우저에 저장할 자리가 없음', '파일 › 다른 이름으로 저장으로 파일에 저장하고 브라우저 저장 공간을 비우세요.'],
  [/저장 실패|NotAllowedError|createWritable/, 'warn', '파일 저장 실패', '파일이 다른 프로그램에서 열려 있거나 권한이 없음', '브라우저에는 저장되어 있습니다. 파일을 닫거나 다른 이름으로 저장하세요.'],
  [/STEP/, 'error', 'STEP 처리 실패', 'STEP 파일을 읽거나 만들지 못함', '파일이 정상인지 CAD 에서 확인하고 다시 시도하세요.'],
  [/기구 최적화 실패/, 'error', '기구 최적화 실패', '실행 도중 오류로 멈춤', '다시 실행하세요. 반복되면 아래 내용을 전달해 주세요.'],
  [/계산 실패|계산/, 'error', '광분포 계산 실패', '계산 중 오류로 멈춤', '다시 계산하세요. 반복되면 아래 내용을 전달해 주세요.'],
];
export function explainError(msg) {
  const r = RULES.find(([re]) => re.test(String(msg ?? '')));
  return r ? { level: r[1], title: r[2], cause: r[3], todo: r[4] } : { level: 'error', title: '프로그램 오류', cause: '예상하지 못한 내부 오류', todo: '새로고침하면 대부분 풀립니다. 반복되면 아래 내용을 전달해 주세요.' };
}

// 기록(순수에 가깝게 — 시험에서 storage·now·context 를 넣음). report 반환 = 새 항목이면 그 항목, 같은 오류가 1분 안에 반복이면 횟수만 늘리고 null
export function createErrorLog({ storage = null, now = () => Date.now(), context = () => '' } = {}) {
  let list = [];
  try { list = JSON.parse(storage?.getItem(KEY) ?? '[]'); if (!Array.isArray(list)) list = []; } catch { list = []; }
  const save = () => { try { storage?.setItem(KEY, JSON.stringify(list)); } catch { /* 저장 공간 부족 — 이번 실행 동안은 메모리에 남음 */ } };
  const log = {
    report(source, msg, stack = '', ctx0 = null) {
      const m = String(msg ?? '').trim();
      if (!m || isNoise(m)) return null;
      const t = now(), same = list[0];
      if (same && same.msg === m && t - same.last < SAME_MS) { same.n++; same.last = t; save(); return null; }
      let ctx = ctx0 ?? ''; if (ctx0 == null) try { ctx = context() ?? ''; } catch { ctx = ''; }
      const e = { t, last: t, n: 1, source, msg: m, stack: String(stack ?? '').slice(0, 1500), ctx };
      list.unshift(e); list.length = Math.min(list.length, MAX); save();
      return e;
    },
    list: () => list.slice(),
    clear() { list = []; save(); },
    text() { return list.map(entryText).join('\n\n'); },
  };
  return log;
}
const stamp = (t) => { const d = new Date(t), p = (v) => String(v).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
export function entryText(e) {
  const x = explainError(e.msg);
  return [`[${stamp(e.t)}] ${x.title}${e.n > 1 ? ` (${e.n}번)` : ''}`, `오류: ${e.msg}`, e.ctx ? `상황: ${e.ctx}` : '', e.stack ? `위치: ${e.stack}` : ''].filter(Boolean).join('\n');
}

// 화면 멈춤 감지(순수) — tick(지금, 숨김)을 1초마다. 멈췄다 풀리면 멈춘 초를 돌려줌, 아니면 0. 숨긴 탭(타이머 느려짐)·절전 복귀는 뺌
export function stallWatch(t0 = 0, { limit = STALL_MS } = {}) {
  let last = t0;
  return (t, hidden = false) => {
    const gap = t - last; last = t;
    return !hidden && gap >= limit && gap < SLEEP_MS ? Math.round(gap / 1000) : 0;
  };
}
// 지난 실행이 비정상 종료인가(순수) — 박동 기록이 '보이는 채 사용 중'인데 끊겼으면. 닫기·새로고침·탭 숨김은 clean. 다른 탭이 살아 있으면 박동이 새로움
export function lastRunCrashed(raw, t) {
  let a = null; try { a = JSON.parse(raw); } catch { return null; }
  return a && a.clean === false && t - a.t > DEAD_MS ? { t: a.t, ctx: a.ctx ?? '' } : null;
}

// ---- 화면 ----
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let LOG = null, onNew = null, contextFn = () => '';
const store = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const theLog = () => (LOG ??= createErrorLog({ storage: store(), context: () => contextFn() }));
// 어디서든 부르는 입구 — 화면이 아직 없어도 기록은 남음
export function reportError(source, msg, stack = '') {
  const e = theLog().report(source, msg, stack);
  if (e) { try { onNew?.(e); } catch { /* 알림 실패가 다른 오류를 만들지 않게 */ } }
  return e;
}
export function openErrorLog() {
  document.querySelector('.err-dlg')?.remove();
  const log = theLog(), d = document.createElement('div');
  d.className = 'err-dlg'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', '오류 기록');
  const L = log.list();
  d.innerHTML = `<div class="err-dlg-in"><div class="err-dlg-hd"><b>오류 기록</b> <span>최근 ${L.length}건 · 새 것이 위</span><i></i><button type="button" data-e="copy"${L.length ? '' : ' disabled'}>내용 복사</button><button type="button" data-e="clear"${L.length ? '' : ' disabled'}>기록 지우기</button><button type="button" data-e="close">✕ 닫기</button></div>
    <div class="err-dlg-list">${L.length ? L.map((e) => { const x = explainError(e.msg); return `<div class="err-item ${x.level}"><b>${esc(x.title)}${e.n > 1 ? ` <span>${e.n}번</span>` : ''}</b> <span>${esc(stamp(e.t))}</span><div>${esc(x.cause)} — ${esc(x.todo)}</div><pre>${esc(entryText(e))}</pre></div>`; }).join('') : '<p>기록된 오류가 없습니다.</p>'}</div></div>`;
  d.addEventListener('click', async (ev) => {
    const k = ev.target.closest?.('[data-e]')?.dataset.e;
    if (ev.target === d || k === 'close') d.remove();
    else if (k === 'clear') { log.clear(); openErrorLog(); }
    else if (k === 'copy') { const b = ev.target; try { await navigator.clipboard.writeText(log.text()); b.textContent = '복사됨'; } catch { b.textContent = '복사 실패 — 글을 직접 선택하세요'; } }
  });
  document.body.appendChild(d);
}
function toast(e) {
  const x = explainError(e.msg);
  document.querySelector('.err-toast')?.remove();
  const el = document.createElement('div');
  el.className = `err-toast ${x.level}`; el.setAttribute('role', 'alert');
  el.innerHTML = `<b>${x.level === 'warn' ? '⚠' : '✕'} ${esc(x.title)}</b><div>${esc(x.cause)}</div><div>${esc(x.todo)}</div><code>${esc(e.msg.slice(0, 160))}</code><p><button type="button" data-t="more">자세히</button><button type="button" data-t="close">닫기</button></p>`;
  el.addEventListener('click', (ev) => { const k = ev.target.dataset?.t; if (k === 'more') openErrorLog(); if (k) el.remove(); });
  document.body.appendChild(el);
}
// 시작할 때 한 번 — context() = 그때 하던 일 문구(기록에 함께 남음)
export function installErrorLog({ context = () => '' } = {}) {
  contextFn = context; onNew = toast; globalThis.__udsErrUi = true;
  const S = store(), hid = () => document.visibilityState === 'hidden';
  const prev = lastRunCrashed(S?.getItem(ALIVE), Date.now());
  for (const q of globalThis.__udsEarly ?? []) reportError('시작', q.msg, q.stack);   // main.js 가 뜨기 전 오류(index.html 이 모아 둠)
  if (prev) { const e = theLog().report('이전 실행', `지난 실행이 비정상 종료됨 (마지막 응답 ${stamp(prev.t)})`, '', prev.ctx); if (e) toast(e); }
  window.addEventListener('error', (e) => { if (e.target && e.target !== window) { reportError('파일', `파일을 불러오지 못함: ${e.target.src ?? e.target.href ?? e.target.tagName}`); return; } reportError('프로그램', e.message, e.error?.stack ?? `${e.filename ?? ''}:${e.lineno ?? ''}`); }, true);
  window.addEventListener('unhandledrejection', (e) => reportError('프로그램', e.reason?.message ?? e.reason, e.reason?.stack));
  const ce = console.error.bind(console);   // 잡아서 console.error 로만 남기던 오류(구독자 오류 등)도 기록
  console.error = (...a) => { ce(...a); const err = a.find((x) => x instanceof Error); if (err || String(a[0]).startsWith('[m3')) reportError('프로그램', a.map((x) => x?.message ?? x).join(' '), err?.stack); };
  const beat = (clean = false) => { try { let ctx = ''; try { ctx = context(); } catch { ctx = ''; } S?.setItem(ALIVE, JSON.stringify({ t: Date.now(), clean, ctx })); } catch { /* 저장 공간 부족 */ } };
  const watch = stallWatch(Date.now());
  let n = 0;
  setInterval(() => {
    const sec = watch(Date.now(), hid());
    if (sec) reportError('화면', `화면이 ${sec}초 동안 멈춤`);
    if (!hid() && (++n * 1000) % BEAT_MS === 0) beat();
  }, 1000);
  beat();
  addEventListener('pagehide', () => beat(true));
  document.addEventListener('visibilitychange', () => { if (hid()) beat(true); else { watch(Date.now(), true); beat(); } });
}
