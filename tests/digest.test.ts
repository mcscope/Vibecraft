import { describe, expect, test } from 'vitest';
import { fenfolk } from '../src/factions/fenfolk';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';
import { withExtras } from './kit';

describe('tree digestion', () => {
  test('sent onto a tree, the unit turns it into the same amount of food and is absorbed', () => {
    const f = withExtras(fenfolk, { patch: { fenling: { digestsTrees: true } } });
    const w = new World({ seed: 3, players: [{ name: 'Fen', faction: f }, { name: 'Meadow', faction: meadowfolk }] });
    const u = w.unitsOf(0).find((x) => x.specId === 'fenling')!;
    // the nearest tree to it
    const tree = [...w.nodes.values()].filter((n) => n.tree).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
    const wood = tree.amount;
    w.enqueue({ player: 0, cmd: { type: 'digest', units: [u.id], node: tree.id } });
    for (let i = 0; i < 20 * 40 && w.units.has(u.id); i++) w.step();
    expect(w.units.has(u.id)).toBe(false); // absorbed
    expect(w.nodes.has(tree.id)).toBe(false);
    const food = [...w.nodes.values()].find((n) => n.digested)!;
    expect(food.type).toBe('food');
    expect(food.amount).toBeCloseTo(wood, 6);
    expect([food.x, food.y]).toEqual([tree.x, tree.y]);
  });
});
