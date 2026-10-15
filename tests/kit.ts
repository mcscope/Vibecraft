// Test-only specs for abilities no shipped faction uses yet (see DESIGN_SPACE.md):
// a faction plus a few extra units and buildings switched on.
import type { BuildingSpec, FactionSpec, UnitSpec } from '../src/factions/types';

export function withExtras(f: FactionSpec, extra: { units?: UnitSpec[]; buildings?: BuildingSpec[]; patch?: Record<string, Partial<UnitSpec>> }): FactionSpec {
  return {
    ...f,
    units: [...f.units.map((u) => ({ ...u, ...(extra.patch?.[u.id] ?? {}) })), ...(extra.units ?? [])],
    buildings: [...(f.buildings ?? []), ...(extra.buildings ?? [])],
  };
}

export const eagle: UnitSpec = {
  id: 'eagle', name: 'Eagle', description: 'A test flier.',
  mass: 22, physique: { muscle: 0.55, frame: 0.25, reserve: 0.2 },
  attack: { style: 'strike', crystalMass: 0.8 }, canGather: false, flight: true,
} as UnitSpec;

export const road: BuildingSpec = { id: 'road', name: 'Road', description: 'Test road.', size: 1, materials: 8, road: { speed: 1.4 } } as BuildingSpec;
export const conveyor: BuildingSpec = { id: 'conveyor', name: 'Conveyor Belt', description: 'Test belt.', size: 1, materials: 20, conveyor: { speed: 2 } } as BuildingSpec;
export const pen: BuildingSpec = { id: 'pen', name: 'Pen', description: 'Test pen.', size: 2, materials: 140, pen: { radius: 3 } } as BuildingSpec;
export const pool: BuildingSpec = {
  id: 'spawning-pool', name: 'Spawning Pool', description: 'Test living building.',
  size: 2, materials: 450, living: { seed: 0.15, grow: 1.5 }, trains: ['fenling', 'reedguard', 'bog-toad'],
} as BuildingSpec;
