// Holds the finished art for a match: each player's FactionArt (from their
// faction's own loader) and the map's BiomeArt. The engine draws only this.
import type { BiomeArt, BiomeLoader, BuildingArt, FactionArt, Sprite, TeamColors, UnitArt } from '../art/contract';
import type { World } from '../sim/world';
import type { FactionSpec } from '../factions/types';
import { PLAYABLE } from '../factions';
import { biomeKey, loadPrebaked, loadPrebakedStills, teamKey } from '../art/prebaked';
import { unitSprite } from '../art/contract';
import { cacheArt, cachedArt } from '../art/devCache';
import { loadGpuPage } from './gpuPages';

/**
 * A shipped faction's art (or its land's) as pre-baked for a production build (scripts/prebake.mjs); null to bake it
 * here. A faction's pages go to the GPU compressed where they were encoded (scripts/ktx2.mjs); a land's stay images
 * (the ground painter draws them on the CPU).
 */
const prebaked = <T>(f: FactionSpec | null, key: string, gpu = false): Promise<T | null> =>
  import.meta.env.PROD && (!f || PLAYABLE.includes(f)) ? loadPrebaked<T>(key, 'baked', gpu ? loadGpuPage : undefined) : Promise.resolve(null);

/** Add these units and buildings to `have`: from the dev cache, or baked now and cached, each on its own. */
async function bakeInto(f: FactionSpec, team: TeamColors, have: Pick<FactionArt, 'units' | 'buildings'>, ids: string[]): Promise<void> {
  const key = (id: string) => `${teamKey(f.id, team)}.${id}`, bake: string[] = [];
  for (const id of ids) {
    const got = await cachedArt<FactionArt>(f.id, key(id));
    if (got) { Object.assign(have.units, got.units); Object.assign(have.buildings, got.buildings); } else bake.push(id);
  }
  if (!bake.length || !f.art) return;
  const baked = await f.art(team, undefined, bake);
  Object.assign(have.units, baked.units); Object.assign(have.buildings, baked.buildings);
  for (const id of bake) cacheArt(f.id, key(id), { ...baked, units: baked.units[id] ? { [id]: baked.units[id] } : {}, buildings: baked.buildings[id] ? { [id]: baked.buildings[id] } : {} });
}

/**
 * Pictures of some of a faction's units in a team's colours, for menus. A build loads just the saved stills; dev
 * bakes the units asked for (and keeps them for the game).
 */
export async function unitStills(f: FactionSpec, team: TeamColors, ids: string[]): Promise<Map<string, Sprite>> {
  let art: Pick<FactionArt, 'units' | 'buildings'> | null = import.meta.env.PROD && PLAYABLE.includes(f) ? await loadPrebakedStills<FactionArt>(teamKey(f.id, team)) : null;
  if (!art) { art = { units: {}, buildings: {} }; await bakeInto(f, team, art, ids); }
  const out = new Map<string, Sprite>();
  for (const id of ids) { const u = art.units[id]; if (u) out.set(id, u.still ?? unitSprite(u, 'idle', 1, { time: 0 })); }
  return out;
}

/** The Wilds' colours (selection rings, minimap dots). */
export const WILD_COLORS: TeamColors = { primary: '#8a6a3a', secondary: '#d8c08a', dark: '#4a3a20' };

/** A player's colours (the Wilds get their own neutral ones). */
export function teamColor(world: World, owner: number): TeamColors {
  return world.players[owner]?.neutral ? WILD_COLORS : TEAM_COLORS[owner % TEAM_COLORS.length];
}

export const TEAM_COLORS: TeamColors[] = [
  { primary: '#2f5fbf', secondary: '#e8c547', dark: '#1a3366' },
  { primary: '#b8322b', secondary: '#e6dcc4', dark: '#5e1814' },
  { primary: '#6a3fa0', secondary: '#e8c547', dark: '#3a2060' },
  { primary: '#2f8a4a', secondary: '#e6dcc4', dark: '#174a26' },
];

export type { BiomeLoader };

export class ArtBank {
  /**
   * @param biomes each player's biome (their half of the map); `biome` is the
   *   map default (shards, projectiles, and any player without its own).
   */
  private constructor(readonly factions: FactionArt[], readonly biome: BiomeArt, readonly biomes: BiomeArt[], private readonly world: World, private readonly teams: TeamColors[]) {}

  /** A bank that bakes a player's units and buildings as they're first needed (dev, and `only`). */
  private lazy = new Set<number>();
  private asked = new Set<string>();
  private wanted = new Map<number, string[]>(); // (asked for this frame: baked together)
  private queue: Promise<void> = Promise.resolve();

  /**
   * Bake any of these units and buildings a player's art doesn't have yet, each cached on its own (dev). One at a
   * time: a bank built lazily fills in as things are first needed.
   */
  ensure(owner: number, ids: string[]): Promise<void> {
    const f = this.world.factionOf(owner), have = this.factions[owner], art = f.art;
    const own = (id: string) => f.units.some((u) => u.id === id) || (f.buildings ?? []).some((b) => b.id === id);
    const missing = () => ids.filter((id) => own(id) && !have.units[id] && !have.buildings[id]);
    if (!art || !missing().length) return Promise.resolve();
    const job = this.queue.then(() => bakeInto(f, this.teams[owner], have, missing()));
    this.queue = job.catch((e) => console.error('baking', ids, e));
    return job;
  }
  /** In a lazy bank, start baking a player's unit or building the first time it's asked for. */
  private want(owner: number, id: string): void {
    if (!this.lazy.has(owner) || this.asked.has(`${owner}:${id}`)) return;
    this.asked.add(`${owner}:${id}`);
    const ids = this.wanted.get(owner);
    if (ids) { ids.push(id); return; }
    this.wanted.set(owner, [id]);
    setTimeout(() => { const all = this.wanted.get(owner)!; this.wanted.delete(owner); void this.ensure(owner, all); }, 0);
  }

  /** The biome whose half of the map a point is in. */
  biomeAt(x: number, y: number): BiomeArt {
    return this.biomes[this.world.territory(x, y)] ?? this.biome;
  }

  /** A unit's art; a tamed animal (sim/abilities/herding.ts) keeps its wild look. */
  unit(owner: number, id: string): UnitArt | undefined {
    const got = this.factions[owner]?.units[id] ?? (this.world.wildsId >= 0 ? this.factions[this.world.wildsId]?.units[id] : undefined);
    if (!got) this.want(owner, id);
    return got;
  }
  building(owner: number, id: string): BuildingArt | undefined {
    const got = this.factions[owner]?.buildings[id];
    if (!got) this.want(owner, id);
    return got;
  }
  flag(owner: number): Sprite { return this.factions[owner].flag; }
  wantFlag(owner: number): Sprite { return this.factions[owner].wantFlag ?? this.factions[owner].flag; }

  /** Every image the renderer may draw from (for GPU pre-upload). */
  allImages(): CanvasImageSource[] {
    const out = new Set<CanvasImageSource>();
    const add = (s: Sprite) => out.add(s.img);
    for (const b of new Set([this.biome, ...this.biomes])) {
      [...b.trees, ...b.bushes, ...b.mines, b.shard, b.projectile, ...Object.values(b.doodads).flat()].forEach(add);
      if (b.carcass) add(b.carcass);
      b.cliffs?.flat().forEach(add);
    }
    for (const f of this.factions) {
      add(f.flag);
      if (f.wantFlag) add(f.wantFlag);
      for (const u of Object.values(f.units)) for (const set of [u.anims, ...(u.segments ?? []).map((s) => s.anims)]) for (const a of Object.values(set)) a?.frames.flat().forEach(add);
      for (const bd of Object.values(f.buildings)) [...bd.construction, bd.complete, ...bd.damaged, ...(bd.joined ?? []).flat(), ...(bd.attack?.frames ?? []).flat()].forEach(add);
    }
    return [...out];
  }

  /**
   * `teams` overrides the seat colours (the arena paints every left side blue, every right side red). `only`: bake
   * just these units for every player, and no buildings (more come with ensure). In dev (no pre-baked art) a player's
   * art starts with just what it has on the map, and the rest bakes the first time it's needed.
   */
  static async build(world: World, biome: BiomeLoader, onProgress: (f: number, label: string) => void, teams?: TeamColors[], only?: string[]): Promise<ArtBank> {
    const players = world.players.filter((p) => !p.neutral);
    // the default biome is only baked if some player brings none of their own
    const loaders = [...new Set(players.map((p) => world.factionOf(p.id).biome ?? biome))];
    const parts = loaders.length + world.players.length;
    let base = 0;
    const sub = (f: number, label: string) => onProgress((base + Math.min(1, f)) / parts, label);
    // each distinct biome is baked once, even if several players share it
    const baked = new Map<BiomeLoader, BiomeArt>();
    for (const l of loaders) {
      const owner = players.map((p) => world.factionOf(p.id)).find((f) => f.biome === l) ?? null; // whose land (null: the default)
      sub(0, 'Growing the land');
      const key = biomeKey(owner?.id ?? null);
      let art = (await prebaked<BiomeArt>(owner, key)) ?? (await cachedArt<BiomeArt>(owner?.id ?? null, key));
      if (!art) { art = await l(sub); cacheArt(owner?.id ?? null, key, art); }
      baked.set(l, art);
      base++;
    }
    const biomes = players.map((p) => baked.get(world.factionOf(p.id).biome ?? biome)!);
    const factions: FactionArt[] = [], colours: TeamColors[] = [], lazy: number[] = [];
    for (const p of world.players) {
      const f = world.factionOf(p.id);
      const team = p.neutral ? WILD_COLORS : teams?.[p.id] ?? TEAM_COLORS[p.id % TEAM_COLORS.length];
      colours.push(team);
      if (p.neutral) factions.push(wildsArt(world, p.id, team, biomes));
      else if (!f.art) factions.push(placeholderArt(world, p.id, team));
      else {
        let art = await prebaked<FactionArt>(f, teamKey(f.id, team), true);
        if (!art && (only || import.meta.env.DEV)) { // (its flag now; its units and buildings as they're needed)
          const key = `${teamKey(f.id, team)}.flag`;
          art = await cachedArt<FactionArt>(f.id, key);
          if (!art) { art = await f.art(team, undefined, []); cacheArt(f.id, key, art); }
          art = { ...art, units: {}, buildings: {} };
          lazy.push(p.id);
        }
        if (!art) { const key = teamKey(f.id, team); art = (await cachedArt<FactionArt>(f.id, key)) ?? (await f.art(team, sub)); cacheArt(f.id, key, art); }
        factions.push(art);
      }
      base++;
    }
    const bank = new ArtBank(factions, baked.get(biome) ?? biomes[0], biomes, world, colours);
    // a lazy player's: what it has on the map now (or `only`), before the game starts
    for (const [i, owner] of lazy.entries()) {
      bank.lazy.add(owner);
      const ids = only ?? [...new Set([...[...world.units.values()].filter((u) => u.owner === owner).map((u) => u.specId), ...[...world.buildings.values()].filter((b) => b.owner === owner).map((b) => b.specId), world.factionOf(owner).workerId])];
      onProgress((base - lazy.length + i) / parts, `Mustering ${world.factionOf(owner).name ?? 'an army'}`);
      await bank.ensure(owner, ids);
    }
    onProgress(1, 'Ready');
    return bank;
  }
}

/** The Wilds wear their own biome's wildlife art (a placeholder token where a biome has none). */
function wildsArt(world: World, owner: number, team: TeamColors, biomes: BiomeArt[]): FactionArt {
  const art = placeholderArt(world, owner, team);
  world.players.forEach((p, i) => {
    if (p.neutral) return;
    for (const w of world.factionOf(i).wildlife ?? []) {
      const look = biomes[i]?.wildlife?.[w.id];
      if (!look) continue;
      for (const id of [w.id, `${w.id}@${i}`]) if (world.specOf(owner, id)) art.units[id] = look;
    }
  });
  return art;
}

/** A faction with no art still plays: team-coloured tokens for units, plain blocks for buildings. */
function placeholderArt(world: World, owner: number, team: TeamColors): FactionArt {
  const token = (h: number, w: number, color: string): Sprite => {
    const c = document.createElement('canvas');
    c.width = w + 4; c.height = h + 4;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(c.width / 2, c.height / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    return { img: c, sx: 0, sy: 0, sw: c.width, sh: c.height, ax: c.width / 2, ay: c.height - 2, q: 1 };
  };
  const f = world.factionOf(owner);
  const art: FactionArt = { units: {}, buildings: {}, flag: token(20, 8, team.secondary) };
  for (const u of f.units) {
    const h = 30 * Math.cbrt(u.mass / 70);
    art.units[u.id] = { height: h, anims: { idle: { frames: [[token(h, h * 0.6, team.primary)]] } } };
  }
  for (const b of f.buildings ?? []) {
    const s = token(b.size * 30, b.size * 60, team.dark);
    art.buildings[b.id] = { construction: [s], complete: s, damaged: [] };
  }
  return art;
}
