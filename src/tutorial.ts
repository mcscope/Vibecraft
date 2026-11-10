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
const CALORIES = '<p>Every unit burns <b>calories</b>: the orange bar under its health. Walking drains it slowly, sprinting about four times as fast, and every blow costs some. Big units carry more.</p>';
/** And every Charges lesson's. */
const CHARGE = 'A <b>charge</b> turns speed into damage: the faster and heavier the unit, the harder it hits.';

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
<p>Select the lancers, press ${key('charge')} (Charge) and right-click a fenling. A charge is a sprint, so watch their bars drain. Keep charging until they run low.</p>
<p>A unit on empty is <b>exhausted</b>: slow and too weak to fight. Select your units and press ${key('resupply')} (Resupply) to send them home to the Town Center to eat.</p>`,
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
    text: `<p><b>Crystal</b> is ammo. A maceman keeps his mace head, but a thrower spends a crystal with every throw. Each slinger carries 12 stones.</p>
<p>Select your slingers and right-click a bog toad. Spent stones land as <b>shards</b>, and anyone can pick them up.</p>
<p>A slinger low on ammo walks back to the Town Center and restocks by itself. Press ${key('resupply')} (Resupply) to restock everyone before a fight. The <b>Hurlhorn</b> is your siege unit: a full load of 12 throws costs 108 crystal, so save it for big targets.</p>`,
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
    text: `<p>Each <b>building</b> has its own stock. Here the Town Center is full, and the Barracks and the Lynx Den across the field are empty, with units queued.</p>
<p><b>Mule carts</b> are your haulers, and they work by themselves. They load where there's spare and deliver where it's needed, most urgent first.</p>
<p>Click a building to see its stock. Queue more units at the far ones, and train extra carts at the Town Center to speed up supply. Build close together and keep the roads clear to shorten each trip.</p>`,
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
    text: `<p>${CHARGE} A lancer at full charge hits many times harder than one standing still.</p>
<p>Select the lancers, press ${key('charge')} (Charge) and right-click the fenlings (top). They sprint in, strike and ride on through. Right-click open ground to pull them clear, then charge again: every run-up is another big hit.</p>
<p>Now charge the <b>reedguards</b> (bottom). <b>Spears counter chargers</b>: your lancers run onto the planted points and take the impact themselves.</p>`,
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
    text: `<p>How you <b>group</b> your units decides the fight. Enemy lancers will charge you in <b>30 seconds</b>.</p>
<p>Your pikemen stand in a tight block in front, with slingers behind. Pikemen brace by themselves when a charge comes, so the lancers run onto their pikes. <b>Watch</b> it play out.</p>
<p>Then press Restart. This time, scatter the pikemen or move the slingers out in front before the charge. Same units, different grouping, and the lancers win. The <b>Arena</b> has the numbers for every matchup.</p>`,
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
    text: `<p>The ground has <b>levels</b>, joined by <b>ramps</b>. <b>High ground</b> gives your throwers more damage and more sight.</p>
<p>Send one hurlhorn round the hill to the macemen on the low ground. From there each stone does about 110 damage: two to kill a maceman. Then walk the other hurlhorn up the ramp to the hill's edge above them. Thrown down, a stone does about 145: one kills.</p>
<p>Each level up also adds 2 tiles of sight. Watch the fog pull back as your hurlhorn climbs.</p>`,
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
<p>Select the bog toads, press ${key('charge')} (Charge) and right-click a maceman. A charge is a sprint, so watch their bars drain. Keep charging until they run low.</p>
<p>A unit on empty is <b>exhausted</b>: slow and too weak to fight. Select your toads and press ${key('resupply')} (Resupply): they eat at the nearest building with food. Any stocked reed hut will do, so build one near the fight to keep your toads fighting.</p>`,
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
    text: `<p><b>Crystal</b> is ammo. A striker keeps its crystal, but a thrower spends one with every throw. Each fenling carries 6 sling stones.</p>
<p>Select your fenlings and right-click a maceman. Spent stones land as <b>shards</b>, and anyone can pick them up.</p>
<p>The <b>pack tortoise</b> is a walking crystal store. Move it up behind your fenlings. It sweeps up the shards it can see and acts as a mobile restock point for fenlings, who can quickly run out of ammo. Press ${key('resupply')} (Resupply) to restock at the Stilt Hall.</p>`,
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
    text: `<p>For resources to get around your base, you must assign a fenling as a <b>hauler</b>. Each <b>reed hut</b> is its own little base: fenlings drop what they gather at the nearest one, and each hut trains from its own stock.</p>
<p>The Stilt Hall is stocked and both reed huts are empty. Click a hut and queue some reedguards. Then select your fenlings and right-click that hut: they <b>haul</b> what it needs from the Stilt Hall, about 9 kg a trip.</p>
<p>Build huts where the work is. Gather and train beside the same hut to keep hauling short.</p>`,
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
    text: `<p>${CHARGE} A bog toad weighs 200 kg, so at full charge it hits far harder than it does standing and biting.</p>
<p>Select the toads, press ${key('charge')} (Charge) and right-click the slingers (top). They sprint in, slam and carry on through. Right-click open ground to pull them clear, then charge again.</p>
<p>Now charge the <b>pikemen</b> (bottom). <b>Pikes counter chargers</b>: your toads run onto the planted points, and their own weight drives them in. Send your fenlings to sling at the pikemen.</p>`,
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
    text: `<p>How you <b>group</b> your units decides the fight. Enemy lancers will charge you in <b>30 seconds</b>.</p>
<p>Your reedguards stand in a tight block in front, with fenlings behind. Reedguards brace by themselves when a charge comes, so the lancers run onto their spears while the fenlings sling over the top. <b>Watch</b> it play out.</p>
<p>Then press Restart. This time, scatter the reedguards or move the fenlings out in front before the charge. Same units, different grouping, and the lancers do far better. The <b>Arena</b> has the numbers for every matchup.</p>`,
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
    text: `<p><b>Siege herons</b> are your flying bombers. The higher they climb, the harder their crystals hit.</p>
<p>Select the herons and right-click a maceman. They take off, climb and bomb from overhead, out of a mace's reach. Only throwers can hit a flier: now right-click a slinger and watch the stones come up at you.</p>
<p>Climbing burns a lot of calories, and soaring up high is cheap. A heron lands by itself when it stops or runs low. Press ${key('resupply')} (Resupply) to send them home to eat.</p>`,
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
    text: `<p>The <b>Wildwelds</b> are their own production: mothers lay eggs, eggs hatch into larvae, and larvae change into every other unit. It all runs on food.</p>
<ol>
<li>Select the mother and click <b>T1 Egg</b>. She lays an egg beside her. To make her lay eggs over and over, press and hold the mouse button on <b>T1 Egg</b> until the tile lights up. Press and hold it again to stop.</li>
<li>Feed an egg to hatch it. Select the green larvae and press ${key('tend')} (Tend): they carry food to whoever is waiting for it.</li>
<li>For a quick pile of food, select a green larva and right-click a tree. The larva turns the whole tree into food and is used up.</li>
<li>Select a larva and click a tile marked → to change it. It will begin morphing into that unit, and form a cocoon to change. It may need more food brought to it to complete the transformation.</li>
<li>Select the cyan T2 larva and click <b>↓ Web Wall</b>, then right-drag a line. Its body becomes the wall, which grows on food. A T3 larva lays a <b>Mimic Mine</b>: a tower that throws crystal.</li>
<li>Set your rally points on the minimap. Click the basket (top-left), then right-click a spot: tenders gather food near it. The sword (top-right) sets where new fighters gather.</li>
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
<p>Wildwelds spend food on growth too: it hatches eggs and finishes cocoons. Your green larvae <b>tend</b> by themselves: they gather berries and feed whoever is waiting, here two cocoons. Give a larva another order and it stops tending. Press ${key('tend')} (Tend) to send it back. Keep most of your larvae tending.</p>
<p>Watch the fighters hatch. Each is born <b>unarmed</b> and walks off to pick up its own crystal before it fights. Some shards lie beside the cocoons.</p>
<p>Fighters eat in the field. Select the tired whipwelds and right-click a berry bush: they eat until they're full.</p>`,
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
    text: `<p><b>Crystal</b> is ammo. A whipweld keeps the crystal on its whip, but a thrower spends one with every throw. Each slinger carries 14.</p>
<p>Select your slingers and right-click a maceman. Spent stones land as <b>shards</b>, and anyone can pick them up.</p>
<p>Wildwelds restock in the field: a slinger out of ammo picks up the nearest shards by itself. Some lie just behind your slingers.</p>`,
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
    text: `<p>${CHARGE} Your <b>Goliath Chargers</b> weigh 600 kg each.</p>
<ol>
<li>Select the Goliaths. Press ${key('charge')} (Charge), then right-click the <b>slingers</b> at the top.</li>
<li>After they hit, right-click open ground to pull them clear, then charge again. Every run-up is another big hit.</li>
<li>Now charge the <b>pikemen</b> at the bottom. <b>Pikes counter chargers</b>: a Goliath that runs onto a set pike is hurt by its own weight.</li>
</ol>
<p>So charge throwers and workers, and send your slingers at the pikes.</p>`,
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
    text: `<p>How you <b>group</b> your units decides the fight. Enemy lancers will charge you in <b>30 seconds</b>.</p>
<p><b>Micropikes counter chargers.</b> They're cheap and fragile, so bring about ten for each lancer. Yours stand in a tight block and set their pikes by themselves when the charge comes. A micropike that falls leaves its pike set for a moment, so the lancer that killed it still runs onto the point. <b>Watch</b> it play out.</p>
<p>Then press Restart. This time, select them all, press ${key('charge')} (Charge) and right-click the lancers before they come. Only a standing micropike sets its pike, so a block on the run loses many more.</p>`,
    steps: groupingSteps,
    setup(w) {
      // forty micropikes in a tight block, eight wide and five deep
      for (let i = 0; i < 40; i++) w.spawnAt(0, 'micropike', 22 - Math.floor(i / 8) * 0.9, 26 + ((i % 8) - 3.5) * 0.9, 0);
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
