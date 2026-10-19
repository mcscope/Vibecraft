// The contract between a player's vibecoded army and the game.
//
// A UnitSpec is mostly *physical description*: how heavy the creature is, how
// that mass is split between muscle / frame / reserves, and what crystal it
// fights with. Every gameplay stat (HP, speed, damage, cost...) is DERIVED from
// these numbers by src/sim/physics.ts — players never set stats directly.
// That is the balance guarantee.
//
// Visuals are NOT part of the spec: a faction supplies finished art through
// `FactionSpec.art` (see src/art/contract.ts). How it makes that art — a 3D
// bake, hand-drawn sheets, generated images — is up to the faction.

import type { ArtLoader, BiomeLoader } from '../art/contract';

export type AttackStyle = 'strike' | 'throw';

/** How the body mass is allocated. Normalized to sum to 1, each part >= 0.1. */
export interface Physique {
  /** Power, carry capacity, speed, limb speed. */
  muscle: number;
  /** Bone, hide, shell: hit points. */
  frame: number;
  /** Fat, stored energy: the calorie tank. */
  reserve: number;
}

export interface AttackSpec {
  style: AttackStyle;
  /** kg. Strikers swing one crystal and keep it; throwers launch one per attack. */
  crystalMass: number;
  /** Throwers only: how many crystals the unit spawns with / restocks to. */
  ammo?: number;
  /** Throwers only: metres of sling cord (0 up to its body's height). A lever: the stone leaves faster in proportion to arm + cord, up to what the muscle's energy allows, but each throw has to be spun up first (sim/physics.ts). */
  sling?: number;
  /** Strikers only: metres of wooden shaft (0–3), a spear or pike. Held a quarter of the way along, ¾ of it adds reach; its wood (1.5 kg/m) is priced like body mass and swung with the crystal, so it hits harder and recovers slower. Like every blow, a strike also carries the collision energy of the bodies closing (sim/world.ts). */
  shaft?: number;
  /** Strikers with a shaft only: a hand weapon worn beside it (sword, axe), struck where the point can't bear: inside it, or off to the side (sim/abilities/sidearm.ts). */
  sidearm?: { crystalMass: number };
}

export interface UnitSpec {
  id: string;
  name: string;
  description: string;
  /** Total body mass in kg. */
  mass: number;
  physique: Physique;
  /** Omit for units that can't fight (e.g. carts). */
  attack?: AttackSpec;
  /** Wheels bear the load: carry capacity ×4 (K.wheelCarry), and a full load slows it less and costs fewer calories to haul. */
  wheeled?: boolean;
  /**
   * How it moves. Omitted: a steady walk. `hop`: it bounds, moving only for the
   * airborne share of each stride (`hop`, 0.3–0.95; the rest is the crouch, a little
   * before take-off and the rest after landing), faster while in the air so its
   * average speed is unchanged. `period`: seconds per stride (default 1). The
   * walk animation is played by stride, so frame f/n is that point in the stride:
   * airborne from (1 − hop) × ⅔ to that plus hop.
   */
  gait?: { hop: number; period?: number };
  /**
   * Metres nose to tail (any body plan, any number of legs). Every body turns its line no faster than speed ÷ length:
   * a long body keeps its momentum and wheels round (like a flier); a short one turns so tight it plants and pivots.
   * Leave it out for an upright body: it's then its front-to-back depth, from its mass (a 70 kg person: ~0.3 m).
   */
  length?: number;
  /** It flies: walks short hops, takes off to go further, straight over everything; burns calories aloft (∝ mass, so endurance comes from its reserve); lands when it stops or runs low. Melee fliers land to strike. */
  flight?: boolean | { height: number };
  /** Can this unit harvest resource nodes? Default true. */
  canGather?: boolean;
  /** Training dummy: never moves, eats or fights. Only for scenarios. */
  dummy?: boolean;
  /**
   * Efficiency beyond raw physics: value per resource multiplier (1 = plain).
   * Paid for in capital: the building that trains it needs effective capital
   * ≥ capitalFor(refinement) (see physics.ts). Refinement makes resources more
   * efficient: the unit costs 1/r of its body's food. Its stats stay pure physics.
   */
  refinement?: number;
  /**
   * Work refinement: multiplies gather rate, movement speed and carry capacity,
   * so a worker brings home that much more, that much sooner. Same capital curve as combat refinement; the
   * training building must cover whichever of the two is higher.
   */
  workRefinement?: number;
  /** 'carter': auto-produced supply hauler; never fights, never gathers. */
  role?: 'carter';
  /**
   * Bearer: a walking pile of `resource` (default crystal). Crystal: an ammo
   * bearer; friendly throwers that run dry come to it and take a load, just like
   * picking spent crystals off the ground (from up to `radius` tiles beyond their
   * sight). Food: hungry units nearby eat from it instead of walking home.
   * Refills at any of its side's buildings (right-click the building).
   */
  bearer?: { radius: number; resource?: 'crystal' | 'food' };
  /** A walking drop-off: gatherers unload into it like a building (up to its cargo capacity); it unloads at a building. */
  dropOff?: boolean;
  /** Can tame wild animals by feeding them from its pack (sim/abilities/herding.ts). */
  tamer?: boolean;
  /**
   * Metamorphosis: forms (unit ids of this faction) it can change into where it stands, paying only the difference
   * in food (up front), over 6 s × the new form's refinement plus growing any extra body; each at most 1.0 more refined than this (sim/abilities/metamorph.ts).
   */
  becomes?: string[];
  /** Spawning: units (of this faction, no more refined than this) it can grow beside it, paying their whole price in food over 6 s × their refinement plus growing their body (sim/abilities/metamorph.ts). */
  spawns?: string[];
  /** The unit it changes inside: ordered to change, it becomes this at once, at its own mass, and the new form emerges from it (sim/abilities/metamorph.ts). Without one it changes in place. */
  shell?: string;
  /** How metamorphosis and spawning take their food: 'upfront' (default: like a building's training, it starts once the whole cost is on hand) or 'eaten' (eaten as it goes, pausing when the food runs out). */
  growthFood?: 'upfront' | 'eaten';
}

export type ResourceKind = 'food' | 'wood' | 'crystal';
export type Stock = Record<ResourceKind, number>;

/** A building's optional weapon: a thrower without legs. Paid for separately; not capital. */
export interface TowerSpec {
  /** kg of mechanism (counterweights, torsion...). Works like muscle mass. */
  mechanism: number;
  /** kg per crystal thrown. Taken from the building's own stock. */
  crystalMass: number;
  /** metres the crystal is launched from. Adds m·g·h energy and range; costs mechanism·h/4. */
  height: number;
  /** Shots' worth of crystal ammo the building asks to keep on hand (default 40). */
  stockShots?: number;
}

/**
 * A building is described physically too. Its capital is its materials (the
 * faction's building resource, "wood" under the hood); HP, cache size and the
 * refinement it can support all derive from that.
 */
export interface BuildingSpec {
  id: string;
  name: string;
  description: string;
  /** Square footprint, tiles per side. Must hold the materials (≤150 kg per tile). */
  size: number;
  /** kg of building resource. This is the building's capital. */
  materials: number;
  /** Building types that must exist before this can be placed. Their capital links in at 100%. */
  requires?: string[];
  trains?: string[];
  researches?: string[];
  /**
   * Carts this building keeps at minimum (replaced automatically). Its carts load
   * here and supply other buildings; list the carter in `trains` to allow more.
   */
  carters?: number;
  attack?: TowerSpec;
  /**
   * Infrastructure: gathering these resources within `radius` tiles goes faster
   * by refinementFor(this building's capital). The capital stays on the map —
   * lose the building, lose the boost. Boosts don't stack; the best one applies.
   */
  gatherBoost?: { radius: number; resources: ResourceKind[] };
  // (the boost burns crystal from the building's stock: CAP.boostCrystalPerKg per extra kg; none on hand, no boost)
  /**
   * Sowing: plants new berry bushes / trees on open ground within `radius`.
   * `mechanism` (kg of sowing machinery, paid like a tower's mechanism, not
   * capital) sets the planting rate. Each planting costs a third of its eventual
   * yield as seed from this building's stock; the plant then grows to full.
   */
  sow?: {
    mechanism: number;
    radius: number;
    resources: Array<'food' | 'wood'>;
    /** kg a sown plant grows to (default 200 for bushes, 100 for trees). */
    plantKg?: Partial<Record<'food' | 'wood', number>>;
    /** Most living plants of each kind it keeps going (default 6 bushes, 8 trees). */
    maxPlants?: Partial<Record<'food' | 'wood', number>>;
  };
  /** Players can't place it (e.g. a starting-only building). */
  unbuildable?: boolean;
  /** A wall piece: blocks the way, laid in lines by hand (shift-click to keep placing). The AI doesn't build these. */
  wall?: boolean;
  /**
   * A living building: planted with `seed` (0–1) of its materials, then it grows by
   * eating food from its stock, `grow` kg/s, up to its full materials. HP and capital
   * (so what it can train) follow its current size.
   */
  living?: { seed: number; grow: number };
  /** Underfoot road (1 tile, blocks nothing): anyone on it moves `speed`× (1–2) as fast for fewer calories; wheels gain twice as much. */
  road?: { speed: number };
  /** Underfoot conveyor belt (1 tile): gatherers unload onto it; goods ride the joined belt at `speed` tiles/s to a building it touches. */
  conveyor?: { speed: number };
  /** Breeds your tamed animals standing within `radius` tiles (pairs make young, paid from its food). */
  pen?: { radius: number };
}

/** Raises one unit type's refinement for its owner, everywhere. Cost derives from the curve. */
export interface TechSpec {
  id: string;
  name: string;
  description: string;
  /** A line of flavour text, shown in italics (no rules in it). */
  flavor?: string;
  unit: string;
  /** Refinement added. */
  refinement: number;
  /** Which refinement it raises: 'combat' (training cost ÷ r, default) or 'work' (gather rate, speed and carry). */
  channel?: 'combat' | 'work';
}

/** What a faction calls a resource (lowercase). */
export const resourceName = (f: FactionSpec, r: ResourceKind): string =>
  (f.resourceNames?.[r] ?? { food: 'food', wood: 'wood', crystal: 'crystal' }[r]).toLowerCase();
/** What a faction calls its worker, its base and its supply hauler (for UI text). */
export const workerName = (f: FactionSpec): string => f.units.find((u) => u.id === f.workerId)?.name ?? 'Worker';
export const baseName = (f: FactionSpec): string => f.buildings?.find((b) => b.id === f.townCenterId)?.name ?? 'base';
export const carterName = (f: FactionSpec): string => (f.carterId && f.units.find((u) => u.id === f.carterId)?.name) || 'hauler';

export interface FactionSpec {
  id: string;
  name: string;
  /** Unit that a town center starts with / AI uses as its economy unit. */
  workerId: string;
  /** Auto-produced supply hauler. */
  carterId?: string;
  /** Starting base building; trains workers and carters, is where carters load. */
  townCenterId?: string;
  /** Workers you start with (default 5). They and the starting base are paid from the same starting pool (sim/fairness.ts), the rest is your starting stock. */
  startWorkers?: number;
  units: UnitSpec[];
  buildings?: BuildingSpec[];
  techs?: TechSpec[];
  /** What this faction calls its resources (they're identical underneath). */
  resourceNames?: Partial<Record<ResourceKind, string>>;
  /** Supplies the faction's art (sprites, building looks, flag, sounds, music) for a team colour. */
  art?: ArtLoader;
  /** The look of this faction's half of the map (ground, trees, bushes, deposits, clutter, wildlife art). */
  biome?: BiomeLoader;
  /** Animals that roam this faction's half of the map. Neutral: they belong to no player. */
  wildlife?: WildSpec[];
}

/**
 * A wild animal: a unit design (same physics as any unit) plus how it behaves.
 * Passive animals graze and can be hunted by workers; aggressive ones attack
 * whatever comes close, chase a little way, then go home. A killed animal leaves
 * a carcass of food.
 */
export interface WildSpec extends UnitSpec {
  temper: 'passive' | 'aggressive';
  /** Animals per group, and groups per map half. */
  group: number;
  count: number;
  /** kg of food the carcass holds (default: half its body mass). */
  meat?: number;
}
