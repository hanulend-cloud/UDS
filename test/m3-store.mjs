// CAD UI 상태 저장소: node test/m3-store.mjs
import { createStore, TAGS, PHYSICS, GEOM_CHECK } from '../src/ui/m3/store.js';
import { fakeTimers } from './m3-timers.mjs';
import { ok, done } from './mech3d-util.mjs';

const T = fakeTimers();
let saved = 0;
const st = createStore({ a: 1 }, { persist: () => saved++, delay: 300, timers: T });
const seen = [], un = st.subscribe((t) => seen.push(t));
ok(st.session.node === null && st.session.pick === null && st.session.view === 'iso' && st.session.section === null && st.session.calc === null, '세션 초기값');
st.update('material', (m, s) => { m.a = 2; s.status = 'x'; });
st.update('target');
ok(st.mspec.a === 2 && st.session.status === 'x' && seen.join() === 'material,target' && saved === 0, '갱신 함수 적용 → 태그 순서대로 알림, 저장은 아직');
await T.advance(299); ok(saved === 0, '299ms: 저장 전(디바운스)');
await T.advance(1); ok(saved === 1, '300ms: 두 변경을 한 번에 저장');
st.update('view'); st.update('session'); await T.advance(1000);
ok(saved === 1, 'view·session 은 저장하지 않음');
st.update('observe'); st.flush(); ok(saved === 2, 'flush → 즉시 저장');
await T.advance(1000); ok(saved === 2, 'flush 뒤 예약 저장 취소');
let thrown = false; try { st.update('nope'); } catch (e) { thrown = /알 수 없는 변경 태그/.test(e.message); }
ok(thrown, '모르는 태그 → 오류');
un(); st.update('light'); ok(seen.length === 5, `구독 해제 뒤 알림 없음 (${seen.join()})`);
ok(TAGS.length === 8 && !PHYSICS.has('meta') && ['material', 'light', 'observe', 'contacts'].every((t) => PHYSICS.has(t)) && !PHYSICS.has('target') && !PHYSICS.has('view') && !PHYSICS.has('session'), '물리 태그 = material·light·observe·contacts');
ok(['material', 'light', 'observe', 'target'].every((t) => GEOM_CHECK.has(t)) && !GEOM_CHECK.has('contacts'), '기하 점검 태그 = material·light·observe·target(기준값)');
st.dispose(); await T.advance(1000); ok(saved === 3, 'dispose → 남은 저장 실행(light 변경)');
{   // 견고성: 구독자 격리 · 저장 오류 · dispose 뒤 갱신
  const T2 = fakeTimers(), errs = [], cerr = console.error;
  console.error = (...a) => errs.push(a);
  let n2 = 0, got = 0, tries = 0;
  const st2 = createStore({}, { persist: () => { tries++; throw new Error('디스크 가득'); }, delay: 300, timers: T2 });
  st2.subscribe(() => { throw new Error('구독자 오류'); });
  st2.subscribe(() => got++);
  let threw = false; try { st2.update('material'); } catch { threw = true; }
  ok(!threw && got === 1 && errs.length === 1, '구독자 하나가 던져도 update 는 던지지 않고 다른 구독자에게 알림');
  let rej = false; try { await T2.advance(300); } catch { rej = true; }
  ok(!rej && tries === 1 && errs.length === 2, '예약 저장이 던져도 예외가 새지 않음(console.error)');
  st2.update('light'); let fl = false; try { st2.flush(); } catch { fl = true; }
  ok(!fl && tries === 2, 'flush 저장 오류도 삼킴');
  st2.update('light'); let dz = false; try { st2.dispose(); } catch { dz = true; }
  ok(!dz && tries === 3, 'dispose 저장 오류도 삼킴');
  st2.subscribe(() => n2++); st2.update('light'); await T2.advance(1000);
  ok(tries === 3 && n2 === 0, 'dispose 뒤 update → 저장 예약·알림 없음');
  console.error = cerr;
}
{ // 3D 숨김 저장(2026-11-05): 새로고침해도 유지 — 프로젝트와 같이 저장, 아무것도 안 숨기면 저장 칸 없음
  const T3 = fakeTimers(); let n3 = 0;
  const M = { parts: [{}, {}, {}], light: {} }, a = createStore(M, { persist: () => n3++, delay: 300, timers: T3 });
  ok(M.viewState === undefined && a.session.hidden.length === 0, '처음 = 숨김 없음 · 저장 칸 없음');
  a.update('view', (_, x) => { x.hidden = [1]; x.hideLeds = true; x.hiddenLeds = [2]; }); await T3.advance(400);
  ok(JSON.stringify(M.viewState) === '{"hidden":[1],"hideLeds":true,"hiddenLeds":[2],"hidePcb":false}' && n3 === 1, '숨기면 저장');
  const b = createStore(JSON.parse(JSON.stringify(M)), { persist() {}, delay: 300, timers: T3 });
  { const M4 = { parts: [{}], light: {} }, d = createStore(M4, { persist() {}, delay: 300, timers: T3 }); d.update('view', (_, x) => { x.hidePcb = true; }); ok(M4.viewState?.hidePcb === true && createStore(JSON.parse(JSON.stringify(M4)), { persist() {}, delay: 300, timers: T3 }).session.hidePcb === true, 'PCB 숨김도 저장·복원'); d.dispose(); }
  ok(b.session.hidden.join() === '1' && b.session.hideLeds === true && b.session.hiddenLeds.join() === '2', '다시 열면 복원');
  const c2 = createStore({ parts: [{}, {}], viewState: { hidden: [1, 5, 'x', -1], hideLeds: 'no', hiddenLeds: [0, 1.5] } }, { persist() {}, delay: 300, timers: T3 });
  ok(c2.session.hidden.join() === '1' && c2.session.hideLeds === false && c2.session.hiddenLeds.join() === '0', '잘못된 저장값은 거름(없는 부품·숫자 아님)');
  a.update('session', (_, x) => { x.hideLeds = false; }); await T3.advance(400);
  ok(M.viewState.hideLeds === false && n3 === 2, 'LED 재지정 등 다른 경로로 바뀌어도 저장');
  a.update('view', (_, x) => { x.hidden = []; x.hiddenLeds = []; }); await T3.advance(400);
  ok(M.viewState === undefined && n3 === 3, '모두 보이면 저장 칸 지움');
  a.update('session'); await T3.advance(400);
  ok(n3 === 3, '보기가 안 바뀌면 저장 안 함');
  delete M.viewState; a.update('view', (_, x) => { x.hidden = [0]; }); delete M.viewState; a.update('session');
  ok(M.viewState?.hidden.join() === '0', '되돌리기로 칸이 지워져도 다시 맞춤');
  a.dispose();
}
done();
