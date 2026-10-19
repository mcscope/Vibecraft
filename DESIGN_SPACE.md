# Unexplored design space

The engine already supports these abilities, but no shipped faction uses them. They're left open on purpose, for new factions to build an identity around. Each one is a spec field: switch it on in your faction and the engine handles the behaviour, the online-bundle check, the Codex line and the AI. Code lives in `src/sim/abilities/`, the AI side in `src/ai/abilities.ts`, and tests in `tests/` (using test-only specs from `tests/kit.ts`).

| Ability | Field | What it does | Ideas |
|---|---|---|---|
| **Flight** | unit `flight: true` | Walks short hops; takes off to go further and flies straight over walls, water and buildings at 1.6× speed. It burns calories every second aloft (∝ mass, so endurance comes from how much of the body is reserve) and lands when it stops or runs low, with enough left to walk home. In the air only thrown crystals and towers reach it, and it sees 3 tiles further. Melee fliers land to strike. | War-eagles, bats, gliders, a light scout cavalry that can't hold ground |
| **Living building** | building `living: { seed, grow }` | Planted at `seed` × its materials, then eats food from its stock to grow `grow` kg/s up to full size. HP and capital grow with it, so a young one can only train units its current size can support. Haulers bring it food. | Hives, coral, fungal mounds, a tree that becomes a fortress |
| **Food bearer** | unit `bearer: { radius, resource: 'food' }` | A walking larder: hungry units within reach eat from it instead of walking home. It loads up at buildings, comes out of training loaded, and gathers only food. (The crystal ammo bearer is the same ability with the default resource.) | Supply wagons, a camel train, a hive's nurse caste that feeds the swarm in the field |
| **Walking drop-off** | unit `dropOff: true` | Gatherers unload into it when it's nearer than a building, and it carries the haul home. | Pack beasts, a mobile camp, a mothership |
| **Road** | building `road: { speed }` (size 1) | Laid underfoot and blocks nothing. Anyone on it, enemies included, moves `speed`× (1–2) as fast for fewer calories; wheels gain twice as much. | A cart-heavy trade faction, Roman roads, slime trails |
| **Conveyor belt** | building `conveyor: { speed }` (size 1) | Laid underfoot. Gatherers unload onto any tile of a belt that touches one of your buildings, and the goods ride to it at `speed` tiles/s. A broken belt drops its cargo. | Factory folk, ant trails, rivers that carry goods |
| **Taming** | unit `tamer: true` | Feeds a wild animal food from its pack (0.15 kg per kg of animal) until it joins you. Passive animals take food right away; fierce ones must be worn below 40% HP first. Tamed passive animals can be butchered for meat. | Herders, beast-masters, druids |
| **Metamorphosis** | unit `becomes: ['unit-id', …]` | Changes where it stands into one of those forms of its own side, a trade rather than a training: it pays only the difference in food (the new form's price less its own), eaten as it changes from its pack, a food bearer in reach or a building beside it, and waits when there's nothing to eat. It takes 6 s × the new form's refinement, plus the time to grow any extra body (training's 1/12 s per kg), and needs no building, so time pays for refinement instead of capital. Each form can be at most 1.0 more refined than the one it grows from. It can't move or fight while changing. | A faction with few buildings that grows its elites in the field: tadpoles into frogs, squires into knights, larvae into a brood |
| **Spawning** | unit `spawns: ['unit-id', …]` | The same, except the parent stays: it grows a new unit beside it, paying that unit's whole price in food over 6 s × its refinement plus the time to grow its whole body. It can't spawn anything more refined than itself, since refinement climbs only by changing. | A brood queen, a mother tree dropping saplings, a war camp that musters recruits |
| **Pen** | building `pen: { radius }` | Pairs of your tamed animals within `radius` breed young, paid for from the pen's food. | Ranchers, a faction whose army is entirely bred |

Already used by shipped factions, for reference: `flight` (Fenfolk Siege Heron), `gait` (Fenfolk hop), `bearer` (Pack Tortoise ammo carrier), `wall` (Fenfolk canal), `gatherBoost` and `sow` (Meadowfolk gathering camp), `wheeled`, `workRefinement`.

**Still to work out:**
- Abilities are free beyond body physics. A flier pays in calories and a bearer in cargo, but nothing yet prices an ability itself.
- Newborn animals spawn at full size.
- A belt only carries goods to the nearest building it touches.
- The AI doesn't build roads.

## Adding a new ability

1. Add the spec field to `UnitSpec` or `BuildingSpec` in `src/factions/types.ts`, with a doc comment.
2. Make one module in `src/sim/abilities/`. It holds the behaviour, `validateUnit`/`validateBuilding` (online bundles are checked on arrival) and `unitCodex`/`buildingCodex` (one line of Codex text). Register it in `ABILITIES` in `abilities/index.ts`.
3. Hook the sim at the smallest point that works, and keep it deterministic.
4. If the AI should use it, add a routine to `src/ai/abilities.ts` that does nothing for factions without it.
5. Test it with a test-only spec (`tests/kit.ts`).
