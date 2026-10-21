// Dev page: ?mode=sprites&unit=<id>&anim=<anim>[&scale=2][&facing=<0-7>], or ?mode=sprites&faction=<id> for its roster. Bakes one unit and lays out every frame of an
// animation, a row per facing, so its art can be checked (or screenshotted headless) without a fight.
import { PLAYABLE } from '../factions';
import { TEAM_COLORS } from '../render/artbank';
import type { ArtAnim } from '../art/contract';

export async function runSpriteSheet(params: URLSearchParams): Promise<void> {
  if (params.get('faction')) return roster(params);
  const id = params.get('unit') ?? 'lynx', anim = (params.get('anim') ?? 'attack') as ArtAnim, scale = +(params.get('scale') ?? 2);
  const faction = PLAYABLE.find((f) => f.units.some((u) => u.id === id));
  const out = document.createElement('div');
  out.style.cssText = 'position:fixed;inset:0;background:#7a8a5a;color:#fff;font:14px sans-serif;padding:8px;overflow:auto;z-index:10';
  document.body.appendChild(out);
  if (!faction?.art) { out.textContent = `no art for ${id}`; return; }
  out.textContent = `baking ${id}…`;
  const art = (await faction.art(TEAM_COLORS[0], undefined, [id])).units[id];
  const found = art?.anims[anim];
  if (!found) { out.textContent = `${id} has no '${anim}' (has: ${Object.keys(art?.anims ?? {}).join(', ')})`; return; }
  // &shadows=1: an animation in the air's shadow frames instead (baked alone, laid on the ground by the renderer)
  const a = params.get('shadows') ? { ...found, frames: found.shadows ?? [] } : found;
  if (!a.frames.length) { out.textContent = `${id} '${anim}' has no shadow frames`; return; }
  const facing = params.get('facing');
  if (facing !== null) a.frames.splice(0, a.frames.length, a.frames[+facing % a.frames.length]);
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
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:10';
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
  document.body.appendChild(c);
  document.title = 'sprites ready';
}
