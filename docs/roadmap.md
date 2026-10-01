# Roadmap

## Shipped
- **MVP:** the core loop (detect → lock → shoot → credits → upgrade → base level → perks (now the command tree) → game over), the upgrade shop, juice and sound, 2,000 pooled enemy instances.
- **Green radar look:** wireframe models over a polar grid with a CRT pass. Replaced by the terrain view (below); it's in git history.
- **Terrain and free building:** a fixed map (`terrain.ts`: river, woods, ponds, rock outcrops, roads, fields, hills) drawn as a lit 3D scene with shadows, trees and a day / night grade; solid vehicle and aircraft models flying at their own heights; an RTS camera (pan, rotate, zoom, minimap to jump); units built anywhere on open ground in a build zone that grows with the base, with a ghost that previews coverage.
- **Onboarding and balance pass:** start screen matches the one-gun start; shop puts PERIMETER first before the radar, folds away what needs the radar or Patriot, and suggests a gun while unit slots are free; the balance bot builds and places units like a player; the first Su-34 strike carries one bomb; a late-game surge so every run ends; the debrief shows what hurt the battery.
- **Random maps:** every run's terrain is generated from its seed (`terrain.ts` `setMap`), with the layout rules checked in `npm test`.
- **Tactical look on the terrain:** the green phosphor HUD is back (monospace, corner-bracket frames, scanlines) over the terrain, which gets a part-green tactical grade and a faint range / bearing grid; NIGHT RAID turns it into a night-vision scope. Phones and tablets get a lighter pipeline (no real-time shadows or bloom, smaller ground texture, capped pixel ratio), and a WebGL failure shows a message instead of a blank page.
- **Front line, steps 1–5:** the front and widening flank arcs, levels with raids and build windows, the AA MG start with the radar and Patriot as milestones, belt slots with fields of fire, crossfire, support units and unit HP, the coverage overlay (`O`), and Kh-101 cruise missiles with the IRIS-T SLM to stop them.
- **Threat realism:** Orlan-10 spotter, Ka-52, Su-25 attack runs with S-8 rockets, Su-35S SEAD with memory-seeker Kh-58s, Kinzhal and the Kh-55 decoy; per-type height, RCS and heat signature, a radar horizon by height, FPV swarms that hunt isolated units, and salvage that stays until clicked.
- **Defence layers:** reaches in the real order (HPM 7, MG 10, HEL 11, MANTIS 15, Stinger 24, IRIS-T SLM 40, SLX 50, PAC-3 58, radar 68 m) on a 75 m arena; the laser and HPM are self-cueing point defence; a two-gun start with crossing fields of fire.
- **Ground assault:** a second mode (`A` on the start screen): robot swarms on foot that only the perimeter can engage, five new perimeter defenses (concertina wire, Claymores, Mk 19, Javelin, M120 mortar), its own levels, raids and records, and a HUD without the radar and fire-control controls.
- **Ground assault as a front-line tower defence:** one front (north), a build band in front of a walled base, MK II / III upgrades and AMMO / SENSOR / KIT fittings on every gun, four new perimeter units (XM813 30 mm, LOCUST laser, Leonidas HPM, Hydra-70 rocket pod), five new walkers each modelled on a real prototype (mini-walker, robot dog, breacher, mortar walker, siege walker), THE TIDE of a thousand walkers every fifth level, and `H`, a horde test that goes straight to it. `npm run bench` times the tide too.
- **Performance pass:** a fixed 1/60 s sim step, throttled HUD text, lighter effects on LITE, bloom that switches itself off under slow frames, and `npm run bench` with p95 and worst-case timings.

## Next: finish the front line (step 6)
- [x] **Level card** at the end of each level: held or lost, what the next level brings, wider flank arcs.
- [x] **Build window as its own state:** 60% speed, shop open, the build zone highlighted, `N` to skip it. Missile launches flash at their bearing on the minimap.
- [ ] **Map polish:** draw the belts as dim dashed arcs and shade enemy territory beyond the front.
- [x] **Rebalance:** levels follow the threat sequence (FPVs, helicopters, flanks, cruise and EW, then SEAD; the Su-34 at level 4 was a wall about 60 s after the Patriot came online).
- [x] **Perks → command tree:** a radial skill tree (OFFENSE / DEFENSE / SYSTEMS) with the old perks as keystones. `npm run balance` with the bots aiming at each keystone in turn: all within about ±15% of a travel-nodes-only run.

## Placement extras
- [ ] **Tier-3 branch** for guns: at the ZU-23 (the MG's top tier; MANTIS is its own unit), pick *AP rounds* against Mi-28s or *high rate* against swarms.
- [ ] **Power node** (with the energy weapons, level 7+): laser and HPM draw power only within its reach, so it decides where they can go.
- [x] **Terrain that fights:** *high ground* by rock outcrops (+20% range and eyes, drones and cruise missiles go for it), *treeline* edge (never targeted, −15% range), *road* (fast MG reloads). Half build cost on the road was dropped: roads run through the build zone and out toward the front, so it would have halved the price of much of the gun line.
- [ ] **Terrain that blocks:** woods or ridges that block eyesight.
- [ ] **Base buildings as units:** build the generator, ammo bunker, radar and launchers on their own spots instead of in a fixed compound.

## Later ideas
- A front that moves back after a held level, giving more depth for the next one.
- Achievements, more arenas.
