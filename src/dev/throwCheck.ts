// Dev page: ?mode=throwcheck&faction=wildwelds&building=web-tower (&facings=1,3,6). A tower's throw baked whole, frame by
// frame (as it was), beside it baked apart (a still look with only the moving part drawn over it: ThrowArt.under): strips
// of each, their difference (amplified), and what each costs in sprite pixels. Title "throwcheck ready" when drawn.
import { Baker } from '../kits/bake3d/baker';
import { TEAM_COLORS } from '../render/artbank';
import type { Sprite } from '../art/contract';
import type { BuildingModel, ThrowTiming } from '../kits/bake3d/types';

type Spec = { id: string; name: string; size: number; model: BuildingModel; throws?: ThrowTiming };
const FACTIONS = import.meta.glob<{ buildings?: Spec[] }>('../factions/*/index.ts');

const area = (ss: Sprite[]) => ss.reduce((n, s) => n + s.sw * s.sh, 0);

export async function runThrowCheck(params: URLSearchParams): Promise<void> {
  const fid = params.get('faction') ?? 'wildwelds', bid = params.get('building') ?? 'web-tower';
  const facings = (params.get('facings') ?? '1,3,6').split(',').map(Number), every = Number(params.get('every') ?? 2);
  const mod = await FACTIONS[`../factions/${fid}/index.ts`]();
  const spec = mod.buildings!.find((b) => b.id === bid)!, timing = spec.throws!, n = timing.frames, team = TEAM_COLORS[0];
  const baker = new Baker();
  // as it was: every frame whole, framed for itself
  const reach = spec.size * Math.SQRT2 + 1.1, old: Sprite[][] = [];
  for (let o = 0; o < 8; o++) old.push(Array.from({ length: n }, (_, i) => baker.bakeStatic((b) => spec.model(b, { phase: 'complete', level: 0, attack: { t: i / n, facing: o * (Math.PI / 4) } }), team, true, {}, reach)));
  const now = await baker.bakeBuildingThrow(spec.model, spec.size, team, timing);
  baker.dispose();
  const before = area(old.flat()), unders = [...new Set(now.under!.flat())], after = area(now.frames.flat()) + area(unders);
  const pages = [...new Set([...now.frames.flat(), ...unders].map((s) => s.img))].reduce((k, c) => k + (c as HTMLCanvasElement).width * (c as HTMLCanvasElement).height, 0);

  // each frame laid on grass, old and new, and compared over every frame of every facing
  const q = baker.q, CW = Math.round(150 * q / 1.75), CH = Math.round(190 * q / 1.75), AX = CW / 2, AY = CH - Math.round(40 * q / 1.75);
  const cell = (draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas'); c.width = CW; c.height = CH;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = '#5f7f3a'; g.fillRect(0, 0, CW, CH); draw(g); return g.getImageData(0, 0, CW, CH);
  };
  const put = (g: CanvasRenderingContext2D, s: Sprite) => g.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, AX - s.ax, AY - s.ay, s.sw, s.sh);
  const oldCell = (o: number, i: number) => cell((g) => put(g, old[o][i]));
  const newCell = (o: number, i: number) => cell((g) => { put(g, now.under![o][i]); put(g, now.frames[o][i]); });
  let worst = 0, off8 = 0, px = 0;
  const diff = (a: ImageData, b: ImageData) => {
    const d = new ImageData(CW, CH);
    for (let k = 0; k < a.data.length; k += 4) {
      const e = Math.max(Math.abs(a.data[k] - b.data[k]), Math.abs(a.data[k + 1] - b.data[k + 1]), Math.abs(a.data[k + 2] - b.data[k + 2]));
      worst = Math.max(worst, e); if (e > 8) off8++; px++;
      const v = Math.min(255, e * 8); d.data[k] = v; d.data[k + 1] = v; d.data[k + 2] = v; d.data[k + 3] = 255;
    }
    return d;
  };
  for (let o = 0; o < 8; o++) for (let i = 0; i < n; i++) diff(oldCell(o, i), newCell(o, i));
  const stats = { worst, off8: off8 / px };
  worst = 0; off8 = 0; px = 0;

  const shown = Array.from({ length: Math.ceil(n / every) }, (_, k) => k * every), LBL = 110, HEAD = 92, ROWH = CH + 4;
  const c = document.createElement('canvas');
  c.width = LBL + shown.length * (CW + 2); c.height = HEAD + facings.length * (ROWH * 3 + 18);
  const g = c.getContext('2d')!;
  g.fillStyle = '#1b1d22'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff'; g.font = 'bold 22px sans-serif';
  g.fillText(`${spec.name} (${spec.id}) throw: ${n} frames × 8 facings, team 1, bake quality ${q}`, 12, 28);
  g.font = '17px sans-serif';
  g.fillText(`Before (whole frames): ${(before / 1e6).toFixed(2)} M sprite px.   After (${unders.length} still looks + ${n * 8} cropped moving parts): ${(after / 1e6).toFixed(2)} M px (${(before / after).toFixed(1)}× fewer); on ${(pages / 1e6).toFixed(2)} M px of pages.`, 12, 54);
  g.fillText(`Old vs new on grass, all ${n * 8} frames: largest channel difference ${stats.worst}/255; ${(stats.off8 * 100).toFixed(2)}% of pixels differ by more than 8. Diff rows: |old − new| × 8.`, 12, 78);
  facings.forEach((o, r) => {
    const y0 = HEAD + r * (ROWH * 3 + 18);
    g.fillStyle = '#9ab'; g.font = 'bold 15px sans-serif'; g.fillText(`facing ${o}`, 8, y0 + 12);
    ['old', 'new', 'diff ×8'].forEach((name, k) => { g.fillStyle = '#ddd'; g.font = '15px sans-serif'; g.fillText(name, 8, y0 + 18 + k * ROWH + CH / 2); });
    shown.forEach((i, col) => {
      const x = LBL + col * (CW + 2), a = oldCell(o, i), b = newCell(o, i);
      g.putImageData(a, x, y0 + 18); g.putImageData(b, x, y0 + 18 + ROWH); g.putImageData(diff(a, b), x, y0 + 18 + ROWH * 2);
      if (r === 0) { g.fillStyle = '#ccc'; g.font = '12px sans-serif'; g.fillText(`f${i}`, x + 3, y0 + 30); }
    });
  });
  document.body.innerHTML = '';
  document.body.style.background = '#1b1d22';
  document.body.appendChild(c);
  Object.assign(window, { throwStats: { before, after, pages, unders: unders.length, ...stats } });
  document.title = 'throwcheck ready';
}
