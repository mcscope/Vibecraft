// Wildweld art: baked from its own models with the shared bake3d kit. No buildings.
import type { FactionArt, TeamColors } from '../../art/contract';
import { bakeFaction } from '../../kits/bake3d/bakeFaction';
import type { UnitBakeOptions } from '../../kits/bake3d/baker';
import { buildings, caterpillarSegments, units } from './index';

/** A hopper's bounds, ~12 frames a second of each (its walk and charge are played by its bound: 8 frames of a long one jerk). */
const hopFrames = (u: (typeof units)[number]) => {
  if (!u.gait) return undefined;
  const n = Math.max(8, Math.round((u.gait.period ?? 1) * 12));
  return { walk: n, charge: n, slam: n };
};
const carry = (id: string) => id.startsWith('larva') || id.startsWith('mother');
/** The micropike's frames: its walk shifts its weight foot by foot and its stab winds up, lunges and swings back as a
 *  pendulum, too much for the usual 8. */
const frames = (u: (typeof units)[number]) => hopFrames(u) ?? (u.id === 'micropike' ? { walk: 12, charge: 10, attack: 12 } : undefined);

/** What each unit bakes (its extra animations). */
export const bakeOpts = (u: (typeof units)[number]): UnitBakeOptions => ({ withCarry: carry(u.id), fly: !!u.flight, brace: !!u.attack?.shaft, ownLeap: u.id === 'flier', reload: u.id === 'slinger', lay: u.id.startsWith('mother'), gives: carry(u.id), slam: !!u.gait, grows: u.id.startsWith('egg') || u.id === 'cocoon', rises: u.id === 'charger' || u.id === 'whipweld' || u.id === 'slinger', segments: u.id.startsWith('larva') ? caterpillarSegments(u.mass) : undefined, frames: frames(u), ownStyles: u.id === 'micropike' });

export function bakeArt(team: TeamColors, onProgress?: (f: number, label: string) => void, only?: string[]): Promise<FactionArt> {
  return bakeFaction({
    units, buildings,
    opts: bakeOpts,
    // PLACEHOLDER flag: an egg; PLACEHOLDER music
    flag: (baker) => baker.bakeStatic((b) => b.cylinder(0, 0.2, 0.3, [0, 0.35, 0], { team: 'primary', tex: 'none' }, undefined, 5), team),
    music: { scale: [0, 2, 3, 7, 8], root: 196, tempo: 76, lead: 'triangle', drone: 'sine' },
    label: (name) => `Hatching the ${name}s`,
  }, team, onProgress, only);
}
