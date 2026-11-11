import {
  radiusForMass,
  sampleSegments,
  bodyLengthForMass,
  step,
  type GameState,
  type Input,
  type SimConfig,
  type Snake,
  type Vec2,
} from '@snake/game-core';
import type { SnakeSnap } from '@snake/protocol';
import type { ViewSnake } from './RemoteWorld';

/** History of unacknowledged inputs kept for replay (~4 s at 30 Hz). */
const MAX_PENDING = 120;

export interface ReconcileBase {
  snake: SnakeSnap;
  /** The snake's head path at the snapshot (oldest first), e.g. from RemoteWorld.pathOf. */
  path: Vec2[];
  arenaRadius: number;
  /** Last input seq the server had applied at the snapshot. */
  lastSeq: number;
}

/**
 * Client-side prediction for the local snake. Each client tick runs game-core on a
 * one-snake world with the input just sent. When a snapshot arrives, the predictor
 * rebases on the server's state and replays the inputs the server has not applied
 * yet. The visual jump between the old and new prediction is kept as an offset that
 * decays over `smoothingMs`; jumps above `snapDistance` are applied at once.
 *
 * Only movement, turning and boost are predicted. Eating, collisions and death are
 * the server's call and arrive through snapshots and events.
 */
export class Predictor {
  smoothingMs = 100;
  snapDistance = 60;

  private pending: { seq: number; input: Input }[] = [];
  private lastAcked: Input | null = null;
  private prev: GameState | null = null;
  private cur: GameState | null = null;
  private offset: Vec2 = { x: 0, y: 0 };
  private cfg: SimConfig;

  /** Size of the most recent correction, in world units. */
  lastError = 0;
  corrections = 0;
  snaps = 0;

  constructor(cfg: SimConfig) {
    this.cfg = Predictor.localConfig(cfg);
  }

  /** The local world has no pellets to spawn and takes the arena size from the server. */
  private static localConfig(cfg: SimConfig): SimConfig {
    return { ...cfg, pelletDensity: 0, shrinkSchedule: [] };
  }

  setConfig(cfg: SimConfig): void {
    this.cfg = Predictor.localConfig(cfg);
  }

  get active(): boolean {
    return this.cur !== null;
  }

  reset(): void {
    this.pending = [];
    this.lastAcked = null;
    this.prev = this.cur = null;
    this.offset = { x: 0, y: 0 };
  }

  /** Records an input that was just sent and advances the prediction one tick. */
  applyInput(seq: number, input: Input): void {
    this.pending.push({ seq, input: { ...input } });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    if (!this.cur) return;
    this.prev = this.cur;
    this.cur = this.stepOnce(this.cur, input);
  }

  reconcile(base: ReconcileBase): void {
    // Drop what the server has applied; remember the newest of those as the steering it holds.
    while (this.pending.length > 0 && this.pending[0]!.seq <= base.lastSeq) this.lastAcked = this.pending.shift()!.input;

    let state = this.baseState(base);
    let before = state;
    for (const p of this.pending) {
      before = state;
      state = this.stepOnce(state, p.input);
    }

    const old = this.cur?.snakes[0];
    const next = state.snakes[0]!;
    if (old?.alive && next.alive) {
      const ex = old.head.x - next.head.x;
      const ey = old.head.y - next.head.y;
      this.lastError = Math.hypot(ex, ey);
      if (this.lastError > this.snapDistance) {
        this.offset = { x: 0, y: 0 };
        this.snaps++;
      } else {
        // Keep showing where we were, then ease toward the corrected path.
        this.offset = { x: this.offset.x + ex, y: this.offset.y + ey };
      }
      if (this.lastError > 0.01) this.corrections++;
    }
    this.prev = before;
    this.cur = state;
  }

  /** Eases the correction offset toward zero. Call once per rendered frame. */
  decay(dtMs: number): void {
    const k = Math.exp(-dtMs / Math.max(1, this.smoothingMs / 3));
    this.offset = { x: this.offset.x * k, y: this.offset.y * k };
  }

  /** The predicted snake between the last two client ticks, with smoothing applied. */
  view(alpha: number): ViewSnake | null {
    const a = this.prev?.snakes[0];
    const b = this.cur?.snakes[0];
    if (!a || !b || !b.alive) return null;
    const t = Math.max(0, Math.min(1, alpha));
    const ox = this.offset.x;
    const oy = this.offset.y;
    const lerp = (p: Vec2, q: Vec2): Vec2 => ({ x: p.x + (q.x - p.x) * t + ox, y: p.y + (q.y - p.y) * t + oy });
    const da = Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle));
    return {
      id: b.id,
      alive: true,
      head: lerp(a.head, b.head),
      angle: a.angle + da * t,
      radius: a.radius + (b.radius - a.radius) * t,
      mass: b.mass,
      boosting: b.boosting,
      segments: b.segments.map((q, k) => lerp(a.segments[k] ?? q, q)),
    };
  }

  private stepOnce(state: GameState, input: Input): GameState {
    const next = step(state, new Map([[state.snakes[0]!.id, input]]), this.cfg);
    next.pellets = []; // boost drops are the server's business
    return next;
  }

  private baseState(base: ReconcileBase): GameState {
    const s = base.snake;
    const cfg = this.cfg;
    const path = base.path.map((p) => ({ x: p.x, y: p.y }));
    const length = bodyLengthForMass(s.mass, cfg);
    const snake: Snake = {
      id: s.id,
      name: '',
      isBot: false,
      head: { x: s.x, y: s.y },
      angle: s.angle,
      targetAngle: this.lastAcked?.targetAngle ?? s.angle,
      speed: cfg.baseSpeed,
      boosting: s.boosting,
      mass: s.mass,
      path,
      segments: sampleSegments(path, length, cfg.segmentSpacing),
      radius: radiusForMass(s.mass, cfg),
      alive: true,
      boostDebt: 0,
    };
    const r = base.arenaRadius;
    return {
      tick: 0,
      snakes: [snake],
      pellets: [],
      arena: { center: { x: 0, y: 0 }, radius: r, startRadius: r, targetRadius: r },
      nextPelletId: 1,
      seed: 1,
      finished: false,
      winnerId: null,
      events: [],
    };
  }
}
