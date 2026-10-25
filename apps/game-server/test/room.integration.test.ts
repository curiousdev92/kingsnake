import { Server } from '@colyseus/core';
import { Client, type Room } from '@colyseus/sdk';
import { WebSocketTransport } from '@colyseus/ws-transport';
import {
  MATCH_MESSAGE,
  Msg,
  decodeEvents,
  decodePong,
  decodeSnapshot,
  encodeInput,
  encodePing,
  type EventsMsg,
  type MatchMsg,
  type SnapshotMsg,
} from '@snake/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArenaRoom } from '../src/ArenaRoom';

const PORT = 25000 + Math.floor(Math.random() * 1000);
let server: Server;

beforeAll(async () => {
  server = new Server({ transport: new WebSocketTransport() });
  server.define('arena', ArenaRoom).filterBy(['bots', 'minPlayers']);
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

interface Recorder {
  room: Room;
  snapshots: SnapshotMsg[];
  events: EventsMsg[];
  matches: MatchMsg[];
  pongs: number;
}

async function join(name: string, options: Record<string, unknown> = {}): Promise<Recorder> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate('arena', { name, ...options });
  const r: Recorder = { room, snapshots: [], events: [], matches: [], pongs: 0 };
  room.onMessage(Msg.Snapshot, (b: Uint8Array) => r.snapshots.push(decodeSnapshot(b)));
  room.onMessage(Msg.Events, (b: Uint8Array) => r.events.push(decodeEvents(b)));
  room.onMessage(Msg.Pong, (b: Uint8Array) => {
    decodePong(b);
    r.pongs++;
  });
  room.onMessage(MATCH_MESSAGE, (m: MatchMsg) => r.matches.push(m));
  return r;
}

async function until(cond: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((res) => setTimeout(res, 20));
  }
}

describe('ArenaRoom over the network', () => {
  it('runs a 2-player match: countdown, snapshots, inputs, pellets', async () => {
    const a = await join('Alice');
    const b = await join('Bob');
    expect(b.room.roomId).toBe(a.room.roomId);

    await until(() => a.matches.some((m) => m.phase === 'countdown'), 2000);
    await until(() => a.snapshots.length > 0 && b.snapshots.length > 0, 5000);

    const you = a.matches.at(-1)!.you!;
    expect(you).not.toBeNull();
    expect(b.matches.at(-1)!.you).not.toBe(you);

    // First snapshot is a full keyframe; then heads only, with staggered keyframes.
    expect(a.snapshots[0]!.snakes.every((s) => s.body !== null)).toBe(true);
    // Full pellet sync arrives before the first snapshot is useful.
    expect(a.events.some((e) => e.reset && e.added.length > 100)).toBe(true);

    // Inputs are applied and acknowledged through lastSeq.
    a.room.sendBytes(Msg.Input, encodeInput({ seq: 7, targetAngle: 0, boost: false }));
    await until(() => a.snapshots.at(-1)!.lastSeq === 7, 2000);

    // Ping/pong for clock sync.
    a.room.sendBytes(Msg.Ping, encodePing(123));
    await until(() => a.pongs > 0, 2000);

    // Snapshots stream at roughly the 30 Hz tick rate.
    const before = a.snapshots.length;
    await new Promise((res) => setTimeout(res, 500));
    expect(a.snapshots.length - before).toBeGreaterThan(10);

    await a.room.leave();
    await b.room.leave();
  }, 15000);

  it('starts with one player when bots are requested, in a separate room', async () => {
    const solo = await join('Solo', { bots: 3 });
    await until(() => solo.snapshots.length > 0, 5000);
    expect(solo.snapshots.at(-1)!.snakes.length).toBe(4);
    await solo.room.leave();
  }, 10000);
});
