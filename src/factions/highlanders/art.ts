// Highland Clans art: baked from their own models with the shared bake3d kit.
import type { FactionArt, TeamColors, UnitArt } from '../../art/contract';
import { Baker } from '../../kits/bake3d/baker';
import { toBitmaps } from '../../kits/bake3d/bitmaps';
import { buildings, units } from './index';
import { clanBanner, clanWantFlag } from './buildings';

/** Lower, rougher voices than the Meadowfolk. */
const VOICES: Record<string, UnitArt['sounds']> = {
  crofter: { voice: { vowel: 'o', timbre: 'saw', pitch: 150 } },
  javelineer: { voice: { vowel: 'e', timbre: 'saw' } },
  axeman: { voice: { vowel: 'a', timbre: 'square', pitch: 95 } },
  'ram-rider': { voice: { vowel: 'u', timbre: 'saw', pitch: 85 } },
  'pony-cart': { voice: { vowel: 'i', timbre: 'triangle', pitch: 300 } },
};

export async function bakeArt(team: TeamColors, onProgress?: (f: number, label: string) => void): Promise<FactionArt> {
  const baker = new Baker();
  const carry = (id: string) => id === 'crofter' || id === 'pony-cart';
  const total = units.reduce((n, u) => n + Baker.frameCount({ withCarry: carry(u.id) }), 0) + buildings.length * 6 + 1;
  let done = 0;
  // a slower, modal (mixolydian) march with a drone: pipes and drums
  const art: FactionArt = { units: {}, buildings: {}, flag: baker.bakeStatic(clanBanner, team), wantFlag: baker.bakeStatic(clanWantFlag, team), music: { scale: [0, 2, 4, 5, 7, 9, 10], root: 116.5, tempo: 68, lead: 'square', drone: 'saw' } };
  for (const u of units) {
    onProgress?.(done / total, `Gathering the ${u.name}s`);
    art.units[u.id] = await baker.bakeUnit(u.model, team, { withCarry: carry(u.id) }, () => {
      if (++done % 24 === 0) onProgress?.(done / total, `Gathering the ${u.name}s`);
    });
    art.units[u.id].sounds = VOICES[u.id];
  }
  for (const b of buildings) {
    onProgress?.(done / total, `Building the ${b.name}`);
    art.buildings[b.id] = baker.bakeBuilding(b.model, b.size, team);
    done += 6;
    await new Promise((r) => setTimeout(r, 0));
  }
  baker.dispose();
  await toBitmaps([art.flag, art.wantFlag!, ...Object.values(art.buildings).flatMap((b) => [...b.construction, b.complete, ...b.damaged])]);
  return art;
}
