// `npm run balance` — headless bots over many seeds. Median survival (and level reached) per doctrine, and per perk when the bot
// always takes that perk if offered. A perk far above the rest is a balance problem.
import { newGame, update, buy, collectDrop, cost, pickPerk, toggleEmcon, emitting, rand, padUpgradeCost, upgradePad, bestSpot, placePad, type State, type Pad } from './sim.ts';
import { DOCTRINES, PERKS, UPGRADES, PERIM_KINDS, perimSlots, ENEMIES, ARMS, type PerimKind, type EnemyKind } from './config.ts';

declare const process: { argv: string[] }; // node, without pulling in @types/node
const SEEDS = +(process.argv[2] ?? 12), LIMIT = +(process.argv[3] ?? 3600); // runs per row, s cap per run
const rng = { seed: 1 };
Math.random = () => rand(rng);

// Plays like an attentive beginner: buys a milestone (radar, then Patriot) the moment it can afford it, fills
// every free unit slot (cheapest gun, plus one observer post and one ammo point once there are guns to serve) and
// builds at once on bestSpot, saves for an open milestone, and otherwise buys the cheapest of a sensible core.
// Uses EMCON against ARMs, prefers `perk` in drafts.
const CORE = UPGRADES.map(u => u.id).filter(id => !['cap', 'modes', 'trange', 'jammer'].includes(id) && !PERIM_KINDS.includes(id as PerimKind));
const GUNS = ['mg', 'mantis', 'stinger', 'iris'];
const cheapest = (s: State, ids: string[]) => ids.reduce((a, b) => cost(s, b) < cost(s, a) ? b : a);
function nextUnit(s: State) {
  if (s.placing || s.perim.length >= perimSlots(s.level)) return '';
  const guns = s.perim.filter(p => GUNS.includes(p.k)).length;
  for (const k of ['observer', 'ammo'] as const) if (guns >= 3 && !s.perim.some(p => p.k === k) && cost(s, k) < Infinity) return k;
  return cheapest(s, GUNS);
}
function shop(s: State) {
  const goal = ['radar', 'pac3'].find(id => cost(s, id) < Infinity); // the milestones first
  if (goal && buy(s, goal)) return;
  const unit = nextUnit(s);
  if (unit && buy(s, unit)) { const q = bestSpot(s, unit as PerimKind); if (q) placePad(s, q.x, q.z); return; }
  if (goal || unit) return; // saving for it
  const pick = cheapest(s, CORE);
  // Upgrading a gun in place competes with the shop on price.
  const pad = s.perim.reduce<Pad | undefined>((a, p) => padUpgradeCost(p) < (a ? padUpgradeCost(a) : Infinity) ? p : a, undefined);
  if (pad && padUpgradeCost(pad) < cost(s, pick)) { s.selected = pad.slot; upgradePad(s); } else buy(s, pick);
}
function play(seed: number, doctrine: string, perk = '') {
  rng.seed = seed;
  const s: State = newGame(seed, '', doctrine);
  s.phase = 'play' as State['phase']; // cast: keep TS from narrowing it to 'play' for the loop below
  for (let i = 0; i < LIMIT * 20 && s.phase !== 'over'; i++) {
    if (s.phase === 'perk') pickPerk(s, Math.max(0, s.perkChoices.indexOf(perk)));
    shop(s);
    for (const d of [...s.drops]) collectDrop(s, d.x, d.z); // an attentive player recovers every drop
    const arm = s.enemies.some(e => ARMS.includes(e.kind) && e.x * e.x + e.z * e.z < 30 * 30);
    if (arm === emitting(s) && (arm || s.emcon)) toggleEmcon(s);
    update(s, 1 / 20);
    s.events.length = 0;
  }
  return s;
}

const median = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1];
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function row(label: string, runs: State[]) {
  const t = runs.map(s => s.t), lv = runs.map(s => s.level), stage = runs.map(s => s.stage + 1);
  // What did the most damage across these runs, as a share of all HP lost.
  const taken: Partial<Record<EnemyKind, number>> = {};
  for (const r of runs) for (const [k, n] of Object.entries(r.stats.taken) as [EnemyKind, number][]) taken[k] = (taken[k] ?? 0) + n;
  const all = Object.values(taken).reduce((a, b) => a + b, 0) || 1;
  const top = (Object.entries(taken) as [EnemyKind, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${ENEMIES[k].code} ${Math.round(n / all * 100)}%`).join(' ');
  console.log(`${label.padEnd(22)} median ${mmss(median(t)).padStart(6)}  min ${mmss(Math.min(...t)).padStart(6)}  max ${mmss(Math.max(...t)).padStart(6)}  reached L${median(stage)}  battery lv ${median(lv)}  hit by ${top}`);
  return median(t);
}

const seeds = Array.from({ length: SEEDS }, (_, i) => 1000 + i * 7919);
console.log(`${SEEDS} seeds, cap ${mmss(LIMIT)}`);
for (const d of DOCTRINES) row(`doctrine ${d.name}`, seeds.map(x => play(x, d.id)));
const base = row('perk (none preferred)', seeds.map(x => play(x, 'standard')));
for (const p of PERKS) {
  const m = median(seeds.map(x => play(x, 'standard', p.id).t));
  console.log(`  ${p.name.padEnd(20)} ${mmss(m).padStart(6)}  ${m > base * 1.25 ? '▲ strong' : m < base * 0.8 ? '▼ weak' : ''}`);
}
