# X5 Commander — crisp plan

Minimal polygon tower defense in the browser. One base in the middle, endless escalating swarm,
radar decides what you can shoot. `npm run dev` and play.

**Loop:** SCAN → DETECT → LOCK → ENGAGE → DESTROY → EARN → UPGRADE → EXPAND → harder swarm → repeat.
**Tension:** see vs. shoot vs. build — radar, power and ammo all compete.

## Stack
TypeScript + Vite + Three.js. No backend, no assets, no physics, no UI framework. LocalStorage for highscore.

## Files (7, not 40)
```
index.html
src/config.ts   every number: enemies, upgrades, perks, difficulty, costs
src/sim.ts      pure game state + update(dt). No Three.js → testable in node
src/render.ts   Three.js scene synced from state (InstancedMesh per enemy type, pooled FX)
src/hud.ts      DOM HUD (throttled 10 Hz), canvas mini-radar, upgrade panel, overlays
src/sfx.ts      WebAudio beeps, no files
src/main.ts     boot, loop, input
src/sim.check.ts  `npm test` — headless sim self-check with asserts
```
Rule: sim never touches rendering; render only reads state.

## Core rules
- **Radar**: rotating sweep. Enemy in range + sweep crosses it → detected (chance = signature × resolution).
  Detection fades after `persistence` s. Undetected enemies are **invisible** and **can't be shot**.
- **Tracking**: up to `maxTargets` detected enemies get locked; locks never fade while inside tracking range.
- **Targeting**: click a contact → manual priority. Otherwise auto mode (`T` cycles: closest / lowest HP /
  highest reward / fastest; modes unlock via upgrade).
- **Weapons** (all auto-fire at locked targets):
  cannon (ammo, lead-aimed shell) · pulse (power, instant beam) · missile (ammo, homing, splash) · rail (big power, pierces the whole line).
- **Power**: generated/s into a pool. Radar drains continuously, pulse/rail per shot, ammo production per round.
  Short on power → radar sweep slows. That's the tradeoff.
- **Credits** per kill → upgrades. Cost = `base * mult^level`. Upgrades are data; stats are *derived* from
  levels by one function (no apply-callbacks).
- **Base level** = f(total upgrades bought). Every base level adds visible geometry (power core, ammo racks,
  radar mast, weapon mounts, shield ring, command ring) **and offers a perk: pick 1 of 3**, each with a tradeoff.
- **Difficulty**: continuous `d(t)`; spawn rate, HP, speed, damage all scale. Phases every 75 s shift the
  enemy mix (scouts/drones → swarms → tanks → elites → everything). Every 150 s: `HEAVY CONTACT` elite event.
- Enemy touches base → damage, dies. Base HP ≤ 0 → game over, highscore saved.

## Enemies
| type  | HP | speed | dmg | reward | note |
|-------|----|-------|-----|--------|------|
| scout | 1  | 4     | 1   | 1      | fast, low signature |
| drone | 2  | 2     | 2   | 2      | standard |
| swarm | 1  | 3     | 1   | 1      | spawns in packs of 8 |
| tank  | 5  | 1     | 4   | 5      | big signature |
| elite | 5  | 3     | 5   | 7      | shows up with a warning |

## Upgrades (18, 6 groups)
BASE armor/hp/repair · POWER gen/storage · RADAR range/speed/resolution/persistence ·
TRACKING targets/range · WEAPONS damage/rate + unlock pulse/missile/rail · AMMO capacity/production.
Shop is an always-visible side panel (`Tab` hides it) — no modal, buy mid-fight with one click.

## Fun / juice (cheap, high value)
Screen shake on base hit · triangle-shard explosions (pooled) · beam flashes · lock rings and lock lines ·
radar blips · WebAudio sfx (`M` mute) · warning banner · perk draft on level-up · combo counter for fast kills (credit bonus).

## Controls
Left click: mark target · Wheel: zoom · Right drag / Q E: rotate camera · Tab: toggle shop · T: target mode ·
P/Esc: pause · M: mute · 1-3: pick perk · R: restart after game over.

## Performance
InstancedMesh for enemies, projectiles, shards. Pools everywhere, no per-frame allocation of meshes or DOM.
Target: 500+ enemies at 60 fps.

## Done when
Playable end-to-end: spawn → detect → lock → shoot → credits → upgrade → base grows → perks → game over → restart,
with hundreds of enemies on screen and `npm test` + `npm run build` green.

## Later (not now)
Meta progression, achievements, multiple arenas, boss enemies, run modifiers, music.
