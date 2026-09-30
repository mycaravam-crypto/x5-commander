// `npm test` — careers: ranks, medals, streaks, avatars and mottos (server/career.ts). Throws on the first broken rule.
import { EMPTY_CAREER, MEDALS, RANKS, avatarCode, avatarFor, avatarSvg, defaultAvatar, insigniaSvg, medalsOf, parseAvatar, parseMotto, rankOf, streaks, xpOf, COLORS, EMBLEMS, SHAPES } from './career.ts';

const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };

ok(xpOf({ kills: 100, time: 500 }) === 200, 'XP: a point a kill, a point per 5 s');
ok(rankOf(0).name === 'RECRUIT' && rankOf(0).next?.name === 'PRIVATE' && rankOf(0).progress === 0, 'everyone starts a recruit');
ok(rankOf(149).index === 0 && rankOf(150).name === 'PRIVATE' && Math.abs(rankOf(375).progress - 0.5) < 1e-9, 'ranks at their thresholds');
ok(rankOf(1e9).name === 'GENERAL' && rankOf(1e9).next === null && rankOf(1e9).progress === 1, 'general is the top');
ok(RANKS.every((r, i) => i === 0 || r.xp > RANKS[i - 1].xp), 'ranks climb');

ok(medalsOf(EMPTY_CAREER).length === 0, 'no runs, no medals');
const vet = { ...EMPTY_CAREER, runs: 30, kills: 12000, time: 40000, bestTime: 950, bestKills: 1200, maxLevel: 7, dailies: 2, longestStreak: 8 };
ok(medalsOf(vet).length === MEDALS.length - 1 && !medalsOf(vet).includes('century'), 'a veteran has all but CENTURY');
ok(new Set(MEDALS.map(m => m.id)).size === MEDALS.length, 'medal ids are unique');

ok(JSON.stringify(streaks([], '2026-09-30')) === '{"streak":0,"longest":0}', 'no days, no streak');
ok(streaks(['2026-09-28', '2026-09-29', '2026-09-30'], '2026-09-30').streak === 3, 'a streak ending today');
ok(streaks(['2026-09-28', '2026-09-29'], '2026-09-30').streak === 2, 'a streak ending yesterday still counts');
const s = streaks(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-20', '2026-09-21'], '2026-09-30');
ok(s.streak === 0 && s.longest === 4, 'a broken streak: none now, the longest kept');

ok(avatarCode(parseAvatar('5.9.7')!) === '5.9.7', 'avatars round-trip');
ok(parseAvatar('6.0.0') === null && parseAvatar('0.10.0') === null && parseAvatar('0.0.8') === null && parseAvatar('x') === null && parseAvatar(3) === null, 'bad avatars are rejected');
ok(JSON.stringify(defaultAvatar('MAVERICK')) === JSON.stringify(defaultAvatar('MAVERICK')) && avatarFor('MAVERICK', '') !== null, 'the default patch is stable');
ok(new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(n => avatarCode(defaultAvatar(n)))).size > 4, 'default patches vary by callsign');
for (let sh = 0; sh < SHAPES.length; sh++) for (let e = 0; e < EMBLEMS.length; e++)
  ok(avatarSvg({ shape: sh, emblem: e, color: e % COLORS.length }).startsWith('<svg') , 'every patch draws');
ok(RANKS.every(r => insigniaSvg(r.mark).startsWith('<svg')), 'every insignia draws');

ok(parseMotto('  Hold   the\\nline  '.replace('\\n', '\n')) === 'Hold the line' && parseMotto('') === '' && parseMotto('x'.repeat(61)) === null && parseMotto(5) === null, 'mottos are one clean line');
ok(parseMotto('a\u202ebc') === 'abc', 'no direction-override tricks');

console.log('ok · career');
