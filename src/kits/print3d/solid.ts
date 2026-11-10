// Turns a recorded model into one printable solid: every primitive made a closed solid (thin ones thickened to a
// printable minimum), fused by a real boolean union (manifold-3d), floating bits bridged to the body, its feet cut flat
// on the ground, an optional base disc and, for a body in the air, a post holding it up.
import Module, { type Manifold, type ManifoldToplevel, type Mat4 } from 'manifold-3d';
import * as THREE from 'three';
import type { Section, Vec3 } from '../bake3d/types';
import type { Prim, Recording } from './record';

let kit: Promise<ManifoldToplevel> | null = null;
/** The manifold-3d library, loaded once. */
export function manifoldKit(): Promise<ManifoldToplevel> {
  return (kit ??= Module().then((w) => { w.setup(); return w; }));
}

/** Sizes in the recording's units (millimetres). */
export interface SolidOptions {
  /** The thinnest any part may be (a limb's diameter, a wing's thickness). */
  minThick: number;
  /** How long one facet of a curve is, at most. */
  facet: number;
}

const V = (v: Vec3) => new THREE.Vector3(...v);
const toMat4 = (m: THREE.Matrix4) => Array.from(m.elements) as unknown as Mat4;
const place = (at: Vec3, rot: Vec3 | undefined, scale: Vec3) =>
  new THREE.Matrix4().compose(V(at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0]))), V(scale));
/** Facets round a circle of radius `r` (whole quarters, as manifold's spheres need). */
const around = (r: number, facet: number, lo = 8) => Math.max(lo, Math.min(96, 4 * Math.ceil((2 * Math.PI * r) / facet / 4)));
/** An upright unit frustum along +y (as three.js draws a cylinder), its first corner toward +z. */
const UPRIGHT = new THREE.Matrix4().makeRotationX(-Math.PI / 2).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));

/** One primitive as a closed solid, at least `min` thick (in the recording's units), or null if it has no volume. */
export function primSolid(w: ManifoldToplevel, p: Prim, o: SolidOptions): Manifold | null {
  const { Manifold } = w;
  const rmin = o.minThick / 2, lmin = rmin / p.scale; // (the thinnest half-thickness, in the primitive's own units)
  const at = (v: Vec3) => v.map((x) => Math.max(x, lmin)) as Vec3;
  switch (p.kind) {
    case 'sphere': {
      const r = at(p.r);
      return Manifold.sphere(1, around(Math.max(...r) * p.scale, o.facet, 12)).transform(toMat4(p.frame.clone().multiply(place(p.at, p.rot, r))));
    }
    case 'box':
      return Manifold.cube([1, 1, 1], true).transform(toMat4(p.frame.clone().multiply(place(p.at, p.rot, p.size.map((s) => Math.max(Math.abs(s), 2 * lmin)) as Vec3))));
    case 'cylinder': {
      const rb = Math.max(p.rBottom, lmin), rt = p.rTop > 0 ? Math.max(p.rTop, lmin) : 0, h = Math.max(p.height, 2 * lmin);
      const unit = Manifold.cylinder(1, 1, rt / rb, p.sides >= 12 ? around(rb * p.scale, o.facet) : p.sides, true);
      return unit.transform(toMat4(p.frame.clone().multiply(place(p.at, p.rot, [rb, h, rb])).multiply(UPRIGHT)));
    }
    case 'limb': {
      const a = V(p.a).applyMatrix4(p.frame), b = V(p.b).applyMatrix4(p.frame);
      const ra = Math.max(p.ra * p.scale, rmin), rb = Math.max(p.rb * p.scale, rmin), n = around(Math.max(ra, rb), o.facet);
      return Manifold.hull([Manifold.sphere(ra, n).translate(a.toArray()), Manifold.sphere(rb, n).translate(b.toArray())]);
    }
    case 'loft':
      return loftSolid(w, p.sections.map((s) => ({ ...s, w: Math.max(s.w, lmin), up: Math.max(s.up, lmin), down: Math.max(s.down, lmin) })), p.frame);
    case 'hull':
      return Manifold.hull(p.points.map((q) => V(q).applyMatrix4(p.frame).toArray() as Vec3));
  }
}

/** The rings of a loft, as the bake3d builder draws it (the same curve and cross-sections), in `frame`. */
function loftRings(sections: Section[], frame: THREE.Matrix4, AROUND = 28): THREE.Vector3[][] {
  const SUB = 6;
  const pts = sections.map((s) => [...s.at, s.w, s.up, s.down, s.keel ?? 0, s.flat ?? 0]);
  const pt = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < (i === pts.length - 2 ? SUB + 1 : SUB); k++) {
    const t = k / SUB, p0 = pt(i - 1), p1 = pt(i), p2 = pt(i + 1), p3 = pt(i + 2);
    const [x, y, z, w, up, down, keel, flat] = p1.map((_, j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t));
    const ring: THREE.Vector3[] = [];
    for (let a = 0; a < AROUND; a++) {
      const th = (a / AROUND) * Math.PI * 2, side = Math.sin(th), c = Math.cos(th);
      const sq = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;
      const py = c >= 0 ? up * sq(c, 1 - flat * 0.6) : down * c;
      const pz = c >= 0 ? w * sq(side, 1 - flat * 0.6) : w * side * (1 - Math.max(0, Math.min(1, keel)) * -c) ** 1.3;
      ring.push(new THREE.Vector3(x, y + py, z + pz).applyMatrix4(frame));
    }
    rings.push(ring);
  }
  return rings;
}

/** A loft as a closed solid: its surface as drawn, or, if that isn't a clean solid, the hulls of each pair of rings. */
function loftSolid(w: ManifoldToplevel, sections: Section[], frame: THREE.Matrix4): Manifold | null {
  const { Manifold, Mesh } = w;
  const rings = loftRings(sections, frame), N = rings[0].length;
  const pos: number[] = [], tri: number[] = [];
  for (const r of rings) for (const v of r) pos.push(v.x, v.y, v.z);
  for (let ri = 0; ri < rings.length - 1; ri++) for (let a = 0; a < N; a++) {
    const i0 = ri * N + a, i1 = ri * N + ((a + 1) % N), j0 = i0 + N, j1 = i1 + N;
    tri.push(i0, j0, i1, i1, j0, j1);
  }
  for (const [ri, flip] of [[0, false], [rings.length - 1, true]] as const) {
    const c = new THREE.Vector3();
    for (const v of rings[ri]) c.add(v);
    c.divideScalar(N);
    const ci = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    for (let a = 0; a < N; a++) { const i0 = ri * N + a, i1 = ri * N + ((a + 1) % N); if (flip) tri.push(ci, i1, i0); else tri.push(ci, i0, i1); }
  }
  // outward, whichever way the spine runs: its signed volume positive
  let vol = 0;
  for (let i = 0; i < tri.length; i += 3) {
    const [a, b, c] = [tri[i], tri[i + 1], tri[i + 2]].map((k) => V([pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]]));
    vol += a.dot(b.cross(c)) / 6;
  }
  if (vol < 0) for (let i = 0; i < tri.length; i += 3) [tri[i + 1], tri[i + 2]] = [tri[i + 2], tri[i + 1]];
  try {
    const mesh = new Mesh({ numProp: 3, vertProperties: new Float32Array(pos), triVerts: new Uint32Array(tri) });
    mesh.merge();
    const m = new Manifold(mesh);
    // (a loft whose rings cross each other where its spine bends hard is no clean solid: hulls then)
    if (m.status() === 'NoError' && !m.isEmpty() && Math.abs(m.volume() - Math.abs(vol)) < Math.abs(vol) * 0.02) return m;
  } catch { /* hulls, below */ }
  const parts: Manifold[] = [];
  for (let i = 0; i < rings.length - 1; i++) parts.push(Manifold.hull([...rings[i], ...rings[i + 1]].map((v) => v.toArray() as Vec3)));
  return parts.length ? Manifold.union(parts) : null;
}

/**
 * Every primitive of a recording fused into one solid (possibly in several pieces: see `connect`). Each is nudged by
 * a hair (microns, a thousandth of a radian, the same every time): a model's mirrored halves and stacked parts meet
 * exactly, and surfaces that only touch leave pinched seams no STL can hold.
 */
export function fuse(w: ManifoldToplevel, rec: Recording, o: SolidOptions): Manifold {
  const solids = rec.prims.map((p, i) => {
    const m = primSolid(w, p, o);
    if (!m || m.isEmpty()) return null;
    const h = (k: number) => { const v = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v) - 0.5; };
    const c = m.boundingBox(), mid = new THREE.Vector3(...c.min).add(V(c.max)).multiplyScalar(0.5);
    const nudge = new THREE.Matrix4().makeTranslation(mid.x + h(1) * 4e-3, mid.y + h(2) * 4e-3, mid.z + h(3) * 4e-3)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(h(4) * 2e-3, h(5) * 2e-3, h(6) * 2e-3)))
      .multiply(new THREE.Matrix4().makeTranslation(-mid.x, -mid.y, -mid.z));
    return m.transform(toMat4(nudge));
  }).filter((m): m is Manifold => !!m);
  return w.Manifold.union(solids);
}

/** The vertices of a solid, as points. */
export function vertsOf(m: Manifold): THREE.Vector3[] {
  const mesh = m.getMesh(), out: THREE.Vector3[] = [], n = mesh.numProp;
  for (let i = 0; i < mesh.vertProperties.length; i += n) out.push(new THREE.Vector3(mesh.vertProperties[i], mesh.vertProperties[i + 1], mesh.vertProperties[i + 2]));
  return out;
}

/** The nearest pair of points between two solids (approximately: on their vertices). */
export function nearest(a: Manifold, b: Manifold): [THREE.Vector3, THREE.Vector3, number] {
  const thin = (vs: THREE.Vector3[], max: number) => (vs.length <= max ? vs : vs.filter((_, i) => i % Math.ceil(vs.length / max) === 0));
  const va = thin(vertsOf(a), 600), vb = thin(vertsOf(b), 30000);
  let best: [THREE.Vector3, THREE.Vector3, number] = [va[0], vb[0], Infinity];
  for (const p of va) for (const q of vb) { const d = p.distanceToSquared(q); if (d < best[2]) best = [p, q, d]; }
  // (refined on the full set near the best pair)
  const fa = vertsOf(a).filter((p) => p.distanceTo(best[0]) < 3), fb = vertsOf(b).filter((q) => q.distanceTo(best[1]) < 3);
  for (const p of fa) for (const q of fb) { const d = p.distanceToSquared(q); if (d < best[2]) best = [p, q, d]; }
  return [best[0], best[1], Math.sqrt(best[2])];
}

/** What `connect` did: pieces bridged to the body, crumbs dropped (their volume, in cubic units). */
export interface ConnectReport { bridged: number; dropped: number; droppedVolume: number }

/**
 * One piece: every piece apart from the biggest joined to the rest by a strut `radius` thick at their nearest points,
 * unless it's a crumb (under `crumb` volume), which is dropped.
 */
export function connect(w: ManifoldToplevel, m: Manifold, radius: number, crumb: number): [Manifold, ConnectReport] {
  const report: ConnectReport = { bridged: 0, dropped: 0, droppedVolume: 0 };
  for (let pass = 0; pass < 20; pass++) {
    const pieces = m.decompose().sort((a, b) => b.volume() - a.volume());
    if (pieces.length <= 1) return [m, report];
    let body = pieces[0];
    const rest = pieces.slice(1);
    for (const p of rest) {
      if (p.volume() < crumb) { report.dropped++; report.droppedVolume += p.volume(); continue; }
      const [a, b] = nearest(p, body);
      const n = around(radius, 0.4);
      body = w.Manifold.union([body, p, w.Manifold.hull([w.Manifold.sphere(radius, n).translate(a.toArray()), w.Manifold.sphere(radius, n).translate(b.toArray())])]);
      report.bridged++;
    }
    m = body;
  }
  return [m, report];
}

/** A recording's size above the ground (y = 0), [x, y, z]: each primitive's bounds together (no union needed). */
export function extent(w: ManifoldToplevel, rec: Recording, o: SolidOptions): [number, number, number] {
  const lo = [Infinity, 0, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of rec.prims) {
    const m = primSolid(w, p, o);
    if (!m || m.isEmpty()) continue;
    const b = m.boundingBox();
    if (b.max[1] <= 0) { m.delete(); continue; }
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], b.min[i]); hi[i] = Math.max(hi[i], b.max[i]); }
    m.delete();
  }
  return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
}
