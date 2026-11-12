// 3D 위 보기 막대(2026-11-12 화면 다시 그리기 4단계) — 예전 오른쪽 세로 보기 단추 묶음을 3D 위쪽 가운데 얇은 막대로.
// 단추 data-* 는 예전과 같음(app.js 가 그대로 연결). 반대 방향 = [반대] 단추 하나(지금 방향의 짝)
export const VIEWS = [['top', '평면 (XY)', 'XY', 'bottom', '아래에서 본 평면 (−Z 쪽)'], ['front', '정면 (XZ)', 'XZ', 'back', '뒤에서 본 정면 (+Y 쪽)'], ['side', '측면 (YZ)', 'YZ', 'side2', '반대쪽 측면 (−X 쪽)'], ['iso', '등각', '등각']];
const PAIR = Object.fromEntries(VIEWS.filter((v) => v[3]).flatMap(([k, , , r]) => [[k, r], [r, k]]));
export const oppositeView = (v) => PAIR[v] ?? null;
export const baseView = (v) => (VIEWS.some((x) => x[3] === v) ? PAIR[v] : v);
export function viewBarHtml() {
  const b = (attr, label, title, pressed) => `<button type="button" ${attr}${pressed != null ? ` aria-pressed="${pressed}"` : ''} title="${title}">${label}</button>`;
  return `<div class="m3-vb-g">${VIEWS.map(([k, t, s]) => b(`data-view="${k}"`, s, `${t} 보기`)).join('')}${b('data-flip', '⇄ 반대', '지금 방향의 반대쪽에서 보기(평면 ↔ 아래, 정면 ↔ 뒤, 측면 ↔ 반대 측면)', 'false')}</div>`
    + `<div class="m3-vb-g">${b('data-fit', '⤢ 맞춤', '지금 보이는 도면 전체를 창에 맞춤 — 보는 방향은 그대로 (F)')}${b('data-xray', '투시', '전체 부품 반투명 — 속 구조를 봄', 'false')}${b('data-lines', '선', '면을 감추고 부품마다 다른 색의 외곽선만 표시 — 부품 구조 확인', 'false')}${b('data-paths', '광경로', '광경로 화살표 켜기/끄기', 'false')}${b('data-obs', '관측면', '관측면 표시(테두리·화살표·색지도) 보이기/감추기 — 관측면을 고를 때는 늘 보임', 'true')}</div>`
    + `<div class="m3-vb-g">${b('data-theme-toggle', '', '화면 밝게/어둡게(3D 배경 포함)', 'false')}</div>`;
}
