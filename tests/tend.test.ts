import { describe, expect, test } from 'vitest';
import { wildwelds } from '../src/factions/wildwelds';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';

describe('tending', () => {
  test('a tender carrying crystal, with no tower short of it, puts it down and gets on with food', () => {
    const w = new World({ seed: 3, players: [{ name: 'Wild', faction: wildwelds }, { name: 'Meadow', faction: meadowfolk }] });
    const m = w.unitsOf(0)[0], u = w.spawnAt(0, 'larva1', m.x + 2, m.y)!;
    u.crystal = Math.min(4, u.stats.carryCapacity);
    const shards = () => [...w.nodes.values()].filter((n) => n.shard).reduce((t, n) => t + n.amount, 0);
    const before = shards();
    w.enqueue({ player: 0, cmd: { type: 'tend', units: [u.id] } });
    for (let i = 0; i < 40; i++) w.step();
    expect(u.crystal).toBe(0);
    expect(shards()).toBeGreaterThan(before);
    expect(u.order.kind).toBe('tend');
    expect(Math.hypot(u.x - u.px, u.y - u.py) > 0 || u.busy || u.food > 0).toBe(true); // off doing something, not stuck
  });
});

describe('a laid building grows at its body\'s refinement', () => {
  test('food per kg grown is 1 ÷ the refinement of the body that laid it', async () => {
    const { grow } = await import('../src/sim/abilities/living');
    const w = new World({ seed: 3, players: [{ name: 'Wild', faction: wildwelds }, { name: 'Meadow', faction: meadowfolk }] });
    const spec = w.buildingSpecOf(0, 'web-wall')!;
    const piece = (r?: number) => ({ spec, grown: 12, growRefinement: r, stock: { food: 100, wood: 0, crystal: 0 }, hp: 10, maxHp: 10, stats: {} }) as never as Parameters<typeof grow>[0];
    const plain = piece(), refined = piece(2);
    for (let i = 0; i < 100; i++) { grow(plain, wildwelds, 0.05); grow(refined, wildwelds, 0.05); }
    expect(refined.grown).toBeCloseTo(plain.grown!, 6); // same pace
    expect(100 - refined.stock.food).toBeCloseTo((100 - plain.stock.food) / 2, 6); // half the food
  });
});

describe('healing by eating', () => {
  test('a hurt unit standing idle with food in its pack eats to heal, paying its price per HP', () => {
    const w = new World({ seed: 3, players: [{ name: 'Meadow', faction: meadowfolk }, { name: 'Wild', faction: wildwelds }] });
    const u = w.unitsOf(0).find((x) => x.stats.canAttack || x.stats.foodCost > 0)!;
    u.hp = u.stats.maxHp * 0.5; u.cal = u.stats.maxCalories; u.food = 5;
    const hp0 = u.hp, food0 = u.food;
    for (let i = 0; i < 20 * 20; i++) w.step();
    expect(u.hp).toBeGreaterThan(hp0);
    expect(u.food).toBeLessThan(food0); // (it ate; then, its pack empty, it may top up at a stocked building in sight)
  });
});
