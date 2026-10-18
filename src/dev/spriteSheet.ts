// Dev page: ?mode=sprites&unit=<id>&anim=<anim>[&scale=2][&facing=<0-7>]. Bakes one unit and lays out every frame of an
// animation, a row per facing, so its art can be checked (or screenshotted headless) without a fight.
import { PLAYABLE } from '../factions';
import { TEAM_COLORS } from '../render/artbank';
import type { ArtAnim } from '../art/contract';

export async function runSpriteSheet(params: URLSearchParams): Promise<void> {
  const id = params.get('unit') ?? 'lynx', anim = (params.get('anim') ?? 'attack') as ArtAnim, scale = +(params.get('scale') ?? 2);
  const faction = PLAYABLE.find((f) => f.units.some((u) => u.id === id));
  const out = document.createElement('div');
  out.style.cssText = 'position:fixed;inset:0;background:#7a8a5a;color:#fff;font:14px sans-serif;padding:8px;overflow:auto;z-index:10';
  document.body.appendChild(out);
  if (!faction?.art) { out.textContent = `no art for ${id}`; return; }
  out.textContent = `baking ${id}…`;
  const art = (await faction.art(TEAM_COLORS[0], undefined, [id])).units[id];
  const a = art?.anims[anim];
  if (!a) { out.textContent = `${id} has no '${anim}' (has: ${Object.keys(art?.anims ?? {}).join(', ')})`; return; }
  const facing = params.get('facing');
  if (facing !== null) a.frames.splice(0, a.frames.length, a.frames[+facing % a.frames.length]);
  const cell = Math.max(...a.frames.flat().map((s) => Math.max(s.sw, s.sh) / s.q)) * scale;
  const cols = Math.max(...a.frames.map((f) => f.length));
  const c = document.createElement('canvas');
  c.width = cols * cell; c.height = a.frames.length * cell;
  const g = c.getContext('2d')!;
  a.frames.forEach((row, fi) => row.forEach((s, i) => {
    const k = scale / s.q, x = i * cell + cell / 2, y = fi * cell + cell * 0.8; // feet near the bottom of the cell
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.strokeRect(i * cell, fi * cell, cell, cell);
    g.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, x - s.ax * k, y - s.ay * k, s.sw * k, s.sh * k);
  }));
  out.textContent = `${id} · ${anim} · ${a.frames.length} facings × ${cols} frames`;
  out.appendChild(document.createElement('br'));
  out.appendChild(c);
  document.title = 'sprites ready';
}
