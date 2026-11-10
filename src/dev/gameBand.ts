// VibeCraft's own band pictures: all three armies in one frame, for the game as a whole (a promotional picture, so it
// names the shipped factions; no faction imports another). ?mode=sprites&game=<n>[&wide=1]: picture n, 4:3 or as a
// wide 2480×720 strip with calm sky for a title; scripts/bands.mjs (CANDIDATES=1) saves them.
// Each army in its own side's colours: Meadowfolk red, Fenfolk blue, Wildwelds purple (green is left out: it melts
// into the grass and the frogs).
import { PLAYABLE } from '../factions';
import type { BandStaging } from '../factions/types';
import type { ModelBuilder } from '../kits/bake3d/types';
import { TEAM_COLORS } from '../render/artbank';
import { bakeOpts as meadowOpts } from '../factions/meadowfolk/art';
import { bakeOpts as fenOpts } from '../factions/fenfolk/art';
import { bakeOpts as wildOpts } from '../factions/wildwelds/art';
import { tree as fenTree, DOODADS as FEN } from '../factions/fenfolk/homeworld';
import { bush, flowers, grassClump, mine, stones, tree as meadowTree } from '../biomes/meadow/models';
import { projectile } from '../biomes/common';
import { webWall } from '../factions/wildwelds/buildings';
import { renderBand, type BandSide } from './bandScene';

const MEADOW = 0, FEN_ = 1, WILD = 2;
type Cast = Array<BandStaging['cast'][number] & { side: number }>;
type Staging = BandStaging & { cast: Cast };
/** A picture: its 4:3 staging, and for the wide strip either another camera on it or a staging of its own. */
interface GameBand { name: string; staging: Staging; wide?: BandStaging['camera'] | Staging; /** Among the best: 1 the best (for the review sheet). */ top?: number }
type Props = NonNullable<BandStaging['props']>;

/** `n` of a unit in a loose cluster around (x, z), `r` across, facing `face` (± a little), doing `anim`. */
const cluster = (side: number, id: string, n: number, x: number, z: number, r: number, face: number, anim = 'idle', alt = anim): Cast => Array.from({ length: n }, (_, i) => {
  const a = i * 2.39996, d = r * Math.sqrt((i + 0.5) / n); // (a sunflower's spiral: even, never on top of each other)
  return { side, id, at: [x + Math.cos(a) * d, z + Math.sin(a) * d * 0.8], face: face + ((i * 37) % 21) - 10, anim: i % 2 ? alt : anim, phase: 0.2 + ((i * 3) % 7) / 10 };
});
const prop = (model: (b: ModelBuilder) => void, at: [number, number], scale = 1, face = 0): Props[number] => ({ model, at, scale, face });
/** Each army's home behind its arm: fen reeds and willows on the left, meadow trees in the middle, stones on the right. */
const homes = (spread = 1): Props => [
  ...[[-15, -14], [-11, -18], [-19, -19]].map(([x, z], i) => prop((b) => fenTree(b, i === 0 ? 0 : i * 3 + 1), [x * spread, z], 1.1, i * 60)),
  ...[[-6, -22], [3, -24], [9, -21]].map(([x, z], i) => prop((b) => meadowTree(b, i * 4), [x * spread, z], 1.2, i * 70)),
  ...[[15, -15], [18, -19]].map(([x, z], i) => prop((b) => meadowTree(b, i * 3 + 1), [x * spread, z], 1, i * 40)),
  ...[[12, -10], [16, -9]].map(([x, z], i) => prop((b) => stones(b, i), [x * spread, z], 3)),
  ...FEN.flowers.map((m, i) => prop(m, [(-12 + i * 1.5) * spread, -9 - (i % 2)], 2)),
];

/** The round-4 look: a low warm sun from the left, a deeper sky with cloud, mottled grass and dirt. */
const LOOK: Pick<BandStaging, 'sky' | 'sun' | 'clouds' | 'groundColors'> = {
  sky: ['#3d5778', '#f1cf98'], sun: { azimuth: -105, elevation: 17 }, clouds: true,
  groundColors: ['#4c5a28', '#5f7034', '#6f7c3c', '#5e6a32', '#6b5a38'],
};
/** Grass tufts, flowers and stones strewn round (x, z). */
const TUFTS = (x: number, z: number, r: number, n: number): NonNullable<BandStaging['scatter']>[number] => ({
  models: [0, 1, 2, 3].map((v) => (b: ModelBuilder) => grassClump(b, v)).concat([0, 1, 2, 3].map((v) => (b: ModelBuilder) => flowers(b, v)), [0, 1].map((v) => (b: ModelBuilder) => stones(b, v))),
  n, at: [x, z], r, scale: [0.7, 1.15],
});
/** Thrown crystals in the air at (x, z), `y` up. */
const LIFT = (spots: Array<[number, number, number]>): Props => spots.map(([x, z, y], i) => ({ model: projectile, at: [x, z], lift: y, scale: 3.5, face: i * 40 }));
/** The fen's edge: reed thickets, willows and cattails round a pool at (x, z). */
const MARSH = (x: number, z: number): Props => [
  ...[[-3, -4], [4, -3], [-5, 2], [5, 3]].map(([dx, dz], i) => prop((b) => fenTree(b, i * 3), [x + dx, z + dz], 1.1, i * 50)),
  prop((b) => fenTree(b, 1), [x - 2, z - 8], 1.2), prop((b) => fenTree(b, 2), [x + 4, z - 9], 1.2),
  ...FEN.flowers.map((m, i) => prop(m, [x - 3 + i * 2, z + 4.5], 2)),
];
/** The Wildwelds' ground: web walls in a broken line and stones round (x, z). */
const WEBS = (x: number, z: number): Props => [
  ...[[-2, -4], [0, -4.5], [2, -4.2], [5, -2]].map(([dx, dz], i) => prop((b) => webWall(b, { phase: 'complete', level: 0, look: i }), [x + dx, z + dz], 1, i * 15)),
  ...[[3, 3], [-3, 4]].map(([dx, dz], i) => prop((b) => stones(b, i + 2), [x + dx, z + dz], 3)),
];

/** Pieces of a picture, put together: their casts, props, hills, water and scatter joined (the first's sky, camera … kept). */
type Part = Partial<Pick<Staging, 'cast' | 'props' | 'hills' | 'water' | 'scatter'>>;
const join = (base: Omit<Staging, 'cast'> & Part, ...parts: Part[]): Staging => ({
  ...base,
  cast: [...(base.cast ?? []), ...parts.flatMap((p) => p.cast ?? [])],
  props: [...(base.props ?? []), ...parts.flatMap((p) => p.props ?? [])],
  hills: [...(base.hills ?? []), ...parts.flatMap((p) => p.hills ?? [])],
  water: [...(base.water ?? []), ...parts.flatMap((p) => p.water ?? [])],
  scatter: [...(base.scatter ?? []), ...parts.flatMap((p) => p.scatter ?? [])],
});
const build = (side: number, id: string, x: number, z: number, face = 0): Cast[number] => ({ side, id, at: [x, z], face });
/** The fen at (x, z): stilt huts and the Stilt Hall round misty pools, reed beds, willows, a heron perch. */
const FEN_HOME = (x: number, z: number, k = 1): Part => ({
  cast: [build(FEN_, 'stilt-hall', x, z - 4 * k, 20), build(FEN_, 'reed-hut', x - 6 * k, z, 30), build(FEN_, 'reed-hut', x + 5 * k, z + 1, -20), build(FEN_, 'reed-hut', x - 2 * k, z + 5 * k, 10), build(FEN_, 'heron-perch', x + 8 * k, z - 6 * k), build(FEN_, 'toad-wallow', x - 9 * k, z - 7 * k, 30)],
  water: [{ at: [x - 1 * k, z + 2 * k], r: 4 * k }, { at: [x + 6 * k, z + 6 * k], r: 2.6 * k }, { at: [x - 8 * k, z + 4 * k], r: 3 * k }],
  hills: [{ at: [x - 1 * k, z + 2 * k], r: 5 * k, h: -0.4 }],
  props: MARSH(x, z + 1),
});
/** The meadow at (x, z): the Great Hall on its rise, watchtowers, a barracks, rows of berry bushes like fields, trees. */
const MEADOW_HOME = (x: number, z: number, k = 1): Part => ({
  cast: [build(MEADOW, 'great-hall', x, z - 3 * k), build(MEADOW, 'watchtower', x - 7 * k, z, 15), build(MEADOW, 'watchtower', x + 7.5 * k, z + 0.5, -15), build(MEADOW, 'barracks', x + 11 * k, z - 6 * k, -20), build(MEADOW, 'town-center', x - 12 * k, z - 7 * k, 20)],
  hills: [{ at: [x, z - 3 * k], r: 8 * k, h: 1.6 }],
  props: [
    ...Array.from({ length: 24 }, (_, i) => prop((b) => bush(b, 1), [x - 10 * k + (i % 8) * 1.3 * k, z + 5 * k + Math.floor(i / 8) * 1.6 * k], 0.9)),
    ...[[-14, -2], [14, 2], [-4, -11], [6, -12], [-17, -12]].map(([dx, dz], i) => prop((b) => meadowTree(b, i * 4 + 1), [x + dx * k, z + dz * k], 1.2, i * 50)),
  ],
});
/** The hive at (x, z): web walls in arcs, Mimic Mines, cocoons and eggs, larvae among them, dark cypress. */
const WILD_HOME = (x: number, z: number, k = 1): Part => ({
  cast: [
    build(WILD, 'web-tower', x, z - 3 * k, -20), build(WILD, 'web-tower', x + 9 * k, z - 7 * k, -40),
    ...[0, 1, 2, 3, 4, 5].map((i) => build(WILD, 'web-wall', x - 6 * k + i * 2 * k, z + 2 * k - Math.abs(i - 2.5) * 0.9 * k, (i - 2.5) * 12)),
    ...[0, 1, 2, 3].map((i) => build(WILD, 'web-wall', x + 6 * k + i * 2 * k, z - 4 * k + i * 0.6, -30)),
    ...cluster(WILD, 'cocoon', 6, x - 3 * k, z - 3 * k, 2.6 * k, 0, 'grow'),
    ...cluster(WILD, 'egg3', 8, x + 3 * k, z, 2.6 * k, 0, 'grow', 'hungry'),
    ...cluster(WILD, 'larva2', 6, x, z + 4 * k, 3 * k, -30, 'walk'),
  ],
  props: [...[[-8, -6], [-11, -2], [10, 0], [4, -9]].map(([dx, dz], i) => prop((b) => fenTree(b, i * 3 + 2), [x + dx * k, z + dz * k], 1.3, i * 70)), ...WEBS(x + 4 * k, z + 6 * k)],
});
/** Far ridgelines, layered, bluer and paler with distance; `peaks`: mountains behind them. */
const RIDGES = (near: string, far: string, peaks = false): NonNullable<BandStaging['ridges']> => [
  { distance: 70, height: 4.5, color: near, jag: 0.6 },
  { distance: 105, height: 8, color: far, jag: 0.4 },
  ...(peaks ? [{ distance: 150, height: 22, color: '#34374e', jag: 0.9, peaks: true }] : []),
];
/** The big dusk: a low sun, its rays and disc, a sky full of cloud. */
const DUSK = (azimuth: number, elevation = 8): Pick<BandStaging, 'sun' | 'clouds' | 'sky' | 'groundColors'> => ({
  sun: { azimuth, elevation, disc: true, rays: true }, clouds: 'many', sky: ['#2a3550', '#f7c27e'],
  groundColors: ['#45522a', '#56662f', '#66733a', '#585f30', '#62523a'],
});

export const GAME_BANDS: GameBand[] = [
  // 1. the V: the three armies in a wedge pointing at us, Meadowfolk at its point, Fenfolk down the left arm, the
  //    Wildwelds down the right. RULES: one focal point (the Lynx Lancer at the apex, nearest and best lit), the arms
  //    are the leading lines back to the giants (the heron left, the Hurlhorn centre on a rise, the Vimmer in the air
  //    right); a camera a little above the riders' heads, so the wedge reads; calm sky above.
  {
    name: 'the V',
    staging: {
      sky: ['#7f9dbd', '#f6e4bf'],
      camera: { from: [0, 3, 13], to: [0, 1.3, -2], fov: 42 },
      hills: [{ at: [0, -5], r: 5, h: 1.4 }],
      props: homes(),
      cast: [
        { side: MEADOW, id: 'lynx', at: [0, 4], face: 20, anim: 'charge', phase: 0.3 },
        ...cluster(MEADOW, 'pikeman', 6, 0, 0.8, 1.5, 0, 'brace', 'idle'),
        { side: MEADOW, id: 'hurlhorn', at: [0, -4.6], face: 0, anim: 'attack', phase: 0.5 },
        { side: FEN_, id: 'bog-toad', at: [-3, 1.8], face: 40, anim: 'attack', phase: 0.5 },
        ...cluster(FEN_, 'fenling', 7, -4.6, -0.6, 1.6, 40, 'attack', 'idle'),
        { side: FEN_, id: 'great-siege-heron', at: [-6.2, -3.8], face: 40 },
        { side: WILD, id: 'whipweld', at: [3.2, 1.4], face: -60, anim: 'attack', phase: 0.5 },
        ...cluster(WILD, 'larva1', 5, 4.8, -0.6, 1.4, -40, 'walk'),
        { side: WILD, id: 'larva3', at: [6, -2.2], face: -40, anim: 'walk', phase: 0.4 },
        { side: WILD, id: 'flier', at: [4.6, -3.4], lift: 2.7, face: -15, anim: 'fly', phase: 0.3 },
      ],
    },
    wide: { from: [0, 3.2, 13], to: [0, 2.2, -2], fov: 38 },
  },
  // 2. the film poster: the stars in two rows facing us, the giants behind (heron, Hurlhorn, Vimmer), the fighters
  //    in front of them (toad, Lynx Lancer, Whipweld), the small folk out on the flanks. RULES: symmetry with the
  //    Lynx Lancer as the centre and focal point, three depth layers (fighters, giants, homes), the middle kept clear
  //    in front so nothing hides the stars, the camera at a man's height.
  {
    name: 'the poster',
    staging: {
      sky: ['#5e7ea6', '#f3d7a4'],
      camera: { from: [0, 2.2, 10], to: [0, 1.4, -3], fov: 46 },
      hills: [{ at: [0, -6], r: 4.5, h: 1.2 }],
      props: homes(1.2),
      cast: [
        { side: FEN_, id: 'great-siege-heron', at: [-5.6, -5], face: 25 },
        { side: MEADOW, id: 'hurlhorn', at: [0, -5.5], face: 0, anim: 'attack', phase: 0.5 },
        { side: WILD, id: 'flier', at: [4.8, -5], lift: 3, face: -10, anim: 'fly', phase: 0.3 },
        { side: FEN_, id: 'bog-toad', at: [-3.6, -0.8], face: 25, anim: 'attack', phase: 0.5 },
        { side: MEADOW, id: 'lynx', at: [0, 0.6], face: 25 },
        { side: WILD, id: 'whipweld', at: [3.9, -1.2], face: -95, anim: 'attack', phase: 0.5 },
        ...cluster(MEADOW, 'pikeman', 2, -1.7, -2.6, 0.6, 0, 'brace'),
        ...cluster(MEADOW, 'pikeman', 2, 1.7, -2.6, 0.6, 0, 'brace'),
        ...cluster(FEN_, 'fenling', 5, -6.6, 0.4, 1.5, 25, 'idle', 'attack'),
        ...cluster(WILD, 'larva2', 4, 6.8, 0.6, 1.5, -30, 'walk'),
      ],
    },
    wide: { from: [0, 2.4, 10.5], to: [0, 2.7, -3], fov: 40 },
  },
  // 3. three armies converging on a hilltop crystal deposit from three sides. RULES: the deposit on the crest is the
  //    focal point; each army's line of march is a leading line to it; seen from a little above, off to the side, so
  //    the three columns read as three directions.
  {
    name: 'the hill',
    staging: {
      sky: ['#7a9cc2', '#f5e6c6'],
      camera: { from: [4, 6, 14.5], to: [0, 1.2, -1.5], fov: 42 },
      hills: [{ at: [0, -1], r: 11, h: 2.6 }],
      props: [...homes(1.3), prop((b) => mine(b, 1), [0, -1], 1.3)],
      cast: [
        // Meadowfolk from the back, coming over toward us
        { side: MEADOW, id: 'hurlhorn', at: [-0.5, -7.5], face: 0, anim: 'walk', phase: 0.3 },
        { side: MEADOW, id: 'lynx', at: [1.6, -5], face: -10, anim: 'walk', phase: 0.6 },
        ...cluster(MEADOW, 'pikeman', 6, -1.8, -4.5, 1.6, 5, 'walk'),
        // Fenfolk from the left, climbing right
        { side: FEN_, id: 'great-siege-heron', at: [-8.5, 0.5], face: 90, anim: 'walk', phase: 0.4 },
        { side: FEN_, id: 'bog-toad', at: [-5.5, 1.5], face: 90, anim: 'walk', phase: 0.2 },
        ...cluster(FEN_, 'fenling', 7, -5.5, -1.4, 1.7, 90, 'walk'),
        // the Wildwelds from the right, climbing left
        { side: WILD, id: 'whipweld', at: [6, 0.8], face: -90, anim: 'walk', phase: 0.5 },
        ...cluster(WILD, 'larva1', 6, 6.2, 3, 1.6, -90, 'walk'),
        { side: WILD, id: 'flier', at: [4.5, -2.5], lift: 3.2, face: -100, anim: 'glide', phase: 0.3 },
      ],
    },
    wide: { from: [4, 6, 14.5], to: [0, 2.4, -1.5], fov: 36 },
  },
  // 4. a tight triangle seen from below, the fliers crossing overhead. RULES: low camera tilted up; the three ground
  //    stars (Hurlhorn, toad, Whipweld) frame the picture's bottom edge, turned in to a shared centre; the Great
  //    Siege Heron and the Vimmer cross the open sky above, the focal point, silhouetted against light.
  {
    name: 'the crossing',
    staging: {
      sky: ['#6d93c0', '#fbeed6'],
      camera: { from: [0, 0.35, 6.5], to: [0, 4.2, -3], fov: 56 },
      props: homes(0.8),
      cast: [
        { side: MEADOW, id: 'hurlhorn', at: [0, -3.8], face: 0, anim: 'attack', phase: 0.5 },
        { side: FEN_, id: 'bog-toad', at: [-3.2, 0], face: 60, anim: 'attack', phase: 0.5 },
        { side: WILD, id: 'whipweld', at: [3.4, -0.3], face: -60, anim: 'attack', phase: 0.5 },
        ...cluster(MEADOW, 'pikeman', 2, -2, -3.4, 0.5, 20, 'brace'),
        ...cluster(MEADOW, 'pikeman', 2, 2, -3.4, 0.5, -20, 'brace'),
        ...cluster(FEN_, 'fenling', 4, -2.2, 1.6, 0.9, 40, 'attack', 'idle'),
        ...cluster(WILD, 'larva1', 3, 2.4, 1.6, 0.9, -40, 'walk'),
        { side: FEN_, id: 'great-siege-heron', at: [-2, -2], lift: 4.8, face: 60, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'flier', at: [2.2, -4.5], lift: 6, face: -120, anim: 'fly', phase: 0.7 },
      ],
    },
    wide: { from: [0, 0.35, 7], to: [0, 4.6, -3], fov: 48 },
  },
  // 5. the V again, the Wildwelds told another way: the Vimmer landed among its larvae at the end of its arm, the
  //    Whipweld out in front. RULES as the first: focal Lynx Lancer at the apex, arms as leading lines, low camera.
  {
    name: 'the V, landed',
    staging: {
      sky: ['#86a2c0', '#f7e2b8'],
      camera: { from: [0, 3, 13], to: [0, 1.3, -2], fov: 42 },
      hills: [{ at: [0, -5], r: 5, h: 1.4 }],
      props: homes(),
      cast: [
        { side: MEADOW, id: 'lynx', at: [0, 4], face: -20, anim: 'attack', phase: 0.5 },
        ...cluster(MEADOW, 'pikeman', 6, 0, 0.8, 1.5, 0, 'brace', 'idle'),
        { side: MEADOW, id: 'hurlhorn', at: [0, -4.6], face: 0 },
        { side: FEN_, id: 'bog-toad', at: [-3, 1.8], face: 40 },
        ...cluster(FEN_, 'fenling', 7, -4.6, -0.6, 1.6, 40, 'idle', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [-6.2, -3.8], face: 40, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'whipweld', at: [3.2, 1.6], face: -80 },
        { side: WILD, id: 'flier', at: [5.6, -3.2], face: -45 },
        ...cluster(WILD, 'larva2', 4, 4.6, -0.6, 1.3, -40, 'walk'),
        ...cluster(WILD, 'larva1', 4, 6.4, -1.6, 1.3, -40, 'walk'),
      ],
    },
    wide: { from: [0, 3.2, 13], to: [0, 2.2, -2], fov: 38 },
  },
  // 6. (round 4) the collision, from a low, wide-angle camera on a grassy rise: the three armies about to meet at the
  //    crystal deposit. RULES: one focal point (the Lynx Lancer, nearest and centred, lance levelled), three depth
  //    layers (tufts and the toad in the air in front; the stars; the masses, the Hurlhorn throwing from its ridge and
  //    each army's home behind), the masses as leading lines in toward the deposit, a low sun from the left for long
  //    shadows and warm rims, the heron banking and a Vimmer diving overhead.
  {
    name: 'the collision',
    staging: {
      ...LOOK,
      camera: { from: [0, 1.6, 11.5], to: [0, 2.4, 0], fov: 62 },
      hills: [{ at: [0, 14], r: 6, h: 0.6 }, { at: [4, -12], r: 7, h: 2.8 }, { at: [0, -4], r: 4, h: 0.5 }],
      props: [...homes(1.1), prop((b) => mine(b, 1), [0, -4.5], 1.7), prop(projectile, [0.5, -7], 2.2, 30), ...LIFT([[0.5, -7, 7.5]])],
      scatter: [TUFTS(-5, 8, 4, 40), TUFTS(5.5, 8, 4, 40), TUFTS(-9, 2, 5, 30), TUFTS(9, 2, 5, 30)],
      cast: [
        { side: MEADOW, id: 'lynx', at: [0.3, 5.6], face: 8, anim: 'attack', phase: 0.3 },
        ...cluster(MEADOW, 'pikeman', 26, 0.5, -7.5, 3.6, 0, 'charge', 'walk'),
        ...cluster(MEADOW, 'lynx', 3, 0, -3.2, 2.4, 0, 'charge'),
        { side: MEADOW, id: 'hurlhorn', at: [4, -11.5], face: -10, anim: 'attack', phase: 0.55 },
        { side: FEN_, id: 'bog-toad', at: [-3.8, 5], lift: 1.2, face: 55, anim: 'leap', phase: 0.5 },
        ...cluster(FEN_, 'fenling', 34, -8.5, -1, 4.6, 70, 'charge', 'attack'),
        ...cluster(FEN_, 'bog-toad', 3, -10, -5, 3, 65, 'charge'),
        { side: FEN_, id: 'great-siege-heron', at: [-4.5, -1.5], lift: 6.2, face: 60, roll: 28, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'whipweld', at: [4.2, 4.6], face: -70, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'larva1', 16, 8.2, 0.5, 3.6, -80, 'walk'),
        ...cluster(WILD, 'charger', 18, 7.5, -3.4, 3.4, -75, 'charge', 'attack'),
        ...cluster(WILD, 'micropike', 6, 10, -6, 2.6, -75, 'charge'),
        { side: WILD, id: 'flier', at: [4.6, -0.5], lift: 4.6, face: -115, pitch: 24, anim: 'fly', phase: 0.3 },
      ],
    },
    // wide: the same moment from further, the title's box (the middle) left to the field and the haze; Fenfolk
    // with the Meadowfolk's Hurlhorn on the left, the Wildwelds on the right, a thrown crystal crossing above the box
    wide: {
      ...LOOK,
      camera: { from: [0, 2, 12.5], to: [0, 2.6, -2], fov: 48 },
      hills: [{ at: [0, 17], r: 8, h: 0.9 }, { at: [-14, -6], r: 8, h: 1.2 }, { at: [15, -6], r: 8, h: 1.2 }],
      props: [...homes(1.6), ...LIFT([[-5, -6, 8.5], [-1.5, -7, 9.2]]), ...MARSH(-22, -2), ...WEBS(21, -3)],
      scatter: [TUFTS(-20, 6, 8, 60), TUFTS(20, 6, 8, 60), TUFTS(0, 11, 6, 30)],
      cast: [
        { side: MEADOW, id: 'hurlhorn', at: [-12, 1.5], face: 70, anim: 'attack', phase: 0.55 },
        { side: MEADOW, id: 'lynx', at: [-9.5, 4.5], face: 60, anim: 'charge', phase: 0.3 },
        ...cluster(MEADOW, 'pikeman', 14, -10.5, -3, 3, 70, 'charge', 'walk'),
        { side: FEN_, id: 'bog-toad', at: [-16, 5.5], lift: 1, face: 70, anim: 'leap', phase: 0.5 },
        ...cluster(FEN_, 'fenling', 26, -19, 0, 4.4, 70, 'charge', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [-13.5, -4], lift: 4.4, face: 70, roll: 25, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'whipweld', at: [12.5, 4], face: -75, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'larva1', 14, 17, 2, 3.6, -80, 'walk'),
        ...cluster(WILD, 'charger', 20, 16, -2.5, 4, -80, 'charge', 'attack'),
        { side: WILD, id: 'flier', at: [13.5, -3], lift: 4.6, face: -110, pitch: 24, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'flier', at: [19, -8], lift: 7, face: -80, pitch: 15, anim: 'fly', phase: 0.6 },
      ],
    },
  },
  // 7. (round 4) the V, done properly: the owner's wedge, from low and close with a wide lens. RULES: the Lynx Lancer
  //    charging at the apex is the focal point, big and near; the two arms are leading lines back to the giants and
  //    to the crystal deposit at the V's far end; masses thin into the haze; the heron banks over the left arm, a
  //    Vimmer dives over the right; a low sun from behind-left rims them all.
  {
    name: 'the V, charging',
    staging: {
      ...LOOK,
      sun: { azimuth: -130, elevation: 16 },
      camera: { from: [0, 1.1, 9.5], to: [0, 2.4, -2], fov: 68 },
      hills: [{ at: [0, -14], r: 8, h: 2 }],
      props: [...homes(1.2), prop((b) => mine(b, 1), [0, -12], 1.8)],
      scatter: [TUFTS(0, 7, 6, 60), TUFTS(-9, 0, 6, 26), TUFTS(9, 0, 6, 26)],
      cast: [
        { side: MEADOW, id: 'lynx', at: [0, 3.6], face: 0, anim: 'charge', phase: 0.35 },
        ...cluster(MEADOW, 'lynx', 2, 0, 0.6, 1.4, 0, 'charge'),
        ...cluster(MEADOW, 'pikeman', 18, 0, -3.6, 2.6, 0, 'charge', 'walk'),
        { side: MEADOW, id: 'hurlhorn', at: [0, -8.5], face: 0, anim: 'attack', phase: 0.5 },
        { side: FEN_, id: 'bog-toad', at: [-3.4, 1.4], lift: 0.9, face: 35, anim: 'leap', phase: 0.45 },
        ...cluster(FEN_, 'fenling', 26, -6.5, -3.5, 3.6, 30, 'charge', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [-6, -6], lift: 4.5, face: 40, roll: 26, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'whipweld', at: [3.6, 1], face: -45, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'larva1', 12, 6.5, -2.4, 3, -35, 'walk'),
        ...cluster(WILD, 'charger', 14, 7.5, -5.5, 3, -30, 'charge', 'attack'),
        { side: WILD, id: 'flier', at: [5.5, -4], lift: 3.8, face: -110, pitch: 24, anim: 'fly', phase: 0.3 },
      ],
    },
    // wide: the V from inside: its arms come toward us down the left and right thirds, its point (the Meadowfolk
    // and the deposit) far off at the top of the middle; between the arms, open ground for the title
    wide: {
      ...LOOK,
      sun: { azimuth: -130, elevation: 16 },
      camera: { from: [0, 2.4, 14], to: [0, 1.4, -6], fov: 44 },
      hills: [{ at: [0, -22], r: 9, h: 2.4 }],
      props: [...homes(1.7), prop((b) => mine(b, 1), [0, -24], 2)],
      scatter: [TUFTS(-16, 6, 7, 50), TUFTS(16, 6, 7, 50)],
      cast: [
        { side: MEADOW, id: 'hurlhorn', at: [-2, -20], face: 0, anim: 'attack', phase: 0.5 },
        { side: MEADOW, id: 'lynx', at: [2, -17], face: 0, anim: 'charge', phase: 0.3 },
        ...cluster(MEADOW, 'pikeman', 16, 0, -19, 3, 0, 'charge', 'walk'),
        { side: FEN_, id: 'bog-toad', at: [-12.5, 5], lift: 1, face: 30, anim: 'leap', phase: 0.45 },
        { side: FEN_, id: 'great-siege-heron', at: [-15, 1], face: 25, anim: 'attack', phase: 0.45 },
        ...cluster(FEN_, 'fenling', 20, -13, -4, 3.6, 25, 'charge', 'attack'),
        ...cluster(FEN_, 'fenling', 14, -9, -11, 3, 20, 'charge'),
        { side: WILD, id: 'whipweld', at: [12.5, 4.5], face: -40, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'flier', at: [15, -1], lift: 4.2, face: -110, pitch: 24, anim: 'fly', phase: 0.3 },
        ...cluster(WILD, 'larva1', 14, 14.5, -3, 3.4, -30, 'walk'),
        ...cluster(WILD, 'charger', 16, 9.5, -10, 3, -25, 'charge'),
      ],
    },
  },
  // 8. (round 4) the battle map: a deliberate high three-quarter view, like the game's own, of the three armies
  //    converging on the crystal deposit in a shallow valley, each with its home behind it (marsh and water for the
  //    Fenfolk, fields and the Town Center for the Meadowfolk, web walls and cocoons for the Wildwelds). RULES: the
  //    deposit is the focal point, the three armies' lines of march lead to it, ridges break the ground up.
  {
    name: 'the battle map',
    staging: {
      ...LOOK,
      sun: { azimuth: -70, elevation: 28 },
      camera: { from: [6, 15, 24], to: [0, 0, -2], fov: 40 },
      hills: [{ at: [-16, -8], r: 9, h: 2 }, { at: [16, -10], r: 9, h: 2.2 }, { at: [0, -20], r: 10, h: 2.4 }, { at: [-14, 10], r: 6, h: -0.6 }],
      water: [{ at: [-14, 10], r: 4.6 }],
      props: [prop((b) => mine(b, 1), [0, -1], 1.8), ...MARSH(-14, 8), ...[[-8, -22], [6, -24], [-14, -18]].map(([x, z], i) => prop((b) => meadowTree(b, i * 4), [x, z], 1.2)), ...WEBS(16, -2)],
      scatter: [TUFTS(0, 4, 18, 120)],
      cast: [
        { side: MEADOW, id: 'town-center', at: [0, -24], face: 0 },
        { side: MEADOW, id: 'hurlhorn', at: [-1.5, -9], face: 0, anim: 'attack', phase: 0.5 },
        { side: MEADOW, id: 'lynx', at: [2, -6.5], face: -10, anim: 'charge', phase: 0.3 },
        ...cluster(MEADOW, 'pikeman', 30, 0, -12, 4, 0, 'charge', 'walk'),
        { side: FEN_, id: 'great-siege-heron', at: [-9, 2.5], face: 70, anim: 'walk', phase: 0.3 },
        { side: FEN_, id: 'bog-toad', at: [-6.5, 0.5], lift: 0.6, face: 75, anim: 'leap', phase: 0.5 },
        ...cluster(FEN_, 'fenling', 36, -11, -1, 4.6, 75, 'charge', 'attack'),
        { side: WILD, id: 'whipweld', at: [7, 1.5], face: -75, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'flier', at: [8, -3], lift: 4, face: -80, anim: 'fly', phase: 0.3 },
        ...cluster(WILD, 'larva1', 18, 11, 3, 3.6, -80, 'walk'),
        ...cluster(WILD, 'charger', 24, 11.5, -2, 4, -80, 'charge', 'attack'),
        { side: WILD, id: 'cocoon', at: [16, 4], anim: 'grow', phase: 0.4 },
        { side: WILD, id: 'cocoon', at: [17.5, 2.5], anim: 'grow', phase: 0.7 },
      ],
    },
    // wide: the same high view, wider: the field between the armies is the title's box; the Meadowfolk's columns
    // come over the far ridge above it, the Fenfolk on the left, the Wildwelds on the right
    wide: {
      ...LOOK,
      sun: { azimuth: -70, elevation: 28 },
      camera: { from: [0, 13, 26], to: [0, 0, -3], fov: 34 },
      hills: [{ at: [-26, -6], r: 10, h: 2 }, { at: [26, -6], r: 10, h: 2.2 }, { at: [0, -24], r: 14, h: 3 }, { at: [-24, 9], r: 6, h: -0.6 }],
      water: [{ at: [-24, 9], r: 4.6 }],
      props: [prop((b) => mine(b, 1), [0, -12], 1.8), ...MARSH(-26, 7), ...[[-10, -30], [8, -31], [-16, -27], [16, -28]].map(([x, z], i) => prop((b) => meadowTree(b, i * 4), [x, z], 1.2)), ...WEBS(26, -1)],
      scatter: [TUFTS(-22, 2, 10, 80), TUFTS(22, 2, 10, 80), TUFTS(0, 8, 8, 30)],
      cast: [
        { side: MEADOW, id: 'town-center', at: [0, -32], face: 0 },
        { side: MEADOW, id: 'hurlhorn', at: [-2, -20], face: 0, anim: 'attack', phase: 0.5 },
        { side: MEADOW, id: 'lynx', at: [3, -18], face: 0, anim: 'charge', phase: 0.3 },
        ...cluster(MEADOW, 'pikeman', 26, 0, -21, 4, 0, 'charge', 'walk'),
        { side: FEN_, id: 'great-siege-heron', at: [-19, 2.5], face: 70, anim: 'walk', phase: 0.3 },
        { side: FEN_, id: 'bog-toad', at: [-15.5, 1], lift: 0.6, face: 75, anim: 'leap', phase: 0.5 },
        ...cluster(FEN_, 'fenling', 34, -21, -2, 4.6, 75, 'charge', 'attack'),
        { side: WILD, id: 'whipweld', at: [16, 1.5], face: -75, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'flier', at: [17, -3], lift: 4, face: -80, anim: 'fly', phase: 0.3 },
        ...cluster(WILD, 'larva1', 16, 21, 3, 3.6, -80, 'walk'),
        ...cluster(WILD, 'charger', 24, 21.5, -2, 4, -80, 'charge', 'attack'),
      ],
    },
  },
  // 9. (round 4) the throw: the Hurlhorn close and huge in the foreground, mid-throw, its crystal in the air arcing
  //    over to where a bullfrog bounds in from the left and the Whipweld lashes from the right. RULES: the Hurlhorn
  //    on the left third is the focal point; the crystal's arc is the leading line to the clash; low camera, so the
  //    Hurlhorn looms against the sky; the masses behind thin into haze.
  {
    name: 'the throw',
    staging: {
      ...LOOK,
      sun: { azimuth: 120, elevation: 18 },
      camera: { from: [-1, 0.9, 8.5], to: [1, 2.6, -2], fov: 62 },
      props: [...homes(1.2), ...LIFT([[0.5, 0, 4.6], [2.5, -2.5, 5]])],
      scatter: [TUFTS(0, 6, 6, 50), TUFTS(4, -4, 8, 40)],
      cast: [
        { side: MEADOW, id: 'hurlhorn', at: [-3.2, 2.6], face: 50, anim: 'attack', phase: 0.55 },
        ...cluster(MEADOW, 'pikeman', 10, -6.5, -2, 2.6, 45, 'charge', 'walk'),
        { side: MEADOW, id: 'lynx', at: [-5.5, -4.5], face: 40, anim: 'charge', phase: 0.3 },
        { side: FEN_, id: 'bog-toad', at: [1.6, -2.5], lift: 1.1, face: 100, anim: 'leap', phase: 0.5 },
        ...cluster(FEN_, 'fenling', 20, -1, -8, 4, 90, 'charge', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [-1, -10], lift: 6, face: 80, roll: 22, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'whipweld', at: [5.4, -2], face: -70, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'charger', 18, 8.5, -6, 3.6, -80, 'charge', 'attack'),
        ...cluster(WILD, 'larva1', 10, 9, -2, 2.6, -80, 'walk'),
        { side: WILD, id: 'flier', at: [6, -6], lift: 4.4, face: -110, pitch: 24, anim: 'fly', phase: 0.3 },
      ],
    },
    // wide: the Hurlhorn huge on the left, its crystal arcing high over the title's box to the right, where the
    // Wildwelds and the Fenfolk meet it
    wide: {
      ...LOOK,
      sun: { azimuth: 120, elevation: 18 },
      camera: { from: [0, 1.1, 10], to: [0, 2.8, -2], fov: 50 },
      props: [...homes(1.8), ...LIFT([[-6, 0, 5.5], [-1, -2, 7], [4, -3.5, 7]])],
      scatter: [TUFTS(-12, 5, 6, 50), TUFTS(12, 5, 6, 50)],
      cast: [
        { side: MEADOW, id: 'hurlhorn', at: [-10.5, 3.2], face: 60, anim: 'attack', phase: 0.55 },
        { side: MEADOW, id: 'lynx', at: [-14.5, 0], face: 60, anim: 'charge', phase: 0.3 },
        ...cluster(MEADOW, 'pikeman', 12, -15, -4, 3, 55, 'charge', 'walk'),
        { side: FEN_, id: 'bog-toad', at: [10, 2.4], lift: 1, face: -110, anim: 'leap', phase: 0.5 },
        { side: FEN_, id: 'great-siege-heron', at: [15, -4], face: -80, anim: 'attack', phase: 0.45 },
        ...cluster(FEN_, 'fenling', 18, 15, -1, 3.4, -100, 'charge', 'attack'),
        { side: WILD, id: 'whipweld', at: [14, 4], face: -70, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'charger', 14, 19, 1, 3, -90, 'charge'),
        { side: WILD, id: 'flier', at: [11, -5], lift: 5, face: -110, pitch: 24, anim: 'fly', phase: 0.3 },
      ],
    },
  },
  // 10. (maximal) sunset collision: the three armies meet in front of a sun going down behind them, each with its
  //     homeland behind it (the fen's stilt huts and pools left, the Great Hall on its rise in the middle, the hive
  //     right), ridges fading into haze. RULES: backlight rims every body warm; one focal point (the Lynx Lancer,
  //     nearest, three-quarter on); things in the air (the toad at the top of its bound, the heron banking, Vimmers
  //     diving, crystals mid-flight); masses thin into the haze.
  {
    name: 'sunset collision',
    top: 2,
    staging: join({
      ...DUSK(172, 7), ridges: RIDGES('#5a5a4c', '#7f7a72', true),
      camera: { from: [0, 1.7, 12], to: [0, 2.7, 0], fov: 60 },
      hills: [{ at: [0, 14], r: 6, h: 0.6 }],
      props: [prop((b) => mine(b, 1), [0, -6], 1.6), ...LIFT([[-1, -4, 6.5], [1.5, -6, 8], [3, -3, 5]])],
      scatter: [TUFTS(-6, 8, 4, 40), TUFTS(6.5, 8, 4, 40), TUFTS(0, -2, 14, 120)],
      cast: [
        { side: MEADOW, id: 'lynx', at: [0.8, 5.4], face: -60, anim: 'attack', phase: 0.35 },
        ...cluster(MEADOW, 'lynx', 4, 0, -1, 3, 0, 'charge'),
        ...cluster(MEADOW, 'pikeman', 40, 0, -9, 5, 0, 'charge', 'walk'),
        { side: MEADOW, id: 'hurlhorn', at: [-2.5, -13], face: 10, anim: 'attack', phase: 0.55 },
        { side: MEADOW, id: 'hurlhorn', at: [3.5, -14], face: -10, anim: 'attack', phase: 0.3 },
        { side: FEN_, id: 'bog-toad', at: [-3.8, 4.4], lift: 1.4, face: 60, anim: 'leap', phase: 0.5 },
        ...cluster(FEN_, 'bog-toad', 4, -9, -3, 3, 65, 'leap', 'charge'),
        ...cluster(FEN_, 'fenling', 50, -9.5, 0, 6, 70, 'charge', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [-5, -2], lift: 6, face: 60, roll: 28, anim: 'fly', phase: 0.3 },
        { side: FEN_, id: 'great-siege-heron', at: [-12, -9], lift: 4, face: 70, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'whipweld', at: [4.6, 4.2], face: -70, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'larva1', 24, 9, 1, 5, -80, 'walk'),
        ...cluster(WILD, 'charger', 36, 9.5, -3, 5.5, -80, 'charge', 'attack'),
        ...cluster(WILD, 'micropike', 8, 12, -7, 3, -75, 'charge'),
        { side: WILD, id: 'flier', at: [4.6, -0.5], lift: 4.8, face: -115, pitch: 24, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'flier', at: [8, -4], lift: 6.5, face: -100, pitch: 34, anim: 'fly', phase: 0.6 },
        { side: WILD, id: 'dragon-fly', at: [10, -12], lift: 8, face: -80, anim: 'fly', phase: 0.4 },
      ],
    }, FEN_HOME(-21, -24), MEADOW_HOME(0, -32), WILD_HOME(21, -24)),
    // wide: the sun low on the left; the Fenfolk and the Hurlhorns down the left third, the Wildwelds the right, the
    // Meadowfolk's charge seen from just behind along the bottom; the middle is the field in the sun's haze
    wide: join({
      ...DUSK(-150, 7), ridges: RIDGES('#5a5a4c', '#7f7a72', true),
      camera: { from: [0, 3.2, 14], to: [0, 2.2, -4], fov: 46 },
      props: [prop((b) => mine(b, 1), [0, -16], 1.6), ...LIFT([[-9, -2, 8], [-5, -4, 10]])],
      scatter: [TUFTS(-22, 6, 8, 70), TUFTS(22, 6, 8, 70), TUFTS(0, 4, 20, 80)],
      cast: [
        ...cluster(MEADOW, 'pikeman', 16, 0, 8.5, 4, 180, 'charge', 'walk'),
        { side: MEADOW, id: 'lynx', at: [-4, 7.5], face: 160, anim: 'charge', phase: 0.3 },
        { side: MEADOW, id: 'lynx', at: [4.5, 7.8], face: 200, anim: 'charge', phase: 0.6 },
        { side: MEADOW, id: 'hurlhorn', at: [-12, 4.5], face: 60, anim: 'attack', phase: 0.55 },
        { side: FEN_, id: 'bog-toad', at: [-16, 5.5], lift: 1.2, face: 70, anim: 'leap', phase: 0.5 },
        ...cluster(FEN_, 'fenling', 40, -21, 0, 5.5, 70, 'charge', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [-15, -3], lift: 4.6, face: 70, roll: 25, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'whipweld', at: [14, 5], face: -75, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'larva1', 20, 20, 3, 4.5, -80, 'walk'),
        ...cluster(WILD, 'charger', 30, 20, -2, 5, -80, 'charge', 'attack'),
        { side: WILD, id: 'flier', at: [15, -3], lift: 4.6, face: -110, pitch: 24, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'dragon-fly', at: [21, -9], lift: 6.5, face: -90, anim: 'fly', phase: 0.5 },
      ],
    }, FEN_HOME(-30, -14), WILD_HOME(30, -14), MEADOW_HOME(0, -46, 1.2)),
  },
  // 11. (maximal) the storm front: gold light on the left where the fen comes on, a black storm over the hive on the
  //     right, the Meadowfolk between. RULES: warm against cool, light against dark; the clash in the middle is the
  //     focal point; the storm and the sun are two halves of the frame.
  {
    name: 'the storm front',
    staging: join({
      sun: { azimuth: -95, elevation: 12 }, clouds: 'many', storm: 1, sky: ['#2c3548', '#f2c58a'],
      groundColors: ['#45522a', '#56662f', '#66733a', '#585f30', '#62523a'], ridges: RIDGES('#4c4c44', '#6c6a66'),
      camera: { from: [0, 1.3, 11], to: [0, 2.8, -1], fov: 60 },
      props: [prop((b) => mine(b, 1), [0.5, -3.5], 1.5), ...LIFT([[-2, -3, 5.5], [2, -5, 7]])],
      scatter: [TUFTS(0, 2, 14, 140)],
      cast: [
        { side: FEN_, id: 'great-siege-heron', at: [-4.5, 1.5], face: 70, anim: 'attack', phase: 0.45 },
        { side: FEN_, id: 'bog-toad', at: [-2, 4], lift: 1, face: 75, anim: 'leap', phase: 0.45 },
        ...cluster(FEN_, 'fenling', 40, -8, 0, 5, 75, 'charge', 'attack'),
        ...cluster(FEN_, 'bog-toad', 3, -10, -5, 3, 70, 'charge'),
        { side: WILD, id: 'whipweld', at: [3.4, 3.2], face: -80, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'dragon-fly', at: [6, -2], lift: 5.5, face: -100, anim: 'fly', phase: 0.3 },
        ...cluster(WILD, 'charger', 40, 8.5, -0.5, 5, -85, 'charge', 'attack'),
        ...cluster(WILD, 'larva3', 6, 10, 3.5, 2.6, -80, 'walk'),
        ...Array.from({ length: 6 }, (_, i) => ({ side: WILD, id: 'flier', at: [5 + i * 2.2, -6 - i * 1.5] as [number, number], lift: 5 + i, face: -100 - i * 8, pitch: 20 + i * 4, anim: 'fly', phase: i * 0.15 })),
        { side: MEADOW, id: 'lynx', at: [0.5, 5.5], face: -60, anim: 'charge', phase: 0.35 },
        ...cluster(MEADOW, 'pikeman', 30, 0.5, -9, 4.5, 0, 'charge', 'walk'),
        { side: MEADOW, id: 'hurlhorn', at: [0, -14], face: 0, anim: 'attack', phase: 0.55 },
      ],
    }, FEN_HOME(-20, -22), MEADOW_HOME(0, -30), WILD_HOME(20, -22)),
    wide: join({
      sun: { azimuth: -95, elevation: 12 }, clouds: 'many', storm: 1, sky: ['#2c3548', '#f2c58a'],
      groundColors: ['#45522a', '#56662f', '#66733a', '#585f30', '#62523a'], ridges: RIDGES('#4c4c44', '#6c6a66', true),
      camera: { from: [0, 1.6, 13], to: [0, 3, -2], fov: 44 },
      scatter: [TUFTS(-14.4, 5, 9, 80), TUFTS(14.4, 5, 9, 80)],
      cast: [
        { side: FEN_, id: 'great-siege-heron', at: [-12.2, 0], face: 70, anim: 'attack', phase: 0.45 },
        { side: FEN_, id: 'bog-toad', at: [-9.4, 4.5], lift: 1, face: 75, anim: 'leap', phase: 0.45 },
        ...cluster(FEN_, 'fenling', 40, -15.1, 1, 5, 75, 'charge', 'attack'),
        { side: MEADOW, id: 'hurlhorn', at: [-7.2, -2], face: 60, anim: 'attack', phase: 0.55 },
        { side: MEADOW, id: 'lynx', at: [-8.3, 3.5], face: 60, anim: 'charge', phase: 0.3 },
        ...cluster(MEADOW, 'pikeman', 14, -8.6, -5, 3, 55, 'charge'),
        { side: WILD, id: 'whipweld', at: [9.4, 4], face: -80, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'dragon-fly', at: [11.5, -3], lift: 4.5, face: -100, anim: 'fly', phase: 0.3 },
        ...cluster(WILD, 'charger', 36, 14.4, 0, 5, -85, 'charge', 'attack'),
        ...Array.from({ length: 5 }, (_, i) => ({ side: WILD, id: 'flier', at: [16 + i * 2.2, -6 - i * 1.5] as [number, number], lift: 5 + i, face: -100 - i * 8, pitch: 20 + i * 4, anim: 'fly', phase: i * 0.15 })),
      ],
    }, FEN_HOME(-21.6, -14), WILD_HOME(21.6, -14)),
  },
  // 12. (maximal) the crystal valley: from a shoulder of hill, down into a valley where a field of crystal deposits
  //     glows, mountains behind; the three armies pour down the slopes from three sides. RULES: the glowing deposits
  //     are the focal point, every column a leading line down to them; high-ish camera on purpose, so the valley reads.
  {
    name: 'the crystal valley',
    top: 5,
    staging: join({
      ...DUSK(-150, 10), glows: [{ x: 0.5, color: '#7fd8ff', r: 0.2 }], ridges: RIDGES('#4d5148', '#6f7470', true),
      camera: { from: [2, 7.5, 18], to: [0, 0, -4], fov: 50 },
      hills: [{ at: [-16, -2], r: 10, h: 4 }, { at: [16, -2], r: 10, h: 4 }, { at: [0, -18], r: 11, h: 4.5 }, { at: [0, 18], r: 8, h: 2.5 }],
      props: [prop((b) => mine(b, 1), [0, -2], 1.8), prop((b) => mine(b, 0.6), [-3, -4], 1.4), prop((b) => mine(b, 0.8), [3, -0.5], 1.3), prop((b) => mine(b, 0.4), [1.5, -6], 1.2), ...LIFT([[-6, -4, 5], [6, -5, 6]])],
      scatter: [TUFTS(0, 4, 20, 160)],
      cast: [
        ...cluster(FEN_, 'fenling', 50, -12, -1, 5, 80, 'charge', 'attack'),
        ...cluster(FEN_, 'bog-toad', 5, -9, 2, 3, 75, 'leap', 'charge'),
        { side: FEN_, id: 'great-siege-heron', at: [-14, -5], face: 75, anim: 'walk', phase: 0.3 },
        { side: FEN_, id: 'great-siege-heron', at: [-6, -6], lift: 5, face: 70, roll: 24, anim: 'fly', phase: 0.3 },
        ...cluster(WILD, 'charger', 44, 12, -1, 5, -80, 'charge', 'attack'),
        ...cluster(WILD, 'larva1', 20, 14, 3, 4, -80, 'walk'),
        { side: WILD, id: 'whipweld', at: [8.5, 1], face: -80, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'dragon-fly', at: [8, -7], lift: 5.5, face: -90, anim: 'fly', phase: 0.4 },
        ...Array.from({ length: 4 }, (_, i) => ({ side: WILD, id: 'flier', at: [6 + i * 2, -2 - i * 2] as [number, number], lift: 4 + i, face: -110, pitch: 25, anim: 'fly', phase: i * 0.2 })),
        ...cluster(MEADOW, 'pikeman', 44, 0, -13, 5, 0, 'charge', 'walk'),
        ...cluster(MEADOW, 'lynx', 6, 0, -8, 3, 0, 'charge'),
        { side: MEADOW, id: 'hurlhorn', at: [-3, -17], face: 5, anim: 'attack', phase: 0.55 },
        { side: MEADOW, id: 'hurlhorn', at: [3.5, -17.5], face: -5, anim: 'attack', phase: 0.3 },
      ],
    }, FEN_HOME(-24, -12), MEADOW_HOME(0, -28), WILD_HOME(24, -12)),
    wide: join({
      ...DUSK(-160, 10), glows: [{ x: 0.5, color: '#7fd8ff', r: 0.25 }], ridges: RIDGES('#4d5148', '#6f7470', true),
      camera: { from: [0, 5, 15], to: [0, 0.8, -4], fov: 40 },
      hills: [{ at: [-22, -2], r: 10, h: 4 }, { at: [22, -2], r: 10, h: 4 }],
      props: [prop((b) => mine(b, 1), [0, -2], 1.5), prop((b) => mine(b, 0.6), [-3, -3], 1.1), prop((b) => mine(b, 0.8), [3, -1.5], 1.1)],
      scatter: [TUFTS(-20, 4, 10, 90), TUFTS(20, 4, 10, 90), TUFTS(0, -8, 14, 60)],
      cast: [
        ...cluster(FEN_, 'fenling', 46, -20, 0, 6, 80, 'charge', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [-16, -4], face: 75, anim: 'attack', phase: 0.45 },
        { side: FEN_, id: 'bog-toad', at: [-14, 4], lift: 1, face: 75, anim: 'leap', phase: 0.5 },
        ...cluster(MEADOW, 'pikeman', 24, -13, -9, 4, 50, 'charge'),
        { side: MEADOW, id: 'hurlhorn', at: [-11, -4], face: 55, anim: 'attack', phase: 0.55 },
        { side: MEADOW, id: 'lynx', at: [-10, 1.5], face: 60, anim: 'charge', phase: 0.3 },
        ...cluster(WILD, 'charger', 44, 20, 0, 6, -80, 'charge', 'attack'),
        { side: WILD, id: 'whipweld', at: [14, 3], face: -80, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'dragon-fly', at: [17, -5], lift: 5, face: -90, anim: 'fly', phase: 0.4 },
      ],
    }, FEN_HOME(-32, -10), WILD_HOME(32, -10)),
  },
  // 13. (maximal) the sky war: from the ground, looking up into a sunset full of fliers, dragon flies and Vimmers
  //     against herons, crystals flying; the armies a dark band along the bottom. RULES: silhouettes against light;
  //     the nearest dragon fly is the focal point on the upper third; size falls off with distance.
  {
    name: 'the sky war',
    top: 4,
    staging: join({
      ...DUSK(178, 6), ridges: RIDGES('#3e3e38', '#5e5c58', true),
      camera: { from: [0, 0.4, 8], to: [0, 5.5, -6], fov: 64 },
      props: LIFT([[-2, -6, 7], [2, -8, 9], [0, -4, 5.5], [-5, -10, 10]]),
      cast: [
        { side: WILD, id: 'dragon-fly', at: [1.8, -1], lift: 4.8, face: -60, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'dragon-fly', at: [7, -9], lift: 8, face: -100, anim: 'fly', phase: 0.6 },
        { side: WILD, id: 'dragon-fly', at: [-2, -16], lift: 12, face: 60, anim: 'glide', phase: 0.2 },
        ...Array.from({ length: 10 }, (_, i) => ({ side: WILD, id: 'flier', at: [((i * 37) % 18) - 4, -4 - ((i * 23) % 14)] as [number, number], lift: 5 + ((i * 7) % 8), face: -80 - ((i * 29) % 60), pitch: (i * 13) % 35, anim: 'fly', phase: ((i * 3) % 7) / 7 })),
        { side: FEN_, id: 'great-siege-heron', at: [-3.5, -2], lift: 4.4, face: 50, roll: 30, anim: 'fly', phase: 0.3 },
        { side: FEN_, id: 'great-siege-heron', at: [-9, -10], lift: 8, face: 60, roll: -20, anim: 'fly', phase: 0.6 },
        { side: FEN_, id: 'great-siege-heron', at: [-4, -18], lift: 11, face: 40, anim: 'fly', phase: 0.1 },
        ...cluster(FEN_, 'fenling', 40, -8, -6, 6, 60, 'charge', 'attack'),
        ...cluster(MEADOW, 'pikeman', 40, 0, -12, 6, 0, 'charge', 'walk'),
        { side: MEADOW, id: 'hurlhorn', at: [-1, -6], face: 0, anim: 'attack', phase: 0.55 },
        ...cluster(WILD, 'charger', 40, 8, -6, 6, -60, 'charge', 'attack'),
      ],
    }),
    wide: join({
      ...DUSK(-150, 6), ridges: RIDGES('#3e3e38', '#5e5c58', true),
      camera: { from: [0, 0.6, 10], to: [0, 4, -6], fov: 50 },
      props: LIFT([[-6, -6, 7], [6, -8, 8]]),
      cast: [
        { side: FEN_, id: 'great-siege-heron', at: [-11, -2], lift: 4.6, face: 50, roll: 30, anim: 'fly', phase: 0.3 },
        { side: FEN_, id: 'great-siege-heron', at: [-18, -10], lift: 7, face: 60, roll: -20, anim: 'fly', phase: 0.6 },
        { side: WILD, id: 'dragon-fly', at: [11, -2], lift: 4.6, face: -60, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'dragon-fly', at: [19, -10], lift: 7.5, face: -100, anim: 'fly', phase: 0.6 },
        ...Array.from({ length: 8 }, (_, i) => ({ side: WILD, id: 'flier', at: [12 + ((i * 37) % 12), -4 - ((i * 23) % 12)] as [number, number], lift: 4 + ((i * 7) % 7), face: -80 - ((i * 29) % 60), pitch: (i * 13) % 35, anim: 'fly', phase: ((i * 3) % 7) / 7 })),
        ...cluster(FEN_, 'fenling', 40, -16, -2, 6, 60, 'charge', 'attack'),
        ...cluster(WILD, 'charger', 40, 16, -2, 6, -60, 'charge', 'attack'),
        ...cluster(MEADOW, 'pikeman', 22, 0, 5, 5, 0, 'charge', 'walk'),
        { side: MEADOW, id: 'hurlhorn', at: [-2.5, 3], face: 10, anim: 'attack', phase: 0.55 },
        { side: MEADOW, id: 'lynx', at: [2.6, 6.2], face: -30, anim: 'charge', phase: 0.35 },
      ],
      scatter: [TUFTS(-14, 6, 7, 60), TUFTS(14, 6, 7, 60), TUFTS(0, 7, 6, 30)],
    }),
  },
  // 14. (maximal) the three homelands: a panorama, the fen left, the meadow's Great Hall middle and far, the hive
  //     right, each army mustered before its home. RULES: three blocks, three depth layers each (army, home, ridges);
  //     the Great Hall on its rise is the focal point; a calm sky across the middle.
  {
    name: 'the three homelands',
    staging: join({
      ...DUSK(-140, 12), ridges: RIDGES('#55584a', '#7a7c76', true),
      camera: { from: [0, 4, 20], to: [0, 1.5, -6], fov: 50 },
      scatter: [TUFTS(0, 8, 16, 140)],
      cast: [
        ...cluster(FEN_, 'fenling', 30, -9, 4, 4, 30, 'idle', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [-8, 7.5], face: 25 },
        { side: FEN_, id: 'bog-toad', at: [-5, 8], face: 20, anim: 'attack', phase: 0.5 },
        ...cluster(MEADOW, 'pikeman', 30, 0, 2, 4, 0, 'brace', 'idle'),
        { side: MEADOW, id: 'lynx', at: [0, 8], face: 20 },
        { side: MEADOW, id: 'hurlhorn', at: [-1.5, -2], face: 0, anim: 'attack', phase: 0.5 },
        ...cluster(WILD, 'larva1', 20, 9, 4, 4, -30, 'walk'),
        { side: WILD, id: 'whipweld', at: [6, 8], face: -60, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'flier', at: [8, 4], lift: 3.5, face: -40, anim: 'fly', phase: 0.3 },
      ],
    }, FEN_HOME(-16, -8, 1.1), MEADOW_HOME(0, -16), WILD_HOME(16, -8, 1.1)),
    wide: join({
      ...DUSK(-150, 12), ridges: RIDGES('#55584a', '#7a7c76', true),
      camera: { from: [0, 4, 22], to: [0, 2, -6], fov: 38 },
      scatter: [TUFTS(-15.6, 8, 10, 80), TUFTS(15.6, 8, 10, 80)],
      cast: [
        ...cluster(FEN_, 'fenling', 34, -14.4, 6, 5, 30, 'idle', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [-12.0, 9], face: 25 },
        { side: FEN_, id: 'bog-toad', at: [-10.2, 11], face: 20, anim: 'attack', phase: 0.5 },
        ...cluster(WILD, 'larva1', 24, 14.4, 6, 5, -30, 'walk'),
        { side: WILD, id: 'whipweld', at: [10.8, 10], face: -60, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'flier', at: [12.6, 5], lift: 4, face: -40, anim: 'fly', phase: 0.3 },
        ...cluster(MEADOW, 'pikeman', 24, 0.0, -26, 4, 0, 'brace', 'idle'),
        { side: MEADOW, id: 'hurlhorn', at: [-1.8, -24], face: 0 },
        { side: MEADOW, id: 'lynx', at: [1.8, -24], face: 0 },
      ],
    }, FEN_HOME(-19.2, -6, 1.2), MEADOW_HOME(0, -34), WILD_HOME(19.2, -6, 1.2)),
  },
  // 15. (maximal) down the ridge: from the foot of a long slope, looking up at the three armies pouring down at us
  //     along the crest, black against a blazing sunset. RULES: silhouettes on the skyline; the crest is the leading
  //     line; the nearest charger, lancer and toad are the three focal points of a triangle.
  {
    name: 'down the ridge',
    top: 1,
    staging: join({
      ...DUSK(180, 4), sky: ['#2a2c48', '#ffb46a'],
      camera: { from: [0, 0.7, 12], to: [0, 3.8, -4], fov: 58 },
      hills: [{ at: [0, -12], r: 18, h: 6 }],
      scatter: [TUFTS(0, 4, 10, 120)],
      props: LIFT([[-3, -2, 7], [2, -4, 9]]),
      cast: [
        { side: MEADOW, id: 'lynx', at: [0.5, 4], face: 0, anim: 'charge', phase: 0.35 },
        ...cluster(MEADOW, 'pikeman', 26, 0, -6, 4, 0, 'charge', 'walk'),
        { side: MEADOW, id: 'hurlhorn', at: [0, -11], face: 0, anim: 'attack', phase: 0.55 },
        { side: FEN_, id: 'bog-toad', at: [-4.5, 3], lift: 1.3, face: 20, anim: 'leap', phase: 0.5 },
        ...cluster(FEN_, 'fenling', 34, -8, -5, 4.5, 15, 'charge', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [-9.5, -10], face: 15, anim: 'walk', phase: 0.3 },
        { side: WILD, id: 'whipweld', at: [5, 2.6], face: -25, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'charger', 34, 8.5, -5, 4.5, -15, 'charge', 'attack'),
        { side: WILD, id: 'dragon-fly', at: [8, -9], lift: 6, face: -20, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'flier', at: [4, -6], lift: 6, face: -10, pitch: 30, anim: 'fly', phase: 0.5 },
        { side: FEN_, id: 'great-siege-heron', at: [-4, -7], lift: 6.5, face: 10, roll: 25, anim: 'fly', phase: 0.4 },
      ],
    }),
    wide: join({
      ...DUSK(178, 4), sky: ['#2a2c48', '#ffb46a'],
      camera: { from: [0, 0.8, 14], to: [0, 3.6, -4], fov: 46 },
      hills: [{ at: [-18, -12], r: 16, h: 6 }, { at: [18, -12], r: 16, h: 6 }, { at: [0, -16], r: 12, h: 2.5 }],
      scatter: [TUFTS(-16, 4, 9, 80), TUFTS(16, 4, 9, 80)],
      cast: [
        { side: FEN_, id: 'bog-toad', at: [-12, 4], lift: 1.2, face: 30, anim: 'leap', phase: 0.5 },
        ...cluster(FEN_, 'fenling', 40, -18, -5, 5, 25, 'charge', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [-21, -10], face: 25, anim: 'walk', phase: 0.3 },
        { side: MEADOW, id: 'lynx', at: [-10, 1], face: 40, anim: 'charge', phase: 0.35 },
        { side: MEADOW, id: 'hurlhorn', at: [-14, -9], face: 30, anim: 'attack', phase: 0.55 },
        ...cluster(MEADOW, 'pikeman', 16, -12, -4, 3, 35, 'charge'),
        { side: WILD, id: 'whipweld', at: [12, 3], face: -30, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'charger', 40, 18, -5, 5, -25, 'charge', 'attack'),
        { side: WILD, id: 'dragon-fly', at: [19, -10], lift: 6, face: -25, anim: 'fly', phase: 0.3 },
      ],
    }),
  },
  // 16. (maximal) the V with their homes: the owner's wedge from low and close, each arm running back to its own
  //     homeland, the sun setting right behind the point of the V. RULES: the V's arms are leading lines to the sun;
  //     the Lynx Lancer at the point is the focal point; the homes fill the distance.
  {
    name: 'the V at sundown',
    top: 3,
    staging: join({
      ...DUSK(180, 6), ridges: RIDGES('#4e4c44', '#76716a', true),
      camera: { from: [0, 1.2, 10], to: [0, 2.6, -2], fov: 64 },
      scatter: [TUFTS(0, 4, 12, 120)],
      cast: [
        { side: MEADOW, id: 'lynx', at: [0, 4.4], face: -55, anim: 'charge', phase: 0.35 },
        ...cluster(MEADOW, 'lynx', 3, 0, 1, 2, 0, 'charge'),
        ...cluster(MEADOW, 'pikeman', 30, 0, -5, 3.5, 0, 'charge', 'walk'),
        { side: MEADOW, id: 'hurlhorn', at: [0, -11], face: 0, anim: 'attack', phase: 0.55 },
        { side: FEN_, id: 'bog-toad', at: [-3.6, 2.2], lift: 1, face: 35, anim: 'leap', phase: 0.45 },
        ...cluster(FEN_, 'fenling', 36, -8, -4, 5, 30, 'charge', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [-7, -8], lift: 4.5, face: 40, roll: 26, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'whipweld', at: [4, 1.6], face: -45, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'larva1', 16, 7.5, -2.5, 3.5, -35, 'walk'),
        ...cluster(WILD, 'charger', 24, 9, -7, 4.5, -30, 'charge', 'attack'),
        { side: WILD, id: 'flier', at: [6, -5], lift: 4, face: -110, pitch: 24, anim: 'fly', phase: 0.3 },
      ],
    }, FEN_HOME(-22, -18), MEADOW_HOME(0, -30), WILD_HOME(22, -18)),
    wide: join({
      ...DUSK(180, 6), ridges: RIDGES('#4e4c44', '#76716a', true),
      camera: { from: [0, 2.4, 14], to: [0, 1.6, -6], fov: 44 },
      scatter: [TUFTS(-16, 6, 7, 60), TUFTS(16, 6, 7, 60)],
      cast: [
        ...cluster(MEADOW, 'pikeman', 20, 0, -22, 3.5, 0, 'charge', 'walk'),
        { side: MEADOW, id: 'hurlhorn', at: [-2, -24], face: 0, anim: 'attack', phase: 0.55 },
        { side: MEADOW, id: 'lynx', at: [2, -19], face: 0, anim: 'charge', phase: 0.3 },
        { side: FEN_, id: 'bog-toad', at: [-12.5, 5], lift: 1, face: 30, anim: 'leap', phase: 0.45 },
        { side: FEN_, id: 'great-siege-heron', at: [-15, 1], face: 25, anim: 'attack', phase: 0.45 },
        ...cluster(FEN_, 'fenling', 30, -13, -4, 4, 25, 'charge', 'attack'),
        ...cluster(FEN_, 'fenling', 20, -8, -12, 3.5, 20, 'charge'),
        { side: WILD, id: 'whipweld', at: [12.5, 4.5], face: -40, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'flier', at: [15, -1], lift: 4.2, face: -110, pitch: 24, anim: 'fly', phase: 0.3 },
        ...cluster(WILD, 'larva1', 16, 14.5, -3, 3.4, -30, 'walk'),
        ...cluster(WILD, 'charger', 20, 9.5, -11, 3.5, -25, 'charge'),
      ],
    }, FEN_HOME(-28, -16), WILD_HOME(28, -16), MEADOW_HOME(0, -40)),
  },
  // 17. (maximal) the ford: a river of sky-coloured water across the middle; the Fenfolk wading in from the left,
  //     the Wildwelds swarming down to the right bank, the Meadowfolk charging over the shallows at us. RULES: the
  //     river is the leading line across; water catching the sky behind dark bodies; the Lynx Lancer splashing
  //     through is the focal point.
  {
    name: 'the ford',
    staging: join({
      ...DUSK(-160, 8), ridges: RIDGES('#4e5048', '#717470', true),
      camera: { from: [0, 1.6, 12], to: [0, 2, -2], fov: 58 },
      hills: Array.from({ length: 9 }, (_, i) => ({ at: [-24 + i * 6, -1 + Math.sin(i) * 1.5] as [number, number], r: 4.5, h: -0.5 })),
      water: Array.from({ length: 9 }, (_, i) => ({ at: [-24 + i * 6, -1 + Math.sin(i) * 1.5] as [number, number], r: 4 })),
      scatter: [TUFTS(-6, 7, 5, 50), TUFTS(6, 7, 5, 50)],
      props: LIFT([[-3, -3, 6], [2, -5, 7.5]]),
      cast: [
        { side: MEADOW, id: 'lynx', at: [0.5, 2], face: -55, anim: 'charge', phase: 0.35 },
        ...cluster(MEADOW, 'lynx', 3, 0, -2, 2.4, 0, 'charge'),
        ...cluster(MEADOW, 'pikeman', 30, 0, -9, 4, 0, 'charge', 'walk'),
        { side: MEADOW, id: 'hurlhorn', at: [0, -14], face: 0, anim: 'attack', phase: 0.55 },
        { side: FEN_, id: 'bog-toad', at: [-4, 1], lift: 1.2, face: 60, anim: 'leap', phase: 0.5 },
        ...cluster(FEN_, 'fenling', 40, -9, 0, 5, 70, 'charge', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [-6.5, -4], face: 60, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'whipweld', at: [4.5, 1.5], face: -70, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'charger', 36, 9, -1, 5, -80, 'charge', 'attack'),
        { side: WILD, id: 'dragon-fly', at: [7, -6], lift: 5.5, face: -90, anim: 'fly', phase: 0.4 },
        { side: WILD, id: 'flier', at: [3.5, -2], lift: 4.5, face: -110, pitch: 26, anim: 'fly', phase: 0.3 },
      ],
    }, FEN_HOME(-20, -20), MEADOW_HOME(0, -30), WILD_HOME(20, -20)),
    wide: join({
      ...DUSK(-160, 8), ridges: RIDGES('#4e5048', '#717470', true),
      camera: { from: [0, 2.2, 15], to: [0, 1.4, -4], fov: 44 },
      hills: Array.from({ length: 13 }, (_, i) => ({ at: [-36 + i * 6, 1 + Math.sin(i) * 1.5] as [number, number], r: 4.5, h: -0.5 })),
      water: Array.from({ length: 13 }, (_, i) => ({ at: [-36 + i * 6, 1 + Math.sin(i) * 1.5] as [number, number], r: 4 })),
      scatter: [TUFTS(-20, 9, 8, 60), TUFTS(20, 9, 8, 60)],
      cast: [
        { side: FEN_, id: 'bog-toad', at: [-14, 3], lift: 1.2, face: 60, anim: 'leap', phase: 0.5 },
        ...cluster(FEN_, 'fenling', 40, -20, 1, 5, 70, 'charge', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [-17, -4], face: 60, anim: 'attack', phase: 0.45 },
        { side: MEADOW, id: 'hurlhorn', at: [-11, -5], face: 50, anim: 'attack', phase: 0.55 },
        ...cluster(MEADOW, 'lynx', 3, -11, 6, 2.4, 40, 'charge'),
        { side: WILD, id: 'whipweld', at: [13, 3.5], face: -70, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'charger', 40, 20, 1, 5, -80, 'charge', 'attack'),
        { side: WILD, id: 'dragon-fly', at: [17, -6], lift: 5, face: -90, anim: 'fly', phase: 0.4 },
      ],
    }, FEN_HOME(-30, -16), WILD_HOME(30, -16), MEADOW_HOME(0, -40)),
  },
];

/** The three armies, each in its side's colours. */
function gameSides(): BandSide[] {
  const find = (id: string) => PLAYABLE.find((f) => f.id === id)!;
  return [
    { f: find('meadowfolk'), team: TEAM_COLORS[1], opts: meadowOpts as BandSide['opts'] },
    { f: find('fenfolk'), team: TEAM_COLORS[0], opts: fenOpts as BandSide['opts'] },
    { f: find('wildwelds'), team: TEAM_COLORS[2], opts: wildOpts as BandSide['opts'] },
  ];
}

/** ?mode=sprites&game=<n>[&wide=1]: draw picture n (from 1). */
export function runGameBand(params: URLSearchParams): void {
  const band = GAME_BANDS[+(params.get('game') ?? 1) - 1];
  if (!band) { document.title = 'sprites ready: none'; return; }
  const sides = gameSides();
  const wide = !!params.get('wide');
  const w = band.wide, staging = !wide ? band.staging : w && 'cast' in w ? w : { ...band.staging, camera: w ?? band.staging.camera };
  const c = renderBand(sides, staging, wide ? 2480 : 960, 720);
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:20';
  document.body.appendChild(c);
  document.body.dataset.label = `new${band.top ? ` ★${band.top}` : ''}: ${band.name}`; // (for the review sheet)
  document.title = 'sprites ready';
}

// ── the front page's banner, staged (2480×720, drawn under the gold title: src/style.css .menu-hero) ──
// The title sits in the middle: x 28–72 %, y 30–75 % stays calm. The bottom fades to black from 35 % down, so the
// armies stand high (feet above about 60 %); a phone shows only the middle 60 % of the width, so something to see
// sits just above the title (a sun, fliers, a far castle). ?mode=sprites&banner=<n>; scripts/bands.mjs BANNERS=1.

/** Across the picture: `frac` of the way from the middle to the edge (−1 left, 1 right), `d` from the camera, at fov `fov`. */
const X = (frac: number, d: number, fov = 30) => frac * d * Math.tan(((fov / 2) * Math.PI) / 180) * (2480 / 720);
/** A camera at height `y`, `z` back, looking level-ish down −z: the horizon `hz` of the way down the picture. */
const BANNER_CAM = (y: number, z: number, hz = 0.62, fov = 30): BandStaging['camera'] => ({ from: [0, y, z], to: [0, y + 100 * (hz - 0.5) * 2 * Math.tan(((fov / 2) * Math.PI) / 180), z - 100], fov });

interface Banner { name: string; top?: number; staging: Staging }
export const BANNERS: Banner[] = [
  // 1. the sunset valley: the sun going down in the dip between two hills, a soft gold glow behind the title; the
  //    Fenfolk and Meadowfolk on the left hill, the Wildwelds on the right, a heron and a Dragon Fly above them
  {
    name: 'sunset valley',
    top: 3,
    staging: join({
      ...DUSK(180, 1.5), sky: ['#2a2c48', '#ffb46a'], ridges: RIDGES('#3e3a40', '#5e5658', true),
      camera: BANNER_CAM(1.2, 16, 0.5),
      hills: [{ at: [X(-0.75, 18), -2], r: 11, h: 1.6 }, { at: [X(0.75, 18), -2], r: 11, h: 1.6 }],
      scatter: [TUFTS(X(-0.7, 16), 2, 8, 70), TUFTS(X(0.7, 16), 2, 8, 70)],
      props: LIFT([[X(-0.36, 20), -4, 5.5], [X(0.32, 22), -6, 6]]),
      cast: [
        { side: FEN_, id: 'great-siege-heron', at: [X(-0.86, 26), -10], face: 70, anim: 'attack', phase: 0.45 },
        { side: FEN_, id: 'bog-toad', at: [X(-0.58, 14), 2.5], lift: 1, face: 80, anim: 'leap', phase: 0.5 },
        ...cluster(FEN_, 'fenling', 30, X(-0.8, 16), 0, 4.5, 75, 'charge', 'attack'),
        { side: MEADOW, id: 'hurlhorn', at: [X(-0.62, 18), -2.5], face: 70, anim: 'attack', phase: 0.55 },
        { side: MEADOW, id: 'lynx', at: [X(-0.52, 16), 0.5], face: 75, anim: 'charge', phase: 0.3 },
        ...cluster(MEADOW, 'pikeman', 14, X(-0.65, 18), -3, 3, 75, 'charge'),
        { side: WILD, id: 'whipweld', at: [X(0.58, 15), 1.5], face: -80, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'flier', at: [X(0.7, 16), 1], face: -80 },
        ...cluster(WILD, 'charger', 30, X(0.8, 16), -0.5, 4.5, -80, 'charge', 'attack'),
        ...cluster(WILD, 'larva1', 12, X(0.72, 14), 2.5, 3, -80, 'walk'),
        { side: FEN_, id: 'great-siege-heron', at: [X(-0.42, 28), -12], lift: 5.5, face: 60, roll: 22, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'dragon-fly', at: [X(0.42, 28), -12], lift: 5.5, face: -70, anim: 'fly', phase: 0.5 },
      ],
    }),
  },
  // 2. dawn in the mist: a pale pink sunrise behind haze, the three armies drawn up on low rises as dark shapes,
  //    a line of herons and Vimmers crossing the top
  {
    name: 'dawn mist',
    staging: join({
      sun: { azimuth: 180, elevation: 3, disc: true, rays: true }, clouds: true, sky: ['#5d73a6', '#ffd4b4'], fogColor: '#e8c8b8', fog: [14, 70], exposure: 1.25,
      groundColors: ['#4a5638', '#56603e', '#5e6648'], ridges: RIDGES('#7a7088', '#9c90a0'),
      camera: BANNER_CAM(1, 15, 0.5),
      hills: [{ at: [X(-0.7, 15), 0], r: 9, h: 1.6 }, { at: [X(0.7, 15), 0], r: 9, h: 1.6 }, { at: [0, -14], r: 10, h: 1.4 }],
      cast: [
        { side: FEN_, id: 'great-siege-heron', at: [X(-0.72, 26), -11], face: 30 },
        ...cluster(FEN_, 'fenling', 24, X(-0.85, 15), 0, 4, 30, 'idle', 'attack'),
        { side: FEN_, id: 'bog-toad', at: [X(-0.55, 13), 2], face: 30 },
        ...cluster(MEADOW, 'pikeman', 18, X(-0.52, 20), -5, 3.5, 30, 'brace', 'idle'),
        { side: MEADOW, id: 'hurlhorn', at: [X(-0.5, 24), -9], face: 30 },
        { side: MEADOW, id: 'lynx', at: [X(0.5, 16), -1], face: -40 },
        { side: WILD, id: 'whipweld', at: [X(0.6, 14), 1.5], face: -40 },
        ...cluster(WILD, 'charger', 24, X(0.82, 15), 0, 4, -30, 'idle', 'attack'),
        ...cluster(WILD, 'larva2', 8, X(0.7, 13), 2.5, 2.5, -30, 'walk'),
        ...Array.from({ length: 7 }, (_, i) => ({ side: i % 2 ? WILD : FEN_, id: i % 2 ? 'flier' : 'great-siege-heron', at: [X(-0.6 + i * 0.2, 26), -10] as [number, number], lift: 5 + (i % 3) * 0.6, face: 90, anim: 'fly', phase: i * 0.13 })),
      ],
    }),
  },
  // 3. the storm breaks: black storm over the middle and right with lightning, gold light breaking in from the left
  //    on the Fenfolk and Meadowfolk; the Wildwelds swarm on the right under the storm, lit by the bolts
  {
    name: 'the storm breaks',
    top: 2,
    staging: join({
      sun: { azimuth: -100, elevation: 10 }, clouds: 'many', storm: 1, sky: ['#1f2433', '#d89a62'], lightning: [0.78, 0.6], ridges: RIDGES('#2c2c34', '#44444e', true),
      groundColors: ['#3c4628', '#4a5430', '#545c34'],
      camera: BANNER_CAM(1.1, 15, 0.5),
      lights: [{ at: [X(0.75, 15), -2], y: 6, color: '#b8c8ff', intensity: 160, reach: 22 }],
      props: LIFT([[X(-0.36, 18), -3, 5]]),
      scatter: [TUFTS(X(-0.75, 15), 1, 8, 60), TUFTS(X(0.75, 15), 1, 8, 60)],
      cast: [
        { side: FEN_, id: 'great-siege-heron', at: [X(-0.84, 26), -10], face: 75, anim: 'attack', phase: 0.45 },
        { side: FEN_, id: 'bog-toad', at: [X(-0.55, 13), 2], lift: 1.1, face: 80, anim: 'leap', phase: 0.45 },
        ...cluster(FEN_, 'fenling', 30, X(-0.85, 16), -1, 4.5, 80, 'charge', 'attack'),
        { side: MEADOW, id: 'hurlhorn', at: [X(-0.6, 18), -3.5], face: 75, anim: 'attack', phase: 0.55 },
        { side: MEADOW, id: 'lynx', at: [X(-0.5, 15), 0], face: 80, anim: 'charge', phase: 0.3 },
        ...cluster(MEADOW, 'pikeman', 12, X(-0.62, 18), -4.5, 3, 75, 'charge'),
        { side: WILD, id: 'whipweld', at: [X(0.56, 14), 1.5], face: -80, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'charger', 36, X(0.8, 15), -0.5, 5, -85, 'charge', 'attack'),
        ...Array.from({ length: 5 }, (_, i) => ({ side: WILD, id: 'flier', at: [X(0.45 + i * 0.12, 18), -3 - i] as [number, number], lift: 3.6 + i * 0.5, face: -100, pitch: 20 + i * 3, anim: 'fly', phase: i * 0.17 })),
      ],
    }),
  },
  // 4. crystal night: a moon over the middle, stars, the title over dark sky; the armies gathered at two glowing
  //    crystal deposits left and right, lit cyan from below
  {
    name: 'crystal night',
    top: 1,
    staging: join({
      sun: { azimuth: 178, elevation: 42, disc: true, moon: true }, clouds: true, stars: 260, sky: ['#070b1c', '#2a3658'], exposure: 0.95,
      groundColors: ['#1e2620', '#242c24', '#2a3028'], ridges: RIDGES('#121624', '#1c2236', true), glows: [{ x: 0.2, color: '#5fd0ff', r: 0.1 }, { x: 0.8, color: '#5fd0ff', r: 0.1 }],
      camera: BANNER_CAM(1.3, 15, 0.5),
      props: [prop((b) => mine(b, 1), [X(-0.62, 13), 1.5], 1.5), prop((b) => mine(b, 1), [X(0.62, 13), 1.5], 1.5)],
      lights: [{ at: [X(-0.62, 13), 1.5], y: 1.5, color: '#6fdcff', intensity: 90, reach: 14 }, { at: [X(0.62, 13), 1.5], y: 1.5, color: '#6fdcff', intensity: 90, reach: 14 }],
      cast: [
        { side: FEN_, id: 'great-siege-heron', at: [X(-0.82, 24), -9], face: 60 },
        ...cluster(FEN_, 'fenling', 22, X(-0.82, 14), 1, 4, 60, 'idle', 'attack'),
        { side: FEN_, id: 'bog-toad', at: [X(-0.5, 12), 2.5], face: 50, anim: 'attack', phase: 0.5 },
        { side: MEADOW, id: 'hurlhorn', at: [X(-0.66, 17), -2.5], face: 50 },
        ...cluster(MEADOW, 'pikeman', 10, X(-0.5, 15), -1, 2.4, 50, 'brace'),
        { side: MEADOW, id: 'lynx', at: [X(-0.45, 13), 1.5], face: 40 },
        { side: WILD, id: 'whipweld', at: [X(0.5, 13), 2], face: -60, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'charger', 24, X(0.8, 14), 0.5, 4, -60, 'idle', 'attack'),
        { side: WILD, id: 'flier', at: [X(0.7, 14), -1], lift: 3.5, face: -70, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'dragon-fly', at: [X(0.4, 26), -10], lift: 5.2, face: -100, anim: 'glide', phase: 0.2 },
      ],
    }),
  },
  // 5. the three homelands: one panorama in thirds, the fen left, the Great Hall far off at the top of the middle,
  //    the hive right, each army before its home; the title over the open field between
  {
    name: 'three homelands',
    staging: join({
      ...DUSK(-150, 12), ridges: RIDGES('#4c4c44', '#6c6a66', true),
      camera: { from: [0, 9, 26], to: [0, -14.4, -110], fov: 32 }, // (looking down: the horizon high, the Great Hall far off above the title)
      cast: [
        ...cluster(FEN_, 'fenling', 30, X(-0.62, 18, 32), 3, 4, 40, 'charge', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [X(-0.5, 18, 32), 4], face: 50, anim: 'attack', phase: 0.45 },
        { side: FEN_, id: 'bog-toad', at: [X(-0.42, 16, 32), 6], lift: 0.9, face: 60, anim: 'leap', phase: 0.5 },
        ...cluster(MEADOW, 'pikeman', 24, 0, -18, 4, 0, 'charge', 'walk'),
        { side: MEADOW, id: 'hurlhorn', at: [-3, -19], face: 0, anim: 'attack', phase: 0.5 },
        { side: MEADOW, id: 'lynx', at: [3, -16], face: 0, anim: 'charge', phase: 0.3 },
        ...cluster(WILD, 'charger', 30, X(0.62, 18, 32), 3, 4, -40, 'charge', 'attack'),
        { side: WILD, id: 'whipweld', at: [X(0.45, 16, 32), 6], face: -60, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'flier', at: [X(0.5, 18, 32), 2], lift: 4, face: -50, anim: 'fly', phase: 0.3 },
      ],
    }, FEN_HOME(X(-0.78, 30, 32), -8, 1.2), MEADOW_HOME(0, -30), WILD_HOME(X(0.78, 30, 32), -8, 1.2)),
  },
  // 6. a sky of wings: a huge evening sky full of herons, Dragon Flies and Vimmers; the three armies a black frieze
  //    along a ridge, the sun's glow low behind them
  {
    name: 'a sky of wings',
    staging: join({
      ...DUSK(180, 2), sky: ['#232a48', '#ffb878'],
      camera: BANNER_CAM(0.4, 14, 0.56),
      hills: [{ at: [0, -6], r: 40, h: 2.2 }],
      cast: [
        ...cluster(FEN_, 'fenling', 30, X(-0.7, 20), -6, 6, 60, 'charge', 'attack'),
        { side: FEN_, id: 'bog-toad', at: [X(-0.5, 20), -5], lift: 1, face: 70, anim: 'leap', phase: 0.5 },
        ...cluster(MEADOW, 'pikeman', 22, X(-0.2, 20), -6, 5, 30, 'charge'),
        { side: MEADOW, id: 'hurlhorn', at: [X(-0.3, 20), -7], face: 40, anim: 'attack', phase: 0.55 },
        { side: MEADOW, id: 'lynx', at: [X(0.05, 20), -5.5], face: 60, anim: 'charge', phase: 0.3 },
        ...cluster(WILD, 'charger', 34, X(0.6, 20), -6, 6, -60, 'charge', 'attack'),
        { side: WILD, id: 'whipweld', at: [X(0.4, 20), -5], face: -80, anim: 'attack', phase: 0.45 },
        { side: FEN_, id: 'great-siege-heron', at: [X(-0.6, 22), -8], lift: 4.6, face: 60, roll: 26, anim: 'fly', phase: 0.3 },
        { side: FEN_, id: 'great-siege-heron', at: [X(-0.88, 30), -16], lift: 6.5, face: 75, roll: -15, anim: 'fly', phase: 0.6 },
        { side: WILD, id: 'dragon-fly', at: [X(0.6, 22), -8], lift: 4.6, face: -60, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'dragon-fly', at: [X(0.88, 30), -16], lift: 6.5, face: -80, anim: 'glide', phase: 0.2 },
        ...Array.from({ length: 9 }, (_, i) => ({ side: WILD, id: 'flier', at: [X(-0.5 + i * 0.12, 30), -16 - (i % 3) * 2] as [number, number], lift: 6.5 + ((i * 7) % 5) * 0.6, face: -90 - ((i * 29) % 40), pitch: (i * 11) % 25, anim: 'fly', phase: ((i * 3) % 7) / 7 })),
      ],
    }),
  },
  // 7. the heroes: a low line-up along the bottom third under a big sky, the Fenfolk's and Meadowfolk's stars on
  //    the left, the Wildwelds' on the right, all turned in; the sky between them open for the title
  {
    name: 'the heroes',
    staging: join({
      ...DUSK(-160, 9), ridges: RIDGES('#4a4a48', '#6c6a6a', true),
      camera: BANNER_CAM(0.9, 13, 0.52),
      scatter: [TUFTS(X(-0.7, 10), 2, 6, 60), TUFTS(X(0.7, 10), 2, 6, 60)],
      cast: [
        { side: FEN_, id: 'great-siege-heron', at: [X(-0.86, 22), -9], face: 60, anim: 'attack', phase: 0.45 },
        { side: FEN_, id: 'bog-toad', at: [X(-0.66, 10), 1.5], face: 70, anim: 'attack', phase: 0.5 },
        ...cluster(FEN_, 'fenling', 8, X(-0.75, 9), 2.5, 1.8, 60, 'attack', 'idle'),
        { side: MEADOW, id: 'hurlhorn', at: [X(-0.58, 17), -4], face: 60, anim: 'attack', phase: 0.55 },
        { side: MEADOW, id: 'lynx', at: [X(-0.48, 10), 1.2], face: 75, anim: 'attack', phase: 0.35 },
        ...cluster(MEADOW, 'pikeman', 6, X(-0.5, 12), -0.5, 1.6, 60, 'brace'),
        { side: WILD, id: 'whipweld', at: [X(0.55, 10), 1], face: -80, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'flier', at: [X(0.72, 11), 0], lift: 2.6, face: -70, anim: 'fly', phase: 0.3 },
        ...cluster(WILD, 'larva1', 6, X(0.66, 9), 2.5, 1.6, -60, 'walk'),
        ...cluster(WILD, 'larva3', 3, X(0.84, 11), 1, 1.4, -60, 'walk'),
        { side: WILD, id: 'dragon-fly', at: [X(0.86, 20), -7], face: -70, anim: 'idle' },
      ],
    }),
  },
  // 8. the map: a high oblique view like the game's, a far ridge and the Great Hall across the top, the three
  //    armies converging from the sides on a crystal deposit; the open field below for the title
  {
    name: 'the battle map',
    staging: join({
      ...DUSK(-120, 22), ridges: RIDGES('#4c5044', '#6e7068', true),
      camera: { from: [0, 14, 26], to: [0, 0, -8], fov: 30 },
      props: [],
      cast: [
        ...cluster(FEN_, 'fenling', 40, X(-0.6, 30), -4, 5, 80, 'charge', 'attack'),
        { side: FEN_, id: 'great-siege-heron', at: [X(-0.5, 30), -6], face: 80, anim: 'walk', phase: 0.3 },
        { side: FEN_, id: 'bog-toad', at: [X(-0.42, 30), -2], lift: 0.7, face: 80, anim: 'leap', phase: 0.5 },
        ...cluster(MEADOW, 'pikeman', 30, 0, -20, 4.5, 0, 'charge', 'walk'),
        { side: MEADOW, id: 'hurlhorn', at: [-3, -21], face: 0, anim: 'attack', phase: 0.5 },
        { side: MEADOW, id: 'lynx', at: [2.5, -17], face: 0, anim: 'charge', phase: 0.3 },
        ...cluster(WILD, 'charger', 40, X(0.6, 30), -4, 5, -80, 'charge', 'attack'),
        { side: WILD, id: 'whipweld', at: [X(0.44, 30), -3], face: -80, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'flier', at: [X(0.5, 30), -8], lift: 4, face: -80, anim: 'fly', phase: 0.3 },
      ],
    }, FEN_HOME(X(-0.8, 34), -10, 1.2), MEADOW_HOME(0, -46), WILD_HOME(X(0.8, 34), -10, 1.2)),
  },
  // 9. the glow: the sun just set behind the far ridge in the middle, the whole middle of the sky glowing gold
  //    behind the title; the armies dark against it on near rises, rimmed with light
  {
    name: 'the glow',
    top: 4,
    staging: join({
      sun: { azimuth: 180, elevation: 0.5 }, clouds: true, sky: ['#2a2848', '#ffc070'], ridges: [{ distance: 60, height: 6, color: '#2a2630', jag: 0.5 }, { distance: 95, height: 9, color: '#3e3640', jag: 0.4 }],
      groundColors: ['#2e3020', '#363a24', '#3a3c28'],
      camera: BANNER_CAM(0.8, 14, 0.52),
      hills: [{ at: [X(-0.72, 16), -2], r: 10, h: 1.4 }, { at: [X(0.72, 16), -2], r: 10, h: 1.4 }],
      cast: [
        { side: FEN_, id: 'great-siege-heron', at: [X(-0.8, 24), -9], face: 70 },
        ...cluster(FEN_, 'fenling', 22, X(-0.85, 14), 1, 4, 70, 'idle', 'attack'),
        { side: MEADOW, id: 'lynx', at: [X(-0.52, 13), 1], face: 75 },
        { side: MEADOW, id: 'hurlhorn', at: [X(-0.62, 16), -2], face: 70, anim: 'attack', phase: 0.55 },
        ...cluster(MEADOW, 'pikeman', 10, X(-0.6, 15), -1, 2.6, 75, 'brace'),
        { side: WILD, id: 'whipweld', at: [X(0.55, 13), 1], face: -80 },
        ...cluster(WILD, 'charger', 24, X(0.8, 14), 0, 4, -80, 'idle', 'attack'),
        { side: WILD, id: 'flier', at: [X(0.62, 14), -1], lift: 3.4, face: -80, anim: 'fly', phase: 0.3 },
        { side: FEN_, id: 'great-siege-heron', at: [X(-0.3, 30), -15], lift: 6.4, face: 80, anim: 'glide', phase: 0.2 },
        { side: WILD, id: 'dragon-fly', at: [X(0.3, 30), -15], lift: 6.6, face: -80, anim: 'glide', phase: 0.2 },
      ],
    }),
  },
  // 10. the dark heart: a low sun from the far left lighting the armies gold on the left and right edges, the middle
  //     a deep shadowed valley under heavy cloud, so the gold title pops against dark
  {
    name: 'the dark heart',
    staging: join({
      sun: { azimuth: -115, elevation: 7 }, clouds: 'many', sky: ['#14182a', '#6a4a40'], exposure: 1.1,
      groundColors: ['#2a3020', '#323a24', '#3a3e28'], ridges: [{ distance: 55, height: 7, color: '#141620', jag: 0.6 }, { distance: 90, height: 12, color: '#1e2230', jag: 0.7, peaks: true }],
      camera: BANNER_CAM(1.4, 14, 0.5),
      props: [prop((b) => meadowTree(b, 1), [X(-0.62, 30), -16], 1.6), prop((b) => meadowTree(b, 4), [X(0.62, 32), -18], 1.6)],
      cast: [
        { side: FEN_, id: 'great-siege-heron', at: [X(-0.84, 24), -9], face: 70, anim: 'attack', phase: 0.45 },
        { side: FEN_, id: 'bog-toad', at: [X(-0.62, 12), 2], lift: 1, face: 75, anim: 'leap', phase: 0.5 },
        ...cluster(FEN_, 'fenling', 24, X(-0.85, 14), 1, 4, 75, 'charge', 'attack'),
        { side: MEADOW, id: 'lynx', at: [X(-0.5, 13), 0.5], face: 75, anim: 'charge', phase: 0.3 },
        { side: MEADOW, id: 'hurlhorn', at: [X(-0.66, 17), -3], face: 70, anim: 'attack', phase: 0.55 },
        { side: WILD, id: 'whipweld', at: [X(0.55, 13), 1], face: -80, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'charger', 30, X(0.8, 14), 0, 4.5, -80, 'charge', 'attack'),
        { side: WILD, id: 'flier', at: [X(0.66, 14), -1], lift: 3.6, face: -100, pitch: 24, anim: 'fly', phase: 0.3 },
      ],
    }),
  },
  // 11. the V at sundown, as a banner: the arms of the V coming toward us down both sides, its point (the
  //     Meadowfolk before the Great Hall) far off under the setting sun above the title
  {
    name: 'the V at sundown',
    staging: join({
      ...DUSK(180, 5), ridges: RIDGES('#4a4640', '#6e6862', true),
      camera: BANNER_CAM(2, 16, 0.48),
      cast: [
        ...cluster(MEADOW, 'pikeman', 22, 0, -44, 5, 0, 'charge', 'walk'),
        { side: MEADOW, id: 'hurlhorn', at: [-4, -46], face: 0, anim: 'attack', phase: 0.55 },
        { side: MEADOW, id: 'lynx', at: [X(-0.42, 14), 1], face: 40, anim: 'charge', phase: 0.3 },
        { side: FEN_, id: 'great-siege-heron', at: [X(-0.78, 24), -9], face: 25, anim: 'attack', phase: 0.45 },
        { side: FEN_, id: 'bog-toad', at: [X(-0.55, 12), 2], lift: 1, face: 30, anim: 'leap', phase: 0.45 },
        ...cluster(FEN_, 'fenling', 30, X(-0.62, 18), -4, 4.5, 25, 'charge', 'attack'),
        { side: WILD, id: 'whipweld', at: [X(0.58, 12), 2], face: -40, anim: 'attack', phase: 0.45 },
        { side: WILD, id: 'flier', at: [X(0.72, 14), 0], lift: 3.6, face: -110, pitch: 24, anim: 'fly', phase: 0.3 },
        ...cluster(WILD, 'charger', 30, X(0.62, 18), -4, 4.5, -25, 'charge', 'attack'),
      ],
    }, FEN_HOME(X(-0.85, 30), -14), MEADOW_HOME(0, -60, 1.3), WILD_HOME(X(0.85, 30), -14)),
  },
  // 12. the clash in the air: crystals and fliers meeting over the middle, high above the title; on the ground the
  //     Fenfolk and Meadowfolk charge in from the left, the Wildwelds from the right
  {
    name: 'the clash in the air',
    staging: join({
      ...DUSK(-170, 6), ridges: RIDGES('#46423e', '#66605c', true),
      camera: BANNER_CAM(0.9, 14, 0.52),
      props: LIFT([[-2, -6, 5.2], [1, -8, 6], [-4, -10, 6.6], [3.5, -7, 5]]),
      scatter: [TUFTS(X(-0.72, 14), 1, 8, 60), TUFTS(X(0.72, 14), 1, 8, 60)],
      cast: [
        { side: FEN_, id: 'great-siege-heron', at: [X(-0.3, 26), -12], lift: 6.6, face: 75, roll: 25, anim: 'fly', phase: 0.3 },
        { side: WILD, id: 'dragon-fly', at: [X(0.3, 26), -12], lift: 6.6, face: -75, anim: 'fly', phase: 0.4 },
        { side: WILD, id: 'flier', at: [X(0.05, 30), -16], lift: 8, face: -110, pitch: 30, anim: 'fly', phase: 0.2 },
        { side: FEN_, id: 'bog-toad', at: [X(-0.55, 12), 2], lift: 1.1, face: 80, anim: 'leap', phase: 0.5 },
        ...cluster(FEN_, 'fenling', 30, X(-0.82, 15), 0, 4.5, 80, 'charge', 'attack'),
        { side: MEADOW, id: 'lynx', at: [X(-0.5, 14), 0], face: 80, anim: 'charge', phase: 0.3 },
        { side: MEADOW, id: 'hurlhorn', at: [X(-0.66, 18), -3], face: 75, anim: 'attack', phase: 0.55 },
        ...cluster(MEADOW, 'pikeman', 12, X(-0.62, 18), -4, 3, 75, 'charge'),
        { side: WILD, id: 'whipweld', at: [X(0.55, 13), 1], face: -80, anim: 'attack', phase: 0.45 },
        ...cluster(WILD, 'charger', 34, X(0.8, 15), 0, 4.5, -80, 'charge', 'attack'),
      ],
    }),
  },
];

/** ?mode=sprites&banner=<n>: draw banner n (from 1), 2480×720. */
export function runBanner(params: URLSearchParams): void {
  const banner = BANNERS[+(params.get('banner') ?? 1) - 1];
  if (!banner) { document.title = 'sprites ready: none'; return; }
  const c = renderBand(gameSides(), banner.staging, 2480, 720);
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:20';
  document.body.appendChild(c);
  document.body.dataset.label = `${banner.top ? `★${banner.top} ` : ''}${banner.name}`;
  document.title = 'sprites ready';
}
