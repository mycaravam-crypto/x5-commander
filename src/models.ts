import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EnemyKind } from './config.ts';

// Low-poly airframes for the enemy pools, drawn as a dark fill with glowing edges (see render.ts).
// Built nose toward +x, up +y, span along z, about ±0.8 across; the camera looks down on them, so the
// planform is what reads: delta wing for a Shahed, tandem X wings for a Lancet, rotor disc for a helicopter.
// Main rotors are a separate spinning pool (ROTORS), so they're left out here.

const TAU = Math.PI * 2;
// Position-only and non-indexed, so parts built from any primitive merge into one geometry.
const bare = (g: THREE.BufferGeometry) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const a of Object.keys(n.attributes)) if (a !== 'position') n.deleteAttribute(a);
  return n;
};
const merge = (...gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map(bare))!;

// Round section along x: radius r1 at the +x end, r2 at the -x end, centred on x.
const tube = (r1: number, r2: number, len: number, x: number, y = 0, z = 0, seg = 6) =>
  new THREE.CylinderGeometry(r1, r2, len, seg).rotateZ(-Math.PI / 2).translate(x, y, z);
// Nose cone, tip at +x, base at x.
const nose = (r: number, len: number, x: number, y = 0, seg = 6) =>
  new THREE.ConeGeometry(r, len, seg).rotateZ(-Math.PI / 2).translate(x + len / 2, y, 0);
const box = (lx: number, ly: number, lz: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(lx, ly, lz).translate(x, y, z);
const extrude = (pts: number[][], t: number) =>
  new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth: t, bevelEnabled: false });
// Flat surface, mirrored across z = 0: `half` lists (x, z) points of the +z side, root to tip and back.
const wing = (half: number[][], t: number, y = 0) =>
  extrude([...half, ...[...half].reverse().map(([x, z]) => [x, -z])], t).rotateX(Math.PI / 2).translate(0, y + t / 2, 0);
// Vertical surface in the xy plane: (x, y) points.
const fin = (pts: number[][], t: number, z = 0) => extrude(pts, t).translate(0, 0, z - t / 2);
// Two-blade propeller disc seen edge on, spinning in the yz plane.
const prop = (x: number, r: number, y = 0) => merge(box(0.02, r * 2, 0.05, x, y), box(0.02, 0.05, r * 2, x, y));

export function enemyGeos(): Record<EnemyKind, THREE.BufferGeometry> {
  // Shahed-136: cropped delta with a fuselage running through it, winglets at the tips, pusher prop.
  const shahed = () => merge(
    tube(0.09, 0.09, 1.25, 0.05), nose(0.09, 0.2, 0.675),
    wing([[0.25, 0.08], [-0.48, 0.78], [-0.62, 0.78], [-0.62, 0.08]], 0.04),
    ...[-0.78, 0.78].map(z => fin([[-0.62, -0.1], [-0.62, 0.22], [-0.52, 0.22], [-0.4, -0.1]], 0.03, z)),
    prop(-0.64, 0.24),
  );
  // Kh-101: faceted body, long straight wings, turbofan pod under the tail. Drawn low: it hugs the ground.
  const kh101 = () => merge(
    tube(0.09, 0.09, 1.2, -0.05, 0, 0, 4).rotateX(Math.PI / 4), new THREE.ConeGeometry(0.09, 0.35, 4).rotateY(Math.PI / 4).rotateZ(-Math.PI / 2).translate(0.72, 0, 0),
    wing([[0.15, 0.05], [0.07, 0.78], [-0.03, 0.78], [0.02, 0.05]], 0.02, -0.05),
    tube(0.06, 0.06, 0.3, -0.5, -0.14), box(0.12, 0.08, 0.02, -0.5, -0.08),
    wing([[-0.48, 0.05], [-0.64, 0.28], [-0.72, 0.28], [-0.7, 0.05]], 0.02),
    fin([[-0.5, 0], [-0.68, 0.25], [-0.76, 0.25], [-0.72, 0]], 0.02),
  ).translate(0, -0.35, 0);
  return {
    // Lancet-3: slim body with two X wings in tandem.
    scout: merge(
      tube(0.08, 0.08, 1.2, 0), nose(0.08, 0.25, 0.6), prop(-0.62, 0.18),
      ...[Math.PI / 4, -Math.PI / 4].flatMap(a => [
        wing([[0.4, 0], [0.25, 0.5], [0.12, 0.5], [0.12, 0]], 0.02).rotateX(a),
        wing([[-0.3, 0], [-0.44, 0.42], [-0.56, 0.42], [-0.56, 0]], 0.02).rotateX(a),
      ]),
    ),
    drone: shahed(),
    // FPV quad: X frame, four props, an RPG round strapped underneath; flies nose down.
    swarm: merge(
      box(1.1, 0.04, 0.08).rotateY(Math.PI / 4), box(1.1, 0.04, 0.08).rotateY(-Math.PI / 4),
      box(0.34, 0.12, 0.2), box(0.08, 0.08, 0.1, 0.2, 0.04),
      ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => new THREE.CylinderGeometry(0.24, 0.24, 0.02, 8).translate(a * 0.39, 0.05, b * 0.39)),
      tube(0.05, 0.05, 0.35, 0.05, -0.12), nose(0.07, 0.18, 0.22, -0.12),
    ).rotateZ(-0.3),
    // Mi-28NM: narrow body, stepped tandem cockpits, stub wings with rocket pods, radar dome over the hub, long tail boom.
    tank: merge(
      box(0.75, 0.34, 0.3, 0, 0), box(0.2, 0.14, 0.24, 0.42, 0.15), box(0.22, 0.2, 0.24, 0.2, 0.24),
      nose(0.12, 0.2, 0.52, -0.02), box(0.08, 0.08, 0.08, 0.55, -0.18), tube(0.02, 0.02, 0.25, 0.7, -0.19),
      tube(0.08, 0.08, 0.42, -0.05, 0.22, 0.15), tube(0.08, 0.08, 0.42, -0.05, 0.22, -0.15),
      new THREE.CylinderGeometry(0.03, 0.04, 0.2, 5).translate(0, 0.35, 0), new THREE.SphereGeometry(0.08, 6, 4).translate(0, 0.52, 0),
      tube(0.09, 0.05, 0.72, -0.72, 0.05),
      fin([[-0.98, 0.05], [-1.08, 0.42], [-1.0, 0.42], [-0.9, 0.05]], 0.03),
      new THREE.CylinderGeometry(0.16, 0.16, 0.01, 8).rotateX(Math.PI / 2).translate(-1.02, 0.3, 0.05),
      box(0.12, 0.02, 0.4, -0.96, 0.1),
      box(0.22, 0.03, 0.95, -0.02, -0.08),
      ...[-0.44, -0.3, 0.3, 0.44].map(z => tube(0.055, 0.055, 0.32, -0.02, -0.16, z)),
    ),
    // Su-34: Flanker planform, flat "platypus" nose, canards, twin fins.
    elite: merge(
      box(1.2, 0.18, 0.34, -0.05), new THREE.ConeGeometry(0.17, 0.45, 6).rotateZ(-Math.PI / 2).scale(1, 0.6, 1).translate(0.77, 0.02, 0),
      box(0.3, 0.1, 0.22, 0.52, 0.12),
      tube(0.1, 0.1, 0.55, -0.42, -0.04, 0.13), tube(0.1, 0.1, 0.55, -0.42, -0.04, -0.13),
      tube(0.05, 0.03, 0.3, -0.8, 0),
      wing([[0.35, 0.15], [-0.32, 0.68], [-0.48, 0.68], [-0.5, 0.15]], 0.03),
      wing([[0.66, 0.1], [0.5, 0.3], [0.44, 0.3], [0.46, 0.1]], 0.02),
      wing([[-0.58, 0.15], [-0.82, 0.44], [-0.92, 0.44], [-0.9, 0.15]], 0.02),
      ...[-1, 1].map(s => fin([[-0.5, 0], [-0.78, 0.36], [-0.9, 0.36], [-0.85, 0]], 0.02).rotateX(s * 0.15).translate(0, 0.08, s * 0.2)),
    ),
    decoy: shahed(), // Gerbera: a foam copy of the Shahed, so it looks the same until classified
    // Kh-31P: four ramjet intakes along the body, cruciform wings and tail fins.
    arm: merge(
      tube(0.1, 0.1, 1.3, -0.1), nose(0.1, 0.4, 0.55),
      ...[0, 1, 2, 3].map(i => box(0.5, 0.07, 0.07, -0.2, 0.13).rotateX(Math.PI / 4 + i * Math.PI / 2)),
      ...[0, Math.PI / 2].flatMap(a => [
        wing([[0.25, 0.08], [0.1, 0.32], [0.0, 0.32], [0.0, 0.08]], 0.02).rotateX(a),
        wing([[-0.5, 0.08], [-0.66, 0.28], [-0.75, 0.28], [-0.75, 0.08]], 0.02).rotateX(a),
      ]),
    ),
    // Iskander-M: fat body, long pointed nose, small fins at the tail, diving on its target.
    tbm: merge(
      tube(0.2, 0.2, 1.3, -0.3), nose(0.2, 0.8, 0.35, 0, 8), tube(0.2, 0.25, 0.2, -1.05, 0, 0, 8),
      ...[Math.PI / 4, -Math.PI / 4].map(a => wing([[-0.8, 0.18], [-0.95, 0.38], [-1.12, 0.38], [-1.12, 0.18]], 0.02).rotateX(a)),
    ).rotateZ(-0.35),
    cruise: kh101(),
    mald: kh101(), // Kh-55 decoy: passes for a Kh-101 until classified
    // Mi-8MTPR-1: bulky transport cabin with the big box jamming containers on both sides.
    ew: merge(
      box(0.9, 0.42, 0.42), new THREE.CylinderGeometry(0.15, 0.21, 0.22, 6).rotateZ(-Math.PI / 2).translate(0.56, -0.02, 0),
      box(0.2, 0.14, 0.3, 0.5, 0.14), box(0.6, 0.15, 0.32, 0.05, 0.28),
      new THREE.CylinderGeometry(0.04, 0.05, 0.14, 5).translate(0, 0.42, 0),
      tube(0.12, 0.05, 0.8, -0.85, 0.08),
      fin([[-1.15, 0.05], [-1.28, 0.4], [-1.2, 0.4], [-1.08, 0.05]], 0.03),
      new THREE.CylinderGeometry(0.18, 0.18, 0.01, 8).rotateX(Math.PI / 2).translate(-1.22, 0.3, 0.06),
      ...[-1, 1].flatMap(s => [
        box(0.6, 0.3, 0.1, -0.05, 0, s * 0.3),
        ...[-0.25, 0, 0.15].map(x => box(0.03, 0.16, 0.03, x, 0.22, s * 0.3)), // antenna blades
      ]),
    ),
    // 9M120 Ataka: slim tube, pop-out cruciform wings at the tail.
    atgm: merge(
      tube(0.09, 0.09, 1.1, -0.1), nose(0.09, 0.3, 0.45),
      ...[Math.PI / 4, -Math.PI / 4].map(a => wing([[-0.35, 0], [-0.5, 0.35], [-0.62, 0.35], [-0.62, 0]], 0.02).rotateX(a)),
    ),
    // KAB-500 with the UMPK kit: fat bomb body, long straight wings unfolded on top, X tail.
    kab: merge(
      tube(0.17, 0.17, 0.9, -0.05, 0, 0, 8), nose(0.17, 0.35, 0.4, 0, 8), tube(0.17, 0.08, 0.3, -0.65, 0, 0, 8),
      box(0.3, 0.06, 0.12, 0, 0.18), wing([[0.08, 0], [0.04, 0.8], [-0.08, 0.8], [-0.08, 0]], 0.02, 0.22),
      ...[Math.PI / 4, -Math.PI / 4].map(a => wing([[-0.55, 0], [-0.72, 0.36], [-0.8, 0.36], [-0.8, 0]], 0.02).rotateX(a)),
    ),
    // Orlan-10: slim pod, long straight high wing, tractor prop, a boom to a V-tail. Drawn high and slow.
    recon: merge(
      tube(0.08, 0.06, 0.9, 0), nose(0.08, 0.15, 0.45), prop(0.62, 0.2),
      wing([[0.12, 0.05], [0.1, 0.85], [-0.06, 0.85], [-0.08, 0.05]], 0.02, 0.07),
      tube(0.025, 0.025, 0.6, -0.72),
      ...[-1, 1].map(s => wing([[-0.95, 0], [-1.05, 0.26], [-1.12, 0.26], [-1.1, 0]], 0.015).rotateX(s * 0.6)),
    ),
    // Ka-52: side-by-side cockpit (a wide nose), stub wings with pods, coaxial hub (the upper disc is ROTORS), twin fins.
    ka52: merge(
      box(0.8, 0.34, 0.38, 0, 0), box(0.28, 0.2, 0.36, 0.38, 0.12), nose(0.17, 0.22, 0.52, -0.02),
      new THREE.CylinderGeometry(0.04, 0.05, 0.3, 5).translate(0, 0.33, 0),
      new THREE.CylinderGeometry(0.75, 0.75, 0.01, 12).translate(0, 0.3, 0), // lower rotor disc, coaxial
      tube(0.1, 0.05, 0.75, -0.75, 0.05), box(0.08, 0.02, 0.5, -1.08, 0.08),
      ...[-0.25, 0.25].map(z => fin([[-1.02, 0.02], [-1.12, 0.3], [-1.05, 0.3], [-0.95, 0.02]], 0.03, z)),
      box(0.22, 0.03, 1.0, -0.02, -0.08),
      ...[-0.46, 0.46].map(z => tube(0.06, 0.06, 0.34, -0.02, -0.16, z)),
    ),
    // Su-25: straight tapered wing with pylons, engine nacelles hugging the fuselage, tall tail.
    su25: merge(
      tube(0.1, 0.12, 1.3, 0), nose(0.1, 0.35, 0.65), box(0.25, 0.1, 0.16, 0.45, 0.12),
      tube(0.1, 0.1, 0.6, -0.15, -0.02, 0.17), tube(0.1, 0.1, 0.6, -0.15, -0.02, -0.17),
      wing([[0.22, 0.1], [0.02, 0.9], [-0.14, 0.9], [-0.18, 0.1]], 0.03),
      ...[0.35, 0.55, 0.75].flatMap(z => [tube(0.03, 0.03, 0.25, -0.02, -0.08, z), tube(0.03, 0.03, 0.25, -0.02, -0.08, -z)]),
      wing([[-0.5, 0.05], [-0.62, 0.35], [-0.72, 0.35], [-0.7, 0.05]], 0.02, 0.2),
      fin([[-0.45, 0], [-0.68, 0.42], [-0.78, 0.42], [-0.7, 0]], 0.03),
    ),
    // S-8: a thin rocket with flick-out fins.
    rocket: merge(tube(0.05, 0.05, 0.9, -0.1), nose(0.05, 0.2, 0.35), ...[0, Math.PI / 2].map(a => wing([[-0.5, 0.05], [-0.55, 0.16], [-0.6, 0.16], [-0.6, 0.05]], 0.01).rotateX(a))),
    // Su-35S: Flanker, slimmer than the Su-34 (pointed nose, no platypus), Kh-58s under the intakes.
    sead: merge(
      box(1.15, 0.16, 0.3, -0.05), nose(0.12, 0.5, 0.52), box(0.22, 0.1, 0.16, 0.45, 0.1),
      tube(0.09, 0.09, 0.55, -0.4, -0.04, 0.12), tube(0.09, 0.09, 0.55, -0.4, -0.04, -0.12),
      wing([[0.3, 0.14], [-0.32, 0.72], [-0.46, 0.72], [-0.5, 0.14]], 0.03),
      wing([[-0.56, 0.14], [-0.8, 0.42], [-0.9, 0.42], [-0.88, 0.14]], 0.02),
      ...[-1, 1].map(s => fin([[-0.48, 0], [-0.76, 0.34], [-0.88, 0.34], [-0.83, 0]], 0.02).rotateX(s * 0.15).translate(0, 0.07, s * 0.18)),
      tube(0.05, 0.05, 0.6, 0, -0.14, 0.3), tube(0.05, 0.05, 0.6, 0, -0.14, -0.3),
    ),
    // Kh-58: long body, cruciform wings well forward, big tail fins.
    arm2: merge(
      tube(0.11, 0.11, 1.4, -0.1), nose(0.11, 0.4, 0.6),
      ...[0, Math.PI / 2].flatMap(a => [
        wing([[0.2, 0.1], [0.05, 0.38], [-0.08, 0.38], [-0.08, 0.1]], 0.02).rotateX(a),
        wing([[-0.55, 0.1], [-0.72, 0.34], [-0.82, 0.34], [-0.82, 0.1]], 0.02).rotateX(a),
      ]),
    ),
    // Mi-26: huge boxy cabin, rear clamshell doors, long tail boom (the eight-blade rotor is ROTORS), stubby sponsons.
    halo: merge(
      box(1.1, 0.42, 0.44, 0.05, 0), nose(0.22, 0.2, 0.6, 0.02, 8), box(0.25, 0.14, 0.3, 0.55, 0.2),
      box(0.4, 0.18, 0.4, 0.05, 0.3), new THREE.CylinderGeometry(0.05, 0.06, 0.16, 6).translate(0.05, 0.46, 0),
      box(0.18, 0.3, 0.4, -0.55, -0.02), tube(0.11, 0.05, 0.75, -0.95, 0.12),
      fin([[-1.25, 0.1], [-1.38, 0.5], [-1.28, 0.5], [-1.16, 0.1]], 0.03), box(0.12, 0.02, 0.45, -1.2, 0.18),
      ...[-1, 1].map(sd => box(0.35, 0.14, 0.12, 0.1, -0.16, sd * 0.28)),
    ),
    // Tu-22M3: long needle nose, big intakes, swing wings swept back, tall single fin.
    backfire: merge(
      tube(0.1, 0.13, 1.7, -0.05), nose(0.1, 0.35, 0.8), box(0.25, 0.1, 0.16, 0.6, 0.1),
      ...[-1, 1].map(sd => box(0.8, 0.16, 0.14, -0.3, 0, sd * 0.16)),
      wing([[0.15, 0.2], [-0.35, 0.85], [-0.5, 0.85], [-0.35, 0.2]], 0.03),
      wing([[-0.65, 0.12], [-0.85, 0.42], [-0.95, 0.42], [-0.92, 0.12]], 0.02),
      fin([[-0.55, 0.05], [-0.88, 0.5], [-1.0, 0.5], [-0.92, 0.05]], 0.03),
    ),
    // S-70 Okhotnik: a flying wing, no fin, a single buried engine: a flat arrowhead.
    okhotnik: merge(
      wing([[0.75, 0], [-0.25, 0.85], [-0.4, 0.8], [-0.3, 0.3], [-0.55, 0.12], [-0.5, 0]], 0.05),
      new THREE.ConeGeometry(0.16, 0.7, 4).rotateZ(-Math.PI / 2).scale(1, 0.4, 1).translate(0.3, 0.05, 0),
      box(0.35, 0.06, 0.14, -0.3, 0.04),
    ),
    // A-50U: Il-76 airframe (high swept wing, four engines, T-tail) with the big rotodome on struts.
    mainstay: merge(
      tube(0.13, 0.13, 1.6, -0.05, 0, 0, 8), nose(0.13, 0.25, 0.75, 0, 8), tube(0.13, 0.06, 0.35, -1.02, 0.03, 0, 8),
      wing([[0.2, 0.1], [-0.05, 0.95], [-0.18, 0.95], [-0.18, 0.1]], 0.03, 0.1),
      ...[0.35, 0.65].flatMap(z => [tube(0.05, 0.05, 0.25, 0.08 - z * 0.3, 0.02, z), tube(0.05, 0.05, 0.25, 0.08 - z * 0.3, 0.02, -z)]),
      fin([[-0.8, 0.1], [-1.05, 0.5], [-1.15, 0.5], [-1.0, 0.1]], 0.03), box(0.15, 0.02, 0.6, -1.08, 0.5),
      ...[-0.1, -0.4].map(x => box(0.04, 0.2, 0.04, x, 0.22)), new THREE.CylinderGeometry(0.42, 0.42, 0.08, 16).translate(-0.25, 0.36, 0),
    ),
    // Kinzhal: long slender cone, four small tail fins, diving steeply.
    hyper: merge(
      tube(0.14, 0.17, 1.2, -0.35, 0, 0, 8), nose(0.14, 0.75, 0.25, 0, 8),
      ...[0, Math.PI / 2].map(a => wing([[-0.75, 0.14], [-0.85, 0.3], [-0.95, 0.3], [-0.95, 0.14]], 0.02).rotateX(a)),
    ).rotateZ(-0.45),
  };
}

// Main rotors: hub height and blade radius in model units, for the kinds that have one.
export const ROTORS: Partial<Record<EnemyKind, { y: number; r: number }>> = { tank: { y: 0.43, r: 0.85 }, ew: { y: 0.5, r: 0.95 }, ka52: { y: 0.5, r: 0.8 }, halo: { y: 0.55, r: 1.05 } };
// Five blades as outlines (xyz segment pairs, radius 1), for an instanced line pool.
export function rotorPts() {
  const p: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU, c = Math.cos(a), s = Math.sin(a), w = 0.035;
    const q = [[0.08, -w], [1, -w], [1, w], [0.08, w]].map(([r, o]) => [c * r - s * o, 0, s * r + c * o]);
    for (let j = 0; j < 4; j++) p.push(...q[j], ...q[(j + 1) % 4]);
  }
  return p;
}
