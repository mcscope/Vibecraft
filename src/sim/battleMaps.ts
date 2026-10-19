// Pitched Battle maps: a field with a deployment zone at each end (player 0 west, player 1 east, mirrored so both
// sides get the same ground) and the terrain that shapes the fight in between: fords, passes, lanes and woods.
import { MapBuilder, TERRAIN_GRASS, TERRAIN_ROCK, TERRAIN_SAND, TERRAIN_WATER, type GeneratedMap } from './map';

export const BATTLE_SIZE = 64;
/** Each side deploys within this many tiles of its own edge (x for the west side; mirrored for the east). */
export const DEPLOY_DEPTH = 15;

/** Is (x, y) in `owner`'s deployment zone? */
export const inZone = (owner: number, x: number, y: number): boolean =>
  y >= 3 && y <= BATTLE_SIZE - 4 && (owner === 0 ? x >= 2 && x <= DEPLOY_DEPTH : x >= BATTLE_SIZE - 1 - DEPLOY_DEPTH && x <= BATTLE_SIZE - 3);

/** The middle of `owner`'s zone. */
export const zoneCenter = (owner: number): [number, number] => (owner === 0 ? [DEPLOY_DEPTH / 2 + 1, BATTLE_SIZE / 2] : [BATTLE_SIZE - 2 - DEPLOY_DEPTH / 2, BATTLE_SIZE / 2]);

export interface BattleMapInfo { id: string; name: string; description: string; generate(seed: number): GeneratedMap }

/** A battle field: no bases (the starts sit off the map), woods along the edge, clear deployment zones. */
function field(seed: number, shape: (m: MapBuilder, c: number) => void): GeneratedMap {
  const m = new MapBuilder(seed, BATTLE_SIZE, [-50, -50]);
  const c = (BATTLE_SIZE - 1) / 2;
  shape(m, c);
  m.borderWoods(1, 2);
  // the deployment zones stay open ground
  const g = m.grid;
  for (let y = 0; y < BATTLE_SIZE; y++) for (let x = 0; x < BATTLE_SIZE; x++) {
    if (!inZone(0, x, y) && !inZone(1, x, y)) continue;
    const i = y * BATTLE_SIZE + x;
    if (g.terrain[i] === TERRAIN_WATER || g.terrain[i] === TERRAIN_ROCK) g.terrain[i] = TERRAIN_GRASS;
  }
  const out = m.done();
  out.features = out.features.filter((f) => !inZone(0, f.x, f.y) && !inZone(1, f.x, f.y));
  for (let i = 0; i < g.blocked.length; i++) g.blocked[i] = g.terrain[i] === TERRAIN_WATER || g.terrain[i] === TERRAIN_ROCK ? 1 : 0;
  return out;
}

/** A band of terrain `t` across the field at x≈c (±half), except where `open(y)` says there's a way through. */
function band(m: MapBuilder, c: number, half: number, t: number, open: (y: number) => boolean, ragged = 0.6): void {
  for (let y = 0; y < BATTLE_SIZE; y++) {
    if (open(y)) continue;
    const w = half + m.rng.range(-ragged, ragged);
    for (let x = Math.floor(c - w); x <= Math.ceil(c + w); x++) if (x <= c) m.terrain(x, y, t); // (the mirror fills the far side)
  }
}

export const BATTLE_MAPS: BattleMapInfo[] = [
  {
    id: 'river-ford', name: 'River Ford',
    description: 'A river down the middle, crossable only at three sandy fords: chokepoints where a planted line of spears can hold a whole army.',
    generate: (seed) => field(seed, (m, c) => {
      const fords = [10, 31, 32, 52]; // north, centre, and (mirrored) south
      band(m, c, 2.2, TERRAIN_WATER, (y) => fords.some((f) => Math.abs(y - f) <= 2));
      for (const f of fords) for (let dy = -3; dy <= 3; dy++) for (let x = Math.floor(c) - 4; x <= c; x++) m.terrain(x, f + dy, TERRAIN_SAND);
      m.forest(c - 9, 20, 2.5, 0.8);
    }),
  },
  {
    id: 'broken-ridge', name: 'Broken Ridge',
    description: 'A rocky ridge across the field with two passes, north and south. Choose where to push, and how much to keep back.',
    generate: (seed) => field(seed, (m, c) => {
      band(m, c, 1.6, TERRAIN_ROCK, (y) => Math.abs(y - 15) <= 3 || Math.abs(y - 48) <= 3, 0.9);
      m.forest(c - 7, 31, 3, 0.75);
    }),
  },
  {
    id: 'lake-lanes', name: 'Lake Lanes',
    description: 'A wide lake fills the centre and splits the battle into a north lane and a south lane. Win one, then turn on the other.',
    generate: (seed) => field(seed, (m, c) => {
      m.pond(c, c, 9);
      m.forest(c - 6, 8, 2.2, 0.7);
    }),
  },
  {
    id: 'twin-woods', name: 'Twin Woods',
    description: 'Two woods flank an open middle: a killing field in the centre, and hidden lanes round the sides for cavalry.',
    generate: (seed) => field(seed, (m, c) => {
      m.forest(c, 15, 7, 0.9);
      m.forest(c - 10, c, 2, 0.6);
    }),
  },
  {
    id: 'open-steppe', name: 'Open Steppe',
    description: 'Wide open ground with a few small copses. Room to wheel and charge: cavalry country.',
    generate: (seed) => field(seed, (m, c) => {
      for (let i = 0; i < 6; i++) m.forest(m.rng.range(20, c), m.rng.range(6, BATTLE_SIZE - 6), m.rng.range(1.2, 2.2), 0.7);
    }),
  },
];

export const battleMap = (id: string): BattleMapInfo => BATTLE_MAPS.find((m) => m.id === id) ?? BATTLE_MAPS[0];

