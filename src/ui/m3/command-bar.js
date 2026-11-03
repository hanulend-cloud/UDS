import { judgeStats } from '../../engine/mech3d/tally.js';
// 명령 막대 — ① LED 지정 ② 관측면 지정 ③ 목표 설정(사용 순서). 나머지는 상단 메뉴. calcLabel = 계산 카드의 제어 단추 문구
// h = { onLed(), onObs(), onTarget() }
export function calcLabel(calc) {
  switch (calc?.state) {
    case 'starting': return '⏸ 장면 준비';
    case 'running': case 'pending': return '⏸ 계산 중';
    case 'paused': return '▶ 계산 재개';
    case 'done': return calc.reason === 'converged' ? '✓ 계산 완료 — 다시 계산' : '⚠ 계산 한도 — 다시 계산';   // 완료 = 목표 정확도 도달 · 한도 = 광선 상한까지 쏘았지만 정확도 미달
    case 'error': return '⟳ 다시 계산';
    default: return '▶ 계산';
  }
}
// 사용 순서대로 ① LED 지정 → ② 관측면 지정 → ③ 목표 설정(2026-10-27). 끝난 단계는 ✓. 계산 제어는 오른쪽 위 '광분포 시뮬레이션' 카드로 옮김
export function stepState(M) {
  const L = M.light, led = L.kind === 'step' ? (L.step?.emitters?.length ?? 0) > 0 : L.kind === 'manual';
  const O = M.observe, tgOk = O.targetLen > 0 && O.targetWid > 0;   // 목표 둘 다 입력됨 = ✓
  return { led, obs: (O.faces?.length ?? 0) > 0, tgOk, tgt: `${Math.round(O.targetLen * 100)}% / ${Math.round(O.targetWid * 100)}%` };
}
// 흐름 4·5단계 상태(순수, 2026-10-29) — 4 광분포 시뮬레이션(지금 설계의 빛 분포·균일도) → 5 기구 최적화(후보를 찾아 적용 → 4 가 다시 검증)
// calc = 점진 계산 스냅숏, stats = 그 결과, ad = { running, result } (기구 최적화). 반환 { sim:{ text, cls, done }, opt:{ text, cls, done } }
export function flowState(calc, stats, M, ad = {}) {
  const O = M.observe, st = calc?.state ?? 'idle', rn = calc?.stats?.relNoise ?? stats?.relNoise, tn = calc?.targetNoise ?? O.targetNoise ?? 0.01;
  const has = !!stats && !stats.empty, pc = (v, t) => (!Number.isFinite(v) ? '–' : v < t && Math.round(v * 100) >= t * 100 ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 100)}%`);   // 미달인데 반올림하면 목표와 같아 보일 때만 소수 한 자리(79.5%)
  const J = has ? judgeStats(stats, O).all : '', pass = J === 'ok';
  const res = has ? `${pc(stats.Ulen, O.targetLen)} / ${pc(stats.Uwid, O.targetWid)}` : '';
  const running = st === 'running' || st === 'pending' || st === 'starting', done = st === 'done';
  const sim = running ? { text: `계산 중 ${Number.isFinite(rn) && rn > 0 ? Math.round(Math.min(1, (tn / rn) ** 2) * 100) : 0}%${res ? ` · ${res}` : ''}`, cls: 'run', done: false }
    : st === 'paused' ? { text: `일시정지${res ? ` · ${res}` : ''}`, cls: '', done: false }
    : done && has ? { text: `${res} ${pass ? '목표 통과' : J === 'near' ? '목표 근처' : '목표 미달'}`, cls: pass ? 'ok' : J === 'near' ? 'near' : 'bad', done: true }
    : { text: '–', cls: '', done: false };
  const opt = ad.running ? { text: '진행 중', cls: 'run', done: false }
    : ad.result ? { text: '결과 확인 · 적용', cls: 'run', done: false }
    : !sim.done ? { text: '시뮬레이션 뒤', cls: '', done: false }
    : pass ? { text: '불필요(목표 통과)', cls: 'ok', done: true }
    : J === 'near' ? { text: '선택 — 목표 근처', cls: 'near', done: false }
    : { text: '필요 — 목표 미달', cls: 'need', done: false };
  return { sim, opt };
}
export function mountCommandBar(el, h) {
  let lastStats = null;
  el.innerHTML = `<button type="button" class="m3-step" data-c="led" aria-pressed="false"><i>1</i> LED 지정</button><span class="m3-arrow">›</span>
    <button type="button" class="m3-step" data-c="obs" aria-pressed="false"><i>2</i> 관측면 지정</button><span class="m3-arrow">›</span>
    <button type="button" class="m3-step" data-c="tgt" aria-pressed="false"><i>3</i> 목표 설정 <span class="mut" data-tgt></span></button><span class="m3-arrow">›</span>
    <button type="button" class="m3-step m3-flow" data-c="sim" title="누르면 광시뮬레이션 창(진행 현황 · 2D · 1D) — 지금 설계의 빛 분포·균일도를 자동 계산"><i>4</i> 광분포 시뮬레이션 <span data-flow="sim"></span></button><span class="m3-arrow">›</span>
    <button type="button" class="m3-step m3-flow" data-c="opt" title="목표 미달이면 Milky·LED 위치·형상 후보를 찾아 최종 화질로 판정 — 적용하면 그 값이 4 광분포 시뮬레이션에 그대로 나옴"><i>5</i> 기구 최적화 <span data-flow="opt"></span></button>`;
  const b = (k) => el.querySelector(`[data-c="${k}"]`);
  b('led').onclick = () => h.onLed();
  b('obs').onclick = () => h.onObs();
  b('tgt').onclick = () => h.onTarget();
  b('sim').onclick = () => h.onSim?.();
  b('opt').onclick = () => h.onOpt?.();
  const toggle = (n, on) => {
    if (n.classList.contains('on') !== on) n.classList.toggle('on', on);
    const v = on ? 'true' : 'false';
    if (n.getAttribute('aria-pressed') !== v) n.setAttribute('aria-pressed', v);
  };
  return {
    // S = 세션, M = 설계(단계 완료 표시), stats = 지금 계산 결과(없으면 마지막 값 유지)
    update(S, M, stats) {
      if (stats !== undefined) lastStats = stats;
      toggle(b('led'), S.pick === 'led' || S.pick === 'ledx' || S.pick === 'mled');
      toggle(b('obs'), S.pick === 'obs');
      toggle(b('tgt'), S.node === 'obs' && S.pick !== 'obs');
      if (!M) return;
      const st = stepState(M);
      [['led', st.led, '1'], ['obs', st.obs, '2'], ['tgt', st.tgOk, '3']].forEach(([k, d, n]) => { const x = b(k); x.classList.toggle('done', d); const i = x.querySelector('i'); if (i.textContent !== (d ? '✓' : n)) i.textContent = d ? '✓' : n; });
      const t = el.querySelector('[data-tgt]'); if (t.textContent !== st.tgt) t.textContent = st.tgt;
      // 4 광분포 시뮬레이션 · 5 기구 최적화 — 상태 문구(색 = 통과/미달/필요)와 끝난 단계 ✓
      const f = flowState(S.calc, lastStats, M, h.adFlow?.() ?? {});
      for (const [k, n] of [['sim', '4'], ['opt', '5']]) {
        const x = b(k), s = el.querySelector(`[data-flow="${k}"]`), c = `m3-fs ${f[k].cls}`, i = x.querySelector('i');
        if (s.textContent !== f[k].text) s.textContent = f[k].text;
        if (s.className !== c) s.className = c;
        x.classList.toggle('done', f[k].done); x.classList.toggle('need', f[k].cls === 'need');
        if (i.textContent !== (f[k].done ? '✓' : n)) i.textContent = f[k].done ? '✓' : n;
      }
    },
  };
}
