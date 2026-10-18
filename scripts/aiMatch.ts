// AI vs AI on the default map: hard against easy, both factions, both seats, a few seeds.
// Run: npm run aimatch [seeds=3] [minutes=30] [map=woodlands] [a=hard] [b=easy]
import { PLAYABLE } from '../src/factions';
import { SkirmishAI, type Difficulty } from '../src/ai/skirmishAI';
import { skirmish } from '../src/sim/scenarios';
import { TICK_RATE, World } from '../src/sim/world';

const SEEDS = +(process.argv[2] ?? 3);
const MINUTES = +(process.argv[3] ?? 30);
const MAP = process.argv[4] ?? 'woodlands';
const A = (process.argv[5] ?? 'hard') as Difficulty, B = (process.argv[6] ?? 'easy') as Difficulty;

let wins = 0, losses = 0, draws = 0;
const lengths: number[] = [];
for (const fa of PLAYABLE) for (const fb of PLAYABLE) for (let s = 0; s < SEEDS; s++) for (const aSeat of [0, 1]) {
  const seed = 1000 + s * 17;
  const fac = aSeat === 0 ? [fa, fb] : [fb, fa];
  const w = new World({ seed, scenario: skirmish(MAP), players: fac.map((f, i) => ({ name: `${i === aSeat ? A : B}:${f.id}`, faction: f })) });
  const ais = [0, 1].map((p) => new SkirmishAI(p, p === aSeat ? A : B));
  const t0 = Date.now();
  for (let t = 0; t < TICK_RATE * 60 * MINUTES && w.winner < 0; t++) {
    w.step(ais.flatMap((ai) => ai.think(w).map((cmd) => ({ player: ai.player, cmd }))));
    w.events = [];
  }
  const min = w.tick / TICK_RATE / 60;
  const res = w.winner < 0 ? 'draw' : w.winner === aSeat ? A : B;
  if (w.winner < 0) draws++; else if (w.winner === aSeat) { wins++; lengths.push(min); } else { losses++; lengths.push(min); }
  const st = w.stats.totals;
  const summary = [0, 1].map((p) => `${w.players[p].name} trained ${st[p].trained} units ${w.unitsOf(p).length} bld ${w.buildingsOf(p).length}`).join(' | ');
  console.log(`${fa.id}(${A}) vs ${fb.id}(${B}) seed ${seed} ${A} in seat ${aSeat}: ${res} at ${min.toFixed(1)} min  [${summary}]  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
const avg = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
console.log(`\n${A} vs ${B}: ${wins} wins, ${losses} losses, ${draws} draws (unfinished after ${MINUTES} min); decided games average ${avg.toFixed(1)} min`);
