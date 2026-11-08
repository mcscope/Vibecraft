import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { LEVEL_M } from '../src/sim/map';
import { K } from '../src/sim/physics';
import { World } from '../src/sim/world';

describe('high ground', () => {
  test('a crystal thrown down from high ground hits harder by its fall (m·g·Δh), and high ground sees further', () => {
    const w = new World({ seed: 7, players: [{ name: 'A', faction: meadowfolk }, { name: 'B', faction: meadowfolk }] });
    w.step();
    const g = w.grid, target = w.unitsOf(1)[0], [x, y] = [Math.floor(target.x) - 6, Math.floor(target.y)];
    const raise = (level: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) g.rise[(y + dy) * g.width + x + dx] = level; };
    const thrown = () => {
      w.launch(0, x + 0.5, y + 0.5, 0, target, 20, 10, 0.5);
      return [...w.projectiles.values()].pop()!.damage;
    };
    const flat = thrown();
    raise(1);
    expect(thrown() - flat).toBeCloseTo(0.5 * K.gravity * LEVEL_M * K.damageScale);
    // a scout stood on the raised ground sees past where it saw from the field
    raise(0);
    const scout = w.unitsOf(0)[0];
    scout.x = scout.px = x + 0.5; scout.y = scout.py = y + 0.5;
    const far = Math.floor(scout.stats.sight) + 1;
    w.updateVision();
    expect(w.vision(0, x - far, y)).not.toBe(2);
    raise(1);
    w.updateVision();
    expect(w.vision(0, x - far, y)).toBe(2);
  });
});
