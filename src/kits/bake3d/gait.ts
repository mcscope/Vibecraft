// Walking on planted feet, for any model's legs. A foot on the ground stays where it was put while the body goes over
// it (the baker measures how far a walk's planted feet slide back a loop, and the game plays the walk by distance
// walked, so they hold still on the ground), then lifts and swings forward to plant again. A leg's middle joint
// falls where its hip and foot put it.
import type { Mat, ModelBuilder, Vec3 } from './types';

/**
 * Where a walking foot is at `phase` (0 … 1) of its own step: for the first `duty` of it (half, walking) it's planted,
 * sliding back an even `reach` either side of `rest` (the body going over it); for the rest it lifts `lift` and swings
 * forward again. Legs that step together share a phase; the others are out of step. A run or a gallop has a short duty
 * (each foot down briefly, all of them off the ground for a moment).
 */
export function footAt(rest: Vec3, phase: number, reach: number, lift: number, duty = 0.5): Vec3 {
  const p = ((phase % 1) + 1) % 1;
  if (p < duty) return [rest[0] + reach - (2 * reach * p) / duty, rest[1], rest[2]];
  const k = (p - duty) / (1 - duty), e = k * k * (3 - 2 * k);
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

/**
 * The joint rotation (as ModelBuilder.joint takes it) that points a part's +x along `x` with its +z leaning toward
 * `zToward` (a wing bone along its spar, its membrane trailing toward the tail, however the body is turned).
 */
export function aim(x: Vec3, zToward: Vec3): Vec3 {
  const xl = Math.hypot(...x) || 1, X: Vec3 = [x[0] / xl, x[1] / xl, x[2] / xl];
  const dot = zToward[0] * X[0] + zToward[1] * X[1] + zToward[2] * X[2];
  let Z: Vec3 = [zToward[0] - dot * X[0], zToward[1] - dot * X[1], zToward[2] - dot * X[2]];
  const zl = Math.hypot(...Z);
  Z = zl > 1e-6 ? [Z[0] / zl, Z[1] / zl, Z[2] / zl] : Math.abs(X[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const Y: Vec3 = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
  // (the rotation's matrix has X, Y, Z for columns; read back as x-y-z Euler angles, as three.js does)
  const m13 = Math.max(-1, Math.min(1, Z[0]));
  const ry = Math.asin(m13);
  return Math.abs(m13) < 0.9999999 ? [Math.atan2(-Z[1], Z[2]), ry, Math.atan2(-Y[0], X[0])] : [Math.atan2(Y[2], Y[1]), ry, 0];
}

/**
 * A shaped bone from `a` to `b` (not a plain tube): lofted through `profile`, its girth at even steps along it (× `r`),
 * so it can swell where muscle sits and taper away; `flat` squashes it (wider than deep, 0 … 0.8), `keel` gives it a
 * ridge underneath, and `up` is the way its top faces.
 */
export function shapedLimb(c: ModelBuilder, a: Vec3, b: Vec3, r: number, profile: number[], mat: Mat, o: { flat?: number; keel?: number; up?: Vec3 } = {}): void {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d);
  if (len < 1e-4) return;
  const up = o.up ?? [0, 1, 0];
  // (aim's z leans toward `up`: the section's z is its height, so swap for a frame whose y is up)
  c.joint(a, aim(d, up), (j) => j.joint([0, 0, 0], [Math.PI / 2, 0, 0], (s) => {
    const n = profile.length - 1, f = o.flat ?? 0;
    s.loft(profile.map((g, i) => ({ at: [(i / n) * len, 0, 0] as Vec3, w: r * g * (1 + f * 0.5), up: r * g * (1 - f * 0.5), down: r * g * (1 - f * 0.5), keel: o.keel })), mat);
  }));
}

/** The length from one point to another (a bone's, from its rest pose). */
export const span = (a: Vec3, b: Vec3): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
