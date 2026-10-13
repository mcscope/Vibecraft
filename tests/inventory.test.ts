import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World, type Unit } from '../src/sim/world';
import { K } from '../src/sim/physics';

function setup() {
  const w = new World({ seed: 7, players: [{ name: 'A', faction: meadowfolk }, { name: 'B', faction: meadowfolk }] });
  // villagers are unarmed; use two macemen (each swings a crystal it carries)
  const tc = w.baseOf(0)!;
  const a = w.spawnUnit(0, 'maceman', tc)!, b = w.spawnUnit(0, 'maceman', tc)!;
  return { w, a, b };
}
const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) w.step(); };

describe('weapon pack and cargo pack', () => {
  test('the weapon sits in its own pack: it weighs on the unit but leaves the cargo pack free', () => {
    const { w, a } = setup();
    const kit = a.stats.loadoutCrystal;
    expect(kit).toBeGreaterThan(0);
    expect(a.ammo).toBeCloseTo(kit); // its mace's crystal
    expect(a.crystal).toBe(0);
    expect(w.packLoad(a)).toBeCloseTo(kit); // still slows it down
    expect(w.freeCapacity(a)).toBeCloseTo(a.stats.cargoCapacity);
    expect(a.stats.cargoCapacity).toBeCloseTo(a.stats.carryCapacity - kit);
  });

  test('crystal in the cargo pack re-arms an empty weapon pack', () => {
    const { w, a } = setup();
    a.ammo = 0; a.crystal = 5; a.order = { kind: 'idle' };
    run(w, 1);
    expect(a.ammo).toBeCloseTo(a.stats.loadoutCrystal);
    expect(a.crystal).toBeCloseTo(5 - a.stats.loadoutCrystal);
  });

  test('give hands over cargo; crystal re-arms the receiver first', () => {
    const { w, a, b } = setup();
    a.food = 8;
    const kit = a.stats.loadoutCrystal;
    a.crystal = 5; // cargo
    b.ammo = 0; // b lost its weapon
    w.enqueue({ player: 0, cmd: { type: 'give', units: [a.id], to: b.id } });
    run(w, 60);
    expect(b.ammo).toBeCloseTo(kit);
    expect(b.crystal).toBeCloseTo(5 - kit);
    expect(b.food).toBeCloseTo(8);
    expect(a.ammo).toBeCloseTo(kit); // kept its own weapon
    expect(w.cargo(b)).toBeLessThanOrEqual(b.stats.cargoCapacity + 1e-6);
  });

  test("can't give to an enemy", () => {
    const { w, a } = setup();
    const enemy = w.unitsOf(1)[0];
    a.food = 5;
    w.enqueue({ player: 0, cmd: { type: 'give', units: [a.id], to: enemy.id } });
    run(w, 10);
    expect(a.food).toBe(5);
  });

  test('hungry units snack from their own pack', () => {
    const { w, a } = setup();
    a.order = { kind: 'idle' };
    a.cal = a.stats.maxCalories * 0.1;
    a.food = 3;
    run(w, 100);
    expect(a.food).toBeLessThan(3);
    expect(a.cal).toBeGreaterThan(a.stats.maxCalories * 0.1 + 2 * K.calPerFood);
  });

  test('thrown crystals land as pickups that anyone can gather', () => {
    const { w } = setup();
    const tc = w.buildingsOf(0)[0];
    const barracks = w.addBuilding(0, 'barracks', tc.ox + 5, tc.oy)!;
    barracks.stock.food = 1000; barracks.stock.crystal = 100;
    w.enqueue({ player: 0, cmd: { type: 'train', building: barracks.id, specId: 'slinger' } });
    run(w, 20 * 15);
    const p = w.unitsOf(0).find((u) => u.specId === 'slinger') as Unit;
    expect(p).toBeTruthy();
    const target = w.unitsOf(1)[0];
    target.x = p.x + 4; target.y = p.y; target.px = target.x; target.py = target.y;
    target.order = { kind: 'idle' };
    const before = p.ammo;
    w.enqueue({ player: 0, cmd: { type: 'attack', units: [p.id], target: target.id } });
    run(w, 20 * 3);
    expect(p.ammo).toBeLessThan(before);
    const shards = [...w.nodes.values()].filter((n) => n.shard);
    expect(shards.length).toBeGreaterThan(0);
  });
});

describe('big units picking up crystals', () => {
  test('a Hurlhorn can collect a thrown crystal lying under a training dummy', async () => {
    const { provingGrounds } = await import('../src/sim/scenarios');
    const { training } = await import('../src/factions/training');
    const w = new World({ seed: 3, scenario: provingGrounds(), players: [{ name: 'A', faction: meadowfolk }, { name: 'T', faction: training }] });
    const horn = w.unitsOf(0).find((u) => u.specId === 'hurlhorn')!;
    const dummy = w.unitsOf(1)[0];
    horn.ammo = 0; horn.crystal = 0;
    horn.x = horn.px = dummy.x - 4; horn.y = horn.py = dummy.y;
    const shard = w.addNode({ type: 'crystal', x: dummy.x, y: dummy.y, amount: 12, shard: true, tree: false });
    w.enqueue({ player: 0, cmd: { type: 'gather', units: [horn.id], node: shard.id } });
    run(w, 20 * 15);
    expect(horn.ammo + horn.crystal).toBeGreaterThanOrEqual(12 - 1e-6);
  });
});
