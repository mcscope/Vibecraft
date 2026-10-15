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
import { fenWildlife } from './wildlife';
import { fenArm, fenLoad, fenling as body, type FenLook } from './rig';
import * as models from './buildings';

export type FenUnit = UnitSpec & { model: UnitModel };
export type FenBuilding = BuildingSpec & { model: BuildingModel };

const HIDE: Mat = { color: '#6a5a3e', tex: 'leather' };
const REED: Mat = { color: '#b8a466', tex: 'thatch' };
const WILLOW: Mat = { color: '#6a5a3c', tex: 'wood' };

const fenLook: FenLook = { skin: '#7aa05a', wrap: { color: '#7a6a44', tex: 'cloth' }, hat: 'cone' };
const fenling: FenUnit = {
  id: 'fenling',
  name: 'Fenling',
  description: 'Small, tireless marsh folk. Every fenling gathers, builds and slings crystal stones; alone they are frail, together a flood.',
  mass: 32,
  physique: { muscle: 0.5, frame: 0.22, reserve: 0.28 },
  attack: { style: 'throw', crystalMass: 1, ammo: 3 },
  workRefinement: 1.4, // nimble: gathers, wades and carries 40% more
  gait: { hop: 0.76, period: 0.7 }, // quick little bounds (the rig's hop is airborne 0.16–0.92)
  model(b, p) {
    body(b, p, fenLook, fenArm(p, 'sling'), (h) => {
      // a sling: two cords with a pouch
      h.limb([0, 0, 0], [0.02, -0.28, 0.03], 0.006, HIDE);
      if (p.armed && !(p.anim === 'attack' && p.phase > 0.6)) h.crystal(0.06, [0.02, -0.3, 0.03], [0, 0, 0]);
    });
    fenLoad(b, p);
  },
};

const guardLook: FenLook = { skin: '#6a8a52', wrap: { color: '#5a4a30', tex: 'leather' }, hat: 'crest', bulk: 1.2 };
const reedguard: FenUnit = {
  id: 'reedguard',
  name: 'Reedguard',
  description: 'A stout fenling behind a woven reed shield, jabbing with a crystal-tipped pole. Cheap, sturdy, and in the way.',
  mass: 38,
  physique: { muscle: 0.35, frame: 0.55, reserve: 0.1 },
  attack: { style: 'strike', crystalMass: 1 },
  gait: { hop: 0.76, period: 0.85 }, // heavier bounds behind the shield
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
const riderLook: FenLook = { skin: '#7aa05a', wrap: { color: '#5a4a30', tex: 'leather' }, hat: 'crest', mounted: true };
const bogToad: FenUnit = {
  id: 'bog-toad',
  name: 'Bog Toad',
  description: 'A huge marsh toad with a fenling on its back. Lunges and slams with its crystal-studded jaw: brutal up close.',
  mass: 150,
  physique: { muscle: 0.55, frame: 0.3, reserve: 0.15 },
  attack: { style: 'strike', crystalMass: 2.5 },
  refinement: 1.3,
  gait: { hop: 0.5, period: 1.1 }, // great lumbering leaps: airborne 1/3–5/6 of each stride
  model(b, p) {
    const ph = p.phase;
    const hop = p.anim === 'walk' && ph > 1 / 3 && ph < 5 / 6 ? Math.sin(((ph - 1 / 3) / 0.5) * Math.PI) * 0.32 : 0;
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

const IRON: Mat = { color: '#6a6860', tex: 'metal', metal: 0.35, rough: 0.5 };
const BRASS: Mat = { color: '#c0913c', tex: 'metal', metal: 0.45, rough: 0.35 };
const BONE: Mat = { color: '#d2c6a4', rough: 0.6 };
const WAX: Mat = { color: '#7a1612', rough: 0.3 };
const PARCHMENT: Mat = { color: '#d8c8a0', tex: 'cloth' };
const CHAIN: Mat = { color: '#2a2824', tex: 'metal', metal: 0.8 };
const hide: Mat = { color: '#6e6c4c', tex: 'leather' };
const packTortoise: FenUnit = {
  id: 'pack-tortoise',
  name: 'Pack Tortoise',
  description: 'An ancient war-tortoise in bolted iron, a crystal reliquary chained to its back. Fenlings that run dry come to it for more, like crystals on the ground.',
  mass: 160,
  physique: { muscle: 0.6, frame: 0.3, reserve: 0.1 },
  refinement: 1.5,
  bearer: { radius: 4 }, // gathers crystal only (spent ones off the ground, or from a deposit) and keeps it
  model(b, p) {
    const t = p.phase * Math.PI * 2;
    const walking = p.anim === 'walk';
    const glow = { color: '#9fefff', emissive: '#3ab8e0' };
    // four pillar legs in iron greaves, clawed
    for (const [x, z, ph] of [[0.48, 0.42, 0], [0.48, -0.42, Math.PI], [-0.48, 0.42, Math.PI], [-0.48, -0.42, 0]] as Array<[number, number, number]>) {
      const a = walking ? Math.sin(t + ph) * 0.3 : 0;
      const foot: [number, number, number] = [x + Math.sin(a) * 0.18, 0.06 + (walking ? Math.max(0, Math.sin(t + ph)) * 0.06 : 0), z * 1.18];
      b.limb([x, 0.42, z], foot, 0.14, hide, 0.12);
      b.cylinder(0.15, 0.17, 0.2, [(x + foot[0]) / 2, 0.24, (z + foot[2]) / 2], IRON, undefined, 8); // greave
      b.cylinder(0.16, 0.16, 0.03, [(x + foot[0]) / 2, 0.35, (z + foot[2]) / 2], BRASS, undefined, 8);
      for (const c of [-0.06, 0, 0.06]) b.cone(0.03, 0.1, [foot[0] + 0.12, foot[1], foot[2] + c], BONE, [0, 0, -Math.PI / 2], 5); // claws
    }
    const bob = walking ? Math.abs(Math.sin(t)) * 0.03 : 0;
    b.joint([0, bob, 0], [0, 0, 0], (c) => {
      c.sphere([0.78, 0.3, 0.62], [0, 0.48, 0], hide); // belly
      c.sphere([0.86, 0.46, 0.7], [0, 0.6, 0], IRON); // the carapace, plated in iron
      // overlapping brass-edged plates around the rim, riveted
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const x = Math.cos(a) * 0.82, z = Math.sin(a) * 0.66;
        c.box([0.26, 0.2, 0.05], [x, 0.55, z], i % 2 ? IRON : BRASS, [0, -a + Math.PI / 2, -0.35]);
        c.sphere(0.025, [x * 1.03, 0.64, z * 1.03], BRASS);
      }
      // a ridge of spikes down the spine and out along the flanks
      for (let i = 0; i < 5; i++) c.cone(0.06, 0.24, [0.45 - i * 0.22, 1.02 - Math.abs(i - 2) * 0.03, 0], IRON, undefined, 6);
      for (const zs of [1, -1]) for (let i = 0; i < 4; i++) c.cone(0.045, 0.2, [0.4 - i * 0.27, 0.78, 0.55 * zs], IRON, [zs * 0.9, 0, 0], 6);
      // armoured head: a plated helm, tusks, burning eyes, a bridle chain
      c.joint([0.88, 0.5, 0], [0, 0, p.anim === 'eat' ? -0.4 : 0], (h) => {
        h.limb([-0.1, 0, 0], [0.22, 0.04, 0], 0.14, hide, 0.12);
        h.sphere([0.2, 0.15, 0.17], [0.3, 0.06, 0], hide);
        h.box([0.26, 0.08, 0.3], [0.3, 0.18, 0], IRON, [0, 0, -0.12]); // helm
        h.box([0.08, 0.16, 0.34], [0.43, 0.1, 0], BRASS, [0, 0, -0.2]); // brow guard
        h.cone(0.04, 0.16, [0.3, 0.3, 0], IRON, undefined, 5); // helm spike
        for (const z of [1, -1]) {
          h.sphere(0.035, [0.44, 0.08, 0.1 * z], { color: '#ffb040', emissive: '#c05010' }); // eyes
          h.limb([0.45, -0.04, 0.09 * z], [0.6, 0.1, 0.16 * z], 0.03, BONE, 0.008); // tusks
        }
        h.limb([0.42, -0.02, 0.16], [0.1, -0.12, 0.3], 0.012, CHAIN);
        h.limb([0.42, -0.02, -0.16], [0.1, -0.12, -0.3], 0.012, CHAIN);
      });
      // trophies: frog skulls on chains across the front of the shell
      for (const z of [-0.3, 0, 0.3]) {
        c.limb([0.74, 0.8, z], [0.82, 0.58, z], 0.008, CHAIN);
        c.sphere([0.06, 0.05, 0.07], [0.83, 0.54, z], BONE);
        for (const e of [1, -1]) c.sphere(0.015, [0.88, 0.56, z + 0.025 * e], { color: '#1a1410' });
      }
      // ammo hoppers slung on both flanks: iron drums bristling with crystal
      for (const zs of [1, -1]) {
        c.cylinder(0.17, 0.17, 0.5, [-0.12, 0.62, 0.72 * zs], IRON, [0, 0, Math.PI / 2], 10);
        for (const x of [-0.34, 0.1]) c.cylinder(0.18, 0.18, 0.04, [x, 0.62, 0.72 * zs], BRASS, [0, 0, Math.PI / 2], 10);
        for (let i = 0; i < 3; i++) c.crystal(0.14, [-0.24 + i * 0.12, 0.8, 0.72 * zs], [0.3 * zs, 0, 0.3 - i * 0.3]);
        c.limb([-0.12, 0.8, 0.72 * zs], [-0.12, 0.98, 0.4 * zs], 0.012, CHAIN);
      }
      // purity seals: red wax and parchment strips on the shell
      for (const [x, z] of [[0.3, 0.5], [-0.35, -0.48], [0.05, -0.6]] as Array<[number, number]>) {
        c.sphere([0.07, 0.02, 0.07], [x, 0.86, z], WAX, [z > 0 ? 0.6 : -0.6, 0, 0]);
        c.box([0.06, 0.22, 0.012], [x, 0.74, z * 1.12], PARCHMENT, [z > 0 ? 0.35 : -0.35, 0, 0]);
      }
      // the reliquary: a gothic shrine on the back, a great crystal burning inside
      c.joint([-0.08, 1.02, 0], [0, 0, 0], (r) => {
        r.box([0.5, 0.1, 0.5], [0, 0, 0], BRASS);
        r.box([0.42, 0.06, 0.42], [0, 0.07, 0], IRON);
        for (const [x, z] of [[0.18, 0.18], [0.18, -0.18], [-0.18, 0.18], [-0.18, -0.18]]) {
          r.cylinder(0.03, 0.035, 0.46, [x, 0.33, z], IRON, undefined, 6);
          r.cone(0.04, 0.14, [x, 0.63, z], BRASS, undefined, 4); // pinnacles
        }
        r.crystal(0.42, [0, 0.12, 0], [0, 0.4, 0]); // the relic
        r.sphere(0.1, [0, 0.33, 0], glow);
        r.roof([0.48, 0.24, 0.48], [0, 0.56, 0], IRON);
        r.cone(0.05, 0.34, [0, 0.95, 0], BRASS, undefined, 4); // spire
        r.sphere(0.04, [0, 1.13, 0], glow);
      });
      // war banners on poles at the back: team colours, trimmed
      for (const zs of [1, -1]) {
        c.cylinder(0.018, 0.022, 1.2, [-0.7, 1.15, 0.28 * zs], IRON, undefined, 6);
        c.limb([-0.7, 1.68, 0.28 * zs], [-0.7, 1.68, 0.28 * zs + 0.001], 0.03, BRASS);
        c.box([0.03, 0.12, 0.34], [-0.7, 1.66, 0.28 * zs], BRASS);
        const sway = walking ? Math.sin(t + zs) * 0.08 : 0;
        c.box([0.025, 0.48, 0.3], [-0.72, 1.36, 0.28 * zs], { team: 'primary', tex: 'cloth' }, [sway, 0, 0]);
        c.box([0.027, 0.06, 0.3], [-0.72, 1.14, 0.28 * zs], { team: 'secondary', tex: 'cloth' }, [sway, 0, 0]);
        c.cone(0.03, 0.12, [-0.7, 1.8, 0.28 * zs], BRASS, undefined, 4);
      }
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
    id: 'canal', name: 'Canal', description: 'A dug channel of fen water: nothing walks through it. Cheap; shift-click to dig a line of them.',
    size: 1, materials: 12, wall: true, model: models.canal,
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
  biome: (onProgress) => import('./homeworld').then((m) => m.bakeHomeworld(onProgress)),
  wildlife: fenWildlife,
};
