# Unexplored design space

The engine already supports these abilities, but no shipped faction uses them. They're left open on purpose, for new factions to build an identity around. Each one is a spec field: switch it on in your faction and the engine handles the behaviour, the online-bundle check, the Codex line and the AI. Code lives in `src/sim/abilities/`, the AI side in `src/ai/abilities.ts`, and tests in `tests/` (using test-only specs from `tests/kit.ts`).

| Ability | Field | What it does | Ideas |
|---|---|---|---|
| **Flight** | unit `flight: true` | Takes off to move and flies straight over walls, water and buildings at 1.6× speed. It burns calories every second aloft (∝ mass², so only light bodies stay up long) and lands when it stops. In the air only thrown crystals and towers reach it, and it sees 3 tiles further. Melee fliers land to strike. | War-eagles, bats, gliders, a light scout cavalry that can't hold ground |
| **Living building** | building `living: { seed, grow }` | Planted at `seed` × its materials, then eats food from its stock to grow `grow` kg/s up to full size. HP and capital grow with it, so a young one can only train units its current size can support. Haulers bring it food. | Hives, coral, fungal mounds, a tree that becomes a fortress |
| **Walking drop-off** | unit `dropOff: true` | Gatherers unload into it when it's nearer than a building, and it carries the haul home. | Pack beasts, a mobile camp, a mothership |
| **Road** | building `road: { speed }` (size 1) | Laid underfoot and blocks nothing. Anyone on it, enemies included, moves `speed`× (1–2) as fast for fewer calories; wheels gain twice as much. | A cart-heavy trade faction, Roman roads, slime trails |
| **Conveyor belt** | building `conveyor: { speed }` (size 1) | Laid underfoot. Gatherers unload onto any tile of a belt that touches one of your buildings, and the goods ride to it at `speed` tiles/s. A broken belt drops its cargo. | Factory folk, ant trails, rivers that carry goods |
| **Taming** | unit `tamer: true` | Feeds a wild animal food from its pack (0.15 kg per kg of animal) until it joins you. Passive animals take food right away; fierce ones must be worn below 40% HP first. Tamed passive animals can be butchered for meat. | Herders, beast-masters, druids |
| **Pen** | building `pen: { radius }` | Pairs of your tamed animals within `radius` breed young, paid for from the pen's food. | Ranchers, a faction whose army is entirely bred |

Already used by shipped factions, for reference: `gait` (Fenfolk hop), `bearer` (Pack Tortoise ammo carrier), `wall` (Fenfolk canal), `gatherBoost` and `sow` (Meadowfolk gathering camp), `wheeled`, `workRefinement`.

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
