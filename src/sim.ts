import {
  LOOP_PRESS, ARENA_R, BASE_R, START_CREDITS, COMBO_WINDOW, COMBO_BONUS, COMBO_CAP, LEVEL_LEN, BUILD_TIME, BUILD_LOST, ELITE_FROM, PK_GROW, PK_MAX,
  ENEMIES, KINDS, WEAPONS, LEVELS, PACKAGES, DISCIPLINES, PRIORITY_DMG, PRIORITY_POWER, LOCK_POWER, REPAIR_POWER, INTERCEPT, DOCTRINES, MODS, RAIDS, RAID_WARN, RAID_BONUS, RAID_SPAWN, raidScale, MODES, UPGRADES, PERKS, PERIM_KINDS, PERIM, GUNS, SLOTS, TERRAIN, slotXZ, FANS, CROSSFIRE, MG_TIERS, OBSERVER_EYES, AMMO_R, AMMO_RATE, AMMO_RELOAD, FWD_RELOAD, PAD_HP, PAD_REPAIR, DIVE_R, SELL_REFUND, MOVE_TIME, SWEEP_CAP, grow, PLACE_TIME, JAM_SLOW, baseLevel, perimSlots, deriveStats, difficulty, BACKUP_RADAR,
  RADAR_MODES, CRUISE_LOW, FRONT, FRONT_ARC, VISUAL_R, PAD_EYES, VISUAL_DARK, MG_BELT, LPI_R, BLACKOUT, COUNTER_SEAD, KILL_CHAIN, OVERKILL_R, LAST_STAND, ARM_STUN, ARM_VEER, ARM_TURN, ARM_LIFE, ARM_EVERY, ARM_LAUNCH_R, DECOY_ID, EW_ORBIT, EW_ARC, EW_JAM,
  type EnemyKind, type PerimKind, type WeaponKind, type Mod, type RaidObjective,
} from './config.ts';

export interface Enemy {
  id: number; kind: EnemyKind; x: number; z: number; vx: number; vz: number;
  hp: number; maxHp: number; speed: number; dmg: number; reward: number; size: number;
  seenUntil: number; locked: boolean; incoming: number; wob: number;
  born: number;
  cd: number; // Su-34: time to next ARM launch
  aim: number; // ARM: heading it flies blind on, NaN while guided
  lockT: number; ided: boolean; // decoy: time held in lock, classified yet
  orbit: boolean; // Mi-8 jammer: on station and jamming
  raid: number; // id of the raid it belongs to, 0 = none
  pkg: number; // id of the attack package or raid group it flies with, 0 = none
  hold: number; // Mi-8 jammer: bearing it holds station on (its own, or its package's)
  tgt: number; // cruise missile: slot of the unit it's going for, -1 = the base
}
export interface Shot {
  kind: 'shell' | 'missile' | 'tracer'; x: number; z: number; vx: number; vz: number;
  dmg: number; splash: number; life: number; target: number; src: string; // src: weapon, for the debrief
}
export type Ev =
  | { k: 'shot' | 'missile' | 'kill' | 'hit' | 'baseHit' | 'detect' | 'arm' | 'tbm' | 'cruise' | 'jam' | 'ident' | 'acquire' | 'lost'; x: number; z: number; kind?: EnemyKind; n?: number }
  | { k: 'beam' | 'rail' | 'gun'; x: number; z: number; x2: number; z2: number }
  | { k: 'raid'; x: number; z: number; name: string }
  | { k: 'package'; x: number; z: number; name: string }
  | { k: 'raidStart'; x: number; z: number; name: string }
  | { k: 'raidClear' | 'raidLeak' | 'raidEnd' | 'build'; n: number }
  | { k: 'stage'; name: string }
  | { k: 'intercept'; x: number; z: number }
  | { k: 'padHit' | 'padDown' | 'padUp' | 'padSold' | 'padMoved' | 'padRoad'; x: number; z: number; n: number; kind: PerimKind }
  | { k: 'level' | 'warning' | 'buy' | 'placing' | 'lock' | 'over' | 'emcon' | 'radarDown' | 'aesa' | 'radarOnline' | 'pac3' | 'discipline' | 'radarMode' | 'killChain' | 'counterSead' | 'lastStand' };

export type Phase = 'start' | 'play' | 'pause' | 'perk' | 'over';
export interface Pad { k: PerimKind; x: number; z: number; a: number; slot: number; cd: number; belt: number; hp: number; tier: number; paid: number; down: boolean }

// mulberry32: tiny seeded PRNG, so a seed replays the same schedule (daily op, tests).
export function rand(r: { seed: number }) {
  let t = (r.seed = (r.seed + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// Same seed for everyone on the same (UTC) day.
export const dailySeed = (date: string) => [...date].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

// The seed drives two separate streams: the spawn schedule and the perk drafts. Everything that depends on
// how you play (detection rolls, launches) uses Math.random, so it can't shift the schedule.
export function newGame(seed = Math.random() * 2 ** 32 | 0, daily = '', doctrine = 'standard') {
  const doc = DOCTRINES.find(d => d.id === doctrine && !daily) ?? DOCTRINES[0];
  const s = {
    phase: 'start' as Phase,
    daily, // date of the daily op, '' for a normal run
    doctrine: doc.id,
    seed,
    world: { seed }, // normal waves; reseeded per level (see nextStage)
    perkRng: { seed: seed ^ 0x9E3779B9 },
    // Scheduled events get streams of their own, so how many normal spawns came before (which raid pacing
    // and recovery lulls change) can't change which raid or strike comes next.
    raidRng: { seed: seed ^ 0x2545F491 },
    strikeRng: { seed: seed ^ 0x68E31DA4 },
    t: 0,
    credits: START_CREDITS,
    earned: 0,
    kills: 0,
    combo: 0,
    lastKill: -99,
    lv: { mg: 1, ...doc.lv } as Record<string, number>, // the starting MG counts toward its own price
    bought: 0,
    level: 1,
    perks: [] as string[],
    perkChoices: [] as string[],
    st: deriveStats(doc.lv, []),
    hp: 0,
    power: 0,
    ammo: 0,
    sweepA: 0,
    sweepSpeed: 0, // effective, after power throttling
    enemies: [] as Enemy[],
    shots: [] as Shot[],
    // Emplacements. a: facing (away from the base); belt: MG rounds left; tier: upgrades in place; paid: credits
    // sunk into it (for a sale); down: knocked out until repaired to half.
    perim: [] as Pad[],
    placing: null as null | { k: PerimKind; since: number; paid: number }, // bought, waiting for a click on the map
    selected: -1, // slot of the emplacement the player picked (upgrade / sell / move), -1 = none
    jamming: false,
    emcon: false,
    radarMode: 0, // index into RADAR_MODES
    dark: false, // radar silent last frame (BLACKOUT PROTOCOL stretches tracks on the way down)
    chainKills: 0, chainUntil: 0, // KILL CHAIN: kills toward the next bonus slot, when the current one ends
    lastStand: false,
    focusA: 0, // bearing FOCUSED dwells on when there's no priority target (last click)
    radarDownUntil: 0,
    cooldown: { cannon: 0, pulse: 0, missile: 0, rail: 0 } as Record<WeaponKind, number>,
    aim: 0, // turret heading, for rendering
    spawnAcc: 0,
    stage: 0, // threat level index (LEVELS); not the base level
    buildUntil: 0, // > 0: level done, build window until then, no spawns
    nextElite: Infinity, // this level's Su-34 strike package
    nextRaid: LEVEL_LEN, // this level's raid arrives (Infinity once announced)
    // Announced, not yet here: composition (in aircraft) and the bonus it pays if the objective holds.
    raid: null as null | { name: string; a: number; at: number; g: Partial<Record<EnemyKind, number>>; obj: RaidObjective; n: Partial<Record<EnemyKind, number>>; bonus: number },
    // The raid in the air: its id, aircraft left, objective still held, reward so far, bearing, objective, name.
    raidId: 0, raidLeft: 0, raidClean: true, raidReward: 0, raidA: 0, raidObj: 'battery' as RaidObjective, raidName: '',
    // debrief counters
    stats: { kills: {} as Partial<Record<EnemyKind, number>>, dmg: {} as Record<string, number>, raids: 0, clean: 0, armsEvaded: 0, radarHits: 0 },
    mode: 0,
    marked: 0,
    discipline: 1, // index into DISCIPLINES, BALANCED
    intercept: { until: 0, target: 0 }, // emergency intercept in progress
    interceptReady: 0, // time the next intercept can be called
    nextId: 1,
    nextPkg: 1,
    events: [] as Ev[],
    shake: 0,
  };
  s.sweepSpeed = s.st.sweep;
  // The starting kit: one AA machine gun on the main line, facing the front.
  putPad(s, 'mg', 0, 0);
  s.hp = s.st.maxHp; s.power = s.st.powerCap; s.ammo = s.st.ammoCap;
  return s;
}
export type State = ReturnType<typeof newGame>;

const TAU = Math.PI * 2;
const AESA_SPIN = 1.2; // rad/s, cosmetic
const pick = <T>(r: { seed: number }, a: T[]) => a[Math.floor(rand(r) * a.length)];
export const visible = (s: State, e: Enemy) => e.locked || e.seenUntil > s.t;
const NO_MOD: Mod = { name: '', desc: '' };
// Scripted levels first, then SEAD's mix under a looping condition, with flank threats from every direction.
export const phase = (s: State) => stageInfo(s.stage);
export function stageInfo(i: number) {
  if (i < LEVELS.length) return { ...LEVELS[i], mod: NO_MOD };
  const last = LEVELS[LEVELS.length - 1], mod = MODS[(i - LEVELS.length) % MODS.length], w = { ...last.w };
  for (const [k, v] of Object.entries(mod.w ?? {}) as [EnemyKind, number][]) w[k] = (w[k] ?? 0) + v;
  const loop = i - LEVELS.length; // packages get likelier every level past the scripted ones
  const press = 1 + LOOP_PRESS * (loop + 1);
  return { name: mod.name, desc: mod.desc, w, mod, pk: Math.min(PK_MAX, (last.pk ?? 0) + PK_GROW * (loop + 1)), arc: Math.PI, rate: press, hp: press };
}
// Half-width around FRONT that flank threats can come from in level i.
export const flankArc = (i: number) => Math.max(FRONT_ARC, stageInfo(i).arc ?? 0);
// Bearing for a group of `kinds` from one uniform draw `r`: the front, unless everything in it can fly round the
// flanks (an escort jammer goes wherever its group does). One draw per bearing keeps the seeded streams in step.
export function spawnBearing(i: number, kinds: EnemyKind[], r: number) {
  const flank = kinds.every(k => k === 'ew' || ENEMIES[k].flank) && kinds.some(k => k !== 'ew');
  return FRONT + (r * 2 - 1) * (flank ? flankArc(i) : FRONT_ARC);
}
export const phaseName = (s: State) => `L${s.stage + 1} ${phase(s).name}`;
export const building = (s: State) => s.buildUntil > 0;
export const emitting = (s: State) => s.st.radar && !s.emcon && s.t >= s.radarDownUntil;
export const radarMode = (s: State) => RADAR_MODES[s.radarMode];
// Lock slots right now: KILL CHAIN adds one for a while after a run of kills.
export const slots = (s: State) => s.st.slots + (s.t < s.chainUntil ? 1 : 0);
export const lastStand = (s: State) => s.st.lastStand && s.hp < s.st.maxHp * LAST_STAND.hp;
// Effective detection range and arc for the current mode. LPI WAVEFORM (perk) takes the LPI penalty away.
export const radarRange = (s: State) => s.st.radarRange * (radarMode(s).lpi && s.st.lpi ? 1 : radarMode(s).range);
export const radarSector = (s: State) => radarMode(s).sector * (s.st.aesa ? 1.5 : 1); // 0 = all round
export function focusBearing(s: State) {
  const m = s.marked ? s.enemies.find(e => e.id === s.marked) : undefined;
  return m ? Math.atan2(m.z, m.x) : s.focusA;
}
// What the operator sees: an unclassified decoy passes for a Shahed.
export const shownKind = (e: Enemy): EnemyKind => e.kind === 'decoy' && !e.ided ? 'drone' : e.kind;
const angDiff = (a: number, b: number) => ((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI;

// Detection multiplier at `e`: every Mi-8 on station blanks a sector around its own bearing (but not itself).
export function jamFactor(s: State, e: { x: number; z: number }) {
  let f = 1;
  const a = Math.atan2(e.z, e.x);
  for (const j of s.enemies) if (j.kind === 'ew' && j.orbit && j !== e && Math.abs(angDiff(a, Math.atan2(j.z, j.x))) < EW_ARC) f *= EW_JAM;
  return f;
}

// ---------- player actions ----------

// Why an upgrade can't be bought right now ('' = it can).
export const lockReason = (s: State, id: string) => {
  const u = UPGRADES.find(u => u.id === id)!;
  if (u.req && s.level < u.req) return `BASE LV ${u.req}`;
  if (u.needs && !s.lv[u.needs]) return `NEEDS ${u.needs === 'pac3' ? 'PATRIOT' : u.needs.toUpperCase()}`;
  if (id === 'sweep' && !s.lv.aesa && (s.lv.sweep ?? 0) >= SWEEP_CAP) return 'NEEDS AESA';
  if (PERIM_KINDS.includes(id as PerimKind)) {
    if (s.placing) return 'PLACING';
    if (s.perim.length >= perimSlots(s.level)) return 'PADS FULL';
  }
  return '';
};

export const cost = (s: State, id: string) => {
  const u = UPGRADES.find(u => u.id === id)!;
  return (s.lv[id] ?? 0) >= u.max || lockReason(s, id) ? Infinity : Math.round(u.base * u.mult ** (s.lv[id] ?? 0));
};

export function buy(s: State, id: string) {
  const c = cost(s, id);
  if (s.credits < c || s.phase !== 'play') return false;
  s.credits -= c;
  s.lv[id] = (s.lv[id] ?? 0) + 1;
  s.bought++;
  if (id === 'aesa') s.events.push({ k: 'aesa' });
  if (id === 'radar') s.events.push({ k: 'radarOnline' });
  if (id === 'pac3') s.events.push({ k: 'pac3' });
  if (PERIM_KINDS.includes(id as PerimKind)) {
    s.placing = { k: id as PerimKind, since: s.t, paid: c };
    s.events.push({ k: 'placing' });
  }
  s.events.push({ k: 'buy' });
  purchased(s);
  return true;
}
// Every purchase counts toward the base level (upgrades in place too).
function purchased(s: State) {
  const lvl = baseLevel(s.bought), up = lvl > s.level;
  if (up) s.level = lvl;
  refreshStats(s); // after the level: base levels carry stats of their own
  if (up) {
    s.perkChoices = draft(s);
    s.phase = 'perk';
    s.events.push({ k: 'level' });
  }
}

// 3 distinct perks the battery qualifies for; once rule perks are in reach, one of them changes the rules (while any are left).
export function draft(s: State) {
  const pool = PERKS.filter(p => (p.min ?? 0) <= s.level && (!p.need || s.lv[p.need]) && !(p.rule && s.perks.includes(p.id)));
  const rules = pool.filter(p => p.rule).map(p => p.id);
  const out = rules.length ? [pick(s.perkRng, rules)] : [];
  const rest = pool.filter(p => !p.rule).map(p => p.id);
  while (out.length < 3) { const p = pick(s.perkRng, rest); if (!out.includes(p)) out.push(p); }
  return out;
}

// ---------- emplacements ----------

export const freeSlots = (s: State) => SLOTS.map((_, i) => i).filter(i => SLOTS[i].lv <= s.level && !s.perim.some(p => p.slot === i));
function putPad(s: State, k: PerimKind, slot: number, paid: number) {
  const { x, z } = slotXZ(slot);
  s.perim.push({ k, x, z, a: Math.atan2(z, x), slot, cd: 0, belt: MG_BELT.rounds, hp: PAD_HP, tier: 0, paid, down: false });
}
const up = (p: Pad) => !p.down;
export const terrain = (p: { slot: number }) => SLOTS[p.slot].terrain;
const terrainRange = (slot: number) => { const t = SLOTS[slot].terrain; return t === 'ridge' ? TERRAIN.ridge.range : t === 'woods' ? TERRAIN.woods.range : 1; };
// Inside the unit's range and field of fire.
export const covers = (p: { x: number; z: number; a: number; k: PerimKind }, x: number, z: number, range: number) =>
  (x - p.x) ** 2 + (z - p.z) ** 2 <= range * range && Math.abs(angDiff(Math.atan2(z - p.z, x - p.x), p.a)) <= FANS[p.k];
const nearAmmo = (s: State, p: Pad) => s.perim.some(q => q.k === 'ammo' && up(q) && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 <= AMMO_R ** 2);
// What a unit fires with right now: its tier, the battery's weapon upgrades and perks, an ammo point in reach.
export function padStats(s: State, p: Pad) {
  const w = p.k === 'mg' ? MG_TIERS[p.tier] : PERIM[p.k];
  return { ...w, range: w.range * terrainRange(p.slot), dmg: w.dmg * s.st.padDmg, rate: w.rate * s.st.padRate * (nearAmmo(s, p) ? AMMO_RATE : 1) };
}
// A cruise missile goes for the unit you've sunk the most into (the nearest of equals; one on the ridge stands out,
// one in the woods it can't find), or the base if there's none.
export function cruiseTarget(s: State, e: { x: number; z: number }) {
  let best: Pad | undefined, bv = -Infinity;
  for (const p of s.perim) {
    if (p.down || terrain(p) === 'woods') continue;
    const v = (p.paid + (terrain(p) === 'ridge' ? TERRAIN.ridge.value : 0)) * 1000 - Math.hypot(p.x - e.x, p.z - e.z);
    if (v > bv) { bv = v; best = p; }
  }
  return best;
}
function hitPad(s: State, p: Pad, dmg: number) {
  p.hp -= dmg;
  s.events.push({ k: 'padHit', x: p.x, z: p.z, n: dmg, kind: p.k });
  if (p.hp <= 0) { p.hp = 0; p.down = true; s.events.push({ k: 'padDown', x: p.x, z: p.z, n: 0, kind: p.k }); }
}
export const padName = (p: Pad) => p.k === 'mg' ? MG_TIERS[p.tier].name : UPGRADES.find(u => u.id === p.k)!.name;
export const padUpgradeCost = (p: Pad) => p.k === 'mg' && p.tier + 1 < MG_TIERS.length ? MG_TIERS[p.tier + 1].cost : Infinity;
export const sellValue = (s: State, p: Pad) => Math.round(p.paid * (building(s) ? 1 : SELL_REFUND));

// How much a unit of `k` on `slot` would add: the bearings of the threat arc it covers that nothing covers yet
// (crossfire where something does), or for support units, the guns it would serve. Auto-place and the bots use it.
export function slotScore(s: State, k: PerimKind, slot: number) {
  const { x, z } = slotXZ(slot), p = { k, x, z, a: Math.atan2(z, x) };
  const guns = s.perim.filter(q => GUNS.includes(q.k) && up(q));
  if (k === 'ammo') return guns.filter(q => (q.x - x) ** 2 + (q.z - z) ** 2 <= AMMO_R ** 2).length + 0.01 * Math.hypot(x, z);
  if (k === 'observer') return guns.filter(q => (q.x - x) ** 2 + (q.z - z) ** 2 <= OBSERVER_EYES ** 2).length + 0.05 * Math.hypot(x, z);
  // Bearings across the threat arc: one it covers that nothing covers yet is worth 1, crossfire on a covered one 0.3.
  const range = (k === 'mg' ? MG_TIERS[0].range : PERIM[k].range) * terrainRange(slot), arc = Math.min(Math.PI, Math.max(FRONT_ARC, flankArc(s.stage)) + 0.2);
  const gr = guns.map(q => padStats(s, q).range);
  let score = 0;
  for (let i = 0; i <= 24; i++) {
    const a = FRONT + (i / 12 - 1) * arc, c = Math.cos(a), sn = Math.sin(a);
    let mine = 0, theirs = false;
    for (const r of [14, 22, 30]) {
      if (covers(p, c * r, sn * r, range)) mine++;
      theirs ||= guns.some((q, qi) => covers(q, c * r, sn * r, gr[qi]));
    }
    if (mine) score += (theirs ? 0.3 : 1) + 0.02 * mine;
  }
  return score;
}
export const bestSlot = (s: State, k: PerimKind) =>
  freeSlots(s).reduce<number | undefined>((b, i) => b === undefined || slotScore(s, k, i) > slotScore(s, k, b) ? i : b, undefined);

// Put the pending pad on the free slot nearest the click.
export function placePad(s: State, x: number, z: number) {
  if (!s.placing) return false;
  const slot = nearestFree(s, x, z, Infinity);
  if (slot === undefined) return false;
  putPad(s, s.placing.k, slot, s.placing.paid);
  if (SLOTS[slot].terrain === 'road') { // on the supply road: it costs half
    const p = s.perim[s.perim.length - 1], n = Math.round(p.paid * TERRAIN.road.refund);
    p.paid -= n; s.credits += n;
    s.events.push({ k: 'padRoad', x: p.x, z: p.z, n, kind: p.k });
  }
  s.placing = null;
  s.events.push({ k: 'buy' });
  return true;
}
function nearestFree(s: State, x: number, z: number, within: number) {
  let best: number | undefined, bd = within * within;
  for (const i of freeSlots(s)) { const q = slotXZ(i), d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
export const selectedPad = (s: State) => s.perim.find(p => p.slot === s.selected);
// Click on one of your units: pick it (to upgrade, sell or move).
export function selectPad(s: State, x: number, z: number) {
  const p = s.perim.find(p => (p.x - x) ** 2 + (p.z - z) ** 2 < 2.5 * 2.5);
  s.selected = p ? p.slot : -1;
  return !!p;
}
// With a unit picked, click a free slot to move it there: free in the build window, 5 s offline otherwise.
export function movePad(s: State, x: number, z: number) {
  const p = selectedPad(s), slot = p && nearestFree(s, x, z, 4);
  if (!p || slot === undefined) return false;
  const q = slotXZ(slot);
  Object.assign(p, { x: q.x, z: q.z, a: Math.atan2(q.z, q.x), slot, cd: building(s) ? 0 : MOVE_TIME });
  s.selected = slot;
  s.events.push({ k: 'padMoved', x: p.x, z: p.z, n: building(s) ? 0 : MOVE_TIME, kind: p.k });
  return true;
}
// Done building: start the next level now.
export function skipBuild(s: State) { if (building(s) && s.phase === 'play') s.buildUntil = s.t; }
export function upgradePad(s: State) {
  const p = selectedPad(s), c = p ? padUpgradeCost(p) : Infinity;
  if (!p || s.credits < c || s.phase !== 'play') return false;
  s.credits -= c; p.paid += c; p.tier++; s.bought++;
  s.events.push({ k: 'padUp', x: p.x, z: p.z, n: p.tier, kind: p.k });
  purchased(s);
  return true;
}
export function sellPad(s: State) {
  const p = selectedPad(s);
  if (!p || s.phase !== 'play') return false;
  const n = sellValue(s, p);
  s.credits += n;
  s.perim.splice(s.perim.indexOf(p), 1);
  s.selected = -1;
  s.events.push({ k: 'padSold', x: p.x, z: p.z, n, kind: p.k });
  return true;
}

export function pickPerk(s: State, i: number) {
  if (s.phase !== 'perk' || !s.perkChoices[i]) return;
  s.perks.push(s.perkChoices[i]);
  s.perkChoices = [];
  refreshStats(s);
  s.phase = 'play';
}

function refreshStats(s: State) {
  const oldMax = s.st.maxHp;
  s.st = deriveStats(s.lv, s.perks, s.level);
  // Keep HP ratio when max changes, but hull upgrades also heal the added amount.
  s.hp = Math.min(s.st.maxHp, s.hp + Math.max(0, s.st.maxHp - oldMax));
  s.power = Math.min(s.power, s.st.powerCap);
  s.ammo = Math.min(s.ammo, s.st.ammoCap);
}

export function markAt(s: State, x: number, z: number) {
  if (!s.st.radar) return; // a priority target is a fire control job
  let best: Enemy | null = null, bd = 25; // within 5 units
  for (const e of s.enemies) {
    if (!visible(s, e)) continue;
    const d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  s.marked = best ? best.id : 0;
  if (best) s.events.push({ k: 'lock' });
}

export const cycleMode = (s: State) => { s.mode = (s.mode + 1) % s.st.modes; };

export function cycleDiscipline(s: State) {
  if (s.phase !== 'play') return;
  s.discipline = (s.discipline + 1) % DISCIPLINES.length;
  s.events.push({ k: 'discipline' });
}

// The contact an emergency intercept would go after: the priority target, else the visible threat nearest impact.
export function interceptTarget(s: State) {
  const m = s.marked ? s.enemies.find(e => e.id === s.marked && visible(s, e)) : undefined;
  if (m) return m;
  let best: Enemy | undefined, bt = Infinity;
  for (const e of s.enemies) {
    if (!visible(s, e) || e.ided) continue;
    const t = Math.hypot(e.x, e.z) / e.speed;
    if (t < bt) { bt = t; best = e; }
  }
  return best;
}
export const interceptActive = (s: State) => s.t < s.intercept.until;
// '' = ready, else why not.
export function interceptBlock(s: State) {
  if (interceptActive(s)) return 'ACTIVE';
  if (s.t < s.interceptReady) return `${Math.ceil(s.interceptReady - s.t)}s`;
  if (!emitting(s)) return 'NO RADAR';
  if (s.power < INTERCEPT.power) return 'LOW PWR';
  return '';
}

export function emergencyIntercept(s: State) {
  if (s.phase !== 'play' || interceptBlock(s)) return false;
  const e = interceptTarget(s);
  if (!e) return false;
  s.power -= INTERCEPT.power;
  s.interceptReady = s.t + INTERCEPT.cooldown;
  s.intercept = { until: s.t + INTERCEPT.time, target: e.id };
  s.marked = e.id; // becomes the priority target, so fire control locks it now
  s.events.push({ k: 'intercept', x: e.x, z: e.z });
  return true;
}

export function cycleRadarMode(s: State) {
  if (s.phase !== 'play' || !s.st.radar) return;
  s.radarMode = (s.radarMode + 1) % RADAR_MODES.length;
  s.events.push({ k: 'radarMode' });
}
// A click anywhere aims FOCUSED at that bearing.
export const aimFocus = (s: State, x: number, z: number) => { s.focusA = Math.atan2(z, x); };

export function toggleEmcon(s: State) {
  if (s.phase !== 'play' || !s.st.radar) return;
  s.emcon = !s.emcon;
  s.events.push({ k: 'emcon' });
}

// ---------- simulation ----------

export function update(s: State, dt: number) {
  if (s.phase !== 'play') return;
  s.t += dt;
  s.shake = Math.max(0, s.shake - dt * 3);
  spawn(s, dt);
  moveEnemies(s, dt);
  spot(s);
  powerAndAmmo(s, dt);
  radar(s, dt);
  track(s, dt);
  fire(s, dt);
  perimeter(s, dt);
  if (s.placing && s.t - s.placing.since > PLACE_TIME) {
    // Nobody picked a spot: the slot where it adds the most.
    const slot = bestSlot(s, s.placing.k);
    if (slot !== undefined) { const q = slotXZ(slot); placePad(s, q.x, q.z); }
  }
  moveShots(s, dt);
  const ls = lastStand(s);
  if (ls !== s.lastStand) { s.lastStand = ls; if (ls) s.events.push({ k: 'lastStand' }); }
  if (s.hp <= 0) { s.hp = 0; s.phase = 'over'; s.events.push({ k: 'over' }); }
}

export function spawnEnemy(s: State, kind: EnemyKind, a: number, r = ARENA_R + 2, rnd = Math.random) {
  const T = ENEMIES[kind], d = difficulty(s.t);
  const L = phase(s), hp = T.hp * d.hp * (L.mod.hp ?? 1) * ('hp' in L ? L.hp ?? 1 : 1), speed = T.speed * d.speed * (0.9 + rnd() * 0.2);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  s.enemies.push({
    id: s.nextId++, kind, x, z, vx: -Math.cos(a) * speed, vz: -Math.sin(a) * speed,
    hp, maxHp: hp, speed, dmg: T.dmg * d.dmg,
    reward: T.reward, size: T.size, seenUntil: -1, locked: false, incoming: 0, wob: rnd() * TAU,
    born: s.t, cd: 3, aim: NaN, lockT: 0, ided: false, orbit: false, raid: 0, pkg: 0, hold: kind === 'ew' ? a : NaN, tgt: -1,
  });
  const e = s.enemies[s.enemies.length - 1];
  if (kind === 'cruise') e.tgt = cruiseTarget(s, e)?.slot ?? -1;
  // ESM / early warning hears the launch, radar or not (a cruise missile's warning says what it's going for).
  if (kind === 'arm' || kind === 'tbm' || kind === 'cruise') s.events.push({ k: kind, x, z, n: e.tgt });
  return e;
}

// Packs of `kind` a group of `n` brings at `scale`. One escort jammer is enough, however big the group.
export const groupCount = (kind: EnemyKind, n: number, scale: number) => kind === 'ew' ? n : Math.max(1, Math.round(n * scale));

// A group flying in together from bearing `a`, in rows, counts in packs. Escort jammers hold its bearing.
function spawnGroup(s: State, g: Partial<Record<EnemyKind, number>>, a: number, scale: number, rw: () => number) {
  const id = s.nextPkg++, out: Enemy[] = [];
  let row = 0;
  for (const [kind, n] of Object.entries(g) as [EnemyKind, number][]) {
    for (let i = 0; i < groupCount(kind, n, scale); i++, row++) for (let j = 0; j < ENEMIES[kind].pack; j++) {
      const e = spawnEnemy(s, kind, a + (rw() - 0.5) * 0.35, ARENA_R + 2 + row * 1.5 + rw() * 2, rw);
      e.pkg = id;
      // The escort goes in ahead, on the axis, so it's on station jamming before the package is in radar range.
      if (kind === 'ew') { e.hold = a; e.x = Math.cos(a) * (EW_ORBIT + 6); e.z = Math.sin(a) * (EW_ORBIT + 6); }
      out.push(e);
    }
  }
  return out;
}

// The level's raid has resolved: build window, then the next level.
function endStage(s: State, held: boolean) {
  const n = held ? BUILD_TIME : BUILD_LOST;
  s.buildUntil = s.t + n;
  for (const p of s.perim) { p.hp = PAD_HP; p.down = false; } // the build window puts every unit back up
  s.events.push({ k: 'build', n });
}
function nextStage(s: State) {
  s.stage++; s.buildUntil = 0;
  // How long the last level took depends on play; reseeding per level keeps each level's waves the same for everyone.
  s.world.seed = s.seed ^ Math.imul(s.stage, 0x9E3779B1);
  s.nextRaid = s.t + LEVEL_LEN;
  s.nextElite = s.stage >= ELITE_FROM ? s.t + LEVEL_LEN / 2 : Infinity;
  s.events.push({ k: 'stage', name: phaseName(s) });
}

function spawn(s: State, dt: number) {
  if (building(s)) { if (s.t >= s.buildUntil) nextStage(s); else return; }
  const rw = () => rand(s.world);
  const { w, mod, pk, rate } = phase(s);
  s.spawnAcc += difficulty(s.t).spawnRate * (rate ?? 1) * (mod.spawn ?? 1) * (s.raidLeft ? RAID_SPAWN : 1) * dt;
  const total = KINDS.reduce((a, k) => a + (w[k] ?? 0), 0);
  while (s.spawnAcc >= 1) {
    s.spawnAcc--;
    const pkgs = PACKAGES.filter(p => s.stage >= p.from);
    if (pk && pkgs.length && rw() < pk) {
      const p = pick(s.world, pkgs), a = spawnBearing(s.stage, Object.keys(p.g) as EnemyKind[], rw());
      spawnGroup(s, p.g, a, 1, rw);
      s.events.push({ k: 'package', x: Math.cos(a) * ARENA_R, z: Math.sin(a) * ARENA_R, name: p.name });
      continue;
    }
    let r = rw() * total, kind: EnemyKind = 'drone';
    for (const k of KINDS) { r -= w[k] ?? 0; if (r <= 0) { kind = k; break; } }
    const a = spawnBearing(s.stage, [kind], rw());
    for (let i = 0; i < ENEMIES[kind].pack; i++) spawnEnemy(s, kind, a + (rw() - 0.5) * 0.15, ARENA_R + 2 + rw() * 6, rw);
  }
  if (s.t >= s.nextElite) {
    s.nextElite = Infinity;
    const sr = () => rand(s.strikeRng), a = spawnBearing(s.stage, ['elite'], sr()), n = Math.floor(grow(s.t / 60, 1));
    for (let i = 0; i < n; i++) spawnEnemy(s, 'elite', a + (i - n / 2) * 0.08, ARENA_R + 4 + i * 3, sr);
    s.events.push({ k: 'warning' });
  }
  if (!s.raid && s.t >= s.nextRaid - RAID_WARN - s.st.raidWarn) {
    // Pool, bearing and size go by the level, not the clock, so pacing can't change them.
    const r = pick(s.raidRng, RAIDS.filter(r => s.stage >= r.from)), a = spawnBearing(s.stage, Object.keys(r.g) as EnemyKind[], rand(s.raidRng));
    // Same rounding spawnGroup will use at arrival, so the briefing matches what shows up.
    const scale = raidScale(s.stage), n: Partial<Record<EnemyKind, number>> = {};
    let reward = 0;
    for (const [k, c] of Object.entries(r.g) as [EnemyKind, number][]) {
      n[k] = groupCount(k, c, scale) * ENEMIES[k].pack;
      if (k !== 'ew') reward += n[k]! * ENEMIES[k].reward;
    }
    // No radar yet: there's nothing to protect but the battery.
    s.raid = { name: r.name, a, at: s.nextRaid, g: r.g, obj: r.obj === 'radar' && !s.st.radar ? 'battery' : r.obj ?? 'battery', n, bonus: Math.round(reward * RAID_BONUS) + 25 };
    s.nextRaid = Infinity; // one raid per level
    s.events.push({ k: 'raid', x: Math.cos(a) * ARENA_R, z: Math.sin(a) * ARENA_R, name: r.name });
  }
  if (s.raid && s.t >= s.raid.at) {
    const { a, g, name, obj } = s.raid, scale = raidScale(s.stage);
    s.raid = null;
    s.raidId++; s.raidLeft = 0; s.raidClean = true; s.raidReward = 0; s.raidA = a; s.raidObj = obj; s.raidName = name;
    // The escort jammer flies with the raid but doesn't count: the raid is over once the strikers are gone.
    for (const e of spawnGroup(s, g, a, scale, () => rand(s.raidRng))) if (e.kind !== 'ew') { e.raid = s.raidId; s.raidLeft++; s.raidReward += e.reward; }
    s.events.push({ k: 'raidStart', x: Math.cos(a) * ARENA_R, z: Math.sin(a) * ARENA_R, name });
  }
}

function moveEnemies(s: State, dt: number) {
  const armor = 1 - s.st.armor;
  for (let i = s.enemies.length - 1; i >= 0; i--) {
    const e = s.enemies[i];
    const d = Math.hypot(e.x, e.z) || 1;
    const nx = -e.x / d, nz = -e.z / d;
    if (e.kind === 'arm') {
      steerArm(s, e, dt);
      // Out of motor, or veered off past the arena: it's gone.
      if (s.t - e.born > ARM_LIFE || d > ARENA_R + 12) {
        if (d < ARENA_R) s.events.push({ k: 'hit', x: e.x, z: e.z, n: 2 });
        s.stats.armsEvaded++;
        removeAt(s, i); continue;
      }
    } else {
      const wob = Math.sin(s.t * 2 + e.wob) * ENEMIES[e.kind].wobble * Math.min(1, d / 20);
      const sp = e.speed * (e.kind !== 'elite' && jammed(s, e) ? JAM_SLOW : 1);
      e.vx = nx * sp - nz * wob;
      e.vz = nz * sp + nx * wob;
      if (e.kind === 'ew' && (e.orbit || d <= EW_ORBIT)) {
        // On station: stand off on its bearing out on the front (an escort's is its package's, so the jammed
        // sector stays over the package), easing back onto the orbit radius.
        if (!e.orbit) { e.orbit = true; s.events.push({ k: 'jam', x: e.x, z: e.z }); }
        const dir = -Math.max(-1, Math.min(1, angDiff(e.hold, Math.atan2(e.z, e.x)) * 4)), pull = (d - EW_ORBIT) * 0.5;
        e.vx = -nz * dir * sp + nx * pull;
        e.vz = nx * dir * sp + nz * pull;
      }
    }
    // Su-34s loose Kh-31Ps at a radiating radar once in range.
    if (e.kind === 'elite' && (e.cd -= dt) <= 0 && d < ARM_LAUNCH_R * radarMode(s).armR && emitting(s)) {
      e.cd = ARM_EVERY * radarMode(s).armEvery;
      const arm = spawnEnemy(s, 'arm', Math.atan2(e.z, e.x), d - 1);
      if (e.raid && e.raid === s.raidId) { arm.raid = e.raid; s.raidLeft++; } // part of the raid
    }
    // Cruise missile: weaves in on its unit (a new one if that's down or gone), and knocks it out.
    if (e.kind === 'cruise') {
      let p = s.perim.find(q => q.slot === e.tgt && !q.down);
      if (!p && e.tgt >= 0) { p = cruiseTarget(s, e); e.tgt = p?.slot ?? -1; }
      if (p) {
        const dx = p.x - e.x, dz = p.z - e.z, dd = Math.hypot(dx, dz) || 1;
        if (dd < 1.2) { hitPad(s, p, PAD_HP); removeAt(s, i); continue; } // one hit takes a unit down
        const w = Math.sin(s.t * 2 + e.wob) * ENEMIES.cruise.wobble * Math.min(1, dd / 20);
        e.vx = dx / dd * e.speed - dz / dd * w; e.vz = dz / dd * e.speed + dx / dd * w;
      }
    }
    // FPVs and Lancets that pass close to a unit on the forward line dive on it instead of the base.
    if (e.kind === 'scout' || e.kind === 'swarm') {
      // On the ridge it's on the skyline (dived on from twice as far); in the woods it isn't seen at all.
      let tgt: Pad | undefined, bd = Infinity;
      for (const p of s.perim) {
        if (p.down || SLOTS[p.slot].belt !== 'fwd' || terrain(p) === 'woods') continue;
        const dd = (p.x - e.x) ** 2 + (p.z - e.z) ** 2, r = DIVE_R * (terrain(p) === 'ridge' ? TERRAIN.ridge.dive : 1);
        if (dd < r * r && dd < bd) { bd = dd; tgt = p; }
      }
      if (tgt && bd < 1) { hitPad(s, tgt, e.dmg); removeAt(s, i); continue; }
      if (tgt) { const dd = Math.sqrt(bd); e.vx = (tgt.x - e.x) / dd * e.speed; e.vz = (tgt.z - e.z) / dd * e.speed; }
    }
    e.x += e.vx * dt; e.z += e.vz * dt;
    if (d < BASE_R + e.size * 0.5) {
      // Objective lost: PROTECT BATTERY by anything of the raid landing, PROTECT RADAR by any ARM hit while it's on.
      if (s.raidClean && s.raidLeft && (s.raidObj === 'radar' ? e.kind === 'arm' : e.raid === s.raidId && e.dmg > 0)) raidLost(s);
      if (e.kind === 'arm' && s.st.radar) {
        const stun = ARM_STUN * s.st.armStun;
        s.radarDownUntil = Math.min(Math.max(s.radarDownUntil, s.t) + stun, s.t + 2 * stun);
        s.events.push({ k: 'radarDown' });
        s.stats.radarHits++;
      }
      if (e.dmg > 0) {
        s.hp -= e.dmg * armor;
        s.shake = Math.min(1.5, s.shake + 0.3 + e.dmg / 40);
        s.events.push({ k: 'baseHit', x: e.x, z: e.z, kind: e.kind, n: e.dmg * armor });
      }
      removeAt(s, i);
    }
  }
}

// Homes on the radar while it radiates. When it goes dark the seeker loses the emitter and the missile
// swings ARM_VEER off its last heading; the turn rate is limited, so a late EMCON still eats the hit.
function steerArm(s: State, e: Enemy, dt: number) {
  if (emitting(s) && (!radarMode(s).lpi || e.x * e.x + e.z * e.z < LPI_R * LPI_R)) e.aim = NaN;
  else if (Number.isNaN(e.aim)) e.aim = Math.atan2(e.vz, e.vx) + (e.wob < Math.PI ? ARM_VEER : -ARM_VEER);
  const h = Math.atan2(e.vz, e.vx), want = Number.isNaN(e.aim) ? Math.atan2(-e.z, -e.x) : e.aim;
  const nh = h + Math.max(-ARM_TURN * dt, Math.min(ARM_TURN * dt, angDiff(want, h)));
  e.vx = Math.cos(nh) * e.speed; e.vz = Math.sin(nh) * e.speed;
}

function jammed(s: State, e: Enemy) {
  if (!s.jamming) return false;
  const r2 = PERIM.jammer.range ** 2;
  return s.perim.some(p => p.k === 'jammer' && up(p) && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < r2);
}

const isMissile = (e: Enemy) => e.kind === 'cruise' || e.kind === 'arm';
// Pads engage the closest visible contact in their range and field of fire; no lock slot needed. Repairs run here too.
function perimeter(s: State, dt: number) {
  const r2 = PERIM.jammer.range ** 2;
  const jammers = s.perim.filter(p => p.k === 'jammer' && up(p) && s.enemies.some(e => (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < r2)).length;
  const need = jammers * PERIM.jammer.power * dt;
  s.jamming = jammers > 0 && s.power >= need;
  if (s.jamming) s.power -= need;
  for (const p of s.perim) {
    p.hp = Math.min(PAD_HP, p.hp + PAD_REPAIR * dt);
    if (p.down && p.hp >= PAD_HP / 2) { p.down = false; s.events.push({ k: 'padUp', x: p.x, z: p.z, n: 0, kind: p.k }); }
  }
  const guns = s.perim.filter(p => GUNS.includes(p.k) && up(p));
  const stats = guns.map(p => padStats(s, p));
  guns.forEach((p, gi) => {
    const w = stats[gi];
    p.cd = Math.max(0, p.cd - dt);
    if (p.cd > 0 || s.ammo < w.ammo) return;
    let best: Enemy | null = null, bd = w.range ** 2, brank = 2;
    const ic = interceptActive(s) ? s.enemies.find(e => e.id === s.intercept.target) : undefined;
    for (const e of s.enemies) {
      if (!visible(s, e) || e.ided || e.incoming >= e.hp && e !== ic || ENEMIES[e.kind].pacOnly) continue;
      if (ic && e !== ic && (ic.x - p.x) ** 2 + (ic.z - p.z) ** 2 < bd) continue; // intercept target in reach: only it
      const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2, rank = p.k === 'iris' && isMissile(e) ? 0 : 1; // the SAM takes missiles first
      if (d > w.range ** 2 || !covers(p, e.x, e.z, w.range) || rank > brank || rank === brank && d >= bd) continue;
      bd = d; best = e; brank = rank;
    }
    if (!best) return;
    const t = best;
    s.ammo -= w.ammo; p.cd = 1 / w.rate;
    // Belt empty: reload. Slower out on the forward line, twice as fast with an ammo point in reach or on the road.
    if (p.k === 'mg' && --p.belt <= 0) {
      p.belt = MG_BELT.rounds;
      p.cd = MG_BELT.reload * (nearAmmo(s, p) || terrain(p) === 'road' ? AMMO_RELOAD : SLOTS[p.slot].belt === 'fwd' ? FWD_RELOAD : 1);
    }
    // Crossfire: the target is inside another gun's field of fire as well.
    const dmg = w.dmg * (guns.some((q, qi) => q !== p && covers(q, t.x, t.z, stats[qi].range)) ? 1 + CROSSFIRE : 1);
    if (p.k === 'mg' || p.k === 'mantis') {
      // 12.7mm / 35mm tracer round, led like the PAC-3 so it actually connects
      const sp = 70, tt = Math.sqrt(bd) / sp;
      const dx = best.x + best.vx * tt - p.x, dz = best.z + best.vz * tt - p.z, d = Math.hypot(dx, dz) || 1;
      s.shots.push({ kind: 'tracer', x: p.x, z: p.z, vx: dx / d * sp, vz: dz / d * sp, dmg, splash: 0, life: w.range / sp + 0.15, target: best.id, src: p.k === 'mg' ? 'MG' : 'MANTIS' });
      best.incoming += dmg;
      s.events.push({ k: 'gun', x: p.x, z: p.z, x2: best.x, z2: best.z });
    } else {
      const d = Math.sqrt(bd) || 1;
      const sp = p.k === 'iris' ? 25 : 15;
      s.shots.push({ kind: 'missile', x: p.x, z: p.z, vx: (best.x - p.x) / d * sp, vz: (best.z - p.z) / d * sp, dmg, splash: 0, life: 3, target: best.id, src: p.k === 'iris' ? 'IRIS-T SLM' : 'STINGER' });
      best.incoming += dmg;
      s.events.push({ k: 'missile', x: p.x, z: p.z });
    }
  });
}

// The enemy presses the advantage: no bonus, and a short build window before the next level.
function raidLost(s: State) {
  s.raidClean = false;
  s.events.push({ k: 'raidLeak', n: BUILD_LOST });
}

function removeAt(s: State, i: number) {
  const e = s.enemies[i];
  if (s.marked === e.id) s.marked = 0;
  s.enemies[i] = s.enemies[s.enemies.length - 1];
  s.enemies.pop();
  if (e.raid && e.raid === s.raidId && --s.raidLeft === 0) {
    s.stats.raids++;
    endStage(s, s.raidClean);
    if (!s.raidClean) { s.events.push({ k: 'raidEnd', n: 0 }); return; }
    s.stats.clean++;
    const n = Math.round((s.raidReward * RAID_BONUS + 25) * s.st.credits);
    s.credits += n; s.earned += n;
    s.events.push({ k: 'raidClear', n });
  }
}

function powerAndAmmo(s: State, dt: number) {
  const st = s.st;
  s.power = Math.min(st.powerCap, s.power + st.gen * (lastStand(s) ? LAST_STAND.gen : 1) * dt);
  // Radar gets what's left; starving it slows the sweep (floor 25%). Silent radar draws nothing.
  // Fire control first: painting the priority target and holding locks. The radar gets what's left.
  let locks = 0;
  for (const e of s.enemies) if (e.locked) locks++;
  s.power = Math.max(0, s.power - ((s.marked ? PRIORITY_POWER : 0) + locks * LOCK_POWER) * dt);
  const on = emitting(s), want = on ? st.drain * radarMode(s).drain * dt : 0, got = Math.min(want, s.power);
  s.power -= got;
  s.sweepSpeed = on ? st.sweep * Math.max(0.25, got / want) : 0;
  // Ammo fab only runs on surplus above 20% so weapons keep a reserve.
  const room = Math.min(st.ammoCap - s.ammo, st.ammoProd * dt);
  const spare = Math.max(0, s.power - st.powerCap * 0.2) / st.ammoPower;
  const made = Math.max(0, Math.min(room, spare));
  s.ammo += made; s.power -= made * st.ammoPower;
  // Repairs take the surplus after that: rebuilding competes with reloading.
  const fix = Math.max(0, Math.min(st.maxHp - s.hp, st.repair * dt, Math.max(0, s.power - st.powerCap * 0.2) / REPAIR_POWER));
  s.hp += fix; s.power -= fix * REPAIR_POWER;
}

// While the MPQ-65 is knocked out (not in EMCON), a TRML-4D keeps searching at half range and chance: no fire
// control locks, but contacts stay on the scope for the perimeter pads.
export const backupSearching = (s: State) => s.st.backupRadar && !s.emcon && s.t < s.radarDownUntil;
function backupRadar(s: State, dt: number) {
  const da = s.st.sweep * dt, r2 = (s.st.radarRange * BACKUP_RADAR) ** 2;
  for (const e of s.enemies) {
    if (e.x * e.x + e.z * e.z > r2 || Math.random() >= da / TAU) continue;
    if (Math.random() < ENEMIES[e.kind].sig * BACKUP_RADAR * s.st.res * jamFactor(s, e)) e.seenUntil = Math.max(e.seenUntil, s.t + s.st.persist);
  }
}

// Eyes: anything close to the base or to an emplacement is seen, radar or not (NIGHT RAID shortens it).
function spot(s: State) {
  const k = phase(s).mod.dark ? VISUAL_DARK : 1, b2 = (VISUAL_R * k) ** 2;
  const eyes = s.perim.filter(up).map(p => ({ x: p.x, z: p.z, r2: ((p.k === 'observer' ? OBSERVER_EYES : PAD_EYES) * (terrain(p) === 'ridge' ? TERRAIN.ridge.range : 1) * k) ** 2 }));
  let newly = 0;
  for (const e of s.enemies) {
    if (e.x * e.x + e.z * e.z > b2 && !eyes.some(p => (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < p.r2)) continue;
    if (e.seenUntil < s.t) newly++;
    e.seenUntil = Math.max(e.seenUntil, s.t + 0.25);
  }
  if (newly) s.events.push({ k: 'detect', x: 0, z: 0, n: newly });
}

function radar(s: State, dt: number) {
  if (backupSearching(s)) backupRadar(s, dt);
  if (!emitting(s)) return;
  const a0 = s.sweepA, da = s.sweepSpeed * dt;
  // An AESA stares all round: each contact gets the looks a rotating beam would give it, at random moments.
  // sweepA then only turns the TRML-4D head (and the sweep ping) at a calm fixed rate.
  s.sweepA = (a0 + (s.st.aesa ? AESA_SPIN * dt * s.sweepSpeed / s.st.sweep : da)) % TAU;
  const r2 = radarRange(s) ** 2, { mod } = phase(s), M = radarMode(s);
  const sector = radarSector(s), fa = focusBearing(s), sig = M.lpi && s.st.lpi ? 1 : M.sig;
  let newly = 0;
  for (const e of s.enemies) {
    if (e.x * e.x + e.z * e.z > (ENEMIES[e.kind].low ? r2 * CRUISE_LOW * CRUISE_LOW : r2)) continue; // low flyers: under the horizon
    const a = Math.atan2(e.z, e.x);
    // FOCUSED: the same looks, spent on a narrower arc. An AESA stares, a rotating radar sweeps.
    if (sector) { if (Math.abs(angDiff(a, fa)) > sector / 2 || Math.random() >= da / sector) continue; }
    else if (s.st.aesa ? Math.random() >= da / TAU : ((a - a0) % TAU + TAU) % TAU > da) continue;
    if (Math.random() < ENEMIES[e.kind].sig * sig * s.st.res * jamFactor(s, e) * (mod.sig ?? 1)) {
      if (e.seenUntil < s.t) newly++;
      e.seenUntil = s.t + s.st.persist * (mod.persist ?? 1) * (s.st.blackout ? BLACKOUT.lit : 1);
    }
  }
  if (newly) s.events.push({ k: 'detect', x: 0, z: 0, n: newly });
}

function score(s: State, e: Enemy) {
  switch (MODES[s.mode]) {
    case 'CLOSEST': return -(e.x * e.x + e.z * e.z);
    case 'WEAKEST': return -e.hp;
    case 'RICHEST': return ENEMIES[shownKind(e)].reward * 1000 - (e.x * e.x + e.z * e.z) / 100;
    case 'FASTEST': return e.speed;
  }
}

function track(s: State, dt: number) {
  // Feedback: locks gained and lost this frame (a classified decoy being released isn't a loss: 'ident' says so).
  let lost = 0, got = 0, lx = 0, lz = 0, gx = 0, gz = 0;
  const drop = (e: Enemy) => { e.locked = false; if (!e.ided) { lost++; lx = e.x; lz = e.z; } };
  const lock = (e: Enemy) => { e.locked = true; got++; gx = e.x; gz = e.z; };
  const report = () => {
    if (lost) s.events.push({ k: 'lost', x: lx, z: lz, n: lost });
    if (got) s.events.push({ k: 'acquire', x: gx, z: gz, n: got });
  };
  const dark = !emitting(s);
  if (dark && !s.dark && s.st.blackout) // BLACKOUT PROTOCOL: what's on the scope coasts twice as long
    for (const e of s.enemies) if (e.seenUntil > s.t) e.seenUntil = s.t + (e.seenUntil - s.t) * BLACKOUT.dark;
  s.dark = dark;
  if (dark) {
    // Radar dark: fire control drops every track and contacts coast on track memory. TRACK FUSION keeps them.
    for (const e of s.enemies) if (e.locked) {
      if (s.st.fusion && e.x * e.x + e.z * e.z <= s.st.trackRange ** 2) e.seenUntil = Math.max(e.seenUntil, s.t + 0.5);
      else { drop(e); e.seenUntil = s.t + s.st.persist * (s.st.blackout ? BLACKOUT.dark : 1); }
    }
    return report();
  }
  const tr2 = s.st.trackRange ** 2;
  let locks = 0;
  for (const e of s.enemies) {
    if (e.locked && e.kind === 'decoy' && !e.ided && (e.lockT += dt) >= DECOY_ID / s.st.res) {
      e.ided = true;
      s.events.push({ k: 'ident', x: e.x, z: e.z });
    }
    // A classified decoy is released, unless the operator insists.
    if (e.locked && (e.x * e.x + e.z * e.z > tr2 || e.ided && e.id !== s.marked)) drop(e);
    if (e.locked) { locks++; e.seenUntil = Math.max(e.seenUntil, s.t + 0.5); }
  }
  // Too many locks (slots lowered by a perk) → drop extras
  const n = slots(s);
  if (locks > n) for (const e of s.enemies) if (e.locked && locks > n && e.id !== s.marked) { drop(e); locks--; }
  // Manual mark always gets a slot.
  const m = s.marked ? s.enemies.find(e => e.id === s.marked) : undefined;
  if (m && !m.locked && visible(s, m) && m.x * m.x + m.z * m.z <= tr2) {
    if (locks >= n) {
      let worst: Enemy | null = null;
      for (const e of s.enemies) if (e.locked && (!worst || score(s, e) < score(s, worst))) worst = e;
      if (worst) { drop(worst); locks--; }
    }
    lock(m); locks++;
  }
  while (locks < n) {
    let best: Enemy | null = null, bs = -Infinity;
    for (const e of s.enemies) {
      if (e.locked || e.ided || e.seenUntil <= s.t || e.incoming >= e.hp || e.x * e.x + e.z * e.z > tr2) continue;
      const sc = score(s, e);
      if (sc > bs) { bs = sc; best = e; }
    }
    if (!best) break;
    lock(best); locks++;
  }
  report();
}

// Emergency intercept target, while one is running and fire control holds it.
function interceptLock(s: State) {
  if (!interceptActive(s)) return undefined;
  const e = s.enemies.find(e => e.id === s.intercept.target && e.locked);
  if (!e && !s.enemies.some(e => e.id === s.intercept.target)) s.intercept.until = 0; // it's dead: stand down
  return e;
}

function fire(s: State, dt: number) {
  const D = DISCIPLINES[s.discipline], ic = interceptLock(s);
  // Commit: how much damage may already be in flight before a target is left alone.
  const open = (e: Enemy) => e === ic || e.incoming < e.hp * D.commit;
  const targets = ic ? [ic] : s.enemies.filter(e => e.locked && open(e));
  targets.sort((a, b) => (b.id === s.marked ? 1e12 : score(s, b)) - (a.id === s.marked ? 1e12 : score(s, a)));
  const rate = D.rate * (ic ? INTERCEPT.rate : 1) * (lastStand(s) ? LAST_STAND.rate : 1);
  let wi = 0;
  for (const k of ['cannon', 'pulse', 'missile', 'rail'] as WeaponKind[]) {
    const w = s.st.weapons[k];
    s.cooldown[k] = Math.max(0, s.cooldown[k] - dt);
    if (!w || s.cooldown[k] > 0) continue;
    const r2 = (w.range * (ic ? 1 : D.range)) ** 2;
    // Spread weapons over locks; fall back to any lock in range.
    const inRange = targets.filter(e => e.x * e.x + e.z * e.z <= r2 && open(e) && (k === 'cannon' || !ENEMIES[e.kind].pacOnly));
    const e = inRange[wi++ % Math.max(1, inRange.length)];
    if (!e) continue;
    const ammo = w.ammo * D.cost, power = w.power * D.cost;
    if (s.ammo < ammo || s.power < power) continue;
    s.ammo -= ammo; s.power -= power;
    s.cooldown[k] = 1 / (w.rate * rate);
    if (k === 'cannon') {
      // Lead the target: solve |p + v t| = speed * t (one Newton-ish pass is plenty)
      const d = Math.hypot(e.x, e.z), tt = d / w.speed;
      const ax = e.x + e.vx * tt, az = e.z + e.vz * tt, ad = Math.hypot(ax, az) || 1;
      s.aim = Math.atan2(az, ax);
      s.shots.push({ kind: 'shell', x: 0, z: 0, vx: ax / ad * w.speed, vz: az / ad * w.speed, dmg: w.dmg, splash: 0, life: w.range / w.speed + 0.3, target: e.id, src: 'PAC-3' });
      e.incoming += w.dmg;
      s.events.push({ k: 'shot', x: 0, z: 0 });
    } else if (k === 'missile') {
      const a = Math.random() * TAU;
      s.shots.push({ kind: 'missile', x: 0, z: 0, vx: Math.cos(a) * 12, vz: Math.sin(a) * 12, dmg: w.dmg, splash: w.splash, life: 5, target: e.id, src: 'IRIS-T' });
      e.incoming += w.dmg;
      s.events.push({ k: 'missile', x: 0, z: 0 });
    } else if (k === 'pulse') {
      s.events.push({ k: 'beam', x: 0, z: 0, x2: e.x, z2: e.z });
      damage(s, e, w.dmg, 'HEL');
      // ARC LASER: hop to the nearest visible contacts within 10m that haven't been hit this shot
      const hit = [e];
      for (let n = 0; n < s.st.arc; n++) {
        const from = hit[hit.length - 1];
        let next: Enemy | null = null, bd = 100;
        for (const o of s.enemies) {
          if (hit.includes(o) || !visible(s, o) || o.ided) continue;
          const d = (o.x - from.x) ** 2 + (o.z - from.z) ** 2;
          if (d < bd) { bd = d; next = o; }
        }
        if (!next) break;
        s.events.push({ k: 'beam', x: from.x, z: from.z, x2: next.x, z2: next.z });
        damage(s, next, w.dmg * 0.6, 'HEL');
        hit.push(next);
      }
    } else {
      const d = Math.hypot(e.x, e.z) || 1, dx = e.x / d, dz = e.z / d;
      s.events.push({ k: 'rail', x: 0, z: 0, x2: dx * w.range, z2: dz * w.range });
      for (const o of [...s.enemies]) {
        const along = o.x * dx + o.z * dz;
        if (along < 0 || along > w.range) continue;
        if (Math.abs(o.x * dz - o.z * dx) < o.size + 0.6) damage(s, o, w.dmg, 'HPM');
      }
      s.shake = Math.min(1.5, s.shake + 0.25);
    }
  }
}

function moveShots(s: State, dt: number) {
  if (!s.shots.length) return;
  // With many shots in the air, one id table per frame beats scanning every enemy for every shot.
  let byId: Map<number, Enemy> | null = null;
  if (s.shots.length > 16) { byId = new Map(); for (const e of s.enemies) byId.set(e.id, e); }
  const target = (id: number) => {
    const e = byId ? byId.get(id) : s.enemies.find(e => e.id === id);
    return e && e.hp > 0 ? e : undefined; // hp <= 0: killed earlier this frame
  };
  for (let i = s.shots.length - 1; i >= 0; i--) {
    const p = s.shots[i];
    p.life -= dt;
    if (p.kind === 'missile') {
      let t = target(p.target);
      if (!t) {
        let bd = Infinity;
        for (const e of s.enemies) { const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2; if (e.locked && !ENEMIES[e.kind].pacOnly && d < bd) { bd = d; t = e; } }
        if (t) { p.target = t.id; t.incoming += p.dmg; }
      }
      if (t) {
        const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz) || 1;
        const sp = WEAPONS.missile.speed;
        p.vx += (dx / d * sp - p.vx) * Math.min(1, dt * 4);
        p.vz += (dz / d * sp - p.vz) * Math.min(1, dt * 4);
      }
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
    let hit: Enemy | null = null;
    for (const e of s.enemies) {
      if (p.kind !== 'shell' && ENEMIES[e.kind].pacOnly) continue; // flies straight through anything else
      const r = e.size * 0.8 + 0.4;
      if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 < r * r) { hit = e; break; }
    }
    if (hit || p.life <= 0) {
      const t = target(p.target);
      if (t) t.incoming = Math.max(0, t.incoming - p.dmg);
      if (hit) {
        if (p.splash) explode(s, p.x, p.z, p.splash, p.dmg, p.src);
        else damage(s, hit, p.dmg, p.src);
        if (p.kind === 'shell' && s.st.frag) explode(s, p.x, p.z, 2.5, p.dmg * s.st.frag, p.src);
      }
      s.shots[i] = s.shots[s.shots.length - 1];
      s.shots.pop();
    }
  }
}

function explode(s: State, x: number, z: number, r: number, dmg: number, src: string) {
  s.events.push({ k: 'hit', x, z, n: r });
  for (const e of [...s.enemies]) if ((e.x - x) ** 2 + (e.z - z) ** 2 < (r + e.size) ** 2) damage(s, e, dmg, src);
}

function damage(s: State, e: Enemy, dmg: number, src: string) {
  if (e.hp <= 0) return; // already dead this frame
  if (ENEMIES[e.kind].pacOnly && src !== 'PAC-3') return;
  if (e.id === s.marked) dmg *= PRIORITY_DMG * s.st.markDmg;
  s.stats.dmg[src] = (s.stats.dmg[src] ?? 0) + Math.min(dmg, e.hp);
  e.hp -= dmg;
  if (e.hp > 0) { s.events.push({ k: 'hit', x: e.x, z: e.z }); return; }
  const excess = -e.hp;
  const i = s.enemies.indexOf(e);
  if (i >= 0) removeAt(s, i);
  s.combo = s.t - s.lastKill < COMBO_WINDOW ? s.combo + 1 : 1;
  s.lastKill = s.t;
  const gain = Math.round(e.reward * s.st.credits * (1 + Math.min(s.combo, COMBO_CAP) * COMBO_BONUS));
  s.credits += gain; s.earned += gain; s.kills++;
  s.ammo = Math.min(s.st.ammoCap, s.ammo + s.st.scav);
  s.stats.kills[e.kind] = (s.stats.kills[e.kind] ?? 0) + 1;
  s.events.push({ k: 'kill', x: e.x, z: e.z, kind: e.kind, n: gain });
  if (s.st.chain) explode(s, e.x, e.z, 4, s.st.chain, 'CHAIN');
  if (s.st.counterSead && e.kind === 'arm') { s.power = Math.min(s.st.powerCap, s.power + s.st.powerCap * COUNTER_SEAD); s.events.push({ k: 'counterSead' }); }
  if (s.st.killChain && ++s.chainKills >= KILL_CHAIN.every) { s.chainKills = 0; s.chainUntil = s.t + KILL_CHAIN.time; s.events.push({ k: 'killChain' }); }
  if (s.st.overkill && excess > 0.5) { // OVERKILL: what's left over jumps to the nearest contact
    let next: Enemy | null = null, bd = OVERKILL_R ** 2;
    for (const o of s.enemies) {
      if (!visible(s, o) || o.ided) continue;
      const d = (o.x - e.x) ** 2 + (o.z - e.z) ** 2;
      if (d < bd) { bd = d; next = o; }
    }
    if (next) { s.events.push({ k: 'beam', x: e.x, z: e.z, x2: next.x, z2: next.z }); damage(s, next, excess, src); }
  }
}
