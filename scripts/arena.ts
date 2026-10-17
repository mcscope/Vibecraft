// Balance tool: equal-budget fights between every pair of combat units of the playable factions.
// Run: npx vite-node scripts/arena.ts [budget=1200] [all]. Each cell: share of its budget the row keeps (+) or the column keeps (-).
// Equal-budget fights between every pair of combat units: the share of its budget the winner keeps (+ = row wins).
import { fenfolk } from '../src/factions/fenfolk';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';
import { Grid } from '../src/sim/map';
const arena = () => ({ id: 'arena', victory: false, wildlife: false, map: (seed: number) => ({ grid: new Grid(56, 56), features: [], starts: [[2, 2], [50, 50]] as Array<[number, number]>, seed }), setup() {} });
const BUDGET = +(process.argv[2] ?? 1200);
const roster = [...meadowfolk.units.map((u) => ['m', u.id]), ...fenfolk.units.map((u) => ['f', u.id])].filter(([, id]) => !['mule', 'pack-tortoise', 'villager', 'fenling'].includes(id) || process.argv[3] === 'all');
function fight(a: [string, string], b: [string, string]): number {
  const fa = a[0] === 'm' ? meadowfolk : fenfolk, fb = b[0] === 'm' ? meadowfolk : fenfolk;
  const w = new World({ seed: 1, scenario: arena() as any, players: [{ name: 'A', faction: fa }, { name: 'B', faction: fb }] });
  for (const u of [...w.units.values()]) w.units.delete(u.id);
  for (const bd of [...w.buildings.values()]) w.buildings.delete(bd.id);
  const cost = (p: number, id: string) => { const s = w.specOf(p, id)!.stats; return s.foodCost + s.crystalCost * 3; };
  const spawn = (p: number, id: string, x: number) => { const n = Math.max(1, Math.round(BUDGET / cost(p, id))); const ids: number[] = []; for (let i = 0; i < n; i++) { const u = w.spawnAt(p, id, x + (i % 4) * 0.8 * (p ? 1 : -1), 20 + Math.floor(i / 4) * 0.9 - n / 8); if (u) { u.order = { kind: 'idle' }; ids.push(u.id); } } return { n, ids }; };
  const A = spawn(0, a[1], 22), B = spawn(1, b[1], 34);
  w.enqueue({ player: 0, cmd: { type: 'attackMove', units: A.ids, x: 34, y: 20 } });
  w.enqueue({ player: 1, cmd: { type: 'attackMove', units: B.ids, x: 22, y: 20 } });
  for (let t = 0; t < 20 * 120; t++) { w.step(); const la = A.ids.filter((id) => w.units.has(id)).length, lb = B.ids.filter((id) => w.units.has(id)).length; if (!la || !lb) break; }
  const hp = (ids: number[]) => ids.reduce((s, id) => { const u = w.units.get(id); return s + (u ? u.hp / u.stats.maxHp : 0); }, 0);
  return hp(A.ids) / A.n - hp(B.ids) / B.n;
}
const names = roster.map(([f, id]) => (f + ':' + id).slice(0, 9));
console.log('budget', BUDGET, '\n          ' + names.map((n) => n.padStart(9)).join(''));
for (const a of roster) console.log((a[0] + ':' + a[1]).slice(0, 9).padEnd(10) + roster.map((b) => (a === b ? '·' : fight(a as any, b as any).toFixed(2)).padStart(9)).join(''));
