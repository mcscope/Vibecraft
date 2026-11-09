import { describe, expect, test } from 'vitest';
import { LEVEL_M } from '../src/sim/map';
import type { World } from '../src/sim/world';
import { HILL, LESSONS, tutorialWorld } from '../src/tutorial';
import { run } from './kit';

const lesson = (title: string) => LESSONS.find((l) => l.title === title)!;
const mine = (w: World, specId: string) => w.unitsOf(0).filter((u) => u.specId === specId);

describe('tutorial', () => {
  test.each(LESSONS.map((l, i) => [i, l.title]))('lesson %i (%s) builds its scene and plays 10 s', (i) => {
    const w = tutorialWorld(LESSONS[i as number], 1);
    expect(w.unitsOf(0).length + w.buildingsOf(0).length).toBeGreaterThan(0);
    run(w, 10 * 20);
    expect(w.unitsOf(0).length).toBeGreaterThan(0);
  });

  test('High ground: the ramp leads up the hill; a hurlhorn\'s stone thrown down drops a maceman, one from the low ground doesn\'t', () => {
    const w = tutorialWorld(lesson('High ground'), 1);
    const [low, high] = mine(w, 'hurlhorn');
    // each one's first stone: its damage, and whether the maceman it hit fell
    const watch = (u: { x: number; y: number }) => {
      let shot: { id: number; target?: number; damage: number } | undefined;
      return () => {
        shot ??= [...w.projectiles.values()].find((p) => p.owner === 0 && Math.hypot(p.sx - u.x, p.sy - u.y) < 0.5);
        return shot && !w.projectiles.has(shot.id) ? { damage: shot.damage, felled: !w.units.has(shot.target!) } : null;
      };
    };
    const lowWatch = watch(low), highWatch = watch(high);
    // one round the hill to the macemen, the other up the ramp to the hill's edge above them
    w.enqueue({ player: 0, cmd: { type: 'move', units: [low.id], x: 21.5, y: 15.5 } });
    w.enqueue({ player: 0, cmd: { type: 'move', units: [high.id], x: 27.5, y: HILL.y0 + 1.5 } });
    type Hit = { damage: number; felled: boolean } | null;
    let lowHit = null as Hit, highHit = null as Hit;
    run(w, 90 * 20, () => { lowHit ??= lowWatch(); highHit ??= highWatch(); return !!(lowHit && highHit); });
    expect(w.grid.heightAt(high.x, high.y)).toBeCloseTo(LEVEL_M);
    expect(w.grid.heightAt(low.x, low.y)).toBeCloseTo(0);
    // (the caption's numbers: about 90 from below, about 125 thrown down, after the maceman's armour)
    expect(highHit!.damage).toBeGreaterThan(lowHit!.damage + 30); // (thrown down: the fall's energy on top)
    expect(lowHit!.felled).toBe(false);
    expect(highHit!.felled).toBe(true);
  });

  test('Wildwelds: lay an egg, tend it till it hatches, digest a tree, change a larva, lay a web, set the rally points', () => {
    const w = tutorialWorld(lesson('Wildwelds'), 1);
    const [mother] = mine(w, 'mother1'), larvae = mine(w, 'larva1'), [t2] = mine(w, 'larva2');
    // the egg: laid from her pack, then fed by the tenders till it hatches
    w.enqueue({ player: 0, cmd: { type: 'metamorph', units: [mother.id], into: 'egg1', spawn: true } });
    w.enqueue({ player: 0, cmd: { type: 'tend', units: larvae.map((u) => u.id) } });
    run(w, 60 * 20, () => mine(w, 'larva1').length > larvae.length);
    expect(mine(w, 'larva1').length).toBe(larvae.length + 1);
    // a tree, digested into food
    const tree = [...w.nodes.values()].filter((n) => n.tree).sort((a, b) => Math.hypot(a.x - 22, a.y - 22) - Math.hypot(b.x - 22, b.y - 22))[0];
    w.enqueue({ player: 0, cmd: { type: 'digest', units: [larvae[0].id], node: tree.id, one: true } });
    run(w, 30 * 20, () => !w.nodes.has(tree.id));
    expect([...w.nodes.values()].some((n) => n.digested)).toBe(true);
    // a larva changes (in a cocoon, fed by the tenders) into a T2 larva
    const t2s = mine(w, 'larva2').length;
    w.enqueue({ player: 0, cmd: { type: 'metamorph', units: [larvae[1].id], into: 'larva2' } });
    run(w, 120 * 20, () => mine(w, 'larva2').length > t2s);
    expect(mine(w, 'larva2').length).toBe(t2s + 1);
    // the T2 larva lays a strand of web
    for (let i = 0; i < 3; i++) w.enqueue({ player: 0, cmd: { type: 'build', units: [t2.id], specId: 'web-wall', ox: 20 + i, oy: 18, ...(i ? { queue: true } : {}) } });
    run(w, 40 * 20, () => !w.units.has(t2.id));
    expect(w.buildingsOf(0).filter((b) => b.specId === 'web-wall').length).toBe(3);
    // the rally points
    w.enqueue({ player: 0, cmd: { type: 'sideRally', kind: 'work', x: 12, y: 34 } });
    w.enqueue({ player: 0, cmd: { type: 'sideRally', kind: 'army', x: 24, y: 26 } });
    run(w, 1);
    expect(w.players[0].rally).toMatchObject({ work: [12, 34], army: [24, 26] });
  });
});
