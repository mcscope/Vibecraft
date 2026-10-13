// The meadow biome: trees, berry bushes, crystal deposits and ground clutter,
// baked with the bake3d kit. A biome is just art the map uses; another
// homeworld would supply its own BiomeArt.
import type { BiomeArt, Sprite, TeamColors } from '../../art/contract';
import { Baker } from '../../kits/bake3d/baker';
import { toBitmaps } from '../../kits/bake3d/bitmaps';
import * as m from './models';

const NEUTRAL: TeamColors = { primary: '#7a6a52', secondary: '#c9b48a', dark: '#3a3024' };
export const TREE_VARIANTS = 16;
export const BUSH_LEVELS = 4;
export const MINE_LEVELS = 4;

export async function bakeMeadow(onProgress?: (f: number, label: string) => void): Promise<BiomeArt> {
  const baker = new Baker();
  const total = TREE_VARIANTS + BUSH_LEVELS + MINE_LEVELS + 2 + Object.values(m.DOODADS).reduce((n, l) => n + l.length, 0);
  let done = 0;
  const bake = (build: Parameters<Baker['bakeStatic']>[0], shadow = true) => {
    const s = baker.bakeStatic(build, NEUTRAL, shadow);
    onProgress?.(++done / total, 'Growing the meadow');
    return s;
  };
  const trees: Sprite[] = [], bushes: Sprite[] = [], mines: Sprite[] = [];
  for (let i = 0; i < TREE_VARIANTS; i++) { trees.push(bake((b) => m.tree(b, i))); if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0)); }
  for (let i = 0; i < BUSH_LEVELS; i++) bushes.push(bake((b) => m.bush(b, i / (BUSH_LEVELS - 1))));
  for (let i = 0; i < MINE_LEVELS; i++) mines.push(bake((b) => m.mine(b, i / (MINE_LEVELS - 1))));
  const shard = bake(m.shard), projectile = bake(m.projectile, false);
  const doodads = { grass: m.DOODADS.grass.map((f) => bake(f)), flowers: m.DOODADS.flowers.map((f) => bake(f)), stones: m.DOODADS.stones.map((f) => bake(f)), forest: m.DOODADS.forest.map((f) => bake(f)) };
  baker.dispose();
  const art: BiomeArt = { trees, bushes, mines, shard, projectile, doodads };
  await toBitmaps([...trees, ...bushes, ...mines, shard, projectile, ...Object.values(doodads).flat()]);
  return art;
}
