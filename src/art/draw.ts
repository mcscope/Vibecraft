// 2D-canvas helpers for drawing contract sprites (HUD portraits, icons, terrain clutter).
import type { Sprite } from './contract';
import { cpuFrame } from './gpu';

/** Draw a sprite with its anchor at (x, y), scaled by zoom. */
export function blit(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, zoom: number, alpha = 1): void {
  const k = zoom / s.q, f = cpuFrame(s);
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(f.img, f.sx, f.sy, s.sw, s.sh, x - s.ax * k, y - s.ay * k, s.sw * k, s.sh * k);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

/** Fit a sprite into a size×size canvas, anchored low (top-bar icons). */
export function spriteToCanvas(s: Sprite, size: number, crop = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const k = Math.min(size / s.sw, size / s.sh) * crop, f = cpuFrame(s);
  ctx.drawImage(f.img, f.sx, f.sy, s.sw, s.sh, size / 2 - s.ax * k, size * 0.85 - s.ay * k, s.sw * k, s.sh * k);
  return c;
}

/** A sprite cropped to its visible pixels and fitted into a size×size canvas (button art). */
export function spriteIcon(s: Sprite, size: number, pad = 0.04): HTMLCanvasElement {
  const src = document.createElement('canvas');
  src.width = s.sw; src.height = s.sh;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  const f = cpuFrame(s);
  sctx.drawImage(f.img, f.sx, f.sy, s.sw, s.sh, 0, 0, s.sw, s.sh);
  const d = sctx.getImageData(0, 0, s.sw, s.sh).data;
  let x0 = s.sw, y0 = s.sh, x1 = -1, y1 = -1;
  // ignore faint shadow pixels so the subject fills the icon
  for (let y = 0; y < s.sh; y++) for (let x = 0; x < s.sw; x++) {
    const i = (y * s.sw + x) * 4;
    if (d[i + 3] > 200 || (d[i + 3] > 40 && d[i] + d[i + 1] + d[i + 2] > 60)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  if (x1 < 0) return c;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const k = (size * (1 - 2 * pad)) / Math.max(w, h);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x0, y0, w, h, (size - w * k) / 2, size - pad * size - h * k, w * k, h * k);
  return c;
}
