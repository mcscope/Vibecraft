// The Fenfolk's pictures for the front page (BandCandidate): five ways to show the fen's army, staged in 3D.
import { bandRank as rank, type BandCandidate } from '../types';
import { DOODADS, tree } from './homeworld';

export const bands: BandCandidate[] = [
  // 1. the whole army drawn up in ranks before the Stilt Hall, the Great Siege Heron towering at the back
  {
    camera: { from: [0, 2.2, 10.5], to: [0, 2.2, -4], fov: 44 },
    cast: [
      { id: 'stilt-hall', at: [-4.5, -14], face: 15 },
      { id: 'reed-hut', at: [-11, -9], face: 30 },
      { id: 'reed-hut', at: [9, -10], face: -30 },
      { id: 'great-siege-heron', at: [2.5, -6], face: -10 },
      { id: 'pack-tortoise', at: [-6.5, -4.5], face: 40 },
      { id: 'bog-toad', at: [6.5, -2], face: -40, anim: 'attack', phase: 0.5 },
      { id: 'bog-toad', at: [-6, 0], face: 35 },
      ...rank('reedguard', 8, 1.4, -1.5, { alt: 'attack' }),
      ...rank('fenling', 10, 1.15, 1.5, { alt: 'attack' }),
      ...rank('fenling', 7, 1.3, 3.8),
    ],
  },
  // 2. from the mud at their feet: the heron right over us, fenlings in a wedge before it, a reed hut behind
  {
    camera: { from: [0, 0.7, 8], to: [0, 2.7, -3], fov: 56 },
    cast: [
      { id: 'reed-hut', at: [-7, -12], face: 25 },
      { id: 'stilt-hall', at: [8, -17], face: -20 },
      { id: 'great-siege-heron', at: [0, -4], face: 0, anim: 'attack', phase: 0.45 },
      { id: 'bog-toad', at: [-4.5, -2], face: 30 },
      { id: 'bog-toad', at: [4.8, -2.5], face: -35, anim: 'attack', phase: 0.5 },
      ...rank('reedguard', 4, 1.6, -0.5, { x: -5.5, alt: 'brace' }),
      ...rank('reedguard', 4, 1.6, -0.5, { x: 5.5, alt: 'brace' }),
      ...rank('fenling', 3, 1.1, 1.2, { x: -2.6, alt: 'attack' }),
      ...rank('fenling', 3, 1.1, 1.2, { x: 2.6, alt: 'attack' }),
      ...rank('fenling', 3, 1.15, 3, { x: -4.2, alt: 'attack' }),
      ...rank('fenling', 3, 1.15, 3, { x: 4.2, alt: 'attack' }),
    ],
  },
  // 3. the charge: the fen pouring across the picture at a run, toads bounding, the heron flying in over them
  {
    camera: { from: [5, 1.4, 6.5], to: [-1, 1.6, -2], fov: 50 },
    sky: ['#3a3f52', '#f0c27a'],
    cast: [
      { id: 'reed-hut', at: [-12, -14], face: 0 },
      { id: 'reed-hut', at: [-4, -18], face: 0 },
      { id: 'great-siege-heron', at: [-3, -5], lift: 3.5, face: 60, anim: 'fly', phase: 0.3 },
      { id: 'bog-toad', at: [-1, -2], lift: 0.6, face: 55, anim: 'leap', phase: 0.5 },
      { id: 'bog-toad', at: [-6, 1], face: 55, anim: 'charge', phase: 0.25 },
      { id: 'pack-tortoise', at: [-9, -5], face: 55, anim: 'walk', phase: 0.3 },
      ...rank('reedguard', 6, 1.5, 0.5, { x: 1, anim: 'charge', face: 55, turn: 0 }),
      ...rank('fenling', 8, 1.2, 2.5, { x: 1, anim: 'charge', face: 55, turn: 0 }),
      ...rank('fenling', 7, 1.3, 4.5, { x: 2, anim: 'charge', face: 55, turn: 0 }),
    ],
  },
  // 4. the heron's portrait: the great bird in front with its riders, its perch behind, a few guards at its feet
  {
    camera: { from: [2, 1.2, 10.5], to: [0, 3.2, -2], fov: 48 },
    sky: ['#2a2f47', '#e9a86c'],
    cast: [
      { id: 'heron-perch', at: [-5, -10], face: 20 },
      { id: 'reed-hut', at: [6, -12], face: -20 },
      { id: 'great-siege-heron', at: [0, -2], face: 20 },
      { id: 'reedguard', at: [-2.6, 1.5], face: 25, anim: 'brace' },
      { id: 'reedguard', at: [2.8, 1.2], face: -25, anim: 'brace' },
      { id: 'fenling', at: [-3.6, 3], face: 20, anim: 'attack', phase: 0.5 },
      { id: 'fenling', at: [3.4, 3.4], face: -20 },
      { id: 'fenling', at: [-4.6, 1.2], face: 30 },
    ],
  },
  // 5. the village from up on a rise: halls and huts on stilts, the army mustered on the green before them
  {
    camera: { from: [0, 9, 21], to: [0, 0.5, -5], fov: 40 },
    cast: [
      { id: 'stilt-hall', at: [0, -16], face: 0 },
      { id: 'elder-mound', at: [-13, -18], face: 20 },
      { id: 'toad-wallow', at: [12, -15], face: -20 },
      { id: 'peat-farm', at: [-14, -6], face: 30 },
      { id: 'reed-hut', at: [8, -6], face: -10 },
      { id: 'reed-hut', at: [15, -5], face: -30 },
      { id: 'heron-perch', at: [-7, -9], face: 0 },
      { id: 'great-siege-heron', at: [-3, -5], face: 10 },
      { id: 'great-siege-heron', at: [3.5, -6], face: -10 },
      { id: 'pack-tortoise', at: [9, 0], face: -40, anim: 'walk' },
      ...rank('bog-toad', 4, 3, -1, { alt: 'attack' }),
      ...rank('reedguard', 10, 1.4, 2),
      ...rank('fenling', 12, 1.1, 4),
      ...rank('fenling', 12, 1.1, 5.5),
    ],
  },
  // 6. (new) the attack up the hill: the army charging up the slope at us, bullfrogs bounding in front, the heron
  //    flying in low overhead; behind and below them their home, huts on stilts round a reedy pond
  {
    name: 'new: up the hill',
    sky: ['#56708e', '#f4dcae'],
    camera: { from: [1.5, 6.3, 12.5], to: [-0.5, 0.4, -8], fov: 50 },
    hills: [{ at: [0, 13], r: 15, h: 4.5 }, { at: [-5, -16], r: 7, h: -0.5 }],
    water: [{ at: [-5, -16], r: 5.2 }],
    props: [
      ...[[-10, -15], [-1, -12.5], [-7.5, -11.5], [0.5, -19], [-11, -19]].map(([x, z], i) => ({ model: (b: Parameters<typeof tree>[0]) => tree(b, i * 3), at: [x, z] as [number, number], face: i * 70 })),
      { model: (b: Parameters<typeof tree>[0]) => tree(b, 1), at: [14, -20], scale: 1.1 },
      { model: (b: Parameters<typeof tree>[0]) => tree(b, 5), at: [-17, -22], scale: 1.1 },
      { model: (b: Parameters<typeof tree>[0]) => tree(b, 4), at: [8, -9] },
      ...DOODADS.flowers.map((m, i) => ({ model: m, at: [-8 + i * 2.2, -10.5 - (i % 2)] as [number, number], scale: 2 })),
      ...DOODADS.grass.map((m, i) => ({ model: m, at: [(i % 2 ? 1 : -1) * (6.5 + i), 8 - i * 1.5] as [number, number], scale: 2 })),
    ],
    cast: [
      { id: 'stilt-hall', at: [6, -23], face: -15 },
      { id: 'reed-hut', at: [-14, -11], face: 35 },
      { id: 'reed-hut', at: [12, -13], face: -30 },
      { id: 'toad-wallow', at: [-3, -26], face: 0 },
      { id: 'great-siege-heron', at: [-2, -1.5], lift: 3.6, face: 15, anim: 'fly', phase: 0.3 },
      { id: 'bog-toad', at: [-1.6, 7.6], lift: 0.7, face: 0, anim: 'leap', phase: 0.5 },
      { id: 'bog-toad', at: [3.4, 6.2], lift: 0.3, face: -15, anim: 'leap', phase: 0.3 },
      { id: 'pack-tortoise', at: [6.5, -1], face: -20, anim: 'walk', phase: 0.4 },
      ...rank('fenling', 6, 1.4, 6.6, { anim: 'charge', alt: 'attack', turn: 1 }),
      ...rank('reedguard', 7, 1.5, 4.6, { anim: 'charge', turn: 1, phase: 0.2 }),
      ...rank('fenling', 9, 1.3, 2.6, { anim: 'charge', turn: 1, phase: 0.4 }),
      ...rank('fenling', 8, 1.35, 0.6, { x: -1, anim: 'charge', turn: 1 }),
    ],
  },
];

/** The one on the card. */
export const pick = 6;
