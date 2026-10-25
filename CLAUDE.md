# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Snake Arena: a realtime multiplayer, Slither-style snake game (last snake alive wins) for web, Android and iOS, all in TypeScript. `PLAN.md` is the source of truth for design decisions and build order; `ART_SPEC.md` defines asset naming and 9-slice conventions. Read the relevant PLAN.md section before starting a new piece of work.

## Commands

pnpm 12 + Turborepo. Run from the repo root.

```bash
pnpm install
pnpm dev                 # client (http://localhost:5173) + game-server (ws://localhost:2567)
pnpm dev:client          # client only (offline sandbox, #ui gallery)
pnpm test                # all Vitest suites via turbo
pnpm typecheck           # tsc --noEmit in every package
pnpm build
```

Single package or test:

```bash
pnpm --filter @snake/game-core test
pnpm --filter @snake/game-core exec vitest run -t "head-to-head"
pnpm --filter @snake/game-core exec vitest        # watch mode
```

Client routes: `/` offline sandbox, `#online` online play (`?bots=7` adds bots so one player can start, `?name=`, `?server=ws://…`), `#ui` component gallery. To test two players, open `#online` in two tabs. Background tabs stop requestAnimationFrame, so they stop rendering (network still runs on timers).

The game-server integration test (`apps/game-server/test/room.integration.test.ts`) boots a real Colyseus server on a random port and connects SDK clients; it takes about 7 s.

There is no lint setup yet. pnpm 12 blocks dependency build scripts; `allowBuilds` in `pnpm-workspace.yaml` allows esbuild and denies `msgpackr-extract` (optional native addon). Depend on `@colyseus/core` + `@colyseus/ws-transport`, not the `colyseus` meta-package: it pulls a git-hosted uWebSockets.js that pnpm's `blockExoticSubdeps` rejects. The client SDK is `@colyseus/sdk` (0.18), not `colyseus.js`.

## Architecture

Packages export TypeScript source directly (`"main": "src/index.ts"`); there is no per-package build step. Vite and tsc consume the source. All packages extend `packages/config/tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, so use `import type` for types).

### packages/game-core: the simulation
Pure TS, zero dependencies, no I/O, no rendering. It will be reused for server authority, client prediction, bots, replays and tests, so it must stay that way.

- `step(prev, inputs, cfg)` in `step.ts` advances one fixed `cfg.dt` (30 Hz). It deep-clones `prev` (`cloneState`) and never mutates it. Order per tick: turn and move each snake (boost burns mass into tail pellets) → shrink arena → eat pellets → find deaths (arena, head-to-head, head-to-body) → drop dead bodies as pellets → respawn pellets → check winner.
- `state.events` only holds events from the most recent step (eat/death/win). Consumers must read them after each step.
- Bodies: `path` is the head's trail (oldest first, trimmed to the length mass allows); `segments` are resampled from it every tick at `segmentSpacing`, index 0 is the head. Because a segment index means a fixed distance behind the head, the renderer interpolates segments index-by-index between two states.
- A snake's own body never collides with it. Head-to-head behaviour comes from `cfg.headToHead`.
- All randomness goes through the seeded PRNG stored in `state.seed` (`random(state)` in `world.ts`). Never use `Math.random` in game-core; the tests check determinism.
- Tunables live in `SimConfig` (`config.ts`); use `makeConfig(overrides)`. The client mutates the config live for feel tuning.
- `botInput` / `botInputs` (`bots.ts`) are pure functions of the state: they score a fan of headings by danger (bodies, arena edge) and food.
- Collision broad phase uses `SpatialHash`, rebuilt every tick and stored as module-level scratch.

### packages/design-tokens, assets, ui-kit: the design system
- `Theme` is the token contract; `themeMono` is the Phase 1 black-and-white theme. `applyTheme` writes CSS variables (`color.accent` → `--color-accent`); components reference them with `token('color.accent')`, never raw values. Adding a token means updating both the `Theme` interface and every theme.
- `packages/assets/assets.manifest.ts` maps typed asset names (`NineSliceName`, `IconName` in `src/types.ts`, mirroring ART_SPEC.md sections 4-5) to files. It is empty in Phase 1. Every lookup (`getNineSlice`, `getIcon`, `skinFor`) returns `undefined` when art is missing, and callers must fall back.
- Every ui-kit component resolves its art as: explicit `skin` prop → manifest entries under its prefix (e.g. `button.primary.*`, `panel.inset.*`) → token-based CSS (`resolveSkin` / `nineSliceStyle` in `skin.ts`). `Icon` falls back to a text glyph. So art drops in by editing the manifest only, with no screen code changes.
- Motion durations and easings come from `motion.*` tokens; `motion.ts` has `useCountUp` and the shared keyframes.
- `http://localhost:5173/#ui` is a gallery of every component, with a "Try demo art" toggle that swaps in a generated SVG manifest to check skinning.

### Networking: protocol, game-server, netcode
The server is authoritative. Hot-path traffic is custom binary over Colyseus `sendBytes`/`onMessageBytes`; Colyseus Schema state is not used. Only the match lifecycle goes as JSON (`'match'` message, `MatchMsg`).

- `packages/protocol` (`messages.ts`): codecs for `Input` and `Ping` (client→server) and `Snapshot`, `Events` and `Pong` (server→client). Positions are i16 at 1/8 unit, angles u16. `ByteReader` honours `byteOffset`, because transports hand over subarrays.
- Snapshots (every tick, 30 Hz, unreliable in spirit) carry each living snake's head, angle, mass and boost. Bodies are sent only as keyframes: everyone on a client's first snapshot after join, reconnect or match start (`needsFull`), plus one per snake every 30 ticks, staggered by id. A snake missing from a snapshot is dead.
- Events (reliable) carry pellet adds/removes (diffed from consecutive states in `Match.diff`) and deaths. `reset: true` means "replace all pellets"; it is sent on join and at match start.
- `apps/game-server`: `Match.ts` is the Colyseus-free core. It owns the `GameState`, a per-player input queue and fixed tick timing against server time (`tickTime`, catch-up capped at 8 steps). It also turns state into protocol messages. Inputs are applied **exactly one per tick, in order** (the last one repeats when the queue is empty; at most 4 queued), and `lastSeq` is the last input *applied*. Prediction depends on this lockstep: applying "the latest input" instead caused a constant one-tick prediction error. `ArenaRoom.ts` runs the lifecycle waiting → countdown (3 s) → playing → ended (5 s) → waiting. A room starts at `minPlayers` humans (default 2), or at 1 when created with `bots`; rooms are `filterBy(['bots', 'minPlayers'])`. Dropped clients get 10 s to reconnect. A leaver's snake is handed to the bot AI (`convertToBot`).
- `packages/netcode`: `ClockSync` (min-RTT ping samples), `SnapshotBuffer` (interpolation with capped extrapolation), `NetworkSimulator` (per direction; reliable messages are delayed but kept in order and never dropped, unreliable ones can be dropped or reordered) and `RemoteWorld`. `RemoteWorld` rebuilds bodies by appending each snapshot's head to a path and resampling it with game-core's `sampleSegments`; keyframes replace the path. Pellet and death events are applied only when render time reaches them.
- `Predictor` (netcode): the local snake is predicted on a one-snake game-core world, one `step` per input sent. On each snapshot it rebases on the server's head, angle and mass plus the `RemoteWorld` path, then replays inputs with `seq > lastSeq`. The jump from old to new prediction becomes an offset that decays over `smoothingMs` (above `snapDistance` = 60 it snaps). Eating, collisions and death are not predicted: the server's snapshots and events decide. With zero simulated loss the prediction matches the server exactly; `prediction.test.ts` checks this at 1, 3 and 6 ticks of latency.
- `AdaptiveDelay` (netcode): the interpolation delay is the 95th percentile of measured snapshot transit (`serverNow - snapshot.serverTime` at arrival) plus one snapshot interval, slewed slowly. Render time is server-time based, so a fixed delay shorter than the one-way latency means constant extrapolation.

### apps/client: Pixi + React shell
- `game/Sandbox.ts` (offline) runs a fixed-step accumulator on the Pixi ticker, calling `step()` with player and bot inputs, then `Renderer.render(prev, cur, alpha)` at display rate.
- `game/OnlineGame.ts` (online): client ticks come from a 30 Hz accumulator against `performance.now()`, woken by a 5 ms `setInterval`, so they never drift. Each tick samples input, sends it and steps the `Predictor`. Rendering runs on the Pixi ticker: everyone else is interpolated at `serverNow - interpDelayMs`, and the own snake comes from the predictor (the same object goes in both render states, so the renderer's lerp is a no-op for it). All traffic goes through the two `NetworkSimulator`s. The Net panel controls them, plus prediction on/off, auto/manual interp delay and correction smoothing, and shows RTT, snapshots/s, kbps, interp delay and prediction error.
- `game/PlayerInput.ts` is the shared mouse/keyboard → `Input` mapping.
- `game/Renderer.ts` draws any `RenderWorld` (game-core `GameState`, or a netcode `WorldView` plus pellets) with Pixi v8 `Graphics`, rebuilt every frame (placeholder white circles). The camera keeps the focused head at the screen center, which is why steering uses the pointer's offset from the center.
- React (`App.tsx`, `OnlineApp.tsx`) is the UI layer only. HUD stats go through Zustand stores. The Tune panel edits `sandbox.cfg` live; online, the server sends its `SimConfig` in `MatchMsg`.

## Constraints from PLAN.md
- `game-core`, `netcode` and `protocol` must not depend on the transport (Colyseus is only in `apps/game-server` and `OnlineGame.ts`). If Colyseus fights the custom netcode, PLAN.md allows replacing it with a thin `ws` server.
- Planned but not yet created: `apps/api`, `packages/game-modes`. A new game mode should be one file in `game-modes`.
- Cosmetics only, no pay-to-win. Rewards are granted server-side; the client never claims them.
- Original art only. Snake skins are data (atlas + config), not code.
