// Audio 100% sintetizado (sin ficheros): disparo, latigazo, impactos, drones y ambiente.
export class GameAudio {
  constructor() { this.ctx = null; this.ready = false; this.hums = new Map(); }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = ctx.createGain(); this.master.gain.value = 0.85;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 18; this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.004; this.comp.release.value = 0.22;
    this.master.connect(this.comp); this.comp.connect(ctx.destination);

    // reverb de sala grande (impulso sintético)
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(1.7, 2.6);
    this.wet = ctx.createGain(); this.wet.gain.value = 0.22;
    this.verb.connect(this.wet); this.wet.connect(this.master);

    this.sfx = ctx.createGain(); this.sfx.gain.value = 1;
    this.sfx.connect(this.master); this.sfx.connect(this.verb);

    this.noise = this._noiseBuffer(2.0);
    this.ready = true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _impulse(sec, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, n = Math.floor(rate * sec);
    const buf = ctx.createBuffer(2, n, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        lp = lp * 0.72 + (Math.random() * 2 - 1) * 0.28;
        d[i] = lp * Math.pow(1 - t, decay) * (1 - t * 0.2);
      }
    }
    return buf;
  }

  _noiseBuffer(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _noise(dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    s.start(0, Math.random() * 1.4);
    s.stop(this.ctx.currentTime + dur + 0.02);
    return s;
  }

  _env(node, t0, peak, attack, decay, hold = 0) {
    const g = node.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.linearRampToValueAtTime(peak, t0 + attack);
    if (hold) g.setValueAtTime(peak, t0 + attack + hold);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + decay);
    return t0 + attack + hold + decay;
  }

  // --- disparo ---
  shot() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noise(0.16);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(320, t + 0.13);
    const g = ctx.createGain(); this._env(g, t, 0.75, 0.002, 0.13);
    n.connect(bp); bp.connect(g); g.connect(this.sfx);

    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.16);
    const og = ctx.createGain(); this._env(og, t, 0.5, 0.003, 0.17);
    o.connect(og); og.connect(this.sfx); o.start(t); o.stop(t + 0.22);

    const c = this._noise(0.04), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3400;
    const cg = ctx.createGain(); this._env(cg, t, 0.34, 0.001, 0.035);
    c.connect(hp); hp.connect(cg); cg.connect(this.sfx);
  }

  dry() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noise(0.05), hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2200;
    const g = ctx.createGain(); this._env(g, t, 0.35, 0.001, 0.045);
    n.connect(hp); hp.connect(g); g.connect(this.sfx);
  }

  // --- latigazo y golpe ---
  whip() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noise(0.3), bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(420, t); bp.frequency.exponentialRampToValueAtTime(3000, t + 0.16);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.28);
    const g = ctx.createGain(); this._env(g, t, 0.30, 0.03, 0.26);
    n.connect(bp); bp.connect(g); g.connect(this.sfx);
  }

  impact() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [[190, 0.22, 0.16], [347, 0.15, 0.12], [811, 0.07, 0.09]].forEach(([f, a, d], i) => {
      const o = ctx.createOscillator(); o.type = i === 2 ? 'square' : 'triangle';
      o.frequency.setValueAtTime(f * (1 + Math.random() * 0.03), t);
      const g = ctx.createGain(); this._env(g, t, a, 0.002, d);
      o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + d + 0.06);
    });
    const n = this._noise(0.1), bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.7;
    const g = ctx.createGain(); this._env(g, t, 0.4, 0.001, 0.09);
    n.connect(bp); bp.connect(g); g.connect(this.sfx);
  }

  parry() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [[1180, 0.26, 0.75], [1770, 0.17, 0.6], [2360, 0.11, 0.45]].forEach(([f, a, d], i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); this._env(g, t + i * 0.012, a, 0.003, d);
      o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + d + 0.1);
    });
    const n = this._noise(0.5), hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 5200;
    const g = ctx.createGain(); this._env(g, t, 0.2, 0.06, 0.45);
    n.connect(hp); hp.connect(g); g.connect(this.sfx);
  }

  playerHit() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(105, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    const g = ctx.createGain(); this._env(g, t, 0.75, 0.004, 0.42);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.5);
    const n = this._noise(0.3), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const ng = ctx.createGain(); this._env(ng, t, 0.35, 0.004, 0.3);
    n.connect(lp); lp.connect(ng); ng.connect(this.sfx);
  }

  waveStart() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [523.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); this._env(g, t + i * 0.1, 0.16, 0.02, 0.5);
      o.connect(g); g.connect(this.sfx); o.start(t + i * 0.1); o.stop(t + i * 0.1 + 0.7);
    });
  }

  death() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(46, t + 1.3);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain(); this._env(g, t, 0.3, 0.02, 1.3);
    o.connect(lp); lp.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 1.5);
  }

  // --- dron: zumbido posicional ---
  droneHum(id) {
    if (!this.ready) return null;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0.0;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
    panner.refDistance = 2.2; panner.rolloffFactor = 1.1; panner.maxDistance = 40;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 3;
    const oscA = ctx.createOscillator(); oscA.type = 'sawtooth'; oscA.frequency.value = 58;
    const oscB = ctx.createOscillator(); oscB.type = 'sawtooth'; oscB.frequency.value = 59.6;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 6.2;
    const lfoG = ctx.createGain(); lfoG.gain.value = 130;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    oscA.connect(lp); oscB.connect(lp); lp.connect(out); out.connect(panner); panner.connect(this.sfx);
    oscA.start(t); oscB.start(t); lfo.start(t);
    out.gain.setTargetAtTime(0.16, t, 0.6);
    const h = {
      panner, out,
      pos(x, y, z) {
        if (panner.positionX) { panner.positionX.setTargetAtTime(x, ctx.currentTime, 0.05); panner.positionY.setTargetAtTime(y, ctx.currentTime, 0.05); panner.positionZ.setTargetAtTime(z, ctx.currentTime, 0.05); }
        else panner.setPosition(x, y, z);
      },
      charge(v) { lp.frequency.setTargetAtTime(420 + v * 900, ctx.currentTime, 0.1); out.gain.setTargetAtTime(0.16 + v * 0.1, ctx.currentTime, 0.2); },
      stop() { const n = ctx.currentTime; out.gain.setTargetAtTime(0.0001, n, 0.12); [oscA, oscB, lfo].forEach(o => { try { o.stop(n + 0.7); } catch (e) {} }); setTimeout(() => { try { panner.disconnect(); out.disconnect(); } catch (e) {} }, 1200); }
    };
    this.hums.set(id, h);
    return h;
  }

  ambient() {
    if (!this.ready || this._amb) return;
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 130; lp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.0;
    n.connect(lp); lp.connect(g); g.connect(this.master);
    n.start();
    g.gain.setTargetAtTime(0.07, ctx.currentTime, 3);
    this._amb = { n, g, lp };
    // zumbido eléctrico lejano
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 100;
    const og = ctx.createGain(); og.gain.value = 0.012;
    o.connect(og); og.connect(this.master); o.start();
  }

  // --- explosión metálica de dron ---
  explode() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // cuerpo: ruido filtrado con caída rápida
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 680; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(1400, t); bp.frequency.exponentialRampToValueAtTime(240, t + 0.55);
    const g = ctx.createGain(); this._env(g, t, 0.55, 0.005, 0.75);
    n.connect(bp); bp.connect(g); g.connect(this.sfx); n.start(t); n.stop(t + 0.85);
    // sub: golpe grave
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    const og = ctx.createGain(); this._env(og, t, 0.5, 0.004, 0.6);
    o.connect(og); og.connect(this.sfx); o.start(t); o.stop(t + 0.7);
    // esquirlas
    const n2 = ctx.createBufferSource(); n2.buffer = this.noise;
    const hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 3200;
    const g2 = ctx.createGain(); this._env(g2, t + 0.02, 0.2, 0.002, 0.45);
    n2.connect(hp2); hp2.connect(g2); g2.connect(this.sfx); n2.start(t); n2.stop(t + 0.5);
  }

  // --- recarga metálica (cerrojo) ---
  reload() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [0, 0.085, 0.17].forEach((d, i) => {
      const n = ctx.createBufferSource(); n.buffer = this.noise;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + i * 700; bp.Q.value = 6;
      const g = ctx.createGain(); this._env(g, t + d, 0.22 - i * 0.04, 0.002, 0.07);
      n.connect(bp); bp.connect(g); g.connect(this.sfx); n.start(t + d); n.stop(t + d + 0.14);
    });
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 320;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const og = ctx.createGain(); this._env(og, t + 0.19, 0.1, 0.003, 0.12);
    o.connect(lp); lp.connect(og); og.connect(this.sfx); o.start(t + 0.19); o.stop(t + 0.36);
  }

  setListener(cam) {
    if (!this.ready) return;
    const l = this.ctx.listener;
    const p = cam.getWorldPosition(this._tmpP || (this._tmpP = cam.position.clone()));
    const q = cam.getWorldQuaternion(this._tmpQ || (this._tmpQ = cam.quaternion.clone()));
    const f = new (this._tmpF || (this._tmpF = p.clone())).set(0, 0, -1).applyQuaternion(q);
    const u = new (this._tmpU || (this._tmpU = p.clone())).set(0, 1, 0).applyQuaternion(q);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.setTargetAtTime(u.x, t, 0.02); l.upY.setTargetAtTime(u.y, t, 0.02); l.upZ.setTargetAtTime(u.z, t, 0.02);
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
  }
}
