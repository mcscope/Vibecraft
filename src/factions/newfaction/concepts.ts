// Three concepts for the micropike (2026-11-04, for the user to choose from): other body plans that keep its pike and its
// ways (setting the pike against a charge, stabbing, charging with it level). Dev only: the sprites page bakes them
// (?mode=sprites&concept=a|b|c&anim=…), nothing in the game uses them.
import type { Mat, ModelBuilder, Pose, Vec3 } from '../../kits/bake3d/types';
import { footAt, jointBetween, shapedLimb } from '../../kits/bake3d/gait';

const TAU = Math.PI * 2;
const chitin: Mat = { color: '#1a2628', tex: 'leather', rough: 0.3, metal: 0.35 };
const sheen: Mat = { color: '#c98a2e', tex: 'leather', rough: 0.3, metal: 0.4 };
const muscle: Mat = { color: '#5a4022', tex: 'leather', rough: 0.4, metal: 0.2 };
const claw: Mat = { color: '#0e1210', tex: 'none', rough: 0.4 };
const eye: Mat = { color: '#050608', tex: 'none', rough: 0.05, metal: 0.5 };
const SCALE = Math.cbrt(35 / 38); // (its 35 kg, drawn as the chargers are)
const sm = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };

/** How a pose moves it: walking, running, braced, and how far through a stab (−1: not stabbing). */
function motion(p: Pose) {
  const walking = p.anim === 'walk', running = walking && p.style === 'charge';
  return { walking, running, braced: p.style === 'brace', hit: p.anim === 'attack' ? p.phase : -1, t: p.phase * TAU };
}
/** A stab's thrust, 0 … 1 … 0: drawn back a little, driven out fast (contact at 0.4), recovering slowly. */
const thrust = (hit: number) => (hit < 0 ? 0 : hit < 0.3 ? -0.15 * sm(hit / 0.3) : hit < 0.42 ? -0.15 + 1.15 * sm((hit - 0.3) / 0.12) : 1 - sm((hit - 0.42) / 0.58));

/** A pike along +x from its butt at the origin: `len` long, `r0` thick at the butt tapering to `r1`, a crystal at its point. */
function pike(q: ModelBuilder, len: number, r0: number, r1: number, armed: boolean): void {
  q.loft([0, 0.3, 0.7, 1].map((f) => { const r = r0 + (r1 - r0) * f; return { at: [f * len, 0, 0] as Vec3, w: r, up: r, down: r * 0.9, keel: 0.3 }; }), chitin);
  for (let i = 1; i < 6; i++) { const f = i / 6, r = r0 + (r1 - r0) * f; q.sphere([0.01, r * 1.08, r * 1.08], [f * len, 0, 0], sheen); }
  if (armed) q.crystal(0.2, [len + 0.03, 0, 0], [0, 0, -Math.PI / 2]);
}

/** A thin insect leg from `hip` to `foot`, its knee bent up and out toward `toward`. */
function leg(c: ModelBuilder, hip: Vec3, foot: Vec3, l1: number, l2: number, toward: Vec3, r = 0.022): void {
  const knee = jointBetween(hip, foot, l1, l2, toward);
  c.limb(hip, knee, r, chitin, r * 0.8);
  c.sphere(r * 0.9, knee, sheen);
  c.limb(knee, foot, r * 0.8, chitin, r * 0.35);
  c.cone(r * 0.5, 0.05, [foot[0] + 0.02, 0.01, foot[2]], claw, [0, 0, -Math.PI / 2], 4);
}

/**
 * A: the stick insect. The pike is its whole body, thick at the back tapering to the point, carried level on six long
 * splayed legs along its back half, knees high and out; it walks on alternating threes (two legs one side, one the
 * other), always on a tripod of feet. Setting, its hind legs fold and its point rises; stabbing, the whole body surges
 * forward over its planted feet.
 */
export function conceptA(b: ModelBuilder, p: Pose): void {
  const { walking, running, braced, hit, t } = motion(p);
  const pitch = braced ? 0.35 : running ? -0.02 : hit >= 0 ? 0.05 - 0.1 * thrust(hit) : 0.04 + 0.01 * Math.sin(t);
  const y0 = braced ? 0.36 : running ? 0.36 : 0.42, lunge = 0.28 * thrust(hit);
  const bob = walking ? 0.012 * Math.cos(t * 2) : 0;
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    const at = (x: number): Vec3 => [lunge + x * Math.cos(pitch), y0 + bob + x * Math.sin(pitch), 0];
    // the body: from its rear end, thick, out to the point
    c.joint(at(-0.55), [0, 0, pitch], (q) => {
      pike(q, 1.6, 0.085, 0.022, p.armed);
      q.sphere([0.07, 0.05, 0.06], [0.06, 0.02, 0], muscle); // (where the legs hold on)
      for (const z of [1, -1]) q.sphere(0.014, [1.42, 0.02, z * 0.02], eye);
    });
    const hips = [-0.38, -0.12, 0.14]; // along the body: its back half
    hips.forEach((x, i) => {
      for (const S of [1, -1]) {
        const hip = at(x), rest: Vec3 = [x - 0.08 + 0.14 * i, 0.01, S * (0.4 + 0.04 * (1 - i))];
        hip[2] = S * 0.04;
        const ph = p.phase + ((i % 2 === 0) === (S > 0) ? 0 : 0.5); // (alternating threes)
        const foot = running ? footAt(rest, ph, 0.2, 0.08, 0.45) : walking ? footAt(rest, ph, 0.12, 0.06, 0.6) : rest;
        // (braced: its hind pair folded low under the raised point)
        const f: Vec3 = braced && i === 0 ? [foot[0] - 0.04, foot[1], foot[2]] : foot;
        leg(c, hip, f, 0.34, 0.42, [0, 1, S * 0.7]);
      }
    });
  }, SCALE);
}

/**
 * B: the see-saw. A compact body on two stout bird legs; the pike runs right through it like a lever, the body its
 * pivot, a heavy round abdomen on the pike's short rear end its counterweight, so the whole balances over the feet under
 * the body. Setting, it tips the abdomen down and the point up; stabbing, it rocks the point down and forward as its
 * body drives in behind it.
 */
export function conceptB(b: ModelBuilder, p: Pose): void {
  const { walking, running, braced, hit, t } = motion(p);
  const pitch = braced ? 0.5 : running ? 0 : hit >= 0 ? 0.12 - 0.32 * thrust(hit) : 0.12 + 0.03 * Math.sin(t);
  const crouch = braced ? 0.15 : running ? 0.1 : 0, lunge = 0.22 * thrust(hit);
  const mid = 0.25, onFoot = Math.cos((p.phase - mid) * TAU), sway = walking ? 0.09 * (running ? 0.35 : 0.8) * onFoot : 0;
  const H = 0.62 * (1 - crouch) + (walking ? (running ? -0.03 - 0.03 * Math.cos((p.phase - 0.175) * 2 * TAU) : 0.012 * Math.cos((p.phase - mid) * 2 * TAU)) : 0);
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    for (const S of [1, -1]) {
      const hip: Vec3 = [lunge, H, S * 0.09 + sway], rest: Vec3 = [0, 0.01, S * 0.12];
      const ph = p.phase + (S > 0 ? 0 : 0.5);
      const foot = running ? footAt(rest, ph, 0.3, 0.12, 0.35) : walking ? footAt(rest, ph, 0.2, 0.1, 0.55) : rest;
      const ankle: Vec3 = [foot[0] - 0.07, foot[1] + 0.2, foot[2]];
      const knee = jointBetween(hip, ankle, 0.3, 0.32, [1, 0.3, S * 0.4]);
      shapedLimb(c, hip, knee, 0.06, [1.1, 1.4, 1.3, 1.0, 0.7], muscle);
      c.sphere(0.04, knee, chitin);
      shapedLimb(c, knee, ankle, 0.036, [1.0, 0.85, 0.7, 0.66, 0.7], chitin, { flat: 0.3 });
      shapedLimb(c, ankle, foot, 0.024, [1.0, 0.85, 0.75, 0.8], chitin);
      for (const dz of [-0.03, 0, 0.03]) c.cone(0.012, 0.07, [foot[0] + 0.05, 0.01, foot[2] + dz], claw, [0, dz * 4, -Math.PI / 2], 4);
      c.cone(0.012, 0.06, [foot[0] - 0.045, 0.01, foot[2]], claw, [0, 0, Math.PI / 2], 4);
    }
    // the lever: pivoting on the body at the hips, its short end the counterweight, its long end the pike
    c.joint([lunge, H + 0.08, sway], [0, 0, pitch], (q) => {
      q.sphere([0.17, 0.15, 0.15], [0, 0, 0], muscle); // the body, its pivot
      for (const z of [1, -1]) q.sphere(0.02, [0.12, 0.08, z * 0.07], eye);
      q.sphere([0.22, 0.17, 0.17], [-0.42, -0.02, 0], chitin); // the counterweight abdomen
      for (const x of [-0.3, -0.42, -0.54]) q.sphere([0.012, 0.15, 0.15], [x, -0.02, 0], sheen);
      q.joint([0.1, 0, 0], [0, 0, 0], (k) => pike(k, 1.15, 0.06, 0.02, p.armed));
    });
  }, SCALE);
}

/**
 * C: the tripod pendulum. Three long legs meet at a hub high over the ground, knees up above it like a harvestman's;
 * the pike hangs point-down beneath the hub, so it's always balanced (a pendulum). Walking, it steps one leg at a time,
 * the pike swinging a little behind; setting, it swings the pike up and forward to a raised point; charging, level out
 * in front, the hub low; stabbing, it drives the level pike forward with its whole hub.
 */
export function conceptC(b: ModelBuilder, p: Pose): void {
  const { walking, running, braced, hit, t } = motion(p);
  // the pike's swing up from hanging straight down (0) toward level forward (π/2)
  const swing = braced ? 1.2 : running ? 1.55 : hit >= 0 ? 1.45 + 0.1 * thrust(hit) : walking ? 0.12 * Math.sin(t) - 0.05 : 0.03 * Math.sin(t);
  const hubY = braced ? 0.75 : running || hit >= 0 ? 0.68 : 1.0, lunge = 0.25 * thrust(hit);
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    const hub: Vec3 = [lunge, hubY + (walking && !running ? 0.015 * Math.cos(t * 3) : 0), 0];
    c.sphere([0.1, 0.08, 0.1], hub, muscle);
    for (const z of [1, -1]) c.sphere(0.016, [hub[0] + 0.08, hub[1] + 0.03, z * 0.05], eye);
    // three legs, spread around the hub (two ahead to the sides, one behind), stepping one at a time
    [[0.35, 0.5], [0.35, -0.5], [-0.6, 0]].forEach(([fx, fz], i) => {
      const rest: Vec3 = [fx, 0.01, fz];
      const ph = p.phase + i / 3;
      const foot = running ? footAt(rest, ph, 0.25, 0.12, 0.5) : walking ? footAt(rest, ph, 0.14, 0.1, 0.72) : rest;
      const out = Math.hypot(fx, fz) || 1;
      leg(c, [hub[0] + fx * 0.12, hub[1], fz * 0.12], foot, 0.62, 0.85, [fx / out, 1.4, fz / out], 0.026);
    });
    // the pike, its butt at the hub, hanging
    c.joint(hub, [0, 0, -Math.PI / 2 + swing], (q) => pike(q, 0.85, 0.055, 0.02, p.armed));
  }, SCALE);
}

export const MICROPIKE_CONCEPTS: Record<string, (b: ModelBuilder, p: Pose) => void> = { a: conceptA, b: conceptB, c: conceptC };
