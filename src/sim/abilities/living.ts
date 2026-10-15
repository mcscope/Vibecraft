// Living buildings (BuildingSpec.living): planted as a seedling (workers carry
// `seed` × materials to the site like any building), then the building grows by
// eating food from its own stock until it reaches its full materials. HP and
// capital come from what it has grown so far, so a young one is frail and can
// only train what its current capital supports.
import type { BuildingSpec, FactionSpec } from '../../factions/types';
import { f1, n0 } from '../../ui/format';
import { capitalFor, deriveBuilding, type BuildingStats } from '../physics';
import type { Building } from '../world';
import type { Ability } from './index';

/** kg of food it wants on hand to keep growing (haulers bring it). */
export const GROW_STASH = 40;

/** Materials a living building is planted with. */
export const seedMaterials = (spec: BuildingSpec): number => spec.materials * Math.min(1, Math.max(0.05, spec.living!.seed));

/** Stats for a living building at its current size (what workers carried to plant it stays the same). */
export function livingStats(spec: BuildingSpec, faction: FactionSpec, materials: number): BuildingStats {
  const full = deriveBuilding(spec, faction);
  return { ...deriveBuilding({ ...spec, materials }, faction), totalCost: full.totalCost };
}

/** One tick of growth: eat food from stock into materials. Returns true if its stats changed. */
export function grow(b: Building, faction: FactionSpec, dt: number): boolean {
  const spec = b.spec;
  if (!spec.living || b.grown === undefined || b.grown >= spec.materials) return false;
  const eat = Math.min(spec.living.grow * dt, spec.materials - b.grown, b.stock.food);
  if (eat <= 0) return false;
  b.stock.food -= eat;
  const before = Math.floor(b.grown / 5);
  b.grown += eat;
  if (Math.floor(b.grown / 5) === before && b.grown < spec.materials) return false; // restat every 5 kg
  const st = livingStats(spec, faction, b.grown);
  b.hp += st.maxHp - b.maxHp;
  b.maxHp = st.maxHp;
  b.stats = st;
  return true;
}

/** Food it wants on hand to keep growing. */
export const growWant = (b: Building): number =>
  b.spec.living && b.grown !== undefined && b.grown < b.spec.materials ? Math.min(GROW_STASH, b.spec.materials - b.grown) : 0;

/** Can this building, at its current size, train a unit of this refinement? */
export const grownEnough = (b: Building, refinement: number): boolean =>
  !b.spec.living || capitalFor(refinement) <= b.stats.effectiveCapital + 1e-6;

export const living: Ability = {
  id: 'living',
  validateBuilding: (b, where) => {
    const l = b.living;
    if (l === undefined) return [];
    const ok = typeof l.seed === 'number' && l.seed > 0 && l.seed <= 1 && typeof l.grow === 'number' && l.grow > 0 && l.grow <= 50;
    return ok ? [] : [`${where}: bad living`];
  },
  buildingCodex: (b) => (b.living
    ? `<b>Living.</b> Planted at ${n0(seedMaterials(b))} kg, it eats food to grow ${f1(b.living.grow, 1)} kg/s up to ${n0(b.materials)} kg: tougher, and able to train more refined units, as it grows.`
    : null),
};
