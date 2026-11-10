import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { Grid } from '../src/sim/map';
import { findPath } from '../src/sim/pathfinding';
import { World } from '../src/sim/world';
import { arenaScenario } from '../src/sim/arena';
import { run, withExtras } from './kit';

const newWorld = () => new World({ seed: 7, players: [{ name: 'A', faction: meadowfolk }, { name: 'B', faction: meadowfolk }] });

/** Ring the tiles within `r` of (cx, cy) with blocked ground (a cliff all round): nothing outside can get in. */
function pocket(g: Grid, cx: number, cy: number, r: number): void {
  for (let y = cy - r - 1; y <= cy + r + 1; y++) for (let x = cx - r - 1; x <= cx + r + 1; x++) {
    if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) === r + 1) g.block(x, y, 1);
  }
}

describe('getting there', () => {
  test('a path winds as far as it has to (a long maze), and a goal it can\'t get to is swapped for the nearest tile it can', () => {
    const g = new Grid(96, 96);
    // walls every 3rd column, gaps at alternate ends: the way from one corner to the other snakes the whole map
    for (let x = 2; x < 94; x += 3) for (let y = 0; y < 96; y++) if ((x % 2 ? y !== 95 : y !== 0)) g.block(x, y, 1);
    const p = findPath(g, 0.5, 0.5, 95.5, 95.5)!;
    expect(p[p.length - 1]).toEqual([95.5, 95.5]);
    pocket(g, 50, 50, 1);
    const q = findPath(g, 0.5, 0.5, 50.5, 50.5)!;
    const [ex, ey] = q[q.length - 1];
    expect(g.region(ex, ey)).toBe(g.region(0.5, 0.5));
    expect(Math.hypot(ex - 50.5, ey - 50.5)).toBeLessThan(3.5);
  });

  test('a body standing where a tree is put down steps off it and still obeys orders', () => {
    const w = newWorld();
    const v = w.unitsOf(0)[0];
    w.addNode({ type: 'wood', x: Math.floor(v.x) + 0.5, y: Math.floor(v.y) + 0.5, amount: 50, shard: false, tree: true });
    expect(w.grid.isBlocked(v.x, v.y)).toBe(true);
    w.step();
    expect(w.grid.isBlocked(v.x, v.y)).toBe(false);
    const to = w.grid.nearestOpen(v.x + 4, v.y + 2)!;
    w.step([{ player: 0, cmd: { type: 'move', units: [v.id], x: to[0], y: to[1] } }]);
    run(w, 20 * 10, () => v.order.kind === 'idle');
    expect(Math.hypot(v.x - to[0], v.y - to[1])).toBeLessThan(0.6);
  });

  test('a gatherer never picks food it can\'t get to, even sent straight to it', () => {
    const w = newWorld();
    const v = w.unitsOf(0).find((u) => u.specId === 'villager')!;
    const cx = Math.floor(v.x) + 4, cy = Math.floor(v.y);
    pocket(w.grid, cx, cy, 1);
    for (const n of w.nodes.values()) if (n.type === 'food') n.amount = 0; // (picked bare: only the two below are left)
    const walledIn = w.addNode({ type: 'food', x: cx + 0.5, y: cy + 0.5, amount: 100, shard: false, tree: false });
    const open = w.grid.nearestOpen(v.x - 6, v.y + 3)!;
    const reachable = w.addNode({ type: 'food', x: open[0], y: open[1], amount: 100, shard: false, tree: false });
    expect(w.nearestNode(v, 'food', 40, false)).toBe(reachable);
    w.step([{ player: 0, cmd: { type: 'gather', units: [v.id], node: walledIn.id } }]);
    run(w, 20 * 20, () => v.food > 0);
    expect(v.order.kind === 'gather' && v.order.node).toBe(reachable.id);
    expect(v.food).toBeGreaterThan(0);
  });

  test('sent somewhere it can\'t get to, a body goes as close as it can and stops', () => {
    const w = newWorld();
    const v = w.unitsOf(0)[0];
    const cx = Math.floor(v.x) + 5, cy = Math.floor(v.y);
    pocket(w.grid, cx, cy, 1);
    w.step([{ player: 0, cmd: { type: 'move', units: [v.id], x: cx + 0.5, y: cy + 0.5 } }]);
    run(w, 20 * 15, () => v.order.kind === 'idle');
    expect(v.order.kind).toBe('idle');
    expect(Math.hypot(v.x - cx - 0.5, v.y - cy - 0.5)).toBeLessThan(3.6);
  });
});

describe('a set pike', () => {
  test('stays planted while its fallen holder drops: a lancer that kills a braced short pike from further out still runs onto the point', () => {
    // a pikeman with a pike half the lance's length: the lance lands first and kills him (1 hp), and the lancer rides on
    const short = withExtras(meadowfolk, { patch: { pikeman: { attack: { style: 'strike', crystalMass: 2, shaft: 1.5 } } } });
    const w = new World({ seed: 7, scenario: arenaScenario(2), players: [{ name: 'A', faction: short }, { name: 'B', faction: meadowfolk }] }); // (an empty field: no wildlife)
    const pike = w.spawnAt(0, 'pikeman', 20, 26, 0)!, lancer = w.spawnAt(1, 'lynx', 34, 26, 4)!;
    pike.hp = 1;
    w.step([{ player: 0, cmd: { type: 'stance', units: [pike.id], stance: 'hold' } }, { player: 1, cmd: { type: 'attack', units: [lancer.id], target: pike.id, charge: true } }]);
    const full = lancer.hp;
    run(w, 20 * 8, () => !w.units.has(pike.id));
    expect(w.units.has(pike.id)).toBe(false);
    expect(lancer.hp).toBe(full); // (he never got his blow in)
    run(w, 20); // (the second his body takes to fall)
    expect(lancer.hp).toBeLessThan(full - 50);
  });
});
