// LED 선택·속성(spec 2026-10-15 m3-cad-ui §4a) 순수 도우미 — 배광 프리셋, 3D 클릭 → LED 번호, 간섭 항목, 개별 조정 쓰기·무효 정리.
// LED 번호: 직접 배치 = 발광점 순서, LED STEP(원래·가상) = lay.leds 안 위치(= 발광점 e.led, 제외해도 번호 유지).
import { layoutKeyOf, staleAdjust, validAdjust } from '../../engine/mech3d/led-adjust.js';

export const BEAM_PRESETS = [[120, '넓게'], [90, '보통'], [60, '좁게']];
// 배광 → 프리셋 120 | 90 | 60 | 'custom'. 램버시안 = 늘 120(반치폭 120°)
export function beamPreset(spec) {
  if (spec?.model !== 'gaussian') return 120;
  return spec.beam === 90 || spec.beam === 60 ? spec.beam : 'custom';
}
// 각도(°, 반치폭) → { model, beam } — 120 = 램버시안, 그 밖 = 가우시안. 10~180 으로 자름(180 = 반구 끝까지 반치, 2026-11-08), 숫자 아님 = null
export function beamSpec(angle) {
  const a = Number(angle);
  if (!Number.isFinite(a)) return null;
  const b = Math.min(180, Math.max(10, Math.round(a * 10) / 10));
  return b === 120 ? { model: 'lambertian', beam: 120 } : { model: 'gaussian', beam: b };
}
// 3D 클릭 → LED 번호 | null. hit = { led }(원뿔) | { part }(합친 장면 번호, nMech 이상 = LED STEP 부품), lay = stepLayout 결과
export function ledOfHit(hit, nMech, lay) {
  if (!hit) return null;
  if (Number.isInteger(hit.led) && hit.led >= 0) return hit.led;
  if (hit.part == null || hit.part < nMech || !lay) return null;
  const k = lay.leds.indexOf(hit.part - nMech);
  return k >= 0 ? k : null;
}
// 3D 클릭에서 빛 원뿔이 이기는가(순수, 2026-11-13) — 더 가까우면 원뿔(LED). 단 맞은 부품이 PCB 면 PCB(원뿔이 PCB 를 덮어 PCB 를 고를 수 없었음)
// pp = { part, t } | null, cone = { distance } | null, isPcb(i)
export const coneWins = (pp, cone, isPcb = () => false) => !!cone && (!pp || (cone.distance <= pp.t && !isPcb(pp.part)));
// LED STEP 안 PCB 를 클릭 = PCB 메뉴('pcbs')(순수) — 기구 부품·LED 면 null
export const pcbNodeOfHit = (hit, nMech, lay) => (hit?.part != null && hit.part >= nMech && lay && lay.pcb >= 0 && hit.part - nMech === lay.pcb ? 'pcbs' : null);
// 간섭 점검 ① 항목 중 LED 번호 n 의 것 — 발광점 항목 led = 발광점 배열 위치(→ e.led ?? 위치), 몸체 항목(overlap·body-inside) led = 배치 부품 번호(→ lay.leds 위치)
export function ledClashItems(items, n, emitters, lay) {
  return (items ?? []).filter((it) => {
    if (it.kind === 'overlap' || it.kind === 'body-inside') return !!lay && lay.leds.indexOf(it.led) === n;
    return (emitters?.[it.led]?.led ?? it.led) === n;
  });
}
// 배치가 바뀌어 무효가 된 개별 조정 삭제 → 알림 문구 | ''
export function dropStaleAdjust(light) {
  if (!staleAdjust(light)) return '';
  delete light.ledAdjust;
  return '배치가 바뀌어 개별 LED 조정을 지웠습니다';
}
// 그 LED 의 개별 조정 쓰기 — adj = { ds, dz } | null. 0·null = 항목 삭제, 비면 ledAdjust 삭제. 오래된 조정은 버리고 현재 layoutKey 로
export function setLedAdjust(light, n, adj) {
  const items = { ...(validAdjust(light) ?? {}) };
  const ds = Number(adj?.ds) || 0, dz = Number(adj?.dz) || 0;
  if (ds || dz) items[n] = { ds, dz }; else delete items[n];
  if (Object.keys(items).length) light.ledAdjust = { layoutKey: layoutKeyOf(light), items };
  else delete light.ledAdjust;
  return light;
}
