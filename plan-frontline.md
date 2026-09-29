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
3. **Does the front ever move?** Default: **it stays fixed** (north, 000°). An optional later step: a held level pushes the front back, giving more depth for the next level.
4. **Does the MG use ammo?** Default: **yes, belts that reload for free but slowly.** That way a second gun is a real upgrade, not just more DPS.

## 1. The front
- A new constant `FRONT = { bearing: 90°, arc: 25° }` sets the **front sector** (±25°). All bearing math already goes through `Math.atan2(z, x)` and `bearing()`, so this fits.
- **Front-only** threats: Mi-28, Su-34, Mi-8 EW, decoys, FPV and Lancet. FPV and Lancet are short-range weapons launched from the line, so it's realistic that they only come from the front.
- **Flanking** threats: Shahed long-range drones, the new cruise missile (below) and Iskander. They get a per-level **exposure arc** that widens around the front as you level up (±25° → ±60° → ±120° → 360°).
- ARMs keep launching from their Su-34, so they come from the front too.
- One function decides every bearing. It replaces all `rand() * TAU` calls in `spawn()`:
  ```ts
  spawnBearing(kind, level, rng) // front kinds: FRONT ± arc; flank kinds: FRONT ± exposure(level)
  ```
  Each enemy type gets `route: 'front' | 'flank'` in `ENEMIES`.
- Raids and packages take their bearing from their **lead element**. A helo assault comes from the front; a Shahed wave or missile salvo can come from a flank. The briefing card and edge arrow already show the sector, which matters even more now.

## 2. Start small: the AA machine gun
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
| 3     | forward observer post (+visual range on its belt), Stinger team | Mi-28s outranging the guns  |
| 4     | **search radar** (sweep, detection, locks, radar modes) | contacts beyond sight, first flank Shaheds |
| 5     | MANTIS C-RAM, EW jammer, IRIS-T SLM               | flank drones, cruise missiles, jammers    |
| 6     | **Patriot PAC-3**                                 | Su-34s, Iskander (still PAC-3 only)       |
| 7+    | LTAMDS AESA (360°), HEL laser, HPM                | saturation from every side                |

- The radar arriving at L4 is timed with the **first threats from off the front axis**. That's where FOCUSED mode (front) versus ACTIVE (all round) becomes a real choice, and it gives the AESA a clear job: covering all directions.
- The ECS/lock and power systems only switch on once the radar is built. Before that, the HUD shows just what's relevant (HP, ammo, visual contacts), which also makes onboarding easier.

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
  - `SLOTS` (belt positions) replacing `PAD_SLOTS` / `PERIM_R`;
  - unlock requirements on `UPGRADES` via `req`, which already exists.
- `sim.ts`:
  - `spawnBearing()`;
  - level state and the build window;
  - visual detection for when there's no radar (a `hasRadar` flag, with `radar()` / `track()` skipped until it's built);
  - emplacements as targets for missiles;
  - placing a pad now means picking a slot on a belt.
- `render.ts` / `hud.ts`: the front band, belts and exposure arc, the level card, and hiding radar/ECS UI until the radar is built.
- `sim.check.ts`: front-only kinds always spawn within `FRONT ± arc`; flank kinds stay within the level's exposure; nothing off-axis before L4; the same seed gives the same bearings.
- `balance.ts`: the bots build the line in unlock order. Report survival per level instead of per phase.

## Order
Keep the game runnable after each step.
1. `FRONT` + `route` + `spawnBearing()`, with all threats from the front. This is the smallest change and already changes how the game feels.
2. The `LEVELS` table replacing `PHASES`, with widening exposure arcs.
3. The AA MG and visual spotting, with the radar and Patriot moved to the unlock ladder.
4. Belt slots replacing the ring, and the new emplacements (ZU-23, observer post, IRIS-T SLM).
5. The cruise missile and missiles that target emplacements.
6. Map, mini radar, level card and build window. Then rebalance with `npm run balance`.

## Done when
- In levels 1–3 everything arrives from the front, and a single MG then a small line can hold it.
- From level 4, missiles and drones arrive off-axis with warning, and manned aircraft never do.
- The radar and Patriot feel like earned milestones, not the starting kit.
- `npm test`, `npm run build` and the daily op's determinism still hold.
