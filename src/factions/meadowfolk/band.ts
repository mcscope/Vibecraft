// The Meadowfolk's pictures for the front page (BandCandidate): the approved line-up first, then four staged in 3D.
import { bandRank as rank, type BandCandidate } from '../types';

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
];

/** The one on the card. */
export const pick = 1;
