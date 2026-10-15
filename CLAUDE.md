# VibeCraft: notes for AI coding agents

Read README.md first. This is a browser RTS: TypeScript, Vite, vitest; PixiJS renders, three.js bakes sprites.

- **Factions are self-contained** (`src/factions/<id>/`). A faction never imports another faction. Shared code goes in `src/kits/` or `src/biomes/`.
- **Stats come from physics.** Never hardcode HP, damage, speed or cost. Change the body (mass, physique, crystal) or refinement. Refinement makes units cheaper (cost ÷ r); it never adds stats.
- **Don't write one faction's design into engine rules.** New behaviour is a generic, data-defined ability in `src/sim/abilities/`, with a validation check and a Codex line. See DESIGN_SPACE.md.
- **The sim must be deterministic** (lockstep multiplayer): use `world.rng`, never `Math.random` or time in `src/sim/`.
- **Keep it simple.** If an area keeps breaking, redesign it simpler rather than adding special cases.
- **Before finishing:** run `npx tsc --noEmit -p .` and `npx vitest run`.
