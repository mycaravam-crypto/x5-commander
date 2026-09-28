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

The game runs entirely in the browser, with no backend and no asset files. `dist/` can be hosted on any static file server.

## Controls

| Input                  | Action                                    |
|------------------------|-------------------------------------------|
| Space / Enter          | Start game                                |
| D                      | Start today's daily op                    |
| Left click             | Mark a contact as the priority target, or place a bought pad |
| Mouse wheel            | Zoom                                      |
| Right-drag / Q / E     | Rotate camera                             |
| Tab                    | Show / hide the upgrade shop              |
| T                      | Cycle the auto-targeting mode             |
| F                      | EMCON: silence the radar (toggle)         |
| 1 / 2 / 3              | Pick a perk when the base levels up       |
| P / Esc                | Pause                                     |
| M                      | Mute                                      |
| R                      | Restart after game over                   |

The game pauses by itself when the window loses focus.

## Gameplay

### Radar decides everything
A rotating radar sweep reveals enemies within its range. Each time the sweep passes over an enemy, there's a chance it gets detected. The chance depends on the enemy's signature and your radar resolution. **Undetected enemies are invisible and can't be shot.** A detected contact fades again after the radar's *persistence* time runs out.

### Radar threats and EMCON
The enemy fights your radar, not just your base.
- **Anti-radiation missiles (Kh-31P)** home on a radiating radar. Su-34s launch them once they're in range, and in the SEAD phase they arrive in salvos. A hit takes the radar **offline for 6 s** (repeated hits stack up to 12 s). You get warning: every launch sounds the radar-warning tone and shows its bearing.
- **EMCON (`F`)** stops the radar transmitting. Inbound ARMs lose the emitter and veer off, the radar stops draining power, but fire control drops every lock and contacts coast on track memory. Go silent early: an ARM that's already close still hits.
- **Decoys (Gerbera)** look exactly like Shaheds. Fire control tells them apart once a decoy has been locked for about 1.5 s, then releases it. Until then they waste lock slots and interceptors. *GaN T/R Modules* shorten that time.
- **Jammer helicopters (Mi-8MTPR-1)** stop outside the battery and circle it. Inside the sector they cover, detection chance drops to about a third. You see the jammer's bearing as an amber strobe, not its range. The jammer itself shows up clearly on radar, so mark it and kill it.

### Locking and targeting
Detected enemies are locked, up to your number of **lock slots**. A lock holds as long as the enemy stays within tracking range. All weapons fire automatically at locked targets. Left-click a contact to mark it as the priority target; it always gets a lock slot. Otherwise, the auto mode picks targets (`T` to cycle): **CLOSEST**, then **WEAKEST**, **RICHEST** and **FASTEST**, each unlocked by the *Target Logic* upgrade.

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
Your generator fills a power pool. The radar drains power continuously, and so do ammo production, pulse shots and railgun shots. **When power runs short, the radar sweep slows** (down to 25% speed), so you see less. Balancing seeing, shooting and building is the core tension of the game.

### Credits, upgrades and base levels
Kills earn credits. Killing quickly builds a **combo** worth up to +100% credits. There are 19 upgrades in 6 groups: BATTERY, POWER, SENSORS, FIRE CONTROL, WEAPONS and MAGAZINE. Each upgrade costs more with every level. Buying upgrades raises your **base level**, which adds visible structures to the base and offers a **perk draft: pick 1 of 3**. Every perk has a tradeoff, for example *GLASS CANNON*: +100% damage, −40% max HP. From base level 5, every draft also offers one **rule perk** (marked ★ NEW RULE) that changes how the battery plays, until you've taken them all: *TRACK FUSION* (locks hold while the radar is dark), *LPI WAVEFORM* (ARMs only find you inside 25 m), *OVERWATCH* (your marked target takes double damage), *ARC LASER* (laser jumps to 2 more targets; needs the laser), *SCAVENGER* (kills refund interceptors) and *FRAG WARHEADS* (PAC-3 hits splash).

### Enemies and phases
A new phase starts every 75 seconds and changes the enemy mix: **PROBING → SATURATION → ROTARY STRIKE → AIR STRIKE → SEAD → COMBINED RAID**. After COMBINED RAID, every phase adds a **condition** on top of that mix, looping in this order: **NIGHT RAID** (contacts fade twice as fast), **GROUND CLUTTER** (−30% detection), **LULL** (a breather to rebuild), **JAMMING STORM** (more jammer helicopters), **SWARM TIDE** (many more, weaker enemies) and **SEAD WAVE** (strike aircraft and ARMs). Every 150 seconds, a *STRIKE AIRCRAFT* warning appears.

**Raids:** from 1:50, a named raid arrives every 80 seconds, all from one bearing. It's announced 6 seconds ahead, with chevrons at the rim and a countdown in the side panel. Raids include SHAHED WAVE, LANCET PACK, FPV SWARM, DECOY SCREEN, HELO ASSAULT and SEAD STRIKE. Destroy the whole raid before anything hits the battery or the radar for a **clean-raid bonus**. Spawn rate, HP, speed and damage all increase steadily over time.

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

### The battery
The base is laid out like a Patriot site and grows with its level: AN/MPQ-65 radar and Engagement Control Station (ECS) at the start, then the EPP-III power plant, the OE-349 antenna mast, a Hensoldt TRML-4D 360° radar that turns with the sweep, earth berms, and at level 6 the LTAMDS radar upgrade with rear arrays. Every level adds an M903 launcher (up to 8). Buying laser, IRIS-T SLX or HPM adds their vehicles.

**Daily op:** the same seed for everyone on the same (UTC) day, so the whole enemy schedule is identical: which enemies, bearings, raids and perk drafts. Your best time for the day is saved. `R` after a daily op flies it again.

An enemy that reaches the base damages it and dies. When base HP hits 0, the game is over. Your best time, kills, level and credits earned are saved in `localStorage`.

## Project layout

```
src/config.ts     every tunable number: enemies, weapons, upgrades, perks, difficulty
src/sim.ts        pure game state + update(dt), no Three.js (testable in Node)
src/render.ts     Three.js scene, reads state only
src/hud.ts        DOM HUD, mini-radar, shop, overlays
src/sfx.ts        WebAudio sound effects, no audio files
src/main.ts       boot, input, main loop
src/sim.check.ts  `npm test` self-check
```

To rebalance the game, edit `src/config.ts`. Built with TypeScript, Vite and Three.js.
