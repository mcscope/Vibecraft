# Gameplay notes

Things noticed while building the tutorial and the computer players that could improve play. Each one says what was seen and how it was measured; none is fixed yet.

## Balance

- **Heavy beasts crush set pikes.** Three bog toads (400 kg, refinement 2.0) killed eight planted pikemen in about 5 s and lost nothing. Since a set shaft's impact is capped at the pole's buckling force (about 196 damage), a pike can't stop a 400 kg body. At equal budgets the arena has toads beating pikemen (−0.42). Is that the intent, or should something counter big beasts?
- **Hold is worse than auto against a charge.** In the Groupings lesson, the same pikes, slingers and macemen beat four charging lancers on auto, but lost on Hold. Hold seems to stop units responding fully: pikes already plant themselves on auto, so Hold only adds passivity. Worth deciding what Hold should be good for.
- **Lancers' swords hit as hard as their lances (96).** The rider and the lynx are one fused body, so the sword swings with the whole body's muscle.
- **Pikes are still the strongest body at refinement 1** (+0.52 average), mostly from beating lone big units that a budget buys only one of.
- **Macemen are strictly worse than pikemen.** At 1200 food, pikes beat macemen head-on (+0.36) and do as well or better against every other unit; macemen only fare better against villagers (−0.31 vs −0.53). Price isn't why: per food the maceman is the better body (98 HP and 8.9 dps per 100 food, against the pike's 90 and 7.5). It's reach: the pike strikes from 1.83 tiles, the mace from 0.74, so every maceman crosses a tile of pike reach before it can swing. Two places to look: the deliberate walk a striker closes in at against a longer weapon (free blows for the pikes), and the second rank's points still reaching a maceman who's inside the first rank's.
- **Fenfolk vs Meadowfolk** is the AI's closest pairing: Hard Fenfolk lost once to Easy Meadowfolk. The lynx beats everything Fenfolk have except the heron (`npm run arena`).

## Logistics

- **Fen hauling is very slow.** A fenling carries about 9 kg a trip, and a reedguard costs 93 food. With eight fenlings hauling 10 tiles, the first reedguard came out after about 70 s.
- **A hut waits to train with enough food in stock.** In that test the hut held 197 food at 60 s, more than two reedguards' worth, but the first one only started training then. Worth checking whether something else blocks training (crystal, or the order's queue).
- **Fenfolk without carts stall** on moving food and crystal to their unit buildings. The AI agent saw this too.
- **Calories mostly matter when sprinting.** A long walk cost the lancers only about 7% of their tank; two charges cost about 30%. Walking armies may never feel the calorie system.

## Computer players

- **Games don't always end.** On woodlands, seeds 1000 and 1017, both seats, both factions, games capped at 35 min. The 2026-10-19 AI fixes made Easy keep building rather than stall: it now steers its workers clear of wild bog-lurkers and clears them, the build order also unlocks over time, and it trains in fewer places at once so food isn't spread thin. It also pushes to finish a beaten enemy.
  - **Games won within 35 min, before and after:** Easy–Easy 4/8 → 7/8; Hard–Easy 3/16 → 9/16 (Hard won 7, Easy Fenfolk beat Hard Meadowfolk twice); Hard–Hard 3/8 → 3/8.
  - **Still open:** a winner often razes everything but a few buildings and stalls (one game ended with the loser on 7 buildings and no units); Hard Fenfolk never won from seat 0; Hard–Hard rarely ends.

- **Hard is slow to finish a game on 96-tile maps.** In one Hard-vs-Easy game, Easy was down to 5 units by minute 20, but Hard only destroyed the last buildings at minute 34. It could push to finish once the enemy army is gone.

## Units and abilities

- **Herons took some damage from macemen** (94 HP in 30 s of bombing). That may be from landing or flying low, or maces reaching low fliers. Worth checking that it's intended.

## The new faction may be overpowered (noted 2026-10-21, not acted on)

The new faction feels overpowered in play. Not investigated yet. What we know:

- **The whip isn't meant as a buff.** On the T2 Whipweld (2 m whip), equal 1200-food fights against every combat unit averaged +0.52 with the whip and +0.46 without. The whip adds reach (1.69 tiles instead of 0.69) and speed (9.7 m/s instead of 5.9), but not damage, which is capped by muscle. It recovers 0.2 s slower. Leave it as physics gives it.
- **Refinement is likely the main reason.** Its fighters are refined 2–4 (the Dragon Fly is 4), so a budget buys more of them than of mostly-refinement-1 Meadowfolk. Refined units are meant to win equal-budget fights, since the arena doesn't count what reaching that refinement cost. For this faction that cost is time: laying, changing, and the mother tiers that gate it.
- **The arena's food cost is right.** Each change pays only the price difference, so a chain's payments add up to the final unit's own price. The arena leaves out the time.
- **Most of its bodies are placeholders.** Their muscle, frame and reserve are guesses, not the user's choices. They are the honest levers if a unit proves too strong; stats stay physics-derived.
- **Next step, when wanted:** run the full arena matrix (`npm run arena`) to find the outliers.

## Parked ideas

- **Riders separate from mounts.** A generic `rider: { mass }` on any unit spec: a body riding another one. The rider's body swings hand weapons (sidearms), and its weight loads the mount's legs, while the mount's own body still drives charges, bites and couched lances. Right now a mount and its rider are one fused body, so a lynx lancer's sword swings with all 320 kg of lynx (96 damage, as much as the lance), and mounts run at unladen speeds (the lynx sprints at 20.6 m/s). Any faction's design would hit this, not just the lancer.
- **Mounts are mobs.** A bigger direction built on that: mounts come from the wild. Wildlife is farmed (tamed, herded, bred) for better mounts, and a lot of the game is about that. It's a major change; parked 2026-10-18.
