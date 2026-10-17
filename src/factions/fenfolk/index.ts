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
//   • siege herons: enormous fliers that drop heavy crystals over walls and water,
//     but so heavy they can only stay up for a few seconds' bombing run
// Self-contained: only engine types and kits, never another faction.
import type { BuildingSpec, FactionSpec, TechSpec, UnitSpec } from '../types';
import type { BuildingModel, Mat, ModelBuilder, UnitModel } from '../../kits/bake3d/types';
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
  description: 'A stout fenling behind a woven reed shield, bracing a long crystal-tipped reed spear. Cheap, sturdy, and in the way: anything that charges onto the spear drives it home with its own weight.',
  mass: 38,
  physique: { muscle: 0.35, frame: 0.55, reserve: 0.1 },
  attack: { style: 'strike', crystalMass: 1, shaft: 2.5 },
  gait: { hop: 0.76, period: 0.85 }, // heavier bounds behind the shield
  model(b, p) {
    body(b, p, guardLook, fenArm(p, 'jab'), (h) => {
      if (p.anim === 'attack' || p.style === 'brace') { // levelled: braced with the point set, or the jab driving it forward
        h.limb([-0.35, 0.45, 0], [1.25, -1.15, 0], 0.017, WILLOW);
        if (p.armed) h.crystal(0.14, [1.3, -1.2, 0], [0, 0, Math.PI * 0.75]);
      } else { // carried upright, butt by the foot
        h.limb([0, -0.35, 0], [0, 1.75, 0], 0.017, WILLOW);
        if (p.armed) h.crystal(0.14, [0, 1.82, 0], [0, 0, 0]);
      }
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
  mass: 400, // horse-sized: a fenling rides it
  physique: { muscle: 0.55, frame: 0.3, reserve: 0.15 },
  attack: { style: 'strike', crystalMass: 2.5 },
  refinement: 2.0, // as refined as the Toad Wallow allows (2.05): a big body bred well
  gait: { hop: 0.5, period: 1.1 }, // great lumbering leaps: airborne 1/3–5/6 of each stride
  model(outer, p) {
    // drawn at its old 150 kg proportions, scaled up by the cube root of its mass (the rider stays fenling-sized)
    const K = Math.cbrt(400 / 150);
    outer.joint([0, 0, 0], [0, 0, 0], (b) => {
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
      // the bite: on the lunge its jaw drops wide open, then snaps shut on the target
      const gape = Math.sin(Math.min(1, p.phase * 1.6) * Math.PI) * (p.anim === 'attack' ? 1 : 0);
      c.box([0.05, 0.05 + gape * 0.32, 0.62], [0.92, 0.6 - gape * 0.16, 0], { color: '#5a2420' }); // the pink-dark of its mouth
      c.joint([0.4, 0.55, 0], [0, 0, -gape * 0.55], (jaw) => jaw.sphere([0.32, 0.1, 0.4], [0.24, -0.04, 0], toadSkin)); // lower jaw
      if (p.armed) c.crystal(0.18, [0.95, 0.75, 0], [0, 0, -1.2]); // crystal-studded jaw
      c.box([0.4, 0.05, 0.5], [-0.05, 1.08, 0], { team: 'primary', tex: 'cloth' });
      c.joint([-0.05, 0.6, 0], [0, 0, 0], (r) => body(r, { ...p, anim: p.anim === 'walk' ? 'idle' : p.anim }, riderLook, fenArm(p, 'jab') * 0.6, (h) => {
        h.limb([0, 0.2, 0], [0, -0.5, 0], 0.014, WILLOW);
      }), 0.9 / K);
    });
    }, K);
  },
};

const IRON: Mat = { color: '#9a978c', tex: 'metal', metal: 0.3, rough: 0.5 };
const BRASS: Mat = { color: '#c0913c', tex: 'metal', metal: 0.45, rough: 0.35 };
const BONE: Mat = { color: '#d2c6a4', rough: 0.6 };
const WAX: Mat = { color: '#7a1612', rough: 0.3 };
const PARCHMENT: Mat = { color: '#d8c8a0', tex: 'cloth' };
const CHAIN: Mat = { color: '#2a2824', tex: 'metal', metal: 0.8 };
const hide: Mat = { color: '#8e8c62', tex: 'leather' };
const packTortoise: FenUnit = {
  id: 'pack-tortoise',
  name: 'Pack Tortoise',
  description: 'An ancient war-tortoise in bolted iron, a crystal reliquary chained to its back. Fenlings that run dry come to it for more, like crystals on the ground.',
  mass: 160,
  physique: { muscle: 0.6, frame: 0.3, reserve: 0.1 },
  refinement: 1.5,
  bearer: { radius: 4 }, // gathers crystal only (spent ones off the ground, or from a deposit) and keeps it
  model(root, p) {
    root.joint([0, 0, 0], [0, 0, 0], (b) => {
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
    }, 1.4); // drawn big: a hulking war-tortoise
  },
};

const heronGrey: Mat = { color: '#8e969a', tex: 'fur' };
const heronPale: Mat = { color: '#d6dad6', tex: 'fur' };
const heronDark: Mat = { color: '#3a4044', tex: 'fur' };
const heronBill: Mat = { color: '#d4a634', rough: 0.35 };
const heronLeg: Mat = { color: '#9a7a3a', rough: 0.6 };
const WICKER: Mat = { color: '#a08850', tex: 'thatch' };
const HERON_BRONZE: Mat = { color: '#b0823a', tex: 'metal', metal: 0.5, rough: 0.35 };
const HERON_CHAIN: Mat = { color: '#2a2824', tex: 'metal', metal: 0.8 };
const siegeHeron: FenUnit = {
  id: 'siege-heron',
  name: 'Siege Heron',
  description: 'An enormous grey heron, a fenling riding between its shoulders and a wicker basket of heavy crystals slung beneath. It flaps ponderously over walls and water to drop crystals on whatever lies below, but it is far too heavy to stay up for long.',
  mass: 180,
  physique: { muscle: 0.45, frame: 0.2, reserve: 0.35 },
  attack: { style: 'throw', crystalMass: 8, ammo: 4 },
  refinement: 2.4, // as refined as the Elder Mound can raise (its capital supports up to 2.42)
  flight: { height: 18 }, // a siege bird climbs high: each crystal falls 18 m, but holding up there burns calories 3× as fast
  model(root, p) {
    root.joint([0, 0, 0], [0, 0, 0], (b) => {
      const t = p.phase * Math.PI * 2;
      const leaping = p.anim === 'leap'; // springing off the ground: legs driving down, body tipped up, wings hauling
      // in the air, pitched to its climb: ~11° up climbing, level soaring, ~17° nose-down gliding in
      const landing = p.anim === 'land'; // flaring to touch down: body up, wings cupped forward as airbrakes, feet out
      const held = p.anim === 'soar' || p.anim === 'glide' || landing; // wings held out, not beating
      const pitch = landing ? 0.6 : leaping ? 0.38 : p.anim === 'climb' ? 0.2 : p.anim === 'glide' ? -0.3 : 0;
      const flying = p.anim === 'fly' || leaping || p.anim === 'climb' || held;
      const walking = p.anim === 'walk';
      const attacking = p.anim === 'attack';
      // flight: body level and up off the ground, wings beating slow and deep
      // in the air the body rides low in its own frame (the game lifts the whole bird by its altitude)
      const lift = landing ? -0.15 : leaping ? -0.45 : flying ? -0.8 + Math.sin(t) * 0.05 : 0;
      const legLen = 1.15;
      // stilt legs: striding when walking, trailing behind in flight
      for (const z of [1, -1]) {
        const a = walking ? Math.sin(t + (z > 0 ? 0 : Math.PI)) * 0.45 : 0;
        const hip: [number, number, number] = [-0.05, 1.3 + lift, 0.16 * z];
        if (landing) {
          // legs swung forward and down, toes spread to catch the ground
          const knee: [number, number, number] = [0.3, hip[1] - legLen * 0.45, hip[2]];
          const foot: [number, number, number] = [0.5, Math.max(0.05, hip[1] - legLen * 0.95), hip[2]];
          b.limb(hip, knee, 0.045, heronLeg, 0.035);
          b.limb(knee, foot, 0.035, heronLeg, 0.028);
          for (const tz of [-0.08, 0, 0.08]) b.limb(foot, [foot[0] + 0.22, foot[1] - 0.03, foot[2] + tz * 1.6], 0.015, heronLeg);
        } else if (leaping) {
          // springing forward: legs thrust back and down, feet still pushing off the ground behind
          const knee: [number, number, number] = [-0.35, Math.max(0.3, hip[1] * 0.45), hip[2]];
          b.limb(hip, knee, 0.045, heronLeg, 0.035);
          b.limb(knee, [-0.85, 0.04, hip[2]], 0.035, heronLeg, 0.028);
        } else if (flying) {
          b.limb(hip, [-0.75, 1.2 + lift, 0.12 * z], 0.04, heronLeg, 0.03);
          b.limb([-0.75, 1.2 + lift, 0.12 * z], [-1.35, 1.15 + lift, 0.1 * z], 0.03, heronLeg, 0.025);
        } else {
          const knee: [number, number, number] = [hip[0] + Math.sin(a) * legLen * 0.5, hip[1] - legLen * 0.55, hip[2]];
          const foot: [number, number, number] = [knee[0] + Math.sin(a * 0.4) * legLen * 0.5 - 0.05, 0.04, hip[2]];
          b.limb(hip, knee, 0.045, heronLeg, 0.035);
          b.limb(knee, foot, 0.035, heronLeg, 0.028);
          for (const tz of [-0.08, 0, 0.08]) b.limb(foot, [foot[0] + 0.22, 0.02, foot[2] + tz * 1.5], 0.015, heronLeg); // splayed toes
        }
      }
      // the body pitches about the hip (so the legs stay attached however it tilts)
      b.joint([leaping ? 0.3 : 0, lift + 1.3, 0], [0, 0, flying ? pitch : 0], (cp) => cp.joint([0, -1.3, 0], [0, 0, 0], (c) => {
        // body, pale breast plumes and a long tail
        // body: an egg, slim and rounded, fuller at the breast and tapering to the tail. On the ground a heron holds
        // it tilted steeply up (tail low), leaning forward more as it walks; in the air it lies level.
        const tilt = flying ? 0 : walking ? 0.45 : 0.8;
        const hip: [number, number] = [0, 1.45];
        const at = (x: number, y: number, z: number): [number, number, number] => {
          const dx = x - hip[0], dy = y - hip[1];
          return [hip[0] + dx * Math.cos(tilt) - dy * Math.sin(tilt), hip[1] + dx * Math.sin(tilt) + dy * Math.cos(tilt), z];
        };
        c.sphere([0.55, 0.29, 0.29], at(0.08, 1.45, 0), heronGrey, [0, 0, tilt]);
        c.sphere([0.42, 0.22, 0.22], at(-0.38, 1.47, 0), heronGrey, [0, 0, tilt]);
        c.sphere([0.36, 0.22, 0.24], at(0.24, 1.36, 0), heronPale, [0, 0, tilt]);
        for (const z of [-0.1, 0, 0.1]) c.box([0.5, 0.03, 0.12], at(-0.85, 1.48, z), heronDark, [0, z * 2, 0.08 + tilt]);
        // neck: an S standing tall, pulled back onto the shoulders in flight (herons fly with the neck tucked)
        const dip = attacking ? Math.sin(Math.min(1, p.phase * 1.5) * Math.PI) * 0.4 : 0;
        const n1: [number, number, number] = flying ? [0.6, 1.62, 0] : [0.62, 1.95 - dip * 0.3, 0];
        const n2: [number, number, number] = flying ? [0.45, 1.85, 0] : [0.5, 2.45 - dip * 0.5, 0];
        const head: [number, number, number] = flying ? [0.72, 1.92, 0] : [0.72 + dip * 0.3, 2.62 - dip * 0.7, 0];
        c.limb(at(0.5, 1.55, 0), n1, 0.11, heronPale, 0.08); // the neck rises from the front of the breast
        c.limb(n1, n2, 0.08, heronPale, 0.07);
        c.limb(n2, head, 0.07, heronPale, 0.06);
        c.sphere([0.15, 0.12, 0.12], head, heronPale);
        // war helm: a bronze skull-cap with cheek guards, a team stripe of paint below the eye
        c.sphere([0.13, 0.08, 0.13], [head[0] - 0.02, head[1] + 0.06, 0], HERON_BRONZE);
        for (const z of [1, -1]) {
          c.box([0.12, 0.08, 0.015], [head[0] + 0.02, head[1] - 0.02, 0.1 * z], HERON_BRONZE);
          c.box([0.1, 0.02, 0.01], [head[0] + 0.08, head[1] - 0.05, 0.11 * z], { team: 'primary', tex: 'cloth' });
          c.sphere(0.03, [head[0] + 0.07, head[1] + 0.03, 0.095 * z], { color: '#ff7a20', emissive: '#c03000' }); // eyes like coals
        }
        // three long black crest plumes streaming back
        for (const k of [0, 1, 2]) c.limb([head[0] - 0.08, head[1] + 0.08, (k - 1) * 0.03], [head[0] - 0.6 - k * 0.1, head[1] + 0.12 - k * 0.07, (k - 1) * 0.08], 0.018, heronDark, 0.004);
        // dagger bill, bronze-sheathed, tipped with a crystal
        c.cone(0.065, 0.66, [head[0] + 0.44, head[1] - 0.04, 0], heronBill, [0, 0, -Math.PI / 2 - 0.08], 6);
        c.cylinder(0.068, 0.07, 0.1, [head[0] + 0.16, head[1] - 0.02, 0], HERON_BRONZE, [0, 0, Math.PI / 2], 6);
        c.crystal(0.07, [head[0] + 0.8, head[1] - 0.07, 0], [0, 0, -Math.PI / 2]);
        // a reed-and-bone gorget around the neck
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; c.cone(0.025, 0.16, [n1[0] + Math.cos(a) * 0.1, n1[1] - 0.05, Math.sin(a) * 0.12], k % 2 ? BONE : REED, [Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5 - Math.PI], 4); }
        // wings: folded along the flanks on the ground, spread and beating in the air
        for (const side of [1, -1]) {
          const spread = flying ? 1 : attacking ? 0.35 : 0;
          const beat = landing ? -0.55 : held ? 0.1 : leaping ? -0.9 + Math.sin(t) * 1.1 : flying ? Math.sin(t) * 0.75 : 0; // a leap hauls the wings high then down hard; soaring holds them out, tips up a touch
          if (spread === 0) {
            // folded: the wing lies back along the flank, tilted with the body, dark primaries crossed over the tail
            c.sphere([0.62, 0.24, 0.07], at(-0.22, 1.5, 0.27 * side), heronGrey, [0, 0, tilt]);
            c.sphere([0.4, 0.12, 0.05], at(-0.62, 1.44, 0.25 * side), heronDark, [0, 0, tilt]);
            c.sphere([0.18, 0.05, 0.04], at(-0.25, 1.62, 0.31 * side), { team: 'primary', tex: 'cloth' }, [0, 0, tilt]); // war-paint stripe
            continue;
          }
          // spread, it reaches out from the shoulder
          c.joint(at(0.15, 1.6, 0.3 * side), [beat * side * spread + (1 - spread) * 0.45 * side, -(1 - spread) * 1.4 * side + (landing ? 0.45 * side : 0), (1 - spread) * tilt], (wg) => {
            // a heron's wing: broad and rounded, dark fingered primaries at the tip. Every oval's front edge sits on
            // one line (the leading edge), so they read as one wing; the wing curves down at the wrist when gliding
            // and at the bottom of each downstroke (positive rotation here = tip down).
            const inner = 0.45 + spread * 0.5, outer = 0.35 + spread * 0.5, LE = 0.2;
            for (const f of [0.2, 0.45, 0.7, 0.9]) {
              const rx = 0.34 - f * 0.04;
              wg.sphere([rx, 0.035, inner * 0.32], [LE - rx, 0, side * inner * f], heronGrey); // arm: the broad inner wing
              wg.sphere([0.13, 0.03, inner * 0.32], [LE - rx * 2 + 0.1, -0.005, side * inner * f], heronDark); // dark trailing secondaries
            }
            wg.sphere([0.05, 0.04, inner * 0.4], [LE - 0.12, 0.02, side * inner * 0.5], { team: 'primary', tex: 'cloth' }); // a thin war-paint stripe
            const bow = held ? 0.45 : 0.15 + 0.35 * Math.max(0, Math.sin(t)); // deepest at the bottom of the downstroke
            // the hand curves down smoothly: four ovals, each bent a little more than the last (no hinge)
            const seg = outer / 4, step = (side * bow * spread) / 4;
            const curve = (j: ModelBuilder, k: number): void => {
              if (k === 4) {
                for (let f = 0; f < 5; f++) { // primaries splayed like fingers, longest at the front, rooted in the last oval
                  const len = (0.34 - f * 0.03) * (0.55 + spread * 0.45);
                  j.sphere([0.05, 0.014, len / 2], [LE - 0.07 - f * 0.07, -0.005, side * (len / 2 - seg * 0.2)], heronDark, [0, side * (f * 0.13 - 0.1) * spread, 0]);
                }
                return;
              }
              const rx = 0.3 - (k / 4) * 0.1;
              j.sphere([rx, 0.03, seg * 0.75], [LE - 0.02 * (k / 4) - rx, 0, side * seg * 0.5], heronGrey);
              j.joint([0, 0, side * seg], [step, 0, 0], (n) => curve(n, k + 1));
            };
            wg.joint([0, 0, side * inner * 0.9], [step, 0, 0], (hand) => curve(hand, 0));
          });
        }
        // bronze-bound siege basket hung on chains beneath the belly, glowing with heavy crystals
        c.cylinder(0.32, 0.25, 0.34, [0.05, 0.96, 0], WICKER, undefined, 10);
        for (const y of [0.82, 1.1]) c.cylinder(0.33, 0.33, 0.035, [0.05, y, 0], HERON_BRONZE, undefined, 12);
        for (const [x, z] of [[0.3, 0], [-0.2, 0.2], [-0.2, -0.2]]) c.limb([0.05 + x * 0.9, 1.12, z * 0.9], [0.05 + x * 0.5, 1.45, z * 0.6], 0.012, HERON_CHAIN);
        if (p.armed) for (const [x, z] of [[-0.05, 0.08], [0.12, -0.07], [0.02, -0.1]]) c.crystal(0.17, [0.05 + x, 1.14, z], [0.2, 0, 0.3]);
        if (p.armed) c.sphere(0.12, [0.05, 1.16, 0], { color: '#9fefff', emissive: '#3ab8e0' }); // the glow of the load
        // saddle cloth and the rider, steering with a willow switch and heaving crystals over the side
        c.box([0.5, 0.05, 0.6], [-0.05, 1.8, 0], { team: 'primary', tex: 'cloth' });
        c.joint([-0.1, 1.78, 0], [0, 0, 0], (r) => body(r, { ...p, anim: attacking ? 'attack' : 'idle' }, riderLook, fenArm(p, 'sling'), (h) => {
          h.limb([0, 0.2, 0], [0, -0.45, 0], 0.012, WILLOW);
        }), 0.75);
        // a tall reed war-banner, streaming in flight
        c.limb([-0.3, 1.8, 0.18], [-0.38, 2.85, 0.18], 0.014, WILLOW);
        c.box([0.42, 0.26, 0.02], [-0.6 - (flying ? 0.08 : 0), 2.7, 0.18], { team: 'primary', tex: 'cloth' }, [0, 0, flying ? Math.sin(t * 2) * 0.15 : 0]);
        c.sphere(0.035, [-0.38, 2.87, 0.18], HERON_BRONZE);
      }));
    }, 1.4); // drawn big: it towers over a reed hut
  },
};

/** The Great Siege Heron: the siege-heron model grown vast, a 400-root body carrying twelve crystals. */
const greatSiegeHeron: FenUnit = {
  ...siegeHeron,
  id: 'great-siege-heron',
  name: 'Great Siege Heron',
  description: 'The eldest of the siege herons, vast as a reed hut, its basket heaped with twelve great crystals. Slow to rise and hungry in the air, but one pass can flatten a hall.',
  mass: 540,
  attack: { style: 'throw', crystalMass: 8, ammo: 12 },
  model: (b, p) => b.joint([0, 0, 0], [0, 0, 0], (s) => siegeHeron.model(s, p), 1.45),
};

export const units: FenUnit[] = [fenling, reedguard, bogToad, packTortoise, greatSiegeHeron];

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
    id: 'elder-mound', name: 'Elder Mound', description: 'Where the fen\'s lore is kept and taught: every deep technology is learned here, and only here. The great siege herons roost on its crown.',
    size: 3, materials: 700, requires: ['reed-hut'], trains: ['great-siege-heron'], researches: ['fen-lore', 'fen-lore-2', 'fen-lore-3', 'reed-lore', 'toad-lore'], model: models.elderMound,
  },
  {
    id: 'heron-perch', name: 'Heron Perch', description: 'A spindly platform on very tall stilts with a sling-arm on top: reaches far, but can\'t hit the ground right beneath it.',
    size: 1, materials: 90, attack: { mechanism: 25, crystalMass: 0.4, height: 8, stockShots: 40 }, model: models.heronPerch,
  },
];

const techs: TechSpec[] = [
  { id: 'long-breath', name: 'Long Breath', description: 'You buy the old breathing songs: every fenling, now and to come, works, wades and carries 30% more (work refinement +0.3).', unit: 'fenling', refinement: 0.3, channel: 'work',
    flavor: '"Hum low, and the bog forgets you are tired." — Elder Murk' },
  { id: 'fen-lore', name: 'Fen Lore', description: 'You buy the spawning lore: fenlings are cheaper to raise (refinement +0.5, so each costs its body\'s price ÷ refinement). Same frog, less food.', unit: 'fenling', refinement: 0.5,
    flavor: 'The first lesson of the Mound: a hungry tadpole is a wasted tadpole.' },
  { id: 'fen-lore-2', name: 'Fen Lore II', description: 'Deeper lore: fenlings +0.5 refinement more, cheaper again.', unit: 'fenling', refinement: 0.5,
    flavor: '"We do not raise an army. We let the fen remember it has one." — Spawn-singer Oolu' },
  { id: 'fen-lore-3', name: 'Fen Lore III', description: 'The whole lore: fenlings +0.5 more, 2.5× in all — about 40% of their first price.', unit: 'fenling', refinement: 0.5,
    flavor: 'By the third spring the pools boil with them, and the Meadowfolk stop sleeping near water.' },
  { id: 'reed-lore', name: 'Reed Lore', description: 'You buy the weaving of reed shields: Reedguards are cheaper to raise (refinement +0.6).', unit: 'reedguard', refinement: 0.6,
    flavor: 'A single reed bends. Woven a thousand times, it turns a mace.' },
  { id: 'toad-lore', name: 'Toad Lore', description: 'You buy the toad-wrangler\'s secrets: Bog Toads are cheaper to raise (refinement +0.6). Just as big, just as hungry.', unit: 'bog-toad', refinement: 0.6,
    flavor: '"Sing to it while it eats. It is less likely to eat you." — Toad-wrangler Glim' },
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
