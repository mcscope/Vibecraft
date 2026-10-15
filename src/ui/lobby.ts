// Online lobby: pick a relay, a room and your faction; the first player in the
// room hosts and starts the game. Factions travel as data (see net/bundle.ts).
import { PLAYABLE } from '../factions';
import { Handshake, SEATS, type OnlineGame } from '../net/online';
import { RelayClient } from '../net/relayClient';
import { esc } from './format';
import { MAPS } from '../sim/map';

const KEY = 'vibecraft.online';
const remembered = (): { relay?: string; room?: string; name?: string; faction?: string; map?: string } => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
};
const remember = (v: object) => { try { localStorage.setItem(KEY, JSON.stringify({ ...remembered(), ...v })); } catch { /* private mode */ } };
const randomRoom = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)]).join('');

export function openLobby(box: HTMLElement, onGame: (g: OnlineGame) => void, onBack: () => void): void {
  const r = remembered();
  box.innerHTML = `
    <h2>Online game</h2>
    <p class="sub">Each player brings their own faction from their own client. It's baked on your machine and sent to the others as data.</p>
    <div class="lobby-form">
      <label>Relay <input name="relay" value="${esc(r.relay ?? `ws://${location.hostname || 'localhost'}:5190`)}" spellcheck="false"></label>
      <label>Room <input name="room" value="${esc(r.room ?? randomRoom())}" maxlength="20" spellcheck="false"></label>
      <label>Name <input name="name" value="${esc(r.name ?? '')}" maxlength="24" placeholder="Your name"></label>
      <label>Faction <select name="faction">${PLAYABLE.map((f) => `<option value="${esc(f.id)}" ${r.faction === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
    </div>
    <div class="lobby-peers"></div>
    <div class="lobby-status"></div>
    <div class="lobby-buttons"><button data-act="join"><b>Join room</b></button><button data-act="back"><b>Back</b></button></div>
    <p class="hint">Run the relay with <code>npm run relay</code> on one machine; everyone uses its address (port 5190).</p>`;
  const $ = <T extends HTMLElement>(s: string) => box.querySelector<T>(s)!;
  const status = (t: string, bad = false) => { const el = $('.lobby-status'); el.textContent = t; el.classList.toggle('bad', bad); };
  let relay: RelayClient | null = null;
  let hs: Handshake | null = null;

  const showPeers = () => {
    if (!relay) return;
    const host = relay.peers[0]?.id === relay.you;
    $('.lobby-peers').innerHTML = `<h3>Room ${esc(($('[name=room]') as HTMLInputElement).value)}</h3><ol>${relay.peers.map((p, i) => `<li>${esc(p.name)}${p.id === relay!.you ? ' <small>(you)</small>' : ''}${i === 0 ? ' <small>host</small>' : ''}${i >= SEATS ? ' <small>watching: game is 1v1</small>' : ''}</li>`).join('')}</ol>`;
    const buttons = $('.lobby-buttons');
    buttons.innerHTML = host
      ? `<label class="lobby-map">Map <select name="map">${MAPS.map((m) => `<option value="${m.id}" ${remembered().map === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label><button data-act="start" ${relay.peers.length < SEATS ? 'disabled' : ''}><b>Start game</b></button><button data-act="leave"><b>Leave</b></button>`
      : `<button data-act="leave"><b>Leave</b></button>`;
    if (!hs?.started) status(relay.peers.length < SEATS ? 'Waiting for another player to join this room…' : host ? 'Ready: press Start.' : 'Waiting for the host to start…');
  };

  box.onclick = async (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'back') { relay?.close(); onBack(); return; }
    if (act === 'leave') { relay?.close(); relay = null; openLobby(box, onGame, onBack); return; }
    if (act === 'start') { const map = box.querySelector<HTMLSelectElement>('[name=map]')?.value ?? MAPS[0].id; remember({ map }); hs?.start(map); return; }
    if (act !== 'join') return;
    const v = (n: string) => ($(`[name=${n}]`) as HTMLInputElement).value.trim();
    const faction = PLAYABLE.find((f) => f.id === v('faction')) ?? PLAYABLE[0];
    const name = v('name') || 'Player';
    remember({ relay: v('relay'), room: v('room'), name: v('name'), faction: faction.id });
    status(`Connecting to ${v('relay')}…`);
    try {
      relay = await RelayClient.connect(v('relay'), v('room').toUpperCase(), name);
    } catch (err) { status(`${(err as Error).message}. Is the relay running? (npm run relay)`, true); return; }
    box.querySelectorAll<HTMLInputElement>('.lobby-form input, .lobby-form select').forEach((el) => (el.disabled = true));
    hs = new Handshake(relay, faction, (t) => status(t));
    relay.onPeers = showPeers;
    relay.onClose = () => status('Disconnected from the relay.', true);
    showPeers();
    hs.done.then(onGame, (err) => status((err as Error).message, true));
  };
}
