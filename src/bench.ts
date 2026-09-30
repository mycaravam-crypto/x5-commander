// `npm run bench [N,N,…] [secs]` — times the sim under a heavy late-game load: a big swarm, every weapon, pads, lots
// in the air. Reports ms per update at 60 Hz for each swarm size (default 600 and 1000): the mean, the median, the
// 95th percentile and the worst tick. The render and HUD are not included (they need a browser).
import { newGame, update, spawnEnemy, rand } from './sim.ts';
import { deriveStats, type EnemyKind } from './config.ts';

declare const process: { argv: string[] };
const SIZES = (process.argv[2] ?? '600,1000').split(',').map(Number), SECS = +(process.argv[3] ?? 20);
const kinds: EnemyKind[] = ['swarm', 'swarm', 'drone', 'scout', 'decoy', 'tank'];

function run(N: number) {
  const rng = { seed: 9 };
  Math.random = () => rand(rng);
  const s = newGame(1); s.phase = 'play'; s.t = 1500; s.nextRaid = s.nextElite = 1e9; s.spawnAcc = -1e9; // load is set by hand below
  Object.assign(s.lv, { radar: 1, pac3: 1, slots: 12, pulse: 3, missile: 4, rail: 2, rate: 6, acap: 20, aprod: 20, gen: 20, cap: 10, range: 4 });
  s.level = 8; s.st = deriveStats(s.lv, ['chain', 'frag', 'overkill'], 8); s.hp = s.st.maxHp = 1e12;
  s.perim.length = 0;
  for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + (i - 3.5) * 0.35, r = i % 2 ? 17 : 28, x = Math.cos(a) * r, z = Math.sin(a) * r; s.perim.push({ k: i % 2 ? 'mantis' : 'stinger', x, z, a: Math.atan2(z, x), cd: 0, slot: i, belt: 0, hp: 30, tier: 0, paid: 0, down: false, site: '', kills: 0 }); }
  // Keep the swarm topped up, and interceptors and power full, so every weapon keeps firing.
  const top = () => {
    while (s.enemies.length < N) spawnEnemy(s, kinds[s.enemies.length % kinds.length], rand(rng) * 6.283, 25 + rand(rng) * 40).hp *= 20;
    s.ammo = s.st.ammoCap; s.power = s.st.powerCap;
  };
  for (let i = 0; i < 3; i++) spawnEnemy(s, 'ew', i * 2, 45); // a few jammers on station
  top(); for (let i = 0; i < 120; i++) { update(s, 1 / 60); s.events.length = 0; top(); } // warm up
  const times: number[] = [];
  let shots = 0;
  for (let i = 0; i < SECS * 60; i++) {
    const a = performance.now();
    update(s, 1 / 60);
    times.push(performance.now() - a);
    s.events.length = 0; shots = Math.max(shots, s.shots.length); top();
  }
  times.sort((a, b) => a - b);
  const at = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))].toFixed(3);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`${N} enemies (${s.enemies.filter(e => e.seenUntil > s.t).length} on the scope, ${s.enemies.filter(e => e.locked).length} locked), up to ${shots} shots: `
    + `${mean.toFixed(3)} ms/update mean, ${at(0.5)} median, ${at(0.95)} p95, ${times[times.length - 1].toFixed(2)} worst`);
}
for (const n of SIZES) run(n);
console.log('(budget at 60 fps: 16.7 ms a frame for sim, render and HUD together)');
