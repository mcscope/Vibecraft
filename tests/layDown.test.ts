import { describe, expect, test } from 'vitest';
import { wildwelds } from '../src/factions/wildwelds';
import { meadowfolk } from '../src/factions/meadowfolk';
import { skirmish } from '../src/sim/scenarios';
import { World } from '../src/sim/world';
import { run } from './kit';

const newWorld = () => new World({ seed: 1000, scenario: { ...skirmish('woodlands'), victory: false, wildlife: false }, players: [{ name: 'A', faction: wildwelds }, { name: 'B', faction: meadowfolk }] });
const open = (w: World, x: number, y: number) => w.grid.nearestOpen(x, y, 6)!;

describe('laying down its body (laysDown)', () => {
  test('a T2 larva lays a strand of web wall, a seed of its body to each piece, and is gone into it', () => {
    const w = newWorld();
    const [x, y] = open(w, 30, 30), larva = w.spawnAt(0, 'larva2', x, y)!;
    // a line of 3, the next queued behind the first (as dragging lays it)
    for (let i = 0; i < 3; i++) w.enqueue({ player: 0, cmd: { type: 'build', units: [larva.id], specId: 'web-wall', ox: Math.floor(x) + 2 + i, oy: Math.floor(y) + 2, ...(i ? { queue: true } : {}) } });
    run(w, 20 * 30, () => !w.units.has(larva.id));
    const webs = w.buildingsOf(0).filter((b) => b.specId === 'web-wall');
    expect(webs.length).toBe(3);
    expect(webs.every((b) => b.complete)).toBe(true);
    expect(w.units.has(larva.id)).toBe(false); // gone into them
    const seed = webs[0].spec.materials * webs[0].spec.living!.seed;
    expect(webs[0].grown).toBeCloseTo(seed, 3); // a seed's worth to each but the last
    expect(webs[2].grown!).toBeCloseTo(60 - 2 * seed, 3); // the last: all that's left of its 60 kg
  });

  test('laid alone, a piece takes its whole body; a T3 larva lays a web tower, its crystal in its stock; mothers can\'t build web from wood', () => {
    const w = newWorld();
    const [x, y] = open(w, 30, 30), larva = w.spawnAt(0, 'larva3', x, y)!;
    larva.crystal = 6;
    w.enqueue({ player: 0, cmd: { type: 'build', units: [larva.id], specId: 'web-tower', ox: Math.floor(x) + 3, oy: Math.floor(y) }, });
    run(w, 20 * 30, () => !w.units.has(larva.id));
    const tower = w.buildingsOf(0).find((b) => b.specId === 'web-tower')!;
    expect(tower.complete).toBe(true);
    expect(tower.grown!).toBeCloseTo(179, 3); // all of it
    expect(tower.stock.crystal).toBeCloseTo(6, 3);
    const mother = w.unitsOf(0).find((u) => u.specId === 'mother1')!;
    const before = w.buildingsOf(0).length;
    const [mx, my] = open(w, mother.x + 4, mother.y + 4);
    w.enqueue({ player: 0, cmd: { type: 'build', units: [mother.id], specId: 'web-wall', ox: Math.floor(mx), oy: Math.floor(my) } });
    run(w, 2);
    expect(w.buildingsOf(0).length).toBe(before); // only a body lays it
  });

  test('tending larvae feed a growing web, and it grows', () => {
    const w = newWorld();
    const [x, y] = open(w, 30, 30), larva = w.spawnAt(0, 'larva2', x, y)!;
    w.enqueue({ player: 0, cmd: { type: 'build', units: [larva.id], specId: 'web-wall', ox: Math.floor(x) + 2, oy: Math.floor(y) } });
    run(w, 20 * 20, () => !w.units.has(larva.id));
    const web = w.buildingsOf(0).find((b) => b.specId === 'web-wall')!;
    const grown0 = web.grown!;
    for (let i = 0; i < 3; i++) { const [tx, ty] = open(w, x + i, y + 3); const t = w.spawnAt(0, 'larva1', tx, ty)!; w.enqueue({ player: 0, cmd: { type: 'tend', units: [t.id] } }); }
    run(w, 20 * 120, () => web.grown! > grown0 + 5);
    expect(web.grown!).toBeGreaterThan(grown0 + 5);
  });
});
