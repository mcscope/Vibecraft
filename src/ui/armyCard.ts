// The front page's army cards: who a faction is and what it fights with.
import type { FactionSpec } from '../factions/types';
import type { TeamColors } from '../art/contract';
import { spriteIcon } from '../art/draw';
import { unitStills } from '../render/artbank';
import { draftable } from '../sim/battle';
import { derive } from '../sim/physics';
import { LESSONS } from '../tutorial';
import { esc } from './format';

/** Unit pictures already made, by faction and team colour (unit id → image URL). */
const pictures = new Map<string, Promise<Map<string, string>>>();
/** One faction's pictures at a time (in dev each is baked here). */
let queue: Promise<unknown> = Promise.resolve();

/** Fill `el` with a faction's description and its fighting units, pictured in `team`'s colours. */
export function showArmy(el: HTMLElement, f: FactionSpec, team: TeamColors): void {
  const units = draftable(f), food = (f.resourceNames?.food ?? 'food').toLowerCase(), crystal = (f.resourceNames?.crystal ?? 'crystal').toLowerCase();
  el.dataset.faction = f.id;
  el.style.setProperty('--team', team.primary);
  el.innerHTML = `<p class="army-about">${esc(f.description ?? '')}</p>
    <div class="army-units">${units.map((u) => {
      const d = derive(u);
      return `<span data-unit="${esc(u.id)}" title="${esc(`${u.name}: ${d.foodCost} ${food}${d.crystalCost ? `, ${d.crystalCost} ${crystal}` : ''}`)}"></span>`;
    }).join('')}</div><small class="army-note"></small>
    ${f.difficulty ? `<p class="army-level"><b>${f.difficulty[0].toUpperCase() + f.difficulty.slice(1)}</b> ${esc(f.difficultyNote ?? '')}</p>` : ''}
    ${LESSONS.some((l) => l.you === f) ? `<a class="army-learn" href="./?mode=tutorial&track=${esc(f.id)}">Learn to play this army</a>` : ''}`;
  // point at or tap a unit: its name and cost, written out underneath (a phone has no hover)
  const note = el.querySelector<HTMLElement>('.army-note')!;
  const name = (e: Event) => { const slot = (e.target as HTMLElement).closest<HTMLElement>('[data-unit]'); if (slot) note.textContent = slot.title; };
  el.onpointerover = el.onclick = name;
  const key = `${f.id}/${team.primary}`;
  if (!pictures.has(key)) {
    const job = queue.then(async () => {
      const urls = new Map<string, string>();
      for (const [id, s] of await unitStills(f, team, units.map((u) => u.id))) urls.set(id, spriteIcon(s, 96).toDataURL());
      return urls;
    });
    queue = job.catch((e) => console.error('army pictures', f.id, e));
    pictures.set(key, job);
  }
  void pictures.get(key)!.then((urls) => {
    if (el.dataset.faction !== f.id) return; // (another army was picked meanwhile)
    for (const slot of el.querySelectorAll<HTMLElement>('[data-unit]')) {
      const url = urls.get(slot.dataset.unit!);
      if (url) slot.innerHTML = `<img src="${url}" alt="${esc(slot.title)}">`;
    }
  }, () => { /* (no pictures: the names still show on hover) */ });
}
