// LED 밝기 단위 lm/개 ↔ cd(축상 광도), 2026-11-26 사용자 요청 — 사양서는 광도(cd)인 경우가 많음.
// 광속 = 축상 광도 × 배광의 입체각(∫상대광도 dΩ) — 계산 엔진의 광원(sources.js flux = I0·solid)과 같은 식.
// spec.lumUnit = 'lm'(기본) | 'cd'. 'cd' 면 spec.intensityCd 가 기준이고 지향각이 바뀌면 fluxLm 을 다시 계산. 0 = 미입력(1 lm 가정, 판정 안 함)
import { _ledModel } from '../shape/mc-body.js';

const pos = (v) => (Number.isFinite(+v) && +v > 0 ? +v : 0);
const r6 = (v) => Math.round(v * 1e6) / 1e6;
export const ledSolid = (spec) => _ledModel({ model: spec?.model ?? 'lambertian', beamX: spec?.beam ?? 120 }).solid;
// cd 단위면 광도로 광속을 맞춤(지향각·배광 모델을 바꾼 뒤 부름)
export function syncFlux(spec) {
  if (spec?.lumUnit === 'cd') spec.fluxLm = r6(pos(spec.intensityCd) * ledSolid(spec));
  return spec;
}
// 입력 칸 값(지금 단위) 쓰기
export function setLedBright(spec, v) {
  if (spec.lumUnit === 'cd') { spec.intensityCd = pos(v); syncFlux(spec); } else spec.fluxLm = pos(v);
  return spec;
}
// 단위 바꾸기 — 광속은 그대로, cd 로 바꿀 때는 지금 광속에 맞는 cd 를 채움
export function setLedUnit(spec, u) {
  const unit = u === 'cd' ? 'cd' : 'lm';
  if (unit === 'cd' && spec.lumUnit !== 'cd') spec.intensityCd = r6(pos(spec.fluxLm) / ledSolid(spec));
  spec.lumUnit = unit;
  return spec;
}
// 저장값 정리 — 예전 저장(단위 없음) = lm
export function normLedBright(spec) {
  spec.lumUnit = spec.lumUnit === 'cd' ? 'cd' : 'lm';
  spec.intensityCd = pos(spec.intensityCd);
  return syncFlux(spec);
}
