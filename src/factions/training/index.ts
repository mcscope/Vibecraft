// Training dummies for the Proving Grounds. They obey the same physics: HP comes
// from their mass and frame, so heavier dummies soak up more crystal.
import type { FactionSpec, UnitSpec } from '../types';
import type { Mat, ModelBuilder, UnitModel } from '../../kits/bake3d/types';

export type DummyUnit = UnitSpec & { model: UnitModel };

const WOOD: Mat = { color: '#6b4a2e', tex: 'wood' };
const STRAW: Mat = { color: '#c9a961', tex: 'thatch' };
const SACK: Mat = { color: '#a68f6a', tex: 'cloth' };
const IRON: Mat = { color: '#80868d', tex: 'metal' };
const ROPE: Mat = { color: '#8a7650', tex: 'cloth' };

function post(b: ModelBuilder, h: number): void {
  b.cylinder(0.06, 0.07, h, [0, h / 2, 0], WOOD, undefined, 10);
  b.box([0.5, 0.06, 0.06], [0, 0.06, 0], WOOD);
  b.box([0.06, 0.06, 0.5], [0, 0.06, 0], WOOD);
}

function strawman(b: ModelBuilder, armored: boolean): void {
  post(b, 1.55);
  b.sphere([0.22, 0.34, 0.26], [0, 1.15, 0], STRAW);
  b.cylinder(0.2, 0.2, 0.05, [0, 1.0, 0], ROPE);
  b.cylinder(0.2, 0.2, 0.05, [0, 1.3, 0], ROPE);
  b.limb([0, 1.35, 0.45], [0, 1.35, -0.45], 0.05, WOOD);
  b.sphere([0.07, 0.06, 0.12], [0, 1.35, 0.46], STRAW);
  b.sphere([0.07, 0.06, 0.12], [0, 1.35, -0.46], STRAW);
  b.sphere([0.13, 0.14, 0.13], [0, 1.66, 0], SACK);
  b.limb([0, 1.54, 0.1], [0, 1.54, -0.1], 0.02, ROPE);
  if (armored) {
    b.sphere([0.25, 0.3, 0.29], [0.02, 1.2, 0], IRON);
    b.sphere([0.15, 0.1, 0.15], [0, 1.72, 0], IRON);
    b.sphere([0.1, 0.06, 0.16], [0, 1.45, 0.25], IRON);
    b.sphere([0.1, 0.06, 0.16], [0, 1.45, -0.25], IRON);
  } else {
    b.box([0.02, 0.3, 0.3], [0.22, 1.15, 0], { team: 'primary', tex: 'cloth' });
  }
}

const strawDummy: DummyUnit = {
  id: 'straw',
  name: 'Straw Dummy',
  description: 'A light practice target. 40 kg of straw on a post.',
  mass: 40,
  physique: { muscle: 0.1, frame: 0.6, reserve: 0.3 },
  attack: { style: 'strike', crystalMass: 0.1 },
  dummy: true,
  model: (b) => strawman(b, false),
};

const armoredDummy: DummyUnit = {
  id: 'armored',
  name: 'Armored Dummy',
  description: 'A straw man in scrap plate. 150 kg — mostly frame.',
  mass: 150,
  physique: { muscle: 0.1, frame: 0.8, reserve: 0.1 },
  attack: { style: 'strike', crystalMass: 0.1 },
  dummy: true,
  model: (b) => strawman(b, true),
};

const bales: DummyUnit = {
  id: 'bales',
  name: 'Siege Bales',
  description: 'A 600 kg stack of bound hay with a painted target. Bring something heavy.',
  mass: 600,
  physique: { muscle: 0.1, frame: 0.8, reserve: 0.1 },
  attack: { style: 'strike', crystalMass: 0.1 },
  dummy: true,
  model(b) {
    for (const [x, y, z] of [[0, 0.3, -0.42], [0, 0.3, 0.42], [-0.1, 0.9, 0], [0.05, 0.3, 0]] as const) {
      b.box([0.75, 0.58, 0.82], [x, y, z], STRAW);
      b.box([0.77, 0.06, 0.84], [x, y + 0.12, z], ROPE);
      b.box([0.77, 0.06, 0.84], [x, y - 0.12, z], ROPE);
    }
    b.joint([0.3, 1.0, 0], [0, 0, Math.PI / 2], (t) => {
      t.cylinder(0.42, 0.42, 0.04, [0, 0, 0], { color: '#efe6d0', tex: 'cloth' }, undefined, 24);
      t.cylinder(0.3, 0.3, 0.05, [0, 0, 0], { team: 'primary', tex: 'cloth' }, undefined, 24);
      t.cylinder(0.18, 0.18, 0.06, [0, 0, 0], { color: '#efe6d0', tex: 'cloth' }, undefined, 24);
      t.cylinder(0.08, 0.08, 0.07, [0, 0, 0], { team: 'primary', tex: 'cloth' }, undefined, 24);
    });
  },
};

/** A palisade fort with a straw-stuffed keep. Self-contained: factions never borrow each other's models. */
function fort(b: ModelBuilder): void {
  const base = 0.2;
  b.box([5.8, base, 5.8], [0, base / 2, 0], { color: '#7a6a52', tex: 'stone' });
  for (let i = 0; i <= 12; i++) {
    const t = -2.7 + (i / 12) * 5.4;
    for (const [x, z] of [[t, -2.7], [t, 2.7], [-2.7, t], [2.7, t]] as const) {
      b.cylinder(0.12, 0.13, 1.4, [x, base + 0.7, z], WOOD, undefined, 6);
      b.cone(0.13, 0.25, [x, base + 1.52, z], WOOD, undefined, 6);
    }
  }
  b.box([2.2, 2.2, 2.2], [0, base + 1.1, 0], WOOD);
  b.box([2.3, 0.15, 2.3], [0, base + 2.25, 0], { color: '#4a3424', tex: 'wood' });
  b.roof([2.6, 1.3, 2.6], [0, base + 2.3, 0], STRAW);
  b.cylinder(0.04, 0.04, 1.4, [0, base + 3.6, 0], WOOD, undefined, 6);
  b.box([0.04, 0.4, 0.7], [0, base + 4.05, 0.36], { team: 'primary', tex: 'cloth' });
  b.joint([1.12, base + 1.2, 0], [0, 0, Math.PI / 2], (t) => {
    t.cylinder(0.6, 0.6, 0.04, [0, 0, 0], { color: '#efe6d0', tex: 'cloth' }, undefined, 24);
    t.cylinder(0.4, 0.4, 0.05, [0, 0, 0], { team: 'primary', tex: 'cloth' }, undefined, 24);
    t.cylinder(0.18, 0.18, 0.06, [0, 0, 0], { color: '#efe6d0', tex: 'cloth' }, undefined, 24);
  });
  for (const [x, z] of [[-1.8, 1.8], [1.6, -1.9], [-1.9, -1.5]]) b.box([0.7, 0.45, 0.5], [x, base + 0.22, z], STRAW, [0, x, 0]);
}

export const training: FactionSpec = {
  id: 'training',
  name: 'Training Grounds',
  workerId: 'straw',
  townCenterId: 'fort',
  units: [strawDummy, armoredDummy, bales],
  buildings: [{ id: 'fort', name: 'Target Fort', description: 'A practice fort. Knock it down; it gets rebuilt.', size: 3, materials: 810, unbuildable: true }],
  // the range's half of the map: an autumn meadow (no wildlife on a practice range)
  biome: (onProgress) => import('../../biomes/meadow').then((m) => m.bakeMeadow(onProgress, 'autumn')),
  art: (team, onProgress) => import('../../kits/bake3d/baker').then(async ({ Baker }) => {
    const baker = new Baker();
    const art = { units: {} as Record<string, import('../../art/contract').UnitArt>, buildings: { fort: baker.bakeBuilding(fort, 3, team) }, flag: baker.bakeStatic(fort, team) };
    const list = [strawDummy, armoredDummy, bales];
    for (const [i, u] of list.entries()) { onProgress?.(i / list.length, `Setting up ${u.name}`); art.units[u.id] = await baker.bakeUnit(u.model, team, { dummy: true }); }
    baker.dispose();
    return art;
  }),
};
