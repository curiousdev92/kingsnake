/** Ranked duel rating (Elo). Every account starts here. */
export const START_RATING = 1000;
/** Rating can't drop below this, so new players can't be farmed into the ground. */
export const MIN_RATING = 100;
const K = 32;

/** Chance that a player rated `a` beats one rated `b`. */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/**
 * Rating change for the player rated `a` after a duel against `b`; `score` is 1 for
 * a win, 0 for a loss, 0.5 for a draw. The opponent's change is the negative (before
 * the floor), so ratings are zero-sum.
 */
export function ratingDelta(a: number, b: number, score: number): number {
  return Math.round(K * (score - expectedScore(a, b)));
}

export function applyRating(rating: number, delta: number): number {
  return Math.max(MIN_RATING, rating + delta);
}
