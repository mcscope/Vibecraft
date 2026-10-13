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

import type { ArtLoader } from '../art/contract';

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
  /** Wheels bear the load: carry capacity ×2, and a full load slows it less and costs fewer calories to haul. */
  wheeled?: boolean;
  /** Can this unit harvest resource nodes? Default true. */
  canGather?: boolean;
  /** Training dummy: never moves, eats or fights. Only for scenarios. */
  dummy?: boolean;
  /**
   * Efficiency beyond raw physics: value per resource multiplier (1 = plain).
   * Paid for in capital: the building that trains it needs effective capital
   * ≥ capitalFor(refinement) (see physics.ts). HP and damage each scale by r^(2/3).
   */
  refinement?: number;
  /**
   * Work refinement: multiplies gather rate and movement speed, so a worker's
   * whole trip is that much faster. Same capital curve as combat refinement; the
   * training building must cover whichever of the two is higher.
   */
  workRefinement?: number;
  /** 'carter': auto-produced supply hauler; never fights, never gathers. */
  role?: 'carter';
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
}

/** Raises one unit type's refinement for its owner, everywhere. Cost derives from the curve. */
export interface TechSpec {
  id: string;
  name: string;
  description: string;
  unit: string;
  /** Refinement added. */
  refinement: number;
  /** Which refinement it raises: 'combat' (HP and damage, default) or 'work' (gather rate and speed). */
  channel?: 'combat' | 'work';
}

export interface FactionSpec {
  id: string;
  name: string;
  /** Unit that a town center starts with / AI uses as its economy unit. */
  workerId: string;
  /** Auto-produced supply hauler. */
  carterId?: string;
  /** Starting base building; trains workers and carters, is where carters load. */
  townCenterId?: string;
  units: UnitSpec[];
  buildings?: BuildingSpec[];
  techs?: TechSpec[];
  /** What this faction calls its resources (they're identical underneath). */
  resourceNames?: Partial<Record<ResourceKind, string>>;
  /** Supplies the faction's art (sprites, building looks, flag, sounds, music) for a team colour. */
  art?: ArtLoader;
}
