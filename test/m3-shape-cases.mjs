// 형상 후보 표(2026-11-05) — 마지막 최적화 1회분. 후보를 합치고 정렬하고, 조건이 바뀌었는지 알아냄
import { caseKey, mergeCaseRows, sortCaseRows, caseFp, shapeCasesHtml } from '../src/ui/m3/shape-cases.js';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok', m); };

const c1 = { dt: 0, h: 0, R: 3, e: 0, c: 0 }, c2 = { dt: 1.15, h: 1.5, R: 5.8, e: 0, c: 0 }, c3 = { dt: 0.5, h: 0, R: 3, e: 0, c: 0 };
ok(caseKey(c2) === caseKey({ ...c2, kF: null }) && caseKey(c1) !== caseKey(c3), '후보 구분 = 형상 숫자');

{ // 같은 후보는 광선이 많은 쪽 값, 정식 값은 유지
  const a = mergeCaseRows([], [{ c: c2, Ulen: 0.7, Uwid: 0.6, ok: true, N: 1e5 }, { c: c2, Ulen: 0.74, Uwid: 0.63, ok: true, N: 1e6 }, { c: c2, Ulen: 0.5, Uwid: 0.5, ok: true, N: 1e4 }]);
  ok(a.length === 1 && a[0].Ulen === 0.74 && a[0].N === 1e6, '많은 광선 값이 남음');
  const b = mergeCaseRows([{ ...a[0], exact: { Ulen: 0.75, Uwid: 0.64, eff: 0.6 } }], [{ c: c2, Ulen: 0.72, Uwid: 0.62, ok: true, N: 2e6 }, { c: c3, Ulen: 0.6, Uwid: 0.5, ok: true, N: 1e5 }]);
  ok(b.length === 2 && b.find((r) => r.c === c2 || caseKey(r.c) === caseKey(c2)).exact?.Ulen === 0.75, '정식 값 유지 · 새 후보 추가');
}
{ // 정렬: 탈락은 어느 정렬에서도 맨 아래, 같은 값이면 균일도 높은 쪽 먼저
  const rows = [{ c: c2, Ulen: 0.8, Uwid: 0.7, ok: true }, { c: { ...c3, dt: 9 }, ok: false, why: '간섭' }, { c: c3, Ulen: 0.7, Uwid: 0.6, ok: true }, { c: c1, Ulen: 0.6, Uwid: 0.5, ok: true }];
  const key = (r) => r.map((x) => x.c.dt).join();
  ok(key(sortCaseRows(rows, { key: 'dt', dir: 1 })) === '0,0.5,1.15,9', '두께 증가 작은 순, 탈락 맨 아래');
  ok(key(sortCaseRows(rows, { key: 'Ulen', dir: -1 })) === '1.15,0.5,0,9', '길이 균일도 높은 순, 탈락 맨 아래');
  const e = sortCaseRows([{ c: c1, Ulen: 0.6, Uwid: 0.5, ok: true }, { c: c3, Ulen: 0.7, Uwid: 0.5, ok: true, exact: { Ulen: 0.5, Uwid: 0.5 } }], { key: 'Ulen', dir: -1 });
  ok(e[0].c === c1, '정식 값이 있으면 그 값으로 정렬');
  ok(rows[0].c === c2, '원본 순서 그대로');
}
{ // 조건 지문: 판정 수치를 바꾸는 것만 반응
  const M = () => ({ parts: [{ name: 'a', material: { kind: 'milky', milky: 2 }, finish: { kind: 'mirror' }, shapeMod: { dt: 1 }, volume: 1 }, { name: 'b', material: { kind: 'clear' }, shapeMod: { dt: 2 } }], light: { kind: 'step', pcbR: 0.3 }, observe: { kind: 'plane', targetLen: 0.8, targetWid: 0.8, targetNoise: 0.01, quality: 'low', length: 100 }, viewState: { hidden: [1] }, contacts: [1], shapeCases: { rows: [] } });
  const f0 = caseFp(M(), 0), ch = (fn) => { const m = M(); fn(m); return caseFp(m, 0); };
  ok(ch((m) => { m.parts[0].shapeMod = { dt: 5 }; m.parts[0].volume = 9; m.contacts = []; }) === f0, '대상 부품 형상을 적용해도 그대로');
  ok(ch((m) => { m.parts[0].name = 'x'; m.viewState = null; m.shapeCases = null; m.observe.targetLen = 0.9; m.observe.targetWid = 0.7; m.observe.quality = 'high'; }) === f0, '이름·보기·목표·화질은 그대로');
  ok(ch((m) => { m.parts[0].material.milky = 3; }) !== f0, 'Milky 변경 감지');
  ok(ch((m) => { m.parts[0].finish.kind = 'white'; }) !== f0, '면 처리 변경 감지');
  ok(ch((m) => { m.parts[1].shapeMod = { dt: 3 }; }) !== f0, '다른 부품 형상 변경 감지');
  ok(ch((m) => { m.parts[1].untrace = true; }) !== f0, '부품 제외 감지');
  ok(ch((m) => { m.light.pcbOff = true; }) !== f0, 'PCB 제외 감지');
  ok(ch((m) => { m.observe.length = 90; }) !== f0, '관측면 변경 감지');
}
{ // 표
  const cases = { part: 0, fp: 'A', rows: [{ c: c2, Ulen: 0.82, Uwid: 0.81, ok: true, rec: true, exact: { Ulen: 0.81, Uwid: 0.8, eff: 0.6 } }, { c: c3, Ulen: 0.79, Uwid: 0.78, ok: true }, { c: { ...c3, dt: 9 }, ok: false, why: '간섭' }] };
  const v = { cases, fp: 'A', sort: { key: 'dt', dir: 1 }, sel: null, tg: { len: 0.8, wid: 0.8 }, name: '부품 3' };
  const h = shapeCasesHtml(v);
  ok(/data-ad="caseSort"[^>]*data-v="dt"/.test(h) && /data-ad="caseSort"[^>]*data-v="Ulen"/.test(h), '열 제목으로 정렬');
  ok((h.match(/data-ad="casePick"/g) ?? []).length === 2, '탈락 후보는 고를 수 없음');
  ok(/간섭/.test(h) && /≈\s*79/.test(h) && /추천/.test(h), '탈락 이유 · 대략값 표시 · 추천 표시');
  ok(/>81%/.test(h.replace(/ /g, '')) || /81%/.test(h), '정식 값 표시');
  ok(!/data-ad="caseRun"/.test(h), '고르기 전엔 계산 단추 없음');
  ok(!/다시 계산 필요/.test(h), '조건 같으면 경고 없음');
  const key = sortCaseRows(cases.rows, v.sort).findIndex((r) => caseKey(r.c) === caseKey(c3));
  const hs = shapeCasesHtml({ ...v, sel: caseKey(c3) });
  ok(key >= 0 && /data-ad="caseRun"/.test(hs) && /sel/.test(hs), '고르면 이 후보로 계산 단추');
  ok(/다시 계산 필요/.test(shapeCasesHtml({ ...v, fp: 'B' })), '조건이 바뀌면 경고, 값은 그대로 보임');
  ok(/79/.test(shapeCasesHtml({ ...v, fp: 'B' })), '경고 때도 값 표시');
  ok(/함께 돌린/.test(shapeCasesHtml({ ...v, cases: { ...cases, mixed: true } })), '다른 항목과 함께 돌린 실행 안내');
  ok(shapeCasesHtml({ ...v, cases: null }) === '' && shapeCasesHtml({ ...v, cases: { ...cases, rows: [] } }) === '', '없으면 표 없음');
}
if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
console.log('all ok');
