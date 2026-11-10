// Prints each pre-baked army's sprite pixels against the budget (scripts/spriteBudget.mjs), unit by unit, from the
// pre-baked art (npm run build or npm run prebake first). Exits 1 if anything is over.
// Usage: node scripts/sprites.mjs [dir=dist/baked]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatReport, SPRITE_BUDGET, spriteReport } from './spriteBudget.mjs';

const dir = process.argv[2] ?? 'dist/baked';
if (!existsSync(dir)) { console.log(`no pre-baked art in ${dir}: run npm run prebake (or npm run build) first`); process.exit(1); }
// an army in each team's colours: the first colours in full, the others' totals (they differ only by a pixel here and there)
const byArmy = new Map();
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('biome.')).sort()) {
  const army = f.split('.')[0];
  byArmy.set(army, [...(byArmy.get(army) ?? []), f]);
}
let over = false;
console.log(`Sprite budget: ${SPRITE_BUDGET.army / 1e6}M pixels an army, ${SPRITE_BUDGET.unit / 1e6}M a unit or building (one team's colours)\n`);
for (const [army, files] of byArmy) {
  const reports = files.map((f) => spriteReport(JSON.parse(readFileSync(join(dir, f), 'utf8')).art));
  console.log(formatReport(army, reports[0]));
  if (reports.length > 1) console.log(`  (other colours: ${reports.slice(1).map((r) => `${(r.total / 1e6).toFixed(1)}M`).join(', ')})`);
  console.log('');
  over ||= reports.some((r) => r.armyOver || r.over.length > 0);
}
process.exit(over ? 1 : 0);
