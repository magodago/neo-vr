import * as THREE from 'three';
import { brushedMetal, glowSprite } from './textures.js';

function bevelBox(w, h, d, b = 0.006, curve = 0.008) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + curve, y);
  s.lineTo(x + w - curve, y); s.quadraticCurveTo(x + w, y, x + w, y + curve);
  s.lineTo(x + w, y + h - curve); s.quadraticCurveTo(x + w, y + h, x + w - curve, y + h);
  s.lineTo(x + curve, y + h); s.quadraticCurveTo(x, y + h, x, y + h - curve);
  s.lineTo(x, y + curve); s.quadraticCurveTo(x, y, x + curve, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 2 });
  g.translate(0, 0, -(d - b * 2) / 2);
  g.computeVertexNormals();
  return g;
}

function slashTexture() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.translate(S / 2, S / 2);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 130; i++) {
    const a = -0.95 + Math.random() * 1.9;
    const r0 = S * (0.12 + Math.random() * 0.05);
    const r1 = S * (0.34 + Math.random() * 0.14);
    const alpha = 0.06 + Math.random() * 0.12;
    ctx.strokeStyle = `rgba(${170 + Math.random() * 60},${220 + Math.random() * 35},255,${alpha})`;
    ctx.lineWidth = 0.6 + Math.random() * 3.4;
    ctx.beginPath();
    ctx.arc(0, 0, (r0 + r1) / 2, a - 0.06, a + 0.06);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(0, 0, S * 0.1, 0, 0, S * 0.42);
  g.addColorStop(0, 'rgba(120,200,255,0)');
  g.addColorStop(0.6, 'rgba(170,225,255,0.16)');
  g.addColorStop(1, 'rgba(120,200,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, S * 0.46, 0, 7); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Weapon {
  constructor(camera, audio, shared, opts = {}) {
    this.camera = camera;
    this.audio = audio;
    this.shared = shared;
    this.accent = opts.accent || 0x62c8ff;

    const brush = brushedMetal();
    this.matBody = new THREE.MeshStandardMaterial({ map: brush.map, roughnessMap: brush.roughnessMap, color: 0x2f3640, metalness: 0.95, roughness: 0.34, envMapIntensity: 1.6 });
    this.matSteel = new THREE.MeshStandardMaterial({ map: brush.map, color: 0xb9c4d2, metalness: 1.0, roughness: 0.22, envMapIntensity: 1.9 });
    this.matGlow = new THREE.MeshBasicMaterial({ color: this.accent });
    this.matWarm = new THREE.MeshBasicMaterial({ color: 0xffa64d });

    this.root = new THREE.Group();
    // posición de empuñadura en espacio de cámara
    this.root.position.set(0.20, -0.185, -0.40);
    this.root.rotation.set(0.03, -0.10, 0.02);
    this.root.scale.setScalar(0.86);
    camera.add(this.root);

    this.gun = new THREE.Group();
    this.root.add(this.gun);

    // corredera
    const slide = new THREE.Mesh(bevelBox(0.072, 0.078, 0.30, 0.008, 0.012), this.matBody);
    slide.position.set(0, 0, -0.03);
    slide.castShadow = true;
    this.gun.add(slide);
    this.slide = slide;

    // cañón / guardamanos con ranuras
    const shroud = new THREE.Mesh(bevelBox(0.058, 0.058, 0.20, 0.006, 0.02), this.matSteel);
    shroud.position.set(0, -0.012, -0.20);
    this.gun.add(shroud);
    for (let i = 0; i < 3; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.014, 0.028), this.matBody);
      slot.position.set(0, 0.012, -0.15 - i * 0.05);
      this.gun.add(slot);
    }
    // boca
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.023, 0.05, 16), this.matSteel);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, -0.012, -0.315);
    this.gun.add(muzzle);
    const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.005, 6, 18), this.matGlow);
    muzzleRing.position.set(0, -0.012, -0.338);
    this.gun.add(muzzleRing);

    // empuñadura
    const grip = new THREE.Mesh(bevelBox(0.058, 0.155, 0.075, 0.008, 0.02), this.matBody);
    grip.position.set(0, -0.105, 0.075);
    grip.rotation.x = -0.22;
    grip.castShadow = true;
    this.gun.add(grip);
    // ventana del cargador (se enciende al vaciarse)
    this.magWin = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.075, 0.006), new THREE.MeshBasicMaterial({ color: 0x1a2129 }));
    this.magWin.position.set(0, -0.10, 0.036);
    this.magWin.rotation.x = -0.22;
    this.gun.add(this.magWin);

    // guardamonte
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.007, 6, 18, Math.PI * 1.35), this.matSteel);
    guard.rotation.set(Math.PI / 2, 0, 0.4);
    guard.position.set(0, -0.075, -0.015);
    this.gun.add(guard);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.008), this.matSteel);
    trigger.position.set(0, -0.055, -0.028);
    this.gun.add(trigger);

    // miras
    const rear = new THREE.Mesh(bevelBox(0.05, 0.016, 0.02, 0.002), this.matSteel);
    rear.position.set(0, 0.048, 0.10);
    this.gun.add(rear);
    const front = new THREE.Mesh(bevelBox(0.012, 0.02, 0.012, 0.002), this.matGlow);
    front.position.set(0, 0.048, -0.30);
    this.gun.add(front);

    // líneas de neón laterales
    const lineL = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.008, 0.16), this.matGlow);
    lineL.position.set(0.037, 0.004, -0.10);
    this.gun.add(lineL);
    const lineR = lineL.clone(); lineR.position.x = -0.037;
    this.gun.add(lineR);

    // sello flotante
    const seal = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 6, 20), this.matGlow);
    seal.position.set(0, 0.02, 0.16);
    seal.rotation.x = Math.PI / 2;
    this.gun.add(seal);

    // luz de boca
    this.muzzleLight = new THREE.PointLight(0xa9dcff, 0, 6, 2);
    this.muzzleLight.position.set(0, 0, -0.34);
    this.gun.add(this.muzzleLight);

    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: shared.glow, color: 0xcfe9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.flash.scale.set(0.42, 0.42, 1);
    this.flash.position.set(0, -0.012, -0.36);
    this.gun.add(this.flash);

    // hoja de latigazo
    this.slash = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05),
      new THREE.MeshBasicMaterial({ map: slashTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.slash.position.set(0.02, -0.02, -0.62);
    camera.add(this.slash);

    // estado
    this.basePos = new THREE.Vector3(0.185, -0.165, -0.34);
    this.baseRot = new THREE.Euler(0.03, -0.10, 0.02);
    this.spent = false;
    this.kick = 0;
    this.sway = new THREE.Vector2();
    this.bobT = 0;
    this.whipT = -1;
    this.whipDir = 1;
    this.whipDur = 0.24;
    this.flashT = 0;
    this.pendingFlash = false;
    this.slideBack = 0;
    this._lookPrev = new THREE.Vector2();
  }

  setSpent(v) {
    this.spent = v;
    this.magWin.material.color.setHex(v ? 0xff5a3c : 0x1a2129);
    this.matGlow.color.setHex(v ? 0xff5a3c : this.accent);
    this.slideBack = v ? 1 : 0;
  }

  fire() {
    if (this.audio) this.audio.shot();
    this.kick = 1;
    this.flashT = 0.055;
    this.pendingFlash = true;
    this.slideBack = 1;
    setTimeout(() => { if (this.spent) return; this.slideBack = 0; }, 55);
  }

  dryFire() { if (this.audio) this.audio.dry(); this.kick = 0.25; }

  whip(dir = 1) {
    this.whipT = 0;
    this.whipDir = dir;
    this.whipDur = 0.22 + Math.random() * 0.03;
    if (this.audio) this.audio.whip();
    this.slash.material.opacity = 0.95;
    this.slash.rotation.z = dir > 0 ? -0.5 : 0.5;
    this.slash.scale.setScalar(0.85);
  }

  muzzleWorld(out = new THREE.Vector3()) {
    return this.gun.localToWorld(out.set(0, -0.012, -0.34));
  }

  // Reparenta el arma a un espacio XR (grip del mando) con offset propio
  mount(parent, pos, rot) {
    parent.add(this.root);
    parent.add(this.slash);
    this.basePos.copy(pos);
    this.baseRot.copy(rot);
    this.root.position.copy(this.basePos);
    this.root.rotation.copy(this.baseRot);
  }

  update(dt, t, moveVec, dLook) {
    // balanceo
    const speed = Math.hypot(moveVec.x, moveVec.z);
    this.bobT += dt * (2.2 + speed * 4.2);
    const bobX = Math.sin(this.bobT) * 0.006 * (0.4 + speed);
    const bobY = Math.abs(Math.cos(this.bobT)) * 0.008 * (0.4 + speed);

    this.sway.x += (-dLook.x * 0.02 - this.sway.x) * Math.min(1, dt * 7);
    this.sway.y += (dLook.y * 0.02 - this.sway.y) * Math.min(1, dt * 7);

    const kickZ = this.kick * 0.075;
    const kickR = this.kick * 0.22;
    const bx = this.basePos.x, by = this.basePos.y, bz = this.basePos.z;
    this.root.position.set(bx - this.sway.x + bobX, by + bobY + this.sway.y * 0.6, bz + kickZ);
    this.root.rotation.set(this.baseRot.x + this.kick * 0.16 + this.sway.y, this.baseRot.y + this.sway.x * 0.7, this.baseRot.z + this.kick * 0.03);
    this.kick *= Math.max(0, 1 - dt * 11);

    // corredera
    this.slide.position.z = -0.03 + this.slideBack * 0.026;

    // fogonazo
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / 0.055);
      this.flash.material.opacity = k;
      this.flash.scale.setScalar(0.32 + (1 - k) * 0.3);
      this.muzzleLight.intensity = k * 26;
      if (this.pendingFlash && this.audio) this.pendingFlash = false;
    } else {
      this.flash.material.opacity = 0;
      this.muzzleLight.intensity = 0;
    }

    // desenvainado / golpe
    if (this.whipT >= 0) {
      this.whipT += dt;
      const k = Math.min(1, this.whipT / this.whipDur);
      const ease = k < 0.45 ? (k / 0.45) : 1 - (k - 0.45) / 0.55;
      this.root.rotation.z = this.baseRot.z + this.whipDir * -0.95 * ease;
      this.root.rotation.y = this.baseRot.y + this.whipDir * 0.55 * ease;
      this.root.position.x = this.basePos.x + this.whipDir * 0.04 * ease;
      this.root.position.z = this.basePos.z - 0.10 * ease;

      this.slash.material.opacity = Math.max(0, 0.95 * (1 - k * k));
      this.slash.rotation.z = (this.whipDir > 0 ? -0.5 : 0.5) + this.whipDir * k * 1.5;
      this.slash.scale.setScalar(0.85 + k * 0.5);
      this.slash.position.x = 0.02 + this.whipDir * k * 0.16;
      if (k >= 1) { this.whipT = -1; this.slash.material.opacity = 0; }
    }
  }
}
