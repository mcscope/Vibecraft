// Fenfolk voices: three per unit, croaky and chirping (each unit speaks with one; strike any you dislike in the
// Codex's voice board).
import type { VoiceSpec } from '../../art/contract';

export const VOICES: Record<string, VoiceSpec[]> = {
  fenling: [
    { pitch: 330, vowels: 'iu', consonant: 'click', timbre: 'triangle', rate: 11, size: 1.25 },
    { pitch: 290, vowels: 'oi', consonant: 'pop', timbre: 'square', rate: 10, size: 1.2, vibrato: 0.03 },
    { pitch: 360, vowels: 'ei', consonant: 'buzz', timbre: 'triangle', rate: 12, size: 1.3, breath: 0.1 },
  ],
  reedguard: [
    { pitch: 240, vowels: 'eo', consonant: 'click', timbre: 'square', rate: 9, size: 1.15 },
    { pitch: 210, vowels: 'ou', consonant: 'buzz', timbre: 'square', rate: 8, size: 1.1, breath: 0.2 },
    { pitch: 265, vowels: 'ae', consonant: 'pop', timbre: 'triangle', rate: 9.5, size: 1.2 },
  ],
  'bog-toad': [
    { pitch: 100, vowels: 'ou', consonant: 'pop', timbre: 'square', rate: 3.5, size: 0.55, vibrato: 0.06 }, // a deep croak
    { pitch: 92, vowels: 'uo', consonant: 'buzz', timbre: 'saw', rate: 3, size: 0.5, breath: 0.25 },
    { pitch: 115, vowels: 'oa', consonant: 'pop', timbre: 'square', rate: 4, size: 0.6, vibrato: 0.08 },
  ],
  'pack-tortoise': [
    { pitch: 125, vowels: 'uo', consonant: 'soft', timbre: 'sine', rate: 3, size: 0.7, breath: 0.3 },
    { pitch: 110, vowels: 'ou', consonant: 'buzz', timbre: 'triangle', rate: 2.5, size: 0.65 },
    { pitch: 140, vowels: 'oa', consonant: 'soft', timbre: 'sine', rate: 3.5, size: 0.75, vibrato: 0.03 },
  ],
  'siege-heron': [
    { pitch: 420, vowels: 'ae', consonant: 'click', timbre: 'saw', rate: 6, size: 1.4, breath: 0.2 }, // a squawk
    { pitch: 380, vowels: 'ai', consonant: 'hiss', timbre: 'square', rate: 7, size: 1.3 },
    { pitch: 460, vowels: 'ea', consonant: 'pop', timbre: 'saw', rate: 5, size: 1.45, vibrato: 0.05 },
  ],
  'great-siege-heron': [
    { pitch: 300, vowels: 'ao', consonant: 'click', timbre: 'saw', rate: 4.5, size: 1.2, breath: 0.25 },
    { pitch: 260, vowels: 'ae', consonant: 'hiss', timbre: 'saw', rate: 4, size: 1.1 },
    { pitch: 340, vowels: 'oa', consonant: 'pop', timbre: 'square', rate: 5, size: 1.25, vibrato: 0.04 },
  ],
};
