// Dev page: ?mode=sprites&unit=<id>&anim=<anim>[&scale=2][&facing=<0-7>], or ?mode=sprites&faction=<id> for its roster. Bakes one unit and lays out every frame of an
// animation, a row per facing, so its art can be checked (or screenshotted headless) without a fight. &anim=all plays
// every animation at once, stacked, looping at its game speed ([&facing=<0-7>|all]).
import { PLAYABLE } from '../factions';
import { TEAM_COLORS } from '../render/artbank';
import type { ArtAnim, UnitArt } from '../art/contract';

export async function runSpriteSheet(params: URLSearchParams): Promise<void> {
  if (params.get('faction')) return roster(params);
  if (params.get('building') || params.get('bconcept')) return building(params);
  const id = params.get('unit') ?? 'lynx', anim = (params.get('anim') ?? 'attack') as ArtAnim, scale = +(params.get('scale') ?? 2);
  // (&from=wildwelds: which faction's, when two share an id)
  const from = params.get('from');
  const faction = PLAYABLE.find((f) => (!from || f.id === from) && f.units.some((u) => u.id === id));
  const out = document.createElement('div');
  out.style.cssText = 'position:fixed;inset:0;background:#7a8a5a;color:#fff;font:14px sans-serif;padding:8px;overflow:auto;z-index:10';
  document.body.appendChild(out);
  if (!faction?.art) { out.textContent = `no art for ${id}`; return; }
  out.textContent = `baking ${id}…`;
  const art = (await faction.art(TEAM_COLORS[0], undefined, [id])).units[id];
  if (art && anim === ('all' as ArtAnim)) { out.textContent = ''; return playAll(out, art, scale, params.get('facing') ?? '3'); }
  const found = art?.anims[anim];
  if (!found) { out.textContent = `${id} has no '${anim}' (has: ${Object.keys(art?.anims ?? {}).join(', ')})`; return; }
  // &shadows=1: an animation in the air's shadow frames instead (baked alone, laid on the ground by the renderer)
  const a = params.get('shadows') ? { ...found, frames: found.shadows ?? [] } : found;
  if (!a.frames.length) { out.textContent = `${id} '${anim}' has no shadow frames`; return; }
  const facing = params.get('facing');
  if (facing !== null) a.frames.splice(0, a.frames.length, a.frames[+facing % a.frames.length]);
  // &frames=1: only that many frames of each facing (one: a still, for contact sheets)
  const keep = +(params.get('frames') ?? 0);
  if (keep > 0) a.frames.splice(0, a.frames.length, ...a.frames.map((row) => row.slice(0, keep)));
  // &turn=4: a turn-around, that many facings side by side (one frame each)
  const turn = +(params.get('turn') ?? 0);
  if (turn > 0) { const all = a.frames, step = Math.max(1, Math.round(all.length / turn)); a.frames.splice(0, all.length, all.filter((_, i) => i % step === 0).map((row) => row[0])); }
  const cell = Math.max(...a.frames.flat().map((s) => Math.max(s.sw, s.sh) / s.q)) * scale * (turn > 0 ? 1.7 : 1); // (a turn-around: room for a wide body either side)
  const cols = Math.max(...a.frames.map((f) => f.length));
  const c = document.createElement('canvas');
  c.width = cols * cell; c.height = a.frames.length * cell;
  const g = c.getContext('2d')!;
  a.frames.forEach((row, fi) => row.forEach((s, i) => {
    const k = scale / s.q, x = i * cell + cell / 2, y = fi * cell + cell * 0.8; // feet near the bottom of the cell
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.strokeRect(i * cell, fi * cell, cell, cell);
    g.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, x - s.ax * k, y - s.ay * k, s.sw * k, s.sh * k);
  }));
  out.textContent = `${id} · ${anim} · ${a.frames.length} facings × ${cols} frames${found.stride ? ` · stride ${found.stride.toFixed(2)} units a loop` : ''}`;
  out.appendChild(document.createElement('br'));
  out.appendChild(c);
  document.title = 'sprites ready';
}

/** ?mode=sprites&faction=<id>[&facing=2][&scale=2]: every unit of a faction standing side by side, true to scale, named. */
async function roster(params: URLSearchParams): Promise<void> {
  const faction = PLAYABLE.find((f) => f.id === params.get('faction'));
  const facing = +(params.get('facing') ?? 2), scale = +(params.get('scale') ?? 2);
  document.body.style.background = '#5f7440';
  if (!faction?.art) return;
  const art = await faction.art(TEAM_COLORS[0], undefined, faction.units.map((u) => u.id));
  const units = faction.units.filter((u) => art.units[u.id]);
  const frames = units.map((u) => { const f = art.units[u.id].anims.idle.frames; return f[facing % f.length][0]; });
  const w = frames.map((s) => Math.max(130, (s.sw / s.q) * scale + 24)), h = Math.max(...frames.map((s) => (s.sh / s.q) * scale)) + 56;
  const c = document.createElement('canvas');
  c.width = w.reduce((a, b) => a + b, 0) + 24; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5f7440'; g.fillRect(0, 0, c.width, c.height);
  g.font = '600 15px Georgia, serif'; g.textAlign = 'center';
  let x = 24;
  frames.forEach((s, i) => {
    const k = scale / s.q, cx = x + (w[i] - 24) / 2, foot = h - 40;
    g.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, cx - s.ax * k, foot - s.ay * k, s.sw * k, s.sh * k);
    g.fillStyle = '#f3e7c4'; g.fillText(units[i].name, cx, h - 14);
    x += w[i];
  });
  scroller().appendChild(c); // (wider or taller than the window: it scrolls)
  document.title = 'sprites ready';
}

/** Animations played once through (each blow, a death, a hatching): replayed after a pause. */
const ONCE = new Set(['attack', 'die', 'rise', 'reload', 'lay', 'give', 'slam', 'hatch', 'cut']);

/** Every animation of a unit at once, a row each, looping as the game plays them (one facing, or all 8 side by side). */
function playAll(out: HTMLElement, art: UnitArt, scale: number, facing: string): void {
  const names = Object.keys(art.anims) as ArtAnim[];
  const facings = facing === 'all' ? [0, 1, 2, 3, 4, 5, 6, 7] : [+facing];
  const size = (n: ArtAnim) => art.anims[n]!.frames.flat().reduce((m, s) => [Math.max(m[0], (s.sw / s.q) * scale), Math.max(m[1], (s.sh / s.q) * scale)], [0, 0]);
  const cellW = Math.max(...names.map((n) => size(n)[0])) + 16, rowH = names.map((n) => size(n)[1] + 20), label = 90;
  const c = document.createElement('canvas');
  c.width = label + cellW * facings.length; c.height = rowH.reduce((a, b) => a + b, 0) + 10;
  out.appendChild(c);
  const g = c.getContext('2d')!;
  document.title = 'sprites ready';
  const draw = (now: number) => {
    const t = now / 1000;
    g.clearRect(0, 0, c.width, c.height);
    g.font = '13px sans-serif';
    let y = 0;
    names.forEach((n, ri) => {
      const a = art.anims[n]!, h = rowH[ri], ground = y + h - 12;
      g.fillStyle = '#fff'; g.fillText(n, 6, ground - 4);
      g.strokeStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.moveTo(label, ground); g.lineTo(c.width, ground); g.stroke();
      facings.forEach((f, ci) => {
        const row = a.frames[f % a.frames.length], k = row.length;
        // (a blow plays over its swing, 0.45 s; anything else once through takes a second; then a pause)
        const dur = n === 'attack' ? 0.45 : 1, i = ONCE.has(n) ? Math.min(k - 1, Math.floor(((t % (dur + 0.7)) / dur) * k)) : Math.floor(t * (a.fps ?? 8)) % k;
        const s = row[i], q = scale / s.q, x = label + ci * cellW + cellW / 2;
        g.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, x - s.ax * q, ground - s.ay * q, s.sw * q, s.sh * q);
      });
      y += h;
    });
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

/** ?mode=sprites&building=<id>[&scale=2]: a building's art, built up complete, damaged, then its construction stages, side by side. */
async function building(params: URLSearchParams): Promise<void> {
  const id = params.get('building'), concept = params.get('bconcept'), scale = +(params.get('scale') ?? 1.5);
  // (&bconcept=<name>: a design option instead, baked straight from its model: wildwelds/concepts.ts)
  const spec = concept
    ? (await import('../factions/wildwelds/concepts')).WEB_CONCEPTS[concept]
    : (PLAYABLE.find((f) => f.buildings?.some((b) => b.id === id))?.buildings?.find((b) => b.id === id) as unknown as { model: import('../kits/bake3d/types').BuildingModel; size: number } | undefined);
  if (!spec) return;
  const { Baker } = await import('../kits/bake3d/baker');
  const baker = new Baker();
  const b = baker.bakeBuilding(spec.model, spec.size, TEAM_COLORS[0]);
  // (&line=N: N pieces laid in an L along both of the map's axes, as the game places them, back to front on its tile grid)
  const line = +(params.get('line') ?? 0);
  if (line > 0) {
    const tiles: Array<[number, number]> = [];
    for (let i = 0; i < line; i++) tiles.push([i * spec.size, 0]);
    for (let i = 1; i < line; i++) tiles.push([0, i * spec.size]);
    tiles.sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
    const s = b.complete, iso = (x: number, y: number): [number, number] => [(x - y) * 32 * scale, (x + y) * 16 * scale];
    const span = line * spec.size, pad = (s.sh / s.q) * scale + 40;
    const c = document.createElement('canvas');
    c.width = Math.ceil(span * 64 * scale + 160); c.height = Math.ceil(span * 32 * scale + pad + 40);
    const ox = c.width / 2, oy = pad;
    const g = c.getContext('2d')!;
    g.fillStyle = '#5f7440'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i <= span; i++) for (const [a, z] of [[[i, 0], [i, span]], [[0, i], [span, i]]] as const) {
      const [x0, y0] = iso(a[0], a[1]), [x1, y1] = iso(z[0], z[1]);
      g.beginPath(); g.moveTo(ox + x0, oy + y0); g.lineTo(ox + x1, oy + y1); g.stroke();
    }
    // each piece joined to the neighbours it has (bits: 1 +x, 2 −x, 4 +y, 8 −y; a model's +z is the map's +y)
    const has = (x: number, y: number) => tiles.some(([a, c]) => a === x && c === y), n = spec.size, joined = new Map<number, typeof s>();
    for (const [tx, ty] of tiles) {
      const m = (has(tx + n, ty) ? 1 : 0) | (has(tx - n, ty) ? 2 : 0) | (has(tx, ty + n) ? 4 : 0) | (has(tx, ty - n) ? 8 : 0);
      if (!joined.has(m)) joined.set(m, baker.bakeStatic((mb) => spec.model(mb, { phase: 'complete', level: 0, joins: m }), TEAM_COLORS[0], true, {}, n * Math.SQRT2 + 1.1));
      const sj = joined.get(m)!, kj = scale / sj.q, [x, y] = iso(tx + n / 2, ty + n / 2);
      g.drawImage(sj.img, sj.sx, sj.sy, sj.sw, sj.sh, ox + x - sj.ax * kj, oy + y - sj.ay * kj, sj.sw * kj, sj.sh * kj);
    }
    baker.dispose();
    scroller().appendChild(c);
    document.title = 'sprites ready';
    return;
  }
  baker.dispose();
  const sprites = [b.complete, ...b.damaged, ...b.construction]; // (finished first)
  const w = sprites.map((s) => (s.sw / s.q) * scale + 30), h = Math.max(...sprites.map((s) => (s.sh / s.q) * scale)) + 30;
  const c = document.createElement('canvas');
  c.width = w.reduce((a, x) => a + x, 0); c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5f7440'; g.fillRect(0, 0, c.width, c.height);
  let x = 0;
  sprites.forEach((s, i) => { const k = scale / s.q; g.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, x + w[i] / 2 - s.ax * k, h - 15 - s.ay * k, s.sw * k, s.sh * k); x += w[i]; });
  scroller().appendChild(c); // (wider or taller than the window: it scrolls)
  document.title = 'sprites ready';
}

/** A full-window box that scrolls, over the game, to lay a sheet out in whole however big it is. */
function scroller(): HTMLElement {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;overflow:auto;z-index:10;background:#5f7440';
  document.body.appendChild(box);
  return box;
}
