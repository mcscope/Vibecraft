// Meadowfolk art: bake every unit and building model into contract sprites.
import type { FactionArt, TeamColors } from '../../art/contract';
import { Baker } from '../../kits/bake3d/baker';
import { toBitmaps } from '../../kits/bake3d/bitmaps';
import { VOICES } from './voices';
import { buildings as allBuildings, units as allUnits } from './index';
import { rallyFlag, wantFlag } from './buildings';

export async function bakeArt(team: TeamColors, onProgress?: (f: number, label: string) => void, only?: string[]): Promise<FactionArt> {
  const baker = new Baker();
  const units = only ? allUnits.filter((u) => only.includes(u.id)) : allUnits, buildings = only ? [] : allBuildings;
  const carry = (id: string) => id === 'villager' || id === 'mule';
  const total = units.reduce((n, u) => n + Baker.frameCount({ withCarry: carry(u.id), brace: !!u.attack?.shaft, sidearm: !!u.attack?.sidearm }), 0) + buildings.length * 6 + 1;
  let done = 0;
  const art: FactionArt = { units: {}, buildings: {}, flag: baker.bakeStatic(rallyFlag, team), wantFlag: baker.bakeStatic(wantFlag, team), music: { scale: [0, 2, 3, 5, 7, 9, 10], root: 146.8, tempo: 76, lead: 'triangle', drone: 'saw' } };
  for (const u of units) {
    onProgress?.(done / total, `Mustering ${u.name}`);
    art.units[u.id] = await baker.bakeUnit(u.model, team, { withCarry: carry(u.id), brace: !!u.attack?.shaft, sidearm: !!u.attack?.sidearm }, () => {
      if (++done % 24 === 0) onProgress?.(done / total, `Mustering ${u.name}`);
    });
    art.units[u.id].sounds = { voices: VOICES[u.id] };
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
