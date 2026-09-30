# X5 Commander

A browser air-defense RTS made from simple 3D shapes. You start with a section of two anti-aircraft machine guns on a hill farm behind a river, and build it up into a Patriot air-defense battery against an endless, escalating raid of drones, helicopters and strike jets. You build your defenses anywhere on open ground round the base, among woods, ponds and rock outcrops, on a map generated fresh for every run. You can only engage what you can see: by eye at first, by radar once you've built one.

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
| `npm run bench` | Times the simulation under a heavy swarm: mean, median, p95 and worst ms per tick at 600 and 1000 contacts (e.g. `npm run bench -- 2000,3000 10`) |
| `npm run balance [seeds] [cap-s]` | Bots play many seeded runs; median survival per doctrine and per perk, and what did the most damage |

The game runs entirely in the browser, with no backend and no asset files. `dist/` can be hosted on any static file server.

### Scoreboard and accounts

`npm run dev`, `npm run preview` and `npm start` serve the game's API under `/api` (`server/api.ts`), backed by a local SQLite file (`data/scores.db`, or wherever `X5_SCORES_DB` points; Node's built-in `node:sqlite`, no extra packages).

Players sign up with a callsign and a password on the start screen or the debrief; there's no email. Signed in, every run is logged by itself when it ends, and the debrief shows whether it's a new personal best and where it puts you. The leaderboard ranks **players by their best run**: time survived, then kills, with ties sharing a rank. A daily op is ranked on that op's own board as well. Runs logged by callsign before accounts existed stay on the board (dimmed), each as its own entry. A static host has no API, so the board is simply left out.

Passwords are hashed with scrypt. A sign-in is a random session token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over HTTPS), valid for 90 days; the database keeps only its SHA-256. POSTs must be JSON from the game's own origin.

| Endpoint | |
|---|---|
| `GET /api/scores[?daily=YYYY-MM-DD&limit=N]` | `{ rows, total }`: each player's best run with its rank; `total` is the number of players |
| `POST /api/scores` `{ time, kills, level, earned, seed?, daily? }` | Signed in: logs a run. `{ run, total, best, daily }`: the player's best and rank, and whether this run is that best |
| `GET /api/me` | `{ user }`: the signed-in player's name, best run, rank and run count, or `null` |
| `POST /api/signup` / `POST /api/login` `{ name, password }` | Signs in (sets the cookie). Callsign 3-16 letters, digits, `_ . -`; password 8+ characters |
| `POST /api/logout` | Signs out |

A run must be plausible to be logged (no more than 20 kills a second, at most 6 hours). An account can log 20 runs per 10 minutes, and one client can try 20 sign-ups or sign-ins per 10 minutes. Runs aren't signed, so a player can still post a made-up plausible score.

### Production

`npm start` runs the production server (`server/index.ts`): it serves the built `dist/` and the API on one port, with no packages needed at run time. It gzips and caches the hashed assets, and sets a Content-Security-Policy and other security headers. It answers `GET /healthz` and shuts down cleanly on SIGTERM.

```sh
npm ci && npm run build
npm start        # http://localhost:8080
```

Or with Docker, keeping the database in a volume:

```sh
docker build -t x5-commander .
docker run -p 8080:8080 -v x5-data:/data x5-commander
```

| Variable | Default | |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Where to listen |
| `X5_SCORES_DB` | `data/scores.db` (`/data/scores.db` in Docker) | The SQLite file |
| `X5_DIST` | `dist` | The built game |
| `X5_TRUST_PROXY` | off | `1` behind a reverse proxy: rate-limit by `X-Forwarded-For` |
| `X5_CORS_ORIGINS` | none | Comma-separated origins allowed to read the board from another site |
| `X5_POST_LIMIT` | `20` | Runs one account may log per 10 minutes |

Run it behind HTTPS (a reverse proxy or your platform's load balancer). SQLite needs one instance on a persistent disk, so don't scale it out. Back the database up with `sqlite3 scores.db ".backup backup.db"`.

#### Deploying to x5.vi0lins.de

Deployed the same way as vanspace3d, on the same server: atomic releases under `/var/www/x5-commander/releases/<timestamp>` with a `current` symlink, behind Caddy (HTTPS automatic). The difference is the Node server, which runs as a systemd user service (`x5-commander`) on `127.0.0.1:8095` with Caddy proxying to it. The scoreboard lives in `shared/scores.db`, outside the releases, and is backed up to `shared/backups/` before every deploy (the last 10 are kept).

1. One-time server setup (sudo): Node 24, the directories, `loginctl enable-linger` and the Caddy block. The commands are in the header of [`deploy/Caddyfile`](deploy/Caddyfile). Also add a DNS record for `x5.vi0lins.de`.
2. Repository secrets: `X5_DEPLOY_SSH_KEY` (the deploy key; vanspace3d's `VANSPACE_DEPLOY_SSH_KEY` works) and `X5_DEPLOY_HOST` (`mycaravam@vi0lins.de`). `X5_DEPLOY_PATH` is optional.
3. Every push to `main` that touches the game or server then deploys (`.github/workflows/deploy.yml`, or run it by hand from the Actions tab). Until the secrets are set, the workflow skips with a warning.

Each deploy runs the tests and build, uploads the release, installs the service, flips `current` and restarts the service. If `/healthz` doesn't answer within 30 s, it flips back to the previous release. By hand:

```sh
X5_DEPLOY_HOST=mycaravam@vi0lins.de ./deploy/deploy.sh
X5_DEPLOY_HOST=mycaravam@vi0lins.de ./deploy/rollback.sh [--list | <release>]
ssh mycaravam@vi0lins.de journalctl --user -u x5-commander -f    # logs
```

The GitHub Pages build is static. To give it a scoreboard, run the server somewhere, set the repository variable `SCORES_API` to its `…/api/scores` URL, and put the Pages origin in that server's `X5_CORS_ORIGINS`. The Pages build can only show the board: signing in and logging runs need the game's own origin (x5.vi0lins.de).

## Controls

| Input                  | Action                                    |
|------------------------|-------------------------------------------|
| Space / Enter          | Start game                                |
| T (start screen)       | Training: a 3-minute drill of four waves  |
| S (start screen)       | Play a seed: paste a seed code or a friend's result line |
| Space (in play)        | Emergency intercept                       |
| G                      | Cycle fire discipline: CONSERVE / BALANCED / MAXIMUM |
| D                      | Start today's daily op                    |
| N (start screen)       | Roll a new map                            |
| Left click             | Build a bought unit on open ground; pick one of your units; otherwise mark a contact as the priority target (needs the radar) |
| U / Delete             | Upgrade / sell the unit you picked         |
| B, or right-click ground | Move the unit you picked               |
| N                      | Start the next level now (in the build window; or tap START NOW on the level card) |
| WASD / arrows / middle-drag | Pan the camera                       |
| Mouse wheel            | Zoom                                      |
| Right-drag / Q / E     | Rotate camera                             |
| Click the minimap      | Look there                                |
| Tab                    | Show / hide the upgrade shop              |
| T                      | Cycle the auto-targeting mode             |
| V                      | Cycle radar mode: ACTIVE / FOCUSED / LPI  |
| F                      | EMCON: silence the radar (toggle)         |
| 1 / 2 / 3              | Pick a perk when the base levels up       |
| 1 – 4 (start screen)   | Pick a doctrine                           |
| P / Esc                | Pause menu: help, SFX / music volume, coverage overlay, reset tips |
| O                      | Coverage map: gaps, single cover and crossfire on the ground: off / faint / full (remembered) |
| X                      | 2× speed (toggle)                         |
| M                      | Mute                                      |
| C                      | Copy your result line (with its seed code) after game over |
| R                      | Restart after game over                   |

The game pauses by itself when the window loses focus.

**Touch screens:** tap marks a contact, builds or picks a unit (the MOVE button on the unit card moves it), one-finger drag pans, two fingers pinch to zoom and twist to rotate. Phones get a compact HUD: a thin HP / power / missile strip top-left with toggles for the minimap and the details list (remembered between runs) plus 2× and pause, and an icon bar at the bottom for shop, intercept, fire discipline, scan mode, EMCON and targeting mode, each showing its current setting.

The first time you meet each threat or mechanic, a short tip explains it. Tips don't come back once you've seen them, unless you press RESET TIPS (start screen or pause menu).

**Training.** A first-run drill of four short scripted waves on a fixed map, each with its lesson on screen: **eyesight** (guns fire at what they can see; build a third gun), **radar** (the radar and Patriot are handed over: see far, lock, mark a priority target), **ARMs and EMCON** (ARM salvos: go silent with `F`, then radiate again) and **decoys** (Gerberas among Shaheds, classified and greyed out once locked). The battery can't fall in training and no records are kept. The start screen offers it first until you've finished it once; `T` there starts it any time.

**Pause menu.** Resume or quit to the menu, SFX and music volumes, the coverage overlay mode, RESET TIPS, and a compact help panel: the key systems in a line each, and every hotkey.

## Gameplay

### The battlefield
The base sits on a low plateau in farmland. Ahead, toward the front, a cleared field of fire runs down to a river; woods, ponds, rock outcrops, fields and farmsteads lie round it, with hills beyond. Aircraft fly at their own heights over the ground (FPVs and cruise missiles low, Su-34s high, ballistic missiles diving in steeply), each with a faint line dropped to a ring on the ground so you can see where it is. They fly like aircraft: jets and drones bank round in arcs, helicopters slow into a hover and keep their nose on the battery (a Ka-52 sinks into the trees between salvos), Shaheds and Lancets come down in a dive, and heading home is a wide turn, not a U-turn on the spot. Missiles and Su-34s leave smoke and contrails, a badly hit aircraft trails smoke (then fire), and a shot-down one falls burning and leaves a fire where it hits the ground. It's scenery for the aircraft, but it decides where you can build, and the ground a unit stands on changes what it can do (see *Building the line*). NIGHT RAID turns the day to moonlight.

**Every run gets its own map**, generated from the run's seed: the river's course, woods, fields, roads, farmsteads, and the ponds and rock outcrops inside the build zone all change. Every map keeps the same rules: the plateau and the field of fire toward the front stay clear, the river stays beyond the build zone, the starting MG's spot is open, and at least 55% of the build zone is buildable. The start screen names the map (a grid reference); `N` rolls another. Picking a doctrine keeps the map. The daily op's map comes from its seed, so everyone flies over the same ground that day.

### Reading the HUD
- **Left panel:** battery, power and interceptor bars (with net flow per second), then three groups: SENSORS (radar mode, radar state, range, tracks), FIRE CONTROL (locks in use with a bar, fire discipline, target mode, intercept readiness) and BATTERY (pads, raid state, build window). The top bar shows the level you're on.
- **Minimap (under the left panel):** the terrain from above, turned with the camera: the build zone (dashed), your units (pale green), contacts (red, missiles amber), the front (red rim), the radar or eyesight range and the camera's view. Click it to look there.
- **Threat board (top right):** what's on the scope by type, and the 4 most urgent contacts (damage they'd do over time to impact). Amber means dangerous now; ◆ means locked.
- **Warnings (beside the left panel):** chips for critical states, with an alarm blip as each comes on: hull critical (red), power low / radar starved, interceptors low, locks full with contacts waiting, guns out of ammo, units down. Each stays up a moment after its cause clears. Thresholds are `WARN` in `config.ts`.
- **Shop:** until the radar is built, PERIMETER comes first. Rows waiting on something you don't own yet (the radar or the Patriot) are folded away, and a group with nothing else left shows only its header and what it needs. The row marked ◆ in amber is the suggested buy for the current bottleneck: a gun while there's a free unit slot, interceptors when the magazine runs low, generator when power starves the radar, hull when HP is low, ECS channels when contacts wait for a lock.

### Starting out: two guns and your eyes
A run starts with a command post and a section of two **12.7 mm AA machine guns**, dug in on the front. There is no radar and no Patriot yet:
- **Eyesight:** anything within 18 m of the base, or 15 m of an emplacement, is seen, radar or not. NIGHT RAID cuts that to 60%. Guns placed further out see further.
- **The MGs** fire by themselves at whatever they can see within 10 m (eyes reach further than the guns). The two starting guns stand either side of the front axis so their fields of fire cross on it. Each feeds from its own 40-round belt, not the interceptor stock, and takes 3 s to reload when the belt runs dry.
- **What's off without a radar:** locks, the priority target, radar modes, EMCON and the emergency intercept. ARMs have nothing to home on.
- **The shop** only offers what helps before the radar: guns and pads, hull, damage and fire rate. Power, sensors and fire control need the radar; the magazine needs the Patriot.
- **Milestones:** from base level 3 you can buy the **AN/MPQ-65 radar** (search and fire control), then the **PAC-3 MSE battery** (the Patriot, which needs the radar). Radar and Patriot perks only turn up in drafts once you have them.

### Radar decides everything
Once it's built, a rotating radar sweep reveals enemies within its range (until you buy the AESA, below). Each time the sweep passes over an enemy, there's a chance it gets detected. The chance depends on the enemy's signature and your radar resolution. **Undetected enemies are invisible and can't be shot.** A detected contact fades again after the radar's *persistence* time runs out.

### LTAMDS AESA
A rotating radar can take at most 8 levels of *Scan Rate*. From base level 4 you can buy **LTAMDS AESA**, a staring array that covers all directions at once. It gives every contact the same number of looks a sweep would, at random moments. This adds +25% scan rate and removes the Scan Rate cap. The spinning sweep is replaced by faint beam flashes and a blip each time a contact is detected again, so the screen stays readable however fast you scan.

### Radar threats and EMCON
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

### Locking and targeting
Detected enemies are locked, up to your number of **lock slots**. A lock holds as long as the enemy stays within tracking range. All weapons fire automatically at locked targets. Left-click a contact to mark it as the **priority target**: it always gets a lock slot, is engaged first and takes +25% damage, but painting it costs 1.2 power/s for as long as you hold it. Otherwise, the auto mode picks targets (`T` to cycle): **CLOSEST**, then **WEAKEST**, **RICHEST** and **FASTEST**, each unlocked by the *Target Logic* upgrade.

### Commands
- **Fire discipline (`G`)**: **CONSERVE** fires 25% slower, at 75% of weapon range, for 25% less ammo and power per shot. **BALANCED** is the default. **MAXIMUM** fires 40% faster and keeps firing until 1.6× a target's HP is in the air, for 30% more per shot.
- **Emergency intercept (`Space`)**: for 4 s every weapon, and every perimeter pad in reach, fires only at the priority target (or, with none marked, the visible threat nearest impact), 60% faster and past a sure kill. Costs 25 power and needs the radar up; 30 s cooldown.

### Weapons
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

### Perimeter defenses: building the line
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

### Power and ammo
Your generator fills a power pool, and everything draws on it in this order:
1. Fire control: 0.25/s for each lock held, plus 1.2/s while a priority target is marked.
2. The radar: ×1.4 in FOCUSED, ×0.6 in LPI, nothing in EMCON. **When power runs short, the radar sweep slows** (down to 25% speed), so you see less.
3. Interceptor production and Maintenance Crew repairs, from the surplus above 20% only.

Laser and HPM shots cost power as well. The power and interceptor bars show the net flow per second, so you can see which way the budget is going. Balancing seeing, shooting and building is the core tension of the game.

### Credits, upgrades and base levels
Kills earn credits. Killing quickly builds a **combo** worth up to +100% credits. There are 28 upgrades in 7 groups: BATTERY, POWER, SENSORS, FIRE CONTROL, WEAPONS, MAGAZINE and PERIMETER. Each upgrade costs more with every level. There is **no max level**, except for *Threat Evaluation*, the *radar*, the *PAC-3 battery* and *LTAMDS AESA*, which are on/off, and Scan Rate before the AESA. Earth Revetments have diminishing returns, up to 85% less damage taken. **Ranks:** every 5th level of an open-ended upgrade (not a pad) is a new rank and adds one free level on top. A bar under each shop row fills toward the next rank, and the buy that reaches it is marked ★. Every purchase shows what it bought, and the purchase sound climbs with the upgrade's level. The bar under BATTERY LV fills toward the next base level. Buying upgrades raises your **base level**, which adds visible structures to the base and offers a **perk draft: pick 1 of 3**. Every perk has a tradeoff, for example *GLASS CANNON*: +60% damage, −45% max HP. From base level 3, every draft also offers one **rule perk** (marked ★ NEW RULE) that changes how the battery plays, until you've taken them all. From level 3: *BLACKOUT PROTOCOL* (tracks coast twice as long when the radar goes dark, −30% memory while radiating), *COUNTER-SEAD* (each ARM shot down restores 20% power), *KILL CHAIN* (every 5 kills: +1 lock slot for 8 s), *OVERKILL* (damage past a kill jumps to the nearest contact within 8 m) and *LAST STAND* (below 25% HP: +50% fire rate, −40% power gen). From level 5: *TRACK FUSION* (locks hold while the radar is dark), *LPI WAVEFORM* (LPI mode keeps full detection), *OVERWATCH* (your marked target takes double damage), *ARC LASER* (laser jumps to 2 more targets; needs the laser), *SCAVENGER* (kills refund interceptors) and *FRAG WARHEADS* (PAC-3 hits splash).

### Salvage
Kills sometimes drop **salvage**: a spinning crate with a light over it. **Click it** to recover it: it stays on the ground until you do (up to 12 at once; while 12 are waiting, kills drop nothing more). Heavier kills drop more often (FPV under 1%, Shahed 3%, Mi-28 12%, Mi-8 30%, Su-34 40%; decoys never drop) and are more likely to drop tech:
- **Supply cache:** credits, 6× the kill's reward + 40.
- **Munitions / Power cell:** interceptors or power to full.
- **Repair kit:** +30% battery HP, and every unit is repaired.
- **Overdrive:** +50% fire rate for 12 s.
- **Salvaged tech** (rare): a free level of a random upgrade you can buy now. It doesn't count toward the base level.

Drops use their own random rolls, so they never change the daily op's enemy schedule.

### The front
Enemies attack from one direction: the **front**, a 50° sector at the top of the default view, marked on the ground (red dashes at the rim) and on the minimap. Aircraft and short-range drones (Lancet, FPV, Mi-28, Su-34, Mi-8 and their ARMs) always come from the front. Long-range threats (Shaheds, the decoys that fly with them, Orlan-10s, Ka-52s and every missile but the ARM) come from the front too at first. From level 4 (FLANKS) they can come from up to 60° either side of it, from level 5 up to 120°, and after the scripted levels from any direction. The minimap and the ground show the arc they can currently come from in amber, and the minimap flashes an amber tick at the bearing of every missile launch. A raid or package comes off the front only when everything in it is a long-range threat.

### Levels
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
3. **Resolution:** the objective is **PROTECT BATTERY** (nothing in the raid lands) or, for SEAD STRIKE, **PROTECT RADAR** (no ARM hits the radar while the raid is on).
   - **Held:** the bonus pays out, then a **20 s build window**.
   - **Lost:** no bonus, and only an **8 s build window**.
   Either way, the level ends when the last aircraft of the raid is gone.

Raids include SHAHED WAVE, LANCET PACK, FPV SWARM, DECOY SCREEN, HELO ASSAULT, ISKANDER SALVO, CRUISE SALVO and the package raids SWARM ASSAULT, SEAD STRIKE (led by a Su-34) and SATURATION STRIKE, and late in a run EW BARRAGE (level 8: two jammers over cruise missiles, decoys, Shaheds and Lancets) COMBINED STRIKE (level 9: a Su-34, Mi-28s, FPVs and cruise missiles), ALLIGATOR HUNT (level 6: Ka-52s with an Orlan-10 spotting and FPVs), SATURATION WAVE (level 8: many FPVs, decoys and Shaheds over a few Kh-101s and an Iskander) HYPERSONIC STRIKE (level 10: Kinzhals and an Iskander behind Kh-55 decoys), GROUND ATTACK (level 7: Su-25s under Lancets) and SEAD SWEEP (level 9: a Su-35S and a Su-34 with ARMs, decoys and Shaheds; PROTECT RADAR). An escort jammer flies with its raid but doesn't count toward it; ARMs a raid's Su-34 launches do.

Spawn rate, HP and damage grow **logarithmically** with play time, and raid size with the level: each doubling adds about the same threat. **After 12 minutes the war escalates:** enemy HP grows 12% and damage 6% per minute (compounding), and numbers 5% per minute. Upgrades cost more with every level, so the surge outruns any battery sooner or later: every run ends, and the question is when.

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

**Doctrines:** before a normal run, pick a doctrine: a starting loadout of free upgrade levels (they don't count toward base level) and a trade that holds for the whole run, through every level-up and perk (the start screen shows it in amber). **STANDARD** is always available and has no trade. The others unlock from your all-time records:

| Doctrine       | Unlock                  | Starting loadout                         | All run                                                      |
|----------------|-------------------------|------------------------------------------|--------------------------------------------------------------|
| SENSOR NET     | survive 5:00            | radar and Patriot, LTAMDS Array 1        | +15% radar range, +30% contact memory, −10% damage           |
| LOGISTICS      | earn 5,000 credits      | Generator 2, Canisters 2, Reload 2       | upgrades 12% cheaper, +30% interceptor production, −12% damage |
| FORWARD STRIKE | reach base level 6      | Lethality 2, Salvo 1, +1 ECS channel     | +15% damage, +10% fire rate, −25% max HP                     |

Daily ops always fly STANDARD.

**Progression layers.** There are three, and they stay separate:
- **Run:** kills → credits → upgrades → base level → perks → more complex threats. All of it resets every run.
- **Meta:** each run can set a record, and records unlock doctrines. Doctrines are only starting loadouts: they don't count toward base level and don't carry anything else between runs.
- **Daily op:** a fixed challenge with a fixed doctrine (STANDARD), scored by your best time for the day, on a local daily board.

**Daily op:** the same seed for everyone on the same (UTC) day, so the whole enemy schedule is identical: which enemies, packages, bearings, raids and perk drafts. Your commands, radar mode and detection luck never touch that schedule. Normal waves, raids and strike packages each draw from their own seeded stream, and the waves' stream starts over at every level, so each level sends everyone the same things in the same order, however long earlier levels took. What play can change is pacing: how quickly you deal with a raid decides when the level ends, and a lost objective cuts the build window short. Your best time for the day is saved. `R` after a daily op flies it again.

**Daily board and seed sharing.** Every run has a **seed code**: `X5-<seed>-<doctrine>` for a normal run (same map, same raids, same loadout), `X5-D<date>` for a daily op. The start screen and the game-over card show it, and the result line (`C`) carries it. **PLAY A SEED** (`S` on the start screen) takes a code, or a friend's whole result line, and loads that run; press DEPLOY to fly it. A daily op's result line also puts your friend's time on that day's **daily board** as RIVAL. The board keeps the best 5 runs per day (yours and rivals') for the last 14 days, in `localStorage`; the start screen shows today's (or the loaded op's), the daily debrief shows where your run placed.

**Feedback:** every tactical event gets a sound, a mark on the scope and a line in the log. Kills that matter (`BIG_KILLS`: Su-34, jammer, ballistic missile) get more: a second blast and shock ring, a camera shake, a screen flash, a white banner and a sound of their own. Salvage flares a light column as it lands, and recovering it or reaching a new upgrade rank bursts bigger. That covers detection, lock acquired (a tick and a flash as the brackets snap on), lock lost (amber), launches, hits, kills (credit popups), ARM and Iskander launches and intercepts, jammers coming on station and going down, decoys classified, raids starting and ending, and battery hits (a red damage popup).

An enemy that reaches the base damages it and dies. When base HP hits 0, the game is over. Your best time, kills, level and credits earned are saved in `localStorage`. The game-over card has **COPY RESULT** (`C`), which copies a one-line result to paste into a chat. It also shows a **debrief**: kills by enemy type, each weapon's share of the damage dealt (with bars), the HP lost to each threat, clean raids, ARMs evaded and radar hits, the **best units** (by kills, sold ones included) and a **level by level** table: how long each level took, kills, HP lost, and whether it was held, lost or where the battery fell. A line over it names the threat that did the most damage and what to do about it next time.

## Roadmap

This section replaces the old `plan-mvp.md`, `plan.md` and `plan-frontline.md`; they are still in git history.

### Shipped
- **MVP:** the core loop (detect → lock → shoot → credits → upgrade → base level → perks → game over), the upgrade shop, juice and sound, 2,000 pooled enemy instances.
- **Green radar look:** wireframe models over a polar grid with a CRT pass. Replaced by the terrain view (below); it's in git history.
- **Terrain and free building:** a fixed map (`terrain.ts`: river, woods, ponds, rock outcrops, roads, fields, hills) drawn as a lit 3D scene with shadows, trees and a day / night grade; solid vehicle and aircraft models flying at their own heights; an RTS camera (pan, rotate, zoom, minimap to jump); units built anywhere on open ground in a build zone that grows with the base, with a ghost that previews coverage.
- **Onboarding and balance pass:** start screen matches the one-gun start; shop puts PERIMETER first before the radar, folds away what needs the radar or Patriot, and suggests a gun while unit slots are free; the balance bot builds and places units like a player; the first Su-34 strike carries one bomb; a late-game surge so every run ends; the debrief shows what hurt the battery.
- **Random maps:** every run's terrain is generated from its seed (`terrain.ts` `setMap`), with the layout rules checked in `npm test`.
- **Tactical look on the terrain:** the green phosphor HUD is back (monospace, corner-bracket frames, scanlines) over the terrain, which gets a part-green tactical grade and a faint range / bearing grid; NIGHT RAID turns it into a night-vision scope. Phones and tablets get a lighter pipeline (no real-time shadows or bloom, smaller ground texture, capped pixel ratio), and a WebGL failure shows a message instead of a blank page.
- **Front line, steps 1–5:** the front and widening flank arcs, levels with raids and build windows, the AA MG start with the radar and Patriot as milestones, belt slots with fields of fire, crossfire, support units and unit HP, the coverage overlay (`O`), and Kh-101 cruise missiles with the IRIS-T SLM to stop them.
- **Threat realism:** Orlan-10 spotter, Ka-52, Su-25 attack runs with S-8 rockets, Su-35S SEAD with memory-seeker Kh-58s, Kinzhal and the Kh-55 decoy; per-type height, RCS and heat signature, a radar horizon by height, FPV swarms that hunt isolated units, and salvage that stays until clicked.
- **Defence layers:** reaches in the real order (HPM 7, MG 10, HEL 11, MANTIS 15, Stinger 24, IRIS-T SLM 40, SLX 50, PAC-3 58, radar 68 m) on a 75 m arena; the laser and HPM are self-cueing point defence; a two-gun start with crossing fields of fire.
- **Performance pass:** a fixed 1/60 s sim step, throttled HUD text, lighter effects on LITE, bloom that switches itself off under slow frames, and `npm run bench` with p95 and worst-case timings.

### Next: finish the front line (step 6)
- [x] **Level card** at the end of each level: held or lost, what the next level brings, wider flank arcs.
- [x] **Build window as its own state:** 60% speed, shop open, the build zone highlighted, `N` to skip it. Missile launches flash at their bearing on the minimap.
- [ ] **Map polish:** draw the belts as dim dashed arcs and shade enemy territory beyond the front.
- [x] **Rebalance:** levels follow the threat sequence (FPVs, helicopters, flanks, cruise and EW, then SEAD; the Su-34 at level 4 was a wall about 60 s after the Patriot came online).
- [ ] **Rebalance perks** with `npm run balance`: with the late-game surge the bots' runs end between about 30 and 50 minutes, so perks can be compared again.

### Placement extras
- [ ] **Tier-3 branch** for guns: at the ZU-23 (the MG's top tier; MANTIS is its own unit), pick *AP rounds* against Mi-28s or *high rate* against swarms.
- [ ] **Power node** (with the energy weapons, level 7+): laser and HPM draw power only within its reach, so it decides where they can go.
- [x] **Terrain that fights:** *high ground* by rock outcrops (+20% range and eyes, drones and cruise missiles go for it), *treeline* edge (never targeted, −15% range), *road* (fast MG reloads). Half build cost on the road was dropped: roads run through the build zone and out toward the front, so it would have halved the price of much of the gun line.
- [ ] **Terrain that blocks:** woods or ridges that block eyesight.
- [ ] **Base buildings as units:** build the generator, ammo bunker, radar and launchers on their own spots instead of in a fixed compound.

### Later ideas
- A front that moves back after a held level, giving more depth for the next one.
- Achievements, more arenas, boss enemies.

### Sound
Effects and music run on separate buses with their own volumes (pause menu, remembered). The music is procedural like the effects: a low drone under a sparse minor-pentatonic arpeggio, calm in the build window and driving (faster, with a kick and hats) while a raid is in the air. Defaults and tempos are `AUDIO` in `config.ts`; `M` mutes everything.

### Ground rules for any change
- `sim.ts` never touches rendering; `render.ts` and `hud.ts` only read state. No per-frame allocation of meshes or DOM.
- The daily op must stay deterministic: every spawn source draws from its own seeded stream.
- Every off-axis attack is telegraphed with a warning and bearing. Players should lose to gaps in their cover, not to surprises.
- Auto-place and the balance bots use the same `bestSpot()`, so the bots test real layouts. Where you can build comes from `terrain.ts`, which the sim reads too: it stays pure (no Three.js) and the map is a function of the run's seed alone (its own random stream, so it never shifts the enemy schedule).
- The sim ticks at a fixed step (`PERF.step` in `config.ts`, 1/60 s, as the tests and bots run it) whatever the refresh rate; the render draws contacts and shots along their velocity for the time since the last tick. In a dev build, `x5perf()` in the console gives the ms per frame of sim, render and HUD (`x5perf(true)` logs it every second). The HUD's text panels refresh every `PERF.hudSlow` s; bars and warnings every frame. On a desktop, bloom turns itself off for the session if frames stay slow (`PERF.bloomOff`).
- Keep the game runnable after every step. `npm test` and `npm run build` stay green, and new mechanics get cases in `sim.check.ts` and `balance.ts`.

## Project layout

```
src/config.ts     every tunable number: enemies, weapons, upgrades, perks, difficulty
src/sim.ts        pure game state + update(dt), no Three.js (testable in Node)
src/terrain.ts    the map, generated from the run's seed: ground types, heights, trees (pure, the sim uses it for building)
src/terrainPaint.ts paints the map for the 3D ground and the minimap
src/render.ts     Three.js scene, reads state only
src/hud.ts        DOM HUD, minimap, shop, overlays
src/sfx.ts        WebAudio sound effects, no audio files
src/main.ts       boot, input, main loop
src/sim.check.ts  `npm test` self-check
src/balance.ts    `npm run balance` bot survival
src/bench.ts      `npm run bench` sim timing under load
```

To rebalance the game, edit `src/config.ts`. Built with TypeScript, Vite and Three.js.
