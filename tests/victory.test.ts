import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { wildwelds } from '../src/factions/wildwelds';
import { skirmish } from '../src/sim/scenarios';
import { World } from '../src/sim/world';

const game = () => new World({ seed: 7, scenario: { ...skirmish('woodlands'), wildlife: false }, players: [{ name: 'Wild', faction: wildwelds }, { name: 'Meadow', faction: meadowfolk }] });
const run = (w: World) => { for (let i = 0; i < 40; i++) w.step(); };

describe('victory', () => {
  test('a side that trains from buildings is beaten when its buildings are gone, units or not', () => {
    const w = game();
    for (const b of w.buildingsOf(1)) b.hp = 0;
    run(w);
    expect(w.players[1].defeated).toBe(true);
    expect(w.winner).toBe(0);
  });
  test('the Wildwelds stay in while an egg is left, even with their mother dead', () => {
    const w = game(), m = w.unitsOf(0)[0];
    w.spawnAt(0, 'egg1', m.x + 2, m.y);
    w.units.delete(m.id);
    run(w);
    expect(w.players[0].defeated).toBe(false);
  });
  test('the Wildwelds are beaten with no mothers, larvae, eggs or cocoons left, fighters or not', () => {
    const w = game(), m = w.unitsOf(0)[0];
    w.spawnAt(0, 'charger', m.x + 2, m.y);
    w.units.delete(m.id);
    run(w);
    expect(w.players[0].defeated).toBe(true);
  });
});

describe('victory in a battle with no production', () => {
  test('a side with its army on the field and no buildings is not beaten; one with no army left is', async () => {
    const { pitchedBattle, defaultDeployment } = await import('../src/sim/battle');
    expect(typeof pitchedBattle).toBe('function');
    const army = Object.fromEntries(meadowfolk.units.filter((u) => u.attack && u.id !== meadowfolk.workerId).slice(0, 2).map((u) => [u.id, 3]));
    const w = new World({ seed: 3, scenario: pitchedBattle('open-steppe', [defaultDeployment(meadowfolk, army, 0), defaultDeployment(meadowfolk, army, 1)]), players: [{ name: 'A', faction: meadowfolk }, { name: 'B', faction: meadowfolk }] });
    run(w);
    expect(w.players[0].defeated).toBe(false);
    expect(w.players[1].defeated).toBe(false);
    for (const u of w.unitsOf(1)) w.units.delete(u.id);
    run(w);
    expect(w.players[1].defeated).toBe(true);
    expect(w.winner).toBe(0);
  });
});
