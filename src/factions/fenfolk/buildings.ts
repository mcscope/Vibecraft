// Fenfolk buildings: reed and willow on stilts over the water, peat walls, an earthen mound.
// One map tile = 2 model units; a size-n building spans 2n.
import type { Mat, ModelBuilder } from '../../kits/bake3d/types';

const REED: Mat = { color: '#b8a466', tex: 'thatch' };
const REED_DARK: Mat = { color: '#8a7a48', tex: 'thatch' };
const WILLOW: Mat = { color: '#6a5a3c', tex: 'wood' };
const PEAT: Mat = { color: '#3e3226', tex: 'stone' };
const MUD: Mat = { color: '#5a4a34', tex: 'stone' };
const BANNER: Mat = { team: 'primary', tex: 'cloth' };

const STONE: Mat = { color: '#7e7a6e', tex: 'stone' };
const MOSS: Mat = { color: '#4f6a34', tex: 'leaf' };
const WATER: Mat = { color: '#2f4a44', rough: 0.08 };
const BRONZE: Mat = { color: '#b0823a', tex: 'metal', metal: 0.5, rough: 0.35 };
const BONE: Mat = { color: '#d8ccaa', rough: 0.6 };
const GLOW: Mat = { color: '#9fefff', emissive: '#3ab8e0' };
const PLANK: Mat = { color: '#7a6644', tex: 'plank' };
const DARK: Mat = { color: '#2a2016', tex: 'wood' };

/** A platform on braced stilts. */
function stilts(b: ModelBuilder, w: number, d: number, h: number, cx = 0, cz = 0): void {
  for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) for (const z of [-d / 2 + 0.15, d / 2 - 0.15]) {
    b.cylinder(0.07, 0.09, h + 0.1, [cx + x, h / 2, cz + z], WILLOW, undefined, 6);
  }
  for (const z of [-d / 2 + 0.15, d / 2 - 0.15]) { // cross braces
    b.limb([cx - w / 2 + 0.15, 0.1, cz + z], [cx + w / 2 - 0.15, h - 0.1, cz + z], 0.03, WILLOW);
    b.limb([cx + w / 2 - 0.15, 0.1, cz + z], [cx - w / 2 + 0.15, h - 0.1, cz + z], 0.03, WILLOW);
  }
  b.box([w, 0.1, d], [cx, h, cz], PLANK);
}

/** A layered thatch roof: three overlapping skirts and a bound top-knot. */
function thatch(b: ModelBuilder, r: number, h: number, y: number, x = 0, z = 0): void {
  b.cone(r * 1.08, h * 0.45, [x, y + h * 0.22, z], REED_DARK, undefined, 14);
  b.cone(r * 0.85, h * 0.55, [x, y + h * 0.42, z], REED, undefined, 14);
  b.cone(r * 0.55, h * 0.5, [x, y + h * 0.7, z], REED_DARK, undefined, 12);
  b.cylinder(r * 0.12, r * 0.16, h * 0.12, [x, y + h * 0.95, z], BRONZE, undefined, 8); // binding
  b.limb([x, y + h, z], [x + r * 0.05, y + h * 1.25, z], r * 0.04, REED); // top-knot
}

/** A crystal lantern hung from a crooked pole. */
function lantern(b: ModelBuilder, x: number, z: number, h = 1.6): void {
  b.cylinder(0.035, 0.045, h, [x, h / 2, z], WILLOW, undefined, 6);
  b.limb([x, h - 0.05, z], [x + 0.3, h + 0.1, z], 0.025, WILLOW);
  b.limb([x + 0.3, h + 0.08, z], [x + 0.3, h - 0.2, z], 0.008, DARK);
  b.cylinder(0.08, 0.06, 0.16, [x + 0.3, h - 0.3, z], BRONZE, undefined, 6);
  b.sphere(0.07, [x + 0.3, h - 0.3, z], GLOW);
}

/** A squat stone frog idol with glowing crystal eyes. */
function frogIdol(b: ModelBuilder, x: number, z: number, k: number, face = 0): void {
  b.joint([x, 0, z], [0, face, 0], (f) => {
    f.box([0.7 * k, 0.15 * k, 0.7 * k], [0, 0.07 * k, 0], STONE);
    f.sphere([0.42 * k, 0.32 * k, 0.4 * k], [0, 0.42 * k, 0], STONE);
    f.sphere([0.3 * k, 0.22 * k, 0.32 * k], [0.15 * k, 0.75 * k, 0], STONE); // head
    for (const s of [1, -1]) {
      f.sphere(0.09 * k, [0.25 * k, 0.92 * k, 0.16 * k * s], STONE);
      f.sphere(0.06 * k, [0.3 * k, 0.94 * k, 0.17 * k * s], GLOW); // eyes
      f.sphere([0.12 * k, 0.1 * k, 0.1 * k], [0.25 * k, 0.15 * k, 0.32 * k * s], STONE); // forefeet
    }
    f.box([0.04 * k, 0.03 * k, 0.4 * k], [0.42 * k, 0.68 * k, 0], DARK); // the wide mouth
    f.sphere([0.3 * k, 0.12 * k, 0.3 * k], [-0.05 * k, 0.62 * k, 0], MOSS); // moss on its back
  });
}

/** A string of bones and shells hanging from (x, y, z). */
function charms(b: ModelBuilder, x: number, y: number, z: number): void {
  b.limb([x, y, z], [x, y - 0.4, z], 0.006, DARK);
  for (let i = 0; i < 3; i++) b.sphere([0.03, 0.05, 0.03], [x, y - 0.12 - i * 0.12, z], i % 2 ? BONE : { color: '#c8b890', rough: 0.4 });
}

/** A rack of fish drying in the sun. */
function dryingRack(b: ModelBuilder, x: number, z: number, rot = 0): void {
  b.joint([x, 0, z], [0, rot, 0], (r) => {
    for (const s of [-0.4, 0.4]) r.cylinder(0.025, 0.03, 0.9, [0, 0.45, s], WILLOW, undefined, 5);
    r.limb([0, 0.88, -0.45], [0, 0.88, 0.45], 0.02, WILLOW);
    for (let i = 0; i < 4; i++) r.sphere([0.04, 0.14, 0.025], [0, 0.72, -0.3 + i * 0.2], { color: '#8a9a9a', rough: 0.3 });
  });
}

export function stiltHall(b: ModelBuilder): void {
  b.cylinder(2.9, 3.0, 0.06, [0, 0.03, 0], MUD, undefined, 20);
  b.cylinder(2.3, 2.3, 0.05, [0.1, 0.06, 0.1], WATER, undefined, 20); // its own pool beneath
  for (let i = 0; i < 10; i++) { // reeds round the pool
    const a = (i / 10) * Math.PI * 2 + 0.2;
    b.limb([Math.cos(a) * 2.6, 0.05, Math.sin(a) * 2.6], [Math.cos(a) * 2.7, 0.6 + (i % 3) * 0.15, Math.sin(a) * 2.7], 0.02, REED);
  }
  stilts(b, 4.6, 4.0, 1.0);
  // railing round the deck
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.cos(a) * 2.15, z = Math.sin(a) * 1.85;
    b.cylinder(0.025, 0.03, 0.4, [x, 1.25, z], WILLOW, undefined, 5);
    if (i % 3 === 0) charms(b, x, 1.4, z);
  }
  // the hall: woven walls banded with bronze, a two-tier roof
  b.cylinder(1.75, 1.9, 1.3, [0, 1.7, 0], REED_DARK, undefined, 16);
  for (const y of [1.2, 2.25]) b.cylinder(1.92, 1.92, 0.06, [0, y, 0], BRONZE, undefined, 16);
  thatch(b, 2.4, 2.4, 2.25);
  b.box([0.7, 1.0, 0.1], [0, 1.6, 1.88], DARK); // doorway
  for (const s of [-1, 1]) b.cylinder(0.05, 0.05, 1.1, [0.42 * s, 1.6, 1.9], BONE, undefined, 6); // bone door-posts
  // a smaller hut on the deck
  b.cylinder(0.5, 0.55, 0.6, [-1.6, 1.35, -1.2], REED_DARK, undefined, 10);
  thatch(b, 0.75, 0.8, 1.65, -1.6, -1.2);
  // ladder up from the pool, a carved frog totem beside it
  for (const s of [-0.25, 0.25]) b.limb([2.9, 0.05, s + 0.8], [2.25, 1.05, s + 0.8], 0.04, WILLOW);
  for (let i = 1; i < 5; i++) { const t = i / 5; b.limb([2.9 - 0.65 * t, 0.05 + t, 0.55], [2.9 - 0.65 * t, 0.05 + t, 1.05], 0.02, WILLOW); }
  frogIdol(b, 2.6, -0.4, 0.9, 0);
  lantern(b, 2.4, 1.8, 2.0);
  lantern(b, -2.4, 1.4, 1.8);
  dryingRack(b, -2.5, -0.6, 0.4);
  b.cylinder(0.04, 0.05, 3.6, [-2.2, 1.8, 1.9], WILLOW, undefined, 8); // a tall banner
  b.box([0.04, 0.8, 0.6], [-2.2, 3.1, 2.22], BANNER);
  for (let i = 0; i < 3; i++) b.limb([-2.2, 3.6, 1.9], [-2.15, 3.95 + i * 0.07, 1.9 + (i - 1) * 0.08], 0.015, REED);
}

export function reedHut(b: ModelBuilder): void {
  b.cylinder(0.9, 0.95, 0.04, [0, 0.02, 0], MUD, undefined, 12);
  stilts(b, 1.6, 1.6, 0.55);
  b.cylinder(0.58, 0.64, 0.6, [0, 0.9, 0], REED_DARK, undefined, 12);
  b.cylinder(0.65, 0.65, 0.04, [0, 0.62, 0], BRONZE, undefined, 12);
  thatch(b, 0.85, 0.95, 1.15);
  b.box([0.05, 0.38, 0.32], [0.62, 0.82, 0], DARK); // door
  b.box([0.35, 0.05, 0.5], [0.85, 0.57, 0], PLANK); // porch
  charms(b, 0.75, 1.15, 0.3);
  lantern(b, -0.75, 0.6, 1.3);
  b.cylinder(0.025, 0.03, 1.7, [-0.75, 0.85, -0.7], WILLOW, undefined, 6);
  b.box([0.03, 0.35, 0.4], [-0.75, 1.5, -0.5], BANNER);
}

export function peatFarm(b: ModelBuilder): void {
  b.box([3.7, 0.08, 3.7], [0, 0.04, 0], MUD);
  // raised beds of dark peat between glinting channels, heavy with fen-roots
  for (const z of [-1.15, 0, 1.15]) {
    b.box([3.0, 0.26, 0.82], [0, 0.17, z], PEAT);
    for (let i = 0; i < 6; i++) {
      const x = -1.25 + i * 0.5;
      b.sphere([0.17, 0.14, 0.17], [x, 0.38, z - 0.15], { color: i % 2 ? '#3d5a28' : '#4a6a2e', tex: 'leaf' });
      b.sphere([0.14, 0.12, 0.14], [x + 0.2, 0.36, z + 0.18], { color: '#5a7a34', tex: 'leaf' });
      if (i % 2) b.sphere([0.06, 0.08, 0.06], [x + 0.1, 0.33, z + 0.3], { color: '#c89a5a', rough: 0.6 }); // a fat root showing
    }
  }
  for (const z of [-0.58, 0.58]) {
    b.box([3.4, 0.04, 0.26], [0, 0.07, z], WATER);
    b.box([0.8, 0.045, 0.1], [-0.6 + z, 0.075, z + 0.04], { color: '#5a8a8a', rough: 0.05 }); // glints
  }
  for (const [x, z] of [[1.55, 1.65], [1.8, 1.4]]) b.box([0.45, 0.35, 0.35], [x, 0.25, z], PEAT); // stacked peat bricks
  // a little reed shelter over the tools
  for (const [x, z] of [[-1.7, -1.7], [-1.0, -1.7], [-1.7, -1.0], [-1.0, -1.0]]) b.cylinder(0.025, 0.03, 0.9, [x, 0.45, z], WILLOW, undefined, 5);
  b.box([0.95, 0.06, 0.95], [-1.35, 0.92, -1.35], REED, [0, 0, 0.12]);
  frogIdol(b, 1.6, -1.6, 0.6, Math.PI);
  lantern(b, -1.75, 1.6, 1.4);
  b.cylinder(0.025, 0.03, 1.8, [1.75, 0.9, 0.1], WILLOW, undefined, 6);
  b.box([0.03, 0.4, 0.5], [1.75, 1.55, 0.35], BANNER);
}

export function toadWallow(b: ModelBuilder): void {
  b.cylinder(1.95, 2.0, 0.08, [0, 0.04, 0], MUD, undefined, 18);
  b.cylinder(1.45, 1.45, 0.05, [0.25, 0.09, 0.25], WATER, undefined, 18); // the wallow
  for (const [x, z, r] of [[0.7, 0.9, 0.18], [-0.2, 0.9, 0.14], [0.9, -0.2, 0.16]]) b.cylinder(r, r, 0.012, [x, 0.12, z], { color: '#4a7a3a', tex: 'leaf' }, undefined, 9); // lily pads
  // a reed fence round it
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    b.limb([Math.cos(a) * 1.8, 0.05, Math.sin(a) * 1.8], [Math.cos(a) * 1.82, 0.7 + (i % 3) * 0.12, Math.sin(a) * 1.82], 0.03, i % 4 ? REED : WILLOW);
  }
  // the saddling platform and its hut
  stilts(b, 1.3, 1.3, 0.6, -0.95, -0.95);
  thatch(b, 0.85, 0.9, 0.65, -0.95, -0.95);
  for (const z of [-0.2, 0.2]) b.box([0.3, 0.12, 0.25], [-0.2, 0.7, -1.5 + z], { color: '#6a4a2a', tex: 'leather' }); // saddles on a rail
  b.limb([-0.4, 0.75, -1.8], [0.05, 0.75, -1.8], 0.02, WILLOW);
  // two toads: one wallowing, one dozing on the bank
  b.sphere([0.45, 0.25, 0.4], [0.4, 0.15, 0.3], { color: '#5a6a3a', tex: 'leather' });
  for (const s of [1, -1]) b.sphere(0.07, [0.72, 0.32, 0.3 + 0.16 * s], { color: '#d8b84a', rough: 0.3 });
  b.sphere([0.35, 0.22, 0.32], [1.2, 0.2, -1.1], { color: '#4e5e32', tex: 'leather' });
  lantern(b, 1.6, 1.2, 1.5);
  b.cylinder(0.025, 0.03, 1.7, [-1.6, 0.85, 1.3], WILLOW, undefined, 6);
  b.box([0.03, 0.4, 0.5], [-1.6, 1.5, 1.55], BANNER);
}

export function elderMound(b: ModelBuilder): void {
  b.sphere([2.7, 1.55, 2.7], [0, 0, 0], { color: '#4f5a34', tex: 'leaf' }); // grassed earthen mound
  b.sphere([2.0, 1.2, 2.0], [-0.3, 0.15, -0.4], { color: '#56643a', tex: 'leaf' }); // a second swell
  // the doorway is the gaping mouth of a great stone frog head
  b.sphere([1.0, 0.75, 1.1], [0.2, 0.75, 2.05], STONE);
  b.box([0.25, 0.55, 0.85], [0.45, 0.45, 2.75], DARK); // the dark mouth
  b.box([0.3, 0.08, 1.1], [0.48, 0.78, 2.7], STONE); // upper lip
  for (const s of [1, -1]) {
    b.sphere(0.32, [0.35, 1.35, 2.05 + 0.55 * s], STONE); // eye bulges
    b.sphere(0.2, [0.55, 1.4, 2.12 + 0.55 * s], GLOW); // crystal eyes
  }
  // glowing runes cut into the mound
  for (const [x, y, z, r] of [[-1.6, 0.8, 1.8, 0.7], [1.9, 0.7, 1.2, -0.5], [-2.2, 0.6, -0.6, 1.4], [1.0, 1.1, -1.9, 2.6]]) {
    b.box([0.04, 0.35, 0.08], [x, y, z], GLOW, [0, r, 0]);
    b.box([0.04, 0.08, 0.25], [x, y + 0.08, z], GLOW, [0, r, 0]);
  }
  // a ring of standing stones, each crowned with a crystal
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const h = 1.3 + (i % 2) * 0.5, x = Math.cos(a) * 3.35, z = Math.sin(a) * 3.35;
    if (z > 2.4 && Math.abs(x) < 1.2) continue; // leave the doorway clear
    b.box([0.32, h, 0.24], [x, h / 2, z], STONE, [0, -a, 0.05]);
    b.crystal(0.22, [x, h + 0.12, z], [0, 0, 0]);
  }
  // an old willow growing out of the top, hung with charms
  b.limb([0, 1.4, 0], [0.15, 2.9, 0.1], 0.2, WILLOW, 0.11);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.sphere([0.75, 0.45, 0.75], [Math.cos(a) * 0.65, 3.0, Math.sin(a) * 0.65], { color: '#6a7a3a', tex: 'leaf' });
    b.limb([Math.cos(a) * 0.9, 2.9, Math.sin(a) * 0.9], [Math.cos(a) * 1.25, 1.7, Math.sin(a) * 1.25], 0.03, { color: '#7a8a44', tex: 'leaf' }); // trailing fronds
    if (i % 2) charms(b, Math.cos(a) * 1.1, 2.6, Math.sin(a) * 1.1);
  }
  lantern(b, 1.5, 2.6, 1.8);
  lantern(b, -1.2, 2.7, 1.8);
}

export function heronPerch(b: ModelBuilder): void {
  // a very tall stilt tower with a great stick nest on top and a sling-arm
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) b.limb([x * 1.3, 0, z * 1.3], [x * 0.75, 6.4, z * 0.75], 0.08, WILLOW, 0.055);
  for (const y of [1.6, 3.2, 4.8]) {
    b.box([1.3, 0.06, 1.3], [0, y, 0], PLANK);
    b.limb([-0.75, y, -0.75], [0.75, y + 1.5, -0.75], 0.025, WILLOW); // zig-zag braces
  }
  for (let i = 0; i < 12; i++) b.limb([0.95, 0.3 + i * 0.5, 0.1], [0.95, 0.3 + i * 0.5, 0.45], 0.02, WILLOW); // ladder rungs
  b.box([1.5, 0.1, 1.5], [0, 6.4, 0], PLANK);
  // the nest: a thick ring of sticks
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    b.limb([Math.cos(a) * 0.85, 6.5, Math.sin(a) * 0.85], [Math.cos(a + 0.9) * 0.85, 6.7 + (i % 3) * 0.05, Math.sin(a + 0.9) * 0.85], 0.04, i % 2 ? WILLOW : DARK);
  }
  b.cylinder(0.75, 0.8, 0.18, [0, 6.55, 0], { color: '#5a4a30', tex: 'wood' }, undefined, 14);
  thatch(b, 0.7, 0.8, 7.2);
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) b.limb([x, 6.5, z], [x, 7.25, z], 0.035, WILLOW);
  b.limb([-0.3, 6.7, 0], [0.95, 7.35, 0], 0.06, WILLOW, 0.035); // sling-arm
  b.cylinder(0.1, 0.12, 0.14, [0.95, 7.3, 0], BRONZE, undefined, 6);
  b.crystal(0.24, [1.0, 7.35, 0], [0.3, 0, 0.4]);
  charms(b, 0.75, 6.35, 0.75);
  b.cylinder(0.025, 0.03, 1.3, [0.6, 8.2, 0.6], WILLOW, undefined, 6);
  b.box([0.03, 0.4, 0.5], [0.6, 8.6, 0.88], BANNER);
}

export function fenBanner(b: ModelBuilder): void {
  b.cylinder(0.03, 0.035, 1.6, [0, 0.8, 0], WILLOW, undefined, 8);
  b.box([0.03, 0.55, 0.4], [0, 1.3, 0.21], BANNER);
  for (let i = 0; i < 3; i++) b.limb([0, 1.6, 0], [0.05, 1.85 + i * 0.05, (i - 1) * 0.06], 0.012, REED); // reed tassel
}

/** "Needs supplies": a reed pole with an empty clay pot swinging from it, mouth down. */
export function fenWantFlag(b: ModelBuilder): void {
  b.cylinder(0.03, 0.035, 1.7, [0, 0.85, 0], WILLOW, undefined, 8);
  b.limb([0, 1.6, 0], [0.45, 1.75, 0], 0.025, WILLOW); // a bent arm at the top
  b.limb([0.42, 1.73, 0], [0.42, 1.45, 0], 0.008, REED_DARK);
  b.sphere([0.17, 0.15, 0.17], [0.42, 1.3, 0], { color: '#9a5a34', tex: 'stone' }, [0.3, 0, 2.6]); // clay pot, tipped over: empty
  b.cylinder(0.08, 0.09, 0.06, [0.36, 1.18, 0], { color: '#7a4428', tex: 'stone' }, [0, 0, 2.6], 10); // its mouth
  b.box([0.03, 0.32, 0.26], [0, 1.25, 0.14], BANNER, [0.15, 0, 0]); // a ragged team rag
  for (let i = 0; i < 3; i++) b.limb([0, 1.7, 0], [0.04, 1.95 + i * 0.05, (i - 1) * 0.06], 0.012, REED);
}

/** One tile of dug channel: still dark water, mud and reeds at the corners. */
export function canal(b: ModelBuilder): void {
  // water right to the tile's edges, so a line of them reads as one channel
  b.box([2.0, 0.06, 2.0], [0, 0.03, 0], { color: '#2e4a46', rough: 0.08 });
  b.box([1.1, 0.062, 0.7], [0.15, 0.03, -0.2], { color: '#3a5a52', rough: 0.05 }); // a lighter glint
  for (const [x, z] of [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]]) b.sphere([0.16, 0.06, 0.16], [x, 0.04, z], MUD); // mud at the corners
  for (const [x, z] of [[-0.9, -0.9], [0.9, 0.8], [-0.85, 0.85]]) {
    for (let i = 0; i < 4; i++) b.limb([x, 0.05, z], [x + (i - 1.5) * 0.06, 0.45 + i * 0.07, z + (i % 2 ? 0.05 : -0.05)], 0.018, REED);
  }
  b.cylinder(0.12, 0.12, 0.012, [0.4, 0.1, 0.35], { color: '#4a7a3a', tex: 'leaf' }, undefined, 9); // a lily pad
}

