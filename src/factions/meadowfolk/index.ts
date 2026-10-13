// The Meadowfolk: the starter army, and a reference for anyone vibecoding their own.
//
// Notice there are no HP / damage / speed numbers here. Each unit only says how
// heavy it is, how that body is built, and what crystal it fights with.
// Run `npm run stats` to see what the physics makes of them, and open
// /lab.html to see the baked sprites.
//
// Art: the Meadowfolk build their units and buildings as little 3D models
// (the `model` fields below, using the bake3d kit) and bake them into sprites
// in ./art.ts. The game only ever sees the finished sprites.

import type { BuildingSpec, FactionSpec, TechSpec, UnitSpec } from '../types';
import type { BuildingModel, Mat, UnitModel } from '../../kits/bake3d/types';

/** Meadowfolk specs carry their 3D models; the engine ignores the extra field. */
export type MeadowUnit = UnitSpec & { model: UnitModel };
export type MeadowBuilding = BuildingSpec & { model: BuildingModel };
import { armAngle, cargoPack, human, quadLegs, swing, type HumanLook } from './body';
import * as models from './buildings';

const WOOD: Mat = { color: '#6b4a2e', tex: 'wood' };
const LEATHER: Mat = { color: '#5a3f28', tex: 'leather' };
const IRON: Mat = { color: '#8d939a', tex: 'metal' };

const villagerLook: HumanLook = {
  skin: '#c99a76', hair: '#4a3020', head: 'hood', scale: 0.95, beard: true,
  tunic: { color: '#8a7350', tex: 'cloth' }, trousers: { color: '#5d5040', tex: 'cloth' }, boots: LEATHER,
};

const villager: MeadowUnit = {
  id: 'villager',
  name: 'Villager',
  description: 'Gathers berries, wood and crystal, hauls them home and raises buildings. Unarmed.',
  mass: 45,
  physique: { muscle: 0.4, frame: 0.35, reserve: 0.25 },
  model(b, p) {
    human(b, p, villagerLook, armAngle(p), () => {}); // unarmed: empty hands
    cargoPack(b, p, 0.95);
  },
};

const slinger: MeadowUnit = {
  id: 'slinger',
  name: 'Slinger',
  description: 'Light skirmisher who whirls a sling of crystal chips. Fragile, but hits from range — then has to collect the spent crystals.',
  mass: 32,
  physique: { muscle: 0.5, frame: 0.25, reserve: 0.25 },
  attack: { style: 'throw', crystalMass: 1.2, ammo: 8 },
  model(b, p) {
    const look: HumanLook = {
      skin: '#b9875f', hair: '#2b1d14', head: 'band', scale: 0.88, bulk: 0.9,
      tunic: { color: '#6d5a3c', tex: 'leather' }, trousers: { color: '#4d4434', tex: 'cloth' }, boots: LEATHER,
    };
    human(b, p, look, armAngle(p, 'throw'), (h) => {
      // sling: cord and pouch, whirling during the wind-up
      const whirl = p.anim === 'attack' && p.phase < 0.65 ? p.phase * Math.PI * 2 * 3 : 0.4;
      const pouch: [number, number, number] = [Math.cos(whirl) * 0.08, -0.38, Math.sin(whirl) * 0.1];
      h.limb([0, 0, 0], pouch, 0.006, LEATHER);
      h.sphere([0.04, 0.03, 0.04], pouch, LEATHER);
      if (p.armed && !(p.anim === 'attack' && p.phase > 0.7)) h.crystal(0.08, [pouch[0], pouch[1] - 0.03, pouch[2]]);
    }, (h) => {
      h.sphere([0.06, 0.05, 0.05], [0.02, -0.05, 0], LEATHER);
    });
    b.sphere([0.08, 0.1, 0.06], [-0.05, 0.8, -0.18], LEATHER); // ammo bag
  },
};

const maceman: MeadowUnit = {
  id: 'maceman',
  name: 'Crystal Maceman',
  description: 'Infantry in mail with a shield, swinging a 2 kg crystal-headed mace. Hard to stop.',
  mass: 80,
  physique: { muscle: 0.45, frame: 0.45, reserve: 0.1 },
  attack: { style: 'strike', crystalMass: 2 },
  refinement: 1.3,
  model(b, p) {
    const look: HumanLook = {
      skin: '#c08e6c', hair: '#3a2a1c', head: 'helmet', scale: 1.02, bulk: 1.15, tabard: true, pads: true, beard: true,
      tunic: IRON, trousers: { color: '#4a4038', tex: 'cloth' }, boots: LEATHER,
    };
    human(b, p, look, armAngle(p), (h) => {
      if (!p.armed) return;
      h.limb([-0.08, -0.01, 0], [0.55, 0.08, 0], 0.03, WOOD);
      h.sphere(0.06, [0.5, 0.07, 0], IRON);
      h.crystal(0.22, [0.55, 0.08, 0], [0, 0, -Math.PI / 2 + 0.08]);
      h.crystal(0.14, [0.52, 0.08, 0.05], [0.6, 0, -Math.PI / 2]);
      h.crystal(0.14, [0.52, 0.08, -0.05], [-0.6, 0, -Math.PI / 2]);
    }, (h) => {
      // round shield, team-painted
      h.joint([0.05, -0.05, 0.08], [Math.PI / 2, 0, 0], (s) => {
        s.cylinder(0.3, 0.3, 0.04, [0, 0, 0], WOOD, undefined, 20);
        s.cylinder(0.24, 0.24, 0.045, [0, 0, 0], { team: 'primary', tex: 'cloth' }, undefined, 20);
        s.sphere([0.07, 0.04, 0.07], [0, 0.03, 0], IRON);
      });
    }, 0.75);
  },
};

const lynx: MeadowUnit = {
  id: 'lynx',
  name: 'Lynx Lancer',
  description: 'A lancer riding a great lynx, crystal-tipped lance couched. Fast and fierce, but eats like a horse.',
  mass: 320,
  physique: { muscle: 0.6, frame: 0.28, reserve: 0.12 },
  attack: { style: 'strike', crystalMass: 5 },
  refinement: 1.5,
  model(b, p) {
    const fur: Mat = { color: '#b48a55', tex: 'fur' };
    const belly: Mat = { color: '#e3cfa8', tex: 'fur' };
    const dark: Mat = { color: '#2a2018', tex: 'fur' };
    const lunge = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase / 0.6) * Math.PI) * 0.2 : 0;
    const bob = quadLegs(b, p, { fx: 0.62, bx: -0.58, z: 0.2, hip: 0.95, len: 0.95, r: 0.09, mat: fur, paw: fur });
    b.joint([lunge, bob, 0], [0, 0, 0], (c) => {
      c.sphere([0.85, 0.36, 0.33], [0, 1.05, 0], fur);
      c.sphere([0.55, 0.2, 0.24], [0.05, 0.86, 0], belly);
      c.sphere([0.38, 0.38, 0.34], [0.6, 1.12, 0], fur);
      c.sphere([0.36, 0.36, 0.33], [-0.55, 1.08, 0], fur);
      c.joint([1.02, 1.42, 0], [0, 0, p.anim === 'attack' ? -0.2 : 0], (h) => {
        h.sphere([0.24, 0.22, 0.24], [0, 0, 0], fur);
        h.sphere([0.13, 0.1, 0.15], [0.19, -0.06, 0], belly);
        h.sphere(0.035, [0.31, -0.03, 0], dark);
        for (const z of [0.12, -0.12]) {
          h.cone(0.06, 0.16, [-0.02, 0.24, z], fur, [z > 0 ? 0.25 : -0.25, 0, 0], 8);
          h.limb([-0.02, 0.32, z * 1.1], [-0.02, 0.42, z * 1.2], 0.012, dark); // ear tufts
          h.sphere([0.06, 0.08, 0.04], [0.1, -0.12, z * 1.3], belly); // cheek ruff
        }
      });
      c.limb([-0.85, 1.15, 0], [-1.05, 1.02, 0], 0.07, fur, 0.06);
      c.sphere(0.07, [-1.08, 1.0, 0], dark);
      // saddle + barding
      c.box([0.6, 0.08, 0.7], [-0.05, 1.38, 0], { team: 'primary', tex: 'cloth' });
      c.box([0.45, 0.12, 0.45], [-0.05, 1.45, 0], LEATHER);
      // rider (hip sits on the saddle)
      c.joint([-0.08, 1.5 - 0.9 * 0.9, 0], [0, 0, 0], (r) => {
        const look: HumanLook = {
          skin: '#c99a76', hair: '#3a2a1c', head: 'helmet', scale: 0.9, mounted: true, tabard: true, pads: true,
          tunic: IRON, trousers: { color: '#4a4038', tex: 'cloth' }, boots: LEATHER,
        };
        human(r, { ...p, anim: p.anim === 'walk' ? 'idle' : p.anim }, look, armAngle(p, 'lance'), (h) => {
          const thrust = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase / 0.6) * Math.PI) * 0.35 : 0;
          h.limb([-0.6 + thrust, 0, 0], [1.9 + thrust, 0, 0], 0.03, WOOD, 0.022);
          h.cone(0.06, 0.12, [-0.05 + thrust, 0, 0], IRON, [0, 0, -Math.PI / 2], 10);
          if (p.armed) h.crystal(0.36, [1.88 + thrust, 0, 0], [0, 0, -Math.PI / 2]);
        });
      });
    });
  },
};

const hurlhorn: MeadowUnit = {
  id: 'hurlhorn',
  name: 'Hurlhorn',
  description: 'A shaggy war-beast carrying a throwing-arm on its back. Lobs 12 kg crystals across the field. Helpless up close.',
  mass: 700,
  physique: { muscle: 0.55, frame: 0.3, reserve: 0.15 },
  attack: { style: 'throw', crystalMass: 12, ammo: 4 },
  refinement: 2.4,
  model(b, p) {
    const wool: Mat = { color: '#5b4330', tex: 'fur' };
    const woolLight: Mat = { color: '#7a5d40', tex: 'fur' };
    const horn: Mat = { color: '#d9ccb0', tex: 'stone', rough: 0.5 };
    const bob = quadLegs(b, p, { fx: 0.8, bx: -0.85, z: 0.38, hip: 1.25, len: 1.25, r: 0.17, mat: wool, paw: { color: '#2d241c', tex: 'leather' } });
    b.joint([0, bob, 0], [0, 0, 0], (c) => {
      c.sphere([1.3, 0.75, 0.7], [0, 1.65, 0], wool);
      c.sphere([0.7, 0.6, 0.62], [0.65, 1.85, 0], woolLight); // hump
      c.sphere([1.0, 0.45, 0.6], [0, 1.25, 0], wool); // shaggy skirt
      c.joint([1.45, 1.6, 0], [0, 0, p.anim === 'tired' ? -0.4 : p.anim === 'gather' ? -0.5 : 0], (h) => {
        h.sphere([0.45, 0.38, 0.38], [0, 0, 0], wool);
        h.sphere([0.22, 0.2, 0.24], [0.36, -0.12, 0], { color: '#3a2c20', tex: 'leather' });
        h.sphere([0.2, 0.28, 0.25], [0.15, -0.35, 0], woolLight); // beard
        for (const z of [1, -1]) {
          const a: [number, number, number] = [0.05, 0.22, 0.28 * z];
          const m: [number, number, number] = [0.15, 0.42, 0.62 * z];
          const e: [number, number, number] = [0.45, 0.48, 0.78 * z];
          h.limb(a, m, 0.09, horn, 0.07);
          h.limb(m, e, 0.07, horn, 0.025);
          h.sphere(0.04, [0.3, 0.05, 0.3 * z], { color: '#111111', rough: 0.2 });
        }
      });
      c.limb([-1.25, 1.75, 0], [-1.5, 1.35, 0], 0.08, wool, 0.05);
      // saddle blanket + throwing frame
      c.box([1.1, 0.1, 1.3], [-0.1, 2.3, 0], { team: 'primary', tex: 'cloth' });
      c.box([1.15, 0.04, 1.35], [-0.1, 2.25, 0], { team: 'secondary', tex: 'cloth' });
      for (const z of [0.42, -0.42]) {
        c.limb([-0.5, 2.35, z], [-0.05, 3.15, z * 0.6], 0.06, WOOD);
        c.limb([0.4, 2.35, z], [-0.05, 3.15, z * 0.6], 0.06, WOOD);
      }
      c.limb([-0.05, 3.15, 0.3], [-0.05, 3.15, -0.3], 0.05, WOOD);
      // the arm: rests pointing back-down, flings forward-up on attack
      let arm = -2.3;
      if (p.anim === 'attack') arm = p.phase < 0.4 ? -2.3 - p.phase * 0.5 : p.phase < 0.6 ? -2.5 + ((p.phase - 0.4) / 0.2) * 3.4 : 0.9 - ((p.phase - 0.6) / 0.4) * 3.2;
      const tip = swing([-0.05, 3.15, 0], 1.5, Math.PI + arm);
      c.limb([-0.05, 3.15, 0], tip, 0.055, WOOD, 0.04);
      c.cylinder(0.14, 0.09, 0.08, [tip[0], tip[1] + 0.02, tip[2]], LEATHER);
      if (p.armed && !(p.anim === 'attack' && p.phase > 0.55 && p.phase < 0.95)) c.crystal(0.38, [tip[0], tip[1] + 0.05, tip[2]], [0.3, 0, 0.4]);
    });
  },
};

const mule: MeadowUnit = {
  id: 'mule',
  name: 'Mule Cart',
  description: 'A patient mule hauling a two-wheeled cart. Keeps outlying buildings stocked from the town center.',
  mass: 140,
  physique: { muscle: 0.55, frame: 0.3, reserve: 0.15 },
  wheeled: true,
  canGather: false,
  role: 'carter',
  model(b, p) {
    const hide: Mat = { color: '#7a6450', tex: 'fur' };
    const dark: Mat = { color: '#3a2e24', tex: 'fur' };
    const bob = quadLegs(b, p, { fx: 0.95, bx: 0.35, z: 0.16, hip: 0.85, len: 0.85, r: 0.07, mat: hide, paw: dark });
    b.joint([0, bob, 0], [0, 0, 0], (m) => {
      m.sphere([0.5, 0.28, 0.25], [0.65, 0.95, 0], hide);
      m.limb([1.05, 1.05, 0], [1.3, 1.35, 0], 0.11, hide, 0.09);
      m.sphere([0.2, 0.12, 0.12], [1.42, 1.3, 0], hide);
      for (const z of [0.07, -0.07]) m.limb([1.28, 1.42, z], [1.22, 1.68, z * 1.6], 0.035, hide, 0.02);
      m.limb([0.15, 1.0, 0], [0.05, 0.75, 0], 0.03, dark);
      m.box([0.3, 0.12, 0.55], [0.6, 1.2, 0], { team: 'primary', tex: 'cloth' });
    });
    // shafts and cart
    for (const z of [0.3, -0.3]) b.limb([0.55, 0.85, z], [-0.35, 0.7, z], 0.035, WOOD);
    b.box([1.2, 0.08, 0.95], [-0.95, 0.72, 0], WOOD);
    for (const z of [0.47, -0.47]) b.box([1.2, 0.35, 0.05], [-0.95, 0.92, z], WOOD);
    b.box([0.05, 0.35, 0.95], [-1.55, 0.92, 0], WOOD);
    // wheels roll about the axle (z); spokes make the roll visible
    const roll = p.anim === 'walk' ? -p.phase * Math.PI * 2 : 0;
    for (const z of [0.55, -0.55]) {
      b.joint([-0.95, 0.42, z], [0, 0, roll], (wh) => {
        wh.cylinder(0.42, 0.42, 0.05, [0, 0, 0], WOOD, [Math.PI / 2, 0, 0], 16);
        wh.cylinder(0.36, 0.36, 0.06, [0, 0, 0], { color: '#3d2a1a', tex: 'wood' }, [Math.PI / 2, 0, 0], 16);
        for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) wh.box([0.7, 0.05, 0.075], [0, 0, 0], WOOD, [0, 0, a]);
        wh.cylinder(0.08, 0.08, 0.1, [0, 0, 0], DARK_IRON, [Math.PI / 2, 0, 0], 8);
      });
    }
    if (p.cargo === 'food') for (let i = 0; i < 3; i++) b.cylinder(0.18, 0.15, 0.3, [-0.6 - i * 0.35, 0.92, (i % 2) * 0.15], { color: '#a5814f', tex: 'thatch' });
    else if (p.cargo === 'crystal') for (let i = 0; i < 4; i++) b.crystal(0.35, [-0.6 - (i % 2) * 0.5, 0.78, i < 2 ? 0.2 : -0.2], [0.3 * i, 0, 0.4]);
    else if (p.cargo === 'wood') for (let i = 0; i < 4; i++) b.limb([-0.45, 0.86 + (i >> 1) * 0.14, -0.3 + (i % 2) * 0.3 + 0.15], [-1.5, 0.86 + (i >> 1) * 0.14, -0.3 + (i % 2) * 0.3 + 0.15], 0.07, { color: '#6b4a2e', tex: 'wood' });
  },
};
const DARK_IRON: Mat = { color: '#3a3a3a', tex: 'metal' };

// ── Buildings. Capital = materials; links count prerequisites at 100%.
//    barracks 300 → forge 800 / den 900 → great hall 900 + 500 + 600 + 300 = 2,300
export const buildings: MeadowBuilding[] = [
  {
    id: 'town-center', name: 'Town Center', description: 'Trains villagers and mule carts. Always keeps at least 3 carts, which load here and supply whichever building is shortest; train more for faster logistics.',
    size: 3, materials: 1350, trains: ['villager', 'mule'], researches: ['villager-tools'], carters: 3, unbuildable: true, model: models.townCenter,
  },
  {
    id: 'barracks', name: 'Barracks', description: 'Trains slingers and crystal macemen.',
    size: 3, materials: 300, trains: ['slinger', 'maceman'], model: models.barracks,
  },
  {
    id: 'forge', name: 'Crystal Forge', description: 'Researches better slings, mail and lynx breeding.',
    size: 2, materials: 500, requires: ['barracks'], researches: ['sling-drills', 'mail-hardening', 'lynx-breeding'], model: models.forge,
  },
  {
    id: 'lynx-den', name: 'Lynx Den', description: 'Raises and trains lynx lancers.',
    size: 3, materials: 600, requires: ['barracks'], trains: ['lynx'], model: models.lynxDen,
  },
  {
    id: 'great-hall', name: 'Great Hall', description: 'The top of the tree. Its capital (with everything beneath it) supports the refined Hurlhorn.',
    size: 4, materials: 900, requires: ['forge', 'lynx-den'], trains: ['hurlhorn'], model: models.greatHall,
  },
  {
    id: 'gathering-camp', name: 'Gathering Camp', description: 'A drop-off shed that speeds up gathering nearby (by its capital) and keeps sowing berry bushes and trees around it from its own seed stock.',
    size: 2, materials: 250, gatherBoost: { radius: 6, resources: ['food', 'wood', 'crystal'] },
    sow: { mechanism: 60, radius: 5, resources: ['food', 'wood'] }, model: models.gatheringCamp,
  },
  {
    id: 'watchtower', name: 'Watchtower', description: 'A throwing arm on stilts. Height adds energy and range; it throws crystals from its own stock.',
    size: 1, materials: 150, attack: { mechanism: 20, crystalMass: 0.5, height: 4 }, model: models.watchtower,
  },
];

const techs: TechSpec[] = [
  { id: 'villager-tools', name: 'Better Tools', description: 'Villagers gather and walk 30% faster (work refinement +0.3).', unit: 'villager', refinement: 0.3, channel: 'work' },
  { id: 'sling-drills', name: 'Sling Drills', description: 'Slingers +0.4 refinement.', unit: 'slinger', refinement: 0.4 },
  { id: 'mail-hardening', name: 'Hardened Mail', description: 'Crystal Macemen +0.4 refinement.', unit: 'maceman', refinement: 0.4 },
  { id: 'lynx-breeding', name: 'Lynx Breeding', description: 'Lynx Lancers +0.3 refinement.', unit: 'lynx', refinement: 0.3 },
];

export const units: MeadowUnit[] = [villager, slinger, maceman, lynx, hurlhorn, mule];

export const meadowfolk: FactionSpec = {
  id: 'meadowfolk',
  name: 'The Meadowfolk',
  workerId: 'villager',
  carterId: 'mule',
  townCenterId: 'town-center',
  units,
  buildings,
  techs,
  resourceNames: { food: 'Berries', wood: 'Wood', crystal: 'Crystal' },
  // loaded lazily so the 3D tooling only arrives when art is needed
  art: (team, onProgress) => import('./art').then((m) => m.bakeArt(team, onProgress)),
};
