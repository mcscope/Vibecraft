// Reusable rigs for building unit models out of primitives.
// Convention: unit faces +x, +y up, +z is its left. A person is ~1.7 tall.
import { footAt, jointBetween, shapedLimb } from '../../kits/bake3d/gait';
import type { Mat, ModelBuilder, Pose, Vec3 } from '../../kits/bake3d/types';

const TAU = Math.PI * 2;

/** Rotate a "hanging" vector of length `len` forward by angle a (0 = straight down, π/2 = forward, π = up). */
export function swing(from: Vec3, len: number, a: number): Vec3 {
  return [from[0] + Math.sin(a) * len, from[1] - Math.cos(a) * len, from[2]];
}

/** Where a knee goes between a hip and an ankle (thigh `l1`, shin `l2`), bending forward. */
export function kneeBetween(hip: Vec3, ankle: Vec3, l1: number, l2: number): Vec3 {
  const dx = ankle[0] - hip[0], dy = ankle[1] - hip[1], len = Math.hypot(dx, dy) || 1;
  const d = Math.min(l1 + l2 - 1e-3, len), ux = dx / len, uy = dy / len;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return [hip[0] + ux * a - uy * h, hip[1] + uy * a + ux * h, hip[2]];
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
  /** Metal shoulder pads (armoured units). */
  pads?: boolean;
  beard?: boolean;
  /** 'lunge': set low behind a braced weapon: feet wide, front knee bent, back leg straight, hips dropped, leaning in. */
  stance?: 'lunge';
  /** Metres it steps in as it strikes (front foot forward, the back one planted), so the blow reaches as far as the sim's
   *  reach for it (measured: ?mode=artcheck). */
  step?: number;
}

/** Hip drop (model units) and forward lean (radians) of a lunge. */
const LUNGE = { drop: 0.16, lean: 0.3 };

/** How far the upper body leans forward from the hips (radians) in this pose: weapons that hold their own aim undo it. */
export function torsoLean(p: Pose, look: HumanLook): number {
  if (look.stance === 'lunge' && !look.mounted) return LUNGE.lean;
  const walking = p.anim === 'walk' && !look.mounted;
  return p.anim === 'tired' ? 0.45 : p.anim === 'gather' ? 0.35 + Math.sin(p.phase * Math.PI) * 0.1 : p.anim === 'attack' ? 0.12 : walking ? 0.06 : 0;
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
  const lunge = look.stance === 'lunge' && !look.mounted;
  const walking = p.anim === 'walk' && !look.mounted && !lunge;
  const bob = lunge ? -LUNGE.drop : walking ? -0.12 + Math.abs(Math.sin(t * TAU)) * 0.035 : // (walking, knees a touch bent: highest over a planted foot)
    p.anim === 'idle' ? Math.sin(t * TAU) * 0.008 : 0;
  const lean = torsoLean(p, look);
  const skin: Mat = { color: look.skin, tex: 'skin', rough: 0.7 };
  const hipY = 0.9;
  // (striking, it steps in: in with the chop, back after; its back foot stays where it was)
  const sp = p.anim === 'attack' && look.step ? p.phase : -1;
  const st = sp < 0 ? 0 : ((look.step ?? 0) / s) * (sp < 0.25 ? 0 : sp < 0.55 ? (sp - 0.25) / 0.3 : sp < 0.7 ? 1 : 1 - (sp - 0.7) / 0.3);

  b.joint([st, 0, 0], [0, 0, 0], (b) => {
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
        b.cylinder(0.068, 0.068, 0.05, [knee[0] + (ankle[0] - knee[0]) * 0.3, knee[1] + (ankle[1] - knee[1]) * 0.3, knee[2] + (ankle[2] - knee[2]) * 0.3], look.boots, undefined, 10);
        continue;
      }
      let knee: Vec3, ankle: Vec3;
      if (walking) {
        // walking, a foot is planted: on the ground it slides back under the body at an even pace (as the body goes
        // over it), then lifts and swings forward to plant again; the knee falls where hip and foot put it
        const ph = (t + (side > 0 ? 0 : 0.5)) % 1, S = 0.42; // (long steps: it covers ground by its stride, not by scurrying)
        const k = ph < 0.5 ? ph / 0.5 : (ph - 0.5) / 0.5, e = k * k * (3 - 2 * k);
        ankle = ph < 0.5 ? [S - 2 * S * k, 0.055, z] : [-S + 2 * S * e, 0.055 + Math.sin(Math.PI * k) * 0.12, z];
        knee = kneeBetween(hip, ankle, 0.44, 0.42);
      } else if (st > 0) {
        // stepping in: the front foot forward with the body, the back one left where it stood
        ankle = side > 0 ? [0.3 * st, 0.055, z] : [-st, 0.055, z];
        knee = kneeBetween(hip, ankle, 0.44, 0.42);
      } else {
        // a lunge: the near (left) leg forward with its knee bent over the foot, the other straight out behind
        const a = lunge ? (side > 0 ? 0.7 : -0.55) : 0;
        knee = swing(hip, 0.44, a);
        ankle = swing(knee, 0.42, a - (lunge && side > 0 ? 0.9 : 0));
      }
      // shaped, not pipes: a thigh full at the top tapering to the knee, a calf swelling below it
      shapedLimb(b, hip, knee, 0.075 * bulk, [1, 1.1, 1.02, 0.9, 0.8], look.trousers);
      b.sphere(0.062 * bulk, knee, look.trousers);
      shapedLimb(b, knee, ankle, 0.06, [0.95, 1.12, 1.0, 0.8, 0.78], look.boots);
      b.sphere(0.048, ankle, look.boots);
      // boot top cuff and laces
      const cuff: Vec3 = [knee[0] + (ankle[0] - knee[0]) * 0.35, knee[1] + (ankle[1] - knee[1]) * 0.35, knee[2] + (ankle[2] - knee[2]) * 0.35];
      b.cylinder(0.066, 0.07, 0.05, cuff, look.boots, undefined, 10);
      b.box([0.012, 0.012, 0.05], [cuff[0] + 0.06, cuff[1] - 0.08, cuff[2]], { color: '#2a1d14' });
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
      u.box([0.02, 0.05, 0.06], [tw * 1.0, 0.08, 0], { color: '#b89a4a', tex: 'metal' }); // buckle
      u.sphere([0.05, 0.06, 0.035], [0.02, 0.0, tw * 1.05], { color: '#5a3f28', tex: 'leather' }); // belt pouch
      u.box([0.012, 0.035, 0.03], [0.06, 0.04, tw * 1.08], { color: '#b89a4a', tex: 'metal' });
      u.cylinder(0.075, 0.09, 0.05, [0, 0.58, 0], { color: '#3a2a1c', tex: 'cloth' }); // collar
      if (look.tabard) {
        u.box([0.05, 0.5, tw * 1.25], [0.15 * bulk, 0.22, 0], { team: 'primary', tex: 'cloth' });
        // trim stripes and a sewn emblem
        u.box([0.052, 0.5, 0.025], [0.152 * bulk, 0.22, tw * 0.6], { team: 'secondary', tex: 'cloth' });
        u.box([0.052, 0.5, 0.025], [0.152 * bulk, 0.22, -tw * 0.6], { team: 'secondary', tex: 'cloth' });
        u.box([0.054, 0.1, 0.1], [0.153 * bulk, 0.3, 0], { team: 'secondary', tex: 'cloth' }, [Math.PI / 4, 0, 0]);
        u.sphere([0.13 * bulk, 0.08, 0.26 * bulk], [0, 0.55, 0], { team: 'primary', tex: 'cloth' });
      }
      // neck + head
      const headY = 0.72;
      u.cylinder(0.05, 0.06, 0.1, [0, 0.62, 0], skin);
      u.sphere([0.115, 0.13, 0.11], [0.01, headY, 0], skin);
      u.sphere(0.025, [0.115, headY - 0.01, 0], skin); // nose
      u.sphere(0.012, [0.1, headY + 0.03, 0.04], { color: '#1a1410' }); // eyes
      u.sphere(0.012, [0.1, headY + 0.03, -0.04], { color: '#1a1410' });
      if (look.beard) u.sphere([0.06, 0.07, 0.085], [0.07, headY - 0.07, 0], { color: look.hair, tex: 'hair' });
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
        shapedLimb(u, shoulder, elbow, 0.058 * bulk, [1.05, 1.1, 0.98, 0.88], look.tunic); // (an upper arm full at the shoulder)
        u.sphere(0.06 * bulk, shoulder, look.tunic);
        u.sphere(0.047 * bulk, elbow, look.tunic);
        shapedLimb(u, elbow, wrist, 0.048, [0.95, 1.08, 0.9, 0.78], skin); // (a forearm swelling below the elbow)
        u.sphere(0.04, wrist, skin);
        u.sphere([0.052, 0.03, 0.052], [wrist[0] + (elbow[0] - wrist[0]) * 0.2, wrist[1] + (elbow[1] - wrist[1]) * 0.2, wrist[2]], { color: '#4a3424', tex: 'leather' }); // bracer
        if (look.pads) u.sphere([0.11 * bulk, 0.07, 0.1 * bulk], [shoulder[0], shoulder[1] + 0.03, shoulder[2]], { color: '#8d939a', tex: 'metal' });
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

/** A gallop's rise and fall: low gathering over the planted feet, up in the moment all four are off the ground. */
const galBob = (phase: number, len: number): number => -0.1 * len + Math.max(0, Math.sin((phase - 0.15) * Math.PI * 2)) * 0.08 * len;

/** Four-legged gait (a gallop when charging). Returns the body bob. Legs at (±fx, *, ±z). */
export function quadLegs(b: ModelBuilder, p: Pose, o: { fx: number; bx: number; z: number; hip: number; len: number; r: number; mat: Mat; paw: Mat }): number {
  const walking = p.anim === 'walk';
  const t = p.phase * TAU;
  // (walking, on planted feet: diagonal pairs step together, a foot holding where it stands as the body goes over it;
  // the legs a touch bent, the body highest over its planted feet)
  const bob = walking ? -0.1 * o.len + Math.abs(Math.cos(t * 2)) * 0.03 * o.len : 0;
  const legs: Array<[number, number, number]> = [
    [o.fx, o.z, 0], [o.fx, -o.z, 0.5], [o.bx, o.z, 0.5], [o.bx, -o.z, 0],
  ];
  // galloping (a charge): hind feet strike, then the forefeet, each down only briefly, all four off the ground between
  const gallop = walking && p.style === 'charge';
  const order: Record<string, number> = { '1,1': 0.5, '1,-1': 0.6, '-1,1': 0, '-1,-1': 0.1 };
  for (const [x, z, ph] of legs) {
    const hip: Vec3 = [x, o.hip + (gallop ? galBob(p.phase, o.len) : bob), z];
    const rest: Vec3 = [x + (p.anim === 'tired' ? 0.04 * o.len : 0), Math.min(o.r * 0.5, o.hip - o.len * 0.98), z];
    const foot = gallop ? footAt(rest, p.phase + order[`${Math.sign(x)},${Math.sign(z)}`], 0.45 * o.len, 0.25 * o.len, 0.32)
      : walking ? footAt(rest, p.phase + ph, 0.42 * o.len, 0.16 * o.len) : rest; // (long strides: a runner covers ground by reach, not by scurrying)
    const knee = jointBetween(hip, foot, o.len * 0.5, o.len * 0.5, [x > 0 ? 1 : -1, 0, 0]); // (a foreleg's knee forward, a hind leg's hock back)
    // a heavy, muscled upper leg tapering to a lean lower one (a horse's forearm over its cannon)
    shapedLimb(b, hip, knee, o.r, [1.15, 1.3, 1.1, 0.85, 0.72], o.mat);
    b.sphere(o.r * 1.05, hip, o.mat);
    b.sphere(o.r * 0.72, knee, o.mat);
    shapedLimb(b, knee, foot, o.r * 0.75, [0.95, 0.78, 0.72, 0.75, 0.82], o.mat);
    b.sphere([o.r * 1.05, o.r * 0.6, o.r * 0.95], [foot[0] + o.r * 0.3, Math.max(o.r * 0.5, foot[1]), foot[2]], o.paw);
  }
  return bob;
}
