// Scenarios: a map, a starting setup, and optional scripted rules that run
// inside the deterministic tick (so they stay in sync in multiplayer too).
import { generateMap, Grid, TERRAIN_SAND, TERRAIN_WATER, type GeneratedMap, type MapFeature } from './map';
import { Rng } from './rng';
import { TICK_RATE, type World } from './world';

export interface Scenario {
  id: string;
  map(seed: number): GeneratedMap;
  setup(w: World, map: GeneratedMap): void;
  /** Runs at the end of every tick. */
  tick?(w: World): void;
  /** Whether players can be defeated / win. */
  victory: boolean;
  /** Players whose units/buildings are only targets (never auto-acquired while idle). */
  inertPlayers?: number[];
}

export function skirmish(): Scenario {
  return {
    id: 'skirmish',
    victory: true,
    map: (seed) => generateMap(seed, 64),
    setup(w, map) {
      w.players.forEach((p, i) => {
        const [ox, oy] = map.starts[i % map.starts.length];
        const f = w.factionOf(p.id);
        const tc = w.addBuilding(i, f.townCenterId ?? '', ox, oy);
        if (!tc) return;
        tc.stock = { food: 500, wood: 250, crystal: 120 };
        for (let n = 0; n < 5; n++) w.spawnUnit(i, f.workerId, tc);
      });
    },
  };
}

/**
 * Proving Grounds: player 0 gets a full army and deep stockpiles; player 1 is a
 * range of training dummies and a target fort that rebuild themselves.
 */
export function provingGrounds(): Scenario {
  const SIZE = 56;
  const slots: Array<{ specId: string; x: number; y: number; unit: number; diedAt: number }> = [];
  let fort = { ox: 44, oy: 25, id: 0, diedAt: -1 };

  return {
    id: 'proving-grounds',
    victory: false,
    inertPlayers: [1],
    map(seed) {
      const rng = new Rng(seed);
      const grid = new Grid(SIZE, SIZE);
      const features: MapFeature[] = [];
      const taken = new Set<number>();
      const put = (kind: MapFeature['kind'], x: number, y: number, amount = 0) => {
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || taken.has(y * SIZE + x)) return;
        if (grid.terrain[y * SIZE + x] === TERRAIN_WATER) return;
        taken.add(y * SIZE + x);
        features.push({ kind, x, y, amount });
      };
      const keepClear = (x: number, y: number) => x >= 1 && x <= 50 && y >= 12 && y <= 40;
      // pond in the south-west meadow
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const d = Math.hypot(x - 14, y - 44) + Math.sin(x * 1.7) * 0.5;
        if (d < 4.2) grid.terrain[y * SIZE + x] = TERRAIN_WATER;
        else if (d < 5.6) grid.terrain[y * SIZE + x] = TERRAIN_SAND;
      }
      // woods all around, thinning toward the middle
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const edge = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y);
        let p = edge < 3 ? 0.95 : edge < 5 ? 0.5 : 0;
        if (!keepClear(x, y)) {
          const grove = Math.min(Math.hypot(x - 20, y - 8), Math.hypot(x - 36, y - 6), Math.hypot(x - 40, y - 46), Math.hypot(x - 26, y - 48));
          if (grove < 4.5) p = Math.max(p, 0.85);
        }
        if (rng.next() < p && !(x < 11 && y > 13 && y < 38)) put('tree', x, y); // keep the base clear
      }
      // home resources by the player's town center at (6,24)
      for (const [x, y] of [[11, 33], [13, 34], [12, 36], [14, 37], [10, 35]]) put('food', x, y, 500);
      for (const [x, y] of [[12, 14], [14, 15], [11, 16], [15, 13]]) put('crystal', x, y, 600);
      for (let i = 0; i < SIZE * SIZE; i++) if (grid.terrain[i] === TERRAIN_WATER) grid.blocked[i] = 1;
      return { grid, features, starts: [[6, 24], [fort.ox, fort.oy]], seed };
    },
    setup(w) {
      const tc = w.addBuilding(0, 'town-center', 6, 24)!;
      tc.stock = { food: 6000, wood: 4000, crystal: 3000 }; // over the cache cap on purpose: a demo stockpile
      tc.rallyX = 13; tc.rallyY = 26;
      // a finished tech tree to play with (Great Hall's effective capital = 1,380)
      const add = (id: string, x: number, y: number, stock: Partial<Record<'food' | 'wood' | 'crystal', number>>) => {
        const b = w.addBuilding(0, id, x, y);
        if (b) Object.assign(b.stock, stock);
      };
      add('barracks', 6, 30, { food: 400, crystal: 40 });
      add('lynx-den', 6, 17, { food: 900, crystal: 20 });
      add('forge', 2, 28, { wood: 600 });
      add('great-hall', 1, 19, { food: 1500, crystal: 120 });
      add('watchtower', 20, 36, { food: 40, crystal: 60 });
      // the army, in ranks facing the range (heading 0 = +x)
      const ranks: Array<[string, number, number, number]> = [
        // spec, count, x, spacing
        ['hurlhorn', 2, 11, 3.2],
        ['slinger', 8, 14, 1.1],
        ['villager', 4, 12.5, 1.4],
        ['maceman', 6, 16, 1.4],
        ['lynx', 4, 18.5, 2.2],
      ];
      for (const [spec, n, x, gap] of ranks) {
        for (let i = 0; i < n; i++) w.spawnAt(0, spec, x, 26 + (i - (n - 1) / 2) * gap, 0);
      }
      // the range
      const row = (spec: string, x: number, ys: number[]) => {
        for (const y of ys) {
          const u = w.spawnAt(1, spec, x, y, 4)!;
          slots.push({ specId: spec, x, y, unit: u.id, diedAt: -1 });
        }
      };
      row('straw', 26, [20, 23, 26, 29, 32]);
      row('armored', 31, [21.5, 26, 30.5]);
      row('bales', 37, [22, 30]);
      fort.id = w.addBuilding(1, 'fort', fort.ox, fort.oy)!.id;
    },
    tick(w) {
      for (const s of slots) {
        if (s.diedAt < 0 && !w.units.has(s.unit)) s.diedAt = w.tick;
        if (s.diedAt >= 0 && w.tick - s.diedAt > 8 * TICK_RATE) {
          const u = w.spawnAt(1, s.specId, s.x, s.y, 4);
          if (u) { s.unit = u.id; s.diedAt = -1; }
        }
      }
      if (fort.diedAt < 0 && !w.buildings.has(fort.id)) fort.diedAt = w.tick;
      if (fort.diedAt >= 0 && w.tick - fort.diedAt > 15 * TICK_RATE) {
        let clear = true;
        for (const u of w.units.values()) if (u.x > fort.ox - 0.5 && u.x < fort.ox + 3.5 && u.y > fort.oy - 0.5 && u.y < fort.oy + 3.5) clear = false;
        const b = clear ? w.addBuilding(1, 'fort', fort.ox, fort.oy) : null;
        if (b) fort = { ...fort, id: b.id, diedAt: -1 };
      }
    },
  };
}

export const SCENARIOS = { skirmish, provingGrounds };
