// Weapons Sandbox VR, draft v04
// The Sparring Bot: a hovering wood-and-brass training automaton, switched on and off with the mushroom button by the sign.
// It circles you, winds up and swings a padded baton (block it with a blade and it staggers), and fires slow orbs
// (dodge them, shoot them, or slash them hard to send them back). Beat it and it falls apart, then rebuilds itself.

import * as THREE from 'three';
import { COL, rnd, clamp, toon, basic, merge, M4, smoothNormals, outlineMat, makeGlow, starTex, lumpy } from './fx.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion;
export const BOT = {
  dock: new V3(2.7, 0, 3.1), button: new V3(-1.7, 0, 0.45),
  hp: 24, speed: 1.3, ring: [1.5, 2.3], meleeAt: 0.85,
  windup: 0.8, strike: 0.3, recover: 0.6, aim: 0.75, orbSpeed: 3.0,
  parryDist: 0.08, stagger: 1.1, downFor: 5, rebuildFor: 1.1, area: 7,
};
const CUT_SPEED = 3.6, HIT_SPEED = 1.4;

// segment to segment closest distance (returns distance, fills pa/pb with the closest points)
function segSeg(p1, q1, p2, q2, pa, pb) {
  const d1 = new V3().subVectors(q1, p1), d2 = new V3().subVectors(q2, p2), r = new V3().subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a <= 1e-8 && e <= 1e-8) { s = t = 0; }
  else if (a <= 1e-8) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-8) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  pa.copy(p1).addScaledVector(d1, s); pb.copy(p2).addScaledVector(d2, t);
  return pa.distanceTo(pb);
}
const segPoint = (a, b, p, out) => { const ab = new V3().subVectors(b, a), t = clamp(new V3().subVectors(p, a).dot(ab) / Math.max(1e-8, ab.lengthSq()), 0, 1); return out.copy(a).addScaledVector(ab, t); };

export function createBot(scene, { targets, particles, audio, weapons, emit, buzz, onPlayerHit }) {
  const tA = new V3(), tB = new V3(), tC = new V3(), qA = new Q(), qB = new Q();
  const mat = toon(0xffffff, { vertexColors: true });   // its own material, so hits can flash it white
  const ink = (geo, t) => { const m = new THREE.Mesh(geo, mat); m.add(new THREE.Mesh(geo, outlineMat(t))); return m; };

  /* ---------- the model ---------- */
  const root = new THREE.Group(); scene.add(root);
  const hull = new THREE.Group(); root.add(hull);
  const torsoGeo = smoothNormals(merge([
    [new THREE.CylinderGeometry(0.2, 0.22, 0.5, 14), 0x9a6a3c, M4(0, 0.55, 0)],
    [new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xb8862e, M4(0, 0.8, 0, 0, 0, 0, 1, 0.5, 1)],
    [new THREE.TorusGeometry(0.212, 0.014, 5, 20), COL.brass, M4(0, 0.38, 0, Math.PI / 2)], [new THREE.TorusGeometry(0.205, 0.014, 5, 20), COL.brass, M4(0, 0.72, 0, Math.PI / 2)],
    [new THREE.ConeGeometry(0.17, 0.22, 12), 0x6a4420, M4(0, 0.2, 0, Math.PI)],
    [new THREE.CylinderGeometry(0.07, 0.09, 0.08, 10), 0x3a3f4a, M4(0, 0.06, 0)],
    [new THREE.CylinderGeometry(0.035, 0.04, 0.12, 8), 0x3a3f4a, M4(0, 0.86, 0)],
    [new THREE.SphereGeometry(0.05, 8, 6), COL.brass, M4(-0.27, 0.78, 0)], [new THREE.SphereGeometry(0.05, 8, 6), COL.brass, M4(0.27, 0.78, 0)],
    [new THREE.BoxGeometry(0.1, 0.04, 0.1), 0x3a3f4a, M4(-0.22, 0.79, 0)], [new THREE.BoxGeometry(0.1, 0.04, 0.1), 0x3a3f4a, M4(0.22, 0.79, 0)],
    [new THREE.BoxGeometry(0.12, 0.012, 0.01), COL.ink, M4(0.08, 0.5, 0.215, 0, 0, 0.3)],
  ]));
  const torso = ink(torsoGeo, 0.008); hull.add(torso);
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.06, 18), new THREE.MeshBasicMaterial({ color: 0x9ff3ff })); core.position.set(0, 0.58, 0.222); hull.add(core);
  const thruster = makeGlow(0x9ff3ff, 0.5, 0.7); thruster.position.set(0, 0.0, 0); hull.add(thruster);
  // health: a ring of beads around its middle
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 6, 4), basic(0xffffff, { fog: false }), 12);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; beads.setMatrixAt(i, M4(Math.sin(a) * 0.235, 0.46, Math.cos(a) * 0.235)); beads.setColorAt(i, new THREE.Color(0x7dffb0)); }
  hull.add(beads);
  // the head: a brass dome with one big eye
  const head = new THREE.Group(); head.position.set(0, 1.0, 0); hull.add(head);
  const headGeo = smoothNormals(merge([
    [new THREE.SphereGeometry(0.15, 16, 12), 0x6f9a8a, M4(0, 0, 0, 0, 0, 0, 1, 0.92, 1)],
    [new THREE.TorusGeometry(0.085, 0.018, 6, 18), COL.brass, M4(0, 0.01, 0.125)],
    [new THREE.CylinderGeometry(0.006, 0.006, 0.16, 5), 0x3a3f4a, M4(0.05, 0.2, -0.02, 0, 0, -0.25)],
    [new THREE.BoxGeometry(0.04, 0.06, 0.08), COL.brass, M4(-0.15, 0, 0)], [new THREE.BoxGeometry(0.04, 0.06, 0.08), COL.brass, M4(0.15, 0, 0)],
    [new THREE.SphereGeometry(0.022, 8, 6), 0xff9fd8, M4(0.09, 0.28, -0.02)],
  ]));
  head.add(ink(headGeo, 0.006));
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), new THREE.MeshBasicMaterial({ color: 0x9ff3ff })); eye.position.set(0, 0.01, 0.138); head.add(eye);
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.022, 12), basic(0x1b1622)); pupil.position.set(0, 0.01, 0.141); head.add(pupil);
  const eyeGlow = makeGlow(0x9ff3ff, 0.3, 0.6); eyeGlow.position.set(0, 0.01, 0.17); head.add(eyeGlow);
  // the baton arm (its right, our left when it faces us) and the orb cannon arm
  const batonArm = new THREE.Group(); batonArm.position.set(-0.27, 0.78, 0); hull.add(batonArm);
  const batonGeo = smoothNormals(merge([
    [new THREE.CylinderGeometry(0.035, 0.03, 0.3, 8), 0x3a3f4a, M4(0, -0.15, 0)],
    [new THREE.SphereGeometry(0.045, 8, 6), COL.brass, M4(0, -0.32, 0)],
    [new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), 0x2c2430, M4(0, -0.38, 0)],
    [new THREE.CylinderGeometry(0.045, 0.04, 0.55, 10), 0xd8b088, M4(0, -0.72, 0)],
    ...[0, 1, 2, 3].map(i => [new THREE.TorusGeometry(0.046, 0.007, 4, 12), 0x8a5a32, M4(0, -0.5 - i * 0.14, 0, Math.PI / 2)]),
  ]));
  batonArm.add(ink(batonGeo, 0.006));
  const batonTip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc070 })); batonTip.position.set(0, -1.0, 0); batonArm.add(batonTip);
  const batonGlow = makeGlow(0xffa050, 0.35, 0); batonGlow.position.set(0, -0.9, 0); batonArm.add(batonGlow);
  const cannonArm = new THREE.Group(); cannonArm.position.set(0.27, 0.78, 0); hull.add(cannonArm);
  const cannonGeo = smoothNormals(merge([
    [new THREE.CylinderGeometry(0.035, 0.03, 0.26, 8), 0x3a3f4a, M4(0, -0.13, 0)],
    [new THREE.CylinderGeometry(0.06, 0.05, 0.2, 12), COL.brass, M4(0, -0.34, 0)],
    [new THREE.TorusGeometry(0.06, 0.012, 5, 14), 0x6a4420, M4(0, -0.44, 0, Math.PI / 2)],
  ]));
  cannonArm.add(ink(cannonGeo, 0.006));
  const cannonGlow = makeGlow(0xff6ad8, 0.3, 0); cannonGlow.position.set(0, -0.47, 0); cannonArm.add(cannonGlow);
  // the dock: a little platform where it sleeps
  {
    const g = smoothNormals(merge([[new THREE.CylinderGeometry(0.5, 0.56, 0.08, 18), 0x9a7048, M4(0, 0.04, 0)], [new THREE.TorusGeometry(0.5, 0.025, 5, 24), COL.brass, M4(0, 0.085, 0, Math.PI / 2)], [lumpy(new THREE.SphereGeometry(0.2, 8, 5), 0.3), COL.moss, M4(0.4, 0.05, -0.2, 0, 0, 0, 1.2, 0.4, 1)]]));
    const d = new THREE.Mesh(g, toon(0xffffff, { vertexColors: true })); d.add(new THREE.Mesh(g, outlineMat(0.012))); d.position.copy(BOT.dock); scene.add(d);
  }
  const parts = [head, batonArm, cannonArm];
  const home = parts.map(p => ({ pos: p.position.clone(), quat: p.quaternion.clone() }));

  /* ---------- the button: a big mushroom on a stump ---------- */
  const btn = (() => {
    const g = new THREE.Group(); g.position.copy(BOT.button); scene.add(g);
    const stumpG = smoothNormals(merge([[new THREE.CylinderGeometry(0.17, 0.22, 0.82, 10), COL.bark, M4(0, 0.41, 0)], [new THREE.CylinderGeometry(0.16, 0.16, 0.02, 10), COL.wood, M4(0, 0.82, 0)]]));
    const stump = new THREE.Mesh(stumpG, toon(0xffffff, { vertexColors: true })); stump.add(new THREE.Mesh(stumpG, outlineMat(0.012))); g.add(stump);
    const capG = smoothNormals(merge([[new THREE.CylinderGeometry(0.04, 0.05, 0.08, 8), COL.puff, M4(0, 0.04, 0)], [new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, M4(0, 0.08, 0, 0, 0, 0, 1, 0.7, 1)]]));
    const capMat = toon(0xd8432a, { vertexColors: true });
    const cap = new THREE.Mesh(capG, capMat); cap.add(new THREE.Mesh(capG, outlineMat(0.006))); cap.position.y = 0.83; g.add(cap);
    const glow = makeGlow(0xff6050, 0.5, 0.4); glow.position.y = 1.0; g.add(glow);
    // the label, on a little plank
    const c = document.createElement('canvas'); c.width = 512; c.height = 160; const x = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.13), new THREE.MeshBasicMaterial({ map: tex })); label.position.set(0, 0.62, 0.19); label.rotation.x = -0.25; g.add(label);
    g.lookAt(0, 0, 0); g.rotation.x = 0; g.rotation.z = 0;
    return { g, cap, capMat, glow, canvas: c, tex, key: '', press: 0, cool: 0, top: new V3() };
  })();
  function drawLabel() {
    const key = String(bot.on); if (key === btn.key) return; btn.key = key;
    const x = btn.canvas.getContext('2d');
    x.fillStyle = '#e9d9b8'; x.fillRect(0, 0, 512, 160); x.strokeStyle = '#1b1622'; x.lineWidth = 8; x.strokeRect(4, 4, 504, 152);
    x.fillStyle = '#1b1622'; x.font = '400 64px "Bangers","Impact",sans-serif'; x.fillText('SPARRING BOT', 26, 74);
    x.fillStyle = bot.on ? '#3f6230' : '#d8432a'; x.font = '700 46px "Barlow Condensed","Arial Narrow",sans-serif'; x.fillText(bot.on ? 'ON · HIT TO STOP' : 'OFF · HIT TO START', 26, 130);
    btn.tex.needsUpdate = true;
    btn.capMat.color.set(bot.on ? 0x6fd05a : 0xd8432a); btn.glow.material.color.set(bot.on ? 0x7dffb0 : 0xff6050);
  }

  /* ---------- orbs it fires ---------- */
  const orbs = Array.from({ length: 8 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff6ad8 })), g = makeGlow(0xff6ad8, 0.6, 0.8), s = makeGlow(0xffffff, 0.3, 0.9, starTex);
    m.visible = g.visible = s.visible = false; scene.add(m, g, s);
    return { i, m, g, s, on: false, p: new V3(), v: new V3(), age: 0, back: false };
  });

  /* ---------- state ---------- */
  const bot = {
    on: false, state: 'off', t: 0, hp: BOT.hp, pos: BOT.dock.clone(), vel: new V3(), yaw: Math.PI, strafe: 1, next: 2, swing: null, flash: 0,
    downs: 0, parries: 0, playerHits: 0, deflects: 0, hits: 0, struck: false, volley: 0, push: new V3(), fallen: null,
  };
  root.position.copy(bot.pos);

  function setOn(on) {
    if (on === bot.on) return;
    bot.on = on; btn.key = '';
    if (on) { if (bot.state === 'off' || bot.state === 'return') { bot.state = 'boot'; bot.t = 0; bot.hp = BOT.hp; audio.botBoot(); } }
    else { if (bot.state === 'down' || bot.state === 'rebuild') snapParts(); bot.state = 'return'; bot.t = 0; for (const o of orbs) o.on = false; audio.botOff(); }
    emit({ type: 'bot', on });
  }
  function press() {
    if (btn.cool > 0) return;
    btn.cool = 1.0; btn.press = 1; audio.button(); setOn(!bot.on);
    particles.burst('spore', btn.top, 14, 0.7);
  }

  /* ---------- hits on the bot ---------- */
  const PARTS = [
    { name: 'head', at: () => head.getWorldPosition(tA).clone(), r: 0.17, weak: 2 },
    { name: 'body', at: () => hull.localToWorld(tA.set(0, 0.6, 0)).clone(), r: 0.26, weak: 1 },
    { name: 'body2', at: () => hull.localToWorld(tA.set(0, 0.3, 0)).clone(), r: 0.2, weak: 1 },
  ];
  const active = () => ['stalk', 'windup', 'strike', 'recover', 'aim', 'stagger'].includes(bot.state);
  function hurt(part, point, vel, how) {
    if (!active()) { particles.burst('spark', point, 4, 0.6); audio.tap(); return 'tap'; }
    let dmg = 0; const sp = vel.length();
    if (how === 'bullet' || how === 'pellet') dmg = 1;
    else if (how === 'blast') dmg = 3;
    else if (how === 'orb') dmg = 5;
    else if (how === 'blade' || how === 'thrown') dmg = sp >= CUT_SPEED ? 3 : sp >= HIT_SPEED ? 1 : 0;
    if (dmg === 0) { audio.tap(); particles.burst('spark', point, 3, 0.4); return 'tap'; }
    dmg *= part.weak; bot.hp -= dmg; bot.hits++; bot.flash = 1;
    particles.burst('spark', point, 8 + dmg * 3, 1.2); particles.burst('wood', point, 4 + dmg * 2, 1);
    audio.botHurt(Math.min(1, dmg / 4));
    tB.set(vel.x, 0, vel.z); if (tB.lengthSq() > 1e-6) bot.push.addScaledVector(tB.normalize(), Math.min(1.6, 0.25 + dmg * 0.3));
    emit({ type: 'botHurt', part: part.name, dmg, how });
    if (bot.hp <= 0) { fallApart(vel); return 'cut'; }
    if (dmg >= 3) { bot.state = 'stagger'; bot.t = 0; return 'cut'; }
    return 'hit';
  }
  function hitOrb(o, point, vel, how) {
    if (!o.on) return 'tap';
    // a hard slash sends it back at the bot; anything else pops it
    if ((how === 'blade' || how === 'thrown') && vel.length() >= HIT_SPEED && !o.back) {
      o.back = true; o.age = 0; o.v.copy(hull.localToWorld(tA.set(0, 0.6, 0))).sub(o.p).setLength(7.5);
      o.m.material.color.set(0x9ff3ff); o.g.material.color.set(0x9ff3ff);
      particles.burst('magic', o.p, 14, 1); audio.deflect(); bot.deflects++; emit({ type: 'deflect' });
      return 'cut';
    }
    popOrb(o); emit({ type: 'orbPop', how }); return 'hit';
  }
  function popOrb(o) { o.on = false; particles.burst('spore', o.p, 24, 1); particles.burst('bubble', o.p, 10, 0.8); audio.orbPop(); }
  targets.addProvider(list => {
    btn.top.copy(btn.g.position).setY(0.93);
    list.push({ c: btn.top, r: 0.13, kind: 'ext', id: 'btn', onHit: () => { press(); return 'hit'; } });
    if (active()) for (const p of PARTS) list.push({ c: p.at(), r: p.r, kind: 'ext', id: 'bot' + p.name, onHit: (pt, v, how) => hurt(p, pt, v, how) });
    for (const o of orbs) if (o.on && !o.back) list.push({ c: o.p, r: 0.12, kind: 'ext', id: 'orb' + o.i, onHit: (pt, v, how) => hitOrb(o, pt, v, how) });
  });

  /* ---------- falling apart and rebuilding ---------- */
  function fallApart(vel) {
    bot.state = 'down'; bot.t = 0; bot.downs++; for (const o of orbs) if (!o.back) o.on = false;
    bot.fallen = parts.map(p => { scene.attach(p); return { p, v: new V3(vel.x * 0.15 + rnd(-1.5, 1.5), rnd(2, 4), vel.z * 0.15 + rnd(-1.5, 1.5)), w: new V3(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8)) }; });
    const c = hull.localToWorld(new V3(0, 0.6, 0));
    particles.burst('spark', c, 40, 2); particles.burst('wood', c, 30, 1.6); particles.burst('smoke', c, 10, 1); particles.burst('magic', c, 20, 1.5);
    audio.botDown(); weapons.hitStop(0.12); emit({ type: 'botDown' });
  }
  function snapParts() {
    parts.forEach((p, i) => { hull.attach(p); p.position.copy(home[i].pos); p.quaternion.copy(home[i].quat); p.scale.setScalar(1); });
    bot.fallen = null; hull.rotation.set(0, 0, 0);
  }

  /* ---------- aiming the arms ---------- */
  const DOWN = new V3(0, -1, 0), MID = new V3(0, 0.45, 1).normalize(), aimQ = new Q(), swQ = new Q();
  // turn a swing so its middle passes through your head, seen from the baton shoulder
  function aimSwing() {
    root.updateMatrixWorld(true);
    const local = hull.worldToLocal(playerHead.clone()).sub(batonArm.position);
    local.y -= 0.05; aimQ.setFromUnitVectors(MID, local.normalize());
  }
  const sq = (base, out) => out.copy(aimQ).multiply(base);
  const dirQ = (x, y, z, out) => out.setFromUnitVectors(DOWN, tC.set(x, y, z).normalize());
  const REST_B = dirQ(-0.25, -0.85, 0.45, new Q()), REST_C = dirQ(0.25, -0.85, 0.45, new Q());
  // two swings: a flat one at head height from its right, and a diagonal one from overhead
  const SWINGS = [
    { a: dirQ(-1, 0.55, -0.35, new Q()), m: dirQ(0, 0.45, 1, new Q()), b: dirQ(1, 0.3, 0.4, new Q()) },
    { a: dirQ(-0.35, 1, -0.4, new Q()), m: dirQ(0, 0.5, 1, new Q()), b: dirQ(0.45, -0.6, 0.7, new Q()) },
  ];

  /* ---------- per frame ---------- */
  const playerHead = new V3(), toP = new V3(), bladeSegs = [], pa = new V3(), pb = new V3(), hilt = new V3(), tip = new V3();
  function update(dt, t, headPos) {
    playerHead.copy(headPos);
    btn.cool -= dt; btn.press = Math.max(0, btn.press - dt * 4); btn.cap.position.y = 0.83 - Math.sin(btn.press * Math.PI) * 0.04;
    btn.glow.material.opacity = 0.35 + Math.sin(t * 3) * 0.12;
    // a hand pressing down on the button
    for (const s of ['left', 'right']) { const h = weapons.hands[s]; if (h.tracked && h.pos.distanceTo(btn.top) < 0.12 && h.vel.y < -0.2) press(); }
    drawLabel();

    bot.t += dt; bot.flash = Math.max(0, bot.flash - dt * 6);
    mat.emissive.setScalar(bot.flash * 0.9);
    toP.set(playerHead.x - bot.pos.x, 0, playerHead.z - bot.pos.z); const dist = toP.length(); if (dist > 1e-4) toP.divideScalar(dist);
    let wantYaw = Math.atan2(toP.x, toP.z), hover = 0.35, moveTo = null, speed = BOT.speed, armB = REST_B, armC = REST_C, eyeCol = 0x9ff3ff, batonK = 0, cannonK = 0, tilt = 0;

    if (bot.hold) { root.position.copy(bot.pos); return; }   // for the checks: freeze in place
    switch (bot.state) {
      case 'off': {
        hover = 0.05; tilt = 0.35; wantYaw = Math.atan2(-BOT.dock.x, -BOT.dock.z); eyeCol = 0x222228; bot.pos.lerp(BOT.dock, Math.min(1, dt * 3)); bot.vel.set(0, 0, 0);
        break;
      }
      case 'return': {
        moveTo = BOT.dock; speed = 2.2; eyeCol = 0x445566;
        if (bot.pos.distanceTo(BOT.dock) < 0.15) { bot.state = 'off'; bot.t = 0; }
        break;
      }
      case 'boot': {
        const k = Math.min(1, bot.t / 1.2); hover = 0.05 + 0.3 * k; tilt = 0.35 * (1 - k);
        eyeCol = Math.sin(bot.t * 40) > 0 || k > 0.7 ? 0x9ff3ff : 0x222228;
        if (bot.t > 1.2) { bot.state = 'stalk'; bot.t = 0; bot.next = rnd(1, 2); audio.botBeep(); }
        break;
      }
      case 'stalk': {
        // keep a sparring distance, circling; now and then pick an attack
        const want = dist < BOT.ring[0] ? -1 : dist > BOT.ring[1] ? 1 : 0;
        if (Math.random() < dt * 0.3) bot.strafe *= -1;
        tA.set(-toP.z, 0, toP.x).multiplyScalar(bot.strafe * 0.6).addScaledVector(toP, want);
        moveTo = tB.copy(bot.pos).addScaledVector(tA, 1); speed = dist > 4 ? 2.4 : BOT.speed;
        bot.next -= dt;
        if (bot.next <= 0) {
          if (dist < 2.8 && Math.random() < 0.65) { bot.state = 'windup'; bot.swing = SWINGS[Math.random() < 0.5 ? 0 : 1]; audio.botWindup(); }
          else { bot.state = 'aim'; bot.volley = bot.hp < BOT.hp / 2 ? 3 : 1; audio.botAim(); }
          bot.t = 0;
        }
        break;
      }
      case 'windup': {
        if (!bot.swing) bot.swing = SWINGS[0];
        // raise the baton, glowing; close in
        aimSwing();
        const k = Math.min(1, bot.t / BOT.windup); armB = qA.slerpQuaternions(REST_B, sq(bot.swing.a, swQ), k * k * (3 - 2 * k)); batonK = k; eyeCol = 0xffb050;
        moveTo = tB.copy(playerHead).setY(0).addScaledVector(toP, -BOT.meleeAt - 0.25); speed = 1.6;
        if (bot.t >= BOT.windup) { bot.state = 'strike'; bot.t = 0; bot.struck = false; audio.botSwing(); }
        break;
      }
      case 'strike': {
        const k = Math.min(1, bot.t / BOT.strike), sw = bot.swing;
        const A = sq(sw.a, new Q()), M = sq(sw.m, new Q()), B = sq(sw.b, new Q());
        armB = k < 0.5 ? qA.slerpQuaternions(A, M, k * 2) : qA.slerpQuaternions(M, B, (k - 0.5) * 2);
        batonK = 1; eyeCol = 0xff5040;
        moveTo = tB.copy(playerHead).setY(0).addScaledVector(toP, -BOT.meleeAt); speed = 2.4;
        if (bot.t >= BOT.strike) { bot.state = 'recover'; bot.t = 0; }
        break;
      }
      case 'recover': {
        if (!bot.swing) bot.swing = SWINGS[0];
        const k = Math.min(1, bot.t / BOT.recover); armB = qA.slerpQuaternions(sq(bot.swing.b, swQ), REST_B, k);
        moveTo = tB.copy(bot.pos).addScaledVector(toP, -0.6); speed = 0.8;
        if (bot.t >= BOT.recover) { bot.state = 'stalk'; bot.t = 0; bot.next = rnd(1.2, 2.6); }
        break;
      }
      case 'aim': {
        // the cannon arm swings up at you and glows; then it fires
        cannonK = Math.min(1, bot.t / BOT.aim);
        tA.copy(playerHead).sub(cannonArm.getWorldPosition(tC)); root.updateMatrixWorld();
        const inv = qB.copy(root.quaternion).invert(); tA.applyQuaternion(inv);
        armC = qA.slerpQuaternions(REST_C, new Q().setFromUnitVectors(DOWN, tA.normalize()), Math.min(1, cannonK * 1.5));
        eyeCol = 0xff6ad8; speed = 0.5; moveTo = bot.pos;
        if (bot.t >= BOT.aim) { fireOrb(); bot.volley--; bot.t = bot.volley > 0 ? BOT.aim - 0.35 : 0; if (bot.volley <= 0) { bot.state = 'stalk'; bot.next = rnd(1.4, 2.8); } }
        break;
      }
      case 'stagger': {
        tilt = -0.35 * Math.sin(Math.min(1, bot.t / BOT.stagger) * Math.PI); eyeCol = Math.sin(bot.t * 30) > 0 ? 0xffffff : 0x9ff3ff; speed = 0;
        hull.rotation.z = Math.sin(bot.t * 18) * 0.12 * (1 - bot.t / BOT.stagger);
        if (bot.t >= BOT.stagger) { bot.state = 'stalk'; bot.t = 0; bot.next = rnd(0.8, 1.6); hull.rotation.z = 0; }
        break;
      }
      case 'down': {
        eyeCol = 0x222228; hover = 0.0; speed = 0;
        const k = Math.min(1, bot.t / 0.5); hull.rotation.x = -1.35 * k; hull.position.y = 0.1 * (1 - k);
        for (const f of bot.fallen) {
          f.v.y -= 9.8 * dt; f.p.position.addScaledVector(f.v, dt);
          f.p.rotation.x += f.w.x * dt; f.p.rotation.y += f.w.y * dt; f.p.rotation.z += f.w.z * dt;
          if (f.p.position.y < 0.12) { f.p.position.y = 0.12; f.v.multiplyScalar(0.4); f.v.y = Math.abs(f.v.y) * 0.3; f.w.multiplyScalar(0.6); }
        }
        if (bot.t > BOT.downFor) { bot.state = 'rebuild'; bot.t = 0; bot.fallen.forEach(f => { f.from = f.p.position.clone(); f.fromQ = f.p.quaternion.clone(); }); audio.botRebuild(); }
        break;
      }
      case 'rebuild': {
        const k = Math.min(1, bot.t / BOT.rebuildFor), e = k * k * (3 - 2 * k);
        hull.rotation.x = -1.35 * (1 - e); hover = 0.35 * e; eyeCol = k > 0.8 ? 0x9ff3ff : 0x222228;
        root.updateMatrixWorld();
        parts.forEach((p, i) => {
          const f = bot.fallen[i]; const wpos = hull.localToWorld(home[i].pos.clone());
          p.position.lerpVectors(f.from, wpos, e); p.position.y += Math.sin(Math.PI * k) * 0.5;
          p.quaternion.slerpQuaternions(f.fromQ, hull.getWorldQuaternion(qB).multiply(home[i].quat), e);
          if (Math.random() < 0.5) particles.burst('magic', p.position, 1, 0.4);
        });
        if (k >= 1) { snapParts(); bot.hp = BOT.hp; bot.state = 'stalk'; bot.t = 0; bot.next = rnd(1.5, 2.5); audio.botBeep(); emit({ type: 'botUp' }); }
        break;
      }
    }

    // move: steer toward moveTo, keep out of your space, stay in the clearing, take knockback
    if (moveTo && speed > 0) {
      tA.subVectors(moveTo, bot.pos).setY(0); const d = tA.length();
      const want = d > 0.02 ? tA.multiplyScalar(Math.min(speed, d * 4) / d) : tA.set(0, 0, 0);
      bot.vel.lerp(want, Math.min(1, dt * 4));
    } else bot.vel.multiplyScalar(Math.exp(-dt * 6));
    bot.vel.add(bot.push.multiplyScalar(1)); bot.push.set(0, 0, 0);
    if (bot.state !== 'off') {
      bot.pos.addScaledVector(bot.vel, dt);
      bot.vel.multiplyScalar(Math.exp(-dt * 1.5));
      const away = tA.set(bot.pos.x - playerHead.x, 0, bot.pos.z - playerHead.z), ad = away.length();
      if (ad < 0.8 && bot.state !== 'return') bot.pos.addScaledVector(away.normalize(), 0.8 - ad);
      const r = Math.hypot(bot.pos.x, bot.pos.z); if (r > BOT.area) bot.pos.multiplyScalar(BOT.area / r);
    }
    root.position.copy(bot.pos);
    const dy = Math.atan2(Math.sin(wantYaw - bot.yaw), Math.cos(wantYaw - bot.yaw)); bot.yaw += dy * Math.min(1, dt * (bot.state === 'stagger' || bot.state === 'down' ? 0 : 6));
    root.rotation.y = bot.yaw;
    if (bot.state !== 'down' && bot.state !== 'rebuild') { hull.position.y += ((hover + (bot.state === 'off' ? 0 : Math.sin(t * 2.2) * 0.04)) - hull.position.y) * Math.min(1, dt * 5); if (bot.state !== 'stagger') hull.rotation.x += (tilt - hull.rotation.x) * Math.min(1, dt * 6); }
    if (bot.state !== 'down' && bot.state !== 'rebuild') {
      batonArm.quaternion.slerp(armB, bot.state === 'strike' ? 1 : Math.min(1, dt * 10));
      cannonArm.quaternion.slerp(armC, Math.min(1, dt * 8));
      head.rotation.set(bot.state === 'off' ? 0.5 : -0.1, 0, 0);
    }
    // looks: eye, core, thruster, baton and cannon glows, health beads
    eye.material.color.set(eyeCol); eyeGlow.material.color.set(eyeCol); eyeGlow.visible = eyeCol !== 0x222228;
    core.material.color.set(bot.on ? (bot.state === 'stagger' ? 0xffffff : 0x9ff3ff) : 0x334455);
    thruster.visible = bot.state !== 'off' && bot.state !== 'down'; thruster.material.opacity = 0.5 + Math.sin(t * 20) * 0.15;
    if (Math.random() < 0.3 && thruster.visible) particles.burst('magic', hull.localToWorld(tA.set(0, 0.02, 0)), 1, 0.2);
    batonGlow.material.opacity = batonK * (0.6 + Math.sin(t * 25) * 0.2); batonGlow.visible = batonK > 0.01;
    cannonGlow.material.opacity = cannonK * 0.9; cannonGlow.visible = cannonK > 0.01; cannonGlow.scale.setScalar(0.2 + 0.4 * cannonK);
    const lit = Math.ceil(12 * Math.max(0, bot.hp) / BOT.hp); beads.count = bot.state === 'off' ? 0 : lit; beads.visible = beads.count > 0;

    // the strike: did the baton meet a blade (parry) or you (a hit)?
    if (bot.state === 'strike' && !bot.struck) {
      batonArm.updateMatrixWorld();
      batonArm.localToWorld(hilt.set(0, -0.42, 0)); batonArm.localToWorld(tip.set(0, -1.04, 0));
      weapons.bladeSegments(bladeSegs);
      for (const [a, b, side] of bladeSegs) {
        if (segSeg(hilt, tip, a, b, pa, pb) < BOT.parryDist) {
          bot.struck = true; bot.state = 'stagger'; bot.t = 0; bot.parries++;
          const mid = pa.clone().add(pb).multiplyScalar(0.5);
          particles.burst('spark', mid, 40, 2); particles.burst('magic', mid, 10, 1);
          audio.parry(); buzz(side, 1, 90); weapons.hitStop(0.09);
          bot.push.copy(toP).multiplyScalar(-1.2);
          emit({ type: 'parry' });
          break;
        }
      }
      if (!bot.struck) {
        const body = tA.copy(playerHead).add(tB.set(0, -0.45, 0));
        const dh = segPoint(hilt, tip, playerHead, pa).distanceTo(playerHead), db = segPoint(hilt, tip, body, pb).distanceTo(body);
        if (dh < 0.2 || db < 0.24) { bot.struck = true; bot.playerHits++; onPlayerHit(dh < 0.2 ? 'head' : 'body'); particles.burst('spark', pa, 12, 1); emit({ type: 'playerHit', by: 'baton' }); }
      }
    }

    // orbs: fly at you; deflected ones fly back at the bot
    for (const o of orbs) {
      if (!o.on) { o.m.visible = o.g.visible = o.s.visible = false; continue; }
      o.age += dt; o.p.addScaledVector(o.v, dt);
      o.m.visible = o.g.visible = o.s.visible = true; o.m.position.copy(o.p); o.g.position.copy(o.p); o.s.position.copy(o.p);
      const fl = 1 + Math.sin(t * 30 + o.i) * 0.15; o.m.scale.setScalar(fl); o.g.scale.setScalar(0.6 * fl); o.s.material.rotation = t * 6;
      if (Math.random() < 0.5) particles.burst(o.back ? 'magic' : 'spore', o.p, 1, 0.15);
      if (o.back) {
        if (active() && hull.localToWorld(tA.set(0, 0.6, 0)).distanceTo(o.p) < 0.35) { o.on = false; hurt(PARTS[1], o.p.clone(), o.v.clone(), 'orb'); particles.burst('magic', o.p, 30, 1.5); }
      } else if (o.p.distanceTo(playerHead) < 0.2 || o.p.distanceTo(tB.copy(playerHead).add(tC.set(0, -0.45, 0))) < 0.22) {
        o.on = false; popOrb(o); bot.playerHits++; onPlayerHit('orb'); emit({ type: 'playerHit', by: 'orb' });
      }
      if (o.age > 6 || o.p.y < 0.02) { o.on = false; if (o.p.y < 0.05) popOrb(o); }
    }
  }
  function fireOrb() {
    const o = orbs.find(x => !x.on); if (!o) return;
    cannonArm.updateMatrixWorld(); cannonArm.localToWorld(o.p.set(0, -0.5, 0));
    o.v.copy(playerHead).sub(o.p).setLength(BOT.orbSpeed); o.on = true; o.back = false; o.age = 0;
    o.m.material.color.set(0xff6ad8); o.g.material.color.set(0xff6ad8);
    particles.burst('spore', o.p, 12, 0.8); audio.orbFire();
  }

  return {
    bot, update, setOn, press, orbs, root, BOT, debug: { batonArm, SWINGS, hull, btn, aimSwing, aimQ },
    reset() { for (const o of orbs) o.on = false; if (bot.fallen) snapParts(); bot.on = false; bot.state = 'off'; bot.pos.copy(BOT.dock); bot.hp = BOT.hp; btn.key = ''; },
  };
}
