// Post-match score screen: who won, totals per player, and small line graphs
// of the match (army value, resources gathered, units) from the sim's stats.
import { TEAM_COLORS } from '../render/artbank';
import type { StatsSample } from '../sim/stats';
import type { World } from '../sim/world';
import { esc } from './format';

const n0 = (x: number) => Math.round(x).toLocaleString('en-US');
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** One small line chart: a line per player over time, with a crosshair readout on hover. */
function chart(title: string, timeline: StatsSample[], pick: (s: StatsSample) => number[], players: Array<{ id: number; name: string }>): string {
  const W = 296, H = 130, L = 40, R = 8, T = 10, B = 22;
  const tMax = Math.max(1, timeline[timeline.length - 1]?.t ?? 1);
  let vMax = 1;
  for (const s of timeline) for (const p of players) vMax = Math.max(vMax, pick(s)[p.id] ?? 0);
  const x = (t: number) => L + (t / tMax) * (W - L - R);
  const y = (v: number) => T + (1 - v / vMax) * (H - T - B);
  const lines = players.map((p) => {
    const pts = timeline.map((s) => `${x(s.t).toFixed(1)},${y(pick(s)[p.id] ?? 0).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${TEAM_COLORS[p.id % TEAM_COLORS.length].primary}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('');
  const grid = [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${y(vMax * f)}" y2="${y(vMax * f)}" class="grid"/><text x="${L - 6}" y="${y(vMax * f) + 4}" text-anchor="end">${n0(vMax * f)}</text>`).join('');
  const data = esc(JSON.stringify({ t: timeline.map((s) => s.t), v: players.map((p) => timeline.map((s) => pick(s)[p.id] ?? 0)), L, R, W, tMax }));
  return `<figure class="score-chart" data-series="${data}">
    <figcaption>${esc(title)}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${grid}
      <text x="${L}" y="${H - 6}">0:00</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${clock(tMax)}</text>
      ${lines}<line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
    </svg>
    <div class="readout"></div>
  </figure>`;
}

/** Fill `box` with the score screen for a finished (or resigned) match, from `me`'s point of view (-1: spectator). */
export function showScore(box: HTMLElement, w: World, me: number, onClose: () => void): void {
  const st = w.stats;
  st.sample(w); // the very end
  const players = w.players.filter((p) => !p.neutral);
  const title = w.winner < 0 ? 'Match over' : me < 0 ? `${w.players[w.winner].name} wins` : w.winner === me ? 'Victory' : 'Defeat';
  const sub = st.resigned >= 0 ? `${w.players[st.resigned].name} resigned` : '';
  const row = (label: string, f: (i: number) => string) => `<tr><th>${label}</th>${players.map((p) => `<td>${f(p.id)}</td>`).join('')}</tr>`;
  const res = (r: 'food' | 'wood' | 'crystal') => (i: number) => n0(st.totals[i].gathered[r]);
  box.innerHTML = `
    <div class="menu-box score-box">
      <h2>${esc(title)}</h2>
      <p class="sub">${esc(sub)}${sub ? ' · ' : ''}${clock(w.tick / 20)} played</p>
      <table class="score-table">
        <tr><th></th>${players.map((p) => `<th><i class="chip" style="background:${TEAM_COLORS[p.id % TEAM_COLORS.length].primary}"></i>${esc(p.name)}${p.id === w.winner ? ' ★' : ''}</th>`).join('')}</tr>
        ${row('Food gathered', res('food'))}
        ${row('Wood gathered', res('wood'))}
        ${row('Crystal gathered', res('crystal'))}
        ${row('Units trained', (i) => n0(st.totals[i].trained))}
        ${row('Units lost', (i) => n0(st.totals[i].lost))}
        ${row('Enemies killed', (i) => n0(st.totals[i].killed))}
        ${row('Buildings razed', (i) => n0(st.totals[i].buildingsRazed))}
      </table>
      <div class="score-charts">
        ${chart('Army value (food + crystal)', st.timeline, (s) => s.army, players)}
        ${chart('Resources gathered (kg)', st.timeline, (s) => s.gathered, players)}
        ${chart('Units alive', st.timeline, (s) => s.units, players)}
      </div>
      <div class="lobby-buttons"><button data-act="menu"><b>Main menu</b></button><button data-act="close"><b>Keep looking</b></button></div>
    </div>`;
  box.style.display = 'flex';
  box.onclick = (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'menu') location.href = location.pathname;
    else if (act === 'close') { box.style.display = 'none'; onClose(); }
  };
  // hover: a crosshair and each player's value at that moment
  for (const fig of box.querySelectorAll<HTMLElement>('.score-chart')) {
    const d = JSON.parse(fig.dataset.series!) as { t: number[]; v: number[][]; L: number; R: number; W: number; tMax: number };
    const svg = fig.querySelector('svg')!, cross = svg.querySelector<SVGLineElement>('.cross')!, out = fig.querySelector<HTMLElement>('.readout')!;
    svg.addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect();
      const t = Math.max(0, Math.min(d.tMax, ((e.clientX - r.left) / r.width * d.W - d.L) / (d.W - d.L - d.R) * d.tMax));
      let i = 0;
      while (i < d.t.length - 1 && d.t[i + 1] <= t) i++;
      const sx = d.L + (d.t[i] / d.tMax) * (d.W - d.L - d.R);
      cross.setAttribute('x1', String(sx)); cross.setAttribute('x2', String(sx)); cross.setAttribute('visibility', 'visible');
      out.innerHTML = `${clock(d.t[i])} · ${players.map((p, k) => `<span><i class="chip" style="background:${TEAM_COLORS[p.id % TEAM_COLORS.length].primary}"></i>${n0(d.v[k][i])}</span>`).join(' ')}`;
    });
    svg.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); out.textContent = ''; });
  }
}
