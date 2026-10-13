// Logistics: who needs what, who can spare it, and the carts (and hauling
// workers) that move it. One rule: take resources from where there's spare to
// where there's need — most urgent first, over the shortest whole trip — with the
// base's waiting orders first in line.
import type { ResourceKind, Stock } from '../factions/types';
import { CAP } from './physics';
import {
  MAX_QUEUE, plantKg, RESOURCES, TOWER_STOCK_SHOTS, emptyStock,
  type Building, type Order, type Unit, type World,
} from './world';

export class Logistics {
  constructor(private readonly w: World) {}

  /** Stock a building wants kept on hand (carters fill up to this). */
  supplyTargets(b: Building): Stock {
    const t = emptyStock();
    if (!b.complete) return t;
    for (const id of b.spec.trains ?? []) {
      const s = this.w.specOf(b.owner, id);
      if (!s) continue;
      // enough for the next unit, plus a little for crews/visitors to eat
      t.food = Math.max(t.food, s.stats.foodCost + 20);
      t.crystal = Math.max(t.crystal, s.stats.crystalCost + 10);
    }
    // orders waiting for stock come first
    let waitFood = 0, waitCrystal = 0;
    for (const q of b.queue) if (q.kind === 'unit' && !q.paid) { waitFood += q.food; waitCrystal += q.crystal; }
    if (waitFood || waitCrystal) { t.food = Math.max(t.food, waitFood + 20); t.crystal = Math.max(t.crystal, waitCrystal + 5); }
    // sowing buildings keep one planting's worth of seed
    if (b.spec.sow) for (const r of b.sowing) t[r] = Math.max(t[r], plantKg(b.spec, r) * CAP.sowSeedFraction + 1);
    if (b.stats.tower && b.spec.attack) {
      const shots = b.spec.attack.stockShots ?? TOWER_STOCK_SHOTS;
      t.crystal = Math.max(t.crystal, shots * b.spec.attack.crystalMass);
    }
    for (const id of b.spec.researches ?? []) {
      const st = this.w.techStatus(b.owner, id, b);
      if (!st.blocker) t.wood = Math.max(t.wood, st.cost);
    }
    // never ask for more than the cache can hold
    const total = t.food + t.wood + t.crystal;
    if (total > b.stats.cacheCap) for (const r of RESOURCES) t[r] *= b.stats.cacheCap / total;
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
      const held = r === 'food' ? u.food : r === 'wood' ? u.wood : this.w.surplusCrystal(u);
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
    const room = this.w.room(b);
    for (const r of RESOURCES) out[r] = Math.max(0, Math.min(target[r] - b.stock[r] - inbound[r], room));
    return out;
  }

  /** What a building's own waiting orders have claimed (queued, not yet paid for). */
  reserve(b: Building): Stock {
    const out = emptyStock();
    for (const q of b.queue) if (q.kind === 'unit' && !q.paid) { out.food += q.food; out.crystal += q.crystal; }
    return out;
  }

  /** Does this building have an order waiting for stock? */
  waiting(b: Building): boolean {
    return b.queue.some((q) => q.kind === 'unit' && !q.paid);
  }

  /**
   * What a building can give up right now: the base keeps what its waiting orders
   * claimed, other buildings keep their supply target. But the base comes first:
   * toward an order waiting there, any other building gives up everything it has.
   * Less what carts already heading there to load are going to take.
   */
  spare(b: Building, except?: Unit, forBaseOrder = false): Stock {
    const out = emptyStock();
    if (!b.complete) return out;
    const isBase = b === this.w.baseOf(b.owner);
    const keep = isBase ? this.reserve(b) : forBaseOrder ? emptyStock() : this.supplyTargets(b);
    for (const r of RESOURCES) out[r] = Math.max(0, b.stock[r] - keep[r]);
    for (const u of this.w.units.values()) {
      if (u === except || u.order.kind !== 'cart' || u.order.phase !== 'load' || u.order.from !== b.id) continue;
      out[u.order.res] = Math.max(0, out[u.order.res] - this.w.freeCapacity(u));
    }
    return out;
  }

  /** Is this building below its supply target for a resource? */
  wants(b: Building, r: ResourceKind): boolean {
    return this.supplyTargets(b)[r] - b.stock[r] > 1;
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
    if (u.order.phase === 'deliver') { out.food = u.food; out.wood = u.wood; out.crystal = this.w.surplusCrystal(u); }
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
      if (u.food + u.wood + this.w.surplusCrystal(u) > 0.05) {
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
      const spare = this.spare(src, u, dest === base && this.waiting(dest)), need = this.shortfall(dest, u);
      const homing = dest === base && need[o.res] < 1; // just bringing surplus home
      for (const r of [o.res, ...RESOURCES.filter((x) => x !== o.res)]) {
        const want = homing ? (r === o.res ? spare[r] : 0) : need[r] + 0.999;
        const k = Math.floor(Math.min(this.w.freeCapacity(u), want, spare[r]));
        if (k > 0) { src.stock[r] -= k; this.w.carry(u, r, k); }
      }
      if (u.food + u.wood + this.w.surplusCrystal(u) > 0.05) o.phase = 'deliver';
      else o.from = 0; // nothing there after all: choose again
      return false;
    }
    // choose a job
    const mine = [...this.w.buildings.values()].filter((b) => b.owner === u.owner);
    const sources = mine.filter((b) => b.complete);
    const spareOf = new Map(sources.map((b) => [b.id, this.spare(b)]));
    const spareForBase = new Map(sources.map((b) => [b.id, this.spare(b, undefined, true)]));
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
      const waits = this.waiting(to);
      const pool = waits && to === base ? spareForBase : spareOf; // the base comes first
      const urgency = waits ? 2 : 1;
      for (const r of RESOURCES) {
        if (need[r] <= 0.5) continue;
        for (const from of sources) if (from !== to && pool.get(from.id)![r] >= 1) offer(from, to, r, (need[r] / Math.max(1, target[r])) * urgency);
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
      // a worker hauling by hand is done once its building is stocked
      if (!u.carter) { this.w.finish(u); return false; }
      const hx = base.ox + base.size / 2, hy = base.oy + base.size / 2;
      if ((u.x - hx) ** 2 + (u.y - hy) ** 2 > (base.size / 2 + 2.5) ** 2) this.w.moveToBuilding(u, base);
      return moving();
    }
    const job = best as { from: Building; to: Building; r: ResourceKind };
    o.from = job.from.id; o.home = job.to.id; o.res = job.r;
    return false;
  }
}
