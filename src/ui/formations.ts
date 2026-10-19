// Formations: where each unit of a group stands when it's sent somewhere, and which way it faces. Worked out on the
// client and sent as ordinary moves (one per unit, with a facing), so the sim knows nothing of formations.
//
// Spears and other strikers take the front ranks, throwers (and anyone unarmed) the back; in a square the
// fighters make the walls, facing out, and the throwers stand inside.

export type Formation = 'block' | 'loose' | 'line' | 'flank' | 'square';

export const FORMATIONS: Array<{ id: Formation; name: string; tip: string }> = [
  { id: 'block', name: 'Block', tip: 'Block: tight ranks, spears and strikers in front, throwers behind.' },
  { id: 'loose', name: 'Loose', tip: 'Loose block: the same ranks with room between: harder to crush in a charge, easier to slip through.' },
  { id: 'line', name: 'Line', tip: 'Line: two ranks, wide: every weapon reaches the enemy at once.' },
  { id: 'flank', name: 'Flank', tip: 'Flank: two blocks with a gap between, angled in: send them at the enemy and they hit it from both sides.' },
  { id: 'square', name: 'Square', tip: 'Square: fighters make four walls facing out, throwers inside. Nowhere to charge in from behind.' },
];

/** A unit to place: where it is now, its size, and its place in the order (0 shafts, 1 other strikers, 2 throwers and the unarmed). */
export interface FormationUnit { id: number; x: number; y: number; radius: number; role: 0 | 1 | 2 }
/** A unit as a formation sees it: shafts lead, then other strikers, then throwers and the unarmed. */
export const formationUnit = (u: { id: number; x: number; y: number; throws: boolean; stats: { radius: number; canAttack: boolean; canPlant: boolean } }): FormationUnit =>
  ({ id: u.id, x: u.x, y: u.y, radius: u.stats.radius, role: !u.stats.canAttack || u.throws ? 2 : u.stats.canPlant ? 0 : 1 });

/** Where a unit goes, and the way it faces there (radians, map space). */
export interface Slot { id: number; x: number; y: number; face: number }

/**
 * Slots for `units` in formation `kind`, centred on (cx, cy) with its front facing `angle`. `width` (tiles), if
 * given, is how wide the front should be (a dragged line); otherwise each formation picks its own shape.
 */
export function formationSlots(kind: Formation, units: FormationUnit[], cx: number, cy: number, angle: number, width?: number): Slot[] {
  const n = units.length;
  if (!n) return [];
  const fx = Math.cos(angle), fy = Math.sin(angle), rx = -fy, ry = fx; // forward and across (to the right)
  const at = (a: number, f: number, face = angle): Omit<Slot, 'id'> => ({ x: cx + rx * a + fx * f, y: cy + ry * a + fy * f, face });
  const gap = 2 * Math.max(...units.map((u) => u.radius)) + 0.3;
  // the group's own spread, across and along the new front: units keep their side, so nobody crosses over
  const mx = units.reduce((t, u) => t + u.x, 0) / n, my = units.reduce((t, u) => t + u.y, 0) / n;
  const across = (u: FormationUnit) => (u.x - mx) * rx + (u.y - my) * ry;
  const order = [...units].sort((a, b) => a.role - b.role || a.id - b.id);

  if (kind === 'square' && n >= 6) {
    // walls of fighters (throwers only if there aren't enough) round a core of throwers
    const outer = order.filter((u) => u.role < 2), inner = order.filter((u) => u.role === 2);
    while (outer.length < Math.min(n, 8) && inner.length) outer.push(inner.shift()!);
    // big enough round for its walls, and for the throwers' block inside with a gap all round
    const innerCols = Math.max(1, Math.ceil(Math.sqrt(inner.length))), innerRows = Math.ceil(inner.length / innerCols);
    const side = Math.max(2, Math.ceil(outer.length / 4) + 1, inner.length ? Math.max(innerCols, innerRows) + 2 : 0);
    const half = ((side - 1) * gap) / 2, perim = 8 * half;
    const ring: Array<Omit<Slot, 'id'>> = outer.map((_, i) => {
      // evenly round the walls, starting at the front-left corner; each faces out of its wall
      const s = (i / outer.length) * perim, wall = Math.min(3, Math.floor(s / (2 * half))), t = s - wall * 2 * half - half;
      const [a, f, out] = wall === 0 ? [t, half, 0] : wall === 1 ? [half, -t, Math.PI / 2] : wall === 2 ? [-t, -half, Math.PI] : [-half, t, -Math.PI / 2];
      return at(a, f, angle + out);
    });
    // match units to wall spots by bearing from the middle, so each walks to the side it's already on
    const bearing = (x: number, y: number, ox: number, oy: number) => Math.atan2((y - oy) * fx - (x - ox) * fy, (x - ox) * fx + (y - oy) * fy);
    const byBearing = (list: Array<{ x: number; y: number }>, ox: number, oy: number) => list.map((p, i) => [bearing(p.x, p.y, ox, oy), i] as const).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    const us = byBearing(outer, mx, my), ss = byBearing(ring, cx, cy);
    const slots: Slot[] = us.map((ui, k) => ({ id: outer[ui].id, ...ring[ss[k]] }));
    return slots.concat(ranks(inner, innerCols, gap, at, across));
  }
  if (kind === 'flank' && n >= 2) {
    // two blocks either side of the spot, a gap between them, each turned a little inward: the enemy goes in the middle
    const cols = Math.max(1, Math.ceil(Math.sqrt(Math.ceil(n / 2) * 1.5))), half = ((cols - 1) * gap) / 2, apart = half + gap + 2.5;
    const side = (us: FormationUnit[], dir: -1 | 1): Slot[] => {
      const turn = -dir * 0.35, a2 = angle + turn; // angled in toward the middle
      const ox = cx + rx * apart * dir, oy = cy + ry * apart * dir;
      const at2 = (a: number, f: number): Omit<Slot, 'id'> => ({ x: ox + -Math.sin(a2) * a + Math.cos(a2) * f, y: oy + Math.cos(a2) * a + Math.sin(a2) * f, face: a2 });
      return ranks(us, cols, gap, at2, across);
    };
    // each block gets its share of every role, from the units already on its side
    const leftIds = new Set<number>();
    for (const r of [0, 1, 2]) {
      const mine = order.filter((u) => u.role === r).sort((a, b) => across(a) - across(b));
      mine.slice(0, Math.ceil(mine.length / 2)).forEach((u) => leftIds.add(u.id));
    }
    return side(order.filter((u) => leftIds.has(u.id)), -1).concat(side(order.filter((u) => !leftIds.has(u.id)), 1));
  }
  const loose = kind === 'loose', g = loose ? gap * 2 : gap;
  let cols = width !== undefined ? Math.round(width / g) + 1
    : kind === 'line' ? Math.ceil(n / 2)
    : Math.ceil(Math.sqrt(n * 2)); // a block is about twice as wide as it is deep
  cols = Math.max(1, Math.min(n, cols));
  return ranks(order, cols, g, at, across);
}

/**
 * Units in ranks of `cols`, front rank first (the order given), centred on the middle; within a rank, each takes the
 * spot on its own side.
 */
function ranks(units: FormationUnit[], cols: number, g: number, at: (a: number, f: number) => Omit<Slot, 'id'>, across: (u: FormationUnit) => number): Slot[] {
  const rows = Math.ceil(units.length / cols), out: Slot[] = [];
  const halfW = ((cols - 1) * g) / 2;
  for (let r = 0; r < rows; r++) {
    const rank = units.slice(r * cols, (r + 1) * cols).sort((a, b) => across(a) - across(b));
    const off = ((cols - rank.length) * g) / 2; // a short last rank stands in the middle
    rank.forEach((u, c) => {
      const a = -halfW + off + c * g;
      const f = ((rows - 1) / 2 - r) * g;
      out.push({ id: u.id, ...at(a, f) });
    });
  }
  return out;
}
