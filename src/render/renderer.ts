// Draws the world with WebGL (PixiJS) from pre-baked sprites. Sprites persist
// between frames and are batched by the GPU, so thousands of trees and units
// stay cheap. Reads simulation state, never writes it.
import { Application, Container, ImageSource, Matrix, Rectangle, Sprite as PixiSprite, Text, Texture, type TextureSource } from 'pixi.js';
import { type Building, type Order, type ResourceNode, type Unit, type World, type WorldEvent } from '../sim/world';
import { Camera, isoX, isoY, TILE_H, TILE_W } from './camera';
import { isUnderfoot, parcelPos } from '../sim/abilities/underfoot';
import { buildingSprite, unitSprite, type ArtAnim, type Sprite } from '../art/contract';
import { TEAM_COLORS, type ArtBank } from './artbank';
import { paintTerrain, TERRAIN_SCALE } from './terrain';

export { TEAM_COLORS };

interface Effect {
  kind: 'text' | 'spark' | 'corpse';
  x: number; y: number; t: number; life: number;
  text?: string;
  owner?: number; specId?: string; heading?: number;
  sprite?: PixiSprite; label?: Text;
}

export interface RenderState {
  selected: Set<number>;
  hoverId: number;
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  ping: { x: number; y: number; t: number; color: string } | null;
  /** Building placement preview. */
  /** Placement preview; `line` is the tiles of a dragged line of one-tile pieces (walls, canals, roads). */
  ghost: { specId: string; ox: number; oy: number; size: number; ok: boolean; line?: Array<[number, number, boolean]> } | null;
}

export interface RenderOptions {
  /** Float damage numbers (handy on the proving grounds). */
  damageNumbers: boolean;
}

/** Which animation a unit is showing, and how far into it (seconds for loops, progress for one-shots). */
export function unitFrame(u: Unit): { anim: ArtAnim; time?: number; progress?: number } {
  switch (u.anim) {
    case 'fly': return { anim: 'fly', time: u.animT };
    case 'leap': case 'climb': case 'soar': case 'glide': case 'land': return { anim: u.anim, time: u.animT };
    case 'walk': {
      const most = Math.max(u.food, u.wood, u.crystal); // what the cargo pack mostly holds
      const anim: ArtAnim = most <= 0.5 ? 'walk' : most === u.food ? 'carryFood' : most === u.wood ? 'carryWood' : 'carryCrystal';
      // a bounding gait plays the walk by stride, in step with the sim; otherwise stride rate follows speed
      if (u.stats.gait) return { anim, progress: u.stride }; // sim/abilities/gait.ts
      return { anim, time: u.animT * Math.max(0.5, u.stats.speed) / 1.7 };
    }
    case 'charge': // flat out: the legs turn over as fast as it's going
      if (u.stats.gait) return { anim: 'charge', progress: u.stride };
      return { anim: 'charge', time: (u.animT * Math.hypot(u.vx, u.vy)) / 1.7 };
    case 'attack': {
      const dur = Math.min(0.45, u.stats.cooldown * 0.8);
      return { anim: 'attack', progress: 1 - u.swing / dur };
    }
    case 'cut': { // its sidearm's blow (sim/abilities/sidearm.ts)
      const dur = Math.min(0.45, (u.stats.sidearm?.cooldown ?? u.stats.cooldown) * 0.8);
      return { anim: 'cut', progress: 1 - u.swing / dur };
    }
    default: return { anim: u.anim, time: u.animT };
  }
}

const hexNum = (c: string) => parseInt(c.slice(1), 16);

/**
 * Reusable sprites for per-frame overlays (bars, rings, shadows). Rebuilding
 * vector Graphics every frame is expensive in Pixi; recycling sprites is not.
 */
class Pool {
  private items: PixiSprite[] = [];
  private used = 0;
  constructor(readonly layer: Container) {}
  begin(): void { this.used = 0; }
  get(tex: Texture): PixiSprite {
    let s = this.items[this.used];
    if (!s) { s = new PixiSprite(); this.layer.addChild(s); this.items.push(s); }
    this.used++;
    s.texture = tex;
    s.visible = true;
    s.rotation = 0;
    return s;
  }
  end(): void { for (let i = this.used; i < this.items.length; i++) this.items[i].visible = false; }
}

function shapeTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 128): Texture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  return Texture.from(c);
}

/** Pixels from a flier's altitude to the middle of its body: where bombs leave and anti-air throws arrive. */
const AIR_BODY_PX = 30;

export class Renderer {
  readonly cam = new Camera();
  private app = new Application();
  private terrainCanvas: HTMLCanvasElement | null;
  private effects: Effect[] = [];
  private time = 0;

  private worldLayer = new Container();
  private ground = new Container();
  private groundLayer = new Container({ isRenderGroup: true });
  private trees = new Container({ isRenderGroup: true });
  private corpses = new Container();
  private objects = new Container({ isRenderGroup: true });
  private air = new Container();
  private screenLayer = new Container({ isRenderGroup: true });
  private groundPool = new Pool(this.groundLayer);
  /** "Needs supplies" flags planted by buildings whose orders wait on stock. */
  private wantPool = new Pool(this.objects);
  private parcelPool = new Pool(this.objects);
  private fxLayer = new Container({ isRenderGroup: true });
  private fxPool = new Pool(this.fxLayer);
  /** Smoke and flame puffs rising from damaged buildings (world iso coords). */
  private puffs: Array<{ x: number; y: number; t: number; life: number; fire: boolean; drift: number; size: number }> = [];
  private screenPool = new Pool(this.screenLayer);
  private ringTex!: Texture;
  private discTex!: Texture;
  private diamondTex!: Texture;
  private texts = new Container();

  private sources = new Map<CanvasImageSource, TextureSource>();
  private textures = new Map<TextureSource, Map<string, Texture>>();
  private nodeSprites = new Map<number, PixiSprite>();
  private unitSprites = new Map<number, PixiSprite>();
  private buildingSprites = new Map<number, PixiSprite>();
  private projSprites = new Map<number, PixiSprite>();
  private flagSprite: PixiSprite | null = null;
  private ghostSprite: PixiSprite | null = null;
  private textPool: Text[] = [];

  /** Whose fog of war to show; -1 (spectating) shows everything. */
  viewer = -1;
  /** How far each flier is off the ground (0 landed … 1 at flying height), eased. */
  private alt = new Map<number, number>();
  private dt = 0;
  /** Screen px a flier is drawn above the ground at full height (zoom 1). */
  static readonly FLY_PX = 56;
  /** Px above the ground unit `id` is drawn at (zoom 1). */
  /** Pixels a flier is drawn above its ground spot (at zoom 1). */
  lift(id: number): number { return this.alt.get(id) ?? 0; }
  /** Screen height for an altitude in metres: 6 px per metre (108 px at 18 m). */
  static altPx(m: number): number { return Math.max(0, m) * 6; }
  private fog: { canvas: HTMLCanvasElement; img: ImageData; tex: Texture; sprite: PixiSprite; tick: number } | null = null;

  /** Can the viewer see this spot right now? (Their own things always.) */
  seen(owner: number, x: number, y: number): boolean {
    return this.viewer < 0 || owner === this.viewer || this.world.vision(this.viewer, x, y) === 2;
  }

  /** Has the viewer ever seen this spot? */
  explored(x: number, y: number): boolean {
    return this.viewer < 0 || this.world.vision(this.viewer, x, y) > 0;
  }

  /** Black over ground never seen, a dim veil over ground out of sight. One pixel per tile, laid on the iso grid. */
  private drawFog(): void {
    if (this.viewer < 0) return;
    const { grid } = this.world;
    if (!this.fog) {
      const canvas = document.createElement('canvas');
      canvas.width = grid.width; canvas.height = grid.height;
      const img = canvas.getContext('2d')!.createImageData(grid.width, grid.height);
      const tex = Texture.from(canvas);
      const sprite = new PixiSprite(tex);
      sprite.setFromMatrix(new Matrix(TILE_W / 2, TILE_H / 2, -TILE_W / 2, TILE_H / 2, 0, 0));
      this.worldLayer.addChild(sprite);
      this.fog = { canvas, img, tex, sprite, tick: -1 };
    }
    const f = this.fog;
    if (f.tick === this.world.tick) return;
    f.tick = this.world.tick;
    const d = f.img.data;
    for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
      const v = this.world.vision(this.viewer, x, y), i = (y * grid.width + x) * 4;
      d[i] = 6; d[i + 1] = 8; d[i + 2] = 10;
      d[i + 3] = v === 2 ? 0 : v === 1 ? 120 : 255;
    }
    f.canvas.getContext('2d')!.putImageData(f.img, 0, 0);
    f.tex.source.update();
  }

  constructor(private canvas: HTMLCanvasElement, private world: World, readonly bank: ArtBank, private opts: RenderOptions, extraDirt: Array<[number, number, number]> = []) {
    this.terrainCanvas = paintTerrain(world, extraDirt, { biomes: bank.biomes, homes: world.homes });
  }

  async init(): Promise<void> {
    try {
      await this.app.init({
        canvas: this.canvas, preference: 'webgl', background: '#000000', antialias: false,
        failIfMajorPerformanceCaveat: false, // a software-rendered WebGL still plays
        // sprites are baked at ≤2× so rendering finer than that only costs fill rate
        autoStart: false, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1),
        width: window.innerWidth, height: window.innerHeight,
      });
    } catch (e) {
      // no WebGL (or WebGPU) for this page: say so, rather than sit on the loading screen
      const loading = document.getElementById('loading');
      const label = loading?.querySelector<HTMLElement>('.label');
      if (label) label.textContent = 'Your browser gave the game no WebGL. Reload the page; if that fails, restart the browser, or turn on hardware acceleration in its settings.';
      throw e;
    }
    this.app.stage.addChild(this.worldLayer, this.screenLayer, this.texts);
    this.objects.sortableChildren = true;
    this.trees.sortableChildren = true;
    // Trees live in their own cached layer: they never move, so Pixi never has to
    // re-sort or rebuild them. (Units behind a tree draw over it, AoE-style.)
    this.worldLayer.addChild(this.ground, this.groundLayer, this.corpses, this.trees, this.objects, this.air, this.fxLayer);
    this.ringTex = shapeTexture((c, w, h) => { c.strokeStyle = '#fff'; c.lineWidth = 7; c.beginPath(); c.ellipse(w / 2, h / 2, w / 2 - 5, h / 2 - 5, 0, 0, Math.PI * 2); c.stroke(); });
    this.discTex = shapeTexture((c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.7, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.setTransform(1, 0, 0, h / w, 0, 0); c.fillStyle = g; c.fillRect(0, 0, w, w);
    });
    this.diamondTex = shapeTexture((c, w, h) => { c.strokeStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.moveTo(w / 2, 3); c.lineTo(w - 4, h / 2); c.lineTo(w / 2, h - 3); c.lineTo(4, h / 2); c.closePath(); c.stroke(); });
    // terrain → chunked textures
    const t = this.terrainCanvas!;
    const C = 1024;
    const H = this.world.grid.height;
    for (let y = 0; y < t.height; y += C) for (let x = 0; x < t.width; x += C) {
      const w = Math.min(C, t.width - x), h = Math.min(C, t.height - y);
      const bmp = await createImageBitmap(t, x, y, w, h);
      const s = new PixiSprite(new Texture({ source: new ImageSource({ resource: bmp, autoGenerateMipmaps: true, scaleMode: 'linear' }) }));
      s.position.set(x / TERRAIN_SCALE - H * 32, y / TERRAIN_SCALE);
      s.scale.set(1 / TERRAIN_SCALE);
      this.ground.addChild(s);
    }
    this.terrainCanvas = null;
    // Upload every sprite sheet now, so the first swing or death of each unit
    // doesn't hitch mid-battle while its sheet goes to the GPU.
    for (const img of this.bank.allImages()) this.app.renderer.texture.initSource(this.source(img));
  }

  private source(img: CanvasImageSource): TextureSource {
    let src = this.sources.get(img);
    if (!src) {
      src = new ImageSource({ resource: img as ImageBitmap, autoGenerateMipmaps: true, scaleMode: 'linear' });
      this.sources.set(img, src);
      this.textures.set(src, new Map());
    }
    return src;
  }

  resize(w: number, h: number, _dpr: number): void {
    this.app.renderer.resize(w, h);
    this.cam.width = w;
    this.cam.height = h;
  }

  private texture(s: Sprite): Texture {
    const src = this.source(s.img);
    const cache = this.textures.get(src)!;
    const key = `${s.sx},${s.sy}`;
    let t = cache.get(key);
    if (!t) cache.set(key, (t = new Texture({ source: src, frame: new Rectangle(s.sx, s.sy, s.sw, s.sh) })));
    return t;
  }

  /** Point a pixi sprite at a baked frame, anchored at the frame's foot point. */
  private setFrame(p: PixiSprite, s: Sprite): void {
    const t = this.texture(s);
    if (p.texture !== t) {
      p.texture = t;
      p.anchor.set(s.ax / s.sw, s.ay / s.sh);
      p.scale.set(1 / s.q);
    }
  }

  consumeEvents(events: WorldEvent[]): void {
    for (const e of events) {
      if (e.type === 'hit') {
        if (this.opts.damageNumbers) this.effects.push({ kind: 'text', x: e.x, y: e.y, t: 0, life: 1.1, text: `${Math.round(e.damage)}` });
        this.effects.push({ kind: 'spark', x: e.x, y: e.y, t: 0, life: 0.35 });
      } else if (e.type === 'death') {
        this.effects.push({ kind: 'corpse', x: e.x, y: e.y, t: 0, life: 7, owner: e.owner, specId: e.specId, heading: e.heading });
      }
    }
  }

  // ───────────────────────────── frame ─────────────────────────────

  draw(alpha: number, dt: number, rs: RenderState): void {
    this.time += dt;
    this.dt = dt;
    const { cam } = this;
    const z = cam.zoom;
    this.worldLayer.scale.set(z);
    this.worldLayer.position.set(cam.width / 2 - cam.cx * z, cam.height / 2 - cam.cy * z);

    this.syncNodes();
    this.syncBuildings();
    this.syncUnits(alpha);
    this.syncProjectiles(alpha);
    this.drawGround(alpha, dt, rs);
    this.drawFire(dt);
    this.drawEffects(dt);
    this.drawFog();
    this.drawScreen(alpha, rs);
    this.app.render();
  }

  private syncNodes(): void {
    const seen = this.nodeSprites;
    for (const n of this.world.nodes.values()) {
      let sp = seen.get(n.id);
      if (!sp) {
        sp = new PixiSprite();
        sp.position.set(isoX(n.x, n.y), isoY(n.x, n.y));
        sp.zIndex = n.x + n.y;
        (n.tree ? this.trees : this.objects).addChild(sp);
        seen.set(n.id, sp);
        this.setFrame(sp, this.nodeSprite(n));
      }
      sp.visible = this.explored(n.x, n.y); // fog of war: not on the map until found
      if (n.tree) {
        // sown saplings grow into full trees
        if (n.growLeft !== undefined) sp.scale.set((0.35 + 0.65 * Math.min(1, (n.maxAmount - n.growLeft) / n.maxAmount)) / this.nodeSprite(n).q);
        continue;
      }
      this.setFrame(sp, this.nodeSprite(n));
      // sown bushes start as small seedlings and grow to full size
      if (!n.shard && n.growLeft !== undefined) sp.scale.set((0.35 + 0.65 * Math.min(1, (n.maxAmount - n.growLeft) / n.maxAmount)) / this.nodeSprite(n).q);
      if (n.shard) sp.scale.set(Math.min(1.6, 0.6 + Math.cbrt(n.amount) * 0.3) / this.bank.biome.shard.q);
    }
    for (const [id, sp] of seen) if (!this.world.nodes.has(id)) { sp.destroy(); seen.delete(id); }
  }

  private nodeSprite(n: ResourceNode): Sprite {
    if (n.shard) return this.bank.biome.shard;
    const b = this.bank.biomeAt(n.x, n.y); // resources wear the look of the half they're in
    const level = (list: Sprite[]) => list[Math.min(list.length - 1, Math.ceil((n.amount / n.maxAmount) * (list.length - 1)))];
    if (n.tree) return b.trees[n.id % b.trees.length];
    if (n.carcass) return b.carcass ?? level(b.bushes);
    return level(n.type === 'food' ? b.bushes : b.mines);
  }

  private syncBuildings(): void {
    this.wantPool.begin();
    for (const b of this.world.buildings.values()) {
      let sp = this.buildingSprites.get(b.id);
      if (!sp) {
        sp = new PixiSprite();
        const cx = b.ox + b.size / 2, cy = b.oy + b.size / 2;
        sp.position.set(isoX(cx, cy), isoY(cx, cy));
        sp.zIndex = b.ox + b.oy + b.size;
        // underfoot pieces (sim/abilities/underfoot.ts) lie on the ground, under everyone
        (isUnderfoot(b.spec) ? this.ground : this.objects).addChild(sp);
        this.buildingSprites.set(b.id, sp);
      }
      // the faction supplies the looks; we pick construction stage / damage level
      const art = this.bank.building(b.owner, b.specId);
      if (art) {
        const look = buildingSprite(art, b.complete, b.built / b.stats.totalCost, b.hp, b.maxHp);
        this.setFrame(sp, look);
        // a living building (sim/abilities/living.ts) swells as it grows
        if (b.grown !== undefined && b.complete) sp.scale.set((0.6 + 0.4 * Math.min(1, b.grown / b.spec.materials)) / look.q);
      }
      sp.tint = b.complete && b.spec.attack && b.stock.crystal < b.spec.attack.crystalMass ? 0x808080 : 0xffffff; // tower out of ammo
      sp.visible = b.owner === this.viewer || this.explored(b.ox + b.size / 2, b.oy + b.size / 2); // once found, a building stays on the map
      // your building waiting on supplies plants its faction's "needs supplies" flag at its corner
      if (b.owner === 0 && b.complete && b.queue.length && !b.queue[0].paid) {
        const s = this.bank.wantFlag(b.owner);
        const f = this.wantPool.get(this.texture(s));
        f.anchor.set(s.ax / s.sw, s.ay / s.sh);
        f.scale.set(1.35 / s.q); // a little larger than life, so it reads
        const x = b.ox + b.size + 0.1, y = b.oy - 0.1; // the right-hand corner
        f.position.set(isoX(x, y), isoY(x, y) - Math.abs(Math.sin(this.time * 3 + b.id)) * 3);
        f.zIndex = b.ox + b.oy + b.size + 0.5;
      }
    }
    this.wantPool.end();
    for (const [id, sp] of this.buildingSprites) if (!this.world.buildings.has(id)) { sp.destroy(); this.buildingSprites.delete(id); }
  }

  private syncUnits(alpha: number): void {
    for (const u of this.world.units.values()) {
      let sp = this.unitSprites.get(u.id);
      if (!sp) {
        sp = new PixiSprite();
        this.objects.addChild(sp);
        this.unitSprites.set(u.id, sp);
      }
      const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
      // fliers (sim/abilities/flight.ts) leap into the air on take-off, overshoot a little
      // and settle at height on a spring; they glide down to land
      if (u.stats.flight) {
        // drawn at its real altitude (sim/abilities/flight.ts), smoothed between ticks
        const a0 = this.alt.get(u.id) ?? 0, target = u.airborne ? Renderer.altPx(u.alt) : 0;
        this.alt.set(u.id, a0 + (target - a0) * Math.min(1, this.dt * 5));
      }
      sp.position.set(isoX(x, y), isoY(x, y) - this.lift(u.id));
      sp.zIndex = x + y + (u.airborne ? 2 : 0);
      const art = this.bank.unit(u.owner, u.specId);
      if (art) {
        // a bird still off the ground (taking off, gliding in to land) keeps its wings spread
        const f = u.stats.flight && !u.airborne && this.lift(u.id) > 6 ? { anim: 'fly' as const, time: this.time } : unitFrame(u);
        this.setFrame(sp, unitSprite(art, f.anim, u.heading, f));
      }
      // no crystal to fight with: visibly greyed out
      const disarmed = !u.dummy && !u.carter && !this.world.armed(u) && u.specId !== this.world.factionOf(u.owner).workerId;
      sp.tint = disarmed ? 0x707070 : 0xffffff;
      sp.visible = this.seen(u.owner, u.x, u.y); // fog of war
    }
    for (const [id, sp] of this.unitSprites) if (!this.world.units.has(id)) { sp.destroy(); this.unitSprites.delete(id); this.alt.delete(id); }
  }

  private syncProjectiles(alpha: number): void {
    for (const p of this.world.projectiles.values()) {
      let sp = this.projSprites.get(p.id);
      if (!sp) {
        sp = new PixiSprite();
        this.setFrame(sp, this.bank.biome.projectile);
        sp.scale.set((0.55 + Math.cbrt(p.crystalKg) * 0.35) / this.bank.biome.projectile.q);
        this.air.addChild(sp);
        this.projSprites.set(p.id, sp);
      }
      const t = Math.min(1, (p.t + alpha / 20) / p.duration);
      const x = p.sx + (p.tx - p.sx) * t, y = p.sy + (p.ty - p.sy) * t;
      const dist = Math.hypot(p.tx - p.sx, p.ty - p.sy);
      // a bomb falls from the bird (accelerating); a throw arcs; a tower's shot starts up its stilts
      // thrown at a flier: the arc ends up at the bird (its altitude, plus half its body)
      // (its path is fixed when it leaves the hand: up to where the thrower aimed, the bird's body there)
      const end = p.tz === undefined ? 0 : Renderer.altPx(p.tz) + AIR_BODY_PX;
      const h = p.drop ? (Renderer.altPx(p.sz) + AIR_BODY_PX) * (1 - t * t) : (10 + dist * 6) * 4 * t * (1 - t) + (26 + p.sz * 16) * (1 - t) + end * t;
      sp.position.set(isoX(x, y), isoY(x, y) - h);
      sp.rotation = this.time * 14 + p.id;
      sp.visible = this.seen(p.owner, x, y);
    }
    for (const [id, sp] of this.projSprites) if (!this.world.projectiles.has(id)) { sp.destroy(); this.projSprites.delete(id); }
    // goods riding conveyor belts: little crates, tinted by what's in them
    this.parcelPool.begin();
    for (const p of this.world.parcels) {
      const [x, y] = parcelPos(this.world, p);
      if (!this.seen(p.owner, x, y)) continue;
      const s = this.parcelPool.get(Texture.WHITE);
      s.anchor.set(0.5, 1);
      s.width = 9; s.height = 7;
      s.tint = p.res === 'food' ? 0xc0392b : p.res === 'wood' ? 0x8a5a2e : 0x7ae7ff;
      s.position.set(isoX(x, y), isoY(x, y) - 2);
      s.zIndex = x + y;
    }
    this.parcelPool.end();
  }

  /** Damaged buildings smoke; badly damaged ones burn. */
  private drawFire(dt: number): void {
    for (const b of this.world.buildings.values()) {
      if (!b.complete) continue;
      const hurt = 1 - b.hp / b.maxHp;
      if (hurt < 0.34) continue;
      const rate = (hurt > 0.66 ? 9 : 3) * b.size * dt; // puffs this frame
      for (let n = rate + Math.random(); n >= 1; n--) {
        const px = b.ox + 0.3 + Math.random() * (b.size - 0.6), py = b.oy + 0.3 + Math.random() * (b.size - 0.6);
        const fire = hurt > 0.66 && Math.random() < 0.4;
        this.puffs.push({ x: isoX(px, py), y: isoY(px, py) - 30 - Math.random() * 40 * b.size, t: 0, life: fire ? 0.6 : 2.6, fire, drift: 6 + Math.random() * 10, size: fire ? 5 : 8 + Math.random() * 6 });
      }
    }
    const P = this.fxPool;
    P.begin();
    this.puffs = this.puffs.filter((p) => (p.t += dt) < p.life);
    for (const p of this.puffs) {
      const k = p.t / p.life;
      const s = P.get(this.discTex);
      s.anchor.set(0.5);
      s.position.set(p.x + p.drift * k * 2, p.y - k * (p.fire ? 18 : 60));
      const r = p.size * (p.fire ? 1 - k * 0.5 : 1 + k * 2.2);
      s.width = r * 2; s.height = r * 1.6;
      s.tint = p.fire ? (k < 0.4 ? 0xffd27a : 0xff6a2a) : 0x3a3530;
      s.alpha = p.fire ? 0.9 * (1 - k) : 0.45 * (1 - k) * Math.min(1, k * 5);
    }
    P.end();
  }

  /** Selection rings, order pings, rally flag, projectile shadows — all on the ground plane. */
  private drawGround(alpha: number, dt: number, rs: RenderState): void {
    const P = this.groundPool;
    const w = this.world;
    P.begin();
    const ellipse = (tex: Texture, x: number, y: number, rx: number, ry: number, color: number, a: number) => {
      const s = P.get(tex);
      s.anchor.set(0.5);
      s.position.set(x, y);
      s.width = rx * 2; s.height = ry * 2;
      s.tint = color; s.alpha = a;
    };
    const ring = (x: number, y: number, r: number, color: number, a: number) => {
      const rx = Math.max(9, r * 64 * 0.75);
      ellipse(this.ringTex, isoX(x, y), isoY(x, y), rx, rx * 0.5, color, a);
    };
    let rally: Building | null = null;
    for (const id of rs.selected) {
      const u = w.units.get(id);
      if (u) {
        const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
        ring(x, y, u.stats.radius, u.owner === 0 ? 0xffffff : 0xff7864, 0.9);
      }
      const b = w.buildings.get(id);
      if (b) {
        const cx = b.ox + b.size / 2, cy = b.oy + b.size / 2;
        ellipse(this.diamondTex, isoX(cx, cy), isoY(cx, cy), b.size * 32, b.size * 16, 0xffffff, 0.85);
        // infrastructure reach
        const reach = Math.max(b.spec.gatherBoost?.radius ?? 0, b.spec.sow?.radius ?? 0);
        if (reach) ellipse(this.ringTex, isoX(cx, cy), isoY(cx, cy), (reach + b.size / 2) * 45.25, (reach + b.size / 2) * 22.6, 0xa8e070, 0.6);
        if (b.owner === 0) rally = b;
      }
    }
    // where your selected units are headed: a dotted path through the current order and everything queued after it
    const stop = (o: Order): [number, number, number] | null => {
      const ent = (id: number): [number, number] | null => {
        const t = w.units.get(id); if (t) return [t.x, t.y];
        const b = w.buildings.get(id); if (b) return [b.ox + b.size / 2, b.oy + b.size / 2];
        const n = w.nodes.get(id); return n ? [n.x, n.y] : null;
      };
      let p: [number, number] | null = null, color = 0xffffff;
      switch (o.kind) {
        case 'move': p = [o.x, o.y]; break;
        case 'attackMove': p = [o.x, o.y]; color = 0xff6b5a; break;
        case 'attack': p = ent(o.target); color = 0xff6b5a; break;
        case 'gather': p = ent(o.node); color = 0xe0457a; break;
        case 'build': p = ent(o.site); color = 0x7aff7a; break;
        case 'resupply': p = ent(o.building); color = 0xffd23f; break;
        case 'hunt': p = ent(o.target); color = 0xe0457a; break;
        default: return null;
      }
      return p ? [p[0], p[1], color] : null;
    };
    let shown = 0;
    for (const id of rs.selected) {
      const u = w.units.get(id);
      if (!u || u.owner !== 0 || shown++ > 40) continue;
      let fx = u.px + (u.x - u.px) * alpha, fy = u.py + (u.y - u.py) * alpha;
      for (const o of [u.order, ...u.queue]) {
        const s = stop(o);
        if (!s) continue;
        const [tx, ty, color] = s, d = Math.hypot(tx - fx, ty - fy);
        for (let k = 0.5; k < d; k += 0.5) { const x = fx + ((tx - fx) * k) / d, y = fy + ((ty - fy) * k) / d; ellipse(this.discTex, isoX(x, y), isoY(x, y), 2.2, 1.1, color, 0.55); }
        ellipse(this.ringTex, isoX(tx, ty), isoY(tx, ty), 9, 4.5, color, 0.85);
        fx = tx; fy = ty;
      }
    }
    if (rs.hoverId && !rs.selected.has(rs.hoverId)) {
      const u = w.units.get(rs.hoverId);
      if (u) ring(u.x, u.y, u.stats.radius, 0xffffff, 0.4);
    }
    if (rs.ping) {
      const p = rs.ping;
      p.t += dt;
      if (p.t > 0.6) rs.ping = null;
      else for (const k of [1, 0.55]) ellipse(this.ringTex, isoX(p.x, p.y), isoY(p.x, p.y), (14 - p.t * 12) * k, (7 - p.t * 6) * k, hexNum(p.color), 1 - p.t / 0.6);
    }
    for (const p of w.projectiles.values()) {
      const t = Math.min(1, (p.t + alpha / 20) / p.duration);
      const x = p.sx + (p.tx - p.sx) * t, y = p.sy + (p.ty - p.sy) * t;
      ellipse(this.discTex, isoX(x, y), isoY(x, y), 4, 2, 0x000000, 0.35);
    }
    const gh = rs.ghost;
    if (gh) {
      for (const [x, y, ok] of gh.line ?? []) ellipse(this.diamondTex, isoX(x + 0.5, y + 0.5), isoY(x + 0.5, y + 0.5), 32, 16, ok ? 0x7aff7a : 0xff5a4a, 0.8);
      const cx = gh.ox + gh.size / 2, cy = gh.oy + gh.size / 2;
      ellipse(this.diamondTex, isoX(cx, cy), isoY(cx, cy), gh.size * 32, gh.size * 16, gh.ok ? 0x7aff7a : 0xff5a4a, 0.95);
      const gs = this.world.buildingSpecOf(0, gh.specId);
      const reach = Math.max(gs?.gatherBoost?.radius ?? 0, gs?.sow?.radius ?? 0);
      if (reach) ellipse(this.ringTex, isoX(cx, cy), isoY(cx, cy), (reach + gh.size / 2) * 45.25, (reach + gh.size / 2) * 22.6, 0xa8e070, 0.6);
      const art = this.bank.building(0, gh.specId)?.complete;
      if (art) {
        if (!this.ghostSprite) { this.ghostSprite = new PixiSprite(); this.objects.addChild(this.ghostSprite); }
        this.setFrame(this.ghostSprite, art);
        this.ghostSprite.position.set(isoX(cx, cy), isoY(cx, cy));
        this.ghostSprite.zIndex = gh.ox + gh.oy + gh.size;
        this.ghostSprite.alpha = 0.55;
        this.ghostSprite.tint = gh.ok ? 0xc8ffc8 : 0xff9a8a;
        this.ghostSprite.visible = true;
      }
    } else if (this.ghostSprite) this.ghostSprite.visible = false;
    // fliers' shadows on the ground below them
    for (const u of w.units.values()) {
      const lift = this.lift(u.id);
      if (lift < 2 || !this.seen(u.owner, u.x, u.y)) continue;
      const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
      const r = u.stats.radius * 40 * Math.max(0.45, 1 - lift / Renderer.FLY_PX * 0.3);
      ellipse(this.discTex, isoX(x, y), isoY(x, y), r, r * 0.5, 0x000000, 0.3);
    }
    P.end();
    // rally flag
    if (rally) {
      if (!this.flagSprite) { this.flagSprite = new PixiSprite(); this.objects.addChild(this.flagSprite); }
      this.setFrame(this.flagSprite, this.bank.flag(rally.owner));
      this.flagSprite.position.set(isoX(rally.rallyX, rally.rallyY), isoY(rally.rallyX, rally.rallyY));
      this.flagSprite.zIndex = rally.rallyX + rally.rallyY;
      this.flagSprite.visible = true;
    } else if (this.flagSprite) this.flagSprite.visible = false;
  }

  /** Health / calorie / ammo bars, sparks and the drag box, in screen space. */
  private drawScreen(alpha: number, rs: RenderState): void {
    const P = this.screenPool;
    const { cam, world } = this;
    P.begin();
    const rect = (x: number, y: number, w: number, h: number, color: number, a = 1) => {
      const s = P.get(Texture.WHITE);
      s.anchor.set(0);
      s.position.set(x, y);
      s.width = w; s.height = h;
      s.tint = color; s.alpha = a;
    };
    const bar = (x: number, y: number, w: number, h: number, frac: number, color: number) => {
      rect(x - 1, y - 1, w + 2, h + 2, 0x000000, 0.8);
      rect(x, y, w, h, 0x5a1a14);
      rect(x, y, w * Math.max(0, Math.min(1, frac)), h, color);
    };
    for (const u of world.units.values()) {
      if (!this.seen(u.owner, u.x, u.y)) continue;
      const sel = rs.selected.has(u.id);
      // your ammo bearers always show how much crystal they have left to hand out
      const bearer = u.owner === 0 && world.isBearer(u); // sim/abilities/bearer.ts
      if (!sel && !bearer && u.hp >= u.stats.maxHp - 0.5 && rs.hoverId !== u.id) continue;
      const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
      const [sx, sy] = cam.toScreen(x, y);
      if (sx < -50 || sy < -50 || sx > cam.width + 50 || sy > cam.height + 200) continue;
      let top = sy - ((this.bank.unit(u.owner, u.specId)?.height ?? 40) + 8 + this.lift(u.id)) * cam.zoom;
      const w = Math.max(20, 24 * Math.cbrt(u.stats.mass / 70)) * Math.min(1.3, cam.zoom);
      const f = u.hp / u.stats.maxHp;
      bar(sx - w / 2, top, w, 3, f, f > 0.5 ? 0x3fcf4a : f > 0.25 ? 0xe8c547 : 0xd9352b);
      if (bearer) { const food = world.bearerRes(u) === 'food'; top += 4; bar(sx - w / 2, top, w, 3, (food ? u.food : u.crystal) / Math.max(1e-6, u.stats.cargoCapacity), food ? 0xe0457a : 0x8fe6ff); }
      if (!sel || u.owner !== 0 || u.dummy) continue;
      top += 4;
      bar(sx - w / 2, top, w, 2, u.cal / u.stats.maxCalories, u.exhausted ? 0x8a7a5a : 0xe09a3a);
      if (u.throws) {
        // ammo: one pip per throw left
        const max = Math.max(1, Math.round(u.stats.loadoutCrystal / u.crystalMass));
        const have = Math.min(max, Math.floor(u.ammo / u.crystalMass + 1e-6));
        const pw = Math.max(2, (w - (max - 1)) / max);
        top += 3;
        rect(sx - w / 2 - 1, top - 1, w + 2, 4, 0x000000, 0.8);
        for (let i = 0; i < max; i++) rect(sx - w / 2 + i * (pw + 1), top, pw, 2, i < have ? 0x8fe6ff : 0x2a3a40);
      }
    }
    for (const b of world.buildings.values()) {
      const sheltering = b.owner === 0 ? b.garrison.length : 0;
      if (!rs.selected.has(b.id) && b.hp >= b.maxHp && !sheltering) continue;
      const [sx, sy] = cam.toScreen(b.ox + b.size / 2, b.oy + b.size / 2);
      const w = 70 * cam.zoom;
      if (sheltering) {
        // who's inside: one gold pip per unit sheltering, above the health bar
        const pw = 5, total = sheltering * (pw + 2) - 2, top = sy - 184 * cam.zoom;
        rect(sx - total / 2 - 2, top - 2, total + 4, pw + 4, 0x000000, 0.75);
        for (let i = 0; i < sheltering; i++) rect(sx - total / 2 + i * (pw + 2), top, pw, pw, 0xffd23f);
      }
      if (!rs.selected.has(b.id) && b.hp >= b.maxHp) continue;
      bar(sx - w / 2, sy - 175 * cam.zoom, w, 4, b.hp / b.maxHp, 0x3fcf4a);
      const item = b.queue[0];
      if (item) bar(sx - w / 2, sy - 169 * cam.zoom, w, 3, item.progress / item.total, 0xd8c27a);
      if (b.spec.attack && b.complete && b.owner === 0) {
        // tower ammo: one pip per throw in stock (up to what it keeps on hand)
        const per = b.spec.attack.crystalMass;
        const max = Math.max(1, Math.round(world.logistics.supplyTargets(b).crystal / per));
        const have = Math.min(max, Math.floor(b.stock.crystal / per + 1e-6));
        const pw = Math.max(2, (w - (max - 1)) / max), top = sy - 175 * cam.zoom + 6;
        rect(sx - w / 2 - 1, top - 1, w + 2, 4, 0x000000, 0.8);
        for (let i = 0; i < max; i++) rect(sx - w / 2 + i * (pw + 1), top, pw, 2, i < have ? 0x8fe6ff : 0x2a3a40);
      }
    }
    for (const e of this.effects) {
      if (e.kind !== 'spark') continue;
      const [sx, sy] = cam.toScreen(e.x, e.y);
      const k = e.t / e.life;
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + e.x * 3;
        const r = (3 + k * 16) * cam.zoom;
        rect(sx + Math.cos(a) * r, sy - 18 * cam.zoom + Math.sin(a) * r * 0.6 + k * k * 10 * cam.zoom, 2 * cam.zoom, 2 * cam.zoom, 0xaaebff, 1 - k);
      }
    }
    if (rs.box) {
      const b = rs.box;
      const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1), w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
      rect(x, y, w, 1, 0xffffff); rect(x, y + h, w, 1, 0xffffff); rect(x, y, 1, h, 0xffffff); rect(x + w, y, 1, h + 1, 0xffffff);
    }
    P.end();
  }

  private drawEffects(dt: number): void {
    const keep: Effect[] = [];
    for (const e of this.effects) {
      e.t += dt;
      if (e.t >= e.life) {
        e.sprite?.destroy();
        if (e.label) { e.label.visible = false; this.textPool.push(e.label); }
        continue;
      }
      keep.push(e);
      if (e.kind === 'corpse') {
        const art = this.bank.unit(e.owner!, e.specId!);
        if (!art) continue;
        if (!e.sprite) {
          e.sprite = new PixiSprite();
          e.sprite.position.set(isoX(e.x, e.y), isoY(e.x, e.y));
          this.corpses.addChild(e.sprite);
        }
        this.setFrame(e.sprite, unitSprite(art, 'die', e.heading!, { progress: Math.min(1, e.t / 0.6) }));
        e.sprite.alpha = e.t > e.life - 2 ? (e.life - e.t) / 2 : 1;
      } else if (e.kind === 'text') {
        if (!e.label) {
          e.label = this.textPool.pop() ?? new Text({ text: '', style: { fontFamily: 'Alegreya Sans, sans-serif', fontWeight: '700', fontSize: 14, fill: 0xf3e6c0, stroke: { color: 0x000000, width: 3 } } });
          if (!e.label.parent) this.texts.addChild(e.label);
          e.label.anchor.set(0.5, 1);
          e.label.text = e.text!;
          e.label.visible = true;
        }
        const [sx, sy] = this.cam.toScreen(e.x, e.y);
        const k = e.t / e.life;
        e.label.position.set(sx, sy - (34 + k * 26) * this.cam.zoom);
        e.label.alpha = Math.min(1, (1 - k) * 2);
      }
    }
    this.effects = keep;
  }

  /** Screen-space hit test. Returns the id of the topmost thing under the cursor. */
  /** `me`: picking a target for orders, so anyone else's unit under the cursor beats player `me`'s next to it. */
  pick(sx: number, sy: number, alpha: number, me = -1): number {
    const { cam, world } = this;
    // of the units whose picture is under the cursor, the one whose body is closest to it
    // (so you can pick a particular unit out of a crowd)
    let best = 0, bestD = Infinity;
    for (const u of world.units.values()) {
      if (!this.seen(u.owner, u.x, u.y)) continue;
      const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
      const [ux, uy0] = cam.toScreen(x, y);
      const uy = uy0 - this.lift(u.id) * cam.zoom; // fliers are up in the air
      const h = (this.bank.unit(u.owner, u.specId)?.height ?? 40) * cam.zoom;
      const w = Math.max(10, Math.min(h * 0.45, 40 * cam.zoom));
      if (Math.abs(sx - ux) >= w || sy >= uy + 6 || sy <= uy - h - 4) continue;
      const cy = uy - h * 0.45;
      const d = ((sx - ux) / w) ** 2 + ((sy - cy) / (h * 0.55)) ** 2 + (u.owner === me ? 10 : 0);
      if (d < bestD) { best = u.id; bestD = d; }
    }
    if (best) return best;
    const [wx, wy] = cam.toWorld(sx, sy);
    // a building's own footprint wins; the rest of its picture only if no bush or tree is under the cursor
    let byPicture = 0, under = 0;
    for (const b of world.buildings.values()) {
      if (b.owner !== this.viewer && !this.explored(b.ox + b.size / 2, b.oy + b.size / 2)) continue;
      if (isUnderfoot(b.spec)) { if (wx >= b.ox && wx < b.ox + 1 && wy >= b.oy && wy < b.oy + 1) under = b.id; continue; } // last resort: it's flat on the ground
      if (wx >= b.ox && wx <= b.ox + b.size && wy >= b.oy && wy <= b.oy + b.size) return b.id;
      const [mx, my] = cam.toScreen(b.ox + b.size / 2, b.oy + b.size / 2);
      const half = (16 + 22 * b.size) * cam.zoom; // picture width grows with footprint
      if (!byPicture && Math.abs(sx - mx) < half && sy < my + 10 && sy > my - (40 + 35 * b.size) * cam.zoom) byPicture = b.id;
    }
    let tree = 0, treeDepth = -Infinity;
    for (const n of world.nodes.values()) {
      if (!this.explored(n.x, n.y)) continue;
      const [nx, ny] = cam.toScreen(n.x, n.y);
      if (n.tree) {
        // trunk-ish region; the frontmost tree under the cursor wins
        if (Math.abs(sx - nx) < 16 * cam.zoom && sy < ny + 6 * cam.zoom && sy > ny - 60 * cam.zoom && n.x + n.y > treeDepth) { tree = n.id; treeDepth = n.x + n.y; }
        continue;
      }
      const r = (n.shard ? 14 : 26) * cam.zoom;
      if (Math.abs(sx - nx) < r && sy < ny + 10 * cam.zoom && sy > ny - r * 1.5) return n.id;
    }
    return tree || byPicture || under;
  }
}
