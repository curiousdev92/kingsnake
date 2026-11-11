---
name: add-game-mode
description: Add or retune a KingSnake game mode in packages/game-modes, including ranked modes.
---

# Add a game mode

1. Create `packages/game-modes/src/<id>.ts` exporting a `GameMode`. Copy the shape of `duel.ts`. Give it its own `room` name.
2. Import it in `packages/game-modes/src/index.ts`, add it to `MODES` (menu order) and to the `export { duel, ffa }` line.
3. Extend `packages/game-modes/test/modes.test.ts`.

`apps/game-server/src/index.ts` registers every entry in `MODES`, plus a `<room>-queue` room for ranked ones, so no server change is needed.

Rules:

- `ArenaRoom` derives the mode from `this.roomName`. Never pick it from client options or use `filterBy(['mode'])`.
- `ranked: true` means public games go through `QueueRoom`. A match only counts as ranked with exactly two account holders, so a ranked mode with `maxPlayers` above 2 needs matchmaking and rating work.
- Duel-specific code exists outside this package. Before adding a ranked mode, check these files: `apps/api/src/players.ts`, `apps/game-server/src/meta.ts`, `apps/client/src/RankedUi.tsx`, `apps/client/src/AccountUi.tsx`.
- Different rules, rather than different tuning, need new optional hooks on `GameMode` and in game-core's `step`. See the `change-simulation` skill.

Then use the `verify` skill.
