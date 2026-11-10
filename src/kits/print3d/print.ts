// A unit in a pose as a printable solid: its model recorded in that pose (as the baker poses it), scaled to millimetres,
// fused into one piece, cut flat where it meets the ground, on a base disc if wanted, held up on a post if it's in the
// air, and stood Z up on the print bed.
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import * as THREE from 'three';
import type { TeamColors } from '../../art/contract';
import { bakedPose, styleBody, type BakedAnim, type UnitBakeOptions } from '../bake3d/baker';
import type { UnitModel, Vec3 } from '../bake3d/types';
import { Recorder, type Recording } from './record';
import { Rays, soup } from './check';
import { connect, fuse, type ConnectReport, type SolidOptions } from './solid';

/** Any colours will do: a print has none (the model only needs them to be given). */
export const PRINT_TEAM: TeamColors = { primary: '#888888', secondary: '#888888', dark: '#444444' };

/** A pose to print: an animation the unit's art bakes, how far through it, and what it holds. */
export interface PrintPose {
  /** Its name in a file name (`<unit>-<name>.stl`). */
  name: string;
  anim: BakedAnim;
  phase: number;
  /** Holding its crystal (default true). */
  armed?: boolean;
  /** Off the ground (flying, mid-bound): held up on a post from a base. */
  air?: boolean;
  /** On a base disc (default: only in the air). */
  base?: boolean;
  /** How high its lowest point is held above the base, mm (in the air; default from its size). */
  lift?: number;
}

/** A faction's standard set of prints (its prints.ts): for each unit, the poses to print it in. */
export interface UnitPrints {
  unit: string;
  poses: PrintPose[];
  /** Millimetres per model unit for this unit (default: the tabletop scale, or bigger to reach `minSize`). */
  mmPerUnit?: number;
  /** Jointed into parts that move, as a poseable figure (see articulate.ts). */
  articulated?: import('./articulate').Articulation;
}

/** The tabletop standard: a 1.7 m person stands 28 mm tall. */
export const TABLETOP = 28 / 1.7;

export interface PrintOptions extends SolidOptions {
  /** Millimetres per model unit (a model unit is a metre). */
  mmPerUnit: number;
  /** The base disc's thickness, mm. */
  baseThick: number;
  /** The post's radius, mm (holding a body in the air). */
  postRadius: number;
  /** How far off the ground a part may be and still be cut flat onto the bed, mm. */
  flat: number;
}

export const DEFAULT_PRINT: Omit<PrintOptions, 'mmPerUnit'> = { minThick: 1.4, facet: 0.35, baseThick: 2, postRadius: 1.6, flat: 0.3 };

export interface PrintReport {
  connect: ConnectReport;
  /** Its footprint on the bed (the base's, if it has one), mm². */
  contact: number;
  /** Its weight sits over its footprint (it stands without falling over). */
  stands: boolean;
  /** How far its centre of mass is inside (+) or outside (-) its footprint's edge, mm. */
  margin: number;
  /** Primitives, as recorded. */
  prims: number;
  /** How much of it (by volume) was below the ground and cut away. */
  belowGround: number;
}

/** Record a unit's model in a pose: the pose as the baker gives it, the whole-body style the baker adds, in mm. */
export function recordPose(model: UnitModel, pose: PrintPose, mm: number, bake: UnitBakeOptions = {}): Recording {
  const p = { ...bakedPose(pose.anim, pose.phase, PRINT_TEAM), armed: pose.armed ?? true };
  const body = new THREE.Object3D();
  styleBody(body, pose.anim, pose.phase, bake);
  if (body.matrixAutoUpdate) body.updateMatrix();
  const root = new THREE.Matrix4().makeScale(mm, mm, mm).multiply(body.matrix);
  return Recorder.record(PRINT_TEAM, (b) => model(b, p), root, mm);
}

/** Y up (the model's) to Z up (the print bed's): x stays, the model's up becomes Z, its left becomes -Y. */
export const Z_UP = new THREE.Matrix4().makeRotationX(Math.PI / 2);
const mat = (m: THREE.Matrix4) => Array.from(m.elements) as unknown as import('manifold-3d').Mat4;

/**
 * Set a standing solid (Y up, ground at y = 0) flat on the ground: whatever reaches the ground (or its lowest point,
 * if nothing does) stands on a flat pad, its own outline `flat` mm up, run straight down. A foot keeps its height:
 * nothing is shaved off it. Anything below the ground is cut away.
 */
export function flatten(w: ManifoldToplevel, m: Manifold, flat: number): Manifold {
  const toZ = mat(Z_UP), back = mat(Z_UP.clone().invert());
  const z = m.transform(toZ), lo = Math.max(0, z.boundingBox().min[2]), cut = lo + flat;
  const pad = w.Manifold.extrude(z.slice(cut), flat + 0.05).translate([0, 0, lo]);
  return w.Manifold.union([z.trimByPlane([0, 0, 1], cut), pad]).translate([0, 0, -lo]).transform(back);
}

/** A unit in a pose as one printable solid, Z up on the bed, centred, its lowest point at z = 0. */
export function printPose(w: ManifoldToplevel, model: UnitModel, pose: PrintPose, o: PrintOptions, bake: UnitBakeOptions = {}): { solid: Manifold; report: PrintReport; marks: Map<string, Vec3> } {
  const rec = recordPose(model, pose, o.mmPerUnit, bake);
  const [fused, rep] = connect(w, fuse(w, rec, o), (o.minThick / 2) * 1.15, o.minThick ** 3 * 0.2);
  let m = fused;
  const whole = m.volume(), below = pose.air ? 0 : Math.max(0, whole - m.trimByPlane([0, 1, 0], 0).volume());
  m = onBed(w, m, pose, o);
  const report = { connect: rep, prims: rec.prims.length, belowGround: below / whole, ...standing(w, m) };
  return { solid: m, report, marks: rec.marks };
}

/** A solid (Y up, its ground at y = 0) set on the bed: flattened, on its base or post, Z up and centred. */
export function onBed(w: ManifoldToplevel, m: Manifold, pose: Pick<PrintPose, 'air' | 'base' | 'lift'>, o: PrintOptions): Manifold {
  const { Manifold } = w;
  const base = pose.base ?? !!pose.air;
  let box = m.boundingBox();
  const len = Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2]);
  if (pose.air) {
    // lifted clear of the base, on a post from the base up into its underside below its middle
    const lift = pose.lift ?? Math.max(12, 0.3 * len);
    m = m.translate([0, lift + o.baseThick - box.min[1], 0]);
    box = m.boundingBox();
    const c = centroid(m);
    // (up through whatever hangs below into the solid part nearest its centre of mass, so it holds the body, not a dangling foot)
    const hits = new Rays(soup(m)).hits([c.x, -1, c.z], [0, 1, 0]).map((t) => t - 1);
    let hit: number | null = null;
    for (let i = 0; i + 1 < hits.length; i += 2) { const mid = (hits[i] + hits[i + 1]) / 2; if (hit === null || Math.abs(mid - c.y) < Math.abs(hit - c.y)) hit = Math.min(mid, hits[i] + o.postRadius * 2); }
    const top = hit !== null ? [c.x, hit - o.postRadius * 1.5, c.z] : (() => { // (nothing straight above its middle: up to its lowest point near there)
      let best: THREE.Vector3 | null = null, bd = Infinity;
      const mesh = m.getMesh(), P = mesh.vertProperties, n = mesh.numProp;
      for (let i = 0; i < P.length; i += n) { const d = Math.hypot(P[i] - c.x, P[i + 2] - c.z) + 0.3 * (P[i + 1] - box.min[1]); if (d < bd) { bd = d; best = new THREE.Vector3(P[i], P[i + 1], P[i + 2]); } }
      return best!.toArray();
    })();
    const reach = top[1] + o.postRadius * 1.5, foot = o.baseThick - 0.5, segs = 24;
    const post = Manifold.cylinder(reach - foot, o.postRadius * 1.3, o.postRadius, segs).transform(mat(new THREE.Matrix4().makeTranslation(top[0], foot, top[2]).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))));
    const r = Math.max(12, 0.28 * len);
    const disc = Manifold.cylinder(o.baseThick, r, r - o.baseThick * 0.6, 64).transform(mat(new THREE.Matrix4().makeTranslation(top[0], 0, top[2]).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))));
    m = Manifold.union([m, post, disc]);
  } else {
    m = flatten(w, m, o.flat);
    if (base) {
      // a disc under where it stands, round its feet and its centre of mass (so it can't tip), the solid sunk a little into it
      const mesh = m.getMesh(), P = mesh.vertProperties, n = mesh.numProp, c = centroid(m), feet: THREE.Vector2[] = [];
      for (let i = 0; i < P.length; i += n) if (P[i + 1] < 1) feet.push(new THREE.Vector2(P[i], P[i + 2]));
      const mid = feet.reduce((s, f) => s.add(f), new THREE.Vector2()).divideScalar(Math.max(1, feet.length));
      const cx = (mid.x + c.x) / 2, cz = (mid.y + c.z) / 2;
      let r = Math.hypot(c.x - cx, c.z - cz) + 6;
      for (const f of feet) r = Math.max(r, Math.hypot(f.x - cx, f.y - cz) + 2.5);
      r = Math.max(r, 0.18 * len);
      const sink = 0.4;
      m = m.translate([0, o.baseThick - sink, 0]);
      const disc = Manifold.cylinder(o.baseThick, r, r - o.baseThick * 0.6, 96).transform(mat(new THREE.Matrix4().makeTranslation(cx, 0, cz).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))));
      m = Manifold.union([m, disc]);
    }
  }
  m = m.transform(mat(Z_UP));
  box = m.boundingBox();
  return m.translate([-(box.min[0] + box.max[0]) / 2, -(box.min[1] + box.max[1]) / 2, -box.min[2]]);
}

/** A solid's centre of mass (uniformly dense). */
export function centroid(m: Manifold): THREE.Vector3 {
  const mesh = m.getMesh(), P = mesh.vertProperties, T = mesh.triVerts, n = mesh.numProp, c = new THREE.Vector3();
  let vol = 0;
  for (let t = 0; t < T.length; t += 3) {
    const [a, b, d] = [0, 1, 2].map((k) => new THREE.Vector3(P[T[t + k] * n], P[T[t + k] * n + 1], P[T[t + k] * n + 2]));
    const v = a.dot(b.clone().cross(d)) / 6;
    vol += v;
    c.addScaledVector(a.clone().add(b).add(d), v / 4);
  }
  return c.divideScalar(vol || 1);
}

/** Does a solid on the bed (Z up, resting on z = 0) stand: its centre of mass over the hull of where it touches? */
export function standing(_w: ManifoldToplevel, m: Manifold): Pick<PrintReport, 'contact' | 'stands' | 'margin'> {
  const foot = m.slice(0.05), contact = foot.area(), c = centroid(m);
  const hull = foot.hull().toPolygons()[0] ?? [];
  // the distance from its centre of mass to the hull's edge (+ inside)
  let inside = hull.length >= 3, margin = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const [ax, ay] = hull[i], [bx, by] = hull[(i + 1) % hull.length], ex = bx - ax, ey = by - ay, l = Math.hypot(ex, ey) || 1;
    const side = (ex * (c.y - ay) - ey * (c.x - ax)) / l; // (+ to the left of a counter-clockwise edge: inside)
    if (side < 0) inside = false;
    margin = Math.min(margin, Math.abs(side));
  }
  return { contact, stands: inside, margin: inside ? margin : -margin };
}
