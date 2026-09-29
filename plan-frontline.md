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
| Inner / point | 5–8 m, all round   | C-RAM, point defense for flanks   |

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
*Mostly done (step 4).* In: belts and slots (`SLOTS`), fields of fire (`FANS`), crossfire, `bestSlot()` for auto-place and the bots, gap ticks on the mini radar, the observer post and ammo point, unit HP with forward-line dives and repairs, MG → twin MG → ZU-23 in place, and selling and moving. Not yet: the tier-3 branch choice, terrain tags, the coverage overlay key, and the power node. Changes from the text below:
- **Level 1's two slots** are a main-line and an inner slot on the front axis. With both on the main line, a front-facing MG only engages from 32 m to 17 m out (it can't shoot what has flown past), and the bots died before they could afford the radar. In depth, the two fields of fire overlap, so level 1 teaches crossfire.
- **Dives only hit the forward line.** Lancets are most of level 1, and diving on the starting MG knocked out the whole defense.
- **`bestSlot()` scores bearings, not area:** a bearing of the threat arc it newly covers is worth 1, crossfire on a covered one 0.3. Area scoring picked slots next to the existing guns instead of the open flank.
Placement has to be a real choice with a cost: where you put a unit decides what it covers, what it risks and what it boosts. It must also stay readable and deterministic.

**Fields of fire.** Each unit covers a fan from its slot, not a circle. A gun fan is 120°, MANPADS 180°, and C-RAM and SAMs cover all round. It points away from the base by default. Placement is about **overlap**:
- **Crossfire:** a target inside two or more fans takes +20% damage from all of them. A line of guns covering each other beats the same guns spread out.
- **Gaps:** bearings nothing covers show as amber gaps on the mini radar rim. From level 4 the flank arc turns gaps into the thing to fix.

**Support units** do no damage themselves but boost the units around them. This is what makes a layout into a base:

| Support       | Effect on units within ~10 m                                  | Why you place it carefully                    |
|---------------|---------------------------------------------------------------|-----------------------------------------------|
| Observer post | +40% spotting range before the radar; +detection chance after | forward = sees sooner, but exposed            |
| Ammo point    | +50% reload / belt refill                                     | forward units starve without one nearby       |
| Power node    | laser and HPM draw power only in its reach (step 7+)          | decides where the energy weapons can go       |

**Depth trade-off.** Each belt gives something and costs something:
- **Forward line:** engages earliest and gets crossfire on the front axis. Resupply is slow unless an ammo point is near. FPVs and Lancets that pass within 3 m of a unit dive on it instead of the base.
- **Main line:** balanced, and the natural spot for ammo points.
- **Inner ring:** safest and covers all round. It engages late, which is what you want against flank missiles.

**Unit HP and repair.** Units have HP. At 0 they're *disabled* (not destroyed) until repaired: slowly during combat, instantly in the build window. From L5, cruise missiles pick the unit with the highest value instead of the base, so a strong forward line needs point defense behind it.

**Tall or wide.** Every unit can be upgraded in its slot, e.g. **MG → twin MG → ZU-23 → MANTIS** (tier 3 picks a branch such as *AP rounds* against Mi-28s or *high rate* against swarms). You choose between upgrading what you have and filling more slots, and one upgraded unit is better than two weak ones only where fans overlap.

**Terrain tags (optional).** A few slots per map have a fixed tag. **Ridge:** +20% range, but drones go for it first. **Treeline:** never targeted, −15% range. **Road:** half the build cost and fast resupply. These give each layout a character without new systems.

**Moving units.** In the build window, move and sell (full refund) freely. In combat, selling refunds 50%, and moving takes the unit offline for 5 s while it relocates.

**Placement UX.**
- While placing, each free slot previews the fan it would add and how much uncovered threat arc it closes. The best slot pulses.
- Auto-place (after 8 s) and the balance bot both pick that best slot with the same function (`bestSlot(s, kind)`), so the bots test real layouts.
- A coverage overlay (`O`) shows all fans, overlaps and gaps.

**Slot unlocks by level:**

| Level | Opens                                              |
|-------|----------------------------------------------------|
| 1     | 2 main-line slots (one holds the MG)               |
| 2     | +1 main, 2 forward                                 |
| 3     | +1 forward, 1 support slot                         |
| 4     | 4 inner-ring slots (the flanks open up)            |
| 5+    | +1 per level, alternating forward and inner, up to 16 |

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
4. ~~Belt slots replacing the ring (section 3b), in this order: slots + fans + crossfire + `bestSlot()`, then support units, then unit HP, then tier upgrades in place. After that, the new emplacements (ZU-23, IRIS-T SLM).~~ **Done**, except the IRIS-T SLM (moved to step 5, with the cruise missile it answers) and the 3b extras listed there. The ZU-23 is the MG's top tier. Balance: STANDARD median 4:52, reaching level 4 (5:02 before).
5. The cruise missile and missiles that target emplacements.
6. Map, mini radar, level card and build window. Then rebalance with `npm run balance`.

## Done when
- In levels 1–3 everything arrives from the front, and a single MG then a small line can hold it.
- From level 4, missiles and drones arrive off-axis with warning, and manned aircraft never do.
- The radar and Patriot feel like earned milestones, not the starting kit.
- `npm test`, `npm run build` and the daily op's determinism still hold.
