// 빠른 검토(2026-11-15): 후보는 시간 한도로 짧게 재고 오차로 '목표 달성 가능성' 을 냄 — 최종안만 정밀 재계산. node test/mech3d-quick-review.mjs
import { debiasU, tallyStats, passChance, chanceGrade, quickErr, QUICK_SE, CHANCE_LIKELY, CHANCE_MAYBE, fmtChance } from '../src/engine/mech3d/tally.js';
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
  const h = histTableHtml([{ label: 'A', Ulen: 0.82, Uwid: 0.9, eff: 0.5, kind: 'final' }, { label: 'B', Ulen: 0.832, Uwid: 0.9, eff: 0.5, kind: 'alt', quick: true, chance: 0.841, se: 0.021 }, { label: 'C', Ulen: 0.79, Uwid: 0.9, eff: 0.5, kind: 'alt', quick: true, chance: 0.37, se: 0.02 }], 0.8, 0.6, false);
  ok(/유력 84%/.test(h) && /가능성 있음 37%/.test(h), '가능성 표시(유력 · 가능성 있음)');
  ok(/≈83.2%/.test(h) && /±2.1%p/.test(h) && /빠른 검토 값/.test(h), '빠른 검토 값 = ≈ · ±오차');
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
  // 판정 값(Ulen·Uwid) = 보정값(2026-11-15 사용자: 정밀 판정에도 보정값) — 그대로 값은 rawUlen·rawUwid. 묶음 3개 미만이면 그대로
  const G = { ns: n, nw: 1, ds: 1, cell: 1, w0: -0.5, L: n, closed: true, winS: 5, area: new Float64Array(n).fill(1), valid: new Uint8Array(n).fill(1) };
  const acc = V.map((v) => Float64Array.from(v)), o = { targetLen: 0.8, targetWid: 0.6 };
  const st = tallyStats(G, acc, o), s2 = tallyStats(G, acc.slice(0, 2), o);
  ok(Math.abs(st.rawUlen - raw) < 1e-9 && Math.abs(st.Ulen - e.U) < 1e-9 && st.seLen === e.se && st.Uwid == null && st.passLen === (st.Ulen >= 0.8), '판정 값 = 보정값 · 오차 · rawUlen 은 그대로 값');
  ok(s2.Ulen === s2.rawUlen, '묶음 3개 미만 = 그대로 값');
}
{ // 폭 = 가장 나쁜 창 그대로 — 창 값을 길이 방향으로 노이즈 보정(창 하나는 광자가 적어 따로 내면 0% 로 나왔음)
  let sd = 99; const rnd = () => { sd = (sd + 0x6D2B79F5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }, gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const ns = 400, nw = 10, G = { ns, nw, ds: 1, cell: 1, w0: -5, L: ns, closed: true, winS: 5, area: new Float64Array(ns * nw).fill(1), valid: new Uint8Array(ns * nw).fill(1) };
  const wprof = (j, dark) => 1 - (dark ? 0.6 : 0.4) * Math.abs(j - 4.5) / 4.5;   // 폭 가장자리 어두움: 보통 60% · s 100~140 구간은 40%
  const mk = (rel) => Array.from({ length: 10 }, () => Float64Array.from({ length: ns * nw }, (_, k) => wprof(k % nw, Math.floor(k / nw) >= 100 && Math.floor(k / nw) < 140) * (1 + rel * gauss())));
  const o = { targetLen: 0.8, targetWid: 0.8 }, st = tallyStats(G, mk(0.6), o), truth = wprof(0, true) / wprof(4, true);
  ok(st.rawUwid < st.Uwid && Math.abs(st.Uwid - truth) < 0.1 && st.seWid > 0.01, `폭: 그대로 ${(st.rawUwid * 100).toFixed(1)}% → 보정 ${(st.Uwid * 100).toFixed(1)}% ±${(st.seWid * 100).toFixed(1)}%p (참값 ${(truth * 100).toFixed(1)}%)`);
  ok(st.sWorst >= 100 && st.sWorst <= 140, `가장 나쁜 창 = 어두운 구간(s ${st.sWorst})`);
  const c = tallyStats(G, mk(0), o);
  ok(Math.abs(c.Uwid - truth) < 1e-6 && Math.abs(c.Uwid - c.rawUwid) < 1e-9, '노이즈 없음 = 그대로');
}
{ // 광자가 아주 적을 때(Milky 5 · 10초 실측: 폭이 0% 로 나왔음) — 창별 값을 못 믿는 폭 칸은 전체 평균으로, 0% 로 떨어지지 않음
  let sd = 5; const rnd = () => { sd = (sd + 0x6D2B79F5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pois = (l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
  const ns = 445, nw = 20, G = { ns, nw, ds: 1, cell: 1, w0: -10, L: ns, closed: true, winS: 5, area: new Float64Array(ns * nw).fill(1), valid: new Uint8Array(ns * nw).fill(1) };
  const wprof = (j) => 1 - 0.85 * Math.abs(j - 9.5) / 9.5, truth = wprof(0) / wprof(9);   // 가장자리 15%
  const us = []; for (let t = 0; t < 5; t++) { const acc = Array.from({ length: 10 }, () => Float64Array.from({ length: ns * nw }, (_, k) => pois(0.15 * wprof(k % nw)))); us.push(tallyStats(G, acc, { targetLen: 0.8, targetWid: 0.8 })); }
  ok(us.every((x) => x.Uwid > 0.05 && Math.abs(x.Uwid - truth) < 0.1), `광자 적음: 폭 보정 ${us.map((x) => (x.Uwid * 100).toFixed(1)).join(' · ')}% (참값 ${(truth * 100).toFixed(1)}% · 그대로 ${(us[0].rawUwid * 100).toFixed(1)}%)`);
}
{ // 오차 기준(2026-11-15 사용자): 빠른 검토는 오차 ±2.5%p 에 닿을 때까지(최대 60초). 한도에 걸려 오차가 큰 후보는 '참고용' — '유력' 에 넣지 않음
  ok(QUICK_SE === 0.025, '오차 기준 ±2.5%p');
  ok(Math.abs(quickErr({ Ulen: 0.8, seLen: 0.02, Uwid: 0.7, seWid: 0.04 }, { targetLen: 0.8, targetWid: 0.6 }) - 0.04) < 1e-12, '오차 = 판정하는 방향 중 큰 쪽');
  ok(Math.abs(quickErr({ Ulen: 0.8, seLen: 0.02, Uwid: 0.7, seWid: 0.04 }, { targetLen: 0.8, targetWid: null }) - 0.02) < 1e-12 && Math.abs(quickErr({ Ulen: 0.8, seLen: 0.02, Uwid: null, seWid: 0.04 }, { targetLen: 0.8, targetWid: 0.6 }) - 0.02) < 1e-12, '판정하지 않는 방향(목표 없음 · 좁은 라인)의 오차는 안 봄');
  ok(quickErr({ empty: true }, { targetLen: 0.8 }) === Infinity && quickErr({ Ulen: 0.8, seLen: 0 }, { targetLen: 0.8 }) === Infinity, '빈 결과 · 오차를 못 잰 값은 기준 미달');
  ok(chanceGrade(0.9, 0.025) === 'likely' && chanceGrade(0.9, 0.026) === 'ref' && chanceGrade(0.4, 0.05) === 'ref' && chanceGrade(0.4, 0.02) === 'maybe' && chanceGrade(0.2, 0.05) === 'out', '오차가 크면 참고용');
  const h = histTableHtml([{ label: 'B', Ulen: 0.832, Uwid: 0.9, eff: 0.5, kind: 'alt', quick: true, chance: 0.95, se: 0.061 }, { label: 'C', Ulen: 0.85, Uwid: 0.9, eff: 0.5, kind: 'alt', quick: true, chance: 0.97, se: 0.021 }], 0.8, 0.6, false);
  ok(/참고용 95%/.test(h) && /om-q-ref/.test(h) && /유력 97%/.test(h) && !/유력 95%/.test(h), '표: 오차가 큰 후보는 참고용');
}
{ // 2026-11-16 사용자: Milky 3 이상에서 후보 값 흔들림 줄이기 — 높은 Milky 창은 오차가 ±5%p 에 닿을 때까지(창당 30초 상한) 더 계산
  const { milkyTraceOpts, MILKY_STEADY_FROM, MILKY_STEADY_SE, MILKY_STEADY_MS } = await import('../src/engine/mech3d/milky-search.js');
  ok(MILKY_STEADY_FROM === 3 && MILKY_STEADY_SE === 0.05 && MILKY_STEADY_MS === 30000, 'Milky 3 이상 · ±5%p · 30초');
  const lo = milkyTraceOpts(2.5), loP = milkyTraceOpts(2.5, { precise: true });
  ok(lo.maxMs === 2000 && lo.N === 1.5e6 && lo.minN === 1e5 && !lo.steady && loP.maxMs === 6000 && loP.N === 3e6 && !loP.steady, 'Milky 3 미만 창은 그대로');
  const hi = milkyTraceOpts(3), hiP = milkyTraceOpts(4.5, { precise: true }), h6 = milkyTraceOpts(6);
  ok(hi.steady && hi.maxMs === 30000 && hi.minN === 1e5 && hiP.steady && hiP.maxMs === 30000 && hiP.N === 3e6 && h6.steady && h6.minN === 5e4, 'Milky 3 이상 창 = 오차 기준까지(30초 상한)');
}
done();
