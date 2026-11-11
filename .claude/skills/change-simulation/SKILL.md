---
name: change-simulation
description: Change KingSnake gameplay rules, tuning or bots in packages/game-core. Use for movement, collisions, pellets, arena shrink, SimConfig or bot AI.
---

# Change the simulation

Where things are in `packages/game-core/src`:

- `step.ts`: tick order and rules
- `snake.ts`: bodies
- `world.ts`: state creation, spawns, seeded `random(state)`
- `config.ts`: `SimConfig` defaults
- `bots.ts`: bot AI
- `spatialHash.ts`: collision broad phase

Rules:

- No I/O, rendering, dependencies, or `Math.random`.
- `step` must not mutate `prev`.
- New tunables go in `SimConfig` with a default in `config.ts`. Per-mode values go in the mode's `sim`, not in `step.ts`.
- New `GameState` fields must be copied by `cloneState`.

The local snake is predicted with this same code, so:

- A rule affecting movement of a lone snake flows into `Predictor` automatically.
- A new input or state the predictor must replay also needs `packages/netcode/src/Predictor.ts`.
- If clients need new per-snake data, use the `change-protocol` skill.

Add a test to `packages/game-core/test/core.test.ts`, then use the `verify` skill.
