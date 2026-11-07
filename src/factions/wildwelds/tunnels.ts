// Eight tunnel towers (2026-11-07, for the user to choose from): something of the Wildwelds' living in a burrow, an arm
// coming up out of it to fling crystals. Each made from scratch: no part, material or helper shared between them.
// Each is `(b, t)`: `t` 0 … 1 through one throw (wound up, flung, the crystal let go at about 0.45 and flying off, the
// arm following through and drawn back); no `t`, at rest. Dev only (the sprites page: ?mode=sprites&tunnels=all).
import type { Mat, ModelBuilder, Vec3 } from '../../kits/bake3d/types';

export type TunnelModel = (b: ModelBuilder, t?: number) => void;

/** 1. Stone ring and coiled whip: a ring of piled stones round a deep hole; a long whip-like arm lies coiled in it,
 *  uncoils up and back as it winds up, cracks over the top flinging the crystal from the sling at its tip, and coils
 *  back down into the hole. */
const coiledWhip: TunnelModel = (b, t) => {
  const stone: Mat = { color: '#7d7468', tex: 'stone', rough: 0.95 }, dark: Mat = { color: '#0d0a08', tex: 'none', rough: 1 };
  const hide: Mat = { color: '#20302f', tex: 'leather', rough: 0.35, metal: 0.3 }, stripe: Mat = { color: '#39b4be', tex: 'leather', rough: 0.3, metal: 0.4 };
  const cordM: Mat = { color: '#6b5844', tex: 'leather', rough: 0.85 }, team: Mat = { team: 'primary', tex: 'none', rough: 0.6 };
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; b.rock([0.5, 0.42 + 0.1 * Math.sin(i * 3.1), 0.4], [Math.cos(a) * 1.2, 0.18, Math.sin(a) * 1.2], stone, i); }
  b.cylinder(0.92, 0.85, 0.06, [0, 0.22, 0], dark, undefined, 18);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; b.sphere(0.13, [Math.cos(a) * 1.25, 0.5, Math.sin(a) * 1.25], team); }
  const ease = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
  // its uncoil: 0 coiled in the hole, 1 reared up and back, then a lash forward over the top
  const wind = t === undefined ? 0.15 : t < 0.35 ? ease(t / 0.35) : t < 0.5 ? 1 : 1 - ease((t - 0.5) / 0.45);
  const lash = t === undefined ? 0 : t < 0.35 ? 0 : t < 0.5 ? ease((t - 0.35) / 0.15) : 1 - ease((t - 0.5) / 0.5);
  let p: Vec3 = [-0.1, 0.15, 0], a = Math.PI / 2;
  const n = 14;
  for (let i = 0; i < n; i++) {
    const k = i / n;
    a += -0.65 * (1 - wind) + (wind - lash * 1.6) * 0.16 * (1 + k * 1.5) - 0.02;
    const len = 0.22 + 0.2 * wind;
    const q: Vec3 = [p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len, Math.sin(k * 4 + (t ?? 0) * 6) * 0.08 * (1 - wind)];
    b.limb(p, q, 0.17 * (1 - k * 0.8), i % 3 === 1 ? stripe : hide, 0.17 * (1 - (k + 1 / n) * 0.8));
    p = q;
  }
  const loaded = t === undefined || t < 0.45 || t > 0.85;
  const pouchAt: Vec3 = [p[0] + 0.05, p[1] - 0.35 + lash * 0.25, p[2]];
  b.limb(p, pouchAt, 0.012, cordM); b.sphere([0.09, 0.06, 0.08], pouchAt, cordM);
  if (loaded) b.crystal(0.16, [pouchAt[0], pouchAt[1] + 0.04, pouchAt[2]], [0, 0, Math.PI / 2]);
  if (t !== undefined && t > 0.45 && t < 0.8) { const f = (t - 0.45) / 0.35; b.crystal(0.18, [p[0] + f * 3.2, p[1] + f * 1.4 - f * f * 2.6, 0], [0, 0, -1.2 + f * 2]); }
};

/** 2. Trapdoor: a round lid of silk and earth over the burrow, hinged at the back; it flips open, a jointed arm unfolds
 *  up out of the dark with a crystal in its hand, throws overarm, folds back in, and the lid drops shut. */
const trapdoor: TunnelModel = (b, t) => {
  const soil: Mat = { color: '#6a523a', tex: 'stone', rough: 0.95 }, silk: Mat = { color: '#e3dccb', tex: 'none', rough: 0.85 }, pit: Mat = { color: '#0b0806', tex: 'none', rough: 1 };
  const shell: Mat = { color: '#171f20', tex: 'leather', rough: 0.3, metal: 0.4 }, glint: Mat = { color: '#2fa4ae', tex: 'leather', rough: 0.25, metal: 0.45 }, team: Mat = { team: 'primary', tex: 'none', rough: 0.55 };
  const sm = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
  b.sphere([1.6, 0.28, 1.5], [0, 0.06, 0], soil); // the low mound round it
  b.cylinder(0.7, 0.66, 0.08, [0, 0.3, 0], pit, undefined, 16);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; b.limb([Math.cos(a) * 0.7, 0.32, Math.sin(a) * 0.7], [Math.cos(a) * 0.95, 0.22, Math.sin(a) * 0.95], 0.03, silk); }
  const open = t === undefined ? 0 : t < 0.15 ? sm(t / 0.15) : t < 0.8 ? 1 : 1 - sm((t - 0.8) / 0.15);
  b.joint([-0.68, 0.34, 0], [0, 0, open * 2.0], (l) => { // the lid, hinged at the back
    l.cylinder(0.74, 0.74, 0.12, [0.7, 0, 0], soil, undefined, 16);
    l.cylinder(0.72, 0.72, 0.03, [0.7, -0.07, 0], silk, undefined, 16);
    l.sphere([0.2, 0.06, 0.2], [0.9, 0.08, 0.2], team);
  });
  const rise = t === undefined ? 0 : t < 0.12 ? 0 : t < 0.32 ? sm((t - 0.12) / 0.2) : t < 0.7 ? 1 : 1 - sm((t - 0.7) / 0.12);
  if (rise > 0.02) {
    const swing = t! < 0.32 ? -0.3 : t! < 0.45 ? -0.3 + 2.1 * sm((t! - 0.32) / 0.13) : 1.8 - 0.4 * sm((t! - 0.45) / 0.25);
    const shoulder: Vec3 = [0, -0.6 + 1.5 * rise, 0], elbow: Vec3 = [shoulder[0] - 0.5 * Math.cos(swing), shoulder[1] + 1.0 + 0.4 * Math.sin(swing), 0];
    const hand: Vec3 = [elbow[0] + 1.1 * Math.cos(swing * 1.3), elbow[1] + 1.1 * Math.sin(swing * 1.3) * 0.6 + 0.4, 0];
    b.limb([0, -0.6, 0], shoulder, 0.26, shell, 0.24); b.sphere(0.22, shoulder, glint);
    b.limb(shoulder, elbow, 0.2, shell, 0.15); b.sphere(0.15, elbow, glint); b.limb(elbow, hand, 0.13, glint, 0.08);
    for (const s of [1, -1]) b.limb(hand, [hand[0] + 0.18, hand[1] + 0.05, s * 0.1], 0.04, shell, 0.015);
    if (t! < 0.45) b.crystal(0.18, [hand[0] + 0.12, hand[1] + 0.05, 0], [0, 0, -0.5]);
  }
  if (t !== undefined && t > 0.45 && t < 0.8) { const f = (t - 0.45) / 0.35; b.crystal(0.18, [1.0 + f * 3, 3.0 + f * 1.2 - f * f * 3.4, 0], [0, 0, f * 4]); }
};

/** 3. Periscope: from a cone of chewed earth, a segmented stalk telescopes up out of the hole, its knobbed head at the
 *  top swivels back, spits the crystal from a mouth-sling in a snap forward, and the stalk sinks back down. */
const periscope: TunnelModel = (b, t) => {
  const clay: Mat = { color: '#8c6b4a', tex: 'stone', rough: 0.9 }, black: Mat = { color: '#0c0a08', tex: 'none', rough: 1 };
  const plate: Mat = { color: '#262a24', tex: 'leather', rough: 0.3, metal: 0.35 }, cyan: Mat = { color: '#44c0c8', tex: 'leather', rough: 0.25, metal: 0.4 };
  const eye: Mat = { color: '#d8ffcf', tex: 'none', rough: 0.05, emissive: '#2a6a40' }, team: Mat = { team: 'primary', tex: 'none', rough: 0.6 };
  const ease = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
  for (let i = 0; i < 6; i++) b.cylinder(1.3 - i * 0.15, 1.4 - i * 0.15, 0.12, [0, 0.06 + i * 0.12, 0], clay, undefined, 14); // the cone
  b.cylinder(0.42, 0.42, 0.06, [0, 0.75, 0], black, undefined, 14);
  b.cylinder(0.75, 0.75, 0.08, [0, 0.45, 0], team, undefined, 14);
  const up = t === undefined ? 0.35 : t < 0.25 ? 0.35 + 0.65 * ease(t / 0.25) : t < 0.6 ? 1 : 1 - 0.65 * ease((t - 0.6) / 0.35);
  const tilt = t === undefined ? 0 : t < 0.25 ? -0.5 * ease(t / 0.25) : t < 0.42 ? -0.5 : t < 0.5 ? -0.5 + 1.3 * ease((t - 0.42) / 0.08) : 0.8 * (1 - ease((t - 0.5) / 0.3));
  let y = 0.7;
  for (let i = 0; i < 5; i++) { const h = 0.75 * up, r = 0.32 - i * 0.04; b.cylinder(r, r + 0.02, h, [0, y + h / 2, 0], i % 2 ? cyan : plate, undefined, 12); y += h; }
  b.joint([0, y, 0], [0, 0, tilt], (h) => {
    h.sphere([0.42, 0.34, 0.36], [0.05, 0.2, 0], plate);
    for (let i = 0; i < 5; i++) h.cone(0.05, 0.16, [-0.25 + i * 0.12, 0.5, 0], cyan, [0, 0, -0.3], 4);
    for (const z of [0.16, -0.16]) h.sphere(0.07, [0.36, 0.32, z], eye);
    h.cylinder(0.14, 0.18, 0.2, [0.45, 0.12, 0], black, [0, 0, Math.PI / 2], 10); // its mouth
    if (t === undefined || t < 0.48) h.crystal(0.16, [0.48, 0.12, 0], [0, 0, -Math.PI / 2]);
  });
  if (t !== undefined && t > 0.48 && t < 0.82) { const f = (t - 0.48) / 0.34; b.crystal(0.18, [0.6 + f * 3.4, y + 0.3 + f * 0.9 - f * f * 3.2, 0], [0, 0, -Math.PI / 2 + f * 3]); }
};

/** 4. Pincer pair: out of a ragged crater, two claws rise together; the left plucks the crystal from a cluster at the
 *  rim and hands it up to the right, which hurls it with a sweep, both sinking back afterwards. */
const pincerPair: TunnelModel = (b, t) => {
  const rubble: Mat = { color: '#5f5245', tex: 'stone', rough: 0.95 }, abyss: Mat = { color: '#090706', tex: 'none', rough: 1 };
  const armour: Mat = { color: '#1e2421', tex: 'leather', rough: 0.3, metal: 0.4 }, edge: Mat = { color: '#4bc7cf', tex: 'leather', rough: 0.25, metal: 0.45 }, team: Mat = { team: 'primary', tex: 'none', rough: 0.6 };
  const k = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, r = 1.15 + 0.15 * Math.sin(i * 2.3); b.rock([0.35, 0.25 + 0.12 * Math.abs(Math.sin(i * 1.7)), 0.3], [Math.cos(a) * r, 0.1, Math.sin(a) * r], rubble, i + 40); }
  b.cylinder(0.95, 0.9, 0.06, [0, 0.14, 0], abyss, undefined, 18);
  for (const [x, z, s] of [[0.9, 0.9, 0.2], [1.0, 0.75, 0.16], [0.82, 1.05, 0.15]] as const) b.crystal(s, [x, 0.25, z], [0.3, 0, 0.2]); // its store at the rim
  b.sphere([0.18, 0.1, 0.18], [-1.1, 0.35, -0.6], team); b.sphere([0.18, 0.1, 0.18], [-0.6, 0.35, 1.1], team);
  const up = t === undefined ? 0.5 : t < 0.2 ? 0.5 + 0.5 * k(t / 0.2) : t < 0.7 ? 1 : 1 - 0.5 * k((t - 0.7) / 0.25);
  const hurl = t === undefined ? 0 : t < 0.3 ? 0 : t < 0.42 ? -0.6 * k((t - 0.3) / 0.12) : t < 0.5 ? -0.6 + 2.0 * k((t - 0.42) / 0.08) : 1.4 * (1 - k((t - 0.5) / 0.4));
  const claw = (base: Vec3, lean: number, sweep: number, open: number, holding: boolean) => {
    const knee: Vec3 = [base[0] + lean * 0.4, base[1] + 1.6 * up, base[2]];
    const tip: Vec3 = [knee[0] + Math.cos(1.2 - sweep) * 1.0, knee[1] + Math.sin(1.2 - sweep) * 1.0, base[2]];
    b.limb(base, knee, 0.24, armour, 0.2); b.sphere(0.2, knee, edge); b.limb(knee, tip, 0.17, armour, 0.12);
    for (const s of [1, -1]) b.limb(tip, [tip[0] + 0.3, tip[1] + s * (0.08 + open * 0.12), base[2] + s * 0.05], 0.06, edge, 0.02);
    if (holding) b.crystal(0.17, [tip[0] + 0.22, tip[1], base[2]], [0, 0, -0.7]);
  };
  const handed = t !== undefined && t > 0.25;
  claw([-0.2, 0.1, 0.35], -0.6, t !== undefined && t < 0.25 ? -0.8 * k(t / 0.25) : 0, 0.5, !handed && t !== undefined && t > 0.1);
  claw([-0.2, 0.1, -0.35], 0.2, hurl, t !== undefined && t > 0.45 && t < 0.6 ? 1 : 0.2, handed && t! < 0.45);
  if (t !== undefined && t > 0.45 && t < 0.8) { const f = (t - 0.45) / 0.35; b.crystal(0.18, [0.8 + f * 3.2, 2.9 + f * 1.0 - f * f * 3.0, -0.35], [0, 0, f * 5]); }
};

/** 5. Tentacle pit: a soft-lipped pit, three tentacles rising out of it and swaying; the middle one curls round the
 *  crystal, winds back low and whips it out over the others, which writhe after it. */
const tentaclePit: TunnelModel = (b, t) => {
  const flesh: Mat = { color: '#3e4a46', tex: 'skin', rough: 0.45 }, lip: Mat = { color: '#5a6b62', tex: 'skin', rough: 0.55 }, maw: Mat = { color: '#160c0c', tex: 'none', rough: 1 };
  const band: Mat = { color: '#5fd0d6', tex: 'skin', rough: 0.35, metal: 0.2 }, team: Mat = { team: 'primary', tex: 'none', rough: 0.6 };
  const tw = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
  b.sphere([1.5, 0.3, 1.4], [0, 0.05, 0], lip);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.sphere([0.32, 0.16, 0.26], [Math.cos(a) * 0.95, 0.28, Math.sin(a) * 0.95], i % 3 ? lip : team, [0, -a, 0]); }
  b.cylinder(0.78, 0.72, 0.05, [0, 0.3, 0], maw, undefined, 16);
  const time = t ?? 0;
  const tentacle = (z: number, phase: number, main: boolean) => {
    const back = main ? (t === undefined ? 0 : t < 0.35 ? tw(t / 0.35) : t < 0.48 ? 1 - 2.2 * tw((t - 0.35) / 0.13) : -1.2 * (1 - tw((t - 0.48) / 0.45))) : 0.3 * Math.sin(time * 6.3 + phase);
    let p: Vec3 = [0, 0.25, z], a = Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const s = i / 12;
      a += (back * 0.22 + Math.sin(time * 6.3 + phase + s * 4) * 0.08) * (0.5 + s);
      const q: Vec3 = [p[0] + Math.cos(a) * 0.32, p[1] + Math.sin(a) * 0.32, z + Math.sin(s * 3 + phase) * 0.1];
      b.limb(p, q, 0.2 * (1 - s * 0.85), i % 4 === 2 ? band : flesh, 0.2 * (1 - (s + 1 / 12) * 0.85));
      p = q;
    }
    if (main && (t === undefined || t < 0.47)) b.crystal(0.16, [p[0], p[1] + 0.05, p[2]], [0, 0, 0.8]);
    return p;
  };
  tentacle(0.45, 1, false); tentacle(-0.45, 2.5, false);
  const tip = tentacle(0, 0, true);
  if (t !== undefined && t > 0.47 && t < 0.82) { const f = (t - 0.47) / 0.35; b.crystal(0.18, [tip[0] + f * 3.2, tip[1] + f * 1.1 - f * f * 3.0, 0], [0, 0, f * 5]); }
};

/** 6. Trebuchet beam: a long stiff beam pivoted on the burrow's lip, a heavy bulb on its short end; the bulb drops down
 *  into the hole, flinging the long end up and over, the sling at its tip whipping round to loose the crystal, then the
 *  beam settles back with the bulb raised. */
const trebuchetBeam: TunnelModel = (b, t) => {
  const loam: Mat = { color: '#715a40', tex: 'stone', rough: 0.95 }, shaft: Mat = { color: '#0f0c0a', tex: 'none', rough: 1 };
  const beamM: Mat = { color: '#252b29', tex: 'leather', rough: 0.3, metal: 0.4 }, bulbM: Mat = { color: '#3cb8c1', tex: 'leather', rough: 0.25, metal: 0.4 };
  const rope: Mat = { color: '#7a6448', tex: 'leather', rough: 0.85 }, team: Mat = { team: 'primary', tex: 'none', rough: 0.6 };
  const e = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
  b.sphere([1.7, 0.45, 1.5], [0, 0.0, 0], loam);
  b.cylinder(0.65, 0.6, 0.06, [-0.3, 0.42, 0], shaft, undefined, 14);
  for (const z of [0.3, -0.3]) b.limb([0.1, 0.35, z], [0.1, 1.05, z * 0.6], 0.09, beamM); // its pivot's posts
  b.sphere([0.2, 0.08, 0.2], [0.8, 0.45, 0.6], team);
  // the beam's angle about the pivot: at rest long end down at the front (−0.5), cocked; it whips round to ~2.2
  const ang = t === undefined ? -0.5 : t < 0.3 ? -0.5 - 0.15 * e(t / 0.3) : t < 0.45 ? -0.65 + 2.85 * e((t - 0.3) / 0.15) : t < 0.6 ? 2.2 : 2.2 - 2.7 * e((t - 0.6) / 0.4);
  const piv: Vec3 = [0.1, 1.05, 0], longEnd: Vec3 = [piv[0] + Math.cos(Math.PI - ang) * 2.8, piv[1] + Math.sin(-ang + Math.PI) * 2.8 * -1 + 0, 0];
  const L: Vec3 = [piv[0] - Math.cos(ang) * 2.8, piv[1] - Math.sin(ang) * 2.8, 0], S: Vec3 = [piv[0] + Math.cos(ang) * 0.8, piv[1] + Math.sin(ang) * 0.8, 0];
  void longEnd;
  b.limb(S, L, 0.12, beamM, 0.07);
  b.sphere([0.45, 0.42, 0.42], S, bulbM); // the counterweight bulb
  b.cylinder(0.43, 0.43, 0.06, S, team, [0, 0, ang], 12);
  const sl = t === undefined ? 0 : t < 0.3 ? 0 : t < 0.45 ? 1.8 * e((t - 0.3) / 0.15) : 1.8;
  const pouchAt: Vec3 = [L[0] - Math.cos(ang + sl) * 0.6, L[1] - Math.sin(ang + sl) * 0.6 - 0.2, 0];
  b.limb(L, pouchAt, 0.015, rope); b.sphere([0.1, 0.07, 0.09], pouchAt, rope);
  if (t === undefined || t < 0.43 || t > 0.9) b.crystal(0.16, [pouchAt[0], pouchAt[1] + 0.04, 0], [0, 0, Math.PI / 2]);
  if (t !== undefined && t > 0.43 && t < 0.8) { const f = (t - 0.43) / 0.37; b.crystal(0.18, [pouchAt[0] + f * 3.4, pouchAt[1] + f * 0.8 - f * f * 3.4, 0], [0, 0, f * 6]); }
};

/** 7. Mandible maw: a pit ringed by great curved mandibles; they part, a long sticky tongue shoots up and back out of
 *  the throat with a crystal stuck to its tip, snaps forward to fling it, and is drawn back as the mandibles close. */
const mandibleMaw: TunnelModel = (b, t) => {
  const grit: Mat = { color: '#685c4c', tex: 'stone', rough: 0.95 }, throat: Mat = { color: '#2a0c10', tex: 'skin', rough: 0.6 };
  const mand: Mat = { color: '#141a19', tex: 'leather', rough: 0.25, metal: 0.45 }, tipM: Mat = { color: '#3fb2bc', tex: 'leather', rough: 0.2, metal: 0.5 };
  const tongueM: Mat = { color: '#b0445a', tex: 'skin', rough: 0.35 }, team: Mat = { team: 'primary', tex: 'none', rough: 0.6 };
  const s = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
  b.sphere([1.6, 0.35, 1.5], [0, 0.02, 0], grit);
  b.cylinder(0.6, 0.5, 0.1, [0, 0.36, 0], throat, undefined, 14);
  for (let i = 0; i < 3; i++) b.sphere([0.16, 0.07, 0.16], [Math.cos(i * 2.1) * 1.25, 0.32, Math.sin(i * 2.1) * 1.25], team);
  const part = t === undefined ? 0.1 : t < 0.15 ? 0.1 + 0.9 * s(t / 0.15) : t < 0.75 ? 1 : 1 - 0.9 * s((t - 0.75) / 0.2);
  for (let i = 0; i < 4; i++) { // the mandibles: curved blades round the maw, parting
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4, out = 0.45 + 0.35 * part;
    const root: Vec3 = [Math.cos(a) * 0.65, 0.35, Math.sin(a) * 0.65], mid: Vec3 = [Math.cos(a) * (0.75 + out * 0.3), 1.1, Math.sin(a) * (0.75 + out * 0.3)];
    const tip: Vec3 = [Math.cos(a) * (0.35 + out * 0.6), 1.65, Math.sin(a) * (0.35 + out * 0.6)];
    b.limb(root, mid, 0.14, mand, 0.1); b.limb(mid, tip, 0.1, mand, 0.02); b.sphere(0.05, tip, tipM);
  }
  const reach = t === undefined ? 0 : t < 0.15 ? 0 : t < 0.35 ? s((t - 0.15) / 0.2) : t < 0.5 ? 1 : 1 - s((t - 0.5) / 0.3);
  const flick = t === undefined ? 0 : t < 0.35 ? -0.7 : t < 0.46 ? -0.7 + 1.9 * s((t - 0.35) / 0.11) : 1.2;
  if (reach > 0.02) {
    let p: Vec3 = [0, 0.4, 0], a = Math.PI / 2;
    for (let i = 0; i < 10; i++) { a -= flick * 0.12; const q: Vec3 = [p[0] + Math.cos(a) * 0.32 * reach, p[1] + Math.sin(a) * 0.32 * reach, 0]; b.limb(p, q, 0.09 - i * 0.004, tongueM); p = q; }
    b.sphere(0.14 * Math.max(0.4, reach), p, tongueM);
    if (t! < 0.46) b.crystal(0.16, [p[0], p[1] + 0.12, 0], [0, 0, 0.3]);
  }
  if (t !== undefined && t > 0.46 && t < 0.8) { const f = (t - 0.46) / 0.34; b.crystal(0.18, [0.9 + f * 3.2, 3.0 + f * 1.0 - f * f * 3.4, 0], [0, 0, f * 5]); }
};

/** 8. Scorpion tail: a slanting tunnel mouth in a bank of earth; a segmented tail rears up out of it, arches back, its
 *  barbed bulb holding the crystal, and snaps forward over the bank to sling it, then sinks back into the dark. */
const scorpionTail: TunnelModel = (b, t) => {
  const bank: Mat = { color: '#7b6146', tex: 'stone', rough: 0.95 }, mouth: Mat = { color: '#0a0806', tex: 'none', rough: 1 };
  const seg: Mat = { color: '#1b2321', tex: 'leather', rough: 0.3, metal: 0.4 }, seam: Mat = { color: '#36aeb8', tex: 'leather', rough: 0.25, metal: 0.45 };
  const barb: Mat = { color: '#0c0f0e', tex: 'leather', rough: 0.2, metal: 0.5 }, team: Mat = { team: 'primary', tex: 'none', rough: 0.6 };
  const q = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
  b.sphere([1.7, 0.75, 1.4], [-0.4, 0.1, 0], bank); // the bank it burrows into
  b.sphere([0.55, 0.45, 0.6], [0.55, 0.35, 0], mouth, [0, 0, -0.5]); // its slanting mouth
  for (const z of [0.7, -0.7]) b.sphere([0.14, 0.1, 0.14], [0.3, 0.75, z], team);
  const rear = t === undefined ? 0.3 : t < 0.3 ? 0.3 + 0.7 * q(t / 0.3) : t < 0.7 ? 1 : 1 - 0.7 * q((t - 0.7) / 0.3);
  const snap = t === undefined ? 0 : t < 0.33 ? 0 : t < 0.46 ? q((t - 0.33) / 0.13) : 1 - q((t - 0.46) / 0.45);
  let p: Vec3 = [0.5, 0.3, 0], a = 0.9;
  for (let i = 0; i < 8; i++) {
    a += (0.32 * rear - snap * 0.5) * (i < 5 ? 1 : 1.4);
    const l = 0.26 + 0.12 * rear, n: Vec3 = [p[0] - Math.cos(a) * l * 0.5, p[1] + Math.sin(a) * l, 0];
    b.sphere([0.2 - i * 0.012, 0.16 - i * 0.01, 0.19 - i * 0.012], n, i % 2 ? seam : seg); b.limb(p, n, 0.15 - i * 0.012, seg);
    p = n;
  }
  b.sphere([0.24, 0.2, 0.22], [p[0] + 0.15, p[1], 0], seam); // the bulb
  b.limb([p[0] + 0.3, p[1], 0], [p[0] + 0.55, p[1] + 0.25, 0], 0.07, barb, 0.01); // its barb
  if (t === undefined || t < 0.45) b.crystal(0.17, [p[0] + 0.15, p[1] + 0.2, 0], [0, 0, 0.4]);
  if (t !== undefined && t > 0.45 && t < 0.8) { const f = (t - 0.45) / 0.35; b.crystal(0.18, [p[0] + 0.3 + f * 3.2, p[1] + f * 1.2 - f * f * 3.2, 0], [0, 0, f * 5]); }
};

// ── Crosses of 1 and 5 (2026-11-07, the user: "cross the coiled whip and the tentacle pit"): the coiled whip's throw
//    on the tentacle pit's flesh. These three share their parts.

type Tentacle = { skin: Mat; band: Mat; thick: number; suckers?: Mat; sling?: Mat };
const smooth = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
/** The coiled whip's throw: `wind` 0 coiled in the hole … 1 reared up and back; `lash` 0 … 1 over the top. */
const whipThrow = (t?: number) => ({
  wind: t === undefined ? 0.15 : t < 0.35 ? smooth(t / 0.35) : t < 0.5 ? 1 : 1 - smooth((t - 0.5) / 0.45),
  lash: t === undefined ? 0 : t < 0.35 ? 0 : t < 0.5 ? smooth((t - 0.35) / 0.15) : 1 - smooth((t - 0.5) / 0.5),
});

/** A tentacle from `base` that throws like the coiled whip: lying coiled in the hole, it uncoils up and back, lashes
 *  over the top (the crystal let go at 0.45) and coils back down, rippling all the while. The crystal is held curled
 *  in its tip, or in a sling hanging from it. */
function coilingTentacle(b: ModelBuilder, t: number | undefined, base: Vec3, s: Tentacle): void {
  const { wind, lash } = whipThrow(t), w = t ?? 0, n = 14;
  let p = base, a = Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const k = i / n;
    a += -0.65 * (1 - wind) + (wind - lash * 1.6) * 0.16 * (1 + k * 1.5) - 0.02 + Math.sin(k * 5 + w * 7) * 0.05 * (1 - lash);
    const len = 0.22 + 0.2 * wind;
    const q: Vec3 = [p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len, base[2] + Math.sin(k * 4 + w * 6) * 0.08 * (1 - wind)];
    const r0 = s.thick * (1 - k * 0.85), r1 = s.thick * (1 - (k + 1 / n) * 0.85);
    b.limb(p, q, r0, i % 4 === 2 ? s.band : s.skin, r1);
    if (s.suckers && i > 1 && i % 2 === 0) for (const z of [1, -1]) b.sphere(r0 * 0.32, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2 + z * r0 * 0.8], s.suckers);
    p = q;
  }
  const loaded = t === undefined || t < 0.45 || t > 0.85;
  if (s.sling) {
    const pouch: Vec3 = [p[0] + 0.05, p[1] - 0.35 + lash * 0.25, p[2]];
    b.limb(p, pouch, 0.012, s.sling); b.sphere([0.09, 0.06, 0.08], pouch, s.sling);
    if (loaded) b.crystal(0.16, [pouch[0], pouch[1] + 0.04, pouch[2]], [0, 0, Math.PI / 2]);
  } else { // its tip curled round the crystal
    const c: Vec3 = [p[0] + Math.cos(a - 1.2) * 0.12, p[1] + Math.sin(a - 1.2) * 0.12, p[2]];
    if (loaded) b.crystal(0.16, c, [0, 0, a]);
    b.limb(p, [c[0] + Math.cos(a - 2.6) * 0.1, c[1] + Math.sin(a - 2.6) * 0.1, p[2]], s.thick * 0.15, s.skin, s.thick * 0.07);
  }
  if (t !== undefined && t > 0.45 && t < 0.8) { const f = (t - 0.45) / 0.35; b.crystal(0.18, [p[0] + f * 3.2, p[1] + f * 1.4 - f * f * 2.6, 0], [0, 0, -1.2 + f * 2]); }
}
/** A short tentacle beside it, swaying, and shrinking back from the lash. */
function writhingTentacle(b: ModelBuilder, t: number | undefined, base: Vec3, phase: number, s: Tentacle, n = 8): void {
  const w = t ?? 0, back = 0.3 * Math.sin(w * 6.3 + phase) + 0.6 * whipThrow(t).lash;
  let p = base, a = Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const k = i / n;
    a += (back * 0.22 + Math.sin(w * 6.3 + phase + k * 4) * 0.08) * (0.5 + k);
    const q: Vec3 = [p[0] + Math.cos(a) * 0.28, p[1] + Math.sin(a) * 0.28, base[2] + Math.sin(k * 3 + phase) * 0.1];
    b.limb(p, q, s.thick * (1 - k * 0.85), i % 4 === 2 ? s.band : s.skin, s.thick * (1 - (k + 1 / n) * 0.85));
    p = q;
  }
}

const FLESH: Tentacle = { skin: { color: '#3e4a46', tex: 'skin', rough: 0.45 }, band: { color: '#5fd0d6', tex: 'skin', rough: 0.35, metal: 0.2 }, thick: 0.13 };
const PALE: Mat = { color: '#9fb3a8', tex: 'skin', rough: 0.4 };
const LIP: Mat = { color: '#5a6b62', tex: 'skin', rough: 0.55 }, MAW: Mat = { color: '#160c0c', tex: 'none', rough: 1 };
const STONE: Mat = { color: '#7d7468', tex: 'stone', rough: 0.95 }, PIT: Mat = { color: '#0d0a08', tex: 'none', rough: 1 };
const CORD: Mat = { color: '#6b5844', tex: 'leather', rough: 0.85 }, TEAM: Mat = { team: 'primary', tex: 'none', rough: 0.6 };
/** The tentacle pit's soft lip round its maw, lumps of the side's colour in it. */
function softPit(b: ModelBuilder): void {
  b.sphere([1.5, 0.3, 1.4], [0, 0.05, 0], LIP);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.sphere([0.32, 0.16, 0.26], [Math.cos(a) * 0.95, 0.28, Math.sin(a) * 0.95], i % 3 ? LIP : TEAM, [0, -a, 0]); }
  b.cylinder(0.78, 0.72, 0.05, [0, 0.3, 0], MAW, undefined, 16);
}

/** 9. Coiling tentacle: the tentacle pit, its middle tentacle thrown like the coiled whip (coiled in the pit, uncoiling
 *  up and back, lashing over), the crystal curled in its suckered tip; the two beside it writhe and shrink back. */
const coilingPit: TunnelModel = (b, t) => {
  softPit(b);
  writhingTentacle(b, t, [0.15, 0.25, 0.5], 1, FLESH); writhingTentacle(b, t, [0.15, 0.25, -0.5], 2.5, FLESH);
  coilingTentacle(b, t, [-0.1, 0.25, 0], { ...FLESH, thick: 0.2, suckers: PALE });
};

/** 10. Stone ring tentacles: the coiled whip's ring of stones and dark hole; its whip a fleshy tentacle with the sling
 *  at its tip, two short tentacles writhing at the hole's edge. */
const stoneRingTentacles: TunnelModel = (b, t) => {
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; b.rock([0.5, 0.42 + 0.1 * Math.sin(i * 3.1), 0.4], [Math.cos(a) * 1.2, 0.18, Math.sin(a) * 1.2], STONE, i); }
  b.cylinder(0.92, 0.85, 0.06, [0, 0.22, 0], PIT, undefined, 18);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; b.sphere(0.13, [Math.cos(a) * 1.25, 0.5, Math.sin(a) * 1.25], TEAM); }
  writhingTentacle(b, t, [0.45, 0.2, 0.55], 0.5, FLESH, 6); writhingTentacle(b, t, [0.3, 0.2, -0.6], 2, FLESH, 6);
  coilingTentacle(b, t, [-0.1, 0.15, 0], { ...FLESH, thick: 0.18, sling: CORD });
};

/** 11. Lone coil: one great suckered tentacle in a soft pit set in stones, coiling and lashing like the whip, a sling
 *  at its tip; the coiled whip's dark hide, the tentacle's bands. */
const loneCoil: TunnelModel = (b, t) => {
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.2; b.rock([0.4, 0.3, 0.32], [Math.cos(a) * 1.45, 0.08, Math.sin(a) * 1.45], STONE, i + 20); }
  softPit(b);
  coilingTentacle(b, t, [-0.1, 0.25, 0], { skin: { color: '#20302f', tex: 'leather', rough: 0.35, metal: 0.3 }, band: FLESH.band, thick: 0.25, suckers: PALE, sling: CORD });
};

export const TUNNELS: Array<[string, TunnelModel]> = [
  ['1 coiled whip', coiledWhip], ['2 trapdoor', trapdoor], ['3 periscope', periscope], ['4 pincer pair', pincerPair],
  ['5 tentacle pit', tentaclePit], ['6 trebuchet beam', trebuchetBeam], ['7 mandible maw', mandibleMaw], ['8 scorpion tail', scorpionTail],
  ['9 coiling tentacle', coilingPit], ['10 stone ring tentacles', stoneRingTentacles], ['11 lone coil', loneCoil],
];
