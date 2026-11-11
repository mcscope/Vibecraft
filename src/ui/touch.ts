// Touch screens (phones and tablets). The same rule as the mouse: a tap selects, a long-press does. A tile that arms
// a command (Attack, Move, a building to place, a rally point) makes the next tap do it. One finger drags the map,
// two fingers pinch to zoom.
import type { Camera } from '../render/camera';
import type { Input } from './input';

/** Is this a touch screen? (?touch=1 or ?touch=0 forces it, to try the touch layout on a desktop.) */
export const TOUCH = ((): boolean => {
  if (typeof window === 'undefined') return false; // (tests run without a page)
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1' || q === '0') return q === '1';
  if (matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches)) return true;
  // (some phone browsers report a fine pointer: a touch screen no wider than a tablet is a phone or tablet too)
  return navigator.maxTouchPoints > 0 && 'ontouchstart' in window && Math.min(screen.width, screen.height) <= 900;
})();

/** How long a finger stays put to count as a long-press (ms). */
const LONG_MS = 450;
/** How far a finger may wander and still be a tap or a long-press (CSS px). */
const SLOP = 10;

/** Mouse words in UI text, said for fingers (on a touch screen; elsewhere the text is unchanged). */
export function words(s: string): string {
  if (!TOUCH) return s;
  return s
    .replace('Click: train · Hold: auto-train on/off · Right-click: cancel last', 'Tap: train · Press and hold: auto-train on or off · Tap it in the queue to cancel')
    .replace(/Hold the key and click the ground to send them there afterwards\./g, 'Then tap the ground to send them there afterwards.')
    // (an order tile's tip: the tile arms it, and the next tap does it)
    .replace(/Right-click (where|an enemy)/g, 'Then tap $1')
    .replace(/then right-click/g, 'then tap').replace(/then right-drag/g, 'then drag')
    // (an order tapped in the panel: "tap Charge and right-click a fenling" is a tap too)
    .replace(/(tap <b>[^<]+<\/b>,? (?:and|then)) right-click/gi, '$1 tap')
    .replace(/\bpress Restart\b/g, 'tap Restart')
    .replace(/Right-drag/g, 'Press, hold and drag').replace(/right-drag/g, 'press, hold and drag')
    .replace(/Right-click/g, 'Press and hold').replace(/right-click/g, 'press and hold')
    .replace(/Left-click/g, 'Tap').replace(/left-click/g, 'tap')
    .replace(/double-click/g, 'double-tap')
    .replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap');
}

/** The touch controls, in plain words (the settings dialog shows them). */
export const TOUCH_HELP = `
  <table class="keys">
    <tr><td>Tap</td><td>Select a unit or building. Tap empty ground to clear.</td></tr>
    <tr><td>Double-tap</td><td>Select every unit of that type on screen.</td></tr>
    <tr><td>Press and hold</td><td>Give the order that fits the spot: move, attack, gather, build or set a rally point.</td></tr>
    <tr><td>Hold and drag</td><td>Draw the front line for the group to form up on.</td></tr>
    <tr><td>Drag</td><td>Move the map. Pinch to zoom.</td></tr>
    <tr><td>Army</td><td>Select every fighting unit.</td></tr>
    <tr><td>Idle</td><td>Select the next idle worker.</td></tr>
    <tr><td>Box</td><td>Turn on, then drag to select everything in a box.</td></tr>
    <tr><td>Add</td><td>Turn on to add to the selection and queue orders.</td></tr>
    <tr><td>Center</td><td>Look at the selection.</td></tr>
    <tr><td>More</td><td>Your base, groups 1–3 (hold to store, tap to select), game speed, full screen, delete.</td></tr>
    <tr><td>Order tiles</td><td>Attack, Move, Charge, a building: tap the tile, then tap the spot. Cancel in the banner.</td></tr>
    <tr><td>✕ and Show all</td><td>Clear the selection, or open the whole panel.</td></tr>
    <tr><td>Minimap</td><td>Tap or drag to look there. Press and hold to send the selection there.</td></tr>
    <tr><td>Any button</td><td>Press and hold to read what it does.</td></tr>
  </table>`;

/** Set up the page for touch: the touch layout, and no page zoom or bounce under the game. */
export function initTouchPage(): void {
  if (!TOUCH) return;
  document.documentElement.classList.add('touch');
  // the gear opens the game's menu: settings, the touch controls, and Resign
  const gear = document.getElementById('gear');
  if (gear) { gear.textContent = '☰'; gear.title = 'Menu: touch controls, sound, and Resign'; }
  const h2 = document.querySelector('#settings h2');
  if (h2) h2.textContent = 'Menu';
  // iOS Safari ignores user-scalable=no: stop its pinch-zoom of the page (the map has its own)
  for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
  // a phone has no console to read: show the first errors on screen, so a player can report them
  let shown = 0;
  const report = (what: string) => {
    if (shown++ >= 3) return;
    let box = document.getElementById('touch-errors');
    if (!box) {
      box = document.createElement('div');
      box.id = 'touch-errors';
      box.addEventListener('click', () => box!.remove());
      document.body.appendChild(box);
    }
    const line = document.createElement('div');
    line.textContent = what.slice(0, 300);
    box.appendChild(line);
  };
  window.addEventListener('error', (e) => report(`Error: ${e.message} (${(e.filename ?? '').split('/').pop()}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => report(`Error: ${(e.reason as Error)?.message ?? String(e.reason)}`));
}

/** The render resolution: at most 2× (sprites are baked at ≤ 2×), and on a big touch screen few enough pixels to keep the frame rate. */
export function renderScale(w: number, h: number): number {
  const dpr = window.devicePixelRatio || 1;
  if (!TOUCH) return Math.min(2, dpr);
  return Math.max(1, Math.min(2, dpr, Math.sqrt(2.4e6 / Math.max(1, w * h))));
}

type State = 'idle' | 'pending' | 'pan' | 'do' | 'box' | 'place' | 'pinch';

/** Finger gestures on the map and the minimap, turned into the Input's presses (0 selects, 2 does). */
export class TouchControls {
  /** Drag selects a box instead of moving the map (the touch bar's Box). */
  boxMode = false;
  /** A screen that takes the press first (a pitched battle's deployment): true if it used it. */
  intercept?: (sx: number, sy: number, button: number) => boolean;
  private state: State = 'idle';
  private start = { x: 0, y: 0 };
  private last = { x: 0, y: 0 };
  private timer = 0;
  private pinch = { d: 1, x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement, private input: Input, private cam: Camera, minimap: HTMLCanvasElement) {
    const opt = { passive: false };
    canvas.addEventListener('touchstart', (e) => this.onStart(e), opt);
    canvas.addEventListener('touchmove', (e) => this.onMove(e), opt);
    canvas.addEventListener('touchend', (e) => this.onEnd(e), opt);
    canvas.addEventListener('touchcancel', (e) => this.onCancel(e), opt);
    this.minimap(minimap);
  }

  private clearTimer(): void { clearTimeout(this.timer); this.timer = 0; }

  private onStart(e: TouchEvent): void {
    e.preventDefault();
    const inp = this.input;
    inp.viaTouch = true;
    if (e.touches.length >= 2) {
      // a second finger: whatever the first was doing, it's a pinch now
      this.clearTimer();
      if (this.state === 'do' || this.state === 'box' || this.state === 'place') inp.cancelPress();
      inp.setPointer(this.last.x, this.last.y, false);
      this.state = 'pinch';
      this.pinch = two(e.touches);
      return;
    }
    if (this.state !== 'idle') return;
    const t = e.touches[0];
    this.start = { x: t.clientX, y: t.clientY };
    this.last = { ...this.start };
    inp.setPointer(t.clientX, t.clientY, true);
    if (inp.mode === 'place') { inp.press(t.clientX, t.clientY, 2); this.state = 'place'; return; } // the ghost follows the finger
    if (this.boxMode) { inp.press(t.clientX, t.clientY, 0); this.state = 'box'; return; }
    this.state = 'pending';
    this.timer = window.setTimeout(() => this.longPress(), LONG_MS);
  }

  private longPress(): void {
    this.timer = 0;
    if (this.state !== 'pending') return;
    navigator.vibrate?.(12);
    const { x, y } = this.start;
    if (this.intercept?.(x, y, 2)) { this.state = 'pan'; return; } // (used: the rest of this touch only moves the map)
    this.state = 'do';
    this.input.press(x, y, 2);
  }

  private onMove(e: TouchEvent): void {
    e.preventDefault();
    if (this.state === 'pinch') {
      if (e.touches.length < 2) return;
      const p = two(e.touches);
      this.cam.pan(this.pinch.x - p.x, this.pinch.y - p.y);
      this.cam.zoomAt(p.d / this.pinch.d, p.x, p.y);
      this.pinch = p;
      return;
    }
    const t = e.touches[0];
    if (!t) return;
    const x = t.clientX, y = t.clientY;
    const far = Math.hypot(x - this.start.x, y - this.start.y) > SLOP;
    if (this.state === 'pending' && far) { this.clearTimer(); this.state = 'pan'; }
    if (this.state === 'pan') this.cam.pan(this.last.x - x, this.last.y - y);
    // (a long-press only becomes a drag once it really moves: a shaky finger still gives a plain command)
    else if (this.state === 'do' || this.state === 'box' || this.state === 'place') { if (far || this.state === 'place') this.input.pointerMove(x, y); }
    this.last = { x, y };
  }

  private onEnd(e: TouchEvent): void {
    e.preventDefault();
    const inp = this.input;
    if (e.touches.length > 0) {
      // one finger of a pinch lifted: the other carries on moving the map
      if (this.state === 'pinch') { this.state = 'pan'; this.last = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
      return;
    }
    this.clearTimer();
    const t = e.changedTouches[0];
    const x = t?.clientX ?? this.last.x, y = t?.clientY ?? this.last.y;
    const shift = inp.shiftLatch;
    if (this.state === 'pending') {
      // a tap: selects, or (a command armed) does it
      const button = inp.mode ? 2 : 0;
      if (!this.intercept?.(x, y, button)) { inp.press(x, y, button); inp.release(x, y, shift); }
    } else if (this.state === 'do' || this.state === 'box' || this.state === 'place') {
      // (a long-press that stayed put commands where it started, however the finger rolled)
      const still = this.state === 'do' && Math.hypot(x - this.start.x, y - this.start.y) <= SLOP;
      inp.release(still ? this.start.x : x, still ? this.start.y : y, shift);
    }
    inp.setPointer(x, y, false);
    this.state = 'idle';
  }

  private onCancel(e: TouchEvent): void {
    e.preventDefault();
    this.clearTimer();
    this.input.cancelPress();
    this.input.setPointer(this.last.x, this.last.y, false);
    this.state = 'idle';
  }

  /** The minimap: tap or drag to look there; long-press sends the selection there. */
  private minimap(mm: HTMLCanvasElement): void {
    let start = { x: 0, y: 0 }, moved = false, used = false, timer = 0;
    const look = (x: number, y: number) => this.cam.centerOn(...this.input.miniToWorld(x, y));
    mm.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.input.viaTouch = true;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY }; moved = false; used = false;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        used = true;
        navigator.vibrate?.(12);
        const [wx, wy] = this.input.miniToWorld(start.x, start.y);
        this.input.contextCommand(wx, wy, 0, this.input.shiftLatch);
      }, LONG_MS);
    }, { passive: false });
    mm.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!moved && Math.hypot(t.clientX - start.x, t.clientY - start.y) < 6) return;
      moved = true;
      clearTimeout(timer);
      if (!used) look(t.clientX, t.clientY);
    }, { passive: false });
    mm.addEventListener('touchend', (e) => {
      e.preventDefault();
      clearTimeout(timer);
      if (!used && !moved) look(start.x, start.y);
    }, { passive: false });
  }
}

function two(ts: TouchList): { d: number; x: number; y: number } {
  const a = ts[0], b = ts[1];
  return { d: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

/**
 * The touch bar: on-screen buttons for what the keyboard does. It stays in one place (along the bottom; down the left
 * side of a phone held sideways), so a button is always where your thumb left it. More opens a second set.
 */
export function mountTouchbar(bar: HTMLElement, input: Input, touch: TouchControls, opts: { chat: boolean }): void {
  if (!TOUCH) return;
  const fs = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const canFull = !!(fs.requestFullscreen || fs.webkitRequestFullscreen);
  const btn = (id: string, label: string, tip: string) => `<button type="button" data-tb="${id}" title="${tip}">${label}</button>`;
  bar.innerHTML = `<div class="tb-main">${[
    btn('army', 'Army', 'Army: select every fighting unit you have'),
    btn('idle', 'Idle <b>0</b>', 'Idle: select the next idle worker and look at it'),
    btn('box', 'Box', 'Box: turn on, then drag to select everything in a box'),
    btn('add', 'Add', 'Add: taps add to the selection, orders queue, and an armed order stays armed'),
    btn('center', 'Center', 'Center: look at the selection'),
    btn('pause', 'Pause', 'Pause or resume the game'),
    btn('more', 'More', 'More buttons: your base, groups, game speed, full screen, delete'),
  ].join('')}</div><div class="tb-more">${[
    btn('home', 'Base', 'Base: select your main building and look at it'),
    ...['1', '2', '3'].map((k) => btn(`g${k}`, k, `Group ${k}: press and hold to store the selection, tap to select it`)),
    btn('speed', '1×', 'Game speed: tap to change'),
    opts.chat ? btn('chat', 'Chat', 'Talk to the other player') : '',
    canFull ? btn('full', 'Full', 'Full screen on or off') : '',
    btn('delete', 'Delete', 'Delete: kill the selected units or knock down the selected building'),
  ].join('')}</div>`;
  const idle = bar.querySelector<HTMLElement>('[data-tb="idle"]')!;
  const more = (open: boolean) => { bar.classList.toggle('more', open); bar.querySelector('[data-tb="more"]')!.classList.toggle('on', open); };
  const pause = bar.querySelector<HTMLElement>('[data-tb="pause"]')!;
  window.setInterval(() => {
    if (pause.classList.contains('on') !== input.paused) { pause.textContent = input.paused ? 'Play' : 'Pause'; pause.classList.toggle('on', input.paused); }
    const n = input.idleWorkers();
    idle.querySelector('b')!.textContent = `${n}`;
    idle.classList.toggle('none', n === 0);
  }, 400);
  // a group button: hold to store, tap to select (an empty one stores on a tap too)
  let hold = 0, held = false;
  bar.addEventListener('pointerdown', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tb^="g"]');
    if (!b) return;
    held = false;
    hold = window.setTimeout(() => { held = true; input.saveGroup(b.dataset.tb!.slice(1)); b.classList.add('set'); navigator.vibrate?.(12); }, LONG_MS);
  });
  window.addEventListener('pointerup', () => clearTimeout(hold));
  bar.addEventListener('contextmenu', (e) => e.preventDefault());
  // (a touch on the map closes More)
  document.getElementById('game')!.addEventListener('touchstart', () => more(false), { passive: true });
  bar.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tb]');
    if (!b) return;
    const id = b.dataset.tb!;
    input.viaTouch = true;
    if (id === 'more') { more(!bar.classList.contains('more')); return; }
    if (b.closest('.tb-more') && id !== 'speed' && id[0] !== 'g') more(false);
    if (id === 'army') input.selectArmy();
    else if (id === 'idle') input.nextIdleWorker();
    else if (id === 'box') { touch.boxMode = !touch.boxMode; b.classList.toggle('on', touch.boxMode); }
    else if (id === 'add') { input.shiftLatch = !input.shiftLatch; b.classList.toggle('on', input.shiftLatch); }
    else if (id === 'center') input.centerOnSelection();
    else if (id === 'home') input.goHome();
    else if (id[0] === 'g') {
      if (held) return; // (that was a hold: stored)
      const k = id.slice(1);
      if (!input.recallGroup(k) && input.selected.size) { input.saveGroup(k); b.classList.add('set'); }
    } else if (id === 'pause') { input.paused = !input.paused; b.textContent = input.paused ? 'Play' : 'Pause'; b.classList.toggle('on', input.paused); }
    else if (id === 'speed') {
      const speeds = [1, 2, 4, 0.5];
      input.speed = speeds[(speeds.indexOf(input.speed) + 1) % speeds.length] ?? 1;
      b.textContent = `${input.speed}×`;
    } else if (id === 'chat') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    else if (id === 'full') {
      if (document.fullscreenElement) void document.exitFullscreen?.();
      else if (fs.requestFullscreen) void fs.requestFullscreen().catch(() => {});
      else fs.webkitRequestFullscreen?.();
    } else if (id === 'delete') {
      if (input.selected.size) void ask('Kill the selected units, or knock down the selected building?', 'Delete', 'Keep them').then((yes) => { if (yes) input.destroySelected(); });
    }
  });
}

/**
 * The panel's own buttons on a touch screen: ✕ clears the selection, and Show all / Show less opens the whole panel
 * (a phone shows a short one: who is selected and their main orders).
 */
export function mountPanelControls(ctl: HTMLElement, bottom: HTMLElement, input: Input): void {
  if (!TOUCH) return;
  ctl.innerHTML = '<button type="button" data-pc="expand" title="Show the whole panel, or just its first rows">▲ Show all</button><button type="button" data-pc="clear" title="Clear the selection">✕</button>';
  const expand = ctl.querySelector<HTMLElement>('[data-pc="expand"]')!, clear = ctl.querySelector<HTMLElement>('[data-pc="clear"]')!;
  ctl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pc]');
    if (!b) return;
    if (b.dataset.pc === 'clear') { input.mode = null; input.setSelection([]); return; }
    const open = bottom.classList.toggle('expanded');
    expand.textContent = open ? '▼ Show less' : '▲ Show all';
  });
  window.setInterval(() => { clear.style.visibility = input.selected.size ? '' : 'hidden'; }, 250);
}

/**
 * Where the HUD covers the map on a touch screen (top bar, touch bar, panel): the camera centres things in what's left,
 * so Center and the minimap put your units in the open, not behind the panel.
 */
export function trackOpenMap(cam: Camera): void {
  if (!TOUCH) return;
  const parts = ['topbar', 'touchbar', 'panel'].map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
  const measure = () => {
    if (document.getElementById('bottom')?.classList.contains('expanded')) return; // (a look at the whole panel leaves the camera be)
    const W = window.innerWidth, H = window.innerHeight, n = { top: 0, right: 0, bottom: 0, left: 0 };
    // (stacked from each edge in: the panel sits on the touch bar)
    const rects = parts.map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height);
    for (let pass = 0; pass < 2; pass++) {
      for (const r of rects) {
        const wide = r.width > W * 0.6, tall = r.height > H * 0.5;
        if (wide && r.top <= n.top + 1) n.top = Math.max(n.top, r.bottom);
        else if (wide && r.bottom >= H - n.bottom - 1) n.bottom = Math.max(n.bottom, H - r.top);
        else if (tall && r.left <= n.left + 1) n.left = Math.max(n.left, r.right);
        else if (tall && r.right >= W - n.right - 1) n.right = Math.max(n.right, W - r.left);
      }
    }
    const o = cam.inset;
    if (n.top !== o.top || n.right !== o.right || n.bottom !== o.bottom || n.left !== o.left) cam.setInset(n);
  };
  measure();
  window.addEventListener('resize', measure);
  window.setInterval(measure, 300);
}

/** An in-game yes-or-no box (a browser's confirm() is one stray tap from yes): resolves true for yes. */
export function ask(text: string, yes: string, no: string): Promise<boolean> {
  document.getElementById('ask')?.remove();
  const box = document.createElement('div');
  box.id = 'ask';
  box.innerHTML = `<div class="menu-box ask-box"><p></p><div class="ask-buttons"><button type="button" data-no></button><button type="button" data-yes class="danger"></button></div></div>`;
  box.querySelector('p')!.textContent = text;
  box.querySelector('[data-yes]')!.textContent = yes;
  box.querySelector('[data-no]')!.textContent = no;
  document.body.appendChild(box);
  return new Promise((done) => {
    box.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const answer = t.closest('[data-yes]') ? true : t.closest('[data-no]') || t === box ? false : null;
      if (answer === null) return;
      box.remove();
      done(answer);
    });
  });
}
