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
function gLeg(c: ModelBuilder, hip: Vec3, rest: Vec3, phase: number, walking: boolean, l1: number, l2: number, r: number, bend: Vec3, reach = 0.08, mat: Mat = chitin): void {
  const foot = walking ? footAt(rest, phase, reach, 0.05) : rest;
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

/** G3. Stag bull: hunched and front-heavy on two massive knuckle-walking forelegs, smaller hind legs, huge stag-beetle mandibles clamping a crystal. */
export function gStag(b: ModelBuilder, p: Pose): void {
  const walking = p.anim === 'walk', clamp = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase / 0.6) * Math.PI) : 0;
  const chitin: Mat = { color: '#6a2418', tex: 'leather', rough: 0.25, metal: 0.3 }, rim: Mat = { color: '#120c0a', tex: 'none', rough: 0.15, metal: 0.5 }, second: Mat = { color: '#3a1410', tex: 'leather', rough: 0.3 }; // (its own colours)
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    const y = 0.5;
    c.loft([[0.3, 0.14, 0.12, 0.1], [0.12, 0.3, 0.3, 0.2], [-0.12, 0.26, 0.24, 0.16], [-0.38, 0.18, 0.14, 0.1], [-0.52, 0.06, 0.05, 0.04]].map(([x, w, u, d]) => ({ at: [x, y - (0.3 - x) * 0.25, 0] as Vec3, w, up: u, down: d, keel: 0.3 })), chitin); // hunched: high shoulders, falling away
    // the head: broad and flattened, as a stag beetle's, eyes on its sides, a mouth beneath its front
    c.loft([[0.28, 0.1, 0.08, 0.07], [0.38, 0.15, 0.08, 0.07, 0.4], [0.48, 0.13, 0.06, 0.06, 0.5], [0.53, 0.08, 0.04, 0.045]].map(([x, w, u, d, fl]) => ({ at: [x, y, 0] as Vec3, w, up: u, down: d, flat: fl ?? 0 })), chitin);
    for (const z of [1, -1]) c.sphere([0.028, 0.03, 0.022], [0.42, y + 0.035, z * 0.14], { color: '#0a0806', rough: 0.1, metal: 0.4 }); // eyes
    c.sphere([0.03, 0.022, 0.05], [0.53, y - 0.04, 0], { color: '#2a0c08', tex: 'skin', rough: 0.8 }); // the mouth
    // the mandibles, from the mouth's corners: sweeping out and forward, then curving back in to meet (closing harder on
    // a blow). Armed, they ARE its crystal: glowing, faceted; without one, dark chitin
    const mand: Mat = p.armed ? { color: '#8fe6ff', rough: 0.12, metal: 0.15, emissive: '#2a8fc0' } : rim;
    for (const z of [1, -1]) {
      const root: Vec3 = [0.5, y - 0.03, z * 0.07], elbow: Vec3 = [0.66, y + 0.02, z * (0.2 - clamp * 0.04)], tip: Vec3 = [0.86, y - 0.02, z * (0.03 - clamp * 0.02)];
      shapedLimb(c, root, elbow, 0.045, [1.15, 1.05, 0.95, 0.85], mand, { flat: 0.45, keel: 0.6 });
      shapedLimb(c, elbow, tip, 0.038, [0.95, 0.8, 0.6, 0.3], mand, { flat: 0.45, keel: 0.6 });
      for (const k of [0.35, 0.65]) c.cone(0.013, 0.05, [elbow[0] + (tip[0] - elbow[0]) * k, y - 0.01, elbow[2] + (tip[2] - elbow[2]) * k - z * 0.025], mand, [z * Math.PI / 2, 0, 0], 4); // teeth on its inner edge
    }
    for (const z of [1, -1]) {
      gLeg(c, [0.16, y + 0.08, z * 0.26], [0.36, 0, z * 0.42], p.phase + (z > 0 ? 0 : 0.5), walking, 0.36, 0.38, 0.085, [-0.3, 0.6, z], 0.1, second); // the great forelegs, knuckling
      gLeg(c, [-0.36, y - 0.12, z * 0.14], [-0.4, 0, z * 0.3], p.phase + 0.5 + (z > 0 ? 0 : 0.5), walking, 0.2, 0.2, 0.045, [0.5, 0.6, z], undefined, second);
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
