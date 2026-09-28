# X5 Commander

A minimal browser tower defense game made from simple 3D shapes. You defend one base in the middle of the arena against an endless swarm that keeps getting harder. You can only shoot what your radar has found.

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
| Left click             | Mark a contact as the priority target     |
| Mouse wheel            | Zoom                                      |
| Right-drag / Q / E     | Rotate camera                             |
| Tab                    | Show / hide the upgrade shop              |
| T                      | Cycle the auto-targeting mode             |
| 1 / 2 / 3              | Pick a perk when the base levels up       |
| P / Esc                | Pause                                     |
| M                      | Mute                                      |
| R                      | Restart after game over                   |

The game pauses by itself when the window loses focus.

## Gameplay

### Radar decides everything
A rotating radar sweep reveals enemies within its range. Each time the sweep passes over an enemy, there's a chance it gets detected. The chance depends on the enemy's signature and your radar resolution. **Undetected enemies are invisible and can't be shot.** A detected contact fades again after the radar's *persistence* time runs out.

### Locking and targeting
Detected enemies are locked, up to your number of **lock slots**. A lock holds as long as the enemy stays within tracking range. All weapons fire automatically at locked targets. Left-click a contact to mark it as the priority target; it always gets a lock slot. Otherwise, the auto mode picks targets (`T` to cycle): **CLOSEST**, then **WEAKEST**, **RICHEST** and **FASTEST**, each unlocked by the *Target Logic* upgrade.

### Weapons
| Weapon  | Uses  | Notes                                     |
|---------|-------|-------------------------------------------|
| Cannon  | Ammo  | Aims ahead of moving targets; you start with it |
| Pulse   | Power | Instant, rapid beam                        |
| Missile | Ammo  | Homing, splash damage                      |
| Railgun | Power | Huge hit, pierces the whole line           |

### Power and ammo
Your generator fills a power pool. The radar drains power continuously, and so do ammo production, pulse shots and railgun shots. **When power runs short, the radar sweep slows** (down to 25% speed), so you see less. Balancing seeing, shooting and building is the core tension of the game.

### Credits, upgrades and base levels
Kills earn credits. Killing quickly builds a **combo** worth up to +100% credits. There are 19 upgrades in 6 groups: BASE, POWER, RADAR, TRACKING, WEAPONS and AMMO. Each upgrade costs more with every level. Buying upgrades raises your **base level**, which adds visible structures to the base and offers a **perk draft: pick 1 of 3**. Every perk has a tradeoff, for example *GLASS CANNON*: +100% damage, −40% max HP.

### Enemies and phases
A new phase starts every 75 seconds and changes the enemy mix: **SCOUTS → SWARM → ARMOR → ELITES → EVERYTHING**. Every 150 seconds, a *HEAVY CONTACT* elite warning appears. Spawn rate, HP, speed and damage all increase steadily over time.

| Enemy | Notes                                      |
|-------|--------------------------------------------|
| Scout | Fast, low signature, erratic               |
| Drone | Standard                                   |
| Swarm | Weak, arrives in packs of 6, hard to see  |
| Tank  | Slow, tough, hits hard                     |
| Elite | Very tough, big reward                     |

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
