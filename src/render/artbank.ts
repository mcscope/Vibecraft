// Holds the finished art for a match: each player's FactionArt (from their
// faction's own loader) and the map's BiomeArt. The engine draws only this.
import type { BiomeArt, BiomeLoader, BuildingArt, FactionArt, Sprite, TeamColors, UnitArt } from '../art/contract';
import type { World } from '../sim/world';
import type { FactionSpec } from '../factions/types';
import { PLAYABLE } from '../factions';
import { biomeKey, loadPrebaked, teamKey } from '../art/prebaked';

/** A shipped faction's art (or its land's) as pre-baked for a production build (scripts/prebake.mjs); null to bake it here. */
const prebaked = <T>(f: FactionSpec | null, key: string): Promise<T | null> =>
  import.meta.env.PROD && (!f || PLAYABLE.includes(f)) ? loadPrebaked<T>(key) : Promise.resolve(null);

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

  /** Bake any of these units the player's art doesn't have yet (a bank built with `only` fills in as it goes). */
  async ensureUnits(owner: number, ids: string[]): Promise<void> {
    const f = this.world.factionOf(owner), missing = ids.filter((id) => !this.factions[owner].units[id]);
    if (!missing.length || !f.art) return;
    Object.assign(this.factions[owner].units, (await f.art(this.teams[owner], undefined, missing)).units);
  }

  /** The biome whose half of the map a point is in. */
  biomeAt(x: number, y: number): BiomeArt {
    return this.biomes[this.world.territory(x, y)] ?? this.biome;
  }

  /** A unit's art; a tamed animal (sim/abilities/herding.ts) keeps its wild look. */
  unit(owner: number, id: string): UnitArt | undefined {
    return this.factions[owner]?.units[id] ?? (this.world.wildsId >= 0 ? this.factions[this.world.wildsId]?.units[id] : undefined);
  }
  building(owner: number, id: string): BuildingArt | undefined { return this.factions[owner]?.buildings[id]; }
  flag(owner: number): Sprite { return this.factions[owner].flag; }
  wantFlag(owner: number): Sprite { return this.factions[owner].wantFlag ?? this.factions[owner].flag; }

  /** Every image the renderer may draw from (for GPU pre-upload). */
  allImages(): CanvasImageSource[] {
    const out = new Set<CanvasImageSource>();
    const add = (s: Sprite) => out.add(s.img);
    for (const b of new Set([this.biome, ...this.biomes])) {
      [...b.trees, ...b.bushes, ...b.mines, b.shard, b.projectile, ...Object.values(b.doodads).flat()].forEach(add);
      if (b.carcass) add(b.carcass);
    }
    for (const f of this.factions) {
      add(f.flag);
      if (f.wantFlag) add(f.wantFlag);
      for (const u of Object.values(f.units)) for (const a of Object.values(u.anims)) a?.frames.flat().forEach(add);
      for (const bd of Object.values(f.buildings)) [...bd.construction, bd.complete, ...bd.damaged].forEach(add);
    }
    return [...out];
  }

  /**
   * `teams` overrides the seat colours (the arena paints every left side blue, every right side red). `only`: bake
   * just these units for every player, and no buildings (more come with ensureUnits).
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
      baked.set(l, (await prebaked<BiomeArt>(owner, biomeKey(owner?.id ?? null))) ?? (await l(sub)));
      base++;
    }
    const biomes = players.map((p) => baked.get(world.factionOf(p.id).biome ?? biome)!);
    const factions: FactionArt[] = [], colours: TeamColors[] = [];
    for (const p of world.players) {
      const f = world.factionOf(p.id);
      const team = p.neutral ? WILD_COLORS : teams?.[p.id] ?? TEAM_COLORS[p.id % TEAM_COLORS.length];
      colours.push(team);
      if (p.neutral) factions.push(wildsArt(world, p.id, team, biomes));
      else factions.push(f.art ? ((await prebaked<FactionArt>(f, teamKey(f.id, team))) ?? (await f.art(team, sub, only))) : placeholderArt(world, p.id, team));
      base++;
    }
    onProgress(1, 'Ready');
    return new ArtBank(factions, baked.get(biome) ?? biomes[0], biomes, world, colours);
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
