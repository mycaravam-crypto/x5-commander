// `npm test` — the leaderboard and profile HTML (src/scores.ts) with hostile data: whatever a name, motto, date or
// number holds, it comes out as text, never markup, and a draw never throws. Throws on the first broken rule.
import { boardHtml, placedHtml, accountHtml, profileHtml, cleanBoard, cleanMe, cleanPosted, cleanProfile } from './scores.ts';

const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };
const EVIL = `<img src=x onerror=alert(1)>"'><script>alert(2)</script>`;
// No element or attribute the payload could have opened: every < and quote from it must arrive escaped.
// Quoted attribute values are blanked first: text inside one (escaped, so it can't close the quote) is harmless.
const safe = (html: string, where: string) => {
  const bare = html.replace(/"[^"]*"/g, '""');
  ok(!/<img|<script|<[^>]*\sonerror=/i.test(bare), `${where}: markup got through`);
  ok(!html.includes(`"'>`), `${where}: an attribute was broken out of`);
};

const row = { id: 1, rank: 1, name: EVIL, verified: 1, avatar: EVIL, xp: EVIL, time: '<b>', kills: { a: 1 }, level: '<script>', earned: 0, seed: EVIL, daily: EVIL, at: EVIL };
const board = cleanBoard({ rows: [row, { ...row, id: 2, rank: 'x', verified: 0 }, null, 7], total: '<b>' });
ok(board.rows.length === 4 && board.rows[0].level === 0 && board.rows[0].daily === '' && board.rows[0].at === '', 'bad numbers and dates are cleaned');
safe(boardHtml(EVIL, board, { name: EVIL, row: board.rows[0] }), 'board');
ok(cleanBoard(null).rows.length === 0 && cleanBoard({ rows: 'x' }).rows.length === 0, 'a bad board is empty, not an error');

const career = { runs: EVIL, kills: 1e9, time: -5, streak: '<i>' };
const me = cleanMe({ name: EVIL, avatar: EVIL, motto: EVIL, best: row, runs: EVIL, total: 3, career });
safe(accountHtml(me, EVIL), 'pilot line');
safe(accountHtml(null, 'why', EVIL), 'sign-in form');

const profile = cleanProfile({ name: EVIL, avatar: EVIL, motto: EVIL, joined: EVIL, career, best: row, total: 1, recent: [row, EVIL, null] });
ok(profile.joined === '' && profile.recent.length === 3, 'profile fields are cleaned');
safe(profileHtml(profile), 'profile card');
safe(profileHtml(profile, { draft: { shape: 0, emblem: 0, color: 0 }, motto: EVIL, msg: EVIL }), 'profile editor');

const posted = cleanPosted({ run: row, total: 2, best: true, daily: { run: row, rank: EVIL, total: 1 }, promoted: 999, medals: ['ace', EVIL, 'nope'] });
ok(posted.promoted === null && posted.medals.join() === 'ace', 'unknown ranks and medals are dropped');
safe(placedHtml(posted), 'debrief');
ok(cleanPosted({ promoted: 3 }).promoted === 3 && cleanPosted({}).promoted === null, 'a real promotion survives');

console.log('ok · escaping');
