// Builds ctrlz.html (one file) from src/*.js, with the fonts inlined as base64 woff2.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url)), src = path.join(root, 'src');
const b64 = f => fs.readFileSync(path.join(src, 'fonts', f)).toString('base64');
const js = fs.readdirSync(src).filter(f => /^\d\d-.*\.js$/.test(f)).sort().map(f => fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Ctrl+Z - Never deploy on Friday</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@font-face{font-family:"CZ Inter";font-weight:700;src:url(data:font/woff2;base64,${b64('inter-bold.woff2')}) format("woff2")}
@font-face{font-family:"CZ Inter";font-weight:600;src:url(data:font/woff2;base64,${b64('inter-semibold.woff2')}) format("woff2")}
@font-face{font-family:"CZ Mono";font-weight:700;src:url(data:font/woff2;base64,${b64('jbmono-bold.woff2')}) format("woff2")}
html,body{margin:0;height:100%;background:#0b0a0c;overflow:hidden}
canvas{display:block;width:100vw;height:100vh;object-fit:contain}
#hud{position:fixed;left:12px;bottom:10px;font:12px/1.4 ui-monospace,Menlo,monospace;color:#cfc8c2;opacity:.75;pointer-events:none;white-space:pre}
</style>
<script type="importmap">
{ "imports": { "three": "./node_modules/three/build/three.module.js", "three/addons/": "./node_modules/three/examples/jsm/" } }
</script>
</head>
<body>
<div id="hud"></div>
<!-- Fonts: Inter Display and JetBrains Mono, SIL Open Font License 1.1 (subset). -->
<script type="module">
${js}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'ctrlz.html'), html);
console.log('wrote ctrlz.html', (html.length / 1024).toFixed(0) + ' KB');
