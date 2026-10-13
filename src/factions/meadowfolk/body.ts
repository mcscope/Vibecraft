// Reusable rigs for building unit models out of primitives.
// Convention: unit faces +x, +y up, +z is its left. A person is ~1.7 tall.
import type { Mat, ModelBuilder, Pose, Vec3 } from '../types';

const TAU = Math.PI * 2;

/** Rotate a "hanging" vector of length `len` forward by angle a (0 = straight down, π/2 = forward, π = up). */
export function swing(from: Vec3, len: number, a: number): Vec3 {
  return [from[0] + Math.sin(a) * len, from[1] - Math.cos(a) * len, from[2]];
}

/**
 * Weapon-arm angle for the pose. Strike: wind up overhead, chop forward.
 * Throw: whirl overhead and release. Gather: chop at the ground. Eat: hand to mouth.
 */
export function armAngle(p: Pose, style: 'strike' | 'throw' | 'lance' = 'strike'): number {
  const t = p.phase;
  switch (p.anim) {
    case 'attack':
      if (style === 'lance') return 1.45 + (t < 0.4 ? -0.15 * (t / 0.4) : t < 0.6 ? 0.1 : 0.1 * (1 - (t - 0.6) / 0.4));
      if (style === 'throw') return t < 0.65 ? 3.0 + Math.sin(t * TAU * 2.2) * 0.35 : 3.0 - ((t - 0.65) / 0.35) * 1.6;
      if (t < 0.45) return 0.3 + (t / 0.45) * 3.1; // wind up over the head
      if (t < 0.65) return 3.4 - ((t - 0.45) / 0.2) * 2.6; // chop
      return 0.8 - ((t - 0.65) / 0.35) * 0.5;
    case 'gather': return 0.9 + Math.abs(Math.sin(t * Math.PI)) * 1.2;
    case 'eat': return 2.3 + Math.sin(t * TAU) * 0.15;
    case 'walk': return Math.sin(t * TAU) * 0.45;
    case 'tired': return 0.05;
    default: return 0.12 + Math.sin(t * TAU) * 0.03;
  }
}

export interface HumanLook {
  skin: string;
  hair: string;
  tunic: Mat;
  trousers: Mat;
  boots: Mat;
  /** Overall size (1 = 1.7 tall). */
  scale?: number;
  /** Torso width multiplier. */
  bulk?: number;
  head?: 'hood' | 'helmet' | 'bare' | 'band';
  /** Team-coloured cloth: shoulders/hood/tabard. */
  tabard?: boolean;
  mounted?: boolean;
}

/**
 * Builds a person. `weapon` is called inside the right hand's joint; the hand's
 * local -y points along the forearm, +x is the knuckles' forward direction.
 * `offhand` likewise for the left hand.
 */
export function human(
  b: ModelBuilder,
  p: Pose,
  look: HumanLook,
  rightArm: number,
  weapon?: (h: ModelBuilder) => void,
  offhand?: (h: ModelBuilder) => void,
  leftArm?: number,
): void {
  const s = look.scale ?? 1;
  const bulk = look.bulk ?? 1;
  const t = p.phase;
  const walking = p.anim === 'walk' && !look.mounted;
  const stride = walking ? Math.sin(t * TAU) * 0.5 : 0;
  const bob = walking ? Math.abs(Math.sin(t * TAU)) * 0.035 : p.anim === 'idle' ? Math.sin(t * TAU) * 0.008 : 0;
  const lean = p.anim === 'tired' ? 0.45 : p.anim === 'gather' ? 0.35 + Math.sin(t * Math.PI) * 0.1 : p.anim === 'attack' ? 0.12 : walking ? 0.06 : 0;
  const skin: Mat = { color: look.skin, tex: 'skin', rough: 0.7 };
  const hipY = 0.9;

  b.joint([0, 0, 0], [0, 0, 0], (b) => {
    // ── legs
    for (const side of [1, -1]) {
      const z = 0.1 * side * bulk;
      const hip: Vec3 = [0, hipY + bob, z];
      if (look.mounted) {
        // straddling: thigh forward and out, shin down
        const knee: Vec3 = [0.32, hipY - 0.12, z + 0.2 * side];
        const ankle: Vec3 = [0.22, hipY - 0.55, z + 0.24 * side];
        b.limb(hip, knee, 0.075 * bulk, look.trousers, 0.06);
        b.limb(knee, ankle, 0.06, look.boots, 0.05);
        continue;
      }
      const a = stride * side;
      const knee = swing(hip, 0.44, a);
      const lift = walking ? Math.max(0, Math.sin(t * TAU + (side > 0 ? 0 : Math.PI))) * 0.5 : 0;
      const ankle = swing(knee, 0.42, a - lift);
      b.limb(hip, knee, 0.075 * bulk, look.trousers, 0.06);
      b.limb(knee, ankle, 0.06, look.boots, 0.05);
      b.box([0.2, 0.07, 0.09], [ankle[0] + 0.06, ankle[1] - 0.02, ankle[2]], look.boots);
    }

    // ── upper body leans from the hips
    b.joint([0, hipY + bob, 0], [0, 0, -lean], (u) => {
      const tw = 0.2 * bulk;
      // skirt of the tunic
      u.cylinder(tw * 1.05, tw * 1.3, 0.32, [0, -0.06, 0], look.tunic);
      // chest
      u.sphere([0.17 * bulk, 0.33, tw * 1.08], [0, 0.3, 0], look.tunic);
      u.cylinder(tw * 1.02, tw * 1.02, 0.06, [0, 0.08, 0], { color: '#4a3424', tex: 'leather' });
      if (look.tabard) {
        u.box([0.05, 0.5, tw * 1.25], [0.15 * bulk, 0.22, 0], { team: 'primary', tex: 'cloth' });
        u.sphere([0.13 * bulk, 0.08, 0.26 * bulk], [0, 0.55, 0], { team: 'primary', tex: 'cloth' });
      }
      // neck + head
      const headY = 0.72;
      u.cylinder(0.05, 0.06, 0.1, [0, 0.62, 0], skin);
      u.sphere([0.115, 0.13, 0.11], [0.01, headY, 0], skin);
      u.sphere(0.025, [0.115, headY - 0.01, 0], skin); // nose
      switch (look.head ?? 'bare') {
        case 'hood':
          u.sphere([0.135, 0.13, 0.13], [-0.02, headY + 0.03, 0], { team: 'primary', tex: 'cloth' });
          u.cone(0.07, 0.16, [-0.11, headY + 0.03, 0], { team: 'primary', tex: 'cloth' }, [0, 0, 1.9]);
          break;
        case 'helmet':
          u.sphere([0.135, 0.1, 0.13], [0, headY + 0.05, 0], { color: '#8a8f96', tex: 'metal' });
          u.cylinder(0.14, 0.14, 0.03, [0, headY + 0.01, 0], { color: '#6f747a', tex: 'metal' });
          u.box([0.02, 0.1, 0.025], [0.13, headY - 0.02, 0], { color: '#6f747a', tex: 'metal' });
          break;
        case 'band':
          u.sphere([0.12, 0.09, 0.115], [-0.01, headY + 0.05, 0], { color: look.hair, tex: 'hair' });
          u.cylinder(0.12, 0.12, 0.035, [0, headY + 0.03, 0], { team: 'primary', tex: 'cloth' });
          break;
        default:
          u.sphere([0.12, 0.09, 0.115], [-0.01, headY + 0.05, 0], { color: look.hair, tex: 'hair' });
      }

      // ── arms. Shoulders at chest top.
      const sh = 0.5;
      const leftA = leftArm ?? (p.anim === 'walk' && !look.mounted ? -rightArm : p.anim === 'tired' ? 0.05 : 0.15);
      for (const [side, a, hand] of [[-1, rightArm, weapon], [1, leftA, offhand]] as const) {
        const shoulder: Vec3 = [0, sh, side * 0.22 * bulk];
        const elbow = swing(shoulder, 0.28, a);
        const wrist = swing(elbow, 0.26, a + 0.25);
        u.sphere(0.075 * bulk, shoulder, look.tunic);
        u.limb(shoulder, elbow, 0.058 * bulk, look.tunic, 0.05);
        u.limb(elbow, wrist, 0.048, skin, 0.042);
        u.joint(wrist, [0, 0, a + 0.25], (h) => {
          h.sphere(0.05, [0, 0, 0], skin);
          if (hand) hand(h);
        });
      }
    });
  }, s);
}

/** Wicker basket or sack on the back showing cargo. Call inside the torso frame (after `human`). */
export function cargoPack(b: ModelBuilder, p: Pose, scale = 1): void {
  if (!p.cargo) return;
  b.joint([-0.24 * scale, 1.25 * scale, 0], [0, 0, 0.1], (k) => {
    if (p.cargo === 'wood') {
      for (let i = 0; i < 3; i++) k.limb([-0.05, -0.1 + i * 0.09, -0.16 + i * 0.02], [-0.05, -0.1 + i * 0.09, 0.16 + i * 0.02], 0.045, { color: '#6b4a2e', tex: 'wood' });
      k.limb([0.02, -0.12, 0], [0.02, 0.15, 0], 0.012, { color: '#5a3f28', tex: 'leather' });
    } else if (p.cargo === 'food') {
      k.cylinder(0.15, 0.12, 0.32, [0, 0, 0], { color: '#a5814f', tex: 'thatch' });
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05;
        k.sphere(0.045, [Math.cos(a) * 0.08, 0.17, Math.sin(a) * 0.08], { color: i % 2 ? '#8c1f2b' : '#5a1f3c', rough: 0.4 });
      }
    } else {
      k.sphere([0.14, 0.17, 0.15], [0, 0, 0], { color: '#6e5a40', tex: 'cloth' });
      k.crystal(0.18, [0.02, 0.12, 0.04], [0.3, 0, -0.2]);
      k.crystal(0.14, [-0.03, 0.1, -0.06], [-0.3, 0, 0.3]);
    }
  }, 1);
}

/** Four-legged gait. Returns the body bob. Legs at (±fx, *, ±z). */
export function quadLegs(b: ModelBuilder, p: Pose, o: { fx: number; bx: number; z: number; hip: number; len: number; r: number; mat: Mat; paw: Mat }): number {
  const walking = p.anim === 'walk';
  const t = p.phase * TAU;
  const bob = walking ? Math.abs(Math.sin(t)) * 0.04 * o.len : 0;
  const legs: Array<[number, number, number]> = [
    [o.fx, o.z, 0], [o.fx, -o.z, Math.PI], [o.bx, o.z, Math.PI], [o.bx, -o.z, 0],
  ];
  for (const [x, z, ph] of legs) {
    const a = walking ? Math.sin(t + ph) * 0.45 : p.anim === 'tired' ? 0.1 : 0;
    const hip: Vec3 = [x, o.hip + bob, z];
    const knee = swing(hip, o.len * 0.5, a);
    const lift = walking ? Math.max(0, Math.sin(t + ph + Math.PI / 2)) * 0.6 : 0;
    const foot = swing(knee, o.len * 0.5, a * 0.3 - (x > 0 ? lift : -lift));
    b.limb(hip, knee, o.r, o.mat, o.r * 0.8);
    b.limb(knee, foot, o.r * 0.75, o.mat, o.r * 0.65);
    b.sphere([o.r * 1.05, o.r * 0.6, o.r * 0.95], [foot[0] + o.r * 0.3, Math.max(o.r * 0.5, foot[1]), foot[2]], o.paw);
  }
  return bob;
}
