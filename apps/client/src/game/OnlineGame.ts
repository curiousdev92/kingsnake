import { Client, type Room } from '@colyseus/sdk';
import { makeConfig } from '@snake/game-core';
import { ClockSync, NetworkSimulator, RemoteWorld, type NetConditions } from '@snake/netcode';
import {
  MATCH_MESSAGE,
  Msg,
  decodeEvents,
  decodePong,
  decodeSnapshot,
  encodeInput,
  encodePing,
  type MatchMsg,
  type MatchPhase,
} from '@snake/protocol';
import { PlayerInput } from './PlayerInput';
import type { Renderer } from './Renderer';

const INPUT_INTERVAL_MS = 1000 / 30;
const PING_INTERVAL_MS = 1000;
const STATS_INTERVAL_MS = 100;

export interface OnlineOptions {
  url: string;
  name: string;
  bots: number;
}

export interface OnlineStats {
  connection: 'connecting' | 'connected' | 'closed' | 'error';
  error: string | null;
  phase: MatchPhase;
  /** Seconds left in countdown/results, or null. */
  phaseSecondsLeft: number | null;
  needPlayers: number;
  you: number | null;
  youAlive: boolean;
  placement: number;
  winnerName: string | null;
  mass: number;
  alive: number;
  total: number;
  // Network diagnostics
  rttMs: number;
  snapshotsPerSec: number;
  kbpsDown: number;
  buffered: number;
  extrapolating: boolean;
}

/**
 * Online mode: sends inputs to the authoritative server and renders the world
 * from interpolated snapshots, about `interpDelayMs` in the past. All traffic goes
 * through the network simulator in both directions. Prediction of the local snake
 * is build step 4; for now it is interpolated like everyone else.
 */
export class OnlineGame {
  /** client -> server */
  readonly up = new NetworkSimulator();
  /** server -> client */
  readonly down = new NetworkSimulator();
  interpDelayMs = 100;

  private room: Room | null = null;
  private readonly clock = new ClockSync();
  private readonly world = new RemoteWorld(makeConfig());
  private readonly player: PlayerInput;
  private match: MatchMsg | null = null;
  private seq = 0;
  private lastPingAt = -Infinity;
  private placement = 0;
  private lastSample: { mass: number; alive: number; you: boolean; extrapolating: boolean } = { mass: 0, alive: 0, you: false, extrapolating: false };
  private connection: OnlineStats['connection'] = 'connecting';
  private error: string | null = null;
  // Diagnostics, counted over the last second.
  private bytesWindow: { t: number; bytes: number; snapshot: boolean }[] = [];
  private destroyed = false;
  private readonly onTick = () => this.render(performance.now());
  // Network and HUD run on timers, not display frames, so a background tab still
  // sends inputs and pings (rAF stops there entirely).
  private readonly timers: ReturnType<typeof setInterval>[] = [];

  constructor(
    private readonly renderer: Renderer,
    private readonly onStats: (s: OnlineStats) => void,
    private readonly opts: OnlineOptions,
  ) {
    this.player = new PlayerInput(renderer.canvas);
    renderer.app.ticker.add(this.onTick);
    this.timers.push(setInterval(() => this.netTick(), INPUT_INTERVAL_MS));
    this.timers.push(setInterval(() => this.emitStats(performance.now()), STATS_INTERVAL_MS));
    void this.connect();
  }

  /** Applies simulated conditions given as round trip: half the latency and jitter each way. */
  setConditions(rttMs: number, jitterMs: number, loss: number): void {
    const one: NetConditions = { latencyMs: rttMs / 2, jitterMs: jitterMs / 2, loss };
    this.up.conditions = { ...one };
    this.down.conditions = { ...one };
  }

  private async connect(): Promise<void> {
    try {
      const client = new Client(this.opts.url);
      const room = await client.joinOrCreate('arena', { name: this.opts.name, bots: this.opts.bots });
      if (this.destroyed) {
        void room.leave();
        return;
      }
      this.room = room;
      this.connection = 'connected';

      // Copy payloads: the simulator delivers them later, after the transport may reuse the buffer.
      room.onMessage(Msg.Snapshot, (bytes: Uint8Array) => {
        const copy = bytes.slice();
        this.down.deliver(() => {
          this.count(copy.byteLength, true);
          this.world.applySnapshot(decodeSnapshot(copy));
        }, false);
      });
      room.onMessage(Msg.Events, (bytes: Uint8Array) => {
        const copy = bytes.slice();
        this.down.deliver(() => {
          this.count(copy.byteLength, false);
          this.world.queueEvents(decodeEvents(copy));
        }, true);
      });
      room.onMessage(Msg.Pong, (bytes: Uint8Array) => {
        const copy = bytes.slice();
        this.down.deliver(() => {
          const pong = decodePong(copy);
          this.clock.addSample(pong.clientTime, pong.serverTime, performance.now());
        }, false);
      });
      room.onMessage(MATCH_MESSAGE, (m: MatchMsg) => this.down.deliver(() => this.onMatch(m), true));
      room.onLeave((code) => {
        this.connection = 'closed';
        this.error = `Disconnected (${code})`;
      });
      room.onError((code, message) => {
        this.connection = 'error';
        this.error = message ?? `Error ${code}`;
      });
    } catch (e) {
      this.connection = 'error';
      this.error = `Could not reach ${this.opts.url}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  private onMatch(m: MatchMsg): void {
    const prev = this.match;
    this.match = m;
    this.world.cfg = m.config;
    if (m.phase === 'playing' && prev?.phase !== 'playing') this.placement = 0;
    if (m.phase === 'waiting' || m.phase === 'countdown') this.world.buffer.clear();
  }

  private count(bytes: number, snapshot: boolean): void {
    this.bytesWindow.push({ t: performance.now(), bytes, snapshot });
  }

  private send(type: number, bytes: Uint8Array): void {
    const room = this.room;
    if (room) this.up.deliver(() => room.sendBytes(type, bytes), false);
  }

  private netTick(): void {
    const now = performance.now();
    if (this.match?.phase === 'playing' && this.match.you !== null) {
      const input = this.player.sample();
      this.send(Msg.Input, encodeInput({ seq: ++this.seq, targetAngle: input.targetAngle, boost: input.boost }));
    }
    // Ping fast until the clock is synced, then once a second.
    if (now - this.lastPingAt >= (this.clock.synced ? PING_INTERVAL_MS : 200)) {
      this.lastPingAt = now;
      this.send(Msg.Ping, encodePing(now));
    }
  }

  private render(now: number): void {
    if (!this.clock.synced) return;
    const renderTime = this.clock.serverNow(now) - this.interpDelayMs;
    const you = this.match?.you ?? null;
    for (const d of this.world.applyEventsUntil(renderTime)) {
      if (d.snakeId === you) this.placement = (this.world.buffer.latest?.snakes.length ?? 0) + 1;
    }
    const s = this.world.sample(renderTime);
    if (!s) {
      this.renderer.clear();
      return;
    }
    const a = { ...s.a, pellets: s.pellets };
    const b = { ...s.b, pellets: s.pellets };
    const me = s.b.snakes.find((sn) => sn.id === you);
    // Spectate the biggest snake once our own is gone.
    const focus = me ? you : ([...s.b.snakes].sort((x, y) => y.mass - x.mass)[0]?.id ?? null);
    this.renderer.render(a, b, s.t, focus);
    this.lastSample = { mass: me?.mass ?? 0, alive: s.b.snakes.length, you: !!me, extrapolating: s.extrapolating };
  }

  private emitStats(now: number): void {
    this.bytesWindow = this.bytesWindow.filter((e) => now - e.t < 1000);
    const m = this.match;
    const serverNow = this.clock.serverNow(now);
    this.onStats({
      connection: this.connection,
      error: this.error,
      phase: m?.phase ?? 'waiting',
      phaseSecondsLeft: m?.phaseEndsAt != null && this.clock.synced ? Math.max(0, Math.ceil((m.phaseEndsAt - serverNow) / 1000)) : null,
      needPlayers: m?.needPlayers ?? 0,
      you: m?.you ?? null,
      youAlive: this.lastSample.you,
      placement: this.placement,
      winnerName: m?.winnerId != null ? (m.roster.find((r) => r.id === m.winnerId)?.name ?? null) : null,
      mass: Math.round(this.lastSample.mass),
      alive: this.lastSample.alive,
      total: m?.roster.length ?? 0,
      rttMs: Math.round(this.clock.rtt),
      snapshotsPerSec: this.bytesWindow.filter((e) => e.snapshot).length,
      kbpsDown: Math.round((this.bytesWindow.reduce((sum, e) => sum + e.bytes, 0) * 8) / 100) / 10,
      buffered: this.world.buffer.size,
      extrapolating: this.lastSample.extrapolating,
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.renderer.app.ticker.remove(this.onTick);
    for (const t of this.timers) clearInterval(t);
    this.player.destroy();
    void this.room?.leave();
  }
}
