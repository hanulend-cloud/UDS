// 화면 전체 밝은/어두운 테마 — 보는 사람별 편의 설정(예전 '3D 배경 어둡게'와 같은 저장 키)
export const THEME_KEY = 'uds.m3.theme';
const norm = (t) => (t === 'dark' ? 'dark' : 'light');
export function readTheme(store) { try { return norm(store?.getItem(THEME_KEY)); } catch { return 'light'; } }
export const nextTheme = (t) => (t === 'dark' ? 'light' : 'dark');
// 작업 화면(#mech3d-wrap)·3D 칸도 같이 — 전에는 3D 보기를 만들 때만 붙어서, 시작·파일 불러오는 동안 패널이 밝게 보였음(2026-11-13)
export function applyPageTheme(doc, t) {
  const el = doc?.documentElement; if (!el) return; t = norm(t); el.dataset.theme = t; el.style.colorScheme = t;
  for (const n of [doc.querySelector?.('#mech3d-wrap'), doc.querySelector?.('#mech3d-canvas')?.parentElement]) if (n) n.dataset.theme = t;
}
// 상단 바 ☀/☾ 단추 — 누르면 바뀔 쪽을 알려 줌
export const themeButton = (t) => (t === 'dark'
  ? { icon: '☀', title: '밝은 화면으로 바꾸기(3D 배경 포함)', pressed: 'true' }
  : { icon: '☾', title: '어두운 화면으로 바꾸기(3D 배경 포함)', pressed: 'false' });
