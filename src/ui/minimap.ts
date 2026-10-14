import type { BiomeArt } from '../art/contract';
import { TERRAIN_SAND, TERRAIN_WATER } from '../sim/map';
import type { World } from '../sim/world';
import type { Camera } from '../render/camera';
import { teamColor } from '../render/artbank';

/** Diamond-shaped minimap matching the isometric view. */
export class Minimap {
  private base: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly size: number;

  /** `ground(x, y)` gives that half of the map's biome colours (defaults: the meadow). */
  /** Whose fog of war to show; -1 shows everything. */
  viewer = -1;

  constructor(readonly canvas: HTMLCanvasElement, private world: World, size = 200, private ground?: (x: number, y: number) => BiomeArt['ground']) {
    this.size = size;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = (size / 2) * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size / 2}px`;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
    this.base = document.createElement('canvas');
    this.base.width = size;
    this.base.height = size / 2;
    const b = this.base.getContext('2d')!;
    const g = world.grid;
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const t = g.terrain[y * g.width + x];
      const gr = this.ground?.(x + 0.5, y + 0.5);
      b.fillStyle = t === TERRAIN_WATER ? gr?.shallow ?? '#2f5f7a' : t === TERRAIN_SAND ? gr?.sand ?? '#b8a070' : gr?.grass[0] ?? '#5d7a2f';
      const [px, py] = this.toMini(x + 0.5, y + 0.5);
      b.fillRect(px - 1.6, py - 0.8, 3.2, 1.6);
    }
  }

  toMini(x: number, y: number): [number, number] {
    const g = this.world.grid;
    const s = this.size;
    return [((x / g.width - y / g.height) * s) / 2 + s / 2, ((x / g.width + y / g.height) * s) / 4];
  }
  toWorld(mx: number, my: number): [number, number] {
    const g = this.world.grid;
    const s = this.size;
    const a = ((mx - s / 2) * 2) / s, b = (my * 4) / s;
    return [((a + b) / 2) * g.width, ((b - a) / 2) * g.height];
  }

  private layer: HTMLCanvasElement | null = null;
  private lastStatic = -1e9;
  private lastDraw = -1e9;

  /** Terrain + resources, rebuilt every couple of seconds (resources deplete slowly). */
  private staticLayer(): HTMLCanvasElement {
    const now = performance.now();
    if (this.layer && now - this.lastStatic < 2000) return this.layer;
    this.lastStatic = now;
    let c = this.layer;
    if (!c) {
      // a second canvas stacked under the live one; it only changes every 2 s
      c = document.createElement('canvas');
      c.className = 'minimap-static';
      c.style.width = this.canvas.style.width;
      c.style.height = this.canvas.style.height;
      this.canvas.parentElement!.insertBefore(c, this.canvas);
    }
    c.width = this.size;
    c.height = this.size / 2;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(this.base, 0, 0);
    for (const n of this.world.nodes.values()) {
      if (n.shard) continue;
      const [x, y] = this.toMini(n.x, n.y);
      ctx.fillStyle = n.tree ? this.ground?.(n.x, n.y)?.forest ?? '#2d4a22' : n.type === 'food' ? '#c0392b' : '#7ad7ef';
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    return (this.layer = c);
  }

  draw(cam: Camera): void {
    const now = performance.now();
    if (now - this.lastDraw < 100) return;
    this.lastDraw = now;
    const { ctx, world } = this;
    ctx.clearRect(0, 0, this.size, this.size / 2);
    this.staticLayer();
    const me = this.viewer;
    if (me >= 0) {
      // fog: black where never seen, a veil where out of sight
      const unseen = new Path2D(), veiled = new Path2D();
      for (let ty = 0; ty < world.grid.height; ty++) for (let tx = 0; tx < world.grid.width; tx++) {
        const v = world.vision(me, tx, ty);
        if (v === 2) continue;
        const p = v ? veiled : unseen;
        const c = [this.toMini(tx, ty), this.toMini(tx + 1, ty), this.toMini(tx + 1, ty + 1), this.toMini(tx, ty + 1)];
        p.moveTo(c[0][0], c[0][1]); for (let i = 1; i < 4; i++) p.lineTo(c[i][0], c[i][1]); p.closePath();
      }
      ctx.fillStyle = 'rgba(6,8,10,0.5)'; ctx.fill(veiled);
      ctx.fillStyle = '#06080a'; ctx.fill(unseen);
    }
    for (const b of world.buildings.values()) {
      if (me >= 0 && b.owner !== me && world.vision(me, b.ox + b.size / 2, b.oy + b.size / 2) === 0) continue;
      const [x, y] = this.toMini(b.ox + b.size / 2, b.oy + b.size / 2);
      ctx.fillStyle = teamColor(this.world, b.owner).primary;
      ctx.fillRect(x - 4, y - 3, 8, 6);
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(x - 4, y - 3, 8, 6);
    }
    for (const u of world.units.values()) {
      if (me >= 0 && u.owner !== me && world.vision(me, u.x, u.y) !== 2) continue;
      const [x, y] = this.toMini(u.x, u.y);
      ctx.fillStyle = teamColor(this.world, u.owner).primary;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // camera viewport
    const corners = [cam.toWorld(0, 0), cam.toWorld(cam.width, 0), cam.toWorld(cam.width, cam.height), cam.toWorld(0, cam.height)].map(([x, y]) => this.toMini(x, y));
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
  }
}
