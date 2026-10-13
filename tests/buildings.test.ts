import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';
import { capitalFor, deriveBuilding, techCost, techGate, validateFaction } from '../src/sim/physics';

const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) w.step(); };
const newWorld = () => new World({ seed: 7, players: [{ name: 'A', faction: meadowfolk }, { name: 'B', faction: meadowfolk }] });

describe('capital curve', () => {
  test('agreed numbers', () => {
    expect(capitalFor(2)).toBeCloseTo(1200);
    expect(capitalFor(2.5)).toBeCloseTo(2296, 0);
    expect(techCost(1, 0.3)).toBe(Math.ceil(0.7 * capitalFor(1.3)));
    expect(techGate(1.6, 0.4)).toBeCloseTo(0.5 * capitalFor(2));
  });
  test('meadowfolk tree pays for every refinement and tech', () => {
    expect(validateFaction(meadowfolk)).toEqual([]);
    const hall = deriveBuilding(meadowfolk.buildings!.find((b) => b.id === 'great-hall')!, meadowfolk);
    expect(hall.effectiveCapital).toBe(2300);
    expect(hall.maxHp).toBe(6 * 900);
    expect(hall.cacheCap).toBe(1800);
  });
  test('a design that its building cannot support is rejected', () => {
    const f = { ...meadowfolk, units: meadowfolk.units.map((u) => (u.id === 'slinger' ? { ...u, refinement: 2 } : u)) };
    expect(validateFaction(f).some((e) => e.includes('slinger'))).toBe(true);
  });
});

describe('construction', () => {
  test('villagers carry wood from the town center to build a barracks', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    tc.stock.wood = 400;
    const vills = w.unitsOf(0).map((u) => u.id);
    const spot = w.findBuildSpot(3, tc.ox + 6, tc.oy + 1)!;
    w.enqueue({ player: 0, cmd: { type: 'build', units: vills, specId: 'barracks', ox: spot[0], oy: spot[1] } });
    run(w, 20 * 120);
    const b = w.buildingsOf(0).find((x) => x.specId === 'barracks')!;
    expect(b.complete).toBe(true);
    expect(b.hp).toBeCloseTo(b.maxHp, 0);
    expect(tc.stock.wood).toBeCloseTo(100, 0);
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

    test('prerequisites gate placement', () => {
    const w = newWorld();
    expect(w.buildBlocker(0, 'forge')).toMatch(/Barracks/);
    w.addBuilding(0, 'barracks', 20, 20);
    expect(w.buildBlocker(0, 'forge')).toBeNull();
  });
});

describe('carters, training, research, towers', () => {
  test('the town center keeps a pool of carts that stock whichever building is short', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    tc.stock = { food: 2500, wood: 0, crystal: 300 };
    const b = w.addBuilding(0, 'barracks', tc.ox + 6, tc.oy)!;
    run(w, 20 * 90);
    const carts = w.unitsOf(0).filter((u) => u.carter);
    expect(carts.length).toBe(3);
    expect(b.stock.food).toBeGreaterThan(100);
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

  test('research raises refinement for existing units everywhere', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    tc.stock.wood = 500;
    const v = w.unitsOf(0)[0];
    const hp0 = v.stats.maxHp;
    w.enqueue({ player: 0, cmd: { type: 'research', building: tc.id, techId: 'villager-tools' } });
    run(w, 20 * 20);
    expect(w.players[0].researched).toContain('villager-tools');
    expect(v.stats.refinement).toBeCloseTo(1.3);
    expect(v.stats.maxHp).toBeCloseTo(hp0 * Math.pow(1.3, 2 / 3));
    expect(tc.stock.wood).toBe(500 - techCost(1, 0.3));
  });

  test('a stocked watchtower shoots enemies in range', () => {
    const w = newWorld();
    const t = w.addBuilding(0, 'watchtower', 30, 30)!;
    t.stock = { food: 50, wood: 0, crystal: 30 };
    const enemy = w.unitsOf(1)[0];
    enemy.x = enemy.px = 33; enemy.y = enemy.py = 31; enemy.order = { kind: 'idle' };
    const hp = enemy.hp;
    run(w, 20 * 4);
    expect(t.stock.crystal).toBeLessThan(30);
    expect(enemy.hp).toBeLessThan(hp);
  });
});
