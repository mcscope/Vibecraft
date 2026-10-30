// Dev page: ?mode=artcheck. Every unit's model measured (in metres) beside what the sim takes it to be: its height (a
// body of its mass), its collision width, and how far its attack reaches. For catching art that doesn't match the sim.
import { units as meadowfolk } from '../factions/meadowfolk';
import { units as fenfolk } from '../factions/fenfolk';
import { units as wildwelds } from '../factions/newfaction';
import { TEAM_COLORS } from '../render/artbank';
import { Baker } from '../kits/bake3d/baker';
import { bodyHeight, derive, M_PER_TILE } from '../sim/physics';
import type { Pose } from '../kits/bake3d/types';

export function runArtCheck(): void {
  const baker = new Baker(), team = TEAM_COLORS[0];
  const rows: string[] = ['unit                         mass | height art/sim | length art | width art / collision | attack reaches art / sim (from its centre)'];
  for (const [fid, list] of [['meadowfolk', meadowfolk], ['fenfolk', fenfolk], ['wildwelds', wildwelds]] as const) for (const u of list) {
    const st = derive(u);
    const pose = (anim: Pose['anim'], phase: number): Pose => ({ anim, phase, team, armed: true, cargo: null });
    const rest = baker.dims(u.model, team, pose('idle', 0));
    // its attack at its most forward (sampled through the swing)
    let reach = 0;
    if (st.canAttack) for (let k = 0; k < 8; k++) reach = Math.max(reach, baker.dims(u.model, team, pose('attack', k / 7)).front);
    const simH = bodyHeight(u.mass), coll = st.radius * 2 * M_PER_TILE, simReach = st.range * M_PER_TILE;
    const flag = (a: number, b: number) => (b > 0 && (a / b > 1.35 || a / b < 0.74) ? ' ◀' : '');
    rows.push(`${(fid + ':' + u.id).padEnd(28)} ${String(u.mass).padStart(4)} | ${rest.top.toFixed(2)} / ${simH.toFixed(2)}${flag(rest.top, simH)} | ${(rest.front + rest.back).toFixed(2)} | ${rest.width.toFixed(2)} / ${coll.toFixed(2)}${flag(Math.max(rest.width, Math.min(rest.width, rest.front + rest.back)), coll)} | ${st.canAttack ? `${reach.toFixed(2)} / ${simReach.toFixed(2)}${u.attack?.style === 'throw' ? ' (throws)' : flag(reach, simReach)}` : '-'}`);
  }
  baker.dispose();
  const pre = document.createElement('pre');
  pre.id = 'artcheck';
  pre.style.cssText = 'position:fixed;inset:0;background:#fff;color:#000;font:12px monospace;padding:8px;overflow:auto;z-index:10';
  pre.textContent = rows.join('\n');
  document.body.appendChild(pre);
  document.title = 'artcheck ready';
}
