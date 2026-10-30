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
import { meadowWildlife } from '../../biomes/meadow/wildlife';
import type { BuildingModel, Mat, ModelBuilder, UnitModel } from '../../kits/bake3d/types';

/** Meadowfolk specs carry their 3D models; the engine ignores the extra field. */
export type MeadowUnit = UnitSpec & { model: UnitModel };
export type MeadowBuilding = BuildingSpec & { model: BuildingModel };
import { armAngle, cargoPack, human, quadLegs, swing, torsoLean, type HumanLook } from './body';
import * as models from './buildings';

const WOOD: Mat = { color: '#6b4a2e', tex: 'wood' };
const LEATHER: Mat = { color: '#5a3f28', tex: 'leather' };
const IRON: Mat = { color: '#8d939a', tex: 'metal' };
/** Worked crystal (the stuff of every weapon's business end), for blades shaped longer than a raw crystal. */
const GEM: Mat = { color: '#8fe6ff', rough: 0.12, metal: 0.15, emissive: '#2a8fc0' };

const villagerLook: HumanLook = {
  skin: '#c99a76', hair: '#4a3020', head: 'hood', scale: 0.95, beard: true,
  tunic: { color: '#b48c52', tex: 'cloth' }, trousers: { color: '#7d6c4c', tex: 'cloth' }, boots: LEATHER,
};

const villager: MeadowUnit = {
  id: 'villager',
  name: 'Villager',
  description: 'Gathers berries, wood and crystal, hauls them home and raises buildings, and can defend itself with a crystal-headed hammer.',
  mass: 45, size: 0.56, // (its collision as wide as it's drawn)
  refinement: 2.07, // as refined as its building affords
  physique: { muscle: 0.4, frame: 0.35, reserve: 0.25 },
  attack: { style: 'strike', crystalMass: 1 },
  model(b, p) {
    human(b, p, villagerLook, armAngle(p), (h) => {
      if (!p.armed) return;
      h.limb([0, 0, 0], [0.36, 0.06, 0], 0.022, WOOD);
      h.box([0.06, 0.07, 0.12], [0.36, 0.06, 0], { color: '#8d939a', tex: 'metal' }); // the hammer's iron collar
      h.crystal(0.2, [0.4, 0.06, 0], [0, 0, -Math.PI / 2 + 0.1]);
    });
    // a rope belt with a pouch and a water-skin
    b.cylinder(0.15, 0.15, 0.03, [0, 0.9, 0], { color: '#c8b082', tex: 'cloth' }, undefined, 10);
    b.sphere([0.06, 0.07, 0.05], [0.05, 0.84, 0.15], LEATHER);
    b.sphere([0.05, 0.08, 0.05], [-0.06, 0.84, -0.15], { color: '#8a6a40', tex: 'leather' });
    cargoPack(b, p, 0.95);
  },
};

const slinger: MeadowUnit = {
  id: 'slinger',
  name: 'Slinger',
  description: 'Light skirmisher who whirls a sling of crystal chips. Fragile, but hits from range — then has to collect the spent crystals.',
  mass: 32, size: 0.47, // (its collision as wide as it's drawn)
  refinement: 1.42, // as refined as its building affords
  physique: { muscle: 0.5, frame: 0.25, reserve: 0.25 },
  attack: { style: 'throw', crystalMass: 0.3, ammo: 12, sling: 1.0 }, // light stones: the sling's leverage pays on them
  model(b, p) {
    const look: HumanLook = {
      skin: '#b9875f', hair: '#2b1d14', head: 'hood', scale: 0.88, bulk: 0.9, tabard: true,
      tunic: { color: '#9c7c4c', tex: 'leather' }, trousers: { color: '#6d6048', tex: 'cloth' }, boots: LEATHER,
    };
    human(b, p, look, armAngle(p, 'throw'), (h) => {
      // sling: cord and pouch, whirling during the wind-up
      const whirl = p.anim === 'attack' && p.phase < 0.65 ? p.phase * Math.PI * 2 * 3 : 0.4;
      const pouch: [number, number, number] = [Math.cos(whirl) * 0.12, -0.46, Math.sin(whirl) * 0.14];
      h.limb([0, 0, 0], pouch, 0.006, LEATHER);
      h.sphere([0.04, 0.03, 0.04], pouch, LEATHER);
      if (p.armed && !(p.anim === 'attack' && p.phase > 0.7)) h.crystal(0.08, [pouch[0], pouch[1] - 0.03, pouch[2]]);
    }, (h) => {
      h.sphere([0.06, 0.05, 0.05], [0.02, -0.05, 0], LEATHER);
    });
    b.sphere([0.08, 0.1, 0.06], [-0.05, 0.8, -0.18], LEATHER); // ammo bag
    b.cylinder(0.14, 0.14, 0.03, [0, 0.86, 0], LEATHER, undefined, 10); // a belt of sling stones
    for (const a of [0.6, 1.2, 1.8]) b.crystal(0.05, [Math.cos(a) * 0.14, 0.84, Math.sin(a) * 0.14], [0, 0, 0.3]);
  },
};

const maceman: MeadowUnit = {
  id: 'maceman',
  name: 'Crystal Maceman',
  description: 'Infantry in mail with a shield, swinging a 2 kg crystal-headed mace. Hard to stop.',
  mass: 80, size: 0.79, // (its collision as wide as it's drawn)
  physique: { muscle: 0.45, frame: 0.45, reserve: 0.1 },
  attack: { style: 'strike', crystalMass: 2 },
  refinement: 1.42, // as refined as its building affords
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

const pikeman: MeadowUnit = {
  id: 'pikeman',
  name: 'Pikeman',
  description: 'A steady soldier behind a 3-metre crystal-tipped pike. Strikes first, and anything that charges onto the set pike drives it home with its own weight: the answer to Lynx Lancers and other heavy chargers. Slow to swing, and no match for a swarm.',
  mass: 62, size: 0.59, // (its collision as wide as it's drawn)
  refinement: 1.42, // as refined as its building affords
  physique: { muscle: 0.45, frame: 0.4, reserve: 0.15 },
  attack: { style: 'strike', crystalMass: 1.5, shaft: 3 },
  model(b, p) {
    const look: HumanLook = {
      skin: '#c49270', hair: '#4a3020', head: 'helmet', scale: 1.0, bulk: 1.0, tabard: true,
      tunic: { color: '#a08a62', tex: 'leather' }, trousers: { color: '#6a5a44', tex: 'cloth' }, boots: LEATHER,
    };
    // the pike shows what it's doing. Braced: set low in a lunge, the butt planted on the ground behind the back foot
    // and the point up at a charger's chest. A jab drives out from the brace (the butt lifting off the ground) and
    // comes back to it. On the move it's carried level at the hip, steady (not swinging with the arms)
    const attacking = p.anim === 'attack';
    const thrust = attacking ? Math.sin(Math.min(1, p.phase / 0.6) * Math.PI) : 0;
    const braced = p.style === 'brace' || attacking;
    const moving = p.anim === 'walk';
    const stance = braced ? { ...look, stance: 'lunge' as const } : look;
    const arm = braced ? 0.55 + thrust * 0.55 : moving ? 0.35 : armAngle(p) * 0.4;
    const aim = braced ? 0.42 - thrust * 0.3 : moving ? (p.style === 'charge' ? 0.2 : 0) : 0.05; // radians above level (a charge: the baker tips the body 0.2 forward)
    const slide = thrust * 0.6, back = braced ? 1.5 : 1.0;
    human(b, p, stance, arm, (h) => {
      if (!p.armed) return;
      // the hand's frame turns with the arm (arm + 0.25) and the body's lean: undo that, so the pike holds its own aim
      h.joint([0, 0, 0], [0, 0, aim - (arm + 0.25) + torsoLean(p, stance)], (k) => {
        k.limb([-back + slide, 0, 0], [1.6 + slide, 0, 0], 0.022, WOOD);
        k.cylinder(0.03, 0.03, 0.08, [1.45 + slide, 0, 0], IRON, [0, 0, Math.PI / 2], 6);
        k.crystal(0.24, [1.62 + slide, 0, 0], [0, 0, -Math.PI / 2]);
      });
    }, (h) => {
      h.sphere([0.06, 0.05, 0.05], [0.02, -0.05, 0], LEATHER);
    });
  },
};

const lynx: MeadowUnit = {
  id: 'lynx',
  name: 'Lynx Lancer',
  description: 'A lancer riding a great lynx, crystal-tipped lance couched. Fast and fierce, but eats like a horse.',
  mass: 320, size: 0.76, // (its collision as wide as it's drawn)
  length: 2.6, // m nose to tail: a long body, it wheels
  physique: { muscle: 0.6, frame: 0.28, reserve: 0.12 },
  attack: { style: 'strike', crystalMass: 5, shaft: 3, sidearm: { crystalMass: 1.5 } }, // the couched lance it's drawn with, and a sword for close in
  refinement: 1.83, // as refined as its building affords
  model(b, p) {
    const fur: Mat = { color: '#bf9a62', tex: 'fur' };
    const belly: Mat = { color: '#eadcbc', tex: 'fur' };
    const spot: Mat = { color: '#6a4a2a', tex: 'fur' };
    const dark: Mat = { color: '#2a2018', tex: 'fur' };
    const lunge = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase / 0.6) * Math.PI) * 0.2 : 0;
    const bob = quadLegs(b, p, { fx: 0.62, bx: -0.58, z: 0.2, hip: 0.95, len: 0.95, r: 0.09, mat: fur, paw: belly });
    b.joint([lunge, bob, 0], [0, 0, 0], (c) => {
      // a cat's body: deep chest, slim waist, high haunches
      c.sphere([0.42, 0.4, 0.33], [0.55, 1.12, 0], fur); // chest and shoulders
      c.sphere([0.62, 0.3, 0.27], [0, 1.06, 0], fur); // waist
      c.sphere([0.4, 0.38, 0.32], [-0.55, 1.12, 0], fur); // haunches
      c.sphere([0.5, 0.18, 0.22], [0.1, 0.86, 0], belly);
      c.sphere([0.16, 0.22, 0.2], [0.8, 0.98, 0], belly); // pale chest
      // spotted coat
      for (let i = 0; i < 9; i++) {
        const x = -0.75 + i * 0.18, y = 1.08 + ((i * 37) % 5) * 0.05;
        for (const z of [1, -1]) c.sphere([0.05, 0.04, 0.02], [x, y, z * (0.31 - Math.abs(x) * 0.04)], spot);
      }
      c.joint([1.02, 1.42, 0], [0, 0, p.anim === 'attack' ? -0.2 : 0], (h) => {
        h.sphere([0.23, 0.22, 0.25], [0, 0, 0], fur);
        h.sphere([0.12, 0.1, 0.15], [0.18, -0.07, 0], belly); // short muzzle
        h.sphere(0.035, [0.3, -0.04, 0], dark);
        for (const z of [0.12, -0.12]) {
          h.sphere(0.03, [0.17, 0.05, z * 0.75], dark); // eyes
          h.cone(0.075, 0.2, [-0.02, 0.25, z], fur, [z > 0 ? 0.25 : -0.25, 0, 0], 8);
          h.limb([-0.02, 0.35, z * 1.15], [-0.03, 0.5, z * 1.3], 0.02, dark, 0.008); // long black ear tufts
          h.sphere([0.1, 0.15, 0.05], [0.02, -0.13, z * 1.45], belly); // flared cheek ruff
          h.cone(0.05, 0.14, [0.0, -0.24, z * 1.5], belly, [z > 0 ? -0.5 : 0.5, 0, Math.PI], 6);
        }
      });
      // bobtail with a black tip
      c.limb([-0.88, 1.2, 0], [-1.05, 1.1, 0], 0.07, fur, 0.06);
      c.sphere(0.065, [-1.08, 1.08, 0], dark);
      // team caparison draped over the flanks
      for (const z of [1, -1]) c.box([0.62, 0.32, 0.02], [-0.05, 1.22, z * 0.35], { team: 'primary', tex: 'cloth' }, [z * 0.12, 0, 0]);
      // saddle + barding
      c.box([0.6, 0.08, 0.7], [-0.05, 1.38, 0], { team: 'primary', tex: 'cloth' });
      c.box([0.45, 0.12, 0.45], [-0.05, 1.45, 0], LEATHER);
      // rider (hip sits on the saddle)
      c.joint([-0.08, 1.5 - 0.9 * 0.9, 0], [0, 0, 0], (r) => {
        const look: HumanLook = {
          skin: '#c99a76', hair: '#3a2a1c', head: 'helmet', scale: 0.9, mounted: true, tabard: true, pads: true,
          tunic: IRON, trousers: { color: '#4a4038', tex: 'cloth' }, boots: LEATHER,
        };
        // cutting with the sword (attack.sidearm): the lance goes up out of the way and the left arm chops
        const cut = p.anim === 'cut';
        const sword = (h: ModelBuilder) => {
          h.limb([-0.07, 0, 0], [0.07, 0, 0], 0.022, LEATHER); // grip
          h.box([0.03, 0.03, 0.2], [0.08, 0, 0], IRON); // crossguard
          // the blade: a crystal drawn out long and thin, six-faced, to a point
          h.cylinder(0.026, 0.03, 0.56, [0.38, 0, 0], GEM, [0, 0, -Math.PI / 2], 6);
          h.cone(0.026, 0.14, [0.73, 0, 0], GEM, [0, 0, -Math.PI / 2], 6);
        };
        // the cut is at a body down beside the mount: the rider leans out from the saddle (its hips, 0.81 up) over the
        // left flank as the blade comes down
        const leanOut = cut ? 0.7 * Math.sin(Math.PI * Math.min(1, p.phase * 0.85)) : 0;
        // the sword arm: up over the head, then down hard past the hip (the blade held along the forearm, so it ends
        // pointing at the ground beside the flank), then back up a little
        const t = p.phase;
        const chop = t < 0.4 ? 0.3 + (t / 0.4) * 2.9 : t < 0.65 ? 3.2 - ((t - 0.4) / 0.25) * 3.1 : 0.1 + ((t - 0.65) / 0.35) * 0.3;
        r.joint([0, 0.81, 0], [leanOut, 0, 0], (rr) => rr.joint([0, -0.81, 0], [0, 0, 0], (rider) => {
          human(rider, { ...p, anim: p.anim === 'walk' ? 'idle' : cut ? 'attack' : p.anim }, look, cut ? 2.4 : armAngle(p, 'lance'), (h) => {
            const thrust = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase / 0.6) * Math.PI) * 0.35 : 0;
            h.limb([-0.6 + thrust, 0, 0], [1.9 + thrust, 0, 0], 0.03, WOOD, 0.022);
            h.cone(0.06, 0.12, [-0.05 + thrust, 0, 0], IRON, [0, 0, -Math.PI / 2], 10);
            if (p.armed) h.crystal(0.36, [1.88 + thrust, 0, 0], [0, 0, -Math.PI / 2]);
          }, cut ? (h) => h.joint([0, 0, 0], [-0.9, 0, -1.0], sword) : undefined, cut ? chop : undefined);
        }));
        // sheathed at the left hip when it isn't drawn
        if (!cut) {
          r.limb([0.06, 0.86, 0.24], [-0.52, 0.5, 0.28], 0.03, LEATHER, 0.022); // scabbard
          r.limb([0.06, 0.86, 0.24], [0.2, 0.95, 0.23], 0.022, LEATHER); // hilt
          r.box([0.03, 0.2, 0.03], [0.06, 0.86, 0.24], IRON, [0, 0, 0.55]); // crossguard
        }
      });
    });
  },
};

const hurlhorn: MeadowUnit = {
  id: 'hurlhorn',
  name: 'Hurlhorn',
  description: 'A shaggy war-beast carrying a throwing-arm on its back. Lobs 9 kg crystals across the field, a dozen to a load. Helpless up close.',
  mass: 400, size: 1.44, // (its collision as wide as it's drawn)
  length: 2.9, // m nose to tail: a long body, it wheels
  physique: { muscle: 0.55, frame: 0.3, reserve: 0.15 },
  attack: { style: 'throw', crystalMass: 9, ammo: 12 },
  refinement: 2.5, // as refined as its building affords
  model(outer, p) {
    // modelled at 700 kg; drawn at the cube-root scale of its actual mass
    outer.joint([0, 0, 0], [0, 0, 0], (b) => {
      const wool: Mat = { color: '#80603f', tex: 'fur' };
      const woolLight: Mat = { color: '#a8875e', tex: 'fur' };
      const horn: Mat = { color: '#d9ccb0', tex: 'stone', rough: 0.5 };
      const bob = quadLegs(b, p, { fx: 0.8, bx: -0.85, z: 0.38, hip: 1.25, len: 1.25, r: 0.17, mat: wool, paw: { color: '#2d241c', tex: 'leather' } });
      b.joint([0, bob, 0], [0, 0, 0], (c) => {
        c.sphere([1.3, 0.75, 0.7], [0, 1.65, 0], wool);
        c.sphere([0.7, 0.6, 0.62], [0.65, 1.85, 0], woolLight); // hump
        c.sphere([1.0, 0.45, 0.6], [0, 1.25, 0], wool); // shaggy skirt
        c.sphere([1.15, 0.35, 0.66], [-0.05, 1.12, 0], woolLight); // shaggy fringe below
        // panniers of spare crystal on each flank
        for (const z of [1, -1]) {
          c.box([0.55, 0.42, 0.18], [-0.45, 1.75, z * 0.74], WOOD, [z * 0.1, 0, 0]);
          c.box([0.58, 0.06, 0.2], [-0.45, 1.97, z * 0.74], IRON, [z * 0.1, 0, 0]);
          if (p.armed) for (const dx of [-0.6, -0.42, -0.28]) c.crystal(0.16, [dx, 2.08, z * 0.76], [z * 0.3, 0, dx]);
        }
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
        c.limb([-0.05, 3.15, 0], tip, 0.07, WOOD, 0.05);
        // iron-banded counterweight on the short end
        const back = swing([-0.05, 3.15, 0], 0.45, arm);
        c.limb([-0.05, 3.15, 0], back, 0.07, WOOD);
        c.box([0.22, 0.22, 0.26], back, IRON, [0, 0, arm]);
        c.cylinder(0.14, 0.09, 0.08, [tip[0], tip[1] + 0.02, tip[2]], LEATHER);
        if (p.armed && !(p.anim === 'attack' && p.phase > 0.55 && p.phase < 0.95)) c.crystal(0.38, [tip[0], tip[1] + 0.05, tip[2]], [0.3, 0, 0.4]);
      });
    }, Math.cbrt(400 / 700));
  },
};

const mule: MeadowUnit = {
  id: 'mule',
  name: 'Mule Cart',
  description: 'A small, patient mule hauling a two-wheeled cart. Keeps outlying buildings stocked from the town center.',
  mass: 80, size: 1.2, // (its collision as wide as it's drawn)
  refinement: 2.07, // as refined as its building affords
  length: 1.8, // m nose to tail: a long body, it wheels
  physique: { muscle: 0.55, frame: 0.3, reserve: 0.15 },
  wheeled: true,
  canGather: false,
  role: 'carter',
  model(b, p) {
    const hide: Mat = { color: '#9a8068', tex: 'fur' };
    const pale: Mat = { color: '#d8ccb4', tex: 'fur' };
    const dark: Mat = { color: '#3a2e24', tex: 'fur' };
    const plank: Mat = { color: '#9a7448', tex: 'wood' };
    const bob = quadLegs(b, p, { fx: 0.95, bx: 0.35, z: 0.16, hip: 0.85, len: 0.85, r: 0.07, mat: hide, paw: dark });
    b.joint([0, bob, 0], [0, 0, 0], (m) => {
      m.sphere([0.5, 0.28, 0.25], [0.65, 0.95, 0], hide);
      m.limb([1.05, 1.05, 0], [1.3, 1.35, 0], 0.11, hide, 0.09);
      m.sphere([0.2, 0.12, 0.12], [1.42, 1.3, 0], hide);
      m.sphere([0.1, 0.09, 0.1], [1.56, 1.26, 0], pale); // pale muzzle
      m.limb([0.95, 1.12, 0], [1.25, 1.48, 0], 0.035, dark, 0.03); // short upright mane
      m.cylinder(0.14, 0.14, 0.06, [1.12, 1.15, 0], LEATHER, [0, 0, -0.9], 10); // collar
      m.sphere([0.3, 0.12, 0.2], [0.65, 0.78, 0], pale); // pale belly
      for (const z of [0.07, -0.07]) m.limb([1.28, 1.42, z], [1.22, 1.68, z * 1.6], 0.035, hide, 0.02);
      m.limb([0.15, 1.0, 0], [0.05, 0.6, 0], 0.03, hide, 0.02);
      m.sphere([0.04, 0.1, 0.04], [0.04, 0.55, 0], dark); // tail tuft
      m.box([0.3, 0.12, 0.55], [0.6, 1.2, 0], { team: 'primary', tex: 'cloth' });
    });
    // shafts and cart
    for (const z of [0.3, -0.3]) b.limb([0.55, 0.85, z], [-0.35, 0.7, z], 0.035, WOOD);
    b.box([1.2, 0.08, 0.95], [-0.95, 0.72, 0], plank);
    for (const z of [0.47, -0.47]) b.box([1.2, 0.35, 0.05], [-0.95, 0.92, z], plank);
    for (const z of [0.5, -0.5]) for (const x of [-0.45, -1.45]) b.box([0.06, 0.4, 0.04], [x, 0.92, z], IRON); // iron corner straps
    b.box([0.05, 0.35, 0.95], [-1.55, 0.92, 0], plank);
    // wheels roll about the axle (z); spokes make the roll visible
    const roll = p.anim === 'walk' ? -p.phase * Math.PI * 2 : 0;
    for (const z of [0.55, -0.55]) {
      b.joint([-0.95, 0.42, z], [0, 0, roll], (wh) => {
        wh.cylinder(0.43, 0.43, 0.045, [0, 0, 0], DARK_IRON, [Math.PI / 2, 0, 0], 16); // iron tyre
        wh.cylinder(0.4, 0.4, 0.055, [0, 0, 0], plank, [Math.PI / 2, 0, 0], 16);
        wh.cylinder(0.33, 0.33, 0.06, [0, 0, 0], { color: '#7a5a3a', tex: 'wood' }, [Math.PI / 2, 0, 0], 16);
        for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) wh.box([0.7, 0.05, 0.075], [0, 0, 0], plank, [0, 0, a]);
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
//    barracks 180 → forge 480 / den 540 → great hall 540 + 300 + 360 + 180 = 1,380
export const buildings: MeadowBuilding[] = [
  {
    id: 'town-center', name: 'Town Center', description: 'Trains villagers and mule carts. Always keeps at least 3 carts, which load here and supply whichever building is shortest; train more for faster logistics.',
    size: 3, materials: 810, trains: ['villager', 'mule'], researches: ['villager-tools', 'villager-tools-2', 'villager-tools-3'], carters: 3, unbuildable: true, model: models.townCenter,
  },
  {
    id: 'barracks', name: 'Barracks', description: 'Trains slingers and crystal macemen.',
    size: 3, materials: 180, trains: ['slinger', 'maceman', 'pikeman'], model: models.barracks,
  },
  {
    id: 'forge', name: 'Crystal Forge', description: 'Researches better slings, mail and lynx breeding (levels I and II).',
    size: 2, materials: 300, requires: ['barracks'], researches: ['sling-drills', 'mail-hardening', 'lynx-breeding'], model: models.forge,
  },
  {
    id: 'lynx-den', name: 'Lynx Den', description: 'Raises and trains lynx lancers.',
    size: 3, materials: 360, requires: ['barracks'], trains: ['lynx'], model: models.lynxDen,
  },
  {
    id: 'great-hall', name: 'Great Hall', description: 'The top of the tree. Its capital (with everything beneath it) supports the refined Hurlhorn and the third level of every combat tech.',
    size: 4, materials: 540, requires: ['forge', 'lynx-den'], trains: ['hurlhorn'], researches: ['sling-drills-2', 'sling-drills-3', 'mail-hardening-2', 'mail-hardening-3', 'lynx-breeding-2', 'lynx-breeding-3'], model: models.greatHall,
  },
  {
    id: 'gathering-camp', name: 'Gathering Camp', description: 'A drop-off shed that speeds up gathering nearby (by its capital) and keeps sowing berry bushes and trees around it from its own seed stock.',
    size: 2, materials: 150, gatherBoost: { radius: 6, resources: ['food', 'wood', 'crystal'] },
    sow: { mechanism: 60, radius: 5, resources: ['food', 'wood'] }, model: models.gatheringCamp,
  },
  {
    id: 'watchtower', name: 'Watchtower', description: 'A throwing arm on stilts. Height adds energy and range; it throws crystals from its own stock.',
    size: 1, materials: 90, attack: { mechanism: 20, crystalMass: 0.5, height: 4 }, model: models.watchtower,
  },
];

// Each line has three levels; each level must follow the one before (the engine
// prices it from where the last left off, so deeper levels cost more).
const level = (base: TechSpec, n: 1 | 2 | 3, flavor: [string, string, string]): TechSpec => ({
  ...base,
  id: n === 1 ? base.id : `${base.id}-${n}`,
  name: n === 1 ? base.name : `${base.name} ${n === 2 ? 'II' : 'III'}`,
  flavor: flavor[n - 1],
});
const tools: TechSpec = { id: 'villager-tools', name: 'Better Tools', description: 'You buy better tools for every villager, the ones you have and the ones to come: they gather, walk and carry 30% more (work refinement +0.3).', unit: 'villager', refinement: 0.3, channel: 'work' };
const sling: TechSpec = { id: 'sling-drills', name: 'Sling Drills', description: 'You buy a drill-yard\'s know-how: slingers train for less (refinement +0.4, so each costs its body\'s price ÷ refinement). The same sling, cheaper hands.', unit: 'slinger', refinement: 0.4 };
const mail: TechSpec = { id: 'mail-hardening', name: 'Hardened Mail', description: 'You buy the forge\'s craft: Crystal Macemen train for less (refinement +0.4). Same mace, same mail, cheaper to put in the field.', unit: 'maceman', refinement: 0.4 };
const breeding: TechSpec = { id: 'lynx-breeding', name: 'Lynx Breeding', description: 'You buy bloodlines: Lynx Lancers train for less (refinement +0.3). The cats are no bigger; there are just more of them.', unit: 'lynx', refinement: 0.3 };
const FLAVOR: Record<string, [string, string, string]> = {
  'villager-tools': [
    '"A good hoe is half the harvest." — Meadow saying',
    '"My grandmother broke her back on this field. I\'ll break mine on a better one." — Wenna, plough-wright',
    'When the iron is good enough, the work starts singing.',
  ],
  'sling-drills': [
    'Whirl, release, and pray the wind is your friend.',
    '"Any shepherd can hit a wolf. A slinger hits the wolf\'s eye." — Drillmaster Hob',
    'They practise until the stone leaves the pouch before the thought leaves the head.',
  ],
  'mail-hardening': [
    '"Quench it in cold spring water and it remembers the winter." — Forge-mother Edda',
    'A thousand rings, each one a promise to come home.',
    'The maces got heavier. The macemen did not notice.',
  ],
  'lynx-breeding': [
    'Gentle with the kittens, they say. The kittens are not gentle with anyone.',
    '"Feed it well, ride it often, and never, ever turn your back on it at supper." — Den-keeper Rowe',
    'Bred for silence, for spring, and for the moment the shield wall breaks.',
  ],
};

const techs: TechSpec[] = [tools, sling, mail, breeding].flatMap((t) => [level(t, 1, FLAVOR[t.id]), level(t, 2, FLAVOR[t.id]), level(t, 3, FLAVOR[t.id])]);

export const units: MeadowUnit[] = [villager, slinger, maceman, pikeman, lynx, hurlhorn, mule];

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
  art: (team, onProgress, only) => import('./art').then((m) => m.bakeArt(team, onProgress, only)),
  // our half of the map: the spring meadow, with its deer and wolves
  biome: (onProgress) => import('../../biomes/meadow').then((m) => m.bakeMeadow(onProgress, 'spring')),
  wildlife: meadowWildlife,
};
