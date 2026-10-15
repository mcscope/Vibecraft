import { describe, expect, test } from 'vitest';
import { fenfolk } from '../src/factions/fenfolk';
import { World } from '../src/sim/world';

const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) w.step(); };

describe('walking drop-off', () => {
  test('gatherers far from home unload into a nearby pack tortoise, which unloads at a building', () => {
    const w = new World({ seed: 7, players: [{ name: 'Fen', faction: fenfolk }, { name: 'Fen2', faction: fenfolk }] });
    for (const u of [...w.units.values()]) if (w.players[u.owner].neutral) w.units.delete(u.id);
    const hall = w.baseOf(0)!;
    // the food patch farthest from the hall on our side
    const far = [...w.nodes.values()].filter((n) => n.type === 'food' && !n.shard && w.territory(n.x, n.y) === 0)
      .sort((a, b) => Math.hypot(b.x - hall.ox, b.y - hall.oy) - Math.hypot(a.x - hall.ox, a.y - hall.oy))[0];
    const spot = w.grid.nearestOpen(far.x + 2, far.y + 1)!;
    const t = w.spawnAt(0, 'pack-tortoise', spot[0], spot[1])!;
    t.order = { kind: 'idle' };
    const f = w.unitsOf(0).find((u) => u.specId === 'fenling')!;
    const s2 = w.grid.nearestOpen(far.x + 1, far.y - 1)!;
    f.x = f.px = s2[0]; f.y = f.py = s2[1];
    w.enqueue({ player: 0, cmd: { type: 'gather', units: [f.id], node: far.id } });
    run(w, 20 * 30);
    expect(t.food).toBeGreaterThan(5); // the haul went into the tortoise, not back to the hall
    const load = t.food;
    w.enqueue({ player: 0, cmd: { type: 'resupply', units: [t.id], building: hall.id } });
    const before = hall.stock.food;
    run(w, 20 * 60);
    expect(hall.stock.food).toBeGreaterThan(before + load * 0.5); // carried home and unloaded
  });
});
