// Procedural sound engine. Every sound in the game is synthesised here with the Web Audio API —
// there are no audio files.
import { rand, randi, pick } from './util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.occlusion = () => 0; // (pos) => 0..1, set by the game
    this.volume = 0.9;
  }

  init() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 2.4);
    const rg = ctx.createGain();
    rg.gain.value = 0.5;
    this.reverb.connect(rg).connect(this.master);
    this.noise = this.noiseBuffer('white', 3);
    this.brown = this.noiseBuffer('brown', 5);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  resume() {
    this.ctx?.resume();
  }

  get t() {
    return this.ctx.currentTime;
  }

  impulse(dur, decay) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  noiseBuffer(type, dur) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  updateListener(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = cam.position;
    const f = cam.getWorldDirection(this._f || (this._f = cam.position.clone()));
    if (l.positionX) {
      const t = this.t;
      l.positionX.setTargetAtTime(p.x, t, 0.01);
      l.positionY.setTargetAtTime(p.y, t, 0.01);
      l.positionZ.setTargetAtTime(p.z, t, 0.01);
      l.forwardX.setTargetAtTime(f.x, t, 0.01);
      l.forwardY.setTargetAtTime(f.y, t, 0.01);
      l.forwardZ.setTargetAtTime(f.z, t, 0.01);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  // Output chain: input gain -> (occlusion lowpass) -> panner -> sfx + reverb send.
  out(pos, { vol = 1, reverb = 0.25, occlude = true, ref = 1.2 } = {}) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.gain.value = vol;
    let node = input;
    let panner = null, lp = null;
    if (pos) {
      lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      const occ = occlude ? this.occlusion(pos) : 0;
      lp.frequency.value = occ > 0 ? 700 + (1 - occ) * 4000 : 20000;
      node.connect(lp);
      node = lp;
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = ref;
      panner.rolloffFactor = 1.4;
      panner.maxDistance = 80;
      this.setPannerPos(panner, pos);
      node.connect(panner);
      node = panner;
    }
    node.connect(this.sfx);
    if (reverb > 0) {
      const s = ctx.createGain();
      s.gain.value = reverb;
      node.connect(s).connect(this.reverb);
    }
    return { input, panner, lp };
  }

  setPannerPos(p, pos) {
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y ?? 1;
      p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y ?? 1, pos.z);
  }

  src(buf = this.noise) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    return s;
  }

  env(param, t, attack, peak, decay, floor = 0.0001) {
    param.setValueAtTime(floor, t);
    param.exponentialRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(floor, t + attack + decay);
  }

  filter(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  osc(type, freq) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    return o;
  }

  gain(v = 0) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  distortion(amount = 30) {
    const ws = this.ctx.createWaveShaper();
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / n) * 2 - 1;
      curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    ws.curve = curve;
    return ws;
  }

  // ---------------- one-shots ----------------
  footstep(pos, surface = 'wood', vol = 0.5) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.out(pos, { vol, reverb: surface === 'grass' ? 0.04 : 0.2 });
    const thump = this.osc('sine', rand(70, 95));
    thump.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const tg = this.gain();
    this.env(tg.gain, t, 0.008, surface === 'grass' ? 0.25 : surface === 'tile' ? 0.5 : 0.8, 0.13);
    thump.connect(tg).connect(o.input);
    thump.start(t);
    thump.stop(t + 0.2);
    const n = this.src();
    const f = this.filter('bandpass', surface === 'grass' ? rand(2500, 4200) : surface === 'tile' ? rand(1800, 2600) : surface === 'carpet' ? rand(300, 500) : rand(600, 1100), surface === 'grass' ? 0.7 : 1.3);
    const ng = this.gain();
    this.env(ng.gain, t, 0.005, surface === 'grass' ? 0.5 : surface === 'carpet' ? 0.2 : 0.35, surface === 'grass' ? 0.18 : 0.08);
    n.connect(f).connect(ng).connect(o.input);
    n.start(t, Math.random() * 2);
    n.stop(t + 0.25);
    if (surface === 'wood' && Math.random() < 0.08) this.creak(pos, { vol: vol * 0.35, dur: 0.4 });
  }

  creak(pos, { vol = 0.6, dur = rand(0.7, 1.5) } = {}) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.out(pos, { vol, reverb: 0.35 });
    const pulse = this.osc('sawtooth', 30);
    const steps = 12;
    const curve = new Float32Array(steps);
    let f = rand(18, 35);
    for (let i = 0; i < steps; i++) curve[i] = f = Math.max(10, Math.min(70, f + rand(-12, 14)));
    pulse.frequency.setValueCurveAtTime(curve, t, dur);
    const bp1 = this.filter('bandpass', rand(500, 900), 14);
    const bp2 = this.filter('bandpass', rand(1300, 1900), 10);
    bp1.frequency.linearRampToValueAtTime(rand(700, 1200), t + dur);
    const g = this.gain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.6, t + 0.08);
    g.gain.setValueAtTime(1.6, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    pulse.connect(bp1).connect(g);
    pulse.connect(bp2).connect(g);
    g.connect(o.input);
    pulse.start(t);
    pulse.stop(t + dur + 0.05);
  }

  doorClose(pos, vol = 0.5) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.out(pos, { vol, reverb: 0.5 });
    const th = this.osc('sine', 70);
    th.frequency.exponentialRampToValueAtTime(32, t + 0.35);
    const g = this.gain();
    this.env(g.gain, t, 0.005, 1.4, 0.45);
    th.connect(g).connect(o.input);
    th.start(t);
    th.stop(t + 0.6);
    const n = this.src(this.brown);
    const lp = this.filter('lowpass', 900);
    const ng = this.gain();
    this.env(ng.gain, t, 0.003, 1.2, 0.3);
    n.connect(lp).connect(ng).connect(o.input);
    n.start(t, Math.random() * 3);
    n.stop(t + 0.5);
    const click = this.src();
    const hp = this.filter('highpass', 2500);
    const cg = this.gain();
    this.env(cg.gain, t + 0.02, 0.002, 0.4, 0.04);
    click.connect(hp).connect(cg).connect(o.input);
    click.start(t);
    click.stop(t + 0.1);
  }

  thud(pos, vol = 0.6) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.out(pos, { vol, reverb: 0.3 });
    const th = this.osc('sine', rand(110, 170));
    th.frequency.exponentialRampToValueAtTime(55, t + 0.1);
    const g = this.gain();
    this.env(g.gain, t, 0.003, 1, 0.14);
    th.connect(g).connect(o.input);
    th.start(t);
    th.stop(t + 0.2);
    const n = this.src();
    const bp = this.filter('bandpass', rand(800, 2400), 2);
    const ng = this.gain();
    this.env(ng.gain, t, 0.002, 0.6, 0.07);
    n.connect(bp).connect(ng).connect(o.input);
    n.start(t, Math.random() * 2);
    n.stop(t + 0.15);
  }

  knock(pos, count = randi(2, 4), vol = 0.8) {
    if (!this.ctx) return;
    let t = this.t;
    const o = this.out(pos, { vol, reverb: 0.45 });
    for (let i = 0; i < count; i++) {
      const th = this.osc('sine', 150);
      th.frequency.setValueAtTime(150, t);
      th.frequency.exponentialRampToValueAtTime(60, t + 0.1);
      const g = this.gain();
      this.env(g.gain, t, 0.002, 1.2, 0.15);
      th.connect(g).connect(o.input);
      th.start(t);
      th.stop(t + 0.2);
      const n = this.src(this.brown);
      const ng = this.gain();
      this.env(ng.gain, t, 0.002, 1, 0.08);
      n.connect(this.filter('bandpass', 350, 1.5)).connect(ng).connect(o.input);
      n.start(t, Math.random() * 3);
      n.stop(t + 0.15);
      t += rand(0.2, 0.34);
    }
  }

  whisper(pos, vol = 0.45) {
    if (!this.ctx) return;
    let t = this.t;
    const o = this.out(pos, { vol, reverb: 0.6, ref: 0.8 });
    const n = this.src();
    const f1 = this.filter('bandpass', 2000, 3);
    const f2 = this.filter('bandpass', 900, 4);
    const g = this.gain(0);
    n.connect(f1).connect(g);
    n.connect(f2).connect(g);
    g.connect(o.input);
    const syl = randi(5, 12);
    for (let i = 0; i < syl; i++) {
      const len = rand(0.08, 0.22);
      f1.frequency.setValueAtTime(rand(1400, 3600), t);
      f2.frequency.setValueAtTime(rand(500, 1300), t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(rand(0.4, 1), t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      t += len + rand(0.01, 0.12);
    }
    n.start(this.t, Math.random() * 2);
    n.stop(t + 0.1);
  }

  moan(pos, { vol = 0.5, dur = rand(1.8, 3), pitch = rand(120, 200) } = {}) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.out(pos, { vol, reverb: 0.7 });
    const o1 = this.osc('sawtooth', pitch);
    const o2 = this.osc('triangle', pitch * 1.012);
    for (const ox of [o1, o2]) ox.frequency.exponentialRampToValueAtTime(pitch * 0.62, t + dur);
    const lfo = this.osc('sine', 5.5);
    const lg = this.gain(pitch * 0.03);
    lfo.connect(lg);
    lg.connect(o1.frequency);
    lg.connect(o2.frequency);
    const fa = this.filter('bandpass', 380, 6);
    const fb = this.filter('bandpass', 850, 7);
    fa.frequency.linearRampToValueAtTime(600, t + dur);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.2, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const ox of [o1, o2]) {
      ox.connect(fa).connect(g);
      ox.connect(fb).connect(g);
      ox.start(t);
      ox.stop(t + dur + 0.05);
    }
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    g.connect(o.input);
  }

  scream(pos, vol = 1, dur = 1.6) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.out(pos, { vol, reverb: 0.6, occlude: false });
    const g = this.gain(0);
    const dist = this.distortion(60);
    const mix = this.gain(1);
    for (let i = 0; i < 3; i++) {
      const s = this.osc('sawtooth', rand(520, 760));
      s.frequency.exponentialRampToValueAtTime(rand(180, 260), t + dur);
      const vib = this.osc('sine', rand(6, 11));
      const vg = this.gain(30);
      vib.connect(vg).connect(s.frequency);
      s.connect(mix);
      s.start(t);
      s.stop(t + dur);
      vib.start(t);
      vib.stop(t + dur);
    }
    const n = this.src();
    const ng = this.gain(0.4);
    n.connect(this.filter('bandpass', 1500, 0.8)).connect(ng).connect(mix);
    n.start(t);
    n.stop(t + dur);
    for (const [f, q] of [[800, 5], [1200, 6], [2800, 8]]) mix.connect(this.filter('bandpass', f, q)).connect(dist);
    dist.connect(g).connect(o.input);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.5, t + 0.05);
    g.gain.setValueAtTime(1.5, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  beep(freq = 1800, dur = 0.05, vol = 0.12, type = 'square') {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.osc(type, freq);
    const g = this.gain();
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(0, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  click(pos = null, vol = 0.35) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.out(pos, { vol, reverb: 0.1 });
    const n = this.src();
    const g = this.gain();
    this.env(g.gain, t, 0.001, 1, 0.02);
    n.connect(this.filter('highpass', 2000)).connect(g).connect(o.input);
    n.start(t, Math.random());
    n.stop(t + 0.05);
    const s = this.osc('square', 3200);
    const sg = this.gain();
    this.env(sg.gain, t, 0.001, 0.2, 0.01);
    s.connect(sg).connect(o.input);
    s.start(t);
    s.stop(t + 0.03);
  }

  heartbeat(vol = 0.6) {
    if (!this.ctx) return;
    const t = this.t;
    for (const [dt, f, v] of [[0, 58, 1], [0.17, 46, 0.7]]) {
      const o = this.osc('sine', f);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + dt + 0.12);
      const g = this.gain();
      this.env(g.gain, t + dt, 0.01, vol * v, 0.14);
      o.connect(g).connect(this.sfx);
      o.start(t + dt);
      o.stop(t + dt + 0.2);
    }
  }

  sizzle(pos, vol = 0.7, dur = 1.6) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.out(pos, { vol, reverb: 0.4 });
    const n = this.src();
    const g = this.gain(0);
    n.connect(this.filter('highpass', 2500)).connect(g).connect(o.input);
    for (let k = 0; k < dur; k += 0.03) g.gain.setValueAtTime(Math.random() * (1 - k / dur), t + k);
    g.gain.setValueAtTime(0, t + dur);
    n.start(t);
    n.stop(t + dur);
    const r = this.osc('sawtooth', 38);
    const rg = this.gain();
    this.env(rg.gain, t, 0.1, 0.5, dur);
    r.connect(this.filter('lowpass', 150)).connect(rg).connect(o.input);
    r.start(t);
    r.stop(t + dur + 0.2);
  }

  scribble(pos, dur = 2.2) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.out(pos, { vol: 0.6, reverb: 0.2 });
    const n = this.src();
    const g = this.gain(0);
    n.connect(this.filter('bandpass', 3200, 2.5)).connect(g).connect(o.input);
    for (let k = 0; k < dur; k += rand(0.04, 0.12)) {
      g.gain.setValueAtTime(rand(0.2, 0.9), t + k);
      g.gain.setValueAtTime(0.02, t + k + rand(0.02, 0.06));
    }
    g.gain.setValueAtTime(0, t + dur);
    n.start(t);
    n.stop(t + dur);
  }

  rattle(vol = 0.4) {
    if (!this.ctx) return;
    const t = this.t;
    for (let i = 0; i < 8; i++) {
      const n = this.src();
      const g = this.gain();
      this.env(g.gain, t + i * rand(0.03, 0.06), 0.001, vol, 0.03);
      n.connect(this.filter('bandpass', rand(3000, 6000), 4)).connect(g).connect(this.sfx);
      n.start(t, Math.random());
      n.stop(t + 0.6);
    }
  }

  lighter() {
    if (!this.ctx) return;
    this.click(null, 0.5);
    const t = this.t;
    const n = this.src();
    const g = this.gain();
    this.env(g.gain, t + 0.05, 0.05, 0.25, 0.6);
    n.connect(this.filter('bandpass', 1200, 0.6)).connect(g).connect(this.sfx);
    n.start(t);
    n.stop(t + 0.8);
  }

  buzz(pos, dur = 0.6, vol = 0.25) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.out(pos, { vol, reverb: 0.2 });
    const s = this.osc('sawtooth', 120);
    const g = this.gain(0);
    for (let k = 0; k < dur; k += 0.05) g.gain.setValueAtTime(Math.random() < 0.5 ? 0 : 0.5, t + k);
    g.gain.setValueAtTime(0, t + dur);
    s.connect(this.filter('bandpass', 360, 3)).connect(g).connect(o.input);
    s.start(t);
    s.stop(t + dur);
  }

  breath(vol = 0.25) {
    if (!this.ctx) return;
    const t = this.t;
    const n = this.src();
    const bp = this.filter('bandpass', 700, 0.8);
    bp.frequency.linearRampToValueAtTime(1100, t + 0.9);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    n.connect(bp).connect(g).connect(this.sfx);
    n.start(t, Math.random());
    n.stop(t + 1.4);
  }

  // Voice for the spirit box: the browser's speech synth (pitched way down) layered on radio noise.
  // Falls back to a formant-synth babble if speech synthesis isn't available.
  spiritVoice(text) {
    if (!this.ctx) return;
    const t = this.t;
    const n = this.src();
    const g = this.gain();
    this.env(g.gain, t, 0.02, 0.35, 1.6);
    n.connect(this.filter('bandpass', 1400, 0.7)).connect(g).connect(this.sfx);
    n.start(t);
    n.stop(t + 1.8);
    const synth = window.speechSynthesis;
    if (synth) {
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = 0;
      u.rate = 0.55;
      u.volume = Math.min(1, this.volume * 1.2);
      const voices = synth.getVoices().filter((v) => /^en/i.test(v.lang));
      const male = voices.find((v) => /david|mark|male|george|daniel/i.test(v.name));
      if (male || voices[0]) u.voice = male || voices[0];
      synth.cancel();
      synth.speak(u);
    }
    // formant layer (always) so the voice sits inside the radio noise
    const words = text.split(' ').length;
    let tt = t + 0.1;
    const src = this.osc('sawtooth', 95);
    const vg = this.gain(0);
    const fa = this.filter('bandpass', 600, 8);
    const fb = this.filter('bandpass', 1100, 9);
    src.connect(fa).connect(vg);
    src.connect(fb).connect(vg);
    vg.connect(this.distortion(20)).connect(this.filter('bandpass', 1500, 0.6)).connect(this.sfx);
    const vowels = [[700, 1100], [300, 870], [500, 1700], [400, 2000], [600, 900]];
    for (let w = 0; w < words * 2; w++) {
      const [a, b] = pick(vowels);
      fa.frequency.setValueAtTime(a, tt);
      fb.frequency.setValueAtTime(b, tt);
      src.frequency.setValueAtTime(rand(80, 110), tt);
      vg.gain.setValueAtTime(synth ? 0.08 : 0.5, tt);
      vg.gain.setValueAtTime(0.0, tt + 0.16);
      tt += 0.22;
    }
    src.start(t);
    src.stop(tt + 0.1);
  }

  // ---------------- loops ----------------
  staticLoop() {
    if (!this.ctx) return { update() {}, stop() {} };
    const n = this.src();
    const bp = this.filter('bandpass', 1500, 1.5);
    const g = this.gain(0.22);
    n.connect(bp).connect(g).connect(this.sfx);
    n.start();
    let acc = 0;
    return {
      update: (dt) => {
        acc += dt;
        if (acc > 0.09) {
          acc = 0;
          bp.frequency.setValueAtTime(rand(400, 3200), this.t);
          g.gain.setValueAtTime(rand(0.12, 0.3), this.t);
          if (Math.random() < 0.1) this.beep(rand(600, 1400), 0.04, 0.03, 'sine');
        }
      },
      stop: () => {
        g.gain.setTargetAtTime(0, this.t, 0.05);
        n.stop(this.t + 0.3);
      },
    };
  }

  huntVoice(pos) {
    if (!this.ctx) return { update() {}, stop() {} };
    const o = this.out(pos, { vol: 0.9, reverb: 0.5, ref: 1.5 });
    const s1 = this.osc('sawtooth', 160);
    const s2 = this.osc('sawtooth', 163);
    const fa = this.filter('bandpass', 500, 6);
    const fb = this.filter('bandpass', 1100, 7);
    const g = this.gain(0);
    for (const s of [s1, s2]) {
      s.connect(fa).connect(g);
      s.connect(fb).connect(g);
      s.start();
    }
    const dist = this.distortion(25);
    g.connect(dist).connect(o.input);
    let acc = 0;
    const vowels = [[700, 1100], [300, 870], [500, 1700], [400, 800], [250, 600]];
    return {
      update: (dt, p, occl) => {
        this.setPannerPos(o.panner, p);
        o.lp.frequency.setTargetAtTime(occl > 0 ? 900 : 18000, this.t, 0.1);
        acc -= dt;
        if (acc <= 0) {
          acc = rand(0.12, 0.4);
          const t = this.t;
          const [a, b] = pick(vowels);
          fa.frequency.setTargetAtTime(a, t, 0.04);
          fb.frequency.setTargetAtTime(b, t, 0.04);
          const p0 = rand(90, 260);
          s1.frequency.setTargetAtTime(p0, t, 0.05);
          s2.frequency.setTargetAtTime(p0 * 1.02, t, 0.05);
          g.gain.setTargetAtTime(Math.random() < 0.7 ? rand(0.3, 0.8) : 0, t, 0.03);
        }
      },
      stop: () => {
        g.gain.setTargetAtTime(0, this.t, 0.05);
        s1.stop(this.t + 0.4);
        s2.stop(this.t + 0.4);
      },
    };
  }

  startAmbient() {
    if (!this.ctx || this.amb) return;
    const ctx = this.ctx;
    // wind
    const wind = this.src(this.brown);
    const wlp = this.filter('lowpass', 400, 0.8);
    const wlfo = this.osc('sine', 0.07);
    const wlg = this.gain(250);
    wlfo.connect(wlg).connect(wlp.frequency);
    const windG = this.gain(0.2);
    wind.connect(wlp).connect(windG).connect(this.master);
    wind.start();
    wlfo.start();
    // low house drone
    const droneG = this.gain(0);
    for (const f of [48, 48.7, 97]) {
      const d = this.osc(f > 90 ? 'sawtooth' : 'sine', f);
      const dg = this.gain(f > 90 ? 0.15 : 0.6);
      d.connect(this.filter('lowpass', 220)).connect(dg).connect(droneG);
      d.start();
    }
    droneG.connect(this.master);
    // crickets
    const cr = this.osc('sine', 4600);
    const am1 = this.gain(0.5);
    const lfo1 = this.osc('square', 28);
    const l1g = this.gain(0.5);
    lfo1.connect(l1g).connect(am1.gain);
    const am2 = this.gain(0.5);
    const lfo2 = this.osc('square', 0.9);
    const l2g = this.gain(0.5);
    lfo2.connect(l2g).connect(am2.gain);
    const crG = this.gain(0.02);
    cr.connect(am1).connect(am2).connect(crG).connect(this.master);
    cr.start();
    lfo1.start();
    lfo2.start();
    // rain: hiss plus random droplet ticks; muffled by the roof indoors
    const rain = this.src();
    const rainLp = this.filter("lowpass", 7000);
    const rainG = this.gain(0.1);
    rain.connect(this.filter("highpass", 900)).connect(rainLp).connect(rainG).connect(this.master);
    rain.start();
    const drops = this.src();
    const dropG = this.gain(0);
    const dropLfo = this.src(this.noise);
    dropLfo.playbackRate.value = 0.004;
    const dlg = this.gain(0.08);
    dropLfo.connect(dlg).connect(dropG.gain);
    drops.connect(this.filter("bandpass", 3500, 2)).connect(dropG).connect(rainLp);
    drops.start();
    dropLfo.start();
    this.amb = { windG, droneG, crG, wlp, rainG, rainLp };
    void ctx;
  }

  // per-map ambience levels (rain on/off, crickets, wind strength)
  configure(env) {
    this.mapEnv = env;
  }

  setEnvironment(outside, fear = 0) {
    if (!this.amb) return;
    const t = this.t;
    const env = this.mapEnv || { weather: 'rain', crickets: 1, wind: 1 };
    this.amb.windG.gain.setTargetAtTime((outside ? 0.22 : 0.07) * env.wind, t, 0.8);
    this.amb.crG.gain.setTargetAtTime((outside ? 0.025 : 0.003) * env.crickets, t, 0.8);
    this.amb.droneG.gain.setTargetAtTime(outside ? 0.02 : 0.06 + fear * 0.08, t, 1.5);
    this.amb.rainG.gain.setTargetAtTime(env.weather === 'rain' ? (outside ? 0.11 : 0.05) : 0, t, 0.8);
    this.amb.rainLp.frequency.setTargetAtTime(outside ? 7000 : 600, t, 0.8);
  }

  clockTick(pos) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.out(pos, { vol: 0.25, reverb: 0.3 });
    const n = this.src();
    const g = this.gain();
    this.env(g.gain, t, 0.001, 1, 0.025);
    n.connect(this.filter('bandpass', rand(2600, 3000), 6)).connect(g).connect(o.input);
    n.start(t, Math.random());
    n.stop(t + 0.06);
  }

  tvStatic(pos, dur = 4) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.out(pos, { vol: 0.4, reverb: 0.3 });
    const n = this.src();
    const g = this.gain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.setValueAtTime(0.5, t + dur - 0.1);
    g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(this.filter('highpass', 800)).connect(g).connect(o.input);
    n.start(t);
    n.stop(t + dur);
  }

  thunder(outside, vol = 1) {
    if (!this.ctx) return;
    const t = this.t;
    const dur = rand(3.5, 6);
    const n = this.src(this.brown);
    const lp = this.filter('lowpass', outside ? 900 : 300, 0.7);
    lp.frequency.exponentialRampToValueAtTime(outside ? 120 : 80, t + dur);
    const g = this.gain(0);
    // a sharp crack, then a long rolling rumble with random swells
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.6 * vol, t + 0.06);
    let k = 0.3;
    while (k < dur - 0.4) {
      g.gain.linearRampToValueAtTime(rand(0.3, 1.1) * vol, t + k);
      k += rand(0.2, 0.6);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(lp).connect(g).connect(this.master);
    const s = this.gain(0.4);
    g.connect(s).connect(this.reverb);
    n.start(t, Math.random() * 3);
    n.stop(t + dur + 0.1);
  }

  crackle(pos) {
    if (!this.ctx) return;
    const t = this.t;
    const o = this.out(pos, { vol: rand(0.15, 0.4), reverb: 0.1 });
    const n = this.src();
    const g = this.gain();
    this.env(g.gain, t, 0.001, 1, rand(0.01, 0.04));
    n.connect(this.filter('bandpass', rand(1500, 5000), 1.5)).connect(g).connect(o.input);
    n.start(t, Math.random() * 2);
    n.stop(t + 0.08);
  }

  owl(pos) {
    if (!this.ctx) return;
    let t = this.t;
    const o = this.out(pos, { vol: 0.5, reverb: 0.6, occlude: false, ref: 6 });
    for (const [f, len, gap] of [[390, 0.35, 0.25], [370, 0.18, 0.12], [365, 0.5, 0]]) {
      const s = this.osc('sine', f);
      s.frequency.linearRampToValueAtTime(f * 0.92, t + len);
      const g = this.gain(0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.6, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      s.connect(g).connect(o.input);
      s.start(t);
      s.stop(t + len + 0.05);
      t += len + gap;
    }
  }

  // electronics hum and fans inside the van
  setVanHum(on) {
    if (!this.ctx) return;
    if (!this.hum) {
      const n = this.src(this.brown);
      const g = this.gain(0);
      n.connect(this.filter('bandpass', 180, 0.8)).connect(g).connect(this.master);
      const h = this.osc('sine', 60);
      const hg = this.gain(0.15);
      h.connect(hg).connect(g);
      n.start();
      h.start();
      this.hum = g;
    }
    this.hum.gain.setTargetAtTime(on ? 0.12 : 0, this.t, 0.4);
  }
}
