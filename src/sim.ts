import {
  ARENA_R, BASE_R, START_CREDITS, COMBO_WINDOW, COMBO_BONUS, COMBO_CAP, PHASE_LEN, ELITE_EVERY,
  ENEMIES, KINDS, WEAPONS, PHASES, PACKAGES, DISCIPLINES, PRIORITY_DMG, PRIORITY_POWER, INTERCEPT, DOCTRINES, MODS, RAIDS, RAID_FIRST, RAID_EVERY, RAID_WARN, RAID_BONUS, RAID_SPAWN, RAID_RECOVER, RAID_CALM, RAID_PRESS, MODES, UPGRADES, PERKS, PERIM_KINDS, PERIM_R, SWEEP_CAP, grow, PAD_SLOTS, PLACE_TIME, JAM_SLOW, baseLevel, perimSlots, deriveStats, difficulty,
  RADAR_MODES, LPI_R, BLACKOUT, COUNTER_SEAD, KILL_CHAIN, OVERKILL_R, LAST_STAND, ARM_STUN, ARM_VEER, ARM_TURN, ARM_LIFE, ARM_EVERY, ARM_LAUNCH_R, DECOY_ID, EW_ORBIT, EW_ARC, EW_JAM,
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
  hold: number; // escort jammer: bearing it holds station on, NaN = circles
}
export interface Shot {
  kind: 'shell' | 'missile' | 'tracer'; x: number; z: number; vx: number; vz: number;
  dmg: number; splash: number; life: number; target: number; src: string; // src: weapon, for the debrief
}
export type Ev =
  | { k: 'shot' | 'missile' | 'kill' | 'hit' | 'baseHit' | 'detect' | 'arm' | 'tbm' | 'jam' | 'ident'; x: number; z: number; kind?: EnemyKind; n?: number }
  | { k: 'beam' | 'rail' | 'gun'; x: number; z: number; x2: number; z2: number }
  | { k: 'raid'; x: number; z: number; name: string }
  | { k: 'package'; x: number; z: number; name: string }
  | { k: 'raidStart'; x: number; z: number; name: string }
  | { k: 'raidClear' | 'raidLeak' | 'raidEnd'; n: number }
  | { k: 'intercept'; x: number; z: number }
  | { k: 'level' | 'warning' | 'buy' | 'placing' | 'lock' | 'over' | 'emcon' | 'radarDown' | 'aesa' | 'discipline' | 'radarMode' | 'killChain' | 'counterSead' | 'lastStand' };

export type Phase = 'start' | 'play' | 'pause' | 'perk' | 'over';

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
    world: { seed },
    perkRng: { seed: seed ^ 0x9E3779B9 },
    t: 0,
    credits: START_CREDITS,
    earned: 0,
    kills: 0,
    combo: 0,
    lastKill: -99,
    lv: { ...doc.lv } as Record<string, number>,
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
    perim: [] as { k: PerimKind; x: number; z: number; cd: number; slot: number }[],
    placing: null as null | { k: PerimKind; since: number }, // bought, waiting for a click on the map
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
    nextElite: ELITE_EVERY,
    nextRaid: RAID_FIRST,
    // Announced, not yet here: composition (in aircraft) and the bonus it pays if the objective holds.
    raid: null as null | { name: string; a: number; at: number; g: Partial<Record<EnemyKind, number>>; obj: RaidObjective; n: Partial<Record<EnemyKind, number>>; bonus: number },
    // The raid in the air: its id, aircraft left, objective still held, reward so far, bearing, objective, name.
    raidId: 0, raidLeft: 0, raidClean: true, raidReward: 0, raidA: 0, raidObj: 'battery' as RaidObjective, raidName: '',
    calmUntil: 0, // recovery lull after a raid defended
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
  s.hp = s.st.maxHp; s.power = s.st.powerCap; s.ammo = s.st.ammoCap;
  return s;
}
export type State = ReturnType<typeof newGame>;

const TAU = Math.PI * 2;
const AESA_SPIN = 1.2; // rad/s, cosmetic
const pick = <T>(r: { seed: number }, a: T[]) => a[Math.floor(rand(r) * a.length)];
export const visible = (s: State, e: Enemy) => e.locked || e.seenUntil > s.t;
const NO_MOD: Mod = { name: '', desc: '' };
// Scripted phases first, then COMBINED RAID's mix under a looping condition.
export function phase(s: State) {
  const i = Math.floor(s.t / PHASE_LEN);
  if (i < PHASES.length) return { ...PHASES[i], mod: NO_MOD };
  const last = PHASES[PHASES.length - 1], mod = MODS[(i - PHASES.length) % MODS.length], w = { ...last.w };
  for (const [k, v] of Object.entries(mod.w ?? {}) as [EnemyKind, number][]) w[k] = (w[k] ?? 0) + v;
  return { name: mod.name, w, mod, pk: last.pk };
}
export const phaseName = (s: State) => phase(s).name;
export const emitting = (s: State) => !s.emcon && s.t >= s.radarDownUntil;
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
  if (PERIM_KINDS.includes(id as PerimKind)) {
    s.placing = { k: id as PerimKind, since: s.t };
    s.events.push({ k: 'placing' });
  }
  refreshStats(s);
  s.events.push({ k: 'buy' });
  const lvl = baseLevel(s.bought);
  if (lvl > s.level) {
    s.level = lvl;
    s.perkChoices = draft(s);
    s.phase = 'perk';
    s.events.push({ k: 'level' });
  }
  return true;
}

// 3 distinct perks the battery qualifies for; from base level 5, one of them changes the rules (while any are left).
export function draft(s: State) {
  const pool = PERKS.filter(p => (p.min ?? 0) <= s.level && (!p.need || s.lv[p.need]) && !(p.rule && s.perks.includes(p.id)));
  const rules = pool.filter(p => p.rule).map(p => p.id);
  const out = rules.length ? [pick(s.perkRng, rules)] : [];
  const rest = pool.filter(p => !p.rule).map(p => p.id);
  while (out.length < 3) { const p = pick(s.perkRng, rest); if (!out.includes(p)) out.push(p); }
  return out;
}

export const padAngle = (slot: number) => slot / PAD_SLOTS * TAU;
export const freeSlots = (s: State) => [...Array(PAD_SLOTS).keys()].filter(i => !s.perim.some(p => p.slot === i));

// Put the pending pad on the free slot closest in bearing to (x, z).
export function placePad(s: State, x: number, z: number) {
  if (!s.placing) return false;
  const a = Math.atan2(z, x);
  const slot = freeSlots(s).sort((i, j) => Math.abs(angDiff(a, padAngle(i))) - Math.abs(angDiff(a, padAngle(j))))[0];
  if (slot === undefined) return false;
  s.perim.push({ k: s.placing.k, x: Math.cos(padAngle(slot)) * PERIM_R, z: Math.sin(padAngle(slot)) * PERIM_R, cd: 0, slot });
  s.placing = null;
  s.events.push({ k: 'buy' });
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
  s.st = deriveStats(s.lv, s.perks);
  // Keep HP ratio when max changes, but hull upgrades also heal the added amount.
  s.hp = Math.min(s.st.maxHp, s.hp + Math.max(0, s.st.maxHp - oldMax));
  s.power = Math.min(s.power, s.st.powerCap);
  s.ammo = Math.min(s.ammo, s.st.ammoCap);
}

export function markAt(s: State, x: number, z: number) {
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
  if (s.phase !== 'play') return;
  s.radarMode = (s.radarMode + 1) % RADAR_MODES.length;
  s.events.push({ k: 'radarMode' });
}
// A click anywhere aims FOCUSED at that bearing.
export const aimFocus = (s: State, x: number, z: number) => { s.focusA = Math.atan2(z, x); };

export function toggleEmcon(s: State) {
  if (s.phase !== 'play') return;
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
  powerAndAmmo(s, dt);
  radar(s, dt);
  track(s, dt);
  fire(s, dt);
  perimeter(s, dt);
  if (s.placing && s.t - s.placing.since > PLACE_TIME) {
    // Nobody picked a spot: face the nearest contact, or any threat at all.
    let best = s.enemies[0], bd = Infinity;
    for (const e of s.enemies) { const d = e.x * e.x + e.z * e.z; if (visible(s, e) && d < bd) { bd = d; best = e; } }
    placePad(s, best?.x ?? 1, best?.z ?? 0);
  }
  moveShots(s, dt);
  s.hp = Math.min(s.st.maxHp, s.hp + s.st.repair * dt);
  const ls = lastStand(s);
  if (ls !== s.lastStand) { s.lastStand = ls; if (ls) s.events.push({ k: 'lastStand' }); }
  if (s.hp <= 0) { s.hp = 0; s.phase = 'over'; s.events.push({ k: 'over' }); }
}

export function spawnEnemy(s: State, kind: EnemyKind, a: number, r = ARENA_R + 2, rnd = Math.random) {
  const T = ENEMIES[kind], d = difficulty(s.t);
  const hp = T.hp * d.hp * (phase(s).mod.hp ?? 1), speed = T.speed * d.speed * (0.9 + rnd() * 0.2);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  s.enemies.push({
    id: s.nextId++, kind, x, z, vx: -Math.cos(a) * speed, vz: -Math.sin(a) * speed,
    hp, maxHp: hp, speed, dmg: T.dmg * d.dmg,
    reward: T.reward, size: T.size, seenUntil: -1, locked: false, incoming: 0, wob: rnd() * TAU,
    born: s.t, cd: 3, aim: NaN, lockT: 0, ided: false, orbit: false, raid: 0, pkg: 0, hold: NaN,
  });
  if (kind === 'arm' || kind === 'tbm') s.events.push({ k: kind, x, z }); // ESM / early warning hears the launch, radar or not
  return s.enemies[s.enemies.length - 1];
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

function spawn(s: State, dt: number) {
  const rw = () => rand(s.world);
  const { w, mod, pk } = phase(s);
  s.spawnAcc += difficulty(s.t).spawnRate * (mod.spawn ?? 1) * (s.raidLeft ? RAID_SPAWN : s.t < s.calmUntil ? RAID_CALM : 1) * dt;
  const total = KINDS.reduce((a, k) => a + (w[k] ?? 0), 0);
  while (s.spawnAcc >= 1) {
    s.spawnAcc--;
    const pkgs = PACKAGES.filter(p => s.t >= p.from);
    if (pk && pkgs.length && rw() < pk) {
      const p = pick(s.world, pkgs), a = rw() * TAU;
      spawnGroup(s, p.g, a, 1, rw);
      s.events.push({ k: 'package', x: Math.cos(a) * ARENA_R, z: Math.sin(a) * ARENA_R, name: p.name });
      continue;
    }
    let r = rw() * total, kind: EnemyKind = 'drone';
    for (const k of KINDS) { r -= w[k] ?? 0; if (r <= 0) { kind = k; break; } }
    const a = rw() * TAU;
    for (let i = 0; i < ENEMIES[kind].pack; i++) spawnEnemy(s, kind, a + (rw() - 0.5) * 0.15, ARENA_R + 2 + rw() * 6, rw);
  }
  if (s.t >= s.nextElite) {
    s.nextElite += ELITE_EVERY;
    const a = rw() * TAU, n = Math.floor(grow(s.t / 60, 1));
    for (let i = 0; i < n; i++) spawnEnemy(s, 'elite', a + (i - n / 2) * 0.08, ARENA_R + 4 + i * 3, rw);
    s.events.push({ k: 'warning' });
  }
  if (!s.raid && s.t >= s.nextRaid - RAID_WARN) {
    const r = pick(s.world, RAIDS.filter(r => s.t >= r.from)), a = rw() * TAU;
    // Same rounding spawnGroup will use at arrival, so the briefing matches what shows up.
    const scale = grow(s.nextRaid / 60, 0.7), n: Partial<Record<EnemyKind, number>> = {};
    let reward = 0;
    for (const [k, c] of Object.entries(r.g) as [EnemyKind, number][]) {
      n[k] = groupCount(k, c, scale) * ENEMIES[k].pack;
      if (k !== 'ew') reward += n[k]! * ENEMIES[k].reward;
    }
    s.raid = { name: r.name, a, at: s.nextRaid, g: r.g, obj: r.obj ?? 'battery', n, bonus: Math.round(reward * RAID_BONUS) + 25 };
    s.nextRaid += RAID_EVERY;
    s.events.push({ k: 'raid', x: Math.cos(a) * ARENA_R, z: Math.sin(a) * ARENA_R, name: r.name });
  }
  if (s.raid && s.t >= s.raid.at) {
    const { a, g, name, obj } = s.raid, scale = grow(s.raid.at / 60, 0.7);
    s.raid = null;
    s.raidId++; s.raidLeft = 0; s.raidClean = true; s.raidReward = 0; s.raidA = a; s.raidObj = obj; s.raidName = name; s.calmUntil = 0;
    // The escort jammer flies with the raid but doesn't count: the raid is over once the strikers are gone.
    for (const e of spawnGroup(s, g, a, scale, rw)) if (e.kind !== 'ew') { e.raid = s.raidId; s.raidLeft++; s.raidReward += e.reward; }
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
        // On station: circle the battery (direction from wob), easing back onto the orbit radius.
        // An escort holds its package's bearing instead, so the jammed sector stays over the package.
        if (!e.orbit) { e.orbit = true; s.events.push({ k: 'jam', x: e.x, z: e.z }); }
        const dir = Number.isNaN(e.hold) ? (e.wob < Math.PI ? 1 : -1) : -Math.max(-1, Math.min(1, angDiff(e.hold, Math.atan2(e.z, e.x)) * 4)), pull = (d - EW_ORBIT) * 0.5;
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
    e.x += e.vx * dt; e.z += e.vz * dt;
    if (d < BASE_R + e.size * 0.5) {
      // Objective lost: PROTECT BATTERY by anything of the raid landing, PROTECT RADAR by any ARM hit while it's on.
      if (s.raidClean && s.raidLeft && (s.raidObj === 'radar' ? e.kind === 'arm' : e.raid === s.raidId && e.dmg > 0)) raidLost(s);
      if (e.kind === 'arm') {
        s.radarDownUntil = Math.min(Math.max(s.radarDownUntil, s.t) + ARM_STUN, s.t + 2 * ARM_STUN);
        s.events.push({ k: 'radarDown' });
        s.stats.radarHits++;
      }
      if (e.dmg > 0) {
        s.hp -= e.dmg * armor;
        s.shake = Math.min(1.5, s.shake + 0.3 + e.dmg / 40);
        s.events.push({ k: 'baseHit', x: e.x, z: e.z, kind: e.kind });
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
  const r2 = s.st.perim.jammer.range ** 2;
  return s.perim.some(p => p.k === 'jammer' && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < r2);
}

// Pads engage the closest radar contact in their own range; no lock slot needed.
function perimeter(s: State, dt: number) {
  const P = s.st.perim;
  const r2 = P.jammer.range ** 2;
  const jammers = s.perim.filter(p => p.k === 'jammer' && s.enemies.some(e => (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < r2)).length;
  const need = jammers * P.jammer.power * dt;
  s.jamming = jammers > 0 && s.power >= need;
  if (s.jamming) s.power -= need;
  for (const p of s.perim) {
    if (p.k === 'jammer') continue;
    const w = P[p.k];
    p.cd = Math.max(0, p.cd - dt);
    if (p.cd > 0 || s.ammo < w.ammo) continue;
    let best: Enemy | null = null, bd = w.range ** 2;
    const ic = interceptActive(s) ? s.enemies.find(e => e.id === s.intercept.target) : undefined;
    for (const e of s.enemies) {
      if (!visible(s, e) || e.ided || e.incoming >= e.hp && e !== ic || ENEMIES[e.kind].pacOnly) continue;
      if (ic && e !== ic && (ic.x - p.x) ** 2 + (ic.z - p.z) ** 2 < bd) continue; // intercept target in reach: only it
      const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) continue;
    s.ammo -= w.ammo; p.cd = 1 / w.rate;
    if (p.k === 'mantis') {
      // 35mm tracer round, led like the PAC-3 so it actually connects
      const sp = 70, tt = Math.sqrt(bd) / sp;
      const dx = best.x + best.vx * tt - p.x, dz = best.z + best.vz * tt - p.z, d = Math.hypot(dx, dz) || 1;
      s.shots.push({ kind: 'tracer', x: p.x, z: p.z, vx: dx / d * sp, vz: dz / d * sp, dmg: w.dmg, splash: 0, life: w.range / sp + 0.15, target: best.id, src: 'MANTIS' });
      best.incoming += w.dmg;
      s.events.push({ k: 'gun', x: p.x, z: p.z, x2: best.x, z2: best.z });
    } else {
      const d = Math.sqrt(bd) || 1;
      s.shots.push({ kind: 'missile', x: p.x, z: p.z, vx: (best.x - p.x) / d * 15, vz: (best.z - p.z) / d * 15, dmg: w.dmg, splash: 0, life: 3, target: best.id, src: 'STINGER' });
      best.incoming += w.dmg;
      s.events.push({ k: 'missile', x: p.x, z: p.z });
    }
  }
}

// The enemy presses the advantage: no bonus, no recovery lull, and the next raid comes sooner.
function raidLost(s: State) {
  s.raidClean = false;
  s.nextRaid = Math.max(s.t + RAID_WARN + 5, s.nextRaid - RAID_PRESS);
  s.events.push({ k: 'raidLeak', n: RAID_PRESS });
}

function removeAt(s: State, i: number) {
  const e = s.enemies[i];
  if (s.marked === e.id) s.marked = 0;
  s.enemies[i] = s.enemies[s.enemies.length - 1];
  s.enemies.pop();
  if (e.raid && e.raid === s.raidId && --s.raidLeft === 0) {
    s.stats.raids++;
    if (!s.raidClean) { s.events.push({ k: 'raidEnd', n: 0 }); return; }
    s.calmUntil = s.t + RAID_RECOVER;
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
  if (s.marked) s.power = Math.max(0, s.power - PRIORITY_POWER * dt); // painting the priority target
  const on = emitting(s), want = on ? st.drain * radarMode(s).drain * dt : 0, got = Math.min(want, s.power);
  s.power -= got;
  s.sweepSpeed = on ? st.sweep * Math.max(0.25, got / want) : 0;
  // Ammo fab only runs on surplus above 20% so weapons keep a reserve.
  const room = Math.min(st.ammoCap - s.ammo, st.ammoProd * dt);
  const spare = Math.max(0, s.power - st.powerCap * 0.2) / st.ammoPower;
  const made = Math.max(0, Math.min(room, spare));
  s.ammo += made; s.power -= made * st.ammoPower;
}

function radar(s: State, dt: number) {
  if (!emitting(s)) return;
  const a0 = s.sweepA, da = s.sweepSpeed * dt;
  // An AESA stares all round: each contact gets the looks a rotating beam would give it, at random moments.
  // sweepA then only turns the TRML-4D head (and the sweep ping) at a calm fixed rate.
  s.sweepA = (a0 + (s.st.aesa ? AESA_SPIN * dt * s.sweepSpeed / s.st.sweep : da)) % TAU;
  const r2 = radarRange(s) ** 2, { mod } = phase(s), M = radarMode(s);
  const sector = radarSector(s), fa = focusBearing(s), sig = M.lpi && s.st.lpi ? 1 : M.sig;
  let newly = 0;
  for (const e of s.enemies) {
    if (e.x * e.x + e.z * e.z > r2) continue;
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
  const dark = !emitting(s);
  if (dark && !s.dark && s.st.blackout) // BLACKOUT PROTOCOL: what's on the scope coasts twice as long
    for (const e of s.enemies) if (e.seenUntil > s.t) e.seenUntil = s.t + (e.seenUntil - s.t) * BLACKOUT.dark;
  s.dark = dark;
  if (dark) {
    // Radar dark: fire control drops every track and contacts coast on track memory. TRACK FUSION keeps them.
    for (const e of s.enemies) if (e.locked) {
      if (s.st.fusion && e.x * e.x + e.z * e.z <= s.st.trackRange ** 2) e.seenUntil = Math.max(e.seenUntil, s.t + 0.5);
      else { e.locked = false; e.seenUntil = s.t + s.st.persist * (s.st.blackout ? BLACKOUT.dark : 1); }
    }
    return;
  }
  const tr2 = s.st.trackRange ** 2;
  let locks = 0;
  for (const e of s.enemies) {
    if (e.locked && e.kind === 'decoy' && !e.ided && (e.lockT += dt) >= DECOY_ID / s.st.res) {
      e.ided = true;
      s.events.push({ k: 'ident', x: e.x, z: e.z });
    }
    // A classified decoy is released, unless the operator insists.
    if (e.locked && (e.x * e.x + e.z * e.z > tr2 || e.ided && e.id !== s.marked)) e.locked = false;
    if (e.locked) { locks++; e.seenUntil = Math.max(e.seenUntil, s.t + 0.5); }
  }
  // Too many locks (slots lowered by a perk) → drop extras
  const n = slots(s);
  if (locks > n) for (const e of s.enemies) if (e.locked && locks > n && e.id !== s.marked) { e.locked = false; locks--; }
  // Manual mark always gets a slot.
  const m = s.marked ? s.enemies.find(e => e.id === s.marked) : undefined;
  if (m && !m.locked && visible(s, m) && m.x * m.x + m.z * m.z <= tr2) {
    if (locks >= n) {
      let drop: Enemy | null = null;
      for (const e of s.enemies) if (e.locked && (!drop || score(s, e) < score(s, drop))) drop = e;
      if (drop) { drop.locked = false; locks--; }
    }
    m.locked = true; locks++;
  }
  while (locks < n) {
    let best: Enemy | null = null, bs = -Infinity;
    for (const e of s.enemies) {
      if (e.locked || e.ided || e.seenUntil <= s.t || e.incoming >= e.hp || e.x * e.x + e.z * e.z > tr2) continue;
      const sc = score(s, e);
      if (sc > bs) { bs = sc; best = e; }
    }
    if (!best) break;
    best.locked = true; locks++;
  }
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
  for (let i = s.shots.length - 1; i >= 0; i--) {
    const p = s.shots[i];
    p.life -= dt;
    if (p.kind === 'missile') {
      let t = s.enemies.find(e => e.id === p.target);
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
      const t = s.enemies.find(e => e.id === p.target);
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
