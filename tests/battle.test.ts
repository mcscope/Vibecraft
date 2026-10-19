import { describe, expect, test } from 'vitest';
import { PLAYABLE } from '../src/factions';
import { aiDraft, armyCost, CAMP_STOCK, defaultDeployment, pitchedBattle, supplyCamp } from '../src/sim/battle';
import { BATTLE_MAPS, inZone } from '../src/sim/battleMaps';
import { findPath } from '../src/sim/pathfinding';
import { World } from '../src/sim/world';

describe('pitched battle', () => {
  test("the computer's draft spends its budget, and includes a big unit when it can afford one", () => {
    for (const f of PLAYABLE) {
      const army = aiDraft(f, 2000);
      expect(armyCost(f, army), f.id).toBeLessThanOrEqual(2000);
      expect(armyCost(f, army), f.id).toBeGreaterThan(1500);
      expect(Object.keys(army).some((id) => (f.units.find((u) => u.id === id)?.mass ?? 0) > 150), f.id).toBe(true);
    }
  });

  test('both armies deploy inside their own zones', () => {
    const [a, b] = PLAYABLE;
    const w = new World({ seed: 1, scenario: pitchedBattle('river-ford', [defaultDeployment(a, aiDraft(a, 2000), 0), defaultDeployment(b, aiDraft(b, 2000), 1)]), players: [{ name: 'A', faction: a }, { name: 'B', faction: b }] });
    for (const owner of [0, 1]) {
      expect(w.unitsOf(owner).length).toBeGreaterThan(5);
      for (const u of w.unitsOf(owner)) expect(inZone(owner, Math.round(u.x), Math.round(u.y)), `${u.specId} at ${u.x},${u.y}`).toBe(true);
    }
  });

  test('a supply camp deploys stocked, and nothing can be trained or built in a battle', () => {
    const [a, b] = PLAYABLE;
    const camp = supplyCamp(a)!;
    const w = new World({ seed: 1, scenario: pitchedBattle('open-steppe', [defaultDeployment(a, { [camp.id]: 1, [a.workerId]: 3 }, 0), []]), players: [{ name: 'A', faction: a }, { name: 'B', faction: b }] });
    const [c] = w.buildingsOf(0);
    expect(c.specId).toBe(camp.id);
    expect(inZone(0, c.ox, c.oy)).toBe(true);
    expect(c.stock.crystal).toBe(CAMP_STOCK.crystal);
    const trains = a.buildings!.find((x) => x.trains?.length)!;
    w.enqueue({ player: 0, cmd: { type: 'train', building: c.id, specId: trains.trains![0] } });
    w.step();
    expect(c.queue.length).toBe(0);
    expect(w.vision(0, c.ox, c.oy)).toBe(2);
  });

  test('every battle map keeps its zones open and connects them', () => {
    for (const m of BATTLE_MAPS) {
      const g = m.generate(7);
      for (let y = 3; y < 61; y++) for (const x of [4, 59]) expect(g.grid.isBlocked(x, y), `${m.id} ${x},${y}`).toBe(false);
      expect(findPath(g.grid, 8, 32, 55, 32), m.id).toBeTruthy();
    }
  });
});
