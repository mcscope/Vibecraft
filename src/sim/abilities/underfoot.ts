// Underfoot buildings: one-tile pieces laid on the ground that block nothing.
//  • Road (BuildingSpec.road): anyone on it moves faster and burns fewer calories
//    per tile; wheels gain twice as much (less rolling resistance).
//  • Conveyor belt (BuildingSpec.conveyor): belt tiles joined edge to edge form a
//    network. A gatherer can unload onto any tile of it; the goods ride the belt
//    to the nearest of its owner's buildings the belt touches.
import type { BuildingSpec, ResourceKind } from '../../factions/types';
import { f1 } from '../../ui/format';
import type { Building, Unit, World } from '../world';
import type { Ability } from './index';

export const isUnderfoot = (s: BuildingSpec): boolean => !!(s.road || s.conveyor);

/** Goods riding a belt: on tile `tile`, `t` (0..1) of the way to the next one. */
export interface Parcel { id: number; owner: number; res: ResourceKind; kg: number; tile: number; t: number }

/** Speed multiplier for a unit standing at (x, y): a finished road speeds everyone (wheels twice as much). */
export function roadFactor(w: World, u: Unit): number {
  const b = w.underfootAt(u.x, u.y);
  if (!b || !b.complete || !b.spec.road) return 1;
  const s = b.spec.road.speed;
  return u.stats.wheeled ? 1 + (s - 1) * 2 : s;
}

/**
 * Belt routes: for every finished belt tile, the next tile toward the nearest
 * building of its owner that the belt touches (-1: this tile touches it), and
 * that building. Recomputed whenever buildings change.
 */
export interface BeltRoutes { next: Map<number, number>; dest: Map<number, number> }

export function routeBelts(w: World): BeltRoutes {
  const next = new Map<number, number>(), dest = new Map<number, number>();
  const W = w.grid.width;
  const belt = (i: number): Building | undefined => {
    const b = w.underfootAt(i % W, Math.floor(i / W));
    return b && b.complete && b.spec.conveyor ? b : undefined;
  };
  const queue: number[] = [];
  for (const b of w.buildings.values()) {
    if (!b.complete || isUnderfoot(b.spec)) continue;
    // belt tiles touching this building's edges start the routes
    for (let y = b.oy - 1; y <= b.oy + b.size; y++) for (let x = b.ox - 1; x <= b.ox + b.size; x++) {
      const side = (x === b.ox - 1 || x === b.ox + b.size) !== (y === b.oy - 1 || y === b.oy + b.size); // edges, not corners
      if (!side || !w.grid.inBounds(x, y)) continue;
      const i = y * W + x, t = belt(i);
      if (!t || t.owner !== b.owner || dest.has(i)) continue;
      next.set(i, -1); dest.set(i, b.id); queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % W, y = Math.floor(i / W), owner = belt(i)!.owner;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!w.grid.inBounds(x + dx, y + dy)) continue;
      const j = i + dy * W + dx, t = belt(j);
      if (!t || t.owner !== owner || dest.has(j)) continue;
      next.set(j, i); dest.set(j, dest.get(i)!); queue.push(j);
    }
  }
  return { next, dest };
}

/** The nearest routed belt tile of `u`'s side, if nearer than `than` (squared distance): its centre. */
export function nearestBelt(w: World, u: Unit, than: number): [number, number] | null {
  let best: [number, number] | null = null, bestD = than;
  const W = w.grid.width;
  for (const i of w.belts().dest.keys()) {
    const b = w.underfootAt(i % W, Math.floor(i / W));
    if (!b || b.owner !== u.owner) continue;
    const cx = (i % W) + 0.5, cy = Math.floor(i / W) + 0.5;
    const d = (cx - u.x) ** 2 + (cy - u.y) ** 2;
    if (d < bestD) { bestD = d; best = [cx, cy]; }
  }
  return best;
}

/** Unload a unit's cargo onto the belt tile at (x, y) (the one it walked to). */
export function loadBelt(w: World, u: Unit, x: number, y: number): void {
  const i = Math.floor(y) * w.grid.width + Math.floor(x);
  for (const r of ['food', 'wood', 'crystal'] as const) {
    if (u[r] < 0.05) continue;
    w.parcels.push({ id: w.nextParcelId(), owner: u.owner, res: r, kg: u[r], tile: i, t: 0 });
    u[r] = 0;
  }
}

/** Move every parcel along its belt; parcels reaching a building are added to its stock. A broken belt drops them. */
export function runBelts(w: World, dt: number): void {
  const routes = w.belts(), W = w.grid.width;
  w.parcels = w.parcels.filter((p) => {
    const b = w.underfootAt(p.tile % W, Math.floor(p.tile / W));
    if (!b || !b.spec.conveyor || !routes.dest.has(p.tile)) return false; // the belt's gone: the goods are lost
    p.t += b.spec.conveyor.speed * dt;
    while (p.t >= 1) {
      const n = routes.next.get(p.tile);
      if (n === undefined) return false;
      if (n === -1) {
        const to = w.buildings.get(routes.dest.get(p.tile)!);
        if (to && to.owner === p.owner) to.stock[p.res] += p.kg;
        return false;
      }
      p.tile = n; p.t -= 1;
    }
    return true;
  });
}

/** Where a parcel is drawn: between its tile and the next one (map coords). */
export function parcelPos(w: World, p: Parcel): [number, number] {
  const W = w.grid.width;
  const x0 = (p.tile % W) + 0.5, y0 = Math.floor(p.tile / W) + 0.5;
  const n = w.belts().next.get(p.tile);
  if (n === undefined) return [x0, y0];
  if (n === -1) {
    const to = w.buildings.get(w.belts().dest.get(p.tile)!);
    if (!to) return [x0, y0];
    const tx = to.ox + to.size / 2, ty = to.oy + to.size / 2, d = Math.hypot(tx - x0, ty - y0) || 1;
    return [x0 + ((tx - x0) / d) * 0.5 * p.t, y0 + ((ty - y0) / d) * 0.5 * p.t];
  }
  const x1 = (n % W) + 0.5, y1 = Math.floor(n / W) + 0.5;
  return [x0 + (x1 - x0) * p.t, y0 + (y1 - y0) * p.t];
}

export const underfoot: Ability = {
  id: 'underfoot',
  validateBuilding: (b, where) => {
    const e: string[] = [];
    if (b.road !== undefined && !(typeof b.road.speed === 'number' && b.road.speed >= 1 && b.road.speed <= 2)) e.push(`${where}: bad road`);
    if (b.conveyor !== undefined && !(typeof b.conveyor.speed === 'number' && b.conveyor.speed > 0 && b.conveyor.speed <= 6)) e.push(`${where}: bad conveyor`);
    if (isUnderfoot(b) && b.size !== 1) e.push(`${where}: underfoot pieces are 1 tile`);
    return e;
  },
  buildingCodex: (b) => {
    if (b.road) return `<b>Road.</b> Laid underfoot: anyone on it, friend or foe, moves ${f1(b.road.speed, 2)}× as fast for fewer calories (wheels ${f1(1 + (b.road.speed - 1) * 2, 2)}×). Shift-click to lay a line.`;
    if (b.conveyor) return `<b>Conveyor belt.</b> Laid underfoot. Gatherers unload onto any tile of a belt that touches one of your buildings, and the goods ride it there at ${f1(b.conveyor.speed, 1)} tiles/s. Shift-click to lay a line.`;
    return null;
  },
};
