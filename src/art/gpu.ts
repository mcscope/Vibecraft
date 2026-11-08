// GPU-only sprite pages. A page loaded compressed (KTX2: art/prebaked.ts) lives only on the GPU, as a renderer
// texture; its sprites' `img` is a 1×1 stand-in canvas that maps to that texture. The renderer draws from the texture
// (render/renderer.ts). 2D-canvas code (HUD portraits, icons) draws the art's stills instead, which stay images.

const pages = new WeakMap<object, unknown>();

/** A stand-in `img` for a page that lives on the GPU as `texture` (a renderer texture source). */
export function gpuPage(texture: unknown): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  pages.set(c, texture);
  return c;
}

/** The GPU texture behind a stand-in `img`, or undefined for an ordinary image. */
export const gpuTexture = (img: CanvasImageSource): unknown => pages.get(img as object);
