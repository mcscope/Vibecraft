// Fenfolk art: baked from their own models with the shared bake3d kit.
import type { FactionArt, TeamColors } from '../../art/contract';
import { Baker } from '../../kits/bake3d/baker';
import { toBitmaps } from '../../kits/bake3d/bitmaps';
import { buildings as allBuildings, units as allUnits } from './index';
import { fenBanner, fenWantFlag } from './buildings';

export async function bakeArt(team: TeamColors, onProgress?: (f: number, label: string) => void, only?: string[]): Promise<FactionArt> {
  const baker = new Baker();
  const units = only ? allUnits.filter((u) => only.includes(u.id)) : allUnits, buildings = only ? [] : allBuildings;
  const carry = (id: string) => id === 'fenling';
  const total = units.reduce((n, u) => n + Baker.frameCount({ withCarry: carry(u.id), fly: !!u.flight, brace: !!u.attack?.shaft, sidearm: !!u.attack?.sidearm }), 0) + buildings.length * 6 + 1;
  let done = 0;
  // a hushed, pentatonic, slightly unsettling marsh song
  const art: FactionArt = { units: {}, buildings: {}, flag: baker.bakeStatic(fenBanner, team), wantFlag: baker.bakeStatic(fenWantFlag, team), music: { scale: [0, 3, 5, 7, 10], root: 174.6, tempo: 84, lead: 'sine', drone: 'triangle' } };
  for (const u of units) {
    onProgress?.(done / total, `Wading in the ${u.name}s`);
    art.units[u.id] = await baker.bakeUnit(u.model, team, { withCarry: carry(u.id), fly: !!u.flight, brace: !!u.attack?.shaft, sidearm: !!u.attack?.sidearm }, () => {
      if (++done % 24 === 0) onProgress?.(done / total, `Wading in the ${u.name}s`);
    });
  }
  for (const b of buildings) {
    onProgress?.(done / total, `Raising the ${b.name}`);
    art.buildings[b.id] = baker.bakeBuilding(b.model, b.size, team);
    done += 6;
    await new Promise((r) => setTimeout(r, 0));
  }
  baker.dispose();
  await toBitmaps([art.flag, art.wantFlag!, ...Object.values(art.buildings).flatMap((b) => [...b.construction, b.complete, ...b.damaged])]);
  return art;
}
