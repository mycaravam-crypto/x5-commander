// The battlefield: one fixed map, the same every run. Pure functions, no Three.js, so the sim can ask where
// units can be built and render.ts / hud.ts can paint the same ground.
// World (x, z) as everywhere else; the front (enemy side) is -z. The base sits on a low plateau at the origin,
// a river runs across no man's land in front of it, farmland and woods behind, hills beyond the arena.

export type Ground = 'grass' | 'field' | 'forest' | 'water' | 'rock' | 'road';

// ---- noise: hashed value noise, fixed seed ----
const hash = (i: number, j: number) => {
  let h = (i * 374761393 + j * 668265263) ^ 0x5bd1e995;
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

// ---- features ----
// River: meanders across the front, beyond the build zone. Enemies fly, so it's scenery and a line on the map.
export const riverZ = (x: number) => -47 + 5 * Math.sin(x * 0.055) + 2.5 * Math.sin(x * 0.13 + 1);
export const RIVER_W = 3.2; // half-width, m
// Ponds and rock outcrops inside the build zone: they block building, so layouts have to work round them.
export const PONDS = [{ x: -22, z: 21, r: 4.5 }, { x: 26, z: 27, r: 3.2 }];
export const ROCKS = [{ x: 17, z: -6, r: 2.2 }, { x: -27, z: -7, r: 2.4 }, { x: 7, z: 31, r: 2 }, { x: -7, z: -32, r: 1.8 }, { x: 32, z: -16, r: 2 }];
// Roads: a supply road from the rear, and a track out to the forward line. Scenery (they never block).
export const roadX = (z: number) => 2.2 * Math.sin(z * 0.07);
const onRoad = (x: number, z: number) =>
  (z > 5 && Math.abs(x - roadX(z)) < 1.3) || (z < -5 && z > riverZ(x) + RIVER_W && Math.abs(x + 3 - 1.5 * Math.sin(z * 0.1)) < 0.9);

const forestness = (x: number, z: number) => fbm(x * 0.045 + 40, z * 0.045 + 11);
export function ground(x: number, z: number): Ground {
  const r = Math.hypot(x, z);
  if (Math.abs(z - riverZ(x)) < RIVER_W) return 'water';
  for (const p of PONDS) if ((x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r) return 'water';
  for (const q of ROCKS) if ((x - q.x) ** 2 + (z - q.z) ** 2 < q.r * q.r) return 'rock';
  if (onRoad(x, z)) return 'road';
  // Woods: thinner inside the build zone, none on the base plateau or in the field of fire cleared toward the front.
  if (r > 14 && !(r < 42 && z < 0 && Math.abs(x) < 6 - z * 0.75) && forestness(x, z) > (r < 38 ? 0.66 : 0.6)) return 'forest';
  if (z > 12 && fbm(x * 0.03 + 7, z * 0.03 + 91) > 0.55) return 'field';
  return 'grass';
}
// What a building spot's ground is worth (see TERRAIN in config.ts). High ground: up against a rock outcrop, the
// only rise inside the build zone. Treeline: open ground at the edge of the woods, under cover. Road: on a road.
export type Site = '' | 'high' | 'treeline' | 'road';
export const HIGH_R = 2.5, TREELINE_R = 2.5; // m past a rock's edge that counts as high ground; m to the woods for cover
export function site(x: number, z: number): Site {
  const g = ground(x, z);
  if (g === 'road') return 'road';
  if (ROCKS.some(q => (x - q.x) ** 2 + (z - q.z) ** 2 < (q.r + HIGH_R) ** 2)) return 'high';
  for (let k = 0; k < 8; k++) if (ground(x + Math.cos(k * Math.PI / 4) * TREELINE_R, z + Math.sin(k * Math.PI / 4) * TREELINE_R) === 'forest') return 'treeline';
  return '';
}
// Tree density 0..1 for scenery (render places trees where it's > 0).
export const trees = (x: number, z: number) => ground(x, z) === 'forest' ? step(0.6, 0.72, forestness(x, z)) : 0;

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

// Trees, placed once: a jittered grid thinned by the forest density, plus a few loners on open grass.
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
