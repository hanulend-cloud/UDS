// 3D 기구 STEP 불러오기 Worker — 입력 { text } → 진행 { stage } → 결과 { parts, prep: { parts(BVH 포함), combined, bvh, contacts } } | { error }
// 입력 { prep: 부품 메쉬 } = 복원용 장면 준비만 → { prep }
import { loadOc } from '../shape/oc-loader.js';
import { readStepParts, stepProfile, BIG_MESH } from '../shape/step-import.js';
import { prepScene, prepTransfer } from './scene-prep.js';

self.onmessage = async (ev) => {
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
    self.postMessage({ key: 'oc' });
    const oc = await loadOc();
    const parts = readStepParts(oc, text, { profile, onStage: go,
      onPreview: (m, i, n) => self.postMessage({ key: 'preview', frac: i / n, text: `부품 ${i}/${n}`, preview: m }, [m.positions.buffer, m.triangles.buffer, m.faceIds.buffer]),
      onPart: (i, n) => self.postMessage({ key: 'mesh', frac: i / n, text: `부품 ${i}/${n}` }) });
    const nT = parts.reduce((s, p) => s + p.triangles.length / 3, 0);
    go('prep');
    self.postMessage({ key: 'prep', frac: 0, text: `부품 ${parts.length}개 · 삼각형 ${Math.round(nT / 1000)}천 개` });
    const r = prepScene(parts, { contacts: true, ...(profile.big ? { chord: BIG_MESH.linDefl } : {}) });   // 무거운 준비는 여기서(화면 스레드 멈춤 방지). 메시를 완화하면 접촉 판정 현 오차도 같이
    tm.prep = performance.now() - t0;
    self.postMessage({ parts: r.parts, prep: r, timing: tm, relaxed: profile.big ? BIG_MESH : null }, prepTransfer(r));
  } catch (e) { self.postMessage({ error: String(e?.message ?? e) }); }
};
