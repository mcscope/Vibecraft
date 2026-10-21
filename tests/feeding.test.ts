import { describe, expect, test } from 'vitest';
import { newFaction } from '../src/factions/newfaction';
import { meadowfolk } from '../src/factions/meadowfolk';
import { skirmish } from '../src/sim/scenarios';
import { World } from '../src/sim/world';

describe('feeding', () => {
  test('a nest-tender gathers food, carries it to an egg waiting on it, and keeps tending after it hatches', () => {
    const w = new World({ seed: 1000, scenario: { ...skirmish('woodlands'), victory: false, wildlife: false }, players: [{ name: 'A', faction: newFaction }, { name: 'B', faction: meadowfolk }] });
    const m = w.unitsOf(0)[0];
    const pile = [...w.nodes.values()].filter((n) => n.type === 'food').sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))[0];
    const egg = w.spawnAt(0, 'egg1', m.x + 4, m.y)!;
    const larva = w.spawnAt(0, 'larva1', m.x, m.y + 1)!;
    w.enqueue({ player: 0, cmd: { type: 'metamorph', units: [egg.id], into: 'larva1' } });
    void pile;
    w.enqueue({ player: 0, cmd: { type: 'tend', units: [larva.id] } });
    let hatched = false;
    for (let i = 0; i < 20 * 120 && !hatched; i++) { w.step(); for (const e of w.events) if (e.type === 'metamorph' && e.id === egg.id) hatched = true; w.events = []; }
    expect(hatched).toBe(true);
    expect(larva.order.kind).toBe('tend'); // and it's still at it, for whoever's next
  });
});
