// 빠른 검토(2026-11-15): 후보는 시간 한도로 짧게 재고 오차로 '목표 달성 가능성' 을 냄 — 최종안만 정밀 재계산. node test/mech3d-quick-review.mjs
import { debiasU, tallyStats, passChance, chanceGrade, CHANCE_LIKELY, CHANCE_MAYBE, fmtChance } from '../src/engine/mech3d/tally.js';
import { runAutoDesign, quickMargin } from '../src/engine/mech3d/autodesign.js';
import { histFromRun } from '../src/ui/m3/autodesign-panel.js';
import { histTableHtml } from '../src/ui/m3/opt-dash.js';
import { ok, done } from './mech3d-util.mjs';

const obs = { targetLen: 0.8, targetWid: 0.6 };
const near = (a, b, e = 0.005) => Math.abs(a - b) < e;
{ // 가능성 = 방향별 Φ((값 − 목표) ÷ 오차) 중 낮은 쪽
  ok(near(passChance({ Ulen: 0.8, seLen: 0.03, Uwid: 0.9, seWid: 0.01 }, obs), 0.5), '목표와 같은 값 = 50%');
  ok(near(passChance({ Ulen: 0.83, seLen: 0.03, Uwid: 0.9, seWid: 0.01 }, obs), 0.841), '오차 1배 위 = 84%');
  ok(near(passChance({ Ulen: 0.9, seLen: 0.01, Uwid: 0.57, seWid: 0.03 }, obs), 0.159), '폭이 낮으면 폭으로(16%)');
  ok(passChance({ Ulen: 0.81, seLen: null, Uwid: null, seWid: null }, obs) === 1 && passChance({ Ulen: 0.79, seLen: null, Uwid: null }, obs) === 0, '오차를 모르면 통과 1 · 미달 0');
  ok(passChance({ empty: true, Ulen: 0 }, obs) === 0, '빈 결과 = 0');
  ok(CHANCE_LIKELY === 0.75 && CHANCE_MAYBE === 0.3, '기준 75% / 30%');
  ok(chanceGrade(0.75) === 'likely' && chanceGrade(0.74) === 'maybe' && chanceGrade(0.3) === 'maybe' && chanceGrade(0.29) === 'out', '유력 · 가능성 있음 · 제외');
  ok(fmtChance(0.752) === '75%' && fmtChance(0.999) === '99%' && fmtChance(0.004) === '0%', `가능성 표시(내림): ${fmtChance(0.752)}`);
}
{ // 빠른 검토 값은 가능성 30% 이상이면 통과 후보로 남김(정밀 값은 그대로)
  const q = (U, se) => ({ Ulen: U, seLen: se, Uwid: 0.9, seWid: 0.01, quick: true });
  ok(quickMargin(q(0.79, 0.03), obs) >= 0, '빠른 값 79.0% ±3%p(가능성 37%) = 후보로 남김');
  ok(quickMargin(q(0.78, 0.03), obs) < 0, '빠른 값 78.0% ±3%p(가능성 25%) = 미달');
  ok(near(quickMargin({ Ulen: 0.79, seLen: 0.03, Uwid: 0.9, seWid: 0.01 }, obs), -0.01, 1e-9), '정밀 값은 여유 없음');
}
{ // 현재안·후보 = 빠른 검토, 최종안과 현재안만 정밀 재계산(값에 quick 이 남지 않음)
  const rowsOf = (ms) => ms.map((m) => ({ milky: m, Ulen: 0.5 + 0.12 * m, Uwid: 0.9, eff: 1, ess: 1, trusted: true, margin: Math.min(0.5 + 0.12 * m - 0.8, 0.3) }));
  const calls = [];
  const io = { milkyRows: async (d, ms) => rowsOf(ms), progress() {}, cancelled: () => false,
    verify: async (d, o = {}) => { calls.push([d.milky, !!o.quick]); const U = d.milky === 3 ? 0.7 : 0.84; return o.quick ? { stats: { Ulen: U - 0.03, Uwid: 0.9, seLen: 0.03, seWid: 0.01, empty: false, quick: true }, eff: 1, quick: true } : { stats: { Ulen: U, Uwid: 0.9, empty: false }, eff: 1 }; } };
  const r = await runAutoDesign({ stages: { milky: true }, obs, current: { milky: 3, count: 5, pitch: 0, shape: null }, milkyMax: 5 }, io);
  const q = calls.filter((c) => c[1]), p = calls.filter((c) => !c[1]);
  ok(calls[0][0] === 3 && calls[0][1], '현재 설계 = 빠른 검토로 먼저');
  ok(q.length === 1 && p.length === 2 && p.some((c) => c[0] === r.best.milky) && p.some((c) => c[0] === 3), `빠른 검토 ${q.length}회 · 정밀 ${p.length}회(최종안·현재안)`);
  ok(!r.verified.stats.quick && !r.current.stats.quick && r.verified.stats.Ulen === 0.84, '결과 값 = 정밀 재계산 값');
}
{ // 지난 후보: 빠른 검토 값에는 가능성·오차를 붙이고 30% 미만은 뺌
  const v = (U, se, quick) => ({ stats: { Ulen: U, Uwid: 0.9, seLen: se, seWid: 0.01, empty: false, ...(quick ? { quick: true } : {}) }, eff: 0.5, ...(quick ? { chance: passChance({ Ulen: U, seLen: se, Uwid: 0.9, seWid: 0.01 }, obs) } : {}) });
  const res = { best: { count: 6 }, verified: v(0.82, 0.004, false), steps: [{ stage: 'ledsVerify', tried: [{ design: { count: 6 }, verified: v(0.82, 0.004, false) }, { design: { count: 5 }, verified: v(0.83, 0.03, true) }, { design: { count: 4 }, verified: v(0.79, 0.03, true) }, { design: { count: 3 }, verified: v(0.7, 0.03, true) }] }] };
  const H = histFromRun(res, {}, 1, (d) => `LED ${d.count}`);
  ok(H.map((e) => e.leds).join() === '6,5,4', `가능성 30% 미만 후보는 뺌: ${H.map((e) => e.leds).join()}`);
  ok(H[0].quick !== true && H[0].chance == null && H[1].quick === true && near(H[1].chance, 0.841) && H[1].se === 0.03 && H[2].quick === true, '빠른 검토 후보 = quick · chance · se');
}
{ // 지난 후보 표: 빠른 검토 값 = ≈값 ±오차 · 가능성(유력/가능성 있음) · '빠른 검토 값' 표시. 정밀 값은 그대로
  const h = histTableHtml([{ label: 'A', Ulen: 0.82, Uwid: 0.9, eff: 0.5, kind: 'final' }, { label: 'B', Ulen: 0.832, Uwid: 0.9, eff: 0.5, kind: 'alt', quick: true, chance: 0.841, se: 0.031 }, { label: 'C', Ulen: 0.79, Uwid: 0.9, eff: 0.5, kind: 'alt', quick: true, chance: 0.37, se: 0.03 }], 0.8, 0.6, false);
  ok(/유력 84%/.test(h) && /가능성 있음 37%/.test(h), '가능성 표시(유력 · 가능성 있음)');
  ok(/≈83.2%/.test(h) && /±3.1%p/.test(h) && /빠른 검토 값/.test(h), '빠른 검토 값 = ≈ · ±오차');
  ok(!/≈82.0%/.test(h) && (h.match(/빠른 검토 값/g) ?? []).length >= 2, '정밀 값에는 표시 없음');
}
{ // 노이즈 보정 추정(2026-11-15 실측: 같은 설계가 10초 값 33.7% · 정밀 62.3% — 최저÷최고는 노이즈만큼 낮게 나옴)
  let sd = 12345; const rnd = () => { sd = (sd + 0x6D2B79F5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }, gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const n = 400, ripple = Array.from({ length: n }, (_, i) => 0.9 + 0.1 * Math.sin((2 * Math.PI * i) / 6.2));   // LED 간격 리플 — 참값 80%
  const mk = (truth, rel) => Array.from({ length: 10 }, () => truth.map((v) => v * (1 + rel * gauss())));
  const rawOf = (V) => { const m = V[0].map((_, i) => V.reduce((x, v) => x + v[i], 0) / V.length); return Math.min(...m) / Math.max(...m); };
  const pc = (x) => (x * 100).toFixed(1);
  const V = mk(ripple, 0.3), e = debiasU(V), raw = rawOf(V);
  ok(raw < 0.6 && Math.abs(e.U - 0.8) < 0.1 && e.se > 0.01 && e.se < 0.12, `리플 + 노이즈: 그대로 ${pc(raw)}% → 보정 ${pc(e.U)}% ±${pc(e.se)}%p (참값 80%)`);
  const c = debiasU(Array.from({ length: 10 }, () => ripple.slice()));
  ok(Math.abs(c.U - 0.8) < 0.005 && c.se < 1e-6, `노이즈 없음 = 그대로(${pc(c.U)}%) · 오차 0`);
  const flat = mk(ripple.map(() => 1), 0.3), fe = debiasU(flat);
  ok(rawOf(flat) < 0.7 && fe.U > 0.95, `고른 면 + 노이즈: 그대로 ${pc(rawOf(flat))}% → 보정 ${pc(fe.U)}%`);
  const edge = mk(ripple.map((_, i) => (i < 20 ? 0.6 + 0.02 * i : 1)), 0.3), ee = debiasU(edge);   // 끝 어두움(참값 60%) — 주기 성분이 아니어도 놓치지 않음
  ok(ee.U < 0.75, `끝 어두움: 보정 ${pc(ee.U)}% ±${pc(ee.se)}%p (참값 60%) — 통과로 보지 않음`);
  const z = debiasU(mk(ripple, 3));
  ok(z.se > 0.15, `노이즈에 묻힌 값은 오차가 큼(±${pc(z.se)}%p) — 유력으로 안 나옴`);
  ok(debiasU(V.slice(0, 2)) === null, '묶음 3개 미만 = 추정 안 함');
  // tallyStats 는 요청할 때만 보정 추정(est)을 함께 냄 — 판정 값(Ulen·Uwid)은 그대로
  const G = { ns: n, nw: 1, ds: 1, cell: 1, w0: -0.5, L: n, closed: true, winS: 5, area: new Float64Array(n).fill(1), valid: new Uint8Array(n).fill(1) };
  const acc = V.map((v) => Float64Array.from(v)), o = { targetLen: 0.8, targetWid: 0.6 };
  const st = tallyStats(G, acc, o, null, { est: true });
  ok(Math.abs(st.Ulen - raw) < 1e-9 && Math.abs(st.est.Ulen - e.U) < 1e-9 && st.est.seLen === e.se && st.est.Uwid == null && tallyStats(G, acc, o).est === null, '통계에 est(보정값·오차) — 판정 값은 그대로 · 요청 없으면 없음');
}
{ // 폭 추정 = 모든 창을 합친 폭 단면(창 하나는 광자가 적어 0% 로 나왔음)
  let sd = 99; const rnd = () => { sd = (sd + 0x6D2B79F5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }, gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const ns = 200, nw = 10, G = { ns, nw, ds: 1, cell: 1, w0: -5, L: ns, closed: true, winS: 5, area: new Float64Array(ns * nw).fill(1), valid: new Uint8Array(ns * nw).fill(1) };
  const wprof = (j) => 0.5 + 0.5 * Math.sin((Math.PI * (j + 0.5)) / nw);   // 폭 가장자리 어두움 — 참값 약 57.8 ÷ 99.4 = 58%
  const acc = Array.from({ length: 10 }, () => Float64Array.from({ length: ns * nw }, (_, k) => wprof(k % nw) * (1 + 1.5 * gauss())));
  const st = tallyStats(G, acc, { targetLen: 0.8, targetWid: 0.8 }, null, { est: true }), truth = wprof(0) / wprof(4);
  ok(st.Uwid < 0.3 && Math.abs(st.est.Uwid - truth) < 0.12, `폭: 그대로 ${(st.Uwid * 100).toFixed(1)}% → 보정 ${(st.est.Uwid * 100).toFixed(1)}% ±${(st.est.seWid * 100).toFixed(1)}%p (참값 ${(truth * 100).toFixed(1)}%)`);
}
done();
