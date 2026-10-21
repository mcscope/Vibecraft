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
import { bodyHeight, K, M_PER_TILE, type DerivedStats } from '../physics';
import type { Unit, World } from '../world';
import type { Ability } from './index';

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
/** A dive steeper than this (radians from level) it noses over into; it dives no steeper than DIVE_MAX. */
export const DIVE_START = Math.PI / 4;
export const DIVE_MAX = 1.3;
/** Air drag on a diving (or zooming) body: k in dv/dt = g·sinθ − k·v², so it falls no faster than ~45 m/s. */
const drag = (): number => K.gravity / 45 ** 2; // (read when it flies: physics loads after this module)
/** Climbing away after a dive, it zooms up at this angle, trading its extra speed for height. */
const ZOOM_ANGLE = 0.5;

/** Metres short of its target it aims its dive to bottom out, to run in level the rest of the way (a charge). */
const RUN_IN = 6;

/**
 * A striker in the air going for something on the ground dives on it, honestly: it flies over at its height till the
 * spot RUN_IN short of the target lies steeply below (DIVE_START), then noses over and dives at it, gathering speed as
 * it drops (g·sinθ, less drag); down at striking height (the target's shoulders plus its own reach) it pulls out level
 * and runs in on it like a charge, fast, slowing only to drag, and strikes passing through (its speed is in the blow,
 * as a charger's is). True while it can strike. Past it, it keeps its speed and zooms back up on it (tickFlight).
 */
export function diveAt(w: World, u: Unit, t: Unit, dt: number, face: (dx: number, dy: number) => void): boolean {
  const strikeAlt = 0.8 * bodyHeight(t.stats.mass) + Math.max(0, u.stats.range - u.stats.radius) * M_PER_TILE;
  const reach = u.stats.range + t.stats.radius + u.stats.radius;
  const dist = Math.hypot(t.x - u.x, t.y - u.y);
  let v = Math.max(u.flySpeed, airSpeed(u)) * M_PER_TILE;
  // (close, it flies on through, as a charger runs on past: it never stops in the air)
  const past = (): [number, number] => dist > reach * 2 ? [t.x, t.y] : [u.x + Math.cos(u.flyDir) * 3, u.y + Math.sin(u.flyDir) * 3];
  if (u.diveRun) {
    // the run in: level, straight at it, slowing only to drag; past it (it's behind), the run is over
    const ahead = Math.cos(Math.atan2(t.y - u.y, t.x - u.x) - u.flyDir);
    if (ahead < -0.2 && dist > reach) { u.diveRun = false; return false; }
    v = Math.max(airSpeed(u) * M_PER_TILE, v - drag() * v * v * dt);
    u.alt = strikeAlt;
    flyTo(w, u, ...past(), 0.01, v / M_PER_TILE / FLY_SPEED, dt, face);
    u.flySpeed = v / M_PER_TILE;
    return dist <= reach;
  }
  const drop = u.alt - strikeAlt;
  const dm = Math.max(0.5, dist * M_PER_TILE - RUN_IN); // metres across to where it bottoms out
  const angle = Math.atan2(drop, dm);
  // (it dives only from high enough to gather speed: after a dive it climbs back up first)
  if (!u.diving && (angle < DIVE_START || drop < u.stats.flyHeight * 0.5)) {
    flyTo(w, u, ...(drop <= 0.05 ? past() : [t.x, t.y] as [number, number]), 0.05, Math.max(u.flySpeed / FLY_SPEED, u.stats.speed), dt, face);
    return drop <= 0.05 && dist <= reach; // low and on it anyway: it strikes in passing
  }
  u.diving = true;
  const th = Math.min(DIVE_MAX, Math.max(0.2, angle));
  v = Math.max(0, v + (K.gravity * Math.sin(th) - drag() * v * v) * dt);
  u.diveAngle = th;
  u.alt = Math.max(strikeAlt, u.alt - v * Math.sin(th) * dt);
  flyTo(w, u, t.x, t.y, 0.01, (v * Math.cos(th)) / M_PER_TILE / FLY_SPEED, dt, face);
  u.flySpeed = v / M_PER_TILE;
  if (u.alt <= strikeAlt + 1e-6) { u.diving = false; u.diveRun = true; } // bottomed out: pulling out level for the run in
  return false;
}

/** Seconds it crouches, winding up, before its legs spring it off the ground (still, its feet planted). */
export const LAUNCH_WINDUP = 0.25;
/** Seconds of its 'leap' pose: the crouch (its first fifth), then the spring, away. Its pace builds through the spring. */
export const LEAP_TIME = 1.25;
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
  if (!u.stats.flight || u.airborne || u.exhausted || u.cal <= u.stats.maxCalories * LAUNCH_FRACTION) return;
  u.airborne = true;
  // it springs off the way it's facing, or (launch: 'backward') flings itself up and over away from it
  u.flyDir = u.facing + (u.stats.launchBackward ? Math.PI : 0);
}

/** Would a grounded flier rather walk to (gx, gy)? Short and clear: yes. */
export function walks(w: World, u: Unit, gx: number, gy: number): boolean {
  return !u.airborne && (gx - u.x) ** 2 + (gy - u.y) ** 2 <= WALK_HOP * WALK_HOP && w.grid.lineClear(u.x, u.y, gx, gy);
}

/** Fly forward along its heading for a tick, staying on the map. */
function glide(w: World, u: Unit, speed: number, dt: number, face: (dx: number, dy: number) => void): void {
  const cx = Math.cos(u.flyDir), cy = Math.sin(u.flyDir);
  // crouched, winding up, it stays put (its feet planted); springing, its pace builds from nothing
  if (u.launchT < LEAP_TIME) speed *= Math.max(0, (u.launchT - LAUNCH_WINDUP) / (LEAP_TIME - LAUNCH_WINDUP)) ** 2;
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
  if (u.launchT <= LAUNCH_WINDUP && !u.stats.launchBackward) u.flyDir = want; // (crouched to spring, it turns to face where it's going)
  let turn = Math.atan2(Math.sin(want - u.flyDir), Math.cos(want - u.flyDir));
  const max = u.launchT < LEAP_TIME ? 0 : turnRate(u) * dt; // (it finishes its leap before it wheels round)
  turn = Math.max(-max, Math.min(max, turn));
  u.flyDir += turn;
  u.bank = max > 0 ? turn / max : 0;
  u.flySpeed = u.diving ? speed * FLY_SPEED : Math.max(speed * FLY_SPEED, u.flySpeed); // it keeps this pace when it coasts (and the extra a dive gave it, till it zooms it away)
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
  if (!u.airborne) { u.alt = 0; u.vert = 0; u.vz = 0; u.launchT = 0; return; }
  const alt0 = u.alt;
  u.launchT += dt;
  if ((u.diving || u.diveRun) && u.flewTick !== w.tick) u.diving = u.diveRun = false; // (it broke off: its target gone, or new orders)
  if (u.diving) { u.vert = -1; u.vz = 0; return; } // (a dive moves it itself: diveAt)
  if (u.diveRun) { u.vert = 0; u.vz = 0; return; }
  // faster than it flies, after a dive: it zooms up, trading the extra speed for height
  const cruise = airSpeed(u) * M_PER_TILE, v = u.flySpeed * M_PER_TILE;
  if (v > cruise + 0.01) {
    const v2 = Math.max(cruise, v - (K.gravity * Math.sin(ZOOM_ANGLE) + drag() * v * v) * dt);
    u.alt = Math.min(u.stats.flyHeight, u.alt + v * Math.sin(ZOOM_ANGLE) * dt);
    u.flySpeed = v2 / M_PER_TILE;
  }
  const flew = u.flewTick === w.tick;
  const flaring = !flew && u.alt < FLARE_HEIGHT && (u.vert < 0 || u.alt < 0.5); // the last few metres down: straight in, airbrakes out
  if (!flew) { u.bank = flaring || u.launchT < LEAP_TIME ? 0 : 1; if (!flaring && u.launchT >= LEAP_TIME) u.flyDir += turnRate(u) * dt; glide(w, u, (u.flySpeed || airSpeed(u)) * (flaring ? 0.5 : 1), dt, face); } // no stopping in the air: circle at its pace
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
    const climb = u.launchT <= LAUNCH_WINDUP ? 0 : Math.min(rate * dt, Math.max(0, u.stats.flyHeight - u.alt)); // (crouched, winding up: still on the ground)
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
export const heightBonus = (u: Unit): number => (u.airborne ? u.crystalMass * K.gravity * u.alt * K.damageScale : 0);

export const flight: Ability = {
  id: 'flight',
  validateUnit: (u: UnitSpec, where: string) => {
    const f = u.flight;
    if (f === undefined || typeof f === 'boolean') return [];
    const ok = typeof f === 'object' && (f.height === undefined || (typeof f.height === 'number' && f.height >= 3 && f.height <= 30)) && (f.launch === undefined || f.launch === 'backward');
    return ok ? [] : [`${where}: bad flight (true, or { height?: 3–30 m, launch?: 'backward' })`];
  },
  unitCodex: (u: UnitSpec, d: DerivedStats) => (u.flight
    ? `<b>Flies</b>, climbing slowly to ${n0(d.flyHeight)} m. Walks a few tiles, takes off to go further, straight over walls and water. Flapping up costs ${f1(flightBurn(d), 1)} cal/s plus ${n0(climbCost(d))} cal for the whole climb; once at its ceiling it soars on ${f1(soarBurn(d), 1)} cal/s. It lands when it stops or runs low.${d.launchBackward ? ' It takes off backward, flinging itself up and over away from the way it faces, and banks round.' : ''} In the air only thrown crystals reach it${u.attack?.style === 'strike' ? '; it dives on its target, gathering speed as it drops, and strikes once it is down within reach, then zooms back up' : '; it bombs: flies over its target and drops crystals that hit harder the higher it has climbed'}, and it sees further.`
    : null),
};
