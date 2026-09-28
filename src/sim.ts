import {
  ARENA_R, BASE_R, START_CREDITS, COMBO_WINDOW, COMBO_BONUS, COMBO_CAP, PHASE_LEN, ELITE_EVERY,
  ENEMIES, KINDS, WEAPONS, PHASES, MODES, UPGRADES, PERKS, PERIM_KINDS, PERIM_R, JAM_SLOW, baseLevel, perimSlots, deriveStats, difficulty,
  type EnemyKind, type PerimKind, type WeaponKind,
} from './config.ts';

export interface Enemy {
  id: number; kind: EnemyKind; x: number; z: number; vx: number; vz: number;
  hp: number; maxHp: number; speed: number; dmg: number; reward: number; size: number;
  seenUntil: number; locked: boolean; incoming: number; wob: number;
}
export interface Shot {
  kind: 'shell' | 'missile' | 'tracer'; x: number; z: number; vx: number; vz: number;
  dmg: number; splash: number; life: number; target: number;
}
export type Ev =
  | { k: 'shot' | 'missile' | 'kill' | 'hit' | 'baseHit' | 'detect'; x: number; z: number; kind?: EnemyKind; n?: number }
  | { k: 'beam' | 'rail' | 'gun'; x: number; z: number; x2: number; z2: number }
  | { k: 'level' | 'warning' | 'buy' | 'lock' | 'over' };

export type Phase = 'start' | 'play' | 'pause' | 'perk' | 'over';

export function newGame() {
  const s = {
    phase: 'start' as Phase,
    t: 0,
    credits: START_CREDITS,
    earned: 0,
    kills: 0,
    combo: 0,
    lastKill: -99,
    lv: {} as Record<string, number>,
    bought: 0,
    level: 1,
    perks: [] as string[],
    perkChoices: [] as string[],
    st: deriveStats({}, []),
    hp: 0,
    power: 0,
    ammo: 0,
    sweepA: 0,
    sweepSpeed: 0, // effective, after power throttling
    enemies: [] as Enemy[],
    shots: [] as Shot[],
    perim: [] as { k: PerimKind; x: number; z: number; cd: number }[],
    jamming: false,
    cooldown: { cannon: 0, pulse: 0, missile: 0, rail: 0 } as Record<WeaponKind, number>,
    aim: 0, // turret heading, for rendering
    spawnAcc: 0,
    nextElite: ELITE_EVERY,
    mode: 0,
    marked: 0,
    nextId: 1,
    events: [] as Ev[],
    shake: 0,
  };
  s.sweepSpeed = s.st.sweep;
  s.hp = s.st.maxHp; s.power = s.st.powerCap; s.ammo = s.st.ammoCap;
  return s;
}
export type State = ReturnType<typeof newGame>;

const TAU = Math.PI * 2;
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
export const visible = (s: State, e: Enemy) => e.locked || e.seenUntil > s.t;
export const phaseName = (s: State) => PHASES[Math.min(PHASES.length - 1, Math.floor(s.t / PHASE_LEN))].name;

// ---------- player actions ----------

// Why an upgrade can't be bought right now ('' = it can).
export const lockReason = (s: State, id: string) => {
  const u = UPGRADES.find(u => u.id === id)!;
  if (u.req && s.level < u.req) return `BASE LV ${u.req}`;
  if (PERIM_KINDS.includes(id as PerimKind) && s.perim.length >= perimSlots(s.level)) return 'PADS FULL';
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
  if (PERIM_KINDS.includes(id as PerimKind)) {
    const a = s.perim.length / 8 * TAU; // pads fill round the ring, between the M903s
    s.perim.push({ k: id as PerimKind, x: Math.cos(a) * PERIM_R, z: Math.sin(a) * PERIM_R, cd: 0 });
  }
  refreshStats(s);
  s.events.push({ k: 'buy' });
  const lvl = baseLevel(s.bought);
  if (lvl > s.level) {
    s.level = lvl;
    const pool = PERKS.map(p => p.id);
    s.perkChoices = [];
    while (s.perkChoices.length < 3) {
      const p = pick(pool);
      if (!s.perkChoices.includes(p)) s.perkChoices.push(p);
    }
    s.phase = 'perk';
    s.events.push({ k: 'level' });
  }
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

// ---------- simulation ----------

export function update(s: State, dt: number) {
  if (s.phase !== 'play') return;
  s.t += dt;
  s.shake = Math.max(0, s.shake - dt * 3);
  spawn(s, dt);
  moveEnemies(s, dt);
  powerAndAmmo(s, dt);
  radar(s, dt);
  track(s);
  fire(s, dt);
  perimeter(s, dt);
  moveShots(s, dt);
  s.hp = Math.min(s.st.maxHp, s.hp + s.st.repair * dt);
  if (s.hp <= 0) { s.hp = 0; s.phase = 'over'; s.events.push({ k: 'over' }); }
}

function spawnEnemy(s: State, kind: EnemyKind, a: number, r = ARENA_R + 2) {
  const T = ENEMIES[kind], d = difficulty(s.t);
  const hp = T.hp * d.hp;
  s.enemies.push({
    id: s.nextId++, kind, x: Math.cos(a) * r, z: Math.sin(a) * r, vx: 0, vz: 0,
    hp, maxHp: hp, speed: T.speed * d.speed * (0.9 + Math.random() * 0.2), dmg: T.dmg * d.dmg,
    reward: T.reward, size: T.size, seenUntil: -1, locked: false, incoming: 0, wob: Math.random() * TAU,
  });
}

function spawn(s: State, dt: number) {
  s.spawnAcc += difficulty(s.t).spawnRate * dt;
  const w = PHASES[Math.min(PHASES.length - 1, Math.floor(s.t / PHASE_LEN))].w;
  const total = KINDS.reduce((a, k) => a + (w[k] ?? 0), 0);
  while (s.spawnAcc >= 1) {
    s.spawnAcc--;
    let r = Math.random() * total, kind: EnemyKind = 'drone';
    for (const k of KINDS) { r -= w[k] ?? 0; if (r <= 0) { kind = k; break; } }
    const a = Math.random() * TAU;
    for (let i = 0; i < ENEMIES[kind].pack; i++) spawnEnemy(s, kind, a + (Math.random() - 0.5) * 0.15, ARENA_R + 2 + Math.random() * 6);
  }
  if (s.t >= s.nextElite) {
    s.nextElite += ELITE_EVERY;
    const a = Math.random() * TAU, n = 1 + Math.floor(s.t / 300);
    for (let i = 0; i < n; i++) spawnEnemy(s, 'elite', a + (i - n / 2) * 0.08, ARENA_R + 4 + i * 3);
    s.events.push({ k: 'warning' });
  }
}

function moveEnemies(s: State, dt: number) {
  const armor = 1 - s.st.armor;
  for (let i = s.enemies.length - 1; i >= 0; i--) {
    const e = s.enemies[i];
    const d = Math.hypot(e.x, e.z) || 1;
    const nx = -e.x / d, nz = -e.z / d;
    const wob = Math.sin(s.t * 2 + e.wob) * ENEMIES[e.kind].wobble * Math.min(1, d / 20);
    const sp = e.speed * (e.kind !== 'elite' && jammed(s, e) ? JAM_SLOW : 1);
    e.vx = nx * sp - nz * wob;
    e.vz = nz * sp + nx * wob;
    e.x += e.vx * dt; e.z += e.vz * dt;
    if (d < BASE_R + e.size * 0.5) {
      s.hp -= e.dmg * armor;
      s.shake = Math.min(1.5, s.shake + 0.3 + e.dmg / 40);
      s.events.push({ k: 'baseHit', x: e.x, z: e.z, kind: e.kind });
      removeAt(s, i);
    }
  }
}

function jammed(s: State, e: Enemy) {
  if (!s.jamming) return false;
  const r2 = s.st.perim.jammer.range ** 2;
  return s.perim.some(p => p.k === 'jammer' && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < r2);
}

// Pads engage the closest radar contact in their own range; no lock slot needed.
function perimeter(s: State, dt: number) {
  const P = s.st.perim;
  const jammers = s.perim.filter(p => p.k === 'jammer').length, need = jammers * P.jammer.power * dt;
  s.jamming = jammers > 0 && s.power >= need;
  if (s.jamming) s.power -= need;
  for (const p of s.perim) {
    if (p.k === 'jammer') continue;
    const w = P[p.k];
    p.cd = Math.max(0, p.cd - dt);
    if (p.cd > 0 || s.ammo < w.ammo) continue;
    let best: Enemy | null = null, bd = w.range ** 2;
    for (const e of s.enemies) {
      if (!visible(s, e) || e.incoming >= e.hp) continue;
      const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) continue;
    s.ammo -= w.ammo; p.cd = 1 / w.rate;
    if (p.k === 'mantis') {
      // 35mm tracer round, led like the PAC-3 so it actually connects
      const sp = 70, tt = Math.sqrt(bd) / sp;
      const dx = best.x + best.vx * tt - p.x, dz = best.z + best.vz * tt - p.z, d = Math.hypot(dx, dz) || 1;
      s.shots.push({ kind: 'tracer', x: p.x, z: p.z, vx: dx / d * sp, vz: dz / d * sp, dmg: w.dmg, splash: 0, life: w.range / sp + 0.15, target: best.id });
      best.incoming += w.dmg;
      s.events.push({ k: 'gun', x: p.x, z: p.z, x2: best.x, z2: best.z });
    } else {
      const d = Math.sqrt(bd) || 1;
      s.shots.push({ kind: 'missile', x: p.x, z: p.z, vx: (best.x - p.x) / d * 15, vz: (best.z - p.z) / d * 15, dmg: w.dmg, splash: 0, life: 3, target: best.id });
      best.incoming += w.dmg;
      s.events.push({ k: 'missile', x: p.x, z: p.z });
    }
  }
}

function removeAt(s: State, i: number) {
  const e = s.enemies[i];
  if (s.marked === e.id) s.marked = 0;
  s.enemies[i] = s.enemies[s.enemies.length - 1];
  s.enemies.pop();
}

function powerAndAmmo(s: State, dt: number) {
  const st = s.st;
  s.power = Math.min(st.powerCap, s.power + st.gen * dt);
  // Radar gets what's left; starving it slows the sweep (floor 25%).
  const want = st.drain * dt, got = Math.min(want, s.power);
  s.power -= got;
  s.sweepSpeed = st.sweep * Math.max(0.25, got / want);
  // Ammo fab only runs on surplus above 20% so weapons keep a reserve.
  const room = Math.min(st.ammoCap - s.ammo, st.ammoProd * dt);
  const spare = Math.max(0, s.power - st.powerCap * 0.2) / st.ammoPower;
  const made = Math.max(0, Math.min(room, spare));
  s.ammo += made; s.power -= made * st.ammoPower;
}

function radar(s: State, dt: number) {
  const a0 = s.sweepA, da = s.sweepSpeed * dt;
  s.sweepA = (a0 + da) % TAU;
  const r2 = s.st.radarRange ** 2;
  let newly = 0;
  for (const e of s.enemies) {
    if (e.x * e.x + e.z * e.z > r2) continue;
    const rel = ((Math.atan2(e.z, e.x) - a0) % TAU + TAU) % TAU;
    if (rel > da) continue;
    if (Math.random() < ENEMIES[e.kind].sig * s.st.res) {
      if (e.seenUntil < s.t) newly++;
      e.seenUntil = s.t + s.st.persist;
    }
  }
  if (newly) s.events.push({ k: 'detect', x: 0, z: 0, n: newly });
}

function score(s: State, e: Enemy) {
  switch (MODES[s.mode]) {
    case 'CLOSEST': return -(e.x * e.x + e.z * e.z);
    case 'WEAKEST': return -e.hp;
    case 'RICHEST': return e.reward * 1000 - (e.x * e.x + e.z * e.z) / 100;
    case 'FASTEST': return e.speed;
  }
}

function track(s: State) {
  const tr2 = s.st.trackRange ** 2;
  let locks = 0;
  for (const e of s.enemies) {
    if (e.locked && e.x * e.x + e.z * e.z > tr2) e.locked = false;
    if (e.locked) { locks++; e.seenUntil = Math.max(e.seenUntil, s.t + 0.5); }
  }
  // Too many locks (slots lowered by a perk) → drop extras
  if (locks > s.st.slots) for (const e of s.enemies) if (e.locked && locks > s.st.slots && e.id !== s.marked) { e.locked = false; locks--; }
  // Manual mark always gets a slot.
  const m = s.marked ? s.enemies.find(e => e.id === s.marked) : undefined;
  if (m && !m.locked && visible(s, m) && m.x * m.x + m.z * m.z <= tr2) {
    if (locks >= s.st.slots) {
      const drop = s.enemies.find(e => e.locked);
      if (drop) { drop.locked = false; locks--; }
    }
    m.locked = true; locks++;
  }
  while (locks < s.st.slots) {
    let best: Enemy | null = null, bs = -Infinity;
    for (const e of s.enemies) {
      if (e.locked || e.seenUntil <= s.t || e.incoming >= e.hp || e.x * e.x + e.z * e.z > tr2) continue;
      const sc = score(s, e);
      if (sc > bs) { bs = sc; best = e; }
    }
    if (!best) break;
    best.locked = true; locks++;
  }
}

function fire(s: State, dt: number) {
  const targets = s.enemies.filter(e => e.locked && e.incoming < e.hp);
  targets.sort((a, b) => (b.id === s.marked ? 1e12 : score(s, b)) - (a.id === s.marked ? 1e12 : score(s, a)));
  let wi = 0;
  for (const k of ['cannon', 'pulse', 'missile', 'rail'] as WeaponKind[]) {
    const w = s.st.weapons[k];
    s.cooldown[k] = Math.max(0, s.cooldown[k] - dt);
    if (!w || s.cooldown[k] > 0) continue;
    const r2 = w.range ** 2;
    // Spread weapons over locks; fall back to any lock in range.
    const inRange = targets.filter(e => e.x * e.x + e.z * e.z <= r2 && e.incoming < e.hp);
    const e = inRange[wi++ % Math.max(1, inRange.length)];
    if (!e) continue;
    if (s.ammo < w.ammo || s.power < w.power) continue;
    s.ammo -= w.ammo; s.power -= w.power;
    s.cooldown[k] = 1 / w.rate;
    if (k === 'cannon') {
      // Lead the target: solve |p + v t| = speed * t (one Newton-ish pass is plenty)
      const d = Math.hypot(e.x, e.z), tt = d / w.speed;
      const ax = e.x + e.vx * tt, az = e.z + e.vz * tt, ad = Math.hypot(ax, az) || 1;
      s.aim = Math.atan2(az, ax);
      s.shots.push({ kind: 'shell', x: 0, z: 0, vx: ax / ad * w.speed, vz: az / ad * w.speed, dmg: w.dmg, splash: 0, life: w.range / w.speed + 0.3, target: e.id });
      e.incoming += w.dmg;
      s.events.push({ k: 'shot', x: 0, z: 0 });
    } else if (k === 'missile') {
      const a = Math.random() * TAU;
      s.shots.push({ kind: 'missile', x: 0, z: 0, vx: Math.cos(a) * 12, vz: Math.sin(a) * 12, dmg: w.dmg, splash: w.splash, life: 5, target: e.id });
      e.incoming += w.dmg;
      s.events.push({ k: 'missile', x: 0, z: 0 });
    } else if (k === 'pulse') {
      s.events.push({ k: 'beam', x: 0, z: 0, x2: e.x, z2: e.z });
      damage(s, e, w.dmg);
    } else {
      const d = Math.hypot(e.x, e.z) || 1, dx = e.x / d, dz = e.z / d;
      s.events.push({ k: 'rail', x: 0, z: 0, x2: dx * w.range, z2: dz * w.range });
      for (const o of [...s.enemies]) {
        const along = o.x * dx + o.z * dz;
        if (along < 0 || along > w.range) continue;
        if (Math.abs(o.x * dz - o.z * dx) < o.size + 0.6) damage(s, o, w.dmg);
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
      if (!t) { t = s.enemies.find(e => e.locked); if (t) { p.target = t.id; t.incoming += p.dmg; } }
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
      const r = e.size * 0.8 + 0.4;
      if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 < r * r) { hit = e; break; }
    }
    if (hit || p.life <= 0) {
      const t = s.enemies.find(e => e.id === p.target);
      if (t) t.incoming = Math.max(0, t.incoming - p.dmg);
      if (hit) {
        if (p.splash) explode(s, p.x, p.z, p.splash, p.dmg);
        else damage(s, hit, p.dmg);
      }
      s.shots[i] = s.shots[s.shots.length - 1];
      s.shots.pop();
    }
  }
}

function explode(s: State, x: number, z: number, r: number, dmg: number) {
  s.events.push({ k: 'hit', x, z, n: r });
  for (const e of [...s.enemies]) if ((e.x - x) ** 2 + (e.z - z) ** 2 < (r + e.size) ** 2) damage(s, e, dmg);
}

function damage(s: State, e: Enemy, dmg: number) {
  if (e.hp <= 0) return; // already dead this frame
  e.hp -= dmg;
  if (e.hp > 0) { s.events.push({ k: 'hit', x: e.x, z: e.z }); return; }
  const i = s.enemies.indexOf(e);
  if (i >= 0) removeAt(s, i);
  s.combo = s.t - s.lastKill < COMBO_WINDOW ? s.combo + 1 : 1;
  s.lastKill = s.t;
  const gain = Math.round(e.reward * s.st.credits * (1 + Math.min(s.combo, COMBO_CAP) * COMBO_BONUS));
  s.credits += gain; s.earned += gain; s.kills++;
  s.events.push({ k: 'kill', x: e.x, z: e.z, kind: e.kind, n: gain });
  if (s.st.chain) explode(s, e.x, e.z, 4, s.st.chain);
}
