// Metamorphosis: `becomes: [unit ids]` on a unit spec. The unit changes, where it stands, into one of those forms of
// its own side: a tadpole into a frog, a squire into a knight. It's a trade, not a training: the old body goes into
// the new one, so it pays only the difference.
//  • Food: the new form's price less the old one's (each at its own refinement), eaten as it changes: from its own
//    pack, a friendly food bearer in reach, or a building of its side it stands beside. With nothing to eat it waits.
//  • Time: METAMORPH_SEC × the new form's refinement, plus growing the extra body at training's rate (K.trainSecPerKg
//    per kg gained). A refined form takes longer to grow into, and no building's capital is needed: time pays for
//    the refinement.
//  • A form can be at most 1.0 more refined than the one it grows from (so refinement climbs a step at a time).
//  • While it changes it stands still and can't fight; killed, the change is lost with it.
// Spawning: `spawns: [unit ids]`. The same, except the parent stays: it grows a new unit of its side beside it, so it
// pays the new unit's whole price, over the same METAMORPH_SEC × its refinement plus growing its whole body. A parent can't spawn anything more
// refined than itself (refinement climbs only by changing).
import type { UnitSpec } from '../../factions/types';
import { K, type DerivedStats } from '../physics';
import type { Unit, World } from '../world';
import type { Ability } from './index';

/** Seconds per point of the new form's refinement. */
export const METAMORPH_SEC = 6;
/** The most refinement one change can add. */
export const METAMORPH_MAX_STEP = 1;

/** What changing `from` into `to` (or, `spawn`, growing a `to` beside it) costs: food, and seconds. */
export function metamorphCost(from: DerivedStats, to: DerivedStats, spawn = false): { food: number; sec: number } {
  const grow = spawn ? to.mass : Math.max(0, to.mass - from.mass); // kg of body to grow
  return { food: spawn ? to.foodCost : Math.max(0, to.foodCost - from.foodCost), sec: METAMORPH_SEC * to.refinement + K.trainSecPerKg * grow };
}

/** Can this unit change into `into` (or, `spawn`, grow one)? */
export function canBecome(w: World, u: Unit, into: string, spawn = false): boolean {
  const spec = w.specOf(u.owner, u.specId)?.spec;
  return !!(spawn ? spec?.spawns : spec?.becomes)?.includes(into) && !!w.specOf(u.owner, into);
}

/**
 * Order kind 'metamorph': stand and change. Time runs while the food it's eaten keeps up with it (`fed` kg of the
 * cost so far, `t` seconds). Done, the unit is replaced by its new form: same place, heading, pack, and share of
 * health and calories. Returns whether it moved (never).
 */
export function runMetamorph(w: World, u: Unit, o: { into: string; fed: number; t: number; spawn?: boolean }, dt: number): boolean {
  const from = w.specOf(u.owner, u.specId), to = w.specOf(u.owner, o.into);
  if (!from || !to) { w.finish(u); return false; }
  const cost = metamorphCost(from.stats, to.stats, o.spawn);
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
      if (b.complete && Math.hypot(ex, ey) <= u.stats.radius + 1.5) b.stock.food -= take(b.stock.food); // (beside it: within a tile and a half)
    }
  }
  if (o.fed + 1e-6 >= due) o.t += dt; // fed: the change goes on (else it waits for food)
  if (o.t < cost.sec || o.fed + 1e-6 < cost.food) return false;
  if (o.spawn) {
    // done: the young one steps out beside its parent, which carries on
    const spot = w.grid.nearestOpen(u.x + Math.cos(u.facing) * (u.stats.radius + 0.6), u.y + Math.sin(u.facing) * (u.stats.radius + 0.6), 3) ?? [u.x, u.y];
    const n = w.spawnAt(u.owner, o.into, spot[0], spot[1], u.heading);
    w.finish(u);
    if (n) w.events.push({ type: 'trained', id: n.id, owner: u.owner });
    return false;
  }
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
    const errs: string[] = [];
    if (u.becomes !== undefined && (!Array.isArray(u.becomes) || u.becomes.some((id) => typeof id !== 'string' || id === u.id))) errs.push(`${where}: becomes must list other unit ids`);
    if (u.spawns !== undefined && (!Array.isArray(u.spawns) || u.spawns.some((id) => typeof id !== 'string'))) errs.push(`${where}: spawns must list unit ids`);
    return errs;
  },
  unitCodex(u: UnitSpec): string | null {
    const lines: string[] = [];
    if (u.becomes?.length) lines.push(`Metamorphosis: changes where it stands into ${u.becomes.join(' or ')}, paying only the difference in food (eaten as it changes, from its pack, a food bearer or a building beside it) over ${METAMORPH_SEC} s × the new form's refinement, plus the time to grow any extra body.`);
    if (u.spawns?.length) lines.push(`Spawns: grows a ${u.spawns.join(' or ')} beside it, paying its whole price in food (eaten the same way) over ${METAMORPH_SEC} s × its refinement plus the time to grow its body.`);
    return lines.length ? `${lines.join(' ')} It can't move or fight meanwhile.` : null;
  },
};

/** The faction-level check: each form it becomes is one of its own units at most a step more refined; each it spawns, no more refined than itself. */
export function validateMetamorphForms(units: UnitSpec[], refinement: (u: UnitSpec) => number): string[] {
  const errs: string[] = [];
  for (const u of units) {
    for (const [verb, ids, step] of [['becomes', u.becomes, METAMORPH_MAX_STEP], ['spawns', u.spawns, 0]] as const) for (const id of ids ?? []) {
      const to = units.find((x) => x.id === id);
      if (!to) { errs.push(`${u.id}: ${verb} "${id}", which isn't one of this faction's units`); continue; }
      if (refinement(to) > refinement(u) + step + 1e-9) errs.push(`${u.id}: ${verb} ${id}, more than ${step} refinement up (${refinement(u)} → ${refinement(to)})`);
    }
  }
  return errs;
}
