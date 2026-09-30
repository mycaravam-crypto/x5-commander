// `npm test` — the scoreboard against an in-memory database, and its HTTP API on a real port. Throws on the first broken rule.
import { createServer } from 'node:http';
import { openScores, parseRun, scoresApi, TOP } from './scores.ts';

const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };
const run = (name: string, time: number, kills: number, daily = '') => ({ name, time, kills, level: 3, earned: 1000, seed: 'X5-ABC-0', daily });

const db = openScores(':memory:');
ok(db.board('').total === 0 && db.board('').rows.length === 0, 'a new board is empty');
const a = db.add(run('ALPHA', 300, 50));
ok(a.run.rank === 1 && a.total === 1 && a.daily === null, 'the first run is #1');
const b = db.add(run('BRAVO', 400, 10));
ok(b.run.rank === 1 && db.board('').rows[1].name === 'ALPHA', 'longer survival outranks more kills');
const c = db.add(run('CHARLIE', 300, 60));
ok(c.run.rank === 2, 'kills break a tie on time');
const d = db.add(run('DELTA', 300, 60));
ok(d.run.rank === 2 && db.board('').rows.map(r => r.rank).join() === '1,2,2,4', 'equal runs share a rank');
const e = db.add(run('ECHO', 100, 5, '2026-09-30'));
ok(e.run.rank === 5 && e.daily?.rank === 1 && e.daily.total === 1, 'a daily op ranks all-time and on its own board');
ok(db.board('2026-09-30').rows.length === 1 && db.board('2026-09-29').total === 0, 'daily boards hold only their op');
for (let i = 0; i < 20; i++) db.add(run(`X${i}`, 1 + i, 0));
ok(db.board('').rows.length === TOP && db.board('', 50).rows.length === 25, 'the board shows the top rows only');

ok(parseRun(run('  ghost   rider <b> ', 10, 1))?.name === 'GHOST RIDER B', 'callsigns are cleaned up');
ok(parseRun(run('', 10, 1)) === null && parseRun(run('<>', 10, 1)) === null, 'a callsign is required');
ok(parseRun({ ...run('A', 10, 1), kills: -1 }) === null && parseRun({ ...run('A', 10, 1), time: 'x' }) === null, 'bad numbers are rejected');
ok(parseRun({ ...run('A', 10, 1), seed: "'; drop", daily: 'today' })?.seed === '', 'bad seed and date are dropped');

const api = scoresApi(openScores(':memory:'));
const server = createServer((req, res) => api(req, res, () => { res.statusCode = 404; res.end(); }));
await new Promise<void>(r => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/scores`;
try {
  const post = (body: unknown) => fetch(base, { method: 'POST', body: JSON.stringify(body) });
  const p = await post(run('FOXTROT', 200, 20));
  ok(p.status === 201 && (await p.json()).run.rank === 1, 'POST logs a run and returns its rank');
  ok((await post({ name: 'X' })).status === 400, 'POST rejects an incomplete run');
  const g = await (await fetch(base)).json();
  ok(g.total === 1 && g.rows[0].name === 'FOXTROT', 'GET returns the board');
  ok((await fetch(base.replace('scores', 'other'))).status === 404, 'other paths pass through');
} finally { server.close(); }

console.log('ok · scoreboard');
