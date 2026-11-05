// STEP 불러오기 진행 계획(순수) — 단계별 진행률 구간 · OpenCASCADE 안에서 멈춰 있는 단계의 추정 시간 · 끝난 뒤 단계별 시간 문구.
// read·transfer 는 WASM 호출 하나라 진행을 알 수 없음 → 파일 크기로 어림한 시간으로 표시(화면에 '약'). 나머지는 실제 진행.
const BANDS = { oc: [0, 3], read: [3, 12], transfer: [12, 38], preview: [38, 48], mesh: [48, 88], prep: [88, 100] };
export const LOAD_LABEL = { oc: 'OpenCASCADE 로드', read: 'STEP 구문 해석', transfer: 'STEP 형상 변환', preview: '저해상도 미리보기 생성', mesh: '부품 메시 생성', prep: '충돌 검사 구조·접촉면 계산' };
export function loadPct(key, frac = 0) {
  const b = BANDS[key] ?? [0, 0], f = Math.max(0, Math.min(1, frac));
  return b[0] + (b[1] - b[0]) * f;
}
// 벤치(복제 시험 파일 27 MB: 구문 9 s · 변환 27 s) 기준 어림 — 실제는 도면 구조에 따라 다름
const SEC_PER_MB = { read: 0.35, transfer: 1.1 };
export const stageEstimateSec = (key, bytes) => Math.max(1, (SEC_PER_MB[key] ?? 0) * (bytes / 1e6));
const fmt = (ms) => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`; };
// tm = { oc, read, transfer, preview, mesh, prep } ms — 큰 도면에서 어디가 오래 걸리는지 사용자가 볼 수 있게
export function stepTimingText(tm) {
  const names = { oc: '로드', read: '해석', transfer: '형상 변환', preview: '미리보기', mesh: '메시', prep: '계산 준비' };
  return Object.entries(names).filter(([k]) => tm?.[k] != null).map(([k, n]) => `${n} ${fmt(tm[k])}`).join(' · ');
}
