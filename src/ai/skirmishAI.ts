// The computer opponent. It only *reads* the world and *issues commands*, exactly
// like a human or a remote player, so it works unchanged in lockstep multiplayer.
// Faction-agnostic: it reads the faction's buildings and what they train.
//
// It never cheats. It sees what its own units and buildings see (the fog of war a
// human gets): enemy units only while they're in sight, enemy buildings and
// resources once found, and it remembers what it saw rather than peeking again.
// It gets no extra resources and no faster build or training. Difficulty is
// only how well it decides and how quickly it reacts (see PROFILES).

import type { FactionSpec, ResourceKind } from '../factions/types';
import { prerequisites } from '../sim/physics';
import type { Command } from '../sim/commands';
import { TICK_RATE, type Building, type Unit, type World } from '../sim/world';
import { isWall } from '../sim/abilities/wall';
import { isUnderfoot } from '../sim/abilities/underfoot';
import { capacity } from '../sim/garrison';
import { useBearers, useBelts, useBrood, useHerds, type AiTurn } from './abilities';

export type Difficulty = 'easy' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'hard'];
export const DEFAULT_DIFFICULTY: Difficulty = 'hard';
export const parseDifficulty = (s: string | null | undefined): Difficulty => (DIFFICULTIES.includes(s as Difficulty) ? (s as Difficulty) : DEFAULT_DIFFICULTY);

/** How a difficulty plays: how often it thinks, how fast it reacts, and which skills it uses. */
interface Profile {
  /** Ticks between decisions. */
  thinkEvery: number;
  /** Ticks an enemy must be in sight near home before the army answers it. */
  react: number;
  /** Most workers, and how many more it wants each minute. */
  workerCap: number;
  workersPerMin: number;
  /** Extra workers between steps of the build order, or failing that minutes between them
   *  (so losing workers never stops the build order for good). */
  buildGap: number;
  buildEvery: number;
  /** First attack size, how much each wave grows, and the biggest wave. */
  firstWave: number;
  waveStep: number;
  maxWave: number;
  /** Strength it wants over what it has seen of the enemy before attacking (0: attacks by wave size alone). */
  edge: number;
  /** Builds more production when resources pile up. */
  expand: boolean;
  /** A tight economy: wood when the next building needs it, techs only when affordable, few forward
   *  bases, orders queued where the supplies are. */
  tight: boolean;
  /** Answers enemies near any worker or building, not just near the town center. */
  guard: boolean;
  /** Scouts early and keeps scouting; picks unit types to counter what it saw. */
  scout: boolean;
  counters: boolean;
  /** Focus fire, pulling hurt units back, charging with heavy strikers, sending reinforcements. */
  micro: boolean;
  /** Pulls a losing attack back home. */
  retreat: boolean;
}

export const PROFILES: Record<Difficulty, Profile> = {
  easy: {
    thinkEvery: TICK_RATE * 3, react: TICK_RATE * 9, workerCap: 16, workersPerMin: 1.2, buildGap: 4, buildEvery: 2.5,
    firstWave: 4, waveStep: 1, maxWave: 8, edge: 0, expand: false, tight: false, guard: false, scout: false, counters: false, micro: false, retreat: false,
  },
  hard: {
    thinkEvery: TICK_RATE / 2, react: 0, workerCap: 34, workersPerMin: 3, buildGap: 2, buildEvery: 1.5,
    firstWave: 8, waveStep: 3, maxWave: 24, edge: 1.3, expand: true, tight: true, guard: true, scout: true, counters: true, micro: true, retreat: true,
  },
};

/** What we remember of an enemy soldier from when we last saw it. */
interface Sighting { x: number; y: number; tick: number; kg: number; power: number; flier: boolean; charger: boolean; melee: boolean }
/** What we remember of an enemy building. */
interface KnownBuilding { x: number; y: number; tower: boolean }
/** What we remember of a wild animal that attacks whoever comes close (it keeps near its lair). */
interface Danger { x: number; y: number; hp: number; dps: number }
/** How close to a dangerous animal a worker can safely gather (its leash plus its reach for prey). */
const DANGER_R = 9;

/** A soldier's fighting strength: health × damage per second. */
const power = (u: Unit) => u.hp * (u.stats.damage / u.stats.cooldown);
/** How long we trust a sighting of a soldier we can't see any more. */
const FORGET = TICK_RATE * 150;

export class SkirmishAI {
  readonly profile: Profile;
  private thinkEvery: number;
  private waveSize: number;
  private attacking = new Set<number>();
  private trainIndex = new Map<number, number>();
  private plan: Array<[string, number]> | null = null;
  private lastBelt = -Infinity;
  /** Our scout's id, and when the next one goes. */
  private scout: number | null = null;
  private nextScout = 0;
  /** Enemy soldiers we've seen, as we last saw them (for picking counters and judging an attack). */
  private seenFoes = new Map<number, Sighting>();
  /** Enemy buildings we've found. */
  private knownBuildings = new Map<number, KnownBuilding>();
  /** Dangerous wildlife we've seen, and the soldiers sent to clear it (until when). */
  private dangers = new Map<number, Danger>();
  private hunters = new Set<number>();
  private huntUntil = 0;
  /** Since when an enemy has been in sight near home (-1: none). */
  private threatSince = -1;
  private calmSince = -1;
  private nextRetreatCheck = 0;

  constructor(readonly player: number, readonly difficulty: Difficulty = DEFAULT_DIFFICULTY, thinkEvery?: number) {
    this.profile = PROFILES[difficulty];
    this.thinkEvery = thinkEvery ?? this.profile.thinkEvery;
    this.waveSize = this.profile.firstWave;
  }

  /**
   * Build order for any faction: buildings that train or research first (by tier,
   * then cost), then the rest (towers, camps...). Each unlocks at a worker count.
   */
  static buildOrder(f: FactionSpec, gap = 2): Array<[string, number]> {
    const tier = (b: NonNullable<FactionSpec['buildings']>[number]) => prerequisites(b, f).length;
    const producer = (b: NonNullable<FactionSpec['buildings']>[number]) => (b.trains?.length || b.researches?.length ? 0 : 1);
    return (f.buildings ?? [])
      .filter((b) => !b.unbuildable && !isWall(b))
      .sort((a, b) => producer(a) - producer(b) || tier(a) - tier(b) || a.materials - b.materials || (a.id < b.id ? -1 : 1))
      .map((b, i) => [b.id, 7 + gap * i]);
  }

  /** CommandSource interface for the lockstep driver. */
  poll(w: World): Command[] {
    return this.think(w);
  }

  private foe(w: World, owner: number): boolean { return owner !== this.player && !w.players[owner]?.neutral; } // the Wilds are nobody's opponent
  /** Can we see this spot right now? */
  private sees(w: World, x: number, y: number): boolean { return w.vision(this.player, x, y) === 2; }
  /** Enemy units in sight now (and wild animals that would attack). */
  private visibleHostiles(w: World): Unit[] {
    const out: Unit[] = [];
    for (const e of w.units.values()) {
      if (e.owner === this.player || e.carter || e.tame === 'passive') continue;
      if (!this.foe(w, e.owner) && e.wild !== 'aggressive') continue;
      if (this.sees(w, e.x, e.y)) out.push(e);
    }
    return out;
  }

  /** Update what we know of the enemy from what we can see right now. */
  private look(w: World, hostiles: Unit[]): void {
    for (const e of hostiles) {
      if (!this.foe(w, e.owner) || !e.stats.canAttack || e.specId === w.factionOf(e.owner).workerId) continue;
      this.seenFoes.set(e.id, { x: e.x, y: e.y, tick: w.tick, kg: e.stats.mass, power: power(e), flier: !!e.stats.flight, charger: !e.throws && !e.stats.flight && e.stats.mass >= 120, melee: !e.throws && !e.stats.flight });
    }
    for (const [id, s] of this.seenFoes) {
      // forget it once it's stale, or when we look where it was and it's gone
      if (w.tick - s.tick > FORGET || (s.tick < w.tick && this.sees(w, s.x, s.y) && !(w.units.get(id) && this.sees(w, w.units.get(id)!.x, w.units.get(id)!.y)))) this.seenFoes.delete(id);
    }
    for (const b of w.buildings.values()) {
      if (!this.foe(w, b.owner)) continue;
      const x = b.ox + b.size / 2, y = b.oy + b.size / 2;
      if (this.sees(w, x, y)) this.knownBuildings.set(b.id, { x, y, tower: !!b.spec.attack });
    }
    for (const [id, k] of this.knownBuildings) if (this.sees(w, k.x, k.y) && !w.buildings.has(id)) this.knownBuildings.delete(id);
    for (const e of hostiles) if (e.wild === 'aggressive') this.dangers.set(e.id, { x: e.x, y: e.y, hp: e.hp, dps: e.stats.damage / e.stats.cooldown });
    // forget one once we look where it prowls and it isn't there
    for (const [id, d] of this.dangers) {
      if (!this.sees(w, d.x, d.y)) continue;
      if (!hostiles.some((e) => e.id === id && (e.x - d.x) ** 2 + (e.y - d.y) ** 2 < DANGER_R * DANGER_R)) this.dangers.delete(id);
    }
  }

  think(w: World): Command[] {
    if ((w.tick + this.player * 7) % this.thinkEvery !== 0) return [];
    const me = w.players[this.player];
    if (me.defeated || w.winner >= 0) return [];
    const P = this.profile;
    const out: Command[] = [];
    const faction = w.factionOf(this.player);
    const units = w.unitsOf(this.player);
    const buildings = w.buildingsOf(this.player);
    const tc = w.baseOf(this.player);
    const workers = units.filter((u) => u.specId === faction.workerId);
    const army = units.filter((u) => u.specId !== faction.workerId && !u.carter && u.tame !== 'passive'); // a tame herd isn't an army
    const minutes = w.tick / TICK_RATE / 60;
    const stock = w.stockOf(this.player);
    const hostiles = this.visibleHostiles(w);
    this.look(w, hostiles);
    // (no town center, a side in the field like a brood: home is where its units are, its parents' if it has them)
    const layers = units.filter((u) => w.specOf(this.player, u.specId)?.spec.spawns?.length), herd = layers.length ? layers : units;
    const home: [number, number] | null = tc ? [tc.ox + tc.size / 2, tc.oy + tc.size / 2] : herd.length ? [herd.reduce((n, u) => n + u.x, 0) / herd.length, herd.reduce((n, u) => n + u.y, 0) / herd.length] : null;
    const homeOff = (tc?.size ?? 0) / 2 + 2; // (just off home, beside the town center)

    // ── Construction: a build order derived from the faction, gated on worker count.
    const plan = (this.plan ??= SkirmishAI.buildOrder(faction, P.buildGap));
    const builders = new Set(workers.filter((u) => u.order.kind === 'build').map((u) => u.id));
    const siteOpen = buildings.some((b) => !b.complete && !isUnderfoot(b.spec));
    const placeNear = (size: number): [number, number] | null => {
      // build out from the town center, a little toward the enemy
      const foe = this.enemyTarget(w);
      let [ax, ay] = home!;
      if (foe) { const d = Math.hypot(foe[0] - ax, foe[1] - ay) || 1; ax += ((foe[0] - ax) / d) * 6; ay += ((foe[1] - ay) / d) * 6; }
      return w.findBuildSpot(size, ax, ay);
    };
    for (const [step, [id, atWorkers]] of plan.entries()) {
      if (!tc || (workers.length < atWorkers && minutes < 1 + step * P.buildEvery) || !w.buildingSpecOf(this.player, id)) continue;
      const existing = buildings.filter((b) => b.specId === id);
      if (existing.length) {
        for (const site of existing) {
          if (site.complete) continue;
          const helping = workers.filter((u) => u.order.kind === 'build' && u.order.site === site.id).length;
          if (helping < 3) {
            const pick = this.closestFree(workers, builders, site.ox, site.oy, 3 - helping);
            if (pick.length) out.push({ type: 'construct', units: pick, site: site.id });
          }
        }
        continue;
      }
      if (w.buildBlocker(this.player, id)) continue;
      if (siteOpen) break; // finish one site before starting the next
      const st = w.buildingStatsOf(this.player, id)!;
      if (stock.wood < st.totalCost * 0.4) break; // save up for this one before the next
      const spec = w.buildingSpecOf(this.player, id)!;
      const spot = placeNear(spec.size);
      if (!spot) continue;
      const pick = this.closestFree(workers, builders, spot[0], spot[1], 3);
      if (pick.length) out.push({ type: 'build', units: pick, specId: id, ox: spot[0], oy: spot[1] });
      break; // one new site at a time
    }

    // ── Forward bases: if a buildable building can raise workers (a hut, an outpost),
    //    put more of them beside the resources our workers walk farthest for.
    const outpost = (faction.buildings ?? []).filter((b) => !b.unbuildable && b.trains?.includes(faction.workerId)).sort((a, b) => a.materials - b.materials)[0];
    if (tc && outpost && !siteOpen && !w.buildBlocker(this.player, outpost.id)) {
      const have = buildings.filter((b) => b.specId === outpost.id).length;
      const st = w.buildingStatsOf(this.player, outpost.id)!;
      if (have < Math.min(P.tight ? 3 : 6, 1 + Math.floor(workers.length / 6)) && stock.wood >= st.totalCost) {
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
    useBrood(turn, minutes);
    this.lastBelt = useBelts(turn, this.lastBelt);

    // ── Hauling without carts: a building whose order waits on supplies gets a worker
    //    to fetch them from wherever they piled up; it goes back to gathering after.
    //    (Once we have carts, they do it and the workers go back to work.)
    {
      const most = units.some((u) => u.carter) ? 0 : Math.max(1, Math.floor(workers.length / 6));
      const waiting = (b: Building) => b.complete && b.queue.some((q) => !q.paid);
      const haulers = workers.filter((u) => u.order.kind === 'cart');
      const busy = haulers.filter((u) => { const h = u.order.kind === 'cart' ? w.buildings.get(u.order.home) : undefined; return !!h && waiting(h); }).slice(0, most);
      const free = haulers.filter((u) => !busy.includes(u));
      if (free.length) out.push({ type: 'stop', units: free.map((u) => u.id) });
      let n = busy.length;
      for (const b of buildings) {
        if (n >= most) break;
        if (!waiting(b) || busy.some((u) => u.order.kind === 'cart' && u.order.home === b.id)) continue;
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
    else if (P.tight && stock.wood < this.woodWanted(w, plan, buildings)) { share.wood = 0.4; share.food = 0.45; } // hard: saving for the next building
    // rebalance a few busy gatherers too, not just idle ones
    for (const r of ['wood', 'crystal'] as ResourceKind[]) {
      const over = counts[r] - Math.ceil(share[r] * workers.length) - (stock[r] > 700 ? 0 : 1); // (a pile we can't spend: no slack)
      if (over <= 0) continue;
      const movers = workers.filter((u) => u.order.kind === 'gather' && u.order.nodeType === r).slice(0, over);
      const node = movers[0] && this.nearestNode(w, movers[0], 'food');
      if (node) { out.push({ type: 'gather', units: movers.map((u) => u.id), node }); counts[r] -= movers.length; counts.food += movers.length; }
    }
    // gatherers working beside dangerous wildlife move to a safer patch of the same thing
    for (const u of workers) {
      if (u.order.kind !== 'gather') continue;
      const n = w.nodes.get(u.order.node);
      if (!n || !this.dangerous(n.x, n.y)) continue;
      const safe = this.nearestNode(w, u, u.order.nodeType) ?? this.nearestNode(w, u, 'food') ?? this.nearestNode(w, u, 'wood');
      if (safe) out.push({ type: 'gather', units: [u.id], node: safe });
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
      else if (home) { const p = this.unexplored(w, home[0], home[1], 30); if (p) out.push({ type: 'move', units: [u.id], x: p[0], y: p[1] }); } // nothing known: go and look
    }

    // ── Production: workers from the town center, army from everything else.
    const workerTarget = Math.min(P.workerCap, 10 + Math.floor(minutes * P.workersPerMin));
    // what the enemy fields, as far as we've seen it: shares of its army that are heavy chargers (melee, 120 kg+),
    // fliers, and fighters that can only strike on the ground (melee)
    const threat = { chargers: 0, fliers: 0, melee: 0 };
    {
      let total = 0;
      for (const f of this.seenFoes.values()) {
        total += f.kg;
        if (f.flier) threat.fliers += f.kg;
        else if (f.charger) threat.chargers += f.kg;
        if (f.melee) threat.melee += f.kg;
      }
      if (total > 0) { threat.chargers /= total; threat.fliers /= total; threat.melee /= total; }
    }
    // the best army value for the money (Lanchester: HP × DPS ÷ cost²)
    const value = (id: string) => {
      const st = w.specOf(this.player, id)!.stats, spec = w.specOf(this.player, id)!.spec;
      const cost = st.foodCost + st.crystalCost * (stock.crystal > st.crystalCost * 2 ? 1 : 3); // crystal counts extra when it's short
      let v = (st.maxHp * (st.damage / st.cooldown)) / (cost * cost);
      // counters: spears against heavy chargers, throwers against fliers, fliers against an army that
      // can only strike on the ground (shares of the enemy's army)
      if (spec.attack?.shaft) v *= 1 + 3 * threat.chargers;
      if (st.flight) v *= 1 + 2 * threat.melee;
      if (st.canAttack && spec.attack?.style === 'throw') v *= 1 + 3 * threat.fliers;
      return v;
    };
    const isSoldier = (id: string) => id !== faction.workerId && id !== faction.carterId && !!w.specOf(this.player, id)?.stats.canAttack;
    let bestValue = 0;
    for (const b of buildings) if (b.complete) for (const id of b.spec.trains ?? []) if (isSoldier(id)) bestValue = Math.max(bestValue, value(id));

    // ── More production (hard): when food piles up and every building that trains our best
    //    soldier is busy, raise another of them.
    if (P.expand && tc && !siteOpen && minutes >= 4) {
      const producers = (faction.buildings ?? []).filter((b) => !b.unbuildable && !w.buildBlocker(this.player, b.id) && b.trains?.some(isSoldier) && buildings.some((x) => x.specId === b.id && x.complete));
      let spec: (typeof producers)[number] | undefined, best = -Infinity;
      for (const b of producers) for (const id of b.trains!) if (isSoldier(id) && value(id) > best) { best = value(id); spec = b; }
      const mine = spec ? buildings.filter((b) => b.specId === spec!.id) : [];
      const unit = spec && w.specOf(this.player, spec.trains!.filter(isSoldier).sort((p, q) => value(q) - value(p))[0])!.stats;
      if (spec && unit && mine.length < 4 && mine.every((b) => b.complete && b.queue.length > 0) && stock.food > unit.foodCost * 2 + 200 && stock.wood >= w.buildingStatsOf(this.player, spec.id)!.totalCost) {
        const spot = placeNear(spec.size);
        const pick = spot ? this.closestFree(workers, builders, spot[0], spot[1], 3) : [];
        if (spot && pick.length) out.push({ type: 'build', units: pick, specId: spec.id, ox: spot[0], oy: spot[1] });
      }
    }

    // a worker waiting on food comes first until the economy has a base (cheap soldiers would eat it all)
    const workerFirst = workers.length < Math.min(workerTarget, 14) && buildings.some((b) => b.queue.some((q) => q.kind === 'unit' && q.specId === faction.workerId && !q.paid));
    // queue where the supplies already are, and let only one worker order and a few soldier
    // orders wait on hauling (orders waiting everywhere strand the stock in scattered piles)
    const unpaid = (worker: boolean) => buildings.reduce((n, b) => n + b.queue.filter((q) => q.kind === 'unit' && !q.paid && (q.specId === faction.workerId) === worker).length, 0);
    const waitBudget = { worker: 1 - unpaid(true), soldier: (P.tight ? 2 : 3) - unpaid(false) };
    const train = (b: Building, id: string): boolean => {
      const st = w.specOf(this.player, id)?.stats;
      const kind = id === faction.workerId ? 'worker' : 'soldier';
      const paid = !!st && Math.min(b.stock.food, st.foodCost) + Math.min(b.stock.crystal, st.crystalCost) >= 0.8 * (st.foodCost + st.crystalCost); // (mostly) there already
      if (!paid && waitBudget[kind] <= 0) return false;
      if (!this.tryTrain(w, b, id, out)) return false;
      if (!paid) waitBudget[kind]--;
      return true;
    };
    for (const b of buildings) {
      if (!b.complete || b.queue.length >= 2) continue;
      const trains = (b.spec.trains ?? []).filter((id) => w.specOf(this.player, id));
      if (!trains.length) continue;
      if (trains.includes(faction.workerId) && workers.length < workerTarget) { train(b, faction.workerId); continue; }
      // soldiers (a building that also raises workers trains soldiers once there are enough workers)
      const soldiers = trains.filter(isSoldier);
      if (!soldiers.length || workerFirst) continue;
      const i = this.trainIndex.get(b.id) ?? 0;
      let pick: string;
      if (P.counters) {
        const ranked = [...soldiers].sort((p, q) => value(q) - value(p));
        pick = ranked.length > 1 && i % 4 === 3 ? ranked[1] : ranked[0];
        // the money goes to the best soldiers we can make: a building whose best is far worse waits, unless food piles up
        if (value(ranked[0]) < bestValue * 0.4 && stock.food < 800) continue;
      } else pick = soldiers[i % soldiers.length]; // whatever comes next on the list
      if (train(b, pick)) this.trainIndex.set(b.id, i + 1);
    }

    // ── Research: queue the next available tech when the building is idle (it waits for its wood).
    for (const b of buildings) {
      if (!b.complete || b.queue.length > 0) continue;
      for (const id of b.spec.researches ?? []) {
        const st = w.techStatus(this.player, id, b);
        // (hard only queues what it can pay for now, so a tech never holds up the workers behind it)
        if (!st.blocker && (!P.tight || stock.wood >= st.cost)) { out.push({ type: 'research', building: b.id, techId: id }); break; }
      }
    }

    // ── Garrison: a worker with fighting enemies close and none of our soldiers near runs for the
    //    nearest building with room (base, hut, camp) and shelters there; once it's calm everyone
    //    comes out and gets back to work.
    const fighting = hostiles.filter((e) => this.foe(w, e.owner) && w.armed(e) && (e.engage || e.order.kind === 'attack' || e.order.kind === 'attackMove'));
    {
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

    // ── Defense: an enemy in sight near home (hard: near any of our workers or buildings too)
    //    pulls the idle army, once it's been there long enough for us to react.
    if (home) {
      const close = (e: Unit) => {
        if ((e.x - home[0]) ** 2 + (e.y - home[1]) ** 2 < 16 * 16) return true;
        if (!P.guard) return false;
        return buildings.some((b) => (b.ox + b.size / 2 - e.x) ** 2 + (b.oy + b.size / 2 - e.y) ** 2 < 9 * 9) || workers.some((u) => (u.x - e.x) ** 2 + (u.y - e.y) ** 2 < 7 * 7);
      };
      const intruder = hostiles.find((e) => (this.foe(w, e.owner) || w.armed(e)) && close(e));
      if (!intruder) this.threatSince = -1;
      else if (this.threatSince < 0) this.threatSince = w.tick;
      if (intruder && w.tick - this.threatSince >= P.react) {
        const pool = army.filter((u) => u.id !== this.scout && w.armed(u) && (!this.attacking.has(u.id) || u.order.kind === 'idle'));
        // hard: outnumbered, the defenders hold together at home under the towers and garrison instead of chasing
        let [tx, ty] = [intruder.x, intruder.y];
        if (P.guard) {
          const theirs = hostiles.filter((e) => this.foe(w, e.owner) && w.armed(e) && (e.x - intruder.x) ** 2 + (e.y - intruder.y) ** 2 < 100).reduce((n, e) => n + power(e), 0);
          if (pool.reduce((n, u) => n + power(u), 0) < theirs) [tx, ty] = home;
        }
        const defenders = pool.filter((u) => !(u.order.kind === 'attackMove' && Math.hypot(u.order.x - tx, u.order.y - ty) < 4)).map((u) => u.id);
        if (defenders.length) out.push({ type: 'attackMove', units: defenders, x: tx, y: ty });
      }
    }

    // ── Clearing wildlife: dangerous animals we've seen near home (where our workers want to gather)
    //    get hunted by the soldiers at home, once there are enough of them to win.
    for (const id of this.hunters) if (!w.units.has(id)) this.hunters.delete(id);
    if (home && w.tick >= this.huntUntil) this.hunters.clear();
    if (home && !this.hunters.size && this.threatSince < 0) {
      let prey: Danger | null = null, preyD = 45 * 45;
      for (const d of this.dangers.values()) { const dd = (d.x - home[0]) ** 2 + (d.y - home[1]) ** 2; if (dd < preyD) { preyD = dd; prey = d; } }
      const pool = army.filter((u) => u.id !== this.scout && !this.attacking.has(u.id) && w.armed(u) && u.hp > u.stats.maxHp * 0.5);
      // Lanchester: the group's total health × total damage per second against the animal's
      const hp = pool.reduce((n, u) => n + u.hp, 0), dps = pool.reduce((n, u) => n + u.stats.damage / u.stats.cooldown, 0);
      if (prey && hp * dps >= 2 * prey.hp * prey.dps) {
        out.push({ type: 'attackMove', units: pool.map((u) => u.id), x: prey.x, y: prey.y });
        for (const u of pool) this.hunters.add(u.id);
        this.huntUntil = w.tick + TICK_RATE * 45;
      }
    }
    if (this.hunters.size && ![...this.dangers.values()].some((d) => home && (d.x - home[0]) ** 2 + (d.y - home[1]) ** 2 < 45 * 45)) this.hunters.clear(); // cleared

    // ── An enemy tower near home before we have an army: ring the bell and tear it down
    //    from under its arc (towers can't hit right below themselves).
    if (home) {
      let tower: number | null = null;
      for (const [id, k] of this.knownBuildings) if (k.tower && (k.x - home[0]) ** 2 + (k.y - home[1]) ** 2 < 22 * 22) { tower = id; break; }
      const fighters = army.filter((u) => w.armed(u)).length;
      if (tower !== null && fighters < 4) {
        const idle = workers.filter((u) => !(u.order.kind === 'attack' && u.order.target === tower) && u.order.kind !== 'muster').map((u) => u.id);
        if (idle.length) out.push({ type: 'attack', units: idle, target: tower });
      } else if (tower !== null) {
        const go = army.filter((u) => !this.attacking.has(u.id) && !(u.order.kind === 'attack' && u.order.target === tower)).map((u) => u.id);
        if (go.length) out.push({ type: 'attack', units: go, target: tower });
      }
    }

    // ── Offense: attack in growing waves (hard: once we're stronger than what we've seen of them).
    for (const id of this.attacking) if (!w.units.has(id)) this.attacking.delete(id);
    const homeArmy = army.filter((u) => !this.attacking.has(u.id) && u.id !== this.scout && !this.hunters.has(u.id));
    const fit = homeArmy.filter((u) => u.cal > u.stats.maxCalories * 0.6 && w.armed(u) && u.hp > u.stats.maxHp * 0.5);
    const target = this.enemyTarget(w);
    const wave = army.filter((u) => this.attacking.has(u.id));
    if (target) {
      const ours = fit.reduce((n, u) => n + power(u), 0) + wave.reduce((n, u) => n + power(u), 0);
      let theirs = 0;
      for (const f of this.seenFoes.values()) theirs += f.power;
      const strong = P.edge <= 0 || ours >= theirs * P.edge;
      // the enemy's army is (as far as we've seen) beaten: finish the buildings rather than wait for a full wave
      const finish = minutes >= 10 && fit.length >= 3 && ours >= theirs * 3;
      if ((fit.length >= this.waveSize && strong) || fit.length >= P.maxWave || finish) {
        out.push({ type: 'attackMove', units: fit.map((u) => u.id), x: target[0], y: target[1] });
        for (const u of fit) this.attacking.add(u.id);
        this.waveSize = Math.min(P.maxWave, this.waveSize + P.waveStep);
      } else if (P.micro && wave.length >= 4 && fit.length >= 3) {
        // reinforce the attack that's out rather than wait for a whole new wave
        const gx = wave.reduce((n, u) => n + u.x, 0) / wave.length, gy = wave.reduce((n, u) => n + u.y, 0) / wave.length;
        out.push({ type: 'attackMove', units: fit.map((u) => u.id), x: gx, y: gy });
        for (const u of fit) this.attacking.add(u.id);
      }
    }

    // ── Scouting: our fastest idle soldier runs to the enemy's side of the map and back, so we
    //    know what they field (hard: from the first soldier, and every two minutes).
    if (P.scout && home) {
      const scout = this.scout !== null ? w.units.get(this.scout) : undefined;
      const every = TICK_RATE * 120;
      if (!scout && this.scout === null && w.tick >= this.nextScout) {
        const pool = army.filter((u) => w.armed(u) && !this.attacking.has(u.id));
        const pick = pool.sort((a, b) => b.stats.speed - a.stats.speed || a.id - b.id)[0]; // soldiers only: a worker sent out just dies
        const there = this.enemyTarget(w);
        if (pick && there) { out.push({ type: 'move', units: [pick.id], x: there[0], y: there[1] }); this.scout = pick.id; }
      } else if (scout) {
        const there = this.enemyTarget(w);
        const danger = hostiles.some((e) => w.armed(e) && (e.x - scout.x) ** 2 + (e.y - scout.y) ** 2 < 8 * 8);
        const arrived = !there || Math.hypot(scout.x - there[0], scout.y - there[1]) < 6 || scout.order.kind === 'idle' || (danger && scout.hp < scout.stats.maxHp * 0.6);
        if (arrived) {
          out.push({ type: 'move', units: [scout.id], x: home[0], y: home[1] + homeOff });
          this.scout = null; this.nextScout = w.tick + every;
        }
      } else if (this.scout !== null) { this.scout = null; this.nextScout = w.tick + every; } // died: try again later
    }

    // ── Micro (hard): pull badly hurt soldiers out of a fight, focus fire on the weakest enemy in
    //    reach, and send heavy strikers in at a charge.
    if (P.micro && home && wave.length) {
      const enemies = hostiles.filter((e) => w.armed(e) || e.stats.canAttack);
      const hurt: number[] = [];
      for (const u of wave) {
        const near = enemies.filter((e) => (e.x - u.x) ** 2 + (e.y - u.y) ** 2 < 49);
        if (!near.length) continue;
        if (u.hp < u.stats.maxHp * 0.25 && wave.length > 3) { hurt.push(u.id); continue; }
        // the weakest enemy this unit can reach soon (its reach plus a couple of tiles)
        const reach = u.stats.range + 2;
        let best: Unit | null = null;
        for (const e of near) if ((e.x - u.x) ** 2 + (e.y - u.y) ** 2 <= reach * reach && (!best || e.hp < best.hp || (e.hp === best.hp && e.id < best.id))) best = e;
        if (!best) continue;
        const charger = !u.throws && u.stats.mass >= 120;
        if (!(u.order.kind === 'attack' && u.order.target === best.id)) out.push({ type: 'attack', units: [u.id], target: best.id, charge: charger || undefined });
      }
      if (hurt.length) {
        out.push({ type: 'move', units: hurt, x: home[0], y: home[1] + homeOff });
        for (const id of hurt) this.attacking.delete(id);
      }
    }

    // ── Retreat: a wave that's clearly outmatched where it stands falls back home to regroup
    //    (under the garrison's fire) instead of dying to the last unit.
    if (P.retreat && wave.length && home && w.tick >= this.nextRetreatCheck) {
      this.nextRetreatCheck = w.tick + TICK_RATE * 2;
      const gx = wave.reduce((n, u) => n + u.x, 0) / wave.length, gy = wave.reduce((n, u) => n + u.y, 0) / wave.length;
      const ours = wave.reduce((n, u) => n + power(u), 0);
      let theirs = 0;
      for (const e of hostiles) if (this.foe(w, e.owner) && w.armed(e) && (e.x - gx) ** 2 + (e.y - gy) ** 2 < 12 * 12) theirs += power(e);
      const homeDist = Math.hypot(gx - home[0], gy - home[1]);
      if (theirs > ours * 1.8 && homeDist > 18) {
        out.push({ type: 'move', units: wave.map((u) => u.id), x: home[0], y: home[1] + homeOff });
        for (const u of wave) this.attacking.delete(u.id);
        this.waveSize = Math.min(P.maxWave, Math.max(this.waveSize, wave.length + 4)); // come back bigger
      }
    }
    if (target) {
      // an attack that's arrived and found no one to fight goes for the nearest enemy building it knows (an attack-move
      // fights what it meets, and stops there); one with none near goes on to where the enemy is
      const stalled = army.filter((u) => this.attacking.has(u.id) && u.order.kind === 'idle' && u.engage === 0);
      const onward: number[] = [];
      for (const u of stalled) {
        let best: number | null = null, bestD = 10 * 10; // (within sight: one it's seen go is forgotten, see look())
        for (const [id, k] of this.knownBuildings) { const d = (k.x - u.x) ** 2 + (k.y - u.y) ** 2; if (d < bestD) { bestD = d; best = id; } }
        if (best !== null) out.push({ type: 'attack', units: [u.id], target: best }); else onward.push(u.id);
      }
      if (onward.length) out.push({ type: 'attackMove', units: onward, x: target[0], y: target[1] });
    }
    return out;
  }

  /** Wood the next building in the build order costs (0 when it's all built). */
  private woodWanted(w: World, plan: Array<[string, number]>, buildings: Building[]): number {
    for (const [id] of plan) {
      if (buildings.some((b) => b.specId === id) || w.buildBlocker(this.player, id)) continue;
      return w.buildingStatsOf(this.player, id)?.totalCost ?? 0;
    }
    return 0;
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

  /**
   * Where to attack: the enemy building we know of nearest home, then an enemy in sight; failing
   * that, the mirror of our own base (skirmish maps are point-symmetric, so that's where theirs
   * is, as any player knows) until we've looked there, then ground we haven't seen lately.
   */
  private enemyTarget(w: World): [number, number] | null {
    const home = w.baseOf(this.player);
    const hx = home ? home.ox + home.size / 2 : w.grid.width / 2, hy = home ? home.oy + home.size / 2 : w.grid.height / 2;
    let best: [number, number] | null = null, bestD = Infinity;
    for (const k of this.knownBuildings.values()) {
      const d = (k.x - hx) ** 2 + (k.y - hy) ** 2;
      if (d < bestD) { bestD = d; best = [k.x, k.y]; }
    }
    if (best) return best;
    for (const u of w.units.values()) if (this.foe(w, u.owner) && this.sees(w, u.x, u.y)) return [u.x, u.y];
    const mirror: [number, number] = [w.grid.width - hx, w.grid.height - hy];
    if (w.vision(this.player, mirror[0], mirror[1]) === 0) return mirror;
    return this.unexplored(w, mirror[0], mirror[1], Infinity);
  }

  /** The nearest spot to (x, y), within r, that we can't see right now (never seen first). */
  private unexplored(w: World, x: number, y: number, r: number): [number, number] | null {
    let best: [number, number] | null = null, bestScore = Infinity;
    for (let ty = 4; ty < w.grid.height; ty += 8) for (let tx = 4; tx < w.grid.width; tx += 8) {
      const v = w.vision(this.player, tx, ty);
      if (v === 2 || !w.grid.nearestOpen(tx, ty, 3)) continue;
      const d = Math.hypot(tx - x, ty - y);
      if (d > r) continue;
      const score = d + (v === 1 ? 1000 : 0);
      if (score < bestScore) { bestScore = score; best = [tx, ty]; }
    }
    return best;
  }

  /** The nearest resource of a kind we've found (explored ground), within 40 tiles, away from dangerous wildlife. */
  private nearestNode(w: World, u: Unit, type: ResourceKind): number | null {
    let best: number | null = null, bestD = 40 * 40;
    for (const n of w.nodes.values()) {
      if (n.shard || n.type !== type || n.amount <= 0 || w.vision(this.player, n.x, n.y) === 0 || this.dangerous(n.x, n.y)) continue;
      const d = (n.x - u.x) ** 2 + (n.y - u.y) ** 2;
      if (d < bestD) { bestD = d; best = n.id; }
    }
    return best;
  }

  /** Is this spot near wildlife we've seen attack? */
  private dangerous(x: number, y: number): boolean {
    for (const d of this.dangers.values()) if ((d.x - x) ** 2 + (d.y - y) ** 2 < DANGER_R * DANGER_R) return true;
    return false;
  }
}
