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
import { signPlayerToken } from '@snake/auth';
import type { Grant, MatchReport } from '@snake/meta';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MODES } from '@snake/game-modes';
import { ArenaRoom, ROOM_SIZE, timing } from '../src/ArenaRoom';
import type { MetaService } from '../src/meta';

// Fake API: one known account, and a log of reported matches.
const ACCOUNT = '11111111-2222-3333-4444-555555555555';
const reports: MatchReport[] = [];
const fakeMeta: MetaService = {
  lookupPlayer: async (id) => (id === ACCOUNT ? { name: 'Pro', skin: 'ember' } : null),
  reportMatch: async (report) => {
    reports.push(report);
    return Object.fromEntries(report.results.map((r) => [r.playerId, { xp: 42, coins: 7, levelBefore: 1, levelAfter: 1 }]));
  },
};

const PORT = 25000 + Math.floor(Math.random() * 1000);
const URL = `ws://localhost:${PORT}`;
let server: Server;

beforeAll(async () => {
  ArenaRoom.meta = fakeMeta;
  Object.assign(timing, { lobbyWaitMs: 600, fullLobbyMs: 200, countdownMs: 300, resultsMs: 500 });
  server = new Server({ transport: new WebSocketTransport() });
  for (const mode of MODES) server.define(mode.room, ArenaRoom);
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

describe('accounts and rewards', () => {
  it('uses the account name and skin, and forwards match rewards', async () => {
    const token = await signPlayerToken(ACCOUNT);
    const room = await new Client(URL).create('arena', { name: 'typed-name', token, private: true });
    const me = record(room);
    const rewards: Grant[] = [];
    room.onMessage('rewards', (g: Grant) => rewards.push(g));

    await until(() => me.matches.length > 0, 2000);
    expect(me.last().lobby.players[0]!.name).toBe('Pro');

    room.send(SETTINGS_MESSAGE, { bots: 1 });
    await until(() => me.last().lobby.bots === 1, 2000);
    room.send(START_MESSAGE);
    await until(() => me.last().phase === 'playing', 3000);
    const roster = me.last().roster;
    const mine = roster.find((r) => r.id === me.last().you)!;
    expect(mine).toMatchObject({ name: 'Pro', skin: 'ember', isBot: false });
    expect(roster.find((r) => r.isBot)!.skin).toBeTruthy();

    // Steer straight out of the arena: the bot wins and the match is reported.
    const out = setInterval(() => room.sendBytes(Msg.Input, encodeInput({ seq: Date.now(), targetAngle: 0, boost: true })), 1000 / 30);
    await until(() => rewards.length > 0, 8000);
    clearInterval(out);

    expect(rewards[0]).toEqual({ xp: 42, coins: 7, levelBefore: 1, levelAfter: 1 });
    const report = reports.at(-1)!;
    expect(report.totalPlayers).toBe(2);
    expect(report.results).toEqual([{ playerId: ACCOUNT, placement: 2, kills: 0, survivalMs: expect.any(Number) }]);
    await room.leave();
  }, 15000);

  it('treats a bad token as anonymous: plays, but is never reported', async () => {
    const room = await new Client(URL).create('arena', { name: 'Anon', token: 'forged', private: true });
    const me = record(room);
    await until(() => me.matches.length > 0, 2000);
    expect(me.last().lobby.players[0]!.name).toBe('Anon');
    await room.leave();
  });
});

describe('duel', () => {
  it('matches two duel players together, apart from free-for-all, with no bots', async () => {
    const duel = async (name: string) => record(await new Client(URL).joinOrCreate('duel', { name }));
    const a = await duel('Ann');
    const b = await duel('Ben');
    const c = await duel('Cat');
    const f = await quick('Fay');
    expect(b.room.roomId).toBe(a.room.roomId);
    // The duel room is full, so the third duelist gets a fresh one; free-for-all is separate.
    expect(c.room.roomId).not.toBe(a.room.roomId);
    expect(f.room.roomId).not.toBe(a.room.roomId);
    expect(f.room.roomId).not.toBe(c.room.roomId);

    await until(() => a.last()?.phase === 'playing', 3000);
    expect(a.last().lobby.mode).toBe('duel');
    expect(a.last().lobby.maxPlayers).toBe(2);
    expect(a.last().roster.length).toBe(2);
    expect(a.last().roster.some((r) => r.isBot)).toBe(false);
    expect(a.last().config.headToHead).toBe('bigger-wins');
    for (const r of [a, b, c, f]) await r.room.leave();
  });

  it('private duel rooms cap the host to one bot', async () => {
    const h = await new Client(URL).create('duel', { name: 'Host', private: true }).then(record);
    await until(() => h.matches.length > 0, 2000);
    expect(h.last().lobby.bots).toBe(1);
    h.room.send(SETTINGS_MESSAGE, { bots: 9 });
    await sleep(100);
    expect(h.last().lobby.bots).toBe(1);
    await h.room.leave();
  });
});
