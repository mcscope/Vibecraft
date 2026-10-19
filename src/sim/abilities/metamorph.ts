// Metamorphosis: `becomes: [unit ids]` on a unit spec. The unit changes, where it stands, into one of those forms of
// its own side: a tadpole into a frog, a squire into a knight. It's a trade, not a training: the old body goes into
// the new one, so it pays only the difference.
//  • Food: the new form's price less the old one's (each at its own refinement), eaten as it changes: from its own
//    pack, a friendly food bearer in reach, or a building of its side it stands beside. With nothing to eat it waits.
//  • Time: METAMORPH_SEC × the new form's refinement. A refined form takes longer to grow into, and no building's
//    capital is needed: time pays for the refinement.
//  • A form can be at most 1.0 more refined than the one it grows from (so refinement climbs a step at a time).
//  • While it changes it stands still and can't fight; killed, the change is lost with it.
import type { UnitSpec } from '../../factions/types';
import type { DerivedStats } from '../physics';
import type { Unit, World } from '../world';
import type { Ability } from './index';

/** Seconds per point of the new form's refinement. */
export const METAMORPH_SEC = 6;
/** The most refinement one change can add. */
export const METAMORPH_MAX_STEP = 1;

/** What changing `from` into `to` costs: food, and seconds. */
export function metamorphCost(from: DerivedStats, to: DerivedStats): { food: number; sec: number } {
  return { food: Math.max(0, to.foodCost - from.foodCost), sec: METAMORPH_SEC * to.refinement };
}

/** Can this unit change into `into`? */
export function canBecome(w: World, u: Unit, into: string): boolean {
  return !!w.specOf(u.owner, u.specId)?.spec.becomes?.includes(into) && !!w.specOf(u.owner, into);
}

/**
 * Order kind 'metamorph': stand and change. Time runs while the food it's eaten keeps up with it (`fed` kg of the
 * cost so far, `t` seconds). Done, the unit is replaced by its new form: same place, heading, pack, and share of
 * health and calories. Returns whether it moved (never).
 */
export function runMetamorph(w: World, u: Unit, o: { into: string; fed: number; t: number }, dt: number): boolean {
  const from = w.specOf(u.owner, u.specId), to = w.specOf(u.owner, o.into);
  if (!from || !to) { w.finish(u); return false; }
  const cost = metamorphCost(from.stats, to.stats);
  // eat what this stretch of the change needs (the cost spread evenly over its time)
  const due = cost.sec > 0 ? Math.min(cost.food, (cost.food * (o.t + dt)) / cost.sec) : cost.food;
  let want = due - o.fed;
  if (want > 1e-9) {
    const take = (have: number) => { const k = Math.min(have, want); want -= k; o.fed += k; return k; };
    u.food -= take(u.food);
    for (const b of w.units.values()) {
      if (want <= 1e-9) break;
      const r = b.owner === u.owner && b !== u ? w.specOf(b.owner, b.specId)?.spec.bearer : undefined;
      if (r?.resource === 'food' && Math.hypot(b.x - u.x, b.y - u.y) <= r.radius) b.food -= take(b.food);
    }
    for (const b of w.buildingsOf(u.owner)) {
      if (want <= 1e-9) break;
      const ex = Math.max(b.ox, Math.min(u.x, b.ox + b.size)) - u.x, ey = Math.max(b.oy, Math.min(u.y, b.oy + b.size)) - u.y;
      if (b.complete && Math.hypot(ex, ey) <= u.stats.radius + 1) b.stock.food -= take(b.stock.food);
    }
  }
  if (o.fed + 1e-6 >= due) o.t += dt; // fed: the change goes on (else it waits for food)
  if (o.t < cost.sec || o.fed + 1e-6 < cost.food) return false;
  // done: the new body, where the old one stood
  const hpShare = u.hp / u.stats.maxHp, calShare = u.cal / u.stats.maxCalories;
  w.units.delete(u.id);
  const n = w.spawnAt(u.owner, o.into, u.x, u.y, u.heading);
  if (!n) return false;
  n.x = n.px = u.x; n.y = n.py = u.y; n.facing = u.facing;
  n.hp = n.stats.maxHp * hpShare; n.cal = n.stats.maxCalories * calShare;
  n.food = u.food; n.wood = u.wood; n.crystal = u.crystal;
  w.events.push({ type: 'metamorph', id: u.id, into: n.id, owner: u.owner, x: n.x, y: n.y });
  return false;
}

export const metamorph: Ability = {
  id: 'metamorph',
  validateUnit(u: UnitSpec, where: string): string[] {
    if (u.becomes === undefined) return [];
    if (!Array.isArray(u.becomes) || u.becomes.some((id) => typeof id !== 'string' || id === u.id)) return [`${where}: becomes must list other unit ids`];
    return [];
  },
  unitCodex(u: UnitSpec): string | null {
    if (!u.becomes?.length) return null;
    return `Metamorphosis: changes where it stands into ${u.becomes.join(' or ')}, paying only the difference in food (eaten as it changes, from its pack, a food bearer or a building beside it) over ${METAMORPH_SEC} s × the new form's refinement. It can't move or fight meanwhile.`;
  },
};

/** The faction-level check: each form it becomes is one of its own units, at most a step more refined. */
export function validateMetamorphForms(units: UnitSpec[], refinement: (u: UnitSpec) => number): string[] {
  const errs: string[] = [];
  for (const u of units) for (const id of u.becomes ?? []) {
    const to = units.find((x) => x.id === id);
    if (!to) { errs.push(`${u.id}: becomes "${id}", which isn't one of this faction's units`); continue; }
    if (refinement(to) > refinement(u) + METAMORPH_MAX_STEP + 1e-9) errs.push(`${u.id}: becomes ${id}, more than ${METAMORPH_MAX_STEP} refinement up (${refinement(u)} → ${refinement(to)})`);
  }
  return errs;
}
