// The Wildwelds' pictures for the front page (BandCandidate): their life cycle and their swarm, staged in 3D. A bright
// sky behind, so their strange bodies stand out against it.
import { bandRank as rank, type BandCandidate, type BandStaging } from '../types';

const SKY: [string, string] = ['#4f7298', '#f3e3bd'];
type Cast = BandStaging['cast'];
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
];

/** The one on the card. */
export const pick = 1;
