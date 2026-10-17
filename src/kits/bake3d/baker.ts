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
export const UNITS_PER_TILE = 2;
/** Screen px per model unit at zoom 1 (one tile = 64×32 px). */
export const PX_PER_UNIT = 32 * Math.SQRT2 / UNITS_PER_TILE;

export type BakedAnim = ArtAnim;

const FRAMES: Record<BakedAnim, number> = {
  idle: 4, walk: 8, fly: 8, leap: 6, climb: 8, soar: 4, glide: 4, land: 4, attack: 8, gather: 6, eat: 4, tired: 2, die: 6, carryFood: 8, carryWood: 8, carryCrystal: 8,
};
const FPS: Partial<Record<BakedAnim, number>> = { idle: 2.5, walk: 8, fly: 6, leap: 10, climb: 6, soar: 2, glide: 2, land: 4, gather: 7, eat: 4, tired: 1.5, carryFood: 8, carryWood: 8, carryCrystal: 8 };

export interface UnitBakeOptions {
  /** Inert units only get idle + die. */
  dummy?: boolean;
  /** Also bake walking with food / wood / crystal loads. */
  withCarry?: boolean;
  /** A flier: also bake flying (pose anim 'fly'), separate from walking a short hop. */
  fly?: boolean;
}

/** Game octants (0 = +x, counting toward +y), one sheet row each. */
const BAKED_DIRS = [0, 1, 2, 3, 4, 5, 6, 7];

interface Extent { left: number; right: number; top: number; bottom: number }

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

    this.scene.add(new THREE.HemisphereLight('#d6e4ff', '#5d5236', 1.25));
    this.sun = new THREE.DirectionalLight('#fff0d6', 2.8);
    this.sun.position.set(-7, 9, -2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

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

  dispose(): void {
    this.renderer.dispose();
  }

  /** Measure a model's bounding cylinder (radius, height) across a few poses. */
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
  private shoot(ext: Extent, ctx: CanvasRenderingContext2D, dx: number, dy: number, r: number, h: number): void {
    const w = ext.left + ext.right, hh = ext.top + ext.bottom;
    const pw = Math.ceil(w * this.q * this.ss), ph = Math.ceil(hh * this.q * this.ss);
    this.setCanvas(pw, ph);
    this.aim(ext, r, h);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, pw, ph);
    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(this.renderer.domElement, 0, 0, pw, ph, dx, dy, Math.ceil(w * this.q), Math.ceil(hh * this.q));
  }

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
    this.shoot(ext, canvas.getContext('2d')!, 0, 0, r, h);
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
    const withCarry = !!opts.withCarry;
    const anims: BakedAnim[] = opts.dummy ? ['idle', 'die'] : ['idle', 'walk', 'attack', 'gather', 'eat', 'tired', 'die'];
    if (withCarry && !opts.dummy) anims.push('carryFood', 'carryWood', 'carryCrystal');
    if (opts.fly && !opts.dummy) anims.push('fly', 'leap', 'climb', 'soar', 'glide', 'land');
    const poseFor = (anim: BakedAnim, phase: number): Pose => ({
      anim: anim === 'carryFood' || anim === 'carryWood' || anim === 'carryCrystal' ? 'walk' : anim,
      phase, team, armed: true,
      cargo: anim === 'carryFood' ? 'food' : anim === 'carryWood' ? 'wood' : anim === 'carryCrystal' ? 'crystal' : null,
    });
    const samples = [poseFor('idle', 0), poseFor('walk', 0.25), poseFor('attack', 0.3), poseFor('attack', 0.6), poseFor('gather', 0.5)];
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
    for (const anim of anims) {
      const n = FRAMES[anim];
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
          const phase = anim === 'die' ? f / (n - 1) : f / n;
          this.clearStage();
          const body = new THREE.Group();
          this.stage.add(body);
          model(new Builder(team, body), poseFor(anim === 'die' ? 'idle' : anim, anim === 'die' ? 0 : phase));
          if (anim === 'die') {
            // generic topple onto the left side
            const k = phase * phase;
            body.rotation.x = k * 1.5;
            body.position.y = -0.04 * k;
          }
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
      crops.set(anim, list);
      await new Promise((res) => setTimeout(res, 0));
    }

    // shelf-pack all crops, tallest first, onto pages no bigger than a GPU texture
    // can hold (a huge body's frames overflow one page and would draw as a black box)
    const all = [...crops.values()].flat();
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
    for (const [anim, list] of crops) {
      const n = FRAMES[anim];
      const frames: Sprite[][] = [];
      for (let di = 0; di < rows; di++) frames.push(list.slice(di * n, di * n + n).map((c) => ({ img: imgs[c.page ?? 0], sx: c.dx, sy: c.dy, sw: c.w, sh: c.h, ax: c.ax, ay: c.ay, q })));
      out[anim] = { frames, fps: FPS[anim] };
    }
    return { height: (h * Math.cos(Math.PI / 6)) * PX_PER_UNIT, anims: out as UnitArt['anims'] };
  }

  /** Frames a unit bake renders, for progress bars. */
  static frameCount(opts: UnitBakeOptions = {}): number {
    const withCarry = !!opts.withCarry;
    if (opts.dummy) return (FRAMES.idle + FRAMES.die) * BAKED_DIRS.length;
    let n = FRAMES.idle + FRAMES.walk + FRAMES.attack + FRAMES.gather + FRAMES.eat + FRAMES.tired + FRAMES.die;
    if (withCarry) n += FRAMES.carryFood + FRAMES.carryWood + FRAMES.carryCrystal;
    if (opts.fly) n += FRAMES.fly + FRAMES.leap + FRAMES.climb + FRAMES.soar + FRAMES.glide + FRAMES.land;
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
