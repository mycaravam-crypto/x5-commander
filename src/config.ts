// Every tunable number lives here.

export const ARENA_R = 60;
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
  | 'recon' | 'ka52' | 'hyper' | 'mald' | 'su25' | 'rocket' | 'sead' | 'arm2';

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
};
// Kills that matter get a bigger blast, a camera shake, a banner and a sound of their own (hud, render, sfx).
export const BIG_KILLS: Partial<Record<EnemyKind, string>> = { elite: 'SU-34 SPLASHED', ew: 'JAMMER DOWN', tbm: 'BALLISTIC INTERCEPTED', hyper: 'KINZHAL INTERCEPTED', ka52: 'ALLIGATOR DOWN', su25: 'SU-25 SPLASHED', sead: 'SU-35S SPLASHED' };
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
export const HELO = { standoff: 26, every: 4, ammo: 4 }; // Mi-28: m out it hovers at, s between ATGMs, ATGMs carried; then it goes home
export const KAB_R = 32, KAB_PAIR = 2; // m out a Su-34 releases its glide bombs (and how many), then turns for home
export const KAB_FIRST = 1; // bombs a Su-34 carries on the SEAD level, where it's new: one, so the first strike teaches instead of ending the run
export const EGRESS_SPEED = 1.4; // aircraft heading home, out of the arena (no reward, but no more harm)
// Ballistic missiles: m out they start their terminal manoeuvres, their size, speed x in the dive, and the height
// they're drawn coming down from.
export const TERMINAL: Partial<Record<EnemyKind, { r: number; jink: number; boost: number; apex: number }>> = {
  tbm: { r: 25, jink: 2.5, boost: 1, apex: 22 },
  hyper: { r: 30, jink: 1.2, boost: 1.4, apex: 30 }, // Kinzhal: less weave, far more speed
};
export const TBM_TERMINAL = TERMINAL.tbm!;
// Kh-101 (and the Kh-55 decoy): inside `r` m of its target it jinks `jink` hard, speeds up x`speed` and pops up
// `pop` m to dive on it.
export const CRUISE_TERMINAL = { r: 12, jink: 1.6, speed: 1.2, pop: 2.5 };
// Ka-52: m out it settles at, s it takes to settle before the first salvo (the moment to kill it), s between
// salvos, ATGMs per salvo and in all, s it stays popped up after firing, m it hovers at masked, m of strafe
// sideways, m its ATGMs reach a unit from, and how much harder an ATGM hits a unit than its damage says.
export const KA52 = { standoff: 30, settle: 4, every: 5, salvo: 2, ammo: 6, pop: 1.5, maskAlt: 1.2, strafe: 0.5, reach: 32 };
// Su-25: m out it fires, S-8s per salvo and their spread (rad), attack passes, m out it turns back in for the next
// one, m its rockets reach a unit from, s of pop-up and flares per run (IR seekers x `flares` meanwhile), m of pop-up.
export const SU25 = { release: 24, salvo: 4, spread: 0.06, passes: 2, turn: 52, reach: 20, pop: 2.5, flares: 0.4, popup: 3 };
// Su-35S SEAD: m out it holds station at, s between Kh-58s while the radar radiates (x the radar mode's armEvery),
// Kh-58s carried, s it waits on station at most before going home.
export const SEAD = { standoff: 42, every: 7, ammo: 4, time: 45 };
// Kh-58: s of motor, m its memory aim can be off the radar to the side, radar downtime x an ARM hit's.
export const ARM2 = { life: 20, scatter: 10, stun: 1.5 };
// FPV swarm: normal spawns bring ENEMIES.swarm.packs (4-8). Each FPV hunts the most isolated unit within `seek` m
// of it (fewest other guns covering its spot, at most `isolated`), diving on it at DIVE_SPEED. A unit on high
// ground is spotted TERRAIN.high.dive x further; the treeline hides it. No isolated unit in reach: the base.
export const SWARM = { seek: 8, isolated: 1 };
// Orlan-10: m out it circles at, s it stays on station before heading home, rad half-width of the sector it spots
// for (round its own bearing, so the sector moves as it circles), damage x on impacts in that sector, unit search
// range x for Lancets and FPVs in it.
export const RECON = { orbit: 38, time: 40, arc: 0.5, dmg: 1.25, seek: 1.6 };
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
    tip: 'TRAINING 1/4 · EYESIGHT: no radar yet. Anything close to the base or a gun is seen, and guns fire at it by themselves. Buy a second gun in the shop [Tab] and click open ground in the dashed ring to build it.',
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
export type RaidObjective = 'battery' | 'radar';
export const OBJECTIVES: Record<RaidObjective, string> = { battery: 'PROTECT BATTERY', radar: 'PROTECT RADAR' };
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

// Radar threats. ARMs home on the radar while it radiates, and a hit takes it offline. EMCON [F] silences it:
// no sweep, no locks, no radar power drain, and ARMs lose the emitter and veer off course.
export const ARM_STUN = 6; // s offline per ARM hit (stacks up to 2x)
export const ARM_VEER = 0.6; // rad an ARM swings off its heading once the radar goes dark
export const ARM_TURN = 1.5; // rad/s; limited, so a late EMCON still gets hit
export const ARM_LIFE = 16; // s of motor, then it falls short
export const ARM_EVERY = 10; // s between ARM launches per Su-34 inside ARM_LAUNCH_R
export const ARM_LAUNCH_R = 52;
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
export const EW_ORBIT = 38; // Mi-8 jammers stand off at this range and circle
export const EW_ARC = 0.4; // rad half-width of each jammed sector
export const EW_JAM = 0.35; // detection chance multiplier inside a jammed sector

// Logarithmic growth: every doubling of play time adds about the same threat, so upgrades (whose costs grow
// exponentially) can keep up and a run has no built-in end. m = minutes played.
export const grow = (m: number, k: number) => 1 + k * Math.log1p(m / 4);
// Past SURGE.from minutes the war escalates: HP and damage grow exponentially, numbers linearly, on top of the
// gentle curve. Upgrades cost more with every level, so a battery's strength grows about with the log of its
// income; the surge outruns it, and every run ends. Per minute past `from`.
export const SURGE = { from: 12, hp: 0.12, dmg: 0.06, spawn: 0.05 };
const surge = (m: number, k: number) => Math.exp(k * Math.max(0, m - SURGE.from));
const surgeLin = (m: number, k: number) => 1 + k * Math.max(0, m - SURGE.from);
export function difficulty(t: number) {
  const m = t / 60;
  return {
    // Composition carries most of the difficulty (see LEVELS), so raw numbers grow gently, until the surge.
    spawnRate: 0.6 * grow(m, 1.4) * surgeLin(m, SURGE.spawn), // spawn events / s
    hp: grow(m, 0.75) * surge(m, SURGE.hp),
    speed: 1 + 0.025 * Math.min(m, 20),
    dmg: grow(m, 0.6) * surge(m, SURGE.dmg),
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
// Holding a fire control lock costs power too, so more ECS channels in use means less for the radar sweep.
export const LOCK_POWER = 0.25; // power/s per lock held
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
// The run starts with one AA machine gun and eyes. The search radar and the Patriot are bought, from these base levels.
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
  U('WEAPONS', 'pulse', 'HEL 50kW Laser', 250, 1.7, Infinity, 'power beam · +40%/lv', undefined, R),
  U('WEAPONS', 'missile', 'IRIS-T SLX', 400, 1.7, Infinity, 'homing blast-frag · +40%/lv', undefined, R),
  U('WEAPONS', 'rail', 'HPM Leonidas', 700, 1.7, Infinity, 'microwave, hits the whole line · +40%/lv', undefined, R),
  U('MAGAZINE', 'acap', 'M903 Canisters', 40, 1.4, Infinity, '+25 interceptor capacity', undefined, 'pac3'),
  U('MAGAZINE', 'aprod', 'GMT Reload', 50, 1.45, Infinity, '+1.5 interceptors/s', undefined, 'pac3'),
  U('PERIMETER', 'mg', '12.7mm AA MG', 60, 1.5, Infinity, 'belt-fed gun on what it can see, short range · +1 emplacement'),
  U('PERIMETER', 'mantis', 'MANTIS 35mm C-RAM', 150, 1.35, Infinity, 'fast gun, short range · +1 emplacement', 2),
  U('PERIMETER', 'stinger', 'Stinger Team', 220, 1.35, Infinity, 'MANPADS, mid range homing · +1 emplacement', 3),
  U('PERIMETER', 'iris', 'IRIS-T SLM', 350, 1.4, Infinity, 'medium-range SAM, all round, takes on missiles first · +1 emplacement', 5, R),
  U('PERIMETER', 'jammer', 'EW Jammer', 300, 1.4, Infinity, 'slows contacts nearby, drains power · +1 emplacement', 4),
  U('PERIMETER', 'observer', 'Observer Post', 100, 1.4, Infinity, 'sees 28m round itself, for every gun · +1 emplacement', 2),
  U('PERIMETER', 'ammo', 'Ammo Point', 120, 1.4, Infinity, 'guns within 10m: +25% fire rate, belts reload twice as fast · +1 emplacement', 2),
];

// Perimeter emplacements (pads) sit on fixed slots and engage any contact that can be seen (by eye or radar)
// inside their range and field of fire, without using a lock slot. Support units don't shoot: they boost the
// units round them. Where a unit goes decides what it covers, what it risks and what it boosts.
export type PerimKind = 'mg' | 'mantis' | 'stinger' | 'iris' | 'jammer' | 'observer' | 'ammo';
export const PERIM_KINDS: PerimKind[] = ['mg', 'mantis', 'stinger', 'iris', 'jammer', 'observer', 'ammo'];
export const GUNS: PerimKind[] = ['mg', 'mantis', 'stinger', 'iris']; // units that shoot: fields of fire, crossfire
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
const PAD_CAP = [2, 5, 7, 11, 12, 13, 14, 15, 16];
export const perimSlots = (level: number) => PAD_CAP[Math.min(level, PAD_CAP.length) - 1];
// Terrain (terrain.ts `site`): where a unit stands gives it a character, as well as a belt.
// high: up against a rock outcrop, +20% range and eyes, but on the skyline: FPVs and Lancets dive on it from twice as
//   far, and a cruise missile rates it higher. treeline: at the edge of the woods, never dived on or found by a cruise
//   missile, but -15% range. road: MG belts reload as fast as with an ammo point in reach.
export const TERRAIN = { high: { range: 1.2, dive: 2, value: 100 }, treeline: { range: 0.85 } };
export const START_PAD = { x: 0, z: -17 }; // the starting MG: main line, on the front axis

// Field of fire: half-width around the unit's facing (away from the base). Math.PI = all round.
export const FANS: Record<PerimKind, number> = { mg: 60 * DEG, mantis: Math.PI, stinger: 90 * DEG, iris: Math.PI, jammer: Math.PI, observer: Math.PI, ammo: Math.PI };
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
  mg: { dmg: 1.5, rate: 6, range: 15, ammo: 0, power: 0 },
  mantis: { dmg: 1.2, rate: 10, range: 16, ammo: 0.15, power: 0 },
  stinger: { dmg: 7, rate: 0.8, range: 26, ammo: 1, power: 0 },
  iris: { dmg: 10, rate: 0.5, range: 30, ammo: 2, power: 0 }, // IRIS-T SLM: medium-range SAM, missiles first
  jammer: { dmg: 0, rate: 0, range: 18, ammo: 0, power: 1.2 }, // power/s while anything is in range
  observer: { dmg: 0, rate: 0, range: 0, ammo: 0, power: 0 },
  ammo: { dmg: 0, rate: 0, range: 0, ammo: 0, power: 0 },
};
// Upgrades in place: a unit gets better in its slot instead of taking another one (tall or wide).
export const MG_TIERS = [
  { name: '12.7mm AA MG', cost: 0, ...PERIM.mg },
  { name: 'TWIN 12.7mm', cost: 110, ...PERIM.mg, rate: 11 },
  { name: 'ZU-23-2', cost: 240, ...PERIM.mg, dmg: 3, rate: 8, range: 20 },
];
// Support units.
export const OBSERVER_EYES = 28; // m an observer post sees round itself
export const AMMO_R = 10, AMMO_RATE = 1.25, AMMO_RELOAD = 0.5; // ammo point: reach, fire rate x, belt reload x for guns in reach
export const FWD_RELOAD = 1.5; // belt reload x on the forward line without an ammo point
// Unit HP: FPVs and Lancets passing within DIVE_R of a unit on the forward line dive on it. At 0 HP it's down (no fire, no eyes, no
// support) until repaired to half; repairs run all the time and finish at once in the build window.
export const PAD_HP = 30, PAD_REPAIR = 0.5, DIVE_R = 3; // HP, HP/s, m
export const SELL_REFUND = 0.5, MOVE_TIME = 5; // in combat: share refunded, s offline while relocating (free in the build window)
export const JAM_SLOW = 0.55; // speed multiplier inside a jammer bubble (elites ignore it)

// Multipliers (`add*` fields are additive). Every perk trades something.
export interface PerkFx {
  dmg?: number; rate?: number; gen?: number; range?: number; sweep?: number; aprod?: number;
  credits?: number; hp?: number; persist?: number; drain?: number; trange?: number;
  addSlots?: number; addArmor?: number; addChain?: number;
  // rule changers
  addFusion?: number; addLpi?: number; addArc?: number; addScav?: number; addFrag?: number; markDmg?: number;
  addBlackout?: number; addCounterSead?: number; addKillChain?: number; addOverkill?: number; addLastStand?: number;
}
// Rule-perk numbers.
export const BLACKOUT = { dark: 2, lit: 0.7 }; // contact memory x while silent / while radiating
export const COUNTER_SEAD = 0.2; // share of power storage restored per ARM shot down
export const KILL_CHAIN = { every: 5, time: 8 }; // kills per extra lock slot, s it lasts
export const OVERKILL_R = 8; // m an overkill's excess damage can jump
export const LAST_STAND = { hp: 0.25, rate: 1.5, gen: 0.6 };
// `min`: base level before it's offered; `need`: upgrade that must be owned (radar and Patriot perks wait for them). Rule perks (`rule`) are one-offs
// that change how the game plays; from base level 5 every draft includes one while any are left.
export const PERKS: { id: string; name: string; desc: string; fx: PerkFx; rule?: boolean; min?: number; need?: string }[] = [
  { id: 'overcharge', name: 'OVERCHARGE', desc: '+50% damage · -30% power gen', fx: { dmg: 1.5, gen: 0.7 } },
  { id: 'highfreq', name: 'HIGH FREQUENCY', desc: '+40% sweep speed · -15% radar range', fx: { sweep: 1.4, range: 0.85 }, need: 'radar' },
  { id: 'logistics', name: 'AUTOMATED LOGISTICS', desc: '+100% ammo production · -15% credits', fx: { aprod: 2, credits: 0.85 }, need: 'pac3' },
  { id: 'glass', name: 'GLASS CANNON', desc: '+60% damage · -45% max HP', fx: { dmg: 1.6, hp: 0.55 } },
  { id: 'salvage', name: 'SALVAGE', desc: '+25% credits · -15% damage', fx: { credits: 1.25, dmg: 0.85 } },
  { id: 'trigger', name: 'HAIR TRIGGER', desc: '+35% fire rate · -20% ammo production', fx: { rate: 1.35, aprod: 0.8 } },
  { id: 'deepscan', name: 'DEEP SCAN', desc: '+30% radar range · -20% sweep speed', fx: { range: 1.3, sweep: 0.8 }, need: 'radar' },
  { id: 'fortress', name: 'FORTRESS', desc: '+50% max HP · +10% armor · -15% fire rate', fx: { hp: 1.5, addArmor: 0.1, rate: 0.85 } },
  { id: 'signal', name: 'SIGNAL BOOST', desc: 'x2 contact memory · +50% radar power drain', fx: { persist: 2, drain: 1.5 }, need: 'radar' },
  { id: 'multilock', name: 'MULTI-LOCK', desc: '+2 lock slots · -15% track range', fx: { addSlots: 2, trange: 0.85 }, need: 'radar' },
  { id: 'reactor', name: 'REACTOR', desc: '+60% power gen · -15% max HP', fx: { gen: 1.6, hp: 0.85 }, need: 'radar' },
  { id: 'chain', name: 'CHAIN REACTION', desc: 'kills explode for 6 dmg · -10% credits', fx: { addChain: 6, credits: 0.9 } },
  { id: 'fusion', name: 'TRACK FUSION', desc: 'locks hold while the radar is dark · -1 lock slot', fx: { addFusion: 1, addSlots: -1 }, rule: true, min: 5, need: 'radar' },
  { id: 'lpi', name: 'LPI WAVEFORM', desc: 'LPI mode keeps full detection chance and range · -15% radar range', fx: { addLpi: 1, range: 0.85 }, rule: true, min: 5, need: 'radar' },
  { id: 'overwatch', name: 'OVERWATCH', desc: 'your marked target takes x2 damage · -1 lock slot', fx: { markDmg: 2, addSlots: -1 }, rule: true, min: 5, need: 'radar' },
  { id: 'arc', name: 'ARC LASER', desc: 'laser jumps to 2 more targets at 60% · -10% damage', fx: { addArc: 2, dmg: 0.9 }, rule: true, min: 5, need: 'pulse' },
  { id: 'scav', name: 'SCAVENGER', desc: 'every kill refunds 2 interceptors · -10% max HP', fx: { addScav: 2, hp: 0.9 }, rule: true, min: 5, need: 'pac3' },
  { id: 'blackout', name: 'BLACKOUT PROTOCOL', desc: 'contacts coast x2 as long while the radar is dark · -30% contact memory while radiating', fx: { addBlackout: 1 }, rule: true, min: 3, need: 'radar' },
  { id: 'csead', name: 'COUNTER-SEAD', desc: 'every ARM shot down restores 20% power · -10% credits', fx: { addCounterSead: 1, credits: 0.9 }, rule: true, min: 3, need: 'radar' },
  { id: 'killchain', name: 'KILL CHAIN', desc: 'every 5 kills: +1 lock slot for 8s · -10% damage', fx: { addKillChain: 1, dmg: 0.9 }, rule: true, min: 3, need: 'radar' },
  { id: 'overkill', name: 'OVERKILL', desc: 'damage past a kill jumps to the nearest contact within 8m · -10% fire rate', fx: { addOverkill: 1, rate: 0.9 }, rule: true, min: 3 },
  { id: 'laststand', name: 'LAST STAND', desc: 'below 25% HP: +50% fire rate, -40% power gen', fx: { addLastStand: 1 }, rule: true, min: 3 },
  { id: 'frag', name: 'FRAG WARHEADS', desc: 'PAC-3 hits splash for 50% · -15% fire rate', fx: { addFrag: 0.5, rate: 0.85 }, rule: true, min: 5, need: 'pac3' },
];

// Doctrines: picked before a normal run (daily ops fly STANDARD). A starting loadout of free upgrade levels that
// don't count toward base level, and a trade that holds all run: `fx` works like a perk's, `price` scales every
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
  { name: 'COMMAND POST', desc: 'command post and the first 12.7mm AA gun' },
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

export function deriveStats(lv: Record<string, number>, perks: string[], level = 1, doctrine = 'standard') {
  const L = (id: string) => ranked(id, lv[id] ?? 0);
  const p = { dmg: 1, rate: 1, gen: 1, range: 1, sweep: 1, aprod: 1, credits: 1, hp: 1, persist: 1, drain: 1, trange: 1, addSlots: 0, addArmor: 0, addChain: 0,
    addFusion: 0, addLpi: 0, addArc: 0, addScav: 0, addFrag: 0, markDmg: 1,
    addBlackout: 0, addCounterSead: 0, addKillChain: 0, addOverkill: 0, addLastStand: 0 };
  // Perks, then the doctrine's run-long trade, folded the same way.
  for (const fx of [...perks.map(id => PERKS.find(x => x.id === id)!.fx), DOCTRINES.find(d => d.id === doctrine)?.fx ?? {}]) {
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
    repair: 0.6 * L('repair'),
    gen: (6 + 3 * L('gen') + (level >= 2 ? 2 : 0)) * p.gen,
    raidWarn: level >= 3 ? 5 : 0, // s of extra raid warning
    backupRadar: level >= 4,
    armStun: level >= 7 ? 0.5 : 1,
    powerCap: 60 + 40 * L('cap'),
    radarRange: (42 + 7 * L('range')) * p.range,
    sweep: 2.5 * (1 + 0.2 * L('sweep')) * (L('aesa') ? 1.25 : 1) * p.sweep, // rad/s; with AESA: revisits/rev-equivalent
    aesa: L('aesa') > 0,
    res: 1 + 0.15 * L('res'),
    persist: (4.5 + 1.5 * L('persist') + (level >= 3 ? 1 : 0)) * p.persist,
    drain: (1.5 + 0.25 * radarLv) * p.drain,
    slots: 2 + L('slots') + p.addSlots + (level >= 6 ? 1 : 0),
    trackRange: (45 + 6 * L('trange')) * p.trange,
    modes: 1 + L('modes'),
    ammoCap: 40 + 25 * L('acap'),
    ammoProd: (3 + 1.5 * L('aprod')) * p.aprod,
    ammoPower: 0.5, // power per round produced
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
