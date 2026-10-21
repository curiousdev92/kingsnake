# Snake Arena: Project Plan

Realtime multiplayer snake game for web, Android and iOS. Last snake alive wins.
Priorities: clean, maintainable, buttery smooth, beautiful and rewarding.

## 1. Core decisions

- **One language: TypeScript** across client, server and shared logic.
- **Cross-platform:** build once for web (Vite + PixiJS), ship Android/iOS with **Capacitor**.
- **Netcode:** authoritative server, grid-based, input-only. Clients send turn commands; the server runs a fixed tick and broadcasts state. The client interpolates between ticks and predicts the local snake.
- **Room size:** 8 players max (stretch: 16). A shrinking arena guarantees every match ends.
- **Monetization/economy:** cosmetics only, no pay-to-win.

## 2. Tech stack

| Layer | Choice |
|---|---|
| Rendering | PixiJS (WebGL) |
| UI shell | React + Zustand |
| Mobile | Capacitor (haptics, push, IAP plugins) |
| Realtime server | Colyseus (Node) |
| Meta API | Fastify (or NestJS): profiles, rewards, shop, friends, leaderboards |
| Database | PostgreSQL + Redis |
| Auth | Supabase Auth or Firebase Auth (guest, Google, Apple) |
| Hosting | Docker on Fly.io, multi-region |
| Tooling | pnpm + Turborepo, Vitest, Playwright, GitHub Actions |

## 3. Monorepo structure

```
snake/
├─ apps/
│  ├─ client/          # Vite app: Pixi game view + React UI (web + Capacitor)
│  ├─ game-server/     # Colyseus rooms, matchmaking, tick loop
│  └─ api/             # Accounts, rewards, shop, friends, leaderboards
├─ packages/
│  ├─ game-core/       # Pure TS simulation. Zero dependencies, no I/O
│  ├─ game-modes/      # Rule plugins: FreeForAll, Duel, Teams, Custom
│  ├─ protocol/        # Message and state schemas shared by client/server
│  ├─ design-tokens/   # Theme definitions (see section 6)
│  ├─ ui-kit/          # Skinnable components (see section 6)
│  ├─ assets/          # Asset manifest, atlases, 9-slice images (see section 6)
│  └─ config/          # ESLint, tsconfig, etc.
└─ infra/              # Dockerfiles, fly.toml, CI
```

Rule: `game-core` is `(state, inputs) -> nextState`. Deterministic and unit-testable; reused for client prediction, server authority, bots and replays.

## 4. Game modes

```ts
interface GameMode {
  config: { maxPlayers: number; tickRate: number; teams: boolean };
  onTick(state): void;
  onPlayerDied(state, player): void;
  checkWinner(state): WinResult | null;
}
```

- Free-for-all (last alive wins): default
- 1v1 Duel: `maxPlayers: 2`, ranked ELO queue
- Play with friends: private room with join code or invite link, any mode
- Later: teams, timed score mode, power-up chaos mode

A new mode is one new file; no changes to networking or rendering.

## 5. Rewards

- XP per match (survival time, kills, placement), levels, daily login streak, missions, optional season pass
- Cosmetics: snake skins, trails, death effects, avatars, emotes
- Server-authoritative: game-server reports results to the API, the API grants rewards. The client never claims rewards.

## 6. Design system (set up from day 1, art comes later)

Goal: a bold, glossy, chunky "mobile game" look (Clash Royale-style direction) using graphical assets for UI elements. Use only original art; do not copy another game's assets or characters.

**Phase 1 (now):** plain black and white theme, no art.
**Phase 2 (later):** drop in artwork. No screen or game code changes.

How:

1. **Semantic tokens** in `packages/design-tokens`. Components never use raw values. Examples: `color.surface`, `color.accent`, `color.textOnAccent`, `radius.panel`, `space.md`, `font.display`, `motion.pop`, `shadow.button`. A theme is one file implementing the token contract. Ship `theme.mono` (black and white) first.
2. **Skinnable components** in `packages/ui-kit`: Button, Panel, Modal, Chip, ProgressBar, Badge, Tab, IconButton, CurrencyPill. Each reads tokens and an optional `skin` (see next point). With no skin they render as simple CSS (white border, black fill).
3. **9-slice skins.** A skin maps a component state to a 9-slice image (fixed corners, stretchable edges), e.g. `button.primary.normal / pressed / disabled`. This lets chunky framed art scale to any size.
4. **Asset manifest** in `packages/assets/assets.manifest.ts`: a typed map from asset name (`button.primary.normal`, `icon.coin`, `frame.avatar`) to file path. Every lookup has a fallback to the placeholder style, so missing art never breaks the app.
5. **Texture atlases** for the canvas (snake skins, food, effects, particles). A snake skin is data (atlas + config), not code.
6. **Animation tokens** for UI motion: pop-in, button squash, reward chest-open, number count-up. Keep durations and easings in tokens so the feel is tunable in one place.
7. **Art pipeline notes:** export at 1x/2x/3x, pack atlases with a tool such as free-tex-packer, keep source art (PSD/Figma) outside the repo or in Git LFS.

## 7. Making it buttery

1. Fixed server tick (~15-20 Hz) with client interpolation at 60/120 fps
2. Client-side prediction for own turns, with server reconciliation
3. Binary delta state sync (Colyseus)
4. Input buffering so quick double-turns are never dropped
5. Regional servers, ping display, reconnect-in-place
6. Bot fill-ins so rooms start fast

## 8. Build order

1. `game-core` + tests, and a local single-player Pixi view (prove the feel)
2. `design-tokens` + `ui-kit` skeleton with the black and white theme and the asset manifest (fallbacks only)
3. Colyseus room with 2 players, then 8
4. Prediction and interpolation tuning
5. Lobby, matchmaking, private rooms
6. Auth, profiles, rewards, shop
7. Capacitor builds, then polish and effects
8. Real art: author skins and atlases, plug in via manifest
9. Extra modes, ranked, seasons

## 9. First task for Claude Code

Scaffold the pnpm + Turborepo monorepo per section 3. Implement `game-core` (grid, snake movement, collisions, food, shrinking arena) with Vitest tests. Create the `design-tokens` contract and `theme.mono`, and a minimal `ui-kit` Button and Panel that read tokens and fall back when no skin is set. Do not build networking yet.
