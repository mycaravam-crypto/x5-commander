// `npm test` — headless run of the sim. Throws on the first broken rule.
import { newGame, update, stageInfo, spawnGroupAt, seedCode, parseCode, parseResult, buy, skipBuild, cruiseTarget, cost, lockReason, takeSkill, undoSkills, openTree, closeTree, skillPath, skillBlock, autoSpend, markAt, visible, spawnEnemy, toggleEmcon, cycleRadarMode, aimFocus, radarRange, slots, cycleDiscipline, emergencyIntercept, interceptBlock, emitting, jamFactor, phase, flankArc, building, interceptBlock as iBlock, bestSpot, buildBlock, freeSpots, beltOf, toggleRelocate, coverage, padStats, selectPad, upgradePad, sellPad, movePad, placePad, rand, dailySeed, type State, rollDrop, spawnDrop, collectDrop, toRank, techPool, overdrive, noAmmo, spotted, irHit, shownKind, horizonMask, boss, bossHp, bossReach, bossStandoff, upkeep } from './sim.ts';
import { baseLevel, difficulty, UPGRADES, SKILLS, KEYSTONES, skill, skillLinks, skillPoints, SKILL_POINTS, PACKAGES, EW_ARC, deriveStats, EW_ORBIT, MODS, LEVELS, LEVEL_LEN, BUILD_MIN, PAD_GAP, buildR, perimSlots, MG_TIERS, START_PADS, CROSSFIRE, OBSERVER_EYES, AMMO_RATE, PAD_HP, MOVE_TIME, VISUAL_R, PAD_EYES, MG_BELT, RADAR_REQ, BUILD_TIME, BUILD_LOST, RAID_WARN, ENEMIES, FRONT, FRONT_ARC, TERRAIN, AMMO_RELOAD, GUNS, HELO, LANCET, MILESTONE, DROP_MAX, CACHE, OVERDRIVE, REPAIR_DROP, KAB_FIRST, KAB_PAIR, SURGE, VETERANCY, TRAINING, TRAINING_BUILD, DOCTRINES, RAIDS, EW_MAX, RECON, KA52, SU25, SEAD as SEAD_FTR, ARM2, ARM_STUN, ARM_LIFE, MASK, horizon, flightAlt, KINDS, ARENA_R, BOSS, bossLevel, bossFor, resupply, RESUPPLY, UPKEEP, type DmgCat } from './config.ts';
import { buyMod, padHp, fanOf, padEyes, modCost, padUpgradeCost, inZone, spawnAt, unitCap, GROUND_EXTRA } from './sim.ts';
import { GROUND_FIRE, UNIT_TIERS, tideFor, HORDE_TEST, groundZone, FRONT_LINE, GROUND } from './config.ts';
import { site, PONDS, ROCKS, FARMS, mapSeed, openShare, OPEN_MIN, ground, riverZ, RIVER_W } from './terrain.ts';

// Deterministic: Math.random is seeded too, so a failure replays exactly.
const rng = { seed: 12345 };
Math.random = () => rand(rng);

const ok = (c: unknown, msg: string) => { if (!c) throw new Error('FAIL: ' + msg); };

// Terrain: the seed decides the map; every map keeps the layout rules.
{
  const sig = () => JSON.stringify([PONDS, ROCKS, FARMS.length, riverZ(0), ground(20, 20), ground(-25, 5)]);
  newGame(77); const a = sig();
  newGame(78); const b = sig();
  newGame(77); ok(sig() === a && mapSeed === 77, 'same seed, same map');
  ok(a !== b, 'another seed, another map');
  const d = newGame(dailySeed('2026-01-01'), '2026-01-01'); ok(mapSeed === d.seed, 'the daily op flies over its own seed\'s map');
  for (let seed = 1; seed <= 60; seed++) {
    const g = newGame(seed * 7919);
    ok(g.perim.every(p => !buildBlock(g, p.x, p.z, p.slot)), `starting MGs on open ground (seed ${seed})`);
    ok(openShare() >= OPEN_MIN, `enough open ground to build on (seed ${seed})`);
    ok(PONDS.length >= 1 && ROCKS.length >= 3, `ponds and outcrops (seed ${seed})`);
    for (let x = -36; x <= 36; x += 2) ok(Math.abs(riverZ(x)) - RIVER_W > 36 || Math.hypot(x, riverZ(x)) > 36, `river beyond the build zone (seed ${seed})`);
    ok(freeSpots(g).length > 10, `the auto-placer finds spots (seed ${seed})`);
  }
}
const run = (s: State, secs: number, each?: () => void) => {
  for (let i = 0; i < secs * 60; i++) { update(s, 1 / 60); each?.(); s.events.length = 0; }
};

// A battery that has bought its radar and Patriot, for the checks on what those do.
const armed = (g: State) => { g.lv.radar = g.lv.pac3 = 1; g.st = deriveStats(g.lv, g.skills, g.level); return g; };
// One thing at a time: no random spawns, strike packages or raids. Armed, and without the starting MG. On a fixed
// map where every reference spot (SPOT, below) is open ground, so a change to how many randoms earlier checks draw
// can't land a check's unit on water or rock.
const quiet = () => { const g = armed(newGame(1)); g.phase = 'play'; g.spawnAcc = -1e9; g.nextElite = 1e9; g.nextRaid = 1e9; g.perim.length = 0; return g; };

// Reference spots on open ground, by belt and degrees off the front (the old fixed slots, still used by the checks).
const SPOT: [number, number][] = [[17, 0], [11, 0], [17, -25], [17, 25], [30, 0], [30, -15], [30, 15], [11, -90], [11, 90], [11, -150], [11, 150], [17, -50], [11, 180], [30, -30], [30, 30], [17, 50]];
const slotXZ = (i: number) => { const [r, o] = SPOT[i], a = FRONT + o * Math.PI / 180; return { x: Math.cos(a) * r, z: Math.sin(a) * r }; };
const near = (p: { x: number; z: number }, q: { x: number; z: number }) => Math.hypot(p.x - q.x, p.z - q.z) < 0.8;

// Level thresholds
ok([0, 2, 3, 8, 9, 18].map(baseLevel).join() === '1,1,2,2,3,4', 'baseLevel thresholds');

// Cost scaling + max level
let s = newGame();
ok(cost(s, 'gen') === Infinity && lockReason(s, 'gen') === 'NEEDS RADAR', 'power needs a radar to feed');
s.lv.radar = 1;
ok(cost(s, 'gen') === 50, 'base cost');
s.lv.gen = 2; ok(cost(s, 'gen') === Math.round(50 * 1.45 ** 2), 'exp cost');
s.lv.modes = 3; ok(cost(s, 'modes') === Infinity, 'switch upgrades max out');
s.lv.hp = 60; ok(cost(s, 'hp') < Infinity, 'regular upgrades have no max');
s.lv.armor = 100; ok(deriveStats(s.lv, []).armor <= 0.85, 'armor diminishes');
s.level = 9; s.lv.radar = 1; s.lv.sweep = 8; ok(cost(s, 'sweep') === Infinity && lockReason(s, 'sweep') === 'NEEDS AESA', 'rotating radar scan cap');
s.lv.aesa = 1; ok(cost(s, 'sweep') < Infinity, 'AESA lifts the scan cap');

// Difficulty grows, but slower and slower: the second 30 min add less than the first.
{ const d = (m: number) => difficulty(m * 60).spawnRate * difficulty(m * 60).hp;
  const f = SURGE.from;
  ok(d(f) > d(f / 2) && d(f) - d(f / 2) < d(f / 2) - d(0), 'difficulty is sub-linear until the surge');
  ok(d(f + 20) / d(f + 10) > 3 && d(f + 10) / d(f) > 3, 'then it outgrows any battery: every run ends'); }

// Nothing happens before start
s = newGame(); run(s, 5); ok(s.t === 0, 'start phase frozen');

// Idle base (the starting MG and eyes): sees, shoots, earns — then eventually falls
s = newGame(); s.phase = 'play';
let sawVisible = false, invisibleShot = false;
run(s, 60, () => {
  for (const e of s.enemies) {
    if (visible(s, e)) sawVisible = true;
    if (e.locked && !visible(s, e)) invisibleShot = true;
  }
});
ok(s.enemies.length > 0 || s.kills > 0, 'enemies spawn');
ok(sawVisible, 'the idle MG base sees contacts');
ok(!invisibleShot, 'locks only on visible');
ok(s.kills > 0 && s.credits > 120, `kills earn credits (kills=${s.kills})`);
run(s, 900);
ok((s.phase as string) === 'over', 'idle base eventually falls');

// AESA: no sweep needed, contacts still get found all round.
s = quiet(); s.lv.aesa = 1; s.st = deriveStats(s.lv, []);
for (let i = 0; i < 8; i++) spawnEnemy(s, 'tank', i / 8 * Math.PI * 2, 30).hp = 1e9;
s.st.slots = 0;
{ const seen = new Set<number>(); run(s, 12, () => { for (const e of s.enemies) if (e.kind === 'tank' && visible(s, e)) seen.add(e.id); }); // not the ATGMs they fire
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
s = armed(newGame()); s.phase = 'play'; s.st.radarRange = 0;
run(s, 20);
// Eyes: the battery's own, and every emplacement's (the starting MG sees PAD_EYES round itself).
ok(s.enemies.every(e => !e.locked || Math.hypot(e.x, e.z) < VISUAL_R + 1 || s.perim.some(p => Math.hypot(p.x - e.x, p.z - e.z) < PAD_EYES + 1)), 'radar sees nothing: locks only on what the eyes see');

// Upgrading bot survives longer than idle, earns command tree points, grows base
const bot = () => {
  const g = newGame(); g.phase = 'play';
  run(g, 1200, () => {
    if (g.phase === 'tree') { autoSpend(g); closeTree(g); }
    // The milestones first: once one opens up, save for it. Then fill any room for another unit with a gun.
    const goal = ['radar', 'pac3'].find(id => cost(g, id) < Infinity);
    const gun = !g.placing && g.perim.length < perimSlots(g.level) ? GUNS.filter(k => cost(g, k) < Infinity).sort((a, b) => cost(g, a) - cost(g, b))[0] : undefined;
    buy(g, goal ?? gun ?? UPGRADES.map(u => u.id).sort((a, b) => cost(g, a) - cost(g, b))[0]);
    if (g.phase === 'over') return;
  });
  return g;
};
const idle = newGame(); idle.phase = 'play'; run(idle, 1200);
const b = bot();
ok(b.t > idle.t, `upgrades help (${b.t.toFixed(0)}s vs ${idle.t.toFixed(0)}s)`);
ok(b.level >= 3 && b.skills.length - 1 === skillPoints(b.level) && !b.points, `base grows + command tree (lv ${b.level}, nodes ${b.skills.length - 1})`);

// Base levels add capability, not just numbers.
{
  const at = (level: number) => deriveStats({}, [], level);
  ok(at(2).gen > at(1).gen && at(3).raidWarn > 0 && at(3).persist > at(2).persist, 'lv2 power plant, lv3 comms');
  ok(!at(3).backupRadar && at(4).backupRadar && at(5).armor > at(4).armor && at(6).slots === at(5).slots + 1, 'lv4 backup radar, lv5 berms, lv6 second ECS');
  ok(at(7).maxHp > at(6).maxHp && at(7).armStun < 1, 'lv7 hardened node');
  // TRML-4D keeps contacts coming while an ARM has the MPQ-65 down; lv3 hears raids earlier.
  const seen = (level: number) => { const g = quiet(); g.level = level; g.st = deriveStats(g.lv, [], level); g.radarDownUntil = 1e9;
    const e = spawnEnemy(g, 'tank', 0, 20); e.hp = 1e9; e.speed = 0; let v = false, l = false; // past eyesight, inside the TRML's reach
    run(g, 30, () => { v ||= visible(g, e); l ||= e.locked; }); return v && !l; }; // 30s: ~12 looks, so a miss is ~0.02% (10s was ~6%)
  ok(seen(4) && !seen(3), 'lv4: TRML-4D searches while the radar is down, without locks');
  const g = quiet(); g.level = 3; g.st = deriveStats(g.lv, [], 3); g.nextRaid = 20; run(g, 20 - RAID_WARN - 4.5);
  ok(g.raid, 'lv3: raids announced earlier');
  const b = newGame(); b.phase = 'play'; b.credits = 1e6; for (let i = 0; i < 3; i++) buy(b, 'hp');
  ok(b.level === 2 && b.st.gen === deriveStats(b.lv, [], 2).gen, 'level-up refreshes stats');
}

// Perimeter: gated by base level and open slots; a pad kills things on its own. The two starting MGs take two of lv1's 3.
s = newGame(); s.phase = 'play'; s.credits = 1e6;
ok(!buy(s, 'mantis'), 'mantis locked at lv1');
ok(buy(s, 'mg') && !placePad(s, 0, 0) && s.placing, 'no building inside the base compound');
{ const q = slotXZ(1); ok(placePad(s, q.x, q.z) && near(s.perim[START_PADS.length], q) && !buy(s, 'mg'), 'lv1 = 3 units, the starting MGs and one more'); }
s.level = 2;
ok(buy(s, 'mantis') && !buy(s, 'mantis'), 'one pad placed at a time');
{ const f = slotXZ(15); // clear of the starting MGs
  ok(!placePad(s, 0, -buildR(2) - 8), 'nothing outside the build zone');
  const n = START_PADS.length;
  ok(placePad(s, f.x + 0.2, f.z) && near(s.perim[n + 1], f), 'a unit goes where you click');
  ok(buy(s, 'mantis') && placePad(s, f.x, f.z) && Math.hypot(s.perim[n + 2].x - f.x, s.perim[n + 2].z - f.z) >= PAD_GAP - 1e-9, 'a taken spot: the nearest open one'); }
ok(!!buildBlock(s, PONDS[0].x, PONDS[0].z) && !!buildBlock(s, ROCKS[0].x, ROCKS[0].z), 'no building on water or rock');
ok(s.perim.length === 5 && !buy(s, 'mantis') && lockReason(s, 'mantis') === 'PADS FULL', 'lv2 = 5 units');
ok(s.perim.every(p => Math.hypot(p.x, p.z) >= BUILD_MIN && Math.hypot(p.x, p.z) <= buildR(2)), 'units stay inside the build zone');
ok(perimSlots(1) === 3 && perimSlots(9) === 16 && buildR(1) < buildR(3), 'the unit cap and the build zone grow with the base level');
{ const g = quiet(); g.credits = 1e6; g.level = 2; buy(g, 'mantis'); run(g, 9); ok(g.perim.length === 1 && !g.placing, 'unplaced pad places itself'); }
s.st.slots = 0; // no main-battery locks: only the pads can shoot
run(s, 40);
ok(s.kills > 0, `pads engage without locks (kills=${s.kills})`);

const SEAD = LEVELS.findIndex(l => l.name === 'SEAD'); // Su-34s, ARMs and Iskanders from here

// Slots and fields of fire. addPad: buy a unit and put it on a given slot.
const addPad = (g: State, k: string, slot: number) => { g.credits += 1e6; ok(buy(g, k), `buy ${k}`); const q = slotXZ(slot); ok(placePad(g, q.x, q.z) && g.perim.some(p => near(p, q)), `place ${k} on ${slot}`); return g.perim.find(p => near(p, q))!; };
{
  // A gun shoots inside its field of fire only: not at what's behind it.
  const g = quiet(); g.level = 9; g.st.slots = 0;
  const mg = addPad(g, 'mg', 0), behind = spawnEnemy(g, 'tank', FRONT, 9), ahead = spawnEnemy(g, 'tank', FRONT, 24);
  for (const e of [behind, ahead]) { e.speed = e.vx = e.vz = 0; e.hp = 1e9; }
  const hits = { b: 0, a: 0 };
  run(g, 3, () => { for (const sh of g.shots) if (sh.src === 'MG') { if (sh.target === behind.id) hits.b++; if (sh.target === ahead.id) hits.a++; } });
  ok(Math.hypot(behind.x - mg.x, behind.z - mg.z) <= MG_TIERS[0].range && hits.b === 0 && hits.a > 0, `MG fires ahead, not behind (${hits.a}/${hits.b})`);
  // Crossfire: an inner MANTIS covers the same contact, so the MG hits harder.
  addPad(g, 'mantis', 1); g.shots.length = 0;
  let dmg = 0;
  run(g, 0.5, () => { for (const sh of g.shots) if (sh.src === 'MG' && sh.target === ahead.id) dmg = Math.max(dmg, sh.dmg); });
  ok(Math.abs(dmg - MG_TIERS[0].dmg * g.st.padDmg * (1 + CROSSFIRE)) < 1e-9, `crossfire: +${CROSSFIRE * 100}% inside two fields of fire`);
  // The coverage map [O] agrees: crossfire ahead, a gap behind the base, and a gun that's down covers nothing.
  const at = (r: number) => coverage(g)(Math.cos(FRONT) * r, Math.sin(FRONT) * r);
  ok(at(24) === 2 && at(-8) === 0, `coverage: 2 guns ahead, none behind (${at(24)}/${at(-8)})`);
  g.perim[0].down = true; ok(at(24) === 1, 'coverage skips a unit that is down'); g.perim[0].down = false;
}
{
  // Auto-place goes where it adds the most: with the front covered and the flanks open, an inner flank slot.
  const g = quiet(); g.level = 4; g.stage = 5;
  addPad(g, 'mg', 0); addPad(g, 'mg', 1); addPad(g, 'mg', 4);
  const best = bestSpot(g, 'mg')!, off = Math.abs(Math.atan2(Math.sin(Math.atan2(best.z, best.x) - FRONT), Math.cos(Math.atan2(best.z, best.x) - FRONT)));
  ok(off > Math.PI / 6 && !buildBlock(g, best.x, best.z), `best spot covers the open flank (${(off * 180 / Math.PI).toFixed(0)}° off the front)`);
  const am = bestSpot(g, 'ammo')!;
  ok(g.perim.some(p => Math.hypot(p.x - am.x, p.z - am.z) <= 10), 'an ammo point goes next to guns');
  ok(freeSpots(g).every(q => !buildBlock(g, q.x, q.z)) && beltOf(slotXZ(4)) === 'fwd' && beltOf(slotXZ(0)) === 'main' && beltOf(slotXZ(1)) === 'inner', 'open spots are open; belts go by distance');
}
{
  // Support: an observer sees far round itself; an ammo point speeds up the guns in reach.
  const g = quiet(); g.level = 9;
  addPad(g, 'observer', 4);
  const o = slotXZ(4), e = spawnEnemy(g, 'tank', FRONT, Math.hypot(o.x, o.z) + OBSERVER_EYES - 3); e.speed = e.vx = e.vz = 0; e.hp = 1e9;
  g.st.radarRange = 0; run(g, 0.5);
  ok(visible(g, e), 'observer post sees far round itself');
  const mg = addPad(g, 'mg', 2), before = padStats(g, mg).rate;
  addPad(g, 'ammo', 0); // ~7m away
  ok(Math.abs(padStats(g, mg).rate - before * AMMO_RATE) < 1e-9, 'ammo point: guns in reach fire faster');
  // Belt reloads: slow on the forward line, fast next to an ammo point.
  const fwd = addPad(g, 'mg', 5), t = spawnEnemy(g, 'tank', Math.atan2(fwd.z, fwd.x), Math.hypot(fwd.x, fwd.z) + 8); t.speed = t.vx = t.vz = 0; t.hp = 1e9;
  fwd.belt = mg.belt = 1; run(g, 0.2);
  ok(fwd.cd > MG_BELT.reload && fwd.cd <= MG_BELT.reload * 1.5, `forward line reloads slower (${fwd.cd.toFixed(2)}s)`);
}
{
  // Forward line: FPVs and Lancets dive on it. Down at 0 HP (no fire), back at half, all fixed by the build window.
  const g = quiet(); g.level = 9; g.st.maxHp = g.hp = 1e9; g.st.slots = 0;
  const f = addPad(g, 'mg', 4), m = addPad(g, 'mg', 0);
  f.hp = 2;
  const e = spawnEnemy(g, 'scout', Math.atan2(f.z, f.x), Math.hypot(f.x, f.z) + 6); e.hp = 1e9;
  let downEv = false;
  run(g, 3, () => { downEv ||= g.events.some(v => v.k === 'padDown'); });
  ok(!g.enemies.includes(e) && f.down && downEv && g.hp === g.st.maxHp, 'a Lancet dives on the forward MG and knocks it out');
  const fired = g.stats.dmg.MG ?? 0, x = spawnEnemy(g, 'tank', Math.atan2(f.z, f.x), Math.hypot(f.x, f.z) + 8); x.speed = x.vx = x.vz = 0; x.hp = 1e9;
  m.k = 'observer'; // only the downed forward gun could reach it
  run(g, 2);
  ok((g.stats.dmg.MG ?? 0) === fired, 'a unit that is down does not fire');
  run(g, PAD_HP / 2 / 0.5 + 1);
  ok(!f.down, 'repairs bring it back at half HP');
  const e2 = spawnEnemy(g, 'swarm', FRONT + Math.PI, 30); e2.hp = 1e9; // far from any forward unit: goes for the base
  run(g, 8); ok(!g.enemies.includes(e2) && g.hp < g.st.maxHp && f.hp > 0, 'no forward unit in the way: FPVs go for the base');
}
{
  // Tall or wide: upgrade in place (counts as a purchase), sell, move.
  const g = quiet(); g.level = 9; g.credits = 1e6;
  const mg = addPad(g, 'mg', 0), bought = g.bought;
  ok(selectPad(g, mg.x + 1, mg.z) && upgradePad(g) && mg.tier === 1 && g.bought === bought + 1, 'upgrade in place: twin MG');
  ok(upgradePad(g) && mg.tier === 2 && padStats(g, mg).range === MG_TIERS[2].range && !upgradePad(g), 'then ZU-23, the top tier');
  const q = slotXZ(3);
  toggleRelocate(g); ok(g.relocating, 'move order armed for the picked unit');
  ok(movePad(g, q.x + 0.2, q.z) && near(mg, q) && mg.cd === MOVE_TIME && !g.relocating, 'moving in combat takes it offline');
  const paid = mg.paid, cr = g.credits;
  ok(sellPad(g) && g.credits === cr + Math.round(paid * 0.5) && !g.perim.includes(mg) && g.selected === -1, 'selling in combat refunds half');
  const b = addPad(g, 'mantis', 0); g.buildUntil = g.t + 10; selectPad(g, b.x, b.z);
  const q2 = slotXZ(2);
  ok(!movePad(g, 0, 0) && near(b, slotXZ(0)), 'no moving into the base compound');
  ok(movePad(g, q2.x, q2.z) && b.cd === 0, 'moving in the build window is free');
  const cr2 = g.credits; ok(sellPad(g) && g.credits === cr2 + b.paid, 'selling in the build window refunds it all');
  ok(!selectPad(g, 40, 40) && g.selected === -1, 'clicking empty ground picks nothing');
}

// Terrain: high ground reaches further but draws fire, the treeline hides but reaches less, the road reloads fast.
{
  // Maps are random: take the first seed whose map has every kind of ground, near in and on the forward line.
  const has = (g: State, t: string, fwd: boolean) => freeSpots(g).some(q => site(q.x, q.z) === t && (fwd ? Math.hypot(q.x, q.z) >= 24 : Math.hypot(q.x, q.z) < 30));
  let g = quiet();
  for (let seed = 1; ; seed++) {
    g = armed(newGame(seed)); Object.assign(g, { phase: 'play', spawnAcc: -1e9, nextElite: 1e9, nextRaid: 1e9, level: 9 }); g.perim.length = 0;
    if (['high', 'treeline', 'road', ''].every(t => has(g, t, false)) && has(g, 'high', true) && has(g, 'treeline', true)) break;
  }
  g.st.slots = 0; g.st.maxHp = g.hp = 1e9;
  const spotOf = (t: string) => freeSpots(g).find(q => site(q.x, q.z) === t && Math.hypot(q.x, q.z) < 30)!;
  const put = (t: string) => { const q = t ? spotOf(t) : freeSpots(g).find(q => !site(q.x, q.z))!; ok(q, `a ${t || 'plain'} spot`); g.credits += 1e6; buy(g, 'mg'); placePad(g, q.x, q.z); return g.perim[g.perim.length - 1]; };
  const high = put('high'), tree = put('treeline'), plain = put('');
  ok(high.site === 'high' && tree.site === 'treeline' && plain.site === '', 'units know the ground they stand on');
  ok(Math.abs(padStats(g, high).range - MG_TIERS[0].range * TERRAIN.high.range) < 1e-9 && Math.abs(padStats(g, tree).range - MG_TIERS[0].range * TERRAIN.treeline.range) < 1e-9
    && padStats(g, plain).range === MG_TIERS[0].range, 'high ground +20% range, treeline -15%');
  for (const p of [high, tree, plain]) p.paid = 100; // equal price: only the ground differs
  ok(cruiseTarget(g, { x: 0, z: -60 }) === high, 'a cruise missile goes for the unit on high ground first');
  tree.paid = 1e6; ok(cruiseTarget(g, { x: 0, z: -60 }) !== tree, 'and never finds the one at the treeline');
  // An FPV heading in 4 m off a forward unit (beyond its usual 3 m): dives on high ground (skyline), never on the treeline.
  const h = new Set(g.perim);
  const fwd = (t: string) => { const q = freeSpots(g).find(q => site(q.x, q.z) === t && Math.hypot(q.x, q.z) >= 24)!; g.credits += 1e6; buy(g, 'mg'); placePad(g, q.x, q.z); return g.perim.find(p => !h.has(p) && p.site === t)!; };
  for (const p of g.perim) p.down = true; // only the forward units below are up
  const fHigh = fwd('high'), fTree = fwd('treeline');
  const pass = (p: typeof high) => { const a = Math.atan2(p.z, p.x), side = a + Math.PI / 2, e = spawnEnemy(g, 'swarm', a, Math.hypot(p.x, p.z) + 10);
    e.x += Math.cos(side) * 4; e.z += Math.sin(side) * 4; e.hp = 1e9; e.dmg = 1; const hp = p.hp; run(g, 3); g.enemies.length = 0; return p.hp < hp; };
  ok(pass(fHigh) && !pass(fTree), 'FPVs dive on high ground from further out, never on the treeline');
  g.perim = g.perim.filter(p => h.has(p));
  for (const p of g.perim) p.down = false;
  // The road: an MG there reloads its belt as fast as with an ammo point in reach.
  const road = put('road'); road.belt = 1; road.cd = 0;
  spawnEnemy(g, 'tank', Math.atan2(road.z, road.x), Math.hypot(road.x, road.z) + 6).hp = 1e9;
  run(g, 0.5);
  ok(road.belt === MG_BELT.rounds && road.cd <= MG_BELT.reload * AMMO_RELOAD + 1e-9, `an MG on the road reloads fast (cd ${road.cd.toFixed(2)})`);
}
{
  // The build window can be cut short: the next level starts now.
  const g = quiet(); run(g, 1); g.buildUntil = g.t + 20; run(g, 0.5); skipBuild(g); run(g, 0.1);
  ok(!building(g) && g.stage === 1, 'skipping the build window starts the next level');
}

// Cruise missiles: announced with their target, they go for the unit you've sunk the most into and knock it out.
{
  const g = quiet(); g.level = 9; g.st.slots = 0; g.st.maxHp = g.hp = 1e9;
  const cheap = addPad(g, 'observer', 7), dear = addPad(g, 'mantis', 8);
  const e = spawnEnemy(g, 'cruise', FRONT + Math.PI, 40); e.hp = 1e9;
  const ev = g.events.find(v => v.k === 'cruise');
  ok(ev && 'n' in ev && ev.n === dear.slot && e.tgt === dear.slot, 'cruise launch: announced, going for the most valuable unit');
  run(g, 12);
  ok(!g.enemies.includes(e) && dear.down && !cheap.down && g.hp === g.st.maxHp, 'one cruise missile knocks its unit out, the base untouched');
  const e2 = spawnEnemy(g, 'cruise', FRONT + Math.PI, 40); e2.hp = 1e9;
  run(g, 12);
  ok(!g.enemies.includes(e2) && cheap.down, 'with its first choice down, the next goes for another unit');
  const e3 = spawnEnemy(g, 'cruise', FRONT + Math.PI, 40); e3.hp = 1e9;
  run(g, 12);
  ok(!g.enemies.includes(e3) && g.hp < g.st.maxHp, 'no unit up: it goes for the battery');
}
{
  // Low flyer: under the radar horizon until it's close.
  const g = quiet(); g.st.slots = 0; g.st.persist = 0.5;
  const far = spawnEnemy(g, 'cruise', FRONT, radarRange(g) * 0.8), near = spawnEnemy(g, 'tank', FRONT + 1, radarRange(g) * 0.8);
  for (const e of [far, near]) { e.speed = e.vx = e.vz = 0; e.hp = 1e9; }
  let seenFar = false, seenNear = false;
  run(g, 15, () => { seenFar ||= visible(g, far); seenNear ||= visible(g, near); });
  ok(!seenFar && seenNear, 'radar horizon: a cruise missile at 80% of radar range stays unseen');
}
{
  // IRIS-T SLM: base level 5 and the radar; takes on the missile before a closer drone.
  const g = quiet(); g.level = 4; g.credits = 1e6;
  ok(lockReason(g, 'iris') === 'BASE LV 5', 'IRIS-T SLM opens at base level 5');
  g.level = 9; g.st.slots = 0;
  const sam = addPad(g, 'iris', 1);
  const drone = spawnEnemy(g, 'drone', FRONT, Math.hypot(sam.x, sam.z) + 10), cm = spawnEnemy(g, 'cruise', FRONT + 0.3, Math.hypot(sam.x, sam.z) + 22);
  for (const e of [drone, cm]) { e.speed = e.vx = e.vz = 0; e.hp = 1e9; e.seenUntil = 1e9; } // both on the scope: this is about priority
  let first = 0;
  run(g, 3, () => { first ||= g.shots.find(sh => sh.src === 'IRIS-T SLM')?.target ?? 0; });
  ok(first === cm.id, 'the SAM takes the cruise missile first');
}

// The starting kit: a section of AA machine guns facing the front, eyes, and no radar or Patriot.
{
  const g = newGame(); g.phase = 'play'; g.spawnAcc = -1e9; g.nextRaid = g.nextElite = 1e9;
  const mg = g.perim[0], mgA = Math.atan2(mg.z, mg.x), off = (p: { x: number; z: number }) => Math.abs(Math.atan2(p.z, p.x) - FRONT);
  ok(g.perim.length === START_PADS.length && g.perim.every(p => p.k === 'mg' && off(p) < 0.5) && !g.st.radar && !g.st.weapons.cannon && !emitting(g), 'start: two MGs on the front, no radar, no Patriot');
  // Eyes: the base sees VISUAL_R all round, an emplacement sees PAD_EYES round itself; beyond that, nothing.
  const near = spawnEnemy(g, 'tank', FRONT + Math.PI, VISUAL_R - 2), far = spawnEnemy(g, 'tank', FRONT + Math.PI, VISUAL_R + 4);
  const fwd = spawnEnemy(g, 'tank', mgA, Math.hypot(mg.x, mg.z) + PAD_EYES - 2), inReach = spawnEnemy(g, 'tank', mgA + 0.05, Math.hypot(mg.x, mg.z) + MG_TIERS[0].range - 2); // eyes reach further than the gun
  for (const e of [near, far, fwd, inReach]) { e.speed = e.vx = e.vz = 0; e.hp = 1e9; }
  run(g, 0.5);
  ok(visible(g, near) && visible(g, fwd) && !visible(g, far), 'eyes: close to the base or to an emplacement');
  ok(g.enemies.every(e => !e.locked), 'no radar: no locks');
  // Without a radar there's nothing to silence, switch, mark or intercept with.
  toggleEmcon(g); cycleRadarMode(g); markAt(g, fwd.x, fwd.z);
  ok(!g.emcon && g.radarMode === 0 && !g.marked && iBlock(g) === 'NO RADAR', 'no radar: no EMCON, modes, priority or intercept');
  // The MG takes on what it can see, from its own belt, and reloads when it runs dry.
  ok(g.stats.dmg.MG > 0 && g.perim[0].belt < MG_BELT.rounds, 'MG fires at a visible contact without a lock');
  fwd.hp = 1e9; run(g, MG_BELT.rounds / 6 + 0.5);
  ok(g.perim[0].cd > 1, 'MG reloads when the belt runs out');
  const pre = g.ammo; run(g, 1); ok(g.ammo >= pre, 'MG ammo is its own, not the interceptor pool');
}
{
  // NO AMMO: a gun that draws on the interceptor pool flags when the pool can't feed it; the MG never does.
  const g = quiet(); g.level = 9;
  const mg = addPad(g, 'mg', 1), sam = addPad(g, 'iris', 0);
  g.ammo = g.st.ammoCap; ok(!noAmmo(g, sam) && !noAmmo(g, mg), 'no NO AMMO with a full pool');
  g.ammo = 1; ok(noAmmo(g, sam) && !noAmmo(g, mg), 'NO AMMO on the SAM with the pool short of a round, not on the MG');
  sam.down = true; ok(!noAmmo(g, sam), 'a unit that is down shows as down, not NO AMMO');
}
{
  const g = newGame(); g.phase = 'play'; g.spawnAcc = -1e9; g.nextRaid = g.nextElite = 1e9; g.st.maxHp = g.hp = 1e9;
  g.perim.length = 1; // one of the starting pair, on its own
  const e = spawnEnemy(g, 'drone', Math.atan2(g.perim[0].z, g.perim[0].x), 40);
  run(g, 15);
  ok(!g.enemies.includes(e) && g.kills === 1 && g.hp === g.st.maxHp, 'one MG alone stops a Shahed coming at it');
  ok(g.perim[0].kills === 1 && g.stats.perim.mg === 1, 'the MG is credited with its kill');
  // Veterancy: kills make the unit better, and the step to a new rank is announced.
  const mg = g.perim[0], green = padStats(g, mg);
  mg.kills = VETERANCY[1].kills - 1; let ranked = false;
  const d = spawnEnemy(g, 'drone', Math.atan2(mg.z, mg.x), 30); run(g, 15, () => { ranked ||= g.events.some(e => e.k === 'padRank' && e.n === 1); });
  ok(!g.enemies.includes(d) && mg.kills === VETERANCY[1].kills && ranked, 'a gun ranks up on its kills');
  const vet = padStats(g, mg);
  ok(vet.dmg > green.dmg && vet.rate > green.rate, 'a ranked gun hits harder and fires faster');
  mg.kills = VETERANCY[VETERANCY.length - 1].kills; ok(padStats(g, mg).range > green.range, 'an ace reaches further');
  mg.kills = VETERANCY[1].kills;
  const arm = spawnEnemy(g, 'arm', FRONT, 30);
  run(g, ARM_LIFE + 1); // blind, it veers off: shot down on the way, or out of motor
  ok(!g.enemies.includes(arm) && g.radarDownUntil === 0 && g.stats.radarHits === 0, 'an ARM has no radar to knock out');
}
// Unlock ladder: the radar opens at base level RADAR_REQ; sensors, fire control and the Patriot need it.
{
  const g = newGame(); g.phase = 'play'; g.credits = 1e6;
  ok(lockReason(g, 'radar') === `BASE LV ${RADAR_REQ}` && lockReason(g, 'slots') === 'NEEDS RADAR' && lockReason(g, 'range') === 'NEEDS RADAR', 'radar gated by base level, sensors by the radar');
  g.level = RADAR_REQ;
  ok(lockReason(g, 'pac3') === 'NEEDS RADAR' && buy(g, 'radar') && g.st.radar && emitting(g) && !buy(g, 'radar'), 'buying the radar switches it on, once');
  ok(buy(g, 'pac3') && g.st.weapons.cannon && lockReason(g, 'slots') === '', 'then the Patriot and fire control upgrades');
}

// Manual mark picks nearest visible enemy (fire control: needs the radar)
s = armed(newGame()); s.phase = 'play'; run(s, 20);
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

// Resource tension: repairs and locks draw power.
{
  const g = quiet(); g.lv.repair = 3; g.st = deriveStats(g.lv, []); g.st.gen = 0; g.st.ammoProd = 0; g.hp = 50; g.emcon = true;
  run(g, 5);
  ok(g.hp > 55 && g.power < g.st.powerCap - 5, `repairs cost power (hp ${g.hp.toFixed(1)}, power ${g.power.toFixed(1)})`);
  g.power = g.st.powerCap * 0.1; const hp = g.hp; run(g, 5);
  ok(g.hp === hp, 'no repairs without surplus power');
  const drain = (n: number) => { const q = quiet(); q.st.gen = 0; q.st.ammoProd = 0; q.emcon = true;
    for (let i = 0; i < n; i++) spawnEnemy(q, 'tank', i, 30).locked = true; q.st.fusion = true; q.st.slots = 4; run(q, 1); return q.st.powerCap - q.power; };
  ok(drain(3) > drain(0) + 0.5, 'held locks draw power');
}

// Emergency intercept: costs power, starts a cooldown, puts every weapon on one target.
{
  const g = quiet(); g.lv.pulse = 1; g.st = deriveStats(g.lv, []); g.st.slots = 3;
  const far = spawnEnemy(g, 'tank', 0, 30), near = spawnEnemy(g, 'tank', 2, 9); // inside the laser's reach
  far.hp = far.maxHp = near.hp = near.maxHp = 1e9; far.cd = near.cd = 1e9; // holding their ATGMs: only the two of them in the air
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
  ok(Math.abs((h.stats.taken.drone ?? 0) - dmg) < 1e-9, 'the debrief counts what hit the battery, by type');
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
  // Enough samples that the average is stable (true ratio ~0.55; 40 samples crossed 0.7 on about 1 seed in 5).
  const avg = (mode: number) => { let t = 0; for (let i = 0; i < 200; i++) t += firstSeen(mode, 0.2, 30); return t / 200; };
  const [foc, act] = [avg(1), avg(0)];
  ok(foc < act * 0.7, `FOCUSED detects faster on its bearing (${foc.toFixed(2)}s vs ${act.toFixed(2)}s)`);
  ok(firstSeen(1, Math.PI, 30) === Infinity, 'FOCUSED is blind off its bearing');
  ok(firstSeen(1, 0, 78) < Infinity && firstSeen(0, 0, 78) === Infinity, 'FOCUSED reaches further'); // ACTIVE 68 m, FOCUSED 88
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

// Each type flies like what it is.
{
  // Mi-28: stops at standoff, hovers firing ATGMs, then goes home without ever reaching the battery.
  const g = quiet(); g.st.slots = 0; g.st.maxHp = g.hp = 1e9;
  const h = spawnEnemy(g, 'tank', 0, 40); h.hp = 1e9;
  let atgms = 0, closest = 99, hovered = false;
  run(g, 60, () => {
    atgms += g.events.filter(v => v.k === 'release' && v.kind === 'atgm').length;
    if (g.enemies.includes(h)) { closest = Math.min(closest, Math.hypot(h.x, h.z)); hovered ||= h.act === 'hover'; }
  });
  ok(hovered && atgms === HELO.ammo && closest > HELO.standoff - 2 && !g.enemies.includes(h) && g.hp < g.st.maxHp, `Mi-28 hovers at standoff, fires its ATGMs and leaves (${atgms}, ${closest.toFixed(1)}m)`);
  // Su-34: releases a glide bomb from standoff and turns for home; the bomb does the damage.
  const q = quiet(); q.st.slots = 0; q.st.maxHp = q.hp = 1e9; toggleEmcon(q);
  const su = spawnEnemy(q, 'elite', 0, 50); su.hp = 1e9;
  let kab = false, egress = false;
  run(q, 40, () => { kab ||= q.enemies.some(e => e.kind === 'kab'); egress ||= su.act === 'egress'; });
  ok(kab && egress && !q.enemies.includes(su) && q.hp < q.st.maxHp && q.stats.kills.elite === undefined, 'Su-34 lobs a glide bomb and egresses');
  ok(su.ammo === 0 && spawnEnemy(q, 'elite', 0, 50).ammo === KAB_FIRST, 'on the SEAD level, where the Su-34 is new, it carries one bomb');
  q.stage = SEAD + 1; ok(spawnEnemy(q, 'elite', 0, 50).ammo === KAB_PAIR, 'after that, a pair');
  // Lancet: circles out at LANCET.loiter searching, then dives.
  const l = quiet(); l.st.slots = 0;
  const la = spawnEnemy(l, 'scout', 0, 35); la.hp = 1e9;
  const acts = new Set<string>();
  run(l, 5 + LANCET.time, () => { if (l.enemies.includes(la)) acts.add(la.act); });
  ok(acts.has('loiter') && acts.has('dive') && !l.enemies.includes(la), 'a Lancet loiters, then dives on the battery');
  // Shahed: a steep, faster dive at the end.
  const d = quiet(); const sh = spawnEnemy(d, 'drone', 0, 30); sh.hp = 1e9; const v0 = sh.speed; let vmax = 0;
  run(d, 8, () => { if (d.enemies.includes(sh)) vmax = Math.max(vmax, Math.hypot(sh.vx, sh.vz)); });
  ok(vmax > v0 * 1.5, 'a Shahed dives on the battery');
  // Kh-101: routed off its launch bearing through a dogleg.
  const c = quiet(); const cm = spawnEnemy(c, 'cruise', 0, 40); cm.hp = 1e9; let off = 0;
  run(c, 3, () => { off = Math.max(off, Math.abs(Math.atan2(cm.z, cm.x))); });
  ok(off > 0.3, 'a cruise missile flies a dogleg');
}

// New threats and the realism pass.
{
  // Orlan-10: circles on station, spots for its sector (hits there land harder), and goes home after a while.
  const g = quiet(); g.st.slots = 0; g.st.maxHp = g.hp = 1e9;
  const o = spawnEnemy(g, 'recon', FRONT, 50); o.hp = 1e9;
  let spotEv = false;
  run(g, 10, () => { spotEv ||= g.events.some(v => v.k === 'spot'); });
  ok(o.orbit && spotEv && Math.abs(Math.hypot(o.x, o.z) - RECON.orbit) < 3, 'an Orlan-10 goes on station and says so');
  const a = Math.atan2(o.z, o.x);
  ok(spotted(g, { x: Math.cos(a) * 20, z: Math.sin(a) * 20 }) && !spotted(g, { x: -Math.cos(a) * 20, z: -Math.sin(a) * 20 }) && !spotted(g, o), 'it spots for its own sector only');
  const hit = (b: number) => { const e = spawnEnemy(g, 'drone', b, 6); e.hp = 1e9; const t = g.stats.taken.drone ?? 0; run(g, 2); return ((g.stats.taken.drone ?? 0) - t) / e.dmg; }; // per point of its damage (difficulty grows meanwhile)
  const inside = hit(Math.atan2(o.z, o.x)), outside = hit(Math.atan2(o.z, o.x) + Math.PI);
  ok(Math.abs(inside / outside - RECON.dmg) < 1e-6, `hits in its sector land harder (${(inside / outside).toFixed(2)})`);
  run(g, RECON.time + 20);
  ok(!g.enemies.includes(o), 'and it goes home once its time on station is up');
}
{
  // Ka-52: settles at standoff (exposed), masks in the trees, pops up to fire ATGM pairs at your nearest unit, then leaves.
  const g = quiet(); g.level = 9; g.st.slots = 0; g.st.maxHp = g.hp = 1e9;
  const obs = addPad(g, 'observer', 5); g.st.slots = 0; // after the buy, which refreshes the stats: no Patriot shooting the ATGMs down
  const h = spawnEnemy(g, 'ka52', FRONT, 45); h.hp = 1e9;
  let settle = false, atUnit = 0, masked = false, exposedSettling = false, closest = 99;
  run(g, 20, () => {
    settle ||= g.events.some(v => v.k === 'settle');
    atUnit += g.events.filter(v => v.k === 'release' && v.n === obs.slot).length;
    if (!g.enemies.includes(h)) return;
    closest = Math.min(closest, Math.hypot(h.x, h.z));
    if (h.act === 'hover' && h.ammo === KA52.ammo && h.cd > 0.5) exposedSettling ||= flightAlt(h) >= MASK.alt;
    if (h.act === 'hover' && h.pop <= 0) masked ||= flightAlt(h) < MASK.alt && horizon(flightAlt(h)) < 1;
  });
  ok(settle && exposedSettling && masked, 'a Ka-52 settles in the open, then masks');
  ok(atUnit >= KA52.salvo && obs.down, `its ATGMs go for the nearest unit and knock it out (${atUnit})`);
  ok(closest > KA52.standoff - 3, `it holds its standoff (${closest.toFixed(1)}m)`);
  run(g, 60);
  ok(!g.enemies.includes(h), 'out of ATGMs, it goes home');
  // No unit in reach: the battery.
  const b = quiet(); b.st.slots = 0; b.st.maxHp = b.hp = 1e9;
  spawnEnemy(b, 'ka52', FRONT, 40).hp = 1e9; run(b, 30);
  ok(b.hp < b.st.maxHp, 'no unit in reach: a Ka-52 fires on the battery');
}
{
  // Kinzhal: announced as a ballistic launch, only PAC-3 touches it, and it speeds up in the dive.
  const g = quiet(); g.lv.pulse = g.lv.rail = g.lv.missile = 1; g.st = deriveStats(g.lv, []); g.st.weapons.cannon = null;
  const k = spawnEnemy(g, 'hyper', 0, 50); const v0 = k.speed; let vmax = 0;
  ok(g.events.some(v => v.k === 'tbm' && v.kind === 'hyper'), 'a Kinzhal launch sounds the ballistic warning');
  run(g, 6, () => { if (g.enemies.includes(k)) vmax = Math.max(vmax, Math.hypot(k.vx, k.vz)); });
  ok(!g.stats.dmg.HEL && !g.stats.dmg.HPM && !g.stats.dmg['IRIS-T'] && g.hp < g.st.maxHp && vmax > v0 * 1.25, `Kinzhal: PAC-3 only, faster in the dive (${(vmax / v0).toFixed(2)}x)`);
  const p = quiet(); spawnEnemy(p, 'hyper', 0, 50).hp = 1; run(p, 6);
  ok(p.stats.kills.hyper === 1, 'PAC-3 kills a Kinzhal');
}
{
  // Kh-55 decoy: passes for a Kh-101 (announced as one, going for a unit), classified under lock, and does nothing.
  const g = quiet(); g.level = 9; g.st.slots = 0; g.st.maxHp = g.hp = 1e9;
  const u = addPad(g, 'observer', 8);
  const m = spawnEnemy(g, 'mald', FRONT + Math.PI, 40); m.hp = 1e9;
  ok(shownKind(m) === 'cruise' && g.events.some(v => v.k === 'cruise' && 'n' in v && v.n === u.slot), 'a Kh-55 decoy shows and is announced as a Kh-101');
  let dud = false;
  run(g, 12, () => { dud ||= g.events.some(v => v.k === 'dud'); });
  ok(!g.enemies.includes(m) && !u.down && dud && g.hp === g.st.maxHp, 'it dives on its unit and does nothing');
  const c = quiet(); const d = spawnEnemy(c, 'mald', FRONT, 20); d.hp = 1e9; d.speed = d.vx = d.vz = 0; // inside its radar horizon, over the cleared field of fire
  let ided = false; run(c, 15, () => { ided ||= d.ided; });
  ok(ided && shownKind(d) === 'mald', 'fire control classifies it under lock');
}
{
  // FPVs hunt the most isolated unit near them; units covering each other are left alone.
  const one = quiet(); one.level = 9; one.st.slots = 0; one.st.maxHp = one.hp = 1e9;
  const lone = addPad(one, 'mg', 0); lone.k = 'observer'; // doesn't shoot back, so the swarm gets there
  const f = spawnEnemy(one, 'swarm', FRONT, Math.hypot(lone.x, lone.z) + 5); f.hp = 1e9;
  const hp0 = lone.hp; run(one, 4);
  ok(lone.hp < hp0 && one.hp === one.st.maxHp, 'an FPV dives on an isolated unit');
  const many = quiet(); many.level = 9; many.st.slots = 0; many.st.maxHp = many.hp = 1e9;
  const c = [0, 2, 3].map(i => addPad(many, 'mantis', i));
  for (const p of c) p.cd = 1e9; // hold fire: only where the FPV goes matters
  const f2 = spawnEnemy(many, 'swarm', FRONT, Math.hypot(c[0].x, c[0].z) + 5); f2.hp = 1e9;
  run(many, 8);
  ok(c.every(p => p.hp === PAD_HP) && many.hp < many.st.maxHp, 'units covering each other are left alone: the FPV goes for the base');
  // Normal spawns bring 4 to 8 FPVs.
  const g = newGame(4242); g.phase = 'play'; g.stage = 1; g.nextRaid = g.nextElite = 1e9;
  const packs = new Map<number, number>(), seen = new Set<number>();
  run(g, 240, () => { for (const e of g.enemies) if (e.kind === 'swarm' && !e.pkg && !seen.has(e.id)) { seen.add(e.id); packs.set(e.born, (packs.get(e.born) ?? 0) + 1); } });
  const sizes = [...packs.values()].filter(n => n > 0);
  ok(sizes.length > 2 && sizes.every(n => n >= 4 && n <= 8) && new Set(sizes).size > 1, `FPV packs of 4-8 (${sizes.join(',')})`);
}
{
  // Radar horizon by height, and clutter over woods and rock for low flyers; IR signature for IR seekers.
  const g = quiet(); g.st.slots = 0; g.st.persist = 0.5;
  const fpv = spawnEnemy(g, 'swarm', FRONT, radarRange(g) * 0.8), orlan = spawnEnemy(g, 'recon', FRONT + 1, radarRange(g) * 0.9);
  for (const e of [fpv, orlan]) { e.speed = e.vx = e.vz = 0; e.hp = 1e9; }
  let seenFpv = false, seenOrlan = false;
  run(g, 15, () => { seenFpv ||= visible(g, fpv); seenOrlan ||= visible(g, orlan); });
  ok(!seenFpv && seenOrlan, 'an FPV at 80% of radar range is under the horizon; an Orlan-10 high up at 90% is not');
  let wood: { x: number; z: number } | undefined;
  for (let r = 20; r < 45 && !wood; r += 1) for (let a = 0; a < 64 && !wood; a++) { const x = Math.cos(a / 64 * 6.283) * r, z = Math.sin(a / 64 * 6.283) * r; if (['forest', 'rock'].includes(ground(x, z))) wood = { x, z }; }
  ok(wood, 'a map with woods or rock in radar range');
  const lo = spawnEnemy(g, 'swarm', Math.atan2(wood!.z, wood!.x), Math.hypot(wood!.x, wood!.z)), hi = spawnEnemy(g, 'drone', Math.atan2(wood!.z, wood!.x), Math.hypot(wood!.x, wood!.z));
  Object.assign(lo, wood); Object.assign(hi, wood);
  ok(horizonMask(lo, 1e6) === MASK.sig && horizonMask(hi, 1e6) === 1, 'low over woods or rock: masked; higher: not');
  const irOf = (k: 'swarm' | 'drone' | 'elite' | 'ka52') => irHit(spawnEnemy(g, k, 0, 50));
  ok(irOf('swarm') < irOf('drone') && irOf('drone') < 1 && irOf('ka52') > 1 && irOf('elite') > irOf('ka52'), 'IR seekers: cold FPVs are hard, jets and helicopters easy');
  // The new threats wait for level 5, so the first four levels play (and seed) as before.
  const late = ['recon', 'ka52', 'hyper', 'mald'];
  ok(LEVELS.slice(0, 4).every(l => late.every(k => !(l.w as Record<string, number>)[k])) && late.every(k => KINDS.includes(k as never)), 'new threats from level 5 on');
}

// Decoy: locked, classified, released, never locked again, harmless on arrival.
s = quiet(); spawnEnemy(s, 'decoy', 0, 30); s.enemies[0].hp = 1e9;
let ided = false, relocked = false;
run(s, 15, () => { for (const e of s.enemies) { ided ||= e.ided; relocked ||= e.ided && e.locked; } });
ok(ided && !relocked, 'decoy classified and released');
ok(s.enemies.length === 0 && s.hp === s.st.maxHp, 'decoy does no damage');
// An unclassified decoy landing on the battery says it was a dud, rather than vanishing like a Shahed that did nothing.
s = quiet(); s.st.radar = false; spawnEnemy(s, 'decoy', 0, 12);
let dud = false;
run(s, 10, () => { dud ||= s.events.some(e => e.k === 'dud'); });
ok(dud && s.enemies.length === 0 && s.hp === s.st.maxHp, 'a decoy on the battery is reported as a dud');

// Mi-8 jammer stands off on its bearing and blanks only its own sector.
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

// Raid event: briefing matches what arrives; the raid ends the level; held = full build window, lost = short one.
{
  const g = quiet(); g.nextRaid = RAID_WARN; g.st.slots = 0; g.st.maxHp = g.hp = 1e9;
  run(g, 1 / 60);
  const brief = g.raid!, total = Object.values(brief.n).reduce((a, b) => a + b, 0) - (brief.n.ew ?? 0);
  ok(brief.bonus > 25 && brief.obj, 'briefing has objective and bonus');
  ok(g.nextRaid === Infinity, 'one raid per level');
  run(g, RAID_WARN);
  ok(g.raidLeft === total && g.raidName === brief.name, `briefing matches the raid (${g.raidLeft}/${total})`);
  let build = 0;
  run(g, 40, () => { for (const e of g.events) if (e.k === 'build') build = e.n; });
  ok(!g.raidClean && build === BUILD_LOST && g.stage === 1, 'lost objective: short build window, then the next level');
}
{
  const g = quiet(); g.nextRaid = RAID_WARN; g.st.slots = 2;
  run(g, 1 / 60, () => { if (g.raid) g.raid.g = { drone: 1 }; });
  let build = 0;
  run(g, 40, () => { for (const e of g.events) if (e.k === 'build') build = e.n; });
  ok(g.stats.clean === 1 && build === BUILD_TIME, 'held objective: full build window');
}
// Level cycle: waves, the raid, a build window with no new contacts, then the next level and its raid.
{
  const g = newGame(4); g.phase = 'play'; g.st.maxHp = g.hp = 1e9;
  let quietBuild = true, stages = 0, t0 = 0;
  for (let i = 0; i < 400 * 60 && stages < 2; i++) {
    const n = g.nextId, was = building(g);
    update(g, 1 / 60);
    if (was && building(g) && g.enemies.some(e => e.id >= n && !['arm', 'arm2', 'atgm', 'kab', 'rocket'].includes(e.kind))) quietBuild = false; // what aircraft still up fire is not a new contact
    for (const e of g.events) if (e.k === 'stage') { stages++; t0 = g.t; }
    g.events.length = 0;
  }
  ok(stages === 2 && g.stage === 2 && quietBuild, `levels advance through build windows (${stages}, stage ${g.stage})`);
  ok(Math.abs(g.nextRaid - (t0 + LEVEL_LEN)) < 0.1, 'each level schedules its own raid');
}
{
  // PROTECT RADAR: an ARM on the radar loses it even though nothing landed on the battery.
  const g = quiet(); g.nextRaid = RAID_WARN; g.st.slots = 0;
  run(g, 1 / 60); g.raid!.g = { arm: 1, drone: 1 }; g.raid!.obj = 'radar';
  run(g, 20);
  ok(!g.raidClean && g.stats.radarHits > 0, 'ARM hit loses PROTECT RADAR');
  const h = newGame(); h.phase = 'play'; h.spawnAcc = -1e9; h.nextElite = 1e9; h.stage = SEAD; h.nextRaid = RAID_WARN;
  for (let i = 0; i < 300 && (!h.raid || h.raid.name !== 'SEAD STRIKE'); i++) { h.raid = null; h.nextRaid = h.t + RAID_WARN; run(h, 1 / 60); }
  ok(h.raid?.name === 'SEAD STRIKE' && h.raid.obj === 'battery', 'no radar yet: SEAD STRIKE is PROTECT BATTERY');
}

// Attack packages: turn up in normal waves once their level comes, all from one bearing, escort jamming it.
{
  const g = newGame(3); g.phase = 'play'; g.stage = SEAD; g.nextRaid = g.nextElite = 1e9; g.st.maxHp = g.hp = 1e9; // stays on the level
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

// The front: aircraft and short-range drones only ever come from FRONT ± FRONT_ARC. Long-range drones and
// missiles stay on the front early on, then widen to their phase's arc (checked at spawn, allowing for group spread).
{
  const g = newGame(11); g.phase = 'play'; g.st.maxHp = g.hp = 1e9;
  const off = (e: { x: number; z: number }) => Math.abs(((Math.atan2(e.z, e.x) - FRONT + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
  let seen = g.nextId, front = 0, wide = 0, early = 0;
  run(g, 900, () => {
    for (const e of g.enemies) if (e.id >= seen && !['arm', 'arm2', 'atgm', 'kab', 'rocket'].includes(e.kind)) { // launched where their aircraft are
      if (ENEMIES[e.kind].flank) { ok(off(e) < flankArc(g.stage) + 0.2, `${e.kind} inside the flank arc`); if (off(e) > FRONT_ARC + 0.2) wide++; }
      else { ok(off(e) < FRONT_ARC + 0.2, `${e.kind} comes from the front (${off(e).toFixed(2)} rad)`); front++; }
      if (g.stage < 3) { ok(off(e) < FRONT_ARC + 0.2, `nothing off the front early (${e.kind} at ${g.t.toFixed(0)}s)`); early++; }
    }
    seen = g.nextId;
  });
  ok(front > 50 && early > 50 && wide > 10, `front ${front} · early ${early} · off-axis ${wide}`);
}

// Difficulty curve: each level introduces its problem; nothing turns up before its level.
{
  const first = (k: string) => LEVELS.findIndex(p => (p.w as Record<string, number>)[k]);
  ok(first('swarm') === 1 && first('tank') === 2 && first('decoy') === 2 && first('cruise') === 4 && first('ew') === 4
    && first('elite') === SEAD && first('arm') === SEAD && first('tbm') === SEAD && LEVELS[SEAD].name === 'SEAD', 'level order: FPVs, helicopters, flanks, cruise and EW, then SEAD');
  for (const p of PACKAGES) ok(p.from >= 2, `${p.name} waits for the EW screen`);
  const g = newGame(); g.stage = LEVELS.length + 3;
  ok(phase(g).pk! > LEVELS[LEVELS.length - 1].pk!, 'packages get likelier past the scripted levels');
  const h = newGame(2); h.phase = 'play'; h.st.maxHp = h.hp = 1e9; let early = false;
  for (let i = 0; i < 900 * 20 && h.stage < SEAD; i++) { update(h, 1 / 20); h.events.length = 0; early ||= h.stage < SEAD && h.enemies.some(e => e.kind === 'elite' || e.kind === 'arm' || e.kind === 'tbm'); }
  ok(h.stage === SEAD && !early, 'no Su-34s, ARMs or Iskanders before the SEAD level');
}

// Conditions: after the scripted levels, MODS loop.
s = newGame(); s.stage = LEVELS.length;
ok(phase(s).name === MODS[0].name, 'first condition');
s.stage += MODS.length;
ok(phase(s).name === MODS[0].name, 'conditions loop');

// Command tree: one connected tree, keystones are leaves, points per level, take / undo / needs.
{
  const ids = new Set(SKILLS.map(n => n.id));
  ok(ids.size === SKILLS.length && SKILLS.every(n => n.from.every(f => ids.has(f) && !skill(f)!.key)), 'tree: unique ids, every link real, nothing hangs off a keystone');
  ok(KEYSTONES.length === 23 && KEYSTONES.every(n => n.from.length === 1), 'tree: the 23 old perks are keystones');
  const reach = new Set(['core']);
  for (let grew = true; grew;) { grew = false; for (const n of SKILLS) if (!reach.has(n.id) && n.from.some(f => reach.has(f))) { reach.add(n.id); grew = true; } }
  ok(reach.size === SKILLS.length, 'tree: every node reachable from COMMAND');
  ok(skillPoints(1) === 0 && skillPoints(2) === SKILL_POINTS && skillPoints(5) === 4 * SKILL_POINTS + 1 && skillPoints(13) === 26, 'points: 2 a level, +1 every 5th');
  ok(skillPoints(13) < (SKILLS.length - 1) / 2, 'a good run fills less than half the tree');
  ok(SKILLS.every(n => n.key || Object.keys(n.fx).length <= 1), 'travel nodes are one small step each');
}
{
  const g = quiet(); g.phase = 'play'; g.credits = 1e6;
  for (let i = 0; i < 3 && g.phase === 'play'; i++) buy(g, 'hp');
  ok(g.level === 2 && (g.phase as string) === 'tree' && g.points === SKILL_POINTS, `level-up opens the tree with ${SKILL_POINTS} points`);
  ok(skillBlock(g, 'o2a') === 'NOT CONNECTED' && skillBlock(g, 'o1') === '' && skillBlock(g, 'core') === 'TAKEN', 'only nodes next to one you hold');
  const dmg = g.st.padDmg;
  ok(takeSkill(g, 'o1') && g.st.padDmg > dmg && g.points === SKILL_POINTS - 1, 'a travel node: one point, a small step');
  ok(takeSkill(g, 'o2b') && !takeSkill(g, 'o3b') && skillBlock(g, 'o3b') === 'NO POINTS', 'out of points');
  undoSkills(g);
  ok(g.points === SKILL_POINTS && g.skills.join() === 'core' && g.st.padDmg === dmg, 'undo gives back what this visit took');
  ok(skillPath(g, 'overcharge').join() === 'o1,o2b,overcharge' && skillPath(g, 'chain').length === 5, 'paths run the shortest way');
  closeTree(g); ok((g.phase as string) === 'play' && g.points === SKILL_POINTS, 'closing banks the points');
  openTree(g); takeSkill(g, 'o1'); closeTree(g); openTree(g); undoSkills(g);
  ok(g.skills.includes('o1'), 'undo only reaches back to when the tree was opened');
  // Keystones: leaves, and the ones on the radar or the Patriot wait for them.
  g.points = 2; autoSpend(g, 'overcharge'); openTree(g);
  ok(g.skills.includes('overcharge') && skillLinks('overcharge').length === 1, 'a keystone at the end of its spur');
  g.points = 50; g.lv.radar = 0; for (const id of skillPath(g, 'killchain').slice(0, -1)) takeSkill(g, id);
  ok(skillBlock(g, 'killchain').startsWith('NEEDS'), `KILL CHAIN needs the radar (${skillBlock(g, 'killchain')})`);
  g.lv.radar = 1; ok(takeSkill(g, 'killchain') && g.st.killChain, 'with the radar it can be taken');
  // A path never runs through a keystone: everything from here on is reached through travel nodes.
  const h = quiet(); h.phase = 'tree'; h.skills = ['core', 'd1', 'd2b', 'fortress']; h.points = 9;
  ok(!skillPath(h, 'd3b').includes('fortress') && skillPath(h, 'd3b').join() === 'd3b', 'no path through a keystone');
  ok(KEYSTONES.every(k => SKILLS.every(n => !n.from.includes(k.id))), 'keystones are leaves');
}
// The horde test starts with the points for its level, banked.
ok(newGame(3, '', 'standard', false, true, true).points === skillPoints(newGame(3, '', 'standard', false, true, true).level), 'horde test: points for its level');

// TRACK FUSION: locks survive EMCON.
s = quiet(); spawnEnemy(s, 'tank', 0, 30); s.enemies[0].hp = 1e9;
s.skills = ['fusion']; s.st = deriveStats(s.lv, s.skills); s.st.slots = 1;
run(s, 4);
ok(s.enemies[0].locked, 'locked before EMCON');
toggleEmcon(s); run(s, 2);
ok(s.enemies[0].locked, 'fusion keeps the lock through EMCON');

// New rule perks.
const withPerk = (id: string) => { const g = quiet(); g.skills = [id]; g.st = deriveStats(g.lv, g.skills); return g; };
{ // BLACKOUT PROTOCOL: going dark doubles what's left of every track on the scope
  const g = withPerk('blackout'); g.st.slots = 0; const e = spawnEnemy(g, 'tank', 0, 30); e.hp = 1e9; e.speed = 0;
  run(g, 5); const left = e.seenUntil - g.t;
  toggleEmcon(g); update(g, 1 / 60);
  ok(left > 0 && Math.abs(e.seenUntil - g.t - 2 * left) < 0.1, 'BLACKOUT PROTOCOL: tracks coast twice as long in EMCON');
}
{ // COUNTER-SEAD: an ARM shot down refills power
  const g = withPerk('csead'); g.power = 0; g.st.gen = g.st.upkeep = 0; const a = spawnEnemy(g, 'arm', 0, 20); a.hp = 1e9; g.ammo = 1e9;
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
  // Per level: how long a level lasts depends on play (the raid has to be dealt with), but what each level sends doesn't.
  const spawns = (seed: number, noise: boolean) => {
    const g = newGame(seed); g.phase = 'play';
    const seen: string[][] = [];
    for (let i = 0; i < 150 * 60; i++) {
      const n = g.nextId;
      update(g, 1 / 60);
      if (noise) Math.random();
      for (const e of g.enemies) if (e.id >= n && e.kind !== 'arm' && !e.raid && !e.pkg) (seen[g.stage] ??= []).push(`${e.kind}@${e.wob.toFixed(4)}`); // wob: a seeded draw, unlike position (clock)
    }
    return seen;
  };
  const same = (a: string[][], b: string[][]) => a.length >= 2 && a.every((l, i) => { const m = Math.min(l.length, b[i]?.length ?? 0); return m > 5 && l.slice(0, m).join() === b[i].slice(0, m).join(); });
  ok(same(spawns(7, false), spawns(7, true)), 'seeded schedule ignores other randomness, level by level');
  // Through packages and raids, with the player working the commands: none of them touch the schedule.
  // (No fire here, and before the SEAD raid, so every raid ends the same way and the pacing matches too.)
  const long = (commands: boolean) => {
    const g = newGame(11, '2026-09-28'); g.phase = 'play'; g.st.maxHp = g.hp = 1e9; g.st.slots = 0;
    const seen: string[] = [];
    for (let i = 0; i < 270 * 20; i++) {
      const n = g.nextId;
      if (commands && i % 97 === 0) { cycleDiscipline(g); cycleRadarMode(g); toggleEmcon(g); aimFocus(g, Math.random() - 0.5, 1); }
      update(g, 1 / 20); g.events.length = 0;
      for (const e of g.enemies) if (e.id >= n && e.kind !== 'arm') seen.push(`${e.kind}@${e.x.toFixed(2)}`);
    }
    return seen.join();
  };
  ok(long(false) === long(true), 'daily schedule (packages, raids) ignores the player\'s commands');
  // Raids draw from their own stream and go by the level: the same raids, bearings and sizes in the same order,
  // however the pacing shifts.
  const raids = (press: number) => {
    const g = newGame(5, '2026-09-28'); g.phase = 'play'; g.st.maxHp = g.hp = 1e9; const out: string[] = [];
    for (let i = 0; i < 700 * 20; i++) {
      update(g, 1 / 20);
      for (const e of g.events) {
        if (e.k === 'build') g.buildUntil += press; // as if the level had gone differently
        if (e.k === 'raid') out.push(`${e.name}@${e.x.toFixed(1)}×${JSON.stringify(g.raid!.n)}`);
      }
      g.events.length = 0;
    }
    return out.slice(0, 5).join();
  };
  ok(raids(0).split(',').length >= 5 && raids(0) === raids(15), 'raids are independent of pacing');
  ok(!same(spawns(7, false), spawns(8, false)), 'different seeds differ');
  ok(dailySeed('2026-09-28') === dailySeed('2026-09-28') && dailySeed('2026-09-28') !== dailySeed('2026-09-29'), 'daily seed');
}

// Doctrines: free levels without base-level progress; daily ops ignore them.
s = newGame(1, '', 'sensor');
ok(s.lv.range === 1 && s.st.radar && s.st.weapons.cannon && !newGame(1).st.radar && s.bought === 0 && s.level === 1 && s.st.radarRange > newGame(1).st.radarRange, 'doctrine loadout: SENSOR NET starts with the radar and Patriot');
ok(newGame(1, '2026-09-28', 'sensor').doctrine === 'standard', 'daily flies standard');

// Ranks: every MILESTONE-th level of an open-ended upgrade is worth a free extra level; switches and pads have none.
{
  ok(deriveStats({ dmg: MILESTONE - 1 }, []).padDmg === 1 + 0.25 * (MILESTONE - 1) && deriveStats({ dmg: MILESTONE }, []).padDmg === 1 + 0.25 * (MILESTONE + 1), 'rank: +1 free level');
  ok(deriveStats({ dmg: 2 * MILESTONE }, []).padDmg === 1 + 0.25 * (2 * MILESTONE + 2), 'every rank adds one');
  const g = newGame(); g.phase = 'play'; g.credits = 1e9;
  ok(toRank(g, 'hp') === MILESTONE && toRank(g, 'mg') === 0, 'pads have no ranks');
  const stars: boolean[] = [];
  for (let i = 0; i < MILESTONE; i++) { buy(g, 'hp'); for (const e of g.events) if (e.k === 'upgrade') stars.push(e.star); g.events.length = 0; if ((g.phase as string) === 'tree') closeTree(g); }
  ok(stars.length === MILESTONE && stars.lastIndexOf(true) === MILESTONE - 1 && stars.indexOf(true) === MILESTONE - 1, 'the rank-up buy is flagged');
  ok(g.st.maxHp >= (100 + 40 * (MILESTONE + 1)) * Math.min(...SKILLS.map(n => n.fx.hp ?? 1)) && toRank(g, 'hp') === MILESTONE, 'rank counts in the stats, next rank 5 buys away');
}

// Salvage: rare drops on kills, on the ground until clicked.
{
  const g = quiet(), always = () => 0, never = () => 0.999;
  ok(!rollDrop(g, 'tank', 10, 0, never) && !rollDrop(g, 'decoy', 10, 0, always), 'drops are rare, decoys drop nothing');
  const d = rollDrop(g, 'tank', 10, 0, always)!;
  ok(d && g.drops.length === 1 && g.events.some(e => e.k === 'drop'), 'a kill can drop salvage');
  ok(!collectDrop(g, 30, 0) && g.drops.length === 1, 'clicking far away misses it');
  run(g, 120);
  ok(g.drops.length === 1 && g.drops[0] === d, 'unclaimed salvage stays until it is clicked');
  ok(collectDrop(g, d.x + 1, d.z) && g.drops.length === 0, 'and is recovered whenever it is');
  const c0 = g.credits; spawnDrop(g, 'cache', 10, 0, 50);
  ok(collectDrop(g, 11, 1) && g.credits - c0 === Math.round((CACHE.flat + CACHE.reward * 50) * g.st.credits) && g.drops.length === 0, 'cache pays credits');
  g.ammo = 0; g.power = 0; spawnDrop(g, 'ammo', 0, 20); spawnDrop(g, 'power', 0, -20);
  ok(collectDrop(g, 0, 20) && g.ammo === g.st.ammoCap && collectDrop(g, 0, -20) && g.power === g.st.powerCap, 'ammo and power refills');
  g.hp = 10; spawnDrop(g, 'repair', 5, 5);
  ok(collectDrop(g, 5, 5) && Math.abs(g.hp - (10 + g.st.maxHp * REPAIR_DROP)) < 1e-6, 'repair kit');
  const bought = g.bought, lv = { ...g.lv }; spawnDrop(g, 'tech', 5, 5); collectDrop(g, 5, 5);
  const got = Object.keys(g.lv).filter(k => g.lv[k] !== lv[k]);
  ok(got.length === 1 && techPool(g).includes(got[0]) && g.bought === bought, 'tech: a free level of an open upgrade, no base-level progress');
  const m = addPad(g, 'mg', 0), r0 = padStats(g, m).rate; spawnDrop(g, 'overdrive', 5, 5); collectDrop(g, 5, 5);
  ok(overdrive(g) && Math.abs(padStats(g, m).rate - r0 * OVERDRIVE.rate) < 1e-9, 'overdrive: faster fire');
  run(g, OVERDRIVE.time + 0.1); ok(!overdrive(g), 'overdrive wears off');
  for (let i = 0; i < DROP_MAX + 5; i++) rollDrop(g, 'elite', i, 0, always);
  ok(g.drops.length === DROP_MAX, 'drops are capped');
  // Kills roll for drops at their rate (seeded Math.random here).
  const h = quiet(); let n = 0;
  for (let i = 0; i < 2000; i++) if (rollDrop(h, 'elite', 0, 0)) { n++; h.drops.length = 0; }
  ok(Math.abs(n / 2000 - ENEMIES.elite.drop) < 0.05, `drop rate (${n}/2000)`);
}

// Training: four scripted waves (eyes, radar, ARMs, decoys) that can't be lost, then it's done.
{
  const g = newGame(undefined, '', 'sensor', true); g.phase = 'play' as State['phase'];
  ok(g.training && g.doctrine === 'standard' && !g.st.radar, 'training starts as STANDARD, eyes only');
  const seen = new Set<string>(); let radarAt = -1, hpMin = Infinity, trained = false;
  for (let i = 0; i < 60 * 600 && g.phase === 'play'; i++) {
    update(g, 1 / 60);
    for (const e of g.enemies) seen.add(`${g.stage}${e.kind}`);
    if (g.st.radar && radarAt < 0) radarAt = g.stage;
    hpMin = Math.min(hpMin, g.hp);
    if (g.events.some(e => e.k === 'trained')) trained = true;
    g.events.length = 0;
  }
  ok(trained && g.phase === 'over' && g.stage === TRAINING.length - 1, `training runs its ${TRAINING.length} waves and ends (stage ${g.stage}, ${g.phase})`);
  ok(radarAt === 1 && g.st.weapons.cannon, 'wave 2 hands out the radar and the Patriot');
  ok(seen.has('2arm') && seen.has('3decoy') && !seen.has('0arm'), 'ARMs in wave 3, decoys in wave 4');
  ok(hpMin >= 1, 'training can\'t be lost');
  ok(g.t < TRAINING.length * (40 + TRAINING_BUILD) * 2, `training is short (${g.t.toFixed(0)}s)`);
  const h = newGame(undefined, '', 'standard', true);
  ok(h.seed === g.seed, 'training flies the same map every time');
}

// Doctrines: the starting loadout, and a trade that holds all run, through level-ups and perks.
{
  const std = newGame(9), str = newGame(9, '', 'strike'), log = newGame(9, '', 'logistics'), sen = newGame(9, '', 'sensor');
  ok(Math.abs(str.st.maxHp - std.st.maxHp * 0.75) < 1e-9, 'FORWARD STRIKE: less HP from the start');
  str.phase = 'play'; str.credits = 1e6; for (let i = 0; i < 4; i++) buy(str, 'hp'); autoSpend(str); closeTree(str);
  const plain = deriveStats(str.lv, str.skills, str.level);
  ok(str.level >= 2 && Math.abs(str.st.maxHp - plain.maxHp * 0.75) < 1e-9 && str.st.padDmg > plain.padDmg * 1.14, 'FORWARD STRIKE: its trade holds after level-ups');
  ok(cost(log, 'hp') === Math.round(60 * DOCTRINES.find(d => d.id === 'logistics')!.price!) && cost(std, 'hp') === 60, 'LOGISTICS: upgrades cost less');
  ok(sen.st.radarRange > deriveStats(sen.lv, []).radarRange * 1.14 && sen.st.padDmg < std.st.padDmg, 'SENSOR NET: sees further, hits softer');
  ok(newGame(9, '2026-01-01', 'strike').st.maxHp === std.st.maxHp, 'daily ops fly STANDARD, trade-free');
}

{
  // Su-25: comes in low, pops up with flares out, fires an S-8 salvo at a unit, breaks away and comes round again.
  const g = quiet(); g.level = 9; g.st.slots = 0; g.st.maxHp = g.hp = 1e9;
  const obs = addPad(g, 'observer', 0);
  const j = spawnEnemy(g, 'su25', FRONT, 50); j.hp = 1e9;
  ok(flightAlt(j) < MASK.alt + 1 && horizon(flightAlt(j)) < 1, 'a Su-25 comes in under the radar horizon');
  let salvos = 0, rockets = 0, atUnit = 0, flares = false, back = false, broke = false;
  run(g, 60, () => {
    const r = g.events.filter(v => v.k === 'release' && v.kind === 'rocket');
    rockets += r.length; atUnit += r.filter(v => 'n' in v && v.n === obs.slot).length;
    if (r.length) { salvos++; flares ||= j.pop > 0 && irHit(j) < irHit({ ...j, pop: 0 }) && flightAlt(j) > flightAlt({ ...j, pop: 0 }); }
    broke ||= j.act === 'egress' && j.ammo > 0;
    back ||= broke && j.act === 'in';
  });
  ok(salvos === SU25.passes && rockets === SU25.passes * SU25.salvo, `two attack runs, a salvo each (${salvos} runs, ${rockets} rockets)`);
  ok(atUnit >= SU25.salvo && obs.hp < PAD_HP, `its rockets go for the unit in reach (${atUnit})`);
  ok(flares && broke && back && !g.enemies.includes(j), 'pops up with flares out, breaks away, comes round, then goes home');
}
{
  // Su-35S: holds station, fires Kh-58s only while the radar radiates, goes home when it's out.
  const g = quiet(); g.st.slots = 0; g.st.maxHp = g.hp = 1e9; g.radarDownUntil = 0;
  const f = spawnEnemy(g, 'sead', FRONT, SEAD_FTR.standoff + 10); f.hp = 1e9;
  toggleEmcon(g);
  let launches = 0, closest = 99;
  const count = () => { launches += g.events.filter(v => v.k === 'arm' && v.kind === 'arm2').length; if (g.enemies.includes(f)) closest = Math.min(closest, Math.hypot(f.x, f.z)); g.enemies = g.enemies.filter(e => e.kind !== 'arm2'); }; // its missiles taken away, so the radar stays up
  run(g, 15, count);
  ok(f.orbit && launches === 0, 'a Su-35S on station holds its Kh-58s while the radar is dark');
  toggleEmcon(g);
  run(g, 60, count);
  ok(launches === SEAD_FTR.ammo && closest > SEAD_FTR.standoff - 6 && !g.enemies.includes(f), `then fires them all from standoff and goes home (${launches}, ${closest.toFixed(1)}m)`);
  // Kh-58 memory seeker: going dark doesn't make it veer off. Over many, some still hit, some miss; a Kh-31P misses.
  const hits = (kind: 'arm' | 'arm2') => { let n = 0;
    for (let i = 0; i < 40; i++) {
      const q = quiet(); q.st.maxHp = q.hp = 1e9; const m = spawnEnemy(q, kind, FRONT + i * 0.1, 30); m.hp = 1e9; m.wob = i / 40 * 6.283;
      run(q, 0.5); toggleEmcon(q); run(q, 20); n += q.stats.radarHits;
    } return n; };
  const h2 = hits('arm2'), h1 = hits('arm');
  ok(h1 === 0 && h2 >= 8 && h2 <= 28, `EMCON early: Kh-31Ps all miss, Kh-58s hit some of the time (${h2}/40)`);
  const q = quiet(); spawnEnemy(q, 'arm2', FRONT, 20).hp = 1e9; let out = 0;
  run(q, 5, () => { if (q.events.some(v => v.k === 'radarDown')) out = q.radarDownUntil - q.t; });
  ok(Math.abs(out - ARM_STUN * ARM2.stun * q.st.armStun) < 1e-6, `a Kh-58 hit knocks the radar out longer (${out.toFixed(1)}s)`);
}

// Late game: jammers get likelier every level past the script, new packages and raids join the mix.
{
  const ew = (i: number) => stageInfo(i).w.ew ?? 0, last = LEVELS.length;
  ok(ew(last + 1) > ew(last) && ew(last + 40) <= (LEVELS[last - 1].w.ew ?? 0) + EW_MAX + 1e-9 + 0.8, 'EW pressure grows, capped');
  ok(PACKAGES.some(p => p.from >= 6) && RAIDS.some(r => r.from >= 7), 'late packages and raids');
  const g = quiet(); g.stage = 8;
  const jam = spawnGroupAt(g, { ew: 2, cruise: 1 }, FRONT, 1).filter(e => e.kind === 'ew');
  ok(jam.length === 2 && Math.abs(jam[0].hold - jam[1].hold) > EW_ARC, 'two escort jammers stand side by side');
}

// Share codes: a normal run's code replays its seed and doctrine; a daily op's is its date; found inside a result line too.
{
  for (const seed of [1, -1, 123456789, -2147483648, 2147483647]) for (const doctrine of ['standard', 'strike']) {
    const c = parseCode(seedCode({ seed, daily: '', doctrine }));
    ok(c?.kind === 'run' && c.seed === seed && c.doctrine === doctrine, `seed code round trip (${seed} ${doctrine})`);
  }
  const g = newGame(dailySeed('2026-09-29'), '2026-09-29'), c = parseCode(`some text ${seedCode(g)} more`);
  ok(c?.kind === 'daily' && c.daily === '2026-09-29', 'daily code');
  const r = parseResult(`X5 COMMANDER · DAILY OP 2026-09-29 · 12:34 · 1,234 kills · lv 7 · 3/5 clean raids · ${seedCode(g)}`);
  ok(r && r.time === 754 && r.kills === 1234 && r.code.kind === 'daily' && r.code.daily === '2026-09-29', 'a result line parses');
  ok(parseCode('nothing here') === null && parseCode('X5-ZZZZZZZZ-0') === null, 'junk has no code');
}

// Debrief counters add up.
{
  const dealt = Object.values(b.stats.dmg).reduce((a, x) => a + x, 0);
  const killed = Object.values(b.stats.kills).reduce((a, x) => a + x, 0);
  ok(killed === b.kills && dealt > 0 && b.stats.dmg['PAC-3'] > 0, `debrief (${killed}/${b.kills})`);
  const L = b.stats.levels, unitKills = Object.values(b.stats.units).reduce((a, u) => a + u.kills, 0);
  const over = (b.phase as string) === 'over';
  ok(L.length === b.stage + (over || building(b) ? 1 : 0) && L.every((l, i) => (l.end === 'fell') === (over && i === L.length - 1)), `a line per level, 'fell' only where it fell (${L.length} lines, stage ${b.stage})`);
  ok(L.reduce((a, l) => a + l.kills, 0) === b.stats.lvKills, 'level kills add up');
  ok(Math.abs(L.reduce((a, l) => a + l.hp, 0) - b.stats.lvHp) < 1e-6, 'level HP lost adds up');
  const f = newGame(5); f.phase = 'play'; run(f, 1500);
  ok((f.phase as string) === 'over' && f.stats.levels.at(-1)!.end === 'fell' && f.stats.levels.reduce((a, l) => a + l.kills, 0) === f.kills, 'a lost run logs the level it fell in');
  ok(unitKills === Object.values(b.stats.perim).reduce((a, x) => a + x, 0), `unit kills match perimeter kills (${unitKills})`);
}

// The war escalates from about level 5: kills pay more as it does, so upgrades keep coming.
{
  ok(difficulty(SURGE.from * 60).pay === 1 && difficulty((SURGE.from + 10) * 60).pay > 1.5, 'kills pay more once the war escalates');
  const g = quiet(); g.t = (SURGE.from + 10) * 60;
  ok(spawnEnemy(g, 'drone', 0, 60).reward > ENEMIES.drone.reward, 'a late Shahed is worth more');
  ok(difficulty((SURGE.from + 10) * 60).hp > 2 * difficulty((SURGE.from + 5) * 60).hp / 1.5, 'the threat compounds past the surge');
}

// Resupply: the generators and the reload line work harder the emptier their store; every system has a standby draw.
{
  ok(resupply(0) === RESUPPLY.empty && resupply(1) === RESUPPLY.full && resupply(0) > 1 && resupply(1) < 1, 'resupply eases off as the store fills');
  const made = (from: number) => { const q = quiet(); q.emcon = true; q.ammo = from; run(q, 1); return q.ammo - from; };
  ok(made(0) > 1.8 * made(30), `the reload line works harder with the racks empty (${made(0).toFixed(1)} vs ${made(30).toFixed(1)}/s)`);
  const gen = (from: number) => { const q = quiet(); q.emcon = true; q.st.ammoProd = 0; q.power = from; run(q, 1); return q.power - from; };
  ok(gen(0) > 2 * gen(50), 'the generators work harder with the banks empty');
  const q = quiet(), u0 = upkeep(q);
  ok(u0 === UPKEEP.pac3, 'the Patriot draws standby power');
  q.lv.pulse = 2; q.st = deriveStats(q.lv, []); ok(Math.abs(upkeep(q) - u0 - 2 * UPKEEP.pulse!) < 1e-9, 'weapons draw standby power per level');
  placePad(Object.assign(q, { placing: { k: 'mantis', since: q.t, paid: 0 } }), 0, -17);
  ok(q.perim.length === 1 && Math.abs(upkeep(q) - u0 - 2 * UPKEEP.pulse! - UPKEEP.mantis!) < 1e-9, 'powered units draw standby power');
  q.perim[0].down = true; ok(Math.abs(upkeep(q) - u0 - 2 * UPKEEP.pulse!) < 1e-9, 'a unit that is down draws nothing');
}

// Bosses: every 5th level's raid is led by one, sized and matched to the battery.
{
  ok(!bossLevel(3) && bossLevel(4) && bossLevel(9) && !bossLevel(10), 'a boss every 5th level');
  ok(bossFor(4).kind === 'halo' && bossFor(9).kind === 'backfire' && bossFor(14).kind === 'okhotnik' && bossFor(19).kind === 'mainstay' && bossFor(24).kind === 'halo', 'bosses in order, looping');
  // The L5 raid: briefed with its traits, then one boss arrives with them.
  const g = armed(newGame(3)); g.phase = 'play'; g.spawnAcc = -1e9; g.nextElite = 1e9; g.stage = 4; g.nextRaid = RAID_WARN; // briefed right away
  g.stats.dmg = { MG: 500, 'PAC-3': 100 };
  run(g, 0.5);
  ok(g.raid?.obj === 'boss' && g.raid.boss?.kind === 'halo', 'the L5 raid is led by a boss');
  // The Mi-26 is weak to SAMs, but this battery has none: its weakness falls on the family it has used least.
  ok(g.raid!.boss!.adapt === 'GUNS' && g.raid!.boss!.weak === 'PAC', `countermeasures against the top family, weakness where it can be used (${g.raid!.boss!.adapt}/${g.raid!.boss!.weak})`);
  run(g, RAID_WARN + 1);
  const b = boss(g)!;
  ok(b && g.enemies.filter(e => e.kind === 'halo').length === 1 && b.adapt === 'GUNS' && b.weak === 'PAC' && g.raidObj === 'boss', 'one boss arrives, traits as briefed');
  const hp0 = bossHp(g, 'halo', FRONT); g.lv.dmg = 10; g.st = deriveStats(g.lv, g.skills, g.level);
  ok(bossHp(g, 'halo', FRONT) > 2 * hp0, 'a stronger battery meets a tougher boss');
  ok(bossHp(newGame(4), 'halo', FRONT) >= ENEMIES.halo.hp, 'never below its type\'s HP');
}
{ // It holds just inside your reach: in close on a gun line, at its full standoff for a Patriot.
  const g = newGame(5), e = spawnEnemy(g, 'backfire', FRONT, 60);
  ok(bossStandoff(g, e) < 30 && bossStandoff(g, e) <= bossReach(g, FRONT) - BOSS.inside + 1e-9, `a boss holds inside the guns' reach (${bossStandoff(g, e).toFixed(1)}m)`);
  const h = armed(newGame(5)), f = spawnEnemy(h, 'backfire', FRONT, 60);
  ok(bossStandoff(h, f) === 50, 'and at its standoff when the Patriot reaches it');
}
{ // Its countermeasures and weakness: x BOSS.adapt from one family, x BOSS.weak from another.
  const dealt = (adapt: DmgCat | '', weak: DmgCat | '') => {
    const q = quiet(); const e = spawnEnemy(q, 'halo', 0, 30); e.hp = e.maxHp = 1e9; e.adapt = adapt; e.weak = weak; e.cd = e.hold = 1e9;
    q.ammo = 1e9; run(q, 8); return q.stats.dmg['PAC-3'] ?? 0;
  };
  const none = dealt('', ''), resisted = dealt('PAC', ''), weak = dealt('', 'PAC'), other = dealt('GUNS', 'SAM');
  ok(none > 0 && resisted < none * 0.6 && weak > none * 1.4 && Math.abs(other - none) < none * 0.15, `boss countermeasures and weakness (${resisted.toFixed(0)} / ${none.toFixed(0)} / ${weak.toFixed(0)})`);
}
{ // Objective: shoot it down. It gets away: lost, no tech. Shot down: a SALVAGED TECH drop.
  const q = quiet(), e = spawnEnemy(q, 'halo', 0, ARENA_R + 3.9);
  q.raidId = e.raid = 1; q.raidLeft = 1; q.raidObj = 'boss'; q.bossId = e.id; e.act = 'egress'; e.vx = e.speed; // on its way out
  let left = false; run(q, 1, () => { left ||= q.events.some(v => v.k === 'bossLeft'); });
  ok(left && !q.raidClean && !q.enemies.includes(e) && q.bossId === 0 && !q.drops.length, 'a boss that gets away loses the objective');
  const k = quiet(), f = spawnEnemy(k, 'halo', 0, 20); f.hp = 1; f.cd = f.hold = 1e9;
  run(k, 6);
  ok(k.stats.kills.halo === 1 && k.drops.some(d => d.k === 'tech'), 'a boss shot down leaves tech behind');
}
{ // Mi-26: drops FPV packs · Tu-22M3: Kh-101s at your units and jams its sector · S-70: bay open, exposed, glide bomb.
  const q = quiet(), h = spawnEnemy(q, 'halo', 0, 20); h.hp = 1e9; h.cd = 0.05;
  run(q, 0.2); ok(q.enemies.filter(e => e.kind === 'swarm').length === ENEMIES.swarm.pack && h.orbit, 'the Mi-26 drops an FPV pack');
  const w = quiet(), t = spawnEnemy(w, 'backfire', 0, 45); t.hp = 1e9; t.cd = 0.05;
  run(w, 0.2); ok(w.enemies.filter(e => e.kind === 'cruise').length === 2, 'the Tu-22M3 fires a Kh-101 pair');
  ok(jamFactor(w, { x: Math.cos(0) * 30, z: Math.sin(0) * 30 }) < 1 && jamFactor(w, t) === 1, 'the Tu-22M3 jams its own sector, not itself');
  const o = quiet(), s70 = spawnEnemy(o, 'okhotnik', 0, 20); s70.hp = 1e9; s70.cd = 0.05; s70.seenUntil = -1;
  run(o, 0.2); ok(o.enemies.some(e => e.kind === 'kab') && s70.pop > 0 && visible(o, s70), 'the S-70 opens its bay: a glide bomb, and it shows');
}
{ // A-50U: while it commands, every other raider takes less damage.
  const dealt = (link: boolean) => {
    const q = quiet(), e = spawnEnemy(q, 'tank', 0, 30); e.hp = e.maxHp = 1e9; e.cd = 1e9;
    if (link) { const m = spawnEnemy(q, 'mainstay', Math.PI, 70); m.orbit = true; m.hp = 1e9; m.hold = 1e9; }
    run(q, 1); e.seenUntil = 1e9; markAt(q, e.x, e.z); q.ammo = 1e9; const h0 = e.hp; run(q, 6); return h0 - e.hp; // what the tank took
  };
  const off = dealt(false), on = dealt(true);
  ok(on < off * (BOSS.link + 0.1) && on > off * (BOSS.link - 0.15), `the A-50U datalink (${on.toFixed(0)} vs ${off.toFixed(0)})`);
}
// GROUND ASSAULT: walkers on foot, and only the perimeter can engage them.
{
  const byDist = (q: { x: number; z: number }[]) => q.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)); // the band is a grid: nearest first, like the air war's rings
  const gq = () => { const g = newGame(1, '', 'standard', false, true); Object.assign(g, { phase: 'play', spawnAcc: -1e9, nextRaid: 1e9, level: 5 }); g.perim.length = 0; g.st.maxHp = g.hp = 1e9; return g; };
  const put = (g: State, k: string, x: number, z: number) => { g.credits += 1e6; ok(buy(g, k), `buy ${k} on the ground`); ok(placePad(g, x, z), `place ${k}`); return g.perim[g.perim.length - 1]; };
  // A walker at polar (a, r) around the base, standing still unless `speed`.
  const walker = (g: State, kind: 'walker' | 'gunbot' | 'mech', x: number, z: number, speed = 0) => {
    const e = spawnEnemy(g, kind, Math.atan2(z, x), Math.hypot(x, z)); e.speed = speed; e.vx = e.vz = 0; return e;
  };
  const g0 = newGame(7, '2026-01-01', 'sensor', false, true);
  ok(g0.ground && g0.doctrine === 'standard' && !g0.daily && !g0.st.radar, 'a ground assault flies STANDARD, no daily, no radar');
  ok(lockReason(g0, 'radar') === 'OTHER MODE' && lockReason(g0, 'pac3') === 'OTHER MODE' && lockReason(g0, 'stinger') === 'OTHER MODE', 'the air-defence systems are out of the ground shop');
  ok(lockReason(g0, 'wire') === '' && lockReason(g0, 'gmg') === 'BASE LV 2' && lockReason(newGame(7), 'wire') === 'OTHER MODE', 'the ground weapons are only in the ground shop');
  ok(lockReason(g0, 'gen') === '' && lockReason(g0, 'acap') === '', 'power and magazine don\'t wait for a radar on the ground');
  const c = parseCode(seedCode(g0));
  ok(c?.kind === 'run' && c.ground && c.seed === g0.seed && seedCode(g0).endsWith('-G'), 'a ground assault\'s code round-trips');
  ok(parseCode(seedCode(newGame(7)))?.kind === 'run' && !(parseCode(seedCode(newGame(7))) as { ground: boolean }).ground, 'a normal code is not a ground one');

  // Its own levels: only walkers come, no strike packages, no Su-34s, no jammers.
  {
    const g = newGame(3, '', 'standard', false, true); g.phase = 'play'; g.st.maxHp = g.hp = 1e9;
    const seen = new Set<string>();
    run(g, 600, () => { for (const e of g.enemies) seen.add(e.kind); });
    ok(g.stage >= 3 && [...seen].every(k => ENEMIES[k as keyof typeof ENEMIES].ground), `only walkers on the ground (${[...seen].join(',')}, L${g.stage + 1})`);
    ok(stageInfo(20, true).w.walker! > 0 && !stageInfo(20, true).w.ew && stageInfo(20, true).pk === 0, 'the ground loop adds no jammers or packages');
  }
  // Battery weapons can't touch a walker, and fire control doesn't lock one: the perimeter can.
  {
    const g = gq(); g.lv.radar = g.lv.pac3 = g.lv.pulse = g.lv.rail = 1; g.st = deriveStats(g.lv, [], 5); g.st.maxHp = g.hp = 1e9;
    const q = byDist(freeSpots(g)).find(q => !site(q.x, q.z) && Math.hypot(q.x, q.z) < 13)!;
    const e = walker(g, 'walker', q.x * 0.45, q.z * 0.45), hp = e.hp; // right by the battery, in reach of all of it
    run(g, 3);
    ok(e.hp === hp && !e.locked && g.enemies.includes(e), 'PAC-3, HEL and HPM don\'t engage a walker');
    e.x = q.x * 1.4; e.z = q.z * 1.4; // out in front of where the MG goes
    put(g, 'mg', q.x, q.z); run(g, 3);
    ok(!g.enemies.includes(e) && g.stats.kills.walker === 1, 'the perimeter MG kills it');
  }
  // Armour: an MG does half to a heavy walker; a Javelin goes through.
  {
    const dealt = (k: string, kind: 'walker' | 'mech') => {
      const g = gq(), q = byDist(freeSpots(g)).find(q => !site(q.x, q.z) && Math.hypot(q.x, q.z) < 14)!, p = put(g, k, q.x, q.z);
      const e = walker(g, kind, q.x * 1.5, q.z * 1.5); e.hp = e.maxHp = 1e9;
      run(g, 10); ok(p.kills === 0, 'a punching bag');
      return g.stats.dmg[k === 'mg' ? 'MG' : 'JAVELIN'] ?? 0;
    };
    const mg = dealt('mg', 'mech') / dealt('mg', 'walker'), jav = dealt('javelin', 'mech') / dealt('javelin', 'walker');
    ok(Math.abs(mg - (ENEMIES.mech.armour ?? 1)) < 0.1 && Math.abs(jav - 1) < 0.1, `armour: MG x${mg.toFixed(2)}, Javelin x${jav.toFixed(2)}`);
  }
  // Wire: a walker wades through it at a third of its speed.
  {
    const moved = (wire: boolean) => {
      const g = gq(), q = byDist(freeSpots(g)).find(q => Math.hypot(q.x, q.z) > 16)!;
      if (wire) put(g, 'wire', q.x, q.z);
      const e = walker(g, 'walker', q.x * 1.1, q.z * 1.1, 3); e.hp = e.maxHp = 1e9; e.dmg = 0;
      const x0 = e.x, z0 = e.z; run(g, 0.5);
      return Math.hypot(e.x - x0, e.z - z0);
    };
    ok(moved(true) < moved(false) * 0.6, `wire slows walkers (${moved(true).toFixed(2)} vs ${moved(false).toFixed(2)})`);
  }
  // Claymores: a pack stepping into the arc goes up with one charge; mortars can't hit inside their minimum range.
  {
    const g = gq(), q = byDist(freeSpots(g)).find(q => Math.hypot(q.x, q.z) > 15 && !site(q.x, q.z))!, p = put(g, 'mines', q.x, q.z);
    const out = { x: q.x / Math.hypot(q.x, q.z), z: q.z / Math.hypot(q.x, q.z) };
    for (let i = 0; i < 3; i++) walker(g, 'walker', q.x + out.x * 3 + i * 0.3, q.z + out.z * 3);
    run(g, 0.2);
    ok(g.enemies.length === 0 && p.belt < 4 && p.belt >= 2.9, `one Claymore charge takes out the pack (${g.enemies.length} left, ${p.belt.toFixed(2)} charges)`);
    const m = gq(), mq = byDist(freeSpots(m)).find(q => Math.hypot(q.x, q.z) < 13 && !site(q.x, q.z))!, mp = put(m, 'mortar', mq.x, mq.z);
    const close = walker(m, 'walker', mq.x * 1.3, mq.z * 1.3); close.hp = 1e9;
    run(m, 4); ok(m.shots.length === 0 && mp.cd === 0 && close.hp === 1e9, 'mortar holds fire inside its minimum range');
  }
  // Combat walkers stop and shoot a unit in reach; light walkers charge one and blow up on it.
  {
    const g = gq(), q = byDist(freeSpots(g)).find(q => Math.hypot(q.x, q.z) > 16 && !site(q.x, q.z))!, p = put(g, 'wire', q.x, q.z);
    const e = walker(g, 'gunbot', q.x * 1.3, q.z * 1.3, 2); e.hp = e.maxHp = 1e9;
    run(g, 8);
    ok(p.hp < 30 && Math.hypot(e.x - q.x, e.z - q.z) < 9.5 && e.act === 'hover', `a combat walker stops to shoot up a unit (pad hp ${p.hp.toFixed(1)})`);
    const h = gq(), hq = byDist(freeSpots(h)).find(q => Math.hypot(q.x, q.z) > 16 && !site(q.x, q.z))!, hp = put(h, 'wire', hq.x, hq.z);
    walker(h, 'walker', hq.x * 1.25, hq.z * 1.25, 3);
    run(h, 5);
    ok(h.enemies.length === 0 && hp.hp < 30, 'a light walker charges a unit and blows its charge on it');
  }
  // A whole run: the bot's cheapest-gun strategy holds for a while and every perimeter weapon gets kills.
  {
    const g = newGame(2, '', 'standard', false, true); g.phase = 'play';
    run(g, 900, () => {
      if (g.phase === 'tree') { autoSpend(g); closeTree(g); }
      const gun = !g.placing && g.perim.length < perimSlots(g.level) ? GUNS.filter(k => cost(g, k) < Infinity).sort((a, b) => cost(g, a) - cost(g, b))[0] : undefined;
      buy(g, gun ?? UPGRADES.map(u => u.id).sort((a, b) => cost(g, a) - cost(g, b))[0]);
    });
    ok(g.t > 400 && g.stats.kills.mech! > 0, `a ground bot holds (${g.t.toFixed(0)}s, ${g.kills} kills)`);
    ok(!g.stats.dmg['PAC-3'] && !g.stats.dmg.HEL && !g.stats.dmg.HPM, 'nothing but the perimeter dealt damage');
  }
}

// GROUND ASSAULT as a front-line tower defence: one front, a band to build in, upgrades and fittings per unit,
// new weapons and walkers, THE TIDE.
{
  const byDist = (q: { x: number; z: number }[]) => q.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const gq = () => { const g = newGame(1, '', 'standard', false, true); Object.assign(g, { phase: 'play', spawnAcc: -1e9, nextRaid: 1e9, level: 5 }); g.perim.length = 0; g.st.maxHp = g.hp = 1e9; g.ammo = g.st.ammoCap = 1e9; g.power = g.st.powerCap = 1e9; return g; };
  const put = (g: State, k: string, x: number, z: number) => { g.credits += 1e6; ok(buy(g, k), `buy ${k}`); ok(placePad(g, x, z), `place ${k}`); const p = g.perim[g.perim.length - 1]; g.selected = p.slot; return p; };
  const open = (g: State, d: number) => byDist(freeSpots(g)).find(q => Math.hypot(q.x, q.z) > d && !site(q.x, q.z) && Math.abs(q.x) < 8)!;
  const bot = (g: State, kind: Parameters<typeof spawnAt>[1], x: number, z: number, speed = 0) => { const e = spawnAt(g, kind, x, z); e.speed = speed; e.vx = e.vz = 0; return e; };

  // Everything comes from the north, along the front line.
  {
    const g = newGame(3, '', 'standard', false, true); g.phase = 'play'; g.st.maxHp = g.hp = 1e9;
    const seen = new Set<number>(); let bad = 0, n = 0;
    run(g, 700, () => { for (const e of g.enemies) if (!seen.has(e.id)) { seen.add(e.id); n++; if (e.z > FRONT_LINE.z + 1 || Math.abs(e.x) > FRONT_LINE.w + 12) bad++; } });
    ok(n > 300 && bad === 0 && g.stage >= 4, `walkers only come in from the north (${n} seen, ${bad} elsewhere, L${g.stage + 1})`);
  }
  // You build in a band in front of the base, not round it; the line holds more units than the air war's ring.
  {
    const g = gq(), Z = groundZone(5);
    ok(inZone(g, 30, -20) && !inZone(g, 0, Z.back + 2) && !inZone(g, 0, -Z.d - 2) && !inZone(g, Z.w + 2, -10), 'the build zone is a band in front of the base');
    ok(freeSpots(g).every(q => inZone(g, q.x, q.z) && q.z <= Z.back) && buildBlock(g, 0, 14) === 'OUTSIDE BUILD ZONE', 'nothing goes up behind the base');
    ok(unitCap(g) === perimSlots(5) + GROUND_EXTRA && unitCap(newGame(1)) === perimSlots(1), 'the ground line holds more units');
  }
  // THE TIDE: every fifth level a thousand mini-walkers come on as a wall across the front.
  {
    ok(tideFor(4).g.crawler === 1000 && !tideFor(4).g.titan && tideFor(9).g.crawler! > 1000 && tideFor(9).g.titan === 1, 'THE TIDE: a thousand, more each time, siege walkers from the second');
    const g = newGame(9, '', 'standard', false, true, true); g.phase = 'play'; g.st.maxHp = g.hp = 1e9;
    ok(g.horde && g.level === HORDE_TEST.level && g.credits === HORDE_TEST.credits && building(g), 'a horde test starts at base level 5 with credits and a build window');
    const c = parseCode(seedCode(g));
    ok(seedCode(g).endsWith('-H') && c?.kind === 'run' && c.ground && c.horde === true, 'a horde test\'s code round-trips');
    let briefed = 0;
    run(g, 140, () => { if (g.raid && !briefed) briefed = g.raid.n.crawler ?? -1; });
    const crawlers = g.enemies.filter(e => e.kind === 'crawler' && e.raid).length;
    ok(phase(g).name === 'THE TIDE' && briefed === 1000 && g.raidName === 'THE TIDE' && g.raidLeft >= 900 && crawlers >= 900, `THE TIDE arrives (${briefed} briefed, ${crawlers} on the field, ${g.raidLeft} left)`);
  }
  // Upgrades in the pit: MK II / III for every gun in a ground assault (the MG keeps its own line; nothing new in the air war).
  {
    const g = gq(), q = open(g, 14), p = put(g, 'gmg', q.x, q.z), d0 = padStats(g, p).dmg, c = padUpgradeCost(p, true);
    ok(c < Infinity && padUpgradeCost(p, false) === Infinity, 'tiers are a ground assault\'s');
    ok(upgradePad(g) && p.tier === 1 && Math.abs(padStats(g, p).dmg / d0 - UNIT_TIERS[1].dmg) < 1e-9 && padUpgradeCost(p, true) > c, 'MK II hits harder, MK III costs more');
  }
  // Fittings: one per slot, replaced not stacked, only for the kinds they suit, and they do what they say.
  {
    const g = gq(), q = open(g, 14), p = put(g, 'mg', q.x, q.z);
    ok(modCost(g, p, 'optics') === Infinity && !buyMod(g, 'optics'), 'a laser\'s optics don\'t fit an MG');
    const e0 = padEyes(p), f0 = fanOf(p);
    ok(buyMod(g, 'flir') && padEyes(p) === e0 + 12 && buyMod(g, 'gsr') && p.mods!.SENSOR === 'gsr' && padEyes(p) === 36, 'a thermal sight adds eyes; a ground radar replaces it in the slot');
    ok(buyMod(g, 'rwsm') && fanOf(p) === Math.PI && f0 < Math.PI, 'a stabilised mount fires all round');
    ok(buyMod(g, 'plates') && padHp(p) === PAD_HP * 2 && p.hp === PAD_HP * 2, 'an armour kit doubles the unit\'s HP');
    ok(modCost(newGame(1), { ...p, mods: {} }, 'flir') === Infinity, 'no fittings in the air war');
    // AP rounds: most of the way through a heavy walker's armour.
    const dealt = (ap: boolean) => {
      const h = gq(), hq = open(h, 14), hp = put(h, 'mg', hq.x, hq.z);
      if (ap) buyMod(h, 'ap');
      const e = bot(h, 'mech', hq.x * 1.4, hq.z * 1.4); e.hp = e.maxHp = 1e9;
      run(h, 6); return h.stats.dmg.MG ?? 0;
    };
    ok(dealt(true) > dealt(false) * 1.4, `AP rounds through armour (${dealt(true).toFixed(0)} vs ${dealt(false).toFixed(0)})`);
  }
  // Incendiary: a hit keeps burning after the shot.
  {
    const g = gq(), q = open(g, 14), p = put(g, 'mg', q.x, q.z); buyMod(g, 'inc');
    const e = bot(g, 'gunbot', q.x * 1.4, q.z * 1.4); e.hp = e.maxHp = 1e9;
    run(g, 1); g.perim.length = 0; const h0 = e.hp; run(g, 1.5);
    ok(e.burnT > 0 && e.hp < h0 && (g.stats.dmg.INCENDIARY ?? 0) > 0 && p.kills === 0, 'incendiary rounds keep burning');
  }
  // The laser burns a walker down with power, no ammunition; the HPM fries every robot in its cone, through armour, and stuns.
  {
    const laser = (power: boolean) => {
      const g = gq(), q = open(g, 14), p = put(g, 'hel', q.x, q.z), a0 = g.ammo;
      if (!power) { g.power = 0; g.st.gen = 0; }
      const e = bot(g, 'walker', q.x * 1.5, q.z * 1.5);
      run(g, 3);
      return !g.enemies.includes(e) && p.kills === 1 && g.ammo === a0;
    };
    ok(laser(true) && !laser(false), 'the laser burns a walker down on power alone, and not without it');
    const h = gq(), hq = open(h, 14), hp = put(h, 'hpm', hq.x, hq.z), u = { x: hq.x / Math.hypot(hq.x, hq.z), z: hq.z / Math.hypot(hq.x, hq.z) };
    const pack = [-1, 0, 1].map(i => bot(h, i ? 'gunbot' : 'mech', hq.x + u.x * 6 - u.z * i * 1.5, hq.z + u.z * 6 + u.x * i * 1.5));
    for (const e of pack) e.hp = e.maxHp = 1e9;
    run(h, 0.1);
    ok(pack.every(e => e.hp < 1e9 && e.stun > 0) && pack[1].maxHp - pack[1].hp === pack[0].maxHp - pack[0].hp && hp.cd > 0, 'one HPM pulse hits the whole pack, armour or not, and stuns it');
    const st = pack[0], x0 = st.x; st.speed = 3; run(h, 0.2);
    ok(st.x === x0, 'a stunned walker stands still');
  }
  // The rocket pod: a salvo of 8 onto the thickest pack, and it tears it up.
  {
    const g = gq(), q = open(g, 12); put(g, 'rockets', q.x, q.z); put(g, 'observer', q.x + 4, q.z);
    const u = { x: q.x / Math.hypot(q.x, q.z), z: q.z / Math.hypot(q.x, q.z) };
    bot(g, 'walker', q.x + u.x * 30 + 8, q.z + u.z * 30); // a lone one, nearer the edge
    for (let i = 0; i < 12; i++) bot(g, 'walker', q.x + u.x * 25 + (i % 4) * 0.8, q.z + u.z * 25 + Math.floor(i / 4) * 0.8);
    run(g, 0.1);
    ok(g.shots.filter(s => s.kind === 'lob').length === GROUND_FIRE.rockets.salvo, 'a salvo of rockets');
    run(g, 2);
    ok(g.stats.kills.walker! >= 8, `the salvo tears up the pack (${g.stats.kills.walker} kills)`);
  }
  // Walkers: breachers cut wire, mortar walkers shell from out of reach, robot dogs fire on the run, siege walkers crush.
  {
    const g = gq(), q = open(g, 16), w = put(g, 'wire', q.x, q.z);
    const e = bot(g, 'sapper', q.x * 1.4, q.z * 1.4, 2); e.hp = e.maxHp = 1e9;
    run(g, 8);
    ok(w.down && g.enemies.includes(e), 'a breacher cuts the wire and walks on');
    const h = gq(), hq = open(h, 12), hp = put(h, 'wire', hq.x, hq.z), u = { x: hq.x / Math.hypot(hq.x, hq.z), z: hq.z / Math.hypot(hq.x, hq.z) };
    const a = bot(h, 'arty', hq.x + u.x * 28, hq.z + u.z * 28, 1.5); a.hp = a.maxHp = 1e9;
    run(h, 12);
    const d = Math.hypot(a.x - hq.x, a.z - hq.z);
    ok(hp.hp < PAD_HP && d > GROUND.arty.stand - 1.5 && d < GROUND.arty.stand + 0.5, `a mortar walker stops ${d.toFixed(1)}m out and shells the unit`);
    const k = gq(), kq = open(k, 14), kp = put(k, 'wire', kq.x, kq.z);
    const dog = bot(k, 'dog', kq.x * 1.35, kq.z * 1.35, 3); dog.hp = dog.maxHp = 1e9;
    const d0 = Math.hypot(dog.x, dog.z); run(k, 1.5);
    ok(kp.hp < PAD_HP && Math.hypot(dog.x, dog.z) < d0 - 1, 'a robot dog fires on the run');
    const t = gq(), tq = open(t, 14), tp = put(t, 'gmg', tq.x, tq.z);
    const ti = bot(t, 'titan', tq.x * 1.3, tq.z * 1.3, 2); ti.hp = ti.maxHp = 1e9; ti.cd = 1e9;
    run(t, 6);
    ok(tp.down && ENEMIES.titan.armour! < ENEMIES.mech.armour!, 'a siege walker crushes the unit it walks over');
  }
}

console.log(`ok · idle ${idle.t.toFixed(0)}s/${idle.kills} kills · bot ${b.t.toFixed(0)}s/${b.kills} kills lv${b.level} [${b.skills.join(',')}]`);
