// Deterministic lockstep, Age-of-Empires style.
//
// Every player sends one bundle of commands per tick, scheduled `inputDelay`
// ticks in the future. A client only advances tick T once it holds every
// player's bundle for T. Since the sim is deterministic, all clients stay in
// sync by exchanging only commands. Hashes ride along for desync detection.
//
// For local play, LoopbackTransport delivers instantly. A WebSocket/WebRTC
// transport just needs to implement `Transport`.

import type { Command, PlayerCommand } from '../sim/commands';
import type { World } from '../sim/world';

export interface TickBundle {
  tick: number;
  player: number;
  commands: Command[];
  /** World hash at the tick this bundle was produced, for desync checks. */
  hash?: number;
  hashTick?: number;
}

export interface Transport {
  send(bundle: TickBundle): void;
  onMessage(cb: (bundle: TickBundle) => void): void;
}

export class LoopbackTransport implements Transport {
  private cbs: Array<(b: TickBundle) => void> = [];
  send(bundle: TickBundle): void {
    for (const cb of this.cbs) cb(bundle);
  }
  onMessage(cb: (b: TickBundle) => void): void {
    this.cbs.push(cb);
  }
}

/** Something that produces commands for a player each tick (human input buffer, AI...). */
export interface CommandSource {
  readonly player: number;
  poll(world: World): Command[];
}

export class Lockstep {
  private bundles = new Map<number, Map<number, TickBundle>>();
  private sentThrough = -1;
  private hashes = new Map<number, Map<number, number>>();
  onDesync?: (tick: number, hashes: Map<number, number>) => void;

  constructor(
    readonly world: World,
    private readonly sources: CommandSource[],
    private readonly allPlayers: number[],
    private readonly transport: Transport,
    readonly inputDelay = 3,
  ) {
    transport.onMessage((b) => this.receive(b));
  }

  private receive(b: TickBundle): void {
    let m = this.bundles.get(b.tick);
    if (!m) this.bundles.set(b.tick, (m = new Map()));
    m.set(b.player, b);
    if (b.hash !== undefined && b.hashTick !== undefined) {
      let h = this.hashes.get(b.hashTick);
      if (!h) this.hashes.set(b.hashTick, (h = new Map()));
      h.set(b.player, b.hash);
      if (h.size === this.allPlayers.length) {
        const vals = new Set(h.values());
        if (vals.size > 1) this.onDesync?.(b.hashTick, h);
        this.hashes.delete(b.hashTick);
      }
    }
  }

  /** Advance one tick if every player's commands for it have arrived. */
  tryStep(): boolean {
    const w = this.world;
    const target = w.tick + this.inputDelay;
    if (this.sentThrough < target) {
      const hashNow = w.tick % 20 === 0;
      const h = hashNow ? w.hash() : undefined;
      for (const src of this.sources) {
        this.transport.send({ tick: target, player: src.player, commands: src.poll(w), hash: h, hashTick: hashNow ? w.tick : undefined });
      }
      this.sentThrough = target;
    }
    const t = w.tick;
    let cmds: PlayerCommand[] = [];
    if (t >= this.inputDelay) {
      const m = this.bundles.get(t);
      if (!m || m.size < this.allPlayers.length) return false; // waiting on the network
      for (const p of this.allPlayers) for (const cmd of m.get(p)!.commands) cmds.push({ player: p, cmd });
      this.bundles.delete(t);
    }
    w.step(cmds);
    return true;
  }
}

/** Buffers commands from the local human's mouse/keyboard until the next bundle. */
export class LocalInput implements CommandSource {
  private buf: Command[] = [];
  constructor(readonly player: number) {}
  issue(cmd: Command): void {
    this.buf.push(cmd);
  }
  poll(): Command[] {
    const out = this.buf;
    this.buf = [];
    return out;
  }
}
