// 큰 STEP 불러오기 화면(2026-11-05) — 진행률·경과 시간·취소, 그리고 만들어지는 대로 보이는 저해상도 미리보기.
// 3D 보기는 한 번만 만들어 재사용(WebGL 문맥을 늘리지 않게).
import { loadPct, stageEstimateSec, LOAD_LABEL } from '../engine/shape/step-load-plan.js';

let viewP = null;
export function showStepLoad(file, { onCancel }) {
  const doc = document;
  let el = doc.getElementById('step-load');
  if (!el) {
    el = doc.createElement('div'); el.id = 'step-load'; el.setAttribute('role', 'status');
    el.innerHTML = `<canvas class="sl-cv"></canvas><div class="sl-empty">형상을 읽는 중 — 끝나면 저해상도 도면이 여기에 나타납니다</div>
      <div class="sl-bar"><div class="sl-top"><b class="sl-name"></b><span class="sl-pct"></span><span class="sl-sp"></span><span class="sl-time"></span><button type="button" class="sl-cancel">취소</button></div>
      <div class="sl-track"><div class="sl-fill"></div></div><div class="sl-text"></div></div>`;
    doc.body.appendChild(el);
  }
  const $ = (s) => el.querySelector(s), t0 = Date.now();
  el.hidden = false; $('.sl-name').textContent = file.name; $('.sl-empty').hidden = false;
  let key = 'oc', frac = 0, since = Date.now(), note = '', list = [], closed = false, last = 0;
  const estimated = (k) => k === 'read' || k === 'transfer';
  const paint = () => {
    if (closed) return;
    const f = estimated(key) ? Math.min(0.95, (Date.now() - since) / 1000 / stageEstimateSec(key, file.size)) : frac, p = Math.floor(loadPct(key, f));
    if (p > last) last = p;   // 뒤로 가지 않게
    $('.sl-pct').textContent = `${estimated(key) ? '약 ' : ''}${last}%`;
    $('.sl-fill').style.width = `${last}%`;
    const s = Math.floor((Date.now() - t0) / 1000); $('.sl-time').textContent = `경과 ${s >= 60 ? `${Math.floor(s / 60)}분 ` : ''}${s % 60}초`;
    $('.sl-text').textContent = `${LOAD_LABEL[key] ?? ''}${note ? ` — ${note}` : ''}${estimated(key) ? ' (도면 안에서 멈춰 있는 단계라 진행률은 어림값)' : ''}`;
  };
  const tick = setInterval(paint, 500); paint();
  const view = () => (viewP ??= import('./mech3d-view.js').then(({ createMech3dView }) => createMech3dView($('.sl-cv'), { onPick: () => {}, onLost: () => {} })));
  const clear = () => { const p = viewP; viewP = null; p?.then((v) => { try { v.dispose(); } catch {} }); const old = $('.sl-cv'), cv = old.cloneNode(false); old.replaceWith(cv); };   // 미리보기 3D 문맥을 닫고 다음 불러오기용 새 캔버스
  const close = () => { if (closed) return; closed = true; clearInterval(tick); el.hidden = true; clear(); };
  $('.sl-cancel').onclick = () => { close(); onCancel?.(); };
  return {
    stage(k, f = 0, text = '') { if (k !== key) since = Date.now(); key = k; frac = f; note = text; paint(); },
    async preview(mesh) {
      list.push(mesh); $('.sl-empty').hidden = true;
      const v = await view(); if (closed) return;
      const looks = list.map(() => ({ color: 0x9fb3c8, opacity: 0.6 }));
      try { v.setParts(list, list.map(() => 'opaque'), { keepCamera: false, looks }); } catch (e) { console.warn('[불러오기] 미리보기 실패', e); }
    },
    close,
  };
}
