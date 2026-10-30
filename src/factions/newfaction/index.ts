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
import { aim, footAt, jointBetween, shapedLimb, span } from '../../kits/bake3d/gait';
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
  egg: { scale: (m: number) => Math.cbrt(m / 15), length: 0.63 },
  mother: { scale: (m: number) => 0.95 * Math.cbrt(m / 40) * Math.pow(Math.min(1, 120 / m), 0.2), length: 1.25 }, // (drawn smaller, the T3 smaller still than ∛ of her mass: the user found them too big)
  vimmer: { scale: (m: number) => 1.3 * Math.cbrt(m / 120), length: 1.48 }, // (standing on its wings, that wide)
  charger: { scale: (m: number) => Math.cbrt(m / 38), length: 0.41 },
  lasher: { scale: (m: number) => 1.45 * Math.cbrt(m / 150), length: 0.47 },
  goliath: { scale: (m: number) => 2.6 * Math.cbrt(m / 600), length: 0.48 }, // (collision: its body; wings overlap others, as fliers' do)
  dragon: { scale: (m: number) => 2.0 * Math.cbrt(m / 500), length: 0.65 }, // 500 kg: ~4.5 m snout to tail-tip (collision: its body; wings overlap others, as fliers' do)
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
function drawVimmer(b: ModelBuilder, p: Pose, mass: number): void {
  const chitin: Mat = { color: '#1a2628', tex: 'leather', rough: 0.3, metal: 0.35 };
  const sheen: Mat = { color: '#2a9aa6', tex: 'leather', rough: 0.3, metal: 0.4 };
  const membrane: Mat = { color: '#4f6e6c', tex: 'skin', rough: 0.7 };
  const rib: Mat = { color: '#121818', tex: 'none', rough: 0.6 };
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
      shapedLimb(w, [0, 0, 0], [len, 0, 0], 0.03, [1.15, 1.0, 0.9, 0.8, 0.72], chitin, { flat: 0.3 }); // (the spar, tapering out)
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
  const body = (c: ModelBuilder) => spikeBody(c, p.armed, '#2a9aa6');
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
      o.joint([0, 0.15, 0], [0, 0, diving && p.style !== 'swoop' ? -0.9 : 0], (c) => vee(c, diving ? 0 : 1, flap)); // (its body at its true height; swooping: pulled out level, still folded)
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
  }, LOOK.vimmer.scale(mass));
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

/**
 * The body of the Vimmer and the charger: slim and segmented, tapering back to a barbed tail, spined down its back; at the
 * front a cluster of glossy eyes over a round maw ringed with teeth, the crystal spike thrust out of it (when it has
 * one). `tint` colours its segment rims and barbs.
 */
function spikeBody(c: ModelBuilder, armed: boolean, tint: string, len = 1): void {
  type V = [number, number, number];
  const chitin: Mat = { color: '#1a2628', tex: 'leather', rough: 0.3, metal: 0.35 };
  const sheen: Mat = { color: tint, tex: 'leather', rough: 0.3, metal: 0.4 };
  const eye: Mat = { color: '#050608', tex: 'none', rough: 0.05, metal: 0.5 };
  const tooth: Mat = { color: '#d8d4c0', tex: 'none', rough: 0.5 };
  const maw: Mat = { color: '#3a0e10', tex: 'skin', rough: 0.8 };
  // (`len`: drawn that much longer, a pike of a body: its trunk stretched, head and point pushed forward with it, as thick)
  const X = (x: number) => x * len, dh = 0.25 * (len - 1);
  c.loft([[-0.58, 0.02, 0.02, 0.02], [-0.44, 0.06, 0.05, 0.05], [-0.28, 0.08, 0.07, 0.08], [-0.12, 0.1, 0.085, 0.1], [0.02, 0.11, 0.1, 0.1], [0.14, 0.08, 0.075, 0.075], [0.2, 0.055, 0.055, 0.055]]
    .map(([x, w, up, down]) => ({ at: [X(x), 0, 0] as V, w, up, down, keel: 0.4 })), chitin);
  for (let x = -0.4; x <= 0.03; x += 0.14 / len) c.sphere([0.012, 0.09, 0.1], [X(x), 0, 0], sheen); // segment rims
  for (let i = 0; i < Math.round(6 * len); i++) c.cone(0.015, 0.07, [X(0.08) - i * 0.12, 0.08 - i * 0.004, 0], chitin, [0, 0, 0.6], 4); // spines down its back
  c.cone(0.025, 0.1, [X(-0.62), 0, 0], sheen, [0, 0, Math.PI / 2], 4); // the tail barb
  c.sphere([0.08, 0.07, 0.075], [0.25 + dh, 0, 0], chitin);
  for (const [y, z] of [[0.045, 0.03], [0.045, -0.03], [0.06, 0], [0.025, 0.05], [0.025, -0.05], [0.07, 0.035], [0.07, -0.035]] as const) c.sphere(0.017, [0.29 + dh, y, z], eye);
  c.sphere([0.02, 0.04, 0.04], [0.325 + dh, -0.02, 0], maw);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; c.cone(0.008, 0.035, [0.33 + dh, -0.02 + Math.cos(a) * 0.04, Math.sin(a) * 0.04], tooth, [a, 0, -Math.PI / 2 - 0.5], 4); }
  if (armed) c.crystal(0.32, [0.33 + dh, -0.02, 0], [0, 0, -Math.PI / 2]);
}

/** A charger's build: its legs (hip height standing, thigh, shin, the foot bone from toes up to ankle), how wide it
 *  stands, how thick its legs, its body's size and colour, and how far it strides walking and running. */
interface ChargerBuild { /** How far its ram slams forward (body units; 0.45 default), to its sim reach. */ ram?: number; H: number; thigh: number; shin: number; foot: [number, number, number]; hipZ: number; footZ: number; thighR: number; shinR: number; body: number; tint: string; walk: number; run: number; whip?: number; trebuchet?: boolean; long?: number; sling?: number }
const CHARGER: ChargerBuild = { ram: 0.89, H: 0.62, thigh: 0.3, shin: 0.32, foot: [-0.07, 0.21, 0], hipZ: 0.09, footZ: 0.11, thighR: 0.055, shinR: 0.035, body: 0.7, tint: '#7fbf4a', walk: 0.22, run: 0.34 };
// the T2 lasher: the charger's legs and body, and two whip arms held back along its torso (the user's design); `whip`:
// metres of lash (its attack.whip)
const LASHER: ChargerBuild = { H: 0.6, thigh: 0.29, shin: 0.31, foot: [-0.07, 0.2, 0], hipZ: 0.1, footZ: 0.12, thighR: 0.06, shinR: 0.038, body: 0.8, tint: '#2a8a96', walk: 0.21, run: 0.33, whip: 2 };
// the T2 slinger: the charger's build, its body the arm of a trebuchet (the user's design)
// (`sling`: metres of throwing arm and cord past its own reach, its attack.sling: the art draws the arm that long)
const SLINGER: ChargerBuild = { ...CHARGER, H: 0.6, body: 0.75, tint: '#3ab0bc', trebuchet: true, sling: 2 };
// the T1 micropike: the charger, its body much longer (the user's design); `long`: how many times the charger's length
const MICROPIKE: ChargerBuild = { ...CHARGER, H: 0.6, body: 0.62, tint: '#6aa84a', long: 1.9 };

/**
 * The chargers (the user's design): the Vimmer's body plan on two legs instead of wings: its central body slung
 * between two muscular legs like a running bird's (a thick thigh, a shin, a long foot bone, the ankle bending back),
 * striding long on planted feet; charging, it runs, both feet off the ground between strides; it strikes by ramming its
 * whole body forward, the spike first. At rest it squats, its body down on the ground, its legs folded.
 */
function drawCharger(b: ModelBuilder, p: Pose, mass: number, k: ChargerBuild = CHARGER): void {
  type V = [number, number, number];
  const chitin: Mat = { color: '#1a2628', tex: 'leather', rough: 0.3, metal: 0.35 };
  const muscle: Mat = { color: mix('#2a3a20', k.tint, 0.25), tex: 'leather', rough: 0.4, metal: 0.2 };
  const claw: Mat = { color: '#0e1210', tex: 'none', rough: 0.4 };
  const walking = p.anim === 'walk', running = walking && p.style === 'charge';
  // (squatting at rest: hips down so its body lies on the ground; up on its legs to walk, run or strike; 'rise' gets
  // up from the squat, its legs unfolding under it, the body lifting last)
  const ease = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
  // (braced, a set pike: crouched on its legs, its tail-end set on the ground, its body angled up, the point forward)
  const braced = p.style === 'brace';
  const upK = p.anim === 'rise' ? ease(p.phase) : braced ? 0.6 : walking || p.anim === 'attack' ? 1 : 0;
  // (at rest a charger sits back like a tripod: on its folded legs, nose up, its tail barb on the ground. Charging, it's
  // an outstretched spear: level, low, thrust forward, spike first)
  const restTilt = Math.asin(Math.sin(0.55) / (k.long ?? 1)); // (a longer body tips back less to bring its tail barb down)
  const rest = 0.25 * k.body / 0.7, H = rest - 0.04 + (k.H - rest + 0.04) * upK;
  const tail = 0.66 * (k.long ?? 1) * k.body; // (its tail barb's tip, behind its middle)
  const tilt = braced ? Math.asin(Math.min(0.9, (H + 0.02) / tail)) : restTilt * (1 - upK), spear = running ? 1 : 0;
  // its body rides lowest over a planted foot, highest in the stride (running: up in the moment both feet are off)
  const bob = running ? -0.06 + 0.07 * Math.max(0, Math.sin((p.phase * 2 - 0.35) * TAU)) : walking ? -0.03 + Math.abs(Math.cos(p.phase * TAU)) * 0.025 : 0;
    // (striking, a battering ram: drawn back on its legs, then slammed forward level and hard, spike first)
    const hit = p.anim === 'attack' && !k.whip && !k.trebuchet ? p.phase : -1;
    // (a long pike stabs instead: a short draw back, a quick thrust level along its length, and back)
    const stab = k.long !== undefined;
    const ramX = hit < 0 ? 0 : stab ? (hit < 0.25 ? -0.08 * Math.sin((hit / 0.25) * Math.PI / 2) : hit < 0.4 ? -0.08 + 0.43 * ((hit - 0.25) / 0.15) : 0.35 * (1 - (hit - 0.4) / 0.6) ** 2) : hit < 0.38 ? -0.22 * Math.sin((hit / 0.38) * Math.PI / 2) : hit < 0.5 ? -0.22 + ((k.ram ?? 0.45) + 0.22) * ((hit - 0.38) / 0.12) : (k.ram ?? 0.45) * (1 - (hit - 0.5) / 0.5) ** 2; // (exaggerated: far back, then a long hard slam, as far as its legs reach)
    const ramTilt = hit < 0 || stab ? 0 : hit < 0.38 ? 0.25 * Math.sin((hit / 0.38) * Math.PI / 2) : hit < 0.5 ? 0.25 - 0.45 * ((hit - 0.38) / 0.12) : -0.2 * (1 - (hit - 0.5) / 0.5) ** 2; // (rearing back, then driving down into it)
  const ramShift = ramX * k.body / 0.7; // (the hips go with the body: the whole of it lunges, its feet planted)
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    for (const S of [1, -1]) {
      const back = 0.11; // (a charger's legs attach well back along its body)
      // (a stab is thrust from the hips, the feet planted: the hips go only a little way with it)
      const hip: V = [-0.02 - back + ramShift * (stab ? 0.3 : 1), H + bob, S * k.hipZ], restFoot: V = [0.1 - 0.08 * upK - back, 0.01, S * (k.footZ + 0.05 * (1 - upK))];
      const ph = p.phase + (S > 0 ? 0 : 0.5);
      const foot = running ? footAt(restFoot, ph, k.run, 0.2, 0.35) : walking ? footAt(restFoot, ph, k.walk, 0.12, 0.55) : restFoot;
      const ankle: V = [foot[0] + k.foot[0], foot[1] + k.foot[1], foot[2]];
      const knee = jointBetween(hip, ankle, k.thigh, k.shin, [1, 0.3, S * 0.4]); // (its knee forward, its ankle bending back)
      shapedLimb(c, hip, knee, k.thighR, [1.1, 1.4, 1.35, 1.0, 0.7], muscle); // the thigh, thick with muscle, tapering to the knee
      c.sphere(k.thighR * 0.75, knee, chitin);
      shapedLimb(c, knee, ankle, k.shinR, [1.0, 0.85, 0.72, 0.66, 0.7], chitin, { flat: 0.3 }); // the shin
      c.sphere(k.shinR * 0.68, ankle, chitin);
      shapedLimb(c, ankle, foot, k.shinR * 0.65, [1.0, 0.85, 0.75, 0.8], chitin); // the foot bone
      for (const dz of [-0.03, 0, 0.03]) c.cone(0.012 * k.body / 0.7, 0.07 * k.body / 0.7, [foot[0] + 0.05, 0.01, foot[2] + dz * k.body / 0.7], claw, [0, dz * 4, -Math.PI / 2], 4); // toes
      c.cone(0.01, 0.05, [foot[0] - 0.04, 0.01, foot[2]], claw, [0, 0, Math.PI / 2], 4); // the back claw
    }
    // the body, slung between the hips: leaning into a run; striking, it rams forward, the spike first
    // (a lasher doesn't ram: it dips its torso down as it lashes)
    // (a trebuchet's throw: wound back nose up, its tail and the crystal in the sling at its tip held low behind; then
    // its head plunges like a counterweight, whipping the tail up over its back, the crystal loosed at the top; and it
    // swings back upright)
    const tp = p.anim === 'attack' && k.trebuchet ? p.phase : -1, rp = p.anim === 'reload' && k.trebuchet ? p.phase : -1;
    const treb = rp >= 0 ? 0.55 * Math.max(0, (rp - 0.7) / 0.3) : tp < 0 ? 0 : tp < 0.3 ? 0.55 * Math.sin((tp / 0.3) * Math.PI / 2) : tp < 0.55 ? 0.55 - 2.75 * ((tp - 0.3) / 0.25) ** 2 : -2.2 * (1 - (tp - 0.55) / 0.45) ** 2;
    const dip = k.whip ? Math.sin(Math.min(1, p.phase / 0.7) * Math.PI) * (p.anim === 'attack' ? 1 : 0) : 0;
    const bodyY = H + bob + 0.04 - 0.08 * dip - 0.07 * spear, bodyRot = tilt + ramTilt + treb + (running ? (spear ? -0.02 : -0.15) : 0) - 0.35 * dip;
    c.joint([ramShift + 0.08 * spear, bodyY, 0], [0, 0, bodyRot], (t) => t.joint([0, 0, 0], [0, 0, 0], (q) => {
      spikeBody(q, k.whip || k.trebuchet ? false : p.armed, k.tint, k.long);
      if (k.trebuchet) trebuchetParts(q, p, tp, rp, k.tint, { y: bodyY, rot: bodyRot, scale: k.body }, ((k.sling ?? 1.6) / (k.body * LOOK.charger.scale(mass)) - 0.16) / 8);
      if (k.whip) whipArms(q, p, (k.whip / LOOK.lasher.scale(mass)) / k.body, k.tint);
    }, k.body));
  }, (k.whip ? LOOK.lasher : LOOK.charger).scale(mass));
}


/**
 * The lasher's two whip arms (the user's design), from its shoulders: at rest held back along its torso in swaying S
 * curves, their tips curling up, a wave running down them; striking, the near one lashes out to its
 * whole length straight ahead, up and over its back, unrolling segment by segment, rippling, its tip cracking over at full stretch, the
 * crystal at its tip, and is drawn back in. `len`: the lash's length in its body's frame.
 */
function whipArms(c: ModelBuilder, p: Pose, len: number, tint: string): void {
  type V = [number, number, number];
  const chitin: Mat = { color: '#1a2628', tex: 'leather', rough: 0.3, metal: 0.35 };
  const sheen: Mat = { color: tint, tex: 'leather', rough: 0.3, metal: 0.4 };
  const ease = (x: number) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };
  const n = 14, seg = len / n, s = p.anim === 'attack' ? p.phase : 0, t = p.phase * TAU;
  // out and back: lashing out over the first half, drawn in over the rest; at full stretch the tip cracks over
  // (first it winds up: the arm lifting up behind it, coiling into a deep S; then the lash, and drawn back in)
  const wind = p.anim === 'attack' ? (s < 0.3 ? ease(s / 0.3) : 1 - ease((s - 0.3) / 0.15)) : 0;
  const out = s < 0.25 ? 0 : s < 0.55 ? ease((s - 0.25) / 0.3) : 1 - ease((s - 0.55) / 0.45);
  const crack = p.anim === 'attack' ? Math.sin(Math.max(0, Math.min(1, (s - 0.3) / 0.35)) * Math.PI) : 0;
  const speed = p.anim === 'walk' ? 1 : 0.5; // (a wave runs down them, quicker on the move)
  for (const z of [1, -1]) {
    const lash = z > 0 ? out : 0, coil = z > 0 ? wind : 0; // (the near arm strikes; the other stays back)
    const loose = 1 - lash; // (held back they curve and sway freely; lashing out they straighten, rippling)
    let at: V = [0.12, 0.03, z * 0.1];
    for (let i = 0; i < n; i++) {
      const u = i / n;
      // swung from back along its side (π) round to straight ahead (0), the ones nearer the tip a beat later
      let a = Math.PI * (1 - ease(lash * 1.35 - u * 0.35));
      // an S along its side when held, swaying, a wave running down it; a ripple chasing the lash out
      a += z * (Math.sin(t * speed - u * 5 + (z > 0 ? 0 : Math.PI)) * (0.42 * loose + 0.12) + loose * 0.25 * Math.sin(u * Math.PI * 1.5));
      // rising and falling as it goes: the tip curling up when held, cracking over at full stretch
      const e = 0.1 * Math.sin(t * speed * 1.3 - u * 4) + loose * Math.max(0, u - 0.6) * 2.2 + crack * (z > 0 ? 1 : 0) * Math.max(0, u - 0.65) * 4;
      // (lashing, it whips up and over its back to straight ahead, rippling in its own plane, a little play side to side)
      const v = Math.PI * (1 - ease(lash * 1.35 - u * 0.35)) + Math.sin(u * TAU - s * TAU * 1.5) * (0.3 + 1.6 * lash * (1 - lash)) * lash // (a pronounced S, travelling down it, strongest mid-lash)
        - coil * (0.9 + Math.sin(u * TAU * 1.1 + 0.6) * 1.0); // (winding up: raised behind it, coiled in a deep S)
      const dir: V = lash > 0.02 || coil > 0.02
        ? [Math.cos(v), Math.sin(v) + crack * Math.max(0, u - 0.65) * 3, z * (0.08 + Math.sin(t * speed - u * 5) * 0.12)]
        : [Math.cos(a) * Math.cos(e), Math.sin(e), z * Math.sin(a) * Math.cos(e) * 0.3];
      const l = Math.hypot(...dir), next: V = [at[0] + (dir[0] / l) * seg, at[1] + (dir[1] / l) * seg, at[2] + (dir[2] / l) * seg];
      const r = 0.032 * (1 - u * 0.75);
      c.limb(at, next, r, i % 3 === 2 ? sheen : chitin, 0.032 * (1 - (i + 1) / n * 0.75));
      at = next;
    }
    if (p.armed && z > 0) c.crystal(0.14, at, [0, 0, -Math.PI / 2 + (1 - out) * Math.PI]); // the crystal at the near lash's tip
  }
}

/**
 * The slinger's trebuchet (the user's design), on the charger's body: a heavy armoured head, the counterweight that
 * plunges; its tail drawn out into a long segmented throwing arm, spined and braced by struts; and at its end a long
 * sling cord with a pouch, the crystal in it till it's loosed at the top of the swing. A pouch of crystals rides on its
 * counterweight: reloading, the arm swings up over its back to it, takes a crystal into the sling, and swings back down
 * low behind, cocked. Before a throw the arm is pulled down to the ground. `tp`, `rp`: the throw's and the reload's progress (-1 when not).
 */
function trebuchetParts(q: ModelBuilder, p: Pose, tp: number, rp: number, tint: string, body: { y: number; rot: number; scale: number }, seg = 0.16): void {
  type V = [number, number, number];
  const chitin: Mat = { color: '#1a2628', tex: 'leather', rough: 0.3, metal: 0.35 };
  const sheen: Mat = { color: tint, tex: 'leather', rough: 0.3, metal: 0.4 };
  const cord: Mat = { color: '#6a5640', tex: 'leather', rough: 0.8 };
  // the counterweight: plates over a heavy head
  q.loft([[0.16, 0.1, 0.1, 0.08], [0.26, 0.13, 0.13, 0.09], [0.36, 0.1, 0.1, 0.07], [0.42, 0.05, 0.05, 0.04]].map(([x, w, u, d]) => ({ at: [x, 0.04, 0] as V, w, up: u, down: d, flat: 0.25 })), sheen);
  for (const x of [0.2, 0.28, 0.36]) q.cone(0.022, 0.07, [x, 0.17, 0], chitin, [0, 0, 0.5], 4);
  // the pouch of crystals on its counterweight
  q.sphere([0.06, 0.045, 0.05], [0.24, 0.2, 0.07], cord); // (on its counterweight)
  for (const [dx, dz] of [[-0.02, 0.05], [0.02, 0.08], [0.0, 0.065]] as const) q.crystal(0.05, [0.24 + dx, 0.23, dz], [0.3, 0, 0.2]);
  // the arm's swing about the tail's base: reloading, up over its back to the pouch and back down low behind (cocked);
  // winding up to throw, pulled down to the ground
  const ease = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
  // (reloading, it rolls up over its back in an O, each segment curling further than the last, and unrolls back down
  // low, cocked; winding up to throw, the arm is pulled down to the ground)
  const reach = rp >= 0 ? (rp < 0.45 ? ease(rp / 0.45) : rp < 0.55 ? 1 : 1 - ease((rp - 0.55) / 0.45)) : 0;
  const arm = rp >= 0 ? 1.2 * reach - (rp > 0.55 ? 0.35 * ease((rp - 0.55) / 0.45) : 0) : tp >= 0 && tp < 0.3 ? -0.35 * ease(tp / 0.3) : 0;
  const curl = 3.2 * reach; // (curled, the long arm's tip comes over to hang its sling on the counterweight's pouch)
  const loaded = p.armed && (rp >= 0 ? rp > 0.5 : tp < 0 || tp < 0.5);
  // (how high above the ground a point in the arm's own frame is: through the arm's swing, the body's tilt and size)
  const groundY = (x: number, y: number): number => {
    const ax = -0.58 + x * Math.cos(-arm) - y * Math.sin(-arm), ay = x * Math.sin(-arm) + y * Math.cos(-arm);
    return body.y + body.scale * (ax * Math.sin(body.rot) + ay * Math.cos(body.rot));
  };
  q.joint([-0.58, 0, 0], [0, 0, -arm], (a) => trebuchetArm(a, tp, loaded, curl, chitin, sheen, cord, groundY, seg));
  for (const z of [1, -1]) q.limb([-0.3, -0.06, z * 0.06], [-0.58, 0, z * 0.015], 0.008, chitin, 0.005); // struts
}

/** The slinger's throwing arm, from the tail's base (local origin) out along -x, with its sling. */
function trebuchetArm(q: ModelBuilder, tp: number, loaded: boolean, curl: number, chitin: Mat, sheen: Mat, cord: Mat, groundY: (x: number, y: number) => number, seg = 0.16): void {
  type V = [number, number, number];
  let at: V = [0, 0, 0];
  for (let i = 1; i <= 8; i++) { // (a long arm: eight segments)
    let th = curl * ((i - 0.5) / 8); // (curling: each segment turned up and over a little further than the last)
    const step = (a: number): V => [at[0] - seg * Math.cos(a), at[1] + 0.012 + seg * Math.sin(a), 0]; // (its segments as long as the sim's sling makes the arm)
    for (let k = 0; k < 40 && groundY(step(th)[0], step(th)[1]) < 0.035; k++) th += 0.06; // (never into the ground: it lies along it, dragging)
    const nx = step(th);
    shapedLimb(q, at, nx, 0.038 * (1 - i * 0.08), [1.1, 0.85, 0.9, 1.05], i % 2 ? chitin : sheen, { flat: 0.3 });
    q.cone(0.012, 0.045, [nx[0] + 0.05, nx[1] + 0.03, 0], chitin, [0, 0, 0.6], 4);
    at = nx;
  }
  // the sling: a long cord swinging from the arm's end, its pouch, the crystal in it till it's loosed
  const swing = tp < 0 ? 0 : tp < 0.3 ? -0.3 * (tp / 0.3) : tp < 0.55 ? -0.3 + 1.6 * ((tp - 0.3) / 0.25) : 1.3 - 1.3 * ((tp - 0.55) / 0.45);
  const pouch: V = curl > 0.1 ? [at[0] + 0.06, at[1] - 0.15, 0] : [at[0] - 0.16 * Math.cos(swing), at[1] - 0.16 * Math.sin(-swing) - 0.04, 0]; // (curled over, its sling hangs down to the pouch)
  for (let k = 0; k < 20 && groundY(pouch[0], pouch[1]) < 0.04; k++) pouch[1] += 0.02; // (resting on the ground, not in it)
  q.limb(at, pouch, 0.006, cord, 0.005);
  q.sphere([0.045, 0.028, 0.04], pouch, cord);
  if (loaded) q.crystal(0.09, [pouch[0], pouch[1] + 0.01, 0], [0, 0, Math.PI / 2]);
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
  // gathering, it rears up on its front segment alone (the rest of it stays down), head high, nibbling
  const rise = p.anim === 'gather' ? 1 : 0;
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    for (const seg of segs) {
      const lift = p.anim === 'walk' ? Math.max(0, Math.sin(crawl - seg * 2.1)) * 0.06 : 0; // (each segment heaves in turn)
      for (let k = 0; k < 2; k++) {
        const x = at(seg) + 0.065 - k * 0.13 - (seg === 0 && k === 0 ? 0.03 * rise : 0), r = 0.1 - seg * 0.006 - k * 0.004;
        const up = lift + (seg === 0 ? rise * (k === 0 ? 0.11 : 0.035) : 0);
        c.sphere([r * 1.05, r, r], [x, r + up, 0], skin);
        c.sphere([r * 0.7, r * 0.35, r * 0.75], [x, r * 0.45 + up, 0], belly);
        if (!(seg === 0 && k === 0 && rise)) for (const z of [1, -1]) c.limb([x, 0.06 + up, z * r * 0.7], [x, 0.0, z * r * 1.0], 0.016, skin); // stubby legs
        else for (const z of [1, -1]) c.limb([x, 0.08 + up, z * r * 0.7], [x + 0.06, 0.04 + up, z * r * 1.0], 0.016, skin); // (raised: its front legs held up, curled)
      }
      c.sphere(0.022, [at(seg), 0.2 + lift, 0], { team: 'primary', tex: 'none' }); // a team dot on each segment
    }
    if (!segs.includes(0)) return;
    // giving: it rears its head up and over, takes the food off its back in its mouth, and dips to set it down in front
    const give = p.anim === 'give' ? p.phase : -1, rear = give >= 0 ? Math.sin(Math.min(1, give / 0.9) * Math.PI) : 0;
    const eat = p.anim === 'gather' || p.anim === 'eat' ? Math.sin(p.phase * TAU * 2) * 0.03 : 0;
    const hx = 0.22 + 0.06 * rear - 0.04 * rise, hy = 0.12 + eat + 0.1 * rear * (give < 0.5 ? 1 : 1 - (give - 0.5) * 2.2) + 0.2 * rise;
    c.sphere(0.11, [hx, hy, 0], skin); // head
    for (const z of [1, -1]) c.sphere(0.018, [hx + 0.09, hy + 0.03, z * 0.05], { color: '#111111' });
    const food = { color: '#a83a4a', tex: 'skin' as const, rough: 0.5 };
    if (give >= 0) { if (give < 0.92) { const k = Math.min(1, give / 0.45), mouth: V3 = [hx + 0.12, hy - 0.02, 0]; c.sphere([0.07, 0.055, 0.07], give < 0.45 ? [mouth[0] * k, 0.24 + (mouth[1] - 0.24) * k, 0] : mouth, food); } }
    else if (p.cargo) c.sphere([0.08, 0.06, 0.08], [0, 0.24, 0], { color: p.cargo === 'food' ? '#a83a4a' : p.cargo === 'wood' ? '#7a5634' : '#8fe6ff' });
  }, LOOK.caterpillar.scale(mass));
}

/**
 * An egg: an origami steamed bun (the user's), its paper pleats spiralling up to a twisted knot, tinted toward its
 * larva, sized by tier. A cocoon is the same bun. Waiting on food ('hungry') it's dark and sagging, barely breathing;
 * fed, cooking ('grow'), it's bright and pulses, its pleats glowing; hatching ('hatch', its last moments) it shudders and
 * its top opens out petal by petal, the young one's head rising out of it.
 */
function origamiBun(b: ModelBuilder, p: Pose, tint: string, mass: number): void {
  const t = p.phase * TAU, h = p.anim === 'hatch' ? p.phase : 0, hungry = p.anim === 'hungry', cooking = p.anim === 'grow' || p.anim === 'hatch';
  const sm = (x: number) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };
  const dim = (c: string) => (hungry ? mix(c, '#2a2520', 0.5) : c);
  const pulse = p.anim === 'grow' ? Math.sin(t) : 0;
  const paper: Mat = { color: dim(mix('#f4efe2', tint, 0.35)), tex: 'none', rough: 0.85 };
  const fold: Mat = { color: dim(mix('#d8d0bc', tint, 0.55)), tex: 'none', rough: 0.85 };
  const pleat: Mat = cooking ? { color: mix(mix('#ffffff', tint, 0.5), tint, 0.5 - 0.5 * pulse), tex: 'none', rough: 0.4, emissive: tint } : fold;
  // its swell: pulsing as it cooks, sagging hungry, breathing at rest
  const sx = 1 + (p.anim === 'grow' ? 0.05 * pulse : p.anim === 'idle' ? 0.015 * Math.sin(t) : hungry ? 0.008 * Math.sin(t) : 0);
  const sy = (hungry ? 0.9 : 1) * (1 + (p.anim === 'grow' ? 0.08 * pulse : p.anim === 'idle' ? 0.02 * Math.sin(t) : 0));
  const shake = h > 0 && h < 0.35 ? Math.sin(h * 45) * 0.12 * (h / 0.35) : 0; // (shuddering before it opens)
  const N = 8, oct = Math.PI / N; // (eight pleats round an eight-sided bun)
  b.joint([0, 0, 0], [shake * 0.6, 0, shake], (e) => {
    e.cylinder(0.24 * sx, 0.21 * sx, 0.06 * sy, [0, 0.03 * sy, 0], fold, [0, oct, 0], N); // its flat underside
    e.cylinder(0.17 * sx, 0.24 * sx, 0.12 * sy, [0, 0.12 * sy, 0], paper, [0, oct, 0], N); // the lower dome
    const open = sm((h - 0.35) / 0.45);
    if (open <= 0) {
      e.cylinder(0.06 * sx, 0.17 * sx, 0.1 * sy, [0, 0.23 * sy, 0], paper, [0, oct, 0], N); // the upper dome
      e.cylinder(0.0, 0.06 * sx, 0.07 * sy, [0, 0.315 * sy, 0], fold, [0, oct + 0.4, 0], N); // the twisted knot
      for (let i = 0; i < N; i++) { // the pleats, spiralling up to the knot
        const a = (i / N) * TAU, pt = (r: number, y: number, tw: number): V3 => [Math.cos(a + tw) * r * sx, y * sy, Math.sin(a + tw) * r * sx];
        e.limb(pt(0.235, 0.07, 0), pt(0.18, 0.19, 0.25), 0.013, pleat, 0.011);
        e.limb(pt(0.18, 0.19, 0.25), pt(0.05, 0.31, 0.6), 0.011, pleat, 0.006);
      }
      return;
    }
    // hatching: the top opens out, petal by petal, each pleat's panel hinged on the lower dome's rim
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, k = sm((h - 0.35 - i * 0.03) / 0.4), ca = Math.cos(a), sa = Math.sin(a);
      const shut: V3 = [-0.13 * ca, 0.16, -0.13 * sa], out: V3 = [ca * 0.8, 0.5, sa * 0.8];
      const dir: V3 = [shut[0] + (out[0] - shut[0]) * k, shut[1] + (out[1] - shut[1]) * k, shut[2] + (out[2] - shut[2]) * k];
      e.joint([0.17 * ca * sx, 0.18 * sy, 0.17 * sa * sx], aim(dir, [-sa, 0, ca]), (pt) => {
        pt.loft([{ at: [0, 0, 0], w: 0.07, up: 0.006, down: 0.006 }, { at: [0.2, 0, 0], w: 0.004, up: 0.004, down: 0.004 }], paper);
        pt.limb([0, 0.008, 0], [0.18, 0.006, 0], 0.008, pleat, 0.004); // its pleat
      });
    }
    const rise = sm((h - 0.5) / 0.45); // the young one's head, rising out
    if (rise > 0) {
      e.sphere([0.11, 0.1 * (0.6 + 0.4 * rise), 0.11], [0, 0.18 + 0.15 * rise, 0], { color: mix(tint, '#ffffff', 0.15), tex: 'skin', rough: 0.35 });
      for (const z of [1, -1]) e.sphere(0.022, [0.07, 0.22 + 0.16 * rise, z * 0.05], { color: '#141010', rough: 0.2 });
    }
  }, LOOK.egg.scale(mass));
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
      shapedLimb(c, n, next, 0.042 - i * 0.003, [1.0, 0.88, 0.85, 0.95], scale, { flat: 0.15 }); // (a segment pinched at its middle)
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
      shapedLimb(c, hip, knee, 0.022, [1.15, 1.05, 0.9, 0.82], horn, { flat: 0.3 });
      c.sphere(0.017, knee, horn);
      shapedLimb(c, knee, foot, 0.018, [0.95, 0.8, 0.65, 0.5], horn);
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

/** The mothers: one creature at three sizes (the user's picks): T1 and T2 the T3 simplified, smaller and crawling. */
function mother(b: ModelBuilder, p: Pose, mass: number, tier: 1 | 2 | 3 = 1): void {
  motherT3(b, p, mass, tier === 3 ? {} : tier === 2 ? T2_MOTHER : T1_MOTHER);
}


/**
 * The T3 mother (the user's): an insectoid parasaurolophus. Up on big jointed insect hind legs, smaller forelegs, a
 * long chitin-plated body running back into a segmented tail, a raised neck and a head with the long tube crest
 * sweeping back; cavities on the sides of the abdomen, eggs on the thorax. Built around the thorax.
 */
/** The T3 mother's head, in one of its styles (concepts), facing +x: duck-billed (hers), hammerhead, shovel snout, armoured helmet, mantis, frilled. */
function motherHead(h: ModelBuilder, style: MotherHead, crestK: number, plate: Mat, under: Mat, flare = 0): void {
  type V = [number, number, number];
  const eye: Mat = { color: '#111111', rough: 0.1 };
  // (her crest in her side's colour: it reads from afar, and sets her head apart from her legs)
  const crestTube = (pts: number[][]) => crestK > 0.01 && h.loft(pts.map(([x, y, r]) => ({ at: [x * crestK, y * crestK, 0] as V, w: r * 0.8, up: r, down: r })), { team: 'primary', tex: 'leather', rough: 0.35 });
  const mandibles = (x: number, y: number, len: number) => { for (const z of [1, -1]) h.cone(0.02, len, [x, y, z * 0.06], plate, [0, z * 0.5, -Math.PI / 2], 5); };
  if (style === 'mantisFrill') {
    // a mantis's face under a ceratopsian's frill: a broad triangle of a head, great glossy compound eyes at its top
    // corners, antennae, heavy hooked mandibles; behind, a broad ribbed frill with a scalloped, spiked rim, flaring as
    // she strikes
    h.loft([{ at: [-0.08, 0.02, 0], w: 0.07, up: 0.06, down: 0.05 }, { at: [0.02, 0.03, 0], w: 0.16, up: 0.07, down: 0.05, flat: 0.4 }, { at: [0.12, -0.01, 0], w: 0.1, up: 0.05, down: 0.045, flat: 0.2 }, { at: [0.22, -0.05, 0], w: 0.05, up: 0.035, down: 0.035 }, { at: [0.27, -0.07, 0], w: 0.02, up: 0.02, down: 0.02 }], plate);
    h.loft([{ at: [0.06, -0.04, 0], w: 0.08, up: 0.02, down: 0.03 }, { at: [0.2, -0.07, 0], w: 0.05, up: 0.015, down: 0.02 }], under); // the jaw beneath
    for (const z of [1, -1]) {
      h.sphere([0.065, 0.068, 0.06], [0.04, 0.06, z * 0.15], { color: '#2a3a18', rough: 0.15, metal: 0.35 }); // compound eye
      h.sphere([0.02, 0.02, 0.015], [0.08, 0.09, z * 0.18], { color: '#c8e070', emissive: '#304010' }); // its glint
      h.limb([0.06, 0.08, z * 0.04], [0.02, 0.3, z * 0.12], 0.008, plate, 0.005); // antenna
      h.limb([0.02, 0.3, z * 0.12], [-0.08, 0.42, z * 0.18], 0.005, plate, 0.003);
      h.limb([0.2, -0.07, z * 0.05], [0.34, -0.1, z * 0.08], 0.026, plate, 0.018); // mandible
      h.limb([0.34, -0.1, z * 0.08], [0.4, -0.07, -z * 0.01], 0.018, plate, 0.005);
      for (const k of [0.25, 0.31]) h.cone(0.007, 0.025, [k, -0.09, z * (0.04 + k * 0.08)], under, [z * Math.PI / 2, 0, 0], 4); // teeth on its inner edge
    }
    h.joint([-0.08, 0.06, 0], [0, 0, 0.85 - flare * 0.3], (f) => {
      const R = (0.34 + flare * 0.06) * crestK;
      f.sphere([0.035, R * 0.85, R], [0, R * 0.4, 0], under); // the frill
      for (let k = -4; k <= 4; k++) {
        const a = k * 0.33, tip: V = [0.02, R * 0.4 + Math.cos(a) * R * 0.82, Math.sin(a) * R * 0.95];
        f.limb([0.02, 0, 0], tip, 0.012, plate, 0.006); // a rib
        f.cone(0.012, 0.06, [tip[0], tip[1] + Math.cos(a) * 0.03, tip[2] + Math.sin(a) * 0.03], plate, [a, 0, 0], 4); // a spike on its rim
      }
    });
  } else if (style === 'shortShovel') {
    // the shovel snout, short: a flat narrow snout lined with teeth, a crest running back off the skull
    h.loft([{ at: [-0.1, 0.01, 0], w: 0.08, up: 0.07, down: 0.05 }, { at: [0.04, 0.01, 0], w: 0.1, up: 0.06, down: 0.05 }, { at: [0.16, -0.01, 0], w: 0.055, up: 0.032, down: 0.03, flat: 0.5 }, { at: [0.3, -0.03, 0], w: 0.045, up: 0.02, down: 0.02, flat: 0.6 }, { at: [0.36, -0.035, 0], w: 0.05, up: 0.012, down: 0.012, flat: 0.8 }], plate);
    for (let x = 0.18; x < 0.35; x += 0.05) for (const z of [1, -1]) h.cone(0.006, 0.03, [x, -0.05, z * 0.035], under, [Math.PI, 0, 0], 4); // a row of teeth
    for (const z of [1, -1]) h.sphere([0.028, 0.03, 0.02], [0.02, 0.06, z * 0.085], eye);
    crestTube([[-0.02, 0.06, 0.03], [-0.2, 0.1, 0.05], [-0.42, 0.1, 0.035], [-0.56, 0.08, 0.01]]);
  } else if (style === 'duck') {
    // flattened, broad and low like a duck-billed dinosaur's: a wide skull flattening into a broad bill; a long crest tube
    h.loft([{ at: [-0.1, 0, 0], w: 0.08, up: 0.06, down: 0.05 }, { at: [0.06, 0.01, 0], w: 0.15, up: 0.07, down: 0.05, flat: 0.4 }, { at: [0.22, -0.01, 0], w: 0.13, up: 0.045, down: 0.04, flat: 0.6 }, { at: [0.36, -0.03, 0], w: 0.12, up: 0.022, down: 0.022, flat: 0.8 }, { at: [0.42, -0.035, 0], w: 0.08, up: 0.012, down: 0.012, flat: 0.8 }], plate);
    h.loft([{ at: [0.12, -0.05, 0], w: 0.1, up: 0.015, down: 0.02 }, { at: [0.32, -0.065, 0], w: 0.1, up: 0.012, down: 0.015, flat: 0.6 }, { at: [0.4, -0.065, 0], w: 0.06, up: 0.008, down: 0.01 }], under);
    for (const z of [1, -1]) h.sphere([0.03, 0.026, 0.02], [0.08, 0.05, z * 0.13], eye);
    mandibles(0.4, -0.07, 0.1);
    crestTube([[0.0, 0.05, 0.045], [-0.18, 0.15, 0.05], [-0.38, 0.26, 0.045], [-0.56, 0.34, 0.038], [-0.7, 0.38, 0.026], [-0.76, 0.39, 0.012]]);
  } else if (style === 'hammer') {
    // a hammerhead: a wide flat bar across her face, eyes out at its ends; a short swept crest
    h.loft([{ at: [-0.08, 0, 0], w: 0.07, up: 0.06, down: 0.05 }, { at: [0.06, 0, 0], w: 0.1, up: 0.06, down: 0.05 }, { at: [0.16, -0.01, 0], w: 0.08, up: 0.04, down: 0.04 }], plate);
    h.joint([0.16, 0, 0], [Math.PI / 2, 0, 0], (bar) => bar.loft([-0.32, -0.2, 0, 0.2, 0.32].map((x, i) => ({ at: [0, x, 0] as V, w: i % 4 === 0 ? 0.04 : 0.08, up: 0.022, down: 0.022, flat: 0.7 })), plate));
    for (const z of [1, -1]) h.sphere([0.04, 0.04, 0.035], [0.17, 0.01, z * 0.33], eye);
    mandibles(0.24, -0.04, 0.09);
    crestTube([[0.0, 0.05, 0.04], [-0.16, 0.13, 0.035], [-0.3, 0.17, 0.02], [-0.36, 0.18, 0.008]]);
  } else if (style === 'shovel') {
    // a long, flat, narrow snout like a gharial's or a pterosaur's; a crest running back off the skull
    h.loft([{ at: [-0.1, 0.01, 0], w: 0.08, up: 0.07, down: 0.05 }, { at: [0.04, 0.01, 0], w: 0.1, up: 0.06, down: 0.05 }, { at: [0.2, -0.01, 0], w: 0.05, up: 0.03, down: 0.03, flat: 0.5 }, { at: [0.5, -0.03, 0], w: 0.04, up: 0.02, down: 0.02, flat: 0.6 }, { at: [0.62, -0.035, 0], w: 0.05, up: 0.012, down: 0.012, flat: 0.8 }], plate);
    for (let x = 0.24; x < 0.6; x += 0.06) for (const z of [1, -1]) h.cone(0.006, 0.03, [x, -0.05, z * 0.035], under, [Math.PI, 0, 0], 4); // a row of teeth
    for (const z of [1, -1]) h.sphere([0.028, 0.03, 0.02], [0.02, 0.06, z * 0.085], eye);
    crestTube([[-0.02, 0.06, 0.03], [-0.2, 0.1, 0.05], [-0.42, 0.1, 0.035], [-0.56, 0.08, 0.01]]);
  } else if (style === 'helmet') {
    // an armoured casque: a rounded helmet of a skull, a heavy beak, overlapping plates sweeping back as its crest
    h.loft([{ at: [-0.14, 0.02, 0], w: 0.09, up: 0.08, down: 0.05 }, { at: [0.02, 0.03, 0], w: 0.14, up: 0.12, down: 0.06, flat: 0.2 }, { at: [0.16, 0, 0], w: 0.1, up: 0.07, down: 0.05 }, { at: [0.28, -0.04, 0], w: 0.04, up: 0.035, down: 0.04, keel: 0.6 }], plate);
    for (let i = 0; i < 4; i++) h.loft([0, 1, 2].map((k) => ({ at: [-0.02 - i * 0.12 - k * 0.06, 0.13 + i * 0.05 + k * 0.01, 0] as V, w: 0.07 - i * 0.012, up: 0.03, down: 0.01, flat: 0.4 })), i % 2 ? under : plate); // the plates
    for (const z of [1, -1]) h.sphere([0.025, 0.022, 0.02], [0.12, 0.04, z * 0.1], eye);
    mandibles(0.28, -0.07, 0.08);
  } else if (style === 'mantis') {
    // a mantis's: a broad triangle, wide across the top where great eyes bulge at its corners, narrowing to heavy mandibles
    h.loft([{ at: [-0.06, 0.02, 0], w: 0.06, up: 0.05, down: 0.04 }, { at: [0.02, 0.03, 0], w: 0.17, up: 0.07, down: 0.05, flat: 0.4 }, { at: [0.14, -0.02, 0], w: 0.08, up: 0.05, down: 0.04 }, { at: [0.24, -0.06, 0], w: 0.03, up: 0.03, down: 0.03 }], plate);
    for (const z of [1, -1]) {
      h.sphere([0.07, 0.07, 0.065], [0.04, 0.06, z * 0.17], { color: '#2a3a18', rough: 0.2, metal: 0.3 });
      h.limb([0.03, 0.08, z * 0.03], [-0.1, 0.36, z * 0.1], 0.008, plate, 0.004); // antennae
    }
    for (const z of [1, -1]) { h.limb([0.2, -0.06, z * 0.05], [0.34, -0.1, z * 0.07], 0.025, plate, 0.018); h.limb([0.34, -0.1, z * 0.07], [0.4, -0.08, -z * 0.02], 0.018, plate, 0.006); }
    crestTube([[0.0, 0.08, 0.03], [-0.12, 0.16, 0.025], [-0.22, 0.2, 0.01]]);
  } else {
    // frilled: a flattened skull and beak, and behind it a broad fan of a frill, ribbed, like a ceratopsian's
    h.loft([{ at: [-0.1, 0, 0], w: 0.08, up: 0.06, down: 0.05 }, { at: [0.06, 0.01, 0], w: 0.12, up: 0.07, down: 0.05, flat: 0.3 }, { at: [0.22, -0.02, 0], w: 0.07, up: 0.04, down: 0.04 }, { at: [0.32, -0.05, 0], w: 0.03, up: 0.025, down: 0.03, keel: 0.6 }], plate);
    h.joint([-0.06, 0.06, 0], [0, 0, 0.9], (f) => {
      f.sphere([0.04, 0.3 * crestK, 0.34 * crestK], [0, 0.12 * crestK, 0], under); // the frill
      for (let k = -3; k <= 3; k++) f.limb([0.01, 0, 0], [0.02, (0.12 + 0.28 * Math.cos(k * 0.4)) * crestK, k * 0.1 * crestK], 0.012, plate, 0.006); // its ribs
    });
    for (const z of [1, -1]) h.sphere([0.025, 0.024, 0.02], [0.12, 0.05, z * 0.1], eye);
    mandibles(0.3, -0.07, 0.08);
  }
}

/** A variation on the T3 mother's form (for concepts): how steeply her abdomen rises, how far it curls over, its size, a
 *  wasp's waist before it, how many legs she stands on (2: upright on her hind pair, forelegs as mantis arms), her head's size. */
export interface MotherForm { /** Extra forward on its head's strike (model units), to its sim reach. */ jab?: number; pitch?: number; curl?: number; abdomen?: number; waist?: boolean; legs?: 2 | 4 | 6; head?: number; girth?: number; neck?: number; crest?: number; headStyle?: MotherHead; detail?: number; crawl?: number; fore?: number; leg?: number }
/** The T2 mother: the T3 simplified and made smaller, crawling (concept T2a, the user's), her forelegs tucked in. */
/** The T1 mother: the plainest and smallest, low on four sprawled legs, no crest but its stub (concept T1a, the user's). */
const T1_MOTHER: MotherForm = { jab: 0.445, legs: 4, pitch: 0.28, curl: 0, // (her abdomen resting on the ground)
  abdomen: 0.8, crest: 0.25, detail: 0.2, crawl: 0.9, fore: 0.65, leg: 0.65 };
const T2_MOTHER: MotherForm = { jab: 0.396, legs: 4, pitch: -0.7, curl: 0.3, abdomen: 1.0, crest: 0.6, detail: 0.6, crawl: 0.6, fore: 0.65 };

export type MotherHead = 'duck' | 'hammer' | 'shovel' | 'helmet' | 'mantis' | 'frill' | 'mantisFrill' | 'shortShovel';

function motherT3(b: ModelBuilder, p: Pose, mass: number, o: MotherForm = {}): void {
  // (her form: the scorpion curl, the user's pick, its abdomen bigger)
  const pitch = o.pitch ?? -1.25, curl = o.curl ?? 0.75, legs = o.legs ?? 4;
  const plate: Mat = { color: '#5e4a3a', tex: 'leather', rough: 0.35 };
  const under: Mat = { color: '#d8c49a', tex: 'skin', rough: 0.6 };
  const dark: Mat = { color: '#241812', tex: 'skin', rough: 0.95 };
  // (her legs a little darker and cooler, her head a little warmer: they read apart)
  const legMat: Mat = { color: '#46382e', tex: 'leather', rough: 0.4 }, headMat: Mat = { color: '#6e5038', tex: 'leather', rough: 0.35 };
  const t = p.phase * TAU, walking = p.anim === 'walk';
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    // (her body low; crawling, lower still: 0 … 1, the body near the ground on wide-sprawled legs)
    const cr = o.crawl ?? 0, y0 = 0.42 - 0.3 * cr;
    // thorax: a sculpted, keeled segment, plated over the top, a ridge of short spines down it
    c.loft([[-0.2, 0.09, 0.08, 0.08, 0.2], [-0.08, 0.17, 0.15, 0.13, 0.5], [0.06, 0.16, 0.15, 0.12, 0.5], [0.16, 0.1, 0.1, 0.08, 0.3], [0.22, 0.05, 0.05, 0.05, 0]]
      .map(([x, w, u, d, keel]) => ({ at: [x, y0, 0] as V3, w, up: u, down: d, keel })), under);
    c.loft([[-0.18, 0.1, 0.1], [-0.06, 0.18, 0.17], [0.08, 0.17, 0.16], [0.18, 0.08, 0.1]].map(([x, w, u]) => ({ at: [x, y0 + 0.01, 0] as V3, w, up: u, down: 0.03, flat: 0.3 })), plate);
    const detail = o.detail ?? 1; // (lower tiers: simpler, fewer plates, spines and spurs)
    if (detail > 0.5) for (const x of [-0.1, 0.0, 0.1]) c.cone(0.025, 0.07, [x, y0 + 0.17, 0], plate, [0, 0, 0.4], 4);
    // the abdomen: a clearly enlarged brood abdomen, arched up into the air behind her thorax so its weight rides over
    // her legs: one sculpted shape, broad and keeled, plated over the top, cavities on its sides, curling over at its
    // end. (Part dinosaur, part insect: it balances like a great tail held high.)
    const shape: [number, number, number, number, number][] = [ // along it, half-width, up, down, keel
      [0.0, 0.12, 0.1, 0.09, 0.3],
      [-0.12, 0.25, 0.18, 0.24, 0.7],
      [-0.28, 0.32, 0.23, 0.32, 0.8],
      [-0.45, 0.33, 0.25, 0.28, 0.6],
      [-0.62, 0.28, 0.22, 0.2, 0.4],
      [-0.78, 0.18, 0.15, 0.12, 0.15],
      [-0.88, 0.06, 0.06, 0.05, 0],
    ];
    // (its curl: rising behind her, its end curling over and down; swaying a little as she walks)
    const centre = (x: number, up: number, dy = 0): [number, number, number] => {
      const k = -x / 0.88;
      return [x, up * 0.15 - curl * k * k + dy, walking ? Math.sin(t + x * 3) * 0.04 * k * k : 0];
    };
    const abAt: V3 = o.waist ? [-0.3, y0 + 0.12, 0] : [-0.12, y0 + 0.08, 0];
    if (o.waist) c.limb([-0.12, y0 + 0.04, 0], abAt, 0.06, plate, 0.05); // a wasp's waist
    // (laying: the abdomen swings down till its tip meets the ground, pulses, an egg swells out of the tip, and it lifts again)
    const lay = p.anim === 'lay' ? p.phase : -1, ease2 = (x: number) => { const c2 = Math.max(0, Math.min(1, x)); return c2 * c2 * (3 - 2 * c2); };
    const layDown = lay < 0 ? 0 : lay < 0.35 ? ease2(lay / 0.35) : lay < 0.8 ? 1 : 1 - ease2((lay - 0.8) / 0.2);
    const layDip = layDown * Math.max(0, -pitch) * 0.8; // (swung down as far as it's raised: a T1's, on the ground already, lays where it lies)
    c.joint(abAt, [0, 0, pitch + layDip + (walking ? Math.sin(t * 2) * 0.03 : 0)], (abs) => abs.joint([0, 0, 0], [0, 0, 0], (ab) => {
      const g = (o.girth ?? 1) * (1 + (lay > 0.3 && lay < 0.85 ? Math.sin(lay * Math.PI * 8) * 0.035 : 0)); // (how stout it is; laying, it pulses)
      ab.loft(shape.map(([x, w, up, down, keel]) => ({ at: centre(x, up), w: w * g, up: up * g, down: down * g, keel })), under);
      for (const [from, to] of (detail > 0.5 ? [[0, 3], [2, 5], [4, 6]] : [[0, 3], [3, 6]]) as Array<[number, number]>) {
        ab.loft(shape.slice(from, to + 1).map(([x, w, up, , keel], i, all) => {
          const end = i === 0 || i === all.length - 1 ? 0.6 : 1; // (each plate's ends tuck in)
          return { at: centre(x, up * g, 0.02), w: w * g * 1.04 * end, up: (up * g + 0.015) * end, down: 0.04 * (w / 0.3), keel, flat: 0.15 };
        }), plate);
      }
      if (lay > 0.4 && lay < 0.95) { // the egg, swelling out of its tip
        const e = Math.min(1, (lay - 0.4) / 0.4), tip = centre(-0.88, 0.06);
        ab.sphere([0.07 * e, 0.09 * e, 0.07 * e], [tip[0] - 0.05 * e, tip[1], tip[2]], { color: '#e8e0f0', tex: 'none', rough: 0.85 });
      }
      for (const [x, rz0] of [[-0.3, 0.31], [-0.56, 0.27]] as const) for (const z of [1, -1]) {
        const rz = rz0 * g;
        const at = centre(x, 0.2);
        ab.sphere([0.065, 0.06, 0.03], [x, at[1], z * rz], dark);
        ab.cylinder(0.07, 0.07, 0.018, [x, at[1], z * (rz - 0.005)], { team: 'primary', tex: 'skin' }, [Math.PI / 2, 0, 0], 12);
      }
    }, o.abdomen ?? 1.4));
    // neck, and a big head with its great crest sweeping back
    const nk = o.neck ?? 1;
    // (striking, her head darts forward and down, the neck following: peaking as the blow lands)
    const give = p.anim === 'give' ? p.phase : -1; // (giving: her head dips forward and down and sets a food ball before her)
    const jab = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase / 0.6) * Math.PI) : give >= 0 ? 0.75 * Math.sin(Math.min(1, give / 0.9) * Math.PI) : 0;
    const head: [number, number, number] = [0.14 + 0.32 * nk + (0.3 + (o.jab ?? 0.133)) * jab, y0 + 0.05 + 0.45 * nk - 0.28 * jab, 0], mid: V3 = [0.14 + 0.16 * nk + 0.14 * jab, y0 + 0.05 + 0.25 * nk - 0.08 * jab, 0];
    // (slim against her great abdomen, but shaped: tapering segments, a collar at each joint, spines down its back)
    shapedLimb(c, [0.14, y0 + 0.05, 0], mid, 0.08, [1.5, 1.1, 0.8, 0.7, 0.8], plate, { flat: 0.3, keel: 0.4 }); // (swelling at its base)
    shapedLimb(c, mid, head, 0.06, [0.95, 0.8, 0.72, 0.7, 0.85], plate, { flat: 0.2, keel: 0.3 });
    c.sphere([0.07, 0.05, 0.08], mid, under); // a collar
    if (detail > 0.5) for (const k of [0.3, 0.65]) for (const [from, to] of [[[0.14, y0 + 0.05, 0], mid], [mid, head]] as const) {
      const at: V3 = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k + 0.06, 0];
      c.cone(0.018, 0.06, at, plate, [0, 0, 0.5], 4);
    }
    c.joint(head, [0, 0, -0.5 * jab], (hs) => hs.joint([0, 0, 0], [0, 0, 0], (h) => motherHead(h, o.headStyle ?? 'shortShovel', o.crest ?? 1, headMat, under, p.anim === 'attack' ? jab : 0), o.head ?? 1)); // (the snout tipped down into it)
    if (give >= 0 && give < 0.92) c.sphere([0.06, 0.05, 0.06], [head[0] + 0.16, Math.max(0.05, head[1] - 0.06 - 0.25 * Math.max(0, give - 0.4)), 0], { color: '#a83a4a', tex: 'skin', rough: 0.5 }); // the food, set down
    // four legs, all off the central thorax: the great hind pair just behind its middle, under the arched abdomen's
    // weight, the forelegs just ahead; her weight balanced between them
    for (const z of [1, -1]) {
      const ph = p.phase + (z > 0 ? 0 : 0.5); // (each hind leg steps with the foreleg across from it)
      const lk = o.leg ?? 1; // (smaller legs: thinner, sprawling less)
      const sp = (1 + 0.45 * cr) * (0.6 + 0.4 * lk); // (sprawling, its feet out to the sides: not so far as to be wider than long)
      const hip: V3 = [-0.1, y0 - 0.04, z * 0.16], kneeRest: V3 = [0.02, y0 + 0.12 + 0.3 * cr * lk * lk, z * 0.5 * sp], ankleRest: V3 = [-0.24, 0.2, z * 0.6 * sp], rest: V3 = [legs === 2 ? -0.04 : -0.16, 0, z * (legs === 2 ? 0.42 : 0.62) * sp];
      const foot = walking ? footAt(rest, legs === 2 ? p.phase + (z > 0 ? 0 : 0.5) : ph, 0.12, 0.06) : rest;
      const ankle: V3 = [foot[0] + ankleRest[0] - rest[0], foot[1] + ankleRest[1], foot[2] + ankleRest[2] - rest[2]];
      const knee = jointBetween(hip, ankle, span(hip, kneeRest), span(kneeRest, ankleRest), [0.3, 1, z]);
      // shaped, not pipes: a thigh swelling with muscle and tapering to the knee, a long flattened shin with a ridge
      // and a spur, knobbed joints, a clawed foot
      shapedLimb(c, hip, knee, 0.1 * lk * lk, [0.6, 1 + 0.15 * lk, 1 + 0.35 * lk, 1 + 0.1 * lk, 0.7, 0.45], legMat, // (small legs: slim, without the great thigh's bulge)
        { flat: 0.35, up: [0, 0, z] });
      c.sphere([0.06 * lk, 0.055 * lk, 0.055 * lk], knee, legMat);
      shapedLimb(c, knee, ankle, 0.07 * lk, [0.7, 1.0, 0.9, 0.7, 0.5], legMat, { flat: 0.7, keel: 0.7, up: [-1, 0, 0] }); // (a broad blade of a shin)
      if (detail > 0.5) c.cone(0.02, 0.09, [knee[0] - 0.05, knee[1] - 0.03, knee[2]], legMat, [0, 0, 2.2], 4); // the spur
      c.sphere(0.04 * lk, ankle, legMat);
      shapedLimb(c, ankle, foot, 0.035 * lk, [0.9, 0.7, 0.6, 0.7], legMat, { flat: 0.3 });
      for (const dz of [-0.04, 0, 0.04]) c.cone(0.016, 0.08, [foot[0] + 0.06, 0.012, foot[2] + dz], dark, [0, dz * 4, -Math.PI / 2], 4); // claws
      if (legs === 2) { // upright on her hind pair: her forelegs folded up as mantis arms
        c.limb([0.12, y0 - 0.02, z * 0.12], [0.3, y0 + 0.22, z * 0.16], 0.05, plate, 0.04);
        c.limb([0.3, y0 + 0.22, z * 0.16], [0.32, y0 - 0.12, z * 0.14], 0.04, plate, 0.015);
        continue;
      }
      if (legs === 6) { // a middle pair between
        const mhip: V3 = [0.0, y0 - 0.06, z * 0.15], mrest: V3 = [0.1, 0, z * 0.6 * sp], mkRest: V3 = [0.08, y0 + 0.08 + 0.3 * cr, z * 0.45 * sp];
        const mfoot = walking ? footAt(mrest, ph + 0.5, 0.12, 0.05) : mrest;
        const mk = jointBetween(mhip, mfoot, span(mhip, mkRest), span(mkRest, mrest), [0.2, 1, z]);
        shapedLimb(c, mhip, mk, 0.055 * lk, [0.8, 1.05, 1.0, 0.8, 0.6], legMat, { flat: 0.3, up: [0, 0, z] });
        shapedLimb(c, mk, mfoot, 0.04 * lk, [0.85, 0.7, 0.6, 0.5, 0.4], legMat, { flat: 0.5, keel: 0.5 });
      }
      const fo = o.fore ?? 1; // (tucked in: shorter forelegs, their knees kept low, clear of her head)
      const fhip: V3 = [0.1, y0 - 0.06, z * 0.12], fkRest: V3 = [0.1 + 0.14 * fo, y0 + 0.02 + 0.3 * cr * (1 - (1 - fo) * 2.5), z * 0.34 * (1 + (sp - 1) * fo)], frest: V3 = [0.1 + 0.26 * fo, 0, z * 0.4 * (1 + (sp - 1) * fo)];
      const ffoot = walking ? footAt(frest, ph + 0.5, 0.12, 0.05) : frest;
      const fk = jointBetween(fhip, ffoot, span(fhip, fkRest), span(fkRest, frest), [0.5, 1, z]);
      shapedLimb(c, fhip, fk, 0.07 * lk, [0.6, 1.15, 1.25, 0.95, 0.55], legMat, { flat: 0.35, up: [0, 0, z] });
      c.sphere(0.04 * lk, fk, legMat);
      shapedLimb(c, fk, ffoot, 0.05 * lk, [0.7, 1.0, 0.85, 0.6, 0.4], legMat, { flat: 0.7, keel: 0.6, up: [1, 0, 0] });
      for (const dz of [-0.03, 0.03]) c.cone(0.012, 0.06, [ffoot[0] + 0.04, 0.01, ffoot[2] + dz], dark, [0, dz * 4, -Math.PI / 2], 4);
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
const larva1 = unit({ crawls: true, tends: true, id: 'larva1', name: 'T1 Larva', mass: 15, physique: LARVA, refinement: 1, workRefinement: 1, shell: 'cocoon',
  digestsTrees: true, becomes: ['larva2', 'charger', 'micropike', 'mother1'], description: 'A small green larva. Gathers, then changes into a T1 form. Sent onto a tree, it turns the whole tree into food and is absorbed into it.',
  model: (b, p) => caterpillar(b, p, TIER[1], 15) }, 'caterpillar');
const larva2 = unit({ crawls: true, tends: true, id: 'larva2', name: 'T2 Larva', mass: 60, physique: LARVA, refinement: 2, workRefinement: 2, shell: 'cocoon',
  becomes: ['larva3', 'flier', 'whipweld', 'slinger', 'mother2'], description: 'A medium cyan larva. Gathers, then changes into a T2 form.',
  model: (b, p) => caterpillar(b, p, TIER[2], 60) }, 'caterpillar');
const larva3 = unit({ crawls: true, tends: true, id: 'larva3', name: 'T3 Larva', mass: 179, physique: LARVA, refinement: 3, workRefinement: 3, shell: 'cocoon',
  becomes: ['dragon-fly', 'ground-attacker3', 'mother3'], description: 'A big purple larva. Gathers, then changes into a T3 form.',
  model: (b, p) => caterpillar(b, p, TIER[3], 179) }, 'caterpillar');

// eggs: laid cheap (about 19.5 food each), sized by tier, then fed until they hatch into their tier's larva
const egg = (tier: 1 | 2 | 3, mass: number) => unit({ id: `egg${tier}`, name: `T${tier} Egg`, mass, physique: EGG, refinement: tier, canGather: false,
  becomes: [`larva${tier}`], description: `A T${tier} egg. Give it food: it hatches into a T${tier} larva.`,
  model: (b, p) => origamiBun(b, p, TIER[tier], mass) }, 'egg');

// the shell larvae change inside (at the larva's own mass): mostly frame, tough
// (its spec at the biggest larva's mass: it's baked that size and drawn down for smaller ones, never blown up blurry)
const cocoon = unit({ id: 'cocoon', name: 'Cocoon', mass: 179, physique: SHELL, canGather: false, description: 'A larva changing. Give it food to finish.',
  model: (b, p) => origamiBun(b, p, '#c8b88a', 179) }, 'egg');

// mothers: lay anything up to their own refinement (a mother carries at least her cheapest egg's price)
// (each tier's form is its own shape: its collision as wide as that tier is drawn, × its drawn scale)
const MOTHER_WIDTH = { 1: 1.62, 2: 1.715, 3: 1.4 } as const;
const motherOf = (r: 1 | 2 | 3, mass: number) => ({ ...unit({ id: `mother${r}`, name: `Mother (r${r})`, mass, physique: MOTHER, refinement: r,
  spawns: ['egg1', 'egg2', 'egg3'].slice(0, r), attack: { style: 'strike', crystalMass: 1 }, // PLACEHOLDER attack (a side with no buildings needs something that can fight)
  description: `Lays eggs up to T${r}, and carries food to them.`, model: (b, p) => mother(b, p, mass, r) }, 'mother'), size: LOOK.mother.scale(mass) * MOTHER_WIDTH[r] });

/**
 * The Goliath Charger (the user's idea, 2026-10-29): a single-leg mega hopper battering ram. Its body is the ram-wedge
 * torso, the crystal set in its battering boss; under its middle one massive hopping leg (a thick thigh, a long shin,
 * a broad three-toed foot to balance on). It goes in heavy bounds, played by stride (UnitSpec.gait): sinking into a
 * crouch and springing, the leg trailing in flight then swinging forward, landing and absorbing the weight. It strikes by
 * crouching, springing and slamming in ram first; at rest it sits crouched low on its folded leg.
 */
/** The hopper's bound (its UnitSpec.gait, shared with its art so the two always match): long legs, long bounds. */
/** The Goliath's drawn scale (a baked unit is a metre: its model's units × this). */
const GOLIATH_G = 2.4;
const HOPPER_GAIT = { hop: 0.65, period: 1.8 }; // (1.17 s in the air a bound: up 1.7 m)

function gHopper(b: ModelBuilder, p: Pose, gait = HOPPER_GAIT): void {
  const sm = (x: number) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };
  const shell: Mat = { color: '#b04a2c', tex: 'none', rough: 0.15, metal: 0.35 }, plate: Mat = { color: '#5a2418', tex: 'leather', rough: 0.25, metal: 0.35 };
  const edge: Mat = { color: '#2a120c', tex: 'none', rough: 0.2, metal: 0.4 }, belly: Mat = { color: '#7a3424', tex: 'leather', rough: 0.4 };
  const leg: Mat = { color: '#7a3424', tex: 'leather', rough: 0.35 };
  const moving = p.anim === 'walk', ph = ((p.phase % 1) + 1) % 1, t = p.phase * Math.PI * 2;
  // the bound as the sim plays it (sim/abilities/gait.ts): crouching and pushing off for UP of it, then in the air for
  // AIR, then landing; in the air it flies as a thrown body does, its apex g·t²/8 above where it left the ground (in
  // metres, which a baked unit is: ÷ G into this model's units). Charging, the same bounds cover more ground
  const UP = (1 - gait.hop) * (2 / 3), AIR = gait.hop, APEX = (9.8 * (gait.hop * gait.period) ** 2) / 8 / GOLIATH_G;
  let crouch = 0.65 + 0.03 * Math.sin(t), height = 0, pitch = 0, footX = 0, footY = 0, thrust = 0;
  if (moving) {
    if (ph < UP) { const k = ph / UP; crouch = k < 0.7 ? sm(k / 0.7) : 1 - sm((k - 0.7) / 0.3); pitch = 0.2 * crouch; } // (sinking deep, then springing)
    else if (ph < UP + AIR) { // in the air: up and over, the leg trailing then swinging forward to land
      const a = (ph - UP) / AIR;
      crouch = 0; height = 4 * a * (1 - a) * APEX; pitch = 0.3 * (1 - 2 * a);
      footX = -0.45 * (1 - sm(a)) + 0.14 * Math.sin(Math.PI * a); footY = height * 0.5 + 0.1 * Math.sin(Math.PI * a);
    } else { const k = (ph - UP - AIR) / (1 - UP - AIR); crouch = 0.8 * Math.sin(Math.PI * k); pitch = -0.2 * Math.sin(Math.PI * k); } // (landing hard, taking the weight)
  } else if (p.anim === 'slam') { // its bound is the blow (played over that bound): crouching (to 0.35), then the bound
    // (its arc the sim's, at its apex g·t²/8), nose up off the ground, coming over ram first and thrust forward
    const a = p.phase, f = Math.max(0, (a - 0.35) / 0.65);
    crouch = a < 0.35 ? sm(a / 0.25) * (1 - sm((a - 0.28) / 0.07)) : 0;
    height = a < 0.35 ? 0 : 4 * f * (1 - f) * APEX;
    pitch = a < 0.35 ? 0.22 * crouch : 0.3 - 0.75 * sm((f - 0.1) / 0.5); // (ram first by mid-flight: it may meet the target there)
    thrust = 0.42 * sm((f - 0.15) / 0.4);
    if (a >= 0.35) { footX = -0.25 - 0.3 * sm(f / 0.5) + 0.12 * sm((f - 0.7) / 0.3); footY = height * 0.5; }
  } else if (p.anim === 'attack') { // standing, it strikes without leaving the ground: crouching, then lunging ram first
    const a = p.phase;
    crouch = a < 0.35 ? 0.7 * sm(a / 0.35) : 0.7 * (1 - sm((a - 0.35) / 0.2)) * (a < 0.55 ? 1 : 0);
    thrust = a < 0.35 ? -0.08 * sm(a / 0.35) : a < 0.55 ? -0.08 + 0.5 * sm((a - 0.35) / 0.2) : 0.42 * (1 - sm((a - 0.55) / 0.45));
    pitch = a < 0.35 ? 0.15 * sm(a / 0.35) : a < 0.55 ? 0.15 - 0.4 * sm((a - 0.35) / 0.2) : -0.25 * (1 - sm((a - 0.55) / 0.45));
  }
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    const hipY = 0.88 - 0.42 * crouch + height, hip: V3 = [thrust * 0.6, hipY, 0];
    // the body over its hip: a long level ram, banded with armour plates, a spine ridge down its back, a heavy blunt
    // boss in front capped with its crystal, tapering behind to a tail
    c.joint([thrust, hipY + 0.14, 0], [0, 0, pitch], (bd) => {
      const prof = [[-0.9, 0.04], [-0.7, 0.11], [-0.4, 0.18], [0, 0.21], [0.35, 0.22], [0.52, 0.2]] as const;
      bd.loft(prof.map(([x, w]) => ({ at: [x, 0, 0] as V3, w, up: w, down: w * 0.9 })), belly);
      const girth = (x: number) => { for (let j = 1; j < prof.length; j++) if (x <= prof[j][0]) { const [x0, r0] = prof[j - 1], [x1, r1] = prof[j]; return r0 + ((x - x0) / (x1 - x0)) * (r1 - r0); } return prof[prof.length - 1][1]; };
      for (let i = 0; i < 9; i++) { // overlapping armour bands down its whole length, each over the next toward the front
        const x = -0.78 + i * 0.15, r = girth(x + 0.1) + 0.015;
        bd.loft([0, 1].map((k) => ({ at: [x + k * 0.13, 0.01, 0] as V3, w: r * (k ? 1 : 0.9), up: r * (k ? 1 : 0.9), down: r * 0.88 * (k ? 1 : 0.9) })), i % 2 ? plate : shell);
        bd.loft([0, 1].map((k) => ({ at: [x + 0.13 + k * 0.02, 0.01, 0] as V3, w: r * 1.02, up: r * 1.02, down: r * 0.9 })), edge); // its lip
        bd.cone(0.03, 0.09, [x + 0.08, r + 0.03, 0], edge, [0, 0, -0.5], 4); // the spine ridge
      }
      bd.loft([[0.54, 0.25, 0.25, 0.23], [0.62, 0.26, 0.26, 0.24], [0.68, 0.2, 0.2, 0.18]].map(([x, w, u, d]) => ({ at: [x, 0, 0] as V3, w, up: u, down: d, flat: 0.5 })), edge); // the blunt boss
      bd.crystal(0.24, [0.7, 0, 0], [0, 0, -Math.PI / 2]); // its crystal, capping the boss, point forward
      for (const [y, z] of [[0.1, 0.1], [0.1, -0.1], [-0.08, 0.1], [-0.08, -0.1]] as const) bd.crystal(0.11, [0.66, y, z], [z * 2.5, 0, -Math.PI / 2 + y * 1.5]); // and a ring of smaller ones round it
    });
    // the one leg: a thick thigh from a heavy haunch, its knee forward, a long shin, the ankle back, a broad foot
    const foot: V3 = [footX, footY, 0], ankle: V3 = [foot[0] - 0.12, foot[1] + 0.16, 0];
    const knee = jointBetween(hip, ankle, 0.56, 0.58, [1, 0.35, 0]); // (long legs: long bounds)
    c.sphere([0.17, 0.14, 0.17], [hip[0], hip[1] + 0.04, 0], plate); // the haunch, under the ram
    shapedLimb(c, hip, knee, 0.13, [1.2, 1.35, 1.2, 0.9, 0.7], leg, { flat: 0.2 });
    c.sphere(0.09, knee, edge);
    shapedLimb(c, knee, ankle, 0.085, [1.0, 0.85, 0.7, 0.6, 0.65], leg, { flat: 0.3, keel: 0.4 });
    c.sphere(0.06, ankle, edge);
    shapedLimb(c, ankle, foot, 0.06, [1.0, 0.9, 0.8, 0.9], leg, { flat: 0.4 });
    for (const [dz, l] of [[-0.11, 0.17], [0, 0.22], [0.11, 0.17]] as const) // three broad toes, splayed, to balance on
      shapedLimb(c, foot, [foot[0] + l * 0.95, Math.max(0.01, foot[1] - 0.02), dz + dz * 0.6], 0.035, [1.0, 0.9, 0.6, 0.3], edge, { flat: 0.6 });
    c.cone(0.03, 0.12, [foot[0] - 0.08, foot[1] + 0.02, 0], edge, [0, 0, Math.PI / 2 + 0.3], 4); // a back spur
  }, GOLIATH_G);
}

// offshoots, one refinement up (PLACEHOLDER bodies, attacks and names)
const charger = unit({ id: 'charger', name: 'Charger', mass: 38, physique: { muscle: 0.6, frame: 0.25, reserve: 0.15 }, refinement: 2,
  attack: { style: 'strike', crystalMass: 1.5 }, description: 'T1: a fast charging body, striding on two long legs.', model: (b, p) => drawCharger(b, p, 38) }, 'charger');
const micropike = unit({ id: 'micropike', name: 'Micropike', mass: 35, physique: { muscle: 0.45, frame: 0.4, reserve: 0.15 }, refinement: 2,
  attack: { style: 'strike', crystalMass: 0.8, shaft: 1.5 }, description: 'T1: micropikes.', model: (b, p) => drawCharger(b, p, 35, MICROPIKE) }, 'charger');
const flier = unit({ id: 'flier', name: 'Vimmer', mass: 120, physique: { muscle: 0.5, frame: 0.25, reserve: 0.25 }, refinement: 3, flight: { height: 20, launch: 'backward' }, // (a high ceiling: its dives are real drops, and it can climb after fliers)
  attack: { style: 'strike', crystalMass: 2 }, description: 'T2: a dive bomber: it swoops down onto its target to strike, its dive behind the blow, and climbs away again.', model: (b, p) => drawVimmer(b, p, 120) }, 'vimmer');
const whipweld = unit({ id: 'whipweld', name: 'Whipweld', mass: 150, physique: { muscle: 0.5, frame: 0.4, reserve: 0.1 }, refinement: 3,
  attack: { style: 'strike', crystalMass: 4, whip: 2 }, description: 'T2: on two running legs, two whip arms held back along its torso; it dips and lashes one out, its crystal at the tip, a long reach.', model: (b, p) => drawCharger(b, p, 150, LASHER) }, 'lasher');
const slinger = unit({ id: 'slinger', name: 'Slinger', mass: 130, // (a T2's size, as the Vimmer and the Whipweld)
  physique: { muscle: 0.7, frame: 0.2, reserve: 0.1 }, refinement: 3, // (searched for its best within the engine, 2026-10-30)
  attack: { style: 'throw', crystalMass: 0.4, ammo: 14, sling: SLINGER.sling }, description: 'T2: the charger\'s build; its body is a trebuchet\'s arm: it rears back, plunges its head and whips its tail over, loosing the crystal from a sling at its tip.', model: (b, p) => drawCharger(b, p, 130, SLINGER) }, 'charger');
const dragonFly = unit({ id: 'dragon-fly', name: 'Dragon Fly', mass: 500, physique: { muscle: 0.5, frame: 0.3, reserve: 0.2 }, refinement: 4, flight: true,
  attack: { style: 'throw', crystalMass: 6, ammo: 10 }, // PLACEHOLDER: its fire (a conversion of crystal) is still to design
  description: 'T3: a fire-breathing dragon with butterfly wings, insectoid and reptilian.', model: (b, p) => drawDragonFly(b, p, 500) }, 'dragon');
const groundAttacker3 = unit({ id: 'ground-attacker3', name: 'Goliath Charger', mass: 600, physique: { muscle: 0.5, frame: 0.4, reserve: 0.1 }, refinement: 4, gait: HOPPER_GAIT,
  attack: { style: 'strike', crystalMass: 8 }, description: 'T3: a single-leg hopper battering ram.', model: (b, p) => gHopper(b, p) }, 'goliath');

export const units: Unit[] = [
  motherOf(1, 80), motherOf(2, 120), motherOf(3, 500), // (the T3 mother weighs a lot more: the user's)
  egg(1, 15), egg(2, 30), egg(3, 45), larva1, larva2, larva3, cocoon,
  charger, micropike, flier, whipweld, slinger, dragonFly, groundAttacker3,
];

export const newFaction: FactionSpec = {
  id: 'newfaction',
  name: 'Wildwelds',
  workerId: 'mother1', // it starts with one r1 mother, in the field (no buildings)
  startWorkers: 1,
  units,
  art: (team, onProgress, only) => import('./art').then((m) => m.bakeArt(team, onProgress, only)),
};
