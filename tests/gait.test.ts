import { describe, expect, test } from 'vitest';
import { fenfolk } from '../src/factions/fenfolk';
import { meadowfolk } from '../src/factions/meadowfolk';
import { DT, World } from '../src/sim/world';

describe('bounding gait', () => {
  test('a hopper is still while crouched, quicker in the air, the same speed on average, and walking all the way', () => {
    const w = new World({ seed: 7, players: [{ name: 'Fen', faction: fenfolk }, { name: 'M', faction: meadowfolk }] });
    for (const u of [...w.units.values()]) if (w.players[u.owner].neutral) w.units.delete(u.id);
    const hall = w.baseOf(0)!;
    const start = w.grid.nearestOpen(hall.ox + 6, hall.oy + 12)!;
    const f = w.spawnAt(0, 'fenling', start[0], start[1])!;
    f.order = { kind: 'idle' }; f.ammo = 0; // unloaded, so it runs at its listed speed
    const goal = w.grid.nearestOpen(start[0] + 14, start[1])!;
    expect(w.grid.lineClear(f.x, f.y, goal[0], goal[1])).toBe(true);
    w.enqueue({ player: 0, cmd: { type: 'move', units: [f.id], x: goal[0], y: goal[1] } });
    w.step();
    const steps: number[] = [];
    const anims = new Set<string>();
    for (let i = 0; i < 60; i++) { const x = f.x, y = f.y; w.step(); steps.push(Math.hypot(f.x - x, f.y - y)); anims.add(f.anim); }
    const still = steps.filter((d) => d < 1e-9).length, moving = steps.filter((d) => d > 1e-9);
    expect(still).toBeGreaterThan(5); // crouches between bounds
    expect(Math.max(...moving)).toBeGreaterThan(f.stats.speed * DT * 1.2); // faster while airborne
    const avg = steps.reduce((a, b) => a + b, 0) / (steps.length * DT);
    expect(avg).toBeGreaterThan(f.stats.speed * 0.85);
    expect(avg).toBeLessThan(f.stats.speed * 1.1);
    expect([...anims]).toEqual(['walk']); // never flickers to idle mid-hop
  });
});
