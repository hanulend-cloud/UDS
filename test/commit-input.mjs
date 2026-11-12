// 숫자 칸 확정 규칙(순수 부분): node test/commit-input.mjs
import { flushOn } from '../src/ui/m3/commit-input.js';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fail++; };
const el = (sel) => ({ matches: (q) => q.split(',').some((x) => sel.includes(x.trim())), closest: (q) => (q.split(',').some((x) => sel.includes(x.trim())) ? {} : null) });
// 대기 중인 값(주황)이 있을 때 단추·3D 화면을 누르면 먼저 적용(2026-11-12) — 패널이 다시 그려지며 값이 버려지던 것(보는 각도 30 → 저장된 90)
ok(flushOn(el(['button'])) === true, '단추 누름 → 대기 값 적용');
ok(flushOn(el(['canvas'])) === true, '3D 화면 누름 → 대기 값 적용');
ok(flushOn(el(['input'])) === false, '다른 칸 누름 → 적용 안 함(기존 규칙)');
ok(flushOn(el(['div'])) === false, '빈 곳 누름 → 적용 안 함(기존 규칙)');
ok(flushOn(null) === false, '대상 없음 → 적용 안 함');
console.log(fail ? `${fail} FAIL` : 'all PASS'); process.exit(fail ? 1 : 0);
