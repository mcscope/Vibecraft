// THE HIGHLAND CLANS — a second faction that makes different choices:
//   • fewer, stronger workers who carry a hatchet (crofters can defend themselves)
//   • small pony carts instead of mules (2 to a hall)
//   • heavy, armoured axemen; javelineers who throw few, heavy javelins
//   • ram riders for cavalry; no siege beast, but a tall stone tower
//   • a woodland lodge that only plants trees and only speeds up woodcutting
// Self-contained: imports only the engine's types and kits, never another faction.
import type { BuildingSpec, FactionSpec, TechSpec, UnitSpec } from '../types';
import type { BuildingModel, Mat, UnitModel } from '../../kits/bake3d/types';
import { highlandWildlife } from './wildlife';
import { armFor, burden, clansman, fourLegs, type ClanLook } from './rig';
import * as models from './buildings';

export type ClanUnit = UnitSpec & { model: UnitModel };
export type ClanBuilding = BuildingSpec & { model: BuildingModel };

const WOOL: Mat = { color: '#6a5a44', tex: 'cloth' };
const LEATHER: Mat = { color: '#4a3424', tex: 'leather' };
const IRON: Mat = { color: '#6a6a6e', tex: 'metal', metal: 0.7 };
const HAFT: Mat = { color: '#5a3e26', tex: 'wood' };

const crofterLook: ClanLook = { skin: '#d8a888', hair: '#8a4a26', coat: WOOL, boots: LEATHER, head: 'bonnet', beard: true, bulk: 1.05 };
const crofter: ClanUnit = {
  id: 'crofter',
  name: 'Crofter',
  description: 'Farms, fells and builds. Stockier than most workers: carries more, and keeps a hatchet handy.',
  mass: 60,
  physique: { muscle: 0.45, frame: 0.35, reserve: 0.2 },
  attack: { style: 'strike', crystalMass: 0.8 },
  model(b, p) {
    clansman(b, p, crofterLook, armFor(p, 'work'), (h) => {
      if (!p.armed) return;
      h.limb([0, 0, 0], [0, -0.35, 0], 0.02, HAFT);
      h.box([0.12, 0.08, 0.02], [0.05, -0.33, 0], IRON);
    });
    burden(b, p);
  },
};

const axeLook: ClanLook = { skin: '#c99a76', hair: '#3a2416', coat: { color: '#5a5a5e', tex: 'metal', metal: 0.4 }, boots: LEATHER, head: 'helm', beard: true, mantle: true, bulk: 1.25, scale: 1.05 };
const axeman: ClanUnit = {
  id: 'axeman',
  name: 'Axeman',
  description: 'A big clansman in mail under a fur mantle, swinging a crystal-bitted two-handed axe.',
  mass: 110,
  physique: { muscle: 0.4, frame: 0.5, reserve: 0.1 },
  attack: { style: 'strike', crystalMass: 4 },
  refinement: 1.2,
  model(b, p) {
    clansman(b, p, axeLook, armFor(p, 'axe'), (h) => {
      if (!p.armed) return;
      h.limb([0, 0.15, 0], [0, -0.75, 0], 0.03, HAFT);
      h.crystal(0.32, [0.12, -0.72, 0], [0, 0, Math.PI / 2]);
      h.box([0.2, 0.18, 0.025], [0.08, -0.7, 0], IRON);
    });
  },
};

const javLook: ClanLook = { skin: '#d8b090', hair: '#c88a3a', coat: { color: '#5e4a34', tex: 'leather' }, boots: LEATHER, head: 'bare', bulk: 0.95 };
const javelineer: ClanUnit = {
  id: 'javelineer',
  name: 'Javelineer',
  description: 'Hurls crystal-tipped javelins: only four to a quiver, but each one lands hard.',
  mass: 55,
  physique: { muscle: 0.5, frame: 0.3, reserve: 0.2 },
  attack: { style: 'throw', crystalMass: 2.5, ammo: 4 },
  model(b, p) {
    clansman(b, p, javLook, armFor(p, 'javelin'), (h) => {
      if (!p.armed || (p.anim === 'attack' && p.phase > 0.6)) return;
      h.limb([0, 0.5, 0], [0, -0.6, 0], 0.018, HAFT);
      h.crystal(0.2, [0, 0.58, 0], [0, 0, 0]);
    }, (h) => {
      if (!p.armed) return;
      for (const z of [0.04, -0.04]) h.limb([-0.05, 0.3, z], [-0.05, -0.45, z], 0.012, HAFT); // spare javelins
    });
  },
};

const fleece: Mat = { color: '#d8d0bc', tex: 'fur' };
const ramHorn: Mat = { color: '#8a7a60', tex: 'stone', rough: 0.6 };
const riderLook: ClanLook = { skin: '#c99a76', hair: '#2a1a10', coat: { color: '#5a5a5e', tex: 'metal', metal: 0.4 }, boots: LEATHER, head: 'helm', beard: true, mounted: true, bulk: 1.1 };
const ramRider: ClanUnit = {
  id: 'ram-rider',
  name: 'Ram Rider',
  description: 'A clansman astride a great horned mountain ram that charges headfirst into the line.',
  mass: 260,
  physique: { muscle: 0.5, frame: 0.35, reserve: 0.15 },
  attack: { style: 'strike', crystalMass: 3 },
  refinement: 1.4,
  model(b, p) {
    const charge = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase * 1.3) * Math.PI) * 0.35 : 0;
    const bob = fourLegs(b, p, { fx: 0.55, bx: -0.55, z: 0.22, hip: 0.95, len: 0.95, r: 0.08, mat: fleece, hoof: { color: '#2a2018', tex: 'leather' } });
    b.joint([charge, bob, 0], [0, 0, 0], (c) => {
      c.sphere([0.75, 0.42, 0.42], [0, 1.15, 0], fleece);
      c.sphere([0.18, 0.18, 0.18], [-0.75, 1.2, 0], fleece); // rump tuft
      c.joint([0.75, 1.25, 0], [0, 0, p.anim === 'attack' ? -0.5 : -0.15], (h) => {
        h.sphere([0.24, 0.2, 0.18], [0.12, 0, 0], { color: '#bdb39c', tex: 'fur' });
        h.sphere([0.12, 0.1, 0.11], [0.32, -0.06, 0], { color: '#6a5e4c', tex: 'leather' });
        for (const z of [1, -1]) { // curled horns
          h.limb([0.02, 0.12, 0.12 * z], [-0.12, 0.26, 0.26 * z], 0.07, ramHorn, 0.06);
          h.limb([-0.12, 0.26, 0.26 * z], [0.0, 0.1, 0.38 * z], 0.06, ramHorn, 0.045);
          h.limb([0.0, 0.1, 0.38 * z], [0.16, 0.0, 0.3 * z], 0.045, ramHorn, 0.03);
        }
        if (p.armed) h.crystal(0.18, [0.3, 0.12, 0], [0, 0, -0.4]); // crystal brow-plate
      });
      c.box([0.5, 0.06, 0.62], [0.02, 1.55, 0], { team: 'primary', tex: 'cloth' }); // saddle cloth
      c.joint([0, 0.78, 0], [0, 0, 0], (r) => clansman(r, { ...p, anim: p.anim === 'walk' ? 'idle' : p.anim }, riderLook, armFor(p, 'axe') * 0.7, (hh) => {
        hh.limb([0, 0.1, 0], [0, -0.55, 0], 0.025, HAFT);
        hh.box([0.15, 0.13, 0.02], [0.06, -0.52, 0], IRON);
      }), 0.9);
    });
  },
};

const pony: Mat = { color: '#5a4030', tex: 'fur' };
const ponyCart: ClanUnit = {
  id: 'pony-cart',
  name: 'Pony Cart',
  description: 'A sturdy hill pony with a two-wheeled cart. Smaller than a mule, cheaper, and quicker to replace.',
  mass: 50,
  physique: { muscle: 0.55, frame: 0.3, reserve: 0.15 },
  wheeled: true,
  canGather: false,
  role: 'carter',
  model(b, p) {
    const bob = fourLegs(b, p, { fx: 0.32, bx: -0.3, z: 0.13, hip: 0.6, len: 0.6, r: 0.055, mat: pony, hoof: { color: '#2a2018', tex: 'leather' } });
    b.joint([0, bob, 0], [0, 0, 0], (c) => {
      c.sphere([0.45, 0.24, 0.22], [0, 0.72, 0], pony);
      c.joint([0.42, 0.82, 0], [0, 0, 0.7], (n) => {
        n.limb([0, 0, 0], [0.25, 0, 0], 0.08, pony, 0.06);
        n.sphere([0.14, 0.1, 0.09], [0.34, -0.05, 0], pony);
        n.sphere([0.06, 0.12, 0.03], [0.1, 0.08, 0], { color: '#2a1a10', tex: 'hair' }); // mane
      });
    });
    // the cart behind, on two wheels
    b.box([0.9, 0.1, 0.8], [-1.0, 0.55, 0], { color: '#5a3e26', tex: 'plank' });
    for (const z of [0.42, -0.42]) {
      b.box([0.9, 0.22, 0.04], [-1.0, 0.7, z * 0.95], { color: '#4a3424', tex: 'plank' });
      b.cylinder(0.32, 0.32, 0.06, [-1.0, 0.32, z], { color: '#3a2a1c', tex: 'wood' }, [Math.PI / 2, 0, 0], 12);
    }
    b.limb([-0.55, 0.6, 0.18], [0.1, 0.72, 0.16], 0.025, HAFT);
    b.limb([-0.55, 0.6, -0.18], [0.1, 0.72, -0.16], 0.025, HAFT);
    if (p.cargo === 'food') for (let i = 0; i < 3; i++) b.sphere([0.16, 0.18, 0.16], [-1.0 + (i - 1) * 0.28, 0.82, 0], { color: '#b8a274', tex: 'cloth' });
    else if (p.cargo === 'wood') for (let i = 0; i < 4; i++) b.limb([-1.4, 0.7 + (i >> 1) * 0.12, -0.15 + (i % 2) * 0.3], [-0.6, 0.7 + (i >> 1) * 0.12, -0.15 + (i % 2) * 0.3], 0.06, HAFT);
    else if (p.cargo === 'crystal') for (let i = 0; i < 3; i++) b.crystal(0.3, [-1.1 + i * 0.25, 0.75, 0], [0.3 * i, 0, 0.4]);
  },
};

export const units: ClanUnit[] = [crofter, javelineer, axeman, ramRider, ponyCart];

// ── Buildings (capital curve K = 720). Hall 700; longhouse 200 → smithy 460 / ram pen 560.
export const buildings: ClanBuilding[] = [
  {
    id: 'clan-hall', name: 'Clan Hall', description: 'Raises crofters and pony carts; always keeps 2 carts on the road.',
    size: 3, materials: 700, trains: ['crofter', 'pony-cart'], researches: ['crofter-craft', 'crofter-craft-2'], carters: 2, unbuildable: true, model: models.clanHall,
  },
  {
    id: 'longhouse', name: 'Longhouse', description: 'Where the clan musters its axemen and javelineers.',
    size: 3, materials: 200, trains: ['axeman', 'javelineer'], model: models.longhouse,
  },
  {
    id: 'smithy', name: 'Smithy', description: 'Iron for axes and javelins, and the breeding of war rams.',
    size: 2, materials: 260, requires: ['longhouse'], researches: ['iron-axes', 'iron-axes-2', 'keen-javelins', 'ram-breeding'], model: models.smithy,
  },
  {
    id: 'ram-pen', name: 'Ram Pen', description: 'A dry-stone pen where great rams are broken to the saddle.',
    size: 3, materials: 360, requires: ['longhouse'], trains: ['ram-rider'], model: models.ramPen,
  },
  {
    id: 'woodland-lodge', name: 'Woodland Lodge', description: 'A woodcutters\' lodge: fells faster nearby and keeps planting trees from its own timber.',
    size: 2, materials: 150, gatherBoost: { radius: 7, resources: ['wood'] },
    sow: { mechanism: 50, radius: 6, resources: ['wood'], maxPlants: { wood: 12 } }, model: models.woodlandLodge,
  },
  {
    id: 'stone-tower', name: 'Stone Tower', description: 'A tall dry-stone tower with a throwing arm on the roof: heavier shots, from higher up.',
    size: 2, materials: 300, attack: { mechanism: 40, crystalMass: 1, height: 6, stockShots: 30 }, model: models.stoneTower,
  },
];

const techs: TechSpec[] = [
  { id: 'crofter-craft', name: 'Crofter Craft', description: 'Crofters work, walk and carry 25% more (work refinement +0.25).', unit: 'crofter', refinement: 0.25, channel: 'work' },
  { id: 'crofter-craft-2', name: 'Crofter Craft II', description: 'Crofters work, walk and carry another 25% more.', unit: 'crofter', refinement: 0.25, channel: 'work' },
  { id: 'iron-axes', name: 'Iron Axes', description: 'Axemen +0.5 refinement: cheaper to field.', unit: 'axeman', refinement: 0.5 },
  { id: 'iron-axes-2', name: 'Iron Axes II', description: 'Axemen +0.4 more refinement.', unit: 'axeman', refinement: 0.4 },
  { id: 'keen-javelins', name: 'Keen Javelins', description: 'Javelineers +0.5 refinement: cheaper to field.', unit: 'javelineer', refinement: 0.5 },
  { id: 'ram-breeding', name: 'Ram Breeding', description: 'Ram Riders +0.4 refinement: cheaper to field.', unit: 'ram-rider', refinement: 0.4 },
];

export const highlanders: FactionSpec = {
  id: 'highlanders',
  name: 'The Highland Clans',
  workerId: 'crofter',
  carterId: 'pony-cart',
  townCenterId: 'clan-hall',
  units,
  buildings,
  techs,
  resourceNames: { food: 'Oats', wood: 'Timber', crystal: 'Crystal' },
  art: (team, onProgress) => import('./art').then((m) => m.bakeArt(team, onProgress)),
  // our half of the map: a frost meadow with elk and bears
  biome: (onProgress) => import('./homeworld').then((m) => m.bakeHomeworld(onProgress)),
  wildlife: highlandWildlife,
};
