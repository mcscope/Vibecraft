// The meadow's wildlife: unit designs (same physics as any unit) plus temper.
// Pure data and model functions, so the sim can read the specs without loading art.
import type { WildSpec } from '../../factions/types';
import type { Mat, ModelBuilder, Pose, UnitModel, Vec3 } from '../../kits/bake3d/types';

export type MeadowWild = WildSpec & { model: UnitModel };

const TAU = Math.PI * 2;
const swing = (from: Vec3, len: number, a: number): Vec3 => [from[0] + Math.sin(a) * len, from[1] - Math.cos(a) * len, from[2]];

/** Four legs that walk (diagonal pairs in step); returns the body's bob. */
function legs(b: ModelBuilder, p: Pose, o: { fx: number; bx: number; z: number; hip: number; len: number; r: number; mat: Mat; hoof: Mat }): number {
  const walking = p.anim === 'walk';
  const t = p.phase * TAU;
  const bob = walking ? Math.abs(Math.sin(t)) * 0.05 * o.len : 0;
  for (const [x, z, ph] of [[o.fx, o.z, 0], [o.fx, -o.z, Math.PI], [o.bx, o.z, Math.PI], [o.bx, -o.z, 0]] as Array<[number, number, number]>) {
    const a = walking ? Math.sin(t + ph) * 0.5 : 0;
    const hip: Vec3 = [x, o.hip + bob, z];
    const knee = swing(hip, o.len * 0.5, a);
    const lift = walking ? Math.max(0, Math.sin(t + ph + Math.PI / 2)) * 0.6 : 0;
    const foot = swing(knee, o.len * 0.5, a * 0.3 - (x > 0 ? lift : -lift));
    b.limb(hip, knee, o.r, o.mat, o.r * 0.75);
    b.limb(knee, foot, o.r * 0.7, o.mat, o.r * 0.55);
    b.sphere([o.r * 0.8, o.r * 0.55, o.r * 0.75], [foot[0], Math.max(o.r * 0.4, foot[1]), foot[2]], o.hoof);
  }
  return bob;
}

/** Head dips while grazing ('gather'/'eat'/'idle' breathe), lunges on 'attack'. */
const headPose = (p: Pose): number => (p.anim === 'eat' || p.anim === 'gather' ? -0.9 : p.anim === 'idle' ? Math.sin(p.phase * TAU) * 0.08 : 0);
const lunge = (p: Pose): number => (p.anim === 'attack' ? Math.sin(Math.min(1, p.phase * 1.4) * Math.PI) * 0.25 : 0);

const deerHide: Mat = { color: '#9a6a3e', tex: 'fur' };
const deerBelly: Mat = { color: '#d8c3a0', tex: 'fur' };
const hoof: Mat = { color: '#2a2018', tex: 'leather' };
const antler: Mat = { color: '#cdbb98', tex: 'wood' };

export const deer: MeadowWild = {
  id: 'deer',
  name: 'Deer',
  description: 'Grazes the meadow in small herds. Send villagers to hunt it for food.',
  mass: 90,
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
  mass: 40,
  physique: { muscle: 0.5, frame: 0.35, reserve: 0.15 },
  attack: { style: 'strike', crystalMass: 0.6 },
  canGather: false,
  temper: 'aggressive',
  group: 3,
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

// ── frost meadow wildlife ──

const elkHide: Mat = { color: '#6e5238', tex: 'fur' };
const elkMane: Mat = { color: '#4a3424', tex: 'fur' };

export const elk: MeadowWild = {
  id: 'elk',
  name: 'Elk',
  description: 'Big, shaggy and slow to startle. Grazes the frost meadow in pairs and threes. Hunt it for food.',
  mass: 200,
  physique: { muscle: 0.5, frame: 0.32, reserve: 0.18 },
  canGather: false,
  temper: 'passive',
  group: 2,
  count: 3,
  meat: 120,
  model(b, p) {
    const bob = legs(b, p, { fx: 0.55, bx: -0.55, z: 0.18, hip: 1.1, len: 1.1, r: 0.07, mat: elkHide, hoof });
    b.joint([0, bob, 0], [0, 0, 0], (c) => {
      c.sphere([0.72, 0.36, 0.32], [0, 1.25, 0], elkHide);
      c.sphere([0.3, 0.3, 0.3], [0.45, 1.35, 0], elkMane); // shaggy shoulders
      c.joint([0.6, 1.4, 0], [0, 0, 0.8 + headPose(p)], (n) => {
        n.limb([0, 0, 0], [0.42, 0, 0], 0.12, elkMane, 0.09);
        n.joint([0.46, 0, 0], [0, 0, -1.1], (h) => {
          h.sphere([0.24, 0.12, 0.11], [0.08, 0, 0], elkHide);
          h.sphere([0.08, 0.07, 0.07], [0.3, -0.03, 0], hoof);
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
export const bear: MeadowWild = {
  id: 'bear',
  name: 'Bear',
  description: 'A lone, territorial bear. Mauls anything that wanders too close to its den.',
  mass: 180,
  physique: { muscle: 0.5, frame: 0.38, reserve: 0.12 },
  attack: { style: 'strike', crystalMass: 1.5 },
  canGather: false,
  temper: 'aggressive',
  group: 1,
  count: 3,
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

export const frostWildlife: MeadowWild[] = [elk, bear];

// ── fen wildlife ──

const heronGrey: Mat = { color: '#9aa0a4', tex: 'fur' };
const heronPale: Mat = { color: '#d8dcd8', tex: 'fur' };
const beak: Mat = { color: '#c8a03a', rough: 0.4 };

export const heron: MeadowWild = {
  id: 'heron',
  name: 'Heron',
  description: 'Stalks the shallows on long legs. Good eating, if you can sneak up on it.',
  mass: 18,
  physique: { muscle: 0.4, frame: 0.3, reserve: 0.3 },
  canGather: false,
  temper: 'passive',
  group: 2,
  count: 4,
  meat: 25,
  model(b, p) {
    const t = p.phase * TAU;
    const walking = p.anim === 'walk';
    for (const z of [1, -1]) {
      const a = walking ? Math.sin(t + (z > 0 ? 0 : Math.PI)) * 0.4 : 0;
      const hip: Vec3 = [0, 0.75, 0.06 * z];
      const knee = swing(hip, 0.38, a);
      b.limb(hip, knee, 0.015, beak);
      b.limb(knee, swing(knee, 0.38, a * 0.3), 0.012, beak);
    }
    b.sphere([0.28, 0.14, 0.14], [0, 0.88, 0], heronGrey, [0, 0, 0.3]);
    b.sphere([0.18, 0.1, 0.12], [-0.05, 0.84, 0], heronPale);
    const dip = headPose(p);
    b.limb([0.22, 0.95, 0], [0.3 + dip * 0.1, 1.3 + dip * 0.35, 0], 0.03, heronPale, 0.025); // long neck
    b.sphere([0.06, 0.05, 0.05], [0.32 + dip * 0.1, 1.33 + dip * 0.35, 0], heronPale);
    b.cone(0.025, 0.2, [0.44 + dip * 0.1, 1.31 + dip * 0.35, 0], beak, [0, 0, -Math.PI / 2], 6);
  },
};

const lurkerHide: Mat = { color: '#3e4a2e', tex: 'leather' };
export const bogLurker: MeadowWild = {
  id: 'bog-lurker',
  name: 'Bog Lurker',
  description: 'Lies low in the reeds, then snaps. Long-jawed and armoured; stay well clear of its pool.',
  mass: 120,
  physique: { muscle: 0.45, frame: 0.45, reserve: 0.1 },
  attack: { style: 'strike', crystalMass: 1.5 },
  canGather: false,
  temper: 'aggressive',
  group: 1,
  count: 3,
  meat: 50,
  model(b, p) {
    const t = p.phase * TAU;
    const wiggle = p.anim === 'walk' ? Math.sin(t) * 0.12 : 0;
    const snap = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase * 1.4) * Math.PI) : 0;
    for (const [x, z, ph] of [[0.35, 0.22, 0], [0.35, -0.22, Math.PI], [-0.35, 0.22, Math.PI], [-0.35, -0.22, 0]] as Array<[number, number, number]>) {
      const a = p.anim === 'walk' ? Math.sin(t + ph) * 0.4 : 0;
      b.limb([x, 0.2, z * 0.8], [x + Math.sin(a) * 0.15, 0.04, z * 1.3], 0.05, lurkerHide, 0.04);
    }
    b.joint([snap * 0.15, 0, 0], [0, wiggle, 0], (c) => {
      c.sphere([0.6, 0.16, 0.26], [0, 0.22, 0], lurkerHide);
      for (let i = 0; i < 5; i++) c.box([0.08, 0.05, 0.08], [-0.4 + i * 0.2, 0.37, 0], { color: '#2e3a22', tex: 'stone' }); // back scutes
      c.limb([-0.55, 0.2, 0], [-1.25, 0.12, wiggle], 0.12, lurkerHide, 0.03); // tail
      c.joint([0.55, 0.22, 0], [0, 0, 0], (h) => {
        h.box([0.55, 0.08, 0.2], [0.25, 0.04 + snap * 0.06, 0], lurkerHide, [0, 0, snap * 0.35]); // upper jaw
        h.box([0.5, 0.06, 0.18], [0.23, -0.06, 0], lurkerHide, [0, 0, -snap * 0.2]); // lower jaw
        for (const z of [1, -1]) h.sphere(0.04, [0.08, 0.12, 0.08 * z], { color: '#c8a03a', rough: 0.3 });
      });
    });
  },
};

export const fenWildlife: MeadowWild[] = [heron, bogLurker];
