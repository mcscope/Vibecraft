// Bearer (UnitSpec.bearer): a walking pile of one resource for its side.
//  • Crystal (the default): an ammo bearer. Dry throwers fetch from the nearest
//    one like spent crystals on the ground; it sweeps up spent crystals when idle.
//  • Food: a food bearer. Hungry units nearby walk over and eat from it instead
//    of going home.
// Either way it loads up at any building with that resource (and comes out of
// training loaded), gathers only that resource, and keeps it to hand out.
// Presentation elsewhere: the overhead bar (render/renderer.ts) and
// right-click restocking (ui/input.ts).
import type { ResourceKind } from '../../factions/types';
import { n0 } from '../../ui/format';
import { K } from '../physics';
import { DT, type Building, type Unit, type World } from '../world';
import type { Ability } from './index';

/** What a bearer carries ('crystal' or 'food'), or null if it isn't one. */
export function bearerRes(w: World, u: Unit): 'crystal' | 'food' | null {
  const b = w.specOf(u.owner, u.specId)?.spec.bearer;
  return b ? b.resource ?? 'crystal' : null;
}
export function isBearer(w: World, u: Unit): boolean {
  return bearerRes(w, u) !== null;
}

/** Can this unit gather `r` (any resource if omitted)? Bearers gather only what they carry. */
export function gathers(w: World, u: Unit, r?: ResourceKind): boolean {
  if (u.stats.gatherRate <= 0) return false;
  const res = bearerRes(w, u);
  return !res || r === res;
}

/** The nearest friendly bearer of `res` with some to spare (`need` kg), within `reach` of u's sight. */
function nearestOf(w: World, u: Unit, res: 'crystal' | 'food', need: number): Unit | null {
  let best: Unit | null = null, bestD = Infinity;
  for (const b of w.units.values()) {
    if (b.owner !== u.owner || b === u || b[res] < need - 1e-6 || bearerRes(w, b) !== res) continue;
    const spec = w.specOf(b.owner, b.specId)!.spec.bearer!;
    const d = (b.x - u.x) ** 2 + (b.y - u.y) ** 2;
    if (d <= (u.stats.sight + spec.radius) ** 2 && d < bestD) { bestD = d; best = b; }
  }
  return best;
}

/** The nearest friendly ammo bearer with a crystal to spare, within reach of a thrower. */
export function nearestBearer(w: World, u: Unit): Unit | null {
  return nearestOf(w, u, 'crystal', Math.min(u.crystalMass, u.stats.loadoutCrystal - u.ammo));
}

/** The nearest friendly food bearer with food to spare, within reach of a hungry unit. */
export function nearestFoodBearer(w: World, u: Unit): Unit | null {
  return nearestOf(w, u, 'food', 1);
}

/** Order kind 'rearm': walk to a bearer and take a load from it. Returns whether it moved. */
export function runRearm(w: World, u: Unit, bearerId: number): boolean {
  const b = w.units.get(bearerId);
  if (!b || b.owner !== u.owner || b.crystal < 1e-6 || u.ammo >= u.stats.loadoutCrystal - 1e-6) { w.finish(u); return false; }
  if (!w.moveTo(u, b.x, b.y, u.stats.radius + b.stats.radius + 0.5)) return u.x !== u.px || u.y !== u.py;
  const k = Math.min(u.stats.loadoutCrystal - u.ammo, b.crystal);
  b.crystal -= k; u.ammo += k;
  w.finish(u);
  return false;
}

/** Order kind 'eatFrom': walk to a food bearer and eat from it until full (or it's empty). Returns whether it moved. */
export function runEatFrom(w: World, u: Unit, bearerId: number): boolean {
  const b = w.units.get(bearerId);
  const room = u.stats.maxCalories - u.cal;
  if (!b || b.owner !== u.owner || b.food < 1e-6 || room < 1) { w.finish(u); return false; }
  if (!w.moveTo(u, b.x, b.y, u.stats.radius + b.stats.radius + 0.5)) return u.x !== u.px || u.y !== u.py;
  const kg = Math.min(b.food, (u.stats.eatRate * DT) / K.calPerFood, room / K.calPerFood);
  b.food -= kg; u.cal += kg * K.calPerFood; u.busy = true;
  return false;
}

/** What a unit drops off at a building: a bearer keeps what it carries to hand out. */
export function depositKinds(w: World, u: Unit): ResourceKind[] | undefined {
  const res = bearerRes(w, u);
  return res ? (['food', 'wood', 'crystal'] as const).filter((r) => r !== res) : undefined;
}

/** At a building: a bearer fills its cargo with what it hands out. */
export function loadUp(w: World, u: Unit, b: Building): void {
  const res = bearerRes(w, u);
  if (!res) return;
  const k = Math.floor(Math.min(w.freeCapacity(u), b.stock[res]));
  if (k > 0) { u[res] += k; b.stock[res] -= k; }
}

/** Idle: sweep up spent crystals nearby. True if it set off. */
export function sweep(w: World, u: Unit): boolean {
  if ((w.tick + u.id) % 20 !== 0 || w.freeCapacity(u) < 0.5 || bearerRes(w, u) !== 'crystal') return false;
  const shard = w.nearestNode(u, 'crystal', u.stats.sight, true);
  if (!shard) return false;
  u.order = { kind: 'gather', node: shard.id, nodeType: 'crystal', phase: 'toNode', stopWhenArmed: false };
  return true;
}

export const bearer: Ability = {
  id: 'bearer',
  validateUnit: (u, where) => {
    if (u.bearer === undefined) return [];
    const e: string[] = [];
    if (typeof u.bearer.radius !== 'number' || !Number.isFinite(u.bearer.radius) || u.bearer.radius <= 0 || u.bearer.radius > 12) e.push(`${where}: bad bearer radius`);
    if (u.bearer.resource !== undefined && u.bearer.resource !== 'crystal' && u.bearer.resource !== 'food') e.push(`${where}: a bearer carries crystal or food`);
    return e;
  },
  unitCodex: (u, d) => {
    if (!u.bearer) return null;
    return (u.bearer.resource ?? 'crystal') === 'food'
      ? `<b>Food bearer.</b> A walking larder (${n0(d.cargoCapacity)} kg): hungry units nearby come and eat from it instead of walking home. Refills at any building with food (right-click it).`
      : `<b>Ammo bearer.</b> A walking pile of crystal (${n0(d.cargoCapacity)} kg): friendly throwers that run dry come and take a load, like spent crystals on the ground. Refills at any building with crystal (right-click it).`;
  },
};
