import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';
import { pen, withExtras } from './kit';

const herders = withExtras(meadowfolk, { buildings: [pen], patch: { villager: { tamer: true } } });

const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) w.step(); };

describe('herding', () => {
  test('a tamer tames a deer by feeding it, two deer at a pen breed, and a tame deer can be butchered', () => {
    const w = new World({ seed: 7, players: [{ name: 'H', faction: herders }, { name: 'M', faction: meadowfolk }] });
    const hall = w.baseOf(0)!;
    const elks = w.unitsOf(w.wildsId).filter((u) => u.specId === 'deer');
    expect(elks.length).toBeGreaterThan(1);
    const [e1, e2] = elks;
    const c = w.unitsOf(0).find((u) => u.specId === 'villager')!;
    // bring the crofter and both elk near home, crofter with a pack of oats
    const spot = (dx: number, dy: number) => w.grid.nearestOpen(hall.ox + dx, hall.oy + dy)!;
    [[e1, 8, 6], [e2, 9, 7], [c, 7, 6]].forEach(([u, dx, dy]) => { const p = spot(dx as number, dy as number); const x = u as typeof c; x.x = x.px = p[0]; x.y = x.py = p[1]; });
    c.food = c.stats.cargoCapacity;
    for (const e of [e1, e2]) {
      for (let i = 0; i < 6 && e.owner !== 0; i++) {
        c.food = c.stats.cargoCapacity; // keep the pack full (a real crofter would fetch more)
        w.enqueue({ player: 0, cmd: { type: 'tame', units: [c.id], target: e.id } });
        run(w, 20 * 20);
      }
      expect(e.owner).toBe(0);
      expect(e.tame).toBe('passive');
    }
    // a sheepfold beside them breeds a calf from its oats
    const fold = w.addBuilding(0, 'pen', hall.ox + 11, hall.oy + 4)!;
    fold.stock.food = 2000;
    for (const e of [e1, e2]) { const p = w.grid.nearestOpen(fold.ox + 1, fold.oy + 3)!; e.x = e.px = p[0]; e.y = e.py = p[1]; e.order = { kind: 'idle' }; }
    const herd0 = w.unitsOf(0).filter((u) => u.specId === 'deer').length;
    const breedTime = w.specOf(0, 'deer')!.stats.trainTime * 2;
    run(w, Math.ceil(20 * (breedTime + 3)));
    expect(w.unitsOf(0).filter((u) => u.specId === 'deer').length).toBeGreaterThan(herd0);
    expect(fold.stock.food).toBeLessThan(2000);
    // butcher one: the crofter brings it down and it leaves meat
    const nodes0 = [...w.nodes.values()].filter((n) => n.carcass).length;
    w.enqueue({ player: 0, cmd: { type: 'hunt', units: [c.id], target: e1.id } });
    run(w, 20 * 120);
    expect(w.units.has(e1.id)).toBe(false);
    expect([...w.nodes.values()].filter((n) => n.carcass).length + (c.food > 0 ? 1 : 0)).toBeGreaterThan(nodes0);
  });
});
