// 속성 창 숫자 칸 크기(2026-11-03) — 값·입력 범위·단위 소수 자리에 맞는 칸 폭. 칸 폭을 몇 단계로만 두어 줄이 맞고, 같은 줄의 칸은 같은 폭(X·Y·Z)
const TIERS = [4, 6, 8, 10];
const textCh = (t) => [...String(t ?? '')].reduce((n, c) => n + (c > '⹿' ? 2 : 1), 0);   // 한글 = 2칸
const decimals = (step) => { const m = String(step ?? '').match(/\.(\d+)$/); return m ? m[1].length : 0; };

// a = { value, placeholder, min, max, step } (문자열) → 칸 폭(글자 수)
export function numInputCh({ value = '', placeholder = '', min = '', max = '', step = '' }) {
  const d = decimals(step), range = [min, max].filter((v) => v !== '' && Number.isFinite(+v));
  const fromRange = range.length === 0 ? 0 : Math.max(...range.map((v) => (+v < 0 ? 1 : 0) + String(Math.trunc(Math.abs(+v))).length + (d ? d + 1 : 0)));
  const need = Math.max(textCh(value), textCh(placeholder), fromRange);
  return TIERS.find((t) => need <= t) ?? TIERS[TIERS.length - 1];
}
const attrs = (e) => ({ value: e.value, placeholder: e.placeholder, min: e.getAttribute('min') ?? '', max: e.getAttribute('max') ?? '', step: e.getAttribute('step') ?? '' });

// 소재표(.m3-cat)는 칸이 많아 따로 정함
export function fitNumInputs(root) {
  const inputs = [...root.querySelectorAll('input[type=number]')].filter((e) => !e.closest('.m3-cat')), rows = new Map();
  for (const e of inputs) {
    const row = e.closest('.m3-xf') ?? e.closest('tr') ?? e.closest('.m3-row') ?? e;
    rows.set(row, Math.max(rows.get(row) ?? 0, numInputCh(attrs(e))));
  }
  for (const e of inputs) {
    const ch = rows.get(e.closest('.m3-xf') ?? e.closest('tr') ?? e.closest('.m3-row') ?? e), w = `calc(${ch}ch + 12px)`;
    if (e.style.width !== w) e.style.width = w;
  }
}
const watched = new WeakSet();
// 창이 다시 그려질 때마다(탭 전환 포함) 맞춤
export function watchNumInputs(el) {
  if (!el || watched.has(el)) return;
  watched.add(el);
  new MutationObserver(() => fitNumInputs(el)).observe(el, { childList: true, subtree: true });
  fitNumInputs(el);
}
