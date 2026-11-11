// 3D 기구 뷰 — spec 2026-10-14 §3, 2026-10-15 m3-cad-ui §2. 부품을 소재 종류별 색으로 그리고, 선택 부품·면을 강조한다.
// 보기: 등각(원근) · 평면 XY / 정면 XZ / 측면 YZ(정투영). 원점 축 + 회전 축 창(gizmo). 관측면 색지도 덧그림, 설계 점검 표식, 단면 평면.
// 클릭(드래그 아님) → onPick({ part, face, ray:{o,d}, worldPerPixel }) 또는 onPick(null)(선택 모드에선 { part:null, face:null, ray }).
// 회전·이동·확대는 TrackballControls(Z 위): 드래그 회전, 휠 확대, 우클릭·Shift/Ctrl 드래그 이동.
import * as THREE from 'three';
import { partOpacity } from './m3/part-look.js';
import { srgbColorsToLinear } from './m3/colormap.js';
import { coneDims } from './m3/cone-dims.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const KIND_COLOR = { milky: 0xf072aa, clear: 0x2a93fb, whiteTrans: 0xf2efe6, opaque: 0x8a909c, pcb: 0x2f6b3a, led: 0xffcf3f };
const KIND_OPACITY = { milky: 0.85, clear: 0.35, whiteTrans: 0.95, opaque: 1, pcb: 1, led: 1 };
const OBS_HI = 0x2ee6ff, LED_SEL = new THREE.Color(0xff7a1a), CONE_DARK = 0xffd84a, CONE_LIGHT = 0xc98a00, CONE_SEL = 0xff7a1a, CONE_SEG = 16, CONE_RAYS = 6;   // 빛 원뿔 = 노란 점선(흐리게), 선택 LED 몸체·원뿔 = 주황 점선
const SEL_TINT = new THREE.Color(0xffb020), FACE_COLOR = new THREE.Color(0xff5a36), OBS_COLOR = new THREE.Color(0x29d3e0);
// 보기 방향(카메라 쪽). 평면은 z 축과 아주 조금 어긋나게 — up(z) 을 바꾸지 않으려고(OrbitControls 회전축은 생성 때 up 으로 고정)
const VIEW_DIR = { top: [0, -1e-3, 1], front: [0, -1, 0], side: [1, 0, 0], iso: [0.7, -1.1, 0.9], bottom: [0, -1e-3, -1], back: [0, 1, 0], side2: [-1, 0, 0] };   // bottom·back·side2 = 반대쪽(2026-11-06)
const SECTION_N = { x: [-1, 0, 0], y: [0, -1, 0], z: [0, 0, -1] };   // 단면: 좌표 ≤ pos 쪽만 남김

export function createMech3dView(canvas, { onPick, onContext = null, gizmo = null, onLost = null }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // 그래픽 메모리 부족 등으로 3D 문맥이 끊기면 화면이 빈 채로 남음 — 알려서 원인을 보이게(2026-11-06)
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost?.(); });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  // 배경 테마: 'light' = 흐린 회색(화면 전체와 통일), 'dark' = 어두운 남색. 빛 원뿔 색도 대비에 맞춤
  const BG = { light: 0xe6e9ee, dark: 0x0f1420 };
  let theme = 'light', CONE_COLOR = CONE_LIGHT, lastOver = null;
  scene.background = new THREE.Color(BG.light);
  const persp = new THREE.PerspectiveCamera(35, 1, 0.1, 1e5);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1e5);
  persp.up.set(0, 0, 1); ortho.up.set(0, 0, 1);
  // orthoHalf = 모델 외곽 구가 들어가는 정투영 반높이(가로가 좁으면 resize 에서 ÷ 가로세로비로 키움 — 시안의 aspect 맞춤)
  let camera = persp, viewName = 'iso', model = { c: new THREE.Vector3(), r: 10 }, orthoHalf = 10;
  // 숨은 캔버스(폭 0)에서는 1 — 이때 맞춤은 pendingFit 으로 미뤘다가 첫 표시(resize) 때 다시 한다
  const aspect = () => (canvas.clientWidth > 0 ? canvas.clientWidth / (canvas.clientHeight || 400) : 1);
  let pendingFit = false;
  const hemi = new THREE.HemisphereLight(0xffffff, 0xa8b0bd, 1.25); scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, 0.9); scene.add(amb);   // 밝은 테마 주변광 — 어두운 테마는 낮춤   // 아래쪽 보조광: 밝은 테마는 밝게(측면이 검게 가라앉지 않게)
  const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(1, -1, 2); scene.add(sun);
  // 원점 축: x 빨강 · y 초록 · z 파랑. CAD 관례대로 원점에 두고(모델 구석으로 옮기지 않음) 길이만 모델 크기(r)에 맞춘다
  const axes = new THREE.AxesHelper(10); scene.add(axes);
  // 자유 회전(2026-11-06): 위·아래 끝에서 멈추던 OrbitControls 대신 TrackballControls — 어느 방향으로든 계속 돎. 왼쪽 = 회전, 휠 = 확대, 우클릭·Shift/Ctrl 드래그 = 이동
  const controls = new TrackballControls(camera, canvas);
  controls.rotateSpeed = 2.5; controls.zoomSpeed = 1.2; controls.panSpeed = 0.8;
  controls.staticMoving = true;          // 놓으면 바로 멈춤(관성 없음)
  controls.keys = ['', '', ''];          // A·S·D 로 모드가 바뀌지 않게(앱 단축키와 겹침)
  // Trackball 은 update() 를 프레임마다 불러야 움직임 — 누르는 동안(+휠 뒤 잠깐)만 돌림
  // 조작 중(드래그·휠)에는 화소 밀도를 1로 낮춰 그린다 — 고DPI 화면에서 전체 장면을 매 프레임 2~3배 픽셀로 그리던 것이 버벅임의 원인(2026-11-10). 멈추면 원래 밀도로 되돌림
  let lowRes = false;
  // 조작 중에는 선·화살표·글씨·외곽선 같은 덧그림도 잠깐 숨긴다(부품이 많은 도면에서 그리기 호출을 줄임) — 멈추면 그대로 되돌림(2026-11-11)
  // 같은 재질 부품을 한 덩어리로 묶은 조작용 메쉬(proxies) — 조작 중에만 보이고, 부품 메쉬는 레이어 1로 옮겨 그리기만 막는다(클릭 판정은 그대로)
  // 색·숨김·재질이 바뀌면 proxyDirty 로 표시해 다음 조작 때 다시 묶음
  let proxies = [], proxyDirty = true;
  const dropProxies = () => { for (const p of proxies) { scene.remove(p); p.geometry.dispose(); } proxies = []; };
  function buildProxies() {
    dropProxies();
    const groups = new Map();
    for (const m of meshes) { if (!m.visible) continue; if (!groups.has(m.material)) groups.set(m.material, []); groups.get(m.material).push(m); }
    for (const [mat, list] of groups) {
      let nv = 0, ni = 0;
      for (const m of list) { nv += m.geometry.getAttribute('position').count; ni += m.geometry.index.count; }
      const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
      let vo = 0, io = 0;
      for (const m of list) {
        const g = m.geometry, P = g.getAttribute('position').array, N = g.getAttribute('normal').array, C = g.getAttribute('color').array, I = g.index.array;
        pos.set(P, vo * 3); nrm.set(N, vo * 3); col.set(C, vo * 3);   // 법선을 빠뜨리면 빛이 0으로 계산돼 어둡게 보인다
        for (let j = 0; j < I.length; j++) idx[io + j] = I[j] + vo;
        vo += P.length / 3; io += I.length;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      const p = new THREE.Mesh(g, mat); p.renderOrder = list[0].renderOrder; p.visible = false;
      scene.add(p); proxies.push(p);
    }
    proxyDirty = false;
  }
  // 조작 중에는 선·화살표·글씨·외곽선 같은 덧그림을 잠깐 숨기고 묶음 메쉬를 보인다. 선 보기(면이 감춰진 상태)는 그대로 둔다. 멈추면 전부 되돌림(2026-11-11)
  let moveHidden = [];
  const setMoveHidden = (on) => {
    if (!on) {
      for (const o of moveHidden) o.visible = true;
      moveHidden = [];
      for (const p of proxies) p.visible = false;
      for (const m of meshes) m.layers.set(0);
      return;
    }
    if (lines) return;
    if (proxyDirty) buildProxies();
    const extra = [pathGroup, overlay, markers, obsMesh, selOutline, ...meshes.map((m) => m.userData.edges)];
    moveHidden = extra.filter((o) => o?.visible);
    for (const o of moveHidden) o.visible = false;
    for (const m of meshes) m.layers.set(1);
    for (const p of proxies) p.visible = true;
  };
  const setLowRes = (on) => {
    if (lowRes === on) return false;
    lowRes = on;
    renderer.setPixelRatio(on ? Math.min(window.devicePixelRatio || 1, 1) : window.devicePixelRatio || 1);
    setMoveHidden(on);
    return true;
  };
  let spin = 0, spinUntil = 0;
  const tick = () => { controls.update(); if (spinUntil === Infinity || performance.now() < spinUntil) spin = requestAnimationFrame(tick); else { spin = 0; if (setLowRes(false)) render(); } };
  const wake = (ms) => { setLowRes(true); spinUntil = ms === Infinity ? Infinity : Math.max(spinUntil === Infinity ? 0 : spinUntil, performance.now() + ms); if (!spin) spin = requestAnimationFrame(tick); };
  controls.addEventListener('start', () => wake(Infinity));
  controls.addEventListener('end', () => { spinUntil = 0; wake(300); });
  canvas.addEventListener('wheel', () => wake(300), { passive: true });
  // Shift/Ctrl + 왼쪽 드래그 = 화면 이동 — Trackball 은 mouseButtons 값을 동작이 아니라
  // 실제 event.button 번호로 비교하므로, 수정키를 누른 왼쪽 버튼이 PAN 분기로 가게 LEFT/RIGHT 번호를 맞바꾼다.
  canvas.addEventListener('pointerdown', (e) => {
    const panWithLeft = e.button === THREE.MOUSE.LEFT && (e.shiftKey || e.ctrlKey);
    controls.mouseButtons.LEFT = panWithLeft ? THREE.MOUSE.RIGHT : THREE.MOUSE.LEFT;
    controls.mouseButtons.RIGHT = panWithLeft ? THREE.MOUSE.LEFT : THREE.MOUSE.RIGHT;
  }, { capture: true });
  // 부품 재질은 투명도별로 공유(2026-11-06) — 부품마다 따로 만들면 큰 도면(부품 4500개)의 첫 그리기에서 재질 준비만 4.7초 걸려 화면이 멈췄음
  const partMats = new Map();
  const partMat = (op) => {
    const k = Math.round(op * 1000);
    let m = partMats.get(k);
    if (!m) { m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, clippingPlanes: clip, opacity: k / 1000, transparent: k < 1000, depthWrite: k >= 1000 }); partMats.set(k, m); }
    return m;
  };
  const clip = [];                       // 단면 평면(0 또는 1개) — 부품·덧그림 재질이 같은 배열을 공유

  // 회전 축 창(왼쪽 아래 작은 캔버스): 카메라 방향만 따라 도는 축 + X/Y/Z 글자
  let gz = null;
  if (gizmo) {
    const r = new THREE.WebGLRenderer({ canvas: gizmo, antialias: true, alpha: true }), s = new THREE.Scene(), c = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    c.up.set(0, 0, 1); s.add(new THREE.AxesHelper(1.2));
    const lbl = (t, col, p) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const x = cv.getContext('2d'); x.font = '900 104px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';   // 어두운·밝은 배경 모두 보이게 어두운 테두리
      x.lineWidth = 18; x.strokeStyle = '#0b0f17'; x.strokeText(t, 64, 68); x.fillStyle = col; x.fillText(t, 64, 68);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false })); sp.position.set(...p); sp.scale.set(0.95, 0.95, 0.95); s.add(sp);
    };
    lbl('X', '#ff6b6b', [1.5, 0, 0]); lbl('Y', '#5fe07a', [0, 1.5, 0]); lbl('Z', '#6fb0ff', [0, 0, 1.5]);
    gz = { r, s, c };
  }
  const render = () => {
    if (pathItems.length) pathLayout();   // 광경로 화살표·글씨 = 화면 px 크기
    if (obsUi) obsLayout();
    renderer.render(scene, camera);
    if (gz) { gz.c.position.copy(camera.position).sub(controls.target).normalize().multiplyScalar(5.6); gz.c.up.copy(camera.up); gz.c.lookAt(0, 0, 0); gz.r.render(gz.s, gz.c); }
  };
  // 원근 near/far 를 모델 둘레로 좁힌다(r≈700mm 같은 큰 모델에서 깊이 정밀도) — 카메라 ~ 모델 중심 거리 기준.
  // (controls.target 은 이동(pan)으로 모델에서 멀어질 수 있어 모델 중심을 쓴다.) 정투영은 거리가 고정이라 setView 값 그대로
  function fitDepth() {
    if (!camera.isPerspectiveCamera) return;
    const { c, r } = model, d = camera.position.distanceTo(c);
    const near = Math.max(r / 1000, d - 1.5 * r), far = d + 1.5 * r;
    if (near !== camera.near || far !== camera.far) { camera.near = near; camera.far = far; camera.updateProjectionMatrix(); }
  }
  controls.addEventListener('change', () => { fitDepth(); render(); });

  let xray = false, dim = null, lines = false, obsShow = true;   // obsShow = 관측면 보이기(테두리·채움·화살표·색지도)
  // 선 보기(2026-11-08): 면은 감추고(클릭 판정은 그대로) 부품마다 다른 색의 외곽 모서리선만 — 부품 구조 확인용
  const HIDE_MAT = new THREE.MeshBasicMaterial({ visible: false });
  // 색 = 부품 소재·면 처리(looks[i].line, part-look.js lineLook) · LED 도면 부품은 종류별. 같은 계열끼리도 구분되게 밝기를 부품마다 조금씩
  const LINE_KIND = { led: 0x8e4fd0, pcb: 0x2f6b3a, opaque: 0x7a808a };
  const lineColor = (i) => {
    const c = new THREE.Color(looks[i]?.line ?? LINE_KIND[kinds[i]] ?? 0x3a4a8c), hsl = c.getHSL({});
    const l = hsl.l + (((i * 0.37) % 1) - 0.5) * 0.14 + (theme === 'dark' ? 0.18 : 0);
    return c.setHSL(hsl.h, hsl.s, Math.max(0.2, Math.min(0.8, l)));
  };
  function edgeOf(m) {
    let e = m.userData.edges;
    if (!e) { e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), new THREE.LineBasicMaterial({ clippingPlanes: clip, transparent: true })); m.add(e); m.userData.edges = e; }
    return e;
  }
  const fatMats = new Set();   // 굵은 선 재질 — 창 크기가 바뀌면 resolution 갱신
  let pathGroup = null, pathItems = [], obsUi = null, obsFillMesh = null;   // 광경로 그룹 · 화면 크기 맞춤 항목 · 관측면 표시(render 가 쓰므로 위에 선언)
  let looks = [];   // 부품별 색·투명도(없으면 종류 기본값)
  let meshes = [], partsRef = [], kinds = [], sel = null, obsSet = new Set(), overlay = null, obsMesh = null, markers = null, coneMeshes = [];

  function resize() {
    if (canvas.clientWidth === 0) return;
    if (pendingFit) { pendingFit = false; setView(viewName); return; }   // 숨김 중 미룬 맞춤 — setView 가 resize 를 다시 부른다
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(lowRes ? Math.min(dpr, 1) : dpr); if (gz) gz.r.setPixelRatio(dpr);
    const w = canvas.clientWidth, h = canvas.clientHeight || 400, a = w / h, half = orthoHalf / Math.min(1, a);
    renderer.setSize(w, h, false);
    controls.handleResize();   // Trackball 은 화면 크기로 마우스 이동량을 잼
    for (const m of fatMats) m.resolution.set(w, h);   // 굵은 선(관측면 테두리) 두께 = 화면 px
    persp.aspect = a; persp.updateProjectionMatrix();
    ortho.left = -half * a; ortho.right = half * a; ortho.top = half; ortho.bottom = -half; ortho.updateProjectionMatrix();
    if (gz) gz.r.setSize(gizmo.clientWidth || 90, gizmo.clientHeight || 90, false);
    render();
  }
  new ResizeObserver(resize).observe(canvas);

  function colorize(i) {
    proxyDirty = true;
    const m = meshes[i], p = partsRef[i], col = m.geometry.getAttribute('color');
    const base = new THREE.Color(looks[i]?.color ?? KIND_COLOR[kinds[i]]), op0 = looks[i]?.opacity ?? KIND_OPACITY[kinds[i]];
    const picked = sel?.part === i || multiSel.has(i), partCol = picked ? (kinds[i] === 'led' ? LED_SEL : base.clone().lerp(SEL_TINT, 0.6)) : base;
    const T = p.triangles;
    for (let t = 0; t < T.length / 3; t++) {
      const isSel = sel?.part === i && sel.face === p.faceIds[t];
      const c = isSel ? FACE_COLOR : obsSet.has(`${i}|${p.faceIds[t]}`) ? OBS_COLOR : partCol;
      for (let j = 0; j < 3; j++) col.setXYZ(T[t * 3 + j], c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    const op = partOpacity({ kind: kinds[i], op0, xray, ghost: !!ghost?.(i), dim: !!dim?.(i), picked });
    m.material = partMat(op); m.renderOrder = m.material.transparent ? 1 : 0;
    if (lines) {
      const e = edgeOf(m); e.visible = true;
      e.material.color.copy(picked ? (kinds[i] === 'led' ? LED_SEL : SEL_TINT) : lineColor(i));
      e.material.opacity = dim?.(i) || (ghost?.(i) && !picked) ? 0.25 : 1;
      m.material = HIDE_MAT;
    } else if (m.userData.edges) m.userData.edges.visible = false;
  }

  // 보기 전환: 등각 = 원근, 나머지 = 정투영. 모델 외곽 구(model)에 맞춘다
  function setView(name) {
    viewName = VIEW_DIR[name] ? name : 'iso';
    const { c, r } = model, d = new THREE.Vector3(...VIEW_DIR[viewName]).normalize();
    camera = viewName === 'iso' ? persp : ortho;
    // 원근: 세로 반화각 17.5° 로 외곽 구가 들어가는 거리, 가로가 좁으면 ÷ 가로세로비(시안과 같은 맞춤)
    const dist = viewName === 'iso' ? ((r / Math.sin((17.5 * Math.PI) / 180)) * 1.1) / Math.min(1, aspect()) : r * 4;
    camera.position.copy(c).addScaledVector(d, dist);
    camera.near = Math.max(1e-3, r / 100); camera.far = dist + r * 100;
    if (camera.isOrthographicCamera) { orthoHalf = r * 1.1; camera.zoom = 1; }
    controls.object = camera; controls.target.copy(c); camera.up.set(0, 0, 1); camera.lookAt(c);   // 자유 회전으로 기울어진 위쪽을 Z 로 되돌림
    controls.minDistance = r * 0.02;
    fitDepth(); camera.updateProjectionMatrix();   // resize() 가 숨김으로 건너뛰어도 near/far·zoom 반영
    if (canvas.clientWidth === 0) pendingFit = true;   // 가로세로비를 모름 → 첫 표시 때 다시 맞춤
    resize(); controls.update(); render();
  }
  const fit = () => setView(viewName);
  // 맞춤(2026-10-30): 지금 보이는(숨기지 않은) 부품 전체를 창에 꽉 차게 — 보는 방향(회전)은 그대로, 중심·거리·확대만.
  // 정투영 = 보이는 외곽 상자 8꼭짓점을 화면 축에 투영한 크기에 맞춤, 원근 = 외곽 구에 맞춤
  function fitAll() {
    const box = new THREE.Box3(); meshes.forEach((m) => { if (m.visible) box.expandByObject(m); });
    if (box.isEmpty()) meshes.forEach((m) => box.expandByObject(m));
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2 || 10;
    const d = camera.position.clone().sub(controls.target); if (d.lengthSq() < 1e-12) d.set(...VIEW_DIR[viewName] ?? [1, 1, 1]); d.normalize();
    const a = aspect();
    if (camera.isOrthographicCamera) {
      camera.updateMatrixWorld();   // 화면 가로·세로 축 = 카메라 행렬 열(평면 보기처럼 up ∥ 보는 방향이어도 됨 — 회전은 바꾸지 않으므로 그대로)
      const rt = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      let ex = 0, ey = 0;
      for (let k = 0; k < 8; k++) { const p = new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).sub(c); ex = Math.max(ex, Math.abs(p.dot(rt))); ey = Math.max(ey, Math.abs(p.dot(up))); }
      orthoHalf = Math.max(ey, ex / a, r * 0.02) * Math.min(1, a) * 1.12; camera.zoom = 1;
      camera.position.copy(c).addScaledVector(d, r * 4); camera.near = Math.max(1e-3, r / 100); camera.far = r * 104;
      controls.target.copy(c); camera.updateProjectionMatrix(); resize(); controls.update(); render(); return;   // lookAt 다시 안 함(평면 보기 회전 유지)
    } else {
      // 원근: 상자 8꼭짓점이 화각 안에 들도록 하는 가장 가까운 거리(꼭짓점의 화면 가로·세로 / tan 반화각 + 앞뒤 깊이)
      camera.updateMatrixWorld();
      const rt = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const tv = Math.tan((camera.fov * Math.PI) / 360) / 1.15, th = tv * a;   // 1.15 = 여백(오른쪽 보기 단추 자리 포함)
      let dist = 0;
      for (let k = 0; k < 8; k++) { const p = new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).sub(c); const z = p.dot(d); dist = Math.max(dist, z + Math.abs(p.dot(rt)) / th, z + Math.abs(p.dot(up)) / tv); }
      camera.position.copy(c).addScaledVector(d, Math.max(dist, r * 0.05));
    }
    controls.target.copy(c); camera.lookAt(c);
    fitDepth(); camera.updateProjectionMatrix(); resize(); controls.update(); render();
  }

  // parts: 런타임 scene.parts, kindsOf: 부품별 소재 종류 배열, keepCamera: 카메라를 다시 맞추지 않음(LED 위치 보정 등)
  function setParts(parts, kindsOf, { keepCamera = false, looks: lookOf = [] } = {}) {
    for (const m of meshes) { scene.remove(m); m.geometry.dispose(); m.userData.edges?.geometry.dispose(); m.userData.edges?.material.dispose(); }   // 재질은 공유 — 버리지 않음
    dropProxies(); proxyDirty = true;
    partsRef = parts; kinds = kindsOf.slice(); looks = lookOf;
    meshes = parts.map((p, i) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.positions.length), 3));
      g.setIndex(new THREE.BufferAttribute(p.triangles, 1));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, partMat(1));
      m.userData.part = i;
      m.visible = !hiddenFn?.(i);
      scene.add(m);
      return m;
    });
    meshes.forEach((_, i) => colorize(i));
    updateOutline();   // 메쉬가 새로 만들어졌으므로 선택 외곽선도 다시
    const box = new THREE.Box3(); meshes.forEach((m) => box.expandByObject(m));
    model = { c: box.getCenter(new THREE.Vector3()), r: box.getSize(new THREE.Vector3()).length() / 2 || 10 };
    axes.scale.setScalar((model.r * 0.3) / 10);
    liftObs();
    if (keepCamera) { render(); return; }
    setView(viewName);
  }

  // 바뀐 부품만 재착색
  function setKinds(kindsOf, lookOf = []) {
    const old = kinds, oldL = looks; kinds = kindsOf.slice(); looks = lookOf;
    meshes.forEach((_, i) => { if (old[i] !== kinds[i] || oldL[i]?.color !== looks[i]?.color || oldL[i]?.opacity !== looks[i]?.opacity || oldL[i]?.line !== looks[i]?.line) colorize(i); }); render();
  }
  // LED 빛 원뿔(spec m3-cad-ui §4a) — 꼭짓점 = 발광점, 축 = 발광 방향, 반각 = 배광/2(그림은 80° 까지), 길이 len(축 방향).
  // 원뿔 여럿을 기하 하나로 합친다(LED ~120개도 메쉬 1개). 삼각형 k·CONE_SEG… = 원뿔 k → userData.nums[k] = LED 번호(클릭용)
  function coneMesh(list, color, opacity) {
    const P = new Float32Array(list.length * (CONE_SEG + 1) * 3), I = new Uint32Array(list.length * CONE_SEG * 3);
    list.forEach((c, k) => {
      const a = new THREE.Vector3(...c.axis).normalize(), u = new THREE.Vector3(Math.abs(a.x) < 0.9 ? 1 : 0, Math.abs(a.x) < 0.9 ? 0 : 1, 0).cross(a).normalize(), w = a.clone().cross(u);
      const { ax: len, r } = coneDims(c.half, c.len > 0 ? c.len : 4), b0 = k * (CONE_SEG + 1);
      P.set(c.pos, b0 * 3);
      for (let i = 0; i < CONE_SEG; i++) {
        const t = (2 * Math.PI * i) / CONE_SEG, q = (b0 + 1 + i) * 3;
        for (let j = 0; j < 3; j++) P[q + j] = c.pos[j] + a.getComponent(j) * len + r * (Math.cos(t) * u.getComponent(j) + Math.sin(t) * w.getComponent(j));
        I.set([b0, b0 + 1 + i, b0 + 1 + ((i + 1) % CONE_SEG)], (k * CONE_SEG + i) * 3);
      }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(new THREE.BufferAttribute(I, 1));
    // 면은 그리지 않고 클릭 판정에만 쓴다(colorWrite 끔) — 보이는 것은 coneLines 의 점선
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, colorWrite: false, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    m.renderOrder = 2; m.userData.nums = list.map((c) => c.n);
    return m;
  }
  // 원뿔 윤곽 점선: 꼭짓점→테두리 선 CONE_RAYS 개(테두리 원은 그리지 않음 — LED 마다 노란 원이 화면을 가림)
  function coneLines(list, color, opacity) {
    const pts = [];
    list.forEach((c) => {
      const a = new THREE.Vector3(...c.axis).normalize(), u = new THREE.Vector3(Math.abs(a.x) < 0.9 ? 1 : 0, Math.abs(a.x) < 0.9 ? 0 : 1, 0).cross(a).normalize(), w = a.clone().cross(u);
      const { ax: len, r } = coneDims(c.half, c.len > 0 ? c.len : 4), o = new THREE.Vector3(...c.pos);
      const rim = (t) => o.clone().addScaledVector(a, len).addScaledVector(u, r * Math.cos(t)).addScaledVector(w, r * Math.sin(t));
      for (let i = 0; i < CONE_RAYS; i++) pts.push(o.clone(), rim((2 * Math.PI * i) / CONE_RAYS));
    });
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const ls = new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity, depthWrite: false, depthTest: false }));
    ls.computeLineDistances(); ls.renderOrder = 2;
    return ls;
  }
  // over = { obsFaces:[{part,face}], line3d: Float32Array(x,y,z...) | null, cones:[{pos,axis,half(°),len,n}], coneSel: LED 번호 | null } — 관측면 강조, 라인, LED 빛 원뿔
  // 원뿔은 표시 전용(관측면 색지도·점검 표식과 별개 무리) · 선택 모드가 아닐 때 클릭하면 onPick({ led: n })
  function setTheme(t) {
    theme = t === 'dark' ? 'dark' : 'light';
    scene.background = new THREE.Color(BG[theme]);
    CONE_COLOR = theme === 'dark' ? CONE_DARK : CONE_LIGHT;
    hemi.groundColor.set(theme === 'dark' ? 0x404050 : 0xa8b0bd); hemi.intensity = theme === 'dark' ? 1.0 : 1.25; amb.intensity = theme === 'dark' ? 0 : 0.9;
    if (lines) meshes.forEach((_, i) => colorize(i));
    if (lastOver) setOverlay(lastOver); else render();
  }
  // 관측면 테두리 — 고른 면 삼각형들의 바깥 모서리(한 번만 쓰인 모서리)만
  function obsOutline(faces) {
    if (!faces.length) return null;
    const want = new Map(); for (const f of faces) { if (!want.has(f.part)) want.set(f.part, new Set()); want.get(f.part).add(f.face); }
    const pts = [];
    for (const [pi, set] of want) {
      const p = partsRef[pi]; if (!p) continue;
      const P = p.positions, T = p.triangles, cnt = new Map(), key = (i) => `${P[3 * i].toFixed(3)},${P[3 * i + 1].toFixed(3)},${P[3 * i + 2].toFixed(3)}`;
      for (let t = 0; t < T.length / 3; t++) {
        if (!set.has(p.faceIds[t])) continue;
        for (let e = 0; e < 3; e++) { const a = T[3 * t + e], b = T[3 * t + ((e + 1) % 3)], ka = key(a), kb = key(b), k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`, c = cnt.get(k); if (c) c.n++; else cnt.set(k, { n: 1, a, b }); }
      }
      for (const { n, a, b } of cnt.values()) if (n === 1) pts.push(new THREE.Vector3(P[3 * a], P[3 * a + 1], P[3 * a + 2]), new THREE.Vector3(P[3 * b], P[3 * b + 1], P[3 * b + 2]));
    }
    if (!pts.length) return null;
    // 선 2겹(화면 px 두께, 가려도 보임): 바깥 짙은 테두리 2.5px + 안쪽 밝은 하늘색 1.2px — 과하지 않게(2026-11-03, 기존 4/2px)
    const arr = new Float32Array(pts.length * 3); pts.forEach((v, k) => arr.set([v.x, v.y, v.z], 3 * k));
    const grp = new THREE.Group(), w = canvas.clientWidth || 800, h = canvas.clientHeight || 400;
    for (const [col, lw, ro] of [[0x062a33, 2.5, 4], [OBS_HI, 1.2, 4.1]]) {
      const g = new LineSegmentsGeometry(); g.setPositions(arr);
      const m = new LineMaterial({ color: col, linewidth: lw, depthTest: false, transparent: true, opacity: 0.95 }); m.resolution.set(w, h); fatMats.add(m);
      m.addEventListener('dispose', () => fatMats.delete(m));
      const ls = new LineSegments2(g, m); ls.renderOrder = ro; grp.add(ls);
    }
    return grp;
  }
  // 관측면 채움(하늘색 반투명, 가려도 보임) — opacity: 투시 0.4 · 보통 0.3 · 결과 색지도 위 0.12
  function obsFill(faces, opacity = 0.4) {
    const pos = [];
    for (const f of faces) {
      const p = partsRef[f.part]; if (!p) continue;
      const P = p.positions, T = p.triangles;
      for (let t = 0; t < T.length / 3; t++) if (p.faceIds[t] === f.face) for (let j = 0; j < 3; j++) { const v = T[3 * t + j]; pos.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]); }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: OBS_HI, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 3; return m;
  }
  // "관측면" 글자 — 빛 방향 화살표 끝(가려도 보임)
  // 관측면 표시(글씨 + 빛 방향 화살표) — 화면 px 크기(확대·축소와 무관), obsLayout() 이 render 마다 맞춤
  const OBS_ARROW_PX = 46, OBS_HEAD_PX = 13, OBS_TEXT_PX = 18;
  function obsLayout() {
    const o = obsUi, u = worldPerPx(o.base), L = OBS_ARROW_PX * u, hl = OBS_HEAD_PX * u;
    const tail = o.incoming ? o.base.clone().addScaledVector(o.a, L) : o.base.clone();
    const pa = o.shaft.geometry.getAttribute('position'), e = tail.clone().addScaledVector(o.dir, L - hl);
    pa.setXYZ(0, tail.x, tail.y, tail.z); pa.setXYZ(1, e.x, e.y, e.z); pa.needsUpdate = true;
    o.head.scale.setScalar(hl); o.head.position.copy(tail).addScaledVector(o.dir, L - hl / 2);
    o.label.scale.set(OBS_TEXT_PX * u * o.label.userData.aspect, OBS_TEXT_PX * u, 1);
    o.label.position.copy(o.base).addScaledVector(o.a, L + OBS_TEXT_PX * u);
  }
  function setDim(fn) { dim = fn; meshes.forEach((_, i) => colorize(i)); render(); }
  function setLines(on) { lines = !!on; meshes.forEach((_, i) => colorize(i)); render(); }
  function setObsShow(on) { obsShow = !!on; if (obsMesh) obsMesh.visible = obsShow; if (lastOver) setOverlay(lastOver); else render(); }
  function setXray(on) { xray = !!on; meshes.forEach((_, i) => colorize(i)); if (lastOver) setOverlay(lastOver); else render(); }
  // 화면 1 px 이 pos 에서 몇 mm 인지 — 광경로 화살표·글씨를 확대·축소와 상관없이 같은 화면 크기로(render 마다)
  function worldPerPx(pos) {
    const h = canvas.clientHeight || 400;
    if (camera.isOrthographicCamera) return (camera.top - camera.bottom) / camera.zoom / h;
    const d = Math.max(1e-6, pos.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())));
    return (2 * d * Math.tan((camera.fov * Math.PI) / 360)) / h;
  }
  // 광경로 화살표(app.drawLightPaths) — paths = [{ pts:[[x,y,z]…], share, label, offset, names?, namePts?(이름마다 pts 번호 — 없으면 0,1,2…), axis?, side? }]
  // 선 = 화면 px 두께(굵기 ∝ 비중), 화살촉·점·이름표·% 글씨 = 화면 px 크기 — pathLayout() 이 render 마다 크기·위치를 맞춤
  const HEAD_PX = 11, DOT_PX = 4, NAME_PX = 15, PCT_PX = 18, LADDER_PX = 22, SIDE_PX = 70;
  function spriteText(text, w, h, font, fg, bg) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
    c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 1);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true })); sp.renderOrder = 6; sp.userData.aspect = w / h;
    return sp;
  }
  function pathLayout() {
    for (const it of pathItems) {
      for (const hd of it.heads) { const u = worldPerPx(hd.tip) * HEAD_PX; hd.mesh.scale.setScalar(u); hd.mesh.position.copy(hd.tip).addScaledVector(hd.dir, -u / 2); }
      for (const dt of it.dots) dt.mesh.scale.setScalar(worldPerPx(dt.at) * DOT_PX);
      if (it.names) {
        const { V, n, ax, sd, labels, leaders } = it.names, u = worldPerPx(V[0]);
        const base = V[0].clone().addScaledVector(sd, -SIDE_PX * u), span = Math.max(V[0].distanceTo(V[n - 1]), LADDER_PX * u * (n - 1));
        labels.forEach((sp, j) => {
          sp.scale.set(NAME_PX * u * sp.userData.aspect, NAME_PX * u, 1);
          sp.position.copy(base).addScaledVector(ax, n > 1 ? (span * j) / (n - 1) : 0);
          const e = sp.position.clone().addScaledVector(sd, (NAME_PX * u * sp.userData.aspect) / 2), pa = leaders[j].geometry.getAttribute('position');
          pa.setXYZ(0, e.x, e.y, e.z); pa.setXYZ(1, V[j].x, V[j].y, V[j].z); pa.needsUpdate = true;
        });
      }
      const u = worldPerPx(it.end), sp = it.pct;
      sp.scale.set(PCT_PX * u * sp.userData.aspect, PCT_PX * u, 1);
      const wpx = PCT_PX * sp.userData.aspect;
      sp.position.copy(it.end).addScaledVector(it.side, u * (wpx / 2 + 10 + it.offset * (wpx + 8)));   // 끝점 옆 · 두 번째 경로 % 는 한 칸 더 옆(겹침 방지)
    }
  }
  function setLightPaths(paths) {
    if (pathGroup) { scene.remove(pathGroup); pathGroup.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); }); pathGroup = null; }
    pathItems = [];
    if (paths?.length) {
      pathGroup = new THREE.Group();
      const COL = [0xff5fa2, 0xb388ff], w = canvas.clientWidth || 800, h = canvas.clientHeight || 400;
      const coneG = new THREE.ConeGeometry(0.42, 1, 12), dotG = new THREE.SphereGeometry(1, 10, 8);
      for (const p of paths) {
        const col = COL[p.offset % COL.length], sh = Math.max(0.15, Math.min(1, p.share));
        const V = p.pts.map((q) => new THREE.Vector3(...q)), mat = new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.9 });
        const it = { heads: [], dots: [], names: null, pct: null, end: V[V.length - 1], side: new THREE.Vector3(...(p.side ?? [1, 0, 0])).normalize(), offset: p.offset };
        // 줄기: 화면 px 두께 선(비중이 클수록 굵게)
        const seg = [];
        for (let i = 0; i + 1 < V.length; i++) if (V[i].distanceTo(V[i + 1]) > 1e-6) seg.push(V[i].x, V[i].y, V[i].z, V[i + 1].x, V[i + 1].y, V[i + 1].z);
        if (seg.length) {
          const g = new LineSegmentsGeometry(); g.setPositions(seg);
          const lm = new LineMaterial({ color: col, linewidth: 2 + 3 * sh, depthTest: false, transparent: true, opacity: 0.9 }); lm.resolution.set(w, h); fatMats.add(lm); lm.addEventListener('dispose', () => fatMats.delete(lm));
          const ls = new LineSegments2(g, lm); ls.renderOrder = 5; pathGroup.add(ls);
        }
        for (let i = 0; i + 1 < V.length; i++) {
          const d = V[i + 1].clone().sub(V[i]); if (d.length() < 1e-6) continue;
          const dir = d.normalize(), cone = new THREE.Mesh(coneG, mat); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); cone.renderOrder = 5; pathGroup.add(cone);
          it.heads.push({ mesh: cone, tip: V[i + 1], dir });
        }
        // 첫 경로: 머무는 곳마다 점 + 이름표(옆으로 빼서 축 방향으로 고르게 — 얇은 적층에서도 안 겹침) + 가는 지시선
        if (p.names?.length) {
          const NV = p.namePts ? p.namePts.map((k) => V[k]) : V, n = p.names.length, lmat = new THREE.LineBasicMaterial({ color: 0x9aa7b8, depthTest: false, transparent: true, opacity: 0.8 }), labels = [], leaders = [];
          p.names.forEach((nm, j) => {
            const dot = new THREE.Mesh(dotG, mat); dot.position.copy(NV[j]); dot.renderOrder = 5; pathGroup.add(dot); it.dots.push({ mesh: dot, at: NV[j] });
            const t3 = spriteText(nm, 128, 32, '20px sans-serif', '#e6ebf2', 'rgba(20,26,38,.78)'); pathGroup.add(t3); labels.push(t3);
            const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([NV[j].clone(), NV[j].clone()]), lmat); ln.renderOrder = 5; pathGroup.add(ln); leaders.push(ln);
          });
          it.names = { V: NV, n, ax: new THREE.Vector3(...(p.axis ?? [0, 0, 1])).normalize(), sd: new THREE.Vector3(...(p.side ?? [1, 0, 0])).normalize(), labels, leaders };
        }
        it.pct = spriteText(p.label, 120, 36, 'bold 24px sans-serif', '#' + col.toString(16).padStart(6, '0'), 'rgba(20,26,38,.75)'); pathGroup.add(it.pct);
        pathItems.push(it);
      }
      scene.add(pathGroup);
    }
    render();
  }
  function setOverlay(over) {
    lastOver = over;
    const prev = obsSet;
    const oFaces = obsShow ? over.obsFaces ?? [] : [];
    obsSet = new Set(oFaces.map((f) => `${f.part}|${f.face}`));
    if (overlay) { scene.remove(overlay); overlay.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); }
    overlay = new THREE.Group(); coneMeshes = [];
    if (over.line3d?.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(over.line3d, 3));
      const ln = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x29d3e0, depthTest: false }));
      ln.renderOrder = 2; overlay.add(ln);
    }
    // 관측면 강조: 고른 면들의 바깥 테두리(밝은 하늘색, 가려도 보이게) + 빛 방향 화살표(over.obsArrow = { pos, axis, len, incoming })
    const ob = obsOutline(oFaces);
    if (ob) overlay.add(ob);
    // 색지도가 있으면 하늘색 채움을 투명하게 두어 2D 와 같은 원색·대비를 유지한다(메쉬는 클릭 판정용으로 남김).
    const of = obsFill(oFaces, obsMesh ? 0 : xray ? 0.4 : 0.3);
    obsFillMesh = of;   // 클릭 판정용(앞 부품에 가려도 관측면을 선택)
    if (of) overlay.add(of);
    const oa = obsShow ? over.obsArrow : null;
    obsUi = null;
    if (oa) {   // 들어오는 빛 = 면을 향해, 나가는 빛 = 면에서 밖으로 — 길이·글씨는 화면 px(obsLayout)
      const a = new THREE.Vector3(...oa.axis).normalize(), dirv = oa.incoming ? a.clone().negate() : a.clone();
      const shaft = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: OBS_HI, depthTest: false })); shaft.renderOrder = 4; overlay.add(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1, 16), new THREE.MeshBasicMaterial({ color: OBS_HI, depthTest: false }));
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirv); head.renderOrder = 4; overlay.add(head);
      const label = spriteText('관측면', 112, 34, 'bold 22px sans-serif', '#2ee6ff', 'rgba(10,40,48,.8)'); overlay.add(label);
      obsUi = { base: new THREE.Vector3(...oa.pos), a, dir: dirv, incoming: !!oa.incoming, shaft, head, label };
    }
    const cs = over.cones ?? [], on = cs.filter((c) => c.n === over.coneSel), off = cs.filter((c) => c.n !== over.coneSel);
    if (off.length) { coneMeshes.push(coneMesh(off, CONE_COLOR, 0)); overlay.add(coneLines(off, CONE_COLOR, 0.45)); }
    if (on.length) { coneMeshes.push(coneMesh(on, CONE_SEL, 0)); overlay.add(coneLines(on, CONE_SEL, 0.9)); }
    coneMeshes.forEach((m) => overlay.add(m));
    scene.add(overlay);
    const touched = new Set([...prev, ...obsSet].map((k) => +k.split('|')[0]));
    meshes.forEach((_, i) => { if (touched.has(i)) colorize(i); }); render();
  }
  // 선택 강조: 색 강조 + 밝은 외곽선(다른 부품에 가려도 보이게 깊이 검사 끔)
  let selOutline = null;
  function updateOutline() {
    if (selOutline) { scene.remove(selOutline); selOutline.geometry.dispose(); selOutline.material.dispose(); selOutline = null; }
    const m = sel?.part != null ? meshes[sel.part] : null;
    if (m && !m.visible) return;   // 숨긴 부품은 외곽선도 감춤
    if (!m) return;
    selOutline = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), new THREE.LineBasicMaterial({ color: 0xffb020, depthTest: false, transparent: true, opacity: 0.95 }));
    selOutline.renderOrder = 3;
    scene.add(selOutline);
  }
  let multiSel = new Set();   // 함께 고른 부품(Shift+클릭) — 같은 색으로 강조
  function setSelection(s, multi = []) {
    const prevPart = sel?.part;
    sel = s; multiSel = new Set(multi);
    meshes.forEach((_, i) => colorize(i));
    if (prevPart !== sel?.part || !selOutline !== !sel) updateOutline();
    render();
  }
  // 선택 모드별 클릭 대상·투시: pickable(i) = 클릭 가능한 부품, ghostOf(i) = 반투명으로 비출 부품(둘 다 null = 전체/없음)
  let pickable = null, ghost = null, hiddenFn = null;
  // 보기 켜기/끄기: hiddenOf(i) = true 이면 그리지 않고 클릭도 안 됨(null = 모두 보임)
  function setHidden(hiddenOf) {
    hiddenFn = hiddenOf;
    meshes.forEach((m, i) => { m.visible = !hiddenFn?.(i); });
    proxyDirty = true;
    updateOutline(); render();
  }
  function setPickMode(pickableFn, ghostFn) { pickable = pickableFn; ghost = ghostFn; meshes.forEach((_, i) => colorize(i)); render(); }

  // 단면: sec = { axis:'x'|'y'|'z', pos } | null
  function setSection(sec) {
    clip.length = 0;
    if (sec) clip.push(new THREE.Plane(new THREE.Vector3(...SECTION_N[sec.axis]), sec.pos));
    render();
  }
  // 관측면 색지도 덧그림(colormap.buildObsOverlay) — 모양은 격자가 바뀔 때만, 색은 setObsColors 로 자주.
  // geom = { positions, triangles, dir? }: buildObsOverlay 가 이미 0.01mm 띄웠으므로(가상 검출면), 큰 모델(lift = max(0.01, r·1e-4))에서
  // 모자라는 만큼만 관측 방향 dir 로 메쉬를 더 띄운다(dir 없으면 polygonOffset 만)
  let obsDir = null;
  function liftObs() {
    if (!obsMesh) return;
    const extra = Math.max(0.01, model.r * 1e-4) - 0.01;
    if (obsDir && extra > 0) obsMesh.position.set(...obsDir).normalize().multiplyScalar(extra); else obsMesh.position.set(0, 0, 0);
  }
  function setObsSurface(geom) {
    const had = !!obsMesh;
    if (obsMesh) { scene.remove(obsMesh); obsMesh.geometry.dispose(); obsMesh.material.dispose(); obsMesh = null; }
    if (geom) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(geom.positions, 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geom.positions.length).fill(0.45), 3));
      g.setIndex(new THREE.BufferAttribute(geom.triangles, 1));
      // transparent: three.js 는 투명 목록을 불투명 목록 뒤에 그리므로, 불투명이면 renderOrder 와 상관없이 투명 부품(확산판)이 색지도를 덮는다
      obsMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, clippingPlanes: clip, transparent: true, depthTest: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      obsMesh.renderOrder = 2.5;
      obsDir = geom.dir ?? null; liftObs(); obsMesh.visible = obsShow;
      scene.add(obsMesh);
    }
    if (had !== !!obsMesh && lastOver) { setOverlay(lastOver); return; }   // 색지도가 생기거나 없어지면 관측면 채움 진하기를 바꿈
    render();
  }
  function setObsColors(colors) {
    if (!obsMesh) return;
    const a = obsMesh.geometry.getAttribute('color'); srgbColorsToLinear(colors, a.array); a.needsUpdate = true; render();
  }
  // 설계 점검 표식: ring(원, 화면을 향함) · line(거리선) · tris(새는 면 강조). 깊이 무시(가려도 보임).
  // 단면 평면(clip)은 일부러 적용하지 않는다 — 잘린 쪽에 있는 문제 위치도 보여야 하므로
  const ringTex = new Map();
  function ringTexture(color) {
    if (!ringTex.has(color)) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const x = cv.getContext('2d'); x.strokeStyle = `#${color.toString(16).padStart(6, '0')}`; x.lineWidth = 7; x.beginPath(); x.arc(32, 32, 26, 0, 2 * Math.PI); x.stroke();
      ringTex.set(color, new THREE.CanvasTexture(cv));
    }
    return ringTex.get(color);
  }
  function setCheckMarkers(list) {
    // Sprite 기하는 three 가 공유하므로 버리지 않는다(재질만 — 원 텍스처는 ringTex 캐시가 유지)
    if (markers) { scene.remove(markers); markers.traverse((o) => { if (!o.isSprite) o.geometry?.dispose(); o.material?.dispose(); }); }
    markers = new THREE.Group();
    for (const m of list ?? []) {
      let o;
      if (m.type === 'ring') {
        o = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture(m.color), depthTest: false, transparent: true }));
        const s = (model.r * 0.04 * (m.size ?? 12)) / 12; o.scale.set(s, s, s); o.position.set(...m.pos);
      } else if (m.type === 'line') {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from([...m.a, ...m.b]), 3));
        o = new THREE.Line(g, new THREE.LineBasicMaterial({ color: m.color, depthTest: false }));
      } else if (m.type === 'arrow') {
        // 화살표: 몸통 선 + 끝 원뿔 머리(길이의 30%)
        const a = new THREE.Vector3(...m.axis).normalize(), L = m.len > 0 ? m.len : 1, hl = 0.3 * L;
        o = new THREE.Group();
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...m.pos), new THREE.Vector3(...m.pos).addScaledVector(a, L - hl)]);
        const shaft = new THREE.Line(g, new THREE.LineBasicMaterial({ color: m.color, depthTest: false })); shaft.renderOrder = 3; o.add(shaft);
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.35 * hl, hl, 12), new THREE.MeshBasicMaterial({ color: m.color, depthTest: false }));
        head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a);
        head.position.set(...m.pos).addScaledVector(a, L - hl / 2); head.renderOrder = 3; o.add(head);
      } else if (m.type === 'tris') {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3)); g.setIndex(new THREE.BufferAttribute(m.triangles, 1));
        o = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: m.color, transparent: true, opacity: m.opacity ?? 0.5, side: THREE.DoubleSide, depthTest: false }));
      } else continue;
      o.renderOrder = 3; markers.add(o);
    }
    scene.add(markers); render();
  }

  const ray = new THREE.Raycaster();
  ray.layers.enableAll();   // 조작 중 부품 메쉬는 그리기 전용 레이어(1)로 옮겨 두므로, 클릭 판정은 모든 레이어를 본다
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { if (e.button === 0 && e.isPrimary) down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointercancel', () => { down = null; });
  // 관측면은 가려도 보이게 그리므로(앞 부품 위에 덧그림) 클릭도 앞 부품을 뚫고 잡는다 — 관측면 채움(양면)과 광선 교차(단면에 잘린 쪽 제외)
  const obsHitOf = () => {
    if (!obsShow || !obsFillMesh) return null;
    return ray.intersectObject(obsFillMesh, false).find((x) => !clip.length || clip[0].distanceToPoint(x.point) >= 0) ?? null;
  };
  // 우클릭(끌지 않음) → onContext({ part, led, x, y }) — 우클릭 끌기는 화면 이동(OrbitControls)이라 메뉴 없음
  let rdown = null;
  canvas.addEventListener('pointerdown', (e) => { if (e.button === 2) rdown = [e.clientX, e.clientY]; });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!onContext || (rdown && Math.hypot(e.clientX - rdown[0], e.clientY - rdown[1]) > 4)) { rdown = null; return; }
    rdown = null;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const ch = ray.intersectObjects([...coneMeshes].reverse(), false)[0], led = ch ? ch.object.userData.nums[Math.floor(ch.faceIndex / CONE_SEG)] : null;
    const hits = ray.intersectObjects(meshes.filter((m) => m.visible), false), h = clip.length ? hits.find((x) => clip[0].distanceToPoint(x.point) >= 0) : hits[0];
    const hp = h ? h.object.userData.part : null;
    onContext({ obs: !ch && !!obsHitOf(), part: hp, face: hp != null ? partsRef[hp]?.faceIds?.[h.faceIndex] ?? null : null, led, x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) { down = null; return; }
    down = null;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    // 단면 중이면 잘려 안 보이는 쪽(평면 거리 < 0)의 교차는 건너뛰고 다음 교차를 쓴다(Raycaster 는 clipping 을 모름)
    // 빛 원뿔(위에 그려짐)이 먼저 — 선택 모드가 아닐 때만. 선택 원뿔을 앞에 둔다
    const ch = pickable ? null : ray.intersectObjects([...coneMeshes].reverse(), false)[0];
    if (ch) { onPick({ part: null, face: null, led: ch.object.userData.nums[Math.floor(ch.faceIndex / CONE_SEG)] }); return; }
    const add = e.shiftKey || e.ctrlKey || e.metaKey;   // Shift(Ctrl)+클릭 = 여러 개 고르기(끌면 화면 이동) — 2026-11-06
    if (!pickable && !add && obsHitOf()) { onPick({ obs: true }); return; }   // 관측면 클릭 = 관측면 선택(앞 부품에 가려도)
    const hits = ray.intersectObjects(meshes.filter((m) => m.visible && (!pickable || pickable(m.userData.part))), false);
    const h = clip.length ? hits.find((x) => clip[0].distanceToPoint(x.point) >= 0) : hits[0];
    // 선택 모드(pickable 지정)에서는 클릭 광선도 넘긴다 — 빈 곳 클릭이어도 { part: null, face: null, ray } (가까운 LED 맞춤용)
    const rr = { o: ray.ray.origin.toArray(), d: ray.ray.direction.toArray() };
    // 클릭 깊이의 화소당 mm(LED 맞춤 반경용) — 정투영은 깊이와 무관
    const H = canvas.clientHeight || 400;
    const wpp = camera.isOrthographicCamera ? (ortho.top - ortho.bottom) / ortho.zoom / H
      : (2 * (h ? h.distance : Math.max(camera.near, controls.target.clone().sub(ray.ray.origin).dot(ray.ray.direction))) * Math.tan((camera.fov * Math.PI) / 360)) / H;
    if (!h) { onPick(pickable ? { part: null, face: null, ray: rr, worldPerPixel: wpp, add } : null); return; }
    const part = h.object.userData.part;
    onPick({ part, face: partsRef[part].faceIds[h.faceIndex], ray: rr, worldPerPixel: wpp, add });
  });

  // 다 쓴 보기(불러오기 미리보기)의 그래픽 메모리를 돌려줌 — 큰 도면에서 3D 문맥 두 개가 메모리를 나눠 쓰지 않게
  function dispose() { dropProxies(); for (const m of meshes) { scene.remove(m); m.geometry.dispose(); } meshes = []; for (const m of partMats.values()) m.dispose(); partMats.clear(); renderer.dispose(); renderer.forceContextLoss(); }
  return { dispose, setTheme, theme: () => theme, setLightPaths, setXray, xray: () => xray, setLines, lines: () => lines, setObsShow, obsShow: () => obsShow, setDim, setParts, setKinds, setHidden, setSelection, setOverlay, setPickMode, render, setView, fit, fitAll, viewName: () => viewName, setSection, setObsSurface, setObsColors, setCheckMarkers };
}
