import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';
const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) w.step(); };
const newWorld = () => new World({ seed: 7, players: [{ name: 'A', faction: meadowfolk }, { name: 'B', faction: meadowfolk }] });

describe('gatherers', () => {
  test('a villager drops its berries before hauling or chopping wood', () => {
    const w = newWorld();
    const v = w.unitsOf(0).find((u) => u.specId === 'villager')!;
    v.food = 12;
    const tree = [...w.nodes.values()].filter((n) => n.tree).sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y))[0];
    w.enqueue({ player: 0, cmd: { type: 'gather', units: [v.id], node: tree.id } });
    let mixed = false;
    for (let t = 0; t < 20 * 40; t++) { w.step(); if (v.food > 0.05 && v.wood > 0.05) mixed = true; }
    expect(mixed).toBe(false);
    expect(v.food).toBeLessThan(0.05);
  });

  test('villagers carry a crystal-headed hammer', () => {
  const w = newWorld();
  const v = w.unitsOf(0).find((u) => u.specId === 'villager')!;
  expect(v.stats.crystalCost).toBe(1);
  expect(w.armed(v)).toBe(true);
  });

  test('sown bushes start holding their seed, can be picked while growing, and vanish when picked bare', () => {
  const w = newWorld();
  const tc = w.baseOf(0)!;
  const camp = w.addBuilding(0, 'gathering-camp', tc.ox + 8, tc.oy)!;
  camp.sowing = ['food'];
  camp.stock = { food: 100, wood: 0, crystal: 0 };
  run(w, 2);
  const bush = [...w.nodes.values()].find((n) => n.sownBy === camp.id)!;
  expect(bush.amount).toBeGreaterThan(60); // the seed went into it: never an empty bush
  expect(bush.growLeft).toBeGreaterThan(0);
  const v = w.unitsOf(0).find((u) => u.specId === 'villager')!;
  w.enqueue({ player: 0, cmd: { type: 'gather', units: [v.id], node: bush.id } });
  run(w, 20 * 10);
  expect(v.order.kind).toBe('gather');
  expect(v.food).toBeGreaterThan(0);
  bush.amount = 0.5; bush.growRate = 0; // nearly picked bare
  run(w, 20 * 3);
  expect(w.nodes.has(bush.id)).toBe(false);
  });
});
