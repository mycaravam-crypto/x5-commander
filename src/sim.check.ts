// `npm test` — headless run of the sim. Throws on the first broken rule.
import { newGame, update, buy, cost, lockReason, pickPerk, markAt, visible, spawnEnemy, toggleEmcon, emitting, jamFactor, phase, draft, placePad, rand, dailySeed, type State } from './sim.ts';
import { baseLevel, difficulty, UPGRADES, PERKS, deriveStats, EW_ORBIT, MODS, PHASES, PHASE_LEN, RAID_WARN } from './config.ts';

// Deterministic: Math.random is seeded too, so a failure replays exactly.
const rng = { seed: 12345 };
Math.random = () => rand(rng);

const ok = (c: unknown, msg: string) => { if (!c) throw new Error('FAIL: ' + msg); };
const run = (s: State, secs: number, each?: () => void) => {
  for (let i = 0; i < secs * 60; i++) { update(s, 1 / 60); each?.(); s.events.length = 0; }
};

// One thing at a time: no random spawns, strike packages or raids.
const quiet = () => { const g = newGame(); g.phase = 'play'; g.spawnAcc = -1e9; g.nextElite = 1e9; g.nextRaid = 1e9; return g; };

// Level thresholds
ok([0, 2, 3, 8, 9, 18].map(baseLevel).join() === '1,1,2,2,3,4', 'baseLevel thresholds');

// Cost scaling + max level
let s = newGame();
ok(cost(s, 'gen') === 50, 'base cost');
s.lv.gen = 2; ok(cost(s, 'gen') === Math.round(50 * 1.45 ** 2), 'exp cost');
s.lv.modes = 3; ok(cost(s, 'modes') === Infinity, 'switch upgrades max out');
s.lv.hp = 60; ok(cost(s, 'hp') < Infinity, 'regular upgrades have no max');
s.lv.armor = 100; ok(deriveStats(s.lv, []).armor <= 0.85, 'armor diminishes');
s.level = 9; s.lv.sweep = 8; ok(cost(s, 'sweep') === Infinity && lockReason(s, 'sweep') === 'NEEDS AESA', 'rotating radar scan cap');
s.lv.aesa = 1; ok(cost(s, 'sweep') < Infinity, 'AESA lifts the scan cap');

// Difficulty grows, but slower and slower: the second 30 min add less than the first.
{ const d = (m: number) => difficulty(m * 60).spawnRate * difficulty(m * 60).hp;
  ok(d(30) > d(10) && d(60) - d(30) < d(30) - d(0), 'difficulty is sub-linear'); }

// Nothing happens before start
s = newGame(); run(s, 5); ok(s.t === 0, 'start phase frozen');

// Idle base: detects, shoots, earns — then eventually dies
s = newGame(); s.phase = 'play';
let sawVisible = false, invisibleShot = false;
run(s, 60, () => {
  for (const e of s.enemies) {
    if (visible(s, e)) sawVisible = true;
    if (e.locked && !visible(s, e)) invisibleShot = true;
  }
});
ok(s.enemies.length > 0 || s.kills > 0, 'enemies spawn');
ok(sawVisible, 'radar detects');
ok(!invisibleShot, 'locks only on visible');
ok(s.kills > 0 && s.credits > 120, `kills earn credits (kills=${s.kills})`);
run(s, 900);
ok((s.phase as string) === 'over', 'idle base eventually falls');

// AESA: no sweep needed, contacts still get found all round.
s = quiet(); s.lv.aesa = 1; s.st = deriveStats(s.lv, []);
for (let i = 0; i < 8; i++) spawnEnemy(s, 'tank', i / 8 * Math.PI * 2, 30).hp = 1e9;
s.st.slots = 0;
{ const seen = new Set<number>(); run(s, 12, () => { for (const e of s.enemies) if (visible(s, e)) seen.add(e.id); });
  ok(seen.size === 8, `AESA detects all round (${seen.size}/8)`); }

// Iskander: only PAC-3 can touch it.
s = quiet(); s.lv.pulse = s.lv.rail = s.lv.missile = 1; s.st = deriveStats(s.lv, []); s.st.weapons.cannon = null;
spawnEnemy(s, 'tbm', 0, 40);
run(s, 6);
ok(!s.stats.dmg.HEL && !s.stats.dmg.HPM && !s.stats.dmg['IRIS-T'] && s.hp < s.st.maxHp, 'Iskander ignores all but PAC-3');
s = quiet(); spawnEnemy(s, 'tbm', 0, 40).hp = 1;
run(s, 6);
ok(s.stats.kills.tbm === 1, 'PAC-3 kills an Iskander');

// Undetected enemy is never locked
s = newGame(); s.phase = 'play'; s.st.radarRange = 0;
run(s, 20);
ok(s.enemies.every(e => !e.locked), 'no radar, no locks');

// Upgrading bot survives longer than idle, triggers perk drafts, grows base
const bot = () => {
  const g = newGame(); g.phase = 'play';
  run(g, 1200, () => {
    if (g.phase === 'perk') pickPerk(g, 0);
    const cheapest = UPGRADES.map(u => u.id).sort((a, b) => cost(g, a) - cost(g, b))[0];
    buy(g, cheapest);
    if (g.phase === 'over') return;
  });
  return g;
};
const idle = newGame(); idle.phase = 'play'; run(idle, 1200);
const b = bot();
ok(b.t > idle.t, `upgrades help (${b.t.toFixed(0)}s vs ${idle.t.toFixed(0)}s)`);
ok(b.level >= 3 && b.perks.length === b.level - 1, `base grows + perks (lv ${b.level}, perks ${b.perks.length})`);

// Perimeter: gated by base level and pad count; a pad kills things on its own
s = newGame(); s.phase = 'play'; s.credits = 1e6;
ok(!buy(s, 'mantis'), 'mantis locked at lv1');
s.level = 2;
ok(buy(s, 'mantis') && !buy(s, 'mantis'), 'one pad placed at a time');
ok(placePad(s, -10, 0) && s.perim[0].slot === 4, 'pad goes to the clicked side');
ok(buy(s, 'mantis') && placePad(s, -10, 0) && s.perim[1].slot !== 4, 'taken slot skipped');
ok(!buy(s, 'mantis'), 'lv2 = 2 pads');
ok(s.perim.length === 2 && Math.hypot(s.perim[0].x, s.perim[0].z) > 10, 'pads on the ring');
{ const g = quiet(); g.credits = 1e6; g.level = 2; buy(g, 'mantis'); run(g, 9); ok(g.perim.length === 1 && !g.placing, 'unplaced pad places itself'); }
s.st.slots = 0; // no main-battery locks: only the pads can shoot
run(s, 40);
ok(s.kills > 0, `pads engage without locks (kills=${s.kills})`);

// Manual mark picks nearest visible enemy
s = newGame(); s.phase = 'play'; run(s, 20);
const v = s.enemies.find(e => visible(s, e));
if (v) { markAt(s, v.x, v.z); ok(s.marked === v.id, 'markAt'); }


// ARM vs a radiating radar: it connects and the radar goes dark.
s = quiet(); s.st.slots = 0; spawnEnemy(s, 'arm', 0, 40);
run(s, 6);
ok(s.radarDownUntil > 0 && !emitting(s), 'ARM knocks the radar out');
ok(s.enemies.every(e => !e.locked) && s.sweepSpeed === 0, 'dark radar: no locks, no sweep');
run(s, 10);
ok(emitting(s), 'radar comes back');

// EMCON before it arrives: the ARM loses the emitter and misses.
s = quiet(); s.st.slots = 0; spawnEnemy(s, 'arm', 1, 40); toggleEmcon(s);
const pw = s.power;
run(s, 8);
ok(s.radarDownUntil === 0 && s.hp === s.st.maxHp, 'EMCON makes the ARM miss');
ok(s.power >= pw, 'silent radar draws no power');

// Su-34 launches ARMs at a radiating radar.
s = quiet(); spawnEnemy(s, 'elite', 2, 50); s.enemies[0].hp = 1e9;
let armSeen = false;
run(s, 5, () => { armSeen ||= s.enemies.some(e => e.kind === 'arm'); });
ok(armSeen, 'Su-34 fires ARMs');

// Decoy: locked, classified, released, never locked again, harmless on arrival.
s = quiet(); spawnEnemy(s, 'decoy', 0, 30); s.enemies[0].hp = 1e9;
let ided = false, relocked = false;
run(s, 15, () => { for (const e of s.enemies) { ided ||= e.ided; relocked ||= e.ided && e.locked; } });
ok(ided && !relocked, 'decoy classified and released');
ok(s.enemies.length === 0 && s.hp === s.st.maxHp, 'decoy does no damage');

// Mi-8 jammer stands off, circles, and blanks only its own sector.
s = quiet(); spawnEnemy(s, 'ew', 0, 45); s.enemies[0].hp = 1e9;
run(s, 15);
const j = s.enemies[0], ja = Math.atan2(j.z, j.x);
ok(j.orbit && Math.abs(Math.hypot(j.x, j.z) - EW_ORBIT) < 3, `jammer on station (r=${Math.hypot(j.x, j.z).toFixed(1)})`);
ok(jamFactor(s, { x: Math.cos(ja) * 20, z: Math.sin(ja) * 20 }) < 1 && jamFactor(s, { x: -Math.cos(ja) * 20, z: -Math.sin(ja) * 20 }) === 1 && jamFactor(s, j) === 1, 'jam sector');

// Raids: announced ahead from one bearing, then arrive together. Clean kill pays a bonus; a leaker doesn't.
const raidRun = (slots: number) => {
  const g = quiet(); g.nextRaid = RAID_WARN; g.st.slots = slots;
  const seen: string[] = [];
  run(g, 1 / 60, () => { if (g.raid) g.raid.g = { drone: 1 }; });
  ok(g.raid && g.enemies.length === 0, 'raid announced before it arrives');
  run(g, 40, () => { for (const e of g.events) seen.push(e.k); });
  return seen;
};
ok(raidRun(2).includes('raidClear'), 'clean raid pays');
ok(raidRun(0).includes('raidLeak'), 'leaked raid does not');

// Conditions: after the scripted phases, MODS loop.
s = newGame(); s.t = PHASE_LEN * PHASES.length + 1;
ok(phase(s).name === MODS[0].name, 'first condition');
s.t += PHASE_LEN * MODS.length;
ok(phase(s).name === MODS[0].name, 'conditions loop');

// Drafts: no rule perks before lv5; after, exactly one, never a repeat, never one needing gear you lack.
const rule = (id: string) => PERKS.find(p => p.id === id)!.rule;
s = newGame();
for (let i = 0; i < 50; i++) ok(draft(s).every(id => !rule(id)), 'no rule perks early');
s.level = 5; s.perks = ['fusion'];
for (let i = 0; i < 50; i++) {
  const d = draft(s);
  ok(new Set(d).size === 3 && d.filter(rule).length === 1 && !d.includes('fusion') && !d.includes('arc'), `draft ${d}`);
}

// TRACK FUSION: locks survive EMCON.
s = quiet(); spawnEnemy(s, 'tank', 0, 30); s.enemies[0].hp = 1e9;
s.perks = ['fusion']; s.st = deriveStats(s.lv, s.perks); s.st.slots = 1;
run(s, 4);
ok(s.enemies[0].locked, 'locked before EMCON');
toggleEmcon(s); run(s, 2);
ok(s.enemies[0].locked, 'fusion keeps the lock through EMCON');

// Same seed, same schedule: the spawn stream and perk drafts don't depend on anything else.
{
  const spawns = (seed: number, noise: boolean) => {
    const g = newGame(seed); g.phase = 'play';
    const seen: string[] = [];
    for (let i = 0; i < 90 * 60; i++) {
      const n = g.nextId;
      update(g, 1 / 60);
      if (noise) Math.random();
      for (const e of g.enemies) if (e.id >= n && e.kind !== 'arm') seen.push(`${e.kind}@${e.x.toFixed(2)}`);
    }
    return seen.join();
  };
  ok(spawns(7, false) === spawns(7, true), 'seeded schedule ignores other randomness');
  ok(spawns(7, false) !== spawns(8, false), 'different seeds differ');
  ok(dailySeed('2026-09-28') === dailySeed('2026-09-28') && dailySeed('2026-09-28') !== dailySeed('2026-09-29'), 'daily seed');
}

// Doctrines: free levels without base-level progress; daily ops ignore them.
s = newGame(1, '', 'sensor');
ok(s.lv.range === 2 && s.bought === 0 && s.level === 1 && s.st.radarRange > newGame(1).st.radarRange, 'doctrine loadout');
ok(newGame(1, '2026-09-28', 'sensor').doctrine === 'standard', 'daily flies standard');

// Debrief counters add up.
{
  const dealt = Object.values(b.stats.dmg).reduce((a, x) => a + x, 0);
  const killed = Object.values(b.stats.kills).reduce((a, x) => a + x, 0);
  ok(killed === b.kills && dealt > 0 && b.stats.dmg['PAC-3'] > 0, `debrief (${killed}/${b.kills})`);
}

console.log(`ok · idle ${idle.t.toFixed(0)}s/${idle.kills} kills · bot ${b.t.toFixed(0)}s/${b.kills} kills lv${b.level} [${b.perks.join(',')}]`);
