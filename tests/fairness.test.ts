import { describe, expect, test } from 'vitest';
import { PLAYABLE } from '../src/factions';
import { meadowfolk } from '../src/factions/meadowfolk';
import type { FactionSpec } from '../src/factions/types';
import { checkSpec, specData } from '../src/net/bundle';
import { checkFairness } from '../src/sim/fairness';
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

  test('a bundle can\'t name its own costs: stats come from the body', () => {
    const honest = derive(unit(meadowfolk, 'maceman'));
    const claimed = derive({ ...unit(meadowfolk, 'maceman'), foodCost: 1, maxHp: 9999 } as never);
    expect(claimed.foodCost).toBe(honest.foodCost);
    expect(claimed.maxHp).toBe(honest.maxHp);
  });

  const cheats: Array<[string, (f: FactionSpec) => void, RegExp]> = [
    ['a fortress for a starting base', (f) => { building(f, 'town-center').materials = 5000; building(f, 'town-center').size = 6; }, /starting base is free/],
    ['a starting base with a free tower', (f) => { building(f, 'town-center').attack = { mechanism: 400, crystalMass: 2, height: 10 }; }, /starting base is free/],
    ['giant starting workers', (f) => { unit(f, 'villager').mass = 400; }, /starting workers are free/],
    ['giant workers made cheap by refinement', (f) => { unit(f, 'villager').mass = 400; unit(f, 'villager').refinement = 6; }, /starting workers are free|needs/],
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
