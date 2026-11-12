import { setCtl, setStepMark } from './run-ctl.js';
// ⑤ 기구 최적화 창 — 화면 안에 떠 있는 창(2026-10-29). 기본 화면에는 설계와 ④ 광분포 시뮬레이션만 두고,
// 기구 최적화에 관한 칸('설계 인자 현황' · 기구 최적화 실행·항목·결과)은 처음부터 이 창 안에 옮겨 둔다(같은 DOM — 연결·갱신 그대로).
// 명령줄 [5 기구 최적화] 로 열고 닫음(닫으면 숨김 — 기본 화면으로 돌아가지 않음). 끌어서 옮기기(머리) · 크기 조절(상하좌우·모서리) · 접기(제목과 현재 결과만).
// 열림·위치·크기·접힘 = 보는 사람별(uds.m3.opt)
const KEY = 'uds.m3.opt', MIN_W = 320, MIN_H = 160;
export const COLLAPSED_W = 720;   // 접은 창 폭 — 제목·현재 결과 1~2개·단추만
export const DEF_RECT = { x: null, y: 80, w: 1040, h: 680 };   // x null = 오른쪽에 붙임 · 넓게(왼쪽 설계 인자 | 오른쪽 실행·진행, 2026-10-30)
const LAY = 2;   // 창 배치 판 — 예전(세로 쌓기, 폭 540) 저장값은 위치·크기를 새 기본으로

// 창을 열 때 — 아래가 화면 밖이면 올려서(필요하면 줄여서) 모든 가장자리를 잡을 수 있게(순수)
// top = 창이 올라갈 수 있는 맨 위(상단 바 아래, 2026-11-12 — 메뉴를 가리지 않게). 생략 = 8
export function fitRect(r, vw, vh, top = 8) {
  const w = Math.min(r.w, vw - 16), h = Math.min(r.h, vh - top - 8);
  return { x: Math.max(8, Math.min(r.x ?? vw - w - 8, vw - w - 8)), y: Math.max(top, Math.min(r.y ?? top, vh - h - 8)), w, h };
}
// 창 머리 단계 표시(순수) — 설정 › 진행 › 결과. 상태에 따라 저절로 바뀜(누르는 탭 아님, 2026-11-12 사용자: 한 화면으로)
export function monStepsHtml(mode) {
  const ks = [['set', '설정'], ['run', '진행'], ['result', '결과']], at = Math.max(0, ks.findIndex(([k]) => k === mode));
  return ks.map(([, n], i) => (i < at ? `<i class="ok">${n} ✓</i>` : i === at ? `<i class="now">${n}</i>` : `<i>${n}</i>`)).join('<span class="sep"> › </span>');
}
// [⤢ 크게] — 상단 바·단계 막대 아래 화면 전체(순수, 2026-11-12 평가 5: 창이 작아 안에서 계속 스크롤)
export const maxRect = (vw, vh, top = 8) => ({ x: 8, y: top, w: Math.max(MIN_W, vw - 16), h: Math.max(MIN_H, vh - top - 8) });
// 창이 화면 밖으로 나가지 않게(머리 줄은 늘 보이게) 위치·크기를 맞춤 — 순수
// 위 경계(px) — 화면에서 읽음
export const winTop = () => {   // 상단 바·작업 단계 막대 아래(둘 다 가리지 않게)
  if (typeof document === 'undefined') return 8;
  const b = [document.querySelector('header'), document.querySelector('#m3-cmd')].filter((e) => e && e.offsetParent !== null).map((e) => e.getBoundingClientRect().bottom);
  return b.length ? Math.round(Math.max(...b)) + 4 : 8;
};
export function clampRect(r, vw, vh, top = 8) {
  const w = Math.round(Math.max(MIN_W, Math.min(r.w ?? DEF_RECT.w, vw - 16))), h = Math.round(Math.max(MIN_H, Math.min(r.h ?? DEF_RECT.h, vh - top - 8)));
  const x0 = r.x == null ? vw - w - 16 : r.x;
  return { x: Math.round(Math.max(8, Math.min(x0, vw - w - 8))), y: Math.round(Math.max(top, Math.min(r.y ?? DEF_RECT.y, vh - 40))), w, h };
}
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };

// 머리·모서리 끌기(떠 있는 창 공용) — snap() = 끌기 시작 때 상태, onMove(dx, dy, 시작 상태), ok(e) = 끌어도 되는 곳인지
export function dragBy(handle, snap, onMove, ok, onEnd = () => {}) {
  handle.addEventListener('pointerdown', (e) => {
    if (!ok(e)) return;
    e.preventDefault(); handle.setPointerCapture(e.pointerId);
    const x0 = e.clientX, y0 = e.clientY, s0 = snap();
    const mv = (ev) => onMove(ev.clientX - x0, ev.clientY - y0, s0);
    const up = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); onEnd(); };
    handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
  });
}
// 떠 있는 창이 겹칠 때 — 누른 창을 앞으로(기구 최적화 창 ↔ 광량 분포 창)
export function raiseWin(el) { document.querySelectorAll('.m3-mon, .m3-big-in').forEach((w) => { w.style.zIndex = w === el ? '61' : '60'; }); }

// 상·하·좌·우·모서리 어디서든 크기 조절(순수) — dir = 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'. 왼쪽·위를 끌면 반대쪽 모서리는 제자리, 최소 크기에서 멈춤
export function resizeRect(s0, dir, dx, dy, minW = MIN_W, minH = MIN_H) {
  const r = { x: s0.x, y: s0.y, w: s0.w, h: s0.h };
  if (dir.includes('e')) r.w = Math.max(minW, s0.w + dx);
  if (dir.includes('s')) r.h = Math.max(minH, s0.h + dy);
  if (dir.includes('w')) { r.w = Math.max(minW, s0.w - dx); r.x = s0.x + s0.w - r.w; }
  if (dir.includes('n')) { r.h = Math.max(minH, s0.h - dy); r.y = s0.y + s0.h - r.h; }
  return r;
}
// 창 가장자리 8곳에 크기 조절 손잡이 — rect() = 지금 위치·크기, apply(새 값), ok() = 지금 조절 가능한가(접힘이면 아님)
export function mountResizers(el, { rect, apply, ok = () => true, end = () => {}, minW = MIN_W, minH = MIN_H }) {
  for (const d of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const h = document.createElement('div');
    h.className = `m3-rz ${d}`; h.setAttribute('aria-hidden', 'true');
    el.appendChild(h);
    dragBy(h, () => ({ ...rect() }), (dx, dy, s0) => apply(resizeRect(s0, d, dx, dy, minW, minH)), ok, end);
  }
}
// host = 창을 붙일 곳(#mech3d-wrap — CSS 변수 상속), items = 창에 담을 칸들(차례대로), onChange(open) = 단추 표시 갱신
export function createMonitor({ host, items, onChange = () => {}, onTab = () => {} }) {
  const sv = load(), old = sv.lay !== LAY;
  let st = { open: false, min: false, ...DEF_RECT, ...(old ? { open: sv.open, min: sv.min } : sv) };
  st.min = !!st.min; st.open = !!st.open;
  st.max = !!sv.max && !old;
  const persist = () => save({ lay: LAY, open: st.open, min: st.min, max: st.max, x: st.x, y: st.y, w: st.w, h: st.h });
  const el = document.createElement('div');
  const place = () => { const r = st.max && !st.min ? maxRect(innerWidth, innerHeight, winTop()) : clampRect(st.min ? { ...st, w: COLLAPSED_W } : st, innerWidth, innerHeight, winTop()); st.x = r.x; st.y = r.y; if (!st.min) { st.w = r.w; st.h = r.h; } el.style.left = `${r.x}px`; el.style.top = `${r.y}px`; el.style.width = `${r.w}px`; el.style.height = st.min ? 'auto' : `${r.h}px`; };
  const kick = () => window.dispatchEvent(new Event('resize'));   // 담은 칸의 그래프·캔버스 크기 다시
  el.className = 'm3-mon'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '기구 최적화');
  el.innerHTML = `<div class="m3-mon-hd" title="끌어서 옮기기 · ④ 광분포 결과가 목표 미달이면 여기서 후보를 찾아 최종 판정 → [적용]"><b><i class="m3-fl" data-mon-step>5</i>기구 최적화</b><span class="m3-mon-steps" data-mon-steps aria-live="polite"></span><span class="m3-mon-sum" data-mon-sum></span><span class="m3-mon-sp"></span><span class="m3-ctl" data-mon-ctl></span><button type="button" data-mon-max></button><button type="button" data-mon-min></button><button type="button" data-mon-close title="창 닫기(진행 중인 최적화는 계속)">✕ 닫기</button></div><div class="m3-mon-body"></div>`;
  const body = el.querySelector('.m3-mon-body');
  for (const it of items.filter(Boolean)) body.appendChild(it);   // 기본 화면에서 빼서 창 안으로(닫아도 여기 그대로)
  host.appendChild(el);
  const unmax = () => { if (st.max && !st.min) { st.max = false; updMax(); } };   // 크게 한 채로 끌거나 크기를 바꾸면 그 크기에서 보통 창으로(지금 위치·크기는 place 가 st 에 남김)
  const snap = () => { unmax(); return { ...st }; };
  dragBy(el.querySelector('.m3-mon-hd'), snap, (dx, dy, s0) => { st.x = s0.x + dx; st.y = s0.y + dy; place(); }, (e) => !e.target.closest('button'), persist);
  mountResizers(el, { rect: () => (unmax(), st), apply: (r) => { Object.assign(st, r); place(); }, ok: () => !st.min, end: () => { persist(); kick(); } });
  el.addEventListener('pointerdown', () => raiseWin(el), true);
  el.querySelector('[data-mon-min]').onclick = () => setMin(!st.min);
  el.querySelector('[data-mon-max]').onclick = () => setMax(!st.max || st.min);
  function updMax() { const b = el.querySelector('[data-mon-max]'), on = st.max && !st.min; b.textContent = on ? '⤡ 원래 크기' : '⤢ 크게'; b.title = on ? '크게 하기 전 크기로' : '상단 바 아래 화면 전체로 넓히기'; }
  function setMax(v) {
    if (v && !st.max) { st.prev = { x: st.x, y: st.y, w: st.w, h: st.h }; }   // 원래 크기로 돌아갈 자리
    else if (!v && st.prev) { Object.assign(st, st.prev); st.prev = null; }
    st.max = !!v; if (v && st.min) { setMin(false); } updMax(); place(); persist(); kick(); raiseWin(el);
  }
  el.querySelector('[data-mon-close]').onclick = () => close();
  // 끝난 뒤 진행 기록(그래프·후보 표) — 결과 아래 접는 칸(2026-11-12 사용자: 탭 대신 한 화면)
  const logBtn = document.createElement('button');
  logBtn.type = 'button'; logBtn.className = 'm3-mon-log'; logBtn.setAttribute('aria-expanded', 'false');
  logBtn.onclick = () => { const on = !el.classList.contains('show-log'); el.classList.toggle('show-log', on); logBtn.setAttribute('aria-expanded', String(on)); logBtn.textContent = on ? '▾ 진행 기록 접기' : '▸ 진행 기록 — 그래프·후보 표'; kick(); };
  logBtn.textContent = '▸ 진행 기록 — 그래프·후보 표';
  body.appendChild(logBtn);
  // 화면 = 설정(설계 인자 고르기) · 진행(진행률·그래프) · 결과(판정·변화·적용). ok = 고를 수 있는 탭
  function setMode(mode, ok = {}) {
    if (el.dataset.mode !== mode) { el.dataset.mode = mode; kick(); }
    const q = el.querySelector('[data-mon-steps]'), h = monStepsHtml(mode); if (q._h !== h) { q._h = h; q.innerHTML = h; }
  }
  function setMin(v) {
    v = !!v;   // 저장값에 min 이 없으면 undefined → classList.toggle 이 뒤집기로 동작해 몸통은 숨고 단추는 '접기'로 남았음(펼칠 방법 없음, 2026-11-08)
    st.min = v; persist();
    el.classList.toggle('min', v);
    const b = el.querySelector('[data-mon-min]'); b.textContent = v ? '▾ 펼치기' : '▴ 접기'; b.title = v ? '모든 칸 보기' : '제목과 현재 결과만 남기기';
    updMax(); place(); kick();
  }
  function open() {
    raiseWin(el);   // 열 때 늘 앞으로(2026-11-12 평가 5: 광량 분포 창 뒤에 숨었음)
    if (st.open) return;
    Object.assign(st, fitRect(st, innerWidth, innerHeight, winTop()));
    st.open = true; persist(); el.hidden = false; setMin(st.min); onChange(true);
    addEventListener('resize', place);
  }
  function close() {
    if (!st.open) return;
    st.open = false; persist(); el.hidden = true; onChange(false);
    removeEventListener('resize', place);
  }
  if (st.open) { st.open = false; queueMicrotask(open); }   // 지난번에 열어 둔 채였으면 다시 엶
  // 접었을 때 보일 현재 결과(글 1~2개) — html
  const setSummary = (html) => { const q = el.querySelector('[data-mon-sum]'); if (q && q._h !== html) { q._h = html; q.innerHTML = html; } };
  const setRunCtl = (c, fn) => setCtl(el.querySelector('[data-mon-ctl]'), c, fn);   // 접은 창의 실행·일시정지·중지
  return { setMode, open, close, expand: () => { if (st.min) setMin(false); }, collapse: () => { if (!st.min) setMin(true); }, toggle: () => (st.open ? close() : open()), isOpen: () => st.open, el, setSummary, setCtl: setRunCtl, setDone: (d) => setStepMark(el.querySelector('[data-mon-step]'), 5, d) };
}
