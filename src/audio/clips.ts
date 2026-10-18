// Recorded unit voices (public/voices: clips cut from real recordings, labelled in the Voice Lab), on only with
// ?voices=1. A unit type steps through its clips in turn, one line per action, never one per unit; a cooldown per
// type and a cap on voices at once keep it from getting noisy. Each clip plays through its treatment from the lab.

/** Voices are on only when asked for: ?voices=1. */
export const VOICES_ON = new URLSearchParams(location.search).get('voices') === '1';

export type VoiceLine = 'select' | 'order' | 'attack' | 'death';

interface Fx { pitch?: number; lowcut?: number; highcut?: number; drive?: number; reverb?: number; gain?: number }
interface Manifest { lines: Record<string, Partial<Record<VoiceLine | 'any', string[]>>>; clipFx: Record<string, Fx>; unitFx: Record<string, Fx> }

const BASE = 'voices/';
const COOLDOWN_MS = 700; // per unit type: repeat clicks don't stack
const MAX_AT_ONCE = 3; // across the field: past this, a line is dropped, not queued

let manifest: Promise<Manifest | null> | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();
const turn = new Map<string, number>(), last = new Map<string, number>();
let playing = 0, impulse: AudioBuffer | null = null;

const load = (): Promise<Manifest | null> => (manifest ??= fetch(BASE + 'manifest.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));

/** Start fetching the clips list (call once audio is allowed). */
export function preloadVoices(): void { if (VOICES_ON) void load(); }

function clip(ctx: AudioContext, id: string): Promise<AudioBuffer> {
  let b = buffers.get(id);
  if (!b) buffers.set(id, (b = fetch(`${BASE}${id}.m4a`).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a))));
  return b;
}

/** The clip's own treatment with its unit's on top (as the Voice Lab combines them). */
function fxFor(m: Manifest, id: string, unit: string) {
  const a = m.clipFx[id] ?? {}, b = m.unitFx[unit] ?? {};
  return {
    pitch: (a.pitch ?? 0) + (b.pitch ?? 0), gain: (a.gain ?? 0) + (b.gain ?? 0),
    lowcut: Math.max(a.lowcut ?? 20, b.lowcut ?? 20), highcut: Math.min(a.highcut ?? 20000, b.highcut ?? 20000),
    drive: 1 - (1 - (a.drive ?? 0)) * (1 - (b.drive ?? 0)), reverb: 1 - (1 - (a.reverb ?? 0)) * (1 - (b.reverb ?? 0)),
  };
}

function room(ctx: AudioContext): AudioBuffer {
  if (impulse) return impulse;
  const len = Math.floor(ctx.sampleRate * 1.6);
  impulse = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = impulse.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  return impulse;
}

/**
 * `factionId:specId` says `line` (or one of its general clips), through `out`. False if voices are off, it has no
 * clip for it, it spoke too recently, or enough voices are already going.
 */
export async function sayLine(ctx: AudioContext, out: AudioNode, factionId: string, specId: string, line: VoiceLine): Promise<boolean> {
  if (!VOICES_ON) return false;
  const m = await load();
  const unit = `${factionId}:${specId}`, set = m?.lines[unit];
  if (!m || !set) return false;
  const pool = set[line]?.length ? set[line]! : set.any ?? [];
  if (!pool.length) return false;
  const now = performance.now();
  if (now - (last.get(unit) ?? -Infinity) < COOLDOWN_MS || playing >= MAX_AT_ONCE) return false;
  last.set(unit, now);
  // round-robin through the type's clips for this line
  const key = `${unit}/${line}`, i = (turn.get(key) ?? 0) % pool.length;
  turn.set(key, i + 1);
  const id = pool[i], t = fxFor(m, id, unit), buf = await clip(ctx, id);
  const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = Math.pow(2, t.pitch / 12);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = t.lowcut;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = t.highcut;
  const sh = ctx.createWaveShaper();
  if (t.drive) { const n = 1024, k = t.drive * 60, c = new Float32Array(n); for (let j = 0; j < n; j++) { const x = (j / (n - 1)) * 2 - 1; c[j] = ((1 + k) * x) / (1 + k * Math.abs(x)); } sh.curve = c; }
  const g = ctx.createGain(); g.gain.value = Math.pow(10, t.gain / 20) * (t.drive ? 1 / (1 + t.drive * 1.5) : 1);
  s.connect(hp).connect(lp).connect(sh).connect(g).connect(out);
  if (t.reverb) { const rv = ctx.createConvolver(); rv.buffer = room(ctx); const wet = ctx.createGain(); wet.gain.value = t.reverb; g.connect(rv).connect(wet).connect(out); }
  playing++;
  s.onended = () => { playing--; };
  s.start();
  return true;
}
