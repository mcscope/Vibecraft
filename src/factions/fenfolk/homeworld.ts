// Fen resources: reed thickets, weeping willows and moss-hung cypress (reeds),
// root clumps in wet mud (roots), crystals breaking out of a peat mound, and
// bog clutter. Model units: 1 tile = 2 units; origin = centre of the footprint.
import type { Mat, ModelBuilder, Vec3 } from '../../kits/bake3d/types';
import type { BiomeArt } from '../../art/contract';
import { bakeBiome } from '../../biomes/bake';
import { fenWildlife } from './wildlife';

const MUD: Mat = { color: '#3e3326', tex: 'stone', rough: 0.6 };
const WET: Mat = { color: '#3a4a40', rough: 0.15 };
const REED = ['#8a8a4a', '#9a9452', '#7a7a3e', '#a89e5a'];
const MOSS: Mat = { color: '#7a8a62', tex: 'leaf' };

function rand(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** A cattail: a stalk with a brown seed head. */
function cattail(b: ModelBuilder, at: Vec3, h: number, lean: [number, number], head = true): void {
  const top: Vec3 = [at[0] + lean[0], at[1] + h, at[2] + lean[1]];
  b.limb(at, top, 0.022, { color: '#7a8a3e', tex: 'leaf' }, 0.014);
  if (head) b.limb([at[0] + lean[0] * 0.86, at[1] + h * 0.8, at[2] + lean[1] * 0.86], [at[0] + lean[0] * 0.96, at[1] + h * 0.95, at[2] + lean[1] * 0.96], 0.05, { color: '#5a3a22', tex: 'fur' });
}

export function tree(b: ModelBuilder, variant: number): void {
  const r = rand(variant + 201);
  const kind = variant % 3;
  b.cylinder(1.0, 1.1, 0.04, [0, 0.02, 0], WET, undefined, 14); // standing water at the foot
  if (kind === 0) {
    // reed thicket: a dense stand of tall reeds and cattails
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.95;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = 2.2 + r() * 1.6 - d * 0.6;
      const lean: [number, number] = [x * 0.3 + (r() - 0.5) * 0.3, z * 0.3 + (r() - 0.5) * 0.3];
      if (i % 5 === 0) cattail(b, [x, 0, z], h, lean);
      else b.limb([x, 0, z], [x + lean[0], h, z + lean[1]], 0.03, { color: REED[i % 4], tex: 'thatch' }, 0.008);
    }
    for (let i = 0; i < 10; i++) { // plume tops
      const a = r() * Math.PI * 2, d = r() * 0.6;
      b.sphere([0.1, 0.2, 0.1], [Math.cos(a) * d, 3.1 + r() * 0.6, Math.sin(a) * d], { color: '#c8b88a', tex: 'fur' }, [r() - 0.5, 0, r() - 0.5]);
    }
    return;
  }
  if (kind === 1) {
    // weeping willow: a gnarled trunk under a curtain of hanging fronds
    const h = 3.8 + r() * 0.6;
    const bark: Mat = { color: '#4a3e2a', tex: 'wood' };
    b.limb([0, 0, 0], [0.15, h * 0.6, 0.05], 0.3, bark, 0.18);
    b.limb([0.15, h * 0.55, 0], [0.8, h * 0.85, 0.3], 0.12, bark, 0.06);
    b.limb([0.1, h * 0.55, 0], [-0.7, h * 0.88, -0.4], 0.12, bark, 0.06);
    const greens = ['#7a8a3a', '#8a9a46', '#6a7a32'];
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.9;
      b.sphere([0.55, 0.3, 0.55], [Math.cos(a) * rr, h * 0.88 + r() * 0.4, Math.sin(a) * rr], { color: greens[i % 3], tex: 'leaf' });
    }
    for (let i = 0; i < 40; i++) { // fronds hanging almost to the water
      const a = (i / 40) * Math.PI * 2 + r() * 0.2, rr = 1.0 + r() * 0.5;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = h * 0.9 + r() * 0.3;
      b.limb([x * 0.85, y, z * 0.85], [x * 1.05, 0.5 + r() * 1.1, z * 1.05], 0.05, { color: greens[i % 3], tex: 'leaf' }, 0.025);
    }
    return;
  }
  // bald cypress: flared buttress, knees out of the water, beards of moss
  const h = 5.0 + r() * 0.8;
  const bark: Mat = { color: '#6a4e36', tex: 'wood' };
  b.cylinder(0.2, 0.55, 1.0, [0, 0.5, 0], bark, undefined, 10);
  b.limb([0, 0.9, 0], [0.05, h, 0.05], 0.2, bark, 0.1);
  for (let i = 0; i < 5; i++) { // knees
    const a = r() * Math.PI * 2, d = 0.7 + r() * 0.3;
    b.cone(0.07, 0.25 + r() * 0.15, [Math.cos(a) * d, 0.12, Math.sin(a) * d], bark, undefined, 6);
  }
  for (let i = 0; i < 6; i++) { // flat, ragged tiers of feathery foliage on bare branches
    const y = h * 0.5 + i * 0.42, a = r() * Math.PI * 2;
    const rad = 1.3 - i * 0.17;
    const bx = Math.cos(a) * rad * 0.55, bz = Math.sin(a) * rad * 0.55;
    b.limb([0, y - 0.3, 0], [bx, y, bz], 0.06, bark, 0.03);
    for (let k = 0; k < 6; k++) {
      const ka = r() * Math.PI * 2, kr = r() * rad * 0.6;
      b.sphere([0.42, 0.13, 0.36], [bx * 0.6 + Math.cos(ka) * kr, y + r() * 0.12, bz * 0.6 + Math.sin(ka) * kr], { color: ['#5a6a2e', '#6a7a36', '#7a8440'][k % 3], tex: 'leaf' }, [0, ka, 0]);
    }
    for (let k = 0; k < 4; k++) { // spanish moss
      const ka = r() * Math.PI * 2, kr = rad * (0.4 + r() * 0.4);
      b.limb([bx * 0.5 + Math.cos(ka) * kr, y - 0.05, bz * 0.5 + Math.sin(ka) * kr], [bx * 0.5 + Math.cos(ka) * kr, y - 0.6 - r() * 0.5, bz * 0.5 + Math.sin(ka) * kr], 0.045, MOSS, 0.01);
    }
  }
}

/** Bog roots: broad arrowhead leaves over fat tubers in wet mud; fewer tubers as it's dug. */
export function bush(b: ModelBuilder, level: number): void {
  const r = rand(29);
  b.sphere([0.8, 0.08, 0.7], [0, 0.03, 0], MUD);
  b.cylinder(0.45, 0.5, 0.02, [0.1, 0.07, -0.1], WET, undefined, 12);
  for (let i = 0; i < 9; i++) { // arrowhead leaves on tall stems
    const a = (i / 9) * Math.PI * 2 + r() * 0.3, d = 0.15 + r() * 0.3;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.6 + r() * 0.4;
    const tip: Vec3 = [x * 1.6, h, z * 1.6];
    b.limb([x, 0.05, z], tip, 0.018, { color: '#6a8a3a', tex: 'leaf' });
    b.joint(tip, [0, -a, 0.9], (l) => {
      l.box([0.04, 0.42, 0.3], [0, 0.12, 0], { color: i % 2 ? '#5e8a32' : '#6e9a3a', tex: 'leaf' });
      l.box([0.035, 0.2, 0.12], [0, -0.06, 0.13], { color: '#5a8030', tex: 'leaf' }, [0.5, 0, 0]);
      l.box([0.035, 0.2, 0.12], [0, -0.06, -0.13], { color: '#5a8030', tex: 'leaf' }, [-0.5, 0, 0]);
    });
  }
  const tubers = Math.round(level * 9);
  for (let i = 0; i < tubers; i++) { // pale tubers half out of the mud
    const a = r() * Math.PI * 2, d = 0.25 + r() * 0.45;
    b.sphere([0.13, 0.09, 0.1], [Math.cos(a) * d, 0.08, Math.sin(a) * d], { color: i % 2 ? '#d8c08a' : '#c8a46a', tex: 'skin' }, [0, a, 0.3]);
    b.limb([Math.cos(a) * d, 0.08, Math.sin(a) * d], [Math.cos(a) * (d + 0.18), 0.02, Math.sin(a) * (d + 0.18)], 0.015, { color: '#a88a5a' });
  }
}

export function mine(b: ModelBuilder, level: number): void {
  const r = rand(31);
  b.sphere([1.0, 0.35, 0.95], [0, 0.05, 0], { color: '#3a3024', tex: 'stone' }); // peat mound
  b.cylinder(1.15, 1.2, 0.03, [0, 0.015, 0], WET, undefined, 16);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r(), rr = 0.55 + r() * 0.3, s = 0.22 + r() * 0.18;
    b.rock([s, s * 0.8, s], [Math.cos(a) * rr, s * 0.35, Math.sin(a) * rr], { color: i % 2 ? '#4a5048' : '#56584a', tex: 'stone' }, i + 7);
    b.sphere([s * 0.7, s * 0.2, s * 0.7], [Math.cos(a) * rr, s * 0.7, Math.sin(a) * rr], MOSS);
  }
  for (let i = 0; i < 8; i++) { // reeds around the edge
    const a = r() * Math.PI * 2, d = 0.9 + r() * 0.25;
    b.limb([Math.cos(a) * d, 0, Math.sin(a) * d], [Math.cos(a) * d * 1.1, 0.7 + r() * 0.5, Math.sin(a) * d * 1.1], 0.02, { color: REED[i % 4], tex: 'thatch' }, 0.006);
  }
  const n = 3 + Math.round(level * 5);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, rr = r() * 0.45;
    const len = (0.45 + r() * 0.6) * (0.55 + level * 0.6);
    b.crystal(len, [Math.cos(a) * rr, 0.3, Math.sin(a) * rr], [Math.sin(a) * 0.55, 0, Math.cos(a) * 0.55]);
  }
}

// ── ground clutter ──

function sedge(b: ModelBuilder, v: number): void {
  const r = rand(v * 31 + 90);
  const cols = ['#6a6e3a', '#7a7a42', '#5a6232', '#8a8448'];
  for (let i = 0; i < 9 + Math.floor(r() * 6); i++) {
    const a = r() * Math.PI * 2, d = r() * 0.15, h = 0.2 + r() * 0.26;
    b.cone(0.02, h, [Math.cos(a) * d, h / 2, Math.sin(a) * d], { color: cols[Math.floor(r() * 4)], tex: 'leaf' }, [(r() - 0.5) * 0.6, a, (r() - 0.5) * 0.6], 4);
  }
}

function cattails(b: ModelBuilder, v: number): void {
  const r = rand(v * 17 + 5);
  sedge(b, v + 30);
  for (let i = 0; i < 3 + (v % 3); i++) {
    const a = r() * Math.PI * 2, d = r() * 0.12;
    cattail(b, [Math.cos(a) * d, 0, Math.sin(a) * d], 0.5 + r() * 0.3, [(r() - 0.5) * 0.12, (r() - 0.5) * 0.12]);
  }
}

function lilies(b: ModelBuilder, v: number): void {
  const r = rand(v * 13 + 77);
  b.cylinder(0.3, 0.32, 0.01, [0, 0.005, 0], WET, undefined, 12);
  for (let i = 0; i < 3 + Math.floor(r() * 2); i++) {
    const a = r() * Math.PI * 2, d = r() * 0.18;
    b.cylinder(0.08, 0.08, 0.01, [Math.cos(a) * d, 0.015, Math.sin(a) * d], { color: '#4a7a3a', tex: 'leaf' }, [0, r() * 3, 0], 9);
  }
  if (v % 2) b.sphere([0.04, 0.03, 0.04], [0.02, 0.04, 0.02], { color: '#e8d8e0' });
}

function mudStones(b: ModelBuilder, v: number): void {
  const r = rand(v * 7 + 3);
  for (let i = 0; i < 2 + Math.floor(r() * 3); i++) {
    const a = r() * Math.PI * 2, d = r() * 0.22, s = 0.05 + r() * 0.09;
    b.rock([s, s * 0.6, s], [Math.cos(a) * d, s * 0.2, Math.sin(a) * d], { color: i % 2 ? '#4a5048' : '#56584a', tex: 'stone' }, i + v);
    b.sphere([s * 0.6, s * 0.15, s * 0.6], [Math.cos(a) * d, s * 0.45, Math.sin(a) * d], MOSS);
  }
}

function toadstools(b: ModelBuilder, v: number): void {
  const r = rand(v * 23 + 9);
  for (let i = 0; i < 3 + Math.floor(r() * 3); i++) {
    const a = r() * Math.PI * 2, d = r() * 0.14, h = 0.05 + r() * 0.09;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    b.cylinder(0.014, 0.018, h, [x, h / 2, z], { color: '#d8d0b0' }, undefined, 6);
    b.sphere([0.05, 0.025, 0.05], [x, h, z], { color: v % 2 ? '#8a9a5a' : '#c8b46a', rough: 0.4, emissive: v % 2 ? '#2a3a10' : undefined });
  }
}

function mossyLog(b: ModelBuilder, v: number): void {
  const r = rand(v * 3 + 19);
  b.joint([0, 0.07, 0], [0, r() * Math.PI, 0], (l) => {
    l.limb([-0.38, 0, 0], [0.38, 0, 0], 0.08, { color: '#4a3e2e', tex: 'wood' }, 0.07);
    l.sphere([0.3, 0.05, 0.08], [0, 0.06, 0], MOSS);
    l.sphere([0.06, 0.03, 0.05], [0.2, 0.09, 0.03], { color: '#c8b46a' });
  });
}

export const DOODADS = {
  grass: [0, 1, 2, 3, 4, 5].map((v) => (b: ModelBuilder) => sedge(b, v)),
  flowers: [0, 1, 2, 3].map((v) => (b: ModelBuilder) => (v < 2 ? cattails(b, v) : lilies(b, v))),
  stones: [0, 1, 2, 3].map((v) => (b: ModelBuilder) => mudStones(b, v)),
  forest: [
    (b: ModelBuilder) => cattails(b, 4), (b: ModelBuilder) => cattails(b, 5), (b: ModelBuilder) => toadstools(b, 0),
    (b: ModelBuilder) => toadstools(b, 1), (b: ModelBuilder) => lilies(b, 3), (b: ModelBuilder) => mossyLog(b, 0), (b: ModelBuilder) => mossyLog(b, 1),
  ],
};

/** The ground of this homeworld's half of the map. */
export const GROUND: NonNullable<BiomeArt['ground']> = { grass: ['#5a5e32', '#6a6a3a', '#4a4e2a'], dirt: ['#4a3e2a', '#3a3022'], forest: '#3a3e22', sand: '#7a6e4a', shallow: '#4a5e4e', deep: '#2a3a32' };

/** Bake this homeworld's map art (loaded only when art is needed). */
export function bakeHomeworld(onProgress?: (f: number, label: string) => void): Promise<BiomeArt> {
  return bakeBiome({ tree, bush, mine, DOODADS }, GROUND, fenWildlife, onProgress);
}
