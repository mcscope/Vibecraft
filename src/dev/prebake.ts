// Build-time page (?mode=prebake), driven by scripts/prebake.mjs: bakes each shipped faction in every team's
// colours, and each land, and hands the packed art (src/art/prebaked.ts) back to the script to save with the build.
import { PLAYABLE } from '../factions';
import { TEAM_COLORS } from '../render/artbank';
import { biomeKey, packArt, teamKey } from '../art/prebaked';

const blobToDataUrl = (b: Blob) => new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.readAsDataURL(b); });

export function runPrebake(): void {
  const jobs = new Map<string, () => Promise<unknown>>();
  jobs.set(biomeKey(null), () => import('../biomes/meadow').then((m) => m.bakeMeadow()));
  for (const f of PLAYABLE) {
    const biome = f.biome;
    if (biome) jobs.set(biomeKey(f.id), () => biome());
    const art = f.art;
    if (art) for (const team of TEAM_COLORS) jobs.set(teamKey(f.id, team), () => art(team));
  }
  Object.assign(window, {
    prebakeKeys: () => [...jobs.keys()],
    prebake: async (key: string) => {
      const { json, pages } = await packArt(await jobs.get(key)!());
      return { json, pages: await Promise.all(pages.map(blobToDataUrl)) };
    },
  });
  document.title = 'prebake ready';
}
