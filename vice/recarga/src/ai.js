// Cerebro de escuadrón: reparte roles entre los androides para que no
// caminen todos en fila india como sonámbulos.
//
//   assault  → presiona, se acerca en zigzag y busca el cuerpo a cuerpo
//   suppress → se queda a media distancia, dispara ráfagas y te obliga a moverte
//   flank    → entra por el carril contrario al que ocupas y te cierra el ángulo
//
// El reparto se refresca cada ~2 s con histéresis: un androide mantiene su rol
// mientras la escuadra no cambie de tamaño, así no bailan de un lado a otro.

const LANES = [-1.75, -0.85, 0.85, 1.75];

export class SquadBrain {
  constructor() {
    this.t = 0;
    this.next = 0;
    this.sig = -1;
    this.serial = 0;
  }

  update(dt, t, bots, intel) {
    this.t += dt;
    const live = bots.filter(b => b.kind === 'bot' && !b.dead && b.state !== 'dying');
    if (!live.length) { this.sig = -1; return; }

    // el tamaño del grupo manda: mientras no cambie, no se toca el reparto
    const ammoOut = intel && intel.ammo <= 1 ? 1 : 0;   // cargador casi vacío = ventana
    const sig = live.length * 10 + ammoOut;
    if (this.t < this.next && sig === this.sig) return;
    this.sig = sig;
    this.next = this.t + 1.7 + Math.random() * 1.3;

    const P = intel && intel.player ? intel.player : { x: 0, z: 0 };
    const dist = (b) => Math.hypot(b.root.position.x - P.x, b.root.position.z - P.z);
    const order = live.slice().sort((a, b) => dist(a) - dist(b));

    const n = order.length;
    const nSuppress = n >= 3 ? Math.max(1, Math.floor(n * 0.34)) : (n === 2 ? 1 : 0);
    const nFlank = n >= 3 ? (n >= 5 ? 2 : 1) : 0;

    // carriles barajados para que no se pisen
    const pool = LANES.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // el jugador recargando: la escuadra entera aprieta
    const pressure = ammoOut;
    let flanks = 0;

    order.forEach((b, i) => {
      if (!b.order) b.order = { role: 'assault', lane: b.lane || 0, pressure: 0 };

      let role = 'assault';
      if (i >= n - nSuppress) role = 'suppress';
      else if (i < nFlank) role = 'flank';

      let lane;
      if (role === 'flank') {
        // dos flancos = uno por cada lado; uno solo = el contrario al jugador
        const side = nFlank > 1 ? (flanks++ === 0 ? -1 : 1) : (P.x >= 0 ? -1 : 1);
        lane = side * 2.15;
      } else if (role === 'suppress') {
        // se abre un poco del centro para no taparse con el resto
        lane = (P.x >= 0 ? -1 : 1) * (0.55 + (i % 2) * 0.5);
      } else {
        lane = pool[i % pool.length];
      }

      b.order.role = role;
      b.order.lane = lane;
      b.order.pressure = pressure;
      b.order.stamp = this.serial;
    });

    // el más cercano siempre es el que embiste: no se queda mirando
    if (n > 1 && order[0].order.role === 'suppress') {
      const swap = order[order.length - 1];
      order[0].order.role = 'assault';
      order[0].order.lane = pool[0];
      swap.order.role = 'suppress';
      swap.order.lane = (P.x >= 0 ? -1 : 1) * 0.55;
    }
    this.serial++;
  }
}

export const BURST = 3;
export const BURST_GAP = 0.15;
