# X5 Commander: front line and layered defense

Three changes to the concept:
1. **Aircraft come from one direction, the front.**
2. **You start with only an anti-aircraft machine gun** and build your line of defense as you level up.
3. **Later levels add missile and drone attacks from other directions.** Manned aircraft still always come from the front.

The game stops being "a 360° Patriot battery from minute one" and becomes a defense you grow, with a clear front and flanks you have to cover later.

## Context for a fresh session
- Setup, controls and the current rules are in [README.md](README.md). Other plans: [plan-mvp.md](plan-mvp.md), [plan.md](plan.md).
- Today, every spawn bearing is `rand() * TAU` (`spawn()` in [src/sim.ts](src/sim.ts): normal spawns, packages, strike packages, raids). Difficulty follows time-based `PHASES` / `MODS` in [src/config.ts](src/config.ts). The run starts with the PAC-3 and the radar, and perimeter pads go on a ring (`PERIM_R`, `PAD_SLOTS`).
- `npm test` ([src/sim.check.ts](src/sim.check.ts)) and `npm run balance` ([src/balance.ts](src/balance.ts)) must keep working. Both will need new cases.

## Open decisions (ask first, or use the defaults)
1. **Levels: separate missions or one continuous run?** Default: **one continuous run split into levels.** Each level is a set of waves ending in a raid, followed by a short **build window** (about 20 s, spawns off). This keeps the endless log-scaling and the daily op.
2. **Does the radar exist at the start?** Default: **no.** Level 1 has visual spotting only, at short range. The search radar is something you build. This changes the tagline "you can only engage what your radar has found" into "…what you can see", and the radar becomes your first big milestone.
3. **Does the front ever move?** Default: **it stays fixed** at the top of the default view (bearing 270° on the game's compass). An optional later step: a held level pushes the front back, giving more depth for the next level.
4. **Does the MG use ammo?** Default: **yes, belts that reload for free but slowly.** That way a second gun is a real upgrade, not just more DPS.

## 1. The front
*Done (steps 1–2).* The flank arc widens by level: SEAD ±60°, COORDINATED RAID ±120°, then 360°.
- The constants `FRONT` / `FRONT_ARC` (±25°) set the **front sector**. All bearing math already goes through `Math.atan2(z, x)` and `bearing()`, so this fits.
- **Front-only** threats: Mi-28, Su-34, Mi-8 EW, FPV and Lancet. (Decoys turned out to belong with the Shaheds: a decoy that could only come from the front would give away every Shahed from the flank.) FPV and Lancet are short-range weapons launched from the line, so it's realistic that they only come from the front.
- **Flanking** threats: Shahed long-range drones and their decoys, the new cruise missile (below) and Iskander. They get a per-level **exposure arc** that widens around the front as you level up (±25° → ±60° → ±120° → 360°).
- ARMs keep launching from their Su-34, so they come from the front too.
- One function decides every bearing. It replaces all `rand() * TAU` calls in `spawn()`:
  ```ts
  spawnBearing(t, kinds, r) // FRONT ± FRONT_ARC, or FRONT ± flankArc(t) when every kind is long-range
  ```
  Enemy types that can come round the flanks carry `flank: true` in `ENEMIES`. One draw per bearing keeps the seeded streams in step.
- Mi-8 jammers no longer circle the battery. They hold station on their own bearing, out on the front.
- Raids and packages take their bearing from their **lead element**. A helo assault comes from the front; a Shahed wave or missile salvo can come from a flank. The briefing card and edge arrow already show the sector, which matters even more now.

## 2. Start small: the AA machine gun
*Done (step 3).* The MG is a perimeter pad (`mg`): 1.5 dmg, 6 shots/s, 15 m, a 40-round belt with a 3 s reload, and no interceptor stock. Eyes: 18 m round the base, 15 m round every emplacement (x0.6 at night), always on, radar or not. The opening levels spawn slower (`rate` in `LEVELS`: 0.45, 0.6, 0.8), so guns alone can hold them.
- New weapon `mg` (**12.7 mm AA MG**): short range (about 14 m), high rate, low damage, belt ammo. It aims at **visual contacts** and needs no lock slot.
- **Visual spotting** replaces the radar at the start: anything inside `VISUAL_R` (about 18 m) is seen. Night Raid shrinks that range, which gives the condition real meaning early on.
- The starting kit is **one MG emplacement placed on the front**, the command post and nothing else.
- Level 1 threats: slow Shaheds and Lancets, straight in from the front, in small numbers. Level 1 is the tutorial.

## 3. Build the line as you level
The ring of pads becomes a **front-facing layout**, with emplacement slots in three belts along the front axis plus a few inner slots for all-round cover:

| Belt          | Depth toward front | Fits                              |
|---------------|--------------------|-----------------------------------|
| Forward line  | 25–35 m            | guns, spotters, jammers           |
| Main line     | 12–20 m            | guns, MANPADS, SHORAD             |
| Inner / point | 11 m, all round    | C-RAM, point defense for flanks   |

Every slot is fixed, so placement stays a click and it's still deterministic for the daily op. The forward line sees and kills earlier but is **exposed**: flanking missiles can target emplacements, not just the base (from about L5).

**Unlock ladder.** Base level unlocks the next tier; credits buy it. The current upgrades keep working as stat upgrades on top.

| Level | Unlocks                                           | Answers                                   |
|-------|---------------------------------------------------|-------------------------------------------|
| 1     | 12.7 mm AA MG                                     | slow drones from the front                |
| 2     | second MG slot, ZU-23 twin autocannon             | FPV packs, Lancets                        |
| 3     | forward observer post (+visual range on its belt), Stinger team, **search radar**, then **Patriot PAC-3** | Mi-28s outranging the guns; contacts beyond sight |
| 4     | EW jammer                                         | jammers, first flank Shaheds              |
| 5     | MANTIS C-RAM upgrades, IRIS-T SLM                 | flank drones, cruise missiles             |
| 7+    | LTAMDS AESA (360°), HEL laser, HPM                | saturation from every side                |

- *Step 3 changed the ladder:* the radar and the Patriot are shop items (`RADAR_REQ` = `PAC3_REQ` = base level 3, 200 and 300 credits; the Patriot needs the radar). In the bot runs, a radar bought a base level before anything could shoot on its locks was dead weight and got the battery killed, so the Patriot now comes right after it. Power and sensor/fire-control upgrades need the radar, and the magazine needs the Patriot, so the early shop only offers what helps then. The same goes for perks (`need`). SENSOR NET is now the classic start (radar + Patriot).
- The radar arriving around threat level 3–4 lines up with the **first threats from off the front axis**. That's where FOCUSED mode (front) versus ACTIVE (all round) becomes a real choice, and it gives the AESA a clear job: covering all directions.
- The ECS/lock and power systems only switch on once the radar is built. Before that, the HUD shows just what's relevant (HP, ammo, visual contacts), which also makes onboarding easier.

## 3b. Placement: making the slots a base-building decision
*Mostly done (step 4).* This section describes what's built. **Still open:** the tier-3 branch choice and terrain tags (see the end of this section). The power node moved to step 7+, with the laser and HPM it serves.

Placement has to be a real choice with a cost: where you put a unit decides what it covers, what it risks and what it boosts. It must also stay readable and deterministic.

**Slots and belts.** 16 fixed slots (`SLOTS`) on three belts, each opening at a base level. Placing stays a click and the daily op stays deterministic.

| Belt          | Radius | Slots                            |
|---------------|--------|----------------------------------|
| Forward line  | 30 m   | 0°, ±15°, ±30° off the front     |
| Main line     | 17 m   | 0°, ±25°, ±50°                   |
| Inner ring    | 11 m   | 0°, ±90°, ±150°, 180° (all round) |

| Level | Opens                                                        |
|-------|--------------------------------------------------------------|
| 1     | main 0° and inner 0°: a line in depth on the front axis, so the two MGs' fields of fire overlap and level 1 teaches crossfire. (Two main-line slots were tried: a front-facing MG there only engages from 32 m to 17 m out, and the bots died before they could afford the radar.) |
| 2     | main ±25°, forward 0°                                        |
| 3     | forward ±15°                                                 |
| 4     | inner ±90°, ±150° (the flanks open up)                       |
| 5–9   | one per level: main −50°, inner 180°, forward −30°, forward 30°, main 50° |

There is no separate support slot: observer posts and ammo points take the same slots as guns, so every support unit is a gun you didn't place. That's the tall-or-wide trade-off on the support side.

**Fields of fire.** Each gun covers a fan from its slot, pointing away from the base (`FANS`, half-widths): MG 120°, Stinger 180°, MANTIS all round. A gun only shoots inside its fan and range (`covers()`). Fans are drawn on the ground, dim, and bright for the unit you picked.
- **Crossfire:** a target inside another working gun's fan too takes +20% damage (`CROSSFIRE`). A line of guns covering each other beats the same guns spread out.
- **Gaps:** bearings of the current threat arc that no working gun covers 22 m out show as amber ticks on the mini radar rim.
- **Coverage overlay (`O`):** toggles a map of all fans on the ground. Ground no gun covers inside the threat arc is shaded amber, ground one gun covers is dim green, and crossfire ground is bright green.

**Support units** don't shoot; they boost the guns around them, which is what makes a layout into a base:

| Support       | Effect                                                          | Why you place it carefully                 |
|---------------|-----------------------------------------------------------------|--------------------------------------------|
| Observer post | sees 28 m round itself (`OBSERVER_EYES`), for every gun; a gun's own eyes reach 15 m | forward = sees sooner, but exposed |
| Ammo point    | guns within 10 m: +25% fire rate, belts reload twice as fast    | forward guns reload 50% slower without one |

**Depth trade-off.**
- **Forward line:** engages earliest and gets crossfire on the front axis. Belts reload 50% slower unless an ammo point is within reach. FPVs and Lancets that pass within 3 m of a forward unit dive on it instead of the base.
- **Main line:** balanced, and the natural spot for ammo points.
- **Inner ring:** safest and covers all round. It engages late, which is what you want against flank missiles. Dives only hit the forward line: Lancets are most of level 1, and diving on the starting MG knocked out the whole defense.

**Unit HP and repair.** Units have 30 HP. At 0 they're *down* (no fire, eyes or support, not destroyed) until repaired to half, at 0.5 HP/s in combat and at once in the build window. *Step 5:* cruise missiles pick the unit with the highest value instead of the base, so a strong forward line needs point defense behind it.

**Tall or wide.** The MG upgrades in its slot: **12.7 mm MG → twin 12.7 mm (110) → ZU-23-2 (240)**, and each tier counts toward base level. MANTIS is its own unit, not an MG tier. You choose between upgrading what you have and filling more slots.

**Moving and selling.** Click a unit to pick it. In the build window, selling refunds in full and moving is free. In combat, selling refunds 50% and moving takes the unit offline for 5 s while it relocates.

**Placement UX.**
- While placing, the free slots are marked and the best one pulses. Auto-place (after 8 s) and the balance bot pick it with the same function, `bestSlot(s, kind)`, so the bots test real layouts.
- `bestSlot()` scores **bearings, not area**: a bearing of the threat arc it newly covers is worth 1, crossfire on a covered one 0.3. (Area scoring picked slots next to the existing guns instead of the open flank.) Support units score by the guns they'd serve.

**Still open.**
- **Tier-3 branch.** At ZU-23, pick a branch: *AP rounds* (more damage, for Mi-28s) or *high rate* (for swarms). Only worth it once the Mi-28 and swarm levels play differently enough to make the choice real.
- **Terrain tags (optional).** A few slots per map get a fixed tag. **Ridge:** +20% range, but drones go for it first. **Treeline:** never targeted, −15% range. **Road:** half the build cost and fast resupply. These add a lot of balance surface, so they wait until after step 6.
- **Power node** (moved to step 7+): the laser and HPM draw power only within its reach, which decides where the energy weapons can go.

## 4. Threats per level
Replaces the time-based `PHASES`. Each level sets the spawn weights, the exposure arc and the raid pool.

| Level | New                                                | Directions                     |
|-------|----------------------------------------------------|--------------------------------|
| 1     | Shahed, Lancet (few, slow)                         | front only                     |
| 2     | FPV swarms                                         | front only                     |
| 3     | Mi-28, decoys                                      | front only                     |
| 4     | long-range Shahed from the flanks                  | front + ±60°                   |
| 5     | **cruise missile** (new: Kh-101, low and fast, low signature, weaves), Mi-8 EW | front + ±120° |
| 6     | Su-34 + ARMs (front), Iskander                     | front + ±120°                  |
| 7+    | the current conditions (NIGHT RAID, SWARM TIDE…) loop on top | missiles and drones from 360° |

- **Rule:** every off-axis attack is **telegraphed**, with a launch warning and bearing (the ARM/Iskander events already work this way). The player should lose because their cover had gaps, not because of a surprise.
- Flank attacks get their own seeded stream (like `raidRng` and `strikeRng`), so the daily op stays identical for everyone.

## 5. Map and HUD
- **Ground:** a front band at the arena edge on the front bearing (the "FEBA") with enemy territory shaded, and the belts drawn as dim dashed arcs. It all fits the green monochrome look.
- **Mini radar:** the front sector marked, the current exposure arc outlined, and flank warnings drawn at the rim.
- **Level card** at the end of each level: held or lost, what unlocks next, and a note on new directions ("MISSILES MAY NOW COME FROM ±60°").
- **Build window:** a slow-motion "BUILD" state with the shop open and the slots highlighted.

## 6. Code changes (where)
- `config.ts`:
  - `FRONT`, `VISUAL_R`, `route` on `ENEMIES`;
  - a new `LEVELS` table (weights, exposure arc, raid pool, unlocks) replacing `PHASES`;
  - the `mg` / `zu23` / `iris-slm` weapons and the new `cruise` enemy;
  - `SLOTS` (belt, bearing, radius, terrain tag, level it opens) replacing `PAD_SLOTS` / `PERIM_R`;
  - `FANS` per unit kind, `SUPPORT` effects, and the unit tier trees;
  - unlock requirements on `UPGRADES` via `req`, which already exists.
- `sim.ts`:
  - `spawnBearing()`;
  - level state and the build window;
  - visual detection for when there's no radar (a `hasRadar` flag, with `radar()` / `track()` skipped until it's built);
  - emplacements as targets for missiles;
  - placing a pad now means picking a slot on a belt: fans and crossfire in targeting, support auras, unit HP and repair, `bestSlot()`;
- `render.ts` / `hud.ts`: the front band, belts and exposure arc, the level card, and hiding radar/ECS UI until the radar is built.
- `sim.check.ts`: front-only kinds always spawn within `FRONT ± arc`; flank kinds stay within the level's exposure; nothing off-axis before L4; the same seed gives the same bearings.
- `balance.ts`: the bots build the line in unlock order. Report survival per level instead of per phase.

## Order
Keep the game runnable after each step.
1. ~~`FRONT` + `flank` + `spawnBearing()`, with the flank arc widening by phase.~~ **Done.** Also: jammers hold the front, the front is drawn on the ground and the mini radar rim, and there's a front/flank spawn check in `npm test`.
2. ~~The `LEVELS` table replacing `PHASES`, with widening exposure arcs.~~ **Done.** Each level is `LEVEL_LEN` (60 s) of waves, then its raid, then a build window with no spawns (20 s held / 8 s lost, which replaces the old recovery lull and "next raid sooner"). Strike packages come once per level from SEAD on. Packages and raids unlock by level, and raid size goes by level (`raidScale`). The wave stream is reseeded per level, so each level of a daily op sends the same things however long earlier levels took. The balance script reports the level reached. Still to do in step 6: the level card and the slow-motion build state.
3. ~~The AA MG and visual spotting, with the radar and Patriot moved to the unlock ladder.~~ **Done.** See sections 2 and 3. Balance (`npm run balance -- 12 900`): STANDARD median 5:02, reaching level 4 (it was 4:06 / L3 after step 2); FORTRESS (−15% fire rate) comes out weak with gun-heavy starts.
4. ~~Belt slots replacing the ring (section 3b), in this order: slots + fans + crossfire + `bestSlot()`, then support units, then unit HP, then tier upgrades in place. After that, the new emplacements (ZU-23, IRIS-T SLM).~~ **Done**, except the IRIS-T SLM (moved to step 5, with the cruise missile it answers) and the open items at the end of 3b. The coverage overlay (`O`) came after. The ZU-23 is the MG's top tier. Balance: STANDARD median 4:52, reaching level 4 (5:02 before).
5. The cruise missile and missiles that target emplacements.
6. Map, mini radar, level card and build window. Then rebalance with `npm run balance`.

## Done when
- In levels 1–3 everything arrives from the front, and a single MG then a small line can hold it.
- From level 4, missiles and drones arrive off-axis with warning, and manned aircraft never do.
- The radar and Patriot feel like earned milestones, not the starting kit.
- `npm test`, `npm run build` and the daily op's determinism still hold.
