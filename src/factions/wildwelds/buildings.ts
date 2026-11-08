// Wildweld buildings: what a larva lays its body down as (UnitSpec.laysDown), web grown on food. Models in metres, a
// tile about 2 m across, centred on the footprint.
import type { BuildingState, Mat, ModelBuilder, Vec3 } from '../../kits/bake3d/types';

const SILK: Mat = { color: '#ece6d6', tex: 'none', rough: 0.85 };
const DEW: Mat = { color: '#cfe8ff', tex: 'none', rough: 0.05, metal: 0.2 };
/** Silk dyed the side's colour: one strand in a few through the web, so you can tell whose it is. */
const DYED: Mat = { team: 'primary', tex: 'none', rough: 0.6 };

/** A web thread from `a` to `b`, sagging `sag` m at its middle (a catenary, near enough), `r` thick, a dewdrop or two on it. */
function thread(c: ModelBuilder, a: Vec3, b: Vec3, sag: number, r = 0.012, drops = 0, silk = SILK): void {
  const n = 6;
  const at = (k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - sag * 4 * k * (1 - k), a[2] + (b[2] - a[2]) * k];
  for (let i = 0; i < n; i++) c.limb(at(i / n), at((i + 1) / n), r, silk);
  for (let i = 1; i <= drops; i++) c.sphere(r * 1.8, at(i / (drops + 1)), DEW);
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
  for (let i = 0; i < n; i++) { // (one strand in four dyed the side's colour, and a little thicker, so it shows)
    const dyed = i % 4 === 0, r = 0.007 + 0.002 * ((jit(i, 11) + 1) / 2);
    thread(b, pt(i), pt(i + 211), 0.03 + 0.04 * jit(i, 9), dyed ? r * 1.6 : r, 0, dyed ? DYED : SILK);
  }
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
