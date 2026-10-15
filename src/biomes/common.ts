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
