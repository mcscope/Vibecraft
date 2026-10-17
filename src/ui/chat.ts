// Chat with the other people in an online room: a box in the lobby, and in a
// game a few recent lines over the map with Enter to talk. Lines travel over the
// relay beside the game (net/relayClient.ts), never through lockstep.
import { CHAT_MAX, type ChatLine, type RelayClient } from '../net/relayClient';
import { esc } from './format';

const FADE_MS = 12000;

/**
 * Mount a chat into `box`. In the lobby (`inGame` false) the log and input are
 * always shown; in a game the input opens on Enter and old lines fade.
 * Returns a function that unmounts it.
 */
export function mountChat(box: HTMLElement, relay: RelayClient, name: () => string, inGame: boolean, colorOf: (from: number) => string = () => 'var(--gold)'): () => void {
  box.classList.add('chat', inGame ? 'chat-game' : 'chat-lobby');
  box.innerHTML = `<div class="chat-log"></div><input class="chat-input" maxlength="${CHAT_MAX}" placeholder="${inGame ? 'Say something (Enter to send, Esc to close)' : 'Chat with the room'}" spellcheck="false">`;
  const log = box.querySelector<HTMLElement>('.chat-log')!;
  const input = box.querySelector<HTMLInputElement>('.chat-input')!;
  const add = (l: ChatLine) => {
    const el = document.createElement('div');
    el.className = 'chat-line';
    el.innerHTML = `<b style="color:${colorOf(l.from)}">${esc(l.name)}</b> ${esc(l.text)}`;
    log.append(el);
    while (log.children.length > 60) log.firstElementChild!.remove();
    log.scrollTop = log.scrollHeight;
    if (inGame) setTimeout(() => el.classList.add('old'), FADE_MS);
  };
  for (const l of relay.chat) add(l);
  if (inGame) for (const el of log.children) el.classList.add('old'); // the lobby's talk, faded
  const off = relay.onChat(add);
  const open = (on: boolean) => { box.classList.toggle('open', on); if (on) input.focus(); else input.blur(); };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // typing isn't hotkeys
    if (e.key === 'Enter') { relay.say(input.value, name()); input.value = ''; if (inGame) open(false); }
    else if (e.key === 'Escape' && inGame) { input.value = ''; open(false); }
  });
  const onKey = (e: KeyboardEvent) => {
    if (!inGame || e.key !== 'Enter' || (e.target as HTMLElement).tagName === 'INPUT') return;
    e.preventDefault();
    open(true);
  };
  window.addEventListener('keydown', onKey);
  if (!inGame) open(true);
  return () => { off(); window.removeEventListener('keydown', onKey); box.innerHTML = ''; };
}
