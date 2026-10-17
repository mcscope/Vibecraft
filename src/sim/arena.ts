// Arena: equal-budget fights between two kinds of combat unit. Shared by the balance
// script (scripts/arena.ts), the browser arena's background matrix and its live view.
import type { FactionSpec } from '../factions/types';
import { Grid } from './map';
import type { Scenario } from './scenarios';
import { TICK_RATE, World } from './world';

export const ARENA_SIZE = 56;
/** Where the two sides line up (tile x), on row ARENA_Y. */
export const ARENA_X: [number, number] = [22, 34];
export const ARENA_Y = 20;
/** A fight ends when a side is wiped out, or after this long. */
export const ARENA_SECONDS = 120;

/** An empty field, no wildlife, nobody wins or loses. `seats` start spots (unused: bases are cleared). */
export function arenaScenario(seats = 2): Scenario {
  return {
    id: 'arena',
    victory: false,
    wildlife: false,
    map: (seed) => ({
      grid: new Grid(ARENA_SIZE, ARENA_SIZE), features: [], seed,
      starts: Array.from({ length: seats }, (_, i) => [2 + (i % 2) * 48, 2 + Math.floor(i / 2) * 48] as [number, number]),
    }),
    setup() {},
  };
}

/** A unit on the arena's roster: its faction and spec id. */
export interface ArenaEntry { faction: FactionSpec; id: string }

/** Every combat unit of the given factions (workers, carts and bearers too if `all`). */
export function arenaRoster(factions: FactionSpec[], all = false): ArenaEntry[] {
  const out: ArenaEntry[] = [];
  for (const f of factions) for (const u of f.units) {
    if (!all && (u.id === f.workerId || u.id === f.carterId || u.role === 'carter' || !u.attack || u.bearer)) continue;
    out.push({ faction: f, id: u.id });
  }
  return out;
}

export const entryKey = (e: ArenaEntry) => `${e.faction.id}:${e.id}`;

/** One side of a fight in progress. */
export interface ArenaSide { owner: number; specId: string; n: number; ids: number[] }

/** What a unit costs against the arena budget: its food. Crystal (weapons, ammo) is free here. */
export const arenaCost = (w: World, owner: number, specId: string) => w.specOf(owner, specId)!.stats.foodCost;

/** Clear the field and line both sides up, each with `budget` worth of its unit, charging each other. */
export function stageFight(w: World, a: { owner: number; specId: string }, b: { owner: number; specId: string }, budget: number): [ArenaSide, ArenaSide] {
  for (const u of [...w.units.values()]) w.units.delete(u.id);
  for (const bd of [...w.buildings.values()]) w.buildings.delete(bd.id);
  w.projectiles.clear();
  const spawn = (side: { owner: number; specId: string }, x: number, dir: number): ArenaSide => {
    const n = Math.max(1, Math.round(budget / arenaCost(w, side.owner, side.specId)));
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const u = w.spawnAt(side.owner, side.specId, x + (i % 4) * 0.8 * dir, ARENA_Y + Math.floor(i / 4) * 0.9 - n / 8);
      if (u) { u.order = { kind: 'idle' }; ids.push(u.id); }
    }
    return { owner: side.owner, specId: side.specId, n, ids };
  };
  const A = spawn(a, ARENA_X[0], -1), B = spawn(b, ARENA_X[1], 1);
  w.enqueue({ player: A.owner, cmd: { type: 'attackMove', units: A.ids, x: ARENA_X[1], y: ARENA_Y } });
  w.enqueue({ player: B.owner, cmd: { type: 'attackMove', units: B.ids, x: ARENA_X[0], y: ARENA_Y } });
  return [A, B];
}

export const alive = (w: World, s: ArenaSide) => s.ids.filter((id) => w.units.has(id)).length;

/** Share of its starting strength (by health) a side still has, 0–1. */
export function strength(w: World, s: ArenaSide): number {
  return s.ids.reduce((t, id) => { const u = w.units.get(id); return t + (u ? u.hp / u.stats.maxHp : 0); }, 0) / s.n;
}

/** + when A comes out ahead: the share of its budget the winner keeps (−1…1). */
export const arenaScore = (w: World, A: ArenaSide, B: ArenaSide) => strength(w, A) - strength(w, B);

export const fightOver = (w: World, A: ArenaSide, B: ArenaSide, ticks: number) => !alive(w, A) || !alive(w, B) || ticks >= ARENA_SECONDS * TICK_RATE;

/** One fight to the end, headless, `a` on the left; the score (+ = a wins). */
function fightOnce(a: ArenaEntry, b: ArenaEntry, budget: number): number {
  const w = new World({ seed: 1, scenario: arenaScenario(2), players: [{ name: 'A', faction: a.faction }, { name: 'B', faction: b.faction }] });
  const [A, B] = stageFight(w, { owner: 0, specId: a.id }, { owner: 1, specId: b.id }, budget);
  for (let t = 0; !fightOver(w, A, B, t); t++) w.step();
  return arenaScore(w, A, B);
}

/** The fight run both ways round (each side once on the left) and averaged, so formation and side don't decide it. + = a wins. */
export function runFight(a: ArenaEntry, b: ArenaEntry, budget: number): number {
  return (fightOnce(a, b, budget) - fightOnce(b, a, budget)) / 2;
}
