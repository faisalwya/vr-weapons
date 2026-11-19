// Weapons Sandbox VR, draft v02
// Things to hit: straw dummies on springy posts (heads and arms come off and grow back), tin cans on the log
// (they hop back up), puffball mushrooms (burst into spores, regrow). Also the physics world and what bullets hit.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COL, rnd, clamp, toon, basic, merge, M4, smoothNormals, outlineMat, lumpy, makeGlow, glowTex } from './fx.js';
import { LOG, GALLERY } from './forest.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion;
export const CUT_SPEED = 3.6;    // m/s at the point of contact: a real swing cuts
export const HIT_SPEED = 1.4;    // below this it is a tap
export const DUMMY_SPOTS = [[-1.5, -1.3], [1.5, -1.3], [2.4, 0.4]];   // the middle stays open: a clear lane to the cans
const PUFF_SPOTS = [[-3.0, -3.4, 0.24], [2.9, -3.8, 0.28], [-4.6, 0.6, 0.22], [4.2, -0.6, 0.26], [-1.6, -5.2, 0.2], [-1.3, 1.9, 0.2]];
const vertexToon = toon(0xffffff, { vertexColors: true });

export function createTargets(scene, { particles, audio, forest }) {
  const events = [];
  const emit = e => events.push(e);

  /* ---------- physics ---------- */
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world); world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.5; world.defaultContactMaterial.restitution = 0.22;
  { const g = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() }); g.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(g); }
  { const b = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(LOG.r, LOG.r, LOG.len, 10) }); b.position.set(LOG.x, LOG.r, LOG.z); b.quaternion.setFromEuler(0, 0, Math.PI / 2); world.addBody(b); }
  for (const t of forest.trunks) { const h = t.h || 6; const b = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(t.r, t.r, h, 8) }); b.position.set(t.x, h / 2, t.z); world.addBody(b); }

  // everything loose in the world: cans, cut-off parts, dropped weapons and magazines
  const props = [];
  function addProp(mesh, body, kind, extra = {}) {
    const p = Object.assign({ mesh, body, kind, held: null, age: 0, inWorld: true }, extra);
    body.linearDamping = 0.05; body.angularDamping = 0.15; body.sleepSpeedLimit = 0.15;
    world.addBody(body); props.push(p); body.userData = p;
    body.addEventListener('collide', e => onCollide(p, e));
    return p;
  }
  function removeProp(p) {
    if (p.inWorld) world.removeBody(p.body); p.inWorld = false;
    const i = props.indexOf(p); if (i >= 0) props.splice(i, 1);
    if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
  }
  function hold(p, side) { p.held = side; if (p.inWorld) { world.removeBody(p.body); p.inWorld = false; } }
  function release(p, pos, quat, vel, ang) {
    p.held = null; p.age = 0;
    p.body.position.set(pos.x, pos.y, pos.z); p.body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    p.body.velocity.set(vel.x, vel.y, vel.z); p.body.angularVelocity.set(ang.x, ang.y, ang.z);
    if (!p.inWorld) { world.addBody(p.body); p.inWorld = true; } p.body.wakeUp();
  }
  let thudCool = 0;
  function onCollide(p, e) {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v < 1.2) return;
    const other = e.body.userData;
    if (other && other.dummy) { wobble(other.dummy, p.body.velocity, p.body.position.y, Math.min(1.5, v * 0.25)); audio.thwack(Math.min(1, v / 8)); particles.burst('straw', p.body.position, 6, 0.8); emit({ type: 'bonk', v }); return; }
    if (thudCool > 0) return; thudCool = 0.06;
    if (p.kind === 'can') audio.can(); else if (p.kind === 'weapon' && p.weapon && p.weapon.kind === 'sword') audio.clang(); else audio.thud(v);
  }

  /* ---------- dummies ---------- */
  const dummies = [];
  const head = () => {
    const g = merge([
      [lumpy(new THREE.SphereGeometry(0.14, 14, 10), 0.08, 3), COL.burlap, M4(0, 0, 0, 0, 0, 0, 1, 1.08, 1)],
      [new THREE.BoxGeometry(0.05, 0.012, 0.012), COL.ink, M4(-0.05, 0.02, 0.132, 0, 0, 0.785)], [new THREE.BoxGeometry(0.05, 0.012, 0.012), COL.ink, M4(-0.05, 0.02, 0.132, 0, 0, -0.785)],
      [new THREE.CylinderGeometry(0.022, 0.022, 0.012, 10), 0x3a3448, M4(0.05, 0.025, 0.133, Math.PI / 2)],
      [new THREE.BoxGeometry(0.08, 0.008, 0.01), COL.ink, M4(0, -0.05, 0.128, 0, 0, 0.12)],
      [new THREE.ConeGeometry(0.02, 0.09, 4), COL.straw, M4(0.02, 0.16, 0, 0, 0, -0.3)], [new THREE.ConeGeometry(0.02, 0.08, 4), COL.straw, M4(-0.03, 0.155, 0.01, 0, 0, 0.4)],
      [new THREE.TorusGeometry(0.06, 0.012, 5, 12), COL.rope, M4(0, -0.14, 0, Math.PI / 2)],
    ]);
    return smoothNormals(g);
  };
  const arm = s => smoothNormals(merge([
    [new THREE.CylinderGeometry(0.05, 0.058, 0.3, 9), COL.burlapDark, M4(0, 0, 0, 0, 0, Math.PI / 2)],
    [new THREE.ConeGeometry(0.05, 0.1, 6), COL.straw, M4(s * 0.19, 0, 0, 0, 0, -s * Math.PI / 2)],
    [new THREE.TorusGeometry(0.055, 0.01, 5, 10), COL.rope, M4(s * 0.12, 0, 0, 0, Math.PI / 2)],
  ]));
  const body = smoothNormals(merge([
    [new THREE.BoxGeometry(0.7, 0.05, 0.1), COL.wood, M4(0, 0.025, 0)], [new THREE.BoxGeometry(0.1, 0.05, 0.7), COL.wood, M4(0, 0.03, 0)],
    [new THREE.CylinderGeometry(0.035, 0.045, 1.75, 7), COL.wood, M4(0, 0.875, 0)],
    [new THREE.CylinderGeometry(0.03, 0.03, 0.62, 6), COL.wood, M4(0, 1.38, -0.02, 0, 0, Math.PI / 2)],
    [lumpy(new THREE.CapsuleGeometry(0.18, 0.3, 6, 12), 0.06, 5), COL.burlap, M4(0, 1.14, 0, 0, 0, 0, 1, 1, 0.82)],
    [new THREE.TorusGeometry(0.17, 0.016, 5, 16), COL.rope, M4(0, 0.98, 0, Math.PI / 2, 0, 0, 1, 1, 0.84)],
    [new THREE.BoxGeometry(0.1, 0.012, 0.01), COL.ink, M4(0.05, 1.2, 0.152, 0, 0, 0.6)], [new THREE.BoxGeometry(0.08, 0.012, 0.01), COL.ink, M4(-0.06, 1.05, 0.15, 0, 0, -0.4)],
  ]));
  const PART = {
    head: { geo: head(), at: new V3(0, 1.6, 0), r: 0.155, hp: 2, shape: () => new CANNON.Sphere(0.14), mass: 1.2 },
    armL: { geo: arm(-1), at: new V3(-0.36, 1.38, 0), r: 0.11, hp: 2, shape: () => new CANNON.Box(new CANNON.Vec3(0.16, 0.055, 0.055)), mass: 0.6 },
    armR: { geo: arm(1), at: new V3(0.36, 1.38, 0), r: 0.11, hp: 2, shape: () => new CANNON.Box(new CANNON.Vec3(0.16, 0.055, 0.055)), mass: 0.6 },
  };
  const TORSO = [[new V3(0, 1.26, 0), 0.19], [new V3(0, 1.02, 0), 0.19]];
  const partMesh = name => { const m = new THREE.Mesh(PART[name].geo, vertexToon); if (name === 'head') m.add(new THREE.Mesh(PART[name].geo, outlineMat(0.008))); return m; };

  DUMMY_SPOTS.forEach(([x, z], i) => {
    const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = Math.atan2(-x, -z);   // face where you start
    const pivot = new THREE.Group(); root.add(pivot); scene.add(root);
    const b = new THREE.Mesh(body, vertexToon); b.add(new THREE.Mesh(body, outlineMat(0.01))); pivot.add(b);
    const d = { i, root, pivot, ax: 0, az: 0, vx: 0, vz: 0, parts: {}, colliders: [], stuck: [] };
    for (const name in PART) { const m = partMesh(name); m.position.copy(PART[name].at); pivot.add(m); d.parts[name] = { name, mesh: m, on: true, hp: PART[name].hp, regrow: 0, grow: 1 }; }
    // kinematic spheres so thrown things bounce off the sack
    for (const [c, r] of TORSO.concat([[PART.head.at, PART.head.r]])) {
      const cb = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape: new CANNON.Sphere(r) }); cb.userData = { dummy: d }; world.addBody(cb); d.colliders.push({ body: cb, c, r });
    }
    dummies.push(d);
  });
  const tmp = new V3(), tmp2 = new V3();
  function wobble(d, vel, y, k) {
    // a push at height y tips the post; the spring brings it back
    const h = clamp(y - d.root.position.y, 0.3, 1.8), sp = Math.hypot(vel.x, vel.z) || 1;
    tmp.set(vel.x / sp, 0, vel.z / sp);
    // into the dummy's own frame
    const c = Math.cos(-d.root.rotation.y), s = Math.sin(-d.root.rotation.y), lx = tmp.x * c + tmp.z * s, lz = -tmp.x * s + tmp.z * c;
    d.vx += lz * h * k * 2.2; d.vz -= lx * h * k * 2.2;
  }
  function detach(d, part, vel, power) {
    const m = part.mesh; m.updateMatrixWorld(); scene.attach(m);
    const P = PART[part.name], b = new CANNON.Body({ mass: P.mass, shape: P.shape() });
    b.position.set(m.position.x, m.position.y, m.position.z); b.quaternion.set(m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w);
    b.velocity.set(vel.x * 0.45 * power + rnd(-0.5, 0.5), Math.abs(vel.y) * 0.2 + rnd(1.5, 3), vel.z * 0.45 * power + rnd(-0.5, 0.5));
    b.angularVelocity.set(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12));
    addProp(m, b, 'part', { grab: 0.18, life: 11, what: part.name });
    part.on = false; part.mesh = null; part.regrow = 4.5; part.hp = P.hp;
    particles.burst('straw', m.position, 26, 1.4, vel.clone().normalize());
    particles.burst('dust', m.position, 4, 0.6);
  }
  // returns 'cut', 'hit' or 'tap'
  function hitDummy(d, partName, point, vel, how) {
    const sp = vel.length(), dir = tmp2.copy(vel).normalize();
    const part = d.parts[partName];
    if (how === 'bullet') {
      wobble(d, vel, point.y, partName === 'head' ? 0.7 : 0.45);
      particles.burst('straw', point, 10, 1, dir.clone().multiplyScalar(-0.6)); particles.burst('dust', point, 2, 0.5);
      if (part) { part.hp -= 1; if (part.hp <= 0) { detach(d, part, vel.clone().setLength(9), 1); audio.pop(); emit({ type: 'pop', what: partName, how }); return 'cut'; } }
      audio.thwack(0.4); return 'hit';
    }
    if (sp < HIT_SPEED) { wobble(d, vel, point.y, 0.12); audio.tap(); return 'tap'; }
    const k = clamp(sp / 8, 0.3, 1.4);
    wobble(d, vel, point.y, k);
    if (sp >= CUT_SPEED && part) {
      detach(d, part, vel, 1); audio.slash(); emit({ type: 'cut', what: partName, how, sp }); return 'cut';
    }
    particles.burst('straw', point, 8 + Math.round(10 * k), 1 + k, dir);
    if (sp >= CUT_SPEED) { audio.slash(); emit({ type: 'slash', what: partName || 'body', how, sp }); return 'cut'; }
    if (part) part.hp -= 1;
    audio.thwack(k); emit({ type: 'hit', what: partName || 'body', how, sp });
    return 'hit';
  }
  function stepDummies(dt) {
    for (const d of dummies) {
      // spring and damping on the post
      d.vx += (-55 * d.ax - 4.5 * d.vx) * dt; d.vz += (-55 * d.az - 4.5 * d.vz) * dt;
      d.ax = clamp(d.ax + d.vx * dt, -0.7, 0.7); d.az = clamp(d.az + d.vz * dt, -0.7, 0.7);
      d.pivot.rotation.set(d.ax, 0, d.az);
      d.pivot.updateMatrixWorld(true);
      for (const name in d.parts) {
        const p = d.parts[name];
        if (p.on) { if (p.grow < 1) { p.grow = Math.min(1, p.grow + dt * 2.2); const g = p.grow, e = 1 + Math.sin(g * Math.PI * 2.5) * (1 - g) * 0.6; p.mesh.scale.setScalar(Math.max(0.01, g * e)); } continue; }
        p.regrow -= dt;
        if (p.regrow <= 0) {
          p.mesh = partMesh(name); p.mesh.position.copy(PART[name].at); p.mesh.scale.setScalar(0.01); d.pivot.add(p.mesh);
          p.on = true; p.grow = 0; p.hp = PART[name].hp;
          const at = d.pivot.localToWorld(PART[name].at.clone()); particles.burst('leaf', at, 10, 0.8); particles.burst('magic', at, 14, 1);
          audio.boing(); emit({ type: 'regrow', what: name });
        }
      }
      for (const c of d.colliders) {
        const w = d.pivot.localToWorld(tmp.copy(c.c)); c.body.position.set(w.x, w.y, w.z);
        if (c.c === PART.head.at) c.body.collisionResponse = d.parts.head.on;
      }
    }
  }

  /* ---------- tin cans on the log ---------- */
  const cans = [];
  const LABELS = [0xd8432a, 0x3f78b0, 0x6f9a42, 0xe0a83a, 0x8a4fb0, 0xd8432a];
  // all six cans draw as three instanced meshes (tin, label, ink); each can's own transform lives on an empty proxy
  const canBodyGeo = smoothNormals(merge([[new THREE.CylinderGeometry(0.036, 0.036, 0.11, 12), COL.tin, M4()], [new THREE.TorusGeometry(0.034, 0.003, 4, 12), COL.steelDark, M4(0, 0.055, 0, Math.PI / 2)]]));
  const canLabelGeo = new THREE.CylinderGeometry(0.0365, 0.0365, 0.06, 12, 1, true).translate(0, -0.005, 0);
  const canTin = new THREE.InstancedMesh(canBodyGeo, vertexToon, LABELS.length), canLabel = new THREE.InstancedMesh(canLabelGeo, toon(0xffffff), LABELS.length), canInk = new THREE.InstancedMesh(canBodyGeo, outlineMat(0.004), LABELS.length);
  canTin.frustumCulled = canLabel.frustumCulled = canInk.frustumCulled = false; scene.add(canTin, canLabel, canInk);
  LABELS.forEach((c, i) => {
    canLabel.setColorAt(i, new THREE.Color(c));
    const m = new THREE.Object3D();
    const home = new V3(LOG.x - 0.75 + i * 0.3, LOG.r * 2 + 0.055, LOG.z);
    const b = new CANNON.Body({ mass: 0.25, shape: new CANNON.Cylinder(0.036, 0.036, 0.11, 10) }); b.position.set(home.x, home.y, home.z);
    m.position.copy(home);
    const p = addProp(m, b, 'can', { grab: 0.1, home, down: 0, hop: -1 });
    cans.push(p);
  });
  function drawCans() {
    cans.forEach((c, i) => { c.mesh.updateMatrix(); canTin.setMatrixAt(i, c.mesh.matrix); canLabel.setMatrixAt(i, c.mesh.matrix); canInk.setMatrixAt(i, c.mesh.matrix); });
    canTin.instanceMatrix.needsUpdate = canLabel.instanceMatrix.needsUpdate = canInk.instanceMatrix.needsUpdate = true;
  }
  function stepCans(dt) {
    for (const c of cans) {
      if (c.hop >= 0) {
        // hopping home: a little arc, landing upright
        c.hop += dt / 0.55; const k = Math.min(1, c.hop), e = k * k * (3 - 2 * k);
        c.mesh.position.lerpVectors(c.from, c.home, e); c.mesh.position.y += Math.sin(Math.PI * k) * 0.6;
        c.mesh.quaternion.slerpQuaternions(c.fromQ, new THREE.Quaternion(), e);
        if (k >= 1) { c.hop = -1; release(c, c.home, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }); particles.burst('magic', c.home, 8, 0.6); }
        continue;
      }
      if (c.held) { c.down = 0; continue; }
      const off = c.body.position.distanceTo(new CANNON.Vec3(c.home.x, c.home.y, c.home.z)) > 0.06 || c.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y < 0.85;
      c.down = off ? c.down + dt : 0;
      if (c.down > 4.5 || (off && c.body.position.y < -2)) {
        // a hop home
        hold(c, null); c.hop = 0; c.from = c.mesh.position.clone(); c.fromQ = c.mesh.quaternion.clone(); c.down = 0;
        particles.burst('magic', c.from, 8, 0.6); audio.hop();
      }
    }
  }
  function hitCan(c, point, vel, how) {
    if (c.held || c.hop >= 0) return 'tap';
    const k = how === 'bullet' ? 1 : clamp(vel.length() / 6, 0.2, 1.5);
    const J = vel.clone().setLength(how === 'bullet' ? 1.6 : 0.9 * k * vel.length() * 0.12);
    c.body.wakeUp();
    c.body.applyImpulse(new CANNON.Vec3(J.x, J.y + (how === 'bullet' ? 0.5 : 0.2), J.z), new CANNON.Vec3(point.x, point.y, point.z));
    c.body.angularVelocity.set(rnd(-15, 15), rnd(-15, 15), rnd(-15, 15));
    particles.burst('spark', point, how === 'bullet' ? 12 : 6, 1);
    audio.can(); emit({ type: 'can', how });
    return 'hit';
  }

  /* ---------- puffball mushrooms ---------- */
  const puffs = [];
  const puffGeo = (() => {
    const parts = [[lumpy(new THREE.SphereGeometry(1, 16, 12), 0.07, 11), COL.puff, M4(0, 0.78, 0, 0, 0, 0, 1, 0.8, 1)], [new THREE.CylinderGeometry(0.45, 0.6, 0.3, 10), 0xcfc0a4, M4(0, 0.15, 0)]];
    for (let i = 0; i < 9; i++) { const a = i * 2.4, y = 0.45 + (i % 3) * 0.3, r = Math.sqrt(Math.max(0, 1 - Math.pow((y - 0.78) / 0.8, 2))); parts.push([new THREE.SphereGeometry(0.11, 6, 4), i % 2 ? COL.sporePink : 0xe8b8a0, M4(Math.cos(a) * r * 0.98, y, Math.sin(a) * r * 0.98, 0, 0, 0, 1, 0.5, 1)]); }
    return smoothNormals(merge(parts));
  })();
  const puffMesh = new THREE.InstancedMesh(puffGeo, vertexToon, PUFF_SPOTS.length), puffInk = new THREE.InstancedMesh(puffGeo, outlineMat(0.035), PUFF_SPOTS.length);
  puffMesh.frustumCulled = puffInk.frustumCulled = false; scene.add(puffMesh, puffInk);
  for (const [x, z, r] of PUFF_SPOTS) {
    const m = new THREE.Object3D(); m.position.set(x, 0, z); m.scale.setScalar(r); m.rotation.y = rnd(6);
    puffs.push({ mesh: m, r, c: new V3(x, r * 0.78, z), on: true, k: 1, regrow: 0 });
  }
  function drawPuffs() {
    puffs.forEach((p, i) => { p.mesh.updateMatrix(); puffMesh.setMatrixAt(i, p.mesh.matrix); puffInk.setMatrixAt(i, p.mesh.matrix); });
    puffMesh.instanceMatrix.needsUpdate = puffInk.instanceMatrix.needsUpdate = true;
  }
  function hitPuff(p, point, vel, how) {
    if (!p.on) return 'tap';
    if (how !== 'bullet' && vel.length() < HIT_SPEED) { audio.tap(); return 'tap'; }
    p.on = false; p.regrow = 6;
    particles.burst('spore', p.c, 70, 1.3); particles.burst('dust', p.c, 8, 1);
    audio.puff(); emit({ type: 'puff', how });
    return 'cut';
  }
  function stepPuffs(dt, t) {
    for (const p of puffs) {
      if (p.on) {
        p.k = Math.min(1, p.k + dt * 1.8);
        const e = p.k < 1 ? 1 + Math.sin(p.k * Math.PI * 3) * (1 - p.k) * 0.5 : 1 + Math.sin(t * 2 + p.c.x) * 0.02;
        p.mesh.scale.set(p.r * p.k * e, p.r * p.k * (2 - e), p.r * p.k * e);
        // now and then a few spores drift up
        if (Math.random() < dt * 0.6) particles.burst('spore', tmp.copy(p.c).setY(p.c.y + p.r * 0.6), 2, 0.25);
      } else {
        p.k = Math.max(0, p.k - dt * 8); p.mesh.scale.setScalar(Math.max(0.001, p.r * p.k));
        p.regrow -= dt;
        if (p.regrow <= 0) { p.on = true; p.k = 0; audio.boing(); particles.burst('magic', p.c, 10, 0.8); }
      }
    }
  }


  /* ---------- breakables: bottles, clay pots and melons, one instanced mesh per kind ---------- */
  // Each piece is a sphere to hit. Broken pieces shrink away and grow back after a while.
  const kinds = {};
  function breakables(name, geo, items, o) {
    const m = new THREE.InstancedMesh(geo, vertexToon, items.length), ink = new THREE.InstancedMesh(geo, outlineMat(o.ink || 0.006), items.length); ink.visible = o.ink !== 0;
    const col = new THREE.Color();
    items.forEach((it, i) => { m.setColorAt(i, col.set(it.tint || 0xffffff)); it.on = true; it.k = 1; it.regrow = 0; it.i = i; it.ry = rnd(6); it.wob = 0; });
    m.frustumCulled = ink.frustumCulled = false; scene.add(m, ink);
    const K = { name, m, ink, items, o };
    kinds[name] = K;
    return K;
  }
  const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler(), sv = new V3();
  function drawBreakables(K, dt, t) {
    for (const it of K.items) {
      if (it.on) { if (it.k < 1) { it.k = Math.min(1, it.k + dt * 2.4); } }
      else { it.k = Math.max(0, it.k - dt * 10); it.regrow -= dt; if (it.regrow <= 0) { it.on = true; it.k = 0; particles.burst('magic', it.c, 10, 0.7); audio.boing(); } }
      const g = it.k, e = g < 1 && it.on ? 1 + Math.sin(g * Math.PI * 2.5) * (1 - g) * 0.5 : 1, sc = Math.max(0.0001, g * e * (it.s || 1));
      it.wob *= Math.exp(-dt * 6);
      mtx.compose(sv.set(it.c.x, it.c.y - (it.lift || 0), it.c.z), qq.setFromEuler(ee.set(Math.sin(t * 20) * it.wob, it.ry, Math.cos(t * 17) * it.wob)), new V3(sc, sc, sc));
      K.m.setMatrixAt(it.i, mtx); K.ink.setMatrixAt(it.i, mtx);
    }
    K.m.instanceMatrix.needsUpdate = K.ink.instanceMatrix.needsUpdate = true;
  }
  const BOTTLE_TINTS = [0x7fd0a0, 0xd9a441, 0x7fb0e0, 0x9fe0c0, 0xc89060, 0x80c0b0];
  const bottleGeo = smoothNormals(merge([
    [new THREE.CylinderGeometry(0.036, 0.04, 0.15, 10), 0xffffff, M4(0, 0.075, 0)],
    [new THREE.CylinderGeometry(0.014, 0.034, 0.05, 10), 0xffffff, M4(0, 0.175, 0)],
    [new THREE.CylinderGeometry(0.013, 0.013, 0.05, 8), 0xffffff, M4(0, 0.22, 0)],
    [new THREE.CylinderGeometry(0.011, 0.011, 0.02, 8), 0x8a6a48, M4(0, 0.252, 0)],
    [new THREE.BoxGeometry(0.008, 0.11, 0.004), 0xffffff, M4(-0.018, 0.08, 0.033, 0, -0.4, 0)],
    [new THREE.CylinderGeometry(0.0405, 0.0405, 0.05, 10, 1, true), 0xf1e6cf, M4(0, 0.07, 0)],
  ]));
  {
    const F = GALLERY.fence, n = 6, items = [];
    for (let i = 0; i < n; i++) { const x = F.x0 + 0.15 + (F.x1 - F.x0 - 0.3) * i / (n - 1); items.push({ c: new V3(x, F.top, F.z), r: 0.07, lift: 0, tint: BOTTLE_TINTS[i], hc: new V3(x, F.top + 0.12, F.z) }); }
    breakables('bottle', bottleGeo, items, { ink: 0 });
  }
  const potGeo = (() => {
    const pts = [[0.0, 0], [0.09, 0], [0.13, 0.05], [0.16, 0.13], [0.15, 0.2], [0.1, 0.26], [0.085, 0.29], [0.1, 0.31], [0.085, 0.32]].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, 14);
    return smoothNormals(merge([[g, 0xb8643a, M4()], [new THREE.TorusGeometry(0.155, 0.008, 4, 16), 0xf1e6cf, M4(0, 0.15, 0, Math.PI / 2)], [new THREE.TorusGeometry(0.15, 0.006, 4, 16), 0x2c2228, M4(0, 0.11, 0, Math.PI / 2)]]));
  })();
  breakables('pot', potGeo, GALLERY.plinths.map(([x, z, h], i) => ({ c: new V3(x, h, z), r: 0.17, s: 1 + (i % 2) * 0.25, hc: new V3(x, h + 0.16 * (1 + (i % 2) * 0.25), z), tint: [0xffffff, 0xe0c8b0, 0xffe0d0, 0xd8d0c8][i] })), { ink: 0.006 });
  const melonGeo = (() => {
    const g = new THREE.SphereGeometry(0.15, 18, 12); g.scale(1.15, 0.95, 1);
    const p = g.attributes.position, cols = new Float32Array(p.count * 3), a = new THREE.Color(0x3f8a3c), b = new THREE.Color(0x9cc860), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const ang = Math.atan2(p.getZ(i), p.getX(i)); c.copy(Math.sin(ang * 8) > 0.2 ? a : b); cols.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.translate(0, 0.14, 0);
    return smoothNormals(merge([[g, 0xffffff, M4()], [new THREE.CylinderGeometry(0.008, 0.012, 0.05, 5), COL.bark, M4(0, 0.29, 0, 0.3)]]));
  })();
  // the melon's own stripes live in its vertex colours: merge() overwrote them, so paint them again
  {
    const p = melonGeo.attributes.position, col = melonGeo.attributes.color, a = new THREE.Color(0x3f8a3c), b = new THREE.Color(0x9cc860);
    const nS = new THREE.SphereGeometry(0.15, 18, 12).toNonIndexed().attributes.position.count;   // the sphere comes first in the merge, the stem after
    for (let i = 0; i < nS; i++) { const ang = Math.atan2(p.getZ(i), p.getX(i)), c = Math.sin(ang * 8) > 0.2 ? a : b; col.setXYZ(i, c.r, c.g, c.b); }
  }
  breakables('melon', melonGeo, GALLERY.stumps.map(([x, z]) => ({ c: new V3(x, 0.5, z), r: 0.17, hc: new V3(x, 0.64, z) })), { ink: 0.006 });
  const BREAK = {
    bottle: (it, p, v) => { particles.burst('glass', it.hc, 26, 1.1, { x: v.x * 0.15, y: 0, z: v.z * 0.15, color: BOTTLE_TINTS[it.i % BOTTLE_TINTS.length] }); audio.glass(); },
    pot: (it, p, v) => { particles.burst('clay', it.hc, 30, 1.2); particles.burst('dust', it.hc, 6, 0.8); audio.clay(); },
    melon: (it, p, v) => { particles.burst('melon', it.hc, 36, 1.3); audio.splat(); },
  };
  function hitBreakable(name, it, point, vel, how) {
    if (!it.on || it.k < 0.6) return 'tap';
    if (how !== 'bullet' && vel.length() < HIT_SPEED) { it.wob = 0.3; audio.tap(); return 'tap'; }
    it.on = false; it.regrow = rnd(6, 9);
    BREAK[name](it, point, vel); emit({ type: 'smash', what: name, how });
    return 'cut';
  }

  /* ---------- paper lanterns on a rope: they swing when hit, the second hit tears one loose ---------- */
  const lanterns = [];
  const lanternGeo = smoothNormals(merge([
    [lumpy(new THREE.SphereGeometry(0.16, 14, 10), 0.03, 7), 0xffd9a0, M4(0, 0, 0, 0, 0, 0, 1, 1.25, 1)],
    [new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12), 0x2c2228, M4(0, 0.2, 0)], [new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12), 0x2c2228, M4(0, -0.2, 0)],
    [new THREE.TorusGeometry(0.16, 0.004, 4, 16), 0xd8432a, M4(0, 0.06, 0, Math.PI / 2)], [new THREE.TorusGeometry(0.16, 0.004, 4, 16), 0xd8432a, M4(0, -0.06, 0, Math.PI / 2)],
    [new THREE.ConeGeometry(0.03, 0.12, 5), 0xd8432a, M4(0, -0.29, 0, Math.PI)],
  ]));
  const lanternMat = new THREE.MeshBasicMaterial({ vertexColors: true });   // unlit: it glows from inside
  const stringGeo = new THREE.CylinderGeometry(0.005, 0.005, 1, 4, 1, true).translate(0, -0.5, 0);
  GALLERY.lanterns.forEach((x, i) => {
    const R = GALLERY.rope, k = (x - R.x0) / (R.x1 - R.x0), anchor = new V3(x, R.y - Math.sin(Math.PI * k) * 0.35, R.z), len = 0.9 + (i % 2) * 0.35;
    const m = new THREE.Mesh(lanternGeo, lanternMat);
    const halo = makeGlow(0xffb060, 0.9, 0.55); m.add(halo);
    const str = { position: new V3(), quaternion: new Q(), scale: new V3(), visible: true }; scene.add(m);
    lanterns.push({ i, m, str, halo, anchor, len, ax: rnd(-0.05, 0.05), az: 0, vx: 0, vz: rnd(-0.2, 0.2), hp: 2, state: 'hang', fall: null, regrow: 0, c: anchor.clone().setY(anchor.y - len) });
  });
  const strings = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(GALLERY.lanterns.length * 6), 3)), new THREE.LineBasicMaterial({ color: COL.rope }));
  strings.frustumCulled = false; scene.add(strings);
  function drawStrings() {
    const a = strings.geometry.attributes.position.array;
    lanterns.forEach((L, i) => { const top = L.anchor, bot = L.str.visible ? L.c : L.anchor; a.set([top.x, top.y, top.z, bot.x, bot.y + 0.2, bot.z], i * 6); });
    strings.geometry.attributes.position.needsUpdate = true;
  }
  function lanternHit(L, point, vel, how) {
    if (L.state !== 'hang') return 'tap';
    const sp = how === 'bullet' ? 4 : vel.length();
    if (how !== 'bullet' && sp < HIT_SPEED) { L.vx += vel.z * 0.3; L.vz -= vel.x * 0.3; audio.rustle(); return 'tap'; }
    L.vx += clamp(vel.z, -8, 8) * 0.25 + rnd(-0.5, 0.5); L.vz -= clamp(vel.x, -8, 8) * 0.25 + rnd(-0.5, 0.5);
    L.hp -= how === 'bullet' ? 1 : 2;
    particles.burst('paper', L.c, 6, 0.6); particles.burst('ember', L.c, 6, 0.5);
    if (L.hp > 0) { audio.rustle(); emit({ type: 'lanternHit' }); return 'hit'; }
    L.state = 'fall'; L.fall = { v: new V3(vel.x * 0.05, 0.5, vel.z * 0.05), spin: rnd(-6, 6) }; audio.rustle(); emit({ type: 'lantern', how });
    return 'cut';
  }
  function stepLanterns(dt, t) {
    for (const L of lanterns) {
      if (L.state === 'hang' || L.state === 'lower') {
        const g = 9.8 / L.len;
        L.vx += (-g * Math.sin(L.ax) - 0.4 * L.vx) * dt; L.vz += (-g * Math.sin(L.az) - 0.4 * L.vz) * dt;
        L.ax += L.vx * dt; L.az += L.vz * dt;
        const len = L.state === 'lower' ? L.len * Math.min(1, L.lower) : L.len;
        if (L.state === 'lower') { L.lower += dt * 0.9; if (L.lower >= 1) { L.state = 'hang'; L.hp = 2; } }
        // pendulum: angle ax swings toward +z, az toward -x
        L.c.set(L.anchor.x - Math.sin(L.az) * len, L.anchor.y - Math.cos(L.ax) * Math.cos(L.az) * len, L.anchor.z + Math.sin(L.ax) * len);
        L.m.position.copy(L.c); L.m.rotation.set(L.ax, t * 0.2 + L.i, L.az); L.m.visible = true; L.m.scale.setScalar(1);
        L.str.visible = true; L.str.position.copy(L.anchor); L.str.quaternion.setFromUnitVectors(new V3(0, -1, 0), tmp.subVectors(L.c, L.anchor).normalize()); L.str.scale.set(1, L.anchor.distanceTo(L.c) - 0.2, 1);
        L.halo.material.opacity = 0.45 + Math.sin(t * 7 + L.i * 3) * 0.05 + Math.sin(t * 13 + L.i) * 0.04;
      } else if (L.state === 'fall') {
        L.fall.v.y -= 9.8 * dt; L.c.addScaledVector(L.fall.v, dt); L.m.position.copy(L.c); L.m.rotation.z += L.fall.spin * dt; L.str.visible = false;
        if (L.c.y < 0.25) { L.state = 'gone'; L.m.visible = false; L.regrow = 6; particles.burst('paper', L.c, 30, 1.2); particles.burst('ember', L.c, 24, 1.2); particles.burst('smoke', L.c, 6, 1); audio.paperPop(); }
      } else if (L.state === 'gone') {
        L.regrow -= dt; if (L.regrow <= 0) { L.state = 'lower'; L.lower = 0.05; L.ax = L.az = L.vx = L.vz = 0; particles.burst('magic', L.anchor, 10, 0.6); audio.rise(); }
      }
    }
  }

  /* ---------- pop-up critters: wooden cut-outs that flip up and dare you ---------- */
  const critterShapes = {
    // a round little goblin: head, big ears, a body with a target painted on it
    goblin: () => { const s = new THREE.Shape(); s.absellipse(0, 0.32, 0.2, 0.26, 0, Math.PI * 2); const h = new THREE.Shape(); h.absarc(0, 0.68, 0.16, 0, Math.PI * 2); const e1 = new THREE.Shape(); e1.moveTo(-0.12, 0.72); e1.lineTo(-0.34, 0.86); e1.lineTo(-0.1, 0.62); const e2 = new THREE.Shape(); e2.moveTo(0.12, 0.72); e2.lineTo(0.34, 0.86); e2.lineTo(0.1, 0.62); return [s, h, e1, e2]; },
    crow: () => { const s = new THREE.Shape(); s.absellipse(0, 0.42, 0.18, 0.3, 0, Math.PI * 2); const h = new THREE.Shape(); h.absarc(0.05, 0.78, 0.12, 0, Math.PI * 2); const b = new THREE.Shape(); b.moveTo(0.14, 0.8); b.lineTo(0.32, 0.74); b.lineTo(0.14, 0.72); const w = new THREE.Shape(); w.moveTo(-0.1, 0.55); w.lineTo(-0.42, 0.3); w.lineTo(-0.12, 0.3); return [s, h, b, w]; },
    boar: () => { const s = new THREE.Shape(); s.absellipse(0, 0.34, 0.34, 0.22, 0, Math.PI * 2); const h = new THREE.Shape(); h.absellipse(0.32, 0.42, 0.14, 0.12, 0, Math.PI * 2); const t = new THREE.Shape(); t.moveTo(0.4, 0.36); t.lineTo(0.5, 0.48); t.lineTo(0.44, 0.34); const l = new THREE.Shape(); l.moveTo(-0.2, 0.15); l.lineTo(-0.16, 0.0); l.lineTo(-0.08, 0.0); l.lineTo(-0.1, 0.15); const l2 = new THREE.Shape(); l2.moveTo(0.1, 0.15); l2.lineTo(0.14, 0.0); l2.lineTo(0.22, 0.0); l2.lineTo(0.2, 0.15); return [s, h, t, l, l2]; },
  };
  const CRITTER_COL = { goblin: 0x6f9a42, crow: 0x3a3448, boar: 0x8a5a3a };
  function critterGeo(kind) {
    const ex = { depth: 0.035, bevelEnabled: false, curveSegments: 10 }, parts = critterShapes[kind]().map(sh => [new THREE.ExtrudeGeometry(sh, ex), CRITTER_COL[kind], M4(0, 0, -0.0175)]);
    const cy = kind === 'boar' ? 0.34 : kind === 'crow' ? 0.42 : 0.32;
    // the painted target and eyes
    parts.push([new THREE.CircleGeometry(0.12, 18), 0xf1e6cf, M4(0, cy, 0.019)], [new THREE.CircleGeometry(0.075, 18), 0xd8432a, M4(0, cy, 0.02)], [new THREE.CircleGeometry(0.03, 12), 0xf1e6cf, M4(0, cy, 0.021)]);
    const ey = kind === 'goblin' ? [[-0.06, 0.7], [0.06, 0.7]] : kind === 'crow' ? [[0.08, 0.8]] : [[0.34, 0.46]];
    for (const [x, y] of ey) parts.push([new THREE.CircleGeometry(0.025, 10), 0xffe28a, M4(x, y, 0.019)], [new THREE.CircleGeometry(0.011, 8), 0x1b1622, M4(x + 0.004, y, 0.02)]);
    parts.push([new THREE.BoxGeometry(0.1, 0.06, 0.06), COL.wood, M4(0, 0.03, 0)]);
    return smoothNormals(merge(parts));
  }
  const critters = [];
  const KINDS = ['goblin', 'crow', 'boar', 'goblin', 'crow'];
  const cGeo = {}; for (const k of new Set(KINDS)) cGeo[k] = critterGeo(k);
  GALLERY.critters.forEach(([x, z], i) => {
    const kind = KINDS[i], hinge = new THREE.Group(); hinge.position.set(x, 0, z); hinge.rotation.y = Math.atan2(-x, -z);
    const piv = new THREE.Group(); hinge.add(piv);
    const m = new THREE.Mesh(cGeo[kind], vertexToon); m.scale.setScalar(1.25); piv.add(m);
    scene.add(hinge);
    critters.push({ i, kind, hinge, piv, ang: -Math.PI / 2 + 0.02, target: -Math.PI / 2, vel: 0, state: 'down', t: rnd(0.5, 4), cy: (kind === 'boar' ? 0.34 : kind === 'crow' ? 0.5 : 0.45) * 1.25 });
  });
  // their base planks, all in one mesh
  { const bp = GALLERY.critters.map(([x, z]) => [new THREE.BoxGeometry(0.5, 0.05, 0.2), COL.wood, M4(x, 0.025, z, 0, Math.atan2(-x, -z), 0)]); scene.add(new THREE.Mesh(merge(bp), vertexToon)); }
  function critterHit(C, point, vel, how) {
    if (C.state !== 'up' && C.state !== 'rising') return 'tap';
    C.state = 'falling'; C.target = -Math.PI / 2; C.vel = -9; C.t = rnd(2.5, 5);
    particles.burst('wood', point, 16, 1.2); particles.burst('dust', point, 3, 0.6);
    audio.clack(); emit({ type: 'critter', what: C.kind, how });
    return 'cut';
  }
  function stepCritters(dt) {
    const up = critters.filter(c => c.state === 'up' || c.state === 'rising').length;
    for (const C of critters) {
      C.t -= dt;
      if (C.state === 'down' && C.t <= 0) {
        if (up < 3) { C.state = 'rising'; C.target = 0; C.t = rnd(3, 5.5); audio.rise(); } else C.t = rnd(0.5, 1.5);
      } else if (C.state === 'rising' && C.ang > -0.05) C.state = 'up';
      else if (C.state === 'up' && C.t <= 0) { C.state = 'falling'; C.target = -Math.PI / 2; C.t = rnd(1.5, 4); }
      else if (C.state === 'falling' && C.ang < -Math.PI / 2 + 0.05) { C.state = 'down'; }
      // a springy hinge: it slaps up and wobbles; on the way down it falls flat
      const k = C.target === 0 ? 120 : 60, d = C.target === 0 ? 9 : 4;
      C.vel += (k * (C.target - C.ang) - d * C.vel) * dt; C.ang += C.vel * dt;
      if (C.ang < -Math.PI / 2) { C.ang = -Math.PI / 2; C.vel = -C.vel * 0.25; }
      C.piv.rotation.x = C.ang;
    }
  }

  /* ---------- the gong: far away, worth the shot ---------- */
  const gong = (() => {
    const G = GALLERY.gong, hang = new THREE.Group(); hang.position.set(G.x, 3.0, G.z);
    const geo = smoothNormals(merge([
      [new THREE.CylinderGeometry(0.62, 0.62, 0.06, 32), 0xc8963a, M4(0, 0, 0, Math.PI / 2)],
      [new THREE.CylinderGeometry(0.2, 0.2, 0.08, 24), 0xe8c060, M4(0, 0, 0, Math.PI / 2)],
      [new THREE.TorusGeometry(0.42, 0.012, 4, 32), 0x8a5a2a, M4(0, 0, 0.035)], [new THREE.TorusGeometry(0.6, 0.02, 4, 32), 0x6a4420, M4(0, 0, 0.032)],
    ]));
    const disc = new THREE.Mesh(geo, vertexToon); disc.position.y = -(3.0 - G.y);
    hang.add(disc); hang.rotation.y = Math.atan2(-G.x, -G.z);
    { const L = 3.0 - G.y - 0.5, rg = merge([-0.35, 0.35].map(sx => [new THREE.CylinderGeometry(0.008, 0.008, L, 4), COL.rope, M4(sx, -L / 2, 0)])); hang.add(new THREE.Mesh(rg, vertexToon)); }
    scene.add(hang);
    const ring = makeGlow(0xffe7a8, 1, 0); ring.position.set(G.x, G.y, G.z + 0.1); scene.add(ring);
    return { hang, disc, c: new V3(G.x, G.y, G.z), r: 0.62, ax: 0, v: 0, shimmer: 0, ring, cool: 0 };
  })();
  function gongHit(point, vel, how) {
    if (gong.cool > 0) return 'tap';
    gong.cool = 0.25; gong.v += how === 'bullet' ? 1.4 : clamp(vel.length() * 0.2, 0.3, 2); gong.shimmer = 1;
    particles.burst('spark', point, 14, 1.2); audio.gong(); emit({ type: 'gong', how });
    return 'hit';
  }
  function stepGong(dt, t) {
    gong.cool -= dt;
    gong.v += (-14 * gong.ax - 1.2 * gong.v) * dt; gong.ax += gong.v * dt; gong.hang.rotation.x = gong.ax;
    gong.shimmer = Math.max(0, gong.shimmer - dt * 0.7);
    gong.ring.visible = gong.shimmer > 0.01; gong.ring.material.opacity = gong.shimmer * 0.8; gong.ring.scale.setScalar(1.2 + (1 - gong.shimmer) * 2.5);
    gong.disc.position.x = Math.sin(t * 60) * 0.006 * gong.shimmer;
  }

  /* ---------- bubbles: drifting up from the glowing flowers ---------- */
  const NB = 7, bubbleMat = new THREE.MeshBasicMaterial({ color: 0xcff8ff, transparent: true, opacity: 0.45, depthWrite: false });
  const bubbleMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), bubbleMat, NB); bubbleMesh.frustumCulled = false; scene.add(bubbleMesh);
  const shineMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), NB); shineMesh.frustumCulled = false; scene.add(shineMesh);
  const bubbles = Array.from({ length: NB }, (_, i) => ({ i, on: false, c: new V3(), r: 0.12, t: i * 1.4, p: rnd(6) }));
  let bubbleT = 0;
  function stepBubbles(dt, t) {
    bubbleT -= dt;
    if (bubbleT <= 0) { const b = bubbles.find(b => !b.on); if (b) { b.on = true; b.c.set(GALLERY.bubbles[0] + rnd(-0.3, 0.3), 0.4, GALLERY.bubbles[1] + rnd(-0.3, 0.3)); b.r = rnd(0.1, 0.17); b.k = 0; b.p = rnd(6); } bubbleT = rnd(1.2, 2.2); }
    for (const b of bubbles) {
      if (b.on) {
        b.k = Math.min(1, (b.k || 0) + dt * 2);
        b.c.y += dt * 0.32; b.c.x += Math.sin(t * 0.9 + b.p) * dt * 0.25; b.c.z += Math.cos(t * 0.7 + b.p) * dt * 0.2;
        if (b.c.y > 7.5) { b.on = false; particles.burst('bubble', b.c, 8, 0.4); }
      }
      const s = b.on ? b.r * b.k * (1 + Math.sin(t * 5 + b.p) * 0.04) : 0.0001;
      mtx.compose(b.c, qq.identity(), sv.set(s, s * (1 + Math.sin(t * 4 + b.p) * 0.05), s)); bubbleMesh.setMatrixAt(b.i, mtx);
      mtx.compose(tmp2.set(b.c.x - s * 0.35, b.c.y + s * 0.45, b.c.z + s * 0.6), qq, sv.setScalar(s * 0.16)); shineMesh.setMatrixAt(b.i, mtx);
    }
    bubbleMesh.instanceMatrix.needsUpdate = shineMesh.instanceMatrix.needsUpdate = true;
  }
  function bubbleHit(b, point, vel, how) {
    if (!b.on) return 'tap';
    b.on = false; particles.burst('bubble', b.c, 22, 1); particles.burst('magic', b.c, 6, 0.6); audio.bubble(); emit({ type: 'bubble', how });
    return 'cut';
  }

  /* ---------- what is there to hit: spheres for blades, rays for bullets ---------- */
  const hitList = [];
  // things defined elsewhere (the Sparring Bot, its shots, its button) add their own spheres: { c, r, kind: 'ext', id, onHit }
  const providers = [];
  function spheres() {
    hitList.length = 0;
    for (const d of dummies) {
      for (const name in d.parts) { const p = d.parts[name]; if (p.on && p.grow > 0.6) hitList.push({ c: d.pivot.localToWorld(PART[name].at.clone()), r: PART[name].r, kind: 'dummy', d, part: name, id: `d${d.i}${name}` }); }
      TORSO.forEach(([c, r], j) => hitList.push({ c: d.pivot.localToWorld(c.clone()), r, kind: 'dummy', d, part: null, id: `d${d.i}t${j}` }));
    }
    for (const c of cans) if (!c.held && c.hop < 0) hitList.push({ c: new V3(c.body.position.x, c.body.position.y, c.body.position.z), r: 0.055, kind: 'can', can: c, id: 'c' + cans.indexOf(c) });
    for (const p of puffs) if (p.on && p.k > 0.6) hitList.push({ c: p.c, r: p.r * 0.95, kind: 'puff', puff: p, id: 'p' + puffs.indexOf(p) });
    for (const name in kinds) for (const it of kinds[name].items) if (it.on && it.k > 0.6) hitList.push({ c: it.hc, r: it.r, kind: 'break', name, it, id: name + it.i });
    for (const L of lanterns) if (L.state === 'hang') hitList.push({ c: L.c, r: 0.2, kind: 'lantern', L, id: 'l' + L.i });
    for (const C of critters) if ((C.state === 'up' || C.state === 'rising') && C.ang > -0.6) { C.piv.updateMatrixWorld(); hitList.push({ c: C.piv.localToWorld(new V3(0, C.cy, 0)), r: 0.34, kind: 'critter', C, id: 'k' + C.i }); }
    hitList.push({ c: gong.c, r: gong.r, kind: 'gong', id: 'gong' });
    for (const b of bubbles) if (b.on && b.k > 0.5) hitList.push({ c: b.c, r: b.r + 0.03, kind: 'bubble', b, id: 'b' + b.i });
    for (const f of providers) f(hitList);
    return hitList;
  }
  function hit(h, point, vel, how) {
    if (h.kind === 'ext') return h.onHit(point, vel, how);
    if (how === 'pellet' || how === 'blast') how = 'bullet';   // a pellet or a star's burst hits like a bullet; they add up
    if (h.kind === 'dummy') return hitDummy(h.d, h.part, point, vel, how);
    if (h.kind === 'can') return hitCan(h.can, point, vel, how);
    if (h.kind === 'puff') return hitPuff(h.puff, point, vel, how);
    if (h.kind === 'break') return hitBreakable(h.name, h.it, point, vel, how);
    if (h.kind === 'lantern') return lanternHit(h.L, point, vel, how);
    if (h.kind === 'critter') return critterHit(h.C, point, vel, how);
    if (h.kind === 'gong') return gongHit(point, vel, how);
    if (h.kind === 'bubble') return bubbleHit(h.b, point, vel, how);
    return 'tap';
  }
  // a bullet: nearest of the targets, tree trunks, the log and the ground
  function raycast(o, d, maxD = 80) {
    let best = { t: maxD, kind: 'none' };
    const L = tmp;
    for (const h of spheres()) {
      L.subVectors(h.c, o); const tc = L.dot(d); if (tc < 0) continue;
      const d2 = L.lengthSq() - tc * tc, r2 = h.r * h.r * (h.r < 0.1 ? 1.5 : h.r < 0.2 ? 1.2 : 1); if (d2 > r2) continue;
      const t = tc - Math.sqrt(r2 - d2); if (t > 0 && t < best.t) best = { t, kind: h.kind, h };
    }
    for (const tr of forest.trunks) {
      const ox = o.x - tr.x, oz = o.z - tr.z, a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - tr.r * tr.r, disc = b * b - 4 * a * c;
      if (a < 1e-6 || disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a), y = o.y + d.y * t;
      if (t > 0 && t < best.t && y < (tr.h || 7) && y > 0) best = { t, kind: 'wood' };
    }
    {
      const oy = o.y - LOG.r, oz = o.z - LOG.z, a = d.y * d.y + d.z * d.z, b = 2 * (oy * d.y + oz * d.z), c = oy * oy + oz * oz - LOG.r * LOG.r, disc = b * b - 4 * a * c;
      if (a > 1e-6 && disc >= 0) { const t = (-b - Math.sqrt(disc)) / (2 * a), x = o.x + d.x * t; if (t > 0 && t < best.t && Math.abs(x - LOG.x) < LOG.len / 2) best = { t, kind: 'wood' }; }
    }
    if (d.y < -1e-4) { const t = -o.y / d.y; if (t > 0 && t < best.t) best = { t, kind: 'ground' }; }
    best.point = o.clone().addScaledVector(d, best.t);
    return best;
  }

  /* ---------- step ---------- */
  let acc = 0;
  return {
    addProvider: f => providers.push(f),
    world, props, cans, dummies, puffs, events, kinds, lanterns, critters, gong, bubbles, addProp, removeProp, hold, release, spheres, hit, raycast, wobble,
    update(dt, t) {
      thudCool -= dt;
      stepDummies(dt); stepCans(dt); stepPuffs(dt, t); stepLanterns(dt, t); drawStrings(); stepCritters(dt); stepGong(dt, t); stepBubbles(dt, t);
      for (const name in kinds) drawBreakables(kinds[name], dt, t);
      drawPuffs();
      world.step(1 / 90, dt, 4);
      for (let i = props.length - 1; i >= 0; i--) {
        const p = props[i];
        if (p.inWorld) { p.mesh.position.copy(p.body.position); p.mesh.quaternion.copy(p.body.quaternion); }
        p.age += dt;
        if (p.life && !p.held) {
          if (p.age > p.life) { const k = Math.max(0, 1 - (p.age - p.life) / 0.4); p.mesh.scale.setScalar(Math.max(0.001, k)); if (k <= 0) removeProp(p); }
        }
        if (p.inWorld && p.body.position.y < -5) { if (p.kind === 'part' || p.kind === 'mag') removeProp(p); }
      }
      drawCans();
      acc += dt;
    },
    reset() {
      for (const p of props.slice()) if (p.kind === 'part' || p.kind === 'mag') removeProp(p);
      for (const d of dummies) { d.ax = d.az = d.vx = d.vz = 0; for (const name in d.parts) { const p = d.parts[name]; if (!p.on) p.regrow = 0; } }
      for (const c of cans) { if (c.hop < 0) { hold(c, null); c.hop = 0.99; c.from = c.mesh.position.clone(); c.fromQ = c.mesh.quaternion.clone(); } }
      for (const p of puffs) { if (!p.on) p.regrow = 0; }
      for (const n in kinds) for (const it of kinds[n].items) if (!it.on) it.regrow = 0;
    },
  };
}
