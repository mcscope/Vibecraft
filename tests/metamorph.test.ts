import { describe, expect, test } from 'vitest';
import { fenfolk } from '../src/factions/fenfolk';
import { meadowfolk } from '../src/factions/meadowfolk';
import type { UnitSpec } from '../src/factions/types';
import { metamorphCost } from '../src/sim/abilities/metamorph';
import { derive, validateFaction } from '../src/sim/physics';
import { World } from '../src/sim/world';
import { withExtras } from './kit';

// a fenling that can grow into a test frog-knight (refinement 2: one step up from the fenling's 1)
const knight: UnitSpec = { id: 'frog-knight', name: 'Frog Knight', description: 'Test form.', mass: 90, physique: { muscle: 0.5, frame: 0.4, reserve: 0.1 }, attack: { style: 'strike', crystalMass: 2 }, refinement: 2 } as UnitSpec;
const fen = withExtras(fenfolk, { units: [knight], patch: { fenling: { becomes: ['frog-knight'] } } });

describe('metamorphosis', () => {
  test('a unit beside its hall changes into the new form, paying only the difference, in 6 s × its refinement', () => {
    const w = new World({ seed: 3, players: [{ name: 'Fen', faction: fen }, { name: 'Meadow', faction: meadowfolk }] });
    for (const u of [...w.units.values()]) if (w.players[u.owner].neutral) w.units.delete(u.id);
    const hall = w.baseOf(0)!;
    hall.stock.food = 1000;
    const f = w.spawnAt(0, 'fenling', hall.ox + hall.size + 0.6, hall.oy + 1)!;
    const cost = metamorphCost(derive(fen.units.find((u) => u.id === 'fenling')!), derive(knight));
    expect(cost.food).toBe(derive(knight).foodCost - derive(fen.units.find((u) => u.id === 'fenling')!).foodCost);
    expect(cost.sec).toBeCloseTo(12);
    w.enqueue({ player: 0, cmd: { type: 'metamorph', units: [f.id], into: 'frog-knight' } });
    let into = 0;
    for (let i = 0; i < 20 * 14 && !into; i++) { w.step(); for (const e of w.events) if (e.type === 'metamorph') into = e.into; w.events = []; if (!into) expect(f.order.kind).toBe('metamorph'); }
    expect(w.units.has(f.id)).toBe(false);
    const k = w.units.get(into)!;
    expect(k.specId).toBe('frog-knight');
    expect(Math.hypot(k.x - f.x, k.y - f.y)).toBeLessThan(0.01);
    expect(1000 - hall.stock.food).toBeCloseTo(cost.food, 0);
  });

  test('with nothing to eat it waits', () => {
    const w = new World({ seed: 3, players: [{ name: 'Fen', faction: fen }, { name: 'Meadow', faction: meadowfolk }] });
    const f = w.spawnAt(0, 'fenling', 40, 40)!;
    f.food = 0;
    w.enqueue({ player: 0, cmd: { type: 'metamorph', units: [f.id], into: 'frog-knight' } });
    for (let i = 0; i < 20 * 20; i++) w.step();
    expect(w.units.has(f.id)).toBe(true);
    expect(f.order.kind === 'metamorph' && f.order.t).toBeLessThan(1);
  });

  test('a form more than one refinement up is refused', () => {
    const far = withExtras(fenfolk, { units: [{ ...knight, refinement: 2.5 }], patch: { fenling: { becomes: ['frog-knight'] } } });
    expect(validateFaction(far).some((e) => e.includes('frog-knight'))).toBe(true);
    expect(validateFaction(fen).filter((e) => e.includes('frog-knight'))).toEqual([]);
  });
});
