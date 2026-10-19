// Tree digestion: `digestsTrees: true` on a unit spec. Sent onto a tree (right-click it), the unit walks up to it and,
// on arrival, the whole tree turns at once into a semi-digested food node holding as much food as the tree held wood
// (1 kg for 1 kg), for anyone to gather; the unit is absorbed into it (gone: no corpse, no food from its body).
import type { UnitSpec } from '../../factions/types';
import type { Unit, World } from '../world';
import type { Ability } from './index';

/** Can this unit digest trees? */
export const digestsTrees = (w: World, u: Unit): boolean => !!w.specOf(u.owner, u.specId)?.spec.digestsTrees;

/** Order kind 'digest': walk to the tree, then turn it into food and be absorbed. Returns whether it moved. */
export function runDigest(w: World, u: Unit, nodeId: number): boolean {
  const n = w.nodes.get(nodeId);
  if (!n || !n.tree) { w.finish(u); return false; }
  if (!w.moveTo(u, n.x, n.y, u.stats.radius + 0.9)) return u.x !== u.px || u.y !== u.py;
  const food = w.replaceNode(n, { type: 'food', x: n.x, y: n.y, amount: n.amount, shard: false, tree: false, digested: true });
  w.units.delete(u.id);
  w.events.push({ type: 'digested', id: u.id, owner: u.owner, node: food.id, x: n.x, y: n.y });
  return false;
}

export const digest: Ability = {
  id: 'digest',
  validateUnit(u: UnitSpec, where: string): string[] {
    return u.digestsTrees !== undefined && typeof u.digestsTrees !== 'boolean' ? [`${where}: digestsTrees must be true or false`] : [];
  },
  unitCodex(u: UnitSpec): string | null {
    return u.digestsTrees ? 'Digests trees: sent onto a tree, it turns the whole tree at once into food (1 kg for each kg of wood) for anyone to gather, and is absorbed into it.' : null;
  },
};
