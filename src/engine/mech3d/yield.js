// 긴 계산 중 화면에 차례 넘기기(2026-11-03) — MessageChannel 은 setTimeout 과 달리 창이 가려져도 1 초씩 늦춰지지 않음
export function yieldNow() {
  return new Promise((res) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); res(); }; c.port2.postMessage(0); });
}
// ms 가 지났을 때만 차례를 넘기는 tick — 잘게 불러도 비용이 적음
export function pacer(ms = 30, now = () => performance.now(), give = yieldNow) {
  let t = now();
  return async () => { if (now() - t >= ms) { await give(); t = now(); } };
}
