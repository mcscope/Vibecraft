// The sprite budget: how many sprite pixels an army's baked art may hold, in one team's colours. On the GPU a pixel
// costs about a byte compressed (KTX2, scripts/ktx2.mjs) and four bytes baked in the browser, and every pixel is
// baked, packed and uploaded before a game starts. README "Sprite budget" says how to stay inside it.
// Used by `npm run sprites` (scripts/sprites.mjs) and the pre-bake (scripts/prebake.mjs).

/** Sprite pixels (each distinct frame's width × height, summed) an army may hold, and any one unit or building. */
export const SPRITE_BUDGET = { army: 64e6, unit: 20e6 };

const isSprite = (o) => !!o && typeof o === 'object' && 'img' in o && 'sx' in o && 'sw' in o;

/** Every sprite under `o` (a unit's or building's art), each distinct picture (page and place) counted once. */
function sprites(o, out = new Map()) {
  if (isSprite(o)) { out.set(`${o.img}:${o.sx}:${o.sy}`, o.sw * o.sh); return out; }
  if (Array.isArray(o)) for (const v of o) sprites(v, out);
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (k !== 'still') sprites(v, out); // (a still is a copy for portraits, off the GPU)
  return out;
}

/**
 * Packed art (src/art/prebaked.ts) measured: each unit's and building's distinct frames and their pixels, largest
 * first, and the army's total. (Shared pictures, such as a held pose stored once, count once.)
 */
export function spriteReport(art) {
  const rows = [];
  const add = (kind, id, o) => { const m = sprites(o); rows.push({ kind, id, frames: m.size, pixels: [...m.values()].reduce((a, b) => a + b, 0) }); };
  for (const [id, u] of Object.entries(art.units ?? {})) add('unit', id, u);
  for (const [id, b] of Object.entries(art.buildings ?? {})) add('building', id, b);
  add('other', 'flags', [art.flag, art.wantFlag]);
  rows.sort((a, b) => b.pixels - a.pixels);
  const total = rows.reduce((n, r) => n + r.pixels, 0), frames = rows.reduce((n, r) => n + r.frames, 0);
  return { rows, total, frames, over: rows.filter((r) => r.pixels > SPRITE_BUDGET.unit), armyOver: total > SPRITE_BUDGET.army };
}

const M = (px) => `${(px / 1e6).toFixed(1)}M`;

/** The report as a table: one line per unit or building (`top` largest; the rest summed), then the army's total. */
export function formatReport(name, report, top = Infinity) {
  const lines = [`${name}: ${report.frames} frames, ${M(report.total)} sprite pixels of ${M(SPRITE_BUDGET.army)}${report.armyOver ? '  OVER BUDGET' : ''}`];
  lines.push(`  ${'unit or building'.padEnd(24)} ${'frames'.padStart(6)} ${'pixels'.padStart(7)} ${'share'.padStart(5)}`);
  const shown = report.rows.slice(0, top), rest = report.rows.slice(top);
  for (const r of shown) lines.push(`  ${r.id.padEnd(24)} ${String(r.frames).padStart(6)} ${M(r.pixels).padStart(7)} ${`${Math.round((r.pixels / report.total) * 100)}%`.padStart(5)}${r.pixels > SPRITE_BUDGET.unit ? `  OVER ${M(SPRITE_BUDGET.unit)}` : ''}`);
  if (rest.length) lines.push(`  ${`(${rest.length} more)`.padEnd(24)} ${String(rest.reduce((n, r) => n + r.frames, 0)).padStart(6)} ${M(rest.reduce((n, r) => n + r.pixels, 0)).padStart(7)}`);
  return lines.join('\n');
}
