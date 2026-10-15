// 3D models for map objects. Same lighting as units, baked once at load.
// Model units: 1 tile = 2 units; origin = centre of the object's footprint.
import type { Mat, ModelBuilder } from '../../kits/bake3d/types';

/** Foliage recolour, set while baking a variant (identity = spring meadow). */
let recolor: (hex: string) => string = (c) => c;
const g = (hex: string) => recolor(hex);
export function setFoliage(f: ((hex: string) => string) | null): void { recolor = f ?? ((c) => c); }

const WOOD: Mat = { color: '#5e4128', tex: 'wood' };
const DARKWOOD: Mat = { color: '#3d2a1a', tex: 'wood' };
const STONE: Mat = { color: '#8a857c', tex: 'stone' };

function rand(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function tree(b: ModelBuilder, variant: number): void {
  const r = rand(variant + 11);
  const kind = variant % 3;
  const greens = [g('#38532a'), g('#455f2c'), g('#2e4723'), g('#526b30'), g('#3b5a32')];
  const leaf = (): Mat => ({ color: greens[Math.floor(r() * greens.length)], tex: 'leaf', rough: 0.9 });
  if (kind === 1) {
    // pine
    const h = 4.6 + r() * 1.2;
    b.cylinder(0.12, 0.2, h * 0.5, [0, h * 0.25, 0], DARKWOOD, undefined, 8);
    const tiers = 8;
    for (let i = 0; i < tiers; i++) {
      const y = 0.9 + (i / tiers) * (h - 1.2);
      const rad = 1.25 * (1 - i / (tiers + 0.5)) + 0.2;
      b.cone(rad, 1.1, [r() * 0.1, y + 0.75, r() * 0.1], { color: g('#2b4426'), tex: 'leaf' }, [0, r() * 3, 0], 9);
    }
    return;
  }
  // broadleaf
  const h = kind === 2 ? 4.2 : 4.8 + r() * 0.8;
  const trunk: Mat = kind === 2 ? { color: '#b9b2a2', tex: 'wood' } : WOOD;
  b.limb([0, 0, 0], [r() * 0.3 - 0.15, h * 0.55, r() * 0.3 - 0.15], kind === 2 ? 0.15 : 0.24, trunk, 0.13);
  b.limb([0, h * 0.4, 0], [0.6, h * 0.62, 0.3], 0.09, trunk, 0.05);
  b.limb([0, h * 0.45, 0], [-0.5, h * 0.66, -0.4], 0.09, trunk, 0.05);
  const blobs = 28;
  for (let i = 0; i < blobs; i++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 1.15;
    const y = h * 0.62 + (r() - 0.3) * 1.5;
    b.sphere(0.38 + r() * 0.36, [Math.cos(a) * rr * 1.1, y, Math.sin(a) * rr * 1.1], kind === 2 ? { color: r() < 0.5 ? g('#6b8a3a') : g('#7a9a44'), tex: 'leaf' } : leaf());
  }
  b.sphere(0.8, [0, h * 0.82, 0], leaf());
}

export function bush(b: ModelBuilder, level: number): void {
  const r = rand(7);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.sphere([0.42, 0.34, 0.42], [Math.cos(a) * 0.38, 0.3 + r() * 0.1, Math.sin(a) * 0.38], { color: i % 2 ? g('#3d5a28') : g('#4a6a2e'), tex: 'leaf' });
  }
  b.sphere([0.5, 0.45, 0.5], [0, 0.5, 0], { color: g('#456530'), tex: 'leaf' });
  const berries = Math.round(level * 26);
  for (let i = 0; i < berries; i++) {
    const a = r() * Math.PI * 2, rr = 0.35 + r() * 0.35;
    b.sphere(0.065, [Math.cos(a) * rr, 0.35 + r() * 0.5, Math.sin(a) * rr], { color: r() < 0.5 ? '#8d1a26' : '#b02233', rough: 0.35 });
  }
}

export function mine(b: ModelBuilder, level: number): void {
  const r = rand(3);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r();
    const rr = 0.4 + r() * 0.35;
    const s = 0.3 + r() * 0.25;
    b.rock([s, s, s], [Math.cos(a) * rr, s * 0.5, Math.sin(a) * rr], { color: i % 2 ? '#77736c' : '#8b867c', tex: 'stone' }, i + 1);
  }
  b.rock([0.55, 0.5, 0.55], [0, 0.3, 0], STONE, 5);
  const n = 3 + Math.round(level * 5);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, rr = r() * 0.45;
    const len = (0.45 + r() * 0.6) * (0.55 + level * 0.6);
    b.crystal(len, [Math.cos(a) * rr, 0.35, Math.sin(a) * rr], [Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5]);
  }
}




// ── ground clutter: tiny props painted into the terrain (render-only, never blocks) ──

const GRASS = () => [g('#5e7a2e'), g('#6d8a34'), g('#4f6a27'), g('#7a9440')];

export function grassClump(b: ModelBuilder, v: number): void {
  const r = rand(v * 31 + 5);
  const blades = 9 + Math.floor(r() * 7);
  for (let i = 0; i < blades; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.16;
    const h = 0.18 + r() * 0.22;
    const lean = (r() - 0.5) * 0.5;
    b.cone(0.022, h, [Math.cos(a) * d, h / 2, Math.sin(a) * d], { color: GRASS()[Math.floor(r() * 4)], tex: 'leaf' }, [lean, a, (r() - 0.5) * 0.5], 4);
  }
}

export function flowers(b: ModelBuilder, v: number): void {
  const r = rand(v * 17 + 3);
  const colors = [['#e8e2d0', '#e8c547'], ['#c8486a', '#f2d36a'], ['#8a6ad6', '#f2e6a0'], ['#e8c547', '#9a5a1a']];
  const [petal, eye] = colors[v % colors.length];
  grassClump(b, v + 40);
  for (let i = 0; i < 4 + Math.floor(r() * 3); i++) {
    const a = r() * Math.PI * 2, d = 0.05 + r() * 0.16, h = 0.22 + r() * 0.15;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    b.limb([x, 0, z], [x, h, z], 0.008, { color: g('#4f6a27') });
    b.sphere([0.045, 0.018, 0.045], [x, h, z], { color: petal, rough: 0.6 });
    b.sphere(0.016, [x, h + 0.012, z], { color: eye });
  }
}

export function stones(b: ModelBuilder, v: number): void {
  const r = rand(v * 13 + 7);
  for (let i = 0; i < 2 + Math.floor(r() * 4); i++) {
    const a = r() * Math.PI * 2, d = r() * 0.25, s = 0.05 + r() * 0.11;
    b.rock([s, s * 0.7, s * (0.8 + r() * 0.4)], [Math.cos(a) * d, s * 0.25, Math.sin(a) * d], { color: r() < 0.5 ? '#8a857c' : '#77736c', tex: 'stone' }, i + v);
  }
}

export function fern(b: ModelBuilder, v: number): void {
  const r = rand(v * 7 + 11);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.3;
    b.joint([0, 0.02, 0], [0, a, 0.9 + r() * 0.3], (f) => {
      f.box([0.04, 0.32, 0.12], [0, 0.18, 0], { color: i % 2 ? g('#3f6a2a') : g('#4c7a30'), tex: 'leaf' });
    });
  }
}

export function mushrooms(b: ModelBuilder, v: number): void {
  const r = rand(v * 23 + 1);
  for (let i = 0; i < 3 + Math.floor(r() * 3); i++) {
    const a = r() * Math.PI * 2, d = r() * 0.14, h = 0.05 + r() * 0.08;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    b.cylinder(0.014, 0.018, h, [x, h / 2, z], { color: '#e8dcc0' }, undefined, 6);
    b.sphere([0.045, 0.028, 0.045], [x, h, z], { color: v % 2 ? '#a83a2a' : '#b08a5a', rough: 0.5 });
  }
}

export function stump(b: ModelBuilder, v: number): void {
  const r = rand(v * 5 + 19);
  b.cylinder(0.13, 0.17, 0.16, [0, 0.08, 0], { color: '#5e4128', tex: 'wood' }, undefined, 10);
  b.cylinder(0.125, 0.125, 0.01, [0, 0.165, 0], { color: '#c9a77a', tex: 'wood' }, undefined, 10);
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    b.limb([Math.cos(a) * 0.12, 0.04, Math.sin(a) * 0.12], [Math.cos(a) * 0.26, 0.0, Math.sin(a) * 0.26], 0.03, { color: '#4a3424', tex: 'wood' }, 0.015);
  }
  grassClump(b, v + 80);
}

export function fallenLog(b: ModelBuilder, v: number): void {
  const r = rand(v * 3 + 29);
  const a = r() * Math.PI;
  b.joint([0, 0.08, 0], [0, a, 0], (l) => {
    l.limb([-0.35, 0, 0], [0.35, 0, 0], 0.08, { color: '#5a4030', tex: 'wood' }, 0.07);
    l.sphere([0.02, 0.075, 0.075], [0.36, 0, 0], { color: '#b8946a', tex: 'wood' });
    l.sphere([0.08, 0.03, 0.06], [-0.1, 0.07, 0.02], { color: g('#4c7a30'), tex: 'leaf' }); // moss
  });
}

export const DOODADS = {
  grass: [0, 1, 2, 3, 4, 5].map((v) => (b: ModelBuilder) => grassClump(b, v)),
  flowers: [0, 1, 2, 3].map((v) => (b: ModelBuilder) => flowers(b, v)),
  stones: [0, 1, 2, 3].map((v) => (b: ModelBuilder) => stones(b, v)),
  forest: [
    (b: ModelBuilder) => fern(b, 0), (b: ModelBuilder) => fern(b, 1), (b: ModelBuilder) => mushrooms(b, 0),
    (b: ModelBuilder) => mushrooms(b, 1), (b: ModelBuilder) => stump(b, 0), (b: ModelBuilder) => fallenLog(b, 0), (b: ModelBuilder) => fallenLog(b, 1),
  ],
};

