// 3D 위 보기 막대(2026-11-12 화면 다시 그리기 4단계): node test/m3-view-bar.mjs
import { VIEWS, oppositeView, baseView, viewBarHtml } from '../src/ui/m3/view-bar.js';
import { ok, done } from './mech3d-util.mjs';

ok(VIEWS.map((v) => v[0]).join() === 'top,front,side,iso', '보기 4개(평면·정면·측면·등각)');
ok(oppositeView('top') === 'bottom' && oppositeView('bottom') === 'top' && oppositeView('front') === 'back' && oppositeView('side2') === 'side', '반대 = 짝 방향(다시 누르면 돌아옴)');
ok(oppositeView('iso') === null && oppositeView(undefined) === null, '등각·모름 = 반대 없음');
ok(baseView('bottom') === 'top' && baseView('back') === 'front' && baseView('iso') === 'iso', '반대쪽을 보는 중에도 원래 단추가 켜짐');
const H = viewBarHtml();
for (const q of ['data-view="top"', 'data-view="iso"', 'data-flip', 'data-fit', 'data-xray', 'data-lines', 'data-paths', 'data-obs', 'data-theme-toggle']) ok(H.includes(q), `단추 있음: ${q}`);
ok(!/data-view="bottom"/.test(H), '반대 방향은 단추 하나(반대)로');
ok((H.match(/title="/g) ?? []).length >= 10, '모든 단추에 마우스 올리면 설명');
done();
