# Weapons Sandbox VR (working title)

> **Wield swords, guns and stranger things with your hands; make every hit feel great.**

A standing-play VR sandbox for Meta Quest 3, built for the web (WebXR, three.js). No install: open the link in the Quest browser and press Enter VR. Controllers first; hand tracking later, if at all.

## Pillars

1. **Weapon feel.** How each weapon handles in your hand: drawing, swinging, aiming, reloading, throwing. Plus everything that sells a hit: hit-stop, sparks, straw, sound, vibration.
2. **Look and world.** A forest clearing; whimsical, quirky, a little gritty; anime and animated-film energy. Style is not settled yet.

**Constraint on everything:** comfort and performance. Smooth frame rate on the Quest (72 Hz or better), room-scale play, no smooth artificial movement (jump with an arc, snap turn).

**Parked for later:** enemies, goals and progression, hand tracking.

## Roadmap

1. **Core kit** (now). Sword and pistol in a sandbox; tune feel one weapon at a time.
2. **Weight.** Heavy weapons that lag behind your hand; two-handed grips.
3. **Interesting weapons.** One at a time: returning throw blade, chain whip, gravity gauntlet, throwable shield.
4. **Art direction pass.** Commit to a look for the forest, the targets and the weapons.
5. **Something that fights back.**

## Versions

Every version stays playable at `/vNN/`. The newest is the one being worked on; older ones are never edited.

| Version | What it is | Verdict |
|---|---|---|
| v01 | The clearing. Sword over the right shoulder, pistol on the right hip with magazine reloads, recall to hand, sticking throws, three straw dummies (heads and arms come off and grow back), six cans on a log (they hop back), puffball mushrooms, jump and snap turn. | Waiting for playtest. |

## Repo

```
index.html     opens the latest version
vNN/           one folder per version: index.html + src/
vendor/        three.js r187 and cannon-es 0.20, shared by all versions
tests/         headless page check and an emulated Quest 3 run (playwright + iwer)
NOTES.md       dated playtest log and decisions
CLAUDE.md      how Claude works in this repo
```

`vNN/src`: `main.js` (loop, input, moving, sign), `weapons.js` (sword, pistol, holsters, reload, recall), `targets.js` (dummies, cans, puffballs, physics, bullets), `forest.js` (scenery), `fx.js` (toon look, particles, trails, sound), `demo.js` (self-playing preview).

No build step: plain ES modules.

## Testing

```
python3 tests/page_check.py v01 40     # the self-playing preview in headless Chrome
node tests/xr_check.mjs v01            # emulated Quest 3: draw, cut, throw, recall, holster, shoot, reload, turn, jump
```
