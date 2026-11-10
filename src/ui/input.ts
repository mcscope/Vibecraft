import { bodyBuilt, canLayDown, piecesFrom } from '../sim/abilities/layDown';
import { isTamer, tameable } from '../sim/abilities/herding';
import { isUnderfoot } from '../sim/abilities/underfoot';
import { isWall } from '../sim/abilities/wall';
import { digestsTrees } from '../sim/abilities/digest';
import { canBecome, foodOwed } from '../sim/abilities/metamorph';
// Mouse + keyboard → selection, camera, and Commands.
import type { Command } from '../sim/commands';
import type { World } from '../sim/world';
import type { Renderer, RenderState } from '../render/renderer';
import { TEAM_COLORS } from '../render/renderer';
import type { Minimap } from './minimap';
import { keymap, settings, settingsOpen, updateSettings } from './settings';
import { formationSlots, formationUnit, type Formation, type Slot } from './formations';

/** resupplyDest: units were just sent to resupply; a ground click picks where they go afterwards. */
/** rallyWork / rallyArmy: a ground click sets the side's rally point (PlayerState.rally). */
type Mode = 'attackMove' | 'charge' | 'move' | 'give' | 'garrison' | 'resupplyDest' | 'place' | 'rallyWork' | 'rallyArmy' | null;

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
  private lastClick = { t: 0, id: 0, x: 0, y: 0, specId: '' };
  private lastGroupKey = { t: 0, key: '' };
  /** Each unit's formation (what it was last set to with the group it was in); block if never set. */
  private formations = new Map<number, Formation>();
  alpha = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
    private renderer: Renderer,
    minimap: Minimap,
    public player: number,
    private send: (cmd: Command) => void,
  ) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => this.press(e.clientX, e.clientY, e.button));
    window.addEventListener('mousemove', (e) => this.pointerMove(e.clientX, e.clientY));
    // (a real mouse: a tap on a button also sends mouse events, so only a pointer that says it's a mouse counts)
    window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') this.viaTouch = false; });
    window.addEventListener('mouseup', (e) => this.release(e.clientX, e.clientY, e.shiftKey));
    // (record where it came in: until the first move the position is unknown, and (-1, -1) would edge-scroll up-left)
    canvas.addEventListener('mouseenter', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true; });
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
      const [wx, wy] = this.miniToWorld(e.clientX, e.clientY);
      if (e.button === 2 || e.buttons === 2) this.contextCommand(wx, wy, 0, e.shiftKey);
      else this.renderer.cam.centerOn(wx, wy);
    };
    mm.canvas.addEventListener('mousedown', (e) => { e.preventDefault(); onMini(e); });
    mm.canvas.addEventListener('mousemove', (e) => { if (e.buttons === 1) onMini(e); });
    mm.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.minimap = minimap;
  }

  private minimap: Minimap;
  /** The pointer is a finger (ui/touch.ts): no edge scroll, and an armed command shows as a banner. */
  viaTouch = false;
  /** The on-screen Shift (touch): add to the selection, queue orders, keep a command armed. */
  shiftLatch = false;

  /** A point on the minimap (client pixels) in world tiles (the minimap may be drawn smaller than its size). */
  miniToWorld(cx: number, cy: number): [number, number] {
    const mm = this.minimap, r = mm.canvas.getBoundingClientRect();
    const k = r.width ? mm.size / r.width : 1;
    return mm.toWorld((cx - r.left) * k, (cy - r.top) * k);
  }

  get selected(): Set<number> { return this.rs.selected; }

  selectedUnits(): number[] {
    return [...this.rs.selected].filter((id) => this.world.units.get(id)?.owner === this.player);
  }

  /** Called when the player's own selection changes (for unit voice lines); `group`: a double-click took the whole type. */
  onSelect?: (ids: number[], group?: boolean) => void;

  setSelection(ids: number[], group = false): void {
    const before = [...this.rs.selected].join(',');
    this.rs.selected = new Set(ids);
    if (ids.length && ids.join(',') !== before) this.onSelect?.(ids, group);
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
    if (this.mouse.inside && !this.viaTouch && !this.drag && settings().edgeScroll && !settingsOpen()) {
      const m = 10;
      if (this.mouse.x < m) dx -= pan;
      if (this.mouse.x > cam.width - m) dx += pan;
      if (this.mouse.y < m) dy -= pan;
      if (this.mouse.y > cam.height - m) dy += pan;
    }
    cam.pan(dx * cam.zoom, dy * cam.zoom);
    cam.clampTo(this.world.grid.width, this.world.grid.height);
    this.rs.formation = this.previewSlots();
    this.showArmed();
    // hover shows what a right-click would target
    this.rs.hoverId = this.mouse.inside ? this.renderer.pick(this.mouse.x, this.mouse.y, this.alpha, this.orderPicker()) : 0;
    this.canvas.style.cursor = this.mode === 'attackMove' ? 'crosshair' : this.mode === 'move' ? 'pointer' : this.mode === 'give' ? 'copy' : this.mode === 'resupplyDest' ? 'alias' : this.mode === 'place' ? 'cell' : 'default';
    // building placement preview follows the cursor
    if (this.mode === 'place' && this.mouse.inside) this.placeGhost(this.mouse.x, this.mouse.y);
    else this.rs.ghost = null;
  }

  /** The building being placed, drawn where the pointer is (dragging a wall, canal or road: a line of it). */
  private placeGhost(px: number, py: number): void {
    const cam = this.renderer.cam;
    const spec = this.world.buildingSpecOf(this.player, this.placeSpec);
    if (!spec) return;
    const [wx, wy] = cam.toWorld(px, py);
    const ox = Math.round(wx - spec.size / 2), oy = Math.round(wy - spec.size / 2);
    this.rs.ghost = { specId: spec.id, ox, oy, size: spec.size, ok: this.world.placeable(ox, oy, spec.size) && !this.world.buildBlocker(this.player, spec.id) };
    const d = this.drag;
    if (d && d.button === 2 && d.moved && spec.size === 1 && isWall(spec)) {
      const [sx, sy] = cam.toWorld(d.x, d.y);
      this.rs.ghost.line = this.lineTiles(Math.floor(sx), Math.floor(sy), ox, oy).map(([x, y]) => [x, y, this.world.placeable(x, y, 1)]);
    }
  }

  /** A button goes down at (sx, sy): 0 selects, 1 pans, 2 does (the mouse, or a gesture standing in for one). */
  press(sx: number, sy: number, button: number): void {
    this.drag = { x: sx, y: sy, button, moved: false };
    this.mouse.x = sx; this.mouse.y = sy;
  }

  /** Drop a press without doing anything (a second finger came down). */
  cancelPress(): void {
    this.drag = null;
    this.rs.box = null;
  }

  /** The pointer moved (a finger: only while it's down). */
  pointerMove(sx: number, sy: number): void {
    this.mouse.x = sx;
    this.mouse.y = sy;
    const d = this.drag;
    if (!d) return;
    if (Math.abs(sx - d.x) + Math.abs(sy - d.y) > 5) d.moved = true;
    if (d.button === 1) {
      this.renderer.cam.pan(d.x - sx, d.y - sy);
      d.x = sx; d.y = sy;
    } else if (d.button === 0 && d.moved) {
      this.rs.box = { x0: d.x, y0: d.y, x1: sx, y1: sy };
    }
  }

  /** Where a finger is, or that it's lifted: hover, the placing ghost and the formation preview follow it. */
  setPointer(sx: number, sy: number, inside: boolean): void {
    this.mouse.x = sx; this.mouse.y = sy; this.mouse.inside = inside;
  }

  /** The press ends at (sx, sy). `shift`: add to the selection, queue the order. */
  release(sx: number, sy: number, shift: boolean): void {
    const d = this.drag;
    if (!d) return;
    if (this.mode === 'place') this.placeGhost(sx, sy); // (where it's let go, even if no frame drew it there yet)
    this.drag = null;
    const box = this.rs.box;
    this.rs.box = null;
    // one rule: left-click always selects, right-click always does. A hotkey or tile (C, A, E, Q, a building to place)
    // only sets what the next right-click does.
    if (d.button === 2) {
      if (this.mode && (!d.moved || this.mode === 'place')) { // the armed command (placing: a right-drag lays a wall line)
        this.queueing = shift && this.mode !== 'place';
        try { this.modeClick(sx, sy, d, shift); } finally { this.queueing = false; }
        return;
      }
      if (d.moved) { // a right-drag lays out the front line: the group forms up along it, facing away from you
        // (with Attack or Charge armed, that's how they go there; otherwise a move)
        const front = this.dragFront(d, sx, sy);
        const kind = this.mode === 'attackMove' || this.mode === 'charge' ? this.mode : 'move';
        if (front) { this.queueing = shift; this.formationOrder(kind, this.selectedUnits(), ...front); this.queueing = false; }
        if (!shift) this.mode = null;
        return;
      }
      const [wx, wy] = this.renderer.cam.toWorld(sx, sy);
      this.queueing = shift;
      this.contextCommand(wx, wy, this.renderer.pick(sx, sy, this.alpha, this.orderPicker()), shift);
      this.queueing = false;
      return;
    }
    if (d.button !== 0) return;
    this.mode = null; // a left-click selects (and drops whatever was armed)
    this.selectClick(sx, sy, d, box, shift);
  }

  private modeClick(sx: number, sy: number, d: { moved: boolean }, shift: boolean): void {
    {
      const [wx, wy] = this.renderer.cam.toWorld(sx, sy);
      const target = this.renderer.pick(sx, sy, this.alpha, this.orderPicker());
      const units = this.selectedUnits();
      if (this.mode === 'place') {
        const g = this.rs.ghost;
        if (g?.line && d.moved) {
          // a dragged line: the selected workers start at the first tile and work along it
          const tiles = g.line.filter(([, , ok]) => ok);
          if (bodyBuilt(this.world, this.player, g.specId)) {
            // laid by bodies: each of them lays as many pieces as its body seeds, one after another; the line stops
            // where their bodies run out
            const spec = this.world.buildingSpecOf(this.player, g.specId)!;
            let t = 0;
            for (const id of this.builders(units, g.specId)) {
              const n = piecesFrom(this.world.units.get(id)!.stats.mass, spec);
              for (let k = 0; k < n && t < tiles.length; k++, t++) this.send({ type: 'build', units: [id], specId: g.specId, ox: tiles[t][0], oy: tiles[t][1], ...(k > 0 || this.queueing ? { queue: true } : {}) });
            }
          } else tiles.forEach(([x, y], i) => this.issue({ type: 'build', units: i === 0 ? this.workers(units) : [], specId: g.specId, ox: x, oy: y }));
          if (tiles.length) this.ping(tiles[0][0] + 0.5, tiles[0][1] + 0.5, '#7aff7a');
          if (!shift) this.mode = null;
          return;
        }
        if (g && g.ok) {
          this.issue({ type: 'build', units: this.builders(units, g.specId), specId: g.specId, ox: g.ox, oy: g.oy });
          this.ping(g.ox + g.size / 2, g.oy + g.size / 2, '#7aff7a');
          if (!shift) this.mode = null;
        }
        return;
      }
      if (this.mode === 'rallyWork' || this.mode === 'rallyArmy') {
        this.issue({ type: 'sideRally', kind: this.mode === 'rallyWork' ? 'work' : 'army', x: wx, y: wy });
        this.ping(wx, wy, this.mode === 'rallyWork' ? '#9ad06a' : '#ff6b5a');
        this.mode = null;
        return;
      }
      if (this.mode === 'garrison') {
        const b = this.world.buildings.get(target);
        if (b && b.owner === this.player) { this.issue({ type: 'garrison', units, building: b.id }); this.ping(b.ox + b.size / 2, b.oy + b.size / 2, '#ffd23f'); }
        if (!shift) this.mode = null;
        return;
      }
      if (this.mode === 'move') {
        // a plain move: walk there whatever's under the cursor (pull out of a fight)
        this.formationOrder('move', units, wx, wy);
        this.ping(wx, wy, TEAM_COLORS[this.player].secondary);
      } else if (this.mode === 'charge') {
        // a charge order: sprint at it from wherever they are and run on through (shift: queued after the rest)
        const t = this.world.units.get(target) ?? this.world.buildings.get(target);
        if (t && t.owner !== this.player) this.issue({ type: 'attack', units, target, charge: true });
        else this.formationOrder('charge', units, wx, wy);
        this.ping(wx, wy, '#ff9a3a');
      } else if (this.mode === 'attackMove') {
        const t = this.world.units.get(target) ?? this.world.buildings.get(target);
        if (t && t.owner !== this.player) this.issue({ type: 'attack', units, target });
        else this.formationOrder('attackMove', units, wx, wy);
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
      if (!shift) this.mode = null;
      return;
    }
  }

  private selectClick(sx: number, sy: number, d: { moved: boolean }, box: RenderState['box'], shift: boolean): void {
    if (box && d.moved) {
      const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1), y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1);
      const hits: number[] = [];
      for (const u of this.world.units.values()) {
        if (u.owner !== this.player) continue;
        const [sx, sy] = this.renderer.cam.toScreen(u.x, u.y);
        const mid = sy - ((this.renderer.bank.unit(u.owner, u.specId)?.height ?? 36) / 2) * this.renderer.cam.zoom;
        if (sx >= x0 && sx <= x1 && ((sy >= y0 && sy <= y1) || (mid >= y0 && mid <= y1))) hits.push(u.id);
      }
      if (shift) for (const id of hits) this.rs.selected.add(id);
      else this.setSelection(hits);
      return;
    }
    // click select
    const id = this.renderer.pick(sx, sy, this.alpha);
    const now = performance.now();
    const u = this.world.units.get(id);
    const last = this.lastClick;
    // a double-click: the same unit twice. A double-tap: two taps close in time and place (units walk, and a finger
    // is broad), the type taken from the first tap
    const double = this.viaTouch
      ? !!last.specId && now - last.t < 400 && Math.hypot(sx - last.x, sy - last.y) <= 30
      : !!u && u.owner === this.player && last.id === id && now - last.t < 350;
    if (double) {
      // all of this type on screen
      const specId = this.viaTouch ? last.specId : u!.specId;
      const cam = this.renderer.cam;
      const same = [...this.world.units.values()].filter((o) => {
        if (o.owner !== this.player || o.specId !== specId) return false;
        const [sx, sy] = cam.toScreen(o.x, o.y);
        return sx >= 0 && sy >= 0 && sx <= cam.width && sy <= cam.height;
      });
      this.setSelection(same.map((o) => o.id), true);
    } else if (id && (this.world.units.has(id) || this.world.buildings.has(id))) {
      if (shift && u?.owner === this.player) {
        if (this.rs.selected.has(id)) this.rs.selected.delete(id); else this.rs.selected.add(id);
      } else this.setSelection([id]);
    } else if (!shift) this.setSelection([]);
    // (after a double-tap, a third tap starts over)
    this.lastClick = { t: double ? 0 : now, id, x: sx, y: sy, specId: !double && u && u.owner === this.player ? u.specId : '' };
  }

  /** With units selected, clicks pick targets: other players' units win over ours. */
  private orderPicker(): number { return this.mode !== 'give' && this.selectedUnits().length ? this.player : -1; }

  /** Right-click: do the obvious thing for whatever is under the cursor. */
  contextCommand(wx: number, wy: number, target: number, _shift: boolean): void {
    const w = this.world;
    const units = this.selectedUnits();
    const tu = w.units.get(target), tn = w.nodes.get(target);
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
    } else if (tn?.tree && units.some((id) => { const u = w.units.get(id); return u && digestsTrees(w, u); })) {
      // one tree digester goes and digests it (the nearest free one: Shift-click tree after tree, one each); the rest
      // tend, looking for food from there
      this.send({ type: 'digest', units, node: tn.id, one: true });
      this.ping(tn.x, tn.y, '#e0457a');
    } else if (tn) {
      // on food: anyone low on calories (under half, or worn out) eats from it till full; the rest gather it
      const hungry = tn.type === 'food' ? units.filter((id) => { const u = w.units.get(id); return u && (u.exhausted || u.cal < u.stats.maxCalories * 0.5); }) : [];
      if (hungry.length) this.issue({ type: 'graze', units: hungry, node: tn.id });
      const rest = units.filter((id) => !hungry.includes(id));
      if (rest.length) this.issue({ type: 'gather', units: rest, node: tn.id });
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
    } else if (tu && tu.owner === this.player && !this.rs.selected.has(tu.id) && foodOwed(w, tu) > 0.05 && units.some((id) => { const u = w.units.get(id); return u && w.gathers(u, 'food'); })) {
      // one of ours waiting on food (an egg, a cocoon, a mother with an egg queued): the gatherers feed it, trip after
      // trip from the nearest food (and then whoever else is waiting)
      this.issue({ type: 'tend', units: units.filter((id) => { const u = w.units.get(id); return u && w.gathers(u, 'food'); }) });
      this.ping(tu.x, tu.y, '#e0457a');
    } else if (tu && tu.owner === this.player && !this.rs.selected.has(tu.id)) {
      // an ammo bearer: throwers restock from it; anyone else gives it what they carry
      const isBearer = w.bearerRes(tu) === 'crystal'; // an ammo bearer (sim/abilities/bearer.ts)
      const throwers = isBearer ? units.filter((id) => w.units.get(id)?.throws) : [];
      if (throwers.length) this.issue({ type: 'rearm', units: throwers, bearer: tu.id });
      const others = units.filter((id) => !throwers.includes(id));
      if (others.length) this.issue({ type: 'give', units: others, to: tu.id });
      this.ping(tu.x, tu.y, '#7ae7c7');
    } else {
      this.formationOrder('move', units, wx, wy);
      this.ping(wx, wy, TEAM_COLORS[this.player].secondary);
    }
  }

  /** The selection's formation: the one most of them are in (block if none set). */
  formationOf(units = this.selectedUnits()): Formation {
    const n = new Map<Formation, number>();
    for (const id of units) { const f = this.formations.get(id) ?? 'block'; n.set(f, (n.get(f) ?? 0) + 1); }
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'block';
  }

  /** Put the selection in a formation: they form up in it where they stand, and keep it for their next moves. */
  /**
   * One click of a lay/change tile is one order, to one of the selection (as a building trains one per click): to lay,
   * the parent with the shortest queue; to change, one not already changing, the one with the most food towards it.
   */
  oneFor(into: string, spawn: boolean): number[] {
    const w = this.world;
    const able = this.selectedUnits().map((id) => w.units.get(id)!).filter((u) => u && canBecome(w, u, into, spawn) && (spawn || u.order.kind !== 'metamorph'));
    if (!able.length) return [];
    able.sort(spawn ? (a, b) => a.brood.length - b.brood.length || a.id - b.id : (a, b) => b.food - a.food || a.id - b.id);
    return [able[0].id];
  }

  setFormation(f: Formation): void {
    const units = this.selectedUnits();
    for (const id of this.formations.keys()) if (!this.world.units.has(id)) this.formations.delete(id); // (the fallen)
    for (const id of units) this.formations.set(id, f);
    if (units.length < 2) return;
    const us = units.map((id) => this.world.units.get(id)!).filter(Boolean);
    const cx = us.reduce((t, u) => t + u.x, 0) / us.length, cy = us.reduce((t, u) => t + u.y, 0) / us.length;
    this.formationOrder('move', units, cx, cy, this.groupFacing(us));
  }

  /** Where each of `units` would stand in its formation at (x, y): facing `angle` (default: the way they'd travel). */
  private slotsAt(units: number[], x: number, y: number, angle?: number, width?: number, front = false): Slot[] {
    const us = units.map((id) => this.world.units.get(id)).filter((u): u is NonNullable<typeof u> => !!u);
    if (us.length < 2) return [];
    const cx = us.reduce((t, u) => t + u.x, 0) / us.length, cy = us.reduce((t, u) => t + u.y, 0) / us.length;
    const a = angle ?? (Math.hypot(x - cx, y - cy) > 1 ? Math.atan2(y - cy, x - cx) : this.groupFacing(us));
    const slots = formationSlots(this.formationOf(units), us.map(formationUnit), x, y, a, width);
    if (front) {
      // (x, y) is the middle of the front rank, not of the whole formation
      const fx = Math.cos(a), fy = Math.sin(a), lead = Math.max(...slots.map((s) => (s.x - x) * fx + (s.y - y) * fy));
      for (const s of slots) { s.x -= fx * lead; s.y -= fy * lead; }
    }
    return slots;
  }

  /** Which way a group faces on average. */
  private groupFacing(us: Array<{ facing: number }>): number {
    return Math.atan2(us.reduce((t, u) => t + Math.sin(u.facing), 0), us.reduce((t, u) => t + Math.cos(u.facing), 0));
  }

  /** A right-drag's front line, from where it started to (sx, sy) on screen: [x, y, facing, width, front] or null. */
  private dragFront(d: { x: number; y: number }, sx: number, sy: number): [number, number, number, number, boolean] | null {
    if (!this.selectedUnits().length) return null;
    const [x0, y0] = this.renderer.cam.toWorld(d.x, d.y), [x1, y1] = this.renderer.cam.toWorld(sx, sy);
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 0.5) return null;
    // facing: square to the line, to its left as drawn (drag left to right and they face up the screen)
    return [(x0 + x1) / 2, (y0 + y1) / 2, Math.atan2(-(x1 - x0), y1 - y0), len, true];
  }

  /** Send a group somewhere in its formation: each unit to its own spot, facing the formation's front on arrival. */
  private formationOrder(kind: 'move' | 'attackMove' | 'charge', units: number[], x: number, y: number, angle?: number, width?: number, front = false): void {
    const slots = this.slotsAt(units, x, y, angle, width, front);
    const one = (ids: number[], sx: number, sy: number, face?: number) => this.issue(
      kind === 'move' ? { type: 'move', units: ids, x: sx, y: sy, face }
        : kind === 'attackMove' ? { type: 'attackMove', units: ids, x: sx, y: sy, face }
        : { type: 'attackMove', units: ids, x: sx, y: sy, charge: true }); // (a charge runs on through: no forming up)
    if (!slots.length) { one(units, x, y); return; }
    for (const s of slots) one([s.id], s.x, s.y, s.face);
  }

  /** A command armed: say which by the cursor, and how to use or call it off (one rule for all of them). */
  private armedEl: HTMLElement | null = null;
  private showArmed(): void {
    const what: Partial<Record<NonNullable<Mode>, string>> = {
      attackMove: 'Attack: right-click a spot or an enemy', move: 'Move: right-click where to go', charge: 'Charge: right-click an enemy or a spot',
      give: 'Give: right-click a unit or building of yours', garrison: 'Garrison: right-click one of your buildings',
      place: 'Place: right-click where to build (right-drag: a line)', resupplyDest: 'Resupply, then: right-click where to go after',
      rallyWork: 'Work rally point: right-click where tenders look for food', rallyArmy: 'Army rally point: right-click where new fighters go',
    };
    if (this.viaTouch) { this.showArmedBanner(this.mode ? what[this.mode] : undefined); return; }
    if (this.banner) this.banner.style.display = 'none';
    const text = this.mode && this.mouse.inside ? what[this.mode] : undefined;
    if (!text) { if (this.armedEl) this.armedEl.style.display = 'none'; return; }
    if (!this.armedEl) { this.armedEl = document.createElement('div'); this.armedEl.className = 'armed-hint'; document.body.appendChild(this.armedEl); }
    const full = `${text} · left-click or Esc to cancel${this.mode === 'place' || this.mode === 'resupplyDest' || this.mode === 'rallyWork' || this.mode === 'rallyArmy' ? '' : ' · Shift: do it again'}`;
    if (this.armedEl.textContent !== full) this.armedEl.textContent = full;
    this.armedEl.style.display = 'block';
    this.armedEl.style.left = `${this.mouse.x + 18}px`;
    this.armedEl.style.top = `${this.mouse.y + 18}px`;
  }

  /** On a touch screen: the armed command as a banner at the top, with a Cancel button (there's no cursor to follow). */
  private banner: HTMLElement | null = null;
  private showArmedBanner(text: string | undefined): void {
    if (this.armedEl) this.armedEl.style.display = 'none';
    if (!text) { if (this.banner) this.banner.style.display = 'none'; return; }
    if (!this.banner) {
      this.banner = document.createElement('div');
      this.banner.className = 'armed-banner';
      this.banner.innerHTML = '<span></span><button type="button">Cancel</button>';
      this.banner.querySelector('button')!.addEventListener('click', () => { this.mode = null; });
      document.getElementById('hud')!.appendChild(this.banner);
    }
    const full = this.mode === 'resupplyDest' ? 'Resupply, then: tap where they go after. Cancel: they come back.'
      : text.replace('(right-drag: a line)', '(drag: a line)').replace(/right-click/g, 'tap');
    const span = this.banner.querySelector('span')!;
    if (span.textContent !== full) span.textContent = full;
    this.banner.style.display = 'flex';
  }

  /** The formation to draw under the cursor: while choosing where to send the group, or dragging out its front. */
  private previewSlots(): Slot[] | null {
    const units = this.selectedUnits();
    if (units.length < 2 || !this.mouse.inside) return null;
    const d = this.drag;
    if (d?.button === 2 && d.moved && this.mode !== 'place') { const f = this.dragFront(d, this.mouse.x, this.mouse.y); return f ? this.slotsAt(units, ...f) : null; }
    if (this.mode !== 'move' && this.mode !== 'attackMove' && this.mode !== 'charge') return null;
    const [wx, wy] = this.renderer.cam.toWorld(this.mouse.x, this.mouse.y);
    return this.slotsAt(units, wx, wy);
  }

  private ping(x: number, y: number, color: string): void {
    this.rs.ping = { x, y, t: 0, color };
  }

  private keydown(e: KeyboardEvent): void {
    // typing in a text field isn't a hotkey (a ticked checkbox or a slider that still has focus is no reason to ignore keys)
    const el = e.target as HTMLInputElement;
    const typing = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'submit'].includes(el.type));
    if (typing || settingsOpen()) return;
    const k = e.key.toLowerCase();
    const km = keymap();
    this.keys.add(k);
    const w = this.world;
    const units = this.selectedUnits();
    const myTc = this.supplyBuilding(units) ?? w.baseOf(this.player);
    const tcSelected = [...this.rs.selected].map((id) => w.buildings.get(id)).find((b) => b && b.owner === this.player && b.complete);

    if (/^[0-8]$/.test(k)) { // 9 toggles the cart debug overlay
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.saveGroup(k); return; }
      this.recallGroup(k);
      return;
    }
    if (tcSelected && units.length === 0) {
      const i = km.train.indexOf(k);
      const specId = tcSelected.spec.trains?.[i];
      if (specId) { this.issue({ type: 'train', building: tcSelected.id, specId }); return; }
    }
    if (k === 'backspace' || k === 'delete') {
      if (this.destroySelected()) e.preventDefault();
      return;
    }
    if (units.length) {
      if (k === km.attackMove) { this.mode = 'attackMove'; return; }
      if (k === km.move) { this.mode = 'move'; return; }
      if (k === km.tend) { this.hudCommand('tend'); return; }
      if (k === km.give) { this.mode = 'give'; return; }
      if (k === km.garrison) { this.mode = 'garrison'; return; }
      if (k === km.hold) { this.hudCommand('hold'); return; }
      if (k === km.charge) { this.mode = 'charge'; return; }
      if (k === km.stop) { this.issue({ type: 'stop', units }); return; }
      // Tap: resupply and come back. Hold and click: resupply, then go there.
      if (k === km.resupply) {
        if (myTc && !e.repeat) { this.issue({ type: 'resupply', units, building: myTc.id }); this.mode = 'resupplyDest'; }
        return;
      }
    }
    if (k === km.home && this.goHome()) return;
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

  /** Remember the selection as group `k` (Ctrl+number). */
  saveGroup(k: string): void { this.groups.set(k, [...this.rs.selected]); }

  /** Select group `k` (a number key); twice quickly also jumps the camera to it. False if there's no such group. */
  recallGroup(k: string): boolean {
    const g = this.groups.get(k), w = this.world;
    if (!g) return false;
    this.setSelection(g.filter((id) => w.units.has(id) || w.buildings.has(id)));
    const now = performance.now();
    if (this.lastGroupKey.key === k && now - this.lastGroupKey.t < 400) this.centerOnSelection();
    this.lastGroupKey = { t: now, key: k };
    return true;
  }

  /** Kill the selected units and knock down the selected buildings (your own only). False if none are yours. */
  destroySelected(): boolean {
    const w = this.world;
    const mine = [...this.rs.selected].filter((id) => (w.units.get(id) ?? w.buildings.get(id))?.owner === this.player);
    if (mine.length) this.issue({ type: 'destroy', ids: mine });
    return mine.length > 0;
  }

  /** Select your base and look at it. */
  goHome(): boolean {
    const base = this.world.baseOf(this.player);
    if (!base) return false;
    this.setSelection([base.id]);
    this.centerOnSelection();
    return true;
  }

  /** Select every fighting unit you have (not workers or carts): the touch bar's Army. */
  selectArmy(): void {
    const w = this.world, worker = w.factionOf(this.player).workerId;
    this.setSelection(w.unitsOf(this.player).filter((u) => u.stats.canAttack && u.specId !== worker && !u.carter && !u.dummy).map((u) => u.id), true);
  }

  /** How many of your workers stand idle. */
  idleWorkers(): number { return this.world.unitsOf(this.player).filter((u) => this.world.idleWorker(u)).length; }

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
    const idle = this.world.unitsOf(this.player).filter((u) => this.world.idleWorker(u));
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

  /** Shift held on this click: unit orders queue after what they're doing. */
  private queueing = false;
  private issue(cmd: Command): void { this.send(this.queueing ? { ...cmd, queue: true } : cmd); }

  /** Start placing a building (from the HUD build menu). */
  startPlacing(specId: string): void {
    if (!this.builders(this.selectedUnits(), specId).length) return;
    this.placeSpec = specId;
    this.mode = 'place';
  }

  /** Who of the selection builds `specId`: its workers, or (a building bodies lay down) those that can lay it. */
  private builders(units: number[], specId: string): number[] {
    if (!bodyBuilt(this.world, this.player, specId)) return this.workers(units);
    return units.filter((id) => { const u = this.world.units.get(id); return !!u && canLayDown(this.world, u, specId); });
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
  hudCommand(kind: 'stop' | 'attackMove' | 'move' | 'resupply' | 'give' | 'garrison' | 'hold' | 'charge' | 'tend' | 'rallyWork' | 'rallyArmy'): void {
    if (kind === 'rallyWork' || kind === 'rallyArmy') { this.mode = kind; return; } // then right-click where (no units needed)
    const units = this.selectedUnits();
    if (!units.length) return;
    if (kind === 'tend') { this.issue({ type: 'tend', units }); return; }
    if (kind === 'charge') { this.mode = 'charge'; return; } // then click what to charge
    if (kind === 'hold') {
      // a toggle: if they're all already holding, back to deciding for themselves
      const all = units.every((id) => this.world.units.get(id)?.stance === kind);
      this.issue({ type: 'stance', units, stance: all ? 'auto' : kind });
      return;
    }
    if (kind === 'stop') this.issue({ type: 'stop', units });
    else if (kind === 'resupply') {
      const tc = this.supplyBuilding(units);
      if (tc) this.issue({ type: 'resupply', units, building: tc.id });
      // (on a touch screen, which can't hold the key: the next tap picks where they go after, Cancel brings them back)
      if (tc && this.viaTouch) this.mode = 'resupplyDest';
    }
    else this.mode = kind;
  }
}
