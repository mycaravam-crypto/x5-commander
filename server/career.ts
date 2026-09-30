// A pilot's career, shared by the server (server/scores.ts, server/api.ts) and the game (src/scores.ts): the unit patch
// they wear as an avatar, the rank their XP has earned, and the medals their runs have won. All of it follows from the
// runs they've logged, so nothing here is stored but the patch and the motto. No Node imports: the game bundles this.

// ---- career: what a pilot's runs add up to ----
export type Career = {
  runs: number; kills: number; time: number; earned: number;
  bestTime: number; bestKills: number; maxLevel: number;
  dailies: number; // distinct daily ops flown
  streak: number; longestStreak: number; // days in a row with a run: ending today or yesterday, and ever
};
export const EMPTY_CAREER: Career = { runs: 0, kills: 0, time: 0, earned: 0, bestTime: 0, bestKills: 0, maxLevel: 0, dailies: 0, streak: 0, longestStreak: 0 };

// XP: a point a kill and a point per 5 s survived, over every run.
export const xpOf = (c: Pick<Career, 'kills' | 'time'>) => Math.floor(c.kills + c.time / 5);

// ---- ranks ----
// mark: the insignia: c = chevrons, b = bars, s = stars; the digit is how many.
export const RANKS = [
  { name: 'RECRUIT', xp: 0, mark: '' },
  { name: 'PRIVATE', xp: 150, mark: 'c1' },
  { name: 'CORPORAL', xp: 600, mark: 'c2' },
  { name: 'SERGEANT', xp: 1500, mark: 'c3' },
  { name: 'STAFF SERGEANT', xp: 3500, mark: 'c4' },
  { name: 'LIEUTENANT', xp: 7500, mark: 'b1' },
  { name: 'CAPTAIN', xp: 15000, mark: 'b2' },
  { name: 'MAJOR', xp: 30000, mark: 'b3' },
  { name: 'COLONEL', xp: 60000, mark: 's1' },
  { name: 'BRIGADIER', xp: 120000, mark: 's2' },
  { name: 'GENERAL', xp: 250000, mark: 's3' },
] as const;
export function rankOf(xp: number) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const next = RANKS[i + 1];
  return { index: i, name: RANKS[i].name, mark: RANKS[i].mark, next: next ? { name: next.name, xp: next.xp } : null,
    progress: next ? (xp - RANKS[i].xp) / (next.xp - RANKS[i].xp) : 1 };
}

// ---- medals: each for a milestone, kept once won (every test is on a total or a best, which only grow) ----
export const MEDALS: { id: string; name: string; desc: string; won: (c: Career) => boolean }[] = [
  { id: 'sortie', name: 'FIRST SORTIE', desc: 'Log a run', won: c => c.runs >= 1 },
  { id: 'blooded', name: 'BLOODED', desc: '100 kills in one run', won: c => c.bestKills >= 100 },
  { id: 'hold', name: 'HOLD THE LINE', desc: 'Survive 5 minutes', won: c => c.bestTime >= 300 },
  { id: 'daily', name: 'DAILY BRIEFING', desc: 'Fly a daily op', won: c => c.dailies >= 1 },
  { id: 'fortress', name: 'FORTRESS', desc: 'Reach base level 6', won: c => c.maxLevel >= 6 },
  { id: 'iron', name: 'IRON WALL', desc: 'Survive 15 minutes', won: c => c.bestTime >= 900 },
  { id: 'ace', name: 'ACE', desc: '1,000 kills in one run', won: c => c.bestKills >= 1000 },
  { id: 'station', name: 'ON STATION', desc: 'Fly 7 days in a row', won: c => c.longestStreak >= 7 },
  { id: 'veteran', name: 'VETERAN', desc: 'Log 25 runs', won: c => c.runs >= 25 },
  { id: 'tenk', name: 'TEN THOUSAND', desc: '10,000 kills in all', won: c => c.kills >= 10000 },
  { id: 'marathon', name: 'LONG WATCH', desc: '10 hours in combat in all', won: c => c.time >= 36000 },
  { id: 'century', name: 'CENTURY', desc: 'Log 100 runs', won: c => c.runs >= 100 },
];
export const medalsOf = (c: Career) => MEDALS.filter(m => m.won(c)).map(m => m.id);

// Longest run of consecutive days, and the one running now (ending today or yesterday), from sorted YYYY-MM-DD dates.
export function streaks(days: string[], today = new Date().toISOString().slice(0, 10)) {
  const n = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 864e5);
  let longest = 0, run = 0, prev = NaN;
  for (const d of days) { run = n(d) === prev + 1 ? run + 1 : 1; prev = n(d); longest = Math.max(longest, run); }
  return { streak: days.length && n(today) - prev <= 1 ? run : 0, longest };
}

// ---- avatars: a unit patch, a shape, an emblem and colours, stored as "shape.emblem.color" ----
export const SHAPES = ['ROUNDEL', 'SHIELD', 'HEXAGON', 'DIAMOND', 'SQUARE', 'PENNANT'];
export const EMBLEMS = ['STAR', 'CHEVRONS', 'CROSSHAIR', 'RADAR', 'MISSILE', 'BOLT', 'WINGS', 'TOWER', 'ROTOR', 'SKULL'];
export const COLORS: [string, string, string][] = [ // [name, field, emblem]
  ['PHOSPHOR', '#0b3d1f', '#39ff88'], ['AMBER', '#3d2a00', '#ffb000'], ['FLAK', '#3d0f08', '#ff4a2a'],
  ['ICE', '#06303d', '#5ee7ff'], ['NIGHT', '#1f0f3d', '#b98cff'], ['STEEL', '#1c2328', '#dfe8ee'],
  ['DESERT', '#3a2f1c', '#e8c98a'], ['NAVY', '#0a1633', '#7fa7ff'],
];
export type Avatar = { shape: number; emblem: number; color: number };

export function parseAvatar(v: unknown): Avatar | null {
  const m = typeof v === 'string' ? /^(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/.exec(v) : null;
  if (!m) return null;
  const [shape, emblem, color] = [+m[1], +m[2], +m[3]];
  return shape < SHAPES.length && emblem < EMBLEMS.length && color < COLORS.length ? { shape, emblem, color } : null;
}
export const avatarCode = (a: Avatar) => `${a.shape}.${a.emblem}.${a.color}`;
// A pilot who hasn't picked a patch gets one from their callsign, so every pilot has a patch of their own.
export function defaultAvatar(name: string): Avatar {
  let h = 2166136261;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return { shape: h % SHAPES.length, emblem: (h >>> 8) % EMBLEMS.length, color: (h >>> 16) % COLORS.length };
}
export const avatarFor = (name: string, code?: string | null) => parseAvatar(code) ?? defaultAvatar(name);

const SHAPE_PATHS = [
  '<circle cx="32" cy="32" r="29"/>',
  '<path d="M32 3 L58 11 V32 C58 47 46 56 32 61 C18 56 6 47 6 32 V11 Z"/>',
  '<path d="M32 3 L57 17.5 V46.5 L32 61 L7 46.5 V17.5 Z"/>',
  '<path d="M32 2 L62 32 L32 62 L2 32 Z"/>',
  '<rect x="5" y="5" width="54" height="54" rx="9"/>',
  '<path d="M6 5 H58 V42 L32 61 L6 42 Z"/>',
];
const EMBLEM_PATHS = [
  '<path d="M32 13 L37 27 L52 27 L40 36 L44 50 L32 42 L20 50 L24 36 L12 27 L27 27 Z"/>',
  '<path d="M16 34 L32 22 L48 34 L48 40 L32 28 L16 40 Z M16 46 L32 34 L48 46 L48 52 L32 40 L16 52 Z"/>',
  '<path fill="none" stroke-width="3.5" d="M32 14 V24 M32 40 V50 M14 32 H24 M40 32 H50"/><circle cx="32" cy="32" r="12" fill="none" stroke-width="3.5"/><circle cx="32" cy="32" r="3"/>',
  '<path fill="none" stroke-width="3.5" d="M14 46 A26 26 0 0 1 46 14 M21 46 A19 19 0 0 1 46 21 M28 46 A12 12 0 0 1 46 28"/><circle cx="44" cy="44" r="4"/>',
  '<path d="M32 10 L37 20 V40 L43 48 V52 L35 48 H29 L21 52 V48 L27 40 V20 Z"/>',
  '<path d="M36 10 L20 35 H30 L26 54 L44 28 H34 Z"/>',
  '<path d="M32 26 L36 30 L32 44 L28 30 Z M28 30 C20 24 12 25 6 28 C12 30 18 34 26 36 Z M36 30 C44 24 52 25 58 28 C52 30 46 34 38 36 Z"/>',
  '<path d="M26 52 L29 24 H35 L38 52 Z M22 24 H42 V19 H22 Z M28 19 V14 H36 V19 Z"/>',
  '<path d="M10 22 L54 26 V29 L10 25 Z M26 30 H38 L40 42 L32 48 L24 42 Z M32 42 V54"/>',
  '<path d="M32 13 C21 13 15 20 15 29 C15 35 18 39 22 41 V48 H42 V41 C46 39 49 35 49 29 C49 20 43 13 32 13 Z M25 27 A4 4 0 1 0 25.1 27 Z M39 27 A4 4 0 1 0 39.1 27 Z" fill-rule="evenodd"/><path d="M27 48 V53 M32 48 V53 M37 48 V53" stroke-width="2.5"/>',
];
// The patch as inline SVG: shape filled with the field colour and edged in the emblem colour, the emblem on top.
export function avatarSvg(a: Avatar, size = 32, cls = 'patch') {
  const [, field, ink] = COLORS[a.color];
  // Sized inline: the game's stylesheet sizes every bare svg as a 22px icon.
  return `<svg class="${cls}" viewBox="0 0 64 64" width="${size}" height="${size}" style="width:${size}px;height:${size}px" aria-hidden="true">`
    + `<g fill="${field}" stroke="${ink}" stroke-width="3">${SHAPE_PATHS[a.shape]}</g>`
    + `<g fill="${ink}" stroke="${ink}" stroke-linejoin="round">${EMBLEM_PATHS[a.emblem]}</g></svg>`;
}

// The rank insignia as inline SVG, in the text colour: chevrons, bars or stars.
export function insigniaSvg(mark: string, size = 14) {
  const kind = mark[0], n = +mark.slice(1) || 0;
  let body = '';
  if (kind === 'c') for (let i = 0; i < n; i++) body += `<path d="M3 ${6 + i * 4} L8 ${3 + i * 4} L13 ${6 + i * 4}" fill="none" stroke="currentColor" stroke-width="1.8"/>`;
  if (kind === 'b') for (let i = 0; i < n; i++) body += `<rect x="${8 - n * 2.5 + i * 5 - 1.5}" y="2" width="3" height="12" fill="currentColor"/>`;
  if (kind === 's') for (let i = 0; i < n; i++) {
    const cx = 8 + (i - (n - 1) / 2) * 5.2;
    body += `<path d="M${cx} 4.5 l1.2 2.6 2.8.2 -2.2 1.8 .8 2.8 -2.6-1.6 -2.6 1.6 .8-2.8 -2.2-1.8 2.8-.2 Z" fill="currentColor"/>`;
  }
  return `<svg class="insig" viewBox="0 0 16 ${kind === 'c' ? 8 + n * 4 : 16}" width="${size}" height="${size}" style="width:${size}px;height:${size}px" aria-hidden="true">${body}</svg>`;
}

// A motto: one line of plain text, trimmed; '' clears it. null if it's too long.
export const MOTTO_MAX = 60;
export function parseMotto(v: unknown) {
  if (typeof v !== 'string') return null;
  const m = v.replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  return m.length <= MOTTO_MAX ? m : null;
}
