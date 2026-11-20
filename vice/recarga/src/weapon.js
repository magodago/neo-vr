// Arma: pistola pesada futurista, empuñadura vertical y cañón horizontal.
// El modelo se construye con el cañón en -Z y la empuñadura en -Y, que es
// exactamente el sistema del grip del mando de Quest: al montarlo sin rotación
// la empuñadura queda en la mano y el cañón apunta hacia delante.
import * as THREE from 'three';

const GUNMETAL = 0x2b313b;
const DARK = 0x0f1218;

function mat(color, metalness, roughness, emissive) {
  const m = new THREE.MeshStandardMaterial({
    color, metalness, roughness,
    emissive: emissive || 0x000000,
    emissiveIntensity: emissive ? 1.6 : 0
  });
  return m;
}

export class Weapon {
  constructor(camera, audio, shared) {
    this.camera = camera || null;
    this.audio = audio || null;
    this.shared = shared || null;
    this.root = new THREE.Group();
    this.root.name = 'weapon';
    this.spent = false;
    this.recoil = 0;
    this.flashT = 0;
    this.slideT = 0;
    this.sway = 0;

    this.mats = {
      body: mat(GUNMETAL, 1.0, 0.34),
      bodyDark: mat(0x1b2028, 1.0, 0.45),
      polymer: mat(DARK, 0.25, 0.82),
      chrome: mat(0xc9d3e0, 1.0, 0.24),
      accent: mat(0x0d2b33, 0.6, 0.4, 0x49e6ff),
      warning: mat(0x2a1206, 0.4, 0.5, 0xff9f43),
      glove: mat(0x161a20, 0.15, 0.9),
      glovePlate: mat(0x2f3946, 0.8, 0.5, 0x14343d)
    };

    // el modelo se eleva para que el CENTRO de la empuñadura caiga en el origen
    // del espacio grip del mando: así la mano sujeta la empuñadura, no la culata
    this.gun = new THREE.Group();
    this.gun.position.y = 0.058;
    this.root.add(this.gun);

    this._buildGun();
    this._buildHand();
    this._buildFx();

    this.root.traverse(o => {
      if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; }
    });
  }

  // ---------------------------------------------------------------- pistola
  _buildGun() {
    const g = this.gun, M = this.mats;
    const add = (geo, material, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      parent.add(m);
      return m;
    };

    // corredera superior
    this.slide = new THREE.Group();
    g.add(this.slide);
    add(new THREE.BoxGeometry(0.062, 0.05, 0.235), M.body, 0, 0.045, -0.1, 0, 0, 0, this.slide);
    // bisel delantero de la corredera
    add(new THREE.BoxGeometry(0.05, 0.032, 0.05), M.bodyDark, 0, 0.046, -0.232, 0.16, 0, 0, this.slide);
    // ranuras de agarre traseras
    for (let i = 0; i < 5; i++) {
      add(new THREE.BoxGeometry(0.064, 0.006, 0.008), M.bodyDark, 0, 0.052, 0.004 - i * 0.014, 0, 0, 0, this.slide);
    }
    // ventana de expulsión + cañón interior visible
    add(new THREE.BoxGeometry(0.026, 0.012, 0.05), M.bodyDark, 0.031, 0.052, -0.045, 0, 0, 0, this.slide);
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.075, 16), M.chrome, 0, 0.052, -0.045, Math.PI / 2, 0, 0, this.slide);

    // armazón
    add(new THREE.BoxGeometry(0.058, 0.042, 0.19), M.bodyDark, 0, 0.014, -0.075);
    // guardamanos con raíles
    add(new THREE.BoxGeometry(0.05, 0.026, 0.09), M.body, 0, 0.004, -0.175);
    for (let i = 0; i < 4; i++) {
      add(new THREE.BoxGeometry(0.056, 0.005, 0.006), M.bodyDark, 0, 0.004, -0.145 - i * 0.022);
    }
    // cañón + compensador
    add(new THREE.CylinderGeometry(0.019, 0.019, 0.055, 18), M.chrome, 0, 0.048, -0.255, Math.PI / 2, 0, 0);
    const comp = add(new THREE.CylinderGeometry(0.029, 0.026, 0.05, 18), M.body, 0, 0.048, -0.29, Math.PI / 2, 0, 0);
    comp.rotation.z = 0;
    for (let i = 0; i < 3; i++) {
      add(new THREE.BoxGeometry(0.062, 0.007, 0.007), M.bodyDark, 0, 0.05 + (i - 1) * 0.012, -0.29);
    }
    // punto de mira delantero con fibra
    add(new THREE.BoxGeometry(0.008, 0.012, 0.012), M.bodyDark, 0, 0.073, -0.2);
    add(new THREE.SphereGeometry(0.005, 8, 8), M.accent, 0, 0.078, -0.203);
    // alza trasera
    add(new THREE.BoxGeometry(0.044, 0.011, 0.012), M.bodyDark, 0, 0.072, 0.014);
    add(new THREE.SphereGeometry(0.005, 8, 8), M.accent, 0.016, 0.077, 0.014);
    add(new THREE.SphereGeometry(0.005, 8, 8), M.accent, -0.016, 0.077, 0.014);

    // empuñadura: vertical, ligeramente inclinada hacia atrás
    this.grip = new THREE.Group();
    this.grip.position.set(0, 0.0, 0.028);
    this.grip.rotation.x = -0.26;
    g.add(this.grip);
    add(new THREE.BoxGeometry(0.05, 0.115, 0.058), M.polymer, 0, -0.062, 0, 0, 0, 0, this.grip);
    // cachas laterales con textura
    for (const sx of [-1, 1]) {
      const side = add(new THREE.BoxGeometry(0.006, 0.098, 0.05), M.bodyDark, sx * 0.027, -0.06, 0.002, 0, 0, 0, this.grip);
      side.rotation.z = 0;
      for (let i = 0; i < 6; i++) {
        add(new THREE.BoxGeometry(0.002, 0.004, 0.046), M.body, sx * 0.031, -0.026 - i * 0.014, 0.002, 0, 0, 0, this.grip);
      }
      // célula de energía que se apaga al quedarse sin balas
      const cell = add(new THREE.BoxGeometry(0.003, 0.03, 0.008), M.accent, sx * 0.032, -0.05, -0.017, 0, 0, 0, this.grip);
      (this.cells || (this.cells = [])).push(cell);
    }
    // base del cargador
    add(new THREE.BoxGeometry(0.056, 0.014, 0.064), M.body, 0, -0.122, 0.004, 0, 0, 0, this.grip);

    // disparador
    add(new THREE.TorusGeometry(0.028, 0.005, 8, 16, Math.PI), M.bodyDark, 0, -0.012, -0.055, 0.2, 0, Math.PI);
    const trig = add(new THREE.BoxGeometry(0.008, 0.026, 0.008), M.chrome, 0, -0.018, -0.05, 0.28, 0, 0);
    this.trigger = trig;

    // módulo láser bajo el cañón
    add(new THREE.BoxGeometry(0.03, 0.022, 0.05), M.bodyDark, 0, 0.0, -0.245);
    this.laserDot = add(new THREE.SphereGeometry(0.007, 10, 10), M.warning, 0, -0.005, -0.272);
    // retroceso visible: culata trasera
    add(new THREE.BoxGeometry(0.03, 0.034, 0.026), M.body, 0, 0.02, 0.06);
    add(new THREE.BoxGeometry(0.012, 0.012, 0.008), M.accent, 0, 0.02, 0.075);
  }

  // ---------------------------------------------------------------- mano
  _buildHand() {
    const M = this.mats, h = new THREE.Group();
    h.name = 'hand';
    this.root.add(h);
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      h.add(mesh);
      return mesh;
    };

    // palma detrás de la empuñadura
    add(new THREE.BoxGeometry(0.052, 0.09, 0.05), M.glove, 0.0, -0.055, 0.062, -0.26, 0, 0);
    // dorso de la mano / guante
    add(new THREE.BoxGeometry(0.058, 0.03, 0.052), M.glovePlate, 0.0, -0.005, 0.075, -0.1, 0, 0);
    // nudillos
    for (let i = 0; i < 3; i++) {
      add(new THREE.SphereGeometry(0.014, 10, 8), M.glovePlate, -0.024 + i * 0.023, -0.012, 0.045, 0, 0, 0);
    }
    // dedos envolviendo la empuñadura (4)
    for (let f = 0; f < 4; f++) {
      const y = -0.028 - f * 0.024;
      const wrap = add(new THREE.CapsuleGeometry(0.0125, 0.05, 4, 8), M.glove, -0.012, y, 0.012);
      wrap.rotation.set(0, Math.PI / 2, 0);
      wrap.rotation.z = -0.12;
      add(new THREE.SphereGeometry(0.0128, 8, 8), M.glove, 0.026, y, 0.0, 0, 0, 0);
      // placa del guante en el dedo
      add(new THREE.BoxGeometry(0.018, 0.008, 0.03), M.glovePlate, -0.005, y - 0.011, 0.011, 0, 0, 0);
    }
    // pulgar cruzado por el lado izquierdo
    const th = add(new THREE.CapsuleGeometry(0.014, 0.045, 4, 8), M.glove, -0.036, -0.03, 0.03);
    th.rotation.set(0.5, 0, 0.55);
    // muñeca y antebrazo (da profundidad al arma)
    add(new THREE.CylinderGeometry(0.042, 0.05, 0.055, 14), M.glovePlate, 0.0, -0.055, 0.105, 1.1, 0, 0);
    add(new THREE.CylinderGeometry(0.05, 0.058, 0.16, 14), M.glove, 0.0, -0.09, 0.19, 1.28, 0, 0);
    add(new THREE.TorusGeometry(0.05, 0.006, 8, 18), M.accent, 0.0, -0.068, 0.145, 1.1, 0, 0);
  }

  // ---------------------------------------------------------------- efectos
  _buildFx() {
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide
    });
    this.flashMat = flashMat;
    const flash = new THREE.Group();
    const star = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.16, 10, 1, true), flashMat);
    star.rotation.x = -Math.PI / 2;
    star.position.z = -0.375;
    flash.add(star);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 8, 16), flashMat);
    ring.position.z = -0.315;
    flash.add(ring);
    this.flash = flash;
    this.gun.add(flash);

    this.flashLight = new THREE.PointLight(0xffbf7a, 0, 2.4, 2);
    this.flashLight.position.set(0, 0.05, -0.34);
    this.gun.add(this.flashLight);

    // mira láser: línea fina aditiva
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.0, -0.28), new THREE.Vector3(0, 0.0, -12)
    ]);
    this.laser = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({
      color: 0xff3b30, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.gun.add(this.laser);
  }

  // ---------------------------------------------------------------- API
  mount(parent, pos, rot) {
    if (this.root.parent) this.root.parent.remove(this.root);
    parent.add(this.root);
    this.root.position.copy(pos || new THREE.Vector3());
    if (rot) this.root.rotation.set(rot.x, rot.y, rot.z);
    this.root.scale.setScalar(1);
    this.root.updateMatrixWorld(true);
  }

  // empuñadura vertical alineada con el mando, cañón horizontal al frente
  handPose(side = 1) {
    return {
      pos: new THREE.Vector3(0.004 * side, -0.022, 0.052),
      rot: new THREE.Euler(0.015, -0.05 * side, 0.02 * side)
    };
  }

  muzzleWorld(v) {
    this.gun.updateWorldMatrix(true, false);
    return v.set(0, 0.048, -0.33).applyMatrix4(this.gun.matrixWorld);
  }

  aimDir(v) {
    this.gun.updateWorldMatrix(true, false);
    const m = this.gun.matrixWorld.elements;
    return v.set(-m[8], -m[9], -m[10]).normalize();
  }

  setSpent(spent) {
    this.spent = !!spent;
    const c = spent ? 0xff3b30 : 0x49e6ff;
    if (this.cells) this.cells.forEach(mesh => mesh.material.emissive.setHex(c));
    this.laser.material.color.setHex(spent ? 0x552222 : 0xff3b30);
    this.laser.material.opacity = spent ? 0.08 : 0.28;
  }

  fire() {
    this.recoil = 1;
    this.flashT = 0.075;
    this.slideT = 0.075;
    this.sway = 1;
    if (this.audio) { try { this.audio.shot(); } catch (e) {} }
  }

  dryFire() {
    if (this.audio) { try { this.audio.dry(); } catch (e) {} }
    this.sway = 0.4;
  }

  update(dt, t) {
    const k = Math.min(1, dt * 14);
    this.recoil += (0 - this.recoil) * k;
    this.sway += (0 - this.sway) * Math.min(1, dt * 8);

    // retroceso: la corredera va atrás y el arma sube
    this.gun.position.z = this.recoil * 0.03;
    this.gun.position.y = 0.058 + this.recoil * 0.006;
    this.gun.rotation.x = this.recoil * 0.16 + Math.sin(t * 1.7) * 0.004;
    this.gun.rotation.z = Math.sin(t * 1.1) * 0.006;
    if (this.slide) this.slide.position.z = this.recoil * 0.028;

    // fogonazo
    if (this.flashT > 0) {
      this.flashT -= dt;
      const a = Math.max(0, this.flashT / 0.075);
      this.flashMat.opacity = a;
      this.flash.scale.setScalar(0.7 + a * 0.6);
      this.flash.rotation.z = Math.random() * Math.PI;
      this.flashLight.intensity = a * 5.5;
    } else if (this.flashMat.opacity !== 0) {
      this.flashMat.opacity = 0;
      this.flashLight.intensity = 0;
    }

    // pulso del láser
    this.laser.material.opacity = (this.spent ? 0.06 : 0.2) + Math.sin(t * 9) * 0.05;
    this.laserDot.material.emissiveIntensity = 1.2 + Math.sin(t * 7) * 0.5;
  }
}
