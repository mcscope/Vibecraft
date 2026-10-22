// Pre-renders 3D models into isometric sprite sheets, AoE2/StarCraft style.
//
// Fixed 2:1 dimetric camera (30° elevation, 45° azimuth), one warm sun from the
// upper-left casting soft shadows down-right, sky/ground fill light. Each unit
// is baked in all 8 facings (mirroring would flip the baked shadows).
import * as THREE from 'three';
import type { AnimArt, ArtAnim, BuildingArt, Sprite, TeamColors, UnitArt } from '../../art/contract';
import type { BuildingModel, ModelBuilder, Pose, UnitModel } from './types';
import { Builder, type BuildOpts } from './builder';

/** Model units per map tile. A 1.7-unit person is a bit under a tile tall. */
import { UNITS_PER_TILE } from '../../art/contract';
export { UNITS_PER_TILE };
/** Screen px per model unit at zoom 1 (one tile = 64×32 px). */
export const PX_PER_UNIT = 32 * Math.SQRT2 / UNITS_PER_TILE;

export type BakedAnim = ArtAnim;

const FRAMES: Record<BakedAnim, number> = {
  idle: 4, walk: 8, charge: 8, brace: 2, stagger: 4, fly: 8, leap: 8, climb: 8, soar: 4, glide: 4, land: 4, bankL: 1, bankR: 1, swoop: 1, rise: 6, reload: 8, lay: 8, attack: 8, cut: 8, gather: 6, eat: 4, tired: 2, die: 6, carryFood: 8, carryWood: 8, carryCrystal: 8,
};
const FPS: Partial<Record<BakedAnim, number>> = { idle: 2.5, walk: 8, charge: 8, brace: 1.5, stagger: 6, fly: 6, leap: 10, climb: 6, soar: 2, glide: 2, land: 4, gather: 7, eat: 4, tired: 1.5, carryFood: 8, carryWood: 8, carryCrystal: 8 };

export interface UnitBakeOptions {
  /** Inert units only get idle + die. */
  dummy?: boolean;
  /** Also bake walking with food / wood / crystal loads. */
  withCarry?: boolean;
  /** A flier: also bake flying (pose anim 'fly'), separate from walking a short hop. */
  fly?: boolean;
  /** Carries a shaft: also bake the braced stance (point set, waiting). */
  brace?: boolean;
  /** Carries a sidearm beside its main weapon: also bake its blow ('cut'). */
  sidearm?: boolean;
  /** Its model draws its whole leap itself (no springy squash and tip from the baker). */
  ownLeap?: boolean;
  /** It lays eggs (or spawns young) from its body: also bake 'lay', played as each comes out. */
  lay?: boolean;
  /** Between throws it reloads by hand (or tail): also bake 'reload', played while it recovers. */
  reload?: boolean;
  /** It rests in a squat and gets up to move: also bake getting up ('rise', played backward to sit down). */
  rises?: boolean;
  /** Its body trails along its path in parts (Pose.part), each this many model units behind its front: baked apart. */
  segments?: number[];
  /** (A trailing part: only standing, crawling and dying.) */
  part?: boolean;
}

/**
 * Finish a baked image the way RTS sprites are: a touch more contrast and
 * colour on the model, and a thin dark outline around its silhouette (so it
 * reads against any ground). Shadows (semi-transparent) are left alone.
 */
function polish(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 200;
  const edge: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i + 3] > 200) {
      // contrast and saturation
      const r = d[i], g = d[i + 1], b = d[i + 2], l = (r + g + b) / 3;
      for (let c = 0; c < 3; c++) {
        let v = d[i + c];
        v = l + (v - l) * 1.12; // saturation
        v = (v - 128) * 1.07 + 128; // contrast
        d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    } else if (d[i + 3] < 120 && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push(i);
  }
  for (const i of edge) {
    // a dark outline pixel, blended over whatever (shadow or nothing) was there
    const a = d[i + 3] / 255, k = 0.6;
    d[i] = d[i] * a * (1 - k) + 22 * k; d[i + 1] = d[i + 1] * a * (1 - k) + 16 * k; d[i + 2] = d[i + 2] * a * (1 - k) + 12 * k;
    d[i + 3] = Math.max(d[i + 3], 150);
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Ambient occlusion from a depth image (brighter = nearer the camera): a pixel with many
 * nearby pixels standing in front of it sits in a crevice (under eaves, between beams,
 * where a wall meets the ground) and gets darker.
 */
function occlude(ctx: CanvasRenderingContext2D, depth: CanvasRenderingContext2D, w: number, h: number, radius: number): void {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const z = depth.getImageData(0, 0, w, h).data;
  const taps: Array<[number, number]> = [];
  for (const k of [0.5, 1]) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + k;
    taps.push([Math.round(Math.cos(a) * radius * k), Math.round(Math.sin(a) * radius * k)]);
  }
  const shade = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (d[i * 4 + 3] < 200 || z[i * 4 + 3] < 200) continue;
    const here = z[i * 4];
    let occ = 0;
    for (const [ox, oy] of taps) {
      const sx = x + ox, sy = y + oy;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const j = (sy * w + sx) * 4;
      if (z[j + 3] < 200) continue;
      const dz = z[j] - here; // positive: that neighbour is in front of us
      if (dz > 2 && dz < 40) occ++;
    }
    shade[i] = occ / taps.length;
  }
  for (let i = 0; i < w * h; i++) {
    if (!shade[i]) continue;
    const k = 1 - 0.5 * shade[i];
    d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);
}

/** Game octants (0 = +x, counting toward +y), one sheet row each. */
const BAKED_DIRS = [0, 1, 2, 3, 4, 5, 6, 7];

interface Extent { left: number; right: number; top: number; bottom: number }

/** Poses drawn in the air (lifted to the flier's height): baked without a ground shadow, their shadows baked alone. */
/**
 * Dying, any body collapses like a marionette with its strings cut, not tipping over whole: every part drops under
 * its own weight (the low ones landing first, the high ones falling furthest and last), heaping on the ground; upright
 * parts (legs, necks, shafts) topple outward, and the heap splays out a little from where it stood. `k` 0 … 1.
 */
function collapse(body: THREE.Object3D, k: number): void {
  if (k <= 0) return;
  body.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  body.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const all = new THREE.Box3().setFromObject(body), mid = all.getCenter(new THREE.Vector3()), top = Math.max(0.05, all.max.y);
  for (const m of meshes) body.attach(m); // (each part on its own now, where it was)
  const box = new THREE.Box3(), c = new THREE.Vector3(), size = new THREE.Vector3();
  meshes.forEach((m, i) => {
    box.setFromObject(m); box.getCenter(c); box.getSize(size);
    const h = c.y / top; // 0 … 1, how high it was
    const fall = Math.min(1, k / (0.35 + 0.65 * Math.sqrt(h))); // (falling from higher takes longer)
    const f = fall * fall * (3 - 2 * fall);
    const rest = Math.min(size.x, size.y, size.z) * 0.5 + top * 0.18 * h; // lying flat, heaped on what fell first
    m.position.y += (rest - c.y) * f;
    // splaying out from where it stood (a part right over the middle goes a way of its own)
    let ox = c.x - mid.x, oz = c.z - mid.z;
    const d = Math.hypot(ox, oz);
    if (d < 0.02) { const a = i * 2.4; ox = Math.cos(a); oz = Math.sin(a); } else { ox /= d; oz /= d; }
    // (and the whole heap slumps a little to one side, as a body falls)
    m.position.x += ox * f * top * 0.18 * h;
    m.position.z += oz * f * top * 0.18 * h + f * top * 0.25 * h;
    // upright parts topple flat, outward; the rest tilt as they land
    const upright = size.y > Math.max(size.x, size.z) * 0.8;
    m.rotateOnWorldAxis(new THREE.Vector3(oz, 0, -ox), f * (upright ? Math.PI / 2 : 0.5));
  });
}

const AIR_POSES = new Set<string>(['fly', 'leap', 'climb', 'soar', 'glide', 'land', 'bankL', 'bankR', 'swoop']);

export class Baker {
  readonly q: number;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private sun: THREE.DirectionalLight;
  private stage = new THREE.Group();
  private ss = 2; // supersampling
  private ground: THREE.Mesh;

  constructor(quality = (window.devicePixelRatio || 1) >= 2 ? 2 : 1.75) {
    this.q = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.localClippingEnabled = true; // construction / collapse looks

    // a three-light rig: a warm key sun (upper left, casting crisp shadows), a cool fill from the
    // opposite side so shaded faces read blue rather than mud, and a rim light from behind that
    // picks out silhouettes and top edges; a dim sky/ground bounce under it all
    this.scene.add(new THREE.HemisphereLight('#cfdcff', '#4a3f2a', 0.75));
    this.sun = new THREE.DirectionalLight('#ffe6c4', 3.1);
    this.sun.position.set(-7, 9, -2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.015;
    this.sun.shadow.radius = 2;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    const fill = new THREE.DirectionalLight('#a9c0ff', 0.7);
    fill.position.set(7, 4, 6);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight('#fff6e8', 1.1);
    rim.position.set(-4, 6, -9);
    this.scene.add(rim);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.42 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.ground = ground;
    this.scene.add(ground);
    this.scene.add(this.stage);

    const e = Math.PI / 6; // 30° elevation → 2:1 tiles
    const d = 50;
    this.camera.position.set((Math.cos(e) / Math.SQRT2) * d, Math.sin(e) * d, (Math.cos(e) / Math.SQRT2) * d);
    this.camera.lookAt(0, 0, 0);
  }

  /** Free the GPU: its WebGL context too, not just when it's garbage-collected (browsers cap live contexts per page). */
  dispose(): void {
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  /** Measure a model's bounding cylinder (radius, height) across a few poses. */
  /**
   * How far (model units) a walk cycle carries the body: the distance its planted feet slide back under it, frame to
   * frame, summed over the loop. Played at its real ground speed by that, a planted foot stays where it is. Undefined
   * if nothing in it stays planted (a crawl, a roll).
   */
  private stride(build: (b: ModelBuilder, pose: Pose) => void, team: TeamColors, pose: (phase: number) => Pose, n: number): number | undefined {
    const frames: Array<Array<{ lo: number; x: number }>> = [];
    const box = new THREE.Box3(), c = new THREE.Vector3();
    for (let f = 0; f < n; f++) {
      this.clearStage();
      this.stage.rotation.y = 0;
      build(new Builder(team, this.stage), pose(f / n));
      this.stage.updateMatrixWorld(true);
      const parts: Array<{ lo: number; x: number }> = [];
      this.stage.traverse((o) => { if (o instanceof THREE.Mesh) { box.setFromObject(o); box.getCenter(c); parts.push({ lo: box.min.y, x: c.x }); } });
      frames.push(parts);
    }
    const on = Math.max(0, Math.min(...frames.flat().map((p) => p.lo))) + 0.05; // (on the ground: within 5 cm of it)
    let d = 0, steps = 0;
    for (let f = 0; f < n; f++) {
      const a = frames[f], b = frames[(f + 1) % n];
      if (a.length !== b.length) continue;
      const slides = a.map((p, i) => (p.lo < on && b[i].lo < on ? p.x - b[i].x : 0)).filter((dx) => dx > 1e-4).sort((x, y) => x - y);
      if (!slides.length) continue;
      d += slides[Math.floor(slides.length / 2)];
      steps++;
    }
    return steps >= n / 2 && d > 0.05 ? (d * n) / steps : undefined;
  }

  private measure(build: (b: ModelBuilder, pose: Pose) => void, team: TeamColors, poses: Pose[]): { r: number; h: number } {
    let r = 0.3, h = 0.3;
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const p of poses) {
      this.clearStage();
      build(new Builder(team, this.stage), p);
      this.stage.updateMatrixWorld(true);
      this.stage.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        box.setFromObject(o);
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          v.set(x, y, z);
          r = Math.max(r, Math.hypot(v.x, v.z));
          h = Math.max(h, v.y);
        }
      });
    }
    return { r, h };
  }

  private extent(r: number, h: number): Extent {
    const S = PX_PER_UNIT, s = 0.5, c = Math.cos(Math.PI / 6);
    const shadow = h * 0.85; // sun ~50° high
    return {
      left: Math.ceil(r * S + 3),
      right: Math.ceil(r * S + shadow * 0.75 * S + 3),
      top: Math.ceil((h * c + r * s) * S + 3),
      bottom: Math.ceil(r * s * S + shadow * 0.25 * S + 3),
    };
  }

  private clearStage(): void {
    this.stage.clear();
    this.stage.rotation.set(0, 0, 0);
    this.stage.position.set(0, 0, 0);
  }

  /** Render the current stage into ctx at (dx,dy) using the given screen extent. */
  private shoot(ext: Extent, ctx: CanvasRenderingContext2D, dx: number, dy: number, r: number, h: number, depth?: CanvasRenderingContext2D): void {
    const w = ext.left + ext.right, hh = ext.top + ext.bottom;
    const pw = Math.ceil(w * this.q * this.ss), ph = Math.ceil(hh * this.q * this.ss);
    this.setCanvas(pw, ph);
    this.aim(ext, r, h);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, pw, ph);
    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(this.renderer.domElement, 0, 0, pw, ph, dx, dy, Math.ceil(w * this.q), Math.ceil(hh * this.q));
    if (!depth) return;
    // a depth pass over just the model's depth range (8 bits go a long way when the range is tight)
    const cam = this.camera, near = cam.near, far = cam.far, span = (r + h) * 1.2 + 1;
    cam.near = 50 - span; cam.far = 50 + span; cam.updateProjectionMatrix();
    const ground = this.ground.visible, tone = this.renderer.toneMapping;
    this.ground.visible = false; this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene.overrideMaterial = this.depthMat;
    this.renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    this.ground.visible = ground; this.renderer.toneMapping = tone;
    cam.near = near; cam.far = far; cam.updateProjectionMatrix();
    depth.drawImage(this.renderer.domElement, 0, 0, pw, ph, dx, dy, Math.ceil(w * this.q), Math.ceil(hh * this.q));
  }
  private depthMat = new THREE.MeshDepthMaterial();

  private setCanvas(pw: number, ph: number): void {
    if (this.renderer.domElement.width !== pw || this.renderer.domElement.height !== ph) this.renderer.setSize(pw, ph, false);
  }

  /** Point the camera and shadow frustum at a frame of the given extent. */
  private aim(ext: Extent, r: number, h: number): void {
    const S = PX_PER_UNIT;
    const cam = this.camera;
    cam.left = -ext.left / S; cam.right = ext.right / S; cam.top = ext.top / S; cam.bottom = -ext.bottom / S;
    cam.updateProjectionMatrix();
    const sc = this.sun.shadow.camera;
    const span = Math.max(r, h) * 1.6 + 1;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 0.1; sc.far = 40;
    sc.updateProjectionMatrix();
  }

  /** Bake a static object (building, tree, mine...). Origin = footprint centre. */
  bakeStatic(build: (b: ModelBuilder) => void, team: TeamColors, shadow = true, opts: BuildOpts = {}, minRadius = 0): Sprite {
    this.ground.visible = shadow;
    const pose: Pose = { anim: 'idle', phase: 0, team, armed: true, cargo: null };
    let { r, h } = this.measure((b) => build(b), team, [pose]);
    r = Math.max(r, minRadius);
    const ext = this.extent(r, h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((ext.left + ext.right) * this.q);
    canvas.height = Math.ceil((ext.top + ext.bottom) * this.q);
    this.clearStage();
    build(new Builder(team, this.stage, opts));
    const depth = document.createElement('canvas');
    depth.width = canvas.width; depth.height = canvas.height;
    const dctx = depth.getContext('2d', { willReadFrequently: true })!;
    this.shoot(ext, canvas.getContext('2d')!, 0, 0, r, h, dctx);
    occlude(canvas.getContext('2d')!, dctx, canvas.width, canvas.height, Math.max(3, Math.round(this.q * 5)));
    polish(canvas.getContext('2d')!, canvas.width, canvas.height);
    this.ground.visible = true;
    return { img: canvas, sx: 0, sy: 0, sw: canvas.width, sh: canvas.height, ax: ext.left * this.q, ay: ext.top * this.q, q: this.q };
  }

  /**
   * All the looks of a building: 3 construction stages, finished, 2 damage
   * levels. Unless `custom`, construction is the model clipped at rising
   * heights inside generic scaffolding, and damage is soot, rubble and (badly
   * hurt) a sheared-off corner. With `custom`, the model draws every state.
   */
  bakeBuilding(model: BuildingModel, size: number, team: TeamColors, custom = false): BuildingArt {
    const { h } = this.measure((b) => model(b), team, [{ anim: 'idle', phase: 0, team, armed: true, cargo: null }]);
    const reach = size * Math.SQRT2 + 1.1; // scaffolding + timber pile stick out past the footprint
    const scoped = (b: ModelBuilder, o: BuildOpts, fn: (m: ModelBuilder) => void) => (b as Builder).withOpts(o, fn);
    const construction = [0.18, 0.45, 0.78].map((f, level) => this.bakeStatic((b) => {
      const state = { phase: 'construction' as const, level };
      if (custom) { model(b, state); return; }
      groundworks(b, size);
      scaffold(b, size, f * h + 0.3);
      scoped(b, { clip: [new THREE.Plane(new THREE.Vector3(0, -1, 0), f * h)], clipKey: `cut${level}` }, (m) => model(m, state));
    }, team, true, {}, reach));
    const complete = this.bakeStatic((b) => model(b), team, true, {}, reach);
    const n = new THREE.Vector3(0.42, -1, 0.3).normalize();
    const collapse = new THREE.Plane(n, -n.dot(new THREE.Vector3(size * 0.35, h * 0.7, -size * 0.25)));
    const damaged = [1, 2].map((level) => this.bakeStatic((b) => {
      const state = { phase: 'damaged' as const, level };
      if (custom) { model(b, state); return; }
      scoped(b, level === 2 ? { grime: 0.42, clip: [collapse], clipKey: 'collapse' } : { grime: 0.22 }, (m) => model(m, state));
      rubble(b, size, level, h);
    }, team, true, {}, reach));
    return { construction, complete, damaged };
  }

  /** Bake every animation × facing for a unit. Yields between rows so the page stays responsive. */
  async bakeUnit(model: UnitModel, team: TeamColors, opts: UnitBakeOptions = {}, onFrame?: () => void): Promise<UnitArt> {
    if (opts.segments?.length) {
      // a body in trailing parts: its front as the unit, then each part on its own
      const front = await this.bakeUnit((b, p) => model(b, { ...p, part: 0 }), team, { ...opts, segments: undefined }, onFrame);
      front.segments = [];
      for (const [i, behind] of opts.segments.entries()) {
        const seg = await this.bakeUnit((b, p) => model(b, { ...p, part: i + 1 }), team, { part: true }, onFrame);
        front.segments.push({ anims: seg.anims, behind });
      }
      return front;
    }
    const withCarry = !!opts.withCarry;
    const anims: BakedAnim[] = opts.part ? ['idle', 'walk', 'die'] : opts.dummy ? ['idle', 'die'] : ['idle', 'walk', 'attack', 'gather', 'eat', 'tired', 'die'];
    if (!opts.dummy && !opts.part) anims.push('charge', 'stagger');
    if (opts.brace && !opts.dummy) anims.push('brace');
    if (opts.rises && !opts.dummy) anims.push('rise');
    if (opts.reload && !opts.dummy) anims.push('reload');
    if (opts.lay && !opts.dummy) anims.push('lay');
    if (opts.sidearm && !opts.dummy) anims.push('cut');
    if (withCarry && !opts.dummy) anims.push('carryFood', 'carryWood', 'carryCrystal');
    if (opts.fly && !opts.dummy) anims.push('fly', 'leap', 'climb', 'soar', 'glide', 'land', 'bankL', 'bankR', 'swoop'); // (a bank: one still frame a side)
    // the whole-body styles ride on poses every model already knows: a charge is the walk, a stagger
    // is tired (hunched, arms down), a brace is standing; the baker leans the body for each (below)
    const poseFor = (anim: BakedAnim, phase: number): Pose => ({
      anim: anim === 'carryFood' || anim === 'carryWood' || anim === 'carryCrystal' || anim === 'charge' ? 'walk' : anim === 'stagger' ? 'tired' : anim === 'brace' ? 'idle' : anim === 'bankL' || anim === 'bankR' ? 'soar' : anim === 'swoop' ? 'glide' : anim,
      phase, team, armed: true,
      cargo: anim === 'carryFood' ? 'food' : anim === 'carryWood' ? 'wood' : anim === 'carryCrystal' ? 'crystal' : null,
      style: anim === 'charge' || anim === 'stagger' || anim === 'brace' || anim === 'bankL' || anim === 'bankR' || anim === 'swoop' ? anim : undefined,
    });
    const samples = [poseFor('idle', 0), poseFor('walk', 0.25), poseFor('attack', 0.3), poseFor('attack', 0.6), poseFor('gather', 0.5)];
    if (opts.sidearm) samples.push(poseFor('cut', 0.3), poseFor('cut', 0.6));
    if (withCarry) samples.push(poseFor('carryFood', 0.25));
    if (opts.fly) samples.push(poseFor('fly', 0), poseFor('fly', 0.25), poseFor('fly', 0.5), poseFor('fly', 0.75), poseFor('leap', 0), poseFor('leap', 0.5), poseFor('land', 0.5)); // spread wings need room
    let { r, h } = this.measure(model, team, samples);
    r = Math.max(r, h * 1.05); // room to fall over
    const ext = this.extent(r, h);
    const fw = Math.ceil((ext.left + ext.right) * this.q), fh = Math.ceil((ext.top + ext.bottom) * this.q);
    // Render each animation as a grid in one GL canvas (one readback per anim),
    // then crop every frame to its visible pixels and shelf-pack the crops into
    // a single atlas per unit. Uncropped sheets are ~90% empty space and blow
    // through GPU memory.
    const cw = Math.ceil(fw * this.ss), chh = Math.ceil(fh * this.ss);
    const rows = BAKED_DIRS.length;
    const ax0 = ext.left * this.q, ay0 = ext.top * this.q;
    type Crop = { src: HTMLCanvasElement; x: number; y: number; w: number; h: number; ax: number; ay: number; dx: number; dy: number; page?: number };
    const crops = new Map<BakedAnim, Crop[]>();
    this.aim(ext, r, h);
    const shadowCrops = new Map<BakedAnim, Crop[]>();
    for (const [anim, shadowPass] of anims.flatMap((a) => (AIR_POSES.has(a) ? [[a, false], [a, true]] : [[a, false]]) as Array<[BakedAnim, boolean]>)) {
      const n = FRAMES[anim];
      // in the air the body is baked without its shadow (it's drawn lifted to its height) and, in a second pass, its
      // shadow alone: the renderer lays that on the ground, falling away from the sun as it climbs
      this.ground.visible = !AIR_POSES.has(anim) || shadowPass;
      const grid = document.createElement('canvas');
      grid.width = fw * n;
      grid.height = fh * rows;
      const ctx = grid.getContext('2d', { willReadFrequently: true })!;
      // Render in batches that fit the GPU's drawing-buffer limit. A big body's
      // frames side by side can exceed it, and the browser then silently shrinks
      // the canvas, so frames get read back from the wrong place (they jitter).
      const gl = this.renderer.getContext();
      const lim = Math.min(4096, (gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array)[0], gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
      const cols = Math.max(1, Math.min(n, Math.floor(lim / cw)));
      const rowsPer = Math.max(1, Math.min(rows, Math.floor(lim / chh)));
      this.setCanvas(cols * cw, rowsPer * chh);
      for (let r0 = 0; r0 < rows; r0 += rowsPer) for (let f0 = 0; f0 < n; f0 += cols) {
      const nr = Math.min(rowsPer, rows - r0), nc = Math.min(cols, n - f0);
      this.renderer.setScissorTest(true);
      for (let di = r0; di < r0 + nr; di++) {
        const theta = (BAKED_DIRS[di] * Math.PI) / 4;
        for (let f = f0; f < f0 + nc; f++) {
          const phase = anim === 'die' || anim === 'rise' || anim === 'reload' || anim === 'lay' ? f / (n - 1) : f / n;
          this.clearStage();
          const body = new THREE.Group();
          this.stage.add(body);
          model(new Builder(team, body), poseFor(anim === 'die' ? 'idle' : anim, anim === 'die' ? 0 : phase));
          // the body styles: models face +x, so leaning in is a tip about z toward +x
          if (anim === 'charge') { body.rotation.z = -0.2; body.position.x = 0.04; } // flat out, weight forward
          // banking: rolled into the turn, the inside wing down (L turns toward its +z side, which dips with +x roll)
          if (anim === 'bankL' || anim === 'bankR') body.rotation.x = anim === 'bankL' ? 0.5 : -0.5;
          // a leap off the ground, springy: crouching (squashing down, tipping nose-up, weight back), then driving up
          // (stretching tall, tipped further up), then easing into the climb
          if (anim === 'leap' && !opts.ownLeap) {
            const ease = (k: number) => k * k * (3 - 2 * k);
            const [sy, tip, dx] = phase < 0.2 ? [1 - 0.22 * ease(phase / 0.2), 0.3 * ease(phase / 0.2), -0.04 * ease(phase / 0.2)]
              : phase < 0.4 ? [0.78 + 0.37 * ease((phase - 0.2) / 0.2), 0.3 + 0.15 * ease((phase - 0.2) / 0.2), -0.04 + 0.06 * ease((phase - 0.2) / 0.2)]
              : [1.15 - 0.15 * ease((phase - 0.4) / 0.6), 0.45 - 0.25 * ease((phase - 0.4) / 0.6), 0.02];
            body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy)); // (squash and stretch, keeping its volume)
            body.rotation.z = tip;
            body.position.x = dx;
          }
          if (anim === 'brace') { body.rotation.z = -0.1; body.scale.set(1, 0.92, 1); } // set low, leaning into the point
          if (anim === 'stagger') { // knocked back off balance, swaying as it catches itself
            const s = Math.sin(phase * Math.PI * 2);
            body.rotation.z = 0.28 + s * 0.06;
            body.rotation.x = s * 0.14;
            body.position.x = -0.05;
          }
          if (anim === 'die') collapse(body, phase);
          // its shadow alone: the body draws nothing (its own copies of its materials write no colour or depth) but
          // still casts its shadow (the shadow map is drawn apart, from the light)
          if (shadowPass) body.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            const hide = (mat: THREE.Material) => { const c = mat.clone(); c.colorWrite = false; c.depthWrite = false; return c; };
            m.material = Array.isArray(m.material) ? m.material.map(hide) : hide(m.material);
          });
          this.stage.rotation.y = -theta;
          const vx = (f - f0) * cw, vy = (rowsPer - 1 - (di - r0)) * chh; // GL viewports start bottom-left
          this.renderer.setViewport(vx, vy, cw, chh);
          this.renderer.setScissor(vx, vy, cw, chh);
          this.renderer.render(this.scene, this.camera);
          onFrame?.();
        }
      }
      this.renderer.setScissorTest(false);
      ctx.drawImage(this.renderer.domElement, 0, 0, nc * cw, nr * chh, f0 * fw, r0 * fh, nc * fw, nr * fh);
      }
      if (!shadowPass) polish(ctx, grid.width, grid.height);
      // crop each cell to its alpha bounds
      const data = ctx.getImageData(0, 0, grid.width, grid.height).data;
      const list: Crop[] = [];
      for (let di = 0; di < rows; di++) for (let f = 0; f < n; f++) {
        let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
        for (let y = 0; y < fh; y++) {
          const row = ((di * fh + y) * grid.width + f * fw) * 4 + 3;
          for (let x = 0; x < fw; x++) {
            if (data[row + x * 4] > 3) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              y1 = y;
            }
          }
        }
        if (x1 < 0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }
        list.push({ src: grid, x: f * fw + x0, y: di * fh + y0, w: x1 - x0 + 1, h: y1 - y0 + 1, ax: ax0 - x0, ay: ay0 - y0, dx: 0, dy: 0 });
      }
      (shadowPass ? shadowCrops : crops).set(anim, list);
      await new Promise((res) => setTimeout(res, 0));
    }
    this.ground.visible = true;

    // shelf-pack all crops, tallest first, onto pages no bigger than a GPU texture
    // can hold (a huge body's frames overflow one page and would draw as a black box)
    const all = [...crops.values(), ...shadowCrops.values()].flat();
    const MAXW = 2048, MAXH = 4096, PAD = 2;
    const pages: Array<{ w: number; h: number }> = [{ w: 0, h: 0 }];
    let cx = 0, cy = 0, shelf = 0;
    for (const c of [...all].sort((a, b) => b.h - a.h)) {
      if (cx + c.w > MAXW) { cx = 0; cy += shelf + PAD; shelf = 0; }
      if (cy + c.h > MAXH && cy > 0) { pages.push({ w: 0, h: 0 }); cx = 0; cy = 0; shelf = 0; }
      const pg = pages.length - 1;
      c.dx = cx; c.dy = cy; c.page = pg;
      cx += c.w + PAD;
      shelf = Math.max(shelf, c.h);
      pages[pg].w = Math.max(pages[pg].w, cx);
      pages[pg].h = Math.max(pages[pg].h, cy + shelf);
    }
    const imgs: ImageBitmap[] = [];
    for (let pg = 0; pg < pages.length; pg++) {
      const atlas = document.createElement('canvas');
      atlas.width = Math.max(1, pages[pg].w);
      atlas.height = Math.max(1, pages[pg].h);
      const actx = atlas.getContext('2d')!;
      for (const c of all) if (c.page === pg) actx.drawImage(c.src, c.x, c.y, c.w, c.h, c.dx, c.dy, c.w, c.h);
      // GPU-resident bitmap: plain canvases get re-uploaded on every draw
      imgs.push(await createImageBitmap(atlas));
    }
    const q = this.q;
    const out: Partial<Record<BakedAnim, AnimArt>> = {};
    const sprites = (anim: BakedAnim, list: Crop[]): Sprite[][] => {
      const n = FRAMES[anim], frames: Sprite[][] = [];
      for (let di = 0; di < rows; di++) frames.push(list.slice(di * n, di * n + n).map((c) => ({ img: imgs[c.page ?? 0], sx: c.dx, sy: c.dy, sw: c.w, sh: c.h, ax: c.ax, ay: c.ay, q })));
      return frames;
    };
    // the walk's stride (the charge and the loaded walks are the same legs): played by distance, feet stay planted
    const stride = opts.dummy ? undefined : this.stride(model, team, (ph) => poseFor('walk', ph), FRAMES.walk);
    const runStride = opts.dummy ? undefined : this.stride(model, team, (ph) => poseFor('charge', ph), FRAMES.charge); // (a gallop's, if it gallops)
    const WALKS: BakedAnim[] = ['walk', 'carryFood', 'carryWood', 'carryCrystal'];
    for (const [anim, list] of crops) {
      const sh = shadowCrops.get(anim);
      out[anim] = { frames: sprites(anim, list), fps: FPS[anim], ...(sh ? { shadows: sprites(anim, sh) } : {}), ...(stride && WALKS.includes(anim) ? { stride } : {}), ...(anim === 'charge' && (runStride ?? stride) ? { stride: runStride ?? stride } : {}) };
    }
    return { height: (h * Math.cos(Math.PI / 6)) * PX_PER_UNIT, anims: out as UnitArt['anims'] };
  }

  /** Frames a unit bake renders, for progress bars. */
  static frameCount(opts: UnitBakeOptions = {}): number {
    const withCarry = !!opts.withCarry;
    if (opts.dummy) return (FRAMES.idle + FRAMES.die) * BAKED_DIRS.length;
    let n = FRAMES.idle + FRAMES.walk + FRAMES.attack + FRAMES.gather + FRAMES.eat + FRAMES.tired + FRAMES.die;
    if (withCarry) n += FRAMES.carryFood + FRAMES.carryWood + FRAMES.carryCrystal;
    if (opts.sidearm) n += FRAMES.cut;
    if (opts.fly) n += 2 * (FRAMES.fly + FRAMES.leap + FRAMES.climb + FRAMES.soar + FRAMES.glide + FRAMES.land); // (and their shadows)
    return n * BAKED_DIRS.length;
  }
}

// ───────────────────────────── generic building states ─────────────────────────────

const TIMBER = { color: '#8a6a44', tex: 'plank' } as const;
const DARK_TIMBER = { color: '#5e4128', tex: 'wood' } as const;

/** Packed-earth foundation plus a pile of timber waiting to be used. */
function groundworks(b: ModelBuilder, size: number): void {
  b.box([size * 2 + 0.2, 0.1, size * 2 + 0.2], [0, 0.05, 0], { color: '#7a6a52', tex: 'stone' });
  const px = size + 0.55, pz = size * 0.4;
  for (let i = 0; i < 6; i++) {
    const row = i < 3 ? 0 : 1, k = i % 3;
    b.limb([px - 0.1, 0.11 + row * 0.19, pz - 0.7 + k * 0.2 + row * 0.1], [px + 0.15, 0.11 + row * 0.19, pz + 0.7 + k * 0.2 + row * 0.1], 0.09, DARK_TIMBER);
  }
  for (let i = 0; i < 4; i++) b.box([0.12, 0.04, 1.3], [px + 0.55, 0.03 + i * 0.045, pz - 0.2], TIMBER, [0, 0.05 * i, 0]);
}

/** Poles, ledgers, braces and a ladder up to `top`, just outside the footprint. */
function scaffold(b: ModelBuilder, size: number, top: number): void {
  const e = size + 0.12;
  const n = Math.max(2, Math.round((2 * e) / 1.5));
  const along = (i: number) => -e + (i / n) * 2 * e;
  for (let i = 0; i <= n; i++) {
    for (const [x, z] of [[e, along(i)], [along(i), e], [-e, along(i)], [along(i), -e]] as const) b.cylinder(0.035, 0.04, top + 0.4, [x, (top + 0.4) / 2, z], DARK_TIMBER, undefined, 6);
  }
  for (let y = 0.9; y < top + 0.2; y += 0.9) {
    b.box([0.07, 0.05, 2 * e], [e, y, 0], TIMBER);
    b.box([2 * e, 0.05, 0.07], [0, y, e], TIMBER);
    b.box([0.34, 0.035, 2 * e], [e + 0.17, y - 0.02, 0], TIMBER); // walkway planks
  }
  b.limb([e, 0.1, -e], [e, Math.min(top, 2.6), e * 0.2], 0.025, DARK_TIMBER);
  b.limb([-e, 0.1, e], [e * 0.3, Math.min(top, 2.6), e], 0.025, DARK_TIMBER);
  // ladder
  for (const z of [0.55, 0.85]) b.limb([e + 0.35, 0, z], [e + 0.2, top, z], 0.02, DARK_TIMBER);
  for (let y = 0.3; y < top; y += 0.3) b.limb([e + 0.35 - (y / top) * 0.15, y, 0.55], [e + 0.35 - (y / top) * 0.15, y, 0.85], 0.012, DARK_TIMBER);
}

/** Broken stone and planks around a damaged building; more and bigger when badly hurt. */
function rubble(b: ModelBuilder, size: number, level: number, h: number): void {
  let s = 977 + level * 131;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = level === 2 ? 22 : 9;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = size * (0.95 + rnd() * 0.45);
    const x = Math.cos(a) * d, z = Math.sin(a) * d, k = 0.08 + rnd() * (level === 2 ? 0.22 : 0.12);
    if (rnd() < 0.55) b.rock([k * 1.3, k, k], [x, k * 0.4, z], { color: rnd() < 0.5 ? '#7d786f' : '#5f5a52', tex: 'stone' }, i);
    else b.box([0.08, 0.05, 0.5 + rnd() * 0.6], [x, 0.04, z], { color: '#4a3424', tex: 'wood' }, [0, rnd() * 3, rnd() * 0.3]);
  }
  // scorch marks
  for (let i = 0; i < (level === 2 ? 4 : 2); i++) {
    const a = rnd() * Math.PI * 2, d = size * (0.6 + rnd() * 0.5);
    b.box([0.8 + rnd(), 0.012, 0.6 + rnd()], [Math.cos(a) * d, 0.012, Math.sin(a) * d], { color: '#221c18' }, [0, rnd() * 3, 0]);
  }
  if (level === 2) {
    // beams fallen from the collapsed corner
    for (let i = 0; i < 4; i++) {
      const z = -size * 0.6 + i * 0.4;
      b.limb([size * 0.9, 0.1, z], [size * 0.35, h * 0.45, z + 0.3], 0.07, { color: '#3a2a1c', tex: 'wood' });
    }
    b.rock([0.5, 0.35, 0.6], [size * 0.85, 0.15, -size * 0.3], { color: '#6f6a62', tex: 'stone' }, 3);
  }
}

/** Draw a sprite with its anchor at (x, y), scaled by zoom, optionally mirrored. */
export function blit(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, zoom: number, mirror = false, alpha = 1): void {
  const k = zoom / s.q;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (mirror) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -s.ax * k, -s.ay * k, s.sw * k, s.sh * k);
    ctx.restore();
  } else {
    ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, x - s.ax * k, y - s.ay * k, s.sw * k, s.sh * k);
  }
  if (alpha !== 1) ctx.globalAlpha = 1;
}
