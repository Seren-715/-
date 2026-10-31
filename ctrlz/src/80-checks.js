/* =====================================================================
   CHECKS: measure, don't guess.  window.runChecks({sub}) walks every frame
   (sub-sampled) and reports contacts, feet off keys, the nub tap, monitor
   text covered/cropped, OSD over the monitor text, and the loop seam.
   ===================================================================== */
function rectNDC(pts) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, behind = false; for (const p of pts) { const v = p.clone().project(camera); if (v.z > 1) behind = true; x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); } return { x0, y0, x1, y1, behind }; }
const ovl = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const area = a => Math.max(0, a.x1 - a.x0) * Math.max(0, a.y1 - a.y0);
function monRectWorld(r) { const pts = []; for (const [px, py] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]]) pts.push(V3((px / 2048 - 0.5) * MON.w, (0.5 - py / 1152) * MON.h, 0.24).add(MON.pos)); return pts; }
function obbCorners(o) { const out = []; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push(o.c.clone().addScaledVector(o.a[0], sx * o.e[0]).addScaledVector(o.a[1], sy * o.e[1]).addScaledVector(o.a[2], sz * o.e[2])); return out; }
function ranges(ts, gap = 0.05) { const out = []; for (const t of ts) { const l = out[out.length - 1]; if (l && t - l[1] <= gap) l[1] = t; else out.push([t, t]); } return out.map(([a, b]) => a === b ? +a.toFixed(3) : `${a.toFixed(2)}-${b.toFixed(2)}`); }
window.runChecks = function (opt = {}) {
  const sub = opt.sub || 4, R = { capCap: [], capHero: [], capStatic: [], feetOff: [], textHero: [], textOSD: [], textCrop: [], worst: {} };
  drawMonitor(monTex.g, 3.0); const textRects = [MON_TEXT.fri, MON_TEXT.prompt].map(r => ({ ...r }));
  const bump = (k, t, v) => { if (!R.worst[k] || v > R.worst[k][1]) R.worst[k] = [+t.toFixed(3), +v.toFixed(4)]; };
  for (let f = 0; f < NF; f++) for (let j = 0; j < sub; j++) {
    const t = (f + j / sub) / FPS, S = solveHero(t), HO = heroOBBs(S);
    const caps = KEYS.map(k => { const { c, q } = capPose(k, t); return capOBB(k, c, q); });
    let cc = false, ch = false, cs = false;
    for (let a = 0; a < caps.length; a++) {
      for (let b = a + 1; b < caps.length; b++) if (obbOverlap(caps[a], caps[b], -0.003)) { cc = true; bump('capCap', t, 1); }
      // legs: tolerance = dish depth (the cap box is flat on top, the real top is dished)
      if (HO.some((B, bi) => B.standsOn !== KEYS[a] && obbOverlap(caps[a], B, bi === 0 ? -0.004 : -0.03))) { ch = true; (R.chWho ??= {})[KEYS[a].id] = (R.chWho[KEYS[a].id] || 0) + 1; }
      for (const B of STATIC_OBB) if (obbOverlap(caps[a], B, -0.003)) cs = true;
    }
    if (cc) R.capCap.push(t); if (ch) R.capHero.push(t); if (cs) R.capStatic.push(t);
    // feet on keycaps
    for (const i of S.planted) {
      const a = S.attach[i].clone().applyQuaternion(S.q).add(S.pos), dn = V3(0, -1, 0).applyQuaternion(S.q), fpos = a.addScaledVector(dn, S.legLen[i]);
      const k = keyAt(fpos.x, fpos.z);
      if (!k || !onTop(k, fpos.x, fpos.z, 0.03)) { R.feetOff.push(t); break; }
    }
    // text vs hero / OSD / crop (once per frame)
    if (j === 0) {
      placeCamera(camAt(t), 0, 1); camera.updateMatrixWorld();
      const hr = rectNDC(HO.flatMap(obbCorners));
      const ot = osdText(t), osd = { x0: OSD_RECT.x0 / 960 - 1, x1: OSD_RECT.x1 / 960 - 1, y0: 1 - OSD_RECT.y1 / 540, y1: 1 - OSD_RECT.y0 / 540 };
      for (const r of textRects) {
        const tr = rectNDC(monRectWorld(r)); if (tr.behind) continue;
        const inF = { x0: Math.max(tr.x0, -1), x1: Math.min(tr.x1, 1), y0: Math.max(tr.y0, -1), y1: Math.min(tr.y1, 1) };
        const vis = area(inF) / Math.max(1e-9, area(tr));
        if (vis > 0.02 && vis < 0.98) R.textCrop.push(t);
        if (vis > 0.02 && ovl(hr, tr) / area(tr) > 0.03) { R.textHero.push(t); bump('textHero', t, ovl(hr, tr) / area(tr)); }
        if (ot && ovl(osd, tr) > 0) R.textOSD.push(t);
      }
    }
  }
  // the nub really taps Z
  const SZ = solveHero(STR.tap), tip = nubTipWorld(SZ), zTop = CAP_BOTTOM + capTopLocal(K.Z, 0, 0) - depth('Z', STR.tap);
  R.nubTap = { tipY_minus_Ztop: +(tip.y - zTop).toFixed(3), dx: +(tip.x - K.Z.x).toFixed(3), dz: +(tip.z - K.Z.z).toFixed(3) };
  // loop seam: pose and velocity
  const h = 1 / 240; let dp = 0, dv = 0, vmax = 0;
  const pts = t => [solveHero(t).pos, ...KEYS.map(k => capPose(k, t).c)];
  const a0 = pts(0), aE = pts(DUR - 1e-6), aH = pts(h), aEh = pts(DUR - h);
  for (let i = 0; i < a0.length; i++) { dp = Math.max(dp, a0[i].distanceTo(aE[i])); const v0 = aH[i].clone().sub(a0[i]).divideScalar(h), v1 = aE[i].clone().sub(aEh[i]).divideScalar(h); dv = Math.max(dv, v0.distanceTo(v1)); vmax = Math.max(vmax, v0.length()); }
  R.seam = { maxPosStep: +dp.toExponential(2), maxVelDelta: +dv.toFixed(4), typicalSpeed: +vmax.toFixed(3) };
  const out = { samples: NF * sub };
  for (const k of ['capCap', 'capHero', 'capStatic', 'feetOff', 'textHero', 'textOSD', 'textCrop']) out[k] = { count: R[k].length, at: ranges(R[k]).slice(0, 14) };
  out.nubTap = R.nubTap; out.capHeroWho = R.chWho; out.seam = R.seam; out.worst = R.worst; out.explBadSamples = TIMELINE.stats.explBad; out.pops = TIMELINE.stats.pops;
  return out;
};
window.__DBG2 = { camAt, placeCamera, camera, monRectWorld, rectNDC, MON_TEXT, drawMonitor, monTex, solveHero, heroOBBs, keyAt, onTop, V3 };
