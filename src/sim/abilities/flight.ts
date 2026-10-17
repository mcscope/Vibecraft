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
import { bodyHeight, DEFAULT_FLY_HEIGHT, K, M_PER_TILE, type DerivedStats } from '../physics';
import type { Unit, World } from '../world';
import type { Ability } from './index';

/** How high fliers fly (m): their height bonus to thrown crystals. */
export const FLY_HEIGHT = DEFAULT_FLY_HEIGHT;
/** Extra sight in the air (tiles). */
export const FLY_SIGHT = 3;
/** Flying is faster than walking (no ground to push off, nothing in the way). */
export const FLY_SPEED = 1.6;
/** A grounded flier walks rather than flies to anywhere this close (tiles) with a clear way there. */
export const WALK_HOP = 5;
/** Calories per second flapping (taking off and climbing), per kg of body. */
export const FLY_BURN_PER_KG = 0.43;
/** Calories per second soaring at its ceiling, per kg: riding the air costs little. */
export const SOAR_BURN_PER_KG = 0.143;
/** Calories to climb one metre, per kg of body. */
export const CLIMB_CAL_PER_KG_M = 0.71;
/** Metres per second it climbs toward its ceiling. */
export const CLIMB_RATE = 1;
/** Metres of the take-off burst (climbs 3× as fast up to here). */
export const LAUNCH_HEIGHT = 1.5;
/** Extra climb rate (× CLIMB_RATE) right off the ground, easing away by 1.5 × LAUNCH_HEIGHT. 0: no burst. */
export const LAUNCH_BURST = 0;
/** Show the steep 'leap' pose for the first LAUNCH_HEIGHT metres (the sprites stay baked either way). */
export const LEAP_POSE = false;
/** How close (tiles) a bomber gets over its target before it drops. */
export const BOMB_REACH = 0.6;
/** Seconds a crystal takes to fall `h` metres. */
export const dropTime = (h: number): number => Math.max(0.25, Math.sqrt((2 * h) / K.gravity));
/** It lands below this share of its calories, and takes off only above LAUNCH_FRACTION. */
export const LAND_FRACTION = 0.1;
export const LAUNCH_FRACTION = 0.2;

/** Calories per second flapping up, and soaring once at its ceiling. */
export const flightBurn = (d: DerivedStats): number => d.mass * FLY_BURN_PER_KG;
export const soarBurn = (d: DerivedStats): number => d.mass * SOAR_BURN_PER_KG;
/** Calories to climb all the way to its ceiling. */
export const climbCost = (d: DerivedStats): number => d.mass * d.flyHeight * CLIMB_CAL_PER_KG_M;
/** Seconds it can stay up on full calories. */
export const airtime = (d: DerivedStats): number => d.maxCalories / flightBurn(d);

/** Turn rate in the air (radians/s) for a 22 kg bird; heavier birds turn slower (∝ 1/∛mass). */
export const FLY_TURN = 2.5;
/** Metres per second it sinks while coming in to land. */
export const DESCENT_RATE = 1.5;
/** Below this (m) it flares to land: wings braking, it drops fast and stops circling. */
export const FLARE_HEIGHT = 2.5;
export const FLARE_DESCENT = 4;
/** It starts coming in to land this close (tiles) to where it has to be on foot. */
export const LAND_APPROACH = 4;

/** How fast a big body's heading can bend, rad/s: a bird banking, or a long body wheeling on the ground. */
export const wheelRate = (mass: number): number => FLY_TURN / Math.cbrt(mass / 22);
const turnRate = (u: Unit): number => wheelRate(u.stats.mass);
const airSpeed = (u: Unit): number => u.stats.speed * FLY_SPEED;

/** Take off (if it can fly and has the strength). */
export function takeOff(u: Unit): void {
  if (u.stats.flight && !u.exhausted && u.cal > u.stats.maxCalories * LAUNCH_FRACTION) u.airborne = true;
}

/** Would a grounded flier rather walk to (gx, gy)? Short and clear: yes. */
export function walks(w: World, u: Unit, gx: number, gy: number): boolean {
  return !u.airborne && (gx - u.x) ** 2 + (gy - u.y) ** 2 <= WALK_HOP * WALK_HOP && w.grid.lineClear(u.x, u.y, gx, gy);
}

/** Fly forward along its heading for a tick, staying on the map. */
function glide(w: World, u: Unit, speed: number, dt: number, face: (dx: number, dy: number) => void): void {
  const cx = Math.cos(u.flyDir), cy = Math.sin(u.flyDir);
  u.x = Math.max(0.5, Math.min(w.grid.width - 0.5, u.x + cx * speed * dt));
  u.y = Math.max(0.5, Math.min(w.grid.height - 0.5, u.y + cy * speed * dt));
  face(cx, cy);
  u.busy = true;
}

/**
 * Fly toward (gx, gy) over anything. A bird can't stop or turn on a dime: it
 * keeps flying forward and turns toward the goal at its turn rate, so it loops
 * round a goal it overshoots. True once within `arrive`.
 */
export function flyTo(w: World, u: Unit, gx: number, gy: number, arrive: number, speed: number, dt: number, face: (dx: number, dy: number) => void): boolean {
  const dx = gx - u.x, dy = gy - u.y, d = Math.sqrt(dx * dx + dy * dy);
  u.goalX = gx; u.goalY = gy;
  if (d <= arrive) { u.path = []; return true; }
  const want = Math.atan2(dy, dx);
  if (u.alt < 0.05) u.flyDir = want; // leaping off the ground, it faces where it's going
  let turn = Math.atan2(Math.sin(want - u.flyDir), Math.cos(want - u.flyDir));
  const max = turnRate(u) * dt;
  turn = Math.max(-max, Math.min(max, turn));
  u.flyDir += turn;
  u.flySpeed = speed * FLY_SPEED; // it keeps this pace when it coasts
  glide(w, u, u.flySpeed, dt, face);
  u.flewTick = w.tick;
  return Math.hypot(gx - u.x, gy - u.y) <= arrive;
}

/**
 * Each tick in the air: a bird with nowhere to fly keeps flying, circling; it
 * climbs slowly toward its ceiling while it has somewhere to be (or a target to
 * bomb), and comes in to land slowly, circling down, when it's done, running low,
 * or nearly at a place it has to reach on foot.
 */
export function tickFlight(w: World, u: Unit, _moved: boolean, dt: number, face: (dx: number, dy: number) => void): void {
  if (!u.airborne) { u.alt = 0; u.vert = 0; u.vz = 0; return; }
  const alt0 = u.alt;
  const flew = u.flewTick === w.tick;
  const flaring = !flew && u.alt < FLARE_HEIGHT && (u.vert < 0 || u.alt < 0.5); // the last few metres down: straight in, airbrakes out
  if (!flew) { if (!flaring) u.flyDir += turnRate(u) * dt; glide(w, u, (u.flySpeed || airSpeed(u)) * (flaring ? 0.5 : 1), dt, face); } // no stopping in the air: circle at its pace
  const fighting = u.throws && (u.engage || u.order.kind === 'attack' || u.order.kind === 'attackMove');
  const travelling = flew && (u.order.kind === 'move' || u.order.kind === 'attackMove' || u.order.kind === 'attack');
  const nearFootGoal = flew && !travelling && Math.hypot(u.goalX - u.x, u.goalY - u.y) < LAND_APPROACH;
  const low = u.cal <= u.stats.maxCalories * LAND_FRACTION || u.exhausted;
  const comingIn = low || (!fighting && (!flew || nearFootGoal));
  if (comingIn) {
    u.alt = Math.max(0, u.alt - (u.alt < FLARE_HEIGHT ? FLARE_DESCENT : DESCENT_RATE) * dt);
    u.cal -= soarBurn(u.stats) * dt; // gliding down
    if (u.alt <= 0) {
      if (!w.grid.isBlocked(u.x, u.y)) { u.airborne = false; u.alt = 0; }
      else u.alt = 0.3; // over a wall or water: keep circling until there's ground
    }
  } else {
    // a burst off the ground (wings pounding) for the first couple of metres, then a steady climb
    // (trying it without the take-off burst: set LAUNCH_BURST to 2 for 3 m/s off the ground, easing to 1)
    const rate = CLIMB_RATE * (1 + LAUNCH_BURST * Math.max(0, 1 - u.alt / (LAUNCH_HEIGHT * 1.5)));
    const climb = Math.min(rate * dt, Math.max(0, u.stats.flyHeight - u.alt));
    u.alt += climb;
    const soaring = u.alt >= u.stats.flyHeight - 1e-6; // up at its ceiling it rides the air
    u.cal -= (soaring ? soarBurn(u.stats) : flightBurn(u.stats)) * dt + u.stats.mass * CLIMB_CAL_PER_KG_M * climb;
  }
  if (u.cal < 0) u.cal = 0;
  u.vert = u.alt > alt0 + 1e-6 ? 1 : u.alt < alt0 - 1e-6 ? -1 : 0;
  u.vz = (u.alt - alt0) / dt;
}

/**
 * Can `attacker` reach `target`? Thrown crystals reach a flier at any height; a striker only one flying low
 * enough: within shoulder height (0.8 of its body's) plus its weapon's reach, held straight up.
 */
export const canReach = (attacker: Unit, target: Unit): boolean =>
  !target.airborne || attacker.throws || target.alt <= verticalReach(attacker);

/** Metres up a striker can hit: its shoulders plus its reach (arm and any shaft) beyond its body. */
export const verticalReach = (u: Unit): number => 0.8 * bodyHeight(u.stats.mass) + Math.max(0, u.stats.range - u.stats.radius) * M_PER_TILE;

/** Extra damage a crystal gains falling from flying height. */
export const heightBonus = (u: Unit): number => (u.airborne ? u.crystalMass * K.gravity * u.alt * K.throwEfficiency * K.damageScale : 0);

export const flight: Ability = {
  id: 'flight',
  validateUnit: (u: UnitSpec, where: string) => (u.flight !== undefined && typeof u.flight !== 'boolean' && !(typeof u.flight === 'object' && typeof u.flight.height === 'number' && u.flight.height >= 3 && u.flight.height <= 30) ? [`${where}: bad flight (true, or { height: 3–30 m })`] : []),
  unitCodex: (u: UnitSpec, d: DerivedStats) => (u.flight
    ? `<b>Flies</b>, climbing slowly to ${n0(d.flyHeight)} m. Walks a few tiles, takes off to go further, straight over walls and water. Flapping up costs ${f1(flightBurn(d), 1)} cal/s plus ${n0(climbCost(d))} cal for the whole climb; once at its ceiling it soars on ${f1(soarBurn(d), 1)} cal/s. It lands when it stops or runs low. In the air only thrown crystals reach it${u.attack?.style === 'strike' ? '; it lands to strike' : '; it bombs: flies over its target and drops crystals that hit harder the higher it has climbed'}, and it sees further.`
    : null),
};
