// Laying down its body (UnitSpec.laysDown: ids of living buildings). The unit can become one of these: placed like any
// building, it walks to the site and lays itself down there, its body the building's seed (kg of its mass for kg of
// the building's materials), and whatever it carried goes into the building's stock. Ordered to lay several pieces
// (a line of wall), each takes a seed's worth of its body, the last all that's left; laid alone, a piece takes its
// whole body (up to its full materials). Then, like any living building, it grows by eating food from its stock to
// its full size. A building only bodies lay down can't be built any other way.
import type { BuildingSpec, UnitSpec } from '../../factions/types';
import type { DerivedStats } from '../physics';
import type { Unit, World } from '../world';
import { livingStats, seedMaterials } from './living';
import type { Ability } from './index';

/** Can this unit lay its body down as `buildingId`? */
export const canLayDown = (w: World, u: Unit, buildingId: string): boolean => !!w.specOf(u.owner, u.specId)?.spec.laysDown?.includes(buildingId);

/** Is `buildingId` one that only bodies lay down (some unit of the owner's faction lays it)? */
export const bodyBuilt = (w: World, owner: number, buildingId: string): boolean =>
  w.factionOf(owner).units.some((u) => u.laysDown?.includes(buildingId));

/** How many pieces of `b` a body of `mass` kg can seed (a seed's worth each). */
export const piecesFrom = (mass: number, b: BuildingSpec): number => Math.max(1, Math.floor(mass / Math.max(1e-6, seedMaterials(b))));

/** Order kind 'layDown': walk to the site, then lay its body down there. Returns whether it moved. */
export function runLayDown(w: World, u: Unit, siteId: number): boolean {
  const site = w.buildings.get(siteId);
  if (!site || site.owner !== u.owner || site.complete || !site.spec.living) { w.finish(u); return false; }
  if (!w.moveToBuilding(u, site)) return u.x !== u.px || u.y !== u.py;
  const left = u.stats.mass - (u.bodySpent ?? 0), more = u.queue.some((q) => q.kind === 'layDown' && !w.buildings.get(q.site)?.complete);
  const give = Math.min(more ? seedMaterials(site.spec) : site.spec.materials, left);
  site.grown = give;
  site.stats = livingStats(site.spec, w.factionOf(site.owner), give);
  site.maxHp = site.stats.maxHp;
  site.hp = site.maxHp;
  w.completeBuilding(site);
  w.deposit(u, site); // (what it carried goes in with it)
  u.bodySpent = (u.bodySpent ?? 0) + give;
  if (!more || left - give < 1) { w.units.delete(u.id); return false; } // all of it laid down
  w.finish(u);
  return false;
}

export const layDown: Ability = {
  id: 'layDown',
  validateUnit(u: UnitSpec, where: string): string[] {
    if (u.laysDown === undefined) return [];
    return Array.isArray(u.laysDown) && u.laysDown.every((x) => typeof x === 'string') ? [] : [`${where}: laysDown must be a list of building ids`];
  },
  unitCodex(u: UnitSpec, d: DerivedStats): string | null {
    if (!u.laysDown?.length) return null;
    return `Lays down its body: it can become ${u.laysDown.join(' or ')}, its ${d.mass.toFixed(0)} kg the seed (several pieces in a line, a seed's worth each); then it grows on food.`;
  },
};
