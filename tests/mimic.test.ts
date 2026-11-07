import { describe, expect, it } from 'vitest';
import { mimicClear } from '../src/factions/wildwelds/mimic';

describe('Web Tower (mimic mine)', () => {
  it('its tentacle never goes under the ground or through its rocks and crystals, whichever way it throws', () => {
    expect(mimicClear().gap).toBeGreaterThan(0);
  });
});
