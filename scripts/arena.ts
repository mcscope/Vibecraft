// Balance tool: equal food-budget fights (crystal free) between every pair of combat units of the playable factions.
// Run: npm run arena [budget=1200] [all]. Each cell: the share of its budget the winner keeps (+ = the row wins).
// To watch the fights, open the game with ?mode=arena (or Arena on the menu).
import { PLAYABLE } from '../src/factions';
import { arenaRoster, runFight } from '../src/sim/arena';
import { derive } from '../src/sim/physics';

const BUDGET = +(process.argv[2] ?? 1200);
const roster = arenaRoster(PLAYABLE, process.argv[3] === 'all');
const name = (e: (typeof roster)[number]) => (e.faction.id[0] + ':' + e.id).slice(0, 9);
const spec = (e: (typeof roster)[number]) => e.faction.units.find((u) => u.id === e.id)!;
// who's who: refinement, food each, and how many the budget buys
console.log(roster.map((e) => { const s = derive(spec(e)); return `${name(e).padEnd(10)} refinement ${(spec(e).refinement ?? 1).toFixed(1)}  ${String(s.foodCost).padStart(4)} food  x${Math.max(1, Math.round(BUDGET / s.foodCost))}`; }).join('\n'));
console.log('budget', BUDGET, '\n          ' + roster.map((e) => name(e).padStart(9)).join(''));
for (const a of roster) console.log(name(a).padEnd(10) + roster.map((b) => (a === b ? '·' : runFight(a, b, BUDGET).toFixed(2)).padStart(9)).join(''));
