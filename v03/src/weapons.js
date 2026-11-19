// Weapons Sandbox VR, draft v03
// The sword (over your right shoulder), the pump shotgun (over your left shoulder), two pistols (one on each hip).
// Grabbing and letting go, holsters, swings and cuts, throwing and sticking, recall to hand, shooting, pumping and reloading.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COL, rnd, clamp, toon, basic, merge, M4, smoothNormals, outlineMat, makeGlow, starTex, createTrail } from './fx.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion;
export const TUNE = {
  throwBoost: 1.35,      // thrown things leave a bit faster than your hand: there is no weight to push against
  grabReach: 0.16,       // metres from your hand to something loose
  magSnap: 0.075,        // metres from magazine top to the bottom of the grip
  stickSpeed: 4.5,       // a thrown sword sticks if it arrives this fast, point first
  homeAfterStill: 3.5,   // seconds lying still before a dropped weapon flies home
  homeAfter: 12,
};
const BLADE = [-0.2, -0.38, -0.56, -0.74, -0.9];   // sample points along the sword (local z)
// The Quest grip axis runs up through your fist, about 45 degrees above where the controller points.
// Tilting the blade part of the way toward the pointing direction makes a level controller hold the sword out in front.
const SWORD_TILT = new Q().setFromAxisAngle(new V3(1, 0, 0), -0.5);
const MUZZLE = new V3(0, 0.05, -0.165);
const SG = { muzzle: new V3(0, 0.056, -0.66), pump: new V3(0, 0.026, -0.33), tube: 6, pellets: 9, spread: 0.07 };   // the shotgun

/* ---------- models ---------- */
function swordGeo() {
  // a long single-edged blade with a slight curve, brass guard, wrapped grip
  const s = new THREE.Shape();
  s.moveTo(-0.022, 0); s.lineTo(0.024, 0); s.quadraticCurveTo(0.03, 0.45, 0.012, 0.8); s.lineTo(-0.004, 0.86); s.quadraticCurveTo(-0.012, 0.5, -0.022, 0);
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 10 });
  blade.translate(0, 0, -0.004);
  const toZ = (x, y, z) => M4(x, y, z, -Math.PI / 2, 0, 0);   // model built along +Y, held along -Z
  const parts = [
    [blade, COL.steel, M4(0, 0, -0.075, -Math.PI / 2, 0, 0)],
    [new THREE.BoxGeometry(0.004, 0.012, 0.6), 0x8792a3, M4(-0.006, 0.0055, -0.37)], [new THREE.BoxGeometry(0.004, 0.012, 0.6), 0x8792a3, M4(-0.006, -0.0055, -0.37)],
    [new THREE.BoxGeometry(0.11, 0.022, 0.02), COL.brass, M4(0, 0, -0.065)],
    [new THREE.SphereGeometry(0.016, 8, 6), COL.brass, M4(0.056, 0, -0.065)], [new THREE.SphereGeometry(0.016, 8, 6), COL.brass, M4(-0.056, 0, -0.065)],
    [new THREE.CylinderGeometry(0.017, 0.016, 0.17, 8), COL.grip, toZ(0, 0, 0.02)],
    [new THREE.SphereGeometry(0.024, 10, 8), COL.brass, M4(0, 0, 0.112)],
  ];
  for (let i = 0; i < 6; i++) parts.push([new THREE.TorusGeometry(0.0175, 0.003, 4, 10), COL.leather, M4(0, 0, -0.04 + i * 0.026, 0, 0, 0)]);
  return smoothNormals(merge(parts));
}
function pistolGeo() {
  return smoothNormals(merge([
    [new THREE.BoxGeometry(0.028, 0.022, 0.135), 0x4a4f5c, M4(0, 0.026, -0.052)],
    [new THREE.BoxGeometry(0.03, 0.105, 0.046), COL.wood, M4(0, -0.03, 0.032, 0.32, 0, 0)],
    [new THREE.BoxGeometry(0.032, 0.09, 0.012), COL.brass, M4(0, -0.028, 0.014, 0.32, 0, 0)],
    [new THREE.TorusGeometry(0.019, 0.003, 4, 10, Math.PI), 0x4a4f5c, M4(0, 0.016, -0.02, 0, Math.PI / 2, Math.PI)],
    [new THREE.BoxGeometry(0.006, 0.02, 0.006), COL.brass, M4(0, 0.006, -0.018, 0.3, 0, 0)],
  ]));
}
function slideGeo() {
  return smoothNormals(merge([
    [new THREE.BoxGeometry(0.03, 0.03, 0.17), 0x2f3440, M4(0, 0.052, -0.06)],
    [new THREE.CylinderGeometry(0.009, 0.009, 0.012, 10), COL.brass, M4(0, 0.05, -0.149, Math.PI / 2)],
    [new THREE.BoxGeometry(0.005, 0.008, 0.008), 0x2f3440, M4(0.007, 0.07, 0.016)], [new THREE.BoxGeometry(0.005, 0.008, 0.008), 0x2f3440, M4(-0.007, 0.07, 0.016)],
    [new THREE.BoxGeometry(0.031, 0.022, 0.003), 0x1f232b, M4(0, 0.054, -0.005)], [new THREE.BoxGeometry(0.031, 0.022, 0.003), 0x1f232b, M4(0, 0.054, 0.004)],
  ]));
}
function magGeo() {
  return smoothNormals(merge([
    [new THREE.BoxGeometry(0.022, 0.088, 0.034), 0x3a3f4a, M4(0, 0, 0)],
    [new THREE.BoxGeometry(0.028, 0.01, 0.04), COL.brass, M4(0, -0.047, 0)],
    [new THREE.CylinderGeometry(0.0055, 0.0055, 0.02, 8), COL.brass, M4(0, 0.046, -0.004, Math.PI / 2)],
  ]));
}
const vtoon = toon(0xffffff, { vertexColors: true });
const inkedMesh = (geo, thick) => { const m = new THREE.Mesh(geo, vtoon); m.add(new THREE.Mesh(geo, outlineMat(thick))); return m; };

function shotgunGeo() {
  // a short pump gun: oiled wood, dark steel, brass bead; built along -Z with the hand at the origin
  return smoothNormals(merge([
    [new THREE.BoxGeometry(0.036, 0.05, 0.16), 0x2f3440, M4(0, 0.045, -0.09)],
    [new THREE.CylinderGeometry(0.016, 0.016, 0.5, 12), 0x3a3f4a, M4(0, 0.058, -0.41, Math.PI / 2)],
    [new THREE.CylinderGeometry(0.012, 0.012, 0.42, 10), 0x2f3440, M4(0, 0.026, -0.37, Math.PI / 2)],
    [new THREE.CylinderGeometry(0.019, 0.019, 0.02, 12), COL.brass, M4(0, 0.058, -0.655, Math.PI / 2)],
    [new THREE.SphereGeometry(0.006, 6, 4), COL.brass, M4(0, 0.078, -0.64)],
    [new THREE.BoxGeometry(0.03, 0.09, 0.045), 0x8a5a32, M4(0, -0.02, 0.01, 0.35, 0, 0)],
    [new THREE.BoxGeometry(0.034, 0.075, 0.26), 0x9a6a3c, M4(0, 0.0, 0.17, -0.12, 0, 0)],
    [new THREE.BoxGeometry(0.036, 0.085, 0.02), 0x3a2a22, M4(0, -0.01, 0.305, -0.12, 0, 0)],
    [new THREE.TorusGeometry(0.02, 0.003, 4, 10, Math.PI), 0x2f3440, M4(0, 0.014, -0.03, 0, Math.PI / 2, Math.PI)],
    [new THREE.BoxGeometry(0.037, 0.012, 0.05), COL.brass, M4(0, 0.07, -0.09)],
  ]));
}
function pumpGeo() {
  return smoothNormals(merge([
    [new THREE.CylinderGeometry(0.024, 0.024, 0.15, 12), 0x9a6a3c, M4(0, 0, 0, Math.PI / 2)],
    ...[-0.05, -0.025, 0, 0.025, 0.05].map(z => [new THREE.TorusGeometry(0.0245, 0.003, 4, 12), 0x6a4626, M4(0, 0, z)]),
  ]));
}
export function createWeapons(scene, { targets, particles, audio, buzz, emit }) {
  const tA = new V3(), tB = new V3(), tC = new V3(), qA = new Q(), qB = new Q(), m4 = new THREE.Matrix4();

  /* ---------- your hands ---------- */
  const gloveGeo = smoothNormals(merge([
    [new THREE.SphereGeometry(0.042, 12, 8), COL.leather, M4(0, -0.005, 0.005, 0, 0, 0, 0.75, 0.75, 1.15)],
    [new THREE.CylinderGeometry(0.036, 0.04, 0.05, 10), 0x4a2c1c, M4(0, -0.005, 0.07, Math.PI / 2)],
    [new THREE.SphereGeometry(0.016, 8, 6), COL.leather, M4(0.028, 0.022, -0.012, 0, 0, 0, 1, 1, 1.6)],
  ]));
  const hands = {};
  for (const side of ['left', 'right']) {
    const glove = inkedMesh(gloveGeo, 0.004); glove.visible = false; scene.add(glove);
    hands[side] = { side, tracked: false, pos: new V3(), quat: new Q(), rayQ: new Q(), hist: [], vel: new V3(), ang: new V3(), held: null, sq: false, trig: 0, trigDown: false, aDown: false, aHeld: 0, zone: null, glove };
  }

  /* ---------- the body: where the holsters sit ---------- */
  const body = { head: new V3(0, 1.6, 0), yaw: Math.PI, F: new V3(0, 0, -1), R: new V3(1, 0, 0), hipY: 0.95 };
  function setBody(head, yaw) {
    body.head.copy(head); body.yaw = yaw;
    body.F.set(Math.sin(yaw), 0, Math.cos(yaw)); body.R.set(-body.F.z, 0, body.F.x);
    body.hipY = Math.max(0.55, head.y - 0.68);
  }
  const at = (r, y, f, out = new V3()) => out.set(body.head.x, y, body.head.z).addScaledVector(body.R, r).addScaledVector(body.F, f - 0.08);
  function rel(p) { const dx = p.x - body.head.x, dz = p.z - body.head.z; return { r: dx * body.R.x + dz * body.R.z, f: dx * body.F.x + dz * body.F.z + 0.08, y: p.y }; }
  // four holsters: over each shoulder, on each hip
  function zoneOf(p) {
    const z = rel(p);
    if (z.y > body.head.y - 0.32 && z.f < 0.02 && Math.abs(z.r) < 0.45 && p.distanceTo(body.head) < 0.62) return z.r >= 0 ? 'backR' : 'backL';
    if (z.y > body.hipY - 0.28 && z.y < body.hipY + 0.24 && z.f > -0.3 && z.f < 0.28) { if (z.r > 0.07 && z.r < 0.52) return 'hipR'; if (z.r < -0.07 && z.r > -0.52) return 'hipL'; }
    return null;
  }
  const UP = new V3(0, 1, 0), qYaw = new Q();
  const yawQ = () => qYaw.setFromAxisAngle(UP, body.yaw + Math.PI);   // turns a model's -Z to face where you face

  /* ---------- weapons ---------- */
  const ALL = [];
  const mk = (kind, slot, mesh, shape, mass) => {
    const b = new CANNON.Body({ mass });
    for (const [s, o] of shape) b.addShape(s, o);
    const w = { kind, slot, mesh, state: 'holstered', hand: null, still: 0, free: 0, fly: null, stuck: null, cool: {}, armed: true, kick: 0, flash: 0 };
    scene.add(mesh);
    w.prop = targets.addProp(mesh, b, 'weapon', { weapon: w });
    targets.hold(w.prop, 'holster');
    ALL.push(w);
    return w;
  };
  const isGun = w => w && (w.kind === 'pistol' || w.kind === 'shotgun');
  const sword = mk('sword', 'backR', inkedMesh(swordGeo(), 0.0035), [[new CANNON.Box(new CANNON.Vec3(0.02, 0.006, 0.42)), new CANNON.Vec3(0, 0, -0.48)], [new CANNON.Box(new CANNON.Vec3(0.055, 0.012, 0.012)), new CANNON.Vec3(0, 0, -0.065)], [new CANNON.Box(new CANNON.Vec3(0.017, 0.017, 0.09)), new CANNON.Vec3(0, 0, 0.03)]], 1.2);
  sword.trail = createTrail(scene, 0xcfefff);
  sword.prevPts = BLADE.map(() => new V3()); sword.hasPrev = false;

  // muzzle flashes: each gun has its own star and glow; one light, always there, goes to the latest shot
  const flashLight = new THREE.PointLight(0xffc070, 0, 7, 2); scene.add(flashLight);
  let lightT = 0, lightK = 0;
  function addFlash(w, size) { w.star = makeGlow(COL.flash, size, 0, starTex); w.glow = makeGlow(0xffb060, size * 2.4, 0); w.star.visible = w.glow.visible = false; scene.add(w.star, w.glow); }

  function makePistol(slot) {
    const p = mk('pistol', slot, inkedMesh(pistolGeo(), 0.003), [[new CANNON.Box(new CANNON.Vec3(0.016, 0.028, 0.09)), new CANNON.Vec3(0, 0.04, -0.06)], [new CANNON.Box(new CANNON.Vec3(0.016, 0.05, 0.024)), new CANNON.Vec3(0, -0.03, 0.03)]], 0.9);
    p.slide = inkedMesh(slideGeo(), 0.003); p.mesh.add(p.slide);
    p.inMag = new THREE.Mesh(magGeo(), vtoon); p.inMag.position.set(0, -0.03, 0.032); p.inMag.rotation.x = 0.32; p.mesh.add(p.inMag);
    const sight = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 6, 4), basic(0x7dffb0, { fog: false })); sight.position.set(0, 0.071, -0.138); p.mesh.add(sight);
    // rounds left: lit dots on the back of the slide, the chambered one gold
    p.dots = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0035, 0.0035, 0.002), basic(0xffffff, { fog: false }), 9);
    for (let i = 0; i < 9; i++) { p.dots.setMatrixAt(i, M4(-0.0112 + (i % 3) * 0.0112, 0.04 + Math.floor(i / 3) * 0.0062, 0.0262)); p.dots.setColorAt(i, new THREE.Color(i === 0 ? 0xffe28a : 0x9ff3ff)); }
    p.slide.add(p.dots);
    p.tracer = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 4, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    p.tracer.visible = false; p.tracer.frustumCulled = false; scene.add(p.tracer); p.tracerT = 0;
    addFlash(p, 0.2);
    // a leather holster on its hip
    p.holsterMesh = new THREE.Group(); { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), toon(COL.leather)); m.position.set(0, -0.06, 0); p.holsterMesh.add(m); m.add(new THREE.Mesh(smoothNormals(m.geometry), outlineMat(0.004))); } scene.add(p.holsterMesh);
    Object.assign(p, { chambered: true, mag: 7, magIn: true, slideBack: false, blow: 0, reloading: -1 });
    return p;
  }
  const pistolR = makePistol('hipR'), pistolL = makePistol('hipL');

  const shotgun = mk('shotgun', 'backL', inkedMesh(shotgunGeo(), 0.004), [[new CANNON.Box(new CANNON.Vec3(0.02, 0.03, 0.34)), new CANNON.Vec3(0, 0.04, -0.3)], [new CANNON.Box(new CANNON.Vec3(0.018, 0.04, 0.14)), new CANNON.Vec3(0, 0, 0.17)]], 2.4);
  shotgun.pump = inkedMesh(pumpGeo(), 0.003); shotgun.pump.position.copy(SG.pump); shotgun.mesh.add(shotgun.pump);
  // shells left: red dots along the side of the receiver, the chambered one gold
  shotgun.dots = new THREE.InstancedMesh(new THREE.BoxGeometry(0.002, 0.006, 0.008), basic(0xffffff, { fog: false }), SG.tube + 1);
  for (let i = 0; i <= SG.tube; i++) { shotgun.dots.setMatrixAt(i, M4(0.0185, 0.045, -0.035 - i * 0.016)); shotgun.dots.setColorAt(i, new THREE.Color(i === 0 ? 0xffe28a : 0xff6a50)); }
  shotgun.mesh.add(shotgun.dots);
  const DOT_ON = Array.from({ length: SG.tube + 1 }, (_, i) => M4(0.0185, 0.045, -0.035 - i * 0.016)), DOT_OFF = M4(0, 0, 0, 0, 0, 0, 0.0001);
  {
    const pos = new Float32Array(SG.pellets * 6);
    shotgun.tracers = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    shotgun.tracers.frustumCulled = false; shotgun.tracers.visible = false; scene.add(shotgun.tracers); shotgun.tracerT = 0;
  }
  addFlash(shotgun, 0.42);
  Object.assign(shotgun, { chambered: true, spent: false, tube: 5, support: null, rest: 0.3, pumpBack: 0, phase: 'fwd', pumpAnim: 0, flickCool: 0, loadCool: 0 });
  const PISTOLS = [pistolR, pistolL], GUNS = [pistolR, pistolL, shotgun];

  // brass from the pistols, red hulls from the shotgun
  const shellGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.018, 6).rotateX(Math.PI / 2), shellMat = toon(COL.brass);
  const hullGeo = merge([[new THREE.CylinderGeometry(0.009, 0.009, 0.05, 8), 0xc8352a, M4(0, 0.005, 0)], [new THREE.CylinderGeometry(0.0095, 0.0095, 0.012, 8), COL.brass, M4(0, -0.026, 0)]]).rotateX(Math.PI / 2);
  const hullMat = toon(0xffffff, { vertexColors: true });
  const shells = Array.from({ length: 16 }, (_, i) => { const m = new THREE.Mesh(i < 10 ? shellGeo : hullGeo, i < 10 ? shellMat : hullMat); m.visible = false; scene.add(m); return { m, life: 0, v: new V3(), s: new V3(), hull: i >= 10 }; });
  let shellI = 0, hullI = 10;
  function ejectShell(hull, from, q, handVel) {
    const s = hull ? shells[hullI = hullI >= 15 ? 10 : hullI + 1] : shells[shellI = (shellI + 1) % 10];
    s.life = 3; s.m.visible = true; s.m.position.copy(from);
    s.v.set(rnd(1.2, 1.8), rnd(1.4, 2.2), rnd(-0.2, 0.3)).applyQuaternion(q).add(handVel); s.s.set(rnd(-20, 20), rnd(-20, 20), rnd(-20, 20));
    hull ? audio.hull() : audio.shell();
  }

  const hint = {};
  for (const k of ['backR', 'backL', 'hipR', 'hipL']) { hint[k] = makeGlow(0x9ff3ff, k.startsWith('back') ? 0.2 : 0.16, 0); scene.add(hint[k]); }

  /* ---------- dropped magazines: something to see fall, and to throw ---------- */
  const mags = [];
  function newMag() {
    const mesh = inkedMesh(magGeo(), 0.003); scene.add(mesh);
    const b = new CANNON.Body({ mass: 0.2, shape: new CANNON.Box(new CANNON.Vec3(0.011, 0.044, 0.017)) });
    const prop = targets.addProp(mesh, b, 'mag', { grab: 0.1 }); targets.hold(prop, 'new');
    const m = { mesh, prop }; mags.push(m); prop.mag = m;
    while (mags.length > 8) { const o = mags.find(x => !x.prop.held); if (!o) break; mags.splice(mags.indexOf(o), 1); targets.removeProp(o.prop); }
    return m;
  }

  /* ---------- poses ---------- */
  function holsterPose(w, pos, quat) {
    if (w.slot === 'backR' || w.slot === 'backL') {
      // over the shoulder: the part you grab up by the shoulder, the rest down your back toward the other hip
      const sx = w.slot === 'backR' ? 1 : -1;
      at(sx * 0.15, body.head.y - 0.13, -0.17, pos);
      tA.set(0, -0.85, 0).addScaledVector(body.R, -sx * 0.45).addScaledVector(body.F, -0.15).normalize();
      quat.setFromUnitVectors(tB.set(0, 0, -1), tA);
    } else {
      at(w.slot === 'hipR' ? 0.25 : -0.25, body.hipY, 0.02, pos);
      quat.copy(yawQ()).multiply(qB.setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.15, 0, 0)));
      pos.y += 0.06;
    }
  }
  const basisX = new V3(), basisY = new V3(), basisZ = new V3();
  function handPose(w, h, pos, quat) {
    if (w.kind === 'sword') { pos.copy(h.pos); quat.copy(h.quat).multiply(SWORD_TILT); }
    else if (w.kind === 'pistol') { quat.copy(h.rayQ); pos.copy(h.pos).add(tC.set(0, -0.012, 0.012).applyQuaternion(h.rayQ)); }
    else if (w.kind === 'shotgun') {
      const s = w.support && hands[w.support];
      if (s && s.tracked) {
        // two hands: the barrel runs from your back hand toward your front hand, the back hand's top stays up
        basisZ.subVectors(h.pos, s.pos); if (basisZ.lengthSq() < 1e-4) basisZ.set(0, 0, 1); basisZ.normalize();
        basisY.set(0, 1, 0).applyQuaternion(h.rayQ);
        basisX.crossVectors(basisY, basisZ).normalize(); basisY.crossVectors(basisZ, basisX);
        quat.setFromRotationMatrix(m4.makeBasis(basisX, basisY, basisZ));
      } else quat.copy(h.rayQ);
      pos.copy(h.pos).add(tC.set(0, -0.01, 0.01).applyQuaternion(quat));
    }
    else { quat.copy(h.quat).multiply(qB.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))); pos.copy(h.pos).add(tC.set(0, 0, -0.035).applyQuaternion(h.quat)); }
  }
  const grabPoint = w => w.kind === 'sword' ? w.mesh.position : w.mesh.localToWorld(tC.set(0, -0.02, 0.03));

  /* ---------- grabbing and letting go ---------- */
  function attach(h, obj) {
    h.held = obj;
    if (obj.kind === 'support') { obj.gun.support = h.side; audio.grab(); buzz(h.side, 0.4, 30); emit({ type: 'support' }); return; }
    if (obj.kind === 'sword' || isGun(obj)) {
      if (obj.state === 'stuck') { scene.attach(obj.mesh); obj.stuck.d.stuck = obj.stuck.d.stuck.filter(s => s !== obj); obj.stuck = null; audio.pullOut(); buzz(h.side, 0.6, 50); }
      else if (obj.state === 'holstered') { if (obj.kind === 'sword') audio.draw(); else if (obj.kind === 'shotgun') audio.pumpFwd(); else audio.holster(); buzz(h.side, 0.5, 40); emit({ type: 'draw', kind: obj.kind }); }
      else { audio.catch(); buzz(h.side, 0.4, 30); }
      targets.hold(obj.prop, h.side);
      obj.state = 'held'; obj.hand = h.side; obj.fly = null; obj.hasPrev = false; obj.support = null;
    } else {
      targets.hold(obj, h.side); audio.grab(); buzz(h.side, 0.3, 25);
      if (obj.kind === 'mag') obj.mag.held = h.side;
    }
  }
  const slotFree = slot => { const w = ALL.find(x => x.slot === slot); return w && w.state === 'holstered' ? w : null; };
  function tryGrab(h) {
    // the shotgun's fore-end, held by your other hand, is the first thing to check
    if (shotgun.state === 'held' && shotgun.hand !== h.side && !shotgun.support) {
      shotgun.mesh.updateMatrixWorld();
      if (shotgun.mesh.localToWorld(tA.copy(SG.pump)).distanceTo(h.pos) < 0.14) {
        attach(h, { kind: 'support', gun: shotgun });
        shotgun.rest = h.pos.distanceTo(hands[shotgun.hand].pos); shotgun.pumpBack = 0; shotgun.phase = 'fwd';
        return true;
      }
    }
    let best = null, bd = 1e9;
    for (const w of ALL) {
      if (w.state !== 'free' && w.state !== 'stuck') continue;
      const d = grabPoint(w).distanceTo(h.pos); if (d < TUNE.grabReach && d < bd) { best = w; bd = d; }
    }
    for (const p of targets.props) {
      if (p.held || p.kind === 'weapon' || !p.grab || p.hop >= 0) continue;
      const d = p.mesh.position.distanceTo(h.pos); if (d < p.grab + 0.06 && d < bd) { best = p; bd = d; }
    }
    if (best) { attach(h, best); return true; }
    const z = zoneOf(h.pos), w = z && slotFree(z);
    if (w) { attach(h, w); return true; }
    return false;
  }
  function throwVel(h, out) { return out.copy(h.vel).multiplyScalar(TUNE.throwBoost); }
  function dropSupport(gun) { if (!gun.support) return; const s = hands[gun.support]; if (s.held && s.held.kind === 'support') s.held = null; gun.support = null; gun.pumpBack = 0; }
  function letGo(h) {
    const obj = h.held; h.held = null; if (!obj) return;
    if (obj.kind === 'support') { obj.gun.support = null; obj.gun.pumpBack = 0; return; }
    if (obj.kind === 'sword' || isGun(obj)) {
      dropSupport(obj);
      const z = zoneOf(h.pos);
      if (z === obj.slot) {
        obj.state = 'holstered'; obj.hand = null; audio.holster(); buzz(h.side, 0.4, 40); sword.trail.clear(); emit({ type: 'holster', kind: obj.kind }); return;
      }
      obj.state = 'free'; obj.hand = null; obj.still = 0; obj.free = 0;
      targets.release(obj.prop, obj.mesh.position, obj.mesh.quaternion, throwVel(h, tA), h.ang);
      const sp = h.vel.length(); if (sp > 2.5) { audio.whoosh(clamp(sp / 8, 0.2, 1)); emit({ type: 'throw', kind: obj.kind, sp }); }
    } else {
      if (obj.kind === 'mag') obj.mag.held = null;
      targets.release(obj, obj.mesh.position, obj.mesh.quaternion, throwVel(h, tA), h.ang);
      if (h.vel.length() > 2.5) emit({ type: 'throw', kind: obj.kind, sp: h.vel.length() });
    }
  }

  /* ---------- recall: an empty fist and a pull of the trigger calls a weapon back ---------- */
  function flyTo(w, side) {
    if (w.state === 'stuck') { scene.attach(w.mesh); w.stuck.d.stuck = w.stuck.d.stuck.filter(s => s !== w); w.stuck = null; }
    targets.hold(w.prop, 'flying');
    const d = side ? w.mesh.position.distanceTo(hands[side].pos) : 1;
    w.state = 'flying'; w.fly = { side, t: 0, dur: clamp(d / 8, 0.22, 0.55), from: w.mesh.position.clone(), fromQ: w.mesh.quaternion.clone(), d };
  }
  function recall(h) {
    let best = null, bd = 1e9;
    for (const w of ALL) { if (w.state !== 'free' && w.state !== 'stuck') continue; const d = w.mesh.position.distanceTo(h.pos); if (d < bd) { best = w; bd = d; } }
    if (!best) { audio.tick(); return; }
    flyTo(best, h.side); audio.recall(); buzz(h.side, 0.3, 80); emit({ type: 'recall', kind: best.kind });
  }

  /* ---------- the sword's edge: sweep sample points between frames against everything hittable ---------- */
  const pts = BLADE.map(() => new V3()), vel = new V3(), sub = new V3();
  let hitStop = 0;
  function bladeSweep(w, dt, flying) {
    w.mesh.updateMatrixWorld();
    for (let i = 0; i < BLADE.length; i++) w.mesh.localToWorld(pts[i].set(0, 0, BLADE[i]));
    let tipSp = 0;
    if (w.hasPrev) {
      const list = targets.spheres();
      for (const id in w.cool) { w.cool[id] -= dt; if (w.cool[id] <= 0) delete w.cool[id]; }
      tipSp = pts[BLADE.length - 1].distanceTo(w.prevPts[BLADE.length - 1]) / dt;
      for (let i = 0; i < BLADE.length; i++) {
        vel.subVectors(pts[i], w.prevPts[i]).divideScalar(dt); if (vel.length() > 30) vel.setLength(30);
        for (let s = 1; s <= 3; s++) {
          sub.lerpVectors(w.prevPts[i], pts[i], s / 3);
          for (const hh of list) {
            if (w.cool[hh.id]) continue;
            if (sub.distanceToSquared(hh.c) > (hh.r + 0.015) * (hh.r + 0.015)) continue;
            w.cool[hh.id] = 0.35;
            // a thrown sword arriving point first sinks in
            if (flying && hh.kind === 'dummy' && !hh.part && i >= BLADE.length - 2) {
              tA.set(0, 0, -1).applyQuaternion(w.mesh.quaternion);
              if (vel.length() > TUNE.stickSpeed && tA.dot(tB.copy(vel).normalize()) > 0.5) { stick(w, hh, vel); return tipSp; }
            }
            const r = targets.hit(hh, sub, vel, flying ? 'thrown' : 'blade');
            if (r === 'cut') { hitStop = Math.max(hitStop, 0.06); flashSlash(sub, vel); }
            if (w.hand) buzz(w.hand, r === 'cut' ? 1 : r === 'hit' ? 0.6 : 0.2, r === 'cut' ? 70 : 40);
          }
        }
      }
    }
    for (let i = 0; i < BLADE.length; i++) w.prevPts[i].copy(pts[i]);
    w.hasPrev = true;
    return tipSp;
  }
  const slashFx = Array.from({ length: 4 }, () => { const s = makeGlow(0xffffff, 0.5, 0, starTex); scene.add(s); return { s, t: 0 }; });
  let slashI = 0;
  function flashSlash(p, v) { const f = slashFx[slashI++ % slashFx.length]; f.t = 0.12; f.s.position.copy(p); f.s.material.rotation = Math.atan2(v.y, Math.hypot(v.x, v.z)); particles.burst('spark', p, 10, 1.2); }
  function stick(w, hh, v) {
    targets.hold(w.prop, 'stuck');
    w.mesh.position.addScaledVector(tA.set(0, 0, -1).applyQuaternion(w.mesh.quaternion), 0.1);
    hh.d.pivot.attach(w.mesh); w.state = 'stuck'; w.stuck = { d: hh.d, t: 0 }; hh.d.stuck.push(w);
    targets.wobble(hh.d, v, hh.c.y, 1.2);
    particles.burst('straw', hh.c, 20, 1.4, v.clone().normalize());
    audio.stick(); hitStop = 0.07; emit({ type: 'stick' });
  }

  /* ---------- shooting ---------- */
  const dir = new V3(), muz = new V3(), aimP = new V3(), aimQ = new Q();
  function showFlash(w, at, size) {
    w.flash = 1; w.star.position.copy(at); w.glow.position.copy(at); w.star.material.rotation = rnd(6); w.star.scale.setScalar(size * rnd(0.75, 1.1));
    flashLight.position.copy(at); lightK = w.kind === 'shotgun' ? 9 : 5; lightT = w.kind === 'shotgun' ? 0.08 : 0.05;
  }
  function impact(r, d, how) {
    if (r.h) return targets.hit(r.h, r.point, tB.copy(d).multiplyScalar(how === 'pellet' ? 18 : 14), how);
    if (r.kind === 'wood') { particles.burst('wood', r.point, how === 'pellet' ? 4 : 12, 1.2, d.clone().negate()); if (how !== 'pellet') audio.thud(4); }
    else if (r.kind === 'ground') { particles.burst('dirt', r.point, how === 'pellet' ? 5 : 12, 1); particles.burst('dust', r.point, how === 'pellet' ? 1 : 3, 0.6); }
    return null;
  }
  function firePistol(h, p) {
    if (p.reloading >= 0) return;
    if (!p.chambered) { audio.dry(); buzz(h.side, 0.15, 15); emit({ type: 'dry' }); return; }
    p.chambered = false;
    if (p.magIn && p.mag > 0) { p.mag--; p.chambered = true; } else p.slideBack = true;
    p.kick = 1; p.blow = 1;
    handPose(p, h, aimP, aimQ);   // aim from the pose before the recoil kick
    dir.set(0, 0, -1).applyQuaternion(aimQ); muz.copy(MUZZLE).applyQuaternion(aimQ).add(aimP);
    const r = targets.raycast(muz, dir);
    audio.shot(); buzz(h.side, 1, 45); emit({ type: 'shot', kind: 'pistol' });
    showFlash(p, muz, 0.2);
    particles.burst('smoke', muz, 4, 0.6, dir); particles.burst('spark', muz, 5, 0.6, dir);
    const L = Math.min(r.t, 60); p.tracer.position.copy(muz); p.tracer.quaternion.setFromUnitVectors(tB.set(0, 1, 0), dir); p.tracer.scale.set(1, L, 1); p.tracer.visible = true; p.tracerT = 0.04;
    const res = impact(r, dir, 'bullet');
    if (r.h) { emit({ type: 'shotHit', kind: r.kind, res }); if (r.kind === 'can' && Math.random() < 0.4) audio.ricochet(); }
    else if (r.kind !== 'none') emit({ type: 'shotHit', kind: r.kind });
    ejectShell(false, tC.set(0.015, 0.06, -0.03).applyQuaternion(aimQ).add(aimP), aimQ, h.vel);
  }
  // one press: the old magazine drops out, a fresh one rises into the grip, the slide closes
  const RELOAD_T = 0.42;
  function reloadPistol(h, p) {
    if (p.reloading >= 0) return;
    p.reloading = 0;
    if (p.magIn) {
      const m = newMag(); p.mesh.updateMatrixWorld(); p.inMag.updateMatrixWorld();
      p.inMag.getWorldPosition(m.mesh.position); p.inMag.getWorldQuaternion(m.mesh.quaternion);
      targets.release(m.prop, m.mesh.position, m.mesh.quaternion, tA.copy(h.vel).add(tB.set(0, -1.4, 0)), tC.set(rnd(-4, 4), 0, rnd(-4, 4)));
    }
    p.magIn = false; p.mag = 0;
    audio.magOut(); buzz(h.side, 0.35, 30); emit({ type: 'eject' });
  }
  function stepPistol(p, dt) {
    if (p.reloading >= 0) {
      p.reloading += dt;
      const k = Math.min(1, Math.max(0, (p.reloading - 0.12) / (RELOAD_T - 0.12)));
      p.inMag.visible = p.reloading > 0.12; p.inMag.position.set(0, -0.03 - 0.11 * (1 - k * k), 0.032 + 0.034 * (1 - k * k));
      if (p.reloading >= RELOAD_T) {
        p.reloading = -1; p.magIn = true; p.mag = 8; p.inMag.position.set(0, -0.03, 0.032);
        audio.magIn(); if (p.hand) buzz(p.hand, 0.7, 40);
        if (!p.chambered) { p.chambered = true; p.mag--; p.slideBack = false; p.blow = 1; audio.slide(); }
        emit({ type: 'reload', kind: 'pistol' });
      }
    } else p.inMag.visible = p.magIn;
    p.kick *= Math.exp(-dt * 22); p.blow = Math.max(0, p.blow - dt / 0.07);
    p.slide.position.z = 0.028 * (p.slideBack ? 1 : (p.blow > 0 ? Math.sin(Math.PI * (1 - p.blow)) : 0));
    const n = (p.chambered ? 1 : 0) + (p.magIn ? p.mag : 0); p.dots.count = n; p.dots.visible = n > 0;
    p.tracerT -= dt; p.tracer.visible = p.tracerT > 0; p.tracer.material.opacity = Math.max(0, p.tracerT / 0.04) * 0.8;
  }

  /* ---------- the shotgun: fire, pump, fire ---------- */
  const pelletDir = new V3(), side = new V3(), upv = new V3();
  function fireShotgun(h) {
    const g = shotgun;
    if (!g.chambered) { audio.dry(); buzz(h.side, 0.2, 20); emit({ type: 'dry', kind: 'shotgun', spent: g.spent }); return; }
    g.chambered = false; g.spent = true; g.kick = 1;
    handPose(g, h, aimP, aimQ);
    dir.set(0, 0, -1).applyQuaternion(aimQ); muz.copy(SG.muzzle).applyQuaternion(aimQ).add(aimP);
    side.set(1, 0, 0).applyQuaternion(aimQ); upv.set(0, 1, 0).applyQuaternion(aimQ);
    audio.boom(); buzz(h.side, 1, 120); if (g.support) buzz(g.support, 0.9, 100);
    emit({ type: 'shot', kind: 'shotgun' });
    showFlash(g, muz, 0.42);
    particles.burst('smoke', muz, 14, 1.2, dir); particles.burst('spark', muz, 16, 1.4, dir.clone().multiplyScalar(2));
    // pellets: a cone of nine, each its own ray; everything they touch takes the hit
    const pos = g.tracers.geometry.attributes.position.array, hit = new Set();
    for (let i = 0; i < SG.pellets; i++) {
      const a = rnd(Math.PI * 2), rr = SG.spread * Math.sqrt(rnd()) * (i === 0 ? 0.2 : 1);
      pelletDir.copy(dir).addScaledVector(side, Math.cos(a) * rr).addScaledVector(upv, Math.sin(a) * rr).normalize();
      const r = targets.raycast(muz, pelletDir, 60);
      const res = impact(r, pelletDir, 'pellet');
      if (r.h) hit.add(r.kind);
      const L = Math.min(r.t, 40);
      pos.set([muz.x, muz.y, muz.z, muz.x + pelletDir.x * L, muz.y + pelletDir.y * L, muz.z + pelletDir.z * L], i * 6);
    }
    g.tracers.geometry.attributes.position.needsUpdate = true; g.tracers.visible = true; g.tracerT = 0.06;
    if (hit.size) emit({ type: 'shotHit', kind: [...hit].join('+') }); else emit({ type: 'shotHit', kind: 'none' });
  }
  // the pump: back throws out the spent hull, forward loads a fresh shell from the tube
  function pumpBackStroke(how) {
    const g = shotgun; g.phase = 'back';
    audio.pumpBack(); if (g.hand) buzz(g.hand, 0.4, 30); if (g.support) buzz(g.support, 0.6, 40);
    if (g.spent) { g.spent = false; g.mesh.updateMatrixWorld(); ejectShell(true, g.mesh.localToWorld(tA.set(0.02, 0.06, -0.09)), g.mesh.quaternion, hands[g.hand] ? hands[g.hand].vel : tB.set(0, 0, 0)); }
  }
  function pumpFwdStroke(how) {
    const g = shotgun; g.phase = 'fwd';
    if (!g.chambered && g.tube > 0) { g.tube--; g.chambered = true; }
    audio.pumpFwd(); if (g.hand) buzz(g.hand, 0.5, 30); if (g.support) buzz(g.support, 0.7, 40);
    emit({ type: 'pump', how, ready: g.chambered });
  }
  function loadShell(h) {
    const g = shotgun; if (g.tube >= SG.tube || g.loadCool > 0) return;
    g.tube++; g.loadCool = 0.28;
    audio.load(); buzz(h.side, 0.45, 25); emit({ type: 'load', tube: g.tube });
  }
  function stepShotgun(dt) {
    const g = shotgun;
    g.kick *= Math.exp(-dt * 11); g.flickCool -= dt; g.loadCool -= dt;
    if (g.state === 'held') {
      const h = hands[g.hand];
      if (g.support && hands[g.support].tracked) {
        // two hands: how far the front hand has slid back along the barrel since it took hold
        g.pumpBack = clamp(g.rest - hands[g.support].pos.distanceTo(h.pos), 0, 0.11);
        if (g.phase === 'fwd' && g.pumpBack > 0.065) pumpBackStroke('hand');
        else if (g.phase === 'back' && g.pumpBack < 0.025) pumpFwdStroke('hand');
      } else if (g.flickCool <= 0) {
        // one hand: flick the muzzle up hard and the gun racks itself
        tA.set(1, 0, 0).applyQuaternion(g.mesh.quaternion);
        if (h.ang.dot(tA) > 9) { g.flickCool = 0.4; g.pumpAnim = 1; pumpBackStroke('flick'); pumpFwdStroke('flick'); }
      }
    } else g.pumpBack = 0;
    g.pumpAnim = Math.max(0, g.pumpAnim - dt / 0.22);
    const anim = g.pumpAnim > 0 ? Math.sin(Math.PI * (1 - g.pumpAnim)) * 0.09 : 0;
    g.pump.position.z = SG.pump.z + Math.max(g.pumpBack, anim);
    // the gold dot is the chamber, the red ones the tube
    const key = (g.chambered ? 1 : 0) + g.tube * 2;
    if (key !== g.dotKey) { g.dotKey = key; for (let i = 0; i <= SG.tube; i++) g.dots.setMatrixAt(i, (i === 0 ? g.chambered : i <= g.tube) ? DOT_ON[i] : DOT_OFF); g.dots.instanceMatrix.needsUpdate = true; }
    g.tracerT -= dt; g.tracers.visible = g.tracerT > 0; g.tracers.material.opacity = Math.max(0, g.tracerT / 0.06) * 0.9;
  }

  /* ---------- per frame ---------- */
  function readHand(h, inp, dt, simT) {
    h.tracked = !!(inp && inp.tracked);
    if (!h.tracked) { h.hist.length = 0; return; }
    h.pos.copy(inp.pos); h.quat.copy(inp.quat); h.rayQ.copy(inp.rayQ || inp.quat);
    h.hist.push({ t: simT, p: h.pos.clone(), q: h.quat.clone() });
    while (h.hist.length > 2 && simT - h.hist[0].t > 0.07) h.hist.shift();
    const a = h.hist[0], b = h.hist[h.hist.length - 1];
    if (b.t - a.t > 1e-3) h.vel.subVectors(b.p, a.p).divideScalar(b.t - a.t); else h.vel.set(0, 0, 0);
    if (h.vel.length() > 25) h.vel.setLength(25);
    if (h.hist.length > 1) {
      const p = h.hist[h.hist.length - 2]; qB.copy(p.q).invert().premultiply(b.q);
      const ang = 2 * Math.acos(clamp(qB.w, -1, 1)), s = Math.sqrt(1 - qB.w * qB.w);
      if (s > 1e-4 && b.t - p.t > 1e-4) h.ang.set(qB.x / s, qB.y / s, qB.z / s).multiplyScalar((ang > Math.PI ? ang - 2 * Math.PI : ang) / (b.t - p.t)).clampLength(0, 30);
      else h.ang.set(0, 0, 0);
    }
  }

  function update(dt, simT, inputs) {
    hitStop = Math.max(0, hitStop - dt);
    for (const s of ['left', 'right']) {
      const h = hands[s], inp = inputs[s];
      readHand(h, inp, dt, simT);
      h.glove.visible = h.tracked;
      if (h.tracked) { h.glove.position.copy(h.pos); h.glove.quaternion.copy(h.quat); }
      if (!h.tracked) { if (h.held && (h.held.kind === 'mag' || h.held.kind === 'support')) letGo(h); continue; }
      const sq = !!inp.squeeze, trig = inp.trigger || 0, aBtn = !!inp.a;
      if (sq && !h.sq) { if (!h.held) tryGrab(h); }
      if (!sq && h.sq) letGo(h);
      h.sq = sq;
      const trigEdge = trig > 0.7 && !h.trigDown; if (trig > 0.7) h.trigDown = true; else if (trig < 0.35) h.trigDown = false;
      const held = h.held;
      if (trigEdge) {
        if (held && held.kind === 'pistol') firePistol(h, held);
        else if (held === shotgun) fireShotgun(h);
        else if (!held && sq) recall(h);
      }
      // A or X: reload the pistol in this hand, or load a shell into the shotgun (hold it to keep loading)
      if (aBtn && held && held.kind === 'pistol' && !h.aDown) reloadPistol(h, held);
      if (aBtn && (held === shotgun || (held && held.kind === 'support'))) loadShell(h);
      h.aDown = aBtn;
      const z = held ? null : zoneOf(h.pos);
      if (z !== h.zone) { if (z && slotFree(z)) buzz(s, 0.12, 15); h.zone = z; }
    }

    // holsters and hints follow your body
    for (const p of PISTOLS) { holsterPose(p, tA, qA); p.holsterMesh.position.copy(tA).add(tB.set(0, -0.02, 0)); p.holsterMesh.quaternion.copy(yawQ()); }
    {
      const want = { backR: 0, backL: 0, hipR: 0, hipL: 0 };
      for (const s of ['left', 'right']) { const z = hands[s].zone; if (z && slotFree(z)) want[z] = 0.9; }
      for (const w of ALL) { holsterPose(w, hint[w.slot].position, qB); if (w.slot.startsWith('hip')) hint[w.slot].position.y += 0.06; }
      for (const k in hint) { hint[k].material.opacity += (want[k] - hint[k].material.opacity) * Math.min(1, dt * 12); hint[k].visible = hint[k].material.opacity > 0.01; }
    }

    // each weapon follows its hand, its holster, its flight or the physics
    for (const w of ALL) {
      if (w.state === 'held') {
        const h = hands[w.hand];
        handPose(w, h, w.mesh.position, w.mesh.quaternion);
        if (isGun(w)) {
          // recoil: the muzzle kicks up and back, then settles; the shotgun kicks much harder
          const big = w.kind === 'shotgun', two = big && w.support;
          w.mesh.quaternion.multiply(qB.setFromAxisAngle(tB.set(1, 0, 0), w.kick * (big ? (two ? 0.35 : 0.6) : 0.32)));
          w.mesh.position.add(tB.set(0, 0, (big ? 0.07 : 0.03) * w.kick).applyQuaternion(w.mesh.quaternion));
        }
      } else if (w.state === 'holstered') {
        holsterPose(w, w.mesh.position, w.mesh.quaternion);
      } else if (w.state === 'flying') {
        const f = w.fly; f.t += dt / f.dur; const k = Math.min(1, f.t), e = 1 - Math.pow(1 - k, 3);
        const h = f.side ? hands[f.side] : null;
        if (h) handPose(w, h, tA, qA); else holsterPose(w, tA, qA);
        w.mesh.position.lerpVectors(f.from, tA, e); w.mesh.position.y += Math.sin(Math.PI * k) * Math.min(0.5, f.d * 0.08);
        w.mesh.quaternion.slerpQuaternions(f.fromQ, qA, e);
        if (w.kind === 'sword' && k < 0.85) w.mesh.quaternion.multiply(qB.setFromAxisAngle(tB.set(1, 0, 0), (1 - k) * 14 * k));
        if (Math.random() < 0.6) particles.burst('magic', w.mesh.position, 1, 0.3);
        if (k >= 1) {
          if (h && h.sq && !h.held) { attach(h, w); buzz(h.side, 0.8, 50); }
          else if (h) { w.state = 'free'; w.still = 0; w.free = 0; targets.release(w.prop, w.mesh.position, w.mesh.quaternion, tB.set(0, 0, 0), tB); }
          else { w.state = 'holstered'; audio.homing(); }
        }
      } else if (w.state === 'free') {
        const b = w.prop.body; w.free += dt;
        w.still = b.velocity.length() < 0.25 ? w.still + dt : 0;
        if (w.still > TUNE.homeAfterStill || w.free > TUNE.homeAfter || b.position.y < -1) flyTo(w, null);
      } else if (w.state === 'stuck') {
        w.stuck.t += dt; if (w.stuck.t > 10) flyTo(w, null);
      }
    }

    // the sword's edge, its swish and its trail
    {
      const live = sword.state === 'held' || (sword.state === 'free' && sword.prop.body.velocity.length() > 3);
      let sp = 0;
      if (live) sp = bladeSweep(sword, dt, sword.state === 'free'); else sword.hasPrev = false;
      if (sp > 5.5 && sword.armed) { audio.whoosh(clamp((sp - 5) / 8, 0.15, 1)); sword.armed = false; }
      if (sp < 3) sword.armed = true;
      sword.mesh.updateMatrixWorld();
      sword.trail.update(dt, sword.mesh.localToWorld(tA.set(0, 0, -0.4)), sword.mesh.localToWorld(tB.set(0, 0, -0.93)), live && sp > 3.2, clamp((sp - 2.5) / 6, 0.2, 1));
    }
    for (const f of slashFx) { f.t = Math.max(0, f.t - dt); const k = f.t / 0.12; f.s.visible = k > 0; f.s.material.opacity = k; f.s.scale.set(0.9 * (1.5 - k), 0.12 * (1.5 - k), 1); }

    // guns: recoil settles, slides and pumps move, flashes fade, ammo shows
    for (const p of PISTOLS) stepPistol(p, dt);
    stepShotgun(dt);
    for (const w of GUNS) { w.flash = Math.max(0, w.flash - dt / (w.kind === 'shotgun' ? 0.07 : 0.05)); w.star.visible = w.glow.visible = w.flash > 0; w.star.material.opacity = w.flash; w.glow.material.opacity = w.flash * 0.7; }
    lightT = Math.max(0, lightT - dt); flashLight.intensity = lightT > 0 ? lightK * lightT / 0.06 : 0;

    // held loose things (magazines, cans, heads) follow the hand
    for (const s of ['left', 'right']) {
      const h = hands[s], o = h.held; if (!o || o.kind === 'support' || o.kind === 'sword' || isGun(o)) continue;
      if (o.kind === 'mag') handPose({ kind: 'mag' }, h, o.mesh.position, o.mesh.quaternion);
      else { o.mesh.position.copy(h.pos).add(tA.set(0, 0, -0.06).applyQuaternion(h.quat)); o.mesh.quaternion.copy(h.quat); }
    }
    for (const s of shells) {
      if (s.life <= 0) continue;
      s.life -= dt; s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += s.s.x * dt; s.m.rotation.y += s.s.y * dt;
      if (s.m.position.y < 0.01) { s.m.position.y = 0.01; s.v.y *= -0.35; s.v.x *= 0.5; s.v.z *= 0.5; s.s.multiplyScalar(0.5); }
      if (s.life <= 0) s.m.visible = false;
    }
    return hitStop;
  }

  return {
    hands, sword, pistol: pistolR, pistolR, pistolL, shotgun, all: ALL, body, setBody, update, zoneOf,
    showHolsters(on) { for (const p of PISTOLS) p.holsterMesh.visible = on; },
    // for the preview and the checks
    forceHold(side, kind) {
      const h = hands[side]; if (h.held) return;
      const w = kind === 'sword' ? sword : kind === 'shotgun' ? shotgun : kind === 'pistolL' ? pistolL : pistolR;
      h.sq = true; attach(h, w);
    },
    refill() { for (const p of PISTOLS) { Object.assign(p, { chambered: true, mag: 7, magIn: true, slideBack: false, reloading: -1 }); p.inMag.position.set(0, -0.03, 0.032); } Object.assign(shotgun, { chambered: true, spent: false, tube: 5 }); },
    reset() {
      for (const s of ['left', 'right']) { const h = hands[s]; if (h.held) letGo(h); h.held = null; h.sq = false; h.trigDown = false; }
      for (const w of ALL) { if (w.state === 'stuck') { scene.attach(w.mesh); w.stuck.d.stuck = []; w.stuck = null; } targets.hold(w.prop, 'holster'); w.state = 'holstered'; w.hand = null; w.fly = null; w.kick = 0; w.support = null; }
      for (const m of mags.splice(0)) targets.removeProp(m.prop);
      this.refill();
      sword.trail.clear();
    },
  };
}
