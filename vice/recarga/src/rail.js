// Corredor futurista premium: chapa industrial, nervios estructurales, holos,
// iluminación volumétrica y suelo pulido con reflejos falsos.
import * as THREE from 'three';
import { metalFloor, concrete } from './textures.js';

const SEG_LEN = 14;
const SEG_COUNT = 8;
const HALF_W = 3.55;
const HEIGHT = 5.2;
const TOTAL = SEG_LEN * SEG_COUNT;

// ---------------------------------------------------------------- texturas
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function panelTexture() {
  return canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#151a22';
    ctx.fillRect(0, 0, w, h);
    const cols = 4, rows = 4;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = x * w / cols, py = y * h / rows;
        const g = ctx.createLinearGradient(px, py, px + w / cols, py + h / rows);
        const v = 22 + Math.random() * 12;
        g.addColorStop(0, `rgb(${v + 8},${v + 12},${v + 20})`);
        g.addColorStop(1, `rgb(${v - 6},${v - 4},${v + 2})`);
        ctx.fillStyle = g;
        ctx.fillRect(px + 2, py + 2, w / cols - 4, h / rows - 4);
        ctx.strokeStyle = 'rgba(120,175,205,0.16)';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(px + 2.5, py + 2.5, w / cols - 5, h / rows - 5);
        // remaches
        ctx.fillStyle = 'rgba(190,215,235,0.22)';
        for (const [dx, dy] of [[10, 10], [w / cols - 12, 10], [10, h / rows - 12], [w / cols - 12, h / rows - 12]]) {
          ctx.beginPath();
          ctx.arc(px + dx, py + dy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // arañazos
    ctx.strokeStyle = 'rgba(225,240,255,0.055)';
    for (let i = 0; i < 70; i++) {
      ctx.beginPath();
      const x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.random() * 46 - 23, y + Math.random() * 12 - 6);
      ctx.lineWidth = Math.random() * 1.4;
      ctx.stroke();
    }
    // manchas
    for (let i = 0; i < 22; i++) {
      const g = ctx.createRadialGradient(Math.random() * w, Math.random() * h, 0, 0, 0, 90);
      ctx.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 90, 20 + Math.random() * 60);
    }
  }, [3, 2]);
}

// halo radial reutilizable para focos colgantes
let __glowCache = null;
function glowSprite() {
  if (__glowCache) return __glowCache;
  __glowCache = canvasTex(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.28, 'rgba(210,238,255,0.65)');
    g.addColorStop(0.62, 'rgba(150,205,255,0.18)');
    g.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return __glowCache;
}

function holoTexture(kind) {
  const palettes = [
    { a: '#49e6ff', b: '#0b2a33', text: 'SECTOR 07' },
    { a: '#ff9f43', b: '#2a1406', text: 'CORE BREACH' },
    { a: '#ff4b6e', b: '#2a0710', text: 'THREAT 09' },
    { a: '#8affc1', b: '#07251a', text: 'NEO//GRID' }
  ];
  const p = palettes[kind % palettes.length];
  return canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = p.b;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    // barras de datos
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = i % 3 === 0 ? p.a : 'rgba(255,255,255,0.16)';
      const bh = 6 + Math.random() * 46;
      ctx.fillRect(24 + i * 17, h - 24 - bh, 9, bh);
    }
    // marco
    ctx.strokeStyle = p.a;
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.globalAlpha = 0.9;
    ctx.font = 'bold 54px Consolas, monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(p.text, 32, 92);
    ctx.font = '20px Consolas, monospace';
    ctx.fillStyle = p.a;
    ctx.fillText('// ' + (kind % 2 ? 'HOSTILE ZONE' : 'SISTEMA ACTIVO'), 34, 130);
    ctx.globalAlpha = 1;
    // scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
  });
}

function billboardTexture(n) {
  const sets = [
    { t: 'SECTOR 07', s: 'NIVEL -3  //  ACCESO RESTRINGIDO', c: '#49e6ff', b: '#04141c' },
    { t: 'MANTENIMIENTO', s: 'UNIDADES AUTONOMAS EN PATRULLA', c: '#ff9f43', b: '#1c0d04' },
    { t: 'NEO//GRID', s: 'SINCRONIA 99.4%  //  LATIDO 62', c: '#ff3ba0', b: '#1a0410' },
    { t: 'ZONA HOSTIL', s: 'FUERZA LETAL AUTORIZADA', c: '#ff2f5a', b: '#1c0409' }
  ];
  const p = sets[n % sets.length];
  return canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = p.b;
    ctx.fillRect(0, 0, w, h);
    // rejilla tenue
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    // banda lateral de color
    ctx.fillStyle = p.c;
    ctx.fillRect(0, 0, 12, h);
    // marco
    ctx.strokeStyle = p.c;
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 14, w - 32, h - 28);
    // textos
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 62px Consolas, monospace';
    ctx.fillText(p.t, 40, 108);
    ctx.fillStyle = p.c;
    ctx.font = '22px Consolas, monospace';
    ctx.fillText(p.s, 42, 152);
    // barras de datos
    for (let i = 0; i < 18; i++) {
      const bh = 8 + Math.random() * 42;
      ctx.fillStyle = i % 4 === 0 ? p.c : 'rgba(255,255,255,0.18)';
      ctx.fillRect(42 + i * 24, 210 - bh, 10, bh);
    }
    // scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
  });
}

function hazardTexture(n) {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0f1318';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 150, w, 60);
    ctx.clip();
    for (let x = -h; x < w + h; x += 44) {
      ctx.fillStyle = x % 88 === 0 ? '#e8b13a' : '#14181e';
      ctx.beginPath();
      ctx.moveTo(x, 210);
      ctx.lineTo(x + 22, 210);
      ctx.lineTo(x + 52, 150);
      ctx.lineTo(x + 30, 150);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.font = 'bold 120px Consolas, monospace';
    ctx.fillStyle = '#bcd6e6';
    ctx.globalAlpha = 0.55;
    ctx.fillText(String(n), 36, 130);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(73,230,255,0.5)';
    ctx.fillRect(24, 24, 8, 108);
  });
}

function grateTexture() {
  return canvasTex(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#101419';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(180,205,225,0.22)';
    ctx.lineWidth = 3;
    for (let x = 0; x < w; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(160,190,215,0.14)';
    for (let y = 0; y < h; y += 22) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }, [6, 1]);
}

// ---------------------------------------------------------------- materiales
function buildMaterials(aniso = 1) {
  const panelMap = panelTexture();
  const panelDark = panelMap.clone();
  panelDark.needsUpdate = true;
  panelMap.anisotropy = aniso;
  panelDark.anisotropy = aniso;

  // Chapa de acero 1024² real: juntas fresadas, roblones, humedad, arañazos,
  // rugosidad variable y normal map derivado de la altura. Es lo que separa
  // un suelo "pintado" de un suelo que se lee como metal de verdad.
  const floorTex = metalFloor();
  for (const t of [floorTex.map, floorTex.roughnessMap, floorTex.normalMap]) {
    if (!t) continue;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1.6, 2.6);
    t.anisotropy = aniso;
    t.needsUpdate = true;
  }
  // paneles de pared de hormigón proyectado con normal map
  const wallTex = concrete();
  for (const t of [wallTex.map, wallTex.normalMap]) {
    if (!t) continue;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 1.4);
    t.anisotropy = aniso;
    t.needsUpdate = true;
  }
  return {
    panel: new THREE.MeshStandardMaterial({ map: panelMap, color: 0xffffff, metalness: 0.62, roughness: 0.48, envMapIntensity: 1.0 }),
    panelDark: new THREE.MeshStandardMaterial({ map: panelDark, color: 0x8b98a6, metalness: 0.66, roughness: 0.58, envMapIntensity: 0.9 }),
    // placa de acero cepillado: metalness moderado para que la difusa exista
    // y las sombras se lean (un suelo casi espejo se come todas las sombras)
    floor: new THREE.MeshStandardMaterial({
      map: floorTex.map, normalMap: floorTex.normalMap, roughnessMap: floorTex.roughnessMap,
      color: 0xcdd8e4, metalness: 0.5, roughness: 1.0,
      normalScale: new THREE.Vector2(1.25, 1.25), envMapIntensity: 1.1
    }),
    wall: new THREE.MeshStandardMaterial({
      map: wallTex.map, normalMap: wallTex.normalMap,
      color: 0x9aa7b6, metalness: 0.28, roughness: 0.82,
      normalScale: new THREE.Vector2(0.7, 0.7), envMapIntensity: 0.85
    }),
    trim: new THREE.MeshStandardMaterial({ color: 0x3d4a58, metalness: 1.0, roughness: 0.28 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0a0d11, metalness: 0.7, roughness: 0.7 }),
    grate: new THREE.MeshStandardMaterial({ map: grateTexture(), color: 0xa8bccd, metalness: 1.0, roughness: 0.4 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x0a2830, emissive: 0x49e6ff, emissiveIntensity: 2.4, roughness: 0.4, metalness: 0.2 }),
    warm: new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: 0xff8a3d, emissiveIntensity: 2.1, roughness: 0.4, metalness: 0.2 }),
    red: new THREE.MeshStandardMaterial({ color: 0x2a0810, emissive: 0xff2f5a, emissiveIntensity: 2.0, roughness: 0.4, metalness: 0.2 }),
    white: new THREE.MeshStandardMaterial({ color: 0x223038, emissive: 0xd8f2ff, emissiveIntensity: 2.8, roughness: 0.3, metalness: 0.1 }),
    magenta: new THREE.MeshStandardMaterial({ color: 0x2a0a1c, emissive: 0xff3ba0, emissiveIntensity: 2.3, roughness: 0.4, metalness: 0.2 }),
    amber: new THREE.MeshStandardMaterial({ color: 0x2a1a04, emissive: 0xffb347, emissiveIntensity: 2.0, roughness: 0.4, metalness: 0.2 })
  };
}

export function buildRail(world, opts = {}) {
  const group = new THREE.Group();
  group.name = 'rail';
  world.add(group);

  const M = buildMaterials(opts.aniso || 1);
  const segments = [];
  const anim = { fans: [], holos: [], arches: [], glowMats: [M.cyan, M.warm, M.white] };

  // niebla de profundidad
  let root = world;
  while (root.parent) root = root.parent;
  if (root.isScene) {
    root.fog = new THREE.FogExp2(0x05080d, 0.028);
  }

  const box = (w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    return mesh;
  };

  for (let i = 0; i < SEG_COUNT; i++) {
    const seg = new THREE.Group();
    seg.position.z = -i * SEG_LEN + 8;

    // ---- suelo
    const floor = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 + 2.4, 0.24, SEG_LEN), M.floor);
    floor.position.y = -0.12;
    seg.add(floor);
    // rejillas laterales
    for (const sx of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, SEG_LEN - 1.2), M.grate);
      g.position.set(sx * (HALF_W - 0.55), 0.012, 0);
      seg.add(g);
    }
    // guías luminosas del suelo
    for (const sx of [-1, 1]) {
      const strip = box(0.075, 0.035, SEG_LEN - 0.6, M.cyan, sx * (HALF_W - 1.15), 0.02, 0);
      seg.add(strip);
      // reflejo falso del suelo (aditivo)
      const refl = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, SEG_LEN - 0.6),
        new THREE.MeshBasicMaterial({ color: 0x49e6ff, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      refl.rotation.x = -Math.PI / 2;
      refl.position.set(sx * (HALF_W - 1.15), 0.015, 0);
      seg.add(refl);
    }
    // chevrones direccionales
    for (let c = 0; c < 5; c++) {
      const chev = box(0.5, 0.012, 0.1, M.cyan, 0, 0.01, -SEG_LEN / 2 + 1.6 + c * 2.6);
      chev.rotation.y = Math.PI / 4;
      chev.scale.set(1, 1, 0.5);
      seg.add(chev);
    }
    // placas de hazard junto a los muros
    for (const sx of [-1, 1]) {
      const hz = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshStandardMaterial({
        map: hazardTexture(i * 2 + (sx > 0 ? 1 : 0)), emissiveMap: hazardTexture(i * 2 + (sx > 0 ? 1 : 0)),
        emissive: 0xffffff, emissiveIntensity: 0.22, metalness: 0.6, roughness: 0.55
      }));
      hz.position.set(sx * (HALF_W - 1.15), 0.07, -1.5);
      hz.rotation.x = -Math.PI / 2;
      hz.rotation.z = sx * 0.04;
      seg.add(hz);
    }

    // ---- muros (tres bandas)
    for (const sx of [-1, 1]) {
      const x = sx * HALF_W;
      // banda inferior
      const low = box(0.55, 2.0, SEG_LEN, M.wall, x - sx * 0.1, 1.0, 0);
      seg.add(low);
      // banda media rehundida con aletas
      const mid = box(0.3, 1.5, SEG_LEN, M.panelDark, x + sx * 0.12, 2.75, 0);
      seg.add(mid);
      for (let f = 0; f < 7; f++) {
        const fin = box(0.22, 0.9, 0.08, M.trim, x - sx * 0.02, 2.75, -SEG_LEN / 2 + 1.2 + f * 1.9, 0, 0, sx * 0.18);
        seg.add(fin);
      }
      // banda superior inclinada
      const top = box(0.9, 0.3, SEG_LEN, M.trim, x - sx * 0.2, 3.6, 0, 0, 0, sx * 0.28);
      seg.add(top);
      // zócalo luminoso
      seg.add(box(0.06, 0.09, SEG_LEN - 0.4, M.cyan, x - sx * 0.36, 0.16, 0));
      // franja superior
      seg.add(box(0.05, 0.05, SEG_LEN - 1.0, M.white, x - sx * 0.34, 3.42, 0));
      // conductos de cable
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, SEG_LEN - 0.4, 8), M.black);
      cable.rotation.x = Math.PI / 2;
      cable.position.set(x - sx * 0.12, 2.05, 0);
      seg.add(cable);
      for (let k = 0; k < 3; k++) {
        const clip = box(0.14, 0.04, 0.16, M.trim, x - sx * 0.12, 2.05, -SEG_LEN / 2 + 2 + k * 4.4);
        seg.add(clip);
      }

      // nervio estructural cada 3.5 m
      for (let r = 0; r < 4; r++) {
        const z = -SEG_LEN / 2 + r * (SEG_LEN / 4) + 1.2;
        const rib = box(0.24, 5.0, 0.42, M.trim, x - sx * 0.34, 2.5, z);
        seg.add(rib);
        const brace = box(0.9, 0.16, 0.16, M.panelDark, x - sx * 0.72, 3.55, z, 0, 0, sx * 0.9);
        seg.add(brace);
        seg.add(box(0.07, 0.07, 0.44, M.cyan, x - sx * 0.46, 4.55, z));
        // tornillos
        seg.add(box(0.09, 0.09, 0.05, M.black, x - sx * 0.22, 0.5, z));
        seg.add(box(0.09, 0.09, 0.05, M.black, x - sx * 0.22, 4.3, z));
      }

      // panel holográfico alterno
      if ((i + (sx > 0 ? 1 : 0)) % 3 === 0) {
        const holoMap = holoTexture(i + (sx > 0 ? 2 : 0));
        const holoMat = new THREE.MeshStandardMaterial({
          map: holoMap, emissiveMap: holoMap, emissive: 0xffffff, emissiveIntensity: 1.15,
          transparent: true, opacity: 0.96, metalness: 0.2, roughness: 0.6, side: THREE.DoubleSide
        });
        const holo = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.15), holoMat);
        holo.position.set(x - sx * 0.4, 2.55, -1.2);
        holo.rotation.y = -sx * Math.PI / 2;
        seg.add(holo);
        // marco
        const frame = box(0.08, 1.4, 2.55, M.trim, x - sx * 0.45, 2.55, -1.2);
        seg.add(frame);
        // halo aditivo tras el holo
        const halo = new THREE.Mesh(
          new THREE.PlaneGeometry(3.2, 1.9),
          new THREE.MeshBasicMaterial({ color: 0x49e6ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        halo.position.copy(holo.position).add(new THREE.Vector3(-sx * 0.03, 0, 0));
        halo.rotation.y = holo.rotation.y;
        seg.add(halo);
        anim.holos.push(holoMat);
      }

      // rejilla de ventilación con ventilador
      if ((i + (sx > 0 ? 1 : 0)) % 2 === 0) {
        const grille = box(0.1, 1.15, 1.15, M.grate, x - sx * 0.32, 3.4, 3.2);
        seg.add(grille);
        const fan = new THREE.Group();
        fan.position.set(x - sx * 0.24, 3.4, 3.2);
        fan.rotation.y = -sx * Math.PI / 2;
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12), M.trim);
        hub.rotation.x = Math.PI / 2;
        fan.add(hub);
        for (let b = 0; b < 4; b++) {
          const blade = box(0.09, 0.85, 0.03, M.trim, 0, 0, 0);
          blade.geometry.translate(0, 0.42, 0);
          blade.rotation.z = b * Math.PI / 2 + 0.2;
          fan.add(blade);
        }
        seg.add(fan);
        anim.fans.push(fan);
      }

      // caja de conexiones / altavoz de pared
      if (i % 2 === 1) {
        const bx = box(0.2, 0.5, 0.7, M.panelDark, x - sx * 0.3, 1.45, 4.6);
        seg.add(bx);
        seg.add(box(0.03, 0.12, 0.5, M.warm, x - sx * 0.42, 1.45, 4.6));
      }
    }

    // ---- techo
    const ceil = box(HALF_W * 2 + 1.2, 0.3, SEG_LEN, M.panelDark, 0, HEIGHT, 0);
    seg.add(ceil);
    for (let b = 0; b < 4; b++) {
      const z = -SEG_LEN / 2 + 1.75 + b * 3.5;
      // viga transversal
      seg.add(box(HALF_W * 2, 0.22, 0.3, M.trim, 0, HEIGHT - 0.24, z));
      // luminaria
      seg.add(box(1.5, 0.09, 0.16, M.white, 0, HEIGHT - 0.4, z));
      // cono de luz volumétrico
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.15, 2.9, 18, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xbfe6ff, transparent: true, opacity: 0.05,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        })
      );
      cone.position.set(0, HEIGHT - 1.9, z);
      seg.add(cone);
      // tubos
      for (const sx of [-1, 1]) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, SEG_LEN, 8), M.trim);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(sx * 2.1, HEIGHT - 0.42, 0);
        seg.add(pipe);
      }
    }
    // tapa de registro
    seg.add(box(0.9, 0.05, 0.9, M.black, 0, HEIGHT - 0.32, -5.2));

    // ================= capa de detalle futurista =================
    // arco de neón en la junta de cada segmento (alterna magenta / cian)
    const archCol = i % 2 === 0 ? 0xff3ba0 : 0x49e6ff;
    const archMat = new THREE.MeshStandardMaterial({
      color: 0x140a12, emissive: archCol, emissiveIntensity: 2.6, metalness: 0.25, roughness: 0.38
    });
    const zA = -SEG_LEN / 2 + 0.35;
    for (const sx of [-1, 1]) {
      seg.add(box(0.14, 4.15, 0.24, archMat, sx * (HALF_W - 0.46), 2.08, zA));
      seg.add(box(0.42, 0.42, 0.3, M.trim, sx * (HALF_W - 0.46), 0.21, zA));
    }
    seg.add(box(HALF_W * 2 - 0.85, 0.17, 0.24, archMat, 0, 4.18, zA));
    // halo del arco
    const archGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_W * 2 - 0.5, 4.6),
      new THREE.MeshBasicMaterial({ color: archCol, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    archGlow.position.set(0, 2.1, zA - 0.14);
    seg.add(archGlow);
    // reflejo del arco en el suelo
    const archRefl = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_W * 2 - 1.4, 3.4),
      new THREE.MeshBasicMaterial({ color: archCol, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    archRefl.rotation.x = -Math.PI / 2;
    archRefl.position.set(0, 0.022, zA + 2.0);
    seg.add(archRefl);
    anim.arches.push(archMat);

    // guías de luz continuas en el techo
    for (const sx of [-1, 1]) {
      seg.add(box(0.12, 0.05, SEG_LEN - 0.25, M.white, sx * 1.74, HEIGHT - 0.44, 0));
      const cl = new THREE.Mesh(
        new THREE.PlaneGeometry(1.45, SEG_LEN - 0.25),
        new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      cl.rotation.x = Math.PI / 2;
      cl.position.set(sx * 1.74, HEIGHT - 0.48, 0);
      seg.add(cl);
    }

    // barras verticales de neón + lavado de color en los nervios
    for (let r = 0; r < 4; r++) {
      const zr = -SEG_LEN / 2 + r * (SEG_LEN / 4) + 1.2;
      for (const sx of [-1, 1]) {
        const neon = sx > 0 ? M.magenta : M.cyan;
        seg.add(box(0.06, 2.5, 0.06, neon, sx * (HALF_W - 0.64), 2.2, zr + 0.34));
        const wash = new THREE.Mesh(
          new THREE.PlaneGeometry(1.7, 3.4),
          new THREE.MeshBasicMaterial({ color: sx > 0 ? 0xff3ba0 : 0x49e6ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        wash.position.set(sx * (HALF_W - 0.45), 2.25, zr - 1.4);
        wash.rotation.y = -sx * Math.PI / 2;
        seg.add(wash);
      }
    }

    // cartel publicitario grande cada dos segmentos
    if (i % 2 === 0) {
      const bside = i % 4 === 0 ? -1 : 1;
      const bbMap = billboardTexture(i);
      const bbMat = new THREE.MeshStandardMaterial({
        map: bbMap, emissiveMap: bbMap, emissive: 0xffffff, emissiveIntensity: 1.3,
        transparent: true, opacity: 0.97, metalness: 0.1, roughness: 0.5, side: THREE.DoubleSide
      });
      const bb = new THREE.Mesh(new THREE.PlaneGeometry(2.95, 1.5), bbMat);
      bb.position.set(bside * (HALF_W - 0.52), 2.9, 4.3);
      bb.rotation.y = -bside * Math.PI / 2;
      seg.add(bb);
      const bGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(4.1, 2.3),
        new THREE.MeshBasicMaterial({ color: 0x49e6ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      bGlow.position.copy(bb.position).add(new THREE.Vector3(-bside * 0.05, 0, 0));
      bGlow.rotation.y = bb.rotation.y;
      seg.add(bGlow);
      anim.holos.push(bbMat);
    }

    // mazos de cable colgando del techo
    for (const sx of [-1, 1]) {
      const cbl = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.5, 6), M.black);
      cbl.position.set(sx * (HALF_W - 1.35), HEIGHT - 1.15, (i % 3) * 1.7 - 2.2);
      cbl.rotation.z = sx * 0.22;
      cbl.rotation.x = 0.12;
      seg.add(cbl);
    }

    // baliza roja de advertencia
    if (i % 3 === 2) {
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), M.red);
      beacon.position.set(0, HEIGHT - 0.58, 3.4);
      seg.add(beacon);
      const bg2 = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 1.1),
        new THREE.MeshBasicMaterial({ color: 0xff2f5a, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      bg2.position.copy(beacon.position);
      bg2.rotation.x = -Math.PI / 2;
      seg.add(bg2);
    }

    // ================= capa de detalle orgánico (curvas reales) =================
    // tuberías serpenteantes pegadas al muro + abrazaderas
    for (let pI = 0; pI < 2; pI++) {
      const sgn = pI ? 1 : -1;
      const y0 = 0.95 + pI * 1.2;
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        pts.push(new THREE.Vector3(
          sgn * (HALF_W - 0.44 - 0.07 * Math.sin(t * Math.PI)),
          y0 + 0.14 * Math.sin(t * Math.PI * 1.5),
          -SEG_LEN / 2 + t * SEG_LEN
        ));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 42, pI ? 0.052 : 0.072, 12, false),
        pI ? M.panelDark : M.trim
      );
      seg.add(tube);
      for (let k = 1; k < 6; k++) {
        const c = curve.getPoint(k / 6);
        const clamp = new THREE.Mesh(new THREE.TorusGeometry(pI ? 0.074 : 0.096, 0.021, 8, 14), M.trim);
        clamp.position.copy(c);
        clamp.rotation.y = Math.PI / 2;
        seg.add(clamp);
      }
    }
    // conducto de ventilación curvo bajo el techo
    const ductPts = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      ductPts.push(new THREE.Vector3(
        -1.2 + 0.32 * Math.cos(t * Math.PI * 1.15),
        HEIGHT - 0.66 - 0.09 * Math.sin(t * Math.PI),
        -SEG_LEN / 2 + t * (SEG_LEN - 0.4)
      ));
    }
    const ductCurve = new THREE.CatmullRomCurve3(ductPts);
    seg.add(new THREE.Mesh(new THREE.TubeGeometry(ductCurve, 30, 0.185, 14, false), M.panelDark));
    for (let k = 1; k < 4; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.028, 8, 16), M.trim);
      ring.position.copy(ductCurve.getPoint(k / 4));
      ring.rotation.x = Math.PI / 2;
      seg.add(ring);
    }
    // remaches instanciados sobre los paneles (rompe la lectura de caja plana)
    {
      const N_RIV = 48;
      const rivets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.027, 8, 6), M.trim, N_RIV);
      const mat4 = new THREE.Matrix4();
      for (let r = 0; r < N_RIV; r++) {
        const side = r < N_RIV / 2 ? -1 : 1;
        const idx = r % (N_RIV / 2);
        const row = Math.floor(idx / 4), col = idx % 4;
        mat4.makeTranslation(side * (HALF_W - 0.40), 0.38 + col * 0.5, -SEG_LEN / 2 + 1.0 + row * (SEG_LEN / 6));
        rivets.setMatrixAt(r, mat4);
      }
      rivets.instanceMatrix.needsUpdate = true;
      seg.add(rivets);
    }
    // charcos pulidos: reflejan el entorno HDR como espejo
    {
      const puddleMat = new THREE.MeshStandardMaterial({
        color: 0x05080c, metalness: 1.0, roughness: 0.05, transparent: true, opacity: 0.9
      });
      for (let p2 = 0; p2 < 3; p2++) {
        const pud = new THREE.Mesh(new THREE.CircleGeometry(0.55 + (p2 % 2) * 0.35, 22), puddleMat);
        pud.rotation.x = -Math.PI / 2;
        pud.scale.set(1, 0.5 + ((p2 * 37) % 10) / 22, 1);
        pud.position.set(((p2 * 71) % 100 / 100 - 0.5) * (HALF_W * 2 - 2.4), 0.013, -SEG_LEN / 2 + 1.6 + p2 * 4.2);
        seg.add(pud);
      }
    }


    // ================= estructura transversal del techo =================
    {
      const trussZ = -SEG_LEN / 2 + (i % 2 ? 4.2 : 9.6);
      const truss = new THREE.Group();
      truss.position.z = trussZ;
      // viga principal en cajón
      const main = box(HALF_W * 2 - 0.1, 0.26, 0.3, M.trim, 0, HEIGHT - 0.42, 0);
      truss.add(main);
      // celosía: diagonales alternas
      for (let d = 0; d < 14; d++) {
        const dx = -HALF_W + 0.5 + d * 0.48;
        const diag = box(0.055, 0.47, 0.05, M.panelDark, dx, HEIGHT - 0.16, 0, 0, 0, (d % 2 ? 1 : -1) * 0.72);
        truss.add(diag);
      }
      const lower = box(HALF_W * 2 - 0.4, 0.09, 0.14, M.panelDark, 0, HEIGHT + 0.08, 0);
      truss.add(lower);
      // tres focos colgando de la viga
      for (const lx of [-2.1, 0, 2.1]) {
        const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6), M.black);
        drop.position.set(lx, HEIGHT - 0.78, 0);
        truss.add(drop);
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.22, 14, 1, true), M.trim);
        shade.position.set(lx, HEIGHT - 1.02, 0);
        shade.rotation.x = Math.PI;
        truss.add(shade);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), M.white);
        bulb.position.set(lx, HEIGHT - 1.06, 0);
        truss.add(bulb);
        // halo
        const halo = new THREE.Mesh(
          new THREE.PlaneGeometry(1.5, 1.5),
          new THREE.MeshBasicMaterial({ map: glowSprite(), color: 0xcfefff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        halo.position.set(lx, HEIGHT - 1.05, 0.02);
        truss.add(halo);
        anim.holos.push({ mesh: halo, kind: 'flicker', phase: lx });
      }
      // cables transversales con leve comba
      for (let cb = 0; cb < 2; cb++) {
        const cz = (cb ? 1.1 : -1.1);
        const pts = [];
        for (let k = 0; k <= 6; k++) {
          const t = k / 6;
          pts.push(new THREE.Vector3(
            -HALF_W + t * HALF_W * 2,
            HEIGHT - 0.62 - Math.sin(t * Math.PI) * 0.34,
            cz
          ));
        }
        const cbl2 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.017, 6, false), M.black);
        truss.add(cbl2);
      }
      seg.add(truss);
    }

    // ================= contenedores junto al carril =================
    if (i % 2 === 0) {
      const side = (i / 2) % 2 === 0 ? -1 : 1;
      const cx = side * (HALF_W - 1.15);
      const cz = -SEG_LEN / 2 + 3.0;
      const c1 = box(0.95, 0.85, 1.25, M.panelDark, cx, 0.43, cz, 0, side * 0.09, 0);
      seg.add(c1);
      const c2 = box(0.9, 0.78, 1.1, M.panel, cx + side * 0.05, 1.24, cz + 0.06, 0, -side * 0.13, 0);
      seg.add(c2);
      // cantoneras de hazard y remates
      for (const sy of [0.06, 0.82]) {
        seg.add(box(0.98, 0.06, 1.28, M.warm, cx, sy, cz, 0, side * 0.09, 0));
      }
      // cinchas
      seg.add(box(0.04, 0.9, 0.06, M.black, cx + 0.36, 0.44, cz - 0.4, 0, 0, 0.06));
      seg.add(box(0.04, 0.86, 0.06, M.black, cx + 0.35, 1.25, cz - 0.34, 0, 0, 0.06));
    }
    // sombras: props bajos proyectan, todo recibe; el techo no proyecta para
    // que el key light siga entrando en el corredor
    seg.traverse((o) => {
      if (!o.isMesh) return;
      o.receiveShadow = true;
      if (o.position.y > 0.04 && o.position.y < 3.15) o.castShadow = true;
    });

    group.add(seg);
    segments.push({ group: seg, index: i });
  }

  // ---- partículas de polvo
  const dustGeo = new THREE.BufferGeometry();
  const N = 340;
  const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    arr[i * 3] = (Math.random() - 0.5) * 7;
    arr[i * 3 + 1] = Math.random() * 4.6;
    arr[i * 3 + 2] = -Math.random() * 30 + 4;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xaee4ff, size: 0.022, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, map: null
  }));
  group.add(dust);

  // ---- niebla baja volumétrica (planos de humo a la deriva)
  const fogTex = canvasTex(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const cx = Math.random() * w, cy = Math.random() * h, rr = 30 + Math.random() * 70;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, 'rgba(150,200,235,0.13)');
      g.addColorStop(1, 'rgba(150,200,235,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [2, 4]);
  const lowFog = new THREE.Group();
  const fogMat = new THREE.MeshBasicMaterial({
    map: fogTex, transparent: true, opacity: 0.30, depthWrite: false,
    blending: THREE.NormalBlending, side: THREE.DoubleSide
  });
  for (let i = 0; i < 10; i++) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 9.5), fogMat);
    q.rotation.x = -Math.PI / 2;
    q.rotation.z = Math.random() * Math.PI;
    q.position.set((Math.random() - 0.5) * 3, 0.28 + Math.random() * 0.5, -i * (TOTAL / 10) + 6);
    lowFog.add(q);
  }
  group.add(lowFog);

  let phase = 0;
  return {
    group,
    segments,
    update(dt, speed = 2.7) {
      phase += dt;
      const v = speed * dt;
      for (const s of segments) {
        s.group.position.z += v;
        if (s.group.position.z > 16) s.group.position.z -= TOTAL;
      }
      // pulso de neones
      const p = 0.75 + Math.sin(phase * 2.2) * 0.18;
      M.cyan.emissiveIntensity = 2.3 * p;
      M.white.emissiveIntensity = 2.5 * (0.85 + Math.sin(phase * 1.3) * 0.12);
      M.warm.emissiveIntensity = 1.9 * (0.8 + Math.sin(phase * 3.1 + 1) * 0.2);
      M.magenta.emissiveIntensity = 2.2 * (0.82 + Math.sin(phase * 1.7 + 2.4) * 0.18);
      for (let i = 0; i < anim.arches.length; i++) {
        anim.arches[i].emissiveIntensity = 2.4 * (0.85 + Math.sin(phase * 2.6 + i * 0.9) * 0.15);
      }
      // ventiladores
      for (const f of anim.fans) f.rotation.z += dt * 3.4;
      // parpadeo de holos
      for (let i = 0; i < anim.holos.length; i++) {
        const m = anim.holos[i];
        m.emissiveIntensity = 1.0 + Math.sin(phase * 5 + i * 1.7) * 0.12 + (Math.random() < 0.006 ? 0.5 : 0);
      }
      // polvo a la deriva
      dust.position.z = ((dust.position.z + v * 0.55 + 30) % 30) - 30;
      // niebla baja: deriva + giro lento
      for (let i = 0; i < lowFog.children.length; i++) {
        const q = lowFog.children[i];
        q.position.z += v * 0.9;
        if (q.position.z > 16) q.position.z -= TOTAL;
        q.rotation.z += dt * (0.02 + (i % 3) * 0.012);
      }
      fogMat.opacity = 0.26 + Math.sin(phase * 0.7) * 0.05;
      dust.rotation.y = Math.sin(phase * 0.2) * 0.03;
    }
  };
}