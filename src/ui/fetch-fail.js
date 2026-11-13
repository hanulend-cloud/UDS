// 파일을 못 받을 때 안내 글(순수, 2026-11-13) — 서버는 켜져 있는데 파일만 없으면(404) '서버 꺼짐' 이라고 하지 않음
// err = { status } (응답은 왔지만 실패) | 그 밖의 오류(연결 실패)
export const NO_SERVER = '프로그램 서버에 연결되지 않습니다 — serve.py 가 꺼져 있을 수 있습니다. 서버를 다시 켠 뒤 새로고침(Ctrl+F5) 하세요.';
export function fetchFailText(err, path) {
  if (err?.status === 404) return `파일이 없습니다: ${path} — 프로그램 폴더에 이 파일이 있는지 확인하세요(서버는 켜져 있음).`;
  if (err?.status) return `파일을 받지 못했습니다(서버 응답 ${err.status}): ${path}`;
  return NO_SERVER;
}
