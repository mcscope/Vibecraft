// Records a model as primitives in one frame (a ModelBuilder that draws nothing), so it can be turned into a printable
// solid. Each primitive keeps its own sizes and the joint frame it was built in, so thin parts can be thickened to a
// printable minimum without changing where they are.
import * as THREE from 'three';
import type { TeamColors } from '../../art/contract';
import type { Mat, ModelBuilder, Section, Vec3 } from '../bake3d/types';

/** A primitive as the model built it: its kind, its own sizes (in its joint's units) and that joint's frame. */
export type Prim =
  | { kind: 'sphere'; frame: THREE.Matrix4; scale: number; r: Vec3; at: Vec3; rot?: Vec3 }
  | { kind: 'box'; frame: THREE.Matrix4; scale: number; size: Vec3; at: Vec3; rot?: Vec3 }
  /** An upright frustum (a cone has rTop 0) centred at `at`, `sides` round. */
  | { kind: 'cylinder'; frame: THREE.Matrix4; scale: number; rTop: number; rBottom: number; height: number; at: Vec3; rot?: Vec3; sides: number }
  | { kind: 'limb'; frame: THREE.Matrix4; scale: number; a: Vec3; b: Vec3; ra: number; rb: number }
  | { kind: 'loft'; frame: THREE.Matrix4; scale: number; sections: Section[] }
  /** A convex shape through these points (in its frame): a roof, a rock. */
  | { kind: 'hull'; frame: THREE.Matrix4; scale: number; points: Vec3[] };

/** Everything a model built: its primitives and its marked points (in the root frame). */
export interface Recording { prims: Prim[]; marks: Map<string, Vec3> }

export class Recorder implements ModelBuilder {
  constructor(readonly team: TeamColors, private frame: THREE.Matrix4, private scale: number, private out: Recording) {}

  /** Record `build` (a model) in a root frame `root`, whose size is `scale` (e.g. millimetres per model unit; a
   *  whole-body lean or squash in `root` is left out of it). */
  static record(team: TeamColors, build: (b: ModelBuilder) => void, root: THREE.Matrix4, scale: number): Recording {
    const out: Recording = { prims: [], marks: new Map() };
    build(new Recorder(team, root, scale, out));
    return out;
  }

  joint(at: Vec3, rot: Vec3, build: (b: ModelBuilder) => void, scale = 1): void {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(scale, scale, scale));
    build(new Recorder(this.team, this.frame.clone().multiply(m), this.scale * scale, this.out));
  }
  box(size: Vec3, at: Vec3, _mat: Mat, rot?: Vec3): void { this.out.prims.push({ kind: 'box', frame: this.frame, scale: this.scale, size, at, rot }); }
  sphere(radius: number | Vec3, at: Vec3, _mat: Mat, rot?: Vec3): void {
    const r: Vec3 = typeof radius === 'number' ? [radius, radius, radius] : radius;
    this.out.prims.push({ kind: 'sphere', frame: this.frame, scale: this.scale, r: [Math.abs(r[0]), Math.abs(r[1]), Math.abs(r[2])], at, rot });
  }
  cylinder(rTop: number, rBottom: number, height: number, at: Vec3, _mat: Mat, rot?: Vec3, sides = 16): void {
    this.out.prims.push({ kind: 'cylinder', frame: this.frame, scale: this.scale, rTop, rBottom: rBottom > 0 ? rBottom : rTop, height, at, rot, sides });
  }
  cone(radius: number, height: number, at: Vec3, _mat: Mat, rot?: Vec3, sides = 16): void {
    this.out.prims.push({ kind: 'cylinder', frame: this.frame, scale: this.scale, rTop: 0, rBottom: radius, height, at, rot, sides });
  }
  loft(sections: Section[], _mat: Mat): void {
    if (sections.length >= 2) this.out.prims.push({ kind: 'loft', frame: this.frame, scale: this.scale, sections });
  }
  limb(a: Vec3, b: Vec3, radius: number, _mat: Mat, radiusB = radius): void {
    if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 1e-4) return;
    this.out.prims.push({ kind: 'limb', frame: this.frame, scale: this.scale, a, b, ra: radius, rb: radiusB });
  }
  roof(size: Vec3, at: Vec3, _mat: Mat, rot?: Vec3): void {
    // a pyramid on a [w, d] base, `h` high, its base centred at `at`
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0]))), new THREE.Vector3(1, 1, 1));
    const pts = ([[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [0, 1, 0]] as Vec3[])
      .map(([x, y, z]) => new THREE.Vector3(x * size[0], y * size[1], z * size[2]).applyMatrix4(m).toArray() as Vec3);
    this.out.prims.push({ kind: 'hull', frame: this.frame, scale: this.scale, points: pts });
  }
  rock(size: Vec3, at: Vec3, _mat: Mat): void {
    // (drawn lumpy; printed as the smooth boulder it roughly is)
    this.out.prims.push({ kind: 'sphere', frame: this.frame, scale: this.scale, r: [size[0] * 0.95, size[1] * 0.76, size[2] * 0.95], at });
  }
  crystal(length: number, at: Vec3, rot?: Vec3): void {
    // as the bake3d builder draws it: a hexagonal prism, pointed at the top, a short point below
    this.joint(at, rot ?? [0, 0, 0], (b) => {
      const r = length * 0.22;
      b.cylinder(r, r, length * 0.6, [0, length * 0.3, 0], {}, undefined, 6);
      b.cone(r, length * 0.4, [0, length * 0.8, 0], {}, undefined, 6);
      b.cone(r, length * 0.15, [0, -length * 0.075, 0], {}, [Math.PI, 0, 0], 6);
    });
  }
  mark(name: string, at: Vec3): void {
    this.out.marks.set(name, new THREE.Vector3(...at).applyMatrix4(this.frame).toArray() as Vec3);
  }
}
