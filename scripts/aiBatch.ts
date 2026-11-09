// A headless batch of AI-vs-AI games, with an economy report per game and a summary.
// Every pairing of two different playable factions, both seats, on every skirmish map, a few seeds.
//   npm run aibatch [seeds=2] [minutes=20] [jobs=8] [maps=all|a,b] [pairs=all|fenfolk-meadowfolk,...]
// It runs `jobs` games at once (child processes) and prints one line per game, then the summary.
// A game is decided by the engine's own winner (its victory rule: sim/world.ts).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PLAYABLE } from '../src/factions';
import { SkirmishAI } from '../src/ai/skirmishAI';
import { MAPS } from '../src/sim/map';
import { skirmish } from '../src/sim/scenarios';
import { TICK_RATE, World, type Unit } from '../src/sim/world';
import type { ResourceKind } from '../src/factions/types';

const RES: ResourceKind[] = ['food', 'wood', 'crystal'];
interface Side {
  faction: string;
  peakArmy: number;
  peakEcon: number;
  /** Economic units at minutes 5, 10, 15. */
  econAt: number[];
  /** Average economic units standing idle (sampled every 5 s), and the share of econ-unit time spent idle. */
  idleAvg: number;
  idleShare: number;
  gathered: Record<ResourceKind, number>;
  /** On hand at the end (in buildings and packs): gathered but never used. */
  unused: Record<ResourceKind, number>;
  /** Gathered by minutes 5, 10, 15 (all resources). */
  gatheredAt: number[];
  /** Tower samples (one tower, every 5 s), how many had no shot of crystal, and their average crystal. */
  towerSamples: number;
  towerDry: number;
  towerCrystal: number;
  buildings: number;
  trained: number;
  lost: number;
}
interface Game { map: string; seed: number; factions: [string, string]; winner: number; minutes: number; firstFight: number; sides: Side[] }


const isEcon = (w: World, u: Unit) => !u.carter && !w.isBearer(u) && w.gathers(u) && (u.specId === w.factionOf(u.owner).workerId || !u.stats.canAttack || !!w.specOf(u.owner, u.specId)?.spec.tends);
const isArmy = (w: World, u: Unit) => !u.carter && u.stats.canAttack && !isEcon(w, u) && u.tame !== 'passive';
/** Standing about with nothing to do: idle, or a hauler with no load to fetch. */
const isIdle = (u: Unit) => u.order.kind === 'idle' || (u.order.kind === 'cart' && !u.carter && !u.order.from && u.order.phase === 'load' && u.x === u.px && u.y === u.py);

export function playGame(fa: string, fb: string, map: string, seed: number, minutes: number): Game {
  const fac = [fa, fb].map((id) => PLAYABLE.find((f) => f.id === id)!);
  const w = new World({ seed, scenario: skirmish(map), players: fac.map((f, i) => ({ name: `${i}:${f.id}`, faction: f })) });
  const ais = [0, 1].map((p) => new SkirmishAI(p, 'hard'));
  const sides: Side[] = [0, 1].map((p) => ({
    faction: fac[p].id, peakArmy: 0, peakEcon: 0, econAt: [], idleAvg: 0, idleShare: 0, gathered: { food: 0, wood: 0, crystal: 0 }, unused: { food: 0, wood: 0, crystal: 0 },
    gatheredAt: [], towerSamples: 0, towerDry: 0, towerCrystal: 0, buildings: 0, trained: 0, lost: 0,
  }));
  const idleSum = [0, 0], econSum = [0, 0];
  let samples = 0, winner = -1, firstFight = -1;
  const end = TICK_RATE * 60 * minutes, every = TICK_RATE * 5;
  for (let t = 0; t < end && winner < 0; t++) {
    w.step(ais.flatMap((ai) => ai.think(w).map((cmd) => ({ player: ai.player, cmd }))));
    if (firstFight < 0 && w.events.some((e) => e.type === 'death' && !w.players[e.owner]?.neutral && w.stats.totals[0].killed + w.stats.totals[1].killed > 0)) firstFight = w.tick / TICK_RATE / 60;
    w.events = [];
    if (w.winner >= 0) winner = w.winner;
    if (w.tick % every) continue;
    samples++;
    for (let p = 0; p < 2; p++) {
      const s = sides[p];
      const units = w.unitsOf(p);
      const econ = units.filter((u) => isEcon(w, u)), army = units.filter((u) => isArmy(w, u));
      s.peakArmy = Math.max(s.peakArmy, army.length);
      s.peakEcon = Math.max(s.peakEcon, econ.length);
      idleSum[p] += econ.filter(isIdle).length; econSum[p] += econ.length;
      for (const b of w.buildingsOf(p)) {
        if (!b.complete || !b.stats.tower || !b.spec.attack) continue;
        s.towerSamples++; s.towerCrystal += b.stock.crystal;
        if (b.stock.crystal < b.spec.attack.crystalMass) s.towerDry++;
      }
      if (w.tick % (TICK_RATE * 300) === 0) {
        s.econAt.push(econ.length);
        const g = w.stats.totals[p].gathered;
        s.gatheredAt.push(Math.round(g.food + g.wood + g.crystal));
      }
    }
  }
  for (let p = 0; p < 2; p++) {
    const s = sides[p];
    s.idleAvg = idleSum[p] / Math.max(1, samples);
    s.idleShare = idleSum[p] / Math.max(1, econSum[p]);
    s.towerCrystal = s.towerSamples ? s.towerCrystal / s.towerSamples : 0;
    for (const r of RES) s.gathered[r] = Math.round(w.stats.totals[p].gathered[r]);
    const st = w.stockOf(p);
    for (const r of RES) s.unused[r] = Math.round(st[r]);
    for (const u of w.unitsOf(p)) { s.unused.food += Math.round(u.food); s.unused.wood += Math.round(u.wood); }
    s.buildings = w.buildingsOf(p).length;
    s.trained = w.stats.totals[p].trained;
    s.lost = w.stats.totals[p].lost;
  }
  return { map, seed, factions: [fa, fb], winner, minutes: w.tick / TICK_RATE / 60, firstFight, sides };
}

function line(g: Game): string {
  const res = g.winner < 0 ? 'undecided' : `${g.factions[g.winner]} wins`;
  const side = (s: Side) => `${s.faction.slice(0, 4)} army≤${s.peakArmy} econ≤${s.peakEcon} (${s.econAt.join('/')}) idle ${(s.idleShare * 100).toFixed(0)}% got f${s.gathered.food}/w${s.gathered.wood}/c${s.gathered.crystal} left f${s.unused.food}/w${s.unused.wood}/c${s.unused.crystal}${s.towerSamples ? ` towers dry ${((s.towerDry / s.towerSamples) * 100).toFixed(0)}% avg ${s.towerCrystal.toFixed(0)}c` : ''} bld ${s.buildings} trained ${s.trained} lost ${s.lost}`;
  return `${g.map.padEnd(13)} ${String(g.seed).padEnd(5)} ${g.factions.join(' v ').padEnd(22)} ${res.padEnd(16)} ${g.minutes.toFixed(1).padStart(4)}m fight@${g.firstFight < 0 ? '-' : g.firstFight.toFixed(1)}  | ${side(g.sides[0])} | ${side(g.sides[1])}`;
}

function summary(games: Game[]): void {
  const pct = (a: number, b: number) => `${b ? Math.round((a / b) * 100) : 0}%`;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const decided = games.filter((g) => g.winner >= 0);
  console.log(`\n== ${games.length} games: ${decided.length} decided (${pct(decided.length, games.length)}), decided in ${avg(decided.map((g) => g.minutes)).toFixed(1)} min on average; first fight at ${avg(games.filter((g) => g.firstFight >= 0).map((g) => g.firstFight)).toFixed(1)} min; ${games.filter((g) => g.firstFight < 0).length} with no fight`);
  const pairs = new Map<string, Game[]>();
  for (const g of games) { const k = [...g.factions].sort().join(' v '); pairs.set(k, [...(pairs.get(k) ?? []), g]); }
  console.log('\npairing                    games decided  wins (each)                   avg min');
  for (const [k, gs] of pairs) {
    const wins = new Map<string, number>();
    for (const g of gs) if (g.winner >= 0) wins.set(g.factions[g.winner], (wins.get(g.factions[g.winner]) ?? 0) + 1);
    const names = k.split(' v ');
    console.log(`${k.padEnd(26)} ${String(gs.length).padEnd(5)} ${String(gs.filter((g) => g.winner >= 0).length).padEnd(8)} ${names.map((n) => `${n} ${wins.get(n) ?? 0}`).join(', ').padEnd(30)} ${avg(gs.filter((g) => g.winner >= 0).map((g) => g.minutes)).toFixed(1)}`);
  }
  console.log('\nfaction       games peakArmy peakEcon econ@5/10/15     idle%  gathered f/w/c          unused f/w/c        towers dry% avgC');
  for (const f of PLAYABLE.map((x) => x.id)) {
    const ss = games.flatMap((g) => g.sides.filter((s) => s.faction === f));
    if (!ss.length) continue;
    const at = (i: number) => avg(ss.filter((s) => s.econAt.length > i).map((s) => s.econAt[i])).toFixed(1);
    const r = (k: 'gathered' | 'unused') => RES.map((x) => avg(ss.map((s) => s[k][x])).toFixed(0)).join('/');
    const tS = ss.reduce((n, s) => n + s.towerSamples, 0), tD = ss.reduce((n, s) => n + s.towerDry, 0), tC = ss.reduce((n, s) => n + s.towerCrystal * s.towerSamples, 0);
    console.log(`${f.padEnd(13)} ${String(ss.length).padEnd(5)} ${avg(ss.map((s) => s.peakArmy)).toFixed(1).padEnd(8)} ${avg(ss.map((s) => s.peakEcon)).toFixed(1).padEnd(8)} ${`${at(0)}/${at(1)}/${at(2)}`.padEnd(16)} ${(avg(ss.map((s) => s.idleShare)) * 100).toFixed(0).padEnd(6)} ${r('gathered').padEnd(23)} ${r('unused').padEnd(19)} ${tS ? `${pct(tD, tS)} ${(tC / tS).toFixed(0)}` : '-'}`);
  }
}

// ── driver
const self = fileURLToPath(import.meta.url);
const arg = (i: number, d: string) => process.argv[i] ?? d;
if (process.argv[2] === '--one') {
  const [fa, fb, map, seed, minutes] = process.argv.slice(3);
  console.log(JSON.stringify(playGame(fa, fb, map, +seed, +minutes)));
} else {
  const SEEDS = +arg(2, '2'), MINUTES = +arg(3, '20'), JOBS = +arg(4, '8');
  const maps = arg(5, 'all') === 'all' ? MAPS.map((m) => m.id) : arg(5, '').split(',');
  const pairFilter = arg(6, 'all');
  const jobs: string[][] = [];
  const ids = PLAYABLE.map((f) => f.id);
  for (const a of ids) for (const b of ids) {
    if (a === b) continue;
    if (pairFilter !== 'all' && !pairFilter.split(',').some((p) => p.split('-').sort().join() === [a, b].sort().join())) continue;
    for (const map of maps) for (let s = 0; s < SEEDS; s++) jobs.push([a, b, map, String(1000 + s * 17), String(MINUTES)]);
  }
  const games: Game[] = [];
  let next = 0;
  const run = (): Promise<void> => {
    if (next >= jobs.length) return Promise.resolve();
    const job = jobs[next++];
    return new Promise<void>((done) => {
      const child = spawn('npx', ['vite-node', self, '--one', ...job], { stdio: ['ignore', 'pipe', 'inherit'] });
      let buf = '';
      child.stdout.on('data', (d) => (buf += d));
      child.on('close', () => {
        const json = buf.split('\n').find((l) => l.startsWith('{'));
        if (json) { const g = JSON.parse(json) as Game; games.push(g); console.log(line(g)); } else console.log(`FAILED ${job.join(' ')}`);
        done();
      });
    }).then(run);
  };
  const t0 = Date.now();
  await Promise.all(Array.from({ length: JOBS }, run));
  games.sort((a, b) => a.factions.join().localeCompare(b.factions.join()) || a.map.localeCompare(b.map) || a.seed - b.seed);
  summary(games);
  console.log(`\n(${((Date.now() - t0) / 60000).toFixed(1)} min wall clock)`);
}
