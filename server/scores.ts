// The scoreboard: finished runs in a local SQLite file. The board ranks players by their best run (time survived,
// then kills); a player is an account (server/accounts.ts), or, for runs logged before accounts, each run on its own.
// Served by server/api.ts: at /api/* by the production server (server/index.ts) and the Vite dev and preview servers.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openAccounts } from './accounts.ts';
import { EMPTY_CAREER, medalsOf, rankOf, streaks, xpOf, type Career } from './career.ts';

export type Run = { time: number; kills: number; level: number; earned: number; seed: string; daily: string };
// verified: logged by an account (0: a callsign run from before accounts); avatar: its patch code ('' for the default);
// xp: its career XP (the rank insignia).
export type Row = Run & { id: number; rank: number; name: string; verified: number; avatar: string; xp: number; at: string };
// promoted: the new rank's index if this run earned one; medals: the medals it won.
export type Placed = { run: Row; total: number; best: boolean; daily: { run: Row; rank: number; total: number } | null; promoted: number | null; medals: string[] };
export type Recent = Run & { id: number; at: string };

export const TOP = 10;

export function openScores(file: string) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS scores (
      id     INTEGER PRIMARY KEY,
      name   TEXT    NOT NULL,
      time   REAL    NOT NULL,
      kills  INTEGER NOT NULL,
      level  INTEGER NOT NULL,
      earned INTEGER NOT NULL,
      seed   TEXT    NOT NULL DEFAULT '',
      daily  TEXT    NOT NULL DEFAULT '',
      at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS scores_rank ON scores (daily, time DESC, kills DESC);`);
  const accounts = openAccounts(db);
  // Databases from before accounts: runs gain the account that logged them (NULL for the old callsign runs).
  if (!(db.prepare('PRAGMA table_info(scores)').all() as { name: string }[]).some(c => c.name === 'user_id'))
    db.exec('ALTER TABLE scores ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
  db.exec('CREATE INDEX IF NOT EXISTS scores_user ON scores (user_id)');

  // Each player's best run on a board (all-time when ?1 is '', else that daily op), ranked; ties share a rank.
  const ranked = `WITH best AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY COALESCE(user_id, -id) ORDER BY time DESC, kills DESC, id) AS rn
      FROM scores WHERE ?1 = '' OR daily = ?1)
    SELECT id, name, time, kills, level, earned, seed, daily, at, user_id, user_id IS NOT NULL AS verified,
      COALESCE((SELECT avatar FROM users WHERE users.id = user_id), '') AS avatar,
      CASE WHEN user_id IS NULL THEN 0 ELSE (SELECT CAST(SUM(kills) + SUM(time) / 5 AS INTEGER) FROM scores s2 WHERE s2.user_id = best.user_id) END AS xp,
      RANK() OVER (ORDER BY time DESC, kills DESC) AS rank FROM best WHERE rn = 1`;
  const top = db.prepare(`${ranked} ORDER BY rank, id LIMIT ?2`);
  const ofUser = db.prepare(`SELECT * FROM (${ranked}) WHERE user_id = ?2`);
  const ofRun = db.prepare(`SELECT * FROM (${ranked}) WHERE id = ?2`);
  const players = db.prepare(`SELECT COUNT(DISTINCT COALESCE(user_id, -id)) AS n FROM scores WHERE ?1 = '' OR daily = ?1`);
  const runs = db.prepare('SELECT COUNT(*) AS n FROM scores WHERE user_id = ?');
  const insert = db.prepare('INSERT INTO scores (name, time, kills, level, earned, seed, daily, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const totals = db.prepare(`SELECT COUNT(*) AS runs, COALESCE(SUM(kills), 0) AS kills, COALESCE(SUM(time), 0) AS time,
    COALESCE(SUM(earned), 0) AS earned, COALESCE(MAX(time), 0) AS bestTime, COALESCE(MAX(kills), 0) AS bestKills,
    COALESCE(MAX(level), 0) AS maxLevel, COUNT(DISTINCT NULLIF(daily, '')) AS dailies FROM scores WHERE user_id = ?`);
  const days = db.prepare('SELECT DISTINCT date(at) AS d FROM scores WHERE user_id = ? ORDER BY d');
  const recent = db.prepare('SELECT id, time, kills, level, earned, seed, daily, at FROM scores WHERE user_id = ? ORDER BY id DESC LIMIT ?');
  // What an account's runs add up to (server/career.ts turns it into XP, rank and medals).
  const career = (userId: number): Career => {
    const t = totals.get(userId) as Omit<Career, 'streak' | 'longestStreak'> | undefined;
    const s = streaks((days.all(userId) as { d: string }[]).map(r => r.d));
    return t ? { ...t, time: Math.round(t.time), streak: s.streak, longestStreak: s.longest } : { ...EMPTY_CAREER };
  };
  const clean = (r: Row | undefined) => { if (!r) return null; const { user_id: _, ...row } = r as Row & { user_id?: number }; return row as Row; };
  const total = (daily: string) => (players.get(daily) as { n: number }).n;
  const board = (daily: string, limit = TOP) => ({ rows: (top.all(daily, limit) as Row[]).map(r => clean(r)!), total: total(daily) });

  return {
    db, accounts, board,
    // Logs an account's run. Returns the player's standing after it: their best run with its rank, whether this run
    // is that best, and their rank on this run's daily op board if it was one.
    add(user: { id: number; name: string }, r: Run): Placed {
      const before = career(user.id);
      const id = Number(insert.run(user.name, r.time, r.kills, r.level, r.earned, r.seed, r.daily, user.id).lastInsertRowid);
      const best = clean(ofUser.get('', user.id) as Row)!;
      const day = r.daily ? clean(ofUser.get(r.daily, user.id) as Row) : null;
      const after = career(user.id), was = rankOf(xpOf(before)).index, now = rankOf(xpOf(after)).index, had = medalsOf(before);
      return { run: best, total: total(''), best: best.id === id, daily: day ? { run: day, rank: day.rank, total: total(r.daily) } : null,
        promoted: now > was ? now : null, medals: medalsOf(after).filter(m => !had.includes(m)) };
    },
    // An account's standing: its best run with its rank, and how many runs it has logged.
    player: (userId: number) => ({ best: clean(ofUser.get('', userId) as Row), runs: (runs.get(userId) as { n: number }).n, total: total('') }),
    career,
    recent: (userId: number, n = 10) => recent.all(userId, n) as Recent[],
    rankOf: (runId: number, daily = '') => clean(ofRun.get(daily, runId) as Row),
    close: () => db.close(),
  };
}
export type Scores = ReturnType<typeof openScores>;

// A posted run, checked: numbers in a sane range, and plausible. A run can't kill faster than the swarm spawns
// (MAX_KILL_RATE per second, with some slack for a short run) nor last longer than MAX_TIME. Runs aren't signed, so this
// only stops the obvious fakes; an account can still post a made-up plausible run. null if it isn't a run.
export const MAX_TIME = 6 * 3600, MAX_KILL_RATE = 20, MAX_LEVEL = 100;
export function parseRun(b: unknown): Run | null {
  if (!b || typeof b !== 'object') return null;
  const o = b as Record<string, unknown>;
  const num = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : NaN;
  const time = num(o.time, MAX_TIME), kills = num(o.kills, 1e7), level = num(o.level, MAX_LEVEL), earned = num(o.earned, 1e10);
  const seed = typeof o.seed === 'string' && /^X5-[A-Z0-9-]{1,20}$/.test(o.seed) ? o.seed : '';
  const daily = typeof o.daily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.daily) ? o.daily : '';
  if ([time, kills, level, earned].some(Number.isNaN)) return null;
  if (kills > MAX_KILL_RATE * time + 100) return null;
  return { time: Math.round(time * 10) / 10, kills: Math.floor(kills), level: Math.floor(level), earned: Math.floor(earned), seed, daily };
}
