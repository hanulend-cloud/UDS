// 3D 기구 STEP Import — 열린 도면 뒤에 부품 추가, 기존 지정 유지, 여러 파일 프로젝트 복원: node test/mech3d-append.mjs
import { setMech3dMesh, appendMech3dMesh, contactsWithAdded, initialMech3dSpec, getMech3d, applyPartMods } from '../src/engine/mech3d/runtime.js';
import { appendPartsSpec, sourcesOf, restoreStep } from '../src/engine/mech3d/restore.js';
import { ok, done } from './mech3d-util.mjs';

// 바깥 법선 육면체(면 번호 6개)
function box([x0, y0, z0], [x1, y1, z1]) {
  const positions = new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  const triangles = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  return { positions, triangles, faceIds: new Uint32Array([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]), faceCount: 6, volume: (x1 - x0) * (y1 - y0) * (z1 - z0) };
}
const info = (p) => ({ volume: p.volume, size: [10, 10, 10] });
const A = () => box([0, 0, 0], [10, 10, 10]), B = () => box([0, 0, 10], [10, 10, 20]), C = () => box([0, 0, 20], [10, 10, 30]), D = () => box([0, 0, 30], [10, 10, 40]);

setMech3dMesh('a.stp', [A(), B()]);
const M = initialMech3dSpec();
M.parts[0].material = { kind: 'marker' }; M.contacts[0].mode = 'air';
ok(M.contacts.length === 1 && !('sources' in M), '시작: 접촉 1개, 파일 하나면 저장 칸 없음');
ok(sourcesOf(M).length === 1 && sourcesOf(M)[0].name === 'a.stp' && sourcesOf(M)[0].parts === 2, '옛 프로젝트: 파일 하나로 봄');

const add = [C(), D()], pre = [{ a: 0, faceA: 1, b: 1, faceB: 0, area: 100 }];
const base = appendMech3dMesh(add);
appendPartsSpec(M, add.map(info), 'b.stp');
applyPartMods(M.parts);
M.contacts = contactsWithAdded(M.contacts, base, pre);
ok(base === 2 && getMech3d().raw.parts.length === 4 && getMech3d().name === 'a.stp', '메쉬: 뒤에 추가, 도면 이름 유지');
ok(getMech3d().combined.partOf.length === 48 && getMech3d().bvh.order.length === 48, '합친 메쉬·BVH 에 새 부품 포함');
ok(M.parts.length === 4 && M.parts[0].material.kind === 'marker', '기존 부품 지정 유지');
ok(M.parts[2].id === 2 && M.parts[2].name === '부품 3' && M.parts[2].material.kind === 'opaque' && M.parts[2].size[2] === 10, '새 부품 = 기본값, 다음 번호');
ok(JSON.stringify(M.sources) === JSON.stringify([{ name: 'a.stp', parts: 2 }, { name: 'b.stp', parts: 2 }]), '파일 목록·순서 기록');
const k = (a, b) => M.contacts.filter((c) => c.a === a && c.b === b);
ok(k(0, 1).length === 1 && k(0, 1)[0].mode === 'air', '기존 접촉면 공기층 유지');
ok(k(1, 2).length === 1 && k(1, 2)[0].mode === 'contact', '기존↔새 부품 접촉면 찾음');
ok(k(2, 3).length === 1 && k(2, 3)[0].area === 100 && k(2, 3)[0].faceA === 1, '새 파일 안 접촉면은 번호만 옮김');
ok(M.contacts.length === 3, `접촉면 3개: ${M.contacts.length}`);

// 크기·위치를 수정한 기존 부품은 수정된 자리로 접촉을 찾음
setMech3dMesh('a.stp', [A()]);
const M2 = initialMech3dSpec(); M2.parts[0].xform = { offset: [0, 0, 5] };
applyPartMods(M2.parts);
const add2 = [box([0, 0, 15], [10, 10, 25])], base2 = appendMech3dMesh(add2);
appendPartsSpec(M2, add2.map(info), 'c.stp'); applyPartMods(M2.parts);
ok(getMech3d().parts[0] !== getMech3d().raw.parts[0], '추가 뒤에도 기존 부품 수정 유지');
ok(contactsWithAdded([], base2, null).length === 1, '수정된 위치 기준으로 접촉 판정');

// 여러 파일 프로젝트 복원 — 저장 순서대로
const P = { parts: [A(), B(), C(), D()].map((p) => ({ volume: p.volume, size: [10, 10, 10] })), sources: [{ name: 'a.stp', parts: 2 }, { name: 'b.stp', parts: 2 }] };
const two = [info(A()), info(B())];
const s1 = restoreStep(P, [], two);
ok(s1.status === 'more' && s1.next === 'b.stp', '첫 파일 일치 → 다음 파일 안내');
ok(restoreStep(P, two, two).status === 'done', '마지막 파일 일치 → 복원');
ok(restoreStep(P, [], [info(A())]).status === 'mismatch', '부품 수가 다르면 불일치');
ok(restoreStep(P, two, [{ volume: 5, size: [1, 1, 1] }, two[0]]).status === 'mismatch', '모양이 다르면 불일치');
ok(restoreStep({ parts: P.parts.slice(0, 2) }, [], two).status === 'done', '파일 하나 프로젝트는 바로 복원');
done();
