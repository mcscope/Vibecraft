// Fairness rules for factions that play against other people. Every stat and
// cost is derived from the spec by each player's own physics, so a bundle can't
// claim a unit is cheaper than it is. Everyone starts from the same pool of
// resources: the starting base and workers are paid from it and the rest is
// starting stock. Anything a player pays for (haulers, tower height, gather
// boosts that burn crystal, sowing that spends seed) is limited by its price,
// not a cap; only what a game hands out free (the wildlife on your half) is
// bounded. Online bundles are held to these on arrival; `npm test` holds the
// shipped factions to them too.
import type { FactionSpec, ResourceKind } from '../factions/types';
import { capitalFor, derive, deriveBuilding } from './physics';

/** What every player starts with, before paying for the starting base and workers. */
export const START_POOL: Record<ResourceKind, number> = { food: 900, wood: 1060, crystal: 120 };

/** What a faction's starting base and workers cost, out of the pool. */
export function startCost(f: FactionSpec): Record<ResourceKind, number> {
  const base = f.buildings?.find((b) => b.id === f.townCenterId);
  const worker = f.units.find((u) => u.id === f.workerId);
  const n = startWorkers(f);
  const d = worker ? derive(worker) : null;
  return { food: (d?.foodCost ?? 0) * n, wood: base ? deriveBuilding(base, f).totalCost : 0, crystal: (d?.crystalCost ?? 0) * n };
}
export const startWorkers = (f: FactionSpec): number => f.startWorkers ?? 5;

/** The starting stock: the pool less the starting base and workers. */
export function startStock(f: FactionSpec): Record<ResourceKind, number> {
  const c = startCost(f);
  return { food: Math.max(0, START_POOL.food - c.food), wood: Math.max(0, START_POOL.wood - c.wood), crystal: Math.max(0, START_POOL.crystal - c.crystal) };
}

export const FAIR = {
  /** Wildlife on your half is free food (and danger): heaviest animal, and all of them together (kg). */
  wildMaxKg: 400,
  wildTotalKg: 1500,
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
  // the start: base and workers are paid from the shared pool
  const base = f.townCenterId !== undefined ? buildings.get(f.townCenterId) : undefined;
  // (no townCenterId: it starts in the field, its starting units with the pool on the ground beside them: sim/scenarios.ts)
  if (f.townCenterId !== undefined && !base) e.push(`townCenterId "${f.townCenterId}" is not one of its buildings`);
  else if (base?.living) e.push(`${base.id}: the starting base can't be a living building`);
  const n = startWorkers(f);
  if (!(Number.isInteger(n) && n >= 1)) e.push(`startWorkers must be a whole number, at least 1`);
  const cost = startCost(f);
  for (const r of ['food', 'wood', 'crystal'] as const) {
    if (cost[r] > START_POOL[r]) e.push(`the starting base and ${n} workers cost ${Math.ceil(cost[r])} ${r}, more than the starting pool's ${START_POOL[r]}`);
  }
  const worker = units.get(f.workerId);
  if (worker && base) {
    // workers are priced at their refinement, so the base has to be able to train them at it
    const need = Math.max(capitalFor(worker.refinement ?? 1), capitalFor(worker.workRefinement ?? 1));
    if (need > deriveBuilding(base, f).effectiveCapital + 1e-6) e.push(`${worker.id}: its refinement needs ${Math.ceil(need)} capital, more than the starting base has`);
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
    // a gather boost burns crystal for every extra kg, so its reach is paid for as it's used
    if (b.gatherBoost && !(b.gatherBoost.radius > 0)) e.push(`${b.id}: gatherBoost radius must be positive`);
    if (b.sow) {
      // sowing spends seed (a quarter of each plant's yield) at a pace set by its priced mechanism
      const s = b.sow;
      if (!(s.mechanism >= 0) || !(s.radius > 0)) e.push(`${b.id}: bad sow mechanism/radius`);
      for (const kg of Object.values(s.plantKg ?? {})) if (!(kg! > 0)) e.push(`${b.id}: sown plants must grow to more than 0 kg`);
      for (const n of Object.values(s.maxPlants ?? {})) if (!(Number.isInteger(n) && n! >= 0)) e.push(`${b.id}: maxPlants must be a whole number`);
    }
    if (b.carters !== undefined && !(Number.isInteger(b.carters) && b.carters >= 0)) e.push(`${b.id}: carters must be a whole number`); // each one is paid for
  }
  return e;
}
