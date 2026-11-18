// Weapons Sandbox VR, draft v01
// Things to hit: straw dummies on springy posts (heads and arms come off and grow back), tin cans on the log
// (they hop back up), puffball mushrooms (burst into spores, regrow). Also the physics world and what bullets hit.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COL, rnd, clamp, toon, merge, M4, smoothNormals, outlineMat, lumpy } from './fx.js';
import { LOG } from './forest.js';

const V3 = THREE.Vector3;
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
  const partMesh = name => { const m = new THREE.Mesh(PART[name].geo, vertexToon); m.add(new THREE.Mesh(PART[name].geo, outlineMat(0.008))); return m; };

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
  const canGeo = c => smoothNormals(merge([
    [new THREE.CylinderGeometry(0.036, 0.036, 0.11, 12), COL.tin, M4()],
    [new THREE.CylinderGeometry(0.0365, 0.0365, 0.06, 12, 1, true), c, M4(0, -0.005, 0)],
    [new THREE.TorusGeometry(0.034, 0.003, 4, 12), COL.steelDark, M4(0, 0.055, 0, Math.PI / 2)],
  ]));
  LABELS.forEach((c, i) => {
    const geo = canGeo(c), m = new THREE.Mesh(geo, vertexToon); m.add(new THREE.Mesh(geo, outlineMat(0.004))); scene.add(m);
    const home = new V3(LOG.x - 0.75 + i * 0.3, LOG.r * 2 + 0.055, LOG.z);
    const b = new CANNON.Body({ mass: 0.25, shape: new CANNON.Cylinder(0.036, 0.036, 0.11, 10) }); b.position.set(home.x, home.y, home.z);
    const p = addProp(m, b, 'can', { grab: 0.1, home, down: 0, hop: -1 });
    cans.push(p);
  });
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
  for (const [x, z, r] of PUFF_SPOTS) {
    const m = new THREE.Mesh(puffGeo, vertexToon); m.add(new THREE.Mesh(puffGeo, outlineMat(0.035))); m.position.set(x, 0, z); m.scale.setScalar(r); m.rotation.y = rnd(6); scene.add(m);
    puffs.push({ mesh: m, r, c: new V3(x, r * 0.78, z), on: true, k: 1, regrow: 0 });
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

  /* ---------- what is there to hit: spheres for blades, rays for bullets ---------- */
  const hitList = [];
  function spheres() {
    hitList.length = 0;
    for (const d of dummies) {
      for (const name in d.parts) { const p = d.parts[name]; if (p.on && p.grow > 0.6) hitList.push({ c: d.pivot.localToWorld(PART[name].at.clone()), r: PART[name].r, kind: 'dummy', d, part: name, id: `d${d.i}${name}` }); }
      TORSO.forEach(([c, r], j) => hitList.push({ c: d.pivot.localToWorld(c.clone()), r, kind: 'dummy', d, part: null, id: `d${d.i}t${j}` }));
    }
    for (const c of cans) if (!c.held && c.hop < 0) hitList.push({ c: new V3(c.body.position.x, c.body.position.y, c.body.position.z), r: 0.055, kind: 'can', can: c, id: 'c' + cans.indexOf(c) });
    for (const p of puffs) if (p.on && p.k > 0.6) hitList.push({ c: p.c, r: p.r * 0.95, kind: 'puff', puff: p, id: 'p' + puffs.indexOf(p) });
    return hitList;
  }
  function hit(h, point, vel, how) {
    if (h.kind === 'dummy') return hitDummy(h.d, h.part, point, vel, how);
    if (h.kind === 'can') return hitCan(h.can, point, vel, how);
    if (h.kind === 'puff') return hitPuff(h.puff, point, vel, how);
    return 'tap';
  }
  // a bullet: nearest of the targets, tree trunks, the log and the ground
  function raycast(o, d, maxD = 80) {
    let best = { t: maxD, kind: 'none' };
    const L = tmp;
    for (const h of spheres()) {
      L.subVectors(h.c, o); const tc = L.dot(d); if (tc < 0) continue;
      const d2 = L.lengthSq() - tc * tc, r2 = h.r * h.r * (h.kind === 'can' ? 1.4 : 1); if (d2 > r2) continue;
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
    world, props, cans, dummies, puffs, events, addProp, removeProp, hold, release, spheres, hit, raycast, wobble,
    update(dt, t) {
      thudCool -= dt;
      stepDummies(dt); stepCans(dt); stepPuffs(dt, t);
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
      acc += dt;
    },
    reset() {
      for (const p of props.slice()) if (p.kind === 'part' || p.kind === 'mag') removeProp(p);
      for (const d of dummies) { d.ax = d.az = d.vx = d.vz = 0; for (const name in d.parts) { const p = d.parts[name]; if (!p.on) p.regrow = 0; } }
      for (const c of cans) { if (c.hop < 0) { hold(c, null); c.hop = 0.99; c.from = c.mesh.position.clone(); c.fromQ = c.mesh.quaternion.clone(); } }
      for (const p of puffs) { if (!p.on) p.regrow = 0; }
    },
  };
}
