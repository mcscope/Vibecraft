import { describe, expect, test } from 'vitest';
import { fenfolk } from '../src/factions/fenfolk';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';
import { SkirmishAI } from '../src/ai/skirmishAI';

describe('match', () => {
  test('stats track a game, and resigning ends it for the other side', () => {
    const w = new World({ seed: 9, players: [{ name: 'Meadow', faction: meadowfolk }, { name: 'Fen', faction: fenfolk }] });
    const ais = [new SkirmishAI(0), new SkirmishAI(1)];
    for (let t = 0; t < 20 * 60 * 3; t++) w.step(ais.flatMap((ai) => ai.think(w).map((cmd) => ({ player: ai.player, cmd }))));
    const st = w.stats;
    for (const p of [0, 1]) {
      const g = st.totals[p].gathered;
      expect(g.food + g.wood + g.crystal, `player ${p} gathered`).toBeGreaterThan(100);
      expect(st.totals[p].trained).toBeGreaterThan(0);
    }
    expect(st.timeline.length).toBeGreaterThanOrEqual(18); // a sample every 10 s
    expect(st.timeline[st.timeline.length - 1].units[0]).toBe(w.unitsOf(0).length);
    // player 0 resigns
    w.step([{ player: 0, cmd: { type: 'resign' } }]);
    for (let i = 0; i < 20 && w.winner < 0; i++) w.step();
    expect(w.winner).toBe(1);
    expect(st.resigned).toBe(0);
  });
});
