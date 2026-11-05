// 큰 STEP 불러오기(2026-11-05) — 단계 알림 · 거친 미리보기 · 부품별 진행 · 큰 파일 메시 완화: node test/step-import-progress.mjs
import initOpenCascade from 'opencascade.js/dist/node.js';
import { shapesToStepText } from '../src/export/oc-build.js';
import { readStepParts, stepProfile } from '../src/engine/shape/step-import.js';
import { loadPct, stageEstimateSec, stepTimingText } from '../src/engine/shape/step-load-plan.js';
import { meshVolume } from '../src/engine/mech3d/mesh.js';
import { buildSampleShapes } from './fixtures/mech3d-sample.mjs';
import { ok, done } from './mech3d-util.mjs';

ok(!stepProfile(9e6).preview && !stepProfile(9e6).big, '작은 파일 = 지금 그대로');
ok(stepProfile(11e6).preview && !stepProfile(11e6).big, '10 MB 이상 = 미리보기, 메시는 그대로');
ok(stepProfile(31e6).preview && stepProfile(31e6).big, '30 MB 이상 = 미리보기 + 메시 완화');

{ // 진행률: 단계가 지날수록 늘고 100 을 넘지 않음
  const ks = ['oc', 'read', 'transfer', 'preview', 'mesh', 'prep'], v = ks.flatMap((k) => [loadPct(k, 0), loadPct(k, 0.5), loadPct(k, 1)]);
  ok(v.every((x, i) => i === 0 || x >= v[i - 1]) && v[0] === 0 && v[v.length - 1] <= 100, `단계 순서대로 증가 ${v.join(',')}`);
  ok(loadPct('mesh', 2) === loadPct('mesh', 1) && loadPct('mesh', -1) === loadPct('mesh', 0), '범위 밖 값은 잘림');
  ok(stageEstimateSec('transfer', 100e6) > stageEstimateSec('read', 100e6) && stageEstimateSec('read', 100e6) > stageEstimateSec('read', 10e6), '추정 시간 = 파일 크기·단계에 비례');
  const t = stepTimingText({ oc: 1000, read: 2500, transfer: 60000, mesh: 125000 });
  ok(/해석 3초/.test(t) && /형상 변환 1분 0초/.test(t) && /메시 2분 5초/.test(t) && !/미리보기/.test(t), `단계별 시간 문구: ${t}`);
}

const oc = await initOpenCascade();
const text = shapesToStepText(oc, buildSampleShapes(oc, { cylinder: true }));
const plain = readStepParts(oc, text);

{ // 작은 파일: 알림은 오되 미리보기 없음
  const st = [], pv = [], pp = [];
  const r = readStepParts(oc, text, { onStage: (k) => st.push(k), onPreview: (m) => pv.push(m), onPart: (i, n) => pp.push([i, n]) });
  ok(st.join() === 'read,transfer,mesh', `단계 ${st.join()}`);
  ok(!pv.length && pp.length === r.length && pp.at(-1)[0] === r.length && pp.at(-1)[1] === r.length, '부품별 진행, 미리보기 없음');
}
{ // 미리보기 후에도 최종 메시 = 미리보기 없을 때와 같음(10~30 MB 도 판정 값 그대로)
  const st = [], pv = [];
  const r = readStepParts(oc, text, { profile: { preview: true, big: false }, onStage: (k) => st.push(k), onPreview: (m, i, n) => pv.push({ m, i, n }) });
  ok(st.join() === 'read,transfer,preview,mesh', `단계 ${st.join()}`);
  ok(pv.length >= 1 && pv.at(-1).i === r.length && pv.at(-1).n === r.length && pv.every(({ m }) => m.positions.length > 0 && m.faceIds.length === m.triangles.length / 3), '미리보기 묶음이 전체 부품까지 옴');
  ok(r.every((p, i) => p.triangles.length === plain[i].triangles.length && p.positions.length === plain[i].positions.length && p.faceCount === plain[i].faceCount), '최종 메시 = 미리보기 없을 때와 같음');
  ok(pv.reduce((s, { m }) => s + m.triangles.length, 0) < plain.reduce((s, p) => s + p.triangles.length, 0) * 1.01, '미리보기는 최종보다 거칠거나 같음');
}
{ // 큰 파일: 삼각형 ↓, 면 구조·부피는 유지
  const r = readStepParts(oc, text, { profile: { preview: true, big: true } });
  const sum = (a) => a.reduce((s, p) => s + p.triangles.length / 3, 0);
  ok(sum(r) <= sum(plain), `삼각형 ${sum(plain)} → ${sum(r)}`);
  ok(r.every((p, i) => p.faceCount === plain[i].faceCount && p.faceIds.length === p.triangles.length / 3), '면 번호 유지');
  ok(r.every((p) => Math.abs(meshVolume(p.positions, p.triangles) / p.volume - 1) < 0.01), '부피 차 1% 안');
}
done();
