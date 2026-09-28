// `npm test` — headless run of the sim. Throws on the first broken rule.
import { newGame, update, buy, cost, pickPerk, markAt, visible, spawnEnemy, toggleEmcon, emitting, jamFactor, phase, type State } from './sim.ts';
import { baseLevel, UPGRADES, EW_ORBIT, MODS, PHASES, PHASE_LEN, RAID_WARN } from './config.ts';

const ok = (c: unknown, msg: string) => { if (!c) throw new Error('FAIL: ' + msg); };
const run = (s: State, secs: number, each?: () => void) => {
  for (let i = 0; i < secs * 60; i++) { update(s, 1 / 60); each?.(); s.events.length = 0; }
};

// Level thresholds
ok([0, 2, 3, 8, 9, 18].map(baseLevel).join() === '1,1,2,2,3,4', 'baseLevel thresholds');

// Cost scaling + max level
let s = newGame();
ok(cost(s, 'gen') === 50, 'base cost');
s.lv.gen = 2; ok(cost(s, 'gen') === Math.round(50 * 1.45 ** 2), 'exp cost');
s.lv.armor = 7; ok(cost(s, 'armor') === Infinity, 'max level');

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
ok(buy(s, 'mantis') && buy(s, 'mantis') && !buy(s, 'mantis'), 'lv2 = 2 pads');
ok(s.perim.length === 2 && Math.hypot(s.perim[0].x, s.perim[0].z) > 10, 'pads on the ring');
s.st.slots = 0; // no main-battery locks: only the pads can shoot
run(s, 40);
ok(s.kills > 0, `pads engage without locks (kills=${s.kills})`);

// Manual mark picks nearest visible enemy
s = newGame(); s.phase = 'play'; run(s, 20);
const v = s.enemies.find(e => visible(s, e));
if (v) { markAt(s, v.x, v.z); ok(s.marked === v.id, 'markAt'); }

// Radar threats, one at a time: no random spawns, no strike packages.
const quiet = () => { const g = newGame(); g.phase = 'play'; g.spawnAcc = -1e9; g.nextElite = 1e9; g.nextRaid = 1e9; return g; };

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

console.log(`ok · idle ${idle.t.toFixed(0)}s/${idle.kills} kills · bot ${b.t.toFixed(0)}s/${b.kills} kills lv${b.level} [${b.perks.join(',')}]`);
