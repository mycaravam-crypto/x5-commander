// The scoreboard: finished runs in a local SQLite file, ranked by time survived, then kills.
// No accounts yet: a run carries the callsign typed on the debrief. Served at /api/scores by the Vite dev and preview
// servers (vite.config.ts); a static host has no API, and the game just leaves the board out.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type Run = { name: string; time: number; kills: number; level: number; earned: number; seed: string; daily: string };
export type Row = Run & { id: number; rank: number; at: string };

export const NAME_MAX = 16, TOP = 10;

export function openScores(file: string) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;
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
  // Every run's rank on its board (all-time, or one daily op's), ties sharing a rank. '' as the board means all-time.
  const ranked = `SELECT *, RANK() OVER (ORDER BY time DESC, kills DESC) AS rank FROM scores WHERE ?1 = '' OR daily = ?1`;
  const top = db.prepare(`${ranked} ORDER BY rank, id LIMIT ?2`);
  const one = db.prepare(`SELECT * FROM (${ranked}) WHERE id = ?2`);
  const count = db.prepare(`SELECT COUNT(*) AS n FROM scores WHERE ?1 = '' OR daily = ?1`);
  const insert = db.prepare('INSERT INTO scores (name, time, kills, level, earned, seed, daily) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const board = (daily: string, limit = TOP) => ({ rows: top.all(daily, limit) as Row[], total: (count.get(daily) as { n: number }).n });
  return {
    board,
    // Adds a run; returns it with its rank on the all-time board, and on its daily op's board if it was one.
    add(r: Run) {
      const id = Number(insert.run(r.name, r.time, r.kills, r.level, r.earned, r.seed, r.daily).lastInsertRowid);
      const mine = one.get('', id) as Row;
      return { run: mine, total: board('').total, daily: r.daily ? { rank: (one.get(r.daily, id) as Row).rank, total: board(r.daily).total } : null };
    },
    close: () => db.close(),
  };
}
export type Scores = ReturnType<typeof openScores>;

// A posted run, checked: a callsign of letters, digits, spaces and - _ . and numbers in a sane range. null if it isn't one.
// Also plausible: a run can't kill faster than the swarm spawns (MAX_KILL_RATE per second, with some slack for a short
// run) nor last longer than MAX_TIME. There are no accounts or signed runs yet, so this only stops the obvious fakes.
export const MAX_TIME = 6 * 3600, MAX_KILL_RATE = 20, MAX_LEVEL = 100;
export function parseRun(b: unknown): Run | null {
  if (!b || typeof b !== 'object') return null;
  const o = b as Record<string, unknown>;
  const num = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : NaN;
  const name = typeof o.name === 'string' ? o.name.toUpperCase().replace(/[^A-Z0-9 _.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  const time = num(o.time, MAX_TIME), kills = num(o.kills, 1e7), level = num(o.level, MAX_LEVEL), earned = num(o.earned, 1e10);
  const seed = typeof o.seed === 'string' && /^X5-[A-Z0-9-]{1,20}$/.test(o.seed) ? o.seed : '';
  const daily = typeof o.daily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.daily) ? o.daily : '';
  if (!name || [time, kills, level, earned].some(Number.isNaN)) return null;
  if (kills > MAX_KILL_RATE * time + 100) return null;
  return { name, time: Math.round(time * 10) / 10, kills: Math.floor(kills), level: Math.floor(level), earned: Math.floor(earned), seed, daily };
}

export type ApiOptions = {
  // Runs one client may log per window (by IP). Reads aren't limited.
  postLimit?: number; postWindowMs?: number;
  // Origins allowed to call the API from another site (e.g. the game on GitHub Pages): '*' or a list. Default: same origin only.
  cors?: string[];
  // Behind a reverse proxy: take the client's IP from X-Forwarded-For (its last hop) instead of the socket.
  trustProxy?: boolean;
};

// Connect-style middleware for /api/scores:
//   GET  /api/scores[?daily=YYYY-MM-DD&limit=N]  → { rows, total }
//   POST /api/scores  { name, time, kills, level, earned, seed?, daily? }  → { run, total, daily }
export function scoresApi(scores: Scores, opts: ApiOptions = {}) {
  const { postLimit = 20, postWindowMs = 10 * 60_000, cors = [], trustProxy = false } = opts;
  const hits = new Map<string, { n: number; reset: number }>();
  const limited = (ip: string, now = Date.now()) => {
    if (hits.size > 10_000) for (const [k, h] of hits) if (h.reset <= now) hits.delete(k); // forget old clients
    const h = hits.get(ip);
    if (!h || h.reset <= now) { hits.set(ip, { n: 1, reset: now + postWindowMs }); return 0; }
    return ++h.n > postLimit ? Math.ceil((h.reset - now) / 1000) : 0;
  };
  const clientIp = (req: IncomingMessage) => {
    const fwd = trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1)!.trim() : '';
    return fwd || req.socket.remoteAddress || '?';
  };
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== '/api/scores') return next();
    const send = (code: number, body: unknown) => {
      res.statusCode = code;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body));
    };
    const origin = req.headers.origin;
    if (origin && (cors.includes('*') || cors.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', cors.includes('*') ? '*' : origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const daily = url.searchParams.get('daily') ?? '';
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || TOP));
      return send(200, scores.board(/^\d{4}-\d{2}-\d{2}$/.test(daily) ? daily : '', limit));
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(405, { error: 'method' }); }
    if (!String(req.headers['content-type'] ?? '').includes('application/json')) return send(415, { error: 'json only' });
    const wait = limited(clientIp(req));
    if (wait) { res.setHeader('Retry-After', String(wait)); return send(429, { error: 'too many runs' }); }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => { body += c; if (body.length > 4096 && !res.writableEnded) { send(413, { error: 'too large' }); req.destroy(); } });
    req.on('end', () => {
      if (res.writableEnded) return;
      let run: Run | null = null;
      try { run = parseRun(JSON.parse(body)); } catch { /* not JSON: rejected below */ }
      if (!run) return send(400, { error: 'bad run' });
      try { send(201, scores.add(run)); } catch (e) { console.error('scores: add failed', e); send(500, { error: 'server' }); }
    });
  };
}
