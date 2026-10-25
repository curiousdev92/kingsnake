import { randomUUID } from 'node:crypto';

/**
 * Proves a room was created by the queue. Ranked rooms refuse to be created
 * without it, so players can't skip the queue to pick their opponent.
 */
export const QUEUE_SECRET = randomUUID();

/** One player waiting in the ranked queue. */
export interface Waiting {
  id: string;
  rating: number;
  /** When they joined the queue (ms, any clock shared by all entries). */
  since: number;
}

/**
 * How far apart two ratings may be: starts tight and widens the longer someone waits,
 * until anyone will do. Fair matches when the queue is busy, no endless wait when it isn't.
 */
export const window = {
  startPoints: 100,
  pointsPerSecond: 25,
  /** After this long, match with anyone. */
  anyoneAfterMs: 30_000,
};

export function ratingWindow(waitedMs: number): number {
  if (waitedMs >= window.anyoneAfterMs) return Infinity;
  return window.startPoints + (window.pointsPerSecond * waitedMs) / 1000;
}

/**
 * Pairs the queue. Longest-waiting players pick first, each taking the closest rating
 * within the wider of the two players' windows (the patient player's window lets a
 * newcomer in). Pure: returns the pairs; callers remove them from the queue.
 */
export function pairPlayers(queue: readonly Waiting[], now: number): [Waiting, Waiting][] {
  const free = [...queue].sort((a, b) => a.since - b.since);
  const pairs: [Waiting, Waiting][] = [];
  const taken = new Set<string>();
  for (const p of free) {
    if (taken.has(p.id)) continue;
    let best: Waiting | null = null;
    for (const q of free) {
      if (q.id === p.id || taken.has(q.id)) continue;
      const gap = Math.abs(p.rating - q.rating);
      const allowed = Math.max(ratingWindow(now - p.since), ratingWindow(now - q.since));
      if (gap <= allowed && (!best || gap < Math.abs(p.rating - best.rating))) best = q;
    }
    if (best) {
      taken.add(p.id).add(best.id);
      pairs.push([p, best]);
    }
  }
  return pairs;
}
