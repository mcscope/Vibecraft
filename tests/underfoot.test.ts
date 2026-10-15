import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';

const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) w.step(); };
const fresh = () => {
  const w = new World({ seed: 7, players: [{ name: 'A', faction: meadowfolk }, { name: 'B', faction: meadowfolk }] });
  for (const u of [...w.units.values()]) if (w.players[u.owner].neutral) w.units.delete(u.id);
  return w;
};

describe('underfoot', () => {
  test('roads block nothing and speed up anyone on them', () => {
    const w = fresh();
    const tc = w.baseOf(0)!;
    const y = tc.oy + 5;
    const time = (withRoad: boolean) => {
      const v = w.unitsOf(0).find((u) => u.specId === 'villager')!;
      v.x = v.px = tc.ox + 1.5; v.y = v.py = y + 0.5; v.order = { kind: 'idle' }; v.path = [];
      w.enqueue({ player: 0, cmd: { type: 'move', units: [v.id], x: tc.ox + 9.5, y: y + 0.5 } });
      let t = 0;
      while (Math.abs(v.x - (tc.ox + 9.5)) > 0.3 && t < 400) { w.step(); t++; }
      return t;
    };
    const plain = time(false);
    for (let x = tc.ox; x < tc.ox + 11; x++) w.addBuilding(0, 'road', x, y);
    expect(w.grid.isBlocked(tc.ox + 3.5, y + 0.5)).toBe(false);
    const paved = time(true);
    expect(paved).toBeLessThan(plain * 0.8);
  });

  test('goods unloaded onto a belt ride it to the building it touches', () => {
    const w = fresh();
    const tc = w.baseOf(0)!;
    // a watchtower (it trains nothing, so only the belt changes its stock) with a belt running 8 tiles from its east edge
    const tw = w.addBuilding(0, 'watchtower', tc.ox + 6, tc.oy + 6)!;
    const y = tw.oy;
    for (let x = tw.ox + 1; x < tw.ox + 9; x++) w.addBuilding(0, 'conveyor', x, y);
    expect(w.belts().dest.size).toBe(8);
    w.parcels.push({ id: w.nextParcelId(), owner: 0, res: 'food', kg: 10, tile: y * w.grid.width + tw.ox + 8, t: 0 });
    run(w, 20 * 2);
    expect(tw.stock.food).toBe(0); // still on its way (8 tiles at 2 tiles/s)
    expect(w.parcels.length).toBe(1);
    run(w, 20 * 4);
    expect(tw.stock.food).toBeCloseTo(10, 5);
    expect(w.parcels.length).toBe(0);
  });

  test('a villager carrying a load unloads onto a nearby belt instead of walking home', () => {
    const w = fresh();
    const tc = w.baseOf(0)!;
    const y = tc.oy + 1;
    for (let x = tc.ox + tc.size; x < tc.ox + tc.size + 12; x++) w.addBuilding(0, 'conveyor', x, y);
    const v = w.unitsOf(0).find((u) => u.specId === 'villager')!;
    const bush = [...w.nodes.values()].filter((n) => n.type === 'food' && !n.shard).sort((a, b) => Math.hypot(a.x - (tc.ox + 14), a.y - y) - Math.hypot(b.x - (tc.ox + 14), b.y - y))[0];
    v.x = v.px = bush.x; v.y = v.py = bush.y + 1.2; v.cal = v.stats.maxCalories;
    v.food = Math.floor(v.stats.cargoCapacity); // a full pack: time to unload
    v.order = { kind: 'gather', node: bush.id, nodeType: 'food', phase: 'toDrop', stopWhenArmed: false };
    let loaded = false;
    for (let i = 0; i < 20 * 60 && !loaded; i++) { w.step(); if (w.parcels.some((p) => p.res === 'food')) loaded = true; }
    expect(loaded).toBe(true);
  });
});
