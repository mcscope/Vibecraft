// Client side of scripts/relay.mjs: join a room, see who's there, message them.
import type { TickBundle, Transport } from './lockstep';

export interface Peer { id: number; name: string }

export class RelayClient {
  you = -1;
  peers: Peer[] = [];
  onPeers?: (peers: Peer[]) => void;
  onMessage?: (from: number, data: unknown) => void;
  onClose?: () => void;
  private constructor(private readonly ws: WebSocket) {}

  static connect(url: string, room: string, name: string, timeoutMs = 6000): Promise<RelayClient> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch (e) { reject(e); return; }
      const c = new RelayClient(ws);
      const timer = setTimeout(() => { ws.close(); reject(new Error(`no answer from ${url}`)); }, timeoutMs);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'join', room, name }));
      ws.onerror = () => { clearTimeout(timer); reject(new Error(`can't reach the relay at ${url}`)); };
      ws.onclose = () => c.onClose?.();
      ws.onmessage = (e) => {
        let m: { t: string; you?: number; peers?: Peer[]; from?: number; data?: unknown };
        try { m = JSON.parse(String(e.data)); } catch { return; }
        if (m.t === 'joined') { c.you = m.you!; clearTimeout(timer); resolve(c); }
        else if (m.t === 'peers') { c.peers = m.peers ?? []; c.onPeers?.(c.peers); }
        else if (m.t === 'msg') c.onMessage?.(m.from!, m.data);
      };
    });
  }

  /** To everyone else in the room, or one peer. */
  send(data: unknown, to?: number): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'msg', data, to }));
  }
  close(): void { this.ws.close(); }
}

/** Lockstep transport over the relay: our bundles go to us at once and to everyone else via the relay. */
export class NetTransport implements Transport {
  private cbs: Array<(b: TickBundle) => void> = [];
  /** Ticks that arrive while we're still loading (the other side may start first). */
  private early: TickBundle[] = [];
  constructor(private readonly relay: RelayClient) {
    const prev = relay.onMessage;
    relay.onMessage = (from, data) => {
      const d = data as { k?: string; b?: TickBundle };
      if (d?.k === 'tick' && d.b) this.deliver(d.b);
      else prev?.(from, data);
    };
  }
  private deliver(b: TickBundle): void {
    if (!this.cbs.length) { this.early.push(b); return; }
    for (const cb of this.cbs) cb(b);
  }
  send(bundle: TickBundle): void {
    this.deliver(bundle);
    this.relay.send({ k: 'tick', b: bundle });
  }
  onMessage(cb: (b: TickBundle) => void): void {
    this.cbs.push(cb);
    const held = this.early;
    this.early = [];
    for (const b of held) cb(b);
  }
}
