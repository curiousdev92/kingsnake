import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ArenaRoom } from './ArenaRoom';

const port = Number(process.env.PORT ?? 2567);

const server = new Server({ transport: new WebSocketTransport() });
// Quick play uses joinOrCreate('arena'); private rooms are created with { private: true }
// and are invisible to matchmaking (setPrivate), joined by code with joinById.
server.define('arena', ArenaRoom);

await server.listen(port);
console.log(`game-server listening on ws://localhost:${port}`);
