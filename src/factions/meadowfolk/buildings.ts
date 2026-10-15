// Meadowfolk building models. 1 tile = 2 model units; origin = footprint centre,
// so a building of `size` tiles spans ±size units on x and z.
import type { Mat, ModelBuilder } from '../../kits/bake3d/types';

const WOOD: Mat = { color: '#5e4128', tex: 'wood' };
const DARKWOOD: Mat = { color: '#3d2a1a', tex: 'wood' };
const STONE: Mat = { color: '#8a857c', tex: 'stone' };
const DARKSTONE: Mat = { color: '#6f6a62', tex: 'stone' };
const PLASTER: Mat = { color: '#d6c9a8', tex: 'stone', rough: 0.95 };
const THATCH: Mat = { color: '#9a7f4c', tex: 'thatch' };
const SHINGLE: Mat = { color: '#5a3a2a', tex: 'wood' };
const HAY: Mat = { color: '#c9a961', tex: 'thatch' };
const IRON: Mat = { color: '#3a3a3a', tex: 'metal' };
const BANNER: Mat = { team: 'primary', tex: 'cloth' };
const TRIM: Mat = { team: 'secondary', tex: 'cloth' };
const WINDOW: Mat = { color: '#1d1610' };

function barrel(b: ModelBuilder, x: number, z: number, y = 0.35): void {
  b.cylinder(0.22, 0.2, 0.55, [x, y + 0.27, z], WOOD, undefined, 12);
  b.cylinder(0.225, 0.225, 0.05, [x, y + 0.4, z], IRON, undefined, 12);
  b.cylinder(0.225, 0.225, 0.05, [x, y + 0.13, z], IRON, undefined, 12);
}

function crate(b: ModelBuilder, x: number, z: number, s = 0.45, y = 0.35, rot = 0.3): void {
  b.box([s, s, s], [x, y + s / 2, z], WOOD, [0, rot, 0]);
}

/** Timber-framed walls: plaster box with dark posts and beams on every face. */
function timberHall(b: ModelBuilder, cx: number, cz: number, w: number, d: number, h: number, base: number): void {
  b.box([w, h, d], [cx, base + h / 2, cz], PLASTER);
  const posts = Math.max(2, Math.round(w / 1.3));
  for (let i = 0; i <= posts; i++) {
    const x = cx - w / 2 + (i / posts) * w;
    for (const z of [cz - d / 2, cz + d / 2]) b.box([0.13, h, 0.13], [x, base + h / 2, z], DARKWOOD);
  }
  const zp = Math.max(2, Math.round(d / 1.3));
  for (let i = 0; i <= zp; i++) {
    const z = cz - d / 2 + (i / zp) * d;
    for (const x of [cx - w / 2, cx + w / 2]) b.box([0.13, h, 0.13], [x, base + h / 2, z], DARKWOOD);
  }
  for (const y of [base + 0.08, base + h * 0.55, base + h - 0.06]) {
    b.box([w + 0.04, 0.12, 0.12], [cx, y, cz + d / 2], DARKWOOD);
    b.box([0.12, 0.12, d + 0.04], [cx + w / 2, y, cz], DARKWOOD);
  }
}

function flag(b: ModelBuilder, x: number, y: number, z: number, pole = 1.3): void {
  b.cylinder(0.035, 0.035, pole, [x, y + pole / 2, z], DARKWOOD, undefined, 6);
  b.box([0.04, 0.42, 0.7], [x, y + pole - 0.25, z + 0.36], BANNER);
}

export function townCenter(b: ModelBuilder): void {
  b.box([5.7, 0.35, 5.7], [0, 0.175, 0], STONE);
  b.box([5.9, 0.12, 5.9], [0, 0.06, 0], DARKSTONE);
  const hw = 4.0, hd = 3.0, hh = 2.0, base = 0.35;
  timberHall(b, 0.3, 0.4, hw, hd, hh, base);
  b.limb([0.3 + hw / 2 + 0.02, base + 0.1, 0.4 - hd / 2 + 0.1], [0.3 + hw / 2 + 0.02, base + hh * 0.55, 0.35], 0.05, DARKWOOD);
  b.box([0.08, 1.15, 0.8], [0.3 + hw / 2 + 0.04, base + 0.575, 0.6], { color: '#2e1f14', tex: 'wood' });
  b.roof([0.9, 0.45, 1.3], [0.3 + hw / 2 + 0.4, base + 1.4, 0.6], THATCH);
  for (const z of [0.05, 1.15]) b.limb([0.3 + hw / 2 + 0.75, base, z], [0.3 + hw / 2 + 0.75, base + 1.4, z], 0.05, DARKWOOD);
  for (const z of [-0.6, 1.4]) b.box([0.06, 0.4, 0.35], [0.3 + hw / 2 + 0.03, base + 1.25, z], WINDOW);
  for (const x of [-1.2, 1.4]) b.box([0.35, 0.4, 0.06], [0.3 + x, base + 1.25, 0.4 + hd / 2 + 0.03], WINDOW);
  b.roof([hw + 0.9, 1.9, hd + 0.9], [0.3, base + hh, 0.4], THATCH);
  b.box([hw * 0.45, 0.12, 0.14], [0.3, base + hh + 1.82, 0.4], DARKWOOD);
  for (const z of [-0.2, 1.0]) {
    b.box([0.04, 0.9, 0.36], [0.3 + hw / 2 + 0.1, base + 1.3, z], BANNER);
    b.box([0.045, 0.12, 0.38], [0.3 + hw / 2 + 0.1, base + 1.7, z], TRIM);
  }
  b.box([0.36, 0.9, 0.04], [-0.1, base + 1.3, 0.4 + hd / 2 + 0.1], BANNER);
  const tx = -1.75, tz = -1.75;
  b.box([1.5, 3.6, 1.5], [tx, base + 1.8, tz], STONE);
  b.box([1.7, 0.25, 1.7], [tx, base + 3.65, tz], DARKSTONE);
  for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) b.box([0.3, 0.4, 0.3], [tx + dx, base + 3.95, tz + dz], STONE);
  b.roof([1.4, 1.5, 1.4], [tx, base + 3.9, tz], SHINGLE);
  flag(b, tx, base + 5.1, tz);
  b.box([0.2, 0.6, 0.06], [tx + 0.76, base + 2.6, tz], WINDOW);
  barrel(b, 2.35, -1.9); barrel(b, 2.0, -2.3);
  crate(b, 2.4, 2.3, 0.5); crate(b, 2.1, 2.35, 0.4, 0.8, 0.8);
  b.crystal(0.45, [-0.8, base, 2.5], [0.2, 0, 0.3]);
  b.crystal(0.35, [-0.55, base, 2.6], [-0.3, 0, -0.2]);
}

export function barracks(b: ModelBuilder): void {
  const base = 0.25;
  b.box([5.6, base, 5.6], [0, base / 2, 0], { color: '#7a6a52', tex: 'stone' });
  // long hall along x at the back
  timberHall(b, -0.6, -1.0, 4.4, 2.4, 1.6, base);
  b.roof([5.0, 1.4, 3.0], [-0.6, base + 1.6, -1.0], THATCH);
  b.box([0.08, 1.0, 0.7], [1.64, base + 0.5, -1.0], { color: '#2e1f14', tex: 'wood' });
  b.box([0.04, 0.8, 0.34], [1.68, base + 1.05, -0.2], BANNER);
  b.box([0.04, 0.8, 0.34], [1.68, base + 1.05, -1.8], BANNER);
  // palisade around a practice yard at the front
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    b.cylinder(0.08, 0.09, 1.0, [-2.6 + t * 5.2, base + 0.5, 2.6], WOOD, undefined, 6);
    b.cone(0.09, 0.2, [-2.6 + t * 5.2, base + 1.1, 2.6], WOOD, undefined, 6);
  }
  for (let i = 0; i <= 6; i++) b.cylinder(0.08, 0.09, 1.0, [2.6, base + 0.5, 0.4 + (i / 6) * 2.2], WOOD, undefined, 6);
  // weapon rack and a training post
  b.box([1.2, 0.08, 0.1], [0.2, base + 0.9, 1.2], DARKWOOD);
  for (let i = 0; i < 4; i++) b.limb([-0.2 + i * 0.27, base, 1.25], [-0.15 + i * 0.27, base + 1.2, 1.15], 0.025, WOOD);
  b.cylinder(0.08, 0.1, 1.5, [1.6, base + 0.75, 1.4], WOOD, undefined, 8);
  b.sphere([0.2, 0.3, 0.2], [1.6, base + 1.2, 1.4], HAY);
  flag(b, -2.6, base, -2.4, 2.2);
  barrel(b, -2.2, 1.6, base);
}

export function lynxDen(b: ModelBuilder): void {
  const base = 0.2;
  b.box([5.6, base, 5.6], [0, base / 2, 0], { color: '#7a6a52', tex: 'stone' });
  // open-fronted stable: back wall, side walls, posts
  b.box([4.6, 1.5, 0.25], [0, base + 0.75, -2.1], WOOD);
  for (const x of [-2.3, 2.3]) b.box([0.25, 1.5, 3.2], [x, base + 0.75, -0.6], WOOD);
  for (const x of [-2.3, -0.8, 0.8, 2.3]) b.limb([x, base, 0.9], [x, base + 1.6, 0.9], 0.08, DARKWOOD);
  for (const x of [-1.55, 0, 1.55]) b.box([0.12, 0.9, 2.6], [x, base + 0.45, -0.7], DARKWOOD); // stall dividers
  b.roof([5.6, 1.3, 3.8], [0, base + 1.55, -0.6], THATCH);
  // hay, troughs, a scratching post with claw marks
  for (const [x, z] of [[-1.9, 1.7], [-1.3, 2.0], [-1.6, 2.3]]) b.box([0.6, 0.4, 0.45], [x, base + 0.2, z], HAY, [0, x, 0]);
  b.box([1.2, 0.25, 0.35], [1.0, base + 0.15, 1.6], WOOD);
  b.box([1.1, 0.06, 0.28], [1.0, base + 0.26, 1.6], { color: '#3f6a7a', rough: 0.2 });
  b.cylinder(0.14, 0.18, 1.6, [2.2, base + 0.8, 2.1], { color: '#8a6a4a', tex: 'wood' }, undefined, 8);
  b.box([0.04, 0.8, 0.34], [0, base + 1.2, -1.95], BANNER);
  flag(b, 2.3, base + 1.5, -2.0, 1.4);
}

export function forge(b: ModelBuilder): void {
  const base = 0.2;
  b.box([3.7, base, 3.7], [0, base / 2, 0], DARKSTONE);
  b.box([2.6, 1.6, 2.2], [-0.4, base + 0.8, -0.4], STONE);
  b.roof([3.0, 0.9, 2.6], [-0.4, base + 1.6, -0.4], SHINGLE);
  // chimney with a crystal-fire glow
  b.box([0.7, 3.0, 0.7], [-1.2, base + 1.5, -1.2], STONE);
  b.box([0.8, 0.15, 0.8], [-1.2, base + 3.05, -1.2], DARKSTONE);
  b.box([0.08, 0.6, 0.8], [0.92, base + 0.5, -0.4], { color: '#ff8a3a', emissive: '#ff6a1a' });
  // lean-to with the anvil
  b.limb([1.6, base, 0.9], [1.6, base + 1.3, 0.9], 0.06, DARKWOOD);
  b.limb([0.2, base, 1.6], [0.2, base + 1.3, 1.6], 0.06, DARKWOOD);
  b.roof([1.8, 0.4, 1.8], [0.9, base + 1.3, 0.9], SHINGLE);
  b.box([0.25, 0.4, 0.25], [0.9, base + 0.2, 0.9], DARKWOOD);
  b.box([0.5, 0.15, 0.22], [0.9, base + 0.47, 0.9], IRON);
  b.crystal(0.3, [1.15, base + 0.55, 0.95], [0, 0, -1.2]);
  barrel(b, 1.5, -1.2, base);
  for (const [x, z] of [[-1.5, 1.4], [-1.2, 1.6], [-1.6, 1.0]]) b.crystal(0.35, [x, base, z], [x, 0, z * 0.3]);
  b.box([0.04, 0.6, 0.3], [0.92, base + 1.2, -1.1], BANNER);
}

export function greatHall(b: ModelBuilder): void {
  const base = 0.45;
  b.box([7.7, base, 7.7], [0, base / 2, 0], STONE);
  b.box([7.9, 0.15, 7.9], [0, 0.07, 0], DARKSTONE);
  // stone ground floor, timber upper floor
  b.box([5.4, 1.8, 4.2], [0, base + 0.9, 0], STONE);
  timberHall(b, 0, 0, 5.0, 3.8, 1.5, base + 1.8);
  b.roof([6.0, 2.4, 4.8], [0, base + 3.3, 0], SHINGLE);
  b.box([2.4, 0.14, 0.16], [0, base + 5.62, 0], DARKWOOD);
  // twin front towers
  for (const z of [-2.6, 2.6]) {
    b.cylinder(0.9, 1.0, 4.4, [2.6, base + 2.2, z], STONE, undefined, 12);
    b.cylinder(1.05, 1.05, 0.25, [2.6, base + 4.45, z], DARKSTONE, undefined, 12);
    b.cone(1.15, 1.8, [2.6, base + 5.45, z], SHINGLE, undefined, 12);
    flag(b, 2.6, base + 6.2, z, 1.2);
    b.box([0.06, 0.5, 0.18], [3.5, base + 2.8, z], WINDOW);
  }
  // great door, banners, stairs
  b.box([0.1, 1.5, 1.3], [2.72, base + 0.75, 0], { color: '#2e1f14', tex: 'wood' });
  b.cylinder(0.65, 0.65, 0.1, [2.74, base + 1.5, 0], { color: '#2e1f14', tex: 'wood' }, [Math.PI / 2, 0, Math.PI / 2], 12);
  for (const z of [-1.2, 1.2]) {
    b.box([0.05, 1.6, 0.5], [2.75, base + 1.4, z], BANNER);
    b.box([0.055, 0.15, 0.52], [2.75, base + 2.15, z], TRIM);
  }
  for (let i = 0; i < 3; i++) b.box([0.4, 0.15, 1.8], [3.0 + i * 0.35, base - 0.07 - i * 0.15, 0], STONE);
  for (const [x, z] of [[-3.2, 3.2], [-3.4, 2.8]]) barrel(b, x, z, base);
  b.crystal(0.6, [-3.0, base, -3.1], [0.2, 0, 0.3]);
}

/** Watch post on stilts with a throwing arm; height is part of its weapon. */
export function watchtower(b: ModelBuilder): void {
  const h = 4.2;
  b.box([1.9, 0.15, 1.9], [0, 0.07, 0], DARKSTONE);
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
    b.limb([x, 0.1, z], [x * 0.75, h, z * 0.75], 0.09, WOOD);
  }
  for (const y of [1.3, 2.6]) {
    b.limb([-0.65, y, 0.65], [0.65, y + 0.6, 0.65], 0.04, DARKWOOD);
    b.limb([0.65, y, -0.65], [0.65, y + 0.6, 0.65], 0.04, DARKWOOD);
  }
  b.box([1.6, 0.14, 1.6], [0, h, 0], WOOD);
  for (const [x, z, w, d] of [[0, 0.78, 1.6, 0.06], [0, -0.78, 1.6, 0.06], [0.78, 0, 0.06, 1.6], [-0.78, 0, 0.06, 1.6]] as const) b.box([w, 0.45, d], [x, h + 0.3, z], WOOD);
  b.roof([1.9, 1.0, 1.9], [0, h + 1.4, 0], THATCH);
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) b.limb([x, h, z], [x, h + 1.4, z], 0.04, DARKWOOD);
  // throwing arm poking out the front
  b.limb([0.2, h + 0.3, 0], [1.3, h + 1.1, 0], 0.05, DARKWOOD);
  b.cylinder(0.12, 0.08, 0.07, [1.3, h + 1.12, 0], { color: '#5a3f28', tex: 'leather' });
  b.crystal(0.18, [1.3, h + 1.16, 0]);
  b.box([0.04, 0.5, 0.3], [0.8, h - 0.35, 0], BANNER);
}

/** Rally-point marker in team colours. */
export function rallyFlag(b: ModelBuilder): void {
  b.cylinder(0.035, 0.04, 1.6, [0, 0.8, 0], DARKWOOD, undefined, 8);
  b.box([0.03, 0.4, 0.6], [0, 1.38, 0.3], { team: 'primary', tex: 'cloth' });
}

/** Open-sided work shed with a log pile, berry baskets, seed sacks and a crate of crystal. */
export function gatheringCamp(b: ModelBuilder): void {
  const base = 0.15;
  b.box([3.7, base, 3.7], [0, base / 2, 0], { color: '#7a6a52', tex: 'stone' });
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) b.limb([x, base, z], [x, base + 1.7, z], 0.07, DARKWOOD);
  b.roof([3.2, 0.9, 3.2], [0, base + 1.7, 0], THATCH);
  b.box([2.8, 0.1, 0.1], [0, base + 1.65, 1.3], DARKWOOD);
  b.box([0.1, 0.1, 2.8], [1.3, base + 1.65, 0], DARKWOOD);
  for (let i = 0; i < 7; i++) {
    const row = i < 4 ? 0 : 1, k = row ? i - 4 : i;
    b.limb([-1.1, base + 0.12 + row * 0.2, -0.7 + k * 0.22 + row * 0.11], [0.3, base + 0.12 + row * 0.2, -0.7 + k * 0.22 + row * 0.11], 0.1, { color: '#5e4128', tex: 'wood' });
  }
  for (const [x, z] of [[0.7, 0.6], [1.05, 0.95], [0.5, 1.05]]) {
    b.cylinder(0.2, 0.16, 0.3, [x, base + 0.15, z], { color: '#a5814f', tex: 'thatch' });
    for (let i = 0; i < 5; i++) b.sphere(0.05, [x + Math.cos(i * 1.3) * 0.09, base + 0.32, z + Math.sin(i * 1.3) * 0.09], { color: i % 2 ? '#8c1f2b' : '#5a1f3c', rough: 0.4 });
  }
  // seed sacks and saplings waiting to go in
  for (const [x, z] of [[0.9, -0.6], [1.1, -0.2]]) b.sphere([0.18, 0.22, 0.16], [x, base + 0.2, z], { color: '#b8a274', tex: 'cloth' });
  for (const [x, z] of [[-1.6, 0.2], [-1.6, 0.6]]) { b.cylinder(0.1, 0.08, 0.15, [x, base + 0.07, z], { color: '#6a4a2e', tex: 'wood' }); b.cone(0.14, 0.4, [x, base + 0.35, z], { color: '#3f6a2a', tex: 'leaf' }); }
  b.box([0.6, 0.4, 0.5], [-0.7, base + 0.2, 1.0], WOOD);
  for (const [dx, dz, r] of [[-0.1, 0, 0.3], [0.12, 0.08, -0.4], [0.02, -0.12, 0.1]]) b.crystal(0.32, [-0.7 + dx, base + 0.38, 1.0 + dz], [r, 0, r * 0.5]);
  b.limb([1.6, base, 1.6], [1.6, base + 2.3, 1.6], 0.035, DARKWOOD);
  b.box([0.04, 0.4, 0.62], [1.6, base + 2.05, 1.92], BANNER);
}

/** "Needs supplies": a pennant with an empty berry basket upturned on the pole. */
export function wantFlag(b: ModelBuilder): void {
  b.cylinder(0.035, 0.04, 1.7, [0, 0.85, 0], DARKWOOD, undefined, 8);
  b.box([0.03, 0.3, 0.5], [0, 1.45, 0.26], { team: 'primary', tex: 'cloth' });
  b.cylinder(0.24, 0.17, 0.26, [0, 1.82, 0], { color: '#a8844e', tex: 'thatch' }, [Math.PI, 0, 0.2], 12); // upturned basket
  b.cylinder(0.25, 0.25, 0.04, [0.04, 1.69, 0], { color: '#7a5a34', tex: 'wood' }, [0, 0, 0.2], 12); // its rim
  b.sphere([0.2, 0.08, 0.16], [0.18, 0.06, -0.12], { color: '#c9b48a', tex: 'cloth' }); // an empty sack slumped at the foot
}

