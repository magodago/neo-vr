import * as THREE from 'three';
import { Drone, makeDebris } from './drone.js';
import { GroundBot, LaserCam } from './enemies.js';
import { Loot } from './loot.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

const ARENA = 6.35;          // media anchura jugable
const OVER_TIME = 12;        // segundos de sobrecarga
const AMMO = 6;
const PLAYER_HP = 5;

export class Game {
  constructor(ctx) {
    this.scene = ctx.scene;
    this.audio = ctx.audio;
    this.shared = ctx.shared;
    this.weapon = ctx.weapon;
    this.hud = ctx.hud;
    this.rig = ctx.rig;

    this.enemies = [];
    this.projectiles = [];
    this.debris = [];
    this.grenades = 0;
    this.nades = [];
    this.tracers = [];
    this.state = 'idle';
    this.hp = PLAYER_HP;
    this.ammo = AMMO;
    this.score = 0;
    this.wave = 0;
    this.waveTimer = 0;
    this.pendingSpawn = 0;
    this.spawnQueue = [];
    this.time = 0;
    this.combo = 0;
    this.comboT = 0;
    this.kills = 0;
    this.overT = 0;
    this.railSpeed = 3.0;
    this._pv = new THREE.Vector3();
    this.loot = new Loot(this.scene, this.audio, this.shared);

    this._initTracers();
  }

  _initTracers() {
    for (let i = 0; i < 6; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const m = new THREE.LineBasicMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const line = new THREE.Line(g, m);
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0, max: 0.07 });
    }
    this.tracerIdx = 0;
  }

  spawnTracer(from, to) {
    const tr = this.tracers[this.tracerIdx++ % this.tracers.length];
    const p = tr.line.geometry.attributes.position;
    p.setXYZ(0, from.x, from.y, from.z);
    p.setXYZ(1, to.x, to.y, to.z);
    p.needsUpdate = true;
    tr.line.geometry.computeBoundingSphere();
    tr.life = tr.max;
    tr.line.material.opacity = 0.85;
  }

  // ---------- ciclo ----------
  begin() {
    this.state = 'playing';
    this.hp = PLAYER_HP;
    this.ammo = AMMO;
    this.weapon.setSpent(false);
    this.score = 0;
    this.wave = 0;
    this.kills = 0;
    this.hud.setHealth(this.hp, PLAYER_HP);
    this.hud.setAmmo(this.ammo, false);
    this.hud.setState(this.hp, this.ammo, 0, 0);
    this.nextWave(1.6);
  }

  reset() {
    this.enemies.forEach(e => { e.dispose(); });
    if (this.loot) this.loot.disposeAll();
    this.overT = 0;
    this.enemies.length = 0;
    for (const p of this.projectiles) this.scene.remove(p.mesh, p.glow, p.core);
    this.projectiles.length = 0;
    for (const d of this.debris) this.scene.remove(d.mesh);
    this.debris.length = 0;
    this.spawnQueue.length = 0;
    this.begin();
  }

  nextWave(delay = 3.2) {
    this.waveTimer = delay;
    this.state = 'intermission';
  }

  startWave() {
    this.wave++;
    this.state = 'playing';
    const boss = this.wave % 3 === 0;
    const n = Math.min(3 + Math.floor(this.wave * 1.1), 12);
    this.spawnQueue = [];
    for (let i = 0; i < n; i++) this.spawnQueue.push({ t: i * 0.34, boss: false });
    if (boss) this.spawnQueue.push({ t: 0.9, boss: true });
    this.pendingSpawn = 0;

    if (boss) this.hud.banner(`OLEADA ${this.wave}`, 'UNIDAD PESADA DETECTADA', 3.0);
    else this.hud.banner(`OLEADA ${this.wave}`, `OBJETIVOS: ${n}`, 2.4);
    // cajas de suministros repartidas por el corredor
    const nc = 1 + (this.wave > 2 ? 1 : 0);
    for (let i = 0; i < nc; i++) this.loot.spawnCrate(-23 - i * 7 - Math.random() * 3);
    if (this.audio) this.audio.waveStart();
    this.hud.setState(this.hp, this.ammo, this.wave, this.score);
  }

  spawnEnemy(boss) {
    const wave = this.wave;

    // --- jefe de oleada: dron pesado acorazado
    if (boss) {
      const d = new Drone(this.scene, this.audio, this.shared, { hp: 14 + wave * 2, size: 1.0 });
      d.root.scale.setScalar(0.02);
      d.isBoss = true;
      d.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
      d.angle = (Math.random() * 2 - 1) * 0.13;
      d.radius = 20;
      d.railHold = 9.0;
      d.root.position.set(-Math.sin(d.angle) * d.radius, d.baseY + 1.2, -Math.cos(d.angle) * d.radius);
      this.enemies.push(d);
      return;
    }

    // --- reparto de tipos: androides desde la oleada 2, cámaras desde la 3
    const r = Math.random();
    let type = 'drone';
    if (wave >= 2 && r < 0.36) type = 'bot';
    else if (wave >= 3 && r < 0.55) type = 'cam';

    if (type === 'bot') {
      const b = new GroundBot(this.scene, this.audio, this.shared, { hp: 5 + Math.floor(wave * 0.35) });
      b.kind = 'bot';
      b.root.position.z = -19 - Math.random() * 7;
      b.root.position.x = (Math.random() * 2 - 1) * 1.5;
      b.hold = 4.6 + Math.random() * 2.4;
      this.enemies.push(b);
      return;
    }
    if (type === 'cam') {
      const c = new LaserCam(this.scene, this.audio, this.shared, {
        hp: 2, side: Math.random() < 0.5 ? -1 : 1, z: -21 - Math.random() * 7
      });
      c.kind = 'cam';
      c.radius = 999; c.railHold = 999;
      this.enemies.push(c);
      return;
    }

    const hp = Math.min(6, 2 + Math.floor(wave / 3));
    const d = new Drone(this.scene, this.audio, this.shared, { hp, size: 0.78 });
    d.kind = 'drone';
    // modo riel: entra por el fondo del corredor y avanza hacia el jugador
    d.angle = (Math.random() * 2 - 1) * 0.22;
    d.radius = 13 + Math.random() * 9;
    d.railHold = 3.4 + Math.random() * 2.2;
    d.lane = (Math.random() * 2 - 1) * 1.5;
    d.root.position.set(
      -Math.sin(d.angle) * d.radius,
      d.baseY + 1.2,
      -Math.cos(d.angle) * d.radius
    );
    this.enemies.push(d);
  }

  // ---------- disparo ----------
  tryFire(origin, dir) {
    if (this.state === 'dead') return false;
    if (this.ammo <= 0) {
      this.weapon.dryFire();
      this.hud.reloadHint(true);
      return false;
    }
    this.ammo--;
    this.weapon.fire();
    this.hud.setAmmo(this.ammo, this.ammo === 0);
    this.hud.setState(this.hp, this.ammo, this.wave, this.score);
    if (this.ammo === 0) {
      this.weapon.setSpent(true);
      this.hud.reloadHint(true);
      this.reloadT = 1.5; // recarga automática de cortesía
    }

    // cajas de suministros (antes que los enemigos: están pegadas a las paredes)
    const crateHit = this.loot.shoot(new THREE.Ray(origin.clone(), dir.clone()));
    if (crateHit) {
      this.spawnTracer(origin, crateHit.pos);
      this.spark(crateHit.pos, 0xffc06a, crateHit.destroyed ? 20 : 9, crateHit.destroyed ? 3.2 : 2.2);
      if (crateHit.destroyed) {
        this.score += 50;
        this.hud.banner('SUMINISTROS', 'CAJA DESTRUIDA', 1.1);
      }
      this.hud.setState(this.hp, this.ammo, this.wave, this.score);
      return true;
    }

    // impacto en enemigos (rayo-esfera)
    let best = null, bestT = Infinity, bestPoint = null;
    const hc = new THREE.Vector3();
    for (const e of this.enemies) {
      if (e.dead || e.state === 'dying') continue;
      const r = e.hitR || (e.isBoss ? 1.05 : 0.66);
      hc.copy(e.root.position);
      if (e.hitCenter) hc.add(e.hitCenter);
      _v1.copy(hc).sub(origin);
      const tca = _v1.dot(dir);
      if (tca < 0) continue;
      const d2 = _v1.lengthSq() - tca * tca;
      if (d2 > r * r) continue;
      const t = tca - Math.sqrt(Math.max(0, r * r - d2));
      if (t < bestT) { bestT = t; best = e; bestPoint = origin.clone().addScaledVector(dir, t); }
    }

    if (best) {
      // daño real: el centro del cuerpo mata de un tiro, el borde hace 2
      const rad = best.hitR || (best.isBoss ? 1.05 : 0.66);
      hc.copy(best.root.position);
      if (best.hitCenter) hc.add(best.hitCenter);
      _v2.copy(hc).sub(origin);
      const along = _v2.dot(dir);
      const perp = Math.sqrt(Math.max(0, _v2.lengthSq() - along * along));
      const crit = perp < rad * 0.45;
      const dmg = (crit ? 3 : 2) + (this.overT > 0 ? 2 : 0);
      const killed = best.hit(dmg, dir);
      const p = bestPoint;
      this.spark(p, killed ? 0xfff0c4 : 0xffd9a0, killed ? 18 : 10, killed ? 3.4 : 2.6);
      this.hud.hit(crit || killed);
      if (!killed) {
        this.score += 10;
        this.hud.setState(this.hp, this.ammo, this.wave, this.score);
      }
      this.spawnTracer(origin, bestPoint);
      return true;
    }

    // pared
    let t = 40;
    if (Math.abs(dir.x) > 1e-4) {
      const tx = ((dir.x > 0 ? ARENA : -ARENA) - origin.x) / dir.x;
      if (tx > 0) t = Math.min(t, tx);
    }
    if (Math.abs(dir.z) > 1e-4) {
      const tz = ((dir.z > 0 ? ARENA : -ARENA) - origin.z) / dir.z;
      if (tz > 0) t = Math.min(t, tz);
    }
    if (dir.y < -1e-4) {
      const ty = (0.02 - origin.y) / dir.y;
      if (ty > 0) t = Math.min(t, ty);
    } else if (dir.y > 1e-4) {
      const ty = (7.4 - origin.y) / dir.y;
      if (ty > 0) t = Math.min(t, ty);
    }
    const hit = origin.clone().addScaledVector(dir, Math.min(t, 30));
    this.spawnTracer(origin, hit);
    this.spark(hit, 0xbfe6ff, 7, 1.8);
    if (this.audio) this.audio.impact();
    return true;
  }

  throwGrenade(handPos, handDir) {
    if (this.grenades <= 0 || this.state === 'dead') return false;
    this.grenades--;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x23282f, roughness: 0.42, metalness: 0.65, emissive: 0xff5a1e, emissiveIntensity: 1.6 })
    );
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    mesh.add(glow);
    mesh.position.copy(handPos);
    this.scene.add(mesh);
    this.nades.push({ mesh, glow, vel: handDir.clone().multiplyScalar(9.5).add(new THREE.Vector3(0, 2.1, 0)), t: 0, dead: false });
    this.hud.banner('GRANADA', `${this.grenades} EN EL CUERPO`, 0.9);
    if (this.audio) { try { this.audio.impact(); } catch (e) {} }
    return true;
  }

  explodeNade(g) {
    if (g.dead) return;
    g.dead = true;
    const pos = g.mesh.position.clone();
    this.spark(pos, 0xffe0a0, 40, 7.5);
    this.spark(pos, 0xff7a2a, 30, 5.5);
    this.burst(pos, 16);
    if (this.audio) { try { this.audio.impact(); } catch (e) {} }
    for (const e of this.enemies) {
      if (!e.root) continue;
      const d = e.root.position.distanceTo(pos);
      if (d > 5.8) continue;
      const dir = new THREE.Vector3().subVectors(e.root.position, pos).normalize();
      e.hit(9, dir);
    }
  }

  applyPickup(kind, pos) {
    if (kind === 'ammo') {
      this.ammo = AMMO;
      this.weapon.setSpent(false);
      this.hud.setAmmo(this.ammo, false);
      this.hud.banner('MUNICIÓN', 'CARGADOR LLENO', 1.0);
    } else if (kind === 'hp') {
      this.hp = Math.min(PLAYER_HP, this.hp + 1);
      this.hud.setHealth(this.hp, PLAYER_HP);
      this.hud.banner('VIDA', '+1 INTEGRIDAD', 1.0);
    } else if (kind === 'score') {
      this.score += 250;
      this.hud.banner('PUNTOS', '+250', 1.0);
    } else if (kind === 'grenade') {
      this.grenades += 2;
      this.hud.banner('GRANADAS x2', 'AGARRA CON FUERZA PARA LANZAR', 1.6);
    } else if (kind === 'weapon') {
      this.overT = OVER_TIME;
      this.hud.banner('SOBRECARGA', 'DAÑO +2 · 12 s', 1.4);
    }
    this.spark(pos, 0x9fffe0, 14, 3.0);
    if (this.audio) this.audio.reload();
    this.hud.setState(this.hp, this.ammo, this.wave, this.score);
  }

  // ---------- golpe / recarga ----------
  reload() {
    if (this.ammo >= AMMO || this.state === 'dead') return;
    this.reloadT = 0;
    this.ammo = AMMO;
    this.weapon.setSpent(false);
    this.hud.setAmmo(this.ammo, false);
    this.hud.reloadHint(false);
    if (this.audio) this.audio.reload();
    this.hud.setState(this.hp, this.ammo, this.wave, this.score);
  }

  tryWhip(handPos, handDir) {
    if (this.state === 'dead') return;
    let acted = false;

    // recargar: la pistola solo se recarga golpeando
    if (this.ammo < AMMO) {
      this.ammo = AMMO;
      this.weapon.setSpent(false);
      this.hud.setAmmo(this.ammo, false);
      this.hud.reloadHint(false);
      if (this.audio) this.audio.reload();
      this.hud.setState(this.hp, this.ammo, this.wave, this.score);
      acted = true;
    }

    // desviar proyectiles
    for (const p of this.projectiles) {
      if (p.reflected || p.dead) continue;
      const d = p.mesh.position.distanceTo(handPos);
      if (d > 1.65) continue;
      _v1.copy(p.mesh.position).sub(handPos).normalize();
      if (_v1.dot(handDir) < -0.1) continue;
      this.reflect(p);
      acted = true;
    }

    // golpear drones
    for (const e of this.enemies) {
      if (e.dead || e.state === 'dying') continue;
      const d = e.root.position.distanceTo(handPos);
      const reach = e.isBoss ? 2.0 : 1.5;
      if (d > reach) continue;
      _v1.copy(e.root.position).sub(handPos).normalize();
      if (_v1.dot(handDir) < 0.1) continue;
      const res = e.whip(handDir);
      if (res === 'parry') {
        this.score += 150;
        this.hud.hit();
        this.spark(e.root.position, 0x9fe0ff, 14, 3.2);
      } else {
        this.score += 40;
        this.spark(e.root.position, 0xffc27a, 10, 2.4);
      }
      this.hud.setState(this.hp, this.ammo, this.wave, this.score);
      acted = true;
    }

    if (acted && this.audio) this.audio.impact();
    return acted;
  }

  reflect(p) {
    p.reflected = true;
    p.speed = 12;
    p.dmg = 3;
    p.mesh.material.color.setHex(0xffd27a);
    p.glow.material.color.setHex(0xffc06a);
    p.core.material.color.setHex(0xfff0c0);

    // buscar objetivo
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'dying') continue;
      const d = e.root.position.distanceTo(p.mesh.position);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      _v1.copy(best.root.position).sub(p.mesh.position).normalize();
      p.vel.copy(_v1).multiplyScalar(p.speed);
      p.target = best;
    } else {
      p.vel.multiplyScalar(-2.2);
    }
    if (this.audio) this.audio.parry();
    this.spark(p.mesh.position, 0xffe0a0, 12, 2.8);
    this.score += 60;
    this.hud.setState(this.hp, this.ammo, this.wave, this.score);
  }

  // ---------- proyectiles enemigos ----------
  spawnProjectile(from, dir) {
    const color = 0xff6b4a;
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.062, 1),
      new THREE.MeshBasicMaterial({ color }));
    mesh.position.copy(from);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 1), new THREE.MeshBasicMaterial({ color: 0xfff0d0 }));
    mesh.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.shared.glow, color: 0xff7a4a, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.scale.setScalar(0.62);
    mesh.add(glow);
    this.scene.add(mesh);
    this.projectiles.push({
      mesh, glow, core, vel: dir.clone().multiplyScalar(3.9), speed: 3.9,
      life: 9, reflected: false, dmg: 1, target: null, dead: false
    });
  }

  hitPlayer(n) {
    if (this.state !== 'playing' && this.state !== 'intermission') return;
    this.hp = Math.max(0, this.hp - n);
    this.hud.setHealth(this.hp, PLAYER_HP);
    this.hud.hurt();
    if (this.audio) this.audio.playerHit();
    this.hud.setState(this.hp, this.ammo, this.wave, this.score);
    if (this.hp <= 0) this.die();
  }

  die() {
    this.state = 'dead';
    if (this.audio) this.audio.death();
    this.hud.banner('SISTEMA CAÍDO', 'GATILLO PARA REINICIAR', 99);
    this.weapon.setSpent(false);
  }

  // ---------- chispas / restos ----------
  spark(pos, color, n = 8, spread = 2.2) {
    const geo = new THREE.BufferGeometry();
    const pts = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      _v1.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(spread * (0.4 + Math.random() * 0.8));
      vel.push(_v1.clone());
      pts[i * 3] = pos.x; pts[i * 3 + 1] = pos.y; pts[i * 3 + 2] = pos.z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const m = new THREE.PointsMaterial({ color, size: 0.035, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, map: this.shared.glow });
    const p = new THREE.Points(geo, m);
    this.scene.add(p);
    this.debris.push({ mesh: p, vel, life: 0.5, max: 0.5, kind: 'spark' });
  }

  // ---------- bucle ----------
  update(dt, t, head) {
    this.time = t;

    // recarga: manual (squeeze) o automática al quedarse sin balas
    if (this.reloadT > 0 && this.state === 'playing') {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.reload();
    }

    // trazadoras
    for (const tr of this.tracers) {
      if (tr.life > 0) {
        tr.life -= dt;
        tr.line.material.opacity = Math.max(0, tr.life / tr.max) * 0.85;
      }
    }

    // chispas
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.kind === 'spark') {
        const arr = d.mesh.geometry.attributes.position;
        for (let k = 0; k < d.vel.length; k++) {
          d.vel[k].y -= dt * 6.5;
          arr.setXYZ(k,
            arr.getX(k) + d.vel[k].x * dt,
            arr.getY(k) + d.vel[k].y * dt,
            arr.getZ(k) + d.vel[k].z * dt);
        }
        arr.needsUpdate = true;
        d.mesh.material.opacity = Math.max(0, d.life / d.max);
      } else {
        d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt; d.mesh.rotation.z += d.spin.z * dt;
        d.vel.y -= dt * 7;
        d.mesh.position.addScaledVector(d.vel, dt);
        const k = Math.max(0, d.life / d.max);
        d.mesh.scale.setScalar(Math.max(0.05, k));
        d.mesh.traverse(o => { if (o.material && o.material.opacity !== undefined && o.material.transparent) o.material.opacity = k; });
        if (d.mesh.position.y < 0.03) { d.mesh.position.y = 0.03; d.vel.multiplyScalar(0.3); d.vel.y = Math.abs(d.vel.y) * 0.35; }
      }
      if (d.life <= 0) { this.scene.remove(d.mesh); this.debris.splice(i, 1); }
    }

    // granadas de la mano libre
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const g = this.nades[i];
      g.t += dt;
      g.vel.y -= dt * 12;
      g.mesh.position.addScaledVector(g.vel, dt);
      g.mesh.rotation.x += dt * 7; g.mesh.rotation.z += dt * 5;
      if (g.mesh.position.y < 0.08) {
        g.mesh.position.y = 0.08;
        g.vel.y = Math.abs(g.vel.y) * 0.4;
        g.vel.x *= 0.68; g.vel.z *= 0.68;
      }
      g.glow.material.opacity = 0.45 + Math.sin(g.t * 30) * 0.3;
      if (g.t > 1.25) this.explodeNade(g);
      if (g.dead) { this.scene.remove(g.mesh); this.nades.splice(i, 1); }
    }

    // enemigos
    this.railSpeed = 2.7 + Math.min(3.4, this.wave * 0.32);
    const playerPos = { x: this.rig.position.x, z: this.rig.position.z };
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      // arrastre del riel: el escenario avanza y se lleva a los enemigos con él
      const scroll = this.railSpeed * dt;
      if (e.kind === 'cam') {
        // la cámara va pegada al muro hasta plantarse delante del jugador
        e.root.position.z += scroll;
        const stopZ = playerPos.z - 8.6;
        if (e.root.position.z > stopZ) e.root.position.z = stopZ;
      } else if (e.kind === 'drone' || e.isBoss) {
        // el dron cierra distancia de verdad: el riel le come el radio de vuelo
        e.radius = Math.max(e.isBoss ? 3.6 : 2.35, e.radius - scroll * (e.isBoss ? 0.3 : 0.55));
      } else {
        // los de tierra cabalgan el corredor además de caminar
        e.root.position.z += scroll;
      }
      const evs = e.update(dt, t, playerPos) || [];
      // candado de riel: siempre dentro del corredor y por delante del jugador
      const ex = e.root.position.x, ez = e.root.position.z;
      const halfW = e.kind === 'cam' ? 3.35 : 2.05;
      e.root.position.x = Math.max(-halfW, Math.min(halfW, ex));
      const minZ = playerPos.z - 3.4;
      if (e.root.position.z > minZ) e.root.position.z = minZ;
      for (const ev of evs) {
        if (ev.type === 'shoot') this.spawnProjectile(ev.from, ev.dir);
        else if (ev.type === 'kill') this.killEnemy(e, ev.pos);
      }
      if (e.dead) {
        if (this.enemies[i] === e) this.enemies.splice(i, 1);
      }
    }

    // cajas y objetos recogibles
    const lootEvs = this.loot.update(dt, this.railSpeed, this._pv.set(head.x, 1.15, head.z));
    for (const ev of lootEvs) this.applyPickup(ev.kind, ev.pos);
    if (this.overT > 0) {
      this.overT -= dt;
      if (this.overT <= 0) this.hud.banner('SOBRECARGA', 'ENERGÍA AGOTADA', 1.0);
    }

    // proyectiles
    const chest = _v3.set(head.x, head.y - 0.15, head.z);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 6; p.mesh.rotation.y += dt * 4.4;
      const pulse = 0.58 + Math.sin(t * 22 + i) * 0.10;
      p.glow.scale.setScalar(pulse * (p.reflected ? 1.25 : 1));

      // impacto con el jugador
      if (!p.reflected && p.mesh.position.distanceTo(chest) < 0.42) {
        this.hitPlayer(p.dmg);
        this.spark(p.mesh.position, 0xff7a5a, 12, 2.4);
        p.dead = true;
      }
      // impacto con drones (proyectil desviado)
      if (p.reflected && p.target && !p.target.dead) {
        if (p.mesh.position.distanceTo(p.target.root.position) < (p.target.isBoss ? 0.95 : 0.55)) {
          const killed = p.target.hit(p.dmg, p.vel);
          this.hud.hit();
          this.spark(p.mesh.position, 0xffe0a0, 16, 3.4);
          if (!killed) { this.score += 60; this.hud.setState(this.hp, this.ammo, this.wave, this.score); }
          p.dead = true;
        }
      }
      // paredes
      const pp = p.mesh.position;
      if (Math.abs(pp.x) > ARENA || Math.abs(pp.z) > ARENA || pp.y < 0.02 || pp.y > 7.3 || p.life <= 0) {
        this.spark(pp, p.reflected ? 0xffd27a : 0xff8a5a, 8, 2.0);
        p.dead = true;
      }
      if (p.dead) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // oleadas
    if (this.state === 'intermission') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.startWave();
    } else if (this.state === 'playing') {
      // spawns escalonados
      this.pendingSpawn += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].t <= this.pendingSpawn) {
        const s = this.spawnQueue.shift();
        this.spawnEnemy(s.boss);
      }
      if (!this.spawnQueue.length && !this.enemies.length) {
        const bonus = 100 * this.wave;
        this.score += bonus;
        this.hud.setState(this.hp, this.ammo, this.wave, this.score);
        this.hud.banner(`OLEADA ${this.wave} LIMPIA`, `+${bonus} PUNTOS`, 2.2);
        this.nextWave(3.4);
      }
    }

    // aviso de recarga
    this.hud.reloadHint(this.ammo === 0 && this.state !== 'dead');
    this.hud.update(dt);
  }

  burst(pos, n = 14) {
    for (const d of makeDebris(this.shared, pos, n)) {
      if (!d.kind) d.kind = 'frag';
      d.max = d.life;
      this.scene.add(d.mesh);
      this.debris.push(d);
    }
  }

  killEnemy(e, pos) {
    this.kills++;
    const pts = (e.isBoss ? 600 : 120) * Math.max(1, Math.floor(this.wave / 2) + 1);
    this.score += pts;
    this.hud.setState(this.hp, this.ammo, this.wave, this.score);
    this.spark(pos, 0x9fe0ff, 26, 4.2);
    this.spark(pos, 0xffb066, 18, 3.2);
    this.burst(pos, e.isBoss ? 30 : 15);
    this.spark(pos, 0xffffff, e.isBoss ? 34 : 16, 6.0);
    if (this.audio) this.audio.explode();
    if (e.isBoss && this.hp < PLAYER_HP) {
      this.hp++;
      this.hud.setHealth(this.hp, PLAYER_HP);
    }
    if (e.hum) { try { e.hum.stop(); } catch (err) {} e.hum = null; }
  }
}
