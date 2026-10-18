# VibeCraft

A browser RTS where every player vibecodes their own army, then brings it to an online match.

**Play it now:** http://mcscope.com/game/vibecraft/

![A Meadowfolk town centre at the start of a game](docs/screenshots/spectate.png)
![The arena: lynx lancers charge a block of macemen, with the matchup matrix alongside](docs/screenshots/arena.png)

You describe your faction in code: its units, buildings and techs, how they look, the land they come from and the animals that live there. You don't set the stats. The engine works out HP, speed, damage, carry capacity, calories and cost from each unit's body (mass, how that mass splits between muscle, frame and reserve, and the crystal it swings or throws) and from each building's materials. A giant is strong and also hungry, slow and expensive. That keeps factions nobody has playtested against each other fair.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # sim tests (vitest)
npm run typecheck
```

From the main menu:
- **Skirmish** plays against the AI.
- **Spectate** watches two AIs play.
- **Proving Grounds** tests an army against dummies.
- **Codex** shows every faction's tech tree.
- **Unit Lab** (`/lab.html`) shows how a body turns into stats.

Maps: Woodlands, Steppe (after AoE2's Arabia), Water Donut, Cliff Maze and Sunken Temple (after StarCraft's Lost Temple). Pick one in the menu; online, the host picks. They're generated in `src/sim/map.ts`, so adding one is a single function.

URL shortcuts: `?mode=skirmish&you=fenfolk&foe=meadowfolk&map=cliff-maze&seed=5&ai=easy`.

The AI comes in **Easy** and **Hard** (the default; pick it in the menu or with `?ai=`). Neither cheats: both see only what their own units and buildings see, and play by the same rules and commands as you. Hard thinks faster, runs a tighter economy, scouts and counters what it has seen, waits for a stronger army before attacking, and micro-manages its fights. Easy thinks every few seconds, reacts late, and attacks in small waves. `npm run aimatch` plays them against each other.

## Make your own army

1. **Brainstorm a concept.** Before any code, decide who your people are: where they live, what they eat, how they fight, what makes them strange. Frog-folk of the fens? Clockwork monks? A hive that grows its buildings? Pick a theme, a playstyle and one or two signature ideas, and skim [DESIGN_SPACE.md](DESIGN_SPACE.md) for abilities nobody has used yet. A clear concept makes every later choice easier: body shapes, buildings, art and land.
2. **Copy a faction.** Copy `src/factions/fenfolk/` (or `meadowfolk/`) to `src/factions/<yours>/`. Give it a new `id` and `name`, and rename its units and buildings.
3. **Register it.** Add it to `PLAYABLE` in `src/factions/index.ts`, and add it to the Codex in `src/codex.ts`.
4. **Shape the bodies.** A unit is `mass`, `physique: { muscle, frame, reserve }`, and optionally `attack: { style: 'strike' | 'throw', crystalMass, ammo, shaft }` (`shaft`: metres of spear for strikers, which adds reach and impales chargers; `sling`: metres of cord for throwers, a lever that speeds light stones up to what the muscle allows), and optionally `length` (metres nose to tail, for a long body that wheels round instead of pivoting). Change these and watch the Codex or Unit Lab update. `refinement` makes a unit cheaper to train, and techs raise it.
5. **Draw them.** Each unit and building has a `model(builder, pose)` built from primitives (boxes, spheres, limbs, joints). The game bakes models into lit isometric sprites on your machine. Copy an existing model to get started.
6. **Bring your land.** `homeworld.ts` sets the look of your half of the map: ground, trees, bushes and deposits. `wildlife.ts` lists the animals that roam it.
7. **Play it.** Run a skirmish against the built-in AI. The AI is generic: it reads your buildings and what they train.

Rules of the road:
- **A faction is self-contained.** Never import another faction's files. Shared helpers live in `src/kits/` and `src/biomes/`.
- **Don't add stats by hand.** If something should be stronger, give it a bigger body or better refinement. The physics prices it.
- **New behaviour is an engine ability.** If your idea needs something new (flying, burrowing, healing...), add it as a data-defined ability in `src/sim/abilities/`. Make it generic so any faction can switch it on, with a validation check and a Codex line. See [DESIGN_SPACE.md](DESIGN_SPACE.md) for abilities that already exist but no faction uses yet.

## Play online

Online games are 1v1. Each player runs their own copy of the game with their own faction. When the match starts, your faction (specs and baked art) travels to your opponent as data. Their client checks it against the rules, so you never need each other's code.

1. **Start the relay.** One person runs `npm run relay`, a tiny dependency-free WebSocket relay on port 5190.
   - On a LAN, everyone uses that machine's address.
   - Over the internet, run the relay somewhere public (a small VPS, or forward port 5190) and use `ws://<host>:5190`.
   - If the game is served over https, the relay needs `wss://`, for example behind a TLS proxy.
2. **Join.** Each player runs `npm run dev` (add `-- --host` to let others on the LAN reach your copy), opens **Online game**, and enters the relay address, the same room code, a name and their faction.
3. **Start.** The first player in the room is host and presses **Start**.

**Fairness.** Your opponent's client never trusts your numbers. It derives every stat and cost from your specs with its own physics, so a bundle can't claim cheaper units. Everyone starts from the same pool of resources (`START_POOL`). Your starting base and starting workers (`startWorkers`, default 5) are paid out of it, and whatever's left is your starting stock: a grand base means a lean start, and fewer workers means more stock. The client also bounds the few things the physics doesn't price, like the wildlife on your half (no map full of free game). The rules and their limits are in `src/sim/fairness.ts`. `npm test` holds your faction to the same rules, so you'll find out before your opponent does.

The game runs in deterministic lockstep: only commands go over the wire, and every client simulates the same world. Anything nondeterministic in the sim (`Math.random`, wall-clock time, iteration over unordered data) will desync a match. Use `world.rng`. `tests/determinism.test.ts` guards this.

## Layout

| Path | What's there |
|---|---|
| `src/factions/` | Factions: specs, models, homeworld, wildlife. `types.ts` documents every spec field. |
| `src/sim/` | The deterministic simulation: `world.ts`, `physics.ts` (body → stats), `logistics.ts`, `abilities/` |
| `src/ai/` | The skirmish AI (`skirmishAI.ts`, with its Easy/Hard profiles) and how it uses abilities (`abilities.ts`) |
| `src/render/`, `src/ui/` | PixiJS renderer, HUD and input |
| `src/kits/bake3d/` | three.js sprite baker for models |
| `src/net/` | Lockstep, relay client, faction bundles and their checks |
| `scripts/relay.mjs` | The relay server |
| `tests/` | Sim tests |
