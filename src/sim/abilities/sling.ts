// Sling: `attack.sling` (throwers only, metres of cord, 0 up to the body's height). A lever: the
// stone leaves faster in proportion to arm + cord, up to what the muscle's energy allows, and each
// throw is spun up first (sim/physics.ts). Faster stones fly further (range ∝ v²) and hit harder.
import type { UnitSpec } from '../../factions/types';
import { bodyHeight, type DerivedStats } from '../physics';
import type { Ability } from './index';

export const sling: Ability = {
  id: 'sling',
  validateUnit(u: UnitSpec, where: string): string[] {
    const s = u.attack?.sling;
    if (s === undefined) return [];
    const max = bodyHeight(u.mass);
    if (!(typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= max + 1e-9)) return [`${where}: attack.sling must be 0–${max.toFixed(2)} metres (no longer than its body is tall)`];
    if (u.attack?.style !== 'throw') return [`${where}: only throwers use a sling`];
    return [];
  },
  unitCodex(u: UnitSpec, d: DerivedStats): string | null {
    const s = u.attack?.sling;
    if (!s || u.attack?.style !== 'throw') return null;
    return `Sling: a ${s} m cord whirls the stone out at ${d.crystalVelocity.toFixed(1)} m/s, ${d.range.toFixed(1)} tiles away, spun up before each throw.`;
  },
};
