import { Client, type Room } from '@colyseus/sdk';
import { makeConfig } from '@snake/game-core';
import type { Grant } from '@snake/meta';
import { AdaptiveDelay, ClockSync, NetworkSimulator, Predictor, RemoteWorld, type NetConditions, type ViewSnake } from '@snake/netcode';
import {
  MATCH_MESSAGE,
  Msg,
  REWARDS_MESSAGE,
  SETTINGS_MESSAGE,
  START_MESSAGE,
  decodeEvents,
  decodePong,
  decodeSnapshot,
  encodeInput,
  encodePing,
  type MatchMsg,
  type LobbyInfo,
  type MatchPhase,
  type SnapshotMsg,
} from '@snake/protocol';
import { PlayerInput } from './PlayerInput';
import type { Renderer } from './Renderer';

const INPUT_INTERVAL_MS = 1000 / 30;
/** How often the net timer wakes; client ticks are counted from the clock, not from wakeups. */
const NET_TIMER_MS = 5;
const PING_INTERVAL_MS = 1000;
const STATS_INTERVAL_MS = 100;

/** How to get into a room: matchmaking, a new private room, or a private room's code. */
export type JoinRequest = { kind: 'quick' } | { kind: 'create' } | { kind: 'code'; code: string };

export interface OnlineOptions {
  url: string;
  name: string;
  join: JoinRequest;
  /** Account session token; without one the player is anonymous (no skin, no rewards). */
  token?: string | null;
  /** Called with the account's rewards when a match ends. */
  onRewards?: (grant: Grant) => void;
}

export interface OnlineStats {
  connection: 'connecting' | 'connected' | 'closed' | 'error';
  error: string | null;
  phase: MatchPhase;
  /** Seconds left in countdown/results, or null. */
  phaseSecondsLeft: number | null;
  lobby: LobbyInfo | null;
  you: number | null;
  youAlive: boolean;
  placement: number;
  /** How the local snake died, e.g. "ran into Bot 3". */
  deathReason: string | null;
  winnerName: string | null;
  /** This account's rewards for the match that just ended. */
  rewards: Grant | null;
  mass: number;
  alive: number;
  total: number;
  // Network diagnostics
  rttMs: number;
  snapshotsPerSec: number;
  kbpsDown: number;
  buffered: number;
  extrapolating: boolean;
  interpMs: number;
  /** Size of the last prediction correction in world units, or null when not predicting. */
  predErr: number | null;
  predSnaps: number;
}

/**
 * Online mode: sends inputs to the authoritative server and renders the world
 * from interpolated snapshots, about `interpDelayMs` in the past. All traffic goes
 * through the network simulator in both directions. The local snake is predicted
 * (drawn in the present from local inputs, reconciled with each snapshot) while
 * everyone else is interpolated.
 */
export class OnlineGame {
  /** client -> server */
  readonly up = new NetworkSimulator();
  /** server -> client */
  readonly down = new NetworkSimulator();
  readonly predictor = new Predictor(makeConfig());
  readonly adaptive = new AdaptiveDelay();
  predict = true;
  autoInterp = true;
  manualInterpMs = 100;

  private room: Room | null = null;
  private readonly clock = new ClockSync();
  private readonly world = new RemoteWorld(makeConfig());
  private readonly player: PlayerInput;
  private match: MatchMsg | null = null;
  private seq = 0;
  private lastPingAt = -Infinity;
  /** Scheduled time of the latest client tick, and of the next one. */
  private lastTickAt = 0;
  private nextTickAt = performance.now();
  private lastFrameAt = performance.now();
  private placement = 0;
  private deathReason: string | null = null;
  private rewards: Grant | null = null;
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
    this.timers.push(setInterval(() => this.netTick(), NET_TIMER_MS));
    this.timers.push(setInterval(() => this.emitStats(performance.now()), STATS_INTERVAL_MS));
    void this.connect();
  }

  /** Private room host: start the next match. */
  start(): void {
    this.room?.send(START_MESSAGE);
  }

  /** Private room host: bots for the next match. */
  setBots(bots: number): void {
    this.room?.send(SETTINGS_MESSAGE, { bots });
  }

  get interpDelayMs(): number {
    return this.autoInterp ? this.adaptive.delayMs : this.manualInterpMs;
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
      const join = this.opts.join;
      const options = { name: this.opts.name, token: this.opts.token ?? undefined };
      const room =
        join.kind === 'quick'
          ? await client.joinOrCreate('arena', options)
          : join.kind === 'create'
            ? await client.create('arena', { ...options, private: true })
            : await client.joinById(join.code, options);
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
          this.onSnapshot(decodeSnapshot(copy));
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
      room.onMessage(REWARDS_MESSAGE, (g: Grant) =>
        this.down.deliver(() => {
          this.rewards = g;
          this.opts.onRewards?.(g);
        }, true),
      );
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
      const message = e instanceof Error ? e.message : String(e);
      const join = this.opts.join;
      // A bad or locked code comes back as a matchmaking error; a dead server as a fetch failure.
      this.error =
        join.kind === 'code' && /not found|locked/i.test(message)
          ? `No open room with code ${join.code}`
          : `Could not reach ${this.opts.url}: ${message}`;
    }
  }

  private onSnapshot(msg: SnapshotMsg): void {
    if (!this.world.applySnapshot(msg)) return;
    if (this.clock.synced) this.adaptive.addSample(this.clock.serverNow(performance.now()) - msg.serverTime);

    const you = this.match?.you ?? null;
    if (you === null) return;
    const own = msg.snakes.find((s) => s.id === you);
    if (!own) {
      this.predictor.reset(); // dead: the server's word is final
      return;
    }
    // First snapshot of this life: steer along the spawn heading until the player aims.
    if (!this.predictor.active) this.player.resetAim(own.angle);
    this.predictor.reconcile({ snake: own, path: this.world.pathOf(you)!, arenaRadius: msg.arenaRadius, lastSeq: msg.lastSeq });
  }

  private onMatch(m: MatchMsg): void {
    const prev = this.match;
    this.match = m;
    this.world.cfg = m.config;
    this.predictor.setConfig(m.config);
    if (m.phase !== prev?.phase || m.you !== prev?.you) this.predictor.reset();
    if (m.phase === 'playing' && prev?.phase !== 'playing') {
      this.placement = 0;
      this.deathReason = null;
      this.rewards = null;
      this.renderer.setSkins(new Map(m.roster.map((r) => [r.id, r.skin])));
    }
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
    // Exactly 30 client ticks per second on average: the server applies one input per
    // tick, so producing inputs at a drifting rate would desync prediction.
    if (now - this.nextTickAt > 250) this.nextTickAt = now; // tab was asleep: don't burst
    while (now >= this.nextTickAt) {
      this.clientTick();
      this.lastTickAt = this.nextTickAt;
      this.nextTickAt += INPUT_INTERVAL_MS;
    }
    // Ping fast until the clock is synced, then once a second.
    if (now - this.lastPingAt >= (this.clock.synced ? PING_INTERVAL_MS : 200)) {
      this.lastPingAt = now;
      this.send(Msg.Ping, encodePing(now));
    }
  }

  private clientTick(): void {
    if (this.match?.phase !== 'playing' || this.match.you === null) return;
    const input = this.player.sample();
    const seq = ++this.seq;
    this.send(Msg.Input, encodeInput({ seq, targetAngle: input.targetAngle, boost: input.boost }));
    this.predictor.applyInput(seq, input);
  }

  private render(now: number): void {
    this.predictor.decay(now - this.lastFrameAt);
    this.lastFrameAt = now;
    if (!this.clock.synced) return;
    const renderTime = this.clock.serverNow(now) - this.interpDelayMs;
    const you = this.match?.you ?? null;
    for (const d of this.world.applyEventsUntil(renderTime)) {
      if (d.snakeId !== you) continue;
      this.placement = (this.world.buffer.latest?.snakes.length ?? 0) + 1;
      const killer = this.match?.roster.find((r) => r.id === d.killerId)?.name ?? 'someone';
      this.deathReason = d.cause === 'arena' ? 'left the arena' : d.cause === 'head' ? `hit ${killer} head-on` : `ran into ${killer}`;
    }
    const s = this.world.sample(renderTime);
    if (!s) {
      this.renderer.clear();
      return;
    }
    let snakesA: ViewSnake[] = s.a.snakes;
    let snakesB: ViewSnake[] = s.b.snakes;
    if (this.predict && you !== null) {
      const latestHasYou = this.world.buffer.latest?.snakes.some((sn) => sn.id === you) ?? false;
      const predicted = this.predictor.view((now - this.lastTickAt) / INPUT_INTERVAL_MS);
      // Own snake comes from the prediction, in the present. The same object in both
      // states makes the renderer's interpolation a no-op for it.
      const swap = (list: ViewSnake[]) => {
        const others = list.filter((sn) => sn.id !== you);
        return predicted ? [...others, predicted] : latestHasYou ? list : others;
      };
      snakesA = swap(snakesA);
      snakesB = swap(snakesB);
    }
    const a = { ...s.a, snakes: snakesA, pellets: s.pellets };
    const b = { ...s.b, snakes: snakesB, pellets: s.pellets };
    const me = snakesB.find((sn) => sn.id === you);
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
      lobby: m?.lobby ?? null,
      you: m?.you ?? null,
      youAlive: this.lastSample.you,
      placement: this.placement,
      deathReason: this.deathReason,
      rewards: this.rewards,
      winnerName: m?.winnerId != null ? (m.roster.find((r) => r.id === m.winnerId)?.name ?? null) : null,
      mass: Math.round(this.lastSample.mass),
      alive: this.lastSample.alive,
      total: m?.roster.length ?? 0,
      rttMs: Math.round(this.clock.rtt),
      snapshotsPerSec: this.bytesWindow.filter((e) => e.snapshot).length,
      kbpsDown: Math.round((this.bytesWindow.reduce((sum, e) => sum + e.bytes, 0) * 8) / 100) / 10,
      buffered: this.world.buffer.size,
      extrapolating: this.lastSample.extrapolating,
      interpMs: Math.round(this.interpDelayMs),
      predErr: this.predict && this.predictor.active ? Math.round(this.predictor.lastError * 10) / 10 : null,
      predSnaps: this.predictor.snaps,
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
