// Ammo bearer (UnitSpec.bearer): a walking pile of crystal. Dry throwers fetch
// from the nearest one like spent crystals on the ground; it loads up at any
// building with crystal, gathers crystal only (and keeps it), and sweeps up
// spent crystals when idle. Presentation elsewhere: the overhead crystal bar
// (render/renderer.ts) and right-click restocking (ui/input.ts).
import type { ResourceKind } from '../../factions/types';
import { n0 } from '../../ui/format';
import type { Building, Unit, World } from '../world';
import type { Ability } from './index';

export function isBearer(w: World, u: Unit): boolean {
  return !!w.specOf(u.owner, u.specId)?.spec.bearer;
}

/** Can this unit gather `r` (any resource if omitted)? Ammo bearers gather crystal only. */
export function gathers(w: World, u: Unit, r?: ResourceKind): boolean {
  if (u.stats.gatherRate <= 0) return false;
  return !isBearer(w, u) || r === 'crystal';
}

/** The nearest friendly ammo bearer with a crystal to spare, within reach of a thrower. */
export function nearestBearer(w: World, u: Unit): Unit | null {
  let best: Unit | null = null, bestD = Infinity;
  for (const b of w.units.values()) {
    if (b.owner !== u.owner || b === u || b.crystal < Math.min(u.crystalMass, u.stats.loadoutCrystal - u.ammo) - 1e-6) continue;
    const spec = w.specOf(b.owner, b.specId)?.spec.bearer;
    if (!spec) continue;
    const d = (b.x - u.x) ** 2 + (b.y - u.y) ** 2;
    if (d <= (u.stats.sight + spec.radius) ** 2 && d < bestD) { bestD = d; best = b; }
  }
  return best;
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

/** What a unit drops off at a building: a bearer keeps its crystal to hand out. */
export function depositKinds(w: World, u: Unit): ResourceKind[] | undefined {
  return isBearer(w, u) ? ['food', 'wood'] : undefined;
}

/** At a building: a bearer fills its cargo with crystal to hand out. */
export function loadUp(w: World, u: Unit, b: Building): void {
  if (!isBearer(w, u)) return;
  const k = Math.floor(Math.min(w.freeCapacity(u), b.stock.crystal));
  if (k > 0) { u.crystal += k; b.stock.crystal -= k; }
}

/** Idle: sweep up spent crystals nearby. True if it set off. */
export function sweep(w: World, u: Unit): boolean {
  if ((w.tick + u.id) % 20 !== 0 || w.freeCapacity(u) < 0.5 || !isBearer(w, u)) return false;
  const shard = w.nearestNode(u, 'crystal', u.stats.sight, true);
  if (!shard) return false;
  u.order = { kind: 'gather', node: shard.id, nodeType: 'crystal', phase: 'toNode', stopWhenArmed: false };
  return true;
}

export const bearer: Ability = {
  id: 'bearer',
  validateUnit: (u, where) => (u.bearer !== undefined && (typeof u.bearer.radius !== 'number' || !Number.isFinite(u.bearer.radius) || u.bearer.radius <= 0 || u.bearer.radius > 12) ? [`${where}: bad bearer radius`] : []),
  unitCodex: (u, d) => (u.bearer ? `<b>Ammo bearer.</b> A walking pile of crystal (${n0(d.cargoCapacity)} kg): friendly throwers that run dry come and take a load, like spent crystals on the ground. Refills at any building with crystal (right-click it).` : null),
};
