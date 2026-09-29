import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ARENA_R, ENEMIES, EW_ARC, FRONT, FRONT_ARC, VISUAL_R, KINDS, PAL, PAD_SLOTS, PERIM_R, type EnemyKind } from './config.ts';
import { emitting, focusBearing, radarRange, radarSector, freeSlots, padAngle, phase, shownKind, visible, type Shot, type State } from './sim.ts';

const MAX_ENEMIES = 2000, MAX_LOCKS = 64, MAX_SHOTS = 600, MAX_SHARDS = 2500, MAX_WAVES = 64, MAX_BEAMS = 3000, MAX_FRONTS = 48, MAX_BLIPS = 1024;
const VIS = 1.6; // enemies drawn bigger than their hitbox so they read at a glance
const TAU = Math.PI * 2;
const CURVE = 0.06; // CRT lens curve; pick/project undo it so clicks land where things are drawn
const { dim: DIM, mid: MID, bright: BRIGHT, hot: HOT, alert: ALERT } = PAL;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

const additive = (color = 0xffffff, wireframe = false) =>
  new THREE.MeshBasicMaterial({ color, wireframe, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.frustumCulled = false; m.count = 0;
  m.setColorAt(0, new THREE.Color()); // allocate instanceColor
  return m;
};
const lineLoop = (pts: THREE.Vector3[], color: number, opacity = 1) =>
  new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
const circlePts = (r: number, seg: number, y = 0, rot = 0) =>
  Array.from({ length: seg }, (_, i) => new THREE.Vector3(Math.cos(i / seg * TAU + rot) * r, y, Math.sin(i / seg * TAU + rot) * r));
// Drawn with `wireframe: true`, this geometry shows exactly the given segments (xyz pairs): each segment
// becomes a degenerate triangle (a, b, b). That's how InstancedMesh gets to draw instanced lines.
const segs = (p: ArrayLike<number>) => {
  const o: number[] = [];
  for (let i = 0; i < p.length; i += 6) for (const j of [0, 1, 2, 3, 4, 5, 3, 4, 5]) o.push(p[i + j]);
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(o, 3));
};
const edges = (g: THREE.BufferGeometry) => segs(new THREE.EdgesGeometry(g).attributes.position.array);
const ringPts = (n: number, every = 1) => Array.from({ length: n }, (_, i) => i % every ? [] : [
  Math.cos(i / n * TAU), 0, Math.sin(i / n * TAU), Math.cos((i + 1) / n * TAU), 0, Math.sin((i + 1) / n * TAU)]).flat();

// Polar grid, drawn once: range rings, bearing ticks + labels, faint noise. Canvas (x, y) maps to world (x, z).
function gridTexture(renderer: THREE.WebGLRenderer, R: number) {
  const N = 2048, k = N / 2 / R, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!, img = g.createImageData(N, N);
  for (let i = 0; i < img.data.length; i += 4) { const n = Math.random() ** 8 * 70; img.data[i] = n * 0.2; img.data[i + 1] = n; img.data[i + 2] = n * 0.5; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  g.translate(N / 2, N / 2); g.scale(k, k);
  g.strokeStyle = g.fillStyle = hex(MID); g.lineWidth = 1.5 / k;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '1.5px ui-monospace, monospace';
  const ring = (r: number, a: number) => { g.globalAlpha = a; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); };
  for (let r = 10; r < ARENA_R; r += 10) { ring(r, 0.35); g.globalAlpha = 0.6; g.fillText(String(r), Math.cos(-TAU / 16) * r, Math.sin(-TAU / 16) * r - 0.9); }
  ring(ARENA_R, 0.9);
  // The front: a hatched band inside the rim over FRONT ± FRONT_ARC, its edges dashed out from the base.
  g.globalAlpha = 0.3; g.setLineDash([2, 2]); g.beginPath();
  for (const a of [FRONT - FRONT_ARC, FRONT + FRONT_ARC]) { g.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); g.lineTo(Math.cos(a) * ARENA_R, Math.sin(a) * ARENA_R); }
  g.stroke(); g.setLineDash([]);
  g.globalAlpha = 0.55; g.beginPath();
  for (let a = FRONT - FRONT_ARC; a <= FRONT + FRONT_ARC; a += 0.02) {
    g.moveTo(Math.cos(a) * (ARENA_R - 5), Math.sin(a) * (ARENA_R - 5)); g.lineTo(Math.cos(a + 0.03) * (ARENA_R - 1), Math.sin(a + 0.03) * (ARENA_R - 1));
  }
  g.stroke();
  g.globalAlpha = 0.9; g.save(); g.rotate(FRONT); g.translate(ARENA_R - 8, 0); g.rotate(Math.PI / 2); g.fillText('F R O N T', 0, 0); g.restore();
  g.globalAlpha = 0.18; g.beginPath();
  for (let d = 0; d < 360; d += 30) { const a = d / 180 * Math.PI; g.moveTo(Math.cos(a) * 4, Math.sin(a) * 4); g.lineTo(Math.cos(a) * ARENA_R, Math.sin(a) * ARENA_R); }
  g.stroke();
  g.globalAlpha = 0.9; g.beginPath();
  for (let d = 0; d < 360; d += 2) {
    const a = d / 180 * Math.PI, l = d % 10 ? 0.8 : 2;
    g.moveTo(Math.cos(a) * ARENA_R, Math.sin(a) * ARENA_R); g.lineTo(Math.cos(a) * (ARENA_R + l), Math.sin(a) * (ARENA_R + l));
  }
  g.stroke();
  for (let d = 0; d < 360; d += 10) {
    g.save(); g.rotate(d / 180 * Math.PI); g.translate(ARENA_R + 4, 0); g.rotate(Math.PI / 2);
    g.fillText(String(d).padStart(3, '0'), 0, 0); g.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const CRT = {
  // blind: 0 = radar up, ~0.3 = EMCON, 1 = radar knocked out (static, rolling bars, drained colour).
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, curve: { value: CURVE }, blind: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, curve, blind; varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      c *= 1.0 + curve * dot(c, c);
      vec2 uv = c + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
      vec3 col = texture2D(tDiffuse, uv).rgb;
      float n = fract(sin(dot(uv * 913.0 + fract(time), vec2(12.9898, 78.233))) * 43758.5453);
      col = mix(col, vec3(dot(col, vec3(0.3, 0.6, 0.1))) * vec3(1.0, 0.5, 0.3), blind * 0.55);
      col += (n - 0.5) * vec3(0.012, 0.04, 0.02) * (1.0 + blind * 10.0);
      col += step(0.97, fract(uv.y * 2.0 - time * 0.6)) * blind * vec3(0.06, 0.03, 0.02);
      col *= 1.0 - 1.1 * dot(c, c);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.4, 0.3));
  composer.addPass(new OutputPass());
  const crt = new ShaderPass(CRT);
  composer.addPass(crt);
  let yaw = Math.PI / 2, zoom = 1.5;
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    const h = 95, w = h * innerWidth / innerHeight;
    Object.assign(camera, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2 });
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();

  // ---- arena ----
  const GR = ARENA_R + 8;
  const gridMat = new THREE.MeshBasicMaterial({ map: gridTexture(renderer, GR) });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(GR, 128).rotateX(-Math.PI / 2), gridMat);
  ground.position.y = -0.05; scene.add(ground);
  let gridFlash = 0;

  // ---- radar ----
  const radarRing = lineLoop(circlePts(1, 128, 0.05), BRIGHT, 0.5); scene.add(radarRing);
  const trackRing = lineLoop(circlePts(1, 128, 0.05), MID, 0.35); scene.add(trackRing);
  // Afterglow tail over (almost) the full circle, brightest right behind the leading line.
  const TAIL = TAU * 0.98, TSEG = 128;
  const tailGeo = new THREE.RingGeometry(0.02, 1, TSEG, 1, 0, TAIL);
  const tp = tailGeo.attributes.position, tc = new Float32Array(tp.count * 3), bc = new THREE.Color(BRIGHT);
  for (let i = 0; i < tp.count; i++) {
    const b = (1 - (i % (TSEG + 1)) / TSEG) ** 4 * 0.04;
    tc.set([bc.r * b, bc.g * b, bc.b * b], i * 3);
  }
  tailGeo.setAttribute('color', new THREE.BufferAttribute(tc, 3)).rotateX(-Math.PI / 2);
  const sweep = new THREE.Group();
  sweep.add(new THREE.Mesh(tailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
  sweep.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), new THREE.LineBasicMaterial({ color: HOT })));
  sweep.position.y = 0.06; scene.add(sweep);
  let lastSweep = 0;
  // AESA: no sweep. Faint beam dwells flash at random bearings at a fixed calm rate, whatever the scan rate,
  // and a contact leaves a blip each time it's re-detected.
  const DWELLS = 24, dwellMesh = instanced(new THREE.RingGeometry(0.06, 1, 6, 1, -0.1, 0.2).rotateX(-Math.PI / 2), additive(), DWELLS);
  const dw = { a: new Float32Array(DWELLS), life: new Float32Array(DWELLS), next: 0 };
  scene.add(dwellMesh);
  let dwellAcc = 0;
  // FOCUSED: a faint wedge over the searched arc, flickering like the AESA dwells.
  let focusW = 0;
  const focusMesh = new THREE.Mesh(new THREE.BufferGeometry(), additive(BRIGHT));
  focusMesh.position.y = 0.07; scene.add(focusMesh);
  const lastSeen = new WeakMap<object, number>();

  // ---- base: a Patriot battery, rebuilt when its shape key changes ----
  // Vehicles are built with +x as the business end (launch canisters, radar face). Parts listed in
  // `aimers` traverse toward their effector's target (keyed: 'pac' = the battery's, 'hel', 'hpm', 'pad<slot>'),
  // `sweepers` turn with the radar sweep; the number is the parent's yaw.
  let base = new THREE.Group(), baseKey = '';
  const aimers: [THREE.Object3D, number, string][] = [], sweepers: [THREE.Object3D, number][] = [];
  // Where each effector's rounds leave from: launcher muzzles (x, y, z), and the HEL / HPM apertures.
  let pacPts: number[][] = [], irisPts: number[][] = [], helPt = [0, 1.6, 0], hpmPt = [0, 1.6, 0];
  const fill = new THREE.MeshBasicMaterial({ color: 0x010603, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const edgeMats = new Map<number, THREE.LineBasicMaterial>();
  const solid = (geo: THREE.BufferGeometry, edge: number, x = 0, y = 0, z = 0, parent: THREE.Object3D = base, mat: THREE.Material = fill) => {
    const m = new THREE.Mesh(geo, mat);
    if (!edgeMats.has(edge)) edgeMats.set(edge, new THREE.LineBasicMaterial({ color: edge }));
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMats.get(edge)));
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
    if (cab) solid(box(0.9, 0.9, 1.3), MID, -len / 2 - 0.45, 0.8, 0, g);
    const axles = Math.max(2, Math.round(len / 1.1));
    for (let i = 0; i < axles; i++) for (const side of [-0.6, 0.6])
      solid(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8).rotateX(Math.PI / 2), MID, -len / 2 + 0.4 + i * (len - 0.8) / (axles - 1), 0.3, side, g);
    return g;
  };
  const tangent = (a: number) => -(a + Math.PI / 2), radial = (a: number) => -a;
  // Box of launch canisters raised to `elev`, muzzles toward +x.
  // Hinged at its rear end, just above the bed, like the real launchers.
  const canisters = (parent: THREE.Object3D, rows: number, cols: number, len: number, d: number, elev: number, x = 0) => {
    const pack = group(parent, x - len / 2, 0.8, 0); pack.rotation.z = elev;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++)
      solid(box(len, d, d).translate(len / 2, 0, 0), BRIGHT, 0, d * (i + 0.5), (j - (cols - 1) / 2) * d * 1.05, pack);
    return pack;
  };
  const slot = (i: number, n: number, off = 0) => i / n * TAU + off;

  function buildBase(s: State) {
    scene.remove(base);
    base = new THREE.Group(); aimers.length = sweepers.length = 0; pacPts = []; irisPts = [];
    const L = s.level, W = s.st.weapons, R1 = 3.6, R2 = 6.4, R3 = 9;

    // Before the radar is bought: a dug-in command post with a field mast, center.
    if (!s.st.radar) {
      solid(box(2.2, 0.9, 1.8), MID, 0, 0.45, 0, base);
      solid(box(1.2, 0.5, 1), BRIGHT, 0.2, 1.15, 0, base);
      solid(new THREE.CylinderGeometry(0.04, 0.06, 2.6, 5), MID, -0.7, 2.2, 0.5, base);
    }
    // AN/MPQ-65 phased-array radar on its trailer, center. With the AESA upgrade it becomes LTAMDS: extra rear arrays for 360° cover.
    const radar = group(base); aimers.push([radar, 0, 'pac']); radar.visible = s.st.radar;
    solid(box(2.4, 0.3, 1.4), MID, -0.3, 0.6, 0, radar);
    for (const x of [-1.1, -0.4]) for (const z of [-0.6, 0.6]) solid(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8).rotateX(Math.PI / 2), MID, x, 0.3, z, radar);
    solid(box(1.4, 0.9, 1.3), MID, -0.6, 1.2, 0, radar); // electronics shelter
    const face = group(radar, 0.7, 1.9, 0); face.rotation.z = 0.35; // leans back, looks up-range
    solid(box(0.25, 2.4, 2.2), BRIGHT, 0, 0, 0, face);
    face.add(lineLoop(Array.from({ length: 32 }, (_, i) => new THREE.Vector3(0.14, Math.sin(i / 32 * TAU) * 0.85, Math.cos(i / 32 * TAU) * 0.85)), HOT));
    for (const z of [-0.85, 0.85]) solid(box(0.1, 0.3, 0.3), HOT, 0.14, -0.95, z, face); // sidelobe cancellers
    if (s.st.aesa) for (const side of [-1, 1]) {
      const rear = group(radar, -1.1, 1.8, side * 0.45, side * (Math.PI - 1.05)); rear.rotation.z = 0.3;
      solid(box(0.2, 1.4, 1.2).translate(0.1, 0, 0), BRIGHT, 0, 0, 0, rear);
    }

    // Inner ring: support vehicles, then the add-on effectors.
    if (s.st.radar) { // Engagement Control Station: comes with the radar
      const ecsA = slot(0, 6, 0.3), ecs = vehicle(R1, ecsA, 2.2, tangent(ecsA));
      solid(box(1.8, 1.1, 1.2), BRIGHT, 0.1, 1.3, 0, ecs);
      for (const z of [-0.4, 0.4]) solid(box(0.04, 1.6, 0.04), MID, -0.6, 2.6, z, ecs);
    }
    if (L >= 2) { // EPP-III electric power plant: twin generator sets
      const a = slot(1, 6, 0.3), g = vehicle(R1, a, 2.4, tangent(a));
      for (const x of [-0.55, 0.55]) solid(box(0.95, 0.8, 1.1), MID, x, 1.15, 0, g);
    }
    if (L >= 3) { // OE-349 antenna mast group: comms relay to the other batteries
      const a = slot(2, 6, 0.3), g = vehicle(R1, a, 2, tangent(a));
      solid(box(1.2, 0.6, 1), MID, 0.2, 1, 0, g);
      solid(new THREE.CylinderGeometry(0.05, 0.08, 3.4, 5), BRIGHT, 0.4, 3, 0, g);
      for (const z of [-0.35, 0.35]) solid(new THREE.ConeGeometry(0.35, 0.25, 8, 1, true).rotateZ(Math.PI / 2), HOT, 0.4, 4.6, z, g);
    }
    if (L >= 4 && s.st.radar) { // Hensoldt TRML-4D: rotating 360° surveillance radar, turns with the sweep
      const a = slot(3, 6, 0.3), ry = tangent(a), g = vehicle(R1, a, 2.4, ry);
      solid(box(1.2, 0.7, 1.1), MID, -0.3, 1.1, 0, g);
      solid(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 5), MID, 0.6, 1.4, 0, g);
      const head = group(g, 0.6, 2.3, 0); sweepers.push([head, ry]);
      const tilt = group(head); tilt.rotation.z = 0.25;
      solid(box(0.2, 0.9, 1.9), HOT, 0, 0, 0, tilt);
    }
    if (W.pulse) { // HEL 50 kW laser weapon: beam director on a traversing mount
      const a = slot(4, 6, 0.3), ry = tangent(a), g = vehicle(R1, a, 2.2, ry);
      solid(box(1.3, 0.7, 1.1), MID, -0.2, 1.1, 0, g);
      const t = group(g, 0.5, 1.5, 0); aimers.push([t, ry, 'hel']);
      helPt = [Math.cos(a) * R1, 2.15, Math.sin(a) * R1];
      solid(new THREE.CylinderGeometry(0.35, 0.4, 0.4, 8), BRIGHT, 0, 0.2, 0, t);
      solid(new THREE.CylinderGeometry(0.28, 0.28, 0.7, 8).rotateZ(Math.PI / 2), HOT, 0.2, 0.65, 0, t);
    }
    if (W.rail) { // Epirus Leonidas HPM: flat microwave array in a container
      const a = slot(5, 6, 0.3), ry = tangent(a), g = vehicle(R1, a, 2.4, ry);
      solid(box(2, 0.9, 1.2), MID, 0, 1.2, 0, g);
      const t = group(g, 0.2, 1.7, 0); aimers.push([t, ry, 'hpm']);
      hpmPt = [Math.cos(a) * R1, 2.4, Math.sin(a) * R1];
      const panel = group(t, 0, 0.7, 0); panel.rotation.z = 0.3;
      solid(box(0.2, 1.3, 1.3), HOT, 0, 0, 0, panel);
      for (let i = 1; i < 4; i++) solid(box(0.02, 1.3, 0.02), BRIGHT, 0.11, 0, -0.65 + i * 0.325, panel);
    }

    // Level 6: a second fire control shelter (ICC) with whip antennas, out between the IRIS-T slots.
    if (L >= 6 && s.st.radar) {
      const a = TAU / 8, g = vehicle(R3, a, 2.2, tangent(a));
      solid(box(1.7, 1.1, 1.2), BRIGHT, 0.1, 1.3, 0, g);
      for (const x of [-0.5, 0.6]) solid(box(0.04, 1.8, 0.04), MID, x, 2.7, 0.45, g);
    }
    // Level 7: hardened command node, a sloped concrete bunker with a blast door and a mast.
    if (L >= 7) {
      const a = TAU * 5 / 8, g = group(base, Math.cos(a) * R3, 0, Math.sin(a) * R3, radial(a));
      solid(new THREE.CylinderGeometry(1.2, 1.9, 1.2, 4, 1).rotateY(Math.PI / 4), BRIGHT, 0, 0.6, 0, g);
      solid(box(0.15, 0.7, 0.8), HOT, 1.25, 0.35, 0, g);
      solid(new THREE.CylinderGeometry(0.04, 0.06, 2.2, 5), MID, -0.4, 2.2, 0, g);
    }

    // Outer ring: M903 launching stations, one more per base level (a real battery fields up to 8).
    // Four PAC-3 MSE canisters each, raised to 38° and traversing toward the target.
    for (let i = 0; i < (W.cannon ? Math.min(8, L + 1) : 0); i++) {
      const a = slot(i, 8, TAU / 16), ry = radial(a), g = vehicle(R2, a, 2.8, ry, false);
      aimers.push([canisters(g, 2, 2, 2.6, 0.5, 0.66, 0.1), ry, 'pac']);
      pacPts.push([Math.cos(a) * R2, 2.4, Math.sin(a) * R2]);
      if (L >= 5) solid(box(0.4, 0.7, 3).rotateY(ry), MID, Math.cos(a) * (R2 + 2.4), 0.35, Math.sin(a) * (R2 + 2.4)); // earth berm
    }
    // IRIS-T SLX launchers: 8 canisters, steep launch, one per upgrade level (max 4).
    for (let i = 0; i < Math.min(4, s.lv.missile ?? 0); i++) {
      const a = slot(i, 4), ry = radial(a), g = vehicle(R3, a, 2.6, ry);
      aimers.push([canisters(g, 2, 4, 2.2, 0.32, 1.05, 0.2), ry, 'pac']);
      irisPts.push([Math.cos(a) * R3, 2.7, Math.sin(a) * R3]);
    }
    // Perimeter pads: 12.7mm MG in a sandbag ring, MANTIS gun turret, Stinger team, EW jammer mast.
    for (const p of s.perim) {
      const a = Math.atan2(p.z, p.x), ry = radial(a), g = group(base, p.x, 0, p.z, ry);
      solid(box(1.6, 0.3, 1.6), MID, 0, 0.15, 0, g);
      if (p.k === 'mg') {
        solid(new THREE.CylinderGeometry(0.75, 0.8, 0.35, 8), MID, 0, 0.45, 0, g); // sandbags
        const t = group(g, 0, 0.6, 0); aimers.push([t, ry, `pad${p.slot}`]);
        solid(box(0.35, 0.3, 0.3), BRIGHT, 0, 0.2, 0, t);
        solid(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 4).rotateZ(Math.PI / 2), HOT, 0.6, 0.25, 0, t);
      } else if (p.k === 'mantis') {
        const t = group(g, 0, 0.3, 0); aimers.push([t, ry, `pad${p.slot}`]);
        solid(box(0.9, 0.7, 0.9), BRIGHT, 0, 0.35, 0, t);
        solid(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 5).rotateZ(Math.PI / 2), HOT, 1.1, 0.5, 0, t);
      } else if (p.k === 'stinger') {
        canisters(g, 1, 2, 1.4, 0.25, 0.5, -0.3);
      } else {
        solid(new THREE.CylinderGeometry(0.05, 0.07, 2.4, 5), MID, 0, 1.4, 0, g);
        const head = group(g, 0, 2.6, 0); sweepers.push([head, ry]);
        solid(new THREE.ConeGeometry(0.45, 0.3, 8, 1, true).rotateZ(Math.PI / 2), HOT, 0.2, 0, 0, head);
      }
    }
    scene.add(base);
  }

  // ---- instanced pools ----
  // Enemies: near-black fill (hides what's behind) + glowing edges. Types differ by shape, brightness and blink.
  const geos: Record<EnemyKind, THREE.BufferGeometry> = {
    scout: new THREE.ConeGeometry(0.55, 1.5, 3).rotateZ(-Math.PI / 2),
    drone: new THREE.OctahedronGeometry(0.65),
    swarm: new THREE.TetrahedronGeometry(0.7),
    tank: new THREE.BoxGeometry(1.2, 0.8, 1.2),
    elite: new THREE.DodecahedronGeometry(0.65),
    decoy: new THREE.OctahedronGeometry(0.65), // same as the Shahed; only drawn once classified
    arm: new THREE.ConeGeometry(0.22, 1.8, 4).rotateZ(-Math.PI / 2),
    ew: new THREE.CylinderGeometry(0.75, 0.75, 0.45, 6),
    tbm: new THREE.ConeGeometry(0.35, 2.4, 6).rotateZ(-Math.PI / 2),
  };
  const wire = new THREE.MeshBasicMaterial({ wireframe: true });
  const enemyFills = {} as Record<EnemyKind, THREE.InstancedMesh>, enemyEdges = {} as Record<EnemyKind, THREE.InstancedMesh>;
  for (const k of KINDS) scene.add(enemyFills[k] = instanced(geos[k], fill, MAX_ENEMIES), enemyEdges[k] = instanced(edges(geos[k]), wire, MAX_ENEMIES));

  // Corner-bracket reticle ⌐ ¬, billboarded to the camera.
  const bracketPts: number[] = [];
  for (const [x, y] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) bracketPts.push(x, y, 0, x * 0.5, y, 0, x, y, 0, x, y * 0.5, 0);
  const brackets = instanced(segs(bracketPts), additive(0xffffff, true), MAX_LOCKS);
  const hpBars = instanced(new THREE.PlaneGeometry(1, 0.22).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({ depthTest: false, transparent: true }), MAX_LOCKS);
  hpBars.renderOrder = 10;
  // Marked target: rotating dashed ring with inward ticks, plus a dashed line to the base.
  const markPts = ringPts(24, 2);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + TAU / 48; markPts.push(Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35, Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8); }
  const markRing = new THREE.Mesh(segs(markPts), additive(HOT, true));
  const markLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.3, 0), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: HOT, dashSize: 1.2, gapSize: 0.9, transparent: true, opacity: 0.6 }));
  markLine.frustumCulled = false;
  scene.add(brackets, hpBars, markRing, markLine);
  const lockLinePos = new Float32Array(MAX_LOCKS * 6);
  const lockLines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(lockLinePos, 3)), new THREE.LineBasicMaterial({ color: MID, transparent: true, opacity: 0.25 }));
  lockLines.frustumCulled = false; scene.add(lockLines);

  const shells = instanced(new THREE.BoxGeometry(0.3, 0.3, 1.6), additive(), MAX_SHOTS);
  const tracers = instanced(new THREE.BoxGeometry(0.1, 0.1, 2.6), additive(), MAX_SHOTS); // MANTIS 35mm: thin, long, low
  const missiles = instanced(edges(new THREE.ConeGeometry(0.35, 1.3, 4).rotateX(Math.PI / 2)), wire, MAX_SHOTS);
  const shardMesh = instanced(segs([-0.5, 0, 0, 0.5, 0, 0]), additive(0xffffff, true), MAX_SHARDS);
  const waveMesh = instanced(segs(ringPts(48)), additive(0xffffff, true), MAX_WAVES);
  // Beams and trails: unit box stretched between two points (HEL beams, HPM band, exhaust and smoke trails).
  const beamMesh = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0), additive(), MAX_BEAMS);
  // HPM wavefronts: three thin arcs, scaled out from the array along the firing bearing.
  const frontPts: number[] = [];
  for (const r of [0.97, 1, 1.03]) for (let i = 0; i < 6; i++) {
    const a = (i / 6 - 0.5) * 0.12, b = ((i + 1) / 6 - 0.5) * 0.12;
    frontPts.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(b) * r, 0, Math.sin(b) * r);
  }
  const frontMesh = instanced(segs(frontPts), additive(0xffffff, true), MAX_FRONTS);
  const blipMesh = instanced(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), additive(), MAX_BLIPS);
  // Jammed sector: a faint amber wedge from the battery out along each Mi-8's bearing.
  const jamMesh = instanced(new THREE.RingGeometry(0.08, 1, 12, 1, -EW_ARC, EW_ARC * 2).rotateX(-Math.PI / 2), additive(), 16);
  scene.add(shells, tracers, missiles, shardMesh, waveMesh, beamMesh, frontMesh, blipMesh, jamMesh);
  // Incoming raid: three amber chevrons at the rim, pointing in along its bearing.
  const chevPts: number[] = [];
  for (let i = 0; i < 3; i++) chevPts.push(0.6 - i, 0, -0.8, -i, 0, 0, -i, 0, 0, 0.6 - i, 0, 0.8);
  const raidMark = new THREE.Mesh(segs(chevPts), additive(ALERT, true));
  raidMark.visible = false; scene.add(raidMark);
  // Free pad spots, shown while a bought pad waits to be placed.
  const padMarks = instanced(segs(ringPts(16, 2)), additive(0xffffff, true), PAD_SLOTS);
  scene.add(padMarks);

  // Particle pools: flat arrays, ring-buffer allocation, no per-frame garbage.
  const sh = { p: new Float32Array(MAX_SHARDS * 3), v: new Float32Array(MAX_SHARDS * 3), life: new Float32Array(MAX_SHARDS), max: new Float32Array(MAX_SHARDS), col: new Float32Array(MAX_SHARDS * 3), size: new Float32Array(MAX_SHARDS), next: 0 };
  const wv = { x: new Float32Array(MAX_WAVES), z: new Float32Array(MAX_WAVES), r: new Float32Array(MAX_WAVES), life: new Float32Array(MAX_WAVES), max: new Float32Array(MAX_WAVES), col: new Float32Array(MAX_WAVES * 3), next: 0 };
  // grow: 0 = beam (thins as it fades), 1 = smoke (spreads as it fades).
  const bm = { a: new Float32Array(MAX_BEAMS * 6), w: new Float32Array(MAX_BEAMS), life: new Float32Array(MAX_BEAMS), max: new Float32Array(MAX_BEAMS), col: new Float32Array(MAX_BEAMS * 3), grow: new Uint8Array(MAX_BEAMS), next: 0 };
  const fr = { x: new Float32Array(MAX_FRONTS), y: new Float32Array(MAX_FRONTS), z: new Float32Array(MAX_FRONTS), a: new Float32Array(MAX_FRONTS), t: new Float32Array(MAX_FRONTS), max: new Float32Array(MAX_FRONTS), next: 0 };
  // Per-shot render state: where it left from (the sim launches PAC-3 / IRIS-T from the battery centre, the
  // round is drawn from its launcher and eases onto the sim path), its age, and where it was last drawn.
  const shotFx = new WeakMap<Shot, { ox: number; oy: number; oz: number; age: number; px: number; py: number; pz: number }>();
  const bl = { x: new Float32Array(MAX_BLIPS), z: new Float32Array(MAX_BLIPS), r: new Float32Array(MAX_BLIPS), life: new Float32Array(MAX_BLIPS), max: new Float32Array(MAX_BLIPS), next: 0 };
  const tmpC = new THREE.Color();

  function shards(x: number, z: number, n: number, color: number, speed = 12, size = 1, y = 1, k = 1) {
    tmpC.setHex(color).multiplyScalar(k);
    for (let j = 0; j < n; j++) {
      const i = sh.next = (sh.next + 1) % MAX_SHARDS;
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random());
      sh.p.set([x, y, z], i * 3);
      sh.v.set([Math.cos(a) * v, 4 + Math.random() * speed, Math.sin(a) * v], i * 3);
      sh.life[i] = sh.max[i] = 0.4 + Math.random() * 0.6;
      sh.col.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
      sh.size[i] = size * (0.8 + Math.random());
    }
  }
  function wave(x: number, z: number, r: number, color: number, life = 0.5, k = 1) {
    const i = wv.next = (wv.next + 1) % MAX_WAVES;
    wv.x[i] = x; wv.z[i] = z; wv.r[i] = r; wv.life[i] = wv.max[i] = life;
    tmpC.setHex(color).multiplyScalar(k); wv.col.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  }
  function beam(x: number, y: number, z: number, x2: number, y2: number, z2: number, w: number, color: number, life: number, k = 1, grow = 0) {
    const i = bm.next = (bm.next + 1) % MAX_BEAMS;
    const a = bm.a, j = i * 6;
    a[j] = x; a[j + 1] = y; a[j + 2] = z; a[j + 3] = x2; a[j + 4] = y2; a[j + 5] = z2;
    bm.w[i] = w; bm.life[i] = bm.max[i] = life; bm.grow[i] = grow;
    tmpC.setHex(color).multiplyScalar(k); bm.col[i * 3] = tmpC.r; bm.col[i * 3 + 1] = tmpC.g; bm.col[i * 3 + 2] = tmpC.b;
  }
  // Laser: wide soft glow around a white-hot core, and a splash of sparks where it lands.
  function laser(x: number, y: number, z: number, x2: number, z2: number) {
    beam(x, y, z, x2, 1.4, z2, 0.5, BRIGHT, 0.16, 0.45);
    beam(x, y, z, x2, 1.4, z2, 0.14, 0xeaffee, 0.12);
    shards(x2, z2, 2, 0xeaffee, 5, 0.5, 1.4);
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

  const KILL_SHARDS: Record<EnemyKind, number> = { swarm: 3, scout: 4, drone: 6, tank: 12, elite: 20, decoy: 4, arm: 5, ew: 12, tbm: 10 };
  function consume(s: State) {
    for (const e of s.events) {
      switch (e.k) {
        case 'kill': {
          const T = ENEMIES[e.kind!];
          shards(e.x, e.z, KILL_SHARDS[e.kind!], BRIGHT, 10 + T.size * 3, T.size * 1.5, 1, T.glow);
          shards(e.x, e.z, 2, HOT, 8, 0.8);
          wave(e.x, e.z, T.size * 4, BRIGHT, 0.4, T.glow);
          wave(e.x, e.z, T.size * 2, HOT, 0.25);
          break;
        }
        case 'hit': e.n ? (wave(e.x, e.z, e.n, HOT, 0.35), shards(e.x, e.z, 6, BRIGHT, 10)) : shards(e.x, e.z, 2, HOT, 6, 0.5); break;
        case 'baseHit': wave(0, 0, 9, ALERT, 0.5, 1.5); shards(e.x, e.z, 10, ALERT, 12, 1.2); gridFlash = 1; break;
        case 'gun': { // MG / MANTIS: the pad's turret swings onto the target, muzzle flash at the barrel tip
          const a = Math.atan2(e.z2 - e.z, e.x2 - e.x), p = s.perim.find(p => Math.abs(p.x - e.x) + Math.abs(p.z - e.z) < 0.01);
          if (p) aimT.set(`pad${p.slot}`, a);
          const tip = p?.k === 'mg' ? 1.15 : 1.9;
          shards(e.x + Math.cos(a) * tip, e.z + Math.sin(a) * tip, 2, 0xffffff, 3, 0.4, 0.8);
          break;
        }
        case 'beam': // from the HEL (sim fires from the centre), or a hop between contacts (ARC LASER, OVERKILL)
          if (e.x || e.z) laser(e.x, 1.4, e.z, e.x2, e.z2);
          else { aimT.set('hel', Math.atan2(e.z2 - helPt[2], e.x2 - helPt[0])); laser(helPt[0], helPt[1], helPt[2], e.x2, e.z2); }
          break;
        case 'rail': { // HPM: a shimmering band down the line, crossed by wavefronts rolling out from the array
          const [x, y, z] = hpmPt, a = Math.atan2(e.z2 - z, e.x2 - x), len = Math.hypot(e.x2 - x, e.z2 - z);
          aimT.set('hpm', a);
          beam(x, y, z, e.x2, 1.4, e.z2, 2.2, BRIGHT, 0.4, 0.12);
          beam(x, y, z, e.x2, 1.4, e.z2, 0.25, HOT, 0.3, 0.6);
          for (let i = 0; i < 6; i++) front(x, y, z, a, i * 0.05, len);
          wave(x, z, 4, HOT, 0.3);
          break;
        }
        case 'level': wave(0, 0, 40, BRIGHT, 1.2, 1.5); wave(0, 0, 25, HOT, 0.9); shards(0, 0, 40, BRIGHT, 20, 1.2, 3); gridFlash = 0.6; break;
        case 'warning': wave(0, 0, ARENA_R, ALERT, 1.5, 1.5); break;
        case 'arm': wave(e.x, e.z, 6, ALERT, 0.8, 1.5); break;
        case 'tbm': wave(e.x, e.z, 4, ALERT, 0.6); break;
        case 'jam': wave(e.x, e.z, 8, ALERT, 1.2); break;
        case 'ident': wave(e.x, e.z, 3, MID, 0.4); break;
        case 'acquire': wave(e.x, e.z, 3.5, HOT, 0.25, 0.8); break; // brackets snap on
        case 'lost': wave(e.x, e.z, 2.5, ALERT, 0.3, 0.6); break;
        case 'radarDown': wave(0, 0, 14, ALERT, 0.8, 1.5); shards(0, 1.9, 30, ALERT, 14, 1, 2.5); gridFlash = 1; break;
        case 'intercept': wave(e.x, e.z, 8, HOT, 0.6, 1.5); wave(0, 0, 12, HOT, 0.5); break;
        case 'emcon': wave(0, 0, radarRange(s), MID, 0.6); break;
        case 'radarMode': wave(0, 0, radarRange(s), BRIGHT, 0.5); break;
        case 'raid': wave(e.x, e.z, 14, ALERT, 1.2, 1.5); break;
        case 'package': wave(e.x, e.z, 9, ALERT, 1); break;
        case 'raidStart': wave(e.x, e.z, 20, ALERT, 1.5, 1.5); wave(0, 0, ARENA_R, ALERT, 1.2); break;
        case 'raidLeak': wave(0, 0, 18, ALERT, 1, 1.5); gridFlash = 0.8; break;
        case 'raidClear': wave(0, 0, 30, HOT, 1, 1.5); shards(0, 0, 30, HOT, 18, 1, 3); break;
      }
    }
  }

  const pools = [...Object.values(enemyFills), ...Object.values(enemyEdges), brackets, hpBars, shells, tracers, missiles, shardMesh, waveMesh, beamMesh, frontMesh, blipMesh, jamMesh, padMarks, dwellMesh];
  const sent = new Map<THREE.InstancedMesh, number>();
  const dummy = new THREE.Object3D();
  const camRight = new THREE.Vector3();
  const markEnd = markLine.geometry.attributes.position as THREE.BufferAttribute;
  const dir = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
  let clock = 0;

  function render(s: State, dt: number) {
    clock += dt;
    consume(s);
    const key = `${s.level}${s.st.radar}${!!s.st.weapons.cannon}${s.st.aesa}${!!s.st.weapons.pulse}${s.lv.missile ?? 0}${!!s.st.weapons.rail}${s.perim.length}`;
    if (key !== baseKey) { baseKey = key; buildBase(s); }

    // camera
    const d = 150, pitch = 0.72;
    const sx = (Math.random() - 0.5) * s.shake * 1.6, sz = (Math.random() - 0.5) * s.shake * 1.6;
    camera.position.set(Math.cos(yaw) * Math.cos(pitch) * d + sx, Math.sin(pitch) * d, Math.sin(yaw) * Math.cos(pitch) * d + sz);
    camera.lookAt(sx, 0, sz);
    camera.zoom = zoom; camera.updateProjectionMatrix();
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);

    // radar (or eyesight) + base
    const on = emitting(s);
    const rr = s.st.radar ? radarRange(s) : VISUAL_R, sector = radarSector(s); // no radar: the ring shows eyesight
    sweep.rotation.y = -s.sweepA; sweep.scale.setScalar(rr); sweep.visible = on && !s.st.aesa && !sector;
    radarRing.scale.setScalar(rr);
    focusMesh.visible = on && sector > 0;
    if (focusMesh.visible) {
      if (focusW !== sector) { focusW = sector; focusMesh.geometry.dispose(); focusMesh.geometry = new THREE.RingGeometry(0.03, 1, 32, 1, -sector / 2, sector).rotateX(-Math.PI / 2); }
      focusMesh.rotation.y = -focusBearing(s); focusMesh.scale.setScalar(rr);
      (focusMesh.material as THREE.MeshBasicMaterial).color.setHex(BRIGHT).multiplyScalar(0.006 + 0.004 * Math.random());
    }
    (radarRing.material as THREE.LineBasicMaterial).opacity = on ? 0.5 : 0.12 + 0.08 * Math.sin(clock * 6);
    trackRing.scale.setScalar(s.st.trackRange);
    gridFlash = Math.max(0, gridFlash - dt * 2.5);
    gridMat.color.setScalar((phase(s).mod.dark ? 0.45 : 1) + gridFlash * 4);
    raidMark.visible = !!s.raid || s.raidLeft > 0; // warning: pulsing in; attack: held steady on the raid's bearing
    padMarks.count = 0;
    if (s.placing) for (const i of freeSlots(s)) {
      dummy.position.set(Math.cos(padAngle(i)) * PERIM_R, 0.15, Math.sin(padAngle(i)) * PERIM_R);
      dummy.rotation.set(0, clock, 0); dummy.scale.setScalar(1.6 + 0.3 * Math.sin(clock * 6));
      dummy.updateMatrix(); padMarks.setMatrixAt(padMarks.count, dummy.matrix);
      padMarks.setColorAt(padMarks.count++, tmpC.setHex(HOT));
    }
    if (raidMark.visible) {
      const a = s.raid ? s.raid.a : s.raidA, pulse = s.raid ? (clock * 1.5) % 1 : 0.5 + 0.2 * Math.sin(clock * 3);
      raidMark.position.set(Math.cos(a) * (ARENA_R - 1 - pulse * 3), 0.2, Math.sin(a) * (ARENA_R - 1 - pulse * 3));
      raidMark.rotation.y = -a; raidMark.scale.setScalar(2.2);
      (raidMark.material as THREE.MeshBasicMaterial).color.setHex(ALERT).multiplyScalar(0.6 + 0.8 * (1 - pulse));
    }
    aimT.set('pac', s.aim);
    for (const [k, t] of aimT) {
      const c = aimCur.get(k) ?? t, da = ((t - c + Math.PI) % TAU + TAU) % TAU - Math.PI;
      aimCur.set(k, c + da * Math.min(1, dt * 15));
    }
    for (const [o, ry, k] of aimers) o.rotation.y = -(aimCur.get(k) ?? aimCur.get('pac')!) - ry;
    for (const [o, ry] of sweepers) o.rotation.y = -s.sweepA - ry;

    // Blip ghosts: every detected contact the sweep passes this frame leaves a mark that fades over one revolution.
    const swept = ((s.sweepA - lastSweep) % TAU + TAU) % TAU, r2 = rr ** 2;
    dwellMesh.count = 0;
    if (s.st.aesa || sector) {
      if (on && !sector && s.phase === 'play' && (dwellAcc += dt * 5) >= 1) { dwellAcc = 0; dw.a[dw.next] = Math.random() * TAU; dw.life[dw.next] = 0.6; dw.next = (dw.next + 1) % DWELLS; }
      for (let i = 0; i < DWELLS; i++) {
        if (dw.life[i] <= 0) continue;
        if (s.phase === 'play') dw.life[i] -= dt;
        dummy.position.set(0, 0.07, 0); dummy.rotation.set(0, -dw.a[i], 0); dummy.scale.setScalar(rr);
        dummy.updateMatrix(); dwellMesh.setMatrixAt(dwellMesh.count, dummy.matrix);
        dwellMesh.setColorAt(dwellMesh.count++, tmpC.setHex(BRIGHT).multiplyScalar(0.025 * Math.max(0, dw.life[i] / 0.6)));
      }
      for (const e of s.enemies) {
        if (e.locked || e.seenUntil <= (lastSeen.get(e) ?? -1)) continue;
        lastSeen.set(e, e.seenUntil);
        if (e.seenUntil > s.t) blip(e.x, e.z, e.size * VIS * 0.7, 1.5);
      }
    } else if (swept > 0 && swept < 1) for (const e of s.enemies) {
      if (!visible(s, e) || e.x * e.x + e.z * e.z > r2) continue;
      if (((Math.atan2(e.z, e.x) - lastSweep) % TAU + TAU) % TAU <= swept) blip(e.x, e.z, e.size * VIS * 0.7, TAU / Math.max(0.5, s.sweepSpeed));
    }
    lastSweep = s.sweepA;

    // Jammers: amber wedge, and a noise strobe of false returns along their bearing while the radar radiates.
    jamMesh.count = 0;
    for (const e of s.enemies) {
      if (e.kind !== 'ew' || !e.orbit || jamMesh.count >= 16) continue;
      const a = Math.atan2(e.z, e.x);
      dummy.position.set(0, 0.08, 0); dummy.rotation.set(0, -a, 0); dummy.scale.setScalar(rr);
      dummy.updateMatrix(); jamMesh.setMatrixAt(jamMesh.count, dummy.matrix);
      jamMesh.setColorAt(jamMesh.count++, tmpC.setHex(ALERT).multiplyScalar(0.012 + 0.008 * Math.random()));
      if (on && s.phase === 'play' && Math.random() < 0.6) {
        const r = 5 + Math.random() * (rr - 5), b = a + (Math.random() - 0.5) * EW_ARC;
        blip(Math.cos(b) * r, Math.sin(b) * r, 0.4 + Math.random() * 0.8, 0.5);
      }
    }

    // enemies, locks, hp bars
    for (const k of KINDS) enemyFills[k].count = enemyEdges[k].count = 0;
    let nl = 0, marked = false;
    for (const e of s.enemies) {
      if (!visible(s, e)) continue;
      const k = shownKind(e), f = enemyFills[k], m = enemyEdges[k], T = ENEMIES[k];
      if (m.count >= MAX_ENEMIES) continue;
      const fade = e.locked ? 1 : Math.max(0.2, Math.min(1, (e.seenUntil - s.t) / 1.5));
      let b = e.locked ? 1.3 : T.glow * fade;
      if (e.kind === 'tank') b *= 0.55 + 0.45 * Math.sin(clock * 5 + e.id); // slow pulse
      if (e.kind === 'elite') b *= Math.sin(clock * 20 + e.id) > 0 ? 1 : 0.2; // hard strobe
      if (k === 'decoy') b *= 0.35; // classified: a ghost
      if (k === 'tbm') b *= Math.sin(clock * 30 + e.id) > 0 ? 1.4 : 0.5; // fast strobe
      const col = k === 'arm' || k === 'tbm' ? ALERT : e.locked ? HOT : BRIGHT; // missiles on the battery are amber
      const sz = e.size * VIS;
      dummy.position.set(e.x, sz * 0.6, e.z);
      dummy.rotation.set(k === 'drone' || k === 'elite' ? clock * 2 : 0, -Math.atan2(e.vz, e.vx) + (k === 'swarm' ? clock * 6 : k === 'ew' ? clock : 0), 0);
      dummy.scale.setScalar(sz);
      dummy.updateMatrix();
      f.setMatrixAt(f.count++, dummy.matrix);
      m.setMatrixAt(m.count, dummy.matrix);
      m.setColorAt(m.count++, tmpC.setHex(col).multiplyScalar(b));
      if (e.id === s.marked) {
        marked = true;
        markRing.position.set(e.x, 0.1, e.z);
        markRing.rotation.y = clock * 2;
        markRing.scale.setScalar(sz * (1.3 + Math.sin(clock * 8) * 0.08));
        markEnd.setXYZ(1, e.x, 0.3, e.z); markEnd.needsUpdate = true;
        markLine.computeLineDistances();
      }
      if (e.locked && nl < MAX_LOCKS) {
        dummy.position.set(e.x, sz * 0.6, e.z); dummy.quaternion.copy(camera.quaternion); dummy.scale.setScalar(sz * 0.9);
        dummy.updateMatrix();
        brackets.setMatrixAt(nl, dummy.matrix);
        brackets.setColorAt(nl, tmpC.setHex(HOT).multiplyScalar(e.id === s.marked ? 1.5 : 0.8));
        const r = Math.max(0, e.hp / e.maxHp);
        dummy.position.set(e.x, sz + 1.4, e.z).addScaledVector(camRight, -sz);
        dummy.scale.set(Math.max(0.01, sz * 2 * r), 1, 1);
        dummy.updateMatrix();
        hpBars.setMatrixAt(nl, dummy.matrix);
        hpBars.setColorAt(nl, tmpC.setHex(BRIGHT).multiplyScalar(0.4 + 0.6 * r));
        lockLinePos.set([0, 1, 0, e.x, 0.3, e.z], nl * 6);
        nl++;
      }
    }
    markRing.visible = markLine.visible = marked;
    brackets.count = hpBars.count = nl;
    lockLines.geometry.setDrawRange(0, nl * 2);
    lockLines.geometry.attributes.position.needsUpdate = true;

    // Shots. PAC-3: hot dart with a short exhaust flare. IRIS-T / Stinger: wire airframe laying a smoke
    // trail that spreads and fades, so a homing turn stays readable. MANTIS: long thin tracer.
    shells.count = tracers.count = missiles.count = 0;
    const play = s.phase === 'play';
    for (const p of s.shots) {
      const tracer = p.kind === 'tracer', stinger = p.src === 'STINGER', y0 = tracer ? 1 : 1.6;
      let f = shotFx.get(p);
      if (!f) { // first frame: pick the launcher facing the shot, flash its muzzle
        const pts = p.src === 'PAC-3' ? pacPts : p.src === 'IRIS-T' ? irisPts : null;
        let o = [p.x, tracer ? 1 : 1.1, p.z];
        if (pts?.length) {
          const h = Math.atan2(p.vz, p.vx);
          let bd = Infinity;
          for (const q of pts) { const d = Math.abs(((Math.atan2(q[2], q[0]) - h + Math.PI) % TAU + TAU) % TAU - Math.PI); if (d < bd) { bd = d; o = q; } }
        }
        f = { ox: o[0] - p.x, oy: o[1] - y0, oz: o[2] - p.z, age: 0, px: o[0], py: o[1], pz: o[2] };
        shotFx.set(p, f);
        if (!tracer) { shards(o[0], o[2], p.kind === 'shell' ? 5 : 4, HOT, 4, 0.5, o[1]); wave(o[0], o[2], stinger ? 1.2 : 2, HOT, 0.25, 0.7); }
      }
      if (play) f.age += dt;
      const blend = p.kind === 'shell' ? 0.25 : 0.6, u = Math.min(1, f.age / blend), k = (1 - u) * (1 - u) * (1 + 2 * u); // smoothstep out
      const x = p.x + f.ox * k, y = y0 + f.oy * k, z = p.z + f.oz * k;
      const dx = x - f.px, dy = y - f.py, dz = z - f.pz, moved = dx * dx + dy * dy + dz * dz > 1e-6;
      if (moved && !tracer) {
        if (p.kind === 'shell') beam(f.px, f.py, f.pz, x, y, z, 0.22, HOT, 0.12, 0.9);
        else { // pale smoke that lingers and spreads, over a short hot flame at the motor
          beam(f.px, f.py, f.pz, x, y, z, stinger ? 0.2 : 0.3, HOT, stinger ? 0.5 : 0.8, 0.4, 1);
          beam(f.px, f.py, f.pz, x, y, z, 0.16, HOT, 0.07);
        }
      }
      f.px = x; f.py = y; f.pz = z;
      const m = p.kind === 'shell' ? shells : tracer ? tracers : missiles;
      if (m.count >= MAX_SHOTS) continue;
      dummy.position.set(x, y, z);
      if (moved) dummy.lookAt(x + dx, y + dy, z + dz); else dummy.rotation.set(0, Math.atan2(p.vx, p.vz), 0);
      dummy.scale.setScalar(stinger ? 0.7 : 1);
      dummy.updateMatrix(); m.setMatrixAt(m.count, dummy.matrix);
      m.setColorAt(m.count++, tracer ? tmpC.setHex(0xffffff) : tmpC.setHex(p.kind === 'shell' ? HOT : BRIGHT));
    }

    // particles
    shardMesh.count = 0;
    for (let i = 0; i < MAX_SHARDS; i++) {
      if (sh.life[i] <= 0) continue;
      sh.life[i] -= dt;
      const r = Math.max(0, sh.life[i] / sh.max[i]), j = i * 3;
      sh.v[j + 1] -= 30 * dt;
      sh.p[j] += sh.v[j] * dt; sh.p[j + 1] += sh.v[j + 1] * dt; sh.p[j + 2] += sh.v[j + 2] * dt;
      if (sh.p[j + 1] < 0) { sh.p[j + 1] = 0; sh.v[j + 1] *= -0.4; sh.v[j] *= 0.6; sh.v[j + 2] *= 0.6; }
      dummy.position.set(sh.p[j], sh.p[j + 1], sh.p[j + 2]);
      dummy.rotation.set(i + clock * 7, i * 2 + clock * 5, 0);
      dummy.scale.setScalar(sh.size[i] * (0.3 + 0.7 * r));
      dummy.updateMatrix();
      shardMesh.setMatrixAt(shardMesh.count, dummy.matrix);
      shardMesh.setColorAt(shardMesh.count++, tmpC.setRGB(sh.col[j] * r, sh.col[j + 1] * r, sh.col[j + 2] * r));
    }
    waveMesh.count = 0;
    for (let i = 0; i < MAX_WAVES; i++) {
      if (wv.life[i] <= 0) continue;
      wv.life[i] -= dt;
      const r = Math.max(0, wv.life[i] / wv.max[i]), j = i * 3;
      dummy.position.set(wv.x[i], 0.15, wv.z[i]); dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(Math.max(0.01, wv.r[i] * (1 - r * r)));
      dummy.updateMatrix();
      waveMesh.setMatrixAt(waveMesh.count, dummy.matrix);
      waveMesh.setColorAt(waveMesh.count++, tmpC.setRGB(wv.col[j] * r, wv.col[j + 1] * r, wv.col[j + 2] * r));
    }
    // Beams and trails hold still while the game is paused, like the blips.
    beamMesh.count = 0;
    for (let i = 0; i < MAX_BEAMS; i++) {
      if (bm.life[i] <= 0) continue;
      if (play) bm.life[i] -= dt;
      const r = Math.max(0, bm.life[i] / bm.max[i]), j = i * 6, c = i * 3, a = bm.a;
      dir.set(a[j + 3] - a[j], a[j + 4] - a[j + 1], a[j + 5] - a[j + 2]);
      const len = dir.length();
      if (len < 1e-4) continue;
      const w = bm.w[i] * (bm.grow[i] ? 1 + 2 * (1 - r) : 0.35 + 0.65 * r), b = bm.grow[i] ? r * r : r;
      dummy.position.set(a[j], a[j + 1], a[j + 2]);
      dummy.quaternion.setFromUnitVectors(X, dir.divideScalar(len));
      dummy.scale.set(len, w, w);
      dummy.updateMatrix();
      beamMesh.setMatrixAt(beamMesh.count, dummy.matrix);
      beamMesh.setColorAt(beamMesh.count++, tmpC.setRGB(bm.col[c] * b, bm.col[c + 1] * b, bm.col[c + 2] * b));
    }
    frontMesh.count = 0;
    for (let i = 0; i < MAX_FRONTS; i++) {
      if (fr.max[i] <= 0) continue;
      if (play) fr.t[i] += dt;
      const d = fr.t[i] * 160;
      if (d >= fr.max[i]) { fr.max[i] = 0; continue; }
      if (d < 1) continue; // still waiting its turn
      dummy.position.set(fr.x[i], fr.y[i] - 0.8 * d / fr.max[i], fr.z[i]); dummy.rotation.set(0, -fr.a[i], 0); dummy.scale.setScalar(d);
      dummy.updateMatrix();
      frontMesh.setMatrixAt(frontMesh.count, dummy.matrix);
      frontMesh.setColorAt(frontMesh.count++, tmpC.setHex(HOT).multiplyScalar(1.2 * (1 - d / fr.max[i])));
    }
    blipMesh.count = 0;
    for (let i = 0; i < MAX_BLIPS; i++) {
      if (bl.life[i] <= 0) continue;
      if (s.phase === 'play') bl.life[i] -= dt;
      const r = Math.max(0, bl.life[i] / bl.max[i]);
      dummy.position.set(bl.x[i], 0.12, bl.z[i]); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(bl.r[i] * (0.6 + 0.4 * r));
      dummy.updateMatrix();
      blipMesh.setMatrixAt(blipMesh.count, dummy.matrix);
      blipMesh.setColorAt(blipMesh.count++, tmpC.setHex(BRIGHT).multiplyScalar(0.7 * r * r));
    }

    // Upload only the instances in use: the pools are sized for the worst case, and re-sending every
    // buffer in full each frame (a few MB) is most of the GPU traffic in a quiet scene.
    for (const m of pools) {
      const n = m.count, was = sent.get(m) ?? -1;
      if (n === 0 && was === 0) continue; // still empty: nothing to send
      sent.set(m, n);
      for (const [a, k] of [[m.instanceMatrix, 16], [m.instanceColor, 3]] as const) {
        if (!a) continue;
        a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(n, 1) * k); a.needsUpdate = true;
      }
    }
    crt.uniforms.time.value = clock;
    const blind = s.phase !== 'play' && s.phase !== 'pause' ? 0 : s.t < s.radarDownUntil ? 1 : s.emcon ? 0.3 : 0;
    crt.uniforms.blind.value += (blind - crt.uniforms.blind.value) * Math.min(1, dt * 6);
    composer.render(dt);
  }

  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), v = new THREE.Vector3();
  return {
    render,
    rotate: (d: number) => { yaw += d; },
    zoomBy: (f: number) => { zoom = Math.min(3, Math.max(0.6, zoom * f)); },
    pick(cx: number, cy: number) {
      let x = cx / innerWidth - 0.5, y = cy / innerHeight - 0.5;
      const k = 1 + CURVE * (x * x + y * y); x *= k; y *= k; // same bend as the CRT shader
      ray.setFromCamera(new THREE.Vector2(x * 2, -y * 2), camera);
      return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
    },
    project(x: number, z: number, y = 1.5) {
      v.set(x, y, z).project(camera);
      const k = 1 + CURVE * (v.x * v.x + v.y * v.y) / 4; // approximate inverse of the CRT bend
      return [(v.x / k + 1) / 2 * innerWidth, (1 - v.y / k) / 2 * innerHeight] as const;
    },
    cameraYaw: () => yaw,
  };
}
