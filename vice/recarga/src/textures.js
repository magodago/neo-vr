import * as THREE from 'three';

// ---------- PRNG ----------
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blur(src, size, passes = 1) {
  const a = Float32Array.from(src), b = new Float32Array(size * size);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const l = y * size + (x ? x - 1 : x), r = y * size + (x < size - 1 ? x + 1 : x);
        const u = (y ? y - 1 : y) * size + x, d = (y < size - 1 ? y + 1 : y) * size + x;
        b[i] = (a[l] + a[r] + a[u] + a[d] + a[i] * 2) / 6;
      }
    }
    a.set(b);
  }
  return a;
}

// value noise + fbm
export function fbm(size, seed = 7, octaves = 5, base = 4) {
  const rand = rng(seed);
  const out = new Float32Array(size * size);
  let amp = 0.5, freq = base, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const g = new Float32Array(freq * freq);
    for (let i = 0; i < g.length; i++) g[i] = rand();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * freq, fy = (y / size) * freq;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const g00 = g[(y0 % freq) * freq + (x0 % freq)];
        const g10 = g[(y0 % freq) * freq + ((x0 + 1) % freq)];
        const g01 = g[((y0 + 1) % freq) * freq + (x0 % freq)];
        const g11 = g[((y0 + 1) % freq) * freq + ((x0 + 1) % freq)];
        const v = (g00 * (1 - sx) + g10 * sx) * (1 - sy) + (g01 * (1 - sx) + g11 * sx) * sy;
        out[y * size + x] += v * amp;
      }
    }
    norm += amp; amp *= 0.5; freq *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function tex(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function cv(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

export function normalFromHeight(h, size, strength = 2.2) {
  const c = cv(size), ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const nx = -dx, ny = -dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, false);
}

// ---------- suelo metálico ----------
export function metalFloor() {
  const S = 1024, c = cv(S), ctx = c.getContext('2d');
  const rc = cv(S), rctx = rc.getContext('2d');
  const n = fbm(S, 11, 5, 6);
  const img = ctx.createImageData(S, S), rimg = rctx.createImageData(S, S);
  const rand = rng(3);
  for (let i = 0; i < S * S; i++) {
    const v = n[i];
    // albedo legible: con 16..42 el material se leía negro bajo el tone mapping
    const base = 54 + v * 46;
    img.data[i * 4] = base * 0.92;
    img.data[i * 4 + 1] = base * 0.97;
    img.data[i * 4 + 2] = base * 1.06;
    img.data[i * 4 + 3] = 255;
    const rough = 120 + v * 90 + (rand() - 0.5) * 18;
    rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = rough;
    rimg.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);

  const P = S / 4;
  // juntas de placa
  for (let k = 0; k <= 4; k++) {
    const p = k * P;
    ctx.fillStyle = 'rgba(0,0,0,.85)'; ctx.fillRect(p - 2, 0, 4, S); ctx.fillRect(0, p - 2, S, 4);
    ctx.fillStyle = 'rgba(150,170,190,.10)'; ctx.fillRect(p + 2, 0, 1, S); ctx.fillRect(0, p + 2, S, 1);
    rctx.fillStyle = 'rgba(230,230,230,.9)'; rctx.fillRect(p - 2, 0, 4, S); rctx.fillRect(0, p - 2, S, 4);
  }
  // roblones
  for (let gx = 0; gx < 4; gx++) for (let gy = 0; gy < 4; gy++) {
    for (const [ox, oy] of [[26, 26], [P - 26, 26], [26, P - 26], [P - 26, P - 26]]) {
      const x = gx * P + ox, y = gy * P + oy;
      const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 9);
      g.addColorStop(0, 'rgba(190,200,215,.55)'); g.addColorStop(0.55, 'rgba(90,100,115,.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
      rctx.fillStyle = 'rgba(90,90,90,.6)'; rctx.beginPath(); rctx.arc(x, y, 5, 0, 7); rctx.fill();
    }
  }
  // manchas de humedad y arañazos
  for (let i = 0; i < 160; i++) {
    const x = rand() * S, y = rand() * S, w = 8 + rand() * 90, h = 40 + rand() * 260;
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(0,0,0,.20)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    const rg = rctx.createLinearGradient(x, y, x, y + h);
    rg.addColorStop(0, 'rgba(60,60,60,.55)'); rg.addColorStop(1, 'rgba(60,60,60,0)');
    rctx.fillStyle = rg; rctx.fillRect(x, y, w, h);
  }
  for (let i = 0; i < 420; i++) {
    const x = rand() * S, y = rand() * S, l = 6 + rand() * 52;
    ctx.strokeStyle = `rgba(${rand() > .5 ? '190,205,225' : '0,0,0'},${0.03 + rand() * 0.06})`;
    ctx.lineWidth = rand() > .8 ? 1.6 : 0.8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l * (rand() - 0.5), y + l * (rand() - 0.5)); ctx.stroke();
  }
  const h = fbm(S, 21, 4, 12);
  return { map: tex(c), roughnessMap: tex(rc, false), normalMap: normalFromHeight(h, S, 0.9) };
}

// ---------- hormigón ----------
export function concrete() {
  const S = 512, c = cv(S), ctx = c.getContext('2d');
  const n = fbm(S, 33, 5, 5), n2 = blur(fbm(S, 44, 3, 24), S, 2);
  const img = ctx.createImageData(S, S), rand = rng(9);
  for (let i = 0; i < S * S; i++) {
    const v = n[i] * 0.7 + n2[i] * 0.3;
    const g = 26 + v * 40 + (rand() - 0.5) * 6;
    img.data[i * 4] = g * 1.0; img.data[i * 4 + 1] = g * 1.02; img.data[i * 4 + 2] = g * 1.08;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 40; i++) {
    const x = rand() * S, y = rand() * S, w = 2 + rand() * 4, h = 60 + rand() * 200;
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(0,0,0,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, 2, S); ctx.fillRect(0, 0, S, 2);
  return { map: tex(c), normalMap: normalFromHeight(fbm(S, 55, 3, 16), S, 1.1) };
}

// ---------- metal cepillado (armas y armaduras) ----------
export function brushedMetal() {
  const S = 512, c = cv(S), ctx = c.getContext('2d'), rand = rng(17);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    const row = 0.5 + 0.5 * Math.sin(y * 0.7) + (rand() - 0.5) * 0.35;
    for (let x = 0; x < S; x++) {
      const v = 58 + row * 26 + (rand() - 0.5) * 22;
      const i = (y * S + x) * 4;
      img.data[i] = v; img.data[i + 1] = v * 1.02; img.data[i + 2] = v * 1.09; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 300; i++) {
    const y = rand() * S;
    ctx.strokeStyle = `rgba(${rand() > .5 ? '210,220,235' : '10,12,16'},${0.03 + rand() * 0.05})`;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y + (rand() - 0.5) * 2); ctx.stroke();
  }
  return { map: tex(c), roughnessMap: tex(c, false) };
}

export function hazard() {
  const S = 256, c = cv(S), ctx = c.getContext('2d');
  ctx.fillStyle = '#0d0f13'; ctx.fillRect(0, 0, S, S);
  ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(-Math.PI / 4); ctx.translate(-S, -S);
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#1a1d23' : '#c9822a'; ctx.fillRect(0, i * 40, S * 2, 20); }
  ctx.restore();
  const n = fbm(S, 71, 4, 8), img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i++) {
    const k = 0.75 + n[i] * 0.35;
    img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c);
}

// ---------- sprites ----------
export function glowSprite(inner = 'rgba(255,255,255,1)', mid = 'rgba(160,210,255,.45)') {
  const S = 256, c = cv(S), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner); g.addColorStop(0.25, mid); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function hazeSprite() {
  const S = 256, c = cv(S), ctx = c.getContext('2d');
  const n = fbm(S, 5, 4, 3), img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
    const r = Math.min(1, Math.hypot(dx, dy));
    const a = Math.pow(1 - r, 2.1) * (0.55 + n[i] * 0.9);
    img.data[i * 4] = 200; img.data[i * 4 + 1] = 215; img.data[i * 4 + 2] = 235;
    img.data[i * 4 + 3] = Math.max(0, Math.min(255, a * 255));
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function signTexture(lines, color = '#7fd0ff') {
  const W = 1024, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((ln, i) => {
    const y = H / 2 + (i - (lines.length - 1) / 2) * 170;
    ctx.font = `${i === 0 ? 800 : 500} ${i === 0 ? 150 : 56}px "Helvetica Neue",Arial,sans-serif`;
    ctx.shadowColor = color; ctx.shadowBlur = 46;
    ctx.fillStyle = color;
    ctx.fillText(ln, W / 2, y);
    ctx.shadowBlur = 14; ctx.fillStyle = '#ffffff';
    ctx.fillText(ln, W / 2, y);
  });
  // scanlines
  ctx.shadowBlur = 0;
  for (let y = 0; y < H; y += 4) { ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(0, y, W, 1.5); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function floorDecal(text) {
  const S = 512, c = cv(S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(220,235,255,.55)'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, 200, 0, 7); ctx.stroke();
  ctx.setLineDash([26, 22]); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, 160, 0, 7); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(220,235,255,.75)';
  ctx.font = '800 96px "Helvetica Neue",Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, S / 2, S / 2 + 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- rack de servidores: albedo + emisivo ----------
export function serverRack(seed = 3) {
  const S = 1024, c = cv(S), ctx = c.getContext('2d');
  const e = cv(S), ectx = e.getContext('2d');
  const R = rng(seed);

  ctx.fillStyle = '#0e1218'; ctx.fillRect(0, 0, S, S);
  ectx.fillStyle = '#000000'; ectx.fillRect(0, 0, S, S);

  // marco
  ctx.fillStyle = '#1b222b'; ctx.fillRect(0, 0, S, 26); ctx.fillRect(0, S - 26, S, 26);
  ctx.fillRect(0, 0, 26, S); ctx.fillRect(S - 26, 0, 26, S);
  ctx.fillStyle = '#2a333f'; ctx.fillRect(14, 18, S - 28, 8);

  const rows = 9, top = 40, rowH = (S - top * 2) / rows;
  for (let i = 0; i < rows; i++) {
    const y = top + i * rowH;
    // módulo
    const g = ctx.createLinearGradient(0, y, 0, y + rowH - 8);
    g.addColorStop(0, '#242c36'); g.addColorStop(0.5, '#161c24'); g.addColorStop(1, '#0d1116');
    ctx.fillStyle = g; ctx.fillRect(34, y, S - 68, rowH - 8);
    ctx.strokeStyle = 'rgba(120,150,180,.16)'; ctx.lineWidth = 2;
    ctx.strokeRect(34, y, S - 68, rowH - 8);
    // rejilla de ventilación
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    for (let k = 0; k < 16; k++) ctx.fillRect(52 + k * 12, y + 14, 6, rowH - 40);
    // asas
    ctx.fillStyle = '#39434f';
    ctx.fillRect(50, y + rowH - 26, 46, 8); ctx.fillRect(S - 96, y + rowH - 26, 46, 8);
    // LEDs
    const leds = 4 + Math.floor(R() * 4);
    for (let k = 0; k < leds; k++) {
      const lx = S - 210 + k * 26, ly = y + 24;
      const on = R() > 0.32;
      const warm = R() > 0.82;
      ctx.fillStyle = on ? (warm ? '#ffb066' : '#7df0c0') : '#1c242c';
      ctx.beginPath(); ctx.arc(lx, ly, 6, 0, 7); ctx.fill();
      if (on) {
        ectx.fillStyle = warm ? '#ff8a2a' : '#39ffb0';
        ectx.beginPath(); ectx.arc(lx, ly, 6, 0, 7); ectx.fill();
        const rg = ectx.createRadialGradient(lx, ly, 0, lx, ly, 18);
        rg.addColorStop(0, warm ? 'rgba(255,150,60,.85)' : 'rgba(60,255,190,.8)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ectx.fillStyle = rg; ectx.beginPath(); ectx.arc(lx, ly, 18, 0, 7); ectx.fill();
      }
    }
    // tira de estado
    if (i % 3 === 1) {
      ctx.fillStyle = '#123a52'; ctx.fillRect(S - 210, y + rowH - 30, 160, 6);
      ectx.fillStyle = '#1f7fd0'; ectx.fillRect(S - 210, y + rowH - 30, 160 * (0.3 + R() * 0.6), 6);
    }
  }
  // desgaste
  ctx.globalAlpha = 0.25; ctx.fillStyle = '#000';
  for (let i = 0; i < 900; i++) ctx.fillRect(R() * S, R() * S, 2 + R() * 5, 1 + R() * 2);
  ctx.globalAlpha = 1;

  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(e); emissive.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4; emissive.anisotropy = 2;
  return { map, emissive };
}
