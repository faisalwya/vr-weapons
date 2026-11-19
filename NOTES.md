# Playtest notes

Newest first.

## 2026-11-19 · v03 playtest, and v04, the sparring grove

**Faisal on v03.** A great improvement; enjoyed the weapons. Next:
- Improve the area and scenery.
- More weapons, a mix of projectiles and blades: dual short blades, and a projectile that can be sci-fi or fantasy, fun to wield.
- A more dynamic opponent, something like a robot that spars with you and moves; switchable on and off.

**v04 changes.** (Several things at once because Faisal asked for them together; each is self-contained so it can be cut on its own.)
- Twin daggers in sheaths across the chest (seven holsters now). Short blades, the sword's cut rules, quicker swish, pink and mint trails, throwable (they stick) and recallable.
- Star Caster at the small of the back: a brass hand cannon with a crystal. Hold the trigger to charge (0.9 s: rising hum, spinning rings, growing vibration, a chime when full), let go to launch a star that arcs and bursts. A tap fires a small quick star; a full charge bursts about 2.3 m wide, breaks most things twice and throws loose objects. No ammo; the charge is the limit.
- The Sparring Bot, a hovering wood-and-brass automaton. Off by default, asleep on its dock behind you on the right. Hit or press the mushroom button by the sign to switch it on or off.
  - It circles at 1.5 to 2.3 m. Melee: raises its baton (glows, rising whine, 0.8 s), then swings flat at head height or down diagonally. A blade across the baton parries it: big clang, it staggers. Otherwise you get a red flash and a thump in both hands.
  - Ranged: aims its cannon arm (pink glow), fires a slow orb; three in a row when below half health. Dodge it, shoot it, or slash it hard to send it back for 5 damage.
  - 24 health shown as beads around its middle. Bullets 1, pellets 1 each, bursts 3, a slow blade 1, a cutting blade 3, head hits double. Big hits stagger it. At zero it falls apart, and rebuilds after 5 s.
- Scenery: a mossy cliff with a waterfall and pool, framed by the gate; a lily pond with reeds behind you; stone lanterns by the gate; ferns and bushes along the edge; butterflies, birds circling high, drifting mist.
- The preview runs the bot so it can be seen; holstered weapons are hidden there.

**Agent checks.** Emulated Quest 3: 57/57 (adds dagger draw, slash, throw, recall, sheathe; Star Caster draw, charged burst smashing a melon, tap shot, holster; bot button on, boot, parry, a hit landing on you, orb slashed back, knocked down, rebuilt, button off).
- Bugs found and fixed: the bot's closest-point helper overwrote its own input, so baton hits could never land; its flat swing passed beside your head because it swings from an offset shoulder (swings now aim at your head when the strike starts, and it lunges to 0.85 m).
- Draw calls: rose to about 260 with everything added; trimmed to about 145 to 180 (cans and puffballs batched, stumps and critter bases merged, outlines dropped on far or small things, fewer glows). v03 was about 140. Watch the frame rate.

**Questions for the playtest.**
- Sparring Bot: too easy, too hard, or fun? Can you read its attacks in time to parry?
- Daggers and Star Caster: which is more fun, and does the charge feel good?
- Does the clearing feel more alive? Does it still run smoothly?

## 2026-11-19 · v02 playtest, and v03, the arsenal

**Faisal on v02.** Decent, but it can be more fun and satisfying. Dual-wielding pistols should be an option. Add a different kind of gun to explore other mechanics, and different reactions and feedback when firing.

**v03 changes.**
- Four holsters: sword over the right shoulder, shotgun over the left shoulder, a pistol on each hip. Any hand draws anything; let go at its holster to put it away.
- Dual pistols: each works on its own; A reloads the right one, X the left.
- Pump shotgun, chosen because it differs from the pistol on every axis:
  - Rhythm: one shot, then you must pump. A dry click and a note on the sign if you forget.
  - Pump: take the wooden fore-end with your other hand, pull it back (the red hull flies out) and push it forward (a fresh shell goes in). With one hand, flick the gun up hard. Holding with two hands also steadies the aim and softens the kick.
  - Blast: nine pellets in a cone, each its own hit; cans fly much further, dummy parts and bottles go in one shot up close.
  - Feel: deeper, longer boom with echo; a bigger flash and smoke; the muzzle kicks about twice as hard; long vibration in both hands.
  - Shells: 1 in the chamber plus 6 in the tube. A or X loads one at a time (hold to keep loading). Gold dot = chambered, red dots = tube.
- Preview ghost now holds the left pistol.

**Agent checks.** Emulated Quest 3: 37/37 (adds dual draw and fire, holstering both, shotgun draw, blast hits, dry until pumped, fore-end grab, two-handed pump, flick pump, load, holster). About 140 draw calls.

**Questions for the playtest.**
- Shotgun: does the pump feel good? Two hands or the flick, which did you use?
- Dual pistols: fun, or awkward to aim?
- Is the shotgun blast satisfying enough, or should targets react even harder?

## 2026-11-19 · v01 playtest, and v02, the gallery

**Faisal on v01.**
- Could not work out the reload. It should be more seamless.
- Wants the place more compelling, with more things that are cool to shoot at.

**Claude's read.** The two-handed magazine reload asked for three things at once (drop with A, find the left hip, line up the grip) with nothing in the world teaching it. Cut it rather than tune it. The clearing had targets for the sword but only six small cans for the pistol, all at one distance.

**v02 changes.**
- Reload: one press of A or X. The old magazine drops, a fresh one rises into the grip, the slide closes. Firing is blocked for 0.4 s. The left-hip pouch is gone.
- Gallery, each with a clear line from where you start: six glass bottles on a fence (left), four clay pots on stone plinths, three melons on stumps, three paper lanterns on a rope (first hit swings, second tears it down, it is rehung), five wooden critters (goblin, crow, boar) that flip up by the gate, at most three at a time, a gong at 16 m, bubbles drifting up from glowing flowers on the right. Everything grows back.
- Scenery: a weathered shrine gate, the lantern rope and poles, painted mountains, the trees pulled back to open the lane.
- Sword, holsters, recall, movement: unchanged from v01.

**Agent checks.** Emulated Quest 3: 24/24. About 145 draw calls and 280 thousand triangles in the headset view (v01: about 95 and 255 thousand). Watch the frame rate.

**Questions for the playtest.**
- Is reloading now invisible, or does it still interrupt?
- Which targets are the most fun to hit, and is anything too far or too small?
- Does it run smoothly?

## 2026-11-19 · v01, the clearing

**Faisal's brief.** A VR game for his Quest 3 built around wielding weapons: swords, guns, interesting weapons. Controllers are the main input, hand tracking not a priority. Fun and visually pleasing. Sandbox first (no goals), arena in a forest. Look: whimsical, quirky yet gritty, anime or cool animated-film feel; not settled. Feel and the weapon experience come first.

**Carried over from the elemental game.** One mechanic at a time; variants that feel alike blur together; feel before visuals; lean repo with every version kept.

**What v01 has.**
- Sword over the right shoulder: reach back and squeeze grip to draw. Cuts by speed at the point of contact (3.6 m/s and up cuts, 1.4 to 3.6 thwacks, below that taps). Heads and arms come off and grow back. Slash trail, star flash, hit-stop (the world slows for 60 ms).
- Pistol on the right hip: trigger fires, 8 rounds, slide locks back when empty. A or X drops the magazine; take a fresh one from the left hip and push it into the grip. Recoil kick, muzzle flash, tracer, ejected brass, ammo dots on the back of the slide.
- Let go at a holster to put away; anywhere else drops or throws (thrown things get a 1.35x boost). A thrown sword arriving point first sticks in a dummy.
- Recall: empty hand, hold grip, pull trigger; the nearest loose weapon flies back. Weapons left lying still for 3.5 s fly home on their own.
- You can pick up and throw cans, magazines and cut-off heads.
- Jump: left stick forward aims an arc, release to land. Right stick snap turns 45 degrees.
- Targets: three straw dummies on springy posts, six cans on a log at 6.6 m (they hop back), six puffball mushrooms (burst into spores, regrow).
- Look: toon shading in three bands, ink outlines, warm late-afternoon light, painted sky and clouds, light shafts, fireflies, falling leaves.

**Agent checks.** Emulated Quest 3: 23/23 (draw, cut, slow push does not cut, throw, recall, holster, hip draw, hit an aimed can, 8 rounds then dry, eject, take magazine, reload, fire, turn, jump). About 90 draw calls and 130 to 250 thousand triangles.

**Questions for the playtest.**
- Sword: does the blade sit at a natural angle in your hand? (It is tilted about 29 degrees from the grip axis toward where the controller points.) Do cuts happen when you expect them to?
- Pistol: do shots go where you aim? Is the reload too fiddly, or satisfying?
- Holsters: can you find them without looking?
- Which moment felt best, and which felt off?
