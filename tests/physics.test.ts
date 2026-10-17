import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { derive, validate } from '../src/sim/physics';
import type { UnitSpec } from '../src/factions/types';

const base: UnitSpec = meadowfolk.units[0];

describe('physics', () => {
  test('starter faction specs are valid', () => {
    for (const s of meadowfolk.units) expect(validate(s), s.id).toEqual([]);
  });

  test('damage per second scales with what you pay for', () => {
    // A cheap unit cannot out-damage an expensive one per unit of food by more than a small margin.
    // (per the body's unrefined price: refinement is a discount bought with capital, not part of the body)
    const plain = meadowfolk.units.filter((s) => !s.role && derive(s).canAttack);
    const ratios = plain.map((s) => { const d = derive(s); return d.dps / (d.foodCost * d.refinement); });
    expect(Math.max(...ratios) / Math.min(...ratios)).toBeLessThan(4);
  });

  test('cannot cheat with a featherweight glass cannon', () => {
    const cheat: UnitSpec = { ...base, id: 'cheat', mass: 1, physique: { muscle: 100, frame: 0, reserve: 0 }, attack: { style: 'strike', crystalMass: 1000 } };
    const d = derive(cheat);
    expect(d.mass).toBeGreaterThanOrEqual(15);
    expect(d.physique.frame).toBeGreaterThanOrEqual(0.1 - 1e-9);
    expect(d.damage).toBeLessThan(200);
    expect(validate(cheat).length).toBeGreaterThan(0);
  });

  test('crystal too light is capped by limb speed, too heavy by muscle energy', () => {
    // a thrown crystal flies alone (a blow swings the limb too, so it's the muscle that caps it)
    const light = derive({ ...base, attack: { style: 'throw', crystalMass: 0.1 } });
    const heavy = derive({ ...base, attack: { style: 'strike', crystalMass: 15 } });
    expect(light.crystalVelocity).toBeCloseTo(light.limbSpeed);
    expect(heavy.attackEnergy).toBeCloseTo(heavy.maxAttackEnergy);
  });
});
