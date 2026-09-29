// The battlefield: a map generated from the run's seed (the daily op's seed gives everyone the same map). Pure
// functions, no Three.js, so the sim can ask where units can be built and render.ts / hud.ts can paint the same ground.
// World (x, z) as everywhere else; the front (enemy side) is -z. The base sits on a low plateau at the origin,
// a river runs across no man's land in front of it, farmland and woods behind, hills beyond the arena.
// Every map keeps the same layout rules: the plateau and the field of fire toward the front stay clear, the
// river stays beyond the build zone, the starting MG's spot is open, and enough of the build zone is buildable.

export type Ground = 'grass' | 'field' | 'forest' | 'water' | 'rock' | 'road';
type Blob = { x: number; z: number; r: number };

// ---- noise: hashed value noise, salted per map ----
let SALT = 0;
const hash = (i: number, j: number) => {
  let h = (i * 374761393 + j * 668265263 + SALT) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
export function noise(x: number, z: number) {
  const i = Math.floor(x), j = Math.floor(z), u = smooth(x - i), v = smooth(z - j);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x: number, z: number) => (noise(x, z) * 4 + noise(x * 2.03 + 17, z * 2.03 + 5) * 2 + noise(x * 4.1 + 3, z * 4.1 + 29)) / 7;
const step = (a: number, b: number, t: number) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

// ---- the current map's parameters (see setMap) ----
const M = {
  river: { z: -47, a1: 5, f1: 0.055, p1: 0, a2: 2.5, f2: 0.13, p2: 1 },
  road: { a: 2.2, f: 0.07, p: 0, ta: 1.5, tp: 0 },
  forest: { inner: 0.66, outer: 0.6 }, // fbm cut-offs inside / outside 38 m: higher is fewer woods
  field: 0.55,
};
export let PONDS: Blob[] = [];
export let ROCKS: Blob[] = [];
export let FARMS: { x: number; z: number; ry: number; w: number }[] = []; // farmsteads, scenery out past the build zone
export let mapSeed = NaN;

// ---- features ----
// River: meanders across the front, beyond the build zone. Enemies fly, so it's scenery and a line on the map.
export const riverZ = (x: number) => { const r = M.river; return r.z + r.a1 * Math.sin(x * r.f1 + r.p1) + r.a2 * Math.sin(x * r.f2 + r.p2); };
export const RIVER_W = 3.2; // half-width, m
// Roads: a supply road from the rear, and a track out to the forward line. Scenery (they never block).
export const roadX = (z: number) => M.road.a * Math.sin(z * M.road.f + M.road.p);
const onRoad = (x: number, z: number) =>
  (z > 5 && Math.abs(x - roadX(z)) < 1.3) || (z < -5 && z > riverZ(x) + RIVER_W && Math.abs(x + 3 - M.road.ta * Math.sin(z * 0.1 + M.road.tp)) < 0.9);
// The field of fire cleared toward the front: no woods or features in it.
const cleared = (x: number, z: number) => Math.hypot(x, z) < 42 && z < 0 && Math.abs(x) < 6 - z * 0.75;

const forestness = (x: number, z: number) => fbm(x * 0.045 + 40, z * 0.045 + 11);
export function ground(x: number, z: number): Ground {
  const r = Math.hypot(x, z);
  if (Math.abs(z - riverZ(x)) < RIVER_W) return 'water';
  for (const p of PONDS) if ((x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r) return 'water';
  for (const q of ROCKS) if ((x - q.x) ** 2 + (z - q.z) ** 2 < q.r * q.r) return 'rock';
  if (onRoad(x, z)) return 'road';
  // Woods: thinner inside the build zone, none on the base plateau or in the field of fire.
  if (r > 14 && !cleared(x, z) && forestness(x, z) > (r < 38 ? M.forest.inner : M.forest.outer)) return 'forest';
  if (z > 12 && fbm(x * 0.03 + 7, z * 0.03 + 91) > M.field) return 'field';
  return 'grass';
}
// Tree density 0..1 for scenery (render places trees where it's > 0).
export const trees = (x: number, z: number) => ground(x, z) === 'forest' ? step(M.forest.outer, M.forest.outer + 0.12, forestness(x, z)) : 0;

// Height, for drawing only (the sim is flat): a level plateau round the base, rolling ground beyond the build
// zone, hills past the arena rim, the river cut into its bed.
export function height(x: number, z: number) {
  const r = Math.hypot(x, z);
  let h = (fbm(x * 0.08, z * 0.08) - 0.5) * 0.5 * step(8, 20, r);
  h += Math.max(-0.2, (fbm(x * 0.025 + 3, z * 0.025 + 8) - 0.35) * 12) * step(40, 80, r);
  h -= 1.4 * (1 - step(RIVER_W - 1, RIVER_W + 3, Math.abs(z - riverZ(x))));
  for (const p of PONDS) h -= 0.8 * (1 - step(p.r - 1, p.r + 1.5, Math.hypot(x - p.x, z - p.z)));
  for (const q of ROCKS) h += 1.2 * (1 - step(q.r * 0.3, q.r * 1.2, Math.hypot(x - q.x, z - q.z)));
  return h;
}
export const WATER_Y = -0.6;

// ---- generation ----
// mulberry32, local so the terrain stays independent of the sim's streams.
const rng = (seed: number) => () => {
  let t = (seed = (seed + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const START = { x: 0, z: -17 }; // config.START_PAD: the starting MG's spot must stay open
export const OPEN_MIN = 0.55; // share of the build zone (10.5 - 36 m) that must be buildable
// Share of the full build zone a unit could stand on (ignores other units).
export function openShare() {
  let n = 0, open = 0;
  for (let x = -36; x <= 36; x += 1.5) for (let z = -36; z <= 36; z += 1.5) {
    const r = Math.hypot(x, z);
    if (r < 10.5 || r > 36) continue;
    n++;
    const g = ground(x, z);
    if (g !== 'water' && g !== 'rock' && g !== 'forest') open++;
  }
  return open / n;
}

function roll(seed: number) {
  const R = rng(seed), u = (a: number, b: number) => a + R() * (b - a);
  SALT = Math.floor(R() * 2 ** 31);
  M.river = { z: u(-51, -47.5), a1: u(2.5, 5), f1: u(0.035, 0.07), p1: u(0, 7), a2: u(0.8, 2.5), f2: u(0.1, 0.16), p2: u(0, 7) };
  M.road = { a: u(1, 3), f: u(0.05, 0.09), p: u(0, 7), ta: u(0.8, 2), tp: u(0, 7) };
  M.forest = { inner: u(0.62, 0.7), outer: u(0.55, 0.63) };
  M.field = u(0.48, 0.6);
  // Ponds and rock outcrops in the build zone: they block building, so layouts have to work round them.
  const blobs: Blob[] = [];
  const place = (n: number, r0: number, r1: number) => {
    const out: Blob[] = [];
    for (let tries = 0; out.length < n && tries < 200; tries++) {
      const a = R() * Math.PI * 2, d = u(15, 34), r = u(r0, r1), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (cleared(x, z) && d < 30) continue; // keep the near field of fire open; far outcrops are fine
      if (Math.hypot(x - START.x, z - START.z) < r + 4) continue;
      if (Math.abs(x - roadX(z)) < r + 1.5 && z > 5) continue;
      if (blobs.some(b => Math.hypot(b.x - x, b.z - z) < b.r + r + 4)) continue;
      const b = { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, r: Math.round(r * 10) / 10 };
      blobs.push(b); out.push(b);
    }
    return out;
  };
  PONDS = place(1 + Math.floor(R() * 3), 2.5, 4.5);
  ROCKS = place(3 + Math.floor(R() * 4), 1.6, 2.5);
  // Farmsteads out on the open ground past the build zone, mostly in the rear.
  FARMS = [];
  for (let tries = 0; FARMS.length < 5 && tries < 200; tries++) {
    const a = u(-0.3, Math.PI + 0.3), d = u(40, 68), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (ground(x, z) !== 'grass' && ground(x, z) !== 'field') continue;
    if (FARMS.some(f => Math.hypot(f.x - x, f.z - z) < 8)) continue;
    FARMS.push({ x, z, ry: u(0, Math.PI), w: u(3, 5) });
  }
}

// Build the map for `seed`. Rerolls (deterministically) until the layout rules hold. Cheap: a few ms.
export function setMap(seed: number) {
  if (seed === mapSeed) return;
  let k = 0;
  do roll((seed ^ Math.imul(k++, 0x9E3779B1)) >>> 0);
  while (k < 20 && (ground(START.x, START.z) !== 'grass' || openShare() < OPEN_MIN));
  mapSeed = seed;
}
setMap(0);

// Height on a grid, sampled bilinearly: cheap enough for every contact and label every frame.
export function heightSampler(R: number, G: number) {
  const hs = new Float32Array((G + 1) * (G + 1)), cell = 2 * R / G;
  for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) hs[j * (G + 1) + i] = height(i * cell - R, j * cell - R);
  return (x: number, z: number) => {
    const u = Math.min(G - 1e-6, Math.max(0, (x + R) / cell)), v = Math.min(G - 1e-6, Math.max(0, (z + R) / cell));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * (G + 1) + i;
    return (hs[k] * (1 - fu) + hs[k + 1] * fu) * (1 - fv) + (hs[k + G + 1] * (1 - fu) + hs[k + G + 2] * fu) * fv;
  };
}

// Trees, placed once per map: a jittered grid thinned by the forest density, plus a few loners on open grass.
export function treeList(R: number) {
  const out: { x: number; z: number; s: number; pine: boolean }[] = [];
  for (let i = -R; i < R; i += 2.1) for (let j = -R; j < R; j += 2.1) {
    const h1 = hash(Math.round(i * 10), Math.round(j * 10)), h2 = hash(Math.round(j * 10) + 7, Math.round(i * 10) - 3);
    const x = i + (h1 - 0.5) * 1.8, z = j + (h2 - 0.5) * 1.8, d = trees(x, z);
    const lone = ground(x, z) === 'grass' && Math.hypot(x, z) > 40 && h1 * h2 > 0.93;
    if ((d > 0 && h1 < 0.3 + 0.6 * d) || lone) out.push({ x, z, s: 0.8 + 0.6 * h2, pine: h1 < 0.55 });
  }
  return out;
}
