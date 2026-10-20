// GPU-only sprite pages. A page loaded compressed (KTX2: art/prebaked.ts) lives only on the GPU, as a renderer
// texture; its sprites' `img` is a 1×1 stand-in canvas that maps to that texture. The renderer draws from the texture
// (render/renderer.ts); 2D-canvas code that needs a sprite's pixels (HUD icons, portraits: art/draw.ts) asks for the
// frame, which is read back from the GPU once and kept.
import type { Sprite } from './contract';

const pages = new WeakMap<object, unknown>();

/** A stand-in `img` for a page that lives on the GPU as `texture` (a renderer texture source). */
export function gpuPage(texture: unknown): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  pages.set(c, texture);
  return c;
}

/**
 * From now on `img` lives only on the GPU, as `texture` (already uploaded): its pixels in memory are let go (a canvas
 * shrinks to 1×1, a bitmap is closed), and 2D-canvas code reads its frames back like a compressed page's. Holding every
 * sprite page twice, in memory and on the GPU, starved the browser for the first half-minute of a game.
 */
export function keepOnGpu(img: CanvasImageSource, texture: unknown): void {
  if (pages.has(img as object)) return;
  pages.set(img as object, texture);
  if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) img.close();
  else if (img instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas)) img.width = img.height = 1;
}

/** The GPU texture behind a stand-in `img`, or undefined for an ordinary image. */
export const gpuTexture = (img: CanvasImageSource): unknown => pages.get(img as object);

type FrameReader = (texture: unknown, x: number, y: number, w: number, h: number) => CanvasImageSource;
let reader: FrameReader | null = null;
/** The renderer reads frames back from its GPU (set once it's up). */
export function setFrameReader(r: FrameReader): void { reader = r; }

const frames = new WeakMap<object, Map<string, CanvasImageSource>>();
/** Where to draw `s` from on a 2D canvas: its page as it is, or (a GPU page) the frame read back from the GPU. */
export function cpuFrame(s: Sprite): { img: CanvasImageSource; sx: number; sy: number } {
  const tex = gpuTexture(s.img);
  if (tex === undefined || !reader) return { img: s.img, sx: s.sx, sy: s.sy };
  let byRect = frames.get(s.img as object);
  if (!byRect) frames.set(s.img as object, (byRect = new Map()));
  const key = `${s.sx},${s.sy},${s.sw},${s.sh}`;
  let img = byRect.get(key);
  if (!img) byRect.set(key, (img = reader(tex, s.sx, s.sy, s.sw, s.sh)));
  return { img, sx: 0, sy: 0 };
}
