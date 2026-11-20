import * as THREE from 'three';

function lsText(ctx, text, x, y, spacing) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { c, ctx, tex };
}

function radialTex(inner, outer) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.06, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, inner); g.addColorStop(0.55, inner.replace(/[\d.]+\)$/, '0.35)')); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Hud {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    camera.add(this.group);
    this.group.position.set(0, 0, 0);

    // ---- salud ----
    this.hpBars = [];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.012), new THREE.MeshBasicMaterial({ color: 0x0d141c, transparent: true, opacity: 0.75 }));
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.0105), new THREE.MeshBasicMaterial({ color: 0x7fe0ff }));
      bar.position.z = 0.001;
      g.add(bg); g.add(bar);
      const a = (i - (n - 1) / 2) * 0.062;
      g.position.set(a, -0.205 + Math.abs(i - 2) * 0.008, -0.52);
      g.rotation.z = -(i - (n - 1) / 2) * 0.06;
      this.group.add(g);
      this.hpBars.push(bar);
    }

    // ---- munición ----
    this.ammoPips = [];
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.009, 0.038), new THREE.MeshBasicMaterial({ color: 0xffb066 }));
      p.position.set(0.20 + i * 0.014, -0.185, -0.52);
      p.rotation.z = -0.35 + i * 0.02;
      this.group.add(p);
      this.ammoPips.push(p);
    }

    // ---- retícula ----
    const ret = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.0075, 0.0092, 24), new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0012, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    ret.add(ring); ret.add(dot);
    ret.position.set(0, 0, -0.5);
    this.group.add(ret);
    this.ret = ret;

    // ---- marcador de impacto ----
    this.hitMark = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05),
      new THREE.MeshBasicMaterial({ map: (() => {
        const { c, ctx, tex } = makeCanvas(128, 128);
        ctx.strokeStyle = 'rgba(255,240,220,0.95)'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(20, 20); ctx.lineTo(50, 50); ctx.moveTo(108, 20); ctx.lineTo(78, 50);
        ctx.moveTo(20, 108); ctx.lineTo(50, 78); ctx.moveTo(108, 108); ctx.lineTo(78, 78);
        ctx.stroke();
        return tex;
      })(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.hitMark.position.set(0, 0, -0.49);
    this.group.add(this.hitMark);
    this.hitT = 0;

    // ---- panel de estado (izquierda) ----
    const st = makeCanvas(512, 256);
    this.statCanvas = st;
    this.statPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.15),
      new THREE.MeshBasicMaterial({ map: st.tex, transparent: true, opacity: 0.9, depthWrite: false }));
    this.statPlane.position.set(-0.275, 0.125, -0.72);
    this.statPlane.rotation.y = 0.34;
    this.statPlane.scale.setScalar(0.92);
    this.group.add(this.statPlane);
    this._statKey = '';

    // ---- banner ----
    const bn = makeCanvas(1024, 256);
    this.banCanvas = bn;
    this.banPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.23),
      new THREE.MeshBasicMaterial({ map: bn.tex, transparent: true, opacity: 0, depthWrite: false }));
    this.banPlane.position.set(0, 0.055, -0.95);
    this.group.add(this.banPlane);
    this.banT = 0;
    this.banDur = 0;

    // ---- viñeta de daño ----
    this.vig = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0),
      new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,40,60,0.85)', 'rgba(255,0,40,0)'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.vig.position.set(0, 0, -0.42);
    this.group.add(this.vig);
    this.vigT = 0;

    // ---- aviso de recarga ----
    const rl = makeCanvas(512, 128);
    this.reloadCanvas = rl;
    this.reloadPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.11),
      new THREE.MeshBasicMaterial({ map: rl.tex, transparent: true, opacity: 0, depthWrite: false }));
    this.reloadPlane.position.set(0.02, -0.115, -0.5);
    this.group.add(this.reloadPlane);
    this.reloadT = 0;

    this._drawStat(1, 6, 1, 0);
  }

  setHealth(hp, max = 5) {
    this.hpBars.forEach((b, i) => {
      const on = i < hp;
      b.material.color.setHex(on ? (hp <= 2 ? 0xff6b6b : 0x7fe0ff) : 0x1b2531);
    });
  }

  setAmmo(n, spent) {
    this.ammoPips.forEach((p, i) => {
      p.visible = true;
      p.material.color.setHex(i < n ? 0xffb066 : (spent ? 0x40222a : 0x2a3441));
      p.scale.y = i < n ? 1 : 0.62;
    });
  }

  _drawStat(hp, ammo, wave, score) {
    const key = `${hp}|${ammo}|${wave}|${score}`;
    if (key === this._statKey) return;
    this._statKey = key;
    const { ctx, tex, c } = this.statCanvas;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 30px "Helvetica Neue",Arial,sans-serif';
    ctx.fillStyle = 'rgba(143,166,190,0.95)';
    lsText(ctx, 'OLEADA', 8, 46, 4);
    ctx.font = '800 92px "Helvetica Neue",Arial,sans-serif';
    ctx.fillStyle = '#eaf4ff';
    ctx.fillText(String(wave).padStart(2, '0'), 6, 140);
    ctx.font = '600 26px "Helvetica Neue",Arial,sans-serif';
    ctx.fillStyle = 'rgba(255,159,67,0.95)';
    lsText(ctx, 'PUNTOS', 210, 96, 3);
    ctx.font = '700 44px "Helvetica Neue",Arial,sans-serif';
    ctx.fillStyle = '#ffd9a8';
    ctx.fillText(String(score), 208, 142);
    ctx.strokeStyle = 'rgba(61,155,255,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 178); ctx.lineTo(330, 178); ctx.stroke();
    ctx.font = '500 22px "Helvetica Neue",Arial,sans-serif';
    ctx.fillStyle = 'rgba(120,144,168,0.95)';
    lsText(ctx, 'SECTOR 07', 8, 216, 4);
    tex.needsUpdate = true;
  }

  setState(hp, ammo, wave, score) { this._drawStat(hp, ammo, wave, score); }

  banner(title, sub, dur = 2.6) {
    const { ctx, tex, c } = this.banCanvas;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.textAlign = 'center';
    ctx.font = '800 108px "Helvetica Neue",Arial,sans-serif';
    ctx.fillStyle = '#f2f8ff';
    ctx.shadowColor = 'rgba(61,155,255,0.85)'; ctx.shadowBlur = 28;
    ctx.fillText(title, c.width / 2, 132);
    ctx.shadowBlur = 0;
    ctx.font = '500 34px "Helvetica Neue",Arial,sans-serif';
    ctx.fillStyle = 'rgba(255,180,120,0.92)';
    ctx.fillText(sub, c.width / 2, 196);
    ctx.textAlign = 'left';
    tex.needsUpdate = true;
    this.banT = 0; this.banDur = dur;
    this.banPlane.material.opacity = 0.001;
  }

  reloadHint(on) {
    if (on && this.reloadPlane.material.opacity < 0.05) {
      const { ctx, tex, c } = this.reloadCanvas;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.textAlign = 'center';
      ctx.font = '700 40px "Helvetica Neue",Arial,sans-serif';
      ctx.fillStyle = '#ff8f6b';
      ctx.fillText('GOLPE SECO PARA RECARGAR', c.width / 2, 62);
      ctx.font = '500 26px "Helvetica Neue",Arial,sans-serif';
      ctx.fillStyle = 'rgba(255,190,150,0.85)';
      ctx.fillText('aprieta el puño y agita el arma', c.width / 2, 100);
      ctx.textAlign = 'left';
      tex.needsUpdate = true;
      this.reloadT = 1;
    }
    this.reloadOn = on;
  }

  hit() { this.hitT = 0.18; }
  hurt() { this.vigT = 0.55; }

  update(dt) {
    if (this.hitT > 0) {
      this.hitT -= dt;
      const k = Math.max(0, this.hitT / 0.18);
      this.hitMark.material.opacity = k;
      this.hitMark.scale.setScalar(1.15 - k * 0.25);
    } else this.hitMark.material.opacity = 0;

    if (this.banDur > 0) {
      this.banT += dt;
      const k = this.banT / this.banDur;
      const inK = Math.min(1, this.banT / 0.28);
      const outK = Math.max(0, 1 - Math.max(0, k - 0.72) / 0.28);
      this.banPlane.material.opacity = Math.min(inK, outK);
      this.banPlane.position.y = 0.055 + Math.sin(Math.min(1, k) * Math.PI) * 0.006;
      if (k >= 1) { this.banDur = 0; this.banPlane.material.opacity = 0; }
    }

    if (this.vigT > 0) {
      this.vigT -= dt;
      this.vig.material.opacity = Math.max(0, this.vigT / 0.55) * 0.75;
    }

    if (this.reloadOn) {
      this.reloadT = Math.min(1, this.reloadT + dt * 3);
      this.reloadPlane.material.opacity = 0.35 + Math.sin(performance.now() * 0.008) * 0.18;
    } else {
      this.reloadPlane.material.opacity = Math.max(0, this.reloadPlane.material.opacity - dt * 3);
    }
  }
}
