// Fenfolk buildings: reed and willow on stilts over the water, peat walls, an earthen mound.
// One map tile = 2 model units; a size-n building spans 2n.
import type { Mat, ModelBuilder } from '../../kits/bake3d/types';

const REED: Mat = { color: '#b8a466', tex: 'thatch' };
const REED_DARK: Mat = { color: '#8a7a48', tex: 'thatch' };
const WILLOW: Mat = { color: '#6a5a3c', tex: 'wood' };
const PEAT: Mat = { color: '#3e3226', tex: 'stone' };
const MUD: Mat = { color: '#5a4a34', tex: 'stone' };
const BANNER: Mat = { team: 'primary', tex: 'cloth' };

/** A platform on stilts. */
function stilts(b: ModelBuilder, w: number, d: number, h: number): void {
  for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) for (const z of [-d / 2 + 0.15, d / 2 - 0.15]) b.cylinder(0.06, 0.07, h, [x, h / 2, z], WILLOW, undefined, 6);
  b.box([w, 0.1, d], [0, h, 0], { color: '#7a6644', tex: 'plank' });
}

export function stiltHall(b: ModelBuilder): void {
  b.cylinder(2.8, 3.0, 0.08, [0, 0.04, 0], MUD, undefined, 18);
  stilts(b, 4.8, 4.0, 0.9);
  b.cylinder(1.9, 2.1, 1.3, [0, 1.6, 0], REED_DARK, undefined, 16);
  b.cone(2.5, 1.9, [0, 3.2, 0], REED, undefined, 16);
  b.box([0.6, 0.9, 0.08], [0, 1.4, 2.05], { color: '#2a2016', tex: 'wood' }); // doorway
  b.limb([2.5, 0.0, 0.3], [1.2, 0.95, 0.3], 0.05, WILLOW); // ladder rails
  b.limb([2.5, 0.0, -0.3], [1.2, 0.95, -0.3], 0.05, WILLOW);
  b.cylinder(0.035, 0.04, 2.4, [-2.3, 1.2, 1.7], WILLOW, undefined, 8);
  b.box([0.04, 0.45, 0.7], [-2.3, 2.15, 2.05], BANNER);
}

export function reedHut(b: ModelBuilder): void {
  stilts(b, 1.7, 1.7, 0.5);
  b.cylinder(0.7, 0.75, 0.55, [0, 0.82, 0], REED_DARK, undefined, 12);
  b.cone(0.95, 0.85, [0, 1.5, 0], REED, undefined, 12);
  b.box([0.04, 0.3, 0.4], [0.75, 0.8, 0], { color: '#2a2016' });
  b.cylinder(0.025, 0.03, 1.4, [-0.8, 0.7, 0.8], WILLOW, undefined, 6);
  b.box([0.03, 0.3, 0.4], [-0.8, 1.25, 1.0], BANNER);
}

export function peatFarm(b: ModelBuilder): void {
  b.box([3.6, 0.1, 3.6], [0, 0.05, 0], MUD);
  // raised beds of dark peat between water channels
  for (const z of [-1.1, 0, 1.1]) {
    b.box([3.0, 0.22, 0.8], [0, 0.16, z], PEAT);
    for (let i = 0; i < 5; i++) b.sphere([0.16, 0.12, 0.16], [-1.2 + i * 0.6, 0.34, z], { color: i % 2 ? '#3d5a28' : '#4a6a2e', tex: 'leaf' });
  }
  for (const z of [-0.55, 0.55]) b.box([3.0, 0.04, 0.22], [0, 0.07, z], { color: '#3a5a66', rough: 0.2 });
  b.box([0.5, 0.4, 0.4], [1.5, 0.3, 1.6], PEAT); // stacked peat bricks
  b.cylinder(0.025, 0.03, 1.6, [-1.6, 0.8, -1.6], WILLOW, undefined, 6);
  b.box([0.03, 0.35, 0.5], [-1.6, 1.4, -1.35], BANNER);
}

export function toadWallow(b: ModelBuilder): void {
  b.cylinder(1.8, 1.9, 0.12, [0, 0.06, 0], MUD, undefined, 16);
  b.cylinder(1.3, 1.3, 0.05, [0.2, 0.13, 0.2], { color: '#3e5a4a', rough: 0.15 }, undefined, 16); // the pool
  for (let i = 0; i < 9; i++) { // reeds around it
    const a = (i / 9) * Math.PI * 2;
    b.limb([Math.cos(a) * 1.55, 0.1, Math.sin(a) * 1.55], [Math.cos(a) * 1.6, 0.9 + (i % 3) * 0.15, Math.sin(a) * 1.6], 0.025, REED);
  }
  stilts(b, 1.4, 1.4, 0.7);
  b.cone(0.95, 0.8, [0, 1.15, 0], REED, undefined, 10);
  b.sphere([0.4, 0.22, 0.35], [-0.9, 0.3, -0.7], { color: '#5a6a3a', tex: 'leather' }); // a toad dozing
  b.cylinder(0.025, 0.03, 1.5, [1.5, 0.75, -1.2], WILLOW, undefined, 6);
  b.box([0.03, 0.35, 0.5], [1.5, 1.3, -0.95], BANNER);
}

export function elderMound(b: ModelBuilder): void {
  b.sphere([2.7, 1.5, 2.7], [0, 0, 0], { color: '#4f5a34', tex: 'leaf' }); // grassed earthen mound
  b.box([0.7, 0.9, 0.1], [0, 0.45, 2.55], { color: '#2a2016', tex: 'wood' }); // low door
  b.box([0.95, 0.15, 0.2], [0, 0.95, 2.55], { color: '#8a857c', tex: 'stone' }); // lintel
  for (let i = 0; i < 6; i++) { // ring of standing stones
    const a = (i / 6) * Math.PI * 2 + 0.3;
    b.box([0.3, 1.2 + (i % 2) * 0.4, 0.22], [Math.cos(a) * 3.3, 0.6 + (i % 2) * 0.2, Math.sin(a) * 3.3], { color: '#8a857c', tex: 'stone' }, [0, -a, 0.05]);
  }
  // an old willow growing out of the top
  b.limb([0, 1.3, 0], [0.1, 2.6, 0.1], 0.18, WILLOW, 0.1);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.sphere([0.7, 0.45, 0.7], [Math.cos(a) * 0.6, 2.7, Math.sin(a) * 0.6], { color: '#6a7a3a', tex: 'leaf' });
    b.limb([Math.cos(a) * 0.8, 2.6, Math.sin(a) * 0.8], [Math.cos(a) * 1.1, 1.6, Math.sin(a) * 1.1], 0.03, { color: '#7a8a44', tex: 'leaf' }); // trailing fronds
  }
  b.sphere(0.18, [0.6, 1.4, 1.7], { color: '#7ad7ef', emissive: '#3aa7c8' }); // a lamp crystal by the door
}

export function heronPerch(b: ModelBuilder): void {
  // a very tall stilt platform with a sling-arm on top
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) b.limb([x * 1.2, 0, z * 1.2], [x * 0.7, 6.4, z * 0.7], 0.07, WILLOW, 0.05);
  for (const y of [1.6, 3.2, 4.8]) b.box([1.3, 0.06, 1.3], [0, y, 0], { color: '#5a4a30', tex: 'wood' }); // cross-ties
  b.box([1.4, 0.1, 1.4], [0, 6.4, 0], { color: '#7a6644', tex: 'plank' });
  b.cone(0.95, 0.7, [0, 7.6, 0], REED, undefined, 8);
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) b.limb([x, 6.4, z], [x, 7.3, z], 0.035, WILLOW);
  b.limb([-0.3, 6.6, 0], [0.8, 7.2, 0], 0.05, WILLOW, 0.03); // sling-arm
  b.crystal(0.22, [0.85, 7.15, 0], [0.3, 0, 0.4]);
  b.cylinder(0.025, 0.03, 1.2, [0.6, 8.0, 0.6], WILLOW, undefined, 6);
  b.box([0.03, 0.35, 0.45], [0.6, 8.4, 0.85], BANNER);
}

export function fenBanner(b: ModelBuilder): void {
  b.cylinder(0.03, 0.035, 1.6, [0, 0.8, 0], WILLOW, undefined, 8);
  b.box([0.03, 0.55, 0.4], [0, 1.3, 0.21], BANNER);
  for (let i = 0; i < 3; i++) b.limb([0, 1.6, 0], [0.05, 1.85 + i * 0.05, (i - 1) * 0.06], 0.012, REED); // reed tassel
}
