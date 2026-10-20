import './style.css';
import { meadowfolk } from './factions/meadowfolk';
import { PLAYABLE } from './factions';
import type { FactionSpec } from './factions/types';
import { training } from './factions/training';
import { World, DT } from './sim/world';
import { faceoff, provingGrounds, skirmish } from './sim/scenarios';
import { LESSONS, tutorialScenario } from './tutorial';
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

type Mode = 'demo' | 'skirmish' | 'spectate' | 'online' | 'faceoff' | 'tutorial' | 'battle';
const params = new URLSearchParams(location.search);
// Seed choice happens outside the sim, so Math.random is fine here.
const seed = Number(params.get('seed') ?? Math.floor(Math.random() * 1e9));

mountSettingsDialog();
const menu = document.getElementById('menu')!;

// who plays whom in skirmish / spectate (remembered between visits)
const PICK_KEY = 'vibecraft.matchup';
const picked = (() => { try { return JSON.parse(localStorage.getItem(PICK_KEY) ?? '{}') as { you?: string; foe?: string; map?: string; ai?: string }; } catch { return {}; } })();
for (const sel of menu.querySelectorAll<HTMLSelectElement>('[data-pick]')) {
  const which = sel.dataset.pick as 'you' | 'foe';
  sel.innerHTML = PLAYABLE.map((f) => `<option value="${f.id}">${f.name}</option>`).join('');
  sel.value = params.get(which) ?? picked[which] ?? (which === 'foe' && PLAYABLE[1] ? PLAYABLE[1].id : PLAYABLE[0].id);
  sel.addEventListener('change', () => { picked[which] = sel.value; try { localStorage.setItem(PICK_KEY, JSON.stringify(picked)); } catch { /* private mode */ } });
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
else if ((mode as string) === 'prebake') { menu.style.display = 'none'; void import('./dev/prebake').then((m) => m.runPrebake()); }
else if (mode) start(mode);
else {
  menu.style.display = 'flex';
  menu.addEventListener('click', (e) => {
    const href = (e.target as HTMLElement).closest<HTMLElement>('[data-href]')?.dataset.href;
    if (href) { location.href = href; return; }
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
  const lessonIx = Math.max(0, Math.min(LESSONS.length - 1, +(params.get('lesson') ?? 0) || 0)), lesson = LESSONS[lessonIx];
  const world = m === 'tutorial'
    ? new World({ seed, scenario: tutorialScenario(lesson), players: [{ name: 'You', faction: lesson.you }, { name: lesson.foe.name, faction: lesson.foe }] })
    : m === 'faceoff'
    ? new World({ seed, scenario: faceoff(), players: [{ name: pick('you').name, faction: pick('you') }, { name: pick('foe').name, faction: pick('foe') }] })
    : m === 'demo'
    ? new World({ seed, scenario: provingGrounds(), players: [{ name: 'You', faction: pick('you') }, { name: 'Training Grounds', faction: training }] })
    : new World({ seed, scenario: skirmish(mapSel.value), players: [{ name: m === 'spectate' ? pick('you').name : 'You', faction: pick('you') }, { name: pick('foe').name, faction: pick('foe') }] });
  await run({
    mode: m, world, me: 0, transport: new LoopbackTransport(), delay: 2,
    sources: (local) => {
      const d = difficulty();
      const s: CommandSource[] = m === 'spectate' ? [new SkirmishAI(0, d), new SkirmishAI(1, d)] : m === 'skirmish' ? [local, new SkirmishAI(1, d)] : [local];
      if (m === 'demo' || m === 'faceoff' || m === 'tutorial') s.push({ player: 1, poll: () => [] }); // the dummies never act (a faceoff just stands; a lesson's foes do only what it set up)
      return s;
    },
  });
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
  // fog of war for whoever's playing (spectators and the proving grounds see everything)
  renderer.viewer = minimap.viewer = m === 'spectate' || m === 'demo' || m === 'faceoff' || m === 'tutorial' ? -1 : HUMAN;
  const audio = new AudioEngine(world, bank, HUMAN);
  soundDebug();
  audio.alerts = m === 'skirmish' || m === 'online' || m === 'battle'; // a horn when your side is newly attacked
  const input = new Input(canvas, world, renderer, minimap, HUMAN, (cmd) => {
    local.issue(cmd);
    audio.answerOrder(cmd, HUMAN);
  });
  input.onSelect = (ids, group) => audio.answerSelect(ids, group, HUMAN);
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
    morph: (into, spawn) => local.issue({ type: 'metamorph', units: input.selectedUnits(), into, spawn: spawn || undefined }),
    cancelSpawn: () => local.issue({ type: 'cancelSpawn', units: input.selectedUnits() }),
    ungarrison: (building) => local.issue({ type: 'ungarrison', building }),
  });

  const resize = () => renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  window.addEventListener('resize', resize);
  resize();

  // a pitched battle opens on deployment: the world holds still until Ready
  const deploy = m === 'battle' ? new BattleDeploy(world, renderer, canvas, input.rs, (ids) => input.setSelection(ids), () => { if (battleAI) battleAI.started = true; }) : null;
  if (m === 'faceoff') renderer.cam.centerOn(25, 25);
  else if (m === 'battle') { /* (the deploy step framed the camera) */ }
  else if (m === 'tutorial') {
    const ix = Math.max(0, Math.min(LESSONS.length - 1, +(params.get('lesson') ?? 0) || 0)), lesson = LESSONS[ix];
    renderer.cam.centerOn(lesson.look[0], lesson.look[1]);
    input.setSelection(world.unitsOf(HUMAN).filter((u) => u.specId !== world.factionOf(HUMAN).carterId).map((u) => u.id));
    // the lesson's caption, in the help panel: what to try, and Back / Restart / Next (nothing is checked)
    const help = document.getElementById('help')!;
    const go = (i: number) => `?mode=tutorial&lesson=${i}`;
    help.classList.add('lesson');
    help.innerHTML = `<b>Lesson ${ix + 1} of ${LESSONS.length}: ${lesson.title}</b>${lesson.text}
      <div class="lesson-nav">${ix > 0 ? `<a href="${go(ix - 1)}">◀ Back</a>` : '<span></span>'}<a href="${go(ix)}">Restart</a>${ix < LESSONS.length - 1 ? `<a href="${go(ix + 1)}">Next ▶</a>` : '<a href="./">Finish</a>'}</div>`;
  }
  else if (m === 'demo') {
    renderer.cam.centerOn(22, 26);
    input.setSelection(world.unitsOf(HUMAN).filter((u) => u.specId !== world.factionOf(HUMAN).workerId).map((u) => u.id));
  } else {
    const tc = world.buildingsOf(HUMAN)[0];
    renderer.cam.centerOn(tc.ox + 3, tc.oy + 3);
    input.setSelection(world.unitsOf(HUMAN).map((u) => u.id));
  }
  // Warm up behind the loading screen. The browser runs code slowly until it has run often enough to be compiled
  // fast, and at a few frames a second that took half a minute: the game opened in slow motion. So a throwaway copy of
  // a match (the sim and two AIs) plays here while frames are drawn, until steps and frames are quick (30 s at most).
  // The first frames' one-off work (every tree's sprite, shader compiles, the fog, minimap and HUD icons) is done too.
  label.textContent = 'Getting ready…';
  {
    const sides = world.players.filter((p) => !p.neutral).slice(0, 2);
    const practice = new World({ seed: 1, scenario: skirmish('woodlands'), players: sides.map((p) => ({ name: p.name, faction: world.factionOf(p.id) })) });
    const ais = sides.map((_, i) => new SkirmishAI(i, 'easy'));
    await new Promise<void>((done) => {
      const start = performance.now();
      let prev = start, quick = 0, steps = 0;
      const warm = (now: number) => {
        quick = now - prev < 50 ? quick + 1 : 0;
        prev = now;
        let slowest = 0;
        for (let t0 = performance.now(); performance.now() - t0 < 20 && practice.winner < 0;) {
          const a = performance.now();
          practice.step(ais.flatMap((ai) => ai.think(practice).map((cmd) => ({ player: ai.player, cmd }))));
          practice.events = [];
          slowest = Math.max(slowest, performance.now() - a);
          steps++;
        }
        renderer.draw(0, 0, input.rs);
        minimap.draw(renderer.cam);
        hud.update(0, input.selected, 60);
        if ((quick >= 10 && steps >= 400 && slowest < 5) || now - start > 30000) done();
        else requestAnimationFrame(warm);
      };
      requestAnimationFrame(warm);
    });
  }
  loading.style.display = 'none';
  document.getElementById('hud')!.style.display = 'block';
  if (m === 'demo' || m === 'tutorial') document.getElementById('help')!.style.display = 'block';

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
  resignBtn.onclick = () => { if (world.winner < 0 && !world.players[HUMAN].defeated && confirm('Resign this match?')) local.issue({ type: 'resign' }); };
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
      showScore(scoreBox, world, m === 'spectate' ? -1 : HUMAN, () => {});
    }
    const status = world.winner >= 0
      ? (m === 'spectate' ? `${world.players[world.winner].name} wins` : world.winner === HUMAN ? 'Victory' : 'Defeat')
      : input.paused ? 'Paused' : '';
    if (!overlay.dataset.sticky) {
      overlay.textContent = status;
      overlay.style.display = status ? 'flex' : 'none';
    }
    speedEl.textContent = input.mode === 'resupplyDest' ? 'Holding R: click where they should go after resupplying' : input.speed !== 1 ? `${input.speed}× speed` : '';
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  Object.assign(window, { world, renderer, input, lockstep, bank, issue: (cmd: Parameters<LocalInput['issue']>[0]) => local.issue(cmd) });
  console.log(`VibeCraft — ${m}, seed ${m === 'online' ? '(host chose)' : seed}, you are seat ${HUMAN + 1}.`);
}
