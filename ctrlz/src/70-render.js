/* =====================================================================
   RENDER: N samples per frame, each with its own shutter time, sub-pixel
   offset, lens point (depth of field) and lamp point (soft shadows),
   accumulated in float. Bloom on the underglow only. VHS as a post pass.
   ===================================================================== */
const FT = renderer.extensions.has('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType;
const rtOpt = (type, samples = 0) => ({ type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples, colorSpace: THREE.NoColorSpace });
const rtScene = new THREE.WebGLRenderTarget(W, H, rtOpt(THREE.HalfFloatType, RENDER ? 0 : 4));
const rtAcc = new THREE.WebGLRenderTarget(W, H, rtOpt(FT));
const GW = Math.max(2, W >> 1), GH = Math.max(2, H >> 1);
const rtGlow = new THREE.WebGLRenderTarget(GW, GH, rtOpt(THREE.HalfFloatType));
const LEVELS = [2, 4, 8, 16, 32].map(d => [new THREE.WebGLRenderTarget(Math.max(2, W / d | 0), Math.max(2, H / d | 0), rtOpt(THREE.HalfFloatType)), new THREE.WebGLRenderTarget(Math.max(2, W / d | 0), Math.max(2, H / d | 0), rtOpt(THREE.HalfFloatType))]);

const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadGeo = new THREE.PlaneGeometry(2, 2);
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const fsq = (mat) => { const s = new THREE.Scene(); s.add(new THREE.Mesh(quadGeo, mat)); return s; };
const accMat = new THREE.ShaderMaterial({ uniforms: { tMap: { value: null }, uW: { value: 1 } }, vertexShader: VS, blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false,
  fragmentShader: 'uniform sampler2D tMap; uniform float uW; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tMap, vUv).rgb * uW, 1.); }' });
const accScene = fsq(accMat);
const blurMat = new THREE.ShaderMaterial({ uniforms: { tMap: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: VS, depthTest: false, depthWrite: false,
  fragmentShader: `uniform sampler2D tMap; uniform vec2 uDir; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tMap, vUv).rgb * 0.2270270;
      c += (texture2D(tMap, vUv + uDir * 1.3846154).rgb + texture2D(tMap, vUv - uDir * 1.3846154).rgb) * 0.3162162;
      c += (texture2D(tMap, vUv + uDir * 3.2307692).rgb + texture2D(tMap, vUv - uDir * 3.2307692).rgb) * 0.0702703;
      gl_FragColor = vec4(c, 1.); }` });
const blurScene = fsq(blurMat);
const postMat = new THREE.ShaderMaterial({
  uniforms: { tAcc: { value: rtAcc.texture }, tG0: { value: null }, tG1: { value: null }, tG2: { value: null }, tG3: { value: null }, tG4: { value: null }, tOsd: { value: osdT.t },
    uVhs: { value: 0 }, uOsd: { value: 0 }, uT: { value: 0 }, uFrame: { value: 0 }, uRes: { value: new THREE.Vector2(W, H) }, uExp: { value: +(Q.get('exp') || 1.0) }, uBloom: { value: +(Q.get('bloom') ?? 0.9) } },
  vertexShader: VS, depthTest: false, depthWrite: false,
  fragmentShader: `precision highp float; varying vec2 vUv;
    uniform sampler2D tAcc, tG0, tG1, tG2, tG3, tG4, tOsd; uniform float uVhs, uOsd, uT, uFrame, uExp, uBloom; uniform vec2 uRes;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c){ const mat3 I = mat3(0.59719,0.07600,0.02840, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777);
      const mat3 O = mat3(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602);
      c = I * (c * uExp); c = RRTAndODTFit(c); return clamp(O * c, 0., 1.); }
    vec3 enc(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - 0.055, step(0.0031308, c)); }
    vec3 hdr(vec2 uv){ return texture2D(tAcc, uv).rgb + uBloom * (0.30 * texture2D(tG0, uv).rgb + 0.26 * texture2D(tG1, uv).rgb + 0.2 * texture2D(tG2, uv).rgb + 0.14 * texture2D(tG3, uv).rgb + 0.1 * texture2D(tG4, uv).rgb); }
    vec3 lens(vec2 uv, float ca){ vec2 d = uv - 0.5; return vec3(hdr(uv + d * ca).r, hdr(uv).g, hdr(uv - d * ca).b); }
    void main(){
      vec2 uv = vUv; float v = uVhs;
      float line = floor(uv.y * 240.);
      float band = fract(uT * 0.55 + 0.12), inb = smoothstep(0.07, 0.0, abs(uv.y - band));
      float head = smoothstep(0.035, 0.0, uv.y) * v;
      uv.x += v * ((hash(vec2(line, uFrame)) - .5) * 0.0045 + inb * 0.028 * sin(uv.y * 260. + uT * 40.) + 0.0022 * sin(uv.y * 16. + uT * 7.)) + head * 0.05 * hash(vec2(uFrame, line));
      vec3 c = aces(lens(uv, 0.0012 + v * 0.004));
      if (v > 0.0) {
        float off = (0.004 + inb * 0.012) * v;
        vec3 sm = (aces(hdr(uv + vec2(off * 2., 0.))) + aces(hdr(uv - vec2(off, 0.)))) * 0.5;
        float Y = dot(c, vec3(0.299, 0.587, 0.114)); vec3 chroma = sm - dot(sm, vec3(0.299, 0.587, 0.114));
        c = mix(c, Y + chroma * 1.12, v);
        c = mix(c, c * vec3(0.95, 1.0, 1.07) + vec3(0.015, 0.0, 0.03), v);
        c *= 1.0 - v * 0.14 * (0.5 + 0.5 * sin(vUv.y * uRes.y * 1.5708));
        c += inb * v * 0.35 * hash(vUv * uRes + uFrame);
        c += v * 0.04 * vec3(hash(vec2(line, uFrame * 1.7)));
      }
      vec2 q = vUv - .5; c *= 1.0 - dot(q, q) * 0.62;
      vec4 o = texture2D(tOsd, vec2(vUv.x + v * 0.002 * sin(uT * 30.), 1. - vUv.y)); c = mix(c, o.rgb, o.a * uOsd);
      c = enc(c);
      float L = dot(c, vec3(0.333)); c += (hash(vUv * uRes + fract(uFrame * 0.618) * 97.) - 0.5) * (0.022 + 0.02 * (1. - L)) * (1. + v);
      gl_FragColor = vec4(c, 1.);
    }` });
const postScene = fsq(postMat);
const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
GLOWING.forEach(m => m.layers.enable(1));
const SHUTTER = 0.45 / FPS, APERTURE = 0.06;

function renderGlow(t) {
  // underglow only: everything else black (keeps occlusion), glowing meshes drawn on top
  const bg = scene.background; scene.background = null;   // a Color background force-clears depth on every render(): would un-occlude the LEDs NO_GLOW_PASS.forEach(o => { o.userData.v = o.visible; o.visible = false; });
  renderer.setRenderTarget(rtGlow); renderer.setClearColor(0, 1); renderer.clear();
  scene.overrideMaterial = blackMat; renderer.render(scene, camera); scene.overrideMaterial = null;
  renderer.autoClear = false; camera.layers.set(1); renderer.render(scene, camera); camera.layers.set(0); renderer.autoClear = true;
  NO_GLOW_PASS.forEach(o => o.visible = o.userData.v); scene.background = bg;
  let src = rtGlow.texture;
  LEVELS.forEach(([a, b], i) => {
    blurMat.uniforms.tMap.value = src; blurMat.uniforms.uDir.value.set(1 / a.width, 0); renderer.setRenderTarget(a); renderer.render(blurScene, quadCam);
    blurMat.uniforms.tMap.value = a.texture; blurMat.uniforms.uDir.value.set(0, 1 / a.height); renderer.setRenderTarget(b); renderer.render(blurScene, quadCam);
    src = b.texture; postMat.uniforms['tG' + i].value = b.texture;
  });
}
function placeCamera(cam, i, samples) {
  camera.fov = cam.fov; camera.aspect = W / H; camera.updateProjectionMatrix();
  const fwd = cam.tg.clone().sub(cam.p).normalize(), rt = fwd.clone().cross(UP).normalize(), up = rt.clone().cross(fwd);
  const a = halton(i, 5) * TAU, r = samples > 1 ? Math.sqrt(halton(i, 7)) * APERTURE : 0;
  camera.position.copy(cam.p).addScaledVector(rt, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r);
  camera.lookAt(cam.p.clone().addScaledVector(fwd, cam.focus));
  if (samples > 1) camera.setViewOffset(W, H, halton(i, 3) - 0.5, halton(i, 11) - 0.5, W, H); else camera.clearViewOffset();
}
window.renderAt = function (t, samples = 1) {
  t = wrapT(t);
  const osd = updateTextures(t), frame = Math.round(t * FPS);
  // glow (once per frame, centre of the shutter)
  applyScene(t); placeCamera(camAt(t), 0, 1); spot.position.copy(LAMP.bulb); renderGlow(t);
  renderer.setRenderTarget(rtAcc); renderer.setClearColor(0, 1); renderer.clear(); renderer.autoClear = false;
  for (let i = 0; i < samples; i++) {
    const ts = samples > 1 ? t + (halton(i, 2) - 0.5) * SHUTTER : t;
    applyScene(ts); placeCamera(camAt(ts), i, samples);
    const la = halton(i, 13) * TAU, lr = samples > 1 ? Math.sqrt(halton(i, 17)) * LAMP.r : 0;
    spot.position.copy(LAMP.bulb).add(V3(Math.cos(la) * lr, Math.sin(la) * lr * 0.6, Math.sin(la) * lr * 0.8)); spot.target.updateMatrixWorld();
    renderer.setRenderTarget(rtScene); renderer.autoClear = true; renderer.render(scene, camera); renderer.autoClear = false;
    renderer.setRenderTarget(rtAcc); accMat.uniforms.tMap.value = rtScene.texture; accMat.uniforms.uW.value = 1 / samples; renderer.render(accScene, quadCam);
  }
  renderer.autoClear = true; renderer.setRenderTarget(null);
  const pu = postMat.uniforms; pu.uVhs.value = vhsAmount(t); pu.uOsd.value = osd; pu.uT.value = t; pu.uFrame.value = frame;
  renderer.render(postScene, quadCam);
  return frame;
};
