// Bounding gait (UnitSpec.gait): a hopper moves only for the airborne share of
// each stride, faster while in the air, so its average speed is unchanged. The
// walk animation is played by stride (render/renderer.ts unitFrame).
import type { UnitSpec } from '../../factions/types';
import { f1 } from '../../ui/format';
import type { Unit } from '../world';
import type { Ability } from './index';

/** Derived gait: hop share clamped to 0.3–0.95, period to 0.3–3 s (default 1). */
export function deriveGait(spec: UnitSpec): { hop: number; period: number } | undefined {
  return spec.gait && { hop: Math.min(0.95, Math.max(0.3, spec.gait.hop)), period: Math.min(3, Math.max(0.3, spec.gait.period ?? 1)) };
}

/**
 * Advance a hopper's stride for a tick of movement and return the factor its
 * movement budget is scaled by: 0 while crouched, 1/hop in the air. 1 for a steady walk.
 */
export function strideFactor(u: Unit, tick: number, dt: number): number {
  const g = u.stats.gait;
  if (!g) return 1;
  if (u.strideTick !== tick - 1) u.stride = 0; // set off from a crouch
  u.strideTick = tick;
  u.stride = (u.stride + dt / g.period) % 1;
  const up = (1 - g.hop) * (2 / 3);
  const grounded = u.stride < up || u.stride >= up + g.hop;
  return grounded ? 0 : 1 / g.hop;
}

/** Seconds until a hopper in the air comes down (0 on the ground, or for a steady walker). */
export function boundLeft(u: Unit): number {
  const g = u.stats.gait;
  if (!g || u.strideMul <= 0) return 0;
  const up = (1 - g.hop) * (2 / 3);
  return Math.max(0, (up + g.hop - u.stride) * g.period);
}

/** Seconds until a hopper on the ground springs off again (0 in the air, or for a steady walker). */
export function takeoffIn(u: Unit): number {
  const g = u.stats.gait;
  if (!g || u.strideMul > 0) return 0;
  const up = (1 - g.hop) * (2 / 3);
  return (u.stride < up ? up - u.stride : 1 - u.stride + up) * g.period;
}

/** A hopper crouching between bounds is still on its way (shows its walk). */
export const midStride = (u: Unit, tick: number): boolean => u.strideTick === tick;

export const gait: Ability = {
  id: 'gait',
  validateUnit: (u, where) => (u.gait !== undefined && (!Number.isFinite(u.gait.hop) || (u.gait.period !== undefined && !Number.isFinite(u.gait.period))) ? [`${where}: bad gait`] : []),
  unitCodex: (u, d) => (u.gait && d.gait ? `<b>Hops.</b> Bounds along, airborne ${Math.round(d.gait.hop * 100)}% of each ${f1(d.gait.period, 2)} s stride: still while crouched, faster in the air, the same speed on average.` : null),
};
