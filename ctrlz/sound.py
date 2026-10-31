#!/usr/bin/env python3
"""Ctrl+Z sound (v2): everything synthesized in numpy (no samples, no recorded voices, no words).
48 kHz stereo WAV, 19.0 s, ~-14 LUFS, true peak < -2 dBTP, driven by out/timeline.json
(the SAME event list the picture uses: `node render.mjs --timeline`).
Every key hit peaks 1 frame (1/60 s) after its cap bottoms out.  Three passes are rendered and
the middle one is kept, so the tail flows into the head (seamless loop)."""
import json, os, re, subprocess, sys, wave
import numpy as np

SR, DUR, FPS = 48000, 19.0, 60
os.makedirs('audio', exist_ok=True)
N = int(SR * DUR)
TL = json.load(open('out/timeline.json'))
EVENTS, REWINDS = TL['events'], TL['rewinds']
rng = np.random.default_rng(20261031)          # seeded: same file every run

# ---------------------------------------------------------------- helpers
def tt(n): return np.arange(n) / SR
def noise(n): return rng.standard_normal(n)
def sstep(a, b, x): x = np.clip((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x)

def fshape(x, lo=None, hi=None):
    n = len(x); X = np.fft.rfft(x); f = np.fft.rfftfreq(n, 1 / SR); g = np.ones_like(f)
    if lo: g = g / (1 + np.exp(np.clip(-(f - lo) / (lo * 0.12 + 1), -50, 50)))
    if hi: g = g / (1 + np.exp(np.clip((f - hi) / (hi * 0.12 + 1), -50, 50)))
    return np.fft.irfft(X * g, n)

def place(buf, sig, t, pan=0.0, gain=1.0, fade=0.003):
    sig = np.asarray(sig, float) * gain; n = len(sig)
    f = max(2, int(fade * SR));
    if n > 2 * f: sig = sig.copy(); sig[:f] *= np.linspace(0, 1, f); sig[-f:] *= np.linspace(1, 0, f)
    i0 = int(round(t * SR)); a, b = max(0, i0), min(len(buf), i0 + n)
    if b <= a: return
    s = sig[a - i0:b - i0]; ang = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    buf[a:b, 0] += s * np.cos(ang); buf[a:b, 1] += s * np.sin(ang)

def phase_osc(f0, kind='sine'):
    ph = np.cumsum(f0) / SR
    if kind == 'sine': return np.sin(2 * np.pi * ph)
    if kind == 'saw': return 2 * (ph % 1) - 1
    if kind == 'tri': return 2 * np.abs(2 * (ph % 1) - 1) - 1
    if kind == 'square': return np.sign(np.sin(2 * np.pi * ph))

def vowel(f0, forms, breath=0.02):
    """formant synth: saw source -> parallel band-passes. forms=[(freq, bw, amp)]"""
    src = phase_osc(f0, 'saw') + breath * noise(len(f0)); out = np.zeros(len(f0))
    for fr, bw, a in forms: out += a * fshape(src, max(40, fr - bw), fr + bw)
    return out

FORM = {'a': [(730, 110, 1), (1090, 120, .6), (2440, 200, .2)], 'e': [(530, 90, 1), (1840, 150, .5), (2480, 200, .2)],
        'o': [(570, 90, 1), (840, 100, .6), (2410, 200, .1)], 'u': [(300, 70, 1), (870, 100, .4), (2240, 200, .1)],
        'n': [(250, 60, 1), (1000, 120, .5), (2300, 180, .25)]}

# ---------------------------------------------------------------- key sounds
def thock(vel=0.8, pitch=1.0):
    n = int(0.16 * SR); t = tt(n); f = 190 * pitch
    body = np.sin(2 * np.pi * (f * (1 - 0.18 * t / 0.16)) * t) * np.exp(-t / 0.028)
    body += 0.35 * np.sin(2 * np.pi * 2.3 * f * t) * np.exp(-t / 0.012)
    cr = fshape(noise(n), 300, 2600) * np.exp(-t / 0.006) * 0.55
    return (body + cr) * (0.35 + 0.65 * vel)

def bump():
    n = int(0.03 * SR); t = tt(n); return fshape(noise(n), 200, 900) * np.exp(-t / 0.007) * 0.25
def clack(vel=0.6):
    n = int(0.05 * SR); t = tt(n); return (fshape(noise(n), 2200, 7500) * np.exp(-t / 0.005) * 0.5 + 0.25 * np.sin(2 * np.pi * 1500 * t) * np.exp(-t / 0.009)) * (0.4 + 0.6 * vel)
def tick(a=0.08):
    n = int(0.015 * SR); t = tt(n); return fshape(noise(n), 2500, 8000) * np.exp(-t / 0.002) * a
def rattle():
    out = np.zeros(int(0.09 * SR))
    for k in range(5): o = int(k * rng.uniform(0.008, 0.016) * SR); s = tick(0.3); out[o:o + len(s)] += s[:len(out) - o]
    return out
def pop_launch():
    n = int(0.08 * SR); t = tt(n); f = 380 + 900 * t / 0.08
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.02) * 0.5 + fshape(noise(n), 1500, 6000) * np.exp(-t / 0.004) * 0.3

# ---------------------------------------------------------------- hero voice
def blip(f1=520, f2=900, d=0.09, a=0.22):
    n = int(d * SR); t = tt(n); f = np.linspace(f1, f2, n)
    return phase_osc(f, 'tri') * np.sin(np.pi * t / d) * a
def hum(t0, t1, buf):
    n = int((t1 - t0) * SR); t = tt(n); vib = 1 + 0.012 * np.sin(2 * np.pi * 5.4 * t)
    f0 = 196 * vib * (1 + 0.02 * np.sin(2 * np.pi * 0.9 * t)); s = vowel(f0, FORM['n'], 0.005)
    grid = 0.5 + 0.5 * np.cos(2 * np.pi * t / 0.3 - 0.4)
    s *= (0.55 + 0.45 * grid) * sstep(0, 0.3, t) * (1 - sstep(t1 - t0 - 0.3, t1 - t0, t))
    place(buf, fshape(s, None, 1600), t0, 0.0, 0.07)
def vox(vow, f0a, f0b, d, a=0.18, breath=0.03, vib=0.0):
    n = int(d * SR); t = tt(n); f0 = np.linspace(f0a, f0b, n) * (1 + vib * np.sin(2 * np.pi * 6 * t))
    return vowel(f0, FORM[vow], breath) * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 0.7 * a
def creak(buf, t0, t1):
    n = int((t1 - t0) * SR); t = tt(n); d = t1 - t0
    f0 = 90 + 120 * sstep(0, d, t) + 25 * np.sin(2 * np.pi * 7 * t)
    am = (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * (18 + 14 * t / d) * t))) * 0.6 + 0.4
    s = fshape(phase_osc(f0, 'saw') * am + 0.05 * noise(n), 500, 1800) * sstep(0, 0.15, t) * (1 - sstep(d - 0.1, d, t))
    place(buf, s, t0, 0, 0.16)
def sigh(buf, t0):
    n = int(0.7 * SR); t = tt(n); s = fshape(noise(n), 900, 3500) * np.minimum(1, t / 0.12) * np.exp(-t / 0.28)
    tone = np.sin(2 * np.pi * np.cumsum(330 - 90 * t) / SR) * np.exp(-t / 0.3) * 0.25
    place(buf, s * 0.4 + tone, t0, 0, 0.18)
def heh(buf, t0):
    for k in range(2):
        n = int(0.12 * SR); t = tt(n); h = fshape(noise(n), 2500, 9000) * np.exp(-t / 0.02) * 0.3
        place(buf, h + vox('e', 240, 215, 0.12, 0.35), t0 + k * 0.17, 0, 0.14)
def choo(buf, t0):
    n = int(0.09 * SR); t = tt(n); ch = fshape(noise(n), 2000, 8500) * np.exp(-t / 0.03) * 0.7
    place(buf, ch, t0 - 0.06, 0, 0.3); place(buf, vox('u', 520, 190, 0.32, 0.6, 0.05), t0, 0, 0.32)

# ---------------------------------------------------------------- story sound
def beep(buf, t0, f=880, d=0.11, a=0.2):
    n = int(d * SR); t = tt(n); s = phase_osc(np.full(n, f), 'square') * 0.4 + np.sin(2 * np.pi * f * t); s = fshape(s, None, 4000)
    place(buf, s * np.minimum(1, t / 0.004) * np.exp(-t / 0.08), t0, 0, a)
def alarm(buf, t0, t1):
    n = int((t1 - t0) * SR); t = tt(n); f = np.where((t / 0.22) % 2 < 1, 760, 560).astype(float)
    s = fshape(phase_osc(f, 'tri'), None, 1800) * sstep(0, 0.4, t) * (1 - sstep(t1 - t0 - 0.4, t1 - t0, t)); place(buf, s, t0, 0, 0.05)
def rumble(buf, t0, t1):
    n = int((t1 - t0) * SR); t = tt(n); d = t1 - t0
    s = fshape(noise(n), 25, 130) * (0.1 + 0.9 * (t / d) ** 2) * (1 - sstep(d - 0.25, d, t)); place(buf, s, t0, 0, 0.55)

def boom_base():
    n = int(1.4 * SR); t = tt(n); f = 32 + 130 * np.exp(-t / 0.16)
    b = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.55)
    b += 0.5 * np.sin(2 * np.pi * np.cumsum(f * 2.01) / SR) * np.exp(-t / 0.2)
    b += 0.9 * fshape(noise(n), 30, 420) * np.exp(-t / 0.22) + 0.35 * fshape(noise(n), 1500, 9000) * np.exp(-t / 0.03)
    b = np.tanh(2.6 * b) / np.tanh(2.6)                       # dense, saturated cartoon boom
    b += 0.25 * np.tanh(4 * fshape(b, 60, 220))
    return b / np.max(np.abs(b))
def tauU(u): return 0.08 * u + 0.62 * (1 - np.exp(-u / 0.40))
def explosion(buf, t0):
    """boom at real speed -> slow-mo (same clock as the picture) -> tape stop at +2.5 s"""
    base = boom_base(); dt = 1 / SR; L = int(2.7 * SR); u = np.arange(L) * dt
    rate = 0.08 + 0.62 / 0.40 * np.exp(-u / 0.40); rate = np.where(u > 2.3, rate * np.clip(1 - (u - 2.3) / 0.2, 0, 1) ** 2, rate)
    pos = np.cumsum(rate) * dt * (1.4 / 0.85)                # read position in base seconds
    s = np.interp(pos * SR, np.arange(len(base)), base, right=0.0) * (1 - sstep(2.35, 2.5, u))
    s = np.tanh(1.8 * s) / np.tanh(1.8)                       # pre-saturate so the limiter barely has to touch it
    place(buf, s, t0, 0, 0.32, fade=0.0005)
    for k in range(70):                                      # fine dust sparkle
        tau = rng.uniform(0.02, 0.8); uu = np.interp(tau, tauU(np.linspace(0, 2.3, 800)), np.linspace(0, 2.3, 800))
        n = int(0.04 * SR); t = tt(n); f = rng.uniform(3500, 9000)
        place(buf, np.sin(2 * np.pi * f * t) * np.exp(-t / 0.008), t0 + uu, rng.uniform(-.8, .8), rng.uniform(0.01, 0.05))

def play_clunk(buf, t0):
    n = int(0.12 * SR); t = tt(n); s = np.sin(2 * np.pi * 95 * t) * np.exp(-t / 0.03) + 0.5 * fshape(noise(n), 300, 3000) * np.exp(-t / 0.008)
    place(buf, s, t0, 0, 0.6)

# ---------------------------------------------------------------- music
def marimba(f, d=0.5, a=0.2):
    n = int(d * SR); t = tt(n)
    return (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.28) + 0.35 * np.sin(2 * np.pi * 3.97 * f * t) * np.exp(-t / 0.05) + 0.1 * np.sin(2 * np.pi * 9.9 * f * t) * np.exp(-t / 0.02)) * a
def pizz(f, d=0.35, a=0.3):
    n = int(d * SR); t = tt(n)
    return (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.09) + 0.4 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.04) + 0.25 * fshape(noise(n), 200, 1800) * np.exp(-t / 0.006)) * a
PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]

# ---------------------------------------------------------------- assemble one pass
def render_pass(buf, off):
    def P(t): return t + off
    hops = [e for e in EVENTS if e['kind'] == 'hop' and not e.get('big') and e['t'] < 5.9]   # the happy hop grid (no music in the panic)
    for e in EVENTS:
        k, t = e['kind'], e['t']; pan = np.clip(e.get('x', 0) / 7.5 * 0.55, -1, 1); row = e.get('row', 2)
        pitch = 1.25 - row * 0.09 + rng.uniform(-0.03, 0.03)                        # pitched by row
        if k == 'key':
            tb = P(t) + 1 / FPS - 0.004                                         # peak 1 frame after bottom-out
            v = e.get('vel', 0.7)
            place(buf, bump(), tb - 0.012, pan, 0.5 * v); place(buf, thock(v, pitch), tb, pan, 0.55 * v + 0.15)
            if e.get('stomp'): place(buf, thock(1.0, 0.7), tb, 0, 0.5); place(buf, rattle(), tb + 0.01, 0, 0.3)
            if e.get('ctrlz'): place(buf, clack(1.0), tb + 0.01, pan, 0.35)
            if e.get('space'): place(buf, rattle(), tb + 0.004, pan, 0.4)                # spacebar stabiliser rattle
            if v < 0.2: place(buf, tick(0.12), tb - 0.006, pan, 1.0)                     # running steps: barely-there clicks
        elif k == 'up': place(buf, clack(0.55), P(t) + 0.004, pan, 0.45)
        elif k == 'tiptoe': place(buf, tick(0.22), P(t), pan, 1.0); place(buf, thock(0.18, pitch * 1.1), P(t) + 1 / FPS, pan, 0.28)
        elif k == 'step': place(buf, tick(0.09), P(t), pan, 1.0)
        elif k == 'rattle': place(buf, rattle(), P(t), 0, 0.35)
        elif k == 'pop': place(buf, pop_launch(), P(t), pan, 0.35)
        elif k == 'land': place(buf, thock(0.35, pitch * 1.05), P(t) + 1 / FPS, pan, 0.45); place(buf, clack(0.5), P(t) + 1 / FPS, pan, 0.3)
        elif k == 'bounce': place(buf, tick(0.1), P(t), pan, 1.0)
        elif k == 'hop': place(buf, blip(480 + rng.uniform(0, 80), 860, 0.09, 0.2), P(t) + 0.01, 0, 0.55)
        elif k == 'hum': hum(P(t), P(e['t1']), buf)
        elif k == 'giggle':
            for i in range(3): place(buf, blip(700 + i * 90, 1000 + i * 90, 0.06, 0.2), P(t) + i * 0.09, 0, 0.5)
        elif k == 'yah': place(buf, vox('a', 280, 360, 0.2, 0.4), P(t) - 0.02, 0, 0.4)
        elif k == 'error': beep(buf, P(t)); beep(buf, P(t) + 0.16, 660)
        elif k == 'eep': place(buf, blip(900, 1500, 0.12, 0.3), P(t), 0, 0.7)
        elif k == 'alarm': alarm(buf, P(t), P(e['t1']))
        elif k == 'rumble': rumble(buf, P(t), P(e['t1']))
        elif k == 'hup': place(buf, vox('u', 210, 180, 0.09, 0.5), P(t) - 0.03, 0, 0.5)
        elif k == 'creak': creak(buf, P(t), P(e['t1']))
        elif k == 'nnngh': place(buf, vox('n', 150, 230, e['t1'] - t, 0.4, 0.06, 0.02), P(t), 0, 0.5)
        elif k == 'sigh': sigh(buf, P(t))
        elif k == 'heh': heh(buf, P(t))
        elif k == 'ah': place(buf, vox('a', 250 + 40 * e['n'], 300 + 70 * e['n'], 0.34, 0.5, 0.04, 0.01), P(t), 0, 0.55)
        elif k == 'choo': choo(buf, P(t))
        elif k == 'uhoh':
            place(buf, vox('o', 380, 330, 0.12, 0.4), P(t), 0, 0.5); place(buf, vox('o', 330, 250, 0.2, 0.4), P(t) + 0.16, 0, 0.5)
        elif k == 'boom': explosion(buf, P(t))
        elif k == 'tapestop': pass
        elif k == 'play': play_clunk(buf, P(t))
    # ---- music
    for h in hops:
        if h.get('big'): continue
        i = hops.index(h); note = PENTA[[0, 2, 1, 3, 4, 2, 3, 1, 0, 2, 4][i % 11]]
        land = P(h['t']) + 0.22 + 0.045                                                # slightly off the landings
        place(buf, marimba(note, 0.5, 0.2), land, 0.15, 0.55)
        if i % 2 == 0: place(buf, pizz(130.8 if i % 4 == 0 else 98.0), land + 0.02, -0.2, 0.5)
    for k in range(8):                                                                   # rising run into the stomp
        place(buf, marimba(PENTA[k % 5] * (2 if k > 4 else 1) * 0.5 * 2, 0.3, 0.2), P(5.72 + k * 0.07), 0.1, 0.5)
    for j, f in enumerate([523.25, 659.25, 783.99, 1046.5]):                             # ta-da that sags when ERROR hits
        n = int(0.5 * SR); t = tt(n); sag = 1 - 0.18 * sstep(0.0, 0.22, t)
        s = np.sin(2 * np.pi * np.cumsum(f * sag) / SR) * np.exp(-t / 0.22) * 0.18 + 0.05 * np.sin(2 * np.pi * np.cumsum(f * 3.97 * sag) / SR) * np.exp(-t / 0.04)
        place(buf, s, P(6.40 + j * 0.012), 0, 0.45)
    for i, t in enumerate(np.arange(13.82, 15.26, 0.24)):                                # sneaky pizzicato for the tiptoe
        place(buf, pizz([261.6, 329.6, 392.0, 329.6, 293.7, 349.2][i % 6], 0.3, 0.45), P(t), 0.2, 0.55)
    n = int(1.1 * SR); t = tt(n); f = 180 + 220 * sstep(0, 1.1, t)                       # soft rising pad under "ah... ah..."
    pad = fshape(np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR), None, 1200) * sstep(0, 0.9, t) * (1 - sstep(0.95, 1.1, t))
    place(buf, pad, P(16.22), 0, 0.12)

def tape_effects(mix):
    """VHS rewind: whole mix (music included) played backwards and fast as a squeal, wow + motor whirr, then a PLAY clunk."""
    out = mix.copy(); base = N  # middle pass starts at N
    for r in REWINDS:
        a, b = int((base / SR + r['t0']) * SR), int((base / SR + r['t1']) * SR); n = b - a; t = np.arange(n) / SR; d = r['t1'] - r['t0']
        src = r['s0'] + (r['s1'] - r['s0']) * sstep(0, 1, t / d)
        src = src + 0.012 * np.sin(2 * np.pi * 3.1 * t) * (r['s0'] - r['s1']) / 8            # tape wow
        idx = src * SR
        for ch in (0, 1):
            col = mix[:, ch]; y = np.interp(idx, np.arange(len(col)), col)
            y = 0.5 * y + 0.25 * (np.interp(idx + 6, np.arange(len(col)), col) + np.interp(idx - 6, np.arange(len(col)), col))   # cheap anti-alias
            out[a:b, ch] = 0.55 * y * (np.minimum(1, t / 0.01) * np.minimum(1, (d - t) / 0.015))
        whirr = phase_osc(90 + 300 * sstep(0, 1, t / d) * (1 - 0.3 * np.sin(np.pi * t / d)), 'saw'); whirr = fshape(whirr, 120, 1400) * np.sin(np.pi * t / d) ** 0.5
        hiss = fshape(noise(n), 3000, 9000) * 0.15
        out[a:b, 0] += (whirr * 0.07 + hiss * 0.05); out[a:b, 1] += (whirr * 0.07 + hiss * 0.05)
    return out

# ---------------------------------------------------------------- loudness / limiter
def lufs_tp(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'loudnorm=I=-14:TP=-2:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.search(r'\{.*?\}', r.stderr, re.S); j = json.loads(m.group(0)); return float(j['input_i']), float(j['input_tp'])
def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2'); w = wave.open(path, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes()); w.close()
def limiter(x, ceil):
    peak = np.max(np.abs(x), axis=1); gain = np.minimum(1, ceil / np.maximum(peak, 1e-9)); w = int(0.0015 * SR)
    g = np.minimum.reduce([np.roll(gain, s) for s in range(-w, w + 1, max(1, w // 6))])
    k = np.hanning(2 * w + 1); k /= k.sum(); g = np.convolve(g, k, 'same')
    return x * g[:, None], 20 * np.log10(1 / max(np.min(g), 1e-6))
def true_peak_db(x):
    n = x.shape[0]; X = np.fft.rfft(x, axis=0); pad = np.zeros((n * 2 // 2 * 4 // 2 + 1, 2), complex); pad[:X.shape[0]] = X
    y = np.fft.irfft(pad, n * 4, axis=0) * 4; return 20 * np.log10(np.max(np.abs(y)) + 1e-12)

def glue(x, thr_db_over_rms=9.0, ratio=4.0, win=0.012):
    """smooth feed-forward compressor (numpy): tames the few big hits before the limiter"""
    n = int(win * SR); k = np.ones(n) / n
    env = np.sqrt(np.convolve(np.mean(x ** 2, axis=1), k, 'same') + 1e-12)
    rms = np.sqrt(np.mean(x ** 2)); thr = rms * 10 ** (thr_db_over_rms / 20)
    g = np.where(env > thr, (thr / env) ** (1 - 1 / ratio), 1.0)
    m = int(0.004 * SR); g = np.minimum.reduce([np.roll(g, s) for s in range(-m, m + 1, max(1, m // 4))])
    g = np.convolve(g, np.hanning(2 * m + 1) / np.hanning(2 * m + 1).sum(), 'same')
    return x * g[:, None]

def main():
    big = np.zeros((3 * N + SR, 2))
    for k in range(3): render_pass(big, k * DUR)
    mix = tape_effects(big)
    out = glue(mix)[N:2 * N].copy()
    # loudness: measure, gain to -14 LUFS, limit under -2 dBTP, re-measure
    tmp = 'audio/_tmp.wav'; write_wav(tmp, out / max(1e-9, np.max(np.abs(out))) * 0.5); lufs, _ = lufs_tp(tmp)
    out = out / max(1e-9, np.max(np.abs(out))) * 0.5 * 10 ** ((-14.0 - lufs) / 20)
    ceil_db, gain_db = -3.6, 0.0
    for it in range(8):                                   # converge on -14 LUFS with the limiter in the loop
        y, red = limiter(out * 10 ** (gain_db / 20), 10 ** (ceil_db / 20)); write_wav(tmp, y); i, tp = lufs_tp(tmp)
        if abs(i + 14) < 0.15 and tp < -2.0: break
        if tp >= -2.0: ceil_db -= 0.3
        gain_db += (-14.0 - i) * 0.9
    if tp > -2.1: y = y * 10 ** ((-2.1 - tp) / 20)           # final trim if inter-sample peaks still overshoot
    write_wav('audio/ctrlz.wav', y); i, tp2 = lufs_tp('audio/ctrlz.wav'); os.remove(tmp)
    print(f'audio/ctrlz.wav  {DUR:.1f} s  {SR} Hz stereo  loudness {i:.1f} LUFS  true peak {tp2:.1f} dBTP  (limiter max reduction {red:.1f} dB)  seam step {np.max(np.abs(y[0]-y[-1])):.4f}')

if __name__ == '__main__': main()
