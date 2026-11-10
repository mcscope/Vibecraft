// Fenfolk art: baked from their own models with the shared bake3d kit.
import type { FactionArt, TeamColors } from '../../art/contract';
import { bakeFaction } from '../../kits/bake3d/bakeFaction';
import type { UnitBakeOptions } from '../../kits/bake3d/baker';
import { buildings, units } from './index';
import { fenBanner, fenWantFlag } from './buildings';

/** The bog toad strikes with its bound: it bakes a slam (its bite), ~13 frames a second of its stride. */
const slams = (u: (typeof units)[number]) => u.id === 'bog-toad';
const slamFrames = (u: (typeof units)[number]) => (slams(u) && u.gait ? { slam: Math.max(10, Math.round((u.gait.period ?? 1) * 13)) } : undefined);

/** What each unit bakes (its extra animations; the great heron's model draws its whole leap itself). */
export const bakeOpts = (u: (typeof units)[number]): UnitBakeOptions => ({ withCarry: u.id === 'fenling', fly: !!u.flight, brace: !!u.attack?.shaft, sidearm: !!u.attack?.sidearm, ownLeap: u.id === 'great-siege-heron', slam: slams(u), frames: slamFrames(u) });

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
