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
import { mine, stones, tree as meadowTree } from '../biomes/meadow/models';
import { renderBand, type BandSide } from './bandScene';

const MEADOW = 0, FEN_ = 1, WILD = 2;
type Cast = Array<BandStaging['cast'][number] & { side: number }>;
interface GameBand { name: string; staging: BandStaging & { cast: Cast }; wide?: BandStaging['camera'] }
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
];

/** ?mode=sprites&game=<n>[&wide=1]: draw picture n (from 1). */
export function runGameBand(params: URLSearchParams): void {
  const band = GAME_BANDS[+(params.get('game') ?? 1) - 1];
  if (!band) { document.title = 'sprites ready: none'; return; }
  const find = (id: string) => PLAYABLE.find((f) => f.id === id)!;
  const sides: BandSide[] = [
    { f: find('meadowfolk'), team: TEAM_COLORS[1], opts: meadowOpts as BandSide['opts'] },
    { f: find('fenfolk'), team: TEAM_COLORS[0], opts: fenOpts as BandSide['opts'] },
    { f: find('wildwelds'), team: TEAM_COLORS[2], opts: wildOpts as BandSide['opts'] },
  ];
  const wide = !!params.get('wide');
  const c = renderBand(sides, wide ? { ...band.staging, camera: band.wide ?? band.staging.camera } : band.staging, wide ? 2480 : 960, wide ? 720 : 720);
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:20';
  document.body.appendChild(c);
  document.body.dataset.label = `new: ${band.name}`; // (for the review sheet)
  document.title = 'sprites ready';
}
