// Frost resources: snow-laden spruce and birch (timber), wild oat stands (oats),
// crystals breaking out of snow-capped granite, and highland ground clutter.
// Model units: 1 tile = 2 units; origin = centre of the object's footprint.
import type { Mat, ModelBuilder } from '../../kits/bake3d/types';

const SNOW: Mat = { color: '#ffffff', rough: 1 };
const BARK: Mat = { color: '#3a2c22', tex: 'wood' };
const BIRCH: Mat = { color: '#dcd8cc', tex: 'wood' };
const GRANITE = ['#5e6670', '#6e747a', '#4e565e'];

function rand(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function tree(b: ModelBuilder, variant: number): void {
  const r = rand(variant + 101);
  if (variant % 4 === 3) {
    // birch: pale trunk with dark scars, a thin crown going gold
    const h = 4.2 + r() * 0.8;
    b.limb([0, 0, 0], [r() * 0.2 - 0.1, h * 0.75, r() * 0.2 - 0.1], 0.13, BIRCH, 0.08);
    for (let i = 0; i < 6; i++) b.box([0.06, 0.04, 0.2], [0, 0.4 + i * 0.5, 0], { color: '#2a2622' }, [0, r() * 3, 0]);
    b.limb([0, h * 0.45, 0], [0.55, h * 0.7, 0.25], 0.05, BIRCH, 0.03);
    b.limb([0, h * 0.5, 0], [-0.45, h * 0.75, -0.3], 0.05, BIRCH, 0.03);
    const golds = ['#c9a43a', '#b8902e', '#a8a046', '#d6b84a'];
    for (let i = 0; i < 30; i++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 1.1;
      b.sphere(0.22 + r() * 0.18, [Math.cos(a) * rr, h * 0.72 + (r() - 0.3) * 1.3, Math.sin(a) * rr], { color: golds[Math.floor(r() * golds.length)], tex: 'leaf' });
    }
    b.sphere([0.5, 0.12, 0.5], [0, 0.06, 0], SNOW);
    return;
  }
  // spruce: drooping boughs in many overlapping tiers, snow lying on top of each
  const h = 4.8 + r() * 1.6, lean = (r() - 0.5) * 0.06;
  b.cylinder(0.1, 0.2, h * 0.5, [0, h * 0.25, 0], BARK, undefined, 8);
  const tiers = 11;
  const greens = ['#2f5546', '#365e4c', '#2a4c40'];
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers, y = 0.6 + f * (h - 0.9);
    const rad = 1.35 * (1 - f) ** 0.9 + 0.15;
    const spin = r() * 3, ox = lean * y + (r() - 0.5) * 0.08, oz = (r() - 0.5) * 0.08;
    b.cone(rad, 1.0, [ox, y + 0.5, oz], { color: greens[i % 3], tex: 'leaf' }, [0, spin, 0], 8);
    if (i % 2 === 0 || i > tiers - 4) b.cone(rad * 0.7, 0.42, [ox, y + 0.82, oz], SNOW, [0, spin + 0.4, 0], 8);
  }
  b.cone(0.2, 0.5, [lean * h, h + 0.3, 0], SNOW, undefined, 7);
  b.sphere([0.8, 0.14, 0.8], [0, 0.07, 0], SNOW); // drift around the foot
}

/** Wild oats: a stand of stalks with drooping seed heads; fewer heads as it's harvested. */
export function bush(b: ModelBuilder, level: number): void {
  const r = rand(17);
  const stalks = 22;
  const heads = Math.round(level * stalks);
  b.sphere([0.75, 0.1, 0.65], [0, 0.05, 0], SNOW);
  for (let i = 0; i < stalks; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.6;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = 0.75 + r() * 0.45;
    const lean = [x * 0.25 + (r() - 0.5) * 0.12, h, z * 0.25 + (r() - 0.5) * 0.12] as [number, number, number];
    const top: [number, number, number] = [x + lean[0], lean[1], z + lean[2]];
    b.limb([x, 0, z], top, 0.014, { color: i < heads ? '#c2a050' : '#8a7a54', tex: 'thatch' });
    if (i < heads) {
      // a nodding oat head: a few spikelets hanging from the top
      for (let k = 0; k < 4; k++) {
        const ka = r() * Math.PI * 2;
        b.sphere([0.035, 0.07, 0.035], [top[0] + Math.cos(ka) * 0.06, top[1] - 0.06 - k * 0.05, top[2] + Math.sin(ka) * 0.06], { color: k % 2 ? '#e0c46a' : '#d4b45a', tex: 'thatch' });
      }
    }
  }
  for (let i = 0; i < 6; i++) { // leafy base
    const a = (i / 6) * Math.PI * 2;
    b.cone(0.05, 0.4, [Math.cos(a) * 0.3, 0.18, Math.sin(a) * 0.3], { color: '#6a7a4a', tex: 'leaf' }, [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4], 4);
  }
}

export function mine(b: ModelBuilder, level: number): void {
  const r = rand(23);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r();
    const rr = 0.42 + r() * 0.35, s = 0.3 + r() * 0.28;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    b.rock([s, s * 1.1, s], [x, s * 0.5, z], { color: GRANITE[i % 3], tex: 'stone' }, i + 3);
    b.sphere([s * 0.85, s * 0.28, s * 0.85], [x, s * 1.02, z], SNOW); // snow cap
  }
  b.rock([0.6, 0.6, 0.6], [0, 0.35, 0], { color: '#58606a', tex: 'stone' }, 9);
  b.sphere([0.5, 0.16, 0.5], [0, 0.82, 0], SNOW);
  const n = 3 + Math.round(level * 5);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, rr = r() * 0.45;
    const len = (0.45 + r() * 0.6) * (0.55 + level * 0.6);
    b.crystal(len, [Math.cos(a) * rr, 0.4, Math.sin(a) * rr], [Math.sin(a) * 0.45, 0, Math.cos(a) * 0.45]);
  }
  b.sphere([1.05, 0.1, 1.05], [0, 0.03, 0], SNOW);
}

// ── ground clutter ──

function tussock(b: ModelBuilder, v: number): void {
  const r = rand(v * 31 + 50);
  const cols = ['#a8986a', '#8e8a62', '#b8a87a', '#7a7a5a'];
  for (let i = 0; i < 10 + Math.floor(r() * 6); i++) {
    const a = r() * Math.PI * 2, d = r() * 0.14, h = 0.16 + r() * 0.2;
    b.cone(0.02, h, [Math.cos(a) * d, h / 2, Math.sin(a) * d], { color: cols[Math.floor(r() * 4)], tex: 'thatch' }, [(r() - 0.5) * 0.6, a, (r() - 0.5) * 0.6], 4);
  }
}

function heather(b: ModelBuilder, v: number): void {
  const r = rand(v * 17 + 9);
  tussock(b, v + 20);
  const purple = ['#8a4a8a', '#a05a9a', '#7a3a7a'][v % 3];
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.2;
    b.sphere([0.035, 0.05, 0.035], [Math.cos(a) * d, 0.1 + r() * 0.1, Math.sin(a) * d], { color: purple, rough: 0.7 });
  }
}

function drift(b: ModelBuilder, v: number): void {
  const r = rand(v * 13 + 3);
  for (let i = 0; i < 3; i++) b.sphere([0.18 + r() * 0.14, 0.05 + r() * 0.04, 0.12 + r() * 0.1], [(r() - 0.5) * 0.3, 0.02, (r() - 0.5) * 0.3], SNOW, [0, r() * 3, 0]);
}

function snowStones(b: ModelBuilder, v: number): void {
  const r = rand(v * 7 + 41);
  for (let i = 0; i < 2 + Math.floor(r() * 3); i++) {
    const a = r() * Math.PI * 2, d = r() * 0.22, s = 0.06 + r() * 0.1;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    b.rock([s, s * 0.75, s], [x, s * 0.3, z], { color: GRANITE[i % 3], tex: 'stone' }, i + v);
    b.sphere([s * 0.8, s * 0.22, s * 0.8], [x, s * 0.62, z], SNOW);
  }
}

function sapling(b: ModelBuilder, v: number): void {
  const r = rand(v * 5 + 61);
  const h = 0.45 + r() * 0.25;
  for (let i = 0; i < 3; i++) {
    const y = 0.12 + i * h * 0.28, rad = 0.2 * (1 - i / 3.5);
    b.cone(rad, 0.22, [0, y + 0.1, 0], { color: '#24413a', tex: 'leaf' }, [0, r() * 3, 0], 7);
    b.cone(rad * 0.8, 0.1, [0, y + 0.19, 0], SNOW, undefined, 7);
  }
}

function frozenLog(b: ModelBuilder, v: number): void {
  const r = rand(v * 3 + 71);
  b.joint([0, 0.08, 0], [0, r() * Math.PI, 0], (l) => {
    l.limb([-0.35, 0, 0], [0.35, 0, 0], 0.08, BARK, 0.07);
    l.sphere([0.02, 0.075, 0.075], [0.36, 0, 0], { color: '#b8946a', tex: 'wood' });
    l.sphere([0.34, 0.04, 0.07], [0, 0.07, 0], SNOW);
  });
}

export const DOODADS = {
  grass: [0, 1, 2, 3, 4, 5].map((v) => (b: ModelBuilder) => tussock(b, v)),
  flowers: [0, 1, 2, 3].map((v) => (b: ModelBuilder) => (v === 3 ? drift(b, v) : heather(b, v))),
  stones: [0, 1, 2, 3].map((v) => (b: ModelBuilder) => snowStones(b, v)),
  forest: [
    (b: ModelBuilder) => sapling(b, 0), (b: ModelBuilder) => sapling(b, 1), (b: ModelBuilder) => drift(b, 0),
    (b: ModelBuilder) => drift(b, 1), (b: ModelBuilder) => frozenLog(b, 0), (b: ModelBuilder) => frozenLog(b, 1), (b: ModelBuilder) => snowStones(b, 9),
  ],
};
