# X5 Commander

A browser air-defense RTS made from simple 3D shapes. You start with two anti-aircraft machine guns on a hill farm behind a river and build them up into a Patriot battery against an endless, escalating raid of drones, helicopters and strike jets. Every run gets a freshly generated map, and you can only engage what you can see: by eye at first, by radar once you've built one.

**SCAN → DETECT → LOCK → ENGAGE → DESTROY → EARN → UPGRADE → harder swarm → repeat**

System and threat names are real or announced systems, used for flavor only; the numbers are game balance, not real performance.

- [Gameplay guide](docs/gameplay.md): the full rules (radar, weapons, perimeter, levels, raids, bosses, ground assault, doctrines, daily ops)
- [Scoreboard server](docs/server.md): accounts, pilot profiles, API endpoints and security
- [Roadmap](docs/roadmap.md)

## Quick start

You need [Node.js](https://nodejs.org/) 23.6 or newer.

```sh
npm install
npm run dev      # then open the URL it prints (usually http://localhost:5173)
```

| Command                           | What it does |
|-----------------------------------|--------------|
| `npm run dev`                     | Dev server with the scoreboard API |
| `npm run build`                   | Type-checks, then builds a static site into `dist/` |
| `npm start`                       | Production server: serves `dist/` and the API (see [Self-hosting](#self-hosting)) |
| `npm test`                        | Headless check of the game simulation in Node |
| `npm run bench`                   | Sim timing under a heavy swarm: mean, median, p95 and worst ms per tick (e.g. `npm run bench -- 2000,3000 10`) |
| `npm run balance [seeds] [cap-s]` | Bots play many seeded runs and report median survival per doctrine and command-tree keystone |

## Controls

| Input                        | Action |
|------------------------------|--------|
| Space / Enter                | Start game |
| 1 – 4 (start screen)         | Pick a doctrine |
| N (start screen)             | Roll a new map |
| T (start screen)             | Training: a 3-minute drill of four waves |
| A (start screen)             | Ground assault: hold the line against robots on foot |
| H (start screen)             | Horde test: ground assault straight to THE TIDE |
| S (start screen)             | Play a seed code or a friend's result line |
| D                            | Start today's daily op |
| Left click                   | Build a bought unit, pick one of your units, or mark a contact as the priority target (needs radar) |
| U / Delete                   | Upgrade / sell the picked unit |
| B, or right-click ground     | Move the picked unit |
| N (build window)             | Start the next level now |
| Space (in play)              | Emergency intercept |
| G                            | Fire discipline: CONSERVE / BALANCED / MAXIMUM |
| T                            | Cycle auto-targeting mode |
| V                            | Radar mode: ACTIVE / FOCUSED / LPI |
| F                            | EMCON: silence the radar |
| K                            | Command tree |
| Tab                          | Show / hide the upgrade shop |
| O                            | Coverage map: off / faint / full |
| WASD / arrows / middle-drag  | Pan the camera |
| Mouse wheel                  | Zoom |
| Right-drag / Q / E           | Rotate the camera |
| Click the minimap            | Look there |
| X                            | 2× speed |
| P / Esc                      | Pause menu |
| M                            | Mute |
| C / R (game over)            | Copy your result line / restart |

Touch screens are supported: tap to mark, build or pick; drag to pan; pinch to zoom and twist to rotate. See the [gameplay guide](docs/gameplay.md) for everything else.

## Self-hosting

The game itself is fully static: no backend and no asset files, so `dist/` from `npm run build` runs on any static file host (it just won't show the online leaderboard). For accounts and the leaderboard, run the bundled Node server, which serves the game and the API on one port with no runtime dependencies, backed by SQLite (Node's built-in `node:sqlite`):

```sh
npm ci && npm run build
npm start        # http://localhost:8080
```

Or with Docker, keeping the database in a volume:

```sh
docker build -t x5-commander .
docker run -p 8080:8080 -v x5-data:/data x5-commander
```

| Variable          | Default | |
|-------------------|---------|---|
| `PORT` / `HOST`   | `8080` / `0.0.0.0` | Where to listen |
| `X5_SCORES_DB`    | `data/scores.db` (`/data/scores.db` in Docker) | The SQLite file |
| `X5_DIST`         | `dist` | The built game |
| `X5_TRUST_PROXY`  | off | `1` behind a reverse proxy: rate-limit by `X-Forwarded-For` |
| `X5_CORS_ORIGINS` | none | Comma-separated origins allowed to read the board from another site |
| `X5_POST_LIMIT`   | `20` | Runs one account may log per 10 minutes |

The server gzips and caches hashed assets, sets a Content-Security-Policy and other security headers, answers `GET /healthz` and shuts down cleanly on SIGTERM. Run it behind HTTPS (a reverse proxy or your platform's load balancer). SQLite needs a single instance on a persistent disk, so don't scale it out. Back up with `sqlite3 scores.db ".backup backup.db"`.

### Deploying to your own server

`deploy/` has scripts for an SSH-reachable Linux server running [Caddy](https://caddyserver.com/): atomic releases under `/var/www/x5-commander/releases/<timestamp>` with a `current` symlink, the Node server as a systemd user service (`x5-commander`) on `127.0.0.1:8095`, and Caddy in front for automatic HTTPS. The database lives in `shared/scores.db`, outside the releases, and is backed up to `shared/backups/` before every deploy (the last 10 are kept).

1. **Server setup (once):** install Node, create the directories, enable lingering and add the Caddy site block for your domain. The commands are in the header of [`deploy/Caddyfile`](deploy/Caddyfile). Point a DNS record for your domain at the server.
2. **Deploy by hand:**

   ```sh
   X5_DEPLOY_HOST=user@your-server X5_DOMAIN=game.example.com ./deploy/deploy.sh
   X5_DEPLOY_HOST=user@your-server ./deploy/rollback.sh [--list | <release>]
   ssh user@your-server journalctl --user -u x5-commander -f    # logs
   ```

   Optional: `X5_DEPLOY_PATH` (`/var/www/x5-commander`), `X5_PORT` (`8095`), `X5_KEEP_RELEASES` (`5`), `X5_SKIP_TESTS=1`.

Each deploy runs the tests and build, uploads the release, installs the service, flips `current` and restarts the service. If `/healthz` doesn't answer within 30 s, it flips back to the previous release.

**Deploy from GitHub Actions:** set the repository secrets `X5_DEPLOY_SSH_KEY` and `X5_DEPLOY_HOST` (and optionally `X5_DEPLOY_PATH`), plus the repository variable `X5_DOMAIN` so the workflow can check the live site. Every push to `main` that touches the game or server then deploys (`.github/workflows/deploy.yml`, also runnable from the Actions tab). Until the secrets are set, the workflow skips with a warning.

**GitHub Pages:** the Pages build is static. To give it a read-only leaderboard, set the repository variable `SCORES_API` to your server's `…/api/scores` URL and add the Pages origin to that server's `X5_CORS_ORIGINS`. Signing in and logging runs only work on the server's own origin.

## Project layout

```
src/config.ts        every tunable number: enemies, weapons, upgrades, the command tree, difficulty
src/sim.ts           pure game state + update(dt), no Three.js (testable in Node)
src/terrain.ts       the map, generated from the run's seed (pure; the sim uses it for building)
src/terrainPaint.ts  paints the map for the 3D ground and the minimap
src/render.ts        Three.js scene, reads state only
src/models.ts        low-poly enemy models: airframes and walkers
src/hud.ts           DOM HUD, minimap, shop, overlays
src/sfx.ts           WebAudio sound effects and music, no audio files
src/main.ts          boot, input, main loop
src/sim.check.ts     `npm test` self-check
src/balance.ts       `npm run balance` bot survival
src/bench.ts         `npm run bench` sim timing under load
server/              production server and scoreboard API
deploy/              deploy and rollback scripts, systemd unit, Caddy config
```

Built with TypeScript, Vite and Three.js. To rebalance the game, edit `src/config.ts`.

## Contributing

- `sim.ts` never touches rendering; `render.ts` and `hud.ts` only read state. No per-frame allocation of meshes or DOM.
- The daily op must stay deterministic: every spawn source draws from its own seeded stream.
- Every off-axis attack is telegraphed with a warning and bearing. Players should lose to gaps in their cover, not to surprises.
- Auto-place and the balance bots use the same `bestSpot()`, so the bots test real layouts. `terrain.ts` stays pure (no Three.js), and the map is a function of the run's seed alone, on its own random stream so it never shifts the enemy schedule.
- The sim ticks at a fixed step (`PERF.step` in `config.ts`, 1/60 s) whatever the refresh rate. In a dev build, `x5perf()` in the console gives the ms per frame of sim, render and HUD (`x5perf(true)` logs it every second).
- Keep the game runnable after every step: `npm test` and `npm run build` stay green, and new mechanics get cases in `sim.check.ts` and `balance.ts`.
