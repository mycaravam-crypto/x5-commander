// `npm test` — the scoreboard store and accounts against in-memory and throwaway databases. Throws on the first broken rule.
import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openScores, parseRun, TOP } from './scores.ts';
import { parseName, parsePassword, hashPassword, verifyPassword } from './accounts.ts';
import { xpOf } from './career.ts';

const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };
const run = (time: number, kills: number, daily = '') => ({ time, kills, level: 3, earned: 1000, seed: 'X5-ABC-0', daily });

const s = openScores(':memory:');
const acct = async (name: string) => { const r = await s.accounts.signup(name, 'password1'); if (r === 'taken') throw new Error('taken'); return r.user; };
const [alpha, bravo, charlie, delta] = [await acct('ALPHA'), await acct('BRAVO'), await acct('CHARLIE'), await acct('DELTA')];
ok(s.board('').total === 0 && s.board('').rows.length === 0, 'a new board is empty');

const a = s.add(alpha, run(300, 50));
ok(a.run.rank === 1 && a.total === 1 && a.best && a.daily === null && a.run.name === 'ALPHA' && a.run.verified === 1, 'the first run is #1');
ok(s.add(bravo, run(400, 10)).run.rank === 1 && s.board('').rows[1].name === 'ALPHA', 'longer survival outranks more kills');
ok(s.add(charlie, run(300, 60)).run.rank === 2, 'kills break a tie on time');
ok(s.add(delta, run(300, 60)).run.rank === 2 && s.board('').rows.map(r => r.rank).join() === '1,2,2,4', 'equal runs share a rank');

const worse = s.add(alpha, run(100, 5));
ok(!worse.best && worse.run.time === 300 && worse.run.rank === 4 && worse.total === 4, 'a worse run leaves the player on their best');
ok(s.board('').rows.filter(r => r.name === 'ALPHA').length === 1, 'one row per player');
const better = s.add(alpha, run(500, 5));
ok(better.best && better.run.rank === 1 && s.board('').total === 4, 'a better run moves the player up');
ok(s.player(alpha.id).runs === 3 && s.player(alpha.id).best?.time === 500, 'a player has their runs and best');
ok(s.player(9999).best === null && s.player(9999).runs === 0, 'no runs, no best');

const d = s.add(bravo, run(50, 5, '2026-09-30'));
ok(!d.best && d.run.rank === 2 && d.daily?.rank === 1 && d.daily.total === 1, "a daily op ranks on the op's own board");
ok(s.board('2026-09-30').rows.length === 1 && s.board('2026-09-29').total === 0, 'daily boards hold only their op');
for (let i = 0; i < 20; i++) s.add(await acct(`X${i}X`), run(1 + i, 0));
ok(s.board('').rows.length === TOP && s.board('', 50).rows.length === 24, 'the board shows the top players only');

// Careers: totals over an account's runs, promotions and medals as runs are logged.
const fresh = await acct('ROOKIE');
const first = s.add(fresh, run(400, 150));
ok(first.promoted === 1 && first.medals.includes('sortie') && first.medals.includes('blooded') && first.medals.includes('hold'), 'a first big run promotes and wins medals');
const second = s.add(fresh, run(10, 1));
ok(second.promoted === null && second.medals.length === 0, 'a small run wins nothing new');
const c = s.career(fresh.id);
ok(c.runs === 2 && c.kills === 151 && c.time === 410 && c.bestTime === 400 && c.bestKills === 150 && c.streak === 1, 'career totals');
ok(s.recent(fresh.id).length === 2 && s.recent(fresh.id)[0].time === 10, 'recent runs, newest first');
ok(s.board('', 50).rows.find(r => r.name === 'ROOKIE')?.xp === xpOf(c) && xpOf(c) === 233, 'board rows carry career XP, as xpOf counts it');
s.accounts.setProfile(fresh.id, { avatar: '1.2.3', motto: 'Eyes up' });
ok(s.accounts.profile('rookie')?.motto === 'Eyes up' && s.board('', 50).rows.find(r => r.name === 'ROOKIE')?.avatar === '1.2.3', 'profiles keep a patch and motto');

// Accounts
ok(await s.accounts.signup('alpha', 'password1') === 'taken', 'a callsign can only be taken once');
ok(await s.accounts.login('ALPHA', 'wrong-password') === null && await s.accounts.login('NOBODY', 'password1') === null, 'bad logins fail');
const login = await s.accounts.login('ALPHA', 'password1');
ok(login && s.accounts.user(login.token)?.name === 'ALPHA', 'a login gives a working session');
s.accounts.logout(login!.token);
ok(s.accounts.user(login!.token) === null && s.accounts.user('forged') === null && s.accounts.user(undefined) === null, 'logout ends it; forged tokens fail');
ok(parseName(' ghost_1 ') === 'GHOST_1' && parseName('ab') === null && parseName('two words') === null && parseName('<b>hi</b>') === null, 'callsigns are checked');
ok(parsePassword('short') === null && parsePassword('long enough') === 'long enough', 'passwords need 8 characters');
const h = await hashPassword('hunter22');
ok(h.startsWith('scrypt$') && await verifyPassword('hunter22', h) && !await verifyPassword('hunter23', h), 'passwords hash and verify');
ok(h !== await hashPassword('hunter22'), 'hashes are salted');

ok(parseRun({ ...run(10, 1), kills: -1 }) === null && parseRun({ ...run(10, 1), time: 'x' }) === null, 'bad numbers are rejected');
ok(parseRun(run(10, 400)) === null && parseRun(run(100, 1500)) !== null, 'kills must fit the time survived');
ok(parseRun({ ...run(10, 1), seed: "'; drop", daily: 'today' })?.seed === '', 'bad seed and date are dropped');
s.close();

// A database from before accounts keeps its callsign runs, each ranked as its own player.
const dir = mkdtempSync(join(tmpdir(), 'x5-'));
try {
  // The database file is its owner's alone: a new one, and an old one left readable, tightened on open.
  const fresh = join(dir, 'private', 'x5.db');
  openScores(fresh).close();
  ok((statSync(fresh).mode & 0o777) === 0o600 && (statSync(join(dir, 'private')).mode & 0o777) === 0o700, 'a new database is private');
  chmodSync(fresh, 0o644);
  openScores(fresh).close();
  ok((statSync(fresh).mode & 0o777) === 0o600, 'an existing database is made private');

  const file = join(dir, 'old.db'), old = new DatabaseSync(file);
  old.exec(`CREATE TABLE scores (id INTEGER PRIMARY KEY, name TEXT NOT NULL, time REAL NOT NULL, kills INTEGER NOT NULL, level INTEGER NOT NULL,
    earned INTEGER NOT NULL, seed TEXT NOT NULL DEFAULT '', daily TEXT NOT NULL DEFAULT '', at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO scores (name, time, kills, level, earned) VALUES ('MAVERICK', 900, 100, 5, 1), ('MAVERICK', 800, 90, 5, 1);`);
  old.close();
  const m = openScores(file);
  ok(m.board('').total === 2 && m.board('').rows.every(r => r.verified === 0), 'old callsign runs survive the upgrade');
  const u = await m.accounts.signup('MAVERICK', 'password1');
  ok(u !== 'taken' && m.add(u.user, run(850, 5)).run.rank === 2, 'accounts rank among the old runs');
  m.close();
  ok(openScores(file).board('').total === 3, 'upgrading twice is harmless');
} finally { rmSync(dir, { recursive: true, force: true }); }

console.log('ok · scoreboard');
