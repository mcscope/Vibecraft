// How the skirmish AI uses data-defined abilities. One small routine per ability,
// each a no-op for factions that don't have it, so any faction that switches an
// ability on gets an opponent that knows what to do with it.
import type { FactionSpec } from '../factions/types';
import type { Command } from '../sim/commands';
import { isUnderfoot } from '../sim/abilities/underfoot';
import type { Building, Unit, World } from '../sim/world';

export interface AiTurn {
  w: World;
  player: number;
  faction: FactionSpec;
  workers: Unit[];
  army: Unit[];
  buildings: Building[];
  /** Units sent on the current attack. */
  attacking: Set<number>;
  /** Up to n free workers nearest (x, y), marked busy. */
  closestFree(x: number, y: number, n: number): number[];
  /** Queue a unit at a building, one unpaid order at a time. */
  train(b: Building, specId: string): boolean;
  out: Command[];
}

const centre = (b: Building): [number, number] => [b.ox + b.size / 2, b.oy + b.size / 2];

/** Ammo bearers: keep one per six throwers and walk them behind the attack. */
export function useBearers(t: AiTurn): void {
  const { w, player, faction } = t;
  const bearerIds = (faction.units ?? []).filter((u) => u.bearer && (u.bearer.resource ?? 'crystal') === 'crystal').map((u) => u.id);
  if (!bearerIds.length) return;
  const bearers = t.army.filter((u) => bearerIds.includes(u.specId));
  const throwers = t.army.filter((u) => u.stats.loadoutCrystal > 0).length;
  if (throwers >= 4 && bearers.length < Math.floor(throwers / 6) + 1) {
    const b = t.buildings.find((x) => x.complete && x.queue.length < 2 && x.spec.trains?.some((id) => bearerIds.includes(id) && w.specOf(player, id)));
    if (b) t.train(b, b.spec.trains!.find((id) => bearerIds.includes(id))!);
  }
  const front = t.army.filter((u) => t.attacking.has(u.id) && u.stats.loadoutCrystal > 0);
  if (!front.length) return;
  const fx = front.reduce((s, u) => s + u.x, 0) / front.length, fy = front.reduce((s, u) => s + u.y, 0) / front.length;
  const home = w.baseOf(player);
  let bx = fx, by = fy;
  if (home) { const [hx, hy] = centre(home), d = Math.hypot(hx - fx, hy - fy) || 1; bx += ((hx - fx) / d) * 3; by += ((hy - fy) / d) * 3; } // a little behind the line
  const go = bearers.filter((u) => (u.order.kind === 'idle' || u.order.kind === 'move') && (u.x - bx) ** 2 + (u.y - by) ** 2 > 16).map((u) => u.id);
  if (go.length) t.out.push({ type: 'move', units: go, x: bx, y: by });
}

/** Tamers: once there's a pen, feed passive game nearby into a herd and keep the herd in the pen. */
export function useHerds(t: AiTurn): void {
  const { w, player } = t;
  const pen = t.buildings.find((b) => b.complete && b.spec.pen);
  if (!pen || !w.specOf(player, t.faction.workerId)?.spec.tamer) return;
  const [px, py] = centre(pen), r = pen.size / 2 + pen.spec.pen!.radius;
  const herd = [...w.units.values()].filter((u) => u.owner === player && u.tame);
  // stragglers back into the pen
  const stray = herd.filter((u) => u.order.kind === 'idle' && (u.x - px) ** 2 + (u.y - py) ** 2 > (r - 1) ** 2).map((u) => u.id);
  if (stray.length) t.out.push({ type: 'move', units: stray, x: px + 1.5, y: py });
  if (herd.length >= 8 || t.workers.some((u) => u.order.kind === 'tame')) return; // one tamer at a time
  let game: Unit | null = null, gameD = 18 * 18;
  for (const a of w.units.values()) {
    if (a.wild !== 'passive' || w.vision(player, a.x, a.y) !== 2) continue; // only game we can see
    const d = (a.x - px) ** 2 + (a.y - py) ** 2;
    if (d < gameD) { gameD = d; game = a; }
  }
  if (!game) return;
  // a worker on its way home with food in its pack feeds it
  const feeder = t.workers.filter((u) => u.food >= 2 && u.order.kind === 'gather')
    .sort((a, b) => ((a.x - game!.x) ** 2 + (a.y - game!.y) ** 2) - ((b.x - game!.x) ** 2 + (b.y - game!.y) ** 2) || a.id - b.id)[0];
  if (feeder) t.out.push({ type: 'tame', units: [feeder.id], target: game.id });
}

/** Conveyor belts: run a belt from the nearest building out to the farthest busy worksite. */
export function useBelts(t: AiTurn, lastLaid: number): number {
  const { w, player } = t;
  const spec = (t.faction.buildings ?? []).find((b) => b.conveyor && !b.unbuildable);
  if (!spec || w.buildBlocker(player, spec.id)) return lastLaid;
  const sites = t.buildings.filter((b) => !b.complete && isUnderfoot(b.spec));
  // keep two workers laying the line, one tile after another
  if (sites.length) {
    const laying = t.workers.filter((u) => u.order.kind === 'build' && sites.some((s) => s.id === (u.order as { site: number }).site)).length;
    if (laying < 2) {
      const s = sites[0];
      const pick = t.closestFree(s.ox, s.oy, 2 - laying);
      if (pick.length) t.out.push({ type: 'construct', units: pick, site: s.id });
    }
    return lastLaid;
  }
  const tiles = t.buildings.filter((b) => b.spec.conveyor).length;
  const cost = w.buildingStatsOf(player, spec.id)!.totalCost;
  if (w.tick - lastLaid < 20 * 45 || tiles >= 60 || w.stockOf(player).wood < cost * 4) return lastLaid;
  const homes = t.buildings.filter((b) => b.complete && !isUnderfoot(b.spec));
  const nearestHome = (x: number, y: number): [Building | null, number] => {
    let best: Building | null = null, bestD = Infinity;
    for (const b of homes) { const [cx, cy] = centre(b), d = Math.hypot(cx - x, cy - y) - b.size / 2; if (d < bestD) { bestD = d; best = b; } }
    return [best, bestD];
  };
  // the farthest busy worksite: two or more workers gathering within 3 tiles, 5+ tiles from any building
  const spots = t.workers.flatMap((u) => (u.order.kind === 'gather' ? [w.nodes.get(u.order.node)] : [])).filter((n) => !!n);
  let site: { x: number; y: number; home: Building } | null = null, farD = 5;
  for (const node of spots) {
    if (spots.filter((m) => (m.x - node.x) ** 2 + (m.y - node.y) ** 2 <= 9).length < 2) continue;
    const [home, d] = nearestHome(node.x, node.y);
    if (!home || d <= farD || nearBelt(w, player, node.x, node.y)) continue;
    farD = d; site = { x: node.x, y: node.y, home };
  }
  if (!site) return lastLaid;
  const line = beltLine(w, site.x, site.y, site.home);
  if (!line || line.length * cost > w.stockOf(player).wood - 40) return w.tick; // try again later
  for (const [x, y] of line) t.out.push({ type: 'build', units: [], specId: spec.id, ox: x, oy: y });
  return w.tick;
}

/** Is there a belt of ours within 3 tiles of (x, y)? */
function nearBelt(w: World, player: number, x: number, y: number): boolean {
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const b = w.underfootAt(Math.floor(x) + dx, Math.floor(y) + dy);
    if (b && b.owner === player && b.spec.conveyor) return true;
  }
  return false;
}

/**
 * Tiles for a belt from beside (x, y) to the edge of `home`, stepping edge to edge
 * (the axis with further to go first). Null if something is in the way.
 */
export function beltLine(w: World, x: number, y: number, home: Building): Array<[number, number]> | null {
  let cx = Math.floor(x), cy = Math.floor(y);
  const touches = (tx: number, ty: number) => {
    const inX = tx >= home.ox && tx < home.ox + home.size, inY = ty >= home.oy && ty < home.oy + home.size;
    return (inX && (ty === home.oy - 1 || ty === home.oy + home.size)) || (inY && (tx === home.ox - 1 || tx === home.ox + home.size));
  };
  const line: Array<[number, number]> = [];
  for (let step = 0; step < 24; step++) {
    if (line.length && touches(cx, cy)) return line;
    // step toward the nearest point of the building's footprint
    const gx = Math.max(home.ox, Math.min(home.ox + home.size - 1, cx)), gy = Math.max(home.oy, Math.min(home.oy + home.size - 1, cy));
    const dx = gx - cx, dy = gy - cy;
    if (Math.abs(dx) >= Math.abs(dy)) cx += Math.sign(dx); else cy += Math.sign(dy);
    if (cx >= home.ox && cx < home.ox + home.size && cy >= home.oy && cy < home.oy + home.size) return line.length ? line : null;
    if (w.placeable(cx, cy, 1)) line.push([cx, cy]);
    else if (line.length) return null; // blocked partway
  }
  return null;
}
