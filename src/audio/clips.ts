// Recorded unit voices (public/voices: clips cut from real recordings, labelled in the Voice Lab), on with the
// "Unit voices" setting (?voices=1 / ?voices=0 overrides it). A unit type steps through its clips in turn, one line per action, never one per unit; a cooldown per
// type and a cap on voices at once keep it from getting noisy. Each clip plays through its treatment from the lab.

import { settings } from '../ui/settings';

const URL_VOICES = new URLSearchParams(location.search).get('voices');
/** Are unit voices on? The "Unit voices" setting, unless the URL says otherwise (?voices=1 or ?voices=0). */
export const voicesOn = (): boolean => (URL_VOICES === '1' ? true : URL_VOICES === '0' ? false : settings().voices);

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

// clips struck out while listening (the sound debug panel's ✕, or the Voice Lab's): never played. Shared with the
// Voice Lab through this browser's storage (same site), so a strike in the game shows up there as a skip.
const STRUCK_KEY = 'voicelab-struck';
const struck = new Set<string>((() => { try { return JSON.parse(localStorage.getItem(STRUCK_KEY) || '[]') as string[]; } catch { return []; } })());
export function strike(id: string): void {
  struck.add(id);
  try { localStorage.setItem(STRUCK_KEY, JSON.stringify([...struck])); } catch { /* private mode */ }
}
/** Every clip played, newest last (for the sound debug panel). */
export const played: Array<{ id: string; what: string; t: number }> = [];
const log = (id: string, what: string) => { played.push({ id, what, t: performance.now() }); if (played.length > 30) played.shift(); };

const load = (): Promise<Manifest | null> => (manifest ??= fetch(BASE + 'manifest.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));

/** Start fetching the clips list (call once audio is allowed). */
export function preloadVoices(): void { void load(); } // (combat sounds use the same clips list)

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
/**
 * `chorus`: a group answers (several detuned voices). `echo`: replay the clip this line last played, straight away
 * (a double-click's group answering the single click it follows).
 */
export async function sayLine(ctx: AudioContext, out: AudioNode, factionId: string, specId: string, line: VoiceLine, chorus = false, echo = false): Promise<boolean> {
  if (!voicesOn()) return false;
  const m = await load();
  const unit = `${factionId}:${specId}`, set = m?.lines[unit];
  if (!m || !set) return false;
  // a moment's own clips mixed with the unit's general ("any line") ones; death keeps to death clips, falling back
  // to the general ones only if it has none (a cheerful grunt is no death cry)
  const own = set[line] ?? [], any = set.any ?? [];
  const pool = (line === 'death' ? (own.length ? own : any) : [...own, ...any]).filter((id) => !struck.has(id));
  if (!pool.length) return false;
  const now = performance.now();
  // (an echo comes straight after the line it repeats, so it skips the cooldown)
  if ((!echo && now - (last.get(unit) ?? -Infinity) < COOLDOWN_MS) || playing >= MAX_AT_ONCE) return false;
  last.set(unit, now);
  // round-robin through the type's clips for this line
  const key = `${unit}/${line}`, n = turn.get(key) ?? 0, i = ((echo && n > 0 ? n - 1 : n) % pool.length + pool.length) % pool.length;
  if (!echo || n === 0) turn.set(key, n + 1);
  const id = pool[i], t = fxFor(m, id, unit), buf = await clip(ctx, id);
  log(id, `${unit} ${line}${chorus ? ' (chorus)' : ''}`);
  // a chorus: the whole group answers, a few voices slightly detuned, a beat apart, spread across the stereo field
  const voices = chorus ? [[0, 0, 0], [-14, 0.025, -0.6], [11, 0.045, 0.6], [-6, 0.07, -0.25]] : [[0, 0, 0]];
  const g0 = ctx.createGain(); g0.gain.value = chorus ? 0.55 : 1;
  const srcs = voices.map(([cents, delay, pan]) => {
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = Math.pow(2, t.pitch / 12 + cents / 1200);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    s.connect(p).connect(g0);
    return [s, delay] as const;
  });
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = t.lowcut;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = t.highcut;
  const sh = ctx.createWaveShaper();
  if (t.drive) { const n = 1024, k = t.drive * 60, c = new Float32Array(n); for (let j = 0; j < n; j++) { const x = (j / (n - 1)) * 2 - 1; c[j] = ((1 + k) * x) / (1 + k * Math.abs(x)); } sh.curve = c; }
  const g = ctx.createGain(); g.gain.value = Math.pow(10, t.gain / 20) * (t.drive ? 1 / (1 + t.drive * 1.5) : 1);
  g0.connect(hp).connect(lp).connect(sh).connect(g).connect(out);
  if (t.reverb) { const rv = ctx.createConvolver(); rv.buffer = room(ctx); const wet = ctx.createGain(); wet.gain.value = t.reverb; g.connect(rv).connect(wet).connect(out); }
  playing++;
  srcs[0][0].onended = () => { playing--; };
  for (const [s, delay] of srcs) s.start(ctx.currentTime + delay);
  return true;
}

/**
 * A combat sound (Voice Lab "Combat" clips: combat:swing, combat:throw, combat:light, combat:solid, combat:heavy),
 * through `out`; false if there's no clip for it (the engine synthesizes one instead). Not a voice: no voice
 * setting, no voice cap (the engine already limits how many swings and hits sound at once).
 */
/** `semis`: shift its pitch (heavier, lower); `delay`: seconds from now. */
export async function playCombat(ctx: AudioContext, out: AudioNode, kind: string, semis = 0, delay = 0): Promise<boolean> {
  const m = await load();
  const set = m?.lines[`combat:${kind}`];
  const pool = (set ? Object.values(set).flat() : []).filter((id) => !struck.has(id));
  if (!m || !pool.length) return false;
  const key = `combat:${kind}`, n = turn.get(key) ?? 0, id = pool[n % pool.length];
  turn.set(key, n + 1);
  const t = fxFor(m, id, key), buf = await clip(ctx, id);
  log(id, key);
  const s = ctx.createBufferSource(); s.buffer = buf;
  // a touch of random pitch so repeats don't sound stamped
  s.playbackRate.value = Math.pow(2, (t.pitch + semis + (Math.random() - 0.5) * 1.5) / 12);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = t.lowcut;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = t.highcut;
  const g = ctx.createGain(); g.gain.value = Math.pow(10, t.gain / 20);
  s.connect(hp).connect(lp).connect(g).connect(out);
  s.start(ctx.currentTime + delay);
  return true;
}
