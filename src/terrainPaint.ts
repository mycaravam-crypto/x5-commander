// Paints terrain.ts onto a canvas: the 3D ground texture and the minimap both use it.
// Canvas (i, j) maps to world (x, z) = ((i / N) * 2 - 1) * R, ((j / N) * 2 - 1) * R.
import { ground, heightSampler, noise, riverZ, RIVER_W, WATER_Y, treeList, type Ground } from './terrain.ts';

const COL: Record<Ground, [number, number, number]> = {
  grass: [92, 118, 60], field: [150, 140, 84], forest: [52, 74, 38], water: [52, 92, 112], rock: [120, 116, 104], road: [132, 116, 88],
};

export function paintTerrain(N: number, R: number, shade = true) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!, img = g.createImageData(N, N), px = 2 * R / N;
  const hAt = heightSampler(R, 192); // for the hillshade, lit from the north-west
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) * px - R, z = (j + 0.5) * px - R, r = Math.hypot(x, z);
    const gr = ground(x, z), h = hAt(x, z);
    let [cr, cg, cb] = COL[gr];
    const n = noise(x * 0.9, z * 0.9) * 0.6 + noise(x * 0.23 + 9, z * 0.23) * 0.4; // grain and patches
    let k = 0.82 + 0.36 * n;
    if (gr === 'field') k *= 0.88 + 0.14 * Math.sin((x * 0.8 + z * 0.3) * 2.2); // furrows
    if (gr === 'forest') k *= 0.8 + 0.4 * noise(x * 2.2, z * 2.2); // canopy shadow
    if (gr === 'water' || h < WATER_Y) { // deeper toward the middle of the river
      [cr, cg, cb] = COL.water; k = 0.8 + 0.25 * Math.min(1, Math.abs(z - riverZ(x)) / RIVER_W);
    }
    if (r < 10.5 && gr !== 'road') { // the base compound: packed earth and gravel
      const t = Math.max(0, Math.min(1, (10.5 - r) / 2));
      cr += (122 - cr) * t; cg += (110 - cg) * t; cb += (84 - cb) * t;
    }
    if (shade) k *= Math.max(0.55, Math.min(1.3, 1 + ((h - hAt(x - px * 2, z - px * 2)) * 0.9) / (px * 2))); // hillshade
    const o = (j * N + i) * 4;
    img.data[o] = cr * k; img.data[o + 1] = cg * k; img.data[o + 2] = cb * k; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // Tree shadows baked into the ground, falling away from the sun (render.ts lights from -x, -z).
  if (shade) {
    const k = N / (2 * R);
    g.fillStyle = 'rgba(10, 20, 5, 0.35)';
    for (const t of treeList(R)) {
      g.beginPath(); g.ellipse((t.x + R + 1.1 * t.s) * k, (t.z + R + 0.8 * t.s) * k, 1.3 * t.s * k, 0.9 * t.s * k, 0.6, 0, 7); g.fill();
    }
  }
  return cv;
}
