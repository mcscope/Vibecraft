import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { SkirmishAI, parseDifficulty } from '../src/ai/skirmishAI';
import { skirmish } from '../src/sim/scenarios';
import { TICK_RATE, World } from '../src/sim/world';

describe('skirmish AI', () => {
  test('difficulty comes from a menu or URL value, hard by default', () => {
    expect(parseDifficulty('easy')).toBe('easy');
    expect(parseDifficulty('hard')).toBe('hard');
    expect(parseDifficulty(null)).toBe('hard');
    expect(parseDifficulty('nightmare')).toBe('hard');
  });

  // a short game: the full hard-vs-easy match is `npm run aimatch`, not a test
  test('neither AI targets what it cannot see; both build up, hard faster', () => {
    const w = new World({ seed: 1000, scenario: skirmish('woodlands'), players: [{ name: 'Hard', faction: meadowfolk }, { name: 'Easy', faction: meadowfolk }] });
    const ais = [new SkirmishAI(0, 'hard'), new SkirmishAI(1, 'easy')];
    let blind = 0;
    for (let t = 0; t < TICK_RATE * 60 * 5 && w.winner < 0; t++) {
      const cmds = ais.flatMap((ai) => ai.think(w).map((cmd) => ({ player: ai.player, cmd })));
      for (const { player, cmd } of cmds) {
        if (cmd.type !== 'attack') continue;
        // a unit only while it's in sight; a building once its spot has been found
        const u = w.units.get(cmd.target), b = w.buildings.get(cmd.target);
        if (u && u.owner !== player && w.vision(player, u.x, u.y) !== 2) blind++;
        if (b && b.owner !== player && w.vision(player, b.ox + b.size / 2, b.oy + b.size / 2) === 0) blind++;
      }
      w.step(cmds);
      w.events = [];
    }
    expect(blind).toBe(0);
    expect(w.stats.totals[0].trained).toBeGreaterThan(w.stats.totals[1].trained); // hard builds up faster
    expect(w.stats.totals[1].trained).toBeGreaterThan(5); // easy still builds up
  });
});
