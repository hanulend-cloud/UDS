// 새로 시작인지 판별(2026-11-05) — 프로그램을 새로 열면(새 탭·창) 브라우저에 남은 프로젝트를 불러오지 않음. 새로고침만 이어서.
// sessionStorage 는 새로고침에는 남고 탭을 닫으면 사라짐. 쓸 수 없는 환경은 이동 종류(reload)로 판단. 소재 DB·보기 설정은 대상이 아님
const KEY = 'uds.session.alive';
export function isFreshStart(session, navType) {
  let alive = false;
  try { alive = session.getItem(KEY) === '1'; session.setItem(KEY, '1'); } catch { /* 쓸 수 없음 */ }
  return !alive && navType !== 'reload';
}
// 탭을 닫을 때 경고할지 — 프로젝트가 있는데 파일에 실시간 저장되고 있지 않으면 닫는 순간 사라짐
export const shouldWarnClose = (hasProject, fileState) => !!hasProject && !(fileState?.hasFile && fileState.perm === 'granted' && !fileState.err && !fileState.saving);
