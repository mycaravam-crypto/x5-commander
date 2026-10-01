import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARENA_R, BASE_R, BUILD_MIN, DROP_MAX, PERF, ENEMIES, MUNITIONS, EW_ARC, FRONT, FRONT_ARC, VISUAL_R, KINDS, PAL, FANS, GUNS, MG_TIERS, PERIM, BIG_KILLS, GROUND, altitude, flightAlt, buildR, groundZone, type EnemyKind, type PerimKind } from './config.ts';
import { building as inBuildWindow, emitting, focusBearing, flankArc, radarRange, radarSector, bestSpot, spotNear, selectedPad, coverage, padStats, padHp, fanOf, phase, shownKind, visible, type Enemy, type Pad, type Shot, type State } from './sim.ts';
import { heightSampler, treeList, ROCKS, FARMS, WATER_Y, mapSeed } from './terrain.ts';
import { paintTerrain } from './terrainPaint.ts';
import { enemyGeos, GAIT, MUZZLES, ROTORS } from './models.ts';

// Phones and tablets get a lighter pipeline: no real-time shadows (the ground has them baked in), no bloom,
// a smaller ground texture and mesh, a capped pixel ratio and smaller effect pools (PERF.lite). The full one is
// several times the GPU memory and fill rate, and was enough to lose the WebGL context on phones.
const LITE = matchMedia('(pointer: coarse)').matches || innerWidth * innerHeight < 800 * 600;
const L = PERF.lite;
const MAX_ENEMIES = 2000, MAX_LOCKS = 64, MAX_SHOTS = 600, MAX_WAVES = 64, MAX_FRONTS = 48;
const MAX_WRECKS = LITE ? L.wrecks : 48, MAX_FIRES = LITE ? L.fires : 24, MAX_SHARDS = LITE ? L.shards : 2500, MAX_BEAMS = LITE ? L.beams : 3000;
const MAX_BLIPS = LITE ? L.blips : 1024, MAX_PUFFS = LITE ? L.puffs : 600, MAX_BOLTS = LITE ? 300 : 1200;
const VIS = 1.6; // enemies drawn bigger than their hitbox so they read at a glance
const PAD_VIS = 1.35; // emplacements too
const TAU = Math.PI * 2;
const angDiff = (a: number, b: number) => ((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI;
const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
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
// Walk cycle for the robots on foot, in the vertex shader (models.ts rigs their limbs): per instance, `gait` is
// (where it is in its stride, radians; hip swing, radians; knee fold x swing). Each leg swings at the hip, folds its
// knee through the forward swing (foot up) and keeps its foot level; arms swing against their own side's leg.
// Applied to the shadow pass too, so the shadows walk with them.
const GAIT_GLSL = `
  if (legA.y > 0.5) {
    float ph = gait.x + legA.x, sw = gait.y * sin(ph);
    if (legA.y > 3.5) transformed.xy = legP.xy + rot2(-0.8 * sw) * (transformed.xy - legP.xy);
    else {
      float up = max(0.0, cos(ph)), kn = -gait.y * gait.z * up * up;
      if (legA.y > 2.5) transformed.xy = legA.zw + rot2(-(sw + kn)) * (transformed.xy - legA.zw);
      if (legA.y > 1.5) transformed.xy = legP.zw + rot2(kn) * (transformed.xy - legP.zw);
      transformed.xy = legP.xy + rot2(sw) * (transformed.xy - legP.xy);
    }
  }`;
function walking<M extends THREE.Material>(m: M) {
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute vec4 legA;\nattribute vec4 legP;\nattribute vec3 gait;\nmat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }\n'
      + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + GAIT_GLSL);
  };
  m.customProgramCacheKey = () => 'walking';
  return m;
}
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
  recon: 0x8a8f86, ka52: 0x46503a, hyper: 0xdcdcd2, mald: 0xbabdb5, su25: 0x6b7560, rocket: 0xcfcabb, sead: 0x8994a0, arm2: 0xe6e2d6,
  halo: 0x5a6148, backfire: 0x9aa3a8, okhotnik: 0x3c4148, mainstay: 0xa8adb0,
  walker: 0x7a7d70, gunbot: 0x5d6552, mech: 0x4c5046, crawler: 0x8a8576, dog: 0x6a6e66, sapper: 0x7d7461, arty: 0x66705a, titan: 0x55584a,
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
  const bloom = coarse ? null : new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.35, 0.92);
  if (bloom) composer.addPass(bloom);
  // Bloom is the costliest pass: if frames stay slow through play (PERF.bloomOff), it goes for the session.
  let frameMs = 1000 / 60, slowFor = 0;
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
    zoneKey = flankKey = -1; ringR.clear(); baseKey = decorKey = covKey = ghostKey = hintKey = '';
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
  // Launching stations (PAC-3 'pac<i>', IRIS-T 'iris<i>') each pick their own contact, favouring their own sector
  // and ones nobody else is on, and traverse at a crew's pace. `home` is the azimuth it stows facing.
  let launchers: { key: string; x: number; z: number; home: number }[] = [];
  const lst = new Map<string, { cur: number; vel: number; tgt: number; hold: number; idle: number; cue: number; cueT: number; spd: number }>();
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
  // ---- the compound: dressing that grows with the base level, merged per paint into a few meshes ----
  // Perimeter: sandbag positions (lv1-2), a full earth berm (3-4), HESCO bastions (5-6), concrete T-walls (7+), open
  // to the supply road at the rear (+z). Around it the camp digs in: tents, cables and floodlights, a flag, gate
  // towers, hardstands under the launchers, then containers and a concrete apron.
  let decor = new THREE.Group(), decorKey = '';
  function buildDecor(s: State) {
    const L = Math.min(7, s.level), nPac = s.st.weapons.cannon ? Math.min(8, s.level + 1) : 0, nIris = Math.min(4, s.lv.missile ?? 0);
    const key = `${L}${s.st.radar}${nPac}${nIris}`;
    if (key === decorKey) return;
    decorKey = key;
    scene.remove(decor);
    decor.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    decor = new THREE.Group();
    const parts = new Map<number, THREE.BufferGeometry[]>();
    // A part in local space (+x out, z along), turned by ry and set down at (x, y, z).
    const put = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, ry = 0) => {
      geo.rotateY(ry).translate(x, y, z);
      let l = parts.get(color); if (!l) parts.set(color, l = []); l.push(geo);
    };
    const polar = (r: number, a: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r];
    const pyramid = (w: number, h: number, d: number) => new THREE.CylinderGeometry(0.01, 0.71, 1, 4, 1).rotateY(Math.PI / 4).scale(w, h, d).translate(0, h / 2, 0);
    const SAND = 0xa08c60, EARTH = 0x8a7a55, HESCO = 0xb09a6a, WOOD = 0x6b5a40, NET = 0x4a5530, TENT = 0x5d6340, CAN = 0x55603a;
    const gateW = L >= 5 ? 0.2 : 0.25, gate = (a: number) => Math.abs(angDiff(a, Math.PI / 2)) < gateW;

    // Perimeter.
    const ring = (n: number, f: (a: number, i: number) => void) => { for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * TAU; if (!gate(a)) f(a, i); } };
    if (L <= 2) ring(28, (a, i) => { // scattered sandbag positions, gaps between
      if (i % 3 === 2) return;
      const [x, z] = polar(10.4, a);
      put(box(0.8, 0.45, 2).translate(0, 0.22, 0), SAND, x, 0, z, -a);
      if (i % 3 === 0) put(box(0.6, 0.3, 1.4).translate(0, 0.6, 0), SAND, x, 0, z, -a);
    });
    else if (L <= 4) ring(28, (a) => {
      const [x, z] = polar(10.4, a);
      put(new THREE.CylinderGeometry(0.5, 0.9, 0.7, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 2.6 / 1.27).translate(0, 0.3, 0), EARTH, x, 0, z, -a);
    });
    else if (L <= 6) ring(52, (a, i) => { // HESCO: sand-filled mesh cages with concertina wire on top
      const [x, z] = polar(10.4, a);
      put(box(1.1, 1.4, 1.2).translate(0, 0.7, 0), HESCO, x, 0, z, -a);
      put(box(1.14, 0.08, 1.24).translate(0, 1.4, 0), EARTH, x, 0, z, -a);
      for (const dz of [-0.4, 0, 0.4]) put(new THREE.TorusGeometry(0.2, 0.02, 3, 8).translate(0, 1.65, dz + (i % 2) * 0.1), C.dark, x, 0, z, -a);
    });
    else ring(60, (a) => { // T-walls
      const [x, z] = polar(10.4, a);
      put(box(1.2, 0.3, 1.05).translate(0, 0.15, 0), C.concrete, x, 0, z, -a);
      put(box(0.32, 2.3, 1.05).translate(0, 1.4, 0), C.concrete, x, 0, z, -a);
    });

    // Supply road out through the gate: dirt, then gravel, then asphalt.
    const road = L >= 7 ? 0x3b3c38 : L >= 6 ? 0x8f8a7c : 0x7a6848;
    for (let z = 8; z < 30; z += 2) put(box(L >= 6 ? 2.4 : 2, 0.08, 2.05), road, 0, groundY(0, z + 1) + 0.04, z + 1);
    if (L >= 7) put(new THREE.CylinderGeometry(5, 5, 0.06, 40), 0x9a978d, 0, 0.03, 0); // concrete apron under the radar group

    // Living area either side of the road: tents, then tents and containers, then containers.
    const tent = (x: number, z: number, ry: number) => {
      put(pyramid(2.2, 1.4, 1.8), TENT, x, 0, z, ry);
      put(box(0.05, 0.6, 0.5).translate(1.0, 0.3, 0), C.dark, x, 0, z, ry); // door flap
    };
    const container = (x: number, z: number, ry: number, bags: boolean) => {
      put(box(2.4, 1.1, 1.1).translate(0, 0.55, 0), CAN, x, 0, z, ry);
      for (let i = -3; i <= 3; i++) put(box(0.04, 1, 1.12).translate(i * 0.33, 0.55, 0), 0x464f30, x, 0, z, ry); // ribs
      put(box(0.05, 0.9, 0.9).translate(1.21, 0.5, 0), 0x3d452a, x, 0, z, ry); // doors
      if (bags) put(box(2.2, 0.3, 1).translate(0, 1.25, 0), SAND, x, 0, z, ry);
    };
    if (L <= 4) { tent(-4.5, 8.2, 0.2); tent(4.8, 7.8, -0.3); }
    else if (L <= 5) { tent(-4.5, 8.2, 0.2); container(4.9, 7.7, -0.35, false); }
    else { container(-4.7, 8, 0.25, true); container(4.9, 7.7, -0.35, true); }
    if (L >= 3 && L <= 5) tent(-6.3, 5.9, 0.8);
    else if (L >= 6) container(-6.3, 5.9, 0.8, L >= 7);
    if (L >= 6) { // satcom dish on the command container
      put(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 5), C.metal, -4.7, 1.6, 8);
      put(new THREE.SphereGeometry(0.45, 10, 5, 0, TAU, 0, 1.1).scale(1, 0.5, 1).rotateZ(0.9), C.metal, -4.7, 1.95, 8);
    }

    // Supply dump behind the radar: crates and jerrycans, a camo net over them once the camp settles.
    for (const [x, z, y] of [[-0.6, -4.6, 0], [0.4, -4.7, 0], [-0.1, -5.4, 0], [-0.2, -4.7, 0.5]]) put(box(0.7, 0.5, 0.55).translate(0, 0.25, 0), 0x6a5a3a, x, y, z);
    for (let i = 0; i < 5; i++) put(box(0.18, 0.4, 0.3).translate(0, 0.2, 0), 0x3f4a2c, 0.9, 0, -4.4 - i * 0.24);
    if (L >= 3) {
      put(pyramid(3.2, 0.5, 2.6), NET, 0, 1.3, -4.9);
      for (const [x, z] of [[-1.2, -3.9], [1.2, -3.9], [-1.2, -5.9], [1.2, -5.9]]) put(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 4), WOOD, x, 0.7, z);
    }

    // Lv2: power cables from the generators out to the radar and every launching station, and fuel for them.
    if (L >= 2) {
      const cable = (x0: number, z0: number, x1: number, z1: number) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        put(box(len, 0.05, 0.07), 0x1d1f19, (x0 + x1) / 2, 0.03, (z0 + z1) / 2, -Math.atan2(z1 - z0, x1 - x0));
      };
      const [gx, gz] = polar(3.6, slot(1, 6, 0.3));
      if (s.st.radar) cable(gx, gz, 0, 0);
      for (let i = 0; i < nPac; i++) { const a = slot(i, 8, TAU / 16), [x, z] = polar(5.1, a); cable(gx * 0.8, gz * 0.8, x, z); }
      const fuel = L >= 7 ? 0x6a6a60 : 0x2c2e26, [fx, fz] = polar(8.3, -0.61);
      if (L >= 7) { // bunded tank
        put(new THREE.CylinderGeometry(0.55, 0.55, 2, 12).rotateZ(Math.PI / 2), fuel, fx, 0.7, fz, 0.61);
        put(box(2.6, 0.4, 1.6).translate(0, 0.2, 0), C.concrete, fx, 0, fz, 0.61);
      } else put(new THREE.SphereGeometry(0.85, 12, 6).scale(1.3, 0.3, 1), fuel, fx, 0.2, fz, 0.61);
      // Floodlight masts (from lv7 the flank towers carry two of them)
      for (const a of L >= 7 ? [TAU / 16, TAU * 7 / 16] : [TAU / 16, TAU * 7 / 16, TAU * 9 / 16, TAU * 15 / 16]) {
        const [x, z] = polar(8.8, a);
        put(new THREE.CylinderGeometry(0.05, 0.08, 3.4, 5), C.metal, x, 1.7, z);
        put(box(0.25, 0.25, 0.6).translate(-0.15, 3.4, 0), 0xfff1c0, x, 0, z, -a);
      }
    }
    // Lv3: the unit flag by the gate.
    if (L >= 3) {
      put(new THREE.CylinderGeometry(0.04, 0.05, 4, 5), C.metal, -1.8, 2, 8.4);
      put(box(0.9, 0.55, 0.03).translate(0.47, 3.65, 0), 0xa83a2e, -1.8, 0, 8.4);
    }
    // Lv4: gate towers and a barrier; hardstands under the launching stations.
    if (L >= 4) {
      for (const x of [-2.2, 2.2]) {
        if (L >= 7) put(box(1.3, 3.2, 1.3).translate(0, 1.6, 0), C.concrete, x, 0, 11);
        else for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) put(box(0.1, 3, 0.1).translate(dx, 1.5, dz), WOOD, x, 0, 11);
        put(box(1.4, 0.15, 1.4).translate(0, 3.1, 0), L >= 7 ? C.concrete : WOOD, x, 0, 11);
        for (const s2 of [-1, 1]) { put(box(1.4, 0.5, 0.15).translate(0, 3.4, s2 * 0.62), SAND, x, 0, 11); put(box(0.15, 0.5, 1.1).translate(s2 * 0.62, 3.4, 0), SAND, x, 0, 11); }
        put(pyramid(1.7, 0.5, 1.7), TENT, x, 4.1, 11);
        for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) put(box(0.06, 0.5, 0.06).translate(dx, 3.9, dz), WOOD, x, 0, 11);
      }
      put(box(0.2, 1.1, 0.2).translate(0, 0.55, 0), C.dark, -1.35, 0, 10.6);
      for (let i = 0; i < 6; i++) put(box(0.42, 0.1, 0.1), i % 2 ? 0xe8e4d8 : 0xa83a2e, -1.05 + i * 0.42, 1, 10.6);
      const pad = L >= 6 ? 0x9a978d : 0x8f8a7c;
      for (let i = 0; i < nPac; i++) { const a = slot(i, 8, TAU / 16), [x, z] = polar(6.4, a); put(box(4.2, 0.06, 2.2), pad, x, 0.03, z, -a); }
      for (let i = 0; i < nIris; i++) { const a = slot(i, 4), [x, z] = polar(9, a); put(box(4, 0.06, 2.2), pad, x, 0.03, z, -a); }
    }
    // Lv7: two more towers on the flanks.
    if (L >= 7) for (const a of [TAU * 9 / 16, TAU * 15 / 16]) {
      const [x, z] = polar(9.3, a);
      put(box(1.2, 3.4, 1.2).translate(0, 1.7, 0), C.concrete, x, 0, z, -a);
      put(box(1.4, 0.4, 1.4).translate(0, 3.6, 0), C.concrete, x, 0, z, -a);
      put(box(0.05, 0.3, 0.8).translate(0.61, 2.9, 0), 0x1c2a33, x, 0, z, -a); // firing slit
      put(box(0.25, 0.25, 0.6).translate(-0.4, 3.95, 0), 0xfff1c0, x, 0, z, -a);
    }

    for (const [color, geos] of parts) {
      const m = new THREE.Mesh(mergeGeometries(geos), mat(color));
      m.castShadow = m.receiveShadow = true; decor.add(m);
      for (const g of geos) g.dispose();
    }
    scene.add(decor);
  }

  function buildBase(s: State) {
    scene.remove(base);
    base = new THREE.Group(); aimers.length = sweepers.length = 0; pacPts = []; irisPts = []; launchers = [];
    buildDecor(s);
    const L = s.level, W = s.st.weapons, R1 = 3.6, R2 = 6.4, R3 = 9;

    // Before the radar is bought: a dug-in command post with a field mast, center.
    if (!s.st.radar) {
      solid(box(2.2, 0.9, 1.8), C.sand, 0, 0.45, 0, base);
      solid(box(1.2, 0.5, 1), MID, 0.2, 1.15, 0, base);
      solid(new THREE.CylinderGeometry(0.04, 0.06, 2.6, 5), C.dark, -0.7, 2.2, 0.5, base);
    }
    // A ground assault's base holds a line: a HESCO wall across its front with firing steps, and a sandbagged
    // bunker either side, facing north where everything comes from.
    if (s.ground) {
      for (let x = -13; x <= 13; x += 1.3) {
        const z = -8.6 - 0.02 * x * x, h = Math.abs(x) < 2 ? 0 : 1.1; // a gap on the road for the gate
        if (h) solid(box(1.2, h, 1.2), 0x9a8a62, x, h / 2, z, base);
      }
      for (const x of [-9, 9]) { solid(box(2.4, 0.9, 1.8), C.sand, x, 0.45, -7, base); solid(box(2.6, 0.2, 2), C.dark, x, 0.95, -7, base); solid(box(0.9, 0.18, 0.1), C.dark, x, 0.75, -7.95, base); }
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
      aimers.push([canisters(g, 2, 2, 2.6, 0.5, 0.66, 0.1), ry, `pac${i}`]);
      pacPts.push([Math.cos(a) * R2, 2.4, Math.sin(a) * R2]);
      launchers.push({ key: `pac${i}`, x: Math.cos(a) * R2, z: Math.sin(a) * R2, home: a });
      if (L >= 5) solid(box(0.5, 0.8, 3).rotateY(ry), 0x8a7a55, Math.cos(a) * (R2 + 2.4), 0.35, Math.sin(a) * (R2 + 2.4)); // earth berm
    }
    // IRIS-T SLX launchers: 8 canisters, steep launch, one per upgrade level (max 4).
    for (let i = 0; i < Math.min(4, s.lv.missile ?? 0); i++) {
      const a = slot(i, 4), ry = radial(a), g = vehicle(R3, a, 2.6, ry);
      aimers.push([canisters(g, 2, 4, 2.2, 0.32, 1.05, 0.2), ry, `iris${i}`]);
      irisPts.push([Math.cos(a) * R3, 2.7, Math.sin(a) * R3]);
      launchers.push({ key: `iris${i}`, x: Math.cos(a) * R3, z: Math.sin(a) * R3, home: a });
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
      } else if (p.k === 'wire') { // concertina wire: coils strung across the approach between pickets
        for (let i = 0; i < 6; i++) solid(new THREE.TorusGeometry(0.28, 0.025, 4, 12), C.metal, 0.7, 0.32, -1.1 + i * 0.44, g);
        for (const z of [-1.2, 0, 1.2]) solid(box(0.05, 0.8, 0.05), 0x6b5a40, 0.7, 0.4, z, g);
      } else if (p.k === 'mines') { // Claymores: curved faces out, on their little legs, firing wire back to the pit
        for (const z of [-0.6, 0, 0.6]) {
          solid(new THREE.CylinderGeometry(0.5, 0.5, 0.14, 8, 1, true, -0.35, 0.7).rotateY(Math.PI / 2 + Math.PI), C.olive, 0.3, 0.3, z, g);
          solid(box(0.03, 0.2, 0.2), C.dark, 0.75, 0.12, z, g);
        }
        solid(box(0.7, 0.02, 0.02), C.dark, 0.35, 0.22, 0, g);
      } else if (p.k === 'gmg') { // Mk 19 on its tripod in a sandbag ring: a fat short barrel and the ammo can
        solid(new THREE.TorusGeometry(0.72, 0.2, 5, 10).rotateX(Math.PI / 2), C.sand, 0, 0.35, 0, g);
        const t = group(g, 0, 0.55, 0); aimers.push([t, ry, `pad${p.slot}`]);
        solid(box(0.55, 0.28, 0.3), MID, 0.05, 0.12, 0, t);
        solid(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6).rotateZ(Math.PI / 2), C.dark, 0.55, 0.15, 0, t);
        solid(box(0.25, 0.22, 0.2), 0x6a5a3a, -0.1, 0.1, 0.27, t);
      } else if (p.k === 'javelin') { // Javelin team: the launch tube on its command launch unit, raised a little
        solid(new THREE.TorusGeometry(0.72, 0.2, 5, 10).rotateX(Math.PI / 2), C.sand, 0, 0.35, 0, g);
        const t = group(g, 0, 0.6, 0); aimers.push([t, ry, `pad${p.slot}`]);
        const tube = group(t, 0, 0.1, 0); tube.rotation.z = 0.2;
        solid(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8).rotateZ(Math.PI / 2), C.olive, 0.2, 0.08, 0, tube);
        solid(box(0.3, 0.2, 0.22), C.dark, 0.1, -0.1, 0.16, tube); // CLU with its thermal sight
      } else if (p.k === 'mortar') { // M120: a baseplate, the tube steep up toward the target, its bipod
        const t = group(g, 0, 0.25, 0); aimers.push([t, ry, `pad${p.slot}`]);
        solid(new THREE.CylinderGeometry(0.45, 0.5, 0.1, 10), C.dark, 0, 0, 0, t);
        const tube = group(t, -0.1, 0.05, 0); tube.rotation.z = -0.55;
        solid(new THREE.CylinderGeometry(0.09, 0.1, 1.6, 8).translate(0, 0.8, 0), C.olive, 0, 0, 0, tube);
        for (const z of [-0.25, 0.25]) solid(new THREE.CylinderGeometry(0.025, 0.025, 1).rotateX(z > 0 ? -0.35 : 0.35), C.dark, 0.45, 0.45, z, t);
        for (const [x, z] of [[-0.7, -0.5], [-0.7, 0.5]]) solid(box(0.35, 0.3, 0.3), 0x6a5a3a, x, 0.15, z, g); // ammo boxes
      } else if (p.k === 'rws30') { // XM813: a squat remote turret on its pedestal, the 30mm chain gun, a sight box
        const t = group(g, 0, 0.3, 0); aimers.push([t, ry, `pad${p.slot}`]);
        solid(new THREE.CylinderGeometry(0.3, 0.4, 0.4, 8), C.olive, 0, 0.2, 0, t);
        solid(box(0.8, 0.4, 0.6), C.olive, 0.05, 0.55, 0, t);
        solid(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 6).rotateZ(Math.PI / 2), C.dark, 1.15, 0.6, 0, t);
        solid(box(0.25, 0.25, 0.2), C.dark, 0.2, 0.85, 0.3, t);
      } else if (p.k === 'hel') { // LOCUST: a trailer with a power pack and the beam director's turret on a post
        solid(box(1.6, 0.4, 1), C.olive, 0, 0.35, 0, g); solid(box(0.6, 0.5, 0.8), C.dark, -0.5, 0.8, 0, g);
        const t = group(g, 0.35, 0.9, 0); aimers.push([t, ry, `pad${p.slot}`]);
        solid(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 10).rotateX(Math.PI / 2), MID, 0, 0.2, 0, t);
        solid(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 10).rotateZ(Math.PI / 2), HOT, 0.25, 0.2, 0, t);
      } else if (p.k === 'hpm') { // Leonidas: a container, and the flat square array on its mount, aimed down its cone
        solid(box(1.8, 0.8, 1), C.olive, -0.2, 0.5, 0, g);
        const t = group(g, 0.5, 1, 0); aimers.push([t, ry, `pad${p.slot}`]);
        const face = group(t, 0.2, 0.4, 0); face.rotation.z = 0.25;
        solid(box(0.12, 0.9, 0.9), BRIGHT, 0, 0, 0, face); solid(box(0.03, 0.8, 0.8), HOT, 0.07, 0, 0, face);
      } else if (p.k === 'rockets') { // Hydra pod: a box of 19 tubes on a raised launcher frame
        const t = group(g, 0, 0.35, 0); aimers.push([t, ry, `pad${p.slot}`]);
        const pod = group(t, 0, 0.35, 0); pod.rotation.z = 0.5;
        solid(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 10).rotateZ(Math.PI / 2), C.olive, 0, 0.1, 0, pod);
        solid(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 10).rotateZ(Math.PI / 2), C.dark, 0.61, 0.1, 0, pod);
        for (const z of [-0.3, 0.3]) solid(box(0.08, 0.5, 0.08), C.dark, 0, 0, z, t);
      } else {
        solid(new THREE.CylinderGeometry(0.05, 0.07, 2.4, 5), C.metal, 0, 1.4, 0, g);
        const head = group(g, 0, 2.6, 0); sweepers.push([head, ry]);
        solid(new THREE.ConeGeometry(0.45, 0.3, 8, 1, true).rotateZ(Math.PI / 2), HOT, 0.2, 0, 0, head);
      }
      fitted(p, g);
      if (!aimT.has(`pad${p.slot}`)) aimT.set(`pad${p.slot}`, p.a); // new guns stand facing out
      if (!GUNS.includes(p.k) && p.k !== 'mines') continue;
      const out = p.slot === s.selected ? picked : fan;
      fanPts(out, fanOf(p), p.x, p.z, p.a, padStats(s, p).range);
    }
    for (const [pts, color, opacity] of [[fan, 0xffffff, 0.22], [picked, C.friend, 0.9]] as const) if (pts.length) {
      const l = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), lineMat(color, opacity));
      l.renderOrder = 2; base.add(l);
    }
    scene.add(base);
  }
  // What a unit is fitted with (ground assault) shows on it: armour plates on the pit, a thermal sight or a radar
  // panel on a mast, chevrons for its tier.
  function fitted(p: Pad, g: THREE.Object3D) {
    const m = p.mods ?? {};
    if (m.KIT === 'plates') for (const a of [0.5, 1.6, 2.6, 3.7, 4.7, 5.8]) solid(box(0.12, 0.5, 0.6).rotateY(-a), 0x5b604c, Math.cos(a) * 1.15, 0.3, Math.sin(a) * 1.15, g);
    if (m.SENSOR === 'gsr') { solid(new THREE.CylinderGeometry(0.03, 0.04, 1.8, 5), C.metal, -0.6, 1, -0.6, g); solid(box(0.08, 0.35, 0.5), BRIGHT, -0.55, 1.95, -0.6, g); }
    else if (m.SENSOR === 'flir' || m.SENSOR === 'fcs') solid(box(0.22, 0.2, 0.22), m.SENSOR === 'flir' ? HOT : C.dark, -0.5, 0.75, 0.55, g);
    for (let i = 0; i < (p.k === 'mg' ? 0 : p.tier); i++) solid(box(0.08, 0.04, 0.35), 0xffe9a8, -1.05 - i * 0.14, 0.25, 0, g);
  }
  // Field of fire as ground segments: the arc at `r` (half-width `w`), and its edges out from the unit when it's not all round.
  function fanPts(out: number[], w: number, x: number, z: number, a: number, r: number) {
    const n = Math.ceil(w * 12), y = (px: number, pz: number) => groundY(px, pz) + 0.15;
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
  const walkMat = walking(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })), walkDepth = walking(new THREE.MeshDepthMaterial());
  const gaits = {} as Partial<Record<EnemyKind, THREE.InstancedBufferAttribute>>;
  for (const k of KINDS) {
    const walks = !!GAIT[k] && !!GEOS[k].attributes.legA;
    if (walks) GEOS[k].setAttribute('gait', gaits[k] = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ENEMIES * 3), 3));
    const m = enemyMeshes[k] = instanced(GEOS[k], walks ? walkMat : enemyMat, MAX_ENEMIES); m.castShadow = true; scene.add(m);
    if (walks) m.customDepthMaterial = walkDepth;
  }
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
  // Walkers' rounds: glowing streaks flying from their gun muzzles to your unit (a hot core in a wider glow).
  const boltMesh = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0), additive(), MAX_BOLTS * 2);
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
  scene.add(shells, tracers, missiles, boltMesh, shardMesh, waveMesh, beamMesh, smokeMesh, puffMesh, frontMesh, blipMesh, jamMesh);
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
  const covMat = new THREE.MeshBasicMaterial({ map: covTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const covMesh = new THREE.Mesh(covGeo, covMat);
  covMesh.visible = false; covMesh.renderOrder = 1; scene.add(covMesh);
  // 0 off · 1 faint (a see-through layer to leave on) · 2 full
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
  // Walkers' rounds in flight: t counts up from -delay; dur 0 is a free slot.
  const bo = { a: new Float32Array(MAX_BOLTS * 6), t: new Float32Array(MAX_BOLTS), dur: new Float32Array(MAX_BOLTS), w: new Float32Array(MAX_BOLTS), len: new Float32Array(MAX_BOLTS), apex: new Float32Array(MAX_BOLTS), blast: new Float32Array(MAX_BOLTS), col: new Float32Array(MAX_BOLTS * 3), next: 0 };
  const bmShade = new Float32Array(MAX_BEAMS).fill(1); // smoke trails: 1 = pale motor smoke, lower = darker (burning wrecks)
  // hot: 0..1, how much of a fireball it starts as (glows orange, then cools to smoke).
  const pf = { p: new Float32Array(MAX_PUFFS * 3), r: new Float32Array(MAX_PUFFS), life: new Float32Array(MAX_PUFFS), max: new Float32Array(MAX_PUFFS), c: new Float32Array(MAX_PUFFS), hot: new Float32Array(MAX_PUFFS), next: 0 };
  // Shot-down aircraft falling out of the sky, tumbling and trailing smoke until they hit the ground.
  const wk = { kind: [] as EnemyKind[], p: new Float32Array(MAX_WRECKS * 3), v: new Float32Array(MAX_WRECKS * 3), rot: new Float32Array(MAX_WRECKS * 3), spin: new Float32Array(MAX_WRECKS * 3), size: new Float32Array(MAX_WRECKS), life: new Float32Array(MAX_WRECKS), emit: new Float32Array(MAX_WRECKS), next: 0 };
  // Where a wreck came down: burns a while, sending up a column of dark smoke.
  const fi = { x: new Float32Array(MAX_FIRES), z: new Float32Array(MAX_FIRES), r: new Float32Array(MAX_FIRES), life: new Float32Array(MAX_FIRES), emit: new Float32Array(MAX_FIRES), next: 0 };
  // Per-contact flight state for drawing: the sim turns on the spot between ticks; this eases the airframe round
  // (heading), banks it into turns, pitches it along its climb or dive, and remembers where its trail last left off.
  interface Flight { kind: EnemyKind; x: number; y: number; z: number; vx: number; vz: number; h: number; bank: number; pitch: number; hs: number; acc: number; tx: number; ty: number; tz: number; emit: number; frame: number; gait: number; amp: number; aim: number; aimT: number }
  const flights = new Map<number, Flight>();
  let frameNo = 0;
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
    for (const f of flights.values()) { const d = (f.x - x) ** 2 + (f.z - z) ** 2; if (d < bd) { bd = d; by = f.y; } }
    if (bd === 9) for (const e of s.enemies) { const d = (e.x - x) ** 2 + (e.z - z) ** 2; if (d < bd) { bd = d; by = groundY(e.x, e.z) + flightAlt(e); } }
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
  function puffs(x: number, y: number, z: number, n: number, r: number, life = 1.6, dark = 0.35, hot = 0) {
    for (let j = 0; j < n; j++) {
      const i = pf.next = (pf.next + 1) % MAX_PUFFS;
      pf.p.set([x + (Math.random() - 0.5) * r, y + (Math.random() - 0.3) * r * 0.6, z + (Math.random() - 0.5) * r], i * 3);
      pf.r[i] = r * (0.5 + Math.random() * 0.6); pf.life[i] = pf.max[i] = life * (0.7 + Math.random() * 0.6); pf.c[i] = dark + Math.random() * 0.2;
      pf.hot[i] = hot;
    }
  }
  // A kill: a fireball that swells and cools into a pall of smoke, sparks and a flash ring.
  function boom(x: number, y: number, z: number, size: number, n: number) {
    shards(x, z, n, C.fire, 8 + size * 3, size * 0.9, y, 1.6);
    shards(x, z, Math.ceil(n / 3), C.flash, 5, size * 0.6, y, 2);
    wave(x, y, z, size * 3, C.fire, 0.35, 1.2);
    puffs(x, y, z, 2 + Math.ceil(size * 1.5), size * 0.8, 0.9, 0.2, 1);
    puffs(x, y, z, 2 + Math.ceil(size * 2), size * 1.1);
  }
  // A shot-down aircraft starts to fall from where it was drawn, carrying on along its course.
  function wreck(f: Flight, size: number) {
    const i = wk.next = (wk.next + 1) % MAX_WRECKS, heli = !!ROTORS[f.kind];
    wk.kind[i] = f.kind; wk.p.set([f.x, f.y, f.z], i * 3);
    wk.v.set([f.vx * 0.7, heli ? 0 : 1 + Math.random(), f.vz * 0.7], i * 3);
    // Helicopters spin round their rotor mast; fixed wings roll and drop their nose.
    wk.rot.set([f.bank, f.h, f.pitch], i * 3);
    wk.spin.set(heli ? [(Math.random() - 0.5) * 2, (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3), -0.6] : [(Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 5), (Math.random() - 0.5) * 1.5, -1.2 - Math.random()], i * 3);
    wk.size[i] = size; wk.life[i] = 6; wk.emit[i] = 0;
  }
  function burn(x: number, z: number, r: number) {
    const i = fi.next = (fi.next + 1) % MAX_FIRES;
    fi.x[i] = x; fi.z[i] = z; fi.r[i] = r; fi.life[i] = 3 + r * 2; fi.emit[i] = 0;
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
    bm.w[i] = w; bm.life[i] = bm.max[i] = life; bm.grow[i] = grow; bmShade[i] = 1;
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
  // Walkers' fire, per kind: rounds in a burst, s between them, speed m/s, streak width and length m, colour (a
  // hostile red-orange, apart from your own amber tracers), and a burst where they land (every round, or the last).
  const ROUNDS: Partial<Record<EnemyKind, { n: number; gap: number; speed: number; w: number; len: number; col: number; blast?: number; blastAll?: boolean }>> = {
    gunbot: { n: 4, gap: 0.08, speed: 60, w: 0.12, len: 2.2, col: 0xff6a2a },
    dog: { n: 3, gap: 0.07, speed: 60, w: 0.1, len: 1.8, col: 0xff7a3a },
    mech: { n: 2, gap: 0.15, speed: 45, w: 0.2, len: 2.6, col: 0xff4a1a, blast: 0.7, blastAll: true },
    titan: { n: 12, gap: 0.05, speed: 55, w: 0.13, len: 2.2, col: 0xff5a20, blast: 1.2 },
  };
  // A walker keeps facing what it shot at a little longer than it takes to fire again, so it doesn't swing back
  // and forth between bursts.
  const aimHold = (k: EnemyKind) => ((k === 'gunbot' ? GROUND.gun : k === 'dog' || k === 'mech' || k === 'titan' || k === 'arty' ? GROUND[k] : undefined)?.every ?? 0) + 0.8;
  // The walker that fired from (x, z) at (x2, z2): it turns to face its target, and its rounds leave from its
  // gun muzzles (models.ts), wherever they are as it stands now.
  function muzzles(s: State, x: number, z: number, x2: number, z2: number) {
    let src: Enemy | undefined, bd = 4;
    for (const o of s.enemies) { const d = (o.x - x) ** 2 + (o.z - z) ** 2; if (d < bd) { bd = d; src = o; } }
    const aim = Math.atan2(z2 - z, x2 - x), f = src && flights.get(src.id), kind = src?.kind ?? 'gunbot';
    if (f) { f.aim = aim; f.aimT = clock; f.h += angDiff(aim, f.h) * 0.6; } // snaps most of the way round to fire
    const h = f ? f.h : aim, c = Math.cos(h), sn = Math.sin(h), sz = (src?.size ?? 1) * VIS;
    const bx = f ? f.x : x, bz = f ? f.z : z, gy = groundY(bx, bz);
    return { kind, pts: (MUZZLES[kind] ?? [[0.5, 1, 0]]).map(([mx, my, mz]) => [bx + (mx * c - mz * sn) * sz, gy + my * sz, bz + (mx * sn + mz * c) * sz]) };
  }
  // A round from `o` to (x2, y2, z2), `delay` s from now: a streak `len` long flying at `speed` (over an arc
  // `apex` m high, for a mortar), a flash at the muzzle as it goes, sparks (or a burst `blast` m) where it lands.
  function bolt(o: number[], x2: number, y2: number, z2: number, delay: number, speed: number, w: number, len: number, color: number, k: number, apex = 0, blast = 0) {
    const i = bo.next = (bo.next + 1) % MAX_BOLTS, j = i * 6;
    bo.a.set([o[0], o[1], o[2], x2, y2, z2], j);
    bo.t[i] = -delay - 1e-4; bo.dur[i] = Math.max(0.05, Math.hypot(x2 - o[0], y2 - o[1], z2 - o[2]) / speed);
    bo.w[i] = w; bo.len[i] = len; bo.apex[i] = apex; bo.blast[i] = blast;
    tmpC.setHex(color).multiplyScalar(k); bo.col.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  }
  function blip(x: number, z: number, r: number, life: number) {
    const i = bl.next = (bl.next + 1) % MAX_BLIPS;
    bl.x[i] = x; bl.z[i] = z; bl.r[i] = r; bl.life[i] = bl.max[i] = life;
  }

  function traverse(s: State, dt: number, play: boolean) {
    const claimed = new Map<number, number>(), foes = new Map<number, Enemy>();
    for (const o of s.enemies) foes.set(o.id, o);
    for (const l of launchers) {
      let L = lst.get(l.key);
      if (!L) lst.set(l.key, L = { cur: l.home, vel: 0, tgt: -1, hold: Math.random(), idle: 0, cue: -1, cueT: 0, spd: 0.55 + Math.random() * 0.3 });
      if (play) { L.hold -= dt; L.cueT -= dt; }
      const bearing = (e: Enemy) => Math.atan2(e.z - l.z, e.x - l.x);
      let e = L.cueT > 0 ? foes.get(L.cue) : undefined;
      if (!e) {
        const cur = foes.get(L.tgt), keep = cur && visible(s, cur);
        if (!keep || L.hold <= 0) { // look again, but not every frame: a crew doesn't flick between tracks
          let best = keep ? cur : undefined, bs = keep ? Math.abs(angDiff(l.home, bearing(cur!))) + 0.9 * (claimed.get(cur!.id) ?? 0) - 0.4 : Infinity;
          for (const o of s.enemies) {
            if (!visible(s, o)) continue;
            const sc = Math.abs(angDiff(l.home, bearing(o))) + 0.9 * (claimed.get(o.id) ?? 0) + Math.hypot(o.x, o.z) / ARENA_R * 0.5;
            if (sc < bs) { bs = sc; best = o; }
          }
          L.tgt = best ? best.id : -1; L.hold = 1.5 + Math.random() * 2;
        }
        e = foes.get(L.tgt);
      }
      if (e) claimed.set(e.id, (claimed.get(e.id) ?? 0) + 1);
      L.idle = e ? 0 : L.idle + (play ? dt : 0);
      // Nothing to watch: hold a moment, then back to its own sector.
      const want = e ? bearing(e) : L.idle > 3 ? l.home : L.cur;
      if (!play) { aimCur.set(l.key, L.cur); continue; }
      const da = angDiff(want, L.cur), v = Math.max(-L.spd, Math.min(L.spd, da * 1.8));
      L.vel += (v - L.vel) * Math.min(1, dt * 2.5); // hydraulics: spin up and settle, never snap
      L.cur += L.vel * dt;
      aimCur.set(l.key, L.cur);
    }
  }

  const WRECKS: EnemyKind[] = ['scout', 'drone', 'decoy', 'tank', 'ew', 'elite', 'recon', 'ka52', 'su25', 'sead', 'halo', 'backfire', 'okhotnik', 'mainstay'];
  const KILL_SHARDS: Record<EnemyKind, number> = { swarm: 4, scout: 6, drone: 8, tank: 16, elite: 24, decoy: 5, arm: 6, ew: 16, tbm: 12, cruise: 8, atgm: 3, kab: 10, recon: 8, ka52: 18, hyper: 14, mald: 6, su25: 20, rocket: 2, sead: 22, arm2: 7, halo: 40, backfire: 40, okhotnik: 36, mainstay: 48, walker: 6, gunbot: 10, mech: 22, crawler: 2, dog: 6, sapper: 9, arty: 10, titan: 40 };
  // The unit an event at (x, z) came from, if one stands there.
  const padAt = (s: State, x: number, z: number) => s.perim.find(p => Math.abs(p.x - x) + Math.abs(p.z - z) < 0.01);
  function consume(s: State) {
    for (const e of s.events) {
      switch (e.k) {
        case 'kill': {
          const T = ENEMIES[e.kind!];
          // Where it was drawn last frame (it's gone from the sim now), for its height and course.
          let f: Flight | undefined, bd = 4;
          for (const g of flights.values()) { const d = (g.x - e.x) ** 2 + (g.z - e.z) ** 2; if (g.kind === e.kind && d < bd) { bd = d; f = g; } }
          const y = f ? f.y : groundY(e.x, e.z) + altitude(e.kind!, e.x, e.z);
          boom(e.x, y, e.z, T.size * 1.3, KILL_SHARDS[e.kind!]);
          if (BIG_KILLS[e.kind!]) { // a kill that matters: a second, whiter blast, a shock ring and a flash on the ground
            boom(e.x, y, e.z, T.size * 2, 30);
            wave(e.x, y, e.z, T.size * 7, C.flash, 0.6, 2);
            gwave(e.x, e.z, T.size * 6, C.flash, 0.9, 1.5);
            groundFlash = Math.max(groundFlash, 0.5);
          }
          // Aircraft come down in one piece-ish; missiles and FPVs just go up in the blast.
          if (f && WRECKS.includes(e.kind!)) { f.x = e.x; f.z = e.z; wreck(f, T.size * VIS); }
          else if (T.size > 1.5) gwave(e.x, e.z, T.size * 3, C.fire, 0.5, 0.6); // debris lands
          break;
        }
        case 'hit': {
          const y = airY(s, e.x, e.z);
          e.n ? (wave(e.x, y, e.z, e.n, C.fire, 0.35, 1.2), shards(e.x, e.z, 6, C.fire, 10, 0.8, y, 1.5), puffs(e.x, y, e.z, 2, e.n * 0.5, 1)) : shards(e.x, e.z, 2, C.flash, 6, 0.4, y, 1.5);
          break;
        }
        case 'baseHit': { const y = groundY(e.x, e.z) + 0.8; boom(e.x * 0.5, y, e.z * 0.5, 2.5, 18); puffs(e.x * 0.5, y, e.z * 0.5, 6, 2.5, 3, 0.2); groundFlash = 1; break; }
        case 'dud': puffs(e.x * 0.5, groundY(e.x, e.z) + 0.8, e.z * 0.5, 3, 1.2, 2, 0.2); break; // a foam decoy: a puff, no blast
        case 'padHit': shards(e.x, e.z, 4, C.fire, 6, 0.6, groundY(e.x, e.z) + 0.8, 1.5); break;
        case 'padDown': { const y = groundY(e.x, e.z) + 0.6; boom(e.x, y, e.z, 1.6, 14); puffs(e.x, y, e.z, 5, 1.8, 4, 0.15); break; }
        case 'gun': { // MG / MANTIS: the pad's turret swings onto the target, muzzle flash at the barrel tip
          const a = Math.atan2(e.z2 - e.z, e.x2 - e.x), p = s.perim.find(p => Math.abs(p.x - e.x) + Math.abs(p.z - e.z) < 0.01);
          if (p) aimT.set(`pad${p.slot}`, a);
          const tip = (p?.k === 'mg' ? (p.tier === 2 ? 1.65 : 1.15) : 1.9) * PAD_VIS;
          shards(e.x + Math.cos(a) * tip, e.z + Math.sin(a) * tip, 2, C.flash, 3, 0.35, groundY(e.x, e.z) + 0.8, 2);
          break;
        }
        case 'robotLob': { // a mortar walker's round: the pop at the tube, the round arcing over, the burst on your unit
          const [o] = muzzles(s, e.x, e.z, e.x2, e.z2).pts, y2 = groundY(e.x2, e.z2) + 0.4, d = Math.hypot(e.x2 - e.x, e.z2 - e.z);
          puffs(o[0], o[1], o[2], 2, 0.6, 1.5, 0.3);
          bolt(o, e.x2, y2, e.z2, 0, Math.max(12, d / 1.6), 0.3, 0.7, 0xffb070, 2, 3 + d * 0.3, e.n);
          break;
        }
        case 'padMod': { const y = groundY(e.x, e.z) + 1; gwave(e.x, e.z, 3, 0xffe9a8, 0.6, 1.2); shards(e.x, e.z, 8, 0xffe9a8, 4, 0.5, y, 1.5); break; } // fitted out
        case 'robotFire': { // a walker's burst at one of your units: rounds streaking from its gun, sparks on the unit
          const { pts: ms, kind } = muzzles(s, e.x, e.z, e.x2, e.z2), R = ROUNDS[kind] ?? ROUNDS.gunbot!, y2 = groundY(e.x2, e.z2) + 0.8;
          for (let i = 0; i < R.n; i++) {
            const j = (Math.random() - 0.5) * 0.6, last = i === R.n - 1;
            bolt(ms[i % ms.length], e.x2 + j, y2 + j * 0.5, e.z2 - j, i * R.gap, R.speed, R.w, R.len, R.col, 3, 0, R.blast && (R.blastAll || last) ? R.blast : 0);
          }
          break;
        }
        case 'beam': { // from the HEL (sim fires from the centre), a hop between contacts (ARC LASER, OVERKILL), or a LOCUST unit
          const y2 = airY(s, e.x2, e.z2), p = padAt(s, e.x, e.z);
          if (p) { aimT.set(`pad${p.slot}`, Math.atan2(e.z2 - e.z, e.x2 - e.x)); laser(e.x, groundY(e.x, e.z) + 1.1 * PAD_VIS, e.z, e.x2, groundY(e.x2, e.z2) + 0.9, e.z2); }
          else if (e.x || e.z) laser(e.x, airY(s, e.x, e.z), e.z, e.x2, y2, e.z2);
          else { aimT.set('hel', Math.atan2(e.z2 - helPt[2], e.x2 - helPt[0])); laser(helPt[0], helPt[1], helPt[2], e.x2, y2, e.z2); }
          break;
        }
        case 'rail': { // HPM: a shimmering band down the line, crossed by wavefronts rolling out from the array (the battery's, or a Leonidas unit's)
          const p = padAt(s, e.x, e.z), [x, y, z] = p ? [e.x, groundY(e.x, e.z) + 1.3 * PAD_VIS, e.z] : hpmPt, a = Math.atan2(e.z2 - z, e.x2 - x), len = Math.hypot(e.x2 - x, e.z2 - z), y2 = p ? groundY(e.x2, e.z2) + 0.8 : airY(s, e.x2, e.z2);
          aimT.set(p ? `pad${p.slot}` : 'hpm', a);
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
        case 'jam': case 'spot': gwave(e.x, e.z, 8, ALERT, 1.2); break;
        case 'settle': wave(e.x, airY(s, e.x, e.z), e.z, 3, ALERT, 0.6, 1.5); break;
        case 'ident': { // classified: a grey ring collapses on it and it goes dim
          const y = airY(s, e.x, e.z);
          wave(e.x, y, e.z, 4, 0xcccccc, 0.5, 1.5); gwave(e.x, e.z, 3, 0xcccccc, 0.6); shards(e.x, e.z, 5, 0xbbbbbb, 4, 0.4, y, 1.2);
          break;
        }
        case 'padRank': { // a gun ranks up: gold burst over it
          const y = groundY(e.x, e.z) + 1.5;
          gwave(e.x, e.z, 6, 0xffd966, 0.8, 1.6); shards(e.x, e.z, 20, 0xffd966, 9, 0.7, y, 1.8);
          beam(e.x, y - 1.2, e.z, e.x, y + 8, e.z, 0.3, 0xffd966, 0.5, 1.5);
          break;
        }
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
          shards(0, 0, e.star ? 40 : 6, e.star ? 0xffe9a8 : C.friend, e.star ? 18 : 8, 0.8, 2.5, 1.5);
          if (e.star) { groundFlash = 0.5; gwave(0, 0, 30, 0xffe9a8, 1.3, 1.2); beam(0, 1, 0, 0, 16, 0, 0.6, 0xffe9a8, 0.8, 1.5); }
          break;
        case 'drop': { // salvage lands: a light column flares up, a ring and a spray of sparks
          const gy = groundY(e.x, e.z);
          gwave(e.x, e.z, 6, 0xffe9a8, 0.8, 1.5); gwave(e.x, e.z, 3, 0xffffff, 0.5, 1.2); puffs(e.x, gy + 0.3, e.z, 3, 1, 1.2, 0.55);
          shards(e.x, e.z, e.drop === 'tech' ? 18 : 10, 0xffe9a8, 7, 0.6, gy + 1, 1.8);
          beam(e.x, gy, e.z, e.x, gy + 14, e.z, 0.5, 0xffe9a8, 0.7, 1.6);
          break;
        }
        case 'pickup': { // recovered: burst, and a streak back to the battery
          const y = groundY(e.x, e.z) + 1.2;
          gwave(e.x, e.z, 9, 0xffe9a8, 0.6, 1.8); shards(e.x, e.z, e.drop === 'tech' ? 40 : 22, 0xffe9a8, 13, 0.9, y, 1.8);
          groundFlash = Math.max(groundFlash, 0.25);
          beam(e.x, y, e.z, 0, 1.5, 0, 0.25, 0xffe9a8, 0.35, 1.5);
          if (e.drop === 'tech') { gwave(0, 0, 14, 0xffffff, 0.8, 1.5); groundFlash = 0.4; }
          break;
        }
      }
    }
  }

  const pools = [...Object.values(enemyMeshes), rotors, stalks, pips, brackets, hpBars, shells, tracers, missiles, boltMesh, dropMesh, dropRing, dropBeam, shardMesh, waveMesh, beamMesh, smokeMesh, puffMesh, frontMesh, blipMesh, jamMesh, dwellMesh];
  const sent = new Map<THREE.InstancedMesh, number>();
  const dummy = new THREE.Object3D();
  const camRight = new THREE.Vector3();
  const markEnd = markLine.geometry.attributes.position as THREE.BufferAttribute;
  const dir = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
  const hpCol = (r: number) => tmpC.setRGB(1 - r * 0.6, 0.35 + r * 0.6, 0.25);
  let clock = 0;

  // lead: s of game time since the last sim tick (main.ts ticks at a fixed step). Contacts and shots are drawn that
  // far along their velocity, so they glide at any refresh rate instead of stepping at the tick rate.
  function render(s: State, dt: number, lead = 0) {
    clock += dt;
    if (mapSeed !== terrainKey) buildTerrain(); // a new run, a new map
    consume(s);
    const key = `${s.level}${s.st.radar}${!!s.st.weapons.cannon}${s.st.aesa}${!!s.st.weapons.pulse}${s.lv.missile ?? 0}${!!s.st.weapons.rail}|${s.perim.map(p => `${p.slot}${p.k}${p.tier}${p.down ? 'd' : ''}${p.x},${p.z}${Object.values(p.mods ?? {}).join('+')}`).join()}|${s.selected}`;
    if (key !== baseKey) { baseKey = key; buildBase(s); }
    covMesh.visible = showCov;
    if (showCov && `${key}|${s.stage}` !== covKey) { covKey = `${key}|${s.stage}`; drawCoverage(s); }
    const play = s.phase === 'play';
    if (bloom?.enabled && play && dt > 0) {
      frameMs += (dt * 1000 - frameMs) * 0.1;
      slowFor = frameMs > PERF.bloomOff.ms ? slowFor + dt : 0;
      if (slowFor > PERF.bloomOff.secs) { bloom.enabled = false; console.info(`x5: bloom off, frames averaging ${frameMs.toFixed(0)} ms`); }
    }

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

    // map overlays: build zone (bright while placing, moving or in the build window), the flank arc, eyesight / radar range
    const building = !!s.placing || s.relocating || inBuildWindow(s);
    // A ground assault builds in a band in front of the base instead of a ring round it.
    const bz = s.ground ? 1000 + s.level : buildR(s.level);
    if (bz !== zoneKey) {
      zoneKey = bz; if (zoneLine) { scene.remove(zoneLine); zoneLine.geometry.dispose(); }
      const Z = groundZone(s.level), side = (x0: number, z0: number, x1: number, z1: number) => Array.from({ length: 21 }, (_, i) => [x0 + (x1 - x0) * i / 20, z0 + (z1 - z0) * i / 20]).flat();
      scene.add(zoneLine = groundLine(s.ground ? [...side(-Z.w, Z.back, -Z.w, -Z.d), ...side(-Z.w, -Z.d, Z.w, -Z.d), ...side(Z.w, -Z.d, Z.w, Z.back), ...side(Z.w, Z.back, -Z.w, Z.back)] : arcPts(bz, 0, TAU, 128), zoneMat, true));
    }
    zoneMat.opacity = building ? 0.75 + 0.2 * Math.sin(clock * 5) : 0.25;
    innerLine.visible = building;
    const fa = Math.min(Math.PI, Math.max(FRONT_ARC, flankArc(s.stage, s.ground)));
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
          if (GUNS.includes(bk)) fanPts(fanTmp, mover ? fanOf(mover) : FANS[bk], at.x, at.z, Math.atan2(at.z, at.x), range);
          else { const n = 40; for (let i = 0; i < n; i++) { const a0 = i / n * TAU, a1 = (i + 1) / n * TAU; fanTmp.push(at.x + Math.cos(a0) * range, groundY(at.x, at.z) + 0.2, at.z + Math.sin(a0) * range, at.x + Math.cos(a1) * range, groundY(at.x, at.z) + 0.2, at.z + Math.sin(a1) * range); } }
          ghostFanPos.set(fanTmp.slice(0, GF * 3));
          ghostFan.geometry.setDrawRange(0, Math.min(GF, fanTmp.length / 3));
          ghostFan.geometry.attributes.position.needsUpdate = true;
          const w = GUNS.includes(bk) ? mover ? fanOf(mover) : FANS[bk] : Math.PI;
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
    traverse(s, dt, play);
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
      // A ground assault's walkers beyond sight are drawn dim (the battalion's drone feed): the player sees the tide
      // coming, but nothing engages it until a unit's own eyes have it.
      if (!visible(s, e) && !s.ground) continue;
      const k = shownKind(e), m = enemyMeshes[k];
      if (m.count >= MAX_ENEMIES) continue;
      const ex = e.x + e.vx * lead, ez = e.z + e.vz * lead; // where it is now, between sim ticks
      const gy = groundY(ex, ez), sz = e.size * VIS, f = fly(e, ex, ez, gy, dt, play), alt = f.y - gy;
      // A walker dips as its legs swing out, so the foot it's standing on stays on the ground.
      const G = GAIT[k], y = f.y - (G ? G.leg * (1 - Math.cos(f.amp * Math.sin(f.gait))) * sz : 0);
      const pos = ePos[ne++ % MAX_ENEMIES]; pos.x = ex; pos.z = ez; pos.y = y; byId.set(e.id, pos);
      // A classified decoy is drawn as a ghost, so it can't be mistaken for the Shahed it copies.
      const fade = !visible(s, e) ? 0.1 : (e.locked ? 1 : Math.max(0.35, Math.min(1, (e.seenUntil - s.t) / 1.5))) * (e.ided ? 0.45 : 1);
      // FPVs rock as they jink, on top of the banking.
      const bank = f.bank + (k === 'swarm' ? 0.25 * Math.sin(clock * 9 + e.id) : 0);
      dummy.position.set(ex, y, ez);
      dummy.rotation.set(bank, -f.h, f.pitch, 'YXZ');
      dummy.scale.setScalar(sz);
      dummy.updateMatrix();
      m.setMatrixAt(m.count, dummy.matrix);
      if (G) gaits[k]?.setXYZ(m.count, f.gait, f.amp, G.knee);
      m.setColorAt(m.count++, tmpC.setHex(ENEMIES[k].mimic ? 0x9a9a9a : KIND_COL[k]).multiplyScalar(0.6 + 0.4 * fade));
      if (play) exhaust(e, f, sz, dt);
      const rotor = ROTORS[k];
      if (rotor) { // spinning main rotor disc
        dummy.position.set(ex, y + rotor.y * sz, ez); dummy.rotation.set(0, clock * 20, 0); dummy.scale.set(rotor.r * sz, 1, rotor.r * sz); dummy.updateMatrix();
        rotors.setMatrixAt(rotors.count, dummy.matrix); rotors.setColorAt(rotors.count, tmpC.setHex(0x222222)); rf.setX(rotors.count++, 0.8);
      }
      // Stalk and ground ring: red for a threat, amber for a missile on the battery, grey for a classified decoy.
      const tc = ENEMIES[k].mimic ? 0x999999 : MUNITIONS.includes(k) ? ALERT : C.threat;
      dummy.position.set(ex, gy + 0.1, ez); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, Math.max(0.01, alt - 0.1), 1); dummy.updateMatrix();
      stalks.setMatrixAt(stalks.count, dummy.matrix); stalks.setColorAt(stalks.count, tmpC.setHex(tc)); sf.setX(stalks.count++, 0.6 * fade);
      dummy.position.set(ex, gy + 0.15, ez); dummy.scale.setScalar(sz * 0.45); dummy.updateMatrix();
      pips.setMatrixAt(pips.count, dummy.matrix); pips.setColorAt(pips.count, tmpC.setHex(tc)); pfa.setX(pips.count++, (e.locked ? 1 : 0.6) * fade);
      if (e.id === s.marked) {
        marked = true;
        markRing.position.set(ex, gy + 0.3, ez);
        markRing.rotation.y = clock * 2;
        markRing.scale.setScalar(sz * (1.3 + Math.sin(clock * 8) * 0.08));
        markEnd.setXYZ(1, ex, y, ez); markEnd.needsUpdate = true;
        markLine.computeLineDistances();
      }
      if (e.locked && nl < MAX_LOCKS) {
        dummy.position.set(ex, y, ez); dummy.quaternion.copy(camera.quaternion); dummy.scale.setScalar(sz * 0.9);
        dummy.updateMatrix();
        brackets.setMatrixAt(nl, dummy.matrix);
        brackets.setColorAt(nl, tmpC.setHex(e.id === s.marked ? 0xffffff : C.friend).multiplyScalar(e.id === s.marked ? 2 : 1.4));
        const r = Math.max(0, e.hp / e.maxHp);
        dummy.position.set(ex, y + sz * 0.8 + 0.6, ez).addScaledVector(camRight, -sz);
        dummy.scale.set(Math.max(0.01, sz * 2 * r), 1, 1);
        dummy.updateMatrix();
        hpBars.setMatrixAt(nb, dummy.matrix);
        hpBars.setColorAt(nb++, hpCol(r));
        lockLinePos.set([0, 2.2, 0, ex, y, ez], nl * 6);
        nl++;
      }
    }
    for (const [id, f] of flights) if (f.frame !== frameNo) flights.delete(id); // gone, or off the scope
    frameNo++;
    if (play) fires(dt);
    wrecks(dt, play, rf);
    bolts(dt, play);

    // Your damaged units get an HP bar too.
    for (const p of s.perim) {
      const max = padHp(p);
      if (p.hp >= max || nb >= MAX_LOCKS + 32) continue;
      const r = p.hp / max;
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
      if (!f && p.pad !== undefined) aimT.set(`pad${p.pad}`, Math.atan2(p.vz, p.vx)); // the unit's gun swings onto it
      if (!f) { // first frame: pick the launcher facing the shot, flash its muzzle
        const pts = p.src === 'PAC-3' ? pacPts : p.src === 'IRIS-T' ? irisPts : null;
        let o = [p.x, (tracer ? 1 : 1.1) + groundY(p.x, p.z), p.z];
        if (pts?.length) {
          // The station whose launcher already looks that way (or whose sector it is) takes the shot, and slews onto it.
          const h = Math.atan2(p.vz, p.vx), pre = p.src === 'PAC-3' ? 'pac' : 'iris';
          let bd = Infinity, bk = '';
          pts.forEach((q, i) => {
            const L = lst.get(pre + i), d = Math.abs(angDiff(Math.atan2(q[2], q[0]), h)) + (L ? 0.6 * Math.abs(angDiff(L.cur, h)) : 0);
            if (d < bd) { bd = d; o = q; bk = pre + i; }
          });
          const L = lst.get(bk);
          if (L) { L.cue = p.target; L.cueT = 2.5; }
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
      const x = p.x + p.vx * lead + f.ox * k, z = p.z + p.vz * lead + f.oz * k;
      // A grenade or mortar round arcs up and comes down on the spot it was aimed at.
      const arc = p.kind === 'lob' ? Math.min(1, 1 - (p.life - lead) / (p.fly || 1)) : 0;
      const y = p.kind === 'lob' ? groundY(x, z) + 1 + 4 * (p.apex ?? 2) * arc * (1 - arc) : y0 + (ty2 - y0) * prog + f.oy * k;
      const dx = x - f.px, dy = y - f.py, dz = z - f.pz, moved = dx * dx + dy * dy + dz * dz > 1e-6;
      if (moved && !tracer) {
        if (p.kind === 'shell') beam(f.px, f.py, f.pz, x, y, z, 0.22, C.fire, 0.12, 1.5);
        else { // pale smoke that lingers and spreads, over a short hot flame at the motor
          smoke(f.px, f.py, f.pz, x, y, z, stinger ? 0.2 : 0.3, stinger ? 0.7 : 1.1);
          beam(f.px, f.py, f.pz, x, y, z, 0.16, C.fire, 0.07, 1.5);
        }
      }
      f.px = x; f.py = y; f.pz = z;
      const m = p.kind === 'shell' || p.kind === 'lob' ? shells : tracer ? tracers : missiles;
      if (m.count >= MAX_SHOTS) continue;
      dummy.position.set(x, y, z);
      if (moved) dummy.lookAt(x + dx, y + dy, z + dz); else dummy.rotation.set(0, Math.atan2(p.vx, p.vz), 0);
      dummy.scale.setScalar(stinger ? 0.7 : 1);
      dummy.updateMatrix(); m.setMatrixAt(m.count, dummy.matrix);
      m.setColorAt(m.count++, tracer ? tmpC.setHex(0xffc861).multiplyScalar(2) : p.kind === 'shell' ? tmpC.setHex(C.flash).multiplyScalar(2) : p.kind === 'lob' ? tmpC.setHex(0x3a3a33) : tmpC.setHex(0xf2f2ea));
    }

    // salvage: tech glows white, a cache gold, the rest olive crates
    dropMesh.count = dropRing.count = dropBeam.count = 0;
    for (const d of s.drops) {
      const tech = d.k === 'tech', gy = groundY(d.x, d.z);
      const col = tech ? 0xffffff : d.k === 'cache' ? 0xe0b84a : 0x7d8a52, i = dropMesh.count++;
      dummy.position.set(d.x, gy + 1.3 + 0.3 * Math.sin(clock * 3 + d.id), d.z); dummy.rotation.set(0, clock * 1.5 + d.id, 0); dummy.scale.setScalar(tech ? 1.3 : 1);
      dummy.updateMatrix(); dropMesh.setMatrixAt(i, dummy.matrix); dropMesh.setColorAt(i, tmpC.setHex(col).multiplyScalar(tech ? 1.5 : 1));
      dummy.position.set(d.x, gy + 0.2, d.z); dummy.rotation.set(0, -clock, 0); dummy.scale.setScalar(1.6 + 0.3 * Math.sin(clock * 5 + d.id));
      dummy.updateMatrix(); dropRing.setMatrixAt(i, dummy.matrix); dropRing.setColorAt(i, tmpC.setHex(0xffe9a8).multiplyScalar(1.2));
      dummy.position.set(d.x, gy, d.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 9, 1);
      dummy.updateMatrix(); dropBeam.setMatrixAt(i, dummy.matrix); dropBeam.setColorAt(i, tmpC.setHex(0xffe9a8).multiplyScalar(0.5));
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
      dummy.scale.setScalar(pf.r[i] * (pf.hot[i] ? 0.6 + 1.2 * Math.sqrt(1 - r) : 1.6 - r)); // a fireball swells fast, then slows
      dummy.updateMatrix();
      puffMesh.setMatrixAt(puffMesh.count, dummy.matrix);
      // A fireball glows orange while young, then cools into smoke.
      const heat = pf.hot[i] * Math.max(0, (r - 0.35) / 0.65) ** 1.5, grey = pf.c[i] * (0.4 + 0.6 * (1 - night)) * (1 - heat);
      puffMesh.setColorAt(puffMesh.count, tmpC.setRGB(grey + heat * 1.7, grey + heat * 0.5, grey + heat * 0.05));
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
        smokeMesh.setColorAt(smokeMesh.count, tmpC.setScalar((0.85 - 0.5 * night) * bmShade[i])); sa.setX(smokeMesh.count++, r * r);
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
      const ga = m.geometry.getAttribute('gait') as THREE.InstancedBufferAttribute | undefined;
      for (const [a, k] of [[m.instanceMatrix, 16], [m.instanceColor, 3], [fa, 1], [ga, 3]] as const) {
        if (!a) continue;
        a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(n, 1) * k); a.needsUpdate = true;
      }
    }
    grade.uniforms.time.value = clock; grade.uniforms.nvg.value = night;
    const blind = s.phase !== 'play' && s.phase !== 'pause' ? 0 : s.t < s.radarDownUntil ? 1 : s.emcon ? 0.3 : 0;
    grade.uniforms.blind.value += (blind - grade.uniforms.blind.value) * Math.min(1, dt * 6);
    composer.render(dt);
  }
  function smoke(x: number, y: number, z: number, x2: number, y2: number, z2: number, w: number, life: number, shade = 1) { beam(x, y, z, x2, y2, z2, w, 0xffffff, life, 1, 1); bmShade[bm.next] = shade; }

  // Drawn flight of contact `e` this frame: height eased onto its flight profile (so a dive comes down in an arc),
  // nose eased round onto its course, banked into turns and pitched along its climb or dive. Helicopters keep
  // their nose on the battery while they hover or hold station, sidestep with a tilt, dip the nose flying in and
  // flare as they slow.
  function fly(e: Enemy, x: number, z: number, gy: number, dt: number, play: boolean) {
    const want = gy + flightAlt(e), hs = Math.hypot(e.vx, e.vz), heli = !!ROTORS[e.kind];
    let course = heli && (e.act === 'hover' || e.orbit) ? Math.atan2(-z, -x) : hs > 0.05 ? Math.atan2(e.vz, e.vx) : undefined;
    let f = flights.get(e.id);
    if (!f) {
      f = { kind: e.kind, x, y: want, z, vx: e.vx, vz: e.vz, h: course ?? Math.atan2(-z, -x), bank: 0, pitch: 0, hs, acc: 0, tx: x, ty: want, tz: z, emit: 0, frame: frameNo, gait: Math.random() * TAU, amp: 0, aim: 0, aimT: -1 };
      flights.set(e.id, f);
    }
    f.frame = frameNo;
    const G = GAIT[e.kind], aiming = clock - f.aimT < aimHold(e.kind);
    if (aiming) course = f.aim; // a walker that's shooting turns to face its target, walking on or not
    if (play && dt > 0) {
      const y0 = f.y, h0 = f.h, ease = (r: number) => 1 - Math.exp(-r * dt);
      f.y += (want - f.y) * ease(ENEMIES[e.kind].ballistic ? 14 : e.kind === 'ka52' ? 2.5 : 6); // a Ka-52 rises and sinks, it doesn't jump
      if (course !== undefined) f.h += angDiff(course, f.h) * ease(heli ? 2.5 : aiming ? 10 : 7);
      const vy = (f.y - y0) / dt, yaw = angDiff(f.h, h0) / dt;
      f.acc += ((hs - f.hs) / dt - f.acc) * ease(4); f.hs = hs;
      let bank: number, pitch: number;
      if (G) {
        // On foot: the stride runs on distance walked (a stride is four hip swings' worth of leg), so the feet
        // plant instead of skating, whether it's striding out or wading through wire. It eases into and out of
        // its stride, stands still when it stops, and sways over the leg it's standing on.
        f.amp += ((hs > 0.15 ? G.amp * Math.min(1, hs / 0.8) : 0) - f.amp) * ease(5);
        if (f.amp > 0.005) f.gait = (f.gait + TAU * hs * dt / (4 * G.leg * Math.max(0.15, Math.sin(f.amp)) * e.size * VIS)) % TAU;
        bank = 0.06 * (f.amp / G.amp) * Math.cos(f.gait); pitch = -0.05 * f.amp / G.amp; // leans into the walk
      } else if (ENEMIES[e.kind].ground) {
        bank = 0; pitch = 0;
      } else if (heli) {
        // Sideways speed relative to the nose tilts the disc; forward speed dips the nose, braking lifts it.
        const lat = -Math.sin(f.h) * e.vx + Math.cos(f.h) * e.vz, fwd = Math.cos(f.h) * e.vx + Math.sin(f.h) * e.vz;
        bank = clamp(lat * 0.18 + yaw * 0.3, 0.45); pitch = clamp(-0.1 * fwd + 0.25 * f.acc, 0.35);
      } else {
        // Coordinated turns: roll into the turn with the turn rate; nose along the flight path.
        bank = clamp(yaw * (e.kind === 'swarm' ? 0.12 : 0.35) * Math.max(1, hs / 4), 1.1);
        pitch = ENEMIES[e.kind].ballistic ? -0.9 : clamp(Math.atan2(vy, Math.max(hs, 0.5)) * 1.2, 1.1);
      }
      if (G) f.bank = bank; else f.bank += (bank - f.bank) * ease(5); // the sway is the stride's: no lag on it
      f.pitch += (pitch - f.pitch) * ease(5);
    }
    f.x = x; f.z = z; f.vx = e.vx; f.vz = e.vz;
    return f;
  }
  const TRAIL: Partial<Record<EnemyKind, { w: number; life: number; shade: number; flame: number; twin?: boolean }>> = {
    elite: { w: 0.1, life: 1.6, shade: 1, flame: 0.7, twin: true }, // contrails off the engines, afterburner glow
    arm: { w: 0.18, life: 1.3, shade: 0.9, flame: 0.8 },
    tbm: { w: 0.35, life: 2.6, shade: 1, flame: 1.4 },
    cruise: { w: 0.14, life: 0.8, shade: 0.85, flame: 0.5 },
    mald: { w: 0.14, life: 0.8, shade: 0.85, flame: 0.5 },
    hyper: { w: 0.3, life: 2.2, shade: 1, flame: 1.8 },
    su25: { w: 0.08, life: 1.2, shade: 0.8, flame: 0.4, twin: true },
    sead: { w: 0.1, life: 1.6, shade: 1, flame: 0.7, twin: true },
    backfire: { w: 0.14, life: 2, shade: 1, flame: 0.9, twin: true },
    okhotnik: { w: 0.08, life: 1.2, shade: 0.6, flame: 0.3 },
    mainstay: { w: 0.12, life: 1.8, shade: 1, flame: 0.4, twin: true },
    arm2: { w: 0.2, life: 1.5, shade: 0.9, flame: 0.9 },
    rocket: { w: 0.08, life: 0.5, shade: 0.9, flame: 0.4 },
    atgm: { w: 0.12, life: 0.8, shade: 0.9, flame: 0.5 },
  };
  const TRAIL_STEP = LITE ? 1.2 : 0.6; // m between smoke segments: trail cost goes with distance flown, not frame rate
  // Motor flame and smoke trail, and smoke (then fire) streaming off an aircraft that's been hit hard.
  function exhaust(e: Enemy, f: Flight, sz: number, dt: number) {
    const tr = TRAIL[e.kind], ch = Math.cos(f.h), shh = Math.sin(f.h), cp = Math.cos(f.pitch);
    const tail = sz * 0.5, bx = f.x - ch * cp * tail, by = f.y - Math.sin(f.pitch) * tail, bz = f.z - shh * cp * tail;
    if (tr) {
      const fl = tr.flame * sz * (0.8 + 0.4 * Math.random());
      for (const side of tr.twin ? [-0.12, 0.12] : [0]) {
        const ox = -shh * side * sz, oz = ch * side * sz;
        beam(bx + ox, by, bz + oz, bx + ox - ch * cp * fl, by - Math.sin(f.pitch) * fl, bz + oz - shh * cp * fl, tr.w * 1.4, C.fire, 0.04, 2);
      }
      const d2 = (bx - f.tx) ** 2 + (by - f.ty) ** 2 + (bz - f.tz) ** 2;
      if (d2 > TRAIL_STEP * TRAIL_STEP) {
        if (d2 < 36) smoke(f.tx, f.ty, f.tz, bx, by, bz, tr.w, tr.life, tr.shade); // a jump (first frame back on the scope): no streak
        f.tx = bx; f.ty = by; f.tz = bz;
      }
    }
    const hp = e.hp / e.maxHp;
    if (hp < 0.5 && e.maxHp >= 8 && !MUNITIONS.includes(e.kind) && (f.emit -= dt) <= 0) {
      f.emit = LITE ? 0.2 : 0.1;
      puffs(bx, by, bz, 1, sz * 0.25, 1.2, 0.12);
      if (hp < 0.25) shards(bx, bz, 1, C.fire, 1.5, sz * 0.3, by, 1.6);
    }
  }
  function wrecks(dt: number, play: boolean, rf: THREE.InstancedBufferAttribute) {
    for (let i = 0; i < MAX_WRECKS; i++) {
      if (wk.life[i] <= 0) continue;
      const j = i * 3, P = wk.p, V = wk.v, R = wk.rot, k = wk.kind[i], m = enemyMeshes[k], sz = wk.size[i];
      if (play) {
        wk.life[i] -= dt;
        V[j + 1] -= 7 * dt; V[j] *= 1 - 0.4 * dt; V[j + 2] *= 1 - 0.4 * dt; // gravity, drag
        const x0 = P[j], y0 = P[j + 1], z0 = P[j + 2];
        P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt;
        for (let a = 0; a < 3; a++) R[j + a] += wk.spin[j + a] * dt;
        R[j + 2] = Math.max(-1.3, R[j + 2]); // nose down, not over and over
        if ((wk.emit[i] -= dt) <= 0) { // burning: black smoke behind, flame at the break
          wk.emit[i] = LITE ? 0.1 : 0.05;
          smoke(x0, y0, z0, P[j], P[j + 1], P[j + 2], 0.25 * sz, 1.8, 0.3);
          beam(x0, y0, z0, P[j], P[j + 1], P[j + 2], 0.2 * sz, C.fire, 0.12, 1.6);
        }
        const gy = groundY(P[j], P[j + 2]);
        if (P[j + 1] <= gy + 0.2 || wk.life[i] <= 0) { // impact
          wk.life[i] = 0;
          boom(P[j], gy + 0.4, P[j + 2], sz * 0.6, 10);
          gwave(P[j], P[j + 2], sz * 2.5, C.fire, 0.6, 0.8);
          puffs(P[j], gy + 0.3, P[j + 2], 4, sz * 0.8, 1.5, 0.5); // dust kicked up
          burn(P[j], P[j + 2], sz * 0.4);
          continue;
        }
      }
      if (m.count >= MAX_ENEMIES) continue;
      dummy.position.set(P[j], P[j + 1], P[j + 2]); dummy.rotation.set(R[j], -R[j + 1], R[j + 2], 'YXZ'); dummy.scale.setScalar(sz);
      dummy.updateMatrix(); m.setMatrixAt(m.count, dummy.matrix); gaits[k]?.setXYZ(m.count, 0, 0, 0);
      m.setColorAt(m.count++, tmpC.setHex(C.wreck).multiplyScalar(0.8 + 0.4 * Math.random())); // charred, lit by its own fire
      const rotor = ROTORS[k];
      if (rotor && rotors.count < MAX_ENEMIES) {
        dummy.position.y += rotor.y * sz; dummy.rotation.set(0, clock * 9, 0); dummy.scale.set(rotor.r * sz, 1, rotor.r * sz); dummy.updateMatrix();
        rotors.setMatrixAt(rotors.count, dummy.matrix); rotors.setColorAt(rotors.count, tmpC.setHex(0x222222)); rf.setX(rotors.count++, 0.5);
      }
    }
  }
  // Walkers' rounds: each a glowing streak along its path (straight, or arcing for a mortar round), held still
  // while paused like the beams.
  const bTail = new THREE.Vector3(), bHead = new THREE.Vector3();
  function bolts(dt: number, play: boolean) {
    boltMesh.count = 0;
    const A = bo.a;
    for (let i = 0; i < MAX_BOLTS; i++) {
      if (bo.dur[i] <= 0) continue;
      const j = i * 6, t0 = bo.t[i];
      if (play) bo.t[i] += dt;
      const t = bo.t[i], dur = bo.dur[i];
      if (t < 0) continue;
      if (t0 < 0) { // just fired: muzzle flash
        shards(A[j], A[j + 2], 2, C.flash, 3, bo.blast[i] ? 0.45 : 0.3, A[j + 1], 2.5);
      }
      if (t >= dur) { // landed
        bo.dur[i] = 0;
        const x = A[j + 3], y = A[j + 4], z = A[j + 5];
        if (bo.blast[i]) { boom(x, y, z, bo.blast[i], 10); gwave(x, z, bo.blast[i] * 1.4, C.fire, 0.5, 0.8); }
        else shards(x, z, 3, C.fire, 5, 0.4, y, 1.5);
        continue;
      }
      const at = (u: number, v: THREE.Vector3) => v.set(A[j] + (A[j + 3] - A[j]) * u, A[j + 1] + (A[j + 4] - A[j + 1]) * u + 4 * bo.apex[i] * u * (1 - u), A[j + 2] + (A[j + 5] - A[j + 2]) * u);
      const u = t / dur, d = Math.hypot(A[j + 3] - A[j], A[j + 4] - A[j + 1], A[j + 5] - A[j + 2]) || 1;
      at(Math.max(0, u - bo.len[i] / d), bTail); at(u, bHead);
      dir.subVectors(bHead, bTail);
      const len = dir.length();
      if (len < 1e-4) continue;
      dummy.position.copy(bTail); dummy.quaternion.setFromUnitVectors(X, dir.divideScalar(len));
      const c = i * 3;
      for (const [w, k, hot] of [[bo.w[i] * 2.4, 0.25, 0], [bo.w[i], 0.55, 0.2]]) { // glow, then the hot core
        dummy.scale.set(len, w, w); dummy.updateMatrix();
        boltMesh.setMatrixAt(boltMesh.count, dummy.matrix);
        boltMesh.setColorAt(boltMesh.count++, tmpC.setRGB(bo.col[c] * k + hot, bo.col[c + 1] * k + hot, bo.col[c + 2] * k + hot));
      }
    }
  }
  function fires(dt: number) {
    for (let i = 0; i < MAX_FIRES; i++) {
      if (fi.life[i] <= 0) continue;
      fi.life[i] -= dt;
      if ((fi.emit[i] -= dt) > 0) continue;
      fi.emit[i] = LITE ? 0.3 : 0.15;
      const x = fi.x[i], z = fi.z[i], gy = groundY(x, z), r = fi.r[i];
      puffs(x, gy + 0.4, z, 1, r * 1.2, 2.5, 0.08);
      shards(x, z, 1, C.fire, 1.2, r * 0.8, gy + 0.3, 1.8);
    }
  }

  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), v = new THREE.Vector3(), ndc = new THREE.Vector2();
  const clampTarget = () => { const r = Math.hypot(tx, tz), max = ARENA_R * 0.75; if (r > max) { tx *= max / r; tz *= max / r; } };
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
    zoomBy: (f: number) => { dist = Math.min(ARENA_R * 2.5, Math.max(28, dist / f)); }, // out far enough to see the whole arena
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
        const [px, py] = project(e.x, e.z, flightAlt(e)), d = (px - cx) ** 2 + (py - cy) ** 2;
        if (d < bd) { bd = d; best = { x: e.x, z: e.z }; }
      }
      return best;
    },
    setCoverage(mode: number) { showCov = mode > 0; covMat.opacity = mode === 1 ? 0.4 : 1; },
    cameraYaw: () => yaw,
    target: () => ({ x: tx, z: tz }),
  };
}
