# X5 Commander

A minimal browser tower defense game made from simple 3D shapes. You command a Patriot air-defense battery against an endless, escalating raid of drones, helicopters and strike jets. You can only engage what your radar has found.

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
| `npm run balance [seeds] [cap-s]` | Bots play many seeded runs; median survival per doctrine and per perk |

The game runs entirely in the browser, with no backend and no asset files. `dist/` can be hosted on any static file server.

## Controls

| Input                  | Action                                    |
|------------------------|-------------------------------------------|
| Space / Enter          | Start game                                |
| Space (in play)        | Emergency intercept                       |
| G                      | Cycle fire discipline: CONSERVE / BALANCED / MAXIMUM |
| D                      | Start today's daily op                    |
| Left click             | Mark a contact as the priority target, or place a bought pad |
| Mouse wheel            | Zoom                                      |
| Right-drag / Q / E     | Rotate camera                             |
| Tab                    | Show / hide the upgrade shop              |
| T                      | Cycle the auto-targeting mode             |
| V                      | Cycle radar mode: ACTIVE / FOCUSED / LPI  |
| F                      | EMCON: silence the radar (toggle)         |
| 1 / 2 / 3              | Pick a perk when the base levels up       |
| 1 – 4 (start screen)   | Pick a doctrine                           |
| P / Esc                | Pause                                     |
| X                      | 2× speed (toggle)                         |
| M                      | Mute                                      |
| C                      | Copy your result line after game over     |
| R                      | Restart after game over                   |

The game pauses by itself when the window loses focus.

**Touch screens:** tap marks a contact or places a pad, one-finger drag rotates, pinch zooms. On-screen buttons cover the shop, EMCON, mode, 2× and pause.

The first time you meet each threat or mechanic, a short tip explains it. Tips don't come back once you've seen them.

## Gameplay

### Radar decides everything
A rotating radar sweep reveals enemies within its range (until you buy the AESA, below). Each time the sweep passes over an enemy, there's a chance it gets detected. The chance depends on the enemy's signature and your radar resolution. **Undetected enemies are invisible and can't be shot.** A detected contact fades again after the radar's *persistence* time runs out.

### LTAMDS AESA
A rotating radar can take at most 8 levels of *Scan Rate*. From base level 4 you can buy **LTAMDS AESA**, a staring array that covers all directions at once. It gives every contact the same number of looks a sweep would, at random moments. This adds +25% scan rate and removes the Scan Rate cap. The spinning sweep is replaced by faint beam flashes and a blip each time a contact is detected again, so the screen stays readable however fast you scan.

### Radar threats and EMCON
The enemy fights your radar, not just your base.
- **Anti-radiation missiles (Kh-31P)** home on a radiating radar. Su-34s launch them once they're in range, and in the SEAD phase they arrive in salvos. A hit takes the radar **offline for 6 s** (repeated hits stack up to 12 s). You get warning: every launch sounds the radar-warning tone and shows its bearing.
- **EMCON (`F`)** stops the radar transmitting. Inbound ARMs lose the emitter and veer off, the radar stops draining power, but fire control drops every lock and contacts coast on track memory. Go silent early: an ARM that's already close still hits.
- **Radar modes (`V`)**, each a trade-off. EMCON works on top of any of them.

  | Mode    | Detection                                          | Power drain | ARM exposure |
  |---------|----------------------------------------------------|-------------|--------------|
  | ACTIVE  | all round                                          | ×1          | normal       |
  | FOCUSED | a 120° arc on the bearing you last clicked (or your priority target): +30% range, +30% chance, about 3× the revisit rate. Blind everywhere else. LTAMDS AESA widens the arc to 180°. | ×1.4 | high: Su-34s launch from 25% further out, 30% more often |
  | LPI     | −15% range, −40% chance                            | ×0.6        | low: ARMs only find the radar inside 15 m, so most miss; Su-34s launch half as often |
- **Decoys (Gerbera)** look exactly like Shaheds. Fire control tells them apart once a decoy has been locked for about 1.5 s, then releases it. Until then they waste lock slots and interceptors. *GaN T/R Modules* shorten that time.
- **Jammer helicopters (Mi-8MTPR-1)** stop outside the battery and circle it. Inside the sector they cover, detection chance drops to about a third. You see the jammer's bearing as an amber strobe, not its range. The jammer itself shows up clearly on radar, so mark it and kill it.

### Locking and targeting
Detected enemies are locked, up to your number of **lock slots**. A lock holds as long as the enemy stays within tracking range. All weapons fire automatically at locked targets. Left-click a contact to mark it as the **priority target**: it always gets a lock slot, is engaged first and takes +25% damage, but painting it costs 1.2 power/s for as long as you hold it. Otherwise, the auto mode picks targets (`T` to cycle): **CLOSEST**, then **WEAKEST**, **RICHEST** and **FASTEST**, each unlocked by the *Target Logic* upgrade.

### Commands
- **Fire discipline (`G`)**: **CONSERVE** fires 25% slower, at 75% of weapon range, for 25% less ammo and power per shot. **BALANCED** is the default. **MAXIMUM** fires 40% faster and keeps firing until 1.6× a target's HP is in the air, for 30% more per shot.
- **Emergency intercept (`Space`)**: for 4 s every weapon, and every perimeter pad in reach, fires only at the priority target (or, with none marked, the visible threat nearest impact), 60% faster and past a sure kill. Costs 25 power and needs the radar up; 30 s cooldown.

### Weapons
| Weapon                   | Uses         | Notes                                                   |
|--------------------------|--------------|---------------------------------------------------------|
| PAC-3 MSE (Patriot)      | Interceptors | Hit-to-kill, leads moving targets; you start with it    |
| HEL 50 kW laser          | Power        | Instant, rapid beam                                     |
| IRIS-T SLX               | Interceptors | Homing, blast-frag splash; one extra launcher per level |
| Leonidas HPM (microwave) | Power        | Huge hit, affects everything along the line             |

### Perimeter defenses
From base level 2 you can buy perimeter pads: **MANTIS 35mm C-RAM** (fast gun, short range), **Stinger teams** (homing, mid range) and **EW jammers** (slow nearby contacts, drain power). Each base level opens 2 more pads, up to 8. Pads engage any radar contact in their own range without using a lock slot. After buying a pad, **click the map** to put it on the nearest free spot on the ring, facing where the threats come from. If you don't click within 8 seconds, it places itself toward the nearest contact.

### Power and ammo
Your generator fills a power pool. The radar drains power continuously, and so do interceptor production, laser shots and HPM shots. **When power runs short, the radar sweep slows** (down to 25% speed), so you see less. Balancing seeing, shooting and building is the core tension of the game.

### Credits, upgrades and base levels
Kills earn credits. Killing quickly builds a **combo** worth up to +100% credits. There are 23 upgrades in 7 groups: BATTERY, POWER, SENSORS, FIRE CONTROL, WEAPONS, MAGAZINE and PERIMETER. Each upgrade costs more with every level. There is **no max level**, except for *Threat Evaluation* and *LTAMDS AESA*, which are on/off, and Scan Rate before the AESA. Earth Revetments have diminishing returns, up to 85% less damage taken. Buying upgrades raises your **base level**, which adds visible structures to the base and offers a **perk draft: pick 1 of 3**. Every perk has a tradeoff, for example *GLASS CANNON*: +100% damage, −40% max HP. From base level 3, every draft also offers one **rule perk** (marked ★ NEW RULE) that changes how the battery plays, until you've taken them all. From level 3: *BLACKOUT PROTOCOL* (tracks coast twice as long when the radar goes dark, −30% memory while radiating), *COUNTER-SEAD* (each ARM shot down restores 20% power), *KILL CHAIN* (every 5 kills: +1 lock slot for 8 s), *OVERKILL* (damage past a kill jumps to the nearest contact within 8 m) and *LAST STAND* (below 25% HP: +50% fire rate, −40% power gen). From level 5: *TRACK FUSION* (locks hold while the radar is dark), *LPI WAVEFORM* (LPI mode keeps full detection), *OVERWATCH* (your marked target takes double damage), *ARC LASER* (laser jumps to 2 more targets; needs the laser), *SCAVENGER* (kills refund interceptors) and *FRAG WARHEADS* (PAC-3 hits splash).

### Enemies and phases
A new phase starts every 75 seconds and changes the enemy mix: **PROBING → SATURATION → ROTARY STRIKE → AIR STRIKE → SEAD → COMBINED RAID**. After COMBINED RAID, every phase adds a **condition** on top of that mix, looping in this order: **NIGHT RAID** (contacts fade twice as fast), **GROUND CLUTTER** (−30% detection), **LULL** (a breather to rebuild), **JAMMING STORM** (more jammer helicopters), **SWARM TIDE** (many more, weaker enemies) and **SEAD WAVE** (strike aircraft and ARMs). Every 150 seconds, a *STRIKE AIRCRAFT* warning appears.

**Attack packages:** from ROTARY STRIKE on, some spawns are a package instead of a single pack: several types flying in together from one bearing, each covering another's weakness. The log names the element to kill first.

| Package      | From | Composition                              | Kill first | Because                                             |
|--------------|------|------------------------------------------|------------|-----------------------------------------------------|
| JAMMED SWARM | 2:30 | Mi-8 escort, 12 FPV, 2 Shahed            | Mi-8       | the swarm flies inside the jammer's sector          |
| SEAD PACKAGE | 4:00 | Su-34, 2 Kh-31P, 3 decoys, Shahed        | Su-34      | decoys soak locks while the Su-34 keeps firing ARMs |
| SATURATION   | 5:00 | 6 decoys, Mi-8 escort, 3 Lancets, Mi-28  | Mi-28      | the heavy hides among decoys and fast Lancets       |

An EW helicopter in a package is an **escort**: it goes in first and holds station on the package's bearing instead of circling, so its jammed sector stays over the package.

**Raids:** from 1:50, a named raid arrives every 80 seconds, all from one bearing. Each one runs the same way:
1. **Warning and preparation (10 s):** a briefing card shows the sector, the raid's name, its composition, the objective and the bonus, with chevrons at the rim. Use the time to set radar, fire discipline and priority.
2. **Attack:** a siren sounds and the HUD frames turn amber. Normal spawns thin out to 40% while the raid is in the air, and the card tracks what's left and whether the objective still holds.
3. **Resolution:** the objective is **PROTECT BATTERY** (nothing in the raid lands) or, for SEAD STRIKE, **PROTECT RADAR** (no ARM hits the radar while the raid is on).
   - **Held:** the bonus pays out, then a **15 s recovery** with spawns at 30%.
   - **Lost:** no bonus, no recovery, and the **next raid comes 20 s sooner**.

Raids include SHAHED WAVE, LANCET PACK, FPV SWARM, DECOY SCREEN, HELO ASSAULT, ISKANDER SALVO and the package raids SWARM ASSAULT, SEAD STRIKE (led by a Su-34) and SATURATION STRIKE. An escort jammer flies with its raid but doesn't count toward it; ARMs a raid's Su-34 launches do.

Spawn rate, HP, damage and raid size grow **logarithmically**: each doubling of play time adds about the same threat. A strong battery can keep going indefinitely.

| Threat                      | Notes                                     |
|-----------------------------|-------------------------------------------|
| Lancet-3 loitering munition | Fast, low signature, erratic              |
| Shahed-136 attack drone     | Standard                                  |
| FPV strike swarm            | Weak, arrives in packs of 6, hard to see  |
| Mi-28NM attack helicopter   | Slow, tough, hits hard                    |
| Su-34 strike fighter        | Very tough, big reward, launches ARMs     |
| Gerbera decoy               | Looks like a Shahed, harmless, no reward  |
| Kh-31P anti-radiation missile | Very fast, knocks the radar offline     |
| Mi-8MTPR-1 EW helicopter    | Stands off and jams a sector              |
| Iskander-M ballistic missile | Very fast, big radar return, hits hard. **Only PAC-3 can hit it** |

### The battery
The base is laid out like a Patriot site and grows with its level: AN/MPQ-65 radar and Engagement Control Station (ECS) at the start, then the EPP-III power plant, the OE-349 antenna mast, a Hensoldt TRML-4D 360° radar that turns with the sweep, earth berms, and, once you buy the AESA, LTAMDS rear arrays. Every level adds an M903 launcher (up to 8). Buying laser, IRIS-T SLX or HPM adds their vehicles.

**Doctrines:** before a normal run, pick a starting loadout of free upgrade levels (they don't count toward base level). **STANDARD** is always available. The others unlock from your all-time records: **SENSOR NET** (survive 5:00), **LOGISTICS** (earn 5,000 credits in a run) and **FORWARD STRIKE** (reach base level 6). Daily ops always fly STANDARD.

**Daily op:** the same seed for everyone on the same (UTC) day, so the whole enemy schedule is identical: which enemies, bearings, raids and perk drafts. Your best time for the day is saved. `R` after a daily op flies it again.

An enemy that reaches the base damages it and dies. When base HP hits 0, the game is over. Your best time, kills, level and credits earned are saved in `localStorage`. The game-over card has **COPY RESULT** (`C`), which copies a one-line result to paste into a chat. It also shows a **debrief**: kills by enemy type, each weapon's share of the damage, clean raids, ARMs evaded and radar hits.

## Project layout

```
src/config.ts     every tunable number: enemies, weapons, upgrades, perks, difficulty
src/sim.ts        pure game state + update(dt), no Three.js (testable in Node)
src/render.ts     Three.js scene, reads state only
src/hud.ts        DOM HUD, mini-radar, shop, overlays
src/sfx.ts        WebAudio sound effects, no audio files
src/main.ts       boot, input, main loop
src/sim.check.ts  `npm test` self-check
src/balance.ts    `npm run balance` bot survey
```

To rebalance the game, edit `src/config.ts`. Built with TypeScript, Vite and Three.js.
