// New faction (working title: the user hasn't named it or most of its units yet; see docs/NEW_FACTION_NOTES.md).
// A faction with no buildings that climbs by changing form:
//   • a mother lays eggs (trained in her body, a queue; she lays anything up to her own refinement);
//   • an egg hatches into the larva of its tier (fed by Give: the mother carries food to it);
//   • a larva gathers, then changes inside a cocoon into an offshoot one refinement up, the next tier's larva, or a
//     mother of its own tier.
// Placeholder names, bodies, attacks and looks are marked PLACEHOLDER: the user decides them. The larvae (caterpillars:
// small green, medium cyan, big purple/pink) and the eggs (whitish origami-like, sized by tier and tinted toward their
// larva) follow the user's description. The Dragon Fly is the user's; its fire (from crystal) is still to design.
// Self-contained: only engine types and kits, never another faction.
import type { FactionSpec, UnitSpec } from '../types';
import type { Section, ModelBuilder, Pose, Vec3 as V3 } from '../../kits/bake3d/types';
import { aim, footAt, jointBetween, span } from '../../kits/bake3d/gait';
import type { Mat } from '../../kits/bake3d/types';

type Unit = UnitSpec & { model: (b: ModelBuilder, p: Pose) => void };
const TAU = Math.PI * 2;

// ── looks ────────────────────────────────────────────────────────────────────

/** The larvae's colours by tier (the user's). */
const TIER = { 1: '#5fae3a', 2: '#2fb8c4', 3: '#b04fb8' } as const;

/**
 * Each look's drawn scale for a mass (a body's length grows with ∛ of its mass), and its footprint: the metres across
 * it's drawn (a long body: how wide), which is its collision size (UnitSpec.size).
 */
const LOOK = {
  caterpillar: { scale: (m: number) => 1.2 * Math.cbrt(m / 15), length: 0.24 }, // (a long body: its collision circle is its width)
  egg: { scale: (m: number) => Math.cbrt(m / 15), length: 0.42 },
  bug: { scale: (m: number) => Math.cbrt(m / 40), length: 0.85 },
  mother: { scale: (m: number) => 1.4 * Math.cbrt(m / 40), length: 1.25 },
  vee: { scale: (m: number) => 1.3 * Math.cbrt(m / 120), length: 0.75 }, // (collision: its body; wings overlap others, as fliers' do)
  dragon: { scale: (m: number) => 2.0 * Math.cbrt(m / 500), length: 0.9 }, // 500 kg: ~4.5 m snout to tail-tip (collision: its body; wings overlap others, as fliers' do)
} as const;
/** A caterpillar's trailing segments, as model units behind its front (for the baker). */
export const caterpillarSegments = (mass: number): number[] => [1, 2].map((k) => k * CATERPILLAR_GAP * LOOK.caterpillar.scale(mass));
const footprint = (look: keyof typeof LOOK, mass: number) => LOOK[look].scale(mass) * LOOK[look].length;

/**
 * The T2 flier, a dive bomber (the user's design): an insectoid flying-V. In flight its two long jointed wings sweep
 * back from the point where its head and crystal spike lead; diving, they fold tight along its body; on the ground it
 * stands on them like a spider (each wing's wrist and tip on the ground, the joint between arched high) and stabs down
 * with the spike from its maw. Chitin and ribbed, scalloped membrane, a cluster of eyes, a ring of teeth.
 */
function drawVee(b: ModelBuilder, p: Pose, mass: number): void {
  const chitin: Mat = { color: '#1a2628', tex: 'leather', rough: 0.3, metal: 0.35 };
  const sheen: Mat = { color: '#2a9aa6', tex: 'leather', rough: 0.3, metal: 0.4 };
  const membrane: Mat = { color: '#4f6e6c', tex: 'skin', rough: 0.7 };
  const rib: Mat = { color: '#121818', tex: 'none', rough: 0.6 };
  const eye: Mat = { color: '#050608', tex: 'none', rough: 0.05, metal: 0.5 };
  const tooth: Mat = { color: '#d8d4c0', tex: 'none', rough: 0.5 };
  const maw: Mat = { color: '#3a0e10', tex: 'skin', rough: 0.8 };
  const leaping = p.anim === 'leap';
  const flying = p.anim === 'fly' || p.anim === 'climb' || p.anim === 'soar' || p.anim === 'glide' || p.anim === 'land';
  const diving = p.anim === 'glide' || p.anim === 'land';
  const t = p.phase * TAU;
  const ease = (k: number) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };
  const stab = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase / 0.6) * Math.PI) : 0;
  type V = [number, number, number];
  // its wing bones, shoulder to wrist, wrist to knuckle, knuckle to tip: the same standing and flying; how high its
  // body stands on them, how low and tipped back it crouches to leap
  const BONES = [0.69, 1.02, 1.02], STAND_Y = 0.5, CROUCH_Y = 0.3, CROUCH_TILT = 0.25; // (its standing pose is the user's, locked: these bones are its bones)
  // flying, its wings are shorter (the user's: a cheat, they draw in as they unfold during its leap)
  const FLY_BONES = [0.55, 0.7, 0.6];
  const norm = (v: V): V => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const along = (a: V, d: V, len: number): V => [a[0] + d[0] * len, a[1] + d[1] * len, a[2] + d[2] * len];
  // one wing bone from a to b: a spined spar along its leading edge, the membrane trailing behind it toward `aft` (its
  // body's tail, however the body is turned), ribbed, its edge scalloped, `chord` wide at a and `chord2` at b
  const bone = (c: ModelBuilder, a: V, bb: V, chord: number, chord2: number, aft: V = [-1, 0, 0]) => {
    const d: V = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], len = Math.hypot(...d);
    if (len < 1e-3) return;
    c.joint(a, aim(d, aft), (w) => {
      w.limb([0, 0, 0], [len, 0, 0], 0.03, chitin, 0.022);
      for (let x = 0.08; x < len - 0.04; x += 0.13) w.cone(0.012, 0.06, [x, 0.03, 0], sheen, [0, 0, -0.5], 4); // spines
      if (chord > 0.01 || chord2 > 0.01) {
        const steps = 6;
        w.loft(Array.from({ length: steps + 1 }, (_, i) => {
          const k = i / steps, cw = (chord + (chord2 - chord) * k) * (i % 2 ? 0.72 : 1); // ribs at the full width: scalloped between
          return { at: [k * len, 0, cw * 0.9] as V, w: Math.max(0.01, cw), up: 0.008, down: 0.008 };
        }), membrane);
        for (let i = 0; i <= steps; i += 2) { const k = i / steps, cw = chord + (chord2 - chord) * k; if (cw > 0.03) w.limb([k * len, 0, 0], [k * len - 0.03, 0, cw * 1.8], 0.009, rib, 0.005); }
      }
    });
  };
  const body = (c: ModelBuilder) => {
    // a slim segmented body, tapering back to a barbed tail
    c.loft([[-0.58, 0.02, 0.02, 0.02], [-0.44, 0.06, 0.05, 0.05], [-0.28, 0.08, 0.07, 0.08], [-0.12, 0.1, 0.085, 0.1], [0.02, 0.11, 0.1, 0.1], [0.14, 0.08, 0.075, 0.075], [0.2, 0.055, 0.055, 0.055]]
      .map(([x, w, up, down]) => ({ at: [x, 0, 0] as V, w, up, down, keel: 0.4 })), chitin);
    for (const x of [-0.4, -0.26, -0.12, 0.02]) c.sphere([0.012, 0.09, 0.1], [x, 0, 0], sheen); // segment rims
    for (let i = 0; i < 6; i++) c.cone(0.015, 0.07, [0.08 - i * 0.12, 0.08 - i * 0.004, 0], chitin, [0, 0, 0.6], 4); // spines down its back
    c.cone(0.025, 0.1, [-0.62, 0, 0], sheen, [0, 0, Math.PI / 2], 4); // the tail barb
    // the head: a cluster of glossy eyes over a round maw ringed with teeth, the crystal spike thrust out of it
    c.sphere([0.08, 0.07, 0.075], [0.25, 0, 0], chitin);
    for (const [y, z] of [[0.045, 0.03], [0.045, -0.03], [0.06, 0], [0.025, 0.05], [0.025, -0.05], [0.07, 0.035], [0.07, -0.035]] as const) c.sphere(0.017, [0.29, y, z], eye);
    c.sphere([0.02, 0.04, 0.04], [0.325, -0.02, 0], maw);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; c.cone(0.008, 0.035, [0.33, -0.02 + Math.cos(a) * 0.04, Math.sin(a) * 0.04], tooth, [a, 0, -Math.PI / 2 - 0.5], 4); }
    if (p.armed) c.crystal(0.32, [0.33, -0.02, 0], [0, 0, -Math.PI / 2]);
  };
  b.joint([0, 0, 0], [0, 0, 0], (o) => {
    // the V, `open` from folded tight back along its body (0) to spread (1), beating by `flap`. During a leap its
    // joints unfold in turn from the ones it stood on: `legs` (1 → 0) is how much the inner and outer joints still
    // hang down as they did on the ground
    const vee = (c: ModelBuilder, open: number, flap: number) => {
      body(c);
      for (const S of [1, -1]) {
        const { sh, wrist, knuckle, tip } = veePoints(S, open, flap);
        const f = 0.35 + 0.65 * open;
        bone(c, sh, wrist, 0.18 * f, 0.22 * f);
        bone(c, wrist, knuckle, 0.22 * f, 0.18 * f);
        bone(c, knuckle, tip, 0.18 * f, 0.02);
        c.cone(0.02, 0.08, tip, chitin, [0, 0, -Math.PI / 2], 4);
      }
    };
    if (flying) {
      // beating (big strokes climbing, a shiver soaring); diving, folded tight back along its body, nose steeply down
      const flap = p.anim === 'fly' ? Math.sin(t) * 0.45 : p.anim === 'climb' ? Math.sin(t) * 0.7 : p.anim === 'soar' ? Math.sin(t) * 0.05 : 0;
      o.joint([0, 0.6, 0], [0, 0, diving && p.style !== 'swoop' ? -0.9 : 0], (c) => vee(c, diving ? 0 : 1, flap)); // (swooping: pulled out level, still folded)
      return;
    }
    if (leaping && p.phase >= 0.2) {
      // its leap: it flings its heavy crystal up and the body springs after it, up and over in a half loop, rolling
      // upright at the top: away, the other way round from how it stood. Its feet stay planted where it stood until
      // the body has risen far enough that the bones holding them are pulled straight and lift them off the ground
      // (the wrists first, then the wingtips); only then do the wings swing out into the V
      const k = (p.phase - 0.2) / 0.8;
      const pitch = CROUCH_TILT + (Math.PI - CROUCH_TILT) * ease(k / 0.85), roll = Math.PI * ease((k - 0.5) / 0.5);
      const at: V = [0, CROUCH_Y + 0.9 * ease(k / 0.7), 0];
      // its own frame (turned by the loop and the roll) to the ground's
      const cz = Math.cos(pitch), sz = Math.sin(pitch), cx = Math.cos(roll), sx = Math.sin(roll);
      const toGround = (v: V): V => { const y = v[1] * cx - v[2] * sx, z = v[1] * sx + v[2] * cx; return [at[0] + v[0] * cz - y * sz, at[1] + v[0] * sz + y * cz, at[2] + z]; };
      const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const reachOf = (from: V, to: V, len: number): V => { const d = sub(to, from), l = Math.hypot(...d); return l <= len ? to : along(from, norm(d), len - 1e-3); };
      const mixV = (a: V, b: V, w: number): V => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
      o.joint([0, 0, 0], [0, Math.PI, 0], (g) => {
        g.joint(at, [0, 0, pitch], (pc) => pc.joint([0, 0, 0], [roll, 0, 0], body));
        const open = ease((k - 0.3) / 0.45);
        for (const S of [1, -1]) {
          const bl = BONES.map((l, i) => l + (FLY_BONES[i] - l) * open); // (its bones drawing in to their flying length as it unfolds)
          const planted = standing(S, CROUCH_Y), fly = veePoints(S, open, 0, bl);
          const sh = toGround(fly.sh);
          // held to the ground where they stood, unless their bones are pulled straight (then dragged up after);
          // once up, swinging out to where the V puts them
          const wristHeld = reachOf(sh, planted.wrist, bl[0]);
          const up1 = Math.max(ease(wristHeld[1] / 0.35), ease((k - 0.6) / 0.3)), wrist = mixV(wristHeld, toGround(fly.wrist), up1); // (swinging out only once it's off the ground)
          const tipHeld = reachOf(wrist, planted.tip, bl[1] + bl[2]);
          const up2 = Math.max(ease(tipHeld[1] / 0.35), ease((k - 0.7) / 0.25)), tip = mixV(tipHeld, toGround(fly.tip), up2);
          const knuckle = mixV(jointBetween(wrist, tip, bl[1], bl[2], [0.02, 1, S * 0.05]), toGround(fly.knuckle), up2);
          const f = 0.35 + 0.65 * open, aft = sub(toGround([-1, 0, 0]), at); // (its tail's way, as it turns)
          bone(g, sh, wrist, 0.05 + 0.13 * f * up1, 0.03 + 0.19 * f * up1, aft);
          bone(g, wrist, knuckle, 0.06 + 0.16 * f * up2, 0.1 + 0.08 * f * up2, aft);
          bone(g, knuckle, tip, 0.1 + 0.08 * f * up2, 0.01, aft);
        }
      });
      return;
    }
    // on the ground: standing on its wings (below). Crouching to leap: facing back the way it'll come round from,
    // squatting low on them
    const crouch = leaping ? ease(p.phase / 0.2) : 0;
    if (leaping) { o.joint([0, 0, 0], [0, Math.PI, 0], (c) => stand(c, STAND_Y - (STAND_Y - CROUCH_Y) * crouch, CROUCH_TILT * crouch)); return; } // (its feet where they stand)
    stand(o, STAND_Y);
  }, LOOK.vee.scale(mass));
  // where its wing joints are in the V, in its own frame: `open` from folded tight back along its body (0) to spread
  // (1), beating by `flap`
  function veePoints(S: number, open: number, flap: number, bones = FLY_BONES) {
    const mixd = (a: number, b: number) => a + (b - a) * open;
    const dir = (sweep: number, up: number): V => norm([-Math.sin(sweep), up, S * Math.cos(sweep)]);
    const e = (k: number) => mixd(0.25 - k * 0.08, 0.12 + flap * (0.6 + k * 0.4));
    const sh: V = [0.06, 0.04, S * 0.08];
    const wrist = along(sh, dir(mixd(1.2, 0.45), e(0)), bones[0]), knuckle = along(wrist, dir(mixd(1.35, 0.7), e(1)), bones[1]);
    return { sh, wrist, knuckle, tip: along(knuckle, dir(mixd(1.45, 0.95), e(2)), bones[2]) };
  }
  // where its wing joints are, standing on them with its body `y0` up: each wing's wrist (in front) and tip (behind)
  // planted, the joint between them arched up where its bones put it (the same bones it flies on)
  function standing(S: number, y0: number, step = (rest: V): V => rest) {
    const sh: V = [0.06, y0 + 0.04, S * 0.08];
    const wrist = step([0.34, 0, S * 0.4]), tip = step([-0.5, 0, S * 0.7]);
    return { sh, wrist, tip, knuckle: jointBetween(wrist, tip, BONES[1], BONES[2], [0.02, 1, S * 0.05]) };
  }
  // standing on its wings, each wing's wrist (in front) and tip (behind) planted, the joint between arched high;
  // walking, the four points step in turn
  function stand(o: ModelBuilder, y0: number, tilt = 0): void {
    for (const S of [1, -1]) {
      // (walking, its four points step in turn on planted feet, the high joints riding between)
      let leg = 0;
      const step = (rest: V): V => (p.anim === 'walk' ? footAt(rest, p.phase + leg++ * 0.25 + (S > 0 ? 0 : 0.5), 0.1, 0.06) : rest);
      const { sh, wrist, knuckle, tip } = standing(S, y0, step);
      bone(o, sh, wrist, 0.05, 0.03);
      bone(o, wrist, knuckle, 0.06, 0.1);
      bone(o, knuckle, tip, 0.1, 0.01);
      for (const foot of [wrist, tip]) for (const dz of [-0.025, 0.025]) o.cone(0.012, 0.06, [foot[0] + 0.03, 0.01, foot[2] + dz], rib, [0, 0, -Math.PI / 2], 4); // claws
    }
    // the body slung between them; striking, it drives its whole torso forward like a battering ram, the spike first
    o.joint([0.34 * stab, y0 - 0.04 * stab, 0], [0, 0, tilt - 0.08 * stab], body);
  }
}

/** How far apart a caterpillar's segments are along its path (model units, before its size). */
const CATERPILLAR_GAP = 0.3;

/**
 * A caterpillar (the user's larvae): three segments of two balls each, heaving one after another as it crawls, stubby
 * legs, a round head. Its segments trail along the way it has gone, like Snake (Pose.part): the front one with the head,
 * then each of the others on its own.
 */
function caterpillar(b: ModelBuilder, p: Pose, color: string, mass: number): void {
  const skin: Mat = { color, tex: 'skin', rough: 0.55 };
  const belly: Mat = { color: '#e8e2c8', tex: 'skin' };
  const crawl = p.anim === 'walk' ? p.phase * TAU : 0;
  // (drawn whole, the segments lie in a line behind the front one; in parts, each is drawn on its own at the origin)
  const segs = p.part === undefined ? [0, 1, 2] : [p.part];
  const at = (seg: number) => (p.part === undefined ? -seg * CATERPILLAR_GAP : 0);
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    for (const seg of segs) {
      const lift = p.anim === 'walk' ? Math.max(0, Math.sin(crawl - seg * 2.1)) * 0.06 : 0; // (each segment heaves in turn)
      for (let k = 0; k < 2; k++) {
        const x = at(seg) + 0.065 - k * 0.13, r = 0.1 - seg * 0.006 - k * 0.004;
        c.sphere([r * 1.05, r, r], [x, r + lift, 0], skin);
        c.sphere([r * 0.7, r * 0.35, r * 0.75], [x, r * 0.45 + lift, 0], belly);
        for (const z of [1, -1]) c.limb([x, 0.06 + lift, z * r * 0.7], [x, 0.0, z * r * 1.0], 0.016, skin); // stubby legs
      }
      c.sphere(0.022, [at(seg), 0.2 + lift, 0], { team: 'primary', tex: 'none' }); // a team dot on each segment
    }
    if (!segs.includes(0)) return;
    const eat = p.anim === 'gather' || p.anim === 'eat' ? Math.sin(p.phase * TAU * 2) * 0.03 : 0;
    c.sphere(0.11, [0.22, 0.12 + eat, 0], skin); // head
    for (const z of [1, -1]) c.sphere(0.018, [0.31, 0.15 + eat, z * 0.05], { color: '#111111' });
    if (p.cargo) c.sphere([0.08, 0.06, 0.08], [0, 0.24, 0], { color: p.cargo === 'food' ? '#a83a4a' : p.cargo === 'wood' ? '#7a5634' : '#8fe6ff' });
  }, LOOK.caterpillar.scale(mass));
}

/** An egg: a whitish, folded, faceted shell (origami-like), tinted toward its larva, sized by tier (the user's). */
function origamiEgg(b: ModelBuilder, p: Pose, tint: string, mass: number): void {
  const paper: Mat = { color: mix('#f2efe6', tint, 0.4), tex: 'none', rough: 0.85 };
  const fold: Mat = { color: mix('#d9d4c4', tint, 0.55), tex: 'none', rough: 0.85 };
  const breathe = 1 + (p.anim === 'idle' ? Math.sin(p.phase * TAU) * 0.02 : 0);
  b.joint([0, 0, 0], [0, 0, 0], (e) => {
    e.cylinder(0.0, 0.2, 0.3, [0, 0.35, 0], paper, undefined, 5); // folded top
    e.cylinder(0.2, 0.0, 0.3, [0, 0.05 + 0.0, 0], fold, undefined, 5); // folded bottom
    e.cylinder(0.2, 0.2, 0.06, [0, 0.2, 0], paper, [0, Math.PI / 5, 0], 5); // the crease band
  }, LOOK.egg.scale(mass) * breathe);
}

/** PLACEHOLDER body for the units the user hasn't described: a segmented bug on six legs, sized by mass. */
function bug(b: ModelBuilder, p: Pose, color: string, mass: number, weapon: 'strike' | 'pike' | 'sling' | 'none' = 'none'): void {
  const shell: Mat = { color, tex: 'leather', rough: 0.45 };
  const t = p.phase * TAU, walking = p.anim === 'walk';
  const jab = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase / 0.6) * Math.PI) : 0;
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    c.sphere([0.22, 0.13, 0.14], [-0.12, 0.3, 0], shell); // abdomen
    c.sphere([0.13, 0.11, 0.11], [0.12, 0.32, 0], shell); // thorax
    c.sphere(0.09, [0.28 + jab * 0.08, 0.36, 0], shell); // head
    c.box([0.04, 0.03, 0.2], [0.12, 0.42, 0], { team: 'primary', tex: 'cloth' }); // team band
    // six legs, a tripod gait on planted feet (front and back on one side with the middle on the other)
    for (const [x, ph] of [[0.16, 0], [0.06, 0.5], [-0.04, 0]] as const) for (const z of [1, -1]) {
      const hip: V3 = [x, 0.28, z * 0.08], kneeRest: V3 = [x + 0.08, 0.18, z * 0.22], rest: V3 = [x + 0.1, 0, z * 0.26];
      const foot = walking ? footAt(rest, p.phase + ph + (z > 0 ? 0 : 0.5), 0.07, 0.05) : rest;
      const knee = jointBetween(hip, foot, span(hip, kneeRest), span(kneeRest, rest), [0, 1, z]);
      c.limb(hip, knee, 0.018, shell);
      c.limb(knee, foot, 0.014, shell);
    }
    if (weapon === 'strike' && p.armed) c.crystal(0.16, [0.42 + jab * 0.12, 0.34, 0], [0, 0, -Math.PI / 2]);
    if (weapon === 'pike' && p.armed) {
      c.limb([0.05 + jab * 0.2, 0.36, 0.06], [0.95 + jab * 0.2, 0.42, 0.06], 0.012, { color: '#9a8a5a', tex: 'wood' });
      c.crystal(0.1, [1.0 + jab * 0.2, 0.42, 0.06], [0, 0, -Math.PI / 2]);
    }
    if (weapon === 'sling') c.limb([0.2, 0.38, 0.08], [0.2 + Math.cos(t * 2) * 0.15, 0.6, 0.08], 0.008, { color: '#5a4a3a' });
  }, LOOK.bug.scale(mass));
}


/**
 * The Dragon Fly (the user's): a reptilian dragon's body (a long neck, a horned head, scaly, a long tail, four clawed
 * legs) on two pairs of big, decorated butterfly wings (veined and edged dark, banded, eyespots on the forewings),
 * beating in flight, folded up over its back on the ground.
 */
function drawDragonFly(b: ModelBuilder, p: Pose, mass: number): void {
  // an insect's body, iridescent: metallic violet-blue, teal compound eyes, its decorated butterfly wings
  const scale: Mat = { color: '#4a3aa0', tex: 'leather', rough: 0.25, metal: 0.55 };
  const belly: Mat = { color: '#8a70c8', tex: 'skin', rough: 0.35, metal: 0.3 };
  const band: Mat = { color: '#2ad0c4', tex: 'none', rough: 0.3, metal: 0.5 };
  const horn: Mat = { color: '#1a1430', tex: 'none', rough: 0.4 };
  const eyeMat: Mat = { color: '#28d8c8', tex: 'none', rough: 0.15, metal: 0.6, emissive: '#0a3a38' };
  const wing: Mat = { color: '#f0a040', tex: 'none', rough: 0.6 };
  const eyeOut: Mat = { color: '#18101a', tex: 'none' }, eyeMid: Mat = { color: '#3fa8e0', tex: 'none' }, eyeIn: Mat = { color: '#fbfbf4', tex: 'none' };
  // (a leap's first part is the crouch on the ground: legs bent, wings still folded; then it springs up into the air)
  const flying = p.anim === 'fly' || p.anim === 'climb' || p.anim === 'soar' || p.anim === 'glide' || p.anim === 'land' || (p.anim === 'leap' && p.phase >= 0.3);
  const t = p.phase * TAU, beat = flying ? Math.sin(t) * 0.75 : 0;
  const bite = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase / 0.6) * Math.PI) : 0;
  const wave = (k: number, speed: number, amp: number) => Math.sin(t * speed + k) * amp;
  const y0 = flying ? 0.5 : 0.5;
  b.joint([0, 0, 0], [0, 0, 0], (o) => {
  // the body canted up, nose high
  o.joint([0, y0, 0], [0, 0, 0.42], (c) => {
    // thorax and abdomen: one sculpted body, a deep rounded thorax pinching to a waist, the abdomen long and
    // tapering behind it, segmented, banded and rippling (claspers at its tip)
    const body: Section[] = [
      { at: [0.24, 0.02, 0], w: 0.08, up: 0.08, down: 0.07 },
      { at: [0.1, 0, 0], w: 0.17, up: 0.17, down: 0.18, keel: 0.25 },
      { at: [-0.08, 0, 0], w: 0.16, up: 0.16, down: 0.16, keel: 0.2 },
      { at: [-0.24, 0.01, 0], w: 0.1, up: 0.1, down: 0.1 },
    ];
    let tp: [number, number, number] = [-0.24, 0.01, 0];
    for (let i = 1; i <= 10; i++) {
      tp = [tp[0] - 0.12, tp[1] + 0.05 - i * 0.004 + wave(-i * 0.6, 1, 0.02), wave(-i * 0.55, 1, 0.02 * i)];
      const r = 0.11 * (1 - i * 0.075) * (i === 1 ? 1.05 : 1);
      body.push({ at: tp, w: r, up: r, down: r });
      if (i % 2 === 0) c.sphere([0.014, r * 1.06, r * 1.06], tp, band); // a band at each segment
    }
    body.push({ at: [tp[0] - 0.05, tp[1], tp[2]], w: 0.02, up: 0.02, down: 0.02 });
    c.loft(body, scale);
    c.sphere([0.16, 0.09, 0.12], [0.04, -0.1, 0], belly);
    // the long mantis neck, segmented and swaying, rising from the thorax
    let n: [number, number, number] = [0.22, 0.05, 0];
    for (let i = 1; i <= 6; i++) {
      const rise = i <= 4 ? 0.09 : 0.0, fwd = i <= 4 ? 0.07 : 0.1;
      const next: [number, number, number] = [n[0] + fwd, n[1] + rise + wave(i, 1, 0.012), wave(i * 0.8, 1, 0.045) * (i / 6)];
      c.limb(n, next, 0.042 - i * 0.003, scale, 0.039 - i * 0.003);
      c.sphere(0.046 - i * 0.003, next, belly); // its joints
      n = next;
    }
    // a mantis's head: a broad triangle, wide across the top where its eyes bulge at the corners, narrowing to its
    // mouth; long fine antennae; and big hooked mandibles, toothed along their inner edges, gaping as it bites
    const nod = flying ? Math.sin(t) * 0.07 : 0, look = Math.sin(t * 0.5) * (flying ? 0.18 : 0.3), tilt = Math.sin(t * 0.7 + 1) * 0.2;
    c.joint(n, [tilt, look, -0.6 - bite * 0.3 + nod], (h) => {
      h.loft([
        { at: [-0.02, 0.01, 0], w: 0.05, up: 0.04, down: 0.03 },
        { at: [0.03, 0.01, 0], w: 0.11, up: 0.05, down: 0.04, flat: 0.3 },
        { at: [0.1, 0, 0], w: 0.06, up: 0.035, down: 0.03 },
        { at: [0.17, -0.01, 0], w: 0.025, up: 0.02, down: 0.02 },
      ], scale);
      for (const z of [1, -1]) {
        h.sphere([0.04, 0.045, 0.04], [0.03, 0.025, z * 0.105], eyeMat); // compound eye, at the corner
        h.limb([0.03, 0.05, z * 0.02], [-0.02, 0.2, z * 0.09], 0.006, horn, 0.003); // antenna
        h.limb([-0.02, 0.2, z * 0.09], [-0.1, 0.3, z * 0.16], 0.003, horn, 0.002);
        // a mandible: hooked, in two parts, swinging open as it bites
        const open = 0.25 + bite * 0.5;
        h.joint([0.16, -0.015, z * 0.025], [0, z * open, 0], (m) => {
          m.limb([0, 0, 0], [0.08, 0, z * 0.025], 0.022, horn, 0.016);
          m.limb([0.08, 0, z * 0.025], [0.14, -0.005, -z * 0.02], 0.016, horn, 0.005); // the hook
          for (const k of [0.04, 0.08, 0.11]) m.cone(0.008, 0.03, [k, 0, -z * 0.005], horn, [z * Math.PI / 2, 0, 0], 4); // teeth on its inner edge
        });
        h.limb([0.15, -0.03, z * 0.02], [0.2, -0.07, z * 0.04], 0.008, belly, 0.005); // a palp
      }
      if (bite > 0.3) h.sphere(0.04, [0.24, -0.02, 0], { color: '#ff8a20', emissive: '#ff5a00' }); // (its fire: placeholder until the mechanic is designed)
    });
    for (const z of [1, -1]) c.cone(0.02, 0.1, [tp[0] - 0.04, tp[1], tp[2] + z * 0.025], horn, [0, z * 0.4, Math.PI / 2], 4); // claspers
  });
  // six thin insect legs under the thorax (tucked in flight), and the wings, set on the canted thorax
  const c = o;
  {
    for (const [x, ph] of [[0.14, 0], [0.04, 0.5], [-0.06, 0]] as const) for (const z of [1, -1]) {
      // (on the ground, a tripod on planted feet; in flight, tucked)
      const hip: V3 = [x, y0 - 0.08 + x * 0.4, z * 0.08], kneeRest: V3 = [x + 0.05, 0.34, z * 0.22], rest: V3 = [x + 0.08, 0.01, z * 0.3];
      const foot: V3 = flying ? [x - 0.18, y0 - 0.16, z * 0.12] : p.anim === 'walk' ? footAt(rest, p.phase + ph + (z > 0 ? 0 : 0.5), 0.1, 0.06) : rest;
      const knee: V3 = flying ? [x - 0.08, y0 - 0.12, z * 0.14] : jointBetween(hip, foot, span(hip, kneeRest), span(kneeRest, rest), [0, 1, z]);
      c.limb(hip, knee, 0.022, horn, 0.018);
      c.limb(knee, foot, 0.018, horn, 0.01);
    }
    // butterfly wings, a monarch's or a swallowtail's: a long swept forewing, bright at the base and deepening to a dark
    // tip, a black margin spotted white, black veins fanning from the body, a blue shimmer by the body; a rounded
    // hindwing with an eyespot and a swallowtail. Beating in flight; at rest raised together upright over its back
    const deep: Mat = { color: '#c0581c', tex: 'none', rough: 0.55 }, margin: Mat = { color: '#141016', tex: 'none', rough: 0.7 };
    const dot: Mat = { color: '#fbf6e8', tex: 'none', rough: 0.5 }, shimmer: Mat = { color: '#3a7ae0', tex: 'none', rough: 0.2, metal: 0.6 };
    for (const z of [1, -1]) {
      const up = flying ? -z * beat : -z * 1.45, lean = flying ? 0.15 : -0.2;
      c.joint([0.04, y0 + 0.17, z * 0.1], [up, 0, lean + 0.42], (wg) => wg.joint([0, 0, 0], [0, 0, 0], (wg) => {
        wg.sphere([0.4, 0.006, 0.74], [0.06, 0, z * 0.66], margin); // the black margin, under it all
        wg.sphere([0.34, 0.01, 0.6], [0.05, 0, z * 0.58], wing); // the wing
        wg.sphere([0.22, 0.012, 0.3], [0.12, 0, z * 0.92], deep); // deepening toward the tip
        wg.sphere([0.12, 0.013, 0.18], [0.02, 0, z * 0.18], shimmer); // a blue shimmer by the body
        for (let k = 0; k < 6; k++) { const a = -0.9 + k * 0.36; wg.limb([0, 0, z * 0.08], [Math.sin(a) * 0.3, 0, z * (0.1 + Math.cos(a) * 0.8)], 0.015, margin, 0.014); } // veins
        for (let k = 0; k < 9; k++) { const a = -1.0 + k * 0.25; wg.sphere([0.022, 0.017, 0.022], [0.06 + Math.sin(a) * 0.37, 0, z * (0.66 + Math.cos(a) * 0.7)], dot); } // white spots in the margin
        for (const [r, m, th] of [[0.11, eyeOut, 0.016], [0.075, eyeMid, 0.018], [0.035, eyeIn, 0.02]] as const) wg.sphere([r, th, r], [-0.05, 0, z * 0.72], m); // eyespot
      }, 0.7));
      c.joint([-0.1, y0 + 0.08, z * 0.1], [flying ? -z * beat * 0.85 : -z * 1.4, 0, (flying ? -0.1 : -0.35) + 0.42], (wg) => wg.joint([0, 0, 0], [0, 0, 0], (wg) => {
        wg.sphere([0.34, 0.006, 0.54], [-0.14, 0, z * 0.46], margin);
        wg.sphere([0.29, 0.01, 0.46], [-0.13, 0, z * 0.42], wing);
        wg.sphere([0.1, 0.013, 0.14], [-0.04, 0, z * 0.16], shimmer);
        for (let k = 0; k < 4; k++) { const a = -0.5 - k * 0.35; wg.limb([0, 0, z * 0.06], [Math.sin(a) * 0.34, 0, z * (0.06 + Math.cos(a) * 0.5)], 0.015, margin, 0.014); }
        for (let k = 0; k < 6; k++) { const a = -0.6 - k * 0.3; wg.sphere([0.02, 0.017, 0.02], [-0.14 + Math.sin(a) * 0.34, 0, z * (0.46 + Math.cos(a) * 0.52)], dot); }
        for (const [r, m, th] of [[0.08, eyeOut, 0.016], [0.05, band, 0.018], [0.025, eyeIn, 0.02]] as const) wg.sphere([r, th, r], [-0.24, 0, z * 0.6], m); // eyespot
        wg.limb([-0.36, 0, z * 0.62], [-0.72, 0, z * 0.7], 0.03, margin, 0.012); // the swallowtail
      }, 0.7));
    }
  }
  }, LOOK.dragon.scale(mass));
}

/**
 * The mother, built around her thorax (the model's origin, so she turns from there): a hard thorax carrying all six
 * legs and a cluster of eggs, a head in front, and a swollen abdomen dragging behind with a cavity on each side.
 */
function mother(b: ModelBuilder, p: Pose, mass: number, tier: 1 | 2 | 3 = 1): void {
  if (tier === 3) { motherT3(b, p, mass); return; }
  const W = tier === 2 ? 1.25 : 1, H = tier === 2 ? 1.2 : 1, legR = tier === 2 ? 1.3 : 1; // T2: wider, taller, heavier legs
  const shell: Mat = { color: '#7a5a3a', tex: 'leather', rough: 0.4 }; // thorax, head, legs: hard
  const belly: Mat = { color: '#e8d8b0', tex: 'skin', rough: 0.6 }; // the abdomen: soft, swollen
  const band: Mat = { color: '#c4ac80', tex: 'skin', rough: 0.6 };
  const dark: Mat = { color: '#2e1e18', tex: 'skin', rough: 0.95 };
  const eggMat: Mat = { color: '#f4f1e8', tex: 'none', rough: 0.85 };
  const t = p.phase * TAU, walking = p.anim === 'walk';
  const sway = walking ? Math.sin(t) * 0.06 : 0;
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    // thorax at the origin
    c.sphere([0.17, 0.14, 0.16], [0, 0.22, 0], shell);
    // head, in front, with mandibles
    c.sphere([0.11, 0.1, 0.11], [0.22, 0.21, 0], shell);
    for (const z of [1, -1]) {
      c.sphere(0.022, [0.3, 0.25, z * 0.07], { color: '#111111' });
      c.cone(0.025, 0.09, [0.34, 0.16, z * 0.04], shell, [0, z * 0.5, -Math.PI / 2], 6);
    }
    // six legs, all off the thorax: short and spread wide, a tripod gait
    for (const [x, ph, fx] of [[0.08, 0, 0.16], [0, 0.5, 0], [-0.08, 0, -0.16]] as const) for (const z of [1, -1]) {
      // (on planted feet: a tripod, each foot holding where it stands while she goes over it)
      const hip: V3 = [x, 0.2 * H, z * 0.12 * W], kneeRest: V3 = [x + fx * 0.5, 0.26 * H, z * 0.3 * W], rest: V3 = [x + fx, 0, z * 0.46 * W];
      const foot = walking ? footAt(rest, p.phase + ph + (z > 0 ? 0 : 0.5), 0.05, 0.04) : rest;
      const knee = jointBetween(hip, foot, span(hip, kneeRest), span(kneeRest, rest), [0, 1, z]);
      c.limb(hip, knee, 0.032 * legR, shell, 0.027 * legR);
      c.limb(knee, foot, 0.027 * legR, shell, 0.016 * legR);
    }
    // eggs clustered on the thorax
    const eggs = tier === 2 ? 11 : 7;
    for (let k = 0; k < eggs; k++) {
      const a = (k / eggs) * TAU, r = k === 0 ? 0 : 0.08 * W, up = k === 0 ? 0.04 : 0;
      c.sphere([0.045, 0.06, 0.045], [Math.cos(a) * r - 0.02, 0.39 * H + up, Math.sin(a) * r], eggMat);
    }
    // the swollen abdomen, dragging behind, banded, a cavity on each side
    c.joint([-0.12, 0.23 * H, 0], [0, sway, 0], (ab) => { // its belly on the ground
      ab.sphere([0.4, 0.25 * H, 0.28 * W], [-0.36, 0, 0], belly);
      for (const x of [-0.14, -0.32, -0.5]) ab.sphere([0.025, 0.26 * H, 0.29 * W], [x, 0, 0], band);
      // a cavity on each side (T2: two on each side)
      for (const cx of tier === 2 ? [-0.2, -0.48] : [-0.34]) for (const z of [1, -1]) {
        ab.sphere([0.08, 0.07, 0.03], [cx, 0.02, z * 0.27 * W], dark);
        ab.cylinder(0.085, 0.085, 0.02, [cx, 0.02, z * 0.265 * W], { team: 'primary', tex: 'skin' }, [Math.PI / 2, 0, 0], 14); // the rim, in her side's colour
      }
    });
  }, LOOK.mother.scale(mass));
}


/**
 * The T3 mother (the user's): an insectoid parasaurolophus. Up on big jointed insect hind legs, smaller forelegs, a
 * long chitin-plated body running back into a segmented tail, a raised neck and a head with the long tube crest
 * sweeping back; cavities on the sides of the abdomen, eggs on the thorax. Built around the thorax.
 */
function motherT3(b: ModelBuilder, p: Pose, mass: number): void {
  const plate: Mat = { color: '#5e4a3a', tex: 'leather', rough: 0.35 };
  const under: Mat = { color: '#d8c49a', tex: 'skin', rough: 0.6 };
  const dark: Mat = { color: '#241812', tex: 'skin', rough: 0.95 };
  const eggMat: Mat = { color: '#f4f1e8', tex: 'none', rough: 0.85 };
  const t = p.phase * TAU, walking = p.anim === 'walk';
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    const y0 = 0.55;
    // thorax at the origin, plated
    c.sphere([0.2, 0.16, 0.17], [0, y0, 0], plate);
    c.sphere([0.16, 0.08, 0.13], [0, y0 - 0.1, 0], under);
    // the abdomen: huge against her thin neck and legs, one sculpted shape. A ratite's chest: broad, high shoulders
    // whose sides fall steeply to a deep keel under the breast (a chicken's breast), the topline arching smoothly
    // back and the whole body tapering naturally away into the tail. Plated over the top, cavities on its sides
    // (the body flows on into her tail: one shape tapering away, drooping a little and swaying as she walks)
    const shape: [number, number, number, number, number][] = [ // x, half-width, up, down, keel
      [0.0, 0.13, 0.12, 0.1, 0.3],
      [-0.14, 0.3, 0.21, 0.3, 0.75],
      [-0.32, 0.39, 0.28, 0.42, 0.85],
      [-0.52, 0.41, 0.31, 0.34, 0.6],
      [-0.72, 0.36, 0.29, 0.24, 0.4],
      [-0.94, 0.28, 0.24, 0.17, 0.25],
      [-1.16, 0.2, 0.18, 0.12, 0.1],
      [-1.38, 0.14, 0.13, 0.09, 0],
      [-1.6, 0.1, 0.095, 0.07, 0],
      [-1.82, 0.072, 0.068, 0.052, 0],
      [-2.02, 0.05, 0.048, 0.038, 0],
      [-2.2, 0.03, 0.03, 0.025, 0],
      [-2.32, 0.012, 0.012, 0.012, 0],
    ];
    const along = (x: number): [number, number] => { // (her tail's droop and sway, growing toward its tip)
      const k = Math.max(0, (-0.9 - x) / 1.4);
      return [-0.16 * k * k, walking ? Math.sin(t - x * 2.5) * 0.09 * k * k : 0];
    };
    const centre = (x: number, up: number, dy = 0): [number, number, number] => { const [dr, sw] = along(x); return [x, y0 + up * 0.15 + dr + dy, sw]; };
    c.loft(shape.map(([x, w, up, down, keel]) => ({ at: centre(x, up), w, up, down, keel })), under);
    // the carapace: plates over the top, each a little proud of the last, their edges along her flanks, smaller and
    // closer down the tail
    for (const [from, to] of [[0, 3], [2, 5], [4, 7], [6, 9], [8, 11]] as const) {
      c.loft(shape.slice(from, to + 1).map(([x, w, up, , keel], i, all) => {
        const end = i === 0 || i === all.length - 1 ? 0.6 : 1; // (each plate's ends tuck in)
        return { at: centre(x, up, 0.02), w: w * 1.04 * end, up: (up + 0.015) * end, down: 0.04 * (w / 0.3), keel, flat: 0.15 };
      }), plate);
    }
    for (const [x, rz] of [[-0.32, 0.39], [-0.66, 0.37]] as const) for (const z of [1, -1]) {
      c.sphere([0.075, 0.07, 0.03], [x, y0 + 0.03, z * rz], dark);
      c.cylinder(0.08, 0.08, 0.018, [x, y0 + 0.03, z * (rz - 0.005)], { team: 'primary', tex: 'skin' }, [Math.PI / 2, 0, 0], 12);
    }
    // neck, head and its crest: the long tube sweeping back
    const head: [number, number, number] = [0.42, y0 + 0.42, 0];
    c.limb([0.14, y0 + 0.05, 0], head, 0.09, plate, 0.06);
    c.sphere([0.12, 0.07, 0.07], [head[0] + 0.06, head[1], 0], plate);
    c.cone(0.05, 0.12, [head[0] + 0.2, head[1] - 0.02, 0], plate, [0, 0, -Math.PI / 2], 8); // beak
    for (const z of [1, -1]) {
      c.sphere(0.02, [head[0] + 0.1, head[1] + 0.03, z * 0.055], { color: '#111111' });
      c.cone(0.018, 0.07, [head[0] + 0.2, head[1] - 0.06, z * 0.03], plate, [0, z * 0.4, -Math.PI / 2], 5); // mandibles
    }
    c.limb([head[0] + 0.04, head[1] + 0.06, 0], [head[0] - 0.42, head[1] + 0.28, 0], 0.04, plate, 0.03); // the crest
    // eggs on the thorax
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU, r = k === 0 ? 0 : 0.09;
      c.sphere([0.045, 0.06, 0.045], [Math.cos(a) * r - 0.04, y0 + 0.2 + (k === 0 ? 0.04 : 0), Math.sin(a) * r], eggMat);
    }
    // big jointed hind legs, small forelegs: insect legs
    for (const z of [1, -1]) {
      // (on planted feet: each hind leg steps with the foreleg across from it)
      const ph = p.phase + (z > 0 ? 0 : 0.5);
      const hip: V3 = [0.02, y0 - 0.04, z * 0.14], kneeRest: V3 = [0.1, y0 + 0.16, z * 0.42], ankleRest: V3 = [-0.04, 0.18, z * 0.48], rest: V3 = [0.06, 0, z * 0.5];
      const foot = walking ? footAt(rest, ph, 0.1, 0.06) : rest;
      const ankle: V3 = [foot[0] + ankleRest[0] - rest[0], foot[1] + ankleRest[1], foot[2] + ankleRest[2] - rest[2]];
      const knee = jointBetween(hip, ankle, span(hip, kneeRest), span(kneeRest, ankleRest), [0.3, 1, z]);
      c.limb(hip, knee, 0.06, plate, 0.05);
      c.limb(knee, ankle, 0.045, plate, 0.035);
      c.limb(ankle, foot, 0.03, plate, 0.018);
      const fhip: V3 = [0.1, y0 - 0.06, z * 0.1], fkRest: V3 = [0.22, y0 - 0.02, z * 0.22], frest: V3 = [0.3, 0, z * 0.26];
      const ffoot = walking ? footAt(frest, ph + 0.5, 0.1, 0.04) : frest;
      const fk = jointBetween(fhip, ffoot, span(fhip, fkRest), span(fkRest, frest), [0.5, 1, z]);
      c.limb(fhip, fk, 0.03, plate, 0.025);
      c.limb(fk, ffoot, 0.025, plate, 0.014);
    }
  }, LOOK.mother.scale(mass));
}

function mix(a: string, b: string, k: number): string {
  const h = (s: string, i: number) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(h(a, i) * (1 - k) + h(b, i) * k).toString(16).padStart(2, '0')).join('');
}

// ── bodies (the numbers worked through with the user; offshoot bodies are PLACEHOLDER) ─────────────────────────

const LARVA = { muscle: 0.8, frame: 0.1, reserve: 0.1 };
const EGG = { muscle: 0.1, frame: 0.1, reserve: 0.8 }; // cheap: an egg is fed after it's laid
const SHELL = { muscle: 0.1, frame: 0.8, reserve: 0.1 };
const MOTHER = { muscle: 0.55, frame: 0.25, reserve: 0.2 }; // enough muscle to carry her dearest egg's price beside her weapon crystal

const unit = (u: Omit<Unit, 'description'> & { description?: string }, look?: keyof typeof LOOK): Unit =>
  ({ description: '', ...u, ...(look ? { size: footprint(look, u.mass) } : {}) }) as Unit; // collision as wide as it's drawn

// the larvae: 35 / 70 / 140 food, work refinement = refinement
const larva1 = unit({ crawls: true, id: 'larva1', name: 'T1 Larva', mass: 15, physique: LARVA, refinement: 1, workRefinement: 1, shell: 'cocoon',
  digestsTrees: true, becomes: ['larva2', 'charger', 'micropike', 'mother1'], description: 'A small green larva. Gathers, then changes into a T1 form. Sent onto a tree, it turns the whole tree into food and is absorbed into it.',
  model: (b, p) => caterpillar(b, p, TIER[1], 15) }, 'caterpillar');
const larva2 = unit({ crawls: true, id: 'larva2', name: 'T2 Larva', mass: 60, physique: LARVA, refinement: 2, workRefinement: 2, shell: 'cocoon',
  becomes: ['larva3', 'flier', 'ground-attacker2', 'slinger', 'mother2'], description: 'A medium cyan larva. Gathers, then changes into a T2 form.',
  model: (b, p) => caterpillar(b, p, TIER[2], 60) }, 'caterpillar');
const larva3 = unit({ crawls: true, id: 'larva3', name: 'T3 Larva', mass: 179, physique: LARVA, refinement: 3, workRefinement: 3, shell: 'cocoon',
  becomes: ['dragon-fly', 'ground-attacker3', 'mother3'], description: 'A big purple larva. Gathers, then changes into a T3 form.',
  model: (b, p) => caterpillar(b, p, TIER[3], 179) }, 'caterpillar');

// eggs: laid cheap (about 19.5 food each), sized by tier, then fed until they hatch into their tier's larva
const egg = (tier: 1 | 2 | 3, mass: number) => unit({ id: `egg${tier}`, name: `T${tier} Egg`, mass, physique: EGG, refinement: tier, canGather: false,
  becomes: [`larva${tier}`], description: `A T${tier} egg. Give it food: it hatches into a T${tier} larva.`,
  model: (b, p) => origamiEgg(b, p, TIER[tier], mass) }, 'egg');

// the shell larvae change inside (at the larva's own mass): mostly frame, tough
const cocoon = unit({ id: 'cocoon', name: 'Cocoon', mass: 15, physique: SHELL, canGather: false, description: 'A larva changing. Give it food to finish.',
  model: (b, p) => origamiEgg(b, p, '#c8b88a', 15) }, 'egg'); // PLACEHOLDER look

// mothers: lay anything up to their own refinement (a mother carries at least her cheapest egg's price)
const motherOf = (r: 1 | 2 | 3, mass: number) => unit({ id: `mother${r}`, name: `Mother (r${r})`, mass, physique: MOTHER, refinement: r,
  spawns: ['egg1', 'egg2', 'egg3'].slice(0, r), attack: { style: 'strike', crystalMass: 1 }, // PLACEHOLDER attack (a side with no buildings needs something that can fight)
  description: `Lays eggs up to T${r}, and carries food to them.`, model: (b, p) => mother(b, p, mass, r) }, 'mother');

// offshoots, one refinement up (PLACEHOLDER bodies, attacks and names)
const charger = unit({ id: 'charger', name: 'Charger', mass: 38, physique: { muscle: 0.6, frame: 0.25, reserve: 0.15 }, refinement: 2,
  attack: { style: 'strike', crystalMass: 1.5 }, description: 'T1: a fast charging body.', model: (b, p) => bug(b, p, '#7fbf4a', 38, 'strike') }, 'bug');
const micropike = unit({ id: 'micropike', name: 'Micropike', mass: 35, physique: { muscle: 0.45, frame: 0.4, reserve: 0.15 }, refinement: 2,
  attack: { style: 'strike', crystalMass: 0.8, shaft: 1.5 }, description: 'T1: micropikes.', model: (b, p) => bug(b, p, '#6aa84a', 35, 'pike') }, 'bug');
const flier = unit({ id: 'flier', name: 'Flier', mass: 120, physique: { muscle: 0.5, frame: 0.25, reserve: 0.25 }, refinement: 3, flight: { launch: 'backward' },
  attack: { style: 'strike', crystalMass: 2 }, description: 'T2: a dive bomber: it swoops down onto its target to strike, its dive behind the blow, and climbs away again.', model: (b, p) => drawVee(b, p, 120) }, 'vee');
const groundAttacker2 = unit({ id: 'ground-attacker2', name: 'T2 Ground Attacker', mass: 150, physique: { muscle: 0.5, frame: 0.4, reserve: 0.1 }, refinement: 3,
  attack: { style: 'strike', crystalMass: 4 }, description: 'T2: a ground attacker.', model: (b, p) => bug(b, p, '#2a8a96', 150, 'strike') }, 'bug');
const slinger = unit({ id: 'slinger', name: 'Slinger', mass: 60, physique: { muscle: 0.5, frame: 0.3, reserve: 0.2 }, refinement: 3,
  attack: { style: 'throw', crystalMass: 0.5, ammo: 8, sling: 0.6 }, description: 'T2: a slinger.', model: (b, p) => bug(b, p, '#3ab0bc', 60, 'sling') }, 'bug');
const dragonFly = unit({ id: 'dragon-fly', name: 'Dragon Fly', mass: 500, physique: { muscle: 0.5, frame: 0.3, reserve: 0.2 }, refinement: 4, flight: true,
  attack: { style: 'throw', crystalMass: 6, ammo: 10 }, // PLACEHOLDER: its fire (a conversion of crystal) is still to design
  description: 'T3: a fire-breathing dragon with butterfly wings, insectoid and reptilian.', model: (b, p) => drawDragonFly(b, p, 500) }, 'dragon');
const groundAttacker3 = unit({ id: 'ground-attacker3', name: 'T3 Ground Attacker', mass: 600, physique: { muscle: 0.5, frame: 0.4, reserve: 0.1 }, refinement: 4,
  attack: { style: 'strike', crystalMass: 8 }, description: 'T3: a ground attacker.', model: (b, p) => bug(b, p, '#9a3aa6', 600, 'strike') }, 'bug');

export const units: Unit[] = [
  motherOf(1, 80), motherOf(2, 120), motherOf(3, 190),
  egg(1, 15), egg(2, 30), egg(3, 45), larva1, larva2, larva3, cocoon,
  charger, micropike, flier, groundAttacker2, slinger, dragonFly, groundAttacker3,
];

export const newFaction: FactionSpec = {
  id: 'newfaction',
  name: 'New Faction', // PLACEHOLDER: not named yet
  workerId: 'mother1', // it starts with one r1 mother, in the field (no buildings)
  startWorkers: 1,
  units,
  art: (team, onProgress, only) => import('./art').then((m) => m.bakeArt(team, onProgress, only)),
};
