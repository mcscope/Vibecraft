// Codex: a faction's tech tree, units and abilities, drawn from its spec and
// its finished art (through the same contract the game uses).
import './style.css';
import type { BuildingSpec, FactionSpec, ResourceKind, TechSpec, UnitSpec } from './factions/types';
import type { ArtAnim, FactionArt, Sprite } from './art/contract';
import { unitSprite } from './art/contract';
import { blit, spriteIcon } from './art/draw';
import { meadowfolk } from './factions/meadowfolk';
import { training } from './factions/training';
import { capitalFor, CAP, derive, deriveBuilding, prerequisites, techCost, techGate, techStart, techTime } from './sim/physics';
import { TEAM_COLORS } from './render/artbank';
import { statsTable } from './ui/hud';

const FACTIONS: FactionSpec[] = [meadowfolk, training];
const ANIMS: ArtAnim[] = ['idle', 'walk', 'attack', 'gather', 'eat', 'tired', 'die', 'carryFood', 'carryWood', 'carryCrystal'];
const FACING = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

type Sel = { kind: 'unit' | 'building' | 'tech'; id: string };

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const status = $('#status'), tree = $('#tree'), detail = $('#detail'), nav = $('#factions');
const artCache = new Map<string, Promise<FactionArt | null>>();
const iconCache = new Map<string, string>();

let faction: FactionSpec = FACTIONS[0];
let art: FactionArt | null = null;
let sel: Sel | null = null;
/** What the big viewer is playing. */
const view = { anim: 'idle' as ArtAnim, facing: null as number | null, canvas: null as HTMLCanvasElement | null, unit: null as string | null, t0: performance.now() };

const n0 = (v: number) => Math.round(v).toLocaleString();
const f1 = (v: number, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const resName = (r: ResourceKind) => faction.resourceNames?.[r] ?? { food: 'Food', wood: 'Wood', crystal: 'Crystal' }[r];
const res = (r: ResourceKind) => resName(r).toLowerCase();

function loadArt(f: FactionSpec): Promise<FactionArt | null> {
  let p = artCache.get(f.id);
  if (!p) {
    p = f.art ? f.art(TEAM_COLORS[0], (x, label) => { if (f === faction) status.textContent = `Loading ${f.name} art: ${label} (${Math.round(x * 100)}%)`; }) : Promise.resolve(null);
    artCache.set(f.id, p);
  }
  return p;
}

function icon(kind: 'unit' | 'building', id: string, size: number): string {
  const key = `${faction.id}/${kind}/${id}/${size}`;
  const hit = iconCache.get(key);
  if (hit !== undefined) return hit;
  let s: Sprite | undefined;
  if (kind === 'unit') { const ua = art?.units[id]; s = ua && unitSprite(ua, 'idle', 1, { time: 0 }); }
  else s = art?.buildings[id]?.complete;
  const url = s ? spriteIcon(s, size * 2).toDataURL() : '';
  if (art) iconCache.set(key, url);
  return url;
}
const img = (kind: 'unit' | 'building', id: string, size: number, cls = '') => {
  const url = icon(kind, id, size);
  return url ? `<img class="${cls}" src="${url}" width="${size}" height="${size}" alt="">` : `<div class="${cls} noart" style="width:${size}px;height:${size}px">?</div>`;
};

// ── Tree layout ────────────────────────────────────────────────────────────

/** Column = length of the longest chain of prerequisites below a building. */
function depth(b: BuildingSpec, seen = new Set<string>()): number {
  if (seen.has(b.id)) return 0;
  seen.add(b.id);
  let d = 0;
  for (const id of b.requires ?? []) {
    const r = faction.buildings?.find((x) => x.id === id);
    if (r) d = Math.max(d, depth(r, seen) + 1);
  }
  return d;
}

const unitById = (id: string) => faction.units.find((u) => u.id === id);
const techById = (id: string) => faction.techs?.find((t) => t.id === id);
const buildingById = (id: string) => faction.buildings?.find((b) => b.id === id);
const trainedAt = (u: UnitSpec) => (faction.buildings ?? []).filter((b) => b.trains?.includes(u.id) || (faction.carterId === u.id && b.carters));
const techsFor = (u: UnitSpec) => (faction.techs ?? []).filter((t) => t.unit === u.id);
const researchedAt = (t: TechSpec) => (faction.buildings ?? []).filter((b) => b.researches?.includes(t.id));

function badges(b: BuildingSpec): string {
  const st = deriveBuilding(b, faction);
  const out: string[] = [];
  if (b.attack && st.tower) out.push(`<span class="badge war" title="Throws ${b.attack.crystalMass} kg crystals from ${b.attack.height} m">Tower · ${n0(st.tower.damage)} dmg</span>`);
  if (b.gatherBoost) out.push(`<span class="badge eco" title="Gathering nearby is faster">Gather ×${f1(st.gatherBoost, 2)}</span>`);
  if (b.sow) out.push(`<span class="badge eco" title="Replants ${b.sow.resources.map(res).join(' and ')}">Sows</span>`);
  if (b.carters) out.push(`<span class="badge eco" title="Keeps a pool of supply carts">${b.carters} carts</span>`);
  if (b.unbuildable) out.push(`<span class="badge" title="You start with it; it can't be placed">Starting</span>`);
  return out.join('');
}

function renderTree(): void {
  const blds = faction.buildings ?? [];
  const cols: BuildingSpec[][] = [];
  for (const b of blds) (cols[depth(b)] ??= []).push(b);
  // starting buildings first, then ones that unlock more of the tree (short edges), then by cost
  const unlocks = (b: BuildingSpec) => blds.filter((x) => prerequisites(x, faction).includes(b)).length;
  for (const c of cols) c?.sort((a, b) => Number(!!b.unbuildable) - Number(!!a.unbuildable) || unlocks(b) - unlocks(a) || a.materials - b.materials);
  const placed = new Set(blds.flatMap((b) => [...(b.trains ?? []), ...(b.carters && faction.carterId ? [faction.carterId] : [])]));
  const loose = faction.units.filter((u) => !placed.has(u.id));

  const unitChip = (id: string, note = '') => {
    const u = unitById(id);
    if (!u) return '';
    const d = derive(u);
    return `<button class="chip unit ${isSel('unit', id)}" data-kind="unit" data-id="${id}">
      ${img('unit', id, 40)}<span><b>${esc(u.name)}</b><small>${note || `${d.foodCost} ${res('food')} · ${d.crystalCost} ${res('crystal')}`}</small></span></button>`;
  };
  const techChip = (id: string) => {
    const t = techById(id);
    if (!t) return '';
    const cost = techCost(techStart(t, faction), t.refinement);
    return `<button class="chip ctech ${isSel('tech', id)}" data-kind="tech" data-id="${id}">
      <i class="techmark ${t.channel === 'work' ? 'work' : ''}">${t.channel === 'work' ? '⚒' : '✦'}</i><span><b>${esc(t.name)}</b><small>${n0(cost)} ${res('wood')}</small></span></button>`;
  };

  tree.innerHTML = `
    <svg class="edges"></svg>
    ${cols.map((c, i) => `
      <div class="col">
        <h4>${i === 0 ? 'No prerequisites' : `Tier ${i + 1}`}</h4>
        ${(c ?? []).map((b) => {
          const st = deriveBuilding(b, faction);
          return `
          <div class="node ${isSel('building', b.id)}" data-node="${b.id}">
            <button class="bhead" data-kind="building" data-id="${b.id}">
              ${img('building', b.id, 72, 'bicon')}
              <span class="bname"><b>${esc(b.name)}</b><small>${n0(st.totalCost)} ${res('wood')} · supports ≤${f1(st.maxRefinement, 2)}×</small></span>
            </button>
            <div class="badges">${badges(b)}</div>
            ${(b.trains?.length || b.carters) ? `<div class="chips">${(b.trains ?? []).map((id) => unitChip(id)).join('')}${b.carters && faction.carterId ? unitChip(faction.carterId, `auto · pool of ${b.carters}`) : ''}</div>` : ''}
            ${b.researches?.length ? `<div class="chips">${b.researches.map(techChip).join('')}</div>` : ''}
          </div>`;
        }).join('')}
      </div>`).join('')}
    ${loose.length ? `<div class="col"><h4>Other units</h4><div class="node loose">${loose.map((u) => unitChip(u.id, u.dummy ? 'scenario only' : '')).join('')}</div></div>` : ''}`;
  requestAnimationFrame(drawEdges);
}

function isSel(kind: Sel['kind'], id: string): string {
  return sel && sel.kind === kind && sel.id === id ? 'sel' : '';
}

function drawEdges(): void {
  const svg = tree.querySelector<SVGSVGElement>('svg.edges');
  if (!svg) return;
  const box = tree.getBoundingClientRect();
  svg.setAttribute('width', `${tree.scrollWidth}`);
  svg.setAttribute('height', `${tree.scrollHeight}`);
  const at = (id: string) => tree.querySelector<HTMLElement>(`[data-node="${id}"] .bhead`)?.getBoundingClientRect();
  const lit = new Set<string>();
  if (sel?.kind === 'building') { const b = buildingById(sel.id); if (b) { lit.add(b.id); prerequisites(b, faction).forEach((p) => lit.add(p.id)); } }
  let paths = '';
  for (const b of faction.buildings ?? []) for (const r of b.requires ?? []) {
    const a = at(r), c = at(b.id);
    if (!a || !c) continue;
    const x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top;
    const x2 = c.left - box.left, y2 = c.top + c.height / 2 - box.top;
    const mx = (x1 + x2) / 2;
    const on = lit.has(b.id) && lit.has(r);
    paths += `<path class="${on ? 'on' : ''}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>`;
  }
  svg.innerHTML = paths;
}

// ── Detail panel ───────────────────────────────────────────────────────────

const row = (k: string, v: string, hint = '') => `<div class="st"><span title="${esc(hint)}">${k}</span><b>${v}</b></div>`;
const link = (kind: Sel['kind'], id: string, label: string) => `<a href="#${faction.id}/${kind}/${id}" class="xref">${esc(label)}</a>`;
const list = (items: string[]) => (items.length ? items.join(', ') : '—');

function unitAbilities(u: UnitSpec): string[] {
  const d = derive(u);
  const out: string[] = [];
  if (u.dummy) out.push('<b>Training dummy.</b> Never moves, eats or fights.');
  if (u.attack && d.canAttack) {
    out.push(u.attack.style === 'throw'
      ? `<b>Throws</b> ${u.attack.crystalMass} kg crystals, ${Math.round(d.loadoutCrystal / u.attack.crystalMass)} carried. ${n0(d.damage)} damage at range ${f1(d.range)}, ${f1(d.dps)} per second.`
      : `<b>Strikes</b> with a ${u.attack.crystalMass} kg crystal. ${n0(d.damage)} damage, reach ${f1(d.range)}, ${f1(d.dps)} per second.`);
  } else if (!u.dummy) out.push('<b>Unarmed.</b>');
  if (u.role === 'carter') out.push(`<b>Supply cart.</b> Produced automatically; loads ${n0(d.carryCapacity)} kg at its home building and carries it to whichever building needs it most.`);
  if (u.wheeled) out.push('<b>Wheeled.</b> Carries twice as much; a full load slows it less and costs fewer calories to haul.');
  if ((u.canGather ?? true) && !u.dummy && u.role !== 'carter') out.push(`<b>Gathers</b> ${f1(d.gatherRate, 2)} kg/s and carries ${n0(d.carryCapacity)} kg; also builds.`);
  if ((u.refinement ?? 1) > 1) out.push(`<b>Refined ${f1(u.refinement!, 2)}×</b> in combat: HP and damage ×${f1(Math.pow(u.refinement!, 2 / 3), 2)}. Its building needs ${n0(capitalFor(u.refinement!))} capital.`);
  if ((u.workRefinement ?? 1) > 1) out.push(`<b>Work-refined ${f1(u.workRefinement!, 2)}×</b>: gathers and walks that much faster.`);
  return out;
}

function unitDetail(u: UnitSpec): string {
  const d = derive(u);
  const ua = art?.units[u.id];
  const value = d.dps > 0 ? Math.pow(d.maxHp * d.dps, 0.75) / Math.max(1, d.foodCost + d.crystalCost) : 0;
  const anims = ua ? ANIMS.filter((a) => ua.anims[a]) : [];
  return `
    <div class="dhead"><h2>${esc(u.name)}</h2><code>${u.id}</code></div>
    ${ua ? `<div class="viewer"><canvas id="big"></canvas>
      <div class="ctrls">
        <div class="seg">${anims.map((a) => `<button data-anim="${a}" class="${view.anim === a ? 'on' : ''}">${a.replace(/^carry/, 'carry ')}</button>`).join('')}</div>
        <div class="seg"><button data-facing="" class="${view.facing === null ? 'on' : ''}">spin</button>${FACING.map((f, i) => `<button data-facing="${i}" class="${view.facing === i ? 'on' : ''}">${f}</button>`).join('')}</div>
      </div></div>` : '<div class="viewer noart">No art supplied: the game draws a placeholder.</div>'}
    <p class="desc">${esc(u.description)}</p>
    <h3>Abilities</h3>
    <ul class="abil">${unitAbilities(u).map((a) => `<li>${a}</li>`).join('')}</ul>
    <h3>Where</h3>
    <div class="facts">
      ${row('Trained at', list(trainedAt(u).map((b) => link('building', b.id, b.name))))}
      ${row('Upgraded by', list(techsFor(u).map((t) => link('tech', t.id, t.name))))}
      ${value ? row('Combat value', f1(value, 2), '(HP × DPS)^0.75 per resource spent: how much fight each unit of cost buys') : ''}
    </div>
    <h3>Body &amp; stats</h3>
    ${statsTable(u, d)}`;
}

function buildingAbilities(b: BuildingSpec): string[] {
  const st = deriveBuilding(b, faction);
  const out: string[] = [];
  if (b.trains?.length) out.push(`<b>Trains</b> ${b.trains.map((id) => link('unit', id, unitById(id)?.name ?? id)).join(', ')}.`);
  if (b.researches?.length) out.push(`<b>Researches</b> ${b.researches.map((id) => link('tech', id, techById(id)?.name ?? id)).join(', ')}.`);
  if (b.carters && faction.carterId) out.push(`<b>Cart pool.</b> Keeps ${b.carters} ${link('unit', faction.carterId, unitById(faction.carterId)?.name ?? 'carts')} that load here and supply other buildings.`);
  if (b.attack && st.tower) out.push(`<b>Tower.</b> ${b.attack.mechanism} kg mechanism throws ${b.attack.crystalMass} kg crystals from ${b.attack.height} m: ${n0(st.tower.damage)} damage, range ${f1(st.tower.range)}, every ${f1(st.tower.cooldown)} s. Burns ${f1(st.tower.foodPerShot, 2)} ${res('food')} per shot from its own stock.`);
  if (b.gatherBoost) out.push(`<b>Gathering ×${f1(st.gatherBoost, 2)}</b> for ${b.gatherBoost.resources.map(res).join(', ')} within ${b.gatherBoost.radius} tiles, from its own capital. Lose the building, lose the boost.`);
  if (b.sow) out.push(`<b>Sows</b> ${b.sow.resources.map(res).join(' and ')} within ${b.sow.radius} tiles. Its ${b.sow.mechanism} kg sowing mechanism plants ${f1(st.sowRate)} kg of future yield per second; seed costs ${Math.round(CAP.sowSeedFraction * 100)}% of the yield from its own stock, and plants grow to full in ${CAP.sowGrowSec} s.`);
  out.push(`<b>Drop-off and store.</b> Holds up to ${n0(st.cacheCap)} kg.`);
  return out;
}

function buildingDetail(b: BuildingSpec): string {
  const st = deriveBuilding(b, faction);
  const ba = art?.buildings[b.id];
  const unlocks = (faction.buildings ?? []).filter((x) => x.requires?.includes(b.id));
  const states: Array<[string, Sprite]> = ba ? [
    ...ba.construction.map((s, i) => [`building ${i + 1}/${ba.construction.length}`, s] as [string, Sprite]),
    ['complete', ba.complete],
    ...ba.damaged.map((s, i) => [`damaged ${i + 1}`, s] as [string, Sprite]),
  ] : [];
  return `
    <div class="dhead"><h2>${esc(b.name)}</h2><code>${b.id}</code></div>
    ${ba ? `<div class="hero">${img('building', b.id, 220)}</div><div class="states">${states.map(([label], i) => `<figure><canvas data-state="${i}"></canvas><figcaption>${label}</figcaption></figure>`).join('')}</div>` : '<div class="viewer noart">No art supplied: the game draws a placeholder.</div>'}
    <p class="desc">${esc(b.description)}</p>
    <h3>Abilities</h3>
    <ul class="abil">${buildingAbilities(b).map((a) => `<li>${a}</li>`).join('')}</ul>
    <h3>Tree</h3>
    <div class="facts">
      ${row('Requires', list((b.requires ?? []).map((id) => link('building', id, buildingById(id)?.name ?? id))))}
      ${row('Unlocks', list(unlocks.map((x) => link('building', x.id, x.name))))}
    </div>
    <h3>Stats</h3>
    <div class="stats">
      ${row('Cost', `${n0(st.totalCost)} ${res('wood')}`, 'Everything carried to the site: materials plus equipment')}
      ${row('Capital', n0(st.capital), 'Its materials')}
      ${row('With links', n0(st.effectiveCapital), 'Plus every prerequisite, counted once')}
      ${row('Supports', `≤ ${f1(st.maxRefinement, 2)}×`, 'Highest refinement it can train or research toward')}
      ${row('Hit points', n0(st.maxHp), `${CAP.hpPerMaterial} per kg of materials`)}
      ${row('Store', `${n0(st.cacheCap)} kg`)}
      ${row('Footprint', `${b.size}×${b.size}`)}
      ${st.attackCost ? row('Equipment', `${n0(st.attackCost)} ${res('wood')}`, 'Weapon, height and sowing mechanism; not capital') : ''}
    </div>`;
}

function techDetail(t: TechSpec): string {
  const u = unitById(t.unit);
  const from = techStart(t, faction);
  const cost = techCost(from, t.refinement), gate = techGate(from, t.refinement);
  const work = t.channel === 'work';
  let diff = '';
  if (u) {
    // stats before and after, with the faction's earlier techs for this unit assumed researched
    const prior = (faction.techs ?? []).slice(0, (faction.techs ?? []).indexOf(t)).filter((x) => x.unit === t.unit);
    const pc = prior.filter((x) => x.channel !== 'work').reduce((a, x) => a + x.refinement, 0);
    const pw = prior.filter((x) => x.channel === 'work').reduce((a, x) => a + x.refinement, 0);
    const a = derive(u, pc, pw), b = derive(u, pc + (work ? 0 : t.refinement), pw + (work ? t.refinement : 0));
    const line = (k: string, x: number, y: number, d = 0) => (Math.abs(x - y) > 1e-6 ? `<tr><td>${k}</td><td>${f1(x, d)}</td><td>→</td><td><b>${f1(y, d)}</b></td><td class="up">+${Math.round((y / x - 1) * 100)}%</td></tr>` : '');
    diff = `<table class="diff">${line('Hit points', a.maxHp, b.maxHp)}${line('Damage', a.damage, b.damage)}${line('Dmg / sec', a.dps, b.dps, 1)}${line('Gather kg/s', a.gatherRate, b.gatherRate, 2)}${line('Speed t/s', a.speed, b.speed, 2)}</table>`;
  }
  return `
    <div class="dhead"><h2>${esc(t.name)}</h2><code>${t.id}</code></div>
    ${u ? `<div class="hero small">${img('unit', u.id, 140)}</div>` : ''}
    <p class="desc">${esc(t.description)}</p>
    <h3>Effect</h3>
    <ul class="abil"><li><b>${work ? 'Work' : 'Combat'} refinement +${t.refinement}</b> for every ${u ? link('unit', u.id, u.name) : t.unit}, existing ones too: ${f1(from, 2)}× → ${f1(from + t.refinement, 2)}×. ${work ? 'Gather rate and speed.' : 'Hit points and damage.'}</li></ul>
    ${diff}
    <h3>Research</h3>
    <div class="facts">
      ${row('At', list(researchedAt(t).map((b) => link('building', b.id, b.name))))}
      ${row('Cost', `${n0(cost)} ${res('wood')}`, `${Math.round(CAP.techRate * 100)}% of the capital step on the curve; burned`)}
      ${row('Needs', `${n0(gate)} capital`, 'The researching building, with its links')}
      ${row('Time', `${n0(techTime(cost))} s`)}
    </div>`;
}

function renderDetail(): void {
  view.canvas = null; view.unit = null;
  if (!sel) {
    detail.innerHTML = `<div class="empty"><h2>${esc(faction.name)}</h2>
      <p>${faction.units.length} units · ${faction.buildings?.length ?? 0} buildings · ${faction.techs?.length ?? 0} technologies.</p>
      <p>Pick anything in the tree to see its art, abilities and numbers. Every stat is derived from the design's physical description, so these are exactly what the game uses.</p></div>`;
    return;
  }
  const u = sel.kind === 'unit' ? unitById(sel.id) : undefined;
  const b = sel.kind === 'building' ? buildingById(sel.id) : undefined;
  const t = sel.kind === 'tech' ? techById(sel.id) : undefined;
  detail.innerHTML = u ? unitDetail(u) : b ? buildingDetail(b) : t ? techDetail(t) : '<div class="empty">Not found.</div>';
  detail.scrollTop = 0;
  if (u && art?.units[u.id]) {
    const ua = art.units[u.id];
    if (!ua.anims[view.anim]) view.anim = 'idle';
    view.canvas = detail.querySelector<HTMLCanvasElement>('#big');
    view.unit = u.id;
  }
  if (b && art?.buildings[b.id]) {
    const ba = art.buildings[b.id];
    const all = [...ba.construction, ba.complete, ...ba.damaged];
    detail.querySelectorAll<HTMLCanvasElement>('canvas[data-state]').forEach((c) => {
      const s = all[+c.dataset.state!];
      const icon = spriteIcon(s, 192);
      c.width = icon.width; c.height = icon.height;
      c.getContext('2d')!.drawImage(icon, 0, 0);
    });
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────

function parseHash(): void {
  const [fid, kind, id] = location.hash.slice(1).split('/');
  const f = FACTIONS.find((x) => x.id === fid) ?? FACTIONS[0];
  const s: Sel | null = kind && id && ['unit', 'building', 'tech'].includes(kind) ? { kind: kind as Sel['kind'], id } : null;
  void show(f, s);
}

let showing = 0;
async function show(f: FactionSpec, s: Sel | null): Promise<void> {
  const ticket = ++showing;
  const switched = f !== faction || !nav.innerHTML;
  faction = f;
  sel = s;
  nav.innerHTML = FACTIONS.map((x) => `<a href="#${x.id}" class="${x === faction ? 'on' : ''}">${esc(x.name)}</a>`).join('');
  if (switched) {
    art = null;
    renderTree(); renderDetail();
    status.textContent = f.art ? `Loading ${f.name} art…` : '';
    const a = await loadArt(f);
    if (ticket !== showing) return;
    art = a;
    status.textContent = '';
  }
  renderTree(); renderDetail();
}

tree.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]');
  if (!el) return;
  const same = sel?.kind === el.dataset.kind && sel?.id === el.dataset.id;
  location.hash = same ? faction.id : `${faction.id}/${el.dataset.kind}/${el.dataset.id}`;
});
detail.addEventListener('click', (e) => {
  const el = e.target as HTMLElement;
  if (el.dataset.anim) { view.anim = el.dataset.anim as ArtAnim; view.t0 = performance.now(); }
  else if (el.dataset.facing !== undefined) view.facing = el.dataset.facing === '' ? null : +el.dataset.facing;
  else return;
  el.parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
});
window.addEventListener('hashchange', parseHash);
window.addEventListener('resize', () => requestAnimationFrame(drawEdges));

function frame(now: number): void {
  const c = view.canvas, ua = view.unit ? art?.units[view.unit] : undefined;
  if (c && ua && c.isConnected) {
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (w && c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const t = (now - view.t0) / 1000;
    const dir = view.facing ?? Math.floor(t / 1.6) % 8;
    const oneShot = view.anim === 'attack' || view.anim === 'die';
    const s = unitSprite(ua, view.anim, dir, oneShot ? { progress: Math.min(1, (t % 1.8) / 1.2) } : { time: t });
    blit(ctx, s, w / 2, h * 0.84, Math.min(2.4, (h * 0.7) / ua.height));
    ctx.fillStyle = 'rgba(233,223,196,0.55)';
    ctx.font = '12px "Alegreya Sans", sans-serif';
    ctx.fillText(FACING[dir], 10, h - 10);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
parseHash();
