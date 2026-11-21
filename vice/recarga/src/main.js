// RECARGA — arranque WebXR (Quest 3 standalone) + modo escritorio para QA
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { buildArena } from './arena.js';
import { buildRail } from './rail.js';
import { GameAudio } from './audio.js';
import { Weapon } from './weapon.js';
import { Hud } from './hud.js';
import { HeldNade } from './nade.js';
import { Game } from './game.js';
import { glowSprite } from './textures.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GammaCorrectionShader } from 'three/addons/shaders/GammaCorrectionShader.js';

const boot = window.__boot;
const Y = new THREE.Vector3(0, 1, 0);
const params = new URLSearchParams(location.search);
const forceDesktop = params.get('desktop') === '1';

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);
scene.fog = new THREE.FogExp2(0x05070b, 0.026);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.04, 160);
camera.position.set(0, 1.62, 0);
scene.add(camera);

// post-proceso solo fuera de XR: el bloom real hace florecer el neón.
// En el visor el WebXR no admite render a render-target, así que allí mandan
// los halos aditivos y el tone mapping (mismo look, sin coste).
let composer = null;
// depuración de contraste: congelar la simulación y comparar con/sin bloom
let frozenFrame = false;
let bloomOff = false;
function buildComposer() {
  if (composer) return composer;
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // umbral alto: solo florece lo que de verdad es emisivo (neón, ojos, fogonazo).
  // con umbral bajo el pasillo se lava en blanco.
  // bloom medido en histograma: fuerza .34 / radio .55 / umbral 1.05 metía halo en TODA
  // la escena (0 % de píxeles oscuros, imagen gris lechosa). Con .15 / .30 / 1.6 el neón
  // brilla y los negros siguen negros (30 % de píxeles < 40 frente a 31 % sin post).
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 0.15, 0.30, 1.6
  );
  composer.addPass(bloom);
  // cierre a sRGB; el tone mapping ACES ya lo aplica el material del RenderPass
  composer.addPass(new ShaderPass(GammaCorrectionShader));

  // Acabado fotográfico: aberración cromática radial mínima, viñeta y grano.
  // Sin esto la imagen se lee "motor 3D"; con esto se lee "cámara".
  const finish = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uTime: { value: 0 },
      uVig: { value: 0.55 }, uGrain: { value: 0.05 }, uCA: { value: 0.0018 }
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain, uCA;
      varying vec2 vUv;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 d = vUv - 0.5;
        float r2 = dot(d, d);
        float k = uCA * r2;
        vec3 c;
        c.r = texture2D(tDiffuse, vUv + d * k).r;
        c.g = texture2D(tDiffuse, vUv).g;
        c.b = texture2D(tDiffuse, vUv - d * k).b;
        float v = smoothstep(1.05, 0.18, r2 * 2.3);
        c *= mix(1.0, v, uVig);
        float g = h21(vUv * vec2(1920.0, 1080.0) + fract(uTime * 7.13));
        c += (g - 0.5) * uGrain;
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  finish.material.onBeforeRender = () => {
    finish.uniforms.uTime.value = performance.now() * 0.001;
  };
  composer.addPass(finish);
  return composer;
}

// Polvo en suspensión: 1400 motas aditivas a lo largo del corredor.
// Da profundidad y paralaje; cuesta prácticamente nada.
function addMotes(parent) {
  const N = 1400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 13;
    pos[i * 3 + 1] = Math.random() * 5.4;
    pos[i * 3 + 2] = Math.random() * 96 - 26;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    size: 0.028, color: 0xd6ecff, transparent: true, opacity: 0.42,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.onBeforeRender = () => {
    const t = performance.now() * 0.001;
    p.position.y = Math.sin(t * 0.33) * 0.14;
    p.position.x = Math.sin(t * 0.19) * 0.22;
    m.opacity = 0.34 + Math.sin(t * 0.7) * 0.1;
  };
  parent.add(p);
}

// luz de casco: rim suave que hace leer los materiales cercanos
const headLamp = new THREE.PointLight(0xdfefff, 4.2, 7.5, 2.0);
headLamp.position.set(0, 0.05, 0.15);
camera.add(headLamp);

// mundo jugable: se traslada/rota para la locomoción (la cámara XR manda)
const world = new THREE.Group();
scene.add(world);

// ---------------------------------------------------------------- luces
// La iluminación vive en arena.js (una sola fuente de verdad).
// Aquí solo dejamos un relleno hemisférico mínimo y la lámpara del visor.
const hemi = new THREE.HemisphereLight(0x9ec9ff, 0x080a10, 0.22);
scene.add(hemi);


// ---------------------------------------------------------------- entorno
let arena = null;
let rail = null;
let audio = null;
let weapon = null;
let hud = null;
let game = null;
const shared = { glow: glowSprite() };

function setup() {
  arena = buildArena(world);
  arena.group.visible = false;   // el combate ocurre en el corredor en riel
  rail = buildRail(world, { aniso: renderer.capabilities.getMaxAnisotropy() });
  addMotes(world);
  audio = new GameAudio();
  weapon = new Weapon(camera, audio, shared);
  hud = new Hud(camera);
  game = new Game({ scene: world, audio, shared, weapon, hud, rig: world });
  audio.setListener(camera);
}

// ---------------------------------------------------------------- entorno HDR
async function loadEnv() {
  try {
    const tex = await new RGBELoader().loadAsync('./data/studio.hdr');
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    scene.environmentIntensity = 0.9;
    tex.dispose();
    pmrem.dispose();
  } catch (e) {
    // sin HDR seguimos: los materiales tienen envMapIntensity bajo
    console.warn('[recarga] sin entorno HDR', e && e.message);
  }
}

// ---------------------------------------------------------------- jugador
const viewPos = new THREE.Vector3(0, 0, 2.6); // posición del jugador en coordenadas del mundo
let yaw = 0;                                   // giro del mundo alrededor del jugador
const PLAY_LIMIT = 5.3;

function applyWorld() {
  world.rotation.y = yaw;
  world.position.copy(viewPos).multiplyScalar(-1).applyAxisAngle(Y, yaw);
}

function toPlayPos(v) { return world.worldToLocal(v.clone()); }
function toPlayDir(v) { return v.clone().applyQuaternion(world.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize(); }

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const ZERO3 = new THREE.Vector3();
function moveBy(dx, dz) {
  camera.getWorldDirection(_fwd);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
  _fwd.normalize().applyAxisAngle(Y, -yaw);
  _right.crossVectors(_fwd, Y).normalize().multiplyScalar(-1);
  viewPos.addScaledVector(_fwd, dz).addScaledVector(_right, dx);
  if (viewPos.length() > PLAY_LIMIT) viewPos.setLength(PLAY_LIMIT);
  applyWorld();
}

function snapTurn(sign) {
  yaw += sign * Math.PI / 6;
  applyWorld();
}

// ---------------------------------------------------------------- HUD de QA (solo escritorio)
const diagOn = params.get('diag') === '1'; // HUD técnico solo con ?diag=1
const diag = document.createElement('div');
diag.style.cssText = 'position:fixed;left:10px;top:10px;z-index:5;font:11px/1.45 ui-monospace,monospace;color:#8fe3ff;' +
  'background:rgba(5,7,11,.62);border:1px solid rgba(98,200,255,.22);padding:6px 9px;border-radius:3px;pointer-events:none;white-space:pre';
document.body.appendChild(diag);

// ---------------------------------------------------------------- arma / manos
const gripL = renderer.xr.getControllerGrip(0);
const gripR = renderer.xr.getControllerGrip(1);
const rayL = renderer.xr.getController(0);
const rayR = renderer.xr.getController(1);
scene.add(gripL, gripR, rayL, rayR);
function makeRay(len = 1.0, color = 0x62c8ff, op = 0.22) {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -len)]);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
}
rayR.add(makeRay(0.55, 0x9fe0ff, 0.28));
rayL.add(makeRay(0.45, 0xff9f43, 0.22));

// brazalete de energía en la mano libre (la que golpea)
function makeBracer() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.043, 0.038, 0.075, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1a212b, metalness: 0.9, roughness: 0.34, side: THREE.DoubleSide })
  );
  shell.rotation.x = Math.PI / 2;
  g.add(shell);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.044, 0.0045, 8, 26),
    new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ring.position.z = -0.028;
  g.add(ring);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.014, 14, 12),
    new THREE.MeshBasicMaterial({ color: 0xffcf9a, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  core.position.z = -0.05;
  g.add(core);
  return { group: g, ring, core };
}
const bracer = makeBracer();
gripL.add(bracer.group);
bracer.group.position.set(0, -0.01, -0.02);

// ---------------------------------------------------------------- mando / entrada
let gunGrip = null;
let whipGrip = null;
const heldNade = new HeldNade();
let gunSource = null;
let rightSource = null;
let leftSource = null;
let rightIdx = 1;
let leftIdx = 0;

// Mano del arma: 'right' o 'left'. Se puede forzar con ?mano=izq y se recuerda.
const HAND_KEY = 'recarga.mano';
let gunHand = 'right';
try {
  const q = new URLSearchParams(location.search).get('mano');
  const saved = q || localStorage.getItem(HAND_KEY);
  if (saved === 'izq' || saved === 'left') gunHand = 'left';
  else if (saved === 'der' || saved === 'right') gunHand = 'right';
} catch (e) { /* sin almacenamiento: derecha por defecto */ }

function setGunHand(h) {
  gunHand = h === 'left' ? 'left' : 'right';
  try { localStorage.setItem(HAND_KEY, gunHand === 'left' ? 'izq' : 'der'); } catch (e) {}
  const b = document.getElementById('mano');
  if (b) b.textContent = gunHand === 'left' ? 'Arma: izquierda' : 'Arma: derecha';
  if (boundHands) { boundHands = false; bindHands(); }
}
{ const b = document.getElementById('mano'); if (b) b.textContent = gunHand === 'left' ? 'Arma: izquierda' : 'Arma: derecha'; }

let boundHands = false;
function bindHands() {
  if (boundHands) return;
  const session = renderer.xr.getSession();
  if (!session) return;
  const sources = Array.from(session.inputSources).filter((s) => s.targetRayMode === 'tracked-pointer');
  if (sources.length === 0) return;
  boundHands = true;
  sources.forEach((src, i) => {
    const grip = renderer.xr.getControllerGrip(i);
    const ray = renderer.xr.getController(i);
    const isGun = src.handedness === gunHand;
    if (src.handedness === 'right') { rightIdx = i; rightSource = src; }
    else if (src.handedness === 'left') { leftIdx = i; leftSource = src; }
    // el arma va en el espacio de puntería (ray): el cañón queda alineado con el rayo
    if (isGun) { gunGrip = ray; gunSource = src; } else whipGrip = grip;
    ray.addEventListener('selectstart', isGun ? onFire : onWhip);
    // apretón (squeeze): en el arma cambia el cargador, en la mano libre lanza granada
    ray.addEventListener('squeezestart', isGun ? () => { if (game) game.reloadNow(); } : onNade);
    ray.addEventListener('connected', () => { if (ray.children.length === 0) ray.add(makeRay(isGun ? 0.55 : 0.45, isGun ? 0x9fe0ff : 0xff9f43, 0.26)); });
  });
  if (!gunGrip) gunGrip = renderer.xr.getController(gunHand === 'left' ? leftIdx : rightIdx);
  if (!whipGrip) whipGrip = renderer.xr.getControllerGrip(gunHand === 'left' ? rightIdx : leftIdx);
  if (bracer.group.parent !== whipGrip) whipGrip.add(bracer.group);
  if (heldNade && heldNade.group.parent !== whipGrip) heldNade.mount(whipGrip);
  mountGun();
}

function mountGun() {
  if (!weapon || !gunGrip) return;
  const pose = weapon.handPose(gunHand === 'left' ? -1 : 1);
  weapon.mount(gunGrip, pose.pos, pose.rot);
}

renderer.xr.addEventListener('sessionstart', () => {
  bindHands();
  applyWorld();
  if (game.state === 'idle') game.begin();
  else if (game.state === 'dead') game.retryLevel();
});
renderer.xr.addEventListener('sessionend', () => {
  boundHands = false;
  if (document.exitPointerLock) document.exitPointerLock();
});
renderer.xr.getController(0).addEventListener('connected', () => { if (renderer.xr.isPresenting) bindHands(); });
renderer.xr.getController(1).addEventListener('connected', () => { if (renderer.xr.isPresenting) bindHands(); });

// disparo
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
let fireCd = 0;
function onFire() {
  if (!game) return;
  // fin de partida: el gatillo reintenta el nivel; tras la campaña, reinicia
  if (game.state === 'dead') { game.retryLevel(); return; }
  if (game.state === 'victory') { game.reset(); game.begin(); return; }
  const now = performance.now();
  // cadencia: sube con el arsenal temporal (arma de nivel 3 dispara ~2x)
  const cd = 96 / (1 + (game.weaponTier || 0) * 0.34);
  if (now - fireCd < cd) return;
  fireCd = now;
  if (desktop) {
    // en escritorio la mira es el centro de la pantalla: el rayo sale de la cámara.
    // (desde el cañón había 5-6° de desvío por el montaje a la derecha y no daba ni al
    // enemigo más cercano a 10 m)
    camera.getWorldPosition(_o);
    camera.getWorldDirection(_d);
    _o.addScaledVector(_d, 0.4);
  } else {
    weapon.muzzleWorld(_o);
    weapon.aimDir(_d);
  }
  game.tryFire(toPlayPos(_o), toPlayDir(_d));
  if (gunSource && gunSource.gamepad && gunSource.gamepad.hapticActuators && gunSource.gamepad.hapticActuators[0]) {
    gunSource.gamepad.hapticActuators[0].pulse(0.35, 45);
  }
  // munición ilimitada: nunca hay aviso de recarga
}

const _hp = new THREE.Vector3();
const _hd = new THREE.Vector3();
function onWhip() {
  if (!game) return;
  const h = whipGrip || gripL;
  h.getWorldPosition(_hp);
  h.getWorldDirection(_hd);
  game.tryWhip(toPlayPos(_hp), toPlayDir(_hd));
  bracer.ring.scale.setScalar(1.9);
  bracer.core.scale.setScalar(2.2);
}

// mano libre: agarra con fuerza para lanzar granada
function onNade() {
  if (!game) return;
  const h = whipGrip || gripL;
  h.getWorldPosition(_hp);
  h.getWorldDirection(_hd);
  const p = toPlayPos(_hp), d = toPlayDir(_hd);
  if (game.throwGrenade(p, d)) { heldNade.kick(); heldNade.update(0, 0, 0); }
  else game.tryWhip(p, d);
}

// ---------------------------------------------------------------- escritorio
const keys = new Set();
let desktop = false;
let mouseLook = false;

function startDesktop() {
  desktop = true;
  window.__recarga = { get game() { return game; }, weapon, hud, world, scene, renderer, camera, rail, arena, THREE, onFire, onWhip, onNade, dbg: { freeze: (v) => { frozenFrame = !!v; }, noBloom: (v) => { bloomOff = !!v; }, composer: () => buildComposer() } };
  document.body.style.cursor = 'crosshair';
  boot && boot.prog(1, '');
  const el = document.getElementById('boot');
  if (el) el.classList.add('hide');
  if (game.state === 'idle') game.begin();
  else if (game.state === 'dead') game.retryLevel();
  if (audio) { audio.init(); audio.ambient(); }
  // en escritorio el arma se cuelga de la cámara (en el visor va al mando)
  if (weapon) weapon.mount(camera, new THREE.Vector3(0.145, -0.175, -0.30), new THREE.Euler(-0.04, 0.02, 0.02));
  renderer.domElement.addEventListener('click', () => {
    if (!mouseLook) renderer.domElement.requestPointerLock();
    else onFire();
  });
  document.addEventListener('pointerlockchange', () => { mouseLook = document.pointerLockElement === renderer.domElement; });
  document.addEventListener('mousemove', (e) => {
    if (!mouseLook) return;
    yaw -= e.movementX * 0.0022;
    applyWorld();
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('mousedown', (e) => { if (mouseLook && e.button === 2) onWhip(); });
  // rueda del ratón: cambia de modo de disparo sin soltar el apuntado
  renderer.domElement.addEventListener('wheel', (e) => {
    if (!mouseLook || !game) return;
    e.preventDefault();
    game.cycleMode();
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyR') { if (game) game.reloadNow(); }
    if (e.code === 'KeyE') onWhip();
    if (e.code === 'KeyQ' || e.code === 'KeyF') { if (game) game.cycleMode(); }
    if (e.code === 'KeyG') onNade();
    if (e.code === 'Space') onFire();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
}

function desktopTick(dt) {
  let f = 0, s = 0;
  if (keys.has('KeyW')) f += 1;
  if (keys.has('KeyS')) f -= 1;
  if (keys.has('KeyA')) s -= 1;
  if (keys.has('KeyD')) s += 1;
  if (f || s) { const l = Math.hypot(f, s); moveBy(s / l * 2.6 * dt, f / l * 2.6 * dt); }
  if (keys.has('ArrowLeft')) snapTurn(1);
  if (keys.has('ArrowRight')) snapTurn(-1);
}

// ---------------------------------------------------------------- menú (corredor vivo detrás del título)
let menuT = 0;
function menuActive() {
  const b = document.getElementById('boot');
  return !!b && !b.classList.contains('hide');
}
function menuTick(dt) {
  menuT += dt;
  const sway = Math.sin(menuT * 0.11);
  camera.position.set(sway * 1.15, 1.6 + Math.sin(menuT * 0.27) * 0.035, 2.9 + Math.cos(menuT * 0.07) * 0.55);
  camera.quaternion.setFromEuler(new THREE.Euler(
    -0.02 + Math.sin(menuT * 0.19) * 0.012,
    sway * 0.07,
    Math.sin(menuT * 0.13) * 0.006
  ));
}

// ---------------------------------------------------------------- bucle
const clock = new THREE.Clock();
let acc = 0, frames = 0, fps = 0, lastDiag = 0;

function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  if (desktop) desktopTick(dt);

  if (audio) audio.resume();
  if (arena) arena.update(dt, t);
  const inMenu = menuActive();
  if (inMenu) menuTick(dt);
  const railV = inMenu ? 0.42 : (game && isFinite(game.railSpeed) ? game.railSpeed : 2.7);
  if (rail) rail.update(dt, railV);
  if (game) {
    const head = toPlayPos(camera.getWorldPosition(_hp));
    game.update(dt, t, head);
  }
  if (hud) hud.update(dt, t);
  if (weapon) weapon.update(dt, t, ZERO3, ZERO3);
  if (heldNade && game) heldNade.update(dt, t, game.grenades);

  const bs = bracer.ring.scale.x;
  if (bs > 1.002) {
    const k = 1 + (bs - 1) * Math.exp(-dt * 9);
    bracer.ring.scale.setScalar(k);
    bracer.core.scale.setScalar(1 + (k - 1) * 1.3);
  }

  if (diagOn && desktop) {
    frames++; acc += dt;
    if (acc > 0.5) { fps = Math.round(frames / acc); frames = 0; acc = 0; }
    if (t - lastDiag > 0.25) {
      lastDiag = t;
      const st = game ? game.state : '-';
      diag.textContent = `RECARGA · ${fps} fps\nestado ${st} · vida ${game ? game.hp : '-'} · balas ${game ? game.ammo : '-'}\nola ${game ? game.wave : '-'} · puntos ${game ? game.score : '-'}\nbots ${game ? game.enemies.length : '-'} · yaw ${yaw.toFixed(2)}\n[clic] bloquear/ratón · [WASD] mover · [clic] disparar · [E] golpe`;
    }
  }
  if (frozenFrame) { renderFrame(); return; }
  renderFrame();
}

function renderFrame() {
  if (renderer.xr.isPresenting || bloomOff) renderer.render(scene, camera);
  else buildComposer().render();
}

// ---------------------------------------------------------------- entrada
const supportsXR = navigator.xr && navigator.xr.isSessionSupported;

async function canVR() {
  try { return supportsXR ? await navigator.xr.isSessionSupported('immersive-vr') : false; } catch (e) { return false; }
}

async function enter() {
  if (audio) { audio.init(); audio.ambient(); }
  const vr = !forceDesktop && await canVR();
  if (!vr) { startDesktop(); return; }
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
    });
    renderer.xr.setSession(session);
    const el = document.getElementById('boot');
    if (el) el.classList.add('hide');
  } catch (e) {
    boot && boot.fail('No se pudo iniciar la sesión VR: ' + (e.message || e.name));
  }
}

// ---------------------------------------------------------------- init
(async () => {
  try {
    boot && boot.prog(0.15, 'Mampostería del sector');
    setup();
    applyWorld();
    boot && boot.prog(0.55, 'Iluminación volumétrica');
    await loadEnv();
    boot && boot.prog(0.85, 'Calibrando el pulso');
    renderer.compile(scene, camera);
    window.__recarga = { game, weapon, hud, world, THREE, onFire, onWhip, camera , dbg: { freeze: (v) => { frozenFrame = !!v; }, noBloom: (v) => { bloomOff = !!v; }, composer: () => buildComposer() } };
    renderer.setAnimationLoop(tick);
    boot && boot.ready('Entrar');
    const go = document.getElementById('go');
    if (go) go.addEventListener('click', enter);
    const manoBtn = document.getElementById('mano');
    if (manoBtn) manoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setGunHand(gunHand === 'left' ? 'right' : 'left');
    });
    if (forceDesktop) startDesktop();
  } catch (e) {
    console.error(e);
    boot && boot.fail('Fallo de arranque: ' + (e.message || e));
  }
})();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});
