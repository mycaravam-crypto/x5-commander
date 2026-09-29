import {
  ARENA_R, BASE_R, START_CREDITS, COMBO_WINDOW, COMBO_BONUS, COMBO_CAP, LEVEL_LEN, BUILD_TIME, BUILD_LOST, ELITE_FROM, PK_GROW, PK_MAX, EW_GROW, EW_MAX,
  TERRAIN, ENEMIES, KINDS, WEAPONS, LEVELS, PACKAGES, DISCIPLINES, PRIORITY_DMG, PRIORITY_POWER, LOCK_POWER, REPAIR_POWER, INTERCEPT, DOCTRINES, MODS, RAIDS, RAID_WARN, RAID_BONUS, RAID_SPAWN, raidScale, MODES, UPGRADES, PERKS, PERIM_KINDS, PERIM, GUNS, FANS, beltAt, buildR, BUILD_MIN, PAD_GAP, START_PAD, CROSSFIRE, MG_TIERS, OBSERVER_EYES, AMMO_R, AMMO_RATE, AMMO_RELOAD, FWD_RELOAD, PAD_HP, PAD_REPAIR, DIVE_R, SELL_REFUND, MOVE_TIME, SWEEP_CAP, grow, PLACE_TIME, JAM_SLOW, baseLevel, perimSlots, VETERANCY, vetRank, deriveStats, difficulty, BACKUP_RADAR,
  BIG_KILLS, BIG_KILL_SHAKE, DROPS, DROP_KINDS, DROP_GRAB, DROP_MAX, DROP_HEAVY, CACHE, REPAIR_DROP, OVERDRIVE, MILESTONE, rank,
  RADAR_MODES, FRONT, FRONT_ARC, VISUAL_R, PAD_EYES, VISUAL_DARK, MG_BELT, LPI_R, BLACKOUT, COUNTER_SEAD, KILL_CHAIN, OVERKILL_R, LAST_STAND, ARM_STUN, ARM_VEER, ARM_TURN, ARM_LIFE, ARM_EVERY, ARM_LAUNCH_R, DECOY_ID, EW_ORBIT, EW_ARC, EW_JAM,
  TRAINING, TRAINING_BUILD, TRAINING_SEED, DIVE_SPEED, SHAHED_DIVE, LANCET, HELO, KAB_R, KAB_PAIR, KAB_FIRST, EGRESS_SPEED, TERMINAL, CRUISE_DOGLEG, CRUISE_TERMINAL, KA52, SU25, SEAD, ARM2, ARMS, SWARM, RECON, MASK, IR_SEEKER, horizon, flightAlt, MUNITIONS, AGILITY, HOMING_BOOST, HOMING_SNAP,
  type EnemyKind, type DropKind, type PerimKind, type WeaponKind, type Mod, type RaidObjective,
} from './config.ts';
import { ground, setMap, site, type Site } from './terrain.ts';

export interface Enemy {
  id: number; kind: EnemyKind; x: number; z: number; vx: number; vz: number;
  hp: number; maxHp: number; speed: number; dmg: number; reward: number; size: number;
  seenUntil: number; locked: boolean; incoming: number; wob: number;
  born: number;
  cd: number; // Su-34: time to next ARM launch · Mi-28: to next ATGM · Lancet: search time left
  act: Act; // what it's doing now (see moveEnemies)
  ammo: number; // Mi-28: ATGMs left · Su-34: glide bombs left
  wx: number; wz: number; // Kh-101: dogleg waypoint, NaN once past it
  aim: number; // ARM: heading it flies blind on, NaN while guided
  lockT: number; ided: boolean; // decoy: time held in lock, classified yet
  orbit: boolean; // Mi-8 jammer: on station and jamming
  raid: number; // id of the raid it belongs to, 0 = none
  pkg: number; // id of the attack package or raid group it flies with, 0 = none
  hold: number; // Mi-8 jammer: bearing it holds station on (its own, or its package's) · Su-35S: s it waits on station
  tgt: number; // cruise missile, Ka-52's ATGM: slot of the unit it's going for, -1 = the base
  pop: number; // Ka-52: s left exposed (settling, or popped up to fire), masked in the trees otherwise · Su-25: s left of its pop-up, flares out
}
// in: inbound · loiter: Lancet circling, searching · dive: terminal dive (a cruise missile's pop-up) · hover: Mi-28 or
// Ka-52 firing from standoff ·
// egress: heading home after its attack (leaves the arena, no reward)
export type Act = 'in' | 'loiter' | 'dive' | 'hover' | 'egress';
export interface Shot {
  kind: 'shell' | 'missile' | 'tracer'; x: number; z: number; vx: number; vz: number;
  dmg: number; splash: number; life: number; target: number; src: string; // src: weapon, for the debrief
  pad?: number; // slot of the perimeter pad that fired it, credited with the kill
}
export type Ev =
  | { k: 'shot' | 'missile' | 'kill' | 'hit' | 'baseHit' | 'detect' | 'arm' | 'tbm' | 'cruise' | 'jam' | 'ident' | 'acquire' | 'lost' | 'release' | 'egress' | 'dud' | 'spot' | 'settle'; x: number; z: number; kind?: EnemyKind; n?: number }
  | { k: 'beam' | 'rail' | 'gun'; x: number; z: number; x2: number; z2: number }
  | { k: 'raid'; x: number; z: number; name: string }
  | { k: 'package'; x: number; z: number; name: string }
  | { k: 'raidStart'; x: number; z: number; name: string }
  | { k: 'raidClear' | 'raidLeak' | 'raidEnd' | 'build'; n: number }
  | { k: 'stage'; name: string }
  | { k: 'upgrade'; id: string; n: number; star: boolean } // n: the upgrade's new level; star: it reached a new rank
  | { k: 'drop'; x: number; z: number; drop: DropKind }
  | { k: 'pickup'; x: number; z: number; drop: DropKind; n: number; id: string } // n: credits (cache); id: upgrade (tech)
  | { k: 'intercept'; x: number; z: number }
  | { k: 'padHit' | 'padDown' | 'padUp' | 'padSold' | 'padMoved' | 'padRank'; x: number; z: number; n: number; kind: PerimKind }
  | { k: 'level' | 'warning' | 'buy' | 'placing' | 'lock' | 'over' | 'trained' | 'emcon' | 'radarDown' | 'aesa' | 'radarOnline' | 'pac3' | 'discipline' | 'radarMode' | 'killChain' | 'counterSead' | 'lastStand' };

export type Phase = 'start' | 'play' | 'pause' | 'perk' | 'over';
export interface Drop { id: number; k: DropKind; x: number; z: number; v: number } // v: the kill's reward (a cache scales with it); on the ground until clicked
export interface Pad { k: PerimKind; x: number; z: number; a: number; slot: number; cd: number; belt: number; hp: number; tier: number; paid: number; down: boolean; site: Site; kills: number }

// mulberry32: tiny seeded PRNG, so a seed replays the same schedule (daily op, tests).
export function rand(r: { seed: number }) {
  let t = (r.seed = (r.seed + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// Same seed for everyone on the same (UTC) day.
export const dailySeed = (date: string) => [...date].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
// Share codes. A normal run is its seed and doctrine (same map, same schedule, same loadout): X5-<seed base 36>-<doctrine #>.
// A daily op is its date: X5-D20260929. A code is found anywhere in the text, so a whole result line works too.
export function seedCode(s: { seed: number; daily: string; doctrine: string }) {
  return s.daily ? `X5-D${s.daily.replaceAll('-', '')}` : `X5-${(s.seed >>> 0).toString(36).toUpperCase()}-${Math.max(0, DOCTRINES.findIndex(d => d.id === s.doctrine))}`;
}
export type Code = { kind: 'run'; seed: number; doctrine: string } | { kind: 'daily'; daily: string };
export function parseCode(text: string): Code | null {
  const d = /X5-D(\d{4})(\d{2})(\d{2})\b/i.exec(text);
  if (d) return { kind: 'daily', daily: `${d[1]}-${d[2]}-${d[3]}` };
  const n = /X5-([0-9A-Z]{1,7})-(\d)\b/i.exec(text), seed = n ? parseInt(n[1], 36) : NaN;
  return n && seed <= 0xFFFFFFFF ? { kind: 'run', seed: seed | 0, doctrine: DOCTRINES[+n[2]]?.id ?? 'standard' } : null;
}
// A friend's pasted result line (hud.resultLine): its code, time survived and kills, for the daily board.
export function parseResult(text: string) {
  const code = parseCode(text), m = / · (\d+):(\d{2}) · ([\d,]+) kills/.exec(text);
  return code && m ? { code, time: +m[1] * 60 + +m[2], kills: +m[3].replaceAll(',', '') } : null;
}

// The seed drives two separate streams: the spawn schedule and the perk drafts. Everything that depends on
// how you play (detection rolls, launches) uses Math.random, so it can't shift the schedule.
// Training (see config TRAINING) always flies STANDARD over its own map.
export function newGame(seed = Math.random() * 2 ** 32 | 0, daily = '', doctrine = 'standard', training = false) {
  if (training) { seed = TRAINING_SEED; daily = ''; doctrine = 'standard'; }
  const doc = DOCTRINES.find(d => d.id === doctrine && !daily) ?? DOCTRINES[0];
  setMap(seed); // the map comes from the seed too: a daily op flies over the same ground for everyone
  const s = {
    phase: 'start' as Phase,
    daily, // date of the daily op, '' for a normal run
    training, // the first-run drill: scripted waves, can't be lost, no records
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
    st: deriveStats(doc.lv, [], 1, doc.id),
    hp: 0,
    power: 0,
    ammo: 0,
    sweepA: 0,
    sweepSpeed: 0, // effective, after power throttling
    enemies: [] as Enemy[],
    shots: [] as Shot[],
    drops: [] as Drop[], // salvage on the ground, waiting for a click
    overdriveUntil: 0, // OVERDRIVE drop: fire rate up until then
    // Emplacements. a: facing (away from the base); belt: MG rounds left; tier: upgrades in place; paid: credits
    // sunk into it (for a sale); down: knocked out until repaired to half.
    perim: [] as Pad[],
    placing: null as null | { k: PerimKind; since: number; paid: number }, // bought, waiting for a click on the map
    selected: -1, // id (`slot`) of the emplacement the player picked (upgrade / sell / move), -1 = none
    relocating: false, // the picked unit waits for a click on its new spot
    padSeq: 0, // next unit id
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
    stageAt: 0, // when this level started
    drill: 0, // training: next line of this wave's script
    nextElite: Infinity, // this level's Su-34 strike package
    nextRaid: LEVEL_LEN, // this level's raid arrives (Infinity once announced)
    // Announced, not yet here: composition (in aircraft) and the bonus it pays if the objective holds.
    raid: null as null | { name: string; a: number; at: number; g: Partial<Record<EnemyKind, number>>; obj: RaidObjective; n: Partial<Record<EnemyKind, number>>; bonus: number },
    // The raid in the air: its id, aircraft left, objective still held, reward so far, bearing, objective, name.
    raidId: 0, raidLeft: 0, raidClean: true, raidReward: 0, raidA: 0, raidObj: 'battery' as RaidObjective, raidName: '',
    // debrief counters
    stats: { kills: {} as Partial<Record<EnemyKind, number>>, dmg: {} as Record<string, number>, taken: {} as Partial<Record<EnemyKind, number>>, raids: 0, clean: 0, armsEvaded: 0, radarHits: 0, drops: 0, recovered: 0, perim: {} as Partial<Record<PerimKind, number>>,
      // Every unit that scored, by id (kept after it's sold), and how each level went: time, kills, HP lost, result.
      units: {} as Record<number, { k: PerimKind; name: string; kills: number }>,
      levels: [] as { name: string; t: number; kills: number; hp: number; end: 'held' | 'lost' | 'fell' }[],
      lvKills: 0, lvHp: 0 }, // kills and HP lost when this level started
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
  putPad(s, 'mg', START_PAD.x, START_PAD.z, 0);
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
  const loop = i - LEVELS.length; // packages and jammers get likelier every level past the scripted ones
  w.ew = (w.ew ?? 0) + Math.min(EW_MAX, EW_GROW * (loop + 1));
  return { name: mod.name, desc: mod.desc, w, mod, pk: Math.min(PK_MAX, (last.pk ?? 0) + PK_GROW * (loop + 1)), arc: Math.PI };
}
// Half-width around FRONT that flank threats can come from in level i.
export const flankArc = (i: number) => Math.max(FRONT_ARC, stageInfo(i).arc ?? 0);
// Bearing for a group of `kinds` from one uniform draw `r`: the front, unless everything in it can fly round the
// flanks (an escort jammer goes wherever its group does). One draw per bearing keeps the seeded streams in step.
export function spawnBearing(i: number, kinds: EnemyKind[], r: number) {
  const flank = kinds.every(k => k === 'ew' || ENEMIES[k].flank) && kinds.some(k => k !== 'ew');
  return FRONT + (r * 2 - 1) * (flank ? flankArc(i) : FRONT_ARC);
}
export const phaseName = (s: State) => s.training ? `T${s.stage + 1} ${TRAINING[s.stage].name}` : `L${s.stage + 1} ${phase(s).name}`;
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
// What the operator sees: an unclassified decoy passes for what it copies (a Gerbera for a Shahed, a Kh-55 for a Kh-101).
export const shownKind = (e: Enemy): EnemyKind => ENEMIES[e.kind].mimic && !e.ided ? ENEMIES[e.kind].mimic! : e.kind;
// The flight profile a type flies: a decoy flies the one it copies, so it can't give itself away.
const flies = (k: EnemyKind) => ENEMIES[k].mimic ?? k;
const angDiff = (a: number, b: number) => ((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI;

// The Mi-8s on station and their bearings. A radar pass works this out once, not once per contact it looks at.
type Jams = { j: Enemy; a: number }[];
function jamBearings(s: State): Jams {
  const out: Jams = [];
  for (const j of s.enemies) if (j.kind === 'ew' && j.orbit) out.push({ j, a: Math.atan2(j.z, j.x) });
  return out;
}
// Detection multiplier at `e`: every Mi-8 on station blanks a sector around its own bearing (but not itself).
export function jamFactor(s: State, e: { x: number; z: number }, jams = jamBearings(s)) {
  let f = 1;
  if (!jams.length) return f;
  const a = Math.atan2(e.z, e.x);
  for (const { j, a: b } of jams) if (j !== e && Math.abs(angDiff(a, b)) < EW_ARC) f *= EW_JAM;
  return f;
}
// Spotted for: inside the sector of an Orlan-10 on station (its own bearing ± RECON.arc), not the Orlan itself.
export function spotted(s: State, e: { x: number; z: number }) {
  const a = Math.atan2(e.z, e.x);
  return s.enemies.some(r => r.kind === 'recon' && r.orbit && r !== e && Math.abs(angDiff(a, Math.atan2(r.z, r.x))) < RECON.arc);
}
// Radar horizon and clutter: how a contact's height (and the ground under a low one) changes what the radar gets.
// Returns the detection chance x, 0 when it's below the horizon at this range (r2: the radar's range, squared).
export function horizonMask(e: Enemy, r2: number) {
  const alt = flightAlt(e), h = horizon(alt), d2 = e.x * e.x + e.z * e.z;
  if (d2 > r2 * h * h) return 0;
  if (alt >= MASK.alt) return 1;
  const g = ground(e.x, e.z);
  return g === 'forest' || g === 'rock' ? MASK.sig : 1;
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
  return (s.lv[id] ?? 0) >= u.max || lockReason(s, id) ? Infinity : Math.round(u.base * u.mult ** (s.lv[id] ?? 0) * (DOCTRINES.find(d => d.id === s.doctrine)!.price ?? 1));
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
  const n = s.lv[id], u = UPGRADES.find(u => u.id === id)!;
  s.events.push({ k: 'upgrade', id, n, star: u.max === Infinity && !PERIM_KINDS.includes(id as PerimKind) && n % MILESTONE === 0 });
  purchased(s);
  return true;
}
// Buys to the next rank of an open-ended upgrade (0 when it has no ranks).
export const toRank = (s: State, id: string) => {
  const u = UPGRADES.find(u => u.id === id)!, n = s.lv[id] ?? 0;
  return u.max === Infinity && !PERIM_KINDS.includes(id as PerimKind) ? (rank(n) + 1) * MILESTONE - n : 0;
};
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

function putPad(s: State, k: PerimKind, x: number, z: number, paid: number) {
  s.perim.push({ k, x, z, a: Math.atan2(z, x), slot: s.padSeq++, cd: 0, belt: MG_BELT.rounds, hp: PAD_HP, tier: 0, paid, down: false, site: site(x, z), kills: 0 });
}
// Why a unit can't stand at (x, z), or '' if it can. `self`: the unit being moved (its own spot doesn't count).
export function buildBlock(s: State, x: number, z: number, self = -1) {
  const d = Math.hypot(x, z);
  if (d < BUILD_MIN) return 'BASE COMPOUND';
  if (d > buildR(s.level)) return 'OUTSIDE BUILD ZONE';
  const g = ground(x, z);
  if (g === 'water' || g === 'rock' || g === 'forest') return g.toUpperCase();
  if (s.perim.some(p => p.slot !== self && (p.x - x) ** 2 + (p.z - z) ** 2 < PAD_GAP * PAD_GAP)) return 'TOO CLOSE';
  return '';
}
export const beltOf = (p: { x: number; z: number }) => beltAt(p.x, p.z);
// Open spots the auto-placer and the bots choose from: rings 2.5 m apart, about 3 m apart along each ring.
export function freeSpots(s: State, self = -1) {
  const out: { x: number; z: number }[] = [];
  for (let r = BUILD_MIN + 0.5; r <= buildR(s.level); r += 2.5) {
    const n = Math.floor(TAU * r / 3);
    for (let i = 0; i < n; i++) {
      const a = FRONT + i / n * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!buildBlock(s, x, z, self)) out.push({ x, z });
    }
  }
  return out;
}
// Where a click at (x, z) puts a unit: right there (on a half-metre grid) if the ground is open, else the
// nearest open spot within 4 m (fingers are fat), else nowhere.
export function spotNear(s: State, x: number, z: number, self = -1) {
  const gx = Math.round(x * 2) / 2, gz = Math.round(z * 2) / 2;
  if (!buildBlock(s, gx, gz, self)) return { x: gx, z: gz };
  let best: { x: number; z: number } | undefined, bd = 16;
  for (const q of freeSpots(s, self)) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; best = q; } }
  return best;
}
const up = (p: Pad) => !p.down;
// Range and eyes x for a unit on this ground: further from high ground, shorter from the treeline.
const siteRange = (t: Site) => t === 'high' ? TERRAIN.high.range : t === 'treeline' ? TERRAIN.treeline.range : 1;
// Inside the unit's range and field of fire.
export const covers = (p: { x: number; z: number; a: number; k: PerimKind }, x: number, z: number, range: number) =>
  (x - p.x) ** 2 + (z - p.z) ** 2 <= range * range && Math.abs(angDiff(Math.atan2(z - p.z, x - p.x), p.a)) <= FANS[p.k];
const nearAmmo = (s: State, p: Pad) => s.perim.some(q => q.k === 'ammo' && up(q) && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 <= AMMO_R ** 2);
// What a unit fires with right now: its tier, the battery's weapon upgrades and perks, an ammo point in reach.
export function padStats(s: State, p: Pad) {
  const w = p.k === 'mg' ? MG_TIERS[p.tier] : PERIM[p.k], v = VETERANCY[vetRank(p.kills)];
  return { ...w, range: w.range * siteRange(p.site) * v.range, dmg: w.dmg * s.st.padDmg * v.dmg, rate: w.rate * s.st.padRate * v.rate * (nearAmmo(s, p) ? AMMO_RATE : 1) * (overdrive(s) ? OVERDRIVE.rate : 1) };
}
// A gun that's up but can't fire: the interceptor pool is short of a round for it (MGs feed from their belts).
export const noAmmo = (s: State, p: Pad) => GUNS.includes(p.k) && up(p) && s.ammo < padStats(s, p).ammo;
// A cruise missile goes for the unit you've sunk the most into (the nearest of equals; one on high ground stands out,
// one at the treeline it can't find), or the base if there's none.
export function cruiseTarget(s: State, e: { x: number; z: number }) {
  let best: Pad | undefined, bv = -Infinity;
  for (const p of s.perim) {
    if (p.down || p.site === 'treeline') continue;
    const v = (p.paid + (p.site === 'high' ? TERRAIN.high.value : 0)) * 1000 - Math.hypot(p.x - e.x, p.z - e.z);
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
export function spotScore(s: State, k: PerimKind, x: number, z: number) {
  const p = { k, x, z, a: Math.atan2(z, x) };
  const guns = s.perim.filter(q => GUNS.includes(q.k) && up(q));
  if (k === 'ammo') return guns.filter(q => (q.x - x) ** 2 + (q.z - z) ** 2 <= AMMO_R ** 2).length + 0.01 * Math.hypot(x, z);
  if (k === 'observer') return guns.filter(q => (q.x - x) ** 2 + (q.z - z) ** 2 <= OBSERVER_EYES ** 2).length + 0.05 * Math.hypot(x, z);
  // Bearings across the threat arc: one it covers that nothing covers yet is worth 1, crossfire on a covered one 0.3.
  const range = (k === 'mg' ? MG_TIERS[0].range : PERIM[k].range) * siteRange(site(x, z)), arc = Math.min(Math.PI, Math.max(FRONT_ARC, flankArc(s.stage)) + 0.2);
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
export function bestSpot(s: State, k: PerimKind) {
  let best: { x: number; z: number } | undefined, bv = -Infinity;
  for (const q of freeSpots(s)) { const v = spotScore(s, k, q.x, q.z); if (v > bv) { bv = v; best = q; } }
  return best;
}
// How many working guns cover a point: 0 is a gap, 2+ is crossfire. The coverage overlay [O] maps it.
export function coverage(s: State) {
  const guns = s.perim.filter(p => GUNS.includes(p.k) && up(p)).map(p => ({ p, r: padStats(s, p).range }));
  return (x: number, z: number) => guns.reduce((n, { p, r }) => n + +covers(p, x, z, r), 0);
}

// Build the pending unit where the player clicked (or the nearest open spot).
export function placePad(s: State, x: number, z: number) {
  if (!s.placing) return false;
  const q = spotNear(s, x, z);
  if (!q) return false;
  putPad(s, s.placing.k, q.x, q.z, s.placing.paid);
  s.placing = null;
  s.events.push({ k: 'buy' });
  return true;
}
export const selectedPad = (s: State) => s.perim.find(p => p.slot === s.selected);
// Click on one of your units: pick it (to upgrade, sell or move).
export function selectPad(s: State, x: number, z: number) {
  const p = s.perim.find(p => (p.x - x) ** 2 + (p.z - z) ** 2 < 2.5 * 2.5);
  s.selected = p ? p.slot : -1;
  s.relocating = false;
  return !!p;
}
// Arm a move order for the picked unit: the next click on open ground moves it there.
export function toggleRelocate(s: State) { s.relocating = !s.relocating && !!selectedPad(s); }
// Move the picked unit to open ground at (x, z): free in the build window, 5 s offline otherwise.
export function movePad(s: State, x: number, z: number) {
  const p = selectedPad(s), q = p && spotNear(s, x, z, p.slot);
  if (!p || !q) return false;
  Object.assign(p, { x: q.x, z: q.z, a: Math.atan2(q.z, q.x), cd: building(s) ? 0 : MOVE_TIME, site: site(q.x, q.z) });
  s.relocating = false;
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
  s.selected = -1; s.relocating = false;
  s.events.push({ k: 'padSold', x: p.x, z: p.z, n, kind: p.k });
  return true;
}

// ---------- salvage ----------

// A kill of `kind` at (x, z) may leave salvage. `r` is the roll (Math.random: play decides kills, so this can't
// be allowed near the seeded streams).
export function rollDrop(s: State, kind: EnemyKind, x: number, z: number, r = Math.random) {
  if (r() >= ENEMIES[kind].drop || s.drops.length >= DROP_MAX) return undefined;
  const heavy = ENEMIES[kind].reward >= DROP_HEAVY, w = (k: DropKind) => DROPS[k].w * (heavy ? DROPS[k].heavy : 1);
  let t = r() * DROP_KINDS.reduce((a, k) => a + w(k), 0), k: DropKind = 'cache';
  for (const d of DROP_KINDS) { t -= w(d); if (t <= 0) { k = d; break; } }
  return spawnDrop(s, k, x, z, ENEMIES[kind].reward);
}
export function spawnDrop(s: State, k: DropKind, x: number, z: number, v = 10) {
  const d: Drop = { id: ++s.stats.drops, k, x, z, v }; // own counter: enemy ids stay as they were
  s.drops.push(d);
  s.events.push({ k: 'drop', x, z, drop: k });
  return d;
}
// Open-ended upgrades SALVAGED TECH can hand out: owned or buyable right now, never a pad.
export const techPool = (s: State) => UPGRADES.filter(u => u.max === Infinity && !PERIM_KINDS.includes(u.id as PerimKind) && !lockReason(s, u.id)).map(u => u.id);
// Click near salvage: recover it. Returns whether anything was picked up.
export function collectDrop(s: State, x: number, z: number) {
  if (s.phase !== 'play') return false;
  let best: Drop | undefined, bd = DROP_GRAB * DROP_GRAB;
  for (const d of s.drops) { const dd = (d.x - x) ** 2 + (d.z - z) ** 2; if (dd < bd) { bd = dd; best = d; } }
  if (!best) return false;
  s.drops.splice(s.drops.indexOf(best), 1);
  s.stats.recovered++;
  let n = 0, id = '';
  switch (best.k) {
    case 'cache': n = Math.round((CACHE.flat + CACHE.reward * best.v) * s.st.credits); s.credits += n; s.earned += n; break;
    case 'ammo': s.ammo = s.st.ammoCap; break;
    case 'power': s.power = s.st.powerCap; break;
    case 'repair': s.hp = Math.min(s.st.maxHp, s.hp + s.st.maxHp * REPAIR_DROP); for (const p of s.perim) { p.hp = PAD_HP; p.down = false; } break;
    case 'overdrive': s.overdriveUntil = Math.max(s.overdriveUntil, s.t) + OVERDRIVE.time; break;
    case 'tech': {
      // A free level: doesn't count toward the base level, like a doctrine's. Nothing open yet: credits instead.
      const pool = techPool(s);
      if (pool.length) { id = pool[Math.floor(Math.random() * pool.length)]; s.lv[id] = (s.lv[id] ?? 0) + 1; refreshStats(s); }
      else { n = Math.round(200 * s.st.credits); s.credits += n; s.earned += n; }
      break;
    }
  }
  s.events.push({ k: 'pickup', x: best.x, z: best.z, drop: best.k, n, id });
  return true;
}
export const overdrive = (s: State) => s.t < s.overdriveUntil;

export function pickPerk(s: State, i: number) {
  if (s.phase !== 'perk' || !s.perkChoices[i]) return;
  s.perks.push(s.perkChoices[i]);
  s.perkChoices = [];
  refreshStats(s);
  s.phase = 'play';
}

function refreshStats(s: State) {
  const oldMax = s.st.maxHp;
  s.st = deriveStats(s.lv, s.perks, s.level, s.doctrine);
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
    // Nobody picked a spot: where it adds the most.
    const q = bestSpot(s, s.placing.k);
    if (q) placePad(s, q.x, q.z);
  }
  moveShots(s, dt);
  const ls = lastStand(s);
  if (ls !== s.lastStand) { s.lastStand = ls; if (ls) s.events.push({ k: 'lastStand' }); }
  if (s.training) s.hp = Math.max(1, s.hp); // training can't be lost
  if (s.hp <= 0) {
    s.hp = 0; s.phase = 'over';
    if (building(s)) s.stats.levels[s.stats.levels.length - 1].end = 'fell'; // between levels: the one just fought
    else logLevel(s, 'fell');
    s.events.push({ k: 'over' });
  }
}

export function spawnEnemy(s: State, kind: EnemyKind, a: number, r = ARENA_R + 2, rnd = Math.random) {
  const T = ENEMIES[kind], d = difficulty(s.t);
  const hp = T.hp * d.hp * (phase(s).mod.hp ?? 1), speed = T.speed * d.speed * (0.9 + rnd() * 0.2);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  s.enemies.push({
    id: s.nextId++, kind, x, z, vx: -Math.cos(a) * speed, vz: -Math.sin(a) * speed,
    hp, maxHp: hp, speed, dmg: T.dmg * d.dmg,
    reward: T.reward, size: T.size, seenUntil: -1, locked: false, incoming: 0, wob: rnd() * TAU,
    born: s.t, cd: kind === 'tank' ? 1 : kind === 'scout' ? LANCET.time : kind === 'recon' ? RECON.time : 3, act: 'in',
    ammo: kind === 'tank' ? HELO.ammo : kind === 'ka52' ? KA52.ammo : kind === 'su25' ? SU25.passes : kind === 'sead' ? SEAD.ammo : kind === 'elite' ? (s.stage <= ELITE_FROM ? KAB_FIRST : KAB_PAIR) : 0,
    wx: NaN, wz: NaN, aim: NaN, lockT: 0, ided: false, orbit: false, raid: 0, pkg: 0, hold: kind === 'ew' ? a : kind === 'sead' ? SEAD.time : NaN, tgt: -1, pop: 0,
  });
  const e = s.enemies[s.enemies.length - 1];
  if (flies(kind) === 'cruise') {
    e.tgt = cruiseTarget(s, e)?.slot ?? -1;
    // Routed through a waypoint off its launch bearing, so it turns in on its target from somewhere else.
    const w = a + (rnd() < 0.5 ? -CRUISE_DOGLEG : CRUISE_DOGLEG);
    e.wx = Math.cos(w) * r * 0.7; e.wz = Math.sin(w) * r * 0.7;
  }
  // ESM / early warning hears the launch, radar or not (a cruise missile's warning says what it's going for). A Kinzhal
  // is a ballistic launch; a Kh-55 decoy is announced as the cruise missile it copies.
  const heard = ENEMIES[kind].ballistic ? 'tbm' : ARMS.includes(kind) ? 'arm' : flies(kind);
  if (heard === 'arm' || heard === 'tbm' || heard === 'cruise') s.events.push({ k: heard, x, z, n: e.tgt, kind });
  return e;
}

// Packs of `kind` a group of `n` brings at `scale`. One escort jammer is enough, however big the group.
export const groupCount = (kind: EnemyKind, n: number, scale: number) => kind === 'ew' ? n : Math.max(1, Math.round(n * scale));

// A group flying in together from bearing `a`, in rows, counts in packs. Escort jammers hold its bearing.
function spawnGroup(s: State, g: Partial<Record<EnemyKind, number>>, a: number, scale: number, rw: () => number) {
  const id = s.nextPkg++, out: Enemy[] = [];
  let row = 0;
  for (const [kind, n] of Object.entries(g) as [EnemyKind, number][]) {
    const count = groupCount(kind, n, scale);
    for (let i = 0; i < count; i++, row++) for (let j = 0; j < ENEMIES[kind].pack; j++) {
      const e = spawnEnemy(s, kind, a + (rw() - 0.5) * 0.35, ARENA_R + 2 + row * 1.5 + rw() * 2, rw);
      e.pkg = id;
      // The escort goes in ahead, on the axis, so it's on station jamming before the package is in radar range.
      // Two or more stand side by side, their sectors edge to edge, but never further off the front than the group.
      if (kind === 'ew') {
        const lim = Math.max(FRONT_ARC, Math.abs(angDiff(a, FRONT))), h = FRONT + Math.max(-lim, Math.min(lim, angDiff(a + (i - (count - 1) / 2) * EW_ARC * 1.6, FRONT)));
        e.hold = h; e.x = Math.cos(h) * (EW_ORBIT + 6); e.z = Math.sin(h) * (EW_ORBIT + 6);
      }
      out.push(e);
    }
  }
  return out;
}

export const spawnGroupAt = (s: State, g: Partial<Record<EnemyKind, number>>, a: number, scale: number) => spawnGroup(s, g, a, scale, Math.random); // for the checks
// The level's raid has resolved: build window, then the next level.
// The debrief's line for the level in progress: how long it took, kills, HP lost, and how it ended.
function logLevel(s: State, end: 'held' | 'lost' | 'fell') {
  const S = s.stats, hp = Object.values(S.taken).reduce((a, b) => a + b, 0);
  S.levels.push({ name: phaseName(s), t: s.t - s.stageAt, kills: s.kills - S.lvKills, hp: hp - S.lvHp, end });
  S.lvKills = s.kills; S.lvHp = hp;
}
function endStage(s: State, held: boolean, n = held ? BUILD_TIME : BUILD_LOST) {
  logLevel(s, held ? 'held' : 'lost');
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
  s.stageAt = s.t; s.drill = 0;
  if (s.training) grant(s, TRAINING[s.stage].grant ?? []);
  s.events.push({ k: 'stage', name: phaseName(s) });
}
// Training hands out what a wave teaches: free levels that don't count toward the base level.
function grant(s: State, ids: string[]) {
  for (const id of ids) {
    if (s.lv[id]) continue;
    s.lv[id] = 1;
    if (id === 'radar' || id === 'pac3') s.events.push({ k: id === 'radar' ? 'radarOnline' : 'pac3' });
  }
  refreshStats(s);
}
// Training: the wave's script, then a short build window once the sky is clear. After the last wave, it's done.
function drill(s: State) {
  const w = TRAINING[s.stage], rw = () => rand(s.world);
  for (; s.drill < w.spawns.length && s.t - s.stageAt >= w.spawns[s.drill].at; s.drill++) {
    const { kind, n, off = 0, r = ARENA_R + 2 } = w.spawns[s.drill], a = FRONT + off;
    for (let i = 0; i < n * ENEMIES[kind].pack; i++) spawnEnemy(s, kind, a + (rw() - 0.5) * 0.15, r + i * 1.5, rw);
  }
  if (s.drill < w.spawns.length || s.enemies.length) return;
  if (s.stage + 1 < TRAINING.length) { endStage(s, true, TRAINING_BUILD); return; }
  s.phase = 'over';
  s.events.push({ k: 'trained' });
}

function spawn(s: State, dt: number) {
  if (building(s)) { if (s.t >= s.buildUntil) nextStage(s); else return; }
  if (s.training) return drill(s);
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
    const a = spawnBearing(s.stage, [kind], rw()), P = ENEMIES[kind].packs;
    const n = P ? P[0] + Math.floor(rw() * (P[1] - P[0] + 1)) : ENEMIES[kind].pack; // only a ranged pack draws, so other spawns keep their streams
    for (let i = 0; i < n; i++) spawnEnemy(s, kind, a + (rw() - 0.5) * 0.15, ARENA_R + 2 + rw() * 6, rw);
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

// Unit isolation for the FPV hunt: how many other working guns cover each unit's spot, by slot.
function isolation(s: State) {
  const guns = s.perim.filter(p => GUNS.includes(p.k) && up(p)).map(p => ({ p, r: padStats(s, p).range }));
  const out = new Map<number, number>();
  for (const p of s.perim) out.set(p.slot, guns.reduce((n, g) => n + +(g.p !== p && covers(g.p, p.x, p.z, g.r)), 0));
  return out;
}
// The unit a Ka-52 or Su-25 fires on: the nearest one up within `reach` that the treeline doesn't hide, else the battery.
export function nearestUnit(s: State, e: { x: number; z: number }, reach: number) {
  let best: Pad | undefined, bd = reach ** 2;
  for (const p of s.perim) {
    const d = (p.x - e.x) ** 2 + (p.z - e.z) ** 2;
    if (!p.down && p.site !== 'treeline' && d < bd) { bd = d; best = p; }
  }
  return best;
}

function moveEnemies(s: State, dt: number) {
  const armor = 1 - s.st.armor;
  // Bearings of the Orlan-10s on station: Lancets and FPVs in their sectors search further for your units.
  const spots: number[] = [];
  for (const r of s.enemies) if (r.kind === 'recon' && r.orbit) spots.push(Math.atan2(r.z, r.x));
  const inSpot = (e: Enemy) => { if (!spots.length) return false; const a = Math.atan2(e.z, e.x); return spots.some(b => Math.abs(angDiff(a, b)) < RECON.arc); };
  let iso: Map<number, number> | null = null; // worked out once a frame, only if an FPV is looking
  for (let i = s.enemies.length - 1; i >= 0; i--) {
    const e = s.enemies[i];
    const d = Math.hypot(e.x, e.z) || 1;
    const nx = -e.x / d, nz = -e.z / d;
    const fk = flies(e.kind); // decoys fly what they copy
    // Below, each flight mode sets the velocity it wants; steer() then flies the airframe toward it.
    const pvx = e.vx, pvz = e.vz;
    let homing = 0; // 1: homing on a unit or waypoint, 2: close enough to fly straight at it
    const arm = ARMS.includes(e.kind);
    if (e.pop > 0) e.pop -= dt;
    if (arm) {
      steerArm(s, e, dt);
      // Out of motor, or veered off past the arena: it's gone.
      if (s.t - e.born > (e.kind === 'arm2' ? ARM2.life : ARM_LIFE) || d > ARENA_R + 12) {
        if (d < ARENA_R) s.events.push({ k: 'hit', x: e.x, z: e.z, n: 2 });
        s.stats.armsEvaded++;
        removeAt(s, i); continue;
      }
    } else if (e.act === 'egress') {
      // Heading home: straight out, and gone at the rim. A Su-25 with a pass left breaks away, banks round far enough
      // out and comes back in for the next one.
      const sp = e.speed * EGRESS_SPEED;
      e.vx = -nx * sp; e.vz = -nz * sp;
      if (e.kind === 'su25' && e.ammo > 0 && d > SU25.turn) e.act = 'in';
      else if (d > ARENA_R + 4) { removeAt(s, i); continue; }
    } else {
      // Ballistic missiles fly a straight path, then jink hard (and a Kinzhal speeds up) on the way down.
      const T = TERMINAL[e.kind], term = !!T && d < T.r;
      const wobble = T ? (term ? T.jink : 0) : ENEMIES[e.kind].wobble;
      const wob = weave(s.t, T ? 5 : 2, e.wob) * wobble * Math.min(1, d / 20);
      let sp = e.speed * (e.kind !== 'elite' && jammed(s, e) ? JAM_SLOW : 1) * (term ? T.boost : 1);
      // Shaheds pitch over into a dive for the last stretch; a Gerbera flies the same profile, so it doesn't give itself away.
      if (fk === 'drone' && d < SHAHED_DIVE) e.act = 'dive';
      if (e.act === 'dive' && fk !== 'cruise') sp *= DIVE_SPEED;
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
      // Orlan-10: circles the battery high up, spotting for everything in its sector, until it has to go home.
      if (e.kind === 'recon' && (e.orbit || d <= RECON.orbit)) {
        if (!e.orbit) { e.orbit = true; s.events.push({ k: 'spot', x: e.x, z: e.z }); }
        const dir = e.wob < Math.PI ? 1 : -1, pull = (d - RECON.orbit) * 0.5;
        e.vx = -nz * dir * sp + nx * pull;
        e.vz = nx * dir * sp + nz * pull;
        if ((e.cd -= dt) <= 0) { e.act = 'egress'; e.orbit = false; s.events.push({ k: 'egress', x: e.x, z: e.z, kind: e.kind }); }
      }
      // Mi-28: stops at standoff and hovers, firing ATGMs, then goes home once it's out of them.
      if (e.kind === 'tank' && d <= HELO.standoff) {
        e.act = 'hover';
        const drift = weave(s.t, 0.7, e.wob) * sp * 0.2;
        e.vx = -nz * drift; e.vz = nx * drift;
        if ((e.cd -= dt) <= 0) {
          e.cd = HELO.every;
          launch(s, e, 'atgm', d);
          if (--e.ammo <= 0) { e.act = 'egress'; s.events.push({ k: 'egress', x: e.x, z: e.z, kind: e.kind }); }
        }
      }
      // Ka-52: settles at standoff (exposed while it does), then hovers masked in the trees, strafing sideways, and
      // pops up to fire an ATGM pair at the nearest unit in reach (the battery if none), then drops back down.
      if (e.kind === 'ka52' && (e.act === 'hover' || d <= KA52.standoff)) {
        if (e.act !== 'hover') { e.act = 'hover'; e.cd = e.pop = KA52.settle; s.events.push({ k: 'settle', x: e.x, z: e.z, kind: e.kind }); }
        const drift = weave(s.t, 0.5, e.wob) * sp * KA52.strafe, pull = (KA52.standoff - d) * 0.5;
        e.vx = -nz * drift - nx * pull; e.vz = nx * drift - nz * pull;
        if ((e.cd -= dt) <= 0) {
          e.cd = KA52.every; e.pop = KA52.pop;
          const p = nearestUnit(s, e, KA52.reach);
          for (let n = 0; n < KA52.salvo && e.ammo > 0; n++, e.ammo--) launch(s, e, 'atgm', d, (n - (KA52.salvo - 1) / 2) * 0.05, p?.slot ?? -1);
          if (e.ammo <= 0) { e.act = 'egress'; s.events.push({ k: 'egress', x: e.x, z: e.z, kind: e.kind }); }
        }
      }
      // Su-25 attack run: at SU25.release it pops up, flares out, fires an S-8 salvo at the nearest unit in reach (the
      // battery if none) and breaks away (egress, above), coming round again while it has passes left.
      if (e.kind === 'su25' && e.act === 'in' && d <= SU25.release) {
        const p = nearestUnit(s, e, SU25.reach);
        for (let n = 0; n < SU25.salvo; n++) launch(s, e, 'rocket', d, (n - (SU25.salvo - 1) / 2) * SU25.spread, p?.slot ?? -1);
        e.pop = SU25.pop; e.ammo--; e.act = 'egress';
        s.events.push({ k: 'egress', x: e.x, z: e.z, kind: e.kind, n: e.ammo });
      }
      // Su-35S SEAD: holds station out on the front, circling, and fires Kh-58s while the radar radiates; home once
      // it's out of them or has waited long enough.
      if (e.kind === 'sead' && (e.orbit || d <= SEAD.standoff)) {
        e.orbit = true;
        const dir = e.wob < Math.PI ? 1 : -1, pull = (d - SEAD.standoff) * 0.5;
        e.vx = -nz * dir * sp + nx * pull; e.vz = nx * dir * sp + nz * pull;
        if ((e.cd -= dt) <= 0 && emitting(s)) { e.cd = SEAD.every * radarMode(s).armEvery; launch(s, e, 'arm2', d); e.ammo--; }
        if (e.ammo <= 0 || (e.hold -= dt) <= 0) { e.act = 'egress'; e.orbit = false; s.events.push({ k: 'egress', x: e.x, z: e.z, kind: e.kind }); }
      }
      // Su-34: releases its pair of glide bombs from standoff, then turns for home.
      if (e.kind === 'elite' && e.ammo > 0 && d <= KAB_R) {
        for (; e.ammo > 0; e.ammo--) launch(s, e, 'kab', d, (e.ammo - 1.5) * 0.06);
        e.act = 'egress'; s.events.push({ k: 'egress', x: e.x, z: e.z, kind: e.kind });
      }
      // Lancet: circles a while out there, searching, then dives on the battery (or on a unit it spots, below).
      if (e.kind === 'scout' && e.act !== 'dive' && d <= LANCET.loiter) {
        e.act = 'loiter';
        const dir = e.wob < Math.PI ? 1 : -1, pull = (LANCET.loiter - d) * 0.8;
        e.vx = -nz * dir * sp - nx * pull; e.vz = nx * dir * sp - nz * pull;
        if ((e.cd -= dt) <= 0) e.act = 'dive';
      }
    }
    // Su-34s loose Kh-31Ps at a radiating radar once in range, on the way in or out.
    if (e.kind === 'elite' && (e.cd -= dt) <= 0 && d < ARM_LAUNCH_R * radarMode(s).armR && emitting(s)) {
      e.cd = ARM_EVERY * radarMode(s).armEvery;
      launch(s, e, 'arm', d);
    }
    // Cruise missile (and the decoy flying as one): weaves in on its unit (a new one if that's down or gone) low over
    // the ground, then over the last stretch jinks hard, speeds up and pops up to dive on it, and knocks it out. No
    // unit up: the base. The decoy does nothing when it gets there.
    if (fk === 'cruise') {
      let p = s.perim.find(q => q.slot === e.tgt && !q.down);
      if (!p && e.tgt >= 0) { p = cruiseTarget(s, e); e.tgt = p?.slot ?? -1; }
      if (!Number.isNaN(e.wx) && (e.wx - e.x) ** 2 + (e.wz - e.z) ** 2 < 9) e.wx = e.wz = NaN; // past the dogleg
      const wp = Number.isNaN(e.wx) ? p ?? { x: 0, z: 0 } : { x: e.wx, z: e.wz };
      const dx = wp.x - e.x, dz = wp.z - e.z, dd = Math.hypot(dx, dz) || 1;
      if (p && wp === p && dd < 1.2) { // one hit takes a unit down
        if (e.dmg > 0) hitPad(s, p, PAD_HP); else s.events.push({ k: 'dud', x: e.x, z: e.z });
        removeAt(s, i); continue;
      }
      homing = dd < HOMING_SNAP * 2 ? 2 : 1;
      const term = Number.isNaN(e.wx) && dd < CRUISE_TERMINAL.r;
      if (term) e.act = 'dive';
      // Terminal jinks die away over the last few metres, so it still connects.
      const w = weave(s.t, term ? 5 : 2, e.wob) * (term ? CRUISE_TERMINAL.jink * Math.min(1, dd / 4) : ENEMIES.cruise.wobble * Math.min(1, dd / 20));
      const sp = e.speed * (term ? CRUISE_TERMINAL.speed : 1);
      e.vx = dx / dd * sp - dz / dd * w; e.vz = dz / dd * sp + dx / dd * w;
    }
    // A Ka-52's ATGM or a Su-25's rocket flies at the unit it was fired at (the base if that's down by then).
    if (ENEMIES[e.kind].padHit && e.tgt >= 0) {
      const p = s.perim.find(q => q.slot === e.tgt && !q.down);
      if (!p) e.tgt = -1;
      else {
        const dx = p.x - e.x, dz = p.z - e.z, dd = Math.hypot(dx, dz) || 1;
        if (dd < 1) { hitPad(s, p, e.dmg * ENEMIES[e.kind].padHit! * (spotted(s, e) ? RECON.dmg : 1)); removeAt(s, i); continue; }
        homing = dd < HOMING_SNAP ? 2 : 1;
        e.vx = dx / dd * e.speed; e.vz = dz / dd * e.speed;
      }
    }
    // Lancets hunt: they dive, fast, on any unit they spot within LANCET.seek, whatever its belt. FPVs go for the
    // most isolated unit within SWARM.seek (fewest other guns covering it). High ground is on the skyline (spotted
    // from further out); the treeline hides a unit from both. An Orlan-10 spotting their sector stretches the search.
    if (e.kind === 'scout' || e.kind === 'swarm') {
      const lancet = e.kind === 'scout', r = (lancet ? LANCET.seek : SWARM.seek) * (inSpot(e) ? RECON.seek : 1);
      if (!lancet && !iso) iso = isolation(s);
      let tgt: Pad | undefined, bd = Infinity, bi = Infinity;
      for (const p of s.perim) {
        if (p.down || p.site === 'treeline') continue;
        const n = lancet ? 0 : iso!.get(p.slot)!;
        if (n > SWARM.isolated) continue;
        const dd = (p.x - e.x) ** 2 + (p.z - e.z) ** 2, rr = r * (p.site === 'high' ? TERRAIN.high.dive : 1);
        if (dd < rr * rr && (n < bi || n === bi && dd < bd)) { bd = dd; bi = n; tgt = p; }
      }
      if (tgt && bd < 1) { hitPad(s, tgt, e.dmg * (inSpot(e) ? RECON.dmg : 1)); removeAt(s, i); continue; }
      if (tgt) {
        const dd = Math.sqrt(bd), sp = e.speed * DIVE_SPEED;
        e.act = 'dive';
        e.vx = (tgt.x - e.x) / dd * sp; e.vz = (tgt.z - e.z) / dd * sp;
        homing = dd < HOMING_SNAP ? 2 : 1;
      }
    }
    if (!arm && homing < 2) steer(e, pvx, pvz, dt, homing ? HOMING_BOOST : 1);
    e.x += e.vx * dt; e.z += e.vz * dt;
    if (d < BASE_R + e.size * 0.5) {
      // Objective lost: PROTECT BATTERY by anything of the raid landing, PROTECT RADAR by any ARM hit while it's on.
      if (s.raidClean && s.raidLeft && (s.raidObj === 'radar' ? arm : e.raid === s.raidId && e.dmg > 0)) raidLost(s);
      if (arm && s.st.radar) {
        const stun = ARM_STUN * s.st.armStun * (e.kind === 'arm2' ? ARM2.stun : 1);
        s.radarDownUntil = Math.min(Math.max(s.radarDownUntil, s.t) + stun, s.t + 2 * stun);
        s.events.push({ k: 'radarDown' });
        s.stats.radarHits++;
      }
      if (e.dmg > 0) {
        const dmg = e.dmg * armor * (inSpot(e) ? RECON.dmg : 1); // spotted for: it knows exactly where to hit
        s.hp -= dmg;
        s.stats.taken[e.kind] = (s.stats.taken[e.kind] ?? 0) + dmg;
        s.shake = Math.min(1.5, s.shake + 0.3 + e.dmg / 40);
        s.events.push({ k: 'baseHit', x: e.x, z: e.z, kind: e.kind, n: dmg });
      } else if (ENEMIES[e.kind].mimic) s.events.push({ k: 'dud', x: e.x, z: e.z }); // passed for the real thing right up to impact: say it was a dud
      removeAt(s, i);
    }
  }
}

// A lateral weave that doesn't look machine-made: two tones, the second off the first's beat, each airframe
// on its own phase and a slightly different tempo. Stays within ±1 like the sine it replaces.
function weave(t: number, f: number, ph: number) {
  const k = f * (0.85 + 0.3 * (ph / TAU));
  return 0.75 * Math.sin(t * k + ph) + 0.25 * Math.sin(t * k * 1.73 + ph * 3.1);
}
// Flies `e` from its last velocity (pvx, pvz) toward the one its flight mode asked for (e.vx, e.vz), within its
// airframe's limits (AGILITY): wings swing the heading round at a capped rate, rotors ease the velocity over.
// Turns, pull-outs and the swing for home come out as arcs instead of a snap onto the new course.
function steer(e: Enemy, pvx: number, pvz: number, dt: number, boost: number) {
  const A = AGILITY[e.kind], k = 1 - Math.exp(-A.acc * boost * dt);
  if (A.hover) { e.vx = pvx + (e.vx - pvx) * k; e.vz = pvz + (e.vz - pvz) * k; return; }
  const sp = Math.hypot(pvx, pvz), want = Math.hypot(e.vx, e.vz);
  if (sp < 1e-6) return; // nothing to turn: take the new velocity as it is
  const nsp = sp + (want - sp) * k, ux = pvx / sp, uz = pvz / sp;
  if (want < 1e-6) { e.vx = ux * nsp; e.vz = uz * nsp; return; }
  // Vectors, not angles (this runs for every contact, every tick): within the turn it can make, take the new
  // heading; else rotate the old one by the full turn, toward the new (a reversal turns the way its weave leans).
  const wx = e.vx / want, wz = e.vz / want, dot = ux * wx + uz * wz, t = A.turn * boost * dt;
  if (dot >= 1 - t * t / 2) { e.vx = wx * nsp; e.vz = wz * nsp; return; }
  const cross = ux * wz - uz * wx, side = Math.abs(cross) > 1e-3 ? Math.sign(cross) : e.wob < Math.PI ? 1 : -1;
  const c = Math.cos(t), sn = Math.sin(t) * side;
  e.vx = (ux * c - uz * sn) * nsp; e.vz = (uz * c + ux * sn) * nsp;
}

// Homes on the radar while it radiates. When it goes dark the seeker loses the emitter and the missile
// swings ARM_VEER off its last heading; the turn rate is limited, so a late EMCON still eats the hit.
// A Kh-58 remembers instead: it flies on at where it last heard the radar, off to the side of its path by up to
// ARM2.scatter (its own draw, from e.wob), so it hits only if that's close enough.
function steerArm(s: State, e: Enemy, dt: number) {
  const heard = emitting(s) && (!radarMode(s).lpi || e.x * e.x + e.z * e.z < LPI_R * LPI_R);
  if (heard) { e.aim = NaN; e.wx = e.wz = NaN; }
  else if (e.kind === 'arm2') {
    if (Number.isNaN(e.wx)) {
      const h = Math.atan2(e.vz, e.vx), off = ARM2.scatter * (e.wob / Math.PI - 1); // -scatter..scatter, across its heading
      e.wx = -Math.sin(h) * off; e.wz = Math.cos(h) * off;
    }
    // Past the remembered point it can't see anything to turn toward: straight on until the motor quits.
    if ((e.wx - e.x) * e.vx + (e.wz - e.z) * e.vz > 0) e.aim = Math.atan2(e.wz - e.z, e.wx - e.x);
    else if (Number.isNaN(e.aim)) e.aim = Math.atan2(e.vz, e.vx);
  }
  else if (Number.isNaN(e.aim)) e.aim = Math.atan2(e.vz, e.vx) + (e.wob < Math.PI ? ARM_VEER : -ARM_VEER);
  const h = Math.atan2(e.vz, e.vx), want = Number.isNaN(e.aim) ? Math.atan2(-e.z, -e.x) : e.aim;
  const nh = h + Math.max(-ARM_TURN * dt, Math.min(ARM_TURN * dt, angDiff(want, h)));
  e.vx = Math.cos(nh) * e.speed; e.vz = Math.sin(nh) * e.speed;
}

// A munition `e` fires (ARM, ATGM, glide bomb): from just inside it, on its bearing, and part of its raid.
// tgt: the unit it's fired at (Ka-52 ATGMs), -1 = the battery.
function launch(s: State, e: Enemy, kind: EnemyKind, d: number, off = 0, tgt = -1) {
  const r = { seed: e.id * 7919 + s.nextId }; // seeded off the launcher: a daily's raids end the same way whatever else draws randoms
  const m = spawnEnemy(s, kind, Math.atan2(e.z, e.x) + off, d - 1, () => rand(r));
  m.tgt = tgt;
  if (!ARMS.includes(kind)) s.events.push({ k: 'release', x: e.x, z: e.z, kind, n: tgt }); // ARMs announce themselves (spawnEnemy)
  if (e.raid && e.raid === s.raidId) { m.raid = e.raid; s.raidLeft++; }
  return m;
}

function jammed(s: State, e: Enemy) {
  if (!s.jamming) return false;
  const r2 = PERIM.jammer.range ** 2;
  return s.perim.some(p => p.k === 'jammer' && up(p) && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < r2);
}

const isMissile = (e: Enemy) => MUNITIONS.includes(e.kind) && e.kind !== 'rocket'; // S-8s aren't worth a SAM
// IR seekers (Stinger, IRIS-T) lock harder on a hot target: damage x by its heat signature.
// A Su-25 on its attack run has flares out: IR seekers get SU25.flares of that.
export const irHit = (e: Enemy) => (1 + IR_SEEKER * (ENEMIES[e.kind].ir - 1)) * (e.kind === 'su25' && e.pop > 0 ? SU25.flares : 1);
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
  const ic = interceptActive(s) ? s.enemies.find(e => e.id === s.intercept.target) : undefined;
  guns.forEach((p, gi) => {
    const w = stats[gi];
    p.cd = Math.max(0, p.cd - dt);
    if (p.cd > 0 || s.ammo < w.ammo) return;
    const r2 = w.range ** 2;
    let best: Enemy | null = null, bd = r2, brank = 2;
    for (const e of s.enemies) {
      // Out of reach first: the cheap test, and it rules out most of a big swarm.
      const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2;
      if (d > r2 || !visible(s, e) || e.ided || e.incoming >= e.hp && e !== ic || ENEMIES[e.kind].pacOnly) continue;
      if (ic && e !== ic && (ic.x - p.x) ** 2 + (ic.z - p.z) ** 2 < bd) continue; // intercept target in reach: only it
      const rank = p.k === 'iris' && isMissile(e) ? 0 : 1; // the SAM takes missiles first
      if (!covers(p, e.x, e.z, w.range) || rank > brank || rank === brank && d >= bd) continue;
      bd = d; best = e; brank = rank;
    }
    if (!best) return;
    const t = best;
    s.ammo -= w.ammo; p.cd = 1 / w.rate;
    // Belt empty: reload. Slower out on the forward line, twice as fast with an ammo point in reach or on a road.
    if (p.k === 'mg' && --p.belt <= 0) {
      p.belt = MG_BELT.rounds;
      p.cd = MG_BELT.reload * (nearAmmo(s, p) || p.site === 'road' ? AMMO_RELOAD : beltOf(p) === 'fwd' ? FWD_RELOAD : 1);
    }
    // Crossfire: the target is inside another gun's field of fire as well.
    const dmg = w.dmg * (guns.some((q, qi) => q !== p && covers(q, t.x, t.z, stats[qi].range)) ? 1 + CROSSFIRE : 1) * (p.k === 'stinger' || p.k === 'iris' ? irHit(t) : 1);
    if (p.k === 'mg' || p.k === 'mantis') {
      // 12.7mm / 35mm tracer round, led like the PAC-3 so it actually connects
      const sp = 70, tt = Math.sqrt(bd) / sp;
      const dx = best.x + best.vx * tt - p.x, dz = best.z + best.vz * tt - p.z, d = Math.hypot(dx, dz) || 1;
      s.shots.push({ kind: 'tracer', x: p.x, z: p.z, vx: dx / d * sp, vz: dz / d * sp, dmg, splash: 0, life: w.range / sp + 0.15, target: best.id, src: p.k === 'mg' ? 'MG' : 'MANTIS', pad: p.slot });
      best.incoming += dmg;
      s.events.push({ k: 'gun', x: p.x, z: p.z, x2: best.x, z2: best.z });
    } else {
      const d = Math.sqrt(bd) || 1;
      const sp = p.k === 'iris' ? 25 : 15;
      s.shots.push({ kind: 'missile', x: p.x, z: p.z, vx: (best.x - p.x) / d * sp, vz: (best.z - p.z) / d * sp, dmg, splash: 0, life: 3, target: best.id, src: p.k === 'iris' ? 'IRIS-T SLM' : 'STINGER', pad: p.slot });
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
  const da = s.st.sweep * dt, r2 = (s.st.radarRange * BACKUP_RADAR) ** 2, jams = jamBearings(s);
  for (const e of s.enemies) {
    if (e.x * e.x + e.z * e.z > r2 || Math.random() >= da / TAU) continue;
    const hm = horizonMask(e, r2);
    if (hm && Math.random() < ENEMIES[e.kind].sig * hm * BACKUP_RADAR * s.st.res * jamFactor(s, e, jams)) e.seenUntil = Math.max(e.seenUntil, s.t + s.st.persist);
  }
}

// Eyes: anything close to the base or to an emplacement is seen, radar or not (NIGHT RAID shortens it).
function spot(s: State) {
  const k = phase(s).mod.dark ? VISUAL_DARK : 1, b2 = (VISUAL_R * k) ** 2;
  const eyes = s.perim.filter(up).map(p => ({ x: p.x, z: p.z, r2: ((p.k === 'observer' ? OBSERVER_EYES : PAD_EYES) * siteRange(p.site) * k) ** 2 }));
  // Past this far out no unit's eyes reach (its distance out plus its eyesight, a hair over): skip the per-unit test.
  let reach = 0;
  for (const p of eyes) reach = Math.max(reach, Math.hypot(p.x, p.z) + Math.sqrt(p.r2) + 1e-3);
  const reach2 = reach * reach;
  let newly = 0;
  for (const e of s.enemies) {
    const d2 = e.x * e.x + e.z * e.z;
    if (d2 > b2 && (d2 > reach2 || !eyes.some(p => (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < p.r2))) continue;
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
  const sector = radarSector(s), fa = focusBearing(s), sig = M.lpi && s.st.lpi ? 1 : M.sig, jams = jamBearings(s);
  let newly = 0;
  for (const e of s.enemies) {
    if (e.x * e.x + e.z * e.z > r2) continue;
    const a = Math.atan2(e.z, e.x);
    // FOCUSED: the same looks, spent on a narrower arc. An AESA stares, a rotating radar sweeps.
    if (sector) { if (Math.abs(angDiff(a, fa)) > sector / 2 || Math.random() >= da / sector) continue; }
    else if (s.st.aesa ? Math.random() >= da / TAU : ((a - a0) % TAU + TAU) % TAU > da) continue;
    // Low flyers: under the horizon until they're close, and lost in the clutter over woods and rock.
    const hm = horizonMask(e, r2);
    if (hm && Math.random() < ENEMIES[e.kind].sig * hm * sig * s.st.res * jamFactor(s, e, jams) * (mod.sig ?? 1)) {
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
    if (e.locked && ENEMIES[e.kind].mimic && !e.ided && (e.lockT += dt) >= DECOY_ID / s.st.res) {
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
  if (locks < n) {
    // The free slots go to the best-scoring candidates, found in one pass: the k best so far, best first, a tie
    // behind the one met earlier. The same picks, in the same order, as taking the best one slot at a time.
    const k = n - locks, top: Enemy[] = [], ts: number[] = [];
    for (const e of s.enemies) {
      if (e.locked || e.ided || e.seenUntil <= s.t || e.incoming >= e.hp || e.x * e.x + e.z * e.z > tr2) continue;
      const sc = score(s, e);
      if (!(sc > -Infinity) || top.length === k && sc <= ts[k - 1]) continue;
      let i = top.length;
      while (i > 0 && ts[i - 1] < sc) i--;
      top.splice(i, 0, e); ts.splice(i, 0, sc);
      if (top.length > k) { top.pop(); ts.pop(); }
    }
    for (const e of top) { lock(e); locks++; }
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
  const rate = D.rate * (ic ? INTERCEPT.rate : 1) * (lastStand(s) ? LAST_STAND.rate : 1) * (overdrive(s) ? OVERDRIVE.rate : 1);
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
      const dmg = w.dmg * irHit(e);
      s.shots.push({ kind: 'missile', x: 0, z: 0, vx: Math.cos(a) * 12, vz: Math.sin(a) * 12, dmg, splash: w.splash, life: 5, target: e.id, src: 'IRIS-T' });
      e.incoming += dmg;
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
        else damage(s, hit, p.dmg, p.src, p.pad);
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

// pad: the slot of the perimeter pad that dealt the blow, credited with the kill.
function damage(s: State, e: Enemy, dmg: number, src: string, pad?: number) {
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
  const killer = pad === undefined ? undefined : s.perim.find(p => p.slot === pad);
  if (killer) {
    s.stats.perim[killer.k] = (s.stats.perim[killer.k] ?? 0) + 1;
    s.stats.units[killer.slot] = { k: killer.k, name: padName(killer), kills: killer.kills + 1 };
    const r = vetRank(killer.kills++);
    if (vetRank(killer.kills) > r) s.events.push({ k: 'padRank', x: killer.x, z: killer.z, n: r + 1, kind: killer.k });
  }
  if (BIG_KILLS[e.kind]) s.shake = Math.min(1.5, s.shake + BIG_KILL_SHAKE);
  s.events.push({ k: 'kill', x: e.x, z: e.z, kind: e.kind, n: gain });
  rollDrop(s, e.kind, e.x, e.z);
  if (s.st.chain) explode(s, e.x, e.z, 4, s.st.chain, 'CHAIN');
  if (s.st.counterSead && ARMS.includes(e.kind)) { s.power = Math.min(s.st.powerCap, s.power + s.st.powerCap * COUNTER_SEAD); s.events.push({ k: 'counterSead' }); }
  if (s.st.killChain && ++s.chainKills >= KILL_CHAIN.every) { s.chainKills = 0; s.chainUntil = s.t + KILL_CHAIN.time; s.events.push({ k: 'killChain' }); }
  if (s.st.overkill && excess > 0.5) { // OVERKILL: what's left over jumps to the nearest contact
    let next: Enemy | null = null, bd = OVERKILL_R ** 2;
    for (const o of s.enemies) {
      if (!visible(s, o) || o.ided) continue;
      const d = (o.x - e.x) ** 2 + (o.z - e.z) ** 2;
      if (d < bd) { bd = d; next = o; }
    }
    if (next) { s.events.push({ k: 'beam', x: e.x, z: e.z, x2: next.x, z2: next.z }); damage(s, next, excess, src, pad); }
  }
}
