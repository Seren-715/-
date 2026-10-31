/* =====================================================================
   CLOCKS + HERO CHOREOGRAPHY  (pure functions of time)
   story clock s : 2.17 .. 11.7 (rewind #2 runs it backwards to 5.55)
   P clock       : 13.0 .. 17.85 (relief, tiptoe, dust mote, sneeze, blown back)
   explosion tau : solved ballistic clock, 17.85 -> 19 == 0 -> 1.15, freeze, rewind #1
   ===================================================================== */
const TAU_A = 0.08, TAU_B = 0.62, TAU_C = 0.40;
const tauU = u => TAU_A * u + TAU_B * (1 - Math.exp(-u / TAU_C));
const TAU_M = tauU(2.3);
const S_RW_END = 5.55;
function timeMap(t) {
  t = wrapT(t);
  if (t < 1.15) return { mode: 'expl', tau: tauU(t + 1.15) };
  if (t < 1.35) return { mode: 'expl', tau: TAU_M, freeze: (t - 1.15) / 0.2 };
  if (t < 2.06) return { mode: 'expl', tau: TAU_M * (1 - sstep(1.35, 2.06, t)), rw: 1 };
  if (t < 2.17) return { mode: 'expl', tau: 0, settle: sstep(2.06, 2.17, t) };
  if (t < 11.7) return { mode: 'story', s: t };
  if (t < 11.8) return { mode: 'story', s: 11.7 };
  if (t < 13.0) return { mode: 'story', s: 11.7 - (11.7 - S_RW_END) * sstep(11.8, 13.0, t), rw: 2 };
  if (t < 17.85) return { mode: 'p2', s: t };
  return { mode: 'expl', tau: tauU(t - 17.85) };
}

/* ---------- hero dimensions (12 x 8 x 6) ---------- */
const HA = 0.95, HB = 0.635, HC = 0.475, LEG_REST = 0.46;
const FEET = [[-0.5, -0.21], [0.5, -0.21], [-0.5, 0.21], [0.5, 0.21]];   // body-coord x,z  (0,2 = left/back pair in stretch)
const pose0 = () => ({ nubRS: 1, x: 0, z: 0, y: null, yaw: 0, pitch: 0, roll: 0, sy: 1, st: 1, anchorX: 0, bulge: 0, shearX: 0, shearZ: 0, twist: 0,
  nubL: 0.3, nubR: 0.3, splay: 0, reach: 0, ls: 1, stride: 0, strideA: 0, tuck: 0, planted: [1, 1, 1, 1], impact: 0.3,
  face: { name: 'neutral', look: [0, 0], sweat: 0 } });
/** world x,z of a foot for a pose (ignores pitch/roll; good for contact lookup) */
function footXZ(p, i) {
  const lx = (FEET[i][0] - p.anchorX) * p.st, lz = FEET[i][1];
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
}
const groundAt = (cx, cz, yaw = 0) => { const p = pose0(); p.x = cx; p.z = cz; p.yaw = yaw; let y = 0; for (let i = 0; i < 4; i++) { const [x, z] = footXZ(p, i); y += restTopAt(x, z); } return y / 4; };

/* ---------- hop helper ---------- */
function hopPose(p, hp, s) {
  const [ax, az] = hp.A, [bx, bz] = hp.B;
  if (s < hp.t0) {                                            // anticipation crouch
    const c = sstep(hp.t0 - hp.crouch, hp.t0, s);
    p.x = ax; p.z = az; p.sy = 1 - hp.cd * c; p.bulge = 0.12 * c; p.nubL = p.nubR = 0.3 - 0.25 * c; p.yaw = hp.yawA ?? 0;
    p.shearX = -0.06 * c * Math.sign(bx - ax);
  } else if (s < hp.t1) {                                     // airborne
    const u = (s - hp.t0) / (hp.t1 - hp.t0), e = hp.ease ? hp.ease(u) : u;
    p.x = lerp(ax, bx, e); p.z = lerp(az, bz, e);
    p.y = lerp(groundAt(ax, az), groundAt(bx, bz), e) + hp.h * arc(u);
    p.planted = [0, 0, 0, 0];
    p.sy = 1 + 0.16 * Math.sin(Math.PI * u) - 0.05 * u; p.bulge = -0.05 * Math.sin(Math.PI * u);
    p.nubL = p.nubR = 0.4 + 1.1 * Math.sin(Math.PI * Math.min(1, u * 1.3)); p.tuck = Math.sin(Math.PI * u);
    p.yaw = lerp(hp.yawA ?? 0, hp.yawB ?? 0, e) - 0.22 * Math.sign(bx - ax) * Math.sin(Math.PI * u);
    p.pitch = -0.1 * Math.sin(TAU * u) * Math.sign(bz - az || 1);
    p.shearX = 0.08 * Math.cos(Math.PI * u) * Math.sign(bx - ax);
  } else {                                                    // landing squash + jiggle
    const d = s - hp.t1; p.x = bx; p.z = bz; p.yaw = hp.yawB ?? 0;
    const j = spring(d, 6, 0.28);
    p.sy = 1 - hp.land * j; p.bulge = 0.28 * hp.land * Math.max(0, j);
    p.nubL = p.nubR = 0.3 + 0.9 * kick(d, 4, 0.3); p.shearX = 0.05 * kick(d, 5, 0.3) * Math.sign(bx - ax);
    p.impact = hp.impact ?? 0.4;
  }
  return p;
}

/* ---------- STORY (s clock) ---------- */
const ST = { enter: [6.375, 0], semi: [4.25, 0], ctrlStance: [-6.375, 2] };
const HOP_T = [[3.25, 0], [1.25, 0], [-0.75, 0], [-1.75, 0], [0.0, -1], [1.25, 0], [2.25, 0], [3.0, -1], [2.25, 0], [4.25, 0]];
const HOPS = [];
{
  let prev = ST.enter;
  HOP_T.forEach((B, i) => {
    const t0 = 2.25 + 0.3 * i, d = Math.hypot(B[0] - prev[0], B[1] - prev[1]);
    HOPS.push({ A: prev, B, t0, t1: t0 + 0.22, h: 0.55 + 0.16 * d, crouch: 0.09, cd: 0.16, land: 0.2, impact: 0.45 }); prev = B;
  });
}
const BIG = { A: ST.semi, B: ST.enter, t0: 5.96, t1: 6.28, h: 1.0, crouch: 0.26, cd: 0.36, land: 0.36, impact: 1.0 };
const DODGE = [
  { A: ST.enter, B: ST.enter, t0: 6.66, t1: 6.9, h: 0.55, crouch: 0.05, cd: 0.1, land: 0.25, impact: 0.5 },
  { A: ST.enter, B: [5.95, 0], t0: 7.32, t1: 7.54, h: 0.45, crouch: 0.07, cd: 0.14, land: 0.22, impact: 0.45 },
  { A: [5.95, 0], B: [6.75, 0], t0: 7.78, t1: 8.0, h: 0.5, crouch: 0.07, cd: 0.14, land: 0.22, impact: 0.45 },
  { A: [6.75, 0], B: ST.enter, t0: 8.2, t1: 8.4, h: 0.38, crouch: 0.07, cd: 0.12, land: 0.2, impact: 0.4 },
];
const DASH = { t0: 8.93, leap: 9.18, t1: 9.85, mid: [1.5, 2], steps: 7 };
const STR = { t0: 10.2, full: 10.9, tapDown: 11.12, tap: 11.22, release: 11.35, t1: 11.69, ang: Math.atan2(-(K.Z.z - K.LCtrl.z), K.Z.x - K.LCtrl.x), st: 1.45 };
const BLINKS = [3.05, 8.78, 10.02, 13.92, 15.42, 16.1];
const blinkAt = t => BLINKS.some(b => t >= b && t < b + 0.11);

function heroStory(s) {
  const p = pose0(), f = p.face;
  if (s < HOPS[0].t0 - HOPS[0].crouch) { p.x = ST.enter[0]; p.z = ST.enter[1]; f.name = 'happy'; p.sy = 1 + 0.02 * Math.sin(s * 9); return p; }
  if (s < 6.28 + 0.32) {
    f.name = s < 5.7 ? 'hum' : 'happy';
    const all = [...HOPS, BIG];
    let hp = all[0];
    for (const h of all) if (s >= h.t0 - h.crouch) hp = h;
    hopPose(p, hp, s);
    if (hp === HOPS[9] && s > hp.t1) {                       // wiggle, then the big squash
      const d = s - hp.t1; p.roll = 0.13 * Math.sin(d * 30) * Math.exp(-d * 5.5); p.shearX = 0.06 * Math.sin(d * 30 + 1) * Math.exp(-d * 5.5);
      f.name = 'hum'; if (s > 4.6 && s < 4.9) f.name = 'happy';
    }
    if (hp === BIG && s >= BIG.t1) { const d = s - BIG.t1; p.nubL = p.nubR = 1.5 * sstep(0, 0.12, d); f.name = 'tada'; }
    if (hp === BIG && s < BIG.t0) f.name = 'happy';
    return p;
  }
  if (s < 8.7) {                                              // ERROR: double take, dodging popcorn
    let hp = null; for (const h of DODGE) if (s >= h.t0 - h.crouch) hp = h;
    if (hp) hopPose(p, hp, s); else { p.x = ST.enter[0]; p.z = 0; }
    const d = s - 6.6;
    f.name = d < 0.06 ? 'tada' : (d < 0.6 ? 'shock' : 'panic'); f.sweat = sstep(6.75, 7.0, s);
    f.look = [Math.sin(s * 7.3) * 0.9, -0.15 + 0.2 * Math.sin(s * 5.1)];
    p.nubL = Math.max(p.nubL, 1.3 + 0.35 * Math.sin(s * 23)); p.nubR = Math.max(p.nubR, 1.3 + 0.35 * Math.cos(s * 21));
    if (!hp || s > hp.t1 + 0.25) { p.sy = 1 + 0.045 * Math.sin(s * 31); p.shearX = 0.05 * Math.sin(s * 17); }
    p.twist = 0.3 * Math.sin(s * 4.7) * sstep(6.7, 7.0, s);
    return p;
  }
  if (s < DASH.t0) {                                          // look left, gather
    const c = sstep(8.7, DASH.t0, s); p.x = ST.enter[0]; p.z = 0;
    f.name = 'determined'; f.look = [-1, 0]; f.sweat = 0.7; p.sy = 1 - 0.24 * c; p.bulge = 0.1 * c; p.twist = -0.35 * c; p.shearX = 0.08 * c; p.nubL = p.nubR = 0.6 - 0.4 * c;
    return p;
  }
  if (s < DASH.leap) {                                        // leap down onto the space bar
    hopPose(p, { A: ST.enter, B: DASH.mid, t0: DASH.t0, t1: DASH.leap, h: 0.9, crouch: 0.01, cd: 0, land: 0, yawA: 0, yawB: -0.3, ease: x => x }, s); p.twist = -0.35 * (1 - (s - DASH.t0) / (DASH.leap - DASH.t0));
    f.name = 'determined'; f.look = [-1, 0]; p.nubL = 0.9; p.nubR = 0.2; return p;
  }
  if (s < DASH.t1 + 0.12) {                                   // run along Space, Alt, Win to Ctrl
    const u = clamp((s - DASH.leap) / (DASH.t1 - DASH.leap)), e = 1 - Math.pow(1 - u, 1.6);
    p.x = lerp(DASH.mid[0], ST.ctrlStance[0], e); p.z = 2;
    const ph = u * DASH.steps, b = Math.abs(Math.sin(Math.PI * ph));
    const air = u < 1 ? 0.16 * b : 0;
    p.yaw = lerp(-0.3, 0, sstep(0.85, 1, u)); p.twist = -0.25 * (1 - sstep(0.85, 1, u)); p.shearX = -0.14 * (1 - sstep(0.9, 1, u));
    const onKeys = [0, 1, 2, 3].every(i => { const [fx, fz] = footXZ(p, i), k = keyAt(fx, fz); return k && onTop(k, fx, fz, 0.035); });
    p.planted = air < 0.012 && onKeys ? [1, 1, 1, 1] : [0, 0, 0, 0];
    p.y = p.planted[0] ? null : groundAt(p.x, p.z, p.yaw) + Math.max(air, 0.025);
    p.sy = 0.94 + 0.08 * b; p.stride = ph * Math.PI; p.strideA = 0.9 * (1 - sstep(0.9, 1, u)); p.nubL = 0.2 + 0.8 * Math.abs(Math.sin(ph * Math.PI)); p.nubR = 0.2 + 0.8 * Math.abs(Math.cos(ph * Math.PI));
    p.impact = 0.12; f.name = 'determined'; f.look = [-1, 0];
    if (s > DASH.t1) { const d = s - DASH.t1; p.sy = 1 - 0.2 * spring(d, 6, 0.3); p.impact = 0.6; }
    return p;
  }
  /* ---- stretch mode: anchored at the back (left) feet on Ctrl ---- */
  p.anchorX = -0.5; p.x = K.LCtrl.x; p.z = K.LCtrl.z; f.name = 'determined'; f.look = [0.9, 0.1];
  if (s < STR.t0) {
    const d = s - (DASH.t1 + 0.12), lift = sstep(DASH.t1 + 0.14, DASH.t1 + 0.24, s), r = sstep(DASH.t1 + 0.24, STR.t0, s);
    p.yaw = STR.ang * r; p.planted = lift > 0.5 ? [1, 0, 1, 0] : [1, 1, 1, 1]; p.sy = 1 - 0.1 * spring(d, 5, 0.3); p.nubR = 0.3 + 0.5 * r;
    p.tuck = lift; p.ls = 1 + 0.2 * lift; return p;   // tuck the front legs first, then pivot on the back legs
  }
  p.yaw = STR.ang; p.planted = [1, 0, 1, 0]; p.tuck = 1;
  if (s < STR.release) {
    const g = sstep(STR.t0, STR.full, s);
    const wob = 0.03 * Math.sin((s - STR.t0) * 34) * g * (1 - sstep(STR.full, STR.full + 0.15, s));
    p.st = 1 + (STR.st - 1) * g + wob + (s > STR.full ? 0.012 * Math.sin(s * 47) : 0);
    p.sy = 1 - 0.34 * g; p.bulge = -0.06 * g; p.roll = -0.05 * g; p.reach = 0; p.ls = 1.2;   // up on the back legs, front legs tucked
    const down = sstep(STR.tapDown, STR.tap, s) * (1 - sstep(STR.tap + 0.03, STR.release, s));
    p.nubR = lerp(0.95 * g + 0.3 * (1 - g), -1.25, down); p.nubRS = 1 + 2.1 * down;   // the nub stretches like taffy down to Z p.nubL = 0.25 + 0.5 * g;
    f.name = s < STR.tap ? 'strain' : 'triumph'; f.sweat = s < STR.tap ? sstep(STR.t0, STR.t0 + 0.3, s) : 1 - sstep(STR.tap, STR.release, s);
    return p;
  }
  const d = s - STR.release, r = sstep(STR.release, STR.t1 - 0.12, s);
  p.st = 1 + (STR.st - 1) * (1 - r) - 0.08 * kick(d, 5, 0.35) * r;
  p.sy = lerp(0.66, 1, r) + 0.12 * kick(d, 4.5, 0.3); p.roll = -0.05 * (1 - r); p.yaw = STR.ang * (1 - r);
  p.tuck = 1 - sstep(STR.t1 - 0.12, STR.t1 - 0.06, s); p.planted = p.tuck < 0.5 ? [1, 1, 1, 1] : [1, 0, 1, 0]; p.ls = 1 + 0.2 * p.tuck; p.nubR = 0.3 + 0.9 * (1 - r); p.nubL = 0.3 + 0.6 * kick(d, 4, 0.3);
  f.name = 'triumph';
  if (s >= STR.t1 - 0.08) p.impact = 0.35;
  return p;
}

/* ---------- P clock: relief, tiptoe, smug, dust mote, ah... ah... ACHOO, blown back ---------- */
const P2 = { stepA: [13.82, 14.32], stepB: [14.46, 14.96], m1: [5.0, -1], m2: [6.0, -1], achoo: 17.30, blow: [17.42, 17.80] };
function moteAt(t) {
  t = wrapT(t);
  if (t < 15.2 || t > 17.62) return null;
  const nose = V3(P2.m2[0] + 0.0, 0, P2.m2[1] + HC + 0.17);  // y filled in by apply (face height)
  if (t < 16.45) {
    const u = sstep(15.2, 16.45, t);
    return { k: 'drift', u, a: sstep(15.2, 15.45, t), from: V3(8.8, 4.6, 1.2), wob: V3(0.55 * Math.sin(t * 2.3) * (1 - u), 0.18 * Math.sin(t * 3.1) * (1 - u), 0.35 * Math.sin(t * 1.7) * (1 - u)), nose };
  }
  if (t < P2.achoo) return { k: 'sit', a: 1, bob: 0.025 * Math.sin(t * 8.5), nose };
  return { k: 'blown', d: t - P2.achoo, a: 1 - sstep(P2.achoo + 0.05, P2.achoo + 0.3, t), nose };
}
function heroP2(t) {
  const p = pose0(), f = p.face;
  p.x = ST.semi[0]; p.z = ST.semi[1];
  if (t < P2.stepA[0] - 0.05) {
    f.name = t < 13.08 ? 'happy' : 'relief'; f.sweat = sstep(13.06, 13.16, t) * (1 - sstep(13.5, 13.62, t));
    const w = sstep(13.22, 13.32, t) * (1 - sstep(13.6, 13.74, t));
    p.nubR = 0.3 + w * (1.25 + 0.35 * Math.sin((t - 13.22) * 22)); p.sy = 1 + 0.03 * Math.sin((t - 13.0) * 6) - 0.04 * sstep(13.1, 13.3, t) * (1 - sstep(13.3, 13.7, t));
    p.roll = 0.04 * Math.sin((t - 13) * 5);
    return p;
  }
  const tip = (A, B, a, b) => hopPose(p, { A, B, t0: a, t1: b, h: 0.3, crouch: 0.05, cd: 0.05, land: 0.07, impact: 0.12, ease: sm5 }, t);
  if (t < P2.stepB[0] - 0.05) tip(ST.semi, P2.m1, P2.stepA[0], P2.stepA[1]);
  else if (t < 17.42) tip(P2.m1, P2.m2, P2.stepB[0], P2.stepB[1]);
  if (t < 14.96 + 0.2) { p.ls = 1.22; p.pitch = -0.06; p.nubL = p.nubR = 1.0; f.name = 'smug'; f.look = [0.6, 0]; p.tuck = 0; return p; }
  p.ls = lerp(1.22, 1, sstep(15.0, 15.3, t));
  if (t < 15.9) { const g = sstep(14.98, 15.25, t) * (1 - sstep(15.62, 15.9, t)); p.twist = 0.5 * g; f.name = 'smug'; f.look = [0.5 * g, 0]; p.sy = 1 + 0.025 * Math.sin(t * 6.5); p.nubL = p.nubR = lerp(1.0, 0.3, sstep(15.0, 15.4, t)); return p; }
  if (t < P2.blow[0]) {
    f.name = t < 16.4 ? 'lookup' : 'cross';
    let back = 0;
    if (t > 16.5) back = 0.13 * sstep(16.5, 16.62, t) + 0.15 * sstep(16.9, 17.02, t) + 0.05 * sstep(17.1, 17.28, t);
    if (t > 16.5) f.name = t < 16.9 ? 'ah1' : 'ah2';
    p.pitch = -0.35 * back; p.shearZ = -0.9 * back; p.sy = 1 + 0.35 * back; p.nubL = p.nubR = 0.3 + 1.5 * back;
    if (t >= P2.achoo) {
      const d = t - P2.achoo, k = sstep(P2.achoo, P2.achoo + 0.05, t);
      p.pitch = lerp(-0.35 * back, 0.12, k) - 0.1 * kick(d, 6, 0.3) * k; p.shearZ = lerp(-0.9 * back, 0.3, k) - 0.2 * kick(d, 6, 0.3) * k; p.sy = lerp(1.1, 0.76, k) + 0.2 * kick(d, 5, 0.3); p.bulge = 0.18 * k;
      p.nubL = p.nubR = 0.2; f.name = d < 0.06 ? 'achoo' : 'dazed';
    }
    return p;
  }
  // blown back onto Enter (lands 17.80, Enter bottoms out, explosion at 17.85)
  const [a, b] = P2.blow;
  if (t < b) {
    const u = (t - a) / (b - a);
    p.x = lerp(P2.m2[0], ST.enter[0], u); p.z = lerp(P2.m2[1], ST.enter[1], u);
    p.y = lerp(groundAt(P2.m2[0], P2.m2[1]), groundAt(ST.enter[0], ST.enter[1]), u) + 0.8 * arc(u);
    p.planted = [0, 0, 0, 0]; p.pitch = -0.55 * Math.sin(Math.PI * u); p.roll = 0.35 * Math.sin(Math.PI * u); p.sy = 1.1;
    p.nubL = 1.5 + 0.3 * Math.sin(t * 40); p.nubR = 1.5 + 0.3 * Math.cos(t * 40); p.splay = 0.5 * Math.sin(Math.PI * u); p.tuck = 0.4;
    f.name = 'uhoh'; f.sweat = 1;
  } else {
    p.x = ST.enter[0]; p.z = 0; const d = t - b; p.sy = 1 - 0.28 * sstep(0, 0.035, d); p.bulge = 0.2 * sstep(0, 0.035, d); p.impact = 1.0;
    p.nubL = p.nubR = 1.2; f.name = 'uhoh'; f.sweat = 1;
  }
  return p;
}
