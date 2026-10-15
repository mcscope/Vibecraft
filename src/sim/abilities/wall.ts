// Wall pieces (BuildingSpec.wall): block the way like any building, laid in lines
// by hand (shift-click keeps placing). The skirmish AI doesn't build them.
import type { BuildingSpec } from '../../factions/types';
import type { Ability } from './index';

/** Laid by hand in lines, so the AI leaves it alone: walls and underfoot pieces. */
export const isWall = (b: BuildingSpec): boolean => !!b.wall || !!b.road || !!b.conveyor;

export const wall: Ability = {
  id: 'wall',
  validateBuilding: (b, where) => (b.wall !== undefined && typeof b.wall !== 'boolean' ? [`${where}: bad wall`] : []),
  buildingCodex: (b) => (b.wall ? '<b>Wall piece.</b> Nothing walks through it; shift-click to lay a line of them.' : null),
};
