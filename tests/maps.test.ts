import { describe, expect, test } from 'vitest';
import { MAPS, TERRAIN_CLIFF, TERRAIN_WATER } from '../src/sim/map';

describe('maps', () => {
  for (const info of MAPS) {
    test(`${info.name}: mirrored, the bases joined, and every resource within reach`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const m = info.generate(seed, 64), g = m.grid, N = g.width;
        // point-symmetric terrain and features
        for (let i = 0; i < N * N; i++) expect(g.terrain[i], `${info.id} seed ${seed}`).toBe(g.terrain[N * N - 1 - i]);
        for (let i = 0; i < N * N; i++) expect(g.rise[i], `${info.id} seed ${seed}`).toBe(g.rise[N * N - 1 - i]);
        // levels join only by ramps: walkable neighbours are at most a ramp's step apart
        const walkable = (i: number) => g.terrain[i] !== TERRAIN_WATER && g.terrain[i] !== TERRAIN_CLIFF;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const i = y * N + x, j = (y + dy) * N + x + dx;
          if (x + dx < N && y + dy < N && walkable(i) && walkable(j)) expect(Math.abs(g.rise[i] - g.rise[j]), `${info.id} seed ${seed}: step at ${x},${y}`).toBeLessThanOrEqual(0.5 + 1e-6);
        }
        // each base stands on open, level ground
        for (const [sx, sy] of m.starts) for (let y = sy - 2; y <= sy + 4; y++) for (let x = sx - 2; x <= sx + 4; x++) {
          expect(g.blocked[y * N + x], `${info.id} seed ${seed}: base clear at ${x},${y}`).toBe(0);
          expect(g.rise[y * N + x]).toBe(g.rise[(sy + 1) * N + sx + 1]);
        }
        const key = (f: { kind: string; x: number; y: number }) => `${f.kind}@${f.x},${f.y}`;
        const all = new Set(m.features.map(key));
        for (const f of m.features) expect(all.has(key({ kind: f.kind, x: N - 1 - f.x, y: N - 1 - f.y }))).toBe(true);
        // walk from one base; water and cliffs block, and resources too unless they'll be used up or chopped through
        const walk = (trees: boolean) => {
          const wall = new Uint8Array(N * N);
          for (let i = 0; i < N * N; i++) if (!walkable(i)) wall[i] = 1;
          if (trees) for (const f of m.features) wall[f.y * N + f.x] = 1;
          const seen = new Uint8Array(N * N), q: number[] = [];
          const [sx, sy] = m.starts[0];
          const from = (sy + 4) * N + sx + 4;
          expect(wall[from]).toBe(0);
          seen[from] = 1; q.push(from);
          for (let k = 0; k < q.length; k++) {
            const x = q[k] % N, y = Math.floor(q[k] / N);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = x + dx, ny = y + dy, j = ny * N + nx;
              if (nx < 0 || ny < 0 || nx >= N || ny >= N || wall[j] || seen[j]) continue;
              seen[j] = 1; q.push(j);
            }
          }
          return seen;
        };
        const [ex, ey] = m.starts[1];
        expect(walk(true)[(ey - 1) * N + ex + 1], `${info.id} seed ${seed}: an army can walk between the bases`).toBe(1);
        // every resource can be reached (chopping through woods if need be)
        const seen = walk(false);
        const reach = (f: { x: number; y: number }) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen[(f.y + dy) * N + f.x + dx]);
        const goods = m.features.filter((f) => f.kind !== 'tree');
        expect(goods.filter((f) => !reach(f)).map((f) => `${f.kind}@${f.x},${f.y}`), `${info.id} seed ${seed}`).toEqual([]);
        expect(goods.filter((f) => f.kind === 'crystal').length).toBeGreaterThan(8);
      }
    });
  }
});
