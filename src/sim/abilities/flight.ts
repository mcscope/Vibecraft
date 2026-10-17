// Flight (UnitSpec.flight): it takes off whenever it goes further than a short
// walk (or the way is blocked), flies straight over
// walls, water and everyone's heads, and lands when it stops. Staying up burns
// a little every second (soaring is cheap) and more to climb: it rises slowly
// toward its ceiling while it flies, paying for every metre with its own weight.
// Higher, its drops fall further and hit harder. It comes down before it's spent
// (and won't take off nearly empty), so it can walk home. In the air a thrower
// bombs: it flies over the target and drops crystals straight down. In the air,
// only thrown crystals (and towers) can reach it; a melee flier must land to
// strike, then takes off again. Airborne throwers throw from height: their
// crystals fall further and hit harder, and they see further.
import type { UnitSpec } from '../../factions/types';
import { f1, n0 } from '../../ui/format';
import { DEFAULT_FLY_HEIGHT, K, type DerivedStats } from '../physics';
import type { Unit, World } from '../world';
import type { Ability } from './index';

/** How high fliers fly (m): their height bonus to thrown crystals. */
export const FLY_HEIGHT = DEFAULT_FLY_HEIGHT;
/** Extra sight in the air (tiles). */
export const FLY_SIGHT = 3;
/** Flying is faster than walking (no ground to push off, nothing in the way). */
export const FLY_SPEED = 1.6;
/** A grounded flier walks rather than flies to anywhere this close (tiles) with a clear way there. */
export const WALK_HOP = 3;
/** Calories per second of level flight, per kg of body (soaring is cheap). */
export const FLY_BURN_PER_KG = 0.3;
/** Calories to climb one metre, per kg of body. */
export const CLIMB_CAL_PER_KG_M = 0.5;
/** Metres per second it climbs toward its ceiling. */
export const CLIMB_RATE = 1;
/** How close (tiles) a bomber gets over its target before it drops. */
export const BOMB_REACH = 0.6;
/** Seconds a crystal takes to fall `h` metres. */
export const dropTime = (h: number): number => Math.max(0.25, Math.sqrt((2 * h) / K.gravity));
/** It lands below this share of its calories, and takes off only above LAUNCH_FRACTION. */
export const LAND_FRACTION = 0.1;
export const LAUNCH_FRACTION = 0.2;

/** Calories per second of level flight. */
export const flightBurn = (d: DerivedStats): number => d.mass * FLY_BURN_PER_KG;
/** Calories to climb all the way to its ceiling. */
export const climbCost = (d: DerivedStats): number => d.mass * d.flyHeight * CLIMB_CAL_PER_KG_M;
/** Seconds it can stay up on full calories. */
export const airtime = (d: DerivedStats): number => d.maxCalories / flightBurn(d);

/** Take off (if it can fly and has the strength). */
export function takeOff(u: Unit): void {
  if (u.stats.flight && !u.exhausted && u.cal > u.stats.maxCalories * LAUNCH_FRACTION) u.airborne = true;
}

/** Would a grounded flier rather walk to (gx, gy)? Short and clear: yes. */
export function walks(w: World, u: Unit, gx: number, gy: number): boolean {
  return !u.airborne && (gx - u.x) ** 2 + (gy - u.y) ** 2 <= WALK_HOP * WALK_HOP && w.grid.lineClear(u.x, u.y, gx, gy);
}

/** Fly straight toward (gx, gy), over anything. True once within `arrive`. */
export function flyTo(u: Unit, gx: number, gy: number, arrive: number, speed: number, dt: number, face: (dx: number, dy: number) => void): boolean {
  const dx = gx - u.x, dy = gy - u.y, d = Math.sqrt(dx * dx + dy * dy);
  if (d <= arrive) { u.path = []; return true; }
  const step = Math.min(d, speed * FLY_SPEED * dt);
  u.x += (dx / d) * step; u.y += (dy / d) * step;
  face(dx, dy);
  u.busy = true;
  return d - step <= arrive;
}

/** Each tick: burn calories aloft; come down when spent, or when it's stopped (unless it's a thrower fighting from the air). */
export function tickFlight(w: World, u: Unit, moved: boolean, dt: number): void {
  if (!u.airborne) { u.alt = 0; return; }
  const climb = Math.min(CLIMB_RATE * dt, Math.max(0, u.stats.flyHeight - u.alt));
  u.alt += climb;
  u.cal -= flightBurn(u.stats) * dt + u.stats.mass * CLIMB_CAL_PER_KG_M * climb;
  const hovering = u.throws && (u.engage || u.order.kind === 'attack' || u.order.kind === 'attackMove');
  if (u.cal <= u.stats.maxCalories * LAND_FRACTION || u.exhausted || (!moved && !hovering)) {
    if (!w.grid.isBlocked(u.x, u.y)) { u.airborne = false; u.alt = 0; return; }
    const open = w.grid.nearestOpen(u.x, u.y, 6); // over a wall or water: glide to open ground first
    if (open) { u.x = open[0]; u.y = open[1]; u.airborne = false; u.alt = 0; }
  }
  if (u.cal < 0) u.cal = 0;
}

/** Can `attacker` reach `target`? Only thrown crystals reach a flier in the air. */
export const canReach = (attacker: Unit, target: Unit): boolean => !target.airborne || attacker.throws;

/** Extra damage a crystal gains falling from flying height. */
export const heightBonus = (u: Unit): number => (u.airborne ? u.crystalMass * K.gravity * u.alt * K.throwEfficiency * K.damageScale : 0);

export const flight: Ability = {
  id: 'flight',
  validateUnit: (u: UnitSpec, where: string) => (u.flight !== undefined && typeof u.flight !== 'boolean' && !(typeof u.flight === 'object' && typeof u.flight.height === 'number' && u.flight.height >= 3 && u.flight.height <= 30) ? [`${where}: bad flight (true, or { height: 3–30 m })`] : []),
  unitCodex: (u: UnitSpec, d: DerivedStats) => (u.flight
    ? `<b>Flies</b>, climbing slowly to ${n0(d.flyHeight)} m. Walks a few tiles, takes off to go further, straight over walls and water. Soaring costs ${f1(flightBurn(d), 1)} cal/s; climbing all the way costs ${n0(climbCost(d))} cal more. It lands when it stops or runs low. In the air only thrown crystals reach it${u.attack?.style === 'strike' ? '; it lands to strike' : '; it bombs: flies over its target and drops crystals that hit harder the higher it has climbed'}, and it sees further.`
    : null),
};
