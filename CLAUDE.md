# Working on Weapons Sandbox VR

Read `README.md` (north star, pillars, roadmap) and the top entry of `NOTES.md` (latest playtest and what is next) before doing anything.

## How we work

- **One weapon, one mechanic at a time.** Change one thing per version, by a step big enough that Faisal can feel it in the headset.
- **Cut before tuning.** If a mechanic does not feel good on its own, propose dropping it rather than adding settings.
- **Controllers first.** Hand tracking is not a priority.
- **Faisal judges feel, the agent checks function.** Agent checks say whether it works and give numbers; only Faisal says whether it is fun.

## Versions

- Each version is a folder `vNN/` (index.html plus `src/`). Never edit an older version; it is a reference Faisal can go back to.
- New version: copy the latest folder to the next number, update its title and eyebrow, and point the root `index.html` at it.
- Shared libraries live in `vendor/` (three.js r187, cannon-es 0.20), imported through an importmap.
- No build step. Plain ES modules. Keep the file count low.

## Checks before pushing

- `python3 tests/page_check.py vNN 40` and `node tests/xr_check.mjs vNN`. Extend the emulated run when a mechanic changes.
- Checks inform, they do not block. If something fails, push anyway when Faisal wants to play it, and say plainly what is broken.

## Lessons so far (some carried over from Elemental Proving Ground VR)

- Keep the number of lights constant (toggle intensity, never add or remove) or three.js recompiles shaders mid-game and stutters.
- Measure hand velocity against game time (the summed frame step), not wall-clock time.
- Anything simulated must also be drawn.
- The Quest grip axis points about 45 degrees above the controller's pointing direction; a blade along it points up. v01 tilts the sword 0.5 rad toward the pointing direction.
- Keep a clear lane between where you stand and the shooting targets; v01's first layout had a dummy blocking the cans.
- A mechanic the world does not teach does not exist: v01's two-handed reload went unused. Prefer one button, or a gesture the scene shows.
- Check every target's line from the start spot through gate pillars, poles and dummies (v02's gong first sat behind a pillar).
- Things outside targets.js that can be hit (the bot, its orbs, its button) register spheres through `targets.addProvider`; blades, bullets, pellets and bursts then reach them with no extra code.
- Sprites and instanced pools still cost draw calls and triangles when invisible by opacity or scale; hide them.

## Writing for Faisal

- No em dashes in anything written for him.
- Dense and structured: short sections, lists, no recap of steps.
- After each push: the link, what changed in one or two lines, and the one or two questions this version should answer.
