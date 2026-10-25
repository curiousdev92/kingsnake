import { Server } from '@colyseus/core';
import { Client, type Room } from '@colyseus/sdk';
import { WebSocketTransport } from '@colyseus/ws-transport';
import {
  MATCH_MESSAGE,
  Msg,
  SETTINGS_MESSAGE,
  START_MESSAGE,
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
import { ArenaRoom, ROOM_SIZE, timing } from '../src/ArenaRoom';

const PORT = 25000 + Math.floor(Math.random() * 1000);
const URL = `ws://localhost:${PORT}`;
let server: Server;

beforeAll(async () => {
  Object.assign(timing, { lobbyWaitMs: 600, fullLobbyMs: 200, countdownMs: 300, resultsMs: 500 });
  server = new Server({ transport: new WebSocketTransport() });
  server.define('arena', ArenaRoom);
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
  last: () => MatchMsg;
}

function record(room: Room): Recorder {
  const r: Recorder = { room, snapshots: [], events: [], matches: [], pongs: 0, last: () => r.matches.at(-1)! };
  room.onMessage(Msg.Snapshot, (b: Uint8Array) => r.snapshots.push(decodeSnapshot(b)));
  room.onMessage(Msg.Events, (b: Uint8Array) => r.events.push(decodeEvents(b)));
  room.onMessage(Msg.Pong, (b: Uint8Array) => {
    decodePong(b);
    r.pongs++;
  });
  room.onMessage(MATCH_MESSAGE, (m: MatchMsg) => r.matches.push(m));
  return r;
}

const quick = async (name: string) => record(await new Client(URL).joinOrCreate('arena', { name }));
const createPrivate = async (name: string) => record(await new Client(URL).create('arena', { name, private: true }));
const joinCode = async (code: string, name: string) => record(await new Client(URL).joinById(code, { name }));

async function until(cond: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((res) => setTimeout(res, 20));
  }
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

describe('quick play', () => {
  it('gathers players, fills with bots, streams snapshots and acks inputs', async () => {
    const a = await quick('Alice');
    const b = await quick('Bob');
    expect(b.room.roomId).toBe(a.room.roomId);
    await until(() => a.matches.some((m) => m.phase === 'countdown'), 2000);
    expect(a.last().lobby.private).toBe(false);
    // Bot fill tracks the humans present: 7 while Alice is alone, 6 once Bob is counted.
    await until(() => a.last().lobby.players.length === 2, 2000);
    expect(a.last().lobby.bots).toBe(ROOM_SIZE - 2);

    await until(() => a.snapshots.length > 0 && b.snapshots.length > 0, 3000);
    const match = a.last();
    expect(match.phase).toBe('playing');
    expect(match.roster.length).toBe(ROOM_SIZE);
    expect(match.roster.filter((r) => r.isBot).length).toBe(ROOM_SIZE - 2);
    expect(match.you).not.toBeNull();
    expect(b.last().you).not.toBe(match.you);

    // First snapshot is a full keyframe, and the full pellet sync has arrived.
    expect(a.snapshots[0]!.snakes.every((s) => s.body !== null)).toBe(true);
    expect(a.events.some((e) => e.reset && e.added.length > 100)).toBe(true);

    // Inputs are applied and acknowledged; ping/pong works; snapshots stream at ~30 Hz.
    a.room.sendBytes(Msg.Input, encodeInput({ seq: 7, targetAngle: 0, boost: false }));
    await until(() => a.snapshots.at(-1)!.lastSeq === 7, 2000);
    a.room.sendBytes(Msg.Ping, encodePing(123));
    await until(() => a.pongs > 0, 2000);
    const before = a.snapshots.length;
    await sleep(500);
    expect(a.snapshots.length - before).toBeGreaterThan(10);

    // The room is locked mid-match: a newcomer gets a fresh room.
    const c = await quick('Carol');
    expect(c.room.roomId).not.toBe(a.room.roomId);

    await Promise.all([a.room.leave(), b.room.leave(), c.room.leave()]);
  }, 15000);
});

describe('private rooms', () => {
  it('are joined by code, hidden from quick play, and started by the host', async () => {
    const host = await createPrivate('Host');
    await until(() => host.matches.length > 0, 2000);
    const code = host.room.roomId;
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    expect(host.last().lobby).toMatchObject({ private: true, code, youAreHost: true });

    // Quick play never lands in a private room.
    const stranger = await quick('Stranger');
    expect(stranger.room.roomId).not.toBe(code);
    await stranger.room.leave();

    const friend = await joinCode(code, 'Friend');
    await until(() => host.last().lobby.players.length === 2, 2000);
    expect(friend.last().lobby.youAreHost).toBe(false);
    expect(friend.last().lobby.players.map((p) => p.name).sort()).toEqual(['Friend', 'Host']);

    // Only the host controls the room, and nothing starts on its own.
    friend.room.send(START_MESSAGE);
    friend.room.send(SETTINGS_MESSAGE, { bots: 9 });
    await sleep(300);
    expect(host.last().phase).toBe('waiting');
    expect(host.last().lobby.bots).toBe(6);

    host.room.send(SETTINGS_MESSAGE, { bots: 0 });
    await until(() => friend.last().lobby.bots === 0, 2000);
    host.room.send(START_MESSAGE);
    await until(() => friend.last().phase === 'countdown', 2000);
    await until(() => friend.last().phase === 'playing', 2000);
    expect(friend.last().roster.length).toBe(2);

    // Private rooms stay joinable mid-match (newcomers spectate until the next one).
    const late = await joinCode(code, 'Late');
    await until(() => late.matches.length > 0, 2000);
    expect(late.last().phase).toBe('playing');
    expect(late.last().you).toBeNull();

    // The host leaving hands the room to the next player.
    await host.room.leave();
    await until(() => friend.last().lobby.youAreHost, 2000);

    await Promise.all([friend.room.leave(), late.room.leave()]);
  }, 15000);

  it('rejects unknown codes', async () => {
    await expect(joinCode('ZZZZZ', 'Nobody')).rejects.toThrow();
  });
});
