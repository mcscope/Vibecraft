import './style.css';
import { meadowfolk } from './factions/meadowfolk';
import { PLAYABLE } from './factions';
import type { FactionSpec } from './factions/types';
import { training } from './factions/training';
import { World, DT } from './sim/world';
import { provingGrounds, skirmish } from './sim/scenarios';
import { MAPS } from './sim/map';
import { Lockstep, LocalInput, LoopbackTransport, type CommandSource, type Transport } from './net/lockstep';
import { NetTransport } from './net/relayClient';
import type { OnlineGame } from './net/online';
import { openLobby } from './ui/lobby';
import { showScore } from './ui/scoreScreen';
import { mountChat } from './ui/chat';
import { TEAM_COLORS } from './render/artbank';
import { SkirmishAI } from './ai/skirmishAI';
import { CartDebug } from './ui/cartDebug';
import { Renderer } from './render/renderer';
import { ArtBank } from './render/artbank';
import { Hud } from './ui/hud';
import { Input } from './ui/input';
import { Minimap } from './ui/minimap';
import { AudioEngine } from './audio/engine';
import { mountSettingsDialog, onSettings, settings } from './ui/settings';

type Mode = 'demo' | 'skirmish' | 'spectate' | 'online';
const params = new URLSearchParams(location.search);
// Seed choice happens outside the sim, so Math.random is fine here.
const seed = Number(params.get('seed') ?? Math.floor(Math.random() * 1e9));

mountSettingsDialog();
const menu = document.getElementById('menu')!;

// who plays whom in skirmish / spectate (remembered between visits)
const PICK_KEY = 'vibecraft.matchup';
const picked = (() => { try { return JSON.parse(localStorage.getItem(PICK_KEY) ?? '{}') as { you?: string; foe?: string; map?: string }; } catch { return {}; } })();
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
const pick = (which: 'you' | 'foe'): FactionSpec => PLAYABLE.find((f) => f.id === menu.querySelector<HTMLSelectElement>(`[data-pick="${which}"]`)!.value) ?? meadowfolk;
const loading = document.getElementById('loading')!;
const mode = params.get('mode') as Mode | 'arena' | null;
if (mode === 'arena') { menu.style.display = 'none'; void import('./arena/arenaMode').then((m) => m.runArena(params)); }
else if ((mode as string) === 'sprites') { menu.style.display = 'none'; void import('./dev/spriteSheet').then((m) => m.runSpriteSheet(params)); }
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
    history.replaceState(null, '', `?mode=${m}&you=${pick('you').id}&foe=${pick('foe').id}&map=${mapSel.value}`);
    start(m);
  });
}

async function start(m: Mode): Promise<void> {
  const world = m === 'demo'
    ? new World({ seed, scenario: provingGrounds(), players: [{ name: 'You', faction: pick('you') }, { name: 'Training Grounds', faction: training }] })
    : new World({ seed, scenario: skirmish(mapSel.value), players: [{ name: m === 'spectate' ? pick('you').name : 'You', faction: pick('you') }, { name: pick('foe').name, faction: pick('foe') }] });
  await run({
    mode: m, world, me: 0, transport: new LoopbackTransport(), delay: 2,
    sources: (local) => {
      const s: CommandSource[] = m === 'spectate' ? [new SkirmishAI(0), new SkirmishAI(1)] : m === 'skirmish' ? [local, new SkirmishAI(1)] : [local];
      if (m === 'demo') s.push({ player: 1, poll: () => [] }); // the dummies never act
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
  const renderer = new Renderer(canvas, world, bank, { damageNumbers: m === 'demo' }, m === 'demo' ? [[18, 26, 4], [31, 26, 5]] : []);
  await renderer.init();
  const minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, world, 200, (x, y) => bank.biomeAt(x, y).ground);
  // fog of war for whoever's playing (spectators and the proving grounds see everything)
  renderer.viewer = minimap.viewer = m === 'spectate' || m === 'demo' ? -1 : HUMAN;
  const audio = new AudioEngine(world, bank, HUMAN);
  const input = new Input(canvas, world, renderer, minimap, HUMAN, (cmd) => {
    local.issue(cmd);
    // the first unit given an order answers it
    const first = 'units' in cmd ? cmd.units.map((id) => world.units.get(id)).find((u) => u && u.owner === HUMAN) : undefined;
    if (first) audio.unitLine(first.owner, first.specId, 'acknowledge');
  });
  input.onSelect = (ids) => {
    const u = ids.map((id) => world.units.get(id)).find((x) => x && x.owner === HUMAN);
    if (u) audio.unitLine(u.owner, u.specId, 'select');
  };
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
    ungarrison: (building) => local.issue({ type: 'ungarrison', building }),
  });

  const resize = () => renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  window.addEventListener('resize', resize);
  resize();

  if (m === 'demo') {
    renderer.cam.centerOn(22, 26);
    input.setSelection(world.unitsOf(HUMAN).filter((u) => u.specId !== world.factionOf(HUMAN).workerId).map((u) => u.id));
  } else {
    const tc = world.buildingsOf(HUMAN)[0];
    renderer.cam.centerOn(tc.ox + 3, tc.oy + 3);
    input.setSelection(world.unitsOf(HUMAN).map((u) => u.id));
  }
  loading.style.display = 'none';
  document.getElementById('hud')!.style.display = 'block';
  if (m === 'demo') document.getElementById('help')!.style.display = 'block';

  let acc = 0;
  let last = performance.now();
  let fps = 60;
  const overlay = document.getElementById('overlay')!;
  const speedEl = document.getElementById('speed')!;
  // resign (players only, in matches that can be won) and the score screen when it's over
  const resignBtn = document.getElementById('resign')!;
  const canResign = m === 'skirmish' || m === 'online';
  resignBtn.style.display = canResign ? '' : 'none';
  resignBtn.onclick = () => { if (world.winner < 0 && !world.players[HUMAN].defeated && confirm('Resign this match?')) local.issue({ type: 'resign' }); };
  let scored = false;
  const scoreBox = document.getElementById('score')!;

  const cartDebug = new CartDebug(world, renderer.cam, HUMAN);
  let simMs = 0, drawMs = 0, perfTick = 0;
  const perfEl = document.querySelector<HTMLElement>('[data-res="fps"]')!;
  const showPerf = () => (perfEl.style.display = settings().perf ? '' : 'none');
  showPerf();
  onSettings(showPerf);
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    const t0 = performance.now();
    if (!input.paused) {
      acc += dt * input.speed;
      let steps = 0;
      while (acc >= DT && steps < 40) {
        if (!lockstep.tryStep()) { acc = 0; break; }
        acc -= DT;
        steps++;
      }
    }
    const t1 = performance.now();
    input.alpha = Math.min(1, acc / DT);
    renderer.consumeEvents(world.events);
    audio.handle(world.events, renderer.cam);
    world.events = [];
    input.update(dt);
    renderer.draw(input.alpha, dt, input.rs);
    const t2 = performance.now();
    minimap.draw(renderer.cam);
    hud.update(dt, input.selected, fps);
    cartDebug.update(input.alpha, dt);
    simMs = simMs * 0.95 + (t1 - t0) * 0.05;
    drawMs = drawMs * 0.95 + (t2 - t1) * 0.05;
    if ((perfTick += dt) > 0.5) {
      perfTick = 0;
      perfEl.textContent = `${Math.round(fps)} fps · sim ${simMs.toFixed(1)} ms · draw ${drawMs.toFixed(1)} ms`;
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
