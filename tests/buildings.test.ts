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

  test('a waiting town center can take a sowing camp\'s seed', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    for (const u of w.unitsOf(0)) if (!u.carter) w.units.delete(u.id);
    tc.stock = { food: 1000, wood: 0, crystal: 0 };
    run(w, 20 * 60);
    tc.stock = { food: 0, wood: 0, crystal: 0 };
    const camp = w.addBuilding(0, 'gathering-camp', tc.ox + 8, tc.oy)!;
    camp.sowing = ['food'];
    camp.sowProgress = 1e9; // busy: holds its seed, plants nothing
    camp.stock = { food: 90, wood: 0, crystal: 0 }; // barely more than one planting's seed
    w.enqueue({ player: 0, cmd: { type: 'train', building: tc.id, specId: 'villager' } });
    run(w, 20 * 60);
    expect(w.unitsOf(0).some((u) => u.specId === 'villager')).toBe(true);
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
    const want = w.supplyTargets(t);
    expect(t.stock.crystal).toBeGreaterThanOrEqual(want.crystal - 1);
    expect(t.stock.food).toBeGreaterThanOrEqual(want.food - 1);
    expect(v.order.kind).toBe('idle');
  });

  test('a cart brings a building everything it is short of in one trip', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    tc.stock = { food: 1000, wood: 0, crystal: 100 };
    run(w, 20 * 50); // first cart
    const t = w.addBuilding(0, 'watchtower', tc.ox + 8, tc.oy)!;
    let both = false;
    for (let i = 0; i < 20 * 60 && !both; i++) {
      w.step();
      both = [...w.units.values()].some((u) => u.carter && u.order.kind === 'cart' && u.order.home === t.id && u.food > 0 && u.crystal > 0);
    }
    expect(both).toBe(true);
  });

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

    test('clicking a growing bush sets the villager on the nearest ripe one in that patch', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    const ripe = [...w.nodes.values()].filter((n) => n.type === 'food' && !n.shard).sort((a, b) => Math.hypot(a.x - tc.ox, a.y - tc.oy) - Math.hypot(b.x - tc.ox, b.y - tc.oy))[0];
    const sapling = w.addNode({ type: 'food', x: Math.floor(ripe.x) + 2.5, y: Math.floor(ripe.y) + 0.5, amount: 0, shard: false, tree: false });
    sapling.maxAmount = 200; sapling.growLeft = 200; sapling.growRate = 0.001;
    const v = w.unitsOf(0).find((u) => u.specId === 'villager')!;
    w.enqueue({ player: 0, cmd: { type: 'gather', units: [v.id], node: sapling.id } });
    run(w, 20 * 8);
    // working a ripe bush in that patch, not standing at the sapling
    expect(v.order.kind === 'gather' && v.order.node !== sapling.id).toBe(true);
    expect(v.food).toBeGreaterThan(0);
  });

    test('villagers carry no crystal', () => {
    const w = newWorld();
    const v = w.unitsOf(0).find((u) => u.specId === 'villager')!;
    expect(v.stats.crystalCost).toBe(0);
    expect(v.crystal).toBe(0);
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

    test('research raises (work) refinement for existing units everywhere', () => {
    const w = newWorld();
    const tc = w.baseOf(0)!;
    tc.stock.wood = 500;
    const v = w.unitsOf(0)[0];
    const hp0 = v.stats.maxHp, rate0 = v.stats.gatherRate, speed0 = v.stats.speed;
    w.enqueue({ player: 0, cmd: { type: 'research', building: tc.id, techId: 'villager-tools' } });
    run(w, 20 * 20);
    expect(w.players[0].researched).toContain('villager-tools');
    // Better Tools is a work tech: gather rate and speed ×1.3, combat untouched
    expect(v.stats.workRefinement).toBeCloseTo(1.3);
    expect(v.stats.gatherRate).toBeCloseTo(rate0 * 1.3);
    expect(v.stats.speed).toBeCloseTo(speed0 * 1.3);
    expect(v.stats.refinement).toBeCloseTo(1);
    expect(v.stats.maxHp).toBeCloseTo(hp0);
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
