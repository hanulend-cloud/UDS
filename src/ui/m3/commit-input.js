// 숫자 칸 = Enter 로 확정(2026-11-02) — 값을 고치는 도중(화살표·휠·입력)에 시뮬레이션이 다시 시작되면 값을 바꾸기 어려웠음.
// 3D 화면 안의 모든 숫자 칸에 공통: 고치는 동안의 input·change 를 붙잡아 두고(주황 테두리), Enter·Tab = 적용(그때 칸의 원래 처리가 돎), Esc = 되돌림.
// 다른 곳을 눌러도 적용하지 않고 주황으로 남겨 둠. 칸마다 처리를 고치지 않으려고 문서 캡처 단계에서 한 번만 막음
const HINT = 'Enter = 적용(그때 다시 계산) · Esc = 되돌림';
let installed = false, committing = false;
const isField = (t) => !!t?.matches?.('input[type="number"]') && !!t.closest?.('#mech3d-wrap');
const base = (t) => t._commitV ?? t.defaultValue;
const mark = (t) => {
  const on = t.value !== base(t);
  t.classList.toggle('m3-pending', on);
  if (on) { t._commitTitle ??= t.title; t.title = HINT; } else if (t._commitTitle != null) { t.title = t._commitTitle; t._commitTitle = null; }
};
// 대기 값을 먼저 적용할 누름(순수, 2026-11-12) — 단추·3D 화면 = 다음 작업(면 다시 지정·탭 바꾸기 등)이라 패널이 다시 그려지며 대기 값이 버려졌음
// (보는 각도 30 을 Enter 없이 두고 면을 다시 지정 → 저장된 90 으로 보임). 다른 칸·빈 곳 누름은 그대로 적용 안 함
export const flushOn = (t) => !!t?.closest?.('button, canvas, select, [role="tab"]');
const commit = (t) => {
  t._commitV = t.value; mark(t);
  committing = true;
  try { t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); } finally { committing = false; }
};
export function installCommitInputs(doc = document) {
  if (installed) return;
  installed = true;
  doc.addEventListener('focusin', (e) => { const t = e.target; if (isField(t) && !t.classList.contains('m3-pending')) t._commitV = t.value; }, true);
  const hold = (e) => { const t = e.target; if (committing || !isField(t)) return; e.stopImmediatePropagation(); mark(t); };
  doc.addEventListener('input', hold, true);
  doc.addEventListener('change', hold, true);
  doc.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!isField(t)) return;
    if (e.key === 'Escape') { if (t.classList.contains('m3-pending')) { t.value = base(t); mark(t); e.stopPropagation(); e.preventDefault(); } return; }
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    if (e.key === 'Enter') e.preventDefault();
    if (!t.classList.contains('m3-pending')) return;
    commit(t);
  }, true);
  // 단추는 click 캡처에서(누르는 순간 적용하면 패널이 다시 그려져 그 click 이 사라질 수 있음 — click 은 이미 경로가 정해진 뒤라 그대로 감)
  // 3D 화면은 pointerdown 에서(면 고르기는 pointerup 에서 끝나 click 보다 먼저)
  const flush = () => { for (const t of doc.querySelectorAll('#mech3d-wrap input.m3-pending')) if (isField(t)) commit(t); };
  doc.addEventListener('pointerdown', (e) => { if (e.target?.closest?.('canvas')) flush(); }, true);
  doc.addEventListener('click', (e) => { if (flushOn(e.target)) flush(); }, true);
}
