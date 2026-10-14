import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';

describe('fog of war', () => {
  test('each side sees around its own units and buildings; ground it has left stays explored', () => {
    const w = new World({ seed: 7, players: [{ name: 'A', faction: meadowfolk }, { name: 'B', faction: meadowfolk }] });
    w.step();
    const a = w.baseOf(0)!, b = w.baseOf(1)!;
    expect(w.vision(0, a.ox + 1, a.oy + 1)).toBe(2); // home
    expect(w.vision(0, b.ox + 1, b.oy + 1)).toBe(0); // the enemy base: never seen
    expect(w.vision(1, b.ox + 1, b.oy + 1)).toBe(2);
    // a scout walks over, looks, and is gone: the ground stays explored, but out of sight
    const u = w.unitsOf(0).find((x) => x.specId === 'villager')!;
    u.x = u.px = b.ox - 2; u.y = u.py = b.oy + 1;
    for (let i = 0; i < 5; i++) w.step();
    expect(w.vision(0, b.ox + 1, b.oy + 1)).toBe(2);
    w.units.delete(u.id);
    for (let i = 0; i < 5; i++) w.step();
    expect(w.vision(0, b.ox + 1, b.oy + 1)).toBe(1);
  });
});
