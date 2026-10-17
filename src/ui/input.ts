import { isTamer, tameable } from '../sim/abilities/herding';
import { isUnderfoot } from '../sim/abilities/underfoot';
import { isWall } from '../sim/abilities/wall';
// Mouse + keyboard → selection, camera, and Commands.
import type { Command } from '../sim/commands';
import type { World } from '../sim/world';
import type { Renderer, RenderState } from '../render/renderer';
import { TEAM_COLORS } from '../render/renderer';
import type { Minimap } from './minimap';
import { keymap, settings, settingsOpen, updateSettings } from './settings';

/** resupplyDest: units were just sent to resupply; a ground click picks where they go afterwards. */
type Mode = 'attackMove' | 'move' | 'give' | 'resupplyDest' | 'place' | null;

export class Input {
  readonly rs: RenderState = { selected: new Set(), hoverId: 0, box: null, ping: null, ghost: null };
  /** Building being placed while mode === 'place'. */
  placeSpec = '';
  mode: Mode = null;
  paused = false;
  speed = 1;
  private keys = new Set<string>();
  private mouse = { x: -1, y: -1, inside: false };
  private drag: { x: number; y: number; button: number; moved: boolean } | null = null;
  private groups = new Map<string, number[]>();
  private lastClick = { t: 0, id: 0 };
  private lastGroupKey = { t: 0, key: '' };
  alpha = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
    private renderer: Renderer,
    minimap: Minimap,
    readonly player: number,
    private issue: (cmd: Command) => void,
  ) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => this.down(e));
    window.addEventListener('mousemove', (e) => this.move(e));
    window.addEventListener('mouseup', (e) => this.up(e));
    canvas.addEventListener('mouseenter', () => (this.mouse.inside = true));
    canvas.addEventListener('mouseleave', () => (this.mouse.inside = false));
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.renderer.cam.zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); }, { passive: false });
    window.addEventListener('keydown', (e) => this.keydown(e));
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === keymap().resupply && this.mode === 'resupplyDest') this.mode = null;
    });
    window.addEventListener('blur', () => this.keys.clear());
    const mm = minimap;
    const onMini = (e: MouseEvent) => {
      const r = mm.canvas.getBoundingClientRect();
      const [wx, wy] = minimap.toWorld(e.clientX - r.left, e.clientY - r.top);
      if (e.button === 2 || e.buttons === 2) this.contextCommand(wx, wy, 0, e.shiftKey);
      else this.renderer.cam.centerOn(wx, wy);
    };
    mm.canvas.addEventListener('mousedown', (e) => { e.preventDefault(); onMini(e); });
    mm.canvas.addEventListener('mousemove', (e) => { if (e.buttons === 1) onMini(e); });
    mm.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get selected(): Set<number> { return this.rs.selected; }

  selectedUnits(): number[] {
    return [...this.rs.selected].filter((id) => this.world.units.get(id)?.owner === this.player);
  }

  /** Called when the player's own selection changes (for unit voice lines). */
  onSelect?: (ids: number[]) => void;

  setSelection(ids: number[]): void {
    const before = [...this.rs.selected].join(',');
    this.rs.selected = new Set(ids);
    if (ids.length && ids.join(',') !== before) this.onSelect?.(ids);
  }

  update(dt: number): void {
    // prune dead
    for (const id of this.rs.selected) if (!this.world.units.has(id) && !this.world.buildings.has(id)) this.rs.selected.delete(id);
    const cam = this.renderer.cam;
    const pan = 700 * dt * settings().scrollSpeed;
    const km = keymap().pan;
    const held = (ks: string[]) => ks.some((k) => this.keys.has(k));
    let dx = 0, dy = 0;
    if (held(km.left)) dx -= pan;
    if (held(km.right)) dx += pan;
    if (held(km.up)) dy -= pan;
    if (held(km.down)) dy += pan;
    if (this.mouse.inside && !this.drag && settings().edgeScroll && !settingsOpen()) {
      const m = 10;
      if (this.mouse.x < m) dx -= pan;
      if (this.mouse.x > cam.width - m) dx += pan;
      if (this.mouse.y < m) dy -= pan;
      if (this.mouse.y > cam.height - m) dy += pan;
    }
    cam.pan(dx * cam.zoom, dy * cam.zoom);
    cam.clampTo(this.world.grid.width, this.world.grid.height);
    // hover shows what a right-click would target
    this.rs.hoverId = this.mouse.inside ? this.renderer.pick(this.mouse.x, this.mouse.y, this.alpha, this.orderPicker()) : 0;
    this.canvas.style.cursor = this.mode === 'attackMove' ? 'crosshair' : this.mode === 'move' ? 'pointer' : this.mode === 'give' ? 'copy' : this.mode === 'resupplyDest' ? 'alias' : this.mode === 'place' ? 'cell' : 'default';
    // building placement preview follows the cursor
    if (this.mode === 'place' && this.mouse.inside) {
      const spec = this.world.buildingSpecOf(this.player, this.placeSpec);
      if (spec) {
        const [wx, wy] = cam.toWorld(this.mouse.x, this.mouse.y);
        const ox = Math.round(wx - spec.size / 2), oy = Math.round(wy - spec.size / 2);
        this.rs.ghost = { specId: spec.id, ox, oy, size: spec.size, ok: this.world.placeable(ox, oy, spec.size) && !this.world.buildBlocker(this.player, spec.id) };
        // dragging a wall, canal or road lays a line of it
        const d = this.drag;
        if (d && d.button === 0 && d.moved && spec.size === 1 && isWall(spec)) {
          const [sx, sy] = cam.toWorld(d.x, d.y);
          this.rs.ghost.line = this.lineTiles(Math.floor(sx), Math.floor(sy), ox, oy).map(([x, y]) => [x, y, this.world.placeable(x, y, 1)]);
        }
      }
    } else this.rs.ghost = null;
  }

  private down(e: MouseEvent): void {
    this.drag = { x: e.clientX, y: e.clientY, button: e.button, moved: false };
  }

  private move(e: MouseEvent): void {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    const d = this.drag;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 5) d.moved = true;
    if (d.button === 1) {
      this.renderer.cam.pan(d.x - e.clientX, d.y - e.clientY);
      d.x = e.clientX; d.y = e.clientY;
    } else if (d.button === 0 && d.moved && !this.mode) {
      this.rs.box = { x0: d.x, y0: d.y, x1: e.clientX, y1: e.clientY };
    }
  }

  private up(e: MouseEvent): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const box = this.rs.box;
    this.rs.box = null;
    if (d.button === 2 && !d.moved) {
      if (this.mode === 'place') { this.mode = null; return; }
      if (this.mode === 'resupplyDest') this.mode = null;
      const [wx, wy] = this.renderer.cam.toWorld(e.clientX, e.clientY);
      this.contextCommand(wx, wy, this.renderer.pick(e.clientX, e.clientY, this.alpha, this.orderPicker()), e.shiftKey);
      return;
    }
    if (d.button !== 0) return;
    if (this.mode) {
      const [wx, wy] = this.renderer.cam.toWorld(e.clientX, e.clientY);
      const target = this.renderer.pick(e.clientX, e.clientY, this.alpha, this.orderPicker());
      const units = this.selectedUnits();
      if (this.mode === 'place') {
        const g = this.rs.ghost;
        if (g?.line && d.moved) {
          // a dragged line: the selected workers start at the first tile and work along it
          const tiles = g.line.filter(([, , ok]) => ok);
          tiles.forEach(([x, y], i) => this.issue({ type: 'build', units: i === 0 ? this.workers(units) : [], specId: g.specId, ox: x, oy: y }));
          if (tiles.length) this.ping(tiles[0][0] + 0.5, tiles[0][1] + 0.5, '#7aff7a');
          if (!e.shiftKey) this.mode = null;
          return;
        }
        if (g && g.ok) {
          this.issue({ type: 'build', units: this.workers(units), specId: g.specId, ox: g.ox, oy: g.oy });
          this.ping(g.ox + g.size / 2, g.oy + g.size / 2, '#7aff7a');
          if (!e.shiftKey) this.mode = null;
        }
        return;
      }
      if (this.mode === 'move') {
        // a plain move: walk there whatever's under the cursor (pull out of a fight)
        this.formationMove(units, wx, wy);
        this.ping(wx, wy, TEAM_COLORS[this.player].secondary);
      } else if (this.mode === 'attackMove') {
        const t = this.world.units.get(target) ?? this.world.buildings.get(target);
        if (t && t.owner !== this.player) this.issue({ type: 'attack', units, target });
        else this.issue({ type: 'attackMove', units, x: wx, y: wy });
        this.ping(wx, wy, '#ff6b5a');
      } else if (this.mode === 'resupplyDest') {
        const tc = this.supplyBuilding(units);
        if (tc && units.length) {
          this.issue({ type: 'resupply', units, building: tc.id, thenX: wx, thenY: wy });
          this.ping(wx, wy, '#e8c547');
        }
        if (!this.keys.has(keymap().resupply)) this.mode = null;
        return;
      } else if (this.mode === 'give') {
        const t = this.world.units.get(target);
        const b = this.world.buildings.get(target);
        if (t && t.owner === this.player) this.issue({ type: 'give', units, to: target });
        else if (b && b.owner === this.player) this.issue({ type: 'resupply', units, building: b.id });
        this.ping(wx, wy, '#7ae7c7');
      }
      if (!e.shiftKey) this.mode = null;
      return;
    }
    if (box && d.moved) {
      const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1), y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1);
      const hits: number[] = [];
      for (const u of this.world.units.values()) {
        if (u.owner !== this.player) continue;
        const [sx, sy] = this.renderer.cam.toScreen(u.x, u.y);
        const mid = sy - ((this.renderer.bank.unit(u.owner, u.specId)?.height ?? 36) / 2) * this.renderer.cam.zoom;
        if (sx >= x0 && sx <= x1 && ((sy >= y0 && sy <= y1) || (mid >= y0 && mid <= y1))) hits.push(u.id);
      }
      if (e.shiftKey) for (const id of hits) this.rs.selected.add(id);
      else this.setSelection(hits);
      return;
    }
    // click select
    const id = this.renderer.pick(e.clientX, e.clientY, this.alpha);
    const now = performance.now();
    const u = this.world.units.get(id);
    if (u && u.owner === this.player && this.lastClick.id === id && now - this.lastClick.t < 350) {
      // double-click: all of this type on screen
      const cam = this.renderer.cam;
      const same = [...this.world.units.values()].filter((o) => {
        if (o.owner !== this.player || o.specId !== u.specId) return false;
        const [sx, sy] = cam.toScreen(o.x, o.y);
        return sx >= 0 && sy >= 0 && sx <= cam.width && sy <= cam.height;
      });
      this.setSelection(same.map((o) => o.id));
    } else if (id && (this.world.units.has(id) || this.world.buildings.has(id))) {
      if (e.shiftKey && u?.owner === this.player) {
        if (this.rs.selected.has(id)) this.rs.selected.delete(id); else this.rs.selected.add(id);
      } else this.setSelection([id]);
    } else if (!e.shiftKey) this.setSelection([]);
    this.lastClick = { t: now, id };
  }

  /** With units selected, clicks pick targets: other players' units win over ours. */
  private orderPicker(): number { return this.mode !== 'give' && this.selectedUnits().length ? this.player : -1; }

  /** Right-click: do the obvious thing for whatever is under the cursor. */
  contextCommand(wx: number, wy: number, target: number, _shift: boolean): void {
    const w = this.world;
    const units = this.selectedUnits();
    const tu = w.units.get(target);
    // spent crystals on the ground aren't targets: right-clicking near them in a fight should still move
    // (throwers pick them up by themselves)
    const tn0 = w.nodes.get(target), tn = tn0 && !(tn0.shard && !tn0.carcass) ? tn0 : undefined;
    // a finished road or belt is just ground to walk on (sim/abilities/underfoot.ts)
    const tbAny = w.buildings.get(target);
    const tb = tbAny && tbAny.complete && isUnderfoot(tbAny.spec) ? undefined : tbAny;
    const ownBuilding = [...this.rs.selected].map((id) => w.buildings.get(id)).find((b) => b && b.owner === this.player);
    if (units.length === 0) {
      if (ownBuilding) {
        // on a resource, new workers will go and gather it
        this.issue({ type: 'rally', building: ownBuilding.id, x: wx, y: wy, node: tn && !tn.shard ? tn.id : undefined });
        this.ping(tn ? tn.x : wx, tn ? tn.y : wy, tn ? (tn.type === 'food' ? '#e0457a' : tn.type === 'wood' ? '#9ad06a' : '#7ae7ff') : '#ffd23f');
      }
      return;
    }
    // a wild animal: tamers with food tame it (sim/abilities/herding.ts); workers hunt game; fighters attack
    const tamers = tu?.wild && tameable(tu) ? units.filter((id) => { const u = w.units.get(id); return u && isTamer(w, u) && u.food >= 0.5; }) : [];
    if (tamers.length) this.issue({ type: 'tame', units: tamers, target });
    const others = units.filter((id) => !tamers.includes(id));
    if (tu && (tu.wild === 'passive' || (tu.tame === 'passive' && tu.owner === this.player && tamers.length === 0)) && (tu.wild || others.some((id) => { const u = w.units.get(id); return u && !u.stats.canAttack && w.gathers(u, 'food'); }))) {
      // game (or one of your own herd, to butcher): workers bring it down and gather it, fighters attack it
      const hunters = others.filter((id) => { const u = w.units.get(id); return u && !u.stats.canAttack && w.gathers(u, 'food'); });
      const fighters = others.filter((id) => !hunters.includes(id));
      if (hunters.length) this.issue({ type: 'hunt', units: hunters, target });
      if (fighters.length && tu.wild) this.issue({ type: 'attack', units: fighters, target });
      this.ping(wx, wy, '#e0457a');
    } else if (tamers.length) {
      this.ping(wx, wy, '#9ad06a'); // the rest hold off: it's being tamed
    } else if ((tu && tu.owner !== this.player) || (tb && tb.owner !== this.player)) {
      this.issue({ type: 'attack', units, target });
      this.ping(wx, wy, '#ff6b5a');
    } else if (tn) {
      this.issue({ type: 'gather', units, node: tn.id });
      this.ping(tn.x, tn.y, tn.type === 'food' ? '#e0457a' : '#7ae7ff');
    } else if (tb && tb.owner === this.player && tb.complete && units.some((id) => w.units.get(id)?.carter)) {
      // carts in the selection get reassigned to supply this building; anyone else resupplies there
      const carts = units.filter((id) => w.units.get(id)?.carter);
      const rest = units.filter((id) => !w.units.get(id)?.carter);
      this.issue({ type: 'assignCart', units: carts, building: tb.id });
      if (rest.length) this.issue({ type: 'resupply', units: rest, building: tb.id });
      this.ping(wx, wy, '#ffd23f');
    } else if (tb && tb.owner === this.player && !tb.complete) {
      this.issue({ type: 'construct', units, site: tb.id });
      this.ping(wx, wy, '#7aff7a');
    } else if (tb && tb.owner === this.player) {
      // unarmed workers haul supplies for it; armed units restock themselves there
      const haulers = units.filter((id) => { const u = w.units.get(id); return u && w.gathers(u) && (!u.stats.canAttack || u.specId === w.factionOf(u.owner).workerId); });
      const rest = units.filter((id) => !haulers.includes(id));
      // (into any building that's short of something, the main one included)
      const short = Object.values(w.logistics.shortfall(tb)).some((v) => v > 0.5);
      if (haulers.length && short) this.issue({ type: 'haul', units: haulers, building: tb.id });
      else rest.push(...haulers);
      if (rest.length) this.issue({ type: 'resupply', units: rest, building: tb.id });
      this.ping(wx, wy, '#ffd23f');
    } else if (tu && tu.owner === this.player && !this.rs.selected.has(tu.id)) {
      // an ammo bearer: throwers restock from it; anyone else gives it what they carry
      const isBearer = w.isBearer(tu); // sim/abilities/bearer.ts
      const throwers = isBearer ? units.filter((id) => w.units.get(id)?.throws) : [];
      if (throwers.length) this.issue({ type: 'rearm', units: throwers, bearer: tu.id });
      const others = units.filter((id) => !throwers.includes(id));
      if (others.length) this.issue({ type: 'give', units: others, to: tu.id });
      this.ping(tu.x, tu.y, '#7ae7c7');
    } else {
      this.formationMove(units, wx, wy);
      this.ping(wx, wy, TEAM_COLORS[this.player].secondary);
    }
  }

  /** Spread a group's destinations into a loose grid so they don't pile up. */
  private formationMove(units: number[], x: number, y: number): void {
    if (units.length === 1) { this.issue({ type: 'move', units, x, y }); return; }
    const us = units.map((id) => this.world.units.get(id)!).filter(Boolean);
    const cols = Math.ceil(Math.sqrt(us.length));
    const spacing = 0.9;
    // keep relative order: sort by current offset so units don't cross paths
    const sorted = [...us].sort((a, b) => (a.x + a.y) - (b.x + b.y) || (a.x - a.y) - (b.x - b.y));
    sorted.forEach((u, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const ox = (c - (cols - 1) / 2) * spacing, oy = (r - (Math.ceil(us.length / cols) - 1) / 2) * spacing;
      const gx = x + (ox + oy) * 0.7, gy = y + (oy - ox) * 0.7;
      this.issue({ type: 'move', units: [u.id], x: gx, y: gy });
    });
  }

  private ping(x: number, y: number, color: string): void {
    this.rs.ping = { x, y, t: 0, color };
  }

  private keydown(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).tagName === 'INPUT' || settingsOpen()) return;
    const k = e.key.toLowerCase();
    const km = keymap();
    this.keys.add(k);
    const w = this.world;
    const units = this.selectedUnits();
    const myTc = this.supplyBuilding(units) ?? w.baseOf(this.player);
    const tcSelected = [...this.rs.selected].map((id) => w.buildings.get(id)).find((b) => b && b.owner === this.player && b.complete);

    if (/^[0-8]$/.test(k)) { // 9 toggles the cart debug overlay
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.groups.set(k, [...this.rs.selected]); return; }
      const g = this.groups.get(k);
      if (g) {
        this.setSelection(g.filter((id) => w.units.has(id) || w.buildings.has(id)));
        const now = performance.now();
        if (this.lastGroupKey.key === k && now - this.lastGroupKey.t < 400) this.centerOnSelection();
        this.lastGroupKey = { t: now, key: k };
      }
      return;
    }
    if (tcSelected && units.length === 0) {
      const i = km.train.indexOf(k);
      const specId = tcSelected.spec.trains?.[i];
      if (specId) { this.issue({ type: 'train', building: tcSelected.id, specId }); return; }
    }
    if (units.length) {
      if (k === km.attackMove) { this.mode = 'attackMove'; return; }
      if (k === km.move) { this.mode = 'move'; return; }
      if (k === km.give) { this.mode = 'give'; return; }
      if (k === km.stop) { this.issue({ type: 'stop', units }); return; }
      // Tap: resupply and come back. Hold and click: resupply, then go there.
      if (k === km.resupply) {
        if (myTc && !e.repeat) { this.issue({ type: 'resupply', units, building: myTc.id }); this.mode = 'resupplyDest'; }
        return;
      }
    }
    const base = w.baseOf(this.player);
    if (k === km.home && base) { this.setSelection([base.id]); this.centerOnSelection(); return; }
    switch (k) {
      case ' ': e.preventDefault(); this.centerOnSelection(); break;
      case '.': this.nextIdleWorker(); break;
      case 'm': updateSettings({ muted: !settings().muted }); break;
      case 'escape': if (this.mode) this.mode = null; else this.setSelection([]); break;
      case 'p': this.paused = !this.paused; break;
      case '[': this.speed = Math.max(0.25, this.speed / 2); break;
      case ']': this.speed = Math.min(8, this.speed * 2); break;
      case '=': case '+': this.renderer.cam.zoomAt(1.15, this.renderer.cam.width / 2, this.renderer.cam.height / 2); break;
      case '-': this.renderer.cam.zoomAt(1 / 1.15, this.renderer.cam.width / 2, this.renderer.cam.height / 2); break;
    }
  }

  centerOnSelection(): void {
    let x = 0, y = 0, n = 0;
    for (const id of this.rs.selected) {
      const p = this.world.entityPos(id);
      if (p) { x += p[0]; y += p[1]; n++; }
    }
    if (n) this.renderer.cam.centerOn(x / n, y / n);
  }

  private idleCursor = 0;

  /** Select the next idle worker and jump the camera to it. */
  nextIdleWorker(): void {
    const wid = this.world.factionOf(this.player).workerId;
    const idle = this.world.unitsOf(this.player).filter((u) => u.specId === wid && u.order.kind === 'idle');
    if (!idle.length) return;
    const u = idle[this.idleCursor++ % idle.length];
    this.setSelection([u.id]);
    this.renderer.cam.centerOn(u.x, u.y);
  }

  /** Tiles from (x0, y0) to (x1, y1), stepping edge to edge (so walls and canals join up). */
  private lineTiles(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
    const out: Array<[number, number]> = [[x0, y0]];
    let x = x0, y = y0;
    for (let i = 0; i < 64 && (x !== x1 || y !== y1); i++) {
      // step along whichever axis is further behind the straight line
      const dx = x1 - x0, dy = y1 - y0;
      const ahead = Math.abs(dx) * Math.abs(y - y0) - Math.abs(dy) * Math.abs(x - x0); // > 0: y has run ahead
      if (x !== x1 && (y === y1 || ahead >= 0)) x += Math.sign(x1 - x); else y += Math.sign(y1 - y);
      out.push([x, y]);
    }
    return out;
  }

  /** Start placing a building (from the HUD build menu). */
  startPlacing(specId: string): void {
    if (!this.workers(this.selectedUnits()).length) return;
    this.placeSpec = specId;
    this.mode = 'place';
  }

  private workers(units: number[]): number[] {
    const wid = this.world.factionOf(this.player).workerId;
    return units.filter((id) => this.world.units.get(id)?.specId === wid);
  }

  /**
   * Nearest finished building to the selection that has what it needs: crystal
   * if anyone's short of it (a thrower's pack, an ammo bearer's load), else food.
   * Falls back to the base.
   */
  private supplyBuilding(units: number[]): import('../sim/world').Building | undefined {
    const w = this.world;
    let x = 0, y = 0, n = 0, crystal = false;
    for (const id of units) {
      const u = w.units.get(id);
      if (!u) continue;
      x += u.x; y += u.y; n++;
      if (u.ammo < u.stats.loadoutCrystal - 1e-6 || (w.specOf(u.owner, u.specId)?.spec.bearer && w.freeCapacity(u) >= 1)) crystal = true;
    }
    if (!n) return w.baseOf(this.player);
    x /= n; y /= n;
    let best: import('../sim/world').Building | undefined, bestD = Infinity;
    for (const b of w.buildingsOf(this.player)) {
      if (!b.complete || (crystal ? b.stock.crystal < 1 : b.stock.food < 1)) continue;
      const d = (b.ox + b.size / 2 - x) ** 2 + (b.oy + b.size / 2 - y) ** 2;
      if (d < bestD) { bestD = d; best = b; }
    }
    return best ?? w.baseOf(this.player);
  }

  /** Commands triggered from HUD buttons. */
  hudCommand(kind: 'stop' | 'attackMove' | 'move' | 'resupply' | 'give'): void {
    const units = this.selectedUnits();
    if (!units.length) return;
    if (kind === 'stop') this.issue({ type: 'stop', units });
    else if (kind === 'resupply') {
      const tc = this.supplyBuilding(units);
      if (tc) this.issue({ type: 'resupply', units, building: tc.id });
    }
    else this.mode = kind;
  }
}
