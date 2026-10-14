import { describe, expect, test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { World } from '../src/sim/world';
import { SkirmishAI } from '../src/ai/skirmishAI';

const run = (w: World, ticks: number) => { for (let i = 0; i < ticks; i++) w.step(); };
const newWorld = () => new World({ seed: 7, players: [{ name: 'A', faction: meadowfolk }, { name: 'B', faction: meadowfolk }] });
const tidy = (w: World) => { for (const u of [...w.units.values()]) if (w.players[u.owner].neutral) w.units.delete(u.id); };

describe('answering a tower rush', () => {
  test('a tower can\'t hit what\'s right at its base', () => {
    const w = newWorld(); tidy(w);
    const t = w.addBuilding(0, 'watchtower', 30, 30)!;
    t.stock.crystal = 30;
    const e = w.unitsOf(1)[0];
    e.x = e.px = 31.6; e.y = e.py = 30.5; e.order = { kind: 'idle' };
    const hp = e.hp;
    run(w, 20 * 5);
    expect(e.hp).toBe(hp);
    expect(t.stats.tower!.minRange).toBeCloseTo(3);
  });

  test('an unarmed villager sent to attack grabs a crystal first, then hits', () => {
    const w = newWorld(); tidy(w);
    const tc = w.baseOf(0)!;
    tc.stock.crystal = 50;
    const v = w.unitsOf(0).find((u) => u.specId === 'villager')!;
    expect(w.armed(v)).toBe(false);
    const t = w.addBuilding(1, 'watchtower', tc.ox + 6, tc.oy + 1)!;
    const hp = t.hp;
    w.enqueue({ player: 0, cmd: { type: 'attack', units: [v.id], target: t.id } });
    run(w, 20 * 20);
    expect(v.crystal).toBeGreaterThanOrEqual(1 - 1e-6);
    expect(t.hp).toBeLessThan(hp);
  });

  test('the town bell arms every worker as militia, and sends them back to work after', () => {
    const w = newWorld(); tidy(w);
    const tc = w.baseOf(0)!;
    tc.stock.crystal = 50;
    const vs = w.unitsOf(0).filter((u) => u.specId === 'villager');
    const tree = [...w.nodes.values()].find((n) => n.tree)!;
    w.enqueue({ player: 0, cmd: { type: 'gather', units: vs.map((u) => u.id), node: tree.id } });
    run(w, 5);
    w.enqueue({ player: 0, cmd: { type: 'townBell', on: true } });
    run(w, 20 * 12);
    expect(vs.every((u) => u.militia && w.armed(u))).toBe(true);
    w.enqueue({ player: 0, cmd: { type: 'townBell', on: false } });
    run(w, 2);
    expect(vs.every((u) => !u.militia && u.order.kind === 'gather')).toBe(true);
  });

  test('the AI, tower-rushed before it has an army, rings the bell and pulls the tower down', () => {
    const w = newWorld(); tidy(w);
    const ai = new SkirmishAI(1);
    const tc = w.baseOf(1)!;
    tc.stock.crystal = 60;
    let t = null;
    for (let d = 7; d < 14 && !t; d++) for (const [dx, dy] of [[-d, 0], [0, -d], [-d, -d]]) { t = w.addBuilding(0, 'watchtower', tc.ox + dx, tc.oy + dy); if (t) break; }
    t!.stock.crystal = 40;
    let rang = false;
    for (let i = 0; i < 20 * 120 && w.buildings.has(t!.id); i++) {
      w.step(ai.think(w).map((cmd) => ({ player: 1, cmd })));
      if (w.players[1].bell) rang = true;
    }
    expect(rang).toBe(true);
    expect(w.buildings.has(t!.id)).toBe(false);
  });
});
