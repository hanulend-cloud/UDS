// STEP 최상위 부품(루트) 수 어림(2026-11-06, 순수) — 해석하기 전에 글자만 훑음. 나눠 읽기는 루트가 여럿일 때만 이득이므로
// 조립품 하나로 묶인 파일(루트 1)은 나눠 읽지 않음(작업자마다 파일 전체를 해석해 시간·메모리만 늘어남).
// 루트 = PRODUCT_DEFINITION 중 조립 관계(NEXT_ASSEMBLY_USAGE_OCCURRENCE)의 하위(related)로 쓰이지 않은 것. 제품 구조가 없으면 0(모름)
export function stepRootEstimate(text) {
  const pd = new Set();
  for (const m of text.matchAll(/#(\d+)\s*=\s*PRODUCT_DEFINITION\s*\(/g)) pd.add(m[1]);
  if (!pd.size) return 0;
  const child = new Set();
  // NAUO(id, name, description, relating, related, reference_designator) — 넷째·다섯째가 #번호
  for (const m of text.matchAll(/NEXT_ASSEMBLY_USAGE_OCCURRENCE\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*(?:'[^']*'|\$)\s*,\s*#(\d+)\s*,\s*#(\d+)/g)) child.add(m[2]);
  let n = 0; for (const id of pd) if (!child.has(id)) n++;
  return n;
}

// A single assembly root cannot show its coarse mesh until TransferRoot finishes.
// Skip triangulating every part twice and build only the final mesh.
export function stepRootProfile(profile, roots) {
  return roots === 1 && profile?.preview ? { ...profile, preview: false } : profile;
}
