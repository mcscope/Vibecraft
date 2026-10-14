// Fenfolk rigs (their own; factions never share model code).
// Small, crouching, frog-like marsh folk: ~1.15 tall, wide heads with bulging eyes,
// webbed feet, shaggy reed cloaks, lily-pad hats or fin crests.
// Convention: faces +x, y up, +z is its left.
import type { Mat, ModelBuilder, Pose, Vec3 } from '../../kits/bake3d/types';

const TAU = Math.PI * 2;
export const swing = (from: Vec3, len: number, a: number): Vec3 => [from[0] + Math.sin(a) * len, from[1] - Math.cos(a) * len, from[2]];

export interface FenLook {
  skin: string;
  wrap: Mat;
  scale?: number;
  bulk?: number;
  /** Conical reed hat, or a tied reed crest. */
  hat?: 'cone' | 'crest';
  mounted?: boolean;
}

/** Arm angle: a whirling sling throw, a jab, or work. */
export function fenArm(p: Pose, style: 'sling' | 'jab' | 'work'): number {
  const t = p.phase;
  if (p.anim === 'attack') {
    if (style === 'sling') return t < 0.6 ? 3.0 + Math.sin(t * TAU * 2.4) * 0.5 : 3.0 - ((t - 0.6) / 0.4) * 1.8;
    return t < 0.4 ? 1.2 - t * 1.5 : t < 0.6 ? 0.6 + ((t - 0.4) / 0.2) * 1.2 : 1.8 - ((t - 0.6) / 0.4) * 0.6;
  }
  if (p.anim === 'gather') return 0.6 + Math.abs(Math.sin(t * Math.PI)) * 1.4;
  if (p.anim === 'eat') return 2.2 + Math.sin(t * TAU) * 0.15;
  if (p.anim === 'walk') return 0.35 - hop(p).ext * 0.9; // arms sweep back as it leaps
  return 0.1 + Math.sin(t * TAU) * 0.04;
}

const REED: Mat = { color: '#b8a466', tex: 'thatch' };
const REED_DARK: Mat = { color: '#8a7a48', tex: 'thatch' };
const TEAM: Mat = { team: 'primary', tex: 'cloth' };

/**
 * Fenfolk don't walk, they hop: crouch, push off with both legs, sail with the
 * legs trailing, land in a deep crouch. `lift` raises the whole body (and its load),
 * `ext` is how far the legs are kicked out (0 crouched, 1 fully extended), `pitch`
 * leans the body into the jump, `squat` (0..1) is how deep it sinks on the ground:
 * absorbing the landing, then winding up for the next leap.
 */
export const SQUAT_DEPTH = 0.17;
export function hop(p: Pose): { lift: number; ext: number; pitch: number; squat: number } {
  if (p.anim !== 'walk') return { lift: 0, ext: 0, pitch: 0, squat: 0 };
  const ph = p.phase;
  const smooth = (x: number) => x * x * (3 - 2 * x);
  // mostly airborne: units glide at a steady speed, so feet on the ground would slide
  const lift = ph > 0.16 && ph < 0.92 ? Math.sin(((ph - 0.16) / 0.76) * Math.PI) * 0.3 : 0;
  const ext = ph < 0.08 ? 0 : ph < 0.2 ? smooth((ph - 0.08) / 0.12) : ph < 0.88 ? 1 - smooth((ph - 0.2) / 0.68) * 0.8 : 0.2 * (1 - smooth((ph - 0.88) / 0.12));
  const pitch = ph < 0.08 ? -0.1 : ph < 0.4 ? -0.35 : ph < 0.88 ? -0.35 + ((ph - 0.4) / 0.48) * 0.45 : 0.1 - ((ph - 0.88) / 0.12) * 0.2;
  // on the ground (landing at 0.92 through take-off at 0.16), deepest just after the stride wraps
  const ground = ph >= 0.92 || ph < 0.16;
  const squat = ground ? Math.sin((((ph + 0.08) % 1) / 0.24) * Math.PI) : 0;
  return { lift: lift - squat * SQUAT_DEPTH, ext, pitch: pitch - squat * 0.25, squat };
}

export function fenling(
  b: ModelBuilder, p: Pose, look: FenLook, arm: number,
  held?: (h: ModelBuilder) => void, offhand?: (h: ModelBuilder) => void,
): void {
  const h = look.mounted ? { lift: 0, ext: 0, pitch: 0, squat: 0 } : hop(p);
  b.joint([0, h.lift, 0], [0, 0, 0], (m) => {
    const walking = p.anim === 'walk' && !look.mounted;
    const t = p.phase * TAU;
    const skin: Mat = { color: look.skin, tex: 'skin' };
    const spots: Mat = { color: shade(look.skin, 0.72), tex: 'skin' };
    const belly: Mat = { color: shade(look.skin, 1.35), tex: 'skin' };
    const bulk = look.bulk ?? 1;
    // crouched, frog-like legs: thigh forward, shin back, big webbed feet
    for (const side of [1, -1]) {
      const z = 0.11 * side * bulk;
      if (look.mounted) {
        m.limb([0, 0.5, z], [0.18, 0.36, z * 2.6], 0.06, skin);
        m.limb([0.18, 0.36, z * 2.6], [0.06, 0.18, z * 2.8], 0.05, skin);
        continue;
      }
      // both legs together: crouched (knees splayed up and out) ↔ kicked out behind
      const e = h.ext, mix = (c: number, x: number) => c + (x - c) * e;
      // in a squat the body sinks while the feet stay planted, so the knees fold up and out
      const sq = h.squat * SQUAT_DEPTH;
      const hip: Vec3 = [-0.04, 0.4 - (1 - e) * 0.03, z];
      const knee: Vec3 = [mix(0.12, -0.14) + h.squat * 0.07, mix(0.3, 0.22) + sq * 0.55, z * (mix(2.1, 1.3) + h.squat * 0.6)];
      const foot: Vec3 = [mix(-0.02, -0.42) - h.squat * 0.03, mix(0.03, 0.06) + sq, z * (mix(1.6, 1.1) + h.squat * 0.25)];
      m.limb(hip, knee, 0.075, skin, 0.055);
      m.limb(knee, foot, 0.05, skin, 0.035);
      m.joint(foot, [0, 0, 0], (f) => {
        for (const tz of [-0.045, 0, 0.045]) f.sphere([0.06, 0.018, 0.022], [0.06, 0, tz * (1 + Math.abs(tz) * 8)], skin, [0, tz * 6, 0]);
        f.sphere([0.06, 0.012, 0.07], [0.03, -0.004, 0], belly); // webbing
      });
    }
    m.joint([0, 0, 0], [0, 0, p.anim === 'tired' ? -0.35 : -0.12 + h.pitch], (u) => {
      // squat, round body leaning forward, pale belly
      u.sphere([0.19 * bulk, 0.22, 0.19 * bulk], [0, 0.6, 0], skin);
      u.sphere([0.13 * bulk, 0.17, 0.14 * bulk], [0.08, 0.58, 0], belly);
      for (const [x, y, z] of [[-0.12, 0.74, 0.06], [-0.1, 0.62, -0.09], [-0.14, 0.82, -0.03]] as Vec3[]) u.sphere(0.03, [x, y, z * bulk], spots);
      u.cylinder(0.17 * bulk, 0.19 * bulk, 0.1, [0, 0.44, 0], look.wrap, undefined, 12); // loincloth wrap
      // shaggy reed cloak hanging from the shoulders down the back
      for (let i = 0; i < 11; i++) {
        const a = Math.PI * 0.55 + (i / 10) * Math.PI * 0.9;
        const sway = walking ? Math.sin(t + i) * 0.03 : 0;
        const top: Vec3 = [Math.cos(a) * 0.13 * bulk, 0.8, Math.sin(a) * 0.17 * bulk];
        u.limb(top, [Math.cos(a) * 0.24 * bulk - 0.05 + sway, 0.36 + (i % 3) * 0.04, Math.sin(a) * 0.26 * bulk], 0.026, i % 2 ? REED : REED_DARK, 0.012);
      }
      u.cylinder(0.12 * bulk, 0.16 * bulk, 0.07, [0, 0.8, 0], TEAM, undefined, 12); // team scarf
      u.box([0.03, 0.16, 0.07], [-0.15, 0.72, 0.06], TEAM, [0.2, 0, -0.3]); // scarf tail
      u.crystal(0.08, [0.18 * bulk, 0.68, 0], [0, 0, 0.2]); // charm on a cord
      // wide flat head, bulging amber eyes on top, a long mouth
      u.joint([0.07, 0.9, 0], [0, 0, 0.1], (h) => {
        h.sphere([0.17, 0.11, 0.18], [0, 0, 0], skin);
        h.sphere([0.12, 0.06, 0.15], [0.05, -0.05, 0], belly); // throat
        h.box([0.02, 0.014, 0.25], [0.155, -0.03, 0], { color: '#2a2018' }); // wide mouth
        for (const z of [1, -1]) {
          h.sphere(0.07, [0.06, 0.09, 0.09 * z], skin);
          h.sphere(0.055, [0.095, 0.1, 0.1 * z], { color: '#f0b030', rough: 0.15, emissive: '#3a2400' });
          h.sphere([0.014, 0.04, 0.016], [0.146, 0.1, 0.108 * z], { color: '#120c08', rough: 0.1 });
        }
        h.sphere(0.022, [-0.06, 0.07, 0.02], spots);
        if (look.hat === 'crest') {
          // a fin crest from brow to nape: team-coloured webbing on reed spines
          for (let i = 0; i < 5; i++) {
            const x = 0.02 - i * 0.05, top = 0.2 - Math.abs(i - 1.5) * 0.03;
            h.limb([x, 0.08, 0], [x - 0.04, top, 0], 0.01, REED_DARK);
          }
          h.box([0.2, 0.1, 0.012], [-0.09, 0.14, 0], TEAM, [0, 0, 0.15]);
        } else {
          // a wide lily-pad hat, notched, its brim drooping a little
          // worn pushed back on the head so the eyes peek out under the brim
          h.joint([-0.09, 0.15, 0], [0, 0.4, 0.45], (lh) => {
            lh.cylinder(0.2, 0.22, 0.02, [0, 0, 0], { color: '#4e7a34', tex: 'leaf' }, undefined, 16);
            lh.cylinder(0.16, 0.16, 0.022, [0, 0.003, 0], { color: '#5e8a3c', tex: 'leaf' }, undefined, 16);
            lh.box([0.13, 0.03, 0.03], [-0.15, 0.002, 0], { color: look.skin }, [0, 0, 0]); // the notch shows through
            lh.cone(0.035, 0.06, [0, 0.04, 0], TEAM, undefined, 8); // team-dyed stem
          });
        }
      });
      // long arms, webbed hands
      const sr: Vec3 = [0.03, 0.76, 0.19 * bulk], sl: Vec3 = [0.03, 0.76, -0.19 * bulk];
      const elbowR = swing(sr, 0.22, arm), handR = swing(elbowR, 0.22, arm + 0.25);
      const la = walking ? 0.35 - h.ext * 0.9 : 0.35; // arms sweep back as it leaps
      const elbowL = swing(sl, 0.22, la), handL = swing(elbowL, 0.22, la + 0.3);
      u.limb(sr, elbowR, 0.04, skin, 0.034); u.limb(elbowR, handR, 0.032, skin, 0.026);
      u.limb(sl, elbowL, 0.04, skin, 0.034); u.limb(elbowL, handL, 0.032, skin, 0.026);
      u.sphere([0.04, 0.03, 0.045], handR, skin);
      u.sphere([0.04, 0.03, 0.045], handL, skin);
      if (held) u.joint(handR, [0, 0, arm + 0.25], held);
      if (offhand) u.joint(handL, [0, 0, la + 0.3], offhand);
    });
  }, look.scale ?? 1);
}

/** Lighten (k > 1) or darken (k < 1) a hex colour. */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

/** Load on the back, by cargo: a reed bundle, a root basket, a crystal. */
export function fenLoad(b: ModelBuilder, p: Pose): void {
  const { lift } = hop(p); // includes the squat
  if (lift) { b.joint([0, lift, 0], [0, 0, 0], (l) => fenLoad(l, { ...p, anim: 'idle' })); return; } // it rides along on the hop
  if (p.cargo === 'wood') for (let i = 0; i < 4; i++) b.limb([-0.2, 0.75 + i * 0.05, -0.2], [-0.2, 0.95 + i * 0.05, 0.2], 0.03, REED);
  else if (p.cargo === 'food') b.cylinder(0.12, 0.09, 0.18, [-0.2, 0.85, 0], { color: '#7a5a34', tex: 'thatch' }, undefined, 10);
  else if (p.cargo === 'crystal') b.crystal(0.22, [-0.2, 0.9, 0], [0.3, 0, 0.4]);
}
