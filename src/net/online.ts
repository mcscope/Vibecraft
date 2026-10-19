// Starting an online game: the host picks the seed and seats, everyone bakes
// and sends their own faction as a bundle, and the game begins once every seat's
// faction has arrived and passed the checks.
import type { FactionArt, BiomeArt } from '../art/contract';
import type { FactionSpec } from '../factions/types';
import { TEAM_COLORS } from '../render/artbank';
import { checkBundle, fromBundle, packArt, packBiome, specData, type FactionBundle } from './bundle';
import type { RelayClient } from './relayClient';

/** Online games are 1v1 (the skirmish map has two starts). */
export const SEATS = 2;

export interface OnlineGame { seed: number; map: string; me: number; names: string[]; factions: FactionSpec[]; relay: RelayClient }

type Msg =
  | { k: 'start'; seed: number; map?: string; seats: number[]; names: string[] }
  | { k: 'bundle'; seat: number; bundle: FactionBundle }
  | { k: 'reject'; seat: number; errors: string[] };

/**
 * Wait for the host's start (or send it, if we're the host and `start` is called),
 * then swap faction bundles. Resolves with everything needed to build the World.
 */
export class Handshake {
  private bundles = new Map<number, FactionBundle>();
  private began: { seed: number; map?: string; seats: number[]; names: string[] } | null = null;
  private resolve!: (g: OnlineGame) => void;
  private reject!: (e: Error) => void;
  readonly done: Promise<OnlineGame>;
  private ownArt?: FactionArt;
  private ownBiome?: BiomeArt;

  constructor(private readonly relay: RelayClient, private readonly local: FactionSpec, private readonly status: (text: string) => void) {
    this.done = new Promise((res, rej) => { this.resolve = res; this.reject = rej; });
    relay.onMessage = (_from, data) => this.receive(data as Msg);
  }

  get started(): boolean { return !!this.began; }

  /** Host only: seat the first two players and go, on `map`. */
  start(map: string): void {
    const seats = this.relay.peers.slice(0, SEATS);
    if (seats.length < SEATS) return;
    // seed choice happens outside the sim, so Math.random is fine
    const msg: Msg = { k: 'start', seed: Math.floor(Math.random() * 1e9), map, seats: seats.map((p) => p.id), names: seats.map((p) => p.name) };
    this.relay.send(msg);
    void this.begin(msg);
  }

  private receive(m: Msg): void {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'start' && !this.began) void this.begin(m);
    else if (m.k === 'bundle' && Number.isInteger(m.seat)) { this.bundles.set(m.seat, m.bundle); this.check(); }
    else if (m.k === 'reject') this.reject(new Error(`${this.began?.names[m.seat] ?? 'A player'}'s game rejected a faction: ${m.errors.slice(0, 3).join('; ')}`));
  }

  private async begin(m: { seed: number; map?: string; seats: number[]; names: string[] }): Promise<void> {
    this.began = m;
    const me = m.seats.indexOf(this.relay.you);
    if (me < 0) { this.reject(new Error('This game is full (online games are 1v1).')); return; }
    try {
      // bake our own faction here, with our own code, in our seat's colours; then send it as data
      this.status(`Baking ${this.local.name} for seat ${me + 1}…`);
      const team = TEAM_COLORS[me % TEAM_COLORS.length];
      this.ownArt = this.local.art ? await this.local.art(team, (f, label) => this.status(`${label} (${Math.round(f * 100)}%)`)) : undefined;
      this.ownBiome = this.local.biome ? await this.local.biome((f, label) => this.status(`${label} (${Math.round(f * 100)}%)`)) : undefined;
      this.status('Packing your faction…');
      const bundle: FactionBundle = { v: 1, spec: specData(this.local), art: this.ownArt && packArt(this.ownArt), biome: this.ownBiome && packBiome(this.ownBiome) };
      this.status(`Sending your faction (${(JSON.stringify(bundle).length / 1e6).toFixed(1)} MB)…`);
      this.relay.send({ k: 'bundle', seat: me, bundle } satisfies Msg);
      this.bundles.set(me, bundle);
      this.check();
    } catch (e) { this.reject(e as Error); }
  }

  private check(): void {
    const m = this.began;
    if (!m || this.bundles.size < m.seats.length) {
      if (m) this.status(`Waiting for ${m.names.filter((_, i) => !this.bundles.has(i)).join(', ')}'s faction…`);
      return;
    }
    const me = m.seats.indexOf(this.relay.you);
    const factions: FactionSpec[] = [];
    for (let seat = 0; seat < m.seats.length; seat++) {
      const b = this.bundles.get(seat)!;
      if (seat !== me) {
        const errors = checkBundle(b, (b.art?.images.join('').length ?? 0) + (b.biome?.images.join('').length ?? 0));
        if (errors.length) {
          this.relay.send({ k: 'reject', seat: me, errors } satisfies Msg);
          this.reject(new Error(`${m.names[seat]}'s faction didn't pass the checks: ${errors.slice(0, 3).join('; ')}`));
          return;
        }
      }
      // everyone plays the same spec data (the bundle's); our own art is the one we just baked
      factions.push(seat === me
        ? fromBundle(b, { ...this.local, art: this.ownArt && (() => Promise.resolve(this.ownArt!)), biome: this.ownBiome && (() => Promise.resolve(this.ownBiome!)) })
        : fromBundle(b));
    }
    this.resolve({ seed: m.seed, map: typeof m.map === 'string' ? m.map : 'woodlands', me, names: m.names, factions, relay: this.relay });
  }
}

