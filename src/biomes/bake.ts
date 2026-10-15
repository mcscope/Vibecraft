// Bake a homeworld's map art (trees, food plants, crystal deposits, clutter,
// wildlife) from its models with the bake3d kit. Faction-neutral: each homeworld
// supplies its own models, ground palette and animals.
import type { BiomeArt, Sprite, TeamColors, UnitArt } from '../art/contract';
import { Baker } from '../kits/bake3d/baker';
import { toBitmaps } from '../kits/bake3d/bitmaps';
import type { ModelBuilder } from '../kits/bake3d/types';
import type { WildModel } from '../kits/animals';
import * as common from './common';

/** The models a homeworld grows. `level` is 0..1 of what's left. */
export interface BiomeModels {
  tree(b: ModelBuilder, variant: number): void;
  bush(b: ModelBuilder, level: number): void;
  mine(b: ModelBuilder, level: number): void;
  DOODADS: Record<'grass' | 'flowers' | 'stones' | 'forest', Array<(b: ModelBuilder) => void>>;
}

const NEUTRAL: TeamColors = { primary: '#7a6a52', secondary: '#c9b48a', dark: '#3a3024' };
export const TREE_VARIANTS = 16;
export const BUSH_LEVELS = 4;
export const MINE_LEVELS = 4;

export async function bakeBiome(
  set: BiomeModels, ground: NonNullable<BiomeArt['ground']>, animals: WildModel[],
  onProgress?: (f: number, label: string) => void,
): Promise<BiomeArt> {
  const baker = new Baker();
  const total = TREE_VARIANTS + BUSH_LEVELS + MINE_LEVELS + 2 + Object.values(set.DOODADS).reduce((n, l) => n + l.length, 0);
  let done = 0;
  const bake = (build: Parameters<Baker['bakeStatic']>[0], shadow = true) => {
    const s = baker.bakeStatic(build, NEUTRAL, shadow);
    onProgress?.(++done / total, 'Growing the meadow');
    return s;
  };
  const trees: Sprite[] = [], bushes: Sprite[] = [], mines: Sprite[] = [];
  for (let i = 0; i < TREE_VARIANTS; i++) { trees.push(bake((b) => set.tree(b, i))); if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0)); }
  for (let i = 0; i < BUSH_LEVELS; i++) bushes.push(bake((b) => set.bush(b, i / (BUSH_LEVELS - 1))));
  for (let i = 0; i < MINE_LEVELS; i++) mines.push(bake((b) => set.mine(b, i / (MINE_LEVELS - 1))));
  const shard = bake(common.shard), projectile = bake(common.projectile, false);
  const doodads = { grass: set.DOODADS.grass.map((f) => bake(f)), flowers: set.DOODADS.flowers.map((f) => bake(f)), stones: set.DOODADS.stones.map((f) => bake(f)), forest: set.DOODADS.forest.map((f) => bake(f)) };
  // wildlife and what they leave behind
  const wildlife: Record<string, UnitArt> = {};
  for (const w of animals) { wildlife[w.id] = await baker.bakeUnit(w.model, NEUTRAL); onProgress?.(done / total, 'Waking the wildlife'); }
  const carcass = bake(common.carcass);
  baker.dispose();
  const art: BiomeArt = { trees, bushes, mines, shard, projectile, doodads, ground, wildlife, carcass };
  const wildSprites = Object.values(wildlife).flatMap((u) => Object.values(u.anims).flatMap((a) => a?.frames.flat() ?? []));
  await toBitmaps([...trees, ...bushes, ...mines, shard, projectile, carcass, ...Object.values(doodads).flat(), ...wildSprites]);
  return art;
}
