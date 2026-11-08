import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { wildwelds } from '../src/factions/wildwelds';
import { skirmish } from '../src/sim/scenarios';
import { World } from '../src/sim/world';

const game = () => new World({ seed: 7, scenario: { ...skirmish('woodlands'), wildlife: false }, players: [{ name: 'Wild', faction: wildwelds }, { name: 'Meadow', faction: meadowfolk }] });
const run = (w: World) => { for (let i = 0; i < 40; i++) w.step(); };

describe('victory: a side is beaten when its army and economy are gone', () => {
  test('the Wildwelds stay in while an egg is left, even with their mother dead', () => {
    const w = game(), m = w.unitsOf(0)[0];
    w.spawnAt(0, 'egg1', m.x + 2, m.y);
    w.units.delete(m.id);
    run(w);
    expect(w.players[0].defeated).toBe(false);
  });
  test('a side with only carts and buildings that train no gatherer is beaten', () => {
    const w = game();
    for (const u of w.unitsOf(1)) if (!u.carter) w.units.delete(u.id);
    for (const b of w.buildingsOf(1)) if ((b.spec.trains ?? []).some((id) => !w.specOf(1, id)?.spec.role)) b.hp = 0;
    run(w);
    expect(w.players[1].defeated).toBe(true);
    expect(w.winner).toBe(0);
  });
});
