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

/**
 * One authoritative match: owns the game-core state, latest inputs per snake,
 * and turns state changes into protocol messages. Knows nothing about Colyseus.
 */
export class Match {
  state: GameState;
  private startTime: number;
  private readonly inputs = new Map<number, Input>();
  private readonly lastSeq = new Map<number, number>();

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

  /** Stores a player's latest input. Older or duplicate sequence numbers are ignored. */
  setInput(snakeId: number, msg: InputMsg): void {
    if (msg.seq <= (this.lastSeq.get(snakeId) ?? -1)) return;
    this.lastSeq.set(snakeId, msg.seq);
    this.inputs.set(snakeId, { targetAngle: msg.targetAngle, boost: msg.boost });
  }

  lastSeqFor(snakeId: number | null): number {
    return snakeId === null ? 0 : (this.lastSeq.get(snakeId) ?? 0);
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
      const inputs = botInputs(prev, this.cfg, new Map(this.inputs));
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
