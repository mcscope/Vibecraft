// Logistics: who needs what, who can spare it, and the carts (and hauling
// workers) that move it. One rule: take resources from where there's spare to
// where there's need — most urgent first, over the shortest whole trip — with the
// base's waiting orders first in line.
import type { ResourceKind, Stock } from '../factions/types';
import { growWant } from './abilities/living';
import { CAP } from './physics';
import {
  itemCost, MAX_QUEUE, plantKg, RESOURCES, TOWER_STOCK_SHOTS, emptyStock,
  type Building, type Order, type Unit, type World,
} from './world';

/** Berries kept where units are made, for them to eat. */
export const FOOD_STASH = 20;

export class Logistics {
  constructor(private readonly w: World) {}

  /** Stock a building wants kept on hand (carters fill up to this). */
  /**
   * What a building wants on hand: exactly what its queued orders still need
   * (nothing is stocked ahead of time), a small berry stash where units are made
   * (for them to eat), a tower's ammo, and the seed for a sowing building's
   * next planting (planting is its order).
   */
  supplyTargets(b: Building): Stock {
    const t = emptyStock();
    if (!b.complete) return t;
    const queued = this.reserve(b);
    for (const r of RESOURCES) t[r] = queued[r];
    if (b.spec.trains?.length) t.food += FOOD_STASH;
    t.food += growWant(b); // a living building eats to grow
    if (b.stats.tower && b.spec.attack) t.crystal += (b.spec.attack.stockShots ?? TOWER_STOCK_SHOTS) * b.spec.attack.crystalMass;
    const next = this.w.sowNext(b);
    if (next) t[next] = Math.max(t[next], Math.ceil(plantKg(b.spec, next) * CAP.sowSeedFraction));
    return t;
  }

  /** Carts in a producer building's pool, counting ones queued there. */
  poolSize(b: Building): number {
    let n = 0;
    for (const u of this.w.units.values()) if (u.carter && u.owner === b.owner && u.order.kind === 'cart' && u.order.base === b.id) n++;
    for (const q of b.queue) if (q.kind === 'unit' && q.home === b.id) n++;
    return n;
  }

  /** Carts actually on their way to bring `b` some of `r` (fetching it for the base counts). */
  cartsBringing(b: Building, r: ResourceKind): number {
    let n = 0;
    for (const u of this.w.units.values()) {
      if (u.owner !== b.owner || u.order.kind !== 'cart') continue;
      const o = u.order;
      const held = r === 'food' ? u.food : r === 'wood' ? u.wood : u.crystal;
      if (o.home === b.id && (o.phase === 'load' ? !!o.from && o.res === r : held > 0.05)) n++;
    }
    return n;
  }

  cartsServing(b: Building): number {
    let n = 0;
    for (const u of this.w.units.values()) if (u.order.kind === 'cart' && u.order.home === b.id) n++;
    return n;
  }

  /** Nearest building that keeps a cart pool. */
  nearestProducer(u: Unit): Building | null {
    return this.w.nearestCache(u, (b) => (b.spec.carters ?? 0) > 0);
  }

  /** An unassigned cart joins the nearest producer's pool. */
  autoAssignCart(u: Unit): void {
    const p = this.nearestProducer(u);
    u.order = p ? { kind: 'cart', base: p.id, home: 0, pinned: false, phase: 'load', res: 'food' } : { kind: 'idle' };
    u.path = [];
  }

  /** Producer buildings (e.g. the town center) keep their cart pool topped up. */
  requestCarters(b: Building): void {
    const want = b.spec.carters ?? 0;
    const carterId = this.w.factionOf(b.owner).carterId;
    if (!want || !carterId || this.poolSize(b) >= want) return;
    // an idle cart joins before we pay for a new one
    for (const u of this.w.units.values()) {
      if (u.carter && u.owner === b.owner && u.order.kind === 'idle') { u.order = { kind: 'cart', base: b.id, home: 0, pinned: false, phase: 'load', res: 'food' }; u.path = []; return; }
    }
    const s = this.w.specOf(b.owner, carterId);
    if (!s || b.queue.length >= MAX_QUEUE) return;
    if (b.stock.food < s.stats.foodCost || b.stock.crystal < s.stats.crystalCost) return;
    b.stock.food -= s.stats.foodCost;
    b.stock.crystal -= s.stats.crystalCost;
    b.queue.push({ kind: 'unit', specId: carterId, progress: 0, total: s.stats.trainTime, food: s.stats.foodCost, crystal: s.stats.crystalCost, home: b.id, paid: true });
  }

  /**
   * How much of each resource a building is still short of, after subtracting
   * what carts are already bringing it.
   */
  shortfall(b: Building, except?: Unit): Stock {
    const out = emptyStock();
    if (!b.complete) {
      out.wood = Math.max(0, b.stats.totalCost - b.built - this.woodInFlight(b, except));
      return out;
    }
    const target = this.supplyTargets(b);
    const inbound = emptyStock();
    for (const u of this.w.units.values()) {
      if (u === except || u.order.kind !== 'cart' || u.order.home !== b.id) continue;
      const c = this.cartInbound(u);
      for (const r of RESOURCES) inbound[r] += c[r];
    }
    for (const r of RESOURCES) out[r] = Math.max(0, target[r] - b.stock[r] - inbound[r]);
    return out;
  }

  /** What a building's own waiting orders have claimed (queued, not yet paid for). */
  reserve(b: Building): Stock {
    const out = emptyStock();
    for (const q of b.queue) if (!q.paid) { const c = itemCost(q); for (const r of RESOURCES) out[r] += c[r]; }
    return out;
  }

  /** Does this building have an order waiting for stock? */
  waiting(b: Building): boolean {
    return b.queue.some((q) => !q.paid);
  }

  /**
   * What a building can give up right now. Nothing that's committed is ever taken
   * back (that's what made carts ping-pong): the base keeps what its waiting orders
   * claimed; other buildings keep their whole supply target (queued orders, berry
   * stash, tower ammo) and a sowing building one planting's seed.
   * Less what carts already heading there to load are going to take.
   */
  spare(b: Building, except?: Unit): Stock {
    const out = emptyStock();
    if (!b.complete) return out;
    const isBase = b === this.w.baseOf(b.owner);
    const keep = isBase ? this.reserve(b) : this.supplyTargets(b);
    if (!isBase && b.spec.sow) for (const r of b.sowing) keep[r] = Math.max(keep[r], plantKg(b.spec, r) * CAP.sowSeedFraction);
    for (const r of RESOURCES) out[r] = Math.max(0, b.stock[r] - keep[r]);
    for (const u of this.w.units.values()) {
      if (u === except || u.order.kind !== 'cart' || u.order.phase !== 'load' || u.order.from !== b.id) continue;
      out[u.order.res] = Math.max(0, out[u.order.res] - this.w.freeCapacity(u));
    }
    return out;
  }

  /** Wood already in the packs of units building this site. */
  woodInFlight(site: Building, except?: Unit): number {
    let w = 0;
    for (const u of this.w.units.values()) {
      if (u === except) continue;
      if (u.order.kind === 'build' && u.order.site === site.id) w += u.wood;
      else if (u.order.kind === 'cart' && u.order.home === site.id) w += this.cartInbound(u).wood;
    }
    return w;
  }

  /** What a cart is bringing its `home`: its cargo once loaded, its free space while on the way to load. */
  cartInbound(u: Unit): Stock {
    const out = emptyStock();
    if (u.order.kind !== 'cart') return out;
    if (u.order.phase === 'deliver') { out.food = u.food; out.wood = u.wood; out.crystal = u.crystal; }
    else if (u.order.from) out[u.order.res] = this.w.freeCapacity(u);
    return out;
  }

  /**
   * Carts (and workers told to haul) follow one rule: take resources from where
   * there's spare to where there's need. Most urgent need first (the share of its
   * target that's missing, doubled when an order waits on it), over the shortest
   * whole trip. With nothing needed, outlying surplus drifts home to the base.
   */
  runCart(u: Unit, o: Extract<Order, { kind: 'cart' }>): boolean {
    let base = this.w.buildings.get(o.base);
    if (!base || base.owner !== u.owner || !base.complete) {
      base = this.nearestProducer(u) ?? this.w.baseOf(u.owner);
      if (!base) { u.order = { kind: 'idle' }; return false; }
      o.base = base.id;
    }
    const moving = () => u.x !== u.px || u.y !== u.py;
    // deliver what we carry
    if (o.phase === 'deliver') {
      const dest = this.w.buildings.get(o.home);
      const to = dest && dest.owner === u.owner ? dest : base;
      if (u.food + u.wood + u.crystal > 0.05) {
        if (!this.w.moveToBuilding(u, to)) return moving();
        if (to.complete) this.w.deposit(u, to);
        else {
          this.w.addToConstruction(to, u.wood, u);
          if (u.wood > 0.05 || u.food > 0.05) this.w.deposit(u, base); // leftovers go home
        }
      }
      o.phase = 'load'; o.from = 0;
      if (!o.pinned) o.home = 0;
      return false;
    }
    // a job is chosen: go load it
    if (o.from) {
      const src = this.w.buildings.get(o.from), dest = this.w.buildings.get(o.home);
      if (!src || !dest || src.owner !== u.owner || dest.owner !== u.owner) { o.from = 0; if (!o.pinned) o.home = 0; return false; }
      if (!this.w.moveToBuilding(u, src)) return moving();
      const spare = this.spare(src, u), need = this.shortfall(dest, u);
      const homing = dest === base && need[o.res] < 1; // just bringing surplus home
      for (const r of [o.res, ...RESOURCES.filter((x) => x !== o.res)]) {
        const want = homing ? (r === o.res ? spare[r] : 0) : need[r] + 0.999;
        const k = Math.floor(Math.min(this.w.freeCapacity(u), want, spare[r]));
        if (k > 0) { src.stock[r] -= k; this.w.carry(u, r, k); }
      }
      if (u.food + u.wood + u.crystal > 0.05) o.phase = 'deliver';
      else o.from = 0; // nothing there after all: choose again
      return false;
    }
    // choose a job
    const mine = [...this.w.buildings.values()].filter((b) => b.owner === u.owner);
    const sources = mine.filter((b) => b.complete);
    const spareOf = new Map(sources.map((b) => [b.id, this.spare(b)]));
    const d = (ax: number, ay: number, b: Building) => Math.hypot(b.ox + b.size / 2 - ax, b.oy + b.size / 2 - ay);
    let best: { from: Building; to: Building; r: ResourceKind; score: number } | null = null;
    const offer = (from: Building, to: Building, r: ResourceKind, urgency: number) => {
      const trip = d(u.x, u.y, from) + d(from.ox + from.size / 2, from.oy + from.size / 2, to);
      const score = urgency / (1 + trip / 20);
      if (score > (best?.score ?? 0)) best = { from, to, r, score };
    };
    const sinks = o.pinned ? mine.filter((b) => b.id === o.home) : mine;
    if (o.pinned && !sinks.length) { o.pinned = false; o.home = 0; }
    for (const to of sinks) {
      const need = this.shortfall(to);
      const target = to.complete ? this.supplyTargets(to) : { food: 0, wood: to.stats.totalCost, crystal: 0 };
      // waiting orders first, and the base's (workers, carts) before anyone else's
      const urgency = (this.waiting(to) ? 2 : 1) * (to === base ? 2 : 1);
      for (const r of RESOURCES) {
        if (need[r] <= 0.5) continue;
        for (const from of sources) if (from !== to && spareOf.get(from.id)![r] >= 1) offer(from, to, r, (need[r] / Math.max(1, target[r])) * urgency);
      }
    }
    if (!best && !o.pinned && u.carter) {
      for (const from of sources) {
        if (from === base) continue;
        for (const r of RESOURCES) {
          const sp = spareOf.get(from.id)![r];
          if (sp >= 5) offer(from, base, r, 0.25 * Math.min(1, sp / Math.max(1, this.w.freeCapacity(u))));
        }
      }
    }
    if (!best) {
      // a worker pinned to a building (right-click) waits by it for the next need;
      // one sent without a pin is done once the building is stocked
      if (!u.carter) {
        if (!o.pinned) { this.w.finish(u); return false; }
        const pin = this.w.buildings.get(o.home);
        if (!pin) { this.w.finish(u); return false; }
        const px = pin.ox + pin.size / 2, py = pin.oy + pin.size / 2;
        if ((u.x - px) ** 2 + (u.y - py) ** 2 > (pin.size / 2 + 2) ** 2) this.w.moveToBuilding(u, pin);
        return u.x !== u.px || u.y !== u.py;
      }
      const hx = base.ox + base.size / 2, hy = base.oy + base.size / 2;
      if ((u.x - hx) ** 2 + (u.y - hy) ** 2 > (base.size / 2 + 2.5) ** 2) this.w.moveToBuilding(u, base);
      return moving();
    }
    const job = best as { from: Building; to: Building; r: ResourceKind };
    o.from = job.from.id; o.home = job.to.id; o.res = job.r;
    return false;
  }
}
