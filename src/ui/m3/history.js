// 되돌리기·다시 실행(순수, 2026-11-02) — 상태 전체를 문자열로 비교해 바뀐 때만 한 칸. capture() = 지금 상태 문자열, restore(이전, 지금) = 그 상태로.
// merge(ms) 안에 이어진 변경(슬라이더 끌기·한 동작의 여러 update)은 한 칸. hold/release = 오래 걸리는 한 동작을 한 칸으로
export function createHistory({ capture, restore, limit = 100, merge = 400, now = () => Date.now() }) {
  const undo = [], redo = [];
  let cur = capture(), t0 = -Infinity, held = 0, busy = false;
  const h = {
    note() {
      if (busy || held) return false;
      const c = capture();
      if (c === cur) return false;
      const t = now();
      if (t - t0 >= merge || !undo.length) { undo.push(cur); if (undo.length > limit) undo.shift(); }
      redo.length = 0; cur = c; t0 = t;
      return true;
    },
    hold() { held++; },
    release() { held = Math.max(0, held - 1); if (!held) { t0 = -Infinity; h.note(); } },
    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0,
    undo: () => step(undo, redo),
    redo: () => step(redo, undo),
  };
  function step(from, to) {
    if (!from.length) return false;
    const was = cur, next = from.pop();
    to.push(was); cur = next; t0 = -Infinity;
    busy = true;
    try { restore(next, was); } finally { busy = false; }
    cur = capture();   // 다시 그리면서 정리된 값(무효가 된 LED 조정 등)이 새 칸이 되지 않게
    return true;
  }
  return h;
}
