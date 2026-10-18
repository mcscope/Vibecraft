// The browser arena: a matrix of equal-budget fights between every pair of combat units
// (filled in by a background worker), and a live field. Click a cell to stage that fight
// and watch it, with both sides' numbers updating beside it.
import { PLAYABLE } from '../factions';
import type { DerivedStats } from '../sim/physics';
import { World, DT, TICK_RATE } from '../sim/world';
import { ARENA_SECONDS, ARENA_X, ARENA_Y, alive, arenaCost, arenaRoster, arenaScenario, arenaScore, entryKey, fightOver, stageFight, strength, type ArenaEntry, type ArenaSide } from '../sim/arena';
import { ArtBank, TEAM_COLORS } from '../render/artbank';
import { Renderer } from '../render/renderer';
import { Input } from '../ui/input';
import { Minimap } from '../ui/minimap';
import { AudioEngine } from '../audio/engine';

const BUDGETS = [600, 1200, 2400];
/** The panel overlays the left of the (full-window) field. */
const PANEL_W = 460;
const LEFT = TEAM_COLORS[0], RIGHT = TEAM_COLORS[1];

export async function runArena(params: URLSearchParams): Promise<void> {
  const roster = arenaRoster(PLAYABLE);
  const n = PLAYABLE.length;
  // one seat per faction per side: left seats 0..n-1 (blue), right seats n..2n-1 (red)
  const world = new World({
    seed: 1, scenario: arenaScenario(2 * n),
    players: [...PLAYABLE.map((f) => ({ name: `${f.name} (left)`, faction: f })), ...PLAYABLE.map((f) => ({ name: `${f.name} (right)`, faction: f }))],
  });
  for (const u of [...world.units.values()]) world.units.delete(u.id);
  for (const b of [...world.buildings.values()]) world.buildings.delete(b.id);
  const seat = (e: ArenaEntry, side: 0 | 1) => PLAYABLE.indexOf(e.faction) + side * n;

  // ── loading: bake the art (each faction's units once per side's colour, only those a fight shows: see stage)
  const loading = document.getElementById('loading')!;
  loading.style.display = 'flex';
  const bar = loading.querySelector<HTMLElement>('.fill')!, label = loading.querySelector<HTMLElement>('.label')!;
  const teams = [...PLAYABLE.map(() => LEFT), ...PLAYABLE.map(() => RIGHT)];
  const bank = await ArtBank.build(world, (p) => import('../biomes/meadow').then((m) => m.bakeMeadow(p)), (f, text) => {
    bar.style.width = `${Math.round(f * 100)}%`;
    label.textContent = text;
  }, teams, []);
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new Renderer(canvas, world, bank, { damageNumbers: true });
  await renderer.init();
  renderer.viewer = -1;
  const minimap = new Minimap(document.createElement('canvas'), world, 200);
  // camera, selection, pause ([P]) and speed ([ ]); with 'you command blue' on, orders go to the left side
  const audio = new AudioEngine(world, bank, 0);
  const input = new Input(canvas, world, renderer, minimap, 0, (cmd) => {
    if (!control) return;
    world.enqueue({ player: input.player, cmd });
    // the order is answered once, by the first unit given it (voices only with ?voices=1)
    const first = 'units' in cmd ? cmd.units.map((id) => world.units.get(id)).find((u) => u && u.owner === input.player) : undefined;
    if (first) audio.unitLine(first.owner, first.specId, cmd.type === 'attack' || cmd.type === 'attackMove' ? 'attack' : 'acknowledge');
  });
  input.onSelect = (ids, group) => { const u = ids.map((id) => world.units.get(id)).find(Boolean); if (u) audio.unitLine(u.owner, u.specId, 'select', undefined, group); };
  let control = params.get('control') === '1';
  const resize = () => renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  window.addEventListener('resize', resize);
  loading.style.display = 'none';

  // ── the panel
  resize();
  // frame the fight in the part of the screen the panel leaves free
  const look = () => {
    renderer.cam.zoom = 1.3;
    renderer.cam.centerOn((ARENA_X[0] + ARENA_X[1]) / 2, ARENA_Y);
    renderer.cam.pan(-PANEL_W / 2, 0);
  };
  look();
  const panel = document.createElement('div');
  panel.id = 'arena';
  panel.style.width = `${PANEL_W}px`;
  document.body.appendChild(panel);

  let budget = BUDGETS.includes(Number(params.get('budget'))) ? Number(params.get('budget')) : 1200;
  const scores = new Map<string, number>(); // `${i},${j}` → score
  let worker: Worker | null = null;
  const fillMatrix = () => {
    worker?.terminate();
    scores.clear();
    worker = new Worker(new URL('./matrixWorker.ts', import.meta.url), { type: 'module' });
    const forBudget = budget;
    worker.onmessage = (e: MessageEvent<{ budget: number; i: number; j: number; score: number }>) => {
      if (e.data.budget !== forBudget) return;
      scores.set(`${e.data.i},${e.data.j}`, e.data.score);
      paintCell(e.data.i, e.data.j);
      if (fight && e.data.i === fight.i && e.data.j === fight.j) drawStats();
    };
    worker.postMessage({ budget });
  };

  const name = (e: ArenaEntry) => e.faction.units.find((u) => u.id === e.id)?.name ?? e.id;
  const short = (e: ArenaEntry) => name(e).replace(/^(Great|Crystal|Pack) /, '');
  panel.innerHTML = `
    <div class="arena-head">
      <h2>Arena</h2>
      <a href="./">menu</a>
    </div>
    <p class="arena-help">Equal food budgets (crystal is free). Each cell: the share of its budget the winner keeps, <b class="win">+ row wins</b>, <b class="lose">− column wins</b>. Click a cell to watch it live.</p>
    <div class="arena-controls">
      Budget <select class="arena-budget">${BUDGETS.map((b) => `<option value="${b}"${b === budget ? ' selected' : ''}>${b}</option>`).join('')}</select>
      <span class="arena-speed">${[0.5, 1, 2, 4].map((s) => `<button data-speed="${s}">${s}×</button>`).join('')}</span>
      <button class="arena-pause">Pause</button>
      <button class="arena-rematch">Rematch</button>
      <label class="arena-control" title="Command the blue (left) side yourself: select, right-click to move or attack, B hold ground, C charge. They wait for your orders."><input type="checkbox"${control ? ' checked' : ''}> You command blue</label>
    </div>
    <table class="arena-matrix">
      <thead><tr><th class="corner"><span style="color:${LEFT.primary}">row</span> vs <span style="color:${RIGHT.primary}">col</span></th>${roster.map((e) => `<th class="col" title="${name(e)} (${e.faction.name})"><span>${short(e)}</span><i class="fac">${e.faction.name[0]}</i></th>`).join('')}</tr></thead>
      <tbody>${roster.map((a, i) => `<tr><th class="row" title="${name(a)} (${a.faction.name}), refinement ${(a.faction.units.find((u) => u.id === a.id)?.refinement ?? 1).toFixed(1)}"><i class="fac">${a.faction.name[0]}</i>${short(a)} <i class="fac">r${(a.faction.units.find((u) => u.id === a.id)?.refinement ?? 1).toFixed(1)}</i></th>${roster.map((_, j) => `<td data-i="${i}" data-j="${j}"></td>`).join('')}</tr>`).join('')}</tbody>
    </table>
    <div class="arena-stats"><p class="arena-help">Pick a fight.</p></div>`;
  const cell = (i: number, j: number) => panel.querySelector<HTMLElement>(`td[data-i="${i}"][data-j="${j}"]`)!;
  const paintCell = (i: number, j: number) => {
    const td = cell(i, j);
    if (i === j) { td.textContent = '·'; td.title = `${name(roster[i])} mirror match`; return; }
    const s = scores.get(`${i},${j}`);
    if (s === undefined) { td.textContent = '…'; td.style.background = ''; td.title = 'computing…'; return; }
    td.textContent = (s > 0 ? '+' : '') + s.toFixed(2);
    // diverging: green when the row wins, red when the column does, grey near even
    const k = Math.min(1, Math.abs(s));
    td.style.background = s >= 0 ? `rgba(70, 170, 80, ${0.12 + 0.6 * k})` : `rgba(200, 60, 50, ${0.12 + 0.6 * k})`;
    td.title = `${name(roster[i])} vs ${name(roster[j])}: ${s > 0 ? name(roster[i]) : name(roster[j])} keeps ${Math.round(Math.abs(s) * 100)}% of its budget`;
  };
  for (let i = 0; i < roster.length; i++) for (let j = 0; j < roster.length; j++) paintCell(i, j);

  // ── the live fight
  interface Fight { i: number; j: number; A: ArenaSide; B: ArenaSide; ticks: number; over: boolean; result: number; startHp: [number, number] }
  let fight: Fight | null = null;
  let staging = 0;
  const stage = async (i: number, j: number) => {
    const a = roster[i], b = roster[j], my = ++staging;
    // bake the two (once each; a quick look at the loading bar the first time)
    const fresh = !bank.unit(seat(a, 0), a.id) || !bank.unit(seat(b, 1), b.id);
    if (fresh) { loading.style.display = 'flex'; bar.style.width = '50%'; label.textContent = `Mustering ${name(a)} and ${name(b)}`; }
    await Promise.all([bank.ensureUnits(seat(a, 0), [a.id]), bank.ensureUnits(seat(b, 1), [b.id])]);
    if (fresh) loading.style.display = 'none';
    if (my !== staging) return; // another fight was picked meanwhile
    const [A, B] = stageFight(world, { owner: seat(a, 0), specId: a.id }, { owner: seat(b, 1), specId: b.id }, budget);
    input.player = A.owner;
    if (control) { world.enqueue({ player: A.owner, cmd: { type: 'stop', units: A.ids } }); input.setSelection(A.ids); } // yours: they wait for orders
    const hp = (s: ArenaSide) => s.ids.reduce((t, id) => t + (world.units.get(id)?.stats.maxHp ?? 0), 0);
    fight = { i, j, A, B, ticks: 0, over: false, result: 0, startHp: [hp(A), hp(B)] };
    panel.querySelectorAll('td.sel').forEach((td) => td.classList.remove('sel'));
    cell(i, j).classList.add('sel');
    look();
    history.replaceState(null, "", `?mode=arena&a=${entryKey(a)}&b=${entryKey(b)}&budget=${budget}${control ? "&control=1" : ""}`);
    drawStats();
  };

  panel.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const td = t.closest<HTMLElement>('td[data-i]');
    if (td) { stage(+td.dataset.i!, +td.dataset.j!); return; }
    if (t.dataset.speed) { input.speed = +t.dataset.speed; input.paused = false; syncControls(); return; }
    if (t.closest('.arena-pause')) { input.paused = !input.paused; syncControls(); return; }
    if (t.closest('.arena-rematch') && fight) stage(fight.i, fight.j);
    if (t.closest('.arena-control input')) { control = (t as HTMLInputElement).checked; if (fight) stage(fight.i, fight.j); }
  });
  panel.querySelector<HTMLSelectElement>('.arena-budget')!.addEventListener('change', (e) => {
    budget = +(e.target as HTMLSelectElement).value;
    for (let i = 0; i < roster.length; i++) for (let j = 0; j < roster.length; j++) { scores.delete(`${i},${j}`); paintCell(i, j); }
    fillMatrix();
    if (fight) stage(fight.i, fight.j);
  });
  const syncControls = () => {
    panel.querySelectorAll<HTMLElement>('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed! === input.speed));
    panel.querySelector('.arena-pause')!.textContent = input.paused ? 'Resume' : 'Pause';
  };
  syncControls();

  // ── the numbers
  const statsBox = panel.querySelector<HTMLElement>('.arena-stats')!;
  const fmt = (v: number, d = 1) => (Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(d));
  const statRows = (s: DerivedStats, cost: number): Array<[string, string]> => [
    ['Cost', `${Math.round(cost)} food${s.crystalCost ? ` (+ ${s.crystalCost} crystal, free here)` : ''}`],
    ['Refinement', s.refinement.toFixed(1)],
    ['Mass', `${fmt(s.mass)} kg`],
    ['Health', fmt(s.maxHp)],
    ['Armour', `${fmt(s.armour)} on ${Math.round(s.coverage * 100)}% of blows`],
    ['Damage', `${fmt(s.damage)} every ${s.cooldown.toFixed(2)} s`],
    ['DPS', fmt(s.dps)],
    ['Reach', `${s.range.toFixed(1)} tiles`],
    ['Speed', `${s.speed.toFixed(2)} tiles/s`],
    ...(s.flight ? [['Flies', `${s.flyHeight} m up`] as [string, string]] : []),
  ];
  const drawStats = () => {
    if (!fight) return;
    const f = fight;
    const sides: Array<{ e: ArenaEntry; s: ArenaSide; col: string; foe: ArenaSide; foeHp: number }> = [
      { e: roster[f.i], s: f.A, col: LEFT.primary, foe: f.B, foeHp: f.startHp[1] },
      { e: roster[f.j], s: f.B, col: RIGHT.primary, foe: f.A, foeHp: f.startHp[0] },
    ];
    const live = arenaScore(world, f.A, f.B);
    const matrix = scores.get(`${f.i},${f.j}`);
    const secs = f.ticks / TICK_RATE;
    const verdict = f.over
      ? (Math.abs(f.result) < 0.02 ? 'A draw.' : `<b style="color:${f.result > 0 ? LEFT.primary : RIGHT.primary}">${name(f.result > 0 ? roster[f.i] : roster[f.j])}</b> wins, keeping ${Math.round(Math.abs(f.result) * 100)}% of its budget.`)
      : `Fighting… ${secs.toFixed(1)} s of ${ARENA_SECONDS}`;
    const head = sides.map((x) => `<th style="color:${x.col}">${name(x.e)}<small>${x.e.faction.name}</small></th>`).join('');
    const row = (k: string, vals: string[]) => `<tr><td>${k}</td>${vals.map((v) => `<td>${v}</td>`).join('')}</tr>`;
    const stats = sides.map((x) => statRows(world.specOf(x.s.owner, x.s.specId)!.stats, arenaCost(world, x.s.owner, x.s.specId)));
    statsBox.innerHTML = `
      <div class="arena-verdict">${verdict}<span>live ${(live > 0 ? '+' : '') + live.toFixed(2)}${matrix !== undefined ? ` · matrix ${(matrix > 0 ? '+' : '') + matrix.toFixed(2)}` : ''}</span></div>
      <table class="arena-sides">
        <thead><tr><th></th>${head}</tr></thead>
        <tbody>
          ${row('Standing', sides.map((x) => `<b>${alive(world, x.s)}</b> / ${x.s.n}`))}
          ${row('Strength', sides.map((x) => { const p = strength(world, x.s); return `<div class="arena-bar"><i style="width:${p * 100}%;background:${x.col}"></i></div>${Math.round(p * 100)}%`; }))}
          ${row('Kills', sides.map((x) => `${x.foe.n - alive(world, x.foe)}`))}
          ${row('Damage dealt', sides.map((x) => fmt(x.foeHp * (1 - strength(world, x.foe)), 0)))}
          ${sides.some((x) => world.specOf(x.s.owner, x.s.specId)!.spec.attack?.style === 'throw') ? row('Crystal left', sides.map((x) => { const us = x.s.ids.map((id) => world.units.get(id)).filter((u) => !!u); return world.specOf(x.s.owner, x.s.specId)!.spec.attack?.style === 'throw' ? `${fmt(us.reduce((t, u) => t + u!.ammo, 0), 0)} kg` : '—'; })) : ''}
          <tr class="sep"><td colspan="3">Each unit</td></tr>
          ${stats[0].map(([k], r) => row(k, [stats[0][r][1], stats[1][r]?.[1] ?? '—'])).join('')}
        </tbody>
      </table>`;
  };

  // ── open on the requested fight (or the first pairing)
  const find = (key: string | null) => roster.findIndex((e) => entryKey(e) === key);
  fillMatrix();
  const ai = find(params.get('a')), bi = find(params.get('b'));
  stage(ai >= 0 ? ai : 0, bi >= 0 ? bi : Math.min(1, roster.length - 1));

  // ── the loop
  let acc = 0, last = performance.now(), statsT = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!input.paused) {
      acc += dt * input.speed;
      let steps = 0;
      while (acc >= DT && steps < 40) {
        world.step();
        if (fight && !fight.over) {
          fight.ticks++;
          if (fightOver(world, fight.A, fight.B, fight.ticks)) { fight.over = true; fight.result = arenaScore(world, fight.A, fight.B); drawStats(); }
        }
        acc -= DT;
        steps++;
      }
    }
    input.alpha = Math.min(1, acc / DT);
    renderer.consumeEvents(world.events);
    audio.handle(world.events, renderer.cam);
    world.events = [];
    input.update(dt);
    renderer.draw(input.alpha, dt, input.rs);
    if ((statsT += dt) > 0.25) { statsT = 0; if (fight && !fight.over) drawStats(); syncControls(); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  Object.assign(window, { world, renderer, input });
}
