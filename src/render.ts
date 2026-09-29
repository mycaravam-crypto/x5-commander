import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARENA_R, BASE_R, BUILD_MIN, DROP_MAX, ENEMIES, MUNITIONS, EW_ARC, FRONT, FRONT_ARC, VISUAL_R, KINDS, PAL, FANS, GUNS, MG_TIERS, PERIM, PAD_HP, altitude, buildR, type EnemyKind, type PerimKind } from './config.ts';
import { emitting, focusBearing, flankArc, radarRange, radarSector, bestSpot, spotNear, selectedPad, coverage, padStats, phase, shownKind, visible, type Shot, type State } from './sim.ts';
import { heightSampler, treeList, ROCKS, FARMS, WATER_Y, mapSeed } from './terrain.ts';
import { paintTerrain } from './terrainPaint.ts';
import { enemyGeos, ROTORS } from './models.ts';

const MAX_ENEMIES = 2000, MAX_LOCKS = 64, MAX_SHOTS = 600, MAX_SHARDS = 2500, MAX_WAVES = 64, MAX_BEAMS = 3000, MAX_FRONTS = 48, MAX_BLIPS = 1024, MAX_PUFFS = 600;
const VIS = 1.6; // enemies drawn bigger than their hitbox so they read at a glance
const PAD_VIS = 1.35; // emplacements too
const TAU = Math.PI * 2;
const WORLD_R = 120; // ground drawn out to here; fog hides the edge
const { mid: MID, bright: BRIGHT, hot: HOT, alert: ALERT } = PAL;
// Scene colours: the palette is for the HUD and overlays; the world has its own.
const C = {
  olive: 0x56633a, oliveL: 0x6f7c49, dark: 0x25271f, metal: 0xb9beb0, sand: 0xa89668, concrete: 0x8d8a80, wreck: 0x3a3833,
  fire: 0xffa640, flash: 0xfff1c0, smoke: 0x55534d, threat: 0xff5a44, friend: 0x4dff9a, sky: 0x9fb2ae, night: 0x06140c,
};
// Rebuilt with the map (see buildTerrain in createRenderer).
let hGrid = heightSampler(WORLD_R, 240);
export const groundY = (x: number, z: number) => hGrid(x, z);

const additive = (color = 0xffffff, wireframe = false) =>
  new THREE.MeshBasicMaterial({ color, wireframe, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.frustumCulled = false; m.count = 0;
  m.setColorAt(0, new THREE.Color()); // allocate instanceColor
  return m;
};
// Normal-blended, with a per-instance opacity (attribute `fade`): smoke that thins out as it spreads.
function fadeMat(opacity = 1) {
  const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity });
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float fade;\nvarying float vFade;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = fade;');
    sh.fragmentShader = 'varying float vFade;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
  };
  return m;
}
const faded = (geo: THREE.BufferGeometry, n: number, opacity = 1) => {
  geo.setAttribute('fade', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
  return instanced(geo, fadeMat(opacity), n);
};
const fadeAttr = (m: THREE.InstancedMesh) => m.geometry.getAttribute('fade') as THREE.InstancedBufferAttribute;
// Drawn with `wireframe: true`, this geometry shows exactly the given segments (xyz pairs): each segment
// becomes a degenerate triangle (a, b, b). That's how InstancedMesh gets to draw instanced lines.
const segs = (p: ArrayLike<number>) => {
  const o: number[] = [];
  for (let i = 0; i < p.length; i += 6) for (const j of [0, 1, 2, 3, 4, 5, 3, 4, 5]) o.push(p[i + j]);
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(o, 3));
};
const ringPts = (n: number, every = 1) => Array.from({ length: n }, (_, i) => i % every ? [] : [
  Math.cos(i / n * TAU), 0, Math.sin(i / n * TAU), Math.cos((i + 1) / n * TAU), 0, Math.sin((i + 1) / n * TAU)]).flat();
// A line on the ground, following the terrain: `pts` are (x, z) pairs.
const drape = (pts: number[], lift = 0.12) => {
  const o: number[] = [];
  for (let i = 0; i < pts.length; i += 2) o.push(pts[i], groundY(pts[i], pts[i + 1]) + lift, pts[i + 1]);
  return o;
};
const arcPts = (r: number, a0: number, a1: number, n: number, cx = 0, cz = 0) =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; }).flat();

// ---- enemy models (models.ts): +x is the nose; flat-shaded so the lit airframes read from above ----
const GEOS = enemyGeos();
for (const g of Object.values(GEOS)) g.computeVertexNormals();
const KIND_COL: Record<EnemyKind, number> = {
  scout: 0x6d7064, drone: 0x5f625b, decoy: 0x5f625b, swarm: 0x2e2f2c, tank: 0x4d5a3c, ew: 0x5a6446, elite: 0x7b8792, arm: 0xe2dfd4, tbm: 0xd6d6cb, cruise: 0xbabdb5, atgm: 0xd8d4c4, kab: 0x55584e,
};

const GRADE = {
  // The tactical look over the lit terrain: colour pulled part way toward a green monochrome, like a targeting
  // display. nvg: 0..1, NIGHT RAID turns it into a night-vision scope. blind: 0 = radar up, ~0.3 = EMCON,
  // 1 = radar knocked out (drained colour, a little snow).
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, blind: { value: 0 }, nvg: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, blind, nvg; varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float l = dot(col, vec3(0.3, 0.6, 0.1));
      col = mix(col, l * vec3(0.8, 1.05, 0.85), 0.35);
      col = mix(col, min(vec3(1.0), l * 2.6) * vec3(0.35, 1.0, 0.5), nvg * 0.85);
      float n = fract(sin(dot(floor(vUv * 700.0) + fract(time) * 37.0, vec2(12.9898, 78.233))) * 43758.5453);
      col = mix(col, vec3(l) * vec3(1.0, 0.85, 0.8), blind * 0.6);
      col += (n - 0.5) * (0.12 * blind + 0.08 * nvg);
      col *= 1.0 - 0.7 * dot(c, c);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// Phones and tablets get a lighter pipeline: no real-time shadows (the ground has them baked in), no bloom,
// a smaller ground texture and mesh, and a capped pixel ratio. The full one is several times the GPU memory
// and fill rate, and was enough to lose the WebGL context on phones.
const LITE = matchMedia('(pointer: coarse)').matches || innerWidth * innerHeight < 800 * 600;

export function createRenderer() {
  const coarse = LITE;
  // No antialias on the canvas itself: the scene is drawn into the composer's target, so MSAA goes there.
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
  renderer.shadowMap.enabled = !coarse;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const sky = new THREE.Color(C.sky);
  scene.background = sky;
  scene.fog = new THREE.Fog(C.sky, 120, 230);
  const camera = new THREE.PerspectiveCamera(38, 1, 1, 800);
  const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: coarse ? 0 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  if (!coarse) composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.35, 0.92));
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GRADE);
  composer.addPass(grade);
  // Camera: orbits a target point on the ground. yaw turns it, dist zooms, the target pans (RTS style).
  let yaw = Math.PI / 2, dist = 128, tx = 0, tz = -10;
  const PITCH = 0.98;
  // Screen px covered by HUD at the top / bottom (phone portrait): the view centres in the band between them.
  let inTop = 0, inBot = 0, shift = 0;
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();

  // ---- light: a low morning sun from the north-west, sky fill; dimmed to moonlight for NIGHT RAID ----
  const hemi = new THREE.HemisphereLight(0xdfeaff, 0x4d4a33, 1.1);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(-55, 90, -40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 10, far: 260 });
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.4;
  scene.add(hemi, sun, sun.target);
  let night = 0;

  // ---- terrain: one draped mesh, painted once per map; water, trees, rocks and a few farms ----
  // Everything that follows the ground lives in `terrainG` and is rebuilt when a new run brings a new map.
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_R * 2, WORLD_R * 2).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3f6f88, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.82 }));
  water.position.y = WATER_Y; water.receiveShadow = true; scene.add(water);
  let groundFlash = 0;
  let terrainG = new THREE.Group(), terrainKey = NaN;
  const SEG = coarse ? 128 : 240;
  const groundMat = new THREE.MeshLambertMaterial();
  const dispose = (o: THREE.Object3D) => o.traverse(c => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    for (const x of ([] as THREE.Material[]).concat(m.material ?? [])) if (x !== groundMat) x.dispose();
  });
  function buildTerrain() {
    terrainKey = mapSeed;
    scene.remove(terrainG); dispose(terrainG); terrainG = new THREE.Group(); scene.add(terrainG);
    hGrid = heightSampler(WORLD_R, 240);
    groundMat.map?.dispose();
    const tex = new THREE.CanvasTexture(paintTerrain(coarse ? 768 : 1536, WORLD_R));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(coarse ? 4 : 16, renderer.capabilities.getMaxAnisotropy());
    groundMat.map = tex; groundMat.needsUpdate = true;
    const groundGeo = new THREE.PlaneGeometry(WORLD_R * 2, WORLD_R * 2, SEG, SEG).rotateX(-Math.PI / 2);
    { const p = groundGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i))); groundGeo.computeVertexNormals(); }
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.receiveShadow = true; terrainG.add(groundMesh);
    {
      const list = treeList(WORLD_R), n = list.length;
      const trunk = instanced(new THREE.CylinderGeometry(0.12, 0.16, 1, 5).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x4a3a28 }), n);
      const pine = instanced(mergeGeometries([new THREE.ConeGeometry(0.95, 1.8, 7).translate(0, 1.6, 0), new THREE.ConeGeometry(0.7, 1.4, 7).translate(0, 2.4, 0)])!, new THREE.MeshLambertMaterial(), n);
      const leaf = instanced(new THREE.IcosahedronGeometry(1, 0).scale(1, 0.9, 1).translate(0, 1.9, 0), new THREE.MeshLambertMaterial(), n);
      const d = new THREE.Object3D(), c = new THREE.Color();
      for (const t of list) {
        d.position.set(t.x, groundY(t.x, t.z) - 0.05, t.z); d.rotation.set(0, t.x * 7.1 + t.z, 0); d.scale.set(t.s, t.s * (t.pine ? 1.25 : 1), t.s);
        d.updateMatrix();
        trunk.setMatrixAt(trunk.count++, d.matrix);
        const m = t.pine ? pine : leaf;
        m.setMatrixAt(m.count, d.matrix);
        m.setColorAt(m.count++, c.setHex(t.pine ? 0x2f4a26 : 0x4b6a2c).multiplyScalar(0.8 + 0.4 * ((t.s * 13.7) % 1)));
      }
      for (const m of [trunk, pine, leaf]) { m.castShadow = !coarse; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; terrainG.add(m); }
      // Rock outcrops: a cluster of boulders each.
      const rocks = instanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8a867a, roughness: 0.95 }), ROCKS.length * 6);
      ROCKS.forEach((q, i) => {
        for (let k = 0; k < 6; k++) {
          const a = k * 2.4 + i, r = k ? q.r * 0.55 : 0, x = q.x + Math.cos(a) * r, z = q.z + Math.sin(a) * r, s = q.r * (k ? 0.35 : 0.6);
          d.position.set(x, groundY(x, z) + s * 0.2, z); d.rotation.set(a, a * 2, 0); d.scale.set(s, s * 0.8, s); d.updateMatrix();
          rocks.setMatrixAt(rocks.count, d.matrix); rocks.setColorAt(rocks.count++, c.setScalar(0.85 + 0.1 * (k % 3)));
        }
      });
      rocks.castShadow = rocks.receiveShadow = true; terrainG.add(rocks);
      // Farmsteads in the rear: whitewashed walls, red tile roofs.
      const walls = new THREE.MeshStandardMaterial({ color: 0xd8d0bc, roughness: 0.9 }), roof = new THREE.MeshStandardMaterial({ color: 0x8e4a34, roughness: 0.8 });
      for (const { x, z, ry, w } of FARMS) {
        const h = new THREE.Group(); h.position.set(x, groundY(x, z), z); h.rotation.y = ry;
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, w * 0.6).translate(0, 1.1, 0), walls);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.01, w * 0.45, 1.3, 4, 1).rotateY(Math.PI / 4).scale(w / (w * 0.64), 1, 0.6 / 0.64).translate(0, 2.85, 0), roof);
        for (const m of [body, top]) { m.castShadow = m.receiveShadow = true; h.add(m); }
        terrainG.add(h);
      }
    }
    drapeOverlays();
    // Whatever was draped over the old ground is redrawn on the new.
    zoneKey = flankKey = -1; ringR.clear(); baseKey = covKey = ghostKey = hintKey = '';
  }
  // ---- map overlays on the ground: build zone, the front, eyesight / radar range ----
  const lineMat = (color: number, opacity: number, dashed = false) => dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 1.2, gapSize: 0.8, depthWrite: false })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const groundLine = (pts: number[], mat: THREE.LineBasicMaterial | THREE.LineDashedMaterial, loop = false) => {
    const l = new (loop ? THREE.LineLoop : THREE.Line)(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(drape(pts), 3)), mat);
    if (mat instanceof THREE.LineDashedMaterial) l.computeLineDistances();
    l.renderOrder = 2; return l;
  };
  let flankLine: THREE.Line | null = null, flankKey = -1;
  let zoneLine: THREE.Line | null = null, zoneKey = -1;
  const zoneMat = lineMat(0xffffff, 0.35, true);
  let innerLine = new THREE.Line(); // the build zone's inner edge, shown while building
  // The lines draped over this map's ground (in terrainG, so they go with it).
  function drapeOverlays() {
    // The front: a red dashed arc at the rim over FRONT ± FRONT_ARC, and a dimmer one over the arc flank threats can use.
    terrainG.add(groundLine(arcPts(ARENA_R, FRONT - FRONT_ARC, FRONT + FRONT_ARC, 40), lineMat(C.threat, 0.8, true)));
    for (const a of [FRONT - FRONT_ARC, FRONT + FRONT_ARC]) terrainG.add(groundLine([Math.cos(a) * 40, Math.sin(a) * 40, Math.cos(a) * ARENA_R, Math.sin(a) * ARENA_R], lineMat(C.threat, 0.4, true)));
    terrainG.add(innerLine = groundLine(arcPts(BUILD_MIN, 0, TAU, 64), lineMat(0xffffff, 0.3, true), true));
    // Tactical grid: range rings every 10 m and bearing spokes every 30°, faint phosphor green laid over the ground.
    const pts: number[] = [], seg = (x0: number, z0: number, x1: number, z1: number) => pts.push(x0, z0, x1, z1);
    for (let r = 20; r <= ARENA_R; r += 10) for (let i = 0; i < 96; i++) {
      const a0 = i / 96 * TAU, a1 = (i + 1) / 96 * TAU;
      seg(Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r);
    }
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      for (let r = 12; r < ARENA_R; r += 4) seg(Math.cos(a) * r, Math.sin(a) * r, Math.cos(a) * (r + 4), Math.sin(a) * (r + 4));
    }
    const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(drape(pts, 0.1), 3)), lineMat(PAL.bright, 0.16));
    (grid.material as THREE.LineBasicMaterial).toneMapped = false;
    grid.renderOrder = 1; terrainG.add(grid);
  }
  // Eyesight (no radar) or radar range, and the tracking range, as rings that follow the ground.
  const ringGeo = () => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(129 * 3), 3));
  const rangeRing = new THREE.Line(ringGeo(), lineMat(C.friend, 0.55)), trackRing = new THREE.Line(ringGeo(), lineMat(C.friend, 0.22));
  const ringR = new Map<THREE.Line, number>();
  const setRing = (l: THREE.Line, r: number) => {
    if (Math.abs((ringR.get(l) ?? -1) - r) < 0.05) return;
    ringR.set(l, r);
    const p = l.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i <= 128; i++) { const a = i / 128 * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r; p.setXYZ(i, x, groundY(x, z) + 0.15, z); }
    p.needsUpdate = true; l.geometry.computeBoundingSphere();
  };
  rangeRing.renderOrder = trackRing.renderOrder = 2; scene.add(rangeRing, trackRing);

  // ---- radar: a faint sweep over the ground while it radiates ----
  const TAIL = TAU * 0.3, TSEG = 48;
  const tailGeo = new THREE.RingGeometry(0.02, 1, TSEG, 1, 0, TAIL);
  const tp = tailGeo.attributes.position, tc = new Float32Array(tp.count * 3), bc = new THREE.Color(C.friend);
  for (let i = 0; i < tp.count; i++) { const b = (1 - (i % (TSEG + 1)) / TSEG) ** 3 * 0.05; tc.set([bc.r * b, bc.g * b, bc.b * b], i * 3); }
  tailGeo.setAttribute('color', new THREE.BufferAttribute(tc, 3)).rotateX(-Math.PI / 2);
  const sweep = new THREE.Group();
  sweep.add(new THREE.Mesh(tailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
  sweep.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), new THREE.LineBasicMaterial({ color: C.friend, transparent: true, opacity: 0.5 })));
  sweep.position.y = 0.35; sweep.renderOrder = 3; scene.add(sweep);
  let lastSweep = 0;
  // AESA: no sweep. Faint beam dwells flash at random bearings, and a contact leaves a blip each time it's re-detected.
  const DWELLS = 24, dwellMesh = instanced(new THREE.RingGeometry(0.06, 1, 6, 1, -0.1, 0.2).rotateX(-Math.PI / 2), additive(), DWELLS);
  (dwellMesh.material as THREE.Material).depthTest = false;
  const dw = { a: new Float32Array(DWELLS), life: new Float32Array(DWELLS), next: 0 };
  scene.add(dwellMesh);
  let dwellAcc = 0;
  // FOCUSED: a faint wedge over the searched arc.
  let focusW = 0;
  const focusMesh = new THREE.Mesh(new THREE.BufferGeometry(), additive(C.friend));
  (focusMesh.material as THREE.Material).depthTest = false;
  focusMesh.position.y = 0.3; scene.add(focusMesh);
  const lastSeen = new WeakMap<object, number>();

  // ---- base: a Patriot battery, rebuilt when its shape key changes ----
  // Vehicles are built with +x as the business end (launch canisters, radar face). Parts listed in
  // `aimers` traverse toward their effector's target (keyed: 'pac' = the battery's, 'hel', 'hpm', 'pad<id>'),
  // `sweepers` turn with the radar sweep; the number is the parent's yaw.
  let base = new THREE.Group(), baseKey = '';
  const aimers: [THREE.Object3D, number, string][] = [], sweepers: [THREE.Object3D, number][] = [];
  // Where each effector's rounds leave from: launcher muzzles (x, y, z), and the HEL / HPM apertures.
  let pacPts: number[][] = [], irisPts: number[][] = [], helPt = [0, 1.6, 0], hpmPt = [0, 1.6, 0];
  const mats = new Map<number, THREE.MeshStandardMaterial>();
  const mat = (c: number) => { let m = mats.get(c); if (!m) mats.set(c, m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.15 })); return m; };
  // The old wireframe roles, as paint: structure, key parts, glass / apertures.
  const ROLE: Record<number, number> = { [MID]: C.olive, [BRIGHT]: C.oliveL, [HOT]: C.metal };
  const solid = (geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, parent: THREE.Object3D = base) => {
    const m = new THREE.Mesh(geo, mat(ROLE[color] ?? color));
    m.castShadow = m.receiveShadow = true;
    m.position.set(x, y, z); parent.add(m);
    return m;
  };
  const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
  const group = (parent: THREE.Object3D, x = 0, y = 0, z = 0, ry = 0) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g;
  };
  // Wheeled chassis at polar slot (r, a). `cab` adds a HEMTT-style cab at the -x end; trailers (radar, M903) go without.
  const vehicle = (r: number, a: number, len: number, ry: number, cab = true) => {
    const g = group(base, Math.cos(a) * r, 0, Math.sin(a) * r, ry);
    solid(box(len, 0.3, 1.3), MID, 0, 0.6, 0, g);
    if (cab) { solid(box(0.9, 0.9, 1.3), MID, -len / 2 - 0.45, 0.8, 0, g); solid(box(0.05, 0.4, 1.1), 0x1c2a33, -len / 2 - 0.92, 0.95, 0, g); }
    const axles = Math.max(2, Math.round(len / 1.1));
    for (let i = 0; i < axles; i++) for (const side of [-0.6, 0.6])
      solid(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10).rotateX(Math.PI / 2), C.dark, -len / 2 + 0.4 + i * (len - 0.8) / (axles - 1), 0.3, side, g);
    return g;
  };
  const tangent = (a: number) => -(a + Math.PI / 2), radial = (a: number) => -a;
  // Box of launch canisters raised to `elev`, muzzles toward +x. Hinged at its rear end, just above the bed.
  const canisters = (parent: THREE.Object3D, rows: number, cols: number, len: number, d: number, elev: number, x = 0) => {
    const pack = group(parent, x - len / 2, 0.8, 0); pack.rotation.z = elev;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++)
      solid(box(len, d, d).translate(len / 2, 0, 0), C.sand, 0, d * (i + 0.5), (j - (cols - 1) / 2) * d * 1.05, pack);
    return pack;
  };
  const slot = (i: number, n: number, off = 0) => i / n * TAU + off;
  // The compound: an earth berm round it, open to the supply road at the rear, and a few tents.
  const compound = new THREE.Group();
  for (let i = 0; i < 28; i++) {
    const a = (i + 0.5) / 28 * TAU;
    if (Math.abs(((a - Math.PI / 2) % TAU + TAU) % TAU - Math.PI) > Math.PI - 0.25) continue; // the gate
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 0.7, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 2.6 / 1.27), mat(0x8a7a55));
    m.position.set(Math.cos(a) * 10.4, 0.3, Math.sin(a) * 10.4); m.rotation.y = -a; m.castShadow = m.receiveShadow = true;
    compound.add(m);
  }
  for (const [x, z, ry] of [[-4.5, 8.2, 0.2], [4.8, 7.8, -0.3]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.4, 1.4, 4, 1).rotateY(Math.PI / 4).scale(1.4, 1, 1).translate(0, 0.7, 0), mat(0x5d6340));
    t.position.set(x, 0, z); t.rotation.y = ry; t.castShadow = t.receiveShadow = true; compound.add(t);
  }
  scene.add(compound);

  function buildBase(s: State) {
    scene.remove(base);
    base = new THREE.Group(); aimers.length = sweepers.length = 0; pacPts = []; irisPts = [];
    const L = s.level, W = s.st.weapons, R1 = 3.6, R2 = 6.4, R3 = 9;

    // Before the radar is bought: a dug-in command post with a field mast, center.
    if (!s.st.radar) {
      solid(box(2.2, 0.9, 1.8), C.sand, 0, 0.45, 0, base);
      solid(box(1.2, 0.5, 1), MID, 0.2, 1.15, 0, base);
      solid(new THREE.CylinderGeometry(0.04, 0.06, 2.6, 5), C.dark, -0.7, 2.2, 0.5, base);
    }
    // AN/MPQ-65 phased-array radar on its trailer, center. With the AESA upgrade it becomes LTAMDS: extra rear arrays for 360° cover.
    const radar = group(base); aimers.push([radar, 0, 'pac']); radar.visible = s.st.radar;
    solid(box(2.4, 0.3, 1.4), MID, -0.3, 0.6, 0, radar);
    for (const x of [-1.1, -0.4]) for (const z of [-0.6, 0.6]) solid(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10).rotateX(Math.PI / 2), C.dark, x, 0.3, z, radar);
    solid(box(1.4, 0.9, 1.3), MID, -0.6, 1.2, 0, radar); // electronics shelter
    const face = group(radar, 0.7, 1.9, 0); face.rotation.z = 0.35; // leans back, looks up-range
    solid(box(0.25, 2.4, 2.2), BRIGHT, 0, 0, 0, face);
    solid(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 24).rotateZ(Math.PI / 2), C.metal, 0.14, 0, 0, face);
    for (const z of [-0.85, 0.85]) solid(box(0.1, 0.3, 0.3), HOT, 0.14, -0.95, z, face); // sidelobe cancellers
    if (s.st.aesa) for (const side of [-1, 1]) {
      const rear = group(radar, -1.1, 1.8, side * 0.45, side * (Math.PI - 1.05)); rear.rotation.z = 0.3;
      solid(box(0.2, 1.4, 1.2).translate(0.1, 0, 0), BRIGHT, 0, 0, 0, rear);
    }

    // Inner ring: support vehicles, then the add-on effectors.
    if (s.st.radar) { // Engagement Control Station: comes with the radar
      const ecsA = slot(0, 6, 0.3), ecs = vehicle(R1, ecsA, 2.2, tangent(ecsA));
      solid(box(1.8, 1.1, 1.2), BRIGHT, 0.1, 1.3, 0, ecs);
      for (const z of [-0.4, 0.4]) solid(box(0.04, 1.6, 0.04), C.dark, -0.6, 2.6, z, ecs);
    }
    if (L >= 2) { // EPP-III electric power plant: twin generator sets
      const a = slot(1, 6, 0.3), g = vehicle(R1, a, 2.4, tangent(a));
      for (const x of [-0.55, 0.55]) solid(box(0.95, 0.8, 1.1), BRIGHT, x, 1.15, 0, g);
    }
    if (L >= 3) { // OE-349 antenna mast group: comms relay to the other batteries
      const a = slot(2, 6, 0.3), g = vehicle(R1, a, 2, tangent(a));
      solid(box(1.2, 0.6, 1), MID, 0.2, 1, 0, g);
      solid(new THREE.CylinderGeometry(0.05, 0.08, 3.4, 5), C.metal, 0.4, 3, 0, g);
      for (const z of [-0.35, 0.35]) solid(new THREE.ConeGeometry(0.35, 0.25, 8, 1, true).rotateZ(Math.PI / 2), HOT, 0.4, 4.6, z, g);
    }
    if (L >= 4 && s.st.radar) { // Hensoldt TRML-4D: rotating 360° surveillance radar, turns with the sweep
      const a = slot(3, 6, 0.3), ry = tangent(a), g = vehicle(R1, a, 2.4, ry);
      solid(box(1.2, 0.7, 1.1), MID, -0.3, 1.1, 0, g);
      solid(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 5), C.metal, 0.6, 1.4, 0, g);
      const head = group(g, 0.6, 2.3, 0); sweepers.push([head, ry]);
      const tilt = group(head); tilt.rotation.z = 0.25;
      solid(box(0.2, 0.9, 1.9), HOT, 0, 0, 0, tilt);
    }
    if (W.pulse) { // HEL 50 kW laser weapon: beam director on a traversing mount
      const a = slot(4, 6, 0.3), ry = tangent(a), g = vehicle(R1, a, 2.2, ry);
      solid(box(1.3, 0.7, 1.1), MID, -0.2, 1.1, 0, g);
      const t = group(g, 0.5, 1.5, 0); aimers.push([t, ry, 'hel']);
      helPt = [Math.cos(a) * R1, 2.15, Math.sin(a) * R1];
      solid(new THREE.CylinderGeometry(0.35, 0.4, 0.4, 10), BRIGHT, 0, 0.2, 0, t);
      solid(new THREE.CylinderGeometry(0.28, 0.28, 0.7, 10).rotateZ(Math.PI / 2), HOT, 0.2, 0.65, 0, t);
    }
    if (W.rail) { // Epirus Leonidas HPM: flat microwave array in a container
      const a = slot(5, 6, 0.3), ry = tangent(a), g = vehicle(R1, a, 2.4, ry);
      solid(box(2, 0.9, 1.2), MID, 0, 1.2, 0, g);
      const t = group(g, 0.2, 1.7, 0); aimers.push([t, ry, 'hpm']);
      hpmPt = [Math.cos(a) * R1, 2.4, Math.sin(a) * R1];
      const panel = group(t, 0, 0.7, 0); panel.rotation.z = 0.3;
      solid(box(0.2, 1.3, 1.3), HOT, 0, 0, 0, panel);
      for (let i = 1; i < 4; i++) solid(box(0.02, 1.3, 0.02), C.dark, 0.11, 0, -0.65 + i * 0.325, panel);
    }

    // Level 6: a second fire control shelter (ICC) with whip antennas, out between the IRIS-T slots.
    if (L >= 6 && s.st.radar) {
      const a = TAU / 8, g = vehicle(R3, a, 2.2, tangent(a));
      solid(box(1.7, 1.1, 1.2), BRIGHT, 0.1, 1.3, 0, g);
      for (const x of [-0.5, 0.6]) solid(box(0.04, 1.8, 0.04), C.dark, x, 2.7, 0.45, g);
    }
    // Level 7: hardened command node, a sloped concrete bunker with a blast door and a mast.
    if (L >= 7) {
      const a = TAU * 5 / 8, g = group(base, Math.cos(a) * R3, 0, Math.sin(a) * R3, radial(a));
      solid(new THREE.CylinderGeometry(1.2, 1.9, 1.2, 4, 1).rotateY(Math.PI / 4), C.concrete, 0, 0.6, 0, g);
      solid(box(0.15, 0.7, 0.8), C.dark, 1.25, 0.35, 0, g);
      solid(new THREE.CylinderGeometry(0.04, 0.06, 2.2, 5), C.dark, -0.4, 2.2, 0, g);
    }

    // Outer ring: M903 launching stations, one more per base level (a real battery fields up to 8).
    // Four PAC-3 MSE canisters each, raised to 38° and traversing toward the target.
    for (let i = 0; i < (W.cannon ? Math.min(8, L + 1) : 0); i++) {
      const a = slot(i, 8, TAU / 16), ry = radial(a), g = vehicle(R2, a, 2.8, ry, false);
      aimers.push([canisters(g, 2, 2, 2.6, 0.5, 0.66, 0.1), ry, 'pac']);
      pacPts.push([Math.cos(a) * R2, 2.4, Math.sin(a) * R2]);
      if (L >= 5) solid(box(0.5, 0.8, 3).rotateY(ry), 0x8a7a55, Math.cos(a) * (R2 + 2.4), 0.35, Math.sin(a) * (R2 + 2.4)); // earth berm
    }
    // IRIS-T SLX launchers: 8 canisters, steep launch, one per upgrade level (max 4).
    for (let i = 0; i < Math.min(4, s.lv.missile ?? 0); i++) {
      const a = slot(i, 4), ry = radial(a), g = vehicle(R3, a, 2.6, ry);
      aimers.push([canisters(g, 2, 4, 2.2, 0.32, 1.05, 0.2), ry, 'pac']);
      irisPts.push([Math.cos(a) * R3, 2.7, Math.sin(a) * R3]);
    }
    // Emplacements: 12.7mm MG in a sandbag ring (twin MG, ZU-23 as it's upgraded), MANTIS gun turret, Stinger team,
    // EW jammer mast, observer tower, ammo point crates. A unit that's down shows only its wrecked plate.
    // Guns draw their field of fire on the ground: faint, bright for the one you picked.
    const fan: number[] = [], picked: number[] = [];
    for (const p of s.perim) {
      const ry = radial(p.a), g = group(base, p.x, groundY(p.x, p.z), p.z, ry);
      g.scale.setScalar(PAD_VIS);
      solid(new THREE.CylinderGeometry(1.1, 1.25, 0.2, 10), p.down ? C.wreck : 0x7d7058, 0, 0.1, 0, g); // dug-in pit
      if (p.down) { solid(box(0.8, 0.25, 0.6).rotateZ(0.5), C.wreck, 0.2, 0.4, 0, g); solid(box(0.5, 0.2, 0.5).rotateY(0.7), C.wreck, -0.4, 0.3, 0.2, g); continue; }
      if (p.k === 'mg') {
        solid(new THREE.TorusGeometry(0.72, 0.2, 5, 10).rotateX(Math.PI / 2), C.sand, 0, 0.35, 0, g); // sandbags
        const t = group(g, 0, 0.5, 0); aimers.push([t, ry, `pad${p.slot}`]);
        const big = p.tier === 2, len = big ? 1.6 : 1.1;
        solid(box(big ? 0.6 : 0.35, 0.3, big ? 0.6 : 0.3), MID, 0, 0.2, 0, t);
        for (const z of p.tier ? [-0.1, 0.1] : [0]) solid(new THREE.CylinderGeometry(0.035, 0.035, len, 5).rotateZ(Math.PI / 2), C.dark, len / 2 + 0.05, 0.25, z, t);
      } else if (p.k === 'mantis') {
        const t = group(g, 0, 0.2, 0); aimers.push([t, ry, `pad${p.slot}`]);
        solid(box(0.9, 0.7, 0.9), C.concrete, 0, 0.35, 0, t);
        solid(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6).rotateZ(Math.PI / 2), C.dark, 1.1, 0.5, 0, t);
      } else if (p.k === 'stinger') {
        solid(new THREE.TorusGeometry(0.72, 0.2, 5, 10).rotateX(Math.PI / 2), C.sand, 0, 0.35, 0, g);
        canisters(g, 1, 2, 1.4, 0.25, 0.5, -0.3);
      } else if (p.k === 'iris') { // IRIS-T SLM launcher: 8 canisters, near vertical
        aimers.push([canisters(g, 2, 4, 1.8, 0.26, 1.2, 0), ry, `pad${p.slot}`]);
      } else if (p.k === 'observer') {
        for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) solid(box(0.08, 2.4, 0.08), 0x6b5a40, x, 1.5, z, g);
        solid(box(1.1, 0.5, 1.1), MID, 0, 2.9, 0, g);
        solid(new THREE.CylinderGeometry(0.01, 0.85, 0.4, 4).rotateY(Math.PI / 4), 0x5d6340, 0, 3.35, 0, g);
        solid(box(0.15, 0.15, 0.5), C.dark, 0.6, 3, 0, g); // binoculars facing out
      } else if (p.k === 'ammo') {
        for (const [x, z, y] of [[-0.35, -0.3, 0.4], [0.35, -0.3, 0.4], [0, 0.35, 0.4], [0, -0.3, 0.85]]) solid(box(0.6, 0.4, 0.5), 0x6a5a3a, x, y, z, g);
      } else {
        solid(new THREE.CylinderGeometry(0.05, 0.07, 2.4, 5), C.metal, 0, 1.4, 0, g);
        const head = group(g, 0, 2.6, 0); sweepers.push([head, ry]);
        solid(new THREE.ConeGeometry(0.45, 0.3, 8, 1, true).rotateZ(Math.PI / 2), HOT, 0.2, 0, 0, head);
      }
      if (!GUNS.includes(p.k)) continue;
      const out = p.slot === s.selected ? picked : fan;
      fanPts(out, p.k, p.x, p.z, p.a, padStats(s, p).range);
    }
    for (const [pts, color, opacity] of [[fan, 0xffffff, 0.22], [picked, C.friend, 0.9]] as const) if (pts.length) {
      const l = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), lineMat(color, opacity));
      l.renderOrder = 2; base.add(l);
    }
    scene.add(base);
  }
  // Field of fire as ground segments: the arc at `r`, and its edges out from the unit when it's not all round.
  function fanPts(out: number[], k: PerimKind, x: number, z: number, a: number, r: number) {
    const w = FANS[k], n = Math.ceil(w * 12), y = (px: number, pz: number) => groundY(px, pz) + 0.15;
    for (let i = 0; i < n; i++) {
      const a0 = a - w + 2 * w * i / n, a1 = a - w + 2 * w * (i + 1) / n;
      const x0 = x + Math.cos(a0) * r, z0 = z + Math.sin(a0) * r, x1 = x + Math.cos(a1) * r, z1 = z + Math.sin(a1) * r;
      out.push(x0, y(x0, z0), z0, x1, y(x1, z1), z1);
    }
    if (w < Math.PI) for (const b of [a - w, a + w]) { const ex = x + Math.cos(b) * r, ez = z + Math.sin(b) * r; out.push(x, y(x, z), z, ex, y(ex, ez), ez); }
  }

  // ---- building: a ghost of the unit where it would go, green if it can, red if not; the recommended spot pulses ----
  const ghost = new THREE.Group(), ghostMat = new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.45, depthWrite: false });
  ghost.add(new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.25, 16).translate(0, 0.15, 0), ghostMat), new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.8).translate(0, 0.7, 0), ghostMat));
  ghost.scale.setScalar(PAD_VIS); ghostMat.toneMapped = false;
  ghost.visible = false; scene.add(ghost);
  const GF = 2 * 80 + 4, ghostFanPos = new Float32Array(GF * 3);
  const ghostFan = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(ghostFanPos, 3)), lineMat(0x66ff88, 0.8));
  ghostFan.frustumCulled = false; ghostFan.renderOrder = 3; scene.add(ghostFan);
  (ghostFan.material as THREE.LineBasicMaterial).toneMapped = false;
  // The area it would cover, filled: a sector for a gun, a disc for support (reach / eyes).
  const areaMat = new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const ghostArea = new THREE.Mesh(new THREE.BufferGeometry(), areaMat); ghostArea.renderOrder = 2; scene.add(ghostArea);
  const hint = new THREE.Mesh(segs(ringPts(16, 2)), additive(0xffffff, true)); hint.visible = false; scene.add(hint);
  let hover: { x: number; z: number } | null = null, hintKey = '', hintAt: { x: number; z: number } | undefined, ghostKey = '';
  const fanTmp: number[] = [];

  // ---- instanced pools ----
  // Enemies: lit models, tinted per type; a faint stalk and ring drop to the ground under each so you can read where it is.
  const enemyMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const enemyMeshes = {} as Record<EnemyKind, THREE.InstancedMesh>;
  for (const k of KINDS) { const m = enemyMeshes[k] = instanced(GEOS[k], enemyMat, MAX_ENEMIES); m.castShadow = true; scene.add(m); }
  const rotors = faded(new THREE.CylinderGeometry(1, 1, 0.02, 20), MAX_ENEMIES, 0.35);
  const stalks = faded(new THREE.BoxGeometry(0.05, 1, 0.05).translate(0, 0.5, 0), MAX_ENEMIES, 0.35);
  const pips = faded(new THREE.RingGeometry(0.7, 1, 20).rotateX(-Math.PI / 2), MAX_ENEMIES, 0.7);
  scene.add(rotors, stalks, pips);

  // Corner-bracket reticle ⌐ ¬, billboarded to the camera.
  const bracketPts: number[] = [];
  for (const [x, y] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) bracketPts.push(x, y, 0, x * 0.5, y, 0, x, y, 0, x, y * 0.5, 0);
  const brackets = instanced(segs(bracketPts), additive(0xffffff, true), MAX_LOCKS);
  (brackets.material as THREE.Material).depthTest = false; brackets.renderOrder = 9;
  const hpBars = instanced(new THREE.PlaneGeometry(1, 0.22).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({ depthTest: false, transparent: true }), MAX_LOCKS + 32);
  hpBars.renderOrder = 10;
  // Marked target: rotating dashed ring on the ground below it, plus a dashed line to the base.
  const markPts = ringPts(24, 2);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + TAU / 48; markPts.push(Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35, Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8); }
  const markRing = new THREE.Mesh(segs(markPts), additive(C.friend, true));
  const markLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2, 0), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: C.friend, dashSize: 1.2, gapSize: 0.9, transparent: true, opacity: 0.7 }));
  markLine.frustumCulled = false;
  scene.add(brackets, hpBars, markRing, markLine);
  const lockLinePos = new Float32Array(MAX_LOCKS * 6);
  const lockLines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(lockLinePos, 3)), lineMat(C.friend, 0.25));
  lockLines.frustumCulled = false; scene.add(lockLines);
  // The unit you picked: a ring on the ground.
  const selRing = new THREE.Mesh(segs(ringPts(32)), additive(C.friend, true)); selRing.visible = false; scene.add(selRing);

  const shells = instanced(new THREE.BoxGeometry(0.3, 0.3, 1.6), additive(), MAX_SHOTS);
  const tracers = instanced(new THREE.BoxGeometry(0.08, 0.08, 2.2), additive(), MAX_SHOTS);
  const missiles = instanced(mergeGeometries([new THREE.CylinderGeometry(0.1, 0.1, 1, 6).rotateX(Math.PI / 2), new THREE.ConeGeometry(0.1, 0.3, 6).rotateX(Math.PI / 2).translate(0, 0, 0.65)])!, new THREE.MeshLambertMaterial(), MAX_SHOTS);
  const shardMesh = instanced(new THREE.TetrahedronGeometry(0.35), additive(), MAX_SHARDS);
  const waveMesh = instanced(segs(ringPts(48)), additive(0xffffff, true), MAX_WAVES);
  // Beams (HEL, HPM band, motor flames): additive. Trails (missile smoke): normal blend, thinning out.
  const beamMesh = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0), additive(), MAX_BEAMS);
  const smokeMesh = faded(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0), MAX_BEAMS, 0.55);
  // Explosion smoke: puffs that rise, grow and thin out.
  const puffMesh = faded(new THREE.IcosahedronGeometry(1, 1), MAX_PUFFS, 0.8);
  // HPM wavefronts: three thin arcs, scaled out from the array along the firing bearing.
  const frontPts: number[] = [];
  for (const r of [0.97, 1, 1.03]) for (let i = 0; i < 6; i++) {
    const a = (i / 6 - 0.5) * 0.12, b = ((i + 1) / 6 - 0.5) * 0.12;
    frontPts.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(b) * r, 0, Math.sin(b) * r);
  }
  const frontMesh = instanced(segs(frontPts), additive(0xffffff, true), MAX_FRONTS);
  const blipMesh = instanced(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), additive(), MAX_BLIPS);
  (blipMesh.material as THREE.Material).depthTest = false;
  // Jammed sector: a faint amber wedge from the battery out along each Mi-8's bearing.
  const jamMesh = instanced(new THREE.RingGeometry(0.08, 1, 12, 1, -EW_ARC, EW_ARC * 2).rotateX(-Math.PI / 2), additive(), 16);
  (jamMesh.material as THREE.Material).depthTest = false;
  scene.add(shells, tracers, missiles, shardMesh, waveMesh, beamMesh, smokeMesh, puffMesh, frontMesh, blipMesh, jamMesh);
  // Salvage: a supply crate bobbing over a ground ring, with a light column so it's easy to spot. Blinks before it's lost.
  const dropMesh = instanced(new THREE.BoxGeometry(1, 0.8, 0.8), new THREE.MeshLambertMaterial(), DROP_MAX);
  const dropRing = instanced(segs(ringPts(20, 2)), additive(0xffffff, true), DROP_MAX);
  const dropBeam = instanced(new THREE.BoxGeometry(0.12, 1, 0.12).translate(0, 0.5, 0), additive(), DROP_MAX);
  dropMesh.castShadow = true;
  scene.add(dropMesh, dropRing, dropBeam);
  // Incoming raid: three amber chevrons at the rim, pointing in along its bearing.
  const chevPts: number[] = [];
  for (let i = 0; i < 3; i++) chevPts.push(0.6 - i, 0, -0.8, -i, 0, 0, -i, 0, 0, 0.6 - i, 0, 0.8);
  const raidMark = new THREE.Mesh(segs(chevPts), additive(ALERT, true));
  raidMark.visible = false; scene.add(raidMark);
  // Coverage overlay [O]: how many guns cover each patch of ground. Amber: a gap in the threat arc (inside the
  // forward line), dim green: one gun, bright green: crossfire. Draped on the terrain; redrawn when the layout or the arc changes.
  const COV_N = 256, COV_R = ARENA_R, GAP_R = 32, cov = document.createElement('canvas');
  cov.width = cov.height = COV_N;
  const covTex = new THREE.CanvasTexture(cov);
  const covGeo = new THREE.PlaneGeometry(COV_R * 2, COV_R * 2, 96, 96).rotateX(-Math.PI / 2);
  { const p = covGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i)) + 0.1); }
  const covMesh = new THREE.Mesh(covGeo, new THREE.MeshBasicMaterial({ map: covTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  covMesh.visible = false; covMesh.renderOrder = 1; scene.add(covMesh);
  let showCov = false, covKey = '';
  const rgb = (c: number) => [c >> 16, c >> 8 & 255, c & 255];
  function drawCoverage(s: State) {
    const g = cov.getContext('2d')!, img = g.createImageData(COV_N, COV_N), count = coverage(s);
    const arc = Math.min(Math.PI, Math.max(FRONT_ARC, flankArc(s.stage)));
    const shade = [[...rgb(ALERT), 90], [...rgb(0x9ad96a), 70], [...rgb(0x4dff7a), 120]];
    for (let j = 0; j < COV_N; j++) for (let i = 0; i < COV_N; i++) {
      const x = ((i + 0.5) / COV_N * 2 - 1) * COV_R, z = ((j + 0.5) / COV_N * 2 - 1) * COV_R, d = Math.hypot(x, z);
      if (d > COV_R || d < BASE_R) continue;
      const n = count(x, z), off = Math.atan2(z, x) - FRONT;
      if (!n && (d > GAP_R || Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) > arc)) continue;
      img.data.set(shade[Math.min(n, 2)], (j * COV_N + i) * 4);
    }
    g.putImageData(img, 0, 0);
    covTex.needsUpdate = true;
  }

  // Particle pools: flat arrays, ring-buffer allocation, no per-frame garbage.
  const sh = { p: new Float32Array(MAX_SHARDS * 3), v: new Float32Array(MAX_SHARDS * 3), life: new Float32Array(MAX_SHARDS), max: new Float32Array(MAX_SHARDS), col: new Float32Array(MAX_SHARDS * 3), size: new Float32Array(MAX_SHARDS), next: 0 };
  const wv = { x: new Float32Array(MAX_WAVES), y: new Float32Array(MAX_WAVES), z: new Float32Array(MAX_WAVES), r: new Float32Array(MAX_WAVES), life: new Float32Array(MAX_WAVES), max: new Float32Array(MAX_WAVES), col: new Float32Array(MAX_WAVES * 3), next: 0 };
  // grow: 0 = beam (thins as it fades), 1 = smoke trail (spreads and thins as it fades).
  const bm = { a: new Float32Array(MAX_BEAMS * 6), w: new Float32Array(MAX_BEAMS), life: new Float32Array(MAX_BEAMS), max: new Float32Array(MAX_BEAMS), col: new Float32Array(MAX_BEAMS * 3), grow: new Uint8Array(MAX_BEAMS), next: 0 };
  const pf = { p: new Float32Array(MAX_PUFFS * 3), r: new Float32Array(MAX_PUFFS), life: new Float32Array(MAX_PUFFS), max: new Float32Array(MAX_PUFFS), c: new Float32Array(MAX_PUFFS), next: 0 };
  const fr = { x: new Float32Array(MAX_FRONTS), y: new Float32Array(MAX_FRONTS), z: new Float32Array(MAX_FRONTS), a: new Float32Array(MAX_FRONTS), t: new Float32Array(MAX_FRONTS), max: new Float32Array(MAX_FRONTS), next: 0 };
  // Per-shot render state: where it left from (the sim launches PAC-3 / IRIS-T from the battery centre, the
  // round is drawn from its launcher and eases onto the sim path), its age, how far it had to go, and where it was last drawn.
  const shotFx = new WeakMap<Shot, { ox: number; oy: number; oz: number; age: number; d0: number; px: number; py: number; pz: number }>();
  const bl = { x: new Float32Array(MAX_BLIPS), z: new Float32Array(MAX_BLIPS), r: new Float32Array(MAX_BLIPS), life: new Float32Array(MAX_BLIPS), max: new Float32Array(MAX_BLIPS), next: 0 };
  const tmpC = new THREE.Color();
  const byId = new Map<number, { x: number; z: number; y: number }>(); // this frame's contacts, for shot and effect heights
  const ePos: { x: number; z: number; y: number }[] = Array.from({ length: MAX_ENEMIES }, () => ({ x: 0, z: 0, y: 0 }));
  // Drawn height of a contact near (x, z) (an event only says where), or low over the ground if there's none.
  const airY = (s: State, x: number, z: number) => {
    let by = groundY(x, z) + 2, bd = 9;
    for (const e of s.enemies) { const d = (e.x - x) ** 2 + (e.z - z) ** 2; if (d < bd) { bd = d; by = groundY(e.x, e.z) + altitude(e.kind, e.x, e.z); } }
    return by;
  };

  function shards(x: number, z: number, n: number, color: number, speed = 12, size = 1, y = 1, k = 1) {
    tmpC.setHex(color).multiplyScalar(k);
    for (let j = 0; j < n; j++) {
      const i = sh.next = (sh.next + 1) % MAX_SHARDS;
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random());
      sh.p.set([x, y, z], i * 3);
      sh.v.set([Math.cos(a) * v, 2 + Math.random() * speed * 0.6, Math.sin(a) * v], i * 3);
      sh.life[i] = sh.max[i] = 0.3 + Math.random() * 0.5;
      sh.col.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
      sh.size[i] = size * (0.8 + Math.random());
    }
  }
  function puffs(x: number, y: number, z: number, n: number, r: number, life = 1.6, dark = 0.35) {
    for (let j = 0; j < n; j++) {
      const i = pf.next = (pf.next + 1) % MAX_PUFFS;
      pf.p.set([x + (Math.random() - 0.5) * r, y + (Math.random() - 0.3) * r * 0.6, z + (Math.random() - 0.5) * r], i * 3);
      pf.r[i] = r * (0.5 + Math.random() * 0.6); pf.life[i] = pf.max[i] = life * (0.7 + Math.random() * 0.6); pf.c[i] = dark + Math.random() * 0.2;
    }
  }
  function boom(x: number, y: number, z: number, size: number, n: number) {
    shards(x, z, n, C.fire, 8 + size * 3, size * 0.9, y, 1.6);
    shards(x, z, Math.ceil(n / 3), C.flash, 5, size * 0.6, y, 2);
    wave(x, y, z, size * 3, C.fire, 0.35, 1.2);
    puffs(x, y, z, 2 + Math.ceil(size * 2), size * 1.1);
  }
  function wave(x: number, y: number, z: number, r: number, color: number, life = 0.5, k = 1) {
    const i = wv.next = (wv.next + 1) % MAX_WAVES;
    wv.x[i] = x; wv.y[i] = y; wv.z[i] = z; wv.r[i] = r; wv.life[i] = wv.max[i] = life;
    tmpC.setHex(color).multiplyScalar(k); wv.col.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  }
  const gwave = (x: number, z: number, r: number, color: number, life = 0.5, k = 1) => wave(x, groundY(x, z) + 0.3, z, r, color, life, k);
  function beam(x: number, y: number, z: number, x2: number, y2: number, z2: number, w: number, color: number, life: number, k = 1, grow = 0) {
    const i = bm.next = (bm.next + 1) % MAX_BEAMS;
    const a = bm.a, j = i * 6;
    a[j] = x; a[j + 1] = y; a[j + 2] = z; a[j + 3] = x2; a[j + 4] = y2; a[j + 5] = z2;
    bm.w[i] = w; bm.life[i] = bm.max[i] = life; bm.grow[i] = grow;
    tmpC.setHex(color).multiplyScalar(k); bm.col[i * 3] = tmpC.r; bm.col[i * 3 + 1] = tmpC.g; bm.col[i * 3 + 2] = tmpC.b;
  }
  // Laser: soft glow around a white-hot core, and sparks where it lands.
  function laser(x: number, y: number, z: number, x2: number, y2: number, z2: number) {
    beam(x, y, z, x2, y2, z2, 0.4, 0x7fd8ff, 0.16, 0.8);
    beam(x, y, z, x2, y2, z2, 0.12, 0xffffff, 0.12, 2);
    shards(x2, z2, 2, C.flash, 5, 0.5, y2, 2);
  }
  function front(x: number, y: number, z: number, a: number, delay: number, max: number) {
    const i = fr.next = (fr.next + 1) % MAX_FRONTS;
    fr.x[i] = x; fr.y[i] = y; fr.z[i] = z; fr.a[i] = a; fr.t[i] = -delay; fr.max[i] = max;
  }
  const aimT = new Map<string, number>(), aimCur = new Map<string, number>();
  function blip(x: number, z: number, r: number, life: number) {
    const i = bl.next = (bl.next + 1) % MAX_BLIPS;
    bl.x[i] = x; bl.z[i] = z; bl.r[i] = r; bl.life[i] = bl.max[i] = life;
  }

  const KILL_SHARDS: Record<EnemyKind, number> = { swarm: 4, scout: 6, drone: 8, tank: 16, elite: 24, decoy: 5, arm: 6, ew: 16, tbm: 12, cruise: 8, atgm: 3, kab: 10 };
  function consume(s: State) {
    for (const e of s.events) {
      switch (e.k) {
        case 'kill': {
          const T = ENEMIES[e.kind!], y = groundY(e.x, e.z) + altitude(e.kind!, e.x, e.z);
          boom(e.x, y, e.z, T.size * 1.3, KILL_SHARDS[e.kind!]);
          if (T.size > 1.5) gwave(e.x, e.z, T.size * 3, C.fire, 0.5, 0.6); // debris lands
          break;
        }
        case 'hit': {
          const y = airY(s, e.x, e.z);
          e.n ? (wave(e.x, y, e.z, e.n, C.fire, 0.35, 1.2), shards(e.x, e.z, 6, C.fire, 10, 0.8, y, 1.5), puffs(e.x, y, e.z, 2, e.n * 0.5, 1)) : shards(e.x, e.z, 2, C.flash, 6, 0.4, y, 1.5);
          break;
        }
        case 'baseHit': { const y = groundY(e.x, e.z) + 0.8; boom(e.x * 0.5, y, e.z * 0.5, 2.5, 18); puffs(e.x * 0.5, y, e.z * 0.5, 6, 2.5, 3, 0.2); groundFlash = 1; break; }
        case 'padHit': shards(e.x, e.z, 4, C.fire, 6, 0.6, groundY(e.x, e.z) + 0.8, 1.5); break;
        case 'padDown': { const y = groundY(e.x, e.z) + 0.6; boom(e.x, y, e.z, 1.6, 14); puffs(e.x, y, e.z, 5, 1.8, 4, 0.15); break; }
        case 'gun': { // MG / MANTIS: the pad's turret swings onto the target, muzzle flash at the barrel tip
          const a = Math.atan2(e.z2 - e.z, e.x2 - e.x), p = s.perim.find(p => Math.abs(p.x - e.x) + Math.abs(p.z - e.z) < 0.01);
          if (p) aimT.set(`pad${p.slot}`, a);
          const tip = (p?.k === 'mg' ? (p.tier === 2 ? 1.65 : 1.15) : 1.9) * PAD_VIS;
          shards(e.x + Math.cos(a) * tip, e.z + Math.sin(a) * tip, 2, C.flash, 3, 0.35, groundY(e.x, e.z) + 0.8, 2);
          break;
        }
        case 'beam': { // from the HEL (sim fires from the centre), or a hop between contacts (ARC LASER, OVERKILL)
          const y2 = airY(s, e.x2, e.z2);
          if (e.x || e.z) laser(e.x, airY(s, e.x, e.z), e.z, e.x2, y2, e.z2);
          else { aimT.set('hel', Math.atan2(e.z2 - helPt[2], e.x2 - helPt[0])); laser(helPt[0], helPt[1], helPt[2], e.x2, y2, e.z2); }
          break;
        }
        case 'rail': { // HPM: a shimmering band down the line, crossed by wavefronts rolling out from the array
          const [x, y, z] = hpmPt, a = Math.atan2(e.z2 - z, e.x2 - x), len = Math.hypot(e.x2 - x, e.z2 - z), y2 = airY(s, e.x2, e.z2);
          aimT.set('hpm', a);
          beam(x, y, z, e.x2, y2, e.z2, 2.2, 0x9fe8ff, 0.4, 0.15);
          beam(x, y, z, e.x2, y2, e.z2, 0.25, 0xffffff, 0.3, 0.8);
          for (let i = 0; i < 6; i++) front(x, y, z, a, i * 0.05, len);
          gwave(x, z, 4, 0x9fe8ff, 0.3);
          break;
        }
        case 'level': gwave(0, 0, 40, 0xffe9a8, 1.2, 1.2); gwave(0, 0, 25, 0xffffff, 0.9); groundFlash = 0.4; break;
        case 'warning': gwave(0, 0, ARENA_R, ALERT, 1.5, 1.5); break;
        case 'arm': case 'tbm': case 'cruise': wave(e.x, groundY(e.x, e.z) + altitude(e.k as EnemyKind, e.x, e.z), e.z, e.k === 'arm' ? 6 : 4, ALERT, 0.8, 1.5); break;
        case 'release': wave(e.x, airY(s, e.x, e.z), e.z, 2.5, ALERT, 0.4, 1.2); break;
        case 'jam': gwave(e.x, e.z, 8, ALERT, 1.2); break;
        case 'ident': gwave(e.x, e.z, 3, 0xcccccc, 0.4); break;
        case 'acquire': wave(e.x, airY(s, e.x, e.z), e.z, 3.5, C.friend, 0.25, 1.2); break; // brackets snap on
        case 'lost': wave(e.x, airY(s, e.x, e.z), e.z, 2.5, ALERT, 0.3, 0.8); break;
        case 'radarDown': gwave(0, 0, 14, ALERT, 0.8, 1.5); boom(0, 2.5, 0, 1.5, 20); puffs(0, 2, 0, 6, 1.5, 3, 0.2); groundFlash = 0.8; break;
        case 'intercept': wave(e.x, airY(s, e.x, e.z), e.z, 8, C.friend, 0.6, 1.5); gwave(0, 0, 12, C.friend, 0.5); break;
        case 'emcon': gwave(0, 0, radarRange(s), 0xcccccc, 0.6); break;
        case 'radarMode': gwave(0, 0, radarRange(s), C.friend, 0.5); break;
        case 'raid': gwave(e.x, e.z, 14, ALERT, 1.2, 1.5); break;
        case 'package': gwave(e.x, e.z, 9, ALERT, 1); break;
        case 'raidStart': gwave(e.x, e.z, 20, ALERT, 1.5, 1.5); gwave(0, 0, ARENA_R, ALERT, 1.2); break;
        case 'raidLeak': gwave(0, 0, 18, ALERT, 1, 1.5); groundFlash = 0.6; break;
        case 'raidClear': gwave(0, 0, 30, 0xffffff, 1, 1.2); break;
        case 'padMoved': puffs(e.x, groundY(e.x, e.z) + 0.3, e.z, 4, 1.2, 1.2, 0.55); break; // dust as it digs in
        case 'upgrade': // the battery answers every purchase; a new rank lights it up
          gwave(0, 0, e.star ? 18 : 7, C.friend, e.star ? 0.9 : 0.4, e.star ? 1.5 : 0.8);
          shards(0, 0, e.star ? 24 : 6, e.star ? 0xffe9a8 : C.friend, e.star ? 16 : 8, 0.8, 2.5, 1.5);
          if (e.star) groundFlash = 0.3;
          break;
        case 'drop': gwave(e.x, e.z, 4, 0xffe9a8, 0.6, 1.2); puffs(e.x, groundY(e.x, e.z) + 0.3, e.z, 3, 1, 1.2, 0.55); break;
        case 'pickup': { // recovered: burst, and a streak back to the battery
          const y = groundY(e.x, e.z) + 1.2;
          gwave(e.x, e.z, 7, 0xffe9a8, 0.5, 1.5); shards(e.x, e.z, e.drop === 'tech' ? 30 : 14, 0xffe9a8, 12, 0.9, y, 1.5);
          beam(e.x, y, e.z, 0, 1.5, 0, 0.25, 0xffe9a8, 0.35, 1.5);
          if (e.drop === 'tech') { gwave(0, 0, 14, 0xffffff, 0.8, 1.5); groundFlash = 0.4; }
          break;
        }
      }
    }
  }

  const pools = [...Object.values(enemyMeshes), rotors, stalks, pips, brackets, hpBars, shells, tracers, missiles, dropMesh, dropRing, dropBeam, shardMesh, waveMesh, beamMesh, smokeMesh, puffMesh, frontMesh, blipMesh, jamMesh, dwellMesh];
  const sent = new Map<THREE.InstancedMesh, number>();
  const dummy = new THREE.Object3D();
  const camRight = new THREE.Vector3();
  const markEnd = markLine.geometry.attributes.position as THREE.BufferAttribute;
  const dir = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
  const hpCol = (r: number) => tmpC.setRGB(1 - r * 0.6, 0.35 + r * 0.6, 0.25);
  let clock = 0;

  function render(s: State, dt: number) {
    clock += dt;
    if (mapSeed !== terrainKey) buildTerrain(); // a new run, a new map
    consume(s);
    const key = `${s.level}${s.st.radar}${!!s.st.weapons.cannon}${s.st.aesa}${!!s.st.weapons.pulse}${s.lv.missile ?? 0}${!!s.st.weapons.rail}|${s.perim.map(p => `${p.slot}${p.k}${p.tier}${p.down ? 'd' : ''}${p.x},${p.z}`).join()}|${s.selected}`;
    if (key !== baseKey) { baseKey = key; buildBase(s); }
    covMesh.visible = showCov;
    if (showCov && `${key}|${s.stage}` !== covKey) { covKey = `${key}|${s.stage}`; drawCoverage(s); }
    const play = s.phase === 'play';

    // camera: orbit the target; portrait screens back off so the base still fits across
    const aspectK = Math.max(1, 0.8 / camera.aspect), d = dist * aspectK;
    const sx = (Math.random() - 0.5) * s.shake * 1.2, sz = (Math.random() - 0.5) * s.shake * 1.2;
    const ty = groundY(tx, tz);
    camera.position.set(tx + Math.cos(yaw) * Math.cos(PITCH) * d + sx, ty + Math.sin(PITCH) * d, tz + Math.sin(yaw) * Math.cos(PITCH) * d + sz);
    camera.lookAt(tx + sx, ty, tz + sz);
    shift += ((inTop - inBot) / 2 - shift) * Math.min(1, dt * 8); // eased, so opening the shop slides the view
    if (Math.abs(shift) > 0.5) camera.setViewOffset(innerWidth, innerHeight, 0, -shift, innerWidth, innerHeight); else camera.clearViewOffset();
    camera.updateMatrixWorld();
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);

    // light: day, or moonlight for NIGHT RAID
    night += ((phase(s).mod.dark ? 1 : 0) - night) * Math.min(1, dt * 1.5);
    groundFlash = Math.max(0, groundFlash - dt * 2.5);
    hemi.intensity = 1.1 - 0.8 * night + groundFlash * 0.6; sun.intensity = 2.4 - 2.05 * night;
    sun.color.setHex(0xfff0d8).lerp(tmpC.setHex(0x9fb4ff), night);
    sky.setHex(C.sky).lerp(tmpC.setHex(C.night), night);
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(sky); fog.near = d + 30; fog.far = d + 170;

    // map overlays: build zone (bright while building), the flank arc, eyesight / radar range
    const building = !!s.placing || s.relocating;
    const bz = buildR(s.level);
    if (bz !== zoneKey) {
      zoneKey = bz; if (zoneLine) { scene.remove(zoneLine); zoneLine.geometry.dispose(); }
      scene.add(zoneLine = groundLine(arcPts(bz, 0, TAU, 128), zoneMat, true));
    }
    zoneMat.opacity = building ? 0.75 + 0.2 * Math.sin(clock * 5) : 0.25;
    innerLine.visible = building;
    const fa = Math.min(Math.PI, Math.max(FRONT_ARC, flankArc(s.stage)));
    if (fa !== flankKey) {
      flankKey = fa; if (flankLine) { scene.remove(flankLine); flankLine.geometry.dispose(); flankLine = null; }
      if (fa > FRONT_ARC) scene.add(flankLine = groundLine(arcPts(ARENA_R + 2, FRONT - fa, FRONT + fa, 80), lineMat(ALERT, 0.4, true)));
    }

    const on = emitting(s);
    const rr = s.st.radar ? radarRange(s) : VISUAL_R, sector = radarSector(s); // no radar: the ring shows eyesight
    setRing(rangeRing, rr); setRing(trackRing, s.st.trackRange);
    trackRing.visible = s.st.radar;
    (rangeRing.material as THREE.LineBasicMaterial).opacity = on || !s.st.radar ? 0.5 : 0.12 + 0.08 * Math.sin(clock * 6);
    (rangeRing.material as THREE.LineBasicMaterial).color.setHex(s.st.radar ? C.friend : 0xffffff);
    sweep.rotation.y = -s.sweepA; sweep.scale.setScalar(rr); sweep.visible = on && !s.st.aesa && !sector;
    focusMesh.visible = on && sector > 0;
    if (focusMesh.visible) {
      if (focusW !== sector) { focusW = sector; focusMesh.geometry.dispose(); focusMesh.geometry = new THREE.RingGeometry(0.03, 1, 32, 1, -sector / 2, sector).rotateX(-Math.PI / 2); }
      focusMesh.rotation.y = -focusBearing(s); focusMesh.scale.setScalar(rr);
      (focusMesh.material as THREE.MeshBasicMaterial).color.setHex(C.friend).multiplyScalar(0.05 + 0.02 * Math.random());
    }
    raidMark.visible = !!s.raid || s.raidLeft > 0; // warning: pulsing in; attack: held steady on the raid's bearing
    if (raidMark.visible) {
      const a = s.raid ? s.raid.a : s.raidA, pulse = s.raid ? (clock * 1.5) % 1 : 0.5 + 0.2 * Math.sin(clock * 3), r = ARENA_R - 1 - pulse * 3;
      raidMark.position.set(Math.cos(a) * r, groundY(Math.cos(a) * r, Math.sin(a) * r) + 0.5, Math.sin(a) * r);
      raidMark.rotation.y = -a; raidMark.scale.setScalar(2.6);
      (raidMark.material as THREE.MeshBasicMaterial).color.setHex(ALERT).multiplyScalar(0.8 + 1.2 * (1 - pulse));
    }

    // Building: the ghost where the unit would go, its field of fire, and the recommended spot.
    const mover = s.relocating ? selectedPad(s) : undefined, bk = s.placing?.k ?? mover?.k;
    ghost.visible = ghostFan.visible = ghostArea.visible = hint.visible = false;
    if (bk && (play || s.phase === 'pause')) {
      const hk = `${key}|${s.stage}|${bk}|${s.relocating}`;
      if (hk !== hintKey) { hintKey = hk; hintAt = s.placing ? bestSpot(s, bk) : undefined; }
      if (hintAt) {
        hint.visible = true;
        hint.position.set(hintAt.x, groundY(hintAt.x, hintAt.z) + 0.25, hintAt.z); hint.rotation.y = clock;
        hint.scale.setScalar(1.8 + 0.4 * Math.sin(clock * 8));
        (hint.material as THREE.MeshBasicMaterial).color.setHex(0xfff1a0).multiplyScalar(1.4);
      }
      const want = hover ?? hintAt, q = want && spotNear(s, want.x, want.z, mover?.slot ?? -1), at = q ?? want;
      if (at) {
        ghost.visible = true;
        ghost.position.set(at.x, groundY(at.x, at.z), at.z);
        const c = q ? 0x66ff88 : 0xff5544;
        ghostMat.color.setHex(c); areaMat.color.setHex(c); (ghostFan.material as THREE.LineBasicMaterial).color.setHex(c);
        const range = bk === 'mg' ? MG_TIERS[mover?.tier ?? 0].range : bk === 'observer' ? 28 : bk === 'ammo' ? 10 : PERIM[bk].range;
        const gk = `${at.x},${at.z},${bk},${range}`;
        if (gk !== ghostKey) {
          ghostKey = gk; fanTmp.length = 0;
          if (GUNS.includes(bk)) fanPts(fanTmp, bk, at.x, at.z, Math.atan2(at.z, at.x), range);
          else { const n = 40; for (let i = 0; i < n; i++) { const a0 = i / n * TAU, a1 = (i + 1) / n * TAU; fanTmp.push(at.x + Math.cos(a0) * range, groundY(at.x, at.z) + 0.2, at.z + Math.sin(a0) * range, at.x + Math.cos(a1) * range, groundY(at.x, at.z) + 0.2, at.z + Math.sin(a1) * range); } }
          ghostFanPos.set(fanTmp.slice(0, GF * 3));
          ghostFan.geometry.setDrawRange(0, Math.min(GF, fanTmp.length / 3));
          ghostFan.geometry.attributes.position.needsUpdate = true;
          const w = GUNS.includes(bk) ? FANS[bk] : Math.PI;
          ghostArea.geometry.dispose();
          ghostArea.geometry = new THREE.CircleGeometry(range, 48, -w, 2 * w).rotateX(Math.PI / 2).rotateY(-Math.atan2(at.z, at.x));
          ghostArea.position.set(at.x, groundY(at.x, at.z) + 0.25, at.z);
        }
        ghostFan.visible = ghostArea.visible = true;
      }
    }
    const sel = selectedPad(s);
    selRing.visible = !!sel;
    if (sel) { selRing.position.set(sel.x, groundY(sel.x, sel.z) + 0.3, sel.z); selRing.scale.setScalar(1.7 + 0.1 * Math.sin(clock * 6)); selRing.rotation.y = clock * 0.5; }

    aimT.set('pac', s.aim);
    for (const [k, t] of aimT) {
      const c = aimCur.get(k) ?? t, da = ((t - c + Math.PI) % TAU + TAU) % TAU - Math.PI;
      aimCur.set(k, c + da * Math.min(1, dt * 15));
    }
    for (const [o, ry, k] of aimers) o.rotation.y = -(aimCur.get(k) ?? aimCur.get('pac')!) - ry;
    for (const [o, ry] of sweepers) o.rotation.y = -s.sweepA - ry;

    // Blips: the radar's own picture, faint on the ground, as the sweep (or an AESA dwell) finds contacts.
    const swept = ((s.sweepA - lastSweep) % TAU + TAU) % TAU, r2 = rr ** 2;
    dwellMesh.count = 0;
    if (s.st.aesa || sector) {
      if (on && !sector && play && (dwellAcc += dt * 5) >= 1) { dwellAcc = 0; dw.a[dw.next] = Math.random() * TAU; dw.life[dw.next] = 0.6; dw.next = (dw.next + 1) % DWELLS; }
      for (let i = 0; i < DWELLS; i++) {
        if (dw.life[i] <= 0) continue;
        if (play) dw.life[i] -= dt;
        dummy.position.set(0, 0.3, 0); dummy.rotation.set(0, -dw.a[i], 0); dummy.scale.setScalar(rr);
        dummy.updateMatrix(); dwellMesh.setMatrixAt(dwellMesh.count, dummy.matrix);
        dwellMesh.setColorAt(dwellMesh.count++, tmpC.setHex(C.friend).multiplyScalar(0.08 * Math.max(0, dw.life[i] / 0.6)));
      }
      for (const e of s.enemies) {
        if (e.locked || e.seenUntil <= (lastSeen.get(e) ?? -1)) continue;
        lastSeen.set(e, e.seenUntil);
        if (e.seenUntil > s.t) blip(e.x, e.z, e.size * VIS * 0.7, 1.5);
      }
    } else if (swept > 0 && swept < 1 && s.st.radar) for (const e of s.enemies) {
      if (!visible(s, e) || e.x * e.x + e.z * e.z > r2) continue;
      if (((Math.atan2(e.z, e.x) - lastSweep) % TAU + TAU) % TAU <= swept) blip(e.x, e.z, e.size * VIS * 0.7, TAU / Math.max(0.5, s.sweepSpeed));
    }
    lastSweep = s.sweepA;

    // Jammers: amber wedge, and a noise strobe of false returns along their bearing while the radar radiates.
    jamMesh.count = 0;
    for (const e of s.enemies) {
      if (e.kind !== 'ew' || !e.orbit || jamMesh.count >= 16) continue;
      const a = Math.atan2(e.z, e.x);
      dummy.position.set(0, 0.3, 0); dummy.rotation.set(0, -a, 0); dummy.scale.setScalar(rr);
      dummy.updateMatrix(); jamMesh.setMatrixAt(jamMesh.count, dummy.matrix);
      jamMesh.setColorAt(jamMesh.count++, tmpC.setHex(ALERT).multiplyScalar(0.04 + 0.03 * Math.random()));
      if (on && play && Math.random() < 0.6) {
        const r = 5 + Math.random() * (rr - 5), b = a + (Math.random() - 0.5) * EW_ARC;
        blip(Math.cos(b) * r, Math.sin(b) * r, 0.4 + Math.random() * 0.8, 0.5);
      }
    }

    // enemies, locks, hp bars
    for (const k of KINDS) enemyMeshes[k].count = 0;
    rotors.count = stalks.count = pips.count = 0;
    const rf = fadeAttr(rotors), sf = fadeAttr(stalks), pfa = fadeAttr(pips);
    let nl = 0, nb = 0, marked = false, ne = 0;
    byId.clear();
    for (const e of s.enemies) {
      if (!visible(s, e)) continue;
      const k = shownKind(e), m = enemyMeshes[k];
      if (m.count >= MAX_ENEMIES) continue;
      const gy = groundY(e.x, e.z), alt = altitude(e.kind, e.x, e.z), y = gy + alt, sz = e.size * VIS;
      const pos = ePos[ne++ % MAX_ENEMIES]; pos.x = e.x; pos.z = e.z; pos.y = y; byId.set(e.id, pos);
      const fade = e.locked ? 1 : Math.max(0.35, Math.min(1, (e.seenUntil - s.t) / 1.5));
      const heading = Math.atan2(e.vz, e.vx);
      // Nose along the flight path: divers and the Iskander pitch down, helicopters dip the nose flying in, FPVs rock as they jink.
      const pitch = e.kind === 'tbm' ? -0.9 : e.act === 'dive' ? -0.6 : (k === 'tank' || k === 'ew') && e.act !== 'hover' && !e.orbit ? -0.15 : 0;
      const bank = k === 'swarm' ? 0.25 * Math.sin(clock * 9 + e.id) : Math.sin(clock * 2 + e.wob) * 0.25 * ENEMIES[e.kind].wobble / 3;
      dummy.position.set(e.x, y, e.z);
      dummy.rotation.set(bank, -heading, pitch, 'YXZ');
      dummy.scale.setScalar(sz);
      dummy.updateMatrix();
      m.setMatrixAt(m.count, dummy.matrix);
      m.setColorAt(m.count++, tmpC.setHex(k === 'decoy' ? 0x9a9a9a : KIND_COL[k]).multiplyScalar(0.6 + 0.4 * fade));
      const rotor = ROTORS[k];
      if (rotor) { // spinning main rotor disc
        dummy.position.set(e.x, y + rotor.y * sz, e.z); dummy.rotation.set(0, clock * 20, 0); dummy.scale.set(rotor.r * sz, 1, rotor.r * sz); dummy.updateMatrix();
        rotors.setMatrixAt(rotors.count, dummy.matrix); rotors.setColorAt(rotors.count, tmpC.setHex(0x222222)); rf.setX(rotors.count++, 0.8);
      }
      // Stalk and ground ring: red for a threat, amber for a missile on the battery, grey for a classified decoy.
      const tc = k === 'decoy' ? 0x999999 : MUNITIONS.includes(e.kind) ? ALERT : C.threat;
      dummy.position.set(e.x, gy + 0.1, e.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, Math.max(0.01, alt - 0.1), 1); dummy.updateMatrix();
      stalks.setMatrixAt(stalks.count, dummy.matrix); stalks.setColorAt(stalks.count, tmpC.setHex(tc)); sf.setX(stalks.count++, 0.6 * fade);
      dummy.position.set(e.x, gy + 0.15, e.z); dummy.scale.setScalar(sz * 0.45); dummy.updateMatrix();
      pips.setMatrixAt(pips.count, dummy.matrix); pips.setColorAt(pips.count, tmpC.setHex(tc)); pfa.setX(pips.count++, (e.locked ? 1 : 0.6) * fade);
      if (e.id === s.marked) {
        marked = true;
        markRing.position.set(e.x, gy + 0.3, e.z);
        markRing.rotation.y = clock * 2;
        markRing.scale.setScalar(sz * (1.3 + Math.sin(clock * 8) * 0.08));
        markEnd.setXYZ(1, e.x, y, e.z); markEnd.needsUpdate = true;
        markLine.computeLineDistances();
      }
      if (e.locked && nl < MAX_LOCKS) {
        dummy.position.set(e.x, y, e.z); dummy.quaternion.copy(camera.quaternion); dummy.scale.setScalar(sz * 0.9);
        dummy.updateMatrix();
        brackets.setMatrixAt(nl, dummy.matrix);
        brackets.setColorAt(nl, tmpC.setHex(e.id === s.marked ? 0xffffff : C.friend).multiplyScalar(e.id === s.marked ? 2 : 1.4));
        const r = Math.max(0, e.hp / e.maxHp);
        dummy.position.set(e.x, y + sz * 0.8 + 0.6, e.z).addScaledVector(camRight, -sz);
        dummy.scale.set(Math.max(0.01, sz * 2 * r), 1, 1);
        dummy.updateMatrix();
        hpBars.setMatrixAt(nb, dummy.matrix);
        hpBars.setColorAt(nb++, hpCol(r));
        lockLinePos.set([0, 2.2, 0, e.x, y, e.z], nl * 6);
        nl++;
      }
    }
    // Your damaged units get an HP bar too.
    for (const p of s.perim) {
      if (p.hp >= PAD_HP || nb >= MAX_LOCKS + 32) continue;
      const r = p.hp / PAD_HP;
      dummy.position.set(p.x, groundY(p.x, p.z) + 3.4, p.z).addScaledVector(camRight, -1.2); dummy.quaternion.copy(camera.quaternion);
      dummy.scale.set(Math.max(0.01, 2.4 * r), 1, 1); dummy.updateMatrix();
      hpBars.setMatrixAt(nb, dummy.matrix); hpBars.setColorAt(nb++, p.down ? tmpC.setHex(0x888888) : hpCol(r));
    }
    markRing.visible = markLine.visible = marked;
    brackets.count = nl; hpBars.count = nb;
    lockLines.geometry.setDrawRange(0, nl * 2);
    lockLines.geometry.attributes.position.needsUpdate = true;

    // Shots. PAC-3: hot dart with a short exhaust flare. IRIS-T / Stinger: a white airframe laying a smoke
    // trail that spreads and fades, so a homing turn stays readable. Guns: tracers. All climb to their target's height.
    shells.count = tracers.count = missiles.count = 0;
    for (const p of s.shots) {
      const tracer = p.kind === 'tracer', stinger = p.src === 'STINGER', y0 = tracer ? 1 : 1.6;
      let f = shotFx.get(p);
      if (!f) { // first frame: pick the launcher facing the shot, flash its muzzle
        const pts = p.src === 'PAC-3' ? pacPts : p.src === 'IRIS-T' ? irisPts : null;
        let o = [p.x, (tracer ? 1 : 1.1) + groundY(p.x, p.z), p.z];
        if (pts?.length) {
          const h = Math.atan2(p.vz, p.vx);
          let bd = Infinity;
          for (const q of pts) { const d = Math.abs(((Math.atan2(q[2], q[0]) - h + Math.PI) % TAU + TAU) % TAU - Math.PI); if (d < bd) { bd = d; o = q; } }
        }
        const t = byId.get(p.target);
        f = { ox: o[0] - p.x, oy: o[1] - y0, oz: o[2] - p.z, age: 0, d0: t ? Math.hypot(t.x - p.x, t.z - p.z) || 1 : 1, px: o[0], py: o[1], pz: o[2] };
        shotFx.set(p, f);
        if (!tracer) { shards(o[0], o[2], p.kind === 'shell' ? 5 : 4, C.flash, 4, 0.5, o[1], 1.5); puffs(o[0], o[1], o[2], p.kind === 'shell' ? 3 : 2, 0.9, 1.5, 0.75); }
      }
      if (play) f.age += dt;
      const blend = p.kind === 'shell' ? 0.25 : 0.6, u = Math.min(1, f.age / blend), k = (1 - u) * (1 - u) * (1 + 2 * u); // smoothstep out
      const t = byId.get(p.target), ty2 = t ? t.y : y0 + 3;
      const prog = t ? 1 - Math.min(1, Math.hypot(t.x - p.x, t.z - p.z) / f.d0) : Math.min(1, f.age);
      const x = p.x + f.ox * k, y = y0 + (ty2 - y0) * prog + f.oy * k, z = p.z + f.oz * k;
      const dx = x - f.px, dy = y - f.py, dz = z - f.pz, moved = dx * dx + dy * dy + dz * dz > 1e-6;
      if (moved && !tracer) {
        if (p.kind === 'shell') beam(f.px, f.py, f.pz, x, y, z, 0.22, C.fire, 0.12, 1.5);
        else { // pale smoke that lingers and spreads, over a short hot flame at the motor
          smoke(f.px, f.py, f.pz, x, y, z, stinger ? 0.2 : 0.3, stinger ? 0.7 : 1.1);
          beam(f.px, f.py, f.pz, x, y, z, 0.16, C.fire, 0.07, 1.5);
        }
      }
      f.px = x; f.py = y; f.pz = z;
      const m = p.kind === 'shell' ? shells : tracer ? tracers : missiles;
      if (m.count >= MAX_SHOTS) continue;
      dummy.position.set(x, y, z);
      if (moved) dummy.lookAt(x + dx, y + dy, z + dz); else dummy.rotation.set(0, Math.atan2(p.vx, p.vz), 0);
      dummy.scale.setScalar(stinger ? 0.7 : 1);
      dummy.updateMatrix(); m.setMatrixAt(m.count, dummy.matrix);
      m.setColorAt(m.count++, tracer ? tmpC.setHex(0xffc861).multiplyScalar(2) : p.kind === 'shell' ? tmpC.setHex(C.flash).multiplyScalar(2) : tmpC.setHex(0xf2f2ea));
    }

    // salvage: tech glows white, a cache gold, the rest olive crates
    dropMesh.count = dropRing.count = dropBeam.count = 0;
    for (const d of s.drops) {
      const left = d.until - s.t, blink = left < 3 && Math.sin(clock * 18) < 0 ? 0.25 : 1, tech = d.k === 'tech', gy = groundY(d.x, d.z);
      const col = tech ? 0xffffff : d.k === 'cache' ? 0xe0b84a : 0x7d8a52, i = dropMesh.count++;
      dummy.position.set(d.x, gy + 1.3 + 0.3 * Math.sin(clock * 3 + d.id), d.z); dummy.rotation.set(0, clock * 1.5 + d.id, 0); dummy.scale.setScalar(tech ? 1.3 : 1);
      dummy.updateMatrix(); dropMesh.setMatrixAt(i, dummy.matrix); dropMesh.setColorAt(i, tmpC.setHex(col).multiplyScalar(blink * (tech ? 1.5 : 1)));
      dummy.position.set(d.x, gy + 0.2, d.z); dummy.rotation.set(0, -clock, 0); dummy.scale.setScalar(1.6 + 0.3 * Math.sin(clock * 5 + d.id));
      dummy.updateMatrix(); dropRing.setMatrixAt(i, dummy.matrix); dropRing.setColorAt(i, tmpC.setHex(0xffe9a8).multiplyScalar(1.2 * blink));
      dummy.position.set(d.x, gy, d.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 9, 1);
      dummy.updateMatrix(); dropBeam.setMatrixAt(i, dummy.matrix); dropBeam.setColorAt(i, tmpC.setHex(0xffe9a8).multiplyScalar(0.5 * blink));
    }

    // particles
    shardMesh.count = 0;
    for (let i = 0; i < MAX_SHARDS; i++) {
      if (sh.life[i] <= 0) continue;
      sh.life[i] -= dt;
      const r = Math.max(0, sh.life[i] / sh.max[i]), j = i * 3;
      sh.v[j + 1] -= 20 * dt;
      sh.p[j] += sh.v[j] * dt; sh.p[j + 1] += sh.v[j + 1] * dt; sh.p[j + 2] += sh.v[j + 2] * dt;
      const gy = groundY(sh.p[j], sh.p[j + 2]);
      if (sh.p[j + 1] < gy) { sh.p[j + 1] = gy; sh.v[j + 1] *= -0.3; sh.v[j] *= 0.5; sh.v[j + 2] *= 0.5; }
      dummy.position.set(sh.p[j], sh.p[j + 1], sh.p[j + 2]);
      dummy.rotation.set(i + clock * 7, i * 2 + clock * 5, 0);
      dummy.scale.setScalar(sh.size[i] * (0.3 + 0.7 * r));
      dummy.updateMatrix();
      shardMesh.setMatrixAt(shardMesh.count, dummy.matrix);
      shardMesh.setColorAt(shardMesh.count++, tmpC.setRGB(sh.col[j] * r, sh.col[j + 1] * r, sh.col[j + 2] * r));
    }
    puffMesh.count = 0;
    const pa = fadeAttr(puffMesh);
    for (let i = 0; i < MAX_PUFFS; i++) {
      if (pf.life[i] <= 0) continue;
      if (play) { pf.life[i] -= dt; pf.p[i * 3 + 1] += dt * 1.2; pf.p[i * 3] += dt * 0.6; } // rises and drifts with the wind
      const r = Math.max(0, pf.life[i] / pf.max[i]);
      dummy.position.set(pf.p[i * 3], pf.p[i * 3 + 1], pf.p[i * 3 + 2]); dummy.rotation.set(i, i * 2, 0);
      dummy.scale.setScalar(pf.r[i] * (1.6 - r));
      dummy.updateMatrix();
      puffMesh.setMatrixAt(puffMesh.count, dummy.matrix);
      puffMesh.setColorAt(puffMesh.count, tmpC.setScalar(pf.c[i] * (0.4 + 0.6 * (1 - night))));
      pa.setX(puffMesh.count++, r * r);
    }
    waveMesh.count = 0;
    for (let i = 0; i < MAX_WAVES; i++) {
      if (wv.life[i] <= 0) continue;
      wv.life[i] -= dt;
      const r = Math.max(0, wv.life[i] / wv.max[i]), j = i * 3;
      dummy.position.set(wv.x[i], wv.y[i], wv.z[i]); dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(Math.max(0.01, wv.r[i] * (1 - r * r)));
      dummy.updateMatrix();
      waveMesh.setMatrixAt(waveMesh.count, dummy.matrix);
      waveMesh.setColorAt(waveMesh.count++, tmpC.setRGB(wv.col[j] * r, wv.col[j + 1] * r, wv.col[j + 2] * r));
    }
    // Beams and trails hold still while the game is paused, like the blips.
    beamMesh.count = smokeMesh.count = 0;
    const sa = fadeAttr(smokeMesh);
    for (let i = 0; i < MAX_BEAMS; i++) {
      if (bm.life[i] <= 0) continue;
      if (play) bm.life[i] -= dt;
      const r = Math.max(0, bm.life[i] / bm.max[i]), j = i * 6, c = i * 3, a = bm.a;
      dir.set(a[j + 3] - a[j], a[j + 4] - a[j + 1], a[j + 5] - a[j + 2]);
      const len = dir.length();
      if (len < 1e-4) continue;
      const w = bm.w[i] * (bm.grow[i] ? 1 + 2 * (1 - r) : 0.35 + 0.65 * r);
      dummy.position.set(a[j], a[j + 1], a[j + 2]);
      dummy.quaternion.setFromUnitVectors(X, dir.divideScalar(len));
      dummy.scale.set(len, w, w);
      dummy.updateMatrix();
      if (bm.grow[i]) {
        smokeMesh.setMatrixAt(smokeMesh.count, dummy.matrix);
        smokeMesh.setColorAt(smokeMesh.count, tmpC.setScalar(0.85 - 0.5 * night)); sa.setX(smokeMesh.count++, r * r);
      } else {
        beamMesh.setMatrixAt(beamMesh.count, dummy.matrix);
        beamMesh.setColorAt(beamMesh.count++, tmpC.setRGB(bm.col[c] * r, bm.col[c + 1] * r, bm.col[c + 2] * r));
      }
    }
    frontMesh.count = 0;
    for (let i = 0; i < MAX_FRONTS; i++) {
      if (fr.max[i] <= 0) continue;
      if (play) fr.t[i] += dt;
      const d = fr.t[i] * 160;
      if (d >= fr.max[i]) { fr.max[i] = 0; continue; }
      if (d < 1) continue; // still waiting its turn
      dummy.position.set(fr.x[i], fr.y[i] + 2 * d / fr.max[i], fr.z[i]); dummy.rotation.set(0, -fr.a[i], 0); dummy.scale.setScalar(d);
      dummy.updateMatrix();
      frontMesh.setMatrixAt(frontMesh.count, dummy.matrix);
      frontMesh.setColorAt(frontMesh.count++, tmpC.setHex(0x9fe8ff).multiplyScalar(1.5 * (1 - d / fr.max[i])));
    }
    blipMesh.count = 0;
    for (let i = 0; i < MAX_BLIPS; i++) {
      if (bl.life[i] <= 0) continue;
      if (play) bl.life[i] -= dt;
      const r = Math.max(0, bl.life[i] / bl.max[i]);
      dummy.position.set(bl.x[i], groundY(bl.x[i], bl.z[i]) + 0.2, bl.z[i]); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(bl.r[i] * (0.6 + 0.4 * r));
      dummy.updateMatrix();
      blipMesh.setMatrixAt(blipMesh.count, dummy.matrix);
      blipMesh.setColorAt(blipMesh.count++, tmpC.setHex(C.friend).multiplyScalar(0.35 * r * r));
    }

    // Upload only the instances in use: the pools are sized for the worst case, and re-sending every
    // buffer in full each frame (a few MB) is most of the GPU traffic in a quiet scene.
    for (const m of pools) {
      const n = m.count, was = sent.get(m) ?? -1;
      if (n === 0 && was === 0) continue; // still empty: nothing to send
      sent.set(m, n);
      const fa = m.geometry.getAttribute('fade') as THREE.InstancedBufferAttribute | undefined;
      for (const [a, k] of [[m.instanceMatrix, 16], [m.instanceColor, 3], [fa, 1]] as const) {
        if (!a) continue;
        a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(n, 1) * k); a.needsUpdate = true;
      }
    }
    grade.uniforms.time.value = clock; grade.uniforms.nvg.value = night;
    const blind = s.phase !== 'play' && s.phase !== 'pause' ? 0 : s.t < s.radarDownUntil ? 1 : s.emcon ? 0.3 : 0;
    grade.uniforms.blind.value += (blind - grade.uniforms.blind.value) * Math.min(1, dt * 6);
    composer.render(dt);
  }
  function smoke(x: number, y: number, z: number, x2: number, y2: number, z2: number, w: number, life: number) { beam(x, y, z, x2, y2, z2, w, 0xffffff, life, 1, 1); }

  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), v = new THREE.Vector3(), ndc = new THREE.Vector2();
  const clampTarget = () => { const r = Math.hypot(tx, tz), max = 45; if (r > max) { tx *= max / r; tz *= max / r; } };
  // Screen point → ground: intersect a level plane, then walk it onto the terrain height there.
  function pick(cx: number, cy: number) {
    ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    plane.constant = 0;
    for (let i = 0; i < 4; i++) {
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      plane.constant = -groundY(hit.x, hit.z);
    }
    return { x: hit.x, z: hit.z };
  }
  function project(x: number, z: number, y = 1.5) {
    v.set(x, y + groundY(x, z), z).project(camera);
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight] as const;
  }
  return {
    render,
    pick, project,
    rotate: (d: number) => { yaw += d; },
    inset: (top: number, bottom: number) => { inTop = top; inBot = bottom; },
    zoomBy: (f: number) => { dist = Math.min(150, Math.max(28, dist / f)); },
    // Pan by screen pixels (drag) or by world metres along the view (keys): the target slides over the ground.
    // Pixels: the ground follows the pointer (dx right, dy down). Metres: dx right, dy forward.
    pan(dx: number, dy: number, pixels = true) {
      const k = 2 * dist * Math.tan(camera.fov * Math.PI / 360) / innerHeight;
      const right = pixels ? -dx * k : dx, fwd = pixels ? dy * k / Math.sin(PITCH) : dy;
      tx += right * Math.sin(yaw) - fwd * Math.cos(yaw);
      tz += -right * Math.cos(yaw) - fwd * Math.sin(yaw);
      clampTarget();
    },
    lookAt: (x: number, z: number) => { tx = x; tz = z; clampTarget(); },
    hover: (cx: number | null, cy = 0) => { hover = cx === null ? null : pick(cx, cy); },
    // The visible contact drawn nearest a screen point (within ~30 px): aircraft fly above their ground position.
    pickContact(s: State, cx: number, cy: number) {
      let best: { x: number; z: number } | null = null, bd = 30 * 30;
      for (const e of s.enemies) {
        if (!visible(s, e)) continue;
        const [px, py] = project(e.x, e.z, altitude(e.kind, e.x, e.z)), d = (px - cx) ** 2 + (py - cy) ** 2;
        if (d < bd) { bd = d; best = { x: e.x, z: e.z }; }
      }
      return best;
    },
    toggleCoverage: () => (showCov = !showCov),
    cameraYaw: () => yaw,
    target: () => ({ x: tx, z: tz }),
  };
}
