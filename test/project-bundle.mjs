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
// STEP 도면은 반드시 함께(2026-11-13 사용자 결정): 빠지면 저장 안 함 · 덮어쓸 파일 안의 도면은 되살림 · 쓰는 도면은 보관 한도에서 안 밀림
{ const { pickSources, bundleProject, dropKeys } = await import('../src/ui/step-sources.js');
  const gz = await gzipBlob(new Blob(['MECH;\n'])), M = { name: 'c.stp', parts: [1], light: { kind: 'none' } };
  ok(JSON.stringify(pickSources({ mech3d: M }, new Map()).lack) === JSON.stringify([{ role: 'mech', name: 'c.stp' }]), '빠진 도면 = 역할·이름');
  let err = null; try { await bundleProject({ mech3d: M }, '{}', null, new Map()); } catch (e) { err = e; }
  ok(err?.missingStep?.join() === 'c.stp', `원본 없음 = 저장 거부(${err?.message})`);
  const prev = await packBundle('{"old":1}', [{ role: 'mech', name: 'c.stp', size: 6, lastModified: 5, gz }]), have = new Map(), kept = [];
  const keep = async (role, file, g) => { kept.push(role + ':' + file.name); have.set(`${role}:${file.name}`, { role, name: file.name, size: file.size, lastModified: file.lastModified, gz: g }); };
  const B = await bundleProject({ mech3d: M }, '{"new":1}', prev, have, keep), U = await unpackBundle(B);
  ok(kept.join() === 'mech:c.stp' && U.text === '{"new":1}' && U.files.length === 1 && await U.files[0].file.text() === 'MECH;\n', '덮어쓸 .uds 안의 도면을 되살려 함께 저장');
  err = null; try { await bundleProject({ mech3d: { ...M, name: 'd.stp' } }, '{}', prev, new Map(), keep); } catch (e) { err = e; }
  ok(err?.missingStep?.join() === 'd.stp', '덮어쓸 파일에도 없으면 거부');
  ok(await bundleProject({ mode: 'flat' }, 'T', null, new Map()) instanceof Blob, '도면 없는 프로젝트 = 그대로 저장');
  ok(dropKeys(['a', 'b', 'c', 'd'], new Set(['a', 'b']), 2).join() === 'c,d', '보관 한도: 오래된 것부터 버리되');
  ok(dropKeys(['a', 'b', 'c'], new Set(['a', 'b', 'c']), 2).length === 0, '지금 쓰는 도면은 한도를 넘어도 안 버림'); }
// 원본도 덮어쓸 파일도 없으면 묻지 않고 화면 형상으로 만든 STEP 을 넣음(fallback) — 그것도 없을 때만 거부
{ const { bundleProject } = await import('../src/ui/step-sources.js');
  const M = { name: 'e.stp', parts: [1], light: { kind: 'none' } }, have = new Map(), asked = [];
  const fb = async (lack) => { for (const l of lack) { asked.push(l.name); have.set(`${l.role}:${l.name}`, { role: l.role, name: l.name, size: 4, lastModified: 1, gz: await gzipBlob(new Blob(['SCR;'])) }); } };
  const U = await unpackBundle(await bundleProject({ mech3d: M }, 'T', null, have, undefined, fb));
  ok(asked.join() === 'e.stp' && U.files.length === 1 && await U.files[0].file.text() === 'SCR;', '원본 없음 = 화면 형상 STEP 으로 함께 저장(묻지 않음)'); }
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
// 예제 = .uds(2026-11-12) — 목록이 .uds 를 가리키고, 각 파일에 기구(+LED) STEP 원본과 설정(보관분)
{ const { readFileSync } = await import('node:fs'), list = JSON.parse(readFileSync('examples/index.json', 'utf8'));
  for (const ex of list) {
    const P = JSON.parse(readFileSync(ex.project.replace(/[^/]+$/, 'project.json'), 'utf8')), U = await unpackBundle(new Blob([readFileSync(ex.project)])), S = JSON.parse(U.text);
    const roles = U.files.map((f) => f.role).join(), want = P.led ? 'mech,led' : 'mech';
    let same = true; for (const f of U.files) same &&= readFileSync(f.role === 'mech' ? P.mech : P.led).equals(Buffer.from(await f.file.arrayBuffer()));
    ok(/\.uds$/.test(ex.project) && roles === want && same && S.mode === 'mech3d' && !S.mech3d && JSON.stringify(S.mech3dPending ?? null) === JSON.stringify(P.mech3d ?? null), `예제 ${ex.id}: .uds · 도면 ${roles} · 설정 보관분`);
  } }
// STEP 도면은 반드시 함께(2026-11-13 사용자 결정): 빠지면 저장 안 함 · 덮어쓸 파일 안의 도면은 되살림 · 쓰는 도면은 보관 한도에서 안 밀림
{ const { pickSources, bundleProject, dropKeys } = await import('../src/ui/step-sources.js');
  const gz = await gzipBlob(new Blob(['MECH;\n'])), M = { name: 'c.stp', parts: [1], light: { kind: 'none' } };
  ok(JSON.stringify(pickSources({ mech3d: M }, new Map()).lack) === JSON.stringify([{ role: 'mech', name: 'c.stp' }]), '빠진 도면 = 역할·이름');
  let err = null; try { await bundleProject({ mech3d: M }, '{}', null, new Map()); } catch (e) { err = e; }
  ok(err?.missingStep?.join() === 'c.stp', `원본 없음 = 저장 거부(${err?.message})`);
  const prev = await packBundle('{"old":1}', [{ role: 'mech', name: 'c.stp', size: 6, lastModified: 5, gz }]), have = new Map(), kept = [];
  const keep = async (role, file, g) => { kept.push(role + ':' + file.name); have.set(`${role}:${file.name}`, { role, name: file.name, size: file.size, lastModified: file.lastModified, gz: g }); };
  const B = await bundleProject({ mech3d: M }, '{"new":1}', prev, have, keep), U = await unpackBundle(B);
  ok(kept.join() === 'mech:c.stp' && U.text === '{"new":1}' && U.files.length === 1 && await U.files[0].file.text() === 'MECH;\n', '덮어쓸 .uds 안의 도면을 되살려 함께 저장');
  err = null; try { await bundleProject({ mech3d: { ...M, name: 'd.stp' } }, '{}', prev, new Map(), keep); } catch (e) { err = e; }
  ok(err?.missingStep?.join() === 'd.stp', '덮어쓸 파일에도 없으면 거부');
  ok(await bundleProject({ mode: 'flat' }, 'T', null, new Map()) instanceof Blob, '도면 없는 프로젝트 = 그대로 저장');
  ok(dropKeys(['a', 'b', 'c', 'd'], new Set(['a', 'b']), 2).join() === 'c,d', '보관 한도: 오래된 것부터 버리되');
  ok(dropKeys(['a', 'b', 'c'], new Set(['a', 'b', 'c']), 2).length === 0, '지금 쓰는 도면은 한도를 넘어도 안 버림'); }
// 원본도 덮어쓸 파일도 없으면 묻지 않고 화면 형상으로 만든 STEP 을 넣음(fallback) — 그것도 없을 때만 거부
{ const { bundleProject } = await import('../src/ui/step-sources.js');
  const M = { name: 'e.stp', parts: [1], light: { kind: 'none' } }, have = new Map(), asked = [];
  const fb = async (lack) => { for (const l of lack) { asked.push(l.name); have.set(`${l.role}:${l.name}`, { role: l.role, name: l.name, size: 4, lastModified: 1, gz: await gzipBlob(new Blob(['SCR;'])) }); } };
  const U = await unpackBundle(await bundleProject({ mech3d: M }, 'T', null, have, undefined, fb));
  ok(asked.join() === 'e.stp' && U.files.length === 1 && await U.files[0].file.text() === 'SCR;', '원본 없음 = 화면 형상 STEP 으로 함께 저장(묻지 않음)'); }
// 여는 중 안내 띠(2026-11-13) — .uds 안의 STEP 을 읽는 동안 '찾을 수 없음' 대신 '읽는 중'
{ const { pendingBanner } = await import('../src/ui/pending-banner.js');
  const P = { name: 'a.stp', parts: [1, 2] };
  ok(pendingBanner(null, null).hidden, '보관 설정 없음 = 띠 숨김');
  const miss = pendingBanner(P, null);
  ok(!miss.hidden && !miss.reading && /찾을 수 없음/.test(miss.text), '읽는 중 아님 = 찾을 수 없음 + 단추');
  const rd = pendingBanner(P, { name: 'a.stp', size: 6.2e6 });
  ok(!rd.hidden && rd.reading && /읽는 중/.test(rd.text) && /a\.stp/.test(rd.text) && /6\.2 MB/.test(rd.text) && !/찾을 수 없음/.test(rd.text), '.uds 안 STEP 읽는 중 = 읽는 중 안내(이름·크기), 단추 숨김'); }
process.exitCode = fail ? 1 : 0;
// 변환 결과 저장 기준(2026-11-13) — 2 MB 이상(불러오기 화면이 뜨는 크기)이면 저장해 두고, 같은 .uds 를 다시 열 때 바로
{ const { cacheWorthy } = await import('../src/engine/mech3d/step-cache.js');
  ok(cacheWorthy({ size: 3e6 }) && cacheWorthy({ size: 2e6 }) && !cacheWorthy({ size: 1.9e6 }), '2 MB 이상 STEP = 변환 결과 저장'); }
process.exitCode = fail ? 1 : 0;
