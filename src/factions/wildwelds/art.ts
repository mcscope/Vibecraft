// Wildweld art: baked from its own models with the shared bake3d kit. No buildings.
import type { FactionArt, TeamColors } from '../../art/contract';
import { bakeFaction } from '../../kits/bake3d/bakeFaction';
import type { UnitBakeOptions } from '../../kits/bake3d/baker';
import { buildings, caterpillarSegments, units } from './index';

/** A hopper's bounds, ~12 frames a second of each (its walk and charge are played by its bound: 8 frames of a long one jerk). */
const hopFrames = (u: (typeof units)[number]) => {
  if (!u.gait) return undefined;
  const n = Math.max(8, Math.round((u.gait.period ?? 1) * 12));
  return { walk: n, charge: n, slam: Math.max(8, Math.round((u.gait.period ?? 1) * 8)) }; // (its slam: a quick crouch, then its bound, mostly a held pose: few frames)
};
const carry = (id: string) => id.startsWith('larva') || id.startsWith('mother');
/** The micropike's frames: its walk shifts its weight foot by foot and its stab winds up, lunges and swings back as a
 *  pendulum, too much for the usual 8. */
const frames = (u: (typeof units)[number]) => hopFrames(u) ?? (u.id === 'micropike' ? { walk: 12, charge: 10, attack: 12 } : undefined);

/** What each unit bakes (its extra animations; a hopper's bounding shadows apart: high in its bound, its body and its
 *  shadow on the ground in one frame would be mostly empty box). */
export const bakeOpts = (u: (typeof units)[number]): UnitBakeOptions => ({ withCarry: carry(u.id), fly: !!u.flight, brace: !!u.attack?.shaft, ownLeap: u.id === 'flier', reload: u.id === 'slinger', lay: u.id.startsWith('mother'), gives: carry(u.id), slam: !!u.gait, shadowApart: u.gait ? ['walk', 'charge', 'slam'] : undefined, grows: u.id.startsWith('egg') || u.id === 'cocoon', rises: u.id === 'charger' || u.id === 'whipweld' || u.id === 'slinger', segments: u.id.startsWith('larva') ? caterpillarSegments(u.mass) : undefined, frames: frames(u), ownStyles: u.id === 'micropike' });

export function bakeArt(team: TeamColors, onProgress?: (f: number, label: string) => void, only?: string[]): Promise<FactionArt> {
  return bakeFaction({
    units, buildings,
    opts: bakeOpts,
    // rally flag: a tall stalk with a banner of silk in the side's colour, a pale strand trailing from it; PLACEHOLDER music
    flag: (baker) => baker.bakeStatic((b) => {
      b.cylinder(0.035, 0.05, 1.8, [0, 0.9, 0], { color: '#5a4a30', tex: 'wood' }, undefined, 6);
      b.box([0.03, 0.55, 0.8], [0, 1.5, 0.42], { team: 'primary', tex: 'none' });
      b.cylinder(0.008, 0.008, 0.6, [0, 1.05, 0.8], { color: '#e8e4d8', tex: 'none' }, undefined, 4);
    }, team),
    music: { scale: [0, 2, 3, 7, 8], root: 196, tempo: 76, lead: 'triangle', drone: 'sine' },
    label: (name) => `Hatching the ${name}s`,
  }, team, onProgress, only);
}
