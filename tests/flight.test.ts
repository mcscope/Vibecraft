import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { bodyHeight } from '../src/sim/physics';
import { skirmish } from '../src/sim/scenarios';
import { World } from '../src/sim/world';
import { eagle, withExtras } from './kit';

const fliers = withExtras(meadowfolk, { units: [eagle] });

const fresh = () => {
  const w = new World({ seed: 7, scenario: { ...skirmish('woodlands'), victory: false }, players: [{ name: 'H', faction: fliers }, { name: 'M', faction: meadowfolk }] }); // (no winner: the fights here run on)
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
    let maxDev = 0, flew = false, minCal = cal0, crossed = false;
    for (let i = 0; i < 20 * 30; i++) {
      w.step();
      if (!crossed) maxDev = Math.max(maxDev, Math.abs(e.y - (y0 + 0.5)));
      if (e.x > x0 + 6) crossed = true;
      if (e.airborne) flew = true;
      minCal = Math.min(minCal, e.cal);
    }
    expect(flew).toBe(true);
    expect(crossed).toBe(true);
    expect(maxDev).toBeLessThan(0.1); // straight over, no detour
    expect(e.airborne).toBe(false); // with nothing left to do it circled down and landed
    expect(e.x).toBeGreaterThan(x0 + 3.5); // on the far side of the wall
    expect(minCal).toBeLessThan(cal0 - 20); // flying is hungry work
  });

  test('a striker can hit a flier only when it comes low enough', () => {
    const w = fresh();
    const hall = w.baseOf(0)!;
    const e = w.spawnAt(0, 'eagle', hall.ox + 8, hall.oy + 12)!;
    const m = w.spawnAt(1, 'maceman', hall.ox + 8.6, hall.oy + 12)!;
    e.airborne = true; e.alt = 1; e.order = { kind: 'idle' };
    const hp = e.hp;
    m.order = { kind: 'attack', target: e.id };
    for (let i = 0; i < 20 * 3; i++) w.step();
    expect(e.hp).toBeLessThan(hp); // a metre up: within a mace's reach
  });

  test('melee can\'t reach a flier high up; a melee flier dives and strikes only once it\'s down within reach', () => {
    const w = fresh();
    const hall = w.baseOf(0)!;
    const e = w.spawnAt(0, 'eagle', hall.ox + 8, hall.oy + 12)!;
    const m = w.spawnAt(1, 'maceman', hall.ox + 8.6, hall.oy + 12)!;
    e.airborne = true; e.alt = 10; e.order = { kind: 'move', x: hall.ox + 8, y: hall.oy + 20 };
    const hp = e.hp;
    m.order = { kind: 'attack', target: e.id };
    for (let i = 0; i < 10; i++) w.step();
    expect(e.hp).toBe(hp); // 10 m up: out of a mace's reach
    // the eagle attacks a villager (one that won't strike back): it dives on it, and strikes only once it's down
    // within reach of it
    w.units.delete(m.id);
    const v = w.spawnAt(1, 'villager', hall.ox + 8.6, hall.oy + 12)!;
    v.order = { kind: 'idle' };
    e.order = { kind: 'attack', target: v.id };
    const vhp = v.hp;
    let struckFrom = Infinity;
    for (let i = 0; i < 20 * 20 && struckFrom === Infinity; i++) { const alt = e.alt; w.step(); if (v.hp < vhp) struckFrom = alt; }
    expect(struckFrom).toBeLessThan(0.8 * bodyHeight(v.stats.mass) + 1.5); // (its shoulders, plus a beak's reach)
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
