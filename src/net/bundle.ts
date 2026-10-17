// Faction bundles: how a faction travels to other players. Data only, never
// code: the spec (plain JSON; every stat is derived from it by the receiver's
// own physics) and the finished art (images + frame rectangles + anchors).
// The sender bakes its own art on its own machine; receivers only decode
// images and check numbers, so nothing a bundle contains can run.
import type {
  AnimArt, BiomeArt, BuildingArt, FactionArt, MusicSpec, SoundSpec, Sprite, UnitArt, UnitSounds,
} from '../art/contract';
import type { FactionSpec, WildSpec } from '../factions/types';
import { validateFaction } from '../sim/physics';
import { checkFairness } from '../sim/fairness';
import { validateBuildingAbilities, validateUnitAbilities } from '../sim/abilities';

export interface PackedSprite { i: number; sx: number; sy: number; sw: number; sh: number; ax: number; ay: number; q: number }
interface PackedAnim { frames: PackedSprite[][]; fps?: number }
interface PackedUnit { height: number; anims: Record<string, PackedAnim>; sounds?: UnitSounds }
interface PackedBuilding { construction: PackedSprite[]; complete: PackedSprite; damaged: PackedSprite[]; sounds?: BuildingArt['sounds'] }
export interface PackedArt { images: string[]; units: Record<string, PackedUnit>; buildings: Record<string, PackedBuilding>; flag: PackedSprite; wantFlag?: PackedSprite; music?: MusicSpec }
export interface PackedBiome {
  images: string[];
  trees: PackedSprite[]; bushes: PackedSprite[]; mines: PackedSprite[]; shard: PackedSprite; projectile: PackedSprite;
  doodads: Record<'grass' | 'flowers' | 'stones' | 'forest', PackedSprite[]>;
  ground?: BiomeArt['ground'];
  wildlife?: Record<string, PackedUnit>;
  carcass?: PackedSprite;
}

/** The faction as the sim sees it: plain data (no art loaders, no model functions). */
export type FactionData = Omit<FactionSpec, 'art' | 'biome'>;

export interface FactionBundle {
  v: 1;
  spec: FactionData;
  art?: PackedArt;
  biome?: PackedBiome;
}

export const BUNDLE_LIMITS = { chars: 60_000_000, images: 3000, imagePx: 4096, units: 40, buildings: 40, techs: 150, wildlife: 12, idLen: 40, textLen: 400 } as const;

// ───────────────────────────── packing (sender) ─────────────────────────────

/** JSON round-trip: drops functions (art loaders, models), keeps numbers exactly. */
export function specData(f: FactionSpec): FactionData {
  const { art: _a, biome: _b, ...rest } = f;
  void _a; void _b;
  return JSON.parse(JSON.stringify(rest));
}

class ImagePacker {
  readonly images: string[] = [];
  private index = new Map<CanvasImageSource, number>();
  sprite(s: Sprite): PackedSprite {
    let i = this.index.get(s.img);
    if (i === undefined) {
      i = this.images.length;
      this.index.set(s.img, i);
      const w = (s.img as { width: number }).width, h = (s.img as { height: number }).height;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(s.img, 0, 0);
      // WebP at 0.92 is about a third of PNG's size for baked sprites (browsers without WebP fall back to PNG)
      this.images.push(c.toDataURL('image/webp', 0.92));
    }
    return { i, sx: s.sx, sy: s.sy, sw: s.sw, sh: s.sh, ax: s.ax, ay: s.ay, q: s.q };
  }
  unit(u: UnitArt): PackedUnit {
    const anims: Record<string, PackedAnim> = {};
    for (const [k, a] of Object.entries(u.anims)) if (a) anims[k] = { frames: a.frames.map((row) => row.map((s) => this.sprite(s))), fps: a.fps };
    return { height: u.height, anims, sounds: u.sounds };
  }
}

export function packArt(art: FactionArt): PackedArt {
  const p = new ImagePacker();
  const units: Record<string, PackedUnit> = {};
  for (const [id, u] of Object.entries(art.units)) units[id] = p.unit(u);
  const buildings: Record<string, PackedBuilding> = {};
  for (const [id, b] of Object.entries(art.buildings)) {
    buildings[id] = { construction: b.construction.map((s) => p.sprite(s)), complete: p.sprite(b.complete), damaged: b.damaged.map((s) => p.sprite(s)), sounds: b.sounds };
  }
  const flag = p.sprite(art.flag);
  const wantFlag = art.wantFlag && p.sprite(art.wantFlag);
  return { images: p.images, units, buildings, flag, wantFlag, music: art.music };
}

export function packBiome(b: BiomeArt): PackedBiome {
  const p = new ImagePacker();
  const list = (l: Sprite[]) => l.map((s) => p.sprite(s));
  const wildlife: Record<string, PackedUnit> = {};
  for (const [id, u] of Object.entries(b.wildlife ?? {})) wildlife[id] = p.unit(u);
  const out: PackedBiome = {
    images: [], trees: list(b.trees), bushes: list(b.bushes), mines: list(b.mines), shard: p.sprite(b.shard), projectile: p.sprite(b.projectile),
    doodads: { grass: list(b.doodads.grass), flowers: list(b.doodads.flowers), stones: list(b.doodads.stones), forest: list(b.doodads.forest) },
    ground: b.ground, wildlife, carcass: b.carcass ? p.sprite(b.carcass) : undefined,
  };
  out.images = p.images;
  return out;
}

/** Bake (on this machine, with this faction's own code) and pack a faction for the given team colours. */
export async function makeBundle(f: FactionSpec, team: import('../art/contract').TeamColors, onProgress?: (fr: number, label: string) => void): Promise<FactionBundle> {
  const art = f.art ? packArt(await f.art(team, onProgress)) : undefined;
  const biome = f.biome ? packBiome(await f.biome(onProgress)) : undefined;
  return { v: 1, spec: specData(f), art, biome };
}

// ───────────────────────────── checking + unpacking (receiver) ─────────────────────────────

const isNum = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown, max: number = BUNDLE_LIMITS.textLen) => typeof x === 'string' && x.length <= max;
const isId = (x: unknown) => typeof x === 'string' && x.length > 0 && x.length <= BUNDLE_LIMITS.idLen && /^[\w@.-]+$/.test(x);
const DATA_IMAGE = /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/;
const DATA_AUDIO = /^data:audio\/[\w.+-]+;base64,[A-Za-z0-9+/=]+$/;

/** Structural checks on a received spec, then the same rules every faction is held to. */
export function checkSpec(s: unknown): string[] {
  const e: string[] = [];
  const f = s as FactionData;
  if (!f || typeof f !== 'object') return ['spec is not an object'];
  if (!isId(f.id) || !isStr(f.name, 60)) e.push('bad faction id/name');
  if (!Array.isArray(f.units) || f.units.length === 0 || f.units.length > BUNDLE_LIMITS.units) e.push('bad unit list');
  if (f.buildings !== undefined && (!Array.isArray(f.buildings) || f.buildings.length > BUNDLE_LIMITS.buildings)) e.push('bad building list');
  if (f.techs !== undefined && (!Array.isArray(f.techs) || f.techs.length > BUNDLE_LIMITS.techs)) e.push('bad tech list');
  if (f.wildlife !== undefined && (!Array.isArray(f.wildlife) || f.wildlife.length > BUNDLE_LIMITS.wildlife)) e.push('bad wildlife list');
  if (e.length) return e;
  const unit = (u: WildSpec | FactionData['units'][number], where: string) => {
    if (!isId(u.id) || !isStr(u.name, 60) || !isStr(u.description ?? '')) e.push(`${where}: bad id/name/description`);
    if (!isNum(u.mass) || !u.physique || !isNum(u.physique.muscle) || !isNum(u.physique.frame) || !isNum(u.physique.reserve)) e.push(`${where}: bad body`);
    if (u.attack && (!['strike', 'throw'].includes(u.attack.style) || !isNum(u.attack.crystalMass) || (u.attack.ammo !== undefined && !isNum(u.attack.ammo)))) e.push(`${where}: bad attack`);
    for (const k of ['refinement', 'workRefinement'] as const) if (u[k] !== undefined && !isNum(u[k])) e.push(`${where}: bad ${k}`);
    e.push(...validateUnitAbilities(u as FactionData['units'][number], where)); // sim/abilities
  };
  f.units.forEach((u, i) => unit(u, `unit ${i}`));
  (f.wildlife ?? []).forEach((w, i) => {
    unit(w, `wildlife ${i}`);
    if (!['passive', 'aggressive'].includes(w.temper) || !isNum(w.group) || !isNum(w.count) || w.group < 1 || w.group > 8 || w.count < 0 || w.count > 8) e.push(`wildlife ${i}: bad temper/group/count`);
  });
  for (const [i, b] of (f.buildings ?? []).entries()) {
    if (!isId(b.id) || !isStr(b.name, 60) || !isNum(b.size) || b.size < 1 || b.size > 8 || !isNum(b.materials) || b.materials < 0) e.push(`building ${i}: bad id/size/materials`);
    for (const k of ['trains', 'researches', 'requires'] as const) if (b[k] !== undefined && (!Array.isArray(b[k]) || !b[k]!.every(isId))) e.push(`building ${i}: bad ${k}`);
    if (b.attack && (!isNum(b.attack.mechanism) || !isNum(b.attack.crystalMass) || !isNum(b.attack.height))) e.push(`building ${i}: bad attack`);
    e.push(...validateBuildingAbilities(b, `building ${i}`)); // sim/abilities
  }
  for (const [i, t] of (f.techs ?? []).entries()) if (!isId(t.id) || !isId(t.unit) || !isNum(t.refinement) || t.refinement <= 0 || t.refinement > 5 || (t.flavor !== undefined && !isStr(t.flavor))) e.push(`tech ${i}: bad`);
  if (e.length) return e;
  // the rules every faction lives by (refinement paid for by capital, footprints, references...),
  // and the fairness bounds on what a match hands out for free
  return [...validateFaction(f as FactionSpec), ...checkFairness(f as FactionSpec)];
}

function checkSprites(images: unknown, sprites: PackedSprite[], e: string[]): void {
  if (!Array.isArray(images) || images.length > BUNDLE_LIMITS.images || !images.every((x) => typeof x === 'string' && DATA_IMAGE.test(x))) { e.push('images must be base64 data: images'); return; }
  for (const s of sprites) {
    if (!s || !Number.isInteger(s.i) || s.i < 0 || s.i >= images.length || ![s.sx, s.sy, s.sw, s.sh, s.ax, s.ay, s.q].every(isNum) || s.sw <= 0 || s.sh <= 0 || s.q <= 0 || s.q > 8) { e.push('bad sprite'); return; }
  }
}
const sounds = (x: SoundSpec | undefined): SoundSpec | undefined => (x && 'clip' in x ? (DATA_AUDIO.test(x.clip) ? x : undefined) : x); // never fetch URLs from someone else's bundle
const unitSounds = (s?: UnitSounds): UnitSounds | undefined => s && { voice: s.voice, select: sounds(s.select), acknowledge: sounds(s.acknowledge), attack: sounds(s.attack), death: sounds(s.death) };

function allSprites(a: PackedArt | PackedBiome): PackedSprite[] {
  const out: PackedSprite[] = [];
  const unit = (u: PackedUnit) => Object.values(u.anims ?? {}).forEach((an) => an.frames?.forEach((row) => out.push(...row)));
  if ('units' in a) {
    Object.values(a.units ?? {}).forEach(unit);
    Object.values(a.buildings ?? {}).forEach((b) => out.push(...(b.construction ?? []), b.complete, ...(b.damaged ?? [])));
    out.push(a.flag);
    if (a.wantFlag) out.push(a.wantFlag);
  } else {
    out.push(...a.trees, ...a.bushes, ...a.mines, a.shard, a.projectile, ...Object.values(a.doodads ?? {}).flat());
    if (a.carcass) out.push(a.carcass);
    Object.values(a.wildlife ?? {}).forEach(unit);
  }
  return out;
}

/** Everything wrong with a received bundle ([] = fine to play with). */
export function checkBundle(b: unknown, size: number): string[] {
  const e: string[] = [];
  if (size > BUNDLE_LIMITS.chars) return [`bundle too large (${(size / 1e6).toFixed(1)} MB)`];
  const x = b as FactionBundle;
  if (!x || x.v !== 1) return ['not a VibeCraft faction bundle'];
  e.push(...checkSpec(x.spec));
  try {
    if (x.art) checkSprites(x.art.images, allSprites(x.art), e);
    if (x.biome) checkSprites(x.biome.images, allSprites(x.biome), e);
  } catch { e.push('malformed art'); }
  return e;
}

async function decode(images: string[]): Promise<ImageBitmap[]> {
  return Promise.all(images.map(async (url) => {
    const bmp = await createImageBitmap(await (await fetch(url)).blob()); // data: URLs only (checked)
    if (bmp.width > BUNDLE_LIMITS.imagePx || bmp.height > BUNDLE_LIMITS.imagePx) throw new Error('image too large');
    return bmp;
  }));
}
const sprite = (imgs: ImageBitmap[]) => (p: PackedSprite): Sprite => ({ img: imgs[p.i], sx: p.sx, sy: p.sy, sw: p.sw, sh: p.sh, ax: p.ax, ay: p.ay, q: p.q });
function unpackUnit(u: PackedUnit, sp: (p: PackedSprite) => Sprite): UnitArt {
  const anims: Record<string, AnimArt> = {};
  for (const [k, a] of Object.entries(u.anims)) anims[k] = { frames: a.frames.map((row) => row.map(sp)), fps: a.fps };
  return { height: u.height, anims: anims as UnitArt['anims'], sounds: unitSounds(u.sounds) };
}

export async function unpackArt(a: PackedArt): Promise<FactionArt> {
  const sp = sprite(await decode(a.images));
  const units: Record<string, UnitArt> = {};
  for (const [id, u] of Object.entries(a.units)) units[id] = unpackUnit(u, sp);
  const buildings: Record<string, BuildingArt> = {};
  for (const [id, b] of Object.entries(a.buildings)) {
    buildings[id] = { construction: b.construction.map(sp), complete: sp(b.complete), damaged: b.damaged.map(sp), sounds: b.sounds && { placed: sounds(b.sounds.placed), complete: sounds(b.sounds.complete), destroyed: sounds(b.sounds.destroyed) } };
  }
  const music = a.music && { ...a.music, clip: a.music.clip && DATA_AUDIO.test(a.music.clip) ? a.music.clip : undefined };
  return { units, buildings, flag: sp(a.flag), wantFlag: a.wantFlag && sp(a.wantFlag), music };
}

export async function unpackBiome(b: PackedBiome): Promise<BiomeArt> {
  const sp = sprite(await decode(b.images));
  const wildlife: Record<string, UnitArt> = {};
  for (const [id, u] of Object.entries(b.wildlife ?? {})) wildlife[id] = unpackUnit(u, sp);
  return {
    trees: b.trees.map(sp), bushes: b.bushes.map(sp), mines: b.mines.map(sp), shard: sp(b.shard), projectile: sp(b.projectile),
    doodads: { grass: b.doodads.grass.map(sp), flowers: b.doodads.flowers.map(sp), stones: b.doodads.stones.map(sp), forest: b.doodads.forest.map(sp) },
    ground: b.ground, wildlife, carcass: b.carcass ? sp(b.carcass) : undefined,
  };
}

/**
 * A playable faction from a bundle. The sim uses the bundle's spec (identical on
 * every client); art comes from the bundle, or from `local` (this machine's own
 * faction code) when it's ours.
 */
export function fromBundle(b: FactionBundle, local?: FactionSpec): FactionSpec {
  const spec = b.spec as FactionSpec;
  const art = local?.art ? local.art : b.art ? () => unpackArt(b.art!) : undefined;
  const biome = local?.biome ? local.biome : b.biome ? () => unpackBiome(b.biome!) : undefined;
  return { ...spec, art, biome };
}
