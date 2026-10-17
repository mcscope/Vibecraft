import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';
import { eagle, withExtras } from './kit';

const fliers = withExtras(meadowfolk, { units: [eagle] });

const fresh = () => {
  const w = new World({ seed: 7, players: [{ name: 'H', faction: fliers }, { name: 'M', faction: meadowfolk }] });
  for (const u of [...w.units.values()]) if (w.players[u.owner].neutral) w.units.delete(u.id);
  return w;
};

describe('flight', () => {
  test('an eagle flies straight over a wall, burning calories, and lands when it stops', () => {
    const w = fresh();
    const hall = w.baseOf(0)!;
    const x0 = hall.ox + 6, y0 = hall.oy + 10;
    for (let y = y0 - 6; y <= y0 + 6; y++) w.grid.block(x0 + 3, y, 1); // a long wall in the way
    const e = w.spawnAt(0, 'eagle', x0 + 0.5, y0 + 0.5)!;
    e.order = { kind: 'idle' };
    const cal0 = e.cal;
    w.enqueue({ player: 0, cmd: { type: 'move', units: [e.id], x: x0 + 6.5, y: y0 + 0.5 } });
    let maxDev = 0, flew = false, minCal = cal0;
    for (let i = 0; i < 20 * 6; i++) { w.step(); maxDev = Math.max(maxDev, Math.abs(e.y - (y0 + 0.5))); if (e.airborne) flew = true; minCal = Math.min(minCal, e.cal); }
    expect(flew).toBe(true);
    expect(maxDev).toBeLessThan(0.1); // straight over, no detour
    expect(e.x).toBeGreaterThan(x0 + 6);
    expect(e.airborne).toBe(false); // landed once it stopped
    expect(minCal).toBeLessThan(cal0 - 20); // flying is hungry work
  });

  test('melee can\'t reach a flier in the air; a melee flier lands to strike', () => {
    const w = fresh();
    const hall = w.baseOf(0)!;
    const e = w.spawnAt(0, 'eagle', hall.ox + 8, hall.oy + 12)!;
    const m = w.spawnAt(1, 'maceman', hall.ox + 8.6, hall.oy + 12)!;
    e.airborne = true; e.order = { kind: 'move', x: hall.ox + 8, y: hall.oy + 20 };
    const hp = e.hp;
    m.order = { kind: 'attack', target: e.id };
    for (let i = 0; i < 10; i++) w.step();
    expect(e.hp).toBe(hp); // out of reach
    // the eagle attacks the maceman: it comes down to strike
    e.order = { kind: 'attack', target: m.id };
    let landed = false;
    for (let i = 0; i < 20 * 4; i++) { w.step(); if (!e.airborne && e.swing > 0) landed = true; }
    expect(landed).toBe(true);
  });
  test('a flier walks a short hop instead of taking off', () => {
    const w = fresh();
    const hall = w.baseOf(0)!;
    const spot = w.grid.nearestOpen(hall.ox + 8, hall.oy + 10)!;
    const e = w.spawnAt(0, 'eagle', spot[0], spot[1])!;
    e.order = { kind: 'idle' };
    w.enqueue({ player: 0, cmd: { type: 'move', units: [e.id], x: spot[0] + 2, y: spot[1] } });
    let flew = false;
    for (let i = 0; i < 20 * 4; i++) { w.step(); if (e.airborne) flew = true; }
    expect(flew).toBe(false);
    expect(Math.abs(e.x - (spot[0] + 2))).toBeLessThan(0.5);
  });
});
