import { TERRAIN_SAND, TERRAIN_WATER } from '../sim/map';
import type { World } from '../sim/world';
import type { Camera } from '../render/camera';
import { TEAM_COLORS } from '../render/renderer';

/** Diamond-shaped minimap matching the isometric view. */
export class Minimap {
  private base: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly size: number;

  constructor(readonly canvas: HTMLCanvasElement, private world: World, size = 200) {
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
      b.fillStyle = t === TERRAIN_WATER ? '#2f5f7a' : t === TERRAIN_SAND ? '#b8a070' : '#5d7a2f';
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
      ctx.fillStyle = n.tree ? '#2d4a22' : n.type === 'food' ? '#c0392b' : '#7ad7ef';
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
    for (const b of world.buildings.values()) {
      const [x, y] = this.toMini(b.ox + b.size / 2, b.oy + b.size / 2);
      ctx.fillStyle = TEAM_COLORS[b.owner].primary;
      ctx.fillRect(x - 4, y - 3, 8, 6);
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(x - 4, y - 3, 8, 6);
    }
    for (const u of world.units.values()) {
      const [x, y] = this.toMini(u.x, u.y);
      ctx.fillStyle = TEAM_COLORS[u.owner].primary;
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
