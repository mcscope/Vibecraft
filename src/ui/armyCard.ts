// The front page's army cards: who a faction is, its fighters posed like a band (scripts/bands.mjs), how hard it is to play.
import type { FactionSpec } from '../factions/types';
import type { TeamColors } from '../art/contract';
import { LESSONS } from '../tutorial';
import { esc } from './format';

/** The band pictures, by file name: band-<faction>-<side>.webp (side 0 blue, 1 red). */
const BANDS = import.meta.glob('../assets/band-*.webp', { eager: true, import: 'default' }) as Record<string, string>;
const band = (factionId: string, side: number) => BANDS[`../assets/band-${factionId}-${side}.webp`];

/** Fill `el` with a faction's description and its picture in side `side`'s colours (`team`). */
export function showArmy(el: HTMLElement, f: FactionSpec, team: TeamColors, side: number): void {
  const pic = band(f.id, side);
  el.style.setProperty('--team', team.primary);
  el.innerHTML = `${pic ? `<img class="army-band" src="${pic}" alt="${esc(f.name)}" width="720" height="540">` : ''}
    <p class="army-about">${esc(f.description ?? '')}</p>
    ${f.difficulty ? `<p class="army-level"><b>${f.difficulty[0].toUpperCase() + f.difficulty.slice(1)}</b> ${esc(f.difficultyNote ?? '')}</p>` : ''}
    ${LESSONS.some((l) => l.you === f) ? `<a class="army-learn" href="./?mode=tutorial&track=${esc(f.id)}">Learn to play this army</a>` : ''}`;
}
