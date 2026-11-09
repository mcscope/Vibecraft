// How the skirmish AI uses data-defined abilities. One small routine per ability,
// each a no-op for factions that don't have it, so any faction that switches an
// ability on gets an opponent that knows what to do with it.
import type { FactionSpec } from '../factions/types';
import type { Command } from '../sim/commands';
import { isUnderfoot } from '../sim/abilities/underfoot';
import { isWall } from '../sim/abilities/wall';
import { piecesFrom } from '../sim/abilities/layDown';
import { foodOwed } from '../sim/abilities/metamorph';
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
  /** Home (the town center, or where a side in the field keeps its parents), and where the enemy is, as far as we know. */
  home?: [number, number] | null;
  toward?: [number, number] | null;
  /** Enemy fighters have come near home lately. */
  raided?: boolean;
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

/**
 * A brood (units that lay young, and young that change into other forms: UnitSpec.spawns, becomes): keep the parents
 * laying (cheap first, the best they can once the economy's going), keep a core of gatherers tending the nest, and
 * change the rest: into more parents (a few: about one per ten young), up a tier, or into the best fighter for the food.
 * A few changes at a time, so the eggs aren't starved. A no-op for a faction without them.
 */
export function useBrood(t: AiTurn, minutes: number): void {
  const { w, player, faction } = t;
  const specs = faction.units ?? [];
  if (!specs.some((u) => u.spawns?.length) || !specs.some((u) => u.becomes?.length)) return;
  const mine = w.unitsOf(player);
  const spec = (id: string) => w.specOf(player, id);
  const parents = mine.filter((u) => spec(u.specId)?.spec.spawns?.length);
  const changers = mine.filter((u) => spec(u.specId)?.spec.becomes?.length && !u.shellOf && spec(u.specId)!.spec.tends);
  const changing = mine.filter((u) => u.order.kind === 'metamorph').length;
  const want = Math.min(18, 3 + Math.floor(minutes)); // gatherers it keeps (food is what a brood grows on)
  // the parents lay: the cheapest while the economy's small, the best they can once it's going; not while more young
  // wait on food than there are hands to bring it. With too few young to tend them, the parents tend them themselves
  const waiting = mine.filter((u) => u.order.kind === 'metamorph' && foodOwed(w, u) > 0.05).length;
  const hands = changers.length + (changers.length < 2 ? parents.length : 0);
  for (const p of parents) {
    const lays = (spec(p.specId)!.spec.spawns ?? []).filter((id) => spec(id));
    const pick = waiting >= Math.max(2, hands) ? null : changers.length < want ? lays[0] : lays[lays.length - 1];
    if (p.autoBrood !== (pick ?? null)) t.out.push({ type: 'autoSpawn', units: [p.id], specId: pick ?? null });
    if (changers.length < 2 && waiting > 0 && p.order.kind !== 'tend' && !p.engage) t.out.push({ type: 'tend', units: [p.id] });
  }
  // the fighters' worth for the food (Lanchester: health × damage a second ÷ cost²)
  const worth = (id: string) => { const s = spec(id)?.stats; return s && s.canAttack ? (s.maxHp * (s.damage / s.cooldown)) / Math.max(1, s.foodCost) ** 2 : 0; };
  let free = Math.max(0, Math.max(2, Math.floor(changers.length / 4)) - changing), spare = changers.length - want;
  for (const u of changers.sort((a, b) => b.food - a.food)) {
    if (free <= 0 || spare <= 0) break;
    if (u.order.kind === 'metamorph' || u.engage) continue;
    const forms = (spec(u.specId)!.spec.becomes ?? []).filter((id) => spec(id));
    const parentForm = forms.find((id) => spec(id)!.spec.spawns?.length);
    const upTier = forms.find((id) => spec(id)!.spec.becomes?.length && spec(id)!.spec.tends);
    const fighters = forms.filter((id) => spec(id)!.stats.canAttack && !spec(id)!.spec.spawns?.length).sort((a, b) => worth(b) - worth(a));
    let into: string | undefined;
    if (parentForm && minutes >= 3 && parents.length < Math.min(3, 1 + Math.floor(changers.length / 10))) into = parentForm; // (a parent is dear: a few, once there's food to feed them)
    else if (upTier && minutes >= 5 && changers.filter((c) => c.specId === u.specId).length > want / 2) into = upTier;
    else into = fighters[0];
    if (!into) continue;
    t.out.push({ type: 'metamorph', units: [u.id], into });
    free--; spare--;
  }
}

/**
 * Bodies that lay themselves down as buildings (UnitSpec.laysDown): a body that becomes a tower (a building with an
 * attack) lays it a few tiles out from home toward the enemy, about one per four minutes from minute six, a few at most;
 * one that becomes a wall, once enemy fighters have come near home, lays a strand across their way in, a few strands at
 * most. Each takes a body we have more than one of, so the work goes on. A no-op for a faction without them.
 */
export function useLayDown(t: AiTurn, minutes: number): void {
  const { w, player, home, toward } = t;
  if (!home || !toward) return;
  const mine = w.unitsOf(player);
  const d = Math.hypot(toward[0] - home[0], toward[1] - home[1]) || 1;
  const ux = (toward[0] - home[0]) / d, uy = (toward[1] - home[1]) / d; // toward the enemy
  // (one lay-down at a time: nothing new while a body is on its way to lay itself down)
  if (mine.some((u) => u.order.kind === 'layDown')) return;
  for (const spec of t.faction.units ?? []) {
    for (const id of spec.laysDown ?? []) {
      const b = w.buildingSpecOf(player, id);
      if (!b || w.buildBlocker(player, id)) continue;
      const layers = mine.filter((u) => u.specId === spec.id && u.order.kind !== 'metamorph' && !u.engage);
      if (layers.length < 2) continue;
      const have = t.buildings.filter((x) => x.specId === id);
      const layer = layers.sort((a, c) => ((a.x - home[0]) ** 2 + (a.y - home[1]) ** 2) - ((c.x - home[0]) ** 2 + (c.y - home[1]) ** 2) || a.id - c.id)[0];
      if (b.attack) {
        if (minutes < 6 || have.length >= Math.min(4, Math.floor((minutes - 2) / 4))) continue;
        // out toward the enemy, fanned to either side of the line, clear of the others
        for (let k = 0; k < 6; k++) {
          const a = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5, r = 6 + b.size;
          const cx = home[0] + (ux * Math.cos(a) - uy * Math.sin(a)) * r, cy = home[1] + (uy * Math.cos(a) + ux * Math.sin(a)) * r;
          if (have.some((x) => Math.hypot(x.ox + x.size / 2 - cx, x.oy + x.size / 2 - cy) < 4)) continue;
          const spot = w.findBuildSpot(b.size, cx, cy, 3);
          if (spot) { t.out.push({ type: 'build', units: [layer.id], specId: id, ox: spot[0], oy: spot[1] }); return; }
        }
      } else if (isWall(b) && t.raided) {
        const n = piecesFrom(layer.stats.mass, b);
        if (have.length >= 3 * n) continue;
        // a strand across the way in, the next one further out
        const r = 8 + 3 * Math.floor(have.length / n), cx = home[0] + ux * r, cy = home[1] + uy * r;
        const tiles: Array<[number, number]> = [];
        for (let k = 0; k < n; k++) {
          const off = k - (n - 1) / 2, x = Math.floor(cx - uy * off), y = Math.floor(cy + ux * off);
          if (w.placeable(x, y, 1) && !tiles.some(([p, q]) => p === x && q === y)) tiles.push([x, y]);
        }
        if (tiles.length < Math.ceil(n / 2)) continue;
        tiles.forEach(([x, y], k) => t.out.push({ type: 'build', units: [layer.id], specId: id, ox: x, oy: y, ...(k ? { queue: true } : {}) }));
        return;
      }
    }
  }
}

/**
 * Tree digestion (UnitSpec.digestsTrees): when the food we can see near home runs low, one body that digests trees, of
 * several, turns the nearest tree into food (a tree's wood is worth more food than the small body it costs). One at a
 * time. A no-op for a faction without it.
 */
export function useDigest(t: AiTurn): void {
  const { w, player, home } = t;
  if (!home) return;
  const mine = w.unitsOf(player);
  const eaters = mine.filter((u) => w.specOf(player, u.specId)?.spec.digestsTrees && u.order.kind !== 'metamorph' && !u.engage);
  if (eaters.length < 3 || mine.some((u) => u.order.kind === 'digest')) return;
  let food = 0, tree: { id: number; d: number } | null = null;
  for (const n of w.nodes.values()) {
    if (n.shard || n.amount <= 0 || w.vision(player, n.x, n.y) === 0) continue;
    const d = Math.hypot(n.x - home[0], n.y - home[1]);
    if (n.type === 'food' && d < 20) food += n.amount;
    if (n.type === 'wood' && n.tree !== false && d < 25 && (!tree || d < tree.d)) tree = { id: n.id, d };
  }
  if (food >= 150 * Math.max(1, eaters.length / 4) || !tree) return;
  const n = w.nodes.get(tree.id)!;
  const eater = eaters.sort((a, b) => ((a.x - n.x) ** 2 + (a.y - n.y) ** 2) - ((b.x - n.x) ** 2 + (b.y - n.y) ** 2) || a.id - b.id)[0];
  t.out.push({ type: 'digest', units: [eater.id], node: tree.id, one: true });
}
