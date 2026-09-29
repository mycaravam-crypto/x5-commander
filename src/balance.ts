// `npm run balance` — headless bots over many seeds. Median survival (and level reached) per doctrine, and per perk when the bot
// always takes that perk if offered. A perk far above the rest is a balance problem.
import { newGame, update, buy, cost, pickPerk, toggleEmcon, emitting, rand, padUpgradeCost, upgradePad, type State, type Pad } from './sim.ts';
import { DOCTRINES, PERKS, UPGRADES } from './config.ts';

declare const process: { argv: string[] }; // node, without pulling in @types/node
const SEEDS = +(process.argv[2] ?? 12), LIMIT = +(process.argv[3] ?? 3600); // runs per row, s cap per run
const rng = { seed: 1 };
Math.random = () => rand(rng);

// Saves for the radar and Patriot once they open up, otherwise buys the cheapest of a sensible core; uses EMCON against ARMs, prefers `perk` in drafts.
const CORE = UPGRADES.map(u => u.id).filter(id => !['cap', 'modes', 'trange', 'jammer'].includes(id));
function play(seed: number, doctrine: string, perk = '') {
  rng.seed = seed;
  const s: State = newGame(seed, '', doctrine);
  s.phase = 'play' as State['phase']; // cast: keep TS from narrowing it to 'play' for the loop below
  for (let i = 0; i < LIMIT * 20 && s.phase !== 'over'; i++) {
    if (s.phase === 'perk') pickPerk(s, Math.max(0, s.perkChoices.indexOf(perk)));
    const goal = ['radar', 'pac3'].find(id => cost(s, id) < Infinity); // the milestones first: once one opens up, save for it
    const pick = goal ?? CORE.reduce((a, b) => cost(s, b) < cost(s, a) ? b : a);
    // Upgrading a gun in place competes with the shop on price.
    const pad = s.perim.reduce<Pad | undefined>((a, p) => padUpgradeCost(p) < (a ? padUpgradeCost(a) : Infinity) ? p : a, undefined);
    if (!goal && pad && padUpgradeCost(pad) < cost(s, pick)) { s.selected = pad.slot; upgradePad(s); } else buy(s, pick);
    const arm = s.enemies.some(e => e.kind === 'arm' && e.x * e.x + e.z * e.z < 30 * 30);
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
  console.log(`${label.padEnd(22)} median ${mmss(median(t)).padStart(6)}  min ${mmss(Math.min(...t)).padStart(6)}  max ${mmss(Math.max(...t)).padStart(6)}  reached L${median(stage)}  battery lv ${median(lv)}`);
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
