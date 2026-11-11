---
name: change-protocol
description: Add or change a KingSnake network message or field. Use when data must travel between client and game-server, in binary codecs or JSON match messages.
---

# Change the protocol

First pick the channel:

- **Per-tick, lossy-tolerant:** `Snapshot` (binary, 30 Hz). Every byte is multiplied by snakes × 30/s, so quantize.
- **Must arrive:** `Events` (binary, reliable).
- **Match lifecycle or lobby:** `MatchMsg` (JSON). Lobby data goes in `LobbyInfo`, built per recipient.
- **Client to server:** `Input`, or a named JSON message such as `'settings'`. Validate it on the server and check sender and phase.

Then change, in order:

1. `packages/protocol/src/messages.ts`: the type and both `encode*` and `decode*`. Keep field order identical. Update the `ByteWriter` size if it is fixed. Use `quantizePos` and `quantizeAngle` for positions and angles.
2. `packages/protocol/test/protocol.test.ts`: round-trip test.
3. `apps/game-server/src/Match.ts`: produce the data. Lifecycle messages are in `ArenaRoom.ts`.
4. `packages/netcode/src/RemoteWorld.ts`: if the data is part of the world view.
5. `apps/client/src/game/OnlineGame.ts`: consume it. Colyseus may appear only here and in `apps/game-server`.

Never use Colyseus Schema state. Client and server deploy separately, so note in your summary when a change breaks wire compatibility.

Then use the `verify` skill.
