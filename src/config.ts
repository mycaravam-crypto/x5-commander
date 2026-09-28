// Every tunable number lives here.

export const ARENA_R = 60;
export const BASE_R = 3.5;
export const START_CREDITS = 150;
export const COMBO_WINDOW = 1.5; // s between kills to keep the combo
export const COMBO_BONUS = 0.02; // +2% credits per combo step
export const COMBO_CAP = 50;
export const PHASE_LEN = 75; // s
export const ELITE_EVERY = 150; // s

// Green phosphor palette, shared by the 3D scene and the CSS (hud.ts copies it into CSS variables).
// Amber is the single exception: warnings and base damage.
export const PAL = { dim: 0x0b3d1f, mid: 0x1f9e4f, bright: 0x39ff88, hot: 0xc8ffe0, alert: 0xffb000 };
// Radar bearing in degrees, 0-360, measured from +x toward +z (grid labels and the HUD use the same one).
export const bearing = (x: number, z: number) => ((Math.atan2(z, x) * 180 / Math.PI) % 360 + 360) % 360;

export type EnemyKind = 'scout' | 'drone' | 'swarm' | 'tank' | 'elite' | 'decoy' | 'arm' | 'ew' | 'tbm';

export interface EnemyType {
  hp: number; speed: number; dmg: number; reward: number;
  name: string; code: string; // display name + short label code
  size: number; sig: number; glow: number; // glow: brightness on PAL.bright (tank/elite also blink, see render.ts)
  pack: number; wobble: number;
  pacOnly?: boolean; // only PAC-3 hit-to-kill can stop it
}

export const ENEMIES: Record<EnemyKind, EnemyType> = {
  scout: { name: 'Lancet-3 loitering munition', code: 'LANCET', hp: 3, speed: 7, dmg: 3, reward: 6, size: 0.8, sig: 0.6, glow: 1, pack: 1, wobble: 3 },
  drone: { name: 'Shahed-136 one-way attack drone', code: 'SHAHED', hp: 8, speed: 4, dmg: 6, reward: 10, size: 1.1, sig: 0.9, glow: 0.8, pack: 1, wobble: 0.6 },
  swarm: { name: 'FPV strike swarm', code: 'FPV', hp: 2, speed: 5.5, dmg: 2, reward: 3, size: 0.5, sig: 0.45, glow: 0.6, pack: 6, wobble: 1.5 },
  tank: { name: 'Mi-28NM attack helicopter', code: 'MI-28', hp: 45, speed: 1.8, dmg: 20, reward: 50, size: 2, sig: 1.4, glow: 1, pack: 1, wobble: 0 },
  elite: { name: 'Su-34 strike fighter', code: 'SU-34', hp: 160, speed: 3.5, dmg: 40, reward: 200, size: 2.4, sig: 1.2, glow: 1.5, pack: 1, wobble: 1 },
  // Looks exactly like a Shahed (bigger radar return, even) until the ECS classifies it. Harmless, worthless.
  decoy: { name: 'Gerbera decoy drone', code: 'DECOY', hp: 5, speed: 3.8, dmg: 0, reward: 0, size: 1.1, sig: 1.1, glow: 0.8, pack: 3, wobble: 0.6 },
  arm: { name: 'Kh-31P anti-radiation missile', code: 'KH-31P', hp: 4, speed: 10, dmg: 5, reward: 15, size: 0.8, sig: 0.55, glow: 1.2, pack: 2, wobble: 0 },
  // Big radar return, very fast, hits hard. Nothing but PAC-3 touches it.
  tbm: { name: 'Iskander-M ballistic missile', code: 'ISKANDER', hp: 5, speed: 12, dmg: 25, reward: 60, size: 1, sig: 1.6, glow: 1.3, pack: 1, wobble: 0, pacOnly: true },
  ew: { name: 'Mi-8MTPR-1 EW helicopter', code: 'MI-8PR', hp: 60, speed: 2.5, dmg: 0, reward: 80, size: 1.8, sig: 1.6, glow: 1, pack: 1, wobble: 0 },
};
export const KINDS = Object.keys(ENEMIES) as EnemyKind[];

// Spawn weights per phase; last entry repeats forever.
export const PHASES: { name: string; w: Partial<Record<EnemyKind, number>> }[] = [
  { name: 'PROBING', w: { scout: 3, drone: 2 } },
  { name: 'SATURATION', w: { scout: 2, drone: 3, swarm: 1, decoy: 1 } },
  { name: 'ROTARY STRIKE', w: { scout: 2, drone: 3, swarm: 1, tank: 1, decoy: 1 } },
  { name: 'AIR STRIKE', w: { scout: 2, drone: 3, swarm: 1, tank: 1, elite: 0.15, decoy: 1, ew: 0.1, tbm: 0.1 } },
  { name: 'SEAD', w: { scout: 1, drone: 3, swarm: 1, tank: 1, decoy: 2, arm: 0.3, ew: 0.15 } },
  { name: 'COMBINED RAID', w: { scout: 2, drone: 3, swarm: 2, tank: 1.5, elite: 0.3, decoy: 1.5, arm: 0.2, ew: 0.1, tbm: 0.15 } },
];

// After the last phase, each PHASE_LEN brings a new condition on top of COMBINED RAID's mix, looping in order.
// sig/persist: detection chance / contact memory multipliers; spawn/hp: on top of difficulty(); w: extra spawn weights.
export interface Mod { name: string; desc: string; sig?: number; persist?: number; spawn?: number; hp?: number; dark?: boolean; w?: Partial<Record<EnemyKind, number>> }
export const MODS: Mod[] = [
  { name: 'NIGHT RAID', desc: 'contacts fade twice as fast', persist: 0.5, dark: true },
  { name: 'GROUND CLUTTER', desc: '-30% detection chance', sig: 0.7 },
  { name: 'LULL', desc: 'fewer raiders, clear skies · rebuild', spawn: 0.6, sig: 1.2 },
  { name: 'JAMMING STORM', desc: 'EW helicopters inbound', w: { ew: 0.8 } },
  { name: 'SWARM TIDE', desc: 'many more, much weaker', spawn: 1.5, hp: 0.6, w: { swarm: 4, decoy: 2 } },
  { name: 'SEAD WAVE', desc: 'strike aircraft and ARMs', w: { arm: 0.8, elite: 0.3 } },
];

// Raids: a named group from one bearing, announced RAID_WARN s ahead. Counts are packs, scaled up over time.
// Kill the whole raid without a hit on the battery (or the radar) for a bonus.
export const RAID_FIRST = 110, RAID_EVERY = 80, RAID_WARN = 6; // s
export const RAID_BONUS = 0.5; // share of the raid's total reward, + 25 flat
export const RAIDS: { name: string; from: number; g: Partial<Record<EnemyKind, number>> }[] = [
  { name: 'SHAHED WAVE', from: 0, g: { drone: 6 } },
  { name: 'LANCET PACK', from: 0, g: { scout: 7 } },
  { name: 'FPV SWARM', from: 0, g: { swarm: 3 } },
  { name: 'DECOY SCREEN', from: 150, g: { decoy: 2, drone: 4 } },
  { name: 'HELO ASSAULT', from: 200, g: { tank: 3, scout: 3 } },
  { name: 'SEAD STRIKE', from: 280, g: { arm: 2, decoy: 2, drone: 3 } },
  { name: 'ISKANDER SALVO', from: 240, g: { tbm: 3 } },
];

// Radar threats. ARMs home on the radar while it radiates, and a hit takes it offline. EMCON [F] silences it:
// no sweep, no locks, no radar power drain, and ARMs lose the emitter and veer off course.
export const ARM_STUN = 6; // s offline per ARM hit (stacks up to 2x)
export const ARM_VEER = 0.6; // rad an ARM swings off its heading once the radar goes dark
export const ARM_TURN = 1.5; // rad/s; limited, so a late EMCON still gets hit
export const ARM_LIFE = 16; // s of motor, then it falls short
export const ARM_EVERY = 10; // s between ARM launches per Su-34 inside ARM_LAUNCH_R
export const ARM_LAUNCH_R = 52;
export const DECOY_ID = 1.5; // s of lock before the ECS classifies a decoy (÷ radar resolution)
export const EW_ORBIT = 38; // Mi-8 jammers stand off at this range and circle
export const EW_ARC = 0.4; // rad half-width of each jammed sector
export const EW_JAM = 0.35; // detection chance multiplier inside a jammed sector

// Logarithmic growth: every doubling of play time adds about the same threat, so upgrades (whose costs grow
// exponentially) can keep up and a run has no built-in end. m = minutes played.
export const grow = (m: number, k: number) => 1 + k * Math.log1p(m / 4);
export function difficulty(t: number) {
  const m = t / 60;
  return {
    spawnRate: 0.6 * grow(m, 1.6), // spawn events / s
    hp: grow(m, 1),
    speed: 1 + 0.025 * Math.min(m, 20),
    dmg: grow(m, 0.6),
  };
}

// cannon = PAC-3 MSE (hit-to-kill, lead intercept), pulse = HEL laser, missile = IRIS-T SLX (blast-frag), rail = HPM microwave.
export type WeaponKind = 'cannon' | 'pulse' | 'missile' | 'rail';
export const WEAPONS: Record<WeaponKind, {
  dmg: number; rate: number; range: number; speed: number; ammo: number; power: number; splash: number;
}> = {
  cannon: { dmg: 5, rate: 2.5, range: 45, speed: 60, ammo: 1, power: 0, splash: 0 },
  pulse: { dmg: 2, rate: 6, range: 38, speed: 0, ammo: 0, power: 1.5, splash: 0 },
  missile: { dmg: 12, rate: 0.7, range: 60, speed: 30, ammo: 3, power: 0, splash: 4 },
  rail: { dmg: 40, rate: 0.35, range: 70, speed: 0, ammo: 0, power: 25, splash: 0 },
};

export const MODES = ['CLOSEST', 'WEAKEST', 'RICHEST', 'FASTEST'] as const;

// Fire discipline [G]: how hard the battery spends interceptors and power.
// rate: fire rate · cost: ammo and power per shot · range: engagement range (fire late = better odds, closer threats)
// commit: damage already in flight before a target is left alone (1 = just enough to kill it; more = overkill).
export const DISCIPLINES = [
  { name: 'CONSERVE', rate: 0.75, cost: 0.75, range: 0.75, commit: 1 },
  { name: 'BALANCED', rate: 1, cost: 1, range: 1, commit: 1 },
  { name: 'MAXIMUM', rate: 1.4, cost: 1.3, range: 1, commit: 1.6 },
];
// Priority target (click): always holds a lock slot, is engaged first and takes extra damage, but painting it
// for fire control costs power every second it's held.
export const PRIORITY_DMG = 1.25, PRIORITY_POWER = 1.2; // damage multiplier, power/s
// Emergency intercept [Space]: every weapon (and every pad in range) fires only at the priority target (or the
// most urgent threat), faster, and keeps firing past a sure kill. Costs power up front, then a long cooldown.
export const INTERCEPT = { time: 4, cooldown: 30, power: 25, rate: 1.6 };

export interface Upgrade {
  id: string; name: string; group: string; desc: string;
  base: number; mult: number; max: number;
  req?: number; // base level needed to buy
}
export const SWEEP_CAP = 8; // Scan Rate levels a rotating radar can take; LTAMDS AESA lifts it
const U = (group: string, id: string, name: string, base: number, mult: number, max: number, desc: string, req?: number): Upgrade =>
  ({ group, id, name, base, mult, max, desc, req });

export const UPGRADES: Upgrade[] = [
  U('BATTERY', 'hp', 'Hardened Shelters', 60, 1.45, Infinity, '+40 max HP'),
  U('BATTERY', 'armor', 'Earth Revetments', 90, 1.6, Infinity, '-12% of the damage still taken'),
  U('BATTERY', 'repair', 'Maintenance Crew', 120, 1.6, Infinity, '+0.6 HP/s'),
  U('POWER', 'gen', 'EPP-III Generator', 50, 1.45, Infinity, '+3 power/s'),
  U('POWER', 'cap', 'Battery Banks', 40, 1.4, Infinity, '+40 power storage'),
  U('SENSORS', 'range', 'LTAMDS Array', 60, 1.5, Infinity, '+7 detection range'),
  U('SENSORS', 'sweep', 'TRML-4D Scan Rate', 70, 1.5, Infinity, '+20% scan rate (max 8 on a rotating radar)'),
  U('SENSORS', 'aesa', 'LTAMDS AESA', 600, 1, 1, 'staring 360° array: no sweep · +25% scan rate · uncaps scan rate', 4),
  U('SENSORS', 'res', 'GaN T/R Modules', 50, 1.5, Infinity, '+15% detection chance · faster decoy ID'),
  U('SENSORS', 'persist', 'Track Memory', 50, 1.45, Infinity, '+1.5s contact memory'),
  U('FIRE CONTROL', 'slots', 'ECS Channels', 80, 1.55, Infinity, '+1 simultaneous lock'),
  U('FIRE CONTROL', 'trange', 'Track Range', 60, 1.5, Infinity, '+6 tracking range'),
  U('FIRE CONTROL', 'modes', 'Threat Evaluation', 100, 2, 3, 'unlock next auto mode [T]'),
  U('WEAPONS', 'dmg', 'Lethality Enhancer', 70, 1.45, Infinity, '+25% all weapon damage'),
  U('WEAPONS', 'rate', 'Salvo Doctrine', 80, 1.5, Infinity, '+15% all fire rate'),
  U('WEAPONS', 'pulse', 'HEL 50kW Laser', 250, 1.7, Infinity, 'power beam · +40%/lv'),
  U('WEAPONS', 'missile', 'IRIS-T SLX', 400, 1.7, Infinity, 'homing blast-frag · +40%/lv'),
  U('WEAPONS', 'rail', 'HPM Leonidas', 700, 1.7, Infinity, 'microwave, hits the whole line · +40%/lv'),
  U('MAGAZINE', 'acap', 'M903 Canisters', 40, 1.4, Infinity, '+25 interceptor capacity'),
  U('MAGAZINE', 'aprod', 'GMT Reload', 50, 1.45, Infinity, '+1.5 interceptors/s'),
  U('PERIMETER', 'mantis', 'MANTIS 35mm C-RAM', 150, 1.35, Infinity, 'fast gun, short range · +1 emplacement', 2),
  U('PERIMETER', 'stinger', 'Stinger Team', 220, 1.35, Infinity, 'MANPADS, mid range homing · +1 emplacement', 3),
  U('PERIMETER', 'jammer', 'EW Jammer', 300, 1.4, Infinity, 'slows contacts nearby, drains power · +1 emplacement', 4),
];

// Perimeter emplacements sit on a ring around the battery and engage any radar contact in their own
// range, without using a lock slot. Each base level opens 2 more pads.
export type PerimKind = 'mantis' | 'stinger' | 'jammer';
export const PERIM_KINDS: PerimKind[] = ['mantis', 'stinger', 'jammer'];
export const PERIM_R = 13;
export const PAD_SLOTS = 8; // fixed spots round the ring, between the M903s
export const PLACE_TIME = 8; // s to click a spot before the pad places itself toward the nearest threat
export const perimSlots = (level: number) => Math.min(8, 2 * (level - 1));
export const PERIM = {
  mantis: { dmg: 1.2, rate: 10, range: 16, ammo: 0.15, power: 0 },
  stinger: { dmg: 7, rate: 0.8, range: 26, ammo: 1, power: 0 },
  jammer: { dmg: 0, rate: 0, range: 18, ammo: 0, power: 1.2 }, // power/s while anything is in range
};
export const JAM_SLOW = 0.55; // speed multiplier inside a jammer bubble (elites ignore it)

// Multipliers (`add*` fields are additive). Every perk trades something.
export interface PerkFx {
  dmg?: number; rate?: number; gen?: number; range?: number; sweep?: number; aprod?: number;
  credits?: number; hp?: number; persist?: number; drain?: number; trange?: number;
  addSlots?: number; addArmor?: number; addChain?: number;
  // rule changers
  addFusion?: number; addLpi?: number; addArc?: number; addScav?: number; addFrag?: number; markDmg?: number;
}
// `min`: base level before it's offered; `need`: upgrade that must be owned. Rule perks (`rule`) are one-offs
// that change how the game plays; from base level 5 every draft includes one while any are left.
export const PERKS: { id: string; name: string; desc: string; fx: PerkFx; rule?: boolean; min?: number; need?: string }[] = [
  { id: 'overcharge', name: 'OVERCHARGE', desc: '+50% damage · -30% power gen', fx: { dmg: 1.5, gen: 0.7 } },
  { id: 'highfreq', name: 'HIGH FREQUENCY', desc: '+40% sweep speed · -15% radar range', fx: { sweep: 1.4, range: 0.85 } },
  { id: 'logistics', name: 'AUTOMATED LOGISTICS', desc: '+100% ammo production · -15% credits', fx: { aprod: 2, credits: 0.85 } },
  { id: 'glass', name: 'GLASS CANNON', desc: '+100% damage · -40% max HP', fx: { dmg: 2, hp: 0.6 } },
  { id: 'salvage', name: 'SALVAGE', desc: '+25% credits · -15% damage', fx: { credits: 1.25, dmg: 0.85 } },
  { id: 'trigger', name: 'HAIR TRIGGER', desc: '+35% fire rate · -20% ammo production', fx: { rate: 1.35, aprod: 0.8 } },
  { id: 'deepscan', name: 'DEEP SCAN', desc: '+30% radar range · -20% sweep speed', fx: { range: 1.3, sweep: 0.8 } },
  { id: 'fortress', name: 'FORTRESS', desc: '+50% max HP · +10% armor · -15% fire rate', fx: { hp: 1.5, addArmor: 0.1, rate: 0.85 } },
  { id: 'signal', name: 'SIGNAL BOOST', desc: 'x2 contact memory · +50% radar power drain', fx: { persist: 2, drain: 1.5 } },
  { id: 'multilock', name: 'MULTI-LOCK', desc: '+2 lock slots · -15% track range', fx: { addSlots: 2, trange: 0.85 } },
  { id: 'reactor', name: 'REACTOR', desc: '+60% power gen · -15% max HP', fx: { gen: 1.6, hp: 0.85 } },
  { id: 'chain', name: 'CHAIN REACTION', desc: 'kills explode for 6 dmg · -10% credits', fx: { addChain: 6, credits: 0.9 } },
  { id: 'fusion', name: 'TRACK FUSION', desc: 'locks hold while the radar is dark · -1 lock slot', fx: { addFusion: 1, addSlots: -1 }, rule: true, min: 5 },
  { id: 'lpi', name: 'LPI WAVEFORM', desc: 'ARMs only find your radar inside 25m · -20% radar range', fx: { addLpi: 1, range: 0.8 }, rule: true, min: 5 },
  { id: 'overwatch', name: 'OVERWATCH', desc: 'your marked target takes x2 damage · -1 lock slot', fx: { markDmg: 2, addSlots: -1 }, rule: true, min: 5 },
  { id: 'arc', name: 'ARC LASER', desc: 'laser jumps to 2 more targets at 60% · -10% damage', fx: { addArc: 2, dmg: 0.9 }, rule: true, min: 5, need: 'pulse' },
  { id: 'scav', name: 'SCAVENGER', desc: 'every kill refunds 2 interceptors · -10% max HP', fx: { addScav: 2, hp: 0.9 }, rule: true, min: 5 },
  { id: 'frag', name: 'FRAG WARHEADS', desc: 'PAC-3 hits splash for 50% · -15% fire rate', fx: { addFrag: 0.5, rate: 0.85 }, rule: true, min: 5 },
];

// Doctrines: a starting loadout picked before a normal run (daily ops fly STANDARD). Free upgrade levels that
// don't count toward base level. Unlocked by your all-time records.
export type Records = { time: number; kills: number; level: number; earned: number };
export const DOCTRINES: { id: string; name: string; desc: string; need: string; lv: Record<string, number>; unlock: (b: Records) => boolean }[] = [
  { id: 'standard', name: 'STANDARD', desc: 'by the book', need: '', lv: {}, unlock: () => true },
  { id: 'sensor', name: 'SENSOR NET', desc: 'LTAMDS 2 · GaN 2 · Track Memory 1', need: 'survive 5:00', lv: { range: 2, res: 2, persist: 1 }, unlock: b => b.time >= 300 },
  { id: 'logistics', name: 'LOGISTICS', desc: 'Generator 2 · Canisters 2 · Reload 2', need: 'earn 5,000 credits in a run', lv: { gen: 2, acap: 2, aprod: 2 }, unlock: b => b.earned >= 5000 },
  { id: 'strike', name: 'FORWARD STRIKE', desc: 'Lethality 2 · Salvo 1 · +1 ECS channel', need: 'reach base level 6', lv: { dmg: 2, rate: 1, slots: 1 }, unlock: b => b.level >= 6 },
];

// Base level L is reached at 1.5*(L-1)*L upgrades bought: 0, 3, 9, 18, 30, 45, 63...
export const baseLevel = (bought: number) => {
  let l = 1;
  while (1.5 * l * (l + 1) <= bought) l++;
  return l;
};

export function deriveStats(lv: Record<string, number>, perks: string[]) {
  const L = (id: string) => lv[id] ?? 0;
  const p = { dmg: 1, rate: 1, gen: 1, range: 1, sweep: 1, aprod: 1, credits: 1, hp: 1, persist: 1, drain: 1, trange: 1, addSlots: 0, addArmor: 0, addChain: 0,
    addFusion: 0, addLpi: 0, addArc: 0, addScav: 0, addFrag: 0, markDmg: 1 };
  for (const id of perks) {
    const fx = PERKS.find(x => x.id === id)!.fx;
    for (const [k, v] of Object.entries(fx) as [keyof typeof p, number][]) {
      if (k.startsWith('add')) p[k] += v; else p[k] *= v;
    }
  }
  const radarLv = L('range') + L('sweep') + L('res') + L('persist');
  const weapon = (k: WeaponKind, owned: boolean, extra: number) => {
    const w = WEAPONS[k];
    return owned ? { ...w, dmg: w.dmg * (1 + 0.25 * L('dmg')) * extra * p.dmg, rate: w.rate * (1 + 0.15 * L('rate')) * p.rate } : null;
  };
  const wlv = (k: string) => 1 + 0.4 * Math.max(0, L(k) - 1);
  return {
    maxHp: (100 + 40 * L('hp')) * p.hp,
    armor: Math.min(0.85, 0.85 * (1 - 0.88 ** L('armor')) + p.addArmor),
    repair: 0.6 * L('repair'),
    gen: (6 + 3 * L('gen')) * p.gen,
    powerCap: 60 + 40 * L('cap'),
    radarRange: (42 + 7 * L('range')) * p.range,
    sweep: 2.5 * (1 + 0.2 * L('sweep')) * (L('aesa') ? 1.25 : 1) * p.sweep, // rad/s; with AESA: revisits/rev-equivalent
    aesa: L('aesa') > 0,
    res: 1 + 0.15 * L('res'),
    persist: (4.5 + 1.5 * L('persist')) * p.persist,
    drain: (1.5 + 0.25 * radarLv) * p.drain,
    slots: 2 + L('slots') + p.addSlots,
    trackRange: (45 + 6 * L('trange')) * p.trange,
    modes: 1 + L('modes'),
    ammoCap: 40 + 25 * L('acap'),
    ammoProd: (3 + 1.5 * L('aprod')) * p.aprod,
    ammoPower: 0.5, // power per round produced
    credits: p.credits,
    chain: p.addChain,
    fusion: p.addFusion > 0, lpi: p.addLpi > 0, arc: p.addArc, scav: p.addScav, frag: p.addFrag, markDmg: p.markDmg,
    perim: {
      mantis: { ...PERIM.mantis, dmg: PERIM.mantis.dmg * (1 + 0.25 * L('dmg')) * p.dmg, rate: PERIM.mantis.rate * (1 + 0.15 * L('rate')) * p.rate },
      stinger: { ...PERIM.stinger, dmg: PERIM.stinger.dmg * (1 + 0.25 * L('dmg')) * p.dmg, rate: PERIM.stinger.rate * (1 + 0.15 * L('rate')) * p.rate },
      jammer: PERIM.jammer,
    },
    weapons: {
      cannon: weapon('cannon', true, 1),
      pulse: weapon('pulse', L('pulse') > 0, wlv('pulse')),
      missile: weapon('missile', L('missile') > 0, wlv('missile')),
      rail: weapon('rail', L('rail') > 0, wlv('rail')),
    },
  };
}
export type Stats = ReturnType<typeof deriveStats>;
