// New faction art: baked from its own models with the shared bake3d kit. No buildings.
import type { FactionArt, TeamColors } from '../../art/contract';
import { Baker } from '../../kits/bake3d/baker';
import { toBitmaps } from '../../kits/bake3d/bitmaps';
import { caterpillarSegments, units as allUnits } from './index';

export async function bakeArt(team: TeamColors, onProgress?: (f: number, label: string) => void, only?: string[]): Promise<FactionArt> {
  const baker = new Baker();
  const units = only ? allUnits.filter((u) => only.includes(u.id)) : allUnits;
  const carry = (id: string) => id.startsWith('larva') || id.startsWith('mother');
  const opts = (u: (typeof allUnits)[number]) => ({ withCarry: carry(u.id), fly: !!u.flight, brace: !!u.attack?.shaft, ownLeap: u.id === 'flier', rises: u.id === 'charger' || u.id === 'ground-attacker3', segments: u.id.startsWith('larva') ? caterpillarSegments(u.mass) : undefined });
  const total = units.reduce((n, u) => n + Baker.frameCount(opts(u)), 0) + 1;
  let done = 0;
  // PLACEHOLDER flag: an egg; PLACEHOLDER music
  const flag = baker.bakeStatic((b) => b.cylinder(0, 0.2, 0.3, [0, 0.35, 0], { team: 'primary', tex: 'none' }, undefined, 5), team);
  const art: FactionArt = { units: {}, buildings: {}, flag, music: { scale: [0, 2, 3, 7, 8], root: 196, tempo: 76, lead: 'triangle', drone: 'sine' } };
  for (const u of units) {
    onProgress?.(done / total, `Hatching the ${u.name}s`);
    art.units[u.id] = await baker.bakeUnit(u.model, team, opts(u), () => {
      if (++done % 24 === 0) onProgress?.(done / total, `Hatching the ${u.name}s`);
    });
  }
  baker.dispose();
  await toBitmaps([art.flag]);
  return art;
}
