// A simple opponent. It only *reads* the world and *issues commands*, exactly
// like a human or a remote player, so it works unchanged in lockstep multiplayer.
// Faction-agnostic: it reads the faction's buildings and what they train.

import type { FactionSpec, ResourceKind } from '../factions/types';
import { prerequisites } from '../sim/physics';
import type { Command } from '../sim/commands';
import { TICK_RATE, type Building, type Unit, type World } from '../sim/world';
import { isWall } from '../sim/abilities/wall';
import { isUnderfoot } from '../sim/abilities/underfoot';
import { capacity } from '../sim/garrison';
import { useBearers, useBelts, useHerds, type AiTurn } from './abilities';

export class SkirmishAI {
  private waveSize = 6;
  private attacking = new Set<number>();
  private trainIndex = new Map<number, number>();
  private plan: Array<[string, number]> | null = null;
  private lastBelt = -Infinity;
  /** Our scout's id, and when the next one goes. */
  private scout: number | null = null;
  private nextScout = 0;
  /** Enemy soldiers we've seen, and their kinds (for picking counters). */
  private seenFoes = new Map<number, { kg: number; flier: boolean; charger: boolean }>();
  private calmSince = -1;

  constructor(readonly player: number, private thinkEvery = TICK_RATE) {}

  /**
   * Build order for any faction: buildings that train or research first (by tier,
   * then cost), then the rest (towers, camps...). Each unlocks at a worker count.
   */
  static buildOrder(f: FactionSpec): Array<[string, number]> {
    const tier = (b: NonNullable<FactionSpec['buildings']>[number]) => prerequisites(b, f).length;
    const producer = (b: NonNullable<FactionSpec['buildings']>[number]) => (b.trains?.length || b.researches?.length ? 0 : 1);
    return (f.buildings ?? [])
      .filter((b) => !b.unbuildable && !isWall(b))
      .sort((a, b) => producer(a) - producer(b) || tier(a) - tier(b) || a.materials - b.materials || (a.id < b.id ? -1 : 1))
      .map((b, i) => [b.id, 7 + 2 * i]);
  }

  /** CommandSource interface for the lockstep driver. */
  poll(w: World): Command[] {
    return this.think(w);
  }

  think(w: World): Command[] {
    if ((w.tick + this.player * 7) % this.thinkEvery !== 0) return [];
    const me = w.players[this.player];
    if (me.defeated || w.winner >= 0) return [];
    const out: Command[] = [];
    const faction = w.factionOf(this.player);
    const units = w.unitsOf(this.player);
    const buildings = w.buildingsOf(this.player);
    const tc = w.baseOf(this.player);
    const workers = units.filter((u) => u.specId === faction.workerId);
    const army = units.filter((u) => u.specId !== faction.workerId && !u.carter && u.tame !== 'passive'); // a tame herd isn't an army
    const minutes = w.tick / TICK_RATE / 60;
    const stock = w.stockOf(this.player);

    // ── Construction: a build order derived from the faction, gated on worker count.
    const plan = (this.plan ??= SkirmishAI.buildOrder(faction));
    const builders = new Set(workers.filter((u) => u.order.kind === 'build').map((u) => u.id));
    for (const [id, atWorkers] of plan) {
      if (!tc || workers.length < atWorkers || !w.buildingSpecOf(this.player, id)) continue;
      const existing = buildings.find((b) => b.specId === id);
      if (existing) {
        if (!existing.complete) {
          const helping = workers.filter((u) => u.order.kind === 'build' && u.order.site === existing.id).length;
          if (helping < 3) {
            const pick = this.closestFree(workers, builders, existing.ox, existing.oy, 3 - helping);
            if (pick.length) out.push({ type: 'construct', units: pick, site: existing.id });
          }
        }
        continue;
      }
      if (w.buildBlocker(this.player, id)) continue;
      if (buildings.some((b) => !b.complete && !isUnderfoot(b.spec))) break; // finish one site before starting the next
      const st = w.buildingStatsOf(this.player, id)!;
      if (stock.wood < st.totalCost * 0.4) break; // save up for this one before the next
      const spec = w.buildingSpecOf(this.player, id)!;
      // build out from the town center, a little toward the enemy
      const foe = this.enemyTarget(w);
      const cx = tc.ox + 1.5, cy = tc.oy + 1.5;
      let ax = cx, ay = cy;
      if (foe) { const d = Math.hypot(foe[0] - cx, foe[1] - cy) || 1; ax += ((foe[0] - cx) / d) * 6; ay += ((foe[1] - cy) / d) * 6; }
      const spot = w.findBuildSpot(spec.size, ax, ay);
      if (!spot) continue;
      const pick = this.closestFree(workers, builders, spot[0], spot[1], 3);
      if (pick.length) out.push({ type: 'build', units: pick, specId: id, ox: spot[0], oy: spot[1] });
      break; // one new site at a time
    }

    // ── Forward bases: if a buildable building can raise workers (a hut, an outpost),
    //    put more of them beside the resources our workers walk farthest for.
    const outpost = (faction.buildings ?? []).filter((b) => !b.unbuildable && b.trains?.includes(faction.workerId)).sort((a, b) => a.materials - b.materials)[0];
    if (tc && outpost && !buildings.some((b) => !b.complete && !isUnderfoot(b.spec)) && !w.buildBlocker(this.player, outpost.id)) {
      const have = buildings.filter((b) => b.specId === outpost.id).length;
      const st = w.buildingStatsOf(this.player, outpost.id)!;
      if (have < Math.min(6, 1 + Math.floor(workers.length / 6)) && stock.wood >= st.totalCost) {
        let far: [number, number] | null = null, farD = 6;
        for (const u of workers) {
          if (u.order.kind !== 'gather') continue;
          const n = w.nodes.get(u.order.node);
          if (!n) continue;
          let d = Infinity;
          for (const b of buildings) d = Math.min(d, Math.hypot(b.ox + b.size / 2 - n.x, b.oy + b.size / 2 - n.y));
          if (d > farD) { farD = d; far = [n.x, n.y]; }
        }
        const spot = far && w.findBuildSpot(outpost.size, far[0], far[1]);
        const pick = spot ? this.closestFree(workers, builders, spot[0], spot[1], 2) : [];
        if (spot && pick.length) out.push({ type: 'build', units: pick, specId: outpost.id, ox: spot[0], oy: spot[1] });
      }
    }

    // ── Abilities the faction has switched on (bearers, herds, belts...).
    const turn: AiTurn = {
      w, player: this.player, faction, workers, army, buildings, attacking: this.attacking, out,
      closestFree: (x, y, n) => this.closestFree(workers, builders, x, y, n),
      train: (b, id) => this.tryTrain(w, b, id, out),
    };
    useBearers(turn);
    useHerds(turn);
    this.lastBelt = useBelts(turn, this.lastBelt);

    // ── Hauling without carts: a building whose order waits on supplies gets a worker
    //    to fetch them from wherever they piled up; it goes back to gathering after.
    if (!units.some((u) => u.carter)) {
      const waiting = (b: Building) => b.complete && b.queue.some((q) => !q.paid);
      const haulers = workers.filter((u) => u.order.kind === 'cart');
      const free = haulers.filter((u) => { const h = u.order.kind === 'cart' ? w.buildings.get(u.order.home) : undefined; return !h || !waiting(h); });
      if (free.length) out.push({ type: 'stop', units: free.map((u) => u.id) });
      let n = haulers.length - free.length;
      for (const b of buildings) {
        if (n >= Math.max(1, Math.floor(workers.length / 6))) break;
        if (!waiting(b) || haulers.some((u) => u.order.kind === 'cart' && u.order.home === b.id)) continue;
        const pick = this.closestFree(workers, builders, b.ox, b.oy, 1);
        if (pick.length) { out.push({ type: 'haul', units: pick, building: b.id }); n++; }
      }
    }

    // ── Economy: idle workers gather whatever we're short of.
    const counts: Record<ResourceKind, number> = { food: 0, wood: 0, crystal: 0 };
    for (const u of workers) {
      if (u.order.kind === 'gather') counts[u.order.nodeType]++;
      else if (u.order.kind === 'build') counts.wood++;
    }
    // Shift gatherers toward whatever isn't piling up.
    const share: Record<ResourceKind, number> = { food: 0.6, wood: 0.25, crystal: 0.15 };
    if (stock.crystal > 250) { share.food += share.crystal - 0.04; share.crystal = 0.04; }
    if (stock.wood > 700) { share.food += share.wood - 0.1; share.wood = 0.1; }
    // rebalance a few busy gatherers too, not just idle ones
    for (const r of ['wood', 'crystal'] as ResourceKind[]) {
      const over = counts[r] - Math.ceil(share[r] * workers.length) - 1;
      if (over <= 0) continue;
      const movers = workers.filter((u) => u.order.kind === 'gather' && u.order.nodeType === r).slice(0, over);
      const node = movers[0] && this.nearestNode(w, movers[0], 'food');
      if (node) { out.push({ type: 'gather', units: movers.map((u) => u.id), node }); counts[r] -= movers.length; counts.food += movers.length; }
    }
    for (const u of workers.filter((x) => x.order.kind === 'idle' && !builders.has(x.id))) {
      const n = workers.length;
      let want: ResourceKind = 'food';
      let worst = -Infinity;
      for (const r of ['food', 'wood', 'crystal'] as ResourceKind[]) {
        const gap = share[r] * n - counts[r];
        if (gap > worst) { worst = gap; want = r; }
      }
      const node = this.nearestNode(w, u, want) ?? this.nearestNode(w, u, 'food') ?? this.nearestNode(w, u, 'wood');
      if (node) { out.push({ type: 'gather', units: [u.id], node }); counts[want]++; }
    }

    // ── Production: workers from the town center, army from everything else.
    const workerTarget = Math.min(30, 10 + Math.floor(minutes * 2.5));
    // what the enemy fields: shares of its army that are heavy chargers (melee, 120 kg+) and fliers
    const threat = { chargers: 0, fliers: 0 };
    {
      // the enemy's army composition, as far as we've seen it (scouting below keeps it fresh)
      for (const e of w.units.values()) {
        if (e.owner === this.player || w.players[e.owner]?.neutral || !e.stats.canAttack || e.specId === w.factionOf(e.owner).workerId) continue;
        if (w.vision(this.player, e.x, e.y) === 2) this.seenFoes.set(e.id, { kg: e.stats.mass, flier: !!e.stats.flight, charger: !e.throws && !e.stats.flight && e.stats.mass >= 120 });
      }
      let total = 0;
      for (const [id, f] of this.seenFoes) {
        if (!w.units.has(id)) { this.seenFoes.delete(id); continue; }
        total += f.kg;
        if (f.flier) threat.fliers += f.kg;
        else if (f.charger) threat.chargers += f.kg;
      }
      if (total > 0) { threat.chargers /= total; threat.fliers /= total; }
    }
    // a worker waiting on food comes first until the economy has a base (cheap soldiers would eat it all)
    const workerFirst = workers.length < Math.min(workerTarget, 14) && buildings.some((b) => b.queue.some((q) => q.kind === 'unit' && q.specId === faction.workerId && !q.paid));
    for (const b of buildings) {
      if (!b.complete || b.queue.length >= 2) continue;
      const trains = (b.spec.trains ?? []).filter((id) => w.specOf(this.player, id));
      if (!trains.length) continue;
      if (trains.includes(faction.workerId) && workers.length < workerTarget) { this.tryTrain(w, b, faction.workerId, out); continue; }
      // soldiers (a building that also raises workers trains soldiers once there are enough workers)
      const soldiers = trains.filter((id) => id !== faction.workerId && id !== faction.carterId && w.specOf(this.player, id)?.stats.canAttack);
      if (!soldiers.length || workerFirst) continue;
      // the best army value for the money (Lanchester: HP × DPS ÷ cost²), with the runner-up now and then for variety
      const value = (id: string) => {
        const st = w.specOf(this.player, id)!.stats, spec = w.specOf(this.player, id)!.spec;
        const cost = st.foodCost + st.crystalCost * 3;
        let v = (st.maxHp * (st.damage / st.cooldown)) / (cost * cost);
        // counters: spears against heavy chargers, throwers against fliers (shares of the enemy's army)
        if (spec.attack?.shaft) v *= 1 + 3 * threat.chargers;
        if (st.canAttack && spec.attack?.style === 'throw') v *= 1 + 3 * threat.fliers;
        return v;
      };
      const ranked = [...soldiers].sort((p, q) => value(q) - value(p));
      const i = this.trainIndex.get(b.id) ?? 0;
      const pick = ranked.length > 1 && i % 4 === 3 ? ranked[1] : ranked[0];
      if (this.tryTrain(w, b, pick, out)) this.trainIndex.set(b.id, i + 1);
    }

    // ── Research: queue the next available tech when the building is idle (it waits for its wood).
    for (const b of buildings) {
      if (!b.complete || b.queue.length > 0) continue;
      for (const id of b.spec.researches ?? []) {
        const st = w.techStatus(this.player, id, b);
        if (!st.blocker) { out.push({ type: 'research', building: b.id, techId: id }); break; }
      }
    }

    // ── Garrison: a worker with fighting enemies close and none of our soldiers near runs for the
    //    nearest building with room (base, hut, camp) and shelters there; once it's calm everyone
    //    comes out and gets back to work.
    {
      const fighting = [...w.units.values()].filter((e) => e.owner !== this.player && !w.players[e.owner]?.neutral && !e.carter && w.armed(e) && (e.engage || e.order.kind === 'attack' || e.order.kind === 'attackMove'));
      const room = new Map(buildings.filter((b) => b.complete).map((b) => [b.id, capacity(b) - b.garrison.length]));
      const near = (x: number, y: number, list: Unit[], r: number) => list.some((e) => (e.x - x) ** 2 + (e.y - y) ** 2 < r * r);
      const soldiers = army.filter((u) => w.armed(u));
      const shelter: Map<number, number[]> = new Map();
      for (const u of workers) {
        if (u.order.kind === 'garrison' || u.order.kind === 'build' || !near(u.x, u.y, fighting, 6) || near(u.x, u.y, soldiers, 5)) continue;
        let best: Building | null = null, bestD = 20 * 20;
        for (const b of buildings) {
          if ((room.get(b.id) ?? 0) <= 0) continue;
          const d = (b.ox + b.size / 2 - u.x) ** 2 + (b.oy + b.size / 2 - u.y) ** 2;
          if (d < bestD) { bestD = d; best = b; }
        }
        if (!best) continue;
        room.set(best.id, room.get(best.id)! - 1);
        shelter.set(best.id, [...(shelter.get(best.id) ?? []), u.id]);
      }
      for (const [b, ids] of shelter) out.push({ type: 'garrison', units: ids, building: b });
      if (shelter.size) this.calmSince = -1;
      const sheltered = buildings.filter((b) => b.garrison.length);
      if (sheltered.length) {
        const threatened = sheltered.some((b) => near(b.ox + b.size / 2, b.oy + b.size / 2, fighting, 10));
        if (threatened) this.calmSince = -1;
        else if (this.calmSince < 0) this.calmSince = w.tick;
        else if (w.tick - this.calmSince > TICK_RATE * 8) for (const b of sheltered) out.push({ type: 'ungarrison', building: b.id });
      }
    }

    // ── Defense: any enemy near home pulls the whole idle army.
    if (tc) {
      const cx = tc.ox + 1.5, cy = tc.oy + 1.5;
      let threat: Unit | null = null;
      for (const e of w.units.values()) {
        if (e.owner === this.player || e.carter) continue;
        if ((e.x - cx) ** 2 + (e.y - cy) ** 2 < 16 * 16) { threat = e; break; }
      }
      if (threat) {
        const defenders = army.filter((u) => u.id !== this.scout && (!this.attacking.has(u.id) || u.order.kind === 'idle')).map((u) => u.id);
        if (defenders.length) out.push({ type: 'attackMove', units: defenders, x: threat.x, y: threat.y });
      }
    }

    // ── An enemy tower near home before we have an army: ring the bell and tear it down
    //    from under its arc (towers can't hit right below themselves).
    if (tc) {
      const cx = tc.ox + 1.5, cy = tc.oy + 1.5;
      const tower = [...w.buildings.values()].find((b) => b.owner !== this.player && !w.players[b.owner]?.neutral && b.spec.attack && (b.ox + b.size / 2 - cx) ** 2 + (b.oy + b.size / 2 - cy) ** 2 < 22 * 22);
      const fighters = army.filter((u) => w.armed(u)).length;
      if (tower && fighters < 4) {
        const idle = workers.filter((u) => !(u.order.kind === 'attack' && u.order.target === tower.id) && u.order.kind !== 'muster').map((u) => u.id);
        if (idle.length) out.push({ type: 'attack', units: idle, target: tower.id });
      } else if (tower) out.push({ type: 'attack', units: army.filter((u) => !this.attacking.has(u.id)).map((u) => u.id), target: tower.id });
    }

    // ── Offense: attack in growing waves.
    for (const id of this.attacking) if (!w.units.has(id)) this.attacking.delete(id);
    const home = army.filter((u) => !this.attacking.has(u.id) && u.id !== this.scout);
    const fit = home.filter((u) => u.cal > u.stats.maxCalories * 0.6 && w.armed(u));
    const target = this.enemyTarget(w);
    if (fit.length >= this.waveSize && target) {
      out.push({ type: 'attackMove', units: fit.map((u) => u.id), x: target[0], y: target[1] });
      for (const u of fit) this.attacking.add(u.id);
      this.waveSize = Math.min(16, this.waveSize + 2);
    }
    // ── Scouting: every 4 minutes from minute 2, our fastest soldier (a worker if we have none)
    //    runs to the enemy's side of the map and back, so we know what they field.
    if (tc && minutes >= 2) {
      const scout = this.scout !== null ? w.units.get(this.scout) : undefined;
      if (!scout && w.tick >= this.nextScout) {
        const pool = army.filter((u) => w.armed(u) && !this.attacking.has(u.id));
        const pick = (pool.length ? pool : workers.filter((u) => u.order.kind === 'gather')).sort((a, b) => b.stats.speed - a.stats.speed)[0];
        const there = this.enemyTarget(w);
        if (pick && there) { out.push({ type: 'move', units: [pick.id], x: there[0], y: there[1] }); this.scout = pick.id; }
      } else if (scout) {
        const there = this.enemyTarget(w);
        const arrived = !there || Math.hypot(scout.x - there[0], scout.y - there[1]) < 6 || scout.order.kind === 'idle';
        if (arrived) {
          out.push({ type: 'move', units: [scout.id], x: tc.ox + tc.size / 2, y: tc.oy + tc.size + 2 });
          this.scout = null; this.nextScout = w.tick + TICK_RATE * 240;
        }
      } else if (this.scout !== null) { this.scout = null; this.nextScout = w.tick + TICK_RATE * 240; } // died: try again later
    }

    // ── Retreat: a wave that's clearly outmatched where it stands falls back home to regroup
    //    (under the garrison's fire) instead of dying to the last unit.
    const wave = army.filter((u) => this.attacking.has(u.id));
    if (wave.length && tc && w.tick % (TICK_RATE * 2) === 0) {
      const gx = wave.reduce((n, u) => n + u.x, 0) / wave.length, gy = wave.reduce((n, u) => n + u.y, 0) / wave.length;
      const power = (u: Unit) => u.hp * (u.stats.damage / u.stats.cooldown);
      const ours = wave.reduce((n, u) => n + power(u), 0);
      let theirs = 0;
      for (const e of w.units.values()) {
        if (e.owner === this.player || w.players[e.owner]?.neutral || e.carter || !w.armed(e)) continue;
        if ((e.x - gx) ** 2 + (e.y - gy) ** 2 < 12 * 12) theirs += power(e);
      }
      const homeDist = Math.hypot(gx - (tc.ox + tc.size / 2), gy - (tc.oy + tc.size / 2));
      if (theirs > ours * 1.8 && homeDist > 18) {
        out.push({ type: 'move', units: wave.map((u) => u.id), x: tc.ox + tc.size / 2, y: tc.oy + tc.size + 2 });
        for (const u of wave) this.attacking.delete(u.id);
        this.waveSize = Math.max(this.waveSize, wave.length + 4); // come back bigger
      }
    }
    if (target) {
      const stalled = army.filter((u) => this.attacking.has(u.id) && u.order.kind === 'idle' && u.engage === 0).map((u) => u.id);
      if (stalled.length) out.push({ type: 'attackMove', units: stalled, x: target[0], y: target[1] });
    }
    return out;
  }

  private tryTrain(w: World, b: Building, specId: string, out: Command[]): boolean {
    const s = w.specOf(this.player, specId);
    // queue like a player: at most one order per building waiting on supplies (it gets first claim on them)
    if (!s || b.queue.some((q) => q.kind === 'unit' && !q.paid)) return false;
    out.push({ type: 'train', building: b.id, specId });
    return true;
  }

  /** Up to n workers nearest (x,y) that aren't already building. */
  private closestFree(workers: Unit[], busy: Set<number>, x: number, y: number, n: number): number[] {
    const free = workers.filter((u) => !busy.has(u.id) && u.order.kind !== 'resupply');
    free.sort((a, b) => ((a.x - x) ** 2 + (a.y - y) ** 2) - ((b.x - x) ** 2 + (b.y - y) ** 2) || a.id - b.id);
    const pick = free.slice(0, n).map((u) => u.id);
    for (const id of pick) busy.add(id);
    return pick;
  }

  private enemyTarget(w: World): [number, number] | null {
    const foe = (owner: number) => owner !== this.player && !w.players[owner]?.neutral; // the Wilds are nobody's opponent
    // fog: only enemy buildings we've scouted (explored ground), then units in sight now; failing
    // that, the mirror of our own base (skirmish maps are point-symmetric, so that's where theirs is)
    for (const b of w.buildings.values()) if (foe(b.owner) && w.vision(this.player, b.ox + b.size / 2, b.oy + b.size / 2) >= 1) return [b.ox + b.size / 2, b.oy + b.size / 2];
    for (const u of w.units.values()) if (foe(u.owner) && w.vision(this.player, u.x, u.y) === 2) return [u.x, u.y];
    const home = w.baseOf(this.player);
    if (home) return [w.grid.width - home.ox - home.size / 2, w.grid.height - home.oy - home.size / 2];
    for (const u of w.units.values()) if (foe(u.owner)) return [u.x, u.y]; // no base of our own: hunt anywhere
    return null;
  }

  private nearestNode(w: World, u: Unit, type: ResourceKind): number | null {
    let best: number | null = null, bestD = 40 * 40;
    for (const n of w.nodes.values()) {
      if (n.shard || n.type !== type || n.amount <= 0) continue;
      const d = (n.x - u.x) ** 2 + (n.y - u.y) ** 2;
      if (d < bestD) { bestD = d; best = n.id; }
    }
    return best;
  }
}
