/* =====================================================================
   Ctrl+Z - Never deploy on Friday.   19 s / 16:9 / 60 fps / seamless loop
   One HTML file, three.js 0.160.0. Every frame is a pure function of t:
       window.renderAt(t, samples)      seeded random only
   URL: ?render=1 (no playback) &w= &h= &t= (still) &samples=
   ===================================================================== */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

await Promise.all(['700 64px "CZ Inter"', '600 64px "CZ Inter"', '700 64px "CZ Mono"'].map(f => document.fonts.load(f)));
const FONT = '"CZ Inter", Inter, Helvetica, Arial, sans-serif', MONO = '"CZ Mono", "JetBrains Mono", Menlo, monospace';

const Q = new URLSearchParams(location.search);
const RENDER = Q.has('render');
const W = +(Q.get('w') || (RENDER ? 1920 : 1280));
const H = +(Q.get('h') || (RENDER ? 1080 : 720));
const DUR = 19, FPS = 60, NF = DUR * FPS;

/* ---------- math helpers ---------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const sm5 = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const wrapT = t => ((t % DUR) + DUR) % DUR;
const arc = u => 4 * u * (1 - u);
/** damped spring response to a unit kick at d=0: starts at 1, oscillates, decays */
const spring = (d, f = 5, z = 0.3) => d < 0 ? 0 : Math.exp(-z * TAU * f * d) * Math.cos(TAU * f * Math.sqrt(1 - z * z) * d);
/** same, but starts at 0 (velocity kick) */
const kick = (d, f = 5, z = 0.3) => d < 0 ? 0 : Math.exp(-z * TAU * f * d) * Math.sin(TAU * f * Math.sqrt(1 - z * z) * d);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const halton = (i, b) => { let f = 1, r = 0; i++; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);

/* ---------- palette (BRAND) ---------- */
const PAL = { clawd: 0xD97757, cream: 0xEDE4D3, ink: 0x302E31, lamp: 0xFFE8D2, monitor: 0x9CC3E6, error: 0xE5484D };
const HEX = n => '#' + n.toString(16).padStart(6, '0');
