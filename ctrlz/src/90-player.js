/* =====================================================================
   PREVIEW PLAYER  ([space] pause, [<][>] step a frame, [R] restart)
   ===================================================================== */
window.__ready = true;
const hud = document.getElementById('hud');
if (Q.has('t')) window.renderAt(+Q.get('t'), +(Q.get('samples') || 1));
else if (!RENDER) {
  let t0 = performance.now(), paused = false, tp = 0;
  addEventListener('keydown', e => {
    if (e.code === 'Space') { paused = !paused; if (!paused) t0 = performance.now() - tp * 1000; }
    if (e.code === 'ArrowRight') { tp = wrapT(tp + 1 / FPS); paused = true; }
    if (e.code === 'ArrowLeft') { tp = wrapT(tp - 1 / FPS); paused = true; }
    if (e.code === 'KeyR') { t0 = performance.now(); paused = false; }
  });
  (function loop() {
    const t = paused ? tp : wrapT((performance.now() - t0) / 1000); tp = t;
    window.renderAt(t, 1); hud.textContent = `t ${t.toFixed(2)} s  f ${Math.round(t * FPS)}   [space] pause  [<][>] frame  [R] restart`;
    requestAnimationFrame(loop);
  })();
}
