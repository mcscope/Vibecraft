// Wildweld building sounds: a larva laying its body down as web (BuildingArt.sounds.complete). Made from the owner's
// own mouth noises and thuds (Voice Lab clips in public/voices), or from soft noise: wet, clicking, low and short.
import type { BuildingArt, SoundLayer, SoundSpec } from '../../art/contract';

/** Every layer `semis` lower (a bigger body lays a bigger web). */
const lower = (layers: SoundLayer[], semis: number): SoundLayer[] => layers.map((l) => ({ ...l, semis: (l.semis ?? 0) + semis }));

/** The larva's body set down with a wet mouth noise, then a smaller one as it settles (≈0.45 s). */
const WET_LAY: SoundLayer[] = [
  { voice: 'thuds_05', semis: -5, highcut: 600, gain: 0.5 }, // a soft, low thud: the body set down
  { voice: 'mouthnoises2_06', at: 0.04, semis: -3, highcut: 2500, gain: 0.8 }, // wet, in the low middle
  { voice: 'mouthnoises2_09', at: 0.2, semis: -6, highcut: 2000, gain: 0.55 }, // (the egg's): a last wet tick
];

/** The larva's own clicking run (eight clicks), slowed and dulled, over a muffled thud (≈0.65 s). */
const CHITTER: SoundLayer[] = [
  { voice: 'mouthnoises2_14', semis: -3, highcut: 3500, gain: 0.7 },
  { voice: 'thuds_13', at: 0.1, semis: -7, highcut: 500, gain: 0.4 },
];

/** Synthesized: a strand of silk drawn out (a narrow band of noise sliding down, ticking), then a soft settle (≈0.55 s). */
const SILK: SoundLayer[] = [
  { synth: { kind: 'strand', pitch: 1100, glide: 0.4, flutter: 26, length: 0.5 }, gain: 0.6 },
  { synth: { kind: 'hit', pitch: 70, length: 0.25 }, at: 0.3, gain: 0.35 },
];

/**
 * TEMPORARY (an audition: once the owner picks, keep the chosen one as a plain `{ layers }` and delete the rest):
 * ?websound=1 (the default), 2 or 3.
 */
const web = (semis: number): SoundSpec => ({
  audition: 'websound',
  options: [
    { name: 'web 1: wet lay', sound: { name: 'web 1: wet lay', layers: lower(WET_LAY, semis) } },
    { name: 'web 2: chitter', sound: { name: 'web 2: chitter', layers: lower(CHITTER, semis) } },
    { name: 'web 3: silk strand', sound: { name: 'web 3: silk strand', layers: lower(SILK, semis) } },
  ],
});

/** By building id. The Mimic Mine's T3 larva is three times the T2's mass: its web sounds lower. */
export const buildingSounds: Record<string, BuildingArt['sounds']> = {
  'web-wall': { complete: web(0) },
  'web-tower': { complete: web(-4) },
};
