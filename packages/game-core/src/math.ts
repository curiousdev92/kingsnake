export interface Vec2 {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

/** Wraps an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = a % TAU;
  if (a <= -Math.PI) a += TAU;
  else if (a > Math.PI) a -= TAU;
  return a;
}

/** Moves `from` toward `to` along the shortest arc by at most `maxDelta` radians. */
export function turnToward(from: number, to: number, maxDelta: number): number {
  const diff = wrapAngle(to - from);
  if (Math.abs(diff) <= maxDelta) return wrapAngle(to);
  return wrapAngle(from + Math.sign(diff) * maxDelta);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Small seeded PRNG (mulberry32). Returns the next float in [0, 1) and the new seed. */
export function nextRandom(seed: number): [number, number] {
  let t = (seed + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}
