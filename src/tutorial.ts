// Tutorial (?mode=tutorial&lesson=N): short hands-on lessons, most on the Proving Grounds field. Each sets up a scene,
// hands you units, and its caption says what to try and what to watch for. Nothing is checked: Next moves on.
// (tests/tutorial.test.ts plays each lesson's scene, and the steps its caption asks for.)
import { fenfolk } from './factions/fenfolk';
import { meadowfolk } from './factions/meadowfolk';
import { wildwelds } from './factions/wildwelds';
import type { FactionSpec } from './factions/types';
import { loadUp } from './sim/abilities/bearer';
import { MapBuilder, type GeneratedMap } from './sim/map';
import { provingGrounds, type Scenario } from './sim/scenarios';
import { TICK_RATE, TREE_WOOD, World } from './sim/world';
import { keyName, keymap, type KeyMap } from './ui/settings';

export interface Lesson {
  title: string;
  /** Your faction, and the other side's. */
  you: FactionSpec;
  foe: FactionSpec;
  /** Caption HTML: what's going on, what to try, what to watch. */
  text: string;
  /** Where the camera starts. */
  look: [number, number];
  /** The field (default: the Proving Grounds). */
  map?(seed: number): GeneratedMap;
  /** Fog of war: you see only what your units see (default: you see everything). */
  fog?: boolean;
  setup(w: World): void;
  /** The lesson's main things to do, as a checklist: each ticks itself off when the world shows it done (it stays ticked). */
  steps?: Array<{ text: string; done(w: World): boolean }>;
  /** Each tick, after setup (timed events: an attack that comes later). */
  tick?(w: World): void;
}

const FOE = 1;

/** A key as the player's control scheme has it (settings.ts keymap). */
const key = (cmd: Exclude<keyof KeyMap, 'label' | 'description' | 'pan' | 'train'>) => `<kbd>${keyName(keymap()[cmd])}</kbd>`;

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

/** The High ground field: open grass with a hill in the middle, a level up, ringed by cliff, a ramp up each side. */
export const HILL = { x0: 23, x1: 32, y0: 20, y1: 35, rampY0: 25, rampY1: 30 } as const;
function hillField(seed: number): GeneratedMap {
  const m = new MapBuilder(seed, 56, [-50, -50]); // (no bases to keep clear)
  for (let y = HILL.y0; y <= HILL.y1; y++) for (let x = HILL.x0; x <= HILL.x1; x++) m.raise(x, y, 1);
  // the west ramp, three tiles long (the builder mirrors it through the middle: the east ramp)
  for (let y = HILL.rampY0; y <= HILL.rampY1; y++) for (let x = HILL.x0 - 3; x < HILL.x0; x++) m.ramp(x, y);
  m.forest(10, 10, 3.5);
  m.forest(44, 20, 2.5);
  m.borderWoods(2, 3);
  return m.done();
}

// what a checklist step looks for
type Step = NonNullable<Lesson['steps']>[number];
const yours = (w: World, ...ids: string[]) => w.unitsOf(0).filter((u) => !ids.length || ids.includes(u.specId));
const theirs = (w: World, id: string) => w.unitsOf(FOE).filter((u) => u.specId === id).length;
const doing = (w: World, ...kinds: string[]) => yours(w).some((u) => kinds.includes(u.order.kind));
const charging = (w: World) => yours(w).some((u) => (u.order.kind === 'attack' || u.order.kind === 'attackMove') && !!u.order.charge);
const thrown = (w: World, id: string) => yours(w, id).some((u) => u.ammo < u.stats.loadoutCrystal - 0.01);
const built = (w: World, id: string) => [...w.buildings.values()].filter((b) => b.owner === 0 && b.spec.id === id);
/** The three steps every Calories lesson has (`eat`: its last one, each army's own way to eat). */
const calorieSteps = (who: string, eat: Step): Step[] => [
  { text: `Charge with the ${who}`, done: charging },
  { text: 'Run one low on calories', done: (w) => yours(w).some((u) => u.exhausted || u.cal < u.stats.maxCalories * 0.2) },
  eat,
];
const eatAtHome: Step = { text: 'Send them to eat (Resupply)', done: (w) => doing(w, 'resupply') };
/** A Charges lesson's: the soft target up top, then the spears below (`n` of each to start with, `mine` of yours). */
const chargeSteps = (soft: string, spears: string, who: string, mine: number): Step[] => [
  { text: 'Charge the soft targets (top)', done: (w) => charging(w) && theirs(w, soft) < 8 },
  { text: 'Charge the spears (bottom), and see what it costs', done: (w) => theirs(w, spears) < 8 || yours(w, who).length < mine || yours(w, who).some((u) => u.hp < u.stats.maxHp * 0.6) },
];
/** A Groupings lesson's. */
const groupingSteps: Step[] = [
  { text: 'The lancers charge (after 30 s)', done: (w) => w.tick >= 30 * TICK_RATE },
  { text: 'See who is left standing', done: (w) => w.tick > 30 * TICK_RATE && (!w.unitsOf(FOE).length || !w.unitsOf(0).length) },
];

/** The opening every army's Calories lesson shares. */
const CALORIES = '<p>Every unit has a <b>calorie tank</b>: the orange bar under its health. Walking burns it. Sprinting burns it about four times as fast, and every blow costs some. A big body holds more, and moves each kilo more cheaply.</p>';
/** And every Charges lesson's. */
const CHARGE = 'A charge turns speed into damage. A running body adds the energy of the <b>collision</b> to its blow, and that grows with the square of its speed.';

/** A Groupings lesson: the other side charges after 30 s (time to read, and to rearrange your units). */
function chargeAfter30(w: World): void {
  if (w.tick !== 30 * TICK_RATE) return;
  const ids = w.unitsOf(FOE).map((u) => u.id);
  w.enqueue({ player: FOE, cmd: { type: 'stance', units: ids, stance: 'auto' } });
  w.enqueue({ player: FOE, cmd: { type: 'attackMove', units: ids, x: 12, y: 26, charge: true } });
}

/** Every lesson, an army's after another's: each army's own track is the lessons that play it (`you`), in this order. */
export const LESSONS: Lesson[] = [
  {
    title: 'Calories',
    you: meadowfolk, foe: fenfolk, look: [16, 26],
    text: `${CALORIES}
<p><b>Try:</b> select the lancers, press ${key('charge')} (Charge) and right-click a fenling. They sprint in to charge: watch their bars drain. Charge again and again until they run low.</p>
<p>An empty unit is <b>exhausted</b>: it's slow, and it can't fight. Select your units and press ${key('resupply')} (Resupply). They walk home to the Town Center to eat.</p>`,
    steps: calorieSteps('lancers', eatAtHome),
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
    you: meadowfolk, foe: fenfolk, look: [20, 26],
    text: `<p>Every weapon's tip is <b>crystal</b>. A maceman keeps his mace head, but a thrower spends a crystal with every throw. Each slinger carries 12 stones.</p>
<p><b>Try:</b> select your slingers and right-click a bog toad. Count the throws. Spent stones lie on the ground as <b>shards</b>, and anyone can pick them up. </p>
<p>A slinger that runs low walks back to the Town Center by itself and restocks from its crystal. Press ${key('resupply')} (Resupply) to send them all back early, before a fight. The <b>Hurlhorn</b> throws 9 kg crystals, a dozen to a load, so a full load costs 108 crystal. Save its throws for big targets.</p>`,
    steps: [{ text: 'Throw at a bog toad', done: (w) => thrown(w, 'slinger') }, { text: 'A slinger goes home to restock', done: (w) => yours(w, 'slinger').some((u) => u.order.kind === 'resupply' || u.order.kind === 'rearm') }],
    setup(w) {
      base(w, 0, 'town-center', 6, 24, { food: 1500, crystal: 600 });
      wait(w, [...block(w, 0, 'slinger', 6, 14, 24, 3), ...block(w, 0, 'hurlhorn', 1, 13, 30, 1)]);
      hold(w, block(w, FOE, 'bog-toad', 4, 36, 26, 2, 4));
    },
  },
  {
    title: 'Carts',
    you: meadowfolk, foe: fenfolk, look: [18, 26],
    text: `<p>Resources stay in the <b>building</b> that gathered them. There's no shared bank. Here the Town Center is full, but the Barracks and the Lynx Den across the field are empty.</p>
<p>Both already have units queued. Watch the <b>mule carts</b>: they load where there's spare and drive it where it's needed, most urgent first. Your queued units come first.</p>
<p><b>Try:</b> click a building to see its stock. Queue more units at the far ones. Train extra carts at the Town Center for faster supply. Where you build matters, and so do clear roads.</p>`,
    steps: [{ text: 'A cart brings a far building what it needs', done: (w) => yours(w, 'maceman', 'lynx').length > 0 }, { text: 'Train another cart at the Town Center', done: (w) => yours(w, 'mule').length > 3 || built(w, 'town-center').some((b) => b.queue.some((q) => q.kind === 'unit' && q.specId === 'mule')) }],
    setup(w) {
      base(w, 0, 'town-center', 6, 24, { food: 4000, wood: 1500, crystal: 800 });
      const bar = base(w, 0, 'barracks', 30, 18, {}), den = base(w, 0, 'lynx-den', 30, 32, {});
      for (let i = 0; i < 3; i++) w.spawnAt(0, 'mule', 12, 24 + i, 0);
      if (bar) for (let i = 0; i < 3; i++) w.enqueue({ player: 0, cmd: { type: 'train', building: bar.id, specId: 'maceman' } });
      if (den) w.enqueue({ player: 0, cmd: { type: 'train', building: den.id, specId: 'lynx' } });
    },
  },
  {
    title: 'Charges',
    you: meadowfolk, foe: fenfolk, look: [24, 26],
    text: `<p>${CHARGE} A lance held level takes the whole impact, so a charging lancer hits many times harder than a standing one.</p>
<p><b>Try:</b> select the lancers, press ${key('charge')} and right-click the fenlings (top). The lancers sprint in, strike, and ride on through. Standing in a fight, they only swing, so pull them out: right-click open ground. They run clear, sprinting while enemies are close. Then charge again.</p>
<p>Now try the <b>reedguards</b> (bottom). Their spears are planted, so your charge runs onto their points, and the impact comes back into your lynx. Up close, your lancers cut with their swords instead.</p>`,
    steps: chargeSteps('fenling', 'reedguard', 'lynx', 4),
    setup(w) {
      wait(w, block(w, 0, 'lynx', 4, 14, 26, 2));
      hold(w, block(w, FOE, 'fenling', 8, 34, 19, 4, 4));
      hold(w, block(w, FOE, 'reedguard', 8, 34, 33, 4, 4));
    },
  },
  {
    title: 'Groupings',
    you: meadowfolk, foe: meadowfolk, look: [26, 26],
    text: `<p>Who wins depends on <b>how bodies meet</b>, not on a bonus table. Enemy lancers will charge you in <b>30 seconds</b>.</p>
<p>Your pikemen stand in a tight block in front, with the slingers behind. Pikemen plant their pikes by themselves when they see a charge coming. So the lancers run onto set points and take the whole collision. <b>Watch</b> it play out.</p>
<p><b>Then try:</b> press Restart. In those 30 seconds, scatter the pikemen across the field, or move the slingers out in front. Same units, different grouping, and now the same lancers win. The <b>Arena</b> scores every matchup if you want the numbers.</p>`,
    steps: groupingSteps,
    setup(w) {
      block(w, 0, 'pikeman', 8, 20, 26, 4);
      block(w, 0, 'slinger', 6, 15, 26, 3);
      block(w, 0, 'maceman', 4, 17, 34, 2);
      hold(w, block(w, FOE, 'lynx', 4, 44, 26, 2, 4));
    },
    tick: chargeAfter30,
  },
  {
    title: 'High ground',
    you: meadowfolk, foe: meadowfolk, look: [20, 25], map: hillField, fog: true,
    text: `<p>The ground has <b>levels</b>. A <b>cliff</b> is a rock face where the ground drops a level, and nothing walks up it. A <b>ramp</b> is a smooth slope that joins two levels. The hill ahead has a ramp on each side.</p>
<p><b>Try:</b> send one hurlhorn round the hill to the macemen on the low ground beyond it. From down there, each stone does about 110 damage, so a maceman takes two. Then walk the other hurlhorn up the ramp, to the hill's edge above the macemen. A stone thrown down gains the energy of its fall: about 145 damage, and one stone drops a maceman.</p>
<p>High ground also <b>sees further</b>: 2 tiles more for each level. Watch the fog pull back as your hurlhorn climbs.</p>`,
    steps: [{ text: 'Throw from the low ground', done: (w) => thrown(w, 'hurlhorn') }, { text: 'Walk a hurlhorn up onto the hill', done: (w) => yours(w, 'hurlhorn').some((u) => u.x >= HILL.x0 && u.x <= HILL.x1 + 1 && u.y >= HILL.y0 && u.y <= HILL.y1 + 1) }, { text: 'Drop a maceman', done: (w) => theirs(w, 'maceman') < 6 }],
    setup(w) {
      wait(w, block(w, 0, 'hurlhorn', 2, 10, 27, 2));
      hold(w, block(w, FOE, 'maceman', 6, 26, 16, 3, 1));
    },
  },
  {
    title: 'Calories',
    you: fenfolk, foe: meadowfolk, look: [16, 26],
    text: `${CALORIES}
<p><b>Try:</b> select the bog toads, press ${key('charge')} (Charge) and right-click a maceman. They sprint in and slam: watch their bars drain. Charge again and again until they run low.</p>
<p>An empty unit is <b>exhausted</b>: it's slow, and it can't fight. Select your toads and press ${key('resupply')} (Resupply). They go to eat at the nearest building with food in it. In the fen that can be any reed hut, so a stocked hut near the fight keeps your toads fighting.</p>`,
    steps: calorieSteps('bog toads', eatAtHome),
    setup(w) {
      base(w, 0, 'stilt-hall', 6, 24, { food: 3000, crystal: 200 });
      base(w, 0, 'reed-hut', 20, 20, { food: 800 });
      const yours = [...block(w, 0, 'bog-toad', 3, 14, 24, 3), ...block(w, 0, 'fenling', 6, 14, 30, 3)];
      for (const id of yours) { const u = w.units.get(id)!; u.cal = u.stats.maxCalories * 0.45; }
      wait(w, yours);
      hold(w, block(w, FOE, 'maceman', 6, 36, 26, 3, 4));
    },
  },
  {
    title: 'Crystals',
    you: fenfolk, foe: meadowfolk, look: [20, 26],
    text: `<p>Every weapon's tip is <b>crystal</b>. A striker keeps its crystal, but a thrower spends one with every throw. Each fenling carries 6 sling stones.</p>
<p><b>Try:</b> select your fenlings and right-click a maceman. Count the throws. Spent stones lie on the ground as <b>shards</b>, and anyone can pick them up.</p>
<p>A fenling that runs dry goes to restock. The <b>pack tortoise</b> is a walking crystal store. Move it up behind your fenlings. It sweeps up the shards it can see and rearms fenlings near it, so they don't walk home. The Stilt Hall restocks them too (${key('resupply')}).</p>`,
    steps: [{ text: 'Sling at a maceman', done: (w) => thrown(w, 'fenling') }, { text: 'Move the pack tortoise up behind them', done: (w) => yours(w, 'pack-tortoise').some((u) => u.x > 14) }, { text: 'A fenling restocks', done: (w) => yours(w, 'fenling').some((u) => u.order.kind === 'rearm' || u.order.kind === 'resupply') }],
    setup(w) {
      const hall = base(w, 0, 'stilt-hall', 6, 24, { food: 1500, crystal: 300 });
      wait(w, block(w, 0, 'fenling', 8, 14, 26, 4));
      // (a bearer goes about its own work) loaded from the hall, as it would come out of training there
      for (const id of block(w, 0, 'pack-tortoise', 1, 11, 26, 1)) if (hall) loadUp(w, w.units.get(id)!, hall);
      hold(w, block(w, FOE, 'maceman', 4, 36, 26, 2, 4));
    },
  },
  {
    title: 'Fen hauling',
    you: fenfolk, foe: meadowfolk, look: [16, 26],
    text: `<p>The Fenfolk have <b>no carts</b>. Each little <b>reed hut</b> is its own base. Fenlings drop what they gather at the nearest one, and each hut trains from its own stock.</p>
<p><b>Try:</b> the Stilt Hall is stocked, but both reed huts are empty. Click a hut and queue some reedguards: now it needs food and crystal. Then select all your fenlings and right-click that hut. They <b>haul</b> what it needs from the Stilt Hall. Each fenling carries only about 9 kg a trip.</p>
<p>So Fen players build huts where the work is. Gather beside a hut and train beside it, and nothing travels far.</p>`,
    steps: [{ text: 'Queue reedguards at a reed hut', done: (w) => built(w, 'reed-hut').some((b) => b.queue.length > 0) || yours(w, 'reedguard').length > 0 }, { text: 'Haul food to that hut', done: (w) => built(w, 'reed-hut').some((b) => b.stock.food > 0) || yours(w, 'reedguard').length > 0 }],
    setup(w) {
      base(w, 0, 'stilt-hall', 6, 24, { food: 2500, wood: 800, crystal: 400 });
      base(w, 0, 'reed-hut', 16, 19, {});
      base(w, 0, 'reed-hut', 16, 33, {});
      block(w, 0, 'fenling', 8, 12, 26, 4);
    },
  },
  {
    title: 'Charges',
    you: fenfolk, foe: meadowfolk, look: [24, 26],
    text: `<p>${CHARGE} A bog toad weighs 200 kg, so a toad at full tilt hits far harder than one standing and biting.</p>
<p><b>Try:</b> select the toads, press ${key('charge')} and right-click the slingers (top). The toads sprint in, slam, and carry on through. Standing in a fight, they only bite, so pull them out: right-click open ground. Then charge again.</p>
<p>Now try the <b>pikemen</b> (bottom). Their pikes are planted, so your charge runs onto the points, and the toad's own weight drives them in. Send your fenlings to sling at the pikemen instead.</p>`,
    steps: chargeSteps('slinger', 'pikeman', 'bog-toad', 4),
    setup(w) {
      wait(w, [...block(w, 0, 'bog-toad', 4, 14, 26, 2), ...block(w, 0, 'fenling', 6, 11, 26, 3)]);
      hold(w, block(w, FOE, 'slinger', 8, 34, 19, 4, 4));
      hold(w, block(w, FOE, 'pikeman', 8, 34, 33, 4, 4));
    },
  },
  {
    title: 'Groupings',
    you: fenfolk, foe: meadowfolk, look: [26, 26],
    text: `<p>Who wins depends on <b>how bodies meet</b>, not on a bonus table. Enemy lancers will charge you in <b>30 seconds</b>.</p>
<p>Your reedguards stand in a tight block in front, with the fenlings behind. Reedguards plant their spears by themselves when they see a charge coming. So the lancers run onto set points and take the whole collision, while the fenlings sling over the top. <b>Watch</b> it play out.</p>
<p><b>Then try:</b> press Restart. In those 30 seconds, scatter the reedguards across the field, or move the fenlings out in front. Same units, different grouping, and now the lancers do far better. The <b>Arena</b> scores every matchup if you want the numbers.</p>`,
    steps: groupingSteps,
    setup(w) {
      block(w, 0, 'reedguard', 12, 20, 26, 4);
      block(w, 0, 'fenling', 8, 15, 26, 4);
      hold(w, block(w, FOE, 'lynx', 4, 44, 26, 2, 4));
    },
    tick: chargeAfter30,
  },
  {
    title: 'Birds',
    you: fenfolk, foe: meadowfolk, look: [24, 26],
    text: `<p><b>Siege herons</b> fly. In the air they wheel round in wide turns, as birds do, instead of stopping on a spot. A crystal dropped from higher up falls further, so it hits harder.</p>
<p><b>Try:</b> select the herons and right-click a maceman. They take off, climb and bomb from overhead, out of reach of maces. Now right-click a slinger. Thrown stones can hit a flier, and a heron flying low can even be struck from the ground.</p>
<p>Climbing costs a heron a lot of calories, but once up high it soars cheaply. It lands by itself when it stops or runs low. Press ${key('resupply')} to send them home to eat.</p>`,
    steps: [{ text: 'Send the herons at a maceman', done: (w) => yours(w, 'great-siege-heron').some((u) => u.airborne) }, { text: 'Bomb one', done: (w) => theirs(w, 'maceman') < 6 }, { text: 'Send them home to eat (Resupply)', done: (w) => yours(w, 'great-siege-heron').some((u) => u.order.kind === 'resupply') }],
    setup(w) {
      base(w, 0, 'stilt-hall', 6, 24, { food: 3000, crystal: 400 });
      wait(w, block(w, 0, 'great-siege-heron', 2, 14, 26, 2));
      hold(w, block(w, FOE, 'maceman', 6, 34, 20, 3, 4));
      hold(w, block(w, FOE, 'slinger', 6, 34, 32, 3, 4));
    },
  },
  {
    title: 'The brood',
    you: wildwelds, foe: meadowfolk, look: [16, 25],
    text: `<p>The <b>Wildwelds</b> have no buildings to train from. Mothers lay eggs, eggs hatch into larvae, and larvae change into everything else. It all runs on food.</p>
<ol>
<li>Select the mother and click <b>T1 Egg</b> in her panel. She lays an egg beside her. Hold the click on <b>T1 Egg</b> and she keeps laying them, one after another.</li>
<li>An egg hatches once it's fed. Select the green larvae and press ${key('tend')} (Tend). They carry food to whoever is waiting for it.</li>
<li>Short of food? Select a green larva and right-click a tree. It turns the whole tree into food, and is gone into it.</li>
<li>Select a larva and click a tile marked →. It changes inside a cocoon, and tenders feed it.</li>
<li>Select the cyan T2 larva and click <b>↓ Web Wall</b>. Right-drag a line: its body becomes the wall, which grows on food. A T3 larva lays a <b>Mimic Mine</b> instead: a tower that throws crystal.</li>
<li>Click the basket in the minimap's top-left corner, then right-click a spot. Tenders look for food near it. The sword (top-right) sets where new fighters go.</li>
</ol>`,
    steps: [{ text: 'Lay an egg', done: (w) => yours(w, 'egg1').length > 0 || yours(w, 'mother1').some((u) => u.brood.length > 0) || yours(w, 'larva1').length > 3 }, { text: 'Tend it until it hatches', done: (w) => yours(w, 'larva1', 'cocoon').length > 3 }, { text: 'Turn a tree into food', done: (w) => [...w.nodes.values()].some((n) => n.digested) }, { text: 'Change a larva into something', done: (w) => yours(w, 'cocoon').length > 0 }, { text: 'Lay a web wall', done: (w) => built(w, 'web-wall').length > 0 || [...w.buildings.values()].some((b) => b.owner === 0) }],
    setup(w) {
      const mother = w.spawnAt(0, 'mother1', 14, 25, 0);
      if (mother) mother.food = mother.stats.cargoCapacity; // enough in her pack to lay an egg
      block(w, 0, 'larva1', 3, 17, 29, 3);
      block(w, 0, 'larva2', 1, 17, 21, 1);
      // a few trees to digest, and spare crystal for new fighters (the berries are the field's own)
      for (const [x, y] of [[22, 22], [23, 23], [22, 24], [24, 21]]) w.addNode({ type: 'wood', x: x + 0.5, y: y + 0.5, amount: TREE_WOOD, shard: false, tree: true });
      w.addNode({ type: 'crystal', x: 11.5, y: 21.5, amount: 60, shard: true, tree: false });
    },
  },
  {
    title: 'Calories',
    you: wildwelds, foe: meadowfolk, look: [16, 28],
    text: `${CALORIES}
<p>For the Wildwelds, food does everything else too: it hatches eggs and finishes cocoons. Two larvae here are changing into fighters, and their cocoons are waiting for food. Your green larvae <b>tend</b> by themselves: they gather berries and carry them to whoever is waiting, whether a cocoon, an egg, or a mother with an egg to lay. A larva you've given another order stops tending. Select it and press ${key('tend')} (Tend) to send it back. Keep most of your larvae tending.</p>
<p>Watch the fighters come out. Each is born with <b>no crystal</b>, and walks off to pick up its own before it can fight. There are some shards lying beside the cocoons.</p>
<p>Fighters get hungry too, and there's no hall to eat at. Select the tired whipwelds and right-click a berry bush: they eat straight from it until they're full.</p>`,
    steps: [{ text: 'A fighter comes out of its cocoon', done: (w) => yours(w, 'charger', 'micropike').length > 0 }, { text: 'It picks up its own crystal', done: (w) => yours(w, 'charger', 'micropike').some((u) => u.ammo > 0) }, { text: 'Feed a tired whipweld at a berry bush', done: (w) => yours(w, 'whipweld').some((u) => u.order.kind === 'graze') }],
    setup(w) {
      const yours = block(w, 0, 'whipweld', 3, 18, 24, 3);
      for (const id of yours) { const u = w.units.get(id)!; u.cal = u.stats.maxCalories * 0.45; }
      wait(w, yours);
      block(w, 0, 'larva1', 4, 14, 29, 2);
      // two more larvae, changing: their cocoons wait for the tenders' food
      const [a, b] = block(w, 0, 'larva1', 2, 15, 25, 2);
      w.enqueue({ player: 0, cmd: { type: 'metamorph', units: [a], into: 'charger' } });
      w.enqueue({ player: 0, cmd: { type: 'metamorph', units: [b], into: 'micropike' } });
      w.addNode({ type: 'crystal', x: 13.5, y: 23.5, amount: 40, shard: true, tree: false });
      hold(w, block(w, FOE, 'maceman', 6, 36, 26, 3, 4));
    },
  },
  {
    title: 'Crystals',
    you: wildwelds, foe: meadowfolk, look: [20, 26],
    text: `<p>Every weapon's tip is <b>crystal</b>. A whipweld keeps the crystal on its whip, but a thrower spends one with every throw. Each slinger carries 14.</p>
<p><b>Try:</b> select your slingers and right-click a maceman. Count the throws. Spent stones lie on the ground as <b>shards</b>, and anyone can pick them up.</p>
<p>The Wildwelds have no hall to restock at. A slinger that runs dry picks crystal up off the ground: its own spent stones, or any shards lying nearby. There are some just behind your slingers.</p>`,
    steps: [{ text: 'Throw at a maceman', done: (w) => thrown(w, 'slinger') }, { text: 'A slinger picks crystal up off the ground', done: (w) => yours(w, 'slinger').some((u) => u.order.kind === 'gather' && u.order.nodeType === 'crystal') }],
    setup(w) {
      wait(w, block(w, 0, 'slinger', 2, 14, 26, 2));
      for (const y of [23.5, 28.5]) w.addNode({ type: 'crystal', x: 11.5, y, amount: 60, shard: true, tree: false });
      hold(w, block(w, FOE, 'maceman', 6, 36, 26, 3, 4));
    },
  },
  {
    title: 'Charges',
    you: wildwelds, foe: meadowfolk, look: [24, 26],
    text: `<p>${CHARGE} The <b>Goliath Charger</b> is 600 kg of battering ram, so at full tilt it hits many times harder than it does standing.</p>
<p><b>Try:</b> select the Goliaths, press ${key('charge')} and right-click the slingers (top). They bound in, strike, and carry on through. Standing in a fight, they only swing, so pull them out: right-click open ground. Then charge again.</p>
<p>Now try the <b>pikemen</b> (bottom). Their pikes are planted, so your charge runs onto the points, and the Goliath's own weight drives them in. Charge the soft targets: throwers, workers, anything that isn't holding a spear.</p>`,
    steps: chargeSteps('slinger', 'pikeman', 'ground-attacker3', 2),
    setup(w) {
      wait(w, block(w, 0, 'ground-attacker3', 2, 14, 26, 2));
      hold(w, block(w, FOE, 'slinger', 8, 34, 19, 4, 4));
      hold(w, block(w, FOE, 'pikeman', 8, 34, 33, 4, 4));
    },
  },
  {
    title: 'Groupings',
    you: wildwelds, foe: meadowfolk, look: [26, 26],
    text: `<p>Who wins depends on <b>how bodies meet</b>, not on a bonus table. Enemy lancers will charge you in <b>30 seconds</b>.</p>
<p>Your micropikes stand in a block in front, with three slingers behind. The micropikes won't win this: a lance reaches twice as far as their pikes, and most of them will die. The slingers do the killing. <b>Watch</b> it play out.</p>
<p><b>Then try:</b> press Restart. In those 30 seconds, move the slingers well out in front of the micropikes. Same units, different grouping: now they start throwing sooner, the lancers fall before they arrive, and nearly every micropike lives. The <b>Arena</b> scores every matchup if you want the numbers.</p>`,
    steps: groupingSteps,
    setup(w) {
      block(w, 0, 'micropike', 24, 20, 26, 4);
      block(w, 0, 'slinger', 3, 15, 26, 3);
      hold(w, block(w, FOE, 'lynx', 4, 44, 26, 2, 4));
    },
    tick: chargeAfter30,
  },
];

/** The lesson's scenario: its field (the Proving Grounds unless it has its own), no wildlife, nobody wins. */
export function tutorialScenario(lesson: Lesson): Scenario {
  const pg = provingGrounds();
  return { id: 'tutorial', victory: false, wildlife: false, map: lesson.map ?? ((seed) => pg.map(seed)), setup: (w) => lesson.setup(w), tick: lesson.tick && ((w) => lesson.tick!(w)) };
}

/** The lesson's world: you are player 0, the other side player 1. */
export function tutorialWorld(lesson: Lesson, seed: number): World {
  return new World({ seed, scenario: tutorialScenario(lesson), players: [{ name: 'You', faction: lesson.you }, { name: lesson.foe.name, faction: lesson.foe }] });
}
