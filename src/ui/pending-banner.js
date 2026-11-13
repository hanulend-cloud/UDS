// 보관된 3D 설정 안내 띠(순수, 2026-11-13) — .uds 안의 STEP 을 읽는 동안에는 '찾을 수 없음' 대신 '읽는 중'(단추 숨김)
// P = spec.mech3dPending, reading = { name, size } | null
export function pendingBanner(P, reading) {
  if (!P) return { hidden: true, reading: false, text: '' };
  if (reading) return { hidden: false, reading: true, text: `⏳ 프로젝트 파일 안의 기구 STEP 읽는 중: ${reading.name} (${(reading.size / 1e6).toFixed(1)} MB) — 끝나면 저장된 3D 설정을 복원합니다` };
  return { hidden: false, reading: false, text: '⚠ 3D 기구 형상 데이터를 찾을 수 없음(브라우저 저장소가 비워짐)' };
}
