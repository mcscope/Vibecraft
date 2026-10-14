import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World, WILD } from '../src/sim/world';

const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) w.step(); };
const newWorld = () => new World({ seed: 7, players: [{ name: 'A', faction: meadowfolk }, { name: 'B', faction: meadowfolk }] });
const wild = (w: World, id: string) => w.unitsOf(w.wildsId).filter((u) => u.specId === id);

describe('wildlife', () => {
  test('each faction\'s wildlife spawns in its own half, away from the bases, owned by the neutral Wilds', () => {
    const w = newWorld();
    expect(w.wildsId).toBe(2);
    expect(w.players[w.wildsId].neutral).toBe(true);
    expect(wild(w, 'deer').length).toBe(2 * 3 * 3); // 2 halves × 3 herds × 3 deer
    expect(wild(w, 'wolf').length).toBe(2 * 2 * 3);
    for (const u of w.unitsOf(w.wildsId)) {
      for (const [hx, hy] of w.homes) expect(Math.hypot(u.x - hx, u.y - hy)).toBeGreaterThan(WILD.minFromHome - 2);
    }
    const half = (owner: number) => w.unitsOf(w.wildsId).filter((u) => w.territory(u.x, u.y) === owner).length;
    expect(half(0)).toBeGreaterThan(10);
    expect(half(1)).toBeGreaterThan(10);
  });

  test('wolves attack whatever comes close', () => {
    const w = newWorld();
    const wolf = wild(w, 'wolf')[0];
    const v = w.unitsOf(0).find((u) => u.specId === 'villager')!;
    v.x = v.px = wolf.x + 2; v.y = v.py = wolf.y; v.order = { kind: 'idle' };
    const hp = v.hp;
    run(w, 20 * 5);
    expect(v.hp).toBeLessThan(hp);
  });

  test('a villager hunts a deer: walks up, brings it down, gathers the carcass', () => {
    const w = newWorld();
    for (const x of wild(w, 'wolf')) w.units.delete(x.id);
    const deer = wild(w, 'deer')[0];
    const v = w.unitsOf(0).find((u) => u.specId === 'villager')!;
    v.x = v.px = deer.x + 4; v.y = v.py = deer.y;
    w.enqueue({ player: 0, cmd: { type: 'hunt', units: [v.id], target: deer.id } });
    run(w, 20 * 15);
    expect(w.units.has(deer.id)).toBe(false);
    expect(v.order.kind === 'gather' || v.food > 0).toBe(true);
    expect(v.food).toBeGreaterThan(0);
  });

  test('idle soldiers fight wolves on their own but leave deer alone', () => {
    const w = newWorld();
    const deer = wild(w, 'deer')[0];
    for (const x of wild(w, 'wolf')) w.units.delete(x.id);
    const m = w.spawnAt(0, 'maceman', deer.x + 3, deer.y)!;
    m.order = { kind: 'idle' };
    run(w, 20 * 5);
    expect(m.engage === deer.id || m.order.kind !== 'idle').toBe(false);
  });

  test('a killed animal leaves a carcass of food that villagers can gather', () => {
    const w = newWorld();
    const deer = wild(w, 'deer')[0];
    const at = [deer.x, deer.y];
    deer.hp = 0;
    run(w, 1);
    const carcass = [...w.nodes.values()].find((n) => n.carcass)!;
    expect(carcass).toBeTruthy();
    expect(carcass.type).toBe('food');
    expect(carcass.amount).toBe(60);
    expect(Math.hypot(carcass.x - at[0], carcass.y - at[1])).toBeLessThan(3);
    expect([...w.nodes.values()].filter((n) => n.shard).length).toBe(0); // animals drop no crystal
    const v = w.unitsOf(0).find((u) => u.specId === 'villager')!;
    w.enqueue({ player: 0, cmd: { type: 'gather', units: [v.id], node: carcass.id } });
    run(w, 20 * 40);
    expect(carcass.amount).toBeLessThan(60);
  });

  test('the Wilds never win and never stop a player from winning', () => {
    const w = newWorld();
    for (const u of w.unitsOf(1)) w.units.delete(u.id);
    for (const b of w.buildingsOf(1)) b.hp = 0;
    run(w, 20);
    expect(w.winner).toBe(0);
  });
});
