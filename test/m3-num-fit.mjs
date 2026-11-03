// 속성 창 숫자 칸 크기(순수): node test/m3-num-fit.mjs
import { numInputCh } from '../src/ui/m3/num-fit.js';
import { ok, done } from './mech3d-util.mjs';

ok(numInputCh({ value: '85', min: '0', max: '100', step: '1' }) === 4, '% = 작은 칸');
ok(numInputCh({ value: '1.55', min: '0', max: '10', step: '0.1' }) === 4, 'Milky 1.55 = 작은 칸');
ok(numInputCh({ value: '200.00', step: '0.1' }) === 6, `좌표 200.00 = 잘리지 않는 칸 (${numInputCh({ value: '200.00', step: '0.1' })})`);
ok(numInputCh({ value: '-200.00', step: '0.1' }) === 8, '음수까지 8');
ok(numInputCh({ value: '1.585', max: '2.5', step: '0.001' }) === 6, '굴절률 소수 셋째 자리까지');
ok(numInputCh({ value: '1', max: '100', min: '-100', step: '0.5' }) === 6, '입력 범위(−100.5)에 맞춤');
ok(numInputCh({ value: '', placeholder: '자동', step: '1' }) === 4 && numInputCh({ value: '', placeholder: '3.2 자동', step: '0.1' }) === 8, '빈칸은 안내 글 길이(한글 = 2칸)');
ok(numInputCh({ value: '123456789012' }) === 10, '아주 길어도 상한');
ok(numInputCh({}) === 4, '값 없음 = 최소');
done();
