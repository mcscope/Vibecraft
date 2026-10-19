// Pitched Battle (?mode=battle): two drafted armies on a battle map (sim/battleMaps.ts). No economy and no
// production: each side spends a food budget on units, deploys them in its own zone, and the battle runs until one
// army is gone. Everything here is plain data and deterministic, so an online version can send armies and
// deployments as data.
import type { BuildingSpec, FactionSpec, UnitSpec } from '../factions/types';
import { derive } from './physics';
import { isUnderfoot } from './abilities/underfoot';
import { battleMap, inZone, zoneCenter } from './battleMaps';
import type { Scenario } from './scenarios';
import { TICK_RATE, type World } from './world';
import type { Command } from './commands';

/** An army: how many of each unit (and of the supply camp, by its building id). */
export type Army = Record<string, number>;
/** A block of one unit type, deployed around (x, y). */
export interface Block { specId: string; n: number; x: number; y: number }

/** The units a side can draft: anything that fights (workers too), but no carts or bearers. */
export const draftable = (f: FactionSpec): UnitSpec[] => {
  const trained = new Set((f.buildings ?? []).flatMap((b) => b.trains ?? []));
  return f.units.filter((u) => u.attack && trained.has(u.id) && u.id !== f.carterId && u.role !== 'carter' && !u.bearer);
};

/** What a supply camp holds: food for the hungry and crystal for throwers to restock from. */
export const CAMP_STOCK = { food: 100, crystal: 100 };

/**
 * The supply camp a side can bring: its cheapest plain building (no tower, wall, carts, sowing or roadway),
 * stocked with CAMP_STOCK. (Nothing trains in a battle, so what else the building does doesn't matter.)
 */
export const supplyCamp = (f: FactionSpec): BuildingSpec | undefined =>
  (f.buildings ?? []).filter((b) => !b.unbuildable && !b.attack && !b.wall && !b.living && !b.sow && !b.carters && !isUnderfoot(b))
    .sort((a, b) => a.materials - b.materials)[0];

export const unitCost = (u: UnitSpec): number => derive(u).foodCost;
/** A camp costs its materials plus its stock. */
export const campCost = (b: BuildingSpec): number => b.materials + CAMP_STOCK.food + CAMP_STOCK.crystal;
export const armyCost = (f: FactionSpec, army: Army): number =>
  Object.entries(army).reduce((t, [id, n]) => {
    const u = f.units.find((x) => x.id === id);
    return t + n * (u ? unitCost(u) : campCost(f.buildings!.find((b) => b.id === id)!));
  }, 0);

/**
 * The computer's draft: a front line (strikers), shooters behind it (throwers) and heavy bodies (over 150 kg) as
 * a hammer, roughly 45 / 30 / 25 of the budget, then whatever's left on the cheapest unit. With shooters and
 * the money for it, a supply camp too (out of the shooters' share), for them to restock from.
 */
export function aiDraft(f: FactionSpec, budget: number): Army {
  const units = draftable(f), army: Army = {};
  const camp = supplyCamp(f);
  const heavy = units.filter((u) => u.mass > 150);
  const shooters = units.filter((u) => u.attack?.style === 'throw' && u.mass <= 150);
  const front = units.filter((u) => u.attack?.style === 'strike' && u.mass <= 150 && u.id !== f.workerId);
  let left = budget;
  // the camp comes out of the shooters' share (it's their ammunition)
  const withCamp = !!camp && shooters.length > 0 && campCost(camp) <= budget * 0.2;
  if (withCamp) { army[camp.id] = 1; left -= campCost(camp); }
  // within a role, buy one of each in turn while its share lasts (a big unit can take a whole share)
  const buy = (pool: UnitSpec[], share: number) => {
    let money = budget * share;
    for (let bought = true; bought; ) {
      bought = false;
      for (const u of pool) if (unitCost(u) <= money && unitCost(u) <= left) { army[u.id] = (army[u.id] ?? 0) + 1; money -= unitCost(u); left -= unitCost(u); bought = true; }
    }
  };
  buy(front, 0.45); buy(shooters, 0.3 - (withCamp ? campCost(camp) / budget : 0)); buy(heavy, 0.25);
  const cheapest = [...units].sort((a, b) => unitCost(a) - unitCost(b))[0];
  if (cheapest) { const n = Math.floor(left / unitCost(cheapest)); if (n > 0) army[cheapest.id] = (army[cheapest.id] ?? 0) + n; }
  return army;
}

/**
 * Standard ranks for `owner` (0 west, 1 east): shafts and other strikers in front, shooters behind, heavy bodies
 * out on the flanks.
 */
export function defaultDeployment(f: FactionSpec, army: Army, owner: number): Block[] {
  const [cx, cy] = zoneCenter(owner), toward = owner === 0 ? 1 : -1;
  const row = (u: UnitSpec) => (u.mass > 150 ? 2 : u.attack?.style === 'throw' ? 1 : 0); // 0 front, 1 back, 2 flanks
  const blocks: Block[] = [];
  const rows: UnitSpec[][] = [[], [], []];
  for (const [id, n] of Object.entries(army)) { const u = f.units.find((x) => x.id === id); if (u && n > 0) rows[row(u)].push(u); }
  // camps at the back, behind the shooters
  const camp = supplyCamp(f);
  if (camp && army[camp.id]) blocks.push({ specId: camp.id, n: army[camp.id], x: cx - 5 * toward, y: cy });
  rows.forEach((us, r) => us.forEach((u, i) => {
    const across = r === 2 ? (i % 2 ? 1 : -1) * (11 + Math.floor(i / 2) * 4) : (i - (us.length - 1) / 2) * 7;
    const along = r === 0 ? 4 : r === 1 ? -1 : 1;
    blocks.push({ specId: u.id, n: army[u.id], x: cx + along * toward, y: cy + across });
  }));
  return blocks;
}

/** Put a block's units in ranks around (x, y), within the owner's zone; returns their ids. Camps go side by side. */
export function placeBlock(w: World, owner: number, b: Block, ids?: number[]): number[] {
  const s = w.specOf(owner, b.specId);
  if (!s) return w.buildingSpecOf(owner, b.specId) ? placeCamps(w, owner, b, ids) : [];
  const gap = s.stats.radius * 2 + 0.35, cols = Math.max(1, Math.ceil(Math.sqrt(b.n * 1.6)));
  const heading = owner === 0 ? 0 : 4;
  const out: number[] = [];
  for (let i = 0; i < b.n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    let x = b.x - (owner === 0 ? r : -r) * gap, y = b.y + (c - (cols - 1) / 2) * gap;
    if (!inZone(owner, x, y)) { x = Math.max(2, Math.min(w.grid.width - 3, x)); y = Math.max(3, Math.min(w.grid.height - 4, y)); }
    const spot = w.grid.nearestOpen(x, y, 4) ?? [x, y];
    const existing = ids?.[i] !== undefined ? w.units.get(ids[i]) : undefined;
    if (existing) { existing.x = existing.px = spot[0]; existing.y = existing.py = spot[1]; out.push(existing.id); }
    else { const u = w.spawnAt(owner, b.specId, spot[0], spot[1], heading); if (u) out.push(u.id); }
  }
  return out;
}

/** Supply camps for a block: pitched side by side around (x, y), each stocked with CAMP_STOCK (a moved one is pitched afresh and keeps its stock). */
function placeCamps(w: World, owner: number, b: Block, ids?: number[]): number[] {
  const size = w.buildingSpecOf(owner, b.specId)!.size, out: number[] = [];
  for (let i = 0; i < b.n; i++) {
    const old = ids?.[i] !== undefined ? w.buildings.get(ids[i]) : undefined;
    if (old) { w.buildings.delete(old.id); for (let y = old.oy; y < old.oy + size; y++) for (let x = old.ox; x < old.ox + size; x++) w.grid.block(x, y, -1); }
    // the nearest free footprint to this camp's spot in the row, inside the zone
    const cx = Math.round(b.x - size / 2), cy = Math.round(b.y - size / 2 + (i - (b.n - 1) / 2) * (size + 1));
    let spot: [number, number] | null = null;
    for (let r = 0; r < 6 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
      const ox = cx + dx, oy = cy + dy;
      if (inZone(owner, ox, oy) && inZone(owner, ox + size - 1, oy + size - 1) && w.placeable(ox, oy, size)) spot = [ox, oy];
    }
    if (!spot && old) spot = [old.ox, old.oy];
    if (!spot) continue;
    const camp = w.addBuilding(owner, b.specId, spot[0], spot[1]);
    if (!camp) continue;
    camp.stock = old ? old.stock : { food: CAMP_STOCK.food, wood: 0, crystal: CAMP_STOCK.crystal };
    out.push(camp.id);
  }
  return out;
}

/** The battle: a battle map, both armies in their deployments; a side with nothing left loses. */
export function pitchedBattle(mapId: string, deployments: [Block[], Block[]]): Scenario {
  return {
    id: 'pitched-battle',
    victory: true,
    wildlife: false,
    noProduction: true,
    map: (seed) => battleMap(mapId).generate(seed),
    setup(w) { deployments.forEach((blocks, owner) => blocks.forEach((b) => placeBlock(w, owner, b))); },
    // an army with no one left standing has lost, whatever camps it still has
    tick(w) {
      if (w.tick % TICK_RATE) return;
      for (const p of w.players) if (!p.neutral && !p.defeated && !w.unitsOf(p.id).some((u) => !u.carter)) p.defeated = true;
    },
  };
}

/**
 * The computer's battle plan: hold its ground for a moment, then advance on the enemy's side of the field,
 * re-ordering idle units toward the nearest enemy it can see (it sees only what its units see).
 */
export class BattleAI {
  started = false;
  constructor(readonly player: number) {}
  poll(w: World): Command[] {
    if (!this.started || w.tick % (TICK_RATE * 3) !== 0) return [];
    const mine = w.unitsOf(this.player).filter((u) => u.order.kind === 'idle');
    if (!mine.length) return [];
    const seen = [...w.units.values()].filter((e) => e.owner !== this.player && !w.players[e.owner]?.neutral && w.vision(this.player, e.x, e.y) === 2);
    const [gx, gy] = seen.length ? [seen.reduce((t, e) => t + e.x, 0) / seen.length, seen.reduce((t, e) => t + e.y, 0) / seen.length] : zoneCenter(1 - this.player);
    return [{ type: 'attackMove', units: mine.map((u) => u.id), x: gx, y: gy }];
  }
}
