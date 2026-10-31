/* =====================================================================
   HERO MESH: soft Clawd. Superellipsoid body deformed every sample
   (squash with side bulge, taffy stretch from the planted back leg,
   lean/shear), conforming glossy ink face decal, lathe legs, nubs, sweat.
   ===================================================================== */
const SE = 5.0, SF = 4.2;                                        // body exponents (xz, y)
function superGeo(a, b, c, e, f, seg) {
  const g = new THREE.BoxGeometry(2, 2, 2, ...seg); g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const p = g.attributes.position, v = V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const s = Math.pow(Math.pow(Math.pow(Math.abs(v.x / a), e) + Math.pow(Math.abs(v.z / c), e), f / e) + Math.pow(Math.abs(v.y / b), f), -1 / f);
    p.setXYZ(i, v.x * s, v.y * s, v.z * s);
  }
  const m = mergeVertices(g, 1e-6); m.computeVertexNormals(); return m;
}
const superZ = (x, y) => { const r = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(y / HB), SF)), SE / SF) - Math.pow(Math.abs(x / HA), SE); return r <= 0 ? 0 : HC * Math.pow(r, 1 / SE); };

const heroMat = phys(0xD56853,   // base tuned so the lit side measures D97757 under the warm lamp
   { roughness: 0.46, sheen: 0.55, sheenColor: new THREE.Color(0xffb193), sheenRoughness: 0.5, clearcoat: 0.08, clearcoatRoughness: 0.5, envMapIntensity: 0.35 });
const hero = new THREE.Group(); scene.add(hero);
const bodyGeo = superGeo(HA, HB, HC, SE, SF, [40, 28, 22]);
const BODY_BASE = Float32Array.from(bodyGeo.attributes.position.array);
const body = mk(bodyGeo, heroMat, 0, 0, 0, hero);
body.frustumCulled = false;

const FACE_W = 1.36, FACE_H = 0.88, FACE_Y = 0.07;
const faceT = canvasTex(1024, 662, () => { });
const faceGeo = new THREE.PlaneGeometry(FACE_W, FACE_H, 30, 20);
const FACE_UV = Float32Array.from(faceGeo.attributes.position.array);
const face = new THREE.Mesh(faceGeo, phys(0xffffff, { map: faceT.t, transparent: true, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, envMapIntensity: 0.6 }));
face.frustumCulled = false; hero.add(face);

const legProf = [[0, -0.46], [0.07, -0.458], [0.12, -0.445], [0.148, -0.415], [0.155, -0.375], [0.142, -0.3], [0.13, -0.2], [0.135, -0.1], [0.15, -0.02], [0.16, 0.06], [0, 0.06]].map(([r, y]) => new THREE.Vector2(r, y));
const legGeo = new THREE.LatheGeometry(legProf, 28);
const legs = FEET.map(() => mk(legGeo, heroMat, 0, 0, 0, hero));
const nubGeoR = superGeo(0.16, 0.15, 0.21, 4, 4, [10, 10, 10]); nubGeoR.translate(0.11, 0, 0);
const nubGeoL = superGeo(0.16, 0.15, 0.21, 4, 4, [10, 10, 10]); nubGeoL.translate(-0.11, 0, 0);
const nubR = new THREE.Group(), nubL = new THREE.Group(); hero.add(nubR, nubL);
mk(nubGeoR, heroMat, 0, 0, 0, nubR); mk(nubGeoL, heroMat, 0, 0, 0, nubL);
const dropProf = []; for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI; dropProf.push(new THREE.Vector2(0.075 * Math.sin(a) * Math.pow(Math.sin(a / 2), 0.9), -Math.cos(a) * 0.1 + (i < 8 ? 0.02 * (1 - i / 8) : 0))); }
const sweat = mk(new THREE.LatheGeometry(dropProf, 20), phys(0xcfe6ff, { roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.88, emissive: 0x2a4a68, emissiveIntensity: 0.6 }), 0, 0, 0, hero, false);

/** write the deformed body / face / limbs into the meshes for a solved hero state */
function applyHeroMesh(S, t) {
  const P = S.P;
  hero.position.copy(S.pos); hero.quaternion.copy(S.q);
  const pos = bodyGeo.attributes.position.array;
  for (let i = 0; i < pos.length; i += 3) { const r = bodyMap(P, BODY_BASE[i], BODY_BASE[i + 1], BODY_BASE[i + 2]); pos[i] = r[0]; pos[i + 1] = r[1]; pos[i + 2] = r[2]; }
  bodyGeo.attributes.position.needsUpdate = true; bodyGeo.computeVertexNormals(); bodyGeo.computeBoundingSphere();
  // face decal, counter-scaled so the face never stretches with the body
  const sxz = 1 / Math.sqrt(P.sy), fx0 = P.anchorX + (0 - P.anchorX) * 1;        // body-coord centre
  const fp = faceGeo.attributes.position.array;
  for (let i = 0; i < fp.length; i += 3) {
    const u = FACE_UV[i], v = FACE_UV[i + 1];
    const xb = fx0 + u / (sxz * P.st), yb = FACE_Y + v / P.sy;
    const r = bodyMap(P, xb, yb, superZ(xb, yb) + 0.006);
    fp[i] = r[0]; fp[i + 1] = r[1]; fp[i + 2] = r[2] + 0.004;
  }
  faceGeo.attributes.position.needsUpdate = true; faceGeo.computeVertexNormals();
  // legs: hang from the attach points, lengths solved so planted feet sit on the caps
  legs.forEach((l, i) => {
    const a = S.attach[i]; l.position.copy(a); const front = FEET[i][0] > 0;
    l.scale.set(1, S.legLen[i] / LEG_REST, 1);
    const sw = Math.sin(P.stride + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.55 * P.strideA;
    l.rotation.set(sw + (front ? -0.55 * P.reach : 0) + 0.25 * P.tuck * (FEET[i][1] > 0 ? -1 : 1), 0, (FEET[i][0] > 0 ? 1 : -1) * P.splay);
  });
  // nubs pivot at the sides
  const nr = bodyMap(P, HA - 0.03, 0.02, 0), nl = bodyMap(P, -HA + 0.03, 0.02, 0);
  nubR.position.set(nr[0], nr[1], nr[2]); nubL.position.set(nl[0], nl[1], nl[2]);
  nubR.rotation.set(0, 0, P.nubR); nubL.rotation.set(0, 0, -P.nubL); nubR.scale.set(P.nubRS || 1, 1 / Math.sqrt(P.nubRS || 1), 1 / Math.sqrt(P.nubRS || 1));
  // sweat drop slides down the top-right of the forehead
  const sw = P.face.sweat || 0; sweat.visible = sw > 0.02;
  if (sweat.visible) { const slide = (t * 0.9) % 1; const xb = 0.62, yb = 0.46 - 0.3 * slide; const r = bodyMap(P, xb, yb, superZ(xb, yb) + 0.07); sweat.position.set(r[0], r[1], r[2]); sweat.scale.setScalar(Math.min(1, sw) * (1.15 - 0.3 * slide)); }
}
/* nub tip in world space (used by the checks: does the nub really tap Z?) */
function nubTipWorld(S) { const P = S.P, nr = bodyMap(P, HA - 0.03, 0.02, 0); const tip = V3(0.3 * (P.nubRS || 1), 0, 0).applyAxisAngle(V3(0, 0, 1), P.nubR).add(V3(...nr)); return tip.applyQuaternion(S.q).add(S.pos); }

/* ---------- 19 faces (glossy ink on the decal) ---------- */
function drawFace(g, F, t) {
  const w = 1024, h = 662; g.clearRect(0, 0, w, h);
  const ink = '#141217', cx = 512, ey = 262, my = 476, EX = [cx - 178, cx + 178];
  const lx = (F.look?.[0] || 0) * 32, ly = -(F.look?.[1] || 0) * 28;
  g.fillStyle = ink; g.strokeStyle = ink; g.lineCap = 'round'; g.lineJoin = 'round';
  const rr = (x, y, rw, rh) => { g.beginPath(); g.roundRect(x - rw / 2, y - rh / 2, rw, rh, Math.min(rw, rh) * 0.42); g.fill(); };
  const gleam = (x, y, rw, rh) => { g.save(); g.fillStyle = 'rgba(255,255,255,0.93)'; g.beginPath(); g.ellipse(x - rw * 0.17, y - rh * 0.25, rw * 0.17, Math.min(rh * 0.12, rw * 0.22), -0.3, 0, TAU); g.fill(); g.beginPath(); g.arc(x + rw * 0.17, y + rh * 0.2, rw * 0.07, 0, TAU); g.fill(); g.restore(); };
  const eyes = (rw, rh, dx = 0, dy = 0, gl = true) => EX.forEach((x, i) => { const X = x + lx + (i ? -dx : dx), Y = ey + ly + dy; rr(X, Y, rw, rh); if (gl) gleam(X, Y, rw, rh); });
  const lidEyes = (rw, rh, slant, dy = 0) => EX.forEach((x, i) => { const X = x + lx, Y = ey + ly + dy, s = i ? -slant : slant; g.save(); g.beginPath(); g.moveTo(X - rw, Y - rh / 2 + 6 - s); g.lineTo(X + rw, Y - rh / 2 + 6 + s); g.lineTo(X + rw, Y + rh); g.lineTo(X - rw, Y + rh); g.closePath(); g.clip(); rr(X, Y, rw, rh); gleam(X, Y + rh * 0.15, rw, rh * 0.7); g.restore(); });
  const arcEyes = (up, lw = 30) => { g.lineWidth = lw; EX.forEach(x => { g.beginPath(); if (up) { g.moveTo(x - 58, ey + 30); g.quadraticCurveTo(x, ey - 64, x + 58, ey + 30); } else { g.moveTo(x - 58, ey - 6); g.quadraticCurveTo(x, ey + 58, x + 58, ey - 6); } g.stroke(); }); };
  const chevrons = (lw = 30, sz = 1) => { g.lineWidth = lw; [[1, EX[0]], [-1, EX[1]]].forEach(([d, x]) => { g.beginPath(); g.moveTo(x - 50 * d * sz, ey - 54 * sz); g.lineTo(x + 46 * d * sz, ey); g.lineTo(x - 50 * d * sz, ey + 54 * sz); g.stroke(); }); };
  const spiral = () => { g.lineWidth = 16; EX.forEach(x => { g.beginPath(); for (let a = 0; a < 4.2 * Math.PI; a += 0.15) { const r = 6 + a * 4.6, X = x + Math.cos(a + t * 9) * r, Y = ey + Math.sin(a + t * 9) * r; a ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke(); }); };
  const sparkle = (x, y, r) => { g.save(); g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, rad = i % 2 ? r * 0.35 : r; g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } g.fill(); g.restore(); };
  const M = {
    smile: (s = 1) => { g.lineWidth = 26; g.beginPath(); g.moveTo(cx - 70 * s, my - 22); g.quadraticCurveTo(cx, my + 46 * s, cx + 70 * s, my - 22); g.stroke(); },
    hum: () => { g.lineWidth = 24; g.beginPath(); g.moveTo(cx - 38, my - 4); g.quadraticCurveTo(cx, my + 14 + 6 * Math.sin(t * 20), cx + 38, my - 4); g.stroke(); },
    open: (rw, rh) => { g.beginPath(); g.ellipse(cx, my, rw, rh, 0, 0, TAU); g.fill(); g.save(); g.clip(); g.fillStyle = '#7d2f30'; g.beginPath(); g.ellipse(cx, my + rh * 0.62, rw * 0.66, rh * 0.5, 0, 0, TAU); g.fill(); g.restore(); },
    grin: () => { g.beginPath(); g.moveTo(cx - 88, my - 32); g.quadraticCurveTo(cx, my + 96, cx + 88, my - 32); g.closePath(); g.fill(); g.save(); g.clip(); g.fillStyle = '#7d2f30'; g.beginPath(); g.ellipse(cx, my + 34, 46, 22, 0, 0, TAU); g.fill(); g.restore(); },
    o: (r) => { g.beginPath(); g.ellipse(cx, my - 6, r * 0.82, r, 0, 0, TAU); g.fill(); },
    wobble: () => { g.lineWidth = 22; g.beginPath(); for (let i = 0; i <= 8; i++) { const x = cx - 90 + i * 22.5, y = my + (i % 2 ? 13 : -13) * Math.cos(t * 30); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); },
    grit: () => { g.lineWidth = 22; g.beginPath(); for (let i = 0; i <= 6; i++) { const x = cx - 84 + i * 28, y = my + (i % 2 ? 16 : -12); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); },
    flat: (s = 1) => { g.lineWidth = 24; g.beginPath(); g.moveTo(cx - 46 * s, my); g.lineTo(cx + 46 * s, my); g.stroke(); },
    smirk: () => { g.lineWidth = 24; g.beginPath(); g.moveTo(cx - 62, my + 4); g.quadraticCurveTo(cx + 10, my + 28, cx + 84, my - 36); g.stroke(); },
    wavy: (s = 1) => { g.lineWidth = 22; g.beginPath(); g.moveTo(cx - 72 * s, my + 8); g.bezierCurveTo(cx - 36 * s, my - 30, cx - 10 * s, my + 42, cx + 18 * s, my); g.bezierCurveTo(cx + 38 * s, my - 26, cx + 58 * s, my + 20, cx + 76 * s, my); g.stroke(); },
  };
  const blink = blinkAt(t);
  switch (F.name) {
    case 'neutral': blink ? arcEyes(false, 22) : eyes(96, 186); break;
    case 'happy': arcEyes(true); M.smile(); break;
    case 'hum': arcEyes(true); M.hum(); break;
    case 'tada': arcEyes(true, 32); M.grin(); break;
    case 'shock': eyes(124, 238); M.o(54); break;
    case 'hook': eyes(56, 66, 0, 8, false); EX.forEach(x => sparkle(x + 20, ey - 14, 9)); M.o(46); break;
    case 'panic': eyes(116, 222); M.wobble(); break;
    case 'determined': blink ? arcEyes(false, 22) : lidEyes(100, 168, -22, 6); M.flat(0.8); break;
    case 'strain': chevrons(32); M.grit(); break;
    case 'triumph': eyes(110, 204); EX.forEach(x => sparkle(x - 16, ey - 40, 30)); M.grin(); break;
    case 'relief': arcEyes(false, 26); M.smile(0.7); break;
    case 'smug': lidEyes(104, 150, 10, 26); M.smirk(); break;
    case 'lookup': eyes(96, 186, 0, -26); M.o(22); break;
    case 'cross': eyes(92, 168, 66, 8); M.flat(0.6); break;
    case 'ah1': lidEyes(100, 128, -8, 30); M.open(54, 48); break;
    case 'ah2': lidEyes(100, 84, -14, 40); M.open(72, 66); break;
    case 'achoo': chevrons(34, 1.1); M.open(112, 92); break;
    case 'dazed': spiral(); M.wavy(0.6); break;
    case 'uhoh': eyes(118, 216); M.wavy(); break;
    default: eyes(96, 186);
  }
}
