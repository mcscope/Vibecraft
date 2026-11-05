// Dev page: ?mode=footcheck. Every unit's animations held to "a planted foot stays put till it's picked up": in a
// walk or a run, each foot on the ground slides back exactly as fast as the body goes over it (the stride the game
// plays the walk at, measured as the baker measures it) and never sideways; standing still (idle, a blow, gathering…)
// a planted foot doesn't move at all; and changing from standing to another standing animation, the feet are where
// they were. Worst slips, in cm, per unit and animation; ◀ over 2 cm.
import { meadowfolk } from '../factions/meadowfolk';
import { fenfolk } from '../factions/fenfolk';
import { wildwelds } from '../factions/wildwelds';
import { TEAM_COLORS } from '../render/artbank';
import { animsFor, Baker, type BakedAnim, type UnitBakeOptions } from '../kits/bake3d/baker';
import type { UnitModel } from '../kits/bake3d/types';

const N = 24; // samples a loop
const MOVING = new Set<BakedAnim>(['walk', 'charge', 'carryFood', 'carryWood', 'carryCrystal']);
const SKIP = new Set<BakedAnim>(['die', 'fly', 'leap', 'climb', 'soar', 'glide', 'land', 'bankL', 'bankR', 'swoop', 'slam']); // (in the air, or falling)
const flag = (cm: number) => (cm > 2 ? ' ◀' : '');

type Pt = { x: number; z: number; lo: number };

export async function runFootCheck(params = new URLSearchParams(location.search)): Promise<void> {
  // (&unit=<id>: only that unit; &dump=<anim>: and what touches the ground in each frame of that animation)
  const only = params.get('unit'), dump = params.get('dump') as BakedAnim | null;
  const out = document.createElement('pre');
  out.id = 'footcheck';
  out.style.cssText = 'position:fixed;inset:0;margin:0;padding:10px;background:#111;color:#ddd;font:12px monospace;overflow:auto;z-index:10';
  out.textContent = 'checking feet…';
  document.body.appendChild(out);
  const factions = [
    { f: meadowfolk, opts: (await import('../factions/meadowfolk/art')).bakeOpts },
    { f: fenfolk, opts: (await import('../factions/fenfolk/art')).bakeOpts },
    { f: wildwelds, opts: (await import('../factions/wildwelds/art')).bakeOpts },
  ] as Array<{ f: { id: string; units: Array<{ id: string; model?: UnitModel }> }; opts: (u: never) => UnitBakeOptions }>;
  const baker = new Baker(), team = TEAM_COLORS[0];
  const rows: string[] = ['unit                         anim          stride m/loop | worst planted-foot slip, cm (where)'];
  for (const { f, opts } of factions) for (const u of f.units) {
    if (!u.model || (only && u.id !== only)) continue;
    const o = opts(u as never);
    if (o.segments?.length) { rows.push(`${(f.id + ':' + u.id).padEnd(28)} (a crawler in parts: skipped)`); continue; }
    const frames = (anim: BakedAnim): Pt[][] => Array.from({ length: N }, (_, i) => baker.contacts(u.model!, team, anim, i / N, o));
    const feet = (pts: Pt[]) => pts.filter((p) => p.lo < 0.012); // (what stands on the ground: not a body part resting near it)
    const idle0 = feet(baker.contacts(u.model, team, 'idle', 0, o));
    if (dump) for (let i = 0; i < N; i++) rows.push(`${dump} frame ${i}: ` + baker.contacts(u.model, team, dump, i / N, o).filter((p) => p.lo < 0.03).map((p) => `(${p.x.toFixed(2)},${p.z.toFixed(2)} lo ${p.lo.toFixed(3)})`).join(' '));
    for (const anim of animsFor(o)) {
      if (SKIP.has(anim)) continue;
      const fr = frames(anim);
      let worst = 0, where = '', stride = 0, steps = 0;
      for (let i = 0; i < N; i++) {
        const a = fr[i], b = fr[(i + 1) % N];
        if (a.length !== b.length || (!MOVING.has(anim) && i === N - 1)) continue; // (a standing animation needn't loop)
        const both = a.map((p, k) => ({ p, q: b[k] })).filter(({ p, q }) => p.lo < 0.012 && q.lo < 0.012);
        // moving: every planted foot should slide back by the same step (the median, as the baker measures the stride)
        const dxs = both.map(({ p, q }) => p.x - q.x).filter((dx) => dx > 1e-4).sort((x, y) => x - y);
        const step = MOVING.has(anim) && dxs.length ? dxs[Math.floor(dxs.length / 2)] : 0;
        if (step) { stride += step; steps++; }
        for (const { p, q } of both) {
          const slip = Math.hypot(p.x - q.x - step, p.z - q.z) * 100;
          if (slip > worst) { worst = slip; where = `frame ${i}→${(i + 1) % N}, foot at (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`; }
        }
      }
      rows.push(`${(f.id + ':' + u.id).padEnd(28)} ${anim.padEnd(13)} ${MOVING.has(anim) ? ((stride * N) / Math.max(1, steps)).toFixed(2).padStart(5) : '    -'}        | ${worst.toFixed(1).padStart(5)}${flag(worst)}  ${worst > 2 ? where : ''}`);
      // changing to it from standing (and back, from a blow's last frame): its feet where idle's were
      if (!MOVING.has(anim) && anim !== 'idle') {
        const gap = (A: Pt[], B: Pt[]) => (A.length && B.length ? Math.max(...A.map((p) => Math.min(...B.map((q) => Math.hypot(p.x - q.x, p.z - q.z))))) * 100 : 0);
        const first = feet(fr[0]), last = feet(fr[N - 1]);
        const into = Math.max(gap(idle0, first), gap(first, idle0)), back = anim === 'attack' ? Math.max(gap(idle0, last), gap(last, idle0)) : 0;
        const t = Math.max(into, back);
        if (t > 2) rows.push(`${''.padEnd(28)} ${''.padEnd(13)}               |   (from idle: its feet jump ${into.toFixed(1)} cm${back > 2 ? `; back to idle ${back.toFixed(1)} cm` : ''}) ◀`);
      }
    }
    out.textContent = rows.join('\n') + '\n…';
    await new Promise((r) => setTimeout(r, 0));
  }
  baker.dispose();
  out.textContent = rows.join('\n');
  document.title = 'footcheck ready';
}
