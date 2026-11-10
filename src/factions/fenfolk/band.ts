// The Fenfolk's pictures for the front page (BandCandidate): five ways to show the fen's army, staged in 3D.
import { bandCrowd as crowd, bandRank as rank, type BandCandidate } from '../types';
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
  // 7. (maximal) the fen at sundown: the whole army mustering on the causeways of a misty marsh, pools catching the
  //    sky, stilt huts and the Stilt Hall among reed beds and willows, the heron perch on the skyline, herons flying in
  //    and the sun setting behind. RULES: the Great Siege Heron in front is the focal point; water and reeds fill the
  //    foreground; layers of huts and haze behind.
  {
    name: 'new ★1: the fen at sundown',
    sky: ['#2c3450', '#f6c084'], sun: { azimuth: 175, elevation: 6, disc: true, rays: true }, clouds: 'many',
    groundColors: ['#41492a', '#4f5a2e', '#5a6232', '#4a4630', '#3e4a38'],
    ridges: [{ distance: 70, height: 4, color: '#4a4c40', jag: 0.5 }, { distance: 110, height: 7, color: '#6e6c66', jag: 0.3 }],
    camera: { from: [0, 1.4, 12], to: [0, 2.8, -4], fov: 58 },
    hills: [[-8, 6], [7, 7], [-3, -6], [9, -4], [-13, -3], [2, -14], [-9, -16], [12, -16]].map(([x, z]) => ({ at: [x, z] as [number, number], r: 4.2, h: -0.45 })),
    water: [[-8, 6], [7, 7], [-3, -6], [9, -4], [-13, -3], [2, -14], [-9, -16], [12, -16]].map(([x, z]) => ({ at: [x, z] as [number, number], r: 3.8 })),
    props: [
      ...[[-12, 2], [-5, 9], [11, 3], [5, -9], [-14, -10], [14, -8], [-4, -19], [8, -20]].map(([x, z], i) => ({ model: (b: Parameters<typeof tree>[0]) => tree(b, i * 3), at: [x, z] as [number, number], face: i * 40, scale: 1.1 })),
      ...[[-17, -14], [17, -13], [0, -24], [-12, -24]].map(([x, z], i) => ({ model: (b: Parameters<typeof tree>[0]) => tree(b, i * 3 + 1 + (i % 2)), at: [x, z] as [number, number], face: i * 70, scale: 1.3 })),
      ...DOODADS.flowers.flatMap((m, i) => [{ model: m, at: [-10 + i * 1.5, 9.5] as [number, number], scale: 2 }, { model: m, at: [5 + i * 1.6, 9.8] as [number, number], scale: 2 }]),
    ],
    cast: [
      { id: 'stilt-hall', at: [-2, -22], face: 10 }, { id: 'heron-perch', at: [9, -25] }, { id: 'reed-hut', at: [-15, -18], face: 30 }, { id: 'reed-hut', at: [15, -19], face: -30 },
      { id: 'reed-hut', at: [-8, -12], face: 20 }, { id: 'reed-hut', at: [6, -11], face: -15 }, { id: 'toad-wallow', at: [14, -2], face: -40 }, { id: 'elder-mound', at: [-18, -6], face: 40 },
      { id: 'great-siege-heron', at: [0.5, 2.5], face: -20, anim: 'attack', phase: 0.45 },
      { id: 'great-siege-heron', at: [-6, -7], lift: 5.5, face: 50, anim: 'fly', phase: 0.3 },
      { id: 'great-siege-heron', at: [6, -15], lift: 8, face: -60, anim: 'fly', phase: 0.7 },
      { id: 'bog-toad', at: [-4, 3.5], lift: 0.9, face: 30, anim: 'leap', phase: 0.45 },
      { id: 'bog-toad', at: [4.5, 3], face: -30, anim: 'attack', phase: 0.5 },
      { id: 'pack-tortoise', at: [-10, -1], face: 40, anim: 'walk', phase: 0.3 },
      ...rank('reedguard', 10, 1.4, 0, { anim: 'brace', alt: 'idle' }),
      ...crowd('fenling', 30, -6, -3, 4, 25, 'attack', 'idle'),
      ...crowd('fenling', 30, 6, -3, 4, -25, 'idle', 'attack'),
      ...crowd('fenling', 24, 0, -9, 4, 0, 'walk'),
    ],
  },
];

/** The one on the card. */
export const pick = 3;
