// 3D 기구 STEP 불러오기 Worker — 입력 { text } → 진행 { key, frac, text } → 결과 { parts, prep: { parts(BVH 포함), combined, bvh, contacts } } | { error }
// 입력 { prep: 부품 메쉬 } = 복원용 장면 준비만 → { prep }
// 입력 { helper: { k, K }, text, profile } = 나눠 읽기 보조 작업자(2026-11-06, step-split) — 맡은 루트만 변환·메시
import { loadOc } from '../shape/oc-loader.js';
import { readStepParts, stepProfile, BIG_MESH, mergeMeshes } from '../shape/step-import.js';
import { splitTransfer, planSplit, splitRough, splitFine } from '../shape/step-split.js';
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
        self.postMessage({ h: 'root', i, ms, solids: got.map((it) => ({ root: it.root, j: it.j, v: it.v, diag: it.diag })), preview: pv }, pv ? meshBufs(pv) : []);
      } });
    H = { oc, r, profile };
    self.postMessage({ h: 'transferred', solids: r.items.map((it, x) => ({ x, root: it.root, j: it.j, v: it.v, diag: it.diag })) });
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

// 나눠 읽기 쓸 작업자 수 — 솔리드가 여럿이고 코어·메모리가 넉넉할 때만(작업자마다 파일 전체를 해석해 90 MB 에 약 0.5 GB)
export function splitWorkers(text, profile, nav = self.navigator ?? {}) {
  if (!profile.preview) return 1;
  const nSolid = (text.match(/MANIFOLD_SOLID_BREP|BREP_WITH_VOIDS|FACETED_BREP/g) ?? []).length;
  let K = Math.min(4, Math.max(1, (nav.hardwareConcurrency ?? 4) - 2), nSolid);
  if ((nav.deviceMemory ?? 8) < 8) K = Math.min(K, 2);
  return Math.max(1, K);
}

// ---- 합치는 쪽 ----
function splitLoad(text, profile, K, early, go, post) {
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
        if (d.h === 'parsed') { n = d.n; if (++parsed === K) go('transfer'); return; }
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
          ({ order } = planSplit(solids, profile)); const { qs } = planSplit(solids, profile);
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
      w.postMessage({ helper: { k: h, K }, text, profile });
    });
  });
}

self.onmessage = async (ev) => {
  if (ev.data.helper || ev.data.qs) { try { await helper(ev); } catch (e) { self.postMessage({ error: String(e?.message ?? e) }); } return; }
  try {
    if (ev.data.prep) {   // 복원: 저장된 부품 메쉬 → BVH·합친 메쉬(접촉면은 저장된 설정에 있음)
      const r = prepScene(ev.data.prep);
      self.postMessage({ prep: r }, prepTransfer(r));
      return;
    }
    // 진행 알림(2026-11-05) { key, frac, text } · 미리보기 { preview } · 끝에 단계별 시간 timing
    const tm = {}, text = ev.data.text, profile = stepProfile(ev.data.bytes ?? text.length);
    let cur = 'oc', t0 = performance.now();
    const go = (k) => { const n = performance.now(); tm[cur] = n - t0; t0 = n; cur = k; self.postMessage({ key: k }); };
    const post = (msg, tr = []) => self.postMessage(msg, tr);
    const K = splitWorkers(text, profile);
    let parts = null, info = { workers: 1 };
    if (K >= 2) {   // 나눠 읽기 — 실패하면(중첩 Worker 미지원·메모리 등) 한 번에 읽기로
      go('read');
      try { const r = await splitLoad(text, profile, K, !!ev.data.early, go, post); parts = r.parts; info = { workers: K, slow: r.slow, roots: r.roots }; }
      catch (e) { console.warn('[불러오기] 나눠 읽기 실패 — 한 번에 읽기로', e); self.postMessage({ key: 'read', text: '나눠 읽기 실패 — 한 번에 읽는 중' }); }
    }
    if (!parts) {
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
    const r = prepScene(parts, { contacts: true, ...(profile.big ? { chord: BIG_MESH.linDefl } : {}) });   // 무거운 준비는 여기서(화면 스레드 멈춤 방지). 메시를 완화하면 접촉 판정 현 오차도 같이
    tm.prep = performance.now() - t0;
    self.postMessage({ parts: r.parts, prep: r, timing: tm, relaxed: profile.big ? BIG_MESH : null, info }, prepTransfer(r));
  } catch (e) { self.postMessage({ error: String(e?.message ?? e) }); }
};
