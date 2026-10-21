// Walking on planted feet, for any model's legs. A foot on the ground stays where it was put while the body goes over
// it (the baker measures how far a walk's planted feet slide back a loop, and the game plays the walk by distance
// walked, so they hold still on the ground), then lifts and swings forward to plant again. A leg's middle joint
// falls where its hip and foot put it.
import type { Vec3 } from './types';

/**
 * Where a walking foot is at `phase` (0 … 1) of its own step: for the first half it's planted, sliding back an even
 * `reach` either side of `rest` (the body going over it); for the second it lifts `lift` and swings forward again.
 * Legs that step together share a phase; the others are half a step out.
 */
export function footAt(rest: Vec3, phase: number, reach: number, lift: number): Vec3 {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.5) return [rest[0] + reach - 4 * reach * p, rest[1], rest[2]];
  const k = (p - 0.5) * 2, e = k * k * (3 - 2 * k);
  return [rest[0] - reach + 2 * reach * e, rest[1] + Math.sin(Math.PI * k) * lift, rest[2]];
}

/** The joint between `a` and `b` on bones `l1` and `l2`, bending out toward `toward` (a knee forward, an insect's up and out). */
export function jointBetween(a: Vec3, b: Vec3, l1: number, l2: number, toward: Vec3): Vec3 {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d) || 1;
  const u: Vec3 = [d[0] / len, d[1] / len, d[2] / len], dd = Math.min(l1 + l2 - 1e-3, len);
  const along = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const dot = toward[0] * u[0] + toward[1] * u[1] + toward[2] * u[2];
  let w: Vec3 = [toward[0] - dot * u[0], toward[1] - dot * u[1], toward[2] - dot * u[2]];
  const wl = Math.hypot(...w);
  w = wl > 1e-6 ? [w[0] / wl, w[1] / wl, w[2] / wl] : [0, 1, 0];
  return [a[0] + u[0] * along + w[0] * h, a[1] + u[1] * along + w[1] * h, a[2] + u[2] * along + w[2] * h];
}

/** The length from one point to another (a bone's, from its rest pose). */
export const span = (a: Vec3, b: Vec3): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
