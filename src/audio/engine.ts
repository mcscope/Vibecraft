// Plays the game's sound: effects from world events, unit voices, and music.
//
// Like art, sound is supplied by factions (UnitArt.sounds, FactionArt.music).
// Whatever a faction leaves out is derived from physics — voices pitch down
// with mass, impacts get heavier with energy — so every faction sounds like
// something. Everything is synthesised; clips (URLs / data: URIs) also work.
import type { MusicSpec, SoundSpec, SynthRecipe } from '../art/contract';
import type { Camera } from '../render/camera';
import type { ArtBank } from '../render/artbank';
import type { World, WorldEvent } from '../sim/world';
import { settings, onSettings } from '../ui/settings';
import { playCombat, preloadVoices, sayLine, voicesOn } from './clips';

const FORMANTS: Record<NonNullable<SynthRecipe['vowel']>, [number, number]> = {
  a: [800, 1200], e: [500, 1900], i: [320, 2300], o: [500, 900], u: [350, 700],
};

interface Where { pan: number; gain: number }

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private reverb!: ConvolverNode;
  private clips = new Map<string, Promise<AudioBuffer | null>>();
  private recent = new Map<string, number[]>();
  private musicTimer = 0;
  private intensity = 0; // rises with combat, falls in peace

  /** Sound the horn when the player's units or buildings are newly attacked (games, not showcases). */
  alerts = false;
  private lastAlert = { t: -Infinity, x: 0, y: 0 };

  constructor(private world: World, private bank: ArtBank, private player: number) {
    // browsers only allow audio after a user gesture
    const start = () => { this.start(); window.removeEventListener('pointerdown', start); window.removeEventListener('keydown', start); };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
    onSettings(() => this.applyVolumes());
  }

  private start(): void {
    if (this.ctx) return;
    const ctx = (this.ctx = new AudioContext());
    preloadVoices();
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.connect(comp);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.connect(this.master);
    // a generated hall reverb for atmosphere
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.reverb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.reverb.connect(wet); wet.connect(this.master);
    this.applyVolumes();
    this.startMusic();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const s = settings();
    this.master.gain.value = s.muted ? 0 : s.volume;
    this.sfx.gain.value = s.sfxVolume;
    this.music.gain.value = s.musicVolume * 0.55;
  }

  /** Too many of the same sound at once turns to mush: allow a few per window. */
  private allow(key: string, max: number, windowMs: number): boolean {
    const now = performance.now();
    const list = (this.recent.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) { this.recent.set(key, list); return false; }
    list.push(now);
    this.recent.set(key, list);
    return true;
  }

  private where(cam: Camera, x: number, y: number): Where {
    const [sx, sy] = cam.toScreen(x, y);
    const dx = (sx - cam.width / 2) / (cam.width / 2), dy = (sy - cam.height / 2) / (cam.height / 2);
    const off = Math.max(0, Math.hypot(dx, dy) - 1);
    return { pan: Math.max(-1, Math.min(1, dx * 0.8)), gain: Math.max(0, 1 - off * 0.8) };
  }

  // ───────────────────────────── world events ─────────────────────────────

  handle(events: WorldEvent[], cam: Camera): void {
    if (!this.ctx) return;
    for (const e of events) {
      switch (e.type) {
        case 'attack': {
          if (!this.allow('swing', 5, 120)) break;
          const at = this.where(cam, e.x, e.y);
          const custom = e.specId ? this.bank.unit(e.owner, e.specId)?.sounds?.attack : undefined;
          if (custom) this.play(custom, at);
          else {
            // a recorded swing or throw (Voice Lab "Combat" clips), else a synthesized whoosh
            const kg = e.kg, style = e.style;
            void playCombat(this.ctx!, this.out(at, 0.35), style === 'throw' ? 'throw' : 'swing').then((ok) => {
              if (!ok) this.synth({ kind: 'whoosh', pitch: 900 / Math.cbrt(Math.max(0.2, kg)), length: style === 'throw' ? 0.32 : 0.18 }, at, 0.35);
            });
          }
          break;
        }
        case 'hit': {
          if (this.alerts) this.underAttack(e);
          if (!this.allow('hit', 6, 120)) break;
          this.intensity = Math.min(1, this.intensity + 0.05);
          const at = this.where(cam, e.x, e.y);
          // the physics picks the sound: how hard it landed (a recorded crack / thump / boom, else a synthesized one)
          const energy = Math.max(1, e.damage), target = e.target;
          const loud = Math.min(1, 0.25 + Math.log10(energy) * 0.18);
          // heavy hits drop in pitch with their energy (a 290 charge sits well below a 70 blow) and get a body thud
          // under them; the biggest try the Charge clips first
          const heavy = energy >= 70, semis = heavy ? -Math.min(9, 5 * Math.log2(energy / 70)) : 0;
          if (heavy) this.synth({ kind: 'hit', pitch: 70 / Math.pow(energy / 70, 0.25), length: 0.35 + Math.min(0.5, energy / 800) }, at, loud * 0.7);
          const kind = energy < 15 ? 'light' : !heavy ? 'solid' : 'heavy';
          void (energy >= 150 ? playCombat(this.ctx!, this.out(at, loud), 'charge', semis + 3) : Promise.resolve(false))
            .then((ok) => ok || playCombat(this.ctx!, this.out(at, loud), kind, semis))
            .then((ok) => {
            if (ok) return;
            // heavier blows: lower, louder thump; plus the crystal's ring
            this.synth({ kind: 'hit', pitch: 160 / Math.pow(energy / 30, 0.18), length: 0.18 + Math.min(0.4, energy / 1500) }, at, loud);
            this.synth({ kind: 'chime', pitch: 1900 + (target % 7) * 140, length: 0.35 }, at, 0.12);
          });
          break;
        }
        case 'death': {
          if (!this.allow('death', 3, 300)) break;
          const art = this.bank.unit(e.owner, e.specId);
          const at = this.where(cam, e.x, e.y);
          if (art?.sounds?.death) this.play(art.sounds.death, at);
          else if (voicesOn()) void sayLine(this.ctx!, this.out(at, 0.5), this.world.factionOf(e.owner).id, e.specId, 'death');
          break;
        }
        case 'trained':
          if (e.owner === this.player) { const u = this.world.units.get(e.id); if (u) this.unitLine(u.owner, u.specId, 'select', { pan: 0, gain: 0.6 }); }
          break;
        case 'built':
          if (e.owner === this.player) this.chord([0, 4, 7, 12], 330, 0.5);
          break;
        case 'researched':
          if (e.owner === this.player) this.chord([0, 7, 12, 16, 19], 392, 0.45, 0.12);
          break;
        case 'buildingDestroyed': {
          const at = this.where(cam, e.x, e.y), big = Math.min(1.6, 0.8 + e.size * 0.25);
          // the low rumble of it coming down
          this.synth({ kind: 'hit', pitch: 55 / big, length: 1.2 * big }, at, 1);
          this.synth({ kind: 'whoosh', pitch: 300, length: 1.4 * big }, at, 0.5);
          // a recorded collapse, else timber and stone falling: heavy and solid clips pitched way down, staggered
          void playCombat(this.ctx!, this.out(at, 0.9), 'collapse').then((ok) => {
            if (ok) return;
            [[0, 'heavy', -12], [0.12, 'solid', -10], [0.3, 'heavy', -14], [0.55, 'solid', -11], [0.85, 'solid', -13]].forEach(([d, k, st]) =>
              void playCombat(this.ctx!, this.out(at, 0.7), k as string, (st as number) - e.size, d as number));
          });
          break;
        }
      }
    }
  }

  /**
   * The player selected or ordered a unit (one line for the whole group): it answers, with a recorded voice line
   * (audio/clips.ts, only with ?voices=1), or the faction's own sound for it if it has one.
   */
  unitLine(owner: number, specId: string, line: 'select' | 'acknowledge' | 'attack', at: Where = { pan: 0, gain: 0.8 }, chorus = false, echo = false): void {
    if (!this.ctx) return;
    const art = this.bank.unit(owner, specId);
    const custom = line !== 'attack' ? art?.sounds?.[line] : undefined;
    if (custom) { this.play(custom, at); return; }
    // a group of big bodies answers as one: their lines are a beast's own call, not a crowd's (over 150 kg)
    const big = (this.world.specOf(owner, specId)?.stats.mass ?? 0) > 150;
    if (voicesOn()) void sayLine(this.ctx, this.out(at, 0.55), this.world.factionOf(owner).id, specId, line === 'acknowledge' ? 'order' : line, chorus && !big, echo && !big);
  }

  ui(): void { if (this.ctx) this.synth({ kind: 'pluck', pitch: 660, timbre: 'triangle', length: 0.08 }, { pan: 0, gain: 0.5 }, 0.25); }

  // ───────────────────────────── playback ─────────────────────────────

  play(s: SoundSpec, at: Where, gain = 1): void {
    if ('synth' in s) this.synth(s.synth, at, gain);
    else this.clip(s.clip, at, gain * (s.gain ?? 1));
  }

  private out(at: Where, gain: number, bus: GainNode = this.sfx, wet = 0.25): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain * at.gain;
    const p = ctx.createStereoPanner();
    p.pan.value = at.pan;
    g.connect(p); p.connect(bus);
    if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; p.connect(w); w.connect(this.reverb); }
    return g;
  }

  private clip(url: string, at: Where, gain: number): void {
    const ctx = this.ctx!;
    let buf = this.clips.get(url);
    if (!buf) {
      buf = fetch(url).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)).catch(() => null);
      this.clips.set(url, buf);
    }
    buf.then((b) => {
      if (!b) return;
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(this.out(at, gain));
      src.start();
    });
  }

  private noise(len: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * len)), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource();
    s.buffer = b;
    return s;
  }

  synth(r: SynthRecipe, at: Where, gain = 1, bus?: GainNode, when = 0): void {
    const ctx = this.ctx;
    if (!ctx || at.gain <= 0.01) return;
    const t0 = ctx.currentTime + when;
    const len = r.length ?? 0.25;
    const out = this.out(at, gain, bus);
    switch (r.kind) {
      case 'voice': {
        const [f1, f2] = FORMANTS[r.vowel ?? 'a'];
        const n = r.count ?? 1;
        for (let k = 0; k < n; k++) {
          const ts = t0 + k * len * 1.15;
          const o = ctx.createOscillator();
          o.type = r.timbre === 'triangle' ? 'triangle' : r.timbre === 'square' ? 'square' : r.timbre === 'sine' ? 'sine' : 'sawtooth';
          const f0 = (r.pitch ?? 180) * (k === n - 1 && n > 1 ? 0.9 : 1);
          o.frequency.setValueAtTime(f0 * 1.06, ts);
          o.frequency.exponentialRampToValueAtTime(f0 * 0.92, ts + len);
          const env = ctx.createGain();
          env.gain.setValueAtTime(0.0001, ts);
          env.gain.exponentialRampToValueAtTime(0.5, ts + 0.025);
          env.gain.exponentialRampToValueAtTime(0.0001, ts + len);
          for (const [f, q] of [[f1, 6], [f2, 9]]) {
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
            o.connect(bp); bp.connect(env);
          }
          env.connect(out);
          o.start(ts); o.stop(ts + len + 0.05);
        }
        break;
      }
      case 'pluck': {
        const o = ctx.createOscillator();
        o.type = r.timbre === 'saw' ? 'sawtooth' : r.timbre === 'square' ? 'square' : r.timbre === 'sine' ? 'sine' : 'triangle';
        o.frequency.value = r.pitch ?? 440;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime((r.pitch ?? 440) * 8, t0);
        lp.frequency.exponentialRampToValueAtTime((r.pitch ?? 440) * 1.2, t0 + len);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.6, t0);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
        o.connect(lp); lp.connect(env); env.connect(out);
        o.start(t0); o.stop(t0 + len + 0.05);
        break;
      }
      case 'hit': {
        const nz = this.noise(len);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = (r.pitch ?? 140) * 6; bp.Q.value = 0.8;
        const ne = ctx.createGain();
        ne.gain.setValueAtTime(0.7, t0);
        ne.gain.exponentialRampToValueAtTime(0.0001, t0 + len * 0.6);
        nz.connect(bp); bp.connect(ne); ne.connect(out);
        nz.start(t0);
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime((r.pitch ?? 140) * 1.8, t0);
        o.frequency.exponentialRampToValueAtTime(r.pitch ?? 140, t0 + len * 0.5);
        const oe = ctx.createGain();
        oe.gain.setValueAtTime(0.9, t0);
        oe.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
        o.connect(oe); oe.connect(out);
        o.start(t0); o.stop(t0 + len + 0.05);
        break;
      }
      case 'whoosh': {
        const nz = this.noise(len);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.Q.value = 1.4;
        bp.frequency.setValueAtTime((r.pitch ?? 800) * 0.5, t0);
        bp.frequency.exponentialRampToValueAtTime((r.pitch ?? 800) * 1.6, t0 + len * 0.6);
        bp.frequency.exponentialRampToValueAtTime((r.pitch ?? 800) * 0.7, t0 + len);
        const e = ctx.createGain();
        e.gain.setValueAtTime(0.0001, t0);
        e.gain.exponentialRampToValueAtTime(0.6, t0 + len * 0.45);
        e.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
        nz.connect(bp); bp.connect(e); e.connect(out);
        nz.start(t0);
        break;
      }
      case 'chime': {
        for (const [m, g] of [[1, 0.5], [2.76, 0.25], [5.4, 0.12]]) {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = (r.pitch ?? 880) * m;
          const e = ctx.createGain();
          e.gain.setValueAtTime(g, t0);
          e.gain.exponentialRampToValueAtTime(0.0001, t0 + len / m + 0.05);
          o.connect(e); e.connect(out);
          o.start(t0); o.stop(t0 + len + 0.1);
        }
        break;
      }
    }
  }

  /** One of ours was hit: sound the horn, unless we already did lately for a fight near here. */
  private underAttack(e: { x: number; y: number; target: number }): void {
    const ours = this.world.units.get(e.target)?.owner ?? this.world.buildings.get(e.target)?.owner;
    if (ours !== this.player) return;
    const now = performance.now(), a = this.lastAlert;
    const elsewhere = Math.hypot(e.x - a.x, e.y - a.y) > 12; // a new fight somewhere else
    if (now - a.t < (elsewhere ? 4000 : 15000)) return;
    this.lastAlert = { t: now, x: e.x, y: e.y };
    this.horn();
  }

  /** A short war-horn call: two brassy notes, the second a fifth below. */
  private horn(): void {
    const ctx = this.ctx!, out = this.out({ pan: 0, gain: 1 }, 0.5, this.sfx, 0.35);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.connect(out);
    const notes: Array<[number, number, number]> = [[220, 0, 0.42], [146.8, 0.46, 0.75]]; // A3, then D3
    for (const [f, start, len] of notes) {
      const t0 = ctx.currentTime + start;
      const g = ctx.createGain(); g.connect(lp);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.5, t0 + 0.08);
      g.gain.setValueAtTime(0.45, t0 + len - 0.12);
      g.gain.linearRampToValueAtTime(0, t0 + len);
      // the brass opens up as it's blown: the filter sweeps up with each note
      lp.frequency.setValueAtTime(500, t0);
      lp.frequency.linearRampToValueAtTime(2200, t0 + 0.12);
      for (const [det, type] of [[0, 'sawtooth'], [7, 'sawtooth'], [-1200, 'square']] as const) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
        o.frequency.setValueAtTime(f * 0.97, t0); o.frequency.linearRampToValueAtTime(f, t0 + 0.06); // lips find the note
        o.connect(g); o.start(t0); o.stop(t0 + len + 0.05);
      }
    }
  }

  private chord(semis: number[], root: number, gain: number, stagger = 0.04): void {
    semis.forEach((s, i) => this.synth({ kind: 'chime', pitch: root * Math.pow(2, s / 12), length: 1.4 }, { pan: 0, gain: 1 }, gain / semis.length * 2, undefined, i * stagger));
  }

  // ───────────────────────────── music ─────────────────────────────

  /** Generative theme from the player's faction MusicSpec (or a looping clip). */
  private startMusic(): void {
    const ctx = this.ctx!;
    const spec: MusicSpec = this.bank.factions[this.player]?.music ?? {};
    if (spec.clip) {
      const el = new Audio(spec.clip);
      el.loop = true;
      const src = ctx.createMediaElementSource(el);
      src.connect(this.music);
      el.play().catch(() => undefined);
      return;
    }
    const scale = spec.scale ?? [0, 2, 3, 5, 7, 9, 10];
    const root = spec.root ?? 146.8;
    const beat = 60 / (spec.tempo ?? 72);
    const note = (deg: number, oct = 0) => root * Math.pow(2, (scale[((deg % scale.length) + scale.length) % scale.length] + 12 * (oct + Math.floor(deg / scale.length))) / 12);
    // drone: root + fifth, slowly breathing
    const droneBus = ctx.createGain();
    droneBus.gain.value = 0.12;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 500;
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07; lfoGain.gain.value = 260;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency); lfo.start();
    for (const [f, d] of [[root / 2, -5], [root / 2, 5], [(root * 3) / 4, 0]]) {
      const o = ctx.createOscillator();
      o.type = spec.drone === 'triangle' ? 'triangle' : spec.drone === 'sine' ? 'sine' : 'sawtooth';
      o.frequency.value = f; o.detune.value = d;
      o.connect(lp);
      o.start();
    }
    lp.connect(droneBus); droneBus.connect(this.music);
    const wet = ctx.createGain(); wet.gain.value = 0.5; droneBus.connect(wet); wet.connect(this.reverb);
    // lead: a wandering modal melody; percussion joins as battles heat up
    let deg = 0, nextT = ctx.currentTime + 1, step = 0;
    const lead = spec.lead ?? 'triangle';
    const tick = () => {
      while (nextT < ctx.currentTime + 0.4) {
        const rest = Math.random() < 0.3;
        if (!rest) {
          deg += [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(Math.random() * 8)];
          deg = Math.max(-3, Math.min(9, deg));
          this.synth({ kind: 'pluck', pitch: note(deg, 1), timbre: lead, length: beat * 1.6 }, { pan: (Math.random() - 0.5) * 0.4, gain: 1 }, 0.16, this.music, nextT - ctx.currentTime);
          if (step % 4 === 0) this.synth({ kind: 'pluck', pitch: note(deg - 7, 0), timbre: 'sine', length: beat * 3 }, { pan: 0, gain: 1 }, 0.12, this.music, nextT - ctx.currentTime);
        }
        if (this.intensity > 0.25 && step % 2 === 0) this.synth({ kind: 'hit', pitch: step % 4 === 0 ? 60 : 90, length: 0.25 }, { pan: 0, gain: 1 }, 0.18 * this.intensity, this.music, nextT - ctx.currentTime);
        nextT += beat * (Math.random() < 0.25 ? 0.5 : 1);
        step++;
      }
      this.intensity *= 0.97;
    };
    this.musicTimer = window.setInterval(tick, 120);
  }

  dispose(): void { clearInterval(this.musicTimer); this.ctx?.close(); }
}
