// Frame-exact renderer for ctrlz.html: headless Chromium -> PNG frames -> FFV1 chunks (resumable) -> H.264 MP4 (+ WAV)
//
//   node render.mjs --still 10.9 [--samples 16] [--ss 1]   one PNG  -> out/still_10.90.png
//   node render.mjs --timeline                             out/timeline.json (the sound is built from it)
//   node render.mjs --checks [--sub 4]                     out/checks.json   (contacts, feet, text, loop seam)
//   node render.mjs [--ss 2] [--samples 16] [--from 0 --to 19] [--chunk 60] [--out out]
//   node render.mjs --mux                                  out/ctrlz.mp4 from finished chunks (+ audio/ctrlz.wav)
// Flags: --swiftshader (software GL, no GPU)   --w/--h (output size, default 1920x1080)
// Env:   CHROME_PATH=/path/to/chrome  (optional)
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
import { serve } from './serve.mjs';

const A = process.argv.slice(2);
const has = f => A.includes(f), arg = (f, d) => (A.includes(f) ? A[A.indexOf(f) + 1] : d);
const FPS = 60, DUR = 19, TOTAL = DUR * FPS;
const SS = +arg('--ss', 1), SAMPLES = +arg('--samples', 16), CHUNK = +arg('--chunk', 60);
const OW = +arg('--w', 1920), OH = +arg('--h', 1080), RW = Math.round(OW * SS), RH = Math.round(OH * SS);
const OUT = arg('--out', 'out'); fs.mkdirSync(OUT, { recursive: true });
const CHUNKS = path.join(OUT, 'chunks');

function mux() {
  const files = fs.existsSync(CHUNKS) ? fs.readdirSync(CHUNKS).filter(f => f.endsWith('.mkv')).sort() : [];
  const need = Math.ceil(TOTAL / CHUNK);
  if (files.length < need) { console.log(`only ${files.length}/${need} chunks present - render the rest first`); return false; }
  fs.writeFileSync(path.join(OUT, 'list.txt'), files.map(f => `file 'chunks/${f}'`).join('\n') + '\n');
  const wav = arg('--wav', 'audio/ctrlz.wav'), aud = fs.existsSync(wav) ? ['-i', wav, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '320k'] : [];
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'list.txt'), ...aud,
    '-c:v', 'libx264', '-profile:v', 'high', '-crf', arg('--crf', '14'), '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-t', String(DUR), '-movflags', '+faststart', path.join(OUT, 'ctrlz.mp4')], { stdio: 'inherit' });
  console.log(r.status === 0 ? `wrote ${path.join(OUT, 'ctrlz.mp4')}${aud.length ? ' (with ' + wav + ')' : ' (no audio found)'}` : 'ffmpeg failed');
  return r.status === 0;
}
if (has('--mux')) { mux(); process.exit(0); }

const srv = await serve(+arg('--port', 0)); const PORT = srv.address().port;   // free port: several renders can run side by side
const gl = has('--swiftshader') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
const browser = await chromium.launch({ args: gl, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('PAGE ERROR', e.message));
page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) console.error('console:', m.text()); });
const light = has('--timeline') || has('--checks');
await page.goto(`http://127.0.0.1:${PORT}/ctrlz.html?render=1&w=${light ? 320 : RW}&h=${light ? 180 : RH}${arg('--q', '')}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
const gpu = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c && c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
console.log('WebGL renderer:', gpu);
const grab = (t, n) => page.evaluate(([t, n]) => { window.renderAt(t, n); return document.querySelector('canvas').toDataURL('image/png').split(',')[1]; }, [t, n]);

if (has('--timeline')) {
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(await page.evaluate('window.TIMELINE'), null, 1)); console.log('wrote', path.join(OUT, 'timeline.json'));
} else if (has('--checks')) {
  const t0 = Date.now(); const rep = await page.evaluate(s => window.runChecks({ sub: s }), +arg('--sub', 4));
  fs.writeFileSync(path.join(OUT, 'checks.json'), JSON.stringify(rep, null, 1)); console.log(JSON.stringify(rep, null, 1)); console.log(`checks took ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} else if (has('--still')) {
  for (const s of String(arg('--still', '0')).split(',')) {
    const t = +s, f = path.join(OUT, `still_${t.toFixed(2)}.png`), t0 = Date.now();
    const png = Buffer.from(await grab(t, SAMPLES), 'base64');
    if (SS !== 1) { fs.writeFileSync(f + '.big.png', png); spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', f + '.big.png', '-vf', `scale=${OW}:${OH}:flags=lanczos`, f]); fs.unlinkSync(f + '.big.png'); }
    else fs.writeFileSync(f, png);
    console.log('wrote', f, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
} else {
  const from = Math.round(+arg('--from', 0) * FPS), to = Math.min(TOTAL, Math.round(+arg('--to', DUR) * FPS));
  fs.mkdirSync(CHUNKS, { recursive: true });
  const tStart = Date.now(); let done = 0;
  for (let c0 = from - (from % CHUNK); c0 < to; c0 += CHUNK) {
    const file = path.join(CHUNKS, `chunk_${String(c0 / CHUNK).padStart(4, '0')}.mkv`);
    if (fs.existsSync(file)) { console.log('skip', file); continue; }
    const tmp = file.replace('.mkv', '.part.mkv');
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-vf', `scale=${OW}:${OH}:flags=lanczos`, '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'yuv444p', tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let f = c0; f < Math.min(c0 + CHUNK, TOTAL); f++) {
      const png = Buffer.from(await grab(f / FPS, SAMPLES), 'base64');
      if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
      done++; const per = (Date.now() - tStart) / 1000 / done;
      process.stdout.write(`\rframe ${f + 1}/${TOTAL}  ${per.toFixed(2)} s/frame  ~${((to - f - 1) * per / 60).toFixed(1)} min left   `);
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r)); fs.renameSync(tmp, file);
  }
  console.log('\nchunks done');
}
await browser.close(); srv.close();
if (!light && !has('--still') && !has('--from') && !has('--to')) mux();
