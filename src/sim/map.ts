// Tile grid + deterministic, point-symmetric skirmish map generation.
import { Rng } from './rng';

export const TERRAIN_GRASS = 0;
export const TERRAIN_WATER = 1;
export const TERRAIN_SAND = 2;

export class Grid {
  readonly terrain: Uint8Array;
  /** Reference count of things blocking each tile (water counts as 1). */
  readonly blocked: Uint8Array;
  constructor(readonly width: number, readonly height: number) {
    this.terrain = new Uint8Array(width * height);
    this.blocked = new Uint8Array(width * height);
  }
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
  idx(x: number, y: number): number {
    return Math.floor(y) * this.width + Math.floor(x);
  }
  isBlocked(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return this.blocked[this.idx(x, y)] > 0;
  }
  block(x: number, y: number, delta: 1 | -1): void {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.blocked[i] = Math.max(0, this.blocked[i] + delta);
  }
  lineClear(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = bx - ax, dy = by - ay;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 3);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + dx * t, y = ay + dy * t;
      // check a small box so units don't clip corners
      if (this.isBlocked(x - 0.2, y - 0.2) || this.isBlocked(x + 0.2, y - 0.2) ||
          this.isBlocked(x - 0.2, y + 0.2) || this.isBlocked(x + 0.2, y + 0.2)) return false;
    }
    return true;
  }
  /** Nearest unblocked tile center to (x,y), searching outward in rings. */
  nearestOpen(x: number, y: number, maxR = 12): [number, number] | null {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (!this.isBlocked(cx, cy)) return [cx + 0.5, cy + 0.5];
    let best: [number, number] | null = null, bestD = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
        const tx = cx + ox, ty = cy + oy;
        if (this.isBlocked(tx, ty)) continue;
        const d = (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2;
        if (d < bestD) { bestD = d; best = [tx + 0.5, ty + 0.5]; }
      }
      if (best) return best;
    }
    return null;
  }
}

export interface MapFeature {
  kind: 'tree' | 'food' | 'crystal';
  x: number; // tile coords (integer)
  y: number;
  amount: number;
}

export interface GeneratedMap {
  grid: Grid;
  features: MapFeature[];
  starts: Array<[number, number]>; // town center tile origins (top-left of 3x3)
  seed: number;
}

export function generateMap(seed: number, size = 64): GeneratedMap {
  const rng = new Rng(seed);
  const grid = new Grid(size, size);
  const features: MapFeature[] = [];
  const taken = new Uint8Array(size * size);
  const mirror = (x: number, y: number): [number, number] => [size - 1 - x, size - 1 - y];
  const starts: Array<[number, number]> = [[8, 8], [size - 11, size - 11]];

  const reserved = (x: number, y: number) => {
    for (const [sx, sy] of starts) if (x >= sx - 3 && x <= sx + 5 && y >= sy - 3 && y <= sy + 5) return true;
    return false;
  };
  const free = (x: number, y: number) =>
    x > 0 && y > 0 && x < size - 1 && y < size - 1 && !taken[y * size + x] && !reserved(x, y);
  const take = (x: number, y: number) => { taken[y * size + x] = 1; };

  // Ponds: placed in the half-space x+y < size, mirrored.
  for (let p = 0; p < 3; p++) {
    const cx = rng.int(14, size - 14), cy = rng.int(4, size - 30);
    if (cx + cy >= size - 8) continue;
    const r = rng.range(2, 4.2);
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) + rng.range(-0.6, 0.6);
      if (!free(x, y)) continue;
      for (const [tx, ty] of [[x, y], mirror(x, y)]) {
        if (d < r) { grid.terrain[ty * size + tx] = TERRAIN_WATER; take(tx, ty); }
        else if (d < r + 1.2 && grid.terrain[ty * size + tx] === TERRAIN_GRASS) grid.terrain[ty * size + tx] = TERRAIN_SAND;
      }
    }
  }

  const place = (kind: MapFeature['kind'], x: number, y: number, amount: number) => {
    if (!free(x, y)) return;
    const [mx, my] = mirror(x, y);
    if (!free(mx, my)) return;
    take(x, y); take(mx, my);
    features.push({ kind, x, y, amount }, { kind, x: mx, y: my, amount });
  };
  const cluster = (kind: MapFeature['kind'], cx: number, cy: number, n: number, amount: number, spread: number) => {
    for (let i = 0; i < n * 3 && n > 0; i++) {
      const x = Math.round(cx + rng.range(-spread, spread)), y = Math.round(cy + rng.range(-spread, spread));
      if (free(x, y) && free(...mirror(x, y))) { place(kind, x, y, amount); n--; }
    }
  };

  const forest = (cx: number, cy: number, r: number) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) + rng.range(-0.8, 0.8);
      if (d < r && rng.next() < 0.88) place('tree', x, y, 0);
    }
  };

  // Home resources near each start (placed for player 0, mirrored for player 1).
  const [s0x, s0y] = starts[0];
  cluster('food', s0x + 8, s0y + 1, 6, 400, 1.6);
  cluster('crystal', s0x + 1, s0y + 8, 4, 200, 1.3);
  // Contested mid resources.
  cluster('crystal', size / 2 - 4, size / 2 - 5, 5, 400, 1.6);
  cluster('food', size / 2 + 6, size / 2 - 9, 6, 350, 2);
  for (let i = 0; i < 3; i++) cluster('food', rng.int(6, size - 6), rng.int(6, size / 2 - 4), 4, 300, 1.5);
  // Forests: dense woods that shape lanes (blob-filled, mirrored).
  for (let f = 0; f < 12; f++) {
    const cx = rng.int(3, size - 3), cy = rng.int(3, size - 3);
    if (cx + cy > size) continue;
    forest(cx, cy, rng.range(2, 4.5));
  }
  // Thick border woods
  for (let i = 1; i < size - 1; i++) {
    const depth = 2 + Math.floor(rng.next() * 2);
    for (let k = 1; k <= depth; k++) {
      place('tree', i, k, 0);
      place('tree', k, i, 0);
    }
  }

  for (let i = 0; i < size * size; i++) if (grid.terrain[i] === TERRAIN_WATER) grid.blocked[i] = 1;
  return { grid, features, starts, seed };
}
