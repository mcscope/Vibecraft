import { describe, expect, test } from 'vitest';
import { FORMATIONS, formationSlots, type FormationUnit } from '../src/ui/formations';
import { PLAYABLE } from '../src/factions';
import { skirmish } from '../src/sim/scenarios';
import { World } from '../src/sim/world';

const group = (n: number): FormationUnit[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, x: (i % 4) * 0.8, y: Math.floor(i / 4) * 0.8, radius: 0.3, role: (i % 3) as 0 | 1 | 2 }));

describe('formations', () => {
  test('every formation gives each unit its own spot', () => {
    for (const { id } of FORMATIONS) for (const n of [2, 7, 16, 30]) {
      const slots = formationSlots(id, group(n), 20, 20, 0.7);
      expect(slots.map((s) => s.id).sort((a, b) => a - b), `${id} ×${n}`).toEqual(group(n).map((u) => u.id));
      for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++)
        expect(Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y), `${id} ×${n}`).toBeGreaterThan(0.6);
    }
  });

  test('a square faces outward, with the throwers inside', () => {
    const slots = formationSlots('square', group(24), 0, 0, 0);
    for (const s of slots) {
      const thrower = group(24).find((u) => u.id === s.id)!.role === 2;
      const out = Math.hypot(s.x, s.y);
      if (out > 1.5) expect(Math.cos(s.face - Math.atan2(s.y, s.x)), `${s.id}`).toBeGreaterThan(0.6); // a wall faces away from the middle
      if (thrower && slots.filter((x) => group(24).find((u) => u.id === x.id)!.role < 2).length >= 8) expect(out).toBeLessThan(2.5);
    }
  });

  test('a unit sent somewhere with a facing turns to it there, and a patrol turns back at each end', () => {
    const f = PLAYABLE[0];
    const w = new World({ seed: 1, scenario: { ...skirmish(), setup: (ww) => { ww.spawnAt(0, f.workerId, 10.5, 10.5); } , victory: false, wildlife: false }, players: [{ name: 'A', faction: f }, { name: 'B', faction: PLAYABLE[1] }] });
    const u = w.unitsOf(0)[0];
    w.enqueue({ player: 0, cmd: { type: 'move', units: [u.id], x: 13.5, y: 10.5, face: Math.PI / 2 } });
    for (let i = 0; i < 200; i++) w.step();
    expect(Math.hypot(u.x - 13.5, u.y - 10.5)).toBeLessThan(0.6);
    expect(Math.cos(u.facing - Math.PI / 2)).toBeGreaterThan(0.99);
    w.enqueue({ player: 0, cmd: { type: 'patrol', units: [u.id], x: 17.5, y: 10.5 } });
    let far = 0, back = 0;
    for (let i = 0; i < 600; i++) { w.step(); far = Math.max(far, u.x); if (far > 17 && u.x < 14) back++; }
    expect(far).toBeGreaterThan(17);
    expect(back).toBeGreaterThan(0);
    expect(u.order.kind).toBe('patrol');
  });
});

describe('charging at a spot', () => {
  test('runs for the spot, past an enemy it can see off to the side', () => {
    const [a, b] = PLAYABLE;
    const striker = a.units.find((u) => u.attack?.style === 'strike' && u.id !== a.workerId)!;
    const foe = b.units.find((u) => u.attack && u.id !== b.workerId)!;
    const w = new World({ seed: 1, scenario: { ...skirmish(), setup: (ww) => { ww.spawnAt(0, striker.id, 10.5, 20.5); ww.spawnAt(1, foe.id, 16.5, 24.5); }, victory: false, wildlife: false }, players: [{ name: 'A', faction: a }, { name: 'B', faction: b }] });
    const u = w.unitsOf(0)[0], e = w.unitsOf(1)[0];
    e.stance = 'hold';
    w.enqueue({ player: 0, cmd: { type: 'attackMove', units: [u.id], x: 24.5, y: 20.5, charge: true } });
    let closest = Infinity;
    w.step();
    for (let i = 0; i < 120 && u.order.kind === 'attackMove'; i++) { w.step(); closest = Math.min(closest, Math.hypot(u.x - e.x, u.y - e.y)); }
    expect(u.x).toBeGreaterThan(22); // got there
    expect(closest).toBeGreaterThan(2); // without turning off after the enemy
  });
});

describe('hold', () => {
  test('holding ground, it stays put with an enemy building in sight (and waits when out of crystal)', () => {
    const [a, b] = PLAYABLE;
    const w = new World({ seed: 1, scenario: { ...skirmish(), setup: () => {}, victory: false, wildlife: false }, players: [{ name: 'A', faction: a }, { name: 'B', faction: b }] });
    const thrower = a.units.find((u) => u.attack?.style === 'throw')!, striker = a.units.find((u) => u.attack?.style === 'strike' && u.id !== a.workerId)!;
    const hut = b.buildings!.find((x) => !x.unbuildable && x.size === 1)!;
    w.addBuilding(1, hut.id, 30, 20);
    const us = [w.spawnAt(0, striker.id, 24.5, 20.5)!, w.spawnAt(0, thrower.id, 24.5, 22.5)!];
    us[1].ammo = 0;
    w.enqueue({ player: 0, cmd: { type: 'stance', units: us.map((u) => u.id), stance: 'hold' } });
    const at = us.map((u) => [u.x, u.y]);
    for (let i = 0; i < 20 * 10; i++) w.step();
    us.forEach((u, k) => expect(Math.hypot(u.x - at[k][0], u.y - at[k][1]), u.specId).toBeLessThan(0.2));
  });

  test('stops them where they stand, and the next order ends it', () => {
    const f = PLAYABLE[0];
    const w = new World({ seed: 1, scenario: { ...skirmish(), setup: (ww) => { ww.spawnAt(0, f.workerId, 10.5, 10.5); }, victory: false, wildlife: false }, players: [{ name: 'A', faction: f }, { name: 'B', faction: PLAYABLE[1] }] });
    const u = w.unitsOf(0)[0];
    w.enqueue({ player: 0, cmd: { type: 'move', units: [u.id], x: 20.5, y: 10.5 } });
    for (let i = 0; i < 10; i++) w.step();
    w.enqueue({ player: 0, cmd: { type: 'stance', units: [u.id], stance: 'hold' } });
    w.step();
    expect(u.order.kind).toBe('idle');
    expect(u.stance).toBe('hold');
    w.enqueue({ player: 0, cmd: { type: 'move', units: [u.id], x: 20.5, y: 10.5 } });
    w.step();
    expect(u.stance).toBe('auto');
  });
});
