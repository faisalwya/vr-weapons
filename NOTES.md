# Playtest notes

Newest first.

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
