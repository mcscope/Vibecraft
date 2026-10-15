// The meadow homeworld (spring, or autumn): trees, berry bushes, crystal deposits,
// ground clutter and wildlife, baked with the shared biome bake.
import type { BiomeArt } from '../../art/contract';
import { bakeBiome } from '../bake';
import * as m from './models';
import { meadowWildlife } from './wildlife';

export type MeadowVariant = 'spring' | 'autumn';

const GROUND: Record<MeadowVariant, NonNullable<BiomeArt['ground']>> = {
  spring: { grass: ['#5d7a2f', '#6f8a37', '#4b6627'], dirt: ['#86704a', '#6d5a3a'], forest: '#3f4a22', sand: '#c2a978', shallow: '#4b8299', deep: '#24506b' },
  autumn: { grass: ['#8a7834', '#9c8a40', '#74642a'], dirt: ['#8a6a44', '#6a5236'], forest: '#5a3f20', sand: '#c9ab76', shallow: '#4f7a8a', deep: '#294a5c' },
};

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

export async function bakeMeadow(onProgress?: (f: number, label: string) => void, variant: MeadowVariant = 'spring'): Promise<BiomeArt> {
  m.setFoliage(variant === 'autumn' ? autumnFoliage : null);
  try {
    return await bakeBiome(m, GROUND[variant], meadowWildlife, onProgress);
  } finally {
    m.setFoliage(null);
  }
}
