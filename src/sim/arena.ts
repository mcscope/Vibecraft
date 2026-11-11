// Arena: equal-budget fights between two kinds of combat unit. Shared by the balance
// script (scripts/arena.ts), the browser arena's background matrix and its live view.
import type { FactionSpec } from '../factions/types';
import { Grid, MapBuilder } from './map';
import type { Scenario } from './scenarios';
import { TICK_RATE, World } from './world';

export const ARENA_SIZE = 56;
/** Where the two sides line up (tile x), on row ARENA_Y. */
export const ARENA_X: [number, number] = [22, 34];
export const ARENA_Y = 20;
/** A fight ends when a side is wiped out, or after this long. */
export const ARENA_SECONDS = 120;

/**
 * The arena's ground: flat; a valley (each side starts on its own high plateau, a low valley between, ramps down into
 * it); a ridge (both sides start low and fight up and over a high ridge between them, through ramps); or a cliff (the
 * left side holds high ground, the right stands below it, a sheer cliff between the two lines, a ramp round it
 * to one side of the fight).
 */
export const ARENA_TERRAINS = ['flat', 'valley', 'ridge', 'cliff'] as const;
/** The cliff arena: the high ground ends after this tile column; its ramp lies this far (rows) to the side of the fight. */
const CLIFF_X = 27, CLIFF_RAMP = 8;
export type ArenaTerrain = (typeof ARENA_TERRAINS)[number];

/** The arena's ground for a terrain (levels in stripes across the field, the same either side of the middle). */
function arenaGrid(terrain: ArenaTerrain, seed: number): Grid {
  if (terrain === 'flat') return new Grid(ARENA_SIZE, ARENA_SIZE);
  const m = new MapBuilder(seed, ARENA_SIZE), mid = [25, 30]; // the middle strip, between the two lines (x 22 and 34)
  if (terrain === 'cliff') {
    // (one side high: set straight on the grid, since MapBuilder.raise mirrors every tile across the middle)
    for (let y = 0; y < ARENA_SIZE; y++) for (let x = 0; x <= CLIFF_X; x++) m.grid.level[y * ARENA_SIZE + x] = 1;
    // a ramp four wide to one side of the fight (a walk round, out of line); MapBuilder mirrors it far down the field
    for (let y = ARENA_Y - CLIFF_RAMP - 4; y < ARENA_Y - CLIFF_RAMP; y++) for (let x = CLIFF_X - 1; x <= CLIFF_X + 2; x++) m.ramp(x, y);
    return m.done().grid;
  }
  for (let y = 0; y < ARENA_SIZE; y++) for (let x = 0; x < ARENA_SIZE; x++) {
    const inMid = x >= mid[0] && x <= mid[1];
    m.raise(x, y, terrain === 'valley' ? (inMid ? 0 : 1) : inMid ? 1 : 0);
  }
  // ramps across each edge of the middle strip: a wide one in line with the fight, and narrow ones further out
  for (const [y0, y1] of [[ARENA_Y - 3, ARENA_Y + 3], [6, 8], [44, 46]]) for (let y = y0; y <= y1; y++) for (const x of [mid[0] - 1, mid[0], mid[0] + 1, mid[1] - 1, mid[1], mid[1] + 1]) m.ramp(x, y);
  return m.done().grid;
}

/** An empty field, no wildlife, nobody wins or loses. `seats` start spots (unused: bases are cleared). */
export function arenaScenario(seats = 2, terrain: ArenaTerrain = 'flat'): Scenario {
  return {
    id: 'arena',
    victory: false,
    wildlife: false,
    map: (seed) => ({
      grid: arenaGrid(terrain, seed), features: [], seed,
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
    if (!all && (u.id === f.carterId || u.role === 'carter' || !u.attack || u.bearer)) continue; // anything that fights, workers too
    out.push({ faction: f, id: u.id });
  }
  return out;
}

export const entryKey = (e: ArenaEntry) => `${e.faction.id}:${e.id}`;

/** One side of a fight in progress. */
export interface ArenaSide { owner: number; specId: string; n: number; ids: number[] }

/** What a unit costs against the arena budget: its food. Crystal (weapons, ammo) is free here. */
// (every unit at its own refinement-1 price, its design's refinement undone; refinement researched on top, set with
// setRefinement, still counts: cheaper, or for a unit whose research grows it, bigger at the price)
export const arenaCost = (w: World, owner: number, specId: string) => { const s = w.specOf(owner, specId)!; return Math.round(s.stats.foodCost * (s.spec.refinement ?? 1)); };

/** As if `extra` refinement had been researched for a unit type on a side: grown, if its faction's research grows it, else cheaper. */
export function setRefinement(w: World, owner: number, specId: string, extra: number): void {
  const p = w.players[owner], grows = (w.factionOf(owner).techs ?? []).some((t) => t.unit === specId && t.grows);
  p.refine[specId] = extra;
  p.refineGrow[specId] = grows ? extra : 0;
  w.refreshStats(owner, specId);
}

/** Clear the field and line both sides up, each with `budget` worth of its unit, charging each other. */
export function stageFight(w: World, a: { owner: number; specId: string }, b: { owner: number; specId: string }, budget: number): [ArenaSide, ArenaSide] {
  for (const u of [...w.units.values()]) w.units.delete(u.id);
  for (const bd of [...w.buildings.values()]) w.buildings.delete(bd.id);
  w.projectiles.clear();
  const spawn = (side: { owner: number; specId: string }, x: number, dir: number): ArenaSide => {
    const n = Math.max(1, Math.round(budget / arenaCost(w, side.owner, side.specId)));
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const u = w.spawnAt(side.owner, side.specId, x + Math.floor(i / 4) * 0.9 * dir, ARENA_Y + (i % 4) * 0.8 - 1.2); // (rows of four across, one behind another)
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
function fightOnce(a: ArenaEntry, b: ArenaEntry, budget: number, terrain: ArenaTerrain): number {
  const w = new World({ seed: 1, scenario: arenaScenario(2, terrain), players: [{ name: 'A', faction: a.faction }, { name: 'B', faction: b.faction }] });
  const [A, B] = stageFight(w, { owner: 0, specId: a.id }, { owner: 1, specId: b.id }, budget);
  for (let t = 0; !fightOver(w, A, B, t); t++) w.step();
  return arenaScore(w, A, B);
}

/** The fight run both ways round (each side once on the left) and averaged, so formation and side don't decide it. + = a wins. */
export function runFight(a: ArenaEntry, b: ArenaEntry, budget: number, terrain: ArenaTerrain = 'flat'): number {
  if (terrain === 'cliff') return fightOnce(a, b, budget, terrain); // (the sides differ: `a` holds the high ground)
  return (fightOnce(a, b, budget, terrain) - fightOnce(b, a, budget, terrain)) / 2;
}
