// The ground, painted on the GPU. Instead of one huge picture of the whole map (tens of millions of pixels to paint
// and keep in memory), a shader paints each pixel on screen from small data: per-tile weights (forest floor, trodden
// dirt, sand, water, rock), noise computed in the shader, and each biome's colours. Same look as before: grass with
// patches, dirt round buildings and mines, shores and water, raised rock with cliff faces and their shadows, and each
// player's land blended into the next at the border. Grass tufts, flowers and stones are sprites laid on top.
import { Container, GlProgram, Mesh, MeshGeometry, Shader, Sprite as PixiSprite, Texture, BufferImageSource } from 'pixi.js';
import { TERRAIN_ROCK, TERRAIN_SAND, TERRAIN_WATER } from '../sim/map';
import type { World } from '../sim/world';
import type { BiomeArt, Sprite } from '../art/contract';
import { isoX, isoY } from './camera';

export interface Doodads { grass: Sprite[]; flowers: Sprite[]; stones: Sprite[]; forest: Sprite[] }
/** Which biome paints each part of the map: each player's half has its own (blended at the border). */
export interface Looks { biomes: BiomeArt[]; homes: Array<[number, number]> }

const MAX_BIOMES = 8;
const DEFAULT_GROUND: NonNullable<BiomeArt['ground']> = { grass: ['#5d7a2f', '#6f8a37', '#4b6627'], dirt: ['#86704a', '#6d5a3a'], forest: '#3f4a22', sand: '#c2a978', shallow: '#4b8299', deep: '#24506b' };
const rgb = (h: string): number[] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
/** A biome's nine ground colours, in the shader's order. */
const palette = (g: BiomeArt['ground']): number[] => { const x = g ?? DEFAULT_GROUND; return [...x.grass, ...x.dirt, x.forest, x.sand, x.shallow, x.deep].flatMap(rgb); };

function dataTexture(px: Uint8Array, w: number, h: number, scaleMode: 'linear' | 'nearest', addressMode: 'clamp-to-edge' | 'repeat'): Texture {
  return new Texture({ source: new BufferImageSource({ resource: px, width: w, height: h, format: 'rgba8unorm', scaleMode, addressMode }) });
}

// (GLSL 3.00: Pixi compiles a shader as WebGL 2 only when its source says so)
const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vPos;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vPos = aPosition;
}`;

const fragment = /* glsl */ `#version 300 es
in vec2 vPos;
out vec4 finalColor;
uniform sampler2D uWeights;   // per tile: forest floor, dirt, sand
uniform sampler2D uRock;      // per tile: water, rock, near rock
uniform vec2 uSize;
uniform float uHomes;
uniform vec2 uHome[${MAX_BIOMES}];
uniform vec3 uPal[${MAX_BIOMES * 9}];

const float CLIFF = 28.0;
const float BORDER = 3.0;
const vec3 TOP0 = vec3(0.435, 0.408, 0.361), TOP1 = vec3(0.549, 0.518, 0.451);
const vec3 FACE0 = vec3(0.173, 0.153, 0.133), FACE1 = vec3(0.353, 0.31, 0.263);
const vec3 RIM = vec3(0.706, 0.667, 0.58);

// value noise: a random value at each lattice point (a hash of the point and the layer), smoothly interpolated
float lattice(vec2 i, float layer) { return fract(sin(dot(i + layer * 17.31, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(float layer, vec2 p) {
  vec2 f = floor(p), u = p - f, s = u * u * (3.0 - 2.0 * u);
  float a = lattice(f, layer), b = lattice(f + vec2(1.0, 0.0), layer), c = lattice(f + vec2(0.0, 1.0), layer), d = lattice(f + 1.0, layer);
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}
float n2(vec2 p) { return vnoise(2.0, p); }
float n3(vec2 p) { return vnoise(3.0, p); }
vec4 weights(vec2 w) { return vec4(texture(uWeights, w / uSize).rgb, texture(uRock, w / uSize).r); } // forest, dirt, sand, water
float rockAt(vec2 w) { return texture(uRock, w / uSize).g; }

vec3 paint(int b, float big, float mid, float fine, float f, float dw, float sv, float wt, float wv, vec2 w) {
  int o = b * 9;
  vec3 c = mix(mix(uPal[o], uPal[o + 1], smoothstep(0.35, 0.75, big)), uPal[o + 2], smoothstep(0.55, 0.85, mid) * 0.6);
  c = mix(c, uPal[o + 5], f * 0.85);                                   // forest floor under woods
  c = mix(c, mix(uPal[o + 3], uPal[o + 4], fine), dw);                 // trodden dirt round buildings and mines
  c = mix(c, mix(uPal[o + 6], uPal[o + 3], mid * 0.4), smoothstep(0.35, 0.6, sv)); // shore
  if (wt > 0.0) {
    float depth = smoothstep(0.5, 1.0, wv);
    vec3 wc = mix(uPal[o + 7], uPal[o + 8], depth);
    float ripple = sin((w.x + w.y) * 6.0 + mid * 9.0) * 0.5 + 0.5;
    wc = mix(wc, vec3(0.784, 0.882, 0.902), ripple * 0.08 * (1.0 - depth) + smoothstep(0.42, 0.47, wv) * (1.0 - smoothstep(0.47, 0.55, wv)) * 0.5);
    c = mix(c, wc, wt);
  }
  return c;
}

// rock k screen pixels further down the screen from this pixel (its raised top is drawn CLIFF pixels up)
float rockBelow(float a, float y, float k) {
  float b2 = (y + k) / 16.0;
  vec2 w2 = vec2((a + b2) * 0.5, (b2 - a) * 0.5);
  if (w2.x < 0.0 || w2.y < 0.0 || w2.x >= uSize.x || w2.y >= uSize.y) return 0.0;
  return rockAt(w2) + (n2(w2 * 0.9) - 0.5) * 0.5 + (n3(w2 * 2.2) - 0.5) * 0.2;
}

void main() {
  float px = vPos.x + uSize.y * 32.0, py = vPos.y;          // the old painting's pixel (at scale 1)
  float a = vPos.x / 32.0, b = vPos.y / 16.0;
  vec2 w = vec2((a + b) * 0.5, (b - a) * 0.5);              // world tile coordinates
  if (w.x < 0.0 || w.y < 0.0 || w.x >= uSize.x || w.y >= uSize.y) discard;
  float big = vnoise(1.0, w * 0.18), mid = n2(w * 0.7), fine = n3(w * 3.1);
  float grain = vnoise(4.0, vec2(px * 0.45, py * 0.9));
  float wobble = (mid - 0.5) * 0.5 + (fine - 0.5) * 0.25;
  vec4 wt4 = weights(w);
  float f = smoothstep(0.25, 0.65, wt4.r + wobble);
  float dw = smoothstep(0.35, 0.7, wt4.g + wobble);
  float wv = wt4.a + wobble * 0.6;
  float sv = max(wt4.b, smoothstep(0.05, 0.4, wv)) + wobble * 0.4;
  float wt = smoothstep(0.42, 0.52, wv);
  bool nearRock = texture(uRock, (min(uSize - 1.0, floor(w)) + 0.5) / uSize).b > 0.5; // (its tile's own value: at the centre, no blend)

  if (nearRock) {
    vec3 rc; bool hit = false;
    if (rockBelow(a, py, CLIFF) > 0.5) {
      rc = mix(TOP0, TOP1, big * 0.5 + fine * 0.5);
      rc = mix(rc, uPal[5], smoothstep(0.55, 0.8, mid) * 0.55);       // moss
      if (fine > 0.8) rc = mix(rc, FACE0, 0.55);                        // cracks
      if (rockBelow(a, py, CLIFF - 3.0) <= 0.5) rc = mix(rc, RIM, 0.6); // the lit lip
      hit = true;
    } else {
      for (float k = CLIFF - 1.0; k >= 0.0; k -= 1.0) {
        if (rockBelow(a, py, k) > 0.5) {
          float up = 1.0 - k / CLIFF;
          float strata = sin((py + k) * 0.9 + n3(vec2(px * 0.08, 0.3)) * 6.0) * 0.5 + 0.5;
          float crag = n3(vec2(px * 0.45, (py + k) * 0.12));
          rc = mix(FACE0, FACE1, min(1.0, up * 0.7 + crag * 0.45 + strata * 0.15));
          hit = true;
          break;
        }
      }
    }
    if (hit) { finalColor = vec4(min(vec3(1.0), rc * (0.9 + grain * 0.15)), 1.0); return; }
  }

  // this point's half of the map, blended into the neighbour's near the border (wobbly, not a ruler line)
  int ta = 0, tb = -1; float da = 1e9, db = 1e9;
  for (int i = 0; i < ${MAX_BIOMES}; i++) {
    if (float(i) >= uHomes) break;
    float d = distance(uHome[i], w);
    if (d < da) { db = da; tb = ta; da = d; ta = i; } else if (d < db) { db = d; tb = i; }
  }
  if (tb == ta) tb = -1;
  vec3 c = paint(ta, big, mid, fine, f, dw, sv, wt, wv, w);
  float edge = (db - da) * 0.5 + (mid - 0.5) * 2.5;
  if (tb >= 0 && edge < BORDER) c = mix(paint(tb, big, mid, fine, f, dw, sv, wt, wv, w), c, smoothstep(-BORDER, BORDER, edge));
  // fine grain, so it doesn't look airbrushed
  float k = 0.88 + grain * 0.16 + (fine - 0.5) * 0.12 - (fine > 0.78 && wt < 0.5 ? 0.12 : 0.0);
  // cliffs cast a shadow down-right of their foot
  float shade = nearRock ? 1.0 - 0.4 * smoothstep(0.3, 0.7, rockAt(w - vec2(0.9, 0.2)) + wobble * 0.5) : 1.0;
  finalColor = vec4(min(vec3(1.0), c * k * shade), 1.0);
}`;

/**
 * The ground for `world`: a shader-painted mesh over the whole map, and its clutter (grass tufts, flowers, stones) as
 * sprites. `texture` turns a baked sprite into a renderer texture.
 */
export function buildGround(world: World, extraDirt: Array<[number, number, number]>, looks: Looks, texture: (s: Sprite) => Texture): Container {
  const g = world.grid, W = g.width, H = g.height;
  // per-tile weights: forest floor, dirt, sand; and water, rock, near rock (alpha left opaque: the GPU upload
  // premultiplies colour by alpha, which would wipe out any data kept beside a zero alpha)
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
  const wpx = new Uint8Array(W * H * 4), rpx = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const t = g.terrain[i];
    wpx[i * 4] = Math.round(forest[i] * 255); wpx[i * 4 + 1] = Math.round(dirt[i] * 255);
    wpx[i * 4 + 2] = t === TERRAIN_SAND ? 255 : 0; wpx[i * 4 + 3] = 255;
    rpx[i * 4] = t === TERRAIN_WATER ? 255 : 0; rpx[i * 4 + 3] = 255;
    if (t === TERRAIN_ROCK) {
      rpx[i * 4 + 1] = 255;
      const x = i % W, y = Math.floor(i / W);
      for (let dy = -2; dy <= 4; dy++) for (let dx = -2; dx <= 4; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) rpx[((y + dy) * W + x + dx) * 4 + 2] = 255;
    }
  }
  const biomes = looks.biomes.slice(0, MAX_BIOMES);
  const homes = (looks.homes.length ? looks.homes : [[0, 0] as [number, number]]).slice(0, MAX_BIOMES);
  const pal = new Float32Array(MAX_BIOMES * 27), home = new Float32Array(MAX_BIOMES * 2);
  homes.forEach(([x, y], i) => { home[i * 2] = x; home[i * 2 + 1] = y; pal.set(palette((biomes[i] ?? biomes[0])?.ground), i * 27); });

  const shader = new Shader({
    glProgram: new GlProgram({ vertex, fragment, name: 'ground' }),
    resources: {
      uWeights: dataTexture(wpx, W, H, 'linear', 'clamp-to-edge').source,
      uRock: dataTexture(rpx, W, H, 'linear', 'clamp-to-edge').source,
      groundUniforms: {
        uSize: { value: new Float32Array([W, H]), type: 'vec2<f32>' },
        uHomes: { value: homes.length, type: 'f32' },
        uHome: { value: home, type: 'vec2<f32>', size: MAX_BIOMES },
        uPal: { value: pal, type: 'vec3<f32>', size: MAX_BIOMES * 9 },
      },
    },
  });
  // one quad over the map's diamond, with room above for rock tops drawn raised
  const x0 = -H * 32, x1 = W * 32, y0 = -32, y1 = (W + H) * 16;
  const geometry = new MeshGeometry({ positions: new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]), uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) });
  const out = new Container();
  out.addChild(new Mesh({ geometry, shader }));
  out.addChild(clutter(world, looks, { forest, dirt }, texture));
  return out;
}

/**
 * Ground clutter as sprites: a few small props per tile, picked by what the ground is (grass, forest floor, dirt,
 * shore). Deterministic per tile, laid back to front. A render group: it never changes, so Pixi builds it once.
 */
function clutter(world: World, looks: Looks, f: { forest: Float32Array; dirt: Float32Array }, texture: (s: Sprite) => Texture): Container {
  const g = world.grid, W = g.width, H = g.height;
  const layer = new Container({ isRenderGroup: true });
  if (!looks.biomes.length) return layer;
  const sample = (arr: Float32Array, x: number, y: number) => {
    const fx = x - 0.5, fy = y - 0.5;
    const ax = Math.max(0, Math.min(W - 1, Math.floor(fx))), ay = Math.max(0, Math.min(H - 1, Math.floor(fy)));
    const bx = Math.min(W - 1, ax + 1), by = Math.min(H - 1, ay + 1);
    const tx = Math.max(0, Math.min(1, fx - ax)), ty = Math.max(0, Math.min(1, fy - ay));
    const p = arr[ay * W + ax] + (arr[ay * W + bx] - arr[ay * W + ax]) * tx, q = arr[by * W + ax] + (arr[by * W + bx] - arr[by * W + ax]) * tx;
    return p + (q - p) * ty;
  };
  const water = new Float32Array(W * H).map((_, i) => (g.terrain[i] === TERRAIN_WATER ? 1 : 0));
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
  const rockAt = (tx: number, ty: number) => g.inBounds(tx, ty) && g.terrain[ty * W + tx] === TERRAIN_ROCK;
  for (let sum = 0; sum < W + H - 1; sum++) {
    for (let x = Math.max(0, sum - H + 1); x <= Math.min(W - 1, sum); x++) {
      const y = sum - x, i = y * W + x;
      if (occupied[i] || g.terrain[i] === TERRAIN_WATER) continue;
      // nothing on rock, or behind it where the raised top covers the ground
      if (rockAt(x, y) || rockAt(x + 1, y) || rockAt(x, y + 1) || rockAt(x + 1, y + 1)) continue;
      seed = (x * 73856093) ^ (y * 19349663) ^ 0x5bd1e995;
      const cx = x + 0.5, cy = y + 0.5, d = doodadsAt(cx, cy);
      const forest = sample(f.forest, cx, cy), dirt = sample(f.dirt, cx, cy), shore = sample(water, cx, cy);
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
