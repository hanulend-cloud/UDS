// 화면 전체 밝은/어두운 테마(src/ui/theme.js): node test/ui-theme.mjs
import { readTheme, nextTheme, applyPageTheme, THEME_KEY, themeButton } from '../src/ui/theme.js';
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
{ const d = themeButton('dark'), l = themeButton('light');
  ok(d.icon === '☀' && /밝은 화면/.test(d.title) && d.pressed === 'true', '어두울 때 단추 = ☀ 밝은 화면으로');
  ok(l.icon === '☾' && /어두운 화면/.test(l.title) && l.pressed === 'false', '밝을 때 단추 = ☾ 어두운 화면으로'); }
{ // 3D 화면이 아직 없을 때(시작·파일 불러오는 중·새 프로젝트)도 작업 화면 패널이 같은 테마(2026-11-13 사용자: 불러올 때 어두운 테마가 무너짐)
  const wrap = { dataset: {} }, vp = { dataset: {} }, el = { dataset: {}, style: {} };
  const doc = { documentElement: el, querySelector: (q) => (q === '#mech3d-wrap' ? wrap : q === '#mech3d-canvas' ? { parentElement: vp } : null) };
  applyPageTheme(doc, 'dark'); ok(wrap.dataset.theme === 'dark' && vp.dataset.theme === 'dark', '작업 화면·3D 칸도 어둡게(3D 보기 만들기 전에도)');
  applyPageTheme(doc, 'light'); ok(wrap.dataset.theme === 'light' && vp.dataset.theme === 'light', '밝게로 바꾸면 같이 밝게'); }
done();
