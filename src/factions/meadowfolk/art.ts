// Meadowfolk art: bake every unit and building model into contract sprites.
import type { FactionArt, TeamColors, UnitArt } from '../../art/contract';
import { Baker } from '../../kits/bake3d/baker';
import { toBitmaps } from '../../kits/bake3d/bitmaps';
import { buildings, units } from './index';
import { rallyFlag } from './buildings';

/** Voices for the default sound design (pitch drops with size anyway; these add character). */
const VOICES: Record<string, UnitArt['sounds']> = {
  villager: { voice: { vowel: 'o', timbre: 'triangle' } },
  slinger: { voice: { vowel: 'e', timbre: 'square' } },
  maceman: { voice: { vowel: 'a', timbre: 'saw' } },
  lynx: { voice: { vowel: 'a', timbre: 'saw', pitch: 160 } },
  hurlhorn: { voice: { vowel: 'u', timbre: 'saw', pitch: 70 } },
  mule: { voice: { vowel: 'i', timbre: 'square', pitch: 260 } },
};

export async function bakeArt(team: TeamColors, onProgress?: (f: number, label: string) => void): Promise<FactionArt> {
  const baker = new Baker();
  const carry = (id: string) => id === 'villager' || id === 'mule';
  const total = units.reduce((n, u) => n + Baker.frameCount({ withCarry: carry(u.id) }), 0) + buildings.length * 6 + 1;
  let done = 0;
  const art: FactionArt = { units: {}, buildings: {}, flag: baker.bakeStatic(rallyFlag, team), music: { scale: [0, 2, 3, 5, 7, 9, 10], root: 146.8, tempo: 76, lead: 'triangle', drone: 'saw' } };
  for (const u of units) {
    onProgress?.(done / total, `Mustering ${u.name}`);
    art.units[u.id] = await baker.bakeUnit(u.model, team, { withCarry: carry(u.id) }, () => {
      if (++done % 24 === 0) onProgress?.(done / total, `Mustering ${u.name}`);
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
