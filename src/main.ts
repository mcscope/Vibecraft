import './style.css';
import { meadowfolk } from './factions/meadowfolk';
import { training } from './factions/training';
import { World, DT } from './sim/world';
import { provingGrounds, skirmish } from './sim/scenarios';
import { Lockstep, LocalInput, LoopbackTransport, type CommandSource } from './net/lockstep';
import { SkirmishAI } from './ai/skirmishAI';
import { Renderer } from './render/renderer';
import { ArtBank } from './render/artbank';
import { Hud } from './ui/hud';
import { Input } from './ui/input';
import { Minimap } from './ui/minimap';
import { AudioEngine } from './audio/engine';
import { mountSettingsDialog, onSettings, settings } from './ui/settings';

type Mode = 'demo' | 'skirmish' | 'spectate';
const HUMAN = 0;
const params = new URLSearchParams(location.search);
// Seed choice happens outside the sim, so Math.random is fine here.
const seed = Number(params.get('seed') ?? Math.floor(Math.random() * 1e9));

mountSettingsDialog();
const menu = document.getElementById('menu')!;
const loading = document.getElementById('loading')!;
const mode = params.get('mode') as Mode | null;
if (mode) start(mode);
else {
  menu.style.display = 'flex';
  menu.addEventListener('click', (e) => {
    const m = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')?.dataset.mode as Mode | undefined;
    if (!m) return;
    history.replaceState(null, '', `?mode=${m}`);
    start(m);
  });
}

async function start(m: Mode): Promise<void> {
  menu.style.display = 'none';
  loading.style.display = 'flex';
  const world = m === 'demo'
    ? new World({ seed, scenario: provingGrounds(), players: [{ name: 'You', faction: meadowfolk }, { name: 'Training Grounds', faction: training }] })
    : new World({ seed, scenario: skirmish(), players: [{ name: m === 'spectate' ? 'Blue' : 'You', faction: meadowfolk }, { name: 'Red', faction: meadowfolk }] });

  const bar = loading.querySelector<HTMLElement>('.fill')!;
  const label = loading.querySelector<HTMLElement>('.label')!;
  // the map's biome art, loaded lazily like faction art (it brings the 3D kit with it)
  const bank = await ArtBank.build(world, (p) => import('./biomes/meadow').then((m) => m.bakeMeadow(p)), (f, text) => {
    bar.style.width = `${Math.round(f * 100)}%`;
    label.textContent = text;
  });

  const local = new LocalInput(HUMAN);
  const sources: CommandSource[] = m === 'spectate' ? [new SkirmishAI(0), new SkirmishAI(1)] : m === 'skirmish' ? [local, new SkirmishAI(1)] : [local];
  if (m === 'demo') sources.push({ player: 1, poll: () => [] }); // the dummies never act
  const lockstep = new Lockstep(world, sources, [0, 1], new LoopbackTransport(), 2);
  lockstep.onDesync = (tick, h) => console.error('DESYNC at tick', tick, h);

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new Renderer(canvas, world, bank, { damageNumbers: m === 'demo' }, m === 'demo' ? [[18, 26, 4], [31, 26, 5]] : []);
  await renderer.init();
  const minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, world);
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
    cancelTrain: (building) => local.issue({ type: 'cancelTrain', building }),
    select: (ids) => input.setSelection(ids),
    command: (kind) => input.hudCommand(kind),
  });

  const resize = () => renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  window.addEventListener('resize', resize);
  resize();

  if (m === 'demo') {
    renderer.cam.centerOn(22, 26);
    input.setSelection(world.unitsOf(HUMAN).filter((u) => u.specId !== 'villager').map((u) => u.id));
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
    simMs = simMs * 0.95 + (t1 - t0) * 0.05;
    drawMs = drawMs * 0.95 + (t2 - t1) * 0.05;
    if ((perfTick += dt) > 0.5) {
      perfTick = 0;
      perfEl.textContent = `${Math.round(fps)} fps · sim ${simMs.toFixed(1)} ms · draw ${drawMs.toFixed(1)} ms`;
    }

    const status = world.winner >= 0
      ? (m === 'spectate' ? `${world.players[world.winner].name} wins` : world.winner === HUMAN ? 'Victory' : 'Defeat')
      : input.paused ? 'Paused' : '';
    overlay.textContent = status;
    overlay.style.display = status ? 'flex' : 'none';
    speedEl.textContent = input.mode === 'resupplyDest' ? 'Holding R: click where they should go after resupplying' : input.speed !== 1 ? `${input.speed}× speed` : '';
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  Object.assign(window, { world, renderer, input, lockstep, bank });
  console.log(`VibeCraft — ${m}, seed ${seed}.`);
}
