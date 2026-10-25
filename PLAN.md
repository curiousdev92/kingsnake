# Snake Arena: Project Plan (Slither-style)

Realtime multiplayer snake game for web, Android and iOS. Snakes move continuously (free angles, smooth turning, boost) like Slither.io. Last snake alive in the room wins.
Priorities: clean, maintainable, buttery smooth, beautiful and rewarding.

## 1. Core decisions

- **One language: TypeScript** across client, server and shared logic.
- **Cross-platform:** build once for web (Vite + PixiJS), ship Android/iOS with **Capacitor**.
- **Movement:** continuous, not grid-based. A snake has a head position, a heading angle and a speed. Steering sets a target angle; the snake turns toward it at a limited turn rate. The body is a trail of segments that follow the path of the head.
- **Boost:** hold to move faster at the cost of body length (dropping pellets behind you). Dying drops your body as pellets.
- **Netcode:** authoritative server with client-side prediction for your own snake and entity interpolation for the others (see section 5).
- **Room size:** 8 players by default (stretch: 12-16), with bot fill-ins. The arena is a circle scaled to the player count and shrinks over time, so every match ends with one winner.
- **Economy:** cosmetics only, no pay-to-win.

## 2. Tech stack

| Layer | Choice |
|---|---|
| Rendering | PixiJS (WebGL): mesh-rope snake bodies, batched pellets |
| UI shell | React + Zustand |
| Mobile | Capacitor (haptics, push, IAP plugins) |
| Realtime server | Colyseus (Node): rooms, matchmaking, reconnection. Hot-path game snapshots use custom compact binary messages, not Schema state |
| Meta API | Fastify (or NestJS): profiles, rewards, shop, friends, leaderboards |
| Database | PostgreSQL + Redis |
| Auth | Supabase Auth or Firebase Auth (guest, Google, Apple) |
| Hosting | Docker on Fly.io, multi-region |
| Tooling | pnpm + Turborepo, Vitest, Playwright, GitHub Actions |

Transport is WebSocket (Slither.io itself uses it). WebTransport is out of scope.

Fallback note: if custom snapshot netcode fights the Colyseus framework, replace Colyseus with a thin `ws`/uWebSockets.js server plus our own room manager. `game-core`, `netcode` and `protocol` do not change.

## 3. Monorepo structure

```
snake/
├─ apps/
│  ├─ client/          # Vite app: Pixi game view + React UI (web + Capacitor)
│  ├─ game-server/     # Colyseus rooms, matchmaking, tick loop, bots
│  └─ api/             # Accounts, rewards, shop, friends, leaderboards
├─ packages/
│  ├─ game-core/       # Pure TS simulation. Zero dependencies, no I/O
│  ├─ netcode/         # Snapshot buffers, interpolation, prediction + reconciliation, clock sync
│  ├─ game-modes/      # Rule plugins: FreeForAll, Duel, Teams, Custom
│  ├─ protocol/        # Binary message codecs and schemas shared by client/server
│  ├─ design-tokens/   # Theme definitions (see section 8)
│  ├─ ui-kit/          # Skinnable components (see section 8)
│  ├─ assets/          # Asset manifest, atlases, 9-slice images (see section 8)
│  └─ config/          # ESLint, tsconfig, etc.
└─ infra/              # Dockerfiles, fly.toml, CI
```

Rule: `game-core` is `step(state, inputs, dt) -> nextState` with a fixed `dt`. No networking, rendering or I/O. It is reused for server authority, client prediction, bots, replays and tests.

## 4. game-core (continuous simulation)

State: `snakes[]`, `pellets[]`, `arena { center, radius, targetRadius }`, `tick`.

Snake: `id`, `head {x, y}`, `angle`, `targetAngle`, `speed`, `boosting`, `mass`, `path` (ring buffer of recent head positions), derived `segments` (sampled along `path` at a fixed spacing), `radius` (grows slowly with mass), `alive`.

Per fixed step (server sim 30 Hz):
1. Turn `angle` toward `targetAngle`, limited by `maxTurnRate` (smaller for bigger snakes).
2. Move forward by `speed * dt` (boost multiplies speed and burns mass, dropping pellets).
3. Push the new head position into `path`; trim the path to the length the mass needs.
4. Eat pellets within reach (spatial hash lookup); grow.
5. Collisions: head circle vs other snakes' segment circles (spatial hash). Head-to-body kills the mover. Head-to-head follows the mode setting (`both-die` or `bigger-wins`).
6. Arena: leaving the circle or standing in the storm zone kills (or damages) the snake.
7. Deaths drop the body as pellets; the mode checks for a winner.

Use fixed-step integration only, and keep float math simple (add, multiply, `atan2`, `sin`, `cos`). Prediction does not need bit-exact determinism because the server corrects it.

## 5. Netcode (the part that makes it buttery)

- **Client to server:** `{ seq, targetAngle, boost }` at ~30 Hz (or on change plus a heartbeat).
- **Server to client:** snapshots at 20-30 Hz. Per snake: head position, angle, speed, mass, boost flag. The body is not resent every tick: the client rebuilds it by following the head path, with periodic full-body keyframes (about every 1-2 s) and a full body when a snake enters view. Pellets are sent as spawn/eaten events, deaths as events.
- **Your own snake:** client-side prediction. The client runs the same `game-core` on your input immediately. When a server snapshot arrives with `lastProcessedSeq`, the client replays unacknowledged inputs on top of it. Small errors are blended out over ~100 ms; large errors snap.
- **Other snakes:** entity interpolation. Render ~100 ms in the past, interpolating heads between two snapshots, then rebuild bodies from the interpolated head path. Limited extrapolation if a snapshot is late.
- **Clock sync:** ping/pong estimates the server time offset.
- **Encoding:** quantized binary (positions as 16-bit relative to the arena, angles as 8-16 bit). 8 snakes is tiny; interest management is only needed for larger rooms.
- **Fairness:** the server alone decides kills, speed, turn rate and boost cost (clamped, anti-cheat). Never trust client positions.
- **Dev tool:** a network simulator (latency, jitter, packet loss) built into the client from day one. Tune feel at 100-200 ms and 2-5% loss, not on localhost.

## 6. Game modes

```ts
interface GameMode {
  config: {
    maxPlayers: number;
    tickRate: number;
    arena: { baseRadius: number; perPlayer: number; shrinkSchedule: ShrinkStep[] };
    teams: boolean;
    headToHead: 'both-die' | 'bigger-wins';
  };
  onTick(state): void;
  onPlayerDied(state, player): void;
  checkWinner(state): WinResult | null;
}
```

- Free-for-all (last alive wins): default
- 1v1 Duel: `maxPlayers: 2`, smaller arena, ranked ELO queue
- Play with friends: private room with join code or invite link, any mode
- Later: teams, timed score mode, endless Slither-style mode, power-ups

A new mode is one new file; no changes to networking or rendering.

## 7. Client: rendering, camera, controls

- **Rendering:** Pixi `MeshRope` (or a chain of overlapping sprites) along the smoothed body path. Pellets in a batched container. Glow and particles for boost, eating and death.
- **Camera:** follows your head, zooms out gradually as you grow.
- **Web controls:** steer toward the mouse pointer (or WASD/arrows); click or Space to boost.
- **Mobile controls:** floating joystick or touch-direction for steering, a dedicated boost button, haptics on eat/kill/death.
- Render loop runs at display rate (60/120 fps), independent of the 30 Hz simulation.

## 8. Design system (set up from day 1, art comes later)

Goal: a bold, glossy, chunky "mobile game" look using graphical assets for UI elements. Use only original art; do not copy another game's assets or characters.

**Phase 1 (now):** plain black and white theme, no art.
**Phase 2 (later):** drop in artwork. No screen or game code changes.

How:

1. **Semantic tokens** in `packages/design-tokens`. Components never use raw values. Examples: `color.surface`, `color.accent`, `color.textOnAccent`, `radius.panel`, `space.md`, `font.display`, `motion.pop`, `shadow.button`. A theme is one file implementing the token contract. Ship `theme.mono` (black and white) first.
2. **Skinnable components** in `packages/ui-kit`: Button, Panel, Modal, Chip, ProgressBar, Badge, Tab, IconButton, CurrencyPill. Each reads tokens and an optional `skin`. With no skin they render as simple CSS (white border, black fill).
3. **9-slice skins.** A skin maps a component state to a 9-slice image (fixed corners, stretchable edges), e.g. `button.primary.normal / pressed / disabled`, so chunky framed art scales to any size.
4. **Asset manifest** in `packages/assets/assets.manifest.ts`: a typed map from asset name (`button.primary.normal`, `icon.coin`, `frame.avatar`) to file path. Every lookup falls back to the placeholder style, so missing art never breaks the app.
5. **Texture atlases** for the canvas (snake skins, pellets, effects). A snake skin is data (atlas + config), not code. Until art exists, snakes render as plain white circles/rope.
6. **Animation tokens** for UI motion: pop-in, button squash, reward chest-open, number count-up. Durations and easings live in tokens.
7. **Art pipeline notes:** export at 1x/2x/3x, pack atlases with a tool such as free-tex-packer, keep source art outside the repo or in Git LFS. See `ART_SPEC.md`.

## 9. Rewards

- XP per match (survival time, kills, placement), levels, daily login streak, missions, optional season pass
- Cosmetics: snake skins, trails, boost effects, death effects, avatars, emotes
- Server-authoritative: game-server reports results to the API, the API grants rewards. The client never claims rewards.

## 10. Build order

1. `game-core` + tests, plus a local single-player Pixi sandbox against bots. **Prove the feel first**, since the feel is the whole game.
2. `design-tokens` + `ui-kit` skeleton with the black and white theme and the asset manifest (fallbacks only)
3. Colyseus room with custom snapshots: 2 players, then 8, with the network simulator
4. Prediction, reconciliation and interpolation tuning at 100-200 ms latency
5. Lobby, matchmaking, private rooms, bots
6. Auth, profiles, rewards, shop
7. Capacitor builds, mobile controls, haptics, then polish and effects
8. Real art: author skins and atlases, plug in via the manifest
9. Extra modes, ranked, seasons

## 11. First task for Claude Code

Scaffold the pnpm + Turborepo monorepo per section 3. Implement `game-core` per section 4 (continuous movement, turn-rate limit, boost, pellets, spatial hash collisions, shrinking circular arena, bots) with Vitest tests. Build a single-player Pixi sandbox in `apps/client` with mouse steering and boost against bots so we can judge the feel. Create the `design-tokens` contract and `theme.mono`, and a minimal `ui-kit` Button and Panel that read tokens and fall back when no skin is set. Do not build networking yet.
