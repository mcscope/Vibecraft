import { describe, expect, test } from 'vitest';
import { PLAYABLE } from '../src/factions';
import { meadowfolk } from '../src/factions/meadowfolk';
import type { FactionSpec } from '../src/factions/types';
import { checkSpec, specData } from '../src/net/bundle';
import { checkFairness, START_POOL, startCost, startStock } from '../src/sim/fairness';
import { World } from '../src/sim/world';
import { derive } from '../src/sim/physics';

/** Meadowfolk as data, with one thing changed. */
const cheat = (change: (f: FactionSpec) => void): FactionSpec => {
  const f = specData(meadowfolk) as FactionSpec;
  change(f);
  return f;
};
const unit = (f: FactionSpec, id: string) => f.units.find((u) => u.id === id)!;
const building = (f: FactionSpec, id: string) => f.buildings!.find((b) => b.id === id)!;

describe('fairness', () => {
  test('the shipped factions are fair', () => {
    for (const f of PLAYABLE) expect(checkFairness(f), f.id).toEqual([]);
  });

  test('everyone starts from the same pool: the base and workers are paid from it', () => {
    for (const f of PLAYABLE) {
      const c = startCost(f), s = startStock(f);
      for (const r of ['food', 'wood', 'crystal'] as const) expect(c[r] + s[r], `${f.id} ${r}`).toBeCloseTo(START_POOL[r], 5);
    }
    // a faction that starts with fewer workers keeps more food
    const lean = { ...meadowfolk, startWorkers: 3 };
    expect(startStock(lean).food).toBeGreaterThan(startStock(meadowfolk).food);
    const w = new World({ seed: 3, players: [{ name: 'A', faction: lean }, { name: 'B', faction: meadowfolk }] });
    expect(w.unitsOf(0).filter((u) => u.specId === 'villager').length).toBe(3);
    expect(w.baseOf(0)!.stock.food).toBe(startStock(lean).food);
  });

  test('a bundle can\'t name its own costs: stats come from the body', () => {
    const honest = derive(unit(meadowfolk, 'maceman'));
    const claimed = derive({ ...unit(meadowfolk, 'maceman'), foodCost: 1, maxHp: 9999 } as never);
    expect(claimed.foodCost).toBe(honest.foodCost);
    expect(claimed.maxHp).toBe(honest.maxHp);
  });

  const cheats: Array<[string, (f: FactionSpec) => void, RegExp]> = [
    ['a fortress for a starting base', (f) => { building(f, 'town-center').materials = 5000; building(f, 'town-center').size = 6; }, /more than the starting pool/],
    ['a starting base with a big tower', (f) => { building(f, 'town-center').attack = { mechanism: 400, crystalMass: 2, height: 10 }; }, /more than the starting pool/],
    ['giant starting workers', (f) => { unit(f, 'villager').mass = 400; }, /more than the starting pool/],
    ['giant workers made cheap by refinement', (f) => { unit(f, 'villager').mass = 400; unit(f, 'villager').refinement = 6; }, /needs \d+ capital/],
    ['a crowd of starting workers', (f) => { f.startWorkers = 40; }, /more than the starting pool/],
    ['a training dummy in the army', (f) => { unit(f, 'maceman').dummy = true; }, /dummies/],
    ['a herd of whales on your half', (f) => { f.wildlife![0].mass = 1400; }, /wild animals can weigh/],
    ['too much free game', (f) => { f.wildlife![0].count = 8; f.wildlife![0].group = 8; }, /wildlife: at most/],
    ['a tower dug into the ground', (f) => { building(f, 'watchtower').attack!.height = -5; }, /tower height/],
    ['a gathering boost across the map', (f) => { building(f, 'gathering-camp').gatherBoost!.radius = 40; }, /gatherBoost radius/],
    ['a worker that isn\'t a unit', (f) => { f.workerId = 'nobody'; }, /workerId/],
    ['two units with one id', (f) => { unit(f, 'slinger').id = 'maceman'; }, /used twice/],
    ['refinement below 1', (f) => { unit(f, 'slinger').refinement = 0.2; }, /at least 1/],
  ];
  for (const [what, change, why] of cheats) {
    test(`rejects ${what}`, () => {
      const errs = checkSpec(cheat(change));
      expect(errs.join('\n')).toMatch(why);
    });
  }
});
