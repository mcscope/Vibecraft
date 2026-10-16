// Match statistics for the post-game score screen: running totals per player,
// plus a timeline sampled every few seconds for the graphs. Only ever read by
// the UI; nothing in the sim depends on it, so it can't affect the game.
import type { ResourceKind } from '../factions/types';
import type { WorldEvent as GameEvent, World } from './world';

export const STATS_EVERY_SEC = 10;

export interface PlayerTotals {
  gathered: Record<ResourceKind, number>;
  trained: number;
  lost: number;
  killed: number;
  buildingsLost: number;
  buildingsRazed: number;
}

/** One sample of the timeline: seconds into the match, then per-player values. */
export interface StatsSample {
  t: number;
  /** Units alive (all kinds). */
  units: number[];
  /** What the armed, non-worker units alive would cost to train (food + crystal). */
  army: number[];
  /** Everything gathered so far (kg of all resources). */
  gathered: number[];
  /** Stock on hand in all buildings (kg of all resources). */
  stock: number[];
}

export class MatchStats {
  readonly totals: PlayerTotals[];
  readonly timeline: StatsSample[] = [];
  resigned = -1;

  constructor(players: number) {
    this.totals = Array.from({ length: players }, () => ({ gathered: { food: 0, wood: 0, crystal: 0 }, trained: 0, lost: 0, killed: 0, buildingsLost: 0, buildingsRazed: 0 }));
  }

  gather(owner: number, r: ResourceKind, kg: number): void {
    const t = this.totals[owner];
    if (t) t.gathered[r] += kg;
  }

  /** After each tick: count what happened (`events` since the tick began) and sample now and then. */
  record(w: World, events: GameEvent[]): void {
    const rivals = (owner: number) => w.players.filter((p) => !p.neutral && p.id !== owner).map((p) => p.id);
    for (const e of events) {
      if (e.type === 'trained') { const t = this.totals[e.owner]; if (t) t.trained++; }
      else if (e.type === 'death' && !w.players[e.owner]?.neutral) {
        const t = this.totals[e.owner]; if (t) t.lost++;
        for (const r of rivals(e.owner)) this.totals[r].killed++; // 1v1: whoever's left did it
      } else if (e.type === 'buildingDestroyed' && !w.players[e.owner]?.neutral) {
        const t = this.totals[e.owner]; if (t) t.buildingsLost++;
        for (const r of rivals(e.owner)) this.totals[r].buildingsRazed++;
      }
    }
    if (w.tick % Math.round(STATS_EVERY_SEC * 20) === 0 || w.winner >= 0) this.sample(w);
  }

  sample(w: World): void {
    const n = this.totals.length;
    const s: StatsSample = { t: w.tick / 20, units: Array(n).fill(0), army: Array(n).fill(0), gathered: Array(n).fill(0), stock: Array(n).fill(0) };
    if (this.timeline.length && this.timeline[this.timeline.length - 1].t === s.t) return;
    for (const u of w.units.values()) {
      if (u.owner >= n || w.players[u.owner]?.neutral) continue;
      s.units[u.owner]++;
      const f = w.factionOf(u.owner);
      if (u.specId !== f.workerId && !u.carter && u.stats.canAttack) s.army[u.owner] += u.stats.foodCost + u.stats.crystalCost;
    }
    for (const b of w.buildings.values()) if (b.owner < n) s.stock[b.owner] += b.stock.food + b.stock.wood + b.stock.crystal;
    for (let p = 0; p < n; p++) { const g = this.totals[p].gathered; s.gathered[p] = g.food + g.wood + g.crystal; }
    this.timeline.push(s);
  }
}
