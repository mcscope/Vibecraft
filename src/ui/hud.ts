import { capacity } from '../sim/garrison';
import { FORMATIONS, formationSlots, formationUnit, type Formation } from './formations';
import { metamorphCost } from '../sim/abilities/metamorph';
import { resourceName, workerName, baseName, carterName } from '../factions/types';
// DOM overlay: resources, selection panel, build / train / research buttons, tooltips.
import type { ResourceKind, Stock, UnitSpec } from '../factions/types';
import { itemCost, MAX_QUEUE, plantKg, RESOURCES, type Building, type Unit, type World } from '../sim/world';
import { CAP, capitalFor, derive, type DerivedStats } from '../sim/physics';
import { f1, fmt, have, n0, need, pct } from './format';
import { unitFrame } from '../render/renderer';
import { teamColor } from '../render/artbank';
import { blit, spriteIcon, spriteToCanvas } from '../art/draw';
import { unitSprite } from '../art/contract';
import type { ArtBank } from '../render/artbank';
import { keymap, onSettings } from './settings';

export interface HudActions {
  train(buildingId: number, specId: string): void;
  research(buildingId: number, techId: string): void;
  cancelTrain(buildingId: number, index?: number): void;
  select(ids: number[]): void;
  command(kind: 'stop' | 'attackMove' | 'move' | 'patrol' | 'resupply' | 'give' | 'garrison' | 'hold' | 'charge'): void;
  /** Put the selection in a formation, and which one it's in now. */
  formation(f: Formation): void;
  formationOf(): Formation;
  /** Change the selected units that can into this form, or (`spawn`) have them grow one (sim/abilities/metamorph.ts). */
  morph(into: string, spawn: boolean): void;
  /** Cancel a spawn queued in the selected units (default: the last). */
  cancelSpawn(index?: number): void;
  ungarrison(buildingId: number): void;
  place(specId: string): void;
  idleWorker(): void;
  autoTrain(buildingId: number, specId: string | null): void;
  setSowing(buildingId: number, resources: Array<'food' | 'wood'>): void;
}


export function statsTable(spec: UnitSpec, stats: DerivedStats = derive(spec), food = 'food'): string {
  const d = stats;
  const row = (k: string, v: string, hint = '') => `<div class="st"><span title="${hint}">${k}</span><b>${v}</b></div>`;
  return `
    <div class="stats">
      ${row('Mass', `${fmt(d.mass)} kg`, 'Body mass — everything derives from this')}
      ${row('Build', `${fmt(d.physique.muscle * 100)}/${fmt(d.physique.frame * 100)}/${fmt(d.physique.reserve * 100)}`, 'muscle / frame / reserve %')}
      ${row('Refinement', `${fmt(d.refinement, 2)}×`, `Resource efficiency: the body costs 1/r of its ${food}. Paid for once, in building capital and research`)}
      ${d.workRefinement > 1 ? row('Work', `${fmt(d.workRefinement, 2)}×`, 'Work refinement: gather rate, speed and carry') : ''}
      ${row('Hit points', fmt(d.maxHp), 'From frame mass × refinement^⅔')}
      ${row('Calories', fmt(d.maxCalories), 'From reserve mass')}
      ${row('Speed', `${fmt(d.speed, 2)} t/s`, 'Unloaded; packs slow you down')}
      ${row('Carry', d.loadoutCrystal > 0 ? `${have(d.cargoCapacity)} kg + ${f1(d.loadoutCrystal)} kg weapon` : `${have(d.cargoCapacity)} kg`, 'Cargo pack, plus the weapon pack for its crystals')}
      ${row('Crystal', spec.attack && d.canAttack ? `${spec.attack.crystalMass} kg ${spec.attack.style}${spec.attack.style === 'throw' ? ` ×${Math.round(d.loadoutCrystal / spec.attack.crystalMass)}` : ''}` : 'none')}
      ${row('Damage', fmt(d.damage), '½·m·v² × efficiency × refinement^⅔')}
      ${row('Dmg / sec', fmt(d.dps, 1))}
      ${row('Range', `${fmt(d.range, 1)} t`)}
      ${row('Cost', `${d.foodCost} ${food} · ${d.crystalCost} crys`)}
    </div>`;
}

interface Portrait { canvas: HTMLCanvasElement; owner: number; specId: string; unit?: Unit }

export class Hud {
  private top: HTMLElement;
  private panel: HTMLElement;
  private tooltip: HTMLElement;
  private sig = '';
  private portraits: Portrait[] = [];
  private t = 0;
  private resEls: Record<string, HTMLElement> = {};
  private lastDom = -1;
  private lastPortraits = 0;
  private icons = new Map<string, string>();

  /** Cached data-URL thumbnails of baked sprites, for buttons. */
  private icon(kind: 'building' | 'unit', id: string, size: number): string {
    const key = `${kind}/${id}/${size}`;
    let url = this.icons.get(key);
    if (url === undefined) {
      const ua = kind === 'unit' ? this.bank.unit(this.player, id) : undefined;
      const sprite = kind === 'building' ? this.bank.building(this.player, id)?.complete : ua ? unitSprite(ua, 'idle', 1, { time: 0 }) : undefined;
      url = sprite ? spriteIcon(sprite, size * 2).toDataURL() : '';
      this.icons.set(key, url);
    }
    return url;
  }

  constructor(private world: World, private player: number, private bank: ArtBank, private actions: HudActions) {
    const root = document.getElementById('hud')!;
    this.top = root.querySelector('#topbar')!;
    this.panel = root.querySelector('#panel')!;
    this.tooltip = root.querySelector('#tooltip')!;
    const icon = (c: HTMLCanvasElement) => `<img class="icon" src="${c.toDataURL()}" alt="">`;
    const villager = bank.unit(player, world.factionOf(player).workerId);
    const names = this.names();
    this.top.innerHTML = `
      <span class="res" title="${names.food}: trains units, refills calories.">${icon(spriteToCanvas(bank.biome.bushes[bank.biome.bushes.length - 1], 40, 1.1))}<b data-res="food"></b></span>
      <span class="res" title="${names.wood}: buildings (their capital) and research.">${icon(spriteToCanvas(bank.biome.trees[0], 40, 1.05))}<b data-res="wood"></b></span>
      <span class="res" title="${names.crystal}: weapons and ammo.">${icon(spriteToCanvas(bank.biome.mines[bank.biome.mines.length - 1], 40, 1.1))}<b data-res="crystal"></b></span>
      <span class="res" title="Units">${villager ? icon(spriteToCanvas(unitSprite(villager, 'idle', 1, { time: 0 }), 40, 1.5)) : ''}<b data-res="pop"></b></span>
      <button class="idle-btn" data-idle title="Select the next idle ${workerName(world.factionOf(player)).toLowerCase()} (.)">Idle <b data-res="idle"></b></button>
      <span class="res clock" data-res="clock"></span>
      <span class="res fps" data-res="fps"></span>`;
    this.top.querySelectorAll<HTMLElement>('[data-res]').forEach((el) => (this.resEls[el.dataset.res!] = el));
    this.top.querySelector('[data-idle]')!.addEventListener('click', () => this.actions.idleWorker());
    this.panel.addEventListener('click', (e) => this.onClick(e));
    // hold a train button to toggle auto-train for that unit
    let hold: { timer: number; el: HTMLElement } | null = null;
    this.panel.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const el = (e.target as HTMLElement).closest('[data-train]') as HTMLElement | null;
      if (!el) return;
      el.classList.add('holding');
      hold = {
        el,
        timer: window.setTimeout(() => {
          const b = this.world.buildings.get(+el.dataset.building!);
          if (b) this.actions.autoTrain(b.id, b.autoTrain === el.dataset.train ? null : el.dataset.train!);
          this.suppressClick = true;
          el.classList.remove('holding');
          hold = null;
        }, 450),
      };
    });
    const release = () => { if (hold) { clearTimeout(hold.timer); hold.el.classList.remove('holding'); hold = null; } };
    window.addEventListener('pointerup', release);
    this.panel.addEventListener('pointerleave', release);
    this.panel.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const el = (e.target as HTMLElement).closest('[data-train],[data-research],[data-morph]') as HTMLElement | null;
      if (el?.dataset.morph) { if (el.dataset.spawn === '1') this.actions.cancelSpawn(); return; }
      if (el) this.actions.cancelTrain(+el.dataset.building!);
    });
    this.panel.addEventListener('mousemove', (e) => this.onHover(e));
    this.panel.addEventListener('mouseleave', () => (this.tooltip.style.display = 'none'));
    onSettings(() => { this.sig = ''; }); // rebuild panels so key hints update
  }

  private names(): Record<ResourceKind, string> {
    const n = this.world.factionOf(this.player).resourceNames ?? {};
    return { food: n.food ?? 'Food', wood: n.wood ?? 'Wood', crystal: n.crystal ?? 'Crystal' };
  }

  private suppressClick = false;

  private onClick(e: MouseEvent): void {
    if (this.suppressClick) { this.suppressClick = false; return; } // that was a hold, not a click
    const el = (e.target as HTMLElement).closest('[data-train],[data-research],[data-cancel],[data-select],[data-cmd],[data-morph],[data-brood],[data-formation],[data-place],[data-sow],[data-ungarrison]') as HTMLElement | null;
    if (!el || el.classList.contains('locked')) return;
    if (el.dataset.ungarrison) { this.actions.ungarrison(+el.dataset.ungarrison); return; }
    if (el.dataset.sow) {
      const b = this.world.buildings.get(+el.dataset.building!);
      if (!b) return;
      const r = el.dataset.sow as 'food' | 'wood';
      this.actions.setSowing(b.id, b.sowing.includes(r) ? b.sowing.filter((x) => x !== r) : [...b.sowing, r]);
      return;
    }
    if (el.dataset.train) this.actions.train(+el.dataset.building!, el.dataset.train);
    else if (el.dataset.research) this.actions.research(+el.dataset.building!, el.dataset.research);
    else if (el.dataset.cancel) this.actions.cancelTrain(+el.dataset.cancel, el.dataset.index ? +el.dataset.index : undefined);
    else if (el.dataset.select) this.actions.select(el.dataset.select.split(',').map(Number));
    else if (el.dataset.cmd) this.actions.command(el.dataset.cmd as 'stop');
    else if (el.dataset.morph) this.actions.morph(el.dataset.morph, el.dataset.spawn === '1');
    else if (el.dataset.brood) this.actions.cancelSpawn(+el.dataset.brood);
    else if (el.dataset.formation) { this.actions.formation(el.dataset.formation as Formation); this.sig = ''; }
    else if (el.dataset.place) this.actions.place(el.dataset.place);
  }

  private onHover(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest('[data-train],[data-research],[data-place]') as HTMLElement | null;
    if (!el) { this.tooltip.style.display = 'none'; return; }
    const w = this.world;
    if (el.dataset.train) {
      const s = w.specOf(this.player, el.dataset.train)!;
      this.tooltip.innerHTML = `<h3>${s.spec.name}</h3><p>${s.spec.description}</p>${statsTable(s.spec, s.stats, this.names().food.toLowerCase())}<p class="hint">${fmt(s.stats.trainTime)} s · paid from this building's stock · Click: train · Hold: auto-train on/off · Right-click: cancel last</p>`;
    } else if (el.dataset.research) {
      const t = w.techOf(this.player, el.dataset.research)!;
      const b = w.buildings.get(+el.dataset.building!);
      const st = w.techStatus(this.player, t.id, b);
      const from = w.refinementOf(this.player, t.unit);
      const unit = w.specOf(this.player, t.unit)?.spec.name ?? t.unit;
      this.tooltip.innerHTML = `<h3>${t.name}</h3><p>${t.description}</p>${t.flavor ? `<p class="flavor">${t.flavor}</p>` : ''}
        <p>${unit}: refinement <b>${fmt(from, 2)} → ${fmt(from + t.refinement, 2)}</b> everywhere, existing units included.</p>
        <p>Costs <b>${st.cost} ${this.names().wood}</b> (burned) · needs a ${n0(st.gate)}-capital building${st.blocker ? ` · <span class="bad">${st.blocker}</span>` : ''}</p>`;
    } else {
      const spec = w.buildingSpecOf(this.player, el.dataset.place!)!;
      const st = w.buildingStatsOf(this.player, spec.id)!;
      const block = w.buildBlocker(this.player, spec.id);
      const what = [
        spec.trains?.length ? `Trains ${spec.trains.map((id) => w.specOf(this.player, id)?.spec.name ?? id).join(', ')}` : '',
        spec.researches?.length ? `Researches ${spec.researches.length} technologies` : '',
        st.tower ? `Throws ${spec.attack!.crystalMass} kg crystals for ${n0(st.tower.damage)} damage, range ${fmt(st.tower.range, 1)}` : '',
        spec.gatherBoost ? `Gathering within ${spec.gatherBoost.radius} tiles ×${fmt(st.gatherBoost, 2)}, burning crystal` : '',
        spec.sow ? `Sows ${spec.sow.resources.map((r) => this.names()[r].toLowerCase()).join(' and ')} within ${spec.sow.radius} tiles` : '',
        spec.carters ? `Always keeps ${spec.carters} ${carterName(w.factionOf(this.player)).toLowerCase()}${spec.carters > 1 ? 's' : ''}; train more by hand` : '',
      ].filter(Boolean).join(' · ');
      this.tooltip.innerHTML = `<h3>${spec.name}</h3><p>${spec.description}</p>
        <div class="stats">
          <div class="st"><span>Materials (capital)</span><b>${n0(st.capital)}</b></div>
          <div class="st"><span>With links</span><b>${n0(st.effectiveCapital)}</b></div>
          <div class="st"><span>Supports refinement</span><b>≤ ${fmt(st.maxRefinement, 2)}×</b></div>
          <div class="st"><span>Hit points</span><b>${n0(st.maxHp)}</b></div>
          <div class="st"><span>Footprint</span><b>${spec.size}×${spec.size}</b></div>
          ${st.attackCost ? `<div class="st"><span>Weapon + height</span><b>${n0(st.attackCost)}</b></div>` : ''}
        </div>
        <p>${what}</p>
        <p class="hint">${workerName(w.factionOf(this.player))}s carry ${n0(st.totalCost)} ${this.names().wood} to the site${spec.requires?.length ? ` · requires ${spec.requires.map((r) => w.buildingSpecOf(this.player, r)?.name ?? r).join(', ')}` : ''}${block ? ` · <span class="bad">${block}</span>` : ''}</p>`;
    }
    this.tooltip.style.display = 'block';
    const r = el.getBoundingClientRect();
    this.tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - 420, r.left))}px`;
    this.tooltip.style.bottom = `${window.innerHeight - r.top + 8}px`;
  }

  update(dt: number, selected: Set<number>, fps: number): void {
    this.t += dt;
    this.drawPortraits();
    // DOM writes trigger style/layout work; 10 Hz is plenty for numbers and bars.
    if (this.t - this.lastDom < 0.1) return;
    this.lastDom = this.t;
    void fps;
    const w = this.world;
    const stock = w.stockOf(this.player);
    const base = w.baseOf(this.player)?.stock ?? { food: 0, wood: 0, crystal: 0 };
    const mins = Math.floor(w.tick / 20 / 60), secs = Math.floor(w.tick / 20) % 60;
    // main number = at the town center; (+N) = held in other buildings' own caches
    for (const r of RESOURCES) {
      const elsewhere = stock[r] - base[r];
      this.resEls[r].innerHTML = `${have(base[r])}${elsewhere >= 1 ? ` <small>(+${have(elsewhere)})</small>` : ''}`;
    }
    const idle = w.unitsOf(this.player).filter((u) => u.specId === w.factionOf(this.player).workerId && u.order.kind === 'idle').length;
    this.resEls.idle.textContent = `${idle}`;
    this.resEls.idle.parentElement!.classList.toggle('none', idle === 0);
    this.resEls.pop.textContent = `${w.unitsOf(this.player).length}`;
    this.resEls.clock.textContent = `${mins}:${String(secs).padStart(2, '0')}`;

    const units = [...selected].map((id) => w.units.get(id)).filter((u): u is Unit => !!u);
    const building = [...selected].map((id) => w.buildings.get(id)).find((b): b is Building => !!b);
    const p = w.players[this.player];
    const stances = units.map((u) => u.stance[0] + u.brood.length).join('') + (units.length > 1 ? this.actions.formationOf() + doing(units) : '');
    const sig = units.length === 1 ? `u${units[0].id}:${stances}${doing(units)}:${units[0].order.kind}:${units[0].brood.map((b) => b.into).join(',')}`
      : building ? `b${building.id}:${building.complete}:${building.queue.map((q) => (q.kind === 'unit' ? q.specId : q.techId)).join(',')}:${p.researched.length}:${building.owner}:${building.sowing.join('')}:${building.garrison.length}`
      : `m${units.map((u) => u.id).join(',')}:${stances}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.portraits = [];
      if (units.length === 1) this.panel.innerHTML = this.unitPanel(units[0]);
      else if (building) this.panel.innerHTML = this.buildingPanel(building);
      else if (units.length > 1) this.panel.innerHTML = this.groupPanel(units);
      else {
        const km = keymap();
        this.panel.innerHTML = `<div class="empty">Drag to select · Right-click to command · <kbd>${km.attackMove.toUpperCase()}</kbd> attack-move · <kbd>${km.stop.toUpperCase()}</kbd> stop · <kbd>${km.resupply.toUpperCase()}</kbd> resupply (hold + click: go there after) · <kbd>${km.give.toUpperCase()}</kbd> give · <kbd>${km.home.toUpperCase()}</kbd> ${baseName(this.world.factionOf(this.player)).toLowerCase()} · <kbd>F10</kbd> settings</div>`;
      }
      this.panel.querySelectorAll<HTMLCanvasElement>('canvas[data-portrait]').forEach((c) => {
        const [owner, specId, uid] = c.dataset.portrait!.split(':');
        this.portraits.push({ canvas: c, owner: +owner, specId, unit: uid ? w.units.get(+uid) : undefined });
      });
    }
    if (units.length === 1) this.updateUnit(units[0]);
    if (building) this.updateBuilding(building);
    this.panel.querySelectorAll<HTMLElement>('[data-place]').forEach((el) => {
      const id = el.dataset.place!;
      el.classList.toggle('locked', !!w.buildBlocker(this.player, id));
      // striped when there isn't enough banked wood to finish it
      const missing = (w.buildingStatsOf(this.player, id)?.totalCost ?? 0) - stock.wood;
      el.classList.toggle('short', missing > 0);
      const needEl = el.querySelector<HTMLElement>('.need');
      if (needEl) needEl.textContent = missing > 0 ? `need ${need(missing)} more` : '';
    });
  }

  private updateUnit(u: Unit): void {
    const w = this.world;
    this.setBar('hp', u.hp, u.stats.maxHp, `${Math.ceil(u.hp)} / ${Math.round(u.stats.maxHp)}`);
    if (!u.dummy) {
      this.setBar('cal', u.cal, u.stats.maxCalories, `${Math.floor(u.cal)} / ${Math.round(u.stats.maxCalories)} cal${u.exhausted ? ' — exhausted' : u.cal < u.stats.maxCalories * 0.2 ? ' — hungry' : ''}`);
      const load = w.cargo(u);
      const names = this.names();
      const parts = ([['crystal', u.crystal], ['food', u.food], ['wood', u.wood]] as Array<[ResourceKind, number]>).filter(([, v]) => v > 0.05).map(([k, v]) => `${names[k]} ${have(v)}`).join(' · ');
      const pack = this.panel.querySelector<HTMLElement>('[data-bar="pack"]');
      if (pack) {
        // the cargo pack: one segment per resource, each in its own colour (weapon pack shown separately)
        const cap = u.stats.cargoCapacity;
        for (const [r, v] of [['crystal', u.crystal], ['food', u.food], ['wood', u.wood]] as Array<[ResourceKind, number]>) {
          const seg = pack.querySelector<HTMLElement>(`i.${r}`);
          if (seg) seg.style.width = pct(v, cap);
        }
        pack.querySelector<HTMLElement>('span')!.textContent = `${have(load)} / ${have(cap)} kg${parts ? ` — ${parts}` : ''}`;
      }
    }
    const ammo = this.panel.querySelector<HTMLElement>('[data-ammo]');
    if (ammo) {
      const max = Math.max(1, Math.round(u.stats.loadoutCrystal / u.crystalMass));
      const have = Math.min(max, Math.floor(u.ammo / u.crystalMass + 1e-6));
      const sig = `${have}/${max}`;
      if (ammo.dataset.sig !== sig) {
        ammo.dataset.sig = sig;
        ammo.innerHTML = `<span>Crystals ${have}/${max}</span>` + Array.from({ length: max }, (_, i) => `<i class="${i < have ? 'on' : ''}"></i>`).join('');
      }
    }
    // laying or changing: the front of the queue, like a building's training bar
    const grow = this.panel.querySelector<HTMLElement>('[data-bar="grow"]');
    if (grow) {
      const food = this.names().food.toLowerCase();
      const o = u.order, b = u.brood[0];
      const job = o.kind === 'metamorph' ? { into: o.into, from: o.from ?? u.specId, paid: o.paid, t: o.t, spawn: false, mass: u.stats.mass }
        : b ? { into: b.into, from: u.specId, paid: b.paid, t: b.t, spawn: true, mass: undefined } : null;
      const from = job && w.specOf(u.owner, job.from), to = job && w.specOf(u.owner, job.into);
      const c = from && to ? metamorphCost(from.stats, to.stats, job!.spawn, job!.mass) : null;
      grow.querySelector<HTMLElement>('i')!.style.width = c && job ? pct(job.t, c.sec) : '0%';
      const label = grow.querySelector<HTMLElement>('span');
      if (label) label.textContent = !c || !job ? '' : job.t <= 0 && job.paid + 1e-6 < c.food ? `Waiting for ${need(c.food - job.paid)} ${food}${job.spawn ? ' in its pack' : ': in its pack, or Give it some'}` : `${to!.spec.name} ${Math.round((job.t / c.sec) * 100)}%`;
    }
    const st = this.panel.querySelector('[data-state]');
    if (st) st.textContent = describeOrder(w, u);
  }

  private updateBuilding(b: Building): void {
    const w = this.world;
    this.setBar('bhp', b.hp, b.maxHp, `${Math.ceil(b.hp)} / ${b.maxHp}`);
    if (!b.complete) { this.setBar('built', b.built, b.stats.totalCost, `${have(b.built)} / ${need(b.stats.totalCost)} ${this.names().wood} delivered`); return; }
    const item = b.queue[0];
    const bar = this.panel.querySelector<HTMLElement>('[data-bar="train"]');
    if (bar) {
      bar.querySelector<HTMLElement>('i')!.style.width = item ? pct(item.progress, item.total) : '0%';
      const label = bar.querySelector<HTMLElement>('span');
      if (label) label.textContent = item && !item.paid ? `Waiting for ${this.missing(b, itemCost(item))} here — ${this.supplyNote(b, itemCost(item))}` : '';
    }
    const names = this.names();
    const target = w.logistics.supplyTargets(b);
    for (const r of RESOURCES) {
      const max = Math.max(1, target[r], b.stock[r]);
      this.setBar(`stock-${r}`, b.stock[r], max, target[r] > 1 ? `${names[r]} ${have(b.stock[r])} / ${need(target[r])}` : `${names[r]} ${have(b.stock[r])}`);
    }
      const grow = this.panel.querySelector<HTMLElement>('[data-grow]');
      if (grow && b.grown !== undefined) {
        // a living building (sim/abilities/living.ts)
        grow.textContent = b.grown >= b.spec.materials - 0.5
          ? `Fully grown (${Math.round(b.spec.materials)} kg)`
          : `Growing ${Math.floor(b.grown)} / ${Math.round(b.spec.materials)} kg · eats ${this.names().food.toLowerCase()} from its stock${b.stock.food < 0.5 ? ' (none here: haul some over)' : ''}`;
      }
    const carts = this.panel.querySelector('[data-carts]');
    if (carts) {
      let pool = 0;
      for (const u of w.units.values()) if (u.carter && u.order.kind === 'cart' && u.order.base === b.id) pool++;
      carts.textContent = b.spec.carters ? `Carts: ${pool} (always keeps ${b.spec.carters}; train more for faster supply)` : `Carts on the way: ${w.logistics.cartsServing(b)}`;
    }
    const ammo = this.panel.querySelector<HTMLElement>('[data-ammo]');
    if (ammo && b.spec.attack) {
      const max = Math.max(1, Math.round(target.crystal / b.spec.attack.crystalMass));
      const have = Math.floor(b.stock.crystal / b.spec.attack.crystalMass + 1e-6);
      const sig = `${have}/${max}`;
      if (ammo.dataset.sig !== sig) {
        ammo.dataset.sig = sig;
        ammo.innerHTML = `<span>Crystals ${have}/${max}</span>` + Array.from({ length: max }, (_, i) => `<i class="${i < have ? 'on' : ''}"></i>`).join('');
      }
    }
    this.panel.querySelectorAll<HTMLElement>('[data-train]').forEach((btn) => {
      const s = w.specOf(this.player, btn.dataset.train!)!.stats;
      btn.classList.toggle('poor', b.queue.length >= MAX_QUEUE);
      const miss = this.missing(b, { food: s.foodCost, wood: 0, crystal: s.crystalCost });
      btn.classList.toggle('short', !!miss);
      const note = btn.querySelector<HTMLElement>('.need');
      if (note) note.textContent = miss ? `needs ${miss} here` : '';
      btn.classList.toggle('auto', b.autoTrain === btn.dataset.train);
    });
    this.panel.querySelectorAll<HTMLElement>('[data-research]').forEach((btn) => {
      const st = w.techStatus(this.player, btn.dataset.research!, b);
      btn.classList.toggle('locked', !!st.blocker);
      const miss = st.blocker ? '' : this.missing(b, { food: 0, wood: st.cost, crystal: 0 });
      btn.classList.toggle('short', !!miss);
      const c = btn.querySelector('.cost');
      if (c) c.textContent = st.blocker ?? `${st.cost} ${names.wood}`;
      const note = btn.querySelector<HTMLElement>('.need');
      if (note) note.textContent = miss ? `needs ${miss} here` : '';
    });
  }

  /** Whether anything is actually on its way to cover a shortfall, and if not, why. */
  private supplyNote(b: Building, cost: Stock): string {
    const w = this.world;
    const short = RESOURCES.filter((r) => cost[r] > b.stock[r] + 1e-6);
    const coming = short.reduce((n, r) => n + w.logistics.cartsBringing(b, r), 0);
    const carter = carterName(w.factionOf(b.owner)).toLowerCase();
    if (coming) return `${coming} ${carter}${coming > 1 ? 's' : ''} bringing it`;
    // is any of it spare at another building?
    const elsewhere = short.reduce((n, r) => n + w.buildingsOf(b.owner).filter((x) => x !== b).reduce((m, x) => m + w.logistics.spare(x)[r], 0), 0);
    if (elsewhere < 1) return 'gather more (nothing spare elsewhere)';
    const hasCarts = w.unitsOf(b.owner).some((u) => u.carter);
    const worker = workerName(w.factionOf(b.owner)).toLowerCase();
    if (!hasCarts) return `${Math.floor(elsewhere)} spare at other buildings: right-click this with ${worker}s to haul it here`;
    return `waiting for a free ${carter} (or right-click this with ${worker}s to haul it)`;
  }

  /** What this building is short of for a cost, in words ("6 crystal", "20 food + 4 crystal"), or ''. */
  private missing(b: Building, cost: Stock): string {
    const n = this.names();
    return RESOURCES.filter((r) => cost[r] > b.stock[r] + 1e-6).map((r) => `${need(cost[r] - b.stock[r])} ${n[r].toLowerCase()}`).join(' + ');
  }

  private setBar(name: string, v: number, max: number, label: string): void {
    const el = this.panel.querySelector<HTMLElement>(`[data-bar="${name}"]`);
    if (!el) return;
    el.querySelector<HTMLElement>('i')!.style.width = pct(v, max);
    el.querySelector<HTMLElement>('span')!.textContent = label;
  }

  private drawPortraits(): void {
    if (this.t - this.lastPortraits < 1 / 12) return;
    this.lastPortraits = this.t;
    for (const p of this.portraits) {
      const sheet = this.bank.unit(p.owner, p.specId);
      if (!sheet) continue;
      const c = p.canvas;
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (!w) continue;
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const live = p.unit && this.world.units.has(p.unit.id) ? p.unit : undefined;
      const f = live ? unitFrame(live) : { anim: 'idle' as const, time: this.t };
      const sprite = unitSprite(sheet, f.anim, live ? live.heading : 1, f);
      const zoom = Math.min(2.4, (h * 0.78) / sheet.height);
      ctx.imageSmoothingQuality = 'high';
      blit(ctx, sprite, w / 2, h * 0.9, zoom);
    }
  }

  private isWorker(specId: string): boolean {
    return specId === this.world.factionOf(this.player).workerId;
  }

  private unitPanel(u: Unit): string {
    const s = this.world.specOf(u.owner, u.specId)!;
    const own = u.owner === this.player;
    return `
      <div class="unit-panel">
        <canvas class="portrait big" data-portrait="${u.owner}:${u.specId}:${u.id}"></canvas>
        <div class="info">
          <h3><i class="swatch" style="background:${teamColor(this.world, u.owner).primary}"></i>${s.spec.name}${own ? '' : ` <small>${this.world.players[u.owner].name}</small>`}</h3>
          <div class="state" data-state></div>
          <div class="bar hp" data-bar="hp"><i></i><span></span></div>
          ${u.dummy ? '' : `<div class="bar cal" data-bar="cal"><i></i><span></span></div>
          <div class="bar pack" data-bar="pack"><div class="segs"><i class="crystal"></i><i class="food"></i><i class="wood"></i></div><span></span></div>
          ${u.throws ? '<div class="ammo" data-ammo></div>' : ''}`}
          ${own && this.grows(u) ? this.growthQueue(u) : ''}
          ${own && !u.carter ? this.commandButtons([u]) : ''}
          ${own && u.carter ? '<div class="hint">Carts supply whichever building is shortest. Right-click a building to pin this cart to it; Stop to unpin.</div>' : ''}
        </div>
        ${(own && this.growthMenu([u])) || (own && this.isWorker(u.specId) ? this.buildMenu() : statsTable(s.spec, s.stats, this.names().food.toLowerCase()))}
      </div>`;
  }

  /** Does this unit lay or change into anything (or is it changing)? */
  private grows(u: Unit): boolean {
    const w = this.world, spec = w.specOf(u.owner, u.specId)?.spec, origin = w.specOf(u.owner, u.shellOf ?? u.specId)?.spec;
    return !!(spec?.spawns?.length || origin?.becomes?.length || u.order.kind === 'metamorph' || u.brood.length);
  }

  private groupPanel(units: Unit[]): string {
    const groups = new Map<string, Unit[]>();
    for (const u of units) {
      const k = `${u.owner}:${u.specId}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(u);
    }
    const tiles = [...groups.entries()].map(([k, us]) => {
      const spec = this.world.specOf(us[0].owner, us[0].specId)!.spec;
      return `<button class="group" data-select="${us.map((u) => u.id).join(',')}" title="${spec.name}">
        <canvas class="portrait" data-portrait="${k}"></canvas><b>${us.length}</b></button>`;
    });
    const mine = units.filter((x) => x.owner === this.player);
    const workers = mine.some((u) => this.isWorker(u.specId));
    // workers: tiles and commands on the left, the build menu beside them (no formations: that's the build menu's room)
    const growth = this.growthMenu(mine);
    if (workers || mine.length < 2 || growth) return `<div class="group-panel"><div class="info"><div class="groups">${tiles.join('')}</div>${this.commandButtons(mine)}</div>
      ${growth || (workers ? this.buildMenu() : '')}</div>`;
    // an army: the orders and formations take the panel
    return `<div class="group-panel"><div class="info"><div class="groups">${tiles.join('')}</div></div>${this.armyOrders(mine)}</div>`;
  }

  private buildMenu(): string {
    const w = this.world;
    const cost = (id: string) => w.buildingStatsOf(this.player, id)?.totalCost ?? 0;
    const list = (w.factionOf(this.player).buildings ?? []).filter((b) => !b.unbuildable).sort((a, b) => cost(a.id) - cost(b.id));
    if (!list.length) return '';
    return `<div class="build"><div class="label">Build</div><div class="btns">${list.map((b) => {
      const st = w.buildingStatsOf(this.player, b.id)!;
      const art = this.icon('building', b.id, 160);
      const trains = (b.trains ?? []).map((id) => {
        const u = this.icon('unit', id, 56);
        return u ? `<img class="mini" src="${u}" alt="" title="${w.specOf(this.player, id)?.spec.name ?? id}">` : '';
      }).join('');
      const extras = [b.researches?.length ? '<i class="tag" title="Researches technologies">R</i>' : '', b.attack ? '<i class="tag" title="Has an attack">⚔</i>' : ''].join('');
      return `<button class="bld" data-place="${b.id}">
        ${art ? `<img class="art" src="${art}" alt="">` : ''}
        <b>${b.name}</b><span>${n0(st.totalCost)} ${this.names().wood}</span><span class="need"></span>
        <div class="trainsrow">${trains}${extras}</div>
      </button>`;
    }).join('')}</div></div>`;
  }

  private commandButtons(units: Unit[] = []): string {
    const km = keymap();
    // the order they're under is lit and says so (Moving, Holding...)
    const now = doing(units);
    const btn = (cmd: string, label: string, key: string, tip: string) =>
      `<button data-cmd="${cmd}" class="${now === cmd ? 'on' : ''}" title="${tip}">${ICONS[cmd]}<span>${now === cmd ? ORDERS[cmd]?.[1] ?? label : label}</span><kbd>${key.toUpperCase()}</kbd></button>`;
    return `<div class="cmds">
      ${btn('move', 'Move', km.move, 'Move there, ignoring enemies on the way (pull units out of a fight). Right-drag to lay out where the front line stands.')}
      ${btn('attackMove', 'Attack', km.attackMove, 'Attack-move: go there, fighting whatever they meet on the way.')}
      ${btn('patrol', 'Patrol', km.patrol, 'Patrol: then click a spot: they walk back and forth between here and there, fighting whatever they meet.')}
      ${btn('charge', 'Charge', km.charge, 'Charge: then click an enemy or a spot: they sprint at it and run on through, smashing into what\'s in the way. Pikes don\'t stop to brace. Sprinting burns calories fast.')}
      ${btn('hold', 'Hold', km.hold, 'Hold ground here: stand still and strike whatever comes into reach. Pikes and spears plant their points and brace for a charge. Any other order (or Hold again) ends it.')}
      ${btn('stop', 'Stop', km.stop, 'Stop')}
    </div>
    <div class="cmds small">
      ${btn('resupply', 'Resupply', km.resupply, 'Resupply at the nearest stocked building, then return. Hold the key and click the ground to send them there afterwards.')}
      ${btn('give', 'Give', km.give, 'Give surplus to a friendly unit (then click it)')}
      ${btn('garrison', 'Garrison', km.garrison, 'Shelter inside one of your buildings (then click it). Throwers inside throw from cover. Only bodies that fit through a door (up to 150 kg): no mounts or beasts.')}
    </div>`;
  }

  /** What the selected units can lay (spawns) or change into (becomes): tiles like a building's training buttons. */
  private growthMenu(units: Unit[]): string {
    const w = this.world, forms = new Map<string, [Unit, boolean]>();
    for (const u of units) {
      const spec = w.specOf(u.owner, u.specId)?.spec, origin = w.specOf(u.owner, u.shellOf ?? u.specId)?.spec; // (a shell: what went into it)
      for (const id of spec?.spawns ?? []) if (!forms.has(`${id}:1`)) forms.set(`${id}:1`, [u, true]);
      for (const id of origin?.becomes ?? []) if (!forms.has(`${id}:0`)) forms.set(`${id}:0`, [u, false]);
    }
    if (!forms.size) return '';
    const food = this.names().food.toLowerCase();
    const tiles = [...forms.entries()].map(([key, [u, spawn]]) => {
      const id = key.slice(0, -2), to = w.specOf(u.owner, id), from = w.specOf(u.owner, spawn ? u.specId : u.shellOf ?? u.specId);
      if (!to || !from) return '';
      const c = metamorphCost(from.stats, to.stats, spawn, spawn ? undefined : u.stats.mass);
      const tip = spawn
        ? `Lay a ${to.spec.name}: ${c.food} ${food} paid up front (from its pack, a food bearer in reach or a building beside it), ${c.sec.toFixed(0)} s, grown in its body while it keeps moving.`
        : `Change into ${to.spec.name}: ${c.food} ${food} (from its pack, a food bearer in reach, a building beside it, or food Given to it), ${c.sec.toFixed(0)} s, inside a shell where it stands.`;
      return `<button class="train" data-morph="${id}" data-spawn="${spawn ? 1 : 0}" title="${tip}">
        <canvas class="portrait" data-portrait="${u.owner}:${id}"></canvas>
        <span class="name">${spawn ? '' : '→ '}${to.spec.name}</span>
        <span class="cost">${c.food} ${food} · ${c.sec.toFixed(0)} s</span>
        <span class="ref" title="Refinement ${fmt(to.stats.refinement, 2)}×">${fmt(to.stats.refinement, 2)}×</span>
      </button>`;
    }).join('');
    return `<div class="actions"><div class="trains">${tiles}</div></div>`;
  }

  /** A unit that lays or changes: its queue like a building's (click one to cancel), and a progress bar. */
  private growthQueue(u: Unit): string {
    const w = this.world, name = (id: string) => w.specOf(u.owner, id)?.spec.name ?? id;
    const chips = u.brood.map((b, i) => `<span class="q" data-brood="${i}" title="Click to cancel (its food goes back in the pack)">${name(b.into)}</span>`);
    if (u.order.kind === 'metamorph') chips.unshift(`<span class="q" data-cmd="stop" title="Click to call it off (its food goes back in the pack)">→ ${name(u.order.into)}</span>`);
    if (!chips.length && !u.order) return '';
    return `<div class="queue">${chips.join('') || '<em>Idle</em>'}</div><div class="bar train" data-bar="grow"><i></i><span></span></div>`;
  }

  /** A group of fighters: big order tiles, and each formation drawn with this group in it. */
  private armyOrders(units: Unit[]): string {
    const km = keymap();
    // the order they're under lights its tile and says so (Moving, Holding...)
    const now = doing(units);
    const tile = (cmd: string, key: string, tip: string) =>
      `<button data-cmd="${cmd}" class="tile ${now === cmd ? 'on' : ''}" title="${tip}">${ICONS[cmd]}<span>${now === cmd ? ORDERS[cmd][1] : ORDERS[cmd][0]}</span><kbd>${key.toUpperCase()}</kbd></button>`;
    const formation = this.actions.formationOf();
    const fus = units.map(formationUnit);
    return `<div class="army">
      <div class="tiles">
        ${tile('move', km.move, 'Click where to go. They ignore enemies on the way. Right-drag on the ground to draw where their front line stands.')}
        ${tile('attackMove', km.attackMove, 'Click where to go. They fight whatever they meet on the way.')}
        ${tile('patrol', km.patrol, 'Click a spot. They walk back and forth between here and there, fighting whatever they meet.')}
        ${tile('charge', km.charge, 'Click an enemy or a spot. They sprint at it and run on through, smashing into what\'s in the way. Pikes charge with their points down; they don\'t stop to brace. Sprinting burns calories fast.')}
        ${tile('hold', km.hold, 'Hold ground here: they stand still and strike whatever comes into reach. Pikes and spears plant their points and brace for a charge. Any other order (or Hold again) ends it.')}
        ${tile('stop', km.stop, 'Stop where they are.')}
      </div>
      <div class="tiles forms">${FORMATIONS.map((f) => `<button data-formation="${f.id}" class="ftile ${f.id === formation ? 'on' : ''}" title="${f.tip}">${formationPicture(f.id, fus)}<span>${f.name}</span></button>`).join('')}</div>
      <div class="cmds small">
        ${(['resupply', 'give', 'garrison'] as const).map((c) => `<button data-cmd="${c}" title="${{ resupply: 'Resupply at the nearest stocked building, then come back.', give: 'Give surplus to a friendly unit (then click it).', garrison: 'Shelter inside one of your buildings (then click it). Only bodies that fit through a door (up to 150 kg): no mounts or beasts.' }[c]}">${ICONS[c]}<span>${c[0].toUpperCase() + c.slice(1)}</span><kbd>${km[c].toUpperCase()}</kbd></button>`).join('')}
      </div>
    </div>`;
  }

  private buildingPanel(b: Building): string {
    const w = this.world;
    const own = b.owner === this.player;
    const st = b.stats;
    const head = `<h3><i class="swatch" style="background:${teamColor(w, b.owner).primary}"></i>${b.spec.name}${own ? '' : ` <small>${w.players[b.owner].name}</small>`}</h3>
      <div class="bar hp" data-bar="bhp"><i></i><span></span></div>`;
    if (!b.complete) {
      return `<div class="building-panel"><div class="info">${head}
        <div class="state">Under construction — ${workerName(w.factionOf(b.owner)).toLowerCase()}s carry ${this.names().wood.toLowerCase()} here</div>
        <div class="bar built" data-bar="built"><i></i><span></span></div>
        ${own ? `<div class="hint">Right-click it with ${workerName(w.factionOf(b.owner)).toLowerCase()}s selected to help build.</div>` : ''}</div></div>`;
    }
    const names = this.names();
    const info = `
      <div class="capital" title="Capital is this building's materials. Links add its prerequisites' capital at 100%.">
        Capital <b>${n0(st.capital)}</b>${st.effectiveCapital > st.capital ? ` · with links <b>${n0(st.effectiveCapital)}</b>` : ''} · supports refinement <b>≤ ${fmt(st.maxRefinement, 2)}×</b>
      </div>
      ${RESOURCES.map((r) => `<div class="bar stock ${r}" data-bar="stock-${r}"><i></i><span></span></div>`).join('')}
      <div class="state" data-carts></div>
      ${b.grown !== undefined ? '<div class="state" data-grow></div>' : ''}
      ${st.tower ? '<div class="ammo" data-ammo></div>' : ''}
      ${b.spec.gatherBoost ? `<div class="state">${b.stock.crystal > 1e-6 ? `Gathering nearby ×${fmt(st.gatherBoost, 2)} (within ${b.spec.gatherBoost.radius} tiles), burning crystal` : 'No crystal: gathering boost off'}</div>` : ''}
      ${b.spec.sow && own ? `<div class="sow">Sowing ${b.spec.sow.resources.map((r) => `<button data-sow="${r}" data-building="${b.id}" class="${b.sowing.includes(r) ? 'on' : ''}" title="Plants a ${plantKg(b.spec, r)} kg ${r === 'food' ? 'bush' : 'tree'} for ${need(plantKg(b.spec, r) * CAP.sowSeedFraction)} ${names[r].toLowerCase()} of seed from this building; it grows over ${CAP.sowGrowSec} s">${names[r]} ${b.sowing.includes(r) ? 'on' : 'off'}</button>`).join(' ')}</div>` : ''}
      ${st.tower ? `<div class="state">Tower: ${n0(st.tower.damage)} dmg · range ${fmt(st.tower.minRange, 0)}–${fmt(st.tower.range, 1)} (can't hit right below itself) · ${fmt(st.tower.cooldown, 1)} s · ${b.spec.attack!.crystalMass} kg crystal per shot</div>` : ''}`;
    if (!own) return `<div class="building-panel"><div class="info">${head}${info}</div></div>`;
    const km = keymap();
    const train = (b.spec.trains ?? []).map((id, i) => {
      const s = w.specOf(this.player, id);
      if (!s) return '';
      const need = capitalFor(s.spec.refinement ?? 1);
      return `<button class="train" data-train="${id}" data-building="${b.id}">
        <canvas class="portrait" data-portrait="${b.owner}:${id}"></canvas>
        <span class="name">${s.spec.name}</span>
        <span class="cost">${s.stats.foodCost} ${names.food.toLowerCase()} · ${s.stats.crystalCost} crys</span>
        <span class="need"></span>
        <span class="ref" title="Refinement ${fmt(s.stats.refinement, 2)}× (design needs ${n0(need)} capital)">${fmt(s.stats.refinement, 2)}×</span>
        <kbd>${km.train[i]?.toUpperCase() ?? ''}</kbd>
      </button>`;
    }).join('');
    // one button per tech line (same unit and channel): the next level not yet researched,
    // or the last one, shown as done; deeper levels stay hidden under it until then
    const researched = w.players[this.player].researched;
    const lines = new Map<string, string[]>();
    for (const id of b.spec.researches ?? []) {
      const t = w.techOf(this.player, id);
      if (!t) continue;
      const key = `${t.unit}/${t.channel ?? 'combat'}`;
      lines.set(key, [...(lines.get(key) ?? []), id]);
    }
    const shown = [...lines.values()].map((ids) => ids.find((id) => !researched.includes(id)) ?? ids[ids.length - 1]);
    const research = shown.map((id) => {
      const t = w.techOf(this.player, id);
      if (!t) return '';
      const done = w.players[this.player].researched.includes(id);
      return `<button class="tech${done ? ' done' : ''}" data-research="${id}" data-building="${b.id}">
        <b>${t.name}</b><span class="cost"></span><span class="need"></span></button>`;
    }).join('');
    const queue = b.queue.map((q, i) => `<span class="q" data-cancel="${b.id}" data-index="${i}" title="Click to cancel">${q.kind === 'unit' ? w.specOf(b.owner, q.specId)?.spec.name : w.techOf(b.owner, q.techId)?.name}</span>`).join('');
    return `
      <div class="building-panel">
        <div class="info">
          ${head}${info}
          <div class="queue">${queue || (train ? '<em>Idle — right-click the ground to set a rally point</em>' : '')}</div>
          ${train || research ? '<div class="bar train" data-bar="train"><i></i><span></span></div>' : ''}
        </div>
        <div class="actions">
          ${b.owner === this.player && b.complete && capacity(b) > 0 ? `<button class="garrison-btn" data-ungarrison="${b.id}" title="Units shelter inside (Garrison command); throwers inside throw from cover. Click to bring everyone out."><b>Garrison ${b.garrison.length}/${capacity(b)}</b><span>${b.garrison.length ? 'click: everyone out' : 'empty'}</span></button>` : ''}
          ${train ? `<div class="trains">${train}</div>` : ''}
          ${research ? `<div class="techs">${research}</div>` : ''}
        </div>
      </div>`;
  }
}

export function describeOrder(w: World, u: Unit): string {
  const o = u.order;
  if (u.dummy) return 'Training target';
  if (u.exhausted) return 'Exhausted — resting';
  switch (o.kind) {
    case 'idle': return u.engage ? 'Fighting' : u.carter ? 'Waiting for orders' : 'Idle';
    case 'muster': return 'Grabbing a crystal';
    case 'tame': return `Taming the ${w.specOf(w.units.get(o.target)?.owner ?? 0, w.units.get(o.target)?.specId ?? '')?.spec.name ?? 'animal'}`;
    case 'rearm': return `Restocking from the ${w.specOf(u.owner, w.units.get(o.unit)?.specId ?? '')?.spec.name ?? 'bearer'}`;
    case 'wild': return u.engage ? 'Attacking' : u.wild === 'aggressive' ? 'Prowling' : 'Grazing';
    case 'hunt': return 'Hunting';
    case 'move': return 'Moving';
    case 'attackMove': return u.engage ? 'Fighting' : 'Attack-moving';
    case 'patrol': return u.engage ? 'Fighting' : 'Patrolling';
    case 'digest': return 'Going to digest a tree';
    case 'metamorph': {
      const name = w.specOf(u.owner, o.into)?.spec.name ?? o.into;
      return o.t > 0 ? `Changing into ${name}` : `Waiting for food to change into ${name}`;
    }
    case 'attack': return 'Attacking';
    case 'gather': {
      const r = resourceName(w.factionOf(u.owner), o.nodeType);
      return o.stopWhenArmed ? 'Picking up crystals' : o.phase === 'toDrop' ? `Hauling ${r} home` : `Gathering ${r}`;
    }
    case 'resupply': return u.anim === 'eat' ? 'Eating' : 'Going to resupply';
    case 'give': return 'Delivering supplies';
    case 'eatPack': return 'Eating from pack';
    case 'garrison': return 'Going inside';
    case 'eatFrom': return `Eating from the ${w.specOf(u.owner, w.units.get(o.unit)?.specId ?? '')?.spec.name ?? 'bearer'}`;
    case 'build': {
      const site = w.buildings.get(o.site);
      const name = site?.spec.name ?? 'building';
      const r = resourceName(w.factionOf(u.owner), 'wood');
      return o.phase === 'deliver' ? `Carrying ${r} to the ${name}` : o.phase === 'chop' ? `Gathering ${r} for the ${name}` : `Fetching ${r} for the ${name}`;
    }
    case 'cart': {
      const home = w.buildings.get(o.home);
      if (!home) return 'Waiting for a delivery';
      if (!u.carter) return `Hauling supplies for the ${home.spec.name}${o.pinned ? ' (pinned)' : ''}`;
      return `${o.phase === 'deliver' ? 'Delivering' : 'Fetching'} ${o.res} for the ${home.spec.name}${o.pinned ? ' (pinned)' : ''}`;
    }
  }
}

// Command icons (24×24, drawn in the button's colour).
const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
/** Each order tile's name, and what it says while they're under that order. */
const ORDERS: Record<string, [string, string]> = {
  move: ['Move', 'Moving'], attackMove: ['Attack', 'Attacking'], patrol: ['Patrol', 'Patrolling'],
  charge: ['Charge', 'Charging'], hold: ['Hold', 'Holding'], stop: ['Stop', 'Stop'],
};

/** What most of a group is doing, as the order tile that does it (or '' when they're just standing). */
function doing(units: Unit[]): string {
  const n = new Map<string, number>();
  for (const u of units) {
    const o = u.order;
    const k = o.kind === 'move' ? 'move' : o.kind === 'patrol' ? 'patrol' : (o.kind === 'attackMove' || o.kind === 'attack') ? (o.charge ? 'charge' : 'attackMove') : u.stance === 'hold' ? 'hold' : '';
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

const ICONS: Record<string, string> = {
  morph: svg('<path d="M12 4c-3 0-5 2.5-5 6 0 4 2.5 8 5 10 2.5-2 5-6 5-10 0-3.5-2-6-5-6z"/><path d="M9 10.5h6M9.5 14h5"/>'),
  move: svg('<path d="M3 12h15M13 6l6 6-6 6"/>'),
  attackMove: svg('<path d="M19 5 8.5 15.5M6 13l5 5M7.5 16.5 4 20"/><path d="M19 5h-3M19 5v3"/>'),
  patrol: svg('<path d="M4 8.5h14l-3.5-3.5M20 15.5H6l3.5 3.5"/>'),
  charge: svg('<path d="M9 12h11M15.5 7.5 20 12l-4.5 4.5M3 7.5h5M2 12h4M3 16.5h5"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
  hold: svg('<path d="M12 3v14M7 21h10M12 17l-4 4M12 17l4 4"/><path d="M8 8h8"/>'),
  resupply: svg('<path d="M4 8 12 4l8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8"/>'),
  give: svg('<path d="M3 16h6l3 2h5l4-3.5M14 4v8M10.5 8.5 14 12l3.5-3.5"/>'),
  garrison: svg('<path d="M4 11 12 4l8 7v9H4zM10 20v-5h4v5"/>'),
};

/** This group drawn in formation `f`, front at the top: a dot per unit (gold shafts, red strikers, blue throwers) with a tick the way it faces. */
function formationPicture(f: Formation, units: ReturnType<typeof formationUnit>[]): string {
  const slots = formationSlots(f, units, 0, 0, -Math.PI / 2);
  const role = new Map(units.map((u) => [u.id, u.role]));
  const xs = slots.map((s) => s.x), ys = slots.map((s) => s.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  // fit it in the tile, keeping its shape
  const W = 76, H = 50, pad = 5, k = Math.min((W - 2 * pad) / Math.max(1, x1 - x0), (H - 2 * pad - 6) / Math.max(1, y1 - y0), 9);
  const ox = W / 2 - ((x0 + x1) / 2) * k, oy = (H + 6) / 2 - ((y0 + y1) / 2) * k, r = Math.max(1.6, Math.min(3.2, k * 0.3));
  const colour = ['#e8c547', '#e07a5f', '#7ab8e0'];
  const dots = slots.map((s) => {
    const x = ox + s.x * k, y = oy + s.y * k, c = colour[role.get(s.id) ?? 1];
    return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + Math.cos(s.face) * r * 2.2).toFixed(1)}" y2="${(y + Math.sin(s.face) * r * 2.2).toFixed(1)}" stroke="${c}" stroke-width="1.3"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${c}"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><path class="front" d="M${W / 2 - 5} 5 L${W / 2} 1 L${W / 2 + 5} 5"/>${dots}</svg>`;
}
