# Gameplay notes

Things noticed while building the tutorial and the computer players that could improve play. Each one says what was seen and how it was measured; none is fixed yet.

## Balance

- **Heavy beasts crush set pikes.** Three bog toads (400 kg, refinement 2.0) killed eight planted pikemen in about 5 s and lost nothing. Since a set shaft's impact is capped at the pole's buckling force (about 196 damage), a pike can't stop a 400 kg body. At equal budgets the arena has toads beating pikemen (−0.42). Is that the intent, or should something counter big beasts?
- **Hold is worse than auto against a charge.** In the Groupings lesson, the same pikes, slingers and macemen beat four charging lancers on auto, but lost on Hold. Hold seems to stop units responding fully: pikes already plant themselves on auto, so Hold only adds passivity. Worth deciding what Hold should be good for.
- **Lancers' swords hit as hard as their lances (96).** The rider and the lynx are one fused body, so the sword swings with the whole body's muscle.
- **Pikes are still the strongest body at refinement 1** (+0.52 average), mostly from beating lone big units that a budget buys only one of.
- **Fenfolk vs Meadowfolk** is the AI's closest pairing: Hard Fenfolk lost once to Easy Meadowfolk. The lynx beats everything Fenfolk have except the heron (`npm run arena`).

## Logistics

- **Fen hauling is very slow.** A fenling carries about 9 kg a trip, and a reedguard costs 93 food. With eight fenlings hauling 10 tiles, the first reedguard came out after about 70 s.
- **A hut waits to train with enough food in stock.** In that test the hut held 197 food at 60 s, more than two reedguards' worth, but the first one only started training then. Worth checking whether something else blocks training (crystal, or the order's queue).
- **Fenfolk without carts stall** on moving food and crystal to their unit buildings. The AI agent saw this too.
- **Calories mostly matter when sprinting.** A long walk cost the lancers only about 7% of their tank; two charges cost about 30%. Walking armies may never feel the calorie system.

## Computer players

- **Hard is slow to finish a game on 96-tile maps.** In one Hard-vs-Easy game, Easy was down to 5 units by minute 20, but Hard only destroyed the last buildings at minute 34. It could push to finish once the enemy army is gone.

## Units and abilities

- **Herons took some damage from macemen** (94 HP in 30 s of bombing). That may be from landing or flying low, or maces reaching low fliers. Worth checking that it's intended.
