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

describe('one digester to each tree', () => {
  test('each click on a tree sends the nearest free digester; the rest tend from there', () => {
    const f = withExtras(fenfolk, { patch: { fenling: { digestsTrees: true } } });
    const w = new World({ seed: 3, players: [{ name: 'Fen', faction: f }, { name: 'Meadow', faction: meadowfolk }] });
    const us = w.unitsOf(0).filter((x) => x.specId === 'fenling');
    expect(us.length).toBeGreaterThanOrEqual(3);
    const ids = us.map((u) => u.id), u0 = us[0];
    const [t1, t2] = [...w.nodes.values()].filter((n) => n.tree).sort((a, b) => Math.hypot(a.x - u0.x, a.y - u0.y) - Math.hypot(b.x - u0.x, b.y - u0.y));
    w.enqueue({ player: 0, cmd: { type: 'digest', units: ids, node: t1.id, one: true } });
    w.enqueue({ player: 0, cmd: { type: 'digest', units: ids, node: t1.id, one: true, queue: true } }); // the same tree again: nobody more
    w.enqueue({ player: 0, cmd: { type: 'digest', units: ids, node: t2.id, one: true, queue: true } });
    w.step();
    const to = (n: number) => us.filter((u) => u.order.kind === 'digest' && u.order.node === n).length;
    expect([to(t1.id), to(t2.id)]).toEqual([1, 1]);
    const rest = us.filter((u) => u.order.kind !== 'digest');
    expect(rest.length).toBe(us.length - 2);
    for (const u of rest) expect(u.order).toMatchObject({ kind: 'tend', at: [t2.x, t2.y] });
  });
});
