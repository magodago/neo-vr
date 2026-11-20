// Cajas de suministros destructibles y objetos que sueltan.
import * as THREE from 'three';

const _CRATE_SIZE = new THREE.Vector3(0.86, 0.86, 0.86);

const KINDS = [
  { kind: 'ammo', color: 0x49e6ff, weight: 18, label: 'MUNICIÓN' },
  { kind: 'hp', color: 0x63ff9d, weight: 20, label: 'VIDA' },
  { kind: 'score', color: 0xffc247, weight: 24, label: 'PUNTOS' },
  { kind: 'weapon', color: 0xff4fd8, weight: 18, label: 'SOBRECARGA' },
  { kind: 'grenade', color: 0xff7a2a, weight: 20, label: 'GRANADAS' }
];

function rollKind() {
  let acc = 0;
  const r = Math.random() * 100;
  for (const k of KINDS) { acc += k.weight; if (r <= acc) return k.kind; }
  return KINDS[0].kind;
}

function crateTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#2b333d');
  g.addColorStop(1, '#151a20');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,159,67,0.75)';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 236, 236);
  ctx.strokeStyle = 'rgba(73,230,255,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, 208, 208);
  // esquinas
  ctx.fillStyle = 'rgba(73,230,255,0.5)';
  for (const [x, y] of [[24, 24], [216, 24], [24, 216], [216, 216]]) ctx.fillRect(x - 6, y - 6, 14, 14);
  ctx.font = 'bold 30px Consolas, monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('SUPPLY', 52, 118);
  ctx.fillStyle = 'rgba(73,230,255,0.7)';
  ctx.font = '18px Consolas, monospace';
  ctx.fillText('NEO//DROP 07', 54, 148);
  // bandas de peligro
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 190, 256, 34); ctx.clip();
  for (let x = -40; x < 300; x += 40) {
    ctx.fillStyle = '#e8b13a';
    ctx.beginPath();
    ctx.moveTo(x, 224); ctx.lineTo(x + 18, 224); ctx.lineTo(x + 40, 190); ctx.lineTo(x + 22, 190);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Loot {
  constructor(scene, audio, shared) {
    this.scene = scene;
    this.audio = audio;
    this.shared = shared;
    this.crates = [];
    this.pickups = [];
    this.crateMat = new THREE.MeshStandardMaterial({
      map: crateTexture(), color: 0xffffff, metalness: 0.85, roughness: 0.38,
      emissiveMap: crateTexture(), emissive: 0xffffff, emissiveIntensity: 0.22
    });
    this.edgeMat = new THREE.MeshStandardMaterial({ color: 0x14181e, emissive: 0xff9f43, emissiveIntensity: 1.5, metalness: 0.6, roughness: 0.5 });
    this.time = 0;
  }

  spawnCrate(z = -26) {
    const g = new THREE.Group();
    const side = Math.random() < 0.5 ? -1 : 1;
    g.position.set(side * (1.9 + Math.random() * 0.9), 0.46, z + (Math.random() - 0.5) * 5);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.78, 0.78), this.crateMat);
    body.castShadow = true;
    g.add(body);
    // aristas luminosas
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.82, 0.08), this.edgeMat);
      e.position.set(x * 0.36, 0, y * 0.36);
      g.add(e);
    }
    // halo
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.44;
    g.add(halo);
    g.rotation.y = Math.random() * Math.PI;
    this.scene.add(g);
    const box = new THREE.Box3().setFromObject(body);
    this.crates.push({ root: g, box, hp: 2, hitT: 0, alive: true, spin: (Math.random() - 0.5) * 0.4 });
  }

  _spawnPickup(pos, kind) {
    const def = KINDS.find(k => k.kind === kind) || KINDS[0];
    const g = new THREE.Group();
    g.position.copy(pos);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1),
      new THREE.MeshStandardMaterial({ color: 0x101418, emissive: def.color, emissiveIntensity: 2.6, metalness: 0.8, roughness: 0.2 }));
    g.add(core);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(halo);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.012, 6, 18),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    this.scene.add(g);
    this.pickups.push({ root: g, kind: def.kind, color: def.color, t: 0, life: 30, vel: new THREE.Vector3(0, 1.4, 0) });
  }

  // devuelve eventos de recogida
  update(dt, railSpeed, playerPos) {
    this.time += dt;
    const evs = [];
    // cajas: se acercan con el corredor
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const c = this.crates[i];
      c.root.position.z += railSpeed * dt;
      c.root.rotation.y += c.spin * dt;
      c.root.position.y = 0.46 + Math.sin(this.time * 2 + i) * 0.03;
      c.box.setFromCenterAndSize(c.root.position, _CRATE_SIZE);
      if (c.hitT > 0) {
        c.hitT -= dt;
        c.root.scale.setScalar(1 + Math.sin(c.hitT * 60) * 0.05);
      }
      // punto 4 · IMÁN DE CAJAS: si una caja pasa cerca sin romperse, vuela
      // sola al jugador y suelta su mejora. Antes se perdían al fondo y el
      // jugador se quedaba sin premio.
      const cdx = playerPos.x - c.root.position.x;
      const cdz = playerPos.z - c.root.position.z;
      const cd = Math.hypot(cdx, cdz);
      if (cd < 4.4) {
        const k = Math.min(1, (4.4 - cd) / 3.4);
        c.root.position.x += cdx * dt * (1.6 + k * 4.6);
        c.root.position.z += cdz * dt * (1.6 + k * 4.6);
        c.root.position.y += (playerPos.y - 0.25 - c.root.position.y) * dt * (1.2 + k * 3.0);
        c.root.rotation.y += dt * 7;
        c.root.rotation.z = Math.sin(this.time * 9 + i) * 0.22;
        if (cd < 0.95) {
          this.scene.remove(c.root);
          this.crates.splice(i, 1);
          this._spawnPickup(new THREE.Vector3(
            playerPos.x + 0.34, playerPos.y - 0.28, playerPos.z - 1.15
          ), rollKind());
          if (this.audio) { try { this.audio.pickup && this.audio.pickup(); } catch (e) {} }
          continue;
        }
      }
      if (c.root.position.z > 7) {
        this.scene.remove(c.root); this.crates.splice(i, 1);
      }
    }
    // recogidas
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt; p.life -= dt;
      p.root.children[1].scale.setScalar(1 + Math.sin(this.time * 8) * 0.16);
      // imán: en cuanto la mejora está suelta vuela al jugador, sin gravedad
      // IMÁN TOTAL: la mejora siempre viene al jugador. Antes sólo se
      // activaba a 6,5 m y muchas cajas se quedaban atrás sin llegar.
      const dh = Math.hypot(playerPos.x - p.root.position.x, playerPos.z - p.root.position.z);
      p.pulling = true;
      if (p.pulling) {
        const dir = new THREE.Vector3().subVectors(playerPos, p.root.position);
        const dd = dir.length();
        if (dd > 1e-4) {
          dir.multiplyScalar(1 / dd);
          // velocidad mínima alta + acelerón al acercarse (sensación de imán)
          const speed = 6 + railSpeed * 1.25 + Math.max(0, 26 - dh) * 1.9;
          p.root.position.addScaledVector(dir, dt * speed);
        }
        p.root.rotation.y += dt * 11;
        p.root.rotation.x += dt * 6;
      } else {
        p.vel.y -= dt * 3.4;
        p.root.position.addScaledVector(p.vel, dt);
        if (p.root.position.y < 0.5) { p.root.position.y = 0.5; p.vel.y = Math.abs(p.vel.y) * 0.35; p.vel.multiplyScalar(0.9); }
        p.root.rotation.y += dt * 2.4;
      }
      const d = p.root.position.distanceTo(playerPos);
      if (d < 0.95 || p.life <= 0) {
        if (p.life > 0) evs.push({ type: 'pickup', kind: p.kind, pos: p.root.position.clone() });
        this.scene.remove(p.root);
        this.pickups.splice(i, 1);
      }
    }
    return evs;
  }

  // disparo contra cajas: devuelve { pos, kind } o null
  shoot(ray) {
    let best = null, bestD = Infinity;
    for (const c of this.crates) {
      if (!c.alive) continue;
      const hit = ray.intersectBox(c.box, new THREE.Vector3());
      if (hit) {
        const d = hit.distanceTo(ray.origin);
        if (d < bestD) { bestD = d; best = { crate: c, pos: hit }; }
      }
    }
    if (!best) return null;
    const c = best.crate;
    c.hp--;
    c.hitT = 0.14;
    if (c.hp <= 0) {
      c.alive = false;
      const idx = this.crates.indexOf(c);
      if (idx >= 0) this.crates.splice(idx, 1);
      this.scene.remove(c.root);
      const r = Math.random();
      let acc = 0, kind = 'score';
      for (const k of KINDS) { acc += k.weight; if (r * 100 <= acc) { kind = k.kind; break; } }
      this._spawnPickup(c.root.position.clone().setY(0.7), kind);
      if (this.audio) { try { this.audio.explode(); } catch (e) {} }
      return { pos: best.pos, destroyed: true, kind, cratePos: c.root.position.clone() };
    }
    if (this.audio) { try { this.audio.impact(); } catch (e) {} }
    return { pos: best.pos, destroyed: false };
  }

  disposeAll() {
    for (const c of this.crates) this.scene.remove(c.root);
    for (const p of this.pickups) this.scene.remove(p.root);
    this.crates.length = 0;
    this.pickups.length = 0;
  }
}
