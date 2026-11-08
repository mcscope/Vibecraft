// Isometric projection + camera. World coords are tiles; screen is CSS pixels.
import { M_PER_TILE } from '../sim/physics';

export const TILE_W = 64;
export const TILE_H = 32;
/** Screen px that one metre of height takes at zoom 1: the baked art's own scale (its camera looks down at 30°). */
export const PX_PER_M_UP = (Math.cos(Math.PI / 6) * (TILE_W / 2) * Math.SQRT2) / M_PER_TILE;

export function isoX(x: number, y: number): number { return (x - y) * (TILE_W / 2); }
export function isoY(x: number, y: number): number { return (x + y) * (TILE_H / 2); }

export class Camera {
  /** Iso-space point at the centre of the screen. */
  cx = 0;
  cy = 0;
  zoom = 1;
  width = 800;
  height = 600;
  /** Px the ground at (x, y) is raised on screen (zoom 1), and the most it ever is. Flat until set. */
  ground: (x: number, y: number) => number = () => 0;
  maxGround = 0;

  /** Screen point of world (x, y), `z` px above the ground there. */
  toScreen(x: number, y: number, z = 0): [number, number] {
    return [
      (isoX(x, y) - this.cx) * this.zoom + this.width / 2,
      (isoY(x, y) - this.ground(x, y) - z - this.cy) * this.zoom + this.height / 2,
    ];
  }
  /**
   * The ground under a screen point. Follows the line of sight down from the highest ground there is, and stops at
   * the first ground it meets, so raised ground in front hides what's behind it.
   */
  toWorld(sx: number, sy: number): [number, number] {
    const ix = (sx - this.width / 2) / this.zoom + this.cx;
    const iy = (sy - this.height / 2) / this.zoom + this.cy;
    const a = ix / (TILE_W / 2);
    const at = (lift: number): [number, number] => { const b = (iy + lift) / (TILE_H / 2); return [(a + b) / 2, (b - a) / 2]; };
    const meets = (lift: number) => { const [x, y] = at(lift); return this.ground(x, y) >= lift; };
    const STEP = 4;
    for (let h = this.maxGround; h > 0; h -= STEP) {
      if (!meets(h)) continue;
      let lo = h, hi = Math.min(this.maxGround + 1, h + STEP); // (meets at lo, not at hi)
      for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (meets(mid)) lo = mid; else hi = mid; }
      return at(lo);
    }
    return at(0);
  }
  centerOn(x: number, y: number): void {
    this.cx = isoX(x, y);
    this.cy = isoY(x, y) - this.ground(x, y);
  }
  pan(dx: number, dy: number): void {
    this.cx += dx / this.zoom;
    this.cy += dy / this.zoom;
  }
  zoomAt(factor: number, sx: number, sy: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    this.zoom = Math.min(2.5, Math.max(0.4, this.zoom * factor));
    const [nx, ny] = this.toScreen(wx, wy);
    this.pan(nx - sx, ny - sy);
  }
  clampTo(mapW: number, mapH: number): void {
    const minX = isoX(0, mapH), maxX = isoX(mapW, 0);
    this.cx = Math.min(maxX, Math.max(minX, this.cx));
    this.cy = Math.min(isoY(mapW, mapH), Math.max(-this.maxGround, this.cy));
  }
}
