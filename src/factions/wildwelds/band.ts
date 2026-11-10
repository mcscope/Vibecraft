// The Wildwelds' pictures for the front page (BandCandidate): their life cycle and their swarm, staged in 3D. A bright
// sky behind, so their strange bodies stand out against it.
import { bandCrowd as crowd, bandRank as rank, type BandCandidate, type BandStaging } from '../types';
import { fern, grassClump, stones, tree } from '../../biomes/meadow/models';
import type { ModelBuilder } from '../../kits/bake3d/types';

const SKY: [string, string] = ['#4f7298', '#f3e3bd'];
type Cast = BandStaging['cast'];
type Props = NonNullable<BandStaging['props']>;
/** Light and warm behind them: their dark glossy bodies stand out against it (a dusk-blue sky swallows them). */
const BRIGHT: [string, string] = ['#8ea8c2', '#f7e8c8'];
/** Scenery from the meadow they live in: trees far off, ferns, grass and stones nearer. */
const trees = (spots: Array<[number, number]>, scale = 1): Props => spots.map((at, i) => ({ model: (b: ModelBuilder) => tree(b, i * 5 + 2), at, face: i * 50, scale }));
const ground = (spots: Array<[number, number]>): Props => spots.map((at, i) => ({ model: (b: ModelBuilder) => [fern, grassClump, stones][i % 3](b, i), at, face: i * 40, scale: 1.4 }));
/** `n` along a gentle curve from `a` to `b`: a line the eye follows. */
const along = (id: string, n: number, a: [number, number], b: [number, number], bend: number, anims: string[]): Cast => Array.from({ length: n }, (_, i) => {
  const t = n > 1 ? i / (n - 1) : 0, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * bend;
  return { id, at: [x, z], face: (i * 47) % 360, anim: anims[i % anims.length], phase: 0.3 + ((i * 3) % 5) / 10 };
});
/** A ring of `n` around (x, z), `r` across, each facing out from the middle. */
const ring = (id: string, n: number, r: number, x: number, z: number, anim = 'walk', turn = 0): Cast => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2 + turn;
  return { id, at: [x + Math.cos(a) * r, z + Math.sin(a) * r * 0.8], face: (Math.atan2(Math.cos(a), Math.sin(a)) * 180) / Math.PI + 90, anim, phase: (i % 4) / 4 };
});

export const bands: BandCandidate[] = [
  // 1. the life cycle, left to right: the mother and her larvae, eggs and a cocoon, fighters hatching, the big ones out
  //    in front, fliers overhead
  {
    sky: SKY,
    camera: { from: [0, 1.9, 9.6], to: [0, 1.3, -1], fov: 50 },
    cast: [
      { id: 'mother3', at: [-4.2, -2.5], face: 40, anim: 'lay', phase: 0.5 },
      ...ring('larva1', 4, 1.7, -4, -0.6, 'walk', 0.4),
      ...ring('larva2', 2, 2.4, -4.4, -1, 'walk', 1.2),
      { id: 'egg1', at: [-2, 1], anim: 'grow', phase: 0.3 },
      { id: 'egg2', at: [-1.3, 1.6], anim: 'grow', phase: 0.6 },
      { id: 'egg3', at: [-2.4, 2], anim: 'hungry', phase: 0.2 },
      { id: 'cocoon', at: [-1.2, -0.3], anim: 'grow', phase: 0.5 },
      { id: 'egg2', at: [-0.2, 1.3], anim: 'hatch', phase: 0.7 },
      { id: 'charger', at: [0.5, 2], face: 20, anim: 'rise', phase: 0.6 },
      { id: 'charger', at: [0.1, 2.8], face: -10 },
      { id: 'micropike', at: [1.2, -0.4], face: -20 },
      { id: 'slinger', at: [2.2, 0.8], face: -40, anim: 'attack', phase: 0.5 },
      { id: 'whipweld', at: [3.4, -3], face: -30 },
      { id: 'ground-attacker3', at: [4.3, 0.3], face: -40 },
      { id: 'flier', at: [2.8, 2.7], face: -20 },
      { id: 'dragon-fly', at: [-1.5, -4], lift: 3.6, face: 60, anim: 'fly', phase: 0.3 },
      { id: 'flier', at: [3, -3], lift: 3.4, face: -70, anim: 'fly', phase: 0.6 },
      { id: 'flier', at: [0.6, -6], lift: 4.6, face: -100, anim: 'fly', phase: 0.1 },
    ],
  },
  // 2. the life cycle, back to front, from low down: the mother at the back among her larvae, eggs and cocoons, young
  //    fighters, the Goliath Charger and a Vimmer right in front, dragon flies over it all
  {
    sky: SKY,
    camera: { from: [0, 1.0, 9], to: [0, 1.2, -3], fov: 50 },
    cast: [
      { id: 'mother3', at: [0, -5], face: 0, anim: 'lay', phase: 0.4 },
      ...ring('larva1', 5, 2.4, 0, -3.8, 'walk'),
      ...ring('larva3', 2, 3.5, 0, -4.2, 'walk', 0.3),
      ...rank('egg1', 5, 0.9, -2.8, { anim: 'grow', alt: 'hungry' }),
      { id: 'cocoon', at: [-2.6, -3], anim: 'grow', phase: 0.3 },
      { id: 'cocoon', at: [2.7, -3.2], anim: 'grow', phase: 0.7 },
      ...rank('egg2', 3, 1.5, -1.6, { anim: 'hatch', phase: 0.6 }),
      ...rank('charger', 4, 1, -0.8, { anim: 'rise', alt: 'idle', phase: 0.5 }),
      { id: 'micropike', at: [-2.8, 0.1], face: 30 },
      { id: 'slinger', at: [2.8, -0.2], face: -30, anim: 'attack', phase: 0.5 },
      { id: 'ground-attacker3', at: [-3.4, 1.4], face: 30 },
      { id: 'flier', at: [2.8, 2], face: -30 },
      { id: 'dragon-fly', at: [-3, -5], lift: 3.6, face: 50, anim: 'fly', phase: 0.2 },
      { id: 'dragon-fly', at: [3.5, -6], lift: 4.6, face: -60, anim: 'fly', phase: 0.6 },
    ],
  },
  // 3. the swarm attacks: chargers and micropikes pouring at us, the Goliath mid-bound, Vimmers diving
  {
    sky: ['#3d4f6e', '#f0c98a'],
    camera: { from: [0, 0.9, 6], to: [0, 1.3, -2], fov: 58 },
    cast: [
      { id: 'ground-attacker3', at: [0, -4], lift: 0.3, face: 0, anim: 'slam', phase: 0.5 },
      ...rank('charger', 7, 0.8, 2.6, { anim: 'charge', alt: 'attack', turn: 0 }),
      ...rank('charger', 6, 0.85, 1.3, { anim: 'charge', turn: 0, phase: 0.2 }),
      ...rank('micropike', 4, 1.7, -0.4, { anim: 'charge', alt: 'attack', turn: 0 }),
      { id: 'whipweld', at: [-3, -2], face: 20, anim: 'attack', phase: 0.5 },
      { id: 'slinger', at: [3.2, -2.2], face: -20, anim: 'attack', phase: 0.5 },
      { id: 'flier', at: [-2.5, -3.5], lift: 2.4, face: 30, anim: 'glide', phase: 0.3 },
      { id: 'flier', at: [3, -4], lift: 3.2, face: -30, anim: 'swoop', phase: 0.3 },
      { id: 'dragon-fly', at: [0.5, -8], lift: 3.2, face: 0, anim: 'fly', phase: 0.5 },
    ],
  },
  // 4. the mother's portrait: the great mother laying, eggs hatching at her feet, a mimic mine and web walls behind
  {
    sky: SKY,
    camera: { from: [0.6, 0.8, 5], to: [0, 1.15, -1.5], fov: 50 },
    cast: [
      { id: 'web-tower', at: [-3.5, -6], face: 20 },
      { id: 'web-wall', at: [1.5, -6.5], face: 0 },
      { id: 'web-wall', at: [3.5, -6.5], face: 0 },
      { id: 'web-wall', at: [5.5, -6.5], face: 0 },
      { id: 'mother3', at: [0, -2], face: 10, anim: 'lay', phase: 0.6 },
      { id: 'egg3', at: [-1.4, 0.2], anim: 'hatch', phase: 0.6 },
      { id: 'egg1', at: [-0.6, 0.8], anim: 'grow', phase: 0.4 },
      { id: 'egg2', at: [1, 0.4], anim: 'hungry' },
      { id: 'larva2', at: [2, 1], face: -40, anim: 'walk', phase: 0.3 },
      { id: 'larva1', at: [-2.2, 1.2], face: 30, anim: 'walk', phase: 0.6 },
      { id: 'charger', at: [0.3, 1.6], face: -10, anim: 'rise', phase: 0.4 },
    ],
  },
  // 5. the sky full of them: dragon flies and Vimmers against a bright sky, the swarm small on the ground below
  {
    sky: ['#3f6b9a', '#f7ebcf'],
    camera: { from: [0, 0.4, 6], to: [0, 3.6, -4], fov: 60 },
    cast: [
      { id: 'dragon-fly', at: [-1.8, -2.5], lift: 4, face: 40, anim: 'fly', phase: 0.3 },
      { id: 'dragon-fly', at: [2.5, -5.5], lift: 6, face: -40, anim: 'fly', phase: 0.7 },
      { id: 'dragon-fly', at: [-5, -8], lift: 7.5, face: 70, anim: 'glide', phase: 0.2 },
      { id: 'flier', at: [1.2, -1.2], lift: 2.6, face: -60, anim: 'fly', phase: 0.5 },
      { id: 'flier', at: [-3, -4], lift: 3, face: 60, anim: 'soar', phase: 0.1 },
      { id: 'flier', at: [3.8, -3], lift: 4.2, face: -100, anim: 'fly', phase: 0.8 },
      { id: 'ground-attacker3', at: [-1.2, -1.2], face: 15 },
      { id: 'mother2', at: [2, -2.4], face: -20 },
      ...rank('charger', 6, 0.9, 0.6, { alt: 'attack' }),
      ...rank('micropike', 3, 1.5, -0.6),
    ],
  },
  // 6. (new) the brood mother. RULE: one focal subject on a third: the great mother on the right third, the
  //    biggest and best lit, seen from low against a plain bright sky. A LEADING LINE of eggs curves from the near
  //    left corner to her feet, larvae crawling along it. Three layers: eggs near, mother middle, web walls, a Mimic
  //    Mine and trees far. Empty sky on the left, left on purpose; one dragon fly small and far for depth.
  {
    name: 'new: the brood mother',
    sky: BRIGHT,
    camera: { from: [0, 0.9, 7], to: [0.6, 0.85, -2], fov: 44 },
    props: [...trees([[-12, -20], [10, -22], [16, -16]], 1.1), ...ground([[-4.5, 3.5], [4.8, 4.2], [-6, -1], [6.5, 0.5]])],
    cast: [
      { id: 'mother3', at: [2.2, 0], face: -50, anim: 'lay', phase: 0.55 },
      ...along('egg1', 6, [-2.8, 3.8], [0.9, 1.4], 0.6, ['grow', 'hungry', 'grow', 'hatch']),
      { id: 'cocoon', at: [-0.9, 1.2], anim: 'grow', phase: 0.4 },
      { id: 'larva1', at: [-1.7, 3.3], face: -40, anim: 'walk', phase: 0.2 },
      { id: 'larva1', at: [0, 2.2], face: -60, anim: 'walk', phase: 0.6 },
      { id: 'web-wall', at: [-4, -10], face: 10 },
      { id: 'web-wall', at: [-2, -10.4], face: 10 },
      { id: 'web-tower', at: [-7.5, -12], face: 30 },
      { id: 'dragon-fly', at: [-4, -16], lift: 5, face: 60, anim: 'glide', phase: 0.2 },
    ],
  },
  // 7. (new) the Goliath's bound. RULE: the subject's direction of travel is the leading line: the Goliath Charger
  //    mid-bound on the left third, side on so its long banded body reads, heading right; a SUPPORTING MASS of
  //    chargers runs the same way behind it, small and many, so it reads as one body leading the swarm. Low camera:
  //    it stands against the sky. Room ahead of it on the right, where it is going; a Vimmer up on the right third.
  {
    name: 'new: the Goliath\'s bound',
    sky: BRIGHT,
    camera: { from: [1.2, 0.8, 11], to: [0.6, 0.95, -2], fov: 44 },
    hills: [{ at: [-6, -14], r: 10, h: 2.5 }],
    props: [...trees([[-9, -16], [-4, -19], [9, -20]], 1.2), ...ground([[5, -4], [-5.5, 3], [7, -6]])],
    cast: [
      { id: 'ground-attacker3', at: [-2.2, -0.6], lift: 0.25, face: 70, anim: 'walk', phase: 0.25 },
      ...rank('charger', 6, 0.9, -1.8, { x: -4.6, anim: 'charge', alt: 'attack', face: 70, turn: 0 }),
      ...rank('charger', 5, 1, -3.4, { x: -5.6, anim: 'charge', face: 70, turn: 0, phase: 0.2 }),
      ...rank('micropike', 3, 1.7, -5.2, { x: -6.5, anim: 'charge', face: 70, turn: 0 }),
      { id: 'flier', at: [4.2, -6], lift: 3.6, face: 75, anim: 'glide', phase: 0.3 },
    ],
  },
  // 8. (new) the life cycle, read left to right, few subjects: RULE: three to five bodies that matter, each with its
  //    own space and a clean silhouette (never body on body): the mother at the back left with her larvae, a
  //    cocoon and eggs close in the foreground centre (near, so they read big), then a Vimmer and the Goliath out to
  //    the right, a dragon fly in the sky above them. The eye travels mother, eggs, fighters, flier.
  {
    name: 'new: the life cycle',
    sky: BRIGHT,
    camera: { from: [0, 0.8, 8.5], to: [0.3, 0.75, -2], fov: 46 },
    props: [...trees([[-14, -18], [12, -20]], 1.1), ...ground([[-6.5, -1], [6, -5], [-2, -7]])],
    cast: [
      { id: 'mother3', at: [-3.6, -4.5], face: 30, anim: 'lay', phase: 0.5 },
      { id: 'larva1', at: [-2.4, -2.6], face: -10, anim: 'walk', phase: 0.3 },
      { id: 'larva1', at: [-4.6, -2.2], face: 20, anim: 'walk', phase: 0.7 },
      { id: 'cocoon', at: [-0.8, 2.6], anim: 'grow', phase: 0.5 },
      { id: 'egg3', at: [0.2, 3.3], anim: 'hatch', phase: 0.65 },
      { id: 'egg2', at: [-1.8, 3.4], anim: 'grow', phase: 0.3 },
      { id: 'flier', at: [1.8, -0.5], face: -30 },
      { id: 'ground-attacker3', at: [4, -2.5], face: -75, anim: 'slam', phase: 0.3 },
      { id: 'dragon-fly', at: [2.2, -7], lift: 3.6, face: -50, anim: 'fly', phase: 0.3 },
    ],
  },
  // 9. (new) sky hunters. RULE: simple silhouettes against a plain, lighter area: the Dragon Fly large on the upper
  //    left third against open sky, two Vimmers smaller and further (size falling off with distance), the swarm a
  //    dark low band on the horizon, a Mimic Mine at its end. Low camera tilted up; the right of the sky left empty.
  {
    name: 'new: sky hunters',
    sky: ['#7d9cbf', '#f8ecd2'],
    camera: { from: [0, 0.4, 6], to: [0, 2.6, -4], fov: 54 },
    props: trees([[10, -18], [-14, -22]], 1.2),
    cast: [
      { id: 'dragon-fly', at: [-1.8, -0.5], lift: 2.3, face: 35, anim: 'fly', phase: 0.3 },
      { id: 'flier', at: [2.2, -5], lift: 4, face: 50, anim: 'glide', phase: 0.3 },
      { id: 'flier', at: [4.5, -10], lift: 5, face: 40, anim: 'fly', phase: 0.7 },
      ...rank('micropike', 5, 1.8, -7, { x: 2, face: 40, turn: 0, anim: 'walk', alt: 'idle' }),
      ...rank('charger', 7, 1.1, -6, { x: 1, face: 40, turn: 0, anim: 'charge' }),
      { id: 'whipweld', at: [6, -8.5], face: 30 },
      { id: 'web-tower', at: [10, -11], face: -20 },
    ],
  },
  // 10. (maximal) the hive under the storm: the brood mothers among arcs of web walls and Mimic Mines, cocoons and
  //     eggs hatching in drifts, a carpet of larvae and chargers spilling out at us, the sky full of dragon flies and
  //     Vimmers against a storm lit gold underneath. RULES: the great mother on the left third is the focal point; the
  //     swarm pouring out toward us is the leading line from her; fliers fill the sky's top band, silhouetted.
  {
    name: 'new ★1: the hive under the storm',
    sky: ['#2e3346', '#f1c48a'], sun: { azimuth: -160, elevation: 7, disc: true, rays: true }, clouds: 'many', storm: 1,
    groundColors: ['#4a522c', '#5a6432', '#686e3a', '#5a5636', '#6a5a3c'],
    ridges: [{ distance: 70, height: 4.5, color: '#4a4a44', jag: 0.7 }, { distance: 110, height: 10, color: '#6a6870', jag: 0.8, peaks: true }],
    camera: { from: [1, 1.6, 11], to: [0.4, 2.9, -3], fov: 48 },
    props: [...trees([[-14, -16], [-8, -20], [12, -18], [17, -12], [3, -24]], 1.3), ...ground([[-6, 6], [6, 6.5], [-9, 2], [9, 1]])],
    cast: [
      { id: 'mother3', at: [-3.6, -1.5], face: 30, anim: 'lay', phase: 0.55 },
      { id: 'mother3', at: [6, -9], face: -30, anim: 'lay', phase: 0.3 },
      { id: 'mother2', at: [-9, -7], face: 30 },
      { id: 'web-tower', at: [-7, -14], face: 20 }, { id: 'web-tower', at: [9, -16], face: -30 }, { id: 'web-tower', at: [0, -20] },
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: 'web-wall', at: [-8 + i * 2, -11 - Math.abs(i - 3.5) * 0.8] as [number, number], face: (i - 3.5) * 10 })),
      ...crowd('cocoon', 8, 2, -5, 3, 0, 'grow'),
      ...crowd('egg3', 10, -1, 1.5, 2.4, 0, 'hatch', 'grow'),
      ...crowd('egg1', 8, 4, 2, 2, 0, 'grow', 'hungry'),
      ...crowd('larva1', 20, 1, 4, 4.5, 10, 'walk'),
      ...crowd('larva2', 8, -6, 3, 3, 30, 'walk'),
      ...crowd('charger', 30, 5, -1, 5, -20, 'charge', 'attack'),
      { id: 'ground-attacker3', at: [6, -3], face: -70, anim: 'walk', phase: 0.25, lift: 0.2 },
      { id: 'whipweld', at: [8, -2], face: -80, anim: 'attack', phase: 0.45 },
      { id: 'dragon-fly', at: [-1.5, -4], lift: 4.4, face: 40, anim: 'fly', phase: 0.3 },
      { id: 'dragon-fly', at: [8, -12], lift: 8, face: -80, anim: 'fly', phase: 0.6 },
      { id: 'dragon-fly', at: [-10, -16], lift: 10, face: 70, anim: 'glide', phase: 0.2 },
      ...Array.from({ length: 9 }, (_, i) => ({ id: 'flier', at: [((i * 41) % 22) - 10, -6 - ((i * 23) % 14)] as [number, number], lift: 5 + ((i * 7) % 8), face: -60 - ((i * 47) % 120), pitch: (i * 13) % 30, anim: 'fly', phase: ((i * 3) % 7) / 7 })),
    ],
  },
];

/** The one on the card. */
export const pick = 10;
