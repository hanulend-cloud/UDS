// 화면 전체 밝은/어두운 테마(src/ui/theme.js): node test/ui-theme.mjs
import { readTheme, nextTheme, applyPageTheme, THEME_KEY } from '../src/ui/theme.js';
import { ok, done } from './mech3d-util.mjs';

const mem = (o = {}) => ({ getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); } });
ok(THEME_KEY === 'uds.m3.theme', '저장 키는 예전 3D 배경 설정 그대로');
ok(readTheme(mem({ 'uds.m3.theme': 'dark' })) === 'dark', '저장된 어둡게 읽기');
ok(readTheme(mem({ 'uds.m3.theme': 'weird' })) === 'light' && readTheme(mem()) === 'light', '모르는 값·없음 → 밝게');
ok(readTheme({ getItem() { throw new Error('blocked'); } }) === 'light' && readTheme(null) === 'light', '저장소 막힘 → 밝게');
ok(nextTheme('dark') === 'light' && nextTheme('light') === 'dark' && nextTheme(undefined) === 'dark', '다음 테마');
{ const el = { dataset: {}, style: {} }; applyPageTheme({ documentElement: el }, 'dark');
  ok(el.dataset.theme === 'dark' && el.style.colorScheme === 'dark', '<html> 에 data-theme·color-scheme');
  applyPageTheme({ documentElement: el }, 'x'); ok(el.dataset.theme === 'light', '모르는 값 → 밝게'); }
done();
