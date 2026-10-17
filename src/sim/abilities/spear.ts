// Spear: `attack.shaft` (strikers only, 0–3 m of wooden shaft). Reach grows a tile per 2 m;
// the wood is priced like body mass and the swing slows a little (sim/physics.ts). Braced,
// a longer weapon turns a charging attacker's own momentum against it (World.strike).
import type { UnitSpec } from '../../factions/types';
import type { DerivedStats } from '../physics';
import type { Ability } from './index';

export const spear: Ability = {
  id: 'spear',
  validateUnit(u: UnitSpec, where: string): string[] {
    const s = u.attack?.shaft;
    if (s === undefined) return [];
    if (!(typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= 3)) return [`${where}: attack.shaft must be 0–3 metres`];
    if (u.attack?.style !== 'strike') return [`${where}: only strikers carry a shaft`];
    return [];
  },
  unitCodex(u: UnitSpec, d: DerivedStats): string | null {
    const s = u.attack?.shaft;
    if (!s || u.attack?.style !== 'strike') return null;
    return `Spear: a ${s} m shaft reaches ${d.range.toFixed(1)} tiles. Braced, an attacker charging in with shorter reach drives itself onto the point.`;
  },
};
