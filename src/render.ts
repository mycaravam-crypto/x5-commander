import * as THREE from 'three';
import { ARENA_R, ENEMIES, KINDS, type EnemyKind } from './config.ts';
import { visible, type State } from './sim.ts';

const MAX_ENEMIES = 2000, MAX_LOCKS = 64, MAX_SHOTS = 600, MAX_SHARDS = 2500, MAX_WAVES = 64, MAX_BEAMS = 96;
const VIS = 1.6; // enemies drawn bigger than their hitbox so they read at a glance
const CYAN = 0x5ef2ff, GREEN = 0x3dff8a, MAGENTA = 0xff3dd8, YELLOW = 0xffd84a;

const additive = (color = 0xffffff) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.frustumCulled = false; m.count = 0;
  m.setColorAt(0, new THREE.Color()); // allocate instanceColor
  return m;
};
const lineLoop = (pts: THREE.Vector3[], color: number, opacity = 1) =>
  new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
const circlePts = (r: number, seg: number, y = 0, rot = 0) =>
  Array.from({ length: seg }, (_, i) => new THREE.Vector3(Math.cos(i / seg * Math.PI * 2 + rot) * r, y, Math.sin(i / seg * Math.PI * 2 + rot) * r));

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04070b);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  let yaw = Math.PI / 2, zoom = 1.5;
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    const h = 95, w = h * innerWidth / innerHeight;
    Object.assign(camera, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2 });
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();

  scene.add(new THREE.HemisphereLight(0x9fdcff, 0x0a0a14, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(30, 60, 20); scene.add(sun);

  // ---- arena ----
  const ground = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 8, 8, Math.PI / 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x070c12 }));
  ground.position.y = -0.05; scene.add(ground);
  scene.add(lineLoop(circlePts(ARENA_R + 8, 8, 0, Math.PI / 8), 0x1d4a5e));
  for (let r = 15; r <= 60; r += 15) scene.add(lineLoop(circlePts(r, 96), 0x0f2330));
  const spokes: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; spokes.push(new THREE.Vector3(Math.cos(a) * 6, 0, Math.sin(a) * 6), new THREE.Vector3(Math.cos(a) * (ARENA_R + 8), 0, Math.sin(a) * (ARENA_R + 8))); }
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokes), new THREE.LineBasicMaterial({ color: 0x0c1c27 })));

  // ---- radar ----
  const radarRing = lineLoop(circlePts(1, 128, 0.05), GREEN, 0.5); scene.add(radarRing);
  const trackRing = lineLoop(circlePts(1, 128, 0.05), CYAN, 0.18); scene.add(trackRing);
  const WEDGE = 0.7;
  const wedgeGeo = new THREE.CircleGeometry(1, 32, 0, WEDGE);
  const wp = wedgeGeo.attributes.position, wc = new Float32Array(wp.count * 3);
  for (let i = 0; i < wp.count; i++) {
    const th = Math.atan2(wp.getY(i), wp.getX(i)), b = (1 - th / WEDGE) ** 3 * 0.15;
    wc.set([0.24 * b, b, 0.54 * b], i * 3);
  }
  wedgeGeo.setAttribute('color', new THREE.BufferAttribute(wc, 3)).rotateX(-Math.PI / 2);
  const sweep = new THREE.Group();
  const wedgeMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  sweep.add(new THREE.Mesh(wedgeGeo, wedgeMat));
  sweep.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), new THREE.LineBasicMaterial({ color: GREEN })));
  sweep.position.y = 0.06; scene.add(sweep);

  // ---- base (rebuilt when its shape key changes) ----
  let base = new THREE.Group(), baseKey = '', turret = new THREE.Group(), dish: THREE.Object3D | null = null;
  const spinners: [THREE.Object3D, number][] = [];
  const fill = new THREE.MeshLambertMaterial({ color: 0x0d1d28, flatShading: true });
  const edgeMats = new Map<number, THREE.LineBasicMaterial>();
  const solid = (geo: THREE.BufferGeometry, edge: number, x = 0, y = 0, z = 0, parent: THREE.Object3D = base, mat: THREE.Material = fill) => {
    const m = new THREE.Mesh(geo, mat);
    if (!edgeMats.has(edge)) edgeMats.set(edge, new THREE.LineBasicMaterial({ color: edge }));
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMats.get(edge)));
    m.position.set(x, y, z); parent.add(m);
    return m;
  };
  function buildBase(s: State) {
    scene.remove(base);
    base = new THREE.Group(); spinners.length = 0; dish = null;
    const L = s.level, W = s.st.weapons;
    solid(new THREE.BoxGeometry(5, 2.2, 5), CYAN, 0, 1.1, 0);
    solid(new THREE.BoxGeometry(3.4, 0.5, 3.4), CYAN, 0, 2.45, 0);
    if (L >= 2) for (const x of [-3.7, 3.7]) solid(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 6), YELLOW, x, 0.9, 0);
    if (L >= 3) for (const z of [-3.7, 3.7]) solid(new THREE.BoxGeometry(3.2, 1, 1.4), 0xffffff, 0, 0.5, z);
    if (L >= 4) {
      solid(new THREE.CylinderGeometry(0.15, 0.25, 3, 5), GREEN, -3.4, 1.5, -3.4);
      dish = solid(new THREE.ConeGeometry(1.2, 0.6, 8, 1, true).rotateZ(Math.PI / 2 + 0.5), GREEN, -3.4, 3.2, -3.4);
    }
    if (L >= 5) for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) solid(new THREE.BoxGeometry(1.1, 1.1, 1.1), 0x6f8bff, x * 3.6, 0.55, z * 3.6);
    if (L >= 6) {
      const sh = solid(new THREE.CylinderGeometry(6.8, 7.2, 0.5, 8, 1, true), CYAN, 0, 0.25, 0, base,
        new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.08, side: THREE.DoubleSide }));
      spinners.push([sh, 0.1]);
    }
    if (L >= 7) for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8;
      solid(new THREE.BoxGeometry(1.6, 0.8, 0.15).rotateY(-a), 0x9ad8ff, Math.cos(a) * 5.4, 0.4, Math.sin(a) * 5.4);
    }
    for (let i = 0; i < Math.max(0, L - 7); i++) {
      const ring = new THREE.Group(); ring.position.y = 5 + i * 1.3;
      ring.add(lineLoop(circlePts(3 + i * 1.2, 8, 0, Math.PI / 8), i % 2 ? MAGENTA : CYAN));
      base.add(ring); spinners.push([ring, (i % 2 ? -1 : 1) * (0.3 + i * 0.1)]);
    }
    turret = new THREE.Group(); turret.position.y = 2.7; base.add(turret);
    solid(new THREE.CylinderGeometry(1.1, 1.3, 0.8, 8), CYAN, 0, 0.4, 0, turret);
    solid(new THREE.BoxGeometry(2.8, 0.35, 0.35).translate(1.4, 0, 0), 0xffffff, 0.6, 0.5, 0, turret);
    if (W.pulse) solid(new THREE.IcosahedronGeometry(0.45, 0), 0x6fb8ff, -0.4, 1.2, 0, turret);
    if (W.missile) for (const z of [-0.9, 0.9]) solid(new THREE.BoxGeometry(1.2, 0.5, 0.6), 0xffa040, -0.3, 0.5, z, turret);
    if (W.rail) solid(new THREE.BoxGeometry(4.2, 0.16, 0.16).translate(2.1, 0, 0), MAGENTA, 0.2, 0.95, 0, turret);
    scene.add(base);
  }

  // ---- instanced pools ----
  const geos: Record<EnemyKind, THREE.BufferGeometry> = {
    scout: new THREE.ConeGeometry(0.55, 1.5, 3).rotateZ(-Math.PI / 2),
    drone: new THREE.OctahedronGeometry(0.65),
    swarm: new THREE.TetrahedronGeometry(0.7),
    tank: new THREE.BoxGeometry(1.2, 0.8, 1.2),
    elite: new THREE.DodecahedronGeometry(0.65),
  };
  const enemyMat = new THREE.MeshLambertMaterial({ flatShading: true, emissive: 0x1a0505 });
  const enemyMeshes = {} as Record<EnemyKind, THREE.InstancedMesh>;
  for (const k of KINDS) scene.add(enemyMeshes[k] = instanced(geos[k], enemyMat, MAX_ENEMIES));

  const lockRings = instanced(new THREE.RingGeometry(1.15, 1.35, 6).rotateX(-Math.PI / 2), additive(), MAX_LOCKS);
  const hpBars = instanced(new THREE.PlaneGeometry(1, 0.22).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({ depthTest: false, transparent: true }), MAX_LOCKS);
  hpBars.renderOrder = 10;
  const markRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 4).rotateX(-Math.PI / 2), additive(MAGENTA));
  scene.add(lockRings, hpBars, markRing);
  const lockLinePos = new Float32Array(MAX_LOCKS * 6);
  const lockLines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(lockLinePos, 3)), new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.3 }));
  lockLines.frustumCulled = false; scene.add(lockLines);

  const shells = instanced(new THREE.BoxGeometry(0.3, 0.3, 1.6), additive(), MAX_SHOTS);
  const missiles = instanced(new THREE.ConeGeometry(0.35, 1.3, 4).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb060 }), MAX_SHOTS);
  const shardMesh = instanced(new THREE.TetrahedronGeometry(0.4), additive(), MAX_SHARDS);
  const waveMesh = instanced(new THREE.RingGeometry(0.88, 1, 32).rotateX(-Math.PI / 2), additive(), MAX_WAVES);
  const beamMesh = instanced(new THREE.BoxGeometry(1, 1, 1), additive(), MAX_BEAMS);
  scene.add(shells, missiles, shardMesh, waveMesh, beamMesh);

  // Particle pools: flat arrays, ring-buffer allocation, no per-frame garbage.
  const sh = { p: new Float32Array(MAX_SHARDS * 3), v: new Float32Array(MAX_SHARDS * 3), life: new Float32Array(MAX_SHARDS), max: new Float32Array(MAX_SHARDS), col: new Float32Array(MAX_SHARDS * 3), size: new Float32Array(MAX_SHARDS), next: 0 };
  const wv = { x: new Float32Array(MAX_WAVES), z: new Float32Array(MAX_WAVES), r: new Float32Array(MAX_WAVES), life: new Float32Array(MAX_WAVES), max: new Float32Array(MAX_WAVES), col: new Float32Array(MAX_WAVES * 3), next: 0 };
  const bm = { a: new Float32Array(MAX_BEAMS * 4), w: new Float32Array(MAX_BEAMS), life: new Float32Array(MAX_BEAMS), max: new Float32Array(MAX_BEAMS), col: new Float32Array(MAX_BEAMS * 3), next: 0 };
  const tmpC = new THREE.Color();

  function shards(x: number, z: number, n: number, color: number, speed = 12, size = 1, y = 1) {
    tmpC.setHex(color);
    for (let j = 0; j < n; j++) {
      const i = sh.next = (sh.next + 1) % MAX_SHARDS;
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
      sh.p.set([x, y, z], i * 3);
      sh.v.set([Math.cos(a) * v, 4 + Math.random() * speed, Math.sin(a) * v], i * 3);
      sh.life[i] = sh.max[i] = 0.4 + Math.random() * 0.6;
      sh.col.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
      sh.size[i] = size * (0.5 + Math.random());
    }
  }
  function wave(x: number, z: number, r: number, color: number, life = 0.5) {
    const i = wv.next = (wv.next + 1) % MAX_WAVES;
    wv.x[i] = x; wv.z[i] = z; wv.r[i] = r; wv.life[i] = wv.max[i] = life;
    tmpC.setHex(color); wv.col.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  }
  function beam(x: number, z: number, x2: number, z2: number, w: number, color: number, life: number) {
    const i = bm.next = (bm.next + 1) % MAX_BEAMS;
    bm.a.set([x, z, x2, z2], i * 4); bm.w[i] = w; bm.life[i] = bm.max[i] = life;
    tmpC.setHex(color); bm.col.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  }

  const KILL_SHARDS: Record<EnemyKind, number> = { swarm: 5, scout: 8, drone: 12, tank: 26, elite: 45 };
  function consume(s: State) {
    for (const e of s.events) {
      switch (e.k) {
        case 'kill': {
          const T = ENEMIES[e.kind!];
          shards(e.x, e.z, KILL_SHARDS[e.kind!], T.color, 10 + T.size * 3, T.size);
          shards(e.x, e.z, 3, 0xffffff, 8, 0.6);
          wave(e.x, e.z, T.size * 4, T.color, 0.4);
          break;
        }
        case 'hit': e.n ? (wave(e.x, e.z, e.n, 0xffa040, 0.35), shards(e.x, e.z, 10, 0xffa040, 10)) : shards(e.x, e.z, 2, 0xffffff, 6, 0.5); break;
        case 'baseHit': wave(0, 0, 9, 0xff3355, 0.5); shards(e.x, e.z, 14, 0xff3355, 12); break;
        case 'beam': beam(e.x, e.z, e.x2, e.z2, 0.18, 0x6fb8ff, 0.12); break;
        case 'rail': beam(e.x, e.z, e.x2, e.z2, 0.7, MAGENTA, 0.35); beam(e.x, e.z, e.x2, e.z2, 0.2, 0xffffff, 0.25); wave(0, 0, 5, MAGENTA, 0.3); break;
        case 'shot': shards(Math.cos(s.aim) * 3.4, Math.sin(s.aim) * 3.4, 2, 0xfff2c0, 4, 0.4, 3.2); break;
        case 'level': wave(0, 0, 40, CYAN, 1.2); wave(0, 0, 25, 0xffffff, 0.9); shards(0, 0, 60, CYAN, 20, 1, 3); break;
        case 'warning': wave(0, 0, ARENA_R, 0xff2aff, 1.5); break;
      }
    }
  }

  const dummy = new THREE.Object3D();
  const camRight = new THREE.Vector3();
  let turretA = 0, clock = 0;

  function render(s: State, dt: number) {
    clock += dt;
    consume(s);
    const key = `${s.level}${!!s.st.weapons.pulse}${!!s.st.weapons.missile}${!!s.st.weapons.rail}`;
    if (key !== baseKey) { baseKey = key; buildBase(s); }

    // camera
    const d = 150, pitch = 0.72;
    const sx = (Math.random() - 0.5) * s.shake * 1.6, sz = (Math.random() - 0.5) * s.shake * 1.6;
    camera.position.set(Math.cos(yaw) * Math.cos(pitch) * d + sx, Math.sin(pitch) * d, Math.sin(yaw) * Math.cos(pitch) * d + sz);
    camera.lookAt(sx, 0, sz);
    camera.zoom = zoom; camera.updateProjectionMatrix();
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);

    // radar + base
    sweep.rotation.y = -s.sweepA; sweep.scale.setScalar(s.st.radarRange);
    radarRing.scale.setScalar(s.st.radarRange);
    trackRing.scale.setScalar(s.st.trackRange);
    let da = ((s.aim - turretA + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    turretA += da * Math.min(1, dt * 15);
    turret.rotation.y = -turretA;
    if (dish) dish.rotation.y = -s.sweepA;
    for (const [o, v] of spinners) o.rotation.y += v * dt;

    // enemies, locks, hp bars
    for (const k of KINDS) enemyMeshes[k].count = 0;
    let nl = 0;
    let marked = false;
    for (const e of s.enemies) {
      if (!visible(s, e)) continue;
      const m = enemyMeshes[e.kind], T = ENEMIES[e.kind];
      if (m.count >= MAX_ENEMIES) continue;
      const fade = e.locked ? 1 : Math.max(0.2, Math.min(1, (e.seenUntil - s.t) / 1.5));
      const sz = e.size * VIS;
      dummy.position.set(e.x, sz * 0.6, e.z);
      dummy.rotation.set(e.kind === 'drone' || e.kind === 'elite' ? clock * 2 : 0, -Math.atan2(e.vz, e.vx) + (e.kind === 'swarm' ? clock * 6 : 0), 0);
      dummy.scale.setScalar(sz);
      dummy.updateMatrix();
      m.setMatrixAt(m.count, dummy.matrix);
      m.setColorAt(m.count++, tmpC.setHex(T.color).multiplyScalar(fade * (e.locked ? 1.3 : 1)));
      if (e.id === s.marked) {
        marked = true;
        markRing.position.set(e.x, 0.1, e.z);
        markRing.rotation.y = clock * 3;
        markRing.scale.setScalar(sz * (1.1 + Math.sin(clock * 10) * 0.1));
      }
      if (e.locked && nl < MAX_LOCKS) {
        dummy.position.set(e.x, 0.1, e.z); dummy.rotation.set(0, -clock * 2, 0); dummy.scale.setScalar(sz);
        dummy.updateMatrix();
        lockRings.setMatrixAt(nl, dummy.matrix);
        lockRings.setColorAt(nl, tmpC.setHex(e.id === s.marked ? MAGENTA : CYAN).multiplyScalar(0.8));
        const r = Math.max(0, e.hp / e.maxHp);
        dummy.position.set(e.x, sz + 1.4, e.z).addScaledVector(camRight, -sz);
        dummy.quaternion.copy(camera.quaternion); dummy.scale.set(Math.max(0.01, sz * 2 * r), 1, 1);
        dummy.updateMatrix();
        hpBars.setMatrixAt(nl, dummy.matrix);
        hpBars.setColorAt(nl, tmpC.setHSL(r * 0.33, 1, 0.55));
        lockLinePos.set([0, 1, 0, e.x, 0.3, e.z], nl * 6);
        nl++;
      }
    }
    markRing.visible = marked;
    lockRings.count = hpBars.count = nl;
    lockLines.geometry.setDrawRange(0, nl * 2);
    lockLines.geometry.attributes.position.needsUpdate = true;

    // shots
    shells.count = missiles.count = 0;
    for (const p of s.shots) {
      const m = p.kind === 'shell' ? shells : missiles;
      if (m.count >= MAX_SHOTS) continue;
      dummy.position.set(p.x, 1.6, p.z); dummy.rotation.set(0, Math.atan2(p.vx, p.vz), 0); dummy.scale.setScalar(1);
      dummy.updateMatrix(); m.setMatrixAt(m.count, dummy.matrix);
      m.setColorAt(m.count++, tmpC.setHex(p.kind === 'shell' ? 0xfff2c0 : 0xffffff));
      if (p.kind === 'missile' && Math.random() < 0.5) shards(p.x, p.z, 1, 0xff8030, 1, 0.5, 1.6);
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
    beamMesh.count = 0;
    for (let i = 0; i < MAX_BEAMS; i++) {
      if (bm.life[i] <= 0) continue;
      bm.life[i] -= dt;
      const r = Math.max(0, bm.life[i] / bm.max[i]), j = i * 4, c = i * 3;
      const [x, z, x2, z2] = [bm.a[j], bm.a[j + 1], bm.a[j + 2], bm.a[j + 3]];
      const len = Math.hypot(x2 - x, z2 - z);
      dummy.position.set((x + x2) / 2, 1.6, (z + z2) / 2);
      dummy.rotation.set(0, -Math.atan2(z2 - z, x2 - x), 0);
      dummy.scale.set(len, bm.w[i] * r, bm.w[i] * r);
      dummy.updateMatrix();
      beamMesh.setMatrixAt(beamMesh.count, dummy.matrix);
      beamMesh.setColorAt(beamMesh.count++, tmpC.setRGB(bm.col[c] * r, bm.col[c + 1] * r, bm.col[c + 2] * r));
    }

    for (const m of [...Object.values(enemyMeshes), lockRings, hpBars, shells, missiles, shardMesh, waveMesh, beamMesh]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }

  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), v = new THREE.Vector3();
  return {
    render,
    rotate: (d: number) => { yaw += d; },
    zoomBy: (f: number) => { zoom = Math.min(3, Math.max(0.6, zoom * f)); },
    pick(cx: number, cy: number) {
      ray.setFromCamera(new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
      return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
    },
    project(x: number, z: number) {
      v.set(x, 1.5, z).project(camera);
      return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight] as const;
    },
    cameraYaw: () => yaw,
  };
}
