// Every tunable number lives here.

export const ARENA_R = 60;
export const BASE_R = 3.5;
export const START_CREDITS = 150;
export const COMBO_WINDOW = 1.5; // s between kills to keep the combo
export const COMBO_BONUS = 0.02; // +2% credits per combo step
export const COMBO_CAP = 50;
export const PHASE_LEN = 75; // s
export const ELITE_EVERY = 150; // s

export type EnemyKind = 'scout' | 'drone' | 'swarm' | 'tank' | 'elite';

export interface EnemyType {
  hp: number; speed: number; dmg: number; reward: number;
  size: number; sig: number; color: number; pack: number; wobble: number;
}

export const ENEMIES: Record<EnemyKind, EnemyType> = {
  scout: { hp: 3, speed: 7, dmg: 3, reward: 6, size: 0.8, sig: 0.6, color: 0xff8a3d, pack: 1, wobble: 3 },
  drone: { hp: 8, speed: 4, dmg: 6, reward: 10, size: 1.1, sig: 0.9, color: 0xff4a3d, pack: 1, wobble: 0.6 },
  swarm: { hp: 2, speed: 5.5, dmg: 2, reward: 3, size: 0.5, sig: 0.45, color: 0xffb03d, pack: 6, wobble: 1.5 },
  tank: { hp: 45, speed: 1.8, dmg: 20, reward: 50, size: 2, sig: 1.4, color: 0xff2a55, pack: 1, wobble: 0 },
  elite: { hp: 160, speed: 3.5, dmg: 40, reward: 200, size: 2.4, sig: 1.2, color: 0xff2aff, pack: 1, wobble: 1 },
};
export const KINDS = Object.keys(ENEMIES) as EnemyKind[];

// Spawn weights per phase; last entry repeats forever.
export const PHASES: { name: string; w: Partial<Record<EnemyKind, number>> }[] = [
  { name: 'SCOUTS', w: { scout: 3, drone: 2 } },
  { name: 'SWARM', w: { scout: 2, drone: 3, swarm: 1 } },
  { name: 'ARMOR', w: { scout: 2, drone: 3, swarm: 1, tank: 1 } },
  { name: 'ELITES', w: { scout: 2, drone: 3, swarm: 1, tank: 1, elite: 0.15 } },
  { name: 'EVERYTHING', w: { scout: 2, drone: 3, swarm: 2, tank: 1.5, elite: 0.3 } },
];

export function difficulty(t: number) {
  const m = t / 60;
  return {
    spawnRate: 0.6 * (1 + 0.35 * m ** 1.1), // spawn events / s
    hp: 1 + 0.12 * m ** 1.25,
    speed: 1 + 0.025 * Math.min(m, 20),
    dmg: 1 + 0.08 * m,
  };
}

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

export interface Upgrade {
  id: string; name: string; group: string; desc: string;
  base: number; mult: number; max: number;
}
const U = (group: string, id: string, name: string, base: number, mult: number, max: number, desc: string): Upgrade =>
  ({ group, id, name, base, mult, max, desc });

export const UPGRADES: Upgrade[] = [
  U('BASE', 'hp', 'Hull Plating', 60, 1.45, 20, '+40 max HP'),
  U('BASE', 'armor', 'Armor', 90, 1.6, 7, '-8% damage taken'),
  U('BASE', 'repair', 'Auto Repair', 120, 1.6, 8, '+0.6 HP/s'),
  U('POWER', 'gen', 'Generator', 50, 1.45, 20, '+3 power/s'),
  U('POWER', 'cap', 'Capacitors', 40, 1.4, 15, '+40 power storage'),
  U('RADAR', 'range', 'Radar Range', 60, 1.5, 10, '+7 detection range'),
  U('RADAR', 'sweep', 'Sweep Speed', 70, 1.5, 8, '+20% sweep speed'),
  U('RADAR', 'res', 'Resolution', 50, 1.5, 6, '+15% detection chance'),
  U('RADAR', 'persist', 'Persistence', 50, 1.45, 8, '+1.5s contact memory'),
  U('TRACKING', 'slots', 'Lock Slots', 80, 1.55, 10, '+1 simultaneous lock'),
  U('TRACKING', 'trange', 'Track Range', 60, 1.5, 8, '+6 tracking range'),
  U('TRACKING', 'modes', 'Target Logic', 100, 2, 3, 'unlock next auto mode [T]'),
  U('WEAPONS', 'dmg', 'Damage', 70, 1.45, 25, '+25% all weapon damage'),
  U('WEAPONS', 'rate', 'Fire Rate', 80, 1.5, 15, '+15% all fire rate'),
  U('WEAPONS', 'pulse', 'Pulse Laser', 250, 1.7, 6, 'power beam · +40%/lv'),
  U('WEAPONS', 'missile', 'Missiles', 400, 1.7, 6, 'homing splash · +40%/lv'),
  U('WEAPONS', 'rail', 'Railgun', 700, 1.7, 6, 'piercing power shot · +40%/lv'),
  U('AMMO', 'acap', 'Ammo Racks', 40, 1.4, 15, '+25 ammo capacity'),
  U('AMMO', 'aprod', 'Ammo Fab', 50, 1.45, 15, '+1.5 rounds/s'),
];

// Multipliers (`add*` fields are additive). Every perk trades something.
export interface PerkFx {
  dmg?: number; rate?: number; gen?: number; range?: number; sweep?: number; aprod?: number;
  credits?: number; hp?: number; persist?: number; drain?: number; trange?: number;
  addSlots?: number; addArmor?: number; addChain?: number;
}
export const PERKS: { id: string; name: string; desc: string; fx: PerkFx }[] = [
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
];

// Base level L is reached at 1.5*(L-1)*L upgrades bought: 0, 3, 9, 18, 30, 45, 63...
export const baseLevel = (bought: number) => {
  let l = 1;
  while (1.5 * l * (l + 1) <= bought) l++;
  return l;
};

export function deriveStats(lv: Record<string, number>, perks: string[]) {
  const L = (id: string) => lv[id] ?? 0;
  const p = { dmg: 1, rate: 1, gen: 1, range: 1, sweep: 1, aprod: 1, credits: 1, hp: 1, persist: 1, drain: 1, trange: 1, addSlots: 0, addArmor: 0, addChain: 0 };
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
    armor: Math.min(0.75, 0.08 * L('armor') + p.addArmor),
    repair: 0.6 * L('repair'),
    gen: (6 + 3 * L('gen')) * p.gen,
    powerCap: 60 + 40 * L('cap'),
    radarRange: (42 + 7 * L('range')) * p.range,
    sweep: 2.5 * (1 + 0.2 * L('sweep')) * p.sweep, // rad/s
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
    weapons: {
      cannon: weapon('cannon', true, 1),
      pulse: weapon('pulse', L('pulse') > 0, wlv('pulse')),
      missile: weapon('missile', L('missile') > 0, wlv('missile')),
      rail: weapon('rail', L('rail') > 0, wlv('rail')),
    },
  };
}
export type Stats = ReturnType<typeof deriveStats>;
