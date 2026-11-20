// 확산판 기본 비드(수지별) · 델타 절단 — spec 2026-11-20 §3.1·§3.4.
// 일반 Milky 소재는 이 비드의 Mie 로 계산한다(화면에는 Milky 만). 실측 DB 소재는 DB 값(이 파일 무관).
import { polyParticleOptics, phaseFromTable, volumeFractionFromMus, wtFromVolume } from './mie.js';
import { musRFromMilky, presetRef } from './milky.js';
import { l2Material, MUA_RESIN } from './material.js';
import { CLEAR_BASE, clearMua } from '../mech3d/materials.js';

export const MIE_PRESETS = {
  PC:   { key: 'PC',   host: 'PC',   nH: 1.586, rhoH: 1.20, bead: 'PMMA',     nP: 1.49, rhoP: 1.19, d_um: 3, sigma: 0.25, lambda_um: 0.55 },
  PMMA: { key: 'PMMA', host: 'PMMA', nH: 1.49,  rhoH: 1.19, bead: 'silicone', nP: 1.43, rhoP: 1.32, d_um: 2, sigma: 0.25, lambda_um: 0.55 },
};
// 3D 델타 절단 각도(°) — Milky 구간별(2026-11-20 3D 비교, 사용자 결정 ③): 5 이하 10°(지금 속도), 5 초과 5°(탁할수록
// 작은 꺾임이 수백 번 쌓여 10° 는 Mie 효과의 절반을 잃음). 윗면 고리 분포가 절단 없는 Mie 와 노이즈 안에서 같음.
export const THETA_C_BANDS = [{ upTo: 5, deg: 10 }, { upTo: Infinity, deg: 5 }];
export function thetaCFor(milky) { return THETA_C_BANDS.find((b) => (milky ?? 0) <= b.upTo).deg; }
export function presetKeyForResin(resin) { return resin === 'PMMA' ? 'PMMA' : 'PC'; }

const cache = new Map();
export function presetOptics(key) {
  if (!cache.has(key)) { const p = MIE_PRESETS[key]; cache.set(key, polyParticleOptics({ d_um: p.d_um, sigma: p.sigma, nP: p.nP, nH: p.nH, lambda_um: p.lambda_um })); }
  return cache.get(key);
}

// 델타 절단: θ < θc 를 직진으로 보고 뺀다. 남은 위상함수(정규화)의 g* 와 μs 배율 scale = (1−g)/(1−g*) — μs′ = μs(1−g) 보존.
export function truncatePhase(phase, g, thetaCDeg) {
  if (!(thetaCDeg > 0)) return { f: 0, g, scale: 1, phase };
  const tc = thetaCDeg * Math.PI / 180, th = phase.theta;
  let k = 0; while (k < th.length - 1 && th[k + 1] <= tc) k++;
  const ph = phaseFromTable(th.slice(k), phase.p.slice(k));
  return { f: phase.cdf[k], g: ph.gNum, scale: (1 - g) / (1 - ph.gNum), phase: { ...ph, g: ph.gNum } };
}


// 흡수 = 수지 + κ_φ·φ. κ_φ 는 50% 가림(눈금 A Milky 10)에서 HG 흡수와 같도록 프리셋마다 1회 계산(spec §3.2, 평가 ②)
const kPhiCache = new Map();
function kPhi(table, key) {
  if (!kPhiCache.has(key)) {
    const p = MIE_PRESETS[key], opt = presetOptics(key), g = table.mie[key].g;
    const phiC = volumeFractionFromMus(opt, musRFromMilky(table, 10, presetRef(table, key)) / (1 - g));
    kPhiCache.set(key, (l2Material(table, 10, p.nH).mua - MUA_RESIN) / phiC);
  }
  return kPhiCache.get(key);
}

// 일반 Milky → Mie 물성. 반환 { milky, preset, musR, mus, g, mua, muaResin, phi, wt, n }
// Milky 0 = 비드 없음 → 일반 투명 수지(2026-11-21). 0 초과는 0.1 부터(비드가 조금이라도 든 Milky 수지)
export const MILKY_MIN = 0.1;
export const milkyEff = (m) => (m > 0 ? Math.min(Math.max(m, MILKY_MIN), 10) : 0);
// 투명 수지 흡수(수지 기본 DB 의 2 mm 투과율에서) — 목록에 없으면 비드 기준 수지(PC/PMMA)
export function clearResinMua(resin) { const key = presetKeyForResin(resin); return clearMua(CLEAR_BASE.find((e) => e.id === resin) ?? CLEAR_BASE.find((e) => e.id === key)); }
export function presetMaterial(table, milky, resin) {
  const key = presetKeyForResin(resin), p = MIE_PRESETS[key], opt = presetOptics(key), g = table.mie[key].g;
  const m = milkyEff(milky ?? 0);
  if (m === 0) return { milky: 0, preset: key, musR: 0, mus: 0, g, mua: clearResinMua(resin), muaResin: clearResinMua(resin), phi: 0, wt: 0, n: p.nH, clear: true };
  const musR = musRFromMilky(table, m, presetRef(table, key)), mus = musR / (1 - g);
  const phi = volumeFractionFromMus(opt, mus);
  // 바탕 흡수 = 같은 수지의 투명 소재 흡수(2026-11-21) — 비드가 조금이라도 들면 투명보다 투과율이 낮다. 비드 흡수(kPhi)는 그대로
  const base = clearResinMua(resin);
  return { milky: m, preset: key, musR, mus, g, mua: base + kPhi(table, key) * phi, muaResin: base, phi, wt: wtFromVolume(phi, p.rhoP, p.rhoH), n: p.nH };
}
