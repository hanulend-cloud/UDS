// 칸 맡기(2026-11-25) — 프로젝트를 다시 열면(mount 재호출) 같은 칸에 패널을 새로 만든다. 옛 패널의 ResizeObserver·타이머가 살아 있으면
// 새 패널과 번갈아 그래프를 비우고 채워 깜빡이고(72-LED 재현), 옛 결과를 새 캔버스에 그린다. 새로 맡으면 옛 담당의 signal 을 끊는다.
export function claimEl(el) {
  el?._claim?.abort();
  const ac = new AbortController();
  if (el) el._claim = ac;
  return ac.signal;
}
