// Bakes and holds every sprite a match needs.
import type { TeamColors, UnitSpec } from '../factions/types';
import type { World } from '../sim/world';
import { Baker, type Sprite, type UnitSheet } from './bake/baker';
import * as scenery from './bake/scenery';

export const TEAM_COLORS: TeamColors[] = [
  { primary: '#2f5fbf', secondary: '#e8c547', dark: '#1a3366' },
  { primary: '#b8322b', secondary: '#e6dcc4', dark: '#5e1814' },
  { primary: '#6a3fa0', secondary: '#e8c547', dark: '#3a2060' },
  { primary: '#2f8a4a', secondary: '#e6dcc4', dark: '#174a26' },
];

export const TREE_VARIANTS = 16;
export const BUSH_LEVELS = 4;
export const MINE_LEVELS = 4;

export class SpriteBank {
  private units = new Map<string, UnitSheet>();
  trees: Sprite[] = [];
  bushes: Sprite[] = [];
  mines: Sprite[] = [];
  shard!: Sprite;
  projectile!: Sprite;
  private buildings = new Map<string, Sprite>();
  flags: Sprite[] = [];
  /** Ground clutter painted into the terrain. */
  doodads: Record<keyof typeof scenery.DOODADS, Sprite[]> = { grass: [], flowers: [], stones: [], forest: [] };

  building(owner: number, specId: string): Sprite | undefined {
    return this.buildings.get(`${owner}/${specId}`);
  }

  /** Every image the renderer may draw from. */
  allImages(): CanvasImageSource[] {
    const out: CanvasImageSource[] = [];
    for (const s of this.units.values()) out.push(...s.sources());
    for (const sp of [...this.trees, ...this.bushes, ...this.mines, this.shard, this.projectile, ...this.buildings.values(), ...this.flags]) out.push(sp.img);
    return out;
  }

  unit(owner: number, specId: string): UnitSheet | undefined {
    return this.units.get(`${owner}/${specId}`);
  }

  /** Bake everything for this world. `onProgress` gets 0..1. */
  static async build(world: World, onProgress: (f: number, label: string) => void): Promise<SpriteBank> {
    const bank = new SpriteBank();
    const baker = new Baker();
    const neutral = TEAM_COLORS[0];
    const jobs: Array<{ owner: number; spec: UnitSpec; carry: boolean }> = [];
    for (const p of world.players) {
      const f = world.factionOf(p.id);
      for (const spec of f.units) jobs.push({ owner: p.id, spec, carry: (spec.id === f.workerId || spec.role === 'carter') && !spec.dummy });
    }
    const buildingCount = world.players.reduce((n, p) => n + (world.factionOf(p.id).buildings?.length ?? 0), 0);
    const doodadCount = Object.values(scenery.DOODADS).reduce((n, l) => n + l.length, 0);
    const staticCount = TREE_VARIANTS + BUSH_LEVELS + MINE_LEVELS + 2 + world.players.length + buildingCount + doodadCount;
    const total = jobs.reduce((n, j) => n + Baker.frameCount(j.spec, j.carry), 0) + staticCount;
    let done = 0;
    const tick = () => { done++; };
    const yieldNow = () => new Promise((r) => setTimeout(r, 0));

    onProgress(0, 'Raising the scenery');
    for (let i = 0; i < TREE_VARIANTS; i++) { bank.trees.push(baker.bakeStatic((b) => scenery.tree(b, i), neutral)); tick(); }
    for (let i = 0; i < BUSH_LEVELS; i++) { bank.bushes.push(baker.bakeStatic((b) => scenery.bush(b, i / (BUSH_LEVELS - 1)), neutral)); tick(); }
    for (let i = 0; i < MINE_LEVELS; i++) { bank.mines.push(baker.bakeStatic((b) => scenery.mine(b, i / (MINE_LEVELS - 1)), neutral)); tick(); }
    for (const [k, list] of Object.entries(scenery.DOODADS) as Array<[keyof typeof scenery.DOODADS, Array<(b: import('../factions/types').ModelBuilder) => void>]>) {
      for (const m of list) { bank.doodads[k].push(baker.bakeStatic(m, neutral)); tick(); }
    }
    bank.shard = baker.bakeStatic(scenery.shard, neutral); tick();
    bank.projectile = baker.bakeStatic(scenery.projectile, neutral, false); tick();
    for (const p of world.players) {
      const team = TEAM_COLORS[p.id % TEAM_COLORS.length];
      for (const b of world.factionOf(p.id).buildings ?? []) {
        bank.buildings.set(`${p.id}/${b.id}`, baker.bakeStatic(b.model, team)); tick();
        onProgress(done / total, `Raising ${b.name}`);
        await yieldNow();
      }
      bank.flags.push(baker.bakeStatic(scenery.rallyFlag, team)); tick();
    }
    for (const j of jobs) {
      const team = TEAM_COLORS[j.owner % TEAM_COLORS.length];
      onProgress(done / total, `Mustering ${j.spec.name}`);
      const sheet = await baker.bakeUnit(j.spec, team, j.carry, () => {
        tick();
        if (done % 24 === 0) onProgress(done / total, `Mustering ${j.spec.name}`);
      });
      bank.units.set(`${j.owner}/${j.spec.id}`, sheet);
    }
    baker.dispose();
    // Move static sprites to the GPU too.
    for (const sp of [...bank.trees, ...bank.bushes, ...bank.mines, bank.shard, bank.projectile, ...bank.buildings.values(), ...bank.flags]) {
      sp.img = await createImageBitmap(sp.img as HTMLCanvasElement);
    }
    onProgress(1, 'Ready');
    return bank;
  }
}

/** A sprite cropped to its visible pixels and fitted into a size×size canvas (button art). */
export function spriteIcon(s: Sprite, size: number, pad = 0.04): HTMLCanvasElement {
  const src = document.createElement('canvas');
  src.width = s.sw; src.height = s.sh;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, 0, 0, s.sw, s.sh);
  const d = sctx.getImageData(0, 0, s.sw, s.sh).data;
  let x0 = s.sw, y0 = s.sh, x1 = -1, y1 = -1;
  // ignore faint shadow pixels so the subject fills the icon
  for (let y = 0; y < s.sh; y++) for (let x = 0; x < s.sw; x++) {
    const i = (y * s.sw + x) * 4;
    if (d[i + 3] > 200 || (d[i + 3] > 40 && d[i] + d[i + 1] + d[i + 2] > 60)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  if (x1 < 0) return c;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const k = (size * (1 - 2 * pad)) / Math.max(w, h);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x0, y0, w, h, (size - w * k) / 2, size - pad * size - h * k, w * k, h * k);
  return c;
}

/** Crop a sprite into a standalone canvas (for HUD icons / portraits). */
export function spriteToCanvas(s: Sprite, size: number, crop = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const k = Math.min(size / s.sw, size / s.sh) * crop;
  ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, size / 2 - s.ax * k, size * 0.85 - s.ay * k, s.sw * k, s.sh * k);
  return c;
}
