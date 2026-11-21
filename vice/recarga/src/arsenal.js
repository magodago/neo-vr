// Arsenal: estado puro del arma (cargador, recarga y modos de disparo).
// Sin Three.js ni DOM a propósito: así la lógica se prueba headless
// (test/arsenal_test.mjs) y la partida sólo pinta lo que aquí se decide.

export const MODES = [
  {
    id: 'semi',
    name: 'SEMI',
    cost: 1,
    shots: 1,
    spread: 0,
    dmg: 1.0,
    pierce: 1,
    recoil: 1.0,
    cdMul: 1.0,
    hint: 'PRECISO'
  },
  {
    id: 'burst',
    name: 'RÁFAGA',
    cost: 3,
    shots: 3,
    spread: 0.024,
    dmg: 0.8,
    pierce: 1,
    recoil: 0.7,
    cdMul: 1.55,
    hint: '3 DISPAROS'
  },
  {
    id: 'charge',
    name: 'SOBRECARGA',
    cost: 4,
    shots: 1,
    spread: 0,
    dmg: 2.6,
    pierce: 3,
    recoil: 1.9,
    cdMul: 2.1,
    hint: 'PERFORANTE'
  }
];

const MAG_BASE = 8;          // balas por cargador sin mejoras
const MAG_PER_TIER = 2;      // cada nivel del arsenal añade cargador
const RELOAD_EMPTY = 1.15;   // recargar en seco: el enemigo tiene su ventana
const RELOAD_EARLY = 0.74;   // recarga táctica con balas dentro: más rápida
const RELOAD_PENALTY = 0.22; // si disparas en plena recarga, se alarga

export class Arsenal {
  constructor(tier = 0) {
    this.tier = Math.max(0, Math.min(3, tier | 0));
    this.modeIdx = 0;
    this.mag = this.size;
    this.reloadT = 0;
    this.reloadDur = 1;
    this.dryT = 0;
    this.shots = 0;
    this.reloads = 0;
    this.jams = 0;         // intentos de disparo en seco
  }

  get size() {
    return MAG_BASE + MAG_PER_TIER * this.tier;
  }

  get mode() {
    return MODES[this.modeIdx];
  }

  get reloading() {
    return this.reloadT > 0;
  }

  // 1 = acaba de empezar, 0 = lista. Lo usa la pose del arma.
  get reloadProgress() {
    return this.reloadDur > 0 ? Math.max(0, this.reloadT / this.reloadDur) : 0;
  }

  cycle() {
    this.modeIdx = (this.modeIdx + 1) % MODES.length;
    return this.mode;
  }

  setMode(i) {
    this.modeIdx = Math.max(0, Math.min(MODES.length - 1, i | 0));
    return this.mode;
  }

  setTier(n) {
    const prev = this.size;
    this.tier = Math.max(0, Math.min(3, n | 0));
    // al mejorar, el cargador se llena hasta arriba
    if (this.size > prev) this.mag = this.size;
    else this.mag = Math.min(this.mag, this.size);
    return this.tier;
  }

  // Recarga manual. Devuelve true si la ha arrancado.
  reload(early = this.mag > 0) {
    if (this.reloading) return false;
    if (this.mag >= this.size) return false;
    this.reloadDur = early ? RELOAD_EARLY : RELOAD_EMPTY;
    this.reloadT = this.reloadDur;
    this.reloads++;
    return true;
  }

  // Petición de disparo. No dispara nada: decide si se puede y cobra.
  // { ok, cost, left, empty, reloaded }
  pull() {
    if (this.reloading) {
      // disparar en plena recarga la estropea: se alarga y no sale bala
      this.reloadT = Math.min(this.reloadDur, this.reloadT + RELOAD_PENALTY);
      this.jams++;
      this.dryT = 0.25;
      return { ok: false, cost: 0, left: this.mag, empty: false, reloading: true };
    }
    const cost = this.mode.cost;
    if (this.mag < cost) {
      this.dryT = 0.3;
      this.jams++;
      this.reload(false);
      return { ok: false, cost: 0, left: this.mag, empty: true, reloading: this.reloading };
    }
    this.mag -= cost;
    this.shots += this.mode.shots;
    const left = this.mag;
    // cargador agotado: la recarga arranca sola, pero el hueco es real.
    // Con balas de sobra NO se recarga sola: recargar antes es decisión tuya
    // (o bajar a SEMI para gastar las últimas).
    if (left <= 0) this.reload(false);
    return { ok: true, cost, left, empty: false, reloading: this.reloading };
  }

  // Avanza el tiempo. Devuelve 'reloaded' en el frame exacto en que termina.
  update(dt) {
    if (this.dryT > 0) this.dryT = Math.max(0, this.dryT - dt);
    if (this.reloadT <= 0) return null;
    this.reloadT -= dt;
    if (this.reloadT > 0) return null;
    this.reloadT = 0;
    this.mag = this.size;
    return 'reloaded';
  }

  reset() {
    this.mag = this.size;
    this.reloadT = 0;
    this.reloadDur = 1;
    this.dryT = 0;
  }
}
