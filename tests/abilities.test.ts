import { describe, expect, test } from 'vitest';
import { fenfolk } from '../src/factions/fenfolk';
import { ABILITIES, buildingAbilityLines, unitAbilityLines, validateBuildingAbilities, validateUnitAbilities } from '../src/sim/abilities';
import { derive, deriveBuilding } from '../src/sim/physics';

describe('ability registry', () => {
  test('every ability module is registered once', () => {
    expect(new Set(ABILITIES.map((a) => a.id)).size).toBe(ABILITIES.length);
  });
  test('checks catch bad ability data, and real designs pass', () => {
    const tort = fenfolk.units.find((u) => u.id === 'pack-tortoise')!;
    expect(validateUnitAbilities(tort, 'u')).toEqual([]);
    expect(validateUnitAbilities({ ...tort, bearer: { radius: 99 } }, 'u')).toEqual(['u: bad bearer radius']);
    expect(validateUnitAbilities({ ...tort, gait: { hop: NaN } }, 'u')).toEqual(['u: bad gait']);
    const canal = fenfolk.buildings!.find((b) => b.id === 'canal')!;
    expect(validateBuildingAbilities(canal, 'b')).toEqual([]);
    expect(validateBuildingAbilities({ ...canal, wall: 'yes' as unknown as boolean }, 'b')).toEqual(['b: bad wall']);
  });
  test('the Codex describes the abilities a design uses', () => {
    const fenling = fenfolk.units.find((u) => u.id === 'fenling')!;
    expect(unitAbilityLines(fenling, derive(fenling)).join(' ')).toContain('Hops');
    const tort = fenfolk.units.find((u) => u.id === 'pack-tortoise')!;
    expect(unitAbilityLines(tort, derive(tort)).join(' ')).toContain('Ammo bearer');
    const canal = fenfolk.buildings!.find((b) => b.id === 'canal')!;
    expect(buildingAbilityLines(canal, deriveBuilding(canal, fenfolk)).join(' ')).toContain('Wall piece');
  });
});
