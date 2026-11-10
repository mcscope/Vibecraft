# Larva web sound: three candidates

A larva laying a web now makes a wet, creaturely sound. Three versions wait for your ear. Pick one to keep.

## Hear them

Open the Wildwelds lesson. Step 5 lays a web wall. The sound panel (bottom left) names each sound as it plays.

| Candidate | URL |
| --- | --- |
| 1. Wet lay (default) | `http://localhost:5179/?mode=tutorial&track=wildwelds&lesson=0&sounddebug=1` |
| 2. Chitter | `http://localhost:5179/?mode=tutorial&track=wildwelds&lesson=0&sounddebug=1&websound=2` |
| 3. Silk strand | `http://localhost:5179/?mode=tutorial&track=wildwelds&lesson=0&sounddebug=1&websound=3` |

A T3 larva's Mimic Mine plays the same candidate, 4 semitones lower (a bigger body).

## The old sound

It was the shared "building finished" chord. Every faction's buildings play it. Four bell tones ring up a major chord (E, G♯, B, high E), 40 ms apart, for 1.4 s. A quick rising major arpeggio of bells is the classic coin or power-up jingle. A larva's web finishes the moment it is laid, so the larva got that fanfare. Growing to full size is silent.

## The three candidates

All three play at half volume, about as loud as a unit's voice. Clips come from your own recordings in the Voice Lab.

| Candidate | Made of | Length |
| --- | --- | --- |
| 1. Wet lay | `thuds_05`, 5 semitones down, cut above 600 Hz: a soft body thud. Then `mouthnoises2_06` (a larva clip), 3 down, cut above 2.5 kHz: wet, energy mostly at 300 to 1500 Hz. Then `mouthnoises2_09` (an egg clip), 6 down, quieter: a last wet tick. | about 0.45 s |
| 2. Chitter | `mouthnoises2_14`, the larva's own clicking run (8 clicks), 3 semitones down, cut above 3.5 kHz. A muffled `thuds_13` sits under it, 7 down. | about 0.65 s |
| 3. Silk strand | Synthesized. Soft noise in a narrow band slides down from 1100 Hz to 440 Hz, ticking 26 times a second and slowing. A soft low thud (70 Hz) ends it. | about 0.55 s |

Raw clip levels: `thuds_05` and `thuds_13` peak at -1 dBFS; `mouthnoises2_06` at -9; `mouthnoises2_09` at -8; `mouthnoises2_14` at 0.

## After you pick

- The choice lives in `src/factions/wildwelds/sounds.ts`. Keep the chosen layers as a plain `{ layers }` sound.
- Then delete the audition: the `audition` sound type in `src/art/contract.ts`, its branch in `AudioEngine.play`, and its line in `src/net/bundle.ts`. Each is marked TEMPORARY.
- The clips live in `public/voices`. A clip marked "skip" in the Voice Lab drops out of the sound on the next import.

## How it works

- A building's art can carry its own `complete` sound. Buildings without one keep the chord, so other factions sound the same.
- A sound can now be layers: recorded clips by Voice Lab id, or synth recipes, each at its own moment.
- A new synth kind, `strand`, makes the silk: gliding narrow-band noise with a flutter.
