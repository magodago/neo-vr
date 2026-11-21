import * as THREE from 'three';
import { brushedMetal } from './textures.js';

// Granada en la mano libre — con mano detallada que la sostiene.
// Se monta en el mando que NO lleva el arma y sólo aparece cuando hay
// granadas disponibles. Al lanzarla hace un golpe de muñeca (kick) y vuelve
// a materializarse 0.35 s después si aún quedan.
export class HeldNade {
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.kickT = 0;
    this.spin = 0;

    // materiales guante/granada
    const brushed = brushedMetal();
    brushed.map.repeat.set(2, 2);
    brushed.roughnessMap.repeat.set(2, 2);
    const applyBrushed = (m) => { m.map = brushed.map; m.roughnessMap = brushed.roughnessMap; m.roughness = 0.48; m.envMapIntensity = 1.8; };

    const glove = new THREE.MeshStandardMaterial({ color: 0x161a20, metalness: 0.15, roughness: 0.9 });
    const glovePlate = new THREE.MeshStandardMaterial({ color: 0x2f3946, metalness: 0.8, roughness: 0.5, emissive: 0x14343d, emissiveIntensity: 0.6 });
    const shell = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.34, metalness: 0.82 });
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x1a1f26, roughness: 0.5, metalness: 0.7 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });

    // ---- mano izquierda (espejo de la mano del arma, sin arma) ----
    const hand = new THREE.Group();
    hand.name = 'offHand';
    const addH = (geo, mat, x, y, z, rx=0, ry=0, rz=0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.rotation.set(rx,ry,rz); hand.add(m); return m;
    };
    // palma
    addH(new THREE.BoxGeometry(0.052, 0.09, 0.05), glove, 0.0, -0.055, -0.062, -0.26, 0, 0);
    // dorso
    addH(new THREE.BoxGeometry(0.058, 0.03, 0.052), glovePlate, 0.0, -0.005, -0.075, -0.1, 0, 0);
    // nudillos
    for (let i=0;i<3;i++) addH(new THREE.SphereGeometry(0.014,10,8), glovePlate, -0.024+i*0.023, -0.012, -0.045, 0,0,0);
    // dedos curvados alrededor de granada (4)
    for (let f=0;f<4;f++) {
      const y = -0.028 - f*0.024;
      const wrap = addH(new THREE.CapsuleGeometry(0.0125, 0.05, 4, 8), glove, 0.012, y, -0.012);
      wrap.rotation.set(0, -Math.PI/2, 0); wrap.rotation.z = -0.12;
      addH(new THREE.SphereGeometry(0.0128,8,8), glove, -0.026, y, 0.0, 0,0,0);
      addH(new THREE.BoxGeometry(0.018, 0.008, 0.03), glovePlate, 0.005, y-0.011, -0.011, 0,0,0);
    }
    // pulgar opuesto
    const th = addH(new THREE.CapsuleGeometry(0.014, 0.045, 4, 8), glove, 0.036, -0.03, -0.03);
    th.rotation.set(0.5, 0, -0.55);
    // muñeca y antebrazo
    addH(new THREE.CylinderGeometry(0.042, 0.05, 0.055, 14), glovePlate, 0.0, -0.055, -0.105, 1.1, 0, 0);
    addH(new THREE.CylinderGeometry(0.05, 0.058, 0.16, 14), glove, 0.0, -0.09, -0.19, 1.28, 0, 0);
    addH(new THREE.TorusGeometry(0.05, 0.006, 8, 18), glovePlate, 0.0, -0.068, -0.145, 1.1, 0, 0);
    this.group.add(hand);

    // ---- granada (icosaedro premium con banda, chapa, núcleo) ----
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.032, 2), shell);
    this.group.add(body);

    const band = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.0055, 8, 26), ringMat);
    band.rotation.x = Math.PI / 2;
    this.group.add(band);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.016, 14), ringMat);
    cap.position.y = 0.036;
    this.group.add(cap);

    // núcleo incandescente que late
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.012, 14, 12), this.glowMat);
    core.position.y = 0.045;
    this.group.add(core);

    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xff5a1e, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    this.group.add(this.halo);

    this.light = new THREE.PointLight(0xff6a20, 0.0, 0.6, 2);
    this.light.position.y = 0.05;
    this.group.add(this.light);
  }

  mount(parent) {
    if (this.group.parent) this.group.parent.remove(this.group);
    parent.add(this.group);
    this.group.position.set(0, -0.012, 0.055);
    this.group.rotation.set(-0.35, 0.2, 0.15);
  }

  kick() { this.kickT = 0.34; }

  update(dt, t, count) {
    const want = count > 0;
    if (this.kickT > 0) {
      this.kickT -= dt;
      this.group.visible = false;
    } else {
      this.group.visible = want;
    }
    if (!this.group.visible) { this.light.intensity = 0; return; }

    this.spin += dt * 0.9;
    this.group.rotation.y = 0.2 + Math.sin(t * 0.9) * 0.25;
    this.group.rotation.z = 0.15 + Math.sin(t * 1.3) * 0.12;

    const pulse = 0.55 + Math.sin(t * 6.5) * 0.25;
    this.glowMat.opacity = pulse;
    this.halo.scale.setScalar(1 + Math.sin(t * 3.2) * 0.12);
    this.halo.material.opacity = 0.12 + pulse * 0.1;
    this.light.intensity = 0.5 + pulse * 0.9;
  }
}
