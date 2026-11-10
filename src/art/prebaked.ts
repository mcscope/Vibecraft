// Pre-baked art: a faction's or biome's baked sprites, saved at build time (scripts/prebake.mjs) as WebP pages
// plus a JSON of everything else, so a production build loads its shipped factions instead of baking them on
// every visit. Any art works: each sprite's image becomes an index into the pages; the rest is plain data.
import { unitSprite, type FactionArt, type Sprite, type TeamColors } from './contract';
import { gpuPage } from './gpu';

/** The file a baked art is saved under: a faction in a team's colours, or a faction's land. */
export const teamKey = (factionId: string, team: TeamColors): string => `${factionId}.${[team.primary, team.secondary, team.dark].map((c) => c.replace('#', '')).join('-')}`;
export const biomeKey = (factionId: string | null): string => `biome.${factionId ?? 'default'}`;

const isSprite = (o: unknown): o is { img: CanvasImageSource } => !!o && typeof o === 'object' && 'img' in o && 'sx' in o;

/**
 * Give each unit and building of a faction its still (UnitArt.still: its idle frame facing down-right, its finished
 * look), copied onto pages of their own, which a build keeps as images for portraits and icons.
 */
export function addStills(art: FactionArt): FactionArt {
  const items: Array<{ owner: { still?: Sprite }; s: Sprite }> = [
    ...Object.values(art.units).map((u) => ({ owner: u, s: unitSprite(u, 'idle', 1, { time: 0 }) })),
    ...Object.values(art.buildings).map((b) => ({ owner: b, s: b.complete })),
  ];
  // shelves on 2048-wide pages
  const W = 2048, pad = 2;
  let page: OffscreenCanvas | null = null, x = 0, y = 0, row = 0;
  const pages: Array<{ c: OffscreenCanvas; h: number }> = [];
  const placed: Array<{ owner: { still?: Sprite }; s: Sprite; p: number; x: number; y: number }> = [];
  for (const it of items) {
    if (!page || x + it.s.sw > W) { x = 0; y += row + pad; row = 0; }
    if (!page || y + it.s.sh > W) { page = new OffscreenCanvas(W, W); pages.push({ c: page, h: 0 }); x = y = row = 0; }
    page.getContext('2d')!.drawImage(it.s.img, it.s.sx, it.s.sy, it.s.sw, it.s.sh, x, y, it.s.sw, it.s.sh);
    placed.push({ ...it, p: pages.length - 1, x, y });
    pages[pages.length - 1].h = Math.max(pages[pages.length - 1].h, y + it.s.sh);
    x += it.s.sw + pad; row = Math.max(row, it.s.sh);
  }
  // trim each page to what it holds
  const imgs = pages.map(({ c, h }) => { const t = new OffscreenCanvas(W, Math.max(1, h)); t.getContext('2d')!.drawImage(c, 0, 0); return t; });
  for (const { owner, s, p, x, y } of placed) owner.still = { ...s, img: imgs[p], sx: x, sy: y };
  return art;
}

/**
 * Split baked art into JSON (sprites' images replaced by page indexes) and the page images, as WebP (alpha kept, a
 * fraction of PNG's size). `cpu`: the pages holding stills, which stay images when the rest go to the GPU.
 */
export async function packArt(art: unknown): Promise<{ json: string; pages: Blob[]; cpu: number[] }> {
  const pages: CanvasImageSource[] = [];
  const index = new Map<CanvasImageSource, number>();
  const cpu = new Set<number>();
  const json = JSON.stringify(art, (k, v) => {
    if (!isSprite(v)) return v;
    let i = index.get(v.img);
    if (i === undefined) { i = pages.length; index.set(v.img, i); pages.push(v.img); }
    if (k === 'still') cpu.add(i);
    return { ...v, img: i };
  });
  const blobs = await Promise.all(pages.map((img) => {
    const { width, height } = img as ImageBitmap;
    const c = new OffscreenCanvas(width, height);
    c.getContext('2d')!.drawImage(img, 0, 0);
    return c.convertToBlob({ type: 'image/webp', quality: 0.9 });
  }));
  return { json, pages: blobs, cpu: [...cpu] };
}

/** Rebuild art packed by packArt from its JSON and its page images. */
export async function unpackArt<T>(art: unknown, pages: Blob[]): Promise<T> {
  return reviveArt<T>(art, await Promise.all(pages.map((b) => createImageBitmap(b))));
}

/** Packed art with its page indexes swapped for the page images. */
function reviveArt<T>(art: unknown, imgs: CanvasImageSource[]): T {
  const revive = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(revive);
    if (!o || typeof o !== 'object') return o;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = revive(v);
    if ('img' in out && 'sx' in out && typeof out.img === 'number') out.img = imgs[out.img];
    return out;
  };
  return revive(art) as T;
}

/** Art saved by packArt with only its stills' pages loaded (a few images, for menus): its other sprites have no image. */
export async function loadPrebakedStills<T>(key: string, base = 'baked'): Promise<T | null> {
  try {
    const res = await fetch(`${base}/${key}.json`);
    if (!res.ok) return null;
    const { art, cpu = [] } = (await res.json()) as { art: unknown; cpu?: number[] };
    const imgs: CanvasImageSource[] = [];
    await Promise.all(cpu.map(async (i) => { imgs[i] = await createImageBitmap(await (await fetch(`${base}/${key}.${i}.webp`)).blob()); }));
    return reviveArt<T>(art, imgs);
  } catch {
    return null;
  }
}

/**
 * Load art saved by packArt from `base/<key>.json` and `base/<key>.<page>.webp`; null if there's none. With
 * `gpuLoad` and the pages also saved compressed (`ktx2`, scripts/ktx2.mjs), the pages go straight to the GPU
 * compressed instead (art/gpu.ts), all but the stills' (`cpu`), falling back to the WebP pages if that fails.
 */
export async function loadPrebaked<T>(key: string, base = 'baked', gpuLoad?: (url: string) => Promise<unknown>): Promise<T | null> {
  try {
    const res = await fetch(`${base}/${key}.json`);
    if (!res.ok) return null;
    const { pages, art, ktx2, cpu = [] } = (await res.json()) as { pages: number; art: unknown; ktx2?: boolean; cpu?: number[] };
    const webp = async (i: number) => (await fetch(`${base}/${key}.${i}.webp`)).blob();
    if (ktx2 && gpuLoad) {
      try {
        // the stills' pages stay images (2D canvases draw them)
        const imgs = await Promise.all(Array.from({ length: pages }, async (_, i) => cpu.includes(i) ? createImageBitmap(await webp(i)) : gpuPage(await gpuLoad(`${base}/${key}.${i}.ktx2`))));
        return reviveArt<T>(art, imgs);
      } catch (e) {
        console.warn(`compressed art for ${key} failed, loading WebP`, e);
      }
    }
    const blobs = await Promise.all(Array.from({ length: pages }, (_, i) => webp(i)));
    return await unpackArt<T>(art, blobs);
  } catch {
    return null; // not pre-baked (a custom faction, or dev): bake it here
  }
}
