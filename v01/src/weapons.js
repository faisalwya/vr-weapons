// Weapons Sandbox VR, draft v01
// The sword (over your right shoulder) and the pistol (right hip, magazines on the left hip).
// Grabbing and letting go, holsters, swings and cuts, throwing and sticking, recall to hand, shooting and reloading.

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
const MUZZLE = new V3(0, 0.05, -0.165), MAGWELL = new V3(0, -0.078, 0.048), MAGTOP = new V3(0, 0.046, 0);

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

export function createWeapons(scene, { targets, particles, audio, buzz, emit }) {
  const tA = new V3(), tB = new V3(), tC = new V3(), qA = new Q(), qB = new Q();

  /* ---------- your hands ---------- */
  const gloveGeo = smoothNormals(merge([
    [new THREE.SphereGeometry(0.042, 12, 8), COL.leather, M4(0, -0.005, 0.005, 0, 0, 0, 0.75, 0.75, 1.15)],
    [new THREE.CylinderGeometry(0.036, 0.04, 0.05, 10), 0x4a2c1c, M4(0, -0.005, 0.07, Math.PI / 2)],
    [new THREE.SphereGeometry(0.016, 8, 6), COL.leather, M4(0.028, 0.022, -0.012, 0, 0, 0, 1, 1, 1.6)],
  ]));
  const hands = {};
  for (const side of ['left', 'right']) {
    const glove = inkedMesh(gloveGeo, 0.004); glove.visible = false; scene.add(glove);
    hands[side] = { side, tracked: false, pos: new V3(), quat: new Q(), rayQ: new Q(), hist: [], vel: new V3(), ang: new V3(), held: null, sq: false, trig: 0, trigDown: false, aDown: false, zone: null, glove };
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
  function zoneOf(p) {
    const z = rel(p);
    if (z.y > body.head.y - 0.32 && z.f < 0.02 && Math.abs(z.r) < 0.45 && p.distanceTo(body.head) < 0.62) return 'back';
    if (z.y > body.hipY - 0.28 && z.y < body.hipY + 0.24 && z.f > -0.3 && z.f < 0.28) { if (z.r > 0.07 && z.r < 0.52) return 'hipR'; if (z.r < -0.07 && z.r > -0.52) return 'hipL'; }
    return null;
  }
  const UP = new V3(0, 1, 0), qYaw = new Q();
  const yawQ = () => qYaw.setFromAxisAngle(UP, body.yaw + Math.PI);   // turns a model's -Z to face where you face

  /* ---------- weapons ---------- */
  const mk = (kind, mesh, shape) => {
    const b = new CANNON.Body({ mass: kind === 'sword' ? 1.2 : 0.9 });
    for (const [s, o] of shape) b.addShape(s, o);
    const w = { kind, mesh, state: 'holstered', hand: null, still: 0, free: 0, fly: null, stuck: null, prev: null, cool: {}, armed: true };
    scene.add(mesh);
    w.prop = targets.addProp(mesh, b, 'weapon', { weapon: w });
    targets.hold(w.prop, 'holster');
    return w;
  };
  const sword = mk('sword', inkedMesh(swordGeo(), 0.0035), [[new CANNON.Box(new CANNON.Vec3(0.02, 0.006, 0.42)), new CANNON.Vec3(0, 0, -0.48)], [new CANNON.Box(new CANNON.Vec3(0.055, 0.012, 0.012)), new CANNON.Vec3(0, 0, -0.065)], [new CANNON.Box(new CANNON.Vec3(0.017, 0.017, 0.09)), new CANNON.Vec3(0, 0, 0.03)]]);
  sword.trail = createTrail(scene, 0xcfefff);
  sword.prevPts = BLADE.map(() => new V3()); sword.hasPrev = false;

  const pistol = mk('pistol', inkedMesh(pistolGeo(), 0.003), [[new CANNON.Box(new CANNON.Vec3(0.016, 0.028, 0.09)), new CANNON.Vec3(0, 0.04, -0.06)], [new CANNON.Box(new CANNON.Vec3(0.016, 0.05, 0.024)), new CANNON.Vec3(0, -0.03, 0.03)]]);
  const slide = inkedMesh(slideGeo(), 0.003); pistol.mesh.add(slide);
  const inMag = new THREE.Mesh(magGeo(), vtoon); inMag.position.set(0, -0.03, 0.032); inMag.rotation.x = 0.32; pistol.mesh.add(inMag);
  const sight = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 6, 4), basic(0x7dffb0, { fog: false })); sight.position.set(0, 0.071, -0.138); pistol.mesh.add(sight);
  // rounds left: a little grid of lit dots on the back of the slide, the chambered one gold
  const ammoDots = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0035, 0.0035, 0.002), basic(0xffffff, { fog: false }), 9);
  for (let i = 0; i < 9; i++) { ammoDots.setMatrixAt(i, M4(-0.0112 + (i % 3) * 0.0112, 0.04 + Math.floor(i / 3) * 0.0062, 0.0262)); ammoDots.setColorAt(i, new THREE.Color(i === 0 ? 0xffe28a : 0x9ff3ff)); }
  slide.add(ammoDots);
  Object.assign(pistol, { chambered: true, mag: 7, magIn: true, slideBack: false, kick: 0, blow: 0, flash: 0, lastShot: -1 });
  // muzzle flash: a star, a glow and one light that is always there (lights are never added or removed)
  const flashStar = makeGlow(COL.flash, 0.2, 0, starTex), flashGlow = makeGlow(0xffb060, 0.5, 0), flashLight = new THREE.PointLight(0xffc070, 0, 6, 2);
  scene.add(flashStar, flashGlow, flashLight);
  const tracer = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 4, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  tracer.visible = false; tracer.frustumCulled = false; scene.add(tracer);
  let tracerT = 0;
  // shells: brass that tumbles out to the right and clinks on the ground
  const shellGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.018, 6).rotateX(Math.PI / 2), shellMat = toon(COL.brass);
  const shells = Array.from({ length: 12 }, () => { const m = new THREE.Mesh(shellGeo, shellMat); m.visible = false; scene.add(m); return { m, life: 0, v: new V3(), s: new V3() }; });
  let shellI = 0;

  /* ---------- holsters you can see: the sheath strap, the hip holster, the magazine pouch ---------- */
  const leather = toon(COL.leather);
  const hipHolster = new THREE.Group(); { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), leather); m.position.set(0, -0.06, 0); hipHolster.add(m); m.add(new THREE.Mesh(smoothNormals(m.geometry), outlineMat(0.004))); } scene.add(hipHolster);
  const pouch = new THREE.Group(); { const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.05), leather); m.position.y = -0.03; pouch.add(m); m.add(new THREE.Mesh(smoothNormals(m.geometry), outlineMat(0.004))); for (const x of [-0.014, 0.014]) { const g = new THREE.Mesh(magGeo(), vtoon); g.position.set(x, 0.01, 0); pouch.add(g); } } scene.add(pouch);
  const hint = { back: makeGlow(0x9ff3ff, 0.2, 0), hipR: makeGlow(0x9ff3ff, 0.16, 0), hipL: makeGlow(0x9ff3ff, 0.14, 0) };
  for (const k in hint) scene.add(hint[k]);

  /* ---------- magazines ---------- */
  const mags = [];
  function newMag() {
    const mesh = inkedMesh(magGeo(), 0.003); scene.add(mesh);
    const b = new CANNON.Body({ mass: 0.2, shape: new CANNON.Box(new CANNON.Vec3(0.011, 0.044, 0.017)) });
    const prop = targets.addProp(mesh, b, 'mag', { grab: 0.1 }); targets.hold(prop, 'new');
    const m = { mesh, prop }; mags.push(m); prop.mag = m;
    while (mags.length > 7) { const o = mags.find(x => !x.prop.held); if (!o) break; mags.splice(mags.indexOf(o), 1); targets.removeProp(o.prop); }
    return m;
  }

  /* ---------- poses ---------- */
  const SWORD_BACK = new Q();
  function holsterPose(w, pos, quat) {
    if (w.kind === 'sword') {
      // over the right shoulder: hilt up, blade down toward the left hip
      at(0.15, body.head.y - 0.13, -0.17, pos);
      tA.set(0, -0.85, 0).addScaledVector(body.R, -0.45).addScaledVector(body.F, -0.15).normalize();
      quat.setFromUnitVectors(tB.set(0, 0, -1), tA);
    } else {
      at(0.25, body.hipY, 0.02, pos);
      quat.copy(yawQ()).multiply(qB.setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.15, 0, 0)));
      pos.y += 0.06;
    }
  }
  function handPose(w, h, pos, quat) {
    if (w.kind === 'sword') { pos.copy(h.pos); quat.copy(h.quat).multiply(SWORD_TILT); }
    else if (w.kind === 'pistol') { quat.copy(h.rayQ); pos.copy(h.pos).add(tC.set(0, -0.012, 0.012).applyQuaternion(h.rayQ)); }
    else { quat.copy(h.quat).multiply(qB.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))); pos.copy(h.pos).add(tC.set(0, 0, -0.035).applyQuaternion(h.quat)); }
  }
  const grabPoint = w => w.kind === 'sword' ? w.mesh.position : w.mesh.localToWorld(tC.set(0, -0.02, 0.03));

  /* ---------- grabbing and letting go ---------- */
  function attach(h, obj) {
    h.held = obj;
    if (obj.kind === 'sword' || obj.kind === 'pistol') {
      if (obj.state === 'stuck') { scene.attach(obj.mesh); obj.stuck.d.stuck = obj.stuck.d.stuck.filter(s => s !== obj); obj.stuck = null; audio.pullOut(); buzz(h.side, 0.6, 50); }
      else if (obj.state === 'holstered') { if (obj.kind === 'sword') audio.draw(); else audio.holster(); buzz(h.side, 0.5, 40); emit({ type: 'draw', kind: obj.kind }); }
      else { audio.catch(); buzz(h.side, 0.4, 30); }
      targets.hold(obj.prop, h.side);
      obj.state = 'held'; obj.hand = h.side; obj.fly = null; obj.hasPrev = false; obj.prevPts && (obj.hasPrev = false);
    } else {
      targets.hold(obj, h.side); audio.grab(); buzz(h.side, 0.3, 25);
      if (obj.kind === 'mag') obj.mag.held = h.side;
    }
  }
  function tryGrab(h) {
    let best = null, bd = 1e9;
    for (const w of [sword, pistol]) {
      if (w.state !== 'free' && w.state !== 'stuck') continue;
      const d = grabPoint(w).distanceTo(h.pos); if (d < TUNE.grabReach && d < bd) { best = w; bd = d; }
    }
    for (const p of targets.props) {
      if (p.held || p.kind === 'weapon' || !p.grab || p.hop >= 0) continue;
      const d = p.mesh.position.distanceTo(h.pos); if (d < p.grab + 0.06 && d < bd) { best = p; bd = d; }
    }
    if (best) { attach(h, best); return true; }
    const z = zoneOf(h.pos);
    if (z === 'back' && sword.state === 'holstered') { attach(h, sword); return true; }
    if (z === 'hipR' && pistol.state === 'holstered') { attach(h, pistol); return true; }
    if (z === 'hipL') { const m = newMag(); handPose({ kind: 'mag' }, h, m.mesh.position, m.mesh.quaternion); attach(h, m.prop); return true; }
    return false;
  }
  function throwVel(h, out) { return out.copy(h.vel).multiplyScalar(TUNE.throwBoost); }
  function letGo(h) {
    const obj = h.held; h.held = null; if (!obj) return;
    if (obj.kind === 'sword' || obj.kind === 'pistol') {
      const z = zoneOf(h.pos);
      if ((obj.kind === 'sword' && z === 'back') || (obj.kind === 'pistol' && z === 'hipR')) {
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
    for (const w of [sword, pistol]) { if (w.state !== 'free' && w.state !== 'stuck') continue; const d = w.mesh.position.distanceTo(h.pos); if (d < bd) { best = w; bd = d; } }
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
  // an anime slash flash at the point of the cut
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

  /* ---------- the pistol ---------- */
  const dir = new V3(), muz = new V3();
  function fire(h) {
    const p = pistol;
    if (!p.chambered) { audio.dry(); buzz(h.side, 0.15, 15); emit({ type: 'dry' }); return; }
    p.chambered = false;
    if (p.magIn && p.mag > 0) { p.mag--; p.chambered = true; } else p.slideBack = true;
    p.kick = 1; p.blow = 1; p.flash = 0.05;
    // aim from the pose before the recoil kick
    handPose(p, h, tA, qA);
    dir.set(0, 0, -1).applyQuaternion(qA); muz.copy(MUZZLE).applyQuaternion(qA).add(tA);
    const r = targets.raycast(muz, dir);
    audio.shot(); buzz(h.side, 1, 45); emit({ type: 'shot' });
    flashStar.position.copy(muz); flashGlow.position.copy(muz); flashLight.position.copy(muz);
    flashStar.material.rotation = rnd(6); flashStar.scale.setScalar(rnd(0.14, 0.22));
    particles.burst('smoke', muz, 4, 0.6, dir); particles.burst('spark', muz, 5, 0.6, dir);
    // the tracer runs from the muzzle to whatever it hit
    const L = Math.min(r.t, 60); tracer.position.copy(muz); tracer.quaternion.setFromUnitVectors(tB.set(0, 1, 0), dir); tracer.scale.set(1, L, 1); tracer.visible = true; tracerT = 0.04;
    if (r.h) { const res = targets.hit(r.h, r.point, tB.copy(dir).multiplyScalar(14), 'bullet'); emit({ type: 'shotHit', kind: r.kind, res }); if (r.kind === 'can' && Math.random() < 0.4) audio.ricochet(); }
    else if (r.kind === 'wood') { particles.burst('wood', r.point, 12, 1.2, dir.clone().negate()); particles.burst('dust', r.point, 2, 0.4); audio.thud(4); emit({ type: 'shotHit', kind: 'wood' }); }
    else if (r.kind === 'ground') { particles.burst('dirt', r.point, 12, 1); particles.burst('dust', r.point, 3, 0.6); emit({ type: 'shotHit', kind: 'ground' }); }
    // a shell flies out to the right
    const s = shells[shellI++ % shells.length]; s.life = 3; s.m.visible = true; s.bounced = false;
    s.m.position.copy(tC.set(0.015, 0.06, -0.03).applyQuaternion(qA).add(tA));
    s.v.set(rnd(1.2, 1.8), rnd(1.4, 2.2), rnd(-0.2, 0.3)).applyQuaternion(qA).add(h.vel); s.s.set(rnd(-20, 20), rnd(-20, 20), rnd(-20, 20));
    audio.shell();
  }
  function eject(h) {
    const p = pistol; if (!p.magIn) return;
    p.magIn = false; p.mag = 0;
    const m = newMag(); p.mesh.updateMatrixWorld(); inMag.updateMatrixWorld();
    inMag.getWorldPosition(m.mesh.position); inMag.getWorldQuaternion(m.mesh.quaternion);
    targets.release(m.prop, m.mesh.position, m.mesh.quaternion, tA.copy(h.vel).add(tB.set(0, -1.2, 0)), tC.set(rnd(-3, 3), 0, rnd(-3, 3)));
    audio.magOut(); buzz(h.side, 0.35, 30); emit({ type: 'eject' });
  }
  function insert(magHand, gunHand, m) {
    const p = pistol; p.magIn = true; p.mag = 8;
    magHand.held = null; mags.splice(mags.indexOf(m.mag), 1); targets.removeProp(m);
    audio.magIn(); buzz(magHand.side, 0.7, 40); buzz(gunHand.side, 0.7, 40);
    if (!p.chambered) { p.chambered = true; p.mag--; p.slideBack = false; p.blow = 1; audio.slide(); }
    emit({ type: 'reload' });
  }

  /* ---------- per frame ---------- */
  function readHand(h, inp, dt, simT) {
    h.tracked = !!(inp && inp.tracked);
    if (!h.tracked) { h.hist.length = 0; return; }
    h.pos.copy(inp.pos); h.quat.copy(inp.quat); h.rayQ.copy(inp.rayQ || inp.quat);
    // velocity over the last few frames of game time, angular velocity from the last frame
    h.hist.push({ t: simT, p: h.pos.clone(), q: h.quat.clone() });
    while (h.hist.length > 2 && simT - h.hist[0].t > 0.07) h.hist.shift();
    const a = h.hist[0], b = h.hist[h.hist.length - 1];
    if (b.t - a.t > 1e-3) h.vel.subVectors(b.p, a.p).divideScalar(b.t - a.t); else h.vel.set(0, 0, 0);
    if (h.vel.length() > 25) h.vel.setLength(25);   // tracking glitches, not swings
    if (h.hist.length > 1) {
      const p = h.hist[h.hist.length - 2]; qB.copy(p.q).invert().premultiply(b.q);
      const ang = 2 * Math.acos(clamp(qB.w, -1, 1)), s = Math.sqrt(1 - qB.w * qB.w);
      if (s > 1e-4 && b.t - p.t > 1e-4) h.ang.set(qB.x / s, qB.y / s, qB.z / s).multiplyScalar((ang > Math.PI ? ang - 2 * Math.PI : ang) / (b.t - p.t)).clampLength(0, 30);
    }
  }

  function update(dt, simT, inputs) {
    hitStop = Math.max(0, hitStop - dt);
    for (const side of ['left', 'right']) {
      const h = hands[side], inp = inputs[side];
      readHand(h, inp, dt, simT);
      h.glove.visible = h.tracked;
      if (h.tracked) { h.glove.position.copy(h.pos); h.glove.quaternion.copy(h.quat); }
      if (!h.tracked) { if (h.held && h.held.kind === 'mag') letGo(h); continue; }
      // buttons, with edges
      const sq = !!inp.squeeze, trig = inp.trigger || 0, aBtn = !!inp.a;
      if (sq && !h.sq) { if (!h.held) tryGrab(h); }
      if (!sq && h.sq) letGo(h);
      h.sq = sq;
      const trigEdge = trig > 0.7 && !h.trigDown; if (trig > 0.7) h.trigDown = true; else if (trig < 0.35) h.trigDown = false;
      if (trigEdge) { if (h.held === pistol) fire(h); else if (!h.held && sq) recall(h); }
      if (aBtn && !h.aDown && h.held === pistol) eject(h);
      h.aDown = aBtn;
      // a hint glows where an empty hand can draw from
      const z = h.held ? null : zoneOf(h.pos);
      if (z !== h.zone) { if (z && ((z === 'back' && sword.state === 'holstered') || (z === 'hipR' && pistol.state === 'holstered') || z === 'hipL')) buzz(side, 0.12, 15); h.zone = z; }
    }

    // where the holsters are now
    holsterPose(pistol, tA, qA); hipHolster.position.copy(tA).add(tB.set(0, -0.02, 0)); hipHolster.quaternion.copy(yawQ());
    at(-0.24, body.hipY, 0.03, pouch.position); pouch.quaternion.copy(yawQ());
    {
      const want = { back: 0, hipR: 0, hipL: 0 };
      for (const s of ['left', 'right']) { const z = hands[s].zone; if (z === 'back' && sword.state === 'holstered') want.back = 0.9; if (z === 'hipR' && pistol.state === 'holstered') want.hipR = 0.9; if (z === 'hipL') want.hipL = 0.9; }
      hint.hipR.position.copy(hipHolster.position).y += 0.06; hint.hipL.position.copy(pouch.position).y += 0.04;
      holsterPose(sword, hint.back.position, qB);
      for (const k in hint) { hint[k].material.opacity += (want[k] - hint[k].material.opacity) * Math.min(1, dt * 12); hint[k].visible = hint[k].material.opacity > 0.01; }
    }

    // each weapon follows its hand, its holster, its flight or the physics
    for (const w of [sword, pistol]) {
      if (w.state === 'held') {
        const h = hands[w.hand];
        handPose(w, h, w.mesh.position, w.mesh.quaternion);
        if (w === pistol) {
          // recoil: the muzzle kicks up and back, then settles
          w.mesh.quaternion.multiply(qB.setFromAxisAngle(tB.set(1, 0, 0), w.kick * 0.32));
          w.mesh.position.add(tB.set(0, 0, 0.03 * w.kick).applyQuaternion(w.mesh.quaternion));
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

    // the pistol: recoil settles, slide moves, flash fades, ammo shows
    {
      const p = pistol;
      p.kick *= Math.exp(-dt * 22); p.blow = Math.max(0, p.blow - dt / 0.07);
      slide.position.z = 0.028 * (p.slideBack ? 1 : Math.sin(Math.PI * (1 - p.blow)) * (p.blow > 0 ? 1 : 0));
      inMag.visible = p.magIn;
      const n = (p.chambered ? 1 : 0) + (p.magIn ? p.mag : 0);
      ammoDots.count = n; ammoDots.visible = n > 0;
      p.flash = Math.max(0, p.flash - dt); const fk = p.flash / 0.05;
      flashStar.material.opacity = fk; flashGlow.material.opacity = fk * 0.7; flashLight.intensity = fk * 5; flashStar.visible = flashGlow.visible = fk > 0;
      tracerT -= dt; tracer.visible = tracerT > 0; tracer.material.opacity = Math.max(0, tracerT / 0.04) * 0.8;
      // a magazine near the bottom of the grip clicks in
      if (p.state === 'held' && !p.magIn) {
        const gun = hands[p.hand]; p.mesh.updateMatrixWorld();
        const well = p.mesh.localToWorld(tA.copy(MAGWELL));
        for (const s of ['left', 'right']) {
          const h = hands[s]; if (!h.held || h.held.kind !== 'mag') continue;
          h.held.mesh.updateMatrixWorld();
          if (h.held.mesh.localToWorld(tB.copy(MAGTOP)).distanceTo(well) < TUNE.magSnap) insert(h, gun, h.held);
        }
      }
    }
    // held loose things (magazines, cans, heads) follow the hand
    for (const side of ['left', 'right']) {
      const h = hands[side], o = h.held; if (!o || o.kind === undefined || o === sword || o === pistol) continue;
      if (o.kind === 'mag') handPose({ kind: 'mag' }, h, o.mesh.position, o.mesh.quaternion);
      else { o.mesh.position.copy(h.pos).add(tA.set(0, 0, -0.06).applyQuaternion(h.quat)); o.mesh.quaternion.copy(h.quat); }
    }
    for (const s of shells) {
      if (s.life <= 0) continue;
      s.life -= dt; s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += s.s.x * dt; s.m.rotation.y += s.s.y * dt;
      if (s.m.position.y < 0.005) { s.m.position.y = 0.005; s.v.y *= -0.35; s.v.x *= 0.5; s.v.z *= 0.5; s.s.multiplyScalar(0.5); }
      if (s.life <= 0) s.m.visible = false;
    }
    return hitStop;
  }

  return {
    hands, sword, pistol, body, setBody, update, zoneOf,
    showHolsters(on) { hipHolster.visible = pouch.visible = on; },
    // for the preview and the checks
    forceHold(side, kind) { const h = hands[side]; const w = kind === 'sword' ? sword : pistol; if (h.held) return; h.sq = true; attach(h, w); },
    refill() { Object.assign(pistol, { chambered: true, mag: 7, magIn: true, slideBack: false }); },
    reset() {
      for (const side of ['left', 'right']) { const h = hands[side]; if (h.held) letGo(h); h.held = null; h.sq = false; h.trigDown = false; }
      for (const w of [sword, pistol]) { if (w.state === 'stuck') { scene.attach(w.mesh); w.stuck.d.stuck = []; w.stuck = null; } targets.hold(w.prop, 'holster'); w.state = 'holstered'; w.hand = null; w.fly = null; }
      for (const m of mags.splice(0)) targets.removeProp(m.prop);
      Object.assign(pistol, { chambered: true, mag: 7, magIn: true, slideBack: false, kick: 0 });
      sword.trail.clear();
    },
  };
}
