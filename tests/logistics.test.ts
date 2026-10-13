import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';
const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) w.step(); };
const newWorld = () => new World({ seed: 7, players: [{ name: 'A', faction: meadowfolk }, { name: 'B', faction: meadowfolk }] });

describe('carts', () => {
  test('the town center keeps a pool of carts that bring a building what its queue needs', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    tc.stock = { food: 2500, wood: 0, crystal: 300 };
    const b = w.addBuilding(0, 'barracks', tc.ox + 6, tc.oy)!;
    run(w, 20 * 60);
    expect(w.unitsOf(0).filter((u) => u.carter).length).toBe(3);
    // nothing queued: only the small berry stash, no speculative stock
    expect(w.logistics.supplyTargets(b)).toEqual({ food: 20, wood: 0, crystal: 0 });
    expect(b.stock.food).toBeLessThan(40);
    w.enqueue({ player: 0, cmd: { type: 'train', building: b.id, specId: 'maceman' } });
    run(w, 20 * 40);
    expect(w.unitsOf(0).some((u) => u.specId === 'maceman')).toBe(true);
  });

  test('a queued technology waits for its wood, then researches', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    tc.stock = { food: 0, wood: 0, crystal: 0 };
    w.enqueue({ player: 0, cmd: { type: 'research', building: tc.id, techId: 'villager-tools' } });
    run(w, 20 * 5);
    expect(tc.queue[0]?.kind === 'tech' && !tc.queue[0].paid).toBe(true);
    tc.stock.wood = 500;
    run(w, 20 * 30);
    expect(w.players[0].researched).toContain('villager-tools');
  });

  test('carts can be pinned to a building, and unpinned with stop', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    tc.stock = { food: 2500, wood: 0, crystal: 300 };
    const tower = w.addBuilding(0, 'watchtower', tc.ox, tc.oy + 6)!;
    run(w, 20 * 45);
    const cart = w.unitsOf(0).find((u) => u.carter)!;
    w.enqueue({ player: 0, cmd: { type: 'assignCart', units: [cart.id], building: tower.id } });
    run(w, 2);
    expect(cart.order.kind === 'cart' && cart.order.pinned && cart.order.home).toBe(tower.id);
    w.enqueue({ player: 0, cmd: { type: 'stop', units: [cart.id] } });
    run(w, 20 * 3);
    expect(cart.order.kind === 'cart' && !cart.order.pinned).toBe(true); // rejoined the pool
  });

  test('carts can be trained by hand beyond the automatic pool, and join it', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    tc.stock.food = 3000;
    run(w, 20 * 90); // automatic pool of 3
    const pool = () => [...w.units.values()].filter((u) => u.owner === 0 && u.carter);
    expect(pool().length).toBe(3);
    w.enqueue({ player: 0, cmd: { type: 'train', building: tc.id, specId: 'mule' } });
    run(w, 20 * 40);
    expect(pool().length).toBe(4);
    expect(pool().every((u) => u.order.kind === 'cart' && u.order.base === tc.id)).toBe(true);
  });

  test('carts haul wood to construction sites too', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    tc.stock = { food: 2500, wood: 600, crystal: 300 };
    for (const u of w.unitsOf(0)) u.order = { kind: 'idle' };
    // place a site with nobody assigned to build it
    const spot = w.findBuildSpot(3, tc.ox + 7, tc.oy + 1)!;
    w.enqueue({ player: 0, cmd: { type: 'build', units: [], specId: 'barracks', ox: spot[0], oy: spot[1] } });
    run(w, 20 * 150);
    const b = w.buildingsOf(0).find((x) => x.specId === 'barracks')!;
    expect(b.complete).toBe(true);
  });
});

describe('supply', () => {
  test('carts bring an outlying building\'s surplus home to a waiting town center', () => {
  const w = newWorld();
  const tc = w.baseOf(0)!;
  for (const u of w.unitsOf(0)) if (!u.carter) w.units.delete(u.id); // nobody gathering
  tc.stock = { food: 1000, wood: 0, crystal: 0 };
  run(w, 20 * 60); // the pool of carts gets trained
  expect(w.unitsOf(0).some((u) => u.carter)).toBe(true);
  tc.stock = { food: 0, wood: 0, crystal: 0 };
  const camp = w.addBuilding(0, 'gathering-camp', tc.ox + 8, tc.oy)!;
  camp.sowing = [];
  camp.stock = { food: 400, wood: 0, crystal: 0 }; // what villagers dropped there
  w.enqueue({ player: 0, cmd: { type: 'train', building: tc.id, specId: 'villager' } });
  run(w, 20 * 60);
  expect(camp.stock.food).toBeLessThan(400);
  expect(w.unitsOf(0).some((u) => u.specId === 'villager')).toBe(true);
  });

  test('a new tower is fully stocked with ammo within a few trips', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    tc.stock = { food: 1000, wood: 0, crystal: 100 };
    run(w, 20 * 50); // first cart
    const t = w.addBuilding(0, 'watchtower', tc.ox + 8, tc.oy)!;
    run(w, 20 * 30);
    const want = w.logistics.supplyTargets(t);
    expect(want.food).toBe(0); // towers only use crystal
    expect(t.stock.crystal).toBeGreaterThanOrEqual(want.crystal - 1);
  });

  test('a lone cart brings everything a building is short of in one trip', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    tc.stock = { food: 1000, wood: 0, crystal: 100 };
    run(w, 20 * 50);
    const carts = w.unitsOf(0).filter((u) => u.carter);
    for (const c of carts.slice(1)) w.units.delete(c.id); // just one cart, so nobody splits the job
    const b = w.addBuilding(0, 'barracks', tc.ox + 8, tc.oy)!;
    w.enqueue({ player: 0, cmd: { type: 'train', building: b.id, specId: 'maceman' } }); // needs berries and crystal
    let both = false;
    for (let i = 0; i < 20 * 10 && !both; i++) { w.step(); both = carts[0].food > 0 && carts[0].crystal > 0; }
    expect(both).toBe(true);
  });

  test('a villager told to haul for a building stocks it from the town center, then stops', () => {
  const w = newWorld();
  const tc = w.baseOf(0)!;
  tc.stock = { food: 400, wood: 0, crystal: 100 };
  const t = w.addBuilding(0, 'watchtower', tc.ox + 10, tc.oy)!;
  for (const u of [...w.units.values()]) if (u.carter) w.units.delete(u.id);
  tc.queue = []; // no carts at all: only the villager supplies it
  const v = w.unitsOf(0).find((u) => u.specId === 'villager')!;
  w.enqueue({ player: 0, cmd: { type: 'haul', units: [v.id], building: t.id } });
  run(w, 20 * 120);
  const want = w.logistics.supplyTargets(t);
  expect(t.stock.crystal).toBeGreaterThanOrEqual(want.crystal - 1);
  expect(t.stock.food).toBeGreaterThanOrEqual(want.food - 1);
  expect(v.order.kind).toBe('idle');
  });
});
