// The meadow biome: trees, berry bushes, crystal deposits and ground clutter,
// baked with the bake3d kit. A biome is just art the map uses; another
// homeworld would supply its own BiomeArt.
import type { BiomeArt, Sprite, TeamColors, UnitArt } from '../../art/contract';
import { Baker } from '../../kits/bake3d/baker';
import { toBitmaps } from '../../kits/bake3d/bitmaps';
import * as m from './models';
import { frostWildlife, meadowWildlife } from './wildlife';

/** Meadow variants a faction can pick for its half of the map. */
export type MeadowVariant = 'spring' | 'autumn' | 'frost';

const GROUND: Record<MeadowVariant, NonNullable<BiomeArt['ground']>> = {
  spring: { grass: ['#5d7a2f', '#6f8a37', '#4b6627'], dirt: ['#86704a', '#6d5a3a'], forest: '#3f4a22', sand: '#c2a978', shallow: '#4b8299', deep: '#24506b' },
  autumn: { grass: ['#8a7834', '#9c8a40', '#74642a'], dirt: ['#8a6a44', '#6a5236'], forest: '#5a3f20', sand: '#c9ab76', shallow: '#4f7a8a', deep: '#294a5c' },
  frost: { grass: ['#b9c4c0', '#cfd8d4', '#9eaba8'], dirt: ['#8a8070', '#6e665a'], forest: '#5e6e66', sand: '#d8d4c8', shallow: '#6a92a8', deep: '#2e5470' },
};

/** Frost: greens go cold and pale, toward blue-green and frosted grey-green. */
function frostFoliage(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (!(g > r && g >= b)) return hex; // only greens change
  const grey = (r + g + b) / 3;
  const mixc = (c: number, t: number, k: number) => Math.round(c + (t - c) * k);
  // cool it (pull red down, push blue up), then frost it toward pale grey
  const cr = mixc(r * 0.8, grey * 1.5, 0.35), cg = mixc(g, grey * 1.45, 0.35), cb = mixc(b * 1.35 + 18, grey * 1.6, 0.35);
  const to = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${to(cr)}${to(cg)}${to(cb)}`;
}

const WILDLIFE: Record<MeadowVariant, typeof meadowWildlife> = { spring: meadowWildlife, autumn: meadowWildlife, frost: frostWildlife };

/** Autumn: greens turn gold, orange and rust (hue shift toward ~25-50°). */
function autumnFoliage(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  if (h < 60 || h > 170) return hex; // only greens change
  const hh = 22 + ((h - 70) / 100) * 30 + ((n % 7) - 3) * 3; // spread over rust → gold
  const sat = Math.min(1, (d / (1 - Math.abs(2 * l - 1) || 1)) * 1.25), lit = Math.min(0.62, l * 1.18);
  const c = (1 - Math.abs(2 * lit - 1)) * sat, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), mm = lit - c / 2;
  [r, g, b] = hh < 60 ? [c, x, 0] : [x, c, 0];
  const to = (v: number) => Math.round((v + mm) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

const NEUTRAL: TeamColors = { primary: '#7a6a52', secondary: '#c9b48a', dark: '#3a3024' };
export const TREE_VARIANTS = 16;
export const BUSH_LEVELS = 4;
export const MINE_LEVELS = 4;

export async function bakeMeadow(onProgress?: (f: number, label: string) => void, variant: MeadowVariant = 'spring'): Promise<BiomeArt> {
  const baker = new Baker();
  m.setFoliage(variant === 'autumn' ? autumnFoliage : variant === 'frost' ? frostFoliage : null);
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
  // wildlife and what they leave behind
  const wildlife: Record<string, UnitArt> = {};
  for (const w of WILDLIFE[variant]) { wildlife[w.id] = await baker.bakeUnit(w.model, NEUTRAL); onProgress?.(done / total, 'Waking the wildlife'); }
  const carcass = bake(m.carcass);
  m.setFoliage(null);
  baker.dispose();
  const art: BiomeArt = { trees, bushes, mines, shard, projectile, doodads, ground: GROUND[variant], wildlife, carcass };
  const wildSprites = Object.values(wildlife).flatMap((u) => Object.values(u.anims).flatMap((a) => a?.frames.flat() ?? []));
  await toBitmaps([...trees, ...bushes, ...mines, shard, projectile, carcass, ...Object.values(doodads).flat(), ...wildSprites]);
  return art;
}
