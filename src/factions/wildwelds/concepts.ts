// Design options for the Wildwelds' web wall and tower (2026-11-06, for the user to choose from): more organic and
// insectile. Dev only: the sprites page bakes them (?mode=sprites&bconcept=wallA|…&size=1|2); nothing in the game uses
// them. Models in metres, a tile about 2 m across, centred on the footprint.
import type { BuildingState, Mat, ModelBuilder, Vec3 } from '../../kits/bake3d/types';

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

// ── round 2 (2026-11-06): walls that join their neighbours with web, in the Wildwelds' chitin; towers growing from the
//    chitin claw (the user: "the beginning of the right direction")

/** The sides a wall piece joins its neighbours on (BuildingState.joins): bit, and which way: +x, −x, +z, −z. */
const SIDES: Array<[number, number, number]> = [[1, 1, 0], [2, -1, 0], [4, 0, 1], [8, 0, -1]];
const joinsOf = (state?: BuildingState) => state?.joins ?? (state ? 0 : 3); // (no state: a straight run)

/** Wall D, web curtain: a chitin post, and toward each neighbour web hung in sheets across to the tile's edge, where the neighbour's meets it; spines leaning out. */
function wallD(b: ModelBuilder, state?: BuildingState): void {
  const j = joinsOf(state);
  b.sphere([0.3, 0.2, 0.3], [0, 0.08, 0], CHITIN);
  curve(b, [[0, 0, 0], [0.03, 0.7, 0.02], [0.08, 1.35, 0.04], [0.03, 1.7, 0.02]], 0.12, 0.03, CHITIN);
  for (const y of [0.55, 1.15]) b.sphere(0.1, [0.02 + y * 0.04, y, 0.02], AMBER);
  b.cylinder(0.12, 0.12, 0.08, [0.04, 0.9, 0.02], BAND, undefined, 8);
  for (const [bit, dx, dz] of SIDES) {
    if (!(j & bit)) continue;
    const e = (y: number): Vec3 => [dx * 1.0, y, dz * 1.0];
    for (const [y0, y1] of [[1.6, 1.45], [1.3, 1.2], [1.0, 0.95], [0.7, 0.7], [0.4, 0.42]] as const) thread(b, [dx * 0.06, y0, dz * 0.06], e(y1), 0.06, 0.012);
    for (const k of [0.3, 0.6, 0.9]) thread(b, [dx * k, 1.55 - k * 0.1, dz * k], [dx * k, 0.15, dz * k], 0.02, 0.009); // the curtain's verticals
    for (const [k, y] of [[0.35, 1.05], [0.7, 0.85]] as const) b.sphere([dx ? 0.2 : 0.01, 0.38, dz ? 0.2 : 0.01], [dx * k, y, dz * k], MEMBRANE);
    curve(b, [[dx * 0.1, 0.05, dz * 0.1], [dx * 0.35, 0.45, dz * 0.35], [dx * 0.5, 0.7, dz * 0.5]], 0.05, 0.012, AMBER);
    b.sphere(0.022, [dx * 0.5, 1.1, dz * 0.5], DEW);
  }
}

/** Wall E, carapace ridge: overlapping armour plates like a caterpillar's back, running on to each neighbour, the seams between bound in silk; a crest of short spines. */
function wallE(b: ModelBuilder, state?: BuildingState): void {
  const j = joinsOf(state);
  b.sphere([0.45, 0.55, 0.45], [0, 0.35, 0], CHITIN);
  for (const y of [0.25, 0.55]) b.cylinder(0.47 - y * 0.2, 0.47 - y * 0.2, 0.05, [0, y, 0], AMBER, undefined, 10);
  for (let i = 0; i < 3; i++) b.cone(0.05, 0.28, [0, 0.82 + i * 0.03, -0.12 + i * 0.12], AMBER, [0, 0, 0], 4);
  b.cylinder(0.3, 0.3, 0.06, [0, 0.7, 0], BAND, undefined, 10);
  for (const [bit, dx, dz] of SIDES) {
    if (!(j & bit)) continue;
    for (let i = 1; i <= 3; i++) {
      const k = i * 0.3, h = 0.5 - i * 0.03;
      b.sphere([dx ? 0.22 : 0.42, h, dz ? 0.22 : 0.42], [dx * k, h * 0.62, dz * k], i % 2 ? AMBER : CHITIN, [0, 0, dx * 0.3]); // a plate, overlapping the last
      b.cone(0.04, 0.22, [dx * k, h * 1.15, dz * k], CHITIN, [0, 0, -dx * 0.3], 4);
    }
    for (const y of [0.2, 0.45]) thread(b, [dx * 0.88, y, dz * 0.88 + (dx ? 0.3 : 0)], [dx * 1.0, y + 0.05, dz * 1.0 - (dx ? 0.3 : 0)], 0.01, 0.014); // silk across the seam
    thread(b, [dx * 0.2, 0.75, dz * 0.2], [dx * 1.0, 0.58, dz * 1.0], 0.05, 0.011);
  }
}

/** Wall F, leg fence: a jointed insect leg arching from the middle out to each neighbour, knee high, foot meeting the neighbour's foot at the edge; web hung beneath each arch. */
function wallF(b: ModelBuilder, state?: BuildingState): void {
  const j = joinsOf(state);
  b.sphere([0.32, 0.38, 0.32], [0, 0.3, 0], CHITIN); // the knot they spring from
  b.cylinder(0.24, 0.24, 0.07, [0, 0.45, 0], BAND, undefined, 8);
  if (!j) curve(b, [[0, 0.5, 0], [0.1, 1.1, 0.05], [0.3, 1.4, 0.1]], 0.08, 0.02, AMBER);
  for (const [bit, dx, dz] of SIDES) {
    if (!(j & bit)) continue;
    const hip: Vec3 = [dx * 0.15, 0.55, dz * 0.15], knee: Vec3 = [dx * 0.5, 1.45, dz * 0.5], foot: Vec3 = [dx * 1.0, 0.02, dz * 1.0];
    b.limb(hip, knee, 0.1, CHITIN, 0.08);
    b.sphere(0.1, knee, AMBER);
    b.limb(knee, foot, 0.08, AMBER, 0.035);
    for (let i = 0; i < 3; i++) b.cone(0.03, 0.14, [knee[0] + dx * (0.1 + i * 0.12), knee[1] - 0.3 - i * 0.3, knee[2] + dz * (0.1 + i * 0.12)], CHITIN, [0, 0, -dx * 1.2], 4); // spines down its shin
    for (const [a, z, sag] of [[0.35, 0.9, 0.08], [0.6, 0.6, 0.06], [0.8, 0.3, 0.04]] as const) thread(b, [dx * a * 0.5, z + 0.2, dz * a * 0.5], [dx * (0.55 + a * 0.45), z * 0.5, dz * (0.55 + a * 0.45)], sag, 0.011);
    b.sphere([dx ? 0.16 : 0.01, 0.3, dz ? 0.16 : 0.01], [dx * 0.55, 0.55, dz * 0.55], MEMBRANE);
  }
}

/** Tower D, slinger: a giant crouched Wildweld slinger, its body the arm of a trebuchet: a heavy amber-banded abdomen low behind as the counterweight, the long arm reaching up and over, a sling pouch hanging crystals at its tip; braced on folded legs. */
function towerD(b: ModelBuilder): void {
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { // folded legs, braced
    const hip: Vec3 = [sx * 0.4, 1.2, sz * 0.45], knee: Vec3 = [sx * 1.2, 1.5, sz * 1.25], foot: Vec3 = [sx * 1.55, 0.02, sz * 1.6];
    b.limb(hip, knee, 0.14, CHITIN, 0.11); b.sphere(0.12, knee, AMBER); b.limb(knee, foot, 0.11, CHITIN, 0.05);
  }
  b.sphere([0.75, 0.6, 0.65], [0, 1.2, 0], CHITIN); // its body
  b.sphere([0.75, 0.6, 0.6], [-0.95, 0.9, 0], AMBER); // the counterweight abdomen
  for (const x of [-0.7, -1.0, -1.3]) b.cylinder(0.56, 0.56, 0.06, [x, 0.9, 0], CHITIN, [0, 0, Math.PI / 2], 12);
  // the arm: from the body up and over, jointed once
  const sh: Vec3 = [0.3, 1.6, 0], el: Vec3 = [0.2, 4.0, 0], tip: Vec3 = [1.4, 5.6, 0];
  b.limb(sh, el, 0.24, CHITIN, 0.17); b.sphere(0.2, el, AMBER); b.limb(el, tip, 0.15, CHITIN, 0.07);
  for (let i = 0; i < 4; i++) b.cone(0.04, 0.2, [0.25 + i * 0.3, 4.3 + i * 0.4, 0.12], AMBER, [0, 0, -0.9], 4);
  thread(b, tip, [1.55, 4.95, 0], 0.02, 0.015); thread(b, [1.25, 5.5, 0], [1.45, 4.95, 0.05], 0.02, 0.012); // the sling's cords
  b.sphere([0.2, 0.15, 0.2], [1.5, 4.85, 0.02], SILK); // its pouch
  for (const [x, z, k] of [[1.45, 0.04, 0.2], [1.55, -0.05, 0.17]] as const) b.crystal(k, [x, 4.95, z], [0, 0, 0.3]);
  b.cylinder(0.62, 0.62, 0.1, [0, 1.25, 0], BAND, undefined, 12);
}

/** Tower E, carapace claw: a domed carapace like a great beetle's back, braced on stubby legs round it, the claw arm rising out of its crown and arching over, crystals cupped in the claw; web binding its joints. */
function towerE(b: ModelBuilder): void {
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.5, f: Vec3 = [Math.cos(a) * 1.65, 0.02, Math.sin(a) * 1.65], k: Vec3 = [Math.cos(a) * 1.4, 0.75, Math.sin(a) * 1.4]; b.limb([Math.cos(a) * 0.9, 0.9, Math.sin(a) * 0.9], k, 0.12, CHITIN, 0.1); b.limb(k, f, 0.1, AMBER, 0.04); }
  b.sphere([1.35, 1.15, 1.35], [0, 0.55, 0], CHITIN); // the dome
  for (let i = 0; i < 5; i++) b.sphere([1.38 - i * 0.18, 0.06, 1.38 - i * 0.18], [0, 0.9 + i * 0.18, 0], i % 2 ? AMBER : CHITIN); // its ribs
  b.cylinder(1.0, 1.0, 0.1, [0, 1.25, 0], BAND, undefined, 14);
  const base: Vec3 = [0, 1.6, 0], knee: Vec3 = [-0.4, 3.6, 0], ankle: Vec3 = [0.5, 5.1, 0], claw: Vec3 = [1.25, 4.9, 0];
  b.limb(base, knee, 0.32, AMBER, 0.24); b.limb(knee, ankle, 0.22, CHITIN, 0.16); b.limb(ankle, claw, 0.15, AMBER, 0.1);
  for (const jt of [knee, ankle]) { b.sphere(0.26, jt, CHITIN); b.cylinder(0.28, 0.28, 0.1, jt, SILK, [0, 0, 0.8], 10); }
  for (const s of [1, -1]) curve(b, [claw, [1.48, 4.8, s * 0.16], [1.55, 5.05, s * 0.2], [1.42, 5.25, s * 0.08]], 0.06, 0.018, CHITIN);
  for (const [x, z, k] of [[1.38, 0.04, 0.22], [1.33, -0.07, 0.18]] as const) b.crystal(k, [x, 5.05, z], [0, 0, 0.5]);
}

/** Tower F, mantis pair: two jointed raptorial arms rising from a plated footing and folding over each other like a mantis's, the front one cupping crystals in its hooked tip, the back one cocked to strike; web strung between them. */
function towerF(b: ModelBuilder): void {
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; b.sphere([0.7, 0.32, 0.48], [Math.cos(a) * 0.75, 0.22, Math.sin(a) * 0.75], i % 2 ? CHITIN : AMBER, [0, -a, 0.25]); }
  b.sphere([0.85, 0.7, 0.8], [0, 0.6, 0], CHITIN);
  b.cylinder(0.7, 0.7, 0.1, [0, 1.0, 0], BAND, undefined, 12);
  for (const [z, lean, hold] of [[0.35, 1, true], [-0.35, -0.6, false]] as const) {
    const base: Vec3 = [0, 1.2, z], knee: Vec3 = [-0.3 * lean, 3.6, z * 1.2], tip: Vec3 = [0.9 * lean + (hold ? 0.3 : -0.2), 4.8 + (hold ? 0 : 0.5), z * 0.6];
    b.limb(base, knee, 0.26, CHITIN, 0.2); b.sphere(0.22, knee, AMBER); b.limb(knee, tip, 0.17, AMBER, 0.06);
    for (let i = 0; i < 5; i++) { const k = 0.2 + i * 0.15; b.cone(0.04, 0.18, [knee[0] + (tip[0] - knee[0]) * k, knee[1] + (tip[1] - knee[1]) * k - 0.12, knee[2] + (tip[2] - knee[2]) * k], CHITIN, [0, 0, Math.PI], 4); } // the raptorial spines
    curve(b, [tip, [tip[0] + 0.25 * lean, tip[1] - 0.3, tip[2]], [tip[0] + 0.1 * lean, tip[1] - 0.55, tip[2]]], 0.06, 0.02, CHITIN); // its hooked end
    if (hold) for (const [x, k] of [[0.05, 0.22], [-0.05, 0.18]] as const) b.crystal(k, [tip[0] + x + 0.15, tip[1] - 0.35, tip[2]], [0, 0, 0.4]);
  }
  for (const y of [2.2, 2.9, 3.4]) thread(b, [-0.1, y, 0.38], [0.1, y + 0.1, -0.38], 0.05, 0.012);
}

// ── round 3 (2026-11-06): walls that are just web, no structure; towers a slinger that doesn't move: rooted, one or two
//    arms (the user)

const SL_CHITIN: Mat = { color: '#1a2628', tex: 'leather', rough: 0.3, metal: 0.35 };
const SL_TEAL: Mat = { color: '#3ab0bc', tex: 'leather', rough: 0.3, metal: 0.4 };
const CORD: Mat = { color: '#6a5640', tex: 'leather', rough: 0.8 };

/** Silk tufts where web is tied down to the ground: a wad, a few strands splayed. */
function tieDown(c: ModelBuilder, x: number, z: number): void {
  c.sphere([0.07, 0.03, 0.07], [x, 0.015, z], SILK);
}

/** Wall G, orb web: a great orb web stood up along the line, radials and a spiral, its rim tied out to the tile's edge toward each neighbour (where theirs meets it) and down to the ground with guy-lines; dew on it. Nothing but web. */
function wallG(b: ModelBuilder, state?: BuildingState): void {
  const j = joinsOf(state);
  const dirs = SIDES.filter(([bit]) => j & bit);
  const planes: Array<[number, number]> = dirs.length ? [...new Set(dirs.map(([, dx]) => (dx ? 'x' : 'z')))].map((a) => (a === 'x' ? [1, 0] : [0, 1])) : [[1, 0]];
  for (const [px, pz] of planes) {
    const cy = 0.95, R = 0.82, P = (r: number, a: number): Vec3 => [px * Math.cos(a) * r, cy + Math.sin(a) * r * 0.95, pz * Math.cos(a) * r];
    const spokes = 14;
    for (let i = 0; i < spokes; i++) thread(b, P(0.04, (i / spokes) * Math.PI * 2), P(R * (0.92 + 0.08 * jit(i)), (i / spokes) * Math.PI * 2), 0.01, 0.009);
    for (let ring = 1; ring <= 7; ring++) {
      const r = R * (ring / 7.5);
      for (let i = 0; i < spokes; i++) {
        const a0 = (i / spokes) * Math.PI * 2, a1 = ((i + 1) / spokes) * Math.PI * 2;
        thread(b, P(r, a0), P(r * 1.02, a1), 0.005, 0.0075);
      }
    }
    b.sphere(0.05, P(0, 0), SILK); // its hub
    for (let i = 0; i < 6; i++) b.sphere(0.02, P(R * (0.3 + 0.1 * i), i * 1.1), DEW);
    // the frame: out to each joined edge (the neighbour's web ties on there), and down to the ground
    for (const s of [1, -1]) {
      const bit = px ? (s > 0 ? 1 : 2) : (s > 0 ? 4 : 8), out = j & bit ? 1.0 : 0.95;
      thread(b, P(R, s > 0 ? 0.35 : Math.PI - 0.35), [px * s * out, 1.55, pz * s * out], 0.03, 0.012);
      thread(b, P(R, s > 0 ? -0.4 : Math.PI + 0.4), [px * s * out, 0.02, pz * s * out], 0.02, 0.012);
      tieDown(b, px * s * 0.95, pz * s * 0.95);
    }
    thread(b, P(R, -Math.PI / 2), [0, 0.02, 0], 0.01, 0.012);
    tieDown(b, 0, 0);
  }
}

/** Wall H, tangle web: a dense cobweb, threads every which way through a long low mass of it, thickening into sheets low down, spilling on toward each neighbour; tied to the ground all along. Nothing but web. */
function wallH(b: ModelBuilder, state?: BuildingState): void {
  const j = joinsOf(state);
  const reach = (bit: number) => (j & bit ? 1.0 : 0.45);
  const xp = reach(1), xn = reach(2), zp = reach(4), zn = reach(8);
  const pt = (i: number): Vec3 => {
    const u = (jit(i, 1) + 1) / 2, v = (jit(i, 2) + 1) / 2, h = (jit(i, 3) + 1) / 2;
    const alongX = (j & 3) || !(j & 12);
    const a = alongX ? -xn + u * (xn + xp) : (jit(i, 5) * 0.35), c = alongX ? jit(i, 5) * 0.35 : -zn + v * (zn + zp);
    return [a, 0.05 + h * h * 1.3, c];
  };
  for (let i = 0; i < 70; i++) thread(b, pt(i), pt(i + 101), 0.04 + 0.04 * jit(i, 9), 0.008);
  for (let i = 0; i < 9; i++) { const p = pt(i * 7 + 3); b.sphere([0.22, 0.05 + 0.03 * jit(i), 0.22], [p[0], 0.12 + 0.25 * ((jit(i, 4) + 1) / 2), p[2]], SILK); } // its sheets
  for (let i = 0; i < 10; i++) { const p = pt(i * 13 + 5); tieDown(b, p[0], p[2]); thread(b, [p[0], 0.02, p[2]], pt(i * 13 + 6), 0.01, 0.009); }
  for (let i = 0; i < 6; i++) b.sphere(0.018, pt(i * 17 + 2), DEW);
}

/** Wall I, sheet web: a broad sheet of web slung low like a hammock, sagging, a tangle of threads above it holding it up, and tied down to the ground round its edges; running on into the neighbour's. Nothing but web. */
function wallI(b: ModelBuilder, state?: BuildingState): void {
  const j = joinsOf(state);
  const ext = (bit: number) => (j & bit ? 1.0 : 0.6);
  const x0 = -ext(2), x1 = ext(1), z0 = -ext(8), z1 = ext(4);
  const y = (x: number, z: number) => 0.75 - 0.25 * (1 - ((2 * (x - x0)) / (x1 - x0) - 1) ** 2) * (1 - ((2 * (z - z0)) / (z1 - z0) - 1) ** 2);
  const n = 8, X = (i: number) => x0 + ((x1 - x0) * i) / n, Z = (k: number) => z0 + ((z1 - z0) * k) / n;
  for (let i = 0; i <= n; i++) for (let k = 0; k < n; k++) thread(b, [X(i), y(X(i), Z(k)), Z(k)], [X(i), y(X(i), Z(k + 1)), Z(k + 1)], 0.005, 0.008);
  for (let k = 0; k <= n; k++) for (let i = 0; i < n; i++) thread(b, [X(i), y(X(i), Z(k)), Z(k)], [X(i + 1), y(X(i + 1), Z(k)), Z(k)], 0.005, 0.008);
  for (let i = 0; i < 5; i++) b.sphere([0.25, 0.012, 0.25], [X(1 + i * 1.5) * 0.85, y(X(1 + i * 1.5) * 0.85, 0) + 0.01, jit(i) * 0.25], SILK); // where it's thick
  for (let i = 0; i < 18; i++) { const a: Vec3 = [x0 + (x1 - x0) * ((jit(i, 1) + 1) / 2), 1.5 + 0.3 * jit(i, 2), z0 + (z1 - z0) * ((jit(i, 3) + 1) / 2)]; thread(b, a, [a[0] + 0.2 * jit(i, 4), y(a[0], a[2]), a[2] + 0.2 * jit(i, 5)], 0.02, 0.008); thread(b, a, [x0 + (x1 - x0) * ((jit(i, 6) + 1) / 2), 1.4 + 0.3 * jit(i, 7), z0 + (z1 - z0) * ((jit(i, 8) + 1) / 2)], 0.05, 0.008); } // the tangle above
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [0, z0], [0, z1]] as const) { thread(b, [x, y(x, z), z], [x * 1.05, 0.02, z * 1.05], 0.02, 0.01); tieDown(b, x * 1.05, z * 1.05); }
  for (let i = 0; i < 5; i++) b.sphere(0.02, [X(2 + i), y(X(2 + i), 0.1) + 0.02, 0.1 * jit(i)], DEW);
}

/** The slinger's long segmented throwing arm from `at`, rising at `pitch` (radians above level, toward −x… turned by `yaw`), curling over, its sling cord and pouch (crystal in it) at its end. */
function slingArm(c: ModelBuilder, at: Vec3, yaw: number, pitch: number, curl: number, segs: number, seg: number, r0: number): void {
  let p = at, a = pitch;
  const dx = Math.cos(yaw), dz = Math.sin(yaw);
  for (let i = 1; i <= segs; i++) {
    a -= curl / segs;
    const nx: Vec3 = [p[0] + dx * seg * Math.cos(a), p[1] + seg * Math.sin(a), p[2] + dz * seg * Math.cos(a)];
    c.limb(p, nx, r0 * (1 - i * 0.07), i % 2 ? SL_CHITIN : SL_TEAL, r0 * (1 - (i + 1) * 0.07));
    c.cone(0.03, 0.11, [nx[0], nx[1] + 0.07, nx[2]], SL_CHITIN, [0, -yaw, 0.6], 4);
    p = nx;
  }
  const pouch: Vec3 = [p[0] + dx * 0.05, p[1] - 0.55, p[2] + dz * 0.05];
  c.limb(p, pouch, 0.012, CORD, 0.01);
  c.sphere([0.1, 0.07, 0.09], pouch, CORD);
  c.crystal(0.18, [pouch[0], pouch[1] + 0.03, pouch[2]], [0, 0, Math.PI / 2]);
}

/** The slinger's heavy head (its counterweight), plated in teal, spined, a pouch of crystals on it, at `at` facing +x. */
function slingHead(c: ModelBuilder, at: Vec3, s: number): void {
  c.sphere([0.42 * s, 0.3 * s, 0.34 * s], at, SL_TEAL);
  for (let i = 0; i < 3; i++) c.cone(0.05 * s, 0.16 * s, [at[0] - 0.1 * s + i * 0.12 * s, at[1] + 0.28 * s, at[2]], SL_CHITIN, [0, 0, 0.5], 4);
  for (const [y, z] of [[0.08, 0.12], [0.08, -0.12], [0.14, 0]] as const) c.sphere(0.04 * s, [at[0] + 0.36 * s, at[1] + y * s, at[2] + z * s], SL_CHITIN); // eyes
  c.sphere([0.12 * s, 0.08 * s, 0.1 * s], [at[0] - 0.05 * s, at[1] + 0.25 * s, at[2] + 0.18 * s], CORD); // its pouch of crystals
  for (const dz of [0.14, 0.2]) c.crystal(0.1 * s, [at[0] - 0.05 * s, at[1] + 0.32 * s, at[2] + dz * s], [0.3, 0, 0.2]);
}

/** Silk roots spreading from `at` into the ground round it: it's grown there, it doesn't move. */
function roots(c: ModelBuilder, at: Vec3, r: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3 * jit(i), foot: Vec3 = [at[0] + Math.cos(a) * r, 0.02, at[2] + Math.sin(a) * r];
    curve(c, [[at[0] + Math.cos(a) * r * 0.35, at[1] * 0.5, at[2] + Math.sin(a) * r * 0.35], [at[0] + Math.cos(a) * r * 0.75, 0.12, at[2] + Math.sin(a) * r * 0.75], foot], 0.09, 0.025, SILK_OLD);
  }
}
const SILK_OLD: Mat = { color: '#d6ccb4', tex: 'leather', rough: 0.9 };
const EARTH2: Mat = { color: '#6e5a40', tex: 'stone', rough: 0.95 };

/** Tower G, rooted slinger: the slinger's body half sunk into a mound of earth and silk, grown into the ground, its heavy head low at the front, its long arm reared up behind and curling over, sling hanging. */
function towerG(b: ModelBuilder): void {
  b.sphere([1.6, 0.7, 1.5], [0, 0.15, 0], EARTH2); // the mound it's sunk in
  roots(b, [0, 0.5, 0], 1.8, 9);
  b.sphere([1.1, 0.55, 0.7], [0, 0.75, 0], SL_CHITIN); // its body, half buried
  for (const x of [-0.6, -0.2, 0.2]) b.cylinder(0.62, 0.62, 0.06, [x, 0.85, 0], SL_TEAL, [0, 0, Math.PI / 2], 12);
  slingHead(b, [1.0, 0.95, 0], 1.6);
  slingArm(b, [-0.9, 1.0, 0], Math.PI, 1.25, 2.4, 8, 0.6, 0.2);
  b.cylinder(0.72, 0.72, 0.1, [0.1, 0.95, 0], BAND, [0, 0, Math.PI / 2], 12);
}

/** Tower H, barnacle: a hard shell cone of overlapping teal and black plates, fixed to the ground like a barnacle, the slinger's head peering from its top and its arm rising out of the opening, curling over, sling hanging. */
function towerH(b: ModelBuilder): void {
  for (let ring = 0; ring < 4; ring++) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + ring * 0.4, r = 1.4 - ring * 0.3, y = 0.35 + ring * 0.6;
    b.sphere([0.55 - ring * 0.08, 0.5, 0.3], [Math.cos(a) * r, y, Math.sin(a) * r], (i + ring) % 2 ? SL_TEAL : SL_CHITIN, [0, -a, 0.35]);
  }
  b.cylinder(0.55, 0.55, 0.12, [0, 2.45, 0], SL_CHITIN, undefined, 12);
  b.cylinder(0.9, 0.9, 0.12, [0, 1.3, 0], BAND, undefined, 14);
  slingHead(b, [0.3, 2.55, 0], 1.0);
  slingArm(b, [-0.2, 2.5, 0], Math.PI, 1.35, 2.6, 8, 0.48, 0.15);
  roots(b, [0, 0.3, 0], 1.75, 7);
}

/** Tower I, stalked: the slinger's body borne up on a thick stalk of wrapped silk, rooted wide into the ground like a fungus, its head forward and its arm curling up and over from its tail, sling hanging. */
function towerI(b: ModelBuilder): void {
  roots(b, [0, 0.9, 0], 1.7, 8);
  for (let i = 0; i < 6; i++) { const r = 0.5 - i * 0.04; b.cylinder(r - 0.02, r, 0.5, [0, 0.25 + i * 0.5, 0], i % 2 ? SILK : SILK_OLD, undefined, 12); }
  b.cylinder(0.48, 0.48, 0.1, [0, 1.6, 0], BAND, undefined, 12);
  b.sphere([1.0, 0.5, 0.6], [0, 3.35, 0], SL_CHITIN);
  for (const x of [-0.5, 0, 0.4]) b.cylinder(0.52, 0.52, 0.06, [x, 3.42, 0], SL_TEAL, [0, 0, Math.PI / 2], 12);
  slingHead(b, [0.95, 3.45, 0], 1.3);
  slingArm(b, [-0.8, 3.5, 0], Math.PI, 1.0, 2.2, 7, 0.45, 0.14);
}

/** Tower J, two arms: a squat body sunk into the ground on spreading roots, two long throwing arms from its tail: one reared high and cocked, one swinging low with its sling loaded. */
function towerJ(b: ModelBuilder): void {
  b.sphere([1.5, 0.6, 1.4], [0, 0.1, 0], EARTH2);
  roots(b, [0, 0.6, 0], 1.8, 9);
  b.sphere([1.0, 0.65, 0.85], [0, 0.85, 0], SL_CHITIN);
  for (const x of [-0.5, -0.1, 0.3]) b.cylinder(0.75, 0.75, 0.06, [x, 0.95, 0], SL_TEAL, [0, 0, Math.PI / 2], 12);
  slingHead(b, [0.95, 1.05, 0], 1.5);
  slingArm(b, [-0.8, 1.2, 0.3], Math.PI - 0.35, 1.4, 2.6, 8, 0.55, 0.17);
  slingArm(b, [-0.8, 1.2, -0.3], Math.PI + 0.35, 0.7, 1.6, 7, 0.5, 0.15);
  b.cylinder(0.85, 0.85, 0.1, [0.1, 1.05, 0], BAND, [0, 0, Math.PI / 2], 12);
}

/** Tower K, cocooned: a slinger wrapped in a cocoon from its waist down, the cocoon bound to the ground with silk, its upper body free, head up, arm reared up out of the wrapping and curling over, sling hanging. */
function towerK(b: ModelBuilder): void {
  roots(b, [0, 0.4, 0], 1.6, 10);
  for (let i = 0; i < 7; i++) { const y = 0.2 + i * 0.32, r = 0.85 * Math.sin(((i + 1) / 8) * Math.PI) + 0.25; b.sphere([r, 0.22, r * 0.9], [0, y, 0], i % 2 ? SILK : SILK_OLD); } // the cocoon
  for (let i = 0; i < 5; i++) thread(b, [Math.cos(i * 1.3) * 0.7, 1.2 + i * 0.15, Math.sin(i * 1.3) * 0.7], [Math.cos(i * 1.3 + 2) * 0.7, 0.6 + i * 0.2, Math.sin(i * 1.3 + 2) * 0.7], 0.05, 0.02); // its binding
  b.sphere([0.75, 0.45, 0.55], [0.1, 2.55, 0], SL_CHITIN); // the free upper body
  b.cylinder(0.5, 0.5, 0.06, [0.1, 2.6, 0], SL_TEAL, [0, 0, Math.PI / 2], 12);
  slingHead(b, [0.75, 2.75, 0], 1.3);
  slingArm(b, [-0.5, 2.7, 0], Math.PI, 1.3, 2.5, 8, 0.45, 0.14);
  b.cylinder(0.7, 0.7, 0.1, [0, 1.5, 0], BAND, undefined, 14);
}

// ── round 4 (2026-11-07): tangle webs of different widths, no orbs; a range of arms on one rooted body, and an arm
//    coming up out of a tunnel (the user)

/** A tangle of web along the joined sides: `width` m either side of the line, `height` m tall, `n` threads; `bulge` swells
 *  it in the middle of the piece and pinches it at the edges (where the neighbour's meets it at the edge's width). */
function tangle(b: ModelBuilder, state: BuildingState | undefined, width: number, height: number, n: number, bulge = 0): void {
  const j = joinsOf(state);
  const reach = (bit: number) => (j & bit ? 1.0 : 0.4);
  const xp = reach(1), xn = reach(2), zp = reach(4), zn = reach(8);
  const alongX = !!(j & 3) || !(j & 12), alongZ = !!(j & 12);
  const pt = (i: number): Vec3 => {
    const u = (jit(i, 1) + 1) / 2, h = (jit(i, 3) + 1) / 2, side = jit(i, 5);
    // which run of the web it's in (a corner piece: both)
    const onX = alongX && (!alongZ || jit(i, 7) > 0);
    const t = onX ? -xn + u * (xn + xp) : -zn + u * (zn + zp); // along it
    const w = width * (1 + bulge * (1 - t * t)) * (0.6 + 0.4 * (1 - h)); // (wider low down, and through the middle if it bulges)
    return onX ? [t, 0.04 + h ** 1.6 * height, side * w] : [side * w, 0.04 + h ** 1.6 * height, t];
  };
  for (let i = 0; i < n; i++) thread(b, pt(i), pt(i + 211), 0.03 + 0.04 * jit(i, 9), 0.007 + 0.002 * ((jit(i, 11) + 1) / 2));
  for (let i = 0; i < Math.round(n / 7); i++) { const p = pt(i * 13 + 5); thread(b, [p[0], 0.02, p[2]], pt(i * 13 + 6), 0.01, 0.008); } // (threads down to the ground: web only, no wads, no dew)
}
/** Wall T1, wisp: a thin tangle, narrow and low. */
const wallT1 = (b: ModelBuilder, s?: BuildingState) => tangle(b, s, 0.22, 0.9, 55);
/** Wall T2, hedge: a dense tangle, a hedge of web. */
const wallT2 = (b: ModelBuilder, s?: BuildingState) => tangle(b, s, 0.42, 1.3, 110);
/** Wall T3, sprawl: wide and low, web spread out over the ground. */
const wallT3 = (b: ModelBuilder, s?: BuildingState) => tangle(b, s, 0.8, 0.8, 120);
/** Wall T4, curtain: narrow and tall. */
const wallT4 = (b: ModelBuilder, s?: BuildingState) => tangle(b, s, 0.28, 1.9, 110);
/** Wall T5, billow: swelling in the middle of each piece and pinched where pieces meet, so a line of them heaves. */
const wallT5 = (b: ModelBuilder, s?: BuildingState) => tangle(b, s, 0.3, 1.3, 110, 1.4);

/** The rooted body every arm is shown on: the slinger's body half sunk in a mound, rooted, its head at the front; the arm goes on at `ARM_AT`. */
function rootedBody(b: ModelBuilder): void {
  b.sphere([1.4, 0.6, 1.3], [0, 0.1, 0], EARTH2);
  roots(b, [0, 0.5, 0], 1.75, 8);
  b.sphere([1.0, 0.5, 0.7], [0, 0.7, 0], SL_CHITIN);
  for (const x of [-0.5, -0.1, 0.3]) b.cylinder(0.62, 0.62, 0.06, [x, 0.8, 0], SL_TEAL, [0, 0, Math.PI / 2], 12);
  slingHead(b, [0.95, 0.9, 0], 1.45);
  b.cylinder(0.72, 0.72, 0.1, [0.1, 0.9, 0], BAND, [0, 0, Math.PI / 2], 12);
}
const ARM_AT: Vec3 = [-0.8, 1.0, 0];
/** A crystal in a sling's pouch hanging from `at`, `len` below. */
function pouch(c: ModelBuilder, at: Vec3, len = 0.55): void {
  const p: Vec3 = [at[0] + 0.04, at[1] - len, at[2]];
  c.limb(at, p, 0.012, CORD, 0.01); c.sphere([0.1, 0.07, 0.09], p, CORD); c.crystal(0.18, [p[0], p[1] + 0.03, p[2]], [0, 0, Math.PI / 2]);
}

/** Arm 1, segmented: the slinger's own: segments of black and teal, spined, rising and curling over. */
function armSegmented(b: ModelBuilder): void { rootedBody(b); slingArm(b, ARM_AT, Math.PI, 1.3, 2.4, 8, 0.58, 0.19); }

/** Arm 2, tentacle: one smooth muscular limb, thick at its root, tapering, curling over in an S, banded, its tip coiled round the sling cord. */
function armTentacle(b: ModelBuilder): void {
  rootedBody(b);
  const pts: Vec3[] = [ARM_AT];
  let ang = 1.35; // (rising, then curling over toward the front, smoothly)
  for (let i = 1; i <= 14; i++) { ang -= 0.19; const q = pts[i - 1]; pts.push([q[0] - 0.36 * Math.cos(ang), q[1] + 0.36 * Math.sin(ang), 0.12 * Math.sin(i * 0.7)]); }
  for (let i = 0; i < pts.length - 1; i++) b.limb(pts[i], pts[i + 1], 0.3 * (1 - i / 15) + 0.03, i % 3 === 1 ? SL_TEAL : SL_CHITIN, 0.3 * (1 - (i + 1) / 15) + 0.03);
  for (let i = 2; i < 12; i += 2) b.sphere(0.05, [pts[i][0], pts[i][1] - 0.2, pts[i][2] + 0.15], SL_TEAL); // suckers
  pouch(b, pts[14]);
}

/** Arm 3, mantis: two long jointed segments like a mantis's foreleg, raptorial spines down its inner edge, the hooked tip holding the sling. */
function armMantis(b: ModelBuilder): void {
  rootedBody(b);
  const knee: Vec3 = [-1.4, 3.6, 0], tip: Vec3 = [0.2, 4.5, 0];
  b.limb(ARM_AT, knee, 0.22, SL_CHITIN, 0.17); b.sphere(0.2, knee, SL_TEAL); b.limb(knee, tip, 0.15, SL_TEAL, 0.06);
  for (let i = 0; i < 6; i++) { const k = 0.15 + i * 0.13; b.cone(0.035, 0.2, [knee[0] + (tip[0] - knee[0]) * k, knee[1] + (tip[1] - knee[1]) * k - 0.12, 0], SL_CHITIN, [0, 0, Math.PI], 4); }
  curve(b, [tip, [0.45, 4.3, 0], [0.4, 4.05, 0]], 0.06, 0.02, SL_CHITIN);
  pouch(b, [0.4, 4.05, 0], 0.45);
}

/** Arm 4, scorpion: a segmented tail arching up and forward over the body like a scorpion's, its bulb the sling: crystals held in the bulb, the sting curved above. */
function armScorpion(b: ModelBuilder): void {
  rootedBody(b);
  let p = ARM_AT;
  for (let i = 1; i <= 7; i++) {
    const a = 1.9 - i * 0.42, nx: Vec3 = [p[0] + 0.62 * Math.cos(a), p[1] + 0.62 * Math.sin(a), 0];
    b.sphere([0.28 - i * 0.02, 0.24 - i * 0.02, 0.26 - i * 0.02], nx, i % 2 ? SL_TEAL : SL_CHITIN); b.limb(p, nx, 0.2 - i * 0.015, SL_CHITIN);
    p = nx;
  }
  b.sphere([0.32, 0.26, 0.28], [p[0] + 0.2, p[1] - 0.05, 0], SL_TEAL); // the bulb
  for (const [dx, dz] of [[0.25, 0.1], [0.3, -0.08]] as const) b.crystal(0.18, [p[0] + dx, p[1] + 0.18, dz], [0, 0, 0.6]);
  curve(b, [[p[0] + 0.45, p[1], 0], [p[0] + 0.7, p[1] + 0.2, 0], [p[0] + 0.65, p[1] + 0.45, 0]], 0.07, 0.015, SL_CHITIN); // the sting
}

/** Arm 5, spoon: a long stiff beam of fused chitin, like a trebuchet's, braced to the body, a cupped ladle at its end full of crystals. */
function armSpoon(b: ModelBuilder): void {
  rootedBody(b);
  const end: Vec3 = [-2.6, 4.3, 0];
  b.limb(ARM_AT, end, 0.17, SL_CHITIN, 0.1);
  for (let i = 1; i < 6; i++) { const k = i / 6; b.cylinder(0.19 - k * 0.07, 0.19 - k * 0.07, 0.06, [ARM_AT[0] + (end[0] - ARM_AT[0]) * k, ARM_AT[1] + (end[1] - ARM_AT[1]) * k, 0], SL_TEAL, [0, 0, 0.6], 8); }
  for (const z of [1, -1]) b.limb([0.1, 1.1, z * 0.35], [-1.5, 2.6, z * 0.06], 0.05, SL_CHITIN, 0.03); // its braces
  b.sphere([0.32, 0.14, 0.3], [end[0] - 0.1, end[1] + 0.05, 0], SL_TEAL); // the cup
  for (const [dx, dz] of [[-0.05, 0.08], [-0.15, -0.06], [0.0, -0.05]] as const) b.crystal(0.16, [end[0] + dx, end[1] + 0.18, dz], [0.2, 0, 0.3]);
}

/** Arm 6, feeler: a very long thin whip like an antenna, many fine segments, rising high and drooping over in a long arc, the sling at its tip. */
function armFeeler(b: ModelBuilder): void {
  rootedBody(b);
  let p = ARM_AT, a = 1.45;
  for (let i = 1; i <= 16; i++) { a -= 0.13; const nx: Vec3 = [p[0] - 0.36 * Math.cos(a) * 0.6, p[1] + 0.36 * Math.sin(a), 0.05 * Math.sin(i)]; b.limb(p, nx, 0.08 * (1 - i / 18) + 0.012, i % 2 ? SL_TEAL : SL_CHITIN); p = nx; }
  pouch(b, p, 0.5);
}

/** Arm 7, claw: a heavy jointed limb ending in a pincer claw that grips the crystals (the round-one chitin claw, on the slinger's body). */
function armClaw(b: ModelBuilder): void {
  rootedBody(b);
  const knee: Vec3 = [-1.3, 3.2, 0], wrist: Vec3 = [-0.6, 4.6, 0], claw: Vec3 = [0.15, 4.5, 0];
  b.limb(ARM_AT, knee, 0.26, SL_CHITIN, 0.2); b.sphere(0.22, knee, SL_TEAL); b.limb(knee, wrist, 0.19, SL_TEAL, 0.15); b.sphere(0.17, wrist, SL_CHITIN); b.limb(wrist, claw, 0.15, SL_CHITIN, 0.1);
  for (const s of [1, -1]) curve(b, [claw, [0.45, 4.4, s * 0.16], [0.5, 4.65, s * 0.2], [0.38, 4.85, s * 0.08]], 0.07, 0.02, SL_CHITIN);
  for (const [x, z, k] of [[0.35, 0.04, 0.22], [0.3, -0.07, 0.18]] as const) b.crystal(k, [x, 4.65, z], [0, 0, 0.5]);
}

/** Arm 8, forked: one thick limb splitting at its elbow into two segmented whips, a sling hanging from each. */
function armForked(b: ModelBuilder): void {
  rootedBody(b);
  const fork: Vec3 = [-1.2, 2.9, 0];
  b.limb(ARM_AT, fork, 0.24, SL_CHITIN, 0.18); b.sphere(0.2, fork, SL_TEAL);
  slingArm(b, fork, Math.PI - 0.5, 1.0, 1.9, 6, 0.42, 0.12);
  slingArm(b, fork, Math.PI + 0.5, 1.3, 2.3, 6, 0.42, 0.12);
}

/** Tunnel: a burrow in the ground, a ring of thrown-up earth round a dark hole lined with silk, the slinger's long arm rising up out of it and curling over, sling hanging; eyes glinting down in the dark. */
function towerTunnel(b: ModelBuilder): void {
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.sphere([0.55, 0.35 + 0.08 * jit(i), 0.4], [Math.cos(a) * 1.1, 0.2, Math.sin(a) * 1.1], EARTH2, [0, -a, 0]); } // the rim
  b.cylinder(0.85, 0.75, 0.08, [0, 0.3, 0], HOLE, undefined, 16); // the hole
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; thread(b, [Math.cos(a) * 0.82, 0.36, Math.sin(a) * 0.82], [Math.cos(a + 0.6) * 1.35, 0.5, Math.sin(a + 0.6) * 1.35], 0.03, 0.012); } // silk lining its lip
  for (const z of [0.1, -0.1]) b.sphere(0.06, [0.35, 0.33, z], { color: '#bff2ff', tex: 'none', rough: 0.05, emissive: '#1a5060' }); // eyes in the dark
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.25; b.sphere(0.12, [Math.cos(a) * 1.15, 0.5, Math.sin(a) * 1.15], BAND); } // its side's colour, studded round the rim
  slingArm(b, [-0.15, 0.32, 0], Math.PI, 1.5, 2.7, 9, 0.58, 0.2);
  roots(b, [0, 0.2, 0], 1.75, 6);
}

export const WEB_CONCEPTS: Record<string, { model: (b: ModelBuilder, state?: BuildingState) => void; size: number }> = {
  wallA: { model: wallA, size: 1 }, wallB: { model: wallB, size: 1 }, wallC: { model: wallC, size: 1 },
  towerA: { model: towerA, size: 2 }, towerB: { model: towerB, size: 2 }, towerC: { model: towerC, size: 2 },
  wallD: { model: wallD, size: 1 }, wallE: { model: wallE, size: 1 }, wallF: { model: wallF, size: 1 },
  towerD: { model: towerD, size: 2 }, towerE: { model: towerE, size: 2 }, towerF: { model: towerF, size: 2 },
  wallG: { model: wallG, size: 1 }, wallH: { model: wallH, size: 1 }, wallI: { model: wallI, size: 1 },
  towerG: { model: towerG, size: 2 }, towerH: { model: towerH, size: 2 }, towerI: { model: towerI, size: 2 }, towerJ: { model: towerJ, size: 2 }, towerK: { model: towerK, size: 2 },
  wallT1: { model: wallT1, size: 1 }, wallT2: { model: wallT2, size: 1 }, wallT3: { model: wallT3, size: 1 }, wallT4: { model: wallT4, size: 1 }, wallT5: { model: wallT5, size: 1 },
  armSegmented: { model: armSegmented, size: 2 }, armTentacle: { model: armTentacle, size: 2 }, armMantis: { model: armMantis, size: 2 }, armScorpion: { model: armScorpion, size: 2 },
  armSpoon: { model: armSpoon, size: 2 }, armFeeler: { model: armFeeler, size: 2 }, armClaw: { model: armClaw, size: 2 }, armForked: { model: armForked, size: 2 },
  towerTunnel: { model: towerTunnel, size: 2 },
};
