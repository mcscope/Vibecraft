// Shared animal rig helpers for wildlife models (any homeworld may use them).
import type { WildSpec } from '../factions/types';
import type { Mat, ModelBuilder, Pose, UnitModel, Vec3 } from './bake3d/types';

/** A wild animal's design plus its 3D model. */
export type WildModel = WildSpec & { model: UnitModel };

export const TAU = Math.PI * 2;
export const swing = (from: Vec3, len: number, a: number): Vec3 => [from[0] + Math.sin(a) * len, from[1] - Math.cos(a) * len, from[2]];

/** Four legs that walk (diagonal pairs in step); returns the body's bob. */
export function legs(b: ModelBuilder, p: Pose, o: { fx: number; bx: number; z: number; hip: number; len: number; r: number; mat: Mat; hoof: Mat }): number {
  const walking = p.anim === 'walk';
  const t = p.phase * TAU;
  const bob = walking ? Math.abs(Math.sin(t)) * 0.05 * o.len : 0;
  for (const [x, z, ph] of [[o.fx, o.z, 0], [o.fx, -o.z, Math.PI], [o.bx, o.z, Math.PI], [o.bx, -o.z, 0]] as Array<[number, number, number]>) {
    const a = walking ? Math.sin(t + ph) * 0.5 : 0;
    const hip: Vec3 = [x, o.hip + bob, z];
    const knee = swing(hip, o.len * 0.5, a);
    const lift = walking ? Math.max(0, Math.sin(t + ph + Math.PI / 2)) * 0.6 : 0;
    const foot = swing(knee, o.len * 0.5, a * 0.3 - (x > 0 ? lift : -lift));
    b.limb(hip, knee, o.r, o.mat, o.r * 0.75);
    b.limb(knee, foot, o.r * 0.7, o.mat, o.r * 0.55);
    b.sphere([o.r * 0.8, o.r * 0.55, o.r * 0.75], [foot[0], Math.max(o.r * 0.4, foot[1]), foot[2]], o.hoof);
  }
  return bob;
}

/** Head dips while grazing ('gather'/'eat'/'idle' breathe), lunges on 'attack'. */
export const headPose = (p: Pose): number => (p.anim === 'eat' || p.anim === 'gather' ? -0.9 : p.anim === 'idle' ? Math.sin(p.phase * TAU) * 0.08 : 0);
export const lunge = (p: Pose): number => (p.anim === 'attack' ? Math.sin(Math.min(1, p.phase * 1.4) * Math.PI) * 0.25 : 0);
