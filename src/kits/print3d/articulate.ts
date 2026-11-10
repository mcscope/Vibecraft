// Poseable figures: a unit printed in parts, cut apart at its real joints (the points its model marks: a hip, a knee),
// that snap together with ball-and-socket joints you can pose by hand.
//
// Each primitive of the model goes to the part whose bones it lies along (within `reach` of them), the rest to the
// body. At each joint the part is cut by a plane across the bone, just past the joint's centre, its parent cleared
// out of its way there, with a gap between the two faces; a ball on a neck grows from one side, centred on the joint,
// and the other side has a socket for it in a ball of wall, deeper than a half sphere, so the ball snaps in past its
// lip and stays (held by friction where it's posed).
import type { Manifold, ManifoldToplevel, Mat4 } from 'manifold-3d';
import * as THREE from 'three';
import type { UnitBakeOptions } from '../bake3d/baker';
import type { UnitModel, Vec3 } from '../bake3d/types';
import { Rays, soup } from './check';
import { Z_UP, centroid, flatten, recordPose, type PrintOptions, type PrintPose } from './print';
import { connect, fuse, nearest, primSolid } from './solid';

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
  /** Other bones of the part, each between two marked points (a crest, a horn off the chain). */
  more?: Array<[string, string]>;
  /** How far round its bones the part reaches, model units: its whole girth, and no more (so it takes no other part's). */
  reach: number;
  /** Which side has the socket: the thicker one at the joint (default the parent; the ball is on the other). */
  socket?: 'parent' | 'part';
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
  /** Marked points along the body (its spine): what lies nearer them than a part's bones stays with the body. */
  body?: string[];
}

/** Fits, mm: the gap between a part's cut face and its parent's, the play round a ball in its socket. */
/** (and the smallest ball and neck worth printing, mm: radii) */
export const FIT = { gap: 0.4, ball: 0.15, wall: 1.2, minBall: 2.5, minNeck: 1.25 };

export interface Figure {
  /** Every part laid flat for printing, side by side on one plate. */
  plate: Manifold;
  /** Each part laid flat alone. */
  parts: Array<{ name: string; solid: Manifold; note?: string }>;
  /** Each joint as made (mm): its ball's radius, its neck's, the socket wall round it. */
  joints: Array<{ name: string; ball: number; neck: number; wall: number; lip: number }>;
  /** The assembled figure (as posed, every part in place): to check the parts don't overlap. */
  assembled: Manifold[];
  notes: string[];
}

const V = (v: Vec3) => new THREE.Vector3(...v);
const mat = (m: THREE.Matrix4) => Array.from(m.elements) as unknown as Mat4;

/** Cut a unit into a poseable figure, as `a` says. */
export function articulate(w: ManifoldToplevel, model: UnitModel, a: Articulation, o: Omit<PrintOptions, 'mmPerUnit'>, bake: UnitBakeOptions = {}): Figure {
  const { Manifold } = w, mm = a.mmPerUnit, notes: string[] = [];
  const rec = recordPose(model, a.pose, mm, bake);
  const mark = (name: string) => {
    const p = rec.marks.get(name);
    if (!p) throw new Error(`the model marks no point '${name}'`);
    return V(p);
  };
  // each joint's bones (the segments its part lies along), and which way its socket faces
  const bonesOf = (k: ArtJoint) => {
    const chain = [mark(k.at), ...k.bones.map(mark)];
    return [...chain.slice(0, -1).map((b, i) => [b, chain[i + 1]]), ...(k.more ?? []).map(([x, y]) => [mark(x), mark(y)])] as Array<[THREE.Vector3, THREE.Vector3]>;
  };
  // every primitive goes to the part whose bones it lies closest along (the farthest of its points nearest them), if
  // it lies within that part's reach; the body (along its own bones, if it names them) takes what's left. A primitive
  // centred at or behind a joint (a knee's knob, a haunch) stays with the side that holds the socket.
  const bodyBones = a.body ? bonesOf({ part: 'body', parent: '', at: a.body[0], bones: a.body.slice(1), reach: Infinity }) : [];
  const segDist = (q: THREE.Vector3, [x, y]: [THREE.Vector3, THREE.Vector3]) => {
    const e = y.clone().sub(x), t = Math.max(0, Math.min(1, q.clone().sub(x).dot(e) / e.lengthSq()));
    return q.distanceTo(x.clone().addScaledVector(e, t));
  };
  const owner = rec.prims.map((p) => {
    const m = primSolid(w, p, { ...o, facet: 3 });
    if (!m || m.isEmpty()) return 'body';
    const mesh = m.getMesh(), pts: THREE.Vector3[] = [];
    for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) pts.push(new THREE.Vector3(mesh.vertProperties[i], mesh.vertProperties[i + 1], mesh.vertProperties[i + 2]));
    const b = m.boundingBox(), c = V(b.min).add(V(b.max)).multiplyScalar(0.5);
    const score = (segs: Array<[THREE.Vector3, THREE.Vector3]>) => Math.max(...pts.map((q) => Math.min(...segs.map((sg) => segDist(q, sg)))));
    let best = 'body', bd = bodyBones.length ? score(bodyBones) : Infinity;
    for (const k of a.joints) {
      const segs = bonesOf(k), [x, y] = segs[0];
      if ((k.socket ?? 'parent') === 'parent' && c.clone().sub(x).dot(y.clone().sub(x)) <= 0.02 * y.distanceToSquared(x)) continue;
      const sc = score(segs);
      if (sc <= k.reach * mm && sc < bd) { bd = sc; best = k.part; }
    }
    return best;
  });
  const solidOf = (name: string) => {
    const prims = rec.prims.filter((_, i) => owner[i] === name);
    return prims.length ? connect(w, fuse(w, { prims, marks: rec.marks }, o), (o.minThick / 2) * 1.15, o.minThick ** 3 * 0.2)[0] : null;
  };
  // feet flat on the ground (each part that reaches it)
  const pieces = new Map<string, Manifold>();
  for (const name of ['body', ...a.joints.map((k) => k.part)]) { const m = solidOf(name); if (m) pieces.set(name, m); else notes.push(`${name}: no part of the model lies along its bones`); }
  const lo = Math.max(0, Math.min(...[...pieces.values()].map((m) => m.boundingBox().min[1])));
  for (const [name, m] of pieces) if (m.boundingBox().min[1] < lo + o.flat) pieces.set(name, flatten(w, m.translate([0, -lo, 0]), o.flat, 0, o.padInset).translate([0, lo, 0]));
  const joints: Figure['joints'] = [];
  const ball = (r: number, at: THREE.Vector3) => Manifold.sphere(r, 32).translate(at.toArray());
  for (const j of a.joints) {
    let parent = pieces.get(j.parent), part = pieces.get(j.part);
    if (!parent || !part) continue;
    const P = mark(j.at), n = mark(j.bones[0]).sub(P).normalize();
    const s = (j.socket ?? 'parent') === 'parent' ? 1 : -1; // (+1: the cut falls past the joint, toward the part)
    // how thick the limb is round the joint: rays out from its centre across the bone
    const rays = new Rays(soup(Manifold.union([parent, part]))), side = new THREE.Vector3(n.y, -n.x, 0).lengthSq() > 0.01 ? new THREE.Vector3(n.y, -n.x, 0).normalize() : new THREE.Vector3(1, 0, 0);
    let girth = Infinity;
    for (let k = 0; k < 16; k++) {
      const hit = rays.hits(P.toArray() as Vec3, side.clone().applyAxisAngle(n, (k / 16) * Math.PI * 2).toArray() as Vec3)[0];
      if (hit !== undefined) girth = Math.min(girth, hit);
    }
    if (!isFinite(girth)) girth = 0;
    // the ball as big as the limb allows with a wall round its socket, never under FIT.minBall; the socket's side
    // always gets a ball of wall round the socket (inside the limb, where it's thick enough: a knuckle, where not)
    const rb = j.ball ? j.ball * mm : Math.max(FIT.minBall, Math.min(girth * 0.62, girth - FIT.ball - FIT.wall));
    const d = 0.6 * rb, neck = Math.max(FIT.minNeck, 0.5 * rb), wall = FIT.wall;
    // (how far the socket's lip closes over the ball's widest: what holds it in, snapped past)
    const lip = rb - Math.sqrt((rb + FIT.ball) ** 2 - (d - FIT.gap / 2) ** 2);
    const cut = n.dot(P) + s * d;
    // the part: past the cut (and half the gap); the parent: cleared out of the part's way near the joint, within its reach
    const near = Manifold.union(bonesOf(j).map(([x, y]) => Manifold.hull([ball(j.reach * mm, x), ball(j.reach * mm, y)])));
    part = part.trimByPlane(n.toArray(), cut + FIT.gap / 2);
    parent = parent.subtract(near.trimByPlane(n.toArray(), cut - FIT.gap / 2));
    // the socket's wall (on its side of the cut), the socket in it, and the ball on its neck (on the other side)
    const holder = s > 0 ? parent : part;
    const housing = ball(rb + FIT.ball + wall, P).trimByPlane(n.clone().multiplyScalar(-s).toArray(), -s * (cut - s * FIT.gap / 2));
    const swell = housing.subtract(holder).volume() / Math.max(1e-9, housing.volume());
    if (swell > 0.08) notes.push(`${s > 0 ? j.parent : j.part}: a knuckle swells round its ${j.at} socket (the limb is ${(2 * girth).toFixed(1)} mm thick there)`);
    const socketed = Manifold.union([holder, housing]).subtract(ball(rb + FIT.ball, P));
    const knob = Manifold.union([ball(rb, P), stick(w, P, P.clone().addScaledVector(n, s * (d + FIT.gap + 1.5)), neck)]);
    if (s > 0) { parent = socketed; part = Manifold.union([part, knob]); } else { part = socketed; parent = Manifold.union([parent, knob]); }
    pieces.set(j.parent, parent);
    pieces.set(j.part, part);
    joints.push({ name: `${j.part} at ${j.at}`, ball: rb, neck, wall, lip });
  }
  // one solid each: a bit cut off from its piece goes to the piece it touches (a toe tip past its part's reach, left
  // with the parent), a crumb is dropped, and a stray touching nothing is joined back on to its own piece
  for (const name of [...pieces.keys()]) {
    const bits = pieces.get(name)!.decompose().sort((x, y) => y.volume() - x.volume());
    if (bits.length <= 1) continue;
    let own = bits[0];
    for (const bit of bits.slice(1)) {
      if (bit.volume() < o.minThick ** 3 * 0.2) continue;
      const near = [...pieces].filter(([k]) => k !== name).map(([k, m]) => [k, nearest(bit, m)[2]] as const).sort((x, y) => x[1] - y[1])[0];
      if (near && near[1] < 0.3) pieces.set(near[0], connect(w, Manifold.union([pieces.get(near[0])!, bit]), (o.minThick / 2) * 1.15, 0)[0]); // (welded on where they meet)
      else { own = connect(w, Manifold.union([own, bit]), (o.minThick / 2) * 1.15, 0)[0]; notes.push(`${name}: a stray bit (${bit.volume().toFixed(0)} mm³) joined on by a strut`); }
    }
    pieces.set(name, own);
  }
  // parts that overlap where the model's own parts did (a crest lying on a back): the bigger gets a groove for the smaller
  const names = [...pieces.keys()];
  for (let i = 0; i < names.length; i++) for (let k = i + 1; k < names.length; k++) {
    const A = pieces.get(names[i])!, B = pieces.get(names[k])!, v = A.intersect(B).volume();
    if (v < 0.01) continue;
    const [big, small] = A.volume() >= B.volume() ? [names[i], names[k]] : [names[k], names[i]];
    pieces.set(big, pieces.get(big)!.subtract(pieces.get(small)!));
    notes.push(`${big}: a groove where the ${small} lies against it (${v.toFixed(0)} mm³)`);
  }
  // a base under the part it stands on
  if (a.baseOn) {
    // (round its foot and its centre of mass, so it can't tip however it's posed over the foot)
    const all = Manifold.union([...pieces.values()]), c = centroid(all), on = pieces.get(a.baseOn)!.getMesh(), feet: THREE.Vector2[] = [];
    for (let i = 0; i < on.vertProperties.length; i += on.numProp) if (on.vertProperties[i + 1] < 1) feet.push(new THREE.Vector2(on.vertProperties[i], on.vertProperties[i + 2]));
    const mid = feet.reduce((t, f) => t.add(f), new THREE.Vector2()).divideScalar(Math.max(1, feet.length)), at = new THREE.Vector2((mid.x + c.x) / 2, (mid.y + c.z) / 2);
    const r = Math.max(20, at.distanceTo(new THREE.Vector2(c.x, c.z)) + 15, ...feet.map((f) => f.distanceTo(at) + 4));
    const sink = 0.4;
    for (const [k, m] of pieces) pieces.set(k, m.translate([0, o.baseThick - sink, 0]));
    const disc = Manifold.cylinder(o.baseThick, r, r - o.baseThick * 0.6, 96).transform(mat(new THREE.Matrix4().makeTranslation(at.x, 0, at.y).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))));
    pieces.set(a.baseOn, Manifold.union([pieces.get(a.baseOn)!, disc]));
  }
  const assembled = [...pieces.values()].map((m) => m.transform(mat(Z_UP)));
  // each part laid down flat (its lowest way up), then all of them side by side on one plate
  const parts = [...pieces].map(([name, m]) => ({ name, solid: layFlat(m.transform(mat(Z_UP)), name === a.baseOn) }));
  const plate = arrange(w, parts.map((p) => p.solid));
  return { plate, parts, joints, assembled, notes };
}

/** A rod of radius `r` from `a` to `b`. */
function stick(w: ManifoldToplevel, a: THREE.Vector3, b: THREE.Vector3, r: number): Manifold {
  return w.Manifold.hull([w.Manifold.sphere(r, 24).translate(a.toArray()), w.Manifold.sphere(r, 24).translate(b.toArray())]);
}

/**
 * Turned to print: the way up (of the six square to its axes) that leaves it lowest, ties going to the one with
 * most of it on the bed; a part with a base stays as it stands. Then set on the bed at z = 0, centred.
 */
function layFlat(m: Manifold, standing: boolean): Manifold {
  const turns = standing ? [new THREE.Matrix4()] : [[0, 0, 0], [Math.PI / 2, 0, 0], [-Math.PI / 2, 0, 0], [Math.PI, 0, 0], [0, Math.PI / 2, 0], [0, -Math.PI / 2, 0]]
    .map(([x, y, z]) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z)));
  let best: Manifold | null = null, score = Infinity;
  for (const t of turns) {
    const r = m.transform(mat(t)), b = r.boundingBox(), h = b.max[2] - b.min[2];
    const placed = r.translate([0, 0, -b.min[2]]), foot = placed.slice(0.2).area();
    const sc = h - Math.min(foot, 400) * 0.002; // (a few mm of height is worth a lot of contact)
    if (sc < score) { score = sc; best = placed; }
  }
  const b = best!.boundingBox();
  return best!.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, 0]);
}

/** Parts side by side on one plate, in rows (biggest first), 5 mm apart. */
function arrange(w: ManifoldToplevel, parts: Manifold[]): Manifold {
  const sized = parts.map((m) => { const b = m.boundingBox(); return { m, w: b.max[0] - b.min[0], d: b.max[1] - b.min[1], b }; }).sort((x, y) => y.d - x.d);
  const area = sized.reduce((s, p) => s + (p.w + 5) * (p.d + 5), 0), width = Math.max(Math.sqrt(area) * 1.2, ...sized.map((p) => p.w));
  const out: Manifold[] = [];
  let x = 0, y = 0, row = 0;
  for (const p of sized) {
    if (x > 0 && x + p.w > width) { x = 0; y += row + 5; row = 0; }
    out.push(p.m.translate([x - p.b.min[0], y - p.b.min[1], 0]));
    x += p.w + 5; row = Math.max(row, p.d);
  }
  const all = w.Manifold.compose(out), b = all.boundingBox();
  return all.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, 0]);
}
