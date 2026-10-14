import { describe, expect, test } from 'vitest';
import { PLAYABLE } from '../src/factions';
import { highlanders } from '../src/factions/highlanders';
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

  test('Highland Clans vs Meadowfolk: an AI game makes progress and stays deterministic', () => {
    const play = () => {
      const w = new World({ seed: 77, players: [{ name: 'Clans', faction: highlanders }, { name: 'Meadow', faction: meadowfolk }] });
      const ais = [new SkirmishAI(0), new SkirmishAI(1)];
      let trained = 0;
      const hashes: number[] = [];
      for (let t = 0; t < 20 * 60 * 6; t++) {
        w.step(ais.flatMap((ai) => ai.think(w).map((cmd) => ({ player: ai.player, cmd }))));
        for (const e of w.events) if (e.type === 'trained') trained++;
        w.events = [];
        if (t % 400 === 0) hashes.push(w.hash());
      }
      return { trained, hashes, clans: w.unitsOf(0).map((u) => u.specId), buildings: w.buildingsOf(0).map((b) => b.specId), wild: w.unitsOf(w.wildsId).map((u) => u.specId) };
    };
    const a = play(), b = play();
    expect(a.hashes).toEqual(b.hashes);
    expect(a.trained).toBeGreaterThan(10);
    expect(a.clans.filter((id) => id === 'crofter').length).toBeGreaterThan(6);
    expect(a.buildings).toContain('longhouse');
    expect(a.wild).toContain('elk');
    expect(a.wild).toContain('deer');
  });
});
