// The meadow's wildlife: unit designs (same physics as any unit) plus temper.
// Pure data and model functions, so the sim can read the specs without loading art.
import type { Mat } from '../../kits/bake3d/types';
import { headPose, legs, lunge, type WildModel } from '../../kits/animals';

export type MeadowWild = WildModel;

const deerHide: Mat = { color: '#9a6a3e', tex: 'fur' };
const deerBelly: Mat = { color: '#d8c3a0', tex: 'fur' };
const hoof: Mat = { color: '#2a2018', tex: 'leather' };
const antler: Mat = { color: '#cdbb98', tex: 'wood' };

export const deer: MeadowWild = {
  id: 'deer',
  name: 'Deer',
  description: 'Grazes the meadow in small herds. Send villagers to hunt it for food.',
  mass: 70,
  physique: { muscle: 0.5, frame: 0.3, reserve: 0.2 },
  canGather: false,
  temper: 'passive',
  group: 3,
  count: 3,
  meat: 60,
  model(b, p) {
    const bob = legs(b, p, { fx: 0.42, bx: -0.42, z: 0.14, hip: 0.85, len: 0.85, r: 0.05, mat: deerHide, hoof });
    b.joint([0, bob, 0], [0, 0, 0], (c) => {
      c.sphere([0.55, 0.26, 0.24], [0, 0.98, 0], deerHide);
      c.sphere([0.45, 0.16, 0.2], [0, 0.88, 0], deerBelly);
      c.sphere([0.08, 0.1, 0.08], [-0.55, 1.05, 0], deerBelly); // tail
      c.joint([0.48, 1.08, 0], [0, 0, 0.9 + headPose(p)], (n) => {
        n.limb([0, 0, 0], [0.32, 0, 0], 0.08, deerHide, 0.06); // neck
        n.joint([0.36, 0, 0], [0, 0, -1.1], (h) => {
          h.sphere([0.17, 0.09, 0.08], [0.06, 0, 0], deerHide);
          h.sphere([0.06, 0.05, 0.05], [0.2, -0.02, 0], hoof); // nose
          for (const z of [1, -1]) {
            h.sphere([0.06, 0.02, 0.04], [-0.03, 0.08, 0.07 * z], deerHide, [0.3 * z, 0, 0.5]); // ears
            h.limb([0, 0.08, 0.04 * z], [-0.05, 0.3, 0.12 * z], 0.015, antler);
            h.limb([-0.05, 0.3, 0.12 * z], [0.05, 0.4, 0.18 * z], 0.012, antler);
            h.limb([-0.03, 0.2, 0.08 * z], [0.08, 0.26, 0.1 * z], 0.01, antler);
          }
        });
      });
    });
  },
};

const wolfFur: Mat = { color: '#6e6a62', tex: 'fur' };
const wolfPale: Mat = { color: '#a8a296', tex: 'fur' };
const paw: Mat = { color: '#2e2a26', tex: 'leather' };

export const wolf: MeadowWild = {
  id: 'wolf',
  name: 'Wolf',
  description: 'Hunts in packs at the edge of the meadow. Attacks anything that strays close, then slinks home.',
  mass: 32,
  physique: { muscle: 0.5, frame: 0.3, reserve: 0.2 },
  attack: { style: 'strike', crystalMass: 0.35 },
  canGather: false,
  temper: 'aggressive',
  group: 2,
  count: 2,
  meat: 15,
  model(b, p) {
    const bob = legs(b, p, { fx: 0.3, bx: -0.3, z: 0.11, hip: 0.5, len: 0.5, r: 0.045, mat: wolfFur, hoof: paw });
    const l = lunge(p);
    b.joint([l, bob, 0], [0, 0, 0], (c) => {
      c.sphere([0.42, 0.17, 0.16], [0, 0.6, 0], wolfFur);
      c.sphere([0.3, 0.1, 0.13], [0.02, 0.52, 0], wolfPale);
      c.limb([-0.38, 0.62, 0], [-0.62, 0.48, 0], 0.05, wolfFur, 0.03); // tail
      c.joint([0.36, 0.68, 0], [0, 0, headPose(p) * 0.5 + (p.anim === 'attack' ? -0.2 : 0)], (h) => {
        h.sphere([0.14, 0.12, 0.12], [0.06, 0, 0], wolfFur);
        h.sphere([0.12, 0.06, 0.07], [0.2, -0.03, 0], wolfPale); // muzzle
        h.sphere(0.025, [0.31, -0.02, 0], paw); // nose
        for (const z of [1, -1]) h.cone(0.04, 0.09, [0.02, 0.13, 0.06 * z], wolfFur);
      });
    });
  },
};

export const meadowWildlife: MeadowWild[] = [deer, wolf];
