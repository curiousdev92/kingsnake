export interface Timed {
  serverTime: number;
}

export interface Sampled<T> {
  a: T;
  b: T;
  /** Progress from `a` to `b`. May exceed 1 while extrapolating. */
  t: number;
  /** True when render time is past the newest snapshot. */
  extrapolating: boolean;
}

/** Time-ordered snapshot history, sampled at a render time in the past. */
export class SnapshotBuffer<T extends Timed> {
  private items: T[] = [];

  constructor(
    /** How far past the newest snapshot to extrapolate before freezing. */
    private readonly maxExtrapolationMs = 50,
    private readonly capacity = 64,
  ) {}

  get size(): number {
    return this.items.length;
  }

  get latest(): T | undefined {
    return this.items[this.items.length - 1];
  }

  clear(): void {
    this.items = [];
  }

  /** Adds a snapshot. Out-of-order (older than the newest) snapshots are dropped. */
  push(item: T): boolean {
    const last = this.latest;
    if (last && item.serverTime <= last.serverTime) return false;
    this.items.push(item);
    if (this.items.length > this.capacity) this.items.shift();
    return true;
  }

  sample(renderTime: number): Sampled<T> | null {
    const items = this.items;
    if (items.length === 0) return null;
    if (items.length === 1 || renderTime <= items[0]!.serverTime) {
      const only = items[0]!;
      return { a: only, b: only, t: 0, extrapolating: false };
    }
    // Drop everything older than the pair surrounding renderTime.
    while (items.length > 2 && items[1]!.serverTime <= renderTime) items.shift();
    const a = items[0]!;
    const b = items[1]!;
    const span = b.serverTime - a.serverTime;
    if (renderTime <= b.serverTime) {
      return { a, b, t: span > 0 ? (renderTime - a.serverTime) / span : 1, extrapolating: false };
    }
    const over = Math.min(renderTime - b.serverTime, this.maxExtrapolationMs);
    return { a, b, t: span > 0 ? 1 + over / span : 1, extrapolating: true };
  }
}
