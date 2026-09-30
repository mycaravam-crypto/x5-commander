// `npm start` — the production server: the built game (dist/) and the scoreboard API on one port, no other packages.
//   PORT (8080) · HOST (0.0.0.0) · X5_SCORES_DB (data/scores.db) · X5_DIST (dist)
//   X5_TRUST_PROXY=1 behind a reverse proxy · X5_CORS_ORIGINS=https://a.example,https://b.example for a game hosted elsewhere
//   X5_POST_LIMIT (20 runs per client per 10 min)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { openScores, scoresApi, type ApiOptions } from './scores.ts';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};
const GZIP = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.map']);

// The page gets its own origin only; styles allow inline (the HUD sets style attributes), images data: (the favicon).
const CSP = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "connect-src 'self'",
  "font-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'none'"].join('; ');

export type AppOptions = ApiOptions & { dist: string; db: string };

export function createApp(o: AppOptions) {
  const scores = openScores(o.db);
  const api = scoresApi(scores, o);
  const root = resolve(o.dist);
  // Built files don't change while the server runs: read (and gzip) each once.
  const cache = new Map<string, { body: Buffer; gz?: Buffer } | null>();
  async function load(file: string) {
    if (cache.has(file)) return cache.get(file)!;
    let hit: { body: Buffer; gz?: Buffer } | null = null;
    try {
      if ((await stat(file)).isFile()) {
        const body = await readFile(file);
        hit = { body, gz: GZIP.has(extname(file)) && body.length > 1024 ? gzipSync(body) : undefined };
      }
    } catch { /* missing: 404 */ }
    if (cache.size < 500) cache.set(file, hit);
    return hit;
  }

  const headers = (res: ServerResponse) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  };

  async function serveStatic(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); return res.end(); }
    let path: string;
    try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname); } catch { res.statusCode = 400; return res.end(); }
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(join(root, normalize(path)));
    if (file !== root && !file.startsWith(root + sep)) { res.statusCode = 403; return res.end(); }
    const hit = await load(file);
    if (!hit) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end('not found'); }
    const ext = extname(file);
    res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
    // Vite hashes everything under assets/: cache it for good. The page itself is checked every time.
    res.setHeader('Cache-Control', path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (ext === '.html') res.setHeader('Content-Security-Policy', CSP);
    const gz = hit.gz && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    if (hit.gz) res.setHeader('Vary', 'Accept-Encoding');
    if (gz) res.setHeader('Content-Encoding', 'gzip');
    const body = gz ? hit.gz! : hit.body;
    res.setHeader('Content-Length', body.length);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  const server = createServer((req, res) => {
    headers(res);
    const done = (e: unknown) => { console.error('server:', e); if (!res.headersSent) { res.statusCode = 500; res.end(); } else res.destroy(); };
    try {
      if (req.url === '/healthz') { res.setHeader('Content-Type', 'text/plain'); res.setHeader('Cache-Control', 'no-store'); scores.board('', 1); return res.end('ok'); }
      api(req, res, () => { serveStatic(req, res).catch(done); });
    } catch (e) { done(e); }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  const close = () => new Promise<void>(r => server.close(() => { scores.close(); r(); }));
  return { server, close };
}

// Run directly, not imported. Compared as real paths: started through a symlink (deploy's current/), argv keeps the
// link while import.meta.url has the file it points to.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const env = process.env;
  const app = createApp({
    dist: env.X5_DIST ?? 'dist',
    db: env.X5_SCORES_DB ?? 'data/scores.db',
    trustProxy: env.X5_TRUST_PROXY === '1',
    cors: (env.X5_CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
    postLimit: Number(env.X5_POST_LIMIT) || undefined,
  });
  const port = Number(env.PORT) || 8080, host = env.HOST ?? '0.0.0.0';
  app.server.listen(port, host, () => console.log(`x5-commander on http://${host}:${port}`));
  let stopping = false;
  const stop = (sig: string) => {
    if (stopping) return; stopping = true;
    console.log(`${sig}: shutting down`);
    app.server.closeIdleConnections();
    setTimeout(() => process.exit(1), 10_000).unref();
    app.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}
