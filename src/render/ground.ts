// The ground, painted once. At load the CPU paints the whole map into one texture, a few texels per tile: grass with
// patches, dirt round buildings and mines, shores and water, rock with moss and cracks, and each player's land
// blended into the next at the border. Each frame the GPU reads that texture and a small tiling grain texture, two
// reads per pixel, so the ground costs about the same on any machine. Grass tufts, flowers and stones are sprites.
import { Container, GlProgram, Mesh, MeshGeometry, Shader, Sprite as PixiSprite, Texture, BufferImageSource } from 'pixi.js';
import { TERRAIN_ROCK, TERRAIN_SAND, TERRAIN_WATER } from '../sim/map';
import type { World } from '../sim/world';
import type { BiomeArt, Sprite } from '../art/contract';
import { isoX, isoY } from './camera';

export interface Doodads { grass: Sprite[]; flowers: Sprite[]; stones: Sprite[]; forest: Sprite[] }
/** Which biome paints each part of the map: each player's half has its own (blended at the border). */
export interface Looks { biomes: BiomeArt[]; homes: Array<[number, number]> }

/** Texels per tile in the painted ground (fewer on a huge map, to keep the texture within 4096 a side). */
const DETAIL = 8;
const GRAIN = 128; // the grain texture's side, in texels
const BORDER = 3;
const DEFAULT_GROUND: NonNullable<BiomeArt['ground']> = { grass: ['#5d7a2f', '#6f8a37', '#4b6627'], dirt: ['#86704a', '#6d5a3a'], forest: '#3f4a22', sand: '#c2a978', shallow: '#4b8299', deep: '#24506b' };
const TOP0 = [0.435, 0.408, 0.361], TOP1 = [0.549, 0.518, 0.451], FACE0 = [0.173, 0.153, 0.133];
const rgb = (h: string): number[] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
/** A biome's nine ground colours: three grass, two dirt, forest floor, sand, shallow and deep water. */
const palette = (g: BiomeArt['ground']): number[][] => { const x = g ?? DEFAULT_GROUND; return [...x.grass, ...x.dirt, x.forest, x.sand, x.shallow, x.deep].map(rgb); };
const mix = (a: number[], b: number[], t: number): number[] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (e0: number, e1: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// value noise: a random value at each lattice point (a hash of the point and the layer), smoothly interpolated
const lattice = (x: number, y: number, layer: number): number => { const v = Math.sin((x + layer * 17.31) * 127.1 + (y + layer * 17.31) * 311.7) * 43758.5453; return v - Math.floor(v); };
function vnoise(layer: number, x: number, y: number): number {
  const fx = Math.floor(x), fy = Math.floor(y), ux = x - fx, uy = y - fy, sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
  const a = lattice(fx, fy, layer), b = lattice(fx + 1, fy, layer), c = lattice(fx, fy + 1, layer), d = lattice(fx + 1, fy + 1, layer);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vPos;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vPos = aPosition;
}`;

// screen position to tile coordinates (the isometric projection undone), the painted colour there, and fine grain
const fragment = /* glsl */ `#version 300 es
in vec2 vPos;
out vec4 finalColor;
uniform sampler2D uGround;
uniform sampler2D uGrain;
uniform vec2 uSize;
void main() {
  float a = vPos.x / 32.0, b = vPos.y / 16.0;
  vec2 w = vec2((a + b) * 0.5, (b - a) * 0.5);
  if (w.x < 0.0 || w.y < 0.0 || w.x >= uSize.x || w.y >= uSize.y) discard;
  float grain = texture(uGrain, vec2(vPos.x * 0.45, vPos.y * 0.9) / ${GRAIN}.0).r;
  finalColor = vec4(min(vec3(1.0), texture(uGround, w / uSize).rgb * (0.9 + grain * 0.16)), 1.0);
}`;

/**
 * The ground for `world`: a mesh over the whole map painted from one texture, and its clutter (grass tufts, flowers,
 * stones) as sprites. `texture` turns a baked sprite into a renderer texture.
 */
export function buildGround(world: World, extraDirt: Array<[number, number, number]>, looks: Looks, texture: (s: Sprite) => Texture): Container {
  const g = world.grid, W = g.width, H = g.height;
  // per-tile weights: forest floor under trees, trodden dirt round buildings and mines
  const forest = new Float32Array(W * H), dirt = new Float32Array(W * H);
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
  const of = (t: number) => Float32Array.from(g.terrain, (v) => (v === t ? 1 : 0));
  const sand = of(TERRAIN_SAND), water = of(TERRAIN_WATER), rock = of(TERRAIN_ROCK);
  const homes = looks.homes.length ? looks.homes : [[0, 0] as [number, number]];
  const pals = homes.map((_, i) => palette((looks.biomes[i] ?? looks.biomes[0])?.ground));

  // a biome's colour at a point, from the noise and the blended weights there
  const paint = (p: number[][], big: number, mid: number, fine: number, f: number, dw: number, sv: number, wt: number, wv: number, x: number, y: number): number[] => {
    let c = mix(mix(p[0], p[1], smooth(0.35, 0.75, big)), p[2], smooth(0.55, 0.85, mid) * 0.6);
    c = mix(c, p[5], f * 0.85);                                     // forest floor under woods
    c = mix(c, mix(p[3], p[4], fine), dw);                          // trodden dirt round buildings and mines
    c = mix(c, mix(p[6], p[3], mid * 0.4), smooth(0.35, 0.6, sv));  // shore
    if (wt > 0) {
      const depth = smooth(0.5, 1, wv);
      const ripple = Math.sin((x + y) * 6 + mid * 9) * 0.5 + 0.5;
      const wc = mix(mix(p[7], p[8], depth), [0.784, 0.882, 0.902], ripple * 0.08 * (1 - depth) + smooth(0.42, 0.47, wv) * (1 - smooth(0.47, 0.55, wv)) * 0.5);
      c = mix(c, wc, wt);
    }
    return c;
  };
  const D = Math.max(1, Math.min(DETAIL, Math.floor(4096 / Math.max(W, H)))), TW = W * D, TH = H * D;
  const px = new Uint8Array(TW * TH * 4);
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const x = (tx + 0.5) / D, y = (ty + 0.5) / D;
    const big = vnoise(1, x * 0.18, y * 0.18), mid = vnoise(2, x * 0.7, y * 0.7), fine = vnoise(3, x * 3.1, y * 3.1);
    const wobble = (mid - 0.5) * 0.5 + (fine - 0.5) * 0.25;
    const f = smooth(0.25, 0.65, sample(forest, W, H, x, y) + wobble);
    const dw = smooth(0.35, 0.7, sample(dirt, W, H, x, y) + wobble);
    const wv = sample(water, W, H, x, y) + wobble * 0.6;
    const sv = Math.max(sample(sand, W, H, x, y), smooth(0.05, 0.4, wv)) + wobble * 0.4;
    const wt = smooth(0.42, 0.52, wv);
    let c: number[];
    if (sample(rock, W, H, x, y) + (vnoise(2, x * 0.9, y * 0.9) - 0.5) * 0.5 + (vnoise(3, x * 2.2, y * 2.2) - 0.5) * 0.2 > 0.5) {
      c = mix(TOP0, TOP1, big * 0.5 + fine * 0.5);
      c = mix(c, pals[0][5], smooth(0.55, 0.8, mid) * 0.55); // moss
      if (fine > 0.8) c = mix(c, FACE0, 0.55);               // cracks
    } else {
      // this point's half of the map, blended into the neighbour's near the border (wobbly, not a ruler line)
      let ta = 0, tb = -1, da = Infinity, db = Infinity;
      homes.forEach(([hx, hy], i) => { const d = Math.hypot(hx - x, hy - y); if (d < da) { db = da; tb = ta; da = d; ta = i; } else if (d < db) { db = d; tb = i; } });
      if (tb === ta) tb = -1;
      c = paint(pals[ta], big, mid, fine, f, dw, sv, wt, wv, x, y);
      const edge = (db - da) * 0.5 + (mid - 0.5) * 2.5;
      if (tb >= 0 && edge < BORDER) c = mix(paint(pals[tb], big, mid, fine, f, dw, sv, wt, wv, x, y), c, smooth(-BORDER, BORDER, edge));
      const k = 0.98 + (fine - 0.5) * 0.12 - (fine > 0.78 && wt < 0.5 ? 0.12 : 0);
      c = [c[0] * k, c[1] * k, c[2] * k];
    }
    const i = (ty * TW + tx) * 4;
    px[i] = Math.min(255, c[0] * 255); px[i + 1] = Math.min(255, c[1] * 255); px[i + 2] = Math.min(255, c[2] * 255); px[i + 3] = 255;
  }
  const grain = new Uint8Array(GRAIN * GRAIN * 4);
  for (let i = 0; i < GRAIN * GRAIN; i++) { const v = Math.round(lattice(i % GRAIN, Math.floor(i / GRAIN), 4) * 255); grain.set([v, v, v, 255], i * 4); }
  const shader = new Shader({
    glProgram: new GlProgram({ vertex, fragment, name: 'ground' }),
    resources: {
      uGround: new BufferImageSource({ resource: px, width: TW, height: TH, format: 'rgba8unorm', scaleMode: 'linear', addressMode: 'clamp-to-edge' }),
      uGrain: new BufferImageSource({ resource: grain, width: GRAIN, height: GRAIN, format: 'rgba8unorm', scaleMode: 'linear', addressMode: 'repeat' }),
      groundUniforms: { uSize: { value: new Float32Array([W, H]), type: 'vec2<f32>' } },
    },
  });
  // one quad over the map's diamond
  const x0 = -H * 32, x1 = W * 32, y0 = 0, y1 = (W + H) * 16;
  const geometry = new MeshGeometry({ positions: new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]), uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) });
  const out = new Container();
  out.addChild(new Mesh({ geometry, shader }));
  out.addChild(clutter(world, looks, { forest, dirt, water }, texture));
  return out;
}

/** A per-tile value at a point, blended between the four nearest tile centres. */
function sample(arr: Float32Array, W: number, H: number, x: number, y: number): number {
  const fx = x - 0.5, fy = y - 0.5;
  const ax = Math.max(0, Math.min(W - 1, Math.floor(fx))), ay = Math.max(0, Math.min(H - 1, Math.floor(fy)));
  const bx = Math.min(W - 1, ax + 1), by = Math.min(H - 1, ay + 1);
  const tx = Math.max(0, Math.min(1, fx - ax)), ty = Math.max(0, Math.min(1, fy - ay));
  const p = arr[ay * W + ax] + (arr[ay * W + bx] - arr[ay * W + ax]) * tx, q = arr[by * W + ax] + (arr[by * W + bx] - arr[by * W + ax]) * tx;
  return p + (q - p) * ty;
}

/**
 * Ground clutter as sprites: a few small props per tile, picked by what the ground is (grass, forest floor, dirt,
 * shore). Deterministic per tile, laid back to front. A render group: it never changes, so Pixi builds it once.
 */
function clutter(world: World, looks: Looks, f: { forest: Float32Array; dirt: Float32Array; water: Float32Array }, texture: (s: Sprite) => Texture): Container {
  const g = world.grid, W = g.width, H = g.height;
  const layer = new Container({ isRenderGroup: true });
  if (!looks.biomes.length) return layer;
  const homes = looks.homes.length ? looks.homes : [[0, 0] as [number, number]];
  const doodadsAt = (x: number, y: number): Doodads => {
    let best = 0, bd = Infinity;
    homes.forEach(([hx, hy], i) => { const d = Math.hypot(hx - x, hy - y); if (d < bd) { bd = d; best = i; } });
    return (looks.biomes[best] ?? looks.biomes[0]).doodads;
  };
  const occupied = new Uint8Array(W * H);
  for (const b of world.buildings.values()) for (let y = b.oy - 1; y <= b.oy + b.size; y++) for (let x = b.ox - 1; x <= b.ox + b.size; x++) if (g.inBounds(x, y)) occupied[y * W + x] = 1;
  for (const n of world.nodes.values()) if (!n.tree) occupied[g.idx(n.x, n.y)] = 1;
  let seed = 1234567;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)];
  for (let sum = 0; sum < W + H - 1; sum++) {
    for (let x = Math.max(0, sum - H + 1); x <= Math.min(W - 1, sum); x++) {
      const y = sum - x, i = y * W + x;
      if (occupied[i] || g.terrain[i] === TERRAIN_WATER || g.terrain[i] === TERRAIN_ROCK) continue;
      seed = (x * 73856093) ^ (y * 19349663) ^ 0x5bd1e995;
      const cx = x + 0.5, cy = y + 0.5, d = doodadsAt(cx, cy);
      const forest = sample(f.forest, W, H, cx, cy), dirt = sample(f.dirt, W, H, cx, cy), shore = sample(f.water, W, H, cx, cy);
      // sparse: about one prop every other grass tile, fewer on forest floor and dirt
      const chance = forest > 0.4 ? 0.3 : dirt > 0.5 || shore > 0.25 ? 0.12 : 0.45;
      const n = rnd() < chance ? (rnd() < 0.15 ? 2 : 1) : 0;
      const props: Array<{ s: Sprite; wx: number; wy: number; k: number }> = [];
      for (let j = 0; j < n; j++) {
        const wx = x + rnd(), wy = y + rnd(), roll = rnd();
        let s: Sprite;
        if (forest > 0.4) s = roll < 0.55 ? pick(d.forest) : roll < 0.8 ? pick(d.grass) : pick(d.stones);
        else if (dirt > 0.5 || shore > 0.25 || g.terrain[i] === TERRAIN_SAND) { if (roll < 0.6) s = pick(d.stones); else if (roll < 0.8) s = pick(d.grass); else continue; }
        else s = roll < 0.66 ? pick(d.grass) : roll < 0.82 ? pick(d.flowers) : roll < 0.95 ? pick(d.stones) : pick(d.forest);
        props.push({ s, wx, wy, k: (0.75 + rnd() * 0.5) / s.q });
      }
      props.sort((p, q) => isoY(p.wx, p.wy) - isoY(q.wx, q.wy));
      for (const p of props) {
        const sp = new PixiSprite(texture(p.s));
        sp.anchor.set(p.s.ax / p.s.sw, p.s.ay / p.s.sh);
        sp.position.set(isoX(p.wx, p.wy), isoY(p.wx, p.wy));
        sp.scale.set(p.k);
        layer.addChild(sp);
      }
    }
  }
  return layer;
}
