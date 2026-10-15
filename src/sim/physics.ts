// THE RULES OF THE WORLD.
//
// Every unit stat is derived here from a UnitSpec's physical description.
// If a stat can't be derived from mass, physique and crystal, it doesn't exist.
//
// Units: distance in tiles (1 tile = 1 m), mass in kg, energy in calories
// ("cal", a game unit — damage, HP and calories are all the same currency).
//
// Core identities:
//   attack energy  E = ½ · m_crystal · v²      (kinetic energy of the crystal)
//   damage         = E · efficiency · scale    (strike 1.0, throw 0.75; scale sets fight pace)
//   calories spent = E / MUSCLE_EFFICIENCY     (muscles are ~50% efficient)
//   v              = min(limbSpeed, √(2·maxEnergy / m_crystal))
//
// So a crystal too light is capped by how fast limbs move; a crystal too heavy
// is capped by how much energy the muscles can dump in one go. Damage per
// second is bounded by muscle *power*, which is bounded by muscle mass, which
// costs food. You cannot make a 10k-damage unit that costs 1 food.

import type { BuildingSpec, FactionSpec, Physique, TechSpec, UnitSpec } from '../factions/types';
import { deriveGait } from './abilities/gait';

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
  speedPeakMass: 200,
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
  strikeEfficiency: 1.0,
  throwEfficiency: 0.75,
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
  foodPerFrameKg: 0.5,
  trainBaseSec: 6,
  trainSecPerKg: 1 / 12,
} as const;

export interface DerivedStats {
  mass: number;
  physique: Physique;
  muscleMass: number;
  frameMass: number;
  reserveMass: number;

  maxHp: number;
  maxCalories: number;
  /** Unloaded top speed, tiles/s. */
  speed: number;
  /** Can this unit attack at all? */
  canAttack: boolean;
  wheeled: boolean;
  /** Bounding gait, if any (see UnitSpec.gait). */
  gait?: { hop: number; period: number };
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
function massSpeedFactor(m: number): number {
  const q = Math.pow(m / K.speedPeakMass, 0.25);
  return 2 / (q + 1 / q);
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
  const loadoutCrystal = canAttack ? crystalMass * ammo : 0;

  const limbSpeed = K.limbSpeedBase * Math.pow(mass / 70, 0.1) * Math.sqrt(muscleRel);
  const maxAttackEnergy = K.energyPerMuscleKg * muscleMass;
  const crystalVelocity = Math.min(limbSpeed, Math.sqrt((2 * maxAttackEnergy) / crystalMass));
  const attackEnergy = 0.5 * crystalMass * crystalVelocity * crystalVelocity;
  const damage = canAttack ? attackEnergy * (throwing ? K.throwEfficiency : K.strikeEfficiency) * K.damageScale : 0;
  const attackCalories = attackEnergy / K.muscleEfficiency;
  const power = K.powerPerMuscleKg * muscleMass;
  const cooldown = Math.max(K.minCooldown, attackEnergy / power) + (throwing ? K.throwReload : 0);

  const sizeRel = Math.cbrt(mass / 70);
  const radius = clamp(0.25 * sizeRel, 0.15, 0.8);
  const reach = radius + 0.35 + 0.1 * Math.cbrt(crystalMass);
  const range = throwing
    ? Math.min(K.maxThrowRange, (crystalVelocity * crystalVelocity) / K.gravity)
    : reach;
  const sight = Math.max(7, range + 3);

  const gatherRate = (spec.canGather ?? true) ? K.gatherKgPerSec * Math.sqrt(muscleMass / 18) * workRefinement : 0;

  // the body's food cost, divided by refinement; crystal is the physical weapon it carries (not discounted)
  const foodCost = Math.round((K.foodPerKg * mass + K.foodPerMuscleKg * muscleMass + K.foodPerFrameKg * frameMass) / refinement);
  const crystalCost = Math.ceil(loadoutCrystal);
  const trainTime = K.trainBaseSec + K.trainSecPerKg * mass;

  const improvised = !canAttack && (spec.canGather ?? true) && !spec.dummy && spec.role !== 'carter' && !spec.bearer
    ? (() => { const a = derive({ ...spec, attack: { style: 'strike', crystalMass: IMPROVISED_KG } }, techRefinement, techWork); return { damage: a.damage, cooldown: a.cooldown, range: a.range, attackCalories: a.attackCalories, crystalMass: IMPROVISED_KG }; })()
    : undefined;

  return {
    improvised,
    mass, physique, muscleMass, frameMass, reserveMass,
    maxHp, maxCalories, speed, canAttack, wheeled, gait: deriveGait(spec), carryCapacity, loadoutCrystal, cargoCapacity: Math.max(0, carryCapacity - loadoutCrystal), radius, sight,
    limbSpeed, maxAttackEnergy, crystalVelocity, attackEnergy, damage, attackCalories, cooldown, range,
    dps: damage / cooldown,
    gatherRate,
    moveCalPerTile: K.moveCalPerKgTile * mass,
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
  sowRatePerKg: 0.08,
  /** Seed cost as a fraction of the yield (plants give back ~3×, slowly). */
  sowSeedFraction: 1 / 3,
  /** Seconds for a sown plant to grow to full. */
  sowGrowSec: 90,
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
  const damage = (energy + mc * K.gravity * h) * K.throwEfficiency * K.damageScale;
  const vy = v * Math.SQRT1_2;
  const range = Math.min(K.maxThrowRange + h, vy * ((vy + Math.sqrt(vy * vy + 2 * K.gravity * h)) / K.gravity));
  const cooldown = Math.max(K.minCooldown, energy / (K.powerPerMuscleKg * m)) + K.throwReload;
  return { energy, velocity: v, damage, range, cooldown, minRange: h * 0.5 + 1 };
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
