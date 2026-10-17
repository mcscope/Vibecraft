# Gameplay depth: critique and proposals

Written autonomously, 2026-10-17, from AI-vs-AI simulations and the derived unit stats.
Every proposal has to come out of the costed physics (or be a generic, data-defined ability): no arbitrary per-unit bonuses.

## What the numbers say today

### 1. Economy snowballs from cheap parallel production

Fenfolk vs Meadowfolk, 4 AI games of 20 minutes (woodlands):

| seed | result | resources gathered (Fen/Meadow) | units trained |
|---|---|---|---|
| 1 | draw | 8.8k / 6.5k | 55 / 32 |
| 2 | Fen win, 16.8 min | 12.2k / 4.2k | 89 / 23 |
| 3 | Fen win, 18.8 min | 16.9k / 5.7k | 75 / 39 |
| 4 | Fen crushing | 12.4k / 3.2k | 46 / 21 |

The Fenfolk out-gather the Meadowfolk 2–3×. **Root cause:** a unit's training time depends only on its own mass, never on the building. A 60-wood Reed Hut trains a fenling exactly as fast as an 810-wood Town Center trains a villager. A Reed Hut is also a drop-off, and it inherits its prerequisite's capital at 100%, so it can train refined units too. Production therefore scales with the *number* of buildings, not the wood sunk into them. Ten cheap huts are ten Town Centers. It's an exponential economy for whoever has the cheapest producer, and it also makes early rushes strong: cheap barracks mean parallel queues.

### 2. Combat has no counters, only sizes

There's one damage type and one defence (HP). Per unit of cost:

| unit | HP × DPS per cost | note |
|---|---|---|
| Lynx Lancer | 55 | |
| Great Siege Heron / Hurlhorn | ~33 | |
| Bog Toad | 22 | |
| Maceman | 13 | |
| Villager, Reedguard | ~4.5 | |
| Slinger, Fenling | ~1.4 | |

HP and damage both grow with body mass, so their product grows with mass² while cost grows only with mass: bigger is better per root. Lanchester's square law partly offsets this. An army's strength goes as N² × HP × DPS, and for a fixed budget N = B/cost, so strength ∝ B² × HP × DPS / cost². That last factor is roughly mass-independent: **in a pure slugfest, swarm and elite come out about even.** That's a nice emergent property and worth keeping.

But nothing makes a *particular* unit good against another particular unit. Army composition is just "more value", and there's no rock-paper-scissors.

### 3. Missing strategic tensions (compared with AoE-likes)

- No reason to tech or build an elite army over massing a cheap one, beyond raw efficiency.
- Nothing makes static defence or walls valuable against a timing rush. The Fenfolk Canal exists but the AI ignores it.
- Crystal is scarce-ish but plays no strategic role (most units cost 1–8 crystal).

## Proposals (ranked by depth gained per complexity)

### P1. Training throughput ∝ the training building's own capital

A building trains `ownCapital / 500` times as fast as the base rate:
- **Stilt Hall** (500): same speed as now.
- **Town Center** (810): 1.6×.
- **Reed Hut** (60): 0.12×.

Production then scales with wood invested, not with building count. Ten huts give the same throughput as one hall of the same total wood, so nothing is gained by spamming small producers. Huts stay useful as forward drop-offs and slow trickle production. Prerequisite capital still gates *what* a building can train (refinement), just not *how fast*.

**Critique:** this slows early military buildings (a 180-wood Barracks trains at 0.36×), which also tames rushes. Good, but the reference value needs tuning against game pace. It's simple, general, and players can see it (show "trains ×1.6" in the HUD and Codex).

### P2. Armour from frame: a flat reduction per hit

Each hit loses a flat amount of damage equal to the target's frame armour, and armour grows with frame kg per unit of body surface. Light, fast hits (slings, fenlings) glance off heavily framed bodies (Macemen, Reedguard, the tortoise); heavy hits (Lynx, Hurlhorn, big crystals) punch through. This is AoE's pierce/melee armour arising from physics: penetration needs energy per hit.

This gives a real counter axis: **many small hits vs. armour, and few big hits vs. a swarm** (big hits are already wasted as overkill on tiny bodies).

### P3. Splash for heavy thrown crystals

A thrown crystal's impact spreads damage to everything within a radius that grows with its mass, falling off with distance. A 9 kg Hurlhorn rock and a heron's 8 kg drop hit clumps; a 1 kg sling stone doesn't. Artillery then counters massed swarms, and swarms must spread out. Fast units that can reach the artillery counter it. It also makes the Great Siege Heron and the Hurlhorn distinct roles rather than just big units.

### P4. Reach strikes first

When a unit with longer reach is attacked by one with shorter reach, it gets the first blow as the attacker closes, and a charging attacker's own momentum counts toward that blow. Long-reach infantry (spear or pike bodies) then counter charging heavies like the Lynx. It's AoE's spear-beats-cavalry from physics. This needs a reach parameter on strike attacks (reach = weapon length, priced like any mass).

### Triangle these create

- **Swarm of light hits** (slingers, fenlings) beats lone elites by Lanchester, but not armour (P2) or splash (P3).
- **Armoured infantry** beats light hits (P2), but is slow and gets kited.
- **Heavy hitters, cavalry and artillery** beat armour; artillery beats swarms (P3); cavalry beats artillery; reach infantry beats cavalry (P4).

All from mass, frame, crystal size and reach, so every vibecoded army lands somewhere in the triangle by its physics.

### Smaller levers (later)

- **Crystal as the strategic resource:** armour piercing and splash both scale with crystal mass, so heavy crystals become what you fight over. Contested crystal mid-map matters more.
- **Defensive advantage:** towers and walls are already priced; P1 slows rushes; height bonus exists.
- **Trash vs gold units:** P2 and P3 give cheap swarm units real jobs (screens, anti-elite through Lanchester numbers) and real weaknesses.

## What was built and measured (overnight)

### P1: done (reference capital 300)

A building trains units at its own capital ÷ 300 × the base rate:

| building | wood | speed |
|---|---|---|
| Town Center | 810 | 2.7× |
| Stilt Hall | 500 | 1.7× |
| Lynx Den | 360 | 1.2× |
| Barracks | 180 | 0.6× |
| Reed Hut | 60 | 0.2× |

Research is unchanged. With each faction playing alone, the two economies are now close at 8 minutes (Meadow 4.6–4.9k gathered, Fen 5.2–5.8k), where before the Fenfolk raced ahead 2–3×. A reference of 500 was tried first. It crippled small military buildings (the Barracks at 0.36× trained a maceman every 35 s).

### P2: done, gently (armour = 6 × frame share)

Macemen get 2.7 armour, Reedguard 3.3, fenlings 1.3, the Lynx 1.7, all with a 15% damage floor. An earlier version scaled armour with ∛mass too. That gave big bodies armour as well and made them immune to swarms, so it was dropped.

### The arena matrix (`npm run arena`)

Equal-budget fights (1,200), with armour on:

- **Big refined units beat nearly everything.** The Lynx beats everything except the heron.
- **The heron is untouchable by melee in the air**, so only ranged units answer it. The Hurlhorn trades evenly.
- **Slingers lose to everything.** Per unit of cost, the Lynx has about 2× the HP and 4× the damage of a slinger:
  - refinement 1.5 divides its cost;
  - the slinger's light 1.2 kg stone is speed-capped, so its damage can't use the slinger's muscle;
  - its 8 crystal of ammo is expensive.

### Why the Fenfolk still win real games

Their economy *is* an army. Every fenling is a 7-tile thrower, so 25 fenlings put out about 72 ranged DPS while working, and Bog Toads come early. Meadow villagers are melee, and the AI fills half of every Meadow army with slingers, the worst unit in the arena.

(Range itself is not over-strong: the arena shows ranged infantry losing to melee per cost.)

## Decisions for the user (not made unilaterally)

1. **Workers that are also soldiers.** Correction to an earlier guess: the arena shows ranged units are *weak* per cost, not strong. What made the Fenfolk dominant was that their *workers* are a ranged militia they'd have paid for anyway. That's a legitimate faction identity, but it's under-priced. Options:
   - give a worker's weapon its own cost (it does cost crystal ammo today, a little);
   - make fighting tire workers more (calories);
   - let a faction choose either a worker or a soldier body, and price dual-use bodies on both counts.
2. **Should bigger and refined bodies be less efficient per cost?** For example, food cost growing slightly faster than mass (an elite's upbringing), or crystal as an elite's main cost (AoE "gold"). Today big refined units dominate cost-for-cost, so "trash" units have no job.
3. **Splash (P3), tested and reverted.** In the arena it made the Hurlhorn and the heron stronger against *everything* they already beat (Hurlhorn vs Reedguard +0.57 → +0.93). It created no new counter, because swarms already lose to artillery. Revisit once swarm units are worth something (decisions 1–2). **Reach-first-strike (P4)** is still on paper.
4. **Thrower strength, tested and reverted.** Throwing at strike parity (efficiency 0.75 → 1.0, reload 0.4 → 0.2 s) barely helped slingers (they still lost every matchup) and made the Hurlhorn and heron stronger again. Small stones carry too little energy, and armour takes most of it. Making light ranged units viable needs decision 2 (elites less efficient per cost), or ranged-specific physics such as a sling multiplying throw speed.
5. **Faction designs.** Done for the AI: it now builds by army value (HP × DPS ÷ cost²), which turned Fen routs into mostly close games. The Meadowfolk slinger still needs a redesign (heavier stone, fewer of them), but arena tests of five variants (heavier stones, more muscle, refinement) still lost to every Fenfolk unit: per cost, ranged infantry loses to melee in this engine.

## Plan


1. Prototype P1, measure Fen vs Meadow and mirror matches.
2. Then P2 and P3 (measure each), then P4 if time allows.
