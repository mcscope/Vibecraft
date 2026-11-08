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

export type ArtAnim = 'idle' | 'walk' | 'give' | 'slam' | 'charge' | 'brace' | 'stagger' | 'fly' | 'leap' | 'climb' | 'soar' | 'glide' | 'land' | 'bankL' | 'bankR' | 'swoop' | 'rise' | 'reload' | 'lay' | 'grow' | 'hungry' | 'hatch' | 'attack' | 'cut' | 'gather' | 'eat' | 'tired' | 'die' | 'carryFood' | 'carryWood' | 'carryCrystal';

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
  /** Its picture for portraits and icons, on a page a 2D canvas can draw (a build's frames live only on the GPU: art/prebaked.ts). */
  still?: Sprite;
  sounds?: UnitSounds;
}

export interface ThrowArt { frames: Sprite[][]; from: number; release: number; to: number }

export interface BuildingArt {
  /** Construction looks, earliest first (1+). */
  construction: Sprite[];
  complete: Sprite;
  /** Damaged looks, least damaged first (0+). */
  damaged: Sprite[];
  /** A wall's finished looks joined to the pieces beside it: [look][joins bits] (BuildingState.joins); pieces in a line take the looks in turn. */
  joined?: Sprite[][];
  /**
   * A tower's throw: frames[facing][frame] (8 facings as a unit's; frames evenly through `t` 0 … 1 of
   * BuildingState.attack). Before `from` it comes out; `from` … `to` is one shot, letting go at `release` (as the
   * sim throws); after `to` it goes back to rest. Shot after shot it plays `from` … `to` again.
   */
  attack?: ThrowArt;
  /** Its picture for icons, as UnitArt.still. */
  still?: Sprite;
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
  /** Rock tiles standing up as cliff: [look][joins] (joins: rock beside it, 1 +x, 2 −x, 4 +y, 8 −y); tiles take the looks in turn. */
  cliffs?: Sprite[][];
}

/** Loads a biome's art (lazily, like a faction's). */
export type BiomeLoader = (onProgress?: (fraction: number, label: string) => void) => Promise<BiomeArt>;

/** `only`: bake just these units, and no buildings (the arena bakes the units it's showing). */
/** A faction's art in a team's colours; `only`: just these units and buildings (by id), the rest to come as needed. */
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
  return art.anims[a] ?? (flight ? art.anims.fly : undefined) ?? (a.startsWith('carry') || a === 'fly' || a === 'charge' || flight ? art.anims.walk : undefined) ?? (a === 'stagger' ? art.anims.tired : undefined) ?? (a === 'cut' || a === 'slam' ? art.anims.attack : undefined) ?? (a === 'give' ? art.anims.gather : undefined) ?? art.anims.idle;
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
/**
 * A tower's throw frame (BuildingArt.attack), or null at rest. `aimed`: seconds since it began winding up at a target
 * (null: it isn't); `thrown`: seconds since its last throw (null: none yet); `windup`, `follow`: the sim's seconds
 * before and after the throw; `dir`: which way it aims (radians, map axes). Winding up it plays to `release` (out of
 * rest first, unless it's still out from its last throw); after, on to `to`, holds there a little, then goes to rest.
 */
export function throwFrame(art: ThrowArt, dir: number, windup: number, follow: number, aimed: number | null, thrown: number | null): Sprite | null {
  const HOLD = 0.6, BACK = 0.6; // (seconds it stays out after a shot, and takes to go back)
  const out = (s: number) => s < follow + HOLD + BACK * 0.5; // (still out, `s` after a throw)
  let t: number | null = null;
  if (aimed !== null) {
    const k = Math.min(1, aimed / Math.max(windup, 1e-6)), start = thrown !== null && out(thrown - aimed) ? art.from : 0;
    t = start + k * (art.release - start);
  } else if (thrown !== null) {
    if (thrown < follow) t = art.release + (thrown / Math.max(follow, 1e-6)) * (art.to - art.release);
    else if (thrown < follow + HOLD) t = art.to;
    else if (thrown < follow + HOLD + BACK) t = art.to + ((thrown - follow - HOLD) / BACK) * (1 - art.to);
  }
  if (t === null) return null;
  const facing = art.frames[((Math.round(dir / (Math.PI / 4)) % 8) + 8) % 8];
  return facing[Math.min(facing.length - 1, Math.floor(t * facing.length))];
}

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
