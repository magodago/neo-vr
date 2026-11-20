import * as THREE from 'three';

// Granada en la mano libre.
// Se monta en el mando que NO lleva el arma y sólo aparece cuando hay
// granadas disponibles. Al lanzarla hace un golpe de muñeca (kick) y vuelve
// a materializarse 0.35 s después si aún quedan.
export class HeldNade {
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.kickT = 0;
    this.spin = 0;

    const shell = new THREE.MeshStandardMaterial({
      color: 0x2a3038, roughness: 0.34, metalness: 0.82
    });
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x1a1f26, roughness: 0.5, metalness: 0.7
    });
    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0xff8a3a, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false
    });

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
