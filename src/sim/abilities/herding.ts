// Herding: taming wild animals and breeding them.
//  • A tamer (UnitSpec.tamer) feeds a wild animal food from its pack until the
//    animal joins its side: 0.15 kg of food per kg of animal. Fierce ones
//    have to be worn down first (below 40% health). Feeding adds up, so several
//    trips (or several tamers) can tame a big one.
//  • A tamed animal is an ordinary unit of its new side: it grazes as it goes,
//    fights if it has a weapon, and a passive one can be butchered for meat.
//  • A pen (BuildingSpec.pen) breeds the tamed animals of its side standing within
//    its radius: every pair of a kind makes a young one every so often, paid for
//    with its body's food cost from the pen's stock.
import type { BuildingSpec, UnitSpec } from '../../factions/types';
import { f1 } from '../../ui/format';
import { DT, MAX_UNITS_PER_PLAYER, type Building, type Unit, type World } from '../world';
import type { Ability } from './index';

/** kg of food per kg of animal to tame it. */
export const TAME_FOOD_PER_KG = 0.15;
/** kg/s a tamer feeds out of its pack. */
export const TAME_FEED_RATE = 2;
/** A fierce animal must be below this share of its health to accept food. */
export const TAME_FIERCE_HP = 0.4;
/** A pair breeds once per (this × its training time). */
export const BREED_TIME_MUL = 2;

export const tameFood = (animal: Unit): number => animal.stats.mass * TAME_FOOD_PER_KG;
export const isTamer = (w: World, u: Unit): boolean => !!w.specOf(u.owner, u.specId)?.spec.tamer;

/** An animal being fed stands still to eat (for a couple of seconds after each mouthful). */
export const eating = (w: World, a: Unit): boolean => a.tameTick !== undefined && w.tick - a.tameTick < 40;

/** Will this animal take food from `player` right now? */
export function tameable(animal: Unit): boolean {
  if (!animal.wild) return false;
  return animal.wild === 'passive' || animal.hp <= animal.stats.maxHp * TAME_FIERCE_HP;
}

/** It joins `player`: an ordinary unit of theirs from now on, keeping its temper as `tame`. */
export function joinSide(w: World, animal: Unit, player: number): void {
  w.adoptSpec(player, animal.owner, animal.specId);
  animal.tame = animal.wild;
  animal.wild = undefined;
  animal.owner = player;
  animal.order = { kind: 'idle' };
  animal.engage = 0;
  animal.tameFed = 0;
}

/** One tick of a tamer at work: walk up, feed from the pack; true while moving. */
export function runTame(w: World, u: Unit, targetId: number): boolean {
  const a = w.units.get(targetId);
  if (!a || !a.wild || u.food < 0.05) { w.finish(u); return false; }
  if (!tameable(a)) { w.finish(u); return false; } // too fierce yet: wear it down first
  if (!w.moveTo(u, a.x, a.y, u.stats.radius + a.stats.radius + 0.6)) return u.x !== u.px || u.y !== u.py;
  if (a.tameBy !== u.owner) { a.tameBy = u.owner; a.tameFed = 0; } // someone else's feeding doesn't count
  const k = Math.min(u.food, TAME_FEED_RATE * DT);
  u.food -= k; a.tameFed = (a.tameFed ?? 0) + k;
  a.tameTick = w.tick; // it stands still to eat
  u.busy = true;
  if (a.tameFed >= tameFood(a)) { joinSide(w, a, u.owner); w.finish(u); }
  return false;
}

/** Breeding in every pen: pairs of a kind within reach make young, paid from the pen's food. */
export function runPens(w: World): void {
  for (const b of w.buildings.values()) {
    const pen = b.spec.pen;
    if (!pen || !b.complete) continue;
    const cx = b.ox + b.size / 2, cy = b.oy + b.size / 2, r = b.size / 2 + pen.radius;
    const herd = new Map<string, number>();
    for (const u of w.units.values()) {
      if (u.owner !== b.owner || !u.tame || (u.x - cx) ** 2 + (u.y - cy) ** 2 > r * r) continue;
      herd.set(u.specId, (herd.get(u.specId) ?? 0) + 1);
    }
    b.breeding ??= {};
    for (const [id, n] of herd) {
      if (n < 2) continue;
      const s = w.specOf(b.owner, id);
      if (!s) continue;
      const pairs = Math.floor(n / 2);
      b.breeding[id] = (b.breeding[id] ?? 0) + DT * pairs;
      if (b.breeding[id] < s.stats.trainTime * BREED_TIME_MUL) continue;
      if (b.stock.food < s.stats.foodCost || w.unitsOf(b.owner).length >= MAX_UNITS_PER_PLAYER) continue;
      b.stock.food -= s.stats.foodCost;
      b.breeding[id] = 0;
      const spot = w.grid.nearestOpen(cx + b.size / 2 + 0.8, cy, 4);
      const young = spot && w.spawnAt(b.owner, id, spot[0], spot[1]);
      if (young) { young.tame = w.herdTemper(b.owner, id); young.order = { kind: 'idle' }; }
    }
    for (const id of Object.keys(b.breeding)) if ((herd.get(id) ?? 0) < 2) b.breeding[id] = 0;
  }
}

/** Food a pen wants on hand while it has pairs to breed. */
export function penWant(w: World, b: Building): number {
  if (!b.spec.pen || !b.breeding) return 0;
  let want = 0;
  for (const [id, t] of Object.entries(b.breeding)) if (t > 0) want = Math.max(want, w.specOf(b.owner, id)?.stats.foodCost ?? 0);
  return Math.ceil(want);
}

export const herding: Ability = {
  id: 'herding',
  validateUnit: (u: UnitSpec, where: string) => (u.tamer !== undefined && typeof u.tamer !== 'boolean' ? [`${where}: bad tamer`] : []),
  validateBuilding: (b: BuildingSpec, where: string) => (b.pen !== undefined && !(typeof b.pen.radius === 'number' && b.pen.radius > 0 && b.pen.radius <= 8) ? [`${where}: bad pen`] : []),
  unitCodex: (u: UnitSpec) => (u.tamer ? `<b>Tamer.</b> Right-click a wild animal to feed it from its pack (${f1(TAME_FOOD_PER_KG, 1)} kg of food per kg of animal) until it joins you; fierce ones must be worn below ${Math.round(TAME_FIERCE_HP * 100)}% health first.` : null),
  buildingCodex: (b: BuildingSpec) => (b.pen ? `<b>Pen.</b> Tamed animals of yours within ${b.pen.radius} tiles breed: each pair of a kind makes a young one every ${BREED_TIME_MUL}× its training time, paid with its food cost from this building's stock.` : null),
};

