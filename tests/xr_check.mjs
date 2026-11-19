// Enter VR in an emulated Quest 3 (IWER, Meta's WebXR emulator) inside headless Chrome, play the sandbox with
// emulated controllers and report what happened. Checks function, not feel.
//
//   node tests/xr_check.mjs v01 [out-dir]      # screenshots go to out-dir (default: a temp folder)
//
// Needs Playwright with a Chromium and the `iwer` npm package (installed once into a temp folder if missing).

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const VER = process.argv[2] || 'v01';
const OUT = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'xr-check-'));
fs.mkdirSync(OUT, { recursive: true });

const require = createRequire(import.meta.url);
function need(name, installDir) {
  try { return require.resolve(name); } catch (e) { /* not local */ }
  const g = path.join(execSync('npm root -g').toString().trim(), name);
  if (fs.existsSync(g)) return g;
  const local = path.join(installDir, 'node_modules', name);
  if (!fs.existsSync(local)) { console.log(`installing ${name} into ${installDir}`); execSync(`npm install --silent --prefix "${installDir}" ${name}`, { stdio: 'inherit' }); }
  return local;
}
const { chromium } = require(need('playwright', path.join(os.tmpdir(), 'epg-pw')));
const iwerDir = need('iwer', path.join(os.tmpdir(), 'epg-iwer'));
const iwerRoot = iwerDir.endsWith('.js') ? path.dirname(path.dirname(iwerDir)) : iwerDir;
const IWER_JS = fs.readFileSync(path.join(iwerRoot, 'build', 'iwer.min.js'), 'utf8');
const CHROME = process.env.CHROME || undefined;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

// the emulator and a puppet for its controllers: keyframes per controller, played in game time
const PUPPET = `
(() => {
  const d = new IWER.XRDevice(IWER.metaQuest3);
  d.installRuntime({ forceInstall: true }); d.stereoEnabled = false; d.primaryInputMode = 'controller';
  d.position.set(0, 1.6, 0);
  window.__xr = d;
  const Q = { left: [], right: [] }, from = {};
  window.__key = (side, k) => Q[side].push(k);
  window.__idle = () => !Q.left.length && !Q.right.length;
  function puppet(dt) {
    for (const side of ['left', 'right']) {
      const q = Q[side]; if (!q.length) continue;
      const k = q[0], inp = d.controllers[side];
      if (!k.started) {
        k.started = true; k.t = 0; from[side] = inp.position.clone();
        const q0 = inp.quaternion; k.q0 = [q0.x, q0.y, q0.z, q0.w];
        if (k.q && k.q0[0] * k.q[0] + k.q0[1] * k.q[1] + k.q0[2] * k.q[2] + k.q0[3] * k.q[3] < 0) k.q = k.q.map(x => -x);
        if (k.buttons) for (const id in k.buttons) inp.updateButtonValue(id, k.buttons[id]);
        if (k.axes) inp.updateAxes('thumbstick', k.axes[0], k.axes[1]);
      }
      k.t += dt;
      const f = Math.min(1, k.t / (k.dur || 0.0001)), e = k.linear ? f : f * f * (3 - 2 * f);
      if (k.q) { const qq = k.q0.map((x, i) => x + (k.q[i] - x) * e), l = Math.hypot(...qq); inp.quaternion.set(qq[0] / l, qq[1] / l, qq[2] / l, qq[3] / l); }
      if (k.to) { const a = from[side]; inp.position.set(a.x + (k.to[0] - a.x) * e, a.y + (k.to[1] - a.y) * e, a.z + (k.to[2] - a.z) * e); }
      if (f >= 1) { q.shift(); if (k.then) k.then(); }
    }
  }
  const req = navigator.xr.requestSession.bind(navigator.xr);
  navigator.xr.requestSession = async (...a) => {
    const s = await req(...a);
    const raf = s.requestAnimationFrame.bind(s);
    let last = null; window.__gt = 0;
    s.requestAnimationFrame = cb => raf((t, f) => {
      const dt = last === null ? 0.016 : Math.min(0.05, Math.max(0.001, (t - last) / 1000)); last = t;
      window.__gt += dt; puppet(dt); cb(t, f);
    });
    return s;
  };
})();`;

const results = [];
const check = (ok, what, detail = '') => { results.push({ ok, what }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? '  · ' + detail : ''}`); };
const info = (what, detail) => console.log(`info ${what}  · ${detail}`);

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
await page.addInitScript({ content: IWER_JS + PUPPET + '\nwindow.__log = [];' });
await page.goto(`http://127.0.0.1:${PORT}/${VER}/`);
await page.waitForSelector('#enter:not([hidden])', { timeout: 20000 });
await page.click('#enter');
await page.waitForFunction(() => document.body.classList.contains('in-vr'), null, { timeout: 15000 });

const K = (side, k) => page.evaluate(([s, k]) => window.__key(s, k), [side, k]);
const settle = async (ms = 90000) => { await page.waitForFunction(() => window.__idle(), null, { timeout: ms, polling: 50 }); };
const wait = async secs => { await K('left', { dur: secs }); await settle(); };
const log = () => page.evaluate(() => window.__log.slice());
let mark = 0;
const fresh = async () => { const L = await log(); const out = L.slice(mark); mark = L.length; return out; };
const G = (fn, arg) => page.evaluate(fn, arg);
const st = () => G(() => { const w = window.__game.weapons; return { sword: w.sword.state, pistol: w.pistol.state, rh: w.hands.right.held && (w.hands.right.held.kind), lh: w.hands.left.held && (w.hands.left.held.kind), ammo: [w.pistol.chambered, w.pistol.mag, w.pistol.magIn], rig: { ...window.__game.rig } }; });
const shot = async name => { await page.screenshot({ path: path.join(OUT, name + '.png') }); };
// the game's grip position minus the emulated controller position, so we can place the grip where we want it
const gripOffset = side => G(s => { const h = window.__game.weapons.hands[s], c = window.__xr.controllers[s].position; return [h.pos.x - c.x, h.pos.y - c.y, h.pos.z - c.z]; }, side);
const gripTo = async (side, p, dur, extra = {}) => { const o = await gripOffset(side); await K(side, Object.assign({ to: [p[0] - o[0], p[1] - o[1], p[2] - o[2]], dur }, extra)); await settle(); };
const yawPitchQ = (yaw, pitch) => { const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2); return [cy * sp, sy * cp, -sy * sp, cy * cp]; };

// 0. arrive
await K('left', { to: [-0.25, 1.2, -0.35], dur: 0.3 }); await K('right', { to: [0.25, 1.2, -0.35], dur: 0.3 }); await settle(); await wait(1.0);
let s = await st();
check(s.sword === 'holstered' && s.pistol === 'holstered', 'both weapons start holstered', JSON.stringify(s));
info('body', JSON.stringify(await G(() => { const b = window.__game.weapons.body; return { head: b.head, yaw: b.yaw, hipY: b.hipY }; })));
await shot('01-arrive');

// 1. draw the sword over the right shoulder
await gripTo('right', [0.16, 1.5, 0.14], 0.6);
const z1 = await G(() => { const w = window.__game.weapons; return w.zoneOf(w.hands.right.pos); });
check(z1 === 'backR', 'right hand over the shoulder is in the sword zone', z1);
await K('right', { dur: 0.15, buttons: { squeeze: 1 } }); await settle(); await wait(0.1);
s = await st(); check(s.sword === 'held' && s.rh === 'sword', 'squeezing there draws the sword', JSON.stringify(s));
check((await fresh()).some(l => l === 'DRAW sword'), 'draw is logged');
await gripTo('right', [0.3, 1.3, -0.4], 0.5); await wait(0.3);
const blade = await G(() => { const T = window.__game.weapons.sword.mesh, q = T.quaternion, v = { x: 0, y: 0, z: -1 };
  // rotate (0,0,-1) by q
  const ix = q.w * v.x + q.y * v.z - q.z * v.y, iy = q.w * v.y + q.z * v.x - q.x * v.z, iz = q.w * v.z + q.x * v.y - q.y * v.x, iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return [ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x].map(x => +x.toFixed(2)); });
info('blade direction with the controller held level', JSON.stringify(blade));
check(blade[2] < -0.3, 'held level, the blade points away from you', JSON.stringify(blade));
await shot('02-sword-drawn');

// 2. step up to the right-hand dummy and cut
const HX = 1.5, HZ = -0.25;   // where you stand: 1.05 m in front of the dummy at (1.5, -1.3)
await page.evaluate(([x, z]) => window.__xr.position.set(x, 1.6, z), [HX, HZ]); await wait(0.6);
await gripTo('right', [HX + 0.55, 1.75, HZ - 0.25], 0.6);
await gripTo('right', [HX - 0.45, 1.05, HZ - 0.4], 0.14, { linear: true });
await wait(0.6);
let L = await fresh();
check(L.some(l => /^(CUT|SLASH)/.test(l)), 'a fast diagonal swing at the dummy cuts', L.filter(l => /CUT|SLASH|HIT|TAP/.test(l)).join(' / ') || L.join(' / '));
info('swing result', L.join(' / '));
await shot('03-after-cut');
// a slow push is not a cut
await gripTo('right', [HX, 1.3, HZ - 0.25], 0.8); await gripTo('right', [HX, 1.3, HZ - 0.6], 0.8); await wait(0.3);
L = await fresh();
check(!L.some(l => /^(CUT|SLASH)/.test(l)), 'a slow push into the dummy does not cut', L.join(' / ') || 'nothing');
await gripTo('right', [HX + 0.3, 1.3, HZ - 0.25], 0.6);

// 3. throw the sword at the dummy (let go in mid swing), then recall it
await gripTo('right', [HX + 0.3, 1.7, HZ + 0.2], 0.5);
const o3 = await gripOffset('right');
await K('right', { to: [HX + 0.15 - o3[0], 1.5 - o3[1], HZ - 0.25 - o3[2]], dur: 0.07, linear: true });
await K('right', { to: [HX + 0.1 - o3[0], 1.45 - o3[1], HZ - 0.45 - o3[2]], dur: 0.05, linear: true, buttons: { squeeze: 0 } }); await settle(); await wait(1.0);
let s3 = await st(); L = await fresh();
check((s3.sword === 'free' || s3.sword === 'stuck') && L.some(l => l.startsWith('THROW sword')), 'letting go mid swing throws the sword', `${s3.sword} · ${L.join(' / ')}`);
await shot('04-thrown');
await gripTo('right', [HX + 0.3, 1.25, HZ - 0.2], 0.4);
await K('right', { dur: 0.1, buttons: { squeeze: 1 } }); await K('right', { dur: 0.1, buttons: { trigger: 1 } }); await K('right', { dur: 0.1, buttons: { trigger: 0 } }); await settle(); await wait(0.9);
s = await st(); L = await fresh();
check(L.some(l => l.startsWith('RECALL sword')) && s.sword === 'held', 'empty fist plus trigger recalls the sword to the hand', `${s.sword} · ${L.join(' / ')}`);

// 4. holster it again: over the shoulder, wherever you stand
await gripTo('right', [HX + 0.16, 1.5, HZ + 0.14], 0.6); await K('right', { dur: 0.1, buttons: { squeeze: 0 } }); await settle(); await wait(0.2);
s = await st(); check(s.sword === 'holstered' && !s.rh, 'letting go over the shoulder puts the sword away', JSON.stringify(s));
L = await fresh();

// 5. draw the pistol from the right hip and shoot a can
await page.evaluate(() => window.__xr.position.set(0, 1.6, 0)); await wait(0.6);
const hip = await G(() => { const w = window.__game.weapons, p = w.pistol.mesh.position; return [p.x, p.y, p.z]; });
await gripTo('right', [hip[0], hip[1] + 0.02, hip[2]], 0.6);
const z2 = await G(() => { const w = window.__game.weapons; return w.zoneOf(w.hands.right.pos); });
check(z2 === 'hipR', 'right hand at the right hip is in the pistol zone', z2);
await K('right', { dur: 0.12, buttons: { squeeze: 1 } }); await settle(); await wait(0.1);
s = await st(); check(s.pistol === 'held' && s.rh === 'pistol', 'squeezing at the hip draws the pistol', JSON.stringify(s));
await gripTo('right', [0.2, 1.35, -0.45], 0.5);
// aim the controller at the third can
const can = await G(() => { const c = window.__game.targets.cans[2].home; return [c.x, c.y, c.z]; });
const aimAt = async (side, target) => {
  for (let i = 0; i < 3; i++) {
    const r = await G(([s, t]) => { const g = window.__game.weapons, h = g.hands[s], p = g.pistol.mesh;
      const d = [t[0] - h.pos.x, t[1] - h.pos.y, t[2] - h.pos.z], l = Math.hypot(...d); return d.map(x => x / l); }, [side, target]);
    const yaw = Math.atan2(-r[0], -r[2]), pitch = Math.asin(r[1]);
    await K(side, { q: yawPitchQ(yaw, pitch), dur: 0.15 }); await settle(); await wait(0.15);
  }
};
await aimAt('right', can); await wait(0.3);
const fireOnce = async () => { await K('right', { dur: 0.05, buttons: { trigger: 1 } }); await K('right', { dur: 0.12, buttons: { trigger: 0 } }); await settle(); };
await fireOnce(); await wait(0.5);
L = await fresh();
check(L.includes('SHOT pistol'), 'trigger fires', L.join(' / '));
check(L.some(l => l.startsWith('SHOTHIT can')), 'the shot hits the can it was aimed at', L.join(' / '));
await shot('05-shot');
// empty the gun: 8 rounds in total, then a dry click
for (let i = 0; i < 8; i++) await fireOnce();
await wait(0.3); L = await fresh(); s = await st();
check(L.filter(l => l === 'SHOT pistol').length === 7 && L.includes('DRY'), 'eight rounds, then a dry click', `${L.filter(l => l === 'SHOT pistol').length} more shots, ${L.includes('DRY') ? 'dry' : 'no dry'} · ammo ${JSON.stringify(s.ammo)}`);

// 6. reload: one press of A
await K('right', { dur: 0.1, buttons: { 'a-button': 1 } }); await K('right', { dur: 0.1, buttons: { 'a-button': 0 } }); await settle(); await wait(0.8);
L = await fresh(); s = await st();
check(L.includes('EJECT') && L.includes('RELOAD pistol') && s.ammo[0] && s.ammo[1] === 7 && s.ammo[2], 'one press of A reloads and chambers', `${L.join(' / ')} · ammo ${JSON.stringify(s.ammo)}`);
await fireOnce(); await wait(0.2); L = await fresh();
check(L.includes('SHOT pistol'), 'the reloaded pistol fires', L.join(' / '));
await shot('06-reloaded');

// 6b. the gallery: a bottle, the gong, a critter, a lantern (two hits)
const shootAt = async (getter, n = 1) => { const p = await G(getter); await aimAt('right', p); await wait(0.2); for (let i = 0; i < n; i++) { await fireOnce(); await wait(0.25); } return fresh(); };
L = await shootAt(() => { const c = window.__game.targets.kinds.bottle.items[2].hc; return [c.x, c.y, c.z]; });
check(L.some(l => l.startsWith('SMASH bottle')), 'a bottle on the fence smashes', L.join(' / '));
L = await shootAt(() => { const c = window.__game.targets.gong.c; return [c.x, c.y, c.z]; });
check(L.some(l => l.startsWith('GONG')), 'the far gong rings', L.join(' / '));
await G(() => { const C = window.__game.targets.critters[1]; C.state = 'rising'; C.target = 0; C.t = 10; });
await wait(0.9);
L = await shootAt(() => { const C = window.__game.targets.critters[1]; C.piv.updateMatrixWorld(); const p = C.piv.localToWorld(C.piv.position.clone().set(0, C.cy, 0)); return [p.x, p.y, p.z]; });
check(L.some(l => l.startsWith('CRITTER')), 'a popped-up critter gets knocked down', L.join(' / '));
// it swings after the first hit, so aim again for each shot
L = [];
for (let i = 0; i < 4 && !L.some(l => l.startsWith('LANTERN ')); i++) L = L.concat(await shootAt(() => { const c = window.__game.targets.lanterns[1].c; return [c.x, c.y, c.z]; }));
check(L.some(l => l.startsWith('LANTERN ')), 'two hits bring a lantern down', L.join(' / '));
await shot('06b-gallery');
await K('right', { dur: 0.1, buttons: { 'a-button': 1 } }); await K('right', { dur: 0.1, buttons: { 'a-button': 0 } }); await settle(); await wait(0.6); await fresh();

// 6c. dual pistols: the left hand draws the second pistol from the left hip and fires it
const hipL = await G(() => { const p = window.__game.weapons.pistolL.mesh.position; return [p.x, p.y, p.z]; });
await gripTo('left', [hipL[0], hipL[1] + 0.02, hipL[2]], 0.6);
await K('left', { dur: 0.12, buttons: { squeeze: 1 } }); await settle(); await wait(0.1);
s = await G(() => { const w = window.__game.weapons; return { l: w.pistolL.state, r: w.pistolR.state, lh: w.hands.left.held && w.hands.left.held.slot }; });
check(s.l === 'held' && s.r === 'held' && s.lh === 'hipL', 'both hands hold a pistol', JSON.stringify(s));
await gripTo('left', [-0.2, 1.35, -0.45], 0.5);
const fireL = async () => { await K('left', { dur: 0.05, buttons: { trigger: 1 } }); await K('left', { dur: 0.12, buttons: { trigger: 0 } }); await settle(); };
await aimAt('left', await G(() => { const c = window.__game.targets.cans[0].home; return [c.x, c.y, c.z]; })); await wait(0.2); await fresh();
await fireL(); await wait(0.3); L = await fresh();
check(L.some(l => l.startsWith('SHOT pistol')), 'the left pistol fires', L.join(' / '));
await shot('06c-dual');
// put both away
for (const [side, slot] of [['right', 'pistolR'], ['left', 'pistolL']]) {
  const hp = await G(sl => { const w = window.__game.weapons, b = w.body, r = sl === 'pistolR' ? 0.25 : -0.25; return [b.head.x + b.R.x * r + b.F.x * (0.02 - 0.08), b.hipY + 0.06, b.head.z + b.R.z * r + b.F.z * (0.02 - 0.08)]; }, slot);
  await K(side, { q: [0, 0, 0, 1], dur: 0.2 }); await settle();
  await gripTo(side, hp, 0.5); await K(side, { dur: 0.1, buttons: { squeeze: 0 } }); await settle();
}
await wait(0.2);
s = await G(() => { const w = window.__game.weapons; return [w.pistolL.state, w.pistolR.state]; });
check(s[0] === 'holstered' && s[1] === 'holstered', 'both pistols go back on the hips', JSON.stringify(s));
await fresh();

// 6d. the shotgun: draw over the left shoulder, blast, dry, pump with the other hand, blast, flick-pump, load
await gripTo('left', [-0.16, 1.5, 0.14], 0.6);
const zL = await G(() => { const w = window.__game.weapons; return w.zoneOf(w.hands.left.pos); });
check(zL === 'backL', 'left hand over the left shoulder is in the shotgun zone', zL);
await K('left', { dur: 0.12, buttons: { squeeze: 1 } }); await settle(); await wait(0.1);
s = await G(() => window.__game.weapons.shotgun.state + ' ' + window.__game.weapons.shotgun.hand);
check(s === 'held left', 'squeezing there draws the shotgun', s);
await gripTo('left', [-0.12, 1.35, -0.3], 0.5);
const potAt = () => { const c = window.__game.targets.kinds.pot.items[0].hc; return [c.x, c.y, c.z]; };
await aimAt('left', await G(potAt)); await wait(0.2); await fresh();
await fireL(); await wait(0.4); L = await fresh();
check(L.some(l => l.startsWith('SHOT shotgun')) && L.some(l => l.startsWith('SHOTHIT') && !l.includes('none')), 'the shotgun blast hits what it was aimed at', L.join(' / '));
await shot('06d-blast');
await fireL(); await wait(0.2); L = await fresh();
check(L.some(l => l.startsWith('DRY')), 'it will not fire again until pumped', L.join(' / '));
// the right hand takes the fore-end
const fore = await G(() => { const g = window.__game.weapons.shotgun; g.mesh.updateMatrixWorld(); const p = g.mesh.localToWorld(g.pump.position.clone()); return [p.x, p.y, p.z]; });
await gripTo('right', fore, 0.6); await K('right', { dur: 0.12, buttons: { squeeze: 1 } }); await settle(); await wait(0.1);
L = await fresh(); check(L.includes('SUPPORT'), 'the other hand takes the fore-end', L.join(' / '));
const gh = await G(() => { const w = window.__game.weapons; return [w.hands.left.pos.x, w.hands.left.pos.y, w.hands.left.pos.z]; });
const toward = (p, q, k) => p.map((x, i) => x + (q[i] - x) * k);
const foreNow = await G(() => { const w = window.__game.weapons; return [w.hands.right.pos.x, w.hands.right.pos.y, w.hands.right.pos.z]; });
const dist = Math.hypot(...foreNow.map((x, i) => x - gh[i]));
await gripTo('right', toward(foreNow, gh, 0.1 / dist), 0.18);
await gripTo('right', foreNow, 0.18); await wait(0.2);
L = await fresh(); s = await G(() => window.__game.weapons.shotgun.chambered);
check(L.some(l => l.startsWith('PUMP') && l.includes('ready')) && s, 'pulling the fore-end back and forward pumps a fresh shell in', L.join(' / '));
await shot('06e-two-hands');
await fireL(); await wait(0.3); L = await fresh();
check(L.some(l => l.startsWith('SHOT shotgun')), 'two-handed, it fires again', L.join(' / '));
await K('right', { dur: 0.1, buttons: { squeeze: 0 } }); await settle(); await wait(0.2); await fresh();
// one hand: flick the muzzle up hard
const q0 = await G(() => { const q = window.__xr.controllers.left.quaternion; return [q.x, q.y, q.z, q.w]; });
await K('left', { q: yawPitchQ(0, 0.75), dur: 0.06, linear: true }); await K('left', { q: q0, dur: 0.4 }); await settle(); await wait(0.2);
L = await fresh(); s = await G(() => window.__game.weapons.shotgun.chambered);
check(L.some(l => l.startsWith('PUMP') && l.includes('ready')) && s, 'one-handed, a hard flick up pumps it', L.join(' / '));
const tube0 = await G(() => window.__game.weapons.shotgun.tube);
await K('left', { dur: 0.1, buttons: { 'x-button': 1 } }); await K('left', { dur: 0.1, buttons: { 'x-button': 0 } }); await settle(); await wait(0.1);
L = await fresh(); const tube1 = await G(() => window.__game.weapons.shotgun.tube);
check(L.some(l => l.startsWith('LOAD')) && tube1 === tube0 + 1, 'X loads a shell into the tube', `${tube0} -> ${tube1} · ${L.join(' / ')}`);
// put it back over the shoulder
await K('left', { q: [0, 0, 0, 1], dur: 0.2 }); await settle();
await gripTo('left', [-0.16, 1.5, 0.14], 0.6); await K('left', { dur: 0.1, buttons: { squeeze: 0 } }); await settle(); await wait(0.2);
s = await G(() => window.__game.weapons.shotgun.state);
check(s === 'holstered', 'letting go over the left shoulder puts the shotgun away', s);
await gripTo('left', [-0.25, 1.2, -0.35], 0.4); await gripTo('right', [0.25, 1.2, -0.35], 0.4); await fresh();

// 6e. daggers: draw from the chest, cut, throw, put back
if (await G(() => !!window.__game.weapons.daggerR)) {
  await page.evaluate(() => window.__xr.position.set(1.5, 1.6, -0.25)); await wait(0.6);
  const dpos = await G(() => { const p = window.__game.weapons.daggerR.mesh.position; return [p.x, p.y, p.z]; });
  await K('right', { q: [0, 0, 0, 1], dur: 0.2 }); await settle();
  await gripTo('right', dpos, 0.6);
  const zc = await G(() => { const w = window.__game.weapons; return w.zoneOf(w.hands.right.pos); });
  check(zc === 'chestR', 'right hand at the chest is in the dagger zone', zc);
  await K('right', { dur: 0.12, buttons: { squeeze: 1 } }); await settle(); await wait(0.1);
  s = await G(() => window.__game.weapons.daggerR.state); check(s === 'held', 'squeezing there draws a dagger', s); await fresh();
  // a short fast slash, closer in than the sword
  await gripTo('right', [1.5 + 0.45, 1.55, -0.25 - 0.55], 0.5);
  await gripTo('right', [1.5 - 0.35, 1.05, -0.25 - 0.75], 0.12, { linear: true }); await wait(0.5);
  L = await fresh(); check(L.some(l => /^(CUT|SLASH|HIT)/.test(l)), 'a dagger slash hits the dummy', L.join(' / ') || 'nothing');
  await shot('06f-dagger');
  const o4 = await gripOffset('right');
  await gripTo('right', [1.5 + 0.25, 1.6, -0.1], 0.4);
  await K('right', { to: [1.6 - o4[0], 1.45 - o4[1], -0.55 - o4[2]], dur: 0.07, linear: true });
  await K('right', { to: [1.55 - o4[0], 1.42 - o4[1], -0.75 - o4[2]], dur: 0.05, linear: true, buttons: { squeeze: 0 } }); await settle(); await wait(0.8);
  L = await fresh(); check(L.some(l => l.startsWith('THROW dagger')), 'a dagger can be thrown', L.join(' / '));
  await K('right', { dur: 0.1, buttons: { squeeze: 1 } }); await K('right', { dur: 0.1, buttons: { trigger: 1 } }); await K('right', { dur: 0.1, buttons: { trigger: 0 } }); await settle(); await wait(0.9);
  s = await G(() => window.__game.weapons.daggerR.state); check(s === 'held', 'and recalled', s);
  const back = await G(() => { const w = window.__game.weapons, b = w.body; return [b.head.x + b.R.x * 0.11 + b.F.x * (0.13 - 0.08), b.head.y - 0.4, b.head.z + b.R.z * 0.11 + b.F.z * (0.13 - 0.08)]; });
  await gripTo('right', back, 0.5); await K('right', { dur: 0.1, buttons: { squeeze: 0 } }); await settle(); await wait(0.2);
  s = await G(() => window.__game.weapons.daggerR.state); check(s === 'holstered', 'letting go at the chest sheathes it', s);
  await page.evaluate(() => window.__xr.position.set(0, 1.6, 0)); await wait(0.5); await fresh();

  // 6f. the Star Caster: draw from the small of the back, charge, release, burst
  const cpos = await G(() => { const w = window.__game.weapons, p = w.caster.mesh.localToWorld(w.caster.mesh.position.clone().set(0, -0.02, 0.03)); return [p.x, p.y, p.z]; });
  await gripTo('right', cpos, 0.6);
  const zb = await G(() => { const w = window.__game.weapons; return w.zoneOf(w.hands.right.pos); });
  check(zb === 'backLow', 'right hand at the small of the back is in the Star Caster zone', zb);
  await K('right', { dur: 0.12, buttons: { squeeze: 1 } }); await settle(); await wait(0.1);
  s = await G(() => window.__game.weapons.caster.state); check(s === 'held', 'squeezing there draws the Star Caster', s);
  await gripTo('right', [0.2, 1.35, -0.45], 0.5);
  await aimAt('right', await G(() => { const c = window.__game.targets.kinds.melon.items[1].hc; return [c.x, c.y, c.z]; })); await wait(0.2); await fresh();
  await K('right', { dur: 1.1, buttons: { trigger: 1 } }); await settle(); await shot('06g-charged');
  await K('right', { dur: 0.1, buttons: { trigger: 0 } }); await settle(); await wait(1.2);
  L = await fresh();
  const shotL = L.find(l => l.startsWith('SHOT caster'));
  check(!!shotL && L.some(l => l.startsWith('STARBURST')), 'hold, release: a star flies and bursts', L.join(' / '));
  check(L.some(l => l.startsWith('SMASH melon')), 'the burst smashes the melon it was aimed at', L.join(' / '));
  await K('right', { dur: 0.05, buttons: { trigger: 1 } }); await K('right', { dur: 0.1, buttons: { trigger: 0 } }); await settle(); await wait(0.8);
  L = await fresh(); check(L.some(l => l.startsWith('SHOT caster')) && L.some(l => l.startsWith('STARBURST')), 'a quick tap fires a small star', L.join(' / '));
  const lowAt = await G(() => { const w = window.__game.weapons, b = w.body; return [b.head.x - 0.04 * b.R.x + (-0.17 - 0.08) * b.F.x, b.hipY + 0.08, b.head.z - 0.04 * b.R.z + (-0.17 - 0.08) * b.F.z]; });
  await K('right', { q: [0, 0, 0, 1], dur: 0.2 }); await settle();
  await gripTo('right', lowAt, 0.5); await K('right', { dur: 0.1, buttons: { squeeze: 0 } }); await settle(); await wait(0.2);
  s = await G(() => window.__game.weapons.caster.state); check(s === 'holstered', 'letting go at the small of the back puts it away', s);
  await gripTo('right', [0.25, 1.2, -0.35], 0.4); await fresh();

  // 6g. the Sparring Bot: press the button, it boots and comes for you
  const btnTop = await G(() => { const b = window.__game.sparring.debug.btn; return [b.g.position.x, 0.93, b.g.position.z]; });
  await gripTo('left', [btnTop[0], btnTop[1] + 0.15, btnTop[2]], 0.7);
  await gripTo('left', [btnTop[0], btnTop[1] - 0.02, btnTop[2]], 0.25); await wait(0.3);
  L = await fresh(); s = await G(() => window.__game.sparring.bot.on);
  check(L.includes('BOT') && s === true, 'pressing the mushroom button switches the bot on', L.join(' / '));
  await gripTo('left', [-0.25, 1.2, -0.35], 0.5); await wait(2.5);
  s = await G(() => { const b = window.__game.sparring.bot; return { s: b.state, d: Math.hypot(b.pos.x, b.pos.z) }; });
  check(['stalk', 'windup', 'strike', 'recover', 'aim'].includes(s.s), 'the bot boots and starts sparring', JSON.stringify(s));
  await shot('06h-bot');
  // a parry: the sword held across the path of its swing
  const sw = await G(() => { const w = window.__game.weapons, p = w.sword.mesh.position; return [p.x, p.y, p.z]; });
  await K('right', { q: [0, 0, 0, 1], dur: 0.2 }); await settle();
  await gripTo('right', [0.16, 1.5, 0.14], 0.5); await K('right', { dur: 0.12, buttons: { squeeze: 1 } }); await settle(); await wait(0.1);
  // freeze it in front of you and work out where its baton will be halfway through the swing
  const plan = await G(() => {
    const S = window.__game.sparring, b = S.bot, d = S.debug;
    b.pos.set(0, 0, -0.85); b.yaw = 0; b.vel.set(0, 0, 0); b.state = 'stalk'; b.next = 99; b.hold = true; b.swing = d.SWINGS[0];
    S.root.position.copy(b.pos); S.root.rotation.y = b.yaw; d.hull.position.y = 0.35; d.hull.rotation.set(0, 0, 0);
    d.aimSwing(); d.batonArm.quaternion.copy(d.aimQ).multiply(d.SWINGS[0].m); S.root.updateMatrixWorld(true);
    const a = d.batonArm.localToWorld(d.batonArm.position.clone().set(0, -0.73, 0));
    return [a.x, a.y, a.z];
  });
  // turn the controller so the blade lies sideways, then put the blade's middle on that point
  await K('right', { q: yawPitchQ(Math.PI / 2, 0), dur: 0.2 }); await settle(); await wait(0.1);
  const bd = await G(() => { const s = window.__game.weapons.sword, h = window.__game.weapons.hands.right; s.mesh.updateMatrixWorld(); const m = s.mesh.localToWorld(s.mesh.position.clone().set(0, 0, -0.55)); return [m.x - h.pos.x, m.y - h.pos.y, m.z - h.pos.z]; });
  await gripTo('right', [plan[0] - bd[0], plan[1] - bd[1], plan[2] - bd[2]], 0.4); await wait(0.1); await fresh();
  await G(() => { const b = window.__game.sparring.bot; b.hold = false; b.state = 'windup'; b.t = 0.79; b.pos.set(0, 0, -0.85); });
  await wait(0.6);
  L = await fresh(); check(L.includes('PARRY'), 'a blade across the baton parries the swing', L.join(' / ') || 'nothing');
  await shot('06i-parry');
  // no blade in the way: the swing lands
  await gripTo('right', [0.5, 0.9, 0.2], 0.4); await fresh();
  await G(() => { const S = window.__game.sparring, b = S.bot; b.pos.set(0, 0, -1.05); b.yaw = 0; b.swing = S.debug.SWINGS[0]; b.state = 'windup'; b.t = 0.79; });
  await wait(0.6);
  L = await fresh(); check(L.some(l => l.startsWith('PLAYERHIT')), 'with nothing in the way, the baton hits you', L.join(' / ') || 'nothing');
  // an orb: slashed hard, it flies back and hurts the bot
  await G(() => { const S = window.__game.sparring, b = S.bot; b.pos.set(0, 0, -2.2); b.state = 'aim'; b.t = S.BOT.aim - 0.01; b.volley = 1; });
  await wait(0.15);
  const orbRes = await G(() => {
    const S = window.__game.sparring, T = window.__game.targets, o = S.orbs.find(x => x.on); if (!o) return 'no orb';
    const h = T.spheres().find(x => x.id === 'orb' + o.i); if (!h) return 'orb not hittable';
    return T.hit(h, o.p.clone(), o.p.clone().set(0, 0, -6), 'blade');
  });
  await wait(1.2);
  L = await fresh(); check(orbRes === 'cut' && L.includes('DEFLECT') && L.some(l => l.startsWith('BOTHURT')), 'a hard slash sends its orb back into it', `${orbRes} · ${L.join(' / ')}`);
  // knock it down with the pistol, then watch it rebuild
  await gripTo('right', [0.16, 1.5, 0.14], 0.5); await K('right', { dur: 0.1, buttons: { squeeze: 0 } }); await settle();
  await G(() => { const S = window.__game.sparring, b = S.bot; b.hp = 1; b.pos.set(0, 0, -2.4); b.state = 'stalk'; b.next = 99; b.hold = true; S.debug.hull.rotation.set(0, 0, 0); S.debug.hull.position.y = 0.35; });
  const hp2 = await G(() => { const p = window.__game.weapons.pistolR.mesh.position; return [p.x, p.y, p.z]; });
  await K('right', { q: [0, 0, 0, 1], dur: 0.2 }); await settle();
  await gripTo('right', [hp2[0], hp2[1] + 0.02, hp2[2]], 0.5); await K('right', { dur: 0.12, buttons: { squeeze: 1 } }); await settle();
  await gripTo('right', [0.2, 1.35, -0.45], 0.4);
  await aimAt('right', await G(() => { const S = window.__game.sparring; S.debug.hull.updateMatrixWorld(true); const c = S.debug.hull.localToWorld(S.debug.hull.position.clone().set(0, 0.6, 0)); return [c.x, c.y, c.z]; }));
  await fresh(); await fireOnce(); await G(() => { window.__game.sparring.bot.hold = false; }); await wait(0.5);
  L = await fresh(); check(L.includes('BOTDOWN'), 'when its health runs out it falls apart', L.join(' / '));
  await shot('06j-bot-down');
  await wait(7.5); L = await fresh();
  check(L.includes('BOTUP'), 'and rebuilds itself', L.join(' / '));
  // switch it off again
  await gripTo('left', [btnTop[0], btnTop[1] + 0.15, btnTop[2]], 0.6); await gripTo('left', [btnTop[0], btnTop[1] - 0.02, btnTop[2]], 0.25); await wait(0.3);
  s = await G(() => window.__game.sparring.bot); check(s.on === false && (s.state === 'return' || s.state === 'off'), 'pressing the button again sends it back to its dock', JSON.stringify({ on: s.on, state: s.state }));
  await gripTo('left', [-0.25, 1.2, -0.35], 0.4);
  const hpR = await G(() => { const w = window.__game.weapons, b = w.body; return [b.head.x + b.R.x * 0.25 + b.F.x * (0.02 - 0.08), b.hipY + 0.06, b.head.z + b.R.z * 0.25 + b.F.z * (0.02 - 0.08)]; });
  await K('right', { q: [0, 0, 0, 1], dur: 0.2 }); await settle(); await gripTo('right', hpR, 0.5); await K('right', { dur: 0.1, buttons: { squeeze: 0 } }); await settle();
  await gripTo('right', [0.25, 1.2, -0.35], 0.4); await fresh();
}

// 7. snap turn and a jump
const yaw0 = (await st()).rig.yaw;
await K('right', { dur: 0.1, axes: [1, 0] }); await K('right', { dur: 0.2, axes: [0, 0] }); await settle(); await wait(0.2);
s = await st(); L = await fresh();
check(Math.abs(s.rig.yaw - yaw0 + Math.PI / 4) < 0.01 && L.includes('TURN right'), 'right stick turns 45 degrees right', `${yaw0} -> ${s.rig.yaw.toFixed(3)} · ${L.join(' / ')}`);
await K('left', { q: yawPitchQ(0, -0.35), dur: 0.2 }); await settle();
await K('left', { dur: 0.4, axes: [0, -1] }); await settle(); await shot('07-jump-arc');
await K('left', { dur: 0.2, axes: [0, 0] }); await settle(); await wait(0.5);
L = await fresh(); s = await st();
check(L.some(l => l.startsWith('JUMP')), 'left stick forward then release jumps', `${L.join(' / ')} · rig ${JSON.stringify(s.rig)}`);

info('frame stats', JSON.stringify(await G(() => ({ calls: window.__game.renderer.info.render.calls, tris: window.__game.renderer.info.render.triangles }))));
check(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
console.log(`\n${results.filter(r => r.ok).length}/${results.length} checks passed · screenshots in ${OUT}`);
await browser.close(); server.close();
process.exit(results.every(r => r.ok) ? 0 : 1);
