// 프로젝트 통합 파일(.uds, 2026-11-12) — 프로젝트 JSON + STEP 원본(gzip)을 한 파일로. 옛 .json 도 그대로 열림
import { gzipBlob, packBundle, isBundle, unpackBundle } from '../src/ui/project-bundle.js';
let fail = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fail++; };
const step = 'ISO-10303-21;\n' + 'DATA;\n#1=CARTESIAN_POINT(\'\',(0.,0.,0.));\n'.repeat(2000) + 'END-ISO-10303-21;\n';
const mech = { role: 'mech', name: '기구.stp', size: step.length, lastModified: 123, gz: await gzipBlob(new Blob([step])) };
const led = { role: 'led', name: 'led.stp', size: 5, lastModified: 7, gz: await gzipBlob(new Blob(['LED;\n'])) };
ok(mech.gz.size < step.length / 5, `STEP 압축 (${step.length} → ${mech.gz.size} B)`);
const text = JSON.stringify({ mode: 'mech3d', 이름: '한글' });
const B = await packBundle(text, [mech, led]);
ok(B instanceof Blob && await isBundle(B), '통합 파일 = 표식으로 알아봄');
ok(!(await isBundle(new Blob([text]))), '옛 JSON = 통합 파일 아님');
const U = await unpackBundle(B);
ok(U.text === text, '프로젝트 JSON 그대로');
ok(U.files.length === 2 && U.files[0].role === 'mech' && U.files[1].role === 'led', '도면 순서·역할');
ok(await U.files[0].file.text() === step && U.files[0].file.name === '기구.stp' && U.files[0].file.lastModified === 123, '기구 STEP 원본 복원(이름·시각)');
ok(await U.files[1].file.text() === 'LED;\n', 'LED STEP 원본 복원');
ok(U.files[0].gz.size === mech.gz.size, '압축본도 넘겨줌(다시 저장할 때 재압축 없음)');
const E = await unpackBundle(await packBundle(text, []));
ok(E.text === text && E.files.length === 0, '도면 없는 통합 파일');
let threw = false; try { await unpackBundle(new Blob([B.slice(0, 20)])); } catch { threw = true; }
ok(threw, '잘린 파일 = 오류');
process.exitCode = fail ? 1 : 0;
// 저장할 도면 고르기(순수) — 기구 STEP(합친 순서) + 따로 불러온 LED STEP. 도면 안 LED(fromMech)·원본 없는 도면은 뺌
{ const { pickSources } = await import('../src/ui/step-sources.js');
  const S = (role, name) => ({ role, name, size: 1, lastModified: 0, gz: new Blob(['x']) }), have = new Map([['mech:a.stp', S('mech', 'a.stp')], ['mech:b.stp', S('mech', 'b.stp')], ['led:led.stp', S('led', 'led.stp')]]);
  const M = { name: 'a.stp', parts: [1, 2], sources: [{ name: 'a.stp', parts: 1 }, { name: 'b.stp', parts: 1 }], light: { kind: 'step', step: { name: 'led.stp' } } };
  const r = pickSources({ mech3d: M }, have);
  ok(r.files.map((f) => `${f.role}:${f.name}`).join() === 'mech:a.stp,mech:b.stp,led:led.stp' && !r.missing.length, `기구 2개(순서) + LED (${r.files.map((f) => f.name)})`);
  ok(pickSources({ mech3d: null, mech3dPending: M }, have).files.length === 3, '보관 중인 설정도 같은 도면');
  ok(pickSources({ mech3d: { ...M, light: { kind: 'step', step: { name: 'a.stp', fromMech: [0] } } } }, have).files.length === 2, '도면 안 LED = LED 파일 없음');
  const m = pickSources({ mech3d: { name: 'c.stp', parts: [1], light: { kind: 'none' } } }, have);
  ok(!m.files.length && m.missing.join() === 'c.stp', '원본이 없는 도면 = 빠진 목록');
  ok(!pickSources({ mode: 'flat' }, have).files.length, '3D 도면 없음 = 빈 목록'); }
process.exitCode = fail ? 1 : 0;
