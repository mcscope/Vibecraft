import { describe, expect, test } from 'vitest';
import { PLAYABLE } from '../src/factions';
import type { FactionSpec } from '../src/factions/types';
import { arenaScenario } from '../src/sim/arena';
import { DT, World } from '../src/sim/world';

const [meadowfolk, fenfolk, wildwelds] = PLAYABLE;

/** `id` charges a maceman holding his ground 16 tiles off: its speed on the way in and at the hit, and where it is 2 s on. */
function charge(f: FactionSpec, id: string) {
  const w = new World({ seed: 1, scenario: { ...arenaScenario(2), setup: (ww) => { ww.spawnAt(0, id, 10.5, 25.5); ww.spawnAt(1, 'maceman', 26.5, 25.5); } }, players: [{ name: 'A', faction: f }, { name: 'B', faction: meadowfolk }] });
  const u = w.unitsOf(0)[0], t = w.unitsOf(1)[0];
  t.stance = 'hold';
  w.enqueue({ player: 0, cmd: { type: 'attack', units: [u.id], target: t.id, charge: true } });
  let top = 0, atHit = 0, hitTick = -1, before = 0;
  const hp = t.hp, tx = t.x;
  for (let i = 0; i < 20 / DT && (hitTick < 0 || i < hitTick + 2 / DT); i++) {
    before = Math.hypot(u.vx, u.vy);
    w.step();
    if (hitTick < 0) top = Math.max(top, before);
    if (hitTick < 0 && t.hp < hp) { hitTick = i; atHit = before; }
  }
  return { top, atHit, past: u.x - tx };
}

describe('a charge', () => {
  test.each([['whipweld', wildwelds], ['ground-attacker3', wildwelds], ['bog-toad', fenfolk]] as Array<[string, FactionSpec]>)('%s hits at full speed and runs on past', (id, f) => {
    const c = charge(f, id);
    expect(c.atHit).toBeGreaterThan(c.top * 0.9); // no slowing for the blow (a hopper's bound isn't cut short)
    expect(c.past).toBeGreaterThan(0.5); // it carries on through, not stopping in front
  });
});
