/**
 * Picks the interpolation delay from how late snapshots actually arrive.
 *
 * Render time is `serverNow - delay`. For interpolation (not extrapolation) the
 * snapshot after render time must already be here, so the delay has to cover the
 * one-way transit plus jitter, plus one snapshot interval to ride out a single loss.
 * We take a high percentile of observed transit over a sliding window and slew
 * toward it slowly, so render time never visibly jumps.
 */
export class AdaptiveDelay {
  private transit: number[] = [];
  private current: number;

  constructor(
    readonly snapshotIntervalMs = 1000 / 30,
    readonly minMs = 50,
    readonly maxMs = 400,
    private readonly window = 90,
    private readonly percentile = 0.95,
    /** Fraction of the gap to the target closed per sample (~1 s to settle at 30 Hz). */
    private readonly slew = 0.08,
  ) {
    this.current = 100;
  }

  get delayMs(): number {
    return this.current;
  }

  get targetMs(): number {
    if (this.transit.length === 0) return this.current;
    const sorted = [...this.transit].sort((a, b) => a - b);
    const p = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * this.percentile))]!;
    return Math.max(this.minMs, Math.min(this.maxMs, p + this.snapshotIntervalMs));
  }

  /** `transitMs` = estimated server time at arrival minus the snapshot's server time. */
  addSample(transitMs: number): void {
    this.transit.push(transitMs);
    if (this.transit.length > this.window) this.transit.shift();
    this.current += (this.targetMs - this.current) * this.slew;
  }

  reset(): void {
    this.transit = [];
  }
}
