import {
  bodyLengthForMass,
  radiusForMass,
  sampleSegments,
  trimPath,
  type Pellet,
  type SimConfig,
  type Vec2,
} from '@snake/game-core';
import type { DeathSnap, EventsMsg, SnapshotMsg } from '@snake/protocol';
import { SnapshotBuffer, type Sampled } from './SnapshotBuffer';

/** A snake as seen by the client at one snapshot. Shape-compatible with game-core's Snake for rendering. */
export interface ViewSnake {
  id: number;
  alive: true;
  head: Vec2;
  angle: number;
  radius: number;
  mass: number;
  boosting: boolean;
  segments: Vec2[];
}

export interface WorldView {
  tick: number;
  serverTime: number;
  lastSeq: number;
  snakes: ViewSnake[];
  arena: { center: Vec2; radius: number; targetRadius: number };
}

export interface WorldSample extends Sampled<WorldView> {
  pellets: readonly Pellet[];
}

/**
 * Client-side mirror of the server world built from snapshots and events.
 * Bodies are rebuilt by following each head's path (with periodic full keyframes),
 * and pellet/death events are applied when render time reaches them, so they line
 * up with the interpolated snakes.
 */
export class RemoteWorld {
  readonly buffer: SnapshotBuffer<WorldView>;
  private paths = new Map<number, Vec2[]>();
  private pellets = new Map<number, Pellet>();
  private pelletList: Pellet[] = [];
  private pelletsDirty = false;
  private pending: EventsMsg[] = [];

  constructor(
    public cfg: SimConfig,
    maxExtrapolationMs = 50,
  ) {
    this.buffer = new SnapshotBuffer<WorldView>(maxExtrapolationMs);
  }

  reset(): void {
    this.buffer.clear();
    this.paths.clear();
    this.pellets.clear();
    this.pending = [];
    this.pelletsDirty = true;
  }

  /** Returns false for a stale or reordered snapshot, which is ignored. */
  applySnapshot(msg: SnapshotMsg): boolean {
    const latest = this.buffer.latest;
    if (latest && msg.serverTime <= latest.serverTime) return false;

    const cfg = this.cfg;
    const seen = new Set<number>();
    const snakes: ViewSnake[] = [];
    for (const s of msg.snakes) {
      seen.add(s.id);
      const head = { x: s.x, y: s.y };
      let path = this.paths.get(s.id);
      if (s.body && s.body.length > 0) {
        // Keyframe: replace the reconstructed path with the server's body (oldest first).
        path = s.body.slice().reverse();
      } else if (!path) {
        path = [head];
      } else {
        path.push(head);
      }
      this.paths.set(s.id, path);
      const length = bodyLengthForMass(s.mass, cfg);
      trimPath(path, length + cfg.segmentSpacing);
      snakes.push({
        id: s.id,
        alive: true,
        head,
        angle: s.angle,
        mass: s.mass,
        boosting: s.boosting,
        radius: radiusForMass(s.mass, cfg),
        segments: sampleSegments(path, length, cfg.segmentSpacing),
      });
    }
    for (const id of this.paths.keys()) if (!seen.has(id)) this.paths.delete(id);

    this.buffer.push({
      tick: msg.tick,
      serverTime: msg.serverTime,
      lastSeq: msg.lastSeq,
      snakes,
      arena: { center: { x: 0, y: 0 }, radius: msg.arenaRadius, targetRadius: msg.arenaTargetRadius },
    });
    return true;
  }

  queueEvents(msg: EventsMsg): void {
    this.pending.push(msg);
  }

  /** Applies queued events up to `renderTime`. Returns the deaths applied, for effects and HUD. */
  applyEventsUntil(renderTime: number): DeathSnap[] {
    const deaths: DeathSnap[] = [];
    while (this.pending.length > 0 && this.pending[0]!.serverTime <= renderTime) {
      const e = this.pending.shift()!;
      if (e.reset) this.pellets.clear();
      for (const p of e.added) this.pellets.set(p.id, { id: p.id, x: p.x, y: p.y, value: p.value });
      for (const id of e.removed) this.pellets.delete(id);
      deaths.push(...e.deaths);
      this.pelletsDirty = true;
    }
    return deaths;
  }

  sample(renderTime: number): WorldSample | null {
    const s = this.buffer.sample(renderTime);
    if (!s) return null;
    if (this.pelletsDirty) {
      this.pelletList = [...this.pellets.values()];
      this.pelletsDirty = false;
    }
    return { ...s, pellets: this.pelletList };
  }

  /** Copy of a snake's reconstructed head path at the newest snapshot (oldest first). */
  pathOf(id: number): Vec2[] | undefined {
    return this.paths.get(id)?.map((p) => ({ x: p.x, y: p.y }));
  }

  get pelletCount(): number {
    return this.pellets.size;
  }
}
