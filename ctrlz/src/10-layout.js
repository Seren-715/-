/* =====================================================================
   KEYBOARD: 60%, 61 keys, 1u = 1 world unit (19.05 mm). Sculpted rows.
   ===================================================================== */
const ROWS = [
  ['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', ['Bksp', 2]],
  [['Tab', 1.5], 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', ['\\', 1.5]],
  [['Caps', 1.75], 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", ['Enter', 2.25]],
  [['LShift', 2.25], 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', ['RShift', 2.75]],
  [['LCtrl', 1.25], ['LWin', 1.25], ['LAlt', 1.25], ['Space', 6.25], ['RAlt', 1.25], ['RWin', 1.25], ['Menu', 1.25], ['RCtrl', 1.25]],
];
const DUAL = { '1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '^', '7': '&', '8': '*', '9': '(', '0': ')', '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|', ';': ':', "'": '"', ',': '<', '.': '>', '/': '?' };
const MODL = { Esc: 'Esc', Bksp: 'Backspace', Tab: 'Tab', Caps: 'Caps Lock', Enter: 'Enter', LShift: 'Shift', RShift: 'Shift', LCtrl: 'Ctrl', RCtrl: 'Ctrl', LWin: 'Win', RWin: 'Win', LAlt: 'Alt', RAlt: 'Alt', Menu: 'Menu', Space: '' };
const ACCENT = new Set(['Esc', 'Enter', 'LCtrl', 'Z']);
/* row profile (OEM-like): cap height and top tilt (deg, + = front edge lower, faces the typist) */
const PROFILE = [{ h: 0.62, tilt: 8 }, { h: 0.55, tilt: 4 }, { h: 0.50, tilt: 0 }, { h: 0.52, tilt: -4 }, { h: 0.52, tilt: -7 }];
const PLATE_Y = 0.30, CAP_BOTTOM = 0.54, MAX_TRAVEL = 0.21;
const GAP = 0.07, SKIRT_D = 0.93, INSET_W = 0.135, INSET_D = 0.15, TOP_ZOFF = -0.025;

const KEYS = [], K = {};
ROWS.forEach((row, r) => {
  let x = -7.5;
  row.forEach(def => {
    const [id, w] = Array.isArray(def) ? def : [def, 1];
    const pr = PROFILE[r];
    const k = { id, w, row: r, x: x + w / 2, z: (r - 2) * 1.0, index: KEYS.length,
      alpha: !(id in MODL), accent: ACCENT.has(id), h: pr.h, tilt: pr.tilt * Math.PI / 180,
      hwB: (w - GAP) / 2, hdB: SKIRT_D / 2 };
    k.hwT = k.hwB - INSET_W; k.hdT = k.hdB - INSET_D; k.dish = id === 'Space' ? -0.012 : 0.026;
    KEYS.push(k); K[id] = k; x += w;
  });
});
/** local top height of a cap (relative to its bottom), at local x/z (unpressed) */
const capTopLocal = (k, lx, lz) => k.h - k.dish * Math.max(0, 1 - (lx / k.hwT) ** 2) - Math.tan(k.tilt) * (lz - TOP_ZOFF);
/** key whose skirt footprint contains world x,z (or null = gap / off board) */
function keyAt(x, z) {
  for (const k of KEYS) if (Math.abs(x - k.x) <= k.hwB && Math.abs(z - k.z) <= k.hdB) return k;
  return null;
}
/** is world x,z on the usable top surface of key k (inset margin m) */
const onTop = (k, x, z, m = 0.04) => Math.abs(x - k.x) <= k.hwT - m && Math.abs(z - k.z - TOP_ZOFF) <= k.hdT - m;
/** rest top world height at x,z (if on a key) */
const restTopAt = (x, z) => { const k = keyAt(x, z); return k ? CAP_BOTTOM + capTopLocal(k, x - k.x, z - k.z) : CAP_BOTTOM + 0.5; };
