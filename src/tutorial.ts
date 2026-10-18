// Tutorial (?mode=tutorial&lesson=N): short hands-on lessons on the Proving Grounds field. Each sets up a scene,
// hands you units, and its caption says what to try and what to watch for. Nothing is checked: Next moves on.
import { fenfolk } from './factions/fenfolk';
import { meadowfolk } from './factions/meadowfolk';
import type { FactionSpec } from './factions/types';
import { provingGrounds, type Scenario } from './sim/scenarios';
import type { World } from './sim/world';

export interface Lesson {
  title: string;
  /** Your faction, and the other side's. */
  you: FactionSpec;
  foe: FactionSpec;
  /** Caption HTML: what's going on, what to try, what to watch. */
  text: string;
  /** Where the camera starts. */
  look: [number, number];
  setup(w: World): void;
}

const FOE = 1;

/** Spawn `n` of a unit in a block around (x, y), `cols` wide, facing `heading` (octant; 0 is south-east on screen). */
function block(w: World, owner: number, id: string, n: number, x: number, y: number, cols = 4, heading = 0): number[] {
  const ids: number[] = [];
  const gap = (w.specOf(owner, id)?.stats.radius ?? 0.3) * 2 + 0.4;
  for (let i = 0; i < n; i++) {
    const u = w.spawnAt(owner, id, x + Math.floor(i / cols) * gap, y + ((i % cols) - (cols - 1) / 2) * gap, heading);
    if (u) ids.push(u.id);
  }
  return ids;
}

/** A building with this stock. */
function base(w: World, owner: number, id: string, x: number, y: number, stock: { food?: number; wood?: number; crystal?: number }) {
  const b = w.addBuilding(owner, id, x, y);
  if (b) b.stock = { food: stock.food ?? 0, wood: stock.wood ?? 0, crystal: stock.crystal ?? 0 };
  return b;
}

const hold = (w: World, ids: number[], player = FOE) => w.enqueue({ player, cmd: { type: 'stance', units: ids, stance: 'hold' } });
/** Your units wait for your orders (an order, or a charge with C, still sends them). */
const wait = (w: World, ids: number[]) => hold(w, ids, 0);

export const LESSONS: Lesson[] = [
  {
    title: 'Calories',
    you: meadowfolk, foe: fenfolk, look: [16, 26],
    text: `<p>Every unit carries a <b>calorie tank</b>: the orange bar under its health. Walking burns it, sprinting burns it about four times as fast, and every blow costs some. A big body holds more, and moves each kilo more cheaply.</p>
<p><b>Try:</b> select the lancers, press <kbd>C</kbd> and click a fenling. They sprint in to charge: watch their bars drain. Charge again and again until they run low.</p>
<p>An empty unit is <b>exhausted</b>: slow, and it can't fight. Select your units and press <kbd>R</kbd> (Resupply). They walk home to the Town Center and eat.</p>`,
    setup(w) {
      base(w, 0, 'town-center', 6, 24, { food: 3000, crystal: 200 });
      const yours = [...block(w, 0, 'lynx', 3, 14, 22, 3), ...block(w, 0, 'maceman', 6, 14, 30, 3)];
      for (const id of yours) { const u = w.units.get(id)!; u.cal = u.stats.maxCalories * 0.45; }
      wait(w, yours);
      hold(w, block(w, FOE, 'fenling', 8, 36, 26, 4, 4));
    },
  },
  {
    title: 'Crystals',
    you: fenfolk, foe: meadowfolk, look: [20, 26],
    text: `<p>Every weapon's tip is <b>crystal</b>. A striker keeps its crystal, but a thrower spends one with every throw. Each fenling carries 6 sling stones.</p>
<p><b>Try:</b> attack the macemen with your fenlings and count the throws. Spent stones lie on the ground as <b>shards</b>, and anyone can pick them up.</p>
<p>When a fenling runs dry it goes to restock. The <b>pack tortoise</b> is a walking crystal store. Move it up behind your fenlings: it sweeps up shards within sight and rearms fenlings near it, so they don't have to walk home. The Stilt Hall restocks them too (<kbd>R</kbd>).</p>`,
    setup(w) {
      base(w, 0, 'stilt-hall', 6, 24, { food: 1500, crystal: 300 });
      wait(w, block(w, 0, 'fenling', 8, 14, 26, 4));
      block(w, 0, 'pack-tortoise', 1, 11, 26, 1); // (a bearer goes about its own work)
      hold(w, block(w, FOE, 'maceman', 4, 36, 26, 2, 4));
    },
  },
  {
    title: 'Carts',
    you: meadowfolk, foe: fenfolk, look: [18, 26],
    text: `<p>Resources stay in the <b>building</b> that gathered them. There's no shared bank. The Town Center is full, but the Barracks and the Lynx Den across the field are empty.</p>
<p>Units are already queued at both. Watch the <b>mule carts</b>: they load where there's spare and drive it to where it's needed, most urgent first. Your waiting orders are first in line.</p>
<p><b>Try:</b> click a building to see its stock, and queue more units at the far ones. Train extra carts at the Town Center for faster supply. Where you build, and keeping the roads clear, matters.</p>`,
    setup(w) {
      const tc = base(w, 0, 'town-center', 6, 24, { food: 4000, wood: 1500, crystal: 800 });
      const bar = base(w, 0, 'barracks', 30, 18, {}), den = base(w, 0, 'lynx-den', 30, 32, {});
      for (let i = 0; i < 3; i++) w.spawnAt(0, 'mule', 12, 24 + i, 0);
      if (bar) for (let i = 0; i < 3; i++) w.enqueue({ player: 0, cmd: { type: 'train', building: bar.id, specId: 'maceman' } });
      if (den) w.enqueue({ player: 0, cmd: { type: 'train', building: den.id, specId: 'lynx' } });
      void tc;
    },
  },
  {
    title: 'Fen hauling',
    you: fenfolk, foe: meadowfolk, look: [16, 26],
    text: `<p>The Fenfolk have <b>no carts</b>. Each little <b>reed hut</b> is its own base: fenlings drop what they gather at the nearest one, and each hut trains from its own stock.</p>
<p><b>Try:</b> the Stilt Hall is stocked, but the two reed huts are empty. Click a hut and queue some reedguards: now it needs food and crystal. Then select all your fenlings and right-click that hut. They <b>haul</b> what it needs from the Stilt Hall, but each fenling carries only about 9 kg a trip.</p>
<p>That's why Fen strategy is about building huts where the work is: gather beside a hut, train beside it, and nothing has to travel far.</p>`,
    setup(w) {
      base(w, 0, 'stilt-hall', 6, 24, { food: 2500, wood: 800, crystal: 400 });
      base(w, 0, 'reed-hut', 16, 19, {});
      base(w, 0, 'reed-hut', 16, 33, {});
      block(w, 0, 'fenling', 8, 12, 26, 4);
    },
  },
  {
    title: 'Charges',
    you: meadowfolk, foe: fenfolk, look: [24, 26],
    text: `<p>A charge turns speed into damage. A running body adds the <b>collision</b> to its blow: ½·μ·v². A couched lance takes the whole impact, so a charging lancer hits many times harder than a standing one.</p>
<p><b>Try:</b> select the lancers, press <kbd>C</kbd> and click the fenlings (top). The lancers sprint in, strike, and ride on through. Then pull them out and charge again.</p>
<p>Now try the <b>reedguards</b> (bottom). Their spears are planted, so your charge runs onto their points and the impact comes back into your lynx. Up close, your lancers cut with their swords instead.</p>`,
    setup(w) {
      wait(w, block(w, 0, 'lynx', 4, 14, 26, 2));
      hold(w, block(w, FOE, 'fenling', 8, 34, 19, 4, 4));
      hold(w, block(w, FOE, 'reedguard', 8, 34, 33, 4, 4));
    },
  },
  {
    title: 'Groupings',
    you: meadowfolk, foe: meadowfolk, look: [26, 26],
    text: `<p>Who wins depends on <b>how bodies meet</b>, not on a bonus table. Enemy lancers are about to charge you.</p>
<p>As it stands, your pikemen are a tight block in front, with the slingers behind. Pikemen plant their pikes by themselves when they see a charge coming, so lancers run onto set points and take the whole collision. <b>Watch</b> it play out.</p>
<p><b>Then try:</b> press Restart, and before the lancers arrive, scatter the pikemen across the field, or move the slingers out in front. Same units, different grouping, and the same lancers win. The <b>Arena</b> scores every matchup if you want the numbers.</p>`,
    setup(w) {
      block(w, 0, 'pikeman', 8, 20, 26, 4);
      block(w, 0, 'slinger', 6, 15, 26, 3);
      block(w, 0, 'maceman', 4, 17, 34, 2);
      const lancers = block(w, FOE, 'lynx', 4, 44, 26, 2, 4);
      w.enqueue({ player: FOE, cmd: { type: 'attackMove', units: lancers, x: 12, y: 26, charge: true } });
    },
  },
  {
    title: 'Birds',
    you: fenfolk, foe: meadowfolk, look: [24, 26],
    text: `<p><b>Siege herons</b> fly. In the air they wheel round in wide turns, as a bird does, instead of stopping on a spot. Crystals dropped from height fall harder, so they hit harder.</p>
<p><b>Try:</b> select the herons and attack the macemen. They take off, climb, and bomb from overhead, out of reach of maces. Now attack the slingers: thrown stones can hit a flier, and a heron flying low can even be struck from the ground.</p>
<p>Flying burns calories about three times as fast as walking. Land the herons and rest them (or <kbd>R</kbd> to resupply) before they run dry.</p>`,
    setup(w) {
      base(w, 0, 'stilt-hall', 6, 24, { food: 3000, crystal: 400 });
      wait(w, block(w, 0, 'great-siege-heron', 2, 14, 26, 2));
      hold(w, block(w, FOE, 'maceman', 6, 34, 20, 3, 4));
      hold(w, block(w, FOE, 'slinger', 6, 34, 32, 3, 4));
    },
  },
];

/** The lesson's scenario: the Proving Grounds field, no wildlife, nobody wins. */
export function tutorialScenario(lesson: Lesson): Scenario {
  const pg = provingGrounds();
  return { id: 'tutorial', victory: false, wildlife: false, map: (seed) => pg.map(seed), setup: (w) => lesson.setup(w) };
}
