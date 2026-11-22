// 점진 계산 제어기(가짜 Worker 포트 + Worker 모의 동등성): node test/m3-progressive.mjs
import { createProgressive, interactOverlap, slowPortText, previewWanted, PREVIEW, chunkSeed, photometry, requiredFlux, photonCap, nextProgress, fmtProg } from '../src/ui/m3/progressive.js';
import { runJob } from '../src/engine/mech3d/job.js';
import { makeChunkHost } from '../src/engine/mech3d/chunk-host.js';
import { lightData } from '../src/engine/mech3d/line.js';
import { tallyStats } from '../src/engine/mech3d/tally.js';
import { loadTable } from './l2-util.mjs';
import { plateFixture } from './m3-fixture.mjs';
import { fakeTimers, settle } from './m3-timers.mjs';
import { ok, done } from './mech3d-util.mjs';

ok(photonCap('low') === 1.6e9 && photonCap() === 1.6e9 && photonCap('mid') === 3.2e9 && photonCap('high') === 6.4e9, '광선 한도: ±30° 기준 16억 × 화질(저 1 · 중 2 · 고 4)');

// 표시 진행률(2026-11-11) — 브라우저에서 잰 실제 순서(광선 만, 오차 %): 오차 추정이 흔들려도 되돌아가지 않음
{ const seq = [[144, 2.7], [161, 2.56], [207, 2.31], [213, 2.3], [251, 2.14], [267, 2.14], [309, 1.95], [319, 2.0], [362, 1.85], [371, 1.93], [421, 1.63], [457, 1.57]];
  let p = null, down = 0; const vals = [];
  for (const [ph, n] of seq) { const q = nextProgress(p, ph * 1e4, n / 100, 0.015); if (p && q.pct < p.pct) down++; p = q; vals.push(q.pct); }
  ok(down === 0 && vals.at(-1) > vals[0] + 40, `오차가 흔들려도 진행률은 오르기만 함: ${vals.map((v) => v.toFixed(1)).join(' ')}`);
  ok(vals.at(-1) < 100, '끝나기 전에는 100% 가 아님');
  // 목표 근처: 판정 오차가 1.5% → 0.5% 로 조여도(필요 광선 9배) 떨어지지 않고 이어서 오름
  const a = nextProgress(p, 480e4, 1.44 / 100, 0.005), b = nextProgress(a, 600e4, 1.3 / 100, 0.005), c = nextProgress(b, 1200e4, 0.95 / 100, 0.005);
  ok(a.pct >= p.pct && b.pct > a.pct && c.pct > b.pct, `목표 근처로 조여도 안 떨어짐: ${p.pct.toFixed(1)} → ${a.pct.toFixed(1)} → ${b.pct.toFixed(1)} → ${c.pct.toFixed(1)}`);
  // 목표 오차에 닿았는데 아직 완료 전이어도 멈춘 값 100 을 넘지 않음
  let z = null; for (let k = 1; k <= 50; k++) z = nextProgress(z, k * 1e6, 0.001, 0.015);
  ok(z.pct <= 99.9, `계속 돌아도 완료 전 상한 99.9 (${z.pct})`);
  ok(nextProgress(null, 0, null, 0.015) === null && nextProgress(p, 1e6, NaN, 0.015) === p, '오차가 아직 없으면 그대로');
  ok(fmtProg(44) === '44.0' && fmtProg(12.34) === '12.3' && fmtProg(99.99) === '99.9' && fmtProg(100) === '100.0' && fmtProg(NaN) === '0.0', '진행률 표시: 0.1% 단위 내림'); }

// 합성 집계 격자: s 4칸 × w 2칸, 모두 유효·면적 1mm²
const G = { ns: 4, nw: 2, ds: 1, cell: 1, w0: -1, valid: new Uint8Array(8).fill(1), area: new Float64Array(8).fill(1), L: 4, closed: false, winS: 2 };
const obs = { faces: [], cone: 90, targetLen: 0.8, targetWid: 0.8 };
const job = (k) => ({ sceneKey: `s${k}`, scene: { tag: k }, G, obs, nLeds: 2, fluxLm: 0 });
const LED = { lumEsc: 0.02, emitted: 1, escaped: 0.5, absSurf: 0.5, absVol: 0, lost: 0, rrLoss: 0, rrGain: 0 };
// 응답: 첫 s 칸(셀 0,1) = 0.85, 나머지 1 — 시드마다 ±0.2% 흔들림 → 길이 균일도 ≈ 0.85, 노이즈 ≪ 2%
const make = (msg) => ({ sceneKey: msg.sceneKey, acc: Float64Array.from({ length: 8 }, (_, k) => (k < 2 ? 0.85 : 1) * (1 + 0.002 * Math.sin(msg.seed * 7 + k))), cnt: new Uint32Array(8).fill(10), ledger: { ...LED }, leak: { '0|0': 0.1 } });
// 수동 포트: 청크 응답을 시험이 직접 보냄
function manualPort() {
  const log = [], pend = [];
  return { log, pend, send(msg) { log.push(msg); return msg.type === 'scene' ? Promise.resolve({ sceneKey: msg.sceneKey, ready: true }) : new Promise((res, rej) => pend.push({ msg, res, rej })); } };
}
// 지연 포트: 청크마다 delay ms 뒤 make(msg) 로 응답
function delayedPort(T, delay = 100) {
  const log = [];
  return { log, send(msg) { log.push(msg); return msg.type === 'scene' ? Promise.resolve({ sceneKey: msg.sceneKey, ready: true }) : new Promise((res) => T.setTimeout(() => res(make(msg)), delay)); } };
}
const chunks = (p) => p.log.filter((m) => m.type === 'chunk');
const scenes = (p) => p.log.filter((m) => m.type === 'scene');
const OPT = { chunkN: 1000, fixedChunk: true, bins: 10, debounceMs: 500, tickMs: 1000, maxPhotons: 1e9 };

{   // 디바운스 · 장면 · 시드 · 누적 · 이전 청크 무시 · 다른 sceneKey 무시 · 취소
  const T = fakeTimers(), a = manualPort(), b = manualPort(), ups = [];
  const P = createProgressive({ ports: [a, b], timers: T, onUpdate: (s) => ups.push(s.state), opts: OPT });
  P.restart(job(1)); await T.advance(200); P.restart(job(2)); await T.advance(499);   // 디바운스는 마지막 restart 부터 0.5초
  ok(a.log.length === 0 && P.snapshot().state === 'pending', '디바운스 중: 장면 안 보냄');
  await T.advance(1);
  ok(scenes(a).length === 1 && scenes(a)[0].sceneKey === 's2' && scenes(a)[0].tag === 2 && scenes(b).length === 1, '0.5초 뒤 마지막 작업의 장면만 모든 포트에');
  ok(chunks(a)[0].seed === chunkSeed(1, 0) && chunks(b)[0].seed === chunkSeed(1, 1) && chunks(a)[0].N === 1000 && P.snapshot().state === 'running', `청크 시드 7919·7920, 상태 running (${ups.join('>')})`);
  a.pend.shift().res(make(chunks(a)[0])); b.pend.shift().res(make(chunks(b)[0])); await T.advance(0);
  const s1 = P.snapshot();
  ok(s1.photons === 2000 && s1.chunks === 2 && s1.bins[0].n === 1 && s1.bins[1].n === 1 && s1.stats && Math.abs(s1.stats.Ulen - 0.85) < 0.01 && s1.leak['0|0'] === 0.2 && s1.ledger.emitted === 2,
    `누적: 광자 ${s1.photons}, 배치 2개 → 첫 지표 바로(Ulen ${s1.stats?.Ulen.toFixed(3)}), 새는 빛 합 ${s1.leak['0|0']}`);
  P.restart(job(3));   // 진행 중 청크(c=2,3)가 있는 상태에서 다시 시작
  a.pend.shift().res(make(chunks(a)[1])); b.pend.shift().res(make(chunks(b)[1])); await T.advance(0);
  ok(P.snapshot().photons === 0 && P.snapshot().state === 'pending', '다시 시작 전 청크 결과는 버림');
  await T.advance(500);
  const c3 = chunks(a).at(-1);
  ok(c3.sceneKey === 's3' && c3.seed === chunkSeed(1, 0), '새 장면 s3, 청크 번호 0부터');
  a.pend.shift().res({ ...make(c3), sceneKey: 's2' }); await T.advance(0);
  ok(P.snapshot().photons === 0 && P.snapshot().ignored === 1, '다른 sceneKey 응답 무시');
  P.cancel();
  const n = a.log.length;
  for (const x of [...a.pend.splice(0), ...b.pend.splice(0)]) x.res(make(x.msg));
  await T.advance(2000);
  ok(P.snapshot().state === 'idle' && P.snapshot().photons === 0 && a.log.length === n, '취소: idle, 남은 응답 무시, 새 청크 없음');
}
{   // 수렴 멈춤 · 목표만 바꾸면 판정만 · 광속 → 휘도 · 노이즈 목표를 낮추면 재개
  const T = fakeTimers(), p = delayedPort(T);
  const P = createProgressive({ ports: [p], timers: T, opts: OPT });
  P.restart(job(1)); await T.advance(3000);
  const s = P.snapshot();
  ok(s.state === 'done' && s.reason === 'converged' && s.chunks >= 10 && s.chunks <= 25 && s.stats.relNoise <= 0.02 && s.stats.passLen === true,
    `수렴: 청크 ${s.chunks}, 노이즈 ${(s.stats.relNoise * 100).toFixed(3)}%, 길이 균일도 ${s.stats.Ulen.toFixed(3)} 합격`);
  const nScene = scenes(p).length, nCh = chunks(p).length;
  P.setJudge({ obs: { ...obs, targetLen: 0.9 } });
  const j = P.snapshot();
  ok(j.progress === 100, `완료 = 진행률 100 (${j.progress})`);
  ok(j.state === 'done' && j.stats.passLen === false && j.photons === s.photons && scenes(p).length === nScene && chunks(p).length === nCh, '목표 0.9: 판정만 다시(불합격), 계산·장면 그대로');
  ok(j.photometry.lum === null && Math.abs(photometry(G, j.sum, j.ledger).eff - j.photometry.eff) < 1e-15, '광속 0 → 휘도 없음(상대값), 효율 = Σ출사/방출');
  P.setJudge({ fluxLm: 10 });
  const L = P.snapshot().photometry;
  const S10 = Math.sin(Math.PI / 18) ** 2;
  ok(L.lum > 0 && Math.abs(L.effLum - 0.02) < 1e-12 && Math.abs(L.lum - (10 * 2 * L.effLum) / (8e-6 * Math.PI * S10)) < 1e-9 * L.lum, `광속 10 lm × 2개: 휘도 ${L.lum.toFixed(0)} cd/m² = Φ·eff(±10°)/(A·π·sin²10°)`);
  ok(Number.isFinite(L.eff) && L.eff !== L.effLum, '광 효율 카드(판정 각도)와 휘도 효율(±10°)은 따로');
  // 필요 광속(2026-11-11) — 휘도 식의 역산. 광속을 안 넣어도(광 효율만으로) 구함
  { const a = photometry(G, j.sum, j.ledger, { fluxLm: 10, nLeds: 2 }), n = requiredFlux(a, a.lum);
    ok(Math.abs(n.total - 20) < 1e-9 && Math.abs(n.perLed - 10) < 1e-9, `필요 광속 역산: 총 ${n.total} lm · LED당 ${n.perLed} lm`); }
  { const a = photometry(G, j.sum, j.ledger, { fluxLm: 0, nLeds: 2 }), n = requiredFlux(a, 1000);
    ok(a.lum === null && Math.abs(n.total - (1000 * 8e-6 * Math.PI * S10) / a.effLum) < 1e-9 * n.total && Math.abs(n.perLed - n.total / 2) < 1e-12, '광속 입력 없이도 목표 휘도로 필요 광속 계산'); }
  ok(requiredFlux(L, 0) === null && requiredFlux(L, null) === null && requiredFlux(null, 1000) === null && requiredFlux({ ...L, effLum: 0 }, 1000) === null && requiredFlux({ ...L, nLeds: 0 }, 1000) === null, '목표 없음·효율 0·LED 0 → 필요 광속 없음');
  P.setJudge({ targetNoise: 1e-6 });
  ok(P.snapshot().state === 'running', '노이즈 목표를 현재 노이즈보다 낮추면 계산 재개');
  P.cancel();
}
{   // 일시정지 · 재개
  const T = fakeTimers(), p = delayedPort(T);
  const P = createProgressive({ ports: [p], timers: T, opts: OPT });
  P.restart(job(1)); await T.advance(650);   // 500ms 시작 → 600ms 청크 0 완료, 청크 1 진행 중
  P.pause(); const n = chunks(p).length;
  await T.advance(1000);
  const s = P.snapshot();
  ok(s.state === 'paused' && s.chunks === 2 && chunks(p).length === n, `일시정지: 진행 중 청크만 받고(${s.chunks}개) 새 청크 없음`);
  P.resume(); await T.advance(150);
  ok(P.snapshot().state === 'running' && chunks(p).length > n, '재개: 청크 다시 보냄');
  P.cancel();
}
{   // 광자 상한
  const T = fakeTimers(), p = delayedPort(T);
  const P = createProgressive({ ports: [p], timers: T, opts: { ...OPT, maxPhotons: 4000 } });
  P.restart(job(1)); await T.advance(2000);
  const s = P.snapshot();
  ok(s.state === 'done' && s.reason === 'max' && s.photons === 4000 && chunks(p).length === 4, `광자 상한 4000: 청크 ${chunks(p).length}개 후 멈춤`);
}
const frac = (x) => x - Math.floor(x);   // 시드별 유사 난수(평균이 1/√n 로 줄어듦 — sin 그대로는 너무 빨리 상쇄)
{   // 목표 경계 5분 한도(2026-11-22 사용자) — 목표 바로 아래라 노이즈 목표를 0.5% 로 조인 뒤 5분(계산 중 시간)이 지나면 멈춤. 실측: 8시간 넘게 안 끝남(80.5% / 79.7% ±1.5%p)
  const T = fakeTimers(), log = [];
  const nz = (msg) => ({ ...make(msg), acc: Float64Array.from({ length: 8 }, (_, k) => (k < 2 ? 0.8 : 1) * (1 + 0.35 * (2 * frac(Math.sin(msg.seed * 12.9898 + k * 78.233) * 43758.5453) - 1))) });
  const p = { log, send(msg) { log.push(msg); return msg.type === 'scene' ? Promise.resolve({ sceneKey: msg.sceneKey, ready: true }) : new Promise((res) => T.setTimeout(() => res(nz(msg)), 10000)); } };
  const P = createProgressive({ ports: [p], timers: T, opts: OPT });
  P.restart(job(1)); await T.advance(120000);
  const a = P.snapshot();
  ok(a.state === 'running' && a.targetNoise === 0.005 && a.stats.relNoise > 0.005, `목표 바로 아래 → 노이즈 목표 0.5% 로 조임, 계속 계산 (Ulen ${a.stats?.Ulen?.toFixed(3)} · 노이즈 ${(a.stats?.relNoise * 100).toFixed(2)}%)`);
  P.pause(); await T.advance(600000); P.resume();
  ok(P.snapshot().state === 'running', '일시정지 시간은 한도에 안 셈');
  await T.advance(900000);
  const b = P.snapshot();
  ok(b.state === 'done' && b.reason === 'judgeLimit' && b.stats.relNoise > 0.015 && b.stats.relNoise <= 0.02, `2% 에 닿은 뒤 5분 → 멈춤(목표 경계): ${b.state}/${b.reason}`);
  P.cancel();
}
{   // 5분은 기본 노이즈에 닿은 뒤부터 셈 — 목표 근처라도 기본(1%)보다 노이즈가 크면 계속 계산(전에는 조인 순간부터 세어 1% 에도 못 닿고 멈출 수 있었음)
  const T = fakeTimers(), log = [];
  const nz = (msg) => ({ ...make(msg), acc: Float64Array.from({ length: 8 }, (_, k) => (k < 2 ? 0.8 : 1) * (1 + 0.35 * (2 * frac(Math.sin(msg.seed * 12.9898 + k * 78.233) * 43758.5453) - 1))) });
  const p = { log, send(msg) { log.push(msg); return msg.type === 'scene' ? Promise.resolve({ sceneKey: msg.sceneKey, ready: true }) : new Promise((res) => T.setTimeout(() => res(nz(msg)), 10000)); } };
  const P = createProgressive({ ports: [p], timers: T, opts: { ...OPT, targetNoise: 0.01 } });
  P.restart(job(1)); await T.advance(600000);
  const a = P.snapshot();
  ok(a.state === 'running' && a.stats.relNoise > 0.01, `10분 · 노이즈 ${(a.stats.relNoise * 100).toFixed(2)}% > 기본 1% → 계속 계산`);
  P.cancel();
}
{   // 준비 안 됨(작업 함수 null) · 작업 함수 오류
  const T = fakeTimers(), p = delayedPort(T);
  const P = createProgressive({ ports: [p], timers: T, opts: OPT });
  P.restart(() => null); await T.advance(500);
  ok(P.snapshot().state === 'idle' && P.snapshot().reason === 'notReady' && p.log.length === 0, '작업 없음 → idle/notReady, 메시지 없음');
  P.restart(() => { throw new Error('배치 길이 초과'); }); await T.advance(500);
  ok(P.snapshot().state === 'error' && /배치 길이/.test(P.snapshot().error), '작업 함수 오류 → error');
}
{   // 누적 동등성: 포트 2개(Worker 모의 = chunk-host)로 청크 10개 = runJob(seed 3, 배치 10) — 배치·판정 비트 일치
  const table = loadTable(), fx = plateFixture(table);
  const J = runJob({ S: fx.S, line: fx.line, obs: fx.obs, G: fx.G, emitters: fx.emitters, ledSpec: fx.ledSpec, N: 20000, seed: 3, batches: 10 });
  const hostPort = () => { const h = makeChunkHost({ getTable: () => table }); return { send: (m) => Promise.resolve().then(() => h.handle(m).reply) }; };
  const T = fakeTimers();
  const P = createProgressive({ ports: [hostPort(), hostPort()], timers: T, opts: { chunkN: 2000, fixedChunk: true, bins: 10, maxPhotons: 20000, seedBase: 3, debounceMs: 500, tickMs: 1000 } });
  P.restart({ sceneKey: 'e1', scene: { mechParts: [fx.plate], mspec: fx.mspec, ledParts: null, lineData: lightData(fx.line), G: fx.G, obs: fx.obs, emitters: fx.emitters }, G: fx.G, obs: fx.obs, nLeds: 5, fluxLm: 0 });
  await T.advance(500); await settle(200);
  const s = P.snapshot(), ref = tallyStats(fx.G, J.accs, fx.obs, J.cnts);
  ok(s.state === 'done' && s.reason === 'max' && s.chunks === 10, `점진 계산 끝: 청크 ${s.chunks}개`);
  ok(s.bins.every((b, i) => b.n === 1 && b.acc.every((v, k) => v === J.accs[i][k])), '배치 10개 = runJob 배치(비트 일치)');
  ok(s.stats.Ulen === ref.Ulen && s.stats.Uwid === ref.Uwid && s.stats.relNoise === ref.relNoise && s.stats.sWorst === ref.sWorst,
    `판정 일치: 길이 균일도 ${ref.Ulen.toFixed(4)}, 폭 균일도 ${ref.Uwid?.toFixed(4)}, 노이즈 ${(ref.relNoise * 100).toFixed(2)}%`);
  ok(Object.keys(J.ledger).every((k) => Math.abs(s.ledger[k] - J.ledger[k]) <= 1e-12 * Math.max(1, J.ledger[k])), '원장 합 일치(도착 순서 차이만)');
  ok(s.ledger.lumEsc > 0 && s.ledger.lumEsc <= s.ledger.escaped, `실제 추적 청크가 ±10° 휘도 광량을 돌려줌 (${s.ledger.lumEsc})`);
}
{   // 큰 도면 = 장면 준비 제한 시간도 늘림(2026-11-17) — 청크처럼 삼각형 20만 개마다 기본 시간만큼(상한 5분). 전에는 장면만 30초 고정이라 느린 PC 에서 큰 도면이 'error'
  const T = fakeTimers(), hung = { send() { return new Promise(() => {}); } }, j0 = job(1), big = { ...j0, scene: { ...j0.scene, mechParts: [{ triangles: { length: 3 * 400000 } }] } };
  const P = createProgressive({ ports: [hung], timers: T, opts: { ...OPT, sceneTimeoutMs: 5000, chunkTimeoutMs: 3000 } });
  P.restart(big); await T.advance(500 + 9999);
  ok(P.snapshot().state === 'starting', `삼각형 40만 개 = 장면 제한 10초 (9.999초에 아직 대기: ${P.snapshot().state})`);
  await T.advance(1);
  ok(P.snapshot().state === 'error' && /scene 10초/.test(P.snapshot().error), `10초 뒤 error (${P.snapshot().error})`);
}
{   // 응답 없는 포트 → 제한 시간 뒤 error (장면 · 청크)
  const T = fakeTimers(), hung = { log: [], send(m) { this.log.push(m); return new Promise(() => {}); } };
  const P = createProgressive({ ports: [hung], timers: T, opts: { ...OPT, sceneTimeoutMs: 5000, chunkTimeoutMs: 3000 } });
  P.restart(job(1)); await T.advance(500 + 4999);
  ok(P.snapshot().state === 'starting', '장면 응답 대기 중(제한 시간 전)');
  await T.advance(1);
  ok(P.snapshot().state === 'error' && /Worker 응답 없음/.test(P.snapshot().error), `장면 응답 없음 → error (${P.snapshot().error})`);
  const T2 = fakeTimers(), m = manualPort();
  const Q = createProgressive({ ports: [m], timers: T2, opts: { ...OPT, chunkTimeoutMs: 3000 } });
  Q.restart(job(1)); await T2.advance(500 + 2999);
  ok(Q.snapshot().state === 'running', '청크 응답 대기 중(제한 시간 전)');
  await T2.advance(1);
  ok(Q.snapshot().state === 'error' && /Worker 응답 없음/.test(Q.snapshot().error), '청크 응답 없음 → error');
}
{   // 포트 하나만 늦음(2026-11-18 사용자 'Worker 응답 없음 (chunk 30초)' 7번 — 3D 화면을 돌리면 GPU 청크가 몇 배 느려짐) → 그 포트만 이번 계산에서 빼고 나머지로 계속
  const T = fakeTimers(), a = manualPort(), b = delayedPort(T, 100);
  const P = createProgressive({ ports: [a, b], timers: T, opts: { ...OPT, chunkTimeoutMs: 3000, targetNoise: 1e-9 } });
  P.restart(job(1)); await T.advance(500);
  const c0 = chunks(a)[0];
  await T.advance(3000);
  const s = P.snapshot(), nA = chunks(a).length, nB = chunks(b).length;
  ok(s.state === 'running' && !s.error, `늦은 포트 하나 → 계산 계속 (${s.state} ${s.error ?? ''})`);
  ok(chunks(b).some((m) => m.seed === c0.seed), '늦은 포트의 청크 번호는 다른 포트가 다시 계산(같은 시드)');
  await T.advance(2000);
  ok(chunks(a).length === nA && chunks(b).length > nB, `늦은 포트에는 더 보내지 않음 (a ${nA}→${chunks(a).length}, b ${nB}→${chunks(b).length})`);
  const ph = P.snapshot().photons; a.pend.shift().res(make(c0)); await T.advance(0);
  ok(P.snapshot().photons === ph, '늦게 도착한 답은 세지 않음(같은 청크를 두 번 세지 않게)');
  P.restart(job(2)); await T.advance(500);
  ok(scenes(a).length === 2 && chunks(a).length === nA + 1, '다음 계산에서는 그 포트도 다시 씀');
  P.dispose();
}
{   // 늦어서 뺀 포트 알림(2026-11-18 사용자: 오류 기록에 어느 Worker·3D 조작 여부) — onSlow({ k, gpu, N, ms, t0, t1, last })
  const T = fakeTimers(), a = manualPort(), b = delayedPort(T, 100), got = [];
  a.gpu = true;
  const P = createProgressive({ ports: [a, b], timers: T, onSlow: (x) => got.push(x), opts: { ...OPT, chunkTimeoutMs: 3000, targetNoise: 1e-9 } });
  P.restart(job(1)); await T.advance(500 + 3000);
  ok(got.length === 1 && got[0].gpu === true && got[0].k === 0 && got[0].N === 1000 && got[0].ms === 3000 && got[0].t1 - got[0].t0 === 3000 && got[0].last === false, `늦은 포트 알림: ${JSON.stringify(got[0])}`);
  P.dispose();
  const T2 = fakeTimers(), c = manualPort(), g2 = [];
  const Q = createProgressive({ ports: [c], timers: T2, onSlow: (x) => g2.push(x), opts: { ...OPT, chunkTimeoutMs: 3000 } });
  Q.restart(job(1)); await T2.advance(500 + 3000);
  ok(g2.length === 1 && g2[0].gpu === false && g2[0].last === true && Q.snapshot().state === 'error', '마지막 포트도 알린 뒤 실패(last = true)');
  Q.dispose();
}
{   // 조작 시간 겹침 · 기록 문구(순수)
  const iv = [[0, 2000], [5000, 9000], [12000, null]];
  ok(interactOverlap(iv, 1000, 13000) === 6000 && interactOverlap([], 0, 9) === 0 && interactOverlap(iv, 2500, 4000) === 0, `조작 겹침: ${interactOverlap(iv, 1000, 13000)}`);
  const t1 = slowPortText({ gpu: true, N: 90000, ms: 30000, last: false }, 12300, 30000), t2 = slowPortText({ gpu: false, N: 5000, ms: 30000, last: true }, 0, 30000);
  ok(t1 === '계산 Worker 늦어 뺌 — GPU Worker · 청크 9.0만 광선 · 30초 안에 답 없음 · 그동안 3D 화면 조작 12.3초(41%)', t1);
  ok(t2 === '계산 Worker 늦어 뺌 — CPU Worker · 청크 0.5만 광선 · 30초 안에 답 없음 · 3D 화면 조작 없음 · 남은 Worker 없음 → 계산 실패', t2);
}
{   // 모든 포트가 늦으면 지금처럼 error
  const T = fakeTimers(), a = manualPort(), b = manualPort();
  const P = createProgressive({ ports: [a, b], timers: T, opts: { ...OPT, chunkTimeoutMs: 3000 } });
  P.restart(job(1)); await T.advance(500 + 3000);
  ok(P.snapshot().state === 'error' && /Worker 응답 없음 \(chunk 3초\)/.test(P.snapshot().error), `모든 포트 응답 없음 → error (${P.snapshot().error})`);
  P.dispose();
}
{   // 대기·시작 중 일시정지 → 시작하면 바로 paused, 재개하면 진행
  const T = fakeTimers(), p = delayedPort(T);
  const P = createProgressive({ ports: [p], timers: T, opts: OPT });
  P.restart(job(1)); P.pause(); await T.advance(2000);
  ok(P.snapshot().state === 'paused' && chunks(p).length === 0 && scenes(p).length === 1, '대기 중 일시정지: 장면만 보내고 paused, 청크 없음');
  P.resume(); await T.advance(150);
  ok(P.snapshot().state === 'running' && chunks(p).length > 0, '재개 → 청크 보냄');
  P.cancel();
  const T2 = fakeTimers(), q = delayedPort(T2);
  const Q = createProgressive({ ports: [q], timers: T2, opts: OPT });
  Q.restart(job(1)); Q.pause(); Q.resume(); await T2.advance(650);
  ok(Q.snapshot().state === 'running' && chunks(q).length > 0, '대기 중 일시정지 후 재개 → 정상 시작');
  Q.cancel();
}
{   // 장면 불일치(stale) 청크 번호는 다시 써서 시드가 이어짐
  const T = fakeTimers(), a = manualPort();
  const P = createProgressive({ ports: [a], timers: T, opts: OPT });
  P.restart(job(1)); await T.advance(500);
  a.pend.shift().res({ sceneKey: 's1', stale: true }); await T.advance(0);
  ok(chunks(a)[1].seed === chunkSeed(1, 0), `stale 뒤 같은 청크 번호 다시 보냄 (seed ${chunks(a)[1].seed})`);
  a.pend.shift().res(make(chunks(a)[1])); await T.advance(0);
  ok(chunks(a)[2].seed === chunkSeed(1, 1) && P.snapshot().chunks === 1 && P.snapshot().ignored === 1, '다음 청크는 번호 1 — 구멍 없음');
  P.cancel();
}
{   // dispose: 알림 없이 정리, 이후 호출 무시
  const T = fakeTimers(), p = delayedPort(T), ups = [];
  const P = createProgressive({ ports: [p], timers: T, onUpdate: (s) => ups.push(s.state), opts: OPT });
  P.restart(job(1)); await T.advance(700);
  const n = ups.length, nc = chunks(p).length;
  P.dispose(); P.cancel(); P.restart(job(2)); await T.advance(2000);
  ok(ups.length === n && chunks(p).length === nc && P.snapshot().state === 'idle', 'dispose 뒤 알림·청크 없음');
}
{   // 사용자 일시정지는 물리 변경(다시 시작) 뒤에도 유지
  const T = fakeTimers(), p = delayedPort(T);
  const P = createProgressive({ ports: [p], timers: T, opts: OPT });
  P.restart(job(1)); await T.advance(650); P.pause();
  await T.advance(200); const nc = chunks(p).length;
  P.restart(job(2)); await T.advance(2000);
  ok(scenes(p).at(-1).sceneKey === 's2' && P.snapshot().state === 'paused' && chunks(p).length === nc, '일시정지 중 다시 시작: 새 장면만 보내고 paused 유지, 청크 없음');
  P.resume(); await T.advance(150);
  const nw = chunks(p).slice(nc);
  ok(P.snapshot().state === 'running' && nw.length > 0 && nw.every((m) => m.sceneKey === 's2') && nw[0].seed === chunkSeed(1, 0), '재개 → 새 장면 청크(번호 0부터)');
  P.cancel();
}
// ---- 적응형 청크 · 광자 수 정규화 · 포트별 시작 ----
// 합성 MC 포트: 셀 k 의 광자당 기댓값 mu[k], 광자당 표준편차 sig — 청크 합 = N·mu + √N·sig·z(시드 결정적). 속도 rate 광자/ms → ms 보고
const mu = [0.85, 0.85, 1, 1, 1, 1, 0.95, 0.95], sig = 2;
function gauss(seed, k) { let x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; const u1 = x - Math.floor(x); x = Math.sin(seed * 39.3468 + k * 11.135) * 24634.6345; const u2 = x - Math.floor(x); return Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2); }
// 실제 엔진처럼 청크 결과 = 광원 광속 1회분(가중치 w0 = 1/N — 광자 수와 무관, 평균 mu·노이즈 sig/√N), 개수 cnt 만 광자 수에 비례
const mcReply = (msg, rate) => ({ sceneKey: msg.sceneKey, acc: Float64Array.from(mu, (m, k) => m + sig * gauss(msg.seed, k) / Math.sqrt(msg.N)), cnt: new Uint32Array(8).fill(msg.N / 100), ledger: { ...LED, emitted: 1 }, leak: {}, ms: msg.N / rate });
function mcPort(T, rate) {
  const log = [];
  return { log, send(msg) { log.push(msg); return msg.type === 'scene' ? Promise.resolve({ sceneKey: msg.sceneKey, ready: true }) : new Promise((res) => T.setTimeout(() => res(mcReply(msg, rate)), msg.N / rate)); } };
}
const perPhoton = (s) => Array.from(s.sum, (v) => v / (s.photons / 25000));   // sum = 광자 수 가중(chunkN 25,000 = 1회분) 합
{   // 적응형: 첫 청크 minChunk, 다음은 잰 속도 × 0.5초(상·하한), 포트마다 따로
  const T = fakeTimers(), slow = mcPort(T, 1.3), fast = mcPort(T, 40);   // 1,300 / 40,000 광자/초
  const P = createProgressive({ ports: [slow, fast], timers: T, opts: { bins: 10, debounceMs: 500, tickMs: 1000, maxPhotons: 1e9, targetNoise: 1e-9 } });
  P.restart(job(1)); await T.advance(500 + 5000);
  const ns = chunks(slow).map((m) => m.N), nf = chunks(fast).map((m) => m.N);
  ok(ns[0] === 1000 && nf[0] === 1000, `첫 청크 1,000 광자 (느림 ${ns[0]}, 빠름 ${nf[0]})`);
  ok(ns.slice(1).every((n) => n === 1000), `느린 포트(1.3/ms × 500ms = 650 → 하한 1,000): ${ns.slice(0, 4).join(',')}`);
  ok(nf[1] === 2000 && nf.includes(20000) && nf.every((n) => n <= 20000), `빠른 포트: 두 배씩 늘어 목표 20,000 까지(증가 상한, 2026-11-11) — ${nf.slice(0, 7).join(',')}`);
  const all = [...chunks(slow), ...chunks(fast)].map((m) => m.seed).sort((a, b) => a - b);
  ok(all.every((v, i) => v === chunkSeed(1, i)), '시드는 청크 번호 순 — 빈틈·중복 없음');
  P.cancel();
  const T2 = fakeTimers(), huge = mcPort(T2, 1000);
  const Q = createProgressive({ ports: [huge], timers: T2, opts: { bins: 10, debounceMs: 500, maxPhotons: 1e9, targetNoise: 1e-9 } });
  Q.restart(job(1)); await T2.advance(500 + 200);
  ok(chunks(huge)[1].N === 2000, `청크 두 번째는 두 배(2,000): ${chunks(huge)[1].N}`);
  await T2.advance(200000);
  ok(Math.max(...chunks(huge).map((m) => m.N)) === 50000, `상한 50,000 (최대 ${Math.max(...chunks(huge).map((m) => m.N))})`);
  Q.cancel();
}
{   // 첫 지표: 작은 첫 청크라 1초 안에(속도 1,300 광자/초 Worker 2개)
  const T = fakeTimers(), a = mcPort(T, 1.3), b = mcPort(T, 1.3);
  let first = null;
  const P = createProgressive({ ports: [a, b], timers: T, onUpdate: (s) => { if (first == null && s.stats) first = T.now(); }, opts: { bins: 10, debounceMs: 0, maxPhotons: 1e9, targetNoise: 1e-9 } });
  P.restart(job(1)); await T.advance(3000);
  ok(first != null && first <= 1000, `첫 지표 ${first} ms (≤ 1,000)`);
  P.cancel();
}
{   // 광자 수 정규화 — 크기가 같으면 ÷ 청크 수와 정확히 같음
  const T = fakeTimers(), p = delayedPort(T);
  const P = createProgressive({ ports: [p], timers: T, opts: { ...OPT, maxPhotons: 20000, targetNoise: 1e-9 } });
  P.restart(job(1)); await T.advance(5000);
  const s = P.snapshot(), ref = tallyStats(G, s.bins.map((b) => b.acc.map((v) => v / b.n)), obs);
  ok(s.reason === 'max' && s.bins.every((b) => b.n === 2 && b.photons === 2000) && s.stats.Ulen === ref.Ulen && s.stats.relNoise === ref.relNoise, `같은 크기 20청크: 배치 ÷ 2 와 비트 일치 (노이즈 ${(ref.relNoise * 100).toFixed(4)}%)`);
}
{   // 적응형 누적 평균 = 고정 25k 누적 평균 (3σ 안) — 청크 크기가 제각각이어도 광자 수 정규화로 치우침 없음
  const run = async (opts, rate) => {
    const T = fakeTimers(), ps = [mcPort(T, rate), mcPort(T, rate * 3)];
    const P = createProgressive({ ports: ps, timers: T, opts: { bins: 10, debounceMs: 0, tickMs: 1000, targetNoise: 1e-9, maxPhotons: 400000, ...opts } });
    P.restart(job(1)); await T.advance(1e6);
    return P.snapshot();
  };
  const F = await run({ fixedChunk: true, chunkN: 25000 }, 5), A_ = await run({}, 5);
  const sizes = new Set(A_.bins.map((b) => b.photons)), nA = A_.bins.map((b) => b.photons);
  ok(F.reason === 'max' && A_.reason === 'max' && F.photons === 400000 && A_.photons === 400000 && sizes.size > 1 && Math.max(...nA) / Math.min(...nA) < 1.5, `둘 다 40만 광자, 적응형 청크 크기 제각각 · 배치 광자 ${Math.min(...nA)}~${Math.max(...nA)} 고르게`);
  const mF = perPhoton(F), mA = perPhoton(A_), tol = 3 * sig * Math.sqrt(2 / 400000);
  ok(mA.every((v, k) => Math.abs(v - mF[k]) <= tol && Math.abs(v - mu[k]) <= tol), `셀 평균 일치(3σ = ${tol.toExponential(1)}): 최대 차 ${Math.max(...mA.map((v, k) => Math.abs(v - mF[k]))).toExponential(1)}`);
  const se = Math.hypot(F.stats.seLen ?? 0, A_.stats.seLen ?? 0);
  ok(Math.abs(A_.stats.Ulen - F.stats.Ulen) <= 3 * se && Math.abs(A_.stats.Ulen - 0.85) <= 3 * (A_.stats.seLen ?? 0) + 1e-3, `길이 균일도 일치: 적응 ${A_.stats.Ulen.toFixed(4)} · 고정 ${F.stats.Ulen.toFixed(4)} (3σ ${(3 * se).toFixed(4)})`);
  ok(Math.abs(A_.stats.relNoise / F.stats.relNoise - 1) < 0.5, `노이즈 추정 비슷: 적응 ${(A_.stats.relNoise * 100).toFixed(3)}% · 고정 ${(F.stats.relNoise * 100).toFixed(3)}%`);
}
{   // 포트별 시작: 장면이 늦은 포트가 있어도 준비된 포트는 바로 청크 · 늦은 포트는 준비되면 합류 · 청크는 포트당 1개만 진행
  const T = fakeTimers(), a = delayedPort(T), lateRes = [];
  const b = { log: [], send(msg) { this.log.push(msg); return msg.type === 'scene' ? new Promise((res) => lateRes.push(() => res({ sceneKey: msg.sceneKey, ready: true }))) : new Promise((res) => T.setTimeout(() => res(make(msg)), 100)); } };
  const P = createProgressive({ ports: [a, b], timers: T, opts: OPT });
  P.restart(job(1)); await T.advance(500 + 350);
  ok(P.snapshot().state === 'running' && chunks(a).length === 4 && chunks(b).length === 0, `늦은 포트 기다리지 않음: a 청크 ${chunks(a).length}개, b 0개`);
  lateRes.shift()(); await T.advance(0);
  ok(chunks(b).length === 1, 'b 장면 준비 → b 청크 시작');
  const m = manualPort();
  const Q = createProgressive({ ports: [m], timers: T, opts: OPT });
  Q.restart(job(1)); await T.advance(500);
  Q.restart(job(2)); await T.advance(500);
  const seq = m.log.map((x) => x.type).join(',');
  ok(seq === 'scene,chunk,scene,chunk' && m.log[3].sceneKey === 's2', `다시 시작: 진행 중 청크 1개 뒤에 새 장면, 그다음 새 청크 (${seq})`);
  Q.cancel(); P.cancel();
}
{ // 목표 바로 아래면 1% 에서 멈추지 않고 0.5% 까지(2026-11-03) · 통과면 그대로 멈춤
  const fr = (x) => x - Math.floor(x), noisy = (msg) => ({ ...make(msg), acc: Float64Array.from({ length: 8 }, (_, k) => (k < 2 ? 0.85 : 1) * (1 + 0.3 * (fr(Math.sin(msg.seed * 12.9898 + k * 78.233) * 43758.5) - 0.5))) });
  const port = (T) => { const log = []; return { log, send(msg) { log.push(msg); return msg.type === 'scene' ? Promise.resolve({ sceneKey: msg.sceneKey, ready: true }) : new Promise((res) => T.setTimeout(() => res(noisy(msg)), 100)); } }; };
  const T = fakeTimers(), P = createProgressive({ ports: [port(T)], timers: T, opts: { ...OPT, targetNoise: 0.02 } });
  P.restart(job(1)); await T.advance(30000);
  const s0 = P.snapshot(), tg = s0.stats.Ulen + 0.01;
  ok(s0.state === 'done' && s0.stats.relNoise < 0.02 && s0.stats.relNoise >= 0.005, `겨우 통과(${(s0.stats.Ulen * 100).toFixed(1)}% ± ${(s0.stats.seLen * 100).toFixed(1)}%p): 2% 에서 멈추지 않고 오차 ±1.0%p 쪽으로 더 계산, 0.5% 아래로는 안 감 (2026-11-17, ${(s0.stats.relNoise * 100).toFixed(2)}%)`);
  P.setJudge({ obs: { ...obs, targetLen: tg } });
  ok(P.snapshot().state === 'running' && P.snapshot().targetNoise === 0.005, '목표를 바로 위로 올리면 0.5% 까지 계산 재개');
  P.cancel();
  const T2 = fakeTimers(), Q = createProgressive({ ports: [port(T2)], timers: T2, opts: { ...OPT, targetNoise: 0.02 } });
  Q.restart({ ...job(2), obs: { ...obs, targetLen: 1.02 } }); await T2.advance(5000);
  const s1 = Q.snapshot();
  ok(s1.state === 'done' && s1.targetNoise === 0.02 && s1.stats.relNoise > 0.005, `먼 미달: 설정한 노이즈에서 멈춤 (길이 ${s1.stats.Ulen.toFixed(2)})`);
  Q.cancel();
}
{ // 기구 최적화 최종 판정 값 인계: 청크 없이 끝난 계산이 되고, 판정과 같은 균일도 · 격자가 다르면 무시
  const T = fakeTimers(), a = delayedPort(T), P = createProgressive({ ports: [a], timers: T, opts: OPT });
  const batches = Array.from({ length: 10 }, (_, b) => ({ acc: Float64Array.from({ length: 8 }, (_, k) => (k < 2 ? 0.8 : 1) * (1 + 0.001 * Math.sin(b + k)) * 5e5), accAll: new Float64Array(8), cnt: new Float64Array(8).fill(50), n: 5, photons: 5e5 }));
  const seed = { batches, ledger: { emitted: 5e6, escaped: 2.5e6 }, leak: {}, paths: { ':0': 5e6 }, nCell: 8, photons: 5e6 };
  const want = tallyStats(G, batches.map((b) => b.acc), obs);
  P.restart(job(9), () => seed); await T.advance(500); await settle();
  const sn = P.snapshot();
  ok(sn.state === 'done' && sn.reason === 'adopted' && chunks(a).length === 0 && Math.abs(sn.stats.Ulen - want.Ulen) < 1e-9 && Math.abs(sn.stats.Uwid - want.Uwid) < 1e-9 && sn.photons === 5e6 && scenes(a).length === 1, `인계 값 = 판정 값 ${sn.stats?.Ulen?.toFixed(4)}`);
  P.restart(job(10), () => ({ ...seed, nCell: 99 })); await T.advance(500); await settle();
  ok(P.snapshot().state === 'running' && chunks(a).length > 0, '격자가 다른 값은 무시 — 새로 계산');
  // 대칭 도면이어도 인계 값은 합치지 않음(2026-11-17 사용자: 링 적용 뒤 ④ 80.1% ≠ 판정 78.6% — 최종 판정은 전체 영역)
  const sb = Array.from({ length: 10 }, (_, b) => ({ acc: Float64Array.from({ length: 8 }, (_, k) => (k < 2 || k >= 6 ? 0.8 : 1) * (1 + 0.02 * Math.sin(b * 3 + k * 1.7)) * 5e5), accAll: new Float64Array(8), cnt: new Float64Array(8).fill(50), n: 5, photons: 5e5 }));
  const sWant = tallyStats(G, sb.map((b) => b.acc), obs);
  P.restart({ ...job(11), sym: { len: true, wid: true, rot: 0, why: [] } }, () => ({ ...seed, batches: sb })); await T.advance(500); await settle();
  const ss = P.snapshot();
  ok(ss.reason === 'adopted' && Math.abs(ss.stats.Ulen - sWant.Ulen) < 1e-9 && Math.abs(ss.stats.Uwid - sWant.Uwid) < 1e-9 && !ss.stats.sym, `대칭 도면 인계 값 = 판정 값(합치지 않음): ${ss.stats?.Ulen?.toFixed(4)} / ${sWant.Ulen.toFixed(4)}`);
  P.dispose(); }
{ // 결과 파일 저장(2026-11-22 사용자) — 끝난 계산을 내보내 .uds 에 넣고, 열면 청크 없이 같은 판정·지도. 대칭 합치기 계산이면 합친 그대로
  const { seedToJson, seedFromJson } = await import('../src/ui/m3/progressive.js');
  for (const sym of [null, { len: true, wid: true, rot: 0, why: [] }]) {
    const T = fakeTimers(), a = delayedPort(T), P = createProgressive({ ports: [a], timers: T, opts: { ...OPT, fixedChunk: false } });
    const G2 = { ...G, validAll: new Uint8Array(8).fill(1), areaAll: new Float64Array(8).fill(1) };
    const jb = (k) => ({ ...job(k), G: G2, sym });
    ok(P.exportSeed() === null, '계산 전 = 내보낼 것 없음');
    P.restart(jb(30)); await T.advance(4000); await settle();
    const s0 = P.snapshot();
    const ex = P.exportSeed(), js = JSON.parse(JSON.stringify(seedToJson(ex)));
    ok(s0.state === 'done' && ex && ex.nCell === 8 && typeof js.batches[0].acc === 'string', `끝난 계산 내보내기 (${s0.reason} · 광자 ${s0.photons}) · 글로 바꿈`);
    const b = fakeTimers(), q = delayedPort(b), Q = createProgressive({ ports: [q], timers: b, opts: { ...OPT, fixedChunk: false } });
    Q.restart(jb(31), () => seedFromJson(js)); await b.advance(500); await settle();
    const s1 = Q.snapshot(), d = (x, y) => Math.abs(x - y) < 1e-5;
    ok(s1.state === 'done' && s1.reason === 'restored' && chunks(q).length === 0 && s1.photons === s0.photons && d(s1.stats.Ulen, s0.stats.Ulen) && d(s1.stats.Uwid, s0.stats.Uwid) && d(s1.stats.relNoise, s0.stats.relNoise) && !!s1.stats.sym === !!s0.stats.sym,
      `${sym ? '대칭' : '일반'}: 연 결과 = 저장한 결과 (길이 ${s1.stats?.Ulen?.toFixed(4)} / ${s0.stats.Ulen.toFixed(4)} · 청크 ${chunks(q).length})`);
    ok([...s1.stats.mapAll].every((v, k) => d(v, s0.stats.mapAll[k])) && d(s1.photometry.eff, s0.photometry.eff), '2D 지도 · 광 효율도 같음');
    P.dispose(); Q.dispose();
  }
}
{ // 중지 = 결과는 남고 이어서 못 함 · 다음 실행은 처음부터 계산(일시정지처럼 멈춰 있지 않음)
  const T = fakeTimers(), a = delayedPort(T), P = createProgressive({ ports: [a], timers: T, opts: OPT });
  P.restart(job(21)); await T.advance(1200); await settle();
  P.stop(); const s = P.snapshot(); ok(s.state === 'paused' && s.stopped === true, '중지 표시');
  P.restart(job(22)); await T.advance(1200); await settle();
  const s2 = P.snapshot(); ok(s2.state === 'running' && s2.stopped === false, `중지 뒤 실행 = 새 계산 (${s2.state})`);
  P.pause(); P.restart(job(23)); await T.advance(1200); await settle();
  ok(P.snapshot().state === 'paused', '일시정지는 다시 시작 뒤에도 유지(기존 동작)');
  P.dispose(); }
{   // GPU 가 청크 중에 멈춤(2026-11-12) — 청크에 cpuMax 를 실어 보내고, gpuRetry 응답이면 실패 없이 CPU 크기(최소 청크)로 이어 감
  const T = fakeTimers(), m = manualPort();
  const P = createProgressive({ ports: [m], timers: T, opts: { ...OPT, fixedChunk: false, minChunk: 1000, maxChunk: 50000 } });
  P.restart(job(1)); await T.advance(500);
  const c0 = chunks(m)[0];
  ok(c0.cpuMax === 50000, `청크 메시지에 cpuMax = maxChunk (${c0.cpuMax})`);
  m.pend.shift().res({ sceneKey: c0.sceneKey, gpuRetry: true }); await T.advance(1);
  const s = P.snapshot();
  ok(s.state === 'running' && s.photons === 0 && chunks(m).length === 2 && chunks(m)[1].N === 1000, `gpuRetry → 실패 없이 다시 보냄, 광자 안 셈 (${s.state}, N=${chunks(m)[1]?.N})`);
  P.dispose();
}
{   // 쉬던 포트가 계산 중에 깨어남(2026-11-12, GPU 꺼짐 → CPU 포트가 이어 받음) — 다음 틱에 그 포트에도 청크를 보냄
  const T = fakeTimers(), a = delayedPort(T, 100), c = delayedPort(T, 100);
  let off = true; c.off = () => off;
  const P = createProgressive({ ports: [a, c], timers: T, opts: { ...OPT, targetNoise: 1e-9 } });
  P.restart(job(1)); await T.advance(500 + 1500);
  ok(chunks(a).length > 0 && chunks(c).length === 0, '쉬는 포트에는 청크 안 보냄');
  off = false; await T.advance(1500);
  ok(chunks(c).length > 0, `깨어난 포트에 다음 틱부터 청크 보냄 (${chunks(c).length}개)`);
  P.dispose();
}
// 2026-11-18 사용자: 광효율 1% 미만 = 자동 미리보기(칸 3 mm · 노이즈 2% · 판정 안 함) · [정밀 계산] = 원래대로
{ ok(PREVIEW.cell === 3 && PREVIEW.noise === 0.02 && PREVIEW.effOn === 0.01, '미리보기 = 칸 3 mm · 노이즈 2% · 광효율 1% 미만');
  ok(previewWanted('auto', 0.006, false) === true && previewWanted('auto', 0.02, false) === false, '자동: 1% 미만이면 켬, 넘으면 끔');
  ok(previewWanted('precise', 0.001, true) === false, '[정밀 계산] 누르면 광효율이 낮아도 끔');
  ok(previewWanted('auto', 0.011, true) === true && previewWanted('auto', 0.011, false) === false && previewWanted('auto', 0.013, true) === false, '1.0~1.2% 사이는 지금 상태 유지(왔다 갔다 안 함)');
  ok(previewWanted('auto', NaN, true) === true && previewWanted('auto', undefined, false) === false, '광효율을 아직 모르면 그대로');
  const T = fakeTimers(), a = manualPort();
  const P = createProgressive({ ports: [a], timers: T, opts: { ...OPT, targetNoise: 0.01 } });
  P.restart({ ...job(1), preview: true }); await T.advance(500);
  for (let k = 0; k < 2; k++) { a.pend.shift().res(make(chunks(a).at(-1))); await T.advance(0); }
  const s1 = P.snapshot();
  ok(s1.preview === true && s1.targetNoise === 0.02 && s1.stats?.preview === true, `미리보기 작업: 노이즈 목표 2% 고정 · 결과에 미리보기 표시 (${s1.targetNoise})`);
  P.restart(job(2)); await T.advance(500); a.pend.shift().res(make(chunks(a).at(-1))); await T.advance(0);
  ok(!P.snapshot().preview && !P.snapshot().stats?.preview, '보통 작업은 미리보기 아님');
  P.cancel();
}
done();
