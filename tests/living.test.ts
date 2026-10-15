import { describe, expect, test } from 'vitest';
import { fenfolk } from '../src/factions/fenfolk';
import { World } from '../src/sim/world';
import { pool as poolSpec, withExtras } from './kit';

const fen = withExtras(fenfolk, { buildings: [poolSpec] });

const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) w.step(); };

describe('living buildings', () => {
  test('a spawning pool is planted small, grows by eating roots, and trains fenlings only once big enough', () => {
    const w = new World({ seed: 7, players: [{ name: 'Fen', faction: fen }, { name: 'Fen2', faction: fenfolk }] });
    const hall = w.baseOf(0)!;
    const pool = w.addBuilding(0, 'spawning-pool', hall.ox + 8, hall.oy)!;
    expect(pool.grown).toBeCloseTo(450 * 0.15, 5);
    const hp0 = pool.maxHp;
    pool.stock = { food: 200, wood: 0, crystal: 20 };
    w.enqueue({ player: 0, cmd: { type: 'train', building: pool.id, specId: 'fenling' } });
    run(w, 20 * 5);
    expect(pool.queue[0].paid).toBe(false); // too young: fenlings need more capital than a seedling has
    expect(pool.grown!).toBeGreaterThan(450 * 0.15 + 5); // eating, growing
    expect(pool.maxHp).toBeGreaterThan(hp0);
    pool.stock.food = 1000;
    run(w, 20 * 120);
    expect(pool.queue.length === 0 || pool.queue[0].paid).toBe(true); // grown into it
  });
});
