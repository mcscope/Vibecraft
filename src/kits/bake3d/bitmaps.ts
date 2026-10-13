import type { Sprite } from '../../art/contract';

/** GPU-friendly images: plain canvases get re-uploaded every draw. */
export async function toBitmaps(sprites: Sprite[]): Promise<void> {
  const done = new Map<CanvasImageSource, ImageBitmap>();
  for (const s of sprites) {
    if (s.img instanceof ImageBitmap) continue;
    let b = done.get(s.img);
    if (!b) done.set(s.img, (b = await createImageBitmap(s.img as HTMLCanvasElement)));
    s.img = b;
  }
}
