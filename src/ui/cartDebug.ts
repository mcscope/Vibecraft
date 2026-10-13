// Cart debug overlay (9): every supply carrier's current job drawn on the map,
// plus a text readout of each building's stock, targets, shortfall and surplus.
import type { Camera } from '../render/camera';
import type { Stock } from '../factions/types';
import { RESOURCES, type Building, type Unit, type World } from '../sim/world';
import { settings, updateSettings } from './settings';

/** Plain integers (no separators) so the monospace columns line up. */
const int = (v: number) => Math.round(v).toString();
const stock = (s: Stock) => RESOURCES.map((r) => int(s[r]).padStart(4)).join('');
const ZERO = (s: Stock) => RESOURCES.every((r) => Math.abs(s[r]) < 0.5);
const PHASE_COLOR: Record<string, string> = { load: '#c8c0a8', deliver: '#7aff7a' };

export class CartDebug {
  private panel: HTMLElement;
  private svg: SVGSVGElement;
  private labels = new Map<number, HTMLElement>();
  private layer: HTMLElement;
  private textT = 0;

  constructor(private world: World, private cam: Camera, private player: number) {
    this.panel = document.createElement('pre');
    this.panel.id = 'cart-debug';
    this.layer = document.createElement('div');
    this.layer.id = 'cart-debug-layer';
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.layer.appendChild(this.svg);
    document.body.append(this.layer, this.panel);
    window.addEventListener('keydown', (e) => {
      if (e.key !== '9' || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      e.preventDefault();
      updateSettings({ cartDebug: !settings().cartDebug });
    });
  }

  private carriers(): Unit[] {
    return [...this.world.units.values()].filter((u) => u.owner === this.player && u.order.kind === 'cart');
  }

  private name(b: Building | undefined): string {
    return b ? `${b.spec.name}#${b.id}` : '—';
  }

  update(alpha: number, dt: number): void {
    const on = settings().cartDebug;
    this.panel.style.display = this.layer.style.display = on ? '' : 'none';
    if (!on) return;
    const w = this.world, cam = this.cam;
    const carts = this.carriers();

    // lines and labels, every frame
    this.svg.setAttribute('width', `${cam.width}`);
    this.svg.setAttribute('height', `${cam.height}`);
    let lines = '';
    const seen = new Set<number>();
    const placed: Array<[number, number]> = []; // label anchors already used this frame
    for (const u of carts) {
      if (u.order.kind !== 'cart') continue;
      const o = u.order;
      seen.add(u.id);
      const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
      const [sx, sy] = cam.toScreen(x, y);
      // where it's heading now: the building it loads at, or the one it delivers to
      const dest = o.phase === 'load' ? w.buildings.get(o.from || o.base) : w.buildings.get(o.home);
      const color = PHASE_COLOR[o.phase] ?? '#fff';
      if (dest) {
        const [dx, dy] = cam.toScreen(dest.ox + dest.size / 2, dest.oy + dest.size / 2);
        lines += `<line x1="${sx}" y1="${sy}" x2="${dx}" y2="${dy}" stroke="${color}" stroke-width="2" stroke-dasharray="${o.phase === 'load' ? '4 4' : 'none'}" opacity="0.8"/>`;
      }
      // and, while loading, the building it's loading for
      if (o.phase === 'load' && o.from && o.home) {
        const h = w.buildings.get(o.home);
        if (h) {
          const [hx, hy] = cam.toScreen(h.ox + h.size / 2, h.oy + h.size / 2);
          lines += `<line x1="${sx}" y1="${sy}" x2="${hx}" y2="${hy}" stroke="#ffd23f" stroke-width="1" stroke-dasharray="2 5" opacity="0.6"/>`;
        }
      }
      let el = this.labels.get(u.id);
      if (!el) { el = document.createElement('div'); el.className = 'cd-label'; this.layer.appendChild(el); this.labels.set(u.id, el); }
      const cargo = `${int(u.food)}f ${int(u.wood)}w ${int(u.crystal)}c`;
      const job = o.phase === 'load'
        ? (o.from ? `loading ${o.res} at ${this.name(w.buildings.get(o.from))} for ${this.name(w.buildings.get(o.home))}` : 'idle: nothing needed')
        : `delivering to ${this.name(w.buildings.get(o.home))}`;
      el.textContent = `#${u.id} ${u.carter ? '' : '(hand) '}${job}${o.pinned ? ' 📌' : ''} · ${cargo}`;
      el.style.color = color;
      // stack labels of carts bunched together instead of overlapping them
      let ly = sy - 54 * cam.zoom;
      while (placed.some(([px, py]) => Math.abs(px - sx) < 160 && Math.abs(py - ly) < 15)) ly -= 15;
      placed.push([sx, ly]);
      el.style.transform = `translate(${sx}px, ${ly}px) translate(-50%, -100%)`;
    }
    this.svg.innerHTML = lines;
    for (const [id, el] of this.labels) if (!seen.has(id)) { el.remove(); this.labels.delete(id); }

    // the text panel, a few times a second
    if ((this.textT += dt) < 0.25) return;
    this.textT = 0;
    const base = w.baseOf(this.player);
    const out: string[] = [];
    out.push(`CART DEBUG (9)               food wood crys`);
    out.push(`  grey dashes: going to load   green: delivering`);
    out.push(`  gold dots: who it's loading for`);
    if (base) {
      out.push(`BASE ${this.name(base)}`);
      out.push(`  stock                      ${stock(base.stock)}`);
      out.push(`  reserved for queue         ${stock(w.logistics.reserve(base))}`);
      out.push(`  spare to send out          ${stock(w.logistics.spare(base))}`);
      out.push(`  queue: ${base.queue.map((q) => (q.kind === 'unit' ? `${q.specId}${q.paid ? '' : '(waiting)'}` : q.techId)).join(', ') || '—'}`);
    }
    out.push('');
    out.push(`CARRIERS ${carts.length}`);
    for (const u of carts) {
      if (u.order.kind !== 'cart') continue;
      const o = u.order;
      const idleCart = o.phase === 'load' && !o.from;
      out.push(`  #${String(u.id).padEnd(5)} ${(u.carter ? u.specId : `${u.specId}*`).padEnd(9)} ${idleCart ? 'idle (nothing needed)'.padEnd(15) : `${o.phase.padEnd(7)} ${o.res.padEnd(7)}`} ${idleCart ? ''.padEnd(27) : `home ${this.name(w.buildings.get(o.home)).padEnd(22)}`} cargo ${int(u.food)}f/${int(u.wood)}w/${int(u.crystal)}c free ${int(w.freeCapacity(u))}${o.pinned ? ' pinned' : ''}`);
    }
    const idle = [...w.units.values()].filter((u) => u.owner === this.player && u.carter && u.order.kind !== 'cart');
    if (idle.length) out.push(`  not on cart duty: ${idle.map((u) => `#${u.id} ${u.order.kind}`).join(', ')}`);
    out.push('');
    out.push(`BUILDINGS                    food wood crys`);
    for (const b of w.buildingsOf(this.player)) {
      if (b === base) continue;
      out.push(`${this.name(b)}${b.complete ? '' : ` (building ${int(b.built)}/${int(b.stats.totalCost)})`}  carts→ ${w.logistics.cartsServing(b)}`);
      out.push(`  stock                      ${stock(b.stock)}`);
      const t = w.logistics.supplyTargets(b), s = w.logistics.shortfall(b), sp = w.logistics.spare(b);
      if (!ZERO(t)) out.push(`  target                     ${stock(t)}`);
      if (!ZERO(s)) out.push(`  short (after inbound)      ${stock(s)}`);
      if (!ZERO(sp)) out.push(`  spare (carts can take)     ${stock(sp)}`);
    }
    this.panel.textContent = out.join('\n');
  }
}
