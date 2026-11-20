// ---------------------------------------------------------------------------
// rail.js — corredor infinito "en riel" (estilo Pistol Whip).
// El jugador no se mueve: el escenario avanza hacia él. Segmentos reciclados.
// Todo procedural, sin assets externos.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { metalFloor, brushedMetal, hazard, signTexture } from './textures.js';

const SEG = 16;            // largo de cada segmento (m)
const COUNT = 6;           // segmentos vivos
const TOTAL = SEG * COUNT; // 96 m de corredor
const HALF_W = 3.45;       // media anchura jugable
const H = 4.4;             // altura del techo
const FRONT = 18;          // z en el que un segmento se recicla al fondo

const ACCENTS = [0x3d9bff, 0xff4fd8, 0xff9f43];

const SIGNS = [
  ['SECTOR 07', 'MANTÉN EL RITMO'],
  ['ANILLO EXTERIOR', 'NO TE DETENGAS'],
  ['CÁMARA 04', 'PULSO ESTABLE'],
  ['LÍNEA ROJA', 'FUEGO LIBRE'],
  ['TRÁNSITO', 'SIGUE LA LUZ'],
  ['NIVEL 12', 'RESPIRA'],
];

function rnd(a, b) { return a + Math.random() * (b - a); }

export function buildRail(scene) {
  const group = new THREE.Group();
  group.name = 'rail';
  scene.add(group);

  // ------------------------------------------------------------- materiales
  const floorT = metalFloor();
  floorT.map.repeat.set(2.4, 5);
  floorT.roughnessMap.repeat.set(2.4, 5);
  floorT.normalMap.repeat.set(2.4, 5);

  const wallT = brushedMetal();
  wallT.map.repeat.set(3, 1);
  wallT.roughnessMap.repeat.set(3, 1);

  const hazT = hazard();
  hazT.repeat.set(2, 2);

  const matFloor = new THREE.MeshStandardMaterial({
    map: floorT.map, roughnessMap: floorT.roughnessMap, normalMap: floorT.normalMap,
    color: 0x8a95a6, roughness: 0.62, metalness: 0.72,
  });
  const matWall = new THREE.MeshStandardMaterial({
    map: wallT.map, roughnessMap: wallT.roughnessMap,
    color: 0x2a3140, roughness: 0.68, metalness: 0.55,
  });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x0b0f16, roughness: 0.9, metalness: 0.3 });
  const matTrim = new THREE.MeshStandardMaterial({ color: 0x1b2330, roughness: 0.42, metalness: 0.85 });
  const matHaz = new THREE.MeshStandardMaterial({ map: hazT, roughness: 0.7, metalness: 0.35 });
  const matLight = new THREE.MeshBasicMaterial({ color: 0xdff0ff });

  function neon(color, opacity = 1) {
    return new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
    });
  }

  const geoFloor = new THREE.BoxGeometry(HALF_W * 2, 0.14, SEG);
  const geoWall = new THREE.BoxGeometry(0.26, H, SEG);
  const geoCeil = new THREE.BoxGeometry(HALF_W * 2 + 0.5, 0.22, SEG);
  const geoStrip = new THREE.PlaneGeometry(0.9, SEG);
  const geoBar = new THREE.PlaneGeometry(2.6, 0.14);
  const geoPillar = new THREE.BoxGeometry(0.3, H, 0.3);
  const geoCrate = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const geoPipe = new THREE.CylinderGeometry(0.075, 0.075, SEG, 8, 1, true);
  const geoSign = new THREE.PlaneGeometry(2.6, 1.3);

  // --------------------------------------------------------------- segmento
  const segments = [];

  function buildSegment(i) {
    const seg = new THREE.Group();
    seg.userData.i = i;

    // suelo
    const floor = new THREE.Mesh(geoFloor, matFloor);
    floor.position.y = -0.07;
    floor.receiveShadow = true;
    seg.add(floor);

    // guía luminosa central (da velocidad y dirección)
    const accent = ACCENTS[i % ACCENTS.length];
    const glowL = neon(accent, 0.5);
    const guide = new THREE.Mesh(new THREE.PlaneGeometry(0.12, SEG), glowL);
    guide.rotation.x = -Math.PI / 2;
    guide.position.set(-1.5, 0.008, 0);
    seg.add(guide);
    const guide2 = guide.clone();
    guide2.position.x = 1.5;
    seg.add(guide2);

    // paredes
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(geoWall, matWall);
      wall.position.set(s * (HALF_W + 0.13), H / 2, 0);
      wall.receiveShadow = true;
      seg.add(wall);

      // zócalo y banda luminosa
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, SEG), matTrim);
      plinth.position.set(s * (HALF_W - 0.1), 0.25, 0);
      seg.add(plinth);

      const strip = new THREE.Mesh(geoStrip, neon(accent, 0.42));
      strip.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      strip.position.set(s * (HALF_W - 0.02), 1.15, 0);
      seg.add(strip);

      const strip2 = strip.clone();
      strip2.position.y = 2.75;
      strip2.material = neon(0xffffff, 0.16);
      seg.add(strip2);

      // tuberías
      for (let k = 0; k < 3; k++) {
        const pipe = new THREE.Mesh(geoPipe, matTrim);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(s * (HALF_W - 0.42), 3.05 + k * 0.22, 0);
        seg.add(pipe);
      }

      // pilares
      for (let k = 0; k < 4; k++) {
        const p = new THREE.Mesh(geoPillar, matTrim);
        p.position.set(s * (HALF_W - 0.28), H / 2, -SEG / 2 + 2 + k * 4);
        p.castShadow = true;
        seg.add(p);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.42), neon(accent, 0.55));
        cap.position.set(p.position.x, 2.4, p.position.z);
        seg.add(cap);
      }
    }

    // techo + luminarias
    const ceil = new THREE.Mesh(geoCeil, matDark);
    ceil.position.y = H + 0.11;
    seg.add(ceil);

    for (let k = 0; k < 4; k++) {
      const bar = new THREE.Mesh(geoBar, matLight);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(0, H - 0.02, -SEG / 2 + 2 + k * 4);
      seg.add(bar);
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.9), neon(0xbfe0ff, 0.1));
      halo.rotation.x = Math.PI / 2;
      halo.position.set(0, H - 0.03, bar.position.z);
      seg.add(halo);
    }

    // cajas de cobertura (decorativas, junto a la pared)
    const crates = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Mesh(geoCrate, matHaz);
      c.position.set(rnd(-1, 1) * 0.2, 0.45, rnd(-SEG / 2 + 1.5, SEG / 2 - 1.5));
      c.rotation.y = rnd(0, Math.PI);
      c.castShadow = c.receiveShadow = true;
      crates.add(c);
    }
    crates.position.x = rnd(-1, 1) > 0 ? HALF_W - 0.75 : -(HALF_W - 0.75);
    seg.add(crates);

    // cartel holográfico
    const lines = SIGNS[i % SIGNS.length];
    const signT = signTexture(lines, '#' + accent.toString(16).padStart(6, '0'));
    const signMat = new THREE.MeshBasicMaterial({
      map: signT, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sign = new THREE.Mesh(geoSign, signMat);
    const side = rnd(-1, 1) > 0 ? 1 : -1;
    sign.position.set(side * (HALF_W - 0.06), 2.0, rnd(-SEG / 2 + 3, SEG / 2 - 3));
    sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    seg.add(sign);

    // arco de portal en segmentos alternos
    if (i % 2 === 0) {
      const arch = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.055, 8, 48), neon(accent, 0.85));
      ring.position.y = 2.25;
      arch.add(ring);
      const ring2 = ring.clone();
      ring2.scale.setScalar(0.72);
      ring2.material = neon(0xffffff, 0.22);
      arch.add(ring2);
      arch.position.z = SEG / 2 - 0.6;
      seg.add(arch);
    }

    seg.userData.accents = [glowL];
    group.add(seg);
    return seg;
  }

  for (let i = 0; i < COUNT; i++) {
    const s = buildSegment(i);
    s.position.z = -i * SEG;
    segments.push(s);
  }

  // ------------------------------------------------------------- iluminación
  const hemi = new THREE.HemisphereLight(0x9fc4ff, 0x080a10, 0.55);
  group.add(hemi);

  const key = new THREE.DirectionalLight(0xcfe6ff, 0.95);
  key.position.set(2.5, 6, 4);
  group.add(key);

  const travel = new THREE.PointLight(0x66b8ff, 12, 16, 2);
  travel.position.set(0, 2.6, -3);
  group.add(travel);

  // ------------------------------------------------------------------ update
  let t = 0;
  const _p = new THREE.Vector3();

  function update(dt, speed) {
    if (!isFinite(dt)) dt = 0.016;
    if (!isFinite(speed)) speed = 2.7;
    dt = Math.min(dt, 0.1);
    // recuperación: si algún segmento quedó en NaN, se reordena el corredor
    if (segments.some(s => !isFinite(s.position.z))) {
      segments.forEach((s, i) => { s.position.z = -i * SEG; });
      t = 0;
    }
    t += dt;
    const dz = speed * dt;
    for (const s of segments) {
      s.position.z += dz;
      if (s.position.z > FRONT) {
        s.position.z -= TOTAL;
        // variación al reciclar: cajas, cartel y lado
        const crates = s.children.find(c => c.isGroup && c.children[0]?.material === matHaz);
        if (crates) {
          crates.position.x = Math.random() > 0.5 ? HALF_W - 0.75 : -(HALF_W - 0.75);
          for (const c of crates.children) {
            c.position.set(rnd(-1, 1) * 0.2, 0.45, rnd(-SEG / 2 + 1.5, SEG / 2 - 1.5));
            c.rotation.y = rnd(0, Math.PI);
          }
        }
      }
    }
    // luz de avance: parpadeo suave, anclada cerca del jugador
    travel.position.set(Math.sin(t * 0.7) * 1.2, 2.6, -3 + Math.sin(t * 1.3) * 0.6);
    travel.intensity = 10 + Math.sin(t * 3.1) * 2.2;
  }

  return {
    group,
    half: HALF_W,
    height: H,
    update,
    // punto de aparición de enemigos (fondo del corredor, delante del jugador)
    spawnZ: () => -TOTAL + 8,
  };
}
