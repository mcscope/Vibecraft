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
