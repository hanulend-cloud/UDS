// 칸 크기 조절 막대(2026-10-30) — 나란한 칸들(items) 사이에 끌기 막대를 넣어 비율을 바꿈.
// dir 'col' = 위아래로 쌓인 칸의 높이(가로 막대), 'row' = 좌우로 놓인 칸의 폭(세로 막대). 비율 = flex-grow — 전체 크기는 그대로(부모를 꽉 채움).
// 두 번 클릭 = 같은 크기. 비율은 보는 사람별(localStorage key). onChange = 크기가 바뀐 뒤(캔버스 다시 그리기 등)
export function mountSplit(items, { key, dir = 'col', min = 60, init = null, onChange = () => {} } = {}) {   // init = 처음 비율(없으면 같은 크기)
  const els = items.filter(Boolean);
  if (els.length < 2 || els[0].dataset.split2) return null;
  els[0].dataset.split2 = '1';
  const load = () => { try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) && v.length === els.length && v.every((x) => x > 0) ? v : null; } catch { return null; } };
  const save = () => { try { localStorage.setItem(key, JSON.stringify(w)); } catch {} };
  const def = () => (Array.isArray(init) && init.length === els.length ? init.slice() : els.map(() => 1));
  let w = load() ?? def();
  const size = (e) => (dir === 'col' ? e.getBoundingClientRect().height : e.getBoundingClientRect().width);
  const apply = () => els.forEach((e, i) => { e.style.flex = `${w[i]} 1 0`; if (dir === 'col') e.style.minHeight = '0'; else e.style.minWidth = '0'; });
  els.slice(0, -1).forEach((e, i) => {
    const h = document.createElement('div');
    h.className = `m3-psplit ${dir}`; h.setAttribute('role', 'separator'); h.setAttribute('aria-orientation', dir === 'col' ? 'horizontal' : 'vertical');
    h.title = `${dir === 'col' ? '위아래' : '좌우'}로 끌어 크기 조절 · 두 번 클릭 = 같은 크기`;
    h.addEventListener('pointerdown', (ev) => {
      const a0 = size(els[i]), b0 = size(els[i + 1]), s = w[i] + w[i + 1], p0 = dir === 'col' ? ev.clientY : ev.clientX;
      if (a0 + b0 < 2 * min) return;   // 칸이 숨었거나(접힘) 너무 작으면 끌지 않음 — 비율이 망가진 채 저장되던 것 방지
      ev.preventDefault(); h.setPointerCapture(ev.pointerId); h.classList.add('on');
      const mv = (m) => { const d = (dir === 'col' ? m.clientY : m.clientX) - p0, a = Math.max(min, Math.min(a0 + b0 - min, a0 + d)); w[i] = (s * a) / (a0 + b0); w[i + 1] = s - w[i]; apply(); onChange(); };
      const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); h.classList.remove('on'); save(); onChange(); };
      h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    });
    h.addEventListener('dblclick', () => { w = def(); apply(); save(); onChange(); });
    e.after(h);
  });
  apply();
  return { reset: () => { w = def(); apply(); save(); onChange(); } };
}

// 기구 최적화 창 아래 칸의 좌우 경계(2026-11-05) — x = 왼쪽 폭(px), W = 전체 폭. 왼쪽 ≥ minL, 오른쪽 ≥ minR(좁으면 왼쪽 우선)
export const clampLeft = (x, W, minL = 300, minR = 320) => Math.max(minL, Math.min(x, W - minR));
// grid 칸(--m3-mon-l)을 끌어서 조절 · 보는 사람별로 기억 · 더블클릭 = 처음 비율 · 방향키 = 20 px
export function mountColSplit(body, { key = 'uds.m3.monLeft', onChange = () => {} } = {}) {
  if (!body || body.querySelector(':scope > .m3-mon-colsplit')) return null;
  const h = document.createElement('div');
  h.className = 'm3-mon-colsplit'; h.setAttribute('role', 'separator'); h.setAttribute('aria-orientation', 'vertical'); h.setAttribute('aria-label', '왼쪽·오른쪽 칸 폭'); h.tabIndex = 0; h.title = '끌어서 좌우 폭 조절 · 더블클릭 = 처음 비율';
  body.appendChild(h);
  const set = (x, save = true) => { body.style.setProperty('--m3-mon-l', `${Math.round(x)}px`); if (save) { try { localStorage.setItem(key, String(Math.round(x))); } catch {} } onChange(); };
  try { const v = +localStorage.getItem(key); if (v > 0) body.style.setProperty('--m3-mon-l', `${v}px`); } catch {}
  const leftOf = () => h.getBoundingClientRect().left + h.offsetWidth / 2 - body.getBoundingClientRect().left;
  h.addEventListener('pointerdown', (e) => {
    e.preventDefault(); h.setPointerCapture(e.pointerId); h.classList.add('on');
    const x0 = e.clientX, l0 = leftOf();
    const mv = (m) => set(clampLeft(l0 + m.clientX - x0, body.clientWidth), false);
    const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); h.classList.remove('on'); set(leftOf()); };
    h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  });
  h.addEventListener('dblclick', () => { body.style.removeProperty('--m3-mon-l'); try { localStorage.removeItem(key); } catch {} onChange(); });
  h.addEventListener('keydown', (e) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); set(clampLeft(leftOf() + (e.key === 'ArrowLeft' ? -20 : 20), body.clientWidth)); });
  return h;
}
