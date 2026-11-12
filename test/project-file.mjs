// 프로젝트 파일: 다른 이름 저장 · 실시간 저장 · 열기 · 권한 · 파일 API 없는 브라우저 · 표시 글
import { createProjectFile, projectFileLabel } from '../src/ui/project-file.js';
let fail = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fail++; };
const fakeHandle = (name, init = '') => { const h = { name, text: init, writes: 0, perm: 'granted', failWith: null, queryPermission: async () => h.perm, requestPermission: async () => h.perm, getFile: async () => ({ text: async () => h.text }),
  createWritable: async () => { if (h.failWith) { const e = new Error('막힘'); e.name = h.failWith; throw e; } let b = ''; return { write: async (t) => { b = t; }, close: async () => { h.text = b; h.writes++; } }; } }; return h; };
const timers = () => { let q = []; return { setTimeout: (f) => { q.push(f); return q.length; }, clearTimeout: (i) => { q[i - 1] = null; }, run: async () => { const c = q; q = []; for (const f of c) if (f) await f(); await new Promise((r) => setTimeout(r)); } }; };
const memStore = () => { let v = null; return { get: async () => v, put: async (x) => { v = x; }, del: async () => { v = null; } }; };
{ let text = 'v1', cancel = false; const H = fakeHandle('내 도면.json'), tm = timers(), db = memStore(), states = [];
  const win = { showSaveFilePicker: async (o) => { if (cancel) { const e = new Error('x'); e.name = 'AbortError'; throw e; } ok(o.suggestedName === 'a.json', '기본 이름'); return H; } };
  const P = createProjectFile({ getText: () => text, win, timers: tm, store: db, suggest: () => 'a.json', onState: (s) => states.push(s) });
  P.touched(); await tm.run(); ok(H.writes === 0 && P.state().name === null, '파일 고르기 전 = 파일에 안 씀');
  cancel = true; ok(await P.saveAs() === false && P.state().name === null && !P.state().err, '저장 창 취소 = 오류 없음'); cancel = false;
  ok(await P.saveAs() && H.text === 'v1' && P.state().name === '내 도면.json' && P.state().savedAt, '다른 이름으로 저장 = 파일에 씀 · 이름');
  text = 'v2'; P.touched(); ok(H.text === 'v1', '바로 쓰지 않음(디바운스)'); await tm.run(); ok(H.text === 'v2' && H.writes === 2, '실시간 저장');
  P.touched(); await tm.run(); ok(H.writes === 2, '내용 같으면 쓰기 생략');
  text = 'v3'; await P.save(); ok(H.text === 'v3', 'Ctrl+S = 바로 그 파일에');
  // 새로고침 뒤 이어 쓰기
  const P2 = createProjectFile({ getText: () => text, win, timers: tm, store: db }); await P2.restore();
  ok(P2.state().name === '내 도면.json' && P2.state().perm === 'granted', '새로고침: 파일·권한 이어 받음');
  text = 'v4'; P2.touched(); await tm.run(); ok(H.text === 'v4', '새로고침 뒤에도 실시간 저장');
  H.perm = 'prompt'; const P3 = createProjectFile({ getText: () => text, win, timers: tm, store: db }); await P3.restore();
  text = 'v5'; P3.touched(); await tm.run(); ok(H.text === 'v4' && P3.state().perm === 'prompt', '권한 없음 = 파일에 안 쓰고 표시');
  ok(projectFileLabel(P3.state()).action === 'regrant', '권한 없음 = [다시 켜기]');
  H.perm = 'granted'; await P3.regrant(); ok(H.text === 'v5', '다시 켜면 밀린 내용 저장');
  H.failWith = 'InvalidStateError'; text = 'v6'; P3.touched(); await tm.run(); ok(P3.state().err && projectFileLabel(P3.state()).kind === 'warn' && H.text === 'v5', '쓰기 실패 = 표시');
  H.failWith = null; P3.clear(); ok(P3.state().name === null && !P3.state().hasFile && await db.get() === null, '새 프로젝트 = 파일 연결 해제'); }
{ let opened = null, text = 'cur'; const H = fakeHandle('b.json', '{"x":1}'), tm = timers();
  const P = createProjectFile({ getText: () => text, win: { showOpenFilePicker: async () => [H] }, timers: tm, store: memStore(), onOpen: async (t, n) => { opened = [t, n]; text = t; } });
  ok(await P.open() && opened[0] === '{"x":1}' && opened[1] === 'b.json' && P.state().name === 'b.json', '열기 = 내용 적용 · 이름');
  P.touched(); await tm.run(); ok(H.writes === 0, '연 직후 내용 그대로면 다시 안 씀');
  text = 'edited'; P.touched(); await tm.run(); ok(H.text === 'edited', '연 파일에 실시간 저장');
  const bad = createProjectFile({ getText: () => text, win: { showOpenFilePicker: async () => [fakeHandle('c.json', 'nope')] }, timers: tm, store: memStore(), onOpen: async () => { throw new Error('파싱'); } });
  let threw = false; try { await bad.open(); } catch { threw = true; } ok(threw && bad.state().name === null, '잘못된 파일 = 연결 안 함'); }
{ let dl = null; const P = createProjectFile({ getText: () => 't', win: {}, timers: timers(), store: memStore(), download: (t, n) => { dl = [t, n]; }, ask: () => '내 파일' });
  ok(await P.open() === false, '파일 API 없음 = 열기는 호출자가');
  ok(await P.saveAs() && dl[1] === '내 파일.json' && P.state().name === '내 파일.json' && !P.state().hasFile, '파일 API 없음 = 다운로드 · 이름');
  P.opened('x.json'); ok(P.state().name === 'x.json', '파일 입력으로 연 이름'); }
{ const clk = () => '12:00:00';
  ok(projectFileLabel({ name: null, hasFile: false, browserAt: 1 }, clk).status === '파일로 저장 안 됨 — 창을 닫으면 사라짐' && projectFileLabel({ name: null, hasFile: false }, clk).name === '이름 없는 프로젝트', '파일 없음 표시');
  ok(projectFileLabel({ name: 'a', hasFile: true, perm: 'granted', savedAt: 1 }, clk).status === '자동 저장됨 12:00:00', '자동 저장 시각'); }
// 통합 파일(.uds, 2026-11-12): 쓸 내용 = pack(text, 이름) · 도면 목록이 바뀌어도 다시 씀(extra) · 열 때 read(파일)
{ let text = 'p1', ex = 'a', packed = []; const H = fakeHandle('도면.uds'), tm = timers(), J = fakeHandle('옛.json');
  const win = { showSaveFilePicker: async (o) => { ok(o.types.some((t) => Object.values(t.accept).flat().includes('.uds')) && o.suggestedName === 'x.uds', '저장 창에 .uds 형식 · 기본 이름'); return H; }, showOpenFilePicker: async (o) => { ok(o.types.some((t) => Object.values(t.accept).flat().includes('.uds')) && o.types.some((t) => Object.values(t.accept).flat().includes('.json')), '열기 창 = .uds · .json'); return [J]; } };
  const P = createProjectFile({ getText: () => text, extra: () => ex, pack: async (t, n) => { packed.push(n); return /.uds$/.test(n) ? 'PK:' + t + ':' + ex : t; }, win, timers: tm, store: memStore(), suggest: () => 'x.uds', read: async (f) => 'RAW:' + await f.text(), onOpen: async (t, n) => { text = t; } });
  ok(await P.saveAs() && H.text === 'PK:p1:a' && packed[0] === '도면.uds', '.uds = 묶은 내용으로 저장');
  ex = 'b'; P.touched(); await tm.run(); ok(H.text === 'PK:p1:b', '도면만 바뀌어도 다시 저장');
  P.touched(); await tm.run(); ok(H.writes === 2, '내용·도면 같으면 생략');
  J.text = '{}'; ok(await P.open() && text === 'RAW:{}', '열기 = read(파일) 결과로');
  text = 'p2'; P.touched(); await tm.run(); ok(J.text === 'p2', '옛 .json 파일에는 JSON 그대로'); }
{ let dl = null; const P = createProjectFile({ getText: () => 't', pack: async (t, n) => (/.uds$/.test(n) ? 'PK' : t), win: {}, timers: timers(), store: memStore(), suggest: () => 'a.uds', download: (t, n) => { dl = [t, n]; }, ask: (d) => d });
  ok(await P.saveAs() && dl[0] === 'PK' && dl[1] === 'a.uds', '파일 API 없음 = .uds 다운로드'); }
process.exitCode = fail ? 1 : 0;
