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
    expect(cost.sec).toBeCloseTo(6 * 2 + (90 - 32) / 12); // refinement 2, plus 58 kg more body
    w.enqueue({ player: 0, cmd: { type: 'metamorph', units: [f.id], into: 'frog-knight' } });
    let into = 0;
    for (let i = 0; i < 20 * 20 && !into; i++) { w.step(); for (const e of w.events) if (e.type === 'metamorph') into = e.into; w.events = []; if (!into) expect(f.order.kind).toBe('metamorph'); }
    expect(w.units.has(f.id)).toBe(false);
    const k = w.units.get(into)!;
    expect(k.specId).toBe('frog-knight');
    expect(Math.hypot(k.x - f.x, k.y - f.y)).toBeLessThan(0.01);
    expect(1000 - hall.stock.food).toBeCloseTo(cost.food, 0);
  });

  test('without the food on hand it waits to start', () => {
    const w = new World({ seed: 3, players: [{ name: 'Fen', faction: fen }, { name: 'Meadow', faction: meadowfolk }] });
    const f = w.spawnAt(0, 'fenling', 40, 40)!;
    f.food = 0;
    w.enqueue({ player: 0, cmd: { type: 'metamorph', units: [f.id], into: 'frog-knight' } });
    for (let i = 0; i < 20 * 20; i++) w.step();
    expect(w.units.has(f.id)).toBe(true);
    expect(f.order.kind === 'metamorph' && f.order.paid).toBe(0);
    expect(f.order.kind === 'metamorph' && f.order.t).toBe(0);
  });

  test('a parent grows a new unit beside it, paying its whole price, and carries on', () => {
    const brood = withExtras(fenfolk, { patch: { 'bog-toad': { spawns: ['fenling'] } } });
    const w = new World({ seed: 3, players: [{ name: 'Fen', faction: brood }, { name: 'Meadow', faction: meadowfolk }] });
    for (const u of [...w.units.values()]) if (w.players[u.owner].neutral) w.units.delete(u.id);
    const hall = w.baseOf(0)!;
    hall.stock.food = 1000;
    const t = w.spawnAt(0, 'bog-toad', hall.ox + hall.size + 1, hall.oy + 1)!;
    const cost = metamorphCost(derive(brood.units.find((u) => u.id === 'bog-toad')!), derive(brood.units.find((u) => u.id === 'fenling')!), true);
    const before = w.unitsOf(0).filter((u) => u.specId === 'fenling').length;
    w.enqueue({ player: 0, cmd: { type: 'metamorph', units: [t.id], into: 'fenling', spawn: true } });
    for (let i = 0; i < Math.ceil(cost.sec * 20) + 10; i++) w.step();
    expect(w.units.has(t.id)).toBe(true);
    expect(w.unitsOf(0).filter((u) => u.specId === 'fenling').length).toBe(before + 1);
    expect(1000 - hall.stock.food).toBeCloseTo(cost.food, 0);
    // nothing more refined than itself
    const up = withExtras(fenfolk, { patch: { fenling: { spawns: ['bog-toad'] } } });
    expect(validateFaction(up).some((e) => e.includes('spawns bog-toad'))).toBe(true);
  });

  test('eaten as it goes: it starts on what it has, and pauses when the food runs out', () => {
    const eats = withExtras(fenfolk, { units: [knight], patch: { fenling: { becomes: ['frog-knight'], growthFood: 'eaten' } } });
    const w = new World({ seed: 3, players: [{ name: 'Fen', faction: eats }, { name: 'Meadow', faction: meadowfolk }] });
    const f = w.spawnAt(0, 'fenling', 40, 40)!;
    f.food = 5; // a little in its pack, far less than the cost
    w.enqueue({ player: 0, cmd: { type: 'metamorph', units: [f.id], into: 'frog-knight' } });
    for (let i = 0; i < 20 * 10; i++) w.step();
    const o = f.order;
    expect(o.kind).toBe('metamorph');
    if (o.kind !== 'metamorph') return;
    expect(o.paid).toBeCloseTo(5, 3); // it ate what it had
    expect(o.t).toBeGreaterThan(0); // and got that far
    const stuck = o.t;
    for (let i = 0; i < 20 * 5; i++) w.step();
    expect(o.t).toBeCloseTo(stuck, 3); // then waited
  });

  test('a form more than one refinement up is refused', () => {
    const far = withExtras(fenfolk, { units: [{ ...knight, refinement: 2.5 }], patch: { fenling: { becomes: ['frog-knight'] } } });
    expect(validateFaction(far).some((e) => e.includes('frog-knight'))).toBe(true);
    expect(validateFaction(fen).filter((e) => e.includes('frog-knight'))).toEqual([]);
  });
});
