// THE ART CONTRACT: everything the game needs from a faction to show it.
//
// The engine never makes art. A faction hands over finished assets — sprite
// frames with anchor points, building looks, a rally flag, optional sounds and
// music — and how it made them is its own business: a 3D bake (the Meadowfolk
// use src/kits/bake3d), hand-painted sheets, generated images, anything.
//
// Assets arrive through `FactionSpec.art(team)`: the loader gets the team's
// colours so it can tint its art, and returns a FactionArt.

export interface TeamColors {
  primary: string;
  secondary: string;
  dark: string;
}

/** A frame: a rectangle of an image, with the point that sits on the ground. */
export interface Sprite {
  img: CanvasImageSource;
  sx: number; sy: number; sw: number; sh: number;
  /** Anchor (feet / footprint centre) within the rect, in source pixels. */
  ax: number; ay: number;
  /** Source pixels per screen pixel at zoom 1. (A tile is 64×32 screen px.) */
  q: number;
}

/** Animations the engine asks for. Only `idle` is required; others fall back to it. */
/** Model units a map tile spans (art is modelled in units of ~1 m; a tile is 2 m). */
export const UNITS_PER_TILE = 2;

export type ArtAnim = 'idle' | 'walk' | 'charge' | 'brace' | 'stagger' | 'fly' | 'leap' | 'climb' | 'soar' | 'glide' | 'land' | 'bankL' | 'bankR' | 'swoop' | 'rise' | 'reload' | 'lay' | 'grow' | 'hatch' | 'attack' | 'cut' | 'gather' | 'eat' | 'tired' | 'die' | 'carryFood' | 'carryWood' | 'carryCrystal';

export interface AnimArt {
  /**
   * frames[facing][frame]. 1, 2, 4 or 8 facings, starting at map +x and going
   * toward +y (screen: down-right, then down, down-left, ...).
   */
  frames: Sprite[][];
  /**
   * In the air: each frame's shadow alone, as it falls on the ground (same layout as `frames`). The frames are drawn
   * lifted to the flier's height; its shadow is drawn on the ground, falling away from the sun as it climbs.
   */
  shadows?: Sprite[][];
  /** Playback rate for looping animations (attack and die play once over their duration). */
  fps?: number;
  /** A walk: how far one loop carries the body (model units, 2 a tile). Played by the distance walked, its planted feet stay put. */
  stride?: number;
}

export interface UnitArt {
  /** On-screen height of the unit at zoom 1, in px (for health bars and clicking). */
  height: number;
  /**
   * Parts drawn trailing along the path it has moved, like Snake (a caterpillar's body segments): each `behind` model
   * units back along its trail, facing along the trail there. The unit's own frames are then its front part.
   */
  segments?: Array<{ anims: Partial<Record<ArtAnim, AnimArt>> & { idle: AnimArt }; behind: number }>;
  anims: Partial<Record<ArtAnim, AnimArt>> & { idle: AnimArt };
  sounds?: UnitSounds;
}

export interface BuildingArt {
  /** Construction looks, earliest first (1+). */
  construction: Sprite[];
  complete: Sprite;
  /** Damaged looks, least damaged first (0+). */
  damaged: Sprite[];
  sounds?: { placed?: SoundSpec; complete?: SoundSpec; destroyed?: SoundSpec };
}

export interface FactionArt {
  units: Record<string, UnitArt>;
  buildings: Record<string, BuildingArt>;
  /** Rally-point marker. */
  flag: Sprite;
  /** Planted by a building whose orders are waiting on supplies (optional; the rally flag otherwise). */
  wantFlag?: Sprite;
  music?: MusicSpec;
}

/** The look of the land itself (a map's homeworld). */
export interface BiomeArt {
  trees: Sprite[];
  /** Berry bushes, emptiest first. */
  bushes: Sprite[];
  /** Crystal deposits, smallest first. */
  mines: Sprite[];
  shard: Sprite;
  projectile: Sprite;
  /** Ground clutter painted into the terrain. */
  doodads: { grass: Sprite[]; flowers: Sprite[]; stones: Sprite[]; forest: Sprite[] };
  /** Ground colours (hex). Omitted: the default meadow greens. */
  ground?: { grass: [string, string, string]; dirt: [string, string]; forest: string; sand: string; shallow: string; deep: string };
  /** Art for the biome's wildlife, by unit id (see FactionSpec.wildlife). */
  wildlife?: Record<string, UnitArt>;
  /** What a killed animal leaves behind (a gatherable food node). */
  carcass?: Sprite;
}

/** Loads a biome's art (lazily, like a faction's). */
export type BiomeLoader = (onProgress?: (fraction: number, label: string) => void) => Promise<BiomeArt>;

/** `only`: bake just these units, and no buildings (the arena bakes the units it's showing). */
export type ArtLoader = (team: TeamColors, onProgress?: (fraction: number, label: string) => void, only?: string[]) => Promise<FactionArt>;

// ───────────────────────────── sound ─────────────────────────────
// Sounds are data so a faction can be sent over the network safely: a small
// synth recipe the engine plays, or a short audio clip (URL or data: URI).

export type SoundSpec =
  | { synth: SynthRecipe }
  | { clip: string; gain?: number };

export interface SynthRecipe {
  kind: 'voice' | 'pluck' | 'hit' | 'whoosh' | 'chime';
  /** Hz. */
  pitch?: number;
  vowel?: 'a' | 'e' | 'i' | 'o' | 'u';
  timbre?: 'saw' | 'square' | 'triangle' | 'sine';
  /** Seconds. */
  length?: number;
  /** Syllables / repeats. */
  count?: number;
}

export interface UnitSounds {
  select?: SoundSpec;
  acknowledge?: SoundSpec;
  attack?: SoundSpec;
  death?: SoundSpec;
}

export interface MusicSpec {
  /** Semitone offsets from the root, e.g. dorian [0,2,3,5,7,9,10]. */
  scale?: number[];
  /** Root note, Hz. */
  root?: number;
  tempo?: number;
  lead?: SynthRecipe['timbre'];
  drone?: SynthRecipe['timbre'];
  /** Or a looping track. */
  clip?: string;
}

// ───────────────────────────── helpers the engine uses ─────────────────────────────

export function anim(art: UnitArt, a: ArtAnim): AnimArt {
  const flight = a === 'leap' || a === 'climb' || a === 'soar' || a === 'glide' || a === 'land';
  return art.anims[a] ?? (flight ? art.anims.fly : undefined) ?? (a.startsWith('carry') || a === 'fly' || a === 'charge' || flight ? art.anims.walk : undefined) ?? (a === 'stagger' ? art.anims.tired : undefined) ?? (a === 'cut' ? art.anims.attack : undefined) ?? art.anims.idle;
}

/** The frame to show for a unit facing map octant 0..7. `progress` (0..1) for one-shot anims, else `time` in seconds. */
export function unitSprite(art: UnitArt, a: ArtAnim, octant: number, t: FrameTime): Sprite {
  return frameOf(anim(art, a), anim(art, a).frames, octant, t);
}

/** The shadow of the frame unitSprite picks (an animation in the air), if it has one. */
export function unitShadow(art: UnitArt, a: ArtAnim, octant: number, t: FrameTime): Sprite | undefined {
  const an = anim(art, a);
  return an.shadows ? frameOf(an, an.shadows, octant, t) : undefined;
}

/** Where in an animation: seconds into a loop, progress through a one-shot, or (a walk) model units walked. */
export interface FrameTime { time?: number; progress?: number; walked?: number }

function frameOf(an: AnimArt, set: Sprite[][], octant: number, t: FrameTime): Sprite {
  const facings = set.length;
  const f = facings === 1 ? 0 : Math.round(((((octant % 8) + 8) % 8) * facings) / 8) % facings;
  const frames = set[f];
  const n = frames.length;
  const i = t.progress !== undefined ? Math.min(n - 1, Math.floor(t.progress * n))
    : t.walked !== undefined && an.stride ? Math.floor((t.walked / an.stride) * n) % n
    : Math.floor((t.time ?? 0) * (an.fps ?? 8)) % n;
  return frames[Math.max(0, i)];
}

/** Which look a building shows: construction stage by progress, damage by HP. */
export function buildingSprite(art: BuildingArt, complete: boolean, built: number, hp: number, maxHp: number): Sprite {
  if (!complete) {
    const n = art.construction.length;
    return art.construction[Math.min(n - 1, Math.floor(built * n))] ?? art.complete;
  }
  const n = art.damaged.length;
  const hurt = 1 - hp / maxHp; // 0 healthy .. 1 nearly dead
  if (!n || hurt < 1 / (n + 1)) return art.complete;
  return art.damaged[Math.min(n - 1, Math.floor(hurt * (n + 1)) - 1)];
}
