import { expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';
import { SkirmishAI } from '../src/ai/skirmishAI';

function run(seed: number, ticks: number): number[] {
  const w = new World({ seed, players: [{ name: 'A', faction: meadowfolk }, { name: 'B', faction: meadowfolk }] });
  const ais = [new SkirmishAI(0), new SkirmishAI(1)];
  const hashes: number[] = [];
  for (let t = 0; t < ticks; t++) {
    const cmds = ais.flatMap((ai) => ai.think(w).map((cmd) => ({ player: ai.player, cmd })));
    w.step(cmds);
    if (t % 200 === 0) hashes.push(w.hash());
  }
  return hashes;
}

test('two identical AI-vs-AI games stay in lockstep', () => {
  expect(run(1234, 6000)).toEqual(run(1234, 6000));
});

test('AI vs AI game makes progress (economy + fighting)', () => {
  const w = new World({ seed: 99, players: [{ name: 'A', faction: meadowfolk }, { name: 'B', faction: meadowfolk }] });
  const ais = [new SkirmishAI(0), new SkirmishAI(1)];
  let deaths = 0, trained = 0;
  for (let t = 0; t < 20 * 60 * 12 && w.winner < 0; t++) {
    w.step(ais.flatMap((ai) => ai.think(w).map((cmd) => ({ player: ai.player, cmd }))));
    for (const e of w.events) { if (e.type === 'death') deaths++; if (e.type === 'trained') trained++; }
    w.events = [];
  }
  console.log({ minutes: (w.tick / 20 / 60).toFixed(1), trained, deaths, winner: w.winner, players: w.players.map((p) => ({ stock: w.stockOf(p.id), units: w.unitsOf(p.id).length, buildings: w.buildingsOf(p.id).map((b) => b.specId + (b.complete ? '' : '(site)')), techs: p.researched })) });
  expect(trained).toBeGreaterThan(10);
  expect(deaths).toBeGreaterThan(0);
});
