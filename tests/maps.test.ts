import { describe, expect, test } from 'vitest';
import { MAPS, TERRAIN_ROCK, TERRAIN_WATER } from '../src/sim/map';

describe('maps', () => {
  for (const info of MAPS) {
    test(`${info.name}: mirrored, the bases joined, and every resource within reach`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const m = info.generate(seed, 64), g = m.grid, N = g.width;
        // point-symmetric terrain and features
        for (let i = 0; i < N * N; i++) expect(g.terrain[i], `${info.id} seed ${seed}`).toBe(g.terrain[N * N - 1 - i]);
        const key = (f: { kind: string; x: number; y: number }) => `${f.kind}@${f.x},${f.y}`;
        const all = new Set(m.features.map(key));
        for (const f of m.features) expect(all.has(key({ kind: f.kind, x: N - 1 - f.x, y: N - 1 - f.y }))).toBe(true);
        // walk from one base; water and rock block, and resources too unless they'll be used up or chopped through
        const walk = (trees: boolean) => {
          const wall = new Uint8Array(N * N);
          for (let i = 0; i < N * N; i++) if (g.terrain[i] === TERRAIN_WATER || g.terrain[i] === TERRAIN_ROCK) wall[i] = 1;
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
