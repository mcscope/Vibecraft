// THE FENFOLK — a marsh swarm that wins on numbers, reach and food.
//   Strengths, and what each costs:
//   • production everywhere: cheap reed huts are drop-offs AND train fenlings
//     right at the resources (so: no carts; lots of small buildings to defend)
//   • every fenling gathers, builds and fights; tireless (big reserves) but frail
//   • the cheapest bodies in the game once their lore is learned (Fen Lore to 2.5×)
//     — all of it taught in one precious Elder Mound
//   • master farmers: peat farms sow big, fast-growing plots
//   • bog toads: the hardest-hitting mount for the price, but short-reached
//   • the heron perch: the tallest tower — long reach, a wide blind spot under it
// Self-contained: only engine types and kits, never another faction.
import type { BuildingSpec, FactionSpec, TechSpec, UnitSpec } from '../types';
import type { BuildingModel, Mat, UnitModel } from '../../kits/bake3d/types';
import { fenWildlife } from '../../biomes/meadow/wildlife';
import { fenArm, fenLoad, fenling as body, type FenLook } from './rig';
import * as models from './buildings';

export type FenUnit = UnitSpec & { model: UnitModel };
export type FenBuilding = BuildingSpec & { model: BuildingModel };

const HIDE: Mat = { color: '#6a5a3e', tex: 'leather' };
const REED: Mat = { color: '#b8a466', tex: 'thatch' };
const WILLOW: Mat = { color: '#6a5a3c', tex: 'wood' };

const fenLook: FenLook = { skin: '#9aa874', wrap: { color: '#5e5a3a', tex: 'cloth' }, hat: 'cone' };
const fenling: FenUnit = {
  id: 'fenling',
  name: 'Fenling',
  description: 'Small, tireless marsh folk. Every fenling gathers, builds and slings crystal stones; alone they are frail, together a flood.',
  mass: 32,
  physique: { muscle: 0.5, frame: 0.22, reserve: 0.28 },
  attack: { style: 'throw', crystalMass: 1, ammo: 3 },
  workRefinement: 1.4, // nimble: gathers, wades and carries 40% more
  model(b, p) {
    body(b, p, fenLook, fenArm(p, 'sling'), (h) => {
      // a sling: two cords with a pouch
      h.limb([0, 0, 0], [0.02, -0.28, 0.03], 0.006, HIDE);
      if (p.armed && !(p.anim === 'attack' && p.phase > 0.6)) h.crystal(0.06, [0.02, -0.3, 0.03], [0, 0, 0]);
    });
    fenLoad(b, p);
  },
};

const guardLook: FenLook = { skin: '#8a9a64', wrap: { color: '#4a4a30', tex: 'leather' }, hat: 'crest', bulk: 1.2 };
const reedguard: FenUnit = {
  id: 'reedguard',
  name: 'Reedguard',
  description: 'A stout fenling behind a woven reed shield, jabbing with a crystal-tipped pole. Cheap, sturdy, and in the way.',
  mass: 38,
  physique: { muscle: 0.35, frame: 0.55, reserve: 0.1 },
  attack: { style: 'strike', crystalMass: 1 },
  model(b, p) {
    body(b, p, guardLook, fenArm(p, 'jab'), (h) => {
      h.limb([0, 0.35, 0], [0, -0.75, 0], 0.016, WILLOW);
      if (p.armed) h.crystal(0.12, [0, -0.8, 0], [0, 0, Math.PI]);
    }, (s) => {
      s.joint([0.04, -0.05, 0.05], [Math.PI / 2, 0, 0.1], (sh) => {
        sh.cylinder(0.24, 0.24, 0.04, [0, 0, 0], REED, undefined, 14);
        sh.cylinder(0.12, 0.12, 0.045, [0, 0, 0], { team: 'primary', tex: 'cloth' }, undefined, 14);
      });
    });
  },
};

const toadSkin: Mat = { color: '#5e6e3a', tex: 'leather' };
const toadBelly: Mat = { color: '#c8b87a', tex: 'leather' };
const riderLook: FenLook = { skin: '#9aa874', wrap: { color: '#4a4a30', tex: 'leather' }, hat: 'crest', mounted: true };
const bogToad: FenUnit = {
  id: 'bog-toad',
  name: 'Bog Toad',
  description: 'A huge marsh toad with a fenling on its back. Lunges and slams with its crystal-studded jaw: brutal up close.',
  mass: 150,
  physique: { muscle: 0.55, frame: 0.3, reserve: 0.15 },
  attack: { style: 'strike', crystalMass: 2.5 },
  refinement: 1.3,
  model(b, p) {
    const t = p.phase * Math.PI * 2;
    const hop = p.anim === 'walk' ? Math.max(0, Math.sin(t)) * 0.25 : 0;
    const lunge = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase * 1.3) * Math.PI) * 0.45 : 0;
    // haunches and forelegs
    for (const z of [1, -1]) {
      b.sphere([0.32, 0.28, 0.24], [-0.35, 0.3 + hop * 0.4, 0.42 * z], toadSkin);
      b.limb([-0.1, 0.12, 0.6 * z], [-0.55, 0.05, 0.72 * z], 0.07, toadSkin, 0.05);
      b.limb([0.4 + lunge * 0.3, 0.45 + hop, 0.3 * z], [0.55 + lunge * 0.5, 0.05, 0.4 * z], 0.07, toadSkin, 0.06);
    }
    b.joint([lunge, hop, 0], [0, 0, -lunge * 0.3], (c) => {
      c.sphere([0.75, 0.48, 0.62], [0, 0.6, 0], toadSkin);
      c.sphere([0.6, 0.3, 0.5], [0.05, 0.4, 0], toadBelly);
      for (const [x, z] of [[-0.2, 0.3], [0.1, -0.35], [-0.4, -0.1], [0.25, 0.15]]) c.sphere(0.07, [x, 0.98, z], { color: '#4a5a2e', tex: 'leather' }); // warts
      c.sphere([0.36, 0.26, 0.44], [0.62, 0.7, 0], toadSkin); // head
      for (const z of [1, -1]) c.sphere([0.1, 0.1, 0.1], [0.7, 0.92, 0.22 * z], { color: '#d8b84a', rough: 0.3 }); // eyes
      c.box([0.05, 0.05, 0.6], [0.92, 0.6, 0], { color: '#3a2a20' }); // mouth line
      if (p.armed) c.crystal(0.18, [0.95, 0.75, 0], [0, 0, -1.2]); // crystal-studded jaw
      c.box([0.4, 0.05, 0.5], [-0.05, 1.08, 0], { team: 'primary', tex: 'cloth' });
      c.joint([-0.05, 0.6, 0], [0, 0, 0], (r) => body(r, { ...p, anim: p.anim === 'walk' ? 'idle' : p.anim }, riderLook, fenArm(p, 'jab') * 0.6, (h) => {
        h.limb([0, 0.2, 0], [0, -0.5, 0], 0.014, WILLOW);
      }), 0.9);
    });
  },
};

const shell: Mat = { color: '#5a5a3a', tex: 'stone' };
const tortSkin: Mat = { color: '#7a7a54', tex: 'leather' };
const packTortoise: FenUnit = {
  id: 'pack-tortoise',
  name: 'Pack Tortoise',
  description: 'A great marsh tortoise with baskets of crystal lashed to its shell. Fenlings that run dry come to it for more, like crystals on the ground.',
  mass: 160,
  physique: { muscle: 0.6, frame: 0.3, reserve: 0.1 },
  canGather: false,
  refinement: 1.5,
  bearer: { radius: 4 },
  model(b, p) {
    const t = p.phase * Math.PI * 2;
    const walking = p.anim === 'walk';
    for (const [x, z, ph] of [[0.45, 0.4, 0], [0.45, -0.4, Math.PI], [-0.45, 0.4, Math.PI], [-0.45, -0.4, 0]] as Array<[number, number, number]>) {
      const a = walking ? Math.sin(t + ph) * 0.35 : 0;
      b.limb([x, 0.35, z], [x + Math.sin(a) * 0.2, 0.05, z * 1.15], 0.1, tortSkin, 0.09);
    }
    const bob = walking ? Math.abs(Math.sin(t)) * 0.03 : 0;
    b.joint([0, bob, 0], [0, 0, 0], (c) => {
      c.sphere([0.8, 0.45, 0.65], [0, 0.55, 0], shell); // domed shell
      for (let i = 0; i < 6; i++) c.sphere([0.18, 0.06, 0.18], [Math.cos(i) * 0.35, 0.95, Math.sin(i) * 0.3], { color: '#4a4a30', tex: 'stone' });
      c.joint([0.82, 0.45, 0], [0, 0, p.anim === 'eat' ? -0.4 : 0], (h) => {
        h.limb([0, 0, 0], [0.25, 0.05, 0], 0.11, tortSkin, 0.09);
        h.sphere([0.17, 0.13, 0.14], [0.32, 0.06, 0], tortSkin);
        for (const z of [1, -1]) h.sphere(0.025, [0.42, 0.12, 0.08 * z], { color: '#1e1610' });
      });
      // baskets of crystal on both flanks, and a team cloth over the top
      for (const z of [0.55, -0.55]) {
        c.cylinder(0.22, 0.18, 0.32, [-0.05, 0.75, z], { color: '#8a7448', tex: 'thatch' }, undefined, 10);
        for (let i = 0; i < 3; i++) c.crystal(0.16, [-0.1 + i * 0.06, 0.95, z + (i - 1) * 0.05], [0.3 * i, 0, 0.4]);
      }
      c.box([0.6, 0.04, 1.0], [-0.05, 1.0, 0], { team: 'primary', tex: 'cloth' });
    });
  },
};

export const units: FenUnit[] = [fenling, reedguard, bogToad, packTortoise];

// ── Buildings (capital curve K = 720). Cheap and many, except the Elder Mound.
export const buildings: FenBuilding[] = [
  {
    id: 'stilt-hall', name: 'Stilt Hall', description: 'The fen\'s first hall. Raises fenlings; there are no carts in the fen: every reed hut is its own little base.',
    size: 3, materials: 500, trains: ['fenling'], researches: ['long-breath'], unbuildable: true, model: models.stiltHall,
  },
  {
    id: 'reed-hut', name: 'Reed Hut', description: 'A one-tile hut on stilts: drop-off, and raises fenlings and reedguards right where they\'re needed.',
    size: 1, materials: 60, requires: ['stilt-hall'], trains: ['fenling', 'reedguard'], model: models.reedHut,
  },
  {
    id: 'peat-farm', name: 'Peat Farm', description: 'Raised peat beds: food gathered nearby comes faster, and it keeps big, quick plots growing from its own seed.',
    size: 2, materials: 120, gatherBoost: { radius: 5, resources: ['food'] },
    sow: { mechanism: 80, radius: 5, resources: ['food'], plantKg: { food: 300 }, maxPlants: { food: 10 } }, model: models.peatFarm,
  },
  {
    id: 'toad-wallow', name: 'Toad Wallow', description: 'A pool ringed with reeds where bog toads are raised and saddled, and pack tortoises are loaded.',
    size: 2, materials: 220, requires: ['reed-hut'], trains: ['bog-toad', 'pack-tortoise'], model: models.toadWallow,
  },
  {
    id: 'elder-mound', name: 'Elder Mound', description: 'Where the fen\'s lore is kept and taught: every deep technology is learned here, and only here.',
    size: 3, materials: 700, requires: ['reed-hut'], researches: ['fen-lore', 'fen-lore-2', 'fen-lore-3', 'reed-lore', 'toad-lore'], model: models.elderMound,
  },
  {
    id: 'heron-perch', name: 'Heron Perch', description: 'A spindly platform on very tall stilts with a sling-arm on top: reaches far, but can\'t hit the ground right beneath it.',
    size: 1, materials: 90, attack: { mechanism: 25, crystalMass: 0.4, height: 8, stockShots: 40 }, model: models.heronPerch,
  },
];

const techs: TechSpec[] = [
  { id: 'long-breath', name: 'Long Breath', description: 'Fenlings work, wade and carry 30% more (work refinement +0.3).', unit: 'fenling', refinement: 0.3, channel: 'work' },
  { id: 'fen-lore', name: 'Fen Lore', description: 'Fenlings +0.5 refinement: cheaper to raise.', unit: 'fenling', refinement: 0.5 },
  { id: 'fen-lore-2', name: 'Fen Lore II', description: 'Fenlings +0.5 more.', unit: 'fenling', refinement: 0.5 },
  { id: 'fen-lore-3', name: 'Fen Lore III', description: 'Fenlings +0.5 more: 2.5× in all, about 40% of their first price.', unit: 'fenling', refinement: 0.5 },
  { id: 'reed-lore', name: 'Reed Lore', description: 'Reedguards +0.6 refinement: cheaper to raise.', unit: 'reedguard', refinement: 0.6 },
  { id: 'toad-lore', name: 'Toad Lore', description: 'Bog Toads +0.6 refinement: cheaper to raise.', unit: 'bog-toad', refinement: 0.6 },
];

export const fenfolk: FactionSpec = {
  id: 'fenfolk',
  name: 'The Fenfolk',
  workerId: 'fenling',
  townCenterId: 'stilt-hall',
  units,
  buildings,
  techs,
  resourceNames: { food: 'Roots', wood: 'Reeds', crystal: 'Crystal' },
  art: (team, onProgress) => import('./art').then((m) => m.bakeArt(team, onProgress)),
  // our half of the map: a murky fen, with herons and bog lurkers
  biome: (onProgress) => import('../../biomes/meadow').then((m) => m.bakeMeadow(onProgress, 'fen')),
  wildlife: fenWildlife,
};
