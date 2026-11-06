// STEP 글자 자르기(2026-11-06, 순수) — 해석 전에 최상위 부품(루트)별로 필요한 개체만 모아 작은 STEP 여러 개로 나눔.
// 작업자마다 자기 몫만 해석·변환 → 해석이 중복되지 않음(전에는 작업자마다 파일 전체를 해석).
// 방법: DATA 의 개체(#n = …;)와 참조(#m)를 읽고, 아무도 참조하지 않는 '맨 위' 개체(SHAPE_DEFINITION_REPRESENTATION·스타일 등)를
// 그것이 닿는 PRODUCT_DEFINITION(루트)별로 묶어 각 묶음의 참조 전체(닫힘)를 한 파일로. 단위·문맥처럼 여럿이 쓰는 개체는 파일마다 복사.
// 조립 관계(NEXT_ASSEMBLY_USAGE_OCCURRENCE)가 있는 파일은 여기서 자르지 않음(위치 변환이 조립 구조에 묶여 있어 null 반환 — 호출자가 기존 방식으로)

// DATA 개체 목록: Map(id → 본문 문자열 '#id = ...;')
export function stepEntities(text) {
  const a = text.indexOf('DATA;'), b = text.lastIndexOf('ENDSEC;');
  if (a < 0 || b < a) return null;
  const head = text.slice(0, a + 5), tail = text.slice(b), body = text.slice(a + 5, b), ents = new Map();
  // 개체 끝 = 따옴표 밖의 ';'. 문자열 안 ';'·줄바꿈을 건너뜀
  let i = 0, start = -1, q = false;
  for (; i < body.length; i++) {
    const c = body.charCodeAt(i);
    if (c === 39) { q = !q; continue; }   // '
    if (q) continue;
    if (start < 0) { if (c === 35) start = i; continue; }   // #
    if (c === 59) {   // ;
      const s = body.slice(start, i + 1), m = /^#(\d+)\s*=/.exec(s);
      if (m) ents.set(+m[1], s);
      start = -1;
    }
  }
  return { head, tail, ents };
}
const refsOf = (s) => { const out = []; const eq = s.indexOf('='); for (const m of s.slice(eq + 1).matchAll(/#(\d+)/g)) out.push(+m[1]); return out; };

// K 묶음으로 자름 → [텍스트] | null(자를 수 없음).
// 나누는 단위: 최상위 루트가 여럿이면 루트, 하나뿐이면(조립품 하나로 묶인 파일) 그 아래 하위 부품 정의(필요하면 한 단계씩 더 내려감).
// 단위보다 위(조립품 골격: 그 제품 정의·형상 표현)는 모든 조각에 복사 — 조각마다 '골격 + 일부 하위 부품'인 작은 조립품이 되어
// 위치 변환(CONTEXT_DEPENDENT_SHAPE_REPRESENTATION)이 그대로 맞음. 같은 부품을 여러 곳에 쓴 것(인스턴스)은 그 부품 정의와 함께 한 조각으로.
// 무게(개체 수)가 고르게 되도록 큰 단위부터 가장 가벼운 조각에 배정. 여러 단위에 걸친 표시용 개체(색·레이어)는 뺌(형상에 안 쓰임)
export function cutStep(text, K) {
  const E = stepEntities(text);
  if (!E || K < 2) return null;
  const { head, tail, ents } = E;
  const refs = new Map(), referenced = new Set(), pd = new Set(), parents = new Map(), kids = new Map(), kind = new Map();
  for (const [id, s] of ents) {
    const r = refsOf(s); refs.set(id, r); for (const x of r) referenced.add(x);
    const t = /^#\d+\s*=\s*([A-Z_0-9]+)\s*\(/.exec(s)?.[1] ?? ''; kind.set(id, t);
    if (t === 'PRODUCT_DEFINITION') pd.add(id);
  }
  for (const [id, s] of ents) {
    if (kind.get(id) !== 'NEXT_ASSEMBLY_USAGE_OCCURRENCE') continue;
    const m = /NEXT_ASSEMBLY_USAGE_OCCURRENCE\s*\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*(?:'[^']*'|\$)\s*,\s*#(\d+)\s*,\s*#(\d+)/.exec(s);
    if (!m) continue;
    const a = +m[1], b = +m[2];
    if (!parents.has(b)) parents.set(b, new Set()); parents.get(b).add(a);
    if (!kids.has(a)) kids.set(a, new Set()); kids.get(a).add(b);
  }
  // 나누는 단위 고르기
  let level = [...pd].filter((x) => !parents.has(x));
  while (level.length === 1 && kids.get(level[0])?.size) level = [...kids.get(level[0])];
  if (level.length < 2) return null;
  const unitIdx = new Map(level.map((x, i) => [x, i])), memo = new Map();
  // 제품 정의가 속한 단위들 — 여러 하위 조립품이 같이 쓰는 부품(공용 나사·LED)은 여러 단위. 빈 집합 = 골격(단위보다 위)
  const unitsOf = (x, depth = 0) => {
    if (memo.has(x)) return memo.get(x);
    let u = new Set();
    if (unitIdx.has(x)) u.add(unitIdx.get(x));
    else if (depth < 64) for (const p of parents.get(x) ?? []) for (const v of unitsOf(p, depth + 1)) u.add(v);
    memo.set(x, u); return u;
  };
  const closure = (start, out) => { const st = [start]; while (st.length) { const x = st.pop(); if (out.has(x) || !ents.has(x)) continue; out.add(x); for (const y of refs.get(x)) st.push(y); } return out; };
  // 맨 위 개체마다: 닿는 제품 정의들의 단위 교집합 — 하나 = 그 단위(예: 사용처 연결은 부모 하위 조립품), 여럿 = 공용 정의(쓰는 조각마다 복사)
  const perUnit = level.map(() => []), shared = [], skeleton = [];
  for (const id of ents.keys()) {
    if (referenced.has(id)) continue;
    const c = closure(id, new Set());
    let U = null;
    for (const x of c) if (pd.has(x)) { const u = unitsOf(x); if (!u.size) continue; U = U ? new Set([...U].filter((v) => u.has(v))) : new Set(u); }
    if (U === null) skeleton.push(id);
    else if (U.size === 1) perUnit[[...U][0]].push(c);
    else if (U.size > 1) shared.push([U, c]);
    // 교집합이 비면(서로 다른 단위의 것들을 함께 가리킴 = 색·레이어 같은 표시용) 뺌
  }
  const G = Math.min(K, level.length), groups = Array.from({ length: G }, () => new Set()), load = new Array(G).fill(0), groupOf = new Array(level.length);
  const weight = perUnit.map((L) => L.reduce((s, c) => s + c.size, 0));
  for (const u of [...level.keys()].sort((a, b) => weight[b] - weight[a])) {
    const g = load.indexOf(Math.min(...load)); load[g] += weight[u]; groupOf[u] = g;
    for (const c of perUnit[u]) for (const x of c) groups[g].add(x);
  }
  for (const [U, c] of shared) for (const g of new Set([...U].map((u) => groupOf[u]))) for (const x of c) groups[g].add(x);
  for (const id of skeleton) for (const g of groups) closure(id, g);
  return groups.filter((g) => g.size).map((g) => [head, ...[...g].sort((x, y) => x - y).map((id) => ents.get(id)), tail].join(String.fromCharCode(10)));
}
