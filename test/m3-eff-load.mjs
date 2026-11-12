// 광효율 → 계산 속도 배지(순수, 2026-11-12): node test/m3-eff-load.mjs
import { effLoad } from '../src/ui/m3/results-panel.js';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fail++; };
const run = { state: 'running', progress: 20, photons: 1.5e8, stats: { relNoise: 0.03 }, targetNoise: 0.015 };
ok(effLoad(0.08, run, 60).text === '', '광효율 5% 이상 → 표시 없음(글 줄이기)');
const a = effLoad(0.03, run, 60);
ok(a.cls === 'near' && a.text === '계산 느림 · 남은 4분', `1~5% → 노랑 '계산 느림' (${a.text})`);
const b = effLoad(0.009, run, 60);
ok(b.cls === 'bad' && b.text === '계산 매우 느림 · 남은 4분', `1% 미만 → 빨강 + 남은 시간(경과 60초 × 80/20) (${b.text})`);
ok(b.title === '광선 1만 개 중 90개만 쓰임 · 목표까지 약 6.0억 광선', `툴팁 한 줄 (${b.title})`);
ok(effLoad(0.009, { ...run, state: 'done', progress: 100 }, 600).text === '계산 매우 느림', '끝난 뒤 → 남은 시간 없음');
ok(effLoad(NaN, run, 60).text === '', '광효율 모름 → 표시 없음');
ok(effLoad(0.009, { ...run, progress: 0.5 }, 5).text === '계산 매우 느림', '진행 1% 미만 → 남은 시간 아직 안 셈');
console.log(fail ? `${fail} FAIL` : 'all PASS'); process.exit(fail ? 1 : 0);
