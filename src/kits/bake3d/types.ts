// The bake3d kit: build little 3D models out of primitives, light them, and
// bake them into sprites that satisfy the art contract (src/art/contract.ts).
// It's a tool factions may use — the game engine never imports it.

import type { TeamColors } from '../../art/contract';

export type AnimName = 'idle' | 'walk' | 'give' | 'slam' | 'rise' | 'reload' | 'lay' | 'grow' | 'hungry' | 'hatch' | 'fly' | 'leap' | 'climb' | 'soar' | 'glide' | 'land' | 'attack' | 'cut' | 'gather' | 'eat' | 'tired' | 'die';

export interface Pose {
  anim: AnimName;
  /** 0..1 progress through the animation loop (or through the swing / fall). */
  phase: number;
  team: TeamColors;
  /** Is the unit holding a crystal it can strike/throw with? */
  armed: boolean;
  /** What it's hauling, if anything. */
  cargo: 'food' | 'wood' | 'crystal' | null;
  /**
   * A whole-body style on top of `anim` (the baker leans/tilts the model for it; a model may do more):
   * 'charge' runs the walk flat out, leaning in; 'stagger' stumbles off balance; 'brace' sets low, point ready;
   * 'bankL'/'bankR' soar (wings still) rolled into a turn (L: turning toward its +z side); 'swoop' is a glide pulled
   * out level, running in fast low over the ground after a dive (a model may level its glide for it).
   */
  style?: 'charge' | 'stagger' | 'brace' | 'bankL' | 'bankR' | 'swoop';
  /**
   * A body drawn in parts that trail along its path (a caterpillar's segments, like Snake): 0 is the front (its head
   * and what goes with it), 1, 2 … each trailing part on its own, centred where it joins the path. Unset: the whole body.
   */
  part?: number;
}

export type Vec3 = [number, number, number];

/** Surface look. `tex` adds a procedural texture; `team: true` paints it in the team colour. */
export interface Mat {
  color?: string;
  tex?: 'cloth' | 'fur' | 'wood' | 'stone' | 'thatch' | 'leather' | 'metal' | 'skin' | 'hair' | 'leaf' | 'plank' | 'brick' | 'shingle' | 'none';
  rough?: number;
  metal?: number;
  team?: 'primary' | 'secondary';
  emissive?: string;
}

/**
 * Model coordinates: metres-ish. The unit stands on y = 0, faces +x, y is up,
 * +z is its left. A person is ~1.7 tall. One map tile = 2 units. Rotations are [x, y, z] radians.
 */
export interface ModelBuilder {
  readonly team: TeamColors;
  /** Children built inside `build` are positioned relative to this joint. */
  joint(at: Vec3, rot: Vec3, build: (b: ModelBuilder) => void, scale?: number): void;
  box(size: Vec3, at: Vec3, mat: Mat, rot?: Vec3): void;
  /** Ellipsoid when radius is a Vec3. */
  sphere(radius: number | Vec3, at: Vec3, mat: Mat, rot?: Vec3): void;
  /** Upright cylinder centred at `at`. Use `sides` 4 for a square block, 6 for hex. */
  cylinder(rTop: number, rBottom: number, height: number, at: Vec3, mat: Mat, rot?: Vec3, sides?: number): void;
  cone(radius: number, height: number, at: Vec3, mat: Mat, rot?: Vec3, sides?: number): void;
  /** A smooth organic body lofted through cross-sections along a spine (a breast, a torso, a tapering tail): see
   *  `Section`. The surface curves smoothly through them; the ends close. */
  loft(sections: Section[], mat: Mat): void;
  /** A rounded rod from `a` to `b` — arms, legs, staffs, horns. */
  limb(a: Vec3, b: Vec3, radius: number, mat: Mat, radiusB?: number): void;
  /** Hip roof / pyramid with a rectangular base of size [w, h, d], base centred at `at`. */
  roof(size: Vec3, at: Vec3, mat: Mat, rot?: Vec3): void;
  /** Lumpy boulder. */
  rock(size: Vec3, at: Vec3, mat: Mat, seed?: number): void;
  /** A glowing faceted crystal of the given length. */
  crystal(length: number, at: Vec3, rot?: Vec3): void;
}

/** One cross-section of a `loft`: its centre, its half-width (z), how far it rises above the centre and hangs below
 *  it, and `keel` (0 round underneath … 1 a sharp V, a breastbone's ridge); `flat` (0 … 1) squares off its top. */
export interface Section { at: Vec3; w: number; up: number; down: number; keel?: number; flat?: number }

export type UnitModel = (b: ModelBuilder, pose: Pose) => void;

export interface BuildingState {
  phase: 'construction' | 'complete' | 'damaged';
  /** construction: 0, 1, 2. damaged: 1, 2. */
  level: number;
}

/** `state` is given when baking construction/damage looks; ignore it to let the kit add scaffolding and rubble. */
export type BuildingModel = (b: ModelBuilder, state?: BuildingState) => void;
