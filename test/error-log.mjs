// 오류 기록: 설명 · 반복 묶기 · 남은 기록 · 화면 멈춤 · 비정상 종료: node test/error-log.mjs
import { explainError, isNoise, createErrorLog, entryText, stallWatch, lastRunCrashed, STALL_MS } from '../src/ui/error-log.js';
let fail = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fail++; };
const mem = (init = {}) => { const d = { ...init }; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; } }; };

{ // 설명: 실제로 나온 문구들
  const t = (m) => explainError(m);
  ok(t('GPU 장치를 잃음').level === 'warn' && /CPU/.test(t('GPU 장치를 잃음').todo) && t('GPU 응답 없음 (20초)').title === t('DXGI_ERROR_DEVICE_HUNG').title, 'GPU 멈춤 = 경고(CPU 로 계속)');
  ok(t('기구 최적화 실패: Worker 응답 없음 (chunk 90초)').title.includes('제한 시간') && t('계산 시간 초과(10분) — 다시 시도하세요').level === 'error', 'Worker 응답 없음 = 제한 시간');
  ok(t('계산 Worker 오류: 모듈을 불러오지 못함').title.includes('파일') && /run\.bat/.test(t('파일을 불러오지 못함: main.js').todo), '파일 못 받음 = 서버 확인 안내');
  ok(t('Array buffer allocation failed').title === '메모리 부족' && t('기구 최적화 실패: 장면이 바뀜').title === '기구 최적화 실패' && t('계산 실패: x').title === '광분포 계산 실패', '메모리 · 최적화 · 계산');
  ok(t('x is not a function').title === '프로그램 오류' && t('').level === 'error', '모르는 오류 = 프로그램 오류');
  ok(isNoise('ResizeObserver loop completed') && isNoise('기구 최적화 중지') && !isNoise('GPU 장치를 잃음'), '무해한 것은 알리지 않음');
}
{ // 기록: 반복 묶기 · 새로고침 뒤 남음 · 상황 · 지우기
  let t = 1000, c = '최적화: LED 후보';
  const s = mem(), L = createErrorLog({ storage: s, now: () => t, context: () => c });
  const a = L.report('gpu', 'GPU 장치를 잃음', 'at x');
  ok(a && a.n === 1 && a.ctx.includes('LED') && L.list().length === 1, '첫 오류 = 새 항목 · 상황 포함');
  t += 5000; ok(L.report('gpu', 'GPU 장치를 잃음') === null && L.list()[0].n === 2, '1분 안 같은 오류 = 횟수만');
  t += 70000; ok(L.report('gpu', 'GPU 장치를 잃음') !== null && L.list().length === 2, '1분 지나면 새 항목');
  ok(L.report('x', '') === null && L.report('x', 'AbortError: y') === null && L.list().length === 2, '빈 문구·무해한 것 = 기록 안 함');
  const again = createErrorLog({ storage: s });
  ok(again.list().length === 2 && again.list()[1].stack === 'at x', '새로고침 뒤에도 기록이 남음');
  const tx = entryText(L.list()[1]);
  ok(/GPU 드라이버/.test(tx) && /오류: GPU 장치를 잃음/.test(tx) && /상황: 최적화/.test(tx) && /위치: at x/.test(tx) && /\(2번\)/.test(tx), `복사용 글: ${tx.split('\n')[0]}`);
  for (let k = 0; k < 80; k++) again.report('x', `오류 ${k}`);
  ok(again.list().length === 50 && again.list()[0].msg === '오류 79', '최근 50건만');
  again.clear(); ok(createErrorLog({ storage: s }).list().length === 0, '지우기');
  ok(createErrorLog({ storage: mem({ 'uds.errors': '{깨짐' }) }).list().length === 0 && createErrorLog({ storage: { getItem() { throw new Error('막힘'); }, setItem() { throw new Error('막힘'); } } }).report('x', 'y') !== null, '기록이 깨지거나 저장소가 막혀도 동작');
}
{ // 화면 멈춤
  const w = stallWatch(0);
  ok(w(1000) === 0 && w(2000) === 0 && w(2000 + STALL_MS) === 8, '8초 응답 없음 → 8');
  const h = stallWatch(0); ok(h(60000, true) === 0, '숨긴 탭의 느린 타이머는 멈춤이 아님');
  const z = stallWatch(0); ok(z(3600000) === 0, '절전 복귀는 멈춤이 아님');
}
{ // 비정상 종료
  const J = (o) => JSON.stringify(o);
  const c = lastRunCrashed(J({ t: 1000, clean: false, ctx: '최적화' }), 60000);
  ok(c?.t === 1000 && c.ctx === '최적화', '박동이 끊김 = 비정상 종료 · 하던 일 포함');
  ok(lastRunCrashed(J({ t: 1000, clean: true }), 60000) === null, '정상 종료 아님 없음');
  ok(lastRunCrashed(J({ t: 59000, clean: false }), 60000) === null, '다른 탭이 살아 있음(박동 새로움) = 종료 아님');
  ok(lastRunCrashed(null, 60000) === null && lastRunCrashed('{깨짐', 60000) === null, '기록 없음·깨짐 = 없음');
}
console.log(fail ? `${fail} FAIL` : 'all PASS'); if (fail) process.exit(1);
