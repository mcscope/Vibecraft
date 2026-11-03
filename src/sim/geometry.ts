// Small geometry shared across the sim.

/** Squared distance (tiles²) from (x, y) to the nearest point of a building's footprint: 0 inside it. */
export function edgeDist2(b: { ox: number; oy: number; size: number }, x: number, y: number): number {
  const cx = Math.max(b.ox, Math.min(x, b.ox + b.size)), cy = Math.max(b.oy, Math.min(y, b.oy + b.size));
  return (cx - x) ** 2 + (cy - y) ** 2;
}
