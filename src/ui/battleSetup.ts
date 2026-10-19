// Pitched Battle, step 1: the draft. Pick your faction, the enemy's, the battlefield and a food budget, then spend
// it on units. The computer drafts the enemy army to the same budget (sim/battle.ts).
import { PLAYABLE } from '../factions';
import type { FactionSpec } from '../factions/types';
import { BATTLE_MAPS } from '../sim/battleMaps';
import { armyCost, campCost, CAMP_STOCK, draftable, supplyCamp, unitCost, type Army } from '../sim/battle';
import { esc } from './format';

export interface BattleChoice { you: FactionSpec; foe: FactionSpec; mapId: string; budget: number; army: Army }

const BUDGETS = [1000, 2000, 3500, 6000];

export function draftBattle(params: URLSearchParams): Promise<BattleChoice> {
  return new Promise((done) => {
    let you = PLAYABLE.find((f) => f.id === params.get('you')) ?? PLAYABLE[0];
    let foe = PLAYABLE.find((f) => f.id === params.get('foe')) ?? PLAYABLE[1] ?? PLAYABLE[0];
    let mapId = params.get('map') && BATTLE_MAPS.some((m) => m.id === params.get('map')) ? params.get('map')! : BATTLE_MAPS[0].id;
    let budget = +(params.get('budget') ?? 2000) || 2000;
    let army: Army = {};
    const box = document.createElement('div');
    box.id = 'battle-draft';
    box.innerHTML = '<div class="menu-box draft"></div>';
    document.body.appendChild(box);
    const panel = box.firstElementChild as HTMLElement;
    const opt = (list: { id: string; name: string }[], sel: string) => list.map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    const render = () => {
      const spent = armyCost(you, army), camp = supplyCamp(you);
      // each row: a unit, or the supply camp (its stock is what your throwers restock from and the hungry eat)
      const rows = [...draftable(you).map((u) => ({ id: u.id, name: u.name, cost: unitCost(u), note: '' })),
        ...(camp ? [{ id: camp.id, name: camp.name, cost: campCost(camp), note: `supply camp: ${CAMP_STOCK.food} kg food, ${CAMP_STOCK.crystal} kg crystal` }] : [])];
      const map = BATTLE_MAPS.find((m) => m.id === mapId)!;
      panel.innerHTML = `<h1>Pitched Battle</h1>
        <p class="sub">Draft an army, deploy it on the field, and fight. No economy, no reinforcements: what you bring is what you have.</p>
        <div class="draft-row">You <select data-k="you">${opt(PLAYABLE, you.id)}</select> vs <select data-k="foe">${opt(PLAYABLE, foe.id)}</select></div>
        <div class="draft-row">Field <select data-k="map">${opt(BATTLE_MAPS, mapId)}</select> Budget <select data-k="budget">${BUDGETS.map((b) => `<option value="${b}" ${b === budget ? 'selected' : ''}>${b} food</option>`).join('')}</select></div>
        <p class="draft-map">${esc(map.description)}</p>
        <table class="draft-units">${rows.map((u) => `<tr><td><b>${esc(u.name)}</b>${u.note ? `<br><span class="dim">${u.note}</span>` : ''}</td><td class="dim">${u.cost} food</td>
          <td><button data-add="${u.id}" data-d="-1">−</button> <span class="n">${army[u.id] ?? 0}</span> <button data-add="${u.id}" data-d="1" ${spent + u.cost > budget ? 'disabled' : ''}>+</button></td></tr>`).join('')}</table>
        <div class="draft-total ${spent > budget ? 'over' : ''}">Spent <b>${spent}</b> of ${budget} food</div>
        <div class="draft-go"><a href="./" class="back">← Menu</a><button data-go ${spent === 0 ? 'disabled' : ''}><b>Deploy</b></button></div>`;
    };
    box.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.dataset.k === 'you') { you = PLAYABLE.find((f) => f.id === t.value)!; army = {}; }
      if (t.dataset.k === 'foe') foe = PLAYABLE.find((f) => f.id === t.value)!;
      if (t.dataset.k === 'map') mapId = t.value;
      if (t.dataset.k === 'budget') { budget = +t.value; while (armyCost(you, army) > budget) { const id = Object.keys(army).find((k) => army[k] > 0)!; army[id]--; } }
      render();
    });
    box.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!t || t.disabled) return;
      if (t.dataset.add) {
        const n = Math.max(0, (army[t.dataset.add] ?? 0) + +t.dataset.d!);
        army = { ...army, [t.dataset.add]: n };
        if (armyCost(you, army) > budget) army[t.dataset.add]--;
        render();
      }
      if (t.dataset.go !== undefined) {
        box.remove();
        history.replaceState(null, '', `?mode=battle&you=${you.id}&foe=${foe.id}&map=${mapId}&budget=${budget}`);
        done({ you, foe, mapId, budget, army: Object.fromEntries(Object.entries(army).filter(([, n]) => n > 0)) });
      }
    });
    render();
  });
}
