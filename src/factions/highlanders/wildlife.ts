// Highland wildlife: unit designs (same physics as any unit) plus temper.
// Pure data and model functions, so the sim can read the specs without loading art.
import type { Mat } from '../../kits/bake3d/types';
import { headPose, legs, lunge, type WildModel } from '../../kits/animals';

// ── frost meadow wildlife ──
const elkHoof: Mat = { color: '#2a2018', tex: 'leather' };
const antler: Mat = { color: '#cdbb98', tex: 'wood' };
const elkHide: Mat = { color: '#6e5238', tex: 'fur' };
const elkMane: Mat = { color: '#4a3424', tex: 'fur' };

export const elk: WildModel = {
  id: 'elk',
  name: 'Elk',
  description: 'Big, shaggy and slow to startle. Grazes the frost meadow in pairs and threes. Hunt it for food.',
  mass: 150,
  physique: { muscle: 0.5, frame: 0.32, reserve: 0.18 },
  canGather: false,
  temper: 'passive',
  group: 2,
  count: 3,
  meat: 120,
  model(b, p) {
    const bob = legs(b, p, { fx: 0.55, bx: -0.55, z: 0.18, hip: 1.1, len: 1.1, r: 0.07, mat: elkHide, hoof: elkHoof });
    b.joint([0, bob, 0], [0, 0, 0], (c) => {
      c.sphere([0.72, 0.36, 0.32], [0, 1.25, 0], elkHide);
      c.sphere([0.3, 0.3, 0.3], [0.45, 1.35, 0], elkMane); // shaggy shoulders
      c.joint([0.6, 1.4, 0], [0, 0, 0.8 + headPose(p)], (n) => {
        n.limb([0, 0, 0], [0.42, 0, 0], 0.12, elkMane, 0.09);
        n.joint([0.46, 0, 0], [0, 0, -1.1], (h) => {
          h.sphere([0.24, 0.12, 0.11], [0.08, 0, 0], elkHide);
          h.sphere([0.08, 0.07, 0.07], [0.3, -0.03, 0], elkHoof);
          for (const z of [1, -1]) { // broad palmate antlers
            h.limb([-0.02, 0.1, 0.06 * z], [-0.1, 0.4, 0.3 * z], 0.025, antler);
            h.sphere([0.16, 0.03, 0.14], [-0.1, 0.45, 0.36 * z], antler, [0.4 * z, 0, 0.3]);
            h.limb([-0.1, 0.42, 0.3 * z], [0.06, 0.55, 0.4 * z], 0.015, antler);
          }
        });
      });
    });
  },
};

const bearFur: Mat = { color: '#3e2c20', tex: 'fur' };
export const bear: WildModel = {
  id: 'bear',
  name: 'Bear',
  description: 'A lone, territorial bear. Mauls anything that wanders too close to its den.',
  mass: 130,
  physique: { muscle: 0.5, frame: 0.3, reserve: 0.2 },
  attack: { style: 'strike', crystalMass: 0.7 },
  canGather: false,
  temper: 'aggressive',
  group: 1,
  count: 2,
  meat: 60,
  model(b, p) {
    const bob = legs(b, p, { fx: 0.42, bx: -0.42, z: 0.22, hip: 0.62, len: 0.62, r: 0.11, mat: bearFur, hoof: { color: '#1e1610', tex: 'leather' } });
    const l = lunge(p);
    const rear = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase * 1.4) * Math.PI) * 0.5 : 0;
    b.joint([l * 0.5, bob, 0], [0, 0, rear], (c) => {
      c.sphere([0.6, 0.38, 0.36], [0, 0.8, 0], bearFur);
      c.sphere([0.32, 0.3, 0.32], [0.38, 0.95, 0], bearFur); // hump
      c.joint([0.62, 0.92, 0], [0, 0, headPose(p) * 0.5], (h) => {
        h.sphere([0.22, 0.2, 0.22], [0.08, 0, 0], bearFur);
        h.sphere([0.14, 0.1, 0.11], [0.28, -0.06, 0], { color: '#5a4434', tex: 'fur' });
        h.sphere(0.035, [0.42, -0.04, 0], { color: '#141010' });
        for (const z of [1, -1]) h.sphere([0.06, 0.06, 0.03], [0.0, 0.18, 0.13 * z], bearFur);
      });
    });
  },
};

export const highlandWildlife: WildModel[] = [elk, bear];
