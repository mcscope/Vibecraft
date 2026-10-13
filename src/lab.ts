// Unit Lab: load each faction's art through the same contract the game uses,
// and show every animation, facing and building state next to the derived stats.
import './style.css';
import type { FactionSpec } from './factions/types';
import type { ArtAnim, FactionArt, Sprite, UnitArt } from './art/contract';
import { unitSprite } from './art/contract';
import { blit } from './art/draw';
import { meadowfolk } from './factions/meadowfolk';
import { training } from './factions/training';
import { deriveBuilding, validate, validateFaction } from './sim/physics';
import { TEAM_COLORS } from './render/artbank';
import { statsTable } from './ui/hud';

const factions: Array<[FactionSpec, number]> = [[meadowfolk, 0], [training, 1]];
const ANIMS: ArtAnim[] = ['idle', 'walk', 'attack', 'gather', 'eat', 'tired', 'die', 'carryFood', 'carryWood', 'carryCrystal'];
const root = document.getElementById('cards')!;
const status = document.getElementById('status')!;
const cells: Array<{ c: HTMLCanvasElement; art: UnitArt; anim: ArtAnim; dir: number | null }> = [];

function spriteImg(s: Sprite, maxH = 220): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = s.sw; c.height = s.sh;
  c.getContext('2d')!.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, 0, 0, s.sw, s.sh);
  c.className = 'bsprite';
  c.style.maxHeight = `${maxH}px`;
  return c;
}

async function main(): Promise<void> {
  for (const [f, team] of factions) {
    status.textContent = `Loading ${f.name} art…`;
    if (!f.art) { root.insertAdjacentHTML('beforeend', `<h2>${f.name}</h2><p>No art supplied — the game will draw placeholders.</p>`); continue; }
    const art: FactionArt = await f.art(TEAM_COLORS[team], (p, label) => (status.textContent = `${label} (${Math.round(p * 100)}%)`));
    root.insertAdjacentHTML('beforeend', `<h2>${f.name}</h2>`);
    for (const spec of f.units) {
      const ua = art.units[spec.id];
      const errs = validate(spec);
      const card = document.createElement('section');
      card.className = 'card';
      card.innerHTML = `
        <div class="head"><h3>${spec.name}</h3><code>${spec.id}</code></div>
        <p>${spec.description}</p>
        ${errs.length ? `<div class="errs">${errs.join('<br>')}</div>` : ''}
        ${ua ? '<div class="anims"></div><div class="anims dirs"></div>' : '<div class="errs">No art for this unit</div>'}
        ${statsTable(spec)}`;
      root.appendChild(card);
      if (!ua) continue;
      const add = (parent: Element, anim: ArtAnim, dir: number | null, caption: string) => {
        const fig = document.createElement('figure');
        const c = document.createElement('canvas');
        fig.appendChild(c);
        fig.insertAdjacentHTML('beforeend', `<figcaption>${caption}</figcaption>`);
        parent.appendChild(fig);
        cells.push({ c, art: ua, anim, dir });
      };
      for (const anim of ANIMS) if (ua.anims[anim]) add(card.querySelector('.anims')!, anim, null, anim);
      if (ua.anims.walk) for (let d = 0; d < 8; d++) add(card.querySelector('.dirs')!, 'walk', d, ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][d] + ' (map)');
    }
    const errs = validateFaction(f);
    root.insertAdjacentHTML('beforeend', `<h2>${f.name} — buildings</h2>${errs.length ? `<div class="card errs">${errs.join('<br>')}</div>` : ''}`);
    for (const b of f.buildings ?? []) {
      const st = deriveBuilding(b, f);
      const ba = art.buildings[b.id];
      const card = document.createElement('section');
      card.className = 'card building-card';
      card.innerHTML = `<div class="head"><h3>${b.name}</h3><code>${b.id}</code></div><p>${b.description}</p>
        <div class="states"></div>
        <div class="stats">
          <div class="st"><span>Materials (capital)</span><b>${st.capital}</b></div>
          <div class="st"><span>With links</span><b>${st.effectiveCapital}</b></div>
          <div class="st"><span>Supports refinement</span><b>≤ ${st.maxRefinement.toFixed(2)}×</b></div>
          <div class="st"><span>Hit points</span><b>${st.maxHp}</b></div>
          <div class="st"><span>Cache</span><b>${st.cacheCap} kg</b></div>
          <div class="st"><span>Footprint</span><b>${b.size}×${b.size}</b></div>
          ${st.tower ? `<div class="st"><span>Tower damage</span><b>${Math.round(st.tower.damage)}</b></div><div class="st"><span>Tower range</span><b>${st.tower.range.toFixed(1)}</b></div>` : ''}
        </div>`;
      root.appendChild(card);
      const states = card.querySelector('.states')!;
      if (!ba) { states.textContent = 'No art for this building'; continue; }
      const looks: Array<[string, Sprite]> = [
        ...ba.construction.map((s, i) => [`building ${i + 1}/${ba.construction.length}`, s] as [string, Sprite]),
        ['complete', ba.complete],
        ...ba.damaged.map((s, i) => [`damaged ${i + 1}`, s] as [string, Sprite]),
      ];
      for (const [label, s] of looks) {
        const fig = document.createElement('figure');
        fig.appendChild(spriteImg(s, 150));
        fig.insertAdjacentHTML('beforeend', `<figcaption>${label}</figcaption>`);
        states.appendChild(fig);
      }
    }
  }
  status.textContent = 'Each faction supplies finished art through FactionSpec.art (see src/art/contract.ts). The Meadowfolk bake theirs from 3D models.';
}

const start = performance.now();
function frame(now: number): void {
  const t = (now - start) / 1000;
  const dpr = window.devicePixelRatio || 1;
  for (const cell of cells) {
    const { c, art } = cell;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w) continue;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const dir = cell.dir ?? (cell.anim === 'idle' ? Math.floor(t / 2.5) % 8 : 1);
    const oneShot = cell.anim === 'attack' || cell.anim === 'die';
    const sprite = unitSprite(art, cell.anim, dir, oneShot ? { progress: (t % 1.6) / 1.2 } : { time: t });
    const zoom = Math.min(1.6, (h * 0.75) / art.height);
    blit(ctx, sprite, w / 2, h * 0.86, zoom);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
main();
