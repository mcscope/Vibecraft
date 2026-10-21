// Fen wildlife: unit designs (same physics as any unit) plus temper.
// Pure data and model functions, so the sim can read the specs without loading art.
import { footAt, jointBetween } from '../../kits/bake3d/gait';
import type { Mat, Vec3 } from '../../kits/bake3d/types';
import { headPose, TAU, type WildModel } from '../../kits/animals';

// ── fen wildlife ──
const heronGrey: Mat = { color: '#9aa0a4', tex: 'fur' };
const heronPale: Mat = { color: '#d8dcd8', tex: 'fur' };
const beak: Mat = { color: '#c8a03a', rough: 0.4 };

export const heron: WildModel = {
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
    const walking = p.anim === 'walk';
    for (const z of [1, -1]) {
      // (walking, on planted feet, its ankles bending backward as a bird's do)
      const hip: Vec3 = [0, 0.75, 0.06 * z], rest: Vec3 = [0, 0.01, 0.06 * z];
      const foot = walking ? footAt(rest, p.phase + (z > 0 ? 0 : 0.5), 0.12, 0.08) : rest;
      const knee = jointBetween(hip, foot, 0.38, 0.38, [-1, 0, 0]);
      b.limb(hip, knee, 0.015, beak);
      b.limb(knee, foot, 0.012, beak);
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
export const bogLurker: WildModel = {
  id: 'bog-lurker',
  name: 'Bog Lurker',
  description: 'Lies low in the reeds, then snaps. Long-jawed and armoured; stay well clear of its pool.',
  mass: 90,
  length: 2.5, // m nose to tail: a long body, it wheels
  physique: { muscle: 0.45, frame: 0.3, reserve: 0.25 },
  attack: { style: 'strike', crystalMass: 0.7 },
  canGather: false,
  temper: 'aggressive',
  group: 1,
  count: 2,
  meat: 50,
  model(b, p) {
    const t = p.phase * TAU;
    const wiggle = p.anim === 'walk' ? Math.sin(t) * 0.12 : 0;
    const snap = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase * 1.4) * Math.PI) : 0;
    for (const [x, z, ph] of [[0.35, 0.22, 0], [0.35, -0.22, 0.5], [-0.35, 0.22, 0.5], [-0.35, -0.22, 0]] as Array<[number, number, number]>) {
      const rest: Vec3 = [x, 0.04, z * 1.3]; // (on planted feet, diagonal pairs together)
      b.limb([x, 0.2, z * 0.8], p.anim === 'walk' ? footAt(rest, p.phase + ph, 0.08, 0.05) : rest, 0.05, lurkerHide, 0.04);
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

export const fenWildlife: WildModel[] = [heron, bogLurker];
