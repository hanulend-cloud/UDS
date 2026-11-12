# UDS 화면 다시 그리기 — 구현 계획

> 설계: `docs/superpowers/specs/2026-11-12-ui-redesign-design.md` · 시안: `docs/ui-mockup/uds-ui-mockup.html`
> 실행: 이 대화 안에서 단계별로 진행(에이전트 안 씀). 단계 = 커밋 하나, 끝날 때마다 Edge(127.0.0.1:5180) 확인.

**목표:** 기능·판정 숫자는 그대로 두고, 시안의 색·배치를 7단계로 실제 화면에 옮긴다.

---

## 1단계 — 토큰·화면 전체 밝은/어두운 전환 (색만)

**파일**
- 새로: `src/ui/theme.js` — 테마 읽기·다음 테마·페이지에 적용(순수 함수 + DOM 한 줄)
- 새로: `test/ui-theme.mjs` — 위 함수 시험, `test:m3` 에 추가
- 고침: `src/ui/m3/app.js:180-188` — 3D 배경 전환 때 `<html data-theme>` 도 함께 바꿈(저장 키 `uds.m3.theme` 그대로)
- 고침: `src/main.js` 시작부 — 3D 화면이 뜨기 전에 저장된 테마를 `<html>` 에 먼저 적용(깜빡임 방지)
- 고침: `styles.css`
  - `:root` / `:root[data-theme="dark"]` 에 화면 전체 토큰(`--ui-bg --ui-panel --ui-line --ui-text --ui-mut --ui-acc --ui-hover`)
  - body·header·메뉴(`.menubar .mb-*`)·`.tab-note`·`#m3-pending`·GPU 배지가 토큰을 씀
  - 글꼴: `"Noto Sans KR", system-ui, "Segoe UI", sans-serif`(설치돼 있을 때만, 내려받지 않음), 숫자 `font-variant-numeric: tabular-nums`
  - 떠 있는 창(큰 창 `.m3-big-in`·기구 최적화 `.m3-mon`): 청록·보라 고유색 제거 → 패널색 머리(`--m3-head`/`--m3-headtx`) + `--m3-edge` 테두리, 머리 단추 흰색 강제 제거

**지킬 것:** 값 입력칸은 테마와 관계없이 흰 바탕(기존 규칙 유지). 판정 색(통과 초록·미달 빨강·주의 주황) 의미 그대로.

- [ ] 1. `test/ui-theme.mjs` 작성 → 실패 확인
- [ ] 2. `src/ui/theme.js` 구현 → 통과
- [ ] 3. app.js·main.js 연결
- [ ] 4. styles.css 토큰·상단 바·떠 있는 창
- [ ] 5. `npm test`, `npm run test:m3`
- [ ] 6. Edge 확인: 밝게/어둡게 전환 시 상단 바·메뉴까지 따라감, 큰 창·최적화 창 머리 글자·단추 대비, 어두운 테마에서 창 안 글자(완료 초록 등) 보임
- [ ] 7. 커밋 `feat(ui): page-wide light/dark tokens, neutral floating windows`

## 2단계 — 상단 바 한 줄 (완료)
- `index.html` header: 왼쪽 `UDS` 로고·메뉴 / 오른쪽(`.hd-right`) 프로젝트·저장 상태·[파일로 저장]·GPU 배지·☀/☾(`#hd-theme`)
- `src/ui/theme.js` `themeButton(t)` (시험 `test/ui-theme.mjs`), `src/ui/m3/app.js` `toggleTheme()` = 3D 보기 단추·메뉴와 같은 동작
- `src/main.js`: `<html data-theme>` 를 지켜보며 ☀/☾ 모양 맞춤

## 3단계 — 왼쪽 구성 트리 + 단계 막대 (완료)
- `src/ui/m3/feature-tree.js`: 관측면·부품·광원 = `grp0` 묶음(아이콘 `GI`), 제목 '구성', 광원 기본 접힘(배지 `LED ×n · 종류`), LED 를 고르면 펼침(직접 접고 편 것이 우선)
- `src/ui/m3/app.js` onFold: 광원 기본값 반영
- `styles.css`: `.m3-node.g0` 묶음 줄(배지 길면 줄바꿈), 단계 막대 높이·상태색 토큰
- 시험: `test/m3-ui-pure.mjs` 끝 '구성 트리' 블록, 예전 시험은 `lightOpen` 감싸개로 펼친 상태
- 참고: `test:mech3d` 의 mech3d-autodesign 실패 3건은 이 작업 전부터 있음(엔진 쪽)

## 4단계 — 3D 위 보기 막대 (완료)
- 새로: `src/ui/m3/view-bar.js` (`VIEWS`, `oppositeView`, `baseView`, `viewBarHtml`), 시험 `test/m3-view-bar.mjs`
- `src/ui/m3/app.js`: `#m3-views` = 보기 막대, [⇄ 반대] 하나 = 지금 방향의 짝(등각이면 꺼짐), 반대쪽을 보는 중에도 원래 방향 단추 켜짐
- `styles.css`: 위쪽 가운데 떠 있는 막대(`width: max-content`), 단면 칸은 막대 아래(top 58px)
- 단추 이름은 글자로 둠(아이콘만이면 처음 쓰는 사람이 뜻을 모름) — 마우스 올리면 설명

## 5단계 — 오른쪽 결과 요약 카드 (완료)
- `src/ui/m3/results-panel.js`: `overallVerdict(st, O)`(길이·폭 judgeText 그대로 묶음) → 제목 옆 종합 판정 배지. 길이·폭 균일도(+목표선 막대·판정 글)·평균 광량·광 효율을 그래프 옆 칸에서 맨 위 요약 줄로 옮김(data-r 그대로), 새는 빛·선택 영역은 그 아래 한 줄. 그래프는 폭 전체
- `styles.css`: `.m3-sum*`, 그래프 칸 최소 높이 130px + 결과 칸 세로 스크롤(그래프가 납작해지지 않게)
- 시험: `test/m3-ui-pure.mjs` '결과 요약 카드 종합 판정'
- 시뮬레이션 카드(계산 오차·균일도 추이·광경로) 접기는 6단계(상태줄)에서 실행 단추를 옮길 때 함께

## 6단계 — 아래 상태줄 (완료)
- `index.html`: `.m3-foot` = `#m3-run`(새) + `#m3-status`(조립·성형 점검, 그대로)
- `src/ui/m3/opt-dash.js`: `simStateText()`(순수, 시험 `m3-ui-pure` '아래 상태줄'), `createSimDash({ bar })` — 실행·일시정지·중지·진행률·광선 수·상태 글을 상태줄에, 카드엔 제목 + 접는 칸(계산 오차·균일도 추이 / 광경로). 접는 칸 열림 = 보는 사람별(uds.m3.simPlots), 닫히면 카드는 내용 높이만
- 화질 선택은 2D 광량 분포 머리에 그대로 둠(2D 칸 크기를 정하는 값이라 그 옆이 알기 쉬움 — 설계와 다름, 사용자에게 알림)

## 7단계
설계 문서의 단계 2~7 을 같은 형식(파일·시험·확인·커밋)으로, 앞 단계가 끝난 뒤 이 문서에 덧붙여 진행한다.
