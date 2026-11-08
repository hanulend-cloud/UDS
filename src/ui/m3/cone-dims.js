// 3D 빛 원뿔 크기(순수, 2026-11-08) — half = 반각(°), len = 기본 길이(mm). 반환 { ax: 축 방향 길이, r: 테두리 반지름 }
// 반각 60° 까지는 축 길이 그대로(tan), 넘으면 빗변 길이를 60° 때와 같게 두고 펼침 — 전에는 80° 에서 잘려 160° 넘는 지향각이 안 바뀌어 보였음.
// 180°(반각 90°)는 평평한 원판이라 89.5°(179°) 로 그림
export function coneDims(half, len = 4) {
  const h = (Math.min(89.5, Math.max(1, Number.isFinite(half) ? half : 60)) * Math.PI) / 180;
  if (h <= Math.PI / 3) return { ax: len, r: len * Math.tan(h) };
  const S = 2 * len;   // 60° 때 빗변 = len / cos60
  return { ax: S * Math.cos(h), r: S * Math.sin(h) };
}
