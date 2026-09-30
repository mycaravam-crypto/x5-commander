// `npm test` — the production server (server/index.ts) on a real port, over a throwaway dist/. Throws on the first broken rule.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { request } from 'node:http';
import { createApp } from './index.ts';

const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };
const dir = mkdtempSync(join(tmpdir(), 'x5-')), dist = join(dir, 'dist');
mkdirSync(join(dist, 'assets'), { recursive: true });
writeFileSync(join(dist, 'index.html'), '<!doctype html><title>X5</title>');
writeFileSync(join(dist, 'assets', 'index-abc.js'), 'console.log(1);'.repeat(200));
writeFileSync(join(dir, 'secret.txt'), 'nope');

const app = createApp({ dist, db: join(dir, 'data', 'scores.db') });
await new Promise<void>(r => app.server.listen(0, '127.0.0.1', r));
const port = (app.server.address() as { port: number }).port, base = `http://127.0.0.1:${port}`;
// A raw request, so a path like /../secret.txt reaches the server as written.
const raw = (path: string, headers: Record<string, string> = {}) => new Promise<{ status: number; headers: Record<string, unknown>; body: Buffer }>((res, rej) => {
  request({ host: '127.0.0.1', port, path, headers }, r => { const c: Buffer[] = []; r.on('data', d => c.push(d)); r.on('end', () => res({ status: r.statusCode!, headers: r.headers, body: Buffer.concat(c) })); }).on('error', rej).end();
});
try {
  const page = await fetch(base + '/');
  ok(page.status === 200 && (await page.text()).includes('<title>X5'), 'serves the game at /');
  ok(page.headers.get('content-security-policy')?.includes("script-src 'self'") && page.headers.get('cache-control') === 'no-cache', 'the page has a CSP and is revalidated');
  ok(page.headers.get('x-content-type-options') === 'nosniff' && page.headers.get('x-frame-options') === 'DENY', 'security headers are set');
  const js = await raw('/assets/index-abc.js', { 'Accept-Encoding': 'gzip' });
  ok(js.status === 200 && js.headers['content-encoding'] === 'gzip' && gunzipSync(js.body).toString().startsWith('console.log'), 'assets are gzipped');
  ok(String(js.headers['cache-control']).includes('immutable') && String(js.headers['content-type']).startsWith('text/javascript'), 'hashed assets cache for good');
  ok((await raw('/../secret.txt')).status !== 200 && (await raw('/%2e%2e/secret.txt')).status !== 200, 'no reading outside dist');
  ok((await fetch(base + '/nope.js')).status === 404, 'a missing file is a 404');
  ok((await fetch(base + '/', { method: 'DELETE' })).status === 405, 'static files are read-only');
  ok((await (await fetch(base + '/healthz')).text()) === 'ok', 'health check answers');
  const json = { 'Content-Type': 'application/json' };
  const up = await fetch(base + '/api/signup', { method: 'POST', headers: json, body: JSON.stringify({ name: 'HOTEL', password: 'password1' }) });
  const cookie = up.headers.get('set-cookie')!.split(';')[0];
  const p = await fetch(base + '/api/scores', { method: 'POST', headers: { ...json, Cookie: cookie }, body: JSON.stringify({ time: 60, kills: 30, level: 2, earned: 500 }) });
  ok(up.status === 201 && p.status === 201 && (await (await fetch(base + '/api/scores')).json()).rows[0].name === 'HOTEL', 'the API is mounted and persists');
} finally { await app.close(); }

// Started the way deploy/ starts it, through a symlinked release dir: it must still run (not just import) and listen.
symlinkSync(resolve('server'), join(dir, 'current'));
const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(dir, 'current', 'index.ts')],
  { env: { ...process.env, PORT: '0', HOST: '127.0.0.1', X5_DIST: dist, X5_SCORES_DB: join(dir, 'data', 'link.db') }, stdio: ['ignore', 'pipe', 'inherit'] });
try {
  const line = await new Promise<string>((res, rej) => {
    child.stdout.on('data', d => res(String(d)));
    child.on('exit', c => rej(new Error(`server started through a symlink exited (${c}) instead of listening`)));
    setTimeout(() => rej(new Error('server started through a symlink never listened')), 5000);
  });
  ok(line.includes('x5-commander on http://'), 'starts through a symlinked release dir');
} finally { child.kill('SIGTERM'); rmSync(dir, { recursive: true, force: true }); }

console.log('ok · server');
