// 커밋 전 검사 묶음: node test/gate.mjs — 6개 검사를 차례로 돌려 요약하고, 실패한 검사의 전체 출력은 test-logs/ 에 남김
// (2026-11-23: test:shape 가 한 번 실패한 뒤 출력을 지워 원인을 못 찾음 — 19번 다시 돌려도 재현 안 됨. 다음엔 기록으로 바로 확인)
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const suites = (process.argv.slice(2).length ? process.argv.slice(2) : ['test:l2', 'test', 'test:m3', 'test:mech3d', 'test:mech3d-mc', 'test:shape']);
let bad = 0;
for (const s of suites) {
  const t0 = Date.now(), r = spawnSync(`npm run -s ${s}`, { shell: true, encoding: 'utf8', maxBuffer: 1 << 28 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`, nFail = (out.match(/FAIL /g) ?? []).length, nPass = (out.match(/PASS /g) ?? []).length;
  const failed = r.status !== 0 || nFail > 0;
  console.log(`${s} exit=${r.status} FAIL=${nFail} PASS=${nPass} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (failed) {
    bad++;
    mkdirSync('test-logs', { recursive: true });
    const f = `test-logs/${new Date().toISOString().replace(/[:.]/g, '-')}_${s.replace(/:/g, '_')}.txt`;
    writeFileSync(f, out);
    for (const l of out.split('\n').filter((l) => /FAIL |Error|error:/.test(l)).slice(0, 10)) console.log(`  ${l}`);
    console.log(`  전체 출력: ${f}`);
  }
}
console.log(bad ? `${bad}개 검사 실패` : 'gate all PASS');
process.exitCode = bad ? 1 : 0;
