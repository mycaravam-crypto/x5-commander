// Every tunable number lives here.

// Defence layers, innermost out (reach in m): HPM 7 · MG 10 · HEL 11 · MANTIS 15 · Stinger 24 · IRIS-T SLM 40 ·
// IRIS-T SLX 50 · PAC-3 58 · radar 68+. Real reaches span ~1 km to 100+ km; the arena keeps their order and
// stretches the ratios as far as a readable map allows. Stand-off threats sit just outside the layer they outrange.
export const ARENA_R = 75;
export const BASE_R = 3.5;
export const START_CREDITS = 150;
export const COMBO_WINDOW = 1.5; // s between kills to keep the combo
export const COMBO_BONUS = 0.02; // +2% credits per combo step
export const COMBO_CAP = 50;
// A run is a string of levels: LEVEL_LEN s of waves, then the level's raid, then a build window with no spawns
// (BUILD_TIME if the raid's objective held, BUILD_LOST if not) before the next level starts.
export const LEVEL_LEN = 60, BUILD_TIME = 20, BUILD_LOST = 8; // s
export const ELITE_FROM = 5; // level index (SEAD) from which every level has a Su-34 strike package halfway through

// Green phosphor HUD palette, shared by the overlays in the 3D scene and the CSS (hud.ts copies it into CSS variables).
// Hierarchy: dim/mid for frames and labels, bright for text and what's active, hot for what's yours, locked or
// selected, amber (alert) for warnings, red (crit) only for the worst: battery critical, radar knocked out.
export const PAL = { dim: 0x0b3d1f, mid: 0x1f9e4f, bright: 0x39ff88, hot: 0xc8ffe0, alert: 0xffb000, crit: 0xff4a2a };
// Radar bearing in degrees, 0-360, measured from +x toward +z (grid labels and the HUD use the same one).
// The front: manned aircraft and short-range drones (launched from the line) always come from FRONT ± FRONT_ARC,
// the top of the default view. Long-range drones and missiles (`flank` below) can come from anywhere within the
// current level's `arc` around it, which widens as the run goes on.
export const FRONT = -Math.PI / 2, FRONT_ARC = 25 * Math.PI / 180;
const DEG = Math.PI / 180;
export const bearing = (x: number, z: number) => ((Math.atan2(z, x) * 180 / Math.PI) % 360 + 360) % 360;

export type EnemyKind = 'scout' | 'drone' | 'swarm' | 'tank' | 'elite' | 'decoy' | 'arm' | 'ew' | 'tbm' | 'cruise' | 'atgm' | 'kab'
  | 'recon' | 'ka52' | 'hyper' | 'mald' | 'su25' | 'rocket' | 'sead' | 'arm2' | 'halo' | 'backfire' | 'okhotnik' | 'mainstay'
  | 'walker' | 'gunbot' | 'mech' | 'crawler' | 'dog' | 'sapper' | 'arty' | 'titan'; // GROUND ASSAULT: robots on foot

export interface EnemyType {
  hp: number; speed: number; reward: number;
  dmg: number; // on impact; for the Mi-28 and Su-34, which don't ram, what their weapons carry (the threat board ranks by it)
  name: string; code: string; // display name + short label code
  size: number; glow: number; // glow: brightness on PAL.bright (tank/elite also blink, see render.ts)
  sig: number; // radar cross-section: detection chance x per look
  ir: number; // heat signature: IR seekers (Stinger, IRIS-T SLM) hit x (1 + IR_SEEKER * (ir - 1)); cold electric drones low, jets and helicopters high
  alt: number; // m it flies over the ground: under RADAR_HORIZON.full the radar sees it only closer in (drawn at it too)
  pack: number; wobble: number;
  packs?: [number, number]; // a normal spawn brings between these many (groups and raids fly `pack`, so briefings add up)
  flank?: boolean; // long-range: may come round the flanks (see FRONT)
  pacOnly?: boolean; // only PAC-3 hit-to-kill can stop it
  ballistic?: boolean; // comes down steeply from high up (TERMINAL): the height it's drawn at grows with range
  padHit?: number; // a munition fired at a unit: how much harder it hits the unit than its damage says
  mimic?: EnemyKind; // a decoy: flies, shows and is announced as this type until fire control classifies it (DECOY_ID)
  drop: number; // chance a kill leaves salvage behind (see DROPS)
  ground?: boolean; // walks: only perimeter units can engage it (no locks, no battery weapons), see GROUND
  armour?: number; // damage x from guns and grenades (Javelin, mortar and mines hit it in full, ANTI_ARMOUR)
}

export const ENEMIES: Record<EnemyKind, EnemyType> = {
  scout: { name: 'Lancet-3 loitering munition', code: 'LANCET', hp: 3, speed: 7, dmg: 3, reward: 6, size: 0.8, sig: 0.6, ir: 0.5, alt: 4, glow: 1, pack: 1, wobble: 3, drop: 0.02 },
  drone: { name: 'Shahed-136 one-way attack drone', code: 'SHAHED', hp: 8, speed: 4, dmg: 6, reward: 10, size: 1.1, sig: 0.9, ir: 0.8, alt: 5.5, glow: 0.8, pack: 1, wobble: 0.6, flank: true, drop: 0.03 },
  // Tiny, cold and right on the treetops: under the radar horizon and easily masked, so eyes usually see them first.
  swarm: { name: 'FPV strike swarm', code: 'FPV', hp: 2, speed: 5.5, dmg: 2, reward: 3, size: 0.5, sig: 0.4, ir: 0.4, alt: 1.8, glow: 0.6, pack: 6, packs: [4, 8], wobble: 1.5, drop: 0.008 },
  tank: { name: 'Mi-28NM attack helicopter', code: 'MI-28', hp: 45, speed: 1.8, dmg: 20, reward: 50, size: 2, sig: 1.4, ir: 1.4, alt: 3.5, glow: 1, pack: 1, wobble: 0, drop: 0.12 },
  elite: { name: 'Su-34 strike fighter', code: 'SU-34', hp: 160, speed: 3.5, dmg: 40, reward: 200, size: 2.4, sig: 1.2, ir: 1.6, alt: 9, glow: 1.5, pack: 1, wobble: 1, drop: 0.4 },
  // Looks exactly like a Shahed (bigger radar return, even) until the ECS classifies it. Harmless, worthless.
  decoy: { name: 'Gerbera decoy drone', code: 'DECOY', hp: 5, speed: 3.8, dmg: 0, reward: 0, size: 1.1, sig: 1.1, ir: 0.7, alt: 5.5, glow: 0.8, pack: 3, wobble: 0.6, flank: true, mimic: 'drone', drop: 0 }, // flies with the Shaheds, so it can't give them away
  arm: { name: 'Kh-31P anti-radiation missile', code: 'KH-31P', hp: 4, speed: 10, dmg: 5, reward: 15, size: 0.8, sig: 0.55, ir: 1.3, alt: 7, glow: 1.2, pack: 2, wobble: 0, drop: 0.03 },
  // Big radar return, very fast, hits hard. Nothing but PAC-3 touches it.
  tbm: { name: 'Iskander-M ballistic missile', code: 'ISKANDER', hp: 5, speed: 12, dmg: 25, reward: 60, size: 1, sig: 1.6, ir: 1.5, alt: 0, glow: 1.3, pack: 1, wobble: 0, pacOnly: true, flank: true, ballistic: true, drop: 0.1 },
  // Low, fast and weaving, and it goes for your most valuable unit instead of the base (see sim.cruiseTarget).
  // Follows the terrain under the radar horizon, then jinks and pops up over its target (CRUISE_TERMINAL).
  cruise: { name: 'Kh-101 cruise missile', code: 'KH-101', hp: 6, speed: 8, dmg: 15, reward: 40, size: 1, sig: 0.35, ir: 1, alt: 1.2, glow: 1.1, pack: 1, wobble: 2, flank: true, drop: 0.08 },
  ew: { name: 'Mi-8MTPR-1 EW helicopter', code: 'MI-8PR', hp: 60, speed: 2.5, dmg: 0, reward: 80, size: 1.8, sig: 1.6, ir: 1.4, alt: 5, glow: 1, pack: 1, wobble: 0, drop: 0.3 },
  // Launched by other enemies, never spawned on their own: the Mi-28's and Ka-52's anti-tank missiles, the Su-34's glide bomb.
  atgm: { name: '9M120 Ataka anti-tank missile', code: 'ATAKA', hp: 3, speed: 9, dmg: 6, reward: 4, size: 0.6, sig: 0.4, ir: 1.2, alt: 2.5, glow: 1.2, pack: 1, wobble: 0, padHit: 2.5, drop: 0 },
  kab: { name: 'KAB-500 glide bomb (UMPK kit)', code: 'KAB', hp: 35, speed: 4.5, dmg: 40, reward: 20, size: 1, sig: 0.9, ir: 0.5, alt: 0, glow: 1, pack: 1, wobble: 0, drop: 0 },
  // High, slow, big on radar, cold. Does no harm itself, but while it circles on station everything in its sector
  // is spotted for: hits harder and finds your units from further out (RECON). Kill it and the sector goes blind.
  recon: { name: 'Orlan-10 reconnaissance drone', code: 'ORLAN', hp: 12, speed: 2.4, dmg: 0, reward: 45, size: 1.3, sig: 1.5, ir: 0.5, alt: 11, glow: 0.8, pack: 1, wobble: 0.3, flank: true, drop: 0.15 },
  // Comes round the flank, settles into a masked hover at standoff and pops up to fire ATGM pairs at your units
  // (the battery if none is in reach). Easy to see while it flies in and settles; hard once it's masked (KA52).
  ka52: { name: 'Ka-52 Alligator attack helicopter', code: 'KA-52', hp: 55, speed: 2.4, dmg: 20, reward: 70, size: 2, sig: 1.3, ir: 1.4, alt: 4, glow: 1, pack: 1, wobble: 0, flank: true, drop: 0.15 },
  // Kinzhal: an Iskander that comes in higher and faster, speeding up in the dive. Late war, PAC-3 only.
  hyper: { name: 'Kh-47M2 Kinzhal aeroballistic missile', code: 'KINZHAL', hp: 5, speed: 15, dmg: 35, reward: 90, size: 1.1, sig: 1.2, ir: 1.8, alt: 0, glow: 1.5, pack: 1, wobble: 0, pacOnly: true, flank: true, ballistic: true, drop: 0.12 },
  // An old Kh-55 with no warhead, fired among the Kh-101s: reads as one on radar and on the warning net until
  // classified, soaking locks and interceptors. It dives on a unit like the real thing, and does nothing.
  mald: { name: 'Kh-55 decoy cruise missile (inert)', code: 'KH-55', hp: 5, speed: 7.5, dmg: 0, reward: 0, size: 1, sig: 0.45, ir: 0.9, alt: 1.2, glow: 1.1, pack: 1, wobble: 2, flank: true, mimic: 'cruise', drop: 0 },
  // Armoured low-level attack jet: comes in under the radar horizon, pops up with flares out to fire an S-8 salvo at
  // a unit (the battery if none in reach), breaks away in a banking turn and comes round again (SU25).
  su25: { name: 'Su-25SM3 ground-attack jet', code: 'SU-25', hp: 90, speed: 4.5, dmg: 20, reward: 110, size: 1.9, sig: 0.9, ir: 1.3, alt: 2.8, glow: 1.2, pack: 1, wobble: 0.4, drop: 0.3 },
  // Fired by the Su-25 in salvos: fast, unguided, flying straight at the point it was aimed at. Guns can shoot it down.
  rocket: { name: 'S-8 unguided rocket', code: 'S-8', hp: 1, speed: 13, dmg: 3, reward: 1, size: 0.4, sig: 0.25, ir: 1.1, alt: 2, glow: 1.2, pack: 1, wobble: 0, padHit: 2, drop: 0 },
  // Dedicated SEAD fighter: holds station out on the front while the radar radiates and fires Kh-58s at it (SEAD).
  // No bombs, so it never comes in: kill it on station or go dark and wait it out.
  sead: { name: 'Su-35S SEAD fighter (Kh-58)', code: 'SU-35S', hp: 120, speed: 3.8, dmg: 8, reward: 180, size: 2.3, sig: 1, ir: 1.6, alt: 10, glow: 1.5, pack: 1, wobble: 0.5, drop: 0.35 },
  // Kh-58UShKE: heavier, longer-burning ARM with a memory seeker. Going dark doesn't make it veer off: it flies on at
  // where it last heard the radar, off by up to ARM2.scatter to the side, so EMCON cuts its odds instead of making it miss (ARM2).
  arm2: { name: 'Kh-58UShKE anti-radiation missile', code: 'KH-58', hp: 6, speed: 11, dmg: 8, reward: 25, size: 0.9, sig: 0.5, ir: 1.4, alt: 8, glow: 1.3, pack: 1, wobble: 0, drop: 0.04 },
  // Bosses (BOSSES): one leads the raid every BOSS_EVERY levels. HP here is a floor: the real figure comes from your
  // firepower (sim.bossHp). `dmg` is what their weapons carry, for the threat board; they hold off and never ram.
  halo: { name: 'Mi-26T2 heavy assault helicopter (FPV carrier)', code: 'MI-26', hp: 150, speed: 1.7, dmg: 20, reward: 300, size: 3.4, sig: 2, ir: 2, alt: 6, glow: 1.4, pack: 1, wobble: 0, drop: 0 },
  backfire: { name: 'Tu-22M3M long-range bomber', code: 'TU-22M3', hp: 200, speed: 3.6, dmg: 30, reward: 450, size: 3.6, sig: 1.8, ir: 2, alt: 12, glow: 1.6, pack: 1, wobble: 0, drop: 0 },
  okhotnik: { name: 'S-70 Okhotnik-B stealth UCAV', code: 'S-70', hp: 200, speed: 2.8, dmg: 40, reward: 550, size: 3.2, sig: 0.08, ir: 0.8, alt: 8, glow: 1.2, pack: 1, wobble: 0, drop: 0 },
  mainstay: { name: 'A-50U Mainstay airborne command post', code: 'A-50U', hp: 250, speed: 2.6, dmg: 10, reward: 700, size: 4, sig: 2.5, ir: 1.8, alt: 13, glow: 1.6, pack: 1, wobble: 0, drop: 0 },
  // GROUND ASSAULT only. Robots on foot, each modelled on a real prototype (README, *Ground assault*): under every
  // radar horizon, seen by eye, and out of reach of the battery's air-defence weapons. Only the perimeter stops them.
  // They walk at the pace real legged robots manage (a humanoid ~1.5-2 m/s, a robot dog ~3 m/s, a piloted mech a crawl).
  // Swarm mini-walker: knee-high, cheap and slow, sent in by the hundred (THE TIDE). Charges a unit within a few metres.
  crawler: { name: 'Swarm mini-walker (expendable bipedal)', code: 'MINI', hp: 4, speed: 1.2, dmg: 1.5, reward: 1, size: 0.55, sig: 0.3, ir: 0.4, alt: 0, glow: 0.6, pack: 1, packs: [12, 24], wobble: 1, flank: true, ground: true, drop: 0.002 },
  // Light walker (Unitree G1-class humanoid): comes in packs, charges the nearest unit it sees with a demolition charge (GROUND.seek), else the base.
  walker: { name: 'Light assault walker (G1-class humanoid)', code: 'WALKER', hp: 6, speed: 1.8, dmg: 4, reward: 7, size: 0.9, sig: 0.5, ir: 0.6, alt: 0, glow: 0.8, pack: 1, packs: [3, 6], wobble: 0.8, flank: true, ground: true, drop: 0.02 },
  // Armed robot dog (Vision 60-class quadruped with a rifle): fast, fires on the move at units close by (GROUND.dog).
  dog: { name: 'Armed robot dog (Vision 60-class quadruped)', code: 'DOG', hp: 5, speed: 3, dmg: 3, reward: 9, size: 0.8, sig: 0.4, ir: 0.6, alt: 0, glow: 0.8, pack: 1, packs: [2, 4], wobble: 1.4, flank: true, ground: true, drop: 0.03 },
  // Combat walker (Phantom-class armed humanoid): stops within GROUND.gun.reach of a unit and shoots it up, then walks on.
  gunbot: { name: 'Armed combat walker (Phantom-class humanoid)', code: 'GUNBOT', hp: 18, speed: 1.4, dmg: 8, reward: 20, size: 1.2, sig: 0.7, ir: 0.8, alt: 0, glow: 1, pack: 1, packs: [1, 3], wobble: 0.4, flank: true, ground: true, armour: 0.8, drop: 0.06 },
  // Breacher (Atlas-class humanoid): goes for your obstacles (wire, Claymores) and cuts them (GROUND.sapper); wire doesn't slow it.
  sapper: { name: 'Breacher walker (Atlas-class humanoid)', code: 'BREACH', hp: 14, speed: 1.6, dmg: 5, reward: 18, size: 1.1, sig: 0.6, ir: 0.7, alt: 0, glow: 0.9, pack: 1, packs: [1, 2], wobble: 0.5, flank: true, ground: true, armour: 0.85, drop: 0.05 },
  // Fire-support walker (Digit-class carrier with a 60 mm mortar): stops out of reach of most guns and lobs rounds on your units (GROUND.arty).
  arty: { name: 'Fire-support walker (Digit-class, 60 mm mortar)', code: 'MORTAR', hp: 16, speed: 1, dmg: 6, reward: 30, size: 1.2, sig: 0.7, ir: 0.8, alt: 0, glow: 1, pack: 1, wobble: 0.3, flank: true, ground: true, drop: 0.08 },
  // Heavy walker (Method-2-class mech): armoured (small arms do half), slow, fires its cannon at units in reach as it comes on.
  mech: { name: 'Heavy assault walker (Method-2-class mech)', code: 'MECH', hp: 110, speed: 0.9, dmg: 30, reward: 90, size: 2.1, sig: 1.3, ir: 1.3, alt: 0, glow: 1.3, pack: 1, wobble: 0, flank: true, ground: true, armour: 0.5, drop: 0.3 },
  // Siege walker (Kuratas-class mech, scaled up): leads THE TIDE from level 10. Very heavily armoured, crushes what
  // it walks into, wire and teeth don't slow it, and its cannon outranges your guns (GROUND.titan).
  titan: { name: 'Siege walker (Kuratas-class mech)', code: 'TITAN', hp: 600, speed: 0.55, dmg: 60, reward: 400, size: 3.4, sig: 2, ir: 1.6, alt: 0, glow: 1.5, pack: 1, wobble: 0, flank: true, ground: true, armour: 0.35, drop: 1 },
};
// Kills that matter get a bigger blast, a camera shake, a banner and a sound of their own (hud, render, sfx).
export const BIG_KILLS: Partial<Record<EnemyKind, string>> = { elite: 'SU-34 SPLASHED', ew: 'JAMMER DOWN', tbm: 'BALLISTIC INTERCEPTED', hyper: 'KINZHAL INTERCEPTED', ka52: 'ALLIGATOR DOWN', su25: 'SU-25 SPLASHED', sead: 'SU-35S SPLASHED', mech: 'HEAVY WALKER DOWN', titan: 'SIEGE WALKER DOWN',
  halo: 'MI-26 DOWN', backfire: 'BACKFIRE SPLASHED', okhotnik: 'OKHOTNIK SPLASHED', mainstay: 'MAINSTAY SPLASHED' };
export const BIG_KILL_SHAKE = 0.5;
// Critical-state warnings on the HUD (hud.warnings): shares of capacity a resource is critical below. sweep: radar
// speed share while power starves it; waiting: contacts in tracking range waiting for a lock while every slot is
// taken. A warning stays up `hold` s after its cause clears, so it doesn't flicker at the line.
export const WARN = { hp: 0.3, power: 0.15, ammo: 0.15, sweep: 0.6, waiting: 2, hold: 1.5 };
// Frame budget (main.ts, hud.ts, render.ts). step: the sim ticks at this fixed dt (s), as the tests and bots play it,
// however fast the screen refreshes; slack: share of a step a tick may run early, to ride out frame-time jitter;
// maxSteps: ticks at most per frame (2× speed after a slow frame), so a stall can't snowball. hudSlow: s between
// refreshes of the text panels (threat board, details, shop, cards); the bars and warnings update every frame.
// bloomOff: bloom switches itself off for the session once frames average more than `ms` for `secs` of play.
// lite: effect pool sizes on phones and small screens (the full ones in render.ts); each is a ring buffer, so a
// smaller pool only drops the oldest smoke and sparks sooner.
export const PERF = {
  step: 1 / 60, slack: 0.25, maxSteps: 6, hudSlow: 0.12,
  bloomOff: { ms: 26, secs: 3 },
  lite: { shards: 1000, beams: 1200, puffs: 240, wrecks: 24, fires: 12, blips: 512 },
};
// Sound: default volumes (0..1, the player's own are saved) and the music's tempo, calm and in a raid.
export const AUDIO = { sfx: 0.8, music: 0.35, bpm: 84, raidBpm: 108 };
// Munitions heading for the battery: drawn amber, their launches and intercepts logged.
export const MUNITIONS: EnemyKind[] = ['arm', 'tbm', 'cruise', 'atgm', 'kab', 'hyper', 'mald', 'rocket', 'arm2'];
// Anti-radiation missiles: home on a radiating radar, knock it out on a hit (see ARM_* and ARM2).
export const ARMS: EnemyKind[] = ['arm', 'arm2'];
export const KINDS = Object.keys(ENEMIES) as EnemyKind[];
// How high a contact flies over the ground (m): its type's `alt`, except that a ballistic missile or glide bomb
// comes down as it closes. The radar horizon goes by it (RADAR_HORIZON), and the view draws it.
export const altitude = (k: EnemyKind, x: number, z: number) => ENEMIES[k].ballistic ? 1 + Math.min(TERMINAL[k]?.apex ?? 22, Math.hypot(x, z) * 0.35)
  : k === 'kab' ? 1 + Math.min(8, Math.hypot(x, z) * 0.25) : ENEMIES[k].alt;
// Height of a contact in flight: a diver (Shahed, Gerbera, Lancet) comes down over its last stretch onto the
// battery instead of arriving at cruise height; a cruise missile pops up over its target to dive on it; a Ka-52
// hovers masked behind the trees, and rises only to fire. The rest fly their type's height.
export function flightAlt(e: { kind: EnemyKind; x: number; z: number; act: string; pop?: number }) {
  const a = altitude(e.kind, e.x, e.z);
  if (e.kind === 'ka52' && e.act === 'hover') return (e.pop ?? 0) > 0 ? a : KA52.maskAlt;
  if (e.kind === 'su25' && (e.pop ?? 0) > 0) return a + SU25.popup; // pop-up for the attack run
  if (e.act !== 'dive') return a;
  if (ENEMIES[e.kind].mimic === 'cruise' || e.kind === 'cruise') return a + CRUISE_TERMINAL.pop;
  const from = e.kind === 'scout' ? LANCET.loiter : SHAHED_DIVE;
  return a * Math.max(0.15, Math.min(1, (Math.hypot(e.x, e.z) - BASE_R) / (from - BASE_R)));
}
// Radar horizon: a contact flying under `full` m is only seen inside min..1 of radar range, in proportion to its
// height (a Kh-101 at ~64%, an FPV at ~73%). Masking: one under `alt` m over woods or a rock outcrop is hidden
// in the clutter, detection chance x `sig` (TRML-4D backup too; eyes as usual).
export const RADAR_HORIZON = { full: 3.5, min: 0.45 };
export const horizon = (alt: number) => Math.min(1, RADAR_HORIZON.min + (1 - RADAR_HORIZON.min) * alt / RADAR_HORIZON.full);
export const MASK = { alt: 2, sig: 0.4 };
// IR seekers (Stinger, IRIS-T SLM): how much a target's heat signature (ENEMIES.ir) moves their damage.
export const IR_SEEKER = 0.35;

// Rare drops: a kill sometimes leaves salvage on the ground (chance per kind: ENEMIES.drop). Click it within
// it to recover it; it stays on the ground until you do (at most DROP_MAX at once: past that, kills drop nothing). Heavy kills (reward >= DROP_HEAVY) roll TECH more often.
// Rolled with Math.random, so drops never touch the daily op's seeded schedule.
export type DropKind = 'cache' | 'ammo' | 'power' | 'repair' | 'overdrive' | 'tech';
export const DROPS: Record<DropKind, { name: string; desc: string; w: number; heavy: number }> = {
  cache: { name: 'SUPPLY CACHE', desc: 'credits', w: 40, heavy: 1 },
  ammo: { name: 'MUNITIONS', desc: 'interceptors full', w: 18, heavy: 1 },
  power: { name: 'POWER CELL', desc: 'power full', w: 18, heavy: 1 },
  repair: { name: 'REPAIR KIT', desc: '+30% battery HP, every unit repaired', w: 14, heavy: 1 },
  overdrive: { name: 'OVERDRIVE', desc: '+50% fire rate for 12s', w: 8, heavy: 2 },
  tech: { name: 'SALVAGED TECH', desc: 'a free upgrade level', w: 2, heavy: 6 },
};
export const DROP_KINDS = Object.keys(DROPS) as DropKind[];
export const DROP_GRAB = 4.5, DROP_MAX = 12, DROP_HEAVY = 50; // m click reach, most on the ground at once, reward
export const CACHE = { reward: 6, flat: 40 }; // credits: 6x the kill's reward + 40
export const REPAIR_DROP = 0.3; // share of max HP a repair kit restores
export const OVERDRIVE = { time: 12, rate: 1.5 };
// How each type flies (sim.moveEnemies). Speeds are x the type's own.
export const DIVE_SPEED = 1.7; // terminal dive: Shaheds (and the Gerberas copying them), Lancets
export const SHAHED_DIVE = 10; // m from the battery a Shahed pitches over into its dive
export const LANCET = { loiter: 26, time: 3, seek: 5 }; // m out it circles at, s it searches, m it spots a unit from and dives on it
export const HELO = { standoff: 34, every: 4, ammo: 4 }; // Mi-28: m out it hovers at (just outside Stinger reach of the inner line), s between ATGMs, ATGMs carried; then it goes home
export const KAB_R = 44, KAB_PAIR = 2; // m out a Su-34 releases its glide bombs (outside IRIS-T SLM reach from the base), and how many; then it turns for home
export const KAB_FIRST = 1; // bombs a Su-34 carries on the SEAD level, where it's new: one, so the first strike teaches instead of ending the run
export const EGRESS_SPEED = 1.4; // aircraft heading home, out of the arena (no reward, but no more harm)
// Ballistic missiles: m out they start their terminal manoeuvres, their size, speed x in the dive, and the height
// they're drawn coming down from.
export const TERMINAL: Partial<Record<EnemyKind, { r: number; jink: number; boost: number; apex: number }>> = {
  tbm: { r: 30, jink: 2.5, boost: 1, apex: 22 },
  hyper: { r: 36, jink: 1.2, boost: 1.4, apex: 30 }, // Kinzhal: less weave, far more speed
};
export const TBM_TERMINAL = TERMINAL.tbm!;
// Kh-101 (and the Kh-55 decoy): inside `r` m of its target it jinks `jink` hard, speeds up x`speed` and pops up
// `pop` m to dive on it.
export const CRUISE_TERMINAL = { r: 12, jink: 1.6, speed: 1.2, pop: 2.5 };
// Ka-52: m out it settles at, s it takes to settle before the first salvo (the moment to kill it), s between
// salvos, ATGMs per salvo and in all, s it stays popped up after firing, m it hovers at masked, m of strafe
// sideways, m its ATGMs reach a unit from, and how much harder an ATGM hits a unit than its damage says.
export const KA52 = { standoff: 36, settle: 4, every: 5, salvo: 2, ammo: 6, pop: 1.5, maskAlt: 1.2, strafe: 0.5, reach: 36 };
// Su-25: m out it fires, S-8s per salvo and their spread (rad), attack passes, m out it turns back in for the next
// one, m its rockets reach a unit from, s of pop-up and flares per run (IR seekers x `flares` meanwhile), m of pop-up.
export const SU25 = { release: 24, salvo: 4, spread: 0.06, passes: 2, turn: 64, reach: 20, pop: 2.5, flares: 0.4, popup: 3 };
// Su-35S SEAD: m out it holds station at, s between Kh-58s while the radar radiates (x the radar mode's armEvery),
// Kh-58s carried, s it waits on station at most before going home.
export const SEAD = { standoff: 56, every: 7, ammo: 4, time: 45 }; // inside PAC-3 reach, outside IRIS-T SLX
// Kh-58: s of motor, m its memory aim can be off the radar to the side, radar downtime x an ARM hit's.
export const ARM2 = { life: 20, scatter: 10, stun: 1.5 };
// FPV swarm: normal spawns bring ENEMIES.swarm.packs (4-8). Each FPV hunts the most isolated unit within `seek` m
// of it (fewest other guns covering its spot, at most `isolated`), diving on it at DIVE_SPEED. A unit on high
// ground is spotted TERRAIN.high.dive x further; the treeline hides it. No isolated unit in reach: the base.
export const SWARM = { seek: 8, isolated: 1 };
// Orlan-10: m out it circles at, s it stays on station before heading home, rad half-width of the sector it spots
// for (round its own bearing, so the sector moves as it circles), damage x on impacts in that sector, unit search
// range x for Lancets and FPVs in it.
export const RECON = { orbit: 48, time: 40, arc: 0.5, dmg: 1.25, seek: 1.6 };
export const CRUISE_DOGLEG = 0.7; // rad off its launch bearing a Kh-101 routes through before turning in on its target
// How hard each type manoeuvres (sim.steer). Fixed wings swing their heading at up to `turn` rad/s; rotorcraft and
// quadcopters (`hover`) ease their whole velocity toward the one they want, so they slow into a hover and sidestep.
// `acc`: how fast speed (or, hovering, velocity) closes on what's wanted, per s. Homing on a unit or a waypoint
// manoeuvres HOMING_BOOST x harder, and inside HOMING_SNAP m it flies straight at it, so nothing circles its target.
export const AGILITY: Record<EnemyKind, { turn: number; acc: number; hover?: boolean }> = {
  scout: { turn: 2.6, acc: 3 }, drone: { turn: 1.4, acc: 2.5 }, decoy: { turn: 1.4, acc: 2.5 }, swarm: { turn: 0, acc: 7, hover: true },
  tank: { turn: 0, acc: 1.5, hover: true }, ew: { turn: 0, acc: 1.3, hover: true }, elite: { turn: 0.9, acc: 1.2 },
  arm: { turn: 0, acc: 0 }, // flies its own seeker (sim.steerArm)
  tbm: { turn: 1.6, acc: 3 }, cruise: { turn: 2.4, acc: 2.5 }, atgm: { turn: 4, acc: 4 }, kab: { turn: 1.2, acc: 1.5 },
  recon: { turn: 0.8, acc: 1 }, ka52: { turn: 0, acc: 1.8, hover: true }, hyper: { turn: 1.2, acc: 3 }, mald: { turn: 2.4, acc: 2.5 },
  su25: { turn: 1.1, acc: 1.5 }, rocket: { turn: 3, acc: 4 }, sead: { turn: 0.8, acc: 1.2 }, arm2: { turn: 0, acc: 0 }, // arm2: flies its own seeker
  halo: { turn: 0, acc: 1, hover: true }, backfire: { turn: 0.7, acc: 1 }, okhotnik: { turn: 1.1, acc: 1.4 }, mainstay: { turn: 0.5, acc: 0.8 },
  walker: { turn: 0, acc: 5, hover: true }, gunbot: { turn: 0, acc: 3, hover: true }, mech: { turn: 0, acc: 1.5, hover: true }, // on foot: they stop and sidestep
  crawler: { turn: 0, acc: 6, hover: true }, dog: { turn: 0, acc: 6, hover: true }, sapper: { turn: 0, acc: 4, hover: true }, arty: { turn: 0, acc: 2, hover: true }, titan: { turn: 0, acc: 0.8, hover: true },
};
export const HOMING_BOOST = 3, HOMING_SNAP = 2;

// Each level adds a kind of problem rather than just more HP, in step with what the battery can build by then:
// 1 learn the guns · 2 FPV swarms · 3 helicopters and decoys · 4 Shaheds round the flanks (the radar's moment) ·
// 5 cruise missiles and jammers · 6 SEAD: Su-34s, ARMs and Iskanders (the Patriot's job) ·
// 7+ conditions on top, with attack packages ever more likely (PK_GROW per loop, up to PK_MAX).
// New threats come in on top of what a level already teaches, and only from 5 on, so levels 1-4 play as before:
// Orlan-10 spotters and Kh-55 decoys with the cruise missiles, Ka-52s round the flanks at SEAD, Kinzhals in the loop.
// Spawn weights per level; the last entry repeats. pk: chance a spawn event is an attack package instead.
// rate: spawn rate x, so the opening levels can be held by guns alone (default 1).
// arc: half-width around FRONT that flank threats can come from (default FRONT_ARC; every direction after the last level).
export const LEVELS: { name: string; desc: string; w: Partial<Record<EnemyKind, number>>; pk?: number; arc?: number; rate?: number }[] = [
  { name: 'PROBING', desc: 'Lancets and Shaheds, straight in from the front', w: { scout: 3, drone: 2 }, rate: 0.45 },
  { name: 'FPV SWARMS', desc: 'FPV swarms join the Lancets and Shaheds', w: { scout: 2, drone: 3, swarm: 1 }, rate: 0.6 },
  { name: 'HELICOPTERS', desc: 'Mi-28 attack helicopters and decoys', w: { scout: 2, drone: 3, swarm: 1, tank: 0.6, decoy: 1.2 }, rate: 0.8 },
  { name: 'FLANKS', desc: 'Shaheds from the flanks, and the first attack packages', w: { scout: 1.5, drone: 4, swarm: 1, tank: 0.8, decoy: 1.5 }, pk: 0.05, arc: 60 * DEG },
  { name: 'EW AND CRUISE', desc: 'cruise missiles going for your units, jammers, and Orlan-10 spotters', w: { scout: 2, drone: 3, swarm: 1.5, tank: 1, decoy: 1.5, ew: 0.15, cruise: 0.3, recon: 0.15, mald: 0.1 }, pk: 0.07, arc: 120 * DEG },
  { name: 'SEAD', desc: 'Su-34s, ARMs, Iskanders, Su-25 attack runs and Ka-52s round the flanks', w: { scout: 2, drone: 3, swarm: 2, tank: 1.5, elite: 0.25, decoy: 1.5, arm: 0.3, ew: 0.1, tbm: 0.15, cruise: 0.3, recon: 0.2, ka52: 0.3, mald: 0.15, su25: 0.15 }, pk: 0.1, arc: 120 * DEG },
];
export const PK_GROW = 0.02, PK_MAX = 0.25;
// Past the scripted levels, jammer helicopters get likelier every level too (spawn weight), up to EW_MAX.
export const EW_GROW = 0.03, EW_MAX = 0.4;

// Training: a short first-run drill, one lesson per wave, on a fixed map (sim.drill). Waves follow a script instead
// of the level's mix: `n` packs of `kind` `at` s after the wave starts, `off` rad off the front, `r` m out (default:
// the rim). `grant`: upgrades handed out free as the wave starts. A wave ends once its script has run and the sky
// is clear, then a short build window. The battery can't fall in training (HP stops at 1) and no records are kept.
export const TRAINING_SEED = 0x5eed7a1;
export const TRAINING_BUILD = 6; // s between waves
export interface Drill { name: string; desc: string; tip: string; grant?: string[]; spawns: { at: number; kind: EnemyKind; n: number; off?: number; r?: number }[] }
export const TRAINING: Drill[] = [
  { name: 'EYESIGHT', desc: 'guns fire at what they can see',
    tip: 'TRAINING 1/4 · EYESIGHT: no radar yet. Anything close to the base or a gun is seen, and guns fire at it by themselves. Buy a third gun in the shop [Tab] and click open ground in the dashed ring to build it.',
    spawns: [{ at: 2, kind: 'drone', n: 1 }, { at: 7, kind: 'scout', n: 2 }, { at: 14, kind: 'drone', n: 2, off: 0.25 }, { at: 20, kind: 'scout', n: 3, off: -0.2 }] },
  { name: 'RADAR', desc: 'see far, lock, and let the Patriot shoot', grant: ['radar', 'pac3'],
    tip: 'TRAINING 2/4 · RADAR: radar and Patriot online. The radar sees far beyond your eyes, fire control locks what it sees, and the Patriot fires at every lock. Click a contact to make it the priority target.',
    spawns: [{ at: 3, kind: 'drone', n: 2, off: 0.6 }, { at: 9, kind: 'drone', n: 2, off: -0.6 }, { at: 15, kind: 'scout', n: 3 }, { at: 21, kind: 'tank', n: 1 }] },
  { name: 'ARMS AND EMCON', desc: 'go silent when an ARM comes in',
    tip: 'TRAINING 3/4 · ARMs: anti-radiation missiles home on a radiating radar and knock it out. When the ARM warning sounds, press [F] EMCON to go silent (you lose your locks), then [F] again once it has veered off.',
    spawns: [{ at: 2, kind: 'drone', n: 2 }, { at: 5, kind: 'arm', n: 1 }, { at: 16, kind: 'arm', n: 1, off: 0.3 }, { at: 18, kind: 'drone', n: 2, off: -0.3 }, { at: 28, kind: 'arm', n: 1, off: -0.2 }] },
  { name: 'DECOYS', desc: 'decoys look like Shaheds until classified',
    tip: 'TRAINING 4/4 · DECOYS: Gerbera decoys look exactly like Shaheds and soak up locks. Fire control classifies one after holding it for a moment, then greys it out and releases it. Don\'t waste your priority target on them.',
    spawns: [{ at: 2, kind: 'decoy', n: 1 }, { at: 3, kind: 'drone', n: 1 }, { at: 10, kind: 'decoy', n: 1, off: 0.3 }, { at: 11, kind: 'drone', n: 2, off: 0.3 }, { at: 19, kind: 'decoy', n: 2, off: -0.2 }, { at: 20, kind: 'drone', n: 1, off: -0.2 }] },
];

// GROUND ASSAULT: a mode of its own (the start screen's [A]). Robots walk in over the ground, and nothing but the
// perimeter can engage them: no radar, no Patriot. It plays as a front-line tower defence: the base holds a line,
// and everything comes from one direction, the north (FRONT), across a front FRONT_LINE.w m wide, walking on the base.
// You build in a band in front of it (groundZone), and every gun can be upgraded in its pit (UNIT_TIERS) and fitted
// with ammunition, sensors and kit (UNIT_MODS). Its own levels and raids, in the same shape as LEVELS and RAIDS;
// after the last level, GROUND_MODS loop on top of its mix, and every BOSS_EVERY-th raid is THE TIDE (tideFor).
// Walking: speed x on each kind of ground (a river or pond is waded), x `wire` inside concertina wire, x JAM_SLOW
// in a jammer bubble (their control links). Light walkers and mini-walkers charge a unit they see within `seek` m
// (`crawl` for mini-walkers; a unit on high ground is seen from TERRAIN.high.dive x further). Combat walkers stop within
// `gun.reach` of a unit and fire bursts of `gun.dmg` every `gun.every` s until it's down. Robot dogs fire `dog.dmg`
// at a unit within `dog.reach` on the run. Breachers go for an obstacle within `sapper.seek` m and cut it (takes it
// down). Fire-support walkers stop `arty.stand` m from the nearest unit they see within `arty.seek` and lob a round
// on it every `arty.every` s (splash `arty.splash`). Heavy and siege walkers fire on the move. Whatever reaches the
// base hits it for its `dmg` and is gone. `stunHeavy`: share of an HPM stun a mech or siege walker suffers.
export const GROUND = {
  terrain: { water: 0.35, forest: 0.6, rock: 0.5, road: 1.2, grass: 1, field: 0.9 },
  wire: 0.35, seek: 8, crawl: 4,
  gun: { reach: 9, every: 1.5, dmg: 2.5 },
  dog: { reach: 7, every: 1, dmg: 1.2 },
  sapper: { seek: 14 },
  arty: { seek: 30, stand: 22, every: 5, dmg: 5, splash: 3 },
  mech: { reach: 16, every: 4, dmg: 9 },
  titan: { reach: 24, every: 3, dmg: 14, splash: 3, crush: 2 },
  stunHeavy: 0.4,
};
// The front: walkers enter along a line `w` m either side of the axis, `z` m north of the base (just past the rim),
// in ranks `rank` m deep (a raid of hundreds comes in as a wall, `file` m between walkers in a rank).
export const FRONT_LINE = { w: 40, z: -(ARENA_R + 2), rank: 1.2, file: 1.8 };
// Where you build in a ground assault: a band in front of the base, `w` m either side of the axis, from `back` m
// behind the base's centre out to `d` m in front of it (by base level, the last entry repeats). Clear of the base compound.
const GZ_W = [22, 30, 34, 38, 40], GZ_D = [24, 30, 34, 38, 40];
export const groundZone = (level: number) => ({ w: GZ_W[Math.min(level, GZ_W.length) - 1], d: GZ_D[Math.min(level, GZ_D.length) - 1], back: 6 });
// Weapons that go through armour in full (ENEMIES.armour): top-attack missiles, heavy mortar rounds, rockets, mines,
// microwaves (they fry the electronics, whatever's bolted over them). Partly: `PIERCE` (the rest of the way to full).
export const ANTI_ARMOUR: PerimKind[] = ['javelin', 'mortar', 'mines', 'rockets', 'hpm'];
export const PIERCE: Partial<Record<PerimKind, number>> = { rws30: 0.5, hel: 0.5 };
export const GROUND_LEVELS: typeof LEVELS = [
  { name: 'SKIRMISH', desc: 'packs of light walkers and mini-walkers, straight down from the north', w: { walker: 1, crawler: 0.6 }, rate: 0.4 },
  { name: 'GUN LINE', desc: 'combat walkers stop and shoot your units up', w: { walker: 3, crawler: 1.5, gunbot: 1 }, rate: 0.5 },
  { name: 'DOGS OF WAR', desc: 'armed robot dogs: fast, and they shoot on the run', w: { walker: 3, crawler: 2, gunbot: 1, dog: 1.2 }, rate: 0.6 },
  { name: 'BREACHERS', desc: 'breachers cut your wire and mines · heavy walkers: small arms do half', w: { walker: 3, crawler: 2, gunbot: 1.5, dog: 1, sapper: 0.7, mech: 0.3 }, rate: 0.65 },
  { name: 'THE TIDE', desc: 'a thousand mini-walkers: bring splash', w: { crawler: 6, walker: 3, gunbot: 1, dog: 1, sapper: 0.5, mech: 0.3 }, rate: 0.7 },
  { name: 'FIRE SUPPORT', desc: 'mortar walkers stop out of reach and shell your units', w: { walker: 3, crawler: 3, gunbot: 1.5, dog: 1, sapper: 0.6, arty: 0.5, mech: 0.4 }, rate: 0.75 },
  { name: 'FULL ASSAULT', desc: 'everything at once', w: { walker: 4, crawler: 4, gunbot: 2, dog: 1.5, sapper: 0.8, arty: 0.6, mech: 0.6 }, rate: 0.85 },
];
export const GROUND_MODS: Mod[] = [
  { name: 'NIGHT ASSAULT', desc: 'you see half as far (thermal sights don\'t care)', dark: true },
  { name: 'HORDE', desc: 'many more, much weaker', spawn: 1.6, hp: 0.6, w: { crawler: 8, walker: 3 } },
  { name: 'ARMOURED PUSH', desc: 'heavy walkers in numbers', w: { mech: 0.8, gunbot: 1 } },
  { name: 'LULL', desc: 'fewer walkers · rebuild', spawn: 0.6 },
  { name: 'GUN LINE', desc: 'combat walkers and robot dogs everywhere', w: { gunbot: 3, dog: 2 } },
  { name: 'SIEGE', desc: 'mortar walkers and breachers', w: { arty: 1.2, sapper: 1.5 } },
];
export const GROUND_RAIDS: typeof RAIDS = [
  { name: 'WALKER RUSH', from: 0, g: { walker: 8, crawler: 2 } },
  { name: 'GUN TEAM', from: 1, g: { gunbot: 3, walker: 4 } },
  { name: 'PACK HUNT', from: 2, g: { dog: 4, walker: 3 } },
  { name: 'BREACH', from: 3, g: { sapper: 3, mech: 1, walker: 4 } },
  { name: 'ARMOURED PUSH', from: 3, g: { mech: 1, gunbot: 2, walker: 3 } },
  { name: 'BARRAGE', from: 5, g: { arty: 3, gunbot: 2, walker: 4 } },
  { name: 'HEAVY ASSAULT', from: 6, g: { mech: 2, gunbot: 3, dog: 2, walker: 5 } },
];
// THE TIDE: the raid every BOSS_EVERY-th level of a ground assault (L5, L10...), instead of a drawn one. A wall of
// mini-walkers a thousand strong (more each time), light walkers among them, and from the second one on, siege
// walkers leading. Not scaled like other raids: the count is the point.
export const TIDE = { crawler: 1000, grow: 250, walker: 20, titan: 1 };
export const tideFor = (stage: number) => {
  const k = Math.floor((stage + 1) / BOSS_EVERY);
  const g: Partial<Record<EnemyKind, number>> = { crawler: TIDE.crawler + TIDE.grow * (k - 1), walker: TIDE.walker * k };
  if (k > 1) g.titan = TIDE.titan * (k - 1);
  return { name: 'THE TIDE', from: 0, g } as (typeof RAIDS)[number];
};
// HORDE TEST (the start screen's [H]): a ground assault that starts at base level HORDE_TEST.level with credits to
// build a line, a build window, then THE TIDE level. Not a run: no records.
export const HORDE_TEST = { level: 5, credits: 4000, build: 45, tideIn: 20 };

// Attack packages (`from`: first level index): existing types flying in together from one bearing, each covering another's weakness.
// Counts are packs (a decoy pack is 3, an FPV pack 6). An EW helicopter in a package is an escort: it holds
// station on the package's bearing instead of circling, so its jammed sector covers the rest of the package.
// `first` is the element to dismantle first; `why` says what happens if you don't.
export interface Package { name: string; from: number; g: Partial<Record<EnemyKind, number>>; first: EnemyKind; why: string }
export const PACKAGES: Package[] = [
  { name: 'SEAD PACKAGE', from: 5, g: { elite: 1, arm: 1, decoy: 1, drone: 1 }, first: 'elite',
    why: 'decoys soak locks while the Su-34 keeps launching ARMs' },
  { name: 'JAMMED SWARM', from: 4, g: { ew: 1, swarm: 2, drone: 2 }, first: 'ew',
    why: 'the swarm hides in the jammer\'s sector' },
  { name: 'SATURATION', from: 5, g: { decoy: 2, ew: 1, scout: 3, tank: 1 }, first: 'tank',
    why: 'the Mi-28 hides among decoys and fast Lancets under jamming' },
  // Late game: two jammers side by side blank a wide sector; mixed profiles split your fire high, low and ballistic.
  { name: 'EW SCREEN', from: 6, g: { ew: 2, cruise: 2, decoy: 2, scout: 2 }, first: 'ew',
    why: 'two jammers blank the sector while cruise missiles slip in low behind the decoys' },
  { name: 'MIXED STRIKE', from: 7, g: { tank: 1, swarm: 2, cruise: 1, arm: 1 }, first: 'tank',
    why: 'cruise and ARM launches pull your guns and the radar away while the Mi-28 hovers' },
  { name: 'SPOTTED STRIKE', from: 4, g: { recon: 1, scout: 3, swarm: 1 }, first: 'recon',
    why: 'the Orlan-10 spots for the Lancets and FPVs: they find your units from further out and hit harder' },
  { name: 'FLANK HUNTERS', from: 5, g: { ka52: 1, recon: 1, drone: 2 }, first: 'ka52',
    why: 'the Ka-52 settles masked on the flank and picks off your units once the Orlan-10 has found them' },
  // Saturation: many cheap, a few that matter. The cheap ones soak locks and ammo so the expensive ones get through.
  { name: 'SATURATION SALVO', from: 6, g: { swarm: 2, decoy: 2, drone: 3, mald: 2, cruise: 1, tbm: 1 }, first: 'cruise',
    why: 'FPVs, Gerberas and Kh-55 decoys soak locks while the Kh-101 and the Iskander go for what matters' },
  { name: 'CAS STRIKE', from: 6, g: { su25: 1, scout: 2, swarm: 1 }, first: 'su25',
    why: 'the Su-25 comes in low under the Lancets and rockets your units, then comes round again' },
  { name: 'WILD WEASEL', from: 7, g: { sead: 1, decoy: 2, drone: 2 }, first: 'sead',
    why: 'the Su-35S fires Kh-58s while decoys soak your locks; going dark only cuts their odds' },
];

// After the last scripted level, each level brings a new condition on top of SEAD's mix, looping in order.
// sig/persist: detection chance / contact memory multipliers; spawn/hp: on top of difficulty(); w: extra spawn weights.
export interface Mod { name: string; desc: string; sig?: number; persist?: number; spawn?: number; hp?: number; dark?: boolean; w?: Partial<Record<EnemyKind, number>> }
export const MODS: Mod[] = [
  { name: 'NIGHT RAID', desc: 'contacts fade twice as fast', persist: 0.5, dark: true },
  { name: 'GROUND CLUTTER', desc: '-30% detection chance', sig: 0.7 },
  { name: 'LULL', desc: 'fewer raiders, clear skies · rebuild', spawn: 0.6, sig: 1.2 },
  { name: 'JAMMING STORM', desc: 'EW helicopters inbound', w: { ew: 0.8 } },
  { name: 'SWARM TIDE', desc: 'many more, much weaker', spawn: 1.5, hp: 0.6, w: { swarm: 4, decoy: 2 } },
  { name: 'SEAD WAVE', desc: 'strike aircraft, SEAD fighters, ARMs, cruise missiles and Kinzhals', w: { arm: 0.8, elite: 0.3, sead: 0.25, cruise: 0.4, hyper: 0.08 } },
  { name: 'EW OFFENSIVE', desc: 'jammers, decoys and cruise missiles · -15% detection', sig: 0.85, w: { ew: 0.5, decoy: 1.5, cruise: 0.3, mald: 0.4 } },
  { name: 'COMBINED ARMS', desc: 'helicopters, Su-25s, swarms and cruise missiles together', w: { tank: 1, ka52: 0.5, su25: 0.4, swarm: 1.5, scout: 1, cruise: 0.3 } },
  { name: 'EYES IN THE SKY', desc: 'Orlan-10 spotters over every raid', w: { recon: 0.6, scout: 1, swarm: 1 } },
  { name: 'HYPERSONIC', desc: 'Kinzhals among the Iskanders', w: { hyper: 0.12, tbm: 0.1 } },
];

// Raids: every level ends with one, a named group from one bearing (`from`: first level index it can be drawn at).
// Announced RAID_WARN s ahead (the preparation window) with its composition, objective and bonus. Counts are packs,
// scaled up level by level (raidScale). While the attack is on, normal spawns thin out (RAID_SPAWN) so the raid
// stands out. Objective held (nothing in the raid reaches the battery; for 'radar', no ARM hits the radar): bonus
// and the full build window. Lost: no bonus and a short build window. Either way the level ends with the raid.
export const RAID_WARN = 10; // s
export const RAID_BONUS = 0.5; // share of the raid's total reward, + 25 flat
export const RAID_SPAWN = 0.4; // spawn x during the attack
export const raidScale = (level: number) => grow(level * 1.5, 0.7); // ~1.5 min of play per level
export type RaidObjective = 'battery' | 'radar' | 'boss';
export const OBJECTIVES: Record<RaidObjective, string> = { battery: 'PROTECT BATTERY', radar: 'PROTECT RADAR', boss: 'SHOOT DOWN THE BOSS' };
export const RAIDS: { name: string; from: number; g: Partial<Record<EnemyKind, number>>; obj?: RaidObjective }[] = [
  { name: 'SHAHED WAVE', from: 0, g: { drone: 6 } },
  { name: 'LANCET PACK', from: 0, g: { scout: 7 } },
  { name: 'FPV SWARM', from: 1, g: { swarm: 3 } },
  { name: 'DECOY SCREEN', from: 2, g: { decoy: 2, drone: 4 } },
  { name: 'HELO ASSAULT', from: 2, g: { tank: 3, scout: 3 } },
  { name: 'SEAD STRIKE', from: 5, g: { elite: 1, arm: 2, decoy: 2, drone: 2 }, obj: 'radar' },
  { name: 'SWARM ASSAULT', from: 4, g: { ew: 1, swarm: 3, drone: 4 } },
  { name: 'SATURATION STRIKE', from: 5, g: { decoy: 2, ew: 1, scout: 5, tank: 2 } },
  { name: 'ISKANDER SALVO', from: 5, g: { tbm: 3 } },
  { name: 'CRUISE SALVO', from: 4, g: { cruise: 3 } },
  { name: 'EW BARRAGE', from: 7, g: { ew: 2, cruise: 2, decoy: 3, drone: 3, scout: 3 } },
  { name: 'COMBINED STRIKE', from: 8, g: { elite: 1, tank: 2, swarm: 2, cruise: 2 } },
  { name: 'ALLIGATOR HUNT', from: 5, g: { ka52: 2, recon: 1, swarm: 2 } },
  { name: 'SATURATION WAVE', from: 7, g: { swarm: 3, decoy: 2, drone: 4, mald: 2, cruise: 2, tbm: 1 } },
  { name: 'HYPERSONIC STRIKE', from: 9, g: { hyper: 2, tbm: 1, mald: 2 } },
  { name: 'GROUND ATTACK', from: 6, g: { su25: 2, scout: 3 } },
  { name: 'SEAD SWEEP', from: 8, g: { sead: 1, elite: 1, arm: 1, decoy: 2, drone: 2 }, obj: 'radar' },
];

// Bosses: every BOSS_EVERY-th level (L5, L10, L15...) the raid is led by one, in this order, looping (stronger each
// time round, like everything else). Objective: shoot it down before it leaves; it goes home once it has used up
// its `ammo` attacks (one every `every` s) or spent `time` s on station. Killing it pays its reward, the raid bonus
// and a SALVAGED TECH drop (a free upgrade level).
// It holds at `standoff` m, or just inside the reach of your weapons on its bearing if that's shorter (sim.bossReach),
// so there's always something that can hit it. It's matched to your battery:
//  · HP: `fight` s of the firepower that can reach where it holds (sim.firepower: paper DPS x `lands`, the share
//    of it that really lands per weapon family: guns spray and reload), never below its type's HP x the level's
//    difficulty (so a battery that stops building meets bosses it can't finish); x `tough` for the ones that arrive
//    quickly or sit where your best weapons reach them anyway;
//  · countermeasures against the weapon family that has done the most of your damage this run: x`adapt` from it;
//  · a weakness: its own `weak` family takes x`weak`; if you have nothing in that family, whichever you own and
//    have used least. So a boss rewards the upgrades you've neglected.
export type DmgCat = 'GUNS' | 'SAM' | 'PAC' | 'DEW';
export const DMG_CAT: Record<string, DmgCat> = { MG: 'GUNS', MANTIS: 'GUNS', STINGER: 'SAM', 'IRIS-T SLM': 'SAM', 'IRIS-T': 'SAM', 'PAC-3': 'PAC', HEL: 'DEW', HPM: 'DEW' };
export const CAT_NAME: Record<DmgCat, string> = { GUNS: 'GUNS', SAM: 'SAMS', PAC: 'PATRIOT', DEW: 'LASER + HPM' };
export const BOSS_EVERY = 5;
export const BOSS = { fight: 60, lands: { GUNS: 0.25, SAM: 0.5, PAC: 0.5, DEW: 0.5 } as Record<DmgCat, number>, adapt: 0.5, weak: 1.6, inside: 3, minR: 12, exposed: 1.5, open: 2.5, link: 0.7, linkSpeed: 1.15 };
// halo: hovers and drops an FPV pack (`n`) on your units each attack · backfire: circles, fires `n` Kh-101s at your
// most valuable units each attack, and its own ECM jams its sector like a Mi-8 · okhotnik: circles, stealthy (tiny
// radar return), and for BOSS.open s each attack its bay is open: seen by any radar, takes x BOSS.exposed, and drops
// a KAB on the battery · mainstay: circles and commands: while it's on station every other raider takes x BOSS.link
// damage and flies x BOSS.linkSpeed faster.
export interface Boss { kind: EnemyKind; name: string; skill: string; weak: DmgCat; tough: number; standoff: number; orbit: boolean; every: number; ammo: number; n: number; time: number; g: Partial<Record<EnemyKind, number>> }
export const BOSSES: Boss[] = [
  { kind: 'halo', name: 'CARRIER ASSAULT', skill: 'drops FPV packs on your units', weak: 'SAM', tough: 1, standoff: 22, orbit: false, every: 6, ammo: 6, n: 1, time: 50, g: { scout: 2, drone: 3 } },
  { kind: 'backfire', name: 'BOMBER STRIKE', skill: 'fires Kh-101 pairs at your units · jams its own sector', weak: 'PAC', tough: 1.8, standoff: 50, orbit: true, every: 8, ammo: 4, n: 2, time: 45, g: { mald: 2, decoy: 2, drone: 3 } },
  { kind: 'okhotnik', name: 'STEALTH HUNT', skill: 'radar barely sees it · exposed while its bay is open to drop a glide bomb', weak: 'GUNS', tough: 1, standoff: 26, orbit: true, every: 7, ammo: 6, n: 1, time: 55, g: { scout: 3, swarm: 2 } },
  { kind: 'mainstay', name: 'COMMAND NODE', skill: 'datalink: every other raider takes 30% less damage and flies faster', weak: 'SAM', tough: 1.4, standoff: 46, orbit: true, every: 0, ammo: 0, n: 0, time: 55, g: { sead: 1, ew: 1, drone: 4, cruise: 1, su25: 1 } },
];
const BOSS_OF: Partial<Record<EnemyKind, Boss>> = Object.fromEntries(BOSSES.map(b => [b.kind, b]));
export const bossOf = (k: EnemyKind) => BOSS_OF[k]; // runs per contact per tick: a lookup, not a search
export const bossLevel = (stage: number) => (stage + 1) % BOSS_EVERY === 0; // stage: 0-based level index
export const bossFor = (stage: number) => BOSSES[(Math.floor((stage + 1) / BOSS_EVERY) - 1) % BOSSES.length];

// Radar threats. ARMs home on the radar while it radiates, and a hit takes it offline. EMCON [F] silences it:
// no sweep, no locks, no radar power drain, and ARMs lose the emitter and veer off course.
export const ARM_STUN = 6; // s offline per ARM hit (stacks up to 2x)
export const ARM_VEER = 0.6; // rad an ARM swings off its heading once the radar goes dark
export const ARM_TURN = 1.5; // rad/s; limited, so a late EMCON still gets hit
export const ARM_LIFE = 16; // s of motor, then it falls short
export const ARM_EVERY = 10; // s between ARM launches per Su-34 inside ARM_LAUNCH_R
export const ARM_LAUNCH_R = 64; // inside the radar's reach, so every launch is seen
// Radar modes [V] (EMCON [F] silences whichever is set). range/sig: detection range and chance · drain: power ·
// sector: rad of arc searched (FOCUSED dwells on the bearing you last clicked or your priority target, revisiting
// it much faster; LTAMDS AESA widens it) · armR/armEvery: Su-34 ARM launch range and interval · lpi: ARMs only
// find the radar inside LPI_R.
export const RADAR_MODES = [
  { name: 'ACTIVE', range: 1, sig: 1, drain: 1, sector: 0, armR: 1, armEvery: 1, lpi: false },
  { name: 'FOCUSED', range: 1.3, sig: 1.3, drain: 1.4, sector: Math.PI * 2 / 3, armR: 1.25, armEvery: 0.7, lpi: false },
  { name: 'LPI', range: 0.85, sig: 0.6, drain: 0.6, sector: 0, armR: 1, armEvery: 2, lpi: true },
];
export const LPI_R = 15; // m: a blind ARM passes 40m out on a 0.6 rad veer at ~23m, so LPI makes it miss
export const DECOY_ID = 1.5; // s of lock before the ECS classifies a decoy (÷ radar resolution)
export const EW_ORBIT = 48; // Mi-8 jammers stand off at this range and circle (outside IRIS-T SLM, inside SLX and PAC-3)
export const EW_ARC = 0.4; // rad half-width of each jammed sector
export const EW_JAM = 0.35; // detection chance multiplier inside a jammed sector

// Logarithmic growth: every doubling of play time adds about the same threat. m = minutes played.
export const grow = (m: number, k: number) => 1 + k * Math.log1p(m / 4);
// Past SURGE.from minutes (about level 5) the war escalates: HP and damage grow exponentially, numbers linearly,
// on top of the gentle curve, so a battery that stops building falls behind within a few levels. Kills pay more
// as it goes (reward x the HP surge ^ `pay`), so income keeps upgrades coming, but slower than the threat grows:
// every run ends. Per minute past `from`.
export const SURGE = { from: 6, hp: 0.16, dmg: 0.07, spawn: 0.04, pay: 0.65 };
const surge = (m: number, k: number) => Math.exp(k * Math.max(0, m - SURGE.from));
const surgeLin = (m: number, k: number) => 1 + k * Math.max(0, m - SURGE.from);
export function difficulty(t: number) {
  const m = t / 60;
  return {
    // Composition carries most of the difficulty (see LEVELS), so raw numbers grow gently, until the surge.
    spawnRate: 0.6 * grow(m, 1.4) * surgeLin(m, SURGE.spawn), // spawn events / s
    hp: grow(m, 0.75) * surge(m, SURGE.hp),
    speed: 1 + 0.02 * Math.min(m, 30),
    dmg: grow(m, 0.6) * surge(m, SURGE.dmg),
    pay: surge(m, SURGE.hp * SURGE.pay), // kill reward x
  };
}

// cannon = PAC-3 MSE (hit-to-kill, lead intercept), pulse = HEL laser, missile = IRIS-T SLX (blast-frag), rail = HPM microwave.
export type WeaponKind = 'cannon' | 'pulse' | 'missile' | 'rail';
// The laser and HPM are point defence: short reach, but hard-hitting inside it (the HPM fries a cone, HPM_CONE).
export const WEAPONS: Record<WeaponKind, {
  dmg: number; rate: number; range: number; speed: number; ammo: number; power: number; splash: number;
}> = {
  cannon: { dmg: 5, rate: 2.5, range: 58, speed: 60, ammo: 1, power: 0, splash: 0 },
  pulse: { dmg: 4, rate: 9, range: 11, speed: 0, ammo: 0, power: 1, splash: 0 },
  missile: { dmg: 12, rate: 0.7, range: 50, speed: 30, ammo: 3, power: 0, splash: 4 },
  rail: { dmg: 40, rate: 0.8, range: 7, speed: 0, ammo: 0, power: 10, splash: 0 },
};
export const HPM_CONE = 50 * DEG; // half-width of the HPM's beam
export const POINT_DEFENCE: WeaponKind[] = ['pulse', 'rail']; // cue themselves on the nearest threat in reach: no lock needed

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
// Holding a fire control lock costs power too, so more ECS channels in use means less for the radar sweep.
export const LOCK_POWER = 0.25; // power/s per lock held
// Resupply: the generators and the GMT reload line work harder the emptier their store is: output x `empty` with
// nothing left, easing to x `full` at capacity. So power and interceptors settle at a level that shows how supply
// compares to demand (short of it: low, but still firing; well ahead: near full), instead of sitting pinned at empty
// or at full; and as the war grows, a surplus bought once wears away.
export const RESUPPLY = { empty: 1.6, full: 0.4 };
export const resupply = (fill: number) => { const f = Math.min(1, Math.max(0, fill)); return RESUPPLY.empty * (1 - f) + RESUPPLY.full * f; };
// Standby power (power/s) a system draws just to stay ready, radar or not: per level for the battery's weapons, per
// working unit for the powered emplacements. A bigger battery needs a bigger plant.
export const UPKEEP: Partial<Record<string, number>> = { pac3: 0.5, pulse: 0.6, missile: 0.4, rail: 1, mantis: 0.2, iris: 0.3, observer: 0.1, hel: 0.3, hpm: 0.5, gsr: 0.3 };
// Maintenance Crew repairs run on surplus power above 20%, like interceptor production.
export const REPAIR_POWER = 0.8; // power per HP repaired
// Emergency intercept [Space]: every weapon (and every pad in range) fires only at the priority target (or the
// most urgent threat), faster, and keeps firing past a sure kill. Costs power up front, then a long cooldown.
export const INTERCEPT = { time: 4, cooldown: 30, power: 25, rate: 1.6 };

export interface Upgrade {
  id: string; name: string; group: string; desc: string;
  base: number; mult: number; max: number;
  req?: number; // base level needed to buy
  needs?: string; // upgrade that must be owned first (e.g. the radar, for everything that needs a track)
}
export const SWEEP_CAP = 8; // Scan Rate levels a rotating radar can take; LTAMDS AESA lifts it
const U = (group: string, id: string, name: string, base: number, mult: number, max: number, desc: string, req?: number, needs?: string): Upgrade =>
  ({ group, id, name, base, mult, max, desc, req, needs });
// The run starts with two AA machine guns and eyes. The search radar and the Patriot are bought, from these base levels.
export const RADAR_REQ = 3, PAC3_REQ = 3; // the Patriot needs the radar, so it comes right after it
const R = 'radar';

export const UPGRADES: Upgrade[] = [
  U('BATTERY', 'hp', 'Hardened Shelters', 60, 1.45, Infinity, '+40 max HP'),
  U('BATTERY', 'armor', 'Earth Revetments', 90, 1.6, Infinity, '-12% of the damage still taken'),
  U('BATTERY', 'repair', 'Maintenance Crew', 120, 1.6, Infinity, '+0.6 HP/s'),
  U('POWER', 'gen', 'EPP-III Generator', 50, 1.45, Infinity, '+3 power/s', undefined, R),
  U('POWER', 'cap', 'Battery Banks', 40, 1.4, Infinity, '+40 power storage', undefined, R),
  U('SENSORS', 'radar', 'AN/MPQ-65 Radar', 200, 1, 1, 'search radar + fire control: detection beyond sight, locks, radar modes', RADAR_REQ),
  U('SENSORS', 'range', 'LTAMDS Array', 60, 1.5, Infinity, '+7 detection range', undefined, R),
  U('SENSORS', 'sweep', 'TRML-4D Scan Rate', 70, 1.5, Infinity, '+20% scan rate (max 8 on a rotating radar)', undefined, R),
  U('SENSORS', 'aesa', 'LTAMDS AESA', 600, 1, 1, 'staring 360° array: no sweep · +25% scan rate · uncaps scan rate', 4, R),
  U('SENSORS', 'res', 'GaN T/R Modules', 50, 1.5, Infinity, '+15% detection chance · faster decoy ID', undefined, R),
  U('SENSORS', 'persist', 'Track Memory', 50, 1.45, Infinity, '+1.5s contact memory', undefined, R),
  U('FIRE CONTROL', 'slots', 'ECS Channels', 80, 1.55, Infinity, '+1 simultaneous lock', undefined, R),
  U('FIRE CONTROL', 'trange', 'Track Range', 60, 1.5, Infinity, '+6 tracking range', undefined, R),
  U('FIRE CONTROL', 'modes', 'Threat Evaluation', 100, 2, 3, 'unlock next auto mode [T]', undefined, R),
  U('WEAPONS', 'dmg', 'Lethality Enhancer', 70, 1.45, Infinity, '+25% all weapon damage'),
  U('WEAPONS', 'rate', 'Salvo Doctrine', 80, 1.5, Infinity, '+15% all fire rate'),
  U('WEAPONS', 'pac3', 'PAC-3 MSE Battery', 300, 1, 1, 'hit-to-kill interceptors on the locks · the only answer to ballistic missiles', PAC3_REQ, R),
  U('WEAPONS', 'pulse', 'HEL 50kW Laser', 250, 1.7, Infinity, 'point-defence beam, 11 m, fast and hard-hitting · +40%/lv', undefined, R),
  U('WEAPONS', 'missile', 'IRIS-T SLX', 400, 1.7, Infinity, 'homing blast-frag · +40%/lv', undefined, R),
  U('WEAPONS', 'rail', 'HPM Leonidas', 700, 1.7, Infinity, 'microwave cone, fries everything within 7 m of it · +40%/lv', undefined, R),
  U('MAGAZINE', 'acap', 'M903 Canisters', 40, 1.4, Infinity, '+25 interceptor capacity', undefined, 'pac3'),
  U('MAGAZINE', 'aprod', 'GMT Reload', 50, 1.45, Infinity, '+1.1 interceptors/s', undefined, 'pac3'),
  U('PERIMETER', 'mg', '12.7mm AA MG', 60, 1.5, Infinity, 'belt-fed gun on what it can see, short range · +1 emplacement'),
  U('PERIMETER', 'mantis', 'MANTIS 35mm C-RAM', 150, 1.35, Infinity, 'fast gun, short range · +1 emplacement', 2),
  U('PERIMETER', 'stinger', 'Stinger Team', 220, 1.35, Infinity, 'MANPADS, mid range homing · +1 emplacement', 3),
  U('PERIMETER', 'iris', 'IRIS-T SLM', 350, 1.4, Infinity, 'medium-range SAM, all round, takes on missiles first · +1 emplacement', 5, R),
  U('PERIMETER', 'jammer', 'EW Jammer', 300, 1.4, Infinity, 'slows contacts nearby, drains power · +1 emplacement', 4),
  U('PERIMETER', 'observer', 'Observer Post', 100, 1.4, Infinity, 'sees 28m round itself, for every gun · +1 emplacement', 2),
  U('PERIMETER', 'ammo', 'Ammo Point', 120, 1.4, Infinity, 'guns within 10m: +25% fire rate, belts reload twice as fast · +1 emplacement', 2),
  // GROUND ASSAULT only (GROUND_ONLY).
  U('PERIMETER', 'wire', 'Concertina Wire', 40, 1.3, Infinity, 'obstacle belt: walkers inside 7m wade through at a third of their speed · +1 emplacement'),
  U('PERIMETER', 'mines', 'M18A1 Claymore Belt', 70, 1.35, Infinity, 'directional mines: blast every walker in the arc that steps within 6m · 4 charges, re-laid over time · +1 emplacement'),
  U('PERIMETER', 'gmg', 'Mk 19 Grenade Launcher', 110, 1.4, Infinity, '40mm automatic grenades, 18m: splash tears up packs of walkers · +1 emplacement', 2),
  U('PERIMETER', 'javelin', 'FGM-148 Javelin Team', 200, 1.4, Infinity, 'top-attack missile, 28m, through any armour, heaviest walker first · thermal sight sees 26m · +1 emplacement', 3),
  U('PERIMETER', 'mortar', 'M120 120mm Mortar', 280, 1.4, Infinity, 'indirect fire, 36m, big splash · can\'t hit inside 9m, needs eyes on the target · +1 emplacement', 4),
  U('PERIMETER', 'rws30', 'XM813 30mm RWS', 180, 1.4, Infinity, '30mm Bushmaster on a remote weapon station, 20m: half again through armour · +1 emplacement', 3),
  U('PERIMETER', 'hel', 'LOCUST 20kW Laser', 260, 1.4, Infinity, 'laser on a trailer, 22m: burns through one walker after another, no ammo, draws power while it fires · +1 emplacement', 3),
  U('PERIMETER', 'hpm', 'Leonidas HPM', 420, 1.45, Infinity, 'microwave array: fries every robot in a 60° cone out to 13m and stuns the rest · heavy on power · +1 emplacement', 4),
  U('PERIMETER', 'rockets', 'Hydra-70 Rocket Pod', 360, 1.45, Infinity, 'salvo of 8 rockets onto the thickest pack, 15-45m, then a long reload · +1 emplacement', 5),
];
// Each mode's shop: the air-defence systems are no use against robots on foot, and the ground weapons don't shoot
// at aircraft. What the mode doesn't use is left out of its shop (sim.lockReason).
export const AIR_ONLY = ['radar', 'range', 'sweep', 'aesa', 'res', 'persist', 'slots', 'trange', 'modes', 'pac3', 'pulse', 'missile', 'rail', 'stinger', 'iris'];
export const GROUND_ONLY = ['wire', 'mines', 'gmg', 'javelin', 'mortar', 'rws30', 'hel', 'hpm', 'rockets'];

// Perimeter emplacements (pads) sit on fixed slots and engage any contact that can be seen (by eye or radar)
// inside their range and field of fire, without using a lock slot. Support units don't shoot: they boost the
// units round them. Where a unit goes decides what it covers, what it risks and what it boosts.
export type PerimKind = 'mg' | 'mantis' | 'stinger' | 'iris' | 'jammer' | 'observer' | 'ammo' | 'wire' | 'mines' | 'gmg' | 'javelin' | 'mortar' | 'rws30' | 'hel' | 'hpm' | 'rockets';
export const PERIM_KINDS: PerimKind[] = ['mg', 'mantis', 'stinger', 'iris', 'jammer', 'observer', 'ammo', 'wire', 'mines', 'gmg', 'javelin', 'mortar', 'rws30', 'hel', 'hpm', 'rockets'];
export const GUNS: PerimKind[] = ['mg', 'mantis', 'stinger', 'iris', 'gmg', 'javelin', 'mortar', 'rws30', 'hel', 'hpm', 'rockets']; // units that shoot: fields of fire, crossfire
// Who shoots at what: SAMs and MANPADS only at aircraft; the ground weapons only at walkers. Guns take either.
export const AIR_GUNS: PerimKind[] = ['stinger', 'iris'];
export const GROUND_GUNS: PerimKind[] = ['gmg', 'javelin', 'mortar', 'mines', 'rws30', 'hel', 'hpm', 'rockets'];
// Visual spotting, radar or not: anything this close to the base, or to an emplacement, is seen. NIGHT RAID x VISUAL_DARK.
export const VISUAL_R = 18, PAD_EYES = 15, VISUAL_DARK = 0.6; // m (an emplacement sees as far as the MG reaches)
export const MG_BELT = { rounds: 40, reload: 3 }; // the MG feeds from its own belt, not the interceptor pool; s to reload
export const PLACE_TIME = 8; // s to click a spot before the pad places itself on the best slot
export const BUILD_SLOW = 0.6; // game speed during the build window (the clock runs slower, so there's time to place)

// Building: units go anywhere on open ground inside the build zone, which grows with the base level, at least
// PAD_GAP from each other and clear of the base compound, water, rock and woods (see terrain.ts). How many units
// the base can field also grows with the level (PAD_CAP, the last entry repeats).
// Where a unit stands decides its belt. Forward (24 m+): engages first, but slow to resupply and in the path of
// FPVs and Lancets. Main: balanced. Inner (inside 14 m): safe and all round, but engages late.
export type Belt = 'fwd' | 'main' | 'inner';
export const BELT_R: Record<Belt, number> = { fwd: 30, main: 17, inner: 11 }; // typical distance, for the auto-placer
export const beltAt = (x: number, z: number): Belt => { const d = Math.hypot(x, z); return d >= 24 ? 'fwd' : d >= 14 ? 'main' : 'inner'; };
export const BUILD_MIN = 10.5, PAD_GAP = 3.5; // m: clear of the base compound, and between units
const BUILD_R = [20, 31, 34, 34, 36]; // m, by base level (the last entry repeats)
export const buildR = (level: number) => BUILD_R[Math.min(level, BUILD_R.length) - 1];
const PAD_CAP = [3, 5, 7, 11, 12, 13, 14, 15, 16]; // lv1: the two starting MGs and one more
export const perimSlots = (level: number) => PAD_CAP[Math.min(level, PAD_CAP.length) - 1];
// Terrain (terrain.ts `site`): where a unit stands gives it a character, as well as a belt.
// high: up against a rock outcrop, +20% range and eyes, but on the skyline: FPVs and Lancets dive on it from twice as
//   far, and a cruise missile rates it higher. treeline: at the edge of the woods, never dived on or found by a cruise
//   missile, but -15% range. road: MG belts reload as fast as with an ammo point in reach.
export const TERRAIN = { high: { range: 1.2, dive: 2, value: 100 }, treeline: { range: 0.85 } };
// The starting kit: a section of two MGs either side of the front axis, on the main line. With 10 m guns one alone
// can't cover the approach. Both spots are in the cleared near field of fire, which every map keeps open.
export const START_PADS = [{ x: -4, z: -16 }, { x: 4, z: -16 }]; // close enough that both fields of fire cross on the axis
// Distances (m) the auto-placer samples the threat arc at when it scores a spot: where incoming paths are worth covering.
export const SPOT_RINGS = [14, 22, 30];

// Field of fire: half-width around the unit's facing (away from the base). Math.PI = all round.
export const FANS: Record<PerimKind, number> = { mg: 60 * DEG, mantis: Math.PI, stinger: 90 * DEG, iris: Math.PI, jammer: Math.PI, observer: Math.PI, ammo: Math.PI,
  wire: Math.PI, mines: 60 * DEG, gmg: 75 * DEG, javelin: 90 * DEG, mortar: Math.PI, rws30: 90 * DEG, hel: 90 * DEG, hpm: 30 * DEG, rockets: 60 * DEG };
// Veterancy: a gun gets better with the kills it has scored itself. Ranks by kill count; kept through moves and
// tier upgrades, lost when the unit is sold.
export const VETERANCY = [
  { kills: 0, name: 'GREEN', dmg: 1, rate: 1, range: 1 },
  { kills: 5, name: 'BLOODED', dmg: 1.1, rate: 1.05, range: 1 },
  { kills: 15, name: 'VETERAN', dmg: 1.2, rate: 1.1, range: 1.05 },
  { kills: 35, name: 'ELITE', dmg: 1.35, rate: 1.15, range: 1.1 },
  { kills: 70, name: 'ACE', dmg: 1.5, rate: 1.2, range: 1.15 },
];
export const vetRank = (kills: number) => VETERANCY.reduce((r, v, i) => kills >= v.kills ? i : r, 0);
export const CROSSFIRE = 0.2; // +damage on a target inside another gun's field of fire too
export const PERIM = {
  mg: { dmg: 3, rate: 6, range: 10, ammo: 0, power: 0 }, // short reach, so each burst counts more
  mantis: { dmg: 1.2, rate: 10, range: 15, ammo: 0.15, power: 0 },
  stinger: { dmg: 7, rate: 0.8, range: 24, ammo: 1, power: 0 },
  iris: { dmg: 10, rate: 0.5, range: 40, ammo: 2, power: 0 }, // IRIS-T SLM: medium-range SAM, missiles first
  jammer: { dmg: 0, rate: 0, range: 18, ammo: 0, power: 1.2 }, // power/s while anything is in range
  observer: { dmg: 0, rate: 0, range: 0, ammo: 0, power: 0 },
  ammo: { dmg: 0, rate: 0, range: 0, ammo: 0, power: 0 },
  wire: { dmg: 0, rate: 0, range: 7, ammo: 0, power: 0 },
  mines: { dmg: 22, rate: 0, range: 6, ammo: 0, power: 0 }, // per charge, to every walker in the arc
  gmg: { dmg: 3.5, rate: 3, range: 18, ammo: 0, power: 0 }, // splash GROUND_FIRE.gmg; feeds from its own belt
  javelin: { dmg: 40, rate: 0.3, range: 28, ammo: 2, power: 0 },
  mortar: { dmg: 16, rate: 0.35, range: 36, ammo: 1, power: 0 },
  rws30: { dmg: 6, rate: 2.5, range: 20, ammo: 0.25, power: 0 },
  hel: { dmg: 0.9, rate: 10, range: 22, ammo: 0, power: 0.25 }, // a beam: ten ticks a second while it burns, power per tick
  hpm: { dmg: 7, rate: 0.5, range: 13, ammo: 0, power: 6 }, // per pulse, to every robot in the cone (FANS.hpm)
  rockets: { dmg: 9, rate: 1 / 12, range: 45, ammo: 4, power: 0 }, // per rocket (GROUND_FIRE.rockets); rate: salvos a second
};
// Ground weapons. gmg: grenade splash (m), belt of rounds, s to reload. mortar: splash, minimum range, round's
// flight time (s), how high it's drawn arcing. mines: charges, s to re-lay one. javelinEyes: m its thermal sight sees.
// rockets: rockets a salvo, splash, minimum range, flight time, scatter (m) round the aim point, arc height, packs
// sampled when it picks the thickest one. hpm: s a pulse stuns what it doesn't kill. Mortar and rockets need eyes on
// what they fire at (the unit's own, an observer post's, a Javelin sight's).
export const GROUND_FIRE = {
  gmg: { splash: 2.2, belt: 32, reload: 4, speed: 35 },
  mortar: { splash: 4, min: 9, flight: 1.8, apex: 14 },
  mines: { charges: 4, relay: 15 },
  rockets: { salvo: 8, splash: 3, min: 15, flight: 1.4, scatter: 4, apex: 8, sample: 40 },
  hpm: { stun: 1.5 },
  javelinEyes: 26,
};
// Upgrades in place: a unit gets better in its slot instead of taking another one (tall or wide).
export const MG_TIERS = [
  { name: '12.7mm AA MG', cost: 0, ...PERIM.mg },
  { name: 'TWIN 12.7mm', cost: 110, ...PERIM.mg, rate: 11 },
  { name: 'ZU-23-2', cost: 240, ...PERIM.mg, dmg: 6, rate: 8, range: 12 },
];
// GROUND ASSAULT: every gun can be upgraded in its pit, MK II then MK III (the MG has its own line, MG_TIERS): damage
// and range x, for the unit's own shop price x `cost`.
export const UNIT_TIERS = [
  { name: '', cost: 0, dmg: 1, range: 1 },
  { name: 'MK II', cost: 0.8, dmg: 1.35, range: 1.08 },
  { name: 'MK III', cost: 1.6, dmg: 1.8, range: 1.15 },
];
// ... and fitted out, one item per slot (AMMO, SENSOR, KIT): fitting another in a slot replaces what was there. Only
// the kinds in `for` take an item. fx: dmg / rate / range / hp / power x; eyes: + m its own eyes see (sensor: `eyes`
// round itself at most, for every gun); night: sees in the dark as by day; splash: + m (a gun's rounds burst);
// pierce: share of the way through armour; burn: share of a hit's damage it burns for each s, BURN s; stun: x HPM
// stun; fan: all-round field of fire; belt: x rounds or charges; guided: lobbed rounds home on the target;
// cone: x HPM cone; split: the laser splits onto one more target at that share; slow: wire slows to this (x speed);
// cut: wire also does this damage/s.
export type ModSlot = 'AMMO' | 'SENSOR' | 'KIT';
export interface ModFx { dmg?: number; rate?: number; range?: number; hp?: number; power?: number; eyes?: number; radar?: number; night?: boolean; splash?: number; pierce?: number; burn?: number;
  stun?: number; fan?: boolean; belt?: number; guided?: boolean; cone?: number; split?: number; slow?: number; cut?: number }
export interface UnitMod { id: string; name: string; slot: ModSlot; cost: number; for: PerimKind[]; desc: string; fx: ModFx }
const KINETIC: PerimKind[] = ['mg', 'mantis', 'rws30'], LOBBED: PerimKind[] = ['gmg', 'mortar', 'rockets'];
const SHOOTERS: PerimKind[] = ['mg', 'mantis', 'gmg', 'javelin', 'mortar', 'rws30', 'hel', 'hpm', 'rockets'];
export const BURN = 3; // s an incendiary hit burns
export const UNIT_MODS: UnitMod[] = [
  // AMMO: what it fires.
  { id: 'ap', name: 'AP / API rounds', slot: 'AMMO', cost: 60, for: KINETIC, desc: 'tungsten-cored: 75% of the way through armour · -10% damage', fx: { pierce: 0.75, dmg: 0.9 } },
  { id: 'he', name: 'Airburst HE (AHEAD)', slot: 'AMMO', cost: 90, for: ['mantis', 'rws30', 'gmg'], desc: 'rounds burst over the pack: +1.5m splash · -20% damage', fx: { splash: 1.5, dmg: 0.8 } },
  { id: 'inc', name: 'Incendiary (API-T / thermite)', slot: 'AMMO', cost: 80, for: [...KINETIC, ...LOBBED], desc: `hits set it burning: 40% of the hit again every second for ${BURN}s`, fx: { burn: 0.4 } },
  { id: 'dpicm', name: 'DPICM cluster rounds', slot: 'AMMO', cost: 120, for: ['mortar', 'rockets'], desc: 'bomblets over a wide area: +60% splash · -25% damage', fx: { splash: 1.6, dmg: 0.75 } },
  { id: 'pgm', name: 'Precision-guided (PGMM / APKWS)', slot: 'AMMO', cost: 140, for: LOBBED, desc: 'laser-guided: rounds follow the target down · +20% damage', fx: { guided: true, dmg: 1.2 } },
  { id: 'mp', name: 'Multi-purpose warhead (Javelin F)', slot: 'AMMO', cost: 100, for: ['javelin'], desc: 'blast-frag sleeve: 2.5m splash, still top-attack · -15% damage', fx: { splash: 2.5, dmg: 0.85 } },
  { id: 'optics', name: 'Adaptive optics', slot: 'AMMO', cost: 150, for: ['hel'], desc: 'tighter spot on the target: +40% damage, +15% range', fx: { dmg: 1.4, range: 1.15 } },
  { id: 'splitter', name: 'Beam splitter', slot: 'AMMO', cost: 130, for: ['hel'], desc: 'a second beam on the next target at 60%', fx: { split: 0.6 } },
  { id: 'wide', name: 'Wide-aperture array', slot: 'AMMO', cost: 160, for: ['hpm'], desc: '90° cone instead of 60° · -15% damage', fx: { cone: 1.5, dmg: 0.85 } },
  { id: 'prf', name: 'High-PRF pulses', slot: 'AMMO', cost: 140, for: ['hpm'], desc: 'pulses come 40% faster, stuns last twice as long · +30% power per pulse', fx: { rate: 1.4, stun: 2, power: 1.3 } },
  { id: 'razor', name: 'Triple-strand razor wire', slot: 'AMMO', cost: 50, for: ['wire'], desc: 'walkers inside wade at a fifth of their speed and get cut: 1 damage/s', fx: { slow: 0.2, cut: 1 } },
  { id: 'spider', name: 'M7 Spider networked mines', slot: 'AMMO', cost: 90, for: ['mines'], desc: '6 charges instead of 4, re-laid twice as fast', fx: { belt: 1.5, rate: 2 } },
  // SENSOR: what it sees with.
  { id: 'flir', name: 'Thermal sight (FLIR)', slot: 'SENSOR', cost: 70, for: [...SHOOTERS, 'mines'], desc: '+12m eyes, sees as well at night · +10% range', fx: { eyes: 12, night: true, range: 1.1 } },
  { id: 'gsr', name: 'Ground surveillance radar (EchoGuard)', slot: 'SENSOR', cost: 140, for: [...SHOOTERS, 'observer', 'wire', 'ammo'], desc: 'sees 36m round itself, day or night, for every gun · 0.3 power/s', fx: { radar: 36, night: true } },
  { id: 'fcs', name: 'Fire-control computer + rangefinder', slot: 'SENSOR', cost: 110, for: SHOOTERS, desc: 'first-round hits: +20% damage, +10% fire rate', fx: { dmg: 1.2, rate: 1.1 } },
  // KIT: what it's fitted with.
  { id: 'auto', name: 'Autoloader / ammo booster', slot: 'KIT', cost: 100, for: ['mg', 'mantis', 'gmg', 'javelin', 'mortar', 'rws30', 'rockets'], desc: '+30% fire rate, belts twice as long', fx: { rate: 1.3, belt: 2 } },
  { id: 'plates', name: 'Ballistic armour kit', slot: 'KIT', cost: 80, for: [...SHOOTERS, 'observer', 'ammo', 'jammer'], desc: 'add-on plates and blankets: x2 unit HP', fx: { hp: 2 } },
  { id: 'rwsm', name: 'Stabilised RWS mount', slot: 'KIT', cost: 90, for: ['mg', 'gmg', 'javelin', 'rws30', 'hel'], desc: 'remote turret: fires all round (360° field of fire)', fx: { fan: true } },
  { id: 'barrel', name: 'Long barrel / extended range', slot: 'KIT', cost: 90, for: ['mg', 'mantis', 'gmg', 'mortar', 'rws30', 'rockets'], desc: '+25% range · -10% fire rate', fx: { range: 1.25, rate: 0.9 } },
  { id: 'caps', name: 'Capacitor bank', slot: 'KIT', cost: 120, for: ['hel', 'hpm'], desc: 'stores power between shots: -40% power drawn', fx: { power: 0.6 } },
];
export const MOD_SLOTS: ModSlot[] = ['AMMO', 'SENSOR', 'KIT'];
export const unitMod = (id: string) => UNIT_MODS.find(m => m.id === id);
// Support units.
export const OBSERVER_EYES = 28; // m an observer post sees round itself
export const AMMO_R = 10, AMMO_RATE = 1.25, AMMO_RELOAD = 0.5; // ammo point: reach, fire rate x, belt reload x for guns in reach
export const FWD_RELOAD = 1.5; // belt reload x on the forward line without an ammo point
// Unit HP: FPVs and Lancets passing within DIVE_R of a unit on the forward line dive on it. At 0 HP it's down (no fire, no eyes, no
// support) until repaired to half; repairs run all the time and finish at once in the build window.
export const PAD_HP = 30, PAD_REPAIR = 0.5, DIVE_R = 3; // HP, HP/s, m
export const SELL_REFUND = 0.5, MOVE_TIME = 5; // in combat: share refunded, s offline while relocating (free in the build window)
export const JAM_SLOW = 0.55; // speed multiplier inside a jammer bubble (elites ignore it)

// Multipliers (`add*` fields are additive). Every keystone trades something; travel nodes are small and pure.
export interface PerkFx {
  dmg?: number; rate?: number; gen?: number; range?: number; sweep?: number; aprod?: number;
  credits?: number; hp?: number; persist?: number; drain?: number; trange?: number; pcap?: number; acap?: number;
  addSlots?: number; addArmor?: number; addChain?: number; addRepair?: number;
  // rule changers
  addFusion?: number; addLpi?: number; addArc?: number; addScav?: number; addFrag?: number; markDmg?: number;
  addBlackout?: number; addCounterSead?: number; addKillChain?: number; addOverkill?: number; addLastStand?: number;
}
// Rule-keystone numbers.
export const BLACKOUT = { dark: 2, lit: 0.7 }; // contact memory x while silent / while radiating
export const COUNTER_SEAD = 0.2; // share of power storage restored per ARM shot down
export const KILL_CHAIN = { every: 5, time: 8 }; // kills per extra lock slot, s it lasts
export const OVERKILL_R = 8; // m an overkill's excess damage can jump
export const LAST_STAND = { hp: 0.25, rate: 1.5, gen: 0.6 };

// ---------- command tree ----------
// Every base level-up pays SKILL_POINTS points, and every SKILL_BONUS-th level one more. A point buys one node next
// to one you hold, starting from COMMAND at the centre. The bots reach base level ~13 in a ~30-minute run: 26 points,
// enough to fill one branch (≈20 nodes) and dip into another, or to reach about 8 of the 23 keystones across two:
// the tree is ~43% full at the end of a good run, so every point is a choice.
export const SKILL_POINTS = 2, SKILL_BONUS = 5;
export const skillPoints = (level: number) => (level - 1) * SKILL_POINTS + Math.floor(level / SKILL_BONUS);
export type Branch = 'OFFENSE' | 'DEFENSE' | 'SYSTEMS';
// Where each branch points (degrees clockwise from up) on the radial map, and what it's about.
export const BRANCHES: Record<Branch, { a: number; desc: string }> = {
  OFFENSE: { a: -60, desc: 'damage, fire rate and fire control' },
  DEFENSE: { a: 60, desc: 'hull, armour, repairs and staying hidden' },
  SYSTEMS: { a: 180, desc: 'power, sensors, the magazine and the money' },
};
// Travel nodes: one small, pure step each.
const TRAVEL: Record<string, { name: string; desc: string; fx: PerkFx }> = {
  dmg: { name: 'LETHALITY', desc: '+4% damage', fx: { dmg: 1.04 } },
  rate: { name: 'CYCLE TIME', desc: '+4% fire rate', fx: { rate: 1.04 } },
  hp: { name: 'HARDENING', desc: '+6% max HP', fx: { hp: 1.06 } },
  armor: { name: 'REVETMENT', desc: '+2% armour', fx: { addArmor: 0.02 } },
  repair: { name: 'DAMAGE CONTROL', desc: '+0.3 HP/s repair', fx: { addRepair: 0.3 } },
  persist: { name: 'TRACK MEMORY', desc: '+8% contact memory', fx: { persist: 1.08 } },
  gen: { name: 'GENERATORS', desc: '+6% power gen', fx: { gen: 1.06 } },
  pcap: { name: 'CAPACITORS', desc: '+10% power storage', fx: { pcap: 1.1 } },
  credits: { name: 'SALVAGE CREWS', desc: '+4% credits', fx: { credits: 1.04 } },
  range: { name: 'RADAR RANGE', desc: '+4% radar range', fx: { range: 1.04 } },
  sweep: { name: 'SCAN RATE', desc: '+5% sweep speed', fx: { sweep: 1.05 } },
  trange: { name: 'TRACK RANGE', desc: '+4% track range', fx: { trange: 1.04 } },
  aprod: { name: 'RELOAD CREWS', desc: '+8% interceptor production', fx: { aprod: 1.08 } },
  acap: { name: 'MAGAZINE', desc: '+10% interceptor storage', fx: { acap: 1.1 } },
};
// A node: r (ring, 0 = COMMAND) and a (degrees off its branch's heading) place it on the map; `from`: the nodes it
// hangs off. Keystones (`key`) are the old perks: big, with a trade, and always leaves (you can't path through one).
// `rule`: changes how the battery plays. `need`: an upgrade that must be owned before it can be taken.
export interface SkillNode { id: string; branch: Branch | ''; r: number; a: number; from: string[]; name: string; desc: string; fx: PerkFx; key?: boolean; rule?: boolean; need?: string }
const T = (id: string, branch: Branch, r: number, a: number, from: string[], k: keyof typeof TRAVEL): SkillNode => ({ id, branch, r, a, from, ...TRAVEL[k] });
const K = (id: string, branch: Branch, r: number, a: number, from: string, name: string, desc: string, fx: PerkFx, o: { rule?: boolean; need?: string } = {}): SkillNode =>
  ({ id, branch, r, a, from: [from], name, desc, fx, key: true, ...o });
export const SKILLS: SkillNode[] = [
  { id: 'core', branch: '', r: 0, a: 0, from: [], name: 'COMMAND', desc: 'the battery commander: every path starts here', fx: {} },
  // OFFENSE: two lanes, damage (right) and fire rate (left), that meet in the middle; fire control at the far end.
  T('o1', 'OFFENSE', 1, 0, ['core'], 'dmg'),
  T('o2a', 'OFFENSE', 2, -20, ['o1'], 'rate'), T('o2b', 'OFFENSE', 2, 20, ['o1'], 'dmg'),
  K('trigger', 'OFFENSE', 3, -40, 'o2a', 'HAIR TRIGGER', '+35% fire rate · -20% interceptor production', { rate: 1.35, aprod: 0.8 }),
  T('o3a', 'OFFENSE', 3, -13, ['o2a'], 'rate'), T('o3b', 'OFFENSE', 3, 13, ['o2b'], 'dmg'),
  K('overcharge', 'OFFENSE', 3, 40, 'o2b', 'OVERCHARGE', '+50% damage · -30% power gen', { dmg: 1.5, gen: 0.7 }),
  T('o4a', 'OFFENSE', 4, -24, ['o3a'], 'rate'), T('o4b', 'OFFENSE', 4, 0, ['o3a', 'o3b'], 'dmg'), T('o4c', 'OFFENSE', 4, 24, ['o3b'], 'dmg'),
  K('overkill', 'OFFENSE', 5, -42, 'o4a', 'OVERKILL', 'damage past a kill jumps to the nearest contact within 8m · -10% fire rate', { addOverkill: 1, rate: 0.9 }, { rule: true }),
  T('o5a', 'OFFENSE', 5, -16, ['o4a'], 'rate'),
  K('chain', 'OFFENSE', 5, 0, 'o4b', 'CHAIN REACTION', 'kills explode for 6 dmg · -10% credits', { addChain: 6, credits: 0.9 }),
  T('o5b', 'OFFENSE', 5, 16, ['o4c'], 'dmg'),
  K('glass', 'OFFENSE', 5, 42, 'o4c', 'GLASS CANNON', '+60% damage · -45% max HP', { dmg: 1.6, hp: 0.55 }),
  T('o6a', 'OFFENSE', 6, -24, ['o5a'], 'rate'), T('o6b', 'OFFENSE', 6, 24, ['o5b'], 'dmg'),
  K('killchain', 'OFFENSE', 7, -42, 'o6a', 'KILL CHAIN', 'every 5 kills: +1 lock slot for 8s · -10% damage', { addKillChain: 1, dmg: 0.9 }, { rule: true, need: 'radar' }),
  K('arc', 'OFFENSE', 7, -13, 'o6a', 'ARC LASER', 'laser jumps to 2 more targets at 60% · -10% damage', { addArc: 2, dmg: 0.9 }, { rule: true, need: 'pulse' }),
  K('frag', 'OFFENSE', 7, 13, 'o6b', 'FRAG WARHEADS', 'PAC-3 hits splash for 50% · -15% fire rate', { addFrag: 0.5, rate: 0.85 }, { rule: true, need: 'pac3' }),
  K('overwatch', 'OFFENSE', 7, 42, 'o6b', 'OVERWATCH', 'your marked target takes x2 damage · -1 lock slot', { markDmg: 2, addSlots: -1 }, { rule: true, need: 'radar' }),
  // DEFENSE: armour and repairs (left), hull (right); going dark against ARMs at the far end.
  T('d1', 'DEFENSE', 1, 0, ['core'], 'hp'),
  T('d2a', 'DEFENSE', 2, -20, ['d1'], 'armor'), T('d2b', 'DEFENSE', 2, 20, ['d1'], 'hp'),
  K('laststand', 'DEFENSE', 3, -40, 'd2a', 'LAST STAND', 'below 25% HP: +50% fire rate, -40% power gen', { addLastStand: 1 }, { rule: true }),
  T('d3a', 'DEFENSE', 3, -13, ['d2a'], 'repair'), T('d3b', 'DEFENSE', 3, 13, ['d2b'], 'hp'),
  K('fortress', 'DEFENSE', 3, 40, 'd2b', 'FORTRESS', '+50% max HP · +10% armour · -15% fire rate', { hp: 1.5, addArmor: 0.1, rate: 0.85 }),
  T('d4a', 'DEFENSE', 4, -24, ['d3a'], 'armor'), T('d4b', 'DEFENSE', 4, 0, ['d3a', 'd3b'], 'repair'), T('d4c', 'DEFENSE', 4, 24, ['d3b'], 'hp'),
  K('csead', 'DEFENSE', 5, -42, 'd4a', 'COUNTER-SEAD', 'every ARM shot down restores 20% power · -10% credits', { addCounterSead: 1, credits: 0.9 }, { rule: true, need: 'radar' }),
  T('d5a', 'DEFENSE', 5, -16, ['d4a'], 'persist'), T('d5b', 'DEFENSE', 5, 16, ['d4c'], 'armor'),
  K('blackout', 'DEFENSE', 5, 42, 'd4c', 'BLACKOUT PROTOCOL', 'contacts coast x2 as long while the radar is dark · -30% contact memory while radiating', { addBlackout: 1 }, { rule: true, need: 'radar' }),
  T('d6a', 'DEFENSE', 6, -24, ['d5a'], 'persist'), T('d6b', 'DEFENSE', 6, 24, ['d5b'], 'hp'),
  K('lpi', 'DEFENSE', 7, -30, 'd6a', 'LPI WAVEFORM', 'LPI mode keeps full detection chance and range · -15% radar range', { addLpi: 1, range: 0.85 }, { rule: true, need: 'radar' }),
  K('fusion', 'DEFENSE', 7, 30, 'd6b', 'TRACK FUSION', 'locks hold while the radar is dark · -1 lock slot', { addFusion: 1, addSlots: -1 }, { rule: true, need: 'radar' }),
  // SYSTEMS: the magazine and the money (left), power and sensors (right).
  T('s1', 'SYSTEMS', 1, 0, ['core'], 'gen'),
  T('s2a', 'SYSTEMS', 2, -20, ['s1'], 'credits'), T('s2b', 'SYSTEMS', 2, 20, ['s1'], 'pcap'),
  K('salvage', 'SYSTEMS', 3, -40, 's2a', 'SALVAGE', '+25% credits · -15% damage', { credits: 1.25, dmg: 0.85 }),
  T('s3a', 'SYSTEMS', 3, -13, ['s2a'], 'aprod'), T('s3b', 'SYSTEMS', 3, 13, ['s2b'], 'range'),
  K('reactor', 'SYSTEMS', 3, 40, 's2b', 'REACTOR', '+60% power gen · -15% max HP', { gen: 1.6, hp: 0.85 }),
  T('s4a', 'SYSTEMS', 4, -24, ['s3a'], 'acap'), T('s4b', 'SYSTEMS', 4, 0, ['s3a', 's3b'], 'gen'), T('s4c', 'SYSTEMS', 4, 24, ['s3b'], 'sweep'),
  K('logistics', 'SYSTEMS', 5, -42, 's4a', 'AUTOMATED LOGISTICS', '+100% interceptor production · -15% credits', { aprod: 2, credits: 0.85 }, { need: 'pac3' }),
  T('s5a', 'SYSTEMS', 5, -16, ['s4a'], 'aprod'), T('s5b', 'SYSTEMS', 5, 16, ['s4c'], 'trange'),
  K('highfreq', 'SYSTEMS', 5, 42, 's4c', 'HIGH FREQUENCY', '+40% sweep speed · -15% radar range', { sweep: 1.4, range: 0.85 }, { need: 'radar' }),
  T('s6a', 'SYSTEMS', 6, -24, ['s5a'], 'credits'), T('s6b', 'SYSTEMS', 6, 24, ['s5b'], 'persist'),
  K('scav', 'SYSTEMS', 7, -42, 's6a', 'SCAVENGER', 'every kill refunds 2 interceptors · -10% max HP', { addScav: 2, hp: 0.9 }, { rule: true, need: 'pac3' }),
  K('multilock', 'SYSTEMS', 7, -13, 's6a', 'MULTI-LOCK', '+2 lock slots · -15% track range', { addSlots: 2, trange: 0.85 }, { need: 'radar' }),
  K('deepscan', 'SYSTEMS', 7, 13, 's6b', 'DEEP SCAN', '+30% radar range · -20% sweep speed', { range: 1.3, sweep: 0.8 }, { need: 'radar' }),
  K('signal', 'SYSTEMS', 7, 42, 's6b', 'SIGNAL BOOST', 'x2 contact memory · +50% radar power drain', { persist: 2, drain: 1.5 }, { need: 'radar' }),
];
export const skill = (id: string) => SKILLS.find(n => n.id === id);
export const KEYSTONES = SKILLS.filter(n => n.key);
// Both ways round: a node's neighbours are what it hangs off and what hangs off it.
export const skillLinks = (id: string) => SKILLS.filter(n => n.from.includes(id)).map(n => n.id).concat(skill(id)?.from ?? []);

// Doctrines: picked before a normal run (daily ops fly STANDARD). A starting loadout of free upgrade levels that
// don't count toward base level, and a trade that holds all run: `fx` works like a keystone's, `price` scales every
// upgrade's cost. `run` says what the trade is. Unlocked by your all-time records.
export type Records = { time: number; kills: number; level: number; earned: number };
export const DOCTRINES: { id: string; name: string; desc: string; run: string; need: string; lv: Record<string, number>; fx: PerkFx; price?: number; unlock: (b: Records) => boolean }[] = [
  { id: 'standard', name: 'STANDARD', desc: 'by the book', run: 'no trade-offs', need: '', lv: {}, fx: {}, unlock: () => true },
  { id: 'sensor', name: 'SENSOR NET', desc: 'the classic battery: radar and Patriot from the start · LTAMDS 1', run: '+15% radar range · +30% contact memory · -10% damage',
    need: 'survive 5:00', lv: { radar: 1, pac3: 1, range: 1 }, fx: { range: 1.15, persist: 1.3, dmg: 0.9 }, unlock: b => b.time >= 300 },
  { id: 'logistics', name: 'LOGISTICS', desc: 'Generator 2 · Canisters 2 · Reload 2', run: 'upgrades 12% cheaper · +30% interceptor production · -12% damage',
    need: 'earn 5,000 credits in a run', lv: { gen: 2, acap: 2, aprod: 2 }, fx: { aprod: 1.3, dmg: 0.88 }, price: 0.88, unlock: b => b.earned >= 5000 },
  { id: 'strike', name: 'FORWARD STRIKE', desc: 'Lethality 2 · Salvo 1 · +1 ECS channel', run: '+15% damage · +10% fire rate · -25% max HP',
    need: 'reach base level 6', lv: { dmg: 2, rate: 1, slots: 1 }, fx: { dmg: 1.15, rate: 1.1, hp: 0.75 }, unlock: b => b.level >= 6 },
];

// Base level L is reached at 1.5*(L-1)*L upgrades bought: 0, 3, 9, 18, 30, 45, 63...
export const baseLevel = (bought: number) => {
  let l = 1;
  while (1.5 * l * (l + 1) <= bought) l++;
  return l;
};

// What each base level builds. Every level also adds an M903 launcher (up to 8) and 2 perimeter pads.
// Stat effects are applied in deriveStats; `desc` is what the level-up card shows.
export const BASE_LEVELS: { name: string; desc: string }[] = [
  { name: 'COMMAND POST', desc: 'command post and a section of two 12.7mm AA guns' },
  { name: 'POWER PLANT', desc: 'EPP-III generators: +2 power/s' },
  { name: 'COMMUNICATIONS', desc: 'OE-349 datalink: raids announced 5s earlier · +1s contact memory' },
  { name: 'SURVEILLANCE RADAR', desc: 'TRML-4D: keeps searching at half range while the MPQ-65 is knocked out' },
  { name: 'DEFENSIVE STRUCTURES', desc: 'earth berms round the launchers: +10% armor' },
  { name: 'ADVANCED AIR DEFENSE', desc: 'second fire control shelter: +1 lock slot' },
  { name: 'HARDENED COMMAND NODE', desc: 'hardened shelters: +25% max HP · ARM hits knock the radar out half as long' },
];
export const baseLevelInfo = (level: number) => BASE_LEVELS[Math.min(level, BASE_LEVELS.length) - 1];
export const BACKUP_RADAR = 0.5; // TRML-4D range and detection chance while the MPQ-65 is down

// Milestones: every MILESTONE-th level of an open-ended upgrade is a new rank, worth one extra level for free.
export const MILESTONE = 5;
export const rank = (n: number) => Math.floor(n / MILESTONE);
// Levels that count in deriveStats: what you bought, plus a level per rank on the open-ended upgrades.
const ranked = (id: string, n: number) => n + (UPGRADES.find(u => u.id === id)?.max === Infinity ? rank(n) : 0);

export function deriveStats(lv: Record<string, number>, skills: string[], level = 1, doctrine = 'standard') {
  const L = (id: string) => ranked(id, lv[id] ?? 0);
  const p = { dmg: 1, rate: 1, gen: 1, range: 1, sweep: 1, aprod: 1, credits: 1, hp: 1, persist: 1, drain: 1, trange: 1, pcap: 1, acap: 1, addSlots: 0, addArmor: 0, addChain: 0, addRepair: 0,
    addFusion: 0, addLpi: 0, addArc: 0, addScav: 0, addFrag: 0, markDmg: 1,
    addBlackout: 0, addCounterSead: 0, addKillChain: 0, addOverkill: 0, addLastStand: 0 };
  // The command tree, then the doctrine's run-long trade, folded the same way.
  for (const fx of [...skills.map(id => skill(id)!.fx), DOCTRINES.find(d => d.id === doctrine)?.fx ?? {}]) {
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
    radar: L('radar') > 0, // search radar + fire control; without it: eyes only, no locks
    maxHp: (100 + 40 * L('hp')) * p.hp * (level >= 7 ? 1.25 : 1),
    armor: Math.min(0.85, 0.85 * (1 - 0.88 ** L('armor')) + p.addArmor + (level >= 5 ? 0.1 : 0)),
    repair: 0.6 * L('repair') + p.addRepair,
    gen: (6 + 3 * L('gen') + (level >= 2 ? 2 : 0)) * p.gen,
    raidWarn: level >= 3 ? 5 : 0, // s of extra raid warning
    backupRadar: level >= 4,
    armStun: level >= 7 ? 0.5 : 1,
    powerCap: (60 + 40 * L('cap')) * p.pcap,
    radarRange: (68 + 7 * L('range')) * p.range, // outranges every shooter
    sweep: 2.5 * (1 + 0.2 * L('sweep')) * (L('aesa') ? 1.25 : 1) * p.sweep, // rad/s; with AESA: revisits/rev-equivalent
    aesa: L('aesa') > 0,
    res: 1 + 0.15 * L('res'),
    persist: (4.5 + 1.5 * L('persist') + (level >= 3 ? 1 : 0)) * p.persist,
    drain: (1.5 + 0.25 * radarLv) * p.drain,
    slots: 2 + L('slots') + p.addSlots + (level >= 6 ? 1 : 0),
    trackRange: (62 + 6 * L('trange')) * p.trange, // just past PAC-3 reach
    modes: 1 + L('modes'),
    ammoCap: (40 + 25 * L('acap')) * p.acap,
    ammoProd: (3 + 1.1 * L('aprod')) * p.aprod,
    ammoPower: 0.5, // power per round produced
    upkeep: (['pac3', 'pulse', 'missile', 'rail'] as const).reduce((a, k) => a + (UPKEEP[k] ?? 0) * (lv[k] ?? 0), 0), // standby power/s of the weapons (units: sim.upkeep)
    credits: p.credits,
    chain: p.addChain,
    fusion: p.addFusion > 0, lpi: p.addLpi > 0, arc: p.addArc, scav: p.addScav, frag: p.addFrag, markDmg: p.markDmg,
    blackout: p.addBlackout > 0, counterSead: p.addCounterSead > 0, killChain: p.addKillChain > 0, overkill: p.addOverkill > 0, lastStand: p.addLastStand > 0,
    padDmg: (1 + 0.25 * L('dmg')) * p.dmg, // x on every pad gun (per-unit stats in sim.padStats)
    padRate: (1 + 0.15 * L('rate')) * p.rate,
    weapons: {
      cannon: weapon('cannon', L('pac3') > 0, 1),
      pulse: weapon('pulse', L('pulse') > 0, wlv('pulse')),
      missile: weapon('missile', L('missile') > 0, wlv('missile')),
      rail: weapon('rail', L('rail') > 0, wlv('rail')),
    },
  };
}
export type Stats = ReturnType<typeof deriveStats>;
