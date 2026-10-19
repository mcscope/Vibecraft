// Data-defined abilities: spec fields any faction can switch on. Each ability's
// engine code lives in its own module here (sim behaviour, online-bundle check,
// Codex text); the sim, UI and renderer call into them. This file is the registry
// of the parts every ability shares: validation and Codex lines.
import type { BuildingSpec, UnitSpec } from '../../factions/types';
import type { BuildingStats, DerivedStats } from '../physics';
import { bearer } from './bearer';
import { gait } from './gait';
import { dropOff } from './dropoff';
import { flight } from './flight';
import { herding } from './herding';
import { underfoot } from './underfoot';
import { living } from './living';
import { wall } from './wall';
import { spear } from './spear';
import { sling } from './sling';
import { sidearm } from './sidearm';
import { metamorph } from './metamorph';

export interface Ability {
  id: string;
  /** Problems with a unit spec's use of this ability (online bundles are checked on arrival). */
  validateUnit?(u: UnitSpec, where: string): string[];
  validateBuilding?(b: BuildingSpec, where: string): string[];
  /** A Codex line describing it, or null if the spec doesn't use it. */
  unitCodex?(u: UnitSpec, d: DerivedStats): string | null;
  buildingCodex?(b: BuildingSpec, st: BuildingStats): string | null;
}

export const ABILITIES: Ability[] = [bearer, gait, wall, living, dropOff, underfoot, flight, herding, spear, sling, sidearm, metamorph];

export function validateUnitAbilities(u: UnitSpec, where: string): string[] {
  return ABILITIES.flatMap((a) => a.validateUnit?.(u, where) ?? []);
}
export function validateBuildingAbilities(b: BuildingSpec, where: string): string[] {
  return ABILITIES.flatMap((a) => a.validateBuilding?.(b, where) ?? []);
}
export function unitAbilityLines(u: UnitSpec, d: DerivedStats): string[] {
  return ABILITIES.map((a) => a.unitCodex?.(u, d) ?? null).filter((x): x is string => !!x);
}
export function buildingAbilityLines(b: BuildingSpec, st: BuildingStats): string[] {
  return ABILITIES.map((a) => a.buildingCodex?.(b, st) ?? null).filter((x): x is string => !!x);
}
