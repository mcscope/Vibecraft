// Whip: `attack.whip` (strikers only, not with a shaft; metres of whip-like limb, 0–3). The crystal is lashed out at its
// tip: it reaches the lash's whole length, and the lash is a lever, so the crystal leaves faster in proportion to arm +
// lash, up to what the muscle's energy allows, all of that energy going into the light crystal rather than a heavy arm.
// Drawing the lash back in adds to each blow's recovery (sim/physics.ts).
import type { UnitSpec } from '../../factions/types';
import type { DerivedStats } from '../physics';
import type { Ability } from './index';

export const whip: Ability = {
  id: 'whip',
  validateUnit(u: UnitSpec, where: string): string[] {
    const w = u.attack?.whip;
    if (w === undefined) return [];
    if (!(typeof w === 'number' && Number.isFinite(w) && w >= 0 && w <= 3)) return [`${where}: attack.whip must be 0–3 metres`];
    if (u.attack?.style !== 'strike') return [`${where}: only strikers lash with a whip`];
    if (u.attack?.shaft) return [`${where}: a whip and a shaft don't go together`];
    return [];
  },
  unitCodex(u: UnitSpec, d: DerivedStats): string | null {
    const w = u.attack?.whip;
    if (!w || u.attack?.style !== 'strike') return null;
    return `Whip: lashes its crystal out ${w} m on a whip-like limb, ${d.range.toFixed(1)} tiles, at ${d.crystalVelocity.toFixed(1)} m/s, then draws it back.`;
  },
};
