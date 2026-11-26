// LED 밝기 단위 lm/개 ↔ cd(축상 광도), 2026-11-26 사용자 요청 — 사양서는 광도(cd)인 경우가 많음.
// 광속 = 축상 광도 × 배광의 입체각(∫상대광도 dΩ) — 계산 엔진의 광원(sources.js flux = I0·solid)과 같은 식.
// spec.lumUnit = 'lm' | 'cd' | 'mcd'(새 프로젝트 기본, 2026-11-26). cd·mcd 면 spec.intensityCd(늘 cd 로 저장)가 기준이고 지향각이 바뀌면 fluxLm 을 다시 계산. 0 = 미입력(1 lm 가정, 판정 안 함)
import { _ledModel } from '../shape/mc-body.js';

const pos = (v) => (Number.isFinite(+v) && +v > 0 ? +v : 0);
const r6 = (v) => Math.round(v * 1e6) / 1e6;
export const isIntensity = (u) => u === 'cd' || u === 'mcd';
const UNITS = ['lm', 'cd', 'mcd'];
export const ledSolid = (spec) => _ledModel({ model: spec?.model ?? 'lambertian', beamX: spec?.beam ?? 120 }).solid;
// cd 단위면 광도로 광속을 맞춤(지향각·배광 모델을 바꾼 뒤 부름)
export function syncFlux(spec) {
  if (isIntensity(spec?.lumUnit)) spec.fluxLm = r6(pos(spec.intensityCd) * ledSolid(spec));
  return spec;
}
// 입력 칸 값(지금 단위) 쓰기 · 칸에 보일 값
export const ledBrightValue = (spec) => (spec.lumUnit === 'mcd' ? r6((spec.intensityCd ?? 0) * 1000) : spec.lumUnit === 'cd' ? spec.intensityCd ?? 0 : spec.fluxLm ?? 0);
export function setLedBright(spec, v) {
  if (isIntensity(spec.lumUnit)) { spec.intensityCd = r6(pos(v) / (spec.lumUnit === 'mcd' ? 1000 : 1)); syncFlux(spec); } else spec.fluxLm = pos(v);
  return spec;
}
// 단위 바꾸기 — 광속은 그대로, lm → cd·mcd 로 바꿀 때는 지금 광속에 맞는 cd 를 채움
export function setLedUnit(spec, u) {
  const unit = UNITS.includes(u) ? u : 'lm';
  if (isIntensity(unit) && !isIntensity(spec.lumUnit)) spec.intensityCd = r6(pos(spec.fluxLm) / ledSolid(spec));
  spec.lumUnit = unit;
  return spec;
}
// 저장값 정리 — 예전 저장(단위 없음) = lm
export function normLedBright(spec) {
  spec.lumUnit = UNITS.includes(spec.lumUnit) ? spec.lumUnit : 'lm';
  spec.intensityCd = pos(spec.intensityCd);
  return syncFlux(spec);
}
