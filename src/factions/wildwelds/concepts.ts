// Design options for the Wildwelds' web wall and tower (2026-11-06, for the user to choose from): more organic and
// insectile. Dev only: the sprites page bakes them (?mode=sprites&bconcept=wallA|…&size=1|2); nothing in the game uses
// them. Models in metres, a tile about 2 m across, centred on the footprint.
import type { Mat, ModelBuilder, Vec3 } from '../../kits/bake3d/types';

const PAPER: Mat = { color: '#b9ab8c', tex: 'leather', rough: 0.95 };
const PAPER_DK: Mat = { color: '#8f8268', tex: 'leather', rough: 0.95 };
const CELL: Mat = { color: '#3a3022', tex: 'none', rough: 0.9 };
const CHITIN: Mat = { color: '#2a2a22', tex: 'leather', rough: 0.3, metal: 0.35 };
const AMBER: Mat = { color: '#c98a2e', tex: 'leather', rough: 0.25, metal: 0.4 };
const SILK: Mat = { color: '#ece6d6', tex: 'none', rough: 0.85 };
const MEMBRANE: Mat = { color: '#d9d2b8', tex: 'skin', rough: 0.5 };
const RESIN: Mat = { color: '#7a5a2e', tex: 'skin', rough: 0.25, metal: 0.15 };
const EARTH: Mat = { color: '#8a6a48', tex: 'stone', rough: 0.95 };
const HOLE: Mat = { color: '#1a120a', tex: 'none', rough: 1 };
const BAND: Mat = { team: 'primary', tex: 'none', rough: 0.6 };
const DEW: Mat = { color: '#cfe8ff', tex: 'none', rough: 0.05, metal: 0.2 };

/** A steady wobble from a few numbers (the same every bake): −1 … 1. */
const jit = (...n: number[]) => { let h = 2166136261; for (const x of n) h = Math.imul(h ^ Math.round(x * 997 + 13), 16777619); return ((h >>> 0) % 2001) / 1000 - 1; };

/** A curved limb through `pts`, `r0` thick at its first point narrowing to `r1`. */
function curve(c: ModelBuilder, pts: Vec3[], r0: number, r1: number, mat: Mat): void {
  for (let i = 0; i < pts.length - 1; i++) c.limb(pts[i], pts[i + 1], r0 + (r1 - r0) * (i / (pts.length - 1)), mat, r0 + (r1 - r0) * ((i + 1) / (pts.length - 1)));
}
/** A web thread from `a` to `b`, sagging. */
function thread(c: ModelBuilder, a: Vec3, b: Vec3, sag: number, r = 0.012): void {
  const at = (k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - sag * 4 * k * (1 - k), a[2] + (b[2] - a[2]) * k];
  for (let i = 0; i < 5; i++) c.limb(at(i / 5), at((i + 1) / 5), r, SILK);
}
/** The four arms of a 1-tile piece out from its middle to each edge (so pieces in a line run into each other either way). */
const ARMS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Wall A, wasp paper: a lumpy ridge of chewed-paper lobes, layered in bands of two tones, running out to each edge, hexagonal comb cells open on its flanks. */
function wallA(b: ModelBuilder): void {
  b.sphere([0.55, 0.75, 0.55], [0, 0.6, 0], PAPER);
  for (const [dx, dz] of ARMS) for (let i = 1; i <= 3; i++) {
    const k = i / 3.2, x = dx * k * 0.95, z = dz * k * 0.95, s = 0.55 - i * 0.07;
    b.sphere([s * (dx ? 1.1 : 0.85), s * 1.2 + jit(i, dx, dz) * 0.08, s * (dz ? 1.1 : 0.85)], [x, s * 0.95, z], i % 2 ? PAPER_DK : PAPER);
  }
  for (let y = 0.25; y < 1.25; y += 0.16) b.cylinder(0.5 - (y - 0.6) ** 2 * 0.4, 0.5 - (y - 0.6) ** 2 * 0.4, 0.035, [0, y, 0], PAPER_DK, undefined, 9); // its layers
  for (let i = 0; i < 9; i++) { // comb cells on its faces
    const a = (i / 9) * Math.PI * 2 + 0.3, y = 0.35 + (i % 3) * 0.28, r = 0.5 - Math.abs(y - 0.6) * 0.3;
    b.cylinder(0.075, 0.075, 0.06, [Math.cos(a) * r, y, Math.sin(a) * r], CELL, [Math.PI / 2, 0, -a + Math.PI / 2], 6);
  }
  b.sphere([0.18, 0.08, 0.18], [0, 1.32, 0], BAND);
}

/** Wall B, thorn hedge: curved chitin spines arching up out of the ground along its arms, silk membrane stretched between them, dewdrops. */
function wallB(b: ModelBuilder): void {
  b.sphere([0.35, 0.18, 0.35], [0, 0.05, 0], CHITIN);
  for (const [dx, dz] of ARMS) for (let i = 0; i < 3; i++) {
    const k = 0.15 + i * 0.32, x = dx * k, z = dz * k, h = 1.5 - i * 0.25, lean = 0.25 * (i - 1);
    const foot: Vec3 = [x - dz * 0.12, 0, z + dx * 0.12];
    const spine: Vec3[] = [foot, [x + dx * 0.05, h * 0.45, z + dz * 0.05], [x + dx * (0.12 + lean), h * 0.82, z + dz * (0.12 + lean)], [x + dx * (0.05 + lean), h, z + dz * (0.05 + lean)]];
    curve(b, spine, 0.07, 0.012, i === 0 ? AMBER : CHITIN);
    // a membrane to the next spine out: a stretched sheet, sagging
    if (i < 2) {
      const nk = 0.15 + (i + 1) * 0.32;
      for (const y of [0.35, 0.65, 0.95]) {
        if (y > h - 0.25) continue;
        b.sphere([dx ? 0.17 : 0.015, 0.14, dz ? 0.17 : 0.015], [dx * (k + nk) / 2, y, dz * (k + nk) / 2], MEMBRANE);
      }
      thread(b, spine[2], [dx * nk, h * 0.7, dz * nk], 0.05);
    }
    b.sphere(0.022, [x + dx * 0.15, h * 0.6, z + dz * 0.15], DEW);
  }
  b.cylinder(0.07, 0.07, 0.06, [0, 0.9, 0], BAND, undefined, 8);
}

/** Wall C, resin mound: a lumpy fluted ridge of chewed earth set hard with resin, vents in it, crystals caught in its crust, a drape of web over it. */
function wallC(b: ModelBuilder): void {
  for (const [dx, dz] of ARMS) for (let i = 0; i <= 3; i++) {
    const k = i / 3.3, h = 0.95 - i * 0.12 + jit(i, dx, dz) * 0.08;
    b.sphere([0.36, h, 0.36], [dx * k, h * 0.45, dz * k], i % 2 ? EARTH : RESIN);
  }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.limb([Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3], [Math.cos(a) * 0.12, 0.95, Math.sin(a) * 0.12], 0.07, RESIN, 0.03); } // its flutes
  for (const [x, y, z] of [[0.2, 0.55, 0.28], [-0.3, 0.4, -0.15], [0.05, 0.75, -0.3]] as const) b.sphere(0.06, [x, y, z], HOLE); // vents
  for (const [x, z, k] of [[0.62, 0.05, 0.18], [-0.1, 0.55, 0.14], [-0.6, -0.05, 0.16]] as const) b.crystal(k, [x, 0.35, z], [0.4, 0, 0.3]);
  for (const [dx, dz] of ARMS) thread(b, [0, 1.0, 0], [dx * 0.95, 0.15, dz * 0.95], 0.1, 0.01);
  b.sphere([0.14, 0.06, 0.14], [0, 1.03, 0], BAND);
}

/** Tower A, paper spire: a wasp nest stood up tall, scalloped paper bands narrowing to a crown, its door low, crystals packed in its open crown and a stinger-like sling curling over the top. */
function towerA(b: ModelBuilder): void {
  const band = (y: number) => 0.95 * Math.sin(Math.min(1, y / 1.6) * Math.PI * 0.5) * (1 - Math.max(0, y - 1.6) / 4.2) + 0.25;
  for (let i = 0; i < 13; i++) {
    const y = 0.15 + i * 0.37, r = band(y);
    b.sphere([r, 0.24, r], [jit(i) * 0.04, y, jit(i, 2) * 0.04], i % 2 ? PAPER : PAPER_DK); // a scalloped band
  }
  for (const y of [1.3, 2.9]) b.cylinder(band(y) + 0.02, band(y) + 0.02, 0.1, [0, y, 0], BAND, undefined, 14);
  b.sphere([0.22, 0.28, 0.12], [band(0.7) * 0.92, 0.7, 0], HOLE); // its door
  b.cylinder(0.5, 0.3, 0.35, [0, 5.0, 0], PAPER, undefined, 12);
  for (const [x, z, k] of [[0.15, 0.05, 0.3], [-0.12, 0.12, 0.26], [0.0, -0.15, 0.28]] as const) b.crystal(k, [x, 5.1, z], [0.3 * x, 0, 0.3 * z]);
  // the stinger sling: a segmented tail curling up and over, barbed at its tip
  const tail: Vec3[] = [[0.3, 5.1, 0], [0.7, 5.6, 0], [0.85, 6.2, 0], [0.6, 6.65, 0], [0.2, 6.8, 0]];
  curve(b, tail, 0.11, 0.04, CHITIN);
  for (let i = 1; i < tail.length - 1; i++) b.sphere(0.09 - i * 0.012, tail[i], AMBER);
  b.cone(0.05, 0.22, [0.08, 6.78, 0], CHITIN, [0, 0, Math.PI / 2], 5);
}

/** Tower B, termite cathedral: a great fluted mound rising into chimneys of different heights, lumpy and ridged, vents all over, a crown of crystal in its tallest spire and a pincer on top that flings them. */
function towerB(b: ModelBuilder): void {
  b.sphere([1.7, 1.0, 1.6], [0, 0.4, 0], EARTH);
  const chimneys: Array<[number, number, number, number]> = [[0, 0, 5.0, 0.62], [0.9, 0.5, 3.0, 0.38], [-0.8, 0.6, 2.4, 0.34], [0.6, -0.9, 3.6, 0.36], [-0.7, -0.7, 2.0, 0.3]];
  chimneys.forEach(([x, z, h, r], i) => {
    for (let k = 0; k < 6; k++) { const y = (k / 6) * h, rr = r * (1 - (k / 6) * 0.55) + jit(i, k) * 0.03; b.sphere([rr, h / 9, rr], [x + jit(k, i) * 0.04, y + h / 12, z], k % 2 ? EARTH : RESIN); }
    for (let f = 0; f < 5; f++) { const a = (f / 5) * Math.PI * 2 + i; b.limb([x + Math.cos(a) * r, 0.1, z + Math.sin(a) * r], [x + Math.cos(a) * r * 0.4, h * 0.9, z + Math.sin(a) * r * 0.4], 0.06, RESIN, 0.025); } // ridges
    b.sphere(0.07, [x + r * 0.7, h * 0.4, z], HOLE);
  });
  b.cylinder(0.66, 0.66, 0.12, [0, 1.6, 0], BAND, undefined, 12);
  for (const [x, z, k] of [[0.12, 0, 0.3], [-0.1, 0.1, 0.25]] as const) b.crystal(k, [x, 5.1, z], [0.3 * x, 0, 0.3 * z]);
  // a pincer: two curved mandible blades on the tallest spire, closing on a crystal to fling it
  for (const s of [1, -1]) curve(b, [[0, 4.9, s * 0.12], [0.35, 5.35, s * 0.3], [0.7, 5.6, s * 0.2], [0.85, 5.55, s * 0.03]], 0.07, 0.02, CHITIN);
}

/** Tower C, chitin claw: a footing of overlapping exoskeleton plates, out of which a giant jointed insect leg arches up and over, its claw cupping crystals to fling; silk binding at its joints, guyed down with web. */
function towerC(b: ModelBuilder): void {
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; b.sphere([0.75, 0.35, 0.5], [Math.cos(a) * 0.8, 0.25, Math.sin(a) * 0.8], i % 2 ? CHITIN : AMBER, [0, -a, 0.25]); } // the plates
  b.sphere([0.9, 0.6, 0.9], [0, 0.45, 0], CHITIN);
  // the leg: coxa up, femur up and back, tibia forward over the top, the claw at its end
  const hip: Vec3 = [0, 0.9, 0], knee: Vec3 = [-0.5, 3.4, 0], ankle: Vec3 = [0.4, 5.3, 0], claw: Vec3 = [1.2, 5.1, 0];
  b.limb(hip, knee, 0.42, CHITIN, 0.3);
  b.limb(knee, ankle, 0.28, AMBER, 0.2);
  b.limb(ankle, claw, 0.18, CHITIN, 0.12);
  for (const j of [knee, ankle]) { b.sphere(0.34, j, CHITIN); b.cylinder(0.36, 0.36, 0.12, j, SILK, [0, 0, 0.8], 10); }
  for (let i = 0; i < 4; i++) b.cone(0.05, 0.25, [knee[0] + 0.45 * (i / 4), knee[1] + 0.95 * (i / 4), 0.22], CHITIN, [0, 0, -0.5], 4); // spines along the tibia
  for (const s of [1, -1]) curve(b, [claw, [1.45, 5.0, s * 0.18], [1.5, 5.25, s * 0.22], [1.38, 5.45, s * 0.1]], 0.07, 0.02, CHITIN); // the claw's fingers
  for (const [x, z, k] of [[1.35, 0.05, 0.24], [1.3, -0.08, 0.2]] as const) b.crystal(k, [x, 5.25, z], [0, 0, 0.5]);
  b.cylinder(0.5, 0.5, 0.1, [-0.2, 2.2, 0], BAND, [0, 0, 0.2], 10);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) thread(b, [knee[0] * 0.6, 2.6, 0], [sx * 1.8, 0.05, sz * 1.8], 0.12, 0.014);
}

export const WEB_CONCEPTS: Record<string, { model: (b: ModelBuilder) => void; size: number }> = {
  wallA: { model: wallA, size: 1 }, wallB: { model: wallB, size: 1 }, wallC: { model: wallC, size: 1 },
  towerA: { model: towerA, size: 2 }, towerB: { model: towerB, size: 2 }, towerC: { model: towerC, size: 2 },
};
