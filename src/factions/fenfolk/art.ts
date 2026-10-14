// Fenfolk art: baked from their own models with the shared bake3d kit.
import type { FactionArt, TeamColors, UnitArt } from '../../art/contract';
import { Baker } from '../../kits/bake3d/baker';
import { toBitmaps } from '../../kits/bake3d/bitmaps';
import { buildings, units } from './index';
import { fenBanner } from './buildings';

/** High, chirping voices; the toad croaks. */
const VOICES: Record<string, UnitArt['sounds']> = {
  fenling: { voice: { vowel: 'i', timbre: 'triangle', pitch: 330 } },
  reedguard: { voice: { vowel: 'e', timbre: 'square', pitch: 240 } },
  'bog-toad': { voice: { vowel: 'o', timbre: 'square', pitch: 60 } },
};

export async function bakeArt(team: TeamColors, onProgress?: (f: number, label: string) => void): Promise<FactionArt> {
  const baker = new Baker();
  const carry = (id: string) => id === 'fenling';
  const total = units.reduce((n, u) => n + Baker.frameCount({ withCarry: carry(u.id) }), 0) + buildings.length * 6 + 1;
  let done = 0;
  // a hushed, pentatonic, slightly unsettling marsh song
  const art: FactionArt = { units: {}, buildings: {}, flag: baker.bakeStatic(fenBanner, team), music: { scale: [0, 3, 5, 7, 10], root: 174.6, tempo: 84, lead: 'sine', drone: 'triangle' } };
  for (const u of units) {
    onProgress?.(done / total, `Wading in the ${u.name}s`);
    art.units[u.id] = await baker.bakeUnit(u.model, team, { withCarry: carry(u.id) }, () => {
      if (++done % 24 === 0) onProgress?.(done / total, `Wading in the ${u.name}s`);
    });
    art.units[u.id].sounds = VOICES[u.id];
  }
  for (const b of buildings) {
    onProgress?.(done / total, `Raising the ${b.name}`);
    art.buildings[b.id] = baker.bakeBuilding(b.model, b.size, team);
    done += 6;
    await new Promise((r) => setTimeout(r, 0));
  }
  baker.dispose();
  await toBitmaps([art.flag, ...Object.values(art.buildings).flatMap((b) => [...b.construction, b.complete, ...b.damaged])]);
  return art;
}
