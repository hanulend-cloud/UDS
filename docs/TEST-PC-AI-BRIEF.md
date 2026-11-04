# UDS 테스트 PC용 AI 안내

이 문서는 UDS(Uniform Design Simulator)를 테스트하는 PC의 AI가 숙지할 내용이다.

## 1. 역할과 제한

- 역할은 **버그 분석과 보고서 작성**이다. 코드 수정은 다른 PC의 개발 AI가 한다.
- 이 PC에서는 파일 수정, commit, push를 하지 않는다. 고치는 방법은 **제안만** 한다.
- 도면과 자료는 이 PC 밖으로 나갈 수 없다. 보고서에 아래 내용을 넣지 않는다.
  - 도면 파일과 그 이름, 부품 이름, 프로젝트 이름, 고객사·제품 이름
  - 치수, 좌표, 도면이 보이는 캡처
- 보고서는 사용자가 다른 PC로 직접 옮겨 적는다고 가정한다. **15줄 이내**로 쓴다.
- 답변은 한국어로, 결론부터 쓴다. **잡음이 아니라 노이즈**라고 쓴다.

## 2. 실행

필요한 것: Git, Python 3, Edge(또는 Chrome), `cdn.jsdelivr.net` 접속.

3D 화면(three.js)과 STEP 불러오기(opencascade.js)를 이 CDN에서 받는다. 막혀 있으면 프로그램이 뜨지 않거나 도면을 불러오지 못한다.

```bash
git clone https://github.com/hanulend-cloud/UDS.git
```

```bash
git pull
```

- `run.bat`을 실행하면 최신 코드가 `http://127.0.0.1:5180`에서 열린다. `git pull` 뒤에는 Ctrl+F5로 새로고침한다.
- `run-v1.bat`~`run-v4.bat`은 예전 버전을 여는 파일이다. 테스트에 쓰지 않는다.
- 화면에 보이는 버전 표시는 최신 코드를 구분해 주지 않는다. 버전은 아래 명령의 commit으로 확인한다.

```bash
git log -1 --oneline
```

프로젝트 설정은 브라우저 저장소에 저장되므로 PC와 포트마다 따로 있다. 처음 실행하면 기본 프로젝트(`data/projects/v3.json`)가 열린다.

## 3. 버그가 아닌 동작

| 현상 | 이유 |
|---|---|
| `≈ 근처`, `목표 근처`로 표시됨 | 목표와의 차이가 표준오차의 2배보다 작으면 통과·미달을 가르지 않는다. 표시만 그렇고 최적화의 후보 선택 기준은 그대로다. |
| 같은 설계도 실행마다 균일도가 조금 다름 | 몬테카를로 계산이라 그렇다. 노이즈 0.5%에서 표준오차는 약 0.004이고, 같은 설계에서 0.7925~0.8027이 나온 적이 있다. |
| 최적화를 다시 하면 다른 설계가 나옴 | 후보 탐색이 빠른 계산이라 실행마다 달라질 수 있다. |
| 최적화 후보 표의 ✓/✕와 화면 판정이 다름 | Milky 조정 표와 진행 중 후보 표시는 "근처"를 쓰지 않는다. |
| 적용한 항목의 체크칸이 사라짐 | 적용한 항목은 🔒 고정된다. 고정을 풀면 다시 나온다. |
| 고화질 최적화가 오래 걸림 | 실측 약 10~23분(도면과 PC에 따라 다름). 멈춘 것인지는 진행률이 움직이는지로 판단한다. |
| [적용] 직후 계산 없이 값이 바로 나옴 | 최종 판정 값을 그대로 넘겨받는다(`adopted`). 형상을 바꾼 적용, [후보로 바꾸기], Milky 표의 [적용]은 다시 계산한다. |
| 같은 프로젝트를 두 탭에서 열면 경고가 나옴 | 뒤에 연 탭의 변경은 저장되지 않는다. 측정 중 다른 탭을 열면 시간도 느려진다. |
| 저장·계산 중 GPU가 꺼졌다는 알림 | 드라이버 문제일 때 CPU로 계속 계산한다. 다만 자주 나오면 보고한다. |

## 4. 지켜져야 하는 규칙 (어기면 버그)

- 균일 구조에서는 LED 간격이 같아야 한다.
- 위치와 개수 등 LED 변경은 화면에 항상 보여야 한다. 조용히 바뀌면 안 된다.
- LED 자동 선택: 같은 부품 2개 이상, PCB 위, PCB 반대 방향으로 발광.
- [적용] 뒤 화면 값은 최적화 최종 판정 값과 같아야 한다(위 예외 제외).
- 계산 제외한 부품은 광경로와 경로 목록에 나오면 안 된다.
- 판정 문구와 숫자가 서로 어긋나면 안 된다.
- 기구 설계자는 소재 이름만 고른다. 측정값 입력은 관리자 기능이다.
- 글자가 배경에 묻히거나 입력칸에서 잘리면 버그다.

## 5. 진단

브라우저 콘솔(F12)에서 실행한다. **도면 치수와 이름은 나오지 않지만**, 오류 문구 `errs`에 이름이 섞여 있으면 지우고 보고한다.

```js
(()=>{const A=__m3(),M=A.store.mspec,O=M.observe,s=A.prog?.snapshot?.()??{},t=s.stats??{},f=(x,n=4)=>x==null?null:+(+x).toFixed(n),errs=(()=>{try{return JSON.parse(localStorage.getItem('uds.errors')??'[]').slice(-5).map(e=>({src:e.source,n:e.n,msg:String(e.msg).slice(0,160)}))}catch{return[]}})();return JSON.stringify({gpu:!!navigator.gpu,cores:navigator.hardwareConcurrency,parts:M.parts.length,kinds:M.parts.slice(0,8).map(p=>p.material?.kind),light:M.light.kind,leds:A.ledTotal,quality:O.quality??'low',target:[O.targetLen,O.targetWid],noiseTarget:O.targetNoise,sim:{state:s.state,reason:s.reason,U:[f(t.Ulen),f(t.Uwid)],se:[f(t.seLen),f(t.seWid)],noise:f(t.relNoise),photons:s.photons,eff:f(s.photometry?.eff)},opt:{running:A.ad?.running?.text??null,feasible:A.ad?.result?.feasible??null,judge:A.ad?.result?.targets?.judge?.all??null},errs})})()
```

## 6. 분석 순서

1. 최신 commit인지, Ctrl+F5를 했는지 확인한다.
2. 위 3번 표에 있는 동작인지 확인한다.
3. **샘플로 재현되는지 확인한다.** 개발 PC에는 이 PC의 도면이 없으므로 가장 중요한 단계다. 기본 프로젝트나 저장소의 샘플을 쓴다.
   - `test/fixtures/mech3d-sample.stp`, `mech3d-led-sample.stp`, `bent-diffuser-40led.stp`, `cover-dome-rib.stp`
4. 샘플로 재현되지 않으면, 도면의 어떤 특징과 관련 있는지 치수 없이 적는다. 예: 곡면 입광부, 부품 45개, LED 2열, 얇은 커버.
5. 코드를 읽어 원인 위치를 찾는다. 확인하지 못한 원인은 "추정"이라고 쓴다.

## 7. 보고서 양식

```text
[UDS 버그] commit: 1585dd5 / 화면: 3D / 브라우저: Edge
제목: (한 줄)
심각도: 멈춤·값 오류 / 기능 안 됨 / 화면 표시
재현: 샘플명 또는 기본 프로젝트 / 안 되면 "이 PC 도면만"
순서: 1) 2) 3)
기대:
실제:
빈도: 매번 / N번 중 M번
진단: (5번 결과에서 관련 값만 — sim.U, noise, state, errs)
콘솔 오류: (첫 줄만)
도면 특징: (치수 없이, 샘플로 재현되면 생략)
원인 추정: 파일:줄 — 확인됨 / 추정
```

값이 이상하면 아래 값을 꼭 넣는다.

- 화질, 노이즈, 광선 수(`photons`)
- 표준오차(`se`). 차이가 표준오차의 2배보다 작으면 노이즈일 수 있다.
- 같은 조건에서 두 번 이상 잰 값

## 8. 코드 위치

| 내용 | 파일 |
|---|---|
| 3D 화면 전체 흐름, 최적화 실행 | `src/ui/m3/app.js` |
| 최적화 판단 | `src/engine/mech3d/autodesign.js` |
| 균일도·노이즈·판정 | `src/engine/mech3d/tally.js` |
| 광선 계산(CPU) | `src/engine/mech3d/mc3d.js` |
| 최적화용 Worker 실행, 이어서 계산 | `src/ui/m3/autodesign-run.js` |
| 시뮬레이션 진행, 값 인계 | `src/ui/m3/progressive.js` |
| 부품 설정 창 | `src/ui/mech3d-panel.js` |
| LED·관측면 설정 창 | `src/ui/mech3d-light-panel.js` |
| 부품 리스트 | `src/ui/m3/feature-tree.js` |
| 시뮬레이션 결과 | `src/ui/m3/results-panel.js` |
| 최적화 결과 카드 / 우측 현황 | `src/ui/m3/autodesign-panel.js` / `src/ui/m3/opt-dash.js` |
| 상단 단계 표시 | `src/ui/m3/command-bar.js` |
| LED 원설계 대비 변경 | `src/ui/m3/led-change.js` |
| 3D 그리기 | `src/ui/mech3d-view.js` |
| 오류 기록 | `src/ui/error-log.js` |

점검용 값: `__m3()`(프로그램 상태), `__m3().prog.snapshot()`(계산 상태), `__adLast`(마지막 최적화 결과). **읽기만 한다.** 값을 바꾸면 테스트 결과를 믿을 수 없게 된다.
