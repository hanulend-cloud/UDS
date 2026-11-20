// 확산 모델 창의 계산(DOM 없음) — spec 2026-11-20 §4(2단계 a). 대응표 · 각분포 곡선 · 신뢰 표시
import { MIE_PRESETS, presetOptics, presetMaterial } from '../engine/l2/mie-preset.js';
import { hpaDeg } from '../engine/l2/slab-table.js';
import { angEdgeDeg, N_ANG } from '../engine/l2/mc-slab.js';

export const MAP_MILKY = [0, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const MAP_T = 2;   // 대응표의 판 두께(mm) — Milky 정의와 같은 2 mm

const q2 = (table, key, a, t) => table.mie[key].query(a.musR * t, a.g, MIE_PRESETS[key].nH, 0, a.mua * t);

export function presetSummary(key) {
  const p = MIE_PRESETS[key], o = presetOptics(key);
  return { key, host: p.host, nH: p.nH, bead: p.bead, nP: p.nP, d_um: p.d_um, sigma: p.sigma, lambda_um: p.lambda_um, g: o.g };
}

// 행: { milky, shield(가림 비율), wt(질량 분율), phi, musR, mus, g, mua, T(2 mm 전투과), hpa(°), clear }
export function milkyMapRows(table, key, milkies = MAP_MILKY) {
  return milkies.map((m) => {
    const a = presetMaterial(table, m, key), q = q2(table, key, a, MAP_T);
    return { milky: a.milky, shield: a.milky / 20, wt: a.wt, phi: a.phi, musR: a.musR, mus: a.mus, g: a.g, mua: a.mua, T: q.Tb + q.Ts, hpa: hpaDeg(q), clear: !!a.clear };
  });
}

// 단일 입자 위상함수(크기 분포 평균) — { deg, rel(정면 = 1) }. 로그 축 그래프용, 약 pts 점으로 솎음
export function phaseCurve(key, pts = 120) {
  const { theta, p } = presetOptics(key).phase, K = theta.length, step = Math.max(1, Math.floor(K / pts)), out = [];
  for (let i = 0; i < K; i += step) out.push({ deg: theta[i] * 180 / Math.PI, rel: p[i] / p[0] });
  if (out.at(-1).deg < theta[K - 1] * 180 / Math.PI) out.push({ deg: theta[K - 1] * 180 / Math.PI, rel: p[K - 1] / p[0] });
  return out;
}

// 판(t mm)을 지난 산란광의 각도별 광도(/sr, 정면 = 1) — 응답표 ang(각 구간 파워 분율) ÷ 입체각.
// 0~5° 는 입체각이 작아 노이즈가 커서 한 점(2.5°)으로 묶고 그 값을 정면 기준으로 씀(hpaStats 와 같은 묶음)
export const POOL_DEG = 5;
export function transmitCurve(table, key, milky, t = MAP_T) {
  const a = presetMaterial(table, milky, key), q = q2(table, key, a, t), dO = (k) => 2 * Math.PI * (Math.cos(angEdgeDeg(k) * Math.PI / 180) - Math.cos(angEdgeDeg(k + 1) * Math.PI / 180));
  let pP = 0, pO = 0, k = 0;
  for (; angEdgeDeg(k + 1) <= POOL_DEG; k++) { pP += q.ang[k]; pO += dO(k); }
  const out = [{ deg: POOL_DEG / 2, I: pP / pO }];
  for (; k < N_ANG; k++) out.push({ deg: 0.5 * (angEdgeDeg(k) + angEdgeDeg(k + 1)), I: q.ang[k] / dO(k) });
  const I0 = out[0].I || 1;
  return out.map((o) => ({ deg: o.deg, rel: o.I / I0 }));
}

// 신뢰 표시(§4·§3.6). 측정 범위 밖(두께가 측정 두께의 0.5~2배 밖)이 가장 우선.
// 입사각 기준은 BSDF 입사각 측정(3단계) 후 — 지금 측정은 모두 법선 입사뿐
export const TRUST = { assumed: '가정', fit: '실측보정', fitBad: '실측보정(오차 큼)', range: '측정 범위 밖' };
export function trustLabel({ ent, thick = null }) {
  const ts = (ent?.samples ?? []).map((s) => s.t).filter((t) => t > 0);
  if (!ent || !ts.length) return { code: 'assumed', label: TRUST.assumed, why: ent ? '측정값 없음 — 기본 비드로 계산' : '소재 이름 없음 — 기본 비드로 계산' };
  const tMin = Math.min(...ts), tMax = Math.max(...ts), lo = 0.5 * tMin, hi = 2 * tMax;
  if (thick != null && (thick < lo || thick > hi)) return { code: 'range', label: TRUST.range, why: `부품 ${thick.toFixed(1)} mm · 측정 ${tMin}~${tMax} mm (허용 ${lo}~${hi} mm)` };
  const v6 = ent.validation?.V6, src = ent.status === 'datasheet' ? ' · 제조사 자료값' : '';
  if (v6 && !v6.ok) return { code: 'fitBad', label: TRUST.fitBad + src, why: v6.note ?? '' };
  return { code: 'fit', label: TRUST.fit + src, why: v6?.note ?? '' };
}
// 프로젝트의 Milky 부품마다 { i, name, milky, material(이름), code, label, why }
export function trustRows({ parts, thickOf, dbGet }) {
  const out = [];
  parts.forEach((p, i) => {
    const m = p.material;
    if (m?.kind !== 'milky') return;
    const ent = m.dbId ? dbGet(m.dbId) ?? null : null;
    out.push({ i, name: p.name, milky: m.milky, material: ent?.name ?? 'Milky (이름 없음)', ...trustLabel({ ent, thick: thickOf(i) }) });
  });
  return out;
}
