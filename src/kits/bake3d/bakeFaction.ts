// A faction's art: bake each of its unit and building models into contract sprites, reporting progress as it goes.
import type { FactionArt, MusicSpec, Sprite, TeamColors } from '../../art/contract';
import { Baker, type UnitBakeOptions } from './baker';
import { toBitmaps } from './bitmaps';
import type { BuildingModel, UnitModel } from './types';

export interface FactionBake<U extends { id: string; name: string; model: UnitModel }> {
  units: U[];
  buildings?: Array<{ id: string; name: string; model: BuildingModel; size: number }>;
  /** What each unit bakes (its extra animations): the same options size the progress bar. */
  opts(u: U): UnitBakeOptions;
  flag(baker: Baker): Sprite;
  wantFlag?(baker: Baker): Sprite;
  music: MusicSpec;
  /** The loading line while a unit bakes ("Mustering Macemen"). */
  label(name: string): string;
}

export async function bakeFaction<U extends { id: string; name: string; model: UnitModel }>(f: FactionBake<U>, team: TeamColors, onProgress?: (f: number, label: string) => void, only?: string[]): Promise<FactionArt> {
  const baker = new Baker();
  const units = only ? f.units.filter((u) => only.includes(u.id)) : f.units, buildings = only ? [] : (f.buildings ?? []);
  const total = units.reduce((n, u) => n + Baker.frameCount(f.opts(u)), 0) + buildings.length * 6 + 1;
  let done = 0;
  const art: FactionArt = { units: {}, buildings: {}, flag: f.flag(baker), wantFlag: f.wantFlag?.(baker), music: f.music };
  for (const u of units) {
    onProgress?.(done / total, f.label(u.name));
    art.units[u.id] = await baker.bakeUnit(u.model, team, f.opts(u), () => {
      if (++done % 24 === 0) onProgress?.(done / total, f.label(u.name));
    });
  }
  for (const b of buildings) {
    onProgress?.(done / total, `Raising the ${b.name}`);
    art.buildings[b.id] = baker.bakeBuilding(b.model, b.size, team);
    done += 6;
    await new Promise((r) => setTimeout(r, 0));
  }
  baker.dispose();
  await toBitmaps([art.flag, ...(art.wantFlag ? [art.wantFlag] : []), ...Object.values(art.buildings).flatMap((b) => [...b.construction, b.complete, ...b.damaged])]);
  return art;
}
