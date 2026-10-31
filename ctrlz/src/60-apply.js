/* =====================================================================
   PER-FRAME STATE: camera, textures (face, monitor, VHS OSD), transforms
   ===================================================================== */
/* ---------- camera: one low macro camera, a job at every beat; end camera = start camera ---------- */
const CK = [
  [0.0, CAMS.hook.p, CAMS.hook.t, CAMS.hook.fov, 'lin'],
  [1.3, CAMS.hook.p, CAMS.hook.t, CAMS.hook.fov, 'lin'],
  [2.55, CAMS.calm.p, CAMS.calm.t, CAMS.calm.fov, 'io'],
  [5.75, CAMS.calm.p, CAMS.calm.t, CAMS.calm.fov, 'io'],
  [6.3, V3(3.0, 2.6, 10.4), V3(3.5, 3.3, -2.0), 36, 'out'],
  [8.8, V3(3.2, 2.65, 10.2), V3(3.6, 3.3, -2.0), 36, 'io'],
  [9.3, V3(-3.4, 3.4, 9.6), V3(-5.4, 0.7, 0.8), 31, 'out'],
  [10.2, V3(-4.2, 5.2, 7.6), V3(-5.4, 0.9, 0.9), 30, 'io'],
  [11.7, V3(-4.3, 4.9, 7.1), V3(-5.4, 0.95, 0.9), 29, 'io'],
  [13.0, V3(2.4, 2.75, 10.2), V3(3.3, 3.2, -1.2), 33, 'io'],
  [15.0, V3(2.6, 2.75, 10.0), V3(3.5, 3.2, -1.2), 33, 'io'],
  [16.75, V3(3.6, 2.7, 9.1), V3(4.1, 3.05, -1.2), 31, 'io'],
  [16.98, V3(5.95, 1.95, 4.4), V3(6.0, 1.9, -0.9), 21, 'out'],
  [17.4, V3(5.95, 1.95, 4.4), V3(6.0, 1.9, -0.9), 21, 'lin'],
  [17.85, CAMS.hook.p, CAMS.hook.t, CAMS.hook.fov, 'out'],
  [19.0, CAMS.hook.p, CAMS.hook.t, CAMS.hook.fov, 'lin'],
];
const EASE = { lin: x => x, io: x => sm5(x), out: x => 1 - Math.pow(1 - x, 3) };
function camAt(t) {
  t = wrapT(t);
  let i = 1; while (i < CK.length - 1 && t > CK[i][0]) i++;
  const a = CK[i - 1], b = CK[i], u = EASE[b[4]](clamp((t - a[0]) / (b[0] - a[0])));
  const p = a[1].clone().lerp(b[1], u), tg = a[2].clone().lerp(b[2], u); let fov = lerp(a[3], b[3], u);
  const w = sstep(2.5, 3.0, t) * (1 - sstep(5.6, 6.1, t));          // track the hops
  if (w > 0) { let hx = 0; for (let k = -4; k <= 4; k++) hx += solveHero(t + k * 0.08).pos.x / 9; p.x += (hx * 0.5 - 0.55) * w; tg.x += (hx * 0.75 - 0.8) * w; }
  const sh = sstep(6.6, 6.75, t) * (1 - sstep(8.3, 8.7, t));         // handheld nerves during the panic
  if (sh > 0) { p.x += 0.045 * Math.sin(t * 47) * sh + 0.02 * Math.sin(t * 91) * sh; p.y += 0.035 * Math.sin(t * 59 + 1) * sh; }
  const S = solveHero(t), focus = Math.max(3, S.pos.clone().add(V3(0, 0.9, 0)).distanceTo(p));
  return { p, tg, fov, focus };
}

/* ---------- monitor ---------- */
const MON_TEXT = {};
function monState(t) {
  const m = timeMap(t);
  if (m.mode === 'story' && m.s >= 6.6) return { k: 'error' };
  if (m.mode === 'story' && m.s >= 6.28) return { k: 'deploy', p: sstep(6.28, 6.58, m.s) };
  if (m.mode === 'expl' && m.tau > 0) return { k: 'deploy', p: 0.15 + 0.85 * m.tau / TAU_M };
  return { k: 'prompt' };
}
function drawMonitor(g, t) {
  const w = 2048, h = 1152, st = monState(t), blink = (wrapT(t) * 1.7) % 1 < 0.55;
  g.clearRect(0, 0, w, h); g.textBaseline = 'middle';
  if (st.k === 'error') {
    const fl = 0.5 + 0.5 * Math.sin(t * 13);
    const gr = g.createRadialGradient(w / 2, h / 2, 100, w / 2, h / 2, w * 0.7); gr.addColorStop(0, `rgb(${95 + 35 * fl},18,24)`); gr.addColorStop(1, '#2a0609'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = HEX(PAL.error); g.textAlign = 'center'; g.font = `700 300px ${FONT}`; g.fillText('⚠ ERROR', w / 2, 470);
    g.fillStyle = '#ffd7d9'; g.font = `700 104px ${MONO}`; g.fillText('production is down', w / 2, 740);
    g.fillStyle = '#ff9ea1'; g.font = `700 60px ${MONO}`; if (blink) g.fillText('HTTP 503 · rollback unavailable', w / 2, 950);
    return { st, light: new THREE.Color(PAL.error), I: 6 + 3 * fl };
  }
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#162231'); gr.addColorStop(1, '#0a1017'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(156,195,230,0.14)'; g.fillRect(0, 0, w, 96); g.fillStyle = '#9CC3E6'; g.font = `700 44px ${MONO}`; g.textAlign = 'left'; g.fillText('release.sh — main — zsh', 48, 50);
  ['#ff6b6b', '#ffd166', '#06d6a0'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(w - 200 + i * 58, 48, 16, 0, TAU); g.fill(); });
  g.fillStyle = 'rgba(214,230,245,0.45)'; g.font = `700 40px ${MONO}`;
  ['$ git log --oneline -3', 'a91f2c3 (HEAD -> main) hotfix: just one more thing', '7c0de42 wip', '3b1d9e0 friday cleanup'].forEach((l, i) => g.fillText(l, 96, 170 + i * 52));
  g.textAlign = 'center'; g.fillStyle = '#9CC3E6'; g.font = `700 330px ${FONT}`; g.fillText('FRI 17:59', w / 2, 500);
  MON_TEXT.fri = { x0: w / 2 - g.measureText('FRI 17:59').width / 2, x1: w / 2 + g.measureText('FRI 17:59').width / 2, y0: 500 - 125, y1: 500 + 125 };
  g.textAlign = 'left'; g.font = `700 92px ${MONO}`;
  if (st.k === 'deploy') {
    const line = 'deploying to production…'; const tw = g.measureText(line).width, x = (w - tw) / 2; g.fillStyle = '#ffd166'; g.fillText(line, x, 760);
    g.fillStyle = 'rgba(156,195,230,0.25)'; g.fillRect(w / 2 - 620, 850, 1240, 46); g.fillStyle = '#ffd166'; g.fillRect(w / 2 - 620, 850, 1240 * st.p, 46);
    MON_TEXT.prompt = { x0: x, x1: x + tw, y0: 715, y1: 805 };
    return { st, light: new THREE.Color(PAL.monitor).lerp(new THREE.Color(0xffd166), 0.3), I: 5 };
  }
  const line = '$ deploy to production? [Enter]', tw = g.measureText(line).width, x = (w - tw) / 2 - 20;
  g.fillStyle = '#e6f0fa'; g.fillText(line, x, 760);
  if (blink) { g.fillStyle = '#9CC3E6'; g.fillRect(x + tw + 22, 712, 50, 96); }
  MON_TEXT.prompt = { x0: x, x1: x + tw + 72, y0: 712, y1: 808 };
  return { st, light: new THREE.Color(PAL.monitor), I: 4.6 };
}
/* ---------- VHS OSD ---------- */
const osdT = canvasTex(1920, 1080, () => { });
const OSD_RECT = { x0: 70, y0: 880, x1: 560, y1: 960 };          // pixels on a 1920x1080 frame
function osdText(t) {
  t = wrapT(t);
  if (t >= 1.15 && t < 1.35) return 'PAUSE  ||';
  if ((t >= 1.35 && t < 2.06) || (t >= 11.8 && t < 13.0)) return '<< REWIND';
  if ((t >= 2.06 && t < 2.5) || (t >= 13.0 && t < 13.45)) return 'PLAY  >';
  return null;
}
function drawOsd(g, t) {
  g.clearRect(0, 0, 1920, 1080); const txt = osdText(t); if (!txt) return 0;
  g.font = `700 64px ${MONO}`; g.textBaseline = 'top'; g.fillStyle = '#f5f5f0'; g.shadowColor = 'rgba(255,255,255,0.7)'; g.shadowBlur = 14;
  g.fillText(txt, OSD_RECT.x0, OSD_RECT.y0);
  g.font = `700 40px ${MONO}`; g.textAlign = 'right'; g.fillText('SP  0:00:' + String(Math.floor(wrapT(t) * 3) % 60).padStart(2, '0'), 1850, 900); g.textAlign = 'left'; g.shadowBlur = 0;
  return 1;
}
function vhsAmount(t) {
  t = wrapT(t);
  if (t >= 1.15 && t < 1.35) return 0.35; if (t >= 1.35 && t < 2.06) return 1; if (t >= 2.06 && t < 2.5) return 0.55 * (1 - sstep(2.06, 2.5, t));
  if (t >= 11.8 && t < 13.0) return Math.min(1, (t - 11.8) / 0.08); if (t >= 13.0 && t < 13.45) return 0.55 * (1 - sstep(13.0, 13.45, t)); return 0;
}

/* ---------- apply ---------- */
const zGlow = new THREE.PointLight(PAL.clawd, 0, 3, 2); scene.add(zGlow);
const noseLocal = S => { const P = S.P, yb = FACE_Y - 0.06; return V3(...bodyMap(P, 0, yb, superZ(0, yb))); };
function updateTextures(t) {
  const S = solveHero(t); drawFace(faceT.g, S.P.face, t); faceT.t.needsUpdate = true;
  const ms = drawMonitor(monTex.g, t); monTex.t.needsUpdate = true; monLight.color.copy(ms.light); monLight.intensity = ms.I;
  const o = drawOsd(osdT.g, t); osdT.t.needsUpdate = true; return o;
}
function applyScene(t) {
  const S = solveHero(t); applyHeroMesh(S, t);
  for (const k of KEYS) { const { c, q } = capPose(k, t); k.mesh.position.copy(c); k.mesh.quaternion.copy(q); }
  const m = timeMap(t);
  const zg = m.mode === 'story' ? sstep(STR.tap - 0.03, STR.tap + 0.02, m.s) * (1 - sstep(STR.tap + 0.25, STR.tap + 0.6, m.s)) : 0;
  K.Z.topMat.emissive.setHex(0xff9a5c); K.Z.topMat.emissiveIntensity = 0.9 * zg; zGlow.intensity = 7 * zg; zGlow.position.set(K.Z.x, 1.6, K.Z.z + 0.3);
  // sparks
  const tau = m.mode === 'expl' ? m.tau : 0; sparks.visible = tau > 0;
  if (sparks.visible) { const a = sparkGeo.attributes.position.array, p0 = H0.pos; for (let i = 0; i < SPARK_N; i++) { const s = SPARK[i]; a[i * 3] = p0.x + s.o.x + s.v.x * tau; a[i * 3 + 1] = p0.y + 0.3 + s.o.y + s.v.y * tau + 0.5 * GRAV * 0.4 * tau * tau; a[i * 3 + 2] = p0.z + s.o.z + s.v.z * tau; } sparkGeo.attributes.position.needsUpdate = true; sparks.material.opacity = 0.95 * (1 - sstep(0.5, 0.8, tau / TAU_M) * 0.6); }
  // dust mote: floats in front of him (never inside), kisses the nose, blown away by the sneeze
  const mt = moteAt(t); mote.visible = moteShadow.visible = !!mt;
  if (mt) {
    const nl = noseLocal(S), noseW = nl.clone().add(V3(0, 0, 0.19)).applyQuaternion(S.q).add(S.pos);
    let p;
    if (mt.k === 'drift') p = mt.from.clone().lerp(noseW.clone().add(V3(0.02, 0.25, 0.05)), sm5(mt.u)).add(mt.wob).lerp(noseW, sstep(0.92, 1, mt.u));
    else if (mt.k === 'sit') p = noseW.clone().add(V3(0, mt.bob, 0));
    else { const d = mt.d; p = noseW.clone().add(V3(1.3 * d * 4, 0.9 * d * 4 + 2 * d * d, 2.6 * d * 5)); }
    mote.position.copy(p); mote.material.opacity = mt.a; mote.material.rotation = t * 0.6;
    const sh = nl.clone().add(V3(0, -0.07, 0.008)).applyQuaternion(S.q).add(S.pos); moteShadow.position.copy(sh); moteShadow.quaternion.copy(S.q);
    moteShadow.material.opacity = 0.3 * mt.a * (mt.k === 'sit' ? 1 : mt.k === 'drift' ? sstep(0.8, 1, mt.u) : 1 - sstep(0, 0.1, mt.d));
  }
}
