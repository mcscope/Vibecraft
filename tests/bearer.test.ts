import { describe, expect, test } from 'vitest';
import { fenfolk } from '../src/factions/fenfolk';
import { World } from '../src/sim/world';

const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) w.step(); };

describe('ammo bearer', () => {
  test('a pack tortoise loads crystal at a building; dry fenlings come and take a load from it', () => {
    const w = new World({ seed: 7, players: [{ name: 'Fen', faction: fenfolk }, { name: 'Fen2', faction: fenfolk }] });
    for (const u of [...w.units.values()]) if (w.players[u.owner].neutral) w.units.delete(u.id);
    const hall = w.baseOf(0)!;
    hall.stock.crystal = 100;
    const t = w.spawnAt(0, 'pack-tortoise', hall.ox + 4, hall.oy + 1)!;
    t.order = { kind: 'idle' };
    w.enqueue({ player: 0, cmd: { type: 'resupply', units: [t.id], building: hall.id } });
    run(w, 20 * 10);
    expect(t.crystal).toBeGreaterThan(40); // a full load (48 kg)
    // fenlings with empty slings around it get topped up
    const fs = w.unitsOf(0).filter((u) => u.specId === 'fenling');
    for (const f of fs) {
      const spot = w.grid.nearestOpen(t.x + 3, t.y + 2)!; // a few tiles off, on open ground
      f.ammo = 0; f.x = f.px = spot[0]; f.y = f.py = spot[1]; f.order = { kind: 'idle' };
    }
    const load = t.crystal;
    run(w, 20 * 6);
    expect(fs.every((f) => f.ammo >= f.stats.loadoutCrystal - 1e-6)).toBe(true);
    expect(t.crystal).toBeCloseTo(load - fs.length * fs[0].stats.loadoutCrystal, 5);
  });

  test('resupply (R) and right-clicking the tortoise both restock throwers from it', () => {
    const w = new World({ seed: 7, players: [{ name: 'Fen', faction: fenfolk }, { name: 'Fen2', faction: fenfolk }] });
    for (const u of [...w.units.values()]) if (w.players[u.owner].neutral) w.units.delete(u.id);
    const hall = w.baseOf(0)!;
    const spot = w.grid.nearestOpen(hall.ox + 12, hall.oy + 12)!;
    const t = w.spawnAt(0, 'pack-tortoise', spot[0], spot[1])!;
    t.order = { kind: 'idle' }; t.crystal = 40;
    const [a, b] = w.unitsOf(0).filter((u) => u.specId === 'fenling');
    for (const f of [a, b]) { const s2 = w.grid.nearestOpen(spot[0] + 2, spot[1])!; f.x = f.px = s2[0]; f.y = f.py = s2[1]; f.ammo = 0; f.order = { kind: 'idle' }; }
    w.enqueue({ player: 0, cmd: { type: 'resupply', units: [a.id], building: hall.id } }); // the tortoise is much nearer
    w.enqueue({ player: 0, cmd: { type: 'rearm', units: [b.id], bearer: t.id } });
    run(w, 20 * 6);
    expect(a.ammo).toBeGreaterThanOrEqual(a.stats.loadoutCrystal - 1e-6);
    expect(b.ammo).toBeGreaterThanOrEqual(b.stats.loadoutCrystal - 1e-6);
  });

  test('a fenling pinned to a building keeps hauling for it and waits by it when it\'s stocked', () => {
    const w = new World({ seed: 7, players: [{ name: 'Fen', faction: fenfolk }, { name: 'Fen2', faction: fenfolk }] });
    for (const u of [...w.units.values()]) if (w.players[u.owner].neutral) w.units.delete(u.id);
    const hall = w.baseOf(0)!;
    hall.stock = { food: 500, wood: 500, crystal: 100 };
    const wallow = w.addBuilding(0, 'toad-wallow', hall.ox + 7, hall.oy)!;
    const f = w.unitsOf(0).find((u) => u.specId === 'fenling')!;
    w.enqueue({ player: 0, cmd: { type: 'haul', units: [f.id], building: wallow.id } });
    run(w, 20 * 20); // nothing queued there: it just waits by the wallow, still pinned
    expect(f.order.kind === 'cart' && f.order.pinned && f.order.home === wallow.id).toBe(true);
    w.enqueue({ player: 0, cmd: { type: 'train', building: wallow.id, specId: 'bog-toad' } });
    run(w, 20 * 60);
    expect(wallow.queue.length === 0 || wallow.queue[0].paid).toBe(true); // it hauled the toad's roots over
    expect(f.order.kind).toBe('cart');
  });
});
