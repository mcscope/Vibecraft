// Meadowfolk voices: three per unit (each unit speaks with one; strike any you dislike in the Codex's voice board).
import type { VoiceSpec } from '../../art/contract';

export const VOICES: Record<string, VoiceSpec[]> = {
  villager: [
    { pitch: 210, vowels: 'aeo', consonant: 'click', timbre: 'triangle', rate: 8 },
    { pitch: 245, vowels: 'ie', consonant: 'pop', timbre: 'triangle', rate: 9, vibrato: 0.02 },
    { pitch: 175, vowels: 'ou', consonant: 'buzz', timbre: 'saw', rate: 7, breath: 0.2 },
  ],
  slinger: [
    { pitch: 270, vowels: 'ei', consonant: 'hiss', timbre: 'square', rate: 10 },
    { pitch: 300, vowels: 'ia', consonant: 'click', timbre: 'triangle', rate: 11 },
    { pitch: 240, vowels: 'ae', consonant: 'pop', timbre: 'square', rate: 9, breath: 0.15 },
  ],
  maceman: [
    { pitch: 120, vowels: 'ao', consonant: 'buzz', timbre: 'saw', rate: 6, size: 0.9 },
    { pitch: 105, vowels: 'ou', consonant: 'pop', timbre: 'saw', rate: 5.5, breath: 0.25, size: 0.85 },
    { pitch: 140, vowels: 'ae', consonant: 'click', timbre: 'square', rate: 7 },
  ],
  pikeman: [
    { pitch: 150, vowels: 'oa', consonant: 'click', timbre: 'saw', rate: 7 },
    { pitch: 165, vowels: 'eo', consonant: 'pop', timbre: 'triangle', rate: 7.5 },
    { pitch: 135, vowels: 'uo', consonant: 'buzz', timbre: 'saw', rate: 6.5, vibrato: 0.02 },
  ],
  lynx: [
    { pitch: 160, vowels: 'ae', consonant: 'click', timbre: 'saw', rate: 7 }, // the rider
    { pitch: 110, vowels: 'ao', consonant: 'hiss', timbre: 'saw', rate: 6, breath: 0.4, size: 0.8 }, // the lynx's hissing growl
    { pitch: 185, vowels: 'ea', consonant: 'pop', timbre: 'square', rate: 8, vibrato: 0.03 },
  ],
  hurlhorn: [
    { pitch: 105, vowels: 'ou', consonant: 'buzz', timbre: 'saw', rate: 3.5, size: 0.6, breath: 0.3 },
    { pitch: 95, vowels: 'ao', consonant: 'pop', timbre: 'saw', rate: 3, size: 0.55, vibrato: 0.04 },
    { pitch: 120, vowels: 'uo', consonant: 'soft', timbre: 'square', rate: 4, size: 0.65, breath: 0.2 },
  ],
  mule: [
    { pitch: 230, vowels: 'ia', consonant: 'soft', timbre: 'square', rate: 5, vibrato: 0.08, size: 0.9 }, // hee-haw
    { pitch: 200, vowels: 'ea', consonant: 'buzz', timbre: 'saw', rate: 5.5, vibrato: 0.06 },
    { pitch: 260, vowels: 'io', consonant: 'soft', timbre: 'triangle', rate: 6, vibrato: 0.1 },
  ],
};
