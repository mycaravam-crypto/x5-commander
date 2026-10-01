# Gameplay

The full rules of X5 Commander. Setup and controls are in the [README](../README.md).

## Basics

The game pauses by itself when the window loses focus.

The first time you meet each threat or mechanic, a short tip explains it. Tips don't come back once you've seen them, unless you press RESET TIPS (start screen or pause menu).

**Touch screens:** tap marks a contact, builds or picks a unit (the MOVE button on the unit card moves it), one-finger drag pans, two fingers pinch to zoom and twist to rotate. Phones get a compact HUD: a thin HP / power / missile strip top-left with toggles for the minimap and the details list (remembered between runs) plus 2× and pause, and an icon bar at the bottom for shop, intercept, fire discipline, scan mode, EMCON and targeting mode, each showing its current setting.

**Pause menu.** Resume or quit to the menu, SFX and music volumes, the coverage overlay mode, RESET TIPS, and a compact help panel: the key systems in a line each, and every hotkey.

## Modes

**Training.** A first-run drill of four short scripted waves on a fixed map, each with its lesson on screen: **eyesight** (guns fire at what they can see; build a third gun), **radar** (the radar and Patriot are handed over: see far, lock, mark a priority target), **ARMs and EMCON** (ARM salvos: go silent with `F`, then radiate again) and **decoys** (Gerberas among Shaheds, classified and greyed out once locked). The battery can't fall in training and no records are kept. The start screen offers it first until you've finished it once; `T` there starts it any time.

**Ground assault.** A mode of its own (`A` on the start screen, on the map shown there), played as a **front-line tower defence**: instead of aircraft, **robots on foot** (each modelled on a real prototype) march down from the **north** across a front about 80 m wide, and **only perimeter defenses can engage them**. The base holds a line (a HESCO wall across its front), and you build in a band in front of it, not a ring round it. Every gun can be **upgraded in its pit** (MK II, MK III) and **fitted out**: ammunition, a sensor and a piece of kit. The radar, the Patriot and the battery's own laser and HPM are out of the shop (fire control doesn't lock a walker and the battery's weapons can't hurt one), and so are the Stinger and IRIS-T SLM, which only shoot at aircraft; the perimeter gets its own laser and microwave array instead. Walkers are engaged when a unit sees them (by eye, thermal sight or ground radar); the battalion's drone feed shows the ones beyond sight dimmed, so you can watch the tide come on. Rivers, ponds, woods and rock slow them down. Every fifth level is **THE TIDE**: a thousand mini-walkers in a wall. `H` on the start screen is a **horde test** that goes straight there (base level 5, 4,000 credits, a 45 s build window; no records, seed code `-H`). See *Ground assault* below. The HUD drops the radar, fire-control and intercept readouts and touch buttons, which have nothing to do here. Its records are kept apart from the air war's, unlock no doctrines and aren't logged on the leaderboard; its seed code ends in `-G`.

## The battlefield
The base sits on a low plateau in farmland. Ahead, toward the front, a cleared field of fire runs down to a river; woods, ponds, rock outcrops, fields and farmsteads lie round it, with hills beyond. Aircraft fly at their own heights over the ground (FPVs and cruise missiles low, Su-34s high, ballistic missiles diving in steeply), each with a faint line dropped to a ring on the ground so you can see where it is. They fly like aircraft: jets and drones bank round in arcs, helicopters slow into a hover and keep their nose on the battery (a Ka-52 sinks into the trees between salvos), Shaheds and Lancets come down in a dive, and heading home is a wide turn, not a U-turn on the spot. Missiles and Su-34s leave smoke and contrails, a badly hit aircraft trails smoke (then fire), and a shot-down one falls burning and leaves a fire where it hits the ground. The fighting marks the ground for the rest of the run: crashes, walkers blowing up and hits on your units leave scorch marks and craters, walker fire pocks the ground round its targets, and a blast in the woods flattens the trees round it (blown outward, charred, a few left burning) and scorches the ones beyond. Whatever comes down in the river or a pond throws up a splash instead. It's scenery for the aircraft, but it decides where you can build, and the ground a unit stands on changes what it can do (see *Building the line*). NIGHT RAID turns the day to moonlight.

**Every run gets its own map**, generated from the run's seed: the river's course, woods, fields, roads, farmsteads, and the ponds and rock outcrops inside the build zone all change. Every map keeps the same rules: the plateau and the field of fire toward the front stay clear, the river stays beyond the build zone, the starting MG's spot is open, and at least 55% of the build zone is buildable. The start screen names the map (a grid reference); `N` rolls another. Picking a doctrine keeps the map. The daily op's map comes from its seed, so everyone flies over the same ground that day.

## Reading the HUD
- **Left panel:** battery, power and interceptor bars (with net flow per second), then three groups: SENSORS (radar mode, radar state, range, tracks), FIRE CONTROL (locks in use with a bar, fire discipline, target mode, intercept readiness) and BATTERY (pads, raid state, build window). The top bar shows the level you're on.
- **Minimap (under the left panel):** the terrain from above, turned with the camera: the build zone (dashed), your units (pale green), contacts (red, missiles amber), the front (red rim), the radar or eyesight range and the camera's view. Click it to look there.
- **Threat board (top right):** what's on the scope by type, and the 4 most urgent contacts (damage they'd do over time to impact). Amber means dangerous now; ◆ means locked.
- **Warnings (beside the left panel):** chips for critical states, with an alarm blip as each comes on: hull critical (red), power low / radar starved, interceptors low, locks full with contacts waiting, guns out of ammo, units down. Each stays up a moment after its cause clears. Thresholds are `WARN` in `config.ts`.
- **Shop:** until the radar is built, PERIMETER comes first. Rows waiting on something you don't own yet (the radar or the Patriot) are folded away, and a group with nothing else left shows only its header and what it needs. The row marked ◆ in amber is the suggested buy for the current bottleneck: a gun while there's a free unit slot, interceptors when the magazine runs low, generator when power starves the radar, hull when HP is low, ECS channels when contacts wait for a lock.

## Starting out: two guns and your eyes
A run starts with a command post and a section of two **12.7 mm AA machine guns**, dug in on the front. There is no radar and no Patriot yet:
- **Eyesight:** anything within 18 m of the base, or 15 m of an emplacement, is seen, radar or not. NIGHT RAID cuts that to 60%. Guns placed further out see further.
- **The MGs** fire by themselves at whatever they can see within 10 m (eyes reach further than the guns). The two starting guns stand either side of the front axis so their fields of fire cross on it. Each feeds from its own 40-round belt, not the interceptor stock, and takes 3 s to reload when the belt runs dry.
- **What's off without a radar:** locks, the priority target, radar modes, EMCON and the emergency intercept. ARMs have nothing to home on.
- **The shop** only offers what helps before the radar: guns and pads, hull, damage and fire rate. Power, sensors and fire control need the radar; the magazine needs the Patriot.
- **Milestones:** from base level 3 you can buy the **AN/MPQ-65 radar** (search and fire control), then the **PAC-3 MSE battery** (the Patriot, which needs the radar). Radar and Patriot keystones on the command tree can only be taken once you have them.

## Radar decides everything
Once it's built, a rotating radar sweep reveals enemies within its range (until you buy the AESA, below). Each time the sweep passes over an enemy, there's a chance it gets detected. The chance depends on the enemy's signature and your radar resolution. **Undetected enemies are invisible and can't be shot.** A detected contact fades again after the radar's *persistence* time runs out.

## LTAMDS AESA
A rotating radar can take at most 8 levels of *Scan Rate*. From base level 4 you can buy **LTAMDS AESA**, a staring array that covers all directions at once. It gives every contact the same number of looks a sweep would, at random moments. This adds +25% scan rate and removes the Scan Rate cap. The spinning sweep is replaced by faint beam flashes and a blip each time a contact is detected again, so the screen stays readable however fast you scan.

## Radar threats and EMCON
The enemy fights your radar, not just your base.
- **The HUD shows the radar's state.** Knocked out: the view drains of colour under a light snow, the frames turn red, the minimap shows NO RADAR, and a red countdown reads RADAR DOWN, NO FIRE CONTROL. EMCON gets a quieter amber banner. Red is kept for the worst states only: radar knocked out and battery critical.
- **Anti-radiation missiles (Kh-31P)** home on a radiating radar. Su-34s launch them once they're in range, and from the SEAD level they arrive in salvos. A hit takes the radar **offline for 6 s** (repeated hits stack up to 12 s). You get warning: every launch sounds the radar-warning tone and shows its bearing. Late in a run, **Su-35S SEAD fighters** hold station out on the front and fire **Kh-58s**: heavier ARMs with a memory seeker. Going dark doesn't make a Kh-58 veer off; it flies on at where it last heard the radar, off to the side by up to 10 m, so EMCON cuts its odds (to a bit under half) instead of making it miss, and a hit knocks the radar out 50% longer. The Su-35S only fires while you radiate: kill it on station, or go dark and wait it out.
- **EMCON (`F`)** stops the radar transmitting. Inbound ARMs lose the emitter and veer off, the radar stops draining power, but fire control drops every lock and contacts coast on track memory. Go silent early: an ARM that's already close still hits.
- **Radar modes (`V`)**, each a trade-off. EMCON works on top of any of them.

  | Mode    | Detection                                          | Power drain | ARM exposure |
  |---------|----------------------------------------------------|-------------|--------------|
  | ACTIVE  | all round                                          | ×1          | normal       |
  | FOCUSED | a 120° arc on the bearing you last clicked (or your priority target): +30% range, +30% chance, about 3× the revisit rate. Blind everywhere else. LTAMDS AESA widens the arc to 180°. | ×1.4 | high: Su-34s launch from 25% further out, 30% more often |
  | LPI     | −15% range, −40% chance                            | ×0.6        | low: ARMs only find the radar inside 15 m, so most miss; Su-34s launch half as often |
- **Decoys (Gerbera)** look exactly like Shaheds. Fire control tells them apart once a decoy has been locked for about 1.5 s, then releases it: it pops a DECOY marker, and from then on is drawn as a grey ghost with a struck-through label. Until then they waste lock slots and interceptors. *GaN T/R Modules* shorten that time.
- **Jammer helicopters (Mi-8MTPR-1)** stop outside the battery and hold station on their bearing, out on the front. Inside the sector they cover, detection chance drops to about a third. You see the jammer's bearing as an amber strobe, not its range. The jammer itself shows up clearly on radar, so mark it and kill it.

## Locking and targeting
Detected enemies are locked, up to your number of **lock slots**. A lock holds as long as the enemy stays within tracking range. All weapons fire automatically at locked targets. Left-click a contact to mark it as the **priority target**: it always gets a lock slot, is engaged first and takes +25% damage, but painting it costs 1.2 power/s for as long as you hold it. Otherwise, the auto mode picks targets (`T` to cycle): **CLOSEST**, then **WEAKEST**, **RICHEST** and **FASTEST**, each unlocked by the *Target Logic* upgrade.

## Commands
- **Fire discipline (`G`)**: **CONSERVE** fires 25% slower, at 75% of weapon range, for 25% less ammo and power per shot. **BALANCED** is the default. **MAXIMUM** fires 40% faster and keeps firing until 1.6× a target's HP is in the air, for 30% more per shot.
- **Emergency intercept (`Space`)**: for 4 s every weapon, and every perimeter pad in reach, fires only at the priority target (or, with none marked, the visible threat nearest impact), 60% faster and past a sure kill. Costs 25 power and needs the radar up; 30 s cooldown.

## Weapons
The defence is layered like a real one: each layer reaches further than the one inside it, and the radar outranges them all. Real reaches run from about 1 km (HPM) to 100+ km (Patriot); the arena keeps them in order and stretches the gaps as far as a readable map allows. Stand-off threats sit just outside the layer they outrange (see the threat table).

| Layer | System                   | Reach  | Uses         | Notes |
|-------|--------------------------|--------|--------------|-------|
| Point defence | Leonidas HPM (microwave) | 7 m | Power | Fries everything in a 100° cone toward the nearest threat. Cues itself: no lock needed |
| Point defence | 12.7 mm AA MG     | 10 m   | Its own belt | Fires at what it can see, no lock; you start with two (they're perimeter pads). ZU-23-2 tier: 12 m |
| Point defence | HEL 50 kW laser   | 11 m   | Power        | Instant, very fast, hard-hitting beam on the nearest threat. Cues itself: no lock needed |
| SHORAD | MANTIS 35 mm (pad) | 15 m  | Interceptors | Fast gun, all round |
| SHORAD | Stinger team (pad) | 24 m  | Interceptors | Homing MANPADS, IR seeker |
| Medium SAM | IRIS-T SLM (pad) | 40 m | Interceptors | All round, takes on missiles first, IR seeker |
| Medium/long SAM | IRIS-T SLX | 50 m | Interceptors | Homing, blast-frag splash, IR seeker; on the locks |
| Long-range | PAC-3 MSE (Patriot) | 58 m | Interceptors | Hit-to-kill, leads moving targets; on the locks. Bought from base level 3, needs the radar |
| Sensor | AN/MPQ-65 radar     | 68 m (+7 per LTAMDS level) | Power | Detection; fire control tracks out to 62 m (+6 per Track Range level) |

The laser and HPM are point defence: they only see the last few metres, so they kill leakers, not raids, and they're built to be deadly inside that bubble.

## Perimeter defenses: building the line
Perimeter pads (units): **12.7 mm AA MGs** (from the start), **MANTIS 35mm C-RAM** (base level 2, fast gun, short range), **Stinger teams** (level 3, homing, mid range), **EW jammers** (level 4, slow nearby contacts, drain power), the **IRIS-T SLM** (level 5, needs the radar: a medium-range SAM, 40 m all round, that takes on missiles before anything else), and two support units from level 2: the **observer post** (sees 28 m round itself, for every gun) and the **ammo point** (guns within 10 m fire 25% faster and reload their belts twice as fast). Units engage any contact that can be seen, by eye or radar, inside their range and **field of fire**, without using a lock slot.

**Building.** Units go anywhere on open ground inside the **build zone**, the dashed ring round the base: at least 10.5 m out (clear of the base compound), at least 3.5 m from each other, and not on water, rock or woods. The zone and the number of units grow with the base level:

| Base level | Build zone | Units |
|------------|------------|-------|
| 1          | 20 m       | 3 (two are the starting MGs) |
| 2          | 31 m       | 5     |
| 3          | 34 m       | 7     |
| 4          | 34 m       | 11    |
| 5+         | 36 m       | 12, then +1 per level up to 16 |

Where a unit stands decides its **belt**:

| Belt         | Distance | Trade-off                                                                                   |
|--------------|----------|---------------------------------------------------------------------------------------------|
| Forward line | 24 m and out | engages first; belts reload 50% slower without an ammo point; out here a unit is easily isolated, and FPVs dive on isolated units within 8 m (Lancets hunt units on every belt, within 5 m) |
| Main line    | 14–24 m  | balanced                                                                                    |
| Inner ring   | inside 14 m, all round | safe, covers the flanks, engages late                                         |

**Terrain.** Some ground gives a unit a character. The unit card names it:

| Ground      | Where                                         | Effect |
|-------------|-----------------------------------------------|--------|
| High ground | within 2.5 m of a rock outcrop's edge         | +20% range and eyesight, but on the skyline: FPVs and Lancets dive on it from twice as far, and a cruise missile picks it first |
| Treeline    | open ground within 2.5 m of the woods         | hidden: never dived on and never a cruise missile's target; −15% range |
| Road        | on the supply road or the track to the front  | MG belts reload twice as fast, as with an ammo point |

**Fields of fire.** A gun covers a fan pointing away from the base, drawn on the ground: MGs 120°, Stingers 180°, MANTIS all round. It can't shoot what has flown past it. A target inside two guns' fields of fire takes **+20% crossfire damage** from both. Amber ticks on the minimap rim mark bearings in the threat arc that no working gun covers. Press `O` (or the half-circle button on phones) for the coverage map: amber ground in the threat arc that nothing covers, dim green where one gun does, bright green where guns cross their fire.

**Veterancy.** Every gun counts its own kills and ranks up as they add up. A gun with kills wears a badge over it: its rank in stars and its tally (gold from ELITE up). A rank-up gets a banner, a gold burst and a sound; the unit card and the debrief's BEST UNITS show it too. Ranks carry through moves and MG tier upgrades and are lost when the unit is sold.

| Rank    | Kills | Damage | Fire rate | Range |
| ------- | ----- | ------ | --------- | ----- |
| Green   | 0     | —      | —         | —     |
| Blooded | 5     | +10%   | +5%       | —     |
| Veteran | 15    | +20%   | +10%      | +5%   |
| Elite   | 35    | +35%   | +15%      | +10%  |
| Ace     | 70    | +50%   | +20%      | +15%  |

**Placing.** After buying a unit, a ghost of it follows the pointer with the ground it would cover filled in: green where it can be built, red where it can't. **Click open ground** to build it there (a click on blocked ground snaps to the nearest open spot within 4 m). The pulsing ring marks the spot that covers the most open sky (or, for support units, serves the most guns); if you don't click within 8 seconds, the unit goes there.

**Your units.** Click one to pick it: the card shows its range, damage, field of fire and HP.
- **Upgrade in place (`U`):** 12.7 mm MG → twin 12.7 mm → ZU-23-2 (more range). An upgrade counts as a purchase toward the base level.
- **Sell (`Delete`):** full refund in the build window, half in combat.
- **Move (`B`, or right-click the ground):** then click open ground. Free in the build window, 5 s offline in combat.

**Unit HP.** A unit that runs out of HP is **down**: no fire, no eyes, no support, until repairs bring it back to half. Repairs run all the time, and the build window repairs every unit at once.

## Power and ammo
Your generator fills a power pool, and everything draws on it in this order:
1. **Standby:** every system draws a little just to stay ready: 0.5/s for the Patriot, per level 0.6/s for the laser, 0.4/s for the IRIS-T SLX and 1/s for the HPM, and per working unit 0.2/s for a MANTIS, 0.3/s for an IRIS-T SLM and 0.1/s for an observer post. A bigger battery needs a bigger plant.
   Fire control: 0.25/s for each lock held, plus 1.2/s while a priority target is marked.
2. The radar: ×1.4 in FOCUSED, ×0.6 in LPI, nothing in EMCON. **When power runs short, the radar sweep slows** (down to 25% speed), so you see less.
3. Interceptor production and Maintenance Crew repairs, from the surplus above 20% only.

Laser and HPM shots cost power as well. **Resupply breathes:** the generators and the GMT reload line work harder the emptier their store is: 1.6× their rating when empty, easing to 0.4× at capacity (`RESUPPLY`). So each bar settles at a level that shows how supply compares to demand: short of it, low but still firing; well ahead, near full. And since demand keeps growing with the war, a surplus bought once wears away. The power and interceptor bars show the net flow per second, so you can see which way the budget is going. Balancing seeing, shooting and building is the core tension of the game.

## Credits, upgrades and base levels
Kills earn credits. Killing quickly builds a **combo** worth up to +100% credits. There are 28 upgrades in 7 groups: BATTERY, POWER, SENSORS, FIRE CONTROL, WEAPONS, MAGAZINE and PERIMETER. Each upgrade costs more with every level. There is **no max level**, except for *Threat Evaluation*, the *radar*, the *PAC-3 battery* and *LTAMDS AESA*, which are on/off, and Scan Rate before the AESA. Earth Revetments have diminishing returns, up to 85% less damage taken. **Ranks:** every 5th level of an open-ended upgrade (not a pad) is a new rank and adds one free level on top. A bar under each shop row fills toward the next rank, and the buy that reaches it is marked ★. Every purchase shows what it bought, and the purchase sound climbs with the upgrade's level. The bar under BATTERY LV fills toward the next base level. Buying upgrades raises your **base level**, which adds visible structures to the base and pays **command tree points** (see below).

## Command tree
Every base level-up pays **2 points**, and every 5th base level one more (base level 13, about where a good 30-minute run ends, is worth 26). Leveling up opens the tree and pauses the fight; **K** (or a click on BATTERY LV) opens it any time, and a badge on BATTERY LV shows points not spent yet. Points you don't spend stay banked, and **UNDO** gives back everything taken since the tree was opened.

The tree is a radial map with **COMMAND** in the middle and three branches: **OFFENSE** (damage, fire rate, fire control), **DEFENSE** (hull, armour, repairs, going dark) and **SYSTEMS** (power, sensors, the magazine, credits). A point buys one node next to one you hold:
- **Travel nodes** (small circles) are one small, pure step: +4% damage, +4% fire rate, +6% max HP, +2% armour, +0.3 HP/s repair, +6% power gen, +4% radar range and so on.
- **Notables** (diamonds) sit where two lanes of a branch meet, two per branch: bigger than a travel node, no trade, and each does something a plain stat can't. OFFENSE: *MOMENTUM* (+2% fire rate per combo step, up to +20%) and *HUNTER-KILLER* (+30% damage to heavy targets and raid leaders). DEFENSE: *FIELD DEPOT* (units repair 3× as fast, +0.5 HP/s battery repair) and *DUG IN* (units take 30% less damage, +4% armour). SYSTEMS: *WAR CHEST* (4% interest on banked credits every build window, up to 150) and *EARLY WARNING* (raids announced 5 s earlier, +15% contact memory).
- **Keystones** (hexagons) are the old perks, with their trades: *GLASS CANNON*, *OVERCHARGE*, *FORTRESS*, *REACTOR*... ★ marks the ones that change the rules (*OVERKILL*, *LAST STAND*, *TRACK FUSION*, *KILL CHAIN*...). Keystones are leaves: you can't path through one. The radar and Patriot keystones need those upgrades first (dashed amber outline).

The rule keystones sit deeper (ring 5 to 7), so they take a few levels to reach. The full tree is 62 nodes; a good run fills under half of it: one branch end to end and a dip into another, or the near keystones of two.

## Salvage
Kills sometimes drop **salvage**: a spinning crate with a light over it. **Click it** to recover it: it stays on the ground until you do (up to 12 at once; while 12 are waiting, kills drop nothing more). Heavier kills drop more often (FPV under 1%, Shahed 3%, Mi-28 12%, Mi-8 30%, Su-34 40%; decoys never drop) and are more likely to drop tech:
- **Supply cache:** credits, 6× the kill's reward + 40.
- **Munitions / Power cell:** interceptors or power to full.
- **Repair kit:** +30% battery HP, and every unit is repaired.
- **Overdrive:** +50% fire rate for 12 s.
- **Salvaged tech** (rare): a free level of a random upgrade you can buy now. It doesn't count toward the base level.

Drops use their own random rolls, so they never change the daily op's enemy schedule.

## The front
Enemies attack from one direction: the **front**, a 50° sector at the top of the default view, marked on the ground (red dashes at the rim) and on the minimap. Aircraft and short-range drones (Lancet, FPV, Mi-28, Su-34, Mi-8 and their ARMs) always come from the front. Long-range threats (Shaheds, the decoys that fly with them, Orlan-10s, Ka-52s and every missile but the ARM) come from the front too at first. From level 4 (FLANKS) they can come from up to 60° either side of it, from level 5 up to 120°, and after the scripted levels from any direction. The minimap and the ground show the arc they can currently come from in amber, and the minimap flashes an amber tick at the bearing of every missile launch. A raid or package comes off the front only when everything in it is a long-range threat.

## Levels
A run is a string of **levels**. Each one is 60 s of waves, then the level's **raid**, then a **build window** with no new contacts, before the next level starts. The build window is 20 s if you held the raid's objective and 8 s if you lost it, and the clock runs at 60% during it. A **level card** says how the level went, what the next one brings and whether threats will come from wider angles; the shop opens by itself and the build zone lights up. Contacts already in the air keep coming, so it isn't a pause. Press `N` (or START NOW on the card) to start the next level early. Each level adds a new kind of problem, in step with what the battery can build by then:
1. **PROBING:** Lancets and Shaheds, straight in from the front. Learn the guns.
2. **FPV SWARMS:** FPV swarms join them.
3. **HELICOPTERS:** Mi-28 attack helicopters and decoys.
4. **FLANKS:** Shaheds from up to 60° either side of the front, and the first attack packages. About when the radar comes.
5. **EW AND CRUISE:** cruise missiles going for your units (a few of them Kh-55 decoys), jammer helicopters and Orlan-10 spotters. Up to 120° either side.
6. **SEAD:** Su-34s, anti-radiation missiles and Iskanders: the Patriot's job. Ka-52s round the flanks, and Su-25 attack runs. From here, every level has a Su-34 strike package halfway through its waves.

The newer threats (Orlan-10, Ka-52, Kh-55 decoy, Su-25, Su-35S, Kinzhal) only come in from level 5. Levels 1 to 4 bring the same threats as before (FPV packs now vary from 4 to 8).

After SEAD, every level adds a **condition** on top of that mix, missiles and drones can come from any direction, and attack packages get more likely. The conditions loop in this order: **NIGHT RAID** (contacts fade twice as fast), **GROUND CLUTTER** (−30% detection), **LULL** (a breather to rebuild), **JAMMING STORM** (more jammer helicopters), **SWARM TIDE** (many more, weaker enemies), **SEAD WAVE** (strike aircraft, Su-35S SEAD fighters, ARMs, cruise missiles and the odd Kinzhal), **EW OFFENSIVE** (jammers, decoys and cruise missiles, −15% detection), **COMBINED ARMS** (Mi-28s, Ka-52s and Su-25s, swarms and cruise missiles together), **EYES IN THE SKY** (Orlan-10 spotters over Lancets and FPVs) and **HYPERSONIC** (Kinzhals among the Iskanders). Past the scripted levels, jammer helicopters also get a little likelier every level (`EW_GROW`, up to `EW_MAX`). Each strike package is announced with a *STRIKE AIRCRAFT* warning.

**Attack packages:** from the FLANKS level on, some spawns are a package instead of a single pack: several types flying in together from one bearing, each covering another's weakness. The log names the element to kill first.

| Package      | From | Composition                              | Kill first | Because                                             |
|--------------|------|------------------------------------------|------------|-----------------------------------------------------|
| JAMMED SWARM | L5   | Mi-8 escort, 12 FPV, 2 Shahed            | Mi-8       | the swarm flies inside the jammer's sector          |
| SEAD PACKAGE | L6   | Su-34, 2 Kh-31P, 3 decoys, Shahed        | Su-34      | decoys soak locks while the Su-34 keeps firing ARMs |
| SATURATION   | L6   | 6 decoys, Mi-8 escort, 3 Lancets, Mi-28  | Mi-28      | the heavy hides among decoys and fast Lancets       |
| EW SCREEN    | L7   | 2 Mi-8 escorts, 2 Kh-101, 6 decoys, 2 Lancets | Mi-8  | two jammers side by side blank a wide sector while cruise missiles slip in low |
| MIXED STRIKE | L8   | Mi-28, 12 FPV, Kh-101, 2 Kh-31P          | Mi-28      | cruise and ARM launches pull your guns and the radar away |
| SPOTTED STRIKE | L5 | Orlan-10, 3 Lancets, 6 FPV               | Orlan-10   | it spots for the Lancets and FPVs: they find your units from further out and hit harder |
| FLANK HUNTERS | L6  | Ka-52, Orlan-10, 2 Shaheds               | Ka-52      | it settles masked on the flank and picks off your units |
| CAS STRIKE   | L7   | Su-25, 2 Lancets, 6 FPV                  | Su-25      | it comes in low under the Lancets, rockets your units and comes round again |
| WILD WEASEL  | L8   | Su-35S, 6 decoys, 2 Shaheds              | Su-35S     | it fires Kh-58s while decoys soak your locks; going dark only cuts their odds |
| SATURATION SALVO | L7 | 12 FPV, 6 decoys, 3 Shaheds, 2 Kh-55 decoys, Kh-101, Iskander | Kh-101 | the cheap ones soak locks and ammo so the expensive ones get through |

An EW helicopter in a package is an **escort**: it goes in first and holds station on the package's bearing, so its jammed sector stays over the package. Two escorts stand side by side, their sectors edge to edge, never further off the front than the package itself.

**Raids:** every level ends with a named raid, all from one bearing. Which raids can come, and how big they are, goes by the level. Each one runs the same way:
1. **Warning and preparation (10 s):** a briefing card shows the sector, the raid's name, its composition, the objective and the bonus, with chevrons at the rim. When that part of the rim is off screen, an amber arrow on the screen edge points toward it. Use the time to set radar, fire discipline and priority.
2. **Attack:** a siren sounds and the HUD frames turn amber. Normal spawns thin out to 40% while the raid is in the air, and the card tracks what's left and whether the objective still holds.
3. **Resolution:** the objective is **PROTECT BATTERY** (nothing in the raid lands), for SEAD STRIKE **PROTECT RADAR** (no ARM hits the radar while the raid is on), or on a boss level **SHOOT DOWN THE BOSS** (see *Bosses*).
   - **Held:** the bonus pays out, then a **20 s build window**.
   - **Lost:** no bonus, and only an **8 s build window**.
   Either way, the level ends when the last aircraft of the raid is gone.

Raids include SHAHED WAVE, LANCET PACK, FPV SWARM, DECOY SCREEN, HELO ASSAULT, ISKANDER SALVO, CRUISE SALVO and the package raids SWARM ASSAULT, SEAD STRIKE (led by a Su-34) and SATURATION STRIKE, and late in a run EW BARRAGE (level 8: two jammers over cruise missiles, decoys, Shaheds and Lancets) COMBINED STRIKE (level 9: a Su-34, Mi-28s, FPVs and cruise missiles), ALLIGATOR HUNT (level 6: Ka-52s with an Orlan-10 spotting and FPVs), SATURATION WAVE (level 8: many FPVs, decoys and Shaheds over a few Kh-101s and an Iskander) HYPERSONIC STRIKE (level 10: Kinzhals and an Iskander behind Kh-55 decoys), GROUND ATTACK (level 7: Su-25s under Lancets) and SEAD SWEEP (level 9: a Su-35S and a Su-34 with ARMs, decoys and Shaheds; PROTECT RADAR). An escort jammer flies with its raid but doesn't count toward it; ARMs a raid's Su-34 launches do.

Spawn rate, HP and damage grow **logarithmically** with play time, and raid size with the level: each doubling adds about the same threat. **After 6 minutes (about level 5) the war escalates:** enemy HP grows 16% and damage 7% per minute (compounding), and numbers 4% per minute. Kills pay more as it goes (reward × the HP surge^0.65), so income keeps upgrades coming, but slower than the threat grows. A battery that stops building falls within a few levels; one that keeps building lasts, but the surge outruns any battery sooner or later: every run ends, and the question is when. The numbers are `SURGE` in `config.ts`.

**Bosses:** every 5th level (L5, L10, L15, L20, then round again, stronger each time) the raid is led by a boss, with an escort. The briefing card names it, its skill, what it counters and what it's weak to. Objective: **shoot it down before it leaves**. It goes home once it has used up its attacks or its time on station, and still can be caught on the way out. Shot down, it pays its bounty and the raid bonus, and always drops **SALVAGED TECH** (a free upgrade level). Every boss is matched to your battery:
- **HP** is about a minute of the firepower that can actually reach where it holds, never below what the level's difficulty says.
- **Countermeasures (−50%)** against the weapon family (guns · SAMs · Patriot · laser + HPM) that has done the most of your damage this run.
- **A weakness (+60%)**: its own family, or, if you have nothing in it, the family you own and have used least. A boss rewards the upgrades you've neglected.
- **It holds just inside your reach** on its bearing, so something can always hit it. Mark it.

| Boss | Level | Skill | Weak to |
|------|-------|-------|---------|
| Mi-26T2 heavy assault helicopter | 5 | Hovers at standoff and drops an FPV pack on your units every 6 s | SAMs |
| Tu-22M3M long-range bomber | 10 | Circles far out, fires Kh-101 pairs at your most valuable units every 8 s, and its ECM jams its own sector | Patriot |
| S-70 Okhotnik-B stealth UCAV | 15 | Radar barely sees it. Every 7 s its bay opens to drop a glide bomb: for 2.5 s it shows on the scope and takes +50% | Guns |
| A-50U Mainstay command post | 20 | Circles far out and commands: while it's on station every other raider takes 30% less damage and flies 15% faster | SAMs |

| Threat                      | Notes                                     |
|-----------------------------|-------------------------------------------|
| Lancet-3 loitering munition | Fast, low signature, erratic. **Hunts:** dives on any unit it passes within 5 m of; otherwise circles about 26 m out (inside the SHORAD layer) for 3 s, searching, then dives on the battery |
| Shahed-136 attack drone     | Slow and straight, then a fast terminal dive over the last 10 m |
| FPV strike swarm            | Weak, arrives in packs of 4 to 8 (6 in raids and packages), right on the treetops: tiny radar return, cold (IR seekers struggle), under the radar horizon. **Hunts isolated units:** each FPV dives on the most isolated unit within 8 m of it (one covered by at most one other gun; high ground is seen from twice as far, the treeline hides a unit); units that cover each other are left alone and it goes for the battery |
| Mi-28NM attack helicopter   | Slow and tough. Never comes in: **hovers about 34 m out**, beyond Stinger reach from the inner line, and fires 4 Ataka anti-tank missiles (shootable, 4 s apart), then flies home |
| Su-34 strike fighter        | Very tough, big reward, launches ARMs. **Releases two KAB glide bombs** about 44 m out, beyond IRIS-T SLM reach from the base, (one on the SEAD level, where it's new), then turns for home: kill it before it lets go. The bombs are slow but heavy (35 HP) and hit hard |
| Gerbera decoy               | Looks like a Shahed and flies the same profile, dive included. Harmless, no reward |
| Kh-31P anti-radiation missile | Very fast, knocks the radar offline     |
| Mi-8MTPR-1 EW helicopter    | Stands off about 48 m out (beyond IRIS-T SLM, inside SLX and PAC-3) and jams a sector |
| Iskander-M ballistic missile | Very fast, big radar return, hits hard. Straight in, then **jinks hard over the last 30 m**. **Only PAC-3 can hit it** |
| Kh-101 cruise missile       | Fast, low and weaving, can come from the flanks. Flies a dogleg off its launch bearing, so it turns in from somewhere else. **Goes for your most valuable unit** (the one you've spent the most on) and knocks it out in one hit; the base only when no unit is up. Follows the terrain under the radar horizon: radar sees it only within about 64% of its range, less over woods and rock. Over the last 12 m it **jinks hard, speeds up and pops up** to dive on its target. Every launch is announced with its bearing and target |
| Kh-55 decoy cruise missile  | An old Kh-55 with no warhead. Reads as a Kh-101 on radar and on the warning net, flies the same profile and dives on a unit, and does nothing. Soaks locks and interceptors until fire control classifies it |
| Orlan-10 recon drone        | High, slow, big on radar, harmless itself. Circles the battery about 48 m out for 40 s, **spotting for its sector** (its own bearing ±29°): impacts there hit 25% harder, and Lancets and FPVs there find your units from 60% further out. Kill it and the sector goes blind |
| Ka-52 attack helicopter     | Comes round the flanks, **settles** about 36 m out (4 s, in the open: the moment to kill it), then hovers **masked** in the trees, strafing sideways, and pops up every 5 s to fire an Ataka pair at the nearest unit within 36 m (the battery if none). An Ataka hits a unit 2.5× harder than its damage says. 6 missiles, then it goes home |
| Su-25 ground-attack jet     | Armoured, low-level: under the radar horizon on the way in. About 24 m out it **pops up with flares out** (IR seekers do 60% less for 2.5 s), fires a salvo of 4 S-8 rockets at the nearest unit within 20 m (the battery if none), **breaks away in a banking turn**, comes round about 64 m out and makes a second run, then goes home |
| S-8 rocket                  | Fast, unguided, from the Su-25. Hits a unit twice as hard as its damage says. Guns can shoot them down; SAMs don't waste missiles on them |
| Su-35S SEAD fighter         | Holds station about 56 m out (inside PAC-3 reach, outside IRIS-T SLX), circling, and fires 4 Kh-58s, one every 7 s while your radar radiates (faster in FOCUSED, slower in LPI). No bombs: it never comes in. Goes home when it's out of missiles or after 45 s |
| Kh-58 anti-radiation missile | Memory seeker: EMCON doesn't make it veer off (see *Radar threats and EMCON*). Knocks the radar out 50% longer than a Kh-31P |
| Kh-47M2 Kinzhal             | Late war. Like an Iskander, but higher, faster and 40% faster again over the last 36 m. Hits very hard. **Only PAC-3 can hit it** |

**Signatures and height.** Each type has a radar cross-section (`sig`), a heat signature (`ir`) and a height (`alt`) in `ENEMIES`. The radar sees anything flying under 3.5 m only closer in, in proportion to its height (**radar horizon**: an FPV inside about 73% of range, a Kh-101 or a masked Ka-52 about 64%), and one under 2 m over woods or a rock outcrop is lost in the clutter (−60% detection chance). The TRML-4D backup radar has the same horizon; eyes don't. IR seekers (Stinger, IRIS-T SLM, IRIS-T SLX) hit hot targets harder and cold ones softer: a Su-34 takes +21% and a helicopter +14%, an electric Lancet or FPV about −20%.

## Ground assault
A front-line defence. Everything comes from the north (the red arc), along a front 40 m either side of the axis, and walks on the base; there are no flank levels. You build in the band in front of the base: 22 m either side of the axis and 24 m out at base level 1, growing to 40 m by 40 m, and up to 6 m behind the base's centre on the wings. The line can field 4 more units than the air war's ring. Raids come on as a wall, rank after rank across the whole front. Walkers on foot move at the pace real legged robots manage.

Its own levels, one new problem at a time, then looping conditions (NIGHT ASSAULT, HORDE, ARMOURED PUSH, LULL, GUN LINE, SIEGE):
**1 SKIRMISH** light walkers and mini-walkers · **2 GUN LINE** combat walkers · **3 DOGS OF WAR** armed robot dogs · **4 BREACHERS** breachers and heavy walkers · **5 THE TIDE** · **6 FIRE SUPPORT** mortar walkers · **7 FULL ASSAULT**. Every level ends with a raid (WALKER RUSH, GUN TEAM, PACK HUNT, BREACH, ARMOURED PUSH, BARRAGE, HEAVY ASSAULT), and every fifth one is **THE TIDE**: 1,000 mini-walkers and 20 light walkers in a wall (250 more and another 20 each time round, and from the second one, siege walkers leading). Machine guns alone can't stop it: it wants splash.

**The walkers and their real-world prototypes.** None of these is fielded as a weapon today, but each is modelled on a machine that exists:

| Walker | Modelled on | What it does |
|--------|-------------|--------------|
| Swarm mini-walker | small expendable bipeds used the way DARPA's OFFSET program (2017–2021) used swarms of hundreds of small robots | Knee-high, cheap and slow (1.2 m/s), comes by the dozen and by the thousand in THE TIDE. Charges a unit within 4 m, otherwise walks on the base |
| Light assault walker | Unitree G1 humanoid (2024: 1.3 m, 35 kg, ~2 m/s) | Packs of 3–6. Charges the nearest unit it sees within 8 m (further if that unit is on high ground) and blows its demolition charge on it |
| Armed robot dog | Ghost Robotics Vision 60 with the SWORD SPUR rifle (2021); the PLA's rifle-armed Unitree quadrupeds (2024) | Fast (3 m/s), fires on the run at a unit within 7 m. Not bipedal: the one four-legged walker |
| Armed combat walker | Foundation's Phantom humanoid (2025, marketed for defence work); Russia's FEDOR humanoid firing pistols (2017) | Stops within 9 m of a unit and shoots it up in bursts until it's down, then walks on. Lightly armoured (guns do 80%) |
| Breacher | Boston Dynamics Atlas (agile, carries loads) | Goes for your wire and Claymores within 14 m and cuts them (the unit is down until repaired), then walks on. Wire doesn't slow it |
| Fire-support walker | Agility Robotics Digit (a logistics biped) carrying a 60 mm mortar | Stops 22 m from the nearest unit it sees, out of reach of most guns, and lobs a round on it every 5 s (3 m splash) |
| Heavy assault walker | Hankook Mirae Method-2 (2016: 4 m tall, 1.6 t, piloted) | Slow and tough, fires its cannon at a unit within 16 m every 4 s without stopping. Armoured: machine guns, the MANTIS and the Mk 19 do half. Hits the base hard |
| Siege walker | Suidobashi Kuratas (2012: 4 m, 4.5 t, piloted), scaled up | Leads THE TIDE from level 10. Very heavily armoured (small arms do 35%), crushes any unit it walks over, wire doesn't slow it, and its cannon (24 m, splash) outranges most of your guns |

**Perimeter defenses for this mode** (on top of the MG, MANTIS, EW jammer, observer post and ammo point, which work here too):

| Unit | Reach | What it does |
|------|-------|--------------|
| Concertina wire | 7 m | Obstacle belt: walkers inside it wade through at a third of their speed. Cheap; put it in front of your guns so they spend longer in the kill zone |
| M18A1 Claymore belt | 6 m, 60° arc facing out | Directional mines: a walker stepping into the arc sets off a charge that blasts every walker in it, armour or not. No eyes needed. 4 charges, re-laid one every 15 s and all of them in the build window |
| Mk 19 grenade launcher | 18 m | 40 mm automatic grenades lobbed onto where the target will be: 2.2 m splash tears up packs. Feeds from its own 32-round belt (base level 2) |
| FGM-148 Javelin team | 28 m | Top-attack missile that goes through any armour, heaviest walker first. Its command launch unit's thermal sight sees 26 m. Uses the ammunition pool (base level 3) |
| XM813 30 mm RWS | 20 m, 180° | Bushmaster chain gun on a remote weapon station: half again of the way through armour (base level 3) |
| LOCUST 20 kW laser | 22 m, 180° | A beam that burns one walker after another where it stands: no ammunition, draws power while it fires, half the way through armour (base level 3) |
| M120 120 mm mortar | 36 m, not inside 9 m | Indirect fire: a round lands on the target's predicted spot 1.8 s later with a 4 m splash, through armour. Needs something to see the target (an observer post or a Javelin sight is ideal). Uses the ammunition pool (base level 4) |
| Leonidas HPM | 13 m, 60° cone | Epirus's high-power microwave array: every pulse fries every robot in its cone, armour or not (it's the electronics it kills), and stuns what's left standing for 1.5 s (a heavy or siege walker for 40% of that). Heavy on power (base level 4) |
| Hydra-70 rocket pod | 15–45 m | A salvo of 8 rockets onto the thickest pack it can see, scattered round it (3 m splash each, through armour), then 12 s to reload. Uses the ammunition pool (base level 5) |

**Upgrades in the pit.** Click a unit: every gun (not just the MG) takes **MK II** (+35% damage, +8% range) and **MK III** (+80%, +15%) for a share of its shop price, and has three **fitting slots**. Fitting another item in a slot replaces what was there; items show on the unit (armour plates, a sensor box, a radar panel, tier chevrons):

| Slot | Item | Fits | Effect |
|------|------|------|--------|
| AMMO | AP / API rounds | MG, MANTIS, 30 mm | 75% of the way through armour, −10% damage |
| AMMO | Airburst HE (AHEAD) | MANTIS, 30 mm, Mk 19 | rounds burst over the pack: +1.5 m splash, −20% damage |
| AMMO | Incendiary (API-T / thermite) | MG, MANTIS, 30 mm, Mk 19, mortar, rockets | what it hits burns: 40% of the hit again every second for 3 s |
| AMMO | DPICM cluster rounds | mortar, rockets | +60% splash, −25% damage |
| AMMO | Precision-guided (PGMM / APKWS) | Mk 19, mortar, rockets | rounds follow the target down, +20% damage |
| AMMO | Multi-purpose warhead (Javelin F) | Javelin | 2.5 m blast-frag splash, −15% damage |
| AMMO | Adaptive optics / Beam splitter | laser | +40% damage and +15% range / a second beam at 60% |
| AMMO | Wide-aperture array / High-PRF pulses | HPM | 90° cone, −15% damage / pulses 40% faster, stuns twice as long, +30% power |
| AMMO | Triple-strand razor wire | wire | walkers wade at a fifth of their speed and are cut (1 damage/s) |
| AMMO | M7 Spider networked mines | Claymores | 6 charges, re-laid twice as fast |
| SENSOR | Thermal sight (FLIR) | every gun, Claymores | +12 m eyes, sees as well at night, +10% range |
| SENSOR | Ground surveillance radar (EchoGuard) | every gun, observer, wire, ammo point | sees 36 m round itself, day or night, for every gun; 0.3 power/s |
| SENSOR | Fire-control computer + rangefinder | every gun | +20% damage, +10% fire rate |
| KIT | Autoloader / ammo booster | MG, MANTIS, Mk 19, Javelin, mortar, 30 mm, rockets | +30% fire rate, belts twice as long |
| KIT | Ballistic armour kit | every gun, observer, ammo point, jammer | x2 unit HP |
| KIT | Stabilised RWS mount | MG, Mk 19, Javelin, 30 mm, laser | fires all round (360° field of fire) |
| KIT | Long barrel / extended range | MG, MANTIS, Mk 19, mortar, 30 mm, rockets | +25% range, −10% fire rate |
| KIT | Capacitor bank | laser, HPM | −40% power drawn |

Tiers and fittings count toward the base level like any purchase, and what's sunk into a unit comes back (in part) when it's sold. Power and the ammunition pool (Generator, Battery Banks, M903 Canisters, GMT Reload) don't wait for a radar or a Patriot here; the laser and HPM live on the generators.

## The battery
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

**Doctrines:** before a normal run, pick a doctrine: a starting loadout of free upgrade levels (they don't count toward base level) and a trade that holds for the whole run, through every level-up and command tree point (the start screen shows it in amber). **STANDARD** is always available and has no trade. The others unlock from your all-time records:

| Doctrine       | Unlock                  | Starting loadout                         | All run                                                      |
|----------------|-------------------------|------------------------------------------|--------------------------------------------------------------|
| SENSOR NET     | survive 5:00            | radar and Patriot, LTAMDS Array 1        | +15% radar range, +30% contact memory, −10% damage           |
| LOGISTICS      | earn 5,000 credits      | Generator 2, Canisters 2, Reload 2       | upgrades 12% cheaper, +30% interceptor production, −12% damage |
| FORWARD STRIKE | reach base level 6      | Lethality 2, Salvo 1, +1 ECS channel     | +15% damage, +10% fire rate, −25% max HP                     |

Daily ops always fly STANDARD.

**Progression layers.** There are three, and they stay separate:
- **Run:** kills → credits → upgrades → base level → command tree → more complex threats. All of it resets every run.
- **Meta:** each run can set a record, and records unlock doctrines. Doctrines are only starting loadouts: they don't count toward base level and don't carry anything else between runs.
- **Daily op:** a fixed challenge with a fixed doctrine (STANDARD), scored by your best time for the day, on a local daily board.

**Daily op:** the same seed for everyone on the same (UTC) day, so the whole enemy schedule is identical: which enemies, packages, bearings, raids and strike packages. Your commands, radar mode and detection luck never touch that schedule. Normal waves, raids and strike packages each draw from their own seeded stream, and the waves' stream starts over at every level, so each level sends everyone the same things in the same order, however long earlier levels took. What play can change is pacing: how quickly you deal with a raid decides when the level ends, and a lost objective cuts the build window short. Your best time for the day is saved. `R` after a daily op flies it again.

**Daily board and seed sharing.** Every run has a **seed code**: `X5-<seed>-<doctrine>` for a normal run (same map, same raids, same loadout), `X5-D<date>` for a daily op. The start screen and the game-over card show it, and the result line (`C`) carries it. **PLAY A SEED** (`S` on the start screen) takes a code, or a friend's whole result line, and loads that run; press DEPLOY to fly it. A daily op's result line also puts your friend's time on that day's **daily board** as RIVAL. The board keeps the best 5 runs per day (yours and rivals') for the last 14 days, in `localStorage`; the start screen shows today's (or the loaded op's), the daily debrief shows where your run placed.

**Feedback:** every tactical event gets a sound, a mark on the scope and a line in the log. Kills that matter (`BIG_KILLS`: Su-34, jammer, ballistic missile) get more: a second blast and shock ring, a camera shake, a screen flash, a white banner and a sound of their own. Salvage flares a light column as it lands, and recovering it or reaching a new upgrade rank bursts bigger. That covers detection, lock acquired (a tick and a flash as the brackets snap on), lock lost (amber), launches, hits, kills (credit popups), ARM and Iskander launches and intercepts, jammers coming on station and going down, decoys classified, raids starting and ending, and battery hits (a red damage popup).

An enemy that reaches the base damages it and dies. When base HP hits 0, the game is over. Your best time, kills, level and credits earned are saved in `localStorage`. The game-over card has **COPY RESULT** (`C`), which copies a one-line result to paste into a chat. It also shows a **debrief**: kills by enemy type, each weapon's share of the damage dealt (with bars), the HP lost to each threat, clean raids, ARMs evaded and radar hits, the **best units** (by kills, sold ones included) and a **level by level** table: how long each level took, kills, HP lost, and whether it was held, lost or where the battery fell. A line over it names the threat that did the most damage and what to do about it next time.


## Sound
Effects and music run on separate buses with their own volumes (pause menu, remembered). The music is procedural like the effects: a low drone under a sparse minor-pentatonic arpeggio, calm in the build window and driving (faster, with a kick and hats) while a raid is in the air. Defaults and tempos are `AUDIO` in `config.ts`; `M` mutes everything.
