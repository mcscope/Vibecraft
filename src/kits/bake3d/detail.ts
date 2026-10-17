// Detail generators: dress a simple shape in many small, slightly varied pieces
// (roof tiles, stone courses, planks, timber framing, thatch bundles) so a model
// reads like a detailed building rather than a toy. Jitter is deterministic (a
// hash of position), so every bake is identical, which online bundles rely on.
//
// The camera looks from +x/+z, so wall dressing goes on those two faces only
// (the others are never seen and would only slow the bake).
import type { Mat, ModelBuilder, Vec3 } from './types';

/** Deterministic 0..1 noise from a few numbers. */
function hash(...n: number[]): number {
  let h = 2166136261;
  for (const v of n) { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

/** The same material, its colour nudged lighter/darker by up to `amount` (team colours left alone). */
export function vary(m: Mat, k: number, amount = 0.12): Mat {
  if (!m.color) return m;
  const n = parseInt(m.color.slice(1), 16);
  const f = 1 + (k - 0.5) * 2 * amount;
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return { ...m, color: `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}` };
}

export interface RoofOpts {
  /** Footprint [w (along x), h (rise), d (along z)], base centred at `at`. Ridge runs along x when w ≥ d. */
  size: Vec3;
  at: Vec3;
  mat: Mat;
  /** Courses of tiles from eave to ridge (default ~1 per 0.3 of slope). */
  rows?: number;
  /** Tile width along a course (default 0.32). */
  tile?: number;
  /** Ridge cap material (default: darker roof). */
  ridge?: Mat;
}

/** A hip roof covered in overlapping courses of tiles (or shingles), with a ridge cap. */
export function tiledRoof(b: ModelBuilder, o: RoofOpts): void {
  const [w, h, d] = o.size, [ax, ay, az] = o.at;
  const half = Math.min(w, d) / 2, L = Math.hypot(h, half), th = Math.atan2(h, half);
  const rows = o.rows ?? Math.max(4, Math.round(L / 0.3)), tile = o.tile ?? 0.32;
  b.roof([w * 0.98, h * 0.96, d * 0.98], [ax, ay, az], vary(o.mat, 0.3, 0.3)); // the solid under the tiles
  const along = w >= d; // ridge along x
  for (let k = 0; k < rows; k++) {
    const s = (k + 0.5) * (L / rows), inset = s * (half / L), y = ay + s * (h / L) + 0.03;
    const len = (L / rows) * 1.4;
    // the two long faces (trapezoids) and the two ends (triangles)
    const faces: Array<{ wide: number; place: (t: number) => [Vec3, Vec3] }> = [];
    const long = (along ? w : d) - 2 * inset, short = (along ? d : w) - 2 * inset;
    for (const sd of [1, -1]) {
      faces.push({ wide: long, place: (t) => along
        ? [[ax + t, y, az + sd * (d / 2 - inset)], [sd * th, 0, 0]]
        : [[ax + sd * (w / 2 - inset), y, az + t], [0, 0, -sd * th]] });
      faces.push({ wide: short, place: (t) => along
        ? [[ax + sd * (w / 2 - inset), y, az + t], [0, 0, -sd * th]]
        : [[ax + t, y, az + sd * (d / 2 - inset)], [sd * th, 0, 0]] });
    }
    for (const [fi, f] of faces.entries()) {
      if (f.wide <= 0.05) continue;
      const n = Math.max(1, Math.round(f.wide / tile));
      const tw = f.wide / n;
      for (let i = 0; i < n; i++) {
        const t = -f.wide / 2 + (i + 0.5) * tw + (k % 2 ? tw * 0.25 : -tw * 0.25) * (n > 1 ? 1 : 0);
        if (Math.abs(t) > f.wide / 2 - tw * 0.2) continue;
        const [pos, rot] = f.place(t);
        const j = hash(pos[0], pos[1], pos[2], fi);
        const xAxis = Math.abs(rot[0]) > 0; // tiles on an x-rotated face run along x
        const size: Vec3 = xAxis ? [tw * 0.96, 0.05, len] : [len, 0.05, tw * 0.96];
        b.box(size, pos, vary(o.mat, j, 0.1), [rot[0] + (j - 0.5) * 0.02, (j - 0.5) * 0.02, rot[2] + (j - 0.5) * 0.02]);
      }
    }
  }
  const rl = Math.abs(w - d), ridge = o.ridge ?? vary(o.mat, 0.1, 0.35);
  const r0: Vec3 = along ? [ax - rl / 2, ay + h + 0.04, az] : [ax, ay + h + 0.04, az - rl / 2];
  const r1: Vec3 = along ? [ax + rl / 2, ay + h + 0.04, az] : [ax, ay + h + 0.04, az + rl / 2];
  if (rl > 0.05) b.limb(r0, r1, 0.08, ridge);
  // hip caps down each corner, hiding where the courses end
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const top = (along ? sx < 0 : sz < 0) ? r0 : r1;
    b.limb([ax + sx * w / 2, ay + 0.05, az + sz * d / 2], top, 0.07, ridge, 0.06);
  }
}

/** A cone roof (towers, round huts) covered in rings of shingles, with a finial. */
export function shingledCone(b: ModelBuilder, r: number, h: number, at: Vec3, mat: Mat, finial?: Mat): void {
  const [ax, ay, az] = at;
  b.cone(r * 0.98, h * 0.98, [ax, ay + h / 2, az], vary(mat, 0.3, 0.3), undefined, 16);
  const L = Math.hypot(r, h), th = Math.atan2(r, h), rows = Math.max(4, Math.round(L / 0.25));
  for (let k = 0; k < rows; k++) {
    const s = (k + 0.5) / rows, rr = r * (1 - s) + 0.03, y = ay + h * s;
    const n = Math.max(5, Math.round((2 * Math.PI * rr) / 0.26));
    for (let i = 0; i < n; i++) {
      const a = (i + (k % 2) * 0.5) / n * Math.PI * 2;
      const j = hash(k, i, r);
      b.joint([ax + Math.cos(a) * rr, y, az + Math.sin(a) * rr], [0, -a, 0], (t) => {
        t.box([0.05, (L / rows) * 1.45, (2 * Math.PI * rr) / n * 0.95], [0, 0, 0], vary(mat, j, 0.18), [0, 0, th]);
      });
    }
  }
  if (finial) { b.cylinder(0.03, 0.05, 0.4, [ax, ay + h + 0.15, az], finial, undefined, 6); b.sphere(0.07, [ax, ay + h + 0.38, az], finial); }
}

export interface WallOpts {
  /** The wall block [w (x), h, d (z)], base centred at `at`. */
  size: Vec3;
  at: Vec3;
  mat: Mat;
  /** Course height (default 0.26). */
  course?: number;
}

/** A solid block whose two visible faces are built of coursed, irregular stones. */
export function stoneWall(b: ModelBuilder, o: WallOpts): void {
  const [w, h, d] = o.size, [ax, ay, az] = o.at, ch = o.course ?? 0.26;
  b.box([w, h, d], [ax, ay + h / 2, az], vary(o.mat, 0.2, 0.3)); // the mortar behind
  const courses = Math.max(1, Math.round(h / ch)), cH = h / courses;
  for (const face of [0, 1]) {
    const span = face === 0 ? d : w;
    for (let k = 0; k < courses; k++) {
      let t = -span / 2 + (k % 2 ? 0.12 : 0);
      let i = 0;
      while (t < span / 2 - 0.05) {
        const j = hash(face, k, i++, ax, az);
        const len = Math.min(span / 2 - t, 0.32 + j * 0.38);
        const mid = t + len / 2, y = ay + k * cH + cH / 2, proud = 0.035 + (j - 0.5) * 0.03;
        const pos: Vec3 = face === 0 ? [ax + w / 2 + proud / 2, y, az + mid] : [ax + mid, y, az + d / 2 + proud / 2];
        const size: Vec3 = face === 0 ? [proud + 0.02, cH * 0.9, len - 0.04] : [len - 0.04, cH * 0.9, proud + 0.02];
        b.box(size, pos, vary(o.mat, j, 0.16));
        t += len;
      }
    }
  }
}

/** A timber frame over plaster: corner posts, studs, rails and cross-braces on the two visible faces. */
export function timberFrame(b: ModelBuilder, o: WallOpts & { wood: Mat }): void {
  const [w, h, d] = o.size, [ax, ay, az] = o.at, tb = 0.12;
  b.box([w, h, d], [ax, ay + h / 2, az], o.mat);
  for (const face of [0, 1]) {
    const span = face === 0 ? d : w, panels = Math.max(2, Math.round(span / 1.1)), pw = span / panels;
    const put = (t: number, y: number, size: [number, number], rot = 0): void => {
      const j = hash(face, t, y, ax);
      if (face === 0) b.box([tb, size[1], size[0]], [ax + w / 2 + 0.02, y, az + t], vary(o.wood, j, 0.1), [rot, 0, 0]);
      else b.box([size[0], size[1], tb], [ax + t, y, az + d / 2 + 0.02], vary(o.wood, j, 0.1), [0, 0, rot]);
    };
    for (let i = 0; i <= panels; i++) put(-span / 2 + i * pw, ay + h / 2, [tb, h]); // posts
    for (const y of [ay + tb / 2, ay + h * 0.5, ay + h - tb / 2]) put(0, y, [span + 0.04, tb]); // rails
    for (let i = 0; i < panels; i++) { // a cross-brace in every other panel, lower half
      if (i % 2) continue;
      const t = -span / 2 + (i + 0.5) * pw, a = Math.atan2(h * 0.5, pw);
      put(t, ay + h * 0.25, [Math.hypot(pw, h * 0.5) * 0.95, tb * 0.8], face === 0 ? a : -a);
    }
  }
}

/** Vertical planks on the two visible faces of a block (sheds, palisades, barns). */
export function plankWall(b: ModelBuilder, o: WallOpts): void {
  const [w, h, d] = o.size, [ax, ay, az] = o.at;
  b.box([w, h, d], [ax, ay + h / 2, az], vary(o.mat, 0.15, 0.35));
  for (const face of [0, 1]) {
    const span = face === 0 ? d : w, n = Math.max(2, Math.round(span / 0.22)), pw = span / n;
    for (let i = 0; i < n; i++) {
      const j = hash(face, i, ax, az), t = -span / 2 + (i + 0.5) * pw, ph = h * (0.97 + j * 0.03);
      if (face === 0) b.box([0.05, ph, pw * 0.9], [ax + w / 2 + 0.02, ay + ph / 2, az + t], vary(o.mat, j, 0.16));
      else b.box([pw * 0.9, ph, 0.05], [ax + t, ay + ph / 2, az + d / 2 + 0.02], vary(o.mat, j, 0.16));
    }
  }
}

/** A round thatched roof built up in ragged bundle layers, with a fringe at the eaves. */
export function thatchedCone(b: ModelBuilder, r: number, h: number, at: Vec3, mat: Mat): void {
  const [ax, ay, az] = at;
  b.cone(r, h, [ax, ay + h / 2, az], vary(mat, 0.3, 0.25), undefined, 18);
  const layers = Math.max(3, Math.round(h / 0.3));
  for (let k = 0; k < layers; k++) {
    const s = k / layers, rr = r * (1 - s) + 0.04, y = ay + h * s;
    const n = Math.max(6, Math.round((2 * Math.PI * rr) / 0.18));
    for (let i = 0; i < n; i++) {
      const a = (i + (k % 2) * 0.5) / n * Math.PI * 2, j = hash(k, i, r, ax);
      const len = (h / layers) * (1.2 + j * 0.4);
      b.limb([ax + Math.cos(a) * (rr - 0.02), y + len * 0.9, az + Math.sin(a) * (rr - 0.02)],
        [ax + Math.cos(a) * (rr + 0.05), y - 0.04 - j * 0.05, az + Math.sin(a) * (rr + 0.05)], 0.035 + j * 0.02, vary(mat, j, 0.2), 0.02);
    }
  }
}
