// Poseable figures: a printed body split at its real joints into parts that snap together with ball-and-socket
// joints. (Filled in below.)
import type { PrintPose } from './print';

/** One joint of a figure: the part it moves, hung from its parent, turning about a marked point. */
export interface ArtJoint {
  /** The part this joint moves (named in file names: `<unit>-articulated-<part>.stl`). */
  part: string;
  /** The part it hangs from ('body' is what's left when every part is cut away). */
  parent: string;
  /** The marked point (ModelBuilder.mark) it turns about: a hip, a knee. */
  at: string;
  /** Marked points along the part, out from `at` (its bones): where the part lies. */
  bones: string[];
  /** How far round its bones the part reaches, model units: its whole girth, and no more (so it takes no other part's). */
  reach: number;
  /** The ball's radius, model units (default: as big as the girth at the joint allows). */
  ball?: number;
}

/** How a unit comes apart as a poseable figure: the pose it's cut in, its scale, its joints (parents before children). */
export interface Articulation {
  pose: PrintPose;
  mmPerUnit: number;
  joints: ArtJoint[];
  /** A base disc fused to this part (a one-legged figure stands on its foot's base). */
  baseOn?: string;
}

import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { UnitBakeOptions } from '../bake3d/baker';
import type { UnitModel } from '../bake3d/types';
import type { PrintOptions } from './print';

export interface Figure { plate: Manifold; parts: Array<{ name: string; solid: Manifold; note?: string }>; joints: Array<{ name: string; ball: number; neck: number; wall: number }>; notes: string[] }

export function articulate(_w: ManifoldToplevel, _model: UnitModel, _a: Articulation, _o: Omit<PrintOptions, 'mmPerUnit'>, _bake: UnitBakeOptions = {}): Figure {
  throw new Error('not yet');
}
