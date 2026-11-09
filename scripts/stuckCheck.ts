// Finds units that stand still for a long time while told to go somewhere (AI vs AI, headless).
// Run: npx vite-node scripts/stuckCheck.ts [minutes=12]
import { fenfolk } from '../src/factions/fenfolk';
import { meadowfolk } from '../src/factions/meadowfolk';
import { wildwelds } from '../src/factions/wildwelds';
import type { FactionSpec } from '../src/factions/types';
import { SkirmishAI } from '../src/ai/skirmishAI';
import { skirmish } from '../src/sim/scenarios';
import { TICK_RATE, World } from '../src/sim/world';

const MINUTES = +(process.argv[2] ?? 12);
const GAMES: Array<[string, FactionSpec, FactionSpec, number]> = [
  ['cliff-maze', meadowfolk, fenfolk, 100],
  ['cliff-maze', fenfolk, meadowfolk, 100],
  ['cliff-maze', wildwelds, meadowfolk, 100],
  ['sunken-temple', fenfolk, wildwelds, 107],
  ['sunken-temple', meadowfolk, wildwelds, 107],
  ['cliff-maze', wildwelds, fenfolk, 101],
];
const MOVING = new Set(['move', 'attackMove', 'attack', 'gather', 'graze', 'build', 'digest', 'resupply', 'garrison']);
let total = 0;
for (const [map, a, b, seed] of GAMES) {
  const w = new World({ seed, scenario: skirmish(map), players: [a, b].map((f, i) => ({ name: `${i}:${f.id}`, faction: f })) });
  const ais = [0, 1].map((p) => new SkirmishAI(p, 'hard'));
  const anchor = new Map<number, { x: number; y: number; t: number; reported: boolean }>();
  const found: string[] = [];
  for (let t = 0; t < TICK_RATE * 60 * MINUTES && w.winner < 0; t++) {
    w.step(ais.flatMap((ai) => ai.think(w).map((cmd) => ({ player: ai.player, cmd }))));
    w.events = [];
    if (t % TICK_RATE) continue;
    for (const u of w.units.values()) {
      if (u.wild || u.carter) continue;
      // (busy: eating, gathering, building, fighting — working where it stands, not stuck; worn out: resting)
      const moving = MOVING.has(u.order.kind) && !(u.order.kind === 'gather' && u.order.phase === 'harvest') && !u.busy && u.swing <= 0 && u.cooldown <= 0 && !u.exhausted;
      const an = anchor.get(u.id);
      if (!an || !moving || Math.hypot(u.x - an.x, u.y - an.y) > 1.5) { anchor.set(u.id, { x: u.x, y: u.y, t: w.tick, reported: false }); continue; }
      if (!an.reported && w.tick - an.t > TICK_RATE * 60) {
        an.reported = true;
        const o = u.order as { kind: string; phase?: string; target?: number };
        const tp = o.target ? w.entityPos(o.target) : null;
        const to = tp ? ` target ${Math.hypot(tp[0] - u.x, tp[1] - u.y).toFixed(1)} away` : '';
        found.push(`  ${(w.tick / TICK_RATE / 60).toFixed(1)}m p${u.owner} ${u.specId}#${u.id} at (${u.x.toFixed(1)}, ${u.y.toFixed(1)}) h${w.grid.heightAt(u.x, u.y).toFixed(1)} ${o.kind}${o.phase ? '/' + o.phase : ''}${to} blockedTile=${w.grid.isBlocked(u.x, u.y)} airborne=${u.airborne}`);
      }
    }
  }
  total += found.length;
  console.log(`${map} ${a.id} vs ${b.id} seed ${seed}: ${found.length} stuck (${(w.tick / TICK_RATE / 60).toFixed(1)} min${w.winner >= 0 ? ', won by ' + w.winner : ''})`);
  for (const f of found) console.log(f);
}
console.log(`total stuck: ${total}`);
