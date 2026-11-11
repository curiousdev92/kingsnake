/**
 * Uniform grid for broad-phase circle queries. Rebuilt every tick: clear() then insert().
 * Stores numeric indices into caller-owned arrays, so it allocates nothing per query.
 */
export class SpatialHash {
  private readonly cells = new Map<number, number[]>();
  private readonly pool: number[][] = [];

  constructor(readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    // Packs two signed 16-bit cell coords into one number key.
    return ((cx + 32768) << 16) | (cy + 32768);
  }

  clear(): void {
    for (const bucket of this.cells.values()) {
      bucket.length = 0;
      this.pool.push(bucket);
    }
    this.cells.clear();
  }

  insert(item: number, x: number, y: number, r: number): void {
    const s = this.cellSize;
    const x0 = Math.floor((x - r) / s);
    const x1 = Math.floor((x + r) / s);
    const y0 = Math.floor((y - r) / s);
    const y1 = Math.floor((y + r) / s);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy);
        let bucket = this.cells.get(k);
        if (!bucket) {
          bucket = this.pool.pop() ?? [];
          this.cells.set(k, bucket);
        }
        bucket.push(item);
      }
    }
  }

  /** Calls `visit` for every item whose cells overlap the query circle. Items may repeat. */
  query(x: number, y: number, r: number, visit: (item: number) => void): void {
    const s = this.cellSize;
    const x0 = Math.floor((x - r) / s);
    const x1 = Math.floor((x + r) / s);
    const y0 = Math.floor((y - r) / s);
    const y1 = Math.floor((y + r) / s);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (bucket) for (const item of bucket) visit(item);
      }
    }
  }
}
