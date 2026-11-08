// Map objects every homeworld shares: spent crystals, thrown crystals, carcasses.
import type { Mat, ModelBuilder } from '../kits/bake3d/types';

export function shard(b: ModelBuilder): void {
  b.crystal(0.32, [0, 0.08, 0], [0, 0, 1.2]);
  b.crystal(0.2, [0.1, 0.05, 0.12], [0.6, 0, -1.3]);
}

export function projectile(b: ModelBuilder): void {
  b.crystal(0.35, [0, 0, 0], [0.5, 0, 0.9]);
}

/** A felled animal: what's left to butcher (a food node). */
export function carcass(b: ModelBuilder): void {
  const hide: Mat = { color: '#8a5e38', tex: 'fur' };
  b.sphere([0.5, 0.18, 0.26], [0, 0.18, 0], hide, [0.15, 0.4, 0]);
  b.sphere([0.16, 0.12, 0.12], [0.48, 0.12, 0.2], hide);
  for (const [x, z] of [[0.25, -0.2], [-0.25, -0.22], [0.15, 0.25]]) b.limb([x, 0.12, z], [x + 0.18, 0.06, z * 1.8], 0.04, hide);
  b.sphere([0.16, 0.02, 0.12], [-0.1, 0.02, -0.32], { color: '#6e1a1a', rough: 0.3 });
}

/** Cliff looks (BiomeArt.cliffs): rock tiles take them in turn across the map. */
export const CLIFF_LOOKS = 3;
/** How tall rock stands, in model units (about a metre each): well over a body's height, a wall of rock. */
export const CLIFF_HEIGHT = 3.2;

/**
 * A rock tile as a block of cliff: columns of boulders stacked up to CLIFF_HEIGHT across the tile, reaching past the
 * edge toward rock beside it (`joins`: 1 +x, 2 −x, 4 +y, 8 −y; map y is model z), so pieces merge into one mass, and
 * stepping down toward its open edges.
 */
export function cliff(b: ModelBuilder, joins: number, look: number): void {
  const reach = (bit: number) => (joins & bit ? 1.1 : 0.75);
  const xp = reach(1), xn = reach(2), zp = reach(4), zn = reach(8);
  let s = (look * 7919 + joins * 104729 + 17) >>> 0;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const colours = ['#7d776c', '#8f897d', '#6a655d', '#857c6c', '#9a9284'];
  const N = 4;
  let seed = look * 11;
  for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) {
    const x = -xn + ((i + 0.5) / N) * (xn + xp) + (r() - 0.5) * 0.25, z = -zn + ((k + 0.5) / N) * (zn + zp) + (r() - 0.5) * 0.25;
    // how far in from an open edge (none toward rock beside it): lower near the edge, full height inside
    const edge = Math.min(joins & 1 ? 9 : xp - x, joins & 2 ? 9 : x + xn, joins & 4 ? 9 : zp - z, joins & 8 ? 9 : z + zn);
    const h = CLIFF_HEIGHT * Math.min(1, 0.5 + edge * 0.8) * (0.85 + r() * 0.25);
    for (let y = 0; y < h - 0.25;) {
      const w = 0.36 + r() * 0.24, tall = Math.min(h - y, 0.55 + r() * 0.5);
      b.rock([w, tall * 0.62, w * (0.85 + r() * 0.3)], [x, y + tall * 0.5, z], { color: colours[Math.floor(r() * colours.length)], tex: 'stone' }, seed++);
      y += tall * 0.82;
    }
  }
}
