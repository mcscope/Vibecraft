// Metamorphosis: `becomes: [unit ids]` on a unit spec. The unit changes, where it stands, into one of those forms of
// its own side: a tadpole into a frog, a squire into a knight. It's a trade, not a training: the old body goes into
// the new one, so it pays only the difference.
//  • Food: the new form's price less the old one's (each at its own refinement), drawn from its own pack, friendly
//    food bearers in reach and buildings of its side it stands beside. The spec's `growthFood` says how:
//    'upfront' (the default), like a building's training: it starts once the whole cost is on hand and takes it at
//    once; 'eaten': it eats the cost as it goes, spread over its time, and pauses whenever the food runs out.
//  • Time: METAMORPH_SEC × the new form's refinement, plus growing the extra body at training's rate (K.trainSecPerKg
//    per kg gained). A refined form takes longer to grow into, and no building's capital is needed: time pays for
//    the refinement.
//  • A form can be at most 1.0 more refined than the one it grows from (so refinement climbs a step at a time).
//  • While it changes it stands still and can't fight; killed, the change is lost with it.
//  • `shell: 'unit-id'`: it changes inside a shell. Ordered to change, it becomes that unit at once, at its own mass
//    (the shell's spec gives the body's makeup and its look; the mass is the one that went in), and the shell brews
//    the new form: it's worth what went in, so it pays the new form's price less that, grows any extra body, and
//    the new form emerges from it. A shell takes orders like any unit: a new order cancels the brew (refunding what
//    it had paid to its pack), and it can start again on any form what went into it could become.
// Spawning: `spawns: [unit ids]`. The parent trains them in its own body, like a building: a queue of up to MAX_QUEUE,
// each paid up front (its whole price, once that much is on hand) and grown over METAMORPH_SEC × its refinement plus
// its whole body's growing time, then laid beside it. It goes on moving, gathering and fighting meanwhile. A parent
// can't spawn anything more refined than itself (refinement climbs only by changing). Changed or laid, a unit is
// born without crystal in its weapon pack: it gets its own (sim/world.ts: an empty armed unit seeks crystal). A unit laid with exactly one
// form it `becomes` (an egg) starts changing into it at once.
import type { UnitSpec } from '../../factions/types';
import { derive, K, type DerivedStats } from '../physics';
import { MAX_QUEUE, type Unit, type World } from '../world';
import type { Ability } from './index';

/** Seconds per point of the new form's refinement. */
export const METAMORPH_SEC = 6;
/** The most refinement one change can add. */
export const METAMORPH_MAX_STEP = 1;

/**
 * What changing `from` into `to` (or, `spawn`, growing a `to` beside it) costs: food, and seconds. `mass`: the body
 * that's changing, if not `from`'s (a shell is at the mass of what went into it).
 */
export function metamorphCost(from: DerivedStats, to: DerivedStats, spawn = false, mass = from.mass): { food: number; sec: number } {
  const grow = spawn ? to.mass : Math.max(0, to.mass - mass); // kg of body to grow
  return { food: spawn ? to.foodCost : Math.max(0, to.foodCost - from.foodCost), sec: METAMORPH_SEC * to.refinement + K.trainSecPerKg * grow };
}

/** Can this unit change into `into` (or, `spawn`, grow one)? */
export function canBecome(w: World, u: Unit, into: string, spawn = false): boolean {
  const spec = w.specOf(u.owner, (!spawn && u.shellOf) || u.specId)?.spec; // a shell: what went into it
  return !!(spawn ? spec?.spawns : spec?.becomes)?.includes(into) && !!w.specOf(u.owner, into);
}

/** Food `u` can draw on where it stands: its own pack, friendly food bearers in reach, buildings of its side beside it. */
function larders(w: World, u: Unit): Array<{ have: number; take: (kg: number) => void }> {
  const out: Array<{ have: number; take: (kg: number) => void }> = [{ have: u.food, take: (k) => { u.food -= k; } }];
  for (const b of w.units.values()) {
    const r = b.owner === u.owner && b !== u ? w.specOf(b.owner, b.specId)?.spec.bearer : undefined;
    if (r?.resource === 'food' && Math.hypot(b.x - u.x, b.y - u.y) <= r.radius) out.push({ have: b.food, take: (k) => { b.food -= k; } });
  }
  for (const b of w.buildingsOf(u.owner)) {
    const ex = Math.max(b.ox, Math.min(u.x, b.ox + b.size)) - u.x, ey = Math.max(b.oy, Math.min(u.y, b.oy + b.size)) - u.y;
    if (b.complete && Math.hypot(ex, ey) <= u.stats.radius + 1.5) out.push({ have: b.stock.food, take: (k) => { b.stock.food -= k; } }); // (beside it: within a tile and a half)
  }
  return out;
}

/**
 * Order kind 'metamorph': stand and change (`paid` kg of the food cost taken so far, `t` seconds in). Up front, it
 * starts once the whole cost is on hand; eaten, the time runs while what it has eaten keeps up with it. Done, the
 * unit is replaced by its new form (same place, heading, pack, and share of health and calories), or grows a new one
 * beside it. Returns whether it moved (never).
 */
export function runMetamorph(w: World, u: Unit, o: { into: string; paid: number; t: number; from?: string }, dt: number): boolean {
  const from = w.specOf(u.owner, o.from ?? u.specId), to = w.specOf(u.owner, o.into); // (a shell: worth what went into it)
  if (!from || !to) { w.finish(u); return false; }
  const cost = metamorphCost(from.stats, to.stats, false, u.stats.mass);
  const eaten = from.spec.growthFood === 'eaten'; // (its own way of taking food, or what went into the shell's)
  // what must be paid by the end of this tick: all of it before starting, or (eaten) its share of the time so far
  const due = !eaten || cost.sec <= 0 ? cost.food : Math.min(cost.food, (cost.food * (o.t + dt)) / cost.sec);
  if (o.paid + 1e-6 < due) {
    const ls = larders(w, u), have = ls.reduce((t, l) => t + l.have, 0);
    if (!eaten && have + 1e-6 < due - o.paid) return false; // up front: waiting for the whole cost to be on hand
    let want = Math.min(have, due - o.paid);
    o.paid += want;
    for (const l of ls) { const k = Math.min(l.have, want); l.take(k); want -= k; }
  }
  if (o.paid + 1e-6 >= due) { o.t += dt; u.busy = true; } // fed: the change goes on (eaten, it pauses when the food runs out)
  if (o.t < cost.sec || o.paid + 1e-6 < cost.food) return false;
  swapInto(w, u, o.into); // done: the new form, where the old body stood
  return false;
}

/**
 * Replace `u` with a new unit of `into` where it stands: same heading, pack, and share of health and calories (`mass`:
 * at this mass rather than its spec's, for a shell). Returns the new unit.
 */
export function swapInto(w: World, u: Unit, into: string, mass?: number): Unit | null {
  const hpShare = u.hp / u.stats.maxHp, calShare = u.cal / u.stats.maxCalories;
  w.units.delete(u.id);
  const n = w.spawnAt(u.owner, into, u.x, u.y, u.heading);
  if (!n) return null;
  if (mass !== undefined) n.stats = statsAtMass(w, u.owner, into, mass);
  n.x = n.px = u.x; n.y = n.py = u.y; n.facing = u.facing;
  n.hp = n.stats.maxHp * hpShare; n.cal = n.stats.maxCalories * calShare;
  n.food = u.food; n.wood = u.wood; n.crystal = u.crystal;
  n.ammo = 0; // born without crystal: it gets its own (what it was carrying arms it first)
  if (n.stats.canAttack && n.order.kind === 'idle' && n.crystal < n.crystalMass) w.fetchCrystal(n); // (and goes for one: picked up, or mined)
  w.events.push({ type: 'metamorph', id: u.id, into: n.id, owner: u.owner, x: n.x, y: n.y, specId: u.specId, intoSpec: into, heading: u.heading });
  return n;
}

/** A unit spec's stats at another mass (a shell takes the mass of what went into it). */
const atMass = new Map<string, DerivedStats>();
function statsAtMass(w: World, owner: number, specId: string, mass: number): DerivedStats {
  const key = `${w.players[owner].factionId}/${specId}/${mass}`;
  let st = atMass.get(key);
  if (!st) {
    const spec = w.specOf(owner, specId)!.spec;
    st = derive({ ...spec, mass, size: spec.size && spec.size * Math.cbrt(mass / spec.mass) }); // (its footprint grows with it)
    atMass.set(key, st);
  }
  return st;
}

/**
 * Ordered to change into `into`: a unit with a shell goes into it at once (and the shell brews `into`); one without
 * stands and changes in place.
 */
export function beginMetamorph(w: World, u: Unit, into: string): void {
  if (u.shellOf) { u.order = { kind: 'metamorph', into, paid: 0, t: 0, from: u.shellOf }; return; } // a shell starting (again)
  const shell = w.specOf(u.owner, u.specId)?.spec.shell;
  if (shell && w.specOf(u.owner, shell)) {
    const s = swapInto(w, u, shell, u.stats.mass);
    if (s) { s.shellOf = u.specId; s.order = { kind: 'metamorph', into, paid: 0, t: 0, from: u.specId }; }
  } else u.order = { kind: 'metamorph', into, paid: 0, t: 0 };
}

/**
 * Food handed to a unit in the middle of a change (Give) goes straight into paying for it, not into its pack (an egg's
 * pack is tiny), up to what the change still owes. Returns the kg it took.
 */
export function feedChange(w: World, u: Unit, kg: number): number {
  const o = u.order;
  if (o.kind !== 'metamorph' || kg <= 0) return 0;
  const from = w.specOf(u.owner, o.from ?? u.specId), to = w.specOf(u.owner, o.into);
  if (!from || !to) return 0;
  const k = Math.max(0, Math.min(kg, metamorphCost(from.stats, to.stats, false, u.stats.mass).food - o.paid));
  o.paid += k;
  return k;
}

/** How much food `u` is waiting on: what its change still owes, or (a parent) the unpaid rest of its next spawn. */
export function foodOwed(w: World, u: Unit): number {
  const o = u.order;
  if (o.kind === 'metamorph') {
    const from = w.specOf(u.owner, o.from ?? u.specId), to = w.specOf(u.owner, o.into);
    return from && to ? Math.max(0, metamorphCost(from.stats, to.stats, false, u.stats.mass).food - o.paid) : 0;
  }
  const b = u.brood[0], from = w.specOf(u.owner, u.specId), to = b && w.specOf(u.owner, b.into);
  return b && from && to ? Math.max(0, metamorphCost(from.stats, to.stats, true).food - b.paid - u.food) : 0;
}

/**
 * Who of `u`'s side (not itself) a feeder brings its load to: the nearest changing (an egg, a cocoon) first, then the
 * nearest parent with an unpaid spawn queued.
 */
export function nearestHungry(w: World, u: Unit): Unit | null {
  let best: Unit | null = null, bestD = Infinity, bestChanging = false;
  for (const x of w.units.values()) {
    if (x.owner !== u.owner || x === u || foodOwed(w, x) < 0.05) continue;
    const changing = x.order.kind === 'metamorph', d = (x.x - u.x) ** 2 + (x.y - u.y) ** 2;
    if ((changing && !bestChanging) || (changing === bestChanging && d < bestD)) { bestD = d; best = x; bestChanging = changing; }
  }
  return best;
}

/** Queue a spawn in `u` (a parent whose spec `spawns` it), up to MAX_QUEUE. */
export function queueBrood(w: World, u: Unit, into: string): void {
  if (canBecome(w, u, into, true) && u.brood.length < MAX_QUEUE) u.brood.push({ into, t: 0, paid: 0 });
}

/** Cancel a spawn queued in `u` (default: the last): what it had paid goes back into its pack. */
export function cancelBrood(u: Unit, index = u.brood.length - 1): void {
  const [b] = u.brood.splice(index, 1);
  if (b) u.food += b.paid;
}

/** Each tick, whatever the parent is doing: the front of its spawn queue, paid up front, grows and is laid beside it. */
export function tickBrood(w: World, u: Unit, dt: number): void {
  if (!u.brood.length && u.autoBrood) queueBrood(w, u, u.autoBrood); // auto-train, as a building does
  const b = u.brood[0];
  if (!b) return;
  const from = w.specOf(u.owner, u.specId), to = w.specOf(u.owner, b.into);
  if (!from || !to) { u.brood.shift(); return; }
  const cost = metamorphCost(from.stats, to.stats, true);
  if (b.paid + 1e-6 < cost.food) {
    const ls = larders(w, u);
    if (ls.reduce((t, l) => t + l.have, 0) + 1e-6 < cost.food - b.paid) return; // waiting for its price to be on hand
    let want = cost.food - b.paid;
    b.paid = cost.food;
    for (const l of ls) { const k = Math.min(l.have, want); l.take(k); want -= k; }
  }
  b.t += dt;
  if (b.t < cost.sec) return;
  u.brood.shift();
  // laid out of its back
  const back = u.facing + Math.PI;
  const spot = w.grid.nearestOpen(u.x + Math.cos(back) * (u.stats.radius + 0.6), u.y + Math.sin(back) * (u.stats.radius + 0.6), 3) ?? [u.x, u.y];
  const n = w.spawnAt(u.owner, b.into, spot[0], spot[1], u.heading);
  if (!n) return;
  n.ammo = 0; // laid without crystal: it gets its own
  w.events.push({ type: 'trained', id: n.id, owner: u.owner });
  // laid with one form to become (an egg): it starts changing into it at once
  const next = w.specOf(n.owner, n.specId)?.spec.becomes;
  if (next?.length === 1) beginMetamorph(w, n, next[0]);
}

export const metamorph: Ability = {
  id: 'metamorph',
  validateUnit(u: UnitSpec, where: string): string[] {
    const errs: string[] = [];
    if (u.becomes !== undefined && (!Array.isArray(u.becomes) || u.becomes.some((id) => typeof id !== 'string' || id === u.id))) errs.push(`${where}: becomes must list other unit ids`);
    if (u.spawns !== undefined && (!Array.isArray(u.spawns) || u.spawns.some((id) => typeof id !== 'string'))) errs.push(`${where}: spawns must list unit ids`);
    if (u.growthFood !== undefined && u.growthFood !== 'upfront' && u.growthFood !== 'eaten') errs.push(`${where}: growthFood must be 'upfront' or 'eaten'`);
    if (u.shell !== undefined && (typeof u.shell !== 'string' || u.shell === u.id)) errs.push(`${where}: shell must be another unit id`);
    return errs;
  },
  unitCodex(u: UnitSpec): string | null {
    const lines: string[] = [];
    if (u.becomes?.length) lines.push(`Metamorphosis: changes where it stands into ${u.becomes.join(' or ')}, paying only the difference in food (${u.growthFood === 'eaten' ? 'eaten as it changes' : 'up front'}, from its pack, food bearers in reach or a building beside it) over ${METAMORPH_SEC} s × the new form's refinement, plus the time to grow any extra body.`);
    if (u.becomes?.length) lines.push(u.shell ? `It changes inside a ${u.shell}: at once it becomes one, at its own mass, and the new form emerges from it.` : `It can't move or fight while it changes.`);
    if (u.spawns?.length) lines.push(`Spawns: trains ${u.spawns.join(' or ')} in its own body, like a building (a queue of ${MAX_QUEUE}), each paid up front from its pack, food bearers in reach or a building beside it, grown over ${METAMORPH_SEC} s × its refinement plus the time to grow its body, then laid beside it. It goes on moving and fighting meanwhile.`);
    return lines.length ? lines.join(' ') : null;
  },
};

/** The faction-level check: each form it becomes is one of its own units at most a step more refined; each it spawns, no more refined than itself. */
export function validateMetamorphForms(units: UnitSpec[], refinement: (u: UnitSpec) => number): string[] {
  const errs: string[] = [];
  for (const u of units) {
    if (u.shell && !units.some((x) => x.id === u.shell)) errs.push(`${u.id}: shell "${u.shell}" isn't one of this faction's units`);
    for (const [verb, ids, step] of [['becomes', u.becomes, METAMORPH_MAX_STEP], ['spawns', u.spawns, 0]] as const) for (const id of ids ?? []) {
      const to = units.find((x) => x.id === id);
      if (!to) { errs.push(`${u.id}: ${verb} "${id}", which isn't one of this faction's units`); continue; }
      if (refinement(to) > refinement(u) + step + 1e-9) errs.push(`${u.id}: ${verb} ${id}, more than ${step} refinement up (${refinement(u)} → ${refinement(to)})`);
    }
  }
  return errs;
}
