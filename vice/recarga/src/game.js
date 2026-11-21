import * as THREE from 'three';
import { Drone, makeDebris } from './drone.js';
import { GroundBot, LaserCam } from './enemies.js';
import { Loot } from './loot.js';
import { SquadBrain } from './ai.js';
import { Arsenal, MODES } from './arsenal.js';
import { LEVELS } from './levels.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

const ARENA = 6.35;          // media anchura jugable
const OVER_TIME = 12;        // segundos de sobrecarga
const TIER_TIME = 26;        // segundos que dura un arma del arsenal
const TIER_NAMES = ['PISTOLA BASE', 'RÁFAGA', 'PLASMA DOBLE', 'ANIHILADOR'];
const AMMO = 8;              // balas del cargador base (lo gestiona Arsenal)
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
    this.brain = new SquadBrain();
    this.projectiles = [];
    this.debris = [];
    this.grenades = 0;
    this.nades = [];
    this.tracers = [];
    this.state = 'idle';
    this.hp = PLAYER_HP;
    // cargador real: Arsenal decide cuántas balas caben, cuándo se recarga
    // y qué hace cada modo de disparo
    this.arsenal = new Arsenal(0);
    this.ammo = this.arsenal.mag;
    this.reloading = false;
    this.score = 0;
    this.wave = 0;
    this.levelIdx = 0;      // nivel de campaña en curso (0..LEVELS-1)
    this.waveInLevel = 0;   // oleadas completadas dentro del nivel
    this.nextT = 0;         // cuenta atrás del cartel de nivel
    this.waveTimer = 0;
    this.pendingSpawn = 0;
    this.spawnQueue = [];
    this.time = 0;
    this.combo = 0;
    this.comboT = 0;
    this.kills = 0;
    this.overT = 0;
    this.weaponTier = 0;
    this.tierT = 0;
    this.railSpeed = 3.0;
    this._pv = new THREE.Vector3();
    this.loot = new Loot(this.scene, this.audio, this.shared);

    this._initTracers();
  }

  _initTracers() {
    // El rayo de la pistola. Antes era un THREE.Line: en WebGL una línea mide
    // siempre 1 px, así que a 2 m de distancia era prácticamente invisible.
    // Ahora es un cilindro con núcleo brillante + halo aditivo: se lee como un
    // disparo de energía y crece en pantalla como debe.
    const CORE_COL = 0xffffff, HALO_COL = 0x6ec8ff;
    for (let i = 0; i < 10; i++) {
      const grp = new THREE.Group();
      grp.frustumCulled = false;
      grp.visible = false;

      const coreGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
      const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({
        color: CORE_COL, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
      }));
      grp.add(core);

      const haloGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
      const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({
        color: HALO_COL, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
      }));
      grp.add(halo);

      this.scene.add(grp);
      this.tracers.push({ grp, core, halo, life: 0, max: 0.34 });
    }
    this.tracerIdx = 0;
    this._trUp = new THREE.Vector3(0, 1, 0);
    this._trDir = new THREE.Vector3();
    this._trQ = new THREE.Quaternion();
  }

  spawnTracer(from, to) {
    const tr = this.tracers[this.tracerIdx++ % this.tracers.length];
    const dir = this._trDir.subVectors(to, from);
    const len = Math.max(0.05, dir.length());
    dir.normalize();
    this._trQ.setFromUnitVectors(this._trUp, dir);
    tr.grp.position.copy(from).addScaledVector(dir, len * 0.5);
    tr.grp.quaternion.copy(this._trQ);
    tr.grp.visible = true;
    tr.len = len;
    tr.life = tr.max;
    // núcleo grueso y muy brillante + halo ancho: el disparo tiene que LEERSE
    tr.core.material.opacity = 1.0;
    tr.halo.material.opacity = 0.72;
    tr.core.scale.set(0.030, len, 0.030);
    tr.halo.scale.set(0.105, len, 0.105);
    // fogonazo en la boca del arma, proporcional al largo del tiro
    this.spark(from, 0xdff4ff, 6, 2.2);
  }

  // ---------- ciclo ----------
  begin() {
    this.state = 'playing';
    this.hp = PLAYER_HP;
    this.arsenal.reset();
    this.ammo = this.arsenal.mag;
    this.reloading = false;
    this.weapon.setMode(this.arsenal.modeIdx);
    this.weapon.setSpent(false);
    this.score = 0;
    this.wave = 0;
    this.kills = 0;
    this.hud.setHealth(this.hp, PLAYER_HP);
    this.hud.setAmmo(this.ammo, false);
    this.startLevel(0);
  }

  // Cargador lleno: se limpia el aviso y el arma vuelve a brillar.
  magLoaded() {
    this.weapon.setReload(0);
    this.weapon.setSpent(false);
    this.hud.reloadBar(0);
    this.hud.reloadHint(false);
    this.hud.setAmmo(this.arsenal.mag, false);
    this.hud.setState(this.hp, this.arsenal.mag, this.wave, this.score, this.arsenal.size, this.arsenal.mode.name);
    this.ammo = this.arsenal.mag;
  }

  reset() {
    this.enemies.forEach(e => { e.dispose(); });
    if (this.loot) this.loot.disposeAll();
    this.overT = 0;
    this.weaponTier = 0;
    this.tierT = 0;
    this.arsenal.setTier(0);
    this.arsenal.reset();
    this.ammo = this.arsenal.mag;
    this.reloading = false;
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

  // ---------- campaña ----------
  startLevel(i) {
    const L = LEVELS[i];
    this.levelIdx = i;
    this.wave = 0;
    this.waveInLevel = 0;
    // respiro entre niveles: +1 de integridad y cargador lleno
    if (i > 0) {
      this.hp = Math.min(PLAYER_HP, this.hp + 1);
      this.hud.setHealth(this.hp, PLAYER_HP);
    }
    this.arsenal.reset();
    this.ammo = this.arsenal.mag;
    this.reloading = false;
    this.weapon.setSpent(false);
    this.weapon.setReload(0);
    this.hud.setAmmo(this.ammo, false);
    this.hud.setLevel(i + 1, 1, L.waves.length);
    this.hud.setState(this.hp, this.ammo, 0, this.score, this.arsenal.size, this.arsenal.mode.name);
    this.hud.banner(`NIVEL ${i + 1} · ${L.name}`, L.tag, 3.0);
    if (this.audio) this.audio.waveStart();
    this.nextWave(2.6);
  }

  startWave() {
    const L = LEVELS[this.levelIdx];
    const w = L.waves[this.waveInLevel];
    this.wave++;
    this.waveInLevel++;
    this.state = 'playing';
    this.spawnQueue = [];
    let t = 0;
    const step = w.gap || 0.3;
    for (let i = 0; i < (w.d || 0); i++, t += step) this.spawnQueue.push({ t, kind: 'drone' });
    for (let i = 0; i < (w.b || 0); i++, t += step * 1.15) this.spawnQueue.push({ t, kind: 'bot' });
    for (let i = 0; i < (w.boss || 0); i++) this.spawnQueue.push({ t: 1.0 + i * 1.6, kind: 'boss' });
    this.pendingSpawn = 0;

    const total = (w.d || 0) + (w.b || 0);
    if (w.boss) this.hud.banner(`OLEADA ${this.waveInLevel}/${L.waves.length}`, 'UNIDAD PESADA DETECTADA', 3.0);
    else this.hud.banner(`OLEADA ${this.waveInLevel}/${L.waves.length}`, `OBJETIVOS: ${total}`, 2.4);
    if (this.loot) this.loot.disposeAll();
    // cajas de suministros repartidas por el corredor
    const nc = 1 + (this.waveInLevel > 1 ? 1 : 0);
    for (let i = 0; i < nc; i++) this.loot.spawnCrate(-23 - i * 7 - Math.random() * 3);
    if (this.audio) this.audio.waveStart();
    this.hud.setLevel(this.levelIdx + 1, this.waveInLevel, L.waves.length);
    this.hud.setState(this.hp, this.ammo, this.wave, this.score);
  }

  completeLevel() {
    const L = LEVELS[this.levelIdx];
    const bonus = 250 * (this.levelIdx + 1);
    this.score += bonus;
    this.hud.setState(this.hp, this.ammo, this.wave, this.score);
    if (this.levelIdx >= LEVELS.length - 1) {
      this.victory();
      return;
    }
    this.state = 'levelclear';
    this.nextT = 4.2;
    this.hud.banner(`NIVEL ${this.levelIdx + 1} COMPLETADO`, `+${bonus} PTS · PREPARANDO NIVEL ${this.levelIdx + 2}`, 4.0);
    if (this.audio) this.audio.waveStart();
  }

  victory() {
    this.state = 'victory';
    this.hud.banner('CAMPAÑA COMPLETADA', `${this.score} PTS · GATILLO PARA VOLVER A EMPEZAR`, 99);
    if (this.audio) this.audio.waveStart();
  }

  // kind: 'drone' | 'bot' | 'boss'. El nivel de campaña fija la resistencia;
  // el reparto de tipos lo decide la oleada (levels.js), no el azar.
  spawnEnemy(kind = 'drone') {
    const lv = this.levelIdx + 1;

    // --- unidad pesada: dron acorazado, cierra el nivel
    if (kind === 'boss') {
      const L = LEVELS[this.levelIdx];
      const w = L.waves[Math.max(0, this.waveInLevel - 1)] || {};
      const hp = Math.round((24 + lv * 5) * (w.bossHp || 1));
      const d = new Drone(this.scene, this.audio, this.shared, { hp, size: 0.82 });
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

    // --- androide de suelo: aguanta más y atraviesa el pasillo
    if (kind === 'bot') {
      const b = new GroundBot(this.scene, this.audio, this.shared, { hp: 4 + lv });
      b.kind = 'bot';
      b.root.position.z = -19 - Math.random() * 7;
      b.root.position.x = (Math.random() * 2 - 1) * 1.5;
      this.enemies.push(b);
      return;
    }

    // --- dron ligero: rápido, poca resistencia
    const hp = 2 + Math.floor((lv - 1) / 2);
    const d = new Drone(this.scene, this.audio, this.shared, { hp, size: 0.46 });
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
  // El arsenal decide (cargador, modo, recarga). Aquí sólo se aplica el daño,
  // así que la munición ya no es infinita: cada modo gasta y la recarga cuesta.
  tryFire(origin, dir) {
    if (this.state === 'dead') return false;
    const pull = this.arsenal.pull();
    if (!pull.ok) {
      this.weapon.dryFire();
      if (pull.empty) this.hud.banner('CARGADOR VACÍO', 'RECARGANDO', 0.9);
      this.syncAmmo();
      return false;
    }
    const M = this.arsenal.mode;
    this.weapon.fire(M.recoil, M.id);

    // cajas de suministros (bloquean el rayo principal)
    const crateHit = this.loot.shoot(new THREE.Ray(origin.clone(), dir.clone()));
    if (crateHit) {
      this.spawnTracer(origin, crateHit.pos);
      this.spark(crateHit.pos, 0xffc06a, crateHit.destroyed ? 20 : 9, crateHit.destroyed ? 3.2 : 2.2);
      if (crateHit.destroyed) {
        this.score += 50;
        this.hud.banner('SUMINISTROS', 'CAJA DESTRUIDA', 1.1);
      }
      this.syncAmmo();
      return true;
    }

    // ráfaga = varios rayos con dispersión; sobrecarga = un rayo que perfora
    for (let i = 0; i < M.shots; i++) {
      const d = dir.clone();
      if (M.spread && M.shots > 1) {
        d.x += (Math.random() * 2 - 1) * M.spread;
        d.y += (Math.random() * 2 - 1) * M.spread;
        d.z += (Math.random() * 2 - 1) * M.spread * 0.35;
        d.normalize();
      }
      this._shootRay(origin, d, M, i === 0);
    }
    this.syncAmmo();
    return true;
  }

  // Un rayo. `first` sólo pinta el fogonazo de boca una vez por pulsación.
  _shootRay(origin, dir, M, first = true) {
    const hits = [];
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
      hits.push({ e, t, rad: r, c: hc.clone() });
    }
    hits.sort((a, b) => a.t - b.t);

    // perforante: varios cuerpos en la misma línea, del más cercano al fondo
    const n = Math.min(M.pierce, hits.length);
    let last = null;
    for (let i = 0; i < n; i++) {
      const h = hits[i];
      _v2.copy(h.c).sub(origin);
      const along = _v2.dot(dir);
      const perp = Math.sqrt(Math.max(0, _v2.lengthSq() - along * along));
      const crit = perp < h.rad * 0.45;
      const dmg = Math.round(((crit ? 3 : 2) + (this.overT > 0 ? 2 : 0) + this.weaponTier) * M.dmg);
      const killed = h.e.hit(dmg, dir);
      last = origin.clone().addScaledVector(dir, h.t);
      this.spark(last, killed ? 0xfff0c4 : 0xffd9a0, killed ? 18 : 10, killed ? 3.4 : 2.6);
      this.hud.hit(crit || killed);
      if (!killed) this.score += 10;
    }
    if (last) {
      this.spawnTracer(origin, last);
      if (n > 1) this.hud.banner('PERFORANTE', n + ' OBJETIVOS', 0.5);
      return;
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
    if (first) this.spark(hit, 0xbfe6ff, 7, 1.8);
    if (this.audio) this.audio.impact();
  }

  // Pinta el estado del cargador en el HUD y avisa al arma del nivel de carga.
  syncAmmo() {
    this.ammo = this.arsenal.mag;
    this.reloading = this.arsenal.reloading;
    this.hud.setAmmo(this.ammo, this.arsenal.reloading);
    this.hud.setState(this.hp, this.ammo, this.wave, this.score, this.arsenal.size, this.arsenal.mode.name);
    this.weapon.setSpent(this.arsenal.mag <= this.arsenal.mode.cost || this.arsenal.reloading);
  }

  // Recarga manual (R en teclado, apretón de mano en VR). Si estás a tope, no
  // pasa nada; si estás a medias, es más rápida que la de emergencia.
  reloadNow() {
    if (this.state === 'dead') return false;
    if (!this.arsenal.reload()) return false;
    this.hud.reloadHint(true);
    this.hud.banner('RECARGA', this.arsenal.mag > 0 ? 'TÁCTICA' : 'SECO', 0.7);
    this.weapon.setSpent(true);
    if (this.audio) this.audio.reload();
    return true;
  }

  // Cambio de modo de disparo: semi (preciso), ráfaga (3), sobrecarga (perfora)
  cycleMode() {
    if (this.state === 'dead') return null;
    const M = this.arsenal.cycle();
    this.weapon.setMode(this.arsenal.modeIdx);
    this.hud.banner(M.name, M.hint + ' · ' + M.cost + ' BALAS', 1.1);
    this.hud.setFireMode(M.name, M.id);
    this.syncAmmo();
    if (this.audio && this.audio.click) this.audio.click();
    return M;
  }

  throwGrenade(handPos, handDir) {
    if (this.grenades <= 0 || this.state === 'dead') return false;
    if (!handPos || !handDir) return false;   // sin mano válida no se lanza ni se gasta
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
      // caja de munición: llena el cargador al momento (saltarse la recarga)
      this.arsenal.mag = this.arsenal.size;
      this.arsenal.reloadT = 0;
      this.hud.reloadHint(false);
      this.hud.banner('MUNICIÓN', 'CARGADOR LLENO · ' + this.arsenal.size, 1.2);
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
      // arsenal: cada caja sube un nivel (hasta III) y reinicia el reloj
      this.weaponTier = Math.min(3, this.weaponTier + 1);
      this.tierT = TIER_TIME;
      this.weapon.setTier(this.weaponTier);
      this.arsenal.setTier(this.weaponTier);
      this.hud.banner(TIER_NAMES[this.weaponTier], `ARMA ${this.weaponTier}/3 · ${TIER_TIME} s`, 1.5);
      this.hud.setWeapon(TIER_NAMES[this.weaponTier], this.weaponTier, TIER_TIME);
    }
    this.spark(pos, 0x9fffe0, 14, 3.0);
    if (this.audio) this.audio.reload();
    this.hud.setState(this.hp, this.ammo, this.wave, this.score);
  }

  // ---------- golpe / recarga ----------
  // Alias histórico: el arma y el audio siguen llamando a reload().
  reload() {
    return this.reloadNow();
  }

  tryWhip(handPos, handDir) {
    if (this.state === 'dead') return;
    let acted = false;


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
      mesh, glow, core, vel: dir.clone().multiplyScalar(6.6), speed: 6.6,
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
    this.hud.banner('SISTEMA CAÍDO', `GATILLO PARA REINTENTAR NIVEL ${this.levelIdx + 1}`, 99);
    this.weapon.setSpent(false);
  }

  // reintento desde el principio del nivel actual: no se pierde la campaña
  retryLevel() {
    this.enemies.forEach(e => { try { e.dispose(); } catch (err) {} });
    this.enemies.length = 0;
    for (const p of this.projectiles) this.scene.remove(p.mesh, p.glow, p.core);
    this.projectiles.length = 0;
    for (const g of this.nades) this.scene.remove(g.mesh);
    this.nades.length = 0;
    if (this.loot) this.loot.disposeAll();
    this.spawnQueue.length = 0;
    this.pendingSpawn = 0;
    this.hp = PLAYER_HP;
    this.combo = 0;
    this.comboT = 0;
    this.overT = 0;
    this.weaponTier = 0;
    this.tierT = 0;
    this.weapon.setTier(0);
    this.arsenal.setTier(0);
    this.hud.setWeapon('', 0, 0);
    this.hud.setHealth(this.hp, PLAYER_HP);
    this.startLevel(this.levelIdx);
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

    // ---- arsenal: cargador, recarga y modos de disparo ----
    const wasReloading = this.reloading;
    const magEv = this.arsenal.update(dt);
    if (magEv === 'reloaded') {
      this.magLoaded();
    } else if (this.arsenal.reloading) {
      this.weapon.setReload(this.arsenal.reloadProgress);
      this.hud.reloadBar(1 - this.arsenal.reloadProgress);
      if (!wasReloading) {
        // la recarga acaba de arrancar: aviso audible y visual inmediato
        this.hud.reloadHint(true);
        this.weapon.setSpent(true);
        if (this.audio) this.audio.reload();
      }
    } else if (wasReloading) {
      this.magLoaded();
    }
    this.reloading = this.arsenal.reloading;
    this.ammo = this.arsenal.mag;


    // trazadoras: se desvanecen y adelgazan a la vez
    for (const tr of this.tracers) {
      if (tr.life > 0) {
        tr.life -= dt;
        const k = Math.max(0, tr.life / tr.max);
        if (k <= 0) { tr.grp.visible = false; continue; }
        const e = k * k;
        tr.core.material.opacity = 0.95 * e;
        tr.halo.material.opacity = 0.55 * e;
        const w = 0.013 * (0.45 + 0.55 * k);
        tr.core.scale.set(w, tr.len, w);
        const hw = 0.055 * (0.45 + 0.55 * k);
        tr.halo.scale.set(hw, tr.len, hw);
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
    // el corredor acelera con la campaña; suave dentro del nivel
    this.railSpeed = 2.8 + this.levelIdx * 0.3 + Math.min(0.9, this.waveInLevel * 0.12);
    // OJO: aquí se usaba this.rig.position, que NO es donde está el jugador.
    // El rig se queda en z=-2.6 y la cámara (el cuerpo real, el que recibe los
    // impactos en `chest`) está en z=0: los enemigos apuntaban 2.6 m por detrás
    // y sus disparos pasaban de largo (0 impactos en 20 s). Misma referencia que
    // el hitbox: la cabeza.
    const playerPos = { x: head.x, z: head.z };

    // la escuadra piensa en grupo: roles, carriles y si el jugador recarga
    this.brain.update(dt, t, this.enemies, {
      player: playerPos,
      ammo: this.ammo,
      reloading: this.reloading
    });

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
      const evs = e.update(dt, t, playerPos, this.enemies) || [];
      // candado de riel: dentro del corredor. Los androides SÍ pueden pasarse
      // de largo (nos atraviesan); drones y cámaras no.
      const ex = e.root.position.x, ez = e.root.position.z;
      const halfW = e.kind === 'cam' ? 3.35 : 2.05;
      e.root.position.x = Math.max(-halfW, Math.min(halfW, ex));
      if (e.kind !== 'bot') {
        const minZ = playerPos.z - 3.4;
        if (e.root.position.z > minZ) e.root.position.z = minZ;
      }
      for (const ev of evs) {
        if (ev.type === 'shoot') this.spawnProjectile(ev.from, ev.dir);
        else if (ev.type === 'kill') this.killEnemy(e, ev.pos);
        else if (ev.type === 'melee') this.hitPlayer(ev.dmg);
        else if (ev.type === 'gone') this.killEnemy(e, ev.pos, true);
        else if (ev.type === 'fx') {
          if (ev.kind === 'whiff') this.spark(ev.pos, 0x8fa4b8, 5, 1.4);
          else this.spark(ev.pos, 0xffc27a, 4, 1.3);
        }
      }
      if (e.dead) {
        if (this.enemies[i] === e) this.enemies.splice(i, 1);
      }
    }

    // cajas y objetos recogibles
    const lootEvs = this.loot.update(dt, this.railSpeed, this._pv.set(head.x, 1.15, head.z));
    for (const ev of lootEvs) this.applyPickup(ev.kind, ev.pos);
    if (this.tierT > 0) {
      this.tierT -= dt;
      this.hud.setWeapon(TIER_NAMES[this.weaponTier], this.weaponTier, Math.max(0, this.tierT) / TIER_TIME);
      if (this.tierT <= 0) {
        this.tierT = 0;
        this.weaponTier = 0;
        this.weapon.setTier(0);
        this.hud.banner('ARSENAL', 'VUELTA A LA PISTOLA', 1.0);
        this.hud.setWeapon('', 0, 0);
      }
    }
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

    // oleadas y progresión de la campaña
    if (this.state === 'intermission') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.startWave();
    } else if (this.state === 'levelclear') {
      this.nextT -= dt;
      if (this.nextT <= 0) this.startLevel(this.levelIdx + 1);
    } else if (this.state === 'playing') {
      // spawns escalonados
      this.pendingSpawn += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].t <= this.pendingSpawn) {
        const s = this.spawnQueue.shift();
        this.spawnEnemy(s.kind);
      }
      if (!this.spawnQueue.length && !this.enemies.length) {
        const L = LEVELS[this.levelIdx];
        if (this.waveInLevel >= L.waves.length) {
          // último cartel del nivel: bonus y salto al siguiente
          this.completeLevel();
        } else {
          const bonus = 100 * this.waveInLevel;
          this.score += bonus;
          this.hud.setState(this.hp, this.ammo, this.wave, this.score);
          this.hud.banner(`OLEADA ${this.waveInLevel}/${L.waves.length} LIMPIA`, `+${bonus} PUNTOS`, 2.2);
          this.nextWave(3.4);
        }
      }
    }

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

  killEnemy(e, pos, escaped = false) {
    if (escaped) {
      // se ha ido de largo: no da puntos ni revienta, sólo limpia
      if (e.hum) { try { e.hum.stop(); } catch (err) {} e.hum = null; }
      return;
    }
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
