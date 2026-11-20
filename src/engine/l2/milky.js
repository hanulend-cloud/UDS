// Milky 눈금 — spec 2026-10-07 §4 (기준두께 차폐율). 소재 고유값(두께 무관), 정본 저장값은 μs'.
// Milky = 20 × (1 − T_s(μs') / T_s(0)), 상한 10,  T_s = 기준 슬래브(2mm, 확산 입사) 전광선투과율.
// 2026-11-20 눈금 A(사용자 결정): 실제 확산판이 낮은 쪽에 몰려 2배로 넓힘 — Milky 5 = 25% 가림, 10 = 50% 가림(최대).
// 50% 보다 더 가리는 소재는 10 으로 표시(나타낼 수 없음). 저장 ver<14 의 Milky 는 ×2 로 환산(main.migrate).
export const MILKY_REF = { t: 2, n: 1.59, g: 0.9 };
export const MILKY_MAP_VER = 2;
export const MILKY_SCALE = 20;   // 눈금 A — 이전(ver<14) 10

// ref = { table, t, n, g } — 없으면 지금 기준판(주 응답표, 2mm, n 1.59, HG g 0.9 — 실측 DB 소재 경로).
// 일반 Milky 는 presetRef(기본 비드 Mie, spec 2026-11-20 §3.2): 뜻은 같고(2mm 기준판 차폐율) 기준판 계산만 Mie.
export function presetRef(table, key) {
  const c = table.mie?.[key];
  if (!c) throw new Error(`기본 비드 응답표 없음(${key})`);
  return { table: c, t: MILKY_REF.t, n: c.preset.nH, g: c.g };
}

function Tref(table, musR, ref) {
  const tb = ref?.table ?? table, t = ref?.t ?? MILKY_REF.t, g = ref?.g ?? MILKY_REF.g, n = ref?.n ?? MILKY_REF.n;
  const q = tb.query(musR * t, g, n, table.diffuseRow, 0);
  return q.Tb + q.Ts;
}

export function milkyFromMusR(table, musR, ref) {
  if (!(musR > 0)) return 0;
  if (!Number.isFinite(musR)) return 10;
  const m = MILKY_SCALE * (1 - Tref(table, musR, ref) / Tref(table, 0, ref));
  return m < 0 ? 0 : m > 10 ? 10 : m;
}

export function musRFromMilky(table, m, ref) {
  if (!(m > 0)) return 0;
  m = Math.min(m, 10);   // 10 = 50% 가림(유한값) — 그 이상은 나타내지 않음
  let lo = Math.log(1e-6), hi = Math.log(1e8);
  for (let i = 0; i < 90; i++) {
    const mid = 0.5 * (lo + hi);
    if (milkyFromMusR(table, Math.exp(mid), ref) < m) lo = mid; else hi = mid;
  }
  return Math.exp(0.5 * (lo + hi));
}
