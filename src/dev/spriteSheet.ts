// Dev page: ?mode=sprites&unit=<id>&anim=<anim>[&scale=2][&facing=<0-7>], or ?mode=sprites&faction=<id> for its roster. Bakes one unit and lays out every frame of an
// animation, a row per facing, so its art can be checked (or screenshotted headless) without a fight. &anim=all plays
// every animation at once, stacked, looping at its game speed ([&facing=<0-7>|all]).
import { PLAYABLE } from '../factions';
import { TEAM_COLORS } from '../render/artbank';
import type { ArtAnim, Sprite, TeamColors, UnitArt } from '../art/contract';
import type { BandCandidate, FactionSpec, UnitSpec } from '../factions/types';
import type { UnitBakeOptions } from '../kits/bake3d/baker';
import type { UnitModel } from '../kits/bake3d/types';
import { draftable } from '../sim/battle';

/** &team=<0-3>: which side's colours to bake in (the first, blue, by default). */
const teamOf = (params: URLSearchParams) => TEAM_COLORS[+(params.get('team') ?? 0) % TEAM_COLORS.length];

export async function runSpriteSheet(params: URLSearchParams): Promise<void> {
  if (params.get('teams')) return teamsPage(params);
  if (params.get('game')) return (await import('./gameBand')).runGameBand(params); // (the whole game's band pictures)
  if (params.get('faction') && params.get('pose')) return pose(params);
  if (params.get('faction')) return roster(params);
  if (params.get('tunnels')) return tunnels(params.get('tunnels')!, Number(params.get('frames') ?? 30));
  if (params.get('concepts')) return gallery(params.get('concepts')!);
  if (params.get('joins')) return joinsPage(params.get('joins')!);
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
  const art = (await faction.art(teamOf(params), undefined, [id])).units[id];
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
  const art = await faction.art(teamOf(params), undefined, faction.units.map((u) => u.id));
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

/**
 * ?mode=sprites&faction=<id>&pose=1[&team=0][&take=<n>]: its band.ts picture (BandCandidate, src/dev/bandScene.ts), or else the faction's fighters posed like a band on an album cover, for the
 * front page's army cards (scripts/bands.mjs saves it). One scale for all, as in the game: the biggest stand at the
 * back in the middle, the smaller in a crescent in front, in twos and threes when small, turned in toward the middle,
 * every other one mid-blow; fliers in the air above, their shadows on the ground.
 */
async function pose(params: URLSearchParams): Promise<void> {
  const faction = PLAYABLE.find((f) => f.id === params.get('faction'));
  if (!faction?.art) return;
  const team = teamOf(params), W = 960, H = 720, HORIZON = H * 0.5;
  // a faction that stages its own picture (its band.ts): that, shot in 3D
  const m = await BAND_MODULES[`../factions/${faction.id}/band.ts`]?.(), take = +(params.get('take') ?? m?.pick ?? 1);
  const staged = m?.bands?.[take - 1];
  if (params.get('take') && !staged) { document.title = 'sprites ready: none'; return; } // (no such candidate)
  if (staged && staged !== 'line-up') {
    const { renderBand } = await import('./bandScene');
    const c = renderBand([{ f: faction, team, opts: (await ART_MODULES[`../factions/${faction.id}/art.ts`]?.())?.bakeOpts }], staged, W, H);
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:20';
    document.body.appendChild(c);
    document.body.dataset.label = staged.name ?? ''; // (for the review sheet)
    document.title = 'sprites ready';
    return;
  }
  const art = await sharpArt(faction, team, draftable(faction), +(params.get('q') ?? 4.5));
  const cast = draftable(faction).filter((u) => art.units[u.id]);
  const still = (id: string) => art.units[id].still ?? art.units[id].anims.idle.frames[1 % art.units[id].anims.idle.frames.length][0];
  const tall = (id: string) => still(id).ay / still(id).q, wide = (id: string) => Math.min(still(id).sw, 2 * still(id).ax) / still(id).q; // (its body's: a baked shadow falls off to one side)
  // a flier no taller than the biggest of the rest takes to the air; a bigger one stands with them
  const tallestWalker = Math.max(...cast.filter((u) => !u.flight).map((u) => tall(u.id)));
  const fliers = cast.filter((u) => u.flight && art.units[u.id].anims.fly && tall(u.id) <= tallestWalker), walkers = cast.filter((u) => !fliers.includes(u)).sort((a, b) => tall(b.id) - tall(a.id));
  if (!walkers.length) return;
  const top = tall(walkers[0].id);
  // the big at the back; the rest in front, in two ranks when there are many; a small one comes with friends
  const back = walkers.filter((u) => tall(u.id) >= top * 0.6), rest = walkers.filter((u) => !back.includes(u));
  const friends = (u: UnitSpec) => (wide(u.id) > top * 0.4 ? 1 : Math.max(1, Math.min(3, Math.round((top * 0.45) / tall(u.id)))));
  const count = (us: UnitSpec[]) => us.reduce((n, u) => n + friends(u), 0), mid = rest.filter((u) => tall(u.id) >= top * 0.33), low = rest.filter((u) => !mid.includes(u));
  const ranks = count(rest) > 5 && count(mid) > 1 && count(low) > 1 ? [mid, low] : [rest];
  const rows = [back, ...ranks].filter((r) => r.length).map((tier, ri) => {
    const order: UnitSpec[] = [];
    tier.forEach((u, i) => {
      for (let j = 0; j < (ri === 0 ? 1 : friends(u)); j++) ((i + j) % 2 ? order.unshift(u) : order.push(u)); // (the tallest in the middle, the rest out to either side in turn)
    });
    return order;
  });
  const depth = (ri: number) => (rows.length > 1 ? ri / (rows.length - 1) : 0); // 0 the back row, 1 the front
  const near = (ri: number) => 1 + 0.15 * depth(ri); // the front a little nearer the camera
  // a row spreads out across the picture, wider toward the front; never so tight they stand inside each other
  const packed = (row: UnitSpec[]) => row.reduce((a, u) => a + wide(u.id) * 0.75, 0);
  const span = (row: UnitSpec[], ri: number, k: number) => (row.length < 2 ? 0 : Math.max(packed(row) * k, Math.min(W * (0.5 + 0.4 * depth(ri)), packed(row) * k * 1.8)));
  // as big as fits: the tallest half the picture's height, every row inside its width
  const scale = Math.min((H * 0.5) / top, ...rows.map((row, ri) => (W * 0.92) / (packed(row) * near(ri))));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:20';
  const g = c.getContext('2d')!;
  // a lit stage: a warm sky with the team's colour glowing behind the band, sunlit grass, a pool of light under them
  const sky = g.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, '#26303d'); sky.addColorStop(0.6, '#6c6a63'); sky.addColorStop(1, '#e2c58c');
  g.fillStyle = sky; g.fillRect(0, 0, W, HORIZON);
  const glow = g.createRadialGradient(W / 2, HORIZON * 0.75, 0, W / 2, HORIZON * 0.75, W * 0.5);
  glow.addColorStop(0, team.primary); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 0.55; g.fillStyle = glow; g.fillRect(0, 0, W, HORIZON); g.globalAlpha = 1;
  const grass = g.createLinearGradient(0, HORIZON, 0, H);
  grass.addColorStop(0, '#9aa067'); grass.addColorStop(0.25, '#6f7d45'); grass.addColorStop(1, '#3b4627');
  g.fillStyle = grass; g.fillRect(0, HORIZON, W, H - HORIZON);
  const haze = g.createLinearGradient(0, HORIZON - H * 0.08, 0, HORIZON + H * 0.1); // (a soft horizon)
  haze.addColorStop(0, 'rgba(226,197,140,0)'); haze.addColorStop(0.45, 'rgba(226,197,140,0.5)'); haze.addColorStop(1, 'rgba(226,197,140,0)');
  g.fillStyle = haze; g.fillRect(0, HORIZON - H * 0.08, W, H * 0.18);
  g.save(); g.translate(W / 2, H * 0.78); g.scale(1, 0.3);
  const pool = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.55);
  pool.addColorStop(0, 'rgba(236,226,170,0.45)'); pool.addColorStop(1, 'rgba(236,226,170,0)');
  g.fillStyle = pool; g.beginPath(); g.arc(0, 0, W * 0.55, 0, Math.PI * 2); g.fill(); g.restore();
  // where everyone stands, back row first; a crescent: the ends of a row a little further back
  const spots: Array<{ u: UnitSpec; x: number; y: number; k: number; blow: boolean }> = [];
  rows.forEach((row, ri) => {
    const k = scale * near(ri), sp = span(row, ri, k), feet = H * (0.62 + 0.29 * depth(ri));
    row.forEach((u, i) => {
      const x = W / 2 + (row.length < 2 ? 0 : (i / (row.length - 1) - 0.5) * sp), off = (x - W / 2) / (W / 2);
      spots.push({ u, x, y: feet - off * off * H * 0.06 + (i % 2 ? H * 0.012 : 0), k, blow: ri > 0 && (ri + i) % 2 === 1 }); // (the big at the back loom; those in front fight)
    });
  });
  spots.sort((a, b) => a.y - b.y);
  const facingAt = (x: number) => (x < W * 0.42 ? 0 : x > W * 0.58 ? 2 : 1); // (0 down-right, 1 toward us, 2 down-left)
  const frameOf = (frames: Sprite[][], x: number, at: number) => { const f = frames[facingAt(x) % frames.length]; return f[Math.floor(f.length * at) % f.length]; };
  const blit = (s: Sprite, x: number, y: number, k: number) => g.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, x - s.ax * k, y - s.ay * k, s.sw * k, s.sh * k);
  // fliers over the band's shoulders, their shadows on the ground below and right (the sun is up and to the left)
  const flying = fliers.map((u, i) => {
    const want = W * (i % 2 ? 0.8 : 0.2) + (i >> 1) * W * 0.1 * (i % 2 ? -1 : 1), y = H * (0.66 + 0.05 * (i >> 1)), s = frameOf(art.units[u.id].anims.fly!.frames, want, 0.3), k = scale / s.q;
    // (all of it in the picture)
    const x = Math.min(Math.max(want, W * 0.02 + s.ax * k), W * 0.98 - (s.sw - s.ax) * k);
    return { u, x, y, lift: Math.min(H * (0.4 - 0.08 * (i >> 1)), y - H * 0.03 - s.ay * k) };
  });
  g.filter = 'brightness(1.12) saturate(1.08)';
  for (const f of flying) {
    const a = art.units[f.u.id].anims.fly!;
    if (a.shadows) { const s = frameOf(a.shadows, f.x, 0.3); blit(s, f.x + f.lift * 0.436, f.y + f.lift * 0.417, scale / s.q); }
  }
  for (const p of spots) {
    const a = art.units[p.u.id].anims, an = p.blow && a.attack ? a.attack : a.idle, s = frameOf(an.frames, p.x, an === a.idle ? 0 : 0.5);
    blit(s, p.x, p.y, p.k / s.q);
  }
  for (const f of flying) { const s = frameOf(art.units[f.u.id].anims.fly!.frames, f.x, 0.3); blit(s, f.x, f.y - f.lift, scale / s.q); }
  g.filter = 'none';
  // the edges fall into shade, so the band stands out
  const vignette = g.createRadialGradient(W / 2, H * 0.6, H * 0.35, W / 2, H * 0.6, W * 0.75);
  vignette.addColorStop(0, 'rgba(10,9,7,0)'); vignette.addColorStop(1, 'rgba(10,9,7,0.6)');
  g.fillStyle = vignette; g.fillRect(0, 0, W, H);
  document.body.appendChild(c);
  document.title = 'sprites ready';
}

/** Each faction's band pictures, if it stages its own (BandCandidate). */
const BAND_MODULES = import.meta.glob('../factions/*/band.ts') as Record<string, () => Promise<{ bands?: BandCandidate[]; pick?: number }>>;
/** Each faction's art module, for what its units bake (bakeOpts). */
const ART_MODULES = import.meta.glob('../factions/*/art.ts') as Record<string, () => Promise<{ bakeOpts?: (u: never) => UnitBakeOptions }>>;

/**
 * Units baked sharper than the game's (`q` pixels a game pixel), for a big picture; only a few frames of each
 * animation, as a picture needs one. A faction without a model per unit gets its usual art.
 */
async function sharpArt(faction: FactionSpec, team: TeamColors, units: UnitSpec[], q: number): Promise<{ units: Record<string, UnitArt> }> {
  const opts = (await ART_MODULES[`../factions/${faction.id}/art.ts`]?.())?.bakeOpts, models = units.map((u) => (u as UnitSpec & { model?: UnitModel }).model);
  if (!opts || models.some((m) => !m)) return faction.art!(team, undefined, units.map((u) => u.id));
  const { Baker, animsFor } = await import('../kits/bake3d/baker');
  const baker = new Baker(q), out: Record<string, UnitArt> = {};
  for (const [i, u] of units.entries()) {
    const o = opts(u as never);
    out[u.id] = await baker.bakeUnit(models[i]!, team, { ...o, frames: Object.fromEntries(animsFor(o).map((a) => [a, a === 'attack' || a === 'fly' ? 4 : 2])) });
  }
  baker.dispose();
  return { units: out };
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
  const team = teamOf(params), b = baker.bakeBuilding(spec.model, spec.size, team);
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
      if (!joined.has(m)) joined.set(m, baker.bakeStatic((mb) => spec.model(mb, { phase: 'complete', level: 0, joins: m }), team, true, {}, n * Math.SQRT2 + 1.1));
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
/** ?mode=sprites&joins=<wall id>: a wall as the game draws it (BuildingArt.joined). First each of its looks joined
 *  every way it can be (its neighbours shown as pale tiles), then some layouts, each piece joined to the like pieces
 *  beside it and taking the looks in turn by its tile, exactly as the renderer does. */
async function joinsPage(id: string): Promise<void> {
  const spec = PLAYABLE.flatMap((f) => f.buildings ?? []).find((b) => b.id === id) as unknown as { name: string; model: import('../kits/bake3d/types').BuildingModel; size: number; looks?: number } | undefined;
  if (!spec) return;
  const { Baker } = await import('../kits/bake3d/baker');
  const art = new Baker().bakeBuilding(spec.model, spec.size, teamOf(new URLSearchParams(location.search)), false, spec.looks ?? 1), joined = art.joined!;
  const box = scroller();
  box.style.cssText += ';padding:16px;color:#f3e7c4;font:600 14px Georgia, serif';
  const heading = (text: string, sub = '') => { const h = document.createElement('div'); h.innerHTML = `<div style="font-size:20px;margin:14px 0 2px">${text}</div><div style="font-weight:400;opacity:.8;margin-bottom:8px">${sub}</div>`; box.appendChild(h); };
  const row = () => { const r = document.createElement('div'); r.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end'; box.appendChild(r); return r; };
  const n = spec.size;
  /** Draw `tiles` (tile corners) on a canvas, the game's way; `ghosts`: pale tiles to show where neighbours are. */
  const draw = (tiles: Array<[number, number]>, scale: number, ghosts: Array<[number, number]> = [], fixed?: (x: number, y: number) => { look: number; joins: number }) => {
    const all = [...tiles, ...ghosts], xs = all.map((t) => t[0]), ys = all.map((t) => t[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 + n, h = Math.max(...ys) - y0 + n;
    const iso = (x: number, y: number): [number, number] => [(x - x0 - (y - y0)) * 32 * scale, (x - x0 + y - y0) * 16 * scale];
    const tall = 110 * scale, c = document.createElement('canvas');
    c.width = Math.ceil((w + h) * 32 * scale + 40); c.height = Math.ceil((w + h) * 16 * scale + tall + 20);
    const g = c.getContext('2d')!, ox = h * 32 * scale + 20, oy = tall;
    const diamond = (x: number, y: number, fill: string) => {
      g.beginPath(); for (const [a, b] of [[x, y], [x + n, y], [x + n, y + n], [x, y + n]]) { const [px, py] = iso(a, b); g.lineTo(ox + px, oy + py); }
      g.closePath(); g.fillStyle = fill; g.fill();
    };
    for (const [x, y] of tiles) diamond(x, y, 'rgba(0,0,0,0.12)');
    for (const [x, y] of ghosts) diamond(x, y, 'rgba(255,255,255,0.28)');
    const has = (x: number, y: number) => tiles.some(([a, b]) => a === x && b === y);
    for (const [x, y] of [...tiles].sort((p, q) => p[0] + p[1] - (q[0] + q[1]))) {
      const j = (has(x + n, y) ? 1 : 0) | (has(x - n, y) ? 2 : 0) | (has(x, y + n) ? 4 : 0) | (has(x, y - n) ? 8 : 0);
      const { look, joins } = fixed?.(x, y) ?? { look: (x + y) % joined.length, joins: j }; // (the renderer's rule)
      const sp = joined[look][joins], k = scale / sp.q, [px, py] = iso(x + n / 2, y + n / 2);
      g.drawImage(sp.img, sp.sx, sp.sy, sp.sw, sp.sh, ox + px - sp.ax * k, oy + py - sp.ay * k, sp.sw * k, sp.sh * k);
    }
    return c;
  };
  const cell = (r: HTMLElement, c: HTMLCanvasElement, label: string) => { const d = document.createElement('div'); d.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px'; d.append(c, label); r.appendChild(d); };
  // 1. every piece
  const NAMES = ['hedge', 'sprawl', 'billow'], dirs: Array<[number, number, number, string]> = [[1, n, 0, 'SE'], [2, -n, 0, 'NW'], [4, 0, n, 'SW'], [8, 0, -n, 'NE']];
  heading(`${spec.name}: every piece`, 'One piece (dark tile), joined toward the neighbours it has (pale tiles). Its web reaches to the edge on a joined side and stops short on an open one. 16 ways for each of its looks: these are the extra bakes.');
  joined.forEach((_, look) => {
    heading(`Look ${look + 1}: ${NAMES[look] ?? look}`);
    const r = row();
    for (let m = 0; m < 16; m++) {
      const ghosts = dirs.filter(([bit]) => m & bit).map(([, dx, dy]) => [dx, dy] as [number, number]);
      cell(r, draw([[0, 0]], 1.2, ghosts, () => ({ look, joins: m })), m ? dirs.filter(([bit]) => m & bit).map((d) => d[3]).join(' + ') : 'alone');
    }
  });
  // 2. layouts, as the game draws them
  heading('Laid out in the game', 'Each piece joined to the like pieces beside it; along a line they take the looks in turn (hedge, sprawl, billow), by tile.');
  const line = (len: number, dx: number, dy: number, x = 0, y = 0) => Array.from({ length: len }, (_, i) => [x + i * dx * n, y + i * dy * n] as [number, number]);
  const uniq = (t: Array<[number, number]>) => t.filter(([a, b], i) => t.findIndex(([c, d]) => c === a && d === b) === i);
  const layouts: Array<[string, Array<[number, number]>]> = [
    ['a line (along the map’s x)', line(8, 1, 0)],
    ['a line (along y)', line(8, 0, 1)],
    ['a corner', uniq([...line(5, 1, 0), ...line(5, 0, 1)])],
    ['a T', uniq([...line(7, 1, 0), ...line(4, 0, 1, 3 * n, 0)])],
    ['a cross', uniq([...line(7, 1, 0, 0, 3 * n), ...line(7, 0, 1, 3 * n, 0)])],
    ['a ring', uniq([...line(6, 1, 0), ...line(6, 1, 0, 0, 5 * n), ...line(6, 0, 1), ...line(6, 0, 1, 5 * n, 0)])],
    ['a staircase (diagonal)', uniq(Array.from({ length: 5 }, (_, i) => [[i * n, i * n], [(i + 1) * n, i * n]] as Array<[number, number]>).flat())],
    ['a block, 3 × 3', Array.from({ length: 9 }, (_, i) => [(i % 3) * n, Math.floor(i / 3) * n] as [number, number])],
  ];
  const r = row();
  for (const [name, tiles] of layouts) cell(r, draw(tiles, 0.9), name);
}

/** ?mode=sprites&teams=<faction>[&facing=1|&facings=1,3,6][&only=<id>,<id>][&cell=170]: every unit (standing, one
 *  still per facing) and every building (finished, and mid-throw if it throws) of a faction, a row each, in each of the
 *  four sides' colours side by side: to check its team colours read. Each row drawn at its own scale to fill its cells,
 *  the same size cells throughout (so before and after shots line up). */
async function teamsPage(params: URLSearchParams): Promise<void> {
  const faction = PLAYABLE.find((f) => f.id === params.get('teams'));
  if (!faction) return;
  const facings = (params.get('facings') ?? params.get('facing') ?? '1').split(',').map(Number), CELL = +(params.get('cell') ?? 170), LABEL = 170, HEAD = 30;
  const only = params.get('only')?.split(','), wanted = (id: string) => !only || only.includes(id);
  const { Baker } = await import('../kits/bake3d/baker');
  const baker = new Baker();
  type Row = { name: string; sprites: import('../art/contract').Sprite[] };
  const rows: Row[] = [];
  for (const u of faction.units as unknown as Array<{ id: string; name: string; model: import('../kits/bake3d/types').UnitModel }>) {
    if (!wanted(u.id)) continue;
    const baked = [];
    for (const team of TEAM_COLORS) baked.push((await baker.bakeUnit(u.model, team, { dummy: true, frames: { idle: 1, die: 2 } })).anims.idle!.frames);
    for (const facing of facings) rows.push({ name: `${u.name} ${facing}`, sprites: baked.map((f) => f[facing % f.length][0]) });
  }
  for (const b of (faction.buildings ?? []) as unknown as Array<{ id: string; name: string; model: import('../kits/bake3d/types').BuildingModel; size: number; throws?: unknown }>) {
    if (!wanted(b.id)) continue;
    rows.push({ name: b.name, sprites: TEAM_COLORS.map((team) => baker.bakeBuilding(b.model, b.size, team).complete) });
    if (b.throws) rows.push({ name: `${b.name} throwing`, sprites: TEAM_COLORS.map((team) => baker.bakeStatic((mb) => b.model(mb, { phase: 'complete', level: 0, attack: { t: 0.45, facing: Math.PI / 4 } }), team, true, {}, b.size * Math.SQRT2 + 3)) });
  }
  baker.dispose();
  const c = document.createElement('canvas');
  c.width = LABEL + CELL * 4; c.height = HEAD + CELL * rows.length;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5f7440'; g.fillRect(0, 0, c.width, c.height);
  g.font = '600 15px Georgia, serif'; g.fillStyle = '#f3e7c4';
  TEAM_COLORS.forEach((t, i) => { g.fillStyle = t.primary; g.fillRect(LABEL + i * CELL + 4, 4, CELL - 8, HEAD - 8); });
  // each sprite's solid part (its body, not its soft shadow), so a row can be framed tight on it
  const solid = (s: import('../art/contract').Sprite) => {
    const t = document.createElement('canvas'); t.width = s.sw; t.height = s.sh;
    const tg = t.getContext('2d', { willReadFrequently: true })!;
    tg.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, 0, 0, s.sw, s.sh);
    const a = tg.getImageData(0, 0, s.sw, s.sh).data;
    let x0 = s.sw, y0 = s.sh, x1 = 0, y1 = 0;
    for (let y = 0; y < s.sh; y++) for (let x = 0; x < s.sw; x++) if (a[(y * s.sw + x) * 4 + 3] > 200) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return x1 < x0 ? { x0: 0, y0: 0, x1: s.sw, y1: s.sh } : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  };
  rows.forEach((r, ri) => {
    const y0 = HEAD + ri * CELL, boxes = r.sprites.map(solid);
    const big = Math.max(...boxes.map((b) => Math.max(b.x1 - b.x0, b.y1 - b.y0))), k = Math.min(6, (CELL - 12) / big); // (one scale across a row)
    g.fillStyle = '#f3e7c4'; g.textAlign = 'left'; g.fillText(r.name, 8, y0 + CELL / 2);
    r.sprites.forEach((s, i) => {
      const b = boxes[i], cx = LABEL + i * CELL + CELL / 2, cy = y0 + CELL / 2;
      g.strokeStyle = 'rgba(0,0,0,0.2)'; g.strokeRect(LABEL + i * CELL, y0, CELL, CELL);
      g.save(); g.beginPath(); g.rect(LABEL + i * CELL, y0, CELL, CELL); g.clip();
      g.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, cx - ((b.x0 + b.x1) / 2) * k, cy - ((b.y0 + b.y1) / 2) * k, s.sw * k, s.sh * k); // (its body centred in its cell)
      g.restore();
    });
  });
  scroller().appendChild(c);
  document.title = 'sprites ready';
}

function scroller(): HTMLElement {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;overflow:auto;z-index:10;background:#5f7440';
  document.body.appendChild(box);
  return box;
}

/** ?mode=sprites&concepts=all: every design concept (wildwelds/concepts.ts), labelled, in one scrolling gallery: walls
 *  laid in an L, each piece joined to its neighbours; towers on their own. &concepts=tangle: just the tangle webs
 *  (walls T1–T5), first a long line of them mixed, each piece the next of the five in turn. */
async function gallery(which: string): Promise<void> {
  const { WEB_CONCEPTS } = await import('../factions/wildwelds/concepts');
  const { Baker } = await import('../kits/bake3d/baker');
  const box = scroller();
  box.style.cssText += ';display:flex;flex-wrap:wrap;gap:18px;padding:16px;align-content:flex-start;color:#f3e7c4;font:600 14px Georgia, serif';
  const baker = new Baker(), team = TEAM_COLORS[0];
  const mix = new URLSearchParams(location.search).get('mix')?.split(',') ?? null; // (&mix=2,3,5: just those, in turn)
  const tangles = Object.keys(WEB_CONCEPTS).filter((n) => /^wallT\d$/.test(n) && (!mix || mix.includes(n.slice(5))));
  if (which === 'tangle') { // a long L of them mixed: each piece the next of the five
    const scale = 1.1, tiles: Array<[number, number]> = [];
    for (let i = 0; i < 10; i++) tiles.push([i, 0]);
    for (let i = 1; i < 10; i++) tiles.push([0, i]);
    const has = (x: number, y: number) => tiles.some(([a, b]) => a === x && b === y), iso = (x: number, y: number) => [(x - y) * 32 * scale, (x + y) * 16 * scale];
    const c = document.createElement('canvas'), g = c.getContext('2d')!;
    c.width = 10 * 64 * scale + 60; c.height = 10 * 32 * scale + 160;
    const ox = c.width / 2, oy = 120, baked = new Map<string, import('../art/contract').Sprite>();
    tiles.forEach(([tx, ty], i) => {
      const name = tangles[i % tangles.length], m = (has(tx + 1, ty) ? 1 : 0) | (has(tx - 1, ty) ? 2 : 0) | (has(tx, ty + 1) ? 4 : 0) | (has(tx, ty - 1) ? 8 : 0), key = `${name}/${m}`;
      if (!baked.has(key)) baked.set(key, baker.bakeStatic((b) => WEB_CONCEPTS[name].model(b, { phase: 'complete', level: 0, joins: m }), team, true, {}, Math.SQRT2 + 1.1));
    });
    for (const i of tiles.map((_, k) => k).sort((p, q) => tiles[p][0] + tiles[p][1] - (tiles[q][0] + tiles[q][1]))) {
      const [tx, ty] = tiles[i], m = (has(tx + 1, ty) ? 1 : 0) | (has(tx - 1, ty) ? 2 : 0) | (has(tx, ty + 1) ? 4 : 0) | (has(tx, ty - 1) ? 8 : 0);
      const sp = baked.get(`${tangles[i % tangles.length]}/${m}`)!, k = scale / sp.q, [x, y] = iso(tx + 0.5, ty + 0.5);
      g.drawImage(sp.img, sp.sx, sp.sy, sp.sw, sp.sh, ox + x - sp.ax * k, oy + y - sp.ay * k, sp.sw * k, sp.sh * k);
    }
    const cell = document.createElement('div'), label = document.createElement('div');
    cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;background:rgba(0,0,0,0.12);padding:8px;border-radius:6px';
    label.textContent = `mixed: ${tangles.join(', ')} in turn`;
    cell.append(c, label);
    box.appendChild(cell);
  }
  for (const [name, spec] of Object.entries(WEB_CONCEPTS)) {
    if (which === 'tangle' && !tangles.includes(name)) continue;
    const cell = document.createElement('div');
    cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;background:rgba(0,0,0,0.12);padding:8px;border-radius:6px';
    const c = document.createElement('canvas'), g = c.getContext('2d')!;
    if (spec.size === 1) { // a wall: an L of 4 along each axis, joined
      const scale = 1.2, tiles: Array<[number, number]> = [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [0, 2], [0, 3]];
      const has = (x: number, y: number) => tiles.some(([a, b]) => a === x && b === y), iso = (x: number, y: number) => [(x - y) * 32 * scale, (x + y) * 16 * scale];
      c.width = 4 * 64 * scale + 40; c.height = 4 * 32 * scale + 140;
      const ox = c.width / 2, oy = 110, baked = new Map<number, import('../art/contract').Sprite>();
      for (const [tx, ty] of tiles.sort((p, q) => p[0] + p[1] - (q[0] + q[1]))) {
        const m = (has(tx + 1, ty) ? 1 : 0) | (has(tx - 1, ty) ? 2 : 0) | (has(tx, ty + 1) ? 4 : 0) | (has(tx, ty - 1) ? 8 : 0);
        if (!baked.has(m)) baked.set(m, baker.bakeStatic((b) => spec.model(b, { phase: 'complete', level: 0, joins: m }), team, true, {}, Math.SQRT2 + 1.1));
        const sp = baked.get(m)!, k = scale / sp.q, [x, y] = iso(tx + 0.5, ty + 0.5);
        g.drawImage(sp.img, sp.sx, sp.sy, sp.sw, sp.sh, ox + x - sp.ax * k, oy + y - sp.ay * k, sp.sw * k, sp.sh * k);
      }
    } else { // a tower, on its own
      const scale = 1.2, sp = baker.bakeStatic((b) => spec.model(b), team, true, {}, spec.size * Math.SQRT2 + 1.1), k = scale / sp.q;
      c.width = Math.ceil(sp.sw * k + 20); c.height = Math.ceil(sp.sh * k + 20);
      g.drawImage(sp.img, sp.sx, sp.sy, sp.sw, sp.sh, c.width / 2 - sp.ax * k, c.height - 10 - sp.ay * k, sp.sw * k, sp.sh * k);
    }
    const label = document.createElement('div');
    label.textContent = name;
    cell.append(c, label);
    box.appendChild(cell);
    await new Promise((r) => setTimeout(r, 0)); // (show them as they bake)
  }
  baker.dispose();
  document.title = 'sprites ready';
}

/** ?mode=sprites&tunnels=all: the eight tunnel towers (wildwelds/tunnels.ts), each playing its full attack over and
 *  over (a pause at rest between throws), its frames laid out in a strip under it. &tunnels=3: just the third;
 *  &frames=N: N frames to a throw (30); &secs=S: S seconds to a throw (2). */
async function tunnels(which: string, FRAMES: number): Promise<void> {
  const { TUNNELS } = await import('../factions/wildwelds/tunnels');
  const { Baker } = await import('../kits/bake3d/baker');
  const box = scroller();
  box.style.cssText += ';display:flex;flex-wrap:wrap;gap:18px;padding:16px;align-content:flex-start;color:#f3e7c4;font:600 14px Georgia, serif';
  const baker = new Baker(), team = TEAM_COLORS[0], scale = 1.0, stripScale = 0.45, W = 420, H = 380, reach = 5.5;
  const players: Array<{ g: CanvasRenderingContext2D; frames: import('../art/contract').Sprite[]; rest: import('../art/contract').Sprite }> = [];
  const draw = (g: CanvasRenderingContext2D, sp: import('../art/contract').Sprite, x: number, y: number, sc: number) => {
    const k = sc / sp.q;
    g.drawImage(sp.img, sp.sx, sp.sy, sp.sw, sp.sh, x - sp.ax * k, y - sp.ay * k, sp.sw * k, sp.sh * k);
  };
  let start = performance.now();
  const secs = Number(new URLSearchParams(location.search).get('secs') ?? 2), cycle = secs + 0.8;
  const tick = (now: number) => { // one throw of `secs` (&secs=, 2), then 0.8 s at rest
    const c = ((now - start) / (cycle * 1000)) % 1, f = c < secs / cycle ? Math.floor((c / (secs / cycle)) * FRAMES) : -1;
    for (const pl of players) { pl.g.clearRect(0, 0, W, H); draw(pl.g, f < 0 ? pl.rest : pl.frames[f], W * 0.42, H - 40, scale); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  for (const [name, model] of TUNNELS) {
    if (which !== 'all' && !which.split(',').some((w) => name.startsWith(`${w} `))) continue;
    const cell = document.createElement('div');
    cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;background:rgba(0,0,0,0.12);padding:8px;border-radius:6px';
    const label = document.createElement('div');
    label.textContent = `${name} (baking…)`;
    const c = document.createElement('canvas'), g = c.getContext('2d')!;
    c.width = W; c.height = H;
    const strip = document.createElement('canvas'), sg = strip.getContext('2d')!, cw = 110;
    strip.width = cw * 10; strip.height = 2 * 120;
    cell.append(label, c, strip);
    box.appendChild(cell);
    await new Promise((r) => setTimeout(r, 0));
    const rest = baker.bakeStatic((b) => model(b), team, true, {}, reach), frames = [];
    for (let i = 0; i < FRAMES; i++) {
      frames.push(baker.bakeStatic((b) => model(b, i / FRAMES), team, true, {}, reach));
      draw(sg, frames[i], (i % 10) * cw + cw * 0.4, Math.floor(i / 10) * 120 + 108, stripScale);
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0)); // (let the page breathe)
    }
    label.textContent = name;
    players.push({ g, frames, rest });
    start = performance.now() - ((performance.now() - start) % 2000);
  }
  baker.dispose();
  document.title = 'sprites ready';
}
