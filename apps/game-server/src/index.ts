import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ArenaRoom } from './ArenaRoom';

const port = Number(process.env.PORT ?? 2567);

const server = new Server({ transport: new WebSocketTransport() });
// Rooms with different bot settings never share a match.
server.define('arena', ArenaRoom).filterBy(['bots', 'minPlayers']);

await server.listen(port);
console.log(`game-server listening on ws://localhost:${port}`);
