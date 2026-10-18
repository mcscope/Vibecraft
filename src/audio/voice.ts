// Unit voices: a short babble of syllables from a VoiceSpec (art/contract.ts), synthesised with Web Audio:
// short, bright syllables hopping through a little melody, coloured by vowel formants, with a consonant burst,
// breath and vibrato.
// Used by the game (audio/engine.ts) and the Codex's voice board. Voices you've struck out in the Codex are
// remembered in this browser and left out of play.
import type { VoiceSpec } from '../art/contract';

export type VoiceLine = 'select' | 'acknowledge' | 'death';

/** F1, F2 (Hz) of each vowel for an adult-sized voice. */
const FORMANTS: Record<string, [number, number]> = {
  a: [800, 1200], e: [450, 1900], i: [300, 2300], o: [500, 900], u: [350, 700],
};

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, b);
  }
  return b;
}

/**
 * Each line is a little melody of syllables (pitch steps over the voice's own pitch): a rising "hm-hm?" when
 * selected, a bouncy three-note "yes-sir-yes" for an order, a falling two-note cry at death.
 */
const LINES: Record<VoiceLine, { steps: number[]; hold: number }> = {
  select: { steps: [1, 1.26], hold: 1 },
  acknowledge: { steps: [1.19, 1, 1.12], hold: 0.85 },
  death: { steps: [1, 0.75], hold: 2.2 },
};

/** Speak a line in a voice into `out`, starting at `t0` (seconds, ctx time). Returns when it ends. */
export function speak(ctx: BaseAudioContext, out: AudioNode, v: VoiceSpec, line: VoiceLine, t0 = ctx.currentTime): number {
  const spec = LINES[line];
  const vowels = (v.vowels ?? 'ao').replace(/[^aeiou]/g, '') || 'a';
  const size = v.size ?? 1, step = 1 / (v.rate ?? 7), len = step * 0.72 * spec.hold; // each syllable, then a breath of gap
  // never so low it groans: a big body's voice is low, but still a short, round note
  const base = Math.max(90, v.pitch);
  spec.steps.forEach((m, k) => {
    const ts = t0 + k * step * spec.hold, vowel = vowels[k % vowels.length], f0 = base * m;
    // the voiced note: one pitch, lifting a touch into it (no sliding down)
    const o = ctx.createOscillator();
    o.type = v.timbre === 'triangle' ? 'triangle' : v.timbre === 'square' ? 'square' : v.timbre === 'sine' ? 'sine' : 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.94, ts);
    o.frequency.exponentialRampToValueAtTime(f0, ts + Math.min(0.03, len * 0.3));
    if (v.vibrato) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = 7; depth.gain.value = f0 * v.vibrato;
      lfo.connect(depth); depth.connect(o.frequency); lfo.start(ts); lfo.stop(ts + len + 0.05);
    }
    // a crisp envelope: quick in, held, quick out
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, ts);
    env.gain.exponentialRampToValueAtTime(0.5, ts + 0.008);
    env.gain.setValueAtTime(0.5, ts + len * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, ts + len);
    // the vowel's colour: its first two formants, broad (not ringing), plus the note itself for body
    const [f1, f2] = FORMANTS[vowel].map((f) => f * size);
    const dry = ctx.createGain(); dry.gain.value = 0.35; o.connect(dry); dry.connect(env);
    for (const [f, q, g] of [[f1, 1.6, 0.9], [f2, 2.2, 0.6]] as const) {
      const bp = ctx.createBiquadFilter(), gg = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; gg.gain.value = g;
      o.connect(bp); bp.connect(gg); gg.connect(env);
    }
    // soften the buzz of saw and square
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = Math.max(1800, f2 * 1.6); lp.Q.value = 0.5;
    env.connect(lp); lp.connect(out);
    o.start(ts); o.stop(ts + len + 0.05);
    // breath: a little air on the vowel
    if (v.breath) {
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), bg = ctx.createGain();
      n.buffer = noise(ctx); bp.type = 'bandpass'; bp.frequency.value = f2; bp.Q.value = 1.5;
      bg.gain.setValueAtTime(v.breath * 0.25, ts); bg.gain.exponentialRampToValueAtTime(0.0001, ts + len);
      n.connect(bp); bp.connect(bg); bg.connect(out); n.start(ts, Math.random() * 0.5); n.stop(ts + len);
    }
    // the consonant: a short burst as the syllable opens
    const c = v.consonant ?? 'soft';
    if (c !== 'soft') {
      const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), cg = ctx.createGain();
      n.buffer = noise(ctx);
      const clen = c === 'hiss' ? 0.04 : c === 'buzz' ? 0.03 : 0.012;
      f.type = c === 'hiss' ? 'highpass' : c === 'pop' ? 'lowpass' : 'bandpass';
      f.frequency.value = c === 'hiss' ? 5000 : c === 'buzz' ? 1800 : c === 'pop' ? 700 : 3000 * size;
      f.Q.value = 0.8;
      cg.gain.setValueAtTime(c === 'pop' ? 0.5 : 0.25, ts);
      cg.gain.exponentialRampToValueAtTime(0.0001, ts + clen);
      n.connect(f); f.connect(cg); cg.connect(out);
      n.start(ts, Math.random() * 0.5); n.stop(ts + clen + 0.01);
    }
  });
  return t0 + spec.steps.length * step * spec.hold;
}

// ── voices struck out in the Codex (this browser only)

const STRUCK = 'vibecraft-struck-voices';
export const voiceKey = (factionId: string, unitId: string, i: number) => `${factionId}/${unitId}/${i}`;

export function struckVoices(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STRUCK) ?? '[]') as string[]); } catch { return new Set(); }
}
export function setStruck(key: string, struck: boolean): void {
  const s = struckVoices();
  if (struck) s.add(key); else s.delete(key);
  try { localStorage.setItem(STRUCK, JSON.stringify([...s].sort())); } catch { /* private mode */ }
}

/** The voice a unit speaks with: one of its type's voices you haven't struck out, picked by the unit's id. */
export function voiceFor(voices: VoiceSpec[] | undefined, factionId: string, unitId: string, id: number): VoiceSpec | null {
  if (!voices?.length) return null;
  const struck = struckVoices();
  const keep = voices.map((v, i) => [v, i] as const).filter(([, i]) => !struck.has(voiceKey(factionId, unitId, i)));
  const pool = keep.length ? keep : voices.map((v, i) => [v, i] as const); // all struck: speak anyway
  return pool[Math.abs(id) % pool.length][0];
}
