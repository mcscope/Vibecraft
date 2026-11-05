// Meadowfolk art: bake every unit and building model into contract sprites.
import type { FactionArt, TeamColors } from '../../art/contract';
import { bakeFaction } from '../../kits/bake3d/bakeFaction';
import type { UnitBakeOptions } from '../../kits/bake3d/baker';
import { buildings, units } from './index';
import { rallyFlag, wantFlag } from './buildings';

const carry = (id: string) => id === 'villager' || id === 'mule';
/** What each unit bakes (its extra animations). */
export const bakeOpts = (u: (typeof units)[number]): UnitBakeOptions => ({ withCarry: carry(u.id), brace: !!u.attack?.shaft, sidearm: !!u.attack?.sidearm });

export function bakeArt(team: TeamColors, onProgress?: (f: number, label: string) => void, only?: string[]): Promise<FactionArt> {
  return bakeFaction({
    units, buildings,
    opts: bakeOpts,
    flag: (baker) => baker.bakeStatic(rallyFlag, team), wantFlag: (baker) => baker.bakeStatic(wantFlag, team),
    music: { scale: [0, 2, 3, 5, 7, 9, 10], root: 146.8, tempo: 76, lead: 'triangle', drone: 'saw' },
    label: (name) => `Mustering ${name}`,
  }, team, onProgress, only);
}
