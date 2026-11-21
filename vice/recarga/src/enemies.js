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
    // Punto 5: ya no se queda plantado a media distancia. Viene, te atraviesa,
    // te quita vida al pasar y sigue de largo hasta salir del corredor.
    this.passed = false;
    this.struck = false;
    this.fireT = 0.75 + Math.random() * 0.8;
    this.chargeT = 0;
    this.lane = (Math.random() * 2 - 1) * 1.15;
    this.kind = 'bot';          // el cerebro de escuadrón sólo reparte entre bots
    this.order = null;          // orden del cerebro de escuadrón
    this.aim = 0;
    this.ai = {
      state: 'engage', stateT: 0,
      fireCd: 0.9 + Math.random() * 0.8,
      meleeCd: 2.6 + Math.random() * 2.2,
      burst: 0, burstT: 0, aimT: 0, focus: 0,
      strafeT: Math.random() * 0.8, strafeDir: Math.random() < 0.5 ? -1 : 1, strafeAmp: 0.7,
      gait: Math.random() * 6.28, moving: 0, velX: 0, lastPx: undefined, sparkT: 1.5
    };
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
    // --- líneas de panel emisivas (brillo tenue en juntas) ---
    const panelMat = new THREE.MeshBasicMaterial({ color: 0x49e6ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i=0;i<6;i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.008, 0.012), panelMat);
      line.position.set(0, -0.1 + i*0.12, 0.19);
      g.add(line);
    }
    // verticales
    for (const sx of [-1,1]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.56, 0.012), panelMat);
      line.position.set(sx*0.25, 0.02, 0.19);
      g.add(line);
    }
    // luz de núcleo (punto cálido)
    this.coreLight = new THREE.PointLight(0xff5a1e, 0.9, 1.8, 2);
    this.coreLight.position.set(0, 0.05, 0.2);
    g.add(this.coreLight);

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
    // pistón hidráulico en el codo derecho
    const pistR = cylMesh(0.018, 0.018, 0.28, C, 8);
    pistR.position.set(0, -0.3, -0.04);
    right.arm.add(pistR);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, -0.42, 0.32);
    right.elbow.add(this.muzzle);

    const left = mkArm(-1);
    this.armL = left.arm;
    this.foreL = left.elbow;
    // pistón hidráulico en el antebrazo izquierdo
    const pistL = cylMesh(0.018, 0.018, 0.25, C, 8);
    pistL.position.set(0, -0.32, -0.04);
    left.arm.add(pistL);
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

  update(dt, t, playerPos, squad) {
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

    // giro suave hacia el jugador (sólo mientras viene de frente)
    if (!this.passed) {
      let da = facing - this.root.rotation.y;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.root.rotation.y += da * Math.min(1, dt * 3.2);
    }

    // ---------------------------------------------------------- IA táctica
    // Recibe órdenes del cerebro de escuadrón (src/ai.js): rol, carril y si
    // el jugador está recargando. Si no hay cerebro (jefe/suelto), se comporta
    // como asalto agresivo.
    const ai = this.ai;
    const ord = this.order || { role: 'assault', lane: this.lane, pressure: 0 };
    const role = ord.role || 'assault';
    const pressure = ord.pressure || 0;

    // velocidad lateral del jugador → adelanta el punto de mira
    if (ai.lastPx === undefined) ai.lastPx = px;
    const pvx = (px - ai.lastPx) / Math.max(0.001, dt);
    ai.lastPx = px;
    ai.velX += (Math.max(-6, Math.min(6, pvx)) - ai.velX) * Math.min(1, dt * 5);

    if (this.stagger > 0) this.stagger -= dt;
    ai.fireCd -= dt; ai.meleeCd -= dt; ai.strafeT -= dt; ai.stateT -= dt; ai.sparkT -= dt;

    const hpK = this.hp / this.maxHp;
    let range = role === 'suppress' ? 9.2 : (role === 'flank' ? 5.6 : 4.2);
    if (hpK < 0.45) range += 2.4;      // tocado: no se te echa encima
    if (pressure) range -= 1.4;        // recargando: aprieta

    let mx = 0, mz = 0, speed = 0;
    let aiming = true;

    switch (ai.state) {
      case 'charge': {
        // embestida: acelera en línea recta y prepara el zarpazo
        speed = 3.5; aiming = false;
        mx = dx / Math.max(0.001, dist); mz = dz / Math.max(0.001, dist);
        if (dist < 2.3) { ai.state = 'windup'; ai.stateT = 0.55; }
        break;
      }
      case 'windup': {
        // Telegrafiado: se planta, levanta el brazo y el ojo se enciende.
        // Si te mueves de lado en ese medio segundo, FALLA.
        speed = 0; aiming = false;
        this.armR.rotation.x += (-2.0 - this.armR.rotation.x) * Math.min(1, dt * 9);
        this.armL.rotation.x += (-0.7 - this.armL.rotation.x) * Math.min(1, dt * 7);
        if (ai.stateT <= 0) {
          const aligned = Math.abs(px - this.root.position.x) < 0.95 && dist < 2.9;
          ai.state = 'recover'; ai.stateT = 0.85; ai.meleeCd = 3.0 + Math.random() * 1.8;
          if (aligned) {
            evs.push({ type: 'melee', dmg: 2, pos: this.root.position.clone() });
            if (this.audio) { try { this.audio.impact(); } catch (e) {} }
          } else {
            evs.push({ type: 'fx', kind: 'whiff', pos: this.root.position.clone().setY(1.15) });
          }
        }
        break;
      }
      case 'recover': {
        // repliegue corto: recupera postura antes de volver a disparar
        speed = 1.2; aiming = false;
        mx = -dx / Math.max(0.001, dist); mz = -dz / Math.max(0.001, dist);
        if (ai.stateT <= 0) ai.state = 'engage';
        break;
      }
      case 'retreat': {
        speed = 2.0;
        mx = -dx / Math.max(0.001, dist); mz = -dz / Math.max(0.001, dist);
        if (ai.stateT <= 0 || dist > 12) ai.state = 'engage';
        break;
      }
      default: {
        // engage: mantiene su distancia, strafea y busca el momento de entrar
        const dist0 = Math.max(0.001, dist);
        const dirX = dx / dist0, dirZ = dz / dist0;
        const errZ = dist - range;
        const along = Math.abs(errZ) > 0.8 ? Math.sign(errZ) * 1.9 : 0;
        mx = dirX * along; mz = dirZ * along;
        if (ai.strafeT <= 0) {
          ai.strafeT = 0.6 + Math.random() * 1.1;
          ai.strafeDir = Math.random() < 0.5 ? -1 : 1;
          ai.strafeAmp = 0.55 + Math.random() * 0.5;
        }
        const laneErr = (ord.lane === undefined ? this.lane : ord.lane) - this.root.position.x;
        mx += laneErr * 0.9 + ai.strafeDir * ai.strafeAmp;
        speed = 1.55 + (pressure ? 0.55 : 0) + (hpK < 0.4 ? -0.25 : 0);
        if (role === 'assault' && ai.meleeCd <= 0 && dist < 6.5 && Math.random() < dt * 1.7) {
          ai.state = 'charge';
        }
        if (role === 'suppress' && hpK < 0.35 && dist < 7 && Math.random() < dt * 0.9) {
          ai.state = 'retreat'; ai.stateT = 1.8;
        }
      }
    }

    // separación: los androides no se apilan en el mismo carril
    if (Array.isArray(squad)) {
      for (const o of squad) {
        if (o === this || o.kind !== 'bot' || o.dead || o.state === 'dying') continue;
        const ox = this.root.position.x - o.root.position.x;
        const oz = this.root.position.z - o.root.position.z;
        const d2 = ox * ox + oz * oz;
        if (d2 > 0.0001 && d2 < 2.6) {
          const d = Math.sqrt(d2), push = (1.62 - d) / 1.62;
          mx += (ox / d) * push * 1.5;
          mz += (oz / d) * push * 1.0;
        }
      }
    }

    const mlen = Math.hypot(mx, mz);
    if (mlen > 0.001 && speed > 0) {
      this.root.position.x += (mx / mlen) * speed * dt;
      this.root.position.z += (mz / mlen) * speed * dt;
      ai.gait += dt * (5.0 + speed * 1.6);
      ai.moving += (Math.min(1, mlen) - ai.moving) * Math.min(1, dt * 8);
    } else {
      ai.moving += (0 - ai.moving) * Math.min(1, dt * 8);
    }

    // no se mete dentro del jugador si no está embistiendo
    if (ai.state !== 'charge' && ai.state !== 'windup' && dist < 1.7) {
      this.root.position.z -= 1.6 * dt;
    }

    this.root.position.x = Math.max(-4.4, Math.min(4.4, this.root.position.x));
    this.root.position.y = 1.42;

    // ---- animación
    const mv = Math.min(1, ai.moving);
    const stride = mv * (ai.state === 'charge' ? 0.62 : 0.44);
    const s = Math.sin(ai.gait), c = Math.cos(ai.gait);
    this.hipL.rotation.x = s * stride;
    this.hipR.rotation.x = -s * stride;
    this.kneeL.rotation.x = Math.max(0, -s) * stride * 1.2 + 0.06;
    this.kneeR.rotation.x = Math.max(0, s) * stride * 1.2 + 0.06;
    this.ankleL.rotation.x = -this.kneeL.rotation.x * 0.4;
    this.ankleR.rotation.x = -this.kneeR.rotation.x * 0.4;
    // torso: se inclina al correr, se yergue al disparar
    this.root.rotation.x = -0.10 * (ai.state === 'charge' ? 1.6 : mv * 0.7);

    // brazo-cañón: apunta al pecho del jugador (pitch real), no al aire
    if (aiming) {
      const pitch = Math.atan2(1.18 - 1.42, Math.max(0.8, dist));
      this.aim += (pitch - this.aim) * Math.min(1, dt * 6);
      this.armR.rotation.x = -0.12 + this.aim;
      this.armR.rotation.z = -0.06;
      this.armL.rotation.x = s * 0.22;
    }

    // cabeza: escaneo + seguimiento
    this.head.rotation.y = Math.sin(t * 1.4) * 0.10;
    this.head.rotation.x = -0.04 + Math.sin(t * 2.7) * 0.02;

    // pulso del ojo y del núcleo (más vivo cuanto más tocado)
    const hurt = 1 + (1 - hpK) * 0.8;
    this.mats.eye.emissiveIntensity = (2.6 + Math.sin(t * 6) * 0.7) * hurt;
    this.mats.core.emissiveIntensity = 1.9 + Math.sin(t * 3.4) * 0.5;

    // chispas de avería cuando está malherido
    if (hpK < 0.4 && ai.sparkT <= 0) {
      ai.sparkT = 0.5 + Math.random() * 0.9;
      evs.push({ type: 'fx', kind: 'damage', pos: this.root.position.clone().setY(1.25 + Math.random() * 0.4) });
    }

    // ---- fuego: telegrafía → ráfaga de 3 → corrige puntería
    if (aiming && dist < 19 && dist > 2.1) {
      if (ai.burst > 0) {
        ai.burstT -= dt;
        if (ai.burstT <= 0) {
          ai.burst--; ai.burstT = 0.15;
          const from = _v.setFromMatrixPosition(this.muzzle.matrixWorld).clone();
          const lead = dist / 22;
          const spread = 0.62 * (1 - ai.focus * 0.55) + (ai.moving > 0.5 ? 0.12 : 0);
          const target = _v2.set(
            px + ai.velX * lead * 0.7 + (Math.random() - 0.5) * spread,
            1.30 + (Math.random() - 0.5) * (0.34 + spread),
            pz + 0.15
          );
          evs.push({ type: 'shoot', from, dir: target.sub(from).normalize() });
          if (this.audio) { try { this.audio.impact(); } catch (e) {} }
        }
      } else if (ai.aimT > 0) {
        ai.aimT -= dt;
        this.mats.eye.emissiveIntensity = 5.5 + Math.sin(t * 45) * 1.6;
        if (this.eyeGlow) this.eyeGlow.scale.setScalar(0.62 + (0.42 - ai.aimT) * 1.7);
        if (ai.aimT <= 0) {
          ai.burst = 3; ai.burstT = 0;
          ai.fireCd = 1.5 + Math.random() * 0.9;
          ai.focus = Math.min(1, ai.focus + 0.32 + (pressure ? 0.22 : 0));
        }
      } else if (ai.fireCd <= 0) {
        ai.aimT = 0.42;   // telegrafiado: el ojo se enciende antes del primer tiro
      }
    } else if (this.eyeGlow) {
      this.eyeGlow.scale.setScalar(0.62);
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
      this.fireT = 1.15 + Math.random() * 0.5;
      this.chargeT = 0;
      this.root.updateMatrixWorld(true);
      const from = new THREE.Vector3(0, 0, 0.42).applyMatrix4(this.root.matrixWorld);
      // mismo error que el robot: apuntaba detrás del jugador
      const aim = _v2.set(playerPos.x + (Math.random() - 0.5) * 0.7, 1.3 + (Math.random() - 0.5) * 0.4, playerPos.z + 0.1);
      const dir = aim.sub(from).normalize();
      evs.push({ type: 'shoot', from, dir });
      if (this.audio) { try { this.audio.impact(); } catch (e) {} }
    }
    return evs;
  }

  dispose() { this.scene.remove(this.root); }
}
