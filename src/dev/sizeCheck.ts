// Dev page: ?mode=sizecheck. The Wildwelds as drawn beside the Wildwelds drawn to the volume their mass gives them (the
// size most units are drawn at for their mass, measured with ?mode=artcheck): each at rest and through its walk, a
// maceman alongside for scale. A look at a change, not the change.
import { units as wildwelds } from '../factions/newfaction';
import { units as meadowfolk } from '../factions/meadowfolk';
import { TEAM_COLORS } from '../render/artbank';
import { Baker } from '../kits/bake3d/baker';
import type { ModelBuilder, Pose } from '../kits/bake3d/types';
import type { Sprite } from '../art/contract';

/** How much bigger (×, each way) to draw it for the typical volume for its mass: ∛(typical ÷ its volume per kg). */
const RESCALE: Record<string, number> = {
  mother1: 1.01, mother2: 0.79, mother3: 0.83, egg1: 1.14, egg2: 1.14, egg3: 1.14, larva1: 0.99, larva2: 0.99, larva3: 0.99, cocoon: 1.14,
  charger: 2.07, micropike: 1.91, flier: 1.66, whipweld: 1.93, slinger: 1.89, 'dragon-fly': 1.33, 'ground-attacker3': 0.8,
};

export function runSizeCheck(): void {
  const baker = new Baker(), team = TEAM_COLORS[0], WALK = [0, 0.25, 0.5, 0.75];
  const shot = (model: (b: ModelBuilder, p: Pose) => void, k: number, anim: Pose['anim'], phase: number): Sprite =>
    baker.bakeStatic((b) => b.joint([0, 0, 0], [0, 0, 0], (s) => model(s, { anim, phase, team, armed: true, cargo: null }), k), team);
  const mace = meadowfolk.find((u) => u.id === 'maceman')!;
  const ref = shot(mace.model, 1, 'idle', 0);
  type Row = { name: string; before: Sprite[]; after: Sprite[] };
  const rows: Row[] = [];
  for (const u of wildwelds) {
    const k = RESCALE[u.id];
    if (!k) continue;
    const walks = !u.id.startsWith('egg') && u.id !== 'cocoon';
    const set = (s: number) => [ref, shot(u.model, s, 'idle', 0), ...(walks ? WALK.map((ph) => shot(u.model, s, 'walk', ph)) : [])];
    rows.push({ name: `${u.name}: now  |  ×${k.toFixed(2)}, the volume its mass gives it`, before: set(1), after: set(k) });
  }
  baker.dispose();
  // laid out true to scale (one pixel scale for all, feet on each row's line): now on the left, rescaled on the right
  const S = 1.25, pad = 10, label = 20, gap = 40;
  const w = (cs: Sprite[]) => cs.reduce((n, c) => n + (c.sw / c.q) * S + pad, pad);
  const half = Math.max(...rows.map((r) => w(r.before)));
  const rowH = rows.map((r) => { const all = [...r.before, ...r.after]; return Math.max(...all.map((c) => c.ay / c.q)) * S + Math.max(...all.map((c) => (c.sh - c.ay) / c.q)) * S + label + pad; });
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(half + gap + Math.max(...rows.map((r) => w(r.after)))); cv.height = Math.ceil(rowH.reduce((a, b) => a + b, 0));
  const g = cv.getContext('2d')!;
  g.fillStyle = '#6f7f50'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(half + gap / 2 - 1, 0, 2, cv.height);
  let y = 0;
  rows.forEach((r, i) => {
    if (i % 2 === 0) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, y, cv.width, rowH[i]); }
    g.fillStyle = '#fff'; g.font = '600 14px sans-serif'; g.fillText(r.name, pad, y + 15);
    const top = Math.max(...[...r.before, ...r.after].map((c) => c.ay / c.q)) * S;
    for (const [cells, x0] of [[r.before, pad], [r.after, half + gap]] as const) {
      let x = x0;
      for (const c of cells) { const k = S / c.q; g.drawImage(c.img, c.sx, c.sy, c.sw, c.sh, x, y + label + top - c.ay * k, c.sw * k, c.sh * k); x += c.sw * k + pad; }
    }
    y += rowH[i];
  });
  cv.style.cssText = 'position:fixed;left:0;top:0;z-index:10';
  document.body.appendChild(cv);
  document.title = 'sizecheck ready';
}
