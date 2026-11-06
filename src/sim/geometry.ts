// Small geometry shared across the sim.

/** Squared distance (tiles²) from (x, y) to the nearest point of a building's footprint: 0 inside it. */
export function edgeDist2(b: { ox: number; oy: number; size: number }, x: number, y: number): number {
  const cx = Math.max(b.ox, Math.min(x, b.ox + b.size)), cy = Math.max(b.oy, Math.min(y, b.oy + b.size));
  return (cx - x) ** 2 + (cy - y) ** 2;
}

/** The nearest points of two segments, a (a1 → a2) and b (b1 → b2): [ax, ay, bx, by]. */
export function nearestOnSegments(a1x: number, a1y: number, a2x: number, a2y: number, b1x: number, b1y: number, b2x: number, b2y: number): [number, number, number, number] {
  const ux = a2x - a1x, uy = a2y - a1y, vx = b2x - b1x, vy = b2y - b1y, wx = a1x - b1x, wy = a1y - b1y;
  const A = ux * ux + uy * uy, B = ux * vx + uy * vy, C = vx * vx + vy * vy, D = ux * wx + uy * wy, E = vx * wx + vy * wy;
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  let s: number, t: number;
  if (A < 1e-12 && C < 1e-12) { s = 0; t = 0; } // (two points)
  else if (A < 1e-12) { s = 0; t = clamp(E / C); }
  else if (C < 1e-12) { t = 0; s = clamp(-D / A); }
  else {
    const den = A * C - B * B;
    s = den > 1e-12 ? clamp((B * E - C * D) / den) : 0;
    t = (B * s + E) / C;
    if (t < 0) { t = 0; s = clamp(-D / A); } else if (t > 1) { t = 1; s = clamp((B - D) / A); }
  }
  return [a1x + ux * s, a1y + uy * s, b1x + vx * t, b1y + vy * t];
}
