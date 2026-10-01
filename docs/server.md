# Scoreboard server

The API behind the online leaderboard, pilot profiles and accounts. How to run it is in the [README](../README.md#self-hosting).

`npm run dev`, `npm run preview` and `npm start` serve the game's API under `/api` (`server/api.ts`), backed by a local SQLite file (`data/scores.db`, or wherever `X5_SCORES_DB` points; Node's built-in `node:sqlite`, no extra packages).

Players sign up with a callsign and a password on the start screen or the debrief; there's no email. Signed in, every run is logged by itself when it ends, and the debrief shows whether it's a new personal best and where it puts you. The leaderboard ranks **players by their best run**: time survived, then kills, with ties sharing a rank. A daily op is ranked on that op's own board as well. Runs logged by callsign before accounts existed stay on the board (dimmed), each as its own entry. A static host has no API, so the board is simply left out.

## Pilot profiles

Profiles live in `server/career.ts`. Every pilot has:
- a **unit patch** as their avatar: a shape, an emblem and colours, drawn as SVG. They pick it on their profile card; until then, one is made from their callsign.
- a **career rank** from Recruit to General, earned with XP (a point a kill, a point per 5 s survived, over every run). The insignia shows next to their name on the board.
- **medals** for milestones, such as 100 kills in a run, surviving 15 minutes, 7 days in a row or 25 runs.
- an optional **motto**.

Click a pilot on the board to see their card: rank and XP, career numbers (total kills, time in combat, bests, daily ops, streak), medals won and to go, and their latest runs. The debrief announces promotions and new medals. All of it follows from the logged runs, so the database stores only the patch and the motto.

## Endpoints

| Endpoint | |
|---|---|
| `GET /api/scores[?daily=YYYY-MM-DD&limit=N]` | `{ rows, total }`: each player's best run with its rank; `total` is the number of players |
| `POST /api/scores` `{ time, kills, level, earned, seed?, daily? }` | Signed in: logs a run. `{ run, total, best, daily, promoted, medals }`: the player's best and rank, whether this run is that best, and any promotion or medals it won |
| `GET /api/me` | `{ user }`: the signed-in player's name, patch, motto, best run, rank, run count and career, or `null` |
| `POST /api/signup` / `POST /api/login` `{ name, password }` | Signs in (sets the cookie). Callsign 3-16 letters, digits, `_ . -`; password 8+ characters |
| `POST /api/logout` | Signs out |
| `GET /api/profile?name=CALLSIGN` | `{ profile }`: a pilot's patch, motto, enlistment date, career totals, best run and rank, latest 10 runs |
| `POST /api/profile` `{ avatar?, motto? }` | Signed in: sets your patch (`"shape.emblem.colour"`) and motto (up to 60 characters) |

## Security

Passwords are hashed with scrypt. A sign-in is a random session token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over HTTPS), valid for 90 days; the database keeps only its SHA-256. POSTs must be JSON from the game's own origin.

- **SQL:** every query is a prepared statement with bound parameters; no user value ever becomes SQL text.
- **Input:** it's checked on the way in. Callsigns are 3-16 of `A-Z 0-9 _ . -`. Patches are numeric codes. Mottos are one line of up to 60 characters, with control and bidi-override characters removed. Run fields must be numbers, and request bodies are capped at 4 KB.
- **Output:** the game re-checks everything the API returns (numbers must be numbers, dates must be dates, only known medal and rank ids) and HTML-escapes every string it draws. The page's Content-Security-Policy allows no inline or third-party script, so even an escaping bug couldn't run code. `npm test` renders the board, profile and debrief with hostile names, mottos and numbers and fails if any markup gets through.
- **Database:** the file holds password and session hashes, so it and its WAL and backups are created owner-only (600, directories 700), and an existing file is tightened on start. SQLite runs with `foreign_keys`, `trusted_schema = OFF` and `secure_delete`.
- **Cookies and headers:** over HTTPS the server sends HSTS, and the session cookie is `Secure`.

**Limits.** A run must be plausible to be logged (no more than 20 kills a second, at most 6 hours). An account can log 20 runs per 10 minutes, and one client can try 20 sign-ups or sign-ins per 10 minutes. Runs aren't signed, so a player can still post a made-up plausible score.
