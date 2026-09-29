# X5 Commander

A minimal browser tower defense game made from simple 3D shapes. You start with a single anti-aircraft machine gun and build it up into a Patriot air-defense battery against an endless, escalating raid of drones, helicopters and strike jets. You can only engage what you can see: by eye at first, by radar once you've built one.

System and threat names are real or announced systems, used for flavor only; the numbers are game balance, not real performance.

**SCAN → DETECT → LOCK → ENGAGE → DESTROY → EARN → UPGRADE → harder swarm → repeat**

## Installation

You need [Node.js](https://nodejs.org/) 23.6 or newer. `npm test` runs TypeScript directly with Node.

```sh
npm install
npm run dev      # start the dev server, then open the URL it prints (usually http://localhost:5173)
```

Other scripts:

| Command         | What it does                                              |
|-----------------|-----------------------------------------------------------|
| `npm run build` | Type-checks, then builds a static site into `dist/`        |
| `npm test`      | Runs a headless check of the game simulation in Node       |
| `npm run bench` | Times the simulation under a heavy swarm (e.g. `npm run bench -- 2000`) |
| `npm run balance [seeds] [cap-s]` | Bots play many seeded runs; median survival per doctrine and per perk |

The game runs entirely in the browser, with no backend and no asset files. `dist/` can be hosted on any static file server.

## Controls

| Input                  | Action                                    |
|------------------------|-------------------------------------------|
| Space / Enter          | Start game                                |
| Space (in play)        | Emergency intercept                       |
| G                      | Cycle fire discipline: CONSERVE / BALANCED / MAXIMUM |
| D                      | Start today's daily op                    |
| Left click             | Place a bought pad; pick one of your units (click a free slot to move it); otherwise mark a contact as the priority target (needs the radar) |
| U / Delete             | Upgrade / sell the unit you picked         |
| Mouse wheel            | Zoom                                      |
| Right-drag / Q / E     | Rotate camera                             |
| Tab                    | Show / hide the upgrade shop              |
| T                      | Cycle the auto-targeting mode             |
| V                      | Cycle radar mode: ACTIVE / FOCUSED / LPI  |
| F                      | EMCON: silence the radar (toggle)         |
| 1 / 2 / 3              | Pick a perk when the base levels up       |
| 1 – 4 (start screen)   | Pick a doctrine                           |
| P / Esc                | Pause                                     |
| O                      | Coverage map: gaps, single cover and crossfire on the ground (toggle) |
| X                      | 2× speed (toggle)                         |
| M                      | Mute                                      |
| C                      | Copy your result line after game over     |
| R                      | Restart after game over                   |

The game pauses by itself when the window loses focus.

**Touch screens:** tap marks a contact or places a pad, one-finger drag rotates, pinch zooms. Phones get a compact HUD: a thin HP / power / missile strip top-left with toggles for the mini radar and the details list (remembered between runs) plus 2× and pause, and an icon bar at the bottom for shop, intercept, fire discipline, scan mode, EMCON and targeting mode, each showing its current setting.

The first time you meet each threat or mechanic, a short tip explains it. Tips don't come back once you've seen them.

## Gameplay

### Reading the HUD
- **Left panel:** battery, power and interceptor bars (with net flow per second), then three groups: SENSORS (radar mode, radar state, range, tracks), FIRE CONTROL (locks in use with a bar, fire discipline, target mode, intercept readiness) and BATTERY (pads, raid state, build window). The top bar shows the level you're on.
- **Threat board (top right):** what's on the scope by type, and the 4 most urgent contacts (damage they'd do over time to impact). Amber means dangerous now; ◆ means locked.
- **Shop:** the row marked ◆ in amber is the suggested buy for the current bottleneck: interceptors when the magazine runs low, generator when power starves the radar, hull when HP is low, ECS channels when contacts wait for a lock.

### Starting out: one gun and your eyes
A run starts with a command post and one **12.7 mm AA machine gun**, dug in on the front. There is no radar and no Patriot yet:
- **Eyesight:** anything within 18 m of the base, or 15 m of an emplacement, is seen, radar or not. NIGHT RAID cuts that to 60%. Guns placed further out see further.
- **The MG** fires by itself at whatever it can see within 15 m. It feeds from its own 40-round belt, not the interceptor stock, and takes 3 s to reload when the belt runs dry.
- **What's off without a radar:** locks, the priority target, radar modes, EMCON and the emergency intercept. ARMs have nothing to home on.
- **The shop** only offers what helps before the radar: guns and pads, hull, damage and fire rate. Power, sensors and fire control need the radar; the magazine needs the Patriot.
- **Milestones:** from base level 3 you can buy the **AN/MPQ-65 radar** (search and fire control), then the **PAC-3 MSE battery** (the Patriot, which needs the radar). Radar and Patriot perks only turn up in drafts once you have them.

### Radar decides everything
Once it's built, a rotating radar sweep reveals enemies within its range (until you buy the AESA, below). Each time the sweep passes over an enemy, there's a chance it gets detected. The chance depends on the enemy's signature and your radar resolution. **Undetected enemies are invisible and can't be shot.** A detected contact fades again after the radar's *persistence* time runs out.

### LTAMDS AESA
A rotating radar can take at most 8 levels of *Scan Rate*. From base level 4 you can buy **LTAMDS AESA**, a staring array that covers all directions at once. It gives every contact the same number of looks a sweep would, at random moments. This adds +25% scan rate and removes the Scan Rate cap. The spinning sweep is replaced by faint beam flashes and a blip each time a contact is detected again, so the screen stays readable however fast you scan.

### Radar threats and EMCON
The enemy fights your radar, not just your base.
- **The HUD shows the radar's state.** Knocked out: the whole screen goes to static with rolling bars and drained colour, the frames turn red, the mini radar shows NO RADAR, and a red countdown reads RADAR DOWN, NO FIRE CONTROL. EMCON gets a quieter amber banner. Red is kept for the worst states only: radar knocked out and battery critical.
- **Anti-radiation missiles (Kh-31P)** home on a radiating radar. Su-34s launch them once they're in range, and from the SEAD level they arrive in salvos. A hit takes the radar **offline for 6 s** (repeated hits stack up to 12 s). You get warning: every launch sounds the radar-warning tone and shows its bearing.
- **EMCON (`F`)** stops the radar transmitting. Inbound ARMs lose the emitter and veer off, the radar stops draining power, but fire control drops every lock and contacts coast on track memory. Go silent early: an ARM that's already close still hits.
- **Radar modes (`V`)**, each a trade-off. EMCON works on top of any of them.

  | Mode    | Detection                                          | Power drain | ARM exposure |
  |---------|----------------------------------------------------|-------------|--------------|
  | ACTIVE  | all round                                          | ×1          | normal       |
  | FOCUSED | a 120° arc on the bearing you last clicked (or your priority target): +30% range, +30% chance, about 3× the revisit rate. Blind everywhere else. LTAMDS AESA widens the arc to 180°. | ×1.4 | high: Su-34s launch from 25% further out, 30% more often |
  | LPI     | −15% range, −40% chance                            | ×0.6        | low: ARMs only find the radar inside 15 m, so most miss; Su-34s launch half as often |
- **Decoys (Gerbera)** look exactly like Shaheds. Fire control tells them apart once a decoy has been locked for about 1.5 s, then releases it. Until then they waste lock slots and interceptors. *GaN T/R Modules* shorten that time.
- **Jammer helicopters (Mi-8MTPR-1)** stop outside the battery and hold station on their bearing, out on the front. Inside the sector they cover, detection chance drops to about a third. You see the jammer's bearing as an amber strobe, not its range. The jammer itself shows up clearly on radar, so mark it and kill it.

### Locking and targeting
Detected enemies are locked, up to your number of **lock slots**. A lock holds as long as the enemy stays within tracking range. All weapons fire automatically at locked targets. Left-click a contact to mark it as the **priority target**: it always gets a lock slot, is engaged first and takes +25% damage, but painting it costs 1.2 power/s for as long as you hold it. Otherwise, the auto mode picks targets (`T` to cycle): **CLOSEST**, then **WEAKEST**, **RICHEST** and **FASTEST**, each unlocked by the *Target Logic* upgrade.

### Commands
- **Fire discipline (`G`)**: **CONSERVE** fires 25% slower, at 75% of weapon range, for 25% less ammo and power per shot. **BALANCED** is the default. **MAXIMUM** fires 40% faster and keeps firing until 1.6× a target's HP is in the air, for 30% more per shot.
- **Emergency intercept (`Space`)**: for 4 s every weapon, and every perimeter pad in reach, fires only at the priority target (or, with none marked, the visible threat nearest impact), 60% faster and past a sure kill. Costs 25 power and needs the radar up; 30 s cooldown.

### Weapons
| Weapon                   | Uses         | Notes                                                   |
|--------------------------|--------------|---------------------------------------------------------|
| 12.7 mm AA MG            | Its own belt | Fires at what it can see, no lock; you start with one (it's a perimeter pad) |
| PAC-3 MSE (Patriot)      | Interceptors | Hit-to-kill, leads moving targets; bought from base level 3, needs the radar |
| HEL 50 kW laser          | Power        | Instant, rapid beam                                     |
| IRIS-T SLX               | Interceptors | Homing, blast-frag splash; one extra launcher per level |
| Leonidas HPM (microwave) | Power        | Huge hit, affects everything along the line             |

### Perimeter defenses: building the line
Perimeter pads (units): **12.7 mm AA MGs** (from the start), **MANTIS 35mm C-RAM** (base level 2, fast gun, short range), **Stinger teams** (level 3, homing, mid range), **EW jammers** (level 4, slow nearby contacts, drain power), the **IRIS-T SLM** (level 5, needs the radar: a medium-range SAM, 30 m all round, that takes on missiles before anything else), and two support units from level 2: the **observer post** (sees 28 m round itself, for every gun) and the **ammo point** (guns within 10 m fire 25% faster and reload their belts twice as fast). Units engage any contact that can be seen, by eye or radar, inside their range and **field of fire**, without using a lock slot.

**Slots.** Units go on fixed slots in three belts facing the front, plus an inner ring. Base level 1 opens 2 slots in depth on the front axis (one holds the starting MG); more open with each base level, up to 16:

| Belt         | Distance | Trade-off                                                                                   |
|--------------|----------|---------------------------------------------------------------------------------------------|
| Forward line | 30 m     | engages first; belts reload 50% slower without an ammo point; FPVs that pass within 3 m dive on the unit (Lancets hunt units on every belt, within 5 m) |
| Main line    | 17 m     | balanced                                                                                    |
| Inner ring   | 11 m, all round | safe, covers the flanks, engages late                                                 |

**Fields of fire.** A gun covers a fan pointing away from the base, drawn on the ground: MGs 120°, Stingers 180°, MANTIS all round. It can't shoot what has flown past it. A target inside two guns' fields of fire takes **+20% crossfire damage** from both. Amber ticks on the mini radar rim mark bearings in the threat arc that no working gun covers. Press `O` (or the half-circle button on phones) for the coverage map: amber ground in the threat arc that nothing covers, dim green where one gun does, bright green where guns cross their fire.

**Placing.** After buying a unit, **click the map** to put it on the nearest free slot. The pulsing slot is the one that covers the most open sky (or, for support units, serves the most guns); if you don't click within 8 seconds, the unit goes there.

**Your units.** Click one to pick it: the card shows its range, damage, field of fire and HP.
- **Upgrade in place (`U`):** 12.7 mm MG → twin 12.7 mm → ZU-23-2 (more range). An upgrade counts as a purchase toward the base level.
- **Sell (`Delete`):** full refund in the build window, half in combat.
- **Move:** click a free slot. Free in the build window, 5 s offline in combat.

**Unit HP.** A unit that runs out of HP is **down**: no fire, no eyes, no support, until repairs bring it back to half. Repairs run all the time, and the build window repairs every unit at once.

### Power and ammo
Your generator fills a power pool, and everything draws on it in this order:
1. Fire control: 0.25/s for each lock held, plus 1.2/s while a priority target is marked.
2. The radar: ×1.4 in FOCUSED, ×0.6 in LPI, nothing in EMCON. **When power runs short, the radar sweep slows** (down to 25% speed), so you see less.
3. Interceptor production and Maintenance Crew repairs, from the surplus above 20% only.

Laser and HPM shots cost power as well. The power and interceptor bars show the net flow per second, so you can see which way the budget is going. Balancing seeing, shooting and building is the core tension of the game.

### Credits, upgrades and base levels
Kills earn credits. Killing quickly builds a **combo** worth up to +100% credits. There are 28 upgrades in 7 groups: BATTERY, POWER, SENSORS, FIRE CONTROL, WEAPONS, MAGAZINE and PERIMETER. Each upgrade costs more with every level. There is **no max level**, except for *Threat Evaluation*, the *radar*, the *PAC-3 battery* and *LTAMDS AESA*, which are on/off, and Scan Rate before the AESA. Earth Revetments have diminishing returns, up to 85% less damage taken. **Ranks:** every 5th level of an open-ended upgrade (not a pad) is a new rank and adds one free level on top. A bar under each shop row fills toward the next rank, and the buy that reaches it is marked ★. Every purchase shows what it bought, and the purchase sound climbs with the upgrade's level. The bar under BATTERY LV fills toward the next base level. Buying upgrades raises your **base level**, which adds visible structures to the base and offers a **perk draft: pick 1 of 3**. Every perk has a tradeoff, for example *GLASS CANNON*: +100% damage, −40% max HP. From base level 3, every draft also offers one **rule perk** (marked ★ NEW RULE) that changes how the battery plays, until you've taken them all. From level 3: *BLACKOUT PROTOCOL* (tracks coast twice as long when the radar goes dark, −30% memory while radiating), *COUNTER-SEAD* (each ARM shot down restores 20% power), *KILL CHAIN* (every 5 kills: +1 lock slot for 8 s), *OVERKILL* (damage past a kill jumps to the nearest contact within 8 m) and *LAST STAND* (below 25% HP: +50% fire rate, −40% power gen). From level 5: *TRACK FUSION* (locks hold while the radar is dark), *LPI WAVEFORM* (LPI mode keeps full detection), *OVERWATCH* (your marked target takes double damage), *ARC LASER* (laser jumps to 2 more targets; needs the laser), *SCAVENGER* (kills refund interceptors) and *FRAG WARHEADS* (PAC-3 hits splash).

### Salvage
Kills sometimes drop **salvage**: a spinning crate with a light over it. **Click it within 12 s** to recover it, or it's lost. Heavier kills drop more often (FPV under 1%, Shahed 3%, Mi-28 12%, Mi-8 30%, Su-34 40%; decoys never drop) and are more likely to drop tech:
- **Supply cache:** credits, 6× the kill's reward + 40.
- **Munitions / Power cell:** interceptors or power to full.
- **Repair kit:** +30% battery HP, and every unit is repaired.
- **Overdrive:** +50% fire rate for 12 s.
- **Salvaged tech** (rare): a free level of a random upgrade you can buy now. It doesn't count toward the base level.

Drops use their own random rolls, so they never change the daily op's enemy schedule.

### The front
Enemies attack from one direction: the **front**, a 50° sector at the top of the default view, marked on the ground and on the mini radar rim. Aircraft and short-range drones (Lancet, FPV, Mi-28, Su-34, Mi-8 and their ARMs) always come from the front. Long-range threats (Shaheds, the decoys that fly with them, and Iskanders) come from the front too at first. From the SEAD level they can come from up to 60° either side of it, from COORDINATED RAID up to 120°, and after that from any direction. The mini radar shades the arc they can currently come from. A raid or package comes off the front only when everything in it is a long-range threat.

### Levels
A run is a string of **levels**. Each one is 60 s of waves, then the level's **raid**, then a **build window** with no new contacts, before the next level starts. The build window is 20 s if you held the raid's objective and 8 s if you lost it. Contacts already in the air keep coming, so it isn't a pause, but it's the time to buy and place pads. Each level adds a new kind of problem, rather than just more HP:
1. **PROBING:** Lancets and Shaheds. Learn the systems.
2. **MIXED THREATS:** FPV swarms and the first Mi-28s.
3. **EW SCREEN:** decoys and jammer helicopters, and the first attack packages.
4. **SEAD:** Su-34s and anti-radiation missiles. From here, every level has a Su-34 strike package halfway through its waves.
5. **COORDINATED RAID:** heavy mixed raids, Iskanders and cruise missiles.

After COORDINATED RAID, every level adds a **condition** on top of that mix, and attack packages get more likely each time. The conditions loop in this order: **NIGHT RAID** (contacts fade twice as fast), **GROUND CLUTTER** (−30% detection), **LULL** (a breather to rebuild), **JAMMING STORM** (more jammer helicopters), **SWARM TIDE** (many more, weaker enemies) and **SEAD WAVE** (strike aircraft, ARMs and cruise missiles). Each strike package is announced with a *STRIKE AIRCRAFT* warning.

**Attack packages:** from the EW SCREEN level on, some spawns are a package instead of a single pack: several types flying in together from one bearing, each covering another's weakness. The log names the element to kill first.

| Package      | From | Composition                              | Kill first | Because                                             |
|--------------|------|------------------------------------------|------------|-----------------------------------------------------|
| JAMMED SWARM | L3   | Mi-8 escort, 12 FPV, 2 Shahed            | Mi-8       | the swarm flies inside the jammer's sector          |
| SEAD PACKAGE | L4   | Su-34, 2 Kh-31P, 3 decoys, Shahed        | Su-34      | decoys soak locks while the Su-34 keeps firing ARMs |
| SATURATION   | L5   | 6 decoys, Mi-8 escort, 3 Lancets, Mi-28  | Mi-28      | the heavy hides among decoys and fast Lancets       |

An EW helicopter in a package is an **escort**: it goes in first and holds station on the package's bearing, so its jammed sector stays over the package.

**Raids:** every level ends with a named raid, all from one bearing. Which raids can come, and how big they are, goes by the level. Each one runs the same way:
1. **Warning and preparation (10 s):** a briefing card shows the sector, the raid's name, its composition, the objective and the bonus, with chevrons at the rim. When that part of the rim is off screen, an amber arrow on the screen edge points toward it. Use the time to set radar, fire discipline and priority.
2. **Attack:** a siren sounds and the HUD frames turn amber. Normal spawns thin out to 40% while the raid is in the air, and the card tracks what's left and whether the objective still holds.
3. **Resolution:** the objective is **PROTECT BATTERY** (nothing in the raid lands) or, for SEAD STRIKE, **PROTECT RADAR** (no ARM hits the radar while the raid is on).
   - **Held:** the bonus pays out, then a **20 s build window**.
   - **Lost:** no bonus, and only an **8 s build window**.
   Either way, the level ends when the last aircraft of the raid is gone.

Raids include SHAHED WAVE, LANCET PACK, FPV SWARM, DECOY SCREEN, HELO ASSAULT, ISKANDER SALVO, CRUISE SALVO and the package raids SWARM ASSAULT, SEAD STRIKE (led by a Su-34) and SATURATION STRIKE. An escort jammer flies with its raid but doesn't count toward it; ARMs a raid's Su-34 launches do.

Spawn rate, HP and damage grow **logarithmically** with play time, and raid size with the level: each doubling adds about the same threat. A strong battery can keep going indefinitely.

| Threat                      | Notes                                     |
|-----------------------------|-------------------------------------------|
| Lancet-3 loitering munition | Fast, low signature, erratic. **Hunts:** dives on any unit it passes within 5 m of; otherwise circles about 26 m out for 3 s, searching, then dives on the battery |
| Shahed-136 attack drone     | Slow and straight, then a fast terminal dive over the last 10 m |
| FPV strike swarm            | Weak, arrives in packs of 6, hard to see  |
| Mi-28NM attack helicopter   | Slow and tough. Never comes in: **hovers about 26 m out** and fires 4 Ataka anti-tank missiles (shootable, 4 s apart), then flies home |
| Su-34 strike fighter        | Very tough, big reward, launches ARMs. **Releases two KAB glide bombs** about 32 m out, then turns for home: kill it before it lets go. The bombs are slow but heavy (35 HP) and hit hard |
| Gerbera decoy               | Looks like a Shahed and flies the same profile, dive included. Harmless, no reward |
| Kh-31P anti-radiation missile | Very fast, knocks the radar offline     |
| Mi-8MTPR-1 EW helicopter    | Stands off and jams a sector              |
| Iskander-M ballistic missile | Very fast, big radar return, hits hard. Straight in, then **jinks hard over the last 25 m**. **Only PAC-3 can hit it** |
| Kh-101 cruise missile       | Fast, low and weaving, can come from the flanks. Flies a dogleg off its launch bearing, so it turns in from somewhere else. **Goes for your most valuable unit** (the one you've spent the most on) and knocks it out in one hit; the base only when no unit is up. Flies under the radar horizon: radar sees it only within 60% of its range. Every launch is announced with its bearing and target |

### The battery
The base is laid out like a Patriot site. Every base level builds something that changes what it can do, plus an M903 launcher once you have the Patriot (up to 8), and 2 more perimeter pads:

| Level | Builds                         | Capability                                                          |
|-------|--------------------------------|---------------------------------------------------------------------|
| 1     | command post + 12.7 mm AA MG   | the starting kit; the AN/MPQ-65 radar and ECS replace the command post once bought |
| 2     | EPP-III power plant            | +2 power/s                                                          |
| 3     | OE-349 antenna mast            | datalink: raids announced 5 s earlier, +1 s contact memory          |
| 4     | TRML-4D surveillance radar     | keeps searching at half range while an ARM has the MPQ-65 down (no locks, but pads keep firing) |
| 5     | earth berms                    | +10% armor                                                          |
| 6     | second fire control shelter    | +1 lock slot                                                        |
| 7     | hardened command node (bunker) | +25% max HP, ARM hits knock the radar out half as long              |

The level-up card names what was built. The LTAMDS AESA upgrade adds rear arrays to the radar, and buying laser, IRIS-T SLX or HPM adds their vehicles.

**Doctrines:** before a normal run, pick a starting loadout of free upgrade levels (they don't count toward base level). **STANDARD** is always available. The others unlock from your all-time records: **SENSOR NET** (survive 5:00; the classic battery, with the radar and the Patriot from the start), **LOGISTICS** (earn 5,000 credits in a run) and **FORWARD STRIKE** (reach base level 6). Daily ops always fly STANDARD.

**Progression layers.** There are three, and they stay separate:
- **Run:** kills → credits → upgrades → base level → perks → more complex threats. All of it resets every run.
- **Meta:** each run can set a record, and records unlock doctrines. Doctrines are only starting loadouts: they don't count toward base level and don't carry anything else between runs.
- **Daily op:** a fixed challenge with a fixed doctrine (STANDARD), scored by your best time for the day.

**Daily op:** the same seed for everyone on the same (UTC) day, so the whole enemy schedule is identical: which enemies, packages, bearings, raids and perk drafts. Your commands, radar mode and detection luck never touch that schedule. Normal waves, raids and strike packages each draw from their own seeded stream, and the waves' stream starts over at every level, so each level sends everyone the same things in the same order, however long earlier levels took. What play can change is pacing: how quickly you deal with a raid decides when the level ends, and a lost objective cuts the build window short. Your best time for the day is saved. `R` after a daily op flies it again.

**Feedback:** every tactical event gets a sound, a mark on the scope and a line in the log. That covers detection, lock acquired (a tick and a flash as the brackets snap on), lock lost (amber), launches, hits, kills (credit popups), ARM and Iskander launches and intercepts, jammers coming on station and going down, decoys classified, raids starting and ending, and battery hits (a red damage popup).

An enemy that reaches the base damages it and dies. When base HP hits 0, the game is over. Your best time, kills, level and credits earned are saved in `localStorage`. The game-over card has **COPY RESULT** (`C`), which copies a one-line result to paste into a chat. It also shows a **debrief**: kills by enemy type, each weapon's share of the damage, clean raids, ARMs evaded and radar hits.

## Roadmap

This section replaces the old `plan-mvp.md`, `plan.md` and `plan-frontline.md`; they are still in git history.

### Shipped
- **MVP:** the core loop (detect → lock → shoot → credits → upgrade → base level → perks → game over), the upgrade shop, juice and sound, 2,000 pooled enemy instances.
- **Green radar look:** one green palette (`PAL` in `config.ts`) with amber for warnings and red for critical, wireframe models with bloom and a CRT pass, a polar grid, sweep afterglow and blip ghosts, segmented bars, the system log, the boot sequence and the sweep ping.
- **Front line, steps 1–5:** the front and widening flank arcs, levels with raids and build windows, the AA MG start with the radar and Patriot as milestones, belt slots with fields of fire, crossfire, support units and unit HP, the coverage overlay (`O`), and Kh-101 cruise missiles with the IRIS-T SLM to stop them.

### Next: finish the front line (step 6)
- [ ] **Level card** at the end of each level: held or lost, what unlocks next, new directions (e.g. "MISSILES MAY NOW COME FROM ±60°"). Today there's only a banner and a log line.
- [ ] **Build window as its own state:** slow motion, shop open, free slots highlighted.
- [ ] **Map polish:** draw the belts as dim dashed arcs and shade enemy territory beyond the front.
- [ ] **Rebalance** with `npm run balance`. Known issues: FORTRESS (−15% fire rate) is weak with gun-heavy starts, and long runs now die to cruise missiles (LOGISTICS max run dropped from 15:00 to 6:56).

### Placement extras
- [ ] **Tier-3 branch** for guns: at the ZU-23 (the MG's top tier; MANTIS is its own unit), pick *AP rounds* against Mi-28s or *high rate* against swarms.
- [ ] **Slot preview while placing:** each free slot shows the field of fire it would add and how much open threat arc it closes.
- [ ] **Power node** (with the energy weapons, level 7+): laser and HPM draw power only within its reach, so it decides where they can go.
- [ ] **Terrain tags** (optional): *ridge* (+20% range, drones go for it first), *treeline* (never targeted, −15% range), *road* (half build cost, fast resupply). Waits until after step 6: it adds a lot of balance surface.

### Later ideas
- A front that moves back after a held level, giving more depth for the next one.
- Achievements, more arenas, boss enemies, music.

### Ground rules for any change
- `sim.ts` never touches rendering; `render.ts` and `hud.ts` only read state. No per-frame allocation of meshes or DOM.
- The daily op must stay deterministic: every spawn source draws from its own seeded stream.
- Every off-axis attack is telegraphed with a warning and bearing. Players should lose to gaps in their cover, not to surprises.
- Auto-place and the balance bots use the same `bestSlot()`, so the bots test real layouts.
- Keep the game runnable after every step. `npm test` and `npm run build` stay green, and new mechanics get cases in `sim.check.ts` and `balance.ts`.

## Project layout

```
src/config.ts     every tunable number: enemies, weapons, upgrades, perks, difficulty
src/sim.ts        pure game state + update(dt), no Three.js (testable in Node)
src/render.ts     Three.js scene, reads state only
src/hud.ts        DOM HUD, mini-radar, shop, overlays
src/sfx.ts        WebAudio sound effects, no audio files
src/main.ts       boot, input, main loop
src/sim.check.ts  `npm test` self-check
src/balance.ts    `npm run balance` bot survival
src/bench.ts      `npm run bench` sim timing under load
```

To rebalance the game, edit `src/config.ts`. Built with TypeScript, Vite and Three.js.
