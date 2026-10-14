// Highland Clans buildings: dark timber halls under turf roofs, dry-stone towers.
// One map tile = 2 model units; a size-n building spans 2n.
import type { Mat, ModelBuilder } from '../../kits/bake3d/types';

const TIMBER: Mat = { color: '#4a3524', tex: 'plank' };
const BEAM: Mat = { color: '#2f2117', tex: 'wood' };
const TURF: Mat = { color: '#5b6b33', tex: 'thatch', rough: 1 };
const STONE: Mat = { color: '#8e8a80', tex: 'brick' };
const ROUGH: Mat = { color: '#7a766c', tex: 'stone' };
const BANNER: Mat = { team: 'primary', tex: 'cloth' };

/** A long timber hall under a turf roof, with a stone footing and gable posts. */
function hall(b: ModelBuilder, len: number, wid: number, wallH: number): void {
  b.box([len + 0.2, 0.2, wid + 0.2], [0, 0.1, 0], ROUGH);
  b.box([len, wallH, wid], [0, 0.2 + wallH / 2, 0], TIMBER);
  for (const x of [-len / 2, len / 2]) for (const z of [-wid / 2, wid / 2]) b.cylinder(0.09, 0.1, wallH + 0.2, [x, 0.2 + wallH / 2, z], BEAM, undefined, 8);
  b.roof([len + 0.5, wid * 0.55, wid + 0.6], [0, 0.2 + wallH, 0], TURF);
  // crossed gable horns
  for (const x of [-len / 2 - 0.15, len / 2 + 0.15]) {
    b.limb([x, 0.2 + wallH + wid * 0.45, 0], [x, 0.2 + wallH + wid * 0.75, 0.3], 0.05, BEAM);
    b.limb([x, 0.2 + wallH + wid * 0.45, 0], [x, 0.2 + wallH + wid * 0.75, -0.3], 0.05, BEAM);
  }
  b.box([0.08, wallH * 0.7, 0.7], [len / 2 + 0.01, 0.2 + wallH * 0.35, 0], { color: '#1e1610', tex: 'wood' }); // door
}

export function clanHall(b: ModelBuilder): void {
  hall(b, 4.6, 3.0, 1.5);
  b.box([0.5, 1.1, 0.5], [-1.4, 3.2, 0.7], STONE); // chimney
  b.cylinder(0.04, 0.05, 2.6, [2.6, 1.3, 1.6], BEAM, undefined, 8);
  b.box([0.04, 0.6, 0.9], [2.6, 2.2, 2.05], BANNER);
  for (const [x, z] of [[2.0, -1.9], [2.4, -1.6]]) b.cylinder(0.22, 0.2, 0.45, [x, 0.22, z], { color: '#6a4a2e', tex: 'wood' }, undefined, 10); // barrels
}

export function longhouse(b: ModelBuilder): void {
  hall(b, 4.8, 2.4, 1.2);
  // a weapon rack and shields along the wall
  b.box([1.4, 0.08, 0.08], [0, 1.0, 1.32], BEAM);
  for (let i = 0; i < 3; i++) {
    b.cylinder(0.26, 0.26, 0.05, [-0.5 + i * 0.5, 0.95, 1.36], BANNER, [Math.PI / 2, 0, 0], 16);
    b.sphere(0.06, [-0.5 + i * 0.5, 0.95, 1.4], { color: '#8a8a8a', tex: 'metal', metal: 0.6 });
  }
}

export function smithy(b: ModelBuilder): void {
  b.box([3.2, 0.2, 3.2], [0, 0.1, 0], ROUGH);
  b.box([2.2, 1.4, 2.2], [-0.4, 0.9, 0], STONE);
  b.roof([2.6, 1.0, 2.6], [-0.4, 1.6, 0], TURF);
  b.box([0.6, 1.6, 0.6], [-1.1, 2.2, -0.6], STONE); // forge chimney
  b.sphere(0.12, [-1.1, 3.05, -0.6], { color: '#4a4440', rough: 1 });
  // open forge with glowing coals, anvil
  b.box([0.8, 0.6, 0.9], [1.05, 0.5, -0.6], STONE);
  b.sphere([0.3, 0.08, 0.35], [1.05, 0.82, -0.6], { color: '#ff7a2a', emissive: '#ff5a10' });
  b.box([0.5, 0.18, 0.2], [1.2, 0.55, 0.7], { color: '#3a3a3c', tex: 'metal', metal: 0.8 });
  b.box([0.22, 0.4, 0.2], [1.2, 0.3, 0.7], BEAM);
}

export function ramPen(b: ModelBuilder): void {
  b.box([5.6, 0.12, 5.6], [0, 0.06, 0], { color: '#6e5c40', tex: 'stone' });
  // dry-stone wall pen
  for (let i = 0; i < 16; i++) {
    const side = Math.floor(i / 4), k = (i % 4) / 4 - 0.375;
    const [x, z] = side === 0 ? [k * 5.2, -2.6] : side === 1 ? [2.6, k * 5.2] : side === 2 ? [-k * 5.2, 2.6] : [-2.6, -k * 5.2];
    if (side === 1 && Math.abs(k) < 0.2) continue; // gate gap
    b.rock([0.8, 0.5, 0.5], [x, 0.25, z], ROUGH, i + 3);
  }
  // shelter
  b.box([2.2, 1.2, 1.6], [-1.3, 0.72, -1.3], TIMBER);
  b.roof([2.6, 0.9, 2.0], [-1.3, 1.32, -1.3], TURF);
  b.box([1.0, 0.25, 0.6], [0.8, 0.25, 1.4], { color: '#c9b46a', tex: 'thatch' }); // hay
  b.cylinder(0.04, 0.05, 2.2, [2.4, 1.1, 2.4], BEAM, undefined, 8);
  b.box([0.04, 0.5, 0.7], [2.4, 1.95, 2.75], BANNER);
}

export function stoneTower(b: ModelBuilder): void {
  b.cylinder(1.25, 1.45, 0.3, [0, 0.15, 0], ROUGH, undefined, 14);
  b.cylinder(1.0, 1.2, 4.4, [0, 2.5, 0], STONE, undefined, 14);
  b.cylinder(1.25, 1.15, 0.35, [0, 4.85, 0], STONE, undefined, 14); // parapet
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.box([0.4, 0.35, 0.3], [Math.cos(a) * 1.15, 5.2, Math.sin(a) * 1.15], STONE, [0, -a, 0]);
  }
  // the throwing arm on the roof
  b.limb([-0.4, 5.05, 0], [0.9, 6.0, 0], 0.08, BEAM, 0.06);
  b.box([0.3, 0.3, 0.3], [-0.5, 5.2, 0], { color: '#3a3a3c', tex: 'metal', metal: 0.7 });
  b.crystal(0.35, [0.95, 6.05, 0], [0.3, 0, 0.4]);
  b.box([0.06, 0.4, 0.06], [0.95, 2.6, 1.02], { color: '#1e1610' }); // arrow slit
  b.cylinder(0.03, 0.04, 1.6, [0, 6.0, -0.6], BEAM, undefined, 8);
  b.box([0.04, 0.45, 0.6], [0, 6.5, -0.3], BANNER);
}

export function woodlandLodge(b: ModelBuilder): void {
  b.box([3.4, 0.15, 3.4], [0, 0.07, 0], { color: '#6e5c40', tex: 'stone' });
  // log cabin
  for (let i = 0; i < 5; i++) {
    b.limb([-1.2, 0.25 + i * 0.22, -0.7], [0.6, 0.25 + i * 0.22, -0.7], 0.12, { color: '#5a3e26', tex: 'wood' });
    b.limb([-1.2, 0.25 + i * 0.22, 0.7], [0.6, 0.25 + i * 0.22, 0.7], 0.12, { color: '#5a3e26', tex: 'wood' });
  }
  b.box([1.9, 1.1, 1.3], [-0.3, 0.75, 0], TIMBER);
  b.roof([2.3, 0.8, 1.9], [-0.3, 1.3, 0], TURF);
  // saplings in baskets and a woodpile
  for (const [x, z] of [[1.2, 1.1], [1.4, 0.4], [1.0, -1.2]]) {
    b.cylinder(0.14, 0.11, 0.2, [x, 0.1, z], { color: '#7a5a34', tex: 'thatch' }, undefined, 10);
    b.cone(0.18, 0.55, [x, 0.48, z], { color: '#2f5a3c', tex: 'leaf' }, undefined, 9);
  }
  for (let i = 0; i < 6; i++) b.limb([1.0 + (i % 3) * 0.24, 0.12 + Math.floor(i / 3) * 0.2, -0.2], [1.0 + (i % 3) * 0.24, 0.12 + Math.floor(i / 3) * 0.2, -0.75], 0.1, { color: '#6b4a2e', tex: 'wood' });
  b.cylinder(0.03, 0.04, 1.8, [-1.5, 0.9, 1.5], BEAM, undefined, 8);
  b.box([0.04, 0.4, 0.55], [-1.5, 1.55, 1.78], BANNER);
}

export function clanBanner(b: ModelBuilder): void {
  b.cylinder(0.035, 0.04, 1.7, [0, 0.85, 0], BEAM, undefined, 8);
  b.box([0.03, 0.5, 0.5], [0, 1.4, 0.26], BANNER);
  b.box([0.032, 0.08, 0.5], [0, 1.25, 0.26], { team: 'secondary', tex: 'cloth' });
  b.box([0.032, 0.5, 0.08], [0, 1.4, 0.26], { team: 'secondary', tex: 'cloth' });
}

/** "Needs supplies": a clan banner with an empty oat sack hung slack from a crossbar. */
export function clanWantFlag(b: ModelBuilder): void {
  b.cylinder(0.035, 0.04, 1.8, [0, 0.9, 0], BEAM, undefined, 8);
  b.box([0.03, 0.4, 0.42], [0, 1.5, 0.22], BANNER);
  b.box([0.032, 0.07, 0.42], [0, 1.4, 0.22], { team: 'secondary', tex: 'cloth' });
  b.limb([0, 1.15, 0], [0, 1.15, -0.5], 0.025, BEAM); // crossbar
  b.limb([0, 1.15, -0.45], [0, 0.98, -0.45], 0.008, { color: '#3a2a1a' });
  b.sphere([0.12, 0.2, 0.1], [0, 0.82, -0.45], { color: '#b8a070', tex: 'cloth' }); // slack, empty sack
  b.sphere([0.07, 0.04, 0.06], [0, 1.0, -0.45], { color: '#b8a070', tex: 'cloth' });
}
