// The contract between a player's vibecoded army and the game.
//
// A UnitSpec is mostly *physical description*: how heavy the creature is, how
// that mass is split between muscle / frame / reserves, and what crystal it
// fights with. Every gameplay stat (HP, speed, damage, cost...) is DERIVED from
// these numbers by src/sim/physics.ts — players never set stats directly.
// That is the balance guarantee.
//
// Visuals are a little 3D model built from primitives (see ModelBuilder). At
// load time the game lights it and pre-renders it into sprite sheets in 8
// facings — the same trick Age of Empires II and StarCraft used.

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
  attack: AttackSpec;
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
  /** 'carter': auto-produced supply hauler; never fights, never gathers. */
  role?: 'carter';
  /** Builds the unit's 3D model for one animation frame. Never affects simulation. */
  model: UnitModel;
}

export type AnimName = 'idle' | 'walk' | 'attack' | 'gather' | 'eat' | 'tired' | 'die';

export interface TeamColors {
  primary: string;
  secondary: string;
  dark: string;
}

export interface Pose {
  anim: AnimName;
  /** 0..1 progress through the animation loop (or through the swing / fall). */
  phase: number;
  team: TeamColors;
  /** Is the unit holding a crystal it can strike/throw with? */
  armed: boolean;
  /** What it's hauling, if anything. */
  cargo: 'food' | 'wood' | 'crystal' | null;
}

export type Vec3 = [number, number, number];

/** Surface look. `tex` adds a procedural texture; `team: true` paints it in the team colour. */
export interface Mat {
  color?: string;
  tex?: 'cloth' | 'fur' | 'wood' | 'stone' | 'thatch' | 'leather' | 'metal' | 'skin' | 'hair' | 'leaf' | 'none';
  rough?: number;
  metal?: number;
  team?: 'primary' | 'secondary';
  emissive?: string;
}

/**
 * Model coordinates: metres-ish. The unit stands on y = 0, faces +x, y is up,
 * +z is its left. A person is ~1.7 tall. Rotations are [x, y, z] radians.
 */
export interface ModelBuilder {
  readonly team: TeamColors;
  /** Children built inside `build` are positioned relative to this joint. */
  joint(at: Vec3, rot: Vec3, build: (b: ModelBuilder) => void, scale?: number): void;
  box(size: Vec3, at: Vec3, mat: Mat, rot?: Vec3): void;
  /** Ellipsoid when radius is a Vec3. */
  sphere(radius: number | Vec3, at: Vec3, mat: Mat, rot?: Vec3): void;
  /** Upright cylinder centred at `at`. Use `sides` 4 for a square pyramid-ish block, 6 for hex. */
  cylinder(rTop: number, rBottom: number, height: number, at: Vec3, mat: Mat, rot?: Vec3, sides?: number): void;
  cone(radius: number, height: number, at: Vec3, mat: Mat, rot?: Vec3, sides?: number): void;
  /** A rounded rod from `a` to `b` — arms, legs, staffs, horns. */
  limb(a: Vec3, b: Vec3, radius: number, mat: Mat, radiusB?: number): void;
  /** Hip roof / pyramid with a rectangular base of size [w, h, d], base centred at `at`. */
  roof(size: Vec3, at: Vec3, mat: Mat, rot?: Vec3): void;
  /** Lumpy boulder. */
  rock(size: Vec3, at: Vec3, mat: Mat, seed?: number): void;
  /** A glowing faceted crystal of the given length. */
  crystal(length: number, at: Vec3, rot?: Vec3): void;
}

export type UnitModel = (b: ModelBuilder, pose: Pose) => void;

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
  /** Size of the cart pool this building keeps. Its carts load here and supply other buildings. */
  carters?: number;
  attack?: TowerSpec;
  /** Players can't place it (e.g. a starting-only building). */
  unbuildable?: boolean;
  model: (b: ModelBuilder) => void;
}

/** Raises one unit type's refinement for its owner, everywhere. Cost derives from the curve. */
export interface TechSpec {
  id: string;
  name: string;
  description: string;
  unit: string;
  /** Refinement added. */
  refinement: number;
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
}
