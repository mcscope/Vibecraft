// Wildweld buildings: what a larva lays its body down as (UnitSpec.laysDown), web grown on food. Models in metres, a
// tile about 2 m across, centred on the footprint.
import type { BuildingState, Mat, ModelBuilder, Vec3 } from '../../kits/bake3d/types';

const SILK: Mat = { color: '#ece6d6', tex: 'none', rough: 0.85 };
const SILK_OLD: Mat = { color: '#d6ccb4', tex: 'leather', rough: 0.9 };
const BAND: Mat = { team: 'primary', tex: 'none', rough: 0.6 };
const DEW: Mat = { color: '#cfe8ff', tex: 'none', rough: 0.05, metal: 0.2 };
const CHITIN: Mat = { color: '#1a2628', tex: 'leather', rough: 0.3, metal: 0.35 };

/** A web thread from `a` to `b`, sagging `sag` m at its middle (a catenary, near enough), `r` thick, a dewdrop or two on it. */
function thread(c: ModelBuilder, a: Vec3, b: Vec3, sag: number, r = 0.012, drops = 0): void {
  const n = 6;
  const at = (k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - sag * 4 * k * (1 - k), a[2] + (b[2] - a[2]) * k];
  for (let i = 0; i < n; i++) c.limb(at(i / n), at((i + 1) / n), r, SILK);
  for (let i = 1; i <= drops; i++) c.sphere(r * 1.8, at(i / (drops + 1)), DEW);
}

/** A silk-wrapped column from `y0` to `y1`, `r0` thick at its foot narrowing to `r1`, wound round with rings. */
function wrapped(c: ModelBuilder, x: number, z: number, y0: number, y1: number, r0: number, r1: number, rings: number): void {
  const n = 5, h = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const ra = r0 + (r1 - r0) * (i / n), rb = r0 + (r1 - r0) * ((i + 1) / n);
    c.cylinder(rb, ra, h, [x, y0 + h * (i + 0.5), z], i % 2 ? SILK : SILK_OLD, undefined, 10);
  }
  for (let i = 1; i <= rings; i++) {
    const k = i / (rings + 1), r = r0 + (r1 - r0) * k;
    c.cylinder(r * 1.08, r * 1.08, 0.03, [x, y0 + (y1 - y0) * k, z], SILK, undefined, 10);
  }
}

/** A steady wobble from a few numbers (the same every bake): −1 … 1. */
export const jit = (...n: number[]) => { let h = 2166136261; for (const x of n) h = Math.imul(h ^ Math.round(x * 997 + 13), 16777619); return ((h >>> 0) % 2001) / 1000 - 1; };

/** A tangle of web along the joined sides: `width` m either side of the line, `height` m tall, `n` threads; `bulge` swells
 *  it in the middle of the piece and pinches it at the edges (where the neighbour's meets it at the edge's width). */
export function tangle(b: ModelBuilder, state: BuildingState | undefined, width: number, height: number, n: number, bulge = 0): void {
  const j = state?.joins ?? (state ? 0 : 3); // (no state: a straight run)
  const reach = (bit: number) => (j & bit ? 1.0 : 0.4);
  const xp = reach(1), xn = reach(2), zp = reach(4), zn = reach(8);
  const alongX = !!(j & 3) || !(j & 12), alongZ = !!(j & 12);
  const pt = (i: number): Vec3 => {
    const u = (jit(i, 1) + 1) / 2, h = (jit(i, 3) + 1) / 2, side = jit(i, 5);
    // which run of the web it's in (a corner piece: both)
    const onX = alongX && (!alongZ || jit(i, 7) > 0);
    const t = onX ? -xn + u * (xn + xp) : -zn + u * (zn + zp); // along it
    const w = width * (1 + bulge * (1 - t * t)) * (0.6 + 0.4 * (1 - h)); // (wider low down, and through the middle if it bulges)
    return onX ? [t, 0.04 + h ** 1.6 * height, side * w] : [side * w, 0.04 + h ** 1.6 * height, t];
  };
  for (let i = 0; i < n; i++) thread(b, pt(i), pt(i + 211), 0.03 + 0.04 * jit(i, 9), 0.007 + 0.002 * ((jit(i, 11) + 1) / 2));
  for (let i = 0; i < Math.round(n / 7); i++) { const p = pt(i * 13 + 5); thread(b, [p[0], 0.02, p[2]], pt(i * 13 + 6), 0.01, 0.008); } // (threads down to the ground: web only, no wads, no dew)
}
/** The web wall's looks, in turn along a line (Building art `looks`): a hedge of web (dense), a sprawl (wide and low
 *  over the ground) and a billow (swelling in each piece, pinched where pieces meet). Web only, joined to the pieces
 *  beside it (`state.joins`). */
const WEB_LOOKS = [
  (b: ModelBuilder, s?: BuildingState) => tangle(b, s, 0.42, 1.3, 110),
  (b: ModelBuilder, s?: BuildingState) => tangle(b, s, 0.8, 0.8, 120),
  (b: ModelBuilder, s?: BuildingState) => tangle(b, s, 0.3, 1.3, 110, 1.4),
];
export const WEB_WALL_LOOKS = WEB_LOOKS.length;
/** A piece of web wall (1 tile): a tangle of web, one of WEB_LOOKS. */
export function webWall(b: ModelBuilder, state?: BuildingState): void { WEB_LOOKS[(state?.look ?? 0) % WEB_LOOKS.length](b, state); }

/**
 * A web tower (2 tiles): a great cocoon spindle on four buttress roots, guyed down to the corners with web; at its top
 * a cupped nest holding crystals and a sling-stalk that flings them (launched from 5 m, the sim's height), the layer's
 * side in bands round the spindle.
 */
export function webTower(b: ModelBuilder): void {
  // the buttress roots: silk flowing down from the spindle to the ground at each corner
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const foot: Vec3 = [sx * 1.55, 0.05, sz * 1.55], knee: Vec3 = [sx * 0.85, 0.75, sz * 0.85], top: Vec3 = [sx * 0.3, 1.6, sz * 0.3];
    b.limb(foot, knee, 0.2, SILK_OLD, 0.17);
    b.limb(knee, top, 0.17, SILK_OLD, 0.12);
    b.sphere([0.32, 0.12, 0.32], foot, SILK_OLD);
    thread(b, [sx * 0.35, 3.3, sz * 0.35], [sx * 1.85, 0.05, sz * 1.85], 0.15, 0.016, 2); // a guy-line
    thread(b, [sx * 0.3, 2.4, sz * 0.3], [sx * 1.85, 0.05, 0], 0.1, 0.012, 1);
    thread(b, [sx * 0.3, 2.4, sz * 0.3], [0, 0.05, sz * 1.85], 0.1, 0.012, 1);
  }
  // the spindle: a cocoon swelling from its roots, narrowing to its neck
  wrapped(b, 0, 0, 0.3, 2.4, 0.45, 0.62, 5);
  wrapped(b, 0, 0, 2.4, 4.5, 0.62, 0.24, 6);
  for (const y of [1.4, 2.6, 3.6]) { const r = y < 2.4 ? 0.45 + (y - 0.3) * 0.08 + 0.02 : 0.62 - (y - 2.4) * 0.18 + 0.02; b.cylinder(r, r, 0.12, [0, y, 0], BAND, undefined, 12); }
  // the nest: a cup of silk at its top, crystals in it
  b.cylinder(0.55, 0.26, 0.42, [0, 4.75, 0], SILK, undefined, 12);
  b.cylinder(0.5, 0.5, 0.04, [0, 4.97, 0], SILK_OLD, undefined, 12);
  for (const [x, z, k] of [[0.15, 0.1, 0.32], [-0.18, 0.05, 0.28], [0.02, -0.2, 0.3], [-0.05, 0.22, 0.24]] as const) b.crystal(k, [x, 4.9, z], [0.3 * x, 0, 0.3 * z]);
  // the sling-stalk: curving up and over from the nest's rim, a chitin pouch at its tip
  const stalk: Vec3[] = [[0.4, 4.95, 0], [0.75, 5.5, 0], [0.9, 6.05, 0], [0.7, 6.5, 0], [0.35, 6.7, 0]];
  for (let i = 0; i < stalk.length - 1; i++) b.limb(stalk[i], stalk[i + 1], 0.07 - i * 0.012, SILK_OLD, 0.06 - i * 0.012);
  b.sphere([0.16, 0.12, 0.16], [0.28, 6.66, 0], CHITIN);
  b.crystal(0.18, [0.28, 6.74, 0], [0, 0, 0.4]);
}
