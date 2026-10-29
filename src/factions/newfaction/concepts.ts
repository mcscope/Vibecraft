// Five concepts for the T3 mother (2026-10-21, for the user to choose from): five answers to how a 500 kg brood
// mother bears her weight. Dev only, rendered as units 'concept-1' … 'concept-5'.
import type { Mat, ModelBuilder, Pose, Vec3 } from '../../kits/bake3d/types';
import { footAt, jointBetween, shapedLimb } from '../../kits/bake3d/gait';

const TAU = Math.PI * 2;
const plate: Mat = { color: '#5e4a3a', tex: 'leather', rough: 0.35 };
const under: Mat = { color: '#d8c49a', tex: 'skin', rough: 0.6 };
const dark: Mat = { color: '#241812', tex: 'skin', rough: 0.95 };
const eggMat: Mat = { color: '#e8e0f0', tex: 'none', rough: 0.85 };
const eye: Mat = { color: '#111111' };
const SCALE = 3.2;

/** A small insect head with mandibles, facing +x at `at`. */
function head(c: ModelBuilder, at: Vec3, r = 0.09): void {
  c.sphere([r * 1.2, r, r], at, plate);
  for (const z of [1, -1]) {
    c.sphere(r * 0.22, [at[0] + r * 0.7, at[1] + r * 0.35, z * r * 0.6], eye);
    c.cone(r * 0.25, r * 0.9, [at[0] + r * 1.3, at[1] - r * 0.4, z * r * 0.35], plate, [0, z * 0.5, -Math.PI / 2], 5);
  }
}

/** 1. Palanquin: a termite queen's vast egg sac slung low between six arched spider legs; a small thorax and head before it. */
export function palanquin(b: ModelBuilder, p: Pose): void {
  const t = p.phase * TAU, walking = p.anim === 'walk';
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    const y = 0.32 + (walking ? Math.sin(t * 2) * 0.01 : 0);
    // the sac: long, banded, sagging between the legs
    c.loft([[0.1, 0.12, 0.1, 0.1], [-0.05, 0.3, 0.24, 0.26], [-0.35, 0.36, 0.28, 0.3], [-0.65, 0.32, 0.25, 0.27], [-0.9, 0.18, 0.15, 0.16], [-1.02, 0.05, 0.05, 0.05]]
      .map(([x, w, u, d]) => ({ at: [x, y, 0] as Vec3, w, up: u, down: d })), under);
    for (const x of [-0.15, -0.35, -0.55, -0.75]) c.sphere([0.03, 0.29, 0.35], [x, y + 0.02, 0], plate); // bands
    c.sphere([0.14, 0.11, 0.12], [0.22, y + 0.12, 0], plate); // thorax
    head(c, [0.38, y + 0.14, 0]);
    // six legs from the thorax and the sac's shoulders, arching high and out like a spider's
    for (const [hx, fx, ph] of [[0.2, 0.55, 0], [0.05, 0.1, 0.5], [-0.3, -0.5, 0]] as const) for (const z of [1, -1]) {
      const hip: Vec3 = [hx, y + 0.12, z * 0.2], rest: Vec3 = [fx, 0, z * 0.85];
      const foot = walking ? footAt(rest, p.phase + ph + (z > 0 ? 0 : 0.5), 0.08, 0.06) : rest;
      const knee = jointBetween(hip, foot, 0.62, 0.72, [0, 1, z * 0.3]);
      c.limb(hip, knee, 0.045, plate, 0.035);
      c.limb(knee, foot, 0.035, plate, 0.015);
    }
    // eggs ready at the back of the sac
    for (let k = 0; k < 6; k++) c.sphere([0.05, 0.065, 0.05], [-0.95 + Math.cos(k) * 0.05, y + 0.06 + Math.sin(k) * 0.06, (k - 2.5) * 0.05], eggMat);
  }, SCALE);
}

/** 2. Snail hive: no legs; she glides on a broad muscular foot, a coiled brood shell on her back, eggs pushing out of its chambers. */
export function snailHive(b: ModelBuilder, p: Pose): void {
  const t = p.phase * TAU, walking = p.anim === 'walk';
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    // the foot: long, low, rippling as she glides
    c.loft(Array.from({ length: 8 }, (_, i) => { const x = 0.55 - i * 0.2; return { at: [x, 0.06 + (walking ? Math.max(0, Math.sin(t * 2 - i)) * 0.015 : 0), 0] as Vec3, w: 0.3 - Math.abs(i - 3) * 0.03, up: 0.1, down: 0.06 }; }), under);
    head(c, [0.62, 0.18, 0], 0.11);
    for (const z of [1, -1]) c.limb([0.64, 0.25, z * 0.05], [0.8, 0.5, z * 0.14], 0.012, plate, 0.006); // eye stalks
    // the shell: a coil of chambers spiralling up, each a little smaller
    for (let i = 0; i < 9; i++) {
      const a = i * 0.75, r = 0.42 * Math.pow(0.86, i);
      const at: Vec3 = [-0.25 + Math.cos(a) * r * 0.7, 0.55 + Math.sin(a) * r * 0.7, 0];
      c.sphere([r * 0.75, r * 0.75, r * 0.8], at, i % 2 ? plate : { color: '#7a5e48', tex: 'leather', rough: 0.35 });
      if (i < 5) c.sphere([0.05, 0.065, 0.05], [at[0], at[1], r * 0.78], eggMat); // an egg pushing out of a chamber
    }
  }, SCALE);
}

/** 3. Walking dome: a broad, low honeycomb dome on a ring of short stubby legs round its rim, eggs glinting in its cells. */
export function walkingDome(b: ModelBuilder, p: Pose): void {
  const walking = p.anim === 'walk';
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    c.sphere([0.75, 0.42, 0.68], [0, 0.22, 0], plate); // the dome
    c.sphere([0.78, 0.08, 0.7], [0, 0.18, 0], under); // its rim
    // cells over the top, some holding eggs
    for (let ring = 1; ring <= 3; ring++) for (let k = 0; k < ring * 6; k++) {
      const a = (k / (ring * 6)) * TAU, r = ring * 0.17, x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9;
      const y = 0.22 + 0.42 * Math.sqrt(Math.max(0, 1 - (x / 0.75) ** 2 - (z / 0.68) ** 2));
      c.cylinder(0.055, 0.055, 0.03, [x, y, z], dark, undefined, 6);
      if ((k + ring) % 3 === 0) c.sphere([0.04, 0.05, 0.04], [x, y + 0.02, z], eggMat);
    }
    head(c, [0.78, 0.2, 0], 0.1);
    // ten stubby legs round the rim, stepping in a wave
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + 0.31, hip: Vec3 = [Math.cos(a) * 0.68, 0.18, Math.sin(a) * 0.62];
      const rest: Vec3 = [Math.cos(a) * 0.88, 0, Math.sin(a) * 0.8];
      const foot = walking ? footAt(rest, p.phase + k * 0.1, 0.06, 0.05) : rest;
      c.limb(hip, foot, 0.06, plate, 0.045);
    }
  }, SCALE);
}

/** 4. Scorpion matriarch: standing tall on four legs, her brood sac curled up and over her back like a scorpion's tail, mantis forelimbs folded. */
export function scorpionMatriarch(b: ModelBuilder, p: Pose): void {
  const t = p.phase * TAU, walking = p.anim === 'walk';
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    const y = 0.6;
    c.sphere([0.3, 0.18, 0.2], [0, y, 0], plate); // thorax, carried high
    head(c, [0.34, y + 0.05, 0], 0.1);
    // the brood sac: a chain of swelling segments curling up behind and over her back
    let prev: Vec3 = [-0.25, y, 0];
    for (let i = 1; i <= 8; i++) {
      const a = Math.PI + i * 0.36 + (walking ? Math.sin(t + i * 0.4) * 0.02 : 0), r = 0.55;
      const at: Vec3 = [-0.1 + Math.cos(a) * r * 0.8, y + 0.25 + Math.sin(a) * -r * 0.9 + 0.2, 0];
      const s = 0.12 + 0.13 * Math.sin((i / 8) * Math.PI);
      c.sphere([s, s, s * 1.05], at, i % 2 ? under : plate);
      if (i === 8) for (let k = 0; k < 5; k++) c.sphere([0.04, 0.05, 0.04], [at[0] + Math.cos(k * 1.3) * 0.08, at[1] - 0.12, Math.sin(k * 1.3) * 0.08], eggMat);
      prev = at;
    }
    void prev;
    // four legs, under the weight (the sac sits over her hips)
    for (const [hx, fx, ph] of [[0.12, 0.35, 0], [-0.18, -0.4, 0.5]] as const) for (const z of [1, -1]) {
      const hip: Vec3 = [hx, y - 0.1, z * 0.16], rest: Vec3 = [fx, 0, z * 0.45];
      const foot = walking ? footAt(rest, p.phase + ph + (z > 0 ? 0 : 0.5), 0.12, 0.07) : rest;
      const knee = jointBetween(hip, foot, 0.4, 0.42, [hx > 0 ? 1 : -1, 0.5, z * 0.4]);
      c.limb(hip, knee, 0.07, plate, 0.055);
      c.limb(knee, foot, 0.055, plate, 0.03);
    }
    // mantis forelimbs, folded under her head
    for (const z of [1, -1]) {
      c.limb([0.25, y - 0.02, z * 0.12], [0.42, y + 0.22, z * 0.14], 0.035, plate, 0.03);
      c.limb([0.42, y + 0.22, z * 0.14], [0.42, y - 0.12, z * 0.12], 0.03, plate, 0.012);
    }
  }, SCALE);
}

/** 5. Gas-bag: a huge buoyant bladder holds her nearly weightless; she drifts low, long thin legs dangling just to the ground. */
export function gasBag(b: ModelBuilder, p: Pose): void {
  const t = p.phase * TAU;
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    const bob = Math.sin(t) * 0.03;
    c.sphere([0.62, 0.48, 0.55], [-0.1, 0.95 + bob, 0], { color: '#e6d6b8', tex: 'skin', rough: 0.4, metal: 0.05 }); // the bladder
    for (const a of [0, 1, 2, 3, 4, 5]) c.limb([-0.1 + Math.cos(a) * 0.05, 1.43 + bob, Math.sin(a) * 0.05], [-0.1 + Math.cos(a) * 0.55, 0.95 + bob, Math.sin(a) * 0.5], 0.01, plate, 0.01); // its veins
    c.sphere([0.22, 0.14, 0.16], [0.02, 0.42 + bob, 0], plate); // the body beneath
    head(c, [0.26, 0.4 + bob, 0], 0.09);
    // the brood: eggs in a cluster hanging under her
    for (let k = 0; k < 7; k++) c.sphere([0.045, 0.06, 0.045], [-0.12 + Math.cos(k) * 0.07, 0.26 + bob - (k % 3) * 0.05, Math.sin(k) * 0.07], eggMat);
    // long thin legs dangling, their tips trailing on the ground
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.5, hip: Vec3 = [0.02 + Math.cos(a) * 0.12, 0.4 + bob, Math.sin(a) * 0.12];
      const tip: Vec3 = [Math.cos(a) * 0.4 - 0.1 + Math.sin(t + k) * 0.04, 0.01, Math.sin(a) * 0.4];
      const knee: Vec3 = [(hip[0] + tip[0]) / 2 + Math.cos(a) * 0.08, 0.28 + bob, (hip[2] + tip[2]) / 2 + Math.sin(a) * 0.08];
      c.limb(hip, knee, 0.018, plate, 0.014);
      c.limb(knee, tip, 0.014, plate, 0.006);
    }
  }, SCALE);
}

/**
 * Concepts 6–10 (2026-10-21): variations on the T3 mother's arched form (index.ts motherT3, its MotherForm): 6 scorpion
 * curl, 7 ant queen, 8 upright theropod, 9 wasp-waisted, 10 great arch.
 */
export const MOTHER_FORMS = [
  { pitch: -1.25, curl: 0.75, abdomen: 0.95, legs: 4, head: 1.3 },
  { pitch: -1.0, curl: 0.1, abdomen: 0.85, legs: 6, head: 1.2 },
  { pitch: -0.45, curl: 0.15, abdomen: 0.9, legs: 2, head: 1.4 },
  { waist: true, pitch: -0.9, curl: 0.35, abdomen: 0.9, legs: 6, head: 1.25 },
  { pitch: -1.1, curl: 0.5, abdomen: 1.1, legs: 4, head: 1.5 },
] as const;

/** Concepts 11–15 (2026-10-21): more varied takes on the scorpion curl with the flattened head: 11 low scorpion, 12 tall
 *  curl, 13 bulb queen, 14 upright curl, 15 hunched giant. */
export const MOTHER_FORMS_2 = [
  { pitch: -0.6, curl: 1.0, abdomen: 1.3, legs: 6, girth: 1.3, neck: 0.7, head: 1.6 },
  { pitch: -1.5, curl: 0.9, abdomen: 1.1, legs: 4, girth: 0.8, neck: 1.4, head: 1.2 },
  { pitch: -0.9, curl: 0.3, abdomen: 1.5, girth: 1.5, waist: true, legs: 6, head: 1.0 },
  { legs: 2, pitch: -0.9, curl: 0.6, abdomen: 1.2, neck: 1.3, head: 1.5 },
  { pitch: -1.1, curl: 0.5, abdomen: 1.6, girth: 1.2, legs: 4, neck: 0.6, head: 1.8, crest: 1.4 },
] as const;

/** Lower-tier mother concepts (2026-10-21): the T3 mother simplified and made smaller (index.ts motherT3, at the tier's
 *  weight): T2a, T2b (120 kg), T1a, T1b (80 kg). */
export const LOWER_MOTHERS = [
  [120, { legs: 4, pitch: -0.7, curl: 0.3, abdomen: 1.0, crest: 0.6, detail: 0.6, crawl: 0.6 }],
  [120, { legs: 6, pitch: -0.45, curl: 0.15, abdomen: 0.9, girth: 1.1, crest: 0.5, detail: 0.4, crawl: 0.8 }],
  [80, { legs: 4, pitch: -0.3, curl: 0.05, abdomen: 0.8, crest: 0, detail: 0.2, crawl: 0.9 }],
  [80, { legs: 6, pitch: -0.15, curl: 0, abdomen: 0.85, girth: 1.2, crest: 0.3, detail: 0.2, crawl: 1 }],
] as const;

// ── Goliath concepts (2026-10-21, from scratch): five ways to carry 600 kg and charge ────────────────────────────────

const chitin: Mat = { color: '#1c2224', tex: 'leather', rough: 0.2, metal: 0.45 };
const claw: Mat = { color: '#0c0e0e', tex: 'none', rough: 0.4 };
const G = 2.4;

/** A leg from hip to a planted foot, the knee bending toward `bend`, shaped and tapering. */
function gLeg(c: ModelBuilder, hip: Vec3, rest: Vec3, phase: number, walking: boolean, l1: number, l2: number, r: number, bend: Vec3, reach = 0.08, mat: Mat = chitin, lift = 0.05, duty = 0.5): void {
  const foot = walking ? footAt(rest, phase, reach, lift, duty) : rest;
  const knee = jointBetween(hip, foot, l1, l2, bend);
  shapedLimb(c, hip, knee, r, [1.2, 1.3, 1.1, 0.85], mat, { flat: 0.25 });
  c.sphere(r * 0.9, knee, mat);
  shapedLimb(c, knee, foot, r * 0.8, [1.0, 0.85, 0.7, 0.6], mat, { flat: 0.3, keel: 0.4 });
  c.cone(r * 0.5, r * 1.6, [foot[0] + r * 0.6, foot[1] + r * 0.2, foot[2]], claw, [0, 0, -Math.PI / 2 - 0.4], 4);
}

/** G1. Rhinoceros-beetle tank: a true six-legged insect, low and wide under a great smooth domed shell; a crystal-tipped horn. */
export function gRhino(b: ModelBuilder, p: Pose): void {
  const walking = p.anim === 'walk';
  const chitin: Mat = { color: '#7a7448', tex: 'leather', rough: 0.25, metal: 0.25 }, rim: Mat = { color: '#1a1814', tex: 'leather', rough: 0.2, metal: 0.4 }, second: Mat = { color: '#2a2618', tex: 'none', rough: 0.3 }; // (its own colours)
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    const y = 0.3;
    c.loft([[0.3, 0.1, 0.08, 0.06], [0.12, 0.34, 0.26, 0.1], [-0.18, 0.4, 0.3, 0.1], [-0.48, 0.32, 0.22, 0.08], [-0.66, 0.1, 0.08, 0.05]].map(([x, w, u, d]) => ({ at: [x, y, 0] as Vec3, w, up: u, down: d, flat: 0.15 })), chitin);
    c.limb([0.25, y + 0.2, 0], [-0.62, y + 0.12, 0], 0.008, rim, 0.006); // the seam
    for (const [sx, sz] of [[-0.05, 0.18], [-0.3, 0.22], [-0.15, -0.2], [-0.4, -0.15], [0.05, -0.12]] as const) c.sphere([0.04, 0.012, 0.035], [sx, y + 0.27 - Math.abs(sz) * 0.25, sz], rim); // dark flecks on its shell
    c.loft([[0.28, 0.14, 0.1, 0.07], [0.42, 0.12, 0.08, 0.06], [0.5, 0.06, 0.05, 0.04]].map(([x, w, u, d]) => ({ at: [x, y - 0.02, 0] as Vec3, w, up: u, down: d })), chitin); // the head
    let prev: Vec3 = [0.46, y + 0.02, 0];
    for (let i = 1; i <= 5; i++) { const k = i / 5, nx: Vec3 = [0.46 + 0.22 * k, y + 0.02 + 0.42 * k * k, 0]; c.limb(prev, nx, 0.05 * (1 - k * 0.7), rim, 0.05 * (1 - (k + 0.2) * 0.7)); prev = nx; } // the horn, rising
    if (p.armed) c.crystal(0.14, prev, [0, 0, -0.4]);
    for (const [x, ph] of [[0.2, 0], [0.0, 0.5], [-0.22, 0]] as const) for (const z of [1, -1]) gLeg(c, [x, y - 0.02, z * 0.28], [x + 0.08, 0, z * 0.62], p.phase + ph + (z > 0 ? 0 : 0.5), walking, 0.28, 0.32, 0.05, [0, 1, z], undefined, second);
  }, G);
}

/** G2. Pangolin roller: overlapping armoured scales over an arched back, short powerful legs, a heavy tail; it tucks its head to ram. */
export function gPangolin(b: ModelBuilder, p: Pose): void {
  const walking = p.anim === 'walk', ram = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase / 0.6) * Math.PI) : 0;
  const chitin: Mat = { color: '#b07a3a', tex: 'leather', rough: 0.4, metal: 0.1 }, rim: Mat = { color: '#5a3a20', tex: 'leather', rough: 0.4 }, second: Mat = { color: '#5a3a20', tex: 'leather', rough: 0.4 }; // (its own colours)
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    const y = 0.38;
    c.loft([[0.4, 0.08, 0.07, 0.06], [0.22, 0.24, 0.22, 0.14], [-0.05, 0.3, 0.3, 0.16], [-0.35, 0.26, 0.24, 0.13], [-0.6, 0.14, 0.12, 0.08], [-0.95, 0.04, 0.04, 0.03]].map(([x, w, u, d]) => ({ at: [x, y - (x < -0.5 ? (x + 0.5) * -0.4 : 0), 0] as Vec3, w, up: u, down: d })), chitin);
    for (let i = 0; i < 9; i++) for (const z of [-1, 0, 1]) { // the scales, overlapping rows over the back and down the tail
      const x = 0.25 - i * 0.12, arch = Math.sin(((i + 0.5) / 9) * Math.PI) * 0.3, s = 0.11 - Math.abs(i - 3) * 0.008;
      if (s > 0.03) c.cone(s, s * 0.7, [x, y + 0.08 + arch * 0.6 - (z ? 0.08 : 0), z * (0.16 - i * 0.008)], i % 3 ? chitin : rim, [z * 0.6, 0, 1.75], 5);
    }
    c.joint([0.42, y - 0.04 - ram * 0.08, 0], [0, 0, -0.5 * ram], (h) => { h.sphere([0.1, 0.07, 0.07], [0.04, 0, 0], chitin); h.cone(0.05, 0.14, [0.16, -0.01, 0], chitin, [0, 0, -Math.PI / 2], 6); if (p.armed) h.crystal(0.1, [0.22, -0.01, 0], [0, 0, -Math.PI / 2]); });
    for (const [x, ph] of [[0.18, 0], [-0.32, 0.5]] as const) for (const z of [1, -1]) gLeg(c, [x, y - 0.1, z * 0.2], [x + 0.04, 0, z * 0.32], p.phase + ph + (z > 0 ? 0 : 0.5), walking, 0.17, 0.19, 0.065, [x > 0 ? -0.5 : 0.5, 0.6, 0], undefined, second);
  }, G);
}

/**
 * The Goliath Charger (the stag bull, concept 3, the user's pick): hunched and front-heavy on two massive knuckle-walking
 * forelegs over smaller hind legs. Its body is a stag beetle's, in parts: a broad flat pronotum shield behind the head,
 * then two glossy domed wing cases meeting in a seam, ridged, the segmented belly showing beneath. Its head is broad and
 * flattened, eyes on its sides; its mandibles are its crystal. It carries its weight: walking, it rolls onto each
 * planted foreleg, dips as the weight lands and nods; idle, it breathes; striking, it rears back on its forelegs and
 * slams its head down, the mandibles clamping.
 */
/**
 * The Goliath's torso, in one of three directions (the user's to choose between; none a copy of any creature), in its
 * body's frame (X: the model's x to the body's; Y: its centre line):
 *  - geode: a rough stony hide split along its back, crystal growing out of the cracks;
 *  - ram: overlapping armour plates stacked into a forward-driving wedge, heaviest at the front;
 *  - bellows: a ribbed, accordion torso that pumps, swelling as it breathes, squeezing as it strides and strikes.
 */
function goliathTorso(bd: ModelBuilder, torso: GoliathTorso, X: (x: number) => number, Y: number, t: number, p: Pose, m: { shell: Mat; plate: Mat; edge: Mat; belly: Mat }): void {
  const fall = (x: number) => Y - (0.3 - x) * 0.18; // (hunched: falling away behind its shoulders)
  const crystal: Mat = { color: '#8fe6ff', rough: 0.12, metal: 0.15, emissive: '#2a8fc0' };
  if (torso === 'geode') {
    // two great halves of rough stone hide, in two tones, cracked across, split apart along the back; inside the split a
    // glowing seam, crystal clusters of mixed sizes growing out of it; smaller crystals breaking through at its shoulders
    const stone: Mat = { color: '#8a6a58', tex: 'stone', rough: 0.85 }, stone2: Mat = { color: '#6a5246', tex: 'stone', rough: 0.9 };
    const crack: Mat = { color: '#241814', tex: 'none', rough: 0.9 };
    for (const z of [1, -1]) {
      bd.loft([[0.3, 0.12, 0.13, 0.12], [0.12, 0.2, 0.2, 0.15], [-0.12, 0.2, 0.19, 0.14], [-0.36, 0.15, 0.14, 0.1], [-0.52, 0.06, 0.06, 0.05]]
        .map(([x, w, u, d]) => ({ at: [X(x), fall(x), z * 0.07] as Vec3, w, up: u, down: d, flat: 0.15 })), stone);
      for (const [x, s2, tone] of [[0.2, 0.06, 0], [0.04, 0.09, 1], [-0.14, 0.07, 0], [-0.3, 0.06, 1], [-0.44, 0.04, 0]] as const) bd.sphere([s2 * 1.5, s2, s2 * 1.1], [X(x), fall(x) + 0.19 * (1 - Math.abs(x) * 0.5), z * 0.2], tone ? stone2 : stone); // lumps
      for (const x of [0.16, -0.02, -0.2, -0.36]) bd.limb([X(x), fall(x) + 0.2, z * 0.1], [X(x - 0.06), fall(x) + 0.02, z * 0.27], 0.007, crack, 0.004); // cracks across it
    }
    bd.loft([[0.28, 0.035, 0.05, 0.03], [0.05, 0.05, 0.07, 0.04], [-0.25, 0.045, 0.06, 0.035], [-0.48, 0.02, 0.03, 0.02]].map(([x, w, u, d]) => ({ at: [X(x), fall(x) + 0.08, 0] as Vec3, w, up: u, down: d })), crystal); // the glowing seam
    for (const [x, len, lean, side] of [[0.22, 0.12, 0.3, 0.02], [0.12, 0.2, -0.25, -0.03], [0.02, 0.26, 0.1, 0.0], [-0.08, 0.16, -0.35, 0.03], [-0.18, 0.22, 0.3, -0.02], [-0.3, 0.14, -0.2, 0.02], [-0.4, 0.1, 0.35, 0.0]] as const) {
      bd.crystal(len, [X(x), fall(x) + 0.12, side], [lean, 0, -0.25]); // a cluster growing from the crack
      bd.crystal(len * 0.55, [X(x) - 0.03, fall(x) + 0.1, side + lean * 0.12], [-lean * 1.2, 0, 0.35]);
      bd.crystal(len * 0.35, [X(x) + 0.03, fall(x) + 0.1, side - lean * 0.1], [lean * 0.8, 0, -0.6]);
    }
    for (const z of [1, -1]) for (const [dx, len] of [[0, 0.09], [0.05, 0.06]] as const) bd.crystal(len, [X(0.18 + dx), Y + 0.16, z * 0.27], [z * 0.6, 0, -0.2]); // breaking through at the shoulders
  } else if (torso === 'ram') {
    // overlapping plates, smallest behind, each over the next, stacked into a wedge driving forward: each keeled, its
    // leading lip toothed; a heavy battering boss on the crown, scarred. Walking, the plates rock; striking, they
    // telescope forward into the slam
    const strike = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase / 0.5) * Math.PI) : 0, rock = p.anim === 'walk' ? Math.sin(t * 2) : 0;
    const plates: Array<[number, number, number]> = [[-0.5, 0.08, 0.08], [-0.36, 0.12, 0.12], [-0.2, 0.16, 0.16], [-0.03, 0.2, 0.2], [0.14, 0.23, 0.23]];
    plates.forEach(([x0, w, h], i) => {
      const x = x0 + strike * 0.04 * (i + 1); // (telescoping forward)
      bd.joint([X(x + 0.1), fall(x + 0.1) + 0.02 * i, 0], [0, 0, rock * 0.04 * (i % 2 ? 1 : -1)], (pl) => {
        pl.loft([0, 0.5, 1].map((k) => ({ at: [(k - 0.5) * 0.2, 0, 0] as Vec3, w: w * (k === 0.5 ? 1 : 0.8), up: h * (k === 0.5 ? 1 : 0.7), down: 0.06 + 0.02 * i, flat: 0.35, keel: 0.3 })), i % 2 ? m.plate : m.shell);
        pl.loft([-0.08, 0.08].map((xx) => ({ at: [xx, h * 0.95, 0] as Vec3, w: 0.012, up: 0.03, down: 0.005 })), m.edge); // its keel ridge
        pl.loft([0, 1].map((k) => ({ at: [0.08 + k * 0.02, 0, 0] as Vec3, w: w * 0.85, up: h * 0.75, down: 0.02, flat: 0.5 })), m.edge); // its leading lip
        for (let k = -2; k <= 2; k++) pl.cone(0.012, 0.04, [0.1, h * 0.5 * (1 - Math.abs(k) * 0.2), k * w * 0.3], m.edge, [0, 0, -Math.PI / 2], 4); // the lip's teeth
      });
    });
    const cx = X(0.34 + strike * 0.2), cy = fall(0.3) + 0.06;
    bd.loft([[-0.04, 0.2, 0.2, 0.1], [0.02, 0.17, 0.17, 0.09], [0.07, 0.09, 0.09, 0.05]].map(([x, w, u, d]) => ({ at: [cx + x, cy, 0] as Vec3, w, up: u, down: d, flat: 0.6 })), m.edge); // the blunt crown
    bd.sphere([0.06, 0.1, 0.12], [cx + 0.07, cy, 0], m.plate); // its battering boss
    for (const [dy, dz] of [[0.03, 0.04], [-0.04, -0.05], [0.05, -0.02]] as const) bd.limb([cx + 0.12, cy + dy, dz], [cx + 0.12, cy + dy - 0.03, dz + 0.04], 0.005, m.belly, 0.003); // scars
    bd.loft([[0.1, 0.18, 0.04, 0.1], [-0.4, 0.1, 0.03, 0.08]].map(([x, w, u, d]) => ({ at: [X(x), fall(x) - 0.08, 0] as Vec3, w, up: u, down: d })), m.belly);
  } else {
    // bellows: ribbed rings, accordion-like, pumping (swelling as it breathes, squeezing on each stride and as it
    // strikes), knobbed along each rib; pleats in the hide gathered between; vents along its sides that open as it pumps
    const pump = p.anim === 'walk' ? Math.sin(t * 2) : p.anim === 'attack' ? -Math.sin(Math.min(1, p.phase / 0.45) * Math.PI) : Math.sin(t);
    const n = 8, vent: Mat = { color: '#1a0806', tex: 'skin', rough: 0.9 };
    const at = (k: number) => 0.24 - k * 0.74 * (1 - 0.1 * pump);
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), x = at(k), r = (0.2 - Math.abs(k - 0.35) * 0.18) * (1 + 0.14 * pump * Math.sin(k * Math.PI));
      bd.sphere([0.045, r, r * 1.05], [X(x), fall(x), 0], i % 2 ? m.edge : m.plate); // a rib
      for (let j = -2; j <= 2; j++) { const a = j * 0.45; bd.sphere(0.02, [X(x), fall(x) + Math.cos(a) * r, Math.sin(a) * r * 1.05], m.edge); } // knobs along it
      if (i < n - 1) {
        const x2 = at(k + 1 / (n - 1));
        bd.loft([x, x2].map((xx, j) => ({ at: [X(xx), fall(xx), 0] as Vec3, w: r * (j ? 0.85 : 0.88), up: r * 0.85, down: r * 0.85 })), m.belly); // the hide between, gathered in
        for (const z of [1, -1]) {
          bd.limb([X((x + x2) / 2), fall(x) + r * 0.6, z * r * 0.55], [X((x + x2) / 2), fall(x) - r * 0.4, z * r * 0.75], 0.005, m.edge, 0.004); // a pleat
          if (i % 2 === 0 && i < n - 2) bd.sphere([0.025, 0.035 * (0.6 + 0.5 * Math.max(0, pump)), 0.012], [X((x + x2) / 2), fall(x), z * r * 0.86], vent); // a vent, opening as it pumps
        }
      }
    }
    for (const z of [1, -1]) bd.limb([X(0.2), fall(0.2) + 0.12, z * 0.12], [X(-0.45), fall(-0.45) + 0.06, z * 0.05], 0.015, m.shell, 0.01); // a stiff spar each side
  }
}

export type GoliathTorso = 'geode' | 'ram' | 'bellows';

export function gStag(b: ModelBuilder, p: Pose, torso: GoliathTorso = 'geode'): void {
  const walking = p.anim === 'walk', t = p.phase * Math.PI * 2;
  const atk = p.anim === 'attack' ? p.phase : -1;
  const clamp = atk < 0 ? 0 : Math.sin(Math.min(1, atk / 0.6) * Math.PI);
  const shell: Mat = { color: '#b04a2c', tex: 'none', rough: 0.15, metal: 0.35 }; // (the wing cases: glossy)
  const plate: Mat = { color: '#5a2418', tex: 'leather', rough: 0.25, metal: 0.35 }; // (the pronotum and head: darker)
  const edge: Mat = { color: '#2a120c', tex: 'none', rough: 0.2, metal: 0.4 };
  const belly: Mat = { color: '#7a3424', tex: 'leather', rough: 0.4 };
  const second: Mat = { color: '#7a3424', tex: 'leather', rough: 0.35 };
  // how it walks: front-heavy on two great pillars, it crutch-walks. Both forelegs reach and plant together, its weight
  // crashing onto them (the head dipping), then the body vaults up and forward through them, highest as it passes
  // over, while the small hind legs shuffle two quick steps beneath it. Charging, it bounds: forelegs together, then
  // hind together, gathering and launching, off the ground between. (Feet planted: every foot down moves back at one
  // speed: reach × 2 ÷ duty a loop, the same for each leg.) Idle, it breathes; striking, it rears back on its
  // forelegs and slams its head down
  const bound = walking && p.style === 'charge', ph = ((p.phase % 1) + 1) % 1;
  const FORE = bound ? { reach: 0.28, duty: 0.35, lift: 0.16 } : { reach: 0, duty: 0, lift: 0.16 }; // (walking: worked out below)
  const HIND = bound ? { reach: 0.14, duty: 0.175, lift: 0.08 } : { reach: 0, duty: 0.5, lift: 0.07 }; // (bounding, a short hard push)
  const sm = (x: number) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };
  let surge = 0, dip = p.anim === 'idle' ? Math.sin(t) * 0.01 : 0, pitch = 0, nod = 0;
  // the crutch-walk, worked out on the ground: its body vaults 2A through its planted forelegs, then creeps on (a share
  // σ of the loop's S) while they reach, its hind feet down. The model's origin moves at an even S a loop, so the
  // body surges ahead of it and falls back; feet down stay where they were put
  let fore: ((z: number) => Vec3) | null = null, hind: ((z: number) => Vec3) | null = null;
  if (walking && !bound) {
    const A = 0.38, sig = 0.1, S = (2 * A) / (1 - sig), d = 0.45;
    const ease = (k: number) => 0.4 * k + 0.6 * sm(k); // (the vault: quickest as it passes over)
    const B = (q: number) => q < d ? 2 * A * ease(q / d) : 2 * A + sig * S * sm((q - d) / (1 - d)); // (its body, on the ground)
    let mean = 0; for (let i = 0; i < 24; i++) mean += (B(i / 24) - S * (i / 24)) / 24;
    const toModel = (w: number) => w - S * ph - mean; // (a spot on the ground, in the model's frame now)
    surge = toModel(B(ph));
    const st = ph < d, k = st ? ph / d : (ph - d) / (1 - d);
    fore = (z) => { const w0 = 0.21 + A, w = st ? w0 : w0 + S * sm(k); return [toModel(w), st ? 0 : Math.sin(Math.PI * k) * FORE.lift, z * 0.42]; };
    hind = (z) => { // (down while the forelegs reach; hopping on together, one a touch behind, as it vaults)
      const lag = z > 0 ? 0 : 0.08, kh = st ? Math.max(0, (k - lag) / (1 - lag)) : 1;
      const w1 = 2 * A - 0.4 + sig * S / 2, w = st ? w1 - S + S * sm(kh) : w1;
      return [toModel(w), st ? Math.sin(Math.PI * kh) * HIND.lift : 0, z * 0.3];
    };
    dip = st ? 0.09 * Math.sin(Math.PI * k) - 0.04 * Math.max(0, 1 - k / 0.15) : -0.02 * Math.sin(Math.PI * k); // (up over them; the crash of the plant)
    // (it swings on its shoulders: nose-down at the plant, its rear high; the rear swinging forward and under through
    // the vault, nose up; held up as the forelegs reach, then crashing down onto them)
    pitch = st ? -0.18 + 0.4 * sm(k) : k < 0.55 ? 0.22 : 0.22 - 0.4 * sm((k - 0.55) / 0.45);
    nod = st ? 0.14 * Math.max(0, 1 - k / 0.35) : -0.06 * Math.sin(Math.PI * k);
  } else if (bound) {
    const air = (x: number) => Math.sin(Math.PI * Math.max(0, Math.min(1, x))); // (off the ground in the gaps between plants)
    dip = 0.07 * (air((ph - FORE.duty) / (0.5 - FORE.duty)) + air((ph - 0.5 - HIND.duty) / (0.5 - HIND.duty))) - 0.03 * Math.sin(Math.PI * Math.min(1, ph / FORE.duty));
    pitch = -0.1 * Math.sin(2 * Math.PI * ph); // (nose down landing on its forelegs, up as the hind legs launch it)
    surge = 0.03 * Math.sin(2 * Math.PI * ph);
    nod = 0.08 * Math.sin(2 * Math.PI * ph);
  }
  const roll = 0;
  const rear = atk < 0 ? 0 : atk < 0.3 ? 0.32 * Math.sin((atk / 0.3) * Math.PI / 2) : atk < 0.45 ? 0.32 - 0.62 * ((atk - 0.3) / 0.15) : -0.3 * (1 - (atk - 0.45) / 0.55) ** 2;
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    const y = 0.5 + dip;
    c.joint([0.16 + surge, y, 0], [roll, 0, rear + pitch], (bd) => { // (the body pivots over its forelegs)
      const Y = 0;
      const X = (x: number) => x - 0.16;
      goliathTorso(bd, torso, X, Y, t, p, { shell, plate, edge, belly });
      // the shoulders: heavy masses over the forelegs' roots, rolling with the body (no bare leg ends)
      for (const z of [1, -1]) { bd.sphere([0.13, 0.12, 0.12], [X(0.17), Y + 0.06, z * 0.22], plate); bd.sphere([0.09, 0.07, 0.08], [X(0.12), Y + 0.12, z * 0.18], plate); }
      // the head: broad and flattened, eyes on its sides, a mouth beneath its front; nodding with the stride
      bd.joint([X(0.34), Y, 0], [0, 0, -nod], (h) => {
        h.loft([[-0.06, 0.1, 0.08, 0.07], [0.04, 0.15, 0.08, 0.07, 0.4], [0.14, 0.13, 0.06, 0.06, 0.5], [0.19, 0.08, 0.04, 0.045]].map(([x, w, u, d, fl]) => ({ at: [x, 0, 0] as Vec3, w, up: u, down: d, flat: fl ?? 0 })), plate);
        for (const z of [1, -1]) h.sphere([0.028, 0.03, 0.022], [0.08, 0.035, z * 0.14], { color: '#0a0806', rough: 0.1, metal: 0.4 }); // eyes
        h.sphere([0.03, 0.022, 0.05], [0.19, -0.04, 0], { color: '#2a0c08', tex: 'skin', rough: 0.8 }); // the mouth
        // the mandibles: its crystal (dark chitin without one), sweeping out from the mouth's corners and curving back
        // in to meet, flexing at rest, clamping on a blow
        const mand: Mat = p.armed ? { color: '#8fe6ff', rough: 0.12, metal: 0.15, emissive: '#2a8fc0' } : edge;
        const flex = p.anim === 'idle' ? Math.sin(t) * 0.015 : 0;
        for (const z of [1, -1]) {
          const root: Vec3 = [0.16, -0.03, z * 0.07], elbow: Vec3 = [0.32, 0.02, z * (0.2 - clamp * 0.05 + flex)], tip: Vec3 = [0.52, -0.02, z * (0.03 - clamp * 0.02 + flex)];
          shapedLimb(h, root, elbow, 0.045, [1.15, 1.05, 0.95, 0.85], mand, { flat: 0.45, keel: 0.6 });
          shapedLimb(h, elbow, tip, 0.038, [0.95, 0.8, 0.6, 0.3], mand, { flat: 0.45, keel: 0.6 });
          for (const k of [0.35, 0.65]) h.cone(0.013, 0.05, [elbow[0] + (tip[0] - elbow[0]) * k, -0.01, elbow[2] + (tip[2] - elbow[2]) * k - z * 0.025], mand, [z * Math.PI / 2, 0, 0], 4); // teeth on its inner edge
        }
      });
    });
    // the legs: the great forelegs knuckling, planting together; the hind legs smaller, shuffling (walking) or pushing
    // off together (bounding). Their hips ride with the body's surge, pitch and dip
    const hindY = (x: number) => y + Math.sin(pitch) * (x - 0.16) + Math.min(0.03, Math.sin(rear) * (x - 0.16)); // (its hips swing with its body; striking, its short hind legs keep their feet down)
    for (const z of [1, -1]) {
      gLeg(c, [0.16 + surge, y + 0.08, z * 0.26], fore?.(z) ?? [0.36, 0, z * 0.42], ph + (z > 0 ? 0 : 0.03), walking && !fore, 0.36, 0.38, 0.085, [-0.3, 0.6, z], FORE.reach, second, FORE.lift, FORE.duty);
      gLeg(c, [-0.36 + surge, hindY(-0.36) - 0.12, z * 0.14], hind?.(z) ?? [-0.4, 0, z * 0.3], ph + 0.5 + (z > 0 ? 0 : 0.03), walking && !hind, 0.2, 0.2, 0.045, [0.5, 0.6, z], HIND.reach, second, HIND.lift, HIND.duty);
    }
  }, G);
}

/** G4. Trilobite ram: a long, low armoured body of overlapping segments on ten short legs rippling in a wave, a broad ramming head plate. */
export function gTrilobite(b: ModelBuilder, p: Pose): void {
  const walking = p.anim === 'walk';
  const chitin: Mat = { color: '#56626c', tex: 'leather', rough: 0.3, metal: 0.3 }, rim: Mat = { color: '#8a3a22', tex: 'leather', rough: 0.35 }, second: Mat = { color: '#8a3a22', tex: 'leather', rough: 0.35 }; // (its own colours)
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    const y = 0.2;
    for (let i = 0; i < 7; i++) { // the segments, each a little arched plate overlapping the next
      const x = 0.3 - i * 0.15, w = 0.36 - Math.abs(i - 2) * 0.03;
      c.loft([0, 1, 2].map((k) => ({ at: [x - k * 0.08, y, 0] as Vec3, w: w * (k === 1 ? 1 : 0.9), up: 0.12, down: 0.05, flat: 0.5 })), i % 2 ? chitin : { color: '#232a2c', tex: 'leather', rough: 0.2, metal: 0.45 });
      c.cone(0.02, 0.06, [x - 0.08, y + 0.13, 0], rim, [0, 0, 0.4], 4); // a ridge spine
    }
    c.loft([[0.5, 0.2, 0.06, 0.03], [0.42, 0.42, 0.1, 0.04], [0.3, 0.4, 0.12, 0.05]].map(([x, w, u, d]) => ({ at: [x, y + 0.02, 0] as Vec3, w, up: u, down: d, flat: 0.6 })), chitin); // the head plate
    for (const z of [1, -1]) c.sphere([0.03, 0.03, 0.04], [0.42, y + 0.1, z * 0.18], { color: '#0a0a0a', rough: 0.1 });
    if (p.armed) c.crystal(0.14, [0.52, y + 0.02, 0], [0, 0, -Math.PI / 2]);
    for (let i = 0; i < 5; i++) for (const z of [1, -1]) { // ten short legs, stepping in a wave
      const x = 0.2 - i * 0.18;
      gLeg(c, [x, y - 0.02, z * 0.24], [x + 0.02, 0, z * 0.46], p.phase + i * 0.2 + (z > 0 ? 0 : 0.5), walking, 0.14, 0.16, 0.03, [0, 1, z], 0.05, second);
    }
  }, G);
}

/** G5. Mole-cricket digger: a fat body behind a heavy armoured head, great shovel forelegs with toothed blades it smashes with. */
export function gMole(b: ModelBuilder, p: Pose): void {
  const walking = p.anim === 'walk', smash = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase / 0.6) * Math.PI) : 0;
  const chitin: Mat = { color: '#a07a3c', tex: 'fur', rough: 0.7 }, rim: Mat = { color: '#3c2a18', tex: 'leather', rough: 0.35, metal: 0.2 }, second: Mat = { color: '#5a4020', tex: 'leather', rough: 0.4 }; // (its own colours)
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    const y = 0.32;
    c.loft([[0.38, 0.16, 0.16, 0.1], [0.24, 0.24, 0.24, 0.14], [0.05, 0.22, 0.2, 0.14], [-0.2, 0.3, 0.26, 0.18], [-0.5, 0.26, 0.22, 0.16], [-0.72, 0.1, 0.1, 0.08]].map(([x, w, u, d]) => ({ at: [x, y, 0] as Vec3, w, up: u, down: d })), chitin);
    c.loft([[0.42, 0.18, 0.2, 0.06], [0.26, 0.26, 0.28, 0.08], [0.12, 0.2, 0.22, 0.06]].map(([x, w, u, d]) => ({ at: [x, y + 0.02, 0] as Vec3, w, up: u, down: d, flat: 0.3 })), rim); // the armoured head shield
    for (const z of [1, -1]) {
      // a shovel foreleg: a thick arm ending in a broad flat toothed blade, raised and brought down to smash
      c.joint([0.34, y - 0.04, z * 0.2], [0, 0, -0.3 + smash * 1.0 - (walking ? Math.sin(p.phase * Math.PI * 2 + (z > 0 ? 0 : Math.PI)) * 0.2 : 0)], (a) => {
        shapedLimb(a, [0, 0, 0], [0.18, -0.18, z * 0.08], 0.07, [1.2, 1.25, 1.0, 0.85], chitin, { flat: 0.3 });
        a.joint([0.18, -0.18, z * 0.08], [0, 0, -0.6], (s) => {
          s.loft([0, 0.5, 1].map((k) => ({ at: [k * 0.2, 0, 0] as Vec3, w: 0.09 + k * 0.03, up: 0.02, down: 0.02, flat: 0.8 })), chitin); // the blade
          for (let t = 0; t < 4; t++) s.cone(0.015, 0.05, [0.22, 0, (t - 1.5) * 0.05], claw, [0, 0, -Math.PI / 2], 4); // its teeth
        });
      });
    }
    if (p.armed) c.crystal(0.12, [0.48, y + 0.04, 0], [0, 0, -Math.PI / 2]);
    for (const [x, ph] of [[0.0, 0.5], [-0.3, 0]] as const) for (const z of [1, -1]) gLeg(c, [x, y - 0.1, z * 0.2], [x - 0.06, 0, z * 0.44], p.phase + ph + (z > 0 ? 0 : 0.5), walking, 0.2, 0.24, 0.05, [-0.3, 1, z], undefined, second);
  }, G);
}

/**
 * A Goliath concept (the user's idea, 2026-10-29): a single-leg mega hopper battering ram. Its body is the ram-wedge
 * torso, the crystal set in its battering boss; under its middle one massive hopping leg (a thick thigh, a long shin,
 * a broad three-toed foot to balance on). It goes in heavy bounds, played by stride (UnitSpec.gait): sinking into a
 * crouch and springing, the leg trailing in flight then swinging forward, landing and absorbing the weight. It strikes by
 * crouching, springing and slamming in ram first; at rest it sits crouched low on its folded leg.
 */
export function gHopper(b: ModelBuilder, p: Pose): void {
  const sm = (x: number) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };
  const shell: Mat = { color: '#b04a2c', tex: 'none', rough: 0.15, metal: 0.35 }, plate: Mat = { color: '#5a2418', tex: 'leather', rough: 0.25, metal: 0.35 };
  const edge: Mat = { color: '#2a120c', tex: 'none', rough: 0.2, metal: 0.4 }, belly: Mat = { color: '#7a3424', tex: 'leather', rough: 0.4 };
  const leg: Mat = { color: '#7a3424', tex: 'leather', rough: 0.35 };
  const moving = p.anim === 'walk', ph = ((p.phase % 1) + 1) % 1, t = p.phase * Math.PI * 2;
  const big = p.style === 'charge' ? 1.45 : 1; // (charging: bigger bounds)
  // the bound (UP: its crouch-and-push share; then in the air; then landing), as the gait plays it (gait hop 0.55)
  const UP = 0.3, AIR = 0.55;
  let crouch = 0.65 + 0.03 * Math.sin(t), height = 0, pitch = 0, footX = 0, footY = 0, thrust = 0;
  if (moving) {
    if (ph < UP) { const k = ph / UP; crouch = k < 0.7 ? sm(k / 0.7) : 1 - sm((k - 0.7) / 0.3); pitch = 0.2 * crouch; } // (sinking deep, then springing)
    else if (ph < UP + AIR) { // in the air: up and over, the leg trailing then swinging forward to land
      const a = (ph - UP) / AIR;
      crouch = 0; height = 4 * a * (1 - a) * 0.55 * big; pitch = 0.3 * (1 - 2 * a);
      footX = -0.45 * (1 - sm(a)) + 0.14 * Math.sin(Math.PI * a); footY = height * 0.5 + 0.1 * Math.sin(Math.PI * a);
    } else { const k = (ph - UP - AIR) / (1 - UP - AIR); crouch = 0.8 * Math.sin(Math.PI * k); pitch = -0.2 * Math.sin(Math.PI * k); } // (landing hard, taking the weight)
  } else if (p.anim === 'attack') { // its bound is the blow: crouching (to 0.35), springing off nose up, the leg
    // trailing, then coming down ram first, thrust forward into the impact (at 1)
    const a = p.phase, f = Math.max(0, (a - 0.35) / 0.65);
    crouch = a < 0.35 ? sm(a / 0.25) * (1 - sm((a - 0.28) / 0.07)) : 0;
    height = a < 0.35 ? 0 : 4 * f * (1 - f) * 0.6 + 0.06 * f;
    pitch = a < 0.35 ? 0.22 * crouch : 0.35 - 0.85 * sm((f - 0.2) / 0.75); // (nose up off the ground, nose down into the slam)
    thrust = 0.42 * sm((f - 0.55) / 0.45);
    if (a >= 0.35) { footX = -0.25 - 0.3 * sm(f / 0.5) + 0.12 * sm((f - 0.7) / 0.3); footY = height * 0.5; }
  }
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    const hipY = 0.66 - 0.32 * crouch + height, hip: Vec3 = [thrust * 0.6, hipY, 0];
    // the body over its hip: a long level ram, banded with armour plates, a spine ridge down its back, a heavy blunt
    // boss in front capped with its crystal, tapering behind to a tail
    c.joint([thrust, hipY + 0.14, 0], [0, 0, pitch], (bd) => {
      const prof = [[-0.9, 0.04], [-0.7, 0.11], [-0.4, 0.18], [0, 0.21], [0.35, 0.22], [0.52, 0.2]] as const;
      bd.loft(prof.map(([x, w]) => ({ at: [x, 0, 0] as Vec3, w, up: w, down: w * 0.9 })), belly);
      const girth = (x: number) => { for (let j = 1; j < prof.length; j++) if (x <= prof[j][0]) { const [x0, r0] = prof[j - 1], [x1, r1] = prof[j]; return r0 + ((x - x0) / (x1 - x0)) * (r1 - r0); } return prof[prof.length - 1][1]; };
      for (let i = 0; i < 9; i++) { // overlapping armour bands down its whole length, each over the next toward the front
        const x = -0.78 + i * 0.15, r = girth(x + 0.1) + 0.015;
        bd.loft([0, 1].map((k) => ({ at: [x + k * 0.13, 0.01, 0] as Vec3, w: r * (k ? 1 : 0.9), up: r * (k ? 1 : 0.9), down: r * 0.88 * (k ? 1 : 0.9) })), i % 2 ? plate : shell);
        bd.loft([0, 1].map((k) => ({ at: [x + 0.13 + k * 0.02, 0.01, 0] as Vec3, w: r * 1.02, up: r * 1.02, down: r * 0.9 })), edge); // its lip
        bd.cone(0.03, 0.09, [x + 0.08, r + 0.03, 0], edge, [0, 0, -0.5], 4); // the spine ridge
      }
      bd.loft([[0.54, 0.25, 0.25, 0.23], [0.62, 0.26, 0.26, 0.24], [0.68, 0.2, 0.2, 0.18]].map(([x, w, u, d]) => ({ at: [x, 0, 0] as Vec3, w, up: u, down: d, flat: 0.5 })), edge); // the blunt boss
      bd.crystal(0.24, [0.7, 0, 0], [0, 0, -Math.PI / 2]); // its crystal, capping the boss, point forward
      for (const [y, z] of [[0.1, 0.1], [0.1, -0.1], [-0.08, 0.1], [-0.08, -0.1]] as const) bd.crystal(0.11, [0.66, y, z], [z * 2.5, 0, -Math.PI / 2 + y * 1.5]); // and a ring of smaller ones round it
    });
    // the one leg: a thick thigh from a heavy haunch, its knee forward, a long shin, the ankle back, a broad foot
    const foot: Vec3 = [footX, footY, 0], ankle: Vec3 = [foot[0] - 0.12, foot[1] + 0.16, 0];
    const knee = jointBetween(hip, ankle, 0.42, 0.44, [1, 0.35, 0]);
    c.sphere([0.17, 0.14, 0.17], [hip[0], hip[1] + 0.04, 0], plate); // the haunch, under the ram
    shapedLimb(c, hip, knee, 0.13, [1.2, 1.35, 1.2, 0.9, 0.7], leg, { flat: 0.2 });
    c.sphere(0.09, knee, edge);
    shapedLimb(c, knee, ankle, 0.085, [1.0, 0.85, 0.7, 0.6, 0.65], leg, { flat: 0.3, keel: 0.4 });
    c.sphere(0.06, ankle, edge);
    shapedLimb(c, ankle, foot, 0.06, [1.0, 0.9, 0.8, 0.9], leg, { flat: 0.4 });
    for (const [dz, l] of [[-0.11, 0.17], [0, 0.22], [0.11, 0.17]] as const) // three broad toes, splayed, to balance on
      shapedLimb(c, foot, [foot[0] + l * 0.95, Math.max(0.01, foot[1] - 0.02), dz + dz * 0.6], 0.035, [1.0, 0.9, 0.6, 0.3], edge, { flat: 0.6 });
    c.cone(0.03, 0.12, [foot[0] - 0.08, foot[1] + 0.02, 0], edge, [0, 0, Math.PI / 2 + 0.3], 4); // a back spur
  }, G);
}
