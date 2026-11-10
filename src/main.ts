import './style.css';
import { meadowfolk } from './factions/meadowfolk';
import { PLAYABLE } from './factions';
import type { FactionSpec } from './factions/types';
import { training } from './factions/training';
import { World, DT, TICK_RATE } from './sim/world';
import { faceoff, provingGrounds, skirmish } from './sim/scenarios';
import { LESSONS, tutorialWorld } from './tutorial';
import { soundDebug } from './ui/soundDebug';
import { aiDraft, BattleAI, defaultDeployment, pitchedBattle } from './sim/battle';
import { draftBattle } from './ui/battleSetup';
import { BattleDeploy } from './ui/battleDeploy';

/** In a pitched battle: the computer's army (it starts moving once you're deployed). */
let battleAI: BattleAI | null = null;
import { MAPS } from './sim/map';
import { Lockstep, LocalInput, LoopbackTransport, type CommandSource, type Transport } from './net/lockstep';
import { NetTransport } from './net/relayClient';
import type { OnlineGame } from './net/online';
import { openLobby } from './ui/lobby';
import { showArmy } from './ui/armyCard';
import { showScore } from './ui/scoreScreen';
import { mountChat } from './ui/chat';
import { TEAM_COLORS } from './render/artbank';
import { DIFFICULTIES, SkirmishAI, parseDifficulty } from './ai/skirmishAI';
import { CartDebug } from './ui/cartDebug';
import { Renderer } from './render/renderer';
import { ArtBank } from './render/artbank';
import { Hud } from './ui/hud';
import { Input } from './ui/input';
import { Minimap } from './ui/minimap';
import { AudioEngine } from './audio/engine';
import { mountSettingsDialog, onSettings, settings } from './ui/settings';
import { TOUCH, TouchControls, ask, initTouchPage, mountPanelControls, mountTouchbar, renderScale, trackOpenMap, words } from './ui/touch';

type Mode = 'demo' | 'skirmish' | 'spectate' | 'online' | 'faceoff' | 'tutorial' | 'battle';
const params = new URLSearchParams(location.search);
/** ?mode=tutorial: every lesson, or one army's own track (&track=<faction>: the lessons that play it); and which one (&lesson=N, from 0). */
const track = PLAYABLE.find((f) => f.id === params.get('track') && LESSONS.some((l) => l.you === f));
const lessons = track ? LESSONS.filter((l) => l.you === track) : LESSONS;
const lessonIx = Math.max(0, Math.min(lessons.length - 1, +(params.get('lesson') ?? 0) || 0)), lesson = lessons[lessonIx];
/** The lesson's checklist steps already done (kept while the tab is open: Restart keeps your ticks). */
const STEPS_KEY = `vibecraft.steps.${track?.id ?? 'all'}.${lessonIx}`, stepsDone = new Set<number>();
// Seed choice happens outside the sim, so Math.random is fine here.
const seed = Number(params.get('seed') ?? Math.floor(Math.random() * 1e9));

initTouchPage();
mountSettingsDialog();
const menu = document.getElementById('menu')!;

// who plays whom in skirmish / spectate (remembered between visits)
const PICK_KEY = 'vibecraft.matchup';
const picked = (() => { try { return JSON.parse(localStorage.getItem(PICK_KEY) ?? '{}') as { you?: string; foe?: string; map?: string; ai?: string }; } catch { return {}; } })();
for (const sel of menu.querySelectorAll<HTMLSelectElement>('[data-pick]')) {
  const which = sel.dataset.pick as 'you' | 'foe';
  sel.innerHTML = PLAYABLE.map((f) => `<option value="${f.id}">${f.name}</option>`).join('');
  sel.value = params.get(which) ?? picked[which] ?? (which === 'foe' && PLAYABLE[1] ? PLAYABLE[1].id : PLAYABLE[0].id);
  // under each pick: who that army is, and its units in that side's colours
  const card = menu.querySelector<HTMLElement>(`[data-army="${which}"]`)!;
  const show = () => showArmy(card, PLAYABLE.find((f) => f.id === sel.value) ?? PLAYABLE[0], TEAM_COLORS[which === 'you' ? 0 : 1]);
  sel.addEventListener('change', () => { picked[which] = sel.value; try { localStorage.setItem(PICK_KEY, JSON.stringify(picked)); } catch { /* private mode */ } show(); });
  if (!params.get('mode')) show();
}
const mapSel = menu.querySelector<HTMLSelectElement>('[data-map]')!;
mapSel.innerHTML = MAPS.map((m) => `<option value="${m.id}" title="${m.description}">${m.name}</option>`).join('');
mapSel.value = params.get('map') ?? picked.map ?? MAPS[0].id;
if (!mapSel.value) mapSel.value = MAPS[0].id;
mapSel.addEventListener('change', () => { picked.map = mapSel.value; try { localStorage.setItem(PICK_KEY, JSON.stringify(picked)); } catch { /* private mode */ } });
// how well the computer plays (it never cheats: Easy just thinks less and worse)
const aiSel = menu.querySelector<HTMLSelectElement>('[data-ai]')!;
aiSel.innerHTML = DIFFICULTIES.map((d) => `<option value="${d}">${d[0].toUpperCase() + d.slice(1)}</option>`).join('');
aiSel.value = parseDifficulty(params.get('ai') ?? picked.ai);
aiSel.addEventListener('change', () => { picked.ai = aiSel.value; try { localStorage.setItem(PICK_KEY, JSON.stringify(picked)); } catch { /* private mode */ } });
const difficulty = () => parseDifficulty(aiSel.value);
const pick = (which: 'you' | 'foe'): FactionSpec => PLAYABLE.find((f) => f.id === menu.querySelector<HTMLSelectElement>(`[data-pick="${which}"]`)!.value) ?? meadowfolk;
const loading = document.getElementById('loading')!;
const mode = params.get('mode') as Mode | 'arena' | null;
if (mode === 'arena') { menu.style.display = 'none'; void import('./arena/arenaMode').then((m) => m.runArena(params)); }
else if ((mode as string) === 'sprites') { menu.style.display = 'none'; void import('./dev/spriteSheet').then((m) => m.runSpriteSheet(params)); }
else if ((mode as string) === 'sizecheck') { menu.style.display = 'none'; void import('./dev/sizeCheck').then((m) => m.runSizeCheck()); }
else if ((mode as string) === 'artcheck') { menu.style.display = 'none'; void import('./dev/artCheck').then((m) => m.runArtCheck()); }
else if ((mode as string) === 'footcheck') { menu.style.display = 'none'; void import('./dev/footCheck').then((m) => m.runFootCheck()); }
else if ((mode as string) === 'prebake') { menu.style.display = 'none'; void import('./dev/prebake').then((m) => m.runPrebake()); }
else if (mode) start(mode);
else {
  menu.style.display = 'flex';
  menu.addEventListener('click', (e) => {
    const href = (e.target as HTMLElement).closest<HTMLElement>('[data-href]')?.dataset.href;
    if (href) { location.href = href; return; }
    if ((e.target as HTMLElement).closest('[data-tutorial]')) { location.href = `./?mode=tutorial&track=${pick('you').id}`; return; } // (the picked army's own lessons)
    if ((e.target as HTMLElement).closest('[data-online]')) {
      const lobby = document.getElementById('lobby')!;
      lobby.style.display = 'flex';
      openLobby(lobby.querySelector<HTMLElement>('.lobby-box')!, (g) => { lobby.style.display = 'none'; void startOnline(g); }, () => (lobby.style.display = 'none'));
      return;
    }
    const m = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')?.dataset.mode as Mode | 'arena' | undefined;
    if (!m) return;
    if (m === 'arena') { location.href = '?mode=arena'; return; }
    history.replaceState(null, '', `?mode=${m}&you=${pick('you').id}&foe=${pick('foe').id}&map=${mapSel.value}&ai=${difficulty()}`);
    start(m);
  });
}

async function start(m: Mode): Promise<void> {
  if (m === 'battle') {
    // draft first (both armies), then the battle map with both deployed in standard ranks
    menu.style.display = 'none';
    const c = await draftBattle(params);
    const foeArmy = aiDraft(c.foe, c.budget);
    const world = new World({ seed, scenario: pitchedBattle(c.mapId, [defaultDeployment(c.you, c.army, 0), defaultDeployment(c.foe, foeArmy, 1)]), players: [{ name: 'You', faction: c.you }, { name: c.foe.name, faction: c.foe }] });
    battleAI = new BattleAI(1);
    await run({ mode: m, world, me: 0, transport: new LoopbackTransport(), delay: 2, sources: (local) => [local, battleAI!] });
    return;
  }
  const world = m === 'tutorial'
    ? tutorialWorld(lesson, seed)
    : m === 'faceoff'
    ? new World({ seed, scenario: faceoff(), players: [pick('you'), pick('foe'), ...PLAYABLE.filter((f) => f.id === params.get('third'))].map((faction) => ({ name: faction.name, faction })) }) // (&third=<faction>: a third army)
    : m === 'demo'
    ? new World({ seed, scenario: provingGrounds(), players: [{ name: 'You', faction: pick('you') }, { name: 'Training Grounds', faction: training }] })
    : new World({ seed, scenario: skirmish(mapSel.value), players: [{ name: m === 'spectate' ? pick('you').name : 'You', faction: pick('you') }, { name: pick('foe').name, faction: pick('foe') }] });
  const d = difficulty(), ais = m === 'spectate' || m === 'skirmish' ? [new SkirmishAI(0, d), new SkirmishAI(1, d)] : [];
  // ?skip=120: start that many seconds in, the AI playing both sides till then (dev shortcut; then you take over)
  const skip = Math.min(1800, Math.max(0, +(params.get('skip') ?? 0) || 0));
  if (skip && ais.length) await fastForward(world, ais, skip);
  await run({
    mode: m, world, me: 0, transport: new LoopbackTransport(), delay: 2,
    sources: (local) => {
      const s: CommandSource[] = m === 'spectate' ? ais : m === 'skirmish' ? [local, ais[1]] : [local];
      if (m === 'demo' || m === 'faceoff' || m === 'tutorial') for (let p = 1; p < world.players.length; p++) if (!world.players[p].neutral) s.push({ player: p, poll: () => [] }); // the dummies never act (a faceoff just stands; a lesson's foes do only what it set up)
      return s;
    },
  });
}

/** Run the game `secs` seconds on with these AIs giving the orders (the loading screen counts it). */
async function fastForward(world: World, ais: CommandSource[], secs: number): Promise<void> {
  menu.style.display = 'none';
  loading.style.display = 'flex';
  const bar = loading.querySelector<HTMLElement>('.fill')!, label = loading.querySelector<HTMLElement>('.label')!;
  const end = world.tick + secs * TICK_RATE;
  while (world.tick < end) {
    for (let i = 0; i < 100 && world.tick < end; i++) {
      for (const ai of ais) for (const cmd of ai.poll(world)) world.enqueue({ player: ai.player, cmd });
      world.step();
    }
    bar.style.width = `${Math.round((100 * (secs * TICK_RATE - (end - world.tick))) / (secs * TICK_RATE))}%`;
    label.textContent = `Skipping ahead: ${Math.floor(world.tick / TICK_RATE)} s`;
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** An online game: every seat's faction arrived as a bundle; commands go through the relay. */
async function startOnline(g: OnlineGame): Promise<void> {
  menu.style.display = 'none';
  // listen for ticks right away: the other player may finish loading first
  const transport = new NetTransport(g.relay);
  const world = new World({ seed: g.seed, scenario: skirmish(g.map), players: g.factions.map((faction, i) => ({ name: g.names[i], faction })) });
  const seats = g.names.length;
  g.relay.onPeers = (peers) => { if (peers.length < seats) showNotice(`${g.names.find((_, i) => i !== g.me) ?? 'Your opponent'} left the game.`); };
  g.relay.onClose = () => showNotice('Lost the connection to the relay.');
  await run({ mode: 'online', world, me: g.me, transport, delay: 4, sources: (local) => [local] });
  // talk to the room: Enter to chat
  const seatColor = (from: number) => {
    const seat = from === g.relay.you ? g.me : g.relay.peers.findIndex((p) => p.id === from);
    return seat >= 0 && seat < seats ? TEAM_COLORS[seat % TEAM_COLORS.length].primary : 'var(--dim)';
  };
  mountChat(document.getElementById('chat')!, g.relay, () => g.names[g.me], true, seatColor);
}

/** The Proving Grounds' help, for fingers. */
const DEMO_TOUCH_HELP = `<p>Press and hold a dummy to attack it, or tap <b>Attack</b> and tap a spot past the range to attack-move through it.
  Dummies rebuild after 8 s; the fort after 15 s.</p>
  <p>Your base has a full tech tree: tap a building to train or research. Select villagers to place new buildings; they carry wood to the site.</p>
  <p>Double-tap a unit to select all of its type. Menu (☰) lists every touch control.</p>`;

/**
 * The help box on a touch screen: a title bar you tap to fold it away or open it again (folded, it shows the `short`
 * title and, with `steps`, the first step of the checklist still to do). The first touch on the map folds it, to open the field up.
 */
function foldingHelp(help: HTMLElement, title: string, body: string, steps: boolean, short: string): void {
  help.classList.add('folding');
  help.innerHTML = `<button type="button" class="help-head"><b class="help-title">${title}</b><b class="help-short">${short}</b><span class="help-next"></span><i>Hide ▴</i></button><div class="help-body">${words(body)}</div>`;
  const head = help.querySelector<HTMLElement>('.help-head')!, next = help.querySelector<HTMLElement>('.help-next')!;
  const fold = (on: boolean) => { help.classList.toggle('folded', on); head.querySelector('i')!.textContent = on ? 'Show ▾' : 'Hide ▴'; };
  head.addEventListener('click', () => fold(!help.classList.contains('folded')));
  document.getElementById('game')!.addEventListener('touchstart', () => fold(true), { once: true, passive: true });
  if (!steps) return;
  // (what's left to do, said in the title bar)
  const show = () => {
    const lis = [...help.querySelectorAll<HTMLElement>('.lesson-steps li')], todo = lis.find((li) => !li.classList.contains('done'));
    next.textContent = !lis.length ? '' : todo ? `${lis.indexOf(todo) + 1}/${lis.length} · ${todo.textContent}` : `All ${lis.length} done ✓`;
  };
  show();
  new MutationObserver(show).observe(help.querySelector('.lesson-steps')!, { subtree: true, attributes: true, attributeFilter: ['class'] });
}

function showNotice(text: string): void {
  const o = document.getElementById('overlay')!;
  o.textContent = text;
  o.style.display = 'flex';
  o.dataset.sticky = '1';
}

interface GameSetup {
  mode: Mode;
  world: World;
  /** The local player's seat. */
  me: number;
  transport: Transport;
  /** Input delay in ticks (more online, to hide latency). */
  delay: number;
  sources: (local: LocalInput) => CommandSource[];
}

async function run(g: GameSetup): Promise<void> {
  const { mode: m, world, me: HUMAN } = g;
  menu.style.display = 'none';
  loading.style.display = 'flex';

  const bar = loading.querySelector<HTMLElement>('.fill')!;
  const label = loading.querySelector<HTMLElement>('.label')!;
  // the map's biome art, loaded lazily like faction art (it brings the 3D kit with it)
  const bank = await ArtBank.build(world, (p) => import('./biomes/meadow').then((m) => m.bakeMeadow(p)), (f, text) => {
    bar.style.width = `${Math.round(f * 100)}%`;
    label.textContent = text;
  });

  const local = new LocalInput(HUMAN);
  const players = world.players.filter((p) => !p.neutral).map((p) => p.id);
  const lockstep = new Lockstep(world, g.sources(local), players, g.transport, g.delay);
  lockstep.onDesync = (tick, h) => {
    console.error('DESYNC at tick', tick, h);
    if (m === 'online') showNotice(`Out of sync at tick ${tick}: the game can't continue.`);
  };

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new Renderer(canvas, world, bank, { damageNumbers: m === 'demo' || m === 'tutorial' }, m === 'demo' ? [[18, 26, 4], [31, 26, 5]] : []);
  await renderer.init();
  const minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, world, 200, (x, y) => bank.biomeAt(x, y).ground);
  // fog of war for whoever's playing (spectators, the proving grounds and most lessons see everything)
  renderer.viewer = minimap.viewer = m === 'spectate' || m === 'demo' || m === 'faceoff' || (m === 'tutorial' && !lesson.fog) ? -1 : HUMAN;
  const audio = new AudioEngine(world, bank, HUMAN);
  soundDebug();
  audio.alerts = m === 'skirmish' || m === 'online' || m === 'battle'; // a horn when your side is newly attacked
  const input = new Input(canvas, world, renderer, minimap, HUMAN, (cmd) => {
    local.issue(cmd);
    audio.answerOrder(cmd, HUMAN);
  });
  input.onSelect = (ids, group) => audio.answerSelect(ids, group, HUMAN);
  // fingers: tap selects, long-press does, drag and pinch move the camera (ui/touch.ts)
  const touch = new TouchControls(canvas, input, renderer.cam, minimap.canvas);
  input.viaTouch = TOUCH;
  mountTouchbar(document.getElementById('touchbar')!, input, touch, { chat: m === 'online' });
  mountPanelControls(document.getElementById('panel-ctl')!, document.getElementById('bottom')!, input);
  const hud = new Hud(world, HUMAN, bank, {
    train: (building, specId) => local.issue({ type: 'train', building, specId }),
    research: (building, techId) => local.issue({ type: 'research', building, techId }),
    place: (specId) => input.startPlacing(specId),
    idleWorker: () => input.nextIdleWorker(),
    autoTrain: (building, specId) => local.issue({ type: 'autoTrain', building, specId }),
    setSowing: (building, resources) => local.issue({ type: 'setSowing', building, resources }),
    cancelTrain: (building, index) => local.issue({ type: 'cancelTrain', building, index }),
    select: (ids) => input.setSelection(ids),
    command: (kind) => input.hudCommand(kind),
    formation: (f) => input.setFormation(f),
    formationOf: () => input.formationOf(),
    morph: (into, spawn) => local.issue({ type: 'metamorph', units: input.oneFor(into, spawn), into, spawn: spawn || undefined }),
    cancelSpawn: (index) => local.issue({ type: 'cancelSpawn', units: input.selectedUnits(), index }),
    autoSpawn: (unit, specId) => local.issue({ type: 'autoSpawn', units: [unit], specId }),
    ungarrison: (building) => local.issue({ type: 'ungarrison', building }),
  });

  const resize = () => renderer.resize(window.innerWidth, window.innerHeight, renderScale(window.innerWidth, window.innerHeight));
  window.addEventListener('resize', resize);
  resize();

  // a pitched battle opens on deployment: the world holds still until Ready
  const deploy = m === 'battle' ? new BattleDeploy(world, renderer, canvas, input.rs, (ids) => input.setSelection(ids), () => { if (battleAI) battleAI.started = true; }) : null;
  if (deploy) touch.intercept = (x, y, button) => deploy.press(x, y, button);
  if (m === 'faceoff') renderer.cam.centerOn(23.5, 23.5);
  else if (m === 'battle') { /* (the deploy step framed the camera) */ }
  else if (m === 'tutorial') {
    const ix = lessonIx;
    renderer.cam.centerOn(lesson.look[0], lesson.look[1]);
    input.setSelection(world.unitsOf(HUMAN).filter((u) => u.specId !== world.factionOf(HUMAN).carterId).map((u) => u.id));
    // the lesson's caption, in the help panel: what to try, its checklist, and Back / Restart / Next
    const help = document.getElementById('help')!;
    const go = (i: number) => `?mode=tutorial${track ? `&track=${track.id}` : ''}&lesson=${i}`;
    try { for (const i of JSON.parse(sessionStorage.getItem(STEPS_KEY) ?? '[]') as number[]) stepsDone.add(i); } catch { /* private mode */ }
    help.classList.add('lesson');
    const title = `${track ? `${track.name}, lesson` : 'Lesson'} ${ix + 1} of ${lessons.length}: ${lesson.title}`;
    const body = `${lesson.text}
      <ul class="lesson-steps">${(lesson.steps ?? []).map((st, i) => `<li${stepsDone.has(i) ? ' class="done"' : ''}>${st.text}</li>`).join('')}</ul>
      <div class="lesson-nav">${ix > 0 ? `<a href="${go(ix - 1)}">◀ Back</a>` : '<span></span>'}<a href="${go(ix)}">Restart</a>${ix < lessons.length - 1 ? `<a href="${go(ix + 1)}">Next ▶</a>` : '<a href="./">Finish</a>'}</div>`;
    if (TOUCH) foldingHelp(help, title, body, true, `${ix + 1}/${lessons.length} ${lesson.title}`);
    else help.innerHTML = `<b>${title}</b>${body}`;
  }
  else if (m === 'demo') {
    renderer.cam.centerOn(22, 26);
    input.setSelection(world.unitsOf(HUMAN).filter((u) => u.specId !== world.factionOf(HUMAN).workerId).map((u) => u.id));
  } else {
    // your base, or (a faction that starts in the field) your first unit
    const tc = world.buildingsOf(HUMAN)[0], u0 = world.unitsOf(HUMAN)[0];
    if (tc) renderer.cam.centerOn(tc.ox + 3, tc.oy + 3); else if (u0) renderer.cam.centerOn(u0.x, u0.y);
    input.setSelection(world.unitsOf(HUMAN).map((u) => u.id));
  }
  loading.style.display = 'none';
  document.getElementById('hud')!.style.display = 'block';
  if (m === 'demo' || m === 'tutorial') {
    const help = document.getElementById('help')!;
    help.style.display = 'block';
    if (TOUCH && m === 'demo') foldingHelp(help, 'Proving Grounds', DEMO_TOUCH_HELP, false, 'Proving Grounds');
  }
  trackOpenMap(renderer.cam);

  let acc = 0;
  let last = performance.now();
  let fps = 60;
  // the fps readout: real frames counted over each half second, and the worst frame in it (nothing smoothed away)
  let perfFrames = 0, perfSince = last, perfWorst = 0;
  const debugPerf = new URLSearchParams(location.search).has('debug'); // ?debug: the worst frame too
  const slowFrames: Array<Record<string, number>> = [];
  if (debugPerf) (window as unknown as { slowFrames: unknown }).slowFrames = slowFrames;
  const overlay = document.getElementById('overlay')!;
  const speedEl = document.getElementById('speed')!;
  // resign (players only, in matches that can be won) and the score screen when it's over
  const resignBtn = document.getElementById('resign')!;
  const canResign = m === 'skirmish' || m === 'online' || m === 'battle';
  resignBtn.style.display = canResign ? '' : 'none';
  const resign = () => local.issue({ type: 'resign' });
  const playing = () => world.winner < 0 && !world.players[HUMAN].defeated;
  resignBtn.onclick = () => { if (playing() && confirm('Resign this match?')) resign(); };
  // on a touch screen, Resign sits in the menu (⚙) and asks in the game, away from the buttons you tap all match
  const matchEl = document.querySelector<HTMLElement>('#settings .match')!;
  if (TOUCH && canResign) {
    matchEl.innerHTML = '<button type="button" class="resign-match">⚑ Resign this match</button>';
    matchEl.querySelector('button')!.addEventListener('click', () => {
      document.getElementById('settings')!.style.display = 'none';
      if (playing()) void ask('Resign this match? The other side wins, and the score screen shows.', 'Resign', 'Keep playing').then((yes) => { if (yes && playing()) { input.paused = false; resign(); } }); // (a paused game takes no orders)
    });
  }
  let scored = false;
  const scoreBox = document.getElementById('score')!;

  const cartDebug = new CartDebug(world, renderer.cam, HUMAN);
  let simMs = 0, drawMs = 0;
  const perfEl = document.querySelector<HTMLElement>('[data-res="fps"]')!;
  const showPerf = () => (perfEl.style.display = settings().perf ? '' : 'none');
  showPerf();
  onSettings(showPerf);
  const frame = (now: number) => {
    const real = (now - last) / 1000;
    const dt = Math.min(0.1, real); // (animation and camera: a long frame doesn't jump them)
    last = now;
    perfFrames++; perfWorst = Math.max(perfWorst, real);
    const t0 = performance.now();
    if (!input.paused && !deploy?.deploying) {
      // the game keeps to the clock: a slow frame's time is made up in the frames after it, a few ms of steps at a
      // time (so a slow machine doesn't spiral), and only a stall of over a second is let go
      acc = Math.min(acc + Math.min(real, 1) * input.speed, 1);
      while (acc >= DT && performance.now() - t0 < 30) {
        if (!lockstep.tryStep()) { acc = 0; break; }
        acc -= DT;
      }
    }
    const t1 = performance.now();
    input.alpha = Math.min(1, acc / DT);
    // a unit that changed form stays selected as its new self
    for (const e of world.events) if (e.type === 'metamorph' && input.rs.selected.delete(e.id)) input.rs.selected.add(e.into);
    renderer.consumeEvents(world.events);
    audio.handle(world.events, renderer.cam);
    world.events = [];
    input.update(dt);
    renderer.draw(input.alpha, dt, input.rs);
    const t2 = performance.now();
    minimap.draw(renderer.cam);
    hud.update(dt, input.selected, fps);
    // a lesson's checklist: each step ticks itself off (and dims) once the world shows it done
    if (m === 'tutorial' && lesson.steps && world.tick % 5 === 0) {
      document.querySelectorAll<HTMLElement>('#help .lesson-steps li:not(.done)').forEach((li) => {
        const i = [...li.parentElement!.children].indexOf(li);
        if (!lesson.steps![i].done(world)) return;
        li.classList.add('done');
        stepsDone.add(i);
        try { sessionStorage.setItem(STEPS_KEY, JSON.stringify([...stepsDone])); } catch { /* private mode */ }
      });
    }
    cartDebug.update(input.alpha, dt);
    // ?debug: each slow frame's breakdown, for scripts/perf.mjs (the time since the last frame, and this frame's parts)
    if (debugPerf && real > 0.1) slowFrames.push({ at: Math.round(now), gap: Math.round(real * 1000), sim: Math.round(t1 - t0), draw: Math.round(t2 - t1), hud: Math.round(performance.now() - t2) });
    simMs = simMs * 0.95 + (t1 - t0) * 0.05;
    drawMs = drawMs * 0.95 + (t2 - t1) * 0.05;
    if (now - perfSince > 500) {
      fps = (perfFrames * 1000) / (now - perfSince);
      perfEl.textContent = `${Math.round(fps)} fps${debugPerf ? ` (worst ${Math.round(perfWorst * 1000)} ms)` : ''} · sim ${simMs.toFixed(1)} ms · draw ${drawMs.toFixed(1)} ms`;
      perfFrames = 0; perfSince = now; perfWorst = 0;
    }

    if (world.winner >= 0 && !scored && world.scenario.victory) {
      scored = true;
      resignBtn.style.display = 'none';
      matchEl.innerHTML = '';
      showScore(scoreBox, world, m === 'spectate' ? -1 : HUMAN, () => {});
    }
    const status = world.winner >= 0
      ? (m === 'spectate' ? `${world.players[world.winner].name} wins` : world.winner === HUMAN ? 'Victory' : 'Defeat')
      : input.paused ? 'Paused' : '';
    if (!overlay.dataset.sticky) {
      overlay.textContent = status;
      overlay.style.display = status ? 'flex' : 'none';
    }
    speedEl.textContent = input.mode === 'resupplyDest' && !input.viaTouch ? 'Holding R: click where they should go after resupplying' : input.speed !== 1 ? `${input.speed}× speed` : '';
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  Object.assign(window, { world, renderer, input, lockstep, bank, issue: (cmd: Parameters<LocalInput['issue']>[0]) => local.issue(cmd) });
  console.log(`VibeCraft — ${m}, seed ${m === 'online' ? '(host chose)' : seed}, you are seat ${HUMAN + 1}.`);
}
