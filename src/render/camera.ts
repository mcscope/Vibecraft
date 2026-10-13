// Isometric projection + camera. World coords are tiles; screen is CSS pixels.
export const TILE_W = 64;
export const TILE_H = 32;

export function isoX(x: number, y: number): number { return (x - y) * (TILE_W / 2); }
export function isoY(x: number, y: number): number { return (x + y) * (TILE_H / 2); }

export class Camera {
  /** Iso-space point at the centre of the screen. */
  cx = 0;
  cy = 0;
  zoom = 1;
  width = 800;
  height = 600;

  toScreen(x: number, y: number, z = 0): [number, number] {
    return [
      (isoX(x, y) - this.cx) * this.zoom + this.width / 2,
      (isoY(x, y) - z - this.cy) * this.zoom + this.height / 2,
    ];
  }
  toWorld(sx: number, sy: number): [number, number] {
    const ix = (sx - this.width / 2) / this.zoom + this.cx;
    const iy = (sy - this.height / 2) / this.zoom + this.cy;
    const a = ix / (TILE_W / 2), b = iy / (TILE_H / 2);
    return [(a + b) / 2, (b - a) / 2];
  }
  centerOn(x: number, y: number): void {
    this.cx = isoX(x, y);
    this.cy = isoY(x, y);
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
    this.cy = Math.min(isoY(mapW, mapH), Math.max(0, this.cy));
  }
}
