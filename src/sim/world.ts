// The deterministic simulation. No DOM, no Math.random, no wall-clock time.
// Given the same seed, factions and command stream, every client computes the
// exact same world. Iteration order is Map insertion order (= id order).

import type { BuildingSpec, FactionSpec, ResourceKind, Stock, TechSpec, UnitSpec } from '../factions/types';
import type { PlayerCommand } from './commands';
import type { Grid } from './map';
import { skirmish, type Scenario } from './scenarios';
import { findPath } from './pathfinding';
import {
  derive, deriveBuilding, loadedSpeed, CAP, K, techCost, techGate, techTime,
  type BuildingStats, type DerivedStats,
} from './physics';

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

export const MAX_QUEUE = 5;
export const MAX_UNITS_PER_PLAYER = 150;
export const TREE_WOOD = 100;
/** What a sown plant grows to, and how many a building keeps going at once. */
export const SOW_YIELD: Record<'food' | 'wood', number> = { food: 200, wood: 100 };
export const SOW_MAX: Record<'food' | 'wood', number> = { food: 6, wood: 8 };
export const RESOURCES: ResourceKind[] = ['food', 'wood', 'crystal'];
/** Carters leave this much at the base so it can keep training workers. */
export const BASE_RESERVE: Stock = { food: 150, wood: 100, crystal: 40 };

export interface PlayerState {
  id: number;
  name: string;
  factionId: string;
  defeated: boolean;
  /** Refinement added to each unit type by researched technologies. */
  refine: Record<string, number>;
  /** Work refinement added by technologies. */
  refineWork: Record<string, number>;
  /** Technologies researched or in progress. */
  techs: string[];
  researched: string[];
}

export type Order =
  | { kind: 'idle' }
  | { kind: 'move'; x: number; y: number }
  | { kind: 'attackMove'; x: number; y: number }
  | { kind: 'attack'; target: number }
  | { kind: 'gather'; node: number; nodeType: ResourceKind; phase: 'toNode' | 'harvest' | 'toDrop'; stopWhenArmed: boolean }
  | { kind: 'resupply'; building: number }
  | { kind: 'give'; to: number }
  | { kind: 'eatPack' }
  /** Carry wood to a construction site: from a stockpile, or straight from a tree. */
  | { kind: 'build'; site: number; phase: 'fetch' | 'chop' | 'deliver'; node: number }
  /**
   * Carter supply loop. `base` is the building whose pool the cart belongs to (it
   * loads there); `home` is where the current load is going. Unpinned carts pick
   * the neediest building on every trip; pinned ones always serve `home`.
   */
  | { kind: 'cart'; base: number; home: number; pinned: boolean; phase: 'load' | 'deliver'; res: ResourceKind };

export type UnitAnim = 'idle' | 'walk' | 'attack' | 'gather' | 'eat' | 'tired';

export interface Unit {
  id: number;
  owner: number;
  specId: string;
  stats: DerivedStats;
  throws: boolean;
  crystalMass: number;
  x: number; y: number;
  px: number; py: number; // previous tick, for render interpolation
  hp: number;
  cal: number;
  exhausted: boolean;
  /** Pack contents (kg). Crystal includes the weapon / ammo loadout. */
  food: number;
  wood: number;
  crystal: number;
  order: Order;
  /** Order to return to after an automatic detour (eating, rearming). */
  resume: Order | null;
  /** Auto-acquired target while idle / attack-moving. */
  engage: number;
  path: Array<[number, number]>;
  goalX: number; goalY: number;
  repathIn: number;
  cooldown: number;
  swing: number; // seconds remaining in attack animation
  anim: UnitAnim;
  animT: number;
  /** Facing octant 0..7 (0 = +x, counting toward +y). Render-only hint. */
  heading: number;
  busy: boolean; // spent calories this tick (no resting)
  stuck: number; // ticks of little progress toward the current goal
  /** Training dummy: inert target. */
  dummy: boolean;
  carter: boolean;
  /** Progress toward the next whole kilogram being gathered. */
  gatherAcc: number;
}

export type QueueItem =
  /** `paid` false: queued but still waiting for this building's stock to cover it. */
  | { kind: 'unit'; specId: string; progress: number; total: number; food: number; crystal: number; home: number; paid: boolean }
  | { kind: 'tech'; techId: string; progress: number; total: number; wood: number };

export interface Building {
  id: number;
  owner: number;
  specId: string;
  spec: BuildingSpec;
  stats: BuildingStats;
  ox: number; oy: number; // top-left tile
  size: number;
  hp: number;
  maxHp: number;
  /** Building resource delivered to the site so far. */
  built: number;
  complete: boolean;
  queue: QueueItem[];
  /** Local cache. Training, research and tower shots draw from here. */
  stock: Stock;
  rallyX: number; rallyY: number;
  cooldown: number;
  /** Unit this building re-queues automatically, if any. */
  autoTrain: string | null;
  /** Resources this building is currently sowing (subset of spec.sow.resources). */
  sowing: Array<'food' | 'wood'>;
  /** kg of planting work accumulated toward the next plant. */
  sowProgress: number;
}

export interface ResourceNode {
  id: number;
  type: ResourceKind;
  x: number; y: number; // center
  amount: number;
  maxAmount: number;
  /** Shards (dropped/thrown crystals) don't block and can be walked over. */
  shard: boolean;
  tree: boolean;
  /** Still growing: kg yet to grow, and kg per second. */
  growLeft?: number;
  growRate?: number;
  /** Building that sowed it. */
  sownBy?: number;
}

export interface Projectile {
  id: number;
  owner: number;
  sx: number; sy: number;
  /** Launch height in metres (towers). */
  sz: number;
  tx: number; ty: number;
  t: number; duration: number;
  damage: number;
  crystalKg: number;
  target: number;
}

export type WorldEvent =
  | { type: 'hit'; x: number; y: number; damage: number; target: number }
  /** A swing or a throw (for sound). specId is absent for towers. */
  | { type: 'attack'; x: number; y: number; owner: number; specId?: string; style: 'strike' | 'throw'; kg: number }
  | { type: 'death'; x: number; y: number; id: number; owner: number; specId: string; heading: number }
  | { type: 'trained'; id: number; owner: number }
  | { type: 'built'; id: number; owner: number }
  | { type: 'researched'; owner: number; techId: string }
  | { type: 'buildingDestroyed'; id: number; owner: number }
  | { type: 'gameOver'; winner: number };

export interface WorldOptions {
  seed: number;
  players: Array<{ name: string; faction: FactionSpec }>;
  /** Map + starting setup + scripted rules. Defaults to a 1v1 skirmish. */
  scenario?: Scenario;
}

const emptyStock = (): Stock => ({ food: 0, wood: 0, crystal: 0 });

export class World {
  tick = 0;
  readonly grid: Grid;
  readonly players: PlayerState[] = [];
  readonly units = new Map<number, Unit>();
  readonly buildings = new Map<number, Building>();
  readonly nodes = new Map<number, ResourceNode>();
  readonly projectiles = new Map<number, Projectile>();
  /** Render-side consumers drain this; the sim never reads it. */
  events: WorldEvent[] = [];
  winner = -1;

  private nextId = 1;
  /** Per player: unit specs with stats including that player's technologies. */
  private readonly unitSpecs = new Map<string, { spec: UnitSpec; stats: DerivedStats }>();
  private readonly buildingStats = new Map<string, BuildingStats>();
  readonly factions = new Map<string, FactionSpec>();
  private pending: PlayerCommand[] = [];

  readonly scenario: Scenario;

  constructor(opts: WorldOptions) {
    this.scenario = opts.scenario ?? skirmish();
    const map = this.scenario.map(opts.seed);
    this.grid = map.grid;
    for (const f of map.features) {
      this.addNode({
        type: f.kind === 'crystal' ? 'crystal' : f.kind === 'tree' ? 'wood' : 'food',
        x: f.x + 0.5, y: f.y + 0.5,
        amount: f.kind === 'tree' ? TREE_WOOD : f.amount,
        shard: false,
        tree: f.kind === 'tree',
      });
    }
    opts.players.forEach((p, i) => {
      this.factions.set(p.faction.id, p.faction);
      this.players.push({ id: i, name: p.name, factionId: p.faction.id, defeated: false, refine: {}, refineWork: {}, techs: [], researched: [] });
      for (const s of p.faction.units) this.unitSpecs.set(`${i}/${s.id}`, { spec: s, stats: derive(s) });
      for (const b of p.faction.buildings ?? []) this.buildingStats.set(`${p.faction.id}/${b.id}`, deriveBuilding(b, p.faction));
    });
    this.scenario.setup(this, map);
  }

  // ───────────────────────────── queries ─────────────────────────────

  specOf(owner: number, specId: string): { spec: UnitSpec; stats: DerivedStats } | undefined {
    return this.unitSpecs.get(`${owner}/${specId}`);
  }
  factionOf(owner: number): FactionSpec {
    return this.factions.get(this.players[owner].factionId)!;
  }
  buildingSpecOf(owner: number, id: string): BuildingSpec | undefined {
    return this.factionOf(owner).buildings?.find((b) => b.id === id);
  }
  buildingStatsOf(owner: number, id: string): BuildingStats | undefined {
    return this.buildingStats.get(`${this.players[owner].factionId}/${id}`);
  }
  techOf(owner: number, id: string): TechSpec | undefined {
    return this.factionOf(owner).techs?.find((t) => t.id === id);
  }
  entityPos(id: number): [number, number] | null {
    const u = this.units.get(id);
    if (u) return [u.x, u.y];
    const b = this.buildings.get(id);
    if (b) return [b.ox + b.size / 2, b.oy + b.size / 2];
    const n = this.nodes.get(id);
    if (n) return [n.x, n.y];
    return null;
  }
  unitsOf(owner: number): Unit[] {
    const out: Unit[] = [];
    for (const u of this.units.values()) if (u.owner === owner) out.push(u);
    return out;
  }
  buildingsOf(owner: number): Building[] {
    const out: Building[] = [];
    for (const b of this.buildings.values()) if (b.owner === owner) out.push(b);
    return out;
  }
  /** The player's base: its town center (or first building) — where carters load. */
  baseOf(owner: number): Building | undefined {
    const tcId = this.factionOf(owner).townCenterId;
    let first: Building | undefined;
    for (const b of this.buildings.values()) {
      if (b.owner !== owner || !b.complete) continue;
      if (b.specId === tcId) return b;
      first ??= b;
    }
    return first;
  }
  /** Sum of every cache the player owns. */
  stockOf(owner: number): Stock {
    const s = emptyStock();
    for (const b of this.buildings.values()) if (b.owner === owner && b.complete) for (const r of RESOURCES) s[r] += b.stock[r];
    return s;
  }
  stored(b: Building): number { return b.stock.food + b.stock.wood + b.stock.crystal; }
  room(b: Building): number { return b.complete ? Math.max(0, b.stats.cacheCap - this.stored(b)) : 0; }
  packLoad(u: Unit): number { return u.food + u.wood + u.crystal; }
  freeCapacity(u: Unit): number { return Math.max(0, u.stats.carryCapacity - this.packLoad(u)); }
  armed(u: Unit): boolean { return u.stats.canAttack && u.crystal >= u.crystalMass - 1e-6; }
  surplusCrystal(u: Unit): number { return Math.max(0, u.crystal - u.stats.loadoutCrystal); }

  /** Current refinement of a unit type for a player (design + techs). */
  refinementOf(owner: number, unitId: string, channel: 'combat' | 'work' = 'combat'): number {
    const s = this.specOf(owner, unitId);
    const p = this.players[owner];
    return channel === 'work'
      ? (s?.spec.workRefinement ?? 1) + (p.refineWork[unitId] ?? 0)
      : (s?.spec.refinement ?? 1) + (p.refine[unitId] ?? 0);
  }

  /** Best gather-rate boost a player's infrastructure gives at a spot, for a resource. */
  gatherBoostAt(owner: number, x: number, y: number, res: ResourceKind): number {
    let best = 1;
    for (const b of this.buildings.values()) {
      const gb = b.spec.gatherBoost;
      if (b.owner !== owner || !b.complete || !gb || !gb.resources.includes(res)) continue;
      const r = gb.radius + b.size / 2;
      if ((b.ox + b.size / 2 - x) ** 2 + (b.oy + b.size / 2 - y) ** 2 <= r * r) best = Math.max(best, b.stats.gatherBoost);
    }
    return best;
  }

  /** Why a player can't place this building right now, or null if they can. */
  buildBlocker(owner: number, specId: string): string | null {
    const spec = this.buildingSpecOf(owner, specId);
    if (!spec) return 'unknown building';
    if (spec.unbuildable) return 'cannot be built';
    for (const req of spec.requires ?? []) {
      if (!this.buildingsOf(owner).some((b) => b.specId === req && b.complete)) return `needs ${this.buildingSpecOf(owner, req)?.name ?? req}`;
    }
    return null;
  }

  /** Is a size×size footprint at (ox,oy) free to build on? */
  placeable(ox: number, oy: number, size: number): boolean {
    if (ox < 1 || oy < 1 || ox + size > this.grid.width - 1 || oy + size > this.grid.height - 1) return false;
    for (let y = oy; y < oy + size; y++) for (let x = ox; x < ox + size; x++) if (this.grid.isBlocked(x, y)) return false;
    return true;
  }

  /** Nearest placeable spot (with a 1-tile margin) around (cx,cy), deterministic. */
  findBuildSpot(size: number, cx: number, cy: number, maxR = 16): [number, number] | null {
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const ox = Math.round(cx - size / 2) + dx, oy = Math.round(cy - size / 2) + dy;
        if (this.placeable(ox - 1, oy - 1, size + 2)) return [ox, oy];
      }
    }
    return null;
  }

  /** What a technology would cost a player right now, and whether a building can research it. */
  techStatus(owner: number, techId: string, b?: Building): { cost: number; gate: number; blocker: string | null } {
    const t = this.techOf(owner, techId);
    if (!t) return { cost: 0, gate: 0, blocker: 'unknown tech' };
    const p = this.players[owner];
    const from = this.refinementOf(owner, t.unit, t.channel ?? 'combat');
    const cost = techCost(from, t.refinement), gate = techGate(from, t.refinement);
    let blocker: string | null = null;
    if (p.researched.includes(techId)) blocker = 'researched';
    else if (p.techs.includes(techId)) blocker = 'researching';
    else {
      const earlier = (this.factionOf(owner).techs ?? []).slice(0, (this.factionOf(owner).techs ?? []).indexOf(t)).filter((x) => x.unit === t.unit);
      const missing = earlier.find((x) => !p.researched.includes(x.id));
      if (missing) blocker = `needs ${missing.name}`;
      else if (b && b.stats.effectiveCapital < gate - 1e-6) blocker = `needs ${Math.ceil(gate)} capital`;
    }
    return { cost, gate, blocker };
  }

  /** Stock a building wants kept on hand (carters fill up to this). */
  supplyTargets(b: Building): Stock {
    const t = emptyStock();
    if (!b.complete) return t;
    for (const id of b.spec.trains ?? []) {
      const s = this.specOf(b.owner, id);
      if (!s) continue;
      // enough for the next unit, plus a little for crews/visitors to eat
      t.food = Math.max(t.food, s.stats.foodCost + 20);
      t.crystal = Math.max(t.crystal, s.stats.crystalCost + 10);
    }
    // orders waiting for stock come first
    let waitFood = 0, waitCrystal = 0;
    for (const q of b.queue) if (q.kind === 'unit' && !q.paid) { waitFood += q.food; waitCrystal += q.crystal; }
    if (waitFood || waitCrystal) { t.food = Math.max(t.food, waitFood + 20); t.crystal = Math.max(t.crystal, waitCrystal + 5); }
    const tw = b.stats.tower;
    if (tw && b.spec.attack) {
      t.food = Math.max(t.food, 30 * tw.foodPerShot + 10);
      t.crystal = Math.max(t.crystal, 12 * b.spec.attack.crystalMass);
    }
    for (const id of b.spec.researches ?? []) {
      const st = this.techStatus(b.owner, id, b);
      if (!st.blocker) t.wood = Math.max(t.wood, st.cost);
    }
    // never ask for more than the cache can hold
    const total = t.food + t.wood + t.crystal;
    if (total > b.stats.cacheCap) for (const r of RESOURCES) t[r] *= b.stats.cacheCap / total;
    return t;
  }

  // ───────────────────────────── commands ─────────────────────────────

  /** Queue a command for execution at the start of the next tick. */
  enqueue(pc: PlayerCommand): void {
    this.pending.push(pc);
  }

  private apply({ player, cmd }: PlayerCommand): void {
    if (this.players[player]?.defeated) return;
    const mineAll = (ids: number[]) => ids.map((id) => this.units.get(id)).filter((u): u is Unit => !!u && u.owner === player);
    const mine = (ids: number[]) => mineAll(ids).filter((u) => !u.carter);
    const set = (units: Unit[], order: Order) => {
      for (const u of units) { u.order = { ...order } as Order; u.resume = null; u.engage = 0; u.path = []; u.repathIn = 0; }
    };
    const ownBuilding = (id: number) => { const b = this.buildings.get(id); return b && b.owner === player ? b : undefined; };
    switch (cmd.type) {
      case 'move': return set(mineAll(cmd.units), { kind: 'move', x: cmd.x, y: cmd.y });
      case 'attackMove': return set(mine(cmd.units), { kind: 'attackMove', x: cmd.x, y: cmd.y });
      case 'attack': {
        const tgt = this.units.get(cmd.target) ?? this.buildings.get(cmd.target);
        if (!tgt || tgt.owner === player) return;
        return set(mine(cmd.units), { kind: 'attack', target: cmd.target });
      }
      case 'gather': {
        const n = this.nodes.get(cmd.node);
        if (!n) return;
        for (const u of mine(cmd.units)) {
          if (u.stats.gatherRate <= 0) continue;
          set([u], { kind: 'gather', node: n.id, nodeType: n.type, phase: 'toNode', stopWhenArmed: false });
        }
        return;
      }
      case 'resupply': {
        const b = ownBuilding(cmd.building);
        if (!b || !b.complete) return;
        for (const u of mine(cmd.units)) {
          // Remember what to go back to: an explicit destination, the unit's
          // ongoing job, or simply the spot it was standing on.
          const prev = u.order.kind === 'resupply' ? u.resume : u.order;
          let back: Order;
          if (cmd.thenX !== undefined && cmd.thenY !== undefined) back = { kind: 'move', x: cmd.thenX, y: cmd.thenY };
          else if (prev && (prev.kind === 'gather' || prev.kind === 'attackMove' || prev.kind === 'move' || prev.kind === 'attack' || prev.kind === 'build')) back = prev;
          else back = { kind: 'move', x: u.x, y: u.y };
          if (back.kind === 'gather') back = { ...back, phase: 'toNode' };
          set([u], { kind: 'resupply', building: b.id });
          u.resume = back;
        }
        return;
      }
      case 'give': {
        const to = this.units.get(cmd.to);
        if (!to || to.owner !== player) return;
        return set(mine(cmd.units).filter((u) => u.id !== to.id), { kind: 'give', to: to.id });
      }
      case 'stop': return set(mineAll(cmd.units), { kind: 'idle' });
      case 'train': {
        const b = ownBuilding(cmd.building);
        const s = this.specOf(player, cmd.specId);
        if (!b || !b.complete || !s || b.queue.length >= MAX_QUEUE || !b.spec.trains?.includes(cmd.specId)) return;
        // Always queue; it's paid from this building's stock when it reaches the front and the stock covers it.
        b.queue.push({ kind: 'unit', specId: cmd.specId, progress: 0, total: s.stats.trainTime, food: s.stats.foodCost, crystal: s.stats.crystalCost, home: 0, paid: false });
        return;
      }
      case 'setSowing': {
        const b = ownBuilding(cmd.building);
        if (!b || !b.spec.sow) return;
        b.sowing = cmd.resources.filter((r) => b.spec.sow!.resources.includes(r));
        return;
      }
      case 'autoTrain': {
        const b = ownBuilding(cmd.building);
        if (!b || (cmd.specId && !b.spec.trains?.includes(cmd.specId))) return;
        b.autoTrain = cmd.specId;
        return;
      }
      case 'research': {
        const b = ownBuilding(cmd.building);
        if (!b || !b.complete || b.queue.length >= MAX_QUEUE || !b.spec.researches?.includes(cmd.techId)) return;
        const st = this.techStatus(player, cmd.techId, b);
        if (st.blocker || b.stock.wood < st.cost) return;
        b.stock.wood -= st.cost;
        this.players[player].techs.push(cmd.techId);
        b.queue.push({ kind: 'tech', techId: cmd.techId, progress: 0, total: techTime(st.cost), wood: st.cost });
        return;
      }
      case 'cancelTrain': {
        const b = ownBuilding(cmd.building);
        if (!b || b.queue.length === 0) return;
        const item = b.queue.pop()!;
        if (item.kind === 'unit') { if (item.paid) { b.stock.food += item.food; b.stock.crystal += item.crystal; } }
        else {
          b.stock.wood += item.wood;
          const p = this.players[player];
          p.techs = p.techs.filter((t) => t !== item.techId);
        }
        return;
      }
      case 'rally': {
        const b = ownBuilding(cmd.building);
        if (!b) return;
        b.rallyX = cmd.x; b.rallyY = cmd.y;
        return;
      }
      case 'build': {
        if (this.buildBlocker(player, cmd.specId)) return;
        const spec = this.buildingSpecOf(player, cmd.specId)!;
        const ox = Math.floor(cmd.ox), oy = Math.floor(cmd.oy);
        if (!this.placeable(ox, oy, spec.size)) return;
        const site = this.addBuilding(player, cmd.specId, ox, oy, false);
        if (site) set(mine(cmd.units).filter((u) => u.stats.gatherRate > 0), { kind: 'build', site: site.id, phase: 'fetch', node: 0 });
        return;
      }
      case 'assignCart': {
        const b = ownBuilding(cmd.building);
        if (!b) return;
        for (const id of cmd.units) {
          const u = this.units.get(id);
          if (u && u.owner === player && u.carter) {
            const base = this.nearestProducer(u) ?? this.baseOf(player);
            u.order = { kind: 'cart', base: base?.id ?? b.id, home: b.id, pinned: true, phase: 'load', res: 'food' };
            u.path = [];
          }
        }
        return;
      }
      case 'construct': {
        const site = ownBuilding(cmd.site);
        if (!site || site.complete) return;
        return set(mine(cmd.units).filter((u) => u.stats.gatherRate > 0), { kind: 'build', site: site.id, phase: 'fetch', node: 0 });
      }
    }
  }

  // ───────────────────────────── spawning ─────────────────────────────

  addNode(n: Omit<ResourceNode, 'id' | 'maxAmount'>): ResourceNode {
    const node: ResourceNode = { ...n, id: this.nextId++, maxAmount: n.amount };
    this.nodes.set(node.id, node);
    if (!node.shard) this.grid.block(node.x, node.y, 1);
    return node;
  }

  /** Place a building (scenario setup) or a construction site (`complete` = false). */
  addBuilding(owner: number, specId: string, ox: number, oy: number, complete = true): Building | null {
    const spec = this.buildingSpecOf(owner, specId);
    const stats = this.buildingStatsOf(owner, specId);
    if (!spec || !stats) return null;
    const size = spec.size;
    const b: Building = {
      id: this.nextId++, owner, specId, spec, stats, ox, oy, size,
      hp: complete ? stats.maxHp : 1, maxHp: stats.maxHp,
      built: complete ? stats.totalCost : 0, complete,
      queue: [], stock: emptyStock(),
      rallyX: ox + size + 1, rallyY: oy + size + 1, cooldown: 0, autoTrain: null,
      sowing: [...(spec.sow?.resources ?? [])], sowProgress: 0,
    };
    this.buildings.set(b.id, b);
    for (let y = oy; y < oy + size; y++) for (let x = ox; x < ox + size; x++) this.grid.block(x, y, 1);
    // nudge anyone standing on the new footprint out of it
    for (const u of this.units.values()) {
      if (u.x >= ox && u.x < ox + size && u.y >= oy && u.y < oy + size) {
        const p = this.grid.nearestOpen(u.x, u.y, size + 3);
        if (p) { u.x = u.px = p[0]; u.y = u.py = p[1]; u.path = []; }
      }
    }
    return b;
  }

  /** Place a unit at a position (scenario setup / scripting). */
  spawnAt(owner: number, specId: string, x: number, y: number, heading = 1): Unit | null {
    const s = this.specOf(owner, specId);
    if (!s) return null;
    const pos = this.grid.nearestOpen(x, y) ?? [x, y];
    const u = this.makeUnit(owner, specId, pos[0], pos[1]);
    u.heading = heading;
    return u;
  }

  /** Spawn a unit from a building's queue (or a scenario's starting units). */
  spawnUnit(owner: number, specId: string, from: Building): Unit | null {
    const s = this.specOf(owner, specId);
    if (!s) return null;
    const cx = from.ox + from.size / 2, cy = from.oy + from.size / 2;
    // spawn on the side facing the rally point
    const dx = from.rallyX - cx, dy = from.rallyY - cy;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const pos = this.grid.nearestOpen(cx + (dx / d) * (from.size / 2 + 0.7), cy + (dy / d) * (from.size / 2 + 0.7)) ?? [cx + 2.5, cy + 2.5];
    const u = this.makeUnit(owner, specId, pos[0], pos[1]);
    const rx = from.rallyX, ry = from.rallyY;
    if (!u.carter && Math.abs(rx - u.x) + Math.abs(ry - u.y) > 1.5) u.order = { kind: 'move', x: rx, y: ry };
    return u;
  }

  private makeUnit(owner: number, specId: string, x: number, y: number): Unit {
    const s = this.specOf(owner, specId)!;
    const spec = s.spec;
    const u: Unit = {
      id: this.nextId++, owner, specId, stats: s.stats,
      throws: s.stats.canAttack && spec.attack?.style === 'throw',
      crystalMass: s.stats.canAttack ? Math.min(s.stats.carryCapacity, spec.attack!.crystalMass) : 0,
      x, y, px: x, py: y,
      hp: s.stats.maxHp, cal: s.stats.maxCalories, exhausted: false,
      food: 0, wood: 0, crystal: s.stats.loadoutCrystal,
      order: { kind: 'idle' }, resume: null, engage: 0,
      path: [], goalX: x, goalY: y, repathIn: 0,
      cooldown: 0, swing: 0, anim: 'idle', animT: 0, heading: 1, busy: false, stuck: 0,
      dummy: !!spec.dummy,
      carter: spec.role === 'carter',
      gatherAcc: 0,
    };
    this.units.set(u.id, u);
    return u;
  }

  /** Re-derive a unit type's stats after a technology; existing units keep their HP fraction. */
  private refreshStats(owner: number, unitId: string): void {
    const s = this.specOf(owner, unitId);
    if (!s) return;
    const stats = derive(s.spec, this.players[owner].refine[unitId] ?? 0, this.players[owner].refineWork[unitId] ?? 0);
    this.unitSpecs.set(`${owner}/${unitId}`, { spec: s.spec, stats });
    for (const u of this.units.values()) {
      if (u.owner !== owner || u.specId !== unitId) continue;
      u.hp *= stats.maxHp / u.stats.maxHp;
      u.stats = stats;
    }
  }

  private dropShard(x: number, y: number, kg: number): void {
    if (kg <= 0.01) return;
    for (const n of this.nodes.values()) {
      if (n.shard && (n.x - x) ** 2 + (n.y - y) ** 2 < 0.36) {
        n.amount += kg; n.maxAmount = Math.max(n.maxAmount, n.amount);
        return;
      }
    }
    const p = this.grid.isBlocked(x, y) ? this.grid.nearestOpen(x, y, 3) : [x, y];
    if (!p) return;
    this.addNode({ type: 'crystal', x: p[0], y: p[1], amount: kg, shard: true, tree: false });
  }

  // ───────────────────────────── tick ─────────────────────────────

  step(commands: PlayerCommand[] = []): void {
    if (this.winner >= 0) return;
    for (const c of this.pending) this.apply(c);
    this.pending = [];
    for (const c of commands) this.apply(c);

    for (const b of this.buildings.values()) this.tickBuilding(b);
    for (const u of this.units.values()) { u.px = u.x; u.py = u.y; u.busy = false; }
    for (const u of this.units.values()) this.tickUnit(u);
    this.separate();
    for (const p of this.projectiles.values()) this.tickProjectile(p);
    for (const n of this.nodes.values()) {
      if (!n.growLeft) continue;
      const g = Math.min(n.growLeft, (n.growRate ?? 0) * DT);
      n.amount += g;
      n.growLeft -= g;
    }
    this.reap();
    this.scenario.tick?.(this);
    this.tick++;
  }

  private tickBuilding(b: Building): void {
    if (!b.complete) return;
    if (b.autoTrain && b.queue.length === 0) {
      const s = this.specOf(b.owner, b.autoTrain);
      if (s && this.unitsOf(b.owner).length < MAX_UNITS_PER_PLAYER) {
        b.queue.push({ kind: 'unit', specId: b.autoTrain, progress: 0, total: s.stats.trainTime, food: s.stats.foodCost, crystal: s.stats.crystalCost, home: 0, paid: false });
      }
    }
    const item = b.queue[0];
    if (item && item.kind === 'unit' && !item.paid && b.stock.food >= item.food - 1e-6 && b.stock.crystal >= item.crystal - 1e-6) {
      b.stock.food -= item.food;
      b.stock.crystal -= item.crystal;
      item.paid = true;
    }
    if (item) {
      const waiting = item.kind === 'unit' && !item.paid;
      const capped = item.kind === 'unit' && this.unitsOf(b.owner).length >= MAX_UNITS_PER_PLAYER;
      if (!capped && !waiting) item.progress += DT;
      if (item.progress >= item.total) {
        b.queue.shift();
        if (item.kind === 'unit') {
          const u = this.spawnUnit(b.owner, item.specId, b);
          if (u) {
            if (u.carter && item.home) u.order = { kind: 'cart', base: item.home, home: 0, pinned: false, phase: 'load', res: 'food' };
            this.events.push({ type: 'trained', id: u.id, owner: u.owner });
          }
        } else {
          const t = this.techOf(b.owner, item.techId);
          const p = this.players[b.owner];
          if (t) {
            const ch = t.channel === 'work' ? p.refineWork : p.refine;
            ch[t.unit] = (ch[t.unit] ?? 0) + t.refinement;
            p.researched.push(t.id);
            this.refreshStats(b.owner, t.unit);
            this.events.push({ type: 'researched', owner: b.owner, techId: t.id });
          }
        }
      }
    }
    if (b.spec.attack) this.tickTower(b);
    if (b.spec.sow) this.tickSow(b);
    if ((this.tick + b.id) % 40 === 0) this.requestCarters(b);
  }

  /** Carts in a producer building's pool, counting ones queued there. */
  private poolSize(b: Building): number {
    let n = 0;
    for (const u of this.units.values()) if (u.carter && u.owner === b.owner && u.order.kind === 'cart' && u.order.base === b.id) n++;
    for (const q of b.queue) if (q.kind === 'unit' && q.home === b.id) n++;
    return n;
  }

  /** Carts currently heading to (or pinned to) a building. */
  cartsServing(b: Building): number {
    let n = 0;
    for (const u of this.units.values()) if (u.carter && u.order.kind === 'cart' && u.order.home === b.id) n++;
    return n;
  }

  /** Nearest building that keeps a cart pool. */
  private nearestProducer(u: Unit): Building | null {
    return this.nearestCache(u, (b) => (b.spec.carters ?? 0) > 0);
  }

  /** An unassigned cart joins the nearest producer's pool. */
  private autoAssignCart(u: Unit): void {
    const p = this.nearestProducer(u);
    u.order = p ? { kind: 'cart', base: p.id, home: 0, pinned: false, phase: 'load', res: 'food' } : { kind: 'idle' };
    u.path = [];
  }

  /** Producer buildings (e.g. the town center) keep their cart pool topped up. */
  private requestCarters(b: Building): void {
    const want = b.spec.carters ?? 0;
    const carterId = this.factionOf(b.owner).carterId;
    if (!want || !carterId || this.poolSize(b) >= want) return;
    // an idle cart joins before we pay for a new one
    for (const u of this.units.values()) {
      if (u.carter && u.owner === b.owner && u.order.kind === 'idle') { u.order = { kind: 'cart', base: b.id, home: 0, pinned: false, phase: 'load', res: 'food' }; u.path = []; return; }
    }
    const s = this.specOf(b.owner, carterId);
    if (!s || b.queue.length >= MAX_QUEUE) return;
    if (b.stock.food < s.stats.foodCost || b.stock.crystal < s.stats.crystalCost) return;
    b.stock.food -= s.stats.foodCost;
    b.stock.crystal -= s.stats.crystalCost;
    b.queue.push({ kind: 'unit', specId: carterId, progress: 0, total: s.stats.trainTime, food: s.stats.foodCost, crystal: s.stats.crystalCost, home: b.id, paid: true });
  }

  /**
   * How much of each resource a building is still short of, after subtracting
   * what carts are already bringing it.
   */
  shortfall(b: Building): Stock {
    const out = emptyStock();
    if (!b.complete) {
      out.wood = Math.max(0, b.stats.totalCost - b.built - this.woodInFlight(b));
      return out;
    }
    const target = this.supplyTargets(b);
    const inbound = emptyStock();
    for (const u of this.units.values()) {
      if (!u.carter || u.order.kind !== 'cart' || u.order.home !== b.id || u.order.phase !== 'deliver') continue;
      inbound.food += u.food; inbound.wood += u.wood; inbound.crystal += this.surplusCrystal(u);
    }
    const room = this.room(b);
    for (const r of RESOURCES) out[r] = Math.max(0, Math.min(target[r] - b.stock[r] - inbound[r], room));
    return out;
  }

  /** Sowing: keep the ground around the building planted, paying seed from its own stock. */
  private tickSow(b: Building): void {
    const sow = b.spec.sow!;
    // which enabled resource is furthest below its quota of living plants?
    let res: 'food' | 'wood' | null = null, best = 0;
    for (const r of b.sowing) {
      let n = 0;
      for (const node of this.nodes.values()) if (node.sownBy === b.id && node.type === r) n++;
      const lack = 1 - n / SOW_MAX[r];
      if (lack > best) { best = lack; res = r; }
    }
    if (!res) { b.sowProgress = 0; return; }
    const yieldKg = SOW_YIELD[res];
    if (b.sowProgress < yieldKg) { b.sowProgress += b.stats.sowRate * DT; return; }
    const seed = yieldKg * CAP.sowSeedFraction;
    if (b.stock[res] < seed) return; // waits for seed
    const spot = this.sowSpot(b, sow.radius, res === 'wood' ? 1.0 : 1.5);
    if (!spot) return;
    b.stock[res] -= seed;
    b.sowProgress -= yieldKg;
    const node = this.addNode({ type: res, x: spot[0], y: spot[1], amount: 0, shard: false, tree: res === 'wood' });
    node.maxAmount = yieldKg;
    node.growLeft = yieldKg;
    node.growRate = yieldKg / CAP.sowGrowSec;
    node.sownBy = b.id;
  }

  /** First open tile in rings around a building, clear of buildings, units and (by `gap`) other plants. */
  private sowSpot(b: Building, radius: number, gap: number): [number, number] | null {
    const cx = b.ox + b.size / 2, cy = b.oy + b.size / 2;
    for (let r = Math.ceil(b.size / 2) + 1; r <= radius + b.size / 2; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = Math.floor(cx + dx), ty = Math.floor(cy + dy);
        if (!this.grid.inBounds(tx, ty) || this.grid.isBlocked(tx, ty)) continue;
        const x = tx + 0.5, y = ty + 0.5;
        let ok = true;
        for (const o of this.buildings.values()) if (x > o.ox - 1 && x < o.ox + o.size + 1 && y > o.oy - 1 && y < o.oy + o.size + 1) { ok = false; break; }
        if (ok) for (const n of this.nodes.values()) if (!n.shard && (n.x - x) ** 2 + (n.y - y) ** 2 < gap * gap) { ok = false; break; }
        if (ok) for (const u of this.units.values()) if ((u.x - x) ** 2 + (u.y - y) ** 2 < 0.8) { ok = false; break; }
        if (ok) return [x, y];
      }
    }
    return null;
  }

  /** A tower is a thrower without legs: crew food and crystal ammo come out of its own stock. */
  private tickTower(b: Building): void {
    const tw = b.stats.tower!;
    const atk = b.spec.attack!;
    if (b.cooldown > 0) { b.cooldown -= DT; return; }
    if ((this.tick + b.id) % 4 !== 0) return;
    if (b.stock.crystal < atk.crystalMass || b.stock.food < tw.foodPerShot) return;
    const cx = b.ox + b.size / 2, cy = b.oy + b.size / 2;
    const reach = tw.range + b.size / 2;
    let target: Unit | null = null, bestD = reach * reach;
    for (const u of this.units.values()) {
      if (u.owner === b.owner) continue;
      const d = (u.x - cx) ** 2 + (u.y - cy) ** 2;
      if (d < bestD) { bestD = d; target = u; }
    }
    if (!target) return;
    b.stock.crystal -= atk.crystalMass;
    b.stock.food -= tw.foodPerShot;
    b.cooldown = tw.cooldown;
    this.events.push({ type: 'attack', x: cx, y: cy, owner: b.owner, style: 'throw', kg: atk.crystalMass });
    const dist = Math.sqrt(bestD);
    const flight = Math.max(0.3, dist / (tw.velocity * 0.7));
    const p: Projectile = {
      id: this.nextId++, owner: b.owner, sx: cx, sy: cy, sz: atk.height,
      tx: target.x + ((target.x - target.px) / DT) * flight, ty: target.y + ((target.y - target.py) / DT) * flight,
      t: 0, duration: flight, damage: tw.damage, crystalKg: atk.crystalMass, target: target.id,
    };
    this.projectiles.set(p.id, p);
  }

  private tickUnit(u: Unit): void {
    if (u.dummy) { u.animT += DT; return; }
    const st = u.stats;
    if (u.cooldown > 0) u.cooldown -= DT;
    if (u.swing > 0) u.swing -= DT;
    if (u.repathIn > 0) u.repathIn--;
    if (u.exhausted && u.cal > st.maxCalories * K.exhaustedRecoverFraction) u.exhausted = false;
    if (u.cal <= 0) { u.cal = 0; u.exhausted = true; }

    let anim: UnitAnim = 'idle';
    const moved = this.runOrder(u);
    if (moved) anim = 'walk';
    if (u.swing > 0) anim = 'attack';
    else if (((u.order.kind === 'gather' && u.order.phase === 'harvest') || (u.order.kind === 'build' && u.order.phase === 'chop')) && !moved && u.busy) anim = 'gather';
    else if ((u.order.kind === 'eatPack' || u.order.kind === 'resupply') && !moved && u.busy) anim = 'eat';
    else if (u.exhausted && !moved) anim = 'tired';
    if (anim !== u.anim) { u.anim = anim; u.animT = 0; } else u.animT += DT;

    if (!u.busy && !moved && u.order.kind !== 'resupply' && u.order.kind !== 'eatPack') {
      u.cal = Math.min(st.maxCalories, u.cal + st.restRegen * DT);
    }
  }

  /** Executes the unit's current order. Returns true if it moved this tick. */
  private runOrder(u: Unit): boolean {
    const o = u.order;
    // Hunger interrupts work and wandering (not explicit fights or feeding).
    if ((o.kind === 'idle' || o.kind === 'gather' || o.kind === 'attackMove' || o.kind === 'build' || o.kind === 'cart') && u.engage === 0) {
      if (u.cal < u.stats.maxCalories * K.hungryFraction && this.autoFeed(u)) return false;
    }
    switch (o.kind) {
      case 'idle': return this.runIdle(u);
      case 'move': {
        if (this.moveTo(u, o.x, o.y, 0.3)) { this.finish(u); }
        return u.x !== u.px || u.y !== u.py;
      }
      case 'attackMove': {
        if (this.runEngage(u)) return u.x !== u.px || u.y !== u.py;
        if (this.moveTo(u, o.x, o.y, 0.5)) this.finish(u);
        return u.x !== u.px || u.y !== u.py;
      }
      case 'attack': {
        if (!this.attackTarget(u, o.target)) this.finish(u);
        return u.x !== u.px || u.y !== u.py;
      }
      case 'gather': return this.runGather(u, o);
      case 'resupply': return this.runResupply(u, o.building);
      case 'give': return this.runGive(u, o.to);
      case 'eatPack': {
        if (!this.eat(u, null)) this.finish(u);
        return false;
      }
      case 'build': return this.runBuild(u, o);
      case 'cart': return this.runCart(u, o);
    }
  }

  /** Complete the current order, returning to a resumed one if present. */
  private finish(u: Unit): void {
    u.order = u.resume ?? { kind: 'idle' };
    u.resume = null;
    u.path = [];
    u.repathIn = 0;
  }

  private detour(u: Unit, order: Order): void {
    if (!u.resume && u.order.kind !== 'idle') u.resume = u.order;
    u.order = order;
    u.path = [];
    u.repathIn = 0;
  }

  /** Hungry: eat from pack if possible, else walk to the nearest building with food. */
  private autoFeed(u: Unit): boolean {
    if (u.food > 0.01) { this.detour(u, { kind: 'eatPack' }); return true; }
    const b = this.nearestCache(u, (x) => x.stock.food > 1);
    if (b) { this.detour(u, { kind: 'resupply', building: b.id }); return true; }
    return false;
  }

  private runIdle(u: Unit): boolean {
    if (u.carter) { if ((this.tick + u.id) % 40 === 0) this.autoAssignCart(u); return false; }
    if (this.runEngage(u)) return u.x !== u.px || u.y !== u.py;
    // Throwers with an empty sling look for spent crystals nearby.
    if (u.throws && !this.armed(u) && (this.tick + u.id) % 20 === 0) {
      const shard = this.nearestNode(u, 'crystal', u.stats.sight, true);
      if (shard) {
        u.order = { kind: 'gather', node: shard.id, nodeType: 'crystal', phase: 'toNode', stopWhenArmed: true };
      }
    }
    return false;
  }

  /** Auto-acquire and fight enemies in sight. Returns true while engaged. */
  private runEngage(u: Unit): boolean {
    if (!this.armed(u) || u.exhausted || u.carter) { u.engage = 0; return false; }
    if (u.engage) {
      const p = this.entityPos(u.engage);
      if (p && (p[0] - u.x) ** 2 + (p[1] - u.y) ** 2 < (u.stats.sight * 1.5) ** 2 && this.attackTarget(u, u.engage)) return true;
      u.engage = 0;
    }
    if ((this.tick + u.id) % 5 !== 0) return false;
    const e = this.nearestEnemy(u, u.stats.sight, u.order.kind === 'attackMove');
    if (e) { u.engage = e; return this.attackTarget(u, e); }
    return false;
  }

  // ───────────────────────────── combat ─────────────────────────────

  /** Pursue and attack. Returns false if the target is gone or can't be attacked. */
  private attackTarget(u: Unit, targetId: number): boolean {
    const tu = this.units.get(targetId);
    const tb = tu ? undefined : this.buildings.get(targetId);
    if (!tu && !tb) return false;
    if (!this.armed(u)) {
      if (u.throws) {
        const shard = this.nearestNode(u, 'crystal', u.stats.sight, true);
        if (shard) { this.detour(u, { kind: 'gather', node: shard.id, nodeType: 'crystal', phase: 'toNode', stopWhenArmed: true }); return true; }
        const b = this.nearestCache(u, (x) => x.stock.crystal >= u.crystalMass);
        if (b) { this.detour(u, { kind: 'resupply', building: b.id }); return true; }
      }
      return false;
    }
    let tx: number, ty: number, edge: number;
    if (tu) { tx = tu.x; ty = tu.y; edge = Math.sqrt((tx - u.x) ** 2 + (ty - u.y) ** 2) - tu.stats.radius; }
    else {
      const b = tb!;
      const cx = Math.max(b.ox, Math.min(u.x, b.ox + b.size)), cy = Math.max(b.oy, Math.min(u.y, b.oy + b.size));
      tx = b.ox + b.size / 2; ty = b.oy + b.size / 2;
      edge = Math.sqrt((cx - u.x) ** 2 + (cy - u.y) ** 2);
    }
    const range = u.stats.range;
    if (edge > range - 0.05) {
      if (tu) { this.moveTo(u, tx, ty, 0.05); return true; }
      // buildings: walk to the open tile nearest the closest edge point
      const b = tb!;
      const ex = Math.max(b.ox - 0.5, Math.min(u.x, b.ox + b.size + 0.5)), ey = Math.max(b.oy - 0.5, Math.min(u.y, b.oy + b.size + 0.5));
      const open = this.grid.nearestOpen(ex, ey, 4);
      if (open) this.moveTo(u, open[0], open[1], 0.1);
      return true;
    }
    this.face(u, tx - u.x, ty - u.y);
    if (u.cooldown > 0 || u.exhausted) return true;
    if (u.cal < u.stats.attackCalories) { u.exhausted = true; return true; }
    u.cal -= u.stats.attackCalories;
    u.busy = true;
    u.cooldown = u.stats.cooldown;
    u.swing = Math.min(0.45, u.stats.cooldown * 0.8);
    this.events.push({ type: 'attack', x: u.x, y: u.y, owner: u.owner, specId: u.specId, style: u.throws ? 'throw' : 'strike', kg: u.crystalMass });
    if (u.throws) {
      u.crystal -= u.crystalMass;
      const flight = Math.max(0.25, Math.sqrt((tx - u.x) ** 2 + (ty - u.y) ** 2) / (u.stats.crystalVelocity * 0.7));
      let ax = tx, ay = ty;
      if (tu) { ax += ((tu.x - tu.px) / DT) * flight; ay += ((tu.y - tu.py) / DT) * flight; } // lead the target
      const p: Projectile = {
        id: this.nextId++, owner: u.owner, sx: u.x, sy: u.y, sz: 0, tx: ax, ty: ay, t: 0, duration: flight,
        damage: u.stats.damage, crystalKg: u.crystalMass, target: targetId,
      };
      this.projectiles.set(p.id, p);
    } else {
      this.damage(targetId, u.stats.damage, tx, ty);
    }
    return true;
  }

  private damage(id: number, amount: number, x: number, y: number): void {
    const tu = this.units.get(id);
    if (tu) { tu.hp -= amount; this.events.push({ type: 'hit', x, y, damage: amount, target: id }); return; }
    const tb = this.buildings.get(id);
    if (tb) { tb.hp -= amount; this.events.push({ type: 'hit', x, y, damage: amount, target: id }); }
  }

  private tickProjectile(p: Projectile): void {
    p.t += DT;
    if (p.t < p.duration) return;
    this.projectiles.delete(p.id);
    let hit = 0;
    const tu = this.units.get(p.target);
    if (tu && (tu.x - p.tx) ** 2 + (tu.y - p.ty) ** 2 < (tu.stats.radius + 0.4) ** 2) hit = tu.id;
    if (!hit) {
      let best = 0.45 ** 2;
      for (const u of this.units.values()) {
        if (u.owner === p.owner) continue;
        const d = (u.x - p.tx) ** 2 + (u.y - p.ty) ** 2;
        if (d < best + u.stats.radius ** 2) { best = d; hit = u.id; }
      }
    }
    if (!hit) {
      for (const b of this.buildings.values()) {
        if (b.owner !== p.owner && p.tx >= b.ox && p.tx <= b.ox + b.size && p.ty >= b.oy && p.ty <= b.oy + b.size) hit = b.id;
      }
    }
    if (hit) this.damage(hit, p.damage, p.tx, p.ty);
    this.dropShard(p.tx, p.ty, p.crystalKg);
  }

  private nearestEnemy(u: Unit, radius: number, includeDummies: boolean): number {
    let best = 0, bestD = radius * radius;
    for (const e of this.units.values()) {
      if (e.owner === u.owner || (e.dummy && !includeDummies)) continue;
      const d = (e.x - u.x) ** 2 + (e.y - u.y) ** 2;
      if (d < bestD) { bestD = d; best = e.id; }
    }
    if (best) return best;
    for (const b of this.buildings.values()) {
      if (b.owner === u.owner || (!includeDummies && this.scenario.inertPlayers?.includes(b.owner))) continue;
      const cx = Math.max(b.ox, Math.min(u.x, b.ox + b.size)), cy = Math.max(b.oy, Math.min(u.y, b.oy + b.size));
      const d = (cx - u.x) ** 2 + (cy - u.y) ** 2;
      if (d < bestD) { bestD = d; best = b.id; }
    }
    return best;
  }

  // ───────────────────────────── economy ─────────────────────────────

  /**
   * Gathering is quantized: work accumulates, and resources come off the node a
   * whole kilogram at a time (the last scrap of a node comes off as-is).
   */
  private gatherUnits(u: Unit, rate: number, available: number): number {
    if (this.freeCapacity(u) < 1 - 1e-6 && available >= 1) { u.gatherAcc = 0; return 0; }
    u.gatherAcc += rate * DT;
    u.busy = true;
    if (u.gatherAcc < 1) return 0;
    u.gatherAcc -= 1;
    return Math.min(1, available, Math.max(this.freeCapacity(u), available < 1 ? available : 0));
  }

  private carry(u: Unit, r: ResourceKind, kg: number): void {
    if (r === 'food') u.food += kg; else if (r === 'wood') u.wood += kg; else u.crystal += kg;
  }

  private runGather(u: Unit, o: Extract<Order, { kind: 'gather' }>): boolean {
    let node = this.nodes.get(o.node);
    if (o.phase !== 'toDrop' && (!node || node.amount <= 0.001)) {
      const next = o.stopWhenArmed ? null : this.nearestNode(u, o.nodeType, 10, false, node);
      if (next) { o.node = next.id; o.phase = 'toNode'; node = next; }
      else if (this.packLoad(u) - u.stats.loadoutCrystal > 0.5 && !o.stopWhenArmed) o.phase = 'toDrop';
      else { this.finish(u); return false; }
    }
    if (o.phase === 'toNode') {
      const n = node!;
      // Shards lie on open ground, often under a crowd or a dummy: pick up from arm's reach.
      const reach = n.shard ? u.stats.radius + 0.45 : 1.15 + u.stats.radius;
      if (this.moveToNear(u, n.x, n.y, reach, !n.shard)) o.phase = 'harvest';
      return u.x !== u.px || u.y !== u.py;
    }
    if (o.phase === 'harvest') {
      const n = node!;
      if (u.exhausted) return false;
      this.face(u, n.x - u.x, n.y - u.y);
      const rate = n.shard ? Math.max(2, u.stats.gatherRate * 4) : u.stats.gatherRate * this.gatherBoostAt(u.owner, n.x, n.y, n.type);
      let want: number;
      if (n.shard) {
        // spent crystals are picked up whole
        want = Math.min(rate * DT, n.amount, this.freeCapacity(u));
        if (o.stopWhenArmed) want = Math.min(want, Math.max(0, u.stats.loadoutCrystal - u.crystal));
      } else want = this.gatherUnits(u, rate, n.amount);
      if (want > 0) {
        n.amount -= want;
        this.carry(u, n.type, want);
        u.cal -= K.gatherCalPerKg * want;
        u.busy = true;
      }
      if (n.amount <= 0.001 && !n.growLeft) this.removeNode(n);
      const full = this.freeCapacity(u) < (n.shard ? 0.05 : 1 - 1e-6);
      if (o.stopWhenArmed) {
        if (u.crystal >= u.stats.loadoutCrystal - 1e-6 || full || n.amount <= 0.001) this.finish(u);
      } else if (full) {
        o.phase = 'toDrop';
      }
      return false;
    }
    // toDrop: the base, or a nearer building that's short of what we carry
    const base = this.baseOf(u.owner);
    const drop = this.nearestCache(u, (b) => this.room(b) > 1 && (b === base || this.wants(b, o.nodeType))) ?? this.nearestCache(u, (b) => this.room(b) > 1);
    if (!drop) { return false; } // every cache is full: wait
    if (this.moveToBuilding(u, drop)) {
      this.deposit(u, drop);
      if (u.cal < u.stats.maxCalories * 0.5 && drop.stock.food > 1) {
        this.detour(u, { kind: 'resupply', building: drop.id });
        return false;
      }
      if (this.packLoad(u) - u.stats.loadoutCrystal > 0.5) return false; // still carrying; try the next cache
      o.phase = 'toNode';
      if (!this.nodes.get(o.node)) {
        const next = this.nearestNode(u, o.nodeType, 14, false);
        if (next) o.node = next.id; else this.finish(u);
      }
    }
    return u.x !== u.px || u.y !== u.py;
  }

  private runResupply(u: Unit, buildingId: number): boolean {
    const b = this.buildings.get(buildingId);
    if (!b || b.owner !== u.owner || !b.complete) { this.finish(u); return false; }
    if (!this.moveToBuilding(u, b)) return u.x !== u.px || u.y !== u.py;
    this.deposit(u, b);
    // Restock loadout crystal from this building's stock.
    const need = Math.min(Math.max(0, u.stats.loadoutCrystal - u.crystal), this.freeCapacity(u), b.stock.crystal);
    if (need > 0) { u.crystal += need; b.stock.crystal -= need; }
    if (!this.eat(u, b)) this.finish(u);
    return false;
  }

  /** Eat for one tick from the pack (b = null) or a building's stock. False when done. */
  private eat(u: Unit, b: Building | null): boolean {
    const room = u.stats.maxCalories - u.cal;
    if (room < 1) return false;
    const avail = b ? b.stock.food : u.food;
    const kg = Math.min(avail, (u.stats.eatRate * DT) / K.calPerFood, room / K.calPerFood);
    if (kg <= 1e-6) return false;
    if (b) b.stock.food -= kg; else u.food -= kg;
    u.cal += kg * K.calPerFood;
    u.busy = true;
    return true;
  }

  /** Unload cargo into a building's cache, as much as fits. */
  private deposit(u: Unit, b: Building): void {
    let room = this.room(b);
    const put = (r: ResourceKind, kg: number) => {
      const amt = Math.min(kg, room);
      if (amt <= 0) return 0;
      b.stock[r] += amt; room -= amt;
      return amt;
    };
    u.food -= put('food', u.food);
    u.wood -= put('wood', u.wood);
    u.crystal -= put('crystal', this.surplusCrystal(u));
  }

  private runGive(u: Unit, toId: number): boolean {
    const to = this.units.get(toId);
    if (!to || to.owner !== u.owner) { this.finish(u); return false; }
    const reach = u.stats.radius + to.stats.radius + 0.5;
    if (!this.moveTo(u, to.x, to.y, reach)) return u.x !== u.px || u.y !== u.py;
    this.transfer(u, to);
    this.finish(u);
    return false;
  }

  /** Hand over everything the giver doesn't need. Receiver tops up its own loadout first. */
  transfer(from: Unit, to: Unit): void {
    let room = this.freeCapacity(to);
    const giveCrystal = (kg: number) => {
      const amt = Math.min(kg, this.surplusCrystal(from), room);
      if (amt <= 0) return;
      from.crystal -= amt; to.crystal += amt; room -= amt;
    };
    giveCrystal(Math.max(0, to.stats.loadoutCrystal - to.crystal));
    const f = Math.min(from.food, room);
    from.food -= f; to.food += f; room -= f;
    const w = Math.min(from.wood, room);
    from.wood -= w; to.wood += w; room -= w;
    giveCrystal(Infinity);
  }

  /** Construction: fetch wood from a stockpile (or chop it), carry it to the site. */
  private runBuild(u: Unit, o: Extract<Order, { kind: 'build' }>): boolean {
    const site = this.buildings.get(o.site);
    if (!site || site.owner !== u.owner || site.complete) { this.finish(u); return false; }
    const remaining = site.stats.totalCost - site.built;
    if (o.phase === 'deliver' || (o.phase !== 'chop' && u.wood >= Math.min(remaining, 0.5))) {
      if (u.wood <= 1e-6) { o.phase = 'fetch'; return false; }
      o.phase = 'deliver';
      if (!this.moveToBuilding(u, site)) return u.x !== u.px || u.y !== u.py;
      this.addToConstruction(site, u.wood, u);
      o.phase = 'fetch';
      return false;
    }
    if (o.phase === 'chop') {
      const tree = this.nodes.get(o.node);
      if (!tree || tree.amount <= 0.001) { o.phase = u.wood > 0.5 ? 'deliver' : 'fetch'; return false; }
      if (!this.moveToNear(u, tree.x, tree.y, 1.15 + u.stats.radius, true)) return u.x !== u.px || u.y !== u.py;
      if (u.exhausted) return false;
      this.face(u, tree.x - u.x, tree.y - u.y);
      const want = Math.min(this.gatherUnits(u, u.stats.gatherRate * this.gatherBoostAt(u.owner, tree.x, tree.y, 'wood'), tree.amount), Math.max(0, Math.ceil(remaining - u.wood)));
      if (want > 0) {
        tree.amount -= want; u.wood += want; u.cal -= K.gatherCalPerKg * want; u.busy = true;
      }
      if (tree.amount <= 0.001 && !tree.growLeft) this.removeNode(tree);
      if (this.freeCapacity(u) < 1 - 1e-6 || u.wood >= remaining - 1e-6 || tree.amount <= 0.001) o.phase = 'deliver';
      return false;
    }
    // fetch: nearest stockpile with wood, else the nearest tree to the site
    const needed = remaining - this.woodInFlight(site);
    if (needed <= 0.05) return false; // others are already carrying enough
    const src = this.nearestCache(u, (b) => b.stock.wood > 0.5);
    if (src) {
      if (!this.moveToBuilding(u, src)) return u.x !== u.px || u.y !== u.py;
      const take = Math.min(Math.floor(this.freeCapacity(u)), Math.ceil(remaining - this.woodInFlight(site)), Math.floor(src.stock.wood));
      if (take <= 0) return false;
      src.stock.wood -= take; u.wood += take;
      o.phase = 'deliver';
      return false;
    }
    const sx = site.ox + site.size / 2, sy = site.oy + site.size / 2;
    let best: ResourceNode | null = null, bestD = 20 * 20;
    for (const n of this.nodes.values()) {
      if (!n.tree || n.amount <= 0.001) continue;
      const d = (n.x - sx) ** 2 + (n.y - sy) ** 2;
      if (d < bestD) { bestD = d; best = n; }
    }
    if (best) { o.node = best.id; o.phase = 'chop'; }
    else this.finish(u);
    return false;
  }

  /** Is this building below its supply target for a resource? */
  private wants(b: Building, r: ResourceKind): boolean {
    return this.supplyTargets(b)[r] - b.stock[r] > 1;
  }

  /** Wood already in the packs of units building this site. */
  private woodInFlight(site: Building): number {
    let w = 0;
    for (const u of this.units.values()) {
      if (u.order.kind === 'build' && u.order.site === site.id) w += u.wood;
      else if (u.carter && u.order.kind === 'cart' && u.order.home === site.id && u.order.phase === 'deliver') w += u.wood;
    }
    return w;
  }

  /** Put wood from a unit's pack into a construction site; HP grows with it. */
  private addToConstruction(site: Building, kg: number, u: Unit): void {
    const amt = Math.min(kg, site.stats.totalCost - site.built);
    if (amt <= 0) return;
    u.wood -= amt;
    site.built += amt;
    site.hp = Math.min(site.maxHp, site.hp + (site.maxHp * amt) / site.stats.totalCost);
    if (site.built >= site.stats.totalCost - 1e-6) this.completeBuilding(site);
  }

  private completeBuilding(b: Building): void {
    b.complete = true;
    b.built = b.stats.totalCost;
    this.events.push({ type: 'built', id: b.id, owner: b.owner });
  }

  /** Carts: load at the pool's building, take it where it's most needed, repeat. */
  private runCart(u: Unit, o: Extract<Order, { kind: 'cart' }>): boolean {
    let base = this.buildings.get(o.base);
    if (!base || base.owner !== u.owner || !base.complete) {
      base = this.nearestProducer(u) ?? this.baseOf(u.owner);
      if (!base) { u.order = { kind: 'idle' }; return false; }
      o.base = base.id;
    }
    const cargo = u.food + u.wood + this.surplusCrystal(u);
    if (o.phase === 'deliver' && cargo > 0.05) {
      const dest = this.buildings.get(o.home);
      const to = dest && dest.owner === u.owner ? dest : base;
      if (!this.moveToBuilding(u, to)) return u.x !== u.px || u.y !== u.py;
      if (to.complete) this.deposit(u, to);
      else {
        this.addToConstruction(to, u.wood, u);
        if (u.wood > 0.05 || u.food > 0.05) this.deposit(u, base); // leftovers go home next trip
      }
      o.phase = 'load';
      if (!o.pinned) o.home = 0;
      return false;
    }
    o.phase = 'load';
    // choose where this load goes
    // Urgency = the fraction of that resource the building is missing (so 10 kg of a
    // 20 kg crystal need matters as much as 150 kg of a 300 kg food need), doubled when
    // an order is waiting on it, and discounted by distance.
    const pick: { home: Building | null; res: ResourceKind | null; need: number; score: number } = { home: null, res: null, need: 1, score: 0 };
    const consider = (b: Building) => {
      if (b === base) return;
      const need = this.shortfall(b);
      const target = b.complete ? this.supplyTargets(b) : { food: 0, wood: b.stats.totalCost, crystal: 0 };
      const waiting = b.queue.some((q) => q.kind === 'unit' && !q.paid) ? 2 : 1;
      const dist = Math.hypot(b.ox + b.size / 2 - u.x, b.oy + b.size / 2 - u.y);
      for (const r of RESOURCES) {
        if (need[r] <= 0.5 || base!.stock[r] - BASE_RESERVE[r] <= 1) continue;
        const score = (need[r] / Math.max(1, target[r])) * waiting / (1 + dist / 20);
        if (score > pick.score) { pick.score = score; pick.need = need[r]; pick.res = r; pick.home = b; }
      }
    };
    if (o.pinned) {
      const h = this.buildings.get(o.home);
      if (h && h.owner === u.owner) consider(h); else { o.pinned = false; o.home = 0; }
    }
    if (!o.pinned) for (const b of this.buildings.values()) if (b.owner === u.owner && !(b.spec.carters ?? 0)) consider(b);
    const home = pick.home, res = pick.res, worst = pick.need;
    if (!home || !res) {
      // nothing to deliver: wait by the pool's building
      const hx = base.ox + base.size / 2, hy = base.oy + base.size / 2;
      if ((u.x - hx) ** 2 + (u.y - hy) ** 2 > (base.size / 2 + 2.5) ** 2) this.moveToBuilding(u, base);
      return u.x !== u.px || u.y !== u.py;
    }
    o.home = home.id;
    o.res = res;
    if (!this.moveToBuilding(u, base)) return u.x !== u.px || u.y !== u.py;
    const take = Math.floor(Math.min(this.freeCapacity(u), worst + 0.999, base.stock[res] - BASE_RESERVE[res]));
    if (take <= 0) return false;
    base.stock[res] -= take;
    this.carry(u, res, take);
    o.phase = 'deliver';
    return false;
  }

  private nearestNode(u: Unit, type: ResourceKind, radius: number, shardsOnly: boolean, exclude?: ResourceNode): ResourceNode | null {
    let best: ResourceNode | null = null, bestD = radius * radius;
    for (const n of this.nodes.values()) {
      if (n.type !== type || n.amount <= 0.001 || n === exclude || n.growLeft) continue; // let sown plants ripen
      if (shardsOnly && !n.shard) continue;
      const d = (n.x - u.x) ** 2 + (n.y - u.y) ** 2;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  /** Nearest of the unit's finished buildings matching a test. */
  private nearestCache(u: Unit, test: (b: Building) => boolean): Building | null {
    let best: Building | null = null, bestD = Infinity;
    for (const b of this.buildings.values()) {
      if (b.owner !== u.owner || !b.complete || !test(b)) continue;
      const d = (b.ox + b.size / 2 - u.x) ** 2 + (b.oy + b.size / 2 - u.y) ** 2;
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  private removeNode(n: ResourceNode): void {
    if (!this.nodes.has(n.id)) return;
    this.nodes.delete(n.id);
    if (!n.shard) this.grid.block(n.x, n.y, -1);
  }

  // ───────────────────────────── movement ─────────────────────────────

  /** Snap a direction to one of 8 octants using only comparisons (no trig in the sim). */
  private face(u: Unit, dx: number, dy: number): void {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax + ay < 1e-4) return;
    const T = 0.41421356; // tan 22.5°
    if (ay < ax * T) u.heading = dx > 0 ? 0 : 4;
    else if (ax < ay * T) u.heading = dy > 0 ? 2 : 6;
    else u.heading = dx > 0 ? (dy > 0 ? 1 : 7) : (dy > 0 ? 3 : 5);
  }

  /** Walk toward (gx,gy). Returns true once within `arrive` of it. */
  private moveTo(u: Unit, gx: number, gy: number, arrive: number): boolean {
    const dx = gx - u.x, dy = gy - u.y;
    if (dx * dx + dy * dy <= arrive * arrive) { u.path = []; return true; }
    if ((gx - u.goalX) ** 2 + (gy - u.goalY) ** 2 > 0.6 || (u.path.length === 0 && u.repathIn === 0)) {
      u.goalX = gx; u.goalY = gy;
      if (this.grid.lineClear(u.x, u.y, gx, gy)) u.path = [[gx, gy]];
      else {
        const p = findPath(this.grid, u.x, u.y, gx, gy);
        u.path = p ?? [];
        if (p && p.length) {
          // final leg straight to the true goal if reachable
          const last = p[p.length - 1];
          if (this.grid.lineClear(last[0], last[1], gx, gy)) p.push([gx, gy]);
        }
      }
      u.repathIn = 10;
      if (u.path.length === 0) return dx * dx + dy * dy <= (arrive + 1.5) ** 2;
    }
    const st = u.stats;
    let speed = loadedSpeed(st, this.packLoad(u));
    if (u.exhausted) speed *= K.exhaustedSpeedMul;
    let budget = speed * DT;
    while (budget > 0 && u.path.length > 0) {
      const [wx, wy] = u.path[0];
      const ddx = wx - u.x, ddy = wy - u.y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d <= budget) {
        this.step1(u, ddx, ddy, d);
        budget -= d;
        u.path.shift();
      } else {
        this.step1(u, (ddx / d) * budget, (ddy / d) * budget, budget);
        budget = 0;
      }
    }
    const after = (gx - u.x) ** 2 + (gy - u.y) ** 2;
    if (after <= arrive * arrive) { u.stuck = 0; return true; }
    // Crowds: if we're close but jostled in place, call it arrived. Far away and stuck: repath.
    const before = Math.sqrt((gx - u.px) ** 2 + (gy - u.py) ** 2);
    if (before - Math.sqrt(after) < speed * DT * 0.25) u.stuck++; else u.stuck = 0;
    if (u.stuck > 8 && after <= (arrive + 1.6) ** 2) { u.stuck = 0; u.path = []; return true; }
    if (u.stuck > 40) { u.stuck = 0; u.path = []; u.repathIn = 0; }
    return false;
  }

  private step1(u: Unit, dx: number, dy: number, dist: number): void {
    const nx = u.x + dx, ny = u.y + dy;
    if (!this.grid.isBlocked(nx, ny)) { u.x = nx; u.y = ny; }
    else if (!this.grid.isBlocked(nx, u.y)) u.x = nx;
    else if (!this.grid.isBlocked(u.x, ny)) u.y = ny;
    else { u.path = []; return; }
    this.face(u, dx, dy);
    if (!u.exhausted) {
      u.cal -= u.stats.moveCalPerTile * dist * (1 + (this.packLoad(u) / u.stats.mass) * (u.stats.wheeled ? K.wheelHaulCost : 1));
      u.busy = true;
    }
  }

  /** Walk next to a blocking object at (x,y). */
  private moveToNear(u: Unit, x: number, y: number, reach: number, blocking: boolean): boolean {
    if ((x - u.x) ** 2 + (y - u.y) ** 2 <= reach * reach) { u.path = []; return true; }
    if (!blocking) return this.moveTo(u, x, y, reach);
    const d = Math.sqrt((x - u.x) ** 2 + (y - u.y) ** 2);
    // aim for a point just in front of the object on our side
    const ax = x + ((u.x - x) / d) * 0.8, ay = y + ((u.y - y) / d) * 0.8;
    const open = this.grid.isBlocked(ax, ay) ? this.grid.nearestOpen(ax, ay, 3) : [ax, ay];
    if (!open) return false;
    const there = this.moveTo(u, open[0], open[1], 0.15);
    const d2 = (x - u.x) ** 2 + (y - u.y) ** 2;
    return d2 <= reach * reach || (there && d2 < 2.3 * 2.3);
  }

  private moveToBuilding(u: Unit, b: Building): boolean {
    const cx = Math.max(b.ox, Math.min(u.x, b.ox + b.size)), cy = Math.max(b.oy, Math.min(u.y, b.oy + b.size));
    const reach = u.stats.radius + 0.6;
    if ((cx - u.x) ** 2 + (cy - u.y) ** 2 <= reach * reach) { u.path = []; return true; }
    const mx = b.ox + b.size / 2, my = b.oy + b.size / 2;
    const d = Math.sqrt((u.x - mx) ** 2 + (u.y - my) ** 2) || 1;
    const ax = mx + ((u.x - mx) / d) * (b.size / 2 + 0.6), ay = my + ((u.y - my) / d) * (b.size / 2 + 0.6);
    const open = this.grid.nearestOpen(ax, ay, 4);
    if (!open) return false;
    if (this.moveTo(u, open[0], open[1], 0.2)) return true;
    const cx2 = Math.max(b.ox, Math.min(u.x, b.ox + b.size)), cy2 = Math.max(b.oy, Math.min(u.y, b.oy + b.size));
    return (cx2 - u.x) ** 2 + (cy2 - u.y) ** 2 <= reach * reach;
  }

  /** Soft collisions so crowds spread out. Heavier units push lighter ones. */
  private separate(): void {
    const arr = Array.from(this.units.values());
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const r = a.stats.radius + b.stats.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2);
        let nx: number, ny: number;
        if (d < 1e-4) { nx = (a.id % 2 ? 1 : -1) * 0.7071; ny = 0.7071; d = 0; } else { nx = dx / d; ny = dy / d; }
        const overlap = (r - d) * 0.5;
        const ma = a.dummy ? 1e9 : a.stats.mass, mb = b.dummy ? 1e9 : b.stats.mass;
        const total = ma + mb;
        const pa = overlap * (mb / total), pb = overlap * (ma / total);
        const ax = a.x - nx * pa, ay = a.y - ny * pa, bx = b.x + nx * pb, by = b.y + ny * pb;
        if (!this.grid.isBlocked(ax, ay)) { a.x = ax; a.y = ay; }
        if (!this.grid.isBlocked(bx, by)) { b.x = bx; b.y = by; }
      }
    }
  }

  private reap(): void {
    for (const u of this.units.values()) {
      if (u.hp > 0) continue;
      this.units.delete(u.id);
      this.dropShard(u.x, u.y, u.crystal);
      this.events.push({ type: 'death', x: u.x, y: u.y, id: u.id, owner: u.owner, specId: u.specId, heading: u.heading });
    }
    for (const b of this.buildings.values()) {
      if (b.hp > 0) continue;
      this.buildings.delete(b.id);
      for (let y = b.oy; y < b.oy + b.size; y++) for (let x = b.ox; x < b.ox + b.size; x++) this.grid.block(x, y, -1);
      this.events.push({ type: 'buildingDestroyed', id: b.id, owner: b.owner });
    }
    if (this.tick % TICK_RATE !== 0 || !this.scenario.victory) return;
    for (const p of this.players) {
      if (p.defeated) continue;
      const fighters = this.unitsOf(p.id).filter((u) => !u.carter);
      if (this.buildingsOf(p.id).length === 0 && fighters.length === 0) p.defeated = true;
      else if (this.buildingsOf(p.id).length === 0 && fighters.every((u) => !this.armed(u))) p.defeated = true;
    }
    const alive = this.players.filter((p) => !p.defeated);
    if (alive.length <= 1 && this.players.length > 1) {
      this.winner = alive[0]?.id ?? 0;
      this.events.push({ type: 'gameOver', winner: this.winner });
    }
  }

  /** Cheap checksum of simulation state, for desync detection between peers. */
  hash(): number {
    let h = 2166136261 ^ this.tick;
    const mix = (v: number) => { h = Math.imul(h ^ (Math.round(v * 1000) | 0), 16777619); };
    for (const u of this.units.values()) { mix(u.id); mix(u.x); mix(u.y); mix(u.hp); mix(u.cal); mix(u.crystal); mix(u.food); mix(u.wood); }
    for (const b of this.buildings.values()) { mix(b.id); mix(b.hp); mix(b.built); mix(b.queue.length); mix(b.stock.food); mix(b.stock.wood); mix(b.stock.crystal); }
    for (const n of this.nodes.values()) { mix(n.id); mix(n.amount); }
    return h >>> 0;
  }
}
