// 되돌리기(순수): 바뀐 때만 한 칸 · 이어진 변경은 한 칸 · 다시 실행 · 새 편집은 다시 실행을 비움 · 묶기
import { createHistory } from '../src/ui/m3/history.js';
let fail = 0, T = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fail++; };
let v = 'a', restored = [];
const h = createHistory({ capture: () => v, restore: (n, w) => { restored.push([n, w]); v = n; }, now: () => T, merge: 400, limit: 3 });
ok(!h.canUndo() && h.note() === false, '안 바뀜 = 칸 없음');
v = 'b'; T = 1000; ok(h.note() && h.canUndo(), '바뀜 = 한 칸');
v = 'c'; T = 1100; h.note();
h.undo(); ok(v === 'a' && restored[0][0] === 'a' && restored[0][1] === 'c', '400 ms 안 이어진 변경 = 한 번에 되돌림');
ok(h.canRedo() && !h.canUndo(), '다시 실행 가능');
h.redo(); ok(v === 'c' && h.canUndo() && !h.canRedo(), '다시 실행');
h.undo(); v = 'x'; T = 5000; h.note(); ok(!h.canRedo() && v === 'x', '새 편집 = 다시 실행 비움');
h.undo(); ok(v === 'a', '한 칸 되돌림');
{ let w = 0; const g = createHistory({ capture: () => String(w), restore: (n) => { w = +n; }, now: () => T, limit: 3 });
  for (let i = 1; i <= 5; i++) { w = i; T += 1000; g.note(); }
  let n = 0; while (g.undo()) n++; ok(n === 3 && w === 2, `최대 칸 수 3 (되돌림 ${n}, 값 ${w})`); }
{ let w = 0; const g = createHistory({ capture: () => String(w), restore: (n) => { w = +n; }, now: () => T });
  g.hold(); w = 1; T += 5000; g.note(); w = 2; T += 5000; g.note(); g.release();
  ok(g.undo() && w === 0 && !g.canUndo(), '묶기: 오래 걸린 한 동작 = 한 칸'); }
{ let w = 0, q = createHistory({ capture: () => String(w), restore: (n) => { w = +n + 100; }, now: () => T });   // 복원 중 정리된 값은 새 칸이 아님
  w = 1; T += 1000; q.note(); q.undo(); ok(w === 100 && q.note() === false && q.canRedo(), '복원 뒤 정리된 값 = 칸 없음·다시 실행 유지'); }
process.exitCode = fail ? 1 : 0;
