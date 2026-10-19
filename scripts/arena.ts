// Balance tool: equal food-budget fights (crystal free) between every pair of combat units of the playable factions.
// Run: npm run arena [budget=1200] [all] [flat]. Each cell: the share of its budget the winner keeps (+ = the row
// wins); the last column is the row's average. `all` adds workers' carts and bearers; `flat` sets every unit to
// refinement 1, to compare bodies alone (refinement only makes units cheaper, so it decides how many a budget buys).
// To watch the fights, open the game with ?mode=arena (or Arena on the menu).
import { PLAYABLE } from '../src/factions';
import type { FactionSpec } from '../src/factions/types';
import { arenaRoster, runFight } from '../src/sim/arena';
import { derive } from '../src/sim/physics';

const args = process.argv.slice(2);
const BUDGET = +(args.find((a) => /^\d+$/.test(a)) ?? 1200);
const flat = args.includes('flat');
const factions: FactionSpec[] = flat ? PLAYABLE.map((f) => ({ ...f, units: f.units.map((u) => ({ ...u, refinement: 1 })) })) : PLAYABLE;
const roster = arenaRoster(factions, args.includes('all'));
const name = (e: (typeof roster)[number]) => (e.faction.id[0] + ':' + e.id).slice(0, 9);
const spec = (e: (typeof roster)[number]) => e.faction.units.find((u) => u.id === e.id)!;
// who's who: refinement, food each, and how many the budget buys
console.log(roster.map((e) => { const s = derive(spec(e)); return `${name(e).padEnd(10)} refinement ${(spec(e).refinement ?? 1).toFixed(1)}  ${String(s.foodCost).padStart(4)} food  x${Math.max(1, Math.round(BUDGET / s.foodCost))}`; }).join('\n'));
console.log(`budget ${BUDGET}${flat ? ' · every unit at refinement 1' : ''}\n          ` + roster.map((e) => name(e).padStart(9)).join('') + '      avg');
for (const a of roster) {
  const scores = roster.map((b) => (a === b ? NaN : runFight(a, b, BUDGET)));
  const real = scores.filter((x) => !Number.isNaN(x));
  console.log(name(a).padEnd(10) + scores.map((x) => (Number.isNaN(x) ? '·' : x.toFixed(2)).padStart(9)).join('') + (real.reduce((t, x) => t + x, 0) / real.length).toFixed(2).padStart(9));
}
