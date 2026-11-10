// The Mimic Mine (id web-tower), a tower (the user's design, 2026-11-07): at rest a crystal mine like any other, a few things off
// about it; when it attacks a big tentacle slides up out of a burrow at its middle, curled, reaches down to pluck the
// crystal on the side it's throwing to, lifts it, uncoils up and back and whips it over the top (the coiling
// tentacle's throw). While it has targets it stays out, plucking the next; then it coils back down out of sight. It
// never dips under the ground but in its burrow, and never passes through its rocks or crystals (mimicClear checks,
// for every way it faces). Tower metres, centred on its footprint; model +x, +z are the map's +x, +y.
import type { BuildingState, Mat, ModelBuilder, Vec3 } from '../../kits/bake3d/types';

const smooth = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };

/** Where the burrow opens. */
const MOUTH: Vec3 = [0, 0.3, 0];
type Crystal = { len: number; at: Vec3; rot: Vec3; dir: Vec3 };
const crystalAt = (len: number, at: Vec3, rot: Vec3): Crystal => ({ len, at, rot, dir: [-Math.sin(rot[2]), Math.cos(rot[2]) * Math.cos(rot[0]), Math.cos(rot[2]) * Math.sin(rot[0])] });
/** Its crystals stand one to each of the eight ways it can throw (so it always plucks the one before it), all alike,
 *  leaning out; its rocks between them, each its own. */
const CRYSTAL_R = 0.6, CRYSTAL_LEN = 0.75, LEAN = 0.3;
function layout(): { rocks: Array<{ at: Vec3; size: number }>; crystals: Crystal[] } {
  let seed = (3 * 2654435761) >>> 0;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); // (the biome mine's scatter)
  const rocks: Array<{ at: Vec3; size: number }> = [], crystals: Crystal[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * (Math.PI / 4), size = 0.42 + r() * 0.36, rr = size + 0.7 + r() * 0.3;
    rocks.push({ at: [Math.cos(a) * rr, size * 0.5, Math.sin(a) * rr], size });
    const c = k * (Math.PI / 4);
    crystals.push(crystalAt(CRYSTAL_LEN, [Math.cos(c) * CRYSTAL_R, 0.5, Math.sin(c) * CRYSTAL_R], [Math.sin(c) * LEAN, 0, -Math.cos(c) * LEAN]));
  }
  return { rocks, crystals };
}
const MINE = layout();
/** Where its tip grips the crystal before it (the one toward +x): two thirds of the way up. */
const GRIP: Vec3 = MINE.crystals[0].at.map((v, d) => v + MINE.crystals[0].dir[d] * CRYSTAL_LEN * 0.65) as Vec3;

/** A pose of it as a chain from the mouth (heading straight up): each segment's length, its turn from the one before,
 *  and how far to the side its end is. Poses blend by their turns, so it bends from one to the next like a limb. */
type Chain = { len: number[]; turn: number[]; z: number[] };
const SEGS = 19, BODY = 12; // (12 of body, 7 of curling tip)
function chainOf(pts: Vec3[]): Chain {
  const ch: Chain = { len: [], turn: [], z: [] };
  let h = Math.PI / 2;
  for (let s = 0; s < SEGS; s++) {
    const dx = pts[s + 1][0] - pts[s][0], dy = pts[s + 1][1] - pts[s][1], a = Math.atan2(dy, dx);
    ch.turn.push(Math.atan2(Math.sin(a - h), Math.cos(a - h))); ch.len.push(Math.hypot(dx, dy)); ch.z.push(pts[s + 1][2]);
    h = a;
  }
  return ch;
}
/** A held pose: its body a curve from the mouth through three control points, its tip curling over by `curl` at the end. */
function curvePts(c: Vec3[], curl: number): Vec3[] {
  const bez = (u: number): Vec3 => [0, 1, 2].map((d) => (1 - u) ** 3 * MOUTH[d] + 3 * (1 - u) ** 2 * u * c[0][d] + 3 * (1 - u) * u * u * c[1][d] + u ** 3 * c[2][d]) as Vec3;
  const pts: Vec3[] = [];
  for (let s = 0; s <= BODY; s++) pts.push(bez(s / BODY));
  let p = pts[BODY], ang = Math.atan2(c[2][1] - c[1][1], c[2][0] - c[1][0]);
  const TIP = SEGS - BODY;
  for (let s = 0; s < TIP; s++) {
    ang += curl * (2 * (s + 1)) / (TIP * (TIP + 1));
    const len = 0.24 * (1 - s / (TIP + 1));
    p = [p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len, p[2]];
    pts.push(p);
  }
  return pts;
}
/** A pose of the coiling tentacle's throw: `wind` 0 coiled … 1 reared up and back, curling over behind; `lash` 0 … 1
 *  whipped over the top, curling forward. */
function whipPts(wind: number, lash: number): Vec3[] {
  const k14 = 14 / SEGS, pts: Vec3[] = [MOUTH];
  let p = MOUTH, a = Math.PI / 2;
  for (let i = 0; i < SEGS; i++) {
    const k = i / SEGS;
    a += (-0.65 * (1 - wind) + (wind - lash * 1.6) * 0.16 * (1 + k * 1.5) - 0.02) * k14;
    const len = (0.22 + 0.2 * wind) * k14;
    p = [p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len, 0];
    pts.push(p);
  }
  return pts;
}
const holdOf = (pts: Vec3[]): Vec3 => { const k = pts.length - 1; return [(pts[k - 4][0] + pts[k][0]) / 2, (pts[k - 4][1] + pts[k][1]) / 2, pts[k][2]]; };
const CURLED: Vec3[] = [[0, 1.0, 0], [0, 1.7, 0], [0.15, 2.0, 0]];
const OVER: Vec3[] = [[0, 2.1, 0], [0.5, 2.9, 0], [0.6, 2.7, 0]];
const REACH: Vec3[] = [[0, 2.0, 0], [0.9, 2.6, 0], [1.0, 1.7, 0]];
for (let n = 0; n < 6; n++) { // (move its reach so its grip closes on the crystal)
  const h = holdOf(curvePts(REACH, -4.2));
  for (const j of [1, 2]) REACH[j] = REACH[j].map((v, d) => v + (GRIP[d] - h[d])) as Vec3;
}

/**
 * Its throw, `t` 0 … 1. From hidden it comes up curled (0 … 0.22) to over the crystal; a shot runs from there (0.22)
 * round to there again (0.8): reach, grip (0.38), lift, uncoil, rear back, let go (THROW_AT), lash, follow through;
 * then it coils back down (… 0.95, hidden). Shot after shot it loops 0.22 … 0.8.
 */
export const SHOT_FROM = 0.22, THROW_AT = 0.56, SHOT_TO = 0.8, GRIP_AT = 0.38;
const KEYS: Array<{ t: number; out: number; pose: Chain }> = [
  { t: 0.0, out: 0, pose: chainOf(curvePts(CURLED, -5)) },
  { t: 0.12, out: 1, pose: chainOf(curvePts(CURLED, -5)) }, // up out of the burrow, curled like a fern
  { t: SHOT_FROM, out: 1, pose: chainOf(curvePts(OVER, -5)) }, // over the crystal
  { t: 0.3, out: 1, pose: chainOf(curvePts(REACH, -4.2)) }, // reaching down to it
  { t: GRIP_AT, out: 1, pose: chainOf(curvePts(REACH, -4.2)) }, // its tip curled round it
  { t: 0.43, out: 1, pose: chainOf(curvePts([[0, 2.2, 0], [0.3, 3.1, 0], [0.5, 3.0, 0]], -4.2)) }, // lifting it up clear
  { t: 0.48, out: 1, pose: chainOf(whipPts(1, 0)) }, // uncoiling up
  { t: 0.52, out: 1, pose: chainOf(whipPts(1, 0)) }, // reared up and back, curling over behind
  { t: 0.62, out: 1, pose: chainOf(whipPts(1, 0.8)) }, // whipped over the top
  { t: 0.72, out: 1, pose: chainOf(whipPts(1, 0.5)) }, // following through
  { t: SHOT_TO, out: 1, pose: chainOf(curvePts(OVER, -5)) }, // over the next crystal
  { t: 0.88, out: 1, pose: chainOf(curvePts(CURLED, -5)) }, // curled
  { t: 0.95, out: 0, pose: chainOf(curvePts(CURLED, -5)) }, // gone
];
/** Its points from the burrow's mouth to its tip (throwing toward +x), each point's thickness, and where its curled tip
 *  holds a crystal, at `t` through its throw (no `t`: hidden). */
export function mimicPose(t?: number): { pts: Vec3[]; r: number[]; hold: Vec3 } {
  if (t === undefined || t <= 0 || t >= 0.95) return { pts: [MOUTH], r: [0.32], hold: MOUTH };
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const A = KEYS[i], B = KEYS[i + 1], f = smooth((t - A.t) / (B.t - A.t));
  const lerp = (x: number, y: number) => x + (y - x) * f;
  const out = lerp(A.out, B.out);
  const pts: Vec3[] = [MOUTH], r: number[] = [0.32];
  let p = MOUTH, h = Math.PI / 2;
  for (let s = 0; s < SEGS; s++) {
    h += lerp(A.pose.turn[s], B.pose.turn[s]);
    const len = lerp(A.pose.len[s], B.pose.len[s]) * out; // (coming out: all of it drawn in toward the mouth)
    p = [p[0] + Math.cos(h) * len, p[1] + Math.sin(h) * len, lerp(A.pose.z[s], B.pose.z[s]) * out];
    pts.push(p);
    r.push(s < BODY ? 0.32 - 0.19 * ((s + 1) / BODY) : 0.12 * (1 - (s + 1 - BODY) / (SEGS - BODY + 1)) + 0.025);
  }
  return { pts, r, hold: holdOf(pts) };
}
/** Is the crystal before it gone from the mine (in its grip, or thrown and not yet grown back)? */
const plucked = (t?: number) => t !== undefined && t >= GRIP_AT + 0.02 && t < 0.66;

/** The nearest it comes to the ground, its rocks and its crystals through a throw, facing each of its eight ways: positive, clear. */
export function mimicClear(): { gap: number; at: number; what: string } {
  const near = (p: Vec3, a: Vec3, b: Vec3) => { // distance from p to the segment a–b
    const ab = [0, 1, 2].map((d) => b[d] - a[d]), ap = [0, 1, 2].map((d) => p[d] - a[d]);
    const k = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1)));
    return Math.hypot(ap[0] - ab[0] * k, ap[1] - ab[1] * k, ap[2] - ab[2] * k);
  };
  let worst = { gap: 9, at: 0, what: '' };
  for (let face = 0; face < 8; face++) {
    const a = face * (Math.PI / 4), turn = (p: Vec3): Vec3 => [p[0] * Math.cos(a) - p[2] * Math.sin(a), p[1], p[0] * Math.sin(a) + p[2] * Math.cos(a)];
    for (let i = 1; i < 95; i++) {
      const t = i / 100, { pts, r } = mimicPose(t);
      for (let s = 1; s < pts.length; s++) {
        const p = turn(pts[s]), probe = (gap: number, what: string) => { if (gap < worst.gap) worst = { gap, at: t, what: `${what} (point ${s}, facing ${face})` }; };
        if (Math.hypot(p[0] - MOUTH[0], p[2] - MOUTH[2]) > 0.42) probe(p[1] - r[s], 'ground'); // (in the burrow it may go down)
        MINE.rocks.forEach((k, j) => probe(Math.hypot(p[0] - k.at[0], p[1] - k.at[1], p[2] - k.at[2]) - k.size * 1.1 - r[s], `rock ${j}`));
        MINE.crystals.forEach((c, j) => {
          if (j === face && (plucked(t) || (s >= pts.length - 7 && t > 0.25 && t < GRIP_AT + 0.05))) return; // (the one it plucks: its tip wraps round it)
          probe(near(p, c.at, c.at.map((v, d) => v + c.dir[d] * c.len) as Vec3) - c.len * 0.22 - r[s], `crystal ${j}`);
        });
      }
    }
  }
  return worst;
}

const SKIN: Mat = { color: '#3a4440', tex: 'skin', rough: 0.45 };
/** Its tentacle's bands: a dark and a light tone of its side's colour, in turn. */
const DARK: Mat = { team: 'primary', tex: 'skin', rough: 0.35 }, LIGHT: Mat = { team: 'light', tex: 'skin', rough: 0.35 };
const PALE: Mat = { color: '#9fb3a8', tex: 'skin', rough: 0.4 }, PIT: Mat = { color: '#0d0a08', tex: 'none', rough: 1 };
const TEAM: Mat = { team: 'primary', tex: 'none', rough: 0.6 }, SILK: Mat = { color: '#ece6d6', tex: 'none', rough: 0.85 };

/**
 * The Mimic Mine (2 tiles): a crystal mine half again as big as the land's, with a burrow at its middle where the big
 * rock should be, its crystals evenly round it and leaning out, a few strands of silk between its rocks, a ring of
 * its side's colour deep among its crystals, and its tentacle banded in its side's dark and light. `state.attack`: its throw at `t`, toward `facing` (radians, map axes).
 */
export function webTower(b: ModelBuilder, state?: BuildingState): void {
  const t = state?.attack?.t, facing = state?.attack?.facing ?? 0;
  const face = ((Math.round(facing / (Math.PI / 4)) % 8) + 8) % 8;
  MINE.rocks.forEach((k, i) => b.rock([k.size, k.size, k.size], k.at, { color: i % 2 ? '#77736c' : '#8b867c', tex: 'stone' }, i + 1));
  MINE.crystals.forEach((c, k) => { if (!(k === face && plucked(t))) b.crystal(c.len, c.at, c.rot); });
  b.cylinder(0.42, 0.36, 0.06, [0, MOUTH[1], 0], PIT, undefined, 14); // the burrow
  b.sphere([0.55, 0.2, 0.55], [0, 0.18, 0], { color: '#6f6a62', tex: 'stone', rough: 0.95 }); // its rim, worn
  const top = (i: number): Vec3 => [MINE.rocks[i].at[0], MINE.rocks[i].size * 1.1, MINE.rocks[i].at[2]];
  for (const [i, j] of [[0, 2], [3, 5], [1, 4]]) { const p = top(i), q = top(j); b.limb(p, [(p[0] + q[0]) / 2, Math.min(p[1], q[1]) * 0.6, (p[2] + q[2]) / 2], 0.006, SILK); }
  // a ring of its side's colour deep among its crystals, low round their feet
  const ring = (i: number): Vec3 => { const a = (i / 24) * Math.PI * 2; return [Math.cos(a) * CRYSTAL_R, 0.3, Math.sin(a) * CRYSTAL_R]; };
  for (let i = 0; i < 24; i++) b.limb(ring(i), ring(i + 1), 0.08, TEAM);
  if (t === undefined || state?.attack?.still) return;
  // the tentacle, turned to face its target (its pose is drawn throwing toward +x)
  b.joint([0, 0, 0], [0, -face * (Math.PI / 4), 0], (m) => {
    const { pts, r, hold } = mimicPose(t);
    for (let i = 0; i < pts.length - 1; i++) {
      m.limb(pts[i], pts[i + 1], r[i], i % 3 === 1 && i < BODY ? (i % 6 === 1 ? DARK : LIGHT) : SKIN, r[i + 1]); // (banded in its side's dark and light, in turn)
      if (i > 1 && i < BODY && i % 2 === 0) for (const z of [1, -1]) m.sphere(r[i] * 0.3, [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2, pts[i][2] + z * r[i] * 0.8], PALE);
    }
    // the crystal in its grip: held as it stood, gripped two thirds up (thrown, it's the sim's to fly)
    const c = MINE.crystals[0];
    if (t >= GRIP_AT + 0.02 && t < THROW_AT) m.crystal(c.len, hold.map((v, d) => v - c.dir[d] * c.len * 0.65) as Vec3, c.rot);
  });
}

/** Where it lets go of the crystal (throwing toward +x): for the sprites page's flying crystal. */
export const THROW_FROM: Vec3 = mimicPose(THROW_AT).hold;
