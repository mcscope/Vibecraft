// Pitched Battle (?mode=battle): two drafted armies on a battle map (sim/battleMaps.ts). No economy and no
// production: each side spends a food budget on units, deploys them in its own zone, and the battle runs until one
// army is gone. Everything here is plain data and deterministic, so an online version can send armies and
// deployments as data.
import type { FactionSpec, UnitSpec } from '../factions/types';
import { derive } from './physics';
import { battleMap, inZone, zoneCenter } from './battleMaps';
import type { Scenario } from './scenarios';
import { TICK_RATE, type World } from './world';
import type { Command } from './commands';

/** An army: how many of each unit. */
export type Army = Record<string, number>;
/** A block of one unit type, deployed around (x, y). */
export interface Block { specId: string; n: number; x: number; y: number }

/** The units a side can draft: anything that fights (workers too), but no carts or bearers. */
export const draftable = (f: FactionSpec): UnitSpec[] => {
  const trained = new Set((f.buildings ?? []).flatMap((b) => b.trains ?? []));
  return f.units.filter((u) => u.attack && trained.has(u.id) && u.id !== f.carterId && u.role !== 'carter' && !u.bearer);
};

export const unitCost = (u: UnitSpec): number => derive(u).foodCost;
export const armyCost = (f: FactionSpec, army: Army): number =>
  Object.entries(army).reduce((t, [id, n]) => t + n * unitCost(f.units.find((u) => u.id === id)!), 0);

/**
 * The computer's draft: a front line (strikers), shooters behind it (throwers) and heavy bodies (over 150 kg) as
 * a hammer, roughly 45 / 30 / 25 of the budget, then whatever's left on the cheapest unit.
 */
export function aiDraft(f: FactionSpec, budget: number): Army {
  const units = draftable(f), army: Army = {};
  const heavy = units.filter((u) => u.mass > 150);
  const shooters = units.filter((u) => u.attack?.style === 'throw' && u.mass <= 150);
  const front = units.filter((u) => u.attack?.style === 'strike' && u.mass <= 150 && u.id !== f.workerId);
  let left = budget;
  // within a role, buy one of each in turn while its share lasts (a big unit can take a whole share)
  const buy = (pool: UnitSpec[], share: number) => {
    let money = budget * share;
    for (let bought = true; bought; ) {
      bought = false;
      for (const u of pool) if (unitCost(u) <= money && unitCost(u) <= left) { army[u.id] = (army[u.id] ?? 0) + 1; money -= unitCost(u); left -= unitCost(u); bought = true; }
    }
  };
  buy(front, 0.45); buy(shooters, 0.3); buy(heavy, 0.25);
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
  rows.forEach((us, r) => us.forEach((u, i) => {
    const across = r === 2 ? (i % 2 ? 1 : -1) * (11 + Math.floor(i / 2) * 4) : (i - (us.length - 1) / 2) * 7;
    const along = r === 0 ? 4 : r === 1 ? -1 : 1;
    blocks.push({ specId: u.id, n: army[u.id], x: cx + along * toward, y: cy + across });
  }));
  return blocks;
}

/** Put a block's units in ranks around (x, y), within the owner's zone; returns their ids. */
export function placeBlock(w: World, owner: number, b: Block, ids?: number[]): number[] {
  const s = w.specOf(owner, b.specId);
  if (!s) return [];
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

/** The battle: a battle map, both armies in their deployments; a side with nothing left loses. */
export function pitchedBattle(mapId: string, deployments: [Block[], Block[]]): Scenario {
  return {
    id: 'pitched-battle',
    victory: true,
    wildlife: false,
    map: (seed) => battleMap(mapId).generate(seed),
    setup(w) { deployments.forEach((blocks, owner) => blocks.forEach((b) => placeBlock(w, owner, b))); },
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
