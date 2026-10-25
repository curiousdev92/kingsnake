import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { MODES, queueRoomName } from '@snake/game-modes';
import { ArenaRoom } from './ArenaRoom';
import { QueueRoom } from './QueueRoom';

const port = Number(process.env.PORT ?? 2567);

const server = new Server({ transport: new WebSocketTransport() });
// Quick play uses joinOrCreate(mode.room); private rooms are created with { private: true }
// and are invisible to matchmaking (setPrivate), joined by code with joinById.
// One room name per mode ('arena' is free-for-all), so matchmaking never mixes modes.
for (const mode of MODES) {
  server.define(mode.room, ArenaRoom);
  // Ranked modes: public games are matched by rating through a queue room.
  const queue = queueRoomName(mode);
  if (queue) server.define(queue, QueueRoom);
}

await server.listen(port);
console.log(`game-server listening on ws://localhost:${port}`);
