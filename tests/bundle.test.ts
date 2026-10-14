import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';
import { SkirmishAI } from '../src/ai/skirmishAI';
import { checkBundle, checkSpec, fromBundle, specData, type FactionBundle } from '../src/net/bundle';

const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const sprite = { i: 0, sx: 0, sy: 0, sw: 4, sh: 4, ax: 2, ay: 4, q: 1 };
const bundle = (patch: Partial<FactionBundle> = {}): FactionBundle => ({
  v: 1, spec: specData(meadowfolk),
  art: { images: [IMG], units: { villager: { height: 40, anims: { idle: { frames: [[sprite]] } } } }, buildings: {}, flag: sprite },
  ...patch,
});
const size = (b: unknown) => JSON.stringify(b).length;

describe('faction bundles', () => {
  test('a faction\'s spec survives the trip as plain data and plays out identically', () => {
    const data = specData(meadowfolk);
    expect(JSON.stringify(data)).not.toContain('function');
    const play = (f: typeof meadowfolk) => {
      const w = new World({ seed: 42, players: [{ name: 'A', faction: f }, { name: 'B', faction: f }] });
      const ais = [new SkirmishAI(0), new SkirmishAI(1)];
      const hashes: number[] = [];
      for (let t = 0; t < 20 * 60; t++) { w.step(ais.flatMap((ai) => ai.think(w).map((cmd) => ({ player: ai.player, cmd })))); if (t % 200 === 0) hashes.push(w.hash()); }
      return hashes;
    };
    const received = fromBundle({ v: 1, spec: JSON.parse(JSON.stringify(data)) });
    expect(play(received)).toEqual(play(meadowfolk));
  });

  test('a well-formed bundle passes the checks', () => {
    expect(checkSpec(specData(meadowfolk))).toEqual([]);
    expect(checkBundle(bundle(), size(bundle()))).toEqual([]);
  });

  test('bad bundles are rejected', () => {
    expect(checkBundle({ hello: 1 }, 10)).toContain('not a VibeCraft faction bundle');
    // a design its own buildings can't pay for (the same rule as every faction)
    const greedy = specData(meadowfolk);
    greedy.units = greedy.units.map((u) => (u.id === 'slinger' ? { ...u, refinement: 3 } : u));
    expect(checkBundle(bundle({ spec: greedy }), 100).join(' ')).toContain('slinger');
    // nonsense numbers
    const broken = specData(meadowfolk);
    broken.units = broken.units.map((u, i) => (i === 0 ? { ...u, mass: Number.NaN } : u));
    expect(checkBundle(bundle({ spec: broken }), 100).join(' ')).toContain('bad body');
    // images must be inline data, never URLs to fetch
    const linked = bundle();
    linked.art!.images = ['https://example.com/tracker.png'];
    expect(checkBundle(linked, 100).join(' ')).toContain('data: images');
    // frames must point at a real image
    const stray = bundle();
    stray.art!.flag = { ...sprite, i: 5 };
    expect(checkBundle(stray, 100).join(' ')).toContain('bad sprite');
    expect(checkBundle(bundle(), 70_000_000)[0]).toContain('too large');
  });
});
