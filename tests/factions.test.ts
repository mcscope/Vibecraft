import { describe, expect, test } from 'vitest';
import { PLAYABLE } from '../src/factions';
import { fenfolk } from '../src/factions/fenfolk';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';
import { SkirmishAI } from '../src/ai/skirmishAI';
import { validateFaction } from '../src/sim/physics';
import { checkSpec, specData } from '../src/net/bundle';

describe('playable factions', () => {
  test('every playable faction follows the rules and can travel as a bundle', () => {
    for (const f of PLAYABLE) {
      expect(validateFaction(f), f.id).toEqual([]);
      expect(checkSpec(specData(f)), f.id).toEqual([]);
    }
  });

  test('Fenfolk vs Meadowfolk: an AI game makes progress, its stats track it, and it stays deterministic', () => {
    const play = () => {
      const w = new World({ seed: 77, players: [{ name: 'Fen', faction: fenfolk }, { name: 'Meadow', faction: meadowfolk }] });
      const ais = [new SkirmishAI(0), new SkirmishAI(1)];
      let trained = 0;
      const hashes: number[] = [];
      for (let t = 0; t < 20 * 60 * 3; t++) {
        w.step(ais.flatMap((ai) => ai.think(w).map((cmd) => ({ player: ai.player, cmd }))));
        for (const e of w.events) if (e.type === 'trained') trained++;
        w.events = [];
        if (t % 400 === 0) hashes.push(w.hash());
      }
      return { w, trained, hashes };
    };
    const a = play(), b = play(), w = a.w;
    expect(a.hashes).toEqual(b.hashes);
    expect(a.trained).toBeGreaterThan(10);
    expect(w.unitsOf(0).filter((u) => u.specId === fenfolk.workerId).length).toBeGreaterThan(6);
    expect(w.buildingsOf(0).length).toBeGreaterThan(2);
    expect(w.unitsOf(w.wildsId).length).toBeGreaterThan(0);
    // the game's stats
    const st = w.stats;
    for (const p of [0, 1]) {
      const g = st.totals[p].gathered;
      expect(g.food + g.wood + g.crystal, `player ${p} gathered`).toBeGreaterThan(100);
      expect(st.totals[p].trained).toBeGreaterThan(0);
    }
    expect(st.timeline.length).toBeGreaterThanOrEqual(18); // a sample every 10 s
    expect(st.timeline[st.timeline.length - 1].units[0]).toBe(w.unitsOf(0).length);
  });
});
