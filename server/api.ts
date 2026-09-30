// The game's API, as connect-style middleware under /api (server/index.ts, and vite.config.ts for dev and preview):
//   GET  /api/scores[?daily=YYYY-MM-DD&limit=N]   → { rows, total }: players' best runs, ranked; total = players
//   POST /api/scores  { time, kills, level, earned, seed?, daily? }   (signed in) → { run, total, best, daily }
//   GET  /api/me                                  → { user: null | { name, best, runs, total } }
//   POST /api/signup  { name, password }          → { user }, and the session cookie
//   POST /api/login   { name, password }          → { user }, and the session cookie
//   POST /api/logout                              → {}, and the cookie cleared
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseRun, TOP, type Scores } from './scores.ts';
import { parseName, parsePassword, SESSION_DAYS, NAME_MIN, NAME_MAX, PASSWORD_MIN, type User } from './accounts.ts';

export type ApiOptions = {
  // Runs one client may log per window (by IP). Reads aren't limited.
  postLimit?: number; postWindowMs?: number;
  // Sign-up and sign-in attempts one client may make per window (by IP).
  authLimit?: number; authWindowMs?: number;
  // Origins allowed to read the board from another site (e.g. the game on GitHub Pages). Signing in and logging runs
  // need the game's own origin: the session cookie isn't sent cross-site.
  cors?: string[];
  // Behind a reverse proxy: take the client's IP from X-Forwarded-For (its last hop), and HTTPS from X-Forwarded-Proto.
  trustProxy?: boolean;
};

const COOKIE = 'x5_session';

// Allows `limit` hits per key per window; returns 0, or the seconds to wait.
function limiter(limit: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string, now = Date.now()) => {
    if (hits.size > 10_000) for (const [k, h] of hits) if (h.reset <= now) hits.delete(k); // forget old clients
    const h = hits.get(key);
    if (!h || h.reset <= now) { hits.set(key, { n: 1, reset: now + windowMs }); return 0; }
    return ++h.n > limit ? Math.ceil((h.reset - now) / 1000) : 0;
  };
}

const readJson = (req: IncomingMessage, max = 4096) => new Promise<unknown>((resolve, reject) => {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (c: string) => { body += c; if (body.length > max) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } });
  req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve(null); } });
  req.on('error', reject);
});

export function scoresApi(scores: Scores, opts: ApiOptions = {}) {
  const { postLimit = 20, postWindowMs = 10 * 60_000, authLimit = 20, authWindowMs = 10 * 60_000, cors = [], trustProxy = false } = opts;
  const runLimit = limiter(postLimit, postWindowMs), authLimited = limiter(authLimit, authWindowMs);
  const { accounts } = scores;
  const clientIp = (req: IncomingMessage) => {
    const fwd = trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1)!.trim() : '';
    return fwd || req.socket.remoteAddress || '?';
  };
  const https = (req: IncomingMessage) => 'encrypted' in req.socket && !!req.socket.encrypted
    || trustProxy && String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
  const token = (req: IncomingMessage) => {
    for (const part of String(req.headers.cookie ?? '').split(';')) {
      const [k, v] = part.trim().split('=');
      if (k === COOKIE && v) return v;
    }
    return undefined;
  };
  const setCookie = (req: IncomingMessage, res: ServerResponse, value: string, maxAge: number) =>
    res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https(req) ? '; Secure' : ''}`);
  // A POST from another site's page is refused outright (with SameSite=Lax cookies and JSON-only bodies, this is belt
  // and braces against cross-site requests).
  const foreign = (req: IncomingMessage) => {
    const origin = req.headers.origin;
    if (!origin) return false;
    try { return new URL(origin).host !== req.headers.host; } catch { return true; }
  };

  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/api/')) return next();
    const route = url.pathname.slice(5);
    const send = (code: number, body: unknown) => {
      if (res.writableEnded) return;
      res.statusCode = code;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body));
    };
    const origin = req.headers.origin;
    if (route === 'scores' && origin && (cors.includes('*') || cors.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', cors.includes('*') ? '*' : origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    const get = req.method === 'GET' || req.method === 'HEAD';
    try {
      if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
      if (route === 'scores' && get) {
        const daily = url.searchParams.get('daily') ?? '';
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || TOP));
        return send(200, scores.board(/^\d{4}-\d{2}-\d{2}$/.test(daily) ? daily : '', limit));
      }
      if (route === 'me' && get) {
        const u = accounts.user(token(req));
        return send(200, { user: u && { name: u.name, ...scores.player(u.id) } });
      }
      if (!['scores', 'signup', 'login', 'logout'].includes(route)) return send(404, { error: 'not found' });
      if (req.method !== 'POST') { res.setHeader('Allow', route === 'scores' ? 'GET, POST' : 'POST'); return send(405, { error: 'method' }); }
      if (foreign(req)) return send(403, { error: 'cross-site' });
      if (!String(req.headers['content-type'] ?? '').includes('application/json')) return send(415, { error: 'json only' });
      const ip = clientIp(req);

      if (route === 'logout') {
        accounts.logout(token(req));
        setCookie(req, res, '', 0);
        return send(200, {});
      }
      if (route === 'scores') {
        const user: User | null = accounts.user(token(req));
        if (!user) return send(401, { error: 'sign in to log runs' });
        const wait = runLimit(`${user.id}`) || runLimit(ip);
        if (wait) { res.setHeader('Retry-After', String(wait)); return send(429, { error: 'too many runs' }); }
        const run = parseRun(await readJson(req));
        if (!run) return send(400, { error: 'bad run' });
        return send(201, scores.add(user, run));
      }
      // signup / login
      const wait = authLimited(ip);
      if (wait) { res.setHeader('Retry-After', String(wait)); return send(429, { error: 'too many attempts' }); }
      const body = await readJson(req) as Record<string, unknown> | null;
      const name = parseName(body?.name), password = parsePassword(body?.password);
      if (route === 'signup') {
        if (!name) return send(400, { error: `callsign: ${NAME_MIN}-${NAME_MAX} letters, digits, _ . -` });
        if (!password) return send(400, { error: `password: at least ${PASSWORD_MIN} characters` });
        const r = await accounts.signup(name, password);
        if (r === 'taken') return send(409, { error: 'callsign taken' });
        setCookie(req, res, r.token, SESSION_DAYS * 86400);
        return send(201, { user: { name: r.user.name } });
      }
      const r = name && password ? await accounts.login(name, password) : null;
      if (!r) return send(401, { error: 'wrong callsign or password' });
      setCookie(req, res, r.token, SESSION_DAYS * 86400);
      return send(200, { user: { name: r.user.name } });
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status) return send(status, { error: (e as Error).message });
      console.error('api:', e);
      send(500, { error: 'server' });
    }
  };
}
