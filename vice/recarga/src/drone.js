import * as THREE from 'three';
import { glowSprite } from './textures.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

function plateMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xd9dee6, metalness: 0.35, roughness: 0.34, envMapIntensity: 1.5,
    emissive: 0xffffff, emissiveIntensity: 0
  });
}
function darkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x232a33, metalness: 0.92, roughness: 0.38, envMapIntensity: 1.2 });
}

export class Drone {
  constructor(scene, audio, shared, opts = {}) {
    this.size = opts.size || 1;
    this.scene = scene;
    this.audio = audio;
    this.shared = shared;
    this.phase = Math.random() * Math.PI * 2;
    this.id = 'd' + (Drone.seq = (Drone.seq || 0) + 1);

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.plateMat = plateMaterial();
    this.darkMat = darkMaterial();
    this.visorMat = new THREE.MeshBasicMaterial({ color: 0xff2f6e });
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xffd0dc });

    // núcleo
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 2), this.darkMat);
    core.castShadow = true;
    this.body.add(core);
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.017, 6, 32), this.darkMat);
    cage.rotation.x = Math.PI / 2; this.body.add(cage);
    const cage2 = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.017, 6, 32), this.darkMat);
    cage2.rotation.y = Math.PI / 2; this.body.add(cage2);

    // placas de blindaje (4 gajos)
    this.shells = new THREE.Group();
    this.body.add(this.shells);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.315, 18, 12, a - 0.34, 0.68, 0.42, 1.5),
        this.plateMat
      );
      shell.castShadow = true;
      this.shells.add(shell);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.30), this.darkMat);
      lip.position.set(Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3);
      lip.rotation.y = a;
      this.shells.add(lip);
    }

    // visor
    const visor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.30, 0.30, 0.075, 26, 1, true, -0.75, 1.5),
      this.visorMat
    );
    visor.position.y = 0.045;
    visor.rotation.y = Math.PI;
    this.body.add(visor);
    this.visor = visor;

    // ojo / núcleo luminoso
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 12), this.coreMat);
    this.eye.position.set(0, 0.03, 0.3);
    this.body.add(this.eye);
    const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: shared.glow, color: 0xff4d7f, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    eyeGlow.scale.set(0.62, 0.62, 1);
    eyeGlow.position.copy(this.eye.position);
    this.body.add(eyeGlow);
    this.eyeGlow = eyeGlow;

    // anillo de carga (telegraph)
    this.chargeRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.012, 6, 30),
      new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.chargeRing.position.z = 0.36;
    this.body.add(this.chargeRing);

    // brazos
    this.arms = [];
    const armAngles = [0.75, -0.75, Math.PI + 0.75, Math.PI - 0.75];
    armAngles.forEach((a) => {
      const pivot = new THREE.Group();
      pivot.position.set(Math.sin(a) * 0.26, -0.02, Math.cos(a) * 0.26);
      pivot.rotation.y = a;
      this.body.add(pivot);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.22, 4, 8), this.darkMat);
      upper.position.set(0, -0.12, 0);
      upper.castShadow = true;
      pivot.add(upper);
      const joint = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), this.darkMat);
      pivot.add(joint);
      const fore = new THREE.Group();
      fore.position.y = -0.26;
      pivot.add(fore);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.2, 4, 8), this.darkMat);
      lower.position.y = -0.11; lower.castShadow = true;
      fore.add(lower);
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 5), this.plateMat);
      blade.position.y = -0.30; blade.rotation.x = Math.PI;
      blade.castShadow = true;
      fore.add(blade);
      this.arms.push({ pivot, fore, base: a, side: Math.sin(a) > 0 ? 1 : -1 });
    });

    // propulsores
    this.thrusters = [];
    [[0.16, -0.26, 0.1], [-0.16, -0.26, 0.1], [0, -0.26, -0.18]].forEach(([x, y, z]) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 16),
        new THREE.MeshBasicMaterial({ color: 0x5fb8ff, transparent: true, opacity: 0.9 }));
      ring.position.set(x, y, z);
      ring.rotation.x = Math.PI / 2;
      this.body.add(ring);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({
        map: shared.glow, color: 0x3d9bff, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      gl.scale.set(0.28, 0.28, 1); gl.position.set(x, y - 0.02, z);
      this.body.add(gl);
      this.thrusters.push({ ring, gl, ph: Math.random() * 6 });
    });

    // antena
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 4), this.darkMat);
    ant.position.set(0.1, 0.3, -0.05);
    this.body.add(ant);
    this.antTip = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a3c }));
    this.antTip.position.set(0.1, 0.38, -0.05);
    this.body.add(this.antTip);

    // sombra en el suelo (mancha)
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20),
      new THREE.MeshBasicMaterial({ map: shared.blob, color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    scene.add(this.blob);

    scene.add(this.root);

    // estado
    this.hp = opts.hp || 3;
    this.maxHp = this.hp;
    this.state = 'approach';
    this.stateT = 0;
    this.cooldown = 1.2 + Math.random() * 1.8;
    this.radius = 3.3 + Math.random() * 1.2;
    this.angle = Math.atan2(-Math.cos(this.phase) * 4, -Math.sin(this.phase) * 4);
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.baseY = 1.35 + Math.random() * 0.5;
    this.speed = 1.15 + Math.random() * 0.35;
    this.flash = 0;
    this.dead = false;
    this.scale = 0;
    this.spawnT = 0;

    // delante del jugador (-Z es el frente del corredor)
    this.root.position.set(-Math.sin(this.angle) * this.radius, this.baseY + 1.2, -Math.cos(this.angle) * this.radius);
    this.root.scale.setScalar(0.01);

    this.hum = audio ? audio.droneHum(this.id) : null;

    this.wobble = new THREE.Vector3();
  }

  hit(dmg = 1, dir = null) {
    if (this.dead) return false;
    this.hp -= dmg;
    this.flash = 1;
    this.state = this.hp <= 0 ? 'dying' : 'stunned';
    this.stateT = 0;
    if (dir) this.wobble.copy(dir).setY(0).normalize().multiplyScalar(0.28);
    if (this.audio) this.audio.impact();
    return this.hp <= 0;
  }

  whip(dir) {
    if (this.dead) return 'none';
    const parry = this.state === 'telegraph' && this.stateT > 0.35;
    if (parry) {
      this.state = 'stunned'; this.stateT = 0; this.cooldown = 2.2;
      this.flash = 1;
      if (this.audio) this.audio.parry();
      return 'parry';
    }
    this.hit(1, dir);
    if (this.audio) this.audio.impact();
    return 'hit';
  }

  update(dt, t, player) {
    if (this.dead) return null;
    this.stateT += dt;
    const pos = this.root.position;
    const events = [];

    // aparición
    if (this.scale < 1) {
      this.spawnT += dt;
      this.scale = Math.min(1, this.spawnT / 0.55);
      const e = this.scale < 1 ? 1 - Math.pow(1 - this.scale, 3) : 1;
      this.root.scale.setScalar((0.35 + e * 0.65) * this.size);
    }

    // vuelo
    const dx = player.x - pos.x, dz = player.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);

    let moving = 0;
    if (this.state === 'approach' || this.state === 'recover') {
      // riel: deriva lateral acotada, nunca orbita alrededor del jugador
      this.angle += this.strafeDir * dt * 0.06;
      if (this.angle > 0.22) { this.angle = 0.22; this.strafeDir = -1; }
      if (this.angle < -0.22) { this.angle = -0.22; this.strafeDir = 1; }
      const targetR = this.radius;
      if (dist > targetR + 0.5) moving = this.speed;
      else if (dist < targetR - 0.9) moving = -this.speed * 0.7;
      const tx = player.x - Math.sin(this.angle) * targetR;
      const tz = player.z - Math.cos(this.angle) * targetR;
      const mv = new THREE.Vector3(tx - pos.x, 0, tz - pos.z);
      const l = mv.length();
      if (l > 0.05) mv.multiplyScalar((moving || this.speed * 0.35) * dt / l);
      pos.add(mv);
    }

    // cooldown / ataque
    this.cooldown -= dt;
    if (this.state === 'approach' && this.cooldown <= 0 && dist < 5.6) {
      this.state = 'telegraph'; this.stateT = 0;
    }
    if (this.state === 'telegraph') {
      if (this.stateT > 1.35) {
        events.push({ type: 'shoot', from: new THREE.Vector3(pos.x, pos.y + 0.03, pos.z), dir: new THREE.Vector3(Math.sin(toPlayer), -0.06, Math.cos(toPlayer)).normalize() });
        this.state = 'recover'; this.stateT = 0; this.cooldown = 2.4 + Math.random() * 1.8;
        if (this.audio) this.audio.shot();
      }
    }
    if (this.state === 'recover' && this.stateT > 1.4) { this.state = 'approach'; this.stateT = 0; }
    if (this.state === 'stunned' && this.stateT > 0.85) { this.state = 'approach'; this.stateT = 0; }

    // altura
    const hoverY = this.baseY + Math.sin(t * 2.4 + this.phase) * 0.07;
    pos.y += (hoverY - pos.y) * Math.min(1, dt * 3.2);
    // empuje residual
    if (this.wobble.lengthSq() > 1e-5) {
      pos.addScaledVector(this.wobble, dt * 6);
      this.wobble.multiplyScalar(1 - Math.min(1, dt * 7));
    }
    // límites
    pos.x = THREE.MathUtils.clamp(pos.x, -6.1, 6.1);
    pos.z = THREE.MathUtils.clamp(pos.z, -6.1, 6.1);

    // mirar al jugador
    _v.set(player.x, pos.y - 0.05, player.z);
    this.root.lookAt(_v);

    // animación de placas y brazos
    const tele = this.state === 'telegraph';
    const tp = tele ? Math.min(1, this.stateT / 1.35) : 0;
    const stunned = this.state === 'stunned';
    this.shells.rotation.y += dt * (0.5 + tp * 1.8);
    this.shells.position.y = Math.sin(t * 3.1 + this.phase) * 0.008;

    this.arms.forEach((a, i) => {
      const flap = Math.sin(t * (5.2 + i * 0.4) + this.phase) * 0.12;
      const raise = tele ? tp * 1.15 : 0;
      a.pivot.rotation.x = -0.45 + flap + raise * 0.5;
      a.pivot.rotation.z = a.side * (0.55 + flap * 0.6 + raise);
      a.fore.rotation.x = (tele ? -0.4 - tp * 0.9 : -0.15) + Math.sin(t * 6 + i) * 0.08 + (stunned ? 0.9 : 0);
    });

    // visor y núcleo
    const visColor = tele ? new THREE.Color().setHSL(0.03, 1, 0.55 + Math.sin(t * 26) * 0.08)
      : stunned ? new THREE.Color(0.8, 0.35, 0.12)
        : new THREE.Color(0xff2f6e);
    this.visorMat.color.lerp(visColor, Math.min(1, dt * 9));
    this.eyeMatColor = this.coreMat.color.lerp(visColor, Math.min(1, dt * 9));
    const eyeScale = 1 + (tele ? tp * 0.55 : 0) + Math.sin(t * 4) * 0.04;
    this.eye.scale.setScalar(eyeScale);
    this.eyeGlow.scale.setScalar(0.55 + (tele ? tp * 0.7 : 0));
    this.eyeGlow.material.opacity = 0.55 + (tele ? tp * 0.45 : 0);

    // anillo de carga
    this.chargeRing.material.opacity = tele ? 0.35 + tp * 0.6 : 0;
    const rs = tele ? 0.8 + tp * 0.65 : 0.8;
    this.chargeRing.scale.setScalar(rs);
    this.chargeRing.rotation.z += dt * (tele ? 5 : 0.6);

    // propulsores
    this.thrusters.forEach((th, i) => {
      const f = 0.7 + Math.sin(t * 22 + th.ph) * 0.3;
      th.gl.material.opacity = 0.3 + f * 0.35;
      th.gl.scale.setScalar(0.24 + f * 0.1);
      th.ring.material.opacity = 0.5 + f * 0.4;
    });
    this.antTip.material.color.setHex(Math.sin(t * 9 + this.phase) > 0.4 ? 0xff5a3c : 0x331010);

    // flash de daño
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 4.2);
      this.plateMat.emissiveIntensity = this.flash * 2.6;
      this.plateMat.emissive.setHex(0xff7a4a);
    } else if (this.plateMat.emissiveIntensity !== 0) {
      this.plateMat.emissiveIntensity = 0;
    }

    // tambaleo al aturdir
    if (stunned) {
      this.body.rotation.z = Math.sin(this.stateT * 22) * 0.16 * Math.max(0, 1 - this.stateT / 0.9);
      this.body.rotation.x = Math.cos(this.stateT * 17) * 0.1 * Math.max(0, 1 - this.stateT / 0.9);
    } else if (tele) {
      this.body.rotation.z = Math.sin(this.stateT * 40) * 0.012;
      this.body.rotation.x = 0;
    } else {
      this.body.rotation.z *= 0.9;
      this.body.rotation.x *= 0.9;
    }

    // sombra
    this.blob.position.set(pos.x, 0.014, pos.z);
    this.blob.scale.setScalar(0.9 + (this.baseY - pos.y) * 0.3);
    this.blob.material.opacity = 0.42;

    // audio 3D
    if (this.hum) {
      this.hum.pos(pos.x, pos.y, pos.z);
      this.hum.charge(tp);
    }

    if (this.state === 'dying' && this.stateT > 0.05) {
      this.dead = true;
      events.push({ type: 'kill', pos: pos.clone(), id: this.id });
      this.dispose();
    }
    return events;
  }

  dispose() {
    this.root.visible = false;
    this.blob.visible = false;
    if (this.hum) { this.hum.stop(); this.hum = null; }
    setTimeout(() => {
      this.scene.remove(this.root);
      this.scene.remove(this.blob);
      this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }, 60);
  }
}

export function makeDebris(shared, pos, n = 9) {
  const out = [];
  const mat = new THREE.MeshStandardMaterial({ color: 0xc9d3e0, metalness: 0.7, roughness: 0.35, envMapIntensity: 1.2 });
  const matD = new THREE.MeshStandardMaterial({ color: 0x2a313a, metalness: 0.9, roughness: 0.4 });
  for (let i = 0; i < n; i++) {
    const g = Math.random() < 0.5
      ? new THREE.BoxGeometry(0.05 + Math.random() * 0.1, 0.02 + Math.random() * 0.05, 0.04 + Math.random() * 0.12)
      : new THREE.TetrahedronGeometry(0.04 + Math.random() * 0.05);
    const m = new THREE.Mesh(g, Math.random() < 0.5 ? mat : matD);
    m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));
    m.castShadow = true;
    out.push({
      mesh: m,
      vel: new THREE.Vector3((Math.random() - 0.5) * 3.4, Math.random() * 2.6 + 0.6, (Math.random() - 0.5) * 3.4),
      spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
      life: 1.6 + Math.random() * 0.6
    });
  }
  // chispas
  const sparkMat = new THREE.SpriteMaterial({ map: shared.glow, color: 0xffc07a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(sparkMat.clone());
    s.position.copy(pos);
    s.scale.setScalar(0.3 + Math.random() * 0.4);
    out.push({
      mesh: s,
      vel: new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5),
      spin: new THREE.Vector3(), life: 0.28 + Math.random() * 0.25, spark: true
    });
  }
  return out;
}
