# 시뮬레이션 결과판 단순화 Implementation Plan

> 실행: inline(사용자 — agent 사용 안 함). 체크박스로 진행.

**Goal:** spec `docs/superpowers/specs/2026-11-23-result-panel-simplify-design.md` 구현.
**Architecture:** 순수 함수(용어·진행 한 줄)를 먼저 test/m3-ui-pure.mjs 로 고정하고, 화면은 기존 칸을 옮기기만 해 갱신 로직을 그대로 씀(회귀 방지).
**Tech Stack:** vanilla JS 모듈, styles.css, node 테스트.

### Task 1: 용어 Quick / Final
- Files: `src/ui/m3/results-panel.js`(previewBtn·modeBand·큰 창 배지·overallVerdict 글), `src/ui/m3/command-bar.js`(flowState 글), `src/ui/m3/judge 글`, Test: `test/m3-ui-pure.mjs` 1497–1537 근처
- [ ] 테스트 기대값을 Quick/Final 로 바꿔 실패 확인 → 문구 교체 → `node test/m3-ui-pure.mjs` 통과

### Task 2: 진행 한 줄(진행률·오차·경과·남은 시간)
- Files: `src/ui/m3/opt-dash.js` — 새 순수 `simProgLine(H, tgt, state, pct, capMs)` → `80% · 오차 ±2.23% → ±2.00% · 경과 3:12 · 남은 약 0:50`; 카드 머리 상태 글에서 대칭 문구를 title 로.
- [ ] 테스트 작성(실패) → 구현 → 통과

### Task 3: 상단 띠 KPI 4칸
- Files: `src/ui/m3/results-panel.js`(옵션 `kpi` 칸이 있으면 `.m3-sum` 을 그 칸에 그림), `index.html`(`#m3-kpi`), `src/ui/m3/app.js`(옵션 전달), `styles.css`(①~⑤ 칸 크기와 비슷한 한 줄 칸, 판정 글·게이지는 title/숨김)
- [ ] 브라우저 확인: 값 갱신·미달 빨강·목표/미달 %p title

### Task 4: 깜빡임 — `.m3-simcard .od-simh` nowrap + 상태 글 ellipsis
### Task 5: 여백 — main/#mech3d-wrap/.m3-main 패딩·간격 4px, 분할 막대 위치 보정
### Task 6: `node test/gate.mjs` 전부 PASS → 커밋·push
