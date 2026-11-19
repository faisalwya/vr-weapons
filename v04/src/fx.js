// Weapons Sandbox VR, draft v02
// Shared look and sound: palette, toon materials with ink outlines, particles, swing trails, synthesised audio.

import * as THREE from 'three';

export const COL = {
  ink: 0x1b1622, paper: 0xf1e6cf, red: 0xd8432a,
  sky: 0x5b8fbf, haze: 0xd9b48a, sun: 0xffd29a,
  grass: 0x6f9a42, grassDark: 0x3f6230, moss: 0x7aa043, dirt: 0x8b6a47, dirtDark: 0x5e4632,
  bark: 0x5a4030, barkDark: 0x3a2a22, leaf: 0x4f8a3c, leafDeep: 0x2f5a34, leafWarm: 0x9cb24a, pine: 0x2f5a4a,
  rock: 0x7d7a86, burlap: 0xc49a5c, burlapDark: 0x8d6a3c, straw: 0xe0c070, rope: 0xb08a58, wood: 0x9a7048,
  steel: 0xc8d0dc, steelDark: 0x6b7280, brass: 0xd9a441, leather: 0x6b3f26, grip: 0x2c2430, tin: 0xb9c2c9,
  spore: 0x9ff3ff, sporePink: 0xff9fd8, puff: 0xe9dcc4, hot: 0xffe7a8, flash: 0xfff4c8,
};
export const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---------- toon shading: three flat bands of light, the anime look ---------- */
const gradTex = (() => {
  const t = new THREE.DataTexture(new Uint8Array([90, 160, 225, 255]), 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
})();
export const toon = (color, o = {}) => new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: gradTex }, o));
export const basic = (color, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color }, o));
export const glow = (color, opacity = 0.9) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

/* ---------- ink outlines: an inflated back-face shell (the inverted hull trick) ---------- */
// Outlines push vertices along smoothed normals, so hard edges (cylinder caps, boxes) do not crack open.
export function smoothNormals(geo) {
  if (geo.attributes.onormal) return geo;
  const pos = geo.attributes.position, nrm = geo.attributes.normal, map = new Map(), out = new Float32Array(pos.count * 3);
  const key = i => `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i); let a = map.get(k); if (!a) { a = [0, 0, 0]; map.set(k, a); }
    a[0] += nrm.getX(i); a[1] += nrm.getY(i); a[2] += nrm.getZ(i);
  }
  for (let i = 0; i < pos.count; i++) {
    const a = map.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  geo.setAttribute('onormal', new THREE.BufferAttribute(out, 3));
  return geo;
}
const olCache = new Map();
export function outlineMat(thick = 0.008, color = COL.ink) {
  const k = thick.toFixed(4) + '|' + color;
  if (olCache.has(k)) return olCache.get(k);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute vec3 onormal;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += onormal * ${thick.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => 'ol' + k;
  olCache.set(k, m);
  return m;
}
// a toon mesh with its outline as a child; returns the toon mesh
export function inked(geo, mat, thick = 0.008, color = COL.ink) {
  smoothNormals(geo);
  const m = new THREE.Mesh(geo, mat);
  if (thick > 0) { const o = new THREE.Mesh(geo, outlineMat(thick, color)); o.raycast = () => {}; m.add(o); }
  return m;
}

/* ---------- glued geometry: many parts with their own colours become one mesh (one draw call) ---------- */
export function merge(parts) {
  // parts: [geometry, colour, matrix?]
  let n = 0; const list = [];
  for (const [g0, c, mtx] of parts) {
    const g = (g0.index ? g0.toNonIndexed() : g0.clone()); if (mtx) g.applyMatrix4(mtx);
    if (!g.attributes.normal) g.computeVertexNormals();
    list.push([g, new THREE.Color(c)]); n += g.attributes.position.count;
  }
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  let o = 0;
  for (const [g, c] of list) {
    const p = g.attributes.position, q = g.attributes.normal;
    for (let i = 0; i < p.count; i++, o++) {
      P[o * 3] = p.getX(i); P[o * 3 + 1] = p.getY(i); P[o * 3 + 2] = p.getZ(i);
      N[o * 3] = q.getX(i); N[o * 3 + 1] = q.getY(i); N[o * 3 + 2] = q.getZ(i);
      C[o * 3] = c.r; C[o * 3 + 1] = c.g; C[o * 3 + 2] = c.b;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return out;
}
export const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
// lumpy, hand-made looking shapes: jitter every vertex a little (shared vertices move together)
export function lumpy(geo, amt, seed = 1) {
  const p = geo.attributes.position, h = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (h(x, y, z) - 0.5) * 2 * amt;
    p.setXYZ(i, x * k, y * (1 + (h(z, x, y) - 0.5) * amt), z * k);
  }
  // round shapes keep round normals, so toon light bands stay smooth instead of faceted
  const n = geo.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  n.needsUpdate = true;
  return geo;
}

/* ---------- things that move in the wind: a vertex sway driven by one shared clock ---------- */
export const SWAY = { time: { value: 0 } };
export function swayToon(color, o = {}) {
  const m = toon(color, o);
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = SWAY.time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 swayAt = instanceMatrix[3].xyz;
      #else
        vec3 swayAt = modelMatrix[3].xyz;
      #endif
      float swayK = max(position.y, 0.0) * max(position.y, 0.0) * 4.0;
      transformed.x += sin(uTime * 1.7 + swayAt.x * 0.8 + swayAt.z * 0.6) * 0.05 * swayK;
      transformed.z += cos(uTime * 1.3 + swayAt.x * 0.5 + swayAt.z * 0.9) * 0.035 * swayK;`);
  };
  m.customProgramCacheKey = () => 'sway-toon';
  return m;
}

/* ---------- soft round glow and a four-point anime star ---------- */
function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const glowTex = canvasTex(128, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
export const starTex = canvasTex(128, (g, s) => {
  const c = s / 2;
  g.fillStyle = '#fff'; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? s * 0.09 : s * 0.48; g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }
  g.closePath(); g.fill();
  const gr = g.createRadialGradient(c, c, 1, c, c, s * 0.3); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
export function makeGlow(color, size, opacity = 0, tex = glowTex) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

/* ---------- particles: one instanced mesh per pool ---------- */
function makePool(scene, count, geo, material, bounce) {
  const m = new THREE.InstancedMesh(geo, material, count);
  m.frustumCulled = false; scene.add(m);
  const P = Array.from({ length: count }, () => ({ life: 0 })), col = new THREE.Color(), arr = m.instanceMatrix.array;
  arr.fill(0);
  for (let i = 0; i < count; i++) m.setColorAt(i, col.set(0xffffff));
  let next = 0, dirty = true;
  return {
    // grow: puffs swell then fade; spin: flat bits tumble
    spawn(x, y, z, vx, vy, vz, life, size, color, gy = -9.8, grow = false, drag = 1.6) {
      const p = P[next]; m.setColorAt(next, col.set(color)); m.instanceColor.needsUpdate = true;
      next = (next + 1) % count;
      Object.assign(p, { x, y, z, vx, vy, vz, life, max: life, size, gy, grow, drag, rx: rnd(6), ry: rnd(6), sp: rnd(-12, 12) });
      dirty = true;
    },
    update(dt) {
      if (!dirty) return;
      let any = false;
      for (let i = 0; i < count; i++) {
        const p = P[i], o = i * 16;
        if (p.life <= 0) { if (arr[o] !== 0) { arr[o] = arr[o + 5] = arr[o + 10] = 0; } continue; }
        any = true;
        p.life -= dt; p.vy += p.gy * dt;
        const d = Math.exp(-p.drag * dt); p.vx *= d; p.vz *= d; if (p.grow) p.vy *= d;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.01 && p.gy < 0) { p.y = 0.01; if (bounce) { p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; p.sp *= 0.5; } else p.vy = 0; }
        const k = Math.max(0, p.life / p.max);
        const s = p.size * (p.grow ? Math.sin(Math.PI * Math.sqrt(1 - k)) * 1.2 + 0.2 * k : (bounce ? Math.min(1, k * 4) : Math.sqrt(k)));
        if (bounce) {
          p.rx += p.sp * dt; const c1 = Math.cos(p.rx), s1 = Math.sin(p.rx), c2 = Math.cos(p.ry), s2 = Math.sin(p.ry);
          arr[o] = s * c2; arr[o + 1] = 0; arr[o + 2] = -s * s2;
          arr[o + 4] = s * s1 * s2; arr[o + 5] = s * c1; arr[o + 6] = s * s1 * c2;
          arr[o + 8] = s * c1 * s2; arr[o + 9] = -s * s1; arr[o + 10] = s * c1 * c2;
        } else { arr[o] = arr[o + 5] = arr[o + 10] = s; }
        arr[o + 12] = p.x; arr[o + 13] = p.y; arr[o + 14] = p.z; arr[o + 15] = 1;
      }
      m.instanceMatrix.needsUpdate = true; dirty = any;
    },
  };
}
export function createParticles(scene) {
  const sparks = makePool(scene, 900, new THREE.OctahedronGeometry(1, 0), glow(0xffffff, 0.95));
  const bits = makePool(scene, 600, new THREE.TetrahedronGeometry(1), basic(0xffffff), true);   // straw, splinters, leaves, dirt
  const puffs = makePool(scene, 260, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }));
  const dir = (p) => { const a = rnd(Math.PI * 2), u = rnd(-0.6, 1), r = Math.sqrt(1 - Math.min(1, u * u)); return [Math.cos(a) * r * p, u * p, Math.sin(a) * r * p]; };
  function burst(kind, at, n, power = 1, along) {
    for (let i = 0; i < n; i++) {
      let [vx, vy, vz] = dir(rnd(0.5, 1.6) * power);
      if (along) { vx += along.x * rnd(0.3, 1.2) * power; vy += along.y * rnd(0.3, 1.2) * power; vz += along.z * rnd(0.3, 1.2) * power; }
      switch (kind) {
        case 'spark': sparks.spawn(at.x, at.y, at.z, vx * 2.5, vy * 2.5 + 1, vz * 2.5, rnd(0.15, 0.35), rnd(0.008, 0.018), Math.random() < 0.5 ? COL.hot : 0xffffff, -6, false, 3); break;
        case 'straw': bits.spawn(at.x, at.y, at.z, vx * 1.5, vy * 1.5 + 1.2, vz * 1.5, rnd(1.2, 2.2), rnd(0.012, 0.03), Math.random() < 0.6 ? COL.straw : COL.burlap, -5, false, 2.2); break;
        case 'wood': bits.spawn(at.x, at.y, at.z, vx * 2, vy * 2 + 1, vz * 2, rnd(0.8, 1.6), rnd(0.01, 0.022), Math.random() < 0.5 ? COL.wood : COL.bark, -9, false, 1); break;
        case 'dirt': bits.spawn(at.x, at.y, at.z, vx * 0.8, Math.abs(vy) * 1.5 + 0.5, vz * 0.8, rnd(0.5, 1), rnd(0.008, 0.02), Math.random() < 0.5 ? COL.dirt : COL.grassDark, -9, false, 1); break;
        case 'leaf': bits.spawn(at.x, at.y, at.z, vx, vy + 0.6, vz, rnd(2, 3.5), rnd(0.02, 0.035), Math.random() < 0.5 ? COL.leafWarm : COL.leaf, -1.2, false, 2.5); break;
        case 'dust': puffs.spawn(at.x, at.y, at.z, vx * 0.4, vy * 0.3 + 0.3, vz * 0.4, rnd(0.6, 1.1), rnd(0.05, 0.1), COL.puff, 0.2, true, 2); break;
        case 'spore': sparks.spawn(at.x, at.y, at.z, vx * 1.2, vy * 0.8 + 0.4, vz * 1.2, rnd(1.4, 2.6), rnd(0.012, 0.03), Math.random() < 0.55 ? COL.spore : COL.sporePink, -0.15, false, 1.8); break;
        case 'magic': sparks.spawn(at.x, at.y, at.z, vx * 0.6, vy * 0.6 + 0.3, vz * 0.6, rnd(0.4, 0.8), rnd(0.01, 0.022), Math.random() < 0.5 ? COL.spore : COL.hot, 0, false, 2); break;
        case 'glass': (i % 2 ? sparks : bits).spawn(at.x, at.y, at.z, vx * 2.2, vy * 2 + 1.2, vz * 2.2, rnd(0.6, 1.3), rnd(0.008, 0.02), along && along.color ? along.color : 0xbfe8d8, -9, false, 1); break;
        case 'clay': bits.spawn(at.x, at.y, at.z, vx * 1.8, vy * 1.6 + 1.4, vz * 1.8, rnd(1, 1.8), rnd(0.015, 0.035), Math.random() < 0.7 ? 0xb8643a : 0x8a4428, -9, false, 1); break;
        case 'melon': bits.spawn(at.x, at.y, at.z, vx * 2, vy * 1.8 + 1.5, vz * 2, rnd(1, 1.8), rnd(0.012, 0.035), [0xe8455a, 0xff7088, 0x3f8a3c, 0xf4e6c8][i % 4], -9, false, 1); break;
        case 'paper': bits.spawn(at.x, at.y, at.z, vx * 1.2, vy + 1, vz * 1.2, rnd(1.5, 2.8), rnd(0.015, 0.03), Math.random() < 0.6 ? 0xf1e6cf : 0xd8432a, -1.5, false, 2.5); break;
        case 'ember': sparks.spawn(at.x, at.y, at.z, vx * 0.8, vy * 0.8 + 1.2, vz * 0.8, rnd(0.6, 1.4), rnd(0.008, 0.02), Math.random() < 0.5 ? 0xffb050 : COL.hot, -0.5, false, 1.5); break;
        case 'bubble': sparks.spawn(at.x, at.y, at.z, vx * 1.4, vy * 1.4, vz * 1.4, rnd(0.3, 0.6), rnd(0.008, 0.016), [0x9ff3ff, 0xff9fd8, 0xffffff, 0xfff3a0][i % 4], -1, false, 3); break;
        case 'smoke': puffs.spawn(at.x, at.y, at.z, vx * 0.15 + (along ? along.x * 0.4 : 0), 0.15 + vy * 0.1, vz * 0.15 + (along ? along.z * 0.4 : 0), rnd(0.35, 0.6), rnd(0.02, 0.04), 0xdedede, 0.3, true, 3); break;
      }
    }
  }
  return { sparks, bits, puffs, burst, update(dt) { sparks.update(dt); bits.update(dt); puffs.update(dt); } };
}

/* ---------- swing trail: an anime slash ribbon between two points of the blade ---------- */
export function createTrail(scene, color = 0xcfefff, N = 22, life = 0.16) {
  const pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 3), idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
  const S = [], c = new THREE.Color(color);
  return {
    mesh,
    // add a sample while active (speed 0..1 scales brightness); old samples age out
    update(dt, a, b, on, k = 1) {
      for (const s of S) s.age += dt;
      while (S.length && S[S.length - 1].age > life) S.pop();
      if (on) S.unshift({ a: a.clone(), b: b.clone(), age: 0, k });
      if (S.length > N) S.length = N;
      mesh.visible = S.length > 1;
      if (!mesh.visible) return;
      for (let i = 0; i < N; i++) {
        const s = S[Math.min(i, S.length - 1)], f = i < S.length ? Math.pow(1 - s.age / life, 1.5) * s.k * (1 - i / N) : 0, o = i * 6;
        pos[o] = s.a.x; pos[o + 1] = s.a.y; pos[o + 2] = s.a.z; pos[o + 3] = s.b.x; pos[o + 4] = s.b.y; pos[o + 5] = s.b.z;
        // the inner edge fades to nothing, the edge at the tip burns brightest
        col[o] = c.r * f * 0.15; col[o + 1] = c.g * f * 0.15; col[o + 2] = c.b * f * 0.15;
        col[o + 3] = c.r * f; col[o + 4] = c.g * f; col[o + 5] = c.b * f;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
    clear() { S.length = 0; mesh.visible = false; },
  };
}

/* ---------- sound: everything synthesised, plays only while in the headset ---------- */
export function createAudio(isLive) {
  let ctx = null, noise = null, master = null, verb = null;
  function init() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // a short forest echo: a feedback delay with a soft low pass
    const dl = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
    dl.delayTime.value = 0.19; fb.gain.value = 0.32; lp.type = 'lowpass'; lp.frequency.value = 1800;
    verb = ctx.createGain(); verb.gain.value = 0.35;
    verb.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(master);
  }
  const ok = () => ctx && isLive();
  function hush(type, f0, f1, dur, gain, q = 1, delay = 0, wet = 0) {
    if (!ok()) return;
    const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; src.loop = true; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master); if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w).connect(verb); }
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  function tone(f0, f1, dur, gain, type = 'sine', delay = 0, wet = 0) {
    if (!ok()) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w).connect(verb); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  // a forest late in the day: soft wind in the leaves and a bird now and then
  let amb = null;
  function ambience(on) {
    if (!ok() || !on) { if (amb) { amb.stop(); amb = null; } return; }
    if (amb) return;
    const g = ctx.createGain(); g.gain.value = 0.05; g.connect(master);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(); src.buffer = noise; src.loop = true; f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.4;
    src.connect(f).connect(g); src.start();
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.09; lg.gain.value = 0.035; lfo.connect(lg).connect(g.gain); lfo.start();
    const bird = () => {
      if (!ok()) return;
      const base = rnd(2200, 3600), n = 2 + Math.floor(rnd(4));
      for (let i = 0; i < n; i++) tone(base * rnd(0.9, 1.15), base * rnd(1.1, 1.5), 0.07, 0.03, 'sine', i * rnd(0.09, 0.14), 0.6);
    };
    const iv = setInterval(() => { if (Math.random() < 0.55) bird(); }, 2600);
    amb = { stop: () => { try { src.stop(); lfo.stop(); } catch (e) { /* already stopped */ } clearInterval(iv); } };
  }
  // a hum for charging: one pair of oscillators, retuned every frame, silent at zero
  let humN = null;
  function hum(k) {
    if (!ok()) return;
    if (!humN) {
      const g = ctx.createGain(), o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter();
      o1.type = 'sawtooth'; o2.type = 'sine'; f.type = 'lowpass'; f.frequency.value = 800; g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(master); o1.start(); o2.start();
      humN = { g, o1, o2, f };
    }
    const t = ctx.currentTime;
    humN.g.gain.setTargetAtTime(k > 0 ? 0.03 + 0.08 * k : 0, t, 0.03);
    humN.o1.frequency.setTargetAtTime(90 + 260 * k, t, 0.03); humN.o2.frequency.setTargetAtTime(180 + 700 * k, t, 0.03); humN.f.frequency.setTargetAtTime(500 + 2500 * k, t, 0.03);
  }
  return {
    init, ambience, hum,
    // the sword
    draw: () => { hush('highpass', 5000, 9000, 0.35, 0.25, 2); tone(2400, 2300, 0.6, 0.05, 'triangle', 0.02, 0.4); tone(3600, 3500, 0.5, 0.03, 'sine', 0.03); },
    whoosh: k => hush('bandpass', 700 + 1600 * k, 260, 0.18 + 0.12 * k, 0.12 + 0.35 * k, 1.4),
    slash: () => { hush('highpass', 3500, 1200, 0.18, 0.55, 1); hush('lowpass', 900, 120, 0.25, 0.6); tone(150, 55, 0.22, 0.45, 'triangle', 0, 0.3); },
    thwack: k => { hush('lowpass', 1400, 150, 0.16, 0.25 + 0.3 * k); tone(120, 60, 0.15, 0.25 + 0.25 * k, 'triangle'); },
    tap: () => tone(300, 200, 0.06, 0.1, 'triangle'),
    stick: () => { tone(180, 70, 0.2, 0.5, 'triangle'); hush('lowpass', 2500, 200, 0.2, 0.4); tone(1700, 1650, 0.4, 0.05, 'triangle', 0.02); },
    pullOut: () => { hush('bandpass', 1500, 4000, 0.25, 0.25, 2); },
    clang: () => { tone(1400, 1350, 0.45, 0.12, 'triangle', 0, 0.3); tone(2100, 2050, 0.35, 0.06, 'sine'); },
    // the pistol
    shot: () => {
      hush('highpass', 7000, 900, 0.09, 0.9, 0.7); hush('lowpass', 2600, 90, 0.32, 0.9, 1, 0, 0.9);
      tone(110, 38, 0.22, 0.75, 'sine'); tone(420, 90, 0.05, 0.3, 'square');
    },
    // the shotgun: a deep, long blast with a forest echo, and the two halves of the pump
    boom: () => {
      hush('highpass', 5000, 600, 0.12, 1, 0.7); hush('lowpass', 1800, 60, 0.7, 1, 1, 0, 1.2);
      tone(70, 28, 0.45, 0.95, 'sine'); tone(220, 60, 0.12, 0.4, 'square'); hush('bandpass', 600, 200, 0.5, 0.35, 1, 0.08, 1);
    },
    pumpBack: () => { hush('bandpass', 1800, 900, 0.08, 0.5, 3); tone(420, 300, 0.05, 0.25, 'square'); },
    pumpFwd: () => { hush('bandpass', 2400, 1400, 0.07, 0.5, 3); tone(600, 520, 0.04, 0.3, 'square'); tone(240, 160, 0.08, 0.3, 'triangle', 0.03); },
    load: () => { tone(700, 520, 0.035, 0.25, 'square'); hush('bandpass', 2000, 1000, 0.06, 0.25, 3, 0.02); },
    hull: () => { tone(380, 300, 0.08, 0.1, 'triangle', 0.3); tone(330, 260, 0.06, 0.06, 'triangle', 0.42); },
    // the daggers: a brighter ring on the draw, a quick flick in the air
    drawDagger: () => { hush('highpass', 6000, 10000, 0.22, 0.2, 2); tone(3400, 3300, 0.35, 0.04, 'triangle', 0.02, 0.3); },
    flick: k => hush('bandpass', 1800 + 2200 * k, 600, 0.1 + 0.08 * k, 0.1 + 0.3 * k, 1.8),
    // the Star Caster: a waking chime, a charge, a bright shot and a sparkling burst
    casterWake: () => { [880, 1320, 1760].forEach((f, i) => tone(f, f * 1.01, 0.3, 0.05, 'sine', i * 0.05, 0.5)); },
    casterCharge: () => tone(300, 600, 0.15, 0.06, 'triangle'),
    chargeFull: () => { [1568, 2093].forEach((f, i) => tone(f, f, 0.25, 0.08, 'sine', i * 0.05, 0.6)); },
    casterShot: p => { tone(900 + 600 * p, 200, 0.18 + 0.1 * p, 0.25 + 0.2 * p, 'sawtooth'); hush('bandpass', 3000, 800, 0.2, 0.3 + 0.2 * p, 2); tone(160, 60, 0.15, 0.3 * p, 'sine'); },
    casterBoom: p => {
      tone(120 - 40 * p, 35, 0.3 + 0.4 * p, 0.5 + 0.4 * p, 'sine'); hush('lowpass', 2500, 120, 0.4 + 0.5 * p, 0.5 + 0.4 * p, 1, 0, 0.9);
      [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, f * 0.99, 0.5, 0.04 + 0.04 * p, 'sine', 0.04 + i * 0.04, 0.8));
    },
    // the Sparring Bot
    botBoot: () => { [262, 330, 392, 523].forEach((f, i) => tone(f, f, 0.14, 0.12, 'square', i * 0.09)); hush('bandpass', 300, 1200, 0.8, 0.15, 1.5); },
    botOff: () => { [523, 392, 330, 262].forEach((f, i) => tone(f, f, 0.12, 0.08, 'square', i * 0.08)); },
    botBeep: () => { tone(880, 880, 0.06, 0.1, 'square'); tone(1320, 1320, 0.08, 0.1, 'square', 0.08); },
    botWindup: () => { tone(200, 700, 0.75, 0.12, 'sawtooth'); hush('bandpass', 400, 1600, 0.75, 0.1, 3); },
    botSwing: () => hush('bandpass', 2400, 400, 0.3, 0.6, 1.4),
    botAim: () => { tone(400, 1200, 0.7, 0.08, 'triangle'); tone(1200, 1210, 0.3, 0.05, 'sine', 0.5); },
    orbFire: () => { tone(900, 300, 0.25, 0.18, 'sine'); hush('bandpass', 1500, 600, 0.2, 0.2, 3); },
    orbPop: () => { tone(500, 1800, 0.1, 0.15, 'sine'); hush('highpass', 4000, 2000, 0.15, 0.2, 1); },
    deflect: () => { tone(1800, 2600, 0.15, 0.15, 'triangle'); hush('highpass', 5000, 3000, 0.2, 0.3, 1); },
    botHurt: k => { tone(600 - 200 * k, 300, 0.12, 0.2 + 0.2 * k, 'square'); tone(1700, 1600, 0.25, 0.08 + 0.08 * k, 'triangle', 0, 0.3); hush('bandpass', 2000, 800, 0.12, 0.3, 2); },
    parry: () => { [1100, 1650, 2470].forEach((f, i) => tone(f, f * 0.98, 0.6 - i * 0.12, 0.2 - i * 0.04, 'triangle', 0, 0.5)); hush('highpass', 6000, 2500, 0.25, 0.6, 1); },
    botDown: () => { [400, 300, 200, 120].forEach((f, i) => tone(f, f * 0.8, 0.25, 0.2, 'square', i * 0.12)); hush('lowpass', 2000, 100, 1.0, 0.7, 1, 0, 0.8); tone(80, 30, 0.8, 0.6, 'sine'); },
    botRebuild: () => { hush('bandpass', 300, 3000, 1.0, 0.25, 2); [262, 392, 523, 784].forEach((f, i) => tone(f, f, 0.15, 0.1, 'square', 0.3 + i * 0.12)); },
    ouch: () => { tone(160, 70, 0.25, 0.6, 'sine'); hush('lowpass', 900, 200, 0.25, 0.5); },
    button: () => { tone(300, 200, 0.06, 0.3, 'square'); tone(600, 900, 0.1, 0.1, 'sine', 0.05); },
    dry: () => { tone(2200, 2000, 0.025, 0.15, 'square'); tone(900, 800, 0.03, 0.08, 'square', 0.015); },
    magOut: () => { tone(700, 500, 0.04, 0.2, 'square'); hush('bandpass', 2400, 1200, 0.08, 0.2, 3, 0.02); },
    magIn: () => { tone(900, 700, 0.03, 0.25, 'square'); tone(500, 420, 0.05, 0.25, 'square', 0.06); hush('bandpass', 3000, 1500, 0.06, 0.25, 3, 0.06); },
    slide: () => { hush('bandpass', 2600, 1600, 0.09, 0.3, 4); tone(1200, 900, 0.04, 0.15, 'square', 0.05); },
    shell: () => { const f = rnd(3800, 5200); tone(f, f * 0.97, 0.12, 0.05, 'sine', 0.25); tone(f * 1.3, f * 1.28, 0.08, 0.03, 'sine', 0.36); },
    ricochet: () => tone(rnd(2600, 3400), rnd(700, 1100), 0.35, 0.08, 'sine', 0.02, 0.5),
    // the world
    can: () => { const f = rnd(800, 1100); tone(f, f * 0.96, 0.35, 0.18, 'triangle', 0, 0.3); tone(f * 1.52, f * 1.5, 0.25, 0.1, 'sine'); hush('highpass', 4000, 2000, 0.08, 0.2); },
    thud: v => tone(95, 50, 0.16, Math.min(0.45, 0.06 + v * 0.06), 'triangle'),
    pop: () => { tone(380, 900, 0.09, 0.2, 'sine'); hush('bandpass', 900, 2500, 0.12, 0.2, 2); },
    puff: () => { hush('lowpass', 1600, 300, 0.4, 0.4); tone(500, 1400, 0.25, 0.08, 'sine', 0.05, 0.6); [1047, 1319, 1568].forEach((f, i) => tone(f, f, 0.4, 0.04, 'sine', 0.08 + i * 0.05, 0.6)); },
    boing: () => { tone(160, 520, 0.18, 0.18, 'triangle'); tone(520, 360, 0.25, 0.08, 'sine', 0.15); },
    hop: () => tone(500, 900, 0.12, 0.08, 'sine'),
    // you
    grab: () => hush('lowpass', 1000, 250, 0.12, 0.25),
    holster: () => { hush('lowpass', 1300, 300, 0.18, 0.3); tone(240, 180, 0.08, 0.12, 'triangle', 0.06); },
    recall: () => { hush('bandpass', 400, 3200, 0.35, 0.35, 2); tone(300, 1200, 0.35, 0.1, 'sine', 0, 0.5); },
    catch: () => { tone(900, 900, 0.12, 0.12, 'triangle'); hush('lowpass', 1800, 300, 0.1, 0.3); },
    homing: () => { [784, 988, 1175].forEach((f, i) => tone(f, f, 0.3, 0.05, 'sine', i * 0.06, 0.5)); },
    blink: () => hush('bandpass', 2400, 400, 0.3, 0.25, 1.5),
    glass: () => { hush('highpass', 7000, 3000, 0.35, 0.5, 1, 0, 0.3); [2637, 3136, 3951, 4699].forEach((f, i) => tone(f * rnd(0.97, 1.03), f, 0.18 + i * 0.05, 0.05, 'sine', rnd(0.03))); },
    clay: () => { hush('bandpass', 1400, 500, 0.2, 0.5, 1.2); tone(220, 120, 0.12, 0.3, 'triangle'); hush('highpass', 3000, 1500, 0.15, 0.2, 1, 0.04); },
    splat: () => { hush('lowpass', 900, 150, 0.3, 0.7); tone(140, 60, 0.18, 0.4, 'sine'); hush('bandpass', 2000, 600, 0.2, 0.25, 2, 0.03); },
    gong: () => { [98, 147, 196, 247, 330].forEach((f, i) => tone(f, f * 0.992, 3.2 - i * 0.45, 0.32 - i * 0.05, i % 2 ? 'sine' : 'triangle', 0, 0.6)); hush('bandpass', 900, 400, 0.4, 0.2, 2); },
    bubble: () => { tone(900, 1900, 0.06, 0.15, 'sine'); tone(1600, 2600, 0.05, 0.06, 'sine', 0.03); },
    clack: () => { tone(520, 300, 0.07, 0.3, 'square'); hush('bandpass', 1800, 900, 0.1, 0.3, 3); tone(160, 90, 0.18, 0.3, 'triangle', 0.08); },
    rise: () => { hush('bandpass', 500, 1400, 0.25, 0.12, 2); tone(300, 520, 0.12, 0.06, 'triangle', 0.15); },
    paperPop: () => { hush('lowpass', 2500, 500, 0.3, 0.45); tone(300, 120, 0.2, 0.2, 'triangle'); },
    rustle: () => hush('bandpass', 3000, 1500, 0.2, 0.12, 1.5),
    tick: () => tone(1500, 1500, 0.025, 0.08, 'square'),
  };
}
