// 실행 · 일시정지 · 중지 단추(2026-11-04) — 광분포 시뮬레이션과 기구 최적화가 같은 세 단추. 지금 쓸 수 없는 단추는 흐리게
// 실행 = 일시정지면 이어서, 그 밖에는 처음부터 · 일시정지 = 나중에 이어서 · 중지 = 끝냄(이어서 못 함)
const LABEL = [['run', '▶ 실행'], ['pause', '⏸'], ['stop', '■ 중지']];   // 일시정지 = 표시만(글씨 빼고 마우스 설명·읽기 이름으로, 2026-11-08)
const NAME = { run: '실행', pause: '일시정지', stop: '중지' };

// snap = 점진 계산 스냅숏, busy = 기구 최적화 중
export function simCtl(snap, busy = false) {
  if (busy) { const t = '기구 최적화가 끝나면 쓸 수 있음'; return { run: false, pause: false, stop: false, runTitle: t, pauseTitle: t, stopTitle: t }; }
  const s = snap?.state, going = s === 'running' || s === 'pending' || s === 'starting', paused = s === 'paused' && !snap?.stopped;
  return { run: !going, pause: going, stop: going || paused, runTitle: paused ? '이어서 계산' : going ? '' : '처음부터 계산', pauseTitle: going ? '멈췄다가 이어서 계산할 수 있음' : '', stopTitle: going || paused ? '계산을 끝냄 — 지금까지의 결과는 남음' : '' };
}
// canRun = 켠 항목이 있고 관측 라인이 있음, hasResult = 적용 전 결과가 있음(실행하면 버림)
export function optCtl({ running = false, paused = false, canRun = true, hasResult = false, why = '' } = {}) {
  if (running) return { run: paused, pause: !paused, stop: true, runTitle: paused ? '이어서 실행' : '', pauseTitle: paused ? '' : '멈췄다가 이어서 실행할 수 있음', stopTitle: '최적화를 끝냄 — 찾던 안은 반영되지 않음' };
  return { run: canRun, pause: false, stop: false, runTitle: canRun ? (hasResult ? '지금 결과를 버리고 처음부터 실행 — 먼저 확인함' : '체크한 항목으로 실행') : why, pauseTitle: '', stopTitle: '' };
}
// 창 제목의 단계 표시 — 상단 메뉴와 같은 번호, 끝나면 초록 ✓
export function setStepMark(i, n, done) {
  if (!i) return;
  const t = done ? '✓' : String(n);
  if (i.textContent !== t) i.textContent = t;
  i.classList.toggle('done', !!done);
}
// 적용 전 결과를 버리고 다시 실행할 때 묻는 말 — 긴 계산 결과를 실수로 잃지 않게
export function rerunAsk(best) {
  const n = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–');
  return `적용하지 않은 최적화 결과가 있습니다${best ? ` (길이 균일도 ${n(best.Ulen)} · 폭 균일도 ${n(best.Uwid)})` : ''}.\n버리고 처음부터 다시 실행할까요?`;
}
// 단추 틀(한 번만 만듦) + 상태 갱신 — fn(k) k = run | pause | stop
export function setCtl(box, c, fn) {
  if (!box) return;
  if (!box.querySelector('[data-ctl]')) box.innerHTML = LABEL.map(([k, t]) => `<button type="button" data-ctl="${k}" aria-label="${NAME[k]}">${t}</button>`).join('');
  for (const [k] of LABEL) {
    const b = box.querySelector(`[data-ctl="${k}"]`), title = c[`${k}Title`] || (k === 'pause' ? '일시정지' : '');
    b.disabled = !c[k]; if (b.title !== title) b.title = title; b.onclick = () => fn(k);
  }
}
