// Wildweld buildings: what a larva lays its body down as (UnitSpec.laysDown), web grown on food. Models in metres, a
// tile about 2 m across, centred on the footprint.
import type { Mat, ModelBuilder, Vec3 } from '../../kits/bake3d/types';

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

/**
 * A strand of web wall (1 tile): a silk-wrapped pillar on a silk mound, web fanned out from it to the tile's edges and
 * corners low down, so pieces laid in a line knit into one web either way; rings of thread across the fans, dewdrops,
 * the layer's side in bands round the pillar.
 */
export function webWall(b: ModelBuilder): void {
  const H = 1.55;
  b.sphere([0.5, 0.22, 0.5], [0, 0.06, 0], SILK_OLD); // the mound it's anchored in
  wrapped(b, 0, 0, 0.1, H, 0.17, 0.05, 4);
  for (const y of [0.55, 1.05]) b.cylinder(0.165 - y * 0.06, 0.17 - y * 0.06, 0.07, [0, y, 0], BAND, undefined, 10);
  b.sphere(0.06, [0, H, 0], SILK);
  // the fans: to each edge's middle (where the next piece's fan meets it) and each corner, from up the pillar
  const anchors: Vec3[] = [[0.98, 0.04, 0], [-0.98, 0.04, 0], [0, 0.04, 0.98], [0, 0.04, -0.98], [0.9, 0.04, 0.9], [-0.9, 0.04, 0.9], [0.9, 0.04, -0.9], [-0.9, 0.04, -0.9]];
  const ups = [0.45, 0.85, 1.2, 1.5];
  anchors.forEach((an, i) => {
    for (const y of ups) thread(b, [0, y, 0], an, 0.06 + y * 0.05, 0.011, (i + Math.round(y * 10)) % 3 === 0 ? 1 : 0);
    // a cross-thread or two across each fan (the rings of a web), high and low
    for (const k of [0.35, 0.65]) {
      const lo: Vec3 = [an[0] * k, ups[0] + (an[1] - ups[0]) * k, an[2] * k], hi: Vec3 = [an[0] * k, ups[3] + (an[1] - ups[3]) * k, an[2] * k];
      thread(b, lo, hi, 0.02, 0.009);
    }
  });
  // strands run along the edges between the anchors: the web's rim, knitting it to the next piece
  for (let i = 4; i < 8; i++) for (const j of [0, 1, 2, 3]) {
    const a = anchors[i], e = anchors[j];
    if (Math.abs(a[0] - e[0]) < 1 || Math.abs(a[2] - e[2]) < 1) thread(b, [a[0], 0.35, a[2]], [e[0], 0.35, e[2]], 0.08, 0.01);
  }
}

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
