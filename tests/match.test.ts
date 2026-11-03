import { describe, expect, test } from 'vitest';
import { fenfolk } from '../src/factions/fenfolk';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';

describe('match', () => {
  // (a game's stats are checked with the AI game in factions.test.ts)
  test('resigning ends the game for the other side', () => {
    const w = new World({ seed: 9, players: [{ name: 'Meadow', faction: meadowfolk }, { name: 'Fen', faction: fenfolk }] });
    const st = w.stats;
    w.step([{ player: 0, cmd: { type: 'resign' } }]);
    for (let i = 0; i < 20 && w.winner < 0; i++) w.step();
    expect(w.winner).toBe(1);
    expect(st.resigned).toBe(0);
  });
  test('destroy kills your own units and buildings, never anyone else\'s', () => {
    const w = new World({ seed: 9, players: [{ name: 'Meadow', faction: meadowfolk }, { name: 'Fen', faction: fenfolk }] });
    const mine = w.unitsOf(0)[0], theirs = w.unitsOf(1)[0], tc = w.baseOf(0)!;
    w.step([{ player: 0, cmd: { type: 'destroy', ids: [mine.id, theirs.id, tc.id] } }]);
    expect(w.units.has(mine.id)).toBe(false);
    expect(w.buildings.has(tc.id)).toBe(false);
    expect(w.units.has(theirs.id)).toBe(true);
  });
  test('shift-queued orders run one after another', () => {
    const w = new World({ seed: 9, players: [{ name: 'Meadow', faction: meadowfolk }, { name: 'Fen', faction: fenfolk }] });
    const u = w.unitsOf(0)[0];
    const a = w.grid.nearestOpen(u.x + 3, u.y)!, b = w.grid.nearestOpen(u.x + 3, u.y + 3)!;
    w.step([{ player: 0, cmd: { type: 'move', units: [u.id], x: a[0], y: a[1] } }, { player: 0, cmd: { type: 'move', units: [u.id], x: b[0], y: b[1], queue: true } }]);
    expect(u.queue.length).toBe(1);
    for (let i = 0; i < 20 * 15; i++) w.step();
    expect(Math.hypot(u.x - b[0], u.y - b[1])).toBeLessThan(0.6);
    expect(u.queue.length).toBe(0);
  });
});
