// THE RULES OF THE WORLD.
//
// Every unit stat is derived here from a UnitSpec's physical description.
// If a stat can't be derived from mass, physique and crystal, it doesn't exist.
//
// Units: distance in tiles (1 tile = 2 m, the scale the art is drawn at: a person is a bit
// under a tile tall; see M_PER_TILE), mass in kg, energy in calories
// ("cal", a game unit — damage, HP and calories are all the same currency).
//
// Core identities:
//   attack energy  E = ½ · m_crystal · v²      (kinetic energy of the crystal)
//   damage         = E · scale                (a blow or a stone hands over its energy; scale sets fight pace)
//   calories spent = E / MUSCLE_EFFICIENCY     (muscles are ~50% efficient)
//   v              = min(limbSpeed, √(2·maxEnergy / m_crystal))
//
// So a crystal too light is capped by how fast limbs move; a crystal too heavy
// is capped by how much energy the muscles can dump in one go. Damage per
// second is bounded by muscle *power*, which is bounded by muscle mass, which
// costs food. You cannot make a 10k-damage unit that costs 1 food.

/** A body's height in metres, from its mass (a 70 kg person is 1.7 m; height scales with ∛mass). */
export const bodyHeight = (mass: number): number => 1.7 * Math.cbrt(mass / 70);

/** Metres per map tile. Physics works in metres (m/s, m/s², J); positions, speeds and ranges in tiles. */
export const M_PER_TILE = 2;

import type { BuildingSpec, FactionSpec, Physique, TechSpec, UnitSpec } from '../factions/types';
import { deriveGait } from './abilities/gait';

/** How high a flier flies unless its spec says (m). */
export const DEFAULT_FLY_HEIGHT = 6;

export const LIMITS = {
  minMass: 15,
  maxMass: 1500,
  minFraction: 0.1,
  minCrystal: 0.1,
  maxAmmo: 40,
} as const;

export const K = {
  // Body
  hpPerFrameKg: 2.5,
  hpPerKg: 0.5,
  calPerReserveKg: 100,
  calPerKg: 30,
  baseSpeed: 1.9, // tiles/s at muscle 0.4, ideal mass
  minSpeed: 0.35,
  maxSpeed: 4.0,
  loadSlowdown: 0.6, // full pack => speed × (1 - 0.6)
  carryPerMuscleKg: 0.5,
  /** Wheels: capacity multiplier, and how much of the usual load penalty / haul cost remains. */
  wheelCarry: 4,
  wheelLoadSlowdown: 0.35,
  wheelHaulCost: 0.3,
  // Attack
  limbSpeedBase: 8, // m/s at 70 kg, muscle 0.4
  energyPerMuscleKg: 3, // max cal per single attack
  powerPerMuscleKg: 2, // sustained cal/s into attacks
  muscleEfficiency: 0.5,
  /**
   * Fight pace: the share of attack energy that becomes damage, for every
   * faction alike. 1/6 puts time-to-kill near Age of Empires II (a duel of
   * equals lasts ~10 s, not ~2 s). Attacks still cost their full energy.
   */
  damageScale: 1 / 6,
  gravity: 9.8,
  maxThrowRange: 14,
  minCooldown: 0.5,
  throwReload: 0.4,
  // Metabolism
  /** A 70 kg body's cost of moving a kg a tile; per kg it falls with size as m^-0.3 (cost of transport, Taylor & Heglund). */
  moveCalPerKgTile: 0.15,
  gatherCalPerKg: 4,
  restRegenFraction: 0.004, // of tank per second when idle
  eatRateFraction: 0.06, // of tank per second while eating
  calPerFood: 300, // 1 kg of food
  hungryFraction: 0.2,
  exhaustedRecoverFraction: 0.1,
  exhaustedSpeedMul: 0.35,
  // Economy
  gatherKgPerSec: 1.0, // at 18 kg muscle
  foodPerKg: 1.0,
  foodPerMuscleKg: 1.5,
  foodPerFrameKg: 1.5, // a kilo of frame (health and plate) costs what a kilo of muscle does
  trainBaseSec: 6,
  trainSecPerKg: 1 / 12,
  /** Share of a body that's skeleton: frame that holds it up, not plate. Only frame beyond it armours. */
  skeletonShare: 0.15,
  /** Plate: a blow landing on it loses this much damage per unit of plate thickness (plate kg over body surface, ∝ mass^⅔)... */
  platePerThickness: 4,
  /** ...and it covers this × the body's plate share of it (the rest is gaps a blow can find), up to plateMaxCover. */
  coverPerFrame: 1.6,
  plateMaxCover: 0.9,
  /** However thick the plate, a blow on it always does at least this share of its damage (bruising through it). */
  armourFloor: 0.15,
  /** Grip of feet on the ground (× g): caps how fast any body speeds up and swings its line. */
  traction: 0.6,
  /** Feet planted (× g): how hard a body pulls up, and how fast a shove or a slide dies. Legs, not ice. */
  footBrake: 1.5,
  /** Sprint speed as a multiple of cruising speed (a gallop over a trot, a run over a jog). */
  sprintPerCruise: 2.2,
  /** Leg length as a share of body height. */
  legPerHeight: 0.53,
  /** A body closing on a weapon that outreaches its own comes on at this share of its walking pace (not running onto the point). */
  closeInPace: 0.5,
  /** A body steps backwards (still facing its enemy) at this share of its walking pace. */
  backstep: 0.3,
  /** Calories per tile while sprinting, × walking's. */
  sprintCostMul: 4,
  /** Units sprint to close on an attack target this near (tiles)... */
  sprintRange: 5,
  /** ...if they have more than this share of their calories left. */
  sprintMinCalories: 0.35,
  /** rad/s a body can swing round at, free of any weapon (a full turn in about a second). */
  turnRate: 6,
  /** A planted shaft turns this much slower: it has to be lifted, swung and set again. */
  plantedTurnMul: 0.2,
  /** Newtons a body can hold behind its weapon per kg of muscle (arms, wrists, stance) before the shaft slips or it buckles. */
  holdForcePerMuscleKg: 40,
  /** Metres a blow drives in: a blow does at most (holding force × this) joules of work, unless the weapon is braced. */
  blowDepth: 0.15,
  /** A thrower considers ramming an enemy this close (tiles): see ramPays (sim/world.ts). */
  ramRange: 3,
  /** A change of velocity (m/s) bigger than this in one hit or collision knocks a 70 kg upright body off balance for a moment (staggered); see DerivedStats.balance. */
  staggerDv: 1.5,
  /** Bodies colliding: a jolt (change of velocity, m/s) under this is just jostling; it's how hard a body is jolted that injures it, like a fall... */
  injuryDv: 3,
  /** ...above it, this share of ½·m·(jolt − injuryDv)² hurts the body. */
  bodyImpactEfficiency: 0.15,
  /** Share of a body's mass in the limb (or head) that swings with a blow. */
  limbShare: 0.06,
  /** kg of wood per metre of spear shaft. */
  shaftKgPerM: 1.5,
  /** Wood: density (kg/m³) and stiffness (Young's modulus, Pa), for how hard a shaft can be pushed before it buckles. */
  woodDensity: 700,
  woodStiffness: 11e9,
} as const;

export interface DerivedStats {
  mass: number;
  physique: Physique;
  muscleMass: number;
  frameMass: number;
  reserveMass: number;

  /** Flat damage each hit loses against this body: its frame share (plate thickness). Light hits glance off heavily framed bodies. */
  armour: number;
  /** Share of blows that land on plate (the rest find a gap and do full damage). */
  coverage: number;
  maxHp: number;
  maxCalories: number;
  /** Unloaded top speed, tiles/s. */
  speed: number;
  /** Top sprint speed, tiles/s: K.sprintPerCruise × its cruising speed, burning calories fast (sim/world.ts moveTo). */
  sprint: number;
  /** Can this unit attack at all? */
  canAttack: boolean;
  wheeled: boolean;
  /** Bounding gait, if any (see UnitSpec.gait). */
  gait?: { hop: number; period: number };
  /** Can fly (see UnitSpec.flight, sim/abilities/flight.ts). */
  flight: boolean;
  /** Metres it flies at (0: doesn't fly). Higher drops hit harder; staying up there costs more. */
  flyHeight: number;
  /** kg. Shared by weapon crystal, ammo, and cargo. */
  carryCapacity: number;
  /** kg of crystal the unit keeps as its loadout (weapon or ammo). */
  loadoutCrystal: number;
  /** kg the cargo pack holds: carry capacity less the weapon pack (loadout). */
  cargoCapacity: number;
  radius: number;
  sight: number;

  limbSpeed: number;
  maxAttackEnergy: number;
  crystalVelocity: number;
  attackEnergy: number;
  damage: number;
  attackCalories: number;
  cooldown: number;
  /** Strike reach or throw range, tiles. */
  range: number;
  dps: number;
  /** rad/s it can swing round at: the body's own rate, or slower if the arms can't swing its weapon's inertia round that fast. */
  turnRate: number;
  /** Newtons it can hold behind its weapon (from its muscle): caps how much of a collision a blow passes on, unless braced. */
  holdForce: number;
  /** Newtons a set shaft (planted or couched) takes before it buckles: π²·E·I / L² over the length ahead of the hands. 0 without one. */
  shaftForce: number;
  /** Strikers with a shaft: tiles inside which the point can't be brought to bear (it chokes up only so far). 0 otherwise. */
  minReach: number;
  /** Can it plant its shaft against a charge (and hold ground with it)? */
  canPlant: boolean;
  /** Metres nose to tail: given for a long body, else an upright body's depth from its mass. Every body's line turns no faster than speed ÷ this. */
  length: number;
  /** The jolt (m/s) it takes without stumbling: a body stays balanced while its centre stays over its stance (the capture point), so it scales with stance length × √(g / hip height); K.staggerDv for a 70 kg upright body. */
  balance: number;

  gatherRate: number;
  moveCalPerTile: number;
  restRegen: number;
  eatRate: number;

  foodCost: number;
  crystalCost: number;
  trainTime: number;
  /** Total refinement (design + technologies). */
  refinement: number;
  /** Total work refinement: gather rate, speed and carry multiplier. */
  workRefinement: number;
  /**
   * Unarmed workers can still fight with a crystal they're carrying: the same
   * physics as a strike with IMPROVISED_KG. Absent for units with a weapon (or that can't gather).
   */
  improvised?: { damage: number; cooldown: number; range: number; attackCalories: number; crystalMass: number };
  /** A shaft-wielder's hand weapon (attack.sidearm): a plain strike, for where its point can't bear. */
  sidearm?: { damage: number; cooldown: number; range: number; attackCalories: number; crystalMass: number };
}

/** kg of crystal a worker grabs to fight with. */
export const IMPROVISED_KG = 1;

/** Scale to sum 1, then lift any part below the minimum, taking the difference from the others. */
export function normalizePhysique(p: Physique): Physique {
  const min = LIMITS.minFraction;
  let v = [p.muscle, p.frame, p.reserve].map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = v[0] + v[1] + v[2];
  v = sum > 0 ? v.map((x) => x / sum) : [1 / 3, 1 / 3, 1 / 3];
  for (let pass = 0; pass < 3; pass++) {
    const low = v.map((x) => x < min);
    if (!low.some(Boolean)) break;
    const fixed = low.filter(Boolean).length * min;
    const freeSum = v.reduce((a, x, i) => a + (low[i] ? 0 : x), 0);
    v = v.map((x, i) => (low[i] ? min : (x / freeSum) * (1 - fixed)));
  }
  return { muscle: v[0], frame: v[1], reserve: v[2] };
}

export function clampMass(m: number): number {
  return Math.min(LIMITS.maxMass, Math.max(LIMITS.minMass, m));
}

/** Speed is mildly hump-shaped in mass: tiny and huge creatures are both slower. */
/** Gait speed scales with leg length (a constant Froude number: v ∝ √(g·L)), and leg length with ∛mass: so v ∝ mass^⅙. Big bodies stride faster. */
function massSpeedFactor(m: number): number {
  return 0.966 * Math.pow(m / 70, 1 / 6); // 0.966: a 70 kg body's speed is as it was
}

/** `techRefinement`: refinement added by the owner's researched technologies. */
export function derive(spec: UnitSpec, techRefinement = 0, techWork = 0): DerivedStats {
  const mass = clampMass(spec.mass);
  const physique = normalizePhysique(spec.physique);
  const muscleMass = mass * physique.muscle;
  const frameMass = mass * physique.frame;
  const reserveMass = mass * physique.reserve;
  const muscleRel = physique.muscle / 0.4;

  // Refinement makes resources more efficient: the body is pure physics, and it
  // costs 1/r of the food (see foodCost below). It never adds HP or damage.
  const refinement = Math.max(1, (spec.refinement ?? 1) + techRefinement);
  const maxHp = K.hpPerFrameKg * frameMass + K.hpPerKg * mass;
  // plate: frame spread over the body's surface (a shell, bone, mail): the thicker, the more of a blow it soaks
  // up; how much of the body it covers goes with the share that's frame
  // (the skeleton's share of the frame holds the body up; only what's beyond it is plate)
  const plateShare = Math.max(0, physique.frame - K.skeletonShare);
  const armour = K.platePerThickness * ((plateShare * mass) / Math.pow(mass, 2 / 3));
  const coverage = Math.min(K.plateMaxCover, K.coverPerFrame * plateShare);
  const maxCalories = K.calPerReserveKg * reserveMass + K.calPerKg * mass;
  // work refinement w: gathers, walks and carries w× as much (applied below)
  const workRefinement = Math.max(1, (spec.workRefinement ?? 1) + techWork);
  const speed = clamp(K.baseSpeed * Math.pow(muscleRel, 0.8) * massSpeedFactor(mass), K.minSpeed, K.maxSpeed) * workRefinement;
  const wheeled = !!spec.wheeled;
  const carryCapacity = Math.max(1, K.carryPerMuscleKg * muscleMass * (wheeled ? K.wheelCarry : 1) * workRefinement);

  const atk = spec.attack;
  const canAttack = !!atk;
  const throwing = atk?.style === 'throw';
  const crystalMass = Math.min(carryCapacity, Math.max(LIMITS.minCrystal, atk?.crystalMass ?? LIMITS.minCrystal));
  const maxAmmo = Math.max(1, Math.floor(carryCapacity / crystalMass));
  const ammo = throwing ? Math.min(maxAmmo, LIMITS.maxAmmo, Math.max(1, Math.floor(atk?.ammo ?? 1))) : 1;
  const side = !throwing && atk?.shaft && atk.sidearm ? Math.max(LIMITS.minCrystal, Math.min(10, atk.sidearm.crystalMass)) : 0; // a hand weapon worn beside a shaft
  const loadoutCrystal = canAttack ? crystalMass * ammo + side : 0;

  const limbSpeed = K.limbSpeedBase * Math.pow(mass / 70, 0.1) * Math.sqrt(muscleRel);
  const maxAttackEnergy = K.energyPerMuscleKg * muscleMass;
  // a striker swings its whole weapon: the crystal and any wooden shaft it's mounted on
  const shaft = !throwing && atk?.shaft ? Math.max(0, Math.min(3, atk.shaft)) : 0;
  const weaponMass = crystalMass + shaft * K.shaftKgPerM;
  // a thrown crystal flies alone; a blow swings the striking limb with the weapon (the arm behind a mace, a great
  // beast's head and forequarters behind its bite), as fast as limbs move and as hard as the muscle can put into it
  const strikeMass = throwing ? weaponMass : weaponMass + K.limbShare * mass;
  // a sling is a lever: its cord lengthens the throwing arm (~0.4 of the body's height), so the stone leaves faster in
  // proportion; but never faster than the muscle's energy allows (√(2E/m)), however long the cord
  const sling = throwing && atk?.sling ? Math.max(0, Math.min(bodyHeight(mass), atk.sling)) : 0;
  const arm = 0.4 * bodyHeight(mass);
  const crystalVelocity = Math.min(limbSpeed * (1 + sling / arm), Math.sqrt((2 * maxAttackEnergy) / strikeMass));
  const attackEnergy = 0.5 * strikeMass * crystalVelocity * crystalVelocity;
  // and it has to be spun up first: about a turn of the arm and cord before release
  const windUp = sling ? (2 * Math.PI * (arm + sling)) / crystalVelocity : 0;
  const damage = canAttack ? attackEnergy * K.damageScale : 0;
  const attackCalories = attackEnergy / K.muscleEfficiency;
  const power = K.powerPerMuscleKg * muscleMass;
  // the weapon's moment of inertia about the hands (¾ of a shaft and the crystal out front), swung round by the arms'
  // torque (holding force on a half-metre lever): a quarter turn takes √(2·θ·I/τ). After each blow a striker brings
  // its weapon round to bear again, so a long pole recovers slower than a club (a thrown crystal is gone)
  const leverOut = 0.75 * shaft + 0.4, shaftKg = shaft * K.shaftKgPerM;
  const weaponI = (shaftKg * 0.75 * (0.75 * shaft) ** 2) / 3 + (shaftKg * 0.25 * (0.25 * shaft) ** 2) / 3 + crystalMass * leverOut * leverOut;
  const armTorque = K.holdForcePerMuscleKg * muscleMass * 0.5;
  const bringRound = throwing ? 0 : Math.sqrt((2 * (Math.PI / 2) * weaponI) / armTorque);
  const cooldown = Math.max(K.minCooldown, attackEnergy / power) + (throwing ? K.throwReload : 0) + windUp + bringRound;

  const sizeRel = Math.cbrt(mass / 70);
  const radius = clamp(0.25 * sizeRel, 0.15, 0.8);
  const reach = radius + 0.35 + 0.1 * Math.cbrt(crystalMass) + (shaft * 0.75) / M_PER_TILE; // a shaft held a quarter of the way along: ¾ of it reaches forward
  const range = throwing
    ? Math.min(K.maxThrowRange, (crystalVelocity * crystalVelocity) / K.gravity / M_PER_TILE) // v²/g metres, in tiles
    : reach;
  // it sees 10 tiles, past its reach, and at least as far as it rides out to charge (the run-up to its sprint, plus reach)
  // a bound flexes the spine: a stride is the leg plus the body's run-length beyond an upright body's depth, so
  // long bodies gallop faster (v ∝ √(g·stride)); wheels and wings don't stride
  const height = bodyHeight(mass), leg = K.legPerHeight * height, upright = 0.18 * height;
  const length = spec.length ? Math.max(0.2, Math.min(12, spec.length)) : upright; // an upright body: its depth, ~0.18 of its height
  const gallop = spec.wheeled || spec.flight ? 1 : Math.sqrt((leg + Math.max(upright, length)) / (leg + upright));
  const sprintTiles = speed * K.sprintPerCruise * gallop, runUpTiles = ((sprintTiles * M_PER_TILE) ** 2 / (2 * K.traction * K.gravity)) / M_PER_TILE;
  const sight = Math.max(10, range + 3, runUpTiles + range + 1);

  const gatherRate = (spec.canGather ?? true) ? K.gatherKgPerSec * Math.sqrt(muscleMass / 18) * workRefinement : 0;

  // the body's food cost, divided by refinement; crystal is the physical weapon it carries (not discounted)
  const foodCost = Math.round((K.foodPerKg * (mass + shaft * K.shaftKgPerM) + K.foodPerMuscleKg * muscleMass + K.foodPerFrameKg * frameMass) / refinement); // a spear's shaft is priced like body mass
  const crystalCost = Math.ceil(loadoutCrystal);
  const trainTime = K.trainBaseSec + K.trainSecPerKg * mass;

  // the same body striking with a plain crystal of `kg` (a worker's improvised weapon, a sidearm)
  const plainStrike = (kg: number) => {
    const a = derive({ ...spec, attack: { style: 'strike', crystalMass: kg } }, techRefinement, techWork);
    return { damage: a.damage, cooldown: a.cooldown, range: a.range, attackCalories: a.attackCalories, crystalMass: kg };
  };
  const improvised = !canAttack && (spec.canGather ?? true) && !spec.dummy && spec.role !== 'carter' && !spec.bearer ? plainStrike(IMPROVISED_KG) : undefined;

  const sidearm = side ? plainStrike(side) : undefined; // a blade of its crystal

  return {
    improvised, sidearm,
    mass, physique, muscleMass, frameMass, reserveMass,
    maxHp, armour, coverage, maxCalories, speed, sprint: sprintTiles, canAttack, wheeled, gait: deriveGait(spec), flight: !!spec.flight, flyHeight: !spec.flight ? 0 : spec.flight === true ? DEFAULT_FLY_HEIGHT : spec.flight.height, carryCapacity, loadoutCrystal, cargoCapacity: Math.max(0, carryCapacity - loadoutCrystal), radius, sight,
    limbSpeed, maxAttackEnergy, crystalVelocity, attackEnergy, damage, attackCalories, cooldown, range,
    dps: damage / cooldown,
    holdForce: K.holdForcePerMuscleKg * muscleMass,
    // a round pole of its wood's cross-section A (I = A² / 4π), pushed along its length (Euler buckling)
    shaftForce: shaft ? (Math.PI ** 2 * K.woodStiffness * ((K.shaftKgPerM / K.woodDensity) ** 2 / (4 * Math.PI))) / (0.75 * shaft) ** 2 : 0,
    // its weapon swung round (weaponI, armTorque above) caps how fast it turns to face
    turnRate: Math.min(K.turnRate, Math.sqrt(((Math.PI / 2) * armTorque) / (2 * Math.max(1e-6, weaponI)))),
    minReach: shaft ? reach - (shaft * 0.75 * 0.5) / M_PER_TILE : 0, // it can choke up half the shaft's forward length
    // a shaft can be planted (butt on the ground behind, point at the enemy) only if it's well longer than the body is tall:
    // a pike in a man's hands, not a lance on a mount
    canPlant: shaft > 1.5 * 1.7 * Math.cbrt(mass / 70),
    length,
    balance: K.staggerDv * (length / (0.18 * bodyHeight(70))) * Math.sqrt(bodyHeight(70) / height),
    gatherRate,
    moveCalPerTile: K.moveCalPerKgTile * mass * Math.pow(mass / 70, -0.3), // big bodies move a kg more cheaply
    restRegen: K.restRegenFraction * maxCalories,
    eatRate: K.eatRateFraction * maxCalories,
    foodCost, crystalCost, trainTime, refinement, workRefinement,
  };
}

/** Speed after pack weight is accounted for. Load includes the weapon crystal. */
export function loadedSpeed(stats: DerivedStats, loadKg: number): number {
  const frac = Math.min(1, loadKg / stats.carryCapacity) * (stats.wheeled ? K.wheelLoadSlowdown : 1);
  return stats.speed * (1 - K.loadSlowdown * frac);
}

/** Human-readable problems with a spec (things derive() silently clamps). */
export function validate(spec: UnitSpec): string[] {
  const errs: string[] = [];
  if (!spec.id || !/^[a-z0-9_-]+$/.test(spec.id)) errs.push(`id "${spec.id}" must be lowercase slug`);
  if (spec.mass < LIMITS.minMass || spec.mass > LIMITS.maxMass)
    errs.push(`mass ${spec.mass} outside ${LIMITS.minMass}..${LIMITS.maxMass} kg`);
  for (const k of ['muscle', 'frame', 'reserve'] as const) {
    if (!(spec.physique[k] > 0)) errs.push(`physique.${k} must be > 0`);
  }
  const s = derive(spec);
  const atk = spec.attack;
  if (atk && atk.crystalMass > s.carryCapacity)
    errs.push(`crystal ${atk.crystalMass} kg exceeds carry capacity ${s.carryCapacity.toFixed(1)} kg`);
  if (atk && atk.style === 'throw') {
    const want = atk.ammo ?? 1;
    const fit = Math.floor(s.carryCapacity / atk.crystalMass);
    if (want * atk.crystalMass > s.carryCapacity)
      errs.push(`ammo ${want} × ${atk.crystalMass} kg exceeds carry capacity (fits ${fit})`);
  }
  return errs;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ───────────────────────────── capital & buildings ─────────────────────────────
//
// Capital is the building resource sunk into a building. A unit design with
// refinement r can only be trained at a building whose effective capital (own
// + every prerequisite building, transitively, at 100%) is at least
// capitalFor(r). Technologies raise a unit type's refinement for 70% of the
// curve step (burned, not invested) at a building with half that capital.

export const CAP = {
  /** Capital curve scale: capitalFor(r) = K·(r−1)^P. */
  K: 720,
  P: 1.6,
  techRate: 0.7,
  techGate: 0.5,
  techSecPerCost: 0.1,
  techMinSec: 10,
  hpPerMaterial: 6,
  kgPerTile: 150,
  /** Height costs mechanism × height × this, in building resource. */
  heightCost: 0.25,
  /** Sowing: kg of future yield planted per second, per kg of sowing mechanism. */
  sowRatePerKg: 0.2,
  /** Seed cost as a fraction of the yield (plants give back 4×). */
  sowSeedFraction: 1 / 4,
  /** Seconds for a sown plant to grow to full. */
  sowGrowSec: 45,
  /** A building trains units at (its own capital ÷ this) × the base rate: throughput is the wood sunk into it, not the number of buildings. */
  trainRefCapital: 300,
  /** Gather boosts are crystal magic: crystal burned per extra kg the boost adds. */
  boostCrystalPerKg: 0.05,
  /** Crystal a boosting building asks to keep on hand to burn. */
  boostStash: 10,
} as const;

export function capitalFor(refinement: number): number {
  return CAP.K * Math.pow(Math.max(0, refinement - 1), CAP.P);
}

export function refinementFor(capital: number): number {
  return 1 + Math.pow(Math.max(0, capital) / CAP.K, 1 / CAP.P);
}

export function techCost(from: number, add: number): number {
  return Math.ceil(CAP.techRate * (capitalFor(from + add) - capitalFor(from)));
}

export function techGate(from: number, add: number): number {
  return CAP.techGate * capitalFor(from + add);
}

export function techTime(cost: number): number {
  return Math.max(CAP.techMinSec, cost * CAP.techSecPerCost);
}

export interface TowerStats {
  energy: number;
  velocity: number;
  damage: number;
  range: number;
  cooldown: number;
  /** Lobbing from height, it can't hit right below itself: tiles from its edge. */
  minRange: number;
}

export interface BuildingStats {
  maxHp: number;
  capital: number;
  effectiveCapital: number;
  /** Highest unit refinement this building can train. */
  maxRefinement: number;
  /** Building resource for equipment — weapon, its height, sowing mechanism (not capital). */
  attackCost: number;
  /** kg of yield planted per second (0 if it doesn't sow). */
  sowRate: number;
  /** Everything villagers must carry to the site. */
  totalCost: number;
  minSize: number;
  tower: TowerStats | null;
  /** Gather-rate multiplier this building gives nearby (1 if it has no gatherBoost). */
  gatherBoost: number;
  /** How fast it trains units (× the base rate): its own capital ÷ CAP.trainRefCapital. */
  trainRate: number;
}

/** Every building this one depends on, transitively, each counted once. */
export function prerequisites(spec: BuildingSpec, faction: FactionSpec): BuildingSpec[] {
  const out = new Map<string, BuildingSpec>();
  const visit = (s: BuildingSpec) => {
    for (const id of s.requires ?? []) {
      const r = faction.buildings?.find((b) => b.id === id);
      if (r && !out.has(r.id)) { out.set(r.id, r); visit(r); }
    }
  };
  visit(spec);
  return [...out.values()];
}

export function towerStats(t: BuildingSpec['attack']): TowerStats | null {
  if (!t) return null;
  const m = Math.max(10, t.mechanism);
  const limb = K.limbSpeedBase * Math.pow(m / 70, 0.1) * Math.sqrt(1 / 0.4);
  const maxE = K.energyPerMuscleKg * m;
  const mc = Math.max(LIMITS.minCrystal, t.crystalMass);
  const v = Math.min(limb, Math.sqrt((2 * maxE) / mc));
  const energy = 0.5 * mc * v * v;
  const h = Math.max(0, t.height);
  const damage = (energy + mc * K.gravity * h) * K.damageScale;
  const vy = v * Math.SQRT1_2;
  const range = Math.min(K.maxThrowRange + h / M_PER_TILE, (vy * ((vy + Math.sqrt(vy * vy + 2 * K.gravity * h)) / K.gravity)) / M_PER_TILE);
  const cooldown = Math.max(K.minCooldown, energy / (K.powerPerMuscleKg * m)) + K.throwReload;
  return { energy, velocity: v, damage, range, cooldown, minRange: (h * 0.5) / M_PER_TILE + 1 };
}

export function deriveBuilding(spec: BuildingSpec, faction: FactionSpec): BuildingStats {
  const capital = Math.max(0, spec.materials);
  const effectiveCapital = capital + prerequisites(spec, faction).reduce((a, b) => a + Math.max(0, b.materials), 0);
  const attackCost = (spec.attack ? spec.attack.mechanism + spec.attack.mechanism * spec.attack.height * CAP.heightCost : 0) + (spec.sow?.mechanism ?? 0);
  return {
    maxHp: CAP.hpPerMaterial * capital,
    capital,
    effectiveCapital,
    maxRefinement: refinementFor(effectiveCapital),
    attackCost,
    // a living building is planted small (seed share of its materials) and grows the rest from food
    totalCost: Math.ceil(capital * (spec.living ? Math.min(1, Math.max(0.05, spec.living.seed)) : 1) + attackCost),
    minSize: Math.ceil(Math.sqrt(capital / CAP.kgPerTile)),
    tower: towerStats(spec.attack),
    gatherBoost: spec.gatherBoost ? refinementFor(capital) : 1,
    sowRate: spec.sow ? spec.sow.mechanism * CAP.sowRatePerKg : 0,
    trainRate: Math.max(0.05, capital / CAP.trainRefCapital),
  };
}

/** Refinement each tech raises its unit from, assuming the faction's techs are researched in list order. */
export function techStart(tech: TechSpec, faction: FactionSpec): number {
  const unit = faction.units.find((u) => u.id === tech.unit);
  const work = tech.channel === 'work';
  let r = (work ? unit?.workRefinement : unit?.refinement) ?? 1;
  for (const t of faction.techs ?? []) {
    if (t === tech) break;
    if (t.unit === tech.unit && (t.channel === 'work') === work) r += t.refinement;
  }
  return r;
}

/** Authoring-time checks: every refinement and tech must be paid for by the capital behind it. */
export function validateFaction(f: FactionSpec): string[] {
  const errs: string[] = [];
  for (const u of f.units) errs.push(...validate(u).map((e) => `${u.id}: ${e}`));
  for (const b of f.buildings ?? []) {
    const st = deriveBuilding(b, f);
    if (b.size < st.minSize) errs.push(`${b.id}: ${b.materials} kg needs a footprint of at least ${st.minSize}×${st.minSize}`);
    for (const r of b.requires ?? []) if (!f.buildings?.some((x) => x.id === r)) errs.push(`${b.id}: requires unknown building ${r}`);
    for (const id of b.trains ?? []) {
      const u = f.units.find((x) => x.id === id);
      if (!u) { errs.push(`${b.id}: trains unknown unit ${id}`); continue; }
      // the higher of the two refinements sets the bar (mixed worker-soldiers aren't taxed twice)
      const need = Math.max(capitalFor(u.refinement ?? 1), capitalFor(u.workRefinement ?? 1));
      if (need > st.effectiveCapital + 1e-6) errs.push(`${b.id}: ${u.id} (refinement ${u.refinement ?? 1}, work ${u.workRefinement ?? 1}) needs ${Math.ceil(need)} capital, building has ${st.effectiveCapital}`);
    }
    for (const id of b.researches ?? []) {
      const t = f.techs?.find((x) => x.id === id);
      if (!t) { errs.push(`${b.id}: researches unknown tech ${id}`); continue; }
      const gate = techGate(techStart(t, f), t.refinement);
      if (gate > st.effectiveCapital + 1e-6) errs.push(`${b.id}: ${t.id} needs a ${Math.ceil(gate)}-capital building, this has ${st.effectiveCapital}`);
    }
  }
  return errs;
}
