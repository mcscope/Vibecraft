// Deterministic PRNG (mulberry32). The simulation must never call Math.random:
// every client in a lockstep game has to roll the same dice.
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
  int(lo: number, hiExclusive: number): number {
    return lo + Math.floor(this.next() * (hiExclusive - lo));
  }
  state(): number {
    return this.s;
  }
}
