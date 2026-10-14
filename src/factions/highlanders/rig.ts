// The Highland Clans' own rigs (factions never share model code).
// Convention: faces +x, y up, +z is its left. A clansman is ~1.65 tall and broad.
import type { Mat, ModelBuilder, Pose, Vec3 } from '../../kits/bake3d/types';

const TAU = Math.PI * 2;
export const swing = (from: Vec3, len: number, a: number): Vec3 => [from[0] + Math.sin(a) * len, from[1] - Math.cos(a) * len, from[2]];

export interface ClanLook {
  skin: string;
  hair: string;
  /** Upper body. */
  coat: Mat;
  boots: Mat;
  scale?: number;
  bulk?: number;
  /** 'bonnet' (flat cap), 'helm' (iron cap), 'bare'. */
  head?: 'bonnet' | 'helm' | 'bare';
  beard?: boolean;
  /** Fur over the shoulders. */
  mantle?: boolean;
  /** Riding: legs astride, no walk cycle. */
  mounted?: boolean;
}

/** Right-arm angle for the pose: 'axe' is a two-handed overhead chop, 'javelin' a run-up throw. */
export function armFor(p: Pose, style: 'axe' | 'javelin' | 'work'): number {
  const t = p.phase;
  if (p.anim === 'attack') {
    if (style === 'javelin') return t < 0.55 ? 2.4 + t * 0.9 : 2.9 - ((t - 0.55) / 0.45) * 2.2;
    return t < 0.5 ? 0.4 + (t / 0.5) * 2.9 : t < 0.7 ? 3.3 - ((t - 0.5) / 0.2) * 2.7 : 0.6 - ((t - 0.7) / 0.3) * 0.3;
  }
  if (p.anim === 'gather') return 0.8 + Math.abs(Math.sin(t * Math.PI)) * 1.6;
  if (p.anim === 'eat') return 2.2 + Math.sin(t * TAU) * 0.15;
  if (p.anim === 'walk') return Math.sin(t * TAU) * 0.5;
  return 0.15 + Math.sin(t * TAU) * 0.03;
}

const TARTAN: Mat = { team: 'primary', tex: 'cloth' };
const TARTAN_DARK: Mat = { team: 'secondary', tex: 'cloth' };

/**
 * A clansman in a team-tartan kilt. `held` is built in the right hand's joint
 * (local -y runs down the forearm, +x forward); `offhand` in the left.
 */
export function clansman(
  b: ModelBuilder, p: Pose, look: ClanLook, arm: number,
  held?: (h: ModelBuilder) => void, offhand?: (h: ModelBuilder) => void,
): void {
  const s = look.scale ?? 1, bulk = look.bulk ?? 1;
  b.joint([0, 0, 0], [0, 0, 0], (m) => {
    const walking = p.anim === 'walk' && !look.mounted;
    const t = p.phase * TAU;
    const bob = walking ? Math.abs(Math.sin(t)) * 0.03 : 0;
    const tired = p.anim === 'tired' ? 0.25 : 0;
    const skin: Mat = { color: look.skin, tex: 'skin' };
    // legs (bare knees under the kilt, wool hose, boots)
    for (const side of [1, -1]) {
      const z = 0.11 * side * bulk;
      if (look.mounted) {
        m.limb([0, 0.82, z], [0.18, 0.55, z * 2.6], 0.075, { color: '#6a5a44', tex: 'cloth' });
        m.limb([0.18, 0.55, z * 2.6], [0.12, 0.25, z * 2.8], 0.06, look.boots);
        continue;
      }
      const a = walking ? Math.sin(t + (side > 0 ? 0 : Math.PI)) * 0.5 : 0;
      const hip: Vec3 = [0, 0.82 + bob, z];
      const knee = swing(hip, 0.4, a);
      const foot = swing(knee, 0.4, a * 0.4 - (walking ? Math.max(0, Math.sin(t + (side > 0 ? 0 : Math.PI) + 1.5)) * 0.5 : 0));
      m.limb(hip, knee, 0.075, skin, 0.06);
      m.limb(knee, foot, 0.06, { color: '#d8ccb0', tex: 'cloth' }, 0.055);
      m.sphere([0.11, 0.055, 0.07], [foot[0] + 0.04, Math.max(0.05, foot[1]), foot[2]], look.boots);
    }
    m.joint([0, bob, 0], [0, 0, -tired], (u) => {
      // kilt: pleated team tartan, with a darker belt and sporran
      u.cylinder(0.2 * bulk, 0.27 * bulk, 0.42, [0, 0.68, 0], TARTAN, undefined, 14);
      u.cylinder(0.205 * bulk, 0.205 * bulk, 0.06, [0, 0.9, 0], { color: '#3a2a1c', tex: 'leather' }, undefined, 14);
      u.sphere([0.06, 0.07, 0.04], [0.2 * bulk, 0.8, 0], { color: '#c9b48a', tex: 'fur' });
      // torso
      u.cylinder(0.22 * bulk, 0.2 * bulk, 0.5, [0, 1.15, 0], look.coat, undefined, 14);
      u.box([0.06, 0.5, 0.44 * bulk], [0.02, 1.15, 0], TARTAN_DARK, [0, 0, 0.12]); // plaid sash over the shoulder
      if (look.mantle) u.sphere([0.26 * bulk, 0.14, 0.32 * bulk], [-0.02, 1.38, 0], { color: '#7a6248', tex: 'fur' });
      // head
      const hy = 1.5;
      u.sphere([0.12, 0.13, 0.12], [0.02, hy, 0], skin);
      u.sphere([0.03, 0.03, 0.03], [0.13, hy - 0.01, 0], skin); // nose
      if (look.beard) u.sphere([0.09, 0.12, 0.11], [0.08, hy - 0.1, 0], { color: look.hair, tex: 'hair' });
      if (look.head === 'helm') {
        u.sphere([0.135, 0.09, 0.135], [0.01, hy + 0.06, 0], { color: '#5a5a5c', tex: 'metal', metal: 0.7 });
        u.box([0.03, 0.12, 0.02], [0.13, hy, 0], { color: '#5a5a5c', tex: 'metal', metal: 0.7 }); // nasal
      } else if (look.head === 'bonnet') {
        u.cylinder(0.15, 0.13, 0.05, [0, hy + 0.11, 0], TARTAN_DARK, [0, 0, -0.1], 14);
        u.sphere(0.025, [0, hy + 0.15, 0], { team: 'primary' });
      } else u.sphere([0.125, 0.07, 0.125], [0, hy + 0.07, 0], { color: look.hair, tex: 'hair' });
      // arms
      const shoulder = (side: 1 | -1): Vec3 => [0, 1.36, 0.25 * bulk * side];
      const sr = shoulder(1), sl = shoulder(-1);
      const elbowR = swing(sr, 0.3, arm), elbowL = swing(sl, 0.3, walking ? -Math.sin(t) * 0.45 : p.anim === 'attack' ? arm * 0.6 : 0.2);
      const handR = swing(elbowR, 0.27, arm + 0.25), handL = swing(elbowL, 0.27, (walking ? -Math.sin(t) * 0.45 : 0.4));
      u.limb(sr, elbowR, 0.065, look.coat, 0.055);
      u.limb(elbowR, handR, 0.05, skin, 0.045);
      u.limb(sl, elbowL, 0.065, look.coat, 0.055);
      u.limb(elbowL, handL, 0.05, skin, 0.045);
      if (held) u.joint(handR, [0, 0, arm + 0.25], held);
      if (offhand) u.joint(handL, [0, 0, 0.4], offhand);
    });
  }, s);
}

/** Four legs, diagonal pairs in step; returns the body bob. */
export function fourLegs(b: ModelBuilder, p: Pose, o: { fx: number; bx: number; z: number; hip: number; len: number; r: number; mat: Mat; hoof: Mat }): number {
  const walking = p.anim === 'walk';
  const t = p.phase * TAU;
  const bob = walking ? Math.abs(Math.sin(t)) * 0.05 * o.len : 0;
  for (const [x, z, ph] of [[o.fx, o.z, 0], [o.fx, -o.z, Math.PI], [o.bx, o.z, Math.PI], [o.bx, -o.z, 0]] as Array<[number, number, number]>) {
    const a = walking ? Math.sin(t + ph) * 0.45 : 0;
    const hip: Vec3 = [x, o.hip + bob, z];
    const knee = swing(hip, o.len * 0.5, a);
    const lift = walking ? Math.max(0, Math.sin(t + ph + Math.PI / 2)) * 0.6 : 0;
    const foot = swing(knee, o.len * 0.5, a * 0.3 - (x > 0 ? lift : -lift));
    b.limb(hip, knee, o.r, o.mat, o.r * 0.8);
    b.limb(knee, foot, o.r * 0.7, o.mat, o.r * 0.6);
    b.sphere([o.r * 0.9, o.r * 0.6, o.r * 0.85], [foot[0], Math.max(o.r * 0.45, foot[1]), foot[2]], o.hoof);
  }
  return bob;
}

/** A load on the back, by cargo. */
export function burden(b: ModelBuilder, p: Pose): void {
  if (!p.cargo) return;
  if (p.cargo === 'wood') for (let i = 0; i < 3; i++) b.limb([-0.3, 1.0 + i * 0.09, -0.25], [-0.3, 1.0 + i * 0.09, 0.25], 0.045, { color: '#6b4a2e', tex: 'wood' });
  else if (p.cargo === 'food') b.sphere([0.17, 0.2, 0.17], [-0.28, 1.1, 0], { color: '#b8a274', tex: 'cloth' });
  else b.crystal(0.3, [-0.28, 1.15, 0], [0.3, 0, 0.4]);
}
