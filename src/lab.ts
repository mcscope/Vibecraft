// Unit Lab: bake each unit and show every animation, all 8 facings, and its derived stats.
import './style.css';
import type { FactionSpec } from './factions/types';
import { meadowfolk } from './factions/meadowfolk';
import { training } from './factions/training';
import { deriveBuilding, validate, validateFaction } from './sim/physics';
import { Baker, blit, type BakedAnim, type UnitSheet } from './render/bake/baker';
import { TEAM_COLORS } from './render/sprites';
import { statsTable } from './ui/hud';

const factions: FactionSpec[] = [meadowfolk, training];
const ANIMS: Array<[BakedAnim, number]> = [['idle', 2.5], ['walk', 9], ['attack', 8], ['gather', 7], ['eat', 4], ['tired', 1.5], ['die', 5], ['carryFood', 9], ['carryWood', 9], ['carryCrystal', 9]];
const root = document.getElementById('cards')!;
const status = document.getElementById('status')!;
const cells: Array<{ c: HTMLCanvasElement; sheet: UnitSheet; anim: BakedAnim; fps: number; dir: number | null }> = [];

async function main(): Promise<void> {
  const baker = new Baker();
  for (const f of factions) {
    root.insertAdjacentHTML('beforeend', `<h2>${f.name}</h2>`);
    for (const spec of f.units) {
      status.textContent = `Baking ${spec.name}…`;
      const errs = validate(spec);
      const card = document.createElement('section');
      card.className = 'card';
      card.innerHTML = `
        <div class="head"><h3>${spec.name}</h3><code>${spec.id}</code></div>
        <p>${spec.description}</p>
        ${errs.length ? `<div class="errs">${errs.join('<br>')}</div>` : ''}
        <div class="anims"></div>
        <div class="anims dirs"></div>
        ${statsTable(spec)}`;
      root.appendChild(card);
      const sheet = await baker.bakeUnit(spec, TEAM_COLORS[f === training ? 1 : 0], (spec.id === f.workerId || spec.role === 'carter') && !spec.dummy);
      const add = (parent: Element, anim: BakedAnim, fps: number, dir: number | null, caption: string) => {
        const fig = document.createElement('figure');
        const c = document.createElement('canvas');
        fig.appendChild(c);
        fig.insertAdjacentHTML('beforeend', `<figcaption>${caption}</figcaption>`);
        parent.appendChild(fig);
        cells.push({ c, sheet, anim, fps, dir });
      };
      for (const [anim, fps] of ANIMS) if (sheet.has(anim)) add(card.querySelector('.anims')!, anim, fps, null, anim);
      if (!spec.dummy) for (let d = 0; d < 8; d++) add(card.querySelector('.dirs')!, 'walk', 9, d, ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][d] + ' (map)');
    }
  }
  // buildings
  for (const f of factions) {
    const errs = validateFaction(f);
    root.insertAdjacentHTML('beforeend', `<h2>${f.name} — buildings</h2>${errs.length ? `<div class="card errs">${errs.join('<br>')}</div>` : ''}`);
    for (const b of f.buildings ?? []) {
      const st = deriveBuilding(b, f);
      const card = document.createElement('section');
      card.className = 'card building-card';
      const sprite = baker.bakeStatic(b.model, TEAM_COLORS[f === training ? 1 : 0]);
      const img = sprite.img as HTMLCanvasElement;
      img.className = 'bsprite';
      card.innerHTML = `<div class="head"><h3>${b.name}</h3><code>${b.id}</code></div><p>${b.description}</p>
        <div class="stats">
          <div class="st"><span>Materials (capital)</span><b>${st.capital}</b></div>
          <div class="st"><span>With links</span><b>${st.effectiveCapital}</b></div>
          <div class="st"><span>Supports refinement</span><b>≤ ${st.maxRefinement.toFixed(2)}×</b></div>
          <div class="st"><span>Hit points</span><b>${st.maxHp}</b></div>
          <div class="st"><span>Cache</span><b>${st.cacheCap} kg</b></div>
          <div class="st"><span>Footprint</span><b>${b.size}×${b.size}</b></div>
          ${st.tower ? `<div class="st"><span>Tower damage</span><b>${Math.round(st.tower.damage)}</b></div><div class="st"><span>Tower range</span><b>${st.tower.range.toFixed(1)}</b></div>` : ''}
        </div>`;
      card.insertBefore(img, card.querySelector('.stats'));
      root.appendChild(card);
    }
  }
  baker.dispose();
  status.textContent = 'Sprites are baked from the 3D models in src/factions — edit one and this page reloads.';
}

const start = performance.now();
function frame(now: number): void {
  const t = (now - start) / 1000;
  const dpr = window.devicePixelRatio || 1;
  for (const cell of cells) {
    const { c, sheet } = cell;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w) continue;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const dir = cell.dir ?? Math.floor(t / 2.5) % 8;
    const n = sheet.frames(cell.anim);
    const idx = cell.anim === 'die' ? Math.min(n - 1, Math.floor((t % 3) * cell.fps)) : Math.floor(t * cell.fps);
    const { sprite } = sheet.frame(cell.anim, cell.dir ?? (cell.anim === 'idle' ? dir : 1), idx);
    const zoom = Math.min(1.6, (h * 0.75) / sheet.height);
    blit(ctx, sprite, w / 2, h * 0.86, zoom);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
main();
