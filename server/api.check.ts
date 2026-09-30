// `npm test` — the API (server/api.ts) on a real port: accounts, sessions and logging runs. Throws on the first broken rule.
import { createServer } from 'node:http';
import { openScores } from './scores.ts';
import { scoresApi } from './api.ts';

const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };
const api = scoresApi(openScores(':memory:'), { postLimit: 3, authLimit: 8, cors: ['https://game.example'] });
const server = createServer((req, res) => api(req, res, () => { res.statusCode = 404; res.end(); }));
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;

// A tiny browser: keeps the session cookie between requests.
function client() {
  let cookie = '';
  return async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...body === undefined ? {} : { 'Content-Type': 'application/json' }, ...cookie ? { Cookie: cookie } : {}, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    return { status: r.status, headers: r.headers, json: await r.json().catch(() => null) as any };
  };
}
const run = (time: number, kills: number) => ({ time, kills, level: 2, earned: 500 });

try {
  const anon = client(), you = client(), rival = client();
  ok((await anon('/me')).json.user === null, 'signed out, /me has no user');
  ok((await anon('/scores', run(60, 5))).status === 401, 'logging a run needs an account');

  const up = await you('/signup', { name: 'iceman', password: 'topgun1986' });
  ok(up.status === 201 && up.json.user.name === 'ICEMAN', 'sign up');
  const cookie = up.headers.get('set-cookie')!;
  ok(/HttpOnly/.test(cookie) && /SameSite=Lax/.test(cookie) && !/Secure/.test(cookie), 'the session cookie is HttpOnly, SameSite, not Secure over plain HTTP');
  ok((await rival('/signup', { name: 'ICEMAN', password: 'whatever12' })).status === 409, 'a taken callsign is refused');
  ok((await rival('/signup', { name: 'no', password: 'whatever12' })).status === 400, 'a short callsign is refused');
  ok((await rival('/signup', { name: 'GOOSE', password: 'short' })).status === 400, 'a short password is refused');
  ok((await rival('/signup', { name: 'GOOSE', password: 'whatever12' })).status === 201, 'another player signs up');

  const p = await you('/scores', run(120, 40));
  ok(p.status === 201 && p.json.run.name === 'ICEMAN' && p.json.run.rank === 1 && p.json.best, 'a signed-in run is logged under the account');
  ok((await you('/scores', { ...run(120, 40), name: 'MAVERICK' })).json.run.name === 'ICEMAN', "a run can't claim another name");
  const me = (await you('/me')).json.user;
  ok(me.name === 'ICEMAN' && me.runs === 2 && me.best.rank === 1 && me.total === 1, '/me has the standing');
  ok((await you('/scores', run(10, 99999))).status === 400, 'an implausible run is rejected');
  const busy = await you('/scores', run(10, 1));
  ok(busy.status === 429 && Number(busy.headers.get('retry-after')) > 0, 'an account logging too many runs is held off');
  ok((await anon('/scores')).json.rows.length === 1, 'the board is public');

  const edit = await you('/profile', { avatar: '2.4.1', motto: '  Talk to me,   Goose ' });
  ok(edit.status === 200 && edit.json.profile.avatar === '2.4.1' && edit.json.profile.motto === 'Talk to me, Goose', 'edit your profile');
  ok((await you('/profile', { avatar: '9.9.9' })).status === 400 && (await you('/profile', { motto: 'x'.repeat(61) })).status === 400, 'bad profile edits are refused');
  ok((await anon('/profile', { motto: 'hi' })).status === 401, 'editing needs an account');
  const pub = (await anon('/profile?name=iceman')).json.profile;
  ok(pub.name === 'ICEMAN' && pub.motto === 'Talk to me, Goose' && pub.career.runs === 2 && pub.recent.length === 2 && pub.best.rank === 1 && !('pw' in pub) && !('id' in pub), 'profiles are public, without secrets');
  ok((await anon('/profile?name=nobody')).status === 404, 'no such pilot');
  ok((await you('/me')).json.user.career.runs === 2 && (await you('/me')).json.user.avatar === '2.4.1', '/me has the career and patch');
  ok((await anon('/scores')).json.rows[0].avatar === '2.4.1', 'the board shows patches');
  ok((await you('/logout', {})).status === 200 && (await you('/me')).json.user === null, 'sign out');
  ok((await you('/scores', run(60, 5))).status === 401, 'signed out, runs are refused again');
  ok((await you('/login', { name: 'ICEMAN', password: 'nope-nope' })).status === 401, 'a wrong password is refused');
  ok((await you('/login', { name: 'iceman', password: 'topgun1986' })).status === 200 && (await you('/me')).json.user.name === 'ICEMAN', 'sign back in');

  ok((await you('/scores', run(60, 5), { Origin: 'https://evil.example' })).status === 403, 'cross-site POSTs are refused');
  const form = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=a&password=b' });
  ok(form.status === 415, 'form posts are refused');
  const pre = await fetch(base + '/scores', { method: 'OPTIONS', headers: { Origin: 'https://game.example' } });
  ok(pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'https://game.example', 'an allowed origin can read the board');
  ok(!(await fetch(base + '/scores', { headers: { Origin: 'https://evil.example' } })).headers.get('access-control-allow-origin'), 'other origins get no CORS');
  ok((await anon('/nope')).status === 404 && (await anon('/login')).status === 405, 'unknown routes and methods');

  let limited = false;
  for (let i = 0; i < 6 && !limited; i++) limited = (await anon('/login', { name: 'GOOSE', password: `guess-${i}xx` })).status === 429;
  ok(limited, 'password guessing is rate limited');
  const proxied = scoresApi(openScores(':memory:'), { trustProxy: true });
  const s2 = createServer((req, res) => proxied(req, res, () => res.end()));
  await new Promise<void>(r => s2.listen(0, '127.0.0.1', r));
  const r = await fetch(`http://127.0.0.1:${(s2.address() as { port: number }).port}/api/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' }, body: JSON.stringify({ name: 'VIPER', password: 'password1' }) });
  s2.close();
  ok(/; Secure/.test(r.headers.get('set-cookie') ?? ''), 'behind an HTTPS proxy the cookie is Secure');
} finally { server.close(); }

console.log('ok · api');
