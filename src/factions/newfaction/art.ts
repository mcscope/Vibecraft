// New faction art: baked from its own models with the shared bake3d kit. No buildings.
import type { FactionArt, TeamColors } from '../../art/contract';
import { bakeFaction } from '../../kits/bake3d/bakeFaction';
import { caterpillarSegments, units } from './index';

/** A hopper's bounds, ~12 frames a second of each (its walk and charge are played by its bound: 8 frames of a long one jerk). */
const hopFrames = (u: (typeof units)[number]) => {
  if (!u.gait) return undefined;
  const n = Math.max(8, Math.round((u.gait.period ?? 1) * 12));
  return { walk: n, charge: n, slam: n };
};
const carry = (id: string) => id.startsWith('larva') || id.startsWith('mother');

export function bakeArt(team: TeamColors, onProgress?: (f: number, label: string) => void, only?: string[]): Promise<FactionArt> {
  return bakeFaction({
    units,
    opts: (u) => ({ withCarry: carry(u.id), fly: !!u.flight, brace: !!u.attack?.shaft, ownLeap: u.id === 'flier', reload: u.id === 'slinger', lay: u.id.startsWith('mother'), gives: carry(u.id), slam: !!u.gait, grows: u.id.startsWith('egg') || u.id === 'cocoon', rises: u.id === 'charger' || u.id === 'whipweld' || u.id === 'slinger', segments: u.id.startsWith('larva') ? caterpillarSegments(u.mass) : undefined, frames: hopFrames(u) }),
    // PLACEHOLDER flag: an egg; PLACEHOLDER music
    flag: (baker) => baker.bakeStatic((b) => b.cylinder(0, 0.2, 0.3, [0, 0.35, 0], { team: 'primary', tex: 'none' }, undefined, 5), team),
    music: { scale: [0, 2, 3, 7, 8], root: 196, tempo: 76, lead: 'triangle', drone: 'sine' },
    label: (name) => `Hatching the ${name}s`,
  }, team, onProgress, only);
}
