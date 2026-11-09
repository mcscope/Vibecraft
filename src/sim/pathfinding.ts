// 8-directional A* over the tile grid. Deterministic: ties broken by insertion order.
import type { Grid } from './map';

const SQRT2 = Math.SQRT2;
const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number { return this.items.length; }
  push(item: number, p: number): void {
    const a = this.items, q = this.prio;
    a.push(item); q.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (q[parent] <= q[i]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      [q[parent], q[i]] = [q[i], q[parent]];
      i = parent;
    }
  }
  pop(): number {
    const a = this.items, q = this.prio;
    const top = a[0];
    const lastI = a.pop()!, lastP = q.pop()!;
    if (a.length > 0) {
      a[0] = lastI; q[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && q[l] < q[m]) m = l;
        if (r < a.length && q[r] < q[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [q[m], q[i]] = [q[i], q[m]];
        i = m;
      }
    }
    return top;
  }
}

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
}

/**
 * Returns tile-center waypoints from start (exclusive) to goal (inclusive), or null if there's nowhere to go. A goal
 * the walker can't get to (blocked, or on ground no ramp or gap joins to its own) is swapped for the tile nearest it
 * that it can, so it always heads as close as it can get.
 */
export function findPath(grid: Grid, sx: number, sy: number, gx: number, gy: number): Array<[number, number]> | null {
  const W = grid.width;
  if (!grid.inBounds(gx, gy) || !grid.inBounds(sx, sy)) return null;
  const to = grid.nearestIn(grid.regionNear(sx, sy), gx, gy);
  if (!to) return null;
  sx = Math.floor(sx); sy = Math.floor(sy); gx = Math.floor(to[0]); gy = Math.floor(to[1]);
  if (sx === gx && sy === gy) return [];
  const start = sy * W + sx;
  const goal = gy * W + gx;
  const N = W * grid.height;
  const g = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const open = new MinHeap();
  g[start] = 0;
  open.push(start, octile(sx, sy, gx, gy));
  while (open.size > 0) {
    const cur = open.pop();
    if (cur === goal) break;
    const cx = cur % W, cy = (cur / W) | 0;
    const cg = g[cur];
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= grid.height) continue;
      const n = ny * W + nx;
      if (grid.blocked[n]) continue;
      // no corner cutting
      if (dx !== 0 && dy !== 0 && (grid.blocked[cy * W + nx] || grid.blocked[ny * W + cx])) continue;
      const ng = cg + cost;
      if (g[n] <= ng) continue;
      g[n] = ng;
      came[n] = cur;
      open.push(n, ng + octile(nx, ny, gx, gy) * 1.001);
    }
  }
  if (came[goal] < 0) return null;
  const out: Array<[number, number]> = [];
  for (let c = goal; c !== start; c = came[c]) out.push([(c % W) + 0.5, ((c / W) | 0) + 0.5]);
  out.reverse();
  return smooth(grid, sx + 0.5, sy + 0.5, out);
}

/** Drop waypoints that have clear line of sight past them. */
function smooth(grid: Grid, sx: number, sy: number, pts: Array<[number, number]>): Array<[number, number]> {
  if (pts.length < 3) return pts;
  const out: Array<[number, number]> = [];
  let ax = sx, ay = sy;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !grid.lineClear(ax, ay, pts[j][0], pts[j][1])) j--;
    out.push(pts[j]);
    [ax, ay] = pts[j];
    i = j + 1;
  }
  return out;
}
