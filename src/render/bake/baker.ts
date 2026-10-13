// Pre-renders 3D models into isometric sprite sheets, AoE2/StarCraft style.
//
// Fixed 2:1 dimetric camera (30° elevation, 45° azimuth), one warm sun from the
// upper-left casting soft shadows down-right, sky/ground fill light. Each unit
// is baked in all 8 facings (mirroring would flip the baked shadows).
import * as THREE from 'three';
import type { AnimName, ModelBuilder, Pose, TeamColors, UnitSpec } from '../../factions/types';
import { Builder } from './builder';

/** Model units per map tile. A 1.7-unit person is a bit under a tile tall. */
export const UNITS_PER_TILE = 2;
/** Screen px per model unit at zoom 1 (one tile = 64×32 px). */
export const PX_PER_UNIT = 32 * Math.SQRT2 / UNITS_PER_TILE;

export type BakedAnim = AnimName | 'carryFood' | 'carryWood' | 'carryCrystal';

const FRAMES: Record<BakedAnim, number> = {
  idle: 4, walk: 8, attack: 8, gather: 6, eat: 4, tired: 2, die: 6, carryFood: 8, carryWood: 8, carryCrystal: 8,
};

/** Game octants (0 = +x, counting toward +y), one sheet row each. */
const BAKED_DIRS = [0, 1, 2, 3, 4, 5, 6, 7];

export interface Sprite {
  img: CanvasImageSource;
  sx: number; sy: number; sw: number; sh: number;
  /** Anchor (feet / footprint centre) within the source rect, in source px. */
  ax: number; ay: number;
  /** Source px per screen px at zoom 1. */
  q: number;
}

export interface UnitSheet {
  frames(anim: BakedAnim): number;
  frame(anim: BakedAnim, octant: number, index: number): { sprite: Sprite; mirror: boolean };
  /** On-screen height of the idle sprite at zoom 1 (for picking / bars). */
  height: number;
  has(anim: BakedAnim): boolean;
  /** The underlying sheet images (for GPU pre-upload). */
  sources(): CanvasImageSource[];
}

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
  bakeStatic(build: (b: ModelBuilder) => void, team: TeamColors, shadow = true): Sprite {
    this.ground.visible = shadow;
    const pose: Pose = { anim: 'idle', phase: 0, team, armed: true, cargo: null };
    const { r, h } = this.measure((b) => build(b), team, [pose]);
    const ext = this.extent(r, h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((ext.left + ext.right) * this.q);
    canvas.height = Math.ceil((ext.top + ext.bottom) * this.q);
    this.clearStage();
    build(new Builder(team, this.stage));
    this.shoot(ext, canvas.getContext('2d')!, 0, 0, r, h);
    this.ground.visible = true;
    return { img: canvas, sx: 0, sy: 0, sw: canvas.width, sh: canvas.height, ax: ext.left * this.q, ay: ext.top * this.q, q: this.q };
  }

  /** Bake every animation × facing for a unit. Yields between rows so the page stays responsive. */
  async bakeUnit(spec: UnitSpec, team: TeamColors, withCarry: boolean, onFrame?: () => void): Promise<UnitSheet> {
    const anims: BakedAnim[] = spec.dummy ? ['idle', 'die'] : ['idle', 'walk', 'attack', 'gather', 'eat', 'tired', 'die'];
    if (withCarry && !spec.dummy) anims.push('carryFood', 'carryWood', 'carryCrystal');
    const poseFor = (anim: BakedAnim, phase: number): Pose => ({
      anim: anim === 'carryFood' || anim === 'carryWood' || anim === 'carryCrystal' ? 'walk' : anim,
      phase, team, armed: true,
      cargo: anim === 'carryFood' ? 'food' : anim === 'carryWood' ? 'wood' : anim === 'carryCrystal' ? 'crystal' : null,
    });
    const samples = [poseFor('idle', 0), poseFor('walk', 0.25), poseFor('attack', 0.3), poseFor('attack', 0.6), poseFor('gather', 0.5)];
    if (withCarry) samples.push(poseFor('carryFood', 0.25));
    let { r, h } = this.measure(spec.model, team, samples);
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
    type Crop = { src: HTMLCanvasElement; x: number; y: number; w: number; h: number; ax: number; ay: number; dx: number; dy: number };
    const crops = new Map<BakedAnim, Crop[]>();
    this.aim(ext, r, h);
    for (const anim of anims) {
      const n = FRAMES[anim];
      const grid = document.createElement('canvas');
      grid.width = fw * n;
      grid.height = fh * rows;
      const ctx = grid.getContext('2d', { willReadFrequently: true })!;
      this.setCanvas(cw * n, chh * rows);
      this.renderer.setScissorTest(true);
      for (let di = 0; di < rows; di++) {
        const theta = (BAKED_DIRS[di] * Math.PI) / 4;
        for (let f = 0; f < n; f++) {
          const phase = anim === 'die' ? f / (n - 1) : f / n;
          this.clearStage();
          const body = new THREE.Group();
          this.stage.add(body);
          spec.model(new Builder(team, body), poseFor(anim === 'die' ? 'idle' : anim, anim === 'die' ? 0 : phase));
          if (anim === 'die') {
            // generic topple onto the left side
            const k = phase * phase;
            body.rotation.x = k * 1.5;
            body.position.y = -0.04 * k;
          }
          this.stage.rotation.y = -theta;
          const vy = (rows - 1 - di) * chh; // GL viewports start bottom-left
          this.renderer.setViewport(f * cw, vy, cw, chh);
          this.renderer.setScissor(f * cw, vy, cw, chh);
          this.renderer.render(this.scene, this.camera);
          onFrame?.();
        }
      }
      this.renderer.setScissorTest(false);
      ctx.drawImage(this.renderer.domElement, 0, 0, cw * n, chh * rows, 0, 0, fw * n, fh * rows);
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

    // shelf-pack all crops, tallest first
    const all = [...crops.values()].flat();
    const MAXW = 2048, PAD = 2;
    let cx = 0, cy = 0, shelf = 0, width = 0;
    for (const c of [...all].sort((a, b) => b.h - a.h)) {
      if (cx + c.w > MAXW) { cx = 0; cy += shelf + PAD; shelf = 0; }
      c.dx = cx; c.dy = cy;
      cx += c.w + PAD;
      shelf = Math.max(shelf, c.h);
      width = Math.max(width, cx);
    }
    const atlas = document.createElement('canvas');
    atlas.width = Math.max(1, width);
    atlas.height = Math.max(1, cy + shelf);
    const actx = atlas.getContext('2d')!;
    for (const c of all) actx.drawImage(c.src, c.x, c.y, c.w, c.h, c.dx, c.dy, c.w, c.h);
    // GPU-resident bitmap: plain canvases get re-uploaded on every draw
    const img = await createImageBitmap(atlas);
    const q = this.q;
    const frames = new Map<BakedAnim, Sprite[]>();
    for (const [anim, list] of crops) frames.set(anim, list.map((c) => ({ img, sx: c.dx, sy: c.dy, sw: c.w, sh: c.h, ax: c.ax, ay: c.ay, q })));

    return {
      height: (h * Math.cos(Math.PI / 6)) * PX_PER_UNIT,
      has: (a) => frames.has(a),
      sources: () => [img],
      frames: (a) => (frames.has(a) ? FRAMES[a] : FRAMES.idle),
      frame(anim, octant, index) {
        const a = frames.has(anim) ? anim : 'idle';
        const row = ((octant % 8) + 8) % 8;
        const n = FRAMES[a];
        const i = ((index % n) + n) % n;
        return { sprite: frames.get(a)![row * n + i], mirror: false };
      },
    };
  }

  /** Frames this unit will need, for progress bars. */
  static frameCount(spec: UnitSpec, withCarry: boolean): number {
    if (spec.dummy) return (FRAMES.idle + FRAMES.die) * BAKED_DIRS.length;
    let n = FRAMES.idle + FRAMES.walk + FRAMES.attack + FRAMES.gather + FRAMES.eat + FRAMES.tired + FRAMES.die;
    if (withCarry) n += FRAMES.carryFood + FRAMES.carryWood + FRAMES.carryCrystal;
    return n * BAKED_DIRS.length;
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
