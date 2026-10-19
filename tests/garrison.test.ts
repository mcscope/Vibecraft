import { describe, expect, test } from 'vitest';
import { fenfolk } from '../src/factions/fenfolk';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';
import { capacity } from '../src/sim/garrison';

const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) w.step(); };

describe('garrison', () => {
  test('workers shelter inside; fenlings inside throw from cover; everyone comes out when it falls', () => {
    const w = new World({ seed: 7, players: [{ name: 'Fen', faction: fenfolk }, { name: 'Meadow', faction: meadowfolk }] });
    for (const u of [...w.units.values()]) if (w.players[u.owner].neutral) w.units.delete(u.id);
    const hall = w.baseOf(0)!;
    hall.stock.crystal = 50;
    const fs = w.unitsOf(0).filter((u) => u.specId === 'fenling');
    expect(capacity(hall)).toBeGreaterThanOrEqual(fs.length);
    w.enqueue({ player: 0, cmd: { type: 'garrison', units: fs.map((u) => u.id), building: hall.id } });
    run(w, 20 * 8);
    expect(hall.garrison.length).toBe(fs.length);
    expect(fs.every((u) => !w.units.has(u.id))).toBe(true); // off the map: nothing can reach them
    // a raider walks up: the fenlings throw at it from the hall
    const spot = w.grid.nearestOpen(hall.ox + hall.size + 3, hall.oy + 1)!;
    const m = w.spawnAt(1, 'maceman', spot[0], spot[1])!;
    m.order = { kind: 'idle' };
    const hp = m.hp;
    run(w, 20 * 6);
    expect(m.hp).toBeLessThan(hp);
    // a bog toad is too big for the door: it stays outside
    const toad = w.spawnAt(0, 'bog-toad', spot[0], spot[1] + 2)!;
    w.enqueue({ player: 0, cmd: { type: 'garrison', units: [toad.id], building: hall.id } });
    run(w, 20 * 4);
    expect(w.units.has(toad.id)).toBe(true);
    expect(hall.garrison.includes(toad)).toBe(false);
    // the hall falls: they come out
    hall.hp = 0;
    run(w, 1);
    expect(fs.every((u) => w.units.has(u.id))).toBe(true);
  });
});
