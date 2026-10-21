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
import type { ModelBuilder, Pose } from '../../kits/bake3d/types';
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
  winged: { scale: (m: number) => Math.cbrt(m / 40), length: 0.85 },
  mother: { scale: (m: number) => 1.4 * Math.cbrt(m / 40), length: 1.25 },
  dragon: { scale: (m: number) => 2.0 * Math.cbrt(m / 500), length: 0.9 }, // 500 kg: ~4.5 m snout to tail-tip (collision: its body; wings overlap others, as fliers' do)
} as const;
const footprint = (look: keyof typeof LOOK, mass: number) => LOOK[look].scale(mass) * LOOK[look].length;

/** A caterpillar: a row of segments that ripple as it crawls, stubby legs, a round head (the user's larvae). */
function caterpillar(b: ModelBuilder, p: Pose, color: string, mass: number): void {
  const skin: Mat = { color, tex: 'skin', rough: 0.55 };
  const belly: Mat = { color: '#e8e2c8', tex: 'skin' };
  const n = 7, crawl = p.anim === 'walk' ? p.phase * TAU : 0;
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    for (let i = 0; i < n; i++) {
      const x = 0.42 - i * 0.14, lift = p.anim === 'walk' ? Math.max(0, Math.sin(crawl - i * 0.9)) * 0.05 : 0;
      const r = 0.1 - Math.abs(i - 2) * 0.006;
      c.sphere([r * 1.05, r, r], [x, r + lift, 0], skin);
      c.sphere([r * 0.7, r * 0.35, r * 0.75], [x, r * 0.45 + lift, 0], belly);
      if (i > 0 && i < n - 1) for (const z of [1, -1]) c.limb([x, 0.06 + lift, z * r * 0.7], [x, 0.0, z * r * 1.0], 0.016, skin); // stubby legs
      if (i % 2 === 0) c.sphere(0.022, [x - 0.02, r * 1.7 + lift, 0], { team: 'primary', tex: 'none' }); // a team dot down its back
    }
    const eat = p.anim === 'gather' || p.anim === 'eat' ? Math.sin(p.phase * TAU * 2) * 0.03 : 0;
    c.sphere(0.11, [0.56, 0.12 + eat, 0], skin); // head
    for (const z of [1, -1]) c.sphere(0.018, [0.65, 0.15 + eat, z * 0.05], { color: '#111111' });
    if (p.cargo) c.sphere([0.08, 0.06, 0.08], [0.3, 0.24, 0], { color: p.cargo === 'food' ? '#a83a4a' : p.cargo === 'wood' ? '#7a5634' : '#8fe6ff' });
  }, LOOK.caterpillar.scale(mass));
}

/** An egg: a whitish, folded, faceted shell (origami-like), tinted toward its larva, sized by tier (the user's). */
function origamiEgg(b: ModelBuilder, p: Pose, tint: string, mass: number): void {
  const paper: Mat = { color: mix('#f2efe6', tint, 0.18), tex: 'none', rough: 0.85 };
  const fold: Mat = { color: mix('#d9d4c4', tint, 0.28), tex: 'none', rough: 0.85 };
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
    for (const [x, ph] of [[0.16, 0], [0.06, Math.PI], [-0.04, 0]] as const) for (const z of [1, -1]) {
      const a = walking ? Math.sin(t + ph + (z > 0 ? 0 : Math.PI)) * 0.35 : 0;
      c.limb([x, 0.28, z * 0.08], [x + 0.08 + a * 0.1, 0.18, z * 0.22], 0.018, shell);
      c.limb([x + 0.08 + a * 0.1, 0.18, z * 0.22], [x + 0.1 + a * 0.18, 0, z * 0.26], 0.014, shell);
    }
    if (weapon === 'strike' && p.armed) c.crystal(0.16, [0.42 + jab * 0.12, 0.34, 0], [0, 0, -Math.PI / 2]);
    if (weapon === 'pike' && p.armed) {
      c.limb([0.05 + jab * 0.2, 0.36, 0.06], [0.95 + jab * 0.2, 0.42, 0.06], 0.012, { color: '#9a8a5a', tex: 'wood' });
      c.crystal(0.1, [1.0 + jab * 0.2, 0.42, 0.06], [0, 0, -Math.PI / 2]);
    }
    if (weapon === 'sling') c.limb([0.2, 0.38, 0.08], [0.2 + Math.cos(t * 2) * 0.15, 0.6, 0.08], 0.008, { color: '#5a4a3a' });
  }, LOOK.bug.scale(mass));
}

/** PLACEHOLDER flier: a bug with two pairs of broad butterfly-like wings that beat in flight. */
function winged(b: ModelBuilder, p: Pose, color: string, wing: string, mass: number, reptile = false): void {
  const shell: Mat = { color, tex: reptile ? 'skin' : 'leather', rough: 0.45 };
  const wingMat: Mat = { color: wing, tex: 'none', rough: 0.7 };
  const flying = p.anim === 'fly' || p.anim === 'climb' || p.anim === 'soar' || p.anim === 'glide' || p.anim === 'leap' || p.anim === 'land';
  const beat = flying ? Math.sin(p.phase * TAU) * 0.7 : -0.9; // folded up on the ground
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    c.sphere([0.32, 0.1, 0.1], [-0.15, 0.35, 0], shell);
    c.sphere([0.14, 0.12, 0.12], [0.15, 0.37, 0], shell);
    c.sphere(0.1, [0.32, 0.4, 0], shell);
    if (reptile) c.cone(0.06, 0.18, [0.44, 0.4, 0], shell, [0, 0, -Math.PI / 2], 6); // snout
    c.box([0.04, 0.03, 0.22], [0.15, 0.48, 0], { team: 'primary', tex: 'cloth' });
    for (const z of [1, -1]) {
      c.joint([0.18, 0.44, z * 0.08], [z * beat, 0, 0], (wg) => wg.sphere([0.22, 0.012, 0.42], [0, 0, z * 0.4], wingMat));
      c.joint([0.02, 0.44, z * 0.08], [z * beat * 0.85, 0, 0], (wg) => wg.sphere([0.18, 0.012, 0.32], [-0.05, 0, z * 0.32], wingMat));
      if (!flying) for (const x of [0.2, 0.05, -0.1]) c.limb([x, 0.32, z * 0.07], [x + 0.06, 0, z * 0.18], 0.016, shell);
    }
  }, LOOK.winged.scale(mass));
}

/**
 * The Dragon Fly (the user's): a reptilian dragon's body (a long neck, a horned head, scaly, a long tail, four clawed
 * legs) on two pairs of big, decorated butterfly wings (veined and edged dark, banded, eyespots on the forewings),
 * beating in flight, folded up over its back on the ground.
 */
function drawDragonFly(b: ModelBuilder, p: Pose, mass: number): void {
  const scale: Mat = { color: '#6a2a6e', tex: 'leather', rough: 0.35 };
  const belly: Mat = { color: '#c69ab0', tex: 'skin', rough: 0.5 };
  const horn: Mat = { color: '#e8dcc0', tex: 'none', rough: 0.4 };
  const wing: Mat = { color: '#f0a040', tex: 'none', rough: 0.6 };
  const vein: Mat = { color: '#1e1418', tex: 'none', rough: 0.7 };
  const band: Mat = { color: '#fff2d8', tex: 'none', rough: 0.6 };
  const eyeOut: Mat = { color: '#18101a', tex: 'none' }, eyeMid: Mat = { color: '#3fa8e0', tex: 'none' }, eyeIn: Mat = { color: '#fbfbf4', tex: 'none' };
  const flying = p.anim === 'fly' || p.anim === 'climb' || p.anim === 'soar' || p.anim === 'glide' || p.anim === 'leap' || p.anim === 'land';
  const t = p.phase * TAU, beat = flying ? Math.sin(t) * 0.75 : 0;
  const bite = p.anim === 'attack' ? Math.sin(Math.min(1, p.phase / 0.6) * Math.PI) : 0;
  b.joint([0, 0, 0], [0, 0, 0], (c) => {
    const y0 = flying ? 0.5 : 0.46;
    // a wyvern's build: a long slim body on two strong hind legs (its forelimbs are the wings)
    c.sphere([0.42, 0.16, 0.16], [0, y0, 0], scale);
    c.sphere([0.34, 0.1, 0.12], [0.02, y0 - 0.07, 0], belly);
    for (let i = 0; i < 7; i++) c.cone(0.03, 0.08, [0.28 - i * 0.09, y0 + 0.15, 0], horn, undefined, 4); // spines down its back
    // the neck: a long S, always moving (a playful sway and curl)
    const wave = (k: number, speed: number, amp: number) => Math.sin(t * speed + k) * amp;
    let n: [number, number, number] = [0.32, y0 + 0.06, 0];
    for (let i = 1; i <= 5; i++) {
      const up = i <= 3 ? 0.13 : 0.03, fwd = i <= 3 ? 0.07 : 0.12;
      const next: [number, number, number] = [n[0] + fwd, n[1] + up + wave(i, 1, 0.012), wave(i * 0.8, 1, 0.05) * (i / 5)];
      c.limb(n, next, 0.075 - i * 0.008, scale, 0.07 - i * 0.008);
      n = next;
    }
    // head: tilting and turning as it goes, a nod with each wingbeat in flight
    const nod = flying ? Math.sin(t) * 0.07 : 0, look = Math.sin(t * 0.5) * (flying ? 0.18 : 0.3), tilt = Math.sin(t * 0.7 + 1) * 0.2;
    c.joint(n, [tilt, look, -0.15 - bite * 0.3 + nod], (h) => {
      h.sphere([0.15, 0.075, 0.08], [0.08, 0, 0], scale); // head
      h.cone(0.055, 0.18, [0.25, -0.01, 0], scale, [0, 0, -Math.PI / 2], 8); // long snout
      h.box([0.17, 0.022, 0.065], [0.17, -0.055 - bite * 0.05, 0], belly); // jaw
      for (const z of [1, -1]) {
        h.cone(0.02, 0.18, [-0.03, 0.07, z * 0.045], horn, [z * 0.3, 0, 1.0], 6); // horns sweeping back
        h.sphere(0.022, [0.12, 0.035, z * 0.055], { color: '#ffd23f', emissive: '#7a5a00' });
      }
      if (bite > 0.3) h.sphere(0.05, [0.38, -0.03, 0], { color: '#ff8a20', emissive: '#ff5a00' }); // (its fire: placeholder until the mechanic is designed)
    });
    // the tail: a long whip, rippling side to side and up and down, a spade at its tip
    let tp: [number, number, number] = [-0.4, y0, 0];
    for (let i = 1; i <= 10; i++) {
      const next: [number, number, number] = [tp[0] - 0.14, y0 - i * 0.012 + wave(-i * 0.6, 1, 0.025), wave(-i * 0.55, 1, 0.025 * i)];
      c.limb(tp, next, 0.075 * (1 - i * 0.085), scale, 0.075 * (1 - (i + 1) * 0.085));
      tp = next;
    }
    c.cone(0.06, 0.14, [tp[0] - 0.06, tp[1], tp[2]], scale, [0, 0, Math.PI / 2], 4); // the spade
    // two strong hind legs (tucked in flight)
    for (const z of [1, -1]) {
      const step = !flying && p.anim === 'walk' ? Math.sin(t + (z > 0 ? 0 : Math.PI)) * 0.12 : 0;
      const hip: [number, number, number] = [-0.12, y0 - 0.06, z * 0.12];
      const knee: [number, number, number] = flying ? [-0.2, y0 - 0.16, z * 0.16] : [-0.02 + step * 0.4, 0.26, z * 0.18];
      const foot: [number, number, number] = flying ? [-0.36, y0 - 0.2, z * 0.16] : [-0.1 + step, 0.02, z * 0.2];
      c.limb(hip, knee, 0.065, scale, 0.05);
      c.limb(knee, foot, 0.045, scale, 0.03);
      if (!flying) for (const dz of [-0.03, 0, 0.03]) c.cone(0.012, 0.06, [foot[0] + 0.05, 0.01, foot[2] + dz], horn, [0, 0, -Math.PI / 2], 4); // claws
    }
    // butterfly wings: forewings and hindwings, decorated
    for (const z of [1, -1]) {
      // on the ground: raised together upright over its back, as a butterfly rests, leaning a little back
      // (about x, a wing on the +z side swings up with a negative turn)
      const up = flying ? -z * beat : -z * 1.45, lean = flying ? 0.15 : -0.2;
      c.joint([0.08, y0 + 0.15, z * 0.12], [up, 0, lean], (wg) => wg.joint([0, 0, 0], [0, 0, 0], (wg) => {
        wg.sphere([0.34, 0.012, 0.62], [0.08, 0, z * 0.6], wing); // forewing
        wg.sphere([0.36, 0.008, 0.66], [0.08, -0.002, z * 0.6], vein); // its dark edge
        wg.sphere([0.06, 0.016, 0.5], [0.2, 0.002, z * 0.62], band); // a pale band
        for (const [r, m, dy] of [[0.13, eyeOut, 0.008], [0.09, eyeMid, 0.012], [0.04, eyeIn, 0.016]] as const) wg.sphere([r, 0.006, r], [0.02, dy, z * 0.78], m); // eyespot
        for (let k = 0; k < 4; k++) wg.limb([0.0, 0.012, z * 0.05], [-0.1 + k * 0.1, 0.012, z * (0.9 + (k % 2) * 0.1)], 0.006, vein); // veins
      }, 0.65));
      c.joint([-0.14, y0 + 0.13, z * 0.12], [flying ? -z * beat * 0.85 : -z * 1.4, 0, flying ? -0.1 : -0.35], (wg) => wg.joint([0, 0, 0], [0, 0, 0], (wg) => {
        wg.sphere([0.3, 0.012, 0.48], [-0.12, 0, z * 0.46], wing); // hindwing
        wg.sphere([0.32, 0.008, 0.51], [-0.12, -0.002, z * 0.46], vein);
        for (const [r, m, dy] of [[0.07, eyeOut, 0.008], [0.04, eyeIn, 0.014]] as const) wg.sphere([r, 0.006, r], [-0.18, dy, z * 0.62], m);
        wg.limb([-0.3, 0.008, z * 0.5], [-0.62, 0.008, z * 0.55], 0.02, vein, 0.006); // a swallowtail
      }, 0.65));
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
    for (const [x, ph, fx] of [[0.08, 0, 0.16], [0, Math.PI, 0], [-0.08, 0, -0.16]] as const) for (const z of [1, -1]) {
      const swing = walking ? Math.sin(t + ph + (z > 0 ? 0 : Math.PI)) : 0, up = Math.max(0, swing) * 0.04;
      const knee: [number, number, number] = [x + fx * 0.5 + swing * 0.03, 0.26, z * 0.3];
      c.limb([x, 0.2 * H, z * 0.12 * W], [knee[0], knee[1] * H, knee[2] * W], 0.032 * legR, shell, 0.027 * legR);
      c.limb([knee[0], knee[1] * H, knee[2] * W], [x + fx + swing * 0.08, up, z * 0.46 * W], 0.027 * legR, shell, 0.016 * legR);
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
    // the abdomen: huge against her thin neck and legs. A deep, broad barrel of a chest like a ratite's, keeled
    // underneath, swelling into a second great lobe behind; plated over the top, cavities on its sides
    const body = (at: [number, number, number], r: [number, number, number], m: Mat) => c.sphere(r, at, m);
    body([-0.22, y0 - 0.02, 0], [0.36, 0.3, 0.34], under); // the chest barrel
    body([-0.22, y0 + 0.04, 0], [0.34, 0.27, 0.33], plate); // its plated top
    body([-0.18, y0 - 0.3, 0], [0.24, 0.07, 0.05], plate); // the keel, down the breastbone
    body([-0.62, y0 + 0.02, 0], [0.32, 0.27, 0.3], under); // the rear lobe
    body([-0.62, y0 + 0.07, 0], [0.3, 0.24, 0.29], plate);
    body([-0.88, y0 - 0.02, 0], [0.16, 0.15, 0.16], plate); // narrowing into the tail
    for (const x of [-0.08, -0.36, -0.5, -0.76]) body([x, y0 + 0.08, 0], [0.025, 0.25, 0.3], under); // the seams between plates
    for (const [x, rz] of [[-0.3, 0.34], [-0.6, 0.31]] as const) for (const z of [1, -1]) {
      c.sphere([0.07, 0.065, 0.025], [x, y0, z * rz], dark);
      c.cylinder(0.075, 0.075, 0.018, [x, y0, z * (rz - 0.005)], { team: 'primary', tex: 'skin' }, [Math.PI / 2, 0, 0], 12);
    }
    // the tail, segmented and tapering, held out behind
    let prev: [number, number, number] = [-1.0, y0 - 0.04, 0];
    for (let i = 1; i <= 6; i++) {
      const sway = walking ? Math.sin(t + i * 0.6) * 0.03 * i : 0;
      const next: [number, number, number] = [-1.0 - i * 0.15, y0 - 0.04 - i * 0.02, sway];
      c.limb(prev, next, 0.08 * (1 - i * 0.13), plate, 0.08 * (1 - (i + 1) * 0.13));
      prev = next;
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
      const step = walking ? Math.sin(t + (z > 0 ? 0 : Math.PI)) : 0;
      const hip: [number, number, number] = [-0.12, y0 - 0.05, z * 0.14];
      const knee: [number, number, number] = [-0.02 + step * 0.06, y0 + 0.18, z * 0.3];
      const ankle: [number, number, number] = [-0.2 + step * 0.1, 0.18, z * 0.32];
      c.limb(hip, knee, 0.06, plate, 0.05);
      c.limb(knee, ankle, 0.045, plate, 0.035);
      c.limb(ankle, [-0.1 + step * 0.16, Math.max(0, step) * 0.05, z * 0.34], 0.03, plate, 0.018);
      const fstep = walking ? Math.sin(t + Math.PI + (z > 0 ? 0 : Math.PI)) : 0;
      const fk: [number, number, number] = [0.22 + fstep * 0.04, y0 - 0.02, z * 0.22];
      c.limb([0.1, y0 - 0.06, z * 0.1], fk, 0.03, plate, 0.025);
      c.limb(fk, [0.3 + fstep * 0.08, Math.max(0, fstep) * 0.04, z * 0.26], 0.025, plate, 0.014);
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
  becomes: ['larva2', 'charger', 'micropike', 'tree-worm', 'mother1'], description: 'A small green larva. Gathers, then changes into a T1 form.',
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
const treeWorm = unit({ crawls: true, id: 'tree-worm', name: 'Tree Worm', mass: 20, physique: { muscle: 0.2, frame: 0.1, reserve: 0.7 }, refinement: 2, canGather: false,
  digestsTrees: true, description: 'T1: turns a whole tree into food, and is absorbed into it.', model: (b, p) => caterpillar(b, p, '#8a9a3a', 20) }, 'caterpillar');
const flier = unit({ id: 'flier', name: 'Flier', mass: 120, physique: { muscle: 0.5, frame: 0.25, reserve: 0.25 }, refinement: 3, flight: true,
  attack: { style: 'strike', crystalMass: 2 }, description: 'T2: a flier.', model: (b, p) => winged(b, p, '#2a9aa6', '#9fe6ee', 120) }, 'winged');
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
  charger, micropike, treeWorm, flier, groundAttacker2, slinger, dragonFly, groundAttacker3,
];

export const newFaction: FactionSpec = {
  id: 'newfaction',
  name: 'New Faction', // PLACEHOLDER: not named yet
  workerId: 'mother1', // it starts with one r1 mother, in the field (no buildings)
  startWorkers: 1,
  units,
  art: (team, onProgress, only) => import('./art').then((m) => m.bakeArt(team, onProgress, only)),
};
