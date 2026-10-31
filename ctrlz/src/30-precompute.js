/* =====================================================================
   PRECOMPUTE (deterministic): key contacts -> press envelopes, hero solve,
   popcorn schedule and explosion arcs, both validated with OBB tests.
   ===================================================================== */
const CAMS = {
  hook: { p: V3(3.3, 2.45, 10.6), t: V3(4.35, 2.55, -0.6), fov: 33 },
  calm: { p: V3(0.7, 3.05, 10.9), t: V3(0.9, 3.7, -4.0), fov: 35 },
};
const GRAV = -8;

/* ---------- OBB (separating axis test) ---------- */
const tmpM = new THREE.Matrix4();
function makeOBB(c, q, e) { tmpM.makeRotationFromQuaternion(q); const a = [V3(), V3(), V3()]; tmpM.extractBasis(a[0], a[1], a[2]); return { c, a, e, r: Math.hypot(e[0], e[1], e[2]) }; }
function obbOverlap(A, B, margin = 0) {
  const d = B.c.clone().sub(A.c); if (d.length() > A.r + B.r + 2 * margin) return false;
  const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], AR = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { R[i][j] = A.a[i].dot(B.a[j]); AR[i][j] = Math.abs(R[i][j]) + 1e-6; }
  const t = [d.dot(A.a[0]), d.dot(A.a[1]), d.dot(A.a[2])];
  const ea = A.e.map(x => x + margin), eb = B.e.map(x => x + margin);
  for (let i = 0; i < 3; i++) if (Math.abs(t[i]) > ea[i] + eb[0] * AR[i][0] + eb[1] * AR[i][1] + eb[2] * AR[i][2]) return false;
  for (let j = 0; j < 3; j++) if (Math.abs(t[0] * R[0][j] + t[1] * R[1][j] + t[2] * R[2][j]) > ea[0] * AR[0][j] + ea[1] * AR[1][j] + ea[2] * AR[2][j] + eb[j]) return false;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const i1 = (i + 1) % 3, i2 = (i + 2) % 3, j1 = (j + 1) % 3, j2 = (j + 2) % 3;
    const ra = ea[i1] * AR[i2][j] + ea[i2] * AR[i1][j], rb = eb[j1] * AR[i][j2] + eb[j2] * AR[i][j1];
    if (Math.abs(t[i2] * R[i1][j] - t[i1] * R[i2][j]) > ra + rb) return false;
  }
  return true;
}
const QI = new THREE.Quaternion();
const STATIC_OBB = [  // plate (under the caps) and the four case walls
  makeOBB(V3(0, 0.25, 0), QI, [7.62, 0.05, 2.62]),
  makeOBB(V3(0, 0.12, -2.92), QI, [8.2, 0.46, 0.27]), makeOBB(V3(0, 0.12, 2.92), QI, [8.2, 0.46, 0.27]),
  makeOBB(V3(-7.92, 0.12, 0), QI, [0.27, 0.46, 3.2]), makeOBB(V3(7.92, 0.12, 0), QI, [0.27, 0.46, 3.2]),
];

/* ---------- 1. contacts from the choreography ---------- */
const DOM = { story: [2.0, 11.76], p2: [12.95, 17.86] };
const IV = { story: {}, p2: {} };
{
  const dt = 1 / 240;
  for (const dom of ['story', 'p2']) {
    const open = {};
    const [a, b] = DOM[dom];
    for (let s = a; s <= b + 1e-9; s += dt) {
      const p = dom === 'story' ? heroStory(s) : heroP2(s);
      const now = {};
      p.planted.forEach((pl, i) => { if (!pl) return; const [x, z] = footXZ(p, i); const k = keyAt(x, z); if (k) now[k.id] = (now[k.id] || 0) + 1; });
      for (const id in now) { if (!open[id]) open[id] = { t0: s, t1: s, w: now[id], impact: p.impact }; else { open[id].t1 = s; open[id].w = Math.max(open[id].w, now[id]); } }
      for (const id in open) if (!now[id]) { (IV[dom][id] ??= []).push(open[id]); delete open[id]; }
    }
    for (const id in open) { open[id].t1 = 1e9; (IV[dom][id] ??= []).push(open[id]); }
  }
  // the nub taps Z (not a foot)
  (IV.story.Z ??= []).push({ t0: STR.tap - 0.032, t1: STR.tap + 0.09, w: 1, impact: 0.9 });
  for (const dom in IV) for (const id in IV[dom]) for (const iv of IV[dom][id]) {
    iv.hold = Math.min(0.15, 0.06 * iv.w + 0.02); iv.peak = Math.min(MAX_TRAVEL, iv.hold + 0.035 + 0.09 * iv.impact);
    if (id === 'Z') { iv.hold = 0.17; iv.peak = MAX_TRAVEL; }
    if (iv.t0 <= DOM[dom][0] + 1e-6) { iv.t0 = -100; }        // already standing when the clock starts
  }
}
const RISE = 0.032;
function envelope(iv, s) {
  if (s < iv.t0) return 0;
  const held = s2 => s2 < iv.t0 + RISE ? iv.peak * sstep(iv.t0, iv.t0 + RISE, s2) : iv.hold + (iv.peak - iv.hold) * spring(s2 - iv.t0 - RISE, 9, 0.45);
  if (s <= iv.t1) return held(s);
  const r = s - iv.t1; if (r > 0.6) return 0;
  return held(iv.t1) * spring(r, 11, 0.32);
}
const depthDom = (dom, id, s) => { let d = 0; for (const iv of IV[dom][id] || []) { const e = envelope(iv, s); if (Math.abs(e) > Math.abs(d)) d = e; } return clamp(d, -0.022, MAX_TRAVEL); };
function depth(id, t) {
  const m = timeMap(t);
  if (m.mode === 'story') return depthDom('story', id, m.s);
  if (m.mode === 'p2') return depthDom('p2', id, m.s);
  if (m.settle !== undefined) return lerp(depthDom('p2', id, 17.85), depthDom('story', id, 2.17), m.settle);
  if (m.tau === 0) return depthDom('p2', id, 17.85);
  return 0;
}

/* ---------- 2. hero solve (pose -> world transform with feet planted on the caps) ---------- */
function bodyMap(P, x, y, z) {
  const yn = y / HB, sxz = 1 / Math.sqrt(P.sy), bul = 1 + P.bulge * (1 - yn * yn);
  let X = x * sxz * bul, Y = y * P.sy, Z = z * sxz * bul;
  if (P.st !== 1) { const A = P.anchorX, xr = clamp((x - A) / (HA - A)); X = A + (X - A) * P.st; const th = 1 - (1 - 1 / Math.sqrt(P.st)) * Math.sin(Math.PI * xr) * 0.9; Y *= th; Z *= th; }
  X += P.shearX * (yn + 1) * 0.5; Z += P.shearZ * (yn + 1) * 0.5;
  if (P.twist) { const a = P.twist * (yn + 1) * 0.5, c = Math.cos(a), sn = Math.sin(a), X0 = X - P.anchorX; X = P.anchorX + X0 * c + Z * sn; Z = -X0 * sn + Z * c; }
  return [X - P.anchorX, Y + LEG_REST * P.ls + HB * P.sy, Z];
}
const qFrom = P => new THREE.Quaternion().setFromEuler(new THREE.Euler(P.pitch, P.yaw, P.roll, 'YXZ'));
function solveFromPose(P, t) {
  const q = qFrom(P), down = V3(0, -1, 0).applyQuaternion(q), up = V3(0, 1, 0).applyQuaternion(q);
  const L0 = LEG_REST * P.ls;
  // feet stay on their stance when the body squashes: attach x/z are nominal, height follows the body
  const attach = FEET.map(([fx, fz]) => V3((fx - P.anchorX) * P.st, bodyMap(P, fx, -HB + 0.07, fz)[1], fz));
  const rotA = attach.map(a => a.clone().applyQuaternion(q));
  const keys = [], footY = [];
  for (let i = 0; i < 4; i++) {
    const fx = P.x + rotA[i].x + down.x * L0, fz = P.z + rotA[i].z + down.z * L0;
    const k = keyAt(fx, fz); keys.push(k);
    footY.push(k ? CAP_BOTTOM + capTopLocal(k, fx - k.x, fz - k.z) - depth(k.id, t) : restTopAt(fx, fz));
  }
  const pl = [0, 1, 2, 3].filter(i => P.planted[i] && keys[i]);
  let y;
  if (pl.length) y = pl.reduce((acc, i) => acc + footY[i] - (rotA[i].y + down.y * L0), 0) / pl.length;
  else y = P.y - [0, 1, 2, 3].reduce((acc, i) => acc + (rotA[i].y + down.y * L0), 0) / 4;
  const legLen = [0, 1, 2, 3].map(i => {
    if (pl.includes(i)) return clamp((rotA[i].y + y - footY[i]) / Math.max(0.5, up.y), 0.2, 0.85);
    return LEG_REST * (1 - 0.6 * P.tuck);
  });
  return { P, pos: V3(P.x, y, P.z), q, attach, legLen, keys, planted: pl };
}
function heroOBBs(S) {
  const P = S.P, back = bodyMap(P, -HA, 0, 0), front = bodyMap(P, HA, 0, 0);
  const sxz = 1 / Math.sqrt(P.sy), bul = 1 + Math.max(0, P.bulge);
  const cl = V3((back[0] + front[0]) / 2, back[1], 0).applyQuaternion(S.q).add(S.pos);
  const out = [makeOBB(cl, S.q, [(front[0] - back[0]) / 2 + 0.02, HB * P.sy, HC * sxz * bul])];
  for (let i = 0; i < 4; i++) {        // one box per leg (tagged with the key that foot stands on)
    const L = S.legLen[i], c = S.attach[i].clone().add(V3(0, -L / 2, 0)).applyQuaternion(S.q).add(S.pos);
    const o = makeOBB(c, S.q, [0.155, L / 2, 0.155]); o.standsOn = S.planted.includes(i) ? S.keys[i] : null; out.push(o);
  }
  return out;
}
/* explosion flight of the hero, solved toward the hook camera */
const H0 = solveFromPose(heroP2(17.85), 17.85);
const S0 = solveFromPose(heroStory(2.17), 2.17);
const HOOK = (() => {
  const c = CAMS.hook, f = c.t.clone().sub(c.p).normalize(), rt = f.clone().cross(UP).normalize(), up = rt.clone().cross(f).normalize();
  const tanV = Math.tan(c.fov * Math.PI / 360), tanH = tanV * 16 / 9;
  return { c, f, rt, up, tanH, tanV, at: (d, lat, vert) => c.p.clone().addScaledVector(f, d).addScaledVector(rt, lat * d * tanH).addScaledVector(up, vert * d * tanV) };
})();
const solveV = (p0, Pm) => { const v = Pm.clone().sub(p0); v.y -= 0.5 * GRAV * TAU_M * TAU_M; return v.multiplyScalar(1 / TAU_M); };
const HERO_PM = HOOK.at(8.3, 0.46, 0.16), HERO_V = solveV(H0.pos, HERO_PM);
const spinEase = x => x * x * x * (3 - 2 * x);         // late onset: caps separate before they tumble; still spinning at the freeze
function solveExpl(m) {
  if (m.settle !== undefined) {
    const k = sm5(m.settle), P = pose0();
    for (const key of ['sy', 'st', 'bulge', 'shearX', 'shearZ', 'nubL', 'nubR', 'splay', 'reach', 'ls', 'tuck']) P[key] = lerp(H0.P[key], S0.P[key], k);
    P.face = k < 0.5 ? { name: 'hook', look: [0, 0], sweat: 1 - k } : S0.P.face;
    const pos = H0.pos.clone().lerp(S0.pos, k), q = H0.q.clone().slerp(S0.q, k);
    return { P, pos, q, attach: H0.attach.map((a, i) => a.clone().lerp(S0.attach[i], k)), legLen: H0.legLen.map((l, i) => lerp(l, S0.legLen[i], k)), keys: S0.keys, planted: [0, 1, 2, 3] };
  }
  const tau = m.tau, g = sstep(0, 0.12, tau), x = tau / TAU_M;
  const P = { ...H0.P, face: { name: 'hook', look: [0, 0], sweat: 1 } };
  P.sy = lerp(H0.P.sy, 1.08, g); P.bulge = lerp(H0.P.bulge, -0.04, g); P.nubL = P.nubR = lerp(H0.P.nubL, 1.55, g); P.splay = 0.55 * g; P.tuck = 0; P.planted = [0, 0, 0, 0];
  const hx = x * (0.3 + 0.7 * x);                                    // same closed form as the caps: lift first, then fly at the lens
  const pos = V3(H0.pos.x + (HERO_PM.x - H0.pos.x) * hx, H0.pos.y + HERO_V.y * tau + 0.5 * GRAV * tau * tau, H0.pos.z + (HERO_PM.z - H0.pos.z) * hx);
  const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.22 * spinEase(x), -0.38 * spinEase(x), 0.42 * spinEase(x), 'YXZ'));
  const q = spin.multiply(H0.q);
  const onEnter = tau < 0.035;   // still standing on Enter in the first instants of the blast
  return { P, pos, q, attach: H0.attach, legLen: H0.legLen.map(l => lerp(l, LEG_REST * 1.05, g)), keys: onEnter ? H0.keys : [null, null, null, null], planted: onEnter ? H0.planted : [] };
}
const heroCache = new Map();
function solveHero(t) {
  const key = Math.round(wrapT(t) * 1e6); if (heroCache.has(key)) return heroCache.get(key);
  const m = timeMap(t);
  const S = m.mode === 'story' ? solveFromPose(heroStory(m.s), t) : m.mode === 'p2' ? solveFromPose(heroP2(m.s), t) : solveExpl(m);
  if (heroCache.size > 5000) heroCache.clear(); heroCache.set(key, S); return S;
}

/* ---------- 3. cap poses ---------- */
const restCenter = (k, d) => V3(k.x, CAP_BOTTOM + k.h / 2 - d, k.z);
const capOBB = (k, c, q, m = 0) => makeOBB(c, q, [k.hwB + m, k.h / 2 + m, k.hdB + m]);

/* popcorn: waves out from Enter, every pop validated against the hero, neighbours, plate and case */
const POP = {};
{
  const R = rng(1234), g = 30, list = [];
  const order = KEYS.filter(k => k.id !== 'Enter').map(k => ({ k, d: Math.hypot(k.x - K.Enter.x, k.z), r: R() })).sort((a, b) => a.d - b.d);
  const popPose = (sp, s) => {
    const tt = s - sp.tp, u = tt / sp.dur, k = sp.k;
    const c = restCenter(k, 0); c.y += sp.v * tt - 0.5 * g * tt * tt;
    const q = sp.turns ? new THREE.Quaternion().setFromAxisAngle(sp.ax, TAU * sp.turns * sstep(0.22, 0.8, u)) : new THREE.Quaternion().setFromAxisAngle(UP, 0.25 * Math.sin(Math.PI * u) * sp.yw);
    return { c, q };
  };
  const ok = sp => {
    for (let n = 0; n <= 48; n++) {
      const s = sp.tp + sp.dur * n / 48; const { c, q } = popPose(sp, s); const A = capOBB(sp.k, c, q, 0.015);
      for (const B of heroOBBs(solveHero(s))) if (obbOverlap(A, B, 0.05)) return false;
      for (const B of STATIC_OBB) if (obbOverlap(A, B)) return false;
      for (const o of KEYS) {
        if (o === sp.k || Math.abs(o.x - sp.k.x) > (o.w + sp.k.w) / 2 + 2.5 || Math.abs(o.z - sp.k.z) > 2.5) continue;
        const other = list.find(x => x.k === o && s >= x.tp && s <= x.tp + x.dur);
        const P = other ? popPose(other, s) : { c: restCenter(o, 0), q: QI };
        if (obbOverlap(A, capOBB(o, P.c, P.q), 0.01)) return false;
      }
    }
    return true;
  };
  for (const { k, d } of order) {
    const wide = k.w > 2, n = R() < 0.55 ? 2 : 1; let tNext = 6.64 + 0.95 * clamp(d / 14) + 0.16 * R();
    for (let i = 0; i < n; i++) {
      const v = wide ? 6.0 + R() * 1.2 : 8.6 + R() * 3.2, dur = 2 * v / g;
      const base = { k, v, dur, ax: V3(R() - .5, (R() - .5) * 0.4, R() - .5).normalize(), turns: wide ? 0 : (R() < 0.6 ? 1 : 2) * (R() < 0.5 ? 1 : -1), yw: R() < 0.5 ? 1 : -1 };
      let placed = null;
      for (let tries = 0; tries < 8 && !placed; tries++) {
        const sp = { ...base, tp: tNext + tries * 0.055 };
        if (sp.tp + sp.dur > 8.62) break;
        if (ok(sp)) placed = sp;
      }
      if (placed) { list.push(placed); tNext = placed.tp + placed.dur + 0.12 + 0.2 * R(); } else break;
    }
  }
  for (const sp of list) (POP[sp.k.id] ??= []).push(sp);
  POP.__pose = popPose; POP.__list = list;
}

/* explosion arcs: solved backwards so each legend faces the lens at TAU_M; validated with OBB sweeps */
const EXPL = {};
{
  const R = rng(777), samples = 44, accepted = [];
  const heroPath = []; for (let j = 1; j <= samples; j++) { const tau = TAU_M * j / samples; heroPath.push(heroOBBs(solveExpl({ tau }))); }
  // closed form: vertical is a true ballistic arc; horizontal eases in (x*(0.3+0.7x)) so caps lift clear of the case first
  const capAt = (E, tau) => {
    const x = tau / TAU_M, hx = x * (0.3 + 0.7 * x);
    const c = V3(E.p0.x + (E.Pm.x - E.p0.x) * hx, E.p0.y + E.v.y * tau + 0.5 * GRAV * tau * tau, E.p0.z + (E.Pm.z - E.p0.z) * hx);
    const q = new THREE.Quaternion().setFromAxisAngle(E.axis, E.ang * spinEase(tau / TAU_M));
    return { c, q };
  };
  const order = [...KEYS].sort((a, b) => Math.hypot(a.x - K.Enter.x, a.z) - Math.hypot(b.x - K.Enter.x, b.z));
  for (const k of order) {
    const p0 = restCenter(k, depthDom('p2', k.id, 17.85));
    let best = null, bestBad = 1e9;
    for (let tries = 0; tries < 240; tries++) {
      // fan out: keep the board's left/right and row order on screen, front rows nearer the lens -> paths do not cross
      const jit = Math.min(2, 1 + tries / 40);
      // expand in world space (x1.35 sideways, rows stacked up), so neighbours never converge; near rows whip past the frame edges
      let d = 5.2 + (2 - k.z) * 1.7 + (k.index % 2) * 0.55 + (R() - 0.5) * 0.5 * jit;
      let lat = ((k.x - 4.2) * 1.38 + (R() - 0.5) * 0.25 * jit) / (d * HOOK.tanH);
      let vert = ((2 - k.row) * 0.95 + 0.25 + (R() - 0.5) * 0.3 * jit) / (d * HOOK.tanV);
      if (k.id === 'Space') vert = (3.6 + R() * 0.4) / (d * HOOK.tanV);                    // the bar sails up over the lens
      if (k.id === 'Enter') vert = (-0.6 + R() * 0.3) / (d * HOOK.tanV);                    // the detonator stays low, under him
      if (k.id === "'") vert = (-0.3 + R() * 0.3) / (d * HOOK.tanV);                        // passes under his feet
      if (k.id === 'RShift') { lat = ((k.x - 4.2) * 1.38 + 3.2 + R() * 0.8) / (d * HOOK.tanH); vert = (-0.4 + R() * 0.3) / (d * HOOK.tanV); }   // ducks out to the right
      const Pm = HOOK.at(d, lat, vert); const minUp = k.id === 'RShift' ? 0.5 : 1.4; if (Pm.y < p0.y + minUp) Pm.y = p0.y + minUp;
      const toCam = HOOK.c.p.clone().sub(Pm).normalize();
      let axis = UP.clone().cross(toCam); if (axis.lengthSq() < 1e-6) axis = V3(1, 0, 0); axis.normalize();
      const ang = Math.acos(clamp(UP.dot(toCam), -1, 1)) + (R() < 0.5 ? TAU : 0);
      const E = { k, p0, Pm, v: solveV(p0, Pm), axis, ang, d };
      let bad = 0;
      for (let j = 1; j <= samples && bad < bestBad; j++) {
        const tau = TAU_M * j / samples, { c, q } = capAt(E, tau), A = capOBB(k, c, q, 0.02);
        if (!(k.id === 'Enter' && j <= samples * 0.2)) for (const B of heroPath[j - 1]) if (obbOverlap(A, B, 0.04)) bad++;   // he stands on Enter at the blast
        for (const B of STATIC_OBB) if (obbOverlap(A, B)) bad++;
        for (const o of accepted) { const P = capAt(o, tau); if (obbOverlap(A, capOBB(o.k, P.c, P.q, 0.02))) bad++; }
        if (c.distanceTo(HOOK.c.p) < 2.2) bad++;
      }
      if (bad < bestBad) { bestBad = bad; best = E; }
      if (bad === 0) break;
    }
    best.bad = bestBad; accepted.push(best); EXPL[k.id] = best;
  }
  EXPL.__capAt = capAt;
}

function capPose(k, t) {
  const m = timeMap(t);
  if (m.mode === 'expl' && m.tau > 0) return EXPL.__capAt(EXPL[k.id], m.tau);
  if (m.mode === 'story' && POP[k.id]) {
    for (const sp of POP[k.id]) {
      if (m.s >= sp.tp && m.s <= sp.tp + sp.dur) return POP.__pose(sp, m.s);
      const dl = m.s - sp.tp - sp.dur;
      if (dl > 0 && dl < 0.22) { const c = restCenter(k, 0); c.y += 0.07 * Math.abs(kick(dl, 7, 0.35)); return { c, q: QI }; }
    }
  }
  return { c: restCenter(k, depth(k.id, t)), q: QI };
}

/* ---------- 4. the timeline the sound is built from ---------- */
const EV = []; const ev = (t, kind, o = {}) => EV.push({ t: +t.toFixed(4), kind, ...o });
for (const dom of ['story', 'p2']) for (const id in IV[dom]) for (const iv of IV[dom][id]) {
  const k = K[id], lo = dom === 'story' ? 2.17 : 13.0, hi = dom === 'story' ? 11.7 : 17.86;
  const tb = iv.t0 + RISE;
  if (iv.t0 > 0 && tb >= lo && tb < hi) ev(tb, 'key', { id, row: k.row, x: k.x, vel: +iv.impact.toFixed(2), stomp: iv.impact >= 0.95 ? 1 : 0, ctrlz: id === 'Z' ? 1 : 0, space: id === 'Space' ? 1 : 0 });
  if (iv.t1 < 1e8 && iv.t1 >= lo && iv.t1 < hi) ev(iv.t1, 'up', { id, row: k.row, x: k.x });
}
for (const sp of POP.__list) { const k = sp.k; ev(sp.tp, 'pop', { id: k.id, row: k.row, x: k.x }); ev(sp.tp + sp.dur, 'land', { id: k.id, row: k.row, x: k.x }); ev(sp.tp + sp.dur + 0.05, 'bounce', { id: k.id, row: k.row, x: k.x }); }
[...HOPS, BIG, ...DODGE].forEach(h => ev(h.t0, 'hop', { big: h === BIG ? 1 : 0 }));
ev(2.2, 'hum', { t1: 5.7 }); ev(4.62, 'giggle'); ev(5.7, 'run', { t1: 6.28 }); ev(6.30, 'yah'); ev(6.6, 'error'); ev(6.63, 'eep');
ev(6.7, 'alarm', { t1: 8.6 }); ev(6.6, 'rumble', { t1: 8.45 }); ev(DASH.t1, 'hup'); ev(STR.t0, 'creak', { t1: STR.tap }); ev(STR.full - 0.2, 'nnngh', { t1: STR.tap });
ev(13.12, 'sigh'); ev(15.02, 'heh'); ev(16.5, 'ah', { n: 1 }); ev(16.9, 'ah', { n: 2 }); ev(P2.achoo, 'choo'); ev(17.6, 'uhoh'); ev(17.85, 'boom');
ev(1.15, 'tapestop'); ev(2.06, 'play'); ev(13.0, 'play'); ev(13.77, 'tiptoe_music', { t1: 15.26 }); ev(16.22, 'pad', { t1: 17.3 });
const REWINDS = [
  { t0: 1.35, t1: 2.06, s0: 17.85 + 2.3 + 19, s1: 17.85 + 19 },
  { t0: 11.8, t1: 13.0, s0: 11.7 + 19, s1: S_RW_END + 19 },
];
window.TIMELINE = { duration: DUR, fps: FPS, events: EV.sort((a, b) => a.t - b.t), rewinds: REWINDS,
  hops: HOPS.map(h => ({ t0: h.t0, t1: h.t1 })), stats: { pops: POP.__list.length, explBad: KEYS.reduce((a, k) => a + EXPL[k.id].bad, 0) } };
window.__DBG = { EXPL, POP, IV, KEYS, K, H0, HOOK, heroOBBs, solveExpl, capOBB, obbOverlap, STATIC_OBB, TAU_M, solveHero, capPose, makeOBB };
