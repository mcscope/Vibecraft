// The deterministic simulation. No DOM, no Math.random, no wall-clock time.
// Given the same seed, factions and command stream, every client computes the
// exact same world. Iteration order is Map insertion order (= id order).

import type { BuildingSpec, FactionSpec, ResourceKind, Stock, TechSpec, UnitSpec, WildSpec } from '../factions/types';
import { Rng } from './rng';
import type { PlayerCommand } from './commands';
import type { Grid } from './map';
import { skirmish, type Scenario } from './scenarios';
import { findPath } from './pathfinding';
import { Logistics } from './logistics';
import * as bearerAbility from './abilities/bearer';
import { midStride, strideFactor } from './abilities/gait';
import { nearestDropOff } from './abilities/dropoff';
import { eating, isTamer, runPens, runTame } from './abilities/herding';
import { BOMB_REACH, canReach, dropTime, FLY_SIGHT, flyTo, heightBonus, takeOff, tickFlight, walks } from './abilities/flight';
import { MatchStats } from './stats';
import { isUnderfoot, loadBelt, nearestBelt, roadFactor, routeBelts, runBelts, type BeltRoutes, type Parcel } from './abilities/underfoot';
import { grow, grownEnough, livingStats, seedMaterials } from './abilities/living';
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
/** Defaults for BuildingSpec.sow (a faction can set its own). */
export const SOW_YIELD: Record<'food' | 'wood', number> = { food: 200, wood: 100 };
/** Tiles a builder looks around for another unfinished site when its own is done. */
const NEARBY_SITE = 10;
export const SOW_MAX: Record<'food' | 'wood', number> = { food: 6, wood: 8 };
/** Default BuildingSpec.attack.stockShots. */
export const TOWER_STOCK_SHOTS = 40;

/** kg a building's sown plants grow to. */
export function plantKg(spec: BuildingSpec, r: 'food' | 'wood'): number {
  return spec.sow?.plantKg?.[r] ?? SOW_YIELD[r];
}
export const RESOURCES: ResourceKind[] = ['food', 'wood', 'crystal'];
/** Fog of war: how often sight is refreshed (ticks), and how far a building sees beyond its walls (tiles). */
export const VISION_EVERY = 4;
export const BUILDING_SIGHT = 4;
/** Carters leave this much at the base so it can keep training workers. */

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
  /** The Wilds: owns the wildlife, never wins or loses, isn't anyone's opponent. */
  neutral?: boolean;
  /** The town bell is ringing: workers are militia. */
  bell?: boolean;
}

/** Wildlife tuning (engine-wide). */
export const WILD = { wander: 5, aggro: 3, leash: 6, minFromHome: 16, apart: 8 } as const;

export type Order =
  | { kind: 'idle' }
  /** A worker hunting a passive animal (x/y: where it was last seen). */
  | { kind: 'hunt'; target: number; x: number; y: number }
  /** Town bell: go to a building and take a crystal to fight with. */
  | { kind: 'muster'; building: number }
  /** A tamer feeding a wild animal until it joins us. */
  | { kind: 'tame'; target: number }
  /** A dry thrower going to an ammo bearer for a load. */
  | { kind: 'rearm'; unit: number }
  /** Walk to a food bearer and eat from it. */
  | { kind: 'eatFrom'; unit: number }
  /** Wildlife: roam around a home spot (tx/ty: current wander target, rest: ticks until the next). */
  | { kind: 'wild'; hx: number; hy: number; tx: number; ty: number; rest: number }
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
  /**
   * Supply job: load `res` (and anything else `home` lacks) at `from`, deliver it to `home`.
   * `base` is the cart pool it idles at; `from` 0 means no job chosen yet.
   */
  | { kind: 'cart'; base: number; home: number; from?: number; pinned: boolean; phase: 'load' | 'deliver'; res: ResourceKind };

export type UnitAnim = 'idle' | 'walk' | 'fly' | 'attack' | 'gather' | 'eat' | 'tired';

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
  /** Cargo pack (kg): what it gathers or hauls. */
  food: number;
  wood: number;
  crystal: number;
  /** Weapon pack (kg of crystal): its weapon, or its throwing crystals. Up to stats.loadoutCrystal. */
  ammo: number;
  order: Order;
  /** Order to return to after an automatic detour (eating, rearming). */
  resume: Order | null;
  /** Auto-acquired target while idle / attack-moving. */
  engage: number;
  /** Shift-queued orders, started one by one as each finishes. */
  queue: Order[];
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
  /** Bounding gait: how far through its stride (0..1), and the last tick it was moving. */
  stride: number; strideTick: number;
  /** A flier in the air (sim/abilities/flight.ts). */
  airborne: boolean;
  /** Metres up (fliers climb slowly toward their ceiling while airborne; 0 on the ground). */
  alt: number;
  /** Heading in the air (radians); a flier turns toward its goal at a limited rate. */
  flyDir: number;
  /** Tick a flier last steered toward a goal (otherwise it circles). */
  flewTick: number;
  /** Training dummy: inert target. */
  dummy: boolean;
  /** Wildlife temper (wild units only). */
  wild?: 'passive' | 'aggressive';
  /** A tamed animal's temper (sim/abilities/herding.ts); and, while being tamed, who's feeding it and how much so far. */
  tame?: 'passive' | 'aggressive';
  tameBy?: number; tameFed?: number; tameTick?: number;
  /** Called up by the town bell: fights on its own while holding a crystal. */
  militia?: boolean;
  /** What it was doing when the bell rang (resumed when it stops). */
  bellResume?: Order | null;
  carter: boolean;
  /** Progress toward the next whole kilogram being gathered. */
  gatherAcc: number;
}

/** `paid` false: queued, still waiting for this building's stock to cover it (units and techs alike). */
export type QueueItem =
  | { kind: 'unit'; specId: string; progress: number; total: number; food: number; crystal: number; home: number; paid: boolean }
  | { kind: 'tech'; techId: string; progress: number; total: number; wood: number; paid: boolean };

/** What a queue item costs. */
export function itemCost(q: QueueItem): Stock {
  return q.kind === 'unit' ? { food: q.food, wood: 0, crystal: q.crystal } : { food: 0, wood: q.wood, crystal: 0 };
}

export interface Building {
  id: number;
  owner: number;
  specId: string;
  spec: BuildingSpec;
  stats: BuildingStats;
  /** Living buildings: materials grown so far (see abilities/living.ts). */
  grown?: number;
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
  /** Rally point on a resource: new workers go and gather it (that kind, if that one's gone). */
  rallyRes: ResourceKind | null;
  cooldown: number;
  /** Unit this building re-queues automatically, if any. */
  autoTrain: string | null;
  /** Resources this building is currently sowing (subset of spec.sow.resources). */
  sowing: Array<'food' | 'wood'>;
  /** Pens: seconds of breeding so far per kind of animal. */
  breeding?: Record<string, number>;
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
  /** What's left of a killed animal (drawn as a carcass). */
  carcass?: boolean;
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
  /** Dropped from a flier: falls straight down from `sz` metres. */
  drop?: boolean;
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

export const emptyStock = (): Stock => ({ food: 0, wood: 0, crystal: 0 });

export class World {
  tick = 0;
  /** Supply: needs, spares, carts and hauling (see logistics.ts). */
  readonly logistics = new Logistics(this);
  readonly grid: Grid;
  readonly players: PlayerState[] = [];
  /** Fog of war: per player, per tile: 0 never seen, 1 explored, 2 in sight now. */
  private visionGrids: Uint8Array[] = [];
  readonly units = new Map<number, Unit>();
  readonly buildings = new Map<number, Building>();
  readonly nodes = new Map<number, ResourceNode>();
  readonly projectiles = new Map<number, Projectile>();
  /** Underfoot pieces by tile (sim/abilities/underfoot.ts), goods riding belts, and the belt routes (rebuilt when buildings change). */
  private underfootTiles = new Map<number, number>();
  parcels: Parcel[] = [];
  private parcelSeq = 1;
  private beltRoutes: BeltRoutes | null = null;
  underfootAt(x: number, y: number): Building | undefined {
    if (!this.grid.inBounds(x, y)) return undefined;
    const id = this.underfootTiles.get(Math.floor(y) * this.grid.width + Math.floor(x));
    return id === undefined ? undefined : this.buildings.get(id);
  }
  belts(): BeltRoutes { return (this.beltRoutes ??= routeBelts(this)); }
  /** A tamed animal's kind becomes one of `player`'s unit kinds (same body, same stats). */
  adoptSpec(player: number, from: number, specId: string): void {
    const s = this.unitSpecs.get(`${from}/${specId}`);
    if (s && !this.unitSpecs.has(`${player}/${specId}`)) this.unitSpecs.set(`${player}/${specId}`, s);
  }
  /** The temper of an animal kind `owner` herds. */
  herdTemper(owner: number, specId: string): 'passive' | 'aggressive' {
    return (this.specOf(owner, specId)?.spec as WildSpec | undefined)?.temper ?? 'passive';
  }
  nextParcelId(): number { return this.parcelSeq++; }
  /** Render-side consumers drain this; the sim never reads it. */
  events: WorldEvent[] = [];
  winner = -1;
  /** Totals and a timeline for the score screen (read-only; the sim never looks at it). */
  stats!: MatchStats;

  private nextId = 1;
  /** Per player: unit specs with stats including that player's technologies. */
  private readonly unitSpecs = new Map<string, { spec: UnitSpec; stats: DerivedStats }>();
  private readonly buildingStats = new Map<string, BuildingStats>();
  readonly factions = new Map<string, FactionSpec>();
  private pending: PlayerCommand[] = [];

  readonly scenario: Scenario;
  /** Each player's home (town center middle), for territories. */
  readonly homes: Array<[number, number]> = [];
  /** The Wilds' player id, or -1. */
  wildsId = -1;
  /** Sim-side dice (deterministic: every client rolls the same). */
  private readonly rng: Rng;

  constructor(opts: WorldOptions) {
    this.rng = new Rng((opts.seed * 2654435761) ^ 0x5eed);
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
      // two players may bring different factions under the same id: give the later one its own key
      const key = this.factions.has(p.faction.id) && this.factions.get(p.faction.id) !== p.faction ? `${p.faction.id}#${i}` : p.faction.id;
      this.factions.set(key, p.faction);
      this.players.push({ id: i, name: p.name, factionId: key, defeated: false, refine: {}, refineWork: {}, techs: [], researched: [] });
      for (const s of p.faction.units) this.unitSpecs.set(`${i}/${s.id}`, { spec: s, stats: derive(s) });
      for (const b of p.faction.buildings ?? []) this.buildingStats.set(`${key}/${b.id}`, deriveBuilding(b, p.faction));
    });
    this.stats = new MatchStats(this.players.length);
    this.scenario.setup(this, map);
    for (let i = 0; i < this.players.length; i++) {
      const [sx, sy] = map.starts[i] ?? map.starts[0];
      this.homes.push([sx + 1.5, sy + 1.5]);
    }
    if (this.scenario.wildlife !== false) this.addWilds(opts.players.map((p) => p.faction));
  }

  /** Whose half of the map a point is in: the player with the nearest home. */
  territory(x: number, y: number): number {
    let best = 0, bestD = Infinity;
    this.homes.forEach(([hx, hy], i) => { const d = (hx - x) ** 2 + (hy - y) ** 2; if (d < bestD) { bestD = d; best = i; } });
    return best;
  }

  /** The Wilds: a neutral side that owns every faction's wildlife, spawned in groups in that faction's half. */
  private addWilds(factions: FactionSpec[]): void {
    const specs: WildSpec[] = [];
    const idOf = new Map<WildSpec, string>();
    factions.forEach((f, i) => {
      for (const w of f.wildlife ?? []) {
        const clash = specs.find((x) => x.id === w.id && x !== w);
        const id = clash ? `${w.id}@${i}` : w.id;
        if (!specs.includes(w)) specs.push(clash ? { ...w, id } : w);
        idOf.set(w, id);
      }
    });
    if (!specs.length) return;
    const id = this.players.length;
    this.wildsId = id;
    const wilds: FactionSpec = { id: 'wilds', name: 'The Wilds', workerId: '', units: specs };
    this.factions.set(wilds.id, wilds);
    this.players.push({ id, name: 'Wilds', factionId: wilds.id, defeated: false, refine: {}, refineWork: {}, techs: [], researched: [], neutral: true });
    for (const s of specs) this.unitSpecs.set(`${id}/${s.id}`, { spec: s, stats: derive(s) });
    const dens: Array<[number, number]> = [];
    factions.forEach((f, owner) => {
      for (const w of f.wildlife ?? []) {
        const uid = idOf.get(w)!;
        for (let g = 0; g < w.count; g++) {
          for (let tries = 0; tries < 300; tries++) {
            const x = this.rng.int(2, this.grid.width - 2) + 0.5, y = this.rng.int(2, this.grid.height - 2) + 0.5;
            if (this.grid.isBlocked(x, y) || this.territory(x, y) !== owner) continue;
            if (this.homes.some(([hx, hy]) => Math.hypot(hx - x, hy - y) < WILD.minFromHome)) continue;
            if (dens.some(([dx, dy]) => Math.hypot(dx - x, dy - y) < WILD.apart)) continue;
            dens.push([x, y]);
            for (let k = 0; k < w.group; k++) {
              const u = this.spawnAt(id, uid, x + this.rng.range(-1.2, 1.2), y + this.rng.range(-1.2, 1.2), this.rng.int(0, 8));
              if (!u) continue;
              u.wild = w.temper;
              u.order = { kind: 'wild', hx: x, hy: y, tx: u.x, ty: u.y, rest: this.rng.int(20, 120) };
            }
            break;
          }
        }
      }
    });
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
  /** Sum of every finished building's stock the player owns. */
  stockOf(owner: number): Stock {
    const s = emptyStock();
    for (const b of this.buildings.values()) if (b.owner === owner && b.complete) for (const r of RESOURCES) s[r] += b.stock[r];
    return s;
  }
  /** Everything carried, both packs (it all slows you down). */
  packLoad(u: Unit): number { return this.cargo(u) + u.ammo; }
  /** The cargo pack: what's gathered or hauled. */
  cargo(u: Unit): number { return u.food + u.wood + u.crystal; }
  /** Room left in the cargo pack (the weapon pack is separate). */
  freeCapacity(u: Unit): number { return Math.max(0, u.stats.cargoCapacity - this.cargo(u)); }
  armed(u: Unit): boolean { return this.weapon(u) !== null; }

  /** What a unit can hit with right now: its own weapon, or (a worker) a crystal it's carrying. */
  weapon(u: Unit): { damage: number; cooldown: number; range: number; attackCalories: number; crystalMass: number; throws: boolean } | null {
    const s = u.stats;
    if (s.canAttack) return u.ammo >= u.crystalMass - 1e-6 ? { damage: s.damage, cooldown: s.cooldown, range: s.range, attackCalories: s.attackCalories, crystalMass: u.crystalMass, throws: u.throws } : null;
    if (s.improvised && u.crystal >= s.improvised.crystalMass - 1e-6) return { ...s.improvised, throws: false };
    return null;
  }

  /** Current refinement of a unit type for a player (design + techs). */
  refinementOf(owner: number, unitId: string, channel: 'combat' | 'work' = 'combat'): number {
    const s = this.specOf(owner, unitId);
    const p = this.players[owner];
    return channel === 'work'
      ? (s?.spec.workRefinement ?? 1) + (p.refineWork[unitId] ?? 0)
      : (s?.spec.refinement ?? 1) + (p.refine[unitId] ?? 0);
  }

  /** Best gather-rate boost a player's infrastructure gives at a spot, for a resource (only buildings with crystal to burn). */
  gatherBoostAt(owner: number, x: number, y: number, res: ResourceKind): number {
    return this.boostAt(owner, x, y, res).mult;
  }
  boostAt(owner: number, x: number, y: number, res: ResourceKind): { mult: number; from: Building | null } {
    let best = 1, from: Building | null = null;
    for (const b of this.buildings.values()) {
      const gb = b.spec.gatherBoost;
      if (b.owner !== owner || !b.complete || !gb || !gb.resources.includes(res) || b.stock.crystal <= 1e-6) continue;
      const r = gb.radius + b.size / 2;
      if ((b.ox + b.size / 2 - x) ** 2 + (b.oy + b.size / 2 - y) ** 2 <= r * r && b.stats.gatherBoost > best) { best = b.stats.gatherBoost; from = b; }
    }
    return { mult: best, from };
  }
  /** A boosted gatherer took `kg`: the boosting building burns crystal for the extra part. */
  private burnBoost(boost: { mult: number; from: Building | null }, kg: number): void {
    if (!boost.from || boost.mult <= 1) return;
    const extra = kg * (1 - 1 / boost.mult);
    boost.from.stock.crystal = Math.max(0, boost.from.stock.crystal - extra * CAP.boostCrystalPerKg);
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
    for (let y = oy; y < oy + size; y++) for (let x = ox; x < ox + size; x++) if (this.grid.isBlocked(x, y) || this.underfootAt(x, y)) return false;
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
      for (const u of units) {
        // shift-queued: after the current order (and anything queued before it)
        if (cmd.queue && (u.order.kind !== 'idle' || u.queue.length)) { u.queue.push({ ...order } as Order); continue; }
        u.order = { ...order } as Order; u.resume = null; u.engage = 0; u.path = []; u.repathIn = 0; u.queue = [];
      }
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
          if (!this.gathers(u, n.type)) continue;
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
          // a thrower restocks from a friendly ammo bearer if one is nearer than the building
          const bearer = u.throws ? bearerAbility.nearestBearer(this, u) : null;
          const toB = bearer ? (bearer.x - u.x) ** 2 + (bearer.y - u.y) ** 2 : Infinity;
          const toBuilding = (b.ox + b.size / 2 - u.x) ** 2 + (b.oy + b.size / 2 - u.y) ** 2;
          set([u], bearer && toB < toBuilding ? { kind: 'rearm', unit: bearer.id } : { kind: 'resupply', building: b.id });
          u.resume = back;
        }
        return;
      }
      case 'rearm': {
        const bearer = this.units.get(cmd.bearer);
        if (!bearer || bearer.owner !== player || !this.isBearer(bearer)) return;
        for (const u of mine(cmd.units)) {
          if (!u.throws || u === bearer) continue;
          const prev = u.order;
          set([u], { kind: 'rearm', unit: bearer.id });
          u.resume = prev.kind === 'gather' || prev.kind === 'attackMove' || prev.kind === 'attack' ? prev : null;
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
        if (st.blocker) return;
        // queued like a unit: paid from this building's stock when it reaches the front
        this.players[player].techs.push(cmd.techId);
        b.queue.push({ kind: 'tech', techId: cmd.techId, progress: 0, total: techTime(st.cost), wood: st.cost, paid: false });
        return;
      }
      case 'cancelTrain': {
        const b = ownBuilding(cmd.building);
        if (!b || b.queue.length === 0) return;
        const at = cmd.index !== undefined && cmd.index >= 0 && cmd.index < b.queue.length ? cmd.index : b.queue.length - 1;
        const [item] = b.queue.splice(at, 1);
        if (item.paid) { const c = itemCost(item); for (const r of RESOURCES) b.stock[r] += c[r]; }
        if (item.kind === 'tech') { const p = this.players[player]; p.techs = p.techs.filter((t) => t !== item.techId); }
        return;
      }
      case 'rally': {
        const b = ownBuilding(cmd.building);
        if (!b) return;
        b.rallyX = cmd.x; b.rallyY = cmd.y;
        const n = cmd.node ? this.nodes.get(cmd.node) : undefined;
        b.rallyRes = n ? n.type : null;
        if (n) { b.rallyX = n.x; b.rallyY = n.y; }
        return;
      }
      case 'build': {
        if (this.buildBlocker(player, cmd.specId)) return;
        const spec = this.buildingSpecOf(player, cmd.specId)!;
        const ox = Math.floor(cmd.ox), oy = Math.floor(cmd.oy);
        if (!this.placeable(ox, oy, spec.size)) return;
        const site = this.addBuilding(player, cmd.specId, ox, oy, false);
        if (site) set(mine(cmd.units).filter((u) => this.gathers(u, 'wood')), { kind: 'build', site: site.id, phase: 'fetch', node: 0 });
        return;
      }
      case 'assignCart': {
        const b = ownBuilding(cmd.building);
        if (!b) return;
        for (const id of cmd.units) {
          const u = this.units.get(id);
          if (u && u.owner === player && u.carter) {
            const base = this.logistics.nearestProducer(u) ?? this.baseOf(player);
            u.order = { kind: 'cart', base: base?.id ?? b.id, home: b.id, pinned: true, phase: 'load', res: 'food' };
            u.path = [];
          }
        }
        return;
      }
      case 'haul': {
        const b = ownBuilding(cmd.building);
        if (!b || !b.complete) return;
        for (const u of mine(cmd.units)) {
          if (!this.gathers(u)) continue;
          const base = this.logistics.nearestProducer(u) ?? this.baseOf(player);
          if (!base) continue;
          const loaded = u.food + u.wood + u.crystal > 0.05;
          set([u], { kind: 'cart', base: base.id, home: b.id, pinned: true, phase: loaded ? 'deliver' : 'load', res: 'food' });
        }
        return;
      }
      case 'destroy': {
        for (const id of cmd.ids) {
          const t = this.units.get(id) ?? this.buildings.get(id);
          if (t && t.owner === player) t.hp = 0; // reaped at the end of the tick, like any death
        }
        return;
      }
      case 'resign': {
        const p = this.players[player];
        if (!p || p.neutral || p.defeated) return;
        p.defeated = true;
        this.stats.resigned = player;
        return;
      }
      case 'townBell': {
        // every worker: on → grab a crystal and stand as militia; off → back to what they were doing
        const workers = [...this.units.values()].filter((u) => u.owner === player && !u.carter && u.stats.gatherRate > 0 && (u.stats.improvised || u.specId === this.factionOf(player).workerId));
        this.players[player].bell = cmd.on;
        for (const u of workers) {
          if (cmd.on && !u.militia) {
            u.militia = true;
            u.bellResume = u.order.kind === 'muster' ? u.resume : u.order;
            const b = u.stats.improvised ? this.nearestCache(u, (x) => x.stock.crystal >= u.stats.improvised!.crystalMass) : null;
            u.order = b && u.crystal < u.stats.improvised!.crystalMass ? { kind: 'muster', building: b.id } : { kind: 'idle' };
            u.resume = null; u.path = [];
          } else if (!cmd.on && u.militia) {
            u.militia = false; u.engage = 0;
            u.order = u.bellResume ?? { kind: 'idle' };
            u.bellResume = null; u.path = [];
          }
        }
        return;
      }
      case 'hunt': {
        const prey = this.units.get(cmd.target);
        if (!prey || !(prey.wild === 'passive' || (prey.tame === 'passive' && prey.owner === player))) return; // wild game, or your own herd to butcher
        return set(mine(cmd.units).filter((u) => this.gathers(u, 'food')), { kind: 'hunt', target: prey.id, x: prey.x, y: prey.y });
      }
      case 'tame': {
        const a = this.units.get(cmd.target);
        if (!a || !a.wild) return;
        return set(mine(cmd.units).filter((u) => isTamer(this, u)), { kind: 'tame', target: a.id });
      }
      case 'construct': {
        const site = ownBuilding(cmd.site);
        if (!site || site.complete) return;
        return set(mine(cmd.units).filter((u) => this.gathers(u, 'wood')), { kind: 'build', site: site.id, phase: 'fetch', node: 0 });
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
    const base = this.buildingStatsOf(owner, specId);
    if (!spec || !base) return null;
    let stats: BuildingStats = base;
    const size = spec.size;
    const grown = spec.living ? seedMaterials(spec) : undefined;
    if (grown !== undefined) stats = livingStats(spec, this.factionOf(owner), grown); // planted small
    const b: Building = {
      id: this.nextId++, owner, specId, spec, stats, ox, oy, size,
      hp: complete ? stats.maxHp : 1, maxHp: stats.maxHp,
      built: complete ? stats.totalCost : 0, complete,
      queue: [], stock: emptyStock(),
      rallyX: ox + size + 1, rallyY: oy + size + 1, rallyRes: null, cooldown: 0, autoTrain: null,
      sowing: [...(spec.sow?.resources ?? [])], sowProgress: 0, grown,
    };
    this.buildings.set(b.id, b);
    this.beltRoutes = null;
    if (isUnderfoot(spec)) { this.underfootTiles.set(oy * this.grid.width + ox, b.id); return b; } // laid on the ground: blocks nothing
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
    bearerAbility.loadUp(this, u, from); // a bearer comes out loaded from the building's stock
    const rx = from.rallyX, ry = from.rallyY;
    if (from.rallyRes && !u.carter && this.gathers(u, from.rallyRes)) {
      // rallied onto a resource: go gather it (the nearest of that kind to the rally point, if it's gone)
      let node: ResourceNode | null = null, best = 10 * 10;
      for (const n of this.nodes.values()) {
        if (n.type !== from.rallyRes || n.amount <= 0.001 || (n.shard && !n.carcass)) continue;
        const d = (n.x - rx) ** 2 + (n.y - ry) ** 2;
        if (d < best) { best = d; node = n; }
      }
      if (node) { u.order = { kind: 'gather', node: node.id, nodeType: node.type, phase: 'toNode', stopWhenArmed: false }; return u; }
    }
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
      food: 0, wood: 0, crystal: 0, ammo: s.stats.loadoutCrystal,
      order: { kind: 'idle' }, resume: null, queue: [], engage: 0,
      path: [], goalX: x, goalY: y, repathIn: 0,
      cooldown: 0, swing: 0, anim: 'idle', animT: 0, heading: 1, busy: false, stuck: 0, stride: 0, strideTick: -1, airborne: false, alt: 0, flyDir: 0, flewTick: -1,
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
    // orders not yet paid for get the new (cheaper) price
    for (const b of this.buildings.values()) {
      if (b.owner !== owner) continue;
      for (const q of b.queue) if (q.kind === 'unit' && !q.paid && q.specId === unitId) { q.food = stats.foodCost; q.crystal = stats.crystalCost; }
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
    const events0 = this.events.length;
    for (const c of this.pending) this.apply(c);
    this.pending = [];
    for (const c of commands) this.apply(c);

    for (const b of this.buildings.values()) this.tickBuilding(b);
    for (const u of this.units.values()) { u.px = u.x; u.py = u.y; u.busy = false; }
    for (const u of this.units.values()) this.tickUnit(u);
    this.separate();
    for (const p of this.projectiles.values()) this.tickProjectile(p);
    if (this.parcels.length) runBelts(this, DT);
    runPens(this);
    for (const n of this.nodes.values()) {
      if (!n.growLeft) continue;
      const g = Math.min(n.growLeft, (n.growRate ?? 0) * DT);
      n.amount += g;
      n.growLeft -= g;
    }
    this.reap();
    if (this.tick % VISION_EVERY === 0) this.updateVision();
    this.scenario.tick?.(this);
    this.tick++;
    this.stats.record(this, this.events.slice(events0));
  }

  /** What `player` can see of tile (x, y): 0 never seen, 1 explored, 2 in sight now. */
  vision(player: number, x: number, y: number): number {
    const v = this.visionGrids[player];
    if (!v || !this.grid.inBounds(x, y)) return 0;
    return v[Math.floor(y) * this.grid.width + Math.floor(x)];
  }

  /** Each side sees what its units and buildings can see (their sight stat; a building sees around itself, a tower out to its range). */
  private updateVision(): void {
    const W = this.grid.width, H = this.grid.height;
    for (const p of this.players) {
      if (p.neutral) continue;
      let v = this.visionGrids[p.id];
      if (!v) v = this.visionGrids[p.id] = new Uint8Array(W * H);
      for (let i = 0; i < v.length; i++) if (v[i] === 2) v[i] = 1;
    }
    const stamp = (owner: number, x: number, y: number, r: number) => {
      const v = this.visionGrids[owner];
      if (!v) return;
      const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.floor(x + r));
      const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.floor(y + r));
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if ((tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2 <= r * r) v[ty * W + tx] = 2;
      }
    };
    for (const u of this.units.values()) stamp(u.owner, u.x, u.y, u.stats.sight + (u.airborne ? FLY_SIGHT : 0));
    for (const b of this.buildings.values()) {
      const r = Math.max(b.size / 2 + BUILDING_SIGHT, b.complete && b.stats.tower ? b.stats.tower.range + 1 : 0);
      stamp(b.owner, b.ox + b.size / 2, b.oy + b.size / 2, r);
    }
  }

  private tickBuilding(b: Building): void {
    if (!b.complete) return;
    if (b.grown !== undefined) grow(b, this.factionOf(b.owner), DT);
    if (b.autoTrain && b.queue.length === 0) {
      const s = this.specOf(b.owner, b.autoTrain);
      if (s && this.unitsOf(b.owner).length < MAX_UNITS_PER_PLAYER) {
        b.queue.push({ kind: 'unit', specId: b.autoTrain, progress: 0, total: s.stats.trainTime, food: s.stats.foodCost, crystal: s.stats.crystalCost, home: 0, paid: false });
      }
    }
    let item = b.queue[0];
    if (item && !item.paid) {
      const c = itemCost(item);
      // a young living building can only train what its current size supports
      const ready = item.kind !== 'unit' || grownEnough(b, Math.max(this.refinementOf(b.owner, item.specId), this.refinementOf(b.owner, item.specId, 'work')));
      if (ready && RESOURCES.every((r) => b.stock[r] >= c[r] - 1e-6)) { for (const r of RESOURCES) b.stock[r] -= c[r]; item.paid = true; }
    }
    if (item && !item.paid) {
      // still waiting for stock: let anything already paid for behind it go first
      const i = b.queue.findIndex((q) => q.paid);
      if (i > 0) { const [ready] = b.queue.splice(i, 1); b.queue.unshift(ready); item = ready; }
    }
    if (item) {
      const waiting = !item.paid;
      const capped = item.kind === 'unit' && this.unitsOf(b.owner).length >= MAX_UNITS_PER_PLAYER;
      if (!capped && !waiting) item.progress += DT;
      if (item.progress >= item.total) {
        b.queue.shift();
        if (item.kind === 'unit') {
          const u = this.spawnUnit(b.owner, item.specId, b);
          if (u) {
            // carts join the pool of the building that made them (or the nearest one with a pool)
            if (u.carter) u.order = { kind: 'cart', base: item.home || ((b.spec.carters ?? 0) > 0 ? b.id : 0), home: 0, pinned: false, phase: 'load', res: 'food' };
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
    if ((this.tick + b.id) % 40 === 0) this.logistics.requestCarters(b);
  }

  /** Carts currently heading to (or pinned to) a building. */
  /** Sowing: keep the ground around the building planted, paying seed from its own stock. */
  /** What a sowing building will plant next: the enabled kind furthest below its quota of living plants. */
  sowNext(b: Building): 'food' | 'wood' | null {
    const sow = b.spec.sow;
    if (!sow) return null;
    let res: 'food' | 'wood' | null = null, best = 0;
    for (const r of b.sowing) {
      let n = 0;
      for (const node of this.nodes.values()) if (node.sownBy === b.id && node.type === r) n++;
      const lack = 1 - n / (sow.maxPlants?.[r] ?? SOW_MAX[r]);
      if (lack > best) { best = lack; res = r; }
    }
    return res;
  }

  private tickSow(b: Building): void {
    const sow = b.spec.sow!;
    const res = this.sowNext(b);
    // the mechanism is still busy with the last planting
    if (b.sowProgress > 0) { b.sowProgress = Math.max(0, b.sowProgress - b.stats.sowRate * DT); return; }
    if (!res) return;
    const yieldKg = plantKg(b.spec, res);
    const seed = yieldKg * CAP.sowSeedFraction;
    if (b.stock[res] < seed) return; // waits for seed (carts bring it)
    const spot = this.sowSpot(b, sow.radius, res === 'wood' ? 1.0 : 1.5);
    if (!spot) return;
    b.stock[res] -= seed;
    b.sowProgress = yieldKg;
    // the seed goes into the plant: it starts holding that much and grows to full
    const node = this.addNode({ type: res, x: spot[0], y: spot[1], amount: seed, shard: false, tree: res === 'wood' });
    node.maxAmount = yieldKg;
    node.growLeft = yieldKg - seed;
    node.growRate = (yieldKg - seed) / CAP.sowGrowSec;
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

  /** A tower is a thrower without legs: its crystal ammo comes out of its own stock. */
  private tickTower(b: Building): void {
    const tw = b.stats.tower!;
    const atk = b.spec.attack!;
    if (b.cooldown > 0) { b.cooldown -= DT; return; }
    if ((this.tick + b.id) % 4 !== 0) return;
    if (b.stock.crystal < atk.crystalMass) return;
    const cx = b.ox + b.size / 2, cy = b.oy + b.size / 2;
    const reach = tw.range + b.size / 2;
    const blind = tw.minRange + b.size / 2; // can't lob onto its own doorstep
    let target: Unit | null = null, bestD = reach * reach;
    for (const u of this.units.values()) {
      if (u.owner === b.owner) continue;
      const d = (u.x - cx) ** 2 + (u.y - cy) ** 2;
      if (d < bestD && d >= blind * blind) { bestD = d; target = u; }
    }
    if (!target) return;
    b.stock.crystal -= atk.crystalMass;
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
    if (u.wild || u.tame) u.cal = st.maxCalories; // they graze
    if (u.cooldown > 0) u.cooldown -= DT;
    if (u.swing > 0) u.swing -= DT;
    if (u.repathIn > 0) u.repathIn--;
    if (u.exhausted && u.cal > st.maxCalories * K.exhaustedRecoverFraction) u.exhausted = false;
    if (u.cal <= 0) { u.cal = 0; u.exhausted = true; }
    // re-arm from its own cargo: crystal it carries tops up the weapon pack
    if (u.crystal > 0 && u.ammo < st.loadoutCrystal) { const k = Math.min(u.crystal, st.loadoutCrystal - u.ammo); u.crystal -= k; u.ammo += k; }

    let anim: UnitAnim = 'idle';
    const moved = this.runOrder(u) || midStride(u, this.tick); // a hopper crouching between bounds is still on its way
    tickFlight(this, u, moved, DT, (fx, fy) => this.face(u, fx, fy));
    if (moved) anim = 'walk';
    if (u.airborne) anim = 'fly'; // in the air, moving, hovering or throwing
    if (u.swing > 0 && !u.airborne) anim = 'attack';
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
      case 'wild': return eating(this, u) ? false : this.runWild(u, o); // being fed by a tamer: it stands and eats
      case 'hunt': return this.runHunt(u, o);
      case 'muster': return this.runMuster(u, o.building);
      case 'tame': return runTame(this, u, o.target);
      case 'rearm': return bearerAbility.runRearm(this, u, o.unit);
      case 'eatFrom': return bearerAbility.runEatFrom(this, u, o.unit);
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
      case 'cart': return this.logistics.runCart(u, o);
    }
  }

  /** Complete the current order, returning to a resumed one if present. */
  /** @internal sim helper, also used by logistics */
  finish(u: Unit): void {
    u.order = u.resume ?? u.queue.shift() ?? { kind: 'idle' };
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
    // a food bearer close by beats walking home (sim/abilities/bearer.ts)
    const fb = bearerAbility.nearestFoodBearer(this, u);
    const dFb = fb ? (fb.x - u.x) ** 2 + (fb.y - u.y) ** 2 : Infinity;
    const dB = b ? (b.ox + b.size / 2 - u.x) ** 2 + (b.oy + b.size / 2 - u.y) ** 2 : Infinity;
    if (fb && dFb < dB) { this.detour(u, { kind: 'eatFrom', unit: fb.id }); return true; }
    if (b) { this.detour(u, { kind: 'resupply', building: b.id }); return true; }
    return false;
  }

  private runIdle(u: Unit): boolean {
    if (u.carter) { if ((this.tick + u.id) % 40 === 0) this.logistics.autoAssignCart(u); return false; }
    if (this.runEngage(u)) return u.x !== u.px || u.y !== u.py;
    if (bearerAbility.sweep(this, u)) return false; // idle bearers sweep up spent crystals nearby
    // idle throwers top their packs up from spent crystals (or a bearer) nearby, not just when empty
    if (u.throws && u.ammo < u.stats.loadoutCrystal - 1e-6 && (this.tick + u.id) % 20 === 0) this.seekAmmo(u, false);
    return false;
  }

  /** Hunting: reach the animal and bring it down, then gather what it leaves. */
  private runHunt(u: Unit, o: Extract<Order, { kind: 'hunt' }>): boolean {
    const prey = this.units.get(o.target);
    if (prey && prey.hp > 0) {
      o.x = prey.x; o.y = prey.y;
      if (!this.moveTo(u, prey.x, prey.y, u.stats.radius + prey.stats.radius + 0.4)) return u.x !== u.px || u.y !== u.py;
      this.face(u, prey.x - u.x, prey.y - u.y);
      prey.hp = 0; // it leaves a carcass when it's reaped this tick
      return false;
    }
    const carcass = [...this.nodes.values()].find((n) => n.carcass && (n.x - o.x) ** 2 + (n.y - o.y) ** 2 < 9);
    if (carcass) u.order = { kind: 'gather', node: carcass.id, nodeType: 'food', phase: 'toNode', stopWhenArmed: false };
    else this.finish(u);
    return false;
  }

  /** Wildlife: wander near home; the aggressive attack what comes close (within a leash). Passive ones just graze. */
  private runWild(u: Unit, o: Extract<Order, { kind: 'wild' }>): boolean {
    const moving = () => u.x !== u.px || u.y !== u.py;
    const fromHome = Math.hypot(u.x - o.hx, u.y - o.hy);
    const nearest = (r: number) => {
      let best: Unit | null = null, bestD = r * r;
      for (const e of this.units.values()) {
        if (e.owner === u.owner || e.dummy) continue;
        const d = (e.x - u.x) ** 2 + (e.y - u.y) ** 2;
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    };
    if (u.wild === 'aggressive') {
      if (u.engage && fromHome < WILD.leash && this.units.has(u.engage) && this.attackTarget(u, u.engage)) return moving();
      u.engage = 0;
      if (fromHome < WILD.leash && (this.tick + u.id) % 5 === 0) {
        const e = nearest(WILD.aggro);
        if (e) { u.engage = e.id; return moving(); }
      }
    }
    if (fromHome > WILD.leash) { o.tx = o.hx; o.ty = o.hy; } // strayed too far: head home
    if (Math.hypot(u.x - o.tx, u.y - o.ty) > 0.4) { this.moveTo(u, o.tx, o.ty, 0.3); return moving(); }
    if (o.rest > 0) { o.rest--; return false; }
    // pick the next spot to graze or prowl
    const a = this.rng.next() * Math.PI * 2, r = this.rng.next() * WILD.wander;
    const spot = this.grid.nearestOpen(o.hx + Math.cos(a) * r, o.hy + Math.sin(a) * r, 3);
    if (spot) { o.tx = spot[0]; o.ty = spot[1]; }
    o.rest = this.rng.int(40, 160);
    return false;
  }

  /** Auto-acquire and fight enemies in sight. Returns true while engaged. */
  private runEngage(u: Unit): boolean {
    if (!this.armed(u) || u.exhausted || u.carter) { u.engage = 0; return false; }
    if (!u.stats.canAttack && !u.militia && u.order.kind !== 'attackMove') { u.engage = 0; return false; } // workers don't start fights on their own
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
    const wpn = this.weapon(u);
    if (!wpn) {
      if (u.throws) {
        if (this.seekAmmo(u, true)) return true; // spent crystals or a bearer close by
        const b = this.nearestCache(u, (x) => x.stock.crystal >= u.crystalMass);
        if (b) { this.detour(u, { kind: 'resupply', building: b.id }); return true; }
      } else if (u.stats.improvised) {
        // a worker sent to fight grabs a crystal from the nearest building that has one
        const b = this.nearestCache(u, (x) => x.stock.crystal >= u.stats.improvised!.crystalMass);
        if (b) { this.detour(u, { kind: 'muster', building: b.id }); return true; }
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
    // buildings: units stop near tile centres, so anyone on a tile touching it (≤ ~0.75 from a corner) can reach
    // a flier in the air bombs: it flies right over the target and drops (sim/abilities/flight.ts)
    const range = u.airborne && wpn.throws ? BOMB_REACH : tb ? Math.max(wpn.range, 1) : wpn.range;
    if (edge > range - 0.05) {
      if (tu || u.airborne) { this.moveTo(u, tx, ty, 0.05); return true; }
      // buildings: walk to the open tile nearest the closest edge point
      const b = tb!;
      const ex = Math.max(b.ox - 0.5, Math.min(u.x, b.ox + b.size + 0.5)), ey = Math.max(b.oy - 0.5, Math.min(u.y, b.oy + b.size + 0.5));
      const open = this.grid.nearestOpen(ex, ey, 4);
      if (open) this.moveTo(u, open[0], open[1], 0.1);
      return true;
    }
    if (tu && !canReach(u, tu)) return false; // a flier in the air: only thrown crystals reach it
    if (u.airborne && !wpn.throws) u.airborne = false; // a melee flier lands to strike
    this.face(u, tx - u.x, ty - u.y);
    if (u.cooldown > 0 || u.exhausted) return true;
    if (u.cal < wpn.attackCalories) { u.exhausted = true; return true; }
    u.cal -= wpn.attackCalories;
    u.busy = true;
    u.cooldown = wpn.cooldown;
    u.swing = Math.min(0.45, wpn.cooldown * 0.8);
    this.events.push({ type: 'attack', x: u.x, y: u.y, owner: u.owner, specId: u.specId, style: wpn.throws ? 'throw' : 'strike', kg: wpn.crystalMass });
    if (wpn.throws) {
      u.ammo -= u.crystalMass;
      const bomb = u.airborne && u.alt > 0.5;
      const flight = bomb ? dropTime(u.alt) : Math.max(0.25, Math.sqrt((tx - u.x) ** 2 + (ty - u.y) ** 2) / (u.stats.crystalVelocity * 0.7));
      let ax = tx, ay = ty;
      if (tu) { ax += ((tu.x - tu.px) / DT) * flight; ay += ((tu.y - tu.py) / DT) * flight; } // lead the target
      const p: Projectile = {
        id: this.nextId++, owner: u.owner, sx: u.x, sy: u.y, sz: bomb ? u.alt : 0, tx: ax, ty: ay, t: 0, duration: flight,
        damage: u.stats.damage + heightBonus(u), crystalKg: u.crystalMass, target: targetId, drop: bomb || undefined,
      };
      this.projectiles.set(p.id, p);
    } else {
      this.damage(targetId, wpn.damage, tx, ty);
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
      if (e.owner === u.owner || (e.dummy && !includeDummies) || !canReach(u, e)) continue;
      // animals: only on an explicit attack-move, or when one is attacking one of ours (defend, don't hunt)
      if (e.wild && !includeDummies && !(e.engage && this.units.get(e.engage)?.owner === u.owner)) continue;
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

  /** @internal sim helper, also used by logistics */
  carry(u: Unit, r: ResourceKind, kg: number): void {
    if (r === 'food') u.food += kg; else if (r === 'wood') u.wood += kg; else u.crystal += kg;
  }

  private runGather(u: Unit, o: Extract<Order, { kind: 'gather' }>): boolean {
    let node = this.nodes.get(o.node);
    if (o.phase !== 'toDrop' && (!node || node.amount <= 0.001)) {
      const bearer = this.isBearer(u);
      const next = o.stopWhenArmed || bearer ? null : this.nearestNode(u, o.nodeType, 10, false, node);
      if (next) { o.node = next.id; o.phase = 'toNode'; node = next; }
      else if (this.cargo(u) > 0.5 && !o.stopWhenArmed && !bearer) o.phase = 'toDrop';
      else { this.finish(u); return false; }
    }
    if (o.phase === 'toNode') {
      const n = node!;
      // carrying a different resource? drop it off first so the whole pack is free for this one
      const other = (o.nodeType !== 'food' ? u.food : 0) + (o.nodeType !== 'wood' ? u.wood : 0) + (o.nodeType !== 'crystal' ? u.crystal : 0);
      if (other > 0.05 && !o.stopWhenArmed && this.nearestCache(u, () => true)) { o.phase = 'toDrop'; return false; }
      // Shards lie on open ground, often under a crowd or a dummy: pick up from arm's reach.
      const reach = n.shard ? u.stats.radius + 0.45 : 0.85 + u.stats.radius;
      if (this.moveToNear(u, n.x, n.y, reach, !n.shard)) o.phase = 'harvest';
      return u.x !== u.px || u.y !== u.py;
    }
    if (o.phase === 'harvest') {
      const n = node!;
      if (u.exhausted) return false;
      this.face(u, n.x - u.x, n.y - u.y);
      const boost = n.shard ? { mult: 1, from: null } : this.boostAt(u.owner, n.x, n.y, n.type);
      const rate = n.shard ? Math.max(2, u.stats.gatherRate * 4) : u.stats.gatherRate * boost.mult;
      let want: number;
      if (n.shard) {
        // spent crystals are picked up whole; re-arming fills the weapon pack, gathering the cargo pack
        want = Math.min(rate * DT, n.amount, o.stopWhenArmed ? Math.max(0, u.stats.loadoutCrystal - u.ammo) : this.freeCapacity(u));
      } else want = this.gatherUnits(u, rate, n.amount);
      if (want > 0) {
        n.amount -= want;
        if (o.stopWhenArmed) u.ammo += want; else this.carry(u, n.type, want);
        if (!n.shard) this.stats.gather(u.owner, n.type, want);
        this.burnBoost(boost, want);
        u.cal -= K.gatherCalPerKg * want;
        u.busy = true;
      }
      if (n.amount <= 0.001) this.removeNode(n);
      const full = this.freeCapacity(u) < (n.shard ? 0.05 : 1 - 1e-6);
      if (o.stopWhenArmed) {
        if (u.ammo >= u.stats.loadoutCrystal - 1e-6 || n.amount <= 0.001) this.finish(u);
      } else if (full) {
        if (this.isBearer(u)) this.finish(u); // a bearer keeps what it carries to hand out
        else o.phase = 'toDrop';
      }
      return false;
    }
    // toDrop: the nearest finished building (carts move it on from there), or a nearer walking drop-off
    const drop = this.nearestCache(u, () => true);
    const dd = drop ? (drop.ox + drop.size / 2 - u.x) ** 2 + (drop.oy + drop.size / 2 - u.y) ** 2 : Infinity;
    const carrier = nearestDropOff(this, u, dd);
    // or a conveyor belt nearer still: unload onto it and the goods ride home
    const belt = nearestBelt(this, u, carrier ? (carrier.x - u.x) ** 2 + (carrier.y - u.y) ** 2 : dd);
    if (belt) {
      if (this.moveTo(u, belt[0], belt[1], 0.45)) { loadBelt(this, u, belt[0], belt[1]); o.phase = 'toNode'; }
      return u.x !== u.px || u.y !== u.py;
    }
    if (carrier) {
      if (this.moveTo(u, carrier.x, carrier.y, u.stats.radius + carrier.stats.radius + 0.5)) {
        this.transfer(u, carrier);
        if (this.cargo(u) < 0.5) o.phase = 'toNode'; // all handed over (else the rest goes to a building)
      }
      return u.x !== u.px || u.y !== u.py;
    }
    if (!drop) return false;
    if (this.moveToBuilding(u, drop)) {
      this.deposit(u, drop);
      if (u.cal < u.stats.maxCalories * 0.5 && drop.stock.food > 1) {
        this.detour(u, { kind: 'resupply', building: drop.id });
        return false;
      }
      o.phase = 'toNode';
      if (!this.nodes.get(o.node)) {
        const next = this.nearestNode(u, o.nodeType, 14, false);
        if (next) o.node = next.id; else this.finish(u);
      }
    }
    return u.x !== u.px || u.y !== u.py;
  }

  /** An ammo bearer: a walking crystal pile (see sim/abilities/bearer.ts). */
  isBearer(u: Unit): boolean { return bearerAbility.isBearer(this, u); }
  bearerRes(u: Unit): 'crystal' | 'food' | null { return bearerAbility.bearerRes(this, u); }

  /** Can this unit gather `r` (any resource if omitted)? Ammo bearers gather crystal only, and keep it. */
  gathers(u: Unit, r?: ResourceKind): boolean { return bearerAbility.gathers(this, u, r); }

  /** A dry thrower's nearest crystal: a spent one on the ground, or a bearer to take from. Sets a detour/order; false if none. */
  private seekAmmo(u: Unit, detour: boolean): boolean {
    if (u.stats.flight) {
      // a flier doesn't land among the enemy to pick crystals off the ground: it flies home to reload
      const home = this.nearestCache(u, (b) => b.stock.crystal >= u.crystalMass);
      if (!home) return false;
      const order: Order = { kind: 'resupply', building: home.id };
      if (detour) this.detour(u, order); else u.order = order;
      return true;
    }
    const shard = this.nearestNode(u, 'crystal', u.stats.sight, true);
    const bearer = bearerAbility.nearestBearer(this, u);
    const ds = shard ? (shard.x - u.x) ** 2 + (shard.y - u.y) ** 2 : Infinity;
    const db = bearer ? (bearer.x - u.x) ** 2 + (bearer.y - u.y) ** 2 : Infinity;
    if (ds === Infinity && db === Infinity) return false;
    const order: Order = db < ds ? { kind: 'rearm', unit: bearer!.id } : { kind: 'gather', node: shard!.id, nodeType: 'crystal', phase: 'toNode', stopWhenArmed: true };
    if (detour) this.detour(u, order); else u.order = order;
    return true;
  }

  /** Take a crystal from a building to fight with (town bell, or a worker sent to attack). */
  private runMuster(u: Unit, buildingId: number): boolean {
    const b = this.buildings.get(buildingId);
    const kg = u.stats.improvised?.crystalMass ?? 0;
    if (!b || b.owner !== u.owner || !b.complete || b.stock.crystal < kg || u.crystal >= kg) {
      if (!b || b.stock.crystal < kg) { const alt = this.nearestCache(u, (x) => x.stock.crystal >= kg); if (alt && alt !== b && u.crystal < kg) { u.order = { kind: 'muster', building: alt.id }; return false; } }
      this.finish(u); return false;
    }
    if (!this.moveToBuilding(u, b)) return u.x !== u.px || u.y !== u.py;
    this.deposit(u, b, ['food', 'wood']); // put down what it was carrying
    const take = Math.min(kg - u.crystal, b.stock.crystal, this.freeCapacity(u));
    if (take > 0) { b.stock.crystal -= take; u.crystal += take; }
    this.finish(u);
    return false;
  }

  private runResupply(u: Unit, buildingId: number): boolean {
    const b = this.buildings.get(buildingId);
    if (!b || b.owner !== u.owner || !b.complete) { this.finish(u); return false; }
    if (!this.moveToBuilding(u, b)) return u.x !== u.px || u.y !== u.py;
    this.deposit(u, b, bearerAbility.depositKinds(this, u)); // a bearer keeps its crystal
    // Restock loadout crystal from this building's stock.
    const need = Math.min(Math.max(0, u.stats.loadoutCrystal - u.ammo), b.stock.crystal);
    if (need > 0) { u.ammo += need; b.stock.crystal -= need; }
    bearerAbility.loadUp(this, u, b); // bearers fill their cargo with what they hand out
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

  /** Unload cargo into a building (buildings hold any amount). @internal also used by logistics */
  deposit(u: Unit, b: Building, only: ResourceKind[] = RESOURCES): void {
    if (only.includes('food')) { b.stock.food += u.food; u.food = 0; }
    if (only.includes('wood')) { b.stock.wood += u.wood; u.wood = 0; }
    if (only.includes('crystal')) { const c = u.crystal; b.stock.crystal += c; u.crystal -= c; }
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

  /** Hand over the giver's cargo. Crystal tops up the receiver's weapon pack first, then its cargo. */
  transfer(from: Unit, to: Unit): void {
    const arm = Math.min(from.crystal, Math.max(0, to.stats.loadoutCrystal - to.ammo));
    from.crystal -= arm; to.ammo += arm;
    let room = this.freeCapacity(to);
    for (const r of ['crystal', 'food', 'wood'] as const) {
      const amt = Math.min(from[r], room);
      from[r] -= amt; to[r] += amt; room -= amt;
    }
  }

  /** Construction: fetch wood from a stockpile (or chop it), carry it to the site. */
  private runBuild(u: Unit, o: Extract<Order, { kind: 'build' }>): boolean {
    const site = this.buildings.get(o.site);
    if (!site || site.owner !== u.owner || site.complete) {
      // done here: move on to the nearest unfinished site close by (a line of walls, the next building)
      const next = this.nearbySite(u);
      if (next) { o.site = next.id; o.phase = u.wood > 0.05 ? 'deliver' : 'fetch'; u.path = []; return false; }
      this.finish(u);
      return false;
    }
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
      if (!this.moveToNear(u, tree.x, tree.y, 0.85 + u.stats.radius, true)) return u.x !== u.px || u.y !== u.py;
      if (u.exhausted) return false;
      this.face(u, tree.x - u.x, tree.y - u.y);
      const boost = this.boostAt(u.owner, tree.x, tree.y, 'wood');
      const want = Math.min(this.gatherUnits(u, u.stats.gatherRate * boost.mult, tree.amount), Math.max(0, Math.ceil(remaining - u.wood)));
      if (want > 0) {
        tree.amount -= want; u.wood += want; u.cal -= K.gatherCalPerKg * want; u.busy = true;
        this.stats.gather(u.owner, 'wood', want);
        this.burnBoost(boost, want);
      }
      if (tree.amount <= 0.001) this.removeNode(tree);
      if (this.freeCapacity(u) < 1 - 1e-6 || u.wood >= remaining - 1e-6 || tree.amount <= 0.001) o.phase = 'deliver';
      return false;
    }
    // fetch: nearest stockpile with wood, else the nearest tree to the site
    const needed = remaining - this.logistics.woodInFlight(site);
    if (needed <= 0.05) return false; // others are already carrying enough
    const src = this.nearestCache(u, (b) => b.stock.wood > 0.5);
    // drop any other cargo first (berries, spare crystal) so the whole pack carries wood
    if (u.food > 0.05 || u.crystal > 0.05) {
      const drop = src ?? this.nearestCache(u, () => true);
      if (drop) {
        if (!this.moveToBuilding(u, drop)) return u.x !== u.px || u.y !== u.py;
        this.deposit(u, drop, ['food', 'crystal']);
        if (u.food > 0.05 || u.crystal > 0.05) return false; // drop was full; keep looking next tick
      }
    }
    if (src) {
      if (!this.moveToBuilding(u, src)) return u.x !== u.px || u.y !== u.py;
      const take = Math.min(Math.floor(this.freeCapacity(u)), Math.ceil(remaining - this.logistics.woodInFlight(site)), Math.floor(src.stock.wood));
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

  /** The nearest unfinished building of a builder's side within a few tiles, if any. */
  private nearbySite(u: Unit): Building | null {
    let best: Building | null = null, bestD = NEARBY_SITE * NEARBY_SITE;
    for (const b of this.buildings.values()) {
      if (b.owner !== u.owner || b.complete) continue;
      const d = (b.ox + b.size / 2 - u.x) ** 2 + (b.oy + b.size / 2 - u.y) ** 2;
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  /** Put wood from a unit's pack into a construction site; HP grows with it. */
  /** @internal sim helper, also used by logistics */
  addToConstruction(site: Building, kg: number, u: Unit): void {
    const amt = Math.min(kg, site.stats.totalCost - site.built);
    if (amt <= 0) return;
    u.wood -= amt;
    site.built += amt;
    site.hp = Math.min(site.maxHp, site.hp + (site.maxHp * amt) / site.stats.totalCost);
    if (site.built >= site.stats.totalCost - 1e-6) this.completeBuilding(site);
  }

  private completeBuilding(b: Building): void {
    b.complete = true;
    this.beltRoutes = null;
    b.built = b.stats.totalCost;
    this.events.push({ type: 'built', id: b.id, owner: b.owner });
  }

  /** Carts: load at the pool's building, take it where it's most needed, repeat. */
  /** @internal sim helper, also used by abilities */
  nearestNode(u: Unit, type: ResourceKind, radius: number, shardsOnly: boolean, exclude?: ResourceNode): ResourceNode | null {
    let best: ResourceNode | null = null, bestD = radius * radius;
    for (const n of this.nodes.values()) {
      if (n.type !== type || n.amount <= 0.001 || n === exclude) continue;
      if (shardsOnly && !n.shard) continue;
      const d = (n.x - u.x) ** 2 + (n.y - u.y) ** 2;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  /** Nearest of the unit's finished buildings matching a test. */
  /** @internal sim helper, also used by logistics */
  nearestCache(u: Unit, test: (b: Building) => boolean): Building | null {
    let best: Building | null = null, bestD = Infinity;
    for (const b of this.buildings.values()) {
      if (b.owner !== u.owner || !b.complete || isUnderfoot(b.spec) || !test(b)) continue; // roads and belts hold nothing
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

  /** @internal sim helper, also used by abilities. Walk toward (gx,gy); true once within `arrive`. */
  moveTo(u: Unit, gx: number, gy: number, arrive: number): boolean {
    const dx = gx - u.x, dy = gy - u.y;
    if (dx * dx + dy * dy <= arrive * arrive) { u.path = []; return true; }
    if (u.stats.flight && !walks(this, u, gx, gy)) { // a short, clear way is walked
      takeOff(u);
      if (u.airborne) return flyTo(this, u, gx, gy, arrive, loadedSpeed(u.stats, this.packLoad(u)), DT, (fx, fy) => this.face(u, fx, fy));
    }
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
    let speed = loadedSpeed(st, this.packLoad(u)) * roadFactor(this, u);
    if (u.exhausted) speed *= K.exhaustedSpeedMul;
    let budget = speed * DT;
    // a bounding gait (sim/abilities/gait.ts): still while crouched, faster in the air
    const stride = strideFactor(u, this.tick, DT);
    if (stride === 0) return false;
    budget *= stride;
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
      u.cal -= u.stats.moveCalPerTile * dist * (1 + (this.packLoad(u) / u.stats.mass) * (u.stats.wheeled ? K.wheelHaulCost : 1)) / roadFactor(this, u);
      u.busy = true;
    }
  }

  /** Walk next to a blocking object at (x,y). */
  private moveToNear(u: Unit, x: number, y: number, reach: number, blocking: boolean): boolean {
    if ((x - u.x) ** 2 + (y - u.y) ** 2 <= reach * reach) { u.path = []; return true; }
    if (!blocking) return this.moveTo(u, x, y, reach);
    // stand on an open tile right next to it (only if it's boxed in, the nearest open ground)
    const open = this.besideSpot(u, Math.floor(x), Math.floor(y)) ?? this.grid.nearestOpen(x, y, 3);
    if (!open) return false;
    const there = this.moveTo(u, open[0], open[1], 0.15);
    const d2 = (x - u.x) ** 2 + (y - u.y) ** 2;
    return d2 <= reach * reach || (there && d2 < 2.3 * 2.3);
  }

  /** The open tile beside tile (tx, ty) nearest to `u`: edge-on before corners, walled-in pockets skipped. Null if boxed in. */
  private besideSpot(u: Unit, tx: number, ty: number): [number, number] | null {
    let best: [number, number] | null = null, bestD = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = tx + dx + 0.5, cy = ty + dy + 0.5;
      if ((!dx && !dy) || this.grid.isBlocked(cx, cy)) continue;
      const wayIn = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ex, ey]) => !this.grid.isBlocked(cx + ex, cy + ey));
      if (!wayIn) continue;
      const d = (cx - u.x) ** 2 + (cy - u.y) ** 2 + (dx && dy ? 2 : 0);
      if (d < bestD) { bestD = d; best = [cx, cy]; }
    }
    return best;
  }

  /** @internal sim helper, also used by logistics */
  moveToBuilding(u: Unit, b: Building): boolean {
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
        if (a.airborne || b.airborne) continue; // fliers pass overhead
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
      if (u.wild || u.tame) {
        const spec = this.specOf(u.owner, u.specId)?.spec as WildSpec | undefined;
        const spot = this.grid.nearestOpen(u.x, u.y, 3);
        if (spot) this.addNode({ type: 'food', x: spot[0], y: spot[1], amount: spec?.meat ?? Math.round(u.stats.mass / 2), shard: false, tree: false, carcass: true });
      } else this.dropShard(u.x, u.y, u.crystal + u.ammo);
      this.events.push({ type: 'death', x: u.x, y: u.y, id: u.id, owner: u.owner, specId: u.specId, heading: u.heading });
    }
    for (const b of this.buildings.values()) {
      if (b.hp > 0) continue;
      this.buildings.delete(b.id);
      this.beltRoutes = null;
      if (isUnderfoot(b.spec)) this.underfootTiles.delete(b.oy * this.grid.width + b.ox);
      else for (let y = b.oy; y < b.oy + b.size; y++) for (let x = b.ox; x < b.ox + b.size; x++) this.grid.block(x, y, -1);
      this.events.push({ type: 'buildingDestroyed', id: b.id, owner: b.owner });
    }
    if (this.tick % TICK_RATE !== 0 || !this.scenario.victory) return;
    for (const p of this.players) {
      if (p.defeated || p.neutral) continue;
      const fighters = this.unitsOf(p.id).filter((u) => !u.carter);
      if (this.buildingsOf(p.id).length === 0 && fighters.length === 0) p.defeated = true;
      else if (this.buildingsOf(p.id).length === 0 && fighters.every((u) => !this.armed(u))) p.defeated = true;
    }
    const alive = this.players.filter((p) => !p.defeated && !p.neutral);
    if (alive.length <= 1 && this.players.filter((p) => !p.neutral).length > 1) {
      this.winner = alive[0]?.id ?? 0;
      this.events.push({ type: 'gameOver', winner: this.winner });
    }
  }

  /** Cheap checksum of simulation state, for desync detection between peers. */
  hash(): number {
    let h = 2166136261 ^ this.tick;
    const mix = (v: number) => { h = Math.imul(h ^ (Math.round(v * 1000) | 0), 16777619); };
    for (const u of this.units.values()) { mix(u.id); mix(u.x); mix(u.y); mix(u.hp); mix(u.cal); mix(u.crystal); mix(u.ammo); mix(u.food); mix(u.wood); }
    for (const b of this.buildings.values()) { mix(b.id); mix(b.hp); mix(b.built); mix(b.queue.length); mix(b.stock.food); mix(b.stock.wood); mix(b.stock.crystal); }
    for (const n of this.nodes.values()) { mix(n.id); mix(n.amount); }
    return h >>> 0;
  }
}
