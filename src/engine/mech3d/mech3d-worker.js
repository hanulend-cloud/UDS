// 3D 기구 STEP 불러오기 Worker — 입력 { text } → 진행 { key, frac, text } → 결과 { parts, prep: { parts(BVH 포함), combined, bvh, contacts } } | { error }
// 입력 { prep: 부품 메쉬 } = 복원용 장면 준비만 → { prep }
// 입력 { helper: { k, K }, text, profile } = 나눠 읽기 보조 작업자(2026-11-06, step-split) — 맡은 루트만 변환·메시
import { loadOc } from '../shape/oc-loader.js';
import { readStepParts, stepProfile, BIG_MESH, mergeMeshes } from '../shape/step-import.js';
import { splitTransfer, planSplit, splitRough, splitFine } from '../shape/step-split.js';
import { stepRootEstimate, stepRootProfile } from '../shape/step-roots.js';
import { cutStep, cutStepUnits } from '../shape/step-cut.js';
import { readStepPartsFast, shouldUseFastStep, FAST_BIG_MESH, fastWorkers, mergeFastPieces } from '../shape/fast-step-import.js';
import { prepScene, prepTransfer } from './scene-prep.js';

const meshBufs = (m) => [m.positions.buffer, m.triangles.buffer, m.faceIds.buffer];

// ---- 보조 작업자: 해석 → 맡은 루트 변환(루트마다 알림·미리보기) → 간격을 받으면 거친 메시 → 최종 메시 ----
let H = null;
async function helper(ev) {
  const d = ev.data;
  if (d.helper) {
    const oc = await loadOc(), { k, K } = d.helper, profile = d.profile;
    const r = splitTransfer(oc, d.text, k, K, { profile,
      onParsed: (n) => self.postMessage({ h: 'parsed', n }),
      onRoot: (i, n, ms, got) => {
        const pv = profile.preview && got.length ? mergeMeshes(got.map((it) => it.pre)) : null;
        self.postMessage({ h: 'root', i, ms, solids: got.map((it) => ({ root: it.root, j: it.j, v: it.v, diag: it.diag, c: it.c })), preview: pv }, pv ? meshBufs(pv) : []);
      } });
    H = { oc, r, profile };
    self.postMessage({ h: 'transferred', solids: r.items.map((it, x) => ({ x, root: it.root, j: it.j, v: it.v, diag: it.diag, c: it.c })) });
    return;
  }
  if (d.qs) {   // 간격(값 복사) — 거친 메시는 최종에도 쓰일 수 있으므로 복사로, 최종 메시는 넘김
    const { oc, r, profile } = H;
    if (profile.preview) self.postMessage({ h: 'rough', meshes: splitRough(oc, r.items, d.qs, profile) });
    const fine = splitFine(oc, r.items, d.qs, profile, (x) => self.postMessage({ h: 'tick', x }));
    self.postMessage({ h: 'fine', meshes: fine }, fine.flatMap(meshBufs));   // 거친 메시는 위에서 복사로 보냈으므로 넘겨도 됨
    r.rd.delete();
  }
}

// 잘라 읽기 작업자 수(2026-11-06) — STEP 글자를 부품 단위 조각으로 잘라(step-cut) 작업자마다 자기 조각만 해석·변환. 중복 해석이 없어 메모리도 조각 크기만큼
export function splitWorkers(profile, nav = self.navigator ?? {}) {
  if (!profile.preview) return 1;
  let K = Math.min(6, Math.max(1, (nav.hardwareConcurrency ?? 4) - 2));
  if ((nav.deviceMemory ?? 8) < 8) K = Math.min(K, 3);
  return Math.max(1, K);
}

// ---- 고속 엔진 조각 동시 읽기(2026-11-13) ----
// 108 MB 타공 그릴 도면: 한 번에 읽으면 해석 4분 30초 + 그릴 8장 메시 = 15분. 무거운 부품이 서로 독립이라 조각마다 작업자 하나가 맡으면 가장 느린 조각 시간으로 끝남
// 보조 작업자: { fastPiece: 글자 } → { h: 'stage' | 'part' } … → { h: 'fast', parts(읽은 순서, c = 무게중심) }
async function fastPiece(d) {
  const parts = await readStepPartsFast(d.fastPiece, { sorted: false, onStage: (key) => self.postMessage({ h: 'stage', key }), onPart: (i, n) => self.postMessage({ h: 'part', i, n }) });
  self.postMessage({ h: 'fast', parts }, parts.flatMap(meshBufs));
}
function fastSplitLoad(texts, units, go, post) {
  const K = texts.length;
  return new Promise((resolve, reject) => {
    const ws = texts.map(() => new Worker(new URL('./mech3d-worker.js', import.meta.url), { type: 'module' }));
    const kill = () => ws.forEach((w) => w.terminate());
    const lists = new Array(K), frac = new Array(K).fill(0);
    let fin = 0, meshing = false, tP = 0;
    const tell = (force = false) => { if (!meshing || (!force && Date.now() - tP < 300)) return; tP = Date.now(); post({ key: 'mesh', frac: frac.reduce((a, b) => a + b, 0) / K, text: `조각 ${fin}/${K} 완료 · 작업자 ${K}개 · 고속 엔진` }); };
    ws.forEach((w, h) => {
      w.onerror = (e) => { kill(); reject(new Error(`조각 읽기 작업자 오류: ${e.message ?? e}`)); };
      w.onmessage = (m) => {
        const d = m.data;
        if (d.error) { kill(); reject(new Error(d.error)); return; }
        if (d.h === 'stage') { if (d.key === 'mesh' && !meshing) { meshing = true; go('mesh'); tell(true); } return; }
        if (d.h === 'part') { frac[h] = 0.95 * d.i / d.n; tell(); return; }
        if (d.h === 'fast') {
          lists[h] = d.parts; frac[h] = 1; fin++; w.terminate(); tell(true);
          if (fin === K) { try { resolve(mergeFastPieces(lists, units)); } catch (e) { reject(e); } }
        }
      };
      w.postMessage({ fastPiece: texts[h] });
    });
  });
}

// ---- 합치는 쪽 ----
function splitLoad(pieces, profile, early, go, post) {
  const K = pieces.length;
  return new Promise((resolve, reject) => {
    const ws = Array.from({ length: K }, () => new Worker(new URL('./mech3d-worker.js', import.meta.url), { type: 'module' }));
    const kill = () => ws.forEach((w) => w.terminate());
    let pv = [], tPv = 0;   // 미리보기는 0.5초마다 묶어서 — 부품마다 보내면 화면이 미리보기를 수천 번 다시 그려 멈춤
    const flush = (force = false) => { if (!pv.length || (!force && Date.now() - tPv < 500)) return; const m = mergeMeshes(pv); pv = []; tPv = Date.now(); post({ key: 'transfer', frac: roots / Math.max(1, n), text: `부품 ${roots}/${n} · 작업자 ${K}개`, preview: m }, meshBufs(m)); };
    let n = 0, parsed = 0, roots = 0, slow = { root: 0, ms: 0 }, solids = [], tr = 0, rough = new Array(K), roughN = 0, fine = new Array(K), fineN = 0, ticks = 0, total = 0, qOf = null, order = null;
    ws.forEach((w, h) => {
      w.onerror = (e) => { kill(); reject(new Error(`나눠 읽기 작업자 오류: ${e.message ?? e}`)); };
      w.onmessage = (m) => {
        const d = m.data;
        if (d.error) { kill(); reject(new Error(d.error)); return; }
        if (d.h === 'parsed') { n += d.n; if (++parsed === K) go('transfer'); return; }   // 조각마다 루트 수
        if (d.h === 'root') {
          roots++; if (d.ms > slow.ms) slow = { root: d.i, ms: d.ms };
          if (d.preview) pv.push(d.preview);
          if (pv.length) flush(); else if (roots % 20 === 0 || roots === n) post({ key: 'transfer', frac: roots / Math.max(1, n), text: `부품 ${roots}/${n} · 작업자 ${K}개` });
          return;
        }
        if (d.h === 'transferred') {
          solids.push(...d.solids.map((s) => ({ ...s, h })));
          if (++tr < K) return;
          flush(true);
          if (!solids.length) { kill(); reject(new Error('STEP 에 솔리드가 없음(면·와이어만 있는 파일)')); return; }
          const plan = planSplit(solids, profile, {}, true); order = plan.order; const { qs } = plan;
          qOf = ws.map(() => []); order.forEach((o, i) => { qOf[o.h][o.x] = qs[i]; }); total = order.length;
          go(profile.preview ? 'preview' : 'mesh');
          ws.forEach((w2, h2) => w2.postMessage({ qs: qOf[h2] }));
          return;
        }
        if (d.h === 'rough') {
          rough[h] = d.meshes;
          if (++roughN === K) { if (early) post({ coarse: prepScene(order.map((o) => ({ ...rough[o.h][o.x], volume: o.v })), { contacts: false }) }); go('mesh'); }
          return;
        }
        if (d.h === 'tick') { ticks++; if (ticks % 20 === 0 || ticks === total) post({ key: 'mesh', frac: ticks / total, text: `부품 ${ticks}/${total} · 작업자 ${K}개` }); return; }
        if (d.h === 'fine') {
          fine[h] = d.meshes; w.terminate();
          if (++fineN === K) resolve({ parts: order.map((o) => ({ ...fine[o.h][o.x], volume: o.v })), slow, roots: n });
        }
      };
      w.postMessage({ helper: { k: 0, K: 1 }, text: pieces[h], profile });   // 조각 하나 = 그 작업자 몫 전부
    });
  });
}

self.onmessage = async (ev) => {
  if (ev.data.fastPiece) { try { await fastPiece(ev.data); } catch (e) { self.postMessage({ error: String(e?.message ?? e) }); } return; }
  if (ev.data.helper || ev.data.qs) { try { await helper(ev); } catch (e) { self.postMessage({ error: String(e?.message ?? e) }); } return; }
  try {
    if (ev.data.prep) {   // 복원: 저장된 부품 메쉬 → BVH·합친 메쉬(접촉면은 저장된 설정에 있음)
      const r = prepScene(ev.data.prep);
      self.postMessage({ prep: r }, prepTransfer(r));
      return;
    }
    // 진행 알림(2026-11-05) { key, frac, text } · 미리보기 { preview } · 끝에 단계별 시간 timing
    const tm = {}, text = ev.data.text, baseProfile = stepProfile(ev.data.bytes ?? text.length), rootsEst = stepRootEstimate(text);
    let cur = 'oc', t0 = performance.now();
    const go = (k) => { const n = performance.now(); tm[cur] = n - t0; t0 = n; cur = k; self.postMessage({ key: k }); };
    const post = (msg, tr = []) => self.postMessage(msg, tr);
    // 잘라 읽기(조각마다 변환이 끝나는 대로 미리보기) · 자를 수 없어 한 번에 읽을 때만 루트 하나 = 미리보기 건너뜀(stepRootProfile — 변환이 끝나야 보이므로 메시를 두 번 만들 이유 없음)
    let profile = baseProfile, parts = null, info = { workers: 1, roots: rootsEst || null, noSplit: !!ev.data.noSplit };
    // 30MB 이상은 OCCT 8 SIMD 빌드로 전체를 한 번만 변환한다. 기존 OCCT 7.6 분할 경로보다 90MB급 조립품에서 훨씬 빠르며,
    // 지원하지 않는 STEP 변형이나 초기화 오류가 나면 아래 기존 경로로 자동 복귀한다.
    if (shouldUseFastStep(ev.data.bytes ?? text.length)) {
      self.postMessage({ key: 'oc', text: '대용량 고속 엔진 준비' });
      // 부품 단위로 잘라 작업자 여럿이 동시에(2026-11-13) — 자를 수 없거나(부품 하나) 작업자를 못 쓰면 아래에서 한 번에 읽음
      const KF = ev.data.noSplit ? 1 : fastWorkers(self.navigator ?? {});
      if (KF >= 2) {
        try {
          go('read'); self.postMessage({ key: 'read', text: '부품 단위로 자르는 중' });
          const cut = cutStepUnits(text, KF);
          if (cut?.texts.length >= 2) {
            self.postMessage({ key: 'read', text: `조각 ${cut.texts.length}개 동시 해석 · 작업자 ${cut.texts.length}개 · 고속 엔진` });
            parts = await fastSplitLoad(cut.texts, cut.units, go, post);
            info = { workers: cut.texts.length, fast: true, cut: true, roots: rootsEst || null, noSplit: false };
          }
        } catch (e) { console.warn('[불러오기] 고속 조각 읽기 실패 — 한 번에 읽기로', e); parts = null; self.postMessage({ key: 'read', text: '조각 읽기 실패 — 한 번에 읽는 중' }); }
      }
      if (!parts) try {
        parts = await readStepPartsFast(text, { onStage: go, onPart: (i, n) => self.postMessage({ key: 'mesh', frac: i / n, text: `부품 ${i}/${n} · 고속 엔진` }) });
        info = { workers: 1, fast: true, roots: rootsEst || null, noSplit: !!ev.data.noSplit };
      } catch (e) {
        console.warn('[불러오기] 고속 경로 실패 — 기존 엔진으로', e);
        self.postMessage({ key: 'oc', text: '고속 엔진 호환 안 됨 — 기존 엔진으로 다시 읽는 중' });
        info.fastError = String(e?.message ?? e);
      }
    }
    const K = parts || ev.data.noSplit ? 1 : splitWorkers(baseProfile, self.navigator ?? {});
    const pieces = !parts && K >= 2 ? (() => { go('read'); self.postMessage({ key: 'read', text: '부품 단위로 자르는 중' }); try { return cutStep(text, K); } catch (e) { console.warn('[불러오기] 자르기 실패', e); return null; } })() : null;
    if (pieces?.length >= 2) {   // 잘라 읽기 — 실패하면(중첩 Worker 미지원·메모리 등) 한 번에 읽기로
      try { const r = await splitLoad(pieces, profile, !!ev.data.early, go, post); parts = r.parts; info = { workers: pieces.length, cut: true, slow: r.slow, roots: rootsEst || r.roots }; }
      catch (e) { console.warn('[불러오기] 나눠 읽기 실패 — 한 번에 읽기로', e); self.postMessage({ key: 'read', text: '나눠 읽기 실패 — 한 번에 읽는 중' }); }
    }
    if (!parts) {
      profile = stepRootProfile(baseProfile, rootsEst); info.previewSkipped = baseProfile.preview && !profile.preview;
      self.postMessage({ key: 'oc' });
      const oc = await loadOc();
      parts = readStepParts(oc, text, { profile, onStage: go,
        onPreview: (m, i, n, phase) => self.postMessage({ key: phase === 'transfer' ? 'transfer' : 'preview', frac: i / n, text: `부품 ${i}/${n}`, preview: m }, meshBufs(m)),   // 변환 중 미리보기는 변환 진행으로(진행률이 앞 단계로 튀지 않게)
        onPart: (i, n) => self.postMessage({ key: 'mesh', frac: i / n, text: `부품 ${i}/${n}` }),
        onTransfer: (i, n) => { if (n > 1) self.postMessage({ key: 'transfer', frac: i / n, text: `부품 ${i}/${n}` }); },   // 루트가 여럿이면 실제 진행
        // 거친 메시로 먼저 화면 열기(2026-11-06) — 정밀 메시는 계속 만들고 끝나면 바꿔 끼움. 거친 메시 배열은 최종에도 쓰일 수 있어 복사로 보냄
        onCoarse: ev.data.early ? (rough) => self.postMessage({ coarse: prepScene(rough, { contacts: false }) }) : null });
    }
    const nT = parts.reduce((s, p) => s + p.triangles.length / 3, 0);
    go('prep');
    self.postMessage({ key: 'prep', frac: 0, text: `부품 ${parts.length}개 · 삼각형 ${Math.round(nT / 1000)}천 개` });
    const relaxed = info.fast ? FAST_BIG_MESH : profile.big ? BIG_MESH : null;
    const r = prepScene(parts, { contacts: true, ...(relaxed ? { chord: relaxed.linDefl } : {}) });   // 무거운 준비는 여기서(화면 스레드 멈춤 방지). 메시를 완화하면 접촉 판정 현 오차도 같이
    tm.prep = performance.now() - t0;
    self.postMessage({ parts: r.parts, prep: r, timing: tm, relaxed, info }, prepTransfer(r));
  } catch (e) { self.postMessage({ error: String(e?.message ?? e) }); }
};
