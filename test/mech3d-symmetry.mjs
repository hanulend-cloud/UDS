// 대칭 영역 검토(2026-11-17): node test/mech3d-symmetry.mjs
import { detectSym, foldPlan, foldArr, symStats, asymCheck, rotCount } from '../src/engine/mech3d/symmetry.js';
import { tallyStats } from '../src/engine/mech3d/tally.js';

let fail = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) { fail++; process.exitCode = 1; } };
// 합성 격자 — ns × nw, 칸 1 mm, w 가운데 대칭
const grid = (ns, nw, { closed = false, mask = () => true } = {}) => {
  const valid = new Uint8Array(ns * nw), area = new Float64Array(ns * nw);
  for (let i = 0; i < ns; i++) for (let j = 0; j < nw; j++) if (mask(i, j)) { valid[i * nw + j] = 1; area[i * nw + j] = 1; }
  return { ns, nw, ds: 1, cell: 1, w0: -nw / 2, L: ns, closed, valid, area, winS: 5 };
};
const obs = { targetLen: 0.8, targetWid: 0.8 };
// 가우스 노이즈(고정 씨앗)
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const field = (G, f, B, noise) => Array.from({ length: B }, () => { const a = new Float64Array(G.ns * G.nw); for (let i = 0; i < G.ns; i++) for (let j = 0; j < G.nw; j++) if (G.valid[i * G.nw + j]) a[i * G.nw + j] = f(i, j) * (1 + noise * gauss()); return a; });

{ // 대칭 판별 — LED 위치(s, w, 높이, 방향) · 관측면 칸
  const G = grid(40, 8), led = (s, w = 0, as = 0) => ({ s, w, h: 2, as, aw: 0 });
  const sym = detectSym(G, [led(5), led(15), led(25), led(35)]);
  ok(sym.len && sym.wid && !sym.rot, `좌우·폭 대칭 LED 4개 → 길이·폭 거울: ${JSON.stringify(sym)}`);
  const a = detectSym(G, [led(5), led(15), led(25), led(34)]);
  ok(!a.len && a.wid && a.why.some((t) => /LED/.test(t)), `LED 하나가 1 mm 어긋남 → 길이 거울 아님(이유 표시): ${a.why}`);
  ok(!detectSym(G, [led(5, 1), led(35, 1)]).wid, 'LED 가 폭 한쪽으로 치우침 → 폭 거울 아님');
  ok(!detectSym(G, [led(5, 0, 0.3), led(35, 0, 0.3)]).len && detectSym(G, [led(5, 0, 0.3), led(35, 0, -0.3)]).len, 'LED 기울기: 거울 짝은 길이 방향 성분 부호가 반대여야');
  const Gm = grid(40, 8, { mask: (i, j) => !(i < 3 && j < 2) });
  ok(!detectSym(Gm, [led(5), led(35)]).len, '관측면 칸이 한쪽만 잘림 → 길이 거울 아님');
  const R = grid(48, 6, { closed: true }), ring = Array.from({ length: 12 }, (_, k) => led(2 + 4 * k));
  const rs = detectSym(R, ring);
  ok(rs.rot === 12 && !rs.len, `링 LED 12개 같은 간격, 칸 48 → 회전 12: ${JSON.stringify(rs)}`);
  ok(detectSym(grid(50, 6, { closed: true }), ring.map((l, k) => ({ ...l, s: (50 / 12) * k }))).rot === 12, '칸 수가 12로 안 나뉘어도 회전 12(칸을 간격 안 위치별로 묶음, 2026-11-17)');
}
{ // 접기 — 칸 짝 합치기
  const G = grid(9, 4), P = foldPlan(G, { len: true, wid: true, rot: 0 });
  ok(P.G.ns === 5 && P.G.nw === 2 && P.factor === 4 && P.speed === 2 && /½/.test(P.label), `9×4 → 5×2, ×4: ${P.G.ns}×${P.G.nw} ${P.label}`);
  const one = new Float64Array(36).fill(1), f = foldArr(P, one);
  ok(f[0] === 4 && f[4 * 2] === 2 && P.G.area[0] === 4 && P.G.area[4 * 2] === 2, '짝 칸 합 · 가운데 줄(홀수)은 짝 없음 — 면적도 같이 합침');
  const Rp = foldPlan(grid(48, 6, { closed: true }), { len: false, wid: false, rot: 12 });
  ok(Rp.G.ns === 4 && Rp.G.closed && Rp.factor === 12 && Rp.speed === 12, '회전 12, 칸 48(나뉨) → 한 주기 4칸 그대로');
  const Rq = foldPlan(grid(151, 6, { closed: true }), { len: false, wid: false, rot: 39 });
  ok(Rq.G.ns === 24 && Rq.speed === 6 && Math.abs(Rq.G.ds * Rq.G.ns - 151 / 39) < 1e-9, `칸 151 · 회전 39 → 간격 안 위치 묶음 ${Rq.G.ns}칸(간격 1/24), 약 ×${Rq.speed}`);
}
{ // 대칭 도면: 접은 값 = 전체 값(노이즈 안) · 노이즈는 줄어듦
  const G = grid(60, 10), f = (i, j) => (1 - 0.4 * Math.exp(-i / 4) - 0.4 * Math.exp(-(59 - i) / 4)) * (1 - 0.3 * ((j - 4.5) / 5) ** 2);
  const sym = { len: true, wid: true, rot: 0 }, exact = tallyStats(G, field(G, f, 8, 0), obs);
  const accs = field(G, f, 8, 0.08), full = tallyStats(G, accs, obs), st = symStats(G, accs, obs, null, sym);
  ok(Math.abs(st.Ulen - exact.Ulen) <= Math.max(0.01, 2 * (st.seLen ?? 0)) && Math.abs(st.Uwid - exact.Uwid) <= Math.max(0.015, 2 * (st.seWid ?? 0)), `접은 균일도 ≈ 노이즈 없는 값: 길이 ${st.Ulen.toFixed(3)} / ${exact.Ulen.toFixed(3)} · 폭 ${st.Uwid?.toFixed(3)} / ${exact.Uwid?.toFixed(3)}`);
  ok(st.relNoise < full.relNoise * 0.7, `노이즈 줄어듦: ${full.relNoise.toFixed(4)} → ${st.relNoise.toFixed(4)}`);
  ok(st.profile.length === 60 && st.map.length === 600 && Math.abs(st.profile[3] - st.profile[56]) < 1e-12 && Math.abs(st.map[3 * 10 + 1] - st.map[56 * 10 + 8]) < 1e-12, '화면용 프로파일·지도는 전체 크기로 펼침(짝 칸 같은 값)');
  ok(st.sym?.factor === 4 && !st.sym.off, `결과에 대칭 표시: ${JSON.stringify(st.sym)}`);
  ok(asymCheck(foldPlan(G, sym), G, accs).ok, '대칭 도면은 결과 검사 통과');
}
{ // 비대칭 결과 → 합치기 끔(이유 표시, 한번 끄면 그 작업 동안 유지)
  const G = grid(60, 10), f = (i) => 1 - 0.5 * Math.exp(-i / 5);   // 왼쪽 끝만 어두움
  const sym = { len: true, wid: false, rot: 0 }, accs = field(G, f, 8, 0.03), st = symStats(G, accs, obs, null, sym);
  const full = tallyStats(G, accs, obs);
  ok(!!st.sym?.off && /대칭 아님/.test(st.sym.off) && Math.abs(st.Ulen - full.Ulen) < 1e-12, `비대칭이면 전체 계산 값 그대로 + 이유: ${st.sym?.off}`);
  ok(!!sym.off && !!symStats(G, field(G, () => 1, 8, 0.03), obs, null, sym).sym.off, '한번 끄면 같은 작업에서는 계속 끔(값이 오락가락하지 않게)');
}
{ // 대칭 없음·끔 → tallyStats 그대로
  const G = grid(20, 4), accs = field(G, () => 1, 4, 0.05);
  ok(symStats(G, accs, obs, null, null).Ulen === tallyStats(G, accs, obs).Ulen && !symStats(G, accs, obs, null, null).sym, '대칭 정보 없으면 지금과 똑같이');
}
{ // 링 회전 = LED 간격이 정확히 같을 때만(0.05 mm, 2026-11-17 사용자: ring-12led.uds 5.75/6.00 mm 섞임 → 합치면 길이 +9%p)
  const led = (s) => ({ s, w: 0, h: 2.8, as: 0, aw: 0 }), L = 226.17;
  const gaps = [5.75, 5.75, 6, 5.75, 5.75, 5.75, 5.75, 6, 5.75, 5.75, 5.75, 5.75, 6, 5.75, 5.75, 5.75, 5.75, 6, 5.75, 5.75, 5.75, 5.75, 6, 5.75, 5.75, 5.75, 5.75, 6, 5.75, 5.75, 5.75, 5.75, 6, 5.75, 5.75, 5.75, 5.75, 6];
  const ss = [1]; for (const g of gaps) ss.push(ss[ss.length - 1] + g);
  ok(rotCount(ss.map(led), L) === 0, `간격 5.75/6.00 섞임 → 회전 아님: ${rotCount(ss.map(led), L)}`);
  ok(rotCount(Array.from({ length: 39 }, (_, k) => led(1 + (L / 39) * k)), L) === 39, '정확히 같은 간격 → 회전 39');
  // 간격 안 위치 묶음 = 전체 계산과 같은 값(칸 151, 주기 L/39 — 칸이 주기와 안 맞아도 골을 놓치지 않음)
  const G = grid(151, 6, { closed: true }); G.ds = L / 151; G.L = L; for (let k = 0; k < G.area.length; k++) G.area[k] = G.ds;
  const P = L / 39, box = (i) => { let v = 0; for (let q = 0; q < 50; q++) { const s0 = (i + (q + 0.5) / 50) * G.ds; v += 1 - 0.25 * (0.5 + 0.5 * Math.cos((2 * Math.PI * s0) / P)) ** 4; } return v / 50; };
  const f = (i) => box(i) * G.ds, exact = tallyStats(G, field(G, f, 8, 0), obs), st = symStats(G, field(G, f, 8, 0), obs, null, { len: false, wid: false, rot: 39 });
  ok(st.Ulen - exact.Ulen > -0.001 && st.Ulen - exact.Ulen < 0.004, `주기와 안 맞는 칸에서도 묶은 값 ≈ 전체 값(+0.4%p 이내): ${st.Ulen.toFixed(3)} / ${exact.Ulen.toFixed(3)}`);
}
{ const G = grid(20, 4), accs = field(G, () => 1, 4, 0.05), st = symStats(G, accs, obs, null, { len: false, wid: false, rot: 0, why: ['회전: LED 간격이 정확히 같지 않음'] });
  ok(st.Ulen === tallyStats(G, accs, obs).Ulen && /LED 간격/.test(st.sym?.off ?? ''), `대칭을 찾지 못하면 값은 그대로 + 이유 표시: ${st.sym?.off}`); }
console.log(fail ? `${fail} FAIL` : 'ALL PASS');
