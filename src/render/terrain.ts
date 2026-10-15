// Paints the whole map's ground into one big canvas: grass, dirt, forest floor,
// sand, water and raised rock, blended smoothly between tiles and broken up with layered
// noise so it reads like a painted RTS terrain rather than a checkerboard.
import { TERRAIN_ROCK, TERRAIN_SAND, TERRAIN_WATER } from '../sim/map';
import type { World } from '../sim/world';
import { TILE_H, TILE_W, isoX, isoY } from './camera';
import type { BiomeArt, Sprite } from '../art/contract';

/** Terrain is painted at this many pixels per screen pixel (zoom 1), for crispness. */
export const TERRAIN_SCALE = 1.5;

export interface Doodads { grass: Sprite[]; flowers: Sprite[]; stones: Sprite[]; forest: Sprite[] }

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Ground colours for one biome, as RGB. */
interface Palette { ga: RGB; gb: RGB; gc: RGB; da: RGB; db: RGB; forest: RGB; sand: RGB; shallow: RGB; deep: RGB }
const DEFAULT_GROUND: NonNullable<BiomeArt['ground']> = { grass: ['#5d7a2f', '#6f8a37', '#4b6627'], dirt: ['#86704a', '#6d5a3a'], forest: '#3f4a22', sand: '#c2a978', shallow: '#4b8299', deep: '#24506b' };
function palette(g: BiomeArt['ground']): Palette {
  const x = g ?? DEFAULT_GROUND;
  return { ga: hex(x.grass[0]), gb: hex(x.grass[1]), gc: hex(x.grass[2]), da: hex(x.dirt[0]), db: hex(x.dirt[1]), forest: hex(x.forest), sand: hex(x.sand), shallow: hex(x.shallow), deep: hex(x.deep) };
}

/** Which biome paints each part of the map: each player's half has its own (blended at the border). */
export interface Looks { biomes: BiomeArt[]; homes: Array<[number, number]> }
const BORDER = 3; // tiles of blend across a territory border
/** How high rock stands, in screen pixels at zoom 1: its top is drawn lifted, with a cliff face below. */
const CLIFF_PX = 28;
const ROCK_TOP: [RGB, RGB] = [hex('#6f685c'), hex('#8c8473')];
const ROCK_FACE: [RGB, RGB] = [hex('#2c2722'), hex('#5a4f43')];
const ROCK_RIM: RGB = hex('#b4aa94');

/** Tileable value noise sampler. */
function makeNoise(size: number, seed: number): (x: number, y: number) => number {
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const g = new Float32Array(size * size).map(() => r());
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const tx = x - x0, ty = y - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const ix = ((x0 % size) + size) % size, iy = ((y0 % size) + size) % size;
    const ix1 = (ix + 1) % size, iy1 = (iy + 1) % size;
    const a = g[iy * size + ix] + (g[iy * size + ix1] - g[iy * size + ix]) * sx;
    const b = g[iy1 * size + ix] + (g[iy1 * size + ix1] - g[iy1 * size + ix]) * sx;
    return a + (b - a) * sy;
  };
}

export function paintTerrain(world: World, extraDirt: Array<[number, number, number]> = [], looks?: Looks): HTMLCanvasElement {
  const pals = (looks?.biomes.length ? looks.biomes : [null]).map((b) => palette(b?.ground));
  const homes = looks?.homes.length ? looks.homes : [[0, 0] as [number, number]];
  /** Nearest and second-nearest home, and how far past the border (in tiles) the point is. */
  const near = (x: number, y: number): [number, number, number] => {
    let a = 0, b = -1, da = Infinity, db = Infinity;
    homes.forEach(([hx, hy], i) => {
      const d = Math.hypot(hx - x, hy - y);
      if (d < da) { db = da; b = a; da = d; a = i; } else if (d < db) { db = d; b = i; }
    });
    return [a, b, (db - da) / 2];
  };
  const S = TERRAIN_SCALE;
  const g = world.grid;
  const W = g.width, H = g.height;
  // Per-tile weights, later sampled bilinearly.
  const rock = new Float32Array(W * H), nearRock = new Uint8Array(W * H);
  const water = new Float32Array(W * H), sand = new Float32Array(W * H), dirt = new Float32Array(W * H), forest = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (g.terrain[i] === TERRAIN_WATER) water[i] = 1;
    if (g.terrain[i] === TERRAIN_SAND) sand[i] = 1;
    if (g.terrain[i] === TERRAIN_ROCK) {
      rock[i] = 1;
      const x = i % W, y = Math.floor(i / W);
      for (let dy = -2; dy <= 4; dy++) for (let dx = -2; dx <= 4; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) nearRock[(y + dy) * W + x + dx] = 1;
    }
  }
  const splat = (arr: Float32Array, cx: number, cy: number, r: number, k = 1) => {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      arr[y * W + x] = Math.max(arr[y * W + x], Math.max(0, Math.min(1, (r - d) / 1.5 + 0.5)) * k);
    }
  };
  for (const b of world.buildings.values()) splat(dirt, b.ox + b.size / 2, b.oy + b.size / 2, b.size * 0.75 + 1.2);
  for (const [x, y, r] of extraDirt) splat(dirt, x, y, r);
  for (const n of world.nodes.values()) {
    if (n.tree) splat(forest, n.x, n.y, 1.0, 0.9);
    else if (n.type === 'crystal' && !n.shard) splat(dirt, n.x, n.y, 1.4, 0.8);
    else if (n.type === 'food') splat(dirt, n.x, n.y, 0.9, 0.35);
  }
  const nearRockAt = (x: number, y: number) => nearRock[Math.min(H - 1, Math.floor(y)) * W + Math.min(W - 1, Math.floor(x))] === 1;
  const sample = (arr: Float32Array, x: number, y: number) => {
    const fx = x - 0.5, fy = y - 0.5;
    const x0 = Math.max(0, Math.min(W - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(H - 1, Math.floor(fy)));
    const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const a = arr[y0 * W + x0] + (arr[y0 * W + x1] - arr[y0 * W + x0]) * tx;
    const b = arr[y1 * W + x0] + (arr[y1 * W + x1] - arr[y1 * W + x0]) * tx;
    return a + (b - a) * ty;
  };

  const n1 = makeNoise(64, 11), n2 = makeNoise(64, 23), n3 = makeNoise(128, 37), n4 = makeNoise(256, 51);
  const cw = Math.ceil((W + H) * (TILE_W / 2) * S), ch = Math.ceil((W + H) * (TILE_H / 2) * S);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cw, ch);
  const d = img.data;
  const ox = H * (TILE_W / 2) * S;
  const smooth = (e0: number, e1: number, v: number) => { const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  for (let py = 0; py < ch; py++) {
    for (let px = 0; px < cw; px++) {
      const a = (px - ox) / S / (TILE_W / 2), b = py / S / (TILE_H / 2);
      const wx = (a + b) / 2, wy = (b - a) / 2;
      const o = (py * cw + px) * 4;
      if (wx < 0 || wy < 0 || wx >= W || wy >= H) { d[o + 3] = 0; continue; }
      // noise at a few scales (in world units)
      const big = n1(wx * 0.18, wy * 0.18);
      const mid = n2(wx * 0.7, wy * 0.7);
      const fine = n3(wx * 3.1, wy * 3.1);
      const grain = n4((px / S) * 0.45, (py / S) * 0.9);
      const wobble = (mid - 0.5) * 0.5 + (fine - 0.5) * 0.25;

      const f = smooth(0.25, 0.65, sample(forest, wx, wy) + wobble);
      const dw = smooth(0.35, 0.7, sample(dirt, wx, wy) + wobble);
      const wv = sample(water, wx, wy) + wobble * 0.6;
      const sv = Math.max(sample(sand, wx, wy), smooth(0.05, 0.4, wv)) + wobble * 0.4;
      const wt = smooth(0.42, 0.52, wv);
      const paint = (P: Palette): RGB => {
        let c: RGB = mix(mix(P.ga, P.gb, smooth(0.35, 0.75, big)), P.gc, smooth(0.55, 0.85, mid) * 0.6);
        c = mix(c, P.forest, f * 0.85); // forest floor under woods
        c = mix(c, mix(P.da, P.db, fine), dw); // trodden dirt around buildings and mines
        c = mix(c, mix(P.sand, P.da, mid * 0.4), smooth(0.35, 0.6, sv)); // shore
        if (wt > 0) {
          const depth = smooth(0.5, 1.0, wv);
          let wc = mix(P.shallow, P.deep, depth);
          const ripple = Math.sin((wx + wy) * 6 + mid * 9) * 0.5 + 0.5;
          wc = mix(wc, [200, 225, 230], ripple * 0.08 * (1 - depth) + smooth(0.42, 0.47, wv) * (1 - smooth(0.47, 0.55, wv)) * 0.5);
          c = mix(c, wc, wt);
        }
        return c;
      };
      // raised rock: the top is drawn CLIFF_PX higher than its ground, with a face below it
      if (nearRockAt(wx, wy)) {
        const at = (k: number) => { // the world point k screen pixels further down
          const b2 = (py / S + k) / (TILE_H / 2);
          const x2 = (a + b2) / 2, y2 = (b2 - a) / 2;
          return x2 < 0 || y2 < 0 || x2 >= W || y2 >= H ? 0 : sample(rock, x2, y2) + (n2(x2 * 0.9, y2 * 0.9) - 0.5) * 0.5 + (n3(x2 * 2.2, y2 * 2.2) - 0.5) * 0.2;
        };
        let rc: RGB | null = null;
        if (at(CLIFF_PX) > 0.5) {
          rc = mix(ROCK_TOP[0], ROCK_TOP[1], big * 0.5 + fine * 0.5);
          rc = mix(rc, (pals[0] ?? pals[0]).forest, smooth(0.55, 0.8, mid) * 0.55); // moss
          if (fine > 0.8) rc = mix(rc, ROCK_FACE[0], 0.55); // cracks
          if (at(CLIFF_PX - 3) <= 0.5) rc = mix(rc, ROCK_RIM, 0.6); // the lit lip
        } else {
          for (let k = CLIFF_PX - 1; k >= 0; k -= 1) if (at(k) > 0.5) {
            const up = 1 - k / CLIFF_PX; // 0 at the foot, 1 at the lip
            const strata = Math.sin((py / S + k) * 0.9 + n3(px / S * 0.08, 0.3) * 6) * 0.5 + 0.5;
            const crag = n3(px / S * 0.45, (py / S + k) * 0.12);
            rc = mix(ROCK_FACE[0], ROCK_FACE[1], Math.min(1, up * 0.7 + crag * 0.45 + strata * 0.15));
            break;
          }
        }
        if (rc) {
          const k = 0.9 + grain * 0.15;
          d[o] = Math.min(255, rc[0] * k); d[o + 1] = Math.min(255, rc[1] * k); d[o + 2] = Math.min(255, rc[2] * k); d[o + 3] = 255;
          continue;
        }
      }
      // this point's half of the map, blended into the neighbour's near the border (wobbly, not a ruler line)
      const [ta, tb, past] = near(wx, wy);
      let c = paint(pals[ta] ?? pals[0]);
      const edge = past + (mid - 0.5) * 2.5;
      if (tb >= 0 && edge < BORDER && pals[tb] && pals[tb] !== pals[ta]) c = mix(paint(pals[tb]), c, smooth(-BORDER, BORDER, edge));
      // fine grain + tufts so it doesn't look airbrushed
      const k = 0.88 + grain * 0.16 + (fine - 0.5) * 0.12 - (fine > 0.78 && wt < 0.5 ? 0.12 : 0);
      // cliffs cast a shadow down-right of their foot
      const shade = nearRockAt(wx, wy) ? 1 - 0.4 * smooth(0.3, 0.7, sample(rock, wx - 0.9, wy - 0.2) + wobble * 0.5) : 1;
      d[o] = Math.min(255, c[0] * k * shade);
      d[o + 1] = Math.min(255, c[1] * k * shade);
      d[o + 2] = Math.min(255, c[2] * k * shade);
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (looks?.biomes.length) scatter(ctx, world, (x, y) => looks.biomes[near(x, y)[0]]?.doodads ?? looks.biomes[0].doodads, { forest, dirt, sand, water, sample, ox });
  return canvas;
}

/**
 * Paint ground clutter into the terrain: several small props per tile, picked
 * by what the ground is (grass, forest floor, dirt, shore). Deterministic per
 * tile, drawn back-to-front so nearer props overlap farther ones.
 */
function scatter(
  ctx: CanvasRenderingContext2D, world: World, doodadsAt: (x: number, y: number) => Doodads,
  f: { forest: Float32Array; dirt: Float32Array; sand: Float32Array; water: Float32Array; sample: (a: Float32Array, x: number, y: number) => number; ox: number },
): void {
  const g = world.grid;
  const S = TERRAIN_SCALE;
  const occupied = new Uint8Array(g.width * g.height);
  for (const b of world.buildings.values()) for (let y = b.oy - 1; y <= b.oy + b.size; y++) for (let x = b.ox - 1; x <= b.ox + b.size; x++) if (g.inBounds(x, y)) occupied[y * g.width + x] = 1;
  for (const n of world.nodes.values()) if (!n.tree) occupied[g.idx(n.x, n.y)] = 1;
  let seed = 1234567;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)];
  for (let sum = 0; sum < g.width + g.height - 1; sum++) {
    for (let x = Math.max(0, sum - g.height + 1); x <= Math.min(g.width - 1, sum); x++) {
      const y = sum - x;
      const i = y * g.width + x;
      if (occupied[i] || g.terrain[i] === TERRAIN_WATER) continue;
      // nothing on rock, or behind it where the raised top covers the ground
      const rockAt = (tx: number, ty: number) => g.inBounds(tx, ty) && g.terrain[ty * g.width + tx] === TERRAIN_ROCK;
      if (rockAt(x, y) || rockAt(x + 1, y) || rockAt(x, y + 1) || rockAt(x + 1, y + 1)) continue;
      seed = (x * 73856093) ^ (y * 19349663) ^ 0x5bd1e995;
      const cx = x + 0.5, cy = y + 0.5;
      const d = doodadsAt(cx, cy);
      const forest = f.sample(f.forest, cx, cy), dirt = f.sample(f.dirt, cx, cy), shore = f.sample(f.water, cx, cy);
      // sparse: about one prop every other grass tile, fewer on forest floor and dirt
      const chance = forest > 0.4 ? 0.3 : dirt > 0.5 || shore > 0.25 ? 0.12 : 0.45;
      const n = rnd() < chance ? (rnd() < 0.15 ? 2 : 1) : 0;
      const props: Array<{ s: Sprite; px: number; py: number; k: number }> = [];
      for (let j = 0; j < n; j++) {
        const wx = x + rnd(), wy = y + rnd();
        let s: Sprite;
        const roll = rnd();
        if (forest > 0.4) s = roll < 0.55 ? pick(d.forest) : roll < 0.8 ? pick(d.grass) : pick(d.stones);
        else if (dirt > 0.5 || shore > 0.25 || g.terrain[i] === TERRAIN_SAND) { if (roll < 0.6) s = pick(d.stones); else if (roll < 0.8) s = pick(d.grass); else continue; }
        else s = roll < 0.66 ? pick(d.grass) : roll < 0.82 ? pick(d.flowers) : roll < 0.95 ? pick(d.stones) : pick(d.forest);
        props.push({ s, px: f.ox + isoX(wx, wy) * S, py: isoY(wx, wy) * S, k: (0.75 + rnd() * 0.5) * S / s.q });
      }
      props.sort((a, b) => a.py - b.py);
      for (const p of props) ctx.drawImage(p.s.img, p.s.sx, p.s.sy, p.s.sw, p.s.sh, p.px - p.s.ax * p.k, p.py - p.s.ay * p.k, p.s.sw * p.k, p.s.sh * p.k);
    }
  }
}
