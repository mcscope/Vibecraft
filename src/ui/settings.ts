// Player settings (control scheme etc.), remembered in localStorage.

export interface KeyMap {
  label: string;
  description: string;
  pan: { up: string[]; down: string[]; left: string[]; right: string[] };
  attackMove: string;
  /** Move, ignoring whatever's under the cursor (pull units out of a fight). */
  move: string;
  stop: string;
  resupply: string;
  give: string;
  home: string;
  /** Town Center training slots, in faction unit order. */
  train: string[];
}

export const SCHEMES: Record<string, KeyMap> = {
  wasd: {
    label: 'WASD camera',
    description: 'Scroll with WASD (and arrows). Commands move off the WASD keys.',
    pan: { up: ['w', 'arrowup'], down: ['s', 'arrowdown'], left: ['a', 'arrowleft'], right: ['d', 'arrowright'] },
    attackMove: 'f', move: 'q', stop: 'x', resupply: 'r', give: 'g', home: 'h',
    train: ['z', 'x', 'c', 'v', 'b', 'n'],
  },
  classic: {
    label: 'Classic RTS',
    description: 'StarCraft/AoE style: arrows and screen edge scroll; A attack-move, S stop.',
    pan: { up: ['arrowup'], down: ['arrowdown'], left: ['arrowleft'], right: ['arrowright'] },
    attackMove: 'a', move: 'q', stop: 's', resupply: 'r', give: 'g', home: 'h',
    train: ['q', 'w', 'e', 'r', 't', 'y'],
  },
};

export interface Settings {
  scheme: keyof typeof SCHEMES;
  edgeScroll: boolean;
  /** Camera pan speed multiplier. */
  scrollSpeed: number;
  /** Show the fps / sim / draw readout. */
  perf: boolean;
  /** Show the cart / supply debug overlay (9). */
  cartDebug: boolean;
  volume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
}

const DEFAULTS: Settings = { scheme: 'wasd', edgeScroll: true, scrollSpeed: 1, perf: true, cartDebug: false, volume: 0.8, sfxVolume: 0.9, musicVolume: 0.6, muted: false };
const KEY = 'vibecraft.settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* private mode etc. */ }
  return { ...DEFAULTS };
}

let current = load();
const listeners = new Set<(s: Settings) => void>();

export function settings(): Settings { return current; }
export function keymap(): KeyMap { return SCHEMES[current.scheme] ?? SCHEMES.wasd; }

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
  for (const l of listeners) l(current);
}

export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const keyName = (k: string) => (k.startsWith('arrow') ? k.replace('arrow', '').replace(/^./, (c) => c.toUpperCase()) : k.toUpperCase());

/** Wire up the settings dialog in index.html. */
export function mountSettingsDialog(): void {
  const dlg = document.getElementById('settings') as HTMLElement;
  const render = () => {
    const s = current;
    const km = keymap();
    dlg.querySelector('.body')!.innerHTML = `
      <h3>Controls</h3>
      ${Object.entries(SCHEMES).map(([id, m]) => `
        <label class="opt"><input type="radio" name="scheme" value="${id}" ${s.scheme === id ? 'checked' : ''}>
          <b>${m.label}</b><span>${m.description}</span></label>`).join('')}
      <label class="opt inline"><input type="checkbox" name="edge" ${s.edgeScroll ? 'checked' : ''}> Scroll at screen edges</label>
      <label class="opt inline">Scroll speed <input type="range" name="speed" min="0.4" max="2.5" step="0.1" value="${s.scrollSpeed}"> <span>${s.scrollSpeed.toFixed(1)}×</span></label>
      <label class="opt inline"><input type="checkbox" name="perf" ${s.perf ? 'checked' : ''}> Show performance readout</label>
      <label class="opt inline"><input type="checkbox" name="cartDebug" ${s.cartDebug ? 'checked' : ''}> Cart debug overlay (<kbd>9</kbd>)</label>
      <h3>Sound</h3>
      <label class="opt inline">Master <input type="range" name="volume" min="0" max="1" step="0.05" value="${s.volume}"> <span>${Math.round(s.volume * 100)}%</span></label>
      <label class="opt inline">Effects <input type="range" name="sfxVolume" min="0" max="1" step="0.05" value="${s.sfxVolume}"> <span>${Math.round(s.sfxVolume * 100)}%</span></label>
      <label class="opt inline">Music <input type="range" name="musicVolume" min="0" max="1" step="0.05" value="${s.musicVolume}"> <span>${Math.round(s.musicVolume * 100)}%</span></label>
      <label class="opt inline"><input type="checkbox" name="muted" ${s.muted ? 'checked' : ''}> Mute (<kbd>M</kbd>)</label>
      <h3>Keys</h3>
      <table class="keys">
        <tr><td>Scroll</td><td>${[km.pan.up, km.pan.left, km.pan.down, km.pan.right].map((k) => k.map(keyName).join('/')).join(' · ')}</td></tr>
        <tr><td>Attack-move</td><td><kbd>${keyName(km.attackMove)}</kbd> then click</td></tr>
        <tr><td>Move (ignore enemies)</td><td><kbd>${keyName(km.move)}</kbd> then click</td></tr>
        <tr><td>Stop</td><td><kbd>${keyName(km.stop)}</kbd></td></tr>
        <tr><td>Resupply</td><td>tap <kbd>${keyName(km.resupply)}</kbd> to return after · hold + click to go elsewhere</td></tr>
        <tr><td>Give</td><td><kbd>${keyName(km.give)}</kbd> then click a friendly unit</td></tr>
        <tr><td>Home base</td><td><kbd>${keyName(km.home)}</kbd>, then train with ${km.train.slice(0, 5).map((k) => `<kbd>${keyName(k)}</kbd>`).join(' ')}</td></tr>
        <tr><td>Groups</td><td><kbd>Ctrl</kbd>+<kbd>1–8</kbd> set · <kbd>1–8</kbd> select · double-tap to jump</td></tr>
        <tr><td>Other</td><td><kbd>Space</kbd> center · <kbd>P</kbd> pause · <kbd>[</kbd> <kbd>]</kbd> speed · <kbd>9</kbd> cart debug · <kbd>F10</kbd> settings</td></tr>
      </table>`;
  };
  dlg.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'scheme') updateSettings({ scheme: t.value });
    else if (t.name === 'edge') updateSettings({ edgeScroll: t.checked });
    else if (t.name === 'speed') updateSettings({ scrollSpeed: +t.value });
    else if (t.name === 'perf') updateSettings({ perf: t.checked });
    else if (t.name === 'cartDebug') updateSettings({ cartDebug: t.checked });
    else if (t.name === 'volume' || t.name === 'sfxVolume' || t.name === 'musicVolume') updateSettings({ [t.name]: +t.value });
    else if (t.name === 'muted') updateSettings({ muted: t.checked });
    render();
  });
  dlg.querySelector('.close')!.addEventListener('click', () => toggleSettings(false));
  document.querySelectorAll('[data-open-settings]').forEach((b) => b.addEventListener('click', () => toggleSettings(true)));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F10' || (e.key === 'Escape' && dlg.style.display === 'flex')) { e.preventDefault(); toggleSettings(dlg.style.display !== 'flex'); }
  }, true);
  render();
}

export function settingsOpen(): boolean {
  return document.getElementById('settings')?.style.display === 'flex';
}

export function toggleSettings(open: boolean): void {
  const dlg = document.getElementById('settings') as HTMLElement;
  dlg.style.display = open ? 'flex' : 'none';
}
