# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Snake Arena: a realtime multiplayer, Slither-style snake game (last snake alive wins) for web, Android and iOS, all in TypeScript. `PLAN.md` is the source of truth for design decisions and build order; `ART_SPEC.md` defines asset naming and 9-slice conventions. Read the relevant PLAN.md section before starting a new piece of work.

## Commands

pnpm 12 + Turborepo. Run from the repo root.

```bash
pnpm install
pnpm dev                 # Vite dev server for the client sandbox (http://localhost:5173)
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

There is no lint setup yet. pnpm 12 blocks dependency build scripts; allowed ones are listed under `allowBuilds` in `pnpm-workspace.yaml` (currently esbuild).

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

### apps/client: Pixi sandbox + React shell
- `game/Sandbox.ts` owns the loop: a fixed-step accumulator on the Pixi ticker runs `step()` with player and bot inputs, then calls `Renderer.render(prev, cur, alpha)` at display rate.
- `game/Renderer.ts` draws with Pixi v8 `Graphics`, rebuilt every frame (placeholder white circles). The camera keeps the player's head at the screen center, which is why steering uses the pointer's offset from the center.
- React (`App.tsx`) is the UI layer only. Sandbox pushes HUD stats into a Zustand store (`store.ts`). The Tune panel edits `sandbox.cfg` live.

## Constraints from PLAN.md
- Networking is not built yet. When it is: authoritative server, client prediction for your own snake, interpolation for others, custom binary snapshots (not Colyseus Schema). `game-core`, `netcode` and `protocol` must not depend on the transport.
- Planned but not yet created: `apps/game-server`, `apps/api`, `packages/{netcode, game-modes, protocol}`. A new game mode should be one file in `game-modes`.
- Cosmetics only, no pay-to-win. Rewards are granted server-side; the client never claims them.
- Original art only. Snake skins are data (atlas + config), not code.
