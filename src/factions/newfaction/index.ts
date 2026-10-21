// New faction (working title: the user hasn't named it or most of its units yet; see docs/NEW_FACTION_NOTES.md).
// A faction with no buildings that climbs by changing form:
//   • a mother lays eggs (trained in her body, a queue; she lays anything up to her own refinement);
//   • an egg hatches into the larva of its tier (fed by Give: the mother carries food to it);
//   • a larva gathers, then changes inside a cocoon into an offshoot one refinement up, the next tier's larva, or a
//     mother of its own tier.
// Placeholder names, bodies, attacks and looks are marked PLACEHOLDER: the user decides them. The larvae (caterpillars:
// small green, medium cyan, big purple/pink) and the eggs (whitish origami-like, sized by tier and tinted toward their
// larva) follow the user's description. The Dragon Fly is the user's; its fire (from crystal) is still to design.
// Self-contained: only engine types and kits, never another faction.
import type { FactionSpec, UnitSpec } from '../types';
import type { ModelBuilder, Pose } from '../../kits/bake3d/types';
import type { Mat } from '../../kits/bake3d/types';

type Unit = UnitSpec & { model: (b: ModelBuilder, p: Pose) => void };
const TAU = Math.PI * 2;

// ── looks ────────────────────────────────────────────────────────────────────

/** The larvae's colours by tier (the user's). */
const TIER = { 1: '#5fae3a', 2: '#2fb8c4', 3: '#b04fb8' } as const;

/** Drawn size from mass: models are about life size, a body's length grows with the cube root of its mass. */
const sizeFor = (mass: number, ref: number) => Math.cbrt(mass / ref);

/** A caterpillar: a row of segments that ripple as it crawls, stubby legs, a round head (the user's larvae). */
function caterpillar(b: ModelBuilder, p: Pose, color: string, mass: number): void {
  const skin: Mat = { color, tex: 'skin', rough: 0.55 };
  const belly: Mat = { color: '#e8e2c8', tex: 'skin' };
  const n = 7, crawl = p.anim === 'walk' ? p.phase * TAU : 0;
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    for (let i = 0; i < n; i++) {
      const x = 0.42 - i * 0.14, lift = p.anim === 'walk' ? Math.max(0, Math.sin(crawl - i * 0.9)) * 0.05 : 0;
      const r = 0.1 - Math.abs(i - 2) * 0.006;
      c.sphere([r * 1.05, r, r], [x, r + lift, 0], skin);
      c.sphere([r * 0.7, r * 0.35, r * 0.75], [x, r * 0.45 + lift, 0], belly);
      if (i > 0 && i < n - 1) for (const z of [1, -1]) c.limb([x, 0.06 + lift, z * r * 0.7], [x, 0.0, z * r * 1.0], 0.016, skin); // stubby legs
      if (i % 2 === 0) c.sphere(0.022, [x - 0.02, r * 1.7 + lift, 0], { team: 'primary', tex: 'none' }); // a team dot down its back
    }
    const eat = p.anim === 'gather' || p.anim === 'eat' ? Math.sin(p.phase * TAU * 2) * 0.03 : 0;
    c.sphere(0.11, [0.56, 0.12 + eat, 0], skin); // head
    for (const z of [1, -1]) c.sphere(0.018, [0.65, 0.15 + eat, z * 0.05], { color: '#111111' });
    if (p.cargo) c.sphere([0.08, 0.06, 0.08], [0.3, 0.24, 0], { color: p.cargo === 'food' ? '#a83a4a' : p.cargo === 'wood' ? '#7a5634' : '#8fe6ff' });
  }, sizeFor(mass, 15) * 1.2);
}

/** An egg: a whitish, folded, faceted shell (origami-like), tinted toward its larva, sized by tier (the user's). */
function origamiEgg(b: ModelBuilder, p: Pose, tint: string, mass: number): void {
  const paper: Mat = { color: mix('#f2efe6', tint, 0.18), tex: 'none', rough: 0.85 };
  const fold: Mat = { color: mix('#d9d4c4', tint, 0.28), tex: 'none', rough: 0.85 };
  const breathe = 1 + (p.anim === 'idle' ? Math.sin(p.phase * TAU) * 0.02 : 0);
  b.joint([0, 0, 0], [0, 0, 0], (e) => {
    e.cylinder(0.0, 0.2, 0.3, [0, 0.35, 0], paper, undefined, 5); // folded top
    e.cylinder(0.2, 0.0, 0.3, [0, 0.05 + 0.0, 0], fold, undefined, 5); // folded bottom
    e.cylinder(0.2, 0.2, 0.06, [0, 0.2, 0], paper, [0, Math.PI / 5, 0], 5); // the crease band
  }, sizeFor(mass, 15) * breathe);
}

/** PLACEHOLDER body for the units the user hasn't described: a segmented bug on six legs, sized by mass. */
function bug(b: ModelBuilder, p: Pose, color: string, mass: number, weapon: 'strike' | 'pike' | 'sling' | 'none' = 'none'): void {
  const shell: Mat = { color, tex: 'leather', rough: 0.45 };
  const t = p.phase * TAU, walking = p.anim === 'walk';
  const jab = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase / 0.6) * Math.PI) : 0;
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    c.sphere([0.22, 0.13, 0.14], [-0.12, 0.3, 0], shell); // abdomen
    c.sphere([0.13, 0.11, 0.11], [0.12, 0.32, 0], shell); // thorax
    c.sphere(0.09, [0.28 + jab * 0.08, 0.36, 0], shell); // head
    c.box([0.04, 0.03, 0.2], [0.12, 0.42, 0], { team: 'primary', tex: 'cloth' }); // team band
    for (const [x, ph] of [[0.16, 0], [0.06, Math.PI], [-0.04, 0]] as const) for (const z of [1, -1]) {
      const a = walking ? Math.sin(t + ph + (z > 0 ? 0 : Math.PI)) * 0.35 : 0;
      c.limb([x, 0.28, z * 0.08], [x + 0.08 + a * 0.1, 0.18, z * 0.22], 0.018, shell);
      c.limb([x + 0.08 + a * 0.1, 0.18, z * 0.22], [x + 0.1 + a * 0.18, 0, z * 0.26], 0.014, shell);
    }
    if (weapon === 'strike' && p.armed) c.crystal(0.16, [0.42 + jab * 0.12, 0.34, 0], [0, 0, -Math.PI / 2]);
    if (weapon === 'pike' && p.armed) {
      c.limb([0.05 + jab * 0.2, 0.36, 0.06], [0.95 + jab * 0.2, 0.42, 0.06], 0.012, { color: '#9a8a5a', tex: 'wood' });
      c.crystal(0.1, [1.0 + jab * 0.2, 0.42, 0.06], [0, 0, -Math.PI / 2]);
    }
    if (weapon === 'sling') c.limb([0.2, 0.38, 0.08], [0.2 + Math.cos(t * 2) * 0.15, 0.6, 0.08], 0.008, { color: '#5a4a3a' });
  }, sizeFor(mass, 40));
}

/** PLACEHOLDER flier: a bug with two pairs of broad butterfly-like wings that beat in flight. */
function winged(b: ModelBuilder, p: Pose, color: string, wing: string, mass: number, reptile = false): void {
  const shell: Mat = { color, tex: reptile ? 'skin' : 'leather', rough: 0.45 };
  const wingMat: Mat = { color: wing, tex: 'none', rough: 0.7 };
  const flying = p.anim === 'fly' || p.anim === 'climb' || p.anim === 'soar' || p.anim === 'glide' || p.anim === 'leap' || p.anim === 'land';
  const beat = flying ? Math.sin(p.phase * TAU) * 0.7 : -0.9; // folded up on the ground
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    c.sphere([0.32, 0.1, 0.1], [-0.15, 0.35, 0], shell);
    c.sphere([0.14, 0.12, 0.12], [0.15, 0.37, 0], shell);
    c.sphere(0.1, [0.32, 0.4, 0], shell);
    if (reptile) c.cone(0.06, 0.18, [0.44, 0.4, 0], shell, [0, 0, -Math.PI / 2], 6); // snout
    c.box([0.04, 0.03, 0.22], [0.15, 0.48, 0], { team: 'primary', tex: 'cloth' });
    for (const z of [1, -1]) {
      c.joint([0.18, 0.44, z * 0.08], [z * beat, 0, 0], (wg) => wg.sphere([0.22, 0.012, 0.42], [0, 0, z * 0.4], wingMat));
      c.joint([0.02, 0.44, z * 0.08], [z * beat * 0.85, 0, 0], (wg) => wg.sphere([0.18, 0.012, 0.32], [-0.05, 0, z * 0.32], wingMat));
      if (!flying) for (const x of [0.2, 0.05, -0.1]) c.limb([x, 0.32, z * 0.07], [x + 0.06, 0, z * 0.18], 0.016, shell);
    }
  }, sizeFor(mass, 40));
}

/**
 * The mother: a big grub built around her thorax (the model's origin, so she turns from there), with a head in front,
 * a long abdomen behind with two cavities on its back either side, and eggs clustered at the thorax.
 */
function mother(b: ModelBuilder, p: Pose, mass: number): void {
  const skin: Mat = { color: '#c9b48a', tex: 'skin', rough: 0.6 };
  const dark: Mat = { color: '#3a2a22', tex: 'skin', rough: 0.9 };
  const eggMat: Mat = { color: '#f2efe6', tex: 'none', rough: 0.85 };
  const t = p.phase * TAU, walking = p.anim === 'walk';
  const ripple = (i: number) => (walking ? Math.max(0, Math.sin(t - i)) * 0.03 : 0);
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    // thorax at the origin
    c.sphere([0.2, 0.19, 0.22], [0, 0.22 + ripple(0), 0], skin);
    // head, in front
    c.sphere(0.13, [0.28, 0.2 + ripple(-1), 0], skin);
    for (const z of [1, -1]) c.sphere(0.02, [0.38, 0.24 + ripple(-1), z * 0.06], { color: '#111111' });
    // the abdomen, trailing behind
    for (let i = 1; i <= 4; i++) c.sphere([0.17, 0.17 - i * 0.012, 0.2 - i * 0.008], [-i * 0.2, 0.2 + ripple(i), 0], skin);
    // two cavities on her back, either side
    for (const z of [1, -1]) {
      c.sphere([0.07, 0.03, 0.06], [-0.32, 0.36 + ripple(2), z * 0.11], dark);
      c.cylinder(0.075, 0.075, 0.02, [-0.32, 0.355 + ripple(2), z * 0.11], skin, [0, 0, 0], 12); // the rim
    }
    // eggs clustered at the thorax
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU, r = k === 0 ? 0 : 0.11;
      c.cylinder(0, 0.055, 0.09, [Math.cos(a) * r * 0.8, 0.43 + (k === 0 ? 0.05 : 0) + ripple(0), Math.sin(a) * r], eggMat, [0, a, 0], 5);
      c.cylinder(0.055, 0, 0.05, [Math.cos(a) * r * 0.8, 0.365 + (k === 0 ? 0.05 : 0) + ripple(0), Math.sin(a) * r], eggMat, [0, a, 0], 5);
    }
    c.box([0.05, 0.04, 0.3], [-0.6, 0.36 + ripple(3), 0], { team: 'primary', tex: 'cloth' }); // team band, on the abdomen
    // legs along thorax and abdomen
    for (let i = 0; i < 5; i++) for (const z of [1, -1]) {
      const x = 0.08 - i * 0.2, lift = walking ? Math.max(0, Math.sin(t + i + (z > 0 ? 0 : Math.PI))) * 0.04 : 0;
      c.limb([x, 0.1, z * 0.16], [x + 0.03, lift, z * 0.25], 0.022, skin);
    }
  }, sizeFor(mass, 40) * 1.4);
}

function mix(a: string, b: string, k: number): string {
  const h = (s: string, i: number) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(h(a, i) * (1 - k) + h(b, i) * k).toString(16).padStart(2, '0')).join('');
}

// ── bodies (the numbers worked through with the user; offshoot bodies are PLACEHOLDER) ─────────────────────────

const LARVA = { muscle: 0.8, frame: 0.1, reserve: 0.1 };
const EGG = { muscle: 0.1, frame: 0.1, reserve: 0.8 }; // cheap: an egg is fed after it's laid
const SHELL = { muscle: 0.1, frame: 0.8, reserve: 0.1 };
const MOTHER = { muscle: 0.55, frame: 0.25, reserve: 0.2 }; // enough muscle to carry her dearest egg's price beside her weapon crystal

const unit = (u: Omit<Unit, 'description'> & { description?: string }): Unit => ({ description: '', ...u }) as Unit;

// the larvae: 35 / 70 / 140 food, work refinement = refinement
const larva1 = unit({ id: 'larva1', name: 'T1 Larva', mass: 15, physique: LARVA, refinement: 1, workRefinement: 1, shell: 'cocoon',
  becomes: ['larva2', 'charger', 'micropike', 'tree-worm', 'mother1'], description: 'A small green larva. Gathers, then changes into a T1 form.',
  model: (b, p) => caterpillar(b, p, TIER[1], 15) });
const larva2 = unit({ id: 'larva2', name: 'T2 Larva', mass: 60, physique: LARVA, refinement: 2, workRefinement: 2, shell: 'cocoon',
  becomes: ['larva3', 'flier', 'ground-attacker2', 'slinger', 'mother2'], description: 'A medium cyan larva. Gathers, then changes into a T2 form.',
  model: (b, p) => caterpillar(b, p, TIER[2], 60) });
const larva3 = unit({ id: 'larva3', name: 'T3 Larva', mass: 179, physique: LARVA, refinement: 3, workRefinement: 3, shell: 'cocoon',
  becomes: ['dragon-fly', 'ground-attacker3', 'mother3'], description: 'A big purple larva. Gathers, then changes into a T3 form.',
  model: (b, p) => caterpillar(b, p, TIER[3], 179) });

// eggs: laid cheap (about 19.5 food each), sized by tier, then fed until they hatch into their tier's larva
const egg = (tier: 1 | 2 | 3, mass: number) => unit({ id: `egg${tier}`, name: `T${tier} Egg`, mass, physique: EGG, refinement: tier, canGather: false,
  becomes: [`larva${tier}`], description: `A T${tier} egg. Give it food: it hatches into a T${tier} larva.`,
  model: (b, p) => origamiEgg(b, p, TIER[tier], mass) });

// the shell larvae change inside (at the larva's own mass): mostly frame, tough
const cocoon = unit({ id: 'cocoon', name: 'Cocoon', mass: 15, physique: SHELL, canGather: false, description: 'A larva changing. Give it food to finish.',
  model: (b, p) => origamiEgg(b, p, '#c8b88a', 15) }); // PLACEHOLDER look

// mothers: lay anything up to their own refinement (a mother carries at least her cheapest egg's price)
const motherOf = (r: 1 | 2 | 3, mass: number) => unit({ id: `mother${r}`, name: `Mother (r${r})`, mass, physique: MOTHER, refinement: r,
  spawns: ['egg1', 'egg2', 'egg3'].slice(0, r), attack: { style: 'strike', crystalMass: 1 }, // PLACEHOLDER attack (a side with no buildings needs something that can fight)
  description: `Lays eggs up to T${r}, and carries food to them.`, model: (b, p) => mother(b, p, mass) });

// offshoots, one refinement up (PLACEHOLDER bodies, attacks and names)
const charger = unit({ id: 'charger', name: 'Charger', mass: 38, physique: { muscle: 0.6, frame: 0.25, reserve: 0.15 }, refinement: 2,
  attack: { style: 'strike', crystalMass: 1.5 }, description: 'T1: a fast charging body.', model: (b, p) => bug(b, p, '#7fbf4a', 38, 'strike') });
const micropike = unit({ id: 'micropike', name: 'Micropike', mass: 35, physique: { muscle: 0.45, frame: 0.4, reserve: 0.15 }, refinement: 2,
  attack: { style: 'strike', crystalMass: 0.8, shaft: 1.5 }, description: 'T1: micropikes.', model: (b, p) => bug(b, p, '#6aa84a', 35, 'pike') });
const treeWorm = unit({ id: 'tree-worm', name: 'Tree Worm', mass: 20, physique: { muscle: 0.2, frame: 0.1, reserve: 0.7 }, refinement: 2, canGather: false,
  digestsTrees: true, description: 'T1: turns a whole tree into food, and is absorbed into it.', model: (b, p) => caterpillar(b, p, '#8a9a3a', 20) });
const flier = unit({ id: 'flier', name: 'Flier', mass: 120, physique: { muscle: 0.5, frame: 0.25, reserve: 0.25 }, refinement: 3, flight: true,
  attack: { style: 'strike', crystalMass: 2 }, description: 'T2: a flier.', model: (b, p) => winged(b, p, '#2a9aa6', '#9fe6ee', 120) });
const groundAttacker2 = unit({ id: 'ground-attacker2', name: 'T2 Ground Attacker', mass: 150, physique: { muscle: 0.5, frame: 0.4, reserve: 0.1 }, refinement: 3,
  attack: { style: 'strike', crystalMass: 4 }, description: 'T2: a ground attacker.', model: (b, p) => bug(b, p, '#2a8a96', 150, 'strike') });
const slinger = unit({ id: 'slinger', name: 'Slinger', mass: 60, physique: { muscle: 0.5, frame: 0.3, reserve: 0.2 }, refinement: 3,
  attack: { style: 'throw', crystalMass: 0.5, ammo: 8, sling: 0.6 }, description: 'T2: a slinger.', model: (b, p) => bug(b, p, '#3ab0bc', 60, 'sling') });
const dragonFly = unit({ id: 'dragon-fly', name: 'Dragon Fly', mass: 500, physique: { muscle: 0.5, frame: 0.3, reserve: 0.2 }, refinement: 4, flight: true,
  attack: { style: 'throw', crystalMass: 6, ammo: 10 }, // PLACEHOLDER: its fire (a conversion of crystal) is still to design
  description: 'T3: a fire-breathing dragon with butterfly wings, insectoid and reptilian.', model: (b, p) => winged(b, p, '#8a3a6a', '#e0a0d8', 500, true) });
const groundAttacker3 = unit({ id: 'ground-attacker3', name: 'T3 Ground Attacker', mass: 600, physique: { muscle: 0.5, frame: 0.4, reserve: 0.1 }, refinement: 4,
  attack: { style: 'strike', crystalMass: 8 }, description: 'T3: a ground attacker.', model: (b, p) => bug(b, p, '#9a3aa6', 600, 'strike') });

export const units: Unit[] = [
  motherOf(1, 80), motherOf(2, 120), motherOf(3, 190),
  egg(1, 15), egg(2, 30), egg(3, 45), larva1, larva2, larva3, cocoon,
  charger, micropike, treeWorm, flier, groundAttacker2, slinger, dragonFly, groundAttacker3,
];

export const newFaction: FactionSpec = {
  id: 'newfaction',
  name: 'New Faction', // PLACEHOLDER: not named yet
  workerId: 'mother1', // it starts with one r1 mother, in the field (no buildings)
  startWorkers: 1,
  units,
  art: (team, onProgress, only) => import('./art').then((m) => m.bakeArt(team, onProgress, only)),
};
