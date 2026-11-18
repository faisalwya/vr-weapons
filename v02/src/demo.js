// Weapons Sandbox VR, draft v02
// The self-playing preview on a phone or computer: two ghost hands, a sword and a pistol, the same code path as the headset.

import * as THREE from 'three';

const V3 = THREE.Vector3, Q = THREE.Quaternion;
const UNTILT = new Q().setFromAxisAngle(new V3(1, 0, 0), 0.5);   // weapons.js tilts the sword by -0.5 rad; the ghost aims the blade itself
export const DEMO_STAND = new V3(1.45, 1.6, -0.2);   // where the ghost stands (head), 1.1 m in front of the right-hand dummy
const O = new V3(1.45, 0, 0.63);                      // swing paths below are written for a ghost at (0, -0.95)

export function createDemo(weapons, targets) {
  let t = 0, started = false, shotT = 1.2, can = 0, emptyT = 0;
  const L = { tracked: true, pos: new V3(), quat: new Q(), rayQ: new Q(), squeeze: true, trigger: 0, a: false };
  const R = { tracked: true, pos: new V3(), quat: new Q(), rayQ: new Q(), squeeze: true, trigger: 0, a: false };
  const m4 = new THREE.Matrix4(), up = new V3(0, 1, 0), sh = new V3(0.2, 1.45, -0.95).add(O), d = new V3(), tgt = new V3();
  // swings: a diagonal cut, a flat cut at head height, a rising cut
  const SW = [
    { a: [0.5, 1.8, -1.2], b: [-0.4, 0.95, -1.3] },
    { a: [0.7, 1.62, -1.12], b: [-0.6, 1.58, -1.12] },
    { a: [-0.45, 1.0, -1.2], b: [0.6, 1.75, -1.2] },
  ];
  const ease = k => k * k * (3 - 2 * k);
  function swordPose(p) {
    // the blade points from the shoulder out through the hand, leaning forward
    R.pos.copy(p); d.subVectors(p, sh).add(new V3(0, 0, -0.9)).normalize();
    R.quat.setFromUnitVectors(new V3(0, 0, -1), d).multiply(UNTILT); R.rayQ.copy(R.quat);
  }
  return {
    update(dt) {
      if (!started) { weapons.forceHold('right', 'sword'); weapons.forceHold('left', 'pistol'); started = true; }
      t += dt;
      // right hand: rest, wind up, cut, recover (2.4 s per swing)
      const cyc = t % 7.2, i = Math.floor(cyc / 2.4), k = (cyc % 2.4);
      const s = SW[i], A = new V3(...s.a).add(O), B = new V3(...s.b).add(O), rest = new V3(0.3, 1.25, -1.0).add(O);
      let p;
      if (k < 0.7) p = rest.clone().lerp(A, ease(k / 0.7));
      else if (k < 1.0) p = A;
      else if (k < 1.17) p = A.clone().lerp(B, (k - 1.0) / 0.17);
      else p = B.clone().lerp(rest, ease(Math.min(1, (k - 1.17) / 0.9)));
      swordPose(p);
      // left hand: aim at the cans one by one and fire
      // cycle through the gallery: cans, a bottle, a pot, a critter if one is up, a lantern, the gong
      const list = [targets.cans[can % 6].home, targets.kinds.bottle.items[can % 6].hc, targets.kinds.pot.items[can % 3].hc, targets.lanterns[can % 3].c, targets.gong.c];
      const pop = targets.critters.find(c => c.state === 'up'); if (pop) { pop.piv.updateMatrixWorld(); list.push(pop.piv.localToWorld(new V3(0, pop.cy, 0))); }
      tgt.copy(list[can % list.length]);
      L.pos.set(-0.32, 1.38, -0.7).add(O);
      m4.lookAt(L.pos, tgt, up); L.rayQ.setFromRotationMatrix(m4); L.quat.copy(L.rayQ);
      shotT -= dt; L.trigger = 0;
      const p2 = weapons.pistol;
      if (!p2.chambered) { emptyT += dt; if (emptyT > 1.2) { weapons.refill(); emptyT = 0; } }
      else if (shotT <= 0) { L.trigger = 1; shotT = 0.85; can++; }
      return { left: L, right: R };
    },
  };
}
