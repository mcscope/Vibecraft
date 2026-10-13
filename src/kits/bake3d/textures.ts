// Procedural textures for baked sprites. Structured ones (planks, stone blocks,
// shingles, thatch rows) give buildings real surface detail; noisy ones (cloth,
// fur, leaf...) give organics a painted feel. Each makes a colour map (kept near
// white so material colours read true) and a bump map from the same pattern.
import * as THREE from 'three';
import type { Mat } from './types';

type TexName = Exclude<NonNullable<Mat['tex']>, 'none'>;

const S = 256;
const cache = new Map<string, { map: THREE.Texture; bump: THREE.Texture }>();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise sampled at integer pixel coords; `cells` per texture width. */
function valueNoise(cells: number, r: () => number): (x: number, y: number) => number {
  const grid = new Float32Array(cells * cells).map(() => r());
  return (x, y) => {
    const fx = ((x / S) * cells) % cells, fy = ((y / S) * cells) % cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const g = (gx: number, gy: number) => grid[((gy + cells) % cells) * cells + ((gx + cells) % cells)];
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * sx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/** Per-cell random value (for planks, blocks, tiles). */
const cellRand = (i: number, j: number, seed: number) => {
  let h = Math.imul(i * 374761393 + j * 668265263 + seed * 1442695041, 1274126177);
  h ^= h >>> 13;
  return ((Math.imul(h, 1103515245) >>> 0) % 10000) / 10000;
};

function sample(name: TexName, x: number, y: number, n: Record<string, (x: number, y: number) => number>): number {
  const { lo, mid, hi, fine } = n;
  switch (name) {
    case 'plank': {
      // vertical boards ~26px wide, staggered butt joints, grain and knots
      const w = 26, bx = Math.floor(x / w), lx = x - bx * w;
      const len = 96 + Math.floor(cellRand(bx, 0, 3) * 80), off = Math.floor(cellRand(bx, 1, 3) * len);
      const by = Math.floor((y + off) / len), ly = (y + off) - by * len;
      const tone = 0.7 + cellRand(bx, by, 5) * 0.25;
      const grain = 0.85 + 0.15 * Math.sin((lx + mid(x, y) * 30) * 0.9 + by * 3);
      const gap = lx < 2 || ly < 2 ? 0.35 : 1;
      const kx = w * 0.5, ky = len * cellRand(bx, by, 9);
      const knot = Math.hypot(lx - kx, ly - ky) < 3 && cellRand(bx, by, 11) < 0.35 ? 0.6 : 1;
      return tone * grain * gap * knot * (0.92 + 0.08 * fine(x, y));
    }
    case 'brick': {
      // stone blocks with mortar, rows staggered
      const bh = 22, row = Math.floor(y / bh), ly = y - row * bh;
      const bw = 40 + (row % 3) * 6, off = (row % 2) * (bw / 2);
      const col = Math.floor((x + off) / bw), lx = (x + off) - col * bw;
      const mortar = lx < 3 || ly < 3 ? 0.45 : 1;
      const tone = 0.68 + cellRand(col, row, 7) * 0.3;
      const pits = mid(x, y) > 0.72 ? 0.8 : 1;
      const edge = Math.min(lx, bw - lx, ly, bh - ly) < 6 ? 0.92 : 1; // chamfered edges read in the bump
      return tone * mortar * pits * edge * (0.85 + 0.15 * fine(x, y));
    }
    case 'shingle': {
      const rh = 18, row = Math.floor(y / rh), ly = y - row * rh;
      const tw = 22, off = (row % 2) * (tw / 2), col = Math.floor((x + off) / tw), lx = (x + off) - col * tw;
      const shadow = ly / rh; // each row darkens toward the overlap
      const gap = lx < 2 ? 0.5 : 1;
      return (0.62 + 0.3 * shadow) * gap * (0.75 + cellRand(col, row, 13) * 0.3) * (0.9 + 0.1 * fine(x, y));
    }
    case 'thatch': {
      // layered rows of straw bundles with fine vertical strands
      const rh = 20, row = Math.floor(y / rh), ly = y - row * rh;
      const strands = 0.6 + 0.4 * Math.abs(Math.sin((x + row * 7) * 1.7 + hi(x, y) * 4));
      const lip = 0.7 + 0.3 * (ly / rh);
      return strands * lip * (0.8 + 0.25 * lo(x, y));
    }
    case 'wood': {
      // grain along the length (v), for poles, beams, handles
      const g = Math.abs(Math.sin((x + mid(x, y) * 26) * 0.55));
      return 0.6 + 0.28 * g + 0.12 * fine(x, y) - (hi(x, y) > 0.85 ? 0.15 : 0);
    }
    case 'stone': return 0.45 + 0.3 * lo(x, y) + 0.25 * mid(x, y) - (mid(x, y) > 0.74 ? 0.22 : 0) + 0.1 * fine(x, y);
    case 'cloth': return 0.62 + 0.18 * ((x % 4 < 2) !== (y % 4 < 2) ? 1 : 0) + 0.14 * lo(x, y) + 0.08 * fine(x, y) - 0.1 * Math.abs(Math.sin(y * 0.05 + lo(x, y) * 6));
    case 'fur': return 0.45 + 0.3 * lo(x, y) + 0.3 * hi(x, (y + Math.floor(mid(x, y) * 10)) % S) * (0.6 + 0.4 * Math.sin(y * 0.9 + mid(x, y) * 6));
    case 'hair': return 0.5 + 0.35 * Math.abs(Math.sin(x * 0.9 + mid(x, y) * 5)) + 0.15 * fine(x, y);
    case 'leather': return 0.62 + 0.22 * mid(x, y) + 0.12 * fine(x, y) - (hi(x, y) > 0.8 ? 0.12 : 0);
    case 'metal': return 0.72 + 0.12 * fine(x, y) + 0.12 * lo(x, y) - (Math.abs(Math.sin(x * 0.3 + y * 0.05 + hi(x, y))) > 0.985 ? 0.25 : 0);
    case 'skin': return 0.86 + 0.09 * lo(x, y) + 0.05 * fine(x, y);
    case 'leaf': {
      const c = hi(x, y);
      return 0.32 + 0.5 * c * c + 0.22 * mid(x, y) + (c > 0.82 ? 0.2 : 0) - (fine(x, y) > 0.9 ? 0.15 : 0);
    }
  }
}

export function texture(name: TexName): { map: THREE.Texture; bump: THREE.Texture } {
  const hit = cache.get(name);
  if (hit) return hit;
  const r = rng(name.length * 7919 + name.charCodeAt(0) * 31 + name.charCodeAt(1));
  const n = { lo: valueNoise(6, r), mid: valueNoise(24, r), hi: valueNoise(64, r), fine: valueNoise(128, r) };
  const v = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) v[y * S + x] = Math.max(0, Math.min(1, sample(name, x, y, n)));
  const make = (fn: (k: number) => number) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const g = Math.round(fn(v[i]) * 255);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const map = make((k) => 0.6 + 0.4 * k);
  const bump = make((k) => k);
  bump.colorSpace = THREE.NoColorSpace;
  const out = { map, bump };
  cache.set(name, out);
  return out;
}
