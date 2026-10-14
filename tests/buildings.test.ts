import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';
import { capitalFor, deriveBuilding, techCost, techGate, validateFaction } from '../src/sim/physics';
const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) w.step(); };
const newWorld = () => new World({ seed: 7, players: [{ name: 'A', faction: meadowfolk }, { name: 'B', faction: meadowfolk }] });

describe('capital curve', () => {
  test('agreed numbers', () => {
    expect(capitalFor(2)).toBeCloseTo(720);
    expect(capitalFor(2.5)).toBeCloseTo(1377.5, 0);
    expect(techCost(1, 0.3)).toBe(Math.ceil(0.7 * capitalFor(1.3)));
    expect(techGate(1.6, 0.4)).toBeCloseTo(0.5 * capitalFor(2));
  });

  test('meadowfolk tree pays for every refinement and tech', () => {
    expect(validateFaction(meadowfolk)).toEqual([]);
    const hall = deriveBuilding(meadowfolk.buildings!.find((b) => b.id === 'great-hall')!, meadowfolk);
    expect(hall.effectiveCapital).toBe(540 + 300 + 360 + 180);
    expect(hall.maxHp).toBe(6 * 540);
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
    expect(tc.stock.wood).toBeCloseTo(400 - 180, 0); // a barracks is 180 wood
  });

  test('prerequisites gate placement', () => {
  const w = newWorld();
  expect(w.buildBlocker(0, 'forge')).toMatch(/Barracks/);
  w.addBuilding(0, 'barracks', 20, 20);
  expect(w.buildBlocker(0, 'forge')).toBeNull();
  });
});

describe('training and research', () => {
  test('auto-train keeps a building producing while its stock lasts', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    tc.stock = { food: 0, wood: 0, crystal: 0 }; // no carts topping it up mid-test
    const b = w.addBuilding(0, 'barracks', tc.ox + 6, tc.oy)!;
    b.stock = { food: 200, wood: 0, crystal: 50 };
    w.enqueue({ player: 0, cmd: { type: 'autoTrain', building: b.id, specId: 'slinger' } });
    run(w, 20 * 60);
    expect(w.unitsOf(0).filter((u) => u.specId === 'slinger').length).toBe(3); // 200 food buys 3 slingers (60 each)
    // turning it off stops new orders; the one already waiting in the queue still trains
    w.enqueue({ player: 0, cmd: { type: 'autoTrain', building: b.id, specId: null } });
    b.stock.food = 500;
    run(w, 20 * 30);
    expect(w.unitsOf(0).filter((u) => u.specId === 'slinger').length).toBe(4);
    run(w, 20 * 30);
    expect(w.unitsOf(0).filter((u) => u.specId === 'slinger').length).toBe(4);
  });

  test('a click queues even when the building is short; it pays and trains once stock arrives', () => {
  const w = newWorld();
  const tc = w.baseOf(0)!;
  tc.stock = { food: 0, wood: 0, crystal: 0 };
  const b = w.addBuilding(0, 'barracks', tc.ox + 6, tc.oy)!;
  b.stock = { food: 400, wood: 0, crystal: 1 }; // plenty of food, not enough crystal for a maceman (2)
  w.enqueue({ player: 0, cmd: { type: 'train', building: b.id, specId: 'maceman' } });
  run(w, 20 * 30);
  expect(b.queue.length).toBe(1);
  expect(b.queue[0].kind === 'unit' && b.queue[0].paid).toBe(false);
  b.stock.crystal = 2;
  run(w, 20 * 25);
  expect(w.unitsOf(0).some((u) => u.specId === 'maceman')).toBe(true);
  });

  test('any queue item can be cancelled, and a waiting order does not block paid ones', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    tc.stock = { food: 0, wood: 0, crystal: 0 };
    w.enqueue({ player: 0, cmd: { type: 'train', building: tc.id, specId: 'villager' } });
    run(w, 2);
    tc.queue.push({ kind: 'unit', specId: 'villager', progress: 0, total: 1, food: 0, crystal: 0, home: 0, paid: true });
    run(w, 30);
    expect(tc.queue.length).toBe(1); // the paid one went ahead and finished
    w.enqueue({ player: 0, cmd: { type: 'cancelTrain', building: tc.id, index: 0 } });
    run(w, 1);
    expect(tc.queue.filter((q) => q.kind === 'unit' && q.specId === 'villager').length).toBe(0);
  });

  test('research raises (work) refinement for existing units everywhere', () => {
  const w = newWorld();
  const tc = w.baseOf(0)!;
  tc.stock.wood = 500;
  const v = w.unitsOf(0)[0];
  const hp0 = v.stats.maxHp, rate0 = v.stats.gatherRate, speed0 = v.stats.speed, carry0 = v.stats.carryCapacity;
  w.enqueue({ player: 0, cmd: { type: 'research', building: tc.id, techId: 'villager-tools' } });
  run(w, 20 * 20);
  expect(w.players[0].researched).toContain('villager-tools');
  // Better Tools is a work tech: gather rate, speed and carry ×1.3 for villagers already out there
  expect(v.stats.workRefinement).toBeCloseTo(1.3);
  expect(v.stats.gatherRate).toBeCloseTo(rate0 * 1.3);
  expect(v.stats.speed).toBeCloseTo(speed0 * 1.3);
  expect(v.stats.carryCapacity).toBeCloseTo(carry0 * 1.3);
  expect(v.stats.refinement).toBeCloseTo(1);
  expect(v.stats.maxHp).toBeCloseTo(hp0);
  expect(tc.stock.wood).toBe(500 - techCost(1, 0.3));
  });
});

describe('towers and infrastructure', () => {
  test('a stocked watchtower shoots enemies in range', () => {
    const w = newWorld();
    const t = w.addBuilding(0, 'watchtower', 30, 30)!;
    t.stock = { food: 0, wood: 0, crystal: 30 }; // no food needed, just crystal ammo
    const enemy = w.unitsOf(1)[0];
    enemy.x = enemy.px = 33; enemy.y = enemy.py = 31; enemy.order = { kind: 'idle' };
    const hp = enemy.hp;
    run(w, 20 * 4);
    expect(t.stock.crystal).toBeLessThan(30);
    expect(enemy.hp).toBeLessThan(hp);
  });

  test('gathering camp boosts gathering nearby and sows plants that grow', () => {
  const w = newWorld();
  const tc = w.baseOf(0)!;
  const camp = w.addBuilding(0, 'gathering-camp', tc.ox + 8, tc.oy + 8)!;
  expect(camp.stats.gatherBoost).toBeGreaterThan(1.1);
  const cx = camp.ox + 1, cy = camp.oy + 1;
  expect(w.gatherBoostAt(0, cx + 3, cy, 'food')).toBe(camp.stats.gatherBoost);
  expect(w.gatherBoostAt(0, cx + 20, cy, 'food')).toBe(1);
  expect(w.gatherBoostAt(1, cx + 3, cy, 'food')).toBe(1);
  camp.stock = { food: 300, wood: 300, crystal: 0 };
  run(w, 20 * 140); // 60 kg of sowing mechanism plants 4.8 kg/s of yield: a bush, then a tree
  const sown = [...w.nodes.values()].filter((n) => n.sownBy === camp.id);
  expect(sown.some((n) => n.type === 'food')).toBe(true);
  expect(sown.some((n) => n.type === 'wood')).toBe(true);
  expect(camp.stock.food).toBeLessThan(300);
  run(w, 20 * 100);
  const grown = [...w.nodes.values()].filter((n) => n.sownBy === camp.id && !n.growLeft);
  expect(grown.length).toBeGreaterThan(0);
  expect(grown.every((n) => n.amount <= n.maxAmount + 1e-6)).toBe(true);
  // toggling off stops new planting
  w.enqueue({ player: 0, cmd: { type: 'setSowing', building: camp.id, resources: [] } });
  run(w, 1);
  const n0 = [...w.nodes.values()].filter((n) => n.sownBy === camp.id).length;
  camp.stock = { food: 300, wood: 300, crystal: 0 };
  run(w, 20 * 60);
  expect([...w.nodes.values()].filter((n) => n.sownBy === camp.id).length).toBeLessThanOrEqual(n0);
  });
});
