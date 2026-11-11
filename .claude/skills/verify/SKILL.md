---
name: verify
description: Pick and run the smallest test/typecheck set for what changed in KingSnake. Use after any code change, or when asked to test or check it.
---

# Verify a change

Run only what the change can break. Get the changed paths from `git status --short`.

| Changed | Run |
|---|---|
| `packages/game-core` | `@snake/game-core`, `@snake/protocol`, `@snake/netcode`, `@snake/game-modes`, `@snake/game-server` |
| `packages/protocol` | `@snake/protocol`, `@snake/netcode`, `@snake/game-server` |
| `packages/netcode` | `@snake/netcode` |
| `packages/game-modes` | `@snake/game-modes`, `@snake/game-server` |
| `packages/meta` | `@snake/meta`, `@snake/api`, `@snake/game-server` |
| `packages/auth` | `@snake/auth`, `@snake/api`, `@snake/game-server` |
| `packages/assets`, `ui-kit`, `design-tokens` | that package, then client typecheck |
| `apps/api` | `@snake/api` |
| `apps/game-server` | `@snake/game-server` |
| `apps/client` | client typecheck, then the browser check below if the change is visible |

`@snake/client` and `@snake/design-tokens` have no test script. The client imports every package except `auth`, so also typecheck it when a shared package's exports change.

Run several packages in one command:

```bash
pnpm --filter @snake/game-core --filter @snake/netcode test
pnpm --filter @snake/game-core --filter @snake/netcode typecheck
```

Use `exec vitest run -t "name"` while iterating on one test. Run root `pnpm test` and `pnpm typecheck` only for cross-cutting changes.

## Browser check

Dev servers are in `.claude/launch.json`: `client`, `game-server`, `api`. Start them with `preview_start`, never Bash. Start only what is needed:

- `client` alone: `/` offline sandbox, `#ui` component gallery.
- All three: `#online`.
- Two players: create a private room in one tab, open its invite link in another. Hidden tabs stop rendering, so a background tab looks frozen without being broken.
