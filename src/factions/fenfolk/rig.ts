// Fenfolk rigs (their own; factions never share model code).
// Small, wiry marsh people: ~1.25 tall, reed hats, wading wraps.
// Convention: faces +x, y up, +z is its left.
import type { Mat, ModelBuilder, Pose, Vec3 } from '../../kits/bake3d/types';

const TAU = Math.PI * 2;
export const swing = (from: Vec3, len: number, a: number): Vec3 => [from[0] + Math.sin(a) * len, from[1] - Math.cos(a) * len, from[2]];

export interface FenLook {
  skin: string;
  wrap: Mat;
  scale?: number;
  bulk?: number;
  /** Conical reed hat, or a tied reed crest. */
  hat?: 'cone' | 'crest';
  mounted?: boolean;
}

/** Arm angle: a whirling sling throw, a jab, or work. */
export function fenArm(p: Pose, style: 'sling' | 'jab' | 'work'): number {
  const t = p.phase;
  if (p.anim === 'attack') {
    if (style === 'sling') return t < 0.6 ? 3.0 + Math.sin(t * TAU * 2.4) * 0.5 : 3.0 - ((t - 0.6) / 0.4) * 1.8;
    return t < 0.4 ? 1.2 - t * 1.5 : t < 0.6 ? 0.6 + ((t - 0.4) / 0.2) * 1.2 : 1.8 - ((t - 0.6) / 0.4) * 0.6;
  }
  if (p.anim === 'gather') return 0.6 + Math.abs(Math.sin(t * Math.PI)) * 1.4;
  if (p.anim === 'eat') return 2.2 + Math.sin(t * TAU) * 0.15;
  if (p.anim === 'walk') return Math.sin(t * TAU) * 0.55;
  return 0.1 + Math.sin(t * TAU) * 0.04;
}

const REED: Mat = { color: '#b8a466', tex: 'thatch' };
const TEAM: Mat = { team: 'primary', tex: 'cloth' };

export function fenling(
  b: ModelBuilder, p: Pose, look: FenLook, arm: number,
  held?: (h: ModelBuilder) => void, offhand?: (h: ModelBuilder) => void,
): void {
  b.joint([0, 0, 0], [0, 0, 0], (m) => {
    const walking = p.anim === 'walk' && !look.mounted;
    const t = p.phase * TAU;
    const bob = walking ? Math.abs(Math.sin(t)) * 0.025 : 0;
    const skin: Mat = { color: look.skin, tex: 'skin' };
    const bulk = look.bulk ?? 1;
    for (const side of [1, -1]) {
      const z = 0.08 * side * bulk;
      if (look.mounted) {
        m.limb([0, 0.6, z], [0.14, 0.42, z * 3], 0.05, skin);
        m.limb([0.14, 0.42, z * 3], [0.1, 0.2, z * 3.2], 0.04, skin);
        continue;
      }
      const a = walking ? Math.sin(t + (side > 0 ? 0 : Math.PI)) * 0.55 : 0;
      const hip: Vec3 = [0, 0.6 + bob, z];
      const knee = swing(hip, 0.3, a);
      const foot = swing(knee, 0.3, a * 0.4 - (walking ? Math.max(0, Math.sin(t + (side > 0 ? 0 : Math.PI) + 1.5)) * 0.5 : 0));
      m.limb(hip, knee, 0.05, look.wrap, 0.045);
      m.limb(knee, foot, 0.045, skin, 0.035); // bare shins: they wade
      m.sphere([0.08, 0.035, 0.05], [foot[0] + 0.03, Math.max(0.03, foot[1]), foot[2]], skin);
    }
    m.joint([0, bob, 0], [0, 0, p.anim === 'tired' ? -0.3 : 0], (u) => {
      u.cylinder(0.14 * bulk, 0.18 * bulk, 0.26, [0, 0.52, 0], look.wrap, undefined, 12); // wading skirt
      u.cylinder(0.15 * bulk, 0.14 * bulk, 0.34, [0, 0.8, 0], look.wrap, undefined, 12);
      u.box([0.04, 0.34, 0.3 * bulk], [0.0, 0.8, 0], TEAM, [0, 0, 0.15]); // team sash
      const hy = 1.07;
      u.sphere([0.1, 0.11, 0.1], [0.02, hy, 0], skin);
      u.sphere([0.025, 0.035, 0.025], [0.11, hy - 0.01, 0], skin);
      for (const z of [1, -1]) u.sphere([0.02, 0.05, 0.03], [0, hy + 0.01, 0.1 * z], skin); // big ears
      if (look.hat === 'crest') for (let i = 0; i < 5; i++) u.limb([0, hy + 0.08, 0], [-0.05 - i * 0.03, hy + 0.3 - i * 0.02, (i - 2) * 0.04], 0.012, REED);
      else u.cone(0.2, 0.17, [0, hy + 0.13, 0], REED, undefined, 12);
      const sr: Vec3 = [0, 0.95, 0.17 * bulk], sl: Vec3 = [0, 0.95, -0.17 * bulk];
      const elbowR = swing(sr, 0.22, arm), handR = swing(elbowR, 0.2, arm + 0.25);
      const la = walking ? -Math.sin(t) * 0.5 : 0.3;
      const elbowL = swing(sl, 0.22, la), handL = swing(elbowL, 0.2, la + 0.3);
      u.limb(sr, elbowR, 0.04, skin, 0.035); u.limb(elbowR, handR, 0.035, skin, 0.03);
      u.limb(sl, elbowL, 0.04, skin, 0.035); u.limb(elbowL, handL, 0.035, skin, 0.03);
      if (held) u.joint(handR, [0, 0, arm + 0.25], held);
      if (offhand) u.joint(handL, [0, 0, la + 0.3], offhand);
    });
  }, look.scale ?? 1);
}

/** Load on the back, by cargo: a reed bundle, a root basket, a crystal. */
export function fenLoad(b: ModelBuilder, p: Pose): void {
  if (p.cargo === 'wood') for (let i = 0; i < 4; i++) b.limb([-0.2, 0.75 + i * 0.05, -0.2], [-0.2, 0.95 + i * 0.05, 0.2], 0.03, REED);
  else if (p.cargo === 'food') b.cylinder(0.12, 0.09, 0.18, [-0.2, 0.85, 0], { color: '#7a5a34', tex: 'thatch' }, undefined, 10);
  else if (p.cargo === 'crystal') b.crystal(0.22, [-0.2, 0.9, 0], [0.3, 0, 0.4]);
}
