import * as THREE from 'three';
import { metalFloor, concrete, brushedMetal, hazard, glowSprite, hazeSprite, signTexture, floorDecal } from './textures.js';

const CY = 0x62c8ff;
const AM = 0xff9f43;

function bevelBox(w, h, d, b = 0.02, curve = 0.012) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + curve, y);
  s.lineTo(x + w - curve, y); s.quadraticCurveTo(x + w, y, x + w, y + curve);
  s.lineTo(x + w, y + h - curve); s.quadraticCurveTo(x + w, y + h, x + w - curve, y + h);
  s.lineTo(x + curve, y + h); s.quadraticCurveTo(x, y + h, x, y + h - curve);
  s.lineTo(x, y + curve); s.quadraticCurveTo(x, y, x + curve, y);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: d - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 3
  });
  g.translate(0, 0, -(d - b * 2) / 2);
  g.computeVertexNormals();
  return g;
}

export function buildArena(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const updaters = [];

  // ---------- materiales ----------
  const floorT = metalFloor();
  floorT.map.repeat.set(7, 7); floorT.roughnessMap.repeat.set(7, 7); floorT.normalMap.repeat.set(7, 7);
  const matFloor = new THREE.MeshStandardMaterial({
    map: floorT.map, roughnessMap: floorT.roughnessMap, normalMap: floorT.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    color: 0x8e9aa8, metalness: 0.62, roughness: 1.0, envMapIntensity: 1.1
  });

  const conT = concrete();
  conT.map.repeat.set(5, 2.2); conT.normalMap.repeat.set(5, 2.2);
  const matConcrete = new THREE.MeshStandardMaterial({
    map: conT.map, normalMap: conT.normalMap, normalScale: new THREE.Vector2(0.8, 0.8),
    color: 0x7b8494, metalness: 0.05, roughness: 0.92, envMapIntensity: 0.7
  });

  const brush = brushedMetal();
  brush.map.repeat.set(2, 2); brush.roughnessMap.repeat.set(2, 2);
  const matSteel = new THREE.MeshStandardMaterial({
    map: brush.map, roughnessMap: brush.roughnessMap, color: 0x9aa6b6,
    metalness: 0.95, roughness: 0.42, envMapIntensity: 1.35
  });
  const matDark = new THREE.MeshStandardMaterial({
    map: brush.map, color: 0x2b3138, metalness: 0.9, roughness: 0.55, envMapIntensity: 0.9
  });
  const matHaz = new THREE.MeshStandardMaterial({ map: hazard(), color: 0xbfc6d2, metalness: 0.5, roughness: 0.75 });
  const matNeonC = new THREE.MeshBasicMaterial({ color: 0xbfe8ff });
  const matNeonA = new THREE.MeshBasicMaterial({ color: 0xffd7a3 });

  const glowTex = glowSprite();
  const hazeTex = hazeSprite();

  // ---------- suelo ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(15.4, 15.4), matFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.MeshBasicMaterial({ map: floorDecal('07'), transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  decal.rotation.x = -Math.PI / 2; decal.position.set(0, 0.012, -1.2);
  group.add(decal);

  // ---------- techo ----------
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(15.4, 15.4), matConcrete);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 6.2;
  group.add(ceil);

  // vigas
  for (let i = -2; i <= 2; i++) {
    const beam = new THREE.Mesh(bevelBox(15.4, 0.34, 0.22, 0.02), matDark);
    beam.position.set(0, 5.92, i * 3.1);
    beam.castShadow = true;
    group.add(beam);
  }
  for (let i = -1; i <= 1; i++) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 15.2, 14), matSteel);
    pipe.rotation.z = Math.PI / 2; pipe.position.set(0, 5.55, i * 4.6 + 0.4);
    group.add(pipe);
  }

  // ---------- paredes ----------
  const wallDefs = [
    { p: [0, 3, -7.5], r: 0, w: 15.4 },
    { p: [0, 3, 7.5], r: Math.PI, w: 15.4 },
    { p: [-7.5, 3, 0], r: Math.PI / 2, w: 15.4 },
    { p: [7.5, 3, 0], r: -Math.PI / 2, w: 15.4 }
  ];
  const walls = new THREE.Group(); group.add(walls);
  wallDefs.forEach((d, i) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(d.w, 6.2), matConcrete);
    w.position.set(...d.p); w.rotation.y = d.r; w.receiveShadow = true;
    walls.add(w);
    // zócalo metálico
    const base = new THREE.Mesh(bevelBox(d.w, 1.15, 0.12, 0.015), matDark);
    base.position.set(d.p[0], 0.58, d.p[2]);
    base.rotation.y = d.r;
    base.position.x += Math.sin(d.r) * 0.07; base.position.z += Math.cos(d.r) * 0.07;
    base.receiveShadow = true;
    walls.add(base);
    // guía de neón a ras de suelo
    const strip = new THREE.Mesh(new THREE.BoxGeometry(d.w - 0.4, 0.035, 0.02), i % 2 ? matNeonA : matNeonC);
    strip.position.set(d.p[0], 1.16, d.p[2]);
    strip.rotation.y = d.r;
    strip.position.x += Math.sin(d.r) * 0.09; strip.position.z += Math.cos(d.r) * 0.09;
    walls.add(strip);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(d.w, 0.5),
      new THREE.MeshBasicMaterial({ map: glowTex, color: i % 2 ? 0xff9f43 : 0x3d9bff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.set(strip.position.x, 1.16, strip.position.z);
    halo.rotation.y = d.r;
    halo.position.x += Math.sin(d.r) * 0.02; halo.position.z += Math.cos(d.r) * 0.02;
    walls.add(halo);
  });

  // ---------- columnas ----------
  const colPos = [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]];
  colPos.forEach(([x, z]) => {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.72, 6.2, 0.72), matConcrete);
    col.position.set(x, 3.1, z); col.castShadow = true; col.receiveShadow = true;
    group.add(col);
    const band = new THREE.Mesh(bevelBox(0.8, 0.55, 0.8, 0.015), matHaz);
    band.position.set(x, 0.42, z);
    group.add(band);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.028, 8, 40), matNeonC);
    ring.position.set(x, 2.55, z); ring.rotation.x = Math.PI / 2;
    group.add(ring);
    const rg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x3d9bff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    rg.scale.set(2.4, 2.4, 1); rg.position.set(x, 2.55, z);
    group.add(rg);
  });

  // ---------- cajas ----------
  const crateSpots = [[-4.3, -5.2, 0.9], [-3.3, -5.0, 0.65], [4.2, -4.6, 1.0], [4.9, -3.6, 0.7], [-5.6, 3.9, 0.85], [5.4, 4.4, 0.95], [-2.2, 5.6, 0.75]];
  crateSpots.forEach(([x, z, s], i) => {
    const crate = new THREE.Mesh(bevelBox(s, s * 0.82, s * 0.92, 0.022, 0.03), i % 3 === 0 ? matHaz : matDark);
    crate.position.set(x, s * 0.41, z);
    crate.rotation.y = (i * 0.73) % Math.PI;
    crate.castShadow = true; crate.receiveShadow = true;
    group.add(crate);
    if (i % 2 === 0) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(s * 0.86, 0.02, s * 0.02), matNeonA);
      rim.position.set(x, s * 0.82, z + s * 0.46); rim.rotation.y = crate.rotation.y;
      group.add(rim);
    }
  });

  // ---------- bidones ----------
  [[3.1, -5.7], [3.9, -5.9], [-6.2, -2.0], [6.3, 2.4]].forEach(([x, z], i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.92, 20), matSteel);
    b.position.set(x, 0.46, z); b.castShadow = true; b.receiveShadow = true;
    group.add(b);
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.014, 6, 24), i % 2 ? matNeonA : matNeonC);
    r.rotation.x = Math.PI / 2; r.position.set(x, 0.78, z);
    group.add(r);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 20), matDark);
    t.position.set(x, 0.93, z); group.add(t);
  });

  // ---------- conductos en pared ----------
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13 + i * 0.03, 0.13 + i * 0.03, 12.5, 16), matSteel);
    p.rotation.z = Math.PI / 2;
    p.position.set(0, 3.9 + i * 0.55, -7.22);
    group.add(p);
  }
  // cables colgando
  for (let i = 0; i < 7; i++) {
    const x0 = -6 + i * 2, sag = 0.35 + (i % 3) * 0.28;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x0, 5.85, -5.2 + (i % 2) * 0.6),
      new THREE.Vector3(x0 + 0.5, 5.85 - sag, -2.0),
      new THREE.Vector3(x0 + 0.2, 5.85 - sag * 0.4, 1.5),
      new THREE.Vector3(x0 - 0.2, 5.85, 4.4)
    ]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 26, 0.018, 5, false), new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.85, metalness: 0.2 }));
    group.add(cable);
  }

  // ---------- lámparas ----------
  const lampX = [-4.4, 0, 4.4];
  lampX.forEach((x, i) => {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.15, 6), matDark);
    cable.position.set(x, 5.35, -1.8); group.add(cable);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.30, 0.26, 24, 1, true), matDark);
    housing.position.set(x, 4.72, -1.8); group.add(housing);
    const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 24), i === 1 ? matNeonA : matNeonC);
    bulb.position.set(x, 4.60, -1.8); group.add(bulb);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: i === 1 ? 0xffb066 : 0x6fc4ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.set(2.6, 2.6, 1); sprite.position.set(x, 4.55, -1.8);
    group.add(sprite);
  });

  // luces
  const hemi = new THREE.HemisphereLight(0x546a86, 0x0a0d12, 0.55);
  scene.add(hemi);

  const key = new THREE.SpotLight(0xbfe0ff, 90, 22, Math.PI / 4.2, 0.55, 1.6);
  key.position.set(0.5, 5.4, -1.6);
  key.target.position.set(0, 0, -0.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0009;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 16;
  scene.add(key); scene.add(key.target);

  const warm = new THREE.PointLight(0xff8f3c, 26, 12, 2.0);
  warm.position.set(4.4, 4.4, -1.8); scene.add(warm);
  const cool = new THREE.PointLight(0x3d9bff, 22, 14, 2.0);
  cool.position.set(-4.4, 3.4, 2.0); scene.add(cool);
  const back = new THREE.PointLight(0xff4fd8, 12, 10, 2.0);
  back.position.set(0, 2.6, 6.6); scene.add(back);

  // ---------- cartel ----------
  const signTex = signTexture(['SECTOR 07', 'TURNO DE NOCHE'], '#8fd6ff');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.6),
    new THREE.MeshBasicMaterial({ map: signTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
  sign.position.set(0, 3.5, -7.42);
  group.add(sign);
  const signGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x3d9bff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
  signGlow.scale.set(8, 5, 1); signGlow.position.set(0, 3.5, -7.5);
  group.add(signGlow);

  updaters.push((dt, t) => {
    const f = 0.86 + Math.sin(t * 21.3) * 0.03 + (Math.random() < 0.012 ? -0.35 : 0);
    sign.material.opacity = THREE.MathUtils.clamp(f, 0.35, 0.95);
    signGlow.material.opacity = 0.22 + f * 0.1;
  });

  // ---------- niebla volumétrica falsa ----------
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: hazeTex, color: i % 3 === 0 ? 0xffb070 : 0x9fc6ff, transparent: true,
      opacity: 0.045 + Math.random() * 0.05, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    const sc = 5 + Math.random() * 5;
    s.scale.set(sc, sc * 0.6, 1);
    s.position.set((Math.random() - 0.5) * 12, 1.4 + Math.random() * 3.2, (Math.random() - 0.5) * 12);
    s.userData.v = 0.04 + Math.random() * 0.08;
    group.add(s);
    updaters.push((dt) => { s.position.x += s.userData.v * dt; if (s.position.x > 7) s.position.x = -7; });
  }

  // ---------- polvo ----------
  const N = 900, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 14;
    pos[i * 3 + 1] = Math.random() * 5.6;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(pgeo, new THREE.PointsMaterial({
    color: 0xbcd6f0, size: 0.022, transparent: true, opacity: 0.5, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true
  }));
  group.add(dust);
  updaters.push((dt, t) => {
    const a = pgeo.attributes.position;
    for (let i = 0; i < N; i++) {
      let y = a.getY(i) + dt * 0.055;
      let x = a.getX(i) + Math.sin(t * 0.4 + i) * dt * 0.05;
      if (y > 5.8) y = 0.05;
      a.setY(i, y); a.setX(i, x);
    }
    a.needsUpdate = true;
  });

  return {
    group, floor,
    bounds: 6.4,
    update(dt, t) { for (const u of updaters) u(dt, t); }
  };
}
