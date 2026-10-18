// Sidearm: `attack.sidearm` (strikers with a shaft only: { crystalMass } kg, a sword or axe). A hand weapon worn
// beside the shaft: when the point can't be brought to bear (a body pressed inside it, or off to the side) it strikes
// with this instead, anywhere across its front and flanks, so a rider can cut at the bodies it gallops past. Its
// blow is a plain strike (sim/physics.ts), its crystal carried and paid for like any weapon's; one body, one arm's
// rest between blows of either (sim/world.ts).
import type { UnitSpec } from '../../factions/types';
import type { DerivedStats } from '../physics';
import type { Ability } from './index';

export const sidearm: Ability = {
  id: 'sidearm',
  validateUnit(u: UnitSpec, where: string): string[] {
    const s = u.attack?.sidearm;
    if (s === undefined) return [];
    if (!(s && typeof s.crystalMass === 'number' && Number.isFinite(s.crystalMass) && s.crystalMass > 0 && s.crystalMass <= 10)) return [`${where}: attack.sidearm.crystalMass must be over 0, up to 10 kg`];
    if (u.attack?.style !== 'strike' || !u.attack.shaft) return [`${where}: only a striker with a shaft carries a sidearm`];
    return [];
  },
  unitCodex(u: UnitSpec, d: DerivedStats): string | null {
    if (!u.attack?.sidearm || !d.sidearm) return null;
    return `Sidearm: where its point can't bear (too close, or off to the side) it cuts with a ${u.attack.sidearm.crystalMass} kg blade: ${d.sidearm.damage.toFixed(0)} damage every ${d.sidearm.cooldown.toFixed(1)} s, across its front and flanks, even riding past.`;
  },
};
