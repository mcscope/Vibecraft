// Flight (UnitSpec.flight): it takes off whenever it goes further than a short
// walk (or the way is blocked), flies straight over
// walls, water and everyone's heads, and lands when it stops. Staying up burns
// calories every second in proportion to its mass, so how long it can stay up
// depends on how much of its body is reserve, not on its size. It comes down
// before it's spent (and won't take off nearly empty), so it can walk home. In the air,
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
/** Calories per second aloft, per kg of body. */
export const FLY_BURN_PER_KG = 0.9;
/** It lands below this share of its calories, and takes off only above LAUNCH_FRACTION. */
export const LAND_FRACTION = 0.1;
export const LAUNCH_FRACTION = 0.2;

/** Burn grows with height: holding twice as high costs twice as much. */
export const flightBurn = (d: DerivedStats): number => d.mass * FLY_BURN_PER_KG * (d.flyHeight / FLY_HEIGHT);
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
  if (!u.airborne) return;
  u.cal -= flightBurn(u.stats) * dt;
  const hovering = u.throws && (u.engage || u.order.kind === 'attack' || u.order.kind === 'attackMove');
  if (u.cal <= u.stats.maxCalories * LAND_FRACTION || u.exhausted || (!moved && !hovering)) {
    if (!w.grid.isBlocked(u.x, u.y)) { u.airborne = false; return; }
    const open = w.grid.nearestOpen(u.x, u.y, 6); // over a wall or water: glide to open ground first
    if (open) { u.x = open[0]; u.y = open[1]; u.airborne = false; }
  }
  if (u.cal < 0) u.cal = 0;
}

/** Can `attacker` reach `target`? Only thrown crystals reach a flier in the air. */
export const canReach = (attacker: Unit, target: Unit): boolean => !target.airborne || attacker.throws;

/** Extra damage a crystal gains falling from flying height. */
export const heightBonus = (u: Unit): number => (u.airborne ? u.crystalMass * K.gravity * u.stats.flyHeight * K.throwEfficiency * K.damageScale : 0);

export const flight: Ability = {
  id: 'flight',
  validateUnit: (u: UnitSpec, where: string) => (u.flight !== undefined && typeof u.flight !== 'boolean' && !(typeof u.flight === 'object' && typeof u.flight.height === 'number' && u.flight.height >= 3 && u.flight.height <= 30) ? [`${where}: bad flight (true, or { height: 3–30 m })`] : []),
  unitCodex: (u: UnitSpec, d: DerivedStats) => (u.flight
    ? `<b>Flies</b> at ${n0(d.flyHeight)} m. Walks a few tiles, takes off to go further, straight over walls and water; burns ${f1(flightBurn(d), 1)} cal/s aloft (about ${n0(airtime(d) * (1 - LAND_FRACTION))} s on full calories) and lands when it stops or runs low. In the air only thrown crystals reach it${u.attack?.style === 'strike' ? '; it lands to strike' : '; what it drops falls the whole way, so it hits much harder from up there, and it sees further'}. Flying higher hits harder and burns faster.`
    : null),
};
