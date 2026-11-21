// Campaña de RECARGA — cinco niveles con principio y final.
// Cada oleada declara cuántos drones y androides entran y si cierra con
// unidad pesada. El juego ya no es infinito: al limpiar el último nivel
// se muestra CAMPAÑA COMPLETADA.
//
// d = drones aéreos, b = androides de suelo, boss = unidades pesadas.

export const LEVELS = [
  {
    name: 'PATRULLA',
    tag: 'Corredor exterior · reconocimiento',
    waves: [
      { d: 3, b: 0, gap: 0.36 },
      { d: 4, b: 1, gap: 0.32 }
    ]
  },
  {
    name: 'EMBOSCADA',
    tag: 'Zona de carga · fuerza de choque',
    waves: [
      { d: 4, b: 2, gap: 0.32 },
      { d: 5, b: 2, gap: 0.30 },
      { d: 5, b: 3, gap: 0.28 }
    ]
  },
  {
    name: 'CENTINELA',
    tag: 'Núcleo de seguridad · unidad pesada',
    waves: [
      { d: 5, b: 2, gap: 0.30 },
      { d: 6, b: 3, gap: 0.28 },
      { d: 3, b: 2, gap: 0.26, boss: 1 }
    ]
  },
  {
    name: 'ASEDIO',
    tag: 'Plataforma elevada · artillería',
    waves: [
      { d: 6, b: 3, gap: 0.28 },
      { d: 6, b: 4, gap: 0.26 },
      { d: 4, b: 3, gap: 0.24, boss: 1 }
    ]
  },
  {
    name: 'NÚCLEO',
    tag: 'Sala de máquinas · aniquilación',
    waves: [
      { d: 6, b: 4, gap: 0.26 },
      { d: 8, b: 4, gap: 0.24 },
      { d: 5, b: 4, gap: 0.22, boss: 1, bossHp: 1.35 }
    ]
  }
];

export const CAMPAIGN_LENGTH = LEVELS.length;
