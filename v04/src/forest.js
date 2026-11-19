// Weapons Sandbox VR, draft v02
// The clearing: a forest late in the afternoon. Sky, ground, trees, rocks, grass, the log for the cans,
// light shafts through the canopy, fireflies and falling leaves. Everything here is scenery; targets live in targets.js.

import * as THREE from 'three';
import { COL, rnd, toon, basic, merge, M4, lumpy, smoothNormals, outlineMat, swayToon, makeGlow, glowTex, SWAY } from './fx.js';

const V3 = THREE.Vector3;
export const SUN_DIR = new V3(-0.55, 0.32, -0.77).normalize();
export const CLEAR_R = 8;          // flat, walkable clearing (you can teleport anywhere inside it)
export const LOG = { x: 0, z: -6.6, len: 2.6, r: 0.22 };   // the log the cans stand on
// the gallery: everything to shoot at, laid out so each has a clear line from where you start
export const GALLERY = {
  fence: { x0: -4.7, x1: -2.5, z: -5.2, top: 1.04 },                       // bottles stand on the top rail
  plinths: [[2.9, -5.4, 0.55], [4.3, -4.1, 0.4], [2.2, -7.9, 0.7], [-1.6, -8.6, 0.5]],   // [x, z, height] clay pots on stone
  stumps: [[-3.0, -4.4], [4.6, -2.4], [-5.2, -1.2]],                       // melons on top (0.5 m)
  rope: { x0: -3.4, x1: 3.4, z: -9.4, y: 3.9 },                            // paper lanterns hang from it
  lanterns: [-1.9, 0, 1.9],
  gate: { z: -13.6, half: 2.0 },
  critters: [[-3.6, -11.2], [-1.4, -11.8], [0.9, -11.4], [2.9, -11.0], [4.6, -12.2]],
  gong: { x: -3.4, z: -16, y: 2.05 },   // off to the left so the gate pillar does not hide it from where you start
  bubbles: [3.5, -6.6],                                                     // a patch of glowing flowers that breathes bubbles
  cliff: { z: -25, fall: 1.0 },                                             // a cliff with a waterfall, framed by the gate
  pond: { x: -3.4, z: 4.6, rx: 2.2, rz: 1.6 },                             // a lily pond behind where you start
};
export const inPond = (x, z, pad = 0) => Math.pow((x - GALLERY.pond.x) / (GALLERY.pond.rx + pad), 2) + Math.pow((z - GALLERY.pond.z) / (GALLERY.pond.rz + pad), 2) < 1;
let seed = 7;
const srnd = (a = 1, b) => { seed = (seed * 16807) % 2147483647; const r = (seed - 1) / 2147483646; return b === undefined ? r * a : a + r * (b - a); };

const clampN = x => Math.max(0, Math.min(1, x));
// toon water: two shades that ripple, a few glints, lighter at the rim
function waterMat(time) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: { uTime: time },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vP;
      void main(){
        float r = length(vP), w = sin(vP.x * 9.0 + uTime * 1.3) * sin(vP.y * 11.0 - uTime * 1.1) + sin((vP.x + vP.y) * 15.0 + uTime * 2.0) * 0.5;
        vec3 deep = vec3(0.16, 0.38, 0.42), light = vec3(0.42, 0.7, 0.72);
        vec3 c = mix(deep, light, step(0.55, w * 0.5 + 0.5) * 0.6 + smoothstep(0.7, 1.0, r) * 0.5);
        c += vec3(1.0) * step(0.985, sin(vP.x * 23.0 + uTime) * sin(vP.y * 19.0 - uTime * 1.4)) * 0.6;
        gl_FragColor = vec4(c, 0.88 * smoothstep(1.0, 0.94, r));
        #include <colorspace_fragment>
      }`,
  });
}

export function createForest(scene, particles) {
  const trunks = [];   // { x, z, r } for bullets and physics

  /* ---------- sky: warm haze at the horizon, deep blue above, a big soft sun ---------- */
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: SUN_DIR }, top: { value: new THREE.Color(0x3f78b0) }, mid: { value: new THREE.Color(0x9fc3d6) }, low: { value: new THREE.Color(0xf3c48c) }, sunC: { value: new THREE.Color(0xfff0c8) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 sun, top, mid, low, sunC; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 c = mix(low, mid, smoothstep(0.0, 0.22, h)); c = mix(c, top, smoothstep(0.22, 0.85, h));
        float s = max(dot(normalize(vDir), sun), 0.0);
        c += sunC * (pow(s, 900.0) * 1.4 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.12);
        // anime banding near the sun
        c += sunC * step(0.9985, s) * 0.6;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

  // painted clouds: flat cards far away, puffy tops lit warm, cool undersides
  const cloudTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    for (let i = 0; i < 14; i++) {
      const x = 80 + srnd(350), y = 130 + srnd(60) - (i % 3) * 20, r = 40 + srnd(55);
      const gr = g.createLinearGradient(0, y - r, 0, y + r); gr.addColorStop(0, '#fff8ea'); gr.addColorStop(0.55, '#ffe1bd'); gr.addColorStop(1, '#c9b3c8');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'destination-out'; g.fillRect(0, 205, 512, 60);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.92 });
  {
    // all the cards in one mesh; it rides along with your head like the sky, so they never get closer
    const cards = [], o = new THREE.Object3D();
    for (let i = 0; i < 7; i++) {
      const a = -2.2 + i * 0.75 + srnd(-0.2, 0.2), d = 150, y = 34 + srnd(30), w = 70 + srnd(50);
      o.position.set(Math.sin(a) * d, y, -Math.cos(a) * d); o.lookAt(0, y * 0.6, 0); o.updateMatrix();
      cards.push(new THREE.PlaneGeometry(w, w / 2).applyMatrix4(o.matrix));
    }
    const g = new THREE.BufferGeometry(), P = [], U = [], I = []; let base = 0;
    for (const c of cards) { P.push(...c.attributes.position.array); U.push(...c.attributes.uv.array); I.push(...c.index.array.map(x => x + base)); base += c.attributes.position.count; }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
    var clouds = new THREE.Mesh(g, cloudMat); clouds.renderOrder = -9; clouds.frustumCulled = false; scene.add(clouds);
  }

  /* ---------- light: cool sky from above, warm low sun; two lights, never more ---------- */
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x4a3a52, 1.5));
  const sunLight = new THREE.DirectionalLight(0xffd8a8, 2.2); sunLight.position.copy(SUN_DIR).multiplyScalar(30); scene.add(sunLight);
  scene.fog = new THREE.Fog(0xd8c2a0, 16, 75);

  /* ---------- ground: flat in the clearing, rolling beyond; worn dirt where you train ---------- */
  const gGeo = new THREE.PlaneGeometry(150, 150, 84, 84).rotateX(-Math.PI / 2);
  {
    const p = gGeo.attributes.position, cols = new Float32Array(p.count * 3), c = new THREE.Color(), cg = new THREE.Color(COL.grass), cd = new THREE.Color(COL.grassDark), cdirt = new THREE.Color(COL.dirt), cm = new THREE.Color(COL.moss);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
      const n = Math.sin(x * 0.35) * Math.cos(z * 0.29) + Math.sin(x * 0.11 + z * 0.17) * 0.8;
      if (r > CLEAR_R + 1) p.setY(i, Math.min(1, (r - CLEAR_R - 1) / 6) * (n * 0.7 + 0.5));
      c.copy(cg).lerp(cd, 0.5 + n * 0.25);
      if (r > 20) c.lerp(cm, 0.25);
      // the training ring: a scuffed oval of dirt around the dummies, and a path to the log
      const ring = Math.max(Math.exp(-Math.pow(Math.hypot(x + 1.5, z + 1.3) / 1.1, 2) * 1.5), Math.exp(-Math.pow(Math.hypot(x - 1.5, z + 1.3) / 1.1, 2) * 1.5), Math.exp(-Math.pow(Math.hypot(x - 2.4, z - 0.4) / 1.0, 2) * 1.5), Math.exp(-Math.pow(Math.hypot(x, z) / 0.9, 2) * 1.5) * 0.7);
      const path = Math.abs(x + Math.sin(z * 0.8) * 0.25) < 0.45 && z < -2 && z > -6.4 ? 0.55 : 0;
      c.lerp(cdirt, Math.min(0.85, ring * 0.75 + path + (n > 1.2 ? 0.2 : 0)));
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    gGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); gGeo.computeVertexNormals();
  }
  const ground = new THREE.Mesh(gGeo, toon(0xffffff, { vertexColors: true })); scene.add(ground);

  /* ---------- trees: chunky broadleaves and tall pines, two meshes per kind (body and ink) ---------- */
  const broad = merge([
    [new THREE.CylinderGeometry(0.2, 0.36, 4.2, 8, 3), COL.bark, M4(0, 2.1, 0)],
    [new THREE.CylinderGeometry(0.07, 0.11, 1.6, 6), COL.bark, M4(0.45, 3.3, 0.1, 0, 0, -0.9)],
    [new THREE.CylinderGeometry(0.06, 0.1, 1.4, 6), COL.bark, M4(-0.4, 3.5, -0.1, 0.2, 0, 0.8)],
    [lumpy(new THREE.IcosahedronGeometry(1.9, 1), 0.18, 1), COL.leafDeep, M4(0, 5.1, 0, 0, 0, 0, 1, 0.8, 1)],
    [lumpy(new THREE.IcosahedronGeometry(1.3, 1), 0.2, 2), COL.leaf, M4(1.2, 4.6, 0.5, 0, 0, 0, 1, 0.8, 1)],
    [lumpy(new THREE.IcosahedronGeometry(1.2, 1), 0.2, 3), COL.leaf, M4(-1.1, 4.8, -0.4, 0, 0, 0, 1, 0.85, 1)],
    [lumpy(new THREE.IcosahedronGeometry(1.1, 1), 0.2, 4), COL.leafWarm, M4(0.2, 6.1, 0.1, 0, 0, 0, 1, 0.8, 1)],
  ]);
  const pine = merge([
    [new THREE.CylinderGeometry(0.12, 0.26, 3, 7), COL.barkDark, M4(0, 1.5, 0)],
    [new THREE.ConeGeometry(1.7, 2.6, 8), COL.pine, M4(0, 2.6, 0)],
    [new THREE.ConeGeometry(1.35, 2.3, 8), COL.pine, M4(0, 3.9, 0, 0, 0.4)],
    [new THREE.ConeGeometry(1.0, 2.0, 8), COL.leafDeep, M4(0, 5.1, 0, 0, 0.8)],
    [new THREE.ConeGeometry(0.6, 1.6, 7), COL.leafDeep, M4(0, 6.1, 0, 0, 1.2)],
  ]);
  smoothNormals(broad); smoothNormals(pine);
  const treeMat = toon(0xffffff, { vertexColors: true });
  function forestOf(geo, list, ink) {
    const m = new THREE.InstancedMesh(geo, treeMat, list.length), o = ink ? new THREE.InstancedMesh(geo, outlineMat(0.05), list.length) : null;
    const col = new THREE.Color();
    list.forEach((t, i) => {
      const mtx = M4(t.x, t.y || 0, t.z, t.tilt || 0, t.ry, t.tilt2 || 0, t.s, t.s * (t.sy || 1), t.s);
      m.setMatrixAt(i, mtx); if (o) o.setMatrixAt(i, mtx);
      m.setColorAt(i, col.setHSL(0.08 + srnd(-0.03, 0.05), 0.15 + srnd(0.2), 0.85 + srnd(0.15)));
    });
    scene.add(m); if (o) scene.add(o);
    return m;
  }
  const near = { broad: [], pine: [] }, far = { broad: [], pine: [] };
  // the near ring: hugs the clearing, leaves gaps for light and a view
  for (let i = 0; i < 46; i++) {
    const a = i / 46 * Math.PI * 2 + srnd(-0.06, 0.06), r = CLEAR_R + 1.2 + srnd(0, 7) + (i % 3) * 1.4;
    const x = Math.sin(a) * r, z = -Math.cos(a) * r;
    if (Math.abs(x) < 5.5 && z < -6.5 && z > -24) continue;
    if (inPond(x, z, 1.2)) continue;   // keep the gallery lane readable and every target in sight
    const kind = srnd() < 0.55 ? 'broad' : 'pine', s = srnd(0.8, 1.35);
    near[kind].push({ x, z, ry: srnd(6), s, sy: srnd(0.9, 1.25), tilt: srnd(-0.05, 0.05), tilt2: srnd(-0.05, 0.05) });
    if (r < 14) trunks.push({ x, z, r: (kind === 'broad' ? 0.3 : 0.22) * s });
  }
  // the old tree: a big landmark at the back of the gallery, beside the gate
  near.broad.push({ x: 6.6, z: -15.5, ry: 0.6, s: 2.3, sy: 1.05 }); trunks.push({ x: 6.6, z: -15.5, r: 0.75 });
  for (const [x, z, s2] of [[-7.4, -12.5, 1.1], [-8.5, -21, 1.3], [8.8, -20, 1.2]]) { near.pine.push({ x, z, ry: srnd(6), s: s2, sy: 1.2 }); }
  forestOf(broad, near.broad, true); forestOf(pine, near.pine, true);
  // the far forest: same shapes, no ink, fading into the haze
  for (let i = 0; i < 140; i++) {
    const a = srnd(Math.PI * 2), r = srnd(22, 60), kind = srnd() < 0.5 ? 'broad' : 'pine';
    const fx = Math.sin(a) * r, fz = -Math.cos(a) * r;
    if (Math.abs(fx) < 13 && fz > -31 && fz < -18) continue;   // the cliff stands here
    far[kind].push({ x: fx, z: fz, y: fz < -30 && Math.abs(fx) < 14 ? srnd(9, 12) : srnd(0.3, 1.2), ry: srnd(6), s: srnd(1.1, 1.9), sy: srnd(1, 1.4) });
  }
  forestOf(broad, far.broad, false); forestOf(pine, far.pine, false);

  /* ---------- rocks, stumps, roots and mushrooms ---------- */
  {
    const rockGeo = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.28, 9);
    const p = rockGeo.attributes.position, n = rockGeo.attributes.normal, cols = new Float32Array(p.count * 3), cr = new THREE.Color(COL.rock), cm = new THREE.Color(COL.moss), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { c.copy(cr).lerp(cm, Math.max(0, n.getY(i) - 0.35) * 1.6); cols.set([c.r, c.g, c.b], i * 3); }
    rockGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); smoothNormals(rockGeo);
    const spots = [];
    for (let i = 0; i < 26; i++) { const a = srnd(Math.PI * 2), r = srnd(CLEAR_R - 0.5, CLEAR_R + 6); spots.push({ x: Math.sin(a) * r, z: -Math.cos(a) * r, s: srnd(0.25, 0.9) }); }
    for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28 + srnd(0.3); spots.push({ x: GALLERY.pond.x + Math.cos(a) * (GALLERY.pond.rx + 0.25), z: GALLERY.pond.z + Math.sin(a) * (GALLERY.pond.rz + 0.25), s: srnd(0.18, 0.38) }); }
    spots.push({ x: -2.9, z: -6.6, s: 0.55 }, { x: 3.4, z: -9.0, s: 0.75 }, { x: -6.5, z: 2.5, s: 1.3 }, { x: 1.0, z: -15.2, s: 0.6 }, { x: -4.8, z: -14.5, s: 0.9 });
    const rocks = new THREE.InstancedMesh(rockGeo, toon(0xffffff, { vertexColors: true }), spots.length), ink = new THREE.InstancedMesh(rockGeo, outlineMat(0.035), spots.length);
    spots.forEach((s, i) => { const m = M4(s.x, s.s * 0.25, s.z, srnd(0.3), srnd(6), srnd(0.3), s.s * srnd(1, 1.6), s.s * srnd(0.55, 0.85), s.s * srnd(1, 1.4)); rocks.setMatrixAt(i, m); ink.setMatrixAt(i, m); });
    scene.add(rocks, ink);
  }
  {
    // mushrooms: rusty red caps with pale spots, in little families at tree feet
    const shroom = merge([
      [new THREE.CylinderGeometry(0.035, 0.05, 0.16, 6), COL.puff, M4(0, 0.08, 0)],
      [new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xb5452e, M4(0, 0.15, 0, 0, 0, 0, 1, 0.7, 1)],
      [new THREE.SphereGeometry(0.018, 5, 4), COL.paper, M4(0.04, 0.2, 0.03)],
      [new THREE.SphereGeometry(0.014, 5, 4), COL.paper, M4(-0.05, 0.19, -0.01)],
    ]);
    const list = [];
    for (const t of trunks.slice(0, 30)) { const n = Math.floor(srnd(1, 4)); for (let k = 0; k < n; k++) { const a = srnd(Math.PI * 2), d = t.r + srnd(0.15, 0.5); list.push(M4(t.x + Math.cos(a) * d, 0, t.z + Math.sin(a) * d, srnd(-0.2, 0.2), srnd(6), srnd(-0.2, 0.2), srnd(0.6, 1.5))); } }
    const m = new THREE.InstancedMesh(shroom, toon(0xffffff, { vertexColors: true }), list.length);
    list.forEach((mx, i) => m.setMatrixAt(i, mx)); scene.add(m);
  }

  /* ---------- the log for the cans, with a stump or two ---------- */
  {
    const logGeo = merge([
      [new THREE.CylinderGeometry(LOG.r, LOG.r * 1.05, LOG.len, 12, 1), COL.bark, M4(0, 0, 0, 0, 0, Math.PI / 2)],
      [new THREE.CylinderGeometry(LOG.r * 0.92, LOG.r * 0.92, 0.02, 12), COL.wood, M4(LOG.len / 2 + 0.005, 0, 0, 0, 0, Math.PI / 2)],
      [new THREE.CylinderGeometry(LOG.r * 0.92, LOG.r * 0.92, 0.02, 12), COL.wood, M4(-LOG.len / 2 - 0.005, 0, 0, 0, 0, Math.PI / 2)],
      [lumpy(new THREE.SphereGeometry(0.2, 8, 5), 0.3), COL.moss, M4(-0.7, LOG.r * 0.75, 0.05, 0, 0, 0, 1.6, 0.35, 1)],
      [new THREE.CylinderGeometry(0.03, 0.05, 0.5, 5), COL.bark, M4(0.6, 0.25, 0.1, 0.5, 0, -0.6)],
    ]);
    smoothNormals(logGeo);
    const log = new THREE.Mesh(logGeo, toon(0xffffff, { vertexColors: true })); log.add(new THREE.Mesh(logGeo, outlineMat(0.018)));
    log.position.set(LOG.x, LOG.r, LOG.z); scene.add(log);
    // all the stumps in one mesh
    const sp = [];
    for (const [x, z] of GALLERY.stumps) { sp.push([new THREE.CylinderGeometry(0.28, 0.36, 0.5, 10), COL.bark, M4(x, 0.25, z)], [new THREE.CylinderGeometry(0.27, 0.27, 0.02, 10), COL.wood, M4(x, 0.505, z)]); trunks.push({ x, z, r: 0.33, h: 0.5 }); }
    const stumpGeo = smoothNormals(merge(sp));
    const st = new THREE.Mesh(stumpGeo, toon(0xffffff, { vertexColors: true })); st.add(new THREE.Mesh(stumpGeo, outlineMat(0.02))); scene.add(st);
  }

  /* ---------- the gallery's structures: shrine gate, fence, lantern poles, gong frame, stone plinths ---------- */
  {
    const G = GALLERY, lac = 0xa8432f, dark = 0x2c2228, stone = 0x8c8a90, parts = [];
    // a weathered shrine gate: lacquer worn back to wood in places, moss at the feet
    for (const sx of [-1, 1]) {
      parts.push([new THREE.CylinderGeometry(0.17, 0.2, 3.3, 10), lac, M4(sx * G.gate.half, 1.65, G.gate.z)]);
      parts.push([new THREE.CylinderGeometry(0.26, 0.3, 0.35, 10), stone, M4(sx * G.gate.half, 0.17, G.gate.z)]);
      parts.push([lumpy(new THREE.SphereGeometry(0.28, 8, 5), 0.3, sx + 4), COL.moss, M4(sx * G.gate.half, 0.3, G.gate.z, 0, 0, 0, 1.2, 0.5, 1.2)]);
    }
    parts.push([new THREE.BoxGeometry(G.gate.half * 2 + 1.6, 0.26, 0.4), dark, M4(0, 3.42, G.gate.z, 0, 0, 0)]);
    parts.push([new THREE.BoxGeometry(G.gate.half * 2 + 1.3, 0.18, 0.32), lac, M4(0, 3.2, G.gate.z)]);
    parts.push([new THREE.BoxGeometry(G.gate.half * 2 + 0.5, 0.16, 0.2), lac, M4(0, 2.62, G.gate.z)]);
    parts.push([new THREE.BoxGeometry(0.16, 0.6, 0.16), dark, M4(0, 2.92, G.gate.z)]);
    // stone lanterns either side of the gate
    for (const sx of [-1, 1]) {
      const x = sx * (G.gate.half + 1.1), z = G.gate.z + 0.6;
      parts.push([new THREE.CylinderGeometry(0.28, 0.32, 0.14, 8), stone, M4(x, 0.07, z)], [new THREE.CylinderGeometry(0.08, 0.1, 0.7, 8), stone, M4(x, 0.5, z)],
        [new THREE.BoxGeometry(0.34, 0.08, 0.34), stone, M4(x, 0.88, z)], [new THREE.BoxGeometry(0.26, 0.26, 0.26), 0x6f6c74, M4(x, 1.05, z)],
        [new THREE.ConeGeometry(0.34, 0.24, 4), stone, M4(x, 1.3, z, 0, Math.PI / 4)], [new THREE.SphereGeometry(0.05, 6, 4), stone, M4(x, 1.45, z)],
        [lumpy(new THREE.SphereGeometry(0.15, 7, 5), 0.3, x), COL.moss, M4(x + 0.1, 1.38, z, 0, 0, 0, 1.4, 0.4, 1.2)]);
    }
    // the fence for the bottles
    for (let x = G.fence.x0; x <= G.fence.x1 + 0.01; x += (G.fence.x1 - G.fence.x0) / 2) parts.push([new THREE.CylinderGeometry(0.05, 0.06, 1.1, 6), COL.wood, M4(x, 0.55, G.fence.z, 0, 0, srnd(-0.04, 0.04))]);
    for (const y of [0.55, 1.0]) parts.push([new THREE.BoxGeometry(G.fence.x1 - G.fence.x0 + 0.3, 0.08, 0.06), COL.wood, M4((G.fence.x0 + G.fence.x1) / 2, y, G.fence.z, 0, 0, srnd(-0.02, 0.02))]);
    // two poles holding the lantern rope
    for (const x of [G.rope.x0, G.rope.x1]) parts.push([new THREE.CylinderGeometry(0.07, 0.1, G.rope.y + 0.3, 7), COL.bark, M4(x, (G.rope.y + 0.3) / 2, G.rope.z)]);
    // the gong frame
    const gx = G.gong.x, gz = G.gong.z;
    for (const sx of [-1, 1]) parts.push([new THREE.CylinderGeometry(0.08, 0.1, 3.2, 7), COL.barkDark, M4(gx + sx * 0.95, 1.6, gz)]);
    parts.push([new THREE.CylinderGeometry(0.07, 0.07, 2.3, 7), COL.barkDark, M4(gx, 3.05, gz, 0, 0, Math.PI / 2)]);
    // stone plinths for the pots
    for (const [x, z, h] of G.plinths) parts.push([lumpy(new THREE.CylinderGeometry(0.2, 0.26, h, 9, 2), 0.06, x), stone, M4(x, h / 2, z)]);
    const geo = smoothNormals(merge(parts));
    const m = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true })); m.add(new THREE.Mesh(geo, outlineMat(0.025))); scene.add(m);
    for (const sx of [-1, 1]) trunks.push({ x: sx * G.gate.half, z: G.gate.z, r: 0.2, h: 3.4 });
    // the lanterns' warm windows
    const win = new THREE.InstancedMesh(new THREE.BoxGeometry(0.27, 0.16, 0.27), basic(0xffc070), 2), c2 = new THREE.Color();
    [-1, 1].forEach((sx, i) => { const x = sx * (G.gate.half + 1.1), z = G.gate.z + 0.6; win.setMatrixAt(i, M4(x, 1.05, z)); });
    scene.add(win);
    for (const x of [G.rope.x0, G.rope.x1]) trunks.push({ x, z: G.rope.z, r: 0.09, h: G.rope.y });
    for (const [x, z, h] of G.plinths) trunks.push({ x, z, r: 0.24, h });
    // the rope, sagging between the poles
    const pts = []; for (let i = 0; i <= 16; i++) { const k = i / 16; pts.push(new V3(G.rope.x0 + (G.rope.x1 - G.rope.x0) * k, G.rope.y - Math.sin(Math.PI * k) * 0.35, G.rope.z)); }
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.015, 4), toon(COL.rope)));
    // glowing flowers where the bubbles come from
    const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 0), basic(0xffffff), 30), c = new THREE.Color();
    for (let i = 0; i < 30; i++) { const a = srnd(6.28), r = Math.sqrt(srnd()) * 0.6; fl.setMatrixAt(i, M4(G.bubbles[0] + Math.cos(a) * r, srnd(0.15, 0.35), G.bubbles[1] + Math.sin(a) * r)); fl.setColorAt(i, c.set(i % 3 ? COL.spore : COL.sporePink)); }
    scene.add(fl);
    const gl = makeGlow(COL.spore, 2.2, 0.35); gl.position.set(G.bubbles[0], 0.4, G.bubbles[1]); scene.add(gl);
  }

  /* ---------- the cliff and its waterfall, seen through the gate ---------- */
  const waterTime = { value: 0 };
  {
    const C = GALLERY.cliff, parts = [];
    for (let i = 0; i < 16; i++) {
      const x = -13 + i * 1.75 + srnd(-0.4, 0.4), gap = Math.abs(x - C.fall) < 1.1;
      const h = (gap ? 7.5 : 9 + srnd(0, 4)) * (1 - Math.abs(x) / 30), r = srnd(2.2, 3.2);
      parts.push([lumpy(new THREE.IcosahedronGeometry(1, 1), 0.25, i + 20), COL.rock, M4(x, h * 0.45, C.z - srnd(0, 1.5) - (gap ? 2.2 : 0), srnd(0.4), srnd(6), srnd(0.3), r, h * 0.55, r * 0.9)]);
      if (srnd() < 0.6 && !gap) parts.push([lumpy(new THREE.IcosahedronGeometry(1, 1), 0.3, i + 50), COL.rock, M4(x + srnd(-1, 1), srnd(0.5, 1.5), C.z + srnd(1, 2.5), srnd(0.4), srnd(6), 0, srnd(0.8, 1.6), srnd(0.6, 1.1), srnd(0.8, 1.4))]);
    }
    const geo = merge(parts);
    // moss where the rock faces the sky
    const n = geo.attributes.normal, col = geo.attributes.color, cm = new THREE.Color(COL.moss), cr = new THREE.Color(0x8a8794), cd = new THREE.Color(0x5f5c6a), cc = new THREE.Color();
    for (let i = 0; i < n.count; i++) { cc.copy(cd).lerp(cr, 0.5 + n.getZ(i) * 0.3); cc.lerp(cm, clampN(n.getY(i) * 1.6 - 0.5)); col.setXYZ(i, cc.r, cc.g, cc.b); }
    smoothNormals(geo);
    const cliff = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true })); scene.add(cliff);
    // the falling water: streaks that scroll down, brightest in the middle
    const fallMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, uniforms: { uTime: waterTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        float h(float x){ return fract(sin(x * 127.1) * 43758.5); }
        void main(){
          float col = floor(vUv.x * 22.0), sp = 0.8 + h(col) * 0.6;
          float streak = smoothstep(0.55, 0.95, fract(vUv.y * 3.0 + uTime * sp + h(col + 3.0)));
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          vec3 c = mix(vec3(0.55, 0.78, 0.92), vec3(1.0), streak * 0.8 + (1.0 - vUv.y) * 0.25);
          gl_FragColor = vec4(c, edge * (0.62 + streak * 0.35));
          #include <colorspace_fragment>
        }`,
    });
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 9.5, 1, 1), fallMat); fall.position.set(C.fall, 4.75, C.z + 1.9); scene.add(fall);
    
    // the pool at its foot, and mist
    const pool2 = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), waterMat(waterTime)); pool2.scale.set(3.2, 1, 1.8); pool2.position.set(C.fall, 0.06, C.z + 3.4); scene.add(pool2);
    { const g = makeGlow(0xffffff, 4.5, 0.18); g.position.set(C.fall, 1.2, C.z + 2.6); scene.add(g); }
    var fallFoam = new V3(C.fall, 0.3, C.z + 2.3);
  }

  /* ---------- a lily pond behind you ---------- */
  {
    const P = GALLERY.pond;
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), waterMat(waterTime)); water.scale.set(P.rx, 1, P.rz); water.position.set(P.x, 0.03, P.z); scene.add(water);
    // a muddy bank
    
    // lily pads and a few lotus flowers
    const pad = new THREE.CircleGeometry(0.16, 12, 0.3, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2), pads = new THREE.InstancedMesh(pad, toon(0xffffff, { side: THREE.DoubleSide }), 16), c = new THREE.Color();
    for (let i = 0; i < 16; i++) { const a = srnd(6.28), r = Math.sqrt(srnd()) * 0.8; pads.setMatrixAt(i, M4(P.x + Math.cos(a) * r * P.rx, 0.045, P.z + Math.sin(a) * r * P.rz, 0, srnd(6), 0, srnd(0.7, 1.4))); pads.setColorAt(i, c.setHSL(0.27 + srnd(0.05), 0.45, 0.35 + srnd(0.1))); }
    scene.add(pads);
    const lotus = merge([[new THREE.ConeGeometry(0.06, 0.1, 6, 1, true), 0xff9fd8, M4(0, 0.05, 0, Math.PI)], [new THREE.ConeGeometry(0.04, 0.08, 5, 1, true), 0xffd0ea, M4(0, 0.07, 0, Math.PI, 0.5)], [new THREE.SphereGeometry(0.018, 6, 4), 0xffe28a, M4(0, 0.06, 0)]]);
    const lm = new THREE.InstancedMesh(lotus, basic(0xffffff, { vertexColors: true, side: THREE.DoubleSide }), 4);
    for (let i = 0; i < 4; i++) { const a = srnd(6.28), r = srnd(0.2, 0.7); lm.setMatrixAt(i, M4(P.x + Math.cos(a) * r * P.rx, 0.05, P.z + Math.sin(a) * r * P.rz, 0, srnd(6), 0, srnd(0.9, 1.3))); }
    scene.add(lm);
    // reeds and cattails at the edge
    const reed = merge([[new THREE.CylinderGeometry(0.006, 0.01, 0.9, 4), 0x6f8a3c, M4(0, 0.45, 0)], [new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), 0x6a4420, M4(0, 0.8, 0)]]);
    const reeds = new THREE.InstancedMesh(reed, swayToon(0xffffff, { vertexColors: true }), 46);
    for (let i = 0; i < 46; i++) { const a = srnd(6.28), r = srnd(0.9, 1.15), sc = srnd(0.6, 1.3); reeds.setMatrixAt(i, M4(P.x + Math.cos(a) * r * P.rx, 0, P.z + Math.sin(a) * r * P.rz, srnd(-0.15, 0.15), 0, srnd(-0.15, 0.15), sc, sc * srnd(0.8, 1.4), sc)); }
    scene.add(reeds);
  }

  /* ---------- ferns and bushes along the edge of the clearing ---------- */
  {
    const leaf = () => { const g = new THREE.PlaneGeometry(0.09, 0.6, 1, 5); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 0.3, w = Math.sin(Math.PI * y / 0.6); p.setXYZ(i, p.getX(i) * w, y * 0.85, -y * y * 0.9); } g.computeVertexNormals(); return g; };
    const fp = [];
    for (let k = 0; k < 7; k++) fp.push([leaf(), k % 2 ? 0x4f8a3c : 0x6f9a42, M4(0, 0, 0, -0.5, k / 7 * Math.PI * 2, 0)]);
    const fern = merge(fp); const nn = fern.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
    const spots = [];
    for (let i = 0; i < 130; i++) { const a = srnd(6.28), r = srnd(7.4, 13); const x = Math.sin(a) * r, z = -Math.cos(a) * r; if (Math.abs(x) < 4 && z < -6) continue; spots.push([x, z]); }
    for (const t of trunks.slice(0, 40)) spots.push([t.x + srnd(-0.6, 0.6), t.z + srnd(-0.6, 0.6)]);
    for (let i = 0; i < 14; i++) { const a = srnd(6.28); spots.push([GALLERY.pond.x + Math.cos(a) * (GALLERY.pond.rx + 0.5), GALLERY.pond.z + Math.sin(a) * (GALLERY.pond.rz + 0.5)]); }
    const ferns = new THREE.InstancedMesh(fern, swayToon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }), spots.length), c = new THREE.Color();
    spots.forEach(([x, z], i) => { const sc = srnd(0.7, 1.4); ferns.setMatrixAt(i, M4(x, 0, z, 0, srnd(6), 0, sc)); ferns.setColorAt(i, c.setHSL(0.25 + srnd(-0.04, 0.04), 0.4, 0.75 + srnd(0.25))); });
    scene.add(ferns);
    const bushGeo = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.22, 77); smoothNormals(bushGeo);
    const bs = [];
    for (let i = 0; i < 28; i++) { const a = srnd(6.28), r = srnd(8.2, 12); const x = Math.sin(a) * r, z = -Math.cos(a) * r; if (Math.abs(x) < 5 && z < -6) continue; bs.push(M4(x, srnd(0.2, 0.4), z, 0, srnd(6), 0, srnd(0.6, 1.1), srnd(0.5, 0.8), srnd(0.6, 1.1))); }
    const bushes = new THREE.InstancedMesh(bushGeo, toon(0xffffff), bs.length), bink = { setMatrixAt() {} };
    bs.forEach((m, i) => { bushes.setMatrixAt(i, m); bink.setMatrixAt(i, m); bushes.setColorAt(i, c.setHSL(0.28 + srnd(-0.04, 0.03), 0.4, 0.3 + srnd(0.1))); });
    scene.add(bushes);
  }

  /* ---------- butterflies and birds: wings flap in the vertex shader ---------- */
  function flapMat(color, speed, o = {}) {
    const m = new THREE.MeshBasicMaterial(Object.assign({ color, side: THREE.DoubleSide }, o));
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = SWAY.time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7;
        transformed.y += abs(position.x) * sin(uTime * ${speed.toFixed(1)} + ph) * 1.2;
        transformed.x *= 0.6 + 0.4 * abs(cos(uTime * ${speed.toFixed(1)} + ph));`);
    };
    m.customProgramCacheKey = () => 'flap' + speed;
    return m;
  }
  const wing = new THREE.BufferGeometry(); wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.02, -0.06, 0, 0.04, -0.05, 0, -0.03, 0, 0, 0.02, 0.06, 0, 0.04, 0.05, 0, -0.03], 3));
  const NBF = 12, flies2 = new THREE.InstancedMesh(wing, flapMat(0xffffff, 18), NBF); flies2.frustumCulled = false; scene.add(flies2);
  { const c = new THREE.Color(); for (let i = 0; i < NBF; i++) flies2.setColorAt(i, c.set([0xffe28a, 0xff9fd8, 0x9fd8ff, 0xffffff, 0xffb070][i % 5])); }
  const BF = Array.from({ length: NBF }, (_, i) => { const a = srnd(6.28), anchors = [[GALLERY.pond.x, GALLERY.pond.z], [GALLERY.bubbles[0], GALLERY.bubbles[1]], [-4, -3], [2.5, 2], [0, -4]]; const [x, z] = anchors[i % anchors.length]; return { x, z, p: srnd(6), r: srnd(0.6, 2) }; });
  const bird = new THREE.BufferGeometry(); bird.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.15, -0.7, 0.05, 0.1, 0, 0, 0.15, 0, 0, -0.15, 0.7, 0.05, 0.1, 0, 0, 0.15], 3));
  const NBD = 7, birds = new THREE.InstancedMesh(bird, flapMat(0x2c2430, 5), NBD); birds.frustumCulled = false; scene.add(birds);
  const BD = Array.from({ length: NBD }, (_, i) => ({ r: srnd(16, 30), h: srnd(16, 26), p: i * 0.9 + srnd(0.3), s: srnd(0.06, 0.11) * (i % 2 ? 1 : -1) }));

  /* ---------- low mist drifting at the edge of the forest ---------- */
  const mists = [];
  for (let i = 0; i < 2; i++) { const g = makeGlow(0xfff6e8, srnd(9, 13), 0.13); const a = srnd(6.28), r = srnd(11, 17); g.position.set(Math.sin(a) * r, 0.5, -Math.cos(a) * r); scene.add(g); mists.push({ g, a, r, s: srnd(0.01, 0.025) }); }

  /* ---------- mountains: two painted ridges far behind the trees ---------- */
  const mountTex = (() => {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 256; const g = c.getContext('2d');
    const ridge = (base, amp, col, seedK, snow) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, 256);
      const peaks = [];
      for (let x = 0; x <= 2048; x += 16) {
        const y = base - amp * (0.55 * Math.abs(Math.sin(x * 0.0031 * seedK)) + 0.3 * Math.abs(Math.sin(x * 0.0083 * seedK + 1.3)) + 0.15 * Math.sin(x * 0.03 + seedK));
        g.lineTo(x, y); peaks.push([x, y]);
      }
      g.lineTo(2048, 256); g.closePath(); g.fill();
      if (snow) { g.fillStyle = 'rgba(255,246,232,.85)'; for (const [x, y] of peaks) if (y < base - amp * 0.72) g.fillRect(x - 8, y, 16, 10 + (base - amp * 0.72 - y) * 0.4); }
    };
    ridge(170, 150, '#8fa3b8', 1.0, true);
    ridge(215, 90, '#6f8a8a', 1.7, false);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1); return t;
  })();
  const mountains = new THREE.Mesh(new THREE.CylinderGeometry(150, 150, 50, 48, 1, true), new THREE.MeshBasicMaterial({ map: mountTex, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false }));
  mountains.position.y = 12; mountains.renderOrder = -8; mountains.frustumCulled = false; scene.add(mountains);

  /* ---------- grass tufts and little flowers, swaying ---------- */
  {
    const blade = (x, z, h, lean, ry) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.018, 0, 0, 0.018, 0, 0, lean, h, 0]), 3)); g.computeVertexNormals(); g.applyMatrix4(M4(x, 0, z, 0, ry)); return g; };
    const parts = [];
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; parts.push([blade(Math.cos(a) * 0.04, Math.sin(a) * 0.04, srnd(0.12, 0.26), srnd(-0.05, 0.05), a + srnd(-0.5, 0.5)), k % 2 ? COL.grass : COL.leafWarm]); }
    const tuft = merge(parts);
    // the blades face the sky, so they take the light like the ground does
    const nn = tuft.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
    const N = 1800, m = new THREE.InstancedMesh(tuft, swayToon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }), N), col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = srnd(Math.PI * 2), r = Math.sqrt(srnd()) * 24;
      const x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (inPond(x, z, 0.1)) { m.setMatrixAt(i, M4(0, -5, 0, 0, 0, 0, 0.0001)); continue; }
      const worn = Math.hypot(x + 1.5, z + 1.3) < 0.9 || Math.hypot(x - 1.5, z + 1.3) < 0.9 || Math.hypot(x - 2.4, z - 0.4) < 0.8 || (Math.abs(x) < 0.5 && z < -2 && z > -6.4);
      const s = worn ? srnd(0.4, 0.7) : srnd(0.8, 1.7);
      m.setMatrixAt(i, M4(x, 0, z, 0, srnd(6), 0, s, s * srnd(0.8, 1.3), s));
      m.setColorAt(i, col.setHSL(0.22 + srnd(-0.04, 0.03), 0.4 + srnd(0.2), 0.42 + srnd(0.18)));
    }
    scene.add(m);
    // flowers: tiny bright dots, the whimsical bit
    const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.025, 0), basic(0xffffff), 260), fc = [0xffe28a, 0xffffff, 0xff9fd8, 0x9fd8ff];
    for (let i = 0; i < 260; i++) { const a = srnd(Math.PI * 2), r = srnd(1.5, 18); fl.setMatrixAt(i, M4(Math.sin(a) * r, srnd(0.1, 0.22), -Math.cos(a) * r)); fl.setColorAt(i, col.set(fc[i % 4])); }
    scene.add(fl);
  }

  /* ---------- light shafts through the canopy: tall soft planes that turn to face you ---------- */
  const shaftTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    const gv = g.createLinearGradient(0, 0, 0, 256); gv.addColorStop(0, 'rgba(255,255,255,0)'); gv.addColorStop(0.15, 'rgba(255,255,255,.9)'); gv.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gv; g.fillRect(0, 0, 64, 256);
    g.globalCompositeOperation = 'destination-in'; const gh = g.createLinearGradient(0, 0, 64, 0); gh.addColorStop(0, 'rgba(0,0,0,0)'); gh.addColorStop(0.5, 'rgba(0,0,0,1)'); gh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gh; g.fillRect(0, 0, 64, 256);
    return new THREE.CanvasTexture(c);
  })();
  const shafts = [];
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xffd9a0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  for (const [x, z, w] of [[-3.5, -5, 1.6], [-1.2, -8, 2.2], [-6, -2.5, 1.8], [4.5, -7.5, 2.4]]) {
    const len = 16, axis = SUN_DIR.clone();
    const holder = new THREE.Object3D(); holder.position.set(x, 0, z).addScaledVector(axis, len * 0.42);
    holder.quaternion.setFromUnitVectors(new V3(0, 1, 0), axis);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, len), shaftMat); plane.renderOrder = 5;
    holder.add(plane); scene.add(holder); shafts.push(plane);
  }
  // pools of warm light on the ground where the shafts land
  const pool = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffc98a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }), 6);
  [[-3.5, -5, 1.4], [-1.2, -8, 1.9], [2.2, -4.2, 1.1], [-6, -2.5, 1.6], [4.5, -7.5, 2], [0.6, -2.8, 0.8]].forEach(([x, z, s], i) => pool.setMatrixAt(i, M4(x, 0.02, z, 0, 0, 0, s * 1.4, 1, s)));
  scene.add(pool);

  /* ---------- fireflies and drifting seeds ---------- */
  const NF = 70, flies = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), NF);
  flies.frustumCulled = false; scene.add(flies);
  const F = Array.from({ length: NF }, () => ({ x: srnd(-9, 9), y: srnd(0.4, 3.5), z: srnd(-11, 5), p: srnd(6), s: srnd(0.35, 0.8) }));
  // leaves: a few dozen drift down and recycle
  const NL = 36, leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.035), basic(0xffffff, { side: THREE.DoubleSide }), NL);
  leaves.frustumCulled = false; scene.add(leaves);
  const L = Array.from({ length: NL }, (_, i) => ({ x: srnd(-8, 8), y: srnd(0, 7), z: srnd(-10, 4), p: srnd(6), v: srnd(0.25, 0.5) }));
  { const c = new THREE.Color(); for (let i = 0; i < NL; i++) leaves.setColorAt(i, c.set([COL.leafWarm, 0xd8a040, COL.leaf][i % 3])); }

  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new V3(), pv = new V3(), toCam = new V3();
  return {
    trunks,
    update(dt, t, head) {
      sky.position.copy(head); clouds.position.set(head.x, 0, head.z); mountains.position.set(head.x, 12, head.z);
      waterTime.value = t;
      for (let i = 0; i < NBF; i++) {
        const b = BF[i], u = t * 0.35 + b.p;
        pv.set(b.x + Math.sin(u) * b.r + Math.sin(u * 2.7) * 0.3, 0.6 + Math.sin(u * 1.9) * 0.35 + Math.sin(u * 5.3) * 0.08, b.z + Math.cos(u * 0.8) * b.r);
        mtx.compose(pv, q.setFromEuler(e.set(0, -u + Math.PI / 2, 0)), sv.setScalar(1)); flies2.setMatrixAt(i, mtx);
      }
      flies2.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < NBD; i++) {
        const b = BD[i], u = t * b.s + b.p;
        pv.set(Math.sin(u) * b.r, b.h + Math.sin(t * 0.3 + i) * 1.5, -6 + Math.cos(u) * b.r);
        mtx.compose(pv, q.setFromEuler(e.set(0, u + (b.s > 0 ? Math.PI : 0), Math.sin(t + i) * 0.2)), sv.setScalar(1.6)); birds.setMatrixAt(i, mtx);
      }
      birds.instanceMatrix.needsUpdate = true;
      for (const m of mists) { m.a += m.s * dt; m.g.position.set(Math.sin(m.a) * m.r, 0.5, -Math.cos(m.a) * m.r); }
      if (Math.random() < dt * 8) particles.burst('dust', fallFoam, 2, 1.2);
      for (let i = 0; i < NF; i++) {
        const f = F[i], k = 0.5 + 0.5 * Math.sin(t * 2.2 + f.p * 3);
        pv.set(f.x + Math.sin(t * 0.3 * f.s + f.p) * 0.8, f.y + Math.sin(t * 0.5 * f.s + f.p * 2) * 0.3, f.z + Math.cos(t * 0.27 * f.s + f.p) * 0.8);
        mtx.compose(pv, q.identity(), sv.setScalar(0.012 + 0.012 * k * k)); flies.setMatrixAt(i, mtx);
      }
      flies.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < NL; i++) {
        const l = L[i]; l.y -= l.v * dt; if (l.y < 0.02) { l.y = srnd(5, 7); l.x = srnd(-8, 8); l.z = srnd(-10, 4); }
        pv.set(l.x + Math.sin(t * 1.3 + l.p) * 0.4, l.y, l.z + Math.cos(t * 0.9 + l.p) * 0.3);
        mtx.compose(pv, q.setFromEuler(e.set(t * 2 + l.p, t * 1.3 + l.p * 2, Math.sin(t * 3 + l.p))), sv.setScalar(1)); leaves.setMatrixAt(i, mtx);
      }
      leaves.instanceMatrix.needsUpdate = true;
      // turn each shaft about its own length to face you, so it never shows as a thin card
      for (const s of shafts) {
        s.rotation.y = 0; s.updateMatrixWorld();
        s.worldToLocal(toCam.copy(head)); s.rotation.y = Math.atan2(toCam.x, toCam.z);
      }
    },
  };
}
