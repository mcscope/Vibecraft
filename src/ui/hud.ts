// DOM overlay: resources, selection panel, build / train / research buttons, tooltips.
import type { ResourceKind, UnitSpec } from '../factions/types';
import { MAX_QUEUE, plantKg, RESOURCES, type Building, type Unit, type World } from '../sim/world';
import { CAP, capitalFor, derive, type DerivedStats } from '../sim/physics';
import { fmt, have, n0, need, pct } from './format';
import { TEAM_COLORS, unitFrame } from '../render/renderer';
import { blit, spriteIcon, spriteToCanvas } from '../art/draw';
import { unitSprite } from '../art/contract';
import type { ArtBank } from '../render/artbank';
import { keymap, onSettings } from './settings';

export interface HudActions {
  train(buildingId: number, specId: string): void;
  research(buildingId: number, techId: string): void;
  cancelTrain(buildingId: number, index?: number): void;
  select(ids: number[]): void;
  command(kind: 'stop' | 'attackMove' | 'resupply' | 'give'): void;
  place(specId: string): void;
  idleWorker(): void;
  autoTrain(buildingId: number, specId: string | null): void;
  setSowing(buildingId: number, resources: Array<'food' | 'wood'>): void;
}


export function statsTable(spec: UnitSpec, stats: DerivedStats = derive(spec)): string {
  const d = stats;
  const row = (k: string, v: string, hint = '') => `<div class="st"><span title="${hint}">${k}</span><b>${v}</b></div>`;
  return `
    <div class="stats">
      ${row('Mass', `${fmt(d.mass)} kg`, 'Body mass — everything derives from this')}
      ${row('Build', `${fmt(d.physique.muscle * 100)}/${fmt(d.physique.frame * 100)}/${fmt(d.physique.reserve * 100)}`, 'muscle / frame / reserve %')}
      ${row('Refinement', `${fmt(d.refinement, 2)}×`, 'Combat value per resource beyond raw physics (HP and damage); paid for in building capital and research')}
      ${d.workRefinement > 1 ? row('Work', `${fmt(d.workRefinement, 2)}×`, 'Work refinement: gather rate and speed') : ''}
      ${row('Hit points', fmt(d.maxHp), 'From frame mass × refinement^⅔')}
      ${row('Calories', fmt(d.maxCalories), 'From reserve mass')}
      ${row('Speed', `${fmt(d.speed, 2)} t/s`, 'Unloaded; packs slow you down')}
      ${row('Carry', `${have(d.carryCapacity)} kg`, 'Shared by weapon, ammo and cargo')}
      ${row('Crystal', spec.attack && d.canAttack ? `${spec.attack.crystalMass} kg ${spec.attack.style}${spec.attack.style === 'throw' ? ` ×${Math.round(d.loadoutCrystal / spec.attack.crystalMass)}` : ''}` : 'none')}
      ${row('Damage', fmt(d.damage), '½·m·v² × efficiency × refinement^⅔')}
      ${row('Dmg / sec', fmt(d.dps, 1))}
      ${row('Range', `${fmt(d.range, 1)} t`)}
      ${row('Cost', `${d.foodCost} food · ${d.crystalCost} crys`)}
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
      <button class="idle-btn" data-idle title="Select the next idle villager (.)">Idle <b data-res="idle"></b></button>
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
      const el = (e.target as HTMLElement).closest('[data-train],[data-research]') as HTMLElement | null;
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
    const el = (e.target as HTMLElement).closest('[data-train],[data-research],[data-cancel],[data-select],[data-cmd],[data-place],[data-sow]') as HTMLElement | null;
    if (!el || el.classList.contains('locked')) return;
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
    else if (el.dataset.place) this.actions.place(el.dataset.place);
  }

  private onHover(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest('[data-train],[data-research],[data-place]') as HTMLElement | null;
    if (!el) { this.tooltip.style.display = 'none'; return; }
    const w = this.world;
    if (el.dataset.train) {
      const s = w.specOf(this.player, el.dataset.train)!;
      this.tooltip.innerHTML = `<h3>${s.spec.name}</h3><p>${s.spec.description}</p>${statsTable(s.spec, s.stats)}<p class="hint">${fmt(s.stats.trainTime)} s · paid from this building's stock · Click: train · Hold: auto-train on/off · Right-click: cancel last</p>`;
    } else if (el.dataset.research) {
      const t = w.techOf(this.player, el.dataset.research)!;
      const b = w.buildings.get(+el.dataset.building!);
      const st = w.techStatus(this.player, t.id, b);
      const from = w.refinementOf(this.player, t.unit);
      const unit = w.specOf(this.player, t.unit)?.spec.name ?? t.unit;
      this.tooltip.innerHTML = `<h3>${t.name}</h3><p>${t.description}</p>
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
        spec.gatherBoost ? `Gathering within ${spec.gatherBoost.radius} tiles ×${fmt(st.gatherBoost, 2)}` : '',
        spec.sow ? `Sows ${spec.sow.resources.map((r) => this.names()[r].toLowerCase()).join(' and ')} within ${spec.sow.radius} tiles` : '',
        spec.carters ? `Always keeps ${spec.carters} cart${spec.carters > 1 ? 's' : ''}; train more by hand` : '',
      ].filter(Boolean).join(' · ');
      this.tooltip.innerHTML = `<h3>${spec.name}</h3><p>${spec.description}</p>
        <div class="stats">
          <div class="st"><span>Materials (capital)</span><b>${n0(st.capital)}</b></div>
          <div class="st"><span>With links</span><b>${n0(st.effectiveCapital)}</b></div>
          <div class="st"><span>Supports refinement</span><b>≤ ${fmt(st.maxRefinement, 2)}×</b></div>
          <div class="st"><span>Hit points</span><b>${n0(st.maxHp)}</b></div>
          <div class="st"><span>Cache</span><b>${n0(st.cacheCap)} kg</b></div>
          <div class="st"><span>Footprint</span><b>${spec.size}×${spec.size}</b></div>
          ${st.attackCost ? `<div class="st"><span>Weapon + height</span><b>${n0(st.attackCost)}</b></div>` : ''}
        </div>
        <p>${what}</p>
        <p class="hint">Villagers carry ${n0(st.totalCost)} ${this.names().wood} to the site${spec.requires?.length ? ` · requires ${spec.requires.map((r) => w.buildingSpecOf(this.player, r)?.name ?? r).join(', ')}` : ''}${block ? ` · <span class="bad">${block}</span>` : ''}</p>`;
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
    const sig = units.length === 1 ? `u${units[0].id}`
      : building ? `b${building.id}:${building.complete}:${building.queue.map((q) => (q.kind === 'unit' ? q.specId : q.techId)).join(',')}:${p.researched.length}:${building.owner}:${building.sowing.join('')}`
      : `m${units.map((u) => u.id).join(',')}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.portraits = [];
      if (units.length === 1) this.panel.innerHTML = this.unitPanel(units[0]);
      else if (building) this.panel.innerHTML = this.buildingPanel(building);
      else if (units.length > 1) this.panel.innerHTML = this.groupPanel(units);
      else {
        const km = keymap();
        this.panel.innerHTML = `<div class="empty">Drag to select · Right-click to command · <kbd>${km.attackMove.toUpperCase()}</kbd> attack-move · <kbd>${km.stop.toUpperCase()}</kbd> stop · <kbd>${km.resupply.toUpperCase()}</kbd> resupply (hold + click: go there after) · <kbd>${km.give.toUpperCase()}</kbd> give · <kbd>${km.home.toUpperCase()}</kbd> town center · <kbd>F10</kbd> settings</div>`;
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
      const load = w.packLoad(u);
      const names = this.names();
      const parts = ([['crystal', u.crystal], ['food', u.food], ['wood', u.wood]] as Array<[ResourceKind, number]>).filter(([, v]) => v > 0.05).map(([k, v]) => `${names[k]} ${have(v)}`).join(' · ');
      const pack = this.panel.querySelector<HTMLElement>('[data-bar="pack"]');
      if (pack) {
        // one segment per resource, each in its own colour
        const cap = u.stats.carryCapacity;
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
      const have = Math.min(max, Math.floor(u.crystal / u.crystalMass + 1e-6));
      const sig = `${have}/${max}`;
      if (ammo.dataset.sig !== sig) {
        ammo.dataset.sig = sig;
        ammo.innerHTML = `<span>Crystals ${have}/${max}</span>` + Array.from({ length: max }, (_, i) => `<i class="${i < have ? 'on' : ''}"></i>`).join('');
      }
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
      if (label) label.textContent = item && item.kind === 'unit' && !item.paid ? `Waiting for ${this.missing(b, item.food, item.crystal)} here — ${this.supplyNote(b, item.food, item.crystal)}` : '';
    }
    const names = this.names();
    const target = w.logistics.supplyTargets(b);
    for (const r of RESOURCES) {
      const max = target[r] > 1 ? target[r] : Math.max(1, b.stats.cacheCap);
      this.setBar(`stock-${r}`, b.stock[r], max, target[r] > 1 ? `${names[r]} ${have(b.stock[r])} / ${need(target[r])}` : `${names[r]} ${have(b.stock[r])}`);
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
      const miss = this.missing(b, s.foodCost, s.crystalCost);
      btn.classList.toggle('short', !!miss);
      const note = btn.querySelector<HTMLElement>('.need');
      if (note) note.textContent = miss ? `needs ${miss} here` : '';
      btn.classList.toggle('auto', b.autoTrain === btn.dataset.train);
    });
    this.panel.querySelectorAll<HTMLElement>('[data-research]').forEach((btn) => {
      const st = w.techStatus(this.player, btn.dataset.research!, b);
      btn.classList.toggle('locked', !!st.blocker);
      btn.classList.toggle('poor', !st.blocker && b.stock.wood < st.cost);
      const c = btn.querySelector('.cost');
      if (c) c.textContent = st.blocker ?? `${st.cost} ${names.wood}`;
    });
  }

  /** Whether anything is actually on its way to cover a shortfall, and if not, why. */
  private supplyNote(b: Building, food: number, crystal: number): string {
    const w = this.world;
    const short = (['food', 'crystal'] as const).filter((r) => (r === 'food' ? food : crystal) > b.stock[r] + 1e-6);
    const coming = short.reduce((n, r) => n + w.logistics.cartsBringing(b, r), 0);
    if (coming) return `${coming} cart${coming > 1 ? 's' : ''} bringing it`;
    const base = w.baseOf(b.owner);
    if (b === base || (b.spec.carters ?? 0) > 0) return 'gather more (nothing spare elsewhere)';
    if (!base) return 'no Town Center to supply it';
    if (short.some((r) => w.logistics.spare(base)[r] < 1)) return `the ${base.spec.name} has none to spare`;
    return 'waiting for a free cart';
  }

  /** What this building is short of for a cost, in words ("6 crystal", "20 berries + 4 crystal"), or ''. */
  private missing(b: Building, food: number, crystal: number): string {
    const n = this.names();
    return [
      food > b.stock.food + 1e-6 ? `${need(food - b.stock.food)} ${n.food.toLowerCase()}` : '',
      crystal > b.stock.crystal + 1e-6 ? `${need(crystal - b.stock.crystal)} ${n.crystal.toLowerCase()}` : '',
    ].filter(Boolean).join(' + ');
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
      const f = live ? unitFrame(this.world, live) : { anim: 'idle' as const, time: this.t };
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
          <h3><i class="swatch" style="background:${TEAM_COLORS[u.owner].primary}"></i>${s.spec.name}${own ? '' : ` <small>${this.world.players[u.owner].name}</small>`}</h3>
          <div class="state" data-state></div>
          <div class="bar hp" data-bar="hp"><i></i><span></span></div>
          ${u.dummy ? '' : `<div class="bar cal" data-bar="cal"><i></i><span></span></div>
          <div class="bar pack" data-bar="pack"><div class="segs"><i class="crystal"></i><i class="food"></i><i class="wood"></i></div><span></span></div>
          ${u.throws ? '<div class="ammo" data-ammo></div>' : ''}`}
          ${own && !u.carter ? this.commandButtons() : ''}
          ${own && u.carter ? '<div class="hint">Carts supply whichever building is shortest. Right-click a building to pin this cart to it; Stop to unpin.</div>' : ''}
        </div>
        ${own && this.isWorker(u.specId) ? this.buildMenu() : statsTable(s.spec, s.stats)}
      </div>`;
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
    const workers = units.some((u) => u.owner === this.player && this.isWorker(u.specId));
    return `<div class="group-panel"><div class="groups">${tiles.join('')}</div>
      <div class="row">${this.commandButtons()}${workers ? this.buildMenu() : ''}</div></div>`;
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

  private commandButtons(): string {
    const km = keymap();
    return `<div class="cmds">
      <button data-cmd="attackMove" title="Attack-move">Attack <kbd>${km.attackMove.toUpperCase()}</kbd></button>
      <button data-cmd="stop" title="Stop">Stop <kbd>${km.stop.toUpperCase()}</kbd></button>
      <button data-cmd="resupply" title="Resupply at the nearest stocked building, then return. Hold the key and click the ground to send them there afterwards.">Resupply <kbd>${km.resupply.toUpperCase()}</kbd></button>
      <button data-cmd="give" title="Give surplus to a friendly unit (then click it)">Give <kbd>${km.give.toUpperCase()}</kbd></button>
    </div>`;
  }

  private buildingPanel(b: Building): string {
    const w = this.world;
    const own = b.owner === this.player;
    const st = b.stats;
    const head = `<h3><i class="swatch" style="background:${TEAM_COLORS[b.owner].primary}"></i>${b.spec.name}${own ? '' : ` <small>${w.players[b.owner].name}</small>`}</h3>
      <div class="bar hp" data-bar="bhp"><i></i><span></span></div>`;
    if (!b.complete) {
      return `<div class="building-panel"><div class="info">${head}
        <div class="state">Under construction — villagers carry wood here</div>
        <div class="bar built" data-bar="built"><i></i><span></span></div>
        ${own ? '<div class="hint">Right-click it with villagers selected to help build.</div>' : ''}</div></div>`;
    }
    const names = this.names();
    const info = `
      <div class="capital" title="Capital is this building's materials. Links add its prerequisites' capital at 100%.">
        Capital <b>${n0(st.capital)}</b>${st.effectiveCapital > st.capital ? ` · with links <b>${n0(st.effectiveCapital)}</b>` : ''} · supports refinement <b>≤ ${fmt(st.maxRefinement, 2)}×</b>
      </div>
      ${RESOURCES.map((r) => `<div class="bar stock ${r}" data-bar="stock-${r}"><i></i><span></span></div>`).join('')}
      <div class="state" data-carts></div>
      ${st.tower ? '<div class="ammo" data-ammo></div>' : ''}
      ${b.spec.gatherBoost ? `<div class="state">Gathering nearby ×${fmt(st.gatherBoost, 2)} (within ${b.spec.gatherBoost.radius} tiles)</div>` : ''}
      ${b.spec.sow && own ? `<div class="sow">Sowing ${b.spec.sow.resources.map((r) => `<button data-sow="${r}" data-building="${b.id}" class="${b.sowing.includes(r) ? 'on' : ''}" title="Plants a ${plantKg(b.spec, r)} kg ${r === 'food' ? 'bush' : 'tree'} for ${need(plantKg(b.spec, r) * CAP.sowSeedFraction)} ${names[r].toLowerCase()} of seed from this building; it grows over ${CAP.sowGrowSec} s">${names[r]} ${b.sowing.includes(r) ? 'on' : 'off'}</button>`).join(' ')}</div>` : ''}
      ${st.tower ? `<div class="state">Tower: ${n0(st.tower.damage)} dmg · range ${fmt(st.tower.range, 1)} · ${fmt(st.tower.cooldown, 1)} s · uses ${b.spec.attack!.crystalMass} kg crystal per shot</div>` : ''}`;
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
    const research = (b.spec.researches ?? []).map((id) => {
      const t = w.techOf(this.player, id);
      if (!t) return '';
      const done = w.players[this.player].researched.includes(id);
      return `<button class="tech${done ? ' done' : ''}" data-research="${id}" data-building="${b.id}">
        <b>${t.name}</b><span class="cost"></span></button>`;
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
    case 'move': return 'Moving';
    case 'attackMove': return u.engage ? 'Fighting' : 'Attack-moving';
    case 'attack': return 'Attacking';
    case 'gather': return o.stopWhenArmed ? 'Picking up crystals' : o.phase === 'toDrop' ? `Hauling ${o.nodeType} home` : `Gathering ${o.nodeType}`;
    case 'resupply': return u.anim === 'eat' ? 'Eating' : 'Going to resupply';
    case 'give': return 'Delivering supplies';
    case 'eatPack': return 'Eating from pack';
    case 'build': {
      const site = w.buildings.get(o.site);
      const name = site?.spec.name ?? 'building';
      return o.phase === 'deliver' ? `Carrying wood to the ${name}` : o.phase === 'chop' ? `Chopping wood for the ${name}` : `Fetching wood for the ${name}`;
    }
    case 'cart': {
      const home = w.buildings.get(o.home);
      if (!home) return 'Waiting for a delivery';
      if (!u.carter) return `Hauling supplies for the ${home.spec.name}`;
      return `${o.phase === 'deliver' ? 'Delivering' : 'Fetching'} ${o.res} for the ${home.spec.name}${o.pinned ? ' (pinned)' : ''}`;
    }
  }
}
