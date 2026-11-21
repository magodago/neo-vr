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
    // nivel de campaña y oleada dentro del nivel (los fija game.setLevel)
    this.levelN = 1;
    this.levelWave = 0;
    this.levelTotal = 1;
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
    // placa oscura detrás del cargador: los pips se leen sobre cualquier escenario
    this.ammoPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.158, 0.042),
      new THREE.MeshBasicMaterial({ color: 0x080d14, transparent: true, opacity: 0.55, depthWrite: false })
    );
    this.ammoPlate.position.set(0.154, -0.172, -0.526);
    this.ammoPlate.visible = false;
    this.group.add(this.ammoPlate);

    this.ammoPips = [];
    this.ammoSize = 8;
    for (let i = 0; i < 14; i++) {          // 14 = cargador máximo del arsenal
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.0072, 0.034), new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true }));
      p.position.set(0.088 + i * 0.0105, -0.172, -0.52);
      p.rotation.z = -0.35 + i * 0.012;
      p.visible = false;
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

    // ---- panel de estado (abajo, centrado bajo la mirada) ----
    // Antes vivía arriba a la izquierda (y=+0.125, x=-0.275): había que levantar
    // la vista y estorbaba. Ahora va pegado al borde inferior del campo de visión.
    const st = makeCanvas(640, 168);
    this.statCanvas = st;
    // punto 7: agrandado y acercado — entra en el campo de visión sin mover la cabeza
    this.statPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.0805),
      new THREE.MeshBasicMaterial({ map: st.tex, transparent: true, opacity: 0.95, depthWrite: false }));
    this.statPlane.position.set(0, -0.252, -0.46);
    this.group.add(this.statPlane);
    this._statKey = '';

    // ---- banner ----
    const bn = makeCanvas(1024, 256);
    this.banCanvas = bn;
    this.banPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.18),
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

    // ---- arsenal (justo encima del marcador, sin subir la vista) ----
    const wq = makeCanvas(640, 96);
    this.weapCanvas = wq;
    this.weapPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.063),
      new THREE.MeshBasicMaterial({ map: wq.tex, transparent: true, opacity: 0, depthWrite: false }));
    this.weapPlane.position.set(0, -0.145, -0.46);
    this.group.add(this.weapPlane);
    this._weapKey = '';

    this._drawStat(1, 6, 1, 0);
  }

  // name: 'RÁFAGA'… · tier 1..3 · frac 1→0 tiempo restante
  setWeapon(name, tier, frac) {
    const key = `${name}|${tier}|${Math.round(frac * 40)}`;
    if (key === this._weapKey) return;
    this._weapKey = key;
    const { ctx, tex, c } = this.weapCanvas;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    if (!tier) { tex.needsUpdate = true; this.weapPlane.material.opacity = 0; return; }

    const cols = ['#49e6ff', '#5cff9d', '#ff9f43', '#ff4fd8'];
    const col = cols[Math.min(3, tier)];

    ctx.textAlign = 'center';
    ctx.font = '800 34px "Helvetica Neue",Arial,sans-serif';
    ctx.fillStyle = col;
    ctx.shadowColor = col; ctx.shadowBlur = 16;
    ctx.fillText(name, W / 2, 40);
    ctx.shadowBlur = 0;

    // barra de duración
    const bw = 300, bx = (W - bw) / 2, by = 56;
    ctx.fillStyle = 'rgba(12,20,30,0.72)';
    ctx.fillRect(bx, by, bw, 10);
    ctx.fillStyle = col;
    ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, frac)), 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, 10);

    // nivel
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(W / 2 - 44 + i * 44, 84, 6, 0, Math.PI * 2);
      ctx.fillStyle = i < tier ? col : 'rgba(120,150,180,0.30)';
      ctx.fill();
    }
    ctx.textAlign = 'left';
    tex.needsUpdate = true;
    this.weapPlane.material.opacity = 0.98;
  }

  setHealth(hp, max = 5) {
    this.hpBars.forEach((b, i) => {
      const on = i < hp;
      b.material.color.setHex(on ? (hp <= 2 ? 0xff6b6b : 0x7fe0ff) : 0x1b2531);
    });
  }

  // n balas dentro · reloading tiñe los pips apagados mientras se cambia el cargador
  setAmmo(n = 0, reloading = false) {
    this.reloadingNow = !!reloading;
    if (this.ammoPlate) this.ammoPlate.visible = this.ammoSize > 0;
    const low = n <= 2;
    this.ammoPips.forEach((p, i) => {
      const slot = i < this.ammoSize;
      p.visible = slot;
      if (!slot) return;
      const on = i < n;
      p.material.opacity = on ? 1 : 0.42;
      p.material.color.setHex(reloading ? 0x5d7186 : on ? (low ? 0xff5a3c : 0xffb066) : 0x2a3644);
    });
  }

  _drawStat(hp, ammo, wave, score, size = 8, mode = '') {
    const key = `${hp}|${ammo}|${size}|${wave}|${score}|${mode}|${this.levelN}|${this.levelWave}|${this.levelTotal}`;
    if (key === this._statKey) return;
    this._statKey = key;
    const { ctx, tex, c } = this.statCanvas;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    // banda con degradado: se apoya en el borde inferior y no tapa la acción
    // halo tenue solo tras el texto: sin placa, no tapa la accion
    const bg = ctx.createRadialGradient(W / 2, H * 0.58, 10, W / 2, H * 0.58, W * 0.5);
    bg.addColorStop(0, 'rgba(6,11,18,0.55)');
    bg.addColorStop(0.7, 'rgba(6,11,18,0.22)');
    bg.addColorStop(1, 'rgba(6,11,18,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // piezas tipográficas en una sola línea, centradas
    const parts = [
      { t: `NIVEL ${this.levelN} · OLEADA`, font: '700 30px "Helvetica Neue",Arial,sans-serif', col: 'rgba(150,178,205,0.95)', ls: 6, gap: 8 },
      { t: String(Math.max(1, wave)).padStart(2, '0') + '/' + String(Math.max(1, this.levelTotal)).padStart(2, '0'), font: '800 54px "Helvetica Neue",Arial,sans-serif', col: '#eaf4ff', ls: 0, gap: 30 },
      { t: '·', font: '700 40px "Helvetica Neue",Arial,sans-serif', col: 'rgba(61,155,255,0.85)', ls: 0, gap: 16 },
      { t: String(score).replace(/\B(?=(\d{3})+(?!\d))/g, ' '), font: '800 54px "Helvetica Neue",Arial,sans-serif', col: '#ffd9a8', ls: 0, gap: 10 },
      { t: 'PTS', font: '700 26px "Helvetica Neue",Arial,sans-serif', col: 'rgba(255,159,67,0.9)', ls: 5, gap: 26 },
      { t: '·', font: '700 40px "Helvetica Neue",Arial,sans-serif', col: 'rgba(61,155,255,0.85)', ls: 0, gap: 16 },
      { t: String(ammo).padStart(2, '0') + '/' + String(size).padStart(2, '0'), font: '800 46px "Helvetica Neue",Arial,sans-serif', col: ammo <= 2 ? '#ff6b6b' : '#9fe8ff', ls: 1, gap: 14 },
      { t: mode, font: '700 24px "Helvetica Neue",Arial,sans-serif', col: 'rgba(150,178,205,0.95)', ls: 4, gap: 0 }
    ];
    let total = 0;
    for (const p of parts) {
      ctx.font = p.font;
      let w = 0;
      for (const ch of p.t) w += ctx.measureText(ch).width + p.ls;
      p.w = Math.max(0, w - p.ls);
      total += p.w + p.gap;
    }
    // la línea nunca se recorta: si no cabe, se escala entera
    const maxW = W - 20;
    const s = total > maxW ? maxW / total : 1;
    ctx.save();
    ctx.translate(W / 2, H * 0.58);
    ctx.scale(s, s);
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    let x = -total / 2;
    for (const p of parts) {
      ctx.font = p.font;
      ctx.fillStyle = p.col;
      let cx = x;
      for (const ch of p.t) { ctx.fillText(ch, cx, 0); cx += ctx.measureText(ch).width + p.ls; }
      x += p.w + p.gap;
    }
    ctx.restore();
    tex.needsUpdate = true;
  }

  // nivel y oleada dentro del nivel; fuerza repintado de la línea de estado
  setLevel(n, wave = this.levelWave, total = this.levelTotal) {
    this.levelN = n;
    this.levelWave = wave;
    this.levelTotal = total;
    this._statKey = '';
  }

  setState(hp, ammo, wave, score, size = this.ammoSize, mode = this.modeName || '') {
    this.ammoSize = size;
    this.modeName = mode;
    this._drawStat(hp, ammo, wave, score, size, mode);
    this.setAmmo(ammo, this.reloadingNow);
  }

  // barra fina de recarga: k = 1 al empezar, 0 al terminar
  reloadBar(k = 0) {
    const { ctx, tex, c } = this.reloadCanvas;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = '700 34px "Helvetica Neue",Arial,sans-serif';
    ctx.fillStyle = '#9fe8ff';
    ctx.shadowColor = 'rgba(61,155,255,0.8)'; ctx.shadowBlur = 14;
    ctx.fillText('RECARGANDO', W / 2, 46);
    ctx.shadowBlur = 0;
    const bw = 340, bx = (W - bw) / 2, by = 66;
    ctx.fillStyle = 'rgba(10,18,28,0.8)';
    ctx.fillRect(bx, by, bw, 12);
    ctx.fillStyle = '#49e6ff';
    ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, 1 - k)), 12);
    ctx.strokeStyle = 'rgba(159,232,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, 12);
    ctx.textAlign = 'left';
    tex.needsUpdate = true;
    this.reloadOn = true;
    this.barOn = true;
    this.reloadT = 1;
  }

  setFireMode(name, id) { this.modeName = name; this.modeId = id; this._statKey = ''; }

  banner(title, sub, dur = 2.6) {
    const { ctx, tex, c } = this.banCanvas;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.textAlign = 'center';
    // ajusta el cuerpo para que títulos largos (CAMPAÑA COMPLETADA) no se recorten
    const maxW = c.width - 56;
    let size = 108;
    ctx.font = `800 ${size}px "Helvetica Neue",Arial,sans-serif`;
    while (size > 40 && ctx.measureText(title).width > maxW) {
      size -= 4;
      ctx.font = `800 ${size}px "Helvetica Neue",Arial,sans-serif`;
    }
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
    if (!on) {
      this.barOn = false;
      this.reloadT = 0;
    }
    if (on && !this.barOn && this.reloadPlane.material.opacity < 0.05) {
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

  hit(hard = false) { this.hitT = hard ? 0.3 : 0.18; this.hitHard = hard; }
  hurt() { this.vigT = 0.55; }

  update(dt) {
    if (this.hitT > 0) {
      this.hitT -= dt;
      const k = Math.max(0, this.hitT / (this.hitHard ? 0.3 : 0.18));
      this.hitMark.material.opacity = k;
      this.hitMark.scale.setScalar((this.hitHard ? 1.45 : 1.15) - k * 0.25);
      this.hitMark.material.color.setHex(this.hitHard ? 0xff5a3c : 0xe8f4ff);
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
