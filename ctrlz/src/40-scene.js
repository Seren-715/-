/* =====================================================================
   SCENE: cosy desk at night. Sculpted PBT caps, switches with RGB LEDs,
   anodised case, felt mat, monitor, lamp, mug, plant, room behind.
   ===================================================================== */
const canvas = document.createElement('canvas'); document.body.prepend(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
RectAreaLightUniformsLib.init();
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05060a);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(33, W / H, 0.05, 240);
const GLOWING = [], NO_GLOW_PASS = [];

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, envMapIntensity: 0.3, ...o });
const phys = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, metalness: 0, envMapIntensity: 0.3, ...o });
function mk(geo, mat, x = 0, y = 0, z = 0, parent = scene, shadow = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = shadow; parent.add(m); return m; }
function canvasTex(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; return { c, g, t }; }
const noiseTex = (seed, w, lo, hi, blur = 0) => canvasTex(w, w, (g) => {
  const R = rng(seed), img = g.createImageData(w, w);
  for (let i = 0; i < w * w; i++) { const v = Math.round(255 * (lo + (hi - lo) * R())); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); if (blur) { g.filter = `blur(${blur}px)`; g.drawImage(g.canvas, 0, 0); g.filter = 'none'; }
}, false);
const grainRough = noiseTex(3, 256, 0.48, 0.74, 0.6); grainRough.t.wrapS = grainRough.t.wrapT = THREE.RepeatWrapping; grainRough.t.repeat.set(3, 3);

/* ---------- desk + felt mat ---------- */
{
  const wood = canvasTex(2048, 1024, (g, w, h) => {
    const R = rng(11); g.fillStyle = '#3b2a23'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 520; i++) {
      const y0 = R() * h, amp = 6 + R() * 20, fr = 0.002 + R() * 0.004, ph = R() * 9;
      g.strokeStyle = R() < 0.5 ? `rgba(20,12,9,${0.08 + R() * 0.16})` : `rgba(120,86,64,${0.05 + R() * 0.09})`; g.lineWidth = 0.6 + R() * 2.4;
      g.beginPath(); for (let x = 0; x <= w; x += 16) { const y = y0 + amp * Math.sin(x * fr + ph) + 4 * Math.sin(x * fr * 5.3 + ph * 2); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    }
  });
  mk(new THREE.BoxGeometry(80, 1.2, 44), std(0xffffff, { map: wood.t, roughness: 0.55, envMapIntensity: 0.45 }), 0, -0.95, -10);
  const felt = canvasTex(1024, 512, (g, w, h) => {
    const R = rng(12); g.fillStyle = '#25242a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${0.025 + R() * 0.04})`; g.fillRect(R() * w, R() * h, 1 + R() * 2, 1); }
    g.strokeStyle = 'rgba(205,190,170,0.35)'; g.setLineDash([7, 6]); g.lineWidth = 2.5; g.strokeRect(10, 10, w - 20, h - 20);
  });
  mk(new RoundedBoxGeometry(30, 0.06, 12, 2, 0.025), std(0xffffff, { map: felt.t, roughness: 0.96, envMapIntensity: 0.1 }), 0, -0.33, 0.9);
}

/* ---------- case, plate ---------- */
const rrShape = (w, h, r) => { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; };
{
  const sh = rrShape(16.3, 6.3, 0.5); sh.holes.push(rrShape(15.35, 5.35, 0.18));
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.72, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 5, curveSegments: 20 });
  g.rotateX(-Math.PI / 2);
  mk(g, phys(0x2a2930, { roughness: 0.34, metalness: 0.65, clearcoat: 0.2, clearcoatRoughness: 0.4, envMapIntensity: 0.7 }), 0, -0.22, 0);
  mk(new THREE.BoxGeometry(16.1, 0.08, 6.1), std(0x1d1c21), 0, -0.26, 0);
  mk(new THREE.BoxGeometry(15.3, 0.06, 5.3), std(0x16161a, { roughness: 0.45, metalness: 0.5 }), 0, PLATE_Y - 0.03, 0);
}

/* ---------- underglow: LED strip under the case lip + light pool on the mat ---------- */
const hueOf = x => new THREE.Color().setHSL(((x + 8) / 16) * 0.86 % 1, 0.95, 0.56);
{
  const pts = []; const hw = 8.12, hd = 3.12, r = 0.4;
  for (let i = 0; i < 64; i++) { const a = i / 64 * TAU; const cx = Math.cos(a), sz = Math.sin(a); pts.push(V3(Math.sign(cx) * Math.min(hw, Math.abs(cx) * (hw + r * 2)), -0.27, Math.sign(sz) * Math.min(hd, Math.abs(sz) * (hd + r * 2)))); }
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 256, 0.03, 6, true);
  const col = []; const p = tube.attributes.position; for (let i = 0; i < p.count; i++) { const c = hueOf(p.getX(i)); col.push(c.r, c.g, c.b); }
  tube.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const strip = mk(tube, new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.6, 1.6, 1.6) }), 0, 0, 0, scene, false); GLOWING.push(strip);
  const halo = canvasTex(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 8; i++) gr.addColorStop(i / 8, '#' + hueOf(-8 + 16 * i / 8).getHexString(THREE.SRGBColorSpace));
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); m.addColorStop(0.0, 'rgba(0,0,0,0)'); m.addColorStop(0.55, 'rgba(0,0,0,0.0)'); m.addColorStop(0.7, 'rgba(0,0,0,0.9)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.setTransform(1, 0, 0, 0.5, 0, h / 4); g.fillStyle = m; g.fillRect(0, 0, w, w);
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(22, 11), new THREE.MeshBasicMaterial({ map: halo.t, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, -0.285, 0); pool.renderOrder = 2; scene.add(pool); GLOWING.push(pool);
  [-6.5, -2.2, 2.2, 6.5].forEach(x => { const l = new THREE.PointLight(hueOf(x), 1.6, 5, 2); l.position.set(x, -0.15, 3.4); scene.add(l); });
}

/* ---------- switches (translucent housing, stem, RGB LED) ---------- */
{
  const top = new RoundedBoxGeometry(0.56, 0.2, 0.56, 2, 0.04), sA = new THREE.BoxGeometry(0.15, 0.16, 0.045), sB = new THREE.BoxGeometry(0.045, 0.16, 0.15), led = new THREE.BoxGeometry(0.15, 0.03, 0.08);
  const smoke = phys(0x3c3b44, { roughness: 0.18, transparent: true, opacity: 0.72, clearcoat: 0.6 }), stemM = std(0xb7835a, { roughness: 0.45 }), wire = std(0x9a9aa2, { metalness: 0.9, roughness: 0.3 });
  KEYS.forEach(k => {
    const xs = k.w >= 2 ? [k.x] : [k.x];
    for (const x of xs) {
      mk(top, smoke, x, 0.40, k.z); mk(sA, stemM, x, 0.56, k.z); mk(sB, stemM, x, 0.56, k.z);
      const l = mk(led, new THREE.MeshBasicMaterial({ color: hueOf(x).multiplyScalar(2.6) }), x, 0.505, k.z - 0.2, scene, false); GLOWING.push(l);
    }
    if (k.w >= 2) {   // stabiliser wire + housings
      const off = k.w > 6 ? 2.6 : (k.w / 2 - 0.45);
      for (const sx of [-1, 1]) { mk(new THREE.BoxGeometry(0.2, 0.18, 0.36), smoke, k.x + sx * off, 0.39, k.z); }
      const wg = new THREE.CylinderGeometry(0.018, 0.018, 2 * off, 6); wg.rotateZ(Math.PI / 2); mk(wg, wire, k.x, 0.33, k.z + 0.22);
    }
  });
}

/* ---------- sculpted keycaps ---------- */
function rrPts(hw, hd, r, n) { const p = [], C = [[hw - r, hd - r], [-(hw - r), hd - r], [-(hw - r), -(hd - r)], [hw - r, -(hd - r)]]; C.forEach(([cx, cz], q) => { for (let i = 0; i <= n; i++) { const a = (q + i / n) * Math.PI / 2; p.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } }); return p; }
function makeCapGeo(k) {
  const n = 6, M = 4 * (n + 1), pos = [], uv = [], side = [], top = [];
  const h = k.h, f = 0.075, hs = h - f, tanT = Math.tan(k.tilt), rB = 0.1, rT = 0.15;
  const tiltY = (z, y) => y - tanT * (z - TOP_ZOFF) * sstep(0.2 * h, h, y);
  const dishY = x => -k.dish * Math.max(0, 1 - (x / k.hwT) ** 2);
  const ring = (hw, hd, r, y, zo, dish = false, scale = 1) => {
    const b = pos.length / 3;
    for (const [x0, z0] of rrPts(hw, hd, r, n)) { const x = x0 * scale, z = z0 * scale + zo; const yy = y + (dish ? dishY(x) : 0); pos.push(x, tiltY(z, yy), z); uv.push(x / (2 * k.hwT) + 0.5, 0.5 - (z - TOP_ZOFF) / (2 * k.hdT)); }
    return b;
  };
  const center = (y) => { const b = pos.length / 3; pos.push(0, tiltY(TOP_ZOFF, y + dishY(0)), TOP_ZOFF); uv.push(0.5, 0.5); return b; };
  const quadOut = (lo, hi, I) => { for (let j = 0; j < M; j++) { const j1 = (j + 1) % M; I.push(lo + j, hi + j1, lo + j1, lo + j, hi + j, hi + j1); } };
  const quadIn = (lo, hi, I) => { for (let j = 0; j < M; j++) { const j1 = (j + 1) % M; I.push(lo + j, lo + j1, hi + j1, lo + j, hi + j1, hi + j); } };
  const capUp = (o, i, I) => { for (let j = 0; j < M; j++) { const j1 = (j + 1) % M; I.push(o + j, i + j1, o + j1, o + j, i + j, i + j1); } };
  const capDown = (o, i, I) => { for (let j = 0; j < M; j++) { const j1 = (j + 1) % M; I.push(o + j, o + j1, i + j1, o + j, i + j1, i + j); } };
  // outer wall + top fillet
  const R = [];
  for (let i = 0; i <= 3; i++) { const u = i / 3; R.push(ring(lerp(k.hwB, k.hwT + f, u), lerp(k.hdB, k.hdT + f, u), lerp(rB, rT + f * 0.6, u), u * hs, lerp(0, TOP_ZOFF, u))); }
  for (let j = 1; j <= 5; j++) { const ph = j / 5 * Math.PI / 2, ins = f * (1 - Math.cos(ph)); R.push(ring(k.hwT + f - ins, k.hdT + f - ins, rT + 0.6 * (f - ins), hs + f * Math.sin(ph), TOP_ZOFF, true)); }
  for (let i = 0; i < R.length - 1; i++) quadOut(R[i], R[i + 1], side);
  // dished top (concentric rings, mapped with the legend texture)
  let o = R[R.length - 1];
  for (const s of [0.82, 0.62, 0.42, 0.22]) { const r2 = ring(k.hwT, k.hdT, rT, h, TOP_ZOFF, true, s); capUp(o, r2, top); o = r2; }
  const c = center(h); for (let j = 0; j < M; j++) top.push(o + j, c, o + (j + 1) % M);
  // hollow underside: rim, inner wall, ceiling
  const t = 0.05, ob = ring(k.hwB, k.hdB, rB, 0, 0), ib = ring(k.hwB - t, k.hdB - t, rB * 0.6, 0, 0), it = ring(k.hwB - t - 0.06, k.hdB - t - 0.06, rB * 0.6, h - 0.15, TOP_ZOFF * 0.5);
  capDown(ob, ib, side); quadIn(ib, it, side);
  const ic = pos.length / 3; pos.push(0, h - 0.15, 0); uv.push(0.5, 0.5); for (let j = 0; j < M; j++) side.push(it + j, it + (j + 1) % M, ic);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([...side, ...top]); g.addGroup(0, side.length, 0); g.addGroup(side.length, top.length, 1);
  g.computeVertexNormals(); g.translate(0, -h / 2, 0);
  return g;
}
const capGeoCache = {};
const CAPMAT = { cream: std(PAL.cream, { roughness: 0.58, roughnessMap: grainRough.t }), ink: std(PAL.ink, { roughness: 0.6, roughnessMap: grainRough.t }), accent: std(PAL.clawd, { roughness: 0.56, roughnessMap: grainRough.t }) };
const socketGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.2, 16);
function drawLegend(k, g, w, h, base, ink) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const R = rng(100 + k.index); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},0.035)`; g.fillRect(R() * w, R() * h, 2, 2); }
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  const px = w / (2 * k.hwT);
  if (k.alpha && DUAL[k.id]) { g.font = `600 ${0.25 * px}px ${FONT}`; g.fillText(DUAL[k.id], w / 2, h * 0.3); g.font = `700 ${0.27 * px}px ${FONT}`; g.fillText(k.id, w / 2, h * 0.68); }
  else if (k.alpha) { g.font = `700 ${(k.accent ? 0.42 : 0.36) * px}px ${FONT}`; g.fillText(k.id, w / 2, h * 0.53); }
  else {
    const lab = MODL[k.id]; if (!lab) return;
    let size = (k.accent ? 0.25 : 0.17) * px; g.font = `700 ${size}px ${FONT}`;
    while (g.measureText(lab).width > w * 0.84) { size *= 0.94; g.font = `700 ${size}px ${FONT}`; }
    g.fillText(lab, w / 2, h * 0.53);
  }
}
KEYS.forEach(k => {
  const gk = `${k.w}_${k.row}_${k.dish}`; const geo = capGeoCache[gk] ??= makeCapGeo(k);
  const kind = k.accent ? 'accent' : (k.alpha ? 'cream' : 'ink');
  const base = HEX(PAL[kind === 'accent' ? 'clawd' : kind]), ink = kind === 'cream' ? '#2b292c' : '#f4ede2';
  const tw = Math.round(2 * k.hwT * 640), th = Math.round(2 * k.hdT * 640);
  const lt = canvasTex(tw, th, (g, w, h) => drawLegend(k, g, w, h, base, ink));
  const topMat = std(0xffffff, { map: lt.t, roughness: 0.56, roughnessMap: grainRough.t });
  const cap = new THREE.Mesh(geo, [CAPMAT[kind], topMat]); cap.castShadow = cap.receiveShadow = true; scene.add(cap);
  mk(socketGeo, CAPMAT[kind], 0, k.h / 2 - 0.25, 0, cap);
  k.mesh = cap; k.topMat = topMat;
  if (k.id === 'LCtrl') {   // side-printed legend on the front skirt: still reads while his back leg stands on the top
    const sideT = canvasTex(512, 160, (g, w, h) => { g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 108px ${FONT}`; g.fillText('Ctrl', w / 2, h / 2 + 6); });
    const zf = k.hdB - 0.5 * (k.hdB - (k.hdT + 0.075)), slope = Math.atan((k.hdB - (k.hdT + 0.075)) / (k.h - 0.075));
    const side = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.225), std(0xffffff, { map: sideT.t, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    side.position.set(0, -k.h / 2 + 0.24, zf + 0.004); side.rotation.x = -slope; cap.add(side);
  }
});

/* ---------- monitor (+ its light) ---------- */
const MON = { pos: V3(0, 7.4, -14.2), w: 14.8, h: 8.325 };
const mon = new THREE.Group(); mon.position.copy(MON.pos); scene.add(mon);
mk(new RoundedBoxGeometry(15.3, 8.85, 0.45, 3, 0.14), phys(0x1a1c22, { roughness: 0.38, metalness: 0.4, clearcoat: 0.3 }), 0, 0, 0, mon);
const monTex = canvasTex(2048, 1152, () => { });
const screenMat = new THREE.MeshBasicMaterial({ map: monTex.t, color: 0xdddddd });
mk(new THREE.PlaneGeometry(MON.w, MON.h), screenMat, 0, 0, 0.232, mon, false);
mk(new THREE.BoxGeometry(1.4, 4.7, 0.5), phys(0x1a1c22, { metalness: 0.5, roughness: 0.35 }), 0, -6.25, -0.55, mon);
mk(new RoundedBoxGeometry(6, 0.24, 3.4, 2, 0.1), phys(0x1a1c22, { metalness: 0.5, roughness: 0.35 }), 0, -8.12, 0.25, mon);
const monLight = new THREE.RectAreaLight(PAL.monitor, 5, MON.w, MON.h); monLight.position.copy(MON.pos).add(V3(0, 0, 0.3)); monLight.lookAt(MON.pos.x, MON.pos.y, 10); scene.add(monLight);
const rimLight = new THREE.DirectionalLight(PAL.monitor, 0.35); rimLight.position.set(3, 8, -14); rimLight.target.position.set(2, 0.5, 0); scene.add(rimLight, rimLight.target);
scene.add(new THREE.HemisphereLight(0x3a4a6c, 0x140d0d, 0.32));

/* ---------- desk lamp (key light, area-jittered for soft contact shadows) ---------- */
const LAMP = { bulb: V3(-9.4, 7.2, 4.6), r: 0.34, target: V3(2.6, 1.2, 0.6) };
const spot = new THREE.SpotLight(PAL.lamp, 1150, 0, 0.78, 0.8, 2);
{
  // desk lamp at front-left, just outside the frame: warm key light on the faces of the caps and of Clawd
  const metal = phys(0x2f2a2d, { roughness: 0.32, metalness: 0.7 }), shadeM = phys(0x2c2a2e, { roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide });
  const base = V3(-12.6, -0.2, 2.6), j2 = V3(-13.1, 4.8, 3.2), j3 = V3(-10.2, 7.9, 4.3);
  mk(new THREE.CylinderGeometry(1.25, 1.45, 0.3, 40), metal, base.x, base.y, base.z);
  const seg = (a, b, r = 0.1) => { const d = b.clone().sub(a), m = mk(new THREE.CylinderGeometry(r, r, d.length(), 14), metal); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); };
  seg(base, j2); seg(j2, j3); [j2, j3].forEach(p => mk(new THREE.SphereGeometry(0.18, 16, 12), metal, p.x, p.y, p.z));
  const axis = LAMP.bulb.clone().sub(LAMP.target).normalize();
  const shade = mk(new THREE.CylinderGeometry(0.45, 1.5, 1.6, 40, 1, true), shadeM, 0, 0, 0); shade.position.copy(LAMP.bulb).addScaledVector(axis, 0.45); shade.quaternion.setFromUnitVectors(UP, axis);
  mk(new THREE.SphereGeometry(0.34, 20, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.lamp).multiplyScalar(2.2) }), LAMP.bulb.x, LAMP.bulb.y, LAMP.bulb.z, scene, false);
  spot.position.copy(LAMP.bulb); spot.target.position.copy(LAMP.target);
  spot.castShadow = true; spot.shadow.mapSize.set(RENDER ? 4096 : 2048, RENDER ? 4096 : 2048); spot.shadow.bias = -0.00025; spot.shadow.normalBias = 0.02; spot.shadow.camera.near = 3; spot.shadow.camera.far = 34;
  scene.add(spot, spot.target);
}

/* ---------- mug, plant ---------- */
{
  const prof = [[0, 0], [1.0, 0], [1.08, 0.08], [1.12, 0.4], [1.16, 1.7], [1.2, 1.95], [1.1, 1.97], [1.06, 1.75], [1.02, 0.25], [0, 0.22]].map(([r, y]) => new THREE.Vector2(r, y));
  const ceramic = phys(0xc7bedb, { roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  mk(new THREE.LatheGeometry(prof, 48), ceramic, 10.7, -0.3, -5.7);
  const handle = mk(new THREE.TorusGeometry(0.55, 0.13, 14, 32, Math.PI * 1.15), ceramic, 11.85, 0.65, -5.7); handle.rotation.z = -Math.PI * 0.57;
  mk(new THREE.CircleGeometry(1.03, 40), phys(0x24140d, { roughness: 0.08, clearcoat: 1 }), 10.7, 1.4, -5.7).rotation.x = -Math.PI / 2;
  const pot = [[0, 0], [0.95, 0], [1.15, 1.4], [1.32, 1.5], [1.32, 1.75], [1.2, 1.75], [0, 1.55]].map(([r, y]) => new THREE.Vector2(r, y));
  mk(new THREE.LatheGeometry(pot, 40), std(0xb8673f, { roughness: 0.85 }), 15.2, -0.35, -9.2);
  const leafShape = new THREE.Shape(); leafShape.moveTo(0, 0); leafShape.bezierCurveTo(0.55, 0.3, 0.6, 1.1, 0, 1.6); leafShape.bezierCurveTo(-0.6, 1.1, -0.55, 0.3, 0, 0);
  const lg = new THREE.ShapeGeometry(leafShape, 10); const lp = lg.attributes.position; for (let i = 0; i < lp.count; i++) { const x = lp.getX(i), y = lp.getY(i); lp.setZ(i, -0.25 * x * x + 0.08 * y * y); } lg.computeVertexNormals();
  const R = rng(5), leafM = phys(0x3f6e4c, { roughness: 0.45, clearcoat: 0.4, side: THREE.DoubleSide });
  for (let i = 0; i < 16; i++) { const a = R() * TAU, h = 1.8 + R() * 2.6, l = mk(lg, leafM, 15.2 + Math.cos(a) * 0.6 * R(), h, -9.2 + Math.sin(a) * 0.6 * R()); l.rotation.set(-0.6 - R() * 0.8, a, (R() - 0.5) * 0.8); l.scale.setScalar(0.9 + R() * 0.6); }
}

/* ---------- room: wall, window with city, string lights, shelf, poster (all far out of focus) ---------- */
const disc = canvasTex(256, 256, (g) => { const gr = g.createRadialGradient(128, 128, 0, 128, 128, 124); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.9, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 124, 0, TAU); g.fill(); });
{
  const R = rng(99);
  const plaster = canvasTex(1024, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1b1f30'); gr.addColorStop(1, '#0d0f18'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,255,255,${R() * 0.025})`; g.fillRect(R() * w, R() * h, 2, 2); } });
  mk(new THREE.PlaneGeometry(120, 60), std(0xffffff, { map: plaster.t, roughness: 0.95 }), 0, 18, -32, scene, false);
  const city = canvasTex(2048, 1024, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0d1430'); gr.addColorStop(0.6, '#1d2244'); gr.addColorStop(1, '#2b2140'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let b = 0; b < 26; b++) { const bx = R() * w, bw = 60 + R() * 160, bh = h * (0.25 + R() * 0.55); g.fillStyle = `rgb(${10 + R() * 12},${12 + R() * 12},${24 + R() * 16})`; g.fillRect(bx, h - bh, bw, bh);
      for (let i = 0; i < bw * bh / 900; i++) if (R() < 0.45) { g.fillStyle = ['#ffd9a0', '#ffe9c4', '#9cc3e6', '#ffb36b'][Math.floor(R() * 4)]; g.globalAlpha = 0.4 + R() * 0.6; g.fillRect(bx + 6 + R() * (bw - 14), h - bh + 8 + R() * (bh - 16), 6, 9); } g.globalAlpha = 1; }
    g.filter = 'blur(7px)'; g.drawImage(g.canvas, 0, 0); g.filter = 'none';
  });
  const win = V3(-3, 13, -31.8);
  mk(new THREE.PlaneGeometry(24, 12.5), new THREE.MeshBasicMaterial({ map: city.t, color: 0x9a9aa6 }), win.x, win.y, win.z, scene, false);
  const frameM = std(0x2b2730, { roughness: 0.7 });
  [[0, 6.4, 24.8, 0.5], [0, -6.4, 24.8, 0.5], [-12.4, 0, 0.5, 13.3], [12.4, 0, 0.5, 13.3], [0, 0, 0.35, 12.5], [0, 1.5, 24.8, 0.3]].forEach(([x, y, w, h]) => mk(new THREE.BoxGeometry(w, h, 0.4), frameM, win.x + x, win.y + y, win.z + 0.2, scene, false));
  // string lights: catenary of warm bulbs (pre-blurred bokeh sprites)
  const cols = [0xffd8a0, 0xffc47c, 0xffe8c8, 0xff9f7a, 0xfff0d8];
  for (let i = 0; i < 34; i++) {
    const u = i / 33, x = lerp(-26, 22, u), y = 21 - 3.2 * Math.sin(Math.PI * ((u * 3) % 1)) - 0.6 * Math.sin(u * 9);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc.t, color: new THREE.Color(cols[i % 5]).multiplyScalar(0.9), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.setScalar(1.1 + R() * 0.5); sp.position.set(x, y, -30); scene.add(sp); NO_GLOW_PASS.push(sp);
  }
  for (let i = 0; i < 26; i++) {   // soft bokeh orbs in the room
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc.t, color: [0xffd9a0, 0x9cc3e6, 0xff9fb0, 0xffeacb][i % 4], transparent: true, opacity: 0.18 + R() * 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.setScalar(1.6 + R() * 2.6); sp.position.set(-30 + R() * 60, 4 + R() * 16, -24 - R() * 5); scene.add(sp); NO_GLOW_PASS.push(sp);
  }
  // shelf with books, poster
  mk(new THREE.BoxGeometry(9, 0.35, 2), std(0x3a2a24), 20, 9, -30.5, scene, false);
  for (let i = 0, x = 16.2; i < 12; i++) { const bw = 0.35 + R() * 0.35, bh = 1.6 + R() * 1.2; mk(new THREE.BoxGeometry(bw, bh, 1.4), std(new THREE.Color(['#6a3b3b', '#2f4a5e', '#c9a35a', '#3d5a45', '#7b6a9e', '#d2c7b4'][i % 6])), x + bw / 2, 9.17 + bh / 2, -30.5, scene, false); x += bw + 0.05; }
  const poster = canvasTex(512, 700, (g, w, h) => { g.fillStyle = '#e9dfcf'; g.fillRect(0, 0, w, h); g.fillStyle = '#d97757'; g.beginPath(); g.arc(w / 2, h * 0.42, 150, 0, TAU); g.fill(); g.fillStyle = '#302e31'; g.font = `700 64px ${FONT}`; g.textAlign = 'center'; g.fillText('git push', w / 2, h * 0.82); });
  mk(new THREE.BoxGeometry(6.4, 8.6, 0.2), std(0x1c1a1d), -21, 12, -31.6, scene, false);
  mk(new THREE.PlaneGeometry(6, 8.2), std(0xffffff, { map: poster.t, roughness: 0.8 }), -21, 12, -31.48, scene, false);
}

/* ---------- particles: dust sparkle (explosion), the dust mote ---------- */
const SPARK_N = 220;
const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_N * 3), 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.06, map: disc.t, color: new THREE.Color(PAL.lamp).multiplyScalar(1.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
sparks.frustumCulled = false; scene.add(sparks); NO_GLOW_PASS.push(sparks);
const SPARK = []; { const R = rng(31); for (let i = 0; i < SPARK_N; i++) SPARK.push({ v: V3((R() - 0.35) * 6, 1 + R() * 6.5, 1 + R() * 9), o: V3((R() - 0.5) * 2.0, R() * 0.3, (R() - 0.5) * 0.9), tw: R() * TAU }); }
const moteTex = canvasTex(256, 256, (g) => {
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 60); gr.addColorStop(0, 'rgba(255,250,240,1)'); gr.addColorStop(0.5, 'rgba(255,240,220,0.8)'); gr.addColorStop(1, 'rgba(255,236,214,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 60, 0, TAU); g.fill();
  const R = rng(8); g.lineCap = 'round';
  for (let i = 0; i < 26; i++) { const a = R() * TAU, r0 = 18 + R() * 20, r1 = 70 + R() * 48, bend = (R() - 0.5) * 0.9; g.strokeStyle = `rgba(255,246,232,${0.35 + R() * 0.45})`; g.lineWidth = 1.2 + R() * 1.6;
    g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); g.quadraticCurveTo(128 + Math.cos(a + bend) * (r0 + r1) / 2, 128 + Math.sin(a + bend) * (r0 + r1) / 2, 128 + Math.cos(a + bend * 0.5) * r1, 128 + Math.sin(a + bend * 0.5) * r1); g.stroke(); }
});
const mote = new THREE.Sprite(new THREE.SpriteMaterial({ map: moteTex.t, color: new THREE.Color(1.25, 1.2, 1.1), transparent: true, depthWrite: false })); mote.scale.setScalar(0.42); scene.add(mote); NO_GLOW_PASS.push(mote);
const moteShadow = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), new THREE.MeshBasicMaterial({ map: disc.t, color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })); scene.add(moteShadow); NO_GLOW_PASS.push(moteShadow);
