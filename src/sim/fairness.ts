// Fairness rules for factions that play against other people. Every stat and
// cost is derived from the spec by each player's own physics, so a bundle can't
// claim a unit is cheaper than it is. What's left is what a game hands out for
// free (the starting base, its first workers, the wildlife on your half), and
// the few numbers the physics doesn't price yet. Only those are bounded here:
// anything a player pays for (haulers, tower height, ammo...) is limited by its price. Online bundles are
// held to these on arrival; `npm test` holds the shipped factions to them too.
import type { FactionSpec } from '../factions/types';
import { capitalFor, derive, deriveBuilding } from './physics';

export const FAIR = {
  /** The starting base is free: its materials plus any tower on it (kg). */
  startBaseKg: 900,
  /** Each of the five free starting workers: food + crystal its body would cost to train (before refinement). */
  startWorkerCost: 150,
  /** Wildlife on your half is free food (and danger): heaviest animal, and all of them together (kg). */
  wildMaxKg: 400,
  wildTotalKg: 1500,
  /** Radii of area effects (tiles): not priced yet. */
  maxRadius: 8,
  /** Sown plants: size (kg) and how many of each kind a building keeps going: not priced yet. */
  sowMaxKg: 400,
  sowMaxPlants: 12,
} as const;

/** Everything unfair about a faction ([] = fine to bring to a game). */
export function checkFairness(f: FactionSpec): string[] {
  const e: string[] = [];
  const units = new Map(f.units.map((u) => [u.id, u]));
  const buildings = new Map((f.buildings ?? []).map((b) => [b.id, b]));
  // ids are unique and references point at real things
  const ids = [...f.units.map((u) => u.id), ...(f.buildings ?? []).map((b) => b.id), ...(f.techs ?? []).map((t) => t.id), ...(f.wildlife ?? []).map((w) => w.id)];
  for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) e.push(`id "${id}" is used twice`);
  if (!units.has(f.workerId)) e.push(`workerId "${f.workerId}" is not one of its units`);
  if (f.carterId !== undefined && !units.has(f.carterId)) e.push(`carterId "${f.carterId}" is not one of its units`);
  for (const t of f.techs ?? []) if (!units.has(t.unit)) e.push(`${t.id}: improves unknown unit ${t.unit}`);
  // the free start
  const base = f.townCenterId !== undefined ? buildings.get(f.townCenterId) : undefined;
  if (!base) e.push(`townCenterId "${f.townCenterId}" is not one of its buildings`);
  else {
    const kg = deriveBuilding(base, f).totalCost;
    if (kg > FAIR.startBaseKg) e.push(`${base.id}: a starting base is free, so it can hold at most ${FAIR.startBaseKg} kg (this is ${kg})`);
    if (base.living) e.push(`${base.id}: the starting base can't be a living building`);
  }
  const worker = units.get(f.workerId);
  if (worker) {
    const d = derive({ ...worker, refinement: 1, workRefinement: 1 }); // refinement makes training cheaper, not the body
    const cost = d.foodCost + d.crystalCost;
    if (cost > FAIR.startWorkerCost) e.push(`${worker.id}: the starting workers are free, so each body can cost at most ${FAIR.startWorkerCost} to train (this costs ${Math.round(cost)})`);
    const need = Math.max(capitalFor(worker.refinement ?? 1), capitalFor(worker.workRefinement ?? 1));
    if (base && need > deriveBuilding(base, f).effectiveCapital + 1e-6) e.push(`${worker.id}: its refinement needs ${Math.ceil(need)} capital, more than the starting base has`);
  }
  // nothing a match can't hurt
  for (const u of [...f.units, ...(f.wildlife ?? [])]) if (u.dummy) e.push(`${u.id}: training dummies are for scenarios only`);
  // wildlife
  let wildKg = 0;
  for (const w of f.wildlife ?? []) {
    if (w.mass > FAIR.wildMaxKg) e.push(`${w.id}: wild animals can weigh at most ${FAIR.wildMaxKg} kg`);
    wildKg += w.mass * w.group * w.count;
  }
  if (wildKg > FAIR.wildTotalKg) e.push(`wildlife: at most ${FAIR.wildTotalKg} kg of animals in all (this has ${Math.round(wildKg)})`);
  // numbers the physics doesn't price
  for (const u of f.units) {
    const a = u.attack;
    if (a && !(a.crystalMass >= 0.1)) e.push(`${u.id}: crystal must weigh at least 0.1 kg`);
    for (const k of ['refinement', 'workRefinement'] as const) if (u[k] !== undefined && !(u[k]! >= 1)) e.push(`${u.id}: ${k} must be at least 1`);
  }
  for (const b of f.buildings ?? []) {
    const a = b.attack;
    if (a) {
      if (!(a.mechanism > 0) || !(a.crystalMass >= 0.1)) e.push(`${b.id}: a tower needs mechanism > 0 and crystals of at least 0.1 kg`);
      if (!(a.height >= 0)) e.push(`${b.id}: tower height can't be negative`); // height is priced: mechanism × height
      if (a.stockShots !== undefined && !(a.stockShots >= 1)) e.push(`${b.id}: stockShots must be at least 1`);
    }
    if (b.gatherBoost && !(b.gatherBoost.radius > 0 && b.gatherBoost.radius <= FAIR.maxRadius)) e.push(`${b.id}: gatherBoost radius must be 1–${FAIR.maxRadius}`);
    if (b.sow) {
      const s = b.sow;
      if (!(s.mechanism >= 0) || !(s.radius > 0 && s.radius <= FAIR.maxRadius)) e.push(`${b.id}: bad sow mechanism/radius`);
      for (const kg of Object.values(s.plantKg ?? {})) if (!(kg! > 0 && kg! <= FAIR.sowMaxKg)) e.push(`${b.id}: sown plants can grow to at most ${FAIR.sowMaxKg} kg`);
      for (const n of Object.values(s.maxPlants ?? {})) if (!(Number.isInteger(n) && n! >= 0 && n! <= FAIR.sowMaxPlants)) e.push(`${b.id}: at most ${FAIR.sowMaxPlants} sown plants of a kind`);
    }
    if (b.carters !== undefined && !(Number.isInteger(b.carters) && b.carters >= 0)) e.push(`${b.id}: carters must be a whole number`); // each one is paid for
  }
  return e;
}
