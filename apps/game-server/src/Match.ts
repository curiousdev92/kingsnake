import {
  botInputs,
  createGame,
  step,
  type GameState,
  type Input,
  type PlayerSpec,
  type SimConfig,
} from '@snake/game-core';
import type { DeathSnap, EventsMsg, InputMsg, SnapshotMsg } from '@snake/protocol';

/** How often each snake's full body is resent, in ticks (~1 s at 30 Hz). */
export const KEYFRAME_TICKS = 30;
/** Most steps taken in one `advance` call; beyond that the match clock slips. */
const MAX_CATCH_UP_STEPS = 8;
/** Queued inputs beyond this are dropped (oldest first) to bound added latency. */
const MAX_QUEUED_INPUTS = 4;

interface InputQueue {
  queue: { seq: number; input: Input }[];
  lastReceived: number;
  /** Seq of the input applied on the latest tick (0 = none yet). */
  lastApplied: number;
  /** Repeated on ticks when the queue is empty. */
  current: Input | null;
}

/**
 * One authoritative match: owns the game-core state and per-player input queues,
 * and turns state changes into protocol messages. Knows nothing about Colyseus.
 *
 * Each player's inputs are applied exactly one per tick, in order (the last one
 * repeats when the queue runs dry). Clients predict one step per input sent, so this
 * keeps server and prediction stepping in lockstep despite network jitter.
 */
export class Match {
  state: GameState;
  private startTime: number;
  private readonly inputs = new Map<number, InputQueue>();

  constructor(
    players: PlayerSpec[],
    readonly cfg: SimConfig,
    startTime: number,
    seed = (Math.random() * 2 ** 31) | 0,
  ) {
    this.state = createGame(players, cfg, seed);
    this.startTime = startTime;
  }

  get finished(): boolean {
    return this.state.finished;
  }

  /** Server time (ms) at which `tick` is simulated. */
  tickTime(tick: number): number {
    return this.startTime + tick * this.cfg.dt * 1000;
  }

  /** Queues a player's input. Older or duplicate sequence numbers are ignored. */
  setInput(snakeId: number, msg: InputMsg): void {
    let q = this.inputs.get(snakeId);
    if (!q) this.inputs.set(snakeId, (q = { queue: [], lastReceived: 0, lastApplied: 0, current: null }));
    if (msg.seq <= q.lastReceived) return;
    q.lastReceived = msg.seq;
    q.queue.push({ seq: msg.seq, input: { targetAngle: msg.targetAngle, boost: msg.boost } });
    if (q.queue.length > MAX_QUEUED_INPUTS) q.queue.shift();
  }

  /** The last input seq applied to a snake, echoed in snapshots for reconciliation. */
  lastSeqFor(snakeId: number | null): number {
    return snakeId === null ? 0 : (this.inputs.get(snakeId)?.lastApplied ?? 0);
  }

  /** Pops one input per player for the next tick. */
  private nextInputs(): Map<number, Input> {
    const out = new Map<number, Input>();
    for (const [id, q] of this.inputs) {
      const next = q.queue.shift();
      if (next) {
        q.current = next.input;
        q.lastApplied = next.seq;
      }
      if (q.current) out.set(id, q.current);
    }
    return out;
  }

  /** Hands a snake over to the bot AI (its player left). */
  convertToBot(snakeId: number): void {
    const s = this.state.snakes.find((sn) => sn.id === snakeId);
    if (s) s.isBot = true;
    this.inputs.delete(snakeId);
  }

  /** Steps the simulation up to `now`. Returns one events message per step that changed anything. */
  advance(now: number): EventsMsg[] {
    const out: EventsMsg[] = [];
    let steps = 0;
    while (!this.state.finished && this.tickTime(this.state.tick + 1) <= now) {
      if (steps++ === MAX_CATCH_UP_STEPS) {
        // Too far behind (e.g. a GC pause): slip the clock instead of spiralling.
        this.startTime = now - this.state.tick * this.cfg.dt * 1000;
        break;
      }
      const prev = this.state;
      const inputs = botInputs(prev, this.cfg, this.nextInputs());
      this.state = step(prev, inputs, this.cfg);
      const events = this.diff(prev, this.state);
      if (events.added.length || events.removed.length || events.deaths.length) out.push(events);
    }
    return out;
  }

  private diff(prev: GameState, next: GameState): EventsMsg {
    const nextIds = new Set<number>();
    for (const p of next.pellets) nextIds.add(p.id);
    const removed: number[] = [];
    for (const p of prev.pellets) if (!nextIds.has(p.id)) removed.push(p.id);
    const added = next.pellets.filter((p) => p.id >= prev.nextPelletId);
    const deaths: DeathSnap[] = [];
    for (const e of next.events) if (e.type === 'death') deaths.push({ snakeId: e.snakeId, killerId: e.killerId, cause: e.cause });
    return { tick: next.tick, serverTime: this.tickTime(next.tick), reset: false, added, removed, deaths };
  }

  /** Every current pellet, telling the client to drop what it had. Sent on join and match start. */
  fullPellets(): EventsMsg {
    const s = this.state;
    return { tick: s.tick, serverTime: this.tickTime(s.tick), reset: true, added: s.pellets.map((p) => ({ ...p })), removed: [], deaths: [] };
  }

  /**
   * Snapshot for one client. Bodies are included for everyone when `full` is set,
   * otherwise each snake gets a keyframe every KEYFRAME_TICKS (staggered by id).
   */
  snapshot(forSnakeId: number | null, full: boolean): SnapshotMsg {
    const s = this.state;
    return {
      tick: s.tick,
      serverTime: this.tickTime(s.tick),
      lastSeq: this.lastSeqFor(forSnakeId),
      arenaRadius: s.arena.radius,
      arenaTargetRadius: s.arena.targetRadius,
      snakes: s.snakes
        .filter((sn) => sn.alive)
        .map((sn) => ({
          id: sn.id,
          x: sn.head.x,
          y: sn.head.y,
          angle: sn.angle,
          mass: sn.mass,
          boosting: sn.boosting,
          body: full || (s.tick + sn.id * 7) % KEYFRAME_TICKS === 0 ? sn.segments : null,
        })),
    };
  }
}
