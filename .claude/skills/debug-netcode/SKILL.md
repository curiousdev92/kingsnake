---
name: debug-netcode
description: Diagnose KingSnake online problems such as jitter, rubber-banding, prediction error, desync, or deployed WebSocket connection failures.
---

# Debug netcode

Match the symptom first:

| Symptom | Look at |
|---|---|
| Own snake jitters or rubber-bands | `Predictor.ts`; input lockstep in `Match.ts` (one input per tick, `lastSeq` = last applied) |
| Other snakes stutter | `SnapshotBuffer.ts`, `AdaptiveDelay.ts` (delay below one-way latency means constant extrapolation) |
| Bodies wrong or snapping | `RemoteWorld.ts`; keyframe stagger in `Match.ts` |
| Pellets wrong | `Match.diff`; `reset: true` handling in `RemoteWorld.ts` |
| Steers into wall at spawn | `PlayerInput.resetAim(spawnAngle)` in `OnlineGame.ts` |
| Client ticks drift | 30 Hz accumulator in `OnlineGame.ts` |
| Production can't connect | `VITE_GAME_SERVER_URL`, `VITE_API_URL` at client build time; `CORS_ORIGINS`, `API_URL` on servers; `?server=ws://…` overrides the URL |

`vercel.json` deploys only the client, so the game-server and API must be hosted elsewhere.

Reproduce before changing code:

1. Write a failing test. `packages/netcode/test/prediction.test.ts` runs the real loop at 1, 3 and 6 ticks of latency and expects exact prediction at zero loss. Use `NetworkSimulator` for latency, loss and reorder.
2. For behaviour tests cannot show, use the in-game Net panel: it sets simulated latency and loss, toggles prediction and interp delay, and shows RTT, snapshots/s, kbps and prediction error.

Treat any prediction error at zero loss as a bug, not something to smooth over. Don't raise `smoothingMs` or `snapDistance` to hide one.

Then use the `verify` skill.
