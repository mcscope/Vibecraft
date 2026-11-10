// The Meadowfolk's pictures for the front page (BandCandidate): the approved line-up first, then four staged in 3D.
import { bandCrowd as crowd, bandRank as rank, type BandCandidate } from '../types';
import { bush, flowers, grassClump, tree } from '../../biomes/meadow/models';
import type { ModelBuilder } from '../../kits/bake3d/types';

export const bands: BandCandidate[] = [
  // 1. one of each fighter lined up like a band, the biggest at the back (the automatic line-up)
  'line-up',
  // 2. the army drawn up before the Town Center: pikes braced in front, maces and slings behind, lancers on the
  //    wings, Hurlhorns at the back
  {
    camera: { from: [0, 1.6, 7.5], to: [0, 1.5, -3], fov: 48 },
    cast: [
      { id: 'town-center', at: [0, -13], face: 0 },
      { id: 'hurlhorn', at: [-4, -6], face: 20 },
      { id: 'hurlhorn', at: [4.5, -6.5], face: -20, anim: 'attack', phase: 0.5 },
      { id: 'lynx', at: [-5.6, -0.5], face: 35 },
      { id: 'lynx', at: [5.8, -1], face: -35, anim: 'attack', phase: 0.5 },
      ...rank('slinger', 7, 1.3, -3.5, { alt: 'attack' }),
      ...rank('maceman', 6, 1.4, -1.5, { alt: 'attack' }),
      ...rank('pikeman', 7, 1.25, 0.5, { anim: 'brace' }),
    ],
  },
  // 3. the lancers' charge: lynx riders bounding straight at us, lances down, the foot running behind
  {
    sky: ['#3b4560', '#f2c88e'],
    camera: { from: [0, 0.6, 6.5], to: [0, 1.5, -3], fov: 52 },
    cast: [
      { id: 'barracks', at: [-9, -16], face: 20 },
      { id: 'lynx-den', at: [8, -15], face: -20 },
      { id: 'lynx', at: [0, 2], face: 0, anim: 'charge', phase: 0.3 },
      { id: 'lynx', at: [-2.6, -0.5], face: 8, anim: 'charge', phase: 0.6 },
      { id: 'lynx', at: [2.8, -1], face: -8, anim: 'charge', phase: 0.1 },
      { id: 'lynx', at: [-5, -2.5], face: 12, anim: 'charge', phase: 0.8 },
      { id: 'lynx', at: [5.2, -3], face: -12, anim: 'charge', phase: 0.45 },
      ...rank('maceman', 6, 1.5, -6, { anim: 'charge', turn: 0 }),
      ...rank('pikeman', 7, 1.4, -7.5, { anim: 'charge', turn: 0 }),
    ],
  },
  // 4. the siege line from the side: Hurlhorns mid-throw, slingers loosing, a watchtower behind, the sky going red
  {
    sky: ['#2c2c44', '#ec9a62'],
    camera: { from: [-6, 1.1, 4.5], to: [0.5, 1.7, -1.5], fov: 50 },
    cast: [
      { id: 'watchtower', at: [-2, -8], face: 0 },
      { id: 'forge', at: [6, -10], face: -30 },
      { id: 'hurlhorn', at: [-2.5, -1], face: 55, anim: 'attack', phase: 0.45 },
      { id: 'hurlhorn', at: [2.5, -3.5], face: 55, anim: 'attack', phase: 0.7 },
      ...rank('slinger', 5, 1.4, 1.5, { x: 1, face: 55, turn: 0, anim: 'attack', alt: 'idle' }),
      ...rank('maceman', 3, 1.6, 3, { x: 2, face: 55, turn: 0 }),
    ],
  },
  // 5. the village from the hill: the Great Hall and its houses, villagers and mule carts at work, the army mustered
  {
    camera: { from: [0, 9, 22], to: [0, 0.5, -5], fov: 40 },
    cast: [
      { id: 'great-hall', at: [0, -15], face: 0 },
      { id: 'town-center', at: [-12, -12], face: 25 },
      { id: 'barracks', at: [11, -11], face: -25 },
      { id: 'gathering-camp', at: [-13, -2], face: 30 },
      { id: 'watchtower', at: [12, -2], face: -20 },
      { id: 'mule', at: [-8, -4], face: 70, anim: 'walk', phase: 0.3 },
      { id: 'mule', at: [7, -6], face: -100, anim: 'walk', phase: 0.6 },
      { id: 'villager', at: [-11, 0], face: 40, anim: 'gather', phase: 0.3 },
      { id: 'villager', at: [-9.5, 1], face: -20, anim: 'gather', phase: 0.7 },
      { id: 'villager', at: [9, 1], face: -60, anim: 'walk', phase: 0.5 },
      { id: 'hurlhorn', at: [-3, -6], face: 10 },
      { id: 'hurlhorn', at: [3, -6.5], face: -10 },
      ...rank('lynx', 4, 2.2, -3),
      ...rank('maceman', 8, 1.3, -0.5),
      ...rank('pikeman', 9, 1.2, 1.2),
      ...rank('slinger', 9, 1.2, 2.8),
    ],
  },
  // 6. (maximal) the march home: rolling farmland under a big evening sky, the Great Hall on its hill with
  //    watchtowers and banners, berry fields in rows, the army marching out in long columns, Hurlhorns loosing over
  //    them, lancers wheeling in front. RULES: the lancer wheeling in front is the focal point; the columns are leading
  //    lines back to the Great Hall; a low sun from the right throws long shadows across the fields.
  {
    name: 'new ★1: the march out',
    sky: ['#2e4266', '#f4cf96'], sun: { azimuth: 120, elevation: 10, disc: true, rays: true }, clouds: 'many',
    groundColors: ['#4f5f2c', '#62723a', '#74823e', '#6b6a3a', '#7a6640'],
    ridges: [{ distance: 75, height: 5, color: '#55604a', jag: 0.3 }, { distance: 115, height: 9, color: '#7a8088', jag: 0.5, peaks: true }],
    camera: { from: [-2, 1.15, 13], to: [0, 2.6, -4], fov: 56 },
    hills: [{ at: [0, -24], r: 12, h: 3.5 }, { at: [-16, -10], r: 9, h: 1.6 }, { at: [16, -12], r: 10, h: 2 }, { at: [0, 16], r: 6, h: 0.6 }],
    props: [
      ...Array.from({ length: 48 }, (_, i) => ({ model: (b: ModelBuilder) => bush(b, 1), at: [-18 + (i % 12) * 1.4, -4 - Math.floor(i / 12) * 1.8] as [number, number], scale: 0.9 })),
      ...Array.from({ length: 36 }, (_, i) => ({ model: (b: ModelBuilder) => bush(b, 1), at: [8 + (i % 9) * 1.4, -6 - Math.floor(i / 9) * 1.8] as [number, number], scale: 0.9 })),
      ...[[-20, -18], [20, -20], [-9, -30], [10, -31], [-24, -6], [24, -4], [-4, -36], [5, -37]].map(([x, z], i) => ({ model: (b: ModelBuilder) => tree(b, i * 3 + 1), at: [x, z] as [number, number], face: i * 50, scale: 1.25 })),
    ],
    scatter: [{ models: [0, 1, 2, 3].map((v) => (b: ModelBuilder) => grassClump(b, v)).concat([0, 1, 2, 3].map((v) => (b: ModelBuilder) => flowers(b, v))), n: 90, at: [0, 6], r: 9, scale: [0.9, 1.5] }],
    cast: [
      { id: 'great-hall', at: [0, -26] }, { id: 'watchtower', at: [-8, -21], face: 20 }, { id: 'watchtower', at: [8.5, -22], face: -20 },
      { id: 'town-center', at: [-16, -14], face: 30 }, { id: 'barracks', at: [16, -16], face: -30 }, { id: 'lynx-den', at: [-24, -18], face: 30 }, { id: 'forge', at: [23, -24], face: -30 },
      { id: 'lynx', at: [1.6, 6.6], face: -80, anim: 'charge', phase: 0.35 },
      { id: 'lynx', at: [-2.6, 4.4], face: -76, anim: 'charge', phase: 0.7 },
      { id: 'hurlhorn', at: [-5, -3], face: -10, anim: 'attack', phase: 0.55 },
      { id: 'hurlhorn', at: [5.5, -5], face: 15, anim: 'attack', phase: 0.3 },
      ...crowd('pikeman', 40, -1, -4, 5, 0, 'walk'),
      ...crowd('maceman', 20, -6, -9, 3.5, 10, 'walk'),
      ...crowd('slinger', 24, 6, -10, 3.5, -10, 'attack', 'walk'),
      ...crowd('villager', 8, -12, -8, 3, 30, 'gather'),
      { id: 'mule', at: [-9, -13], face: 70, anim: 'walk', phase: 0.3 },
    ],
  },
];

/** The one on the card. */
export const pick = 6;
