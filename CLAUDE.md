# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

KingSnake: a realtime multiplayer, Slither-style snake game (last snake alive wins) for web, Android and iOS, all in TypeScript. `PLAN.md` is the source of truth for design decisions and build order; `ART_SPEC.md` defines asset naming and 9-slice conventions. Read the relevant PLAN.md section before starting a new piece of work.

## Commands

pnpm 12 + Turborepo. Run from the repo root.

```bash
pnpm install
pnpm dev                 # client (:5173) + game-server (ws :2567) + api (:3000)
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

Client routes: `/` offline sandbox; `#online` the online menu (Quick play, Create private room, Join by code); `?room=CODE#online` joins a private room directly (the invite link); `?server=ws://…` overrides the server URL; `#ui` component gallery. To test two players, create a private room in one tab and open its invite link in another. Both tabs share the saved name (localStorage `snake.name`). Background or hidden tabs stop requestAnimationFrame, so they stop rendering and applying events (network still runs on timers).

The game-server integration test (`apps/game-server/test/room.integration.test.ts`) boots a real Colyseus server on a random port and connects SDK clients. It covers quick play with bot fill, locking, private rooms, host-only controls and bad codes, and takes a few seconds.

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
- `apps/game-server`: `Match.ts` is the Colyseus-free core. It owns the `GameState`, a per-player input queue and fixed tick timing against server time (`tickTime`, catch-up capped at 8 steps). It also turns state into protocol messages. Inputs are applied **exactly one per tick, in order** (the last one repeats when the queue is empty; at most 4 queued), and `lastSeq` is the last input *applied*. Prediction depends on this lockstep: applying "the latest input" instead caused a constant one-tick prediction error. `ArenaRoom.ts` runs the lifecycle waiting → countdown → playing → ended (5 s) → waiting. There are two kinds of room, both registered as `'arena'`:
  - **Public** (`joinOrCreate('arena')`): the first player starts a 10 s lobby countdown (cut to 3 s when the room fills to `ROOM_SIZE` = 8). The match then starts with bots filling the empty slots up to 8 (`names.ts` has the bot names). The room `lock()`s while playing so matchmaking sends newcomers to a fresh room, and unlocks afterwards.
  - **Private** (`create('arena', { private: true })`): `roomId` is a 5-character code (`roomCode()`, no 0/O/1/I/L) and `setPrivate(true)` hides it from matchmaking. Clients join with `joinById(code)`. The first joiner is host (it passes to the next player if they leave). The host sends `'settings'` `{ bots }` and `'start'` (3 s countdown) while waiting; messages from anyone else, or in other phases, are ignored. The room never locks, so late joiners spectate until the next match.
  - Lobby state reaches clients in `MatchMsg.lobby` (`LobbyInfo`, built per recipient). Timings live in the exported `timing` object; they are deliberately not create options, because clients control those. The integration test shortens them.
  - Dropped clients get 10 s to reconnect. A leaver's snake is handed to the bot AI (`convertToBot`).
- Spawns: `createGame` puts players evenly on a ring at 0.6 × the arena radius, all facing along the ring in the same direction. Facing the center made every match open with a pile-up.
- The client must call `PlayerInput.resetAim(spawnAngle)` at the start of each life (`OnlineGame` does it on the first snapshot of a life). Otherwise the default aim (angle 0, east) or a stale pointer from the menu steers the new snake into the wall before the player touches the mouse.
- `packages/netcode`: `ClockSync` (min-RTT ping samples), `SnapshotBuffer` (interpolation with capped extrapolation), `NetworkSimulator` (per direction; reliable messages are delayed but kept in order and never dropped, unreliable ones can be dropped or reordered) and `RemoteWorld`. `RemoteWorld` rebuilds bodies by appending each snapshot's head to a path and resampling it with game-core's `sampleSegments`; keyframes replace the path. Pellet and death events are applied only when render time reaches them.
- `Predictor` (netcode): the local snake is predicted on a one-snake game-core world, one `step` per input sent. On each snapshot it rebases on the server's head, angle and mass plus the `RemoteWorld` path, then replays inputs with `seq > lastSeq`. The jump from old to new prediction becomes an offset that decays over `smoothingMs` (above `snapDistance` = 60 it snaps). Eating, collisions and death are not predicted: the server's snapshots and events decide. With zero simulated loss the prediction matches the server exactly; `prediction.test.ts` checks this at 1, 3 and 6 ticks of latency.
- `AdaptiveDelay` (netcode): the interpolation delay is the 95th percentile of measured snapshot transit (`serverNow - snapshot.serverTime` at arrival) plus one snapshot interval, slewed slowly. Render time is server-time based, so a fixed delay shorter than the one-way latency means constant extrapolation.

### Accounts and rewards: apps/api, packages/meta, packages/auth
- `packages/meta` is pure shared data and rules: the skin catalog (`SKINS`; a skin is a colour palette until atlases exist), the level curve, `matchReward`, the daily streak rules, the `Profile`/`Grant`/`MatchReport` types and `sanitizeName`. The API, game-server and client all use it, so prices and formulas live in one place.
- `packages/auth`: HS256 player tokens (`jose`), signed by the API and verified by both the API and the game-server with `AUTH_SECRET`. `INTERNAL_KEY` guards server-to-server calls. Both have dev defaults and throw in production if unset.
- `apps/api` (Fastify): `buildApp` in `app.ts` holds the routes and `players.ts` the domain logic. The routes:
  - `POST /auth/guest`, `GET`/`PATCH /me`, `POST /me/daily`, `POST /me/season-reward`, `GET /leaderboard`, `GET /shop`, `POST /shop/buy`, `POST /me/equip`.
  - Game-server only, behind `x-internal-key`: `GET /internal/players/:id` and `POST /internal/match-results`.
- Only guest accounts exist. A future Google/Apple/Supabase sign-in should exchange the provider token for the same player token, so the game-server never sees providers.
- Database: plain SQL through the small `Db` interface (`db.ts`), with append-only `MIGRATIONS`. It is real Postgres via `pg` when `DATABASE_URL` is set, otherwise embedded PGlite (Postgres in WASM) at `apps/api/.data/pglite` (gitignored); tests use in-memory PGlite. Select `date` columns `::text` (driver Date parsing is timezone-dependent). Money paths (`buy`, `claimDaily`, `recordMatch`) run in transactions with `SELECT … FOR UPDATE`.
- Rewards are server-authoritative. At match end `ArenaRoom.reportResults` sends placements, kills and survival (from `Match.results()`) for account holders to the API through `ArenaRoom.meta` (a `MetaService`; tests swap in a fake). The API grants XP and coins at most once per `(matchId, playerId)`. The game-server forwards each grant as a `'rewards'` message. Players who left mid-match are still paid.
- Game-server join: `onAuth` verifies `options.token` (a bad or missing token means an anonymous player, never a rejection). `onJoin` looks up the account's name and equipped skin. Skins travel in `RosterEntry.skin`; bots get random ones. If the API is down, everyone plays anonymously.

### Game modes, ranked queue and seasons
- `packages/game-modes`: a `GameMode` is data (`room` name, `maxPlayers`, `maxPrivateSnakes`, `ranked`, `sim` overrides for `SimConfig`). A new mode is one file plus a line in `MODES`. Rule hooks (per-tick, win checks) don't exist yet; add them to `GameMode` and game-core's `step` when a mode needs different rules.
- Each mode has its own Colyseus room name (`'arena'` is free-for-all, `'duel'`), and `ArenaRoom` derives the mode from `this.roomName`, never from client options. Using one name with `filterBy(['mode'])` let clients that omitted `mode` land in duel rooms.
- Ranked modes (`mode.ranked`) matchmake public games through `QueueRoom` (`<room>-queue`, e.g. `'duel-queue'`). It pairs by rating every 500 ms (`pairPlayers` in `matchmaking.ts`: closest rating within a window that widens with waiting time, anyone after 30 s), creates the match room with `{ queued: QUEUE_SECRET }` and sends each player a seat reservation (`'matched'`), which the client consumes. Public ranked rooms refuse creation without the secret and are `setPrivate` so `joinOrCreate` can't find them. Private rooms of a ranked mode work normally and are never rated.
- A match is reported `ranked` only when it is a public ranked room with exactly two snakes that are both account holders. The API then applies Elo (`@snake/meta` `rating.ts`, K = 32, floor 100) in the same transaction as the rewards, idempotently.
- Seasons (`@snake/meta` `season.ts`) are UTC calendar months (`YYYY-MM`). Ratings live in `season_ratings`, one row per season and player, created on their first ranked match at a soft reset halfway between last season's rating and 1000. Last season's reward (coins by rating tier) is offered in `Profile.seasonReward` and claimed once with `POST /me/season-reward`. `GET /leaderboard?season=` returns the top 50 plus the viewer's own line. Testing ranked in two tabs needs two accounts: tabs share `snake.token`, and a duel against yourself is never rated.

### apps/client: Pixi + React shell
- `account.ts` holds the account state (Zustand `useAccount`): it creates a guest on first launch and keeps the token in localStorage (`snake.token`). The game stays playable when the API is unreachable (`status: 'offline'`). `AccountUi.tsx` has the profile card (level, XP bar, coins), the daily reward and the shop modal. `Renderer.setSkins(map)` paints snakes by skin palette.
- `game/Sandbox.ts` (offline) runs a fixed-step accumulator on the Pixi ticker, calling `step()` with player and bot inputs, then `Renderer.render(prev, cur, alpha)` at display rate.
- `game/OnlineGame.ts` (online): client ticks come from a 30 Hz accumulator against `performance.now()`, woken by a 5 ms `setInterval`, so they never drift. Each tick samples input, sends it and steps the `Predictor`. Rendering runs on the Pixi ticker: everyone else is interpolated at `serverNow - interpDelayMs`, and the own snake comes from the predictor (the same object goes in both render states, so the renderer's lerp is a no-op for it). All traffic goes through the two `NetworkSimulator`s. The Net panel controls them, plus prediction on/off, auto/manual interp delay and correction smoothing, and shows RTT, snapshots/s, kbps, interp delay and prediction error.
- `game/PlayerInput.ts` is the shared mouse/keyboard → `Input` mapping.
- `game/Renderer.ts` draws any `RenderWorld` (game-core `GameState`, or a netcode `WorldView` plus pellets) with Pixi v8 `Graphics`, rebuilt every frame (placeholder white circles). The camera keeps the focused head at the screen center, which is why steering uses the pointer's offset from the center.
- React (`App.tsx`, `OnlineApp.tsx`) is the UI layer only. HUD stats go through Zustand stores. The Tune panel edits `sandbox.cfg` live; online, the server sends its `SimConfig` in `MatchMsg`.

## Constraints from PLAN.md
- `game-core`, `netcode` and `protocol` must not depend on the transport (Colyseus is only in `apps/game-server` and `OnlineGame.ts`). If Colyseus fights the custom netcode, PLAN.md allows replacing it with a thin `ws` server.
- Planned but not yet created: Redis (sessions; leaderboards run on Postgres until they need it), real sign-in providers, missions and season pass. WebTransport is out of scope.
- Cosmetics only, no pay-to-win. Rewards are granted server-side; the client never claims them.
- Original art only. Snake skins are data (atlas + config), not code.
