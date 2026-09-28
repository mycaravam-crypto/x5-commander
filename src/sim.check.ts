// `npm test` — headless run of the sim. Throws on the first broken rule.
import { newGame, update, buy, cost, lockReason, pickPerk, markAt, visible, spawnEnemy, toggleEmcon, cycleRadarMode, aimFocus, radarRange, slots, cycleDiscipline, emergencyIntercept, interceptBlock, emitting, jamFactor, phase, draft, placePad, rand, dailySeed, type State } from './sim.ts';
import { baseLevel, difficulty, UPGRADES, PERKS, PACKAGES, EW_ARC, deriveStats, EW_ORBIT, MODS, PHASES, PHASE_LEN, RAID_WARN, RAID_PRESS } from './config.ts';

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

// Base levels add capability, not just numbers.
{
  const at = (level: number) => deriveStats({}, [], level);
  ok(at(2).gen > at(1).gen && at(3).raidWarn > 0 && at(3).persist > at(2).persist, 'lv2 power plant, lv3 comms');
  ok(!at(3).backupRadar && at(4).backupRadar && at(5).armor > at(4).armor && at(6).slots === at(5).slots + 1, 'lv4 backup radar, lv5 berms, lv6 second ECS');
  ok(at(7).maxHp > at(6).maxHp && at(7).armStun < 1, 'lv7 hardened node');
  // TRML-4D keeps contacts coming while an ARM has the MPQ-65 down; lv3 hears raids earlier.
  const seen = (level: number) => { const g = quiet(); g.level = level; g.st = deriveStats(g.lv, [], level); g.radarDownUntil = 1e9;
    const e = spawnEnemy(g, 'tank', 0, 15); e.hp = 1e9; e.speed = 0; let v = false, l = false;
    run(g, 10, () => { v ||= visible(g, e); l ||= e.locked; }); return v && !l; };
  ok(seen(4) && !seen(3), 'lv4: TRML-4D searches while the radar is down, without locks');
  const g = quiet(); g.level = 3; g.st = deriveStats(g.lv, [], 3); g.nextRaid = 20; run(g, 20 - RAID_WARN - 4.5);
  ok(g.raid, 'lv3: raids announced earlier');
  const b = newGame(); b.phase = 'play'; b.credits = 1e6; for (let i = 0; i < 3; i++) buy(b, 'gen');
  ok(b.level === 2 && b.st.gen === deriveStats(b.lv, [], 2).gen, 'level-up refreshes stats');
}

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

// Fire discipline: CONSERVE fires fewer interceptors at the same raid than MAXIMUM.
{
  const shots = (d: number) => {
    const g = quiet(); g.discipline = d; let n = 0;
    for (let i = 0; i < 6; i++) spawnEnemy(g, 'tank', i, 50).hp = 1e9;
    run(g, 15, () => { n += g.events.filter(e => e.k === 'shot').length; });
    return n;
  };
  const c = quiet(); cycleDiscipline(c); ok(c.discipline === 2, 'G cycles discipline');
  ok(shots(0) < shots(1) && shots(1) < shots(2), `discipline sets the rate of fire (${shots(0)} < ${shots(1)} < ${shots(2)})`);
}

// Priority target: takes extra damage, and holding it costs power.
{
  const dealt = (mark: boolean) => {
    const g = quiet(); g.st.slots = 1; const e = spawnEnemy(g, 'tank', 0, 30); e.hp = e.maxHp = 1e9;
    run(g, 3); if (mark) markAt(g, e.x, e.z);
    const d0 = g.stats.dmg['PAC-3'] ?? 0, p0 = g.power; g.st.gen = 0; g.st.ammoProd = 0; g.ammo = 1e9;
    run(g, 6);
    return [g.stats.dmg['PAC-3'] - d0, p0 - g.power];
  };
  const [dm, pm] = dealt(true), [du, pu] = dealt(false);
  ok(dm > du * 1.15 && pm > pu, `priority target: more damage (${dm.toFixed(0)} vs ${du.toFixed(0)}), costs power`);
}

// Emergency intercept: costs power, starts a cooldown, puts every weapon on one target.
{
  const g = quiet(); g.lv.pulse = 1; g.st = deriveStats(g.lv, []); g.st.slots = 3;
  const far = spawnEnemy(g, 'tank', 0, 30), near = spawnEnemy(g, 'tank', 2, 20);
  far.hp = far.maxHp = near.hp = near.maxHp = 1e9;
  run(g, 3);
  ok(interceptBlock(g) === '', 'intercept ready');
  const pw = g.power;
  ok(emergencyIntercept(g) && g.power < pw && g.marked === near.id, 'intercept picks the nearest threat and costs power');
  ok(!emergencyIntercept(g), 'intercept has a cooldown');
  const d0 = g.stats.dmg.HEL ?? 0; far.incoming = 0;
  let farShot = false;
  run(g, 3, () => { for (const p of g.shots) if (p.target === far.id) farShot = true; });
  ok(!farShot && (g.stats.dmg.HEL ?? 0) > d0, 'all weapons on the intercept target');
  run(g, 30); ok(interceptBlock(g) === '' || interceptBlock(g) === 'LOW PWR', 'intercept recharges');
}

// ARM vs a radiating radar: it connects and the radar goes dark.
s = quiet(); s.st.slots = 0; spawnEnemy(s, 'arm', 0, 40);
run(s, 6);
ok(s.radarDownUntil > 0 && !emitting(s), 'ARM knocks the radar out');
ok(s.enemies.every(e => !e.locked) && s.sweepSpeed === 0, 'dark radar: no locks, no sweep');
run(s, 10);
ok(emitting(s), 'radar comes back');

// Feedback events: fire control reports locks gained and lost, base hits carry the damage.
{
  const g = quiet(); const e = spawnEnemy(g, 'tank', 0, 30); e.hp = 1e9; e.speed = 0;
  const ks: string[] = []; run(g, 4, () => { for (const v of g.events) ks.push(v.k); });
  ok(ks.includes('acquire') && e.locked, 'lock acquired event');
  toggleEmcon(g); update(g, 1 / 60);
  ok(g.events.some(v => v.k === 'lost' && v.n === 1), 'lock lost event when the radar goes dark');
  const h = quiet(); spawnEnemy(h, 'drone', 0, 5); h.st.slots = 0; let dmg = 0;
  run(h, 3, () => { for (const v of h.events) if (v.k === 'baseHit') dmg = v.n!; });
  ok(dmg > 0, 'base hit carries its damage');
}

// EMCON before it arrives: the ARM loses the emitter and misses.
s = quiet(); s.st.slots = 0; spawnEnemy(s, 'arm', 1, 40); toggleEmcon(s);
const pw = s.power;
run(s, 8);
ok(s.radarDownUntil === 0 && s.hp === s.st.maxHp, 'EMCON makes the ARM miss');
ok(s.power >= pw, 'silent radar draws no power');

// Radar modes: FOCUSED finds contacts on its bearing sooner and further out, and nothing off it.
{
  const firstSeen = (mode: number, a: number, r: number) => {
    const g = quiet(); g.st.slots = 0; g.radarMode = mode; aimFocus(g, 1, 0); g.sweepA = Math.random() * 6.28;
    const e = spawnEnemy(g, 'drone', a, r); e.hp = 1e9; e.speed = e.vx = e.vz = 0;
    for (let i = 0; i < 20 * 60; i++) { update(g, 1 / 60); if (visible(g, e)) return g.t; }
    return Infinity;
  };
  const avg = (mode: number) => { let t = 0; for (let i = 0; i < 40; i++) t += firstSeen(mode, 0.2, 30); return t / 40; };
  ok(avg(1) < avg(0) * 0.7, `FOCUSED detects faster on its bearing (${avg(1).toFixed(2)}s vs ${avg(0).toFixed(2)}s)`);
  ok(firstSeen(1, Math.PI, 30) === Infinity, 'FOCUSED is blind off its bearing');
  ok(firstSeen(1, 0, 50) < Infinity && firstSeen(0, 0, 50) === Infinity, 'FOCUSED reaches further');
  const g = quiet(); cycleRadarMode(g); cycleRadarMode(g);
  ok(g.radarMode === 2 && radarRange(g) < g.st.radarRange, 'V cycles to LPI, which sees less');
}
// LPI: an ARM launched at a radiating LPI radar loses it and misses; LPI draws less power than ACTIVE.
{
  const g = quiet(); g.st.slots = 0; g.radarMode = 2; spawnEnemy(g, 'arm', 1, 40);
  run(g, 8);
  ok(g.radarDownUntil === 0 && emitting(g), 'LPI: ARMs lose the radar');
  const drain = (m: number) => { const q = quiet(); q.radarMode = m; q.st.gen = 0; q.st.ammoProd = 0; run(q, 5); return q.st.powerCap - q.power; };
  ok(drain(2) < drain(0) && drain(0) < drain(1), 'LPI < ACTIVE < FOCUSED power drain');
}

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

// Raid event: briefing matches what arrives; held = recovery lull; lost = next raid sooner.
{
  const g = quiet(); g.nextRaid = RAID_WARN; g.st.slots = 0; g.st.maxHp = g.hp = 1e9;
  run(g, 1 / 60);
  const brief = g.raid!, total = Object.values(brief.n).reduce((a, b) => a + b, 0) - (brief.n.ew ?? 0);
  ok(brief.bonus > 25 && brief.obj, 'briefing has objective and bonus');
  const next = g.nextRaid;
  run(g, RAID_WARN);
  ok(g.raidLeft === total && g.raidName === brief.name, `briefing matches the raid (${g.raidLeft}/${total})`);
  run(g, 25);
  ok(!g.raidClean && g.nextRaid === next - RAID_PRESS && g.calmUntil === 0, 'lost objective: next raid sooner, no recovery');
}
{
  const g = quiet(); g.nextRaid = RAID_WARN; g.st.slots = 2;
  run(g, 1 / 60, () => { if (g.raid) g.raid.g = { drone: 1 }; });
  run(g, 40);
  ok(g.stats.clean === 1 && g.calmUntil > 0, 'held objective: recovery lull');
}
{
  // PROTECT RADAR: an ARM on the radar loses it even though nothing landed on the battery.
  const g = quiet(); g.nextRaid = RAID_WARN; g.st.slots = 0;
  run(g, 1 / 60); g.raid!.g = { arm: 1, drone: 1 }; g.raid!.obj = 'radar';
  run(g, 20);
  ok(!g.raidClean && g.stats.radarHits > 0, 'ARM hit loses PROTECT RADAR');
}

// Attack packages: turn up in normal waves once their time comes, all from one bearing, escort jamming it.
{
  const g = newGame(3); g.phase = 'play'; g.nextRaid = g.nextElite = 1e9; g.st.maxHp = g.hp = 1e9;
  const seen = new Set<string>();
  run(g, 600, () => { for (const e of g.events) if (e.k === 'package') seen.add(e.name); });
  ok(seen.size >= 2, `packages spawn in normal waves (${[...seen]})`);
}
{
  const q = quiet(); q.st.slots = 0;
  const a = 1.2, before = q.nextId;
  // spawnGroup isn't exported; a raid uses it, so fly one with the escort package's composition.
  q.nextRaid = q.t + RAID_WARN; run(q, 1 / 60); q.raid!.g = PACKAGES.find(p => p.name === 'JAMMED SWARM')!.g; q.raid!.a = a;
  run(q, RAID_WARN + 5);
  const grp = q.enemies.filter(e => e.id >= before), jam = grp.find(e => e.kind === 'ew');
  ok(jam && jam.orbit && Math.abs(Math.atan2(jam.z, jam.x) - a) < EW_ARC && grp.every(e => e.pkg === jam.pkg), 'escort jammer holds its package bearing');
  const swarm = grp.filter(e => e.kind !== 'ew');
  ok(swarm.length && swarm.every(e => jamFactor(q, e) < 1 || Math.hypot(e.x, e.z) < 5), 'package flies inside its escort\'s jammed sector');
}

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

// New rule perks.
const withPerk = (id: string) => { const g = quiet(); g.perks = [id]; g.st = deriveStats(g.lv, g.perks); return g; };
{ // BLACKOUT PROTOCOL: going dark doubles what's left of every track on the scope
  const g = withPerk('blackout'); g.st.slots = 0; const e = spawnEnemy(g, 'tank', 0, 30); e.hp = 1e9; e.speed = 0;
  run(g, 5); const left = e.seenUntil - g.t;
  toggleEmcon(g); update(g, 1 / 60);
  ok(left > 0 && Math.abs(e.seenUntil - g.t - 2 * left) < 0.1, 'BLACKOUT PROTOCOL: tracks coast twice as long in EMCON');
}
{ // COUNTER-SEAD: an ARM shot down refills power
  const g = withPerk('csead'); g.power = 0; g.st.gen = 0; const a = spawnEnemy(g, 'arm', 0, 20); a.hp = 1e9; g.ammo = 1e9;
  update(g, 1 / 60); a.hp = 0.1; a.seenUntil = g.t + 5; markAt(g, a.x, a.z); run(g, 2);
  ok(g.stats.kills.arm === 1 && g.power >= g.st.powerCap * 0.15, `COUNTER-SEAD restores power (${g.power.toFixed(0)})`);
}
{ // KILL CHAIN: 5 kills, one more lock slot for a while
  const g = withPerk('killchain'); const n = g.st.slots;
  for (let i = 0; i < 5; i++) { const e = spawnEnemy(g, 'swarm', i, 20); e.hp = 0.01; e.seenUntil = 1e9; }
  run(g, 3);
  ok(g.kills >= 5 && slots(g) === n + 1, `KILL CHAIN adds a lock slot (${slots(g)})`);
  run(g, 10); ok(slots(g) === n, 'KILL CHAIN slot expires');
}
{ // OVERKILL: the excess of a kill hits the neighbour
  const g = withPerk('overkill'); g.st.slots = 0;
  const a = spawnEnemy(g, 'drone', 0, 30), b = spawnEnemy(g, 'tank', 0, 33); a.hp = 1; b.seenUntil = 1e9; a.seenUntil = 1e9; b.hp = b.maxHp = 1000;
  markAt(g, a.x, a.z); run(g, 3);
  ok(b.hp < 1000, 'OVERKILL carries over to the next contact');
}
{ // LAST STAND: low HP fires faster, generates less
  const shots = (low: boolean) => { const g = withPerk('laststand'); if (low) g.hp = g.st.maxHp * 0.2; g.st.repair = 0; let n = 0;
    for (let i = 0; i < 4; i++) spawnEnemy(g, 'tank', i, 40).hp = 1e9; run(g, 10, () => { n += g.events.filter(e => e.k === 'shot').length; }); return n; };
  ok(shots(true) > shots(false) * 1.3, 'LAST STAND: faster fire below 25% HP');
}

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
