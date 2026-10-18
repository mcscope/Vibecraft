// Pre-baked art: a faction's or biome's baked sprites, saved at build time (scripts/prebake.mjs) as WebP pages
// plus a JSON of everything else, so a production build loads its shipped factions instead of baking them on
// every visit. Any art works: each sprite's image becomes an index into the pages; the rest is plain data.
import type { TeamColors } from './contract';

/** The file a baked art is saved under: a faction in a team's colours, or a faction's land. */
export const teamKey = (factionId: string, team: TeamColors): string => `${factionId}.${[team.primary, team.secondary, team.dark].map((c) => c.replace('#', '')).join('-')}`;
export const biomeKey = (factionId: string | null): string => `biome.${factionId ?? 'default'}`;

const isSprite = (o: unknown): o is { img: CanvasImageSource } => !!o && typeof o === 'object' && 'img' in o && 'sx' in o;

/** Split baked art into JSON (sprites' images replaced by page indexes) and the page images, as WebP (alpha kept, a fraction of PNG's size). */
export async function packArt(art: unknown): Promise<{ json: string; pages: Blob[] }> {
  const pages: CanvasImageSource[] = [];
  const index = new Map<CanvasImageSource, number>();
  const json = JSON.stringify(art, (_k, v) => {
    if (!isSprite(v)) return v;
    let i = index.get(v.img);
    if (i === undefined) { i = pages.length; index.set(v.img, i); pages.push(v.img); }
    return { ...v, img: i };
  });
  const blobs = await Promise.all(pages.map((img) => {
    const { width, height } = img as ImageBitmap;
    const c = new OffscreenCanvas(width, height);
    c.getContext('2d')!.drawImage(img, 0, 0);
    return c.convertToBlob({ type: 'image/webp', quality: 0.9 });
  }));
  return { json, pages: blobs };
}

/** Load art saved by packArt from `base/<key>.json` and `base/<key>.<page>.webp`; null if there's none. */
export async function loadPrebaked<T>(key: string, base = 'baked'): Promise<T | null> {
  try {
    const res = await fetch(`${base}/${key}.json`);
    if (!res.ok) return null;
    const { pages, art } = (await res.json()) as { pages: number; art: unknown };
    const imgs = await Promise.all(Array.from({ length: pages }, async (_, i) => createImageBitmap(await (await fetch(`${base}/${key}.${i}.webp`)).blob())));
    const revive = (o: unknown): unknown => {
      if (Array.isArray(o)) return o.map(revive);
      if (!o || typeof o !== 'object') return o;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) out[k] = revive(v);
      if ('img' in out && 'sx' in out && typeof out.img === 'number') out.img = imgs[out.img];
      return out;
    };
    return revive(art) as T;
  } catch {
    return null; // not pre-baked (a custom faction, or dev): bake it here
  }
}
