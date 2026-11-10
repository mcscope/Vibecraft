// Binary STL in and out, and the checks a printable file must pass, made on the file's own triangles (read back from
// its bytes): watertight and consistently wound (every edge shared by exactly two triangles, once each way), no
// degenerate triangles, one shell, positive volume, its size, and how thin it gets (a ray cast inward from points all
// over its surface to the far side).
import type { Manifold, ManifoldToplevel } from 'manifold-3d';

/**
 * Collapse every edge shorter than `eps` (a boolean union leaves a few triangles microns across where surfaces cross
 * near a corner: harmless to a solid's shape, but next to nothing in area, which some tools call degenerate). An edge
 * only collapses where that keeps the surface whole (its ends share no neighbours but the two triangles across it).
 */
export function collapseShortEdges(pos: Float64Array, tris: Uint32Array, eps = 1e-3): { pos: Float64Array; tris: Uint32Array; collapsed: number } {
  const T = Array.from(tris), alive = new Array(T.length / 3).fill(true), at = new Map<number, Set<number>>();
  const P = Array.from(pos);
  for (let t = 0; t < alive.length; t++) for (let k = 0; k < 3; k++) (at.get(T[t * 3 + k]) ?? at.set(T[t * 3 + k], new Set()).get(T[t * 3 + k])!).add(t);
  const len = (a: number, b: number) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  const ring = (v: number) => { const s = new Set<number>(); for (const t of at.get(v) ?? []) for (let k = 0; k < 3; k++) if (T[t * 3 + k] !== v) s.add(T[t * 3 + k]); return s; };
  let collapsed = 0;
  for (let again = true, pass = 0; again && pass < 10; pass++) {
    again = false;
    for (let t = 0; t < alive.length; t++) {
      if (!alive[t]) continue;
      for (let k = 0; k < 3; k++) {
        const a = T[t * 3 + k], b = T[t * 3 + ((k + 1) % 3)];
        if (len(a, b) >= eps) continue;
        const both = [...(at.get(a) ?? [])].filter((x) => at.get(b)?.has(x));
        if (both.length !== 2) continue;
        const ra = ring(a), rb = ring(b), common = [...ra].filter((v) => rb.has(v));
        const opposite = both.map((x) => [0, 1, 2].map((j) => T[x * 3 + j]).find((v) => v !== a && v !== b));
        if (common.length !== 2 || !opposite.every((v) => v !== undefined && common.includes(v))) continue;
        for (let c = 0; c < 3; c++) P[a * 3 + c] = (P[a * 3 + c] + P[b * 3 + c]) / 2;
        for (const x of both) { alive[x] = false; for (let j = 0; j < 3; j++) at.get(T[x * 3 + j])?.delete(x); }
        for (const x of at.get(b) ?? []) { for (let j = 0; j < 3; j++) if (T[x * 3 + j] === b) T[x * 3 + j] = a; at.get(a)!.add(x); }
        at.delete(b);
        collapsed++;
        again = true;
        break;
      }
    }
  }
  return { pos: Float64Array.from(P), tris: Uint32Array.from(T.filter((_, i) => alive[Math.floor(i / 3)])), collapsed };
}

/** A solid's triangles as binary STL (millimetres; Z up as the solid stands), its micro-edges collapsed. */
export function toStl(m: Manifold, header = 'VibeCraft print'): Uint8Array {
  const mesh = m.getMesh(), n0 = mesh.numProp, raw = new Float64Array((mesh.vertProperties.length / n0) * 3);
  for (let i = 0; i < raw.length / 3; i++) for (let c = 0; c < 3; c++) raw[i * 3 + c] = mesh.vertProperties[i * n0 + c];
  const clean = collapseShortEdges(raw, mesh.triVerts);
  const n = 3, P = clean.pos, T = clean.tris, count = T.length / 3;
  const buf = new ArrayBuffer(84 + count * 50), dv = new DataView(buf);
  const head = new TextEncoder().encode(header.slice(0, 79));
  new Uint8Array(buf, 0, 80).set(head);
  dv.setUint32(80, count, true);
  for (let t = 0; t < count; t++) {
    const o = 84 + t * 50, v = [0, 1, 2].map((k) => T[t * 3 + k] * n);
    const ax = P[v[1]] - P[v[0]], ay = P[v[1] + 1] - P[v[0] + 1], az = P[v[1] + 2] - P[v[0] + 2];
    const bx = P[v[2]] - P[v[0]], by = P[v[2] + 1] - P[v[0] + 1], bz = P[v[2] + 2] - P[v[0] + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    [nx, ny, nz].forEach((x, i) => dv.setFloat32(o + i * 4, x, true));
    v.forEach((vi, k) => { for (let c = 0; c < 3; c++) dv.setFloat32(o + 12 + k * 12 + c * 4, P[vi + c], true); });
    dv.setUint16(o + 48, 0, true);
  }
  return new Uint8Array(buf);
}

/** A binary STL's triangles: 9 numbers each (three corners). */
export function readStl(bytes: Uint8Array): Float32Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), count = dv.getUint32(80, true);
  if (84 + count * 50 !== bytes.byteLength) throw new Error(`not a binary STL: ${count} triangles in ${bytes.byteLength} bytes`);
  const out = new Float32Array(count * 9);
  for (let t = 0; t < count; t++) for (let k = 0; k < 9; k++) out[t * 9 + k] = dv.getFloat32(84 + t * 50 + 12 + k * 4, true);
  return out;
}

export interface MeshCheck {
  triangles: number;
  /** Every edge shared by exactly two triangles. */
  watertight: boolean;
  /** Every edge used once each way (the triangles all wound the same way round, outward). */
  oriented: boolean;
  /** Edges not shared by exactly two triangles. */
  openEdges: number;
  /** Triangles with (next to) no area. */
  degenerate: number;
  /** Separate pieces (connected through shared edges). */
  shells: number;
  /** mm³ (positive: the normals face out). */
  volume: number;
  size: [number, number, number];
  min: [number, number, number];
  /** Thickness (mm) measured inward from sample points all over its surface (the longest of five rays in, straight and leaning 25°): the least, the 1st and 5th percentiles, and the share of points under the minimum. */
  thin?: { min: number; p1: number; p5: number; under: number };
  /** manifold-3d reads the file back as a valid solid. */
  manifoldOk?: boolean;
}

/** Check a mesh's triangles (as read back from its STL); with the manifold library, measure how thin it gets too. */
export function checkMesh(tris: Float32Array, w?: ManifoldToplevel, minThick = 1.2): MeshCheck {
  const count = tris.length / 9, key = new Map<string, number>(), idx = new Uint32Array(count * 3), pos: number[] = [];
  for (let i = 0; i < count * 3; i++) {
    const k = `${tris[i * 3]},${tris[i * 3 + 1]},${tris[i * 3 + 2]}`;
    let v = key.get(k);
    if (v === undefined) { v = pos.length / 3; key.set(k, v); pos.push(tris[i * 3], tris[i * 3 + 1], tris[i * 3 + 2]); }
    idx[i] = v;
  }
  const nv = pos.length / 3;
  // edges: undirected use counts, and directed ones (each way once, if consistently wound)
  const und = new Map<number, number>(), dir = new Map<number, number>();
  const ek = (a: number, b: number) => a * nv + b;
  let degenerate = 0, volume = 0;
  for (let t = 0; t < count; t++) {
    const [a, b, c] = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]];
    const p = (i: number) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const area = Math.hypot(...cr) / 2, longest = Math.max(Math.hypot(...u), Math.hypot(...v), Math.hypot(pc[0] - pb[0], pc[1] - pb[1], pc[2] - pb[2]));
    if (a === b || b === c || a === c || area < 1e-10 || area < 1e-7 * longest * longest) degenerate++;
    volume += (pa[0] * (pb[1] * pc[2] - pb[2] * pc[1]) - pa[1] * (pb[0] * pc[2] - pb[2] * pc[0]) + pa[2] * (pb[0] * pc[1] - pb[1] * pc[0])) / 6;
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      und.set(ek(Math.min(x, y), Math.max(x, y)), (und.get(ek(Math.min(x, y), Math.max(x, y))) ?? 0) + 1);
      dir.set(ek(x, y), (dir.get(ek(x, y)) ?? 0) + 1);
    }
  }
  let openEdges = 0, oriented = true;
  for (const n of und.values()) if (n !== 2) openEdges++;
  for (const [k, n] of dir) if (n !== 1 || dir.get(ek(k % nv, Math.floor(k / nv))) !== 1) { oriented = false; break; }
  // shells: triangles joined through shared vertices
  const parent = Array.from({ length: nv }, (_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let t = 0; t < count; t++) { const a = find(idx[t * 3]); parent[find(idx[t * 3 + 1])] = a; parent[find(idx[t * 3 + 2])] = a; }
  const roots = new Set<number>();
  for (let i = 0; i < nv; i++) roots.add(find(i));
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], pos[i * 3 + c]); hi[c] = Math.max(hi[c], pos[i * 3 + c]); }
  const out: MeshCheck = {
    triangles: count, watertight: openEdges === 0, oriented, openEdges, degenerate, shells: roots.size, volume,
    size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], min: lo as [number, number, number],
  };
  if (w) {
    try {
      const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(pos), triVerts: idx });
      const m = new w.Manifold(mesh);
      out.manifoldOk = m.status() === 'NoError' && !m.isEmpty();
      if (out.manifoldOk) out.thin = thickness(tris, minThick);
      m.delete();
    } catch { out.manifoldOk = false; }
  }
  return out;
}

/** How thick a solid is under its surface: from sample triangles' centres, a ray straight in to the far side. */
function thickness(tris: Float32Array, minThick: number, samples = 2500): MeshCheck['thin'] {
  const count = tris.length / 9, step = Math.max(1, Math.floor(count / samples)), got: number[] = [], rays = new Rays(tris);
  for (let t = 0; t < count; t += step) {
    const p = (k: number) => [tris[t * 9 + k * 3], tris[t * 9 + k * 3 + 1], tris[t * 9 + k * 3 + 2]];
    const [a, b, c] = [p(0), p(1), p(2)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n);
    if (l < 1e-9) continue;
    n = n.map((x) => -x / l);
    const o = [0, 1, 2].map((i) => (a[i] + b[i] + c[i]) / 3) as V3;
    // (straight in, and four rays leaning 25° off it: the longest is how thick it is there. A thin plate or rod is
    // thin every way in; the rim of a band or plate standing a little proud of the body is thick a little way off)
    const e1 = norm(u), e2 = norm([n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]]), k = Math.tan((25 * Math.PI) / 180);
    let d = -1;
    for (const [x, y] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const dir = norm([0, 1, 2].map((i) => n[i] + k * (x * e1[i] + y * e2[i])));
      const hit = rays.hits(o, dir, 1e9, t).find((h) => h > 1e-4);
      if (hit !== undefined) d = Math.max(d, hit);
    }
    if (d > 0) got.push(d);
  }
  got.sort((x, y) => x - y);
  const q = (f: number) => got[Math.min(got.length - 1, Math.floor(f * got.length))] ?? 0;
  return { min: got[0] ?? 0, p1: q(0.01), p5: q(0.05), under: got.filter((x) => x < minThick).length / Math.max(1, got.length) };
}

type V3 = [number, number, number];
const norm = (v: number[]): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** Casting rays at a triangle soup (a bounding-volume tree over its triangles). */
export class Rays {
  private box: Float64Array; private kids: Int32Array; private first: Int32Array; private n: Int32Array; private order: Int32Array;
  private nodes = 0;
  constructor(private tris: Float32Array) {
    const count = tris.length / 9, cap = Math.max(1, count) * 2;
    this.box = new Float64Array(cap * 6); this.kids = new Int32Array(cap * 2); this.first = new Int32Array(cap); this.n = new Int32Array(cap);
    this.order = Int32Array.from({ length: count }, (_, i) => i);
    const cen = new Float64Array(count * 3);
    for (let t = 0; t < count; t++) for (let c = 0; c < 3; c++) cen[t * 3 + c] = (tris[t * 9 + c] + tris[t * 9 + 3 + c] + tris[t * 9 + 6 + c]) / 3;
    const build = (lo: number, hi: number): number => {
      const id = this.nodes++, b = this.box;
      for (let c = 0; c < 3; c++) { b[id * 6 + c] = Infinity; b[id * 6 + 3 + c] = -Infinity; }
      for (let i = lo; i < hi; i++) for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) {
        const x = tris[this.order[i] * 9 + k * 3 + c];
        if (x < b[id * 6 + c]) b[id * 6 + c] = x;
        if (x > b[id * 6 + 3 + c]) b[id * 6 + 3 + c] = x;
      }
      if (hi - lo <= 8) { this.first[id] = lo; this.n[id] = hi - lo; this.kids[id * 2] = this.kids[id * 2 + 1] = -1; return id; }
      const ext = [0, 1, 2].map((c) => b[id * 6 + 3 + c] - b[id * 6 + c]), axis = ext.indexOf(Math.max(...ext));
      const part = Array.from(this.order.subarray(lo, hi)).sort((x, y) => cen[x * 3 + axis] - cen[y * 3 + axis]);
      this.order.set(part, lo);
      const mid = (lo + hi) >> 1;
      this.n[id] = 0;
      this.kids[id * 2] = build(lo, mid); this.kids[id * 2 + 1] = build(mid, hi);
      return id;
    };
    if (count) build(0, count);
  }
  /** Distances along a ray (from `o`, unit direction `d`, out to `far`) at which it crosses the surface, nearest first; `skip`: a triangle to ignore (the one it starts on). */
  hits(o: V3, d: V3, far = Infinity, skip = -1): number[] {
    const out: number[] = [], T = this.tris, inv = d.map((x) => 1 / x), stack = this.nodes ? [0] : [];
    while (stack.length) {
      const id = stack.pop()!, b = this.box;
      let t0 = 0, t1 = far;
      for (let c = 0; c < 3; c++) {
        let a = (b[id * 6 + c] - o[c]) * inv[c], z = (b[id * 6 + 3 + c] - o[c]) * inv[c];
        if (a > z) [a, z] = [z, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, z);
      }
      if (t0 > t1 + 1e-9) continue;
      if (this.kids[id * 2] >= 0) { stack.push(this.kids[id * 2], this.kids[id * 2 + 1]); continue; }
      for (let i = this.first[id]; i < this.first[id] + this.n[id]; i++) {
        const t = this.order[i];
        if (t === skip) continue;
        const k = t * 9, e1 = [T[k + 3] - T[k], T[k + 4] - T[k + 1], T[k + 5] - T[k + 2]], e2 = [T[k + 6] - T[k], T[k + 7] - T[k + 1], T[k + 8] - T[k + 2]];
        const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
        const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
        if (Math.abs(det) < 1e-14) continue;
        const s = [o[0] - T[k], o[1] - T[k + 1], o[2] - T[k + 2]], u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
        if (u < 0 || u > 1) continue;
        const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
        if (v < 0 || u + v > 1) continue;
        const dist = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
        if (dist >= 0 && dist <= far) out.push(dist);
      }
    }
    return out.sort((a, b) => a - b);
  }
}

/** A solid's triangles, 9 numbers each, for casting rays at. */
export function soup(m: Manifold): Float32Array {
  const mesh = m.getMesh(), n = mesh.numProp, P = mesh.vertProperties, T = mesh.triVerts, out = new Float32Array(T.length * 3);
  for (let i = 0; i < T.length; i++) for (let c = 0; c < 3; c++) out[i * 3 + c] = P[T[i] * n + c];
  return out;
}
