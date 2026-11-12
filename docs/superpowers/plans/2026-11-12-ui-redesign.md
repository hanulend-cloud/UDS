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

## 2~7단계
설계 문서의 단계 2~7 을 같은 형식(파일·시험·확인·커밋)으로, 앞 단계가 끝난 뒤 이 문서에 덧붙여 진행한다.
