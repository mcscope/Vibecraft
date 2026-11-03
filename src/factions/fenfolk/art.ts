// Fenfolk art: baked from their own models with the shared bake3d kit.
import type { FactionArt, TeamColors } from '../../art/contract';
import { bakeFaction } from '../../kits/bake3d/bakeFaction';
import { buildings, units } from './index';
import { fenBanner, fenWantFlag } from './buildings';

export function bakeArt(team: TeamColors, onProgress?: (f: number, label: string) => void, only?: string[]): Promise<FactionArt> {
  return bakeFaction({
    units, buildings,
    // (the great heron's model draws its whole leap itself)
    opts: (u) => ({ withCarry: u.id === 'fenling', fly: !!u.flight, brace: !!u.attack?.shaft, sidearm: !!u.attack?.sidearm, ownLeap: u.id === 'great-siege-heron' }),
    flag: (baker) => baker.bakeStatic(fenBanner, team), wantFlag: (baker) => baker.bakeStatic(fenWantFlag, team),
    // a hushed, pentatonic, slightly unsettling marsh song
    music: { scale: [0, 3, 5, 7, 10], root: 174.6, tempo: 84, lead: 'sine', drone: 'triangle' },
    label: (name) => `Wading in the ${name}s`,
  }, team, onProgress, only);
}
