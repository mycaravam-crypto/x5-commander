// `npm test` — headless run of the sim. Throws on the first broken rule.
import { newGame, update, buy, cost, lockReason, pickPerk, markAt, visible, spawnEnemy, toggleEmcon, cycleRadarMode, aimFocus, radarRange, slots, cycleDiscipline, emergencyIntercept, interceptBlock, emitting, jamFactor, phase, flankArc, building, interceptBlock as iBlock, bestSpot, buildBlock, freeSpots, beltOf, toggleRelocate, coverage, padStats, selectPad, upgradePad, sellPad, movePad, draft, placePad, rand, dailySeed, type State } from './sim.ts';
import { baseLevel, difficulty, UPGRADES, PERKS, PACKAGES, EW_ARC, deriveStats, EW_ORBIT, MODS, LEVELS, LEVEL_LEN, BUILD_MIN, PAD_GAP, buildR, perimSlots, MG_TIERS, CROSSFIRE, OBSERVER_EYES, AMMO_RATE, PAD_HP, MOVE_TIME, VISUAL_R, PAD_EYES, MG_BELT, RADAR_REQ, BUILD_TIME, BUILD_LOST, RAID_WARN, ENEMIES, FRONT, FRONT_ARC, HELO, LANCET } from './config.ts';

// Deterministic: Math.random is seeded too, so a failure replays exactly.
const rng = { seed: 12345 };
Math.random = () => rand(rng);

const ok = (c: unknown, msg: string) => { if (!c) throw new Error('FAIL: ' + msg); };
const run = (s: State, secs: number, each?: () => void) => {
  for (let i = 0; i < secs * 60; i++) { update(s, 1 / 60); each?.(); s.events.length = 0; }
};

// A battery that has bought its radar and Patriot, for the checks on what those do.
const armed = (g: State) => { g.lv.radar = g.lv.pac3 = 1; g.st = deriveStats(g.lv, g.perks, g.level); return g; };
// One thing at a time: no random spawns, strike packages or raids. Armed, and without the starting MG.
const quiet = () => { const g = armed(newGame()); g.phase = 'play'; g.spawnAcc = -1e9; g.nextElite = 1e9; g.nextRaid = 1e9; g.perim.length = 0; return g; };

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
  ok(d(30) > d(10) && d(60) - d(30) < d(30) - d(0), 'difficulty is sub-linear'); }

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
ok(s.enemies.every(e => !e.locked || Math.hypot(e.x, e.z) < 19), 'radar sees nothing: locks only on what the eyes see');

// Upgrading bot survives longer than idle, triggers perk drafts, grows base
const bot = () => {
  const g = newGame(); g.phase = 'play';
  run(g, 1200, () => {
    if (g.phase === 'perk') pickPerk(g, 0);
    // The milestones first: once one opens up, save for it.
    const goal = ['radar', 'pac3'].find(id => cost(g, id) < Infinity);
    buy(g, goal ?? UPGRADES.map(u => u.id).sort((a, b) => cost(g, a) - cost(g, b))[0]);
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
    const e = spawnEnemy(g, 'tank', 0, 20); e.hp = 1e9; e.speed = 0; let v = false, l = false; // past eyesight, inside the TRML's reach
    run(g, 30, () => { v ||= visible(g, e); l ||= e.locked; }); return v && !l; }; // 30s: ~12 looks, so a miss is ~0.02% (10s was ~6%)
  ok(seen(4) && !seen(3), 'lv4: TRML-4D searches while the radar is down, without locks');
  const g = quiet(); g.level = 3; g.st = deriveStats(g.lv, [], 3); g.nextRaid = 20; run(g, 20 - RAID_WARN - 4.5);
  ok(g.raid, 'lv3: raids announced earlier');
  const b = newGame(); b.phase = 'play'; b.credits = 1e6; for (let i = 0; i < 3; i++) buy(b, 'hp');
  ok(b.level === 2 && b.st.gen === deriveStats(b.lv, [], 2).gen, 'level-up refreshes stats');
}

// Perimeter: gated by base level and open slots; a pad kills things on its own. The starting MG takes one of lv1's 2.
s = newGame(); s.phase = 'play'; s.credits = 1e6;
ok(!buy(s, 'mantis'), 'mantis locked at lv1');
ok(buy(s, 'mg') && !placePad(s, 0, 0) && s.placing, 'no building inside the base compound');
{ const q = slotXZ(1); ok(placePad(s, q.x, q.z) && near(s.perim[1], q) && !buy(s, 'mg'), 'lv1 = 2 units, the starting MG and one more'); }
s.level = 2;
ok(buy(s, 'mantis') && !buy(s, 'mantis'), 'one pad placed at a time');
{ const f = slotXZ(3);
  ok(!placePad(s, 0, -buildR(2) - 8), 'nothing outside the build zone');
  ok(placePad(s, f.x + 0.2, f.z) && near(s.perim[2], f), 'a unit goes where you click');
  ok(buy(s, 'mantis') && placePad(s, f.x, f.z) && Math.hypot(s.perim[3].x - f.x, s.perim[3].z - f.z) >= PAD_GAP - 1e-9, 'a taken spot: the nearest open one'); }
ok(!!buildBlock(s, -22, 21) && !!buildBlock(s, 17, -6), 'no building on water or rock');
{ const q = slotXZ(4); ok(buy(s, 'mg') && placePad(s, q.x, q.z) && !buy(s, 'mantis') && lockReason(s, 'mantis') === 'PADS FULL', 'lv2 = 5 units'); }
ok(s.perim.every(p => Math.hypot(p.x, p.z) >= BUILD_MIN && Math.hypot(p.x, p.z) <= buildR(2)), 'units stay inside the build zone');
ok(perimSlots(1) === 2 && perimSlots(9) === 16 && buildR(1) < buildR(3), 'the unit cap and the build zone grow with the base level');
{ const g = quiet(); g.credits = 1e6; g.level = 2; buy(g, 'mantis'); run(g, 9); ok(g.perim.length === 1 && !g.placing, 'unplaced pad places itself'); }
s.st.slots = 0; // no main-battery locks: only the pads can shoot
run(s, 40);
ok(s.kills > 0, `pads engage without locks (kills=${s.kills})`);

// Slots and fields of fire. addPad: buy a unit and put it on a given slot.
const addPad = (g: State, k: string, slot: number) => { g.credits += 1e6; ok(buy(g, k), `buy ${k}`); const q = slotXZ(slot); ok(placePad(g, q.x, q.z) && g.perim.some(p => near(p, q)), `place ${k} on ${slot}`); return g.perim.find(p => near(p, q))!; };
{
  // A gun shoots inside its field of fire only: not at what's behind it.
  const g = quiet(); g.level = 9; g.st.slots = 0;
  const mg = addPad(g, 'mg', 0), behind = spawnEnemy(g, 'tank', FRONT, 8), ahead = spawnEnemy(g, 'tank', FRONT, 26);
  for (const e of [behind, ahead]) { e.speed = e.vx = e.vz = 0; e.hp = 1e9; }
  const hits = { b: 0, a: 0 };
  run(g, 3, () => { for (const sh of g.shots) if (sh.src === 'MG') { if (sh.target === behind.id) hits.b++; if (sh.target === ahead.id) hits.a++; } });
  ok(Math.hypot(behind.x - mg.x, behind.z - mg.z) < 15 && hits.b === 0 && hits.a > 0, `MG fires ahead, not behind (${hits.a}/${hits.b})`);
  // Crossfire: the inner MG covers the same contact, so both hit harder.
  addPad(g, 'mg', 1); g.shots.length = 0;
  let dmg = 0;
  run(g, 0.5, () => { for (const sh of g.shots) if (sh.src === 'MG' && sh.target === ahead.id) dmg = Math.max(dmg, sh.dmg); });
  ok(Math.abs(dmg - MG_TIERS[0].dmg * g.st.padDmg * (1 + CROSSFIRE)) < 1e-9, `crossfire: +${CROSSFIRE * 100}% inside two fields of fire`);
  // The coverage map [O] agrees: crossfire ahead, a gap behind both guns, and a gun that's down covers nothing.
  const at = (r: number) => coverage(g)(Math.cos(FRONT) * r, Math.sin(FRONT) * r);
  ok(at(26) === 2 && at(8) === 0, `coverage: 2 guns ahead, none behind (${at(26)}/${at(8)})`);
  g.perim[0].down = true; ok(at(26) === 1, 'coverage skips a unit that is down'); g.perim[0].down = false;
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

// The starting kit: one AA machine gun facing the front, eyes, and no radar or Patriot.
{
  const g = newGame(); g.phase = 'play'; g.spawnAcc = -1e9; g.nextRaid = g.nextElite = 1e9;
  const mg = g.perim[0], off = Math.abs(Math.atan2(mg.z, mg.x) - FRONT);
  ok(g.perim.length === 1 && mg.k === 'mg' && off < 0.5 && !g.st.radar && !g.st.weapons.cannon && !emitting(g), 'start: one MG on the front, no radar, no Patriot');
  // Eyes: the base sees VISUAL_R all round, an emplacement sees PAD_EYES round itself; beyond that, nothing.
  const near = spawnEnemy(g, 'tank', FRONT + Math.PI, VISUAL_R - 2), far = spawnEnemy(g, 'tank', FRONT + Math.PI, VISUAL_R + 4);
  const fwd = spawnEnemy(g, 'tank', FRONT, Math.hypot(mg.x, mg.z) + PAD_EYES - 2);
  for (const e of [near, far, fwd]) { e.speed = e.vx = e.vz = 0; e.hp = 1e9; }
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
  const g = newGame(); g.phase = 'play'; g.spawnAcc = -1e9; g.nextRaid = g.nextElite = 1e9; g.st.maxHp = g.hp = 1e9;
  const e = spawnEnemy(g, 'drone', FRONT, 40);
  run(g, 15);
  ok(!g.enemies.includes(e) && g.kills === 1 && g.hp === g.st.maxHp, 'the MG alone stops a Shahed from the front');
  const arm = spawnEnemy(g, 'arm', FRONT, 30);
  run(g, 8);
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
  // Enough samples that the average is stable (true ratio ~0.55; 40 samples crossed 0.7 on about 1 seed in 5).
  const avg = (mode: number) => { let t = 0; for (let i = 0; i < 200; i++) t += firstSeen(mode, 0.2, 30); return t / 200; };
  const [foc, act] = [avg(1), avg(0)];
  ok(foc < act * 0.7, `FOCUSED detects faster on its bearing (${foc.toFixed(2)}s vs ${act.toFixed(2)}s)`);
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

// Decoy: locked, classified, released, never locked again, harmless on arrival.
s = quiet(); spawnEnemy(s, 'decoy', 0, 30); s.enemies[0].hp = 1e9;
let ided = false, relocked = false;
run(s, 15, () => { for (const e of s.enemies) { ided ||= e.ided; relocked ||= e.ided && e.locked; } });
ok(ided && !relocked, 'decoy classified and released');
ok(s.enemies.length === 0 && s.hp === s.st.maxHp, 'decoy does no damage');

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
    if (was && building(g) && g.enemies.some(e => e.id >= n && !['arm', 'atgm', 'kab'].includes(e.kind))) quietBuild = false; // what aircraft still up fire is not a new contact
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
  const h = newGame(); h.phase = 'play'; h.spawnAcc = -1e9; h.nextElite = 1e9; h.stage = 3; h.nextRaid = RAID_WARN;
  for (let i = 0; i < 30 && (!h.raid || h.raid.name !== 'SEAD STRIKE'); i++) { h.raid = null; h.nextRaid = h.t + RAID_WARN; run(h, 1 / 60); }
  ok(h.raid?.name === 'SEAD STRIKE' && h.raid.obj === 'battery', 'no radar yet: SEAD STRIKE is PROTECT BATTERY');
}

// Attack packages: turn up in normal waves once their level comes, all from one bearing, escort jamming it.
{
  const g = newGame(3); g.phase = 'play'; g.stage = 4; g.nextRaid = g.nextElite = 1e9; g.st.maxHp = g.hp = 1e9; // stays on the level
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
    for (const e of g.enemies) if (e.id >= seen && !['arm', 'atgm', 'kab'].includes(e.kind)) { // launched where their aircraft are
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
  ok(first('decoy') === 2 && first('ew') === 2 && first('elite') === 3 && first('arm') === 3 && first('tbm') === 4 && first('cruise') === 4, 'level order: EW screen, then SEAD, then coordinated');
  for (const p of PACKAGES) ok(p.from >= 2, `${p.name} waits for the EW screen`);
  const g = newGame(); g.stage = LEVELS.length + 3;
  ok(phase(g).pk! > LEVELS[LEVELS.length - 1].pk!, 'packages get likelier past the scripted levels');
  const h = newGame(2); h.phase = 'play'; h.st.maxHp = h.hp = 1e9; let early = false;
  for (let i = 0; i < 600 * 20 && h.stage < 3; i++) { update(h, 1 / 20); h.events.length = 0; early ||= h.stage < 3 && h.enemies.some(e => e.kind === 'elite' || e.kind === 'arm' || e.kind === 'tbm'); }
  ok(h.stage === 3 && !early, 'no Su-34s, ARMs or Iskanders before the SEAD level');
}

// Conditions: after the scripted levels, MODS loop.
s = newGame(); s.stage = LEVELS.length;
ok(phase(s).name === MODS[0].name, 'first condition');
s.stage += MODS.length;
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

// Debrief counters add up.
{
  const dealt = Object.values(b.stats.dmg).reduce((a, x) => a + x, 0);
  const killed = Object.values(b.stats.kills).reduce((a, x) => a + x, 0);
  ok(killed === b.kills && dealt > 0 && b.stats.dmg['PAC-3'] > 0, `debrief (${killed}/${b.kills})`);
}

console.log(`ok · idle ${idle.t.toFixed(0)}s/${idle.kills} kills · bot ${b.t.toFixed(0)}s/${b.kills} kills lv${b.level} [${b.perks.join(',')}]`);
