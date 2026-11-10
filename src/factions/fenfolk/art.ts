// Fenfolk art: baked from their own models with the shared bake3d kit.
import type { FactionArt, TeamColors } from '../../art/contract';
import { bakeFaction } from '../../kits/bake3d/bakeFaction';
import type { UnitBakeOptions } from '../../kits/bake3d/baker';
import { buildings, units } from './index';
import { fenBanner, fenWantFlag } from './buildings';

/** What each unit bakes (its extra animations; the great heron's own, below). */
export const bakeOpts = (u: (typeof units)[number]): UnitBakeOptions => ({ withCarry: u.id === 'fenling', fly: !!u.flight, brace: !!u.attack?.shaft, sidearm: !!u.attack?.sidearm, ...(u.id === 'great-siege-heron' ? HERON : {}) });

/**
 * The great heron, kept inside the sprite budget (README "Sprite budget"): its model draws its whole leap itself; it
 * gathers, eats and tires standing as it idles (only its rider moves), so it shows its idle for those; its moving
 * shadows are baked apart (the tall bird and its long shadow in one frame would be mostly empty box); and, the biggest
 * body in the fen, it bakes at a little under the usual resolution.
 */
const HERON: UnitBakeOptions = { ownLeap: true, without: ['gather', 'eat', 'tired'], shadowApart: ['walk', 'charge', 'attack', 'stagger'], scale: 0.8 };

export function bakeArt(team: TeamColors, onProgress?: (f: number, label: string) => void, only?: string[]): Promise<FactionArt> {
  return bakeFaction({
    units, buildings,
    opts: bakeOpts,
    flag: (baker) => baker.bakeStatic(fenBanner, team), wantFlag: (baker) => baker.bakeStatic(fenWantFlag, team),
    // a hushed, pentatonic, slightly unsettling marsh song
    music: { scale: [0, 3, 5, 7, 10], root: 174.6, tempo: 84, lead: 'sine', drone: 'triangle' },
    label: (name) => `Wading in the ${name}s`,
  }, team, onProgress, only);
}
