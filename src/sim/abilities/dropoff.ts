// Mobile drop-off (UnitSpec.dropOff): gatherers unload into this unit like into a
// building, whichever is nearer, up to its cargo capacity. It carries the haul home
// itself: right-click a building (or resupply) and it unloads there.
import type { UnitSpec } from '../../factions/types';
import { n0 } from '../../ui/format';
import type { DerivedStats } from '../physics';
import type { Unit, World } from '../world';
import type { Ability } from './index';

export const isDropOff = (w: World, u: Unit): boolean => !!w.specOf(u.owner, u.specId)?.spec.dropOff;

/** The nearest friendly drop-off unit with room for at least 1 kg, if it's nearer than `than` (squared distance). */
export function nearestDropOff(w: World, u: Unit, than: number): Unit | null {
  let best: Unit | null = null, bestD = than;
  for (const c of w.units.values()) {
    if (c === u || c.owner !== u.owner || w.freeCapacity(c) < 1 || !isDropOff(w, c)) continue;
    const d = (c.x - u.x) ** 2 + (c.y - u.y) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

export const dropOff: Ability = {
  id: 'dropOff',
  validateUnit: (u: UnitSpec, where: string) => (u.dropOff !== undefined && typeof u.dropOff !== 'boolean' ? [`${where}: bad dropOff`] : []),
  unitCodex: (u: UnitSpec, d: DerivedStats) => (u.dropOff
    ? `<b>Walking drop-off.</b> Gatherers unload into it like a building, up to ${n0(d.cargoCapacity)} kg; right-click a building to unload it there.`
    : null),
};
