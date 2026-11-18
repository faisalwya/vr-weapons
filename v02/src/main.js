// Weapons Sandbox VR, draft v02 · the clearing
// Rendering, headset input (controllers), moving around (jump and snap turn), the sign, sound, haptics and the loop.
// The forest is in forest.js, things to hit in targets.js, the sword and pistol in weapons.js.

import * as THREE from 'three';
import { COL, createParticles, createAudio, SWAY, toon, merge, M4, smoothNormals, outlineMat } from './fx.js';
import { createForest, CLEAR_R } from './forest.js';
import { createTargets } from './targets.js';
import { createWeapons } from './weapons.js';
import { createDemo, DEMO_STAND } from './demo.js';

const $ = id => document.getElementById(id);
const V3 = THREE.Vector3, Q = THREE.Quaternion;

const stats = { cuts: 0, parts: 0, shots: 0, hits: 0, cans: 0, puffs: 0, smashed: 0, critters: 0, lanterns: 0, gongs: 0, bubbles: 0, sticks: 0, recalls: 0, reloads: 0, throws: 0 };
let lastNote = '';

/* ---------- renderer ---------- */
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, 0.03, 320);
function resize() {
  if (renderer.xr.isPresenting) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = camera.aspect < 1 ? 78 : 60; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const particles = createParticles(scene);
const audio = createAudio(() => renderer.xr.isPresenting);
const forest = createForest(scene, particles);
const targets = createTargets(scene, { particles, audio, forest });
const weaponEvents = [];
const weapons = createWeapons(scene, { targets, particles, audio, buzz, emit: e => weaponEvents.push(e) });

/* ---------- the sign: a painted board on two posts ---------- */
const FONT = '"Barlow Condensed","Arial Narrow",sans-serif', TITLE = '"Bangers","Impact",sans-serif';
const sign = (() => {
  const canvas = document.createElement('canvas'); canvas.width = 1500; canvas.height = 1000;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshBasicMaterial({ map: tex }));
  board.position.set(0, 1.55, 0.035); g.add(board);
  const frameGeo = smoothNormals(merge([
    [new THREE.BoxGeometry(1.6, 1.1, 0.05), COL.barkDark, M4(0, 1.55, 0)],
    [new THREE.CylinderGeometry(0.05, 0.06, 2.2, 7), COL.bark, M4(-0.72, 1.1, -0.04)], [new THREE.CylinderGeometry(0.05, 0.06, 2.2, 7), COL.bark, M4(0.72, 1.1, -0.04)],
    [new THREE.BoxGeometry(1.75, 0.08, 0.1), COL.wood, M4(0, 2.12, -0.01, 0, 0, 0.02)],
  ]));
  const frame = new THREE.Mesh(frameGeo, toon(0xffffff, { vertexColors: true })); frame.add(new THREE.Mesh(frameGeo, outlineMat(0.012))); g.add(frame);
  g.position.set(-2.5, 0, -0.75); g.lookAt(0, 0, 0.2); scene.add(g);
  return { canvas, tex, key: '' };
})();
const SIGN_LINES = [
  ['SWORD', 'Reach over your right shoulder, squeeze grip to draw. Swing hard to cut.'],
  ['PISTOL', 'Right hip. Trigger fires. A or X reloads.'],
  ['TARGETS', 'Bottles on the fence, pots on the stones, melons on the stumps, lanterns on the rope, critters that pop up by the gate, bubbles, and the gong at the back.'],
  ['PUT AWAY', 'Let go at the holster. Let go anywhere else to drop or throw.'],
  ['RECALL', 'Empty hand: hold grip, pull the trigger.'],
  ['MOVE', 'Left stick forward to aim a jump, release to land. Right stick turns.'],
];
function drawSign() {
  const key = JSON.stringify(stats) + lastNote;
  if (key === sign.key) return; sign.key = key;
  const g = sign.canvas.getContext('2d'), W = sign.canvas.width, H = sign.canvas.height;
  // painted planks
  g.fillStyle = '#e9d9b8'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? 'rgba(120,80,40,.06)' : 'rgba(255,255,255,.05)'; g.fillRect(0, i * 200, W, 200); g.fillStyle = 'rgba(60,40,20,.25)'; g.fillRect(0, i * 200 + 198, W, 3); }
  g.fillStyle = '#1b1622'; g.font = `400 120px ${TITLE}`; g.fillText('THE GALLERY', 60, 140);
  g.fillStyle = '#d8432a'; g.font = `700 40px ${FONT}`; g.fillText('WEAPONS SANDBOX · DRAFT V02', 66, 196);
  let y = 290;
  for (const [k, text] of SIGN_LINES) {
    g.fillStyle = '#d8432a'; g.font = `700 44px ${FONT}`; g.fillText(k, 66, y);
    g.fillStyle = '#2a2430'; g.font = `600 44px ${FONT}`;
    let line = '';
    for (const word of text.split(' ')) { if (g.measureText(line + word).width > W - 360) { g.fillText(line, 300, y); y += 50; line = ''; } line += word + ' '; }
    g.fillText(line, 300, y); y += 72;
  }
  g.fillStyle = '#1b1622'; g.fillRect(60, H - 140, W - 120, 4);
  g.font = `700 44px ${FONT}`;
  g.fillText(`${stats.hits}/${stats.shots} shots hit · ${stats.cuts} cuts · ${stats.critters} critters · ${stats.smashed} smashed · ${stats.cans} cans · ${stats.gongs} gongs`, 66, H - 80);
  g.font = `600 40px ${FONT}`; g.fillStyle = '#5d5148'; g.fillText(lastNote || 'Everything grows back. Cans hop home.', 66, H - 30);
  sign.tex.needsUpdate = true;
}

/* ---------- headset input: controllers ---------- */
const xr = [0, 1].map(i => {
  const s = { ray: renderer.xr.getController(i), grip: renderer.xr.getControllerGrip(i), src: null };
  s.ray.addEventListener('connected', e => { s.src = e.data; });
  s.ray.addEventListener('disconnected', () => { s.src = null; });
  scene.add(s.ray, s.grip);
  return s;
});
const pads = { left: {}, right: {} };
function readXR() {
  const out = {};
  for (const s of xr) {
    if (!s.src || s.src.hand || !s.src.gamepad) continue;
    const side = s.src.handedness === 'left' ? 'left' : 'right', gp = s.src.gamepad, bt = gp.buttons, ax = gp.axes;
    const inp = { tracked: s.grip.visible, pos: s.grip.position.clone(), quat: s.grip.quaternion.clone(), rayQ: s.ray.quaternion.clone(), rayPos: s.ray.position.clone(),
      trigger: bt[0] ? bt[0].value : 0, squeeze: !!(bt[1] && (bt[1].pressed || bt[1].value > 0.5)), a: !!(bt[4] && bt[4].pressed), b: !!(bt[5] && bt[5].pressed),
      sx: ax.length > 3 ? ax[2] : (ax[0] || 0), sy: ax.length > 3 ? ax[3] : (ax[1] || 0) };
    if (!out[side] || inp.tracked) out[side] = inp;
    pads[side] = gp;
  }
  return out;
}
function buzz(side, strength, ms) {
  const gp = pads[side];
  try { const a = gp && gp.hapticActuators; if (a && a[0]) a[0].pulse(strength, ms); } catch (e) { /* no haptics here */ }
}

/* ---------- moving: jump (aim an arc with the left stick, release to land) and snap turn ---------- */
let baseRef = null;
const rig = { x: 0, z: 0, yaw: 0 };
const arcPts = new Float32Array(48 * 3);
const arc = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(arcPts, 3)), new THREE.LineBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.85, fog: false }));
arc.frustumCulled = false; arc.visible = false; scene.add(arc);
const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
ring.visible = false; scene.add(ring);
const fade = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false }));
fade.renderOrder = 1000; fade.visible = false; scene.add(fade);
let fadeT = 0, aiming = false, landing = null, turned = false;
function baseHead() {
  const f = renderer.xr.getFrame(), vp = baseRef && f && f.getViewerPose(baseRef);
  return vp ? vp.transform.position : { x: 0, y: 1.6, z: 0 };
}
function applyRig() {
  // world = R(yaw) * room + (x, z); the offset space's origin is the inverse of that
  const c = Math.cos(-rig.yaw), s = Math.sin(-rig.yaw);
  const px = -(rig.x * c + rig.z * s), pz = -(-rig.x * s + rig.z * c);
  renderer.xr.setReferenceSpace(baseRef.getOffsetReferenceSpace(new XRRigidTransform({ x: px, y: 0, z: pz }, { x: 0, y: Math.sin(-rig.yaw / 2), z: 0, w: Math.cos(-rig.yaw / 2) })));
}
// put the head (in room space) at world point (wx, wz)
function placeHead(wx, wz) {
  const h = baseHead(), c = Math.cos(rig.yaw), s = Math.sin(rig.yaw);
  rig.x = wx - (h.x * c + h.z * s); rig.z = wz - (-h.x * s + h.z * c); applyRig();
}
const P0 = new V3(), D0 = new V3();
function stepMove(inp, dt) {
  if (!baseRef) return;
  const L = inp.left, R = inp.right;
  // snap turn, 45 degrees, around your head
  if (R) {
    if (Math.abs(R.sx) > 0.75 && !turned) {
      turned = true; const hw = headPos.clone(), dir = R.sx > 0 ? -1 : 1;
      rig.yaw += dir * Math.PI / 4; bodyYaw += dir * Math.PI / 4; placeHead(hw.x, hw.z); audio.tick(); stats.turns = (stats.turns || 0) + 1;
      if (window.__log) window.__log.push(`TURN ${dir > 0 ? 'left' : 'right'}`);
    } else if (Math.abs(R.sx) < 0.3) turned = false;
  }
  // jump: an arc from the left controller
  if (L && L.sy < -0.65) {
    aiming = true;
    P0.copy(L.rayPos); D0.set(0, 0, -1).applyQuaternion(L.rayQ);
    let x = P0.x, y = P0.y, z = P0.z, vx = D0.x * 7, vy = D0.y * 7, vz = D0.z * 7, n = 0; landing = null;
    for (; n < 48; n++) {
      arcPts[n * 3] = x; arcPts[n * 3 + 1] = y; arcPts[n * 3 + 2] = z;
      if (y <= 0) { landing = new V3(x, 0, z); n++; break; }
      x += vx * 0.035; y += vy * 0.035; z += vz * 0.035; vy -= 9.8 * 0.035;
    }
    for (let k = n; k < 48; k++) arcPts.set(arcPts.subarray((n - 1) * 3, n * 3), k * 3);
    arc.geometry.attributes.position.needsUpdate = true; arc.visible = true;
    const ok = landing && Math.hypot(landing.x, landing.z) < CLEAR_R - 0.3;
    if (!ok) landing = null;
    arc.material.color.set(ok ? 0x9ff3ff : 0xd8432a); ring.visible = !!ok; if (ok) ring.position.copy(landing).setY(0.02);
  } else if (aiming && (!L || L.sy > -0.3)) {
    aiming = false; arc.visible = ring.visible = false;
    if (landing) { placeHead(landing.x, landing.z); fadeT = 0.22; audio.blink(); particles.burst('magic', landing, 16, 1); if (window.__log) window.__log.push(`JUMP ${landing.x.toFixed(1)} ${landing.z.toFixed(1)}`); }
  }
  fadeT = Math.max(0, fadeT - dt);
  fade.visible = fadeT > 0; fade.material.opacity = Math.min(1, fadeT / 0.22) * 0.9; fade.position.copy(headPos);
}

/* ---------- where your body faces: the head's heading, smoothed, ignoring looks straight down ---------- */
let bodyYaw = Math.PI;
const headPos = new V3(), gazeV = new V3();
function trackBody(dt) {
  const fx = gazeV.x, fz = gazeV.z, l = Math.hypot(fx, fz);
  if (l < 0.35) return;
  const yaw = Math.atan2(fx / l, fz / l), d = Math.atan2(Math.sin(yaw - bodyYaw), Math.cos(yaw - bodyYaw));
  bodyYaw += d * (1 - Math.exp(-dt / 0.35));
}

/* ---------- events: stats, notes on the sign, the log for checks ---------- */
const NAMES = { head: 'head', armL: 'left arm', armR: 'right arm', body: 'body' };
function onEvent(e) {
  switch (e.type) {
    case 'cut': stats.cuts++; stats.parts++; lastNote = `Last: cut off a ${NAMES[e.what]} at ${e.sp.toFixed(1)} m/s.`; break;
    case 'slash': stats.cuts++; lastNote = `Last: a clean slash at ${e.sp.toFixed(1)} m/s.`; break;
    case 'pop': stats.parts++; lastNote = `Last: shot off a ${NAMES[e.what]}.`; break;
    case 'hit': lastNote = `Last: a ${e.sp.toFixed(1)} m/s hit. Cuts start at 3.6.`; break;
    case 'shot': stats.shots++; break;
    case 'shotHit': if (!['wood', 'ground', 'none'].includes(e.kind)) stats.hits++; break;
    case 'smash': stats.smashed++; lastNote = `Last: smashed a ${e.what}.`; break;
    case 'critter': stats.critters++; lastNote = `Last: knocked down a ${e.what}.`; break;
    case 'lantern': stats.lanterns++; lastNote = 'Last: a lantern came down. It will be rehung.'; break;
    case 'gong': stats.gongs++; lastNote = 'Last: BONG.'; break;
    case 'bubble': stats.bubbles++; break;
    case 'can': stats.cans++; break;
    case 'puff': stats.puffs++; lastNote = 'Last: a puffball. It will grow back.'; break;
    case 'stick': stats.sticks++; lastNote = 'Last: the sword stuck. Grab it or recall it.'; break;
    case 'recall': stats.recalls++; break;
    case 'reload': stats.reloads++; break;
    case 'throw': stats.throws++; break;
  }
  if (window.__log) window.__log.push(e.type.toUpperCase() + (e.what ? ' ' + e.what : '') + (e.kind ? ' ' + e.kind : '') + (e.sp ? ' ' + e.sp.toFixed(1) : '') + (e.how ? ' ' + e.how : '') + (e.res ? ' ' + e.res : ''));
}

/* ---------- page chrome ---------- */
let demo = createDemo(weapons, targets);
const statusEl = $('status'), enterBtn = $('enter');
async function enterVR() {
  audio.init();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor'] });
    await renderer.xr.setSession(session);
  } catch (err) { statusEl.textContent = 'Could not start VR: ' + (err && err.message ? err.message : err); }
}
renderer.xr.addEventListener('sessionstart', () => {
  weapons.reset(); targets.reset(); document.body.classList.add('in-vr'); audio.ambience(true);
  baseRef = renderer.xr.getReferenceSpace(); rig.x = rig.z = rig.yaw = 0; bodyYaw = Math.PI;
  for (const k in stats) stats[k] = 0; lastNote = ''; sign.key = '';
});
renderer.xr.addEventListener('sessionend', () => {
  audio.ambience(false); baseRef = null; weapons.reset(); targets.reset(); demo = createDemo(weapons, targets);
  arc.visible = ring.visible = fade.visible = false; document.body.classList.remove('in-vr'); resize();
});
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then(ok => {
    if (ok) { enterBtn.hidden = false; enterBtn.addEventListener('click', enterVR); statusEl.textContent = 'Stand in a clear space with the controllers in hand, then enter. Play standing; walk around as much as your room allows.'; }
  }).catch(() => {});
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sign.key = ''; });

/* ---------- loop ---------- */
let last = 0, simT = 0, slow = 0;
resize();
renderer.setAnimationLoop(ms => {
  const t = ms / 1000, dt = Math.min(0.05, Math.max(0.001, t - last)); last = t;
  const inVR = renderer.xr.isPresenting;
  simT += dt; SWAY.time.value = t;
  if (inVR) { const xc = renderer.xr.getCamera(); xc.getWorldPosition(headPos); xc.getWorldDirection(gazeV); }
  else { headPos.copy(DEMO_STAND); gazeV.set(0, -0.2, -1).normalize(); }

  const inputs = inVR ? readXR() : demo.update(dt);
  if (inVR) { trackBody(dt); stepMove(inputs, dt); }
  weapons.setBody(headPos, bodyYaw); weapons.showHolsters(inVR);
  slow = weapons.update(dt, simT, inputs);
  // hit-stop: for a few frames after a cut the world slows right down (your hands do not)
  const wdt = slow > 0 ? dt * 0.12 : dt;
  targets.update(wdt, t);
  for (const e of targets.events) onEvent(e); targets.events.length = 0;
  for (const e of weaponEvents) onEvent(e); weaponEvents.length = 0;
  forest.update(dt, t, inVR ? headPos : camera.position);
  particles.update(wdt);
  drawSign();
  if (!inVR) {
    const tall = camera.aspect < 1, sway = Math.sin(t * 0.25) * 0.25;
    if (location.search.includes('eye')) { camera.position.set(0, 1.6, 0); camera.lookAt(0, 1.3, -3); }
    else { camera.position.set((tall ? 0.1 : -0.35) + sway, tall ? 2.0 : 1.9, tall ? 1.7 : 1.0); camera.lookAt(tall ? 1.45 : 1.3, 1.2, tall ? -1.3 : -1.5); }
  }
  renderer.render(scene, camera);
});

// handle for the automated checks
window.__game = { weapons, targets, stats, rig, renderer, scene, demo: () => demo, head: () => headPos.clone(), bodyYaw: () => bodyYaw };
