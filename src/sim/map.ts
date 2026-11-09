// Tile grid + deterministic, point-symmetric skirmish maps (two starts, mirrored
// through the centre so neither side has the better half).
import { Rng } from './rng';

export const TERRAIN_GRASS = 0;
export const TERRAIN_WATER = 1;
export const TERRAIN_SAND = 2;
/**
 * Cliff: the rocky edge where the ground drops a level. MapBuilder works it out from the levels: a tile above a
 * neighbour (ramps aside) is cliff. It blocks the way like water.
 */
export const TERRAIN_CLIFF = 3;

/** Metres the ground rises per level. The sim, the renderer and the baked cliff art all use it. */
export const LEVEL_M = 2.5;
/** Two walkable tiles side by side differ by at most this many levels (a ramp's steps); more is a cliff. */
const STEP = 0.5 + 1e-6;

export class Grid {
  readonly terrain: Uint8Array;
  /** Reference count of things blocking each tile (water counts as 1). */
  readonly blocked: Uint8Array;
  /** Each tile's ground level: 0 low ground, 1 high ground, 2 higher. */
  readonly level: Uint8Array;
  /** Ground height at each tile's centre, in levels: its level, or part way between two on a ramp. */
  readonly rise: Float32Array;
  constructor(readonly width: number, readonly height: number) {
    this.terrain = new Uint8Array(width * height);
    this.blocked = new Uint8Array(width * height);
    this.level = new Uint8Array(width * height);
    this.rise = new Float32Array(width * height);
  }
  /**
   * Ground height at (x, y), in metres: the one source for the sim, the renderer and mouse picking. Flat on each
   * tile, smooth across ramps: blended with the tile centres nearby, but only those within a step of this tile's own
   * height (a cliff's foot or top stays where it is).
   */
  heightAt(x: number, y: number): number {
    const W = this.width, H = this.height;
    x = Math.min(W - 1e-3, Math.max(0, x)); y = Math.min(H - 1e-3, Math.max(0, y));
    const own = this.rise[Math.floor(y) * W + Math.floor(x)];
    const fx = x - 0.5, fy = y - 0.5, ax = Math.floor(fx), ay = Math.floor(fy), u = fx - ax, v = fy - ay;
    const at = (tx: number, ty: number): number => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return own;
      const i = ty * W + tx, h = this.rise[i];
      return this.terrain[i] === TERRAIN_CLIFF || Math.abs(h - own) > STEP ? own : h;
    };
    const top = at(ax, ay) + (at(ax + 1, ay) - at(ax, ay)) * u, bottom = at(ax, ay + 1) + (at(ax + 1, ay + 1) - at(ax, ay + 1)) * u;
    return (top + (bottom - top) * v) * LEVEL_M;
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
    const was = this.blocked[i] > 0;
    this.blocked[i] = Math.max(0, this.blocked[i] + delta);
    if (was !== this.blocked[i] > 0) this.regions = null;
  }
  /** Each open tile's region (tiles a walker can get between share one), -1 if blocked. Worked out again after blocking changes. */
  private regions: Int32Array | null = null;
  /** The region of the open tile at (x, y), or -1 if it's blocked. */
  region(x: number, y: number): number {
    if (!this.inBounds(x, y)) return -1;
    if (!this.regions) this.regions = this.floodRegions();
    return this.regions[this.idx(x, y)];
  }
  /** Flood fill the open ground, 4-way (paths cut no corners, so that's the same as 8-way with no corner cutting). */
  private floodRegions(): Int32Array {
    const W = this.width, N = W * this.height, out = new Int32Array(N).fill(-1), q = new Int32Array(N);
    let next = 0;
    for (let s = 0; s < N; s++) {
      if (out[s] >= 0 || this.blocked[s]) continue;
      let head = 0, tail = 0;
      out[s] = next; q[tail++] = s;
      while (head < tail) {
        const i = q[head++], x = i % W;
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
          if (j < 0 || j >= N || out[j] >= 0 || this.blocked[j]) continue;
          out[j] = next; q[tail++] = j;
        }
      }
      next++;
    }
    return out;
  }
  /** The region a walker at (x, y) is in: its tile's, or (on a blocked tile) the nearest open tile's. */
  regionNear(x: number, y: number): number {
    const r = this.region(x, y);
    if (r >= 0) return r;
    const p = this.nearestOpen(x, y, 3);
    return p ? this.region(p[0], p[1]) : -1;
  }
  /** Can a walker in region `r` get to (x, y), or right beside it (a tree, a rock, a building's tile)? */
  reaches(r: number, x: number, y: number): boolean {
    const cx = Math.floor(x), cy = Math.floor(y);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.region(cx + dx, cy + dy) === r) return true;
    return false;
  }
  /** Can a walker in region `r` get right up to the w×h block of tiles at (ox, oy)? */
  reachesRect(r: number, ox: number, oy: number, w: number, h: number): boolean {
    for (let y = oy - 1; y <= oy + h; y++) for (let x = ox - 1; x <= ox + w; x++) {
      if (x >= ox && x < ox + w && y >= oy && y < oy + h) continue;
      if (this.region(x, y) === r) return true;
    }
    return false;
  }
  /** The centre of the tile in region `r` nearest to (x, y) (the tile itself if it's in `r`), or null if `r` has none. */
  nearestIn(r: number, x: number, y: number): [number, number] | null {
    if (this.region(x, y) === r) return [Math.floor(x) + 0.5, Math.floor(y) + 0.5];
    const W = this.width;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < W * this.height; i++) {
      if (this.regions![i] !== r) continue;
      const d = ((i % W) + 0.5 - x) ** 2 + (Math.floor(i / W) + 0.5 - y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best < 0 ? null : [(best % W) + 0.5, Math.floor(best / W) + 0.5];
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
  /** Nearest unblocked tile center to (x,y), searching outward in rings. `level`: only tiles on that ground level. */
  nearestOpen(x: number, y: number, maxR = 12, level = -1): [number, number] | null {
    const cx = Math.floor(x), cy = Math.floor(y);
    const open = (tx: number, ty: number) => !this.isBlocked(tx, ty) && (level < 0 || this.level[ty * this.width + tx] === level);
    if (open(cx, cy)) return [cx + 0.5, cy + 0.5];
    let best: [number, number] | null = null, bestD = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
        const tx = cx + ox, ty = cy + oy;
        if (!open(tx, ty)) continue;
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

/** Trees keep this far (tiles) from food and crystal, so nothing overlaps. */
const TREE_GAP = 1.5;
/** ...and this far beyond a base's clear area. */
const TREE_BASE_PAD = 3;

/** Shared tools for drawing a point-symmetric map: everything placed is mirrored through the centre. */
export class MapBuilder {
  readonly rng: Rng;
  readonly grid: Grid;
  readonly features: MapFeature[] = [];
  readonly starts: Array<[number, number]>;
  private readonly taken: Uint8Array;
  constructor(readonly seed: number, readonly size: number, start: [number, number] = [8, 8]) {
    this.rng = new Rng(seed);
    this.grid = new Grid(size, size);
    this.taken = new Uint8Array(size * size);
    this.ramps = new Uint8Array(size * size);
    this.starts = [start, [size - 3 - start[0], size - 3 - start[1]]];
  }
  mirror(x: number, y: number): [number, number] { return [this.size - 1 - x, this.size - 1 - y]; }
  /** Inside a start's base area (kept clear for the town center and its first buildings). */
  reserved(x: number, y: number, pad = 0): boolean {
    for (const [sx, sy] of this.starts) if (x >= sx - 3 - pad && x <= sx + 5 + pad && y >= sy - 3 - pad && y <= sy + 5 + pad) return true;
    return false;
  }
  free(x: number, y: number): boolean {
    const n = this.size;
    return x > 0 && y > 0 && x < n - 1 && y < n - 1 && !this.taken[y * n + x] && !this.reserved(x, y) && !this.cliff(x, y) && !this.byRamp(x, y);
  }
  /** Set a tile's terrain (and its mirror). Water blocks; base areas stay clear. */
  terrain(x: number, y: number, t: number, pad = 0): void {
    if (!this.grid.inBounds(x, y) || this.reserved(x, y, pad)) return;
    for (const [tx, ty] of [[x, y], this.mirror(x, y)]) {
      const i = ty * this.size + tx;
      if (t === TERRAIN_SAND && this.grid.terrain[i] !== TERRAIN_GRASS) continue; // sand only edges grass
      this.grid.terrain[i] = t;
      if (t === TERRAIN_WATER) this.taken[i] = 1;
    }
  }
  /** Set a tile's ground level (and its mirror's). `max`: only ever raise it. Cliffs form wherever it drops. */
  raise(x: number, y: number, level: number, max = false): void {
    if (!this.grid.inBounds(x, y)) return;
    for (const [tx, ty] of [[x, y], this.mirror(x, y)]) {
      const i = ty * this.size + tx;
      this.grid.level[i] = max ? Math.max(this.grid.level[i], level) : level;
    }
  }
  /** Make a tile (and its mirror) part of a ramp: it slopes between the levels at its two ends. Nothing grows on it. */
  ramp(x: number, y: number): void {
    if (!this.grid.inBounds(x, y)) return;
    for (const [tx, ty] of [[x, y], this.mirror(x, y)]) { const i = ty * this.size + tx; this.ramps[i] = 1; this.taken[i] = 1; }
  }
  private readonly ramps: Uint8Array;
  /** Will (x, y) be cliff? (A tile above a neighbour, ramps aside.) */
  private cliff(x: number, y: number): boolean {
    const g = this.grid, n = this.size, i = y * n + x;
    if (this.ramps[i]) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy, j = ny * n + nx;
      if (g.inBounds(nx, ny) && !this.ramps[j] && g.level[j] < g.level[i]) return true;
    }
    return false;
  }
  /** Next to a ramp (kept clear, so the way up stays open)? */
  private byRamp(x: number, y: number): boolean {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.grid.inBounds(x + dx, y + dy) && this.ramps[(y + dy) * this.size + x + dx]) return true;
    return false;
  }
  /** Is (x, y) far enough from the other sort of feature (trees vs food/crystal), and trees from home? */
  private spaced(kind: MapFeature['kind'], x: number, y: number): boolean {
    const tree = kind === 'tree';
    if (tree && this.reserved(x, y, TREE_BASE_PAD)) return false;
    for (const f of this.features) if ((f.kind === 'tree') !== tree && (f.x - x) ** 2 + (f.y - y) ** 2 <= TREE_GAP * TREE_GAP) return false;
    return true;
  }
  place(kind: MapFeature['kind'], x: number, y: number, amount: number): void {
    if (!this.free(x, y) || !this.spaced(kind, x, y)) return;
    const [mx, my] = this.mirror(x, y);
    if (!this.free(mx, my) || !this.spaced(kind, mx, my)) return;
    this.taken[y * this.size + x] = 1; this.taken[my * this.size + mx] = 1;
    this.features.push({ kind, x, y, amount }, { kind, x: mx, y: my, amount });
  }
  cluster(kind: MapFeature['kind'], cx: number, cy: number, n: number, amount: number, spread: number): void {
    const rng = this.rng;
    for (let i = 0; i < n * 3 && n > 0; i++) {
      const x = Math.round(cx + rng.range(-spread, spread)), y = Math.round(cy + rng.range(-spread, spread));
      if (this.free(x, y) && this.free(...this.mirror(x, y))) { this.place(kind, x, y, amount); n--; }
    }
  }
  forest(cx: number, cy: number, r: number, density = 0.88): void {
    const rng = this.rng;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) + rng.range(-0.8, 0.8);
      if (d < r && rng.next() < density) this.place('tree', x, y, 0);
    }
  }
  /** A blob of water with a sandy shore. */
  pond(cx: number, cy: number, r: number): void {
    const rng = this.rng;
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) + rng.range(-0.6, 0.6);
      if (!this.free(x, y)) continue;
      if (d < r) this.terrain(x, y, TERRAIN_WATER);
      else if (d < r + 1.2) this.terrain(x, y, TERRAIN_SAND);
    }
  }
  /** Woods along the map edge, `min`–`max` tiles deep. */
  borderWoods(min: number, max: number): void {
    for (let i = 1; i < this.size - 1; i++) {
      const depth = min + Math.floor(this.rng.next() * (max - min + 1));
      for (let k = 1; k <= depth; k++) { this.place('tree', i, k, 0); this.place('tree', k, i, 0); }
    }
  }
  /** Home resources beside each start: berries one way, crystal the other, a woodline behind. */
  home(food = 6, crystal = 4): void {
    const [x, y] = this.starts[0];
    this.cluster('food', x + 8, y + 1, food, 400, 1.6);
    this.cluster('crystal', x + 1, y + 8, crystal, 200, 1.3);
  }
  /**
   * Finish the map: cliffs where the ground drops, ramps sloped between the levels at their ends, then what blocks.
   * A ramp tile's height goes by how far it is (along the ramp) from the ground at each end. Last, any walkable
   * tile more than a step above a walkable neighbour turns to cliff, so levels only ever join by ramps.
   */
  done(): GeneratedMap {
    const g = this.grid, n = this.size, N = n * n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (this.cliff(x, y)) g.terrain[y * n + x] = TERRAIN_CLIFF;
    for (let i = 0; i < N; i++) g.rise[i] = g.level[i];
    const ground = (i: number) => !this.ramps[i] && g.terrain[i] !== TERRAIN_CLIFF;
    const near = (i: number): number[] => {
      const x = i % n, y = (i - x) / n, out: number[] = [];
      if (x > 0) out.push(i - 1);
      if (x < n - 1) out.push(i + 1);
      if (y > 0) out.push(i - n);
      if (y < n - 1) out.push(i + n);
      return out;
    };
    // steps along the ramps from the ground of each level
    const levels = [...new Set(Array.from(g.level))].sort((a, b) => a - b);
    const dist = levels.map((lv) => {
      const d = new Float32Array(N).fill(Infinity), q: number[] = [];
      for (let i = 0; i < N; i++) if (this.ramps[i] && near(i).some((j) => ground(j) && g.level[j] === lv)) { d[i] = 1; q.push(i); }
      for (let k = 0; k < q.length; k++) for (const j of near(q[k])) if (this.ramps[j] && d[j] > d[q[k]] + 1) { d[j] = d[q[k]] + 1; q.push(j); }
      return d;
    });
    for (let i = 0; i < N; i++) {
      if (!this.ramps[i]) continue;
      const ends = levels.map((lv, k) => [lv, dist[k][i]]).filter(([, d]) => d < Infinity);
      if (!ends.length) continue;
      const [lo, dl] = ends[0], [hi, dh] = ends[ends.length - 1];
      g.rise[i] = hi === lo ? lo : lo + ((hi - lo) * (dl - 0.5)) / (dl + dh - 1);
      g.level[i] = Math.floor(g.rise[i] + 1e-6);
    }
    const walk = (i: number) => g.terrain[i] !== TERRAIN_CLIFF && g.terrain[i] !== TERRAIN_WATER;
    const steep = Array.from({ length: N }, (_, i) => walk(i) && near(i).some((j) => walk(j) && g.rise[i] - g.rise[j] > STEP));
    steep.forEach((s, i) => { if (s) g.terrain[i] = TERRAIN_CLIFF; });
    for (let i = 0; i < N; i++) if (g.terrain[i] === TERRAIN_WATER || g.terrain[i] === TERRAIN_CLIFF) g.blocked[i] = 1;
    const features = this.features.filter((f) => g.terrain[f.y * n + f.x] !== TERRAIN_CLIFF);
    return { grid: g, features, starts: this.starts, seed: this.seed };
  }
}

/** Woodlands: scattered ponds and thick woods that shape the lanes (the original map). */
function woodlands(seed: number, size: number): GeneratedMap {
  const m = new MapBuilder(seed, size), rng = m.rng;
  for (let p = 0; p < Math.round(3 * (size / 64) ** 2); p++) {
    const cx = rng.int(14, size - 14), cy = rng.int(4, size - 30);
    if (cx + cy >= size - 8) continue;
    m.pond(cx, cy, rng.range(2, 4.2));
  }
  m.home();
  m.cluster('crystal', size / 2 - 4, size / 2 - 5, 5, 400, 1.6);
  m.cluster('food', size / 2 + 6, size / 2 - 9, 6, 350, 2);
  for (let i = 0; i < Math.round(3 * (size / 64) ** 2); i++) m.cluster('food', rng.int(6, size - 6), rng.int(6, size / 2 - 4), 4, 300, 1.5);
  for (let f = 0; f < Math.round(12 * (size / 64) ** 2); f++) {
    const cx = rng.int(3, size - 3), cy = rng.int(3, size - 3);
    if (cx + cy > size) continue;
    m.forest(cx, cy, rng.range(2, 4.5));
  }
  m.borderWoods(2, 3);
  return m.done();
}

/**
 * Water Donut: a ring of deep water around a rich central island, crossed by
 * two fords on the flanks. Whoever holds the island holds the map.
 */
function waterDonut(seed: number, size: number): GeneratedMap {
  const m = new MapBuilder(seed, size), rng = m.rng, c = (size - 1) / 2;
  const inner = size * 0.19, outer = size * 0.29;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (x + y > size - 1) continue; // one half; the mirror draws the other
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy) + rng.range(-0.5, 0.5);
    // fords on the axis across the line between the bases (equally far from both)
    const along = Math.abs(dx + dy) / Math.SQRT2;
    if (along < 1.8) { if (d >= inner - 1 && d <= outer + 1) m.terrain(x, y, TERRAIN_SAND); continue; }
    if (d >= inner && d <= outer) m.terrain(x, y, TERRAIN_WATER);
    else if (d >= inner - 1.2 && d <= outer + 1.2) m.terrain(x, y, TERRAIN_SAND);
  }
  m.home();
  // the island: the richest crystal on the map, berries, a grove
  m.cluster('crystal', c - 1.5, c - 1.5, 6, 500, 1.4);
  m.cluster('food', c + 3, c - 4, 5, 400, 1.4);
  m.forest(c - 5, c + 1, 1.8, 0.7);
  // outer lands: a few groves and a hunting meadow each side
  m.cluster('food', 6, size / 2 + 4, 5, 300, 1.8);
  m.cluster('crystal', size / 2 + 6, 5, 4, 300, 1.4);
  for (let f = 0; f < Math.round(8 * (size / 64) ** 2); f++) {
    const x = rng.int(3, size - 3), y = rng.int(3, size - 3);
    const d = Math.hypot(x - c, y - c);
    if (x + y > size || d < outer + 4) continue;
    m.forest(x, y, rng.range(1.8, 3.5));
  }
  m.borderWoods(2, 3);
  return m.done();
}

/**
 * Cliff Maze: rooms on terraces of different heights, cut apart by cliffs. Neighbouring rooms that join meet on open
 * ground (on one level) or by a ramp; rooms on one level that don't join have a rocky ridge between them. Every room
 * can be reached (the walls are knocked through like a maze, then a few more for loops), but the way to the enemy winds.
 */
function cliffMaze(seed: number, size: number): GeneratedMap {
  const m = new MapBuilder(seed, size), rng = m.rng;
  const CELL = 8, n = Math.floor(size / CELL);
  const cid = (cx: number, cy: number) => cy * n + cx;
  const room = (x: number, y: number) => cid(Math.min(n - 1, Math.floor(x / CELL)), Math.min(n - 1, Math.floor(y / CELL)));
  // walls between neighbouring rooms: [a, b, vertical?, cx, cy]
  type Wall = { a: number; b: number; v: boolean; cx: number; cy: number };
  const walls: Wall[] = [];
  for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
    if (cx + 1 < n) walls.push({ a: cid(cx, cy), b: cid(cx + 1, cy), v: true, cx, cy });
    if (cy + 1 < n) walls.push({ a: cid(cx, cy), b: cid(cx, cy + 1), v: false, cx, cy });
  }
  const mirrorCell = (id: number) => cid(n - 1 - (id % n), n - 1 - Math.floor(id / n));
  const key = (w: Wall) => `${Math.min(w.a, w.b)}-${Math.max(w.a, w.b)}`;
  const twin = (w: Wall) => { const a = mirrorCell(w.a), b = mirrorCell(w.b); return `${Math.min(a, b)}-${Math.max(a, b)}`; };
  const parent = Array.from({ length: n * n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const open = new Set<string>();
  const knock = (w: Wall) => {
    open.add(key(w)); open.add(twin(w));
    const t = walls.find((x) => key(x) === twin(w))!;
    parent[find(w.a)] = find(w.b); parent[find(t.a)] = find(t.b);
  };
  // the rooms a base covers make one room, on one level
  const [sx, sy] = m.starts[0], home = new Set<number>();
  for (let y = sy - 3; y <= sy + 5; y++) for (let x = sx - 3; x <= sx + 5; x++) { home.add(room(x, y)); home.add(mirrorCell(room(x, y))); }
  for (const w of walls) if (home.has(w.a) && home.has(w.b)) knock(w);
  // knock walls through (each with its mirror) until every room joins up
  const order = walls.map((w) => ({ w, r: rng.next() })).sort((p, q) => p.r - q.r).map((p) => p.w);
  for (const w of order) {
    const extra = rng.next() < 0.06; // some loops, so there's more than one way round
    if (find(w.a) === find(w.b) && !extra) continue;
    knock(w);
  }
  // each room's level (its mirror's the same): low or high ground; a high room among high rooms may stand higher still
  const lv = new Array<number>(n * n).fill(0), homeLevel = rng.next() < 0.5 ? 0 : 1;
  for (let id = 0; id < n * n; id++) if (id <= mirrorCell(id)) lv[id] = lv[mirrorCell(id)] = home.has(id) ? homeLevel : rng.next() < 0.45 ? 0 : 1;
  const around = (id: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [(id % n) + dx, Math.floor(id / n) + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < n && y < n).map(([x, y]) => cid(x, y));
  for (let id = 0; id < n * n; id++) {
    if (id > mirrorCell(id) || lv[id] !== 1 || home.has(id) || !around(id).every((j) => lv[j] >= 1)) continue;
    if (rng.next() < 0.7) lv[id] = lv[mirrorCell(id)] = 2;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (x + y <= size - 1) m.raise(x, y, lv[room(x, y)]);
  // between rooms: a ramp where joined rooms differ (by one level at most), a ridge where unjoined rooms don't
  for (const w of walls) {
    const same = lv[w.a] === lv[w.b], joined = open.has(key(w));
    if (joined === same) continue; // open ground, or a cliff already
    for (let k = -1; k <= CELL; k++) for (const t of [-1, 0]) {
      const x = w.v ? (w.cx + 1) * CELL + t : w.cx * CELL + k;
      const y = w.v ? w.cy * CELL + k : (w.cy + 1) * CELL + t;
      if (x + y > size - 1) continue; // (the mirror draws the other half)
      if (!joined) m.raise(x, y, lv[w.a] + 1, true);
      else if (k >= CELL / 2 - 2 && k < CELL / 2 + 2) m.ramp(x, y);
    }
  }
  m.home(6, 4);
  m.forest(3, 14, 2, 0.8); // a woodline behind each base
  // every room gets something worth walking to: crystal in the middle rooms, berries or woods elsewhere
  for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
    if (cx + cy > n - 1 || (cx <= 1 && cy <= 1)) continue;
    const x = cx * CELL + CELL / 2 - 0.5, y = cy * CELL + CELL / 2 - 0.5, r = rng.next();
    const mid = Math.abs(cx - (n - 1) / 2) + Math.abs(cy - (n - 1) / 2) < 1.5;
    if (mid || r < 0.15) m.cluster('crystal', x, y, mid ? 4 : 3, mid ? 450 : 300, 1.3);
    else if (r < 0.4) m.cluster('food', x, y, 4, 300, 1.5);
    else if (r < 0.7) m.forest(x, y, 2.2, 0.8);
  }
  m.borderWoods(1, 2);
  return m.done();
}

/**
 * Steppe (after Age of Empires II's Arabia): wide open ground, small scattered
 * woodlines, hunting herds and crystal spread out, so armies meet early and
 * walls and towers matter.
 */
function steppe(seed: number, size: number): GeneratedMap {
  const m = new MapBuilder(seed, size), rng = m.rng;
  m.home(5, 4);
  m.forest(m.starts[0][0] - 3, m.starts[0][1] + 10, 2.4, 0.9); // the home woodline
  m.cluster('crystal', 20, 6, 4, 300, 1.2);
  m.cluster('crystal', 6, 22, 4, 300, 1.2);
  m.cluster('crystal', size / 2 - 2, size / 2 + 3, 4, 350, 1.3);
  for (let i = 0; i < Math.round(6 * (size / 64) ** 2); i++) m.cluster('food', rng.int(8, size - 8), rng.int(8, size / 2), 3, 250, 1.4);
  for (let f = 0; f < Math.round(14 * (size / 64) ** 2); f++) {
    const x = rng.int(4, size - 4), y = rng.int(4, size - 4);
    if (x + y > size) continue;
    m.forest(x, y, rng.range(1.3, 2.4), 0.8);
  }
  if (rng.next() < 0.6) m.pond(rng.int(18, size - 18), rng.int(10, size / 2 - 6), rng.range(1.5, 2.5));
  m.borderWoods(1, 2);
  return m.done();
}

/**
 * Sunken Temple (after StarCraft's Lost Temple): each main sits on a high plateau with one ramp down; a natural
 * expansion waits below the ramp; the other two corners are high plateaus to expand to; the temple in the middle is
 * sunk below the field, with two ramps down to its crystal.
 */
function sunkenTemple(seed: number, size: number): GeneratedMap {
  const m = new MapBuilder(seed, size), rng = m.rng, c = (size - 1) / 2;
  const [sx, sy] = m.starts[0], hx = sx + 1.5, hy = sy + 1.5;
  m.grid.level.fill(1); // the field; the plateaus stand a level above it, the temple a level below
  /** Ground at `level` within about `r` of (cx, cy), its edge a cliff, with a ramp out along each angle in `ramps`, `w` tiles either side. */
  const mesa = (cx: number, cy: number, r: number, level: number, ramps: number[], w: number) => {
    for (let y = Math.floor(cy - r - 4); y <= cy + r + 4; y++) for (let x = Math.floor(cx - r - 4); x <= cx + r + 4; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy), a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
      if (d < r + 1) m.raise(x, y, level);
      if (d >= r - 1.5 && d < r + 2.5 && ramps.some((g) => Math.cos(a - g) > 0 && Math.abs(Math.sin(a - g)) * d < w)) m.ramp(x, y);
    }
  };
  mesa(hx, hy, 12, 2, [0.25], 2); // the main, its ramp facing along the edge toward the natural
  mesa(sx + 1.5, size - sy - 1.5, 9, 2, [-Math.PI / 4], 2); // the other corners, their ramps facing the middle
  mesa(c + 0.5, c + 0.5, 4.5, 0, [Math.PI * 0.75, -Math.PI * 0.25], 1.6); // the temple, two ramps down
  m.home(6, 4);
  m.forest(sx - 2, sy + 10, 2, 0.85);
  m.cluster('crystal', hx + 17, hy + 5, 4, 300, 1.3); // the natural, below the ramp
  m.cluster('food', hx + 16, hy + 10, 4, 300, 1.4);
  m.cluster('crystal', sx + 2, size - sy - 4, 5, 400, 1.3); // corner plateau
  m.cluster('crystal', c, c, 4, 500, 1); // the temple
  for (let f = 0; f < Math.round(10 * (size / 64) ** 2); f++) {
    const x = rng.int(4, size - 4), y = rng.int(4, size - 4);
    if (x + y > size || Math.hypot(x - hx, y - hy) < 15 || Math.hypot(x - c, y - c) < 8) continue;
    m.forest(x, y, rng.range(1.5, 3), 0.85);
  }
  m.borderWoods(1, 2);
  return m.done();
}

export interface MapInfo { id: string; name: string; description: string; generate(seed: number, size: number): GeneratedMap }

export const MAPS: MapInfo[] = [
  { id: 'woodlands', name: 'Woodlands', description: 'Ponds and thick woods that shape the lanes.', generate: woodlands },
  { id: 'steppe', name: 'Steppe', description: 'Open ground with small woodlines, so armies meet early. After Age of Empires II\'s Arabia.', generate: steppe },
  { id: 'water-donut', name: 'Water Donut', description: 'A ring of water around a rich island, crossed by two fords.', generate: waterDonut },
  { id: 'cliff-maze', name: 'Cliff Maze', description: 'Rooms on terraces, joined by ramps; the way to the enemy winds.', generate: cliffMaze },
  { id: 'sunken-temple', name: 'Sunken Temple', description: 'High plateau bases with one ramp each, naturals below, a sunken temple in the middle. After StarCraft\'s Lost Temple.', generate: sunkenTemple },
];

/** Map side in tiles (2 m each). */
export const MAP_SIZE = 96;
let defaultSize = MAP_SIZE;
/** The size skirmish maps are made at (the tests use smaller maps: the same rules, faster games). */
export const mapSize = (): number => defaultSize;
export function setMapSize(n: number): void { defaultSize = n; }

export function generateMap(seed: number, size = mapSize(), mapId = 'woodlands'): GeneratedMap {
  return (MAPS.find((m) => m.id === mapId) ?? MAPS[0]).generate(seed, size);
}
