// Enemigos terrestres: androide pesado tipo Terminator y cámara láser de pared.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// ------------------------------------------------------------ materiales
let M = null;
function mats() {
  if (M) return M;
  M = {
    armor: new THREE.MeshStandardMaterial({ color: 0x9aa6b4, metalness: 0.95, roughness: 0.34 }),
    armorDark: new THREE.MeshStandardMaterial({ color: 0x3a434f, metalness: 0.9, roughness: 0.45 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe2e9f1, metalness: 1.0, roughness: 0.12 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x11151a, metalness: 0.2, roughness: 0.92 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x6b4a35, metalness: 0.7, roughness: 0.75 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x1a0505, emissive: 0xff2030, emissiveIntensity: 3.4, roughness: 0.3 }),
    core: new THREE.MeshStandardMaterial({ color: 0x2a0a05, emissive: 0xff5a1e, emissiveIntensity: 2.4, roughness: 0.4 }),
    beam: new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
  };
  return M;
}

function boxMesh(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function cylMesh(rt, rb, h, mat, seg = 12) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
}

// halo aditivo: sin post-proceso, el emisivo necesita un sprite para "florecer"
function halo(tex, color, scale) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  s.scale.setScalar(scale);
  return s;
}

// ------------------------------------------------------------ androide
export class GroundBot {
  constructor(scene, audio, shared, opts = {}) {
    this.scene = scene;
    this.audio = audio;
    this.shared = shared;
    const m = mats();

    this.maxHp = this.hp = opts.hp || 4;
    this.isBoss = false;
    this.state = 'walk';
    this.dead = false;
    this.deathT = 0;
    this.flashT = 0;
    this.phase = Math.random() * 6.28;
    this.hold = 5.0 + Math.random() * 2.5;
    this.fireT = 0.75 + Math.random() * 0.8;
    this.chargeT = 0;
    this.lane = (Math.random() * 2 - 1) * 1.15;
    this.hitR = 0.62;   // esfera de impacto a la altura del torso
    this.root = new THREE.Group();
    this.root.name = 'groundbot';
    this.root.position.set(this.lane, 1.42, -22);

    this.mats = {
      armor: m.armor.clone(), armorDark: m.armorDark.clone(),
      chrome: m.chrome.clone(), eye: m.eye.clone(), core: m.core.clone()
    };
    for (const k of Object.keys(this.mats)) {
      this.mats[k].userData.baseEmissive = this.mats[k].emissive ? this.mats[k].emissive.getHex() : 0;
      this.mats[k].userData.baseEmissiveIntensity = this.mats[k].emissiveIntensity || 1;
    }

    this._build();
    scene.add(this.root);
  }

  _build() {
    const A = this.mats.armor, D = this.mats.armorDark, C = this.mats.chrome;
    const g = this.root;

    // --- cadera y torso
    const pelvis = boxMesh(0.46, 0.22, 0.3, D, 0, -0.3, 0);
    g.add(pelvis);
    const torso = boxMesh(0.62, 0.52, 0.36, A, 0, 0.0, 0);
    g.add(torso);
    // placas pectorales
    for (const sx of [-1, 1]) {
      const plate = boxMesh(0.28, 0.34, 0.1, C, sx * 0.15, 0.06, 0.19);
      plate.rotation.z = -sx * 0.05;
      g.add(plate);
      // remaches
      for (let i = 0; i < 3; i++) g.add(boxMesh(0.03, 0.03, 0.03, D, sx * 0.15 + (i - 1) * 0.09, 0.2, 0.25));
    }
    // núcleo central
    const core = cylMesh(0.075, 0.075, 0.06, this.mats.core, 14);
    core.rotation.x = Math.PI / 2;
    core.position.set(0, 0.05, 0.2);
    g.add(core);
    this.core = core;
    // rejillas de refrigeración
    for (let i = 0; i < 4; i++) g.add(boxMesh(0.3, 0.02, 0.05, D, 0, -0.14 + i * 0.045, 0.2));
    // columna expuesta
    for (let i = 0; i < 4; i++) {
      const v = cylMesh(0.035, 0.035, 0.09, C, 8);
      v.position.set(0, -0.24 - i * 0.11, -0.14);
      g.add(v);
    }
    // mochila / radiador
    const pack = boxMesh(0.4, 0.34, 0.16, D, 0, 0.05, -0.26);
    g.add(pack);
    for (const sx of [-1, 1]) {
      const pipe = cylMesh(0.028, 0.028, 0.46, C, 8);
      pipe.position.set(sx * 0.19, 0.05, -0.3);
      g.add(pipe);
    }
    // hombreras
    for (const sx of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), A);
      pad.position.set(sx * 0.36, 0.2, 0);
      pad.rotation.z = sx * 0.3;
      g.add(pad);
      g.add(boxMesh(0.1, 0.16, 0.22, D, sx * 0.42, 0.1, 0));
    }

    // --- cabeza
    const head = new THREE.Group();
    head.position.set(0, 0.38, 0);
    g.add(head);
    this.head = head;
    head.add(cylMesh(0.07, 0.09, 0.12, D, 10)); // cuello
    const skull = boxMesh(0.3, 0.26, 0.3, C, 0, 0.19, 0);
    head.add(skull);
    skull.geometry.translate(0, 0, 0);
    // mandíbula
    const jaw = boxMesh(0.26, 0.1, 0.24, D, 0, 0.05, 0.02);
    head.add(jaw);
    // ojos
    for (const sx of [-1, 1]) {
      const eye = boxMesh(0.07, 0.035, 0.03, this.mats.eye, sx * 0.075, 0.22, 0.152);
      head.add(eye);
    }
    // visera
    head.add(boxMesh(0.24, 0.05, 0.04, D, 0, 0.14, 0.15));
    // antena
    const ant = cylMesh(0.008, 0.008, 0.26, C, 6);
    ant.position.set(0.11, 0.42, -0.06);
    head.add(ant);
    ant.rotation.z = -0.18;

    // --- brazos
    const mkArm = (sx) => {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.4, 0.16, 0);
      g.add(arm);
      const upper = boxMesh(0.14, 0.42, 0.15, A, 0, -0.2, 0);
      arm.add(upper);
      arm.add(boxMesh(0.05, 0.4, 0.05, C, sx * 0.08, -0.2, -0.07));
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.4, 0);
      arm.add(elbow);
      elbow.add(boxMesh(0.13, 0.13, 0.13, D, 0, 0, 0));
      const fore = boxMesh(0.13, 0.38, 0.14, A, 0, -0.2, 0);
      elbow.add(fore);
      return { arm, elbow };
    };
    const right = mkArm(1);
    this.armR = right.arm;
    this.foreR = right.elbow;
    // cañón de plasma en el antebrazo derecho
    const cannon = cylMesh(0.075, 0.085, 0.34, D, 12);
    cannon.rotation.x = Math.PI / 2;
    cannon.position.set(0, -0.42, 0.12);
    right.elbow.add(cannon);
    for (let i = 0; i < 3; i++) {
      const ring = cylMesh(0.088, 0.088, 0.02, this.mats.core, 12);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, -0.42, 0.0 + i * 0.1);
      right.elbow.add(ring);
    }
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, -0.42, 0.32);
    right.elbow.add(this.muzzle);

    const left = mkArm(-1);
    this.armL = left.arm;
    this.foreL = left.elbow;
    // garra izquierda
    for (let i = 0; i < 3; i++) {
      const claw = boxMesh(0.035, 0.16, 0.035, C, (i - 1) * 0.05, -0.44, 0.04);
      claw.rotation.x = 0.25;
      left.elbow.add(claw);
    }
    left.elbow.add(boxMesh(0.1, 0.06, 0.1, D, 0, -0.4, 0));

    // --- piernas
    const mkLeg = (sx) => {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.17, -0.34, 0);
      g.add(hip);
      hip.add(boxMesh(0.2, 0.46, 0.22, A, 0, -0.23, 0));
      hip.add(boxMesh(0.06, 0.4, 0.06, C, sx * 0.09, -0.23, -0.1));
      const knee = new THREE.Group();
      knee.position.set(0, -0.46, 0);
      hip.add(knee);
      knee.add(boxMesh(0.16, 0.14, 0.18, D, 0, 0, 0));
      knee.add(boxMesh(0.16, 0.44, 0.18, A, 0, -0.22, 0));
      // pistón de la espinilla
      const pist = cylMesh(0.022, 0.022, 0.3, C, 8);
      pist.position.set(sx * 0.1, -0.2, -0.11);
      knee.add(pist);
      const ankle = new THREE.Group();
      ankle.position.set(0, -0.44, 0);
      knee.add(ankle);
      ankle.add(boxMesh(0.2, 0.09, 0.3, D, 0, -0.05, 0.07));
      ankle.add(boxMesh(0.22, 0.03, 0.34, C, 0, -0.1, 0.07));
      return { hip, knee, ankle };
    };
    const l = mkLeg(-1), r = mkLeg(1);
    this.hipL = l.hip; this.kneeL = l.knee; this.ankleL = l.ankle;
    this.hipR = r.hip; this.kneeR = r.knee; this.ankleR = r.ankle;

    // --- cables sueltos del cuello
    for (const sx of [-1, 1]) {
      const cab = new THREE.Mesh(new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(sx * 0.12, 0.3, -0.1),
          new THREE.Vector3(sx * 0.2, 0.18, -0.16),
          new THREE.Vector3(sx * 0.16, 0.0, -0.2)
        ]), 8, 0.012, 6, false), M ? M.rubber : mats().rubber);
      g.add(cab);
    }

    // daños / marcas
    g.add(boxMesh(0.1, 0.14, 0.02, mats().rust, 0.2, -0.05, 0.19));
    g.add(boxMesh(0.07, 0.05, 0.02, mats().rust, -0.18, 0.18, 0.19));

    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  }

  hit(dmg) {
    if (this.state === 'dying' || this.dead) return true;
    this.hp -= dmg;
    this.flashT = 0.12;
    this.stagger = 0.18;
    if (this.hp <= 0) {
      this.state = 'dying';
      this.deathT = 0;
      return true;
    }
    return false;
  }

  whip() { return 'hit'; }

  update(dt, t, playerPos) {
    const evs = [];
    if (this.state === 'dying') {
      this.deathT += dt;
      // muerte explosiva: sacudida, sobreiluminación y reventón (nada de volcar despacio)
      const k = Math.min(1, this.deathT / 0.24);
      const j = 1 - k;
      this.root.position.x += (Math.random() - 0.5) * 0.10 * j;
      this.root.position.z += (Math.random() - 0.5) * 0.10 * j;
      this.root.rotation.z = (Math.random() - 0.5) * 0.4 * j;
      this.root.scale.setScalar(1 + k * 0.4);
      this.mats.eye.emissiveIntensity = 3.4 + k * 30;
      this.mats.core.emissiveIntensity = 2.4 + k * 26;
      if (k >= 1) {
        evs.push({ type: 'kill', pos: this.root.position.clone().setY(0.6) });
        this.scene.remove(this.root);
        this.dead = true;
      }
      return evs;
    }

    // flash de impacto
    if (this.flashT > 0) {
      this.flashT -= dt;
      const f = this.flashT > 0 ? 1.6 : 0;
      this.mats.armor.emissive.setHex(0xffffff);
      this.mats.armor.emissiveIntensity = f;
    } else if (this.mats.armor.emissiveIntensity !== 0.0) {
      this.mats.armor.emissiveIntensity = 0.0;
    }

    const px = playerPos.x, pz = playerPos.z;
    const dx = px - this.root.position.x, dz = pz - this.root.position.z;
    const dist = Math.hypot(dx, dz);
    const facing = Math.atan2(dx, dz);

    // giro suave hacia el jugador
    let da = facing - this.root.rotation.y;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    this.root.rotation.y += da * Math.min(1, dt * 3.2);

    // avance decidido (nunca se queda atrás)
    const speed = 1.55 + Math.min(1.1, (this.hp < this.maxHp ? 0.5 : 0));
    let moving = 0;
    if (dist > this.hold) {
      const step = Math.min(speed * dt, dist - this.hold);
      this.root.position.x += (dx / dist) * step * 0.85 + (this.lane - this.root.position.x) * dt * 0.6;
      this.root.position.z += (dz / dist) * step;
      moving = 1;
    } else if (dist < this.hold - 1.4) {
      // retrocede un paso si se le echa encima
      this.root.position.x -= (dx / dist) * speed * dt * 0.5;
      this.root.position.z -= (dz / dist) * speed * dt * 0.5;
      moving = 1;
    }
    // nunca por detrás del jugador
    this.root.position.z = Math.min(this.root.position.z, pz - 2.2);
    this.root.position.x = Math.max(-3.0, Math.min(3.0, this.root.position.x));
    this.root.position.y = 1.42;

    // animación de marcha
    this.phase += dt * (moving ? 5.4 : 1.6);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    this.hipL.rotation.x = s * 0.46 * (moving ? 1 : 0.12);
    this.hipR.rotation.x = -s * 0.46 * (moving ? 1 : 0.12);
    this.kneeL.rotation.x = Math.max(0, -s) * 0.55 + 0.06;
    this.kneeR.rotation.x = Math.max(0, s) * 0.55 + 0.06;
    this.ankleL.rotation.x = -this.kneeL.rotation.x * 0.4;
    this.ankleR.rotation.x = -this.kneeR.rotation.x * 0.4;
    this.armL.rotation.x = s * 0.3;
    this.armR.rotation.x = -s * 0.14;
    // cabeza: escaneo + seguimiento
    this.head.rotation.y = Math.sin(t * 1.4) * 0.12;
    this.head.rotation.x = -0.04 + Math.sin(t * 2.7) * 0.02;

    // pulso del ojo y del núcleo
    const pulse = 2.6 + Math.sin(t * 6) * 0.7;
    this.mats.eye.emissiveIntensity = pulse;
    this.mats.core.emissiveIntensity = 1.9 + Math.sin(t * 3.4) * 0.5;

    // disparo con telegrafiado
    this.fireT -= dt;
    if (this.fireT <= 0 && dist < 18) {
      this.chargeT += dt;
      this.mats.eye.emissiveIntensity = 4 + Math.sin(t * 40) * 1.2;
      if (this.eyeGlow) this.eyeGlow.scale.setScalar(0.55 + this.chargeT * 1.5);
      if (this.chargeT > 0.5) {
        this.chargeT = 0;
        if (this.eyeGlow) this.eyeGlow.scale.setScalar(0.55);
        this.fireT = 1.0 + Math.random() * 0.6;
        // ráfaga de 2
        const from = _v.setFromMatrixPosition(this.muzzle.matrixWorld).clone();
        const target = _v2.set(px + (Math.random() - 0.5) * 0.5, 1.35 + (Math.random() - 0.5) * 0.35, pz + 1.0);
        const dir = target.sub(from).normalize();
        evs.push({ type: 'shoot', from, dir });
        if (this.audio) { try { this.audio.impact(); } catch (e) {} }
      }
    }
    return evs;
  }

  dispose() {
    this.scene.remove(this.root);
  }
}

// ------------------------------------------------------------ cámara láser
export class LaserCam {
  constructor(scene, audio, shared, opts = {}) {
    this.scene = scene;
    this.audio = audio;
    this.maxHp = this.hp = opts.hp || 2;
    this.isBoss = false;
    this.shared = shared;
    this.state = 'idle';
    this.dead = false;
    this.deathT = 0;
    this.flashT = 0;
    this.side = opts.side || (Math.random() < 0.5 ? -1 : 1);
    this.fireT = 1.3 + Math.random() * 0.7;
    this.chargeT = 0;
    this.hitR = 0.46;
    this.root = new THREE.Group();
    this.root.position.set(this.side * 3.35, 2.95, opts.z || -18);
    this.mats = mats();
    this.eyeMat = this.mats.eye.clone();
    this._build();
    scene.add(this.root);
  }

  _build() {
    const m = this.mats;
    const g = this.root;
    // soporte anclado al muro
    const arm = boxMesh(0.16, 0.16, 0.5, m.armorDark, 0, 0, -this.side * 0.28);
    g.add(arm);
    g.add(boxMesh(0.34, 0.34, 0.06, m.armorDark, 0, 0, -this.side * 0.52));
    // carcasa
    const body = boxMesh(0.42, 0.34, 0.62, m.armor, 0, 0, 0);
    g.add(body);
    // aletas disipadoras
    for (let i = 0; i < 3; i++) g.add(boxMesh(0.44, 0.02, 0.5, m.armorDark, 0, 0.12 + i * 0.045, 0));
    // óptica
    const lens = cylMesh(0.11, 0.13, 0.1, m.chrome, 16);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0, 0.33);
    g.add(lens);
    const iris = cylMesh(0.075, 0.075, 0.03, this.eyeMat, 18);
    iris.rotation.x = Math.PI / 2;
    iris.position.set(0, 0, 0.375);
    g.add(iris);
    this.iris = iris;
    // anillo emisivo
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.012, 8, 20), this.eyeMat);
    ring.position.set(0, 0, 0.36);
    g.add(ring);
    // halo del ojo: crece al cargar el disparo
    const eyeGlow = halo(this.shared && this.shared.glow, 0xff2a3a, 0.55);
    eyeGlow.position.set(0, 0, 0.44);
    g.add(eyeGlow);
    this.eyeGlow = eyeGlow;
    // antena y LED de estado
    g.add(boxMesh(0.02, 0.16, 0.02, m.chrome, 0.16, 0.24, -0.1));
    const led = boxMesh(0.04, 0.04, 0.04, m.core, -0.16, 0.19, 0.1);
    g.add(led);
    // haz de puntería
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.sight = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xff2233, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.sight.frustumCulled = false;
    g.add(this.sight);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }

  hit(dmg) {
    if (this.dead || this.state === 'dying') return true;
    this.hp -= dmg;
    this.flashT = 0.1;
    if (this.hp <= 0) {
      this.state = 'dying';
      this.deathT = 0;
      return true;
    }
    return false;
  }

  whip() { return 'hit'; }

  update(dt, t, playerPos) {
    const evs = [];
    if (this.dead) return evs;

    if (this.state === 'dying') {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.55);
      this.root.rotation.z = k * 1.3;
      this.root.position.y = 2.95 - k * 0.35;
      this.eyeMat.emissiveIntensity = Math.max(0, 3.5 * (1 - k * 1.5));
      this.sight.material.opacity = Math.max(0, 0.4 * (1 - k * 2));
      if (k >= 1) {
        evs.push({ type: 'kill', pos: this.root.position.clone() });
        this.scene.remove(this.root);
        this.dead = true;
      }
      return evs;
    }
    if (this.flashT > 0) this.flashT -= dt;

    // el soporte se desliza por el muro hacia el jugador
    this.root.position.z += dt * 1.5;
    this.root.position.z = Math.min(this.root.position.z, playerPos.z - 6.5);

    // mira con su +Z (la óptica) hacia el jugador
    const cdx = playerPos.x - this.root.position.x;
    const cdz = playerPos.z - this.root.position.z;
    const yaw = Math.atan2(cdx, cdz);
    let dy = yaw - this.root.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.root.rotation.y += dy * Math.min(1, dt * 4);
    this.root.rotation.x = 0.18 + Math.atan2(1.5, Math.max(1, Math.hypot(cdx, cdz))) * 0.45;
    // el haz de puntería sale por la óptica
    const p = this.sight.geometry.attributes.position;
    p.setXYZ(0, 0, 0, 0);
    p.setXYZ(1, 0, 0, 26);
    p.needsUpdate = true;
    this.sight.material.opacity = 0.18 + (this.chargeT > 0 ? 0.5 : 0.12) + Math.sin(t * 12) * 0.06;
    this.eyeMat.emissiveIntensity = 2.2 + Math.sin(t * 5) * 0.5 + (this.chargeT > 0 ? 3 : 0);

    this.fireT -= dt;
    if (this.fireT <= 0.55) this.chargeT += dt;
    if (this.fireT <= 0) {
      this.fireT = 1.4 + Math.random() * 0.6;
      this.chargeT = 0;
      this.root.updateMatrixWorld(true);
      const from = new THREE.Vector3(0, 0, 0.42).applyMatrix4(this.root.matrixWorld);
      const aim = _v2.set(playerPos.x + (Math.random() - 0.5) * 0.7, 1.3 + (Math.random() - 0.5) * 0.4, playerPos.z + 1.2);
      const dir = aim.sub(from).normalize();
      evs.push({ type: 'shoot', from, dir });
      if (this.audio) { try { this.audio.impact(); } catch (e) {} }
    }
    return evs;
  }

  dispose() { this.scene.remove(this.root); }
}
